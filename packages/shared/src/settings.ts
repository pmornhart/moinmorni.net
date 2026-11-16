/* eslint-disable ts-patterns/no-magic-numbers -- a settings catalog: defaults and limits as the game needs them */
import { z } from 'zod';
import { MODE_SETTING_AREAS } from './mode-settings.js';
import type { PanelArea } from './roles.js';

/**
 * Einstellungs-Katalog: jede Einstellung, die im Spiel per Befehl geht, steht hier – einmal. Daraus entstehen die
 * Formulare im Panel (sortiert nach Bereichen und Abschnitten, mit Erklärung und Suche), die Prüfung im Server und
 * die Konfiguration der Plugins. Ein Befehl im Spiel ändert denselben Wert über den Hub.
 */

export interface Text {
  readonly de: string;
  readonly en: string;
}

/**
 * Wo eine Einstellung eines Spielmodus in der config.yml seines Plugins steht. Der Hub schickt dem Modus-Server
 * „Pfad → Wert“, das Netzwerk-Plugin trägt es dort ein.
 */
export interface ConfigSpot {
  /**
   * Pfad mit Punkten: "kampf.zeitlimit-sekunden". Eine Zahl als Teil ist die Stelle in einer Liste:
   * "edelweiss-jagd-runden.0" = erster Eintrag von [10, 15, 20], "ankauf.stufen.1.prozent" = Feld im zweiten Eintrag.
   */
  readonly path: string;
  /**
   * Nur bei An/Aus: Eintrag einer Auswahl-Liste (z. B. ein Minispiel). An = steht in der Liste. Sind alle an (oder
   * alle aus), bleibt die Liste leer – das heißt im Modus „alle“, so kommen auch spätere neue Einträge von selbst dazu.
   */
  readonly member?: string;
}

interface Base {
  readonly key: string;
  readonly label: Text;
  readonly help: Text;
  /** Befehl im Spiel, der denselben Wert ändert (im Panel als Hinweis gezeigt). */
  readonly command?: string;
  /** Nur in Bereichen eines Spielmodus: Stelle in der config.yml des Modus. */
  readonly config?: ConfigSpot;
}

export type SettingDef =
  | (Base & { readonly type: 'boolean'; readonly default: boolean })
  | (Base & {
      readonly type: 'number';
      readonly default: number;
      readonly min: number;
      readonly max: number;
      readonly unit?: Text;
      /** Schrittweite für Kommazahlen (0.5, 0.1, 0.01); ohne = nur ganze Zahlen. */
      readonly step?: number;
    })
  | (Base & {
      readonly type: 'text';
      readonly default: string;
      readonly maxLength: number;
      readonly multiline?: boolean;
    })
  | (Base & {
      readonly type: 'select';
      readonly default: string;
      readonly options: ReadonlyArray<{ readonly value: string; readonly label: Text }>;
    })
  | (Base & {
      readonly type: 'list';
      readonly default: readonly string[];
      readonly maxItems: number;
      readonly maxLength: number;
    });

export interface SettingSection {
  readonly id: string;
  readonly title: Text;
  readonly text?: Text;
  readonly settings: readonly SettingDef[];
}

export interface SettingArea {
  readonly id: string;
  readonly title: Text;
  readonly text: Text;
  /** Name eines Symbols (lucide), z. B. "MessagesSquare". */
  readonly icon: string;
  /** Wer den Bereich im Panel sieht. */
  readonly panel: PanelArea;
  readonly sections: readonly SettingSection[];
  /**
   * Bereich eines Spielmodus (Duels, Morni Party …): Die Werte gehen in die config.yml seines Plugins und gelten nach
   * dem nächsten Neustart des Modus – MoinMorni startet ihn von selbst neu, sobald gerade niemand spielt.
   */
  readonly mode?: ModeLink;
}

/** Zu welchem Spielmodus ein Einstellungs-Bereich gehört. */
export interface ModeLink {
  /** Kennung des Modus (wie unter „Modi“, z. B. "duels", "mirni"). */
  readonly id: string;
  /** Name des Plugins (aus seiner plugin.yml) – seine config.yml liegt in plugins/<Name>/. */
  readonly plugin: string;
}

const t = (de: string, en: string): Text => ({ de, en });
const seconds = t('Sekunden', 'seconds');
const players = t('Spieler', 'players');
const blocks = t('Blöcke', 'blocks');

export const NETWORK_AREA: SettingArea = {
  id: 'network',
  title: t('Netzwerk', 'Network'),
  text: t(
    'Was für das ganze Netzwerk gilt: Name, Begrüßung, Wartung.',
    'What applies to the whole network: name, welcome, maintenance.',
  ),
  icon: 'Globe',
  panel: 'settings',
  sections: [
    {
      id: 'server-list',
      title: t('In der Serverliste', 'In the server list'),
      settings: [
        {
          key: 'motd1',
          type: 'text',
          default: '§6§lMoinMorni §7– §aDein Alpen-Netzwerk',
          maxLength: 60,
          label: t('Erste Zeile', 'First line'),
          help: t(
            'Steht unter dem Namen in der Serverliste. § + Ziffer/Buchstabe = Farbe.',
            'Shown below the name in the server list. § + digit/letter = colour.',
          ),
          command: '/netzwerk motd 1 <text>',
        },
        {
          key: 'motd2',
          type: 'text',
          default: '§7Duels · Party · Survival · Parkour',
          maxLength: 60,
          label: t('Zweite Zeile', 'Second line'),
          help: t('Zweite Zeile in der Serverliste.', 'Second line in the server list.'),
          command: '/netzwerk motd 2 <text>',
        },
        {
          key: 'maxPlayers',
          type: 'number',
          default: 200,
          min: 1,
          max: 2000,
          unit: players,
          label: t('Spieler höchstens', 'Players at most'),
          help: t(
            'Wie viele gleichzeitig ins Netzwerk dürfen (VIP und Team dürfen auch bei voll).',
            'How many may be online at once (VIP and team may join when full).',
          ),
          command: '/netzwerk max <zahl>',
        },
        {
          key: 'sleepMinutes',
          type: 'number',
          default: 5,
          min: 1,
          max: 120,
          unit: t('Minuten', 'minutes'),
          label: t('Leere Modi schlafen nach', 'Empty modes sleep after'),
          help: t(
            'Nur für Modi mit „Schlafen, wenn leer“ (im Panel unter Modi): Ist so lange niemand drin, geht ihr Server ganz aus. Wer hinein will, weckt ihn auf (dauert etwa eine halbe Minute). Alle anderen Modi bleiben immer online und brauchen ohne Spieler kaum Arbeitsspeicher.',
            'Only for modes with “Sleep when empty” (in the panel under Modes): when nobody is in them for this long, their server shuts down. Whoever wants in wakes it up (takes about half a minute). All other modes stay online and need hardly any memory without players.',
          ),
          command: '/netzwerk schlaf <minuten>',
        },
      ],
    },
    {
      id: 'maintenance',
      title: t('Wartung', 'Maintenance'),
      text: t('Während der Wartung kommt nur das Team herein.', 'During maintenance only the team can join.'),
      settings: [
        {
          key: 'maintenance',
          type: 'boolean',
          default: false,
          label: t('Wartung für das ganze Netzwerk', 'Maintenance for the whole network'),
          help: t(
            'Einzelne Modi setzt du unter „Modi“ in Wartung.',
            'Single modes are set to maintenance under “Modes”.',
          ),
          command: '/wartung an|aus',
        },
        {
          key: 'maintenanceMessage',
          type: 'text',
          default: 'Wir bauen gerade um – gleich geht’s weiter!',
          maxLength: 120,
          multiline: true,
          label: t('Nachricht für Spieler', 'Message for players'),
          help: t('Sehen Spieler, die nicht hereinkommen.', 'Shown to players who cannot join.'),
          command: '/wartung text <text>',
        },
      ],
    },
    {
      id: 'language',
      title: t('Sprache', 'Language'),
      settings: [
        {
          key: 'defaultLanguage',
          type: 'select',
          default: 'de',
          options: [
            { value: 'de', label: t('Deutsch', 'German') },
            { value: 'en', label: t('Englisch', 'English') },
          ],
          label: t(
            'Sprache, wenn der Client keine passende hat',
            'Language when the client has none of ours',
          ),
          help: t(
            'Sonst richtet sich die Sprache nach dem Minecraft-Client; jeder kann sie mit /sprache ändern.',
            'Otherwise it follows the Minecraft client; everyone can change it with /sprache.',
          ),
          command: '/netzwerk sprache <de|en>',
        },
      ],
    },
  ],
};

