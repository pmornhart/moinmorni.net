import type { GameRight } from './roles.js';

/**
 * Befehle des Netzwerks – eine Liste für den Hub (Name, Aliase, Recht) und die Befehle-Seite der Webseite
 * (`/befehle`, Zeilen mit Schreibweise; die Erklärungen stehen in der Webseite unter `site.commands.lines.<key>`).
 * Die Befehle der Spielmodi stehen bei den Modus-Seiten (apps/web/src/public/mode-guides.ts), die Einstellungen im
 * Spiel kommen aus dem Einstellungs-Katalog (`SETTING_AREAS`, `/chatconfig` …).
 */

export interface Bilingual {
  readonly de: string;
  readonly en: string;
}

/** Wofür der Befehl ist – danach ist die Befehle-Seite gegliedert. */
export const COMMAND_TOPICS = ['travel', 'friends', 'chat', 'voice', 'account', 'lobby', 'team'] as const;
export type CommandTopic = (typeof COMMAND_TOPICS)[number];

/** Eine Zeile auf der Befehle-Seite: Schreibweise (de/en) und – für Teile nur fürs Team – das Recht. */
export interface CommandLine {
  readonly key: string;
  readonly syntax: Bilingual;
  readonly right?: GameRight;
}

export interface NetworkCommand {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly usage: Bilingual;
  /** Ohne = alle dürfen. */
  readonly right?: GameRight;
  readonly topic: CommandTopic;
  /**
   * Wer den Befehl ausführt: der Hub (im ganzen Netzwerk), der Proxy selbst (`/server`) oder das Lobby-Plugin (nur in
   * der Lobby). Nur die Hub-Befehle müssen zum Hub passen (Test in apps/server).
   */
  readonly where: 'hub' | 'proxy' | 'lobby';
  readonly lines: readonly CommandLine[];
}

const same = (text: string): Bilingual => ({ de: text, en: text });
const line = (key: string, de: string, en = de, right?: GameRight): CommandLine =>
  right ? { key, syntax: { de, en }, right } : { key, syntax: { de, en } };

