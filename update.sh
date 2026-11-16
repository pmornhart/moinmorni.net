#!/usr/bin/env bash
# morni.net aktualisieren: neuen Code holen (mit dem Motor MorniHosting), bauen, Sicherung, neu starten, prüfen.
# Klappt etwas nicht, geht alles zurück auf den alten Stand (Code und Datenbanken). Die Minecraft-Server sind
# eigene Container und laufen die ganze Zeit weiter.
#
#   sudo /opt/morninet/update.sh        (oder kurz: morninet-update)
#
# Der Knopf im Panel (oder das automatische Update) legt update/request.json in den Datenordner von morni.net;
# die systemd-Einheit morninet-update.path aus install.sh startet dann dieses Skript. Fortschritt steht in
# update/status.json, die Ausgabe in update/log.txt – beides zeigt das Panel an.
#
# Umbenennung in morni.net (16.11.2026): Eine Installation unter dem früheren Namen zieht bei ihrem ersten Update hierher
# um – Docker-Volumes (auf derselben Platte nur umbenannt, nichts wird kopiert), Container, systemd-Einheiten, der
# Ordner unter /opt und die Sicherungen. Geht etwas schief, kommt alles zurück an den alten Platz.
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
# Name von Containern, Volumes, systemd-Einheiten und Ordnern (wie in docker-compose.yml und install.sh).
APP="morninet"
# Früherer Name (bis 16.11.2026) – nur für den Umzug bestehender Installationen.
OLD_APP="moinmorni"
OLD_REPO="moinmorni.net"
NEW_REPO="morni.net"
VOLUME_NAME="${APP}-data"
MOTOR_VOLUME_NAME="${APP}-motor-data"
OLD_VOLUME_NAME="${OLD_APP}-data"
OLD_MOTOR_VOLUME_NAME="${OLD_APP}-motor-data"
NEW_CONTAINERS=("${APP}" "${APP}-motor" "${APP}-socket-proxy")
OLD_CONTAINERS=("${OLD_APP}" "${OLD_APP}-motor" "${OLD_APP}-socket-proxy")
# Netz der Minecraft-Container unter dem früheren Namen (das neue legt docker-compose.yml an).
OLD_MC_NETWORK="${OLD_APP}-mc"
APP_UID=1000
BACKUP_ROOT="${MM_BACKUP_DIR:-/var/backups/${APP}}"
# Nur für den Test (tools/update-test/run.sh) änderbar:
SYSTEMD_DIR="${MM_SYSTEMD_DIR:-/etc/systemd/system}"
BIN_DIR="${MM_BIN_DIR:-/usr/local/bin}"
KEEP_BACKUPS=5
HEALTH_TRIES="${MM_HEALTH_TRIES:-90}"
HEALTH_SECONDS="${MM_HEALTH_SECONDS:-2}"
BUILD_TRIES=3
# Solange das Update läuft, lässt der Wächter morni.net in Ruhe (sonst starten beide es gleichzeitig neu).
UPDATE_LOCK="${MM_UPDATE_LOCK:-/run/${APP}-update.lock}"
# Der Wächter kommt aus dem Motor (MorniHosting) und bekommt die Namen von morni.net mit.
VENDOR_SCRIPTS="vendor/mornihosting/scripts"
# Nur für den Test (tools/update-test/run.sh) änderbar: wohin der Wächter sein Startskript legt.
SBIN_DIR="${MM_SBIN_DIR:-/usr/local/sbin}"

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

touch "${UPDATE_LOCK}" 2>/dev/null || true
trap 'rm -f "${UPDATE_LOCK}"' EXIT

volume_dir() { docker volume inspect -f '{{ .Mountpoint }}' "$1" 2>/dev/null || true; }
# Ordner, in dem etwas liegt?
filled() { [[ -n "$1" && -d "$1" && -n "$(ls -A "$1" 2>/dev/null)" ]]; }

