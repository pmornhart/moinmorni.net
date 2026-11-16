#!/usr/bin/env bash
# Test für update.sh: echtes Git (Ursprung + Klon mit Motor-Untermodul), nachgebautes Docker (und systemd).
#   bash tools/update-test/run.sh
# Abläufe: Update klappt · Bauen scheitert · neue Fassung startet nicht (Rückweg mit Datenbank) · schon aktuell ·
# Motor auf main · Links im Update-Ordner · abgebrochenes Update · Umzug vom früheren Namen (klappt / Rückweg).
#
# Verfasst mit Claude 🤖
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${HERE}/../.." && pwd)"
SCRIPT="${REPO_ROOT}/update.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
PASS=0
FAIL=0
check() {
  if eval "$2"; then
    PASS=$((PASS + 1))
    printf '   ✔ %s\n' "$1"
  else
    FAIL=$((FAIL + 1))
    printf '   ✖ %s\n' "$1"
  fi
}
git_q() { git -c user.email=t@t -c user.name=t -c protocol.file.allow=always "$@" >/dev/null 2>&1; }

# Name der Installation und früherer Name – aus update.sh selbst (dort stehen sie an einer Stelle).
APP="$(sed -n 's/^APP="\(.*\)"$/\1/p' "${SCRIPT}")"
OLD_APP="$(sed -n 's/^OLD_APP="\(.*\)"$/\1/p' "${SCRIPT}")"
OLD_REPO="$(sed -n 's/^OLD_REPO="\(.*\)"$/\1/p' "${SCRIPT}")"
NEW_REPO="$(sed -n 's/^NEW_REPO="\(.*\)"$/\1/p' "${SCRIPT}")"
# Letzte Fassung vor der Umbenennung (16.11.2026): ihr update.sh holt das Update (Schritt 1) und reicht weiter.
LAST_OLD_COMMIT="f02b392"

# ---------- Nachgebautes Docker: Volumes, Container, Netze als Dateien; Projektname aus docker-compose.yml ----------
mkdir -p "${WORK}/bin"
cat >"${WORK}/bin/docker" <<'DOCKER'
#!/usr/bin/env bash
echo "docker $*" >>"${FAKE_LOG}"
V="${FAKE_VOL}/volumes"
C="${FAKE_VOL}/containers"
N="${FAKE_VOL}/networks"
mkdir -p "${V}" "${C}" "${N}"
project() { sed -n 's/^name: *//p' docker-compose.yml 2>/dev/null | head -n 1; }
last="${!#}"
case "$1 $2" in
  "volume inspect")
    [[ -d "${V}/${last}" ]] || exit 1
    echo "${V}/${last}"
    exit 0 ;;
  "volume rm")
    shift 2
    code=0
    for v in "$@"; do rmdir "${V}/${v}" 2>/dev/null || code=1; done
    exit "${code}" ;;
  "compose build") [[ -f "${FAKE_VOL}/build-fails" ]] && exit 1; exit 0 ;;
  "compose up")
    p="$(project)"
    mkdir -p "${V}/${p}-data" "${V}/${p}-motor-data"
    [[ "$*" == *--no-start* ]] && exit 0
    # Neue Fassung = Datei zeigt die gebaute Version; nach dem Rückweg läuft wieder die alte.
    if [[ "${MM_BUILD_VERSION:-}" == "${MM_UPDATE_FROM:-x}" ]]; then touch "${FAKE_VOL}/old-running"; else rm -f "${FAKE_VOL}/old-running"; fi
    for c in "${p}" "${p}-motor" "${p}-socket-proxy"; do echo "${MM_BUILD_VERSION:-}" >"${C}/${c}"; done
    echo "${MM_BUILD_VERSION:-}" >"${FAKE_VOL}/running-version"
    exit 0 ;;
  "inspect -f")
    # Version im laufenden Image (des genannten Containers).
    [[ -f "${C}/${last}" ]] && cat "${C}/${last}"
    exit 0 ;;
  "rm -f")
    shift 2
    for c in "$@"; do [[ -f "${C}/${c}" ]] && unlink "${C}/${c}"; done
    exit 0 ;;
  "network inspect")
    [[ -f "${N}/${last}" ]] || exit 1
    cat "${N}/${last}"
    exit 0 ;;
  "network rm") [[ -f "${N}/${3}" ]] && unlink "${N}/${3}"; exit 0 ;;
