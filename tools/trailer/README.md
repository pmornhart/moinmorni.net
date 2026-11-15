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
- **Darsteller:** Test-Spieler (`actors.cjs`, mineflayer) ohne eigene Physik – der Server bewegt sie in jedem Tick
  (`tp`), damit sie zur Zeitlupe passen. Handlungen (Arm schwingen, Gegenstand wählen …) über eine Datei
  (`MM_ACTORS_FIFO`).
- **Musik:** `music.py` – das MoinMorni-Thema (selbst geschrieben), je Modus anders arrangiert, gerendert mit FluidSynth
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
