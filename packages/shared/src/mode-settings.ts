/* eslint-disable ts-patterns/no-magic-numbers -- a settings catalog: defaults and limits as the modes need them */
import type { SettingArea, SettingDef, Text } from './settings.js';

/**
 * Einstellungen der Spielmodi (Duels, Morni Party, Gipfelsturm, Burgverlies, Bollwerk, MorniSMP, Wolkenkampf,
 * Versteckerl, Wintersport, Adlerflug, Angelkönig): je Modus ein
 * Bereich im Panel, jede Einstellung mit ihrer Stelle in der config.yml des Modus-Plugins und einem Befehl im Spiel.
 * Die Standardwerte sind die der mitgelieferten config.yml – ohne Änderung im Panel bleibt dort alles, wie es ist.
 *
 * Der Weg: Panel (oder Befehl) → Hub schickt `mode-settings` (Pfad → Wert) an den Server des Modus → das
 * Netzwerk-Plugin schreibt die config.yml (Kommentare bleiben) → Neustart des Modus, sobald gerade niemand spielt.
 * Schläft der Modus, trägt morni.net die Werte vor dem Aufwachen ein. Ein neuer Modus braucht hier nur einen Bereich.
 */

const t = (de: string, en: string): Text => ({ de, en });

/** Einheit mit dem Wort, das im Befehl als Platzhalter steht („/duelsconfig zeitlimit <sekunden>“). */
interface Unit {
  readonly unit: Text;
  readonly arg: string;
}
const SECONDS: Unit = { unit: t('Sekunden', 'seconds'), arg: 'sekunden' };
const MINUTES: Unit = { unit: t('Minuten', 'minutes'), arg: 'minuten' };
const HOURS: Unit = { unit: t('Stunden', 'hours'), arg: 'stunden' };
const DAYS: Unit = { unit: t('Tage', 'days'), arg: 'tage' };
const WEEKS: Unit = { unit: t('Wochen', 'weeks'), arg: 'wochen' };
const PLAYERS: Unit = { unit: t('Spieler', 'players'), arg: 'zahl' };
const BLOCKS: Unit = { unit: t('Blöcke', 'blocks'), arg: 'bloecke' };
const PERCENT: Unit = { unit: t('Prozent', 'percent'), arg: 'prozent' };
const TICKS: Unit = { unit: t('Ticks (20 = 1 Sekunde)', 'ticks (20 = 1 second)'), arg: 'ticks' };
const TALER: Unit = { unit: t('Taler', 'coins'), arg: 'taler' };
const POINTS: Unit = { unit: t('Punkte', 'points'), arg: 'punkte' };

interface Common {
  readonly key: string;
  /** Pfad in der config.yml (siehe ConfigSpot). */
  readonly at: string;
  /** Wörter des Befehls nach dem Wurzelwort, ohne den Wert: "kampf zeitlimit". */
  readonly cmd: string;
  readonly label: Text;
  readonly help: Text;
}

/** Bausteine für die Einstellungen eines Modus; alle Befehle beginnen mit `/<root>`. */
function settingsFor(root: string) {
  const command = (cmd: string, value: string): string => `/${root} ${cmd} ${value}`;
  return {
    flag: (c: Common & { readonly value: boolean; readonly member?: string }): SettingDef => ({
      key: c.key,
      type: 'boolean',
      default: c.value,
      label: c.label,
      help: c.help,
      command: command(c.cmd, 'an|aus'),
      config: c.member ? { path: c.at, member: c.member } : { path: c.at },
    }),
    number: (
      c: Common & {
        readonly value: number;
        readonly min: number;
        readonly max: number;
        readonly step?: number;
      } & Partial<Unit>,
    ): SettingDef => ({
      key: c.key,
      type: 'number',
      default: c.value,
      min: c.min,
      max: c.max,
      ...(c.unit ? { unit: c.unit } : {}),
      ...(c.step ? { step: c.step } : {}),
      label: c.label,
      help: c.help,
      command: command(c.cmd, `<${c.arg ?? 'zahl'}>`),
      config: { path: c.at },
    }),
    choice: (
      c: Common & {
        readonly value: string;
        readonly options: ReadonlyArray<{ readonly value: string; readonly label: Text }>;
      },
    ): SettingDef => ({
      key: c.key,
      type: 'select',
      default: c.value,
      options: c.options,
      label: c.label,
      help: c.help,
      command: command(c.cmd, `<${c.options.map((o) => o.value).join('|')}>`),
      config: { path: c.at },
    }),
    text: (
      c: Common & { readonly value: string; readonly maxLength: number; readonly arg: string },
    ): SettingDef => ({
      key: c.key,
      type: 'text',
      default: c.value,
      maxLength: c.maxLength,
      label: c.label,
      help: c.help,
      command: command(c.cmd, `<${c.arg}>`),
      config: { path: c.at },
    }),
    list: (
      c: Common & {
        readonly value: readonly string[];
        readonly maxItems: number;
        readonly maxLength: number;
        readonly arg: string;
      },
    ): SettingDef => ({
      key: c.key,
      type: 'list',
      default: c.value,
      maxItems: c.maxItems,
      maxLength: c.maxLength,
      label: c.label,
      help: c.help,
      command: command(c.cmd, `hinzu|weg <${c.arg}>`),
      config: { path: c.at },
    }),
  };
}

// ---------------------------------------------------------------- Duels

const duels = settingsFor('duelsconfig');

export const DUELS_AREA: SettingArea = {
  id: 'duels',
  title: t('Duels', 'Duels'),
  text: t(
    '1 gegen 1 und 2 gegen 2: Arenen, Kampfzeiten, die Suppe im Kit „Klassisch“ und die gewertete Rangliste.',
    '1v1 and 2v2: arenas, fight times, the soup in the “Classic” kit and the ranked leaderboard.',
  ),
  icon: 'Swords',
  panel: 'modes',
  mode: { id: 'duels', plugin: 'MorniDuels' },
  sections: [
    {
      id: 'arenas',
      title: t('Arenen', 'Arenas'),
      settings: [
        duels.number({
          key: 'arenaCopies',
          at: 'arena-kopien',
          value: 3,
          min: 1,
          max: 20,
          cmd: 'arenen',
          label: t('Kopien jeder Arena', 'Copies of each arena'),
          help: t(
            'Jede der vier Arenen (Almwiese, Burghof, Bergwerk, Wirtshausgarten) gibt es so oft – 3 Kopien = bis zu 12 Kämpfe gleichzeitig. Mehr Kopien brauchen mehr Speicher; neue werden beim Neustart dazugebaut.',
            'Each of the four arenas (alpine meadow, castle yard, mine, tavern garden) exists this often – 3 copies = up to 12 fights at once. More copies need more memory; new ones are built at the restart.',
          ),
        }),
      ],
    },
    {
      id: 'fights',
      title: t('Kämpfe', 'Fights'),
      settings: [
        duels.number({
          key: 'timeLimit',
          at: 'kampf.zeitlimit-sekunden',
          value: 600,
          min: 30,
          max: 3600,
          ...SECONDS,
          cmd: 'zeitlimit',
          label: t('Zeitlimit eines Kampfes', 'Time limit of a fight'),
          help: t(
            'Dauert ein Kampf länger, endet er unentschieden (600 = 10 Minuten).',
            'If a fight takes longer, it ends in a draw (600 = 10 minutes).',
          ),
        }),
        duels.number({
          key: 'countdown',
          at: 'kampf.countdown-sekunden',
          value: 3,
          min: 1,
          max: 10,
          ...SECONDS,
          cmd: 'countdown',
          label: t('Countdown vor dem Start', 'Countdown before the start'),
          help: t(
            '3-2-1 – so lange stehen alle in der Arena still.',
            '3-2-1 – everyone stands still in the arena this long.',
          ),
        }),
        duels.number({
          key: 'afterFight',
          at: 'kampf.nachspiel-sekunden',
          value: 10,
          min: 1,
          max: 60,
          ...SECONDS,
          cmd: 'nachspiel',
          label: t('Nach dem Kampf', 'After the fight'),
          help: t(
            'So lange bleiben alle nach dem Ende in der Arena, dann geht es zurück in die Wartehalle.',
            'Everyone stays in the arena this long after the end, then it is back to the waiting hall.',
          ),
        }),
        duels.number({
          key: 'challengeSeconds',
          at: 'herausforderung.ablauf-sekunden',
          value: 60,
          min: 10,
          max: 600,
          ...SECONDS,
          cmd: 'herausforderung',
          label: t('Herausforderung gilt', 'A challenge lasts'),
          help: t(
            'So lange kann man eine Herausforderung mit /duel annehmen, dann verfällt sie.',
            'A challenge with /duel can be accepted this long, then it expires.',
          ),
        }),
      ],
    },
    {
      id: 'soup',
      title: t('Kit „Klassisch“', 'Kit “Classic”'),
      settings: [
        duels.number({
          key: 'soupHeal',
          at: 'suppe.heilung',
          value: 7,
          min: 0.5,
          max: 20,
          step: 0.5,
          unit: t('Lebenspunkte', 'health points'),
          arg: 'punkte',
          cmd: 'suppe',
          label: t('Eine Pilzsuppe heilt', 'One mushroom soup heals'),
          help: t(
            'Zwei Lebenspunkte sind ein Herz – 7 heilt also 3,5 Herzen.',
            'Two health points are one heart – so 7 heals 3.5 hearts.',
          ),
        }),
      ],
    },
    {
      id: 'ranked',
      title: t('Gewertete Kämpfe', 'Ranked fights'),
      text: t(
        'Die Rangliste zählt Wertungspunkte (Elo): Wer gewinnt, bekommt Punkte vom Verlierer – gegen Stärkere mehr, gegen Schwächere weniger.',
        'The leaderboard counts rating points (Elo): the winner gets points from the loser – more against stronger players, fewer against weaker ones.',
      ),
      settings: [
        duels.number({
          key: 'eloStart',
          at: 'wertung.start',
          value: 1000,
          min: 0,
          max: 5000,
          ...POINTS,
          cmd: 'wertung start',
          label: t('Punkte am Anfang', 'Points at the start'),
          help: t(
            'Mit so vielen Punkten beginnt jeder in der Rangliste.',
            'Everyone starts the leaderboard with this many points.',
          ),
        }),
        duels.number({
          key: 'kFactor',
          at: 'wertung.k-faktor',
          value: 32,
          min: 1,
          max: 100,
          cmd: 'wertung tempo',
          label: t('Wie stark ein Kampf zählt', 'How much a fight counts'),
          help: t(
            'Höher = die Punkte ändern sich pro Kampf stärker. Bei 32 bringt ein Sieg gegen einen gleich Starken 16 Punkte.',
            'Higher = points change more per fight. At 32 a win against an equally strong player brings 16 points.',
          ),
        }),
        duels.number({
          key: 'rangeStart',
          at: 'wertung.spanne-start',
          value: 100,
          min: 0,
          max: 1000,
          ...POINTS,
          cmd: 'suche abstand',
          label: t('Erlaubter Abstand bei der Suche', 'Allowed gap when searching'),
          help: t(
            'Die gewertete Suche bringt erst Gegner zusammen, deren Punkte höchstens so weit auseinander liegen.',
            'Ranked search first pairs opponents whose points are at most this far apart.',
          ),
        }),
        duels.number({
          key: 'rangeGrowth',
          at: 'wertung.spanne-plus',
          value: 50,
          min: 0,
          max: 500,
          ...POINTS,
          cmd: 'suche plus',
          label: t('Abstand wächst um', 'Gap grows by'),
          help: t(
            'Findet sich niemand, wird der erlaubte Abstand Schritt für Schritt größer – damit niemand ewig wartet.',
            'If nobody is found, the allowed gap grows step by step – so nobody waits forever.',
          ),
        }),
        duels.number({
          key: 'rangeStepSeconds',
          at: 'wertung.spanne-alle-sekunden',
          value: 5,
          min: 1,
          max: 60,
          ...SECONDS,
          cmd: 'suche takt',
          label: t('Abstand wächst alle', 'Gap grows every'),
          help: t('So oft wächst der erlaubte Abstand.', 'This is how often the allowed gap grows.'),
        }),
        duels.number({
          key: 'rangeMax',
          at: 'wertung.spanne-max',
          value: 1000,
          min: 0,
          max: 5000,
          ...POINTS,
          cmd: 'suche max',
          label: t('Größter Abstand', 'Largest gap'),
          help: t('Weiter wächst der Abstand nicht.', 'The gap does not grow any further.'),
        }),
      ],
    },
  ],
};

// ---------------------------------------------------------------- Morni Party

const party = settingsFor('partyconfig');