esac
case "$1" in
  exec)
    [[ -f "${C}/$2" ]] || exit 1
    [[ -f "${FAKE_VOL}/unhealthy" && ! -f "${FAKE_VOL}/old-running" ]] && exit 1
    exit 0 ;;
esac
exit 0
DOCKER
cat >"${WORK}/bin/systemctl" <<'SYSTEMCTL'
#!/usr/bin/env bash
echo "systemctl $*" >>"${FAKE_LOG}"
exit 0
SYSTEMCTL
chmod +x "${WORK}/bin/docker" "${WORK}/bin/systemctl"
export PATH="${WORK}/bin:${PATH}" FAKE_LOG="${WORK}/docker.log" FAKE_VOL="${WORK}/vol"
export MM_BACKUP_DIR="${WORK}/backups" MM_HEALTH_TRIES=2 MM_HEALTH_SECONDS=0
export MM_SYSTEMD_DIR="${WORK}/systemd" MM_BIN_DIR="${WORK}/usr-local-bin"
mkdir -p "${MM_SYSTEMD_DIR}" "${MM_BIN_DIR}"
DATA="${WORK}/vol/volumes/${APP}-data"
MOTOR="${WORK}/vol/volumes/${APP}-motor-data"
mkdir -p "${DATA}" "${MOTOR}"

# ---------- Echtes Git: Motor-Ursprung, Ursprung mit Untermodul, Klon als /opt/morninet ----------
git_q init -q -b main "${WORK}/motor-origin"
echo v1 >"${WORK}/motor-origin/motor.txt"
git_q -C "${WORK}/motor-origin" add . && git_q -C "${WORK}/motor-origin" commit -qm "Motor 1"
git_q init -q -b main "${WORK}/mm-origin"
cp "${SCRIPT}" "${WORK}/mm-origin/update.sh"
printf 'name: %s\n' "${APP}" >"${WORK}/mm-origin/docker-compose.yml"
git_q -C "${WORK}/mm-origin" -c protocol.file.allow=always submodule add -q "${WORK}/motor-origin" vendor/mornihosting
git_q -C "${WORK}/mm-origin" add . && git_q -C "${WORK}/mm-origin" commit -qm "morni.net 1"
git_q -c protocol.file.allow=always clone -q --recurse-submodules "${WORK}/mm-origin" "${WORK}/install"
git -C "${WORK}/mm-origin" config receive.denyCurrentBranch ignore
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=protocol.file.allow GIT_CONFIG_VALUE_0=always
INSTALL="${WORK}/install"
new_commit() {
  echo "$1" >>"${WORK}/mm-origin/change.txt"
  git_q -C "${WORK}/mm-origin" add . && git_q -C "${WORK}/mm-origin" commit -qm "$1"
}
status() { cat "${DATA}/update/status.json" 2>/dev/null; }
run_update() {
  mkdir -p "${DATA}/update"
  echo '{"at":"2026-11-14T00:00:00Z","by":"test","motor":"pinned"}' >"${DATA}/update/request.json"
  bash "${INSTALL}/update.sh" >"${WORK}/out.txt" 2>&1
  echo $?
}