export const CHAT_AREA: SettingArea = {
  id: 'chat',
  title: t('Chat', 'Chat'),
  text: t(
    'Ein gemeinsamer Chat über alle Server, Runden-Chat in laufenden Spielen, Schutz vor Spam.',
    'One chat across all servers, round chat in running games, spam protection.',
  ),
  icon: 'MessagesSquare',
  panel: 'chat',
  sections: [
    {
      id: 'global',
      title: t('Gemeinsamer Chat', 'Shared chat'),
      settings: [
        {
          key: 'global',
          type: 'boolean',
          default: true,
          label: t('Chat über alle Server', 'Chat across all servers'),
          help: t(
            'Nachrichten erscheinen auf allen Servern, vorne mit dem Kürzel des Servers.',
            'Messages appear on every server, with the server’s short name in front.',
          ),
          command: '/chatconfig global an|aus',
        },
        {
          key: 'showServer',
          type: 'boolean',
          default: true,
          label: t('Server-Kürzel zeigen', 'Show server short name'),
          help: t('Z. B. „[Duels]“ vor dem Namen.', 'E.g. “[Duels]” before the name.'),
          command: '/chatconfig kuerzel an|aus',
        },
        {
          key: 'roundChat',
          type: 'boolean',
          default: true,
          label: t('Runden-Chat in laufenden Spielen', 'Round chat in running games'),
          help: t(
            'In Duels, Party usw. sehen nur die Mitspieler die Nachricht; mit dem Zeichen unten schreibt man an alle.',
            'In Duels, Party etc. only fellow players see messages; the sign below writes to everyone.',
          ),
          command: '/chatconfig runde an|aus',
        },
        {
          key: 'shoutPrefix',
          type: 'text',
          default: '!',
          maxLength: 2,
          label: t('Zeichen für „an alle“', 'Sign for “to everyone”'),
          help: t(
            'Steht es vor der Nachricht, geht sie im Runden-Chat an alle.',
            'Put before a message in round chat, it goes to everyone.',
          ),
          command: '/chatconfig zeichen <zeichen>',
        },
      ],
    },
    {
      id: 'protection',
      title: t('Schutz', 'Protection'),
      settings: [
        {
          key: 'slowMode',
          type: 'number',
          default: 0,
          min: 0,
          max: 60,
          unit: seconds,
          label: t('Langsam-Modus', 'Slow mode'),
          help: t(
            'So lange muss man zwischen zwei Nachrichten warten (0 = aus, Team ausgenommen).',
            'Wait this long between two messages (0 = off, team excepted).',
          ),
          command: '/chatconfig langsam <sekunden>',
        },
        {
          key: 'blockLinks',
          type: 'boolean',
          default: true,
          label: t('Links blockieren', 'Block links'),
          help: t('Links nur für Team und Media.', 'Links only for team and media.'),
          command: '/chatconfig links an|aus',
        },
        {
          key: 'capsLimit',
          type: 'number',
          default: 70,
          min: 0,
          max: 100,
          unit: t('% Großbuchstaben', '% capitals'),
          label: t('Großbuchstaben höchstens', 'Capitals at most'),
          help: t(
            'Mehr Großbuchstaben werden klein geschrieben (0 = aus).',
            'More capitals are made lower case (0 = off).',
          ),
          command: '/chatconfig caps <prozent>',
        },
        {
          key: 'badWords',
          type: 'list',
          default: [],
          maxItems: 500,
          maxLength: 40,
          label: t('Gesperrte Wörter', 'Blocked words'),
          help: t('Werden durch *** ersetzt.', 'Replaced with ***.'),
          command: '/chatconfig wort hinzu|weg <wort>',
        },
      ],
    },
  ],
};