/** Die Minispiele (Kennung in der config.yml, Name, kurze Erklärung) – neue hinten anhängen. */
const MINIGAMES: ReadonlyArray<{ readonly id: string; readonly name: Text; readonly help: Text }> = [
  {
    id: 'broeckelboden',
    name: t('Bröckelboden', 'Crumbling Floor'),
    help: t('Wo man steht, bröckelt der Boden weg.', 'Wherever you stand, the floor crumbles away.'),
  },
  {
    id: 'talerregen',
    name: t('Talerregen', 'Coin Shower'),
    help: t('Taler fallen vom Himmel – sammeln!', 'Coins fall from the sky – collect them!'),
  },
  {
    id: 'bergsprint',
    name: t('Bergsprint', 'Hill Sprint'),
    help: t('Wettlauf den Almweg hinauf.', 'A race up the alpine path.'),
  },
  {
    id: 'pfeilhagel',
    name: t('Pfeilhagel', 'Arrow Storm'),
    help: t('Pfeile prasseln vom Himmel – ausweichen.', 'Arrows rain from the sky – dodge them.'),
  },
  {
    id: 'heisse-brezn',
    name: t('Heiße Brezn', 'Hot Pretzel'),
    help: t('Die heiße Brezn mit einem Schlag weitergeben.', 'Pass on the hot pretzel with a hit.'),
  },
  {
    id: 'trachtenfarben',
    name: t('Trachtenfarben', 'Colour Memory'),
    help: t('Farbe merken und rechtzeitig draufstellen.', 'Remember the colour and stand on it in time.'),
  },
  {
    id: 'gipfelkoenig',
    name: t('Gipfelkönig', 'King of the Hill'),
    help: t('Oben auf dem Gipfel stehen und Punkte sammeln.', 'Stand on the summit and collect points.'),
  },
  {
    id: 'kuhglocke',
    name: t('Kuhglocke', 'Cowbell'),
    help: t('Klicken, sobald die Tafel grün wird.', 'Click as soon as the board turns green.'),
  },
  {
    id: 'schaefchen',
    name: t('Schäfchen zählen', 'Counting Sheep'),
    help: t('Schafe im Pferch zählen, drei Runden.', 'Count the sheep in the pen, three rounds.'),
  },
  {
    id: 'holzhacker',
    name: t('Holzhacker', 'Wood Chopper'),
    help: t('Holzklötze spalten – der letzte Hieb zählt.', 'Split logs – the last blow counts.'),
  },
  {
    id: 'rempelei',
    name: t('Rempelei', 'Shove Off'),
    help: t('Die anderen von der Plattform schubsen.', 'Shove the others off the platform.'),
  },
  {
    id: 'scheibenschiessen',
    name: t('Scheibenschießen', 'Target Practice'),
    help: t('Mit Schneebällen auf Zielscheiben werfen.', 'Throw snowballs at targets.'),
  },
  {
    id: 'lawinenhang',
    name: t('Lawinenhang', 'Avalanche Slope'),
    help: t('Den Schneehang hinauf, Schneebrocken ausweichen.', 'Up the snow slope, dodging snow boulders.'),
  },
  {
    id: 'maibaumkraxeln',
    name: t('Maibaumkraxeln', 'Maypole Climb'),
    help: t('Den Maibaum hinauf bis zum Kranz klettern.', 'Climb the maypole up to the wreath.'),
  },
  {
    id: 'eisstockschiessen',
    name: t('Eisstockschießen', 'Ice Stock Sport'),
    help: t(
      'Den Eisstock möglichst nah an die Daube schießen.',
      'Shoot the ice stock as close to the target as possible.',
    ),
  },
  {
    id: 'murmeltier',
    name: t('Murmeltier-Klopfen', 'Marmot Bonk'),
    help: t('Murmeltiere erwischen, bevor sie verschwinden.', 'Bonk the marmots before they disappear.'),
  },
];
const keyOf = (prefix: string, id: string): string =>
  prefix +
  id
    .split('-')
    .map((w) => (w[0] ?? '').toUpperCase() + w.slice(1))
    .join('');

/** Taler für Platz 1 bis 8 in den Minispielen (wie in der config.yml). */
const MINI_TALER = [10, 6, 4, 3, 2, 1, 1, 1];
const HUNT_ROUNDS = [10, 15, 20];

const taler = (
  key: string,
  at: string,
  value: number,
  max: number,
  cmd: string,
  label: Text,
  help: Text,
): SettingDef => party.number({ key, at, value, min: 0, max, ...TALER, cmd, label, help });

export const PARTY_AREA: SettingArea = {
  id: 'party',
  title: t('Morni Party', 'Morni Party'),
  text: t(
    'Brettspiel für 2–8: Tische, Wartezeiten, Züge, welche Minispiele vorkommen und alle Zahlen der Spielregeln. Gilt für neue Partien.',
    'Board game for 2–8: tables, waiting times, turns, which minigames appear and all the numbers of the rules. Applies to new games.',
  ),
  icon: 'Dices',
  panel: 'modes',
  mode: { id: 'party', plugin: 'MorniParty' },
  sections: [
    {
      id: 'tables',
      title: t('Tische und Spieler', 'Tables and players'),
      settings: [
        party.number({
          key: 'tables',
          at: 'tische',
          value: 2,
          min: 1,
          max: 8,
          cmd: 'tische',
          label: t('Partien gleichzeitig', 'Games at once'),
          help: t(
            'Jeder Tisch hat alle drei Spielbretter und alle Minispiel-Plätze. Mehr Tische brauchen mehr Speicher; neue werden beim Neustart dazugebaut.',
            'Every table has all three boards and all minigame areas. More tables need more memory; new ones are built at the restart.',
          ),
        }),
        party.number({
          key: 'minPlayers',
          at: 'spieler.mindestens',
          value: 2,
          min: 2,
          max: 8,
          ...PLAYERS,
          cmd: 'spieler mindestens',
          label: t('Los geht’s ab', 'Starts from'),
          help: t(
            'Ab so vielen Wartenden beginnt der Countdown.',
            'The countdown starts from this many waiting players.',
          ),
        }),
        party.number({
          key: 'maxPlayers',
          at: 'spieler.hoechstens',
          value: 8,
          min: 2,
          max: 8,
          ...PLAYERS,
          cmd: 'spieler hoechstens',
          label: t('Höchstens pro Partie', 'At most per game'),
          help: t('Mehr als 8 passen nicht an einen Tisch.', 'More than 8 do not fit at one table.'),
        }),
      ],
    },
    {
      id: 'waiting',
      title: t('Warten auf dem Festplatz', 'Waiting on the fairground'),
      settings: [
        party.number({
          key: 'countdown',
          at: 'warten.countdown-sekunden',
          value: 45,
          min: 3,
          max: 300,
          ...SECONDS,
          cmd: 'countdown',
          label: t('Countdown', 'Countdown'),
          help: t('Startet, sobald genug Leute warten.', 'Starts as soon as enough people are waiting.'),
        }),
        party.number({
          key: 'fullCountdown',
          at: 'warten.voll-sekunden',
          value: 10,
          min: 3,
          max: 120,
          ...SECONDS,
          cmd: 'countdown-voll',
          label: t('Countdown, wenn voll', 'Countdown when full'),
          help: t('Ist die Partie voll, geht es schneller los.', 'When the game is full, it starts sooner.'),
        }),
        party.flag({
          key: 'autoJoin',
          at: 'warten.automatisch-mitspielen',
          value: true,
          cmd: 'automatisch',
          label: t('Gleich mitspielen', 'Join right away'),
          help: t(
            'Wer ankommt oder eine Partie beendet, wartet gleich auf die nächste. Aus: nur über den Knopf „Mitspielen“.',
            'Whoever arrives or finishes a game waits for the next one right away. Off: only with the “Play” button.',
          ),
        }),
      ],
    },
    {
      id: 'turns',
      title: t('Züge und Runden', 'Turns and rounds'),
      settings: [
        ...HUNT_ROUNDS.map((value, i) =>
          party.number({
            key: `huntRounds${i + 1}`,
            at: `edelweiss-jagd-runden.${i}`,
            value,
            min: 1,
            max: 50,
            unit: t('Runden', 'rounds'),
            arg: 'runden',
            cmd: `jagd wahl${i + 1}`,
            label: t(`Edelweiß-Jagd: ${i + 1}. Wahl`, `Edelweiss hunt: choice ${i + 1}`),
            help: t(
              'Vor jeder Edelweiß-Jagd stimmen alle über die Länge ab – diese drei Rundenzahlen stehen zur Wahl.',
              'Before every edelweiss hunt everyone votes on its length – these three round counts are the choices.',
            ),
          }),
        ),
        party.number({
          key: 'turnSeconds',
          at: 'zug.wuerfel-sekunden',
          value: 20,
          min: 3,
          max: 120,
          ...SECONDS,
          cmd: 'wuerfeln',
          label: t('Zeit zum Würfeln', 'Time to roll'),
          help: t('Danach würfelt das Spiel von selbst.', 'After that the game rolls by itself.'),
        }),
        party.number({
          key: 'menuSeconds',
          at: 'zug.menue-sekunden',
          value: 15,
          min: 3,
          max: 120,
          ...SECONDS,
          cmd: 'menue',
          label: t('Zeit in Laden und Stand', 'Time in shop and stall'),
          help: t(
            'So lange bleiben Laden, Edelweiß-Stand und Duell-Wahl offen.',
            'Shop, edelweiss stall and duel choice stay open this long.',
          ),
        }),
        party.number({
          key: 'stepTicks',
          at: 'zug.schritt-ticks',
          value: 6,
          min: 2,
          max: 40,
          ...TICKS,
          cmd: 'tempo',
          label: t('Tempo der Figur', 'Speed of the piece'),
          help: t(
            'So lange braucht die Figur für ein Feld – kleiner = schneller.',
            'This is how long the piece needs per field – smaller = faster.',
          ),
        }),
      ],
    },
    {
      id: 'minigames',
      title: t('Minispiele', 'Minigames'),
      text: t(
        'Welche Minispiele vorkommen. Sind alle an (oder alle aus), kommen alle vor – auch neue aus späteren Updates.',
        'Which minigames appear. If all are on (or all off), all appear – including new ones from later updates.',
      ),
      settings: [
        party.choice({
          key: 'miniOrder',
          at: 'minispiele.reihenfolge',
          value: 'zufall',
          options: [
            {
              value: 'zufall',
              label: t('Gemischt (erst alle, dann wieder von vorn)', 'Mixed (all once, then again)'),
            },
            { value: 'fest', label: t('Immer der Reihe nach', 'Always in order') },
          ],
          cmd: 'minispiele reihenfolge',
          label: t('Reihenfolge', 'Order'),
          help: t(
            'Gemischt: zufällig, aber keins doppelt, bis alle dran waren.',
            'Mixed: random, but none twice until all have had their turn.',
          ),
        }),
        party.number({
          key: 'miniFactor',
          at: 'minispiele.dauer-faktor',
          value: 1,
          min: 0.2,
          max: 3,
          step: 0.1,
          arg: 'faktor',
          cmd: 'minispiele dauer',
          label: t('Dauer der Minispiele (mal)', 'Length of minigames (times)'),
          help: t(
            '0,5 = halb so lang, 2 = doppelt so lang. Spiele mit festen Runden (Kuhglocke, Schäfchen zählen …) enden von selbst.',
            '0.5 = half as long, 2 = twice as long. Games with fixed rounds (Cowbell, Counting Sheep …) end by themselves.',
          ),
        }),
        ...MINIGAMES.map((m) =>
          party.flag({
            key: keyOf('mini', m.id),
            at: 'minispiele.auswahl',
            member: m.id,
            value: true,
            cmd: `minispiel ${m.id}`,
            label: m.name,
            help: m.help,
          }),
        ),
      ],
    },
    {
      id: 'rules',
      title: t('Spielregeln', 'Rules'),
      settings: [
        taler(
          'startTaler',
          'regeln.start-taler',
          10,
          100,
          'regel start',
          t('Taler zum Start', 'Coins at the start'),
          t('Damit beginnt jeder.', 'Everyone starts with this.'),
        ),
        taler(
          'blueField',
          'regeln.blaues-feld',
          3,
          50,
          'regel blau',
          t('Blaues Feld', 'Blue field'),
          t('So viele Taler gibt es dort.', 'This many coins are given there.'),
        ),
        taler(
          'redField',
          'regeln.rotes-feld',
          3,
          50,
          'regel rot',
          t('Rotes Feld', 'Red field'),
          t('So viele Taler kostet es dort.', 'This many coins are lost there.'),
        ),
        party.number({
          key: 'edelweissPrice',
          at: 'regeln.edelweiss-preis',
          value: 20,
          min: 1,
          max: 200,
          ...TALER,
          cmd: 'regel edelweiss',
          label: t('Preis eines Edelweiß', 'Price of an edelweiss'),
          help: t('Am wandernden Edelweiß-Stand.', 'At the wandering edelweiss stall.'),
        }),
        taler(
          'duelTaler',
          'regeln.duell-taler',
          5,
          100,
          'regel duell',
          t('Würfelduell', 'Dice duel'),
          t('So viele Taler gehen an den Sieger.', 'This many coins go to the winner.'),
        ),
        taler(
          'stealTaler',
          'regeln.klau-taler',
          7,
          100,
          'regel klau',
          t('Talerklau', 'Coin theft'),
          t('So viele Taler nimmt man jemandem ab.', 'This many coins are taken from someone.'),
        ),
        taler(
          'luckTaler',
          'regeln.glueck-taler',
          5,
          100,
          'regel glueck',
          t('Glück und Pech: Taler', 'Luck and bad luck: coins'),
          t('Bei Geschenk und Steinschlag.', 'For gifts and falling rocks.'),
        ),
        party.number({
          key: 'luckFields',
          at: 'regeln.glueck-felder',
          value: 3,
          min: 1,
          max: 20,
          unit: t('Felder', 'fields'),
          arg: 'felder',
          cmd: 'regel felder',
          label: t('Glück und Pech: Felder', 'Luck and bad luck: fields'),
          help: t(
            'So weit geht es bei Rückenwind vor und bei Nebel zurück.',
            'This far forward with tailwind and back in fog.',
          ),
        }),
        taler(
          'shareTaler',
          'regeln.teilen-taler',
          2,
          50,
          'regel teilen',
          t('Teilen', 'Sharing'),
          t('Taler je Person, wenn geteilt wird.', 'Coins per person when sharing.'),
        ),
        taler(
          'summitBonus',
          'regeln.gipfel-bonus',
          5,
          100,
          'regel gipfel',
          t('Gipfel-Bonus', 'Summit bonus'),
          t(
            'Edelweiß-Jagd: wer über das Ziel hinauskommt (dann mit der Seilbahn zurück).',
            'Edelweiss hunt: for going past the goal (then back down by cable car).',
          ),
        ),
        party.number({
          key: 'backpack',
          at: 'regeln.rucksack',
          value: 3,
          min: 1,
          max: 10,
          unit: t('Gegenstände', 'items'),
          cmd: 'regel rucksack',
          label: t('Platz im Rucksack', 'Room in the backpack'),
          help: t('So viele Gegenstände kann man tragen.', 'This many items can be carried.'),
        }),
        party.number({
          key: 'raceMaxRounds',
          at: 'regeln.gipfelrennen-max-runden',
          value: 20,
          min: 1,
          max: 100,
          unit: t('Runden', 'rounds'),
          arg: 'runden',
          cmd: 'regel rennen',
          label: t('Gipfelrennen: höchstens', 'Summit race: at most'),
          help: t(
            'Spätestens dann ist Schluss – es gewinnt, wer am weitesten oben ist.',
            'It ends then at the latest – whoever is highest up wins.',
          ),
        }),
      ],
    },
    {
      id: 'mini-taler',
      title: t('Taler für die Minispiele', 'Coins for the minigames'),
      text: t('Was es für die Plätze in einem Minispiel gibt.', 'What each place in a minigame earns.'),
      settings: MINI_TALER.map((value, i) =>
        taler(
          `miniTaler${i + 1}`,
          `regeln.minispiel-taler.${i}`,
          value,
          100,
          `minispiel-taler platz${i + 1}`,
          t(`Platz ${i + 1}`, `Place ${i + 1}`),
          t(`Taler für Platz ${i + 1}.`, `Coins for place ${i + 1}.`),
        ),
      ),
    },
  ],
};

