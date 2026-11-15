#!/usr/bin/env bash
# MoinMorni aktualisieren: neuen Code holen (mit dem Motor MorniHosting), bauen, Sicherung, neu starten, prüfen.
# Klappt etwas nicht, geht alles zurück auf den alten Stand (Code und Datenbanken). Die Minecraft-Server sind
# eigene Container und laufen die ganze Zeit weiter.
#
#   sudo /opt/moinmorni/update.sh        (oder kurz: moinmorni-update)
#
# Der Knopf im Panel (oder das automatische Update) legt update/request.json in den Datenordner von MoinMorni;
# die systemd-Einheit moinmorni-update.path aus install.sh startet dann dieses Skript. Fortschritt steht in
# update/status.json, die Ausgabe in update/log.txt – beides zeigt das Panel an.
#
# Verfasst mit Claude 🤖

set -Eeuo pipefail

mm_version() {
  local n sha
  n="$(git -C "$1" rev-list --count --first-parent HEAD 2>/dev/null)" || { echo dev; return; }
  sha="$(git -C "$1" rev-parse --short HEAD 2>/dev/null)" || { echo dev; return; }
  printf 'v%d.%d.%d-0-g%s\n' $((n / 100)) $((n / 10 % 10)) $((n % 10)) "${sha}"
}

INSTALL_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
VOLUME_NAME="moinmorni-data"
MOTOR_VOLUME_NAME="moinmorni-motor-data"
APP_UID=1000
BACKUP_ROOT="${MM_BACKUP_DIR:-/var/backups/moinmorni}"
KEEP_BACKUPS=5
HEALTH_TRIES="${MM_HEALTH_TRIES:-90}"
HEALTH_SECONDS="${MM_HEALTH_SECONDS:-2}"
BUILD_TRIES=3

GN=$'\e[32m'
YW=$'\e[33m'
RD=$'\e[31m'
CL=$'\e[0m'

msg_info() { printf ' %s…%s %s\n' "${YW}" "${CL}" "$1"; }
msg_ok() { printf ' %s✔%s %s\n' "${GN}" "${CL}" "$1"; }
msg_error() { printf ' %s✖%s %s\n' "${RD}" "${CL}" "$1" >&2; }

if [[ "${EUID}" -ne 0 ]]; then
  msg_error "Bitte als root starten (z. B. mit sudo)."
  exit 1
fi

VOLUME_DIR="$(docker volume inspect -f '{{ .Mountpoint }}' "${VOLUME_NAME}" 2>/dev/null || true)"
MOTOR_DIR="$(docker volume inspect -f '{{ .Mountpoint }}' "${MOTOR_VOLUME_NAME}" 2>/dev/null || true)"
UPDATE_DIR="${VOLUME_DIR:+${VOLUME_DIR}/update}"
STEP="null"
# Der Ordner gehört dem MoinMorni-Container. Dieses Skript läuft als root: nie einem Link darin folgen, sonst könnte
# ein manipulierter Container root fremde Dateien überschreiben lassen.
if [[ -n "${UPDATE_DIR}" && -L "${UPDATE_DIR}" ]]; then
  msg_error "${UPDATE_DIR} ist ein Verweis statt eines Ordners – Update abgebrochen."
  exit 1
fi

# Für das Panel: Zustand, Schritt und Versionen in status.json (erst Datei daneben, dann umbenennen).
write_status() {
  [[ -n "${UPDATE_DIR}" ]] || return 0
  mkdir -p "${UPDATE_DIR}"
  local tmp
  # mktemp legt eine neue Datei an (folgt keinem Link), mv ersetzt status.json samt eines dort liegenden Links.
  tmp="$(mktemp "${UPDATE_DIR}/.status.XXXXXX")"
  printf '{"state":"%s","step":%s,"at":"%s","from":"%s","to":"%s"}\n' "$1" "${STEP}" "$(date -Iseconds)" \
    "${MM_UPDATE_FROM:-}" "${MM_UPDATE_TO:-}" >"${tmp}"
  chmod 644 "${tmp}"
  chown -h "${APP_UID}:${APP_UID}" "${tmp}" 2>/dev/null || true
  mv -f "${tmp}" "${UPDATE_DIR}/status.json"
}
step() {
  STEP="\"$1\""
  write_status "running"
}

# Version, mit der das laufende Image gebaut wurde (leer, wenn es nicht läuft).
running_version() {
  docker inspect -f '{{index .Config.Labels "org.opencontainers.image.version"}}' "$1" 2>/dev/null || true
}

# Commit zu einer Version wie „v0.6.9-0-g49239b1“ (falls es ihn im Ordner $2 gibt), sonst der aktuelle Stand.
commit_of() {
  local sha=""
  [[ "$1" =~ -g([0-9a-f]{7,40})$ ]] && sha="${BASH_REMATCH[1]}"
  if [[ -n "${sha}" ]] && git -C "$2" cat-file -e "${sha}^{commit}" 2>/dev/null; then
    git -C "$2" rev-parse "${sha}^{commit}"
  else
    git -C "$2" rev-parse HEAD
  fi
}