echo " 1) Update klappt"
echo "db-alt" >"${DATA}/${APP}.db"
echo "motor-db" >"${MOTOR}/mornihosting.db"
mkdir -p "${MOTOR}/servers/x" && echo welt >"${MOTOR}/servers/x/level.dat"
OLD="$(git -C "${INSTALL}" rev-parse HEAD)"
new_commit "Neu 1"
code="$(run_update)"
check "endet ohne Fehler" "[[ ${code} == 0 ]]"
check "Status done mit von/nach" "status | grep -q '\"state\":\"done\"' && status | grep -q '\"from\":\"v0.0.1-0-g'"
check "Code ist neu" "[[ \$(git -C '${INSTALL}' rev-parse HEAD) != ${OLD} ]]"
check "Auftrag weg" "[[ ! -f '${DATA}/update/request.json' ]]"
check "Sicherung mit beiden Datenbanken, ohne Welten" "ls '${WORK}'/backups/*/${APP}/${APP}.db >/dev/null && ls '${WORK}'/backups/*/motor/mornihosting.db >/dev/null && ! ls -d '${WORK}'/backups/*/motor/servers >/dev/null 2>&1"
check "Protokoll fürs Panel" "grep -q 'Update fertig' '${DATA}/update/log.txt'"
check "gebaut wurden morni.net und Motor" "grep -q 'compose build --quiet ${APP} motor' '${FAKE_LOG}'"
check "ohne Umzug: nichts verschoben, keine Volumes unter dem früheren Namen" "[[ ! -e '${WORK}/vol/volumes/${OLD_APP}-data' ]] && ! grep -q 'Umzug' '${WORK}/out.txt'"

echo " 2) Bauen scheitert → alter Stand läuft weiter"
OLD="$(git -C "${INSTALL}" rev-parse HEAD)"
new_commit "Neu 2"
touch "${WORK}/vol/build-fails"
: >"${FAKE_LOG}"
code="$(run_update)"
rm -f "${WORK}/vol/build-fails"
check "endet mit Fehler" "[[ ${code} != 0 ]]"
check "Status rolled_back" "status | grep -q '\"state\":\"rolled_back\"'"
check "Code wieder alt" "[[ \$(git -C '${INSTALL}' rev-parse HEAD) == ${OLD} ]]"
check "nichts gestoppt" "! grep -q 'compose stop' '${FAKE_LOG}'"

echo " 3) Neue Fassung startet nicht → Rückweg mit Datenbank"
echo "db-vorher" >"${DATA}/${APP}.db"
touch "${WORK}/vol/unhealthy"
: >"${FAKE_LOG}"
code="$(run_update)"
check "endet mit Fehler" "[[ ${code} != 0 ]]"
check "Status rolled_back, Version zurück" "status | grep -q '\"state\":\"rolled_back\"' && status | grep -q \"\\\"to\\\":\\\"\$(status | sed 's/.*\"from\":\"\\([^\"]*\\)\".*/\\1/')\\\"\""
check "Code wieder alt" "[[ \$(git -C '${INSTALL}' rev-parse HEAD) == ${OLD} ]]"
check "Datenbank aus der Sicherung" "[[ \$(cat '${DATA}/${APP}.db') == db-vorher ]]"
check "alte Fassung läuft" "[[ -f '${WORK}/vol/old-running' ]]"
rm -f "${WORK}/vol/unhealthy"

echo " 4) Schon aktuell"
git -C "${WORK}/mm-origin" reset -q --hard "${OLD}"
code="$(run_update)"
check "endet ohne Fehler, done" "[[ ${code} == 0 ]] && status | grep -q '\"state\":\"done\"'"
check "nichts gebaut" "! grep -q 'Neue Fassung wird gebaut' '${WORK}/out.txt'"

echo " 5) Motor auf den neuesten Stand (motor: main)"
echo v2 >"${WORK}/motor-origin/motor.txt"
git_q -C "${WORK}/motor-origin" commit -qam "Motor 2"
mkdir -p "${DATA}/update"
echo '{"at":"2026-11-14T00:00:00Z","by":"test","motor":"main"}' >"${DATA}/update/request.json"
bash "${INSTALL}/update.sh" >"${WORK}/out.txt" 2>&1
check "Motor-Datei ist neu" "[[ \$(cat '${INSTALL}/vendor/mornihosting/motor.txt') == v2 ]]"
check "Status done" "status | grep -q '\"state\":\"done\"'"

