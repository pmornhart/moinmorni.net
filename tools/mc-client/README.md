# Test- und Bildwerkzeug

Bilder **wie im echten Minecraft**: Der echte Java-Client (z. B. 26.3) läuft ohne Bildschirm (Xvfb, Vulkan/OpenGL in
Software über Mesa), tritt einem Test-Server bei und wird per RCON an Aussichtspunkte gesetzt.

> Die Client-Dateien und Texturen lädt `launch.py` von Mojang in einen **lokalen Cache** (`MM_CACHE`, Standard
> `~/mm-cache/client`). Nichts davon – auch keine Screenshots – gehört ins Repo oder auf die Webseite.

## Einmal einrichten (Ubuntu/Debian)

```bash
apt-get install -y xvfb xdotool imagemagick mesa-utils libglx-mesa0 libgl1-mesa-dri mesa-vulkan-drivers
```

Java 25 (für 26.x) z. B. von Adoptium nach `~/mm-cache/jdk`.

## Ablauf

```bash
Xvfb :99 -screen 0 1600x900x24 +extension GLX +render -nolisten tcp -noreset &
MM_JAVA=~/mm-cache/jdk/jdk-25*/bin/java python3 launch.py --version 26.3 --name MorniTest --server 127.0.0.1:25565 &
python3 shots.py --rcon 127.0.0.1:25575 --password-file .rcon-pass --player MorniTest --out bilder \
  --shot "ankunft 0 70 0 180 5" --wait 20
```

- `launch.py` setzt Startwerte (kein Willkommens-Bildschirm, kein Ton, Deutsch, 30 FPS). `--server-packs an|aus`
  nimmt das Ressourcenpaket des Servers ohne Rückfrage an bzw. lehnt es ab (Eintrag in `servers.dat`). Der Test-Server muss
  `online-mode=false` haben (nur in der Sandbox).
- `shots.py` blendet die Leiste mit F1 aus (mit `--hud` bleibt sie für Bilder von Chat, Leiste, Menüs).
- `rcon.py` schickt Befehle an den Server.
- Automatische Spieltests mit mehreren Spielern: mineflayer (bis 26.1, zum 26.3-Netzwerk über ViaBackwards).