cd "${INSTALL_DIR}"

# ---------- 1. Auftrag annehmen, neuen Code holen (dann mit der neuen Fassung dieses Skripts weiter) ----------
if [[ -z "${MM_UPDATE_PULLED:-}" ]]; then
  if [[ -n "${UPDATE_DIR}" ]]; then
    mkdir -p "${UPDATE_DIR}"
    # Neues Protokoll: erst eine eigene Datei öffnen, dann an ihren Platz schieben – geschrieben wird über die offene
    # Datei, nie über den Namen (dort könnte inzwischen ein Link liegen).
    log_tmp="$(mktemp "${UPDATE_DIR}/.log.XXXXXX")"
    chmod 644 "${log_tmp}"
    chown -h "${APP_UID}:${APP_UID}" "${log_tmp}" 2>/dev/null || true
    exec 3>>"${log_tmp}"
    mv -f "${log_tmp}" "${UPDATE_DIR}/log.txt"
    exec > >(tee -a /dev/fd/3) 2>&1
  fi
  MM_MOTOR_MODE="pinned"
  if [[ -n "${UPDATE_DIR}" ]] && grep -q '"motor":"main"' "${UPDATE_DIR}/request.json" 2>/dev/null; then
    MM_MOTOR_MODE="main"
  fi
  export MM_MOTOR_MODE
  # Maßgeblich ist, was wirklich läuft (Version im Image): Nach einem abgebrochenen Update kann der Code auf der Platte
  # schon neuer sein – dann muss trotzdem gebaut werden, und der Rückweg führt zur laufenden Fassung.
  MM_RUNNING="$(running_version moinmorni)"
  MM_UPDATE_FROM="${MM_RUNNING:-$(mm_version .)}"
  MM_OLD_HEAD="$(commit_of "${MM_RUNNING}" .)"
  MM_OLD_MOTOR="$(commit_of "$(running_version moinmorni-motor)" vendor/mornihosting)"
  export MM_RUNNING MM_UPDATE_FROM MM_OLD_HEAD MM_OLD_MOTOR
  # Erst „läuft“ melden, dann den Auftrag wegnehmen: Solange er da ist, startet systemd das Skript immer wieder.
  step "pull"
  [[ -z "${UPDATE_DIR}" ]] || rm -f "${UPDATE_DIR}/request.json"
  trap 'write_status "failed"; msg_error "Neuer Code ließ sich nicht holen – MoinMorni läuft unverändert weiter."' ERR
  msg_info "Neuer Code wird geholt"
  git pull --ff-only --quiet
  git submodule sync --quiet
  git submodule update --init --quiet
  if [[ "${MM_MOTOR_MODE}" == main ]]; then
    msg_info "Motor auf den neuesten Stand von MorniHosting"
    git submodule update --remote --quiet vendor/mornihosting
  fi
  trap - ERR
  MM_UPDATE_PULLED=1 exec bash "${INSTALL_DIR}/update.sh" "$@"
fi

export MM_UPDATE_TO MM_BUILD_VERSION MH_BUILD_VERSION
MM_UPDATE_TO="$(mm_version .)"
MM_BUILD_VERSION="${MM_UPDATE_TO}"
MH_BUILD_VERSION="$(mm_version vendor/mornihosting)"
NEW_MOTOR="$(git -C vendor/mornihosting rev-parse HEAD)"

if [[ "$(git rev-parse HEAD)" == "${MM_OLD_HEAD}" && "${NEW_MOTOR}" == "${MM_OLD_MOTOR}" &&
  "${MM_RUNNING:-${MM_UPDATE_TO}}" == "${MM_UPDATE_TO}" && -z "${MM_FORCE:-}" ]]; then
  STEP="null"
  write_status "done"
  msg_ok "Schon aktuell (${MM_UPDATE_TO}) – nichts zu tun"
  exit 0
fi
msg_ok "Neuer Stand: MoinMorni ${MM_UPDATE_TO}, Motor ${MH_BUILD_VERSION}"

BACKUP_DIR=""
RESTARTED=0

# Beide (MoinMorni und Motor) antworten? Wie die Prüfung in install.sh.
healthy() {
  docker compose exec -T motor node -e \
    "fetch('http://127.0.0.1:8080/api/system/status').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" \
    >/dev/null 2>&1 &&
    docker compose exec -T moinmorni node -e \
      "fetch('http://127.0.0.1:8080/api/status').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" \
      >/dev/null 2>&1
}
wait_healthy() {
  local i
  for ((i = 0; i < HEALTH_TRIES; i++)); do
    healthy && return 0
    sleep "${HEALTH_SECONDS}"
  done
  return 1
}

