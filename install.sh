#!/usr/bin/env bash
# morni.net – Installation auf Debian/Ubuntu (auch im Proxmox-LXC oder in einer VM).
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/pmornhart/morni.net/main/install.sh)"
#
# Was passiert: Docker wird installiert (falls nötig), morni.net landet in /opt/morninet (mit dem Motor
# MorniHosting als Untermodul), eine .env mit zufälligen Geheimnissen wird angelegt (nur für root lesbar),
# Motor und morni.net starten, morni.net bekommt seinen Schlüssel für den Motor – und am Ende steht der
# Einrichtungs-Code für dein Owner-Konto da.
#
# Ohne Fragen (z. B. aus dem Proxmox-Skript): MM_DOMAIN=… MM_DISCORD_TOKEN=… vor den Befehl schreiben.
#
# Verfasst mit Claude 🤖

set -Eeuo pipefail

# Versionsnummer wie bei MorniHosting: jedes Update auf dem Branch zählt eins hoch (Update 84 = v0.8.4),
# dahinter der Commit.
mm_version() {
  local n sha
  n="$(git -C "$1" rev-list --count --first-parent HEAD 2>/dev/null)" || { echo dev; return; }
  sha="$(git -C "$1" rev-parse --short HEAD 2>/dev/null)" || { echo dev; return; }
  printf 'v%d.%d.%d-0-g%s\n' $((n / 100)) $((n / 10 % 10)) $((n % 10)) "${sha}"
}

INSTALL_DIR="${MM_INSTALL_DIR:-/opt/morninet}"
REPO_URL="${MM_REPO_URL:-https://github.com/pmornhart/morni.net.git}"
BRANCH="${MM_BRANCH:-main}"
WAIT_TRIES=90
WAIT_SECONDS=2
# Den Bot-Token aus der Umgebung gleich übernehmen und nicht an andere Programme (apt, git, docker …) weitervererben.
TOKEN_FROM_ENV="${MM_DISCORD_TOKEN:-}"
unset MM_DISCORD_TOKEN

GN=$'\e[32m'
YW=$'\e[33m'
RD=$'\e[31m'
BL=$'\e[36m'
CL=$'\e[0m'

msg_info() { printf ' %s…%s %s\n' "${YW}" "${CL}" "$1"; }
msg_ok() { printf ' %s✔%s %s\n' "${GN}" "${CL}" "$1"; }
msg_error() { printf ' %s✖%s %s\n' "${RD}" "${CL}" "$1" >&2; }

trap 'msg_error "Abgebrochen in Zeile ${LINENO}. Details stehen oben."' ERR

if [[ "${EUID}" -ne 0 ]]; then
  msg_error "Bitte als root starten (z. B. mit sudo)."
  exit 1
fi
if ! command -v apt-get >/dev/null 2>&1; then
  msg_error "Dieses Skript ist für Debian und Ubuntu. Auf anderen Systemen: siehe README (Docker Compose)."
  exit 1
fi

printf '\n %smorni.net%s – dein Minecraft-Netzwerk\n\n' "${BL}" "${CL}"

# Wert in der .env setzen (ohne sed, damit Sonderzeichen im Wert nichts kaputt machen). Schlüssel und Wert gehen über
# die Umgebung an awk, nicht als Argument – sonst stünden Geheimnisse wie der Bot-Token kurz in der Prozessliste (ps).
set_env() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp .env.XXXXXX)"
  MM_ENV_KEY="${key}" MM_ENV_VALUE="${value}" awk '
    BEGIN { FS = OFS = "="; k = ENVIRON["MM_ENV_KEY"]; v = ENVIRON["MM_ENV_VALUE"] }
    $1 == k { print k "=" v; found = 1; next }
    { print }
    END { if (!found) print k "=" v }
  ' .env >"${tmp}"
  chmod 600 "${tmp}"
  mv "${tmp}" .env
}
get_env() { grep -E "^$1=" .env | head -n1 | cut -d= -f2- || true; }

# Wartet, bis ein Befehl klappt (z. B. bis der Motor antwortet).
wait_for() {
  local what="$1" i
  shift
  for ((i = 0; i < WAIT_TRIES; i++)); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep "${WAIT_SECONDS}"
  done
  msg_error "${what} antwortet nicht. Protokoll: docker compose -f ${INSTALL_DIR}/docker-compose.yml logs"
  return 1
}

msg_info "Pakete werden installiert"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates openssl >/dev/null
msg_ok "Pakete installiert"

if ! command -v docker >/dev/null 2>&1; then
  msg_info "Docker wird installiert (offizielles Skript von get.docker.com)"
  curl -fsSL https://get.docker.com | sh >/dev/null
  systemctl enable --now docker >/dev/null 2>&1 || true
  msg_ok "Docker installiert"
