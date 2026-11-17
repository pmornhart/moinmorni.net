#!/usr/bin/env bash
# Test für update.sh: echtes Git (Ursprung + Klon mit Motor-Untermodul), nachgebautes Docker (und systemd).
#   bash tools/update-test/run.sh
# Abläufe: Update klappt · Bauen scheitert · neue Fassung startet nicht (Rückweg mit Datenbank) · schon aktuell ·
# Motor auf main · Links im Update-Ordner · abgebrochenes Update · Rückbenennung einer Installation unter dem
# Zwischen-Namen vom 16.11.2026 (klappt / Rückweg) – Schritt 1 macht dabei das echte update.sh dieses Zwischenstands.
#
# Verfasst mit Claude 🤖
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${HERE}/../.." && pwd)"
SCRIPT="${REPO_ROOT}/update.sh"
GUARD_SCRIPT="${REPO_ROOT}/vendor/mornihosting/scripts/guard.sh"
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

# Name der Installation und Zwischen-Name – aus update.sh selbst (dort stehen sie an einer Stelle).
APP="$(sed -n 's/^APP="\(.*\)"$/\1/p' "${SCRIPT}")"
REPO="$(sed -n 's/^REPO="\(.*\)"$/\1/p' "${SCRIPT}")"
INTERIM_APP="$(sed -n 's/^INTERIM_APP="\(.*\)"$/\1/p' "${SCRIPT}")"
INTERIM_REPO="$(sed -n 's/^INTERIM_REPO="\(.*\)"$/\1/p' "${SCRIPT}")"
INTERIM_DOMAIN="$(sed -n 's/^INTERIM_DOMAIN="\(.*\)"$/\1/p' "${SCRIPT}")"
# Stand unter dem Zwischen-Namen, den Philip installiert hat (Container 103): sein update.sh holt das Update (Schritt 1)
# und reicht an die neue Fassung weiter – so wie „pct exec 103 -- bash /opt/<Zwischen-Name>/update.sh“ auf dem Host.
INTERIM_COMMIT="a9ed39e"
# Philip hat vom Entwicklungs-Branch installiert (main gibt es noch nicht) – die Updates im Panel müssen ihm folgen.
INTERIM_BRANCH="claude/funny-archimedes-awjk48"

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
  "compose build")
    # „Was ist neu“: liegt die Liste der Änderungen beim Bauen bereit (Rechte, Zahl der Versionen)?
    cl=apps/server/changelog.txt
    [[ -f "${cl}" ]] && echo "changelog=$(stat -c %a "${cl}") versionen=$(grep -c $'\x1eV ' "${cl}")" >>"${FAKE_LOG}"
    [[ -f "${FAKE_VOL}/build-fails" ]] && exit 1; exit 0 ;;
  "compose up")
    p="$(project)"
    mkdir -p "${V}/${p}-data" "${V}/${p}-motor-data"
    [[ "$*" == *--no-start* ]] && exit 0
    echo "sperre-zwischen=$([[ -e "${MM_INTERIM_UPDATE_LOCK:-/nirgends}" ]] && echo da || echo weg) domain=$(sed -n 's/^MM_DOMAIN=//p' .env 2>/dev/null)" >>"${FAKE_LOG}"
    # Neue Fassung = Datei zeigt die gebaute Version; nach dem Rückweg läuft wieder die alte.
    if [[ "${MM_BUILD_VERSION:-}" == "${MM_UPDATE_FROM:-x}" ]]; then touch "${FAKE_VOL}/old-running"; else rm -f "${FAKE_VOL}/old-running"; fi
    for c in "${p}" "${p}-motor" "${p}-socket-proxy"; do echo "${MM_BUILD_VERSION:-}" >"${C}/${c}"; done
    echo "${MM_BUILD_VERSION:-}" >"${FAKE_VOL}/running-version"
    # Wie MoinMorni beim Start (lib/rename.ts): Datenbank unter dem Zwischen-Namen übernehmen.
    d="${V}/${p}-data"
    if [[ -n "${FAKE_INTERIM:-}" && "${p}" != "${FAKE_INTERIM}" && -f "${d}/${FAKE_INTERIM}.db" ]]; then
      mv -f "${d}/${FAKE_INTERIM}.db" "${d}/${p}.db"
    fi
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
# systemd: merkt sich, welche Einheiten laufen; ein Verweis im Einheiten-Ordner ist ein zweiter Name (wie bei systemd).
cat >"${WORK}/bin/systemctl" <<'SYSTEMCTL'
#!/usr/bin/env bash
echo "systemctl $*" >>"${FAKE_LOG}"
S="${FAKE_VOL}/systemd-active"
mkdir -p "${S}"
real() {
  local f="${MM_SYSTEMD_DIR}/$1"
  if [[ -L "${f}" ]]; then basename "$(readlink "${f}")"; else echo "$1"; fi
}
case "$1" in
  enable | disable)
    on="$1"; shift
    now=0
    for a in "$@"; do
      case "${a}" in --now) now=1 ;; -*) ;; *) if [[ "${on}" == disable ]]; then rm -f "${S}/$(real "${a}")"; elif ((now)); then touch "${S}/$(real "${a}")"; fi ;; esac
    done ;;
  is-active)
    for a in "$@"; do [[ "${a}" == -* || "${a}" == is-active ]] && continue; u="$(real "${a}")"; [[ -f "${S}/${u}" && -e "${MM_SYSTEMD_DIR}/${u}" ]] || exit 3; done ;;
  cat) exit 1 ;;