export const VOICE_AREA: SettingArea = {
  id: 'voice',
  title: t('Sprachchat', 'Voice chat'),
  text: t(
    'Simple Voice Chat im ganzen Netzwerk: gemeinsame Kanäle über alle Modi, Party-Funk, Nähe-Chat.',
    'Simple Voice Chat across the network: shared channels over all modes, party radio, proximity chat.',
  ),
  icon: 'Mic',
  panel: 'voice',
  sections: [
    {
      id: 'channels',
      title: t('Gemeinsame Kanäle', 'Shared channels'),
      text: t(
        'Diesen Kanälen kann man von jedem Server aus beitreten – man hört sich, egal in welchem Modus man ist.',
        'Join these channels from any server – you hear each other whatever mode you are in.',
      ),
      settings: [
        {
          key: 'channels',
          type: 'list',
          default: ['Dorfplatz', 'Biergarten', 'Turnier'],
          maxItems: 20,
          maxLength: 24,
          label: t('Kanäle', 'Channels'),
          help: t('Ein Name pro Kanal.', 'One name per channel.'),
          command: '/voiceconfig kanal hinzu|weg <name>',
        },
        {
          key: 'partyVoice',
          type: 'boolean',
          default: true,
          label: t('Party ist eine Sprachgruppe', 'Party is a voice group'),
          help: t(
            'Wer in einer Party ist, hört die anderen – auch auf verschiedenen Servern.',
            'Party members hear each other – even on different servers.',
          ),
          command: '/voiceconfig party an|aus',
        },
        {
          key: 'ownGroups',
          type: 'boolean',
          default: true,
          label: t('Eigene Gruppen erlaubt', 'Own groups allowed'),
          help: t(
            'Spieler dürfen eigene Gruppen anlegen: mit /voice gruppe <name> [passwort] für alle Server (leer nach 5 Minuten weg), im Sprachchat-Menü nur für den eigenen Server. Aus = auch das Menü legt keine Gruppen mehr an.',
            'Players may create own groups: with /voice group <name> [password] on every server (removed after 5 minutes empty), in the voice chat menu only on their own server. Off = the menu cannot create groups either.',
          ),
          command: '/voiceconfig gruppen an|aus',
        },
      ],
    },
    {
      id: 'team',
      title: t('Team', 'Team'),
      settings: [
        {
          key: 'teamJoinAny',
          type: 'boolean',
          default: true,
          label: t('Team kommt in jede Gruppe', 'Team joins any group'),
          help: t(
            'Admins und Moderatoren treten ohne Passwort bei.',
            'Admins and moderators join without password.',
          ),
          command: '/voiceconfig team an|aus',
        },
      ],
    },
    {
      id: 'proximity',
      title: t('Nähe-Chat', 'Proximity chat'),
      settings: [
        {
          key: 'distance',
          type: 'number',
          default: 32,
          min: 8,
          max: 96,
          unit: blocks,
          label: t('Hörweite', 'Hearing distance'),
          help: t(
            'So weit hört man andere ohne Gruppe. Gilt nach dem nächsten Neustart eines Servers.',
            'How far you hear others without a group. Applies after the next restart of a server.',
          ),
          command: '/voiceconfig weite <bloecke>',
        },
      ],
    },
  ],
};

export const SOCIAL_AREA: SettingArea = {
  id: 'social',
  title: t('Freunde & Party', 'Friends & party'),
  text: t(
    'Freundesliste und Party gelten auf allen Servern.',
    'Friends list and party work on every server.',
  ),
  icon: 'Users',
  panel: 'settings',
  sections: [
    {
      id: 'friends',
      title: t('Freunde', 'Friends'),
      settings: [
        {
          key: 'maxFriends',
          type: 'number',
          default: 100,
          min: 5,
          max: 500,
          unit: players,
          label: t('Freunde höchstens', 'Friends at most'),
          help: t('Pro Spieler.', 'Per player.'),
          command: '/netzwerk freunde <zahl>',
        },
      ],
    },
    {
      id: 'party',
      title: t('Party', 'Party'),
      settings: [
        {
          key: 'partySize',
          type: 'number',
          default: 8,
          min: 2,
          max: 16,
          unit: players,
          label: t('Party-Größe', 'Party size'),
          help: t('So viele dürfen in eine Party.', 'This many fit into a party.'),
          command: '/netzwerk party <zahl>',
        },
        {
          key: 'partySizeVip',
          type: 'number',
          default: 12,
          min: 2,
          max: 24,
          unit: players,
          label: t('Party-Größe für VIP', 'Party size for VIP'),
          help: t('Für Spieler mit dem Recht „größere Party“.', 'For players with the right “bigger party”.'),
          command: '/netzwerk partyvip <zahl>',
        },
        {
          key: 'partyFollow',
          type: 'boolean',
          default: true,
          label: t('Party folgt dem Anführer', 'Party follows the leader'),
          help: t(
            'Wechselt der Anführer den Server, kommen alle mit.',
            'When the leader switches server, everyone comes along.',
          ),
          command: '/netzwerk partyfolgen an|aus',
        },
      ],
    },
  ],
};