else
  msg_ok "Docker ist schon da"
fi
if ! docker compose version >/dev/null 2>&1; then
  msg_info "Docker-Compose-Plugin wird installiert"
  apt-get install -y -qq docker-compose-plugin >/dev/null
  msg_ok "Docker Compose installiert"
fi

# Eine Installation unter dem früheren Namen (bis 16.11.2026) wird nicht doppelt angelegt: Ihr Update holt den neuen
# Code und zieht dabei hierher um (Volumes, Container, systemd, /opt).
OLD_INSTALL_DIR="/opt/moinmorni"
if [[ -z "${MM_INSTALL_DIR:-}" && ! -d "${INSTALL_DIR}/.git" && -d "${OLD_INSTALL_DIR}/.git" ]]; then
  msg_info "Vorhandene Installation unter dem früheren Namen gefunden – sie wird aktualisiert und zieht dabei um"
  exec bash "${OLD_INSTALL_DIR}/update.sh"
fi

if [[ -d "${INSTALL_DIR}/.git" ]]; then
  msg_info "Vorhandene Installation wird aktualisiert"
  git -C "${INSTALL_DIR}" pull --ff-only --quiet
  git -C "${INSTALL_DIR}" submodule update --init --quiet
else
  msg_info "morni.net wird nach ${INSTALL_DIR} geladen"
  git clone --quiet --recurse-submodules --branch "${BRANCH}" "${REPO_URL}" "${INSTALL_DIR}"
fi
msg_ok "Dateien liegen in ${INSTALL_DIR}"
cd "${INSTALL_DIR}"

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')" || LAN_IP=""
# Domain: nur Buchstaben, Ziffern, Punkte und Bindestriche – "morni.net" ja, "https://x" nein.
DOMAIN_PATTERN='^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
# Discord-Bot-Token: drei Teile aus Buchstaben, Ziffern, _ und -, getrennt durch Punkte.
TOKEN_PATTERN='^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{20,}$'

if [[ ! -f .env ]]; then
  msg_info "Einstellungen (.env) werden angelegt"
  umask 077
  cp .env.example .env
  chmod 600 .env
  set_env MM_SECRET "$(openssl rand -hex 32)"
  set_env MH_SECRET "$(openssl rand -hex 32)"
  set_env MM_LAN_IP "${LAN_IP}"
  set_env TZ "$(timedatectl show -p Timezone --value 2>/dev/null || echo Europe/Berlin)"

  domain="${MM_DOMAIN:-}"
  if [[ -z "${domain}" && -t 0 ]]; then
    read -rp " Unter welcher Domain läuft dein Netzwerk? [morni.net] " domain
  fi
  domain="$(printf '%s' "${domain:-morni.net}" | tr '[:upper:]' '[:lower:]')"
  if [[ ! "${domain}" =~ ${DOMAIN_PATTERN} ]]; then
    msg_error "${domain} ist keine Domain (Beispiel: morni.net). Bitte nochmal starten."
    rm -f .env
    exit 1
  fi
  set_env MM_DOMAIN "${domain}"

  token="${TOKEN_FROM_ENV}"
  if [[ -z "${token}" && -t 0 ]]; then
    printf ' Token deines Discord-Bots (Eingabe bleibt unsichtbar, leer lassen = später im Panel):\n '
    read -rs token
    printf '\n'
  fi
  if [[ -n "${token}" && ! "${token}" =~ ${TOKEN_PATTERN} ]]; then
    msg_error "Das sieht nicht wie ein Bot-Token aus – ich lasse es leer. Eintragen geht später im Panel."
    token=""
  fi
  set_env MM_DISCORD_TOKEN "${token}"
  unset token
  msg_ok ".env angelegt (zufällige Geheimnisse, nur für root lesbar)"
else
  chmod 600 .env
  msg_ok ".env ist schon da und bleibt unverändert"
fi
unset TOKEN_FROM_ENV

msg_info "morni.net wird gebaut (das erste Mal dauert es ein paar Minuten)"
export MM_BUILD_VERSION MH_BUILD_VERSION
MM_BUILD_VERSION="$(mm_version .)"
MH_BUILD_VERSION="$(mm_version vendor/mornihosting)"
docker compose build --quiet
msg_ok "Gebaut: morni.net ${MM_BUILD_VERSION}, Motor ${MH_BUILD_VERSION}"

msg_info "Motor wird gestartet"
docker compose up -d socket-proxy motor >/dev/null
wait_for "Der Motor" docker compose exec -T motor node -e \
  "fetch('http://127.0.0.1:8080/api/system/status').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