// ---------------------------------------------------------------- Gipfelsturm

const gipfel = settingsFor('gipfelconfig');

export const GIPFELSTURM_AREA: SettingArea = {
  id: 'gipfelsturm',
  title: t('Gipfelsturm', 'Summit Rush'),
  text: t(
    'Parkour mit Bestzeiten, Geist und Party-Rennen.',
    'Parkour with best times, ghost and party races.',
  ),
  icon: 'Mountain',
  panel: 'modes',
  mode: { id: 'gipfelsturm', plugin: 'Gipfelsturm' },
  sections: [
    {
      id: 'runs',
      title: t('Läufe', 'Runs'),
      settings: [
        gipfel.flag({
          key: 'plausible',
          at: 'plausibel-pruefen',
          value: true,
          cmd: 'pruefen',
          label: t('Unmögliche Zeiten nicht werten', 'Do not count impossible times'),
          help: t(
            'Zeiten, die schneller sind als überhaupt möglich (z. B. durch Teleport oder Fliegen), kommen nicht in die Bestenliste.',
            'Times faster than possible at all (e.g. by teleporting or flying) do not go on the leaderboard.',
          ),
        }),
        gipfel.flag({
          key: 'ghostDefault',
          at: 'geist-standard',
          value: true,
          cmd: 'geist',
          label: t('Geist für neue Spieler', 'Ghost for new players'),
          help: t(
            'Der Geist zeigt die eigene Bestzeit als blaue Funken auf der Strecke. Jeder kann ihn für sich ein- und ausschalten – das hier gilt für neue Spieler.',
            'The ghost shows your own best time as blue sparks on the course. Everyone can switch it on and off – this applies to new players.',
          ),
        }),
      ],
    },
    {
      id: 'race',
      title: t('Party-Rennen', 'Party races'),
      settings: [
        gipfel.number({
          key: 'raceWait',
          at: 'rennen-wartezeit',
          value: 15,
          min: 5,
          max: 120,
          ...SECONDS,
          cmd: 'rennen',
          label: t('Zeit zum Mitmachen', 'Time to join'),
          help: t(
            'So lange haben Party-Mitglieder Zeit, bei einem Rennen mitzumachen.',
            'Party members have this long to join a race.',
          ),
        }),
      ],
    },
  ],
};

// ---------------------------------------------------------------- Burgverlies

const verlies = settingsFor('verliesconfig');

export const BURGVERLIES_AREA: SettingArea = {
  id: 'burgverlies',
  title: t('Burgverlies', 'Castle Dungeon'),
  text: t(
    'Koop-Abstieg für 1–4: wie viele gleichzeitig, wie lang, wie oft man wiederbelebt wird.',
    'Co-op descent for 1–4: how many at once, how long, how often you can be revived.',
  ),
  icon: 'KeyRound',
  panel: 'modes',
  mode: { id: 'burgverlies', plugin: 'MorniBurgverlies' },
  sections: [
    {
      id: 'dungeons',
      title: t('Verliese', 'Dungeons'),
      settings: [
        verlies.number({
          key: 'maxRuns',
          at: 'max-abstiege',
          value: 6,
          min: 1,
          max: 20,
          cmd: 'abstiege',
          label: t('Abstiege gleichzeitig', 'Descents at once'),
          help: t(
            'So viele Gruppen können gleichzeitig hinab – jede hat ihr eigenes Verlies.',
            'This many groups can go down at once – each has its own dungeon.',
          ),
        }),
        verlies.number({
          key: 'roomsPerFloor',
          at: 'raeume-pro-etage',
          value: 5,
          min: 3,
          max: 8,
          unit: t('Räume', 'rooms'),
          cmd: 'raeume',
          label: t('Räume pro Etage', 'Rooms per floor'),
          help: t(
            'Räume zwischen Ankunft und Krämerstube bzw. Thronsaal – mehr Räume = längerer Abstieg.',
            'Rooms between arrival and the shop or throne room – more rooms = a longer descent.',
          ),
        }),
        verlies.number({
          key: 'waveDelayTicks',
          at: 'wellen-pause-ticks',
          value: 30,
          min: 10,
          max: 200,
          ...TICKS,
          cmd: 'wellenpause',
          label: t('Pause zwischen zwei Wellen', 'Pause between two waves'),
          help: t(
            'In einem Kampfraum, bevor die nächsten Gegner kommen.',
            'In a fight room, before the next enemies come.',
          ),
        }),
      ],
    },
    {
      id: 'group',
      title: t('Gruppe und Wege', 'Group and ways'),
      settings: [
        verlies.number({
          key: 'searchSeconds',
          at: 'suche.warten-sekunden',
          value: 30,
          min: 3,
          max: 600,
          ...SECONDS,
          cmd: 'suche',
          label: t('Mitspieler suchen', 'Look for teammates'),
          help: t(
            'So lange wird nach Mitspielern gesucht, dann geht es mit allen los, die da sind.',
            'Teammates are searched for this long, then it starts with everyone who is there.',
          ),
        }),
        verlies.number({
          key: 'stairsSeconds',
          at: 'treppe-sekunden',
          value: 3,
          min: 1,
          max: 30,
          ...SECONDS,
          cmd: 'treppe',
          label: t('Auf der Treppe warten', 'Wait on the stairs'),
          help: t(
            'So lange müssen alle auf der Treppe der Krämerstube stehen, dann geht es eine Etage tiefer.',
            'Everyone has to stand on the stairs of the shop this long, then it goes one floor down.',
          ),
        }),
        verlies.number({
          key: 'endSeconds',
          at: 'ende-sekunden',
          value: 8,
          min: 2,
          max: 60,
          ...SECONDS,
          cmd: 'ende',
          label: t('Nach Sieg oder Niederlage', 'After victory or defeat'),
          help: t(
            'So lange bleibt man im Verlies, dann geht es zurück ins Torhaus.',
            'You stay in the dungeon this long, then it is back to the gatehouse.',
          ),
        }),
      ],
    },
    {
      id: 'revive',
      title: t('Wiederbeleben', 'Reviving'),
      settings: [
        verlies.number({
          key: 'revives',
          at: 'wiederbelebung.anzahl',
          value: 2,
          min: 0,
          max: 9,
          unit: t('mal', 'times'),
          cmd: 'wiederbeleben anzahl',
          label: t('Wiederbelebungen pro Person', 'Revives per person'),
          help: t('Pro Abstieg.', 'Per descent.'),
        }),
        verlies.number({
          key: 'reviveSeconds',
          at: 'wiederbelebung.schleichen-sekunden',
          value: 3,
          min: 1,
          max: 20,
          ...SECONDS,
          cmd: 'wiederbeleben dauer',
          label: t('Aufhelfen dauert', 'Helping up takes'),
          help: t(
            'So lange muss ein Mitspieler neben jemandem schleichen (Umschalt-Taste halten), um ihm aufzuhelfen.',
            'A teammate has to sneak next to someone this long (hold shift) to help them up.',
          ),
        }),
        verlies.number({
          key: 'bleedSeconds',
          at: 'wiederbelebung.ausbluten-sekunden',
          value: 0,
          min: 0,
          max: 600,
          ...SECONDS,
          cmd: 'wiederbeleben boden',
          label: t('Am Boden höchstens', 'On the ground at most'),
          help: t(
            'So lange kann man am Boden liegen, bevor man raus ist. 0 = nach Schwierigkeit (40, 30 oder 20 Sekunden).',
            'You can lie on the ground this long before you are out. 0 = by difficulty (40, 30 or 20 seconds).',
          ),
        }),
      ],
    },
  ],
};

// ---------------------------------------------------------------- Bollwerk

const bollwerk = settingsFor('bollwerkconfig');

