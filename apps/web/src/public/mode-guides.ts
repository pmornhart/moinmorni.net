/**
 * How each game mode is played: three short tips and the most important commands (texts under
 * site.guide.<mode>.*). Modes without an entry simply show no guide.
 */
export interface ModeGuide {
  readonly tips: number;
  readonly commands: readonly { readonly key: string; readonly syntax: string }[];
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