esac
exit 0
SYSTEMCTL
chmod +x "${WORK}/bin/docker" "${WORK}/bin/systemctl"
export PATH="${WORK}/bin:${PATH}" FAKE_LOG="${WORK}/docker.log" FAKE_VOL="${WORK}/vol"
export MM_BACKUP_DIR="${WORK}/backups" MM_HEALTH_TRIES=2 MM_HEALTH_SECONDS=0
export MM_SYSTEMD_DIR="${WORK}/systemd" MM_BIN_DIR="${WORK}/usr-local-bin" MM_SBIN_DIR="${WORK}/usr-local-sbin"
export MM_VAR_LIB="${WORK}/var-lib" MM_VAR_LOG="${WORK}/var-log"
export MM_UPDATE_LOCK="${WORK}/update.lock" MM_INTERIM_UPDATE_LOCK="${WORK}/update-zwischen.lock"
mkdir -p "${MM_SYSTEMD_DIR}" "${MM_BIN_DIR}"
DATA="${WORK}/vol/volumes/${APP}-data"
MOTOR="${WORK}/vol/volumes/${APP}-motor-data"
mkdir -p "${DATA}" "${MOTOR}"

# ---------- Echtes Git: Motor-Ursprung, Ursprung mit Untermodul, Klon als /opt/moinmorni ----------
git_q init -q -b main "${WORK}/motor-origin"
echo v1 >"${WORK}/motor-origin/motor.txt"
# Wächter und NetBird-Adresse des Motors: hier nur Stellvertreter, die mitschreiben, womit sie aufgerufen werden.
mkdir -p "${WORK}/motor-origin/scripts"
cat >"${WORK}/motor-origin/scripts/guard.sh" <<'GUARD'
#!/usr/bin/env bash
echo "guard $* brand=${MH_BRAND:-} name=${MH_GUARD_NAME:-} volume=${MH_DATA_VOLUME:-} containers=${MH_GUARD_CONTAINERS:-} units=${MH_UNIT_DIR:-} lock=$([[ -e "${MM_UPDATE_LOCK}" ]] && echo da || echo weg)" >>"${FAKE_LOG}"
GUARD
cat >"${WORK}/motor-origin/scripts/netbird-env.sh" <<'NETBIRD'
#!/usr/bin/env bash
echo "netbird-env env=${MH_ENV_FILE:-}" >>"${FAKE_LOG}"
echo "https://netbird.example.de"
NETBIRD
git_q -C "${WORK}/motor-origin" add . && git_q -C "${WORK}/motor-origin" commit -qm "Motor 1"
git_q init -q -b main "${WORK}/mm-origin"
cp "${SCRIPT}" "${WORK}/mm-origin/update.sh"
# „Was ist neu“: update.sh schreibt vor dem Bauen die Liste der Änderungen (apps/server/changelog.txt).
mkdir -p "${WORK}/mm-origin/scripts" "${WORK}/mm-origin/apps/server"
cp "${REPO_ROOT}/scripts/changelog.sh" "${WORK}/mm-origin/scripts/changelog.sh"
echo '{}' >"${WORK}/mm-origin/apps/server/package.json"
printf 'name: %s\n' "${APP}" >"${WORK}/mm-origin/docker-compose.yml"
git_q -C "${WORK}/mm-origin" -c protocol.file.allow=always submodule add -q "${WORK}/motor-origin" vendor/mornihosting
git_q -C "${WORK}/mm-origin" add . && git_q -C "${WORK}/mm-origin" commit -qm "MoinMorni 1"
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
# .env wie aus .env.example: Branch für die Updates im Panel noch leer.
printf 'MM_DOMAIN=example.org\nMM_UPDATE_BRANCH=\nTZ=Europe/Berlin\n' >"${INSTALL}/.env"
chmod 600 "${INSTALL}/.env"
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
check "gebaut wurden MoinMorni und Motor" "grep -q 'compose build --quiet ${APP} motor' '${FAKE_LOG}'"
check "„Was ist neu“: Liste der Änderungen beim Bauen da, lesbar, eine Version je Commit" "grep -q 'changelog=644 versionen=2\$' '${FAKE_LOG}' && head -n 1 '${INSTALL}/apps/server/changelog.txt' | grep -q '^MoinMorni-Änderungen 1\$' && ! ls '${INSTALL}'/apps/server/changelog.txt.* >/dev/null 2>&1"
check "ohne Rückbenennung: nichts verschoben, keine Volumes unter dem Zwischen-Namen" "[[ ! -e '${WORK}/vol/volumes/${INTERIM_APP}-data' ]] && ! grep -q 'Rückbenennung' '${WORK}/out.txt'"
check "Updates im Panel folgen dem installierten Branch (main), sonst bleibt die .env" "grep -qx 'MM_UPDATE_BRANCH=main' '${INSTALL}/.env' && [[ \$(grep -c '^MM_UPDATE_BRANCH=' '${INSTALL}/.env') == 1 ]] && grep -qx 'MM_DOMAIN=example.org' '${INSTALL}/.env' && [[ \$(stat -c %a '${INSTALL}/.env') == 600 ]]"
check "NetBird-Adresse kommt in die .env von MoinMorni" "grep -q 'netbird-env env=${INSTALL}/.env' '${FAKE_LOG}' && grep -q 'netbird.example.de' '${WORK}/out.txt'"
check "Wächter mit den Namen von MoinMorni, Meldungen an den Motor" "grep -q 'guard install brand=MoinMorni name=${APP} volume=${APP}-motor-data containers=${APP} ${APP}-motor ${APP}-socket-proxy units=${MM_SYSTEMD_DIR}' '${FAKE_LOG}'"
check "der Wächter sah die Update-Sperre, danach ist sie weg" "grep -q 'guard install.* lock=da' '${FAKE_LOG}' && [[ ! -e '${MM_UPDATE_LOCK}' ]]"

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

