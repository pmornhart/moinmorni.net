import type { FastifyBaseLogger } from 'fastify';
import type { PositionView, TeamApplicationService } from '../applications/team.js';
import type { Hub } from '../hub/index.js';
import { mm } from '../hub/texts.js';
import { AppError } from '../lib/errors.js';
import type { Application } from '../mornicraft/applications.js';
import {
  AMBER,
  BUTTON,
  cut,
  EMERALD,
  positionLabel,
  RED,
  ROW,
  STRING_SELECT,
  STYLE_DANGER,
  STYLE_LINK,
  STYLE_PRIMARY,
  STYLE_SUCCESS,
  TEXT_INPUT,
  CUSTOM_IDS,
} from './messages.js';
import { bt, type BotLang } from './texts.js';

/**
 * Team-Bewerbungen in Discord: /bewerben (oder ein Knopf in #bewerbungen) → Auswahl der Stelle → Formular. Discord
 * zeigt höchstens 5 Felder pro Fenster, darum kommen mehr Fragen in Schritten („Weiter zu Teil 2“). Fertige
 * Bewerbungen landen im Bewerbungs-Eingang des Teams mit „Annehmen“, „Ablehnen“ und „Im Panel ansehen“. Annehmen
 * oder ablehnen darf nur, wer die Rolle auch vergeben darf (verbundenes Minecraft-Konto); dabei kann eine Nachricht an
 * die Person mit. Das Ergebnis geht per Direktnachricht (und bei Zusage auch im Spiel) an die Person.
 */

const MODAL = 9;
const REPLY = 4;
const EPHEMERAL = 64;
const SHORT = 1;
const PARAGRAPH = 2;
const PER_STEP = 5;
const LABEL_MAX = 45;
const PLACEHOLDER_MAX = 100;
const ANSWER_MAX = 1000;
const NOTE_MAX = 300;
const NAME_MIN = 3;
const NAME_MAX = 17;
const DRAFT_MS = 1_800_000;
const DAY_MS = 86_400_000;
const SECOND_MS = 1000;
const OPTION_DESCRIPTION_MAX = 100;
/** Titel und Feldnamen eines Embeds: höchstens so viele Zeichen. */
const EMBED_TITLE_MAX = 256;
/** Teile zählen für Menschen ab 1. */
const shown = (index: number): number => index + 1;
const MORNICRAFT = 'mornicraft';
const NAME_FIELD = 'minecraft';

export const TEAM_IDS = {
  form: 'mm:team-form:',
  next: 'mm:team-next:',
  accept: 'mm:team-accept:',
  reject: 'mm:team-reject:',
  decide: 'mm:team-decide:',
} as const;

type Raw = Record<string, unknown>;
type Rest = <T>(method: string, path: string, body?: unknown, reason?: string) => Promise<T>;

interface Field {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly style: number;
  readonly min: number;
  readonly max: number;
}

interface Draft {
  readonly answers: Record<string, string>;
  readonly until: number;
}

export interface TeamBotDeps {
  readonly rest: Rest;
  readonly channel: (key: string) => string | null;
  readonly team: TeamApplicationService;
  readonly hub: Pick<Hub, 'players' | 'presence' | 'tell'>;
  /** Nachricht im Bewerbungs-Eingang merken (wird nach der Entscheidung angepasst). */
  readonly onPosted: (id: number, messageId: string) => void;
  /** MorniCraft-Formular öffnen (aus discord/applications.ts); null = keine MorniCraft-Bewerbungen. */
  readonly mornicraft: ((d: Raw, lang: BotLang) => Promise<void>) | null;
  readonly mornicraftOpen: () => boolean;
  readonly domain: string;
  readonly log: FastifyBaseLogger;
  readonly now?: () => number;
}

export interface TeamBot {
  /** /bewerben: Auswahl zeigen. */
  readonly pick: (d: Raw, lang: BotLang) => Promise<void>;
  /** Knöpfe und Auswahl; false = gehört nicht hierher. */
  readonly component: (d: Raw, lang: BotLang, customId: string) => Promise<boolean>;
  /** Abgeschickte Fenster; false = gehört nicht hierher. */
  readonly modal: (d: Raw, lang: BotLang, customId: string) => Promise<boolean>;
  readonly posted: (app: Application) => Promise<void>;
  readonly decided: (app: Application, account: boolean) => Promise<void>;
}

