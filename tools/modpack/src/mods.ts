/**
 * Was ins MoinMorni-Modpack gehört. Philips Wünsche: alles, was Minecraft schöner macht, Werkzeuge für Builder,
 * Zoom an, Sprachchat wie im Netzwerk (Simple Voice Chat), keine Minimap, kein Axiom (erst nach Freigabe).
 *
 * Jede Mod kommt von Modrinth (Slug = Name in der Adresse, z. B. modrinth.com/mod/sodium). Das Bau-Skript nimmt pro
 * Mod die neueste Version für Fabric und die Minecraft-Version unten und holt Pflicht-Abhängigkeiten selbst dazu.
 */

/** Minecraft-Version des Netzwerks (Java). */
export const MINECRAFT_VERSION = '26.3';
/** Mod-Lader (Fabric = schlanker Lader, den fast alle Grafik- und Leistungs-Mods unterstützen). */
export const LOADER = 'fabric';
export const LOADER_NAME = 'Fabric';

export const PACK_NAME = 'MoinMorni';
export const PACK_SUMMARY =
  'Das offizielle Modpack für moinmorni.net: schöner, flüssiger, mit Zoom und Sprachchat – dazu Bau-Werkzeuge fürs Bauteam.';

/** Eintrag in der Serverliste, den das Modpack mitbringt. */
export const SERVER_NAME = 'MoinMorni';
export const SERVER_ADDRESS = 'moinmorni.net';

/** pflicht = immer dabei, optional = Launcher wie Prism fragen beim Installieren, ob man sie haben will. */
export type Need = 'pflicht' | 'optional';

/** Bereich in der Übersicht (`mods.md`, Anleitung). */
export type Group = 'grundlage' | 'leistung' | 'aussehen' | 'spielhilfe' | 'bauen';

export interface ModSpec {
  /** Name in der Modrinth-Adresse. */
  readonly slug: string;
  /** Wofür die Mod da ist (Deutsch, ohne Fachwörter). */
  readonly purpose: string;
  readonly need: Need;
  /** Läuft nur im Spiel der Spieler (nicht auf Servern). */
  readonly clientOnly: boolean;
  readonly group: Group;
}

export const GROUP_NAMES: Readonly<Record<Group, string>> = {
  grundlage: 'Grundlage',
  leistung: 'Flüssiger spielen',
  aussehen: 'Schöner',
  spielhilfe: 'Spielhilfen',
  bauen: 'Bau-Werkzeuge (fürs Bauteam)',
};