echo " 6) Links im Update-Ordner (vom Container gelegt) werden nicht verfolgt"
echo "geheim" >"${WORK}/host-datei"
rm -f "${DATA}/update/log.txt" "${DATA}/update/status.json"
ln -s "${WORK}/host-datei" "${DATA}/update/log.txt"
ln -s "${WORK}/host-datei" "${DATA}/update/status.json"
new_commit "Sechs"
code="$(run_update)"
check "endet ohne Fehler" "[[ ${code} == 0 ]]"
check "fremde Datei unverändert" "[[ \$(cat '${WORK}/host-datei') == geheim ]]"
check "Protokoll und Status sind eigene Dateien" "[[ ! -L '${DATA}/update/log.txt' && ! -L '${DATA}/update/status.json' ]] && grep -q 'Update fertig' '${DATA}/update/log.txt'"
rm -rf "${DATA}/update"
mkdir -p "${WORK}/anderswo"
ln -s "${WORK}/anderswo" "${DATA}/update"
bash "${INSTALL}/update.sh" >"${WORK}/out.txt" 2>&1
check "Update-Ordner als Link → Abbruch, nichts geschrieben" "[[ -z \$(ls -A '${WORK}/anderswo') ]] && grep -q 'Verweis' '${WORK}/out.txt'"

echo " 7) Abgebrochenes Update: Code schon neu, läuft aber noch alt → wird trotzdem gebaut"
rm -f "${DATA}/update"; mkdir -p "${DATA}/update"
new_commit "Sieben"
git -C "${INSTALL}" pull -q --ff-only 2>/dev/null
: >"${FAKE_LOG}"
code="$(run_update)"
check "endet ohne Fehler" "[[ ${code} == 0 ]]"
check "baut, statt schon aktuell zu melden" "grep -q 'compose build' '${FAKE_LOG}' && ! grep -q 'Schon aktuell' '${WORK}/out.txt'"
check "läuft jetzt die neue Fassung" "[[ \$(cat '${WORK}/vol/running-version') == \$(status | sed 's/.*\"to\":\"\\([^\"]*\\)\".*/\\1/') ]]"

# ---------- Umzug: Installation unter dem früheren Namen (bis 16.11.2026) ----------
# Welt: Ursprung unter dem alten Repo-Namen (daneben derselbe unter dem neuen, wie nach dem Umbenennen bei GitHub),
# Klon in <opt>/<früherer Name>, Volumes, Container, Netz, systemd-Einheiten, Befehl und Sicherungen unter altem Namen.
setup_old_world() {
  local w="$1" origin
  W="${w}"
  export FAKE_VOL="${w}/vol" FAKE_LOG="${w}/docker.log" MM_SYSTEMD_DIR="${w}/systemd" MM_BIN_DIR="${w}/usr-local-bin"
  export MM_BACKUP_DIR="${w}/var-backups/${APP}"
  mkdir -p "${w}/vol/volumes" "${w}/vol/containers" "${w}/vol/networks" "${MM_SYSTEMD_DIR}" "${MM_BIN_DIR}"
  origin="${w}/gh/pmornhart/${OLD_REPO}"
  git_q init -q -b main "${origin}"
  # Schritt 1 macht das update.sh der Fassung, die läuft – hier das der letzten unter dem früheren Namen.
  if git -C "${REPO_ROOT}" cat-file -e "${LAST_OLD_COMMIT}^{commit}" 2>/dev/null; then
    git -C "${REPO_ROOT}" show "${LAST_OLD_COMMIT}:update.sh" >"${origin}/update.sh"
  else
    cp "${SCRIPT}" "${origin}/update.sh"
  fi
  printf 'name: %s\n' "${OLD_APP}" >"${origin}/docker-compose.yml"
  git_q -C "${origin}" -c protocol.file.allow=always submodule add -q "${WORK}/motor-origin" vendor/mornihosting
  git_q -C "${origin}" add . && git_q -C "${origin}" commit -qm "alter Name"
  mkdir -p "${w}/opt"
  git_q -c protocol.file.allow=always clone -q --recurse-submodules "${origin}" "${w}/opt/${OLD_APP}"
  git -C "${origin}" config receive.denyCurrentBranch ignore
  # Das Update: neuer Name.
  cp "${SCRIPT}" "${origin}/update.sh"
  printf 'name: %s\n' "${APP}" >"${origin}/docker-compose.yml"
  git_q -C "${origin}" add . && git_q -C "${origin}" commit -qm "Umbenannt in morni.net"
  git_q clone -q --bare "${origin}" "${w}/gh/pmornhart/${NEW_REPO}"
  # Daten unter dem früheren Namen
  OLD_DATA="${w}/vol/volumes/${OLD_APP}-data"
  OLD_MOTOR="${w}/vol/volumes/${OLD_APP}-motor-data"
  NEW_DATA="${w}/vol/volumes/${APP}-data"
  NEW_MOTOR="${w}/vol/volumes/${APP}-motor-data"
  mkdir -p "${OLD_DATA}/update" "${OLD_MOTOR}/servers/x"
  echo "db-alt" >"${OLD_DATA}/${OLD_APP}.db"
  echo "MM-1234" >"${OLD_DATA}/setup-code"
  echo "motor-db" >"${OLD_MOTOR}/mornihosting.db"
  echo welt >"${OLD_MOTOR}/servers/x/level.dat"
  echo '{"at":"2026-11-16T00:00:00Z","by":"test","motor":"pinned"}' >"${OLD_DATA}/update/request.json"
  chmod 750 "${OLD_DATA}"
  # Laufende Container unter dem früheren Namen, ein Minecraft-Server im alten Netz
  for c in "${OLD_APP}" "${OLD_APP}-motor" "${OLD_APP}-socket-proxy"; do echo "v0.9.9-0-gabcdef0" >"${w}/vol/containers/${c}"; done
  echo "mh-1 ${OLD_APP} ${OLD_APP}-motor " >"${w}/vol/networks/${OLD_APP}-mc"
  # systemd, Befehl, alte Sicherung
  printf '[Path]\nPathExists=%s/update/request.json\n' "${OLD_DATA}" >"${MM_SYSTEMD_DIR}/${OLD_APP}-update.path"
  printf '[Service]\nExecStart=%s/opt/%s/update.sh\n' "${w}" "${OLD_APP}" >"${MM_SYSTEMD_DIR}/${OLD_APP}-update.service"
  ln -s "${w}/opt/${OLD_APP}/update.sh" "${MM_BIN_DIR}/${OLD_APP}-update"
  mkdir -p "${w}/var-backups/${OLD_APP}/20261101-000000-v0.9.0"
  echo alt >"${w}/var-backups/${OLD_APP}/20261101-000000-v0.9.0/stand.txt"
}