export const BOLLWERK_AREA: SettingArea = {
  id: 'bollwerk',
  title: t('Bollwerk', 'Bulwark'),
  text: t(
    'Das Dorf gegen Welle um Welle verteidigen: Wachstube, Aufbauzeiten, Gulden und das Herz.',
    'Defend the village against wave after wave: guardroom, building times, guilders and the heart.',
  ),
  icon: 'Shield',
  panel: 'modes',
  mode: { id: 'bollwerk', plugin: 'MorniBollwerk' },
  sections: [
    {
      id: 'hall',
      title: t('Wachstube', 'Guardroom'),
      settings: [
        bollwerk.number({
          key: 'hallCountdown',
          at: 'wachstube.countdown-sekunden',
          value: 30,
          min: 3,
          max: 300,
          ...SECONDS,
          cmd: 'countdown',
          label: t('Countdown bis zur Runde', 'Countdown to the round'),
          help: t(
            'So lange läuft der Countdown, bevor eine Runde startet. Sagen alle „bereit“, geht es nach 5 Sekunden los.',
            'The countdown runs this long before a round starts. If everyone says “ready”, it starts after 5 seconds.',
          ),
        }),
        bollwerk.number({
          key: 'hallMinPlayers',
          at: 'wachstube.mindestens-spieler',
          value: 2,
          min: 1,
          max: 6,
          ...PLAYERS,
          cmd: 'mindestens',
          label: t('Countdown startet von selbst ab', 'Countdown starts by itself from'),
          help: t(
            'Ab so vielen Leuten in der Wachstube – sonst, sobald jemand „bereit“ sagt.',
            'From this many people in the guardroom – otherwise as soon as someone says “ready”.',
          ),
        }),
      ],
    },
    {
      id: 'round',
      title: t('Runde', 'Round'),
      settings: [
        bollwerk.number({
          key: 'maxPlayers',
          at: 'runde.hoechstens-spieler',
          value: 6,
          min: 1,
          max: 6,
          ...PLAYERS,
          cmd: 'hoechstens',
          label: t('Verteidiger höchstens', 'Defenders at most'),
          help: t('So viele dürfen in eine Runde (1 bis 6).', 'This many may join a round (1 to 6).'),
        }),
        bollwerk.number({
          key: 'firstPrepare',
          at: 'runde.erster-aufbau-sekunden',
          value: 30,
          min: 3,
          max: 300,
          ...SECONDS,
          cmd: 'aufbau-erste',
          label: t('Aufbau vor der ersten Welle', 'Building before the first wave'),
          help: t('Zeit zum Bauen und Einkaufen am Anfang.', 'Time for building and shopping at the start.'),
        }),
        bollwerk.number({
          key: 'prepare',
          at: 'runde.aufbau-sekunden',
          value: 25,
          min: 3,
          max: 300,
          ...SECONDS,
          cmd: 'aufbau',
          label: t('Aufbau zwischen den Wellen', 'Building between waves'),
          help: t(
            'Zeit zum Bauen und Einkaufen zwischen zwei Wellen.',
            'Time for building and shopping between two waves.',
          ),
        }),
        bollwerk.number({
          key: 'afterSeconds',
          at: 'runde.nachspiel-sekunden',
          value: 10,
          min: 1,
          max: 60,
          ...SECONDS,
          cmd: 'nachspiel',
          label: t('Nach dem Ende', 'After the end'),
          help: t('So lange bis zurück in die Wachstube.', 'This long until back in the guardroom.'),
        }),
        bollwerk.number({
          key: 'startGold',
          at: 'runde.startgeld',
          value: 50,
          min: 0,
          max: 10000,
          unit: t('Gulden', 'guilders'),
          arg: 'gulden',
          cmd: 'startgeld',
          label: t('Gulden zum Start', 'Guilders at the start'),
          help: t(
            'Damit kauft man im Krämerladen und baut Türme.',
            'Used to buy in the shop and build towers.',
          ),
        }),
        bollwerk.number({
          key: 'heartHealth',
          at: 'runde.herz-leben',
          value: 400,
          min: 50,
          max: 5000,
          unit: t('Lebenspunkte', 'health points'),
          arg: 'punkte',
          cmd: 'herz',
          label: t('Leben des Herzens', 'Health of the heart'),
          help: t(
            'Das Herz ist der Dorfbrunnen bzw. die Klosterglocke. Fällt es auf 0, ist die Runde verloren.',
            'The heart is the village fountain or the monastery bell. If it drops to 0, the round is lost.',
          ),
        }),
      ],
    },
    {
      id: 'rescue',
      title: t('Am Boden und retten', 'Down and rescue'),
      settings: [
        bollwerk.number({
          key: 'downSeconds',
          at: 'runde.am-boden-sekunden',
          value: 25,
          min: 3,
          max: 300,
          ...SECONDS,
          cmd: 'boden',
          label: t('Am Boden höchstens', 'On the ground at most'),
          help: t(
            'So lange liegt man am Boden, bevor man ausscheidet – in der Zeit können Mitspieler retten.',
            'You lie on the ground this long before you are out – teammates can rescue you in that time.',
          ),
        }),
        bollwerk.number({
          key: 'reviveSeconds',
          at: 'runde.retten-sekunden',
          value: 3,
          min: 1,
          max: 30,
          ...SECONDS,
          cmd: 'retten',
          label: t('Retten dauert', 'Rescuing takes'),
          help: t(
            'So lange muss man sich neben jemanden ducken (Umschalt-Taste halten).',
            'You have to crouch next to someone this long (hold shift).',
          ),
        }),
      ],
    },
  ],
};

// ---------------------------------------------------------------- MorniSMP

const smp = settingsFor('smpconfig');

/** Was die Stadt ankauft (Kennung in der config.yml, Wort im Befehl, Name, Preis pro Stück, volle Menge am Tag). */
const BUYBACK: ReadonlyArray<readonly [string, string, string, string, number, number]> = [
  ['wheat', 'weizen', 'Weizen', 'Wheat', 0.5, 256],
  ['carrot', 'karotte', 'Karotte', 'Carrot', 0.3, 256],
  ['potato', 'kartoffel', 'Kartoffel', 'Potato', 0.3, 256],
  ['beetroot', 'rote-bete', 'Rote Bete', 'Beetroot', 0.4, 256],
  ['melon_slice', 'melone', 'Melonenscheibe', 'Melon slice', 0.1, 512],
  ['pumpkin', 'kuerbis', 'Kürbis', 'Pumpkin', 1, 128],
  ['sugar_cane', 'zuckerrohr', 'Zuckerrohr', 'Sugar cane', 0.4, 256],
  ['cactus', 'kaktus', 'Kaktus', 'Cactus', 0.3, 256],
  ['bamboo', 'bambus', 'Bambus', 'Bamboo', 0.05, 512],
  ['cocoa_beans', 'kakao', 'Kakaobohnen', 'Cocoa beans', 0.4, 256],
  ['nether_wart', 'netherwarze', 'Netherwarze', 'Nether wart', 0.5, 256],
  ['sweet_berries', 'suessbeeren', 'Süßbeeren', 'Sweet berries', 0.2, 256],
  ['apple', 'apfel', 'Apfel', 'Apple', 1, 64],
  ['egg', 'ei', 'Ei', 'Egg', 0.3, 128],
  ['rotten_flesh', 'fleisch-verrottet', 'Verrottetes Fleisch', 'Rotten flesh', 0.1, 512],
  ['bone', 'knochen', 'Knochen', 'Bone', 0.3, 256],
  ['string', 'faden', 'Faden', 'String', 0.4, 256],
  ['spider_eye', 'spinnenauge', 'Spinnenauge', 'Spider eye', 0.4, 128],
  ['gunpowder', 'schwarzpulver', 'Schwarzpulver', 'Gunpowder', 1, 128],
  ['arrow', 'pfeil', 'Pfeil', 'Arrow', 0.1, 256],
  ['ender_pearl', 'enderperle', 'Enderperle', 'Ender pearl', 3, 32],
  ['slime_ball', 'schleimball', 'Schleimball', 'Slimeball', 1, 64],
  ['blaze_rod', 'lohenrute', 'Lohenrute', 'Blaze rod', 4, 32],
  ['leather', 'leder', 'Leder', 'Leather', 1, 64],
  ['feather', 'feder', 'Feder', 'Feather', 0.2, 256],
  ['white_wool', 'wolle', 'Weiße Wolle', 'White wool', 0.5, 128],
  ['ink_sac', 'tintenbeutel', 'Tintenbeutel', 'Ink sac', 0.5, 64],
  ['beef', 'rind', 'Rohes Rindfleisch', 'Raw beef', 0.6, 128],
  ['porkchop', 'schwein', 'Rohes Schweinefleisch', 'Raw porkchop', 0.6, 128],
  ['chicken', 'huhn', 'Rohes Hühnchen', 'Raw chicken', 0.5, 128],
  ['mutton', 'hammel', 'Rohes Hammelfleisch', 'Raw mutton', 0.5, 128],
  ['cod', 'kabeljau', 'Roher Kabeljau', 'Raw cod', 0.5, 128],
  ['salmon', 'lachs', 'Roher Lachs', 'Raw salmon', 0.6, 128],
];

/** Ringe des Zufalls-Teleports: kleinster und größter Abstand zur Weltmitte (wie in der config.yml). */
const RTP_RINGS: ReadonlyArray<readonly [string, Text, number, number]> = [
  ['nah', t('Nah', 'Near'), 500, 2000],
  ['mittel', t('Mittel', 'Middle'), 2000, 5000],
  ['weit', t('Weit', 'Far'), 5000, 9500],
  ['nether', t('Nether', 'Nether'), 100, 1100],
  ['end', t('End', 'End'), 1000, 5000],
];

/** Ankauf: die Stufen 2–4 (Stufe 1 = voller Preis bis zur Tagesmenge, die setzt der Modus selbst). */
const BUYBACK_TIERS: ReadonlyArray<readonly [number, number]> = [
  [1, 50],
  [2, 20],
  [4, 5],
];

const MAX_TALER = 100_000;
const money = (key: string, at: string, value: number, cmd: string, label: Text, help: Text): SettingDef =>
  smp.number({ key, at, value, min: 0, max: MAX_TALER, step: 0.01, ...TALER, cmd, label, help });
const fee = (key: string, at: string, value: number, cmd: string, label: Text, help: Text): SettingDef =>
  smp.number({ key, at, value, min: 0, max: 50, step: 0.1, ...PERCENT, cmd, label, help });

