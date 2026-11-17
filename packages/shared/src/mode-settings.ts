/* eslint-disable ts-patterns/no-magic-numbers -- a settings catalog: defaults and limits as the modes need them */
import type { SettingArea, SettingDef, SettingSection, Text } from './settings.js';

/**
 * Einstellungen der Spielmodi (Duels, Morni Party, Gipfelsturm, Burgverlies, Bollwerk, MorniSMP, Wolkenkampf,
 * Versteckerl, Wintersport, Adlerflug, Angelkönig): je Modus ein
 * Bereich im Panel, jede Einstellung mit ihrer Stelle in der config.yml des Modus-Plugins und einem Befehl im Spiel.
 * Die Standardwerte sind die der mitgelieferten config.yml – ohne Änderung im Panel bleibt dort alles, wie es ist.
 *
 * Der Weg: Panel (oder Befehl) → Hub schickt `mode-settings` (Pfad → Wert) an den Server des Modus → das
 * Netzwerk-Plugin schreibt die config.yml (Kommentare bleiben) → Neustart des Modus, sobald gerade niemand spielt.
 * Schläft der Modus, trägt MoinMorni die Werte vor dem Aufwachen ein. Ein neuer Modus braucht hier nur einen Bereich.
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

/**
 * Abschnitt „Zurück ins Spiel“ (Schnittstelle Fassung 2): So lange hält ein Modus den Platz frei, wenn jemand mitten im
 * Spiel die Verbindung verliert. `rueckkehr-sekunden` steht oben in der config.yml jedes Modus, der es kann.
 */
function rejoinSection(
  modeSettings: ReturnType<typeof settingsFor>,
  value: number,
  what: Text,
): SettingSection {
  return {
    id: 'rejoin',
    title: t('Zurück ins Spiel', 'Back into the game'),
    text: t(
      'Stürzt das Spiel ab oder ist das Internet kurz weg, bleibt der Platz frei. Die Lobby bietet „Zurück ins Spiel“ an.',
      'If the game crashes or the internet drops for a moment, the place stays free. The lobby offers “Back into the game”.',
    ),
    settings: [
      modeSettings.number({
        key: 'rejoinSeconds',
        at: 'rueckkehr-sekunden',
        value,
        min: 0,
        max: 600,
        ...SECONDS,
        cmd: 'rueckkehr',
        label: t('Platz frei halten', 'Keep the place free'),
        help: what,
      }),
    ],
  };
}

// ---------------------------------------------------------------- Duels

const duels = settingsFor('duelsconfig');

/** Eine Kampfart von Duels (`kits.<id>` in der config.yml) mit ihren eigenen Einstellungen. */
interface DuelsKit {
  readonly id: string;
  readonly name: Text;
  readonly help: Text;
  /** Die Brücke zählt Tore statt Runden – sie hat kein `runden`. */
  readonly noRounds?: true;
  /** Was nur diese Kampfart hat (Suppe, Tanzboden, Tore …), gleich unter ihrem Schalter. */
  readonly extra?: readonly SettingDef[];
}

/** Name der Kampfart vor dem Namen einer ihrer Einstellungen: „Sumo: Runden“. */
const ofKit = (kit: Text, de: string, en: string): Text => t(`${kit.de}: ${de}`, `${kit.en}: ${en}`);
const kitKey = (id: string): string => `kit${(id[0] ?? '').toUpperCase()}${id.slice(1)}`;

/** Schalter und Runden einer Kampfart, dann ihre eigenen Einstellungen. */
function duelsKit(kit: DuelsKit): SettingDef[] {
  const on = duels.flag({
    key: kitKey(kit.id),
    at: `kits.${kit.id}.an`,
    value: true,
    cmd: kit.id,
    label: kit.name,
    help: kit.help,
  });
  const rounds = duels.number({
    key: `${kitKey(kit.id)}Rounds`,
    at: `kits.${kit.id}.runden`,
    value: 1,
    min: 1,
    max: 5,
    unit: t('Runden', 'rounds'),
    arg: 'runden',
    cmd: `${kit.id} runden`,
    label: ofKit(kit.name, 'Runden', 'rounds'),
    help: t(
      '1 = ein Kampf, 3 = Bester aus 3 (wer zuerst 2 gewinnt), 5 = Bester aus 5; 2 und 4 werden zu 3 und 5.',
      '1 = one fight, 3 = best of 3 (first to win 2), 5 = best of 5; 2 and 4 become 3 and 5.',
    ),
  });
  return [on, ...(kit.noRounds ? [] : [rounds]), ...(kit.extra ?? [])];
}

const SOUP = t('Klassisch', 'Classic');
const ROD = t('Angel', 'Fishing Rod');
const COMBO = t('Kombo', 'Combo');
const SUMO = t('Sumo', 'Sumo');
const BOXING = t('Boxen', 'Boxing');
const MAZE = t('Labyrinth', 'Maze');
const BRIDGE = t('Brücke', 'Bridge');

