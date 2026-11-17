/* eslint-disable ts-patterns/no-magic-numbers -- a settings catalog: defaults and limits as the lobby needs them */
import type { SettingDef, SettingSection, Text } from './settings.js';

/**
 * Lobbymusik: welche Stücke es je Saison gibt (Name, Herkunft) und die Einstellungen dazu im Panel (Lobby → Musik).
 * Die Noten selbst stehen im Baukasten (`packages/builder/src/musik/lieder/`), die Klangdateien unter
 * `apps/server/musik/` – ein Server-Test prüft, dass alle drei zusammenpassen.
 */

/** Saisons wie die Saison-Deko der Lobby („none“ = Alltag). */
export const MUSIC_SEASONS = ['none', 'wiesn', 'winter', 'easter', 'halloween'] as const;
export type MusicSeason = (typeof MUSIC_SEASONS)[number];

export interface LobbySongInfo {
  readonly id: string;
  readonly season: MusicSeason;
  readonly title: Text;
  /** Woher die Melodie stammt – eigene oder ohne Urheberrecht. */
  readonly origin: Text;
}

const t = (de: string, en: string): Text => ({ de, en });
const OWN = t('Eigene Melodie', 'Our own tune');
const FOLK = t('Volksweise, gemeinfrei', 'Folk tune, public domain');
const song = (id: string, season: MusicSeason, title: Text, origin: Text): LobbySongInfo => ({
  id,
  season,
  title,
  origin,
});

export const LOBBY_SONGS: readonly LobbySongInfo[] = [
  song(
    'morni-marsch',
    'none',
    t('MoinMorni-Marsch', 'MoinMorni March'),
    t('Eigene Melodie (das MoinMorni-Thema)', 'Our own tune (the MoinMorni theme)'),
  ),
  song('dorfplatz-polka', 'none', t('Dorfplatz-Polka', 'Village Square Polka'), OWN),
  song('almrausch-walzer', 'none', t('Almrausch-Walzer', 'Alpine Rose Waltz'), OWN),
  song('morni-laendler', 'none', t('Morni-Ländler', 'Morni Ländler'), OWN),
  song(
    'muellers-lust',
    'none',
    t('Das Wandern ist des Müllers Lust', 'The Miller’s Joy Is Wandering'),
    t('Carl Friedrich Zöllner (1844), gemeinfrei', 'Carl Friedrich Zöllner (1844), public domain'),
  ),
  song('jaeger-kurpfalz', 'none', t('Ein Jäger aus Kurpfalz', 'A Hunter from the Palatinate'), FOLK),
  song('zum-morni-wirt', 'wiesn', t('Zum Morni-Wirt (Polka)', 'At the Morni Inn (polka)'), OWN),
  song('masskrug-walzer', 'wiesn', t('Maßkrug-Walzer', 'Beer Stein Waltz'), OWN),
  song('wiesn-einzug', 'wiesn', t('Wiesn-Einzug (Marsch)', 'Oktoberfest Parade (march)'), OWN),
  song('schuhplattler', 'wiesn', t('Schuhplattler', 'Schuhplattler'), OWN),
  song(
    'stille-nacht',
    'winter',
    t('Stille Nacht, heilige Nacht', 'Silent Night'),
    t('Franz Xaver Gruber (1818), gemeinfrei', 'Franz Xaver Gruber (1818), public domain'),
  ),
  song('o-tannenbaum', 'winter', t('O Tannenbaum', 'O Christmas Tree'), FOLK),
  song(
    'leise-rieselt',
    'winter',
    t('Leise rieselt der Schnee', 'Softly Falls the Snow'),
    t('Eduard Ebel (1895), gemeinfrei', 'Eduard Ebel (1895), public domain'),
  ),
  song(
    'alle-jahre',
    'winter',
    t('Alle Jahre wieder', 'Every Year Again'),
    t('Friedrich Silcher (1842), gemeinfrei', 'Friedrich Silcher (1842), public domain'),
  ),
  song('o-du-froehliche', 'winter', t('O du fröhliche', 'O How Joyfully'), FOLK),
  song(
    'ihr-kinderlein',
    'winter',
    t('Ihr Kinderlein, kommet', 'O Come, Little Children'),
    t('J. A. P. Schulz (1794), gemeinfrei', 'J. A. P. Schulz (1794), public domain'),
  ),
  song('kling-gloeckchen', 'winter', t('Kling, Glöckchen, klingelingeling', 'Ring, Little Bell'), FOLK),
  song('schlittenfahrt', 'winter', t('Schlittenfahrt (Walzer)', 'Sleigh Ride (waltz)'), OWN),
  song('alle-voegel', 'easter', t('Alle Vögel sind schon da', 'All the Birds Are Back'), FOLK),
  song('kuckuck', 'easter', t('Kuckuck, Kuckuck, ruft’s aus dem Wald', 'Cuckoo Calls from the Wood'), FOLK),
  song(
    'der-mai',
    'easter',
    t('Der Mai ist gekommen', 'May Has Come'),
    t('Justus Wilhelm Lyra (1843), gemeinfrei', 'Justus Wilhelm Lyra (1843), public domain'),
  ),
  song(
    'morgenstimmung',
    'easter',
    t('Morgenstimmung', 'Morning Mood'),
    t('Edvard Grieg (1875), gemeinfrei', 'Edvard Grieg (1875), public domain'),
  ),
  song(
    'bergkoenig',
    'halloween',
    t('In der Halle des Bergkönigs', 'In the Hall of the Mountain King'),
    t('Edvard Grieg (1875), gemeinfrei', 'Edvard Grieg (1875), public domain'),
  ),
  song('geisterwalzer', 'halloween', t('Geisterwalzer', 'Ghost Waltz'), OWN),
  song('kuerbis-polka', 'halloween', t('Kürbis-Polka', 'Pumpkin Polka'), OWN),
];