export const SMP_AREA: SettingArea = {
  id: 'smp',
  title: t('MorniSMP', 'MorniSMP'),
  text: t(
    'Überleben mit freiem Markt: Taler, Weltgrenzen, Reisen, Auktionshaus, Aufträge, Stände, Grundstücke, Ankauf der Stadt und tägliche Belohnung. Nichts davon gibt es für echtes Geld.',
    'Survival with a free market: coins, world borders, travel, auction house, orders, stalls, plots, the town’s buyback and the daily reward. None of it is for real money.',
  ),
  icon: 'Store',
  panel: 'modes',
  mode: { id: 'mirni', plugin: 'MorniSMP' },
  sections: [
    {
      id: 'money',
      title: t('Taler', 'Coins'),
      text: t(
        'Beträge in Talern, mit Komma für Cent (2,50 Taler).',
        'Amounts in coins, with decimals for cents (2.50 coins).',
      ),
      settings: [
        smp.text({
          key: 'currencySymbol',
          at: 'waehrung.zeichen',
          value: '₮',
          maxLength: 3,
          arg: 'zeichen',
          cmd: 'zeichen',
          label: t('Zeichen der Taler', 'Sign of the coins'),
          help: t('Steht hinter jedem Betrag.', 'Shown after every amount.'),
        }),
        money(
          'startBalance',
          'waehrung.startguthaben',
          100,
          'startgeld',
          t('Startguthaben', 'Starting balance'),
          t(
            'So viel bekommt jeder beim allerersten Betreten.',
            'Everyone gets this much on their very first visit.',
          ),
        ),
        money(
          'payConfirmAbove',
          'waehrung.zahlen-bestaetigen-ab',
          1000,
          'nachfragen-ab',
          t('Nachfragen ab', 'Ask again from'),
          t(
            'Ab diesem Betrag fragt /zahlen noch einmal nach („Wirklich?“). 0 = nie.',
            'From this amount /zahlen asks once more (“Really?”). 0 = never.',
          ),
        ),
        money(
          'bountyMinimum',
          'kopfgeld.mindestens',
          50,
          'kopfgeld',
          t('Kopfgeld mindestens', 'Bounty at least'),
          t('Kleinster Betrag für ein Kopfgeld.', 'Smallest amount for a bounty.'),
        ),
      ],
    },
    {
      id: 'world',
      title: t('Welt', 'World'),
      settings: [
        smp.number({
          key: 'borderOverworld',
          at: 'welt.grenze-radius',
          value: 10000,
          min: 500,
          max: 1_000_000,
          ...BLOCKS,
          cmd: 'grenze oberwelt',
          label: t('Weltgrenze Oberwelt', 'World border overworld'),
          help: t(
            'Abstand von der Weltmitte (0/0) bis zum Rand.',
            'Distance from the world centre (0/0) to the edge.',
          ),
        }),
        smp.number({
          key: 'borderNether',
          at: 'welt.grenze-radius-nether',
          value: 1250,
          min: 100,
          max: 1_000_000,
          ...BLOCKS,
          cmd: 'grenze nether',
          label: t('Weltgrenze Nether', 'World border Nether'),
          help: t(
            'Im Nether zählt jeder Block acht in der Oberwelt.',
            'In the Nether every block counts as eight in the overworld.',
          ),
        }),
        smp.number({
          key: 'borderEnd',
          at: 'welt.grenze-radius-end',
          value: 10000,
          min: 500,
          max: 1_000_000,
          ...BLOCKS,
          cmd: 'grenze end',
          label: t('Weltgrenze End', 'World border End'),
          help: t('Abstand von der Hauptinsel bis zum Rand.', 'Distance from the main island to the edge.'),
        }),
        smp.number({
          key: 'combatSeconds',
          at: 'welt.kampf-sekunden',
          value: 15,
          min: 0,
          max: 120,
          ...SECONDS,
          cmd: 'kampf',
          label: t('Im Kampf nach einem Treffer', 'In combat after a hit'),
          help: t(
            'So lange gibt es nach einem Treffer keine Teleports. Wer sich dann ausloggt, stirbt – das Kopfgeld geht an den Gegner. 0 = aus.',
            'No teleports for this long after a hit. Logging out then means dying – the bounty goes to the opponent. 0 = off.',
          ),
        }),
      ],
    },
    {
      id: 'travel',
      title: t('Reisen und Zuhause', 'Travel and homes'),
      settings: [
        smp.choice({
          key: 'gateOverworld',
          at: 'reisetore.oberwelt',
          value: 'nah',
          options: [
            { value: 'nah', label: t('Nah', 'Near') },
            { value: 'mittel', label: t('Mittel', 'Middle') },
            { value: 'weit', label: t('Weit', 'Far') },
          ],
          cmd: 'reisetor',
          label: t('Reisetor zur Oberwelt bringt', 'Gate to the overworld takes you'),
          help: t(
            'Welcher Ring des Zufalls-Teleports (Abstände unten).',
            'Which ring of the random teleport (distances below).',
          ),
        }),
        smp.number({
          key: 'teleportDelay',
          at: 'teleport.wartezeit-sekunden',
          value: 3,
          min: 0,
          max: 30,
          ...SECONDS,
          cmd: 'teleport warten',
          label: t('Stillhalten vor jedem Teleport', 'Stand still before every teleport'),
          help: t('Wer sich bewegt, bricht ab. 0 = sofort.', 'Moving cancels it. 0 = at once.'),
        }),
        smp.flag({
          key: 'adminsInstant',
          at: 'teleport.admins-sofort',
          value: true,
          cmd: 'teleport team-sofort',
          label: t('Team reist sofort', 'Team travels at once'),
          help: t('Admins teleportieren ohne Wartezeit.', 'Admins teleport without waiting.'),
        }),
        smp.number({
          key: 'maxHomes',
          at: 'teleport.zuhause-max',
          value: 3,
          min: 1,
          max: 50,
          cmd: 'zuhause',
          label: t('Zuhause pro Spieler', 'Homes per player'),
          help: t(
            'So viele Orte kann jeder mit /sethome speichern.',
            'This many places everyone can save with /sethome.',
          ),
        }),
        smp.number({
          key: 'rtpCooldown',
          at: 'zufallsteleport.abklingzeit-sekunden',
          value: 60,
          min: 0,
          max: 3600,
          ...SECONDS,
          cmd: 'rtp pause',
          label: t('Pause nach einem Zufalls-Teleport', 'Pause after a random teleport'),
          help: t('So lange bis zum nächsten /rtp.', 'This long until the next /rtp.'),
        }),
      ],
    },
    {
      id: 'rtp',
      title: t('Zufalls-Teleport: Abstände', 'Random teleport: distances'),
      text: t(
        'Kleinster und größter Abstand zur Weltmitte. „Bis“ muss größer sein als „von“ (sonst gilt der Standard) und innerhalb der Weltgrenze liegen.',
        'Smallest and largest distance to the world centre. “To” has to be larger than “from” (otherwise the default applies) and inside the world border.',
      ),
      settings: RTP_RINGS.flatMap(([id, name, from, to]) =>
        (
          [
            [0, from, 'von', t('von', 'from')],
            [1, to, 'bis', t('bis', 'to')],
          ] as const
        ).map(([i, value, word, edge]) =>
          smp.number({
            key: keyOf('rtp', `${id}-${word}`),
            at: `zufallsteleport.${id}.${i}`,
            value,
            min: 0,
            max: 1_000_000,
            ...BLOCKS,
            cmd: `rtp ${id}-${word}`,
            label: t(`${name.de}: ${edge.de}`, `${name.en}: ${edge.en}`),
            help: t(`Ring „${name.de}“ beginnt bzw. endet hier.`, `Ring “${name.en}” starts or ends here.`),
          }),
        ),
      ),
    },
    {
      id: 'market',
      title: t('Auktionshaus, Aufträge, Läden', 'Auction house, orders, shops'),
      text: t(
        'Gebühren gehen an die Stadt – sie nehmen Taler aus dem Spiel, damit sie ihren Wert behalten.',
        'Fees go to the town – they take coins out of the game so they keep their value.',
      ),
      settings: [
        fee(
          'auctionFee',
          'auktionshaus.gebuehr-prozent',
          2,
          'auktion gebuehr',
          t('Auktionshaus: Gebühr', 'Auction house: fee'),
          t('Vom Erlös beim Verkauf.', 'From the proceeds of a sale.'),
        ),
        smp.number({
          key: 'auctionHours',
          at: 'auktionshaus.dauer-stunden',
          value: 48,
          min: 1,
          max: 720,
          ...HOURS,
          cmd: 'auktion dauer',
          label: t('Auktionshaus: Angebot steht', 'Auction house: offer stays'),
          help: t('Danach liegt es im Abholfach.', 'After that it waits in the pick-up box.'),
        }),
        smp.number({
          key: 'auctionMax',
          at: 'auktionshaus.max-angebote',
          value: 10,
          min: 1,
          max: 100,
          cmd: 'auktion max',
          label: t('Auktionshaus: Angebote pro Spieler', 'Auction house: offers per player'),
          help: t('Gleichzeitig.', 'At the same time.'),
        }),
        fee(
          'orderFee',
          'auftraege.gebuehr-prozent',
          2,
          'auftrag gebuehr',
          t('Aufträge: Gebühr', 'Orders: fee'),
          t('Vom Lohn dessen, der liefert.', 'From the pay of whoever delivers.'),
        ),
        smp.number({
          key: 'orderDays',
          at: 'auftraege.dauer-tage',
          value: 7,
          min: 1,
          max: 60,
          ...DAYS,
          cmd: 'auftrag dauer',
          label: t('Aufträge: laufen', 'Orders: run for'),
          help: t('Danach bekommt man den Rest zurück.', 'After that the rest is given back.'),
        }),
        smp.number({
          key: 'orderMax',
          at: 'auftraege.max-auftraege',
          value: 5,
          min: 1,
          max: 50,
          cmd: 'auftrag max',
          label: t('Aufträge pro Spieler', 'Orders per player'),
          help: t('Gleichzeitig.', 'At the same time.'),
        }),
        fee(
          'shopFee',
          'laeden.gebuehr-prozent',
          0,
          'laden gebuehr',
          t('Ladenkisten: Gebühr', 'Shop chests: fee'),
          t('0 = keine.', '0 = none.'),
        ),
      ],
    },
    {
      id: 'stalls',
      title: t('Marktstände', 'Market stalls'),
      settings: [
        money(
          'stallRent',
          'marktstaende.miete-pro-woche',
          300,
          'stand miete',
          t('Miete pro Woche', 'Rent per week'),
          t('Für einen Stand auf dem Marktplatz.', 'For a stall on the market square.'),
        ),
        smp.number({
          key: 'stallWarnHours',
          at: 'marktstaende.warnen-stunden-vorher',
          value: 24,
          min: 1,
          max: 168,
          ...HOURS,
          cmd: 'stand warnen',
          label: t('Erinnern vor dem Ablauf', 'Remind before it ends'),
          help: t(
            'So lange vorher bekommt der Mieter einen Hinweis.',
            'The renter gets a note this long before.',
          ),
        }),
        smp.number({
          key: 'stallWeeks',
          at: 'marktstaende.max-wochen-im-voraus',
          value: 4,
          min: 1,
          max: 52,
          ...WEEKS,
          cmd: 'stand voraus',
          label: t('Im Voraus zahlen', 'Pay in advance'),
          help: t('So viele Wochen höchstens.', 'At most this many weeks.'),
        }),
      ],
    },
    {
      id: 'claims',
      title: t('Grundstücke', 'Plots'),
      text: t(
        'In Oberwelt, Nether und End. Ein Grundstücks-Stück (Chunk) ist 16 × 16 Blöcke groß.',
        'In the overworld, Nether and End. One plot piece (chunk) is 16 × 16 blocks.',
      ),
      settings: [
        smp.number({
          key: 'claimsFree',
          at: 'grundstuecke.gratis',
          value: 4,
          min: 0,
          max: 1000,
          unit: t('Stücke', 'pieces'),
          cmd: 'grundstueck gratis',
          label: t('Gratis', 'Free'),
          help: t('So viele Stücke bekommt jeder umsonst.', 'Everyone gets this many pieces for free.'),
        }),
        money(
          'claimPrice',
          'grundstuecke.preis',
          250,
          'grundstueck preis',
          t('Preis jedes weiteren Stücks', 'Price of every further piece'),
          t('Nach den Gratis-Stücken.', 'After the free pieces.'),
        ),
        smp.number({
          key: 'claimsMax',
          at: 'grundstuecke.max',
          value: 64,
          min: 1,
          max: 10000,
          unit: t('Stücke', 'pieces'),
          cmd: 'grundstueck max',
          label: t('Höchstens pro Spieler', 'At most per player'),
          help: t('Mehr kann niemand sichern.', 'Nobody can claim more.'),
        }),
      ],
    },
    {
      id: 'buyback',
      title: t('Ankauf der Stadt: Stufen', 'Town buyback: tiers'),
      text: t(
        'Die Stadt kauft Ernte und Beute an. Bis zur Tagesmenge zahlt sie den vollen Preis, danach weniger: ab dem Vielfachen der Tagesmenge nur noch so viel Prozent. Das hält die Preise fair.',
        'The town buys harvest and loot. Up to the daily amount it pays the full price, after that less: from a multiple of the daily amount only this many percent. That keeps prices fair.',
      ),
      settings: BUYBACK_TIERS.flatMap(([from, percent], i) => [
        smp.number({
          key: `tier${i + 2}From`,
          at: `ankauf.stufen.${i + 1}.ab`,
          value: from,
          min: 0,
          max: 50,
          step: 0.5,
          unit: t('× Tagesmenge', '× daily amount'),
          arg: 'vielfaches',
          cmd: `ankauf stufe${i + 2}-ab`,
          label: t(`Stufe ${i + 2}: ab`, `Tier ${i + 2}: from`),
          help: t(
            `Ab dem Wievielfachen der Tagesmenge Stufe ${i + 2} gilt.`,
            `From which multiple of the daily amount tier ${i + 2} applies.`,
          ),
        }),
        smp.number({
          key: `tier${i + 2}Percent`,
          at: `ankauf.stufen.${i + 1}.prozent`,
          value: percent,
          min: 0,
          max: 100,
          ...PERCENT,
          cmd: `ankauf stufe${i + 2}-prozent`,
          label: t(`Stufe ${i + 2}: Preis`, `Tier ${i + 2}: price`),
          help: t('So viel Prozent des vollen Preises.', 'This many percent of the full price.'),
        }),
      ]),
    },
    {
      id: 'buyback-prices',
      title: t('Ankauf der Stadt: Preis pro Stück', 'Town buyback: price per piece'),
      text: t(
        'Voller Preis bis zur Tagesmenge (nächster Abschnitt).',
        'Full price up to the daily amount (next section).',
      ),
      settings: BUYBACK.map(([id, word, de, en, price]) =>
        money(
          keyOf('price', id.replaceAll('_', '-')),
          `ankauf.preise.${id}.preis`,
          price,
          `ankauf ${word} preis`,
          t(de, en),
          t(`Preis für ein Stück ${de}.`, `Price for one piece of ${en.toLowerCase()}.`),
        ),
      ),
    },
    {
      id: 'buyback-daily',
      title: t('Ankauf der Stadt: Tagesmenge', 'Town buyback: daily amount'),
      text: t(
        'So viele Stück kauft die Stadt jedem pro Tag zum vollen Preis ab, danach gelten die Stufen.',
        'The town buys this many pieces from everyone per day at the full price, after that the tiers apply.',
      ),
      settings: BUYBACK.map(([id, word, de, en, , daily]) =>
        smp.number({
          key: keyOf('daily', id.replaceAll('_', '-')),
          at: `ankauf.preise.${id}.tag`,
          value: daily,
          min: 1,
          max: 100_000,
          unit: t('Stück', 'pieces'),
          cmd: `ankauf ${word} tag`,
          label: t(de, en),
          help: t(`Tagesmenge für ${de}.`, `Daily amount for ${en.toLowerCase()}.`),
        }),
      ),
    },
    {
      id: 'reward',
      title: t('Tägliche Belohnung', 'Daily reward'),
      text: t(
        'Mit /belohnung einmal am Tag – wer mehrere Tage in Folge kommt, bekommt mehr.',
        'With /belohnung once a day – whoever comes several days in a row gets more.',
      ),
      settings: [
        smp.number({
          key: 'rewardMinutes',
          at: 'belohnung.mindest-minuten',
          value: 15,
          min: 0,
          max: 600,
          ...MINUTES,
          cmd: 'belohnung minuten',
          label: t('Vorher gespielt', 'Played before'),
          help: t(
            'So lange muss man heute schon gespielt haben.',
            'You have to have played this long today.',
          ),
        }),
        money(
          'rewardTaler',
          'belohnung.taler',
          25,
          'belohnung taler',
          t('Taler', 'Coins'),
          t('Am ersten Tag.', 'On the first day.'),
        ),
        money(
          'rewardPerDay',
          'belohnung.plus-pro-serientag',
          5,
          'belohnung plus',
          t('Mehr pro Tag in Folge', 'More per day in a row'),
          t('Kommt für jeden weiteren Tag in Folge dazu.', 'Added for every further day in a row.'),
        ),
        smp.number({
          key: 'rewardMaxStreak',
          at: 'belohnung.max-serie',
          value: 7,
          min: 1,
          max: 365,
          ...DAYS,
          cmd: 'belohnung serie',
          label: t('Wächst bis', 'Grows up to'),
          help: t('Danach bleibt die Belohnung gleich.', 'After that the reward stays the same.'),
        }),
        smp.list({
          key: 'rewardItems',
          at: 'belohnung.gegenstaende',
          value: ['bread:8', 'torch:16'],
          maxItems: 20,
          maxLength: 48,
          arg: 'name:anzahl',
          cmd: 'belohnung sachen',
          label: t('Gegenstände dazu', 'Items as well'),
          help: t(
            'Je Eintrag Name des Gegenstands (wie in Minecraft, englisch) und Anzahl, z. B. bread:8 = 8 Brote.',
            'Each entry is the item name (as in Minecraft) and the amount, e.g. bread:8 = 8 bread.',
          ),
        }),
        smp.list({
          key: 'rewardWeekItems',
          at: 'belohnung.gegenstaende-ab-serie-7',
          value: ['bread:16', 'torch:32', 'experience_bottle:4'],
          maxItems: 20,
          maxLength: 48,
          arg: 'name:anzahl',
          cmd: 'belohnung sachen-woche',
          label: t('Gegenstände ab dem 7. Tag in Folge', 'Items from the 7th day in a row'),
          help: t('Statt der Gegenstände darüber.', 'Instead of the items above.'),
        }),
      ],
    },
    {
      id: 'display',
      title: t('Anzeige', 'Display'),
      settings: [
        smp.flag({
          key: 'sidebarDefault',
          at: 'anzeige.leiste-standard',
          value: true,
          cmd: 'leiste',
          label: t('Leiste rechts für Neue', 'Bar on the right for newcomers'),
          help: t(
            'Jeder kann sie mit /leiste für sich aus- und einschalten.',
            'Everyone can switch it off and on with /leiste.',
          ),
        }),
        smp.text({
          key: 'address',
          at: 'anzeige.adresse',
          value: 'morni.net',
          maxLength: 64,
          arg: 'adresse',
          cmd: 'adresse',
          label: t('Adresse unten in der Leiste', 'Address at the bottom of the bar'),
          help: t('So finden Freunde den Server.', 'So friends find the server.'),
        }),
      ],
    },
  ],
};