export const LOBBY_AREA: SettingArea = {
  id: 'lobby',
  title: t('Lobby', 'Lobby'),
  text: t(
    'Begrüßung, Ankündigungen, Saison-Deko und was in der Lobby erlaubt ist.',
    'Welcome, announcements, seasonal decoration and what the lobby allows.',
  ),
  icon: 'Castle',
  panel: 'lobby',
  sections: [
    {
      id: 'welcome',
      title: t('Begrüßung', 'Welcome'),
      settings: [
        {
          key: 'welcomeTitle',
          type: 'text',
          default: 'Servus in MoinMorni!',
          maxLength: 40,
          label: t('Titel beim Betreten', 'Title on join'),
          help: t('Groß in der Mitte des Bildschirms.', 'Big in the middle of the screen.'),
          command: '/lobby titel <text>',
        },
        {
          key: 'welcomeSubtitle',
          type: 'text',
          default: 'Klick auf eine Figur, um zu spielen',
          maxLength: 60,
          label: t('Untertitel', 'Subtitle'),
          help: t('Kleiner darunter.', 'Smaller below.'),
          command: '/lobby untertitel <text>',
        },
        {
          key: 'tourForNewPlayers',
          type: 'boolean',
          default: true,
          label: t('Rundgang für neue Spieler', 'Tour for new players'),
          help: t(
            'Beim ersten Betreten eine kurze Führung durchs Dorf.',
            'A short tour through the village on first join.',
          ),
          command: '/lobby rundgang an|aus',
        },
      ],
    },
    {
      id: 'announcements',
      title: t('Ankündigungen', 'Announcements'),
      settings: [
        {
          key: 'announcements',
          type: 'list',
          default: ['Neu: Morni Party mit drei Spielfeldern!', 'Tritt unserem Discord bei: /discord'],
          maxItems: 20,
          maxLength: 120,
          label: t('Ankündigungen', 'Announcements'),
          help: t(
            'Laufen der Reihe nach über die Leiste oben.',
            'Run one after another in the bar at the top.',
          ),
          command: '/lobby ankuendigung hinzu|weg <text>',
        },
        {
          key: 'announcementSeconds',
          type: 'number',
          default: 20,
          min: 5,
          max: 300,
          unit: seconds,
          label: t('Wechsel alle', 'Change every'),
          help: t('So lange steht eine Ankündigung da.', 'How long one announcement stays.'),
          command: '/lobby wechsel <sekunden>',
        },
      ],
    },
    {
      id: 'season',
      title: t('Saison-Deko', 'Seasonal decoration'),
      settings: [
        {
          key: 'season',
          type: 'select',
          default: 'none',
          options: [
            { value: 'none', label: t('Keine', 'None') },
            { value: 'wiesn', label: t('Wiesn', 'Oktoberfest') },
            { value: 'winter', label: t('Winter & Weihnachten', 'Winter & Christmas') },
            { value: 'easter', label: t('Ostern', 'Easter') },
            { value: 'halloween', label: t('Halloween', 'Halloween') },
          ],
          label: t('Deko', 'Decoration'),
          help: t(
            'Schaltet die passende Deko in der Lobby ein.',
            'Switches the matching decoration on in the lobby.',
          ),
          command: '/lobby saison <keine|wiesn|winter|ostern|halloween>',
        },
      ],
    },
    {
      id: 'daytime',
      title: t('Tageszeit', 'Time of day'),
      settings: [
        {
          key: 'daytime',
          type: 'select',
          default: 'real',
          options: [
            { value: 'real', label: t('Wie in echt (Sonne und Mond)', 'Like real life (sun and moon)') },
            { value: 'morning', label: t('Immer Morgen', 'Always morning') },
            { value: 'day', label: t('Immer Mittag', 'Always noon') },
            { value: 'evening', label: t('Immer Abendrot', 'Always sunset') },
            { value: 'night', label: t('Immer Nacht', 'Always night') },
          ],
          label: t('Tageszeit in der Lobby', 'Time of day in the lobby'),
          help: t(
            'Wie in echt: Sonnenaufgang, Sonnenuntergang und Mondphase wie heute in Bayern – um 20 Uhr im Winter ist es Nacht, im Sommer noch hell.',
            'Like real life: sunrise, sunset and moon phase as today in Bavaria – at 8 pm it is night in winter and still light in summer.',
          ),
          command: '/lobby tageszeit <echt|morgen|mittag|abend|nacht>',
        },
      ],
    },
    {
      id: 'moebel',
      title: t('Möbel-Paket', 'Furniture pack'),
      settings: [
        {
          key: 'packRequired',
          type: 'boolean',
          default: false,
          label: t('Möbel-Paket verpflichtend', 'Furniture pack required'),
          help: t(
            'Stühle, Eckbänke, Tische, Bierbänke und Steinkrüge in der Lobby sind eigene 3D-Modelle aus einem kleinen Ressourcenpaket. Aus: Java-Spieler werden beim Betreten gefragt; wer ablehnt (oder auf Bedrock spielt), sieht einfache Holzstufen. An: ohne Paket kein Zutritt zur Lobby. Gilt, sobald die Lobby leer ist und neu startet (macht MoinMorni von selbst).',
            'Chairs, corner benches, tables, beer benches and stone mugs in the lobby are our own 3D models from a small resource pack. Off: Java players are asked when they join; whoever declines (or plays Bedrock) sees simple wooden stairs. On: no pack, no lobby. Applies once the lobby is empty and restarts (MoinMorni does that by itself).',
          ),
          command: '/lobby paket an|aus',
        },
      ],
    },
    {
      id: 'fun',
      title: t('Spaß in der Lobby', 'Fun in the lobby'),
      settings: [
        {
          key: 'launchpads',
          type: 'boolean',
          default: true,
          label: t('Launchpads', 'Launch pads'),
          help: t(
            'Goldene Platten schleudern Spieler durch die Luft.',
            'Golden plates launch players through the air.',
          ),
          command: '/lobby launchpads an|aus',
        },
        {
          key: 'parkour',
          type: 'boolean',
          default: true,
          label: t('Lobby-Parkour', 'Lobby parkour'),
          help: t('Mit Zeitmessung und Bestenliste.', 'With timing and leaderboard.'),
          command: '/lobby parkour an|aus',
        },
        {
          key: 'walkers',
          type: 'number',
          default: 12,
          min: 0,
          max: 40,
          label: t('Dorfbewohner, die herumlaufen', 'Villagers walking around'),
          help: t(
            'Figuren, die durchs Dorf spazieren (0 = keine).',
            'Figures strolling through the village (0 = none).',
          ),
          command: '/lobby bewohner <zahl>',
        },
      ],
    },
  ],
};

/** Alle Bereiche; die Modi hängen ihre eigenen an. */
const DEFAULT_RULES_DE = [
  'Freundlich bleiben: keine Beleidigungen, kein Mobbing, keine Hetze.',
  'Kein Cheaten: keine Hacks, Fly-, X-Ray- oder Auto-Clicker-Mods.',
  'Kein Spam und keine Werbung für andere Server.',
  'Keine Bugs ausnutzen – melde sie uns.',
  'Höre auf das Team. Fragen? Ticket im Discord.',
].join('\n');
const DEFAULT_RULES_EN = [
  'Be kind: no insults, no bullying, no hate.',
  'No cheating: no hacks, fly, x-ray or auto-clicker mods.',
  'No spam and no ads for other servers.',
  "Don't abuse bugs – report them to us.",
  'Listen to the team. Questions? Open a ticket on Discord.',
].join('\n');

export const WEBSITE_AREA: SettingArea = {
  id: 'website',
  title: t('Webseite', 'Website'),
  text: t(
    'Was auf moinmorni.net steht: Regeln, Discord-Einladung, Kanäle in sozialen Netzen.',
    'What moinmorni.net shows: rules, Discord invite, social media channels.',
  ),
  icon: 'Globe2',
  panel: 'content',
  sections: [
    {
      id: 'rules',
      title: t('Regeln', 'Rules'),
      text: t(
        'Eine Regel pro Zeile. Gilt im Spiel, im Discord und auf der Webseite.',
        'One rule per line. Applies in game, on Discord and on the website.',
      ),
      settings: [
        {
          key: 'rulesDe',
          type: 'text',
          default: DEFAULT_RULES_DE,
          maxLength: 4000,
          multiline: true,
          label: t('Regeln (Deutsch)', 'Rules (German)'),
          help: t(
            'So stehen sie auf der Webseite unter „Regeln“.',
            'This is how they appear on the website under “Rules”.',
          ),
        },
        {
          key: 'rulesEn',
          type: 'text',
          default: DEFAULT_RULES_EN,
          maxLength: 4000,
          multiline: true,
          label: t('Regeln (Englisch)', 'Rules (English)'),
          help: t('Für Besucher mit englischem Browser.', 'For visitors with an English browser.'),
        },
      ],
    },
    {
      id: 'links',
      title: t('Links', 'Links'),
      settings: [
        {
          key: 'discordInvite',
          type: 'text',
          default: '',
          maxLength: 200,
          label: t('Discord-Einladung', 'Discord invite'),
          help: t(
            'Leer lassen: der Bot legt beim Einrichten selbst eine Einladung an, die nie abläuft.',
            'Leave empty: the bot creates a never-expiring invite when setting up the server.',
          ),
        },
        {
          key: 'youtube',
          type: 'text',
          default: '',
          maxLength: 200,
          label: t('YouTube', 'YouTube'),
          help: t('Adresse des Kanals (leer = nicht zeigen).', 'Channel address (empty = hide).'),
        },
        {
          key: 'tiktok',
          type: 'text',
          default: '',
          maxLength: 200,
          label: t('TikTok', 'TikTok'),
          help: t('Adresse des Kanals (leer = nicht zeigen).', 'Channel address (empty = hide).'),
        },
        {
          key: 'instagram',
          type: 'text',
          default: '',
          maxLength: 200,
          label: t('Instagram', 'Instagram'),
          help: t('Adresse des Profils (leer = nicht zeigen).', 'Profile address (empty = hide).'),
        },
      ],
    },
  ],
};

