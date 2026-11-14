/**
 * Texte, die Spieler im Spiel sehen (MiniMessage). Platzhalter {name} werden ersetzt; Werte von Spielern werden
 * vorher entschärft (`mm`), damit niemand mit <red> oder <click:…> Unsinn treiben kann.
 */

export type Lang = 'de' | 'en';
export const LANGS: readonly Lang[] = ['de', 'en'];

// Zeichen, die in MiniMessage etwas bedeuten: "<red>" → "\<red>", "a\b" → "a\\b".
// https://regex101.com/?flavor=javascript&regex=%5B%5C%5C%3C%5D&flags=g&testString=%3Cred%3E%5C
const MM_SPECIAL = /[\\<]/g;
// Platzhalter im Text: "{name}" → Wert von name.
// https://regex101.com/?flavor=javascript&regex=%5C%7B(%5Cw%2B)%5C%7D&flags=g&testString=Hallo%20%7Bname%7D
const PLACEHOLDER = /\{(\w+)\}/g;

/** Text eines Spielers sicher in MiniMessage einsetzen. */
export const mm = (text: string): string => text.replace(MM_SPECIAL, '\\$&');

const P = '<dark_gray>[<gradient:#3ddc84:#1fa463>MoinMorni</gradient>]</dark_gray> ';

const F = '<dark_gray>[<aqua>Freunde</aqua>]</dark_gray> ';
const FE = '<dark_gray>[<aqua>Friends</aqua>]</dark_gray> ';
const Y = '<dark_gray>[<light_purple>Party</light_purple>]</dark_gray> ';