// ---------------------------------------------------------------- Wolkenkampf

const wolken = settingsFor('wolkenconfig');

export const WOLKENKAMPF_AREA: SettingArea = {
  id: 'wolkenkampf',
  title: t('Wolkenkampf', 'Cloud Clash'),
  text: t(
    'Insel-Kampf in den Wolken: Countdown im Wolkenhafen, Größe der Runden und wann Nachschub, Gewitter und Nebel kommen.',
    'Island battle in the clouds: countdown in the cloud harbour, size of the rounds and when supplies, thunderstorm and fog arrive.',
  ),
  icon: 'Cloud',
  panel: 'modes',
  mode: { id: 'wolkenkampf', plugin: 'MorniWolkenkampf' },
  sections: [
    {
      id: 'harbour',
      title: t('Wolkenhafen', 'Cloud harbour'),
      text: t(
        'Der Wartebereich: Hier stimmen alle über Karte und Spielart ab und sagen „bereit“.',
        'The waiting area: everyone votes on the map and the mode here and says “ready”.',
      ),
      settings: [
        wolken.number({
          key: 'countdown',
          at: 'wolkenhafen.countdown-sekunden',
          value: 30,
          min: 5,
          max: 300,
          ...SECONDS,
          cmd: 'countdown',
          label: t('Countdown vor der Runde', 'Countdown before the round'),
          help: t(
            'So lange läuft der Countdown, bevor eine Runde startet. Sagen alle „bereit“, geht es nach 5 Sekunden los.',
            'The countdown runs this long before a round starts. If everyone says “ready”, it starts after 5 seconds.',
          ),
        }),
        wolken.number({
          key: 'minPlayers',
          at: 'wolkenhafen.mindestens-spieler',
          value: 2,
          min: 2,
          max: 12,
          ...PLAYERS,
          cmd: 'mindestens',
          label: t('Countdown startet ab', 'Countdown starts from'),
          help: t(
            'Ab so vielen Leuten beginnt der Countdown von selbst – vorher, sobald jemand „bereit“ sagt.',
            'From this many people the countdown starts by itself – before that, as soon as someone says “ready”.',
          ),
        }),
      ],
    },
    {
      id: 'round',
      title: t('Runde', 'Round'),
      settings: [
        wolken.number({
          key: 'maxPlayers',
          at: 'runde.hoechstens-spieler',
          value: 12,
          min: 2,
          max: 12,
          ...PLAYERS,
          cmd: 'hoechstens',
          label: t('Höchstens in einer Runde', 'At most in one round'),
          help: t(
            'Jede Karte hat zwölf Startinseln – zu zweit sind es höchstens sechs Teams.',
            'Every map has twelve starting islands – in pairs there are at most six teams.',
          ),
        }),
        wolken.number({
          key: 'gondolaSeconds',
          at: 'runde.gondel-sekunden',
          value: 10,
          min: 3,
          max: 60,
          ...SECONDS,
          cmd: 'gondel',
          label: t('Warten in der Ballon-Gondel', 'Waiting in the balloon gondola'),
          help: t(
            'So lange schwebt jedes Team in seiner Gondel über der Insel, bevor sich der Boden öffnet.',
            'Each team floats in its gondola above the island this long before the floor opens.',
          ),
        }),
        wolken.number({
          key: 'afterRound',
          at: 'runde.nachspiel-sekunden',
          value: 8,
          min: 2,
          max: 60,
          ...SECONDS,
          cmd: 'nachspiel',
          label: t('Nach der Runde', 'After the round'),
          help: t(
            'So lange bleiben alle nach dem Sieg auf der Karte, dann geht es zurück in den Wolkenhafen.',
            'Everyone stays on the map this long after the win, then it is back to the cloud harbour.',
          ),
        }),
      ],
    },
    {
      id: 'events',
      title: t('Ereignisse', 'Events'),
      text: t(
        'Damit jede Runde ein Ende hat: Sekunden nach dem Öffnen der Gondeln. Jedes Ereignis wird 15 Sekunden vorher angekündigt.',
        'So every round comes to an end: seconds after the gondolas open. Every event is announced 15 seconds before.',
      ),
      settings: [
        wolken.number({
          key: 'refill',
          at: 'ereignisse.nachschub',
          value: 150,
          min: 30,
          max: 1800,
          ...SECONDS,
          cmd: 'nachschub',
          label: t('Nachschub', 'Supplies'),
          help: t(
            'Alle Truhen füllen sich neu (150 = nach 2:30 Minuten).',
            'All chests are filled again (150 = after 2:30 minutes).',
          ),
        }),
        wolken.number({
          key: 'storm',
          at: 'ereignisse.gewitter',
          value: 270,
          min: 30,
          max: 1800,
          ...SECONDS,
          cmd: 'gewitter',
          label: t('Gewitter', 'Thunderstorm'),
          help: t(
            'Es regnet, Blitze schlagen an zufälligen Stellen ein – vorher knistert es dort.',
            'It rains and lightning strikes at random spots – it crackles there first.',
          ),
        }),
        wolken.number({
          key: 'fog',
          at: 'ereignisse.nebel',
          value: 390,
          min: 60,
          max: 3600,
          ...SECONDS,
          cmd: 'nebel',
          label: t('Nebel', 'Fog'),
          help: t(
            'Nebel steigt von unten auf – wer darin steht, nimmt Schaden, der immer stärker wird.',
            'Fog rises from below – whoever stands in it takes damage that keeps getting stronger.',
          ),
        }),
        wolken.number({
          key: 'fogDuration',
          at: 'ereignisse.nebel-dauer',
          value: 180,
          min: 30,
          max: 900,
          ...SECONDS,
          cmd: 'nebel-dauer',
          label: t('So lange steigt der Nebel', 'Fog rises for'),
          help: t(
            'So lange braucht der Nebel, bis er über allen Inseln steht.',
            'This is how long the fog takes to cover all islands.',
          ),
        }),
      ],
    },
  ],
};

// ---------------------------------------------------------------- Versteckerl

const versteck = settingsFor('versteckconfig');

export const VERSTECKERL_AREA: SettingArea = {
  id: 'versteckerl',
  title: t('Versteckerl', 'Hide & Seek'),
  text: t(
    'Verstecken mit Verwandlung: Zeiten, wie viele Gendarmen suchen, wie viel ein Treffer zählt und die Hilfen (Pfiff, Sprungkraft, Spürnase).',
    'Hide and seek with a twist: times, how many constables seek, what a hit counts and the helpers (whistle, jump boost, sniffer).',
  ),
  icon: 'EyeOff',
  panel: 'modes',
  mode: { id: 'versteckerl', plugin: 'MorniVersteckerl' },
  sections: [
    {
      id: 'station',
      title: t('Gendarmerie', 'Constabulary'),
      text: t('Der Wartebereich vor jeder Runde.', 'The waiting area before every round.'),
      settings: [
        versteck.number({
          key: 'countdown',
          at: 'gendarmerie.countdown-sekunden',
          value: 30,
          min: 5,
          max: 300,
          ...SECONDS,
          cmd: 'countdown',
          label: t('Countdown vor der Runde', 'Countdown before the round'),
          help: t(
            'So lange läuft der Countdown. Sagen alle „bereit“, geht es nach 5 Sekunden los.',
            'The countdown runs this long. If everyone says “ready”, it starts after 5 seconds.',
          ),
        }),
        versteck.number({
          key: 'minPlayers',
          at: 'gendarmerie.mindestens-spieler',
          value: 4,
          min: 2,
          max: 16,
          ...PLAYERS,
          cmd: 'mindestens',
          label: t('Countdown startet von selbst ab', 'Countdown starts by itself from'),
          help: t(
            'Mit weniger Leuten (aber mindestens 2) geht es nur los, wenn alle „bereit“ sind.',
            'With fewer people (but at least 2) it only starts when everyone is “ready”.',
          ),
        }),
      ],
    },
    {
      id: 'round',
      title: t('Runde', 'Round'),
      settings: [
        versteck.number({
          key: 'maxPlayers',
          at: 'runde.hoechstens-spieler',
          value: 16,
          min: 2,
          max: 16,
          ...PLAYERS,
          cmd: 'hoechstens',
          label: t('Höchstens in einer Runde', 'At most in one round'),
          help: t('Partys bleiben zusammen.', 'Parties stay together.'),
        }),
        versteck.number({
          key: 'seekerShare',
          at: 'runde.sucher-anteil-prozent',
          value: 25,
          min: 5,
          max: 75,
          ...PERCENT,
          cmd: 'sucher',
          label: t('Anteil der Dorfgendarmen', 'Share of village constables'),
          help: t(
            'So viele suchen am Anfang – mindestens einer sucht, mindestens einer versteckt sich.',
            'This many seek at the start – at least one seeks, at least one hides.',
          ),
        }),
        versteck.number({
          key: 'hideSeconds',
          at: 'runde.versteck-sekunden',
          value: 40,
          min: 10,
          max: 180,
          ...SECONDS,
          cmd: 'versteckzeit',
          label: t('Versteckzeit', 'Hiding time'),
          help: t(
            'So lange warten die Gendarmen blind in ihrer Stube.',
            'The constables wait blindly in their room this long.',
          ),
        }),
        versteck.number({
          key: 'seekSeconds',
          at: 'runde.such-sekunden',
          value: 300,
          min: 60,
          max: 1200,
          ...SECONDS,
          cmd: 'suchzeit',
          label: t('Suchzeit', 'Seeking time'),
          help: t(
            'Ist danach noch jemand versteckt, gewinnen die Versteckten (300 = 5 Minuten).',
            'If someone is still hidden afterwards, the hiders win (300 = 5 minutes).',
          ),
        }),
        versteck.number({
          key: 'afterRound',
          at: 'runde.nachspiel-sekunden',
          value: 10,
          min: 2,
          max: 60,
          ...SECONDS,
          cmd: 'nachspiel',
          label: t('Nach der Runde', 'After the round'),
          help: t(
            'So lange bis zurück in die Gendarmerie – übrige Gestalten leuchten so lange auf.',
            'This long until back to the constabulary – remaining disguises light up meanwhile.',
          ),
        }),
        versteck.number({
          key: 'lockSeconds',
          at: 'runde.einrasten-sekunden',
          value: 3,
          min: 1,
          max: 10,
          ...SECONDS,
          cmd: 'einrasten',
          label: t('Einrasten nach', 'Lock in after'),
          help: t(
            'So lange muss man still stehen, bis man als echter, fester Block einrastet.',
            'You have to stand still this long until you lock in as a real, solid block.',
          ),
        }),
        versteck.number({
          key: 'hitsToFind',
          at: 'runde.treffer-bis-gefunden',
          value: 3,
          min: 1,
          max: 10,
          cmd: 'treffer',
          label: t('Treffer bis gefunden', 'Hits until found'),
          help: t(
            'So viele Schläge mit dem Gendarmenstab verträgt ein Versteckter.',
            'This many blows with the constable’s baton a hider can take.',
          ),
        }),
        versteck.number({
          key: 'wrongHitDamage',
          at: 'runde.falscher-treffer-schaden',
          value: 2,
          min: 0,
          max: 20,
          unit: t('halbe Herzen', 'half hearts'),
          arg: 'schaden',
          cmd: 'fehlschlag',
          label: t('Schlag auf ein echtes Ding kostet', 'Hitting a real object costs'),
          help: t(
            'Haut ein Gendarm auf ein echtes Fass oder einen echten Heuballen, verliert er so viel Leben (2 = ein Herz, 0 = nichts).',
            'If a constable hits a real barrel or hay bale, he loses this much health (2 = one heart, 0 = nothing).',
          ),
        }),
        versteck.number({
          key: 'breatherSeconds',
          at: 'runde.verschnaufen-sekunden',
          value: 4,
          min: 1,
          max: 30,
          ...SECONDS,
          cmd: 'verschnaufen',
          label: t('Verschnaufen', 'Catch your breath'),
          help: t(
            'So lange muss ein Gendarm verschnaufen, wenn er zu oft danebengehauen hat.',
            'A constable has to catch his breath this long after missing too often.',
          ),
        }),
      ],
    },
    {
      id: 'helpers',
      title: t('Hilfen', 'Helpers'),
      text: t(
        'Pfiff und Sprungkraft für die Versteckten, Spürnase für die Gendarmen.',
        'Whistle and jump boost for the hiders, sniffer for the constables.',
      ),
      settings: [
        versteck.number({
          key: 'whistleCooldown',
          at: 'hilfen.pfiff-abklingzeit-sekunden',
          value: 15,
          min: 3,
          max: 120,
          ...SECONDS,
          cmd: 'pfiff',
          label: t('Pause zwischen zwei Pfiffen', 'Pause between two whistles'),
          help: t(
            'Ein freiwilliger Pfiff gibt Punkte – je später in der Runde, desto mehr.',
            'A voluntary whistle gives points – the later in the round, the more.',
          ),
        }),
        versteck.number({
          key: 'mustWhistleFrom',
          at: 'hilfen.pflicht-pfiff-ab-prozent',
          value: 50,
          min: 0,
          max: 100,
          ...PERCENT,
          cmd: 'pflicht ab',
          label: t('Pfeifen ist Pflicht ab', 'Whistling is a must from'),
          help: t(
            'Ab diesem Anteil der Suchzeit muss jeder Versteckte regelmäßig pfeifen (100 = nie Pflicht).',
            'From this share of the seeking time every hider has to whistle regularly (100 = never a must).',
          ),
        }),
        versteck.number({
          key: 'mustWhistleEvery',
          at: 'hilfen.pflicht-pfiff-sekunden',
          value: 30,
          min: 5,
          max: 300,
          ...SECONDS,
          cmd: 'pflicht alle',
          label: t('Pflicht-Pfiff mindestens alle', 'Compulsory whistle at least every'),
          help: t(
            'Wer so lange nicht gepfiffen hat, pfeift von selbst – dann ohne Punkte.',
            'Whoever has not whistled for this long whistles by themselves – then without points.',
          ),
        }),
        versteck.number({
          key: 'jumpSeconds',
          at: 'hilfen.sprung-sekunden',
          value: 4,
          min: 1,
          max: 30,
          ...SECONDS,
          cmd: 'sprung',
          label: t('Sprungkraft hält', 'Jump boost lasts'),
          help: t('So lange springen Versteckte höher.', 'Hiders jump higher for this long.'),
        }),
        versteck.number({
          key: 'jumpCooldown',
          at: 'hilfen.sprung-abklingzeit-sekunden',
          value: 25,
          min: 5,
          max: 300,
          ...SECONDS,
          cmd: 'sprung pause',
          label: t('Pause bis zur nächsten Sprungkraft', 'Pause until the next jump boost'),
          help: t(
            'So lange dauert es, bis man die Sprungkraft wieder benutzen kann.',
            'This long until the jump boost can be used again.',
          ),
        }),
        versteck.number({
          key: 'snifferSeconds',
          at: 'hilfen.spuernase-sekunden',
          value: 4,
          min: 1,
          max: 30,
          ...SECONDS,
          cmd: 'spuernase',
          label: t('Spürnase zeigt die Spur', 'Sniffer shows the trail'),
          help: t(
            'Einmal pro Runde: So lange zeigt eine goldene Spur zum nächsten Versteckten (nur für den Gendarmen selbst).',
            'Once per round: a golden trail shows the way to the nearest hider this long (only for the constable).',
          ),
        }),
      ],
    },
  ],
};