const on = (
  key: string,
  de: string,
  en: string,
  helpDe: string,
  helpEn: string,
  command: string,
  value = true,
): SettingDef => ({
  key,
  type: 'boolean',
  default: value,
  label: t(de, en),
  help: t(helpDe, helpEn),
  command,
});
const hours = t('Stunden', 'hours');
const percent = t('Prozent', 'percent');
/** Begrenzung eines Befehls: so oft (0 = unbegrenzt) pro so viele Stunden. */
const limit = (cmd: string, word: string): SettingDef[] => [
  {
    key: `${cmd}Limit`,
    type: 'number',
    default: 0,
    min: 0,
    max: 50,
    label: t(`/${cmd}: wie oft`, `/${cmd}: how often`),
    help: t(
      `Wie oft jeder /${cmd} im Zeitraum darunter benutzen darf. 0 = so oft er will. Das Team ist frei.`,
      `How often everyone may use /${cmd} in the period below. 0 = as often as they like. The team is free.`,
    ),
    command: `/mornicraft grenze ${word} <zahl>`,
  },
  {
    key: `${cmd}LimitHours`,
    type: 'number',
    default: 24,
    min: 1,
    max: 168,
    unit: hours,
    label: t(`/${cmd}: Zeitraum`, `/${cmd}: period`),
    help: t(
      'In wie vielen Stunden die Anzahl darüber gilt (24 = am Tag, 168 = in der Woche).',
      'Within how many hours the number above applies (24 = per day, 168 = per week).',
    ),
    command: `/mornicraft grenze ${word}-zeit <stunden>`,
  },
];

/**
 * MorniCraft selbst (das Plugin auf dem MorniCraft-Server): dieselben Einstellungen wie im MorniCraft-Dashboard von
 * MorniHosting. Der Hub schickt sie dem Server (`mornicraft-settings`), das Plugin übernimmt sie sofort.
 */
