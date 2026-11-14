/* eslint-disable ts-patterns/no-magic-numbers -- a settings catalog: defaults and limits as the game needs them */
import { z } from 'zod';
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

interface Base {
  readonly key: string;
  readonly label: Text;
  readonly help: Text;
  /** Befehl im Spiel, der denselben Wert ändert (im Panel als Hinweis gezeigt). */
  readonly command?: string;
}

export type SettingDef =
  | (Base & { readonly type: 'boolean'; readonly default: boolean })
  | (Base & {
      readonly type: 'number';
      readonly default: number;
      readonly min: number;
      readonly max: number;
      readonly unit?: Text;
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
            'Ist so lange niemand in einem Modus, schläft sein Server und spart Speicher. Wer hinein will, weckt ihn auf (dauert etwa eine halbe Minute).',
            'When nobody is in a mode for this long, its server sleeps and saves memory. Whoever wants in wakes it up (takes about half a minute).',
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

export const SETTING_AREAS: readonly SettingArea[] = [
  NETWORK_AREA,
  CHAT_AREA,
  VOICE_AREA,
  SOCIAL_AREA,
  LOBBY_AREA,
  WEBSITE_AREA,
  UPDATES_AREA,
];

function validator(def: SettingDef): z.ZodType {
  const kinds: { [K in SettingDef['type']]: (d: Extract<SettingDef, { type: K }>) => z.ZodType } = {
    boolean: () => z.boolean(),
    number: (d) => z.number().int().min(d.min).max(d.max),
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