// ---------------------------------------------------------------- Wintersport

const winter = settingsFor('winterconfig');

export const WINTERSPORT_AREA: SettingArea = {
  id: 'wintersport',
  title: t('Wintersport', 'Winter Games'),
  text: t(
    'Riesenslalom, Biathlon und Bobbahn: Saison, Licht und Schnee im Bergdorf, Zeiten und Regeln der Disziplinen.',
    'Giant slalom, biathlon and bobsleigh: season, light and snow in the mountain village, times and rules of the events.',
  ),
  icon: 'Snowflake',
  panel: 'modes',
  mode: { id: 'wintersport', plugin: 'MorniWintersport' },
  sections: [
    {
      id: 'village',
      title: t('Bergdorf', 'Mountain village'),
      settings: [
        winter.choice({
          key: 'season',
          at: 'saison',
          value: 'immer',
          options: [
            { value: 'immer', label: t('Das ganze Jahr', 'All year') },
            {
              value: 'winter',
              label: t('Nur im Winter (1. Dezember – 31. März)', 'Winter only (1 December – 31 March)'),
            },
          ],
          cmd: 'saison',
          label: t('Saison', 'Season'),
          help: t(
            'Außerhalb der Saison bleibt das Dorf zum Anschauen offen (Eisfläche, Lift, Rodelbahn), Wettkämpfe gibt es keine. Lobby und Webseite zeigen dann „Sommerpause“.',
            'Outside the season the village stays open to look around (ice rink, lift, toboggan run), but there are no competitions. Lobby and website then show “summer break”.',
          ),
        }),
        winter.choice({
          key: 'daytime',
          at: 'tageszeit',
          value: 'tag',
          options: [
            { value: 'tag', label: t('Tag (Mittag, hell)', 'Day (noon, bright)') },
            { value: 'abend', label: t('Abend (Laternen leuchten)', 'Evening (lanterns glowing)') },
          ],
          cmd: 'tageszeit',
          label: t('Licht', 'Light'),
          help: t('Es bleibt immer bei dieser Tageszeit.', 'It always stays at this time of day.'),
        }),
        winter.flag({
          key: 'snowfall',
          at: 'schneefall',
          value: true,
          cmd: 'schneefall',
          label: t('Leise rieselnder Schnee', 'Gently falling snow'),
          help: t(
            'Schneeflocken um jeden Spieler – nur zum Anschauen.',
            'Snowflakes around every player – just for the looks.',
          ),
        }),
        winter.number({
          key: 'countdown',
          at: 'dorf.countdown-sekunden',
          value: 30,
          min: 5,
          max: 300,
          ...SECONDS,
          cmd: 'countdown',
          label: t('Countdown vor dem Wettkampf', 'Countdown before the competition'),
          help: t(
            'Sagen alle „bereit“, geht es nach 5 Sekunden los.',
            'If everyone says “ready”, it starts after 5 seconds.',
          ),
        }),
        winter.number({
          key: 'minPlayers',
          at: 'dorf.mindestens-spieler',
          value: 2,
          min: 1,
          max: 12,
          ...PLAYERS,
          cmd: 'mindestens',
          label: t('Countdown startet von selbst ab', 'Countdown starts by itself from'),
          help: t(
            'Vorher beginnt er, sobald jemand „bereit“ sagt.',
            'Before that it starts as soon as someone says “ready”.',
          ),
        }),
      ],
    },
    {
      id: 'competition',
      title: t('Wettkampf', 'Competition'),
      settings: [
        winter.number({
          key: 'maxPlayers',
          at: 'wettkampf.hoechstens-spieler',
          value: 12,
          min: 1,
          max: 12,
          ...PLAYERS,
          cmd: 'hoechstens',
          label: t('Höchstens in einem Wettkampf', 'At most in one competition'),
          help: t('Partys bleiben zusammen.', 'Parties stay together.'),
        }),
        winter.number({
          key: 'pauseSeconds',
          at: 'wettkampf.pause-sekunden',
          value: 8,
          min: 2,
          max: 60,
          ...SECONDS,
          cmd: 'pause',
          label: t('Pause zwischen den Disziplinen', 'Break between the events'),
          help: t(
            'Zeit für den Zwischenstand im Medaillenspiegel.',
            'Time for the interim standings in the medal table.',
          ),
        }),
        winter.number({
          key: 'ceremonySeconds',
          at: 'wettkampf.siegerehrung-sekunden',
          value: 12,
          min: 3,
          max: 60,
          ...SECONDS,
          cmd: 'siegerehrung',
          label: t('Siegerehrung', 'Award ceremony'),
          help: t(
            'So lange dauert die Siegerehrung am Treppchen, danach geht es zurück ins Dorf.',
            'The award ceremony at the podium lasts this long, then it is back to the village.',
          ),
        }),
      ],
    },
    {
      id: 'slalom',
      title: t('Riesenslalom', 'Giant slalom'),
      settings: [
        winter.number({
          key: 'slalomPenalty',
          at: 'slalom.strafe-sekunden',
          value: 3,
          min: 0,
          max: 30,
          ...SECONDS,
          cmd: 'slalom strafe',
          label: t('Strafe für ein verpasstes Tor', 'Penalty for a missed gate'),
          help: t('Kommt für jedes verpasste Tor zur Zeit dazu.', 'Added to the time for every missed gate.'),
        }),
        winter.number({
          key: 'slalomLimit',
          at: 'slalom.zeitlimit-sekunden',
          value: 90,
          min: 20,
          max: 600,
          ...SECONDS,
          cmd: 'slalom zeitlimit',
          label: t('Zeitlimit', 'Time limit'),
          help: t(
            'Wer bis dahin nicht im Ziel ist, scheidet in diesem Lauf aus.',
            'Whoever is not at the finish by then drops out of this run.',
          ),
        }),
      ],
    },
    {
      id: 'bob',
      title: t('Bobbahn', 'Bobsleigh'),
      settings: [
        winter.flag({
          key: 'twoManBob',
          at: 'bob.zweierbob',
          value: true,
          cmd: 'bob zweier',
          label: t('Zweierbob für Partys', 'Two-man bob for parties'),
          help: t(
            'Partys fahren zu zweit in einem Bob (der Erste lenkt). Aus: jeder fährt allein.',
            'Parties ride two to a bob (the first one steers). Off: everyone rides alone.',
          ),
        }),
        winter.number({
          key: 'bobLimit',
          at: 'bob.zeitlimit-sekunden',
          value: 90,
          min: 20,
          max: 600,
          ...SECONDS,
          cmd: 'bob zeitlimit',
          label: t('Zeitlimit', 'Time limit'),
          help: t(
            'Wer bis dahin nicht im Ziel ist, scheidet aus.',
            'Whoever is not at the finish by then drops out.',
          ),
        }),
      ],
    },
    {
      id: 'biathlon',
      title: t('Biathlon', 'Biathlon'),
      settings: [
        winter.number({
          key: 'biathlonLaps',
          at: 'biathlon.runden',
          value: 3,
          min: 1,
          max: 10,
          unit: t('Runden', 'laps'),
          arg: 'runden',
          cmd: 'biathlon runden',
          label: t('Runden auf der Loipe', 'Laps on the trail'),
          help: t('So viele Runden laufen alle.', 'Everyone runs this many laps.'),
        }),
        winter.number({
          key: 'biathlonShooting',
          at: 'biathlon.schiessen',
          value: 2,
          min: 0,
          max: 9,
          unit: t('Mal', 'times'),
          arg: 'zahl',
          cmd: 'biathlon schiessen',
          label: t('So oft wird geschossen', 'Shooting stops'),
          help: t(
            'Nach Runde 1, 2 … geht es an den Schießstand – höchstens eine Runde weniger, als gelaufen wird.',
            'After lap 1, 2 … it is off to the shooting range – at most one less than the number of laps.',
          ),
        }),
        winter.number({
          key: 'biathlonLimit',
          at: 'biathlon.zeitlimit-sekunden',
          value: 360,
          min: 60,
          max: 1800,
          ...SECONDS,
          cmd: 'biathlon zeitlimit',
          label: t('Zeitlimit', 'Time limit'),
          help: t(
            'Wer bis dahin nicht im Ziel ist, scheidet aus (360 = 6 Minuten).',
            'Whoever is not at the finish by then drops out (360 = 6 minutes).',
          ),
        }),
        winter.number({
          key: 'shootingSeconds',
          at: 'biathlon.schiess-zeit-sekunden',
          value: 40,
          min: 10,
          max: 180,
          ...SECONDS,
          cmd: 'biathlon schiesszeit',
          label: t('Zeit am Schießstand', 'Time at the shooting range'),
          help: t(
            'So lange hat man für die fünf Schuss. Jeder Fehler = eine Strafrunde.',
            'This is the time for the five shots. Every miss = one penalty loop.',
          ),
        }),
        winter.number({
          key: 'biathlonSpeed',
          at: 'biathlon.tempo',
          value: 2,
          min: 0,
          max: 5,
          unit: t('Stufe', 'level'),
          arg: 'stufe',
          cmd: 'biathlon tempo',
          label: t('Laufen mit Schnelligkeit', 'Running with speed'),
          help: t('0 = normal, 2 = wie Schnelligkeit II.', '0 = normal, 2 = like Speed II.'),
        }),
      ],
    },
  ],
};