const MORNICRAFT_GAME_SECTIONS: readonly SettingSection[] = [
  {
    id: 'teleports',
    title: t('Teleports & Zuhause', 'Teleports & homes'),
    settings: [
      {
        key: 'teleportDelay',
        type: 'number',
        default: 5,
        min: 0,
        max: 30,
        unit: seconds,
        label: t('Stillstehen vor dem Teleport', 'Stand still before teleporting'),
        help: t(
          'So lange müssen Spieler bei /spawn, /home, /tpa und /back stillstehen; wer sich bewegt oder Schaden bekommt, bricht ab. 0 = sofort. Das Team reist immer sofort.',
          'Players have to stand still this long for /spawn, /home, /tpa and /back; moving or taking damage cancels it. 0 = at once. The team always travels at once.',
        ),
        command: '/mornicraft teleport warten <sekunden>',
      },
      on(
        'spawnCommand',
        '/spawn',
        '/spawn',
        'Zurück zur Spawn-Insel mit /spawn.',
        'Back to the spawn island with /spawn.',
        '/mornicraft befehl spawn an|aus',
      ),
      on(
        'homes',
        'Zuhause (/sethome, /home)',
        'Homes (/sethome, /home)',
        'Eigene Orte merken und hinreisen. Die Clan-Basis zählt auch als Zuhause.',
        'Remember own places and travel there. The clan base counts as a home too.',
        '/mornicraft befehl home an|aus',
      ),
      {
        key: 'maxHomes',
        type: 'number',
        default: 5,
        min: 1,
        max: 50,
        label: t('Zuhause pro Spieler', 'Homes per player'),
        help: t(
          'So viele Zuhause darf jeder speichern (das Team unbegrenzt).',
          'This many homes everyone may save (the team without limit).',
        ),
        command: '/mornicraft zuhause <zahl>',
      },
      on(
        'tpa',
        'Teleport-Anfragen (/tpa)',
        'Teleport requests (/tpa)',
        'Zu Freunden reisen, wenn sie zustimmen.',
        'Travel to friends when they agree.',
        '/mornicraft befehl tpa an|aus',
      ),
      on(
        'back',
        '/back',
        '/back',
        'Zurück zum letzten Ort – auch nach dem Tod.',
        'Back to the last place – also after dying.',
        '/mornicraft befehl back an|aus',
      ),
    ],
  },
  {
    id: 'limits',
    title: t('Begrenzungen', 'Limits'),
    text: t(
      'Damit Teleports etwas Besonderes bleiben: z. B. /spawn einmal pro Stunde oder dreimal am Tag.',
      'So teleports stay something special: e.g. /spawn once an hour or three times a day.',
    ),
    settings: [
      ...limit('spawn', 'spawn'),
      ...limit('home', 'home'),
      ...limit('tpa', 'tpa'),
      ...limit('back', 'back'),
    ],
  },
  {
    id: 'spawn',
    title: t('Spawn-Insel', 'Spawn island'),
    settings: [
      on(
        'spawnProtection',
        'Spawn geschützt',
        'Spawn protected',
        'Niemand außer dem Bauteam baut an der Spawn-Insel und den Nebeninseln etwas ab oder an.',
        'Nobody but the build team breaks or places anything on the spawn island and the small islands.',
        '/mornicraft spawn schutz an|aus',
      ),
      {
        key: 'spawnRadius',
        type: 'number',
        default: 55,
        min: 10,
        max: 200,
        unit: blocks,
        label: t('Größe des geschützten Spawns', 'Size of the protected spawn'),
        help: t(
          'Radius um den Spawn, in dem der Schutz gilt.',
          'Radius around the spawn where the protection applies.',
        ),
        command: '/mornicraft spawn radius <blöcke>',
      },
      on(
        'sleepAtSpawn',
        'Schlafen am Spawn',
        'Sleeping at the spawn',
        'Betten am Spawn benutzen (aus = niemand setzt dort seinen Spawnpunkt).',
        'Use beds at the spawn (off = nobody sets their spawn point there).',
        '/mornicraft spawn schlafen an|aus',
        false,
      ),
      on(
        'pvpAtSpawn',
        'Kämpfen am Spawn',
        'Fighting at the spawn',
        'Spieler können sich am Spawn gegenseitig schlagen.',
        'Players can hit each other at the spawn.',
        '/mornicraft spawn pvp an|aus',
        false,
      ),
      on(
        'welcome',
        'Begrüßung',
        'Welcome',
        'Beim ersten Betreten: großer Titel und eine Karte mit den wichtigsten Knöpfen.',
        'On the first visit: a big title and a card with the most important buttons.',
        '/mornicraft begruessung an|aus',
      ),
    ],
  },
  {
    id: 'elytra',
    title: t('Start-Elytra', 'Start elytra'),
    settings: [
      on(
        'elytra',
        'Start-Elytra',
        'Start elytra',
        'Am Spawn zweimal springen = Flügel an, gleiten. Fallschaden gibt es dabei nicht.',
        'Jump twice at the spawn = wings on, glide. No fall damage while doing it.',
        '/mornicraft elytra an|aus',
      ),
      {
        key: 'elytraRadius',
        type: 'number',
        default: 45,
        min: 10,
        max: 200,
        unit: blocks,
        label: t('Wo die Start-Elytra geht', 'Where the start elytra works'),
        help: t(
          'Radius um den Spawn, in dem man abheben kann.',
          'Radius around the spawn where you can take off.',
        ),
        command: '/mornicraft elytra radius <blöcke>',
      },
      on(
        'elytraBoost',
        'Schub nach vorn',
        'Boost forward',
        'Beim Gleiten mit F (Hand tauschen) oder Schleichen einmal nach vorn schießen.',
        'While gliding, shoot forward once with F (swap hands) or sneaking.',
        '/mornicraft elytra schub an|aus',
      ),
    ],
  },
  {
    id: 'world',
    title: t('Welt', 'World'),
    settings: [
      on(
        'tnt',
        'TNT',
        'TNT',
        'TNT explodiert (aus = es zischt nur).',
        'TNT explodes (off = it only hisses).',
        '/mornicraft welt tnt an|aus',
      ),
      on(
        'creeperDamage',
        'Creeper zerstören Blöcke',
        'Creepers break blocks',
        'Aus: Creeper tun noch weh, machen aber keine Löcher.',
        'Off: creepers still hurt, but make no holes.',
        '/mornicraft welt creeper an|aus',
      ),
      on(
        'fireSpread',
        'Feuer breitet sich aus',
        'Fire spreads',
        'Aus: Feuer brennt, springt aber nicht auf Häuser über.',
        'Off: fire burns but does not jump onto houses.',
        '/mornicraft welt feuer an|aus',
      ),
      on(
        'endermanGrief',
        'Endermen nehmen Blöcke',
        'Endermen take blocks',
        'Aus: Endermen tragen nichts mehr weg.',
        'Off: endermen no longer carry blocks away.',
        '/mornicraft welt endermen an|aus',
      ),
    ],
  },
  {
    id: 'fights',
    title: t('Kampf, Gräber, Sitzen', 'Fights, graves, sitting'),
    settings: [
      {
        key: 'combatSeconds',
        type: 'number',
        default: 15,
        min: 0,
        max: 60,
        unit: seconds,
        label: t('Im Kampf nach einem Treffer', 'In combat after a hit'),
        help: t(
          'So lange gelten zwei Spieler nach einem Treffer als im Kampf: kein Teleport, keine Start-Elytra; wer sich ausloggt, stirbt. 0 = aus.',
          'This long two players count as in combat after a hit: no teleport, no start elytra; logging out means dying. 0 = off.',
        ),
        command: '/mornicraft kampf <sekunden>',
      },
      on(
        'graves',
        'Gräber',
        'Graves',
        'Wer stirbt, bekommt ein Grab mit allen Sachen – statt dass alles herumliegt.',
        'Whoever dies gets a grave with all their things – instead of everything lying around.',
        '/mornicraft graeber an|aus',
      ),
      on(
        'sit',
        'Sitzen',
        'Sitting',
        'Rechtsklick mit leerer Hand auf eine Treppe oder Stufe = hinsetzen.',
        'Right click with an empty hand on stairs or a slab = sit down.',
        '/mornicraft sitzen an|aus',
      ),
    ],
  },
  {
    id: 'clans',
    title: t('Clans', 'Clans'),
    settings: [
      on(
        'clans',
        'Clans',
        'Clans',
        'Jeder kann mit /clan einen Clan gründen: Kürzel vor dem Namen, Clan-Chat, Clan-Basis.',
        'Everyone can found a clan with /clan: tag before the name, clan chat, clan base.',
        '/mornicraft clans an|aus',
      ),
      {
        key: 'clanMaxMembers',
        type: 'number',
        default: 10,
        min: 2,
        max: 50,
        unit: players,
        label: t('Mitglieder pro Clan', 'Members per clan'),
        help: t('So viele dürfen höchstens in einem Clan sein.', 'At most this many can be in one clan.'),
        command: '/mornicraft clan mitglieder <zahl>',
      },
    ],
  },
  {
    id: 'display',
    title: t('Anzeige', 'Display'),
    settings: [
      on(
        'sidebar',
        'Leiste rechts',
        'Bar on the right',
        'Uhrzeit, Tag, Rang, Spieler online, Ping und Befehle. Jeder kann sie mit /leiste für sich ausblenden.',
        'Time, day, rank, players online, ping and commands. Everyone can hide it for themselves with /leiste.',
        '/mornicraft leiste an|aus',
      ),
      on(
        'tabStats',
        'Kills und Tode in der Tab-Liste',
        'Kills and deaths in the tab list',
        'Neben jedem Namen: ⚔ Kills und ☠ Tode.',
        'Next to every name: ⚔ kills and ☠ deaths.',
        '/mornicraft tab an|aus',
      ),
    ],
  },
  {
    id: 'dragon',
    title: t('Enderdrache', 'Ender dragon'),
    settings: [
      on(
        'hardDragon',
        'Mächtiger Enderdrache',
        'Mighty ender dragon',
        'Mehr Leben, härtere Treffer, eigene Angriffe – ein Kampf für die ganze Gruppe.',
        'More health, harder hits, own attacks – a fight for the whole group.',
        '/mornicraft drache an|aus',
      ),
      {
        key: 'dragonHealth',
        type: 'number',
        default: 600,
        min: 200,
        max: 3000,
        label: t('Leben', 'Health'),
        help: t('Normal hat er 200.', 'Normally it has 200.'),
        command: '/mornicraft drache leben <zahl>',
      },
      {
        key: 'dragonDamage',
        type: 'number',
        default: 175,
        min: 100,
        max: 400,
        unit: percent,
        label: t('Treffer-Stärke', 'Hit strength'),
        help: t('100 = wie normal, 200 = doppelt so stark.', '100 = as normal, 200 = twice as strong.'),
        command: '/mornicraft drache staerke <prozent>',
      },
      {
        key: 'dragonAttackSeconds',
        type: 'number',
        default: 12,
        min: 5,
        max: 60,
        unit: seconds,
        label: t('Sonderangriff alle', 'Special attack every'),
        help: t(
          'Wie oft er einen seiner Angriffe macht (in Wut doppelt so oft).',
          'How often it does one of its attacks (twice as often when enraged).',
        ),
        command: '/mornicraft drache takt <sekunden>',
      },
      {
        key: 'dragonRagePercent',
        type: 'number',
        default: 25,
        min: 0,
        max: 75,
        unit: percent,
        label: t('Wut ab', 'Rage from'),
        help: t(
          'Unter so viel Prozent Leben wird er wütend (lila, schneller, neue Endkristalle). 0 = nie.',
          'Below this share of health it gets enraged (purple, faster, new end crystals). 0 = never.',
        ),
        command: '/mornicraft drache wut <prozent>',
      },
      {
        key: 'dragonXp',
        type: 'number',
        default: 3000,
        min: 0,
        max: 20000,
        label: t('Extra-Erfahrung', 'Extra experience'),
        help: t(
          'Fällt beim Sieg zusätzlich am Ausgangsportal.',
          'Drops in addition at the exit portal when it is beaten.',
        ),
        command: '/mornicraft drache xp <zahl>',
      },
    ],
  },
  {
    id: 'dragon-attacks',
    title: t('Angriffe des Drachen', 'Attacks of the dragon'),
    text: t('Gelten nur mit dem mächtigen Enderdrachen.', 'Only with the mighty ender dragon.'),
    settings: [
      on(
        'dragonBrood',
        'Drachenbrut',
        'Dragon brood',
        'Bei ¾, ½ und ¼ Leben kommen Phantome.',
        'At ¾, ½ and ¼ health phantoms come.',
        '/mornicraft angriff brut an|aus',
      ),
      on(
        'dragonLightning',
        'Blitze',
        'Lightning',
        'Funken am Boden, kurz danach schlägt es ein.',
        'Sparks on the ground, a moment later it strikes.',
        '/mornicraft angriff blitze an|aus',
      ),
      on(
        'dragonFireballs',
        'Feuerregen',
        'Fire rain',
        'Kleine Feuerbälle regnen auf die Spieler.',
        'Small fireballs rain on the players.',
        '/mornicraft angriff feuer an|aus',
      ),
      on(
        'dragonFangs',
        'Bodenzähne',
        'Ground fangs',
        'Aus dem Boden schnappen Zähne (Rauch warnt vorher).',
        'Fangs snap out of the ground (smoke warns before).',
        '/mornicraft angriff zaehne an|aus',
      ),
      on(
        'dragonEndermen',
        'Endermen',
        'Endermen',
        'Er ruft Endermen, die angreifen.',
        'It calls endermen that attack.',
        '/mornicraft angriff endermen an|aus',
      ),
      on(
        'dragonLevitation',
        'Schwebe-Geschosse',
        'Levitation shots',
        'Wer getroffen wird, schwebt kurz nach oben.',
        'Whoever is hit floats up for a moment.',
        '/mornicraft angriff schweben an|aus',
      ),
      on(
        'dragonShockwave',
        'Flügelschlag',
        'Wing beat',
        'Stößt alle in der Nähe weg.',
        'Pushes everyone nearby away.',
        '/mornicraft angriff fluegel an|aus',
      ),
      on(
        'dragonCrystals',
        'Neue Endkristalle in Wut',
        'New end crystals when enraged',
        'In Wut wachsen drei Endkristalle nach.',
        'When enraged three end crystals grow back.',
        '/mornicraft angriff kristalle an|aus',
      ),
      on(
        'dragonEgg',
        'Drachenei bei jedem Sieg',
        'Dragon egg at every win',
        'Nicht nur beim ersten Mal.',
        'Not only the first time.',
        '/mornicraft angriff ei an|aus',
      ),
    ],
  },
];