VOLUME_DIR="$(volume_dir "${VOLUME_NAME}")"
MOTOR_DIR="$(volume_dir "${MOTOR_VOLUME_NAME}")"
OLD_VOLUME_DIR="$(volume_dir "${OLD_VOLUME_NAME}")"
OLD_MOTOR_DIR="$(volume_dir "${OLD_MOTOR_VOLUME_NAME}")"
# Liegen noch Daten in den Volumes unter dem früheren Namen, zieht diese Installation jetzt um. Bis dahin läuft die
# alte Fassung mit ihren Volumes (Auftrag, Status und Protokoll fürs Panel liegen dort).
MIGRATE=0
MIGRATED=0
if filled "${OLD_VOLUME_DIR}" || filled "${OLD_MOTOR_DIR}"; then
  MIGRATE=1
  VOLUME_DIR="${OLD_VOLUME_DIR}"
  MOTOR_DIR="${OLD_MOTOR_DIR}"
fi
# Container, die gerade gemeint sind (nach einem Rückweg vor den Umzug: die unter dem früheren Namen).
RUN_APP="${APP}"
UPDATE_DIR="${VOLUME_DIR:+${VOLUME_DIR}/update}"
STEP="null"
# Der Ordner gehört dem morni.net-Container. Dieses Skript läuft als root: nie einem Link darin folgen, sonst könnte
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
  MM_RUNNING="$(running_version "${APP}")"
  motor_running="$(running_version "${APP}-motor")"
  if ((MIGRATE)); then
    MM_RUNNING="$(running_version "${OLD_APP}")"
    motor_running="$(running_version "${OLD_APP}-motor")"
  fi
  MM_UPDATE_FROM="${MM_RUNNING:-$(mm_version .)}"
  MM_OLD_HEAD="$(commit_of "${MM_RUNNING}" .)"
  MM_OLD_MOTOR="$(commit_of "${motor_running}" vendor/mornihosting)"
  export MM_RUNNING MM_UPDATE_FROM MM_OLD_HEAD MM_OLD_MOTOR
  # Erst „läuft“ melden, dann den Auftrag wegnehmen: Solange er da ist, startet systemd das Skript immer wieder.
  step "pull"
  [[ -z "${UPDATE_DIR}" ]] || rm -f "${UPDATE_DIR}/request.json"
  trap 'write_status "failed"; msg_error "Neuer Code ließ sich nicht holen – morni.net läuft unverändert weiter."' ERR
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
  "${MM_RUNNING:-${MM_UPDATE_TO}}" == "${MM_UPDATE_TO}" && -z "${MM_FORCE:-}" && MIGRATE -eq 0 ]]; then
  STEP="null"
  write_status "done"
  msg_ok "Schon aktuell (${MM_UPDATE_TO}) – nichts zu tun"
  exit 0
fi
msg_ok "Neuer Stand: morni.net ${MM_UPDATE_TO}, Motor ${MH_BUILD_VERSION}"

BACKUP_DIR=""
RESTARTED=0

# Beide (morni.net und Motor) antworten? Wie die Prüfung in install.sh – über die festen Container-Namen, damit es auch
# nach einem Rückweg auf eine Fassung unter dem früheren Namen passt.
healthy() {
  docker exec "${RUN_APP}-motor" node -e \
    "fetch('http://127.0.0.1:8080/api/system/status').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" \
    >/dev/null 2>&1 &&
    docker exec "${RUN_APP}" node -e \
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
      docker compose build --quiet "${RUN_APP}" motor && return 0
    else
      COMPOSE_BAKE=false DOCKER_BUILDKIT=0 docker compose build --quiet "${RUN_APP}" motor && return 0
    fi
    msg_info "Bauen abgebrochen (Versuch ${attempt}/${BUILD_TRIES}) – nächster Versuch"
    docker builder prune -f >/dev/null 2>&1 || true
    sleep 5
  done
  return 1
}

# ---------- Umzug vom früheren Namen ----------

