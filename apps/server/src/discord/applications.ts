import type { FastifyBaseLogger } from 'fastify';
import { AppError } from '../lib/errors.js';
import type { Hub } from '../hub/index.js';
import { mm } from '../hub/texts.js';
import {
  mayDecideMornicraft,
  type Application,
  type ApplicationService,
} from '../mornicraft/applications.js';
import { bt, type BotLang } from './texts.js';

/**
 * Bewerbungen in Discord: /bewerben (oder der Knopf im Hilfe-Kanal) öffnet ein Formular; neue Bewerbungen – auch
 * die von der Webseite – landen in #bewerbungen mit Knöpfen „Annehmen“ und „Ablehnen“. Entscheiden darf, wer sein
 * Minecraft-Konto verbunden hat und im Team ist (Recht „kicken“). Die Person bekommt das Ergebnis als
 * Direktnachricht (und im Spiel, wenn sie gerade online ist).
 */

const MODAL = 9;
const REPLY = 4;
const EPHEMERAL = 64;
const ROW = 1;
const BUTTON = 2;
const TEXT_INPUT = 4;
const SHORT = 1;
const PARAGRAPH = 2;
const BUTTON_SUCCESS = 3;
const BUTTON_DANGER = 4;
const NAME_MIN = 3;
const NAME_MAX = 17;
const ABOUT_MIN = 20;
const ANSWER_MAX = 1000;
const AGE_MAX = 3;
const EMERALD = 0x1fa463;
const RED = 0xdc2626;
const AMBER = 0xf59e0b;
const FIELD_MAX = 1024;

export const APPLY_BUTTON = 'mm:apply';
export const APPLY_FORM = 'mm:apply-form';
const ACCEPT = 'mm:app-accept:';
const REJECT = 'mm:app-reject:';

type Raw = Record<string, unknown>;
type Rest = <T>(method: string, path: string, body?: unknown, reason?: string) => Promise<T>;

export interface ApplicationBotDeps {
  readonly rest: Rest;
  readonly channel: (key: string) => string | null;
  readonly applications: ApplicationService;
  readonly hub: Hub;
  readonly domain: string;
  readonly log: FastifyBaseLogger;
}

export interface ApplicationBot {
  /** /bewerben oder Knopf: Formular öffnen (oder sagen, warum nicht). */
  readonly open: (d: Raw, lang: BotLang) => Promise<void>;
  /** Formular abgeschickt. */
  readonly submit: (d: Raw, lang: BotLang) => Promise<void>;
  /** Knopf „Annehmen“/„Ablehnen“ in #bewerbungen; false = kein Bewerbungs-Knopf. */
  readonly button: (d: Raw, lang: BotLang, customId: string) => Promise<boolean>;
  readonly posted: (id: number) => Promise<void>;
  readonly decided: (id: number) => Promise<void>;
}

const cut = (text: string): string => (text.length > FIELD_MAX ? `${text.slice(0, FIELD_MAX - 1)}…` : text);

