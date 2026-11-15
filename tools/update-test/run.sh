#!/usr/bin/env bash
# Test für update.sh: echtes Git (Ursprung + Klon mit Motor-Untermodul), nachgebautes Docker.
#   bash tools/update-test/run.sh
# Abläufe: Update klappt · Bauen scheitert · neue Fassung startet nicht (Rückweg mit Datenbank) · schon aktuell.
#
# Verfasst mit Claude 🤖
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$(cd "${HERE}/../.." && pwd)/update.sh"
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

# ---------- Nachgebautes Docker: Volumes in WORK, build/up/exec nach Schaltern ----------
mkdir -p "${WORK}/bin" "${WORK}/vol/data" "${WORK}/vol/motor"
cat >"${WORK}/bin/docker" <<'DOCKER'
#!/usr/bin/env bash
echo "docker $*" >>"${FAKE_LOG}"
case "$1 $2" in
  "volume inspect")
    [[ "$*" == *moinmorni-motor-data* ]] && echo "${FAKE_VOL}/motor" || echo "${FAKE_VOL}/data"
    exit 0 ;;
  "compose build") [[ -f "${FAKE_VOL}/build-fails" ]] && exit 1; exit 0 ;;
  "compose exec") [[ -f "${FAKE_VOL}/unhealthy" && ! -f "${FAKE_VOL}/old-running" ]] && exit 1; exit 0 ;;
  "compose up")
    # Neue Fassung = Datei zeigt die gebaute Version; nach dem Rückweg läuft wieder die alte.
    if [[ "${MM_BUILD_VERSION:-}" == "${MM_UPDATE_FROM:-x}" ]]; then touch "${FAKE_VOL}/old-running"; else rm -f "${FAKE_VOL}/old-running"; fi
    echo "${MM_BUILD_VERSION:-}" >"${FAKE_VOL}/running-version"
    exit 0 ;;
esac
exit 0
DOCKER
chmod +x "${WORK}/bin/docker"
export PATH="${WORK}/bin:${PATH}" FAKE_LOG="${WORK}/docker.log" FAKE_VOL="${WORK}/vol"
export MM_BACKUP_DIR="${WORK}/backups" MM_HEALTH_TRIES=2 MM_HEALTH_SECONDS=0

# ---------- Echtes Git: Motor-Ursprung, MoinMorni-Ursprung mit Untermodul, Klon als /opt/moinmorni ----------
git_q init -q -b main "${WORK}/motor-origin"
echo v1 >"${WORK}/motor-origin/motor.txt"
git_q -C "${WORK}/motor-origin" add . && git_q -C "${WORK}/motor-origin" commit -qm "Motor 1"
git_q init -q -b main "${WORK}/mm-origin"
cp "${SCRIPT}" "${WORK}/mm-origin/update.sh"
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
status() { cat "${WORK}/vol/data/update/status.json" 2>/dev/null; }
run_update() {
  mkdir -p "${WORK}/vol/data/update"
  echo '{"at":"2026-11-14T00:00:00Z","by":"test","motor":"pinned"}' >"${WORK}/vol/data/update/request.json"
  bash "${INSTALL}/update.sh" >"${WORK}/out.txt" 2>&1
  echo $?
}

echo " 1) Update klappt"
echo "db-alt" >"${WORK}/vol/data/moinmorni.db"
echo "motor-db" >"${WORK}/vol/motor/mornihosting.db"
mkdir -p "${WORK}/vol/motor/servers/x" && echo welt >"${WORK}/vol/motor/servers/x/level.dat"
OLD="$(git -C "${INSTALL}" rev-parse HEAD)"
new_commit "Neu 1"
code="$(run_update)"
check "endet ohne Fehler" "[[ ${code} == 0 ]]"
check "Status done mit von/nach" "status | grep -q '\"state\":\"done\"' && status | grep -q '\"from\":\"v0.0.1-0-g'"
check "Code ist neu" "[[ \$(git -C '${INSTALL}' rev-parse HEAD) != ${OLD} ]]"
check "Auftrag weg" "[[ ! -f '${WORK}/vol/data/update/request.json' ]]"
check "Sicherung mit beiden Datenbanken, ohne Welten" "ls '${WORK}'/backups/*/moinmorni/moinmorni.db >/dev/null && ls '${WORK}'/backups/*/motor/mornihosting.db >/dev/null && ! ls -d '${WORK}'/backups/*/motor/servers >/dev/null 2>&1"
check "Protokoll fürs Panel" "grep -q 'Update fertig' '${WORK}/vol/data/update/log.txt'"
check "gebaut wurden MoinMorni und Motor" "grep -q 'compose build --quiet moinmorni motor' '${FAKE_LOG}'"

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
echo "db-vorher" >"${WORK}/vol/data/moinmorni.db"
touch "${WORK}/vol/unhealthy"
: >"${FAKE_LOG}"
code="$(run_update)"
check "endet mit Fehler" "[[ ${code} != 0 ]]"
check "Status rolled_back, Version zurück" "status | grep -q '\"state\":\"rolled_back\"' && status | grep -q \"\\\"to\\\":\\\"\$(status | sed 's/.*\"from\":\"\\([^\"]*\\)\".*/\\1/')\\\"\""
check "Code wieder alt" "[[ \$(git -C '${INSTALL}' rev-parse HEAD) == ${OLD} ]]"
check "Datenbank aus der Sicherung" "[[ \$(cat '${WORK}/vol/data/moinmorni.db') == db-vorher ]]"
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
mkdir -p "${WORK}/vol/data/update"
echo '{"at":"2026-11-14T00:00:00Z","by":"test","motor":"main"}' >"${WORK}/vol/data/update/request.json"
bash "${INSTALL}/update.sh" >"${WORK}/out.txt" 2>&1
check "Motor-Datei ist neu" "[[ \$(cat '${INSTALL}/vendor/mornihosting/motor.txt') == v2 ]]"
check "Status done" "status | grep -q '\"state\":\"done\"'"

echo " 6) Links im Update-Ordner (vom Container gelegt) werden nicht verfolgt"
echo "geheim" >"${WORK}/host-datei"
rm -f "${WORK}/vol/data/update/log.txt" "${WORK}/vol/data/update/status.json"
ln -s "${WORK}/host-datei" "${WORK}/vol/data/update/log.txt"
ln -s "${WORK}/host-datei" "${WORK}/vol/data/update/status.json"
new_commit "Sechs"
code="$(run_update)"
check "endet ohne Fehler" "[[ ${code} == 0 ]]"
check "fremde Datei unverändert" "[[ \$(cat '${WORK}/host-datei') == geheim ]]"
check "Protokoll und Status sind eigene Dateien" "[[ ! -L '${WORK}/vol/data/update/log.txt' && ! -L '${WORK}/vol/data/update/status.json' ]] && grep -q 'Update fertig' '${WORK}/vol/data/update/log.txt'"
rm -rf "${WORK}/vol/data/update"
mkdir -p "${WORK}/anderswo"
ln -s "${WORK}/anderswo" "${WORK}/vol/data/update"
bash "${INSTALL}/update.sh" >"${WORK}/out.txt" 2>&1
check "Update-Ordner als Link → Abbruch, nichts geschrieben" "[[ -z \$(ls -A '${WORK}/anderswo') ]] && grep -q 'Verweis' '${WORK}/out.txt'"

printf '\n %s bestanden, %s fehlgeschlagen\n' "${PASS}" "${FAIL}"
[[ ${FAIL} -eq 0 ]]