# Inhalt eines Volumes in ein anderes: nur umbenennen (gleiche Platte); was im Ziel schon liegt, bleibt dort.
move_contents() {
  local from="$1" to="$2" entry
  [[ -n "${from}" && -d "${from}" && -n "${to}" && -d "${to}" && "${from}" != "${to}" ]] || return 0
  for entry in "${from}"/* "${from}"/.[!.]* "${from}"/..?*; do
    [[ -e "${entry}" || -L "${entry}" ]] || continue
    [[ -e "${to}/${entry##*/}" || -L "${to}/${entry##*/}" ]] && continue
    mv -T "${entry}" "${to}/${entry##*/}"
  done
}

# Neue Volumes anlegen (über docker compose, mit dessen Kennzeichen) und die Daten hineinschieben. Die Minecraft-Server
# laufen weiter: Ihre Ordner werden nur umbenannt, offene Dateien bleiben gültig. Liegen die Volumes nicht auf derselben
# Platte, wird nichts angefasst (kopieren, während Welten gespeichert werden, könnte Daten kosten).
migrate_volumes() {
  local new_dir new_motor_dir
  msg_info "Umzug: Daten ziehen in die Volumes ${VOLUME_NAME} und ${MOTOR_VOLUME_NAME}"
  docker compose up --no-start >/dev/null
  new_dir="$(volume_dir "${VOLUME_NAME}")"
  new_motor_dir="$(volume_dir "${MOTOR_VOLUME_NAME}")"
  if [[ -z "${new_dir}" || -z "${new_motor_dir}" ]]; then
    msg_error "Die neuen Volumes fehlen – Umzug abgebrochen."
    return 1
  fi
  if [[ "$(stat -c %d "${OLD_VOLUME_DIR}")" != "$(stat -c %d "${new_dir}")" ]] ||
    [[ -n "${OLD_MOTOR_DIR}" && "$(stat -c %d "${OLD_MOTOR_DIR}")" != "$(stat -c %d "${new_motor_dir}")" ]]; then
    msg_error "Alte und neue Volumes liegen nicht auf derselben Platte – Umzug abgebrochen, nichts verschoben."
    return 1
  fi
  MIGRATED=1
  move_contents "${OLD_VOLUME_DIR}" "${new_dir}"
  move_contents "${OLD_MOTOR_DIR}" "${new_motor_dir}"
  # Besitzer und Rechte des Volume-Ordners wie vorher (sonst darf der Container nicht hineinschreiben).
  chown --reference="${OLD_VOLUME_DIR}" "${new_dir}"
  chmod --reference="${OLD_VOLUME_DIR}" "${new_dir}"
  if [[ -n "${OLD_MOTOR_DIR}" ]]; then
    chown --reference="${OLD_MOTOR_DIR}" "${new_motor_dir}"
    chmod --reference="${OLD_MOTOR_DIR}" "${new_motor_dir}"
  fi
  VOLUME_DIR="${new_dir}"
  MOTOR_DIR="${new_motor_dir}"
  UPDATE_DIR="${VOLUME_DIR}/update"
  if [[ -L "${UPDATE_DIR}" ]]; then
    msg_error "${UPDATE_DIR} ist ein Verweis statt eines Ordners – Update abgebrochen."
    return 1
  fi
  msg_ok "Daten liegen in den neuen Volumes"
}

# Rückweg: Daten zurück in die Volumes unter dem früheren Namen, neue Container und Volumes weg.
unmigrate_volumes() {
  docker rm -f "${NEW_CONTAINERS[@]}" >/dev/null 2>&1 || true
  msg_info "Umzug rückgängig: Daten zurück in ${OLD_VOLUME_NAME} und ${OLD_MOTOR_VOLUME_NAME}"
  move_contents "${VOLUME_DIR}" "${OLD_VOLUME_DIR}"
  move_contents "${MOTOR_DIR}" "${OLD_MOTOR_DIR}"
  VOLUME_DIR="${OLD_VOLUME_DIR}"
  MOTOR_DIR="${OLD_MOTOR_DIR}"
  UPDATE_DIR="${VOLUME_DIR}/update"
  docker volume rm "${VOLUME_NAME}" "${MOTOR_VOLUME_NAME}" >/dev/null 2>&1 || true
  MIGRATED=0
}