# Bauen mit zweitem und drittem Versuch (BuildKit bricht bei wenig Speicher gern ab), zuletzt ohne BuildKit.
build_all() {
  local attempt
  for ((attempt = 1; attempt <= BUILD_TRIES; attempt++)); do
    if ((attempt < BUILD_TRIES)); then
      docker compose build --quiet moinmorni motor && return 0
    else
      COMPOSE_BAKE=false DOCKER_BUILDKIT=0 docker compose build --quiet moinmorni motor && return 0
    fi
    msg_info "Bauen abgebrochen (Versuch ${attempt}/${BUILD_TRIES}) – nächster Versuch"
    docker builder prune -f >/dev/null 2>&1 || true
    sleep 5
  done
  return 1
}

# Zurück auf den alten Stand: Code, Motor, Datenbanken (wenn schon neu gestartet), wieder bauen und starten.
rollback() {
  trap - ERR
  STEP='"rollback"'
  write_status "running"
  msg_error "Update hat nicht geklappt – zurück auf ${MM_UPDATE_FROM}"
  git reset --hard --quiet "${MM_OLD_HEAD}"
  git submodule update --init --quiet
  git -C vendor/mornihosting checkout --quiet "${MM_OLD_MOTOR}"
  MM_BUILD_VERSION="${MM_UPDATE_FROM}"
  MH_BUILD_VERSION="$(mm_version vendor/mornihosting)"
  if ((RESTARTED)); then
    docker compose stop moinmorni motor >/dev/null 2>&1 || true
    if [[ -n "${BACKUP_DIR}" ]]; then
      msg_info "Datenbanken aus der Sicherung zurück"
      # --remove-destination: liegt am Ziel ein Link, wird er ersetzt statt durch ihn hindurch geschrieben.
      [[ -z "${VOLUME_DIR}" ]] || cp -a --remove-destination "${BACKUP_DIR}/moinmorni/." "${VOLUME_DIR}/"
      [[ -z "${MOTOR_DIR}" || ! -d "${BACKUP_DIR}/motor" ]] ||
        cp -a --remove-destination "${BACKUP_DIR}/motor/." "${MOTOR_DIR}/"
    fi
    if build_all && docker compose up -d >/dev/null && wait_healthy; then
      MM_UPDATE_TO="${MM_UPDATE_FROM}"
      STEP="null"
      write_status "rolled_back"
      msg_ok "Alter Stand läuft wieder"
      exit 1
    fi
    STEP="null"
    write_status "failed"
    msg_error "Auch der alte Stand startet nicht. Sicherung: ${BACKUP_DIR:-keine} – bitte selbst nachsehen."
    exit 1
  fi
  # Noch nicht neu gestartet: Die alten Container laufen unverändert, nur der Code geht zurück.
  MM_UPDATE_TO="${MM_UPDATE_FROM}"
  STEP="null"
  write_status "rolled_back"
  msg_ok "MoinMorni läuft weiter in der alten Fassung"
  exit 1
}
trap rollback ERR

# ---------- 2. Bauen (die alte Fassung läuft so lange weiter) ----------
step "build"
msg_info "Neue Fassung wird gebaut (dauert ein paar Minuten)"
build_all
msg_ok "Gebaut"

# ---------- 3. Sicherung: MoinMorni-Daten und die Datenbank des Motors (Welten nicht – die haben eigene Backups) ----------
step "backup"
RESTARTED=1
docker compose stop moinmorni motor >/dev/null
BACKUP_DIR="${BACKUP_ROOT}/$(date +%Y%m%d-%H%M%S)-${MM_UPDATE_FROM}"
mkdir -p "${BACKUP_DIR}/moinmorni" "${BACKUP_DIR}/motor"
chmod 700 "${BACKUP_ROOT}" "${BACKUP_DIR}"
if [[ -n "${VOLUME_DIR}" ]]; then
  find "${VOLUME_DIR}" -mindepth 1 -maxdepth 1 ! -name update -exec cp -a {} "${BACKUP_DIR}/moinmorni/" \;
fi
if [[ -n "${MOTOR_DIR}" ]]; then
  find "${MOTOR_DIR}" -mindepth 1 -maxdepth 1 -type f -exec cp -a {} "${BACKUP_DIR}/motor/" \;
fi
printf 'moinmorni=%s\nmotor=%s\nversion=%s\n' "${MM_OLD_HEAD}" "${MM_OLD_MOTOR}" "${MM_UPDATE_FROM}" \
  >"${BACKUP_DIR}/stand.txt"
msg_ok "Sicherung: ${BACKUP_DIR}"

# ---------- 4. Neu starten und prüfen ----------
step "restart"
msg_info "MoinMorni und Motor starten neu"
docker compose up -d >/dev/null
step "check"
if ! wait_healthy; then
  msg_error "Die neue Fassung antwortet nicht"
  rollback
fi
msg_ok "Neue Fassung läuft"

# ---------- 5. Aufräumen: alte Sicherungen (die neuesten bleiben), alte Images, Build-Cache ----------
trap - ERR
find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d | sort | head -n "-${KEEP_BACKUPS}" | xargs -r rm -rf
docker image prune -f >/dev/null 2>&1 || true
docker builder prune -af >/dev/null 2>&1 || true
STEP="null"
write_status "done"
msg_ok "Update fertig: ${MM_UPDATE_FROM} → ${MM_UPDATE_TO}"
