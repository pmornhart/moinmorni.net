/* eslint-disable ts-patterns/no-magic-numbers -- a settings section: limits as the panel needs them */
import type { GameRight, Role } from './roles.js';
import type { SettingSection, Text } from './settings.js';

/**
 * Streamer-Modus im ganzen Netzwerk (/streamer): Wer streamt oder aufnimmt, schaltet ihn einmal an – er gilt sofort auf
 * jedem Server (Lobby, alle Modi, Bau-Server, MorniCraft). Der Hub merkt sich den Zustand je Spieler; was verdeckt wird,
 * entscheidet der Empfänger: Für ihn werden IP-Adressen und die eigenen Adressen zu „•••“, private Nachrichten und
 * Koordinaten sind nur mit der Maus lesbar, und die anderen sehen „● LIVE“ an seinem Namen.
 */

/** Teile des Streamer-Modus – dieselben Kennungen wie in MorniCraft (`Streamer.OPTIONS`). */
export const STREAMER_PARTS = ['ip', 'coords', 'msg', 'live'] as const;
export type StreamerPart = (typeof STREAMER_PARTS)[number];

/** Recht im Rang, wenn der Streamer-Modus nur mit Recht geht (Media hat es). */
export const STREAMER_RIGHT = 'streamer' satisfies GameRight;

/** Wer /streamer benutzen darf: alle, nur mit Recht, niemand. */
export const STREAMER_ACCESS = ['all', 'right', 'off'] as const;
export type StreamerAccess = (typeof STREAMER_ACCESS)[number];

/** Welcher Schalter im Panel einen Teil erlaubt (aus = niemand bekommt ihn). */
export const STREAMER_PART_SETTINGS: Readonly<Record<StreamerPart, string>> = {
  ip: 'streamerIp',
  coords: 'streamerCoords',
  msg: 'streamerMessages',
  live: 'streamerLive',
};

/** Was ein Spieler für sich gespeichert hat: an/aus und die Teile, die er für sich abgeschaltet hat. */
export interface StreamerState {
  readonly on: boolean;
  readonly off: readonly StreamerPart[];
}

export const STREAMER_OFF: StreamerState = { on: false, off: [] };

const isAccess = (v: unknown): v is StreamerAccess => STREAMER_ACCESS.some((a) => a === v);

/** Wer den Streamer-Modus benutzen darf – nach der Einstellung im Panel (Bereich Netzwerk). */
export function streamerAccess(network: Readonly<Record<string, unknown>>): StreamerAccess {
  const v = network['streamerAccess'];
  return isAccess(v) ? v : 'all';
}

/** Darf jemand mit diesem Rang /streamer benutzen? */
export function mayStream(network: Readonly<Record<string, unknown>>, role: Pick<Role, 'game'>): boolean {
  const access = streamerAccess(network);
  if (access === 'off') return false;
  return access === 'all' || role.game.includes(STREAMER_RIGHT);
}

/** Teile, die das Panel erlaubt (in der Reihenfolge von STREAMER_PARTS). */
export function streamerPartsAllowed(network: Readonly<Record<string, unknown>>): StreamerPart[] {
  return STREAMER_PARTS.filter((p) => network[STREAMER_PART_SETTINGS[p]] !== false);
}

/**
 * Was für diesen Spieler gerade gilt: leer = Streamer-Modus aus (oder nicht erlaubt), sonst die Teile, die das Panel
 * erlaubt und er nicht für sich abgeschaltet hat.
 */
export function streamerActive(
  network: Readonly<Record<string, unknown>>,
  role: Pick<Role, 'game'>,
  state: StreamerState,
): { readonly on: boolean; readonly parts: StreamerPart[] } {
  if (!state.on || !mayStream(network, role)) return { on: false, parts: [] };
  return { on: true, parts: streamerPartsAllowed(network).filter((p) => !state.off.includes(p)) };
}

// Ein Name oder eine IP, wie man sie eintippt: "moinmorni.net", "play.example.de", "85.215.54.143" – ohne
// "https://", Pfad oder Leerzeichen; vorne und hinten keine Punkte oder Bindestriche.
// https://regex101.com/?flavor=javascript&regex=%5E%5Ba-z0-9%5D(%5Ba-z0-9.-%5D*%5Ba-z0-9%5D)%3F%24&testString=play.example.de
const HOST = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;
// "https://", "http://" vorne – wer eine Adresse aus dem Browser kopiert.
// https://regex101.com/?flavor=javascript&regex=%5E%5Ba-z%5D%2B%3A%5C%2F%5C%2F&testString=https%3A%2F%2Fmoinmorni.net%2Fhilfe
const SCHEME = /^[a-z]+:\/\//;

/** "https://Play.Example.de/hilfe" → "play.example.de"; null, wenn es kein Name ist. */
export function streamerHost(raw: string): string | null {
  const host = raw.trim().toLowerCase().replace(SCHEME, '').split('/')[0]?.split(':')[0] ?? '';
  return HOST.test(host) ? host : null;
}

/**
 * Die eigenen Adressen, die für Streamer zu „•••“ werden (mit allem davor, z. B. auch „play.<name>“, und einem Port
 * dahinter): die Domain des Netzwerks, wenn das Panel es so will, und die Liste aus dem Panel.
 */