// ---------------------------------------------------------------- Adlerflug

const adler = settingsFor('adlerconfig');

export const ADLERFLUG_AREA: SettingArea = {
  id: 'adlerflug',
  title: t('Adlerflug', 'Eagle Flight'),
  text: t(
    'Mit Flügeln durch Ringe auf Zeit: Schwung an der Schanze, Hilfen für Anfänger, Geist und Party-Rennen.',
    'Gliding through rings against the clock: boost at the ski jump, help for beginners, ghost and party races.',
  ),
  icon: 'Bird',
  panel: 'modes',
  mode: { id: 'adlerflug', plugin: 'MorniAdlerflug' },
  sections: [
    {
      id: 'flight',
      title: t('Flug', 'Flight'),
      settings: [
        adler.number({
          key: 'launchBoost',
          at: 'start-schwung',
          value: 1.3,
          min: 0,
          max: 3,
          step: 0.1,
          unit: t('Blöcke pro Tick', 'blocks per tick'),
          arg: 'schwung',
          cmd: 'schwung',
          label: t('Schwung beim Absprung', 'Boost at take-off'),
          help: t(
            '1,3 ≈ 94 km/h. Die Strecken sind dafür gebaut – weniger macht den ersten Ring schwerer, 0 = einfach von der Kante fallen.',
            '1.3 ≈ 94 km/h. The courses are built for it – less makes the first ring harder, 0 = just drop off the edge.',
          ),
        }),
        adler.flag({
          key: 'autoWings',
          at: 'fluegel-automatisch',
          value: true,
          cmd: 'fluegel',
          label: t('Flügel gehen von selbst auf', 'Wings open by themselves'),
          help: t(
            'Beim Fallen in der Luft klappen die Flügel von selbst auf – hilft Anfängern und am Handy.',
            'When falling in the air, the wings open by themselves – helps beginners and on mobile.',
          ),
        }),
        adler.flag({
          key: 'plausible',
          at: 'plausibel-pruefen',
          value: true,
          cmd: 'pruefen',
          label: t('Unmögliche Zeiten nicht werten', 'Do not count impossible times'),
          help: t(
            'Zeiten, die schneller sind als überhaupt möglich (Teleport, Abkürzung), kommen nicht in die Bestenliste.',
            'Times faster than possible at all (teleport, shortcut) do not go on the leaderboard.',
          ),
        }),
        adler.flag({
          key: 'freeFlight',
          at: 'freiflug',
          value: true,
          cmd: 'freiflug',
          label: t('Freiflug im Adlerhorst', 'Free flight at the eagle’s eyrie'),
          help: t(
            'Von der großen Schanze im Basislager einfach so fliegen, ohne Zeit – wer im Tal landet, kommt zurück.',
            'Just fly from the big ski jump at the base camp, without timing – whoever lands in the valley comes back.',
          ),
        }),
        adler.flag({
          key: 'ghostDefault',
          at: 'geist-standard',
          value: true,
          cmd: 'geist',
          label: t('Geist für neue Spieler', 'Ghost for new players'),
          help: t(
            'Ein kleiner Adler aus blauen Funken fliegt die eigene Bestzeit mit. Jeder kann ihn für sich ausschalten – das hier gilt für neue Spieler.',
            'A small eagle made of blue sparks flies your own best time alongside. Everyone can switch it off – this applies to new players.',
          ),
        }),
      ],
    },
    {
      id: 'race',
      title: t('Party-Rennen', 'Party races'),
      settings: [
        adler.number({
          key: 'raceWait',
          at: 'rennen-wartezeit',
          value: 15,
          min: 5,
          max: 120,
          ...SECONDS,
          cmd: 'rennen',
          label: t('Zeit zum Mitmachen', 'Time to join'),
          help: t(
            'So lange haben Party-Mitglieder Zeit, bei einem Rennen mitzumachen.',
            'Party members have this long to join a race.',
          ),
        }),
      ],
    },
  ],
};

// ---------------------------------------------------------------- Angelkönig

const angel = settingsFor('angelconfig');

const PRIZES: ReadonlyArray<readonly [number, number, Text]> = [
  [0, 250, t('Preis für Platz 1', 'Prize for 1st place')],
  [1, 120, t('Preis für Platz 2', 'Prize for 2nd place')],
  [2, 60, t('Preis für Platz 3', 'Prize for 3rd place')],
];

export const ANGELKOENIG_AREA: SettingArea = {
  id: 'angelkoenig',
  title: t('Angelkönig', 'Angler King'),
  text: t(
    'Gemütlich angeln: Tageszeit und Wetter im Tal, wie schnell es beißt, Startgeld und das Angel-Turnier.',
    'Relaxed fishing: time of day and weather in the valley, how fast the fish bite, starting money and the fishing tournament.',
  ),
  icon: 'Fish',
  panel: 'modes',
  mode: { id: 'angelkoenig', plugin: 'MorniAngelkoenig' },
  sections: [
    {
      id: 'valley',
      title: t('Tal', 'Valley'),
      text: t(
        'Tageszeit und Wetter ändern, was beißt – Aale zum Beispiel nur nachts.',
        'Time of day and weather change what bites – eels, for example, only at night.',
      ),
      settings: [
        angel.flag({
          key: 'daytime',
          at: 'welt-ablauf.tageszeit-laeuft',
          value: true,
          cmd: 'tageszeit',
          label: t('Tageszeit läuft', 'Time of day passes'),
          help: t(
            'Morgen, Tag, Abend und Nacht wechseln sich ab. Aus: Es bleibt Morgen.',
            'Morning, day, evening and night take turns. Off: it stays morning.',
          ),
        }),
        angel.flag({
          key: 'weather',
          at: 'welt-ablauf.wetter-wechselt',
          value: true,
          cmd: 'wetter',
          label: t('Wetter wechselt', 'Weather changes'),
          help: t(
            'Klar, Regen und Gewitter wechseln sich ab. Aus: Es bleibt klar.',
            'Clear, rain and thunderstorm take turns. Off: it stays clear.',
          ),
        }),
        angel.number({
          key: 'weatherMin',
          at: 'welt-ablauf.wetter-min-sekunden',
          value: 360,
          min: 60,
          max: 3600,
          ...SECONDS,
          cmd: 'wetter kuerzest',
          label: t('Ein Wetter dauert mindestens', 'A weather lasts at least'),
          help: t('Regen und Gewitter dauern halb so lang.', 'Rain and thunderstorms last half as long.'),
        }),
        angel.number({
          key: 'weatherMax',
          at: 'welt-ablauf.wetter-max-sekunden',
          value: 900,
          min: 60,
          max: 7200,
          ...SECONDS,
          cmd: 'wetter laengst',
          label: t('Ein Wetter dauert höchstens', 'A weather lasts at most'),
          help: t(
            'Muss mindestens so lang sein wie die kürzeste Dauer.',
            'Must be at least as long as the shortest duration.',
          ),
        }),
      ],
    },
    {
      id: 'fishing',
      title: t('Angeln', 'Fishing'),
      settings: [
        angel.number({
          key: 'biteMin',
          at: 'angeln.biss-min-sekunden',
          value: 5,
          min: 1,
          max: 60,
          ...SECONDS,
          cmd: 'biss kuerzest',
          label: t('Biss frühestens nach', 'Bite at the earliest after'),
          help: t(
            'Wartezeit mit der einfachsten Angel (Haselrute) – bessere Angeln sind schneller.',
            'Waiting time with the simplest rod (hazel rod) – better rods are faster.',
          ),
        }),
        angel.number({
          key: 'biteMax',
          at: 'angeln.biss-max-sekunden',
          value: 18,
          min: 2,
          max: 120,
          ...SECONDS,
          cmd: 'biss laengst',
          label: t('Biss spätestens nach', 'Bite at the latest after'),
          help: t(
            'Muss mindestens so lang sein wie die kürzeste Wartezeit.',
            'Must be at least as long as the shortest waiting time.',
          ),
        }),
        angel.number({
          key: 'startMoney',
          at: 'angeln.startgeld',
          value: 25,
          min: 0,
          max: 10_000,
          ...TALER,
          cmd: 'startgeld',
          label: t('Startgeld', 'Starting money'),
          help: t(
            'So viele Taler bekommt jeder beim ersten Besuch. Taler gibt es nur im Spiel – nichts für echtes Geld.',
            'Everyone gets this many coins on their first visit. Coins only exist in the game – nothing for real money.',
          ),
        }),
      ],
    },
    {
      id: 'tournament',
      title: t('Angel-Turnier', 'Fishing tournament'),
      text: t(
        'Der schwerste Fisch gewinnt – der Sieger wird Angelkönig und bekommt die Königskrone.',
        'The heaviest fish wins – the winner becomes Angler King and gets the royal crown.',
      ),
      settings: [
        angel.flag({
          key: 'tournament',
          at: 'turnier.an',
          value: true,
          cmd: 'turnier',
          label: t('Angel-Turniere', 'Fishing tournaments'),
          help: t(
            'Regelmäßig ein Turnier für alle im Tal.',
            'A tournament for everyone in the valley at regular intervals.',
          ),
        }),
        angel.number({
          key: 'everyMinutes',
          at: 'turnier.alle-minuten',
          value: 15,
          min: 5,
          max: 240,
          ...MINUTES,
          cmd: 'turnier alle',
          label: t('Ein Turnier alle', 'A tournament every'),
          help: t('Bei 15 beginnt es zur vollen Viertelstunde.', 'At 15 it starts on the quarter hour.'),
        }),
        angel.number({
          key: 'durationMinutes',
          at: 'turnier.dauer-minuten',
          value: 5,
          min: 1,
          max: 60,
          ...MINUTES,
          cmd: 'turnier dauer',
          label: t('So lange dauert es', 'It lasts'),
          help: t(
            'Muss kürzer sein als der Abstand zwischen zwei Turnieren.',
            'Must be shorter than the gap between two tournaments.',
          ),
        }),
        angel.number({
          key: 'warning',
          at: 'turnier.vorwarnung-sekunden',
          value: 60,
          min: 0,
          max: 600,
          ...SECONDS,
          cmd: 'turnier vorwarnung',
          label: t('Ankündigung vorher', 'Announced before'),
          help: t(
            'So viele Sekunden vorher erfahren alle im Tal davon.',
            'Everyone in the valley hears about it this many seconds before.',
          ),
        }),
        angel.number({
          key: 'minPlayers',
          at: 'turnier.mindestens-spieler',
          value: 2,
          min: 1,
          max: 40,
          ...PLAYERS,
          cmd: 'turnier mindestens',
          label: t('Turnier erst ab', 'Tournament only from'),
          help: t('So viele Leute müssen im Tal sein.', 'This many people have to be in the valley.'),
        }),
        ...PRIZES.map(([i, value, label]) =>
          angel.number({
            key: `prize${i + 1}`,
            at: `turnier.preise.${i}`,
            value,
            min: 0,
            max: 100_000,
            ...TALER,
            cmd: `turnier preis${i + 1}`,
            label,
            help: t('Taler für diesen Platz.', 'Coins for this place.'),
          }),
        ),
        angel.number({
          key: 'participation',
          at: 'turnier.teilnahme',
          value: 15,
          min: 0,
          max: 10_000,
          ...TALER,
          cmd: 'turnier teilnahme',
          label: t('Für alle anderen', 'For everyone else'),
          help: t(
            'Taler für alle, die beim Turnier etwas gefangen haben.',
            'Coins for everyone who caught something in the tournament.',
          ),
        }),
      ],
    },
  ],
};

/** Alle Spielmodi mit Einstellungen, in der Reihenfolge der Lobby. */
export const MODE_SETTING_AREAS: readonly SettingArea[] = [
  DUELS_AREA,
  PARTY_AREA,
  GIPFELSTURM_AREA,
  BURGVERLIES_AREA,
  BOLLWERK_AREA,
  SMP_AREA,
  WOLKENKAMPF_AREA,
  VERSTECKERL_AREA,
  WINTERSPORT_AREA,
  ADLERFLUG_AREA,
  ANGELKOENIG_AREA,
];