# Minecraft-Server, die seit vor dem Umzug durchlaufen, hängen noch im Netz unter dem früheren Namen: Motor (RCON,
# Spielerzahl) und morni.net hängen sich dort mit an, bis der Motor sie bei ihrem nächsten Neustart ins neue Netz holt.
# Ist es leer, kommt es weg. Läuft bei jedem Update (docker compose up legt die Container ohne dieses Netz neu an).
tend_old_network() {
  local members name others=0
  local -a list=()
  members="$(docker network inspect -f '{{range .Containers}}{{.Name}} {{end}}' "${OLD_MC_NETWORK}" 2>/dev/null)" ||
    return 0
  read -r -a list <<<"${members}"
  for name in "${list[@]}"; do
    case " ${NEW_CONTAINERS[*]} ${OLD_CONTAINERS[*]} " in
      *" ${name} "*) ;;
      *) others=$((others + 1)) ;;
    esac
  done
  if ((others > 0)); then
    docker network connect "${OLD_MC_NETWORK}" "${APP}" >/dev/null 2>&1 || true
    docker network connect "${OLD_MC_NETWORK}" "${APP}-motor" >/dev/null 2>&1 || true
    msg_info "${others} Minecraft-Server laufen noch im alten Netz – sie ziehen bei ihrem nächsten Neustart um"
  else
    docker network disconnect "${OLD_MC_NETWORK}" "${APP}" >/dev/null 2>&1 || true
    docker network disconnect "${OLD_MC_NETWORK}" "${APP}-motor" >/dev/null 2>&1 || true
    docker network rm "${OLD_MC_NETWORK}" >/dev/null 2>&1 || true
  fi
}

# systemd-Einheiten für Updates aus dem Panel (wie in install.sh).
write_units() {
  cat >"${SYSTEMD_DIR}/${APP}-update.path" <<UNIT
[Unit]
Description=morni.net: Update-Auftrag aus dem Panel

[Path]
PathExists=${VOLUME_DIR}/update/request.json
Unit=${APP}-update.service

[Install]
WantedBy=multi-user.target
UNIT
  cat >"${SYSTEMD_DIR}/${APP}-update.service" <<UNIT
[Unit]
Description=morni.net aktualisieren
After=docker.service

[Service]
Type=oneshot
ExecStart=${INSTALL_DIR}/update.sh
UNIT
}

