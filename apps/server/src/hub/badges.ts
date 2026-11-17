import { z } from 'zod';
import { JAIL_BADGE, badgeKeys, networkCommand, type Role } from '@moinmorni/shared';
import type { Command } from './commands.js';
import type { HubContext } from './context.js';
import type { Body } from './transport.js';
import { LANGS, mm, text, type Lang } from './texts.js';

/**
 * Rang-Abzeichen im ganzen Netzwerk (packages/shared/src/badges.ts, Paket: badges/pack.ts). Ein Rang steht im Spiel
 * als Übersetzung mit dem Schlüssel „Symbol + Leerzeichen“: Wer das Paket hat, sieht das Schild, alle anderen wie
 * bisher Symbol und Farbe – das entscheidet jeder Client selbst. Der Proxy bietet das Paket an (eigene Kennung, bleibt
 * auf allen Servern), der Hub sagt ihm, wo es liegt, und antwortet auf das, was der Spieler damit macht.
 */

/** Wo das Paket liegt (öffentliche Adresse) und seine SHA-1 – ohne eigene Domain gibt es keins. */
export interface BadgeOffer {
  readonly url: string;
  readonly sha1: string;
}

/** Was der Chat vom Rang zeigt: Symbol oder Abzeichen. */
export interface BadgeTags {
  /** Vor dem Namen, Leerzeichen dahinter schon dabei (ohne Symbol und ohne Abzeichen: nichts). */
  readonly rankTag: (role: Role) => string;
  /** „[⛓ Gefängnis] “ vor Nachrichten aus der Zelle – oder das Gefängnis-Abzeichen. */
  readonly jailTag: (lang: Lang) => string;
}

export interface Badges extends BadgeTags {
  /** Sind Abzeichen gerade an (Schalter im Panel und eine Adresse fürs Paket)? */
  readonly active: () => boolean;
  /** Schlüssel des Rangs fürs Profil (Tab-Liste und über dem Kopf malt der Spielserver) – aus = null. */
  readonly keyOf: (role: Role) => string | null;
  /** Was der Proxy wissen muss: an/aus, Adresse, SHA-1, Pflicht, Text im Fenster. */
  readonly proxyBody: () => Body;
  /** Was der Proxy über einen Spieler meldet (geladen, abgelehnt …). */
  readonly onStatus: (body: unknown) => void;
  readonly commands: readonly Command[];
}

/** Länge einer UUID mit Bindestrichen (36) und etwas Luft – wie bei den anderen Nachrichten des Proxys. */
const UUID_MAX = 40;
/** Was der Proxy über das Paket eines Spielers meldet. */
const statusSchema = z.object({
  uuid: z.string().min(1).max(UUID_MAX),
  status: z.enum(['sent', 'unsupported', 'loaded', 'declined', 'failed']),
});