echo " 8) Umzug vom früheren Namen: Volumes, Container, Netz, /opt, systemd, Befehl, Sicherungen, Git-Adresse"
setup_old_world "${WORK}/umzug"
bash "${W}/opt/${OLD_APP}/update.sh" >"${W}/out.txt" 2>&1
code=$?
check "endet ohne Fehler" "[[ ${code} == 0 ]]"
check "Status done im neuen Volume" "grep -q '\"state\":\"done\"' '${NEW_DATA}/update/status.json'"
check "Daten im neuen Volume (Datenbank, Einrichtungs-Code, Protokoll)" "[[ \$(cat '${NEW_DATA}/${OLD_APP}.db') == db-alt && -f '${NEW_DATA}/setup-code' ]] && grep -q 'Daten liegen in den neuen Volumes' '${NEW_DATA}/update/log.txt'"
check "Welten im neuen Motor-Volume" "[[ \$(cat '${NEW_MOTOR}/servers/x/level.dat') == welt && -f '${NEW_MOTOR}/mornihosting.db' ]]"
check "Rechte des Volume-Ordners übernommen" "[[ \$(stat -c %a '${NEW_DATA}') == 750 ]]"
check "alte Volumes weg" "[[ ! -e '${OLD_DATA}' && ! -e '${OLD_MOTOR}' ]]"
check "alte Container weg, neue laufen" "[[ ! -e '${W}/vol/containers/${OLD_APP}' && ! -e '${W}/vol/containers/${OLD_APP}-motor' && -f '${W}/vol/containers/${APP}' && -f '${W}/vol/containers/${APP}-motor' ]]"
check "alte Container erst angehalten, dann entfernt" "grep -q 'docker stop ${OLD_APP} ${OLD_APP}-motor' '${FAKE_LOG}' && grep -q 'docker rm -f ${OLD_APP} ' '${FAKE_LOG}'"
check "Minecraft-Server im alten Netz: Motor und morni.net hängen sich an" "grep -q 'network connect ${OLD_APP}-mc ${APP}\$' '${FAKE_LOG}' && grep -q 'network connect ${OLD_APP}-mc ${APP}-motor' '${FAKE_LOG}'"
check "Installation liegt in <opt>/${APP}" "[[ -d '${W}/opt/${APP}/.git' && ! -e '${W}/opt/${OLD_APP}' ]]"
check "systemd: neue Einheiten auf neues Volume und neuen Ordner" "grep -qx 'PathExists=${NEW_DATA}/update/request.json' '${MM_SYSTEMD_DIR}/${APP}-update.path' && grep -qx 'ExecStart=${W}/opt/${APP}/update.sh' '${MM_SYSTEMD_DIR}/${APP}-update.service'"
check "systemd: alte Einheiten weg, neue eingeschaltet" "[[ ! -e '${MM_SYSTEMD_DIR}/${OLD_APP}-update.path' && ! -e '${MM_SYSTEMD_DIR}/${OLD_APP}-update.service' ]] && grep -q 'systemctl enable --now ${APP}-update.path' '${FAKE_LOG}' && grep -q 'systemctl disable --now ${OLD_APP}-update.path' '${FAKE_LOG}'"
check "Befehl ${APP}-update statt des alten" "[[ \$(readlink '${MM_BIN_DIR}/${APP}-update') == '${W}/opt/${APP}/update.sh' && ! -e '${MM_BIN_DIR}/${OLD_APP}-update' && ! -L '${MM_BIN_DIR}/${OLD_APP}-update' ]]"
check "Sicherungen umgezogen, neue Sicherung dabei" "[[ -f '${MM_BACKUP_DIR}/20261101-000000-v0.9.0/stand.txt' && ! -e '${W}/var-backups/${OLD_APP}' ]] && ls '${MM_BACKUP_DIR}'/*/${APP}/${OLD_APP}.db >/dev/null"
check "Git zeigt aufs umbenannte Repo" "[[ \$(git -C '${W}/opt/${APP}' remote get-url origin) == '${W}/gh/pmornhart/${NEW_REPO}' ]]"