const userOf = (d: Raw): { id: string; name: string } => {
  const user = ((d['member'] as { user?: unknown } | undefined)?.user ?? d['user']) as {
    id: string;
    username: string;
  };
  return { id: user.id, name: user.username };
};

const valuesOf = (d: Raw): Record<string, string> => {
  const rows = ((d['data'] as { components?: unknown } | undefined)?.components ?? []) as Array<{
    components: Array<{ custom_id: string; value: string }>;
  }>;
  return Object.fromEntries(rows.flatMap((r) => r.components).map((c) => [c.custom_id, c.value ?? '']));
};

const shorten = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

export function createTeamBot(deps: TeamBotDeps): TeamBot {
  const { rest, team } = deps;
  const now = deps.now ?? Date.now;
  const drafts = new Map<string, Draft>();
  const callback = (d: Raw, body: unknown): Promise<unknown> =>
    rest('POST', `/interactions/${String(d['id'])}/${String(d['token'])}/callback`, body);
  const say = (d: Raw, content: string, components: unknown[] = []): Promise<unknown> =>
    callback(d, {
      type: REPLY,
      data: { flags: EPHEMERAL, content, components, allowed_mentions: { parse: [] } },
    });
  const reason = (err: unknown): string => (err instanceof AppError ? err.code : 'error');

  /** Felder einer Stelle in der Sprache der Person – vorneweg der Minecraft-Name, wenn nicht verbunden. */
  const fieldsOf = (p: PositionView, lang: BotLang, needName: boolean): Field[] => [
    ...(needName
      ? [
          {
            id: NAME_FIELD,
            label: bt(lang, 'applyName'),
            placeholder: bt(lang, 'applyName'),
            style: SHORT,
            min: NAME_MIN,
            max: NAME_MAX,
          },
        ]
      : []),
    ...(lang === 'en' ? p.questions.en : p.questions.de).map((q, i) => ({
      id: `q${i}`,
      label: shorten(q, LABEL_MAX),
      placeholder: shorten(q, PLACEHOLDER_MAX),
      style: PARAGRAPH,
      min: 1,
      max: ANSWER_MAX,
    })),
  ];
  const stepsOf = (fields: readonly Field[]): number => Math.max(1, Math.ceil(fields.length / PER_STEP));
  const draftKey = (user: string, position: string): string => `${user}:${position}`;

  /** Bevor ein Fenster aufgeht: darf die Person sich bewerben? Sonst freundlich sagen, warum nicht. */
  const refusal = (lang: BotLang, discordId: string, p: PositionView): string | null => {
    const check = team.eligibility(discordId, p.id);
    if (check.ok) return null;
    const texts: Readonly<Record<typeof check.code, () => string>> = {
      team_apply_closed: () => bt(lang, 'teamClosed', { position: positionLabel(p, lang) }),
      team_apply_pending: () => bt(lang, 'teamPending'),
      team_apply_cooldown: () =>
        bt(lang, 'teamCooldown', { ts: Math.floor(Date.parse(check.until ?? '') / SECOND_MS) }),
      team_apply_link_required: () => bt(lang, 'teamNeedLink'),
    };
    return texts[check.code]();
  };

  const openStep = async (d: Raw, lang: BotLang, positionId: string, stepIndex: number): Promise<void> => {
    const p = team.position(positionId);
    const user = userOf(d);
    if (!p || !p.open) {
      await say(d, bt(lang, 'teamClosed', { position: positionId }));
      return;
    }
    const no = refusal(lang, user.id, p);
    if (no) {
      await say(d, no);
      return;
    }
    const linked = deps.hub.players.byDiscord(user.id);
    const fields = fieldsOf(p, lang, !linked);
    const steps = stepsOf(fields);
    if (stepIndex > 0 && !drafts.has(draftKey(user.id, p.id))) {
      await say(d, bt(lang, 'teamExpired'));
      return;
    }
    const part = fields.slice(stepIndex * PER_STEP, (stepIndex + 1) * PER_STEP);
    await callback(d, {
      type: MODAL,
      data: {
        custom_id: `${TEAM_IDS.form}${p.id}:${stepIndex}`,
        title: shorten(
          bt(lang, 'teamFormTitle', { position: p.role.name[lang], step: shown(stepIndex), steps }),
          LABEL_MAX,
        ),
        components: part.map((f) => ({
          type: ROW,
          components: [
            {
              type: TEXT_INPUT,
              custom_id: f.id,
              label: f.label,
              placeholder: f.placeholder,
              style: f.style,
              min_length: f.min,
              max_length: f.max,
              required: true,
            },
          ],
        })),
      },
    });
  };

  const submitStep = async (d: Raw, lang: BotLang, positionId: string, stepIndex: number): Promise<void> => {
    const p = team.position(positionId);
    const user = userOf(d);
    if (!p) {
      await say(d, bt(lang, 'teamClosed', { position: positionId }));
      return;
    }
    const key = draftKey(user.id, p.id);
    const before = stepIndex === 0 ? {} : (drafts.get(key)?.answers ?? null);
    if (before === null || (stepIndex > 0 && (drafts.get(key)?.until ?? 0) < now())) {
      drafts.delete(key);
      await say(d, bt(lang, 'teamExpired'));
      return;
    }
    const answers = { ...before, ...valuesOf(d) };
    const linked = deps.hub.players.byDiscord(user.id);
    const fields = fieldsOf(p, lang, !linked);
    const steps = stepsOf(fields);
    if (stepIndex + 1 < steps) {
      drafts.set(key, { answers, until: now() + DRAFT_MS });
      await say(d, bt(lang, 'teamPartDone', { done: shown(stepIndex), steps }), [
        {
          type: ROW,
          components: [
            {
              type: BUTTON,
              style: STYLE_PRIMARY,
              label: bt(lang, 'teamNext', { step: shown(stepIndex + 1) }),
              custom_id: `${TEAM_IDS.next}${p.id}:${stepIndex + 1}`,
            },
          ],
        },
      ]);
      return;
    }
    drafts.delete(key);
    try {
      const questions = fields.filter((f) => f.id !== NAME_FIELD);
      team.apply({
        position: p.id,
        answers: questions.map((f) => answers[f.id] ?? ''),
        lang,
        discordId: user.id,
        discordName: user.name,
        minecraftName: answers[NAME_FIELD] ?? null,
        via: 'discord',
      });
      await say(d, bt(lang, 'teamThanks', { position: positionLabel(p, lang) }));
    } catch (err) {
      await say(d, bt(lang, 'teamFailed', { reason: reason(err) }));
    }
  };

  const pick = async (d: Raw, lang: BotLang): Promise<void> => {
    const open = team.positions().filter((p) => p.open);
    const options = [
      ...open.map((p) => ({
        label: positionLabel(p, lang),
        value: p.id,
        description: shorten(p.text[lang] || bt(lang, 'pickTeam'), OPTION_DESCRIPTION_MAX),
      })),
      ...(deps.mornicraft && deps.mornicraftOpen()
        ? [{ label: '⛏ MorniCraft', value: MORNICRAFT, description: bt(lang, 'pickMornicraft') }]
        : []),
    ];
    if (!options.length) {
      await say(d, bt(lang, 'pickNone'));
      return;
    }
    await say(d, bt(lang, 'pickTitle'), [
      {
        type: ROW,
        components: [
          {
            type: STRING_SELECT,
            custom_id: CUSTOM_IDS.applyPick,
            placeholder: bt(lang, 'pickPlaceholder'),
            options,
          },
        ],
      },
    ]);
  };

  const decideButton = async (d: Raw, lang: BotLang, accept: boolean, id: number): Promise<void> => {
    const app = team.get(id);
    const user = userOf(d);
    const player = deps.hub.players.byDiscord(user.id);
    if (!app || !player || !team.mayDecide(deps.hub.players.roleOf(player.uuid), app.position ?? '')) {
      await say(d, bt(lang, 'decideNoRight'));
      return;
    }
    await callback(d, {
      type: MODAL,
      data: {
        custom_id: `${TEAM_IDS.decide}${accept ? 'accept' : 'reject'}:${id}`,
        title: shorten(
          bt(lang, accept ? 'decideAccept' : 'decideReject', { name: app.minecraftName }),
          LABEL_MAX,
        ),
        components: [
          {
            type: ROW,
            components: [
              {
                type: TEXT_INPUT,
                custom_id: 'note',
                label: bt(lang, 'decideMessage'),
                placeholder: bt(lang, 'decideMessageHint'),
                style: PARAGRAPH,
                min_length: 0,
                max_length: NOTE_MAX,
                required: false,
              },
            ],
          },
        ],
      },
    });
  };

  const decideModal = async (d: Raw, lang: BotLang, accept: boolean, id: number): Promise<void> => {
    const user = userOf(d);
    const player = deps.hub.players.byDiscord(user.id);
    if (!player) {
      await say(d, bt(lang, 'decideNoRight'));
      return;
    }
    try {
      const role = deps.hub.players.roleOf(player.uuid);
      team.decide(id, accept, { name: player.name, role }, valuesOf(d)['note'] ?? '');
      await say(
        d,
        bt(lang, 'decideDone', { id, state: bt(lang, accept ? 'stateAccepted' : 'stateRejected') }),
      );
    } catch (err) {
      const code = reason(err);
      await say(
        d,
        code === 'application_no_right'
          ? bt(lang, 'decideNoRight')
          : bt(lang, 'teamFailed', { reason: code }),
      );
    }
  };

  // ---------- Bewerbungs-Eingang (Team) ----------
  const intake = (app: Application) => {
    const p = team.position(app.position ?? '');
    const position = p ? positionLabel(p) : (app.position ?? '?');
    const colour = { pending: AMBER, accepted: EMERALD, rejected: RED }[app.status];
    const answers = Object.entries(app.answers).map(([q, a]) => ({
      name: shorten(q, EMBED_TITLE_MAX),
      value: cut(a || '—'),
    }));
    const decided =
      app.status === 'pending'
        ? []
        : [
            {
              name: bt('de', app.status === 'accepted' ? 'intakeAccepted' : 'intakeRejected', {
                by: app.decidedBy ?? '?',
              }),
              value: cut(app.note ?? '—'),
            },
          ];
    const panel = {
      type: BUTTON,
      style: STYLE_LINK,
      label: bt('de', 'intakePanel'),
      url: `https://${deps.domain}/panel/bewerbungen/${app.id}`,
    };
    return {
      embeds: [
        {
          title: shorten(
            bt('de', 'intakeTitle', { id: app.id, name: app.minecraftName, position }),
            EMBED_TITLE_MAX,
          ),
          color: colour,
          fields: [
            { name: 'Discord', value: app.discordId ? `<@${app.discordId}>` : '—', inline: true },
            {
              name: 'Minecraft',
              value: app.minecraftUuid
                ? app.minecraftName
                : `${app.minecraftName} (${bt('de', 'intakeUnlinked')})`,
              inline: true,
            },
            {
              name: bt('de', 'intakeVia'),
              value: app.via === 'website' ? bt('de', 'intakeWebsite') : 'Discord',
              inline: true,
            },
            ...answers,
            ...decided,
          ],
          timestamp: app.createdAt,
        },
      ],
      components: [
        {
          type: ROW,
          components:
            app.status === 'pending'
              ? [
                  {
                    type: BUTTON,
                    style: STYLE_SUCCESS,
                    label: bt('de', 'intakeAccept'),
                    custom_id: `${TEAM_IDS.accept}${app.id}`,
                  },
                  {
                    type: BUTTON,
                    style: STYLE_DANGER,
                    label: bt('de', 'intakeReject'),
                    custom_id: `${TEAM_IDS.reject}${app.id}`,
                  },
                  panel,
                ]
              : [panel],
        },
      ],
      allowed_mentions: { parse: [] },
    };
  };

  const dm = async (discordId: string, content: string): Promise<void> => {
    const channel = await rest<{ id: string }>('POST', '/users/@me/channels', { recipient_id: discordId });
    await rest('POST', `/channels/${channel.id}/messages`, { content });
  };

  const decided = async (app: Application, account: boolean): Promise<void> => {
    const channel = deps.channel('applications');
    if (channel && app.discordMessageId)
      await rest('PATCH', `/channels/${channel}/messages/${app.discordMessageId}`, intake(app));
    const lang: BotLang = app.lang === 'en' ? 'en' : 'de';
    const p = team.position(app.position ?? '');
    const position = p ? positionLabel(p, lang) : (app.position ?? '');
    const note = app.note ? `\n> ${app.note}` : '';
    const accepted = app.status === 'accepted';
    const cooldown = team.rules().cooldownDays;
    const again =
      cooldown > 0 && app.decidedAt
        ? `\n${bt(lang, 'teamAgain', { ts: Math.floor((Date.parse(app.decidedAt) + cooldown * DAY_MS) / SECOND_MS) })}`
        : '';
    const text = accepted
      ? `${bt(lang, 'teamWelcome', { name: app.minecraftName, position, note })}${account ? `\n${bt(lang, 'teamAccount')}` : ''}`
      : bt(lang, 'teamNo', { position, note, again });
    // Angenommen und gerade im Spiel: dort auch gleich Bescheid.
    const online = app.minecraftUuid ? deps.hub.presence.get(app.minecraftUuid) : undefined;
    if (accepted && online && p)
      deps.hub.tell(
        online.uuid,
        bt(online.lang, 'teamWelcomeGame', {
          rank: `<${p.role.colour}>${mm(positionLabel(p, online.lang))}</${p.role.colour}>`,
        }),
      );
    if (app.discordId)
      await dm(app.discordId, text).catch((err: unknown) =>
        deps.log.warn({ err }, 'Discord: Ergebnis der Team-Bewerbung nicht zugestellt'),
      );
  };

  return {
    pick,
    component: async (d, lang, customId) => {
      if (customId === CUSTOM_IDS.applyPick) {
        const value = ((d['data'] as { values?: string[] } | undefined)?.values ?? [])[0] ?? '';
        if (value === MORNICRAFT && deps.mornicraft) await deps.mornicraft(d, lang);
        else await openStep(d, lang, value, 0);
        return true;
      }
      if (customId.startsWith(CUSTOM_IDS.applyTeam)) {
        await openStep(d, lang, customId.slice(CUSTOM_IDS.applyTeam.length), 0);
        return true;
      }
      if (customId.startsWith(TEAM_IDS.next)) {
        const [position = '', stepText = '0'] = customId.slice(TEAM_IDS.next.length).split(':');
        await openStep(d, lang, position, Number(stepText));
        return true;
      }
      const accept = customId.startsWith(TEAM_IDS.accept);
      if (accept || customId.startsWith(TEAM_IDS.reject)) {
        await decideButton(
          d,
          lang,
          accept,
          Number(customId.slice((accept ? TEAM_IDS.accept : TEAM_IDS.reject).length)),
        );
        return true;
      }
      return false;
    },
    modal: async (d, lang, customId) => {
      if (customId.startsWith(TEAM_IDS.form)) {
        const [position = '', stepText = '0'] = customId.slice(TEAM_IDS.form.length).split(':');
        await submitStep(d, lang, position, Number(stepText));
        return true;
      }
      if (customId.startsWith(TEAM_IDS.decide)) {
        const [kind = '', idText = ''] = customId.slice(TEAM_IDS.decide.length).split(':');
        await decideModal(d, lang, kind === 'accept', Number(idText));
        return true;
      }
      return false;
    },
    posted: async (app) => {
      const channel = deps.channel('applications');
      if (!channel) return;
      const msg = await rest<{ id: string }>('POST', `/channels/${channel}/messages`, intake(app));
      deps.onPosted(app.id, msg.id);
    },
    decided,
  };
}