// In Anführungszeichen sind für MiniMessage nur ' und \ besonders: "it's" → "it\'s", "a\b" → "a\\b".
// https://regex101.com/?flavor=javascript&regex=%5B%5C%5C'%5D&flags=g&testString=it's%20a%5Cb
const QUOTED_SPECIAL = /[\\']/g;
const quoted = (value: string): string => `'${value.replace(QUOTED_SPECIAL, '\\$&')}'`;

/**
 * Eine Übersetzung als MiniMessage: `<lang:'♛ '/>`. Weitere Teile werden zu Argumenten (MiniMessage in sich, z. B.
 * die Teile von „[⛓ Gefängnis]“). Ohne Übersetzung zeigt Minecraft den Schlüssel selbst – mit den Argumenten.
 */
export const badgeTag = (key: string, ...args: readonly string[]): string =>
  `<lang:${[key, ...args].map(quoted).join(':')}/>`;

/** So sah der Rang im Chat vor den Abzeichen aus (und so bleibt er, wenn sie aus sind). */
const plainRank = (role: Role): string =>
  role.symbol ? `<${role.colour}>${mm(role.symbol)}</${role.colour}> ` : '';
const plainJail = (lang: Lang): string =>
  `<dark_gray>[</dark_gray><gray>${JAIL_BADGE.symbol} ${JAIL_BADGE.name[lang]}</gray><dark_gray>]</dark_gray> `;

export interface BadgeOptions {
  readonly ctx: HubContext;
  /** Wo das Paket gerade liegt; null = keins (keine Domain). */
  readonly offer: () => BadgeOffer | null;
  readonly toProxy: (body: Body) => boolean;
}

export function createBadges({ ctx, offer, toProxy }: BadgeOptions): Badges {
  const settings = (): Record<string, unknown> => ctx.stores.settings('badges');
  const active = (): boolean => settings()['enabled'] === true && offer() !== null;
  const keyOf = (role: Role): string | null =>
    active() ? (badgeKeys(ctx.stores.roles())[role.id] ?? null) : null;
  /** Wer /abzeichen getippt hat, bekommt Bescheid, wie es ausging (automatisch beim Betreten nur bei Problemen). */
  const asked = new Set<string>();
  const say = (uuid: string, key: Parameters<typeof text>[1]): void => {
    const p = ctx.presence.get(uuid);
    if (p) ctx.msg(p.uuid, text(p.lang, key));
  };

  const command: Command = {
    ...networkCommand('abzeichen'),
    run: (actor) => {
      if (!active()) {
        ctx.msg(actor.uuid, text(actor.lang, 'badges.off'));
        return;
      }
      if (ctx.presence.get(actor.uuid)?.bedrock) {
        ctx.msg(actor.uuid, text(actor.lang, 'badges.bedrock'));
        return;
      }
      asked.add(actor.uuid);
      toProxy({ t: 'badges-send', uuid: actor.uuid });
    },
  };

  return {
    active,
    keyOf,
    rankTag: (role) => {
      const key = keyOf(role);
      return key === null ? plainRank(role) : `<${role.colour}>${badgeTag(key)}</${role.colour}>`;
    },
    jailTag: (lang) =>
      active()
        ? badgeTag(
            JAIL_BADGE.key,
            '<dark_gray>[',
            `<gray>${JAIL_BADGE.symbol} ${JAIL_BADGE.name[lang]}`,
            '<dark_gray>]',
          )
        : plainJail(lang),
    proxyBody: () => {
      const pack = active() ? offer() : null;
      return {
        t: 'badges',
        enabled: pack !== null,
        url: pack?.url ?? null,
        sha1: pack?.sha1 ?? null,
        required: settings()['required'] === true,
        // Pflicht steht im Fenster selbst – Minecraft bekommt das Paket nie als „verpflichtend“ (siehe Proxy).
        prompt: Object.fromEntries(
          LANGS.map((lang) => [
            lang,
            text(lang, settings()['required'] === true ? 'badges.prompt_required' : 'badges.prompt'),
          ]),
        ),
      };
    },
    onStatus: (body) => {
      const m = statusSchema.parse(body);
      const p = ctx.presence.get(m.uuid);
      if (!p) return;
      const wanted = asked.has(p.uuid);
      if (m.status !== 'sent') asked.delete(p.uuid);
      if (m.status === 'sent' && wanted) say(p.uuid, 'badges.sending');
      if (m.status === 'unsupported' && wanted) say(p.uuid, 'badges.old_client');
      if (m.status === 'loaded' && wanted) say(p.uuid, 'badges.loaded');
      if (m.status === 'failed') say(p.uuid, 'badges.failed');
      if (m.status !== 'declined') return;
      // Pflicht: freundlich hinaus, mit Erklärung, wie man das Paket einschaltet.
      if (settings()['required'] === true) ctx.kick(p.uuid, text(p.lang, 'badges.required'));
      else say(p.uuid, 'badges.declined');
    },
    commands: [command],
  };
}