/** Einstellungs-Schlüssel eines Stücks (an/aus). */
export const songSettingKey = (id: string): string => `musik_${id}`;

/** Stücke einer Saison in der Reihenfolge des Panels. */
export function songsOf(season: string): readonly LobbySongInfo[] {
  return LOBBY_SONGS.filter((s) => s.season === season);
}

const SEASON_TITLES: Readonly<Record<MusicSeason, Text>> = {
  none: t('Musik im Alltag (ohne Saison-Deko)', 'Music on normal days (no seasonal decoration)'),
  wiesn: t('Musik zur Wiesn', 'Oktoberfest music'),
  winter: t('Musik im Winter', 'Winter music'),
  easter: t('Musik zu Ostern', 'Easter music'),
  halloween: t('Musik zu Halloween', 'Halloween music'),
};

const songSetting = (s: LobbySongInfo): SettingDef => ({
  key: songSettingKey(s.id),
  type: 'boolean',
  default: true,
  label: s.title,
  help: s.origin,
  command: `/lobby musik ${s.id} an|aus`,
});

/** Abschnitte im Panel unter Lobby: erst die allgemeinen Schalter, dann je Saison die Stücke. */
export const LOBBY_MUSIC_SECTIONS: readonly SettingSection[] = [
  {
    id: 'musik',
    title: t('Musik', 'Music'),
    text: t(
      'Lobbymusik passend zur Saison-Deko: im Alltag Blasmusik, zur Wiesn bayerisch, im Winter Weihnachtslieder, zu Ostern Frühlingslieder, zu Halloween Gruseliges. Mit dem Lobby-Paket klingt eine echte Kapelle, ohne Paket (und auf Bedrock) spielen Notenblöcke dieselben Melodien. Jeder Spieler kann sie mit /musik aus abschalten oder mit /musik leiser leiser stellen.',
      'Lobby music matching the seasonal decoration: brass band on normal days, Bavarian at Oktoberfest, carols in winter, spring songs at Easter, spooky tunes at Halloween. With the lobby pack a real band plays, without it (and on Bedrock) note blocks play the same tunes. Every player can turn it off with /music off or make it quieter with /music quieter.',
    ),
    settings: [
      {
        key: 'music',
        type: 'boolean',
        default: true,
        label: t('Lobbymusik', 'Lobby music'),
        help: t(
          'Spielt in der Lobby der Reihe nach die Stücke der aktuellen Saison.',
          'Plays the pieces of the current season one after another in the lobby.',
        ),
        command: '/lobby musik an|aus',
      },
      {
        key: 'musicVolume',
        type: 'number',
        default: 70,
        min: 10,
        max: 100,
        unit: t('%', '%'),
        label: t('Lautstärke', 'Volume'),
        help: t(
          'Grundlautstärke für alle. Im Spiel regelt jeder sie zusätzlich mit dem Regler „Plattenspieler/Notenblöcke“ in den Musik-Einstellungen.',
          'Base volume for everyone. In the game each player also adjusts it with the “Jukebox/Note Blocks” slider in the music settings.',
        ),
        command: '/lobby musik lautstaerke <prozent>',
      },
      {
        key: 'musicQuiet',
        type: 'number',
        default: 40,
        min: 0,
        max: 100,
        unit: t('%', '%'),
        label: t('Gedämpft (Jump and Run, Rundgang, Gefängnis)', 'Muffled (jump and run, tour, jail)'),
        help: t(
          'So laut (Anteil der Lautstärke) klingt die Musik, während jemand im Jump and Run springt, den Rundgang macht oder im Gefängnis sitzt – dann spielen leise Notenblöcke weiter (0 = still).',
          'How loud (share of the volume) the music is while someone is in the jump and run, takes the tour or sits in jail – soft note blocks keep playing then (0 = silent).',
        ),
        command: '/lobby musik gedaempft <prozent>',
      },
      {
        key: 'musicPause',
        type: 'number',
        default: 4,
        min: 0,
        max: 60,
        unit: t('Sekunden', 'seconds'),
        label: t('Pause zwischen den Stücken', 'Pause between pieces'),
        help: t('Stille, bevor das nächste Stück beginnt.', 'Silence before the next piece starts.'),
        command: '/lobby musik pause <sekunden>',
      },
    ],
  },
  ...MUSIC_SEASONS.map((season): SettingSection => ({
    id: `musik-${season}`,
    title: SEASON_TITLES[season],
    text: t(
      'Welche Stücke in dieser Saison laufen. Die Saison stellst du oben unter Saison-Deko ein.',
      'Which pieces play in this season. You choose the season above under seasonal decoration.',
    ),
    settings: songsOf(season).map(songSetting),
  })),
];