export const MORNICRAFT_AREA: SettingArea = {
  id: 'mornicraft',
  title: t('MorniCraft', 'MorniCraft'),
  text: t(
    'MorniCraft ist nur auf Einladung: Wer auf der Whitelist steht, kommt hinein. Bewerben geht über die Webseite (mit Discord-Anmeldung) und im Discord. Darunter alles, was MorniCraft im Spiel macht – Änderungen gelten sofort, ohne Neustart. Ränge, Chat und Strafen kommen vom Netzwerk.',
    'MorniCraft is invitation only: whoever is on the whitelist gets in. Applying works on the website (with Discord sign-in) and in Discord. Below everything MorniCraft does in the game – changes apply at once, without a restart. Ranks, chat and punishments come from the network.',
  ),
  icon: 'Pickaxe',
  panel: 'modes',
  sections: [
    {
      id: 'applications',
      title: t('Bewerbungen', 'Applications'),
      settings: [
        {
          key: 'applicationsOpen',
          type: 'boolean',
          default: true,
          label: t('Bewerbungen offen', 'Applications open'),
          help: t(
            'Aus: Webseite und Discord sagen freundlich, dass gerade keine Bewerbungen angenommen werden.',
            'Off: website and Discord say kindly that no applications are taken right now.',
          ),
          command: '/mornicraft bewerbungen an|aus',
        },
        {
          key: 'acceptMessage',
          type: 'text',
          default: '',
          maxLength: 300,
          label: t('Nachricht bei Zusage', 'Message on acceptance'),
          help: t(
            'Bekommt, wer angenommen wurde (Discord und im Spiel). Leer = eine freundliche Standard-Nachricht.',
            'Sent to accepted players (Discord and in game). Empty = a friendly default message.',
          ),
        },
      ],
    },
    ...MORNICRAFT_GAME_SECTIONS,
  ],
};

export const BUILD_AREA: SettingArea = {
  id: 'build',
  title: t('Bau-Server', 'Build server'),
  text: t(
    'Kreativ-Server fürs Bauteam: flache Welt, friedlich, WorldEdit. Hinein kommt nur, wer das Recht „Bauen“ hat (/bau). Mit //schem save gespeicherte Bauten kopierst du im Panel unter Bau-Server in einen Modus.',
    'Creative server for the build team: flat world, peaceful, WorldEdit. Only players with the right “build” get in (/bau). Builds saved with //schem save can be copied into a mode in the panel under Build server.',
  ),
  icon: 'Hammer',
  panel: 'build',
  sections: [
    {
      id: 'server',
      title: t('Server', 'Server'),
      settings: [
        {
          key: 'sleepWhenEmpty',
          type: 'boolean',
          default: false,
          label: t('Schlafen, wenn niemand baut', 'Sleep when nobody is building'),
          help: t(
            'Aus: Der Bau-Server ist immer online und braucht ohne Spieler kaum Arbeitsspeicher. An: Er geht ganz aus (gar kein Arbeitsspeicher), /bau weckt ihn wieder – das dauert etwa eine halbe Minute.',
            'Off: the build server is always online and needs hardly any memory without players. On: it shuts down completely (no memory at all), /bau wakes it up again – that takes about half a minute.',
          ),
          command: '/bauserver schlafen an|aus',
        },
      ],
    },
  ],
};

/**
 * Erreichbarkeit: NetBird (Domain, Webseite, Proxy direkt auf der Domain, „Hausanschluss verstecken“) richtet der
 * Motor ein – die Karten dafür kommen aus MorniHosting und stehen über den Einstellungen. Hier nur, ob seine Meldungen
 * im Discord-Team-Log landen.
 */