/** Gruppe „Klassisch“: Kampf wie früher, ohne Abklingzeit beim Schlagen. */
const DUELS_CLASSIC: readonly DuelsKit[] = [
  {
    id: 'klassisch',
    name: SOUP,
    help: t(
      'Eisenrüstung, Diamantschwert und Pilzsuppen – eine Suppe heilt sofort.',
      'Iron armour, diamond sword and mushroom soup – a soup heals instantly.',
    ),
    extra: [
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
    id: 'schwert',
    name: t('Nur Schwert', 'Sword Only'),
    help: t(
      'Nur ein Diamantschwert – keine Rüstung, nichts zu essen. Wer besser trifft, gewinnt.',
      'Just a diamond sword – no armour, nothing to eat. Whoever hits better wins.',
    ),
  },
  {
    id: 'ritter',
    name: t('Ritter', 'Knight'),
    help: t(
      'Komplett aus Eisen: Rüstung und Schwert, dazu Bogen und zwei Goldäpfel.',
      'All iron: armour and sword, plus a bow and two golden apples.',
    ),
  },
  {
    id: 'diamant',
    name: t('Diamant', 'Diamond'),
    help: t(
      'Komplett aus Diamant, leicht verzaubert, dazu Bogen und Goldäpfel.',
      'All diamond, lightly enchanted, plus a bow and golden apples.',
    ),
  },
  {
    id: 'bogen',
    name: t('Bogen', 'Archery'),
    help: t(
      'Bogen mit unendlich Pfeilen und leichte Lederrüstung – gut zielen, in Deckung gehen.',
      'A bow with endless arrows and light leather armour – aim well, take cover.',
    ),
  },
  {
    id: 'angel',
    name: ROD,
    help: t(
      'Schwert und Angel: Der Haken stupst an, beim Einholen holst du den Gegner heran.',
      'Sword and fishing rod: the hook gives a nudge, reeling in pulls the opponent closer.',
    ),
    extra: [
      duels.number({
        key: 'rodPull',
        at: 'angel.zug',
        value: 1,
        min: 0,
        max: 3,
        step: 0.1,
        unit: t('mal so stark', 'times as strong'),
        arg: 'staerke',
        cmd: 'angel zug',
        label: ofKit(ROD, 'Zug beim Einholen', 'pull when reeling in'),
        help: t(
          'Wie stark die Angel den Gegner heranzieht: 0 = gar nicht, 1 = normal, bis 3.',
          'How strongly the rod pulls the opponent in: 0 = not at all, 1 = normal, up to 3.',
        ),
      }),
    ],
  },
  {
    id: 'kombo',
    name: COMBO,
    help: t(
      'Fast keine Pause zwischen Treffern – schnelle Schlagfolgen, starke Rüstung.',
      'Almost no pause between hits – fast strings of hits, strong armour.',
    ),
    extra: [
      duels.number({
        key: 'comboPauseTicks',
        at: 'kombo.treffer-pause-ticks',
        value: 2,
        min: 0,
        max: 10,
        ...TICKS,
        cmd: 'kombo pause',
        label: ofKit(COMBO, 'Pause zwischen Treffern', 'pause between hits'),
        help: t(
          'Sonst sind es 10 Ticks (eine halbe Sekunde) – kleiner heißt schnellere Kombos.',
          'Normally it is 10 ticks (half a second) – smaller means faster combos.',
        ),
      }),
    ],
  },
];

/** Gruppe „Modern“: Kampf wie heute, mit Abklingzeit beim Schlagen. */
const DUELS_MODERN: readonly DuelsKit[] = [
  {
    id: 'modern',
    name: t('Modern', 'Modern'),
    help: t(
      'Diamantrüstung, Schwert, Axt, Bogen, Goldäpfel, Enderperlen und Schild – Kampf wie heute.',
      'Diamond armour, sword, axe, bow, golden apples, ender pearls and a shield – fighting like today.',
    ),
  },
  {
    id: 'axt',
    name: t('Axt und Schild', 'Axe & Shield'),
    help: t(
      'Diamantaxt und Schild: Axt-Treffer legen den Schild des Gegners kurz lahm.',
      'Diamond axe and shield: axe hits briefly disable the opponent’s shield.',
    ),
  },
  {
    id: 'goldapfel',
    name: t('Goldapfel', 'Golden Apple'),
    help: t(
      'Verzauberte Goldäpfel, sehr starke Rüstung und Tränke für Stärke und Tempo.',
      'Enchanted golden apples, very strong armour and potions for strength and speed.',
    ),
  },
  {
    id: 'traenke',
    name: t('Tränke', 'Potions'),
    help: t(
      'Heiltränke zum Werfen, Schnelligkeit zum Trinken und ein paar Enderperlen.',
      'Healing potions to throw, speed to drink and a few ender pearls.',
    ),
  },
  {
    id: 'perlen',
    name: t('Enderperlen', 'Ender Pearls'),
    help: t(
      '16 Enderperlen – das Landen tut nicht weh. Springen, überraschen, zuschlagen.',
      '16 ender pearls – landing does not hurt. Jump, surprise, strike.',
    ),
  },
  {
    id: 'uhc',
    name: t('UHC', 'UHC'),
    help: t(
      'UHC heißt „Ultra Hardcore“: keine natürliche Heilung, nur Goldäpfel. Dazu Lava, Wasser, Blöcke und Bogen – danach steht die Arena wieder wie neu.',
      'UHC means “Ultra Hardcore”: no natural healing, only golden apples. Plus lava, water, blocks and a bow – afterwards the arena is as good as new.',
    ),
  },
  {
    id: 'baukampf',
    name: t('Bau-Kampf', 'Build Fight'),
    help: t(
      'Blöcke bauen erlaubt: Türme, Wände, Brücken. Danach steht die Arena wieder wie neu.',
      'Building blocks is allowed: towers, walls, bridges. Afterwards the arena is as good as new.',
    ),
  },
];

/** Gruppe „Spaß“: besondere Regeln und eigene Arenen. */
const DUELS_FUN: readonly DuelsKit[] = [
  {
    id: 'faehigkeiten',
    name: t('Fähigkeiten', 'Abilities'),
    help: t(
      'Eisen und eine besondere Fähigkeit mit Abklingzeit: Bergführer, Schmied, Kräuterfrau oder Jäger.',
      'Iron and a special ability with a cooldown: mountain guide, smith, herbalist or hunter.',
    ),
  },
  {
    id: 'sumo',
    name: SUMO,
    help: t(
      'Runder Tanzboden, kein Schaden: Treffer stoßen nur – wer herunterfällt, verliert.',
      'Round dance floor, no damage: hits only push – whoever falls off loses.',
    ),
    extra: [
      duels.number({
        key: 'sumoDepth',
        at: 'sumo.aus-tiefe',
        value: 2,
        min: 0.5,
        max: 20,
        step: 0.5,
        ...BLOCKS,
        cmd: 'sumo tiefe',
        label: ofKit(SUMO, 'ausgeschieden ab', 'out from'),
        help: t(
          'So viele Blöcke unter dem Tanzboden scheidet man aus.',
          'You are out this many blocks below the dance floor.',
        ),
      }),
    ],
  },
  {
    id: 'boxen',
    name: BOXING,
    help: t(
      'Kein Schaden – Treffer zählen. Wer zuerst genug Treffer landet, gewinnt.',
      'No damage – hits count. Whoever lands enough hits first wins.',
    ),
    extra: [
      duels.number({
        key: 'boxingHits',
        at: 'boxen.treffer',
        value: 100,
        min: 1,
        max: 1000,
        unit: t('Treffer', 'hits'),
        arg: 'treffer',
        cmd: 'boxen treffer',
        label: ofKit(BOXING, 'Treffer zum Sieg', 'hits to win'),
        help: t(
          'So viele Treffer braucht man zum Sieg – im 2 gegen 2 das Team zusammen.',
          'This many hits are needed to win – in 2v2 the whole team together.',
        ),
      }),
    ],
  },
  {
    id: 'spleef',
    name: t('Spleef', 'Spleef'),
    help: t(
      'Mit der Schaufel auf dem Schneefeld: den Schnee unter dem Gegner wegschaufeln – wer hinunterfällt, verliert.',
      'With a shovel on the snowfield: dig the snow away under your opponent – whoever falls through loses.',
    ),
  },
  {
    id: 'labyrinth',
    name: MAZE,
    help: t(
      'Irrgarten aus Hecken: Start in entgegengesetzten Ecken, zum Ziel in der Mitte laufen oder den Gegner besiegen.',
      'A hedge maze: start in opposite corners, run to the goal in the middle or defeat your opponent.',
    ),
    extra: [
      duels.flag({
        key: 'mazeCompass',
        at: 'labyrinth.kompass',
        value: true,
        cmd: 'labyrinth kompass',
        label: ofKit(MAZE, 'Kompass im Kit', 'compass in the kit'),
        help: t(
          'Der Kompass zeigt zum nächsten Gegner. Aus = selbst suchen.',
          'The compass points to the nearest opponent. Off = find them yourself.',
        ),
      }),
      duels.flag({
        key: 'mazeGoal',
        at: 'labyrinth.ziel',
        value: true,
        cmd: 'labyrinth ziel',
        label: ofKit(MAZE, 'Ziel in der Mitte', 'goal in the middle'),
        help: t(
          'Wer zuerst darauf steht, gewinnt die Runde – ein Lichtstrahl zeigt die Richtung. Aus = nur Besiegen zählt.',
          'Whoever stands on it first wins the round – a beam of light shows the way. Off = only defeating counts.',
        ),
      }),
      duels.flag({
        key: 'mazeReshuffle',
        at: 'labyrinth.jede-runde-neu',
        value: true,
        cmd: 'labyrinth neu',
        label: ofKit(MAZE, 'jede Runde ein neuer Irrgarten', 'a new maze every round'),
        help: t(
          'Immer so gebaut, dass beide Startecken gleich weit vom Ziel weg sind. Aus = immer derselbe Irrgarten.',
          'Always built so that both starting corners are equally far from the goal. Off = always the same maze.',
        ),
      }),
    ],
  },
  {
    id: 'bruecke',
    name: BRIDGE,
    help: t(
      'Zwei Seiten, eine Brücke über die Klamm: ins gegnerische Tor springen und punkten. Zählt Tore statt Runden.',
      'Two sides, one bridge across the gorge: jump into the other team’s goal to score. Counts goals instead of rounds.',
    ),
    noRounds: true,
    extra: [
      duels.number({
        key: 'bridgeGoals',
        at: 'bruecke.tore',
        value: 3,
        min: 1,
        max: 20,
        unit: t('Tore', 'goals'),
        arg: 'tore',
        cmd: 'bruecke tore',
        label: ofKit(BRIDGE, 'Tore zum Sieg', 'goals to win'),
        help: t('So viele Tore braucht ein Team zum Sieg.', 'A team needs this many goals to win.'),
      }),
    ],
  },
];

/** Alle Kampfarten von Duels (Kennung, Name) in der Reihenfolge des Menüs – auch für die Webseite. */
export const DUELS_KITS: ReadonlyArray<{ readonly id: string; readonly name: Text }> = [
  ...DUELS_CLASSIC,
  ...DUELS_MODERN,
  ...DUELS_FUN,
].map((k) => ({ id: k.id, name: k.name }));

const KITS_OFF = t(
  'Jede Kampfart lässt sich einzeln ausschalten – sie verschwindet dann aus Menüs, Warteschlangen und Herausforderungen. „Runden“ gilt für Kämpfe aus der Warteschlange, bei /duel wählt man selbst.',
  'Each fighting style can be switched off on its own – it then disappears from menus, queues and challenges. “Rounds” applies to fights from the queue; with /duel players choose themselves.',
);
const withKitsOff = (de: string, en: string): Text => t(`${de} ${KITS_OFF.de}`, `${en} ${KITS_OFF.en}`);

export const DUELS_AREA: SettingArea = {
  id: 'duels',
  title: t('Duels', 'Duels'),
  text: t(
    '20 Kampfarten in drei Gruppen, 1 gegen 1, 2 gegen 2 und Party-Kämpfe: jede Kampfart an oder aus, Bester aus 3 oder 5, dazu Arenen, Kampfzeiten und die gewertete Rangliste.',
    '20 fighting styles in three groups, 1v1, 2v2 and party fights: each style on or off, best of 3 or 5, plus arenas, fight times and the ranked leaderboard.',
  ),
  icon: 'Swords',
  panel: 'modes',
  mode: { id: 'duels', plugin: 'MoinMorniDuels' },
  sections: [
    rejoinSection(
      duels,
      30,
      t(
        'So viele Sekunden bleibt der Platz frei. Solange hält der Kampf an (beide eingefroren, die Zeit steht; im 2 gegen 2 kämpft das Team weiter). Wer rechtzeitig zurückkommt, steht mit gleichem Leben und gleicher Ausrüstung wieder dort. 0 = aus: Verbindung weg heißt verloren.',
        'The place stays free for this many seconds. Meanwhile the fight pauses (both frozen, the clock stops; in 2v2 the team keeps fighting). Whoever comes back in time stands there again with the same health and gear. 0 = off: losing the connection means losing the fight.',
      ),
    ),
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
            'Jede Arena gibt es so oft: die vier für alle (Almwiese, Burghof, Bergwerk, Wirtshausgarten) und die eigenen von Sumo (Tanzboden), Spleef (Schneefeld), Labyrinth (Irrgarten) und Brücke (Klammbrücke). 3 Kopien = bis zu 12 Kämpfe gleichzeitig mit Schwert und Bogen, dazu je 3 in den eigenen Arenen. Mehr Kopien brauchen mehr Speicher; neue werden beim Neustart dazugebaut.',
            'Each arena exists this often: the four for everyone (alpine meadow, castle yard, mine, tavern garden) and the own ones of Sumo (dance floor), Spleef (snowfield), Maze (hedge maze) and Bridge (gorge bridge). 3 copies = up to 12 fights at once with sword and bow, plus 3 each in the own arenas. More copies need more memory; new ones are built at the restart.',
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
            'Dauert ein Kampf länger, endet er unentschieden – außer ein Team liegt bei Runden, Treffern (Boxen) oder Toren (Brücke) vorn, dann gewinnt es (600 = 10 Minuten).',
            'If a fight takes longer, it ends in a draw – unless a team is ahead in rounds, hits (Boxing) or goals (Bridge), then it wins (600 = 10 minutes).',
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
      id: 'ranked',
      title: t('Gewertete Kämpfe', 'Ranked fights'),
      text: t(
        'Die Rangliste zählt Wertungspunkte (Elo) je Kampfart: Wer gewinnt, bekommt Punkte vom Verlierer – gegen Stärkere mehr, gegen Schwächere weniger.',
        'The leaderboard counts rating points (Elo) per fighting style: the winner gets points from the loser – more against stronger players, fewer against weaker ones.',
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
    {
      id: 'party',
      title: t('Party-Kämpfe', 'Party fights'),
      text: t(
        'Zwei Party-Leitungen fordern sich mit /duel heraus (Party gegen Party), oder eine Party kämpft mit /partykampf unter sich: jeder gegen jeden oder in zwei Teams. Party-Kämpfe sind immer locker.',
        'Two party leaders challenge each other with /duel (party against party), or a party fights among itself with /partykampf: everyone for themselves or in two teams. Party fights are always casual.',
      ),
      settings: [
        duels.number({
          key: 'partyMax',
          at: 'party.max-spieler',
          value: 8,
          min: 2,
          max: 8,
          ...PLAYERS,
          cmd: 'party groesse',
          label: t('Größte Party', 'Largest party'),
          help: t(
            'So viele dürfen in einem Party-Kampf höchstens sein – mehr Startplätze haben die Arenen nicht.',
            'At most this many may be in a party fight – the arenas have no more starting places.',
          ),
        }),
      ],
    },
    {
      id: 'kits-classic',
      title: t('Kampfarten: Klassisch', 'Fighting styles: Classic'),
      text: withKitsOff(
        'Kampf wie früher: keine Abklingzeit beim Schlagen, Rückstoß wie damals.',
        'Fighting like the old days: no attack cooldown, knockback like back then.',
      ),
      settings: DUELS_CLASSIC.flatMap(duelsKit),
    },
    {
      id: 'kits-modern',
      title: t('Kampfarten: Modern', 'Fighting styles: Modern'),
      text: withKitsOff(
        'Kampf wie heute: mit Abklingzeit beim Schlagen, Schild, Tränken und Blöcken.',
        'Fighting like today: with attack cooldown, shield, potions and blocks.',
      ),
      settings: DUELS_MODERN.flatMap(duelsKit),
    },
    {
      id: 'kits-fun',
      title: t('Kampfarten: Spaß', 'Fighting styles: Fun'),
      text: withKitsOff(
        'Besondere Regeln und eigene Arenen: Tanzboden, Schneefeld, Irrgarten und Klammbrücke.',
        'Special rules and their own arenas: dance floor, snowfield, hedge maze and gorge bridge.',
      ),
      settings: DUELS_FUN.flatMap(duelsKit),
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
  {
    id: 'goldwaschen',
    name: t('Goldwaschen', 'Gold Panning'),
    help: t(
      'Kies- und Sandhaufen am Bach auswaschen – in manchen steckt Gold.',
      'Pan gravel and sand piles by the stream – some hide gold.',
    ),
  },
  {
    id: 'schuhplattler',
    name: t('Schuhplattler', 'Slap Dance'),
    help: t(
      'Im Takt springen, ducken, klatschen oder stillstehen.',
      'Jump, duck, clap or stand still to the beat.',
    ),
  },
  {
    id: 'brueckenbau',
    name: t('Brückenbau', 'Bridge Builders'),
    help: t(
      'Mit Brettern eine Brücke über die Schlucht bauen.',
      'Build a bridge across the gorge with planks.',
    ),
  },
  {
    id: 'schneeballschlacht',
    name: t('Schneeballschlacht', 'Snowball Fight'),
    help: t('Schneebälle holen und die anderen treffen.', 'Grab snowballs and hit the others.'),
  },
  {
    id: 'schlittenrennen',
    name: t('Schlittenrennen', 'Sled Race'),
    help: t('Zwei Runden im Schlitten über die Eisbahn.', 'Two laps in a sled on the ice track.'),
  },
  {
    id: 'enzian-suche',
    name: t('Enzian-Suche', 'Gentian Hunt'),
    help: t(
      'Blaue Enziane auf der Almwiese finden und pflücken.',
      'Find and pick blue gentians on the alpine meadow.',
    ),
  },
  {
    id: 'musterweber',
    name: t('Musterweber', 'Pattern Weaver'),
    help: t(
      'Ein Muster merken und auf dem Webrahmen nachweben.',
      'Remember a pattern and weave it on the loom.',
    ),
  },
  {
    id: 'foehnsturm',
    name: t('Föhnsturm', 'Foehn Storm'),
    help: t(
      'Hinter Felsen Schutz vor den Böen suchen oder sich ducken.',
      'Take cover from the gusts behind rocks or duck.',
    ),
  },
  {
    id: 'tauziehen',
    name: t('Tauziehen', 'Tug of War'),
    help: t(
      'Nur mit Seiten (2 gegen 2 oder Duell): so schnell klicken, wie es geht.',
      'Only with sides (2 vs 2 or duel): click as fast as you can.',
    ),
  },
  {
    id: 'gamsjagd',
    name: t('Gamsjagd', 'Chamois Chase'),
    help: t(
      'Nur einer gegen drei: Der Jäger fängt die Gämsen.',
      'Only one against three: the hunter catches the chamois.',
    ),
  },
];

/** Auszeichnungen am Ende einer Brett-Partie (Kennung in der config.yml, Name, wofür). */
const AWARDS: ReadonlyArray<{ readonly id: string; readonly name: Text; readonly help: Text }> = [
  {
    id: 'wanderer',
    name: t('Wanderer', 'Hiker'),
    help: t('Wer die meisten Felder gelaufen ist.', 'Whoever walked the most fields.'),
  },
  {
    id: 'minispiel-meister',
    name: t('Minispiel-Meister', 'Minigame Master'),
    help: t('Wer die meisten Minispiele gewonnen hat.', 'Whoever won the most minigames.'),
  },
  {
    id: 'pechvogel',
    name: t('Pechvogel', 'Unlucky Bird'),
    help: t(
      'Wer am häufigsten auf roten Feldern stand – als Trost.',
      'Whoever landed on red fields most often – as a consolation.',
    ),
  },
  {
    id: 'duellkoenig',
    name: t('Duellkönig', 'Duel King'),
    help: t('Wer die meisten Duelle gewonnen hat.', 'Whoever won the most duels.'),
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
/** Minispiel-Marathon: Zahl der Minispiele zur Wahl und Punkte für Platz 1 bis 7 (wie in der config.yml). */
const MARATHON_ROUNDS = [6, 10, 15];
const MARATHON_POINTS = [10, 7, 5, 4, 3, 2, 1];
/** Seilschaft: Rundenzahlen zur Wahl. */
const ROPE_ROUNDS = [10, 15];
const ROUNDS: Unit = { unit: t('Runden', 'rounds'), arg: 'runden' };
const MINIS: Unit = { unit: t('Minispiele', 'minigames'), arg: 'zahl' };

/** Rundenzahlen zur Wahl (Abstimmung vor der Partie) – eine Einstellung je Stelle der Liste. */
const roundChoices = (
  keyPrefix: string,
  at: string,
  values: readonly number[],
  cmd: string,
  name: Text,
  unit: Unit,
  help: Text,
): SettingDef[] =>
  values.map((value, i) =>
    party.number({
      key: `${keyPrefix}${i + 1}`,
      at: `${at}.${i}`,
      value,
      min: 1,
      max: 50,
      ...unit,
      cmd: `${cmd}${i + 1}`,
      label: t(`${name.de}: ${i + 1}. Wahl`, `${name.en}: choice ${i + 1}`),
      help,
    }),
  );

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
    'Brettspiel für 2–8 und Spielarten ohne Brett: Tische, Wartezeiten, Züge, welche Minispiele vorkommen, die Zahlen der Spielregeln und jede Spielart (Schnelle Partie, Seilschaft, Bergduell, Minispiel-Marathon, Hüttenaufstieg). Gilt für neue Partien.',
    'Board game for 2–8 and modes without a board: tables, waiting times, turns, which minigames appear, the numbers of the rules and every mode (quick game, rope team, mountain duel, minigame marathon, hut climb). Applies to new games.',
  ),
  icon: 'Dices',
  panel: 'modes',
  mode: { id: 'party', plugin: 'MorniParty' },
  sections: [
    rejoinSection(
      party,
      120,
      t(
        'So viele Sekunden bleibt der Platz frei. Figur, Taler, Edelweiß und Gegenstände bleiben; ist man am Zug, würfelt das Spiel nach der Würfel-Zeit, Minispiele laufen ohne einen. Wer rechtzeitig zurückkommt, steht wieder auf dem eigenen Feld. Sind alle weg, hält die Partie an. 0 = aus.',
        'The place stays free for this many seconds. Piece, coins, edelweiss and items stay; if it is your turn, the game rolls after the dice time, minigames run without you. Whoever comes back in time stands on their own space again. If everyone is gone, the game pauses. 0 = off.',
      ),
    ),
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
            'Jeder Tisch hat alle sechs Spielbretter und alle Minispiel-Plätze. Mehr Tische brauchen mehr Speicher; neue werden beim Neustart dazugebaut.',
            'Every table has all six boards and all minigame areas. More tables need more memory; new ones are built at the restart.',
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
          help: t(
            'Mehr als 8 passen nicht an ein Spielbrett. Für den Minispiel-Marathon gilt eine eigene Grenze (weiter unten).',
            'More than 8 do not fit at one board. The minigame marathon has its own limit (further down).',
          ),
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
        ...roundChoices(
          'huntRounds',
          'edelweiss-jagd-runden',
          HUNT_ROUNDS,
          'jagd wahl',
          t('Edelweiß-Jagd', 'Edelweiss hunt'),
          ROUNDS,
          t(
            'Vor jeder Edelweiß-Jagd stimmen alle über die Länge ab – diese drei Rundenzahlen stehen zur Wahl.',
            'Before every edelweiss hunt everyone votes on its length – these three round counts are the choices.',
          ),
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
        'Welche Minispiele vorkommen. Sind alle an (oder alle aus), kommen alle vor – auch neue aus späteren Updates. Tauziehen und Gamsjagd gibt es nur, wenn Seiten gegeneinander spielen (2 gegen 2, 1 gegen 3, Duell).',
        'Which minigames appear. If all are on (or all off), all appear – including new ones from later updates. Tug of War and Chamois Chase only come up when sides play against each other (2 vs 2, 1 vs 3, duel).',
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
          t('Duellfeld', 'Duel field'),
          t(
            'So viele Taler gibt, wer das Duell-Minispiel verliert, dem Sieger (ein Schild schützt davor).',
            'Whoever loses the duel minigame gives the winner this many coins (a shield protects against it).',
          ),
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
      id: 'sides',
      title: t('Seiten: 2 gegen 2 und 1 gegen 3', 'Sides: 2 vs 2 and 1 vs 3'),
      text: t(
        'Zu viert entscheidet die Farbe der zuletzt betretenen Felder, wie das Minispiel gespielt wird: alle gleich = jeder gegen jeden, zwei und zwei = 2 gegen 2, eins anders = einer gegen drei.',
        'With four players, the colour of the fields they last stepped on decides how the minigame is played: all the same = everyone for themselves, two and two = 2 vs 2, one different = one against three.',
      ),
      settings: [
        taler(
          'teamTaler',
          'regeln.team-taler',
          8,
          100,
          'regel team',
          t('Sieg einer Seite', 'Win of a side'),
          t(
            'Taler für jede Person auf der Seite, die das Minispiel gewinnt.',
            'Coins for every person on the side that wins the minigame.',
          ),
        ),
        taler(
          'teamDrawTaler',
          'regeln.team-unentschieden-taler',
          3,
          100,
          'regel gleichstand',
          t('Gleichstand', 'Draw'),
          t('Taler für alle, wenn keine Seite vorn liegt.', 'Coins for everyone when no side is ahead.'),
        ),
        taler(
          'soloTaler',
          'regeln.einzel-taler',
          18,
          100,
          'regel einzel',
          t('Sieg des Einzelnen', 'Win of the single player'),
          t(
            'So viele Taler bekommt, wer allein gegen drei spielt und gewinnt.',
            'Coins for whoever plays alone against three and wins.',
          ),
        ),
        party.number({
          key: 'soloFactor',
          at: 'regeln.einzel-faktor',
          value: 4,
          min: 1,
          max: 5,
          arg: 'faktor',
          cmd: 'regel einzel-faktor',
          label: t('Punkte des Einzelnen zählen (mal)', 'Points of the single player count (times)'),
          help: t(
            'Sein Vorteil gegen drei: So oft zählen seine Punkte im Minispiel.',
            'Their advantage against three: their minigame points count this many times.',
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
    {
      id: 'quick',
      title: t('Schnelle Partie', 'Quick game'),
      text: t(
        'Edelweiß-Jagd in wenigen Runden – mit mehr Start-Talern, günstigerem Edelweiß und kürzeren Minispielen.',
        'Edelweiss hunt in just a few rounds – with more starting coins, cheaper edelweiss and shorter minigames.',
      ),
      settings: [
        party.number({
          key: 'quickRounds',
          at: 'schnelle-partie.runden',
          value: 5,
          min: 1,
          max: 50,
          ...ROUNDS,
          cmd: 'schnell runden',
          label: t('Runden', 'Rounds'),
          help: t('So lange dauert eine schnelle Partie.', 'This is how long a quick game lasts.'),
        }),
        taler(
          'quickStartTaler',
          'schnelle-partie.start-taler',
          20,
          100,
          'schnell start',
          t('Taler zum Start', 'Coins at the start'),
          t('Damit beginnt jeder.', 'Everyone starts with this.'),
        ),
        party.number({
          key: 'quickEdelweissPrice',
          at: 'schnelle-partie.edelweiss-preis',
          value: 15,
          min: 1,
          max: 200,
          ...TALER,
          cmd: 'schnell edelweiss',
          label: t('Preis eines Edelweiß', 'Price of an edelweiss'),
          help: t('Am wandernden Edelweiß-Stand.', 'At the wandering edelweiss stall.'),
        }),
        party.number({
          key: 'quickMiniFactor',
          at: 'schnelle-partie.dauer-faktor',
          value: 0.75,
          min: 0.2,
          max: 3,
          step: 0.05,
          arg: 'faktor',
          cmd: 'schnell dauer',
          label: t('Dauer der Minispiele (mal)', 'Length of minigames (times)'),
          help: t(
            'Kommt zur allgemeinen Dauer der Minispiele dazu: 0,75 = ein Viertel kürzer.',
            'On top of the general length of the minigames: 0.75 = a quarter shorter.',
          ),
        }),
      ],
    },
    {
      id: 'rope',
      title: t('Seilschaft', 'Rope team'),
      text: t(
        'Edelweiß-Jagd zu zweit: Taler und Edelweiß gehören beiden. Partys aus zwei Leuten sind eine Seilschaft, zu viert ist jedes Minispiel 2 gegen 2.',
        'Edelweiss hunt in pairs: coins and edelweiss belong to both. Parties of two are a rope team; with four, every minigame is 2 vs 2.',
      ),
      settings: roundChoices(
        'ropeRounds',
        'seilschaft.runden',
        ROPE_ROUNDS,
        'seilschaft wahl',
        t('Seilschaft', 'Rope team'),
        ROUNDS,
        t(
          'Vor der Partie stimmen alle über die Länge ab – diese Rundenzahlen stehen zur Wahl.',
          'Before the game everyone votes on its length – these round counts are the choices.',
        ),
      ),
    },
    {
      id: 'duel',
      title: t('Bergduell', 'Mountain duel'),
      text: t(
        'Zwei gegeneinander auf dem Brett – jedes Minispiel ist ein Duell.',
        'Two against each other on the board – every minigame is a duel.',
      ),
      settings: [
        party.number({
          key: 'duelRounds',
          at: 'bergduell.runden',
          value: 8,
          min: 1,
          max: 50,
          ...ROUNDS,
          cmd: 'bergduell runden',
          label: t('Runden', 'Rounds'),
          help: t('So lange dauert ein Bergduell.', 'This is how long a mountain duel lasts.'),
        }),
      ],
    },
    {
      id: 'marathon',
      title: t('Minispiel-Marathon', 'Minigame marathon'),
      text: t(
        'Ohne Spielbrett, nur Minispiele (aus der Auswahl oben, gemischt). Nach jedem gibt es Punkte für den Platz – wer am Ende die meisten hat, gewinnt.',
        'No board, only minigames (from the selection above, mixed). After each one there are points for your place – whoever has the most at the end wins.',
      ),
      settings: [
        ...roundChoices(
          'marathonRounds',
          'minispiel-marathon.runden',
          MARATHON_ROUNDS,
          'marathon wahl',
          t('Marathon', 'Marathon'),
          MINIS,
          t(
            'Vor dem Marathon stimmen alle ab, wie viele Minispiele es werden – diese Zahlen stehen zur Wahl.',
            'Before the marathon everyone votes on how many minigames there will be – these numbers are the choices.',
          ),
        ),
        party.number({
          key: 'marathonMax',
          at: 'minispiel-marathon.hoechstens',
          value: 16,
          min: 2,
          max: 16,
          ...PLAYERS,
          cmd: 'marathon hoechstens',
          label: t('Höchstens pro Marathon', 'At most per marathon'),
          help: t(
            'Bis zu 16. Eisstockschießen und Brückenbau haben nur 8 Plätze und fallen bei mehr Leuten aus.',
            'Up to 16. Ice Stock Sport and Bridge Builders only have 8 spots and are left out with more players.',
          ),
        }),
        ...MARATHON_POINTS.map((value, i) =>
          party.number({
            key: `marathonPoints${i + 1}`,
            at: `minispiel-marathon.punkte.${i}`,
            value,
            min: 0,
            max: 100,
            ...POINTS,
            cmd: `marathon-punkte platz${i + 1}`,
            label: t(`Punkte für Platz ${i + 1}`, `Points for place ${i + 1}`),
            help:
              i + 1 < MARATHON_POINTS.length
                ? t(`Nach jedem Minispiel für Platz ${i + 1}.`, `After every minigame for place ${i + 1}.`)
                : t(
                    `Nach jedem Minispiel für Platz ${i + 1} – und für alle Plätze danach.`,
                    `After every minigame for place ${i + 1} – and for every place after it.`,
                  ),
          }),
        ),
      ],
    },
    {
      id: 'hut',
      title: t('Hüttenaufstieg', 'Hut climb'),
      text: t(
        'Ohne Spielbrett: Wer ein Minispiel in der unteren Hälfte beendet, verliert ein Leben. Wer keins mehr hat, schaut zu – wer zuletzt übrig ist, gewinnt.',
        'No board: whoever finishes a minigame in the bottom half loses a life. Whoever has none left watches – the last one standing wins.',
      ),
      settings: [
        party.number({
          key: 'hutLives',
          at: 'huettenaufstieg.leben',
          value: 3,
          min: 1,
          max: 9,
          unit: t('Leben', 'lives'),
          arg: 'leben',
          cmd: 'huette leben',
          label: t('Leben am Anfang', 'Lives at the start'),
          help: t('So viele Leben hat jeder zu Beginn.', 'Everyone starts with this many lives.'),
        }),
        party.number({
          key: 'hutMaxMinigames',
          at: 'huettenaufstieg.hoechstens-minispiele',
          value: 25,
          min: 2,
          max: 100,
          ...MINIS,
          cmd: 'huette hoechstens',
          label: t('Spätestens Schluss nach', 'Ends at the latest after'),
          help: t('Dann gewinnt, wer die meisten Leben hat.', 'Then whoever has the most lives wins.'),
        }),
      ],
    },
    {
      id: 'awards',
      title: t('Auszeichnungen', 'Awards'),
      text: t(
        'Am Ende einer Brett-Partie (Edelweiß-Jagd, Seilschaft, Schnelle Partie, Bergduell) bekommt, wer vorn liegt, ein Edelweiß dazu. Sind alle Auszeichnungen aus, gibt es alle – ganz abschalten geht mit dem ersten Schalter.',
        'At the end of a board game (edelweiss hunt, rope team, quick game, mountain duel), whoever is ahead gets an extra edelweiss. If all awards are off, all are handed out – switch them off completely with the first switch.',
      ),
      settings: [
        party.flag({
          key: 'awards',
          at: 'auszeichnungen.an',
          value: true,
          cmd: 'auszeichnungen',
          label: t('Auszeichnungen verleihen', 'Hand out awards'),
          help: t(
            'Aus: keine Auszeichnungen und kein Edelweiß dazu.',
            'Off: no awards and no extra edelweiss.',
          ),
        }),
        ...AWARDS.map((a) =>
          party.flag({
            key: keyOf('award', a.id),
            at: 'auszeichnungen.welche',
            member: a.id,
            value: true,
            cmd: `auszeichnung ${a.id}`,
            label: a.name,
            help: a.help,
          }),
        ),
      ],
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
    rejoinSection(
      gipfel,
      90,
      t(
        'So viele Sekunden bleibt ein Lauf nach einem Verbindungsabbruch offen. Wer rechtzeitig zurückkommt, macht am letzten Kontrollpunkt weiter (die Uhr ist weitergelaufen), ohne Kontrollpunkt am Start; ein Party-Rennen wartet. 0 = aus.',
        'A run stays open for this many seconds after a lost connection. Whoever comes back in time continues at the last checkpoint (the clock kept running), without one at the start; a party race waits. 0 = off.',
      ),
    ),
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
    rejoinSection(
      verlies,
      120,
      t(
        'So viele Sekunden bleibt der Platz frei. Die Gruppe spielt weiter; wer rechtzeitig zurückkommt, steht im Raum der Gruppe mit gleicher Ausrüstung und gleichem Leben. Sind alle weg, hält der Abstieg an – auch die Zeit. 0 = aus.',
        'The place stays free for this many seconds. The group plays on; whoever comes back in time stands in the group’s room with the same gear and health. If everyone is gone, the descent pauses – the clock too. 0 = off.',
      ),
    ),
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
    rejoinSection(
      bollwerk,
      120,
      t(
        'So viele Sekunden bleibt der Platz frei. Die anderen verteidigen weiter; wer rechtzeitig zurückkommt, steht an derselben Stelle mit gleicher Ausrüstung und gleichem Leben. Sind alle weg, hält die Runde an. 0 = aus.',
        'The place stays free for this many seconds. The others keep defending; whoever comes back in time stands at the same spot with the same gear and health. If everyone is gone, the round pauses. 0 = off.',
      ),
    ),
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

/** Ringe des Zufalls-Teleports: kleinster und größter Abstand zur Weltmitte (wie in der config.yml). */
const RTP_RINGS: ReadonlyArray<readonly [string, Text, number, number]> = [
  ['nah', t('Nah', 'Near'), 500, 2000],
  ['mittel', t('Mittel', 'Middle'), 2000, 5000],
  ['weit', t('Weit', 'Far'), 5000, 9500],
  ['nether', t('Nether', 'Nether'), 100, 1100],
  ['end', t('End', 'End'), 1000, 5000],
];

/** Ankauf im Händlerhaus: die Stufen 2–4 (Stufe 1 = voller Preis bis zur Tagesmenge, die setzt der Modus selbst). */
const BUYBACK_TIERS: ReadonlyArray<readonly [number, number]> = [
  [1, 50],
  [2, 20],
  [4, 5],
];

/** Abteilungen des Händlerhauses (`haendler.faktoren.<abteilung>`), Namen wie im Spiel. */
const MERCHANT_DEPARTMENTS: ReadonlyArray<readonly [string, Text]> = [
  ['bloecke', t('Baublöcke', 'Building blocks')],
  ['holz', t('Holz & Pflanzen', 'Wood & plants')],
  ['erze', t('Erze & Edelsteine', 'Ores & gems')],
  ['deko', t('Farben & Deko', 'Colours & decor')],
  ['essen', t('Essen & Ernte', 'Food & crops')],
  ['werkzeug', t('Werkzeug & Waffen', 'Tools & weapons')],
  ['traenke', t('Tränke & Zauber', 'Potions & magic')],
  ['redstone', t('Redstone & Technik', 'Redstone & tech')],
  ['beute', t('Mob-Beute', 'Mob drops')],
  ['besonderes', t('Besonderes & Saison', 'Special & seasonal')],
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
    'Überleben mit freiem Markt: Taler, Weltgrenzen, Reisen, Auktionshaus, Aufträge, Stände, Grundstücke, das Händlerhaus der Stadt mit Börse und tägliche Belohnung. Nichts davon gibt es für echtes Geld.',
    'Survival with a free market: coins, world borders, travel, auction house, orders, stalls, plots, the town’s merchant house with its exchange and the daily reward. None of it is for real money.',
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
      id: 'merchant',
      title: t('Händlerhaus', 'Merchant house'),
      text: t(
        'Händlerin Vroni in der Stadt (/shop) verkauft zu festen Preisen und kauft an – das ist auch der Ankauf (/verkaufen). Damit der freie Markt unter Spielern lebt, verkauft sie teuer und kauft billig.',
        'Vroni the merchant in town (/shop) sells at fixed prices and buys things up – that is also the buyback (/verkaufen). So the free market between players stays alive, she sells dear and buys cheap.',
      ),
      settings: [
        smp.flag({
          key: 'merchant',
          at: 'haendler.an',
          value: true,
          cmd: 'haendler',
          label: t('Händlerhaus offen', 'Merchant house open'),
          help: t(
            'Aus: kein /shop und auch kein Ankauf – gehandelt wird nur noch unter Spielern.',
            'Off: no /shop and no buyback either – trading only happens between players.',
          ),
        }),
        smp.number({
          key: 'merchantSellCap',
          at: 'haendler.verkauf-max-prozent',
          value: 40,
          min: 0,
          max: 90,
          ...PERCENT,
          cmd: 'haendler ankauf-max',
          label: t('Ankauf höchstens', 'Buyback at most'),
          help: t(
            'So viel Prozent ihres Verkaufspreises zahlt die Händlerin höchstens, wenn sie etwas ankauft. Teurere Ankaufspreise senkt sie von selbst.',
            'The merchant pays at most this many percent of her selling price when she buys something. Higher buyback prices are lowered automatically.',
          ),
        }),
        money(
          'merchantConfirmAbove',
          'haendler.bestaetigen-ab',
          250,
          'haendler nachfragen-ab',
          t('Nachfragen ab', 'Ask again from'),
          t(
            'Ab diesem Betrag fragt die Händlerin beim Kaufen und Verkaufen noch einmal nach („Wirklich?“). 0 = nie.',
            'From this amount the merchant asks once more when buying or selling (“Really?”). 0 = never.',
          ),
        ),
      ],
    },
    {
      id: 'merchant-prices',
      title: t('Händlerhaus: Preise je Abteilung', 'Merchant house: prices per department'),
      text: t(
        'Alle Kauf- und Ankaufspreise einer Abteilung mal diesem Wert: 1 = wie in der Preisliste, 2 = doppelt so teuer, 0,5 = halb so teuer. Erze und Edelsteine sind von Haus aus kostbar (Diamant etwa 40-mal so viel wie Alltagsware). Würde ein Ankaufspreis danach „kaufen, umbauen, verkaufen“ lohnend machen, senkt MorniSMP ihn von selbst.',
        'All buying and buyback prices of a department times this value: 1 = as in the price list, 2 = twice as dear, 0.5 = half as dear. Ores and gems are precious from the start (a diamond is about 40 times an everyday item). If a buyback price would then make “buy, craft, sell” pay off, MorniSMP lowers it by itself.',
      ),
      settings: MERCHANT_DEPARTMENTS.map(([id, name]) =>
        smp.number({
          key: keyOf('factor', id),
          at: `haendler.faktoren.${id}`,
          value: 1,
          min: 0.05,
          max: 100,
          step: 0.05,
          unit: t('mal', 'times'),
          arg: 'faktor',
          cmd: `faktor ${id}`,
          label: name,
          help: t(
            `Preise der Abteilung „${name.de}“ mal diesem Wert.`,
            `Prices of the department “${name.en}” times this value.`,
          ),
        }),
      ),
    },
    {
      id: 'exchange',
      title: t('Börse', 'Exchange'),
      text: t(
        'Jede Ware der Händlerin hat einen Kurs nach Angebot und Nachfrage: Verkaufen alle zusammen viel an Vroni, zahlt sie weniger; kaufen alle viel, verlangt sie mehr. Mit der Zeit kehrt jeder Kurs zum Grundpreis zurück. Vroni zahlt nie mehr als den Grundpreis und verlangt nie weniger – billig kaufen und teuer verkaufen lohnt sich bei ihr also nie. Spielerpreise (Auktionshaus, Aufträge, Läden) bleiben frei. Im Spiel: /boerse und /wert.',
        'Every ware of the merchant has a rate by supply and demand: if everyone together sells a lot to Vroni, she pays less; if everyone buys a lot, she asks more. Over time every rate returns to the base price. Vroni never pays more than the base price and never asks less – so buying cheap and selling dear never pays off with her. Player prices (auction house, orders, shops) stay free. In the game: /boerse and /wert.',
      ),
      settings: [
        smp.flag({
          key: 'exchange',
          at: 'boerse.an',
          value: true,
          cmd: 'boerse',
          label: t('Kurse an', 'Rates on'),
          help: t(
            'Aus: Die Händlerin nimmt immer den Grundpreis aus der Preisliste.',
            'Off: the merchant always uses the base price from the price list.',
          ),
        }),
        smp.number({
          key: 'exchangeHalveAfter',
          at: 'boerse.halbieren-nach',
          value: 4,
          min: 0.25,
          max: 1000,
          step: 0.25,
          unit: t('Tagesmengen', 'daily amounts'),
          arg: 'tagesmengen',
          cmd: 'boerse halbieren-nach',
          label: t('Halber Preis nach', 'Half price after'),
          help: t(
            'So viele Tagesmengen einer Ware muss die Stadt mehr an Vroni verkaufen als bei ihr kaufen, bis sie nur noch die Hälfte zahlt – und genauso viele mehr kaufen als verkaufen, bis sie das Doppelte verlangt. Kleiner = der Kurs reagiert schneller.',
            'The town has to sell this many daily amounts of a ware more to Vroni than it buys from her until she pays only half – and buy as many more than it sells until she asks double. Smaller = the rate reacts faster.',
          ),
        }),
        smp.number({
          key: 'exchangeRecovery',
          at: 'boerse.erholung-stunden',
          value: 6,
          min: 0.05,
          max: 1440,
          step: 0.05,
          ...HOURS,
          cmd: 'boerse erholung',
          label: t('Kurs erholt sich zur Hälfte in', 'Rate recovers halfway in'),
          help: t(
            'Nach so vielen Stunden ist die Hälfte eines Ausschlags wieder weg.',
            'After this many hours half of a swing is gone again.',
          ),
        }),
        smp.number({
          key: 'exchangeMinPercent',
          at: 'boerse.min-prozent',
          value: 25,
          min: 1,
          max: 100,
          ...PERCENT,
          cmd: 'boerse min',
          label: t('Ankauf fällt höchstens auf', 'Buyback falls at most to'),
          help: t(
            'So viel Prozent vom Grundpreis zahlt Vroni mindestens, auch wenn alle verkaufen.',
            'Vroni pays at least this many percent of the base price, even when everyone sells.',
          ),
        }),
        smp.number({
          key: 'exchangeMaxPercent',
          at: 'boerse.max-prozent',
          value: 300,
          min: 100,
          max: 1000,
          ...PERCENT,
          cmd: 'boerse max',
          label: t('Verkauf steigt höchstens auf', 'Selling price rises at most to'),
          help: t(
            'So viel Prozent vom Grundpreis verlangt Vroni höchstens, auch wenn alle kaufen.',
            'Vroni asks at most this many percent of the base price, even when everyone buys.',
          ),
        }),
      ],
    },
    {
      id: 'buyback',
      title: t('Händlerhaus: Ankauf-Stufen', 'Merchant house: buyback tiers'),
      text: t(
        'Für alles, was die Händlerin ankauft: Bis zur Tagesmenge einer Ware zahlt sie den vollen Preis, danach weniger – ab dem Vielfachen der Tagesmenge nur noch so viel Prozent. Das hält die Preise fair.',
        'For everything the merchant buys: up to a ware’s daily amount she pays the full price, after that less – from a multiple of the daily amount only this many percent. That keeps prices fair.',
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
          value: 'moinmorni.net',
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
    rejoinSection(
      wolken,
      90,
      t(
        'So viele Sekunden bleiben Insel, Sachen und Team frei. Wer rechtzeitig zurückkommt, macht genau dort weiter; sonst scheidet er aus. Wer gerade von einem Gegner getroffen wurde, scheidet beim Verlassen sofort aus. 0 = aus.',
        'Island, items and team stay reserved for this many seconds. Whoever comes back in time continues right there; otherwise they are out. Anyone just hit by an opponent is out at once when leaving. 0 = off.',
      ),
    ),
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

/** Punkte der Runde (`punkte.*`): so viele nimmt der Modus höchstens an. Nur Punkte aus dem Spiel, nie echtes Geld. */
const MAX_ROUND_POINTS = 1000;
const MAX_SHOP_PRICE = 100_000;
const roundPoints = (
  key: string,
  at: string,
  value: number,
  cmd: string,
  label: Text,
  help: Text,
): SettingDef =>
  versteck.number({
    key,
    at: `punkte.${at}`,
    value,
    min: 0,
    max: MAX_ROUND_POINTS,
    ...POINTS,
    cmd: `punkte ${cmd}`,
    label,
    help,
  });

/**
 * Eine Hilfe der Kramerkiste (Rundenladen, `rundenladen.<id>`): bezahlt mit Punkten der laufenden Runde, begrenzt je
 * Runde. Nur was die Hilfe in der config.yml hat, kommt ins Panel (Pause, Dauer und Reichweite nicht bei jeder).
 */
interface SupplyHelp {
  readonly id: string;
  readonly name: Text;
  readonly help: Text;
  readonly price: number;
  readonly perRound: number;
  readonly cooldown?: number;
  readonly seconds?: number;
  readonly range?: { readonly value: number; readonly help: Text };
}

const HIDER_HELPS: readonly SupplyHelp[] = [
  {
    id: 'lockpfiff',
    name: t('Lockpfiff', 'Decoy whistle'),
    help: t(
      'Der eigene Pfiff erklingt ein Stück weiter weg und lockt die Gendarmen auf die falsche Fährte – ohne Punkte, zählt nicht als Pflicht-Pfiff.',
      'Your whistle sounds a bit further away and sends the constables on a wild goose chase – no points, does not count as a compulsory whistle.',
    ),
    price: 6,
    perRound: 2,
    cooldown: 30,
    range: {
      value: 12,
      help: t('So weit weg erklingt der Lockpfiff.', 'This far away the decoy whistle sounds.'),
    },
  },
  {
    id: 'nebelwolke',
    name: t('Nebelwolke', 'Fog cloud'),
    help: t(
      'Kurz Nebel um einen herum: Gendarmen darin sehen einen Moment nichts und kommen langsamer voran.',
      'A moment of fog around you: constables inside can’t see for a moment and move more slowly.',
    ),
    price: 8,
    perRound: 1,
    cooldown: 45,
    seconds: 4,
    range: { value: 4, help: t('So weit reicht der Nebel.', 'This far the fog reaches.') },
  },
  {
    id: 'gestaltwechsel',
    name: t('Noch ein Gestaltwechsel', 'Another disguise change'),
    help: t(
      'Noch einmal die Gestalt wechseln, wenn der eine Wechsel der Runde schon weg ist.',
      'Change your disguise once more when the round’s one change is already used.',
    ),
    price: 10,
    perRound: 1,
  },
];

const SEEKER_HELPS: readonly SupplyHelp[] = [
  {
    id: 'laterne',
    name: t('Laterne', 'Lantern'),
    help: t(
      'Zeigt ein paar Sekunden, wer sich in der Nähe bewegt – wer still hält oder eingerastet ist, bleibt unsichtbar.',
      'Shows for a few seconds who is moving nearby – anyone who keeps still or is locked in place stays hidden.',
    ),
    price: 8,
    perRound: 2,
    cooldown: 40,
    seconds: 5,
    range: { value: 16, help: t('So weit zeigt die Laterne.', 'This far the lantern shows.') },
  },
  {
    id: 'spuernase',
    name: t('Noch eine Spürnase', 'Another sniff'),
    help: t(
      'Noch einmal schnuppern, wenn die Spürnase der Runde schon benutzt ist.',
      'Sniff once more when the round’s sniffer is already used.',
    ),
    price: 12,
    perRound: 1,
  },
];

/** Einstellungen einer Hilfe der Kramerkiste: an/aus, Preis, Pause, wie oft je Runde, Dauer, Reichweite. */
function supplyHelp(h: SupplyHelp): SettingDef[] {
  const at = `rundenladen.${h.id}`;
  const key = keyOf('supply', h.id);
  const cmd = `kiste ${h.id}`;
  const named = (de: string, en: string): Text => t(`${h.name.de}: ${de}`, `${h.name.en}: ${en}`);
  return [
    versteck.flag({ key, at: `${at}.an`, value: true, cmd, label: h.name, help: h.help }),
    versteck.number({
      key: `${key}Price`,
      at: `${at}.preis`,
      value: h.price,
      min: 0,
      max: MAX_ROUND_POINTS,
      ...POINTS,
      cmd: `${cmd} preis`,
      label: named('Preis', 'price'),
      help: t(
        'Kostet so viele Punkte aus der laufenden Runde.',
        'Costs this many points from the current round.',
      ),
    }),
    ...(h.cooldown === undefined
      ? []
      : [
          versteck.number({
            key: `${key}Cooldown`,
            at: `${at}.abklingzeit-sekunden`,
            value: h.cooldown,
            min: 0,
            max: 600,
            ...SECONDS,
            cmd: `${cmd} pause`,
            label: named('Pause danach', 'pause after'),
            help: t('So lange, bis man sie wieder kaufen kann.', 'This long until it can be bought again.'),
          }),
        ]),
    versteck.number({
      key: `${key}PerRound`,
      at: `${at}.je-runde`,
      value: h.perRound,
      min: 0,
      max: 20,
      unit: t('mal', 'times'),
      arg: 'zahl',
      cmd: `${cmd} je-runde`,
      label: named('je Runde höchstens', 'at most per round'),
      help: t(
        'So oft kann man sie in einer Runde kaufen.',
        'This is how often it can be bought in one round.',
      ),
    }),
    ...(h.seconds === undefined
      ? []
      : [
          versteck.number({
            key: `${key}Seconds`,
            at: `${at}.sekunden`,
            value: h.seconds,
            min: 1,
            max: 30,
            ...SECONDS,
            cmd: `${cmd} dauer`,
            label: named('hält', 'lasts'),
            help: t('So lange wirkt sie.', 'This is how long it works.'),
          }),
        ]),
    ...(h.range === undefined
      ? []
      : [
          versteck.number({
            key: `${key}Range`,
            at: `${at}.reichweite`,
            value: h.range.value,
            min: 1,
            max: 48,
            ...BLOCKS,
            cmd: `${cmd} weite`,
            label: named('Reichweite', 'range'),
            help: h.range.help,
          }),
        ]),
  ];
}

/** Ein Stück aus dem Kramerladen (`laden.<abteilung>.<id>`) mit Name, Beschreibung und Preis wie in der config.yml. */
interface StoreItem {
  readonly id: string;
  readonly name: Text;
  readonly help: Text;
  readonly price: number;
}

/** Eine Abteilung des Kramerladens: Abschnitt im Panel, Wort im Befehl („/versteckconfig laden pfiff …“). */
interface StoreShelf {
  readonly id: string;
  readonly section: string;
  readonly word: string;
  readonly key: string;
  readonly title: Text;
  readonly text: Text;
  readonly items: readonly StoreItem[];
}

const item = (id: string, name: Text, help: Text, price: number): StoreItem => ({ id, name, help, price });

const STORE: readonly StoreShelf[] = [
  {
    id: 'gestalten',
    section: 'store-shapes',
    word: 'gestalt',
    key: 'storeShape',
    title: t('Kramerladen: Gestalten', 'General store: disguises'),
    text: t(
      'Gestalten zum Freischalten. Es gibt sie nur auf Karten, auf denen genug echte Attrappen stehen.',
      'Disguises to unlock. They only come up on maps with enough real look-alikes.',
    ),
    items: [
      item(
        'werkbank',
        t('Werkbank', 'Workbench'),
        t(
          'Steht in Schmiede, Holzlege, Tenne und Küche.',
          'Found in the smithy, woodshed, threshing floor and kitchen.',
        ),
        150,
      ),
      item(
        'schleifstein',
        t('Schleifstein', 'Grindstone'),
        t(
          'Steht, wo Messer und Sensen geschliffen werden.',
          'Found wherever knives and scythes get sharpened.',
        ),
        150,
      ),
      item(
        'webstuhl',
        t('Webstuhl', 'Loom'),
        t('Steht in der Bauernstube und im Laden.', 'Found in the farmhouse parlour and the shop.'),
        150,
      ),
      item(
        'busch',
        t('Blühender Busch', 'Flowering bush'),
        t('Wächst auf den Wiesen.', 'Grows on the meadows.'),
        300,
      ),
      item(
        'lesepult',
        t('Lesepult', 'Lectern'),
        t(
          'Steht in der Stube, in den Gästezimmern und im Saal.',
          'Found in the parlour, the guest rooms and the hall.',
        ),
        300,
      ),
      item(
        'kuchen',
        t('Kuchen', 'Cake'),
        t('Steht auf Tischen und Theken.', 'Found on tables and counters.'),
        300,
      ),
      item(
        'kuerbislaterne',
        t('Kürbislaterne', 'Jack-o’-lantern'),
        t('Leuchtet – im Laden, im Garten, am Zaun.', 'It glows – in the shop, the garden, on the fence.'),
        600,
      ),
      item(
        'festtagskuchen',
        t('Festtagskuchen', 'Festive cake'),
        t('Mit Kerze – auf den Tischen im Tanzsaal.', 'With a candle – on the tables in the dance hall.'),
        600,
      ),
    ],
  },
  {
    id: 'pfiffe',
    section: 'store-whistles',
    word: 'pfiff',
    key: 'storeWhistle',
    title: t('Kramerladen: Pfiff-Klänge', 'General store: whistle sounds'),
    text: t(
      'Laute und sehr laute Klänge hört man weiter – dafür bringen sie Extrapunkte (siehe „Punkte der Versteckten“).',
      'Loud and very loud sounds carry further – so they earn extra points (see “Points for hiders”).',
    ),
    items: [
      item(
        'kuckuck',
        t('Kuckuck', 'Cuckoo'),
        t('„Kuck-kuck, kuck-kuck“ aus dem Wald. Leise.', '“Cuck-oo, cuck-oo” from the woods. Quiet.'),
        80,
      ),
      item(
        'henne',
        t('Henne', 'Hen'),
        t('Gegacker – und plopp, ein Ei. Leise.', 'Clucking – and plop, an egg. Quiet.'),
        80,
      ),
      item(
        'murmeltier',
        t('Murmeltier-Pfiff', 'Marmot whistle'),
        t('Schriller Warnpfiff wie auf der Alm. Laut.', 'A shrill alarm whistle like up on the alp. Loud.'),
        160,
      ),
      item(
        'kuhglocke',
        t('Kuhglocke', 'Cowbell'),
        t('Bimmel-bammel wie auf der Weide. Laut.', 'Ding-dong like out on the pasture. Loud.'),
        160,
      ),
      item(
        'jodler',
        t('Jodler', 'Yodel'),
        t(
          '„Holla-di-ri-di“ – hoch und tief im Wechsel. Sehr laut.',
          '“Holla-dee-ree-dee” – high and low in turn. Very loud.',
        ),
        280,
      ),
      item(
        'trompete',
        t('Trompete', 'Trumpet'),
        t('Eine kleine Fanfare: Tä-tä-tä-täää! Sehr laut.', 'A little fanfare: ta-ta-ta-taaa! Very loud.'),
        280,
      ),
      item(
        'alphorn',
        t('Alphorn', 'Alphorn'),
        t(
          'Ein langer, tiefer Ruf über die Berge. Sehr laut.',
          'A long, deep call across the mountains. Very loud.',
        ),
        280,
      ),
    ],
  },
  {
    id: 'fund-effekte',
    section: 'store-finds',
    word: 'fund',
    key: 'storeFind',
    title: t('Kramerladen: Fund-Effekte', 'General store: find effects'),
    text: t(
      'Was erscheint, wenn man als Gendarm jemanden findet.',
      'What appears when you find someone as a constable.',
    ),
    items: [
      item(
        'herzerl',
        t('Herzerl', 'Little hearts'),
        t('Herzen steigen auf, wo man jemanden findet.', 'Hearts rise where you find someone.'),
        100,
      ),
      item(
        'rauchwolke',
        t('Rauchwolke', 'Puff of smoke'),
        t('Puff! Eine dicke Wolke.', 'Poof! A big cloud.'),
        100,
      ),
      item(
        'konfetti',
        t('Konfetti', 'Confetti'),
        t('Bunte Schnipsel in alle Richtungen.', 'Colourful bits in every direction.'),
        200,
      ),
      item(
        'blueten',
        t('Blütenregen', 'Blossom shower'),
        t('Rosa Blütenblätter wirbeln.', 'Pink petals swirl around.'),
        200,
      ),
      item(
        'weissblau',
        t('Weiß-blaue Funken', 'White-and-blue sparks'),
        t('Ein Ring aus weißen und blauen Funken.', 'A ring of white and blue sparks.'),
        350,
      ),
      item(
        'goldregen',
        t('Goldregen', 'Golden rain'),
        t('Goldstaub rieselt herab.', 'Gold dust trickles down.'),
        350,
      ),
    ],
  },
  {
    id: 'spuren',
    section: 'store-trails',
    word: 'spur',
    key: 'storeTrail',
    title: t('Kramerladen: Spuren', 'General store: trails'),
    text: t(
      'Spuren beim Laufen – nur in der Gendarmerie, nie in einer Runde.',
      'Trails while walking – only in the constabulary, never during a round.',
    ),
    items: [
      item(
        'noten',
        t('Notenspur', 'Trail of notes'),
        t('Bunte Noten bei jedem Schritt.', 'Colourful notes with every step.'),
        100,
      ),
      item(
        'herzerl',
        t('Herzerlspur', 'Trail of hearts'),
        t('Kleine Herzen hinter einem.', 'Little hearts behind you.'),
        100,
      ),
      item(
        'schneeflocken',
        t('Schneeflocken', 'Snowflakes'),
        t('Es schneit, wo man geht.', 'It snows wherever you walk.'),
        200,
      ),
      item(
        'blueten',
        t('Blütenblätter', 'Petals'),
        t('Rosa Blätter fallen hinter einem.', 'Pink petals fall behind you.'),
        200,
      ),
      item(
        'funken',
        t('Weiß-blaue Funken', 'White-and-blue sparks'),
        t('Funken in Weiß und Blau.', 'Sparks in white and blue.'),
        350,
      ),
      item(
        'gluehwuermchen',
        t('Glühwürmchen', 'Fireflies'),
        t('Kleine Lichter tanzen um einen herum.', 'Tiny lights dance around you.'),
        350,
      ),
    ],
  },
  {
    id: 'sieg-effekte',
    section: 'store-wins',
    word: 'sieg',
    key: 'storeWin',
    title: t('Kramerladen: Sieg-Effekte', 'General store: victory effects'),
    text: t('Am Ende einer gewonnenen Runde.', 'At the end of a round you won.'),
    items: [
      item('glocken', t('Glockenläuten', 'Bells ringing'), t('Die Glocken läuten.', 'The bells ring.'), 120),
      item(
        'konfetti',
        t('Konfetti-Regen', 'Confetti shower'),
        t('Bunte Schnipsel über dem Kopf.', 'Colourful bits above your head.'),
        220,
      ),
      item('goldregen', t('Goldregen', 'Golden rain'), t('Gold rieselt herab.', 'Gold trickles down.'), 220),
      item(
        'feuerwerk',
        t('Feuerwerk', 'Fireworks'),
        t('Grün-goldenes Feuerwerk über einem.', 'Green-and-gold fireworks above you.'),
        400,
      ),
      item(
        'weissblau',
        t('Weiß-blaue Fontäne', 'White-and-blue fountain'),
        t('Eine Fontäne aus weißen und blauen Funken.', 'A fountain of white and blue sparks.'),
        400,
      ),
    ],
  },
  {
    id: 'titel',
    section: 'store-titles',
    word: 'titel',
    key: 'storeTitle',
    title: t('Kramerladen: Titel', 'General store: titles'),
    text: t(
      'Im Steckbrief, in der Leiste der Runde und in der Rangliste. Manche gibt es erst ab einer Zahl Pfiffe, Funde oder Runden.',
      'In the profile card, the round’s sidebar and the leaderboard. Some are only available after a number of whistles, finds or rounds.',
    ),
    items: [
      item(
        'dorfkind',
        t('Dorfkind', 'Village kid'),
        t('Hier kennt einen jeder.', 'Everybody here knows you.'),
        60,
      ),
      item(
        'heustadl-held',
        t('Heustadl-Held', 'Hay barn hero'),
        t('Kein Heuballen ist vor einem sicher.', 'No hay bale is safe from you.'),
        120,
      ),
      item(
        'pfeifkoenig',
        t('Pfeifkönig', 'Whistle royalty'),
        t(
          'Für alle, die sich trauen zu pfeifen – erst ab 50 Pfiffen.',
          'For everyone who dares to whistle – from 50 whistles.',
        ),
        200,
      ),
      item(
        'spuernase',
        t('Spürnase', 'Sharp nose'),
        t('Findet sie alle – erst ab 25 Funden.', 'Finds them all – from 25 finds.'),
        250,
      ),
      item(
        'meister-der-tarnung',
        t('Meister der Tarnung', 'Master of disguise'),
        t(
          'Niemand hat einen je gesehen – erst ab 15 Runden unentdeckt.',
          'Nobody has ever seen you – from 15 rounds undiscovered.',
        ),
        300,
      ),
      item(
        'oberwachtmeister',
        t('Oberwachtmeister', 'Chief constable'),
        t(
          'Die Gendarmerie hört aufs Kommando – erst ab 75 Funden.',
          'The constabulary follows your lead – from 75 finds.',
        ),
        500,
      ),
      item(
        'dorflegende',
        t('Dorflegende', 'Village legend'),
        t(
          'Man erzählt sich Geschichten – erst ab 100 Runden.',
          'People tell stories about you – from 100 rounds.',
        ),
        800,
      ),
    ],
  },
];

/** Abschnitt einer Abteilung des Kramerladens: je Stück „im Laden“ (an/aus) und Preis. */
const storeSection = (shelf: StoreShelf): SettingSection => ({
  id: shelf.section,
  title: shelf.title,
  text: shelf.text,
  settings: shelf.items.flatMap((i) => {
    const key = keyOf(shelf.key, i.id);
    const at = `laden.${shelf.id}.${i.id}`;
    const cmd = `laden ${shelf.word} ${i.id}`;
    return [
      versteck.flag({ key, at: `${at}.an`, value: true, cmd, label: i.name, help: i.help }),
      versteck.number({
        key: `${key}Price`,
        at: `${at}.preis`,
        value: i.price,
        min: 0,
        max: MAX_SHOP_PRICE,
        ...POINTS,
        cmd: `${cmd} preis`,
        label: t(`${i.name.de}: Preis`, `${i.name.en}: price`),
        help: t('So viele Punkte vom Guthaben kostet es.', 'Costs this many points from the balance.'),
      }),
    ];
  }),
});

export const VERSTECKERL_AREA: SettingArea = {
  id: 'versteckerl',
  title: t('Versteckerl', 'Hide & Seek'),
  text: t(
    'Verstecken mit Verwandlung: Zeiten, wie viele Gendarmen suchen, wie viel ein Treffer zählt, die Hilfen (Pfiff, Sprungkraft, Spürnase), Punkte, die Kramerkiste in der Runde und der Kramerladen. Punkte gibt es nur im Spiel – nichts davon für echtes Geld.',
    'Hide and seek with a twist: times, how many constables seek, what a hit counts, the helpers (whistle, jump boost, sniffer), points, the supply box in the round and the general store. Points only exist in the game – none of it is for real money.',
  ),
  icon: 'EyeOff',
  panel: 'modes',
  mode: { id: 'versteckerl', plugin: 'MorniVersteckerl' },
  sections: [
    rejoinSection(
      versteck,
      90,
      t(
        'So viele Sekunden bleiben Rolle, Gestalt, Versteck und Punkte frei. Wer rechtzeitig zurückkommt, rastet am selben Platz wieder ein; sonst verlässt er die Runde wie bisher. 0 = aus.',
        'Role, shape, hiding spot and points stay reserved for this many seconds. Whoever comes back in time snaps back into the same spot; otherwise they leave the round as before. 0 = off.',
      ),
    ),
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
    {
      id: 'points-seekers',
      title: t('Punkte der Gendarmen', 'Points for constables'),
      text: t(
        'Punkte gibt es in der Runde. Was am Ende übrig ist, kommt aufs Guthaben – damit kauft man im Kramerladen ein. „Punkte insgesamt“ (Steckbrief, Bestenliste) zählen alles Verdiente und sinken nie.',
        'Points are earned in the round. Whatever is left at the end goes onto the balance – to shop with at the general store. “Total points” (profile card, leaderboard) count everything earned and never go down.',
      ),
      settings: [
        roundPoints(
          'pointsHit',
          'treffer',
          2,
          'treffer',
          t('Treffer', 'Hit'),
          t('Für jeden Schlag, der einen Versteckten trifft.', 'For every blow that hits a hider.'),
        ),
        roundPoints(
          'pointsFind',
          'fund',
          10,
          'fund',
          t('Fund', 'Find'),
          t('Wenn ein Versteckter gefunden ist.', 'When a hider is found.'),
        ),
        roundPoints(
          'pointsFirstFind',
          'erster-fund',
          5,
          'erster-fund',
          t('Erster Fund der Runde', 'First find of the round'),
          t('Kommt beim ersten Fund obendrauf.', 'Added on top for the first find.'),
        ),
        roundPoints(
          'pointsSeekersWin',
          'gendarmen-sieg',
          5,
          'sieg',
          t('Sieg der Gendarmen', 'Constables win'),
          t(
            'Für jeden Gendarmen, wenn am Ende niemand mehr versteckt ist.',
            'For every constable when nobody is hidden at the end.',
          ),
        ),
      ],
    },
    {
      id: 'points-hiders',
      title: t('Punkte der Versteckten', 'Points for hiders'),
      text: t(
        'Ein freiwilliger Pfiff ist mutig: Je näher ein Gendarm steht, desto mehr gibt es.',
        'A voluntary whistle takes courage: the closer a constable stands, the more you get.',
      ),
      settings: [
        roundPoints(
          'pointsHalfMinute',
          'je-halbe-minute',
          1,
          'halbe-minute',
          t('Je halbe Minute unentdeckt', 'Per half minute undiscovered'),
          t(
            'Für jede volle halbe Minute der Suchzeit, die man versteckt bleibt.',
            'For every full half minute of the seeking time you stay hidden.',
          ),
        ),
        versteck.number({
          key: 'pointsWhistleMax',
          at: 'punkte.pfiff-hoechstens',
          value: 10,
          min: 1,
          max: MAX_ROUND_POINTS,
          ...POINTS,
          cmd: 'punkte pfiff-max',
          label: t('Freiwilliger Pfiff: höchstens', 'Voluntary whistle: at most'),
          help: t(
            'Ein Pfiff bringt 1 Punkt, je halbe Minute Suche einen mehr – höchstens so viele.',
            'A whistle brings 1 point, one more per half minute of seeking – at most this many.',
          ),
        }),
        roundPoints(
          'pointsLoud',
          'pfiff-laut',
          2,
          'laut',
          t('Extra für einen lauten Pfiff-Klang', 'Extra for a loud whistle sound'),
          t(
            'Murmeltier-Pfiff und Kuhglocke aus dem Kramerladen hört man weiter.',
            'The marmot whistle and the cowbell from the general store carry further.',
          ),
        ),
        roundPoints(
          'pointsVeryLoud',
          'pfiff-sehr-laut',
          4,
          'sehr-laut',
          t('Extra für einen sehr lauten Pfiff-Klang', 'Extra for a very loud whistle sound'),
          t(
            'Jodler, Trompete und Alphorn hört man am weitesten.',
            'The yodel, trumpet and alphorn carry the furthest.',
          ),
        ),
        versteck.number({
          key: 'pointsBraveNearBlocks',
          at: 'punkte.mutig-nah-bloecke',
          value: 6,
          min: 1,
          max: 64,
          ...BLOCKS,
          cmd: 'punkte mutig-nah-weite',
          label: t(
            'Ganz mutig: Gendarm höchstens so weit weg',
            'Very brave: constable at most this far away',
          ),
          help: t(
            'Steht beim Pfiff ein Gendarm so nah oder näher, gibt es die Extrapunkte für „ganz mutig“.',
            'If a constable stands this close or closer during the whistle, the extra points for “very brave” apply.',
          ),
        }),
        roundPoints(
          'pointsBraveNear',
          'mutig-nah',
          4,
          'mutig-nah',
          t('Extra für ganz mutig', 'Extra for very brave'),
          t('Für einen Pfiff ganz nah am Gendarmen.', 'For a whistle very close to a constable.'),
        ),
        versteck.number({
          key: 'pointsBraveBlocks',
          at: 'punkte.mutig-bloecke',
          value: 12,
          min: 1,
          max: 64,
          ...BLOCKS,
          cmd: 'punkte mutig-weite',
          label: t('Mutig: Gendarm höchstens so weit weg', 'Brave: constable at most this far away'),
          help: t(
            'Steht beim Pfiff ein Gendarm so nah oder näher, gibt es die Extrapunkte für „mutig“.',
            'If a constable stands this close or closer during the whistle, the extra points for “brave” apply.',
          ),
        }),
        roundPoints(
          'pointsBrave',
          'mutig',
          2,
          'mutig',
          t('Extra für mutig', 'Extra for brave'),
          t('Für einen Pfiff nah am Gendarmen.', 'For a whistle close to a constable.'),
        ),
        roundPoints(
          'pointsLastHider',
          'letzter-versteckter',
          10,
          'letzter',
          t('Letzter Versteckter', 'Last one hidden'),
          t(
            'Wer als Letzter noch versteckt ist, bekommt einmal so viel (wenn es am Anfang mindestens zwei Versteckte gab).',
            'Whoever is the last one still hidden gets this much once (if there were at least two hiders at the start).',
          ),
        ),
        roundPoints(
          'pointsSurvive',
          'bis-zum-schluss',
          20,
          'bis-zum-schluss',
          t('Bis zum Schluss unentdeckt', 'Undiscovered until the end'),
          t(
            'Für jeden, der bis zum Ende der Suchzeit versteckt bleibt.',
            'For everyone who stays hidden until the seeking time is up.',
          ),
        ),
      ],
    },
    {
      id: 'points-balance',
      title: t('Nach der Runde: Guthaben', 'After the round: balance'),
      text: t(
        'Zu den Punkten der Runde kommen Serie und Tagesbonus dazu.',
        'The streak and the daily bonus are added to the round’s points.',
      ),
      settings: [
        roundPoints(
          'pointsStreak',
          'serie-je-sieg',
          3,
          'serie',
          t('Serie: je weiterem Sieg in Folge', 'Streak: per further win in a row'),
          t(
            'So viele Punkte mehr für jeden weiteren Sieg in Folge.',
            'This many extra points for every further win in a row.',
          ),
        ),
        versteck.number({
          key: 'pointsStreakMax',
          at: 'punkte.serie-hoechstens',
          value: 5,
          min: 0,
          max: 50,
          unit: t('Siege', 'wins'),
          arg: 'siege',
          cmd: 'punkte serie-max',
          label: t('Serie zählt höchstens', 'Streak counts at most'),
          help: t(
            'Für so viele Siege in Folge wächst die Serie, danach bleibt sie gleich.',
            'The streak grows for this many wins in a row, then it stays the same.',
          ),
        }),
        roundPoints(
          'pointsDaily',
          'tagesbonus',
          25,
          'tagesbonus',
          t('Tagesbonus', 'Daily bonus'),
          t('Für den ersten Sieg des Tages.', 'For the first win of the day.'),
        ),
      ],
    },
    {
      id: 'supply-hiders',
      title: t('Kramerkiste: Hilfen der Versteckten', 'Supply box: helpers for hiders'),
      text: t(
        'Kleine Hilfen während der Suche (in der Schnellleiste), bezahlt mit Punkten aus der laufenden Runde – begrenzt je Runde und mit Pause danach.',
        'Small helpers during the search (in the hotbar), paid with points from the current round – limited per round and with a pause afterwards.',
      ),
      settings: [
        versteck.flag({
          key: 'supplyBox',
          at: 'rundenladen.an',
          value: true,
          cmd: 'kiste',
          label: t('Kramerkiste in der Runde', 'Supply box in the round'),
          help: t(
            'Aus: keine Hilfen zu kaufen – für Versteckte und Gendarmen.',
            'Off: no helpers to buy – for hiders and constables.',
          ),
        }),
        ...HIDER_HELPS.flatMap(supplyHelp),
      ],
    },
    {
      id: 'supply-seekers',
      title: t('Kramerkiste: Hilfen der Gendarmen', 'Supply box: helpers for constables'),
      settings: SEEKER_HELPS.flatMap(supplyHelp),
    },
    {
      id: 'store',
      title: t('Kramerladen', 'General store'),
      text: t(
        'Beim Krämer Wastl in der Gendarmerie (/laden) schaltet man mit dem Guthaben dauerhaft frei: Gestalten, Pfiff-Klänge, Effekte und Titel. Aus bei einem Stück nimmt es aus dem Laden und aus dem Spiel – wer es schon hat, behält es für später.',
        'At Wastl’s stall in the constabulary (/laden) you unlock things for good with your balance: disguises, whistle sounds, effects and titles. Switching an item off takes it out of the store and the game – whoever already has it keeps it for later.',
      ),
      settings: [
        versteck.flag({
          key: 'store',
          at: 'laden.an',
          value: true,
          cmd: 'laden',
          label: t('Kramerladen offen', 'General store open'),
          help: t(
            'Aus: Es gibt nichts zu kaufen, und Stücke aus dem Laden ruhen, bis er wieder offen ist.',
            'Off: nothing can be bought, and items from the store rest until it opens again.',
          ),
        }),
      ],
    },
    ...STORE.map(storeSection),
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
    rejoinSection(
      winter,
      90,
      t(
        'So viele Sekunden bleiben Disziplin, Lauf und Zeiten frei. Zurück sitzt man gleich wieder im Boot bzw. steht an derselben Stelle; die Uhr läuft weiter. 0 = aus.',
        'Discipline, run and times stay reserved for this many seconds. Back in time you sit in the boat again or stand at the same spot; the clock keeps running. 0 = off.',
      ),
    ),
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
          key: 'dailyCourse',
          at: 'strecke-des-tages',
          value: true,
          cmd: 'tagesstrecke',
          label: t('Strecke des Tages', 'Course of the day'),
          help: t(
            'Jeden Tag eine neue Strecke im Tal im Süden – Richtung, Wind, Tageszeit, Wetter und Ringe ergeben sich aus dem Datum, für alle gleich, mit eigener Tages-Bestenliste. Aus = die Station bleibt leer.',
            'A new course in the valley to the south every day – direction, wind, time of day, weather and rings come from the date, the same for everyone, with its own daily leaderboard. Off = the station stays empty.',
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
    rejoinSection(
      angel,
      90,
      t(
        'So viele Sekunden bleiben Turnierplatz und bester Fang nach einem Verbindungsabbruch frei. Wer das Tal während eines Turniers selbst verlässt, verliert seinen Platz gleich. 0 = aus.',
        'Tournament place and best catch stay reserved for this many seconds after a lost connection. Anyone who leaves the valley on purpose during a tournament loses their place at once. 0 = off.',
      ),
    ),
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