export const MODS: readonly ModSpec[] = [
  {
    slug: 'fabric-api',
    purpose: 'Grundbaustein, den fast alle Fabric-Mods brauchen',
    need: 'pflicht',
    clientOnly: false,
    group: 'grundlage',
  },
  {
    slug: 'modmenu',
    purpose: 'Knopf „Mods“ im Hauptmenü: Mods ansehen und einstellen',
    need: 'pflicht',
    clientOnly: true,
    group: 'grundlage',
  },
  {
    slug: 'sodium',
    purpose: 'Zeichnet die Welt viel schneller – mehr Bilder pro Sekunde',
    need: 'pflicht',
    clientOnly: true,
    group: 'leistung',
  },
  {
    slug: 'lithium',
    purpose: 'Rechnet Spielregeln (Tiere, Redstone, Physik) sparsamer',
    need: 'pflicht',
    clientOnly: false,
    group: 'leistung',
  },
  {
    slug: 'ferrite-core',
    purpose: 'Braucht weniger Arbeitsspeicher',
    need: 'pflicht',
    clientOnly: false,
    group: 'leistung',
  },
  {
    slug: 'immediatelyfast',
    purpose: 'Schnellere Anzeige von Schrift, Schildern und Gegenständen',
    need: 'pflicht',
    clientOnly: true,
    group: 'leistung',
  },
  {
    slug: 'entityculling',
    purpose: 'Zeichnet keine Wesen und Truhen, die hinter Wänden versteckt sind',
    need: 'pflicht',
    clientOnly: true,
    group: 'leistung',
  },
  {
    slug: 'dynamic-fps',
    purpose: 'Spart Strom und Leistung, solange das Spiel im Hintergrund ist',
    need: 'pflicht',
    clientOnly: true,
    group: 'leistung',
  },
  {
    slug: 'iris',
    purpose: 'Shader: echte Schatten, Wasser und Licht (braucht einen guten Rechner)',
    need: 'optional',
    clientOnly: true,
    group: 'aussehen',
  },
  {
    slug: 'continuity',
    purpose: 'Glas und andere Blöcke ohne Rand dazwischen (verbundene Texturen)',
    need: 'pflicht',
    clientOnly: true,
    group: 'aussehen',
  },
  {
    slug: '3dskinlayers',
    purpose: 'Die äußere Skin-Schicht (Jacke, Hut, Haare) wird dreidimensional',
    need: 'pflicht',
    clientOnly: true,
    group: 'aussehen',
  },
  {
    slug: 'not-enough-animations',
    purpose: 'Lebendigere Bewegungen in der Ansicht von außen (essen, Karte halten, klettern)',
    need: 'pflicht',
    clientOnly: true,
    group: 'aussehen',
  },
  {
    slug: 'wavey-capes',
    purpose: 'Umhänge wehen im Wind',
    need: 'pflicht',
    clientOnly: true,
    group: 'aussehen',
  },
  {
    slug: 'lambdynamiclights',
    purpose: 'Fackel in der Hand leuchtet beim Laufen',
    need: 'pflicht',
    clientOnly: true,
    group: 'aussehen',
  },
  {
    slug: 'particle-rain',
    purpose: 'Schönerer Regen und Schnee mit Tropfen und Flocken',
    need: 'pflicht',
    clientOnly: true,
    group: 'aussehen',
  },
  {
    slug: 'entity-model-features',
    purpose: 'Für Texturpakete mit eigenen Tier-Modellen und Animationen (z. B. Fresh Animations)',
    need: 'optional',
    clientOnly: true,
    group: 'aussehen',
  },
  {
    slug: 'zoomify',
    purpose: 'Zoom auf Taste C (umstellbar unter Optionen → Steuerung)',
    need: 'pflicht',
    clientOnly: true,
    group: 'spielhilfe',
  },
  {
    slug: 'simple-voice-chat',
    purpose: 'Sprachchat im Netzwerk (Nähe, Party, Kanäle wie „Dorfplatz“)',
    need: 'pflicht',
    clientOnly: false,
    group: 'spielhilfe',
  },
  {
    slug: 'appleskin',
    purpose: 'Zeigt, wie satt ein Essen macht',
    need: 'pflicht',
    clientOnly: false,
    group: 'spielhilfe',
  },
  {
    slug: 'jade',
    purpose: 'Kleine Anzeige oben: was man gerade anschaut (Block, Tier, Pflanze)',
    need: 'pflicht',
    clientOnly: false,
    group: 'spielhilfe',
  },
  {
    slug: 'litematica',
    purpose: 'Baupläne als durchsichtige Vorlage in die Welt legen',
    need: 'optional',
    clientOnly: true,
    group: 'bauen',
  },
  {
    slug: 'minihud',
    purpose: 'Koordinaten, Chunk-Grenzen und Bau-Hilfslinien einblenden',
    need: 'optional',
    clientOnly: true,
    group: 'bauen',
  },
  {
    slug: 'worldedit',
    purpose: 'Große Flächen auf einmal bauen (in der eigenen Welt; auf dem Bau-Server macht es der Server)',
    need: 'optional',
    clientOnly: false,
    group: 'bauen',
  },
  {
    slug: 'worldedit-cui',
    purpose: 'Zeigt die WorldEdit-Auswahl als Rahmen an',
    need: 'optional',
    clientOnly: true,
    group: 'bauen',
  },
];

export interface Excluded {
  readonly slug: string;
  readonly reason: string;
}

/**
 * Darf nie ins Pack – auch nicht als Abhängigkeit einer anderen Mod. Das Bau-Skript bricht sonst ab.
 * Minimaps: Philips Wunsch (Runde 2). Axiom: erst nach Philips Freigabe.
 */
export const FORBIDDEN: readonly Excluded[] = [
  { slug: 'axiom', reason: 'Axiom erst nach Philips Freigabe' },
  { slug: 'xaeros-minimap', reason: 'keine Minimap' },
  { slug: 'xaeros-world-map', reason: 'keine Minimap/Weltkarte' },
  { slug: 'journeymap', reason: 'keine Minimap' },
  { slug: 'voxelmap-updated', reason: 'keine Minimap' },
  { slug: 'ftb-chunks-fabric', reason: 'keine Minimap' },
];

/** Bewusst nicht dabei, obwohl es sie gibt – steht so in `mods.md`. */
export const LEFT_OUT: readonly Excluded[] = [
  { slug: 'krypton', reason: 'beschleunigt vor allem Server, im Spiel selbst kaum spürbar' },
  { slug: 'debugify', reason: 'kaum spürbarer Nutzen, jede weitere Mod ist ein möglicher Absturzgrund' },
  { slug: 'sodium-extra', reason: 'gibt es für 26.3 nur als Testversion (Beta)' },
  { slug: 'modernfix', reason: 'gibt es (noch) nicht für Fabric 26.3' },
];
