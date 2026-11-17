import type { GameRight } from '@moinmorni/shared';

/**
 * How each game mode is played: three short tips and the most important commands (texts under
 * site.guide.<mode>.*). Modes without an entry simply show no guide. The mode page shows `commands`; the commands
 * page (/befehle) shows them too, plus `more` and – by rank – `team`.
 */
export interface GuideCommand {
  readonly key: string;
  readonly syntax: string;
  /** Only for ranks with this right in the game (team tools of the mode). */
  readonly right?: GameRight;
}

export interface ModeGuide {
  readonly tips: number;
  readonly commands: readonly GuideCommand[];
  /** More commands for everyone – only on the commands page. */
  readonly more?: readonly GuideCommand[];
  /** Team tools of the mode, each with the right it needs. */
  readonly team?: readonly GuideCommand[];
}

export const MODE_GUIDES: Readonly<Record<string, ModeGuide>> = {
  mornicraft: {
    tips: 3,
    commands: [
      { key: 'home', syntax: '/home' },
      { key: 'tpa', syntax: '/tpa <name>' },
      { key: 'clan', syntax: '/clan' },
      { key: 'spawn', syntax: '/spawn' },
    ],
    // MorniCraft's own list (/info in the game); in the network the network's /msg, /gefaengnis, … count.
    more: [
      { key: 'sethome', syntax: '/sethome [name]' },
      { key: 'homes', syntax: '/homes' },
      { key: 'delhome', syntax: '/delhome <name>' },
      { key: 'back', syntax: '/back' },
      { key: 'tpahere', syntax: '/tpahere <name>' },
      { key: 'tpaccept', syntax: '/tpaccept' },
      { key: 'tpdeny', syntax: '/tpdeny' },
      { key: 'clanCreate', syntax: '/clan create <name> [kürzel]' },
      { key: 'clanInvite', syntax: '/clan invite <name>' },
      { key: 'clanBase', syntax: '/clan base' },
      { key: 'cc', syntax: '/cc <text>' },
      { key: 'mail', syntax: '/mail send <name> <text>' },
      { key: 'mailRead', syntax: '/mail read' },
      { key: 'ignore', syntax: '/ignore <name>' },
      { key: 'afk', syntax: '/afk' },
      { key: 'seen', syntax: '/seen <name>' },
      { key: 'near', syntax: '/near' },
      { key: 'getpos', syntax: '/getpos' },
      { key: 'ping', syntax: '/ping' },
      { key: 'info', syntax: '/info' },
      { key: 'leiste', syntax: '/leiste' },
      { key: 'streamer', syntax: '/streamer' },
    ],
    // MorniCraft gives its team tools to ranks that may mute, jail or look at players (Network.RIGHTS).
    team: [
      { key: 'ansehen', syntax: '/ansehen <name>', right: 'inspect' },
      { key: 'einfrieren', syntax: '/einfrieren <name>', right: 'inspect' },
      { key: 'nether', syntax: '/nether [weg]', right: 'inspect' },
      { key: 'end', syntax: '/end [weg]', right: 'inspect' },
      { key: 'mcadmin', syntax: '/mcadmin reload', right: 'ranks' },
    ],
  },
  duels: {
    tips: 3,
    commands: [
      { key: 'duel', syntax: '/duel <name>' },
      { key: 'kit', syntax: '/kit' },
      { key: 'top', syntax: '/top' },
    ],
  },
  party: {
    tips: 3,
    commands: [
      { key: 'mitspielen', syntax: '/mitspielen' },
      { key: 'zuschauen', syntax: '/zuschauen' },
      { key: 'top', syntax: '/top' },
    ],
  },
  gipfelsturm: {
    tips: 3,
    commands: [
      { key: 'gipfel', syntax: '/gipfel' },
      { key: 'woche', syntax: '/gipfel woche' },
      { key: 'uebung', syntax: '/gipfel uebung' },
    ],
  },
  burgverlies: {
    tips: 3,
    commands: [
      { key: 'bv', syntax: '/bv' },
      { key: 'suchen', syntax: '/bv suchen' },
      { key: 'verlassen', syntax: '/verlassen' },
    ],
  },
  bollwerk: {
    tips: 3,
    commands: [
      { key: 'bereit', syntax: '/bereit' },
      { key: 'shop', syntax: '/shop' },
      { key: 'top', syntax: '/top' },
    ],
  },
  mirni: {
    tips: 3,
    commands: [
      { key: 'rtp', syntax: '/rtp' },
      { key: 'ah', syntax: '/ah' },
      { key: 'gs', syntax: '/gs sichern' },
      { key: 'geld', syntax: '/geld' },
    ],
  },
  wolkenkampf: {
    tips: 3,
    commands: [
      { key: 'karte', syntax: '/karte' },
      { key: 'ausruestung', syntax: '/ausruestung' },
      { key: 'bereit', syntax: '/bereit' },
      { key: 'zuschauen', syntax: '/zuschauen' },
    ],
  },
  versteckerl: {
    tips: 3,
    commands: [
      { key: 'karte', syntax: '/karte' },
      { key: 'gestalt', syntax: '/gestalt' },
      { key: 'bereit', syntax: '/bereit' },
      { key: 'top', syntax: '/top' },
    ],
  },
  wintersport: {
    tips: 3,
    commands: [
      { key: 'abstimmen', syntax: '/abstimmen' },
      { key: 'bereit', syntax: '/bereit' },
      { key: 'top', syntax: '/top' },
    ],
  },
  adlerflug: {
    tips: 3,
    commands: [
      { key: 'adlerflug', syntax: '/adlerflug' },
      { key: 'ring', syntax: '/adlerflug ring' },
      { key: 'woche', syntax: '/adlerflug woche' },
      { key: 'uebung', syntax: '/adlerflug uebung' },
    ],
  },
  angelkoenig: {
    tips: 3,
    commands: [
      { key: 'fischbuch', syntax: '/fischbuch' },
      { key: 'turnier', syntax: '/turnier' },
      { key: 'top', syntax: '/top' },
    ],
  },
};