echo " 5b) Motor auf main, aber main fehlt die passende Fassung (PR noch nicht übernommen)"
git_q -C "${WORK}/motor-origin" checkout -q -b pr
echo v3 >"${WORK}/motor-origin/motor.txt"
git_q -C "${WORK}/motor-origin" commit -qam "Motor PR"
PR_MOTOR="$(git -C "${WORK}/motor-origin" rev-parse HEAD)"
git_q -C "${WORK}/motor-origin" checkout -q main
git_q -C "${WORK}/mm-origin/vendor/mornihosting" fetch -q origin pr
git_q -C "${WORK}/mm-origin/vendor/mornihosting" checkout -q "${PR_MOTOR}"
git_q -C "${WORK}/mm-origin" add vendor/mornihosting && git_q -C "${WORK}/mm-origin" commit -qm "Motor mit PR"
echo '{"at":"2026-11-14T00:00:00Z","by":"test","motor":"main"}' >"${DATA}/update/request.json"
bash "${INSTALL}/update.sh" >"${WORK}/out.txt" 2>&1
check "Motor bleibt auf der passenden Fassung, nicht auf main" "[[ \$(cat '${INSTALL}/vendor/mornihosting/motor.txt') == v3 ]]"
check "sagt im Protokoll, warum" "grep -q 'der Motor bleibt auf der passenden Fassung' '${WORK}/out.txt'"
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