export const REACH_AREA: SettingArea = {
  id: 'reach',
  title: t('Erreichbarkeit', 'Reachability'),
  text: t(
    'Wie Spieler und Besucher MoinMorni erreichen: über NetBird, mit HTTPS, ohne Portfreigabe zu Hause – und ohne dass irgendwo die IP deines Hausanschlusses auftaucht.',
    'How players and visitors reach MoinMorni: through NetBird, with HTTPS, without opening ports at home – and without your home IP showing up anywhere.',
  ),
  icon: 'Network',
  panel: 'settings',
  sections: [
    {
      id: 'alerts',
      title: t('Meldungen', 'Alerts'),
      settings: [
        {
          key: 'teamLogAlerts',
          type: 'boolean',
          default: true,
          label: t('Probleme im Discord-Team-Log melden', 'Report problems in the Discord team log'),
          help: t(
            'Wenn der Motor oder sein Wächter etwas bemerkt (NetBird getrennt, Hausanschluss nicht mehr versteckt, DNS, Docker, ein Server startet nicht …), steht es im Team-Log – mit „behebt sich selbst“ oder was zu tun ist. Ist es behoben, kommt eine kurze Entwarnung.',
            'When the engine or its watchdog notices something (NetBird disconnected, home connection no longer hidden, DNS, Docker, a server does not start …), it goes to the team log – saying whether it fixes itself or what to do. Once fixed, a short all-clear follows.',
          ),
        },
      ],
    },
  ],
};

export const UPDATES_AREA: SettingArea = {
  id: 'updates',
  title: t('Updates', 'Updates'),
  text: t(
    'MoinMorni hält sich selbst aktuell: vorher eine Sicherung, klappt etwas nicht, geht es zurück auf den alten Stand. Die Minecraft-Server laufen weiter.',
    'MoinMorni keeps itself up to date: a backup first, and if something goes wrong it goes back to the old version. The Minecraft servers keep running.',
  ),
  icon: 'RefreshCw',
  panel: 'updates',
  sections: [
    {
      id: 'auto',
      title: t('Automatisch', 'Automatic'),
      settings: [
        {
          key: 'auto',
          type: 'boolean',
          default: true,
          label: t('Updates automatisch einspielen', 'Install updates automatically'),
          help: t(
            'Einmal am Tag zur gewählten Stunde, wenn es etwas Neues gibt. Das Team bekommt in Discord Bescheid.',
            'Once a day at the chosen hour, when there is something new. The team gets a message in Discord.',
          ),
          command: '/updates auto an|aus',
        },
        {
          key: 'hour',
          type: 'number',
          default: 4,
          min: 0,
          max: 23,
          unit: t('Uhr', 'o’clock'),
          label: t('Uhrzeit', 'Time'),
          help: t(
            'Stunde, in der das Update läuft (Zeit des Servers).',
            'Hour in which the update runs (server time).',
          ),
          command: '/updates uhrzeit <stunde>',
        },
        {
          key: 'whenEmpty',
          type: 'boolean',
          default: true,
          label: t('Nur wenn niemand spielt', 'Only when nobody is playing'),
          help: t(
            'Sind gerade Spieler online, wartet das Update bis zum nächsten Tag.',
            'If players are online, the update waits until the next day.',
          ),
          command: '/updates leer an|aus',
        },
      ],
    },
    {
      id: 'motor',
      title: t('Motor (MorniHosting)', 'Engine (MorniHosting)'),
      settings: [
        {
          key: 'motorFollowMain',
          type: 'boolean',
          default: false,
          label: t('Motor immer auf den neuesten Stand', 'Always the newest engine'),
          help: t(
            'Aus: der Motor kommt in der Fassung, die zu MoinMorni passt (empfohlen). An: bei jedem Update auch die neueste Fassung von MorniHosting – klappt sie nicht, geht es zurück.',
            'Off: the engine comes in the version that fits MoinMorni (recommended). On: every update also takes the newest MorniHosting – if it fails, it goes back.',
          ),
          command: '/updates motor an|aus',
        },
      ],
    },
  ],
};

/** Alle Bereiche: erst das Netzwerk, dann die Spielmodi in der Reihenfolge der Lobby, dann Bau-Server und Updates. */
export const SETTING_AREAS: readonly SettingArea[] = [
  NETWORK_AREA,
  CHAT_AREA,
  VOICE_AREA,
  SOCIAL_AREA,
  LOBBY_AREA,
  WEBSITE_AREA,
  MORNICRAFT_AREA,
  ...MODE_SETTING_AREAS,
  BUILD_AREA,
  REACH_AREA,
  UPDATES_AREA,
];

/** Kleinste Abweichung, die bei Kommazahlen noch als „liegt auf dem Raster“ gilt (0.1 + 0.2 ist nicht genau 0.3). */
const STEP_TOLERANCE = 1e-9;

/** Liegt der Wert auf dem Raster der Einstellung? Ohne Schrittweite: ganze Zahl. */
export function onStep(value: number, step = 1): boolean {
  const steps = value / step;
  return Number.isFinite(steps) && Math.abs(steps - Math.round(steps)) < STEP_TOLERANCE;
}

function validator(def: SettingDef): z.ZodType {
  const kinds: { [K in SettingDef['type']]: (d: Extract<SettingDef, { type: K }>) => z.ZodType } = {
    boolean: () => z.boolean(),
    number: (d) =>
      z
        .number()
        .min(d.min)
        .max(d.max)
        .refine((v) => onStep(v, d.step)),
    text: (d) => z.string().max(d.maxLength),
    select: (d) => z.enum(d.options.map((o) => o.value) as [string, ...string[]]),
    list: (d) => z.array(z.string().trim().min(1).max(d.maxLength)).max(d.maxItems),
  };
  return (kinds[def.type] as (d: SettingDef) => z.ZodType)(def);
}

export function settingsOf(area: SettingArea): readonly SettingDef[] {
  return area.sections.flatMap((s) => s.settings);
}

/** Schema für Änderungen an einem Bereich (alle Schlüssel freiwillig, unbekannte abgelehnt). */
export function patchSchemaFor(area: SettingArea): z.ZodType<Record<string, unknown>> {
  return z.strictObject(
    Object.fromEntries(settingsOf(area).map((d) => [d.key, validator(d).optional()])),
  ) as z.ZodType<Record<string, unknown>>;
}

export function defaultsFor(area: SettingArea): Record<string, unknown> {
  return Object.fromEntries(settingsOf(area).map((d) => [d.key, d.default]));
}

export function areaById(id: string): SettingArea | undefined {
  return SETTING_AREAS.find((a) => a.id === id);
}

/** Der Einstellungs-Bereich eines Spielmodus (über die Kennung des Modus, z. B. "mirni"). */
export function modeAreaOf(modeId: string): SettingArea | undefined {
  return SETTING_AREAS.find((a) => a.mode?.id === modeId);
}
