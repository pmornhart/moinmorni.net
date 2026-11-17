#!/usr/bin/env bash
# Test-Server für einen Trailer-Dreh einrichten und starten (Paper 26.1.2, offline, RCON, ViaVersion/ViaBackwards für
# den 26.3-Aufnahme-Client). Alles liegt außerhalb des Repos unter $MM_CACHE/servers/trailer-<name>.
#
#   server.sh <name> <port> <modus.jar> <fake-netzwerk.jar> [fake.properties-Zeile …]   # einrichten + starten
#   server.sh <name> stop                                                               # anhalten
#
# Umgebung: XMX (Standard 1500M), VIEW (Sichtweite, Standard 10), LEVEL_TYPE (Standard flach, nur Grundgestein),
#           EXTRA_PLUGINS (weitere Jars, z. B. das Regie-Plugin aus dem Cache), CONFIG (Datei, die als config.yml des
#           Modus kopiert wird; Ordner des Plugins aus PLUGIN_DIR).
# RCON läuft auf <port>+1, das Passwort steht in <server>/.rcon-pass.
#
# Verfasst mit Claude 🤖
set -euo pipefail
CACHE="${MM_CACHE:-/home/user/mm-cache}"
NAME="$1"; shift
DIR="$CACHE/servers/trailer-$NAME"
JAVA="$(ls -d "$CACHE"/jdk/jdk-25* | head -1)/bin/java"

if [ "${1:-}" = "stop" ]; then
  if [ -f "$DIR/.pid" ] && kill -0 "$(cat "$DIR/.pid")" 2>/dev/null; then
    python3 "$(dirname "$0")/../mc-client/rcon.py" "127.0.0.1:$(cat "$DIR/.rcon-port")" "$(cat "$DIR/.rcon-pass")" stop \
      >/dev/null 2>&1 || kill "$(cat "$DIR/.pid")"
    for _ in $(seq 1 60); do kill -0 "$(cat "$DIR/.pid")" 2>/dev/null || break; sleep 1; done
    kill -9 "$(cat "$DIR/.pid")" 2>/dev/null || true
  fi
  exit 0
fi

PORT="$1"; MODE_JAR="$2"; FAKE_JAR="$3"; shift 3
RCON_PORT=$((PORT + 1))
mkdir -p "$DIR/plugins/MoinMorni"
TEMPLATE="$(ls -d "$CACHE"/servers/*/libraries 2>/dev/null | head -1 | xargs -r dirname)"
if [ -n "$TEMPLATE" ] && [ ! -d "$DIR/libraries" ]; then
  cp -r "$TEMPLATE/libraries" "$TEMPLATE/cache" "$TEMPLATE/versions" "$DIR/" 2>/dev/null || true
fi
cp "$CACHE/jars/paper-26.1.2.jar" "$DIR/paper.jar"
echo "eula=true" > "$DIR/eula.txt"
if [ ! -f "$DIR/.rcon-pass" ]; then
  head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20 > "$DIR/.rcon-pass"
  chmod 600 "$DIR/.rcon-pass"
fi
echo "$RCON_PORT" > "$DIR/.rcon-port"
cat > "$DIR/server.properties" <<PROPS
online-mode=false
enforce-secure-profile=false
server-port=$PORT
enable-rcon=true
rcon.port=$RCON_PORT
rcon.password=$(cat "$DIR/.rcon-pass")
level-name=world
level-type=minecraft\:flat
generator-settings={"layers"\:[{"block"\:"minecraft\:bedrock","height"\:1}],"biome"\:"minecraft\:plains"}
generate-structures=false
spawn-protection=0
view-distance=${VIEW:-10}
simulation-distance=6
max-players=30
white-list=false
enforce-whitelist=false
motd=MoinMorni Trailer
allow-flight=true
PROPS
printf '%s\n' "$@" > "$DIR/plugins/MoinMorni/fake.properties"
rm -f "$DIR"/plugins/*.jar
cp "$MODE_JAR" "$FAKE_JAR" "$CACHE/jars/ViaVersion-5.12.2.jar" "$CACHE/jars/ViaBackwards-5.12.2.jar" "$DIR/plugins/"
for jar in ${EXTRA_PLUGINS:-}; do cp "$jar" "$DIR/plugins/"; done
if [ -n "${CONFIG:-}" ]; then
  mkdir -p "$DIR/plugins/$PLUGIN_DIR"
  cp "$CONFIG" "$DIR/plugins/$PLUGIN_DIR/config.yml"
fi
cd "$DIR"
: > console.log
MALLOC_ARENA_MAX=2 setsid nohup nice -n 10 "$JAVA" -Xms256M -Xmx"${XMX:-1500M}" -XX:+UseSerialGC -XX:ReservedCodeCacheSize=96m -XX:MaxDirectMemorySize=256m ${JAVA_OPTS:-} \
  -Dfile.encoding=UTF-8 \
  -Dstdout.encoding=UTF-8 -jar paper.jar --nogui < /dev/null > console.log 2>&1 &
echo $! > .pid
echo "Server $NAME: Port $PORT, RCON $RCON_PORT, PID $(cat .pid), Ordner $DIR"