export function streamerHosts(network: Readonly<Record<string, unknown>>, domain: string): string[] {
  const extra = Array.isArray(network['streamerAddresses']) ? network['streamerAddresses'].map(String) : [];
  const all = [...(network['streamerHideDomain'] === false ? [] : [domain]), ...extra];
  return [...new Set(all.map(streamerHost).filter((h): h is string => h !== null))];
}

const t = (de: string, en: string): Text => ({ de, en });

/** Abschnitt im Bereich Netzwerk (Panel → Einstellungen → Netzwerk → Streamer-Modus). */
export const STREAMER_SECTION: SettingSection = {
  id: 'streamer',
  title: t('Streamer-Modus', 'Streamer mode'),
  text: t(
    'Für alle, die streamen oder aufnehmen: /streamer verdeckt, was nicht in den Stream gehört – auf jedem Server, auch in MorniCraft. Jeder schaltet die einzelnen Teile für sich an und aus; was hier aus ist, gibt es für niemanden.',
    'For everyone who streams or records: /streamer hides what shouldn’t be on stream – on every server, MorniCraft too. Everyone switches the single parts on and off for themselves; what is off here, nobody gets.',
  ),
  settings: [
    {
      key: 'streamerAccess',
      type: 'select',
      default: 'all',
      options: [
        { value: 'all', label: t('Alle', 'Everyone') },
        {
          value: 'right',
          label: t(
            'Nur mit dem Recht „Streamer-Modus“ (z. B. Media)',
            'Only with the right “Streamer mode” (e.g. Media)',
          ),
        },
        { value: 'off', label: t('Niemand (aus)', 'Nobody (off)') },
      ],
      label: t('Wer darf /streamer benutzen', 'Who may use /streamer'),
      help: t(
        'Das Recht „Streamer-Modus“ vergibst du unter Rollen. Wer es verliert, ist sofort wieder ohne Streamer-Modus.',
        'You give the right “Streamer mode” under Roles. Whoever loses it is out of streamer mode at once.',
      ),
      command: '/netzwerk streamer <alle|recht|aus>',
    },
    {
      key: 'streamerIp',
      type: 'boolean',
      default: true,
      label: t('IP-Adressen und eigene Adressen verdecken', 'Hide IP addresses and own addresses'),
      help: t(
        'Für Streamer wird jede IP-Adresse (auch mit Port) und jede der Adressen unten im Chat und in Nachrichten zu •••.',
        'For streamers every IP address (also with a port) and every address below turns into ••• in chat and messages.',
      ),
      command: '/netzwerk streamer ip an|aus',
    },
    {
      key: 'streamerHideDomain',
      type: 'boolean',
      default: true,
      label: t('Adresse des Netzwerks mit verdecken', 'Also hide the network’s address'),
      help: t(
        'Die Domain des Netzwerks und alles davor (z. B. play.<domain>). Aus = sie bleibt im Stream sichtbar – gute Werbung.',
        'The network’s domain and everything in front of it (e.g. play.<domain>). Off = it stays visible on stream – good advertising.',
      ),
      command: '/netzwerk streamer domain an|aus',
    },
    {
      key: 'streamerAddresses',
      type: 'list',
      default: [],
      maxItems: 20,
      maxLength: 64,
      label: t('Weitere Adressen verdecken', 'Hide more addresses'),
      help: t(
        'Namen oder IPs, die nie im Stream stehen sollen – auch mit allem davor und einem Port dahinter.',
        'Names or IPs that should never be on stream – also with anything in front and a port behind.',
      ),
      command: '/netzwerk streamer adresse hinzu|weg <name>',
    },
    {
      key: 'streamerCoords',
      type: 'boolean',
      default: true,
      label: t('Koordinaten verstecken', 'Hide coordinates'),
      help: t(
        'Wo ein Modus Koordinaten zeigt (z. B. MorniCraft: /getpos, Zuhause, Gräber), stehen sie nur noch beim Drüberfahren mit der Maus.',
        'Where a mode shows coordinates (e.g. MorniCraft: /getpos, homes, graves), they only show with the mouse on them.',
      ),
      command: '/netzwerk streamer koordinaten an|aus',
    },
    {
      key: 'streamerMessages',
      type: 'boolean',
      default: true,
      label: t('Private Nachrichten verdecken', 'Cover private messages'),
      help: t(
        '/msg, /r (und in MorniCraft die Post) sind für Streamer nur mit der Maus lesbar.',
        '/msg, /r (and mail in MorniCraft) can only be read with the mouse by streamers.',
      ),
      command: '/netzwerk streamer nachrichten an|aus',
    },
    {
      key: 'streamerLive',
      type: 'boolean',
      default: true,
      label: t('● LIVE für die anderen', '● LIVE for the others'),
      help: t(
        'Die anderen sehen „● LIVE“ am Namen: im Chat davor, in der Tab-Liste und über dem Kopf dahinter.',
        'The others see “● LIVE” at the name: in front of it in chat, behind it in the tab list and above the head.',
      ),
      command: '/netzwerk streamer live an|aus',
    },
    {
      key: 'streamerAnnounce',
      type: 'boolean',
      default: true,
      label: t('Ansage, wenn jemand live geht', 'Announce when someone goes live'),
      help: t(
        'Wer auf demselben Server ist, liest „<name> streamt jetzt“ (nur mit ● LIVE, höchstens alle 10 Minuten je Spieler).',
        'Whoever is on the same server reads “<name> is streaming now” (only with ● LIVE, at most every 10 minutes per player).',
      ),
      command: '/netzwerk streamer ansage an|aus',
    },
  ],
};