# Nach geglücktem Umzug: alte Container, leere alte Volumes und Netze weg; Ordner unter /opt, systemd, Befehl und
# Git-Adresse auf den neuen Namen.
finish_migration() {
  local vol dir target url new_url unit
  docker rm -f "${OLD_CONTAINERS[@]}" >/dev/null 2>&1 || true
  for vol in "${OLD_VOLUME_NAME}" "${OLD_MOTOR_VOLUME_NAME}"; do
    dir="$(volume_dir "${vol}")"
    if [[ -n "${dir}" ]] && ! filled "${dir}"; then docker volume rm "${vol}" >/dev/null 2>&1 || true; fi
  done
  docker network rm "${OLD_APP}_intern" >/dev/null 2>&1 || true
  docker network rm "${OLD_APP}_docker-api" >/dev/null 2>&1 || true
  # /opt/<früherer Name> → /opt/morninet
  target="$(dirname "${INSTALL_DIR}")/${APP}"
  if [[ "${INSTALL_DIR##*/}" == "${OLD_APP}" && ! -e "${target}" ]] && mv -T "${INSTALL_DIR}" "${target}"; then
    INSTALL_DIR="${target}"
    cd "${INSTALL_DIR}" || return 1
    msg_ok "Installation liegt jetzt in ${INSTALL_DIR}"
  fi
  # systemd: neue Einheiten (neuer Ordner, neues Volume), die alten weg.
  if [[ -f "${SYSTEMD_DIR}/${OLD_APP}-update.path" || -f "${SYSTEMD_DIR}/${OLD_APP}-update.service" ]] &&
    command -v systemctl >/dev/null 2>&1 && write_units; then
    systemctl disable --now "${OLD_APP}-update.path" >/dev/null 2>&1 || true
    for unit in path service; do
      if [[ -f "${SYSTEMD_DIR}/${OLD_APP}-update.${unit}" ]]; then unlink "${SYSTEMD_DIR}/${OLD_APP}-update.${unit}"; fi
    done
    systemctl daemon-reload >/dev/null 2>&1 || true
    systemctl enable --now "${APP}-update.path" >/dev/null 2>&1 || true
    msg_ok "Updates aus dem Panel laufen jetzt über ${APP}-update.path"
  fi
  if [[ -d "${BIN_DIR}" ]]; then
    ln -sfn "${INSTALL_DIR}/update.sh" "${BIN_DIR}/${APP}-update"
    if [[ -L "${BIN_DIR}/${OLD_APP}-update" ]]; then unlink "${BIN_DIR}/${OLD_APP}-update"; fi
  fi
  # Git: auf das umbenannte Repo zeigen, sobald es unter dem neuen Namen erreichbar ist (bis dahin leitet GitHub weiter).
  url="$(git remote get-url origin 2>/dev/null || true)"
  if [[ "${url}" == *"/${OLD_REPO}"* ]]; then
    new_url="${url/"/${OLD_REPO}"/"/${NEW_REPO}"}"
    if GIT_TERMINAL_PROMPT=0 timeout 30 git ls-remote --heads "${new_url}" >/dev/null 2>&1; then
      git remote set-url origin "${new_url}"
      msg_ok "Code kommt jetzt von ${new_url}"
    fi
  fi
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
    if ((MIGRATE)); then
      # Zurück auf die Fassung unter dem früheren Namen: ihre Container, ihre Volumes.
      RUN_APP="${OLD_APP}"
      if ((MIGRATED)); then unmigrate_volumes; fi
    else
      docker compose stop "${RUN_APP}" motor >/dev/null 2>&1 || true
    fi
    if [[ -n "${BACKUP_DIR}" ]]; then
      msg_info "Datenbanken aus der Sicherung zurück"
      # --remove-destination: liegt am Ziel ein Link, wird er ersetzt statt durch ihn hindurch geschrieben.
      [[ -z "${VOLUME_DIR}" ]] || cp -a --remove-destination "${BACKUP_DIR}/morninet/." "${VOLUME_DIR}/"
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
  msg_ok "morni.net läuft weiter in der alten Fassung"
  exit 1
}
trap rollback ERR

# ---------- 2. Bauen (die alte Fassung läuft so lange weiter) ----------
step "build"
msg_info "Neue Fassung wird gebaut (dauert ein paar Minuten)"
build_all
msg_ok "Gebaut"

# ---------- 3. Sicherung: morni.net-Daten und die Datenbank des Motors (Welten nicht – die haben eigene Backups) ----------
step "backup"
RESTARTED=1
if ((MIGRATE)); then
  # Die alte Fassung läuft noch unter dem früheren Namen: anhalten (für den Rückweg bleiben die Container stehen).
  docker stop "${OLD_CONTAINERS[@]}" >/dev/null 2>&1 || true
  # Sicherungen unter dem früheren Namen kommen mit.
  old_backups="$(dirname "${BACKUP_ROOT}")/${OLD_APP}"
  if [[ "${BACKUP_ROOT##*/}" == "${APP}" && -d "${old_backups}" && ! -L "${old_backups}" && ! -e "${BACKUP_ROOT}" ]]; then
    mv -T "${old_backups}" "${BACKUP_ROOT}"
  fi
