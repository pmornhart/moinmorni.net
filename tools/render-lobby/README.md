# Lobby-Bilder für die Webseite

Schöne Bilder der Lobby **ganz ohne Minecraft-Dateien**: Der Baukasten baut die Lobby im Speicher, dieses Werkzeug
macht daraus eine 3D-Szene mit **eigenen, aus Zahlen gemalten Block-Texturen** und **unseren eigenen Figuren-Skins**
und rendert sie im Browser (three.js über WebGL, ohne Bildschirm). Nichts stammt von Mojang – die Bilder dürfen auf die
Webseite.

> Für Bilder „wie im echten Spiel“ (mit den echten Texturen, nur lokal) gibt es `tools/mc-client/`. Diese Bilder hier
> sind dagegen zum Veröffentlichen gedacht.

## Starten

```bash
npx tsx tools/render-lobby/src/main.ts --out <ordner>
```

| Schalter         | Bedeutung                                                                     |
| ---------------- | ----------------------------------------------------------------------------- |
| `--out <ordner>` | Wohin die Bilder kommen (Standard `tools/render-lobby/out/bilder`)            |
| `--only a,b`     | Nur Aufnahmen, deren Name einen der Teile enthält (z. B. `--only hero,figur`) |
| `--reuse`        | Szene nicht neu bauen, sondern die letzte aus `out/` nehmen (spart ~25 s)     |
| `--preview`      | Schnelle Vorschau: halbe Größe, ohne Überabtastung, nur PNG                   |
| `--ss <n>`       | Überabtastung (Standard 2 = doppelt so groß rendern und verkleinern)          |

Voraussetzungen: Node 22, Playwright mit Chromium (`require('playwright')`), three.js 0.128 – Standard-Pfad
`/home/user/mm-cache/node/node_modules/three`, sonst `THREE_DIR=/pfad/zu/three`. WebGL läuft ohne Grafikkarte über
SwiftShader (4 Kerne): Szene bauen etwa 25 Sekunden, ein großes Bild (2560 × 1440, doppelt abgetastet) 15–30 Sekunden,
alle Aufnahmen zusammen etwa 7 Minuten. Mit `--preview` geht eine Ansicht in rund 5 Sekunden.

## Wie es funktioniert

1. **Szene** (`src/scene.ts`): `buildLobby()` aus `packages/builder` → dichtes Block-Gitter. Unter der Geländeoberfläche
   wird Fels ergänzt (der Baukasten baut nur die Haut), flaches Land wird Wiese. Nur sichtbare Flächen kommen in die
   Puffer, mit Umgebungsverdeckung pro Ecke (wie bei Klötzchen-Spielen üblich), Blocklicht der Laternen (Ausbreitung wie
   im Spiel, 15 an der Quelle) und leichten Farbwechseln bei Gras, Laub und Fels. Formen sind vereinfacht: Treppe =
   halber Block + Stufe, Stufe, Zaun, Mauer, Scheibe, Falltür, Tür, Laterne, Kerze, Bett, Banner, Blumen als gekreuzte
   Flächen. Ausgabe nach `out/` (`scene.bin`, `scene.json`, `atlas.png`, `skins/`) – nicht im Git.
2. **Texturen** (`src/textures.ts`): 16 × 16 Pixel pro Kachel, mit festem Zufall gemalt (Bretter, Rinde, Jahresringe,
   Ziegel, Kopfstein, Laub, Gras, Wasser, Glas, Wolle …), im Atlas mit Rand gegen Ausbluten.
3. **Rendern** (`src/page/render.ts`, im Browser): Abendsonne mit weichen Schatten oder Nacht mit Mondlicht, leuchtenden
   Laternen und Fenstern (Bloom), Himmel mit Verlauf und Sternen, eigene Klötzchen-Wolken, Dunst in der Ferne,
   Filmkurve (ACES). Die Figuren sind ein eigenes Spielermodell mit der üblichen 64 × 64-Skin-Aufteilung (zweite Ebene
   leicht größer) und unseren Skins aus `packages/builder/src/cast.ts`; die Lobby-Leute stehen und sitzen wie im Bauplan.
4. **Aufnahmen** (`src/shots.ts`): Kamera, Licht, Schattenbereich und Ausgaben je Bild. Neue Ansicht = neuer Eintrag.

## Bilder

| Datei                              | Inhalt                                                            |
| ---------------------------------- | ----------------------------------------------------------------- |
| `hero-tag/-nacht-*`                | Titelbild: Dorf, Maibaum, Marktstände, Treppe und Schloss am Berg |
| `hero-*-1920x1080-400k.webp/.jpg`  | Titelbild fürs Web, höchstens 400 KB                              |
| `hero-hoch-tag/-nacht-1080x1350`   | Titelbild hochkant (Handy, soziale Netzwerke)                     |
| `dorfplatz-*`, `marktstaende-*`    | Dorfplatz mit Maibaum und den Ständen der Spielmodi               |
| `stand-*`                          | Ein Stand aus der Nähe (Duels) mit seiner Figur                   |
| `biergarten-*`                     | Biergarten mit Gästen unter den Kastanien                         |
| `handwerkergasse-*`                | Handwerkergasse nach Westen mit Vorgärten und Brunnen             |
| `schloss-*`                        | Das Schloss auf dem Hügel                                         |
| `karte-*`                          | Die ganze Lobby von oben (Norden oben)                            |
| `gruppe-2000x1100.png`             | Alle Modus-Figuren, freigestellt (durchsichtiger Hintergrund)     |
| `gruppe-dorfplatz-tag/-nacht-*`    | Dieselbe Gruppe vor der Treppe zum Schloss                        |
| `figur-<modus>-800x1000.png/.webp` | Je Modus eine Figur, freigestellt (Karten der Spielmodi)          |

Jede Ansicht gibt es als PNG (2560 × 1440 und 1600 × 900) sowie als WebP/JPEG (Qualität 82) fürs Web. Bei Ausgaben mit
Größengrenze (`-400k`) senkt das Werkzeug die Qualität in kleinen Schritten, bis die Datei passt.

## Grenzen

- Formen sind vereinfacht (z. B. Treppen ohne Eckformen, Laub ohne Löcher, Schilder und schwebende Texte fehlen).
- Die Berge werfen keine Schatten ins Dorf (sonst läge es bei tiefer Sonne ganz im Schatten) – nur Dinge nahe am
  Bildausschnitt werfen Schatten.
- Gegenstände in den Händen der Figuren und die Möbel-Modelle aus dem Lobby-Paket werden nicht gezeigt; Bänke und Tische
  erscheinen als normale Stufen und Treppen (so wie ohne Paket im Spiel).
- Licht und Schatten der Figuren sind vereinfacht: nachts bekommt jede Figur das Blocklicht ihrer Stelle als Ganzes.
- Der Rand der Welt (±215 Blöcke) liegt hinter den Bergen; sehr hohe oder weite Kameras würden ihn zeigen.
