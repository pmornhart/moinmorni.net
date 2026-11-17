#!/usr/bin/env bash
# Aufnahme-Client (echtes Minecraft 26.3) für einen Trailer-Dreh starten – mit dem Darsteller-Paket (eigene Skins),
# fester Anzeige-Größe und ohne Ton. Der Name sollte ein Darsteller-Name sein (actors/actors.json), dann trägt der Arm
# in der Ich-Sicht dessen Skin.
#
#   client.sh <name> <host:port> <display> [option:wert …]     # z. B. client.sh Toni_Wandert11 127.0.0.1:28800 :150
#
# Umgebung: MM_CLIENT_XMX (Standard 1536M), MM_CACHE (Standard /home/user/mm-cache). Ausgabe in
# $MM_CACHE/trailer/client-<name>.log. Die Videos zeigen echte Minecraft-Grafik: nur lokal.
#
# Verfasst mit Claude 🤖
set -euo pipefail
CACHE="${MM_CACHE:-/home/user/mm-cache}"
NAME="$1"; SERVER="$2"; DISPLAY_NR="$3"; shift 3
INST="$CACHE/client/instances/26.3-$NAME"
mkdir -p "$INST/resourcepacks"
[ -d "$INST/resourcepacks/morni-darsteller" ] || cp -r "$CACHE/trailer/skins-paket/morni-darsteller" "$INST/resourcepacks/"
OPTS=(--option 'resourcePacks:["vanilla","file/morni-darsteller"]' --option guiScale:3 --option maxFps:30
      --option renderDistance:12 --option simulationDistance:8 --option particles:0 --option gamma:0.5
      --option soundCategory_master:0.0 --option chatScale:1.0 --option mouseSensitivity:0.5 --option fov:0.0
      --option tutorialStep:none --option skipMultiplayerWarning:true --option joinedFirstServer:true
      --option onboardAccessibility:false --option narrator:0 --option 'graphicsPreset:"fancy"')
for o in "$@"; do OPTS+=(--option "$o"); done
cd "$(dirname "$0")/../mc-client"
MALLOC_ARENA_MAX=2 MM_JAVA="$(ls -d "$CACHE"/jdk/jdk-25* | head -1)/bin/java" MM_CACHE="$CACHE/client" \
  setsid nohup nice -n 5 python3 launch.py --version 26.3 --name "$NAME" --server "$SERVER" --display "$DISPLAY_NR" \
  --memory "${MM_CLIENT_XMX:-1536M}" --server-packs an "${OPTS[@]}" > "$CACHE/trailer/client-$NAME.log" 2>&1 < /dev/null &
echo "Client $NAME auf $DISPLAY_NR → $SERVER (PID $!)"