export function createApplicationBot(deps: ApplicationBotDeps): ApplicationBot {
  const { rest, applications } = deps;
  const callback = (d: Raw, body: unknown): Promise<unknown> =>
    rest('POST', `/interactions/${String(d['id'])}/${String(d['token'])}/callback`, body);
  const say = (d: Raw, content: string): Promise<unknown> =>
    callback(d, { type: REPLY, data: { flags: EPHEMERAL, content } });
  const userOf = (d: Raw): { id: string; name: string } => {
    const user = ((d['member'] as { user?: unknown } | undefined)?.user ?? d['user']) as {
      id: string;
      username: string;
    };
    return { id: user.id, name: user.username };
  };
  const input = (id: string, label: string, style: number, min: number, max: number, required: boolean) => ({
    type: ROW,
    components: [
      { type: TEXT_INPUT, custom_id: id, label, style, min_length: min, max_length: max, required },
    ],
  });

  const embedOf = (a: Application) => {
    const colour = { pending: AMBER, accepted: EMERALD, rejected: RED }[a.status];
    const decided =
      a.status === 'pending'
        ? []
        : [
            {
              name: a.status === 'accepted' ? '✅ Angenommen' : '❌ Abgelehnt',
              value: cut(`von ${a.decidedBy ?? '?'}${a.note ? ` – ${a.note}` : ''}`),
            },
          ];
    return {
      title: `📝 Bewerbung #${a.id}: ${a.minecraftName}`,
      color: colour,
      fields: [
        { name: 'Discord', value: a.discordId ? `<@${a.discordId}>` : '—', inline: true },
        { name: 'Über', value: a.via === 'website' ? 'Webseite' : 'Discord', inline: true },
        ...(a.answers['age'] ? [{ name: 'Alter', value: cut(a.answers['age']), inline: true }] : []),
        { name: 'Über sich', value: cut(a.answers['about'] ?? '—') },
        { name: 'Warum MorniCraft?', value: cut(a.answers['why'] ?? '—') },
        ...decided,
      ],
      timestamp: a.createdAt,
    };
  };
  const buttons = (a: Application) =>
    a.status === 'pending'
      ? [
          {
            type: ROW,
            components: [
              { type: BUTTON, style: BUTTON_SUCCESS, label: 'Annehmen', custom_id: `${ACCEPT}${a.id}` },
              { type: BUTTON, style: BUTTON_DANGER, label: 'Ablehnen', custom_id: `${REJECT}${a.id}` },
            ],
          },
        ]
      : [];

  const dm = async (discordId: string, content: string): Promise<void> => {
    const channel = await rest<{ id: string }>('POST', '/users/@me/channels', { recipient_id: discordId });
    await rest('POST', `/channels/${channel.id}/messages`, { content });
  };

  return {
    open: async (d, lang) => {
      if (!applications.open()) {
        await say(d, bt(lang, 'applyClosed'));
        return;
      }
      const last = applications.latestOf(userOf(d).id);
      if (last?.status === 'pending') {
        await say(d, bt(lang, 'applyPending', { name: last.minecraftName }));
        return;
      }
      await callback(d, {
        type: MODAL,
        data: {
          custom_id: APPLY_FORM,
          title: bt(lang, 'applyTitle'),
          components: [
            input('minecraft', bt(lang, 'applyName'), SHORT, NAME_MIN, NAME_MAX, true),
            input('about', bt(lang, 'applyAbout'), PARAGRAPH, ABOUT_MIN, ANSWER_MAX, true),
            input('why', bt(lang, 'applyWhy'), PARAGRAPH, 1, ANSWER_MAX, true),
            input('age', bt(lang, 'applyAge'), SHORT, 0, AGE_MAX, false),
          ],
        },
      });
    },
    submit: async (d, lang) => {
      const rows = ((d['data'] as { components?: unknown } | undefined)?.components ?? []) as Array<{
        components: Array<{ custom_id: string; value: string }>;
      }>;
      const value = (id: string): string =>
        rows.flatMap((r) => r.components).find((c) => c.custom_id === id)?.value ?? '';
      const user = userOf(d);
      try {
        const a = applications.apply({
          minecraftName: value('minecraft'),
          answers: { about: value('about'), why: value('why'), age: value('age') },
          discordId: user.id,
          discordName: user.name,
          via: 'discord',
        });
        await say(d, bt(lang, 'applyThanks', { name: a.minecraftName }));
      } catch (err) {
        const code = err instanceof AppError ? err.code : 'application_invalid';
        await say(d, bt(lang, 'applyFailed', { reason: code }));
      }
    },
    button: async (d, lang, customId) => {
      const accept = customId.startsWith(ACCEPT);
      if (!accept && !customId.startsWith(REJECT)) return false;
      const id = Number(customId.slice((accept ? ACCEPT : REJECT).length));
      const user = userOf(d);
      const player = deps.hub.players.byDiscord(user.id);
      if (!player || !mayDecideMornicraft(deps.hub.players.roleOf(player.uuid))) {
        await say(d, bt(lang, 'applyNoRight'));
        return true;
      }
      try {
        applications.decide(id, accept, player.name, '');
        await say(d, bt(lang, accept ? 'applyAccepted' : 'applyRejected', { id }));
      } catch (err) {
        await say(d, bt(lang, 'applyFailed', { reason: err instanceof AppError ? err.code : 'error' }));
      }
      return true;
    },
    posted: async (id) => {
      const channel = deps.channel('applications');
      const a = applications.get(id);
      if (!channel || !a) return;
      const msg = await rest<{ id: string }>('POST', `/channels/${channel}/messages`, {
        embeds: [embedOf(a)],
        components: buttons(a),
        allowed_mentions: { parse: [] },
      });
      applications.setDiscordMessage(id, msg.id);
    },
    decided: async (id) => {
      const a = applications.get(id);
      if (!a) return;
      const channel = deps.channel('applications');
      if (channel && a.discordMessageId)
        await rest('PATCH', `/channels/${channel}/messages/${a.discordMessageId}`, {
          embeds: [embedOf(a)],
          components: [],
        });
      const accepted = a.status === 'accepted';
      const text = accepted
        ? applications.acceptMessage() ||
          bt('de', 'applyWelcome', { name: a.minecraftName, domain: deps.domain })
        : bt('de', 'applyNo', { note: a.note ? `\n> ${a.note}` : '' });
      // Online im Spiel? Dann dort auch Bescheid.
      const online = deps.hub.presence.byName(a.minecraftName);
      if (online && accepted) deps.hub.tell(online.uuid, `<green>${mm(text)}`);
      if (a.discordId)
        await dm(a.discordId, text).catch((err: unknown) =>
          deps.log.warn({ err }, 'Discord: Ergebnis der Bewerbung nicht zugestellt'),
        );
    },
  };
}