echo " 9) Umzug klappt nicht (neue Fassung antwortet nicht) → alles zurück an den alten Platz"
setup_old_world "${WORK}/umzug-zurueck"
touch "${W}/vol/unhealthy"
bash "${W}/opt/${OLD_APP}/update.sh" >"${W}/out.txt" 2>&1
code=$?
check "endet mit Fehler" "[[ ${code} != 0 ]]"
check "Status rolled_back im alten Volume" "grep -q '\"state\":\"rolled_back\"' '${OLD_DATA}/update/status.json'"
check "Daten zurück in den alten Volumes" "[[ \$(cat '${OLD_DATA}/${OLD_APP}.db') == db-alt && -f '${OLD_DATA}/setup-code' && \$(cat '${OLD_MOTOR}/servers/x/level.dat') == welt ]]"
check "neue Volumes und Container weg" "[[ ! -e '${NEW_DATA}' && ! -e '${NEW_MOTOR}' && ! -e '${W}/vol/containers/${APP}' ]]"
check "alte Fassung läuft wieder (alter Name, Gesundheit geprüft)" "[[ -f '${W}/vol/old-running' && -f '${W}/vol/containers/${OLD_APP}' ]] && grep -q 'Alter Stand läuft wieder' '${W}/out.txt'"
check "Ordner, systemd und Befehl unverändert" "[[ -d '${W}/opt/${OLD_APP}/.git' && ! -e '${W}/opt/${APP}' && -f '${MM_SYSTEMD_DIR}/${OLD_APP}-update.path' && ! -e '${MM_SYSTEMD_DIR}/${APP}-update.path' && -L '${MM_BIN_DIR}/${OLD_APP}-update' ]]"

printf '\n %s bestanden, %s fehlgeschlagen\n' "${PASS}" "${FAIL}"
[[ ${FAIL} -eq 0 ]]