else
  docker compose stop "${APP}" motor >/dev/null
fi
BACKUP_DIR="${BACKUP_ROOT}/$(date +%Y%m%d-%H%M%S)-${MM_UPDATE_FROM}"
mkdir -p "${BACKUP_DIR}/morninet" "${BACKUP_DIR}/motor"
chmod 700 "${BACKUP_ROOT}" "${BACKUP_DIR}"
if [[ -n "${VOLUME_DIR}" ]]; then
  find "${VOLUME_DIR}" -mindepth 1 -maxdepth 1 ! -name update -exec cp -a {} "${BACKUP_DIR}/morninet/" \;
fi
if [[ -n "${MOTOR_DIR}" ]]; then
  find "${MOTOR_DIR}" -mindepth 1 -maxdepth 1 -type f -exec cp -a {} "${BACKUP_DIR}/motor/" \;
fi
printf 'morninet=%s\nmotor=%s\nversion=%s\n' "${MM_OLD_HEAD}" "${MM_OLD_MOTOR}" "${MM_UPDATE_FROM}" \
  >"${BACKUP_DIR}/stand.txt"
msg_ok "Sicherung: ${BACKUP_DIR}"

# NetBird-Server dieses Rechners in die .env, bevor der Motor neu startet (Vorgabe für „Erreichbarkeit“ im Panel).
if [[ -f "${VENDOR_SCRIPTS}/netbird-env.sh" ]] &&
  NB_API="$(MH_ENV_FILE="${INSTALL_DIR}/.env" bash "${VENDOR_SCRIPTS}/netbird-env.sh" 2>/dev/null)" &&
  [[ -n "${NB_API}" ]]; then
  msg_ok "NetBird-Server dieses Rechners: ${NB_API}"
fi

# ---------- 4. Neu starten und prüfen ----------
step "restart"
if ((MIGRATE)); then migrate_volumes; fi
msg_info "morni.net und Motor starten neu"
docker compose up -d >/dev/null
tend_old_network
step "check"
if ! wait_healthy; then
  msg_error "Die neue Fassung antwortet nicht"
  rollback
fi
msg_ok "Neue Fassung läuft"

# ---------- 5. Aufräumen: alte Sicherungen (die neuesten bleiben), alte Images, Build-Cache ----------
trap - ERR
if ((MIGRATED)); then
  finish_migration || msg_error "Umzug: Aufräumen ging nicht ganz – morni.net läuft, bitte die Meldungen oben ansehen."
fi
find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d | sort | head -n "-${KEEP_BACKUPS}" | xargs -r rm -rf
# Wächter (neu) einrichten: prüft jede Minute NetBird, DNS, Docker und die Container von morni.net; Meldungen gehen
# über den Motor ins Discord-Team-Log.
if [[ -f "${VENDOR_SCRIPTS}/guard.sh" ]] && command -v systemctl >/dev/null 2>&1; then
  if MH_BRAND=morni.net MH_GUARD_NAME="${APP}" MH_INSTALL_DIR="${INSTALL_DIR}" MH_DATA_VOLUME="${MOTOR_VOLUME_NAME}" \
    MH_GUARD_CONTAINERS="${NEW_CONTAINERS[*]}" MH_UNIT_DIR="${SYSTEMD_DIR}" MH_WRAPPER_DIR="${SBIN_DIR}" \
    bash "${VENDOR_SCRIPTS}/guard.sh" install >/dev/null; then
    msg_ok "Wächter läuft (Status: ${APP}-guard status)"
  else
    msg_error "Der Wächter ließ sich nicht einrichten (Details: bash ${INSTALL_DIR}/${VENDOR_SCRIPTS}/guard.sh install)"
  fi
fi
docker image prune -f >/dev/null 2>&1 || true
docker builder prune -af >/dev/null 2>&1 || true
STEP="null"
write_status "done"
msg_ok "Update fertig: ${MM_UPDATE_FROM} → ${MM_UPDATE_TO}"