msg_ok "Motor läuft"

if [[ -z "$(get_env MM_MOTOR_TOKEN)" ]]; then
  msg_info "morni.net bekommt seinen Schlüssel für den Motor"
  motor_token="$(docker compose exec -T motor node /app/server/dist/cli.js service-token morninet | tr -d '\r\n')"
  if [[ "${motor_token}" != mh_* ]]; then
    msg_error "Der Motor hat keinen Schlüssel ausgegeben: ${motor_token}"
    exit 1
  fi
  set_env MM_MOTOR_TOKEN "${motor_token}"
  unset motor_token
  msg_ok "Schlüssel liegt in der .env"
fi

msg_info "morni.net wird gestartet"
docker compose up -d >/dev/null
wait_for "morni.net" docker compose exec -T morninet node -e \
  "fetch('http://127.0.0.1:8080/api/setup').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
msg_ok "morni.net läuft"

# Updates: Der Knopf im Panel (oder das automatische Update) legt update/request.json in den Datenordner –
# systemd sieht die Datei und startet update.sh. agent.json sagt dem Panel, dass der Updater da ist.
VOLUME_DIR="$(docker volume inspect -f '{{ .Mountpoint }}' morninet-data 2>/dev/null || true)"
ln -sf "${INSTALL_DIR}/update.sh" /usr/local/bin/morninet-update
if [[ -n "${VOLUME_DIR}" && -d /run/systemd/system ]] && command -v systemctl >/dev/null 2>&1; then
  msg_info "Updates werden eingerichtet"
  cat >/etc/systemd/system/morninet-update.path <<UNIT
[Unit]
Description=morni.net: Update-Auftrag aus dem Panel

[Path]
PathExists=${VOLUME_DIR}/update/request.json
Unit=morninet-update.service

[Install]
WantedBy=multi-user.target
UNIT
  cat >/etc/systemd/system/morninet-update.service <<UNIT
[Unit]
Description=morni.net aktualisieren
After=docker.service

[Service]
Type=oneshot
ExecStart=${INSTALL_DIR}/update.sh
UNIT
  systemctl daemon-reload
  systemctl enable --now morninet-update.path >/dev/null 2>&1
  mkdir -p "${VOLUME_DIR}/update"
  agent_tmp="$(mktemp "${VOLUME_DIR}/update/.agent.XXXXXX")"
  printf '{"installed":"%s"}\n' "$(date -Iseconds)" >"${agent_tmp}"
  chmod 644 "${agent_tmp}"
  mv -f "${agent_tmp}" "${VOLUME_DIR}/update/agent.json"
  chown -hR 1000:1000 "${VOLUME_DIR}/update"
  msg_ok "Updates per Knopf im Panel und automatisch (Einstellungen → Updates)"
else
  msg_info "Ohne systemd: Updates von Hand mit morninet-update"
fi

DOMAIN="$(get_env MM_DOMAIN)"
PORT="$(get_env MM_PORT)"
printf '\n %s🎉 Fertig!%s\n\n' "${GN}" "${CL}"
SETUP_REQUIRED="$(docker compose exec -T morninet node -e \
  "fetch('http://127.0.0.1:8080/api/setup').then(r=>r.json()).then(j=>console.log(j.required===true))" \
  | tr -d '\r\n')"
# Der Code entsteht beim ersten Start, sobald morni.net den Motor erreicht.
if [[ "${SETUP_REQUIRED}" == true ]] &&
  wait_for "Der Einrichtungs-Code" docker compose exec -T morninet test -f /data/setup-code; then
  CODE="$(docker compose exec -T morninet cat /data/setup-code | tr -d '\r\n')"
  printf '    Leg jetzt dein Owner-Konto an:\n'
  printf '      %shttps://%s/panel/einrichtung%s\n' "${BL}" "${DOMAIN}" "${CL}"
  printf '      (zu Hause auch: http://%s:%s/panel/einrichtung)\n\n' "${LAN_IP:-<IP>}" "${PORT:-8080}"
  printf '    Einrichtungs-Code: %s%s%s\n' "${GN}" "${CODE}" "${CL}"
  printf '    (Später nochmal anzeigen: docker exec morninet cat /data/setup-code)\n\n'
else
  printf '    Öffne %shttps://%s/panel%s und melde dich an.\n\n' "${BL}" "${DOMAIN}" "${CL}"
fi
printf '    HTTPS kommt über NetBird: Dienst für %s auf http://%s:%s (mit „Pass Host Header“).\n' \
  "${DOMAIN}" "${LAN_IP:-<IP>}" "${PORT:-8080}"
printf '    Anleitung: %s/docs/proxmox-quickstart.md\n\n' "${INSTALL_DIR}"