export const NETWORK_COMMANDS: readonly NetworkCommand[] = [
  // ---------- Unterwegs ----------
  {
    name: 'lobby',
    aliases: ['hub', 'l'],
    usage: same('/lobby'),
    topic: 'travel',
    where: 'hub',
    lines: [line('lobby', '/lobby')],
  },
  {
    name: 'rueckkehr',
    aliases: ['rejoin'],
    usage: { de: '/rueckkehr', en: '/rejoin' },
    topic: 'travel',
    where: 'hub',
    lines: [line('rueckkehr', '/rueckkehr', '/rejoin')],
  },
  {
    name: 'server',
    aliases: [],
    usage: { de: '/server <modus>', en: '/server <mode>' },
    topic: 'travel',
    where: 'proxy',
    lines: [line('server', '/server <modus>', '/server <mode>')],
  },
  // ---------- Freunde & Party ----------
  {
    name: 'freunde',
    aliases: ['friends', 'f', 'freund'],
    usage: {
      de: '/freunde [add|annehmen|ablehnen|entfernen] <name>',
      en: '/friends [add|accept|deny|remove] <name>',
    },
    topic: 'friends',
    where: 'hub',
    lines: [
      line('freunde', '/freunde', '/friends'),
      line('freundeAdd', '/freunde add <name>', '/friends add <name>'),
      line('freundeAnnehmen', '/freunde annehmen <name>', '/friends accept <name>'),
      line('freundeEntfernen', '/freunde entfernen <name>', '/friends remove <name>'),
    ],
  },
  {
    name: 'party',
    aliases: ['p'],
    usage: {
      de: '/party [einladen|annehmen|verlassen|kick|leiter|auflösen] <name>',
      en: '/party [invite|accept|leave|kick|leader|disband] <name>',
    },
    topic: 'friends',
    where: 'hub',
    lines: [
      line('party', '/party <name>'),
      line('partyAnnehmen', '/party annehmen <name>', '/party accept <name>'),
      line('partyVerlassen', '/party verlassen', '/party leave'),
      line('partyLeiter', '/party leiter <name>', '/party leader <name>'),
      line('partyAufloesen', '/party auflösen', '/party disband'),
    ],
  },
  {
    name: 'pc',
    aliases: ['partychat'],
    usage: { de: '/pc <nachricht>', en: '/pc <message>' },
    topic: 'friends',
    where: 'hub',
    lines: [line('pc', '/pc <nachricht>', '/pc <message>')],
  },
  // ---------- Chat ----------
  {
    name: 'msg',
    aliases: ['tell', 'w', 'm', 'whisper'],
    usage: { de: '/msg <spieler> <nachricht>', en: '/msg <player> <message>' },
    topic: 'chat',
    where: 'hub',
    lines: [line('msg', '/msg <spieler> <nachricht>', '/msg <player> <message>')],
  },
  {
    name: 'r',
    aliases: ['reply'],
    usage: { de: '/r <nachricht>', en: '/r <message>' },
    topic: 'chat',
    where: 'hub',
    lines: [line('r', '/r <nachricht>', '/r <message>')],
  },
  // ---------- Sprachchat ----------
  {
    name: 'voice',
    aliases: ['sprachchat', 'vc'],
    usage: { de: '/voice [kanal|raus|zu <spieler>]', en: '/voice [channel|leave|join <player>]' },
    topic: 'voice',
    where: 'hub',
    lines: [
      line('voice', '/voice'),
      line('voiceKanal', '/voice <kanal> [passwort]', '/voice <channel> [password]'),
      line('voiceRaus', '/voice raus', '/voice leave'),
      line('voiceGruppe', '/voice gruppe <name> [passwort]', '/voice group <name> [password]'),
      line('voiceZu', '/voice zu <spieler>', '/voice join <player>', 'voice-join-any'),
    ],
  },
  // ---------- Konto ----------
  {
    name: 'sprache',
    aliases: ['language', 'lang'],
    usage: { de: '/sprache <de|en>', en: '/language <de|en>' },
    topic: 'account',
    where: 'hub',
    lines: [line('sprache', '/sprache <de|en>', '/language <de|en>')],
  },
  {
    name: 'profil',
    aliases: ['profile'],
    usage: { de: '/profil [privat|öffentlich]', en: '/profile [private|public]' },
    topic: 'account',
    where: 'hub',
    lines: [line('profil', '/profil [privat|öffentlich]', '/profile [private|public]')],
  },
  {
    // Recht hängt von der Einstellung im Panel ab (Netzwerk → Streamer-Modus: alle, nur mit Recht „streamer“, niemand);
    // der Befehl selbst prüft es (apps/server/src/hub/streamer.ts) – ausschalten geht immer.
    name: 'streamer',
    aliases: ['streamermodus', 'stream'],
    usage: {
      de: '/streamer [an|aus|ip|koordinaten|nachrichten|live]',
      en: '/streamer [on|off|ip|coords|messages|live]',
    },
    topic: 'account',
    where: 'hub',
    lines: [
      line('streamer', '/streamer [an|aus]', '/streamer [on|off]'),
      line(
        'streamerTeil',
        '/streamer <ip|koordinaten|nachrichten|live>',
        '/streamer <ip|coords|messages|live>',
      ),
    ],
  },
  {
    // Rang-Abzeichen (packages/shared/src/badges.ts): das Paket noch einmal anbieten; an/aus/Pflicht für das Team kommt
    // aus dem Einstellungs-Katalog (`/abzeichen an|aus`, Pflicht: `/netzwerk paket an|aus`).
    name: 'abzeichen',
    aliases: ['badges'],
    usage: { de: '/abzeichen', en: '/badges' },
    topic: 'account',
    where: 'hub',
    lines: [line('abzeichen', '/abzeichen', '/badges')],
  },
  {
    // Netzwerk-Paket (Möbel, Brunnen, Fische, Kleidung, Musik): noch einmal anbieten, z. B. nach einem Ablehnen. Pflicht
    // an/aus für das Team kommt aus dem Einstellungs-Katalog (`/netzwerk paket an|aus`).
    name: 'paket',
    aliases: ['pack', 'ressourcenpaket'],
    usage: { de: '/paket', en: '/pack' },
    topic: 'account',
    where: 'hub',
    lines: [line('paket', '/paket', '/pack')],
  },
  {
    name: 'discord',
    aliases: ['dc', 'verbinden'],
    usage: same('/discord'),
    topic: 'account',
    where: 'hub',
    lines: [line('discord', '/discord')],
  },
  {
    name: 'musik',
    aliases: ['music'],
    usage: { de: '/musik an|aus|leiser|lauter|weiter|0–100', en: '/music on|off|quieter|louder|next|0–100' },
    topic: 'lobby',
    where: 'hub',
    lines: [
      line('musik', '/musik an|aus', '/music on|off'),
      line('musikLauter', '/musik leiser|lauter', '/music quieter|louder'),
      line('musikWeiter', '/musik weiter', '/music next'),
    ],
  },
  // ---------- Nur in der Lobby ----------
  {
    name: 'rundgang',
    aliases: ['tour'],
    usage: { de: '/rundgang [stop]', en: '/tour [stop]' },
    topic: 'lobby',
    where: 'lobby',
    lines: [line('rundgang', '/rundgang', '/tour')],
  },
  {
    name: 'jumpandrun',
    aliases: ['jnr', 'parkour'],
    usage: same('/jnr [top|stop]'),
    topic: 'lobby',
    where: 'lobby',
    lines: [line('jnr', '/jnr'), line('jnrTop', '/jnr top'), line('jnrStop', '/jnr stop')],
  },
  {
    name: 'fly',
    aliases: ['fliegen'],
    right: 'lobby-fly',
    usage: { de: '/fly [an|aus]', en: '/fly [on|off]' },
    topic: 'lobby',
    where: 'lobby',
    lines: [line('fly', '/fly', '/fly', 'lobby-fly')],
  },
  // ---------- Team ----------
  {
    name: 'warn',
    aliases: ['verwarnen'],
    right: 'warn',
    usage: { de: '/warn <spieler> <grund>', en: '/warn <player> <reason>' },
    topic: 'team',
    where: 'hub',
    lines: [line('warn', '/warn <spieler> <grund>', '/warn <player> <reason>')],
  },
  {
    name: 'strafen',
    aliases: ['history', 'punishments'],
    right: 'warn',
    usage: { de: '/strafen <spieler>', en: '/history <player>' },
    topic: 'team',
    where: 'hub',
    lines: [line('strafen', '/strafen <spieler>', '/history <player>')],
  },
  {
    name: 'mute',
    aliases: ['stumm'],
    right: 'mute',
    usage: { de: '/mute <spieler> [dauer] [grund]', en: '/mute <player> [duration] [reason]' },
    topic: 'team',
    where: 'hub',
    lines: [line('mute', '/mute <spieler> [dauer] [grund]', '/mute <player> [duration] [reason]')],
  },
  {
    name: 'unmute',
    aliases: ['entstummen'],
    right: 'mute',
    usage: { de: '/unmute <spieler>', en: '/unmute <player>' },
    topic: 'team',
    where: 'hub',
    lines: [line('unmute', '/unmute <spieler>', '/unmute <player>')],
  },
  {
    name: 'voicemute',
    aliases: ['sprachstumm', 'vcmute'],
    right: 'voice-mute',
    usage: { de: '/voicemute <spieler> [dauer] [grund]', en: '/voicemute <player> [duration] [reason]' },
    topic: 'team',
    where: 'hub',
    lines: [
      line('voicemute', '/voicemute <spieler> [dauer] [grund]', '/voicemute <player> [duration] [reason]'),
    ],
  },
  {
    name: 'voiceunmute',
    aliases: ['sprachfrei', 'vcunmute'],
    right: 'voice-mute',
    usage: { de: '/voiceunmute <spieler>', en: '/voiceunmute <player>' },
    topic: 'team',
    where: 'hub',
    lines: [line('voiceunmute', '/voiceunmute <spieler>', '/voiceunmute <player>')],
  },
  {
    name: 'kick',
    aliases: [],
    right: 'kick',
    usage: { de: '/kick <spieler> [grund]', en: '/kick <player> [reason]' },
    topic: 'team',
    where: 'hub',
    lines: [line('kick', '/kick <spieler> [grund]', '/kick <player> [reason]')],
  },
  {
    name: 'gefaengnis',
    aliases: ['gefängnis', 'jail', 'knast'],
    right: 'jail',
    usage: { de: '/gefaengnis <spieler> [dauer] [grund]', en: '/jail <player> [duration] [reason]' },
    topic: 'team',
    where: 'hub',
    lines: [
      line('gefaengnis', '/gefaengnis <spieler> [dauer] [grund]', '/jail <player> [duration] [reason]'),
    ],
  },
  {
    name: 'frei',
    aliases: ['unjail', 'entlassen'],
    right: 'jail',
    usage: { de: '/frei <spieler>', en: '/unjail <player>' },
    topic: 'team',
    where: 'hub',
    lines: [line('frei', '/frei <spieler>', '/unjail <player>')],
  },
  {
    name: 'ban',
    aliases: [],
    right: 'ban',
    usage: { de: '/ban <spieler> [dauer] [grund]', en: '/ban <player> [duration] [reason]' },
    topic: 'team',
    where: 'hub',
    lines: [line('ban', '/ban <spieler> [dauer] [grund]', '/ban <player> [duration] [reason]')],
  },
  {
    name: 'unban',
    aliases: ['entbannen'],
    right: 'ban',
    usage: { de: '/unban <spieler>', en: '/unban <player>' },
    topic: 'team',
    where: 'hub',
    lines: [line('unban', '/unban <spieler>', '/unban <player>')],
  },
  {
    name: 'rang',
    aliases: ['rank'],
    right: 'ranks',
    usage: { de: '/rang <spieler> <rang|weg>', en: '/rank <player> <rank|none>' },
    topic: 'team',
    where: 'hub',
    lines: [line('rang', '/rang <spieler> <rang|weg>', '/rank <player> <rank|none>')],
  },
  {
    name: 'bau',
    aliases: ['build', 'bauserver'],
    right: 'build',
    usage: { de: '/bau', en: '/build' },
    topic: 'team',
    where: 'hub',
    lines: [line('bau', '/bau', '/build')],
  },
];

/** Name, Aliase, Schreibweise und Recht eines Hub-Befehls aus der Liste – der Hub nimmt sie von hier. */
export function networkCommand(name: string): Pick<NetworkCommand, 'name' | 'aliases' | 'usage' | 'right'> {
  const found = NETWORK_COMMANDS.find((c) => c.name === name && c.where === 'hub');
  if (!found) throw new Error(`Befehl /${name} fehlt in NETWORK_COMMANDS`);
  return found.right
    ? { name: found.name, aliases: found.aliases, usage: found.usage, right: found.right }
    : { name: found.name, aliases: found.aliases, usage: found.usage };
}

/** Darf ein Rang mit diesen Rechten die Zeile benutzen? Wie der Hub: ohne Recht alle, sonst das Recht im Rang. */
export function mayUseCommand(
  role: { readonly game: readonly string[] },
  command: Pick<NetworkCommand, 'right'>,
  commandLine?: Pick<CommandLine, 'right'>,
): boolean {
  const need = commandLine?.right ?? command.right;
  return !need || role.game.includes(need);
}