const TEXTS = {
  'lang.set': {
    de: `${P}<gray>Deine Sprache ist jetzt <green>Deutsch</green>.`,
    en: `${P}<gray>Your language is now <green>English</green>.`,
  },
  'lang.usage': {
    de: `${P}<gray>So geht's: <yellow>/sprache de</yellow> oder <yellow>/sprache en</yellow>`,
    en: `${P}<gray>Usage: <yellow>/language de</yellow> or <yellow>/language en</yellow>`,
  },
  'cmd.unknown_player': {
    de: `${P}<red>Den Spieler <white>{name}</white> kennen wir nicht.`,
    en: `${P}<red>We don't know a player called <white>{name}</white>.`,
  },
  'cmd.offline': {
    de: `${P}<red><white>{name}</white> ist gerade nicht online.`,
    en: `${P}<red><white>{name}</white> is not online right now.`,
  },
  'cmd.no_right': {
    de: `${P}<red>Das darfst du leider nicht.`,
    en: `${P}<red>Sorry, you're not allowed to do that.`,
  },
  'cmd.higher': {
    de: `${P}<red>Bei <white>{name}</white> geht das nicht – gleicher oder höherer Rang.`,
    en: `${P}<red>You can't do that to <white>{name}</white> – same or higher rank.`,
  },
  'cmd.self': {
    de: `${P}<red>Das geht nicht bei dir selbst.`,
    en: `${P}<red>You can't do that to yourself.`,
  },
  'cmd.duration': {
    de: `${P}<red>Dauer verstehe ich nicht: <white>{value}</white>. Beispiele: <yellow>30m</yellow>, <yellow>2h</yellow>, <yellow>7d</yellow>, <yellow>perm</yellow>`,
    en: `${P}<red>I don't understand the duration <white>{value}</white>. Examples: <yellow>30m</yellow>, <yellow>2h</yellow>, <yellow>7d</yellow>, <yellow>perm</yellow>`,
  },
  'cmd.usage': {
    de: `${P}<gray>So geht's: <yellow>{usage}</yellow>`,
    en: `${P}<gray>Usage: <yellow>{usage}</yellow>`,
  },
  'msg.to': {
    de: '<dark_gray>[<light_purple>du → {name}</light_purple>]</dark_gray> <gray>{text}',
    en: '<dark_gray>[<light_purple>you → {name}</light_purple>]</dark_gray> <gray>{text}',
  },
  'msg.from': {
    de: '<dark_gray>[<light_purple>{name} → dich</light_purple>]</dark_gray> <gray>{text}',
    en: '<dark_gray>[<light_purple>{name} → you</light_purple>]</dark_gray> <gray>{text}',
  },
  'msg.nobody': {
    de: `${P}<gray>Dir hat noch niemand geschrieben.`,
    en: `${P}<gray>Nobody has written to you yet.`,
  },
  'msg.muted': {
    de: `${P}<red>Du bist stummgeschaltet{until}. Grund: <white>{reason}`,
    en: `${P}<red>You are muted{until}. Reason: <white>{reason}`,
  },
  'chat.slow': {
    de: `${P}<gray>Langsam! Du kannst in {seconds} s wieder schreiben.`,
    en: `${P}<gray>Slow down! You can write again in {seconds} s.`,
  },
  'chat.link': { de: `${P}<gray>Links sind im Chat aus.`, en: `${P}<gray>Links are turned off in chat.` },
  'punish.until': { de: ' bis {date}', en: ' until {date}' },
  'punish.forever': { de: ' für immer', en: ' forever' },
  'punish.no_reason': { de: 'kein Grund angegeben', en: 'no reason given' },
  'ban.screen': {
    de: '<red><bold>Du bist gebannt</bold></red>\n\n<gray>Grund: <white>{reason}</white>\n<gray>Dauer:<white>{until}</white>\n\n<dark_gray>Fehler? Melde dich im Discord.',
    en: '<red><bold>You are banned</bold></red>\n\n<gray>Reason: <white>{reason}</white>\n<gray>Duration:<white>{until}</white>\n\n<dark_gray>A mistake? Contact us on Discord.',
  },
  'kick.screen': {
    de: '<red><bold>Vom Team rausgeworfen</bold></red>\n\n<gray>Grund: <white>{reason}',
    en: '<red><bold>Kicked by the team</bold></red>\n\n<gray>Reason: <white>{reason}',
  },
  'maintenance.screen': {
    de: '<gold><bold>Wartung</bold></gold>\n\n<gray>{message}',
    en: '<gold><bold>Maintenance</bold></gold>\n\n<gray>{message}',
  },
  'full.screen': {
    de: '<gold><bold>Das Netzwerk ist voll</bold></gold>\n\n<gray>Probier es gleich nochmal.',
    en: '<gold><bold>The network is full</bold></gold>\n\n<gray>Please try again in a moment.',
  },
  'team.ban': {
    de: `${P}<red>{actor}</red> <gray>hat <white>{name}</white> gebannt{until}. Grund: <white>{reason}`,
    en: `${P}<red>{actor}</red> <gray>banned <white>{name}</white>{until}. Reason: <white>{reason}`,
  },
  'team.unban': {
    de: `${P}<green>{actor}</green> <gray>hat <white>{name}</white> entbannt.`,
    en: `${P}<green>{actor}</green> <gray>unbanned <white>{name}</white>.`,
  },
  'team.mute': {
    de: `${P}<red>{actor}</red> <gray>hat <white>{name}</white> stummgeschaltet{until}. Grund: <white>{reason}`,
    en: `${P}<red>{actor}</red> <gray>muted <white>{name}</white>{until}. Reason: <white>{reason}`,
  },
  'team.unmute': {
    de: `${P}<green>{actor}</green> <gray>hat <white>{name}</white> wieder freigegeben.`,
    en: `${P}<green>{actor}</green> <gray>unmuted <white>{name}</white>.`,
  },
  'team.kick': {
    de: `${P}<red>{actor}</red> <gray>hat <white>{name}</white> rausgeworfen. Grund: <white>{reason}`,
    en: `${P}<red>{actor}</red> <gray>kicked <white>{name}</white>. Reason: <white>{reason}`,
  },
  'team.warn': {
    de: `${P}<gold>{actor}</gold> <gray>hat <white>{name}</white> verwarnt. Grund: <white>{reason}`,
    en: `${P}<gold>{actor}</gold> <gray>warned <white>{name}</white>. Reason: <white>{reason}`,
  },
  'punish.not_banned': {
    de: `${P}<gray><white>{name}</white> ist nicht gebannt.`,
    en: `${P}<gray><white>{name}</white> is not banned.`,
  },
  'punish.not_muted': {
    de: `${P}<gray><white>{name}</white> ist nicht stummgeschaltet.`,
    en: `${P}<gray><white>{name}</white> is not muted.`,
  },
  'warn.you': {
    de: `${P}<gold><bold>Verwarnung</bold></gold> <gray>vom Team: <white>{reason}`,
    en: `${P}<gold><bold>Warning</bold></gold> <gray>from the team: <white>{reason}`,
  },
  'mute.you': {
    de: `${P}<red>Du wurdest stummgeschaltet{until}. Grund: <white>{reason}`,
    en: `${P}<red>You were muted{until}. Reason: <white>{reason}`,
  },
  'unmute.you': { de: `${P}<green>Du kannst wieder schreiben.`, en: `${P}<green>You can chat again.` },
  'history.head': {
    de: `${P}<gray>Strafen von <white>{name}</white>:`,
    en: `${P}<gray>Punishments of <white>{name}</white>:`,
  },
  'history.none': {
    de: `${P}<gray><white>{name}</white> hat eine weiße Weste.`,
    en: `${P}<gray><white>{name}</white> has a clean record.`,
  },
  'history.line': {
    de: '<dark_gray> • </dark_gray><gray>{date} <white>{kind}</white>{until} – {reason} <dark_gray>({by}){state}',
    en: '<dark_gray> • </dark_gray><gray>{date} <white>{kind}</white>{until} – {reason} <dark_gray>({by}){state}',
  },
  'history.revoked': { de: ', aufgehoben', en: ', lifted' },
  'rank.set': {
    de: `${P}<white>{name}</white> <gray>hat jetzt den Rang {rank}<gray>.`,
    en: `${P}<white>{name}</white> <gray>now has the rank {rank}<gray>.`,
  },
  'rank.removed': {
    de: `${P}<white>{name}</white> <gray>hat keinen eigenen Rang mehr.`,
    en: `${P}<white>{name}</white> <gray>no longer has a rank of their own.`,
  },
  'rank.unknown': {
    de: `${P}<red>Diesen Rang gibt es nicht: <white>{rank}`,
    en: `${P}<red>There is no rank called <white>{rank}`,
  },
  'rank.too_high': {
    de: `${P}<red>Diesen Rang darfst du nicht vergeben.`,
    en: `${P}<red>You may not give this rank.`,
  },
  'lobby.going': { de: `${P}<gray>Ab in die Lobby!`, en: `${P}<gray>Off to the lobby!` },
  'set.saved': {
    de: `${P}<green>Gespeichert:</green> <gray>{label} <dark_gray>→</dark_gray> <white>{value}`,
    en: `${P}<green>Saved:</green> <gray>{label} <dark_gray>→</dark_gray> <white>{value}`,
  },
  'set.current': {
    de: `${P}<gray>{label}: <white>{value}</white> <dark_gray>·</dark_gray> ändern: <yellow>{usage}`,
    en: `${P}<gray>{label}: <white>{value}</white> <dark_gray>·</dark_gray> change: <yellow>{usage}`,
  },
  'set.invalid': {
    de: `${P}<red>Das passt nicht für „{label}“.</red> <gray>So geht's: <yellow>{usage}`,
    en: `${P}<red>That doesn't fit "{label}".</red> <gray>Usage: <yellow>{usage}`,
  },
  'set.head': {
    de: `${P}<gray>Einstellungen – alles auch im Panel unter <white>{area}</white>:`,
    en: `${P}<gray>Settings – everything is in the panel too, under <white>{area}</white>:`,
  },
  'set.line': {
    de: '<dark_gray> • </dark_gray><yellow>{usage}</yellow> <dark_gray>–</dark_gray> <gray>{label}: <white>{value}',
    en: '<dark_gray> • </dark_gray><yellow>{usage}</yellow> <dark_gray>–</dark_gray> <gray>{label}: <white>{value}',
  },
  'set.on': { de: 'an', en: 'on' },
  'set.off': { de: 'aus', en: 'off' },
  'set.empty': { de: '(leer)', en: '(empty)' },
  'friend.request_sent': {
    de: `${F}<gray>Anfrage an <white>{name}</white> ist raus.`,
    en: `${FE}<gray>Request sent to <white>{name}</white>.`,
  },
  'friend.request_got': {
    de: `${F}<white>{name}</white> <gray>möchte mit dir befreundet sein.</gray> <click:run_command:'/freunde annehmen {name}'><hover:show_text:'<green>Annehmen'><green><bold>[Annehmen]</bold></green></hover></click> <click:run_command:'/freunde ablehnen {name}'><hover:show_text:'<red>Ablehnen'><red>[Ablehnen]</red></hover></click>`,
    en: `${FE}<white>{name}</white> <gray>wants to be your friend.</gray> <click:run_command:'/friends accept {name}'><hover:show_text:'<green>Accept'><green><bold>[Accept]</bold></green></hover></click> <click:run_command:'/friends deny {name}'><hover:show_text:'<red>Deny'><red>[Deny]</red></hover></click>`,
  },
  'friend.now': {
    de: `${F}<green>Du und <white>{name}</white> seid jetzt Freunde!`,
    en: `${FE}<green>You and <white>{name}</white> are friends now!`,
  },
  'friend.denied': {
    de: `${F}<gray>Anfrage von <white>{name}</white> abgelehnt.`,
    en: `${FE}<gray>Request from <white>{name}</white> denied.`,
  },
  'friend.removed': {
    de: `${F}<gray><white>{name}</white> ist nicht mehr in deiner Freundesliste.`,
    en: `${FE}<gray><white>{name}</white> is no longer on your friends list.`,
  },
  'friend.already': { de: `${F}<gray>Ihr seid schon befreundet.`, en: `${FE}<gray>You are already friends.` },
  'friend.pending': {
    de: `${F}<gray>Die Anfrage an <white>{name}</white> läuft schon.`,
    en: `${FE}<gray>Your request to <white>{name}</white> is still open.`,
  },
  'friend.no_request': {
    de: `${F}<gray>Von <white>{name}</white> gibt es keine Anfrage.`,
    en: `${FE}<gray>There is no request from <white>{name}</white>.`,
  },
  'friend.not_friends': {
    de: `${F}<gray>Du bist nicht mit <white>{name}</white> befreundet.`,
    en: `${FE}<gray>You are not friends with <white>{name}</white>.`,
  },
  'friend.full': {
    de: `${F}<red>Die Freundesliste ist voll ({max}).`,
    en: `${FE}<red>The friends list is full ({max}).`,
  },
  'friend.head': {
    de: `${F}<gray>Deine Freunde ({online} online, {total} insgesamt):`,
    en: `${FE}<gray>Your friends ({online} online, {total} in total):`,
  },
  'friend.none': {
    de: `${F}<gray>Noch keine Freunde. So geht's: <yellow>/freunde add <name>`,
    en: `${FE}<gray>No friends yet. Try <yellow>/friends add <name>`,
  },
  'friend.line_online': {
    de: '<dark_gray> • </dark_gray><green>●</green> <white>{name}</white> <gray>auf {server}',
    en: '<dark_gray> • </dark_gray><green>●</green> <white>{name}</white> <gray>on {server}',
  },
  'friend.line_offline': {
    de: '<dark_gray> • ● <gray>{name}</gray> <dark_gray>zuletzt {date}',
    en: '<dark_gray> • ● <gray>{name}</gray> <dark_gray>last seen {date}',
  },
  'friend.requests': {
    de: `${F}<gray>Offene Anfragen: <white>{names}`,
    en: `${FE}<gray>Open requests: <white>{names}`,
  },
  'friend.joined': {
    de: `${F}<white>{name}</white> <green>ist jetzt online.`,
    en: `${FE}<white>{name}</white> <green>is online now.`,
  },
  'friend.left': {
    de: `${F}<white>{name}</white> <gray>ist offline gegangen.`,
    en: `${FE}<white>{name}</white> <gray>went offline.`,
  },
  'party.invited': {
    de: `${Y}<gray>Einladung an <white>{name}</white> ist raus.`,
    en: `${Y}<gray>Invitation sent to <white>{name}</white>.`,
  },
  'party.invite_got': {
    de: `${Y}<white>{name}</white> <gray>lädt dich in die Party ein.</gray> <click:run_command:'/party annehmen {name}'><hover:show_text:'<green>Beitreten'><green><bold>[Beitreten]</bold></green></hover></click>`,
    en: `${Y}<white>{name}</white> <gray>invites you to their party.</gray> <click:run_command:'/party accept {name}'><hover:show_text:'<green>Join'><green><bold>[Join]</bold></green></hover></click>`,
  },
  'party.joined': {
    de: `${Y}<white>{name}</white> <green>ist der Party beigetreten.`,
    en: `${Y}<white>{name}</white> <green>joined the party.`,
  },
  'party.left': {
    de: `${Y}<white>{name}</white> <gray>hat die Party verlassen.`,
    en: `${Y}<white>{name}</white> <gray>left the party.`,
  },
  'party.kicked': {
    de: `${Y}<white>{name}</white> <gray>wurde aus der Party genommen.`,
    en: `${Y}<white>{name}</white> <gray>was removed from the party.`,
  },
  'party.leader': {
    de: `${Y}<white>{name}</white> <gray>leitet jetzt die Party.`,
    en: `${Y}<white>{name}</white> <gray>leads the party now.`,
  },
  'party.disbanded': { de: `${Y}<gray>Die Party wurde aufgelöst.`, en: `${Y}<gray>The party was disbanded.` },
  'party.none': {
    de: `${Y}<gray>Du bist in keiner Party. So geht's: <yellow>/party einladen <name>`,
    en: `${Y}<gray>You are not in a party. Try <yellow>/party invite <name>`,
  },
  'party.not_leader': {
    de: `${Y}<red>Das darf nur der Party-Leiter.`,
    en: `${Y}<red>Only the party leader can do that.`,
  },
  'party.full': { de: `${Y}<red>Die Party ist voll ({max}).`, en: `${Y}<red>The party is full ({max}).` },
  'party.in_other': {
    de: `${Y}<gray><white>{name}</white> ist schon in einer Party.`,
    en: `${Y}<gray><white>{name}</white> is already in a party.`,
  },
  'party.no_invite': {
    de: `${Y}<gray>Von <white>{name}</white> gibt es keine Einladung (gilt 5 Minuten).`,
    en: `${Y}<gray>There is no invitation from <white>{name}</white> (valid for 5 minutes).`,
  },
  'party.head': { de: `${Y}<gray>Deine Party ({count}/{max}):`, en: `${Y}<gray>Your party ({count}/{max}):` },
  'party.line': {
    de: '<dark_gray> • </dark_gray>{lead}<white>{name}</white> <gray>{where}',
    en: '<dark_gray> • </dark_gray>{lead}<white>{name}</white> <gray>{where}',
  },
  'party.lead_mark': { de: '<gold>♚</gold> ', en: '<gold>♚</gold> ' },
  'party.offline': { de: '(offline)', en: '(offline)' },
  'party.follow': {
    de: `${Y}<gray>Die Party geht nach <white>{server}</white> – du kommst mit.`,
    en: `${Y}<gray>The party is heading to <white>{server}</white> – you're coming along.`,
  },
  'party.chat': {
    de: '<dark_gray>[<light_purple>Party</light_purple>]</dark_gray> <white>{name}</white> <dark_gray>»</dark_gray> <light_purple>{text}',
    en: '<dark_gray>[<light_purple>Party</light_purple>]</dark_gray> <white>{name}</white> <dark_gray>»</dark_gray> <light_purple>{text}',
  },
  'lobby.missing': {
    de: `${P}<red>Die Lobby ist gerade nicht da.`,
    en: `${P}<red>The lobby isn't available right now.`,
  },
} as const satisfies Record<string, Record<Lang, string>>;

export type TextKey = keyof typeof TEXTS;

/** Text in der Sprache des Spielers; `vars` werden so eingesetzt, wie sie sind (vorher mit `mm` entschärfen). */
export function text(lang: Lang, key: TextKey, vars: Readonly<Record<string, string | number>> = {}): string {
  return TEXTS[key][lang].replace(PLACEHOLDER, (all, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : all,
  );
}

const DATE_FORMAT: Record<Lang, string> = { de: 'de-DE', en: 'en-GB' };

export function dateText(lang: Lang, iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString(DATE_FORMAT[lang], {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone,
  });
}

/** Sprache aus der Einstellung im Client: "de_de", "de_AT" → de, alles andere → en. */
export const langOfLocale = (locale: string | null | undefined, fallback: Lang): Lang => {
  if (!locale) return fallback;
  return locale.toLowerCase().startsWith('de') ? 'de' : 'en';
};