# ---------- Rückbenennung: Installation unter dem Zwischen-Namen vom 16.11.2026 ----------
# Welt wie nach dem Proxmox-Einzeiler dieses Stands: Klon in <opt>/<Zwischen-Name> (Ursprung unter dem Zwischen-Namen
# des Repos, daneben derselbe unter dem richtigen), Volumes mit Datenbank, Einrichtungs-Code, Owner-Konto im Motor und
# Welten, Container, Minecraft-Netz, systemd-Einheiten, Befehl, Sicherungen, .env mit der vorgeschlagenen Domain und
# der echte Wächter aus dem Motor (guard.sh install mit den Namen des Zwischenstands).
setup_interim_world() {
  local w="$1" origin motor_origin
  W="${w}"
  export FAKE_VOL="${w}/vol" FAKE_LOG="${w}/docker.log" MM_SYSTEMD_DIR="${w}/systemd" MM_BIN_DIR="${w}/usr-local-bin"
  export MM_SBIN_DIR="${w}/usr-local-sbin" MM_VAR_LIB="${w}/var-lib" MM_VAR_LOG="${w}/var-log"
  export MM_BACKUP_DIR="${w}/var-backups/${APP}" FAKE_INTERIM="${INTERIM_APP}"
  export MM_UPDATE_LOCK="${w}/run/${APP}-update.lock" MM_INTERIM_UPDATE_LOCK="${w}/run/${INTERIM_APP}-update.lock"
  export MH_DOCKER_DAEMON_JSON="${w}/etc-docker/daemon.json"
  mkdir -p "${w}/vol/volumes" "${w}/vol/containers" "${w}/vol/networks" "${MM_SYSTEMD_DIR}" "${MM_BIN_DIR}" \
    "${MM_SBIN_DIR}" "${MM_VAR_LIB}" "${MM_VAR_LOG}" "${w}/run"
  # Motor mit dem echten Wächter aus MorniHosting.
  motor_origin="${w}/motor-origin"
  git_q init -q -b main "${motor_origin}"
  mkdir -p "${motor_origin}/scripts"
  cp "${GUARD_SCRIPT}" "${motor_origin}/scripts/guard.sh"
  cp "${WORK}/motor-origin/scripts/netbird-env.sh" "${motor_origin}/scripts/netbird-env.sh"
  git_q -C "${motor_origin}" add . && git_q -C "${motor_origin}" commit -qm "Motor mit Wächter"
  origin="${w}/gh/pmornhart/${INTERIM_REPO}"
  git_q init -q -b "${INTERIM_BRANCH}" "${origin}"
  # Schritt 1 macht das update.sh der Fassung, die läuft – genau das des Zwischenstands.
  git -C "${REPO_ROOT}" show "${INTERIM_COMMIT}:update.sh" >"${origin}/update.sh"
  git -C "${REPO_ROOT}" show "${INTERIM_COMMIT}:docker-compose.yml" | grep '^name:' >"${origin}/docker-compose.yml"
  git_q -C "${origin}" -c protocol.file.allow=always submodule add -q "${motor_origin}" vendor/mornihosting
  git_q -C "${origin}" add . && git_q -C "${origin}" commit -qm "Zwischenstand"
  mkdir -p "${w}/opt"
  git_q -c protocol.file.allow=always clone -q --recurse-submodules "${origin}" "${w}/opt/${INTERIM_APP}"
  git -C "${origin}" config receive.denyCurrentBranch ignore
  # Das Update: Name wieder MoinMorni.
  cp "${SCRIPT}" "${origin}/update.sh"
  printf 'name: %s\n' "${APP}" >"${origin}/docker-compose.yml"
  git_q -C "${origin}" add . && git_q -C "${origin}" commit -qm "Name wieder MoinMorni"
  git_q clone -q --bare "${origin}" "${w}/gh/pmornhart/${REPO}"
  # .env wie vom Einzeiler des Zwischenstands (Domain vorgeschlagen, Geheimnisse, Schlüssel für den Motor)
  printf 'MM_DOMAIN=%s\nMM_PORT=8080\nMM_SECRET=geheim-1\nMH_SECRET=geheim-2\nMM_MOTOR_TOKEN=mh_schluessel\nTZ=Europe/Berlin\n' \
    "${INTERIM_DOMAIN}" >"${w}/opt/${INTERIM_APP}/.env"
  chmod 600 "${w}/opt/${INTERIM_APP}/.env"
  # Daten unter dem Zwischen-Namen
  INTERIM_DATA="${w}/vol/volumes/${INTERIM_APP}-data"
  INTERIM_MOTOR="${w}/vol/volumes/${INTERIM_APP}-motor-data"
  NEW_DATA="${w}/vol/volumes/${APP}-data"
  NEW_MOTOR="${w}/vol/volumes/${APP}-motor-data"
  mkdir -p "${INTERIM_DATA}/update" "${INTERIM_MOTOR}/servers/x" "${INTERIM_MOTOR}/guard"
  echo "db-zwischen" >"${INTERIM_DATA}/${INTERIM_APP}.db"
  echo "MM-ABCD-1234" >"${INTERIM_DATA}/setup-code"
  echo '{"installed":"2026-11-16T17:30:00+00:00"}' >"${INTERIM_DATA}/update/agent.json"
  echo "owner=philip passwort-hash=argon2" >"${INTERIM_MOTOR}/mornihosting.db"
  echo welt >"${INTERIM_MOTOR}/servers/x/level.dat"
  echo '{"title":"alte Meldung"}' >"${INTERIM_MOTOR}/guard/events.jsonl"
  echo '{"at":"2026-11-16T00:00:00Z","by":"test","motor":"pinned"}' >"${INTERIM_DATA}/update/request.json"
  chmod 750 "${INTERIM_DATA}"
  # Laufende Container unter dem Zwischen-Namen, ein Minecraft-Server im Netz unter dem Zwischen-Namen
  for c in "${INTERIM_APP}" "${INTERIM_APP}-motor" "${INTERIM_APP}-socket-proxy"; do
    echo "v0.9.9-0-gabcdef0" >"${w}/vol/containers/${c}"
  done
  echo "mh-1 ${INTERIM_APP} ${INTERIM_APP}-motor " >"${w}/vol/networks/${INTERIM_APP}-mc"
  # systemd und Befehl wie aus install.sh des Zwischenstands, alte Sicherung
  printf '[Path]\nPathExists=%s/update/request.json\n' "${INTERIM_DATA}" >"${MM_SYSTEMD_DIR}/${INTERIM_APP}-update.path"
  printf '[Service]\nExecStart=%s/opt/%s/update.sh\n' "${w}" "${INTERIM_APP}" >"${MM_SYSTEMD_DIR}/${INTERIM_APP}-update.service"
  ln -s "${w}/opt/${INTERIM_APP}/update.sh" "${MM_BIN_DIR}/${INTERIM_APP}-update"
  mkdir -p "${w}/var-backups/${INTERIM_APP}/20261116-170000-v0.9.8"
  echo zwischen >"${w}/var-backups/${INTERIM_APP}/20261116-170000-v0.9.8/stand.txt"
  # Der Wächter des Zwischenstands – echt eingerichtet, mit eigenem Zustand und Protokoll.
  MH_BRAND="${INTERIM_DOMAIN}" MH_GUARD_NAME="${INTERIM_APP}" MH_INSTALL_DIR="${w}/opt/${INTERIM_APP}" \
    MH_DATA_VOLUME="${INTERIM_APP}-motor-data" \
    MH_GUARD_CONTAINERS="${INTERIM_APP} ${INTERIM_APP}-motor ${INTERIM_APP}-socket-proxy" \
    MH_UNIT_DIR="${MM_SYSTEMD_DIR}" MH_WRAPPER_DIR="${MM_SBIN_DIR}" \
    MH_GUARD_STATE_DIR="${MM_VAR_LIB}/${INTERIM_APP}" MH_GUARD_LOG="${MM_VAR_LOG}/${INTERIM_APP}-guard.log" \
    bash "${w}/opt/${INTERIM_APP}/vendor/mornihosting/scripts/guard.sh" install >/dev/null 2>&1
  mkdir -p "${MM_VAR_LIB}/${INTERIM_APP}"
  echo 3 >"${MM_VAR_LIB}/${INTERIM_APP}/dns-failures"
  echo "2026-11-16 17:40:00 Wächter läuft" >"${MM_VAR_LOG}/${INTERIM_APP}-guard.log"
  # Für den MoinMorni-Wächter, den das Update einrichtet (in echt /var/lib/moinmorni und /var/log/moinmorni-guard.log).
  export MH_GUARD_STATE_DIR="${MM_VAR_LIB}/${APP}" MH_GUARD_LOG="${MM_VAR_LOG}/${APP}-guard.log"
}

