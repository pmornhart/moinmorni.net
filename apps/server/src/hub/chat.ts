import type { Lang } from './texts.js';
import { dateText, mm, text } from './texts.js';
import type { HubContext } from './context.js';
import { hasRight } from './context.js';

/**
 * Chat im ganzen Netzwerk: Der Spielserver schickt, was jemand schreibt; der Hub prüft (stumm, Langsam-Modus,
 * Links, Großbuchstaben, Schimpfwörter) und verteilt die fertige Zeile – an alle Server oder nur an den eigenen.
 */

const SECOND_MS = 1000;
const PERCENT = 100;
const CAPS_MIN_LENGTH = 6;
const CENSORED = '***';
const LOBBY = 'lobby';
// Links und Adressen: "https://x.de", "www.x.de", "x.com/abc", "1.2.3.4". Nicht "z.B." oder "ok.".
// https://regex101.com/?flavor=javascript&regex=(https%3F%3A%5C%2F%5C%2F%7Cwww%5C.)%5CS%2B%7C%5Cb%5Ba-z0-9-%5D%2B%5C.(de%7Ccom%7Cnet%7Corg%7Ceu%7Cio%7Cgg%7Cme%7Ctv%7Cat%7Cch%7Cxyz%7Cinfo)%5Cb%7C%5Cb%5Cd%7B1%2C3%7D(%5C.%5Cd%7B1%2C3%7D)%7B3%7D%5Cb&flags=gi&testString=komm%20auf%20meinserver.net%20oder%20www.x.de
const LINK =
  /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(de|com|net|org|eu|io|gg|me|tv|at|ch|xyz|info)\b|\b\d{1,3}(\.\d{1,3}){3}\b/i;
// Großbuchstaben (auch Umlaute) zählen: "HALLO" → 5.
// https://regex101.com/?flavor=javascript&regex=%5BA-Z%C3%84%C3%96%C3%9C%5D&flags=g&testString=HALLO%20Welt
const UPPER = /[A-ZÄÖÜ]/g;
// Buchstaben überhaupt: Basis für den Anteil Großbuchstaben.
// https://regex101.com/?flavor=javascript&regex=%5Ba-zA-Z%C3%A4%C3%B6%C3%BC%C3%84%C3%96%C3%9C%C3%9F%5D&flags=g&testString=Hallo
const LETTERS = /[a-zA-ZäöüÄÖÜß]/g;
// Zeichen, die in einem Wort für einen regulären Ausdruck etwas bedeuten: "a.b" → "a\.b".
// https://regex101.com/?flavor=javascript&regex=%5B.*%2B%3F%5E%24%7B%7D()%7C%5B%5C%5D%5C%5C%5D&flags=g&testString=a.b
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;

export interface ChatSettings {
  readonly global: boolean;
  readonly showServer: boolean;
  readonly shoutPrefix: string;
  readonly slowMode: number;
  readonly blockLinks: boolean;
  readonly capsLimit: number;
  readonly badWords: readonly string[];
}

function tooLoud(message: string, limit: number): boolean {
  const letters = message.match(LETTERS)?.length ?? 0;
  const upper = message.match(UPPER)?.length ?? 0;
  return letters >= CAPS_MIN_LENGTH && (upper / letters) * PERCENT > limit;
}

const censor = (message: string, words: readonly string[]): string =>
  words
    .filter((w) => w.trim())
    .reduce(
      (acc, word) => acc.replace(new RegExp(word.trim().replace(REGEX_SPECIAL, '\\$&'), 'gi'), CENSORED),
      message,
    );

/** Kürzel vor dem Namen (z. B. der Clan in MorniCraft), schon geprüft: Buchstaben/Ziffern und "#rrggbb". */
export interface ChatTag {
  readonly text: string;
  readonly colour: string;
}

export interface Chat {
  readonly handle: (uuid: string, message: string, now?: number, tag?: ChatTag) => void;
}

export function createChat(ctx: HubContext, settings: () => ChatSettings): Chat {
  const serverName = (server: string, lang: Lang): string => {
    if (server === LOBBY) return 'Lobby';
    const mode = ctx.stores.modes().find((m) => m.server === server);
    return mode ? mode.name[lang] : server;
  };

  return {
    handle: (uuid, raw, now = Date.now(), tag) => {
      const sender = ctx.presence.get(uuid);
      if (!sender?.server) return;
      const s = settings();
      const role = ctx.players.roleOf(uuid);
      const team = hasRight(role, 'mute');
      const mute = ctx.punish.active(sender.uuid, 'mute');
      if (mute) {
        const until = mute.expiresAt
          ? text(sender.lang, 'punish.until', { date: dateText(sender.lang, mute.expiresAt, ctx.timeZone) })
          : text(sender.lang, 'punish.forever');
        ctx.msg(uuid, text(sender.lang, 'msg.muted', { until, reason: mm(mute.reason) }));
        return;
      }
      // Im Gefängnis: nur das Team (wer einsperren darf) und die anderen Eingesperrten lesen mit.
      if (ctx.punish.active(sender.uuid, 'jail') && !team) {
        const jailLine = (lang: Lang): string =>
          text(lang, 'jail.chat', { name: mm(sender.name), text: mm(censor(raw.trim(), s.badWords)) });
        const jailed = new Set(ctx.punish.activeAll('jail').map((p) => p.playerUuid));
        ctx.presence
          .all()
          .filter((p) => jailed.has(p.uuid) || hasRight(ctx.players.roleOf(p.uuid), 'jail'))
          .forEach((p) => ctx.msg(p.uuid, jailLine(p.lang)));
        return;
      }
      const wait = Math.ceil((sender.lastChatAt + s.slowMode * SECOND_MS - now) / SECOND_MS);
      if (s.slowMode > 0 && wait > 0 && !team) {
        ctx.msg(uuid, text(sender.lang, 'chat.slow', { seconds: wait }));
        return;
      }
      if (s.blockLinks && !team && LINK.test(raw)) {
        ctx.msg(uuid, text(sender.lang, 'chat.link'));
        return;
      }
      sender.lastChatAt = now;
      const shout = !s.global && s.shoutPrefix !== '' && raw.startsWith(s.shoutPrefix);
      const body = shout ? raw.slice(s.shoutPrefix.length).trim() : raw.trim();
      if (!body) return;
      const calm = !team && tooLoud(body, s.capsLimit) ? body.toLowerCase() : body;
      const clean = mm(censor(calm, s.badWords));
      const symbol = role.symbol ? `<${role.colour}>${mm(role.symbol)}</${role.colour}> ` : '';
      // Nach dem Rang, vor dem Namen: "♛ [MC] Philip".
      const own = tag ? `<${tag.colour}>[${mm(tag.text)}]</${tag.colour}> ` : '';
      // Streamer-Modus: alle sehen „● LIVE“ vor dem Namen (wie in MorniCraft).
      const live = ctx.streamer(uuid).includes('live') ? '<red>● LIVE</red> ' : '';
      const line = (lang: Lang): string => {
        const server = s.showServer
          ? `<dark_gray>[</dark_gray><gray>${mm(serverName(sender.server ?? '', lang))}</gray><dark_gray>]</dark_gray> `
          : '';
        return `${server}${live}${symbol}${own}<${role.colour}>${mm(sender.name)}</${role.colour}> <dark_gray>»</dark_gray> <white>${clean}`;
      };
      ctx.chat(s.global || shout ? 'all' : sender.server, { de: line('de'), en: line('en') });
    },
  };
}
