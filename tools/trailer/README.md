# Trailer-Werkzeug

Trailer für die Lobby und die Spielmodi – gedreht im **echten Minecraft-Client** (`tools/mc-client`), mit eigener Musik
und Titeln im Stil der Webseite.

> Die fertigen Videos zeigen echte Minecraft-Grafik (Texturen von Mojang). Sie bleiben **lokal** (Standard
> `~/mm-cache/trailer/<name>/`) und gehen nur an Philip – **nie ins Repo und nie auf die Webseite**. Im Repo liegen nur
> die Skripte und die Drehbücher.

## Wie es funktioniert

- **Kamera:** Der Client schaut durch ein unsichtbares Anzeige-Objekt, das per `tp` weich gleitet (`shot.py`).
- **Zeitlupe:** Der Server läuft beim Dreh langsamer (`/tick rate`, Client läuft mit), das Video wird danach wieder
  beschleunigt. So wird es flüssig, obwohl der Client ohne Grafikkarte nur wenige Bilder pro Sekunde schafft.
- **Darsteller (neu, für alle künftigen Drehbücher):** `actors/` – Test-Spieler mit **echter Physik im Takt der
  Zeitlupe**, eigenen Skins und Namen (`actors/actors.json`, Skins in `skins/`), natürlichem Kopf, Wegsuche, Kampf wie
  echte Spieler, Brücke, Truhe, Essen, Chat. Befehle über eine Datei (`MM_ACTORS_FIFO`, `actors/regie.cjs`). Anleitung:
  `actors/README.md`. Die alten Darsteller ohne Physik (`actors.cjs`, vom Server per `tp` bewegt) bleiben für alte
  Drehbücher.
- **Ich-Sicht:** `ich.py` – der echte Client ist der Spieler (Anzeige, Schnellleiste, Herzen, Fadenkreuz, eigener Arm
  mit dem Darsteller-Skin), gesteuert mit echten Eingaben (xdotool) in Zeitlupe. Siehe unten.
- **Anzeige (F1):** `hud.py` schaltet sie sicher an/aus (Zustand je Client-Prozess gemerkt); `shot.py` schaltet sie
  vor jeder Kamerafahrt aus, `ich.py` an.
- **Musik:** `music.py` – das morni.net-Thema (selbst geschrieben), je Modus anders arrangiert, gerendert mit FluidSynth
  und dem Klangsatz FluidR3_GM (MIT-Lizenz). Daneben eine JSON mit den Takten.
- **Karten:** `cards.cjs` – Titel, Bauchbinden und Schlusskarte als PNG (Playwright, Schriften Jersey 10 und Rubik).
- **Schnitt:** `cut.py` – schneidet im Takt der Musik, blendet Karten ein, legt die Musik darunter.
- **Steuerung:** `make.py <trailer> music|cards|shot|sheet|cut|all` mit Drehbüchern in `trailers/<name>.py`.

## Einrichten (einmal)

```bash
apt-get install -y fluidsynth fluid-soundfont-gm xvfb xdotool ffmpeg
pip install mido fonttools brotli
```

Schriften als TTF nach `$MM_FONTS` (Standard `~/mm-cache/trailer/fonts`): `Jersey10.ttf`, `Rubik-Medium.ttf`,
`Rubik-ExtraBold.ttf` (aus `@fontsource/jersey-10` und `@fontsource-variable/rubik`, mit fontTools nach TTF).

## Drehen

```bash
Xvfb :98 -screen 0 1600x900x24 +extension GLX +render -nolisten tcp -noreset &
DISPLAY=:98 python3 ../mc-client/launch.py --version 26.3 --name MorniTest --server 127.0.0.1:25565 --server-packs an &
export MM_RCON=127.0.0.1:25575 MM_RCON_PASS=… MM_CAMERA=MorniTest MM_DISPLAY=:98
mkfifo /tmp/actors && node actors.cjs 127.0.0.1 25565 26.1 Anna Bert < /tmp/actors &   # optional
export MM_ACTORS_FIFO=/tmp/actors
python3 make.py spawn all
```

Vor dem Schnitt mit `make.py <trailer> sheet` die Einstellungen als Kontaktbogen ansehen.

## Ich-Sicht oder Kamerafahrt? (Empfehlung je Einstellungs-Art)

Eingaben (Tasten, Maus) passieren in echter Zeit, das Spiel läuft in Zeitlupe. Der Client folgt dem Takt des Servers:
seine eigene Physik, Arm-Schwung, Gegenstände, Tooltips und Menüs laufen in derselben Zeitlupe. Darum streckt `ich.py`
alle Eingaben um SLOW (Taste 2 Spielsekunden halten = 24 echte Sekunden bei SLOW 12), die Maus wird in kleinen
Schritten über die echte Zeit eines Ticks verteilt (0,15° je Bildpunkt bei Empfindlichkeit 100 %), die Blickführung ist
eine weiche Feder auf ein Ziel (Punkt oder Spieler, Ort per RCON) und gleicht sich alle 20 Ticks mit dem Server ab.

| Einstellung | Am besten mit | Hinweise |
|---|---|---|
| Übersicht, Landschaft, Bauten, Ankunft, Kampf von außen | Kamerafahrt (`shot.py`, item_display) + Darsteller mit Physik | SLOW 12–15; bewegte Darsteller mit `follow` (Kamera schaut auf ihre Mitte) |
| Laufen, Springen, Kämpfen, Bauen „wie ein Spieler“ | Ich-Sicht `ich.py` (`keys`, `look`, `clicks`) | SLOW 12; Client-Name = Darsteller-Name (Arm trägt dessen Skin); nicht per `tp` führen (ruckelt, kein Wippen) |
| Menüs: Truhe, Laden, Kiste | Ich-Sicht `ich.py` mit `input` (Maus im Menü, Umschalt-Klick, Escape, `select`) | Blickführung ruht im Menü; Truhen-/Inventarplätze einzeln per RCON abfragen (lange Antworten kürzt der Server mit „…“) |
| Chat zeigen | Ich-Sicht mit Anzeige (Darsteller schreiben per `chat`) | F1 blendet bei Kamerafahrten auch den Chat aus |
| Aus den Augen eines Darstellers | Notlösung: `/spectate <Darsteller>` | ohne Anzeige und ohne Arm – wirkt nicht wie Gameplay |
| Über die Schulter (dritte Person) | `ich.py` mit Taste F5 | ungetestet |

Ein Client reicht für beides: für Kamerafahrten schaut er als Zuschauer durch die Kamera, für die Ich-Sicht spielt er
mit (Abenteuer/Überleben). In Spielmodi mit Runden muss er dafür Teil der Runde sein.

## Neuer Name (morni.net)

Kopfzeile der Titelkarte „morni.net · Spielmodus“ (gesetzt als MORNI.NET · SPIELMODUS), Endkarte „morni.net“ mit
„Java & Bedrock · kostenlos“ und dem Hinweis „In der Lobby die Figur „<Modus>“ anklicken“, Dateinamen
`MorniNet-Trailer-<Modus>.mp4`.