# Was der Host-Wächter auf dem Proxmox-Host (eingerichtet mit den Namen des Zwischenstands) im Container aufruft:
# „systemctl is-active <Name>-guard.timer“ und „/usr/local/sbin/<Name>-guard event host …“.
host_guard_timer_active() { systemctl is-active --quiet "${INTERIM_APP}-guard.timer"; }
host_guard_event() {
  "${MM_SBIN_DIR}/${INTERIM_APP}-guard" event host container fixed "Container neu gestartet" "Probe vom Host-Wächter"
}

echo " 8) Rückbenennung vom Zwischenstand ${INTERIM_COMMIT}: Volumes, Container, Netz, /opt, systemd, Wächter, Domain"
setup_interim_world "${WORK}/rueckweg"
check "Ausgangslage: Wächter des Zwischenstands läuft" "host_guard_timer_active && [[ -x '${MM_SBIN_DIR}/${INTERIM_APP}-guard' ]]"
bash "${W}/opt/${INTERIM_APP}/update.sh" >"${W}/out.txt" 2>&1
code=$?
check "endet ohne Fehler" "[[ ${code} == 0 ]]"
check "Status done im MoinMorni-Volume" "grep -q '\"state\":\"done\"' '${NEW_DATA}/update/status.json'"
check "Datenbank übernommen (beim Start umbenannt), nichts verloren" "[[ \$(cat '${NEW_DATA}/${APP}.db') == db-zwischen && ! -e '${NEW_DATA}/${INTERIM_APP}.db' ]]"
check "Einrichtungs-Code gilt weiter" "[[ \$(cat '${NEW_DATA}/setup-code') == MM-ABCD-1234 ]]"
check "Owner-Konto (Datenbank des Motors) unverändert" "[[ \$(cat '${NEW_MOTOR}/mornihosting.db') == 'owner=philip passwort-hash=argon2' ]]"
check "Welten im Motor-Volume" "[[ \$(cat '${NEW_MOTOR}/servers/x/level.dat') == welt ]]"
check "Updater-Teil fürs Panel umgezogen, Protokoll dabei" "[[ -f '${NEW_DATA}/update/agent.json' ]] && grep -q 'Daten liegen in den Volumes' '${NEW_DATA}/update/log.txt'"
check "Rechte des Volume-Ordners übernommen" "[[ \$(stat -c %a '${NEW_DATA}') == 750 ]]"
check "Volumes unter dem Zwischen-Namen weg" "[[ ! -e '${INTERIM_DATA}' && ! -e '${INTERIM_MOTOR}' ]]"
check "Container unter dem Zwischen-Namen weg, MoinMorni läuft" "[[ ! -e '${W}/vol/containers/${INTERIM_APP}' && ! -e '${W}/vol/containers/${INTERIM_APP}-motor' && -f '${W}/vol/containers/${APP}' && -f '${W}/vol/containers/${APP}-motor' ]]"
check "erst angehalten, dann entfernt" "grep -q 'docker stop ${INTERIM_APP} ${INTERIM_APP}-motor' '${FAKE_LOG}' && grep -q 'docker rm -f ${INTERIM_APP} ' '${FAKE_LOG}'"
check "Wächter des Zwischenstands ruhte während des Updates, Sperren danach weg" "grep -q 'sperre-zwischen=da' '${FAKE_LOG}' && [[ ! -e '${MM_UPDATE_LOCK}' && ! -e '${MM_INTERIM_UPDATE_LOCK}' ]]"
check "Minecraft-Server im Netz des Zwischenstands: Motor und MoinMorni hängen sich an" "grep -q 'network connect ${INTERIM_APP}-mc ${APP}\$' '${FAKE_LOG}' && grep -q 'network connect ${INTERIM_APP}-mc ${APP}-motor' '${FAKE_LOG}'"
check "Installation liegt wieder in <opt>/${APP}" "[[ -d '${W}/opt/${APP}/.git' && ! -e '${W}/opt/${INTERIM_APP}' ]]"
check "Domain in der .env: ${REPO} (vor dem Neustart), Geheimnisse unverändert" "grep -qx 'MM_DOMAIN=${REPO}' '${W}/opt/${APP}/.env' && grep -qx 'MM_SECRET=geheim-1' '${W}/opt/${APP}/.env' && grep -qx 'MM_MOTOR_TOKEN=mh_schluessel' '${W}/opt/${APP}/.env' && grep -q 'domain=${REPO}' '${FAKE_LOG}' && [[ \$(stat -c %a '${W}/opt/${APP}/.env') == 600 ]]"
check "Updates im Panel folgen dem installierten Branch (${INTERIM_BRANCH}), .env bleibt nur für root" "grep -qx 'MM_UPDATE_BRANCH=${INTERIM_BRANCH}' '${W}/opt/${APP}/.env' && [[ \$(grep -c '^MM_UPDATE_BRANCH=' '${W}/opt/${APP}/.env') == 1 ]] && [[ \$(stat -c %a '${W}/opt/${APP}/.env') == 600 ]]"
check "systemd: Einheiten auf das Volume und den Ordner von MoinMorni" "grep -qx 'PathExists=${NEW_DATA}/update/request.json' '${MM_SYSTEMD_DIR}/${APP}-update.path' && grep -qx 'ExecStart=${W}/opt/${APP}/update.sh' '${MM_SYSTEMD_DIR}/${APP}-update.service'"
check "systemd: Einheiten des Zwischenstands weg, MoinMorni eingeschaltet" "[[ ! -e '${MM_SYSTEMD_DIR}/${INTERIM_APP}-update.path' && ! -e '${MM_SYSTEMD_DIR}/${INTERIM_APP}-update.service' ]] && grep -q 'systemctl enable --now ${APP}-update.path' '${FAKE_LOG}' && grep -q 'systemctl disable --now ${INTERIM_APP}-update.path' '${FAKE_LOG}'"
check "Befehl ${APP}-update statt des alten" "[[ \$(readlink '${MM_BIN_DIR}/${APP}-update') == '${W}/opt/${APP}/update.sh' && ! -e '${MM_BIN_DIR}/${INTERIM_APP}-update' && ! -L '${MM_BIN_DIR}/${INTERIM_APP}-update' ]]"
check "Sicherungen umgezogen, neue Sicherung dabei" "[[ -f '${MM_BACKUP_DIR}/20261116-170000-v0.9.8/stand.txt' && ! -e '${W}/var-backups/${INTERIM_APP}' ]] && ls '${MM_BACKUP_DIR}'/*/${APP}/${INTERIM_APP}.db >/dev/null"
check "Git zeigt wieder aufs Repo ${REPO}" "[[ \$(git -C '${W}/opt/${APP}' remote get-url origin) == '${W}/gh/pmornhart/${REPO}' ]]"
check "Wächter: MoinMorni-Wächter läuft, mit Namen, Volume und Ordner von MoinMorni" "systemctl is-active --quiet ${APP}-guard.timer && grep -q 'export MH_BRAND=MoinMorni' '${MM_SBIN_DIR}/${APP}-guard' && grep -q 'export MH_DATA_VOLUME=${APP}-motor-data' '${MM_SBIN_DIR}/${APP}-guard' && grep -q \"export MH_INSTALL_DIR=${W}/opt/${APP}\" '${MM_SBIN_DIR}/${APP}-guard'"
check "Wächter des Zwischenstands aus, Zustand und Protokoll umgezogen" "grep -q 'systemctl disable --now ${INTERIM_APP}-guard.timer' '${FAKE_LOG}' && [[ \$(cat '${MM_VAR_LIB}/${APP}/dns-failures') == 3 && ! -e '${MM_VAR_LIB}/${INTERIM_APP}' ]] && grep -q 'Wächter läuft' '${MM_VAR_LOG}/${APP}-guard.log'"
check "Host-Wächter (alte Namen): Timer gilt als laufend" "host_guard_timer_active"
check "Host-Wächter (alte Namen): Meldung landet im Motor-Volume von MoinMorni" "host_guard_event >/dev/null 2>&1 && grep -q 'Container neu gestartet' '${NEW_MOTOR}/guard/events.jsonl' && grep -q 'alte Meldung' '${NEW_MOTOR}/guard/events.jsonl'"
code_again=0
mkdir -p "${NEW_DATA}/update" && echo '{"at":"2026-11-16T00:00:00Z","by":"test","motor":"pinned"}' >"${NEW_DATA}/update/request.json"
bash "${W}/opt/${APP}/update.sh" >"${W}/out2.txt" 2>&1 || code_again=$?
check "nächstes Update: normal, nichts mehr umzuziehen, Hilfen für den Host-Wächter bleiben" "[[ ${code_again} == 0 ]] && grep -q 'Schon aktuell' '${W}/out2.txt' && host_guard_timer_active && [[ -L '${MM_SBIN_DIR}/${INTERIM_APP}-guard' ]]"

echo " 9) Rückbenennung klappt nicht (neue Fassung antwortet nicht) → alles zurück an den Platz des Zwischenstands"
setup_interim_world "${WORK}/rueckweg-zurueck"
touch "${W}/vol/unhealthy"
bash "${W}/opt/${INTERIM_APP}/update.sh" >"${W}/out.txt" 2>&1
code=$?
check "endet mit Fehler" "[[ ${code} != 0 ]]"
check "Status rolled_back im Volume des Zwischenstands" "grep -q '\"state\":\"rolled_back\"' '${INTERIM_DATA}/update/status.json'"
check "Daten zurück, Datenbank aus der Sicherung (keine zweite unter dem Namen MoinMorni)" "[[ \$(cat '${INTERIM_DATA}/${INTERIM_APP}.db') == db-zwischen && ! -e '${INTERIM_DATA}/${APP}.db' && -f '${INTERIM_DATA}/setup-code' && \$(cat '${INTERIM_MOTOR}/servers/x/level.dat') == welt && -f '${INTERIM_MOTOR}/mornihosting.db' ]]"
check "Volumes und Container von MoinMorni weg" "[[ ! -e '${NEW_DATA}' && ! -e '${NEW_MOTOR}' && ! -e '${W}/vol/containers/${APP}' ]]"
check "Zwischen-Fassung läuft wieder (Gesundheit geprüft)" "[[ -f '${W}/vol/old-running' && -f '${W}/vol/containers/${INTERIM_APP}' ]] && grep -q 'Alter Stand läuft wieder' '${W}/out.txt'"
check "Ordner, systemd, Befehl und Wächter unverändert" "[[ -d '${W}/opt/${INTERIM_APP}/.git' && ! -e '${W}/opt/${APP}' && -f '${MM_SYSTEMD_DIR}/${INTERIM_APP}-update.path' && ! -e '${MM_SYSTEMD_DIR}/${APP}-update.path' && -L '${MM_BIN_DIR}/${INTERIM_APP}-update' ]] && host_guard_timer_active && [[ ! -L '${MM_SBIN_DIR}/${INTERIM_APP}-guard' ]]"

printf '\n %s bestanden, %s fehlgeschlagen\n' "${PASS}" "${FAIL}"
[[ ${FAIL} -eq 0 ]]
