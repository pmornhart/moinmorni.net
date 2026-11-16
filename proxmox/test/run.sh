#!/usr/bin/env bash
# Test für proxmox/morninet.sh – ohne echten Proxmox:
#
#   sudo bash proxmox/test/run.sh
#
# Nachgebaut sind die Proxmox-Befehle (pct, pveam, pvesm, pvesh, pveversion, modprobe, whiptail) und der Container:
# „pct exec“ läuft in einem eigenen Mount-Namensraum, in dem /opt, /root, /etc/apt und /etc/os-release Testordner
# sind – mit nachgebautem apt-get, dpkg, systemctl, hostname, curl, git, docker und netbird. install.sh läuft echt.
# Der Proxmox-Rechner selbst (Version, Kerne, RAM, freier Platz, Bridges, Gateway) ist je Fall einstellbar – so
# werden auch die Prüfungen vorab (Proxmox 7/8/9, kleiner Rechner) und die erweiterten Einstellungen getestet.
#
# Geprüft wird auch, dass Bot-Token und NetBird-Key nie in Programm-Argumenten, in der Ausgabe oder in liegen
# gebliebenen Dateien auftauchen: Alle wichtigen Befehle laufen über kleine Wrapper, die ihre Argumente
# mitschreiben, und ein Wächter durchsucht währenddessen /proc/*/cmdline.
#
# Braucht root (für unshare --mount), script (util-linux) und openssl. Arbeitet in einem Temp-Ordner; nur
# /run/morninet-setup.* legt das Skript selbst kurz an und löscht es wieder (wird mitgeprüft).
#
# Verfasst mit Claude 🤖

# Die Welt-Umgebung (PATH usw.) gilt bewusst nur im Unter-Prozess, der das Skript startet:
# shellcheck disable=SC2030,SC2031
# Ohne -e: Eine fehlgeschlagene Prüfung soll gezählt werden, nicht den ganzen Test abbrechen.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${REPO}/proxmox/morninet.sh"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/morninet-proxmox-test.XXXXXX")"
SYS_PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
WRAPPED=(awk sed grep cut tr head tail sort mktemp rm cat chmod cp mv install bash sh openssl tee mkdir seq env stat)
PASSED=0
FAILED=0

GN=$'\e[32m'
RD=$'\e[31m'
BL=$'\e[36m'
CL=$'\e[0m'

# KEEP_TMP=1 lässt die nachgebauten Welten zum Nachsehen liegen.
cleanup() {
  if [[ -n "${KEEP_TMP:-}" ]]; then echo " Test-Ordner: ${TMP}"; else rm -rf "${TMP}"; fi
}
trap cleanup EXIT

if [[ "${EUID}" -ne 0 ]]; then
  echo "Bitte als root starten (der nachgebaute Container braucht unshare --mount)." >&2
  exit 1
fi
for tool in unshare script openssl; do
  command -v "${tool}" >/dev/null 2>&1 || {
    echo "${tool} fehlt" >&2
    exit 1
  }
done

ok() {
  PASSED=$((PASSED + 1))
  printf '   %s✔%s %s\n' "${GN}" "${CL}" "$1"
}
bad() {
  FAILED=$((FAILED + 1))
  printf '   %s✖ %s%s\n' "${RD}" "$1" "${CL}"
}
# check <Beschreibung> <Befehl …> – Ausgabe des Befehls nur bei einem Fehlschlag zeigen.
check() {
  local what="$1" out
  shift
  if out="$("$@" 2>&1)"; then
    ok "${what}"
  else
    bad "${what}"
    if [[ -n "${out}" ]]; then printf '%s\n' "${out}" | sed 's/^/     /' | head -n 5; fi
  fi
}
# Inhalt einer Datei (leer, wenn es sie nicht gibt).
content() { if [[ -f "$1" ]]; then printf '%s' "$(<"$1")"; fi; }
has() { grep -F -- "$2" "$1" >/dev/null 2>&1; }
lacks() { ! has "$1" "$2"; }
# Wert aus einer .env lesen – nur mit Bash-Befehlen, damit kein Geheimnis in Programm-Argumenten landet.
env_value() {
  local line
  while IFS= read -r line; do
    if [[ "${line%%=*}" == "$2" ]]; then
      printf '%s' "${line#*=}"
      return 0
    fi
  done <"$1"
  return 1
}
same() { [[ "$1" == "$2" ]]; }
file_mode() { stat -c '%a' "$1" 2>/dev/null; }

# Zufällige Test-Geheimnisse (im Format echter Werte), damit kein Token-ähnlicher Text im Repo steht.
TOKEN="$(openssl rand -hex 14).$(openssl rand -hex 4).$(openssl rand -hex 14)"
NB_KEY="$(openssl rand -hex 16 | tr '[:lower:]' '[:upper:]' | sed -E 's/^(.{8})(.{4})(.{4})(.{4})(.{12})$/\1-\2-\3-\4-\5/')"

# ---------------------------------------------------------------------------------------------------------------
# Nachgebaute Welt: Proxmox-Host + Container
# ---------------------------------------------------------------------------------------------------------------

# Programme für den nachgebauten Container: alles von der Test-Maschine, nur nicht, was ein frischer Debian-Container
# noch nicht hat (Docker, NetBird, whiptail …) oder was nachgebaut ist.
mkdir -p "${TMP}/sysbin"
for program in /usr/sbin/* /usr/bin/*; do
  case "${program##*/}" in
    docker* | containerd* | ctr | runc | netbird* | whiptail | pct | pveam | pvesm | pvesh | git | curl | apt-get | \
      dpkg | systemctl | hostname | getent | timedatectl) ;;
    *) ln -sf "${program}" "${TMP}/sysbin/${program##*/}" ;;
  esac
done

# Wrapper: schreibt Name + Argumente ins Protokoll und startet das echte Programm.
make_wrapper() {
  local dir="$1" name="$2" log="$3" real
  real="$(PATH="${SYS_PATH}" command -v "${name}")" || return 0
  cat >"${dir}/${name}" <<EOF
#!/bin/bash
printf '%s %s\n' '${name}' "\$*" >>'${log}'
exec '${real}' "\$@"
EOF
  chmod 755 "${dir}/${name}"
}

# fake <Datei> – schreibt ein nachgebautes Programm (stdin), @W@ wird durch den Welt-Ordner ersetzt.
fake() {
  local target="$1" body
  body="$(cat)"
  printf '%s\n' "${body//@W@/${W}}" >"${target}"
  chmod 755 "${target}"
}

# host_ram_gb <gesamt> <frei> – Arbeitsspeicher des nachgebauten Proxmox-Rechners (wie /proc/meminfo, in kB).
host_ram_gb() {
  printf 'MemTotal:       %d kB\nMemFree:        1024 kB\nMemAvailable:   %d kB\n' \
    $(($1 * 1024 * 1024)) $(($2 * 1024 * 1024)) >"${W}/state/meminfo"
}

new_world() {
  W="${TMP}/$1"
  mkdir -p "${W}"/{bin,ctbin,ctlib,log,state,ct,pve/lxc,modules-load.d}
  : >"${W}/log/argv.log"
  : >"${W}/log/ct.log"
  : >"${W}/log/proc-hits"
  : >"${W}/state/used-ids"
  echo 100 >>"${W}/state/used-ids"
  echo 105 >"${W}/state/nextid"
  printf 'system          debian-12-standard_12.12-1_amd64.tar.zst\nsystem          debian-13-standard_13.1-2_amd64.tar.zst\nsystem          ubuntu-24.04-standard_24.04-2_amd64.tar.zst\n' \
    >"${W}/state/templates.available"
  : >"${W}/state/templates.local"
  # Der nachgebaute Proxmox-Rechner: Version, 16 Kerne, 64 GB RAM, 325 GB frei auf local-lvm, Bridges vmbr0 und vmbr1.
  echo "pve-manager/9.0.11/3bf5476b8a4699e2 (running kernel: 6.14.11-4-pve)" >"${W}/state/pveversion"
  echo 16 >"${W}/state/cpus"
  host_ram_gb 64 55
  echo 341184512 >"${W}/state/lvm-free-kb"
  mkdir -p "${W}/sysnet/vmbr0/bridge" "${W}/sysnet/vmbr1/bridge" "${W}/sysnet/eth0"
  printf '%s\n' "${TOKEN}" "${NB_KEY}" >"${W}/needles"
  printf '%s' "${NB_KEY}" >"${W}/state/expected-netbird-key"
  local tool
  for tool in "${WRAPPED[@]}"; do
    make_wrapper "${W}/bin" "${tool}" "${W}/log/argv.log"
    make_wrapper "${W}/ctbin" "${tool}" "${W}/log/argv.log"
  done
  write_host_fakes
  write_container_fakes
}

write_host_fakes() {
  fake "${W}/bin/pveversion" <<'EOF'
#!/bin/bash
cat @W@/state/pveversion
EOF

  fake "${W}/bin/nproc" <<'EOF'
#!/bin/bash
cat @W@/state/cpus
EOF

  # Nur die Frage nach dem Standard-Gateway (für eine feste IP) ist nachgebaut.
  fake "${W}/bin/ip" <<'EOF'
#!/bin/bash
printf 'ip %s\n' "$*" >>@W@/log/argv.log
if [[ "$*" == "-4 route show default" ]]; then
  echo "default via 192.0.2.1 dev vmbr0 proto kernel onlink"
  exit 0
fi
echo "ip (Test): nicht nachgebaut: $*" >&2
exit 2
EOF

  fake "${W}/bin/pvesh" <<'EOF'
#!/bin/bash
printf 'pvesh %s\n' "$*" >>@W@/log/argv.log
if [[ "$1 $2" == "get /cluster/nextid" ]]; then
  if [[ "${3:-}" == --vmid ]]; then
    if grep -qx -- "$4" @W@/state/used-ids; then
      echo "400 Parameter verification failed. vmid: VM $4 already exists" >&2
      exit 255
    fi
    echo "$4"
    exit 0
  fi
  cat @W@/state/nextid
  exit 0
fi
echo "pvesh (Test): nicht nachgebaut: $*" >&2
exit 2
EOF

  fake "${W}/bin/pvesm" <<'EOF'
#!/bin/bash
printf 'pvesm %s\n' "$*" >>@W@/log/argv.log
if [[ "$1" == status ]]; then
  echo "Name             Type     Status           Total            Used       Available        %"
  if [[ "$*" != *rootdir* ]]; then echo "local             dir     active        98497780        12345678        86152102   12.53%"; fi
  echo "local-lvm     lvmthin     active       365760512        24576000       $(cat @W@/state/lvm-free-kb)    6.72%"
  exit 0
fi
exit 2
EOF

  fake "${W}/bin/pveam" <<'EOF'
#!/bin/bash
printf 'pveam %s\n' "$*" >>@W@/log/argv.log
case "$1" in
  update) echo "update successful" ;;
  available) cat @W@/state/templates.available ;;
  list)
    echo "NAME                                                         SIZE"
    while IFS= read -r t; do [[ -n "$t" ]] && printf '%s:vztmpl/%s   120.29MB\n' "$2" "$t"; done <@W@/state/templates.local
    ;;
  download) echo "$3" >>@W@/state/templates.local ;;
  *) exit 2 ;;
esac
EOF

  fake "${W}/bin/modprobe" <<'EOF'
#!/bin/bash
printf 'modprobe %s\n' "$*" >>@W@/log/argv.log
EOF

  # Der nachgebaute Container: eigener Mount-Namensraum, Umgebung leer wie bei "pct exec" (lxc-attach --clear-env).
  fake "${W}/bin/pct" <<'EOF'
#!/bin/bash
set -euo pipefail
W=@W@
{ printf '%q ' pct "$@"; printf '\n'; } >>"$W/log/pct.log"
printf 'pct %s\n' "$*" >>"$W/log/argv.log"
cmd="$1"
shift
case "${cmd}" in
  create)
    id="$1" tmpl="$2"
    shift 2
    if grep -qx -- "${id}" "$W/state/used-ids"; then echo "CT ${id} already exists" >&2; exit 255; fi
    echo "${id}" >>"$W/state/used-ids"
    ct="$W/ct/${id}"
    mkdir -p "${ct}/opt" "${ct}/root" "${ct}/etc-apt/sources.list.d"
    chmod 700 "${ct}/root"
    case "${tmpl}" in
      *debian-13-*) ver=13 code=trixie ;;
      *debian-12-*) ver=12 code=bookworm ;;
      *) ver=0 code=unbekannt ;;
    esac
    printf 'PRETTY_NAME="Debian GNU/Linux %s (%s)"\nID=debian\nVERSION_ID="%s"\nVERSION_CODENAME=%s\n' \
      "${ver}" "${code}" "${ver}" "${code}" >"${ct}/os-release"
    {
      echo "ostemplate: ${tmpl}"
      while (($#)); do printf '%s: %s\n' "${1#--}" "$2"; shift 2; done
    } >"$W/pve/lxc/${id}.conf"
    ;;
  config)
    [[ -f "$W/pve/lxc/$1.conf" ]] || { echo "Configuration file 'nodes/pve/lxc/$1.conf' does not exist" >&2; exit 2; }
    cat "$W/pve/lxc/$1.conf"
    ;;
  start)
    [[ -d "$W/ct/$1" ]] || { echo "CT $1 does not exist" >&2; exit 2; }
    touch "$W/ct/$1/running"
    ;;
  push)
    id="$1" src="$2" dst="$3"
    shift 3
    perms=""
    if [[ "${1:-}" == --perms ]]; then perms="$2"; fi
    case "${dst}" in /root/* | /opt/*) ;; *) echo "pct push (Test): Ziel ${dst} nicht nachgebaut" >&2; exit 2 ;; esac
    target="$W/ct/${id}${dst}"
    cp "${src}" "${target}"
    if [[ -n "${perms}" ]]; then chmod "${perms}" "${target}"; fi
    echo "$(stat -c '%a' "${target}") ${dst}" >>"$W/log/pushed"
    cp "${target}" "$W/state/pushed.${dst##*/}"
    ;;
  exec)
    id="$1"
    shift
    if [[ "${1:-}" == -- ]]; then shift; fi
    ct="$W/ct/${id}"
    [[ -f "${ct}/running" ]] || { echo "CT ${id} not running" >&2; exit 2; }
    # shellcheck disable=SC2016 # läuft in der inneren Bash
    exec unshare --mount --propagation private -- /bin/bash -c '
      set -e
      ct="$1" w="$2"
      shift 2
      mount --bind "${ct}/opt" /opt
      mount --bind "${ct}/root" /root
      mount --bind "${ct}/etc-apt" /etc/apt
      mount --bind "${ct}/os-release" /etc/os-release
      cd /
      # PATH ohne /usr/bin: die Programme der Test-Maschine kommen aus sysbin (ohne Docker, NetBird & Co.).
      exec /usr/bin/env -i PATH="${w}/ctbin:${w}/../sysbin" container=lxc LANG=C.UTF-8 "$@"
    ' pct-exec "${ct}" "$W" "$@"
    ;;
  *)
    echo "pct (Test): nicht nachgebaut: ${cmd}" >&2
    exit 2
    ;;
esac
EOF
}

write_container_fakes() {
  fake "${W}/ctbin/apt-get" <<'EOF'
#!/bin/bash
printf 'apt-get %s\n' "$*" >>@W@/log/ct.log
if [[ " $* " == *" docker-ce "* ]]; then
  if [[ ! -f /etc/apt/sources.list.d/docker.sources ]]; then
    echo "E: Unable to locate package docker-ce" >&2
    exit 100
  fi
  install -m 755 @W@/ctlib/docker @W@/ctbin/docker
fi
exit 0
EOF

  fake "${W}/ctbin/dpkg" <<'EOF'
#!/bin/bash
[[ "$1" == --print-architecture ]] && echo amd64
EOF

  fake "${W}/ctbin/systemctl" <<'EOF'
#!/bin/bash
printf 'systemctl %s\n' "$*" >>@W@/log/ct.log
case "$1" in
  is-active) [[ "${*: -1}" == netbird && -f @W@/state/netbird-active ]] ;;
  enable) touch "@W@/state/enabled-${*: -1}" ;;
  *) exit 0 ;;
esac
EOF

  fake "${W}/ctbin/hostname" <<'EOF'
#!/bin/bash
if [[ "${1:-}" == -I ]]; then echo "192.0.2.50 "; else echo morninet; fi
EOF

  fake "${W}/ctbin/getent" <<'EOF'
#!/bin/bash
[[ "$1" == hosts ]] && echo "192.0.2.80      $2"
EOF

  fake "${W}/ctbin/timedatectl" <<'EOF'
#!/bin/bash
echo Europe/Berlin
EOF

  fake "${W}/ctbin/curl" <<'EOF'
#!/bin/bash
out="" url=""
while (($#)); do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
printf 'curl %s -> %s\n' "${url}" "${out:-stdout}" >>@W@/log/ct.log
[[ -n "${out}" ]] || out=/dev/stdout
case "${url}" in
  https://download.docker.com/linux/debian/gpg)
    printf -- '-----BEGIN PGP PUBLIC KEY BLOCK-----\n(Test)\n-----END PGP PUBLIC KEY BLOCK-----\n' >"${out}" ;;
  https://pkgs.netbird.io/install.sh) cat @W@/ctlib/netbird-install.sh >"${out}" ;;
  *) echo "curl (Test): keine Verbindung zu ${url}" >&2; exit 7 ;;
esac
EOF

  # git clone holt die echten install.sh, .env.example und docker-compose.yml aus diesem Repo.
  fake "${W}/ctbin/git" <<EOF
#!/bin/bash
printf 'git %s\n' "\$*" >>@W@/log/ct.log
if [[ "\$1" == clone ]]; then
  shift
  branch="" recurse=no pos=()
  while ((\$#)); do
    case "\$1" in
      --branch) branch="\$2"; shift 2 ;;
      --recurse-submodules) recurse=yes; shift ;;
      -*) shift ;;
      *) pos+=("\$1"); shift ;;
    esac
  done
  dir="\${pos[1]}"
  mkdir -p "\${dir}/.git" "\${dir}/vendor/mornihosting"
  cp '${REPO}/install.sh' '${REPO}/.env.example' '${REPO}/docker-compose.yml' "\${dir}/"
  printf 'url=%s\nbranch=%s\nrecurse=%s\ndir=%s\n' "\${pos[0]}" "\${branch}" "\${recurse}" "\${dir}" >@W@/state/clone
  exit 0
fi
if [[ "\$1" == -C ]]; then shift 2; fi
case "\$1" in
  rev-list) echo 42 ;;
  rev-parse) echo abc1234 ;;
  *) exit 0 ;;
esac
EOF

  fake "${W}/ctlib/docker" <<'EOF'
#!/bin/bash
printf 'docker %s\n' "$*" >>@W@/log/ct.log
if [[ -n "${MM_DISCORD_TOKEN+gesetzt}" ]]; then echo "docker $1" >>@W@/log/token-in-env; fi
case "$1" in
  info) echo "Server Version: 29.0.0 (Test)" ;;
  exec) [[ "$*" == "exec morninet cat /data/setup-code" ]] && echo "MM-TEST-4711" ;;
  compose)
    shift
    case "$1" in
      version) echo "Docker Compose version v2.40.0 (Test)" ;;
      build)
        if [[ -f @W@/state/fail-build ]]; then echo "build kaputt (Test)" >&2; exit 1; fi
        [[ -f .env ]] || { echo "compose (Test): .env fehlt" >&2; exit 1; }
        ;;
      exec)
        shift
        [[ "$1" == -T ]] && shift
        svc="$1"
        shift
        case "${svc} $*" in
          "motor node /app/server/dist/cli.js service-token morninet") echo "mh_testdienstschluessel0123456789" ;;
          "morninet node -e"*"r.json()"*) echo true ;;
          "morninet cat /data/setup-code") echo "MM-TEST-4711" ;;
        esac
        ;;
    esac
    ;;
esac
exit 0
EOF

  fake "${W}/ctlib/netbird-install.sh" <<'EOF'
#!/bin/sh
cp @W@/ctlib/netbird @W@/ctbin/netbird
chmod 755 @W@/ctbin/netbird
echo "NetBird installiert (Test)"
EOF

  fake "${W}/ctlib/netbird" <<'EOF'
#!/bin/bash
printf 'netbird %s\n' "$*" >>@W@/log/ct.log
case "$1" in
  service)
    [[ "$2" == install ]] && touch @W@/state/netbird-service
    [[ "$2" == start ]] && touch @W@/state/netbird-active
    ;;
  up)
    [[ -f @W@/state/netbird-active ]] || { echo "dial unix /var/run/netbird.sock: no such file" >&2; exit 1; }
    if [[ "${NB_SETUP_KEY:-}" == "$(<@W@/state/expected-netbird-key)" ]]; then
      echo ok >@W@/state/netbird-up
      echo Connected
    else
      echo falsch >@W@/state/netbird-up
      echo "invalid setup key" >&2
      exit 1
    fi
    ;;
esac
EOF
}

with_whiptail() {
  printf '%s\n' "$@" >"${W}/state/whiptail.answers"
  fake "${W}/bin/whiptail" <<'EOF'
#!/bin/bash
printf 'whiptail %s\n' "$*" >>@W@/log/argv.log
printf '%s\n' "$*" >>@W@/log/whiptail.log
IFS= read -r answer <@W@/state/whiptail.answers || answer="<esc>"
tail -n +2 @W@/state/whiptail.answers >@W@/state/whiptail.rest
mv @W@/state/whiptail.rest @W@/state/whiptail.answers
[[ "${answer}" == "<esc>" ]] && exit 255
if [[ " $* " == *" --yesno "* ]]; then
  [[ "${answer}" == yes ]] && exit 0
  exit 1
fi
[[ "${answer}" == "<cancel>" ]] && exit 1
printf '%s' "${answer}" >&2
EOF
}

# Wächter: sucht die Geheimnisse in den Argumenten aller laufenden Programme.
watch_proc() {
  while [[ -f "${W}/state/watching" ]]; do
    grep -alF -f "${W}/needles" /proc/[0-9]*/cmdline >>"${W}/log/proc-hits" 2>/dev/null || true
    sleep 0.02
  done
}

# run_case plain|tty [VAR=Wert …] – startet morninet.sh in der Welt. Werte gehen per export (keine Argumente).
RC=0
run_case() {
  local mode="$1" watcher
  shift
  touch "${W}/state/watching"
  watch_proc &
  watcher=$!
  RC=0
  if [[ "${mode}" == plain ]]; then
    (
      export PATH="${W}/bin:${SYS_PATH}" PVE_LXC_CONF_DIR="${W}/pve/lxc" MODULES_LOAD_DIR="${W}/modules-load.d" \
        TUN_DEVICE=/dev/null HOST_MEMINFO="${W}/state/meminfo" HOST_NET_DIR="${W}/sysnet"
      for kv in "$@"; do export "${kv?}"; done
      exec /bin/bash "${SCRIPT}" </dev/null
    ) >"${W}/out.txt" 2>&1 || RC=$?
  else
    mkfifo "${W}/in"
    (
      export PATH="${W}/bin:${SYS_PATH}" PVE_LXC_CONF_DIR="${W}/pve/lxc" MODULES_LOAD_DIR="${W}/modules-load.d" \
        TUN_DEVICE=/dev/null HOST_MEMINFO="${W}/state/meminfo" HOST_NET_DIR="${W}/sysnet" SHELL=/bin/bash TERM=xterm
      for kv in "$@"; do export "${kv?}"; done
      exec script -qfec "/bin/bash ${SCRIPT}" /dev/null <"${W}/in"
    ) >"${W}/out.txt" 2>&1 &
    local runner=$!
    exec 7>"${W}/in"
    if declare -F feed >/dev/null; then feed; fi
    wait "${runner}" || RC=$?
    exec 7>&-
  fi
  rm -f "${W}/state/watching"
  wait "${watcher}" || true
}

# Für die einfache Eingabe ohne whiptail: wartet auf einen Text auf dem Bildschirm, dann tippt es die Antwort.
type_after() {
  local text="$1" answer="$2" i
  for ((i = 0; i < 200; i++)); do
    if grep -F -- "${text}" "${W}/out.txt" >/dev/null 2>&1; then
      sleep 0.4
      printf '%s\n' "${answer}" >&7
      return 0
    fi
    sleep 0.1
  done
  echo "   (Zeitüberschreitung beim Warten auf: ${text})"
  return 1
}

# Gemeinsame Prüfungen: Geheimnisse nirgends, wo sie nicht hingehören.
check_secrets_safe() {
  check "kein Geheimnis in Programm-Argumenten (Wrapper-Protokoll)" lacks_needles "${W}/log/argv.log"
  check "kein Geheimnis in Argumenten laufender Programme (/proc/*/cmdline)" test ! -s "${W}/log/proc-hits"
  check "kein Geheimnis in der Ausgabe" lacks_needles "${W}/out.txt"
  check "kein Geheimnis in pct-Aufrufen" lacks_needles "${W}/log/pct.log"
  check "keine Geheimnis-Datei im Container liegen geblieben" no_secret_files
  check "nichts unter /run/morninet-setup.* liegen geblieben" no_run_leftovers
  check "docker compose bekommt den Token nicht über die Umgebung" test ! -s "${W}/log/token-in-env"
}
lacks_needles() { ! grep -F -f "${W}/needles" "$1" >/dev/null 2>&1; }
no_secret_files() {
  local hits
  hits="$(grep -rlF -f "${W}/needles" "${W}/ct" 2>/dev/null | grep -v '/opt/morninet/\.env$' || true)"
  [[ -z "${hits}" ]] || {
    echo "     gefunden in: ${hits}"
    return 1
  }
}
no_run_leftovers() { ! compgen -G "/run/morninet-setup.*" >/dev/null; }
created() { grep -E "^pct create $1 " "${W}/log/pct.log" >/dev/null; }
# Wert im Aufruf „pct create“ (ungequotet aus dem Wrapper-Protokoll; in pct.log stehen Kommas als „\,“).
create_arg() { grep -E '^pct create ' "${W}/log/argv.log" | grep -F -- "$1" >/dev/null; }
not_created() { ! grep -E '^pct create ' "${W}/log/pct.log" >/dev/null 2>&1; }

show_output_on_failure() {
  if ((FAILED > FAILED_BEFORE)); then
    printf '   --- Ausgabe ---\n'
    sed 's/^/   | /' "${W}/out.txt" | tail -n 40
  fi
}

begin() {
  printf '\n %s%s%s\n' "${BL}" "$1" "${CL}"
  FAILED_BEFORE="${FAILED}"
  unset -f feed
}

# ---------------------------------------------------------------------------------------------------------------
printf '\n %sTest: proxmox/morninet.sh%s (ohne echten Proxmox)\n' "${BL}" "${CL}"

begin "Shellcheck"
if command -v shellcheck >/dev/null 2>&1; then
  check "proxmox/morninet.sh" env LANG=C.UTF-8 shellcheck "${SCRIPT}"
  check "install.sh" env LANG=C.UTF-8 shellcheck "${REPO}/install.sh"
  check "proxmox/test/run.sh" env LANG=C.UTF-8 shellcheck "${REPO}/proxmox/test/run.sh"
else
  echo "   (shellcheck nicht installiert – übersprungen)"
fi

# ---------------------------------------------------------------------------------------------------------------
begin "1. Alle Antworten per Umgebungsvariable (mit Token, ohne NetBird)"
new_world env-token
run_case plain CTID=120 MM_DOMAIN=netz.example "MM_DISCORD_TOKEN=${TOKEN}" NETBIRD_SETUP_KEY= MM_BRANCH=test-zweig
CT="${W}/ct/120"
check "läuft durch (Exit 0)" test "${RC}" -eq 0
check "fragt nichts" lacks "${W}/out.txt" "Unter welcher Nummer"
check "Container 120 angelegt" created 120
check "Debian 13 als Vorlage (geladen, weil noch nicht da)" has "${W}/log/argv.log" "pveam download local debian-13-standard_13.1-2_amd64.tar.zst"
for want in "--memory 32768" "--cores 8" "--swap 4096" "--rootfs local-lvm:100" "--unprivileged 1" \
  "--features nesting=1,keyctl=1" "--onboot 1" "--hostname morninet" "--timezone host" "name=eth0,bridge=vmbr0,ip=dhcp"; do
  check "pct create ${want}" has "${W}/log/argv.log" "${want}"
done
check "TUN-Gerät für NetBird in der Container-Konfiguration" has "${W}/pve/lxc/120.conf" "lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file"
check "TUN-Gerät darf benutzt werden (cgroup)" has "${W}/pve/lxc/120.conf" "lxc.cgroup2.devices.allow: c 10:200 rwm"
module_ok() { grep -Fx "modprobe $1" "${W}/log/argv.log" >/dev/null && grep -Fx "$1" "${W}/modules-load.d/morninet.conf" >/dev/null; }
for module in tun overlay xt_hashlimit xt_connlimit; do
  check "Kernel-Modul ${module} geladen und dauerhaft eingetragen" module_ok "${module}"
done
check "Docker-Repo eingetragen (download.docker.com)" grep -Fx "URIs: https://download.docker.com/linux/debian" "${CT}/etc-apt/sources.list.d/docker.sources"
check "Docker-Repo passt zu Debian 13 (trixie)" grep -Fx "Suites: trixie" "${CT}/etc-apt/sources.list.d/docker.sources"
check "Docker-Repo mit Schlüssel" grep -Fx "Signed-By: /etc/apt/keyrings/docker.asc" "${CT}/etc-apt/sources.list.d/docker.sources"
check "Docker-Schlüssel liegt im Container" test -s "${CT}/etc-apt/keyrings/docker.asc"
check "Docker-Pakete aus dem offiziellen Repo" has "${W}/log/ct.log" "apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin"
check "Docker eingeschaltet" test -f "${W}/state/enabled-docker"
check "git clone mit Untermodulen" grep -Fx "recurse=yes" "${W}/state/clone"
check "git clone vom Branch test-zweig" grep -Fx "branch=test-zweig" "${W}/state/clone"
check "git clone von github.com/pmornhart/morni.net" grep -Fx "url=https://github.com/pmornhart/morni.net.git" "${W}/state/clone"
check "git clone nach /opt/morninet" grep -Fx "dir=/opt/morninet" "${W}/state/clone"
check "Bot-Token per pct push mit Rechten 600" grep -Fx "600 /root/.morninet-discord-token" "${W}/log/pushed"
check "übertragener Token stimmt" same "$(content "${W}/state/pushed..morninet-discord-token")" "${TOKEN}"
check ".env angelegt, nur für root (600)" same "$(file_mode "${CT}/opt/morninet/.env")" 600
check ".env: Domain netz.example" same "$(env_value "${CT}/opt/morninet/.env" MM_DOMAIN)" netz.example
check ".env: Bot-Token übernommen" same "$(env_value "${CT}/opt/morninet/.env" MM_DISCORD_TOKEN)" "${TOKEN}"
check ".env: Schlüssel für den Motor" same "$(env_value "${CT}/opt/morninet/.env" MM_MOTOR_TOKEN)" mh_testdienstschluessel0123456789
check ".env: zufälliges MM_SECRET (64 Zeichen)" test "$(env_value "${CT}/opt/morninet/.env" MM_SECRET | wc -c)" -eq 64
check ".env: Heimnetz-Adresse" same "$(env_value "${CT}/opt/morninet/.env" MM_LAN_IP)" 192.0.2.50
check "kein NetBird ohne Key" lacks "${W}/log/ct.log" "netbird"
check "zeigt Einrichtungs-Code" has "${W}/out.txt" "Einrichtungs-Code: "$'\e[32m'"MM-TEST-4711"
check "zeigt Panel-Adresse" has "${W}/out.txt" "https://netz.example/panel/einrichtung"
check "zeigt Adresse zu Hause" has "${W}/out.txt" "http://192.0.2.50:8080/panel/einrichtung"
check "sagt, dass nur Port 8080 offen ist" has "${W}/out.txt" "nur Port 8080 offen"
check "erkennt Proxmox VE 9" has "${W}/out.txt" "Proxmox VE 9.0.11"
check "nennt Kerne und RAM des Rechners" has "${W}/out.txt" "Dein Proxmox: 16 Kerne, 64 GB RAM (55 GB gerade frei)"
check "nennt den freien Platz auf dem Speicher" has "${W}/out.txt" "100 GB auf local-lvm (dort frei: 325 GB)"
check "keine Warnung, wenn alles passt" lacks "${W}/out.txt" "Achtung –"
check "Zusammenfassung nennt Container, Name und IP" has "${W}/out.txt" 'Container 120 „morninet“ · IP 192.0.2.50'
check "Zusammenfassung zeigt, wie man den Code nochmal sieht" has "${W}/out.txt" "pct exec 120 -- docker exec morninet cat /data/setup-code"
check "Zusammenfassung verlinkt die Anleitung" has "${W}/out.txt" "docs/schnellstart.md"
check "bei DHCP wird kein Gateway gesucht" lacks "${W}/log/argv.log" "ip -4 route"
check_secrets_safe
show_output_on_failure

# ---------------------------------------------------------------------------------------------------------------
begin "2. Leeres Token, nächste freie ID, Standard-Domain, nur Debian 12 vorhanden (schon geladen)"
new_world env-leer
printf 'system          debian-12-standard_12.12-1_amd64.tar.zst\n' >"${W}/state/templates.available"
echo debian-12-standard_12.12-1_amd64.tar.zst >"${W}/state/templates.local"
run_case plain MM_DISCORD_TOKEN=
CT="${W}/ct/105"
check "läuft durch (Exit 0)" test "${RC}" -eq 0
check "nimmt die nächste freie ID (105)" created 105
check "nimmt Debian 12, wenn es kein 13 gibt" has "${W}/log/pct.log" "local:vztmpl/debian-12-standard_12.12-1_amd64.tar.zst"
check "lädt die Vorlage nicht nochmal" lacks "${W}/log/argv.log" "pveam download"
check "Docker-Repo für bookworm" grep -Fx "Suites: bookworm" "${CT}/etc-apt/sources.list.d/docker.sources"
check "kein pct push ohne Token" test ! -s "${W}/log/pushed"
check ".env: Standard-Domain morni.net" same "$(env_value "${CT}/opt/morninet/.env" MM_DOMAIN)" morni.net
check ".env: Token leer" same "$(env_value "${CT}/opt/morninet/.env" MM_DISCORD_TOKEN)" ""
check "Branch main" grep -Fx "branch=main" "${W}/state/clone"
check "Hinweis: Discord-Bot später im Panel" has "${W}/out.txt" 'Discord-Bot: Schritt für Schritt im Panel unter „Discord“'
check "Hinweis: Erreichbar machen (ohne NetBird)" has "${W}/out.txt" "Einstellungen → Erreichbarkeit"
check_secrets_safe
show_output_on_failure

# ---------------------------------------------------------------------------------------------------------------
begin "3. Token und NetBird-Key aus Dateien (*_FILE), eigener NetBird-Server, NetBird wird verbunden"
new_world env-netbird
printf '%s\n' "${TOKEN}" >"${W}/token.txt"
printf '  %s\r\n' "${NB_KEY}" >"${W}/netbird.txt"
run_case plain CTID=130 MM_DOMAIN=morni.net "MM_DISCORD_TOKEN_FILE=${W}/token.txt" "NETBIRD_SETUP_KEY_FILE=${W}/netbird.txt" \
  NETBIRD_MANAGEMENT_URL=https://netbird.example.org
CT="${W}/ct/130"
check "läuft durch (Exit 0)" test "${RC}" -eq 0
check "Token aus der Datei übernommen" same "$(env_value "${CT}/opt/morninet/.env" MM_DISCORD_TOKEN)" "${TOKEN}"
check "NetBird-Key per pct push mit Rechten 600" grep -Fx "600 /root/.morninet-netbird-key" "${W}/log/pushed"
check "NetBird-Key ohne Leerzeichen/Zeilenende übertragen" same "$(content "${W}/state/pushed..morninet-netbird-key")" "${NB_KEY}"
check "NetBird-Installer erst geladen, dann ausgeführt" grep -E "^curl https://pkgs.netbird.io/install.sh -> /tmp/" "${W}/log/ct.log"
check "NetBird-Hintergrunddienst gestartet" test -f "${W}/state/netbird-active"
check "netbird up mit dem richtigen Key (über die Umgebung)" grep -Fx ok "${W}/state/netbird-up"
check "meldet NetBird verbunden" has "${W}/out.txt" "NetBird verbunden"
check "netbird up beim eigenen NetBird-Server" grep -Fx "netbird up --management-url https://netbird.example.org" "${W}/log/ct.log"
check "Zusammenfassung nennt den eigenen NetBird-Server" has "${W}/out.txt" "ja, mit Setup-Key (https://netbird.example.org)"
check "nächster Schritt: Erreichbarkeit im Panel mit dem Rechner morninet" has "${W}/out.txt" 'Erreichbarkeit verbinden (Rechner „morninet“)'
check_secrets_safe
show_output_on_failure

# ---------------------------------------------------------------------------------------------------------------
begin "4. Mit Fragen (whiptail), Fehleingaben werden nochmal gefragt"
new_world whiptail
# Token mit Leerzeichen drumherum (beim Einfügen mitkopiert) – muss trotzdem passen.
with_whiptail abc 121 Spiel.Example kaputt " ${TOKEN} " yes "${NB_KEY}" netbird.example.org "" yes
run_case tty
CT="${W}/ct/121"
check "läuft durch (Exit 0)" test "${RC}" -eq 0
check "falsche Container-ID → nochmal gefragt mit Hinweis" has "${W}/log/whiptail.log" '„abc“ ist keine gültige Container-ID'
check "falsches Token → nochmal gefragt mit Hinweis" has "${W}/log/whiptail.log" "nicht wie ein Bot-Token aus"
check "Token-Abfrage ist unsichtbar (passwordbox)" has "${W}/log/whiptail.log" "--passwordbox Token deines Discord-Bots"
check 'Zusammenfassung zeigt den Token nicht, nur „hinterlegt“' has "${W}/log/whiptail.log" "Discord-Bot: Token ist hinterlegt"
check "Container 121 angelegt" created 121
check "Domain klein geschrieben" same "$(env_value "${CT}/opt/morninet/.env" MM_DOMAIN)" spiel.example
check "Token übernommen (Leerzeichen am Rand entfernt)" same "$(env_value "${CT}/opt/morninet/.env" MM_DISCORD_TOKEN)" "${TOKEN}"
check "NetBird verbunden" grep -Fx ok "${W}/state/netbird-up"
check "NetBird-Server ohne https → nochmal gefragt" has "${W}/log/whiptail.log" '„netbird.example.org“ ist keine Adresse wie https://'
check "leer = NetBird Cloud (netbird up ohne Server-Adresse)" grep -Fx "netbird up" "${W}/log/ct.log"
check "Zusammenfassung mit Knöpfen Anlegen/Erweitert" has "${W}/log/whiptail.log" "--yes-button Anlegen --no-button Erweitert"
check "alle Antworten verbraucht" test ! -s "${W}/state/whiptail.answers"
check_secrets_safe
show_output_on_failure

# ---------------------------------------------------------------------------------------------------------------
begin "5. Mit Fragen ohne whiptail (einfache Eingabe im Terminal)"
new_world einfach
feed() {
  type_after "Unter welcher Nummer" "" &&
    type_after "Unter welcher Domain" "Netz.Example" &&
    type_after "Token deines Discord-Bots" "${TOKEN}" &&
    type_after "NetBird gleich mit einrichten" "n" &&
    type_after "Mit diesen Werten anlegen" "j"
}
run_case tty
CT="${W}/ct/105"
check "läuft durch (Exit 0)" test "${RC}" -eq 0
check "Vorschlag 105 mit Enter übernommen" created 105
check "Domain übernommen" same "$(env_value "${CT}/opt/morninet/.env" MM_DOMAIN)" netz.example
check "Token übernommen" same "$(env_value "${CT}/opt/morninet/.env" MM_DISCORD_TOKEN)" "${TOKEN}"
check "kein NetBird" lacks "${W}/log/ct.log" "netbird"
check_secrets_safe
show_output_on_failure

# ---------------------------------------------------------------------------------------------------------------
begin "6. Fehler vor dem Anlegen: nichts wird angelegt"
new_world fehler-domain
run_case plain MM_DOMAIN=https://morni.net/ MM_DISCORD_TOKEN=
check "falsche Domain → Abbruch" test "${RC}" -ne 0
check "falsche Domain → erklärt" has "${W}/out.txt" "keine Domain"
check "falsche Domain → kein Container" not_created
new_world fehler-id
run_case plain CTID=100 MM_DISCORD_TOKEN=
check "belegte ID → Abbruch mit Erklärung" has "${W}/out.txt" "Die Nummer 100 ist schon vergeben"
check "belegte ID → kein Container" not_created
new_world fehler-token
run_case plain CTID=140 MM_DISCORD_TOKEN=nicht-echt
check "falsches Token per Umgebung → Abbruch" test "${RC}" -ne 0
check "falsches Token → erklärt" has "${W}/out.txt" "nicht wie ein Bot-Token"
check "falsches Token → kein Container" not_created
new_world fehler-abbruch
with_whiptail 122 "<cancel>"
run_case tty
check "Abbrechen in whiptail → freundliche Meldung" has "${W}/out.txt" "Abgebrochen – es wurde nichts angelegt"
check "Abbrechen → kein Container" not_created
new_world fehler-kein-proxmox
(
  export PATH="${SYS_PATH}"
  exec /bin/bash "${SCRIPT}" </dev/null
) >"${W}/out.txt" 2>&1 && RC=0 || RC=$?
check "ohne Proxmox → Abbruch mit Erklärung" has "${W}/out.txt" "nur auf einem Proxmox-VE-Host"
new_world fehler-pve7
echo "pve-manager/7.4-19/f98bf8d4 (running kernel: 5.15.158-2-pve)" >"${W}/state/pveversion"
run_case plain CTID=141 MM_DISCORD_TOKEN= NETBIRD_SETUP_KEY=
check "Proxmox 7 → Abbruch" test "${RC}" -ne 0
check "Proxmox 7 → erklärt, was es braucht" has "${W}/out.txt" "braucht Proxmox VE 8 oder 9"
check "Proxmox 7 → kein Container" not_created
new_world fehler-ip
run_case plain CTID=142 MM_DISCORD_TOKEN= NETBIRD_SETUP_KEY= CT_IP=192.0.2.70
check "feste IP ohne Netzgröße → Abbruch mit Erklärung" has "${W}/out.txt" 'weder „dhcp“ noch eine feste Adresse'
check "feste IP ohne Netzgröße → kein Container" not_created
new_world fehler-bridge
run_case plain CTID=143 MM_DISCORD_TOKEN= NETBIRD_SETUP_KEY= BRIDGE=vmbr9
check "unbekannte Bridge → Abbruch, nennt die vorhandenen" has "${W}/out.txt" 'Eine Netzwerk-Bridge „vmbr9“ gibt es nicht. Vorhanden: vmbr0 vmbr1'
check "unbekannte Bridge → kein Container" not_created
new_world fehler-netbird-url
run_case plain CTID=144 MM_DISCORD_TOKEN= "NETBIRD_SETUP_KEY=${NB_KEY}" NETBIRD_MANAGEMENT_URL=http://netbird.example.org
check "NetBird-Server ohne https → Abbruch" has "${W}/out.txt" "ist keine Adresse wie https://netbird.example.de"
check "NetBird-Server ohne https → kein Container" not_created
check_secrets_safe

# ---------------------------------------------------------------------------------------------------------------
begin "7. Fehler mitten in install.sh: Container bleibt zum Nachsehen, Geheimnisse sind weg"
new_world fehler-install
touch "${W}/state/fail-build"
run_case plain CTID=150 MM_DOMAIN=netz.example "MM_DISCORD_TOKEN=${TOKEN}" NETBIRD_SETUP_KEY=
check "Abbruch (Exit ≠ 0)" test "${RC}" -ne 0
check "sagt, wie man nachsieht" has "${W}/out.txt" "pct enter 150"
check "sagt, wie man neu anfängt" has "${W}/out.txt" "pct destroy 150"
check_secrets_safe
show_output_on_failure

# ---------------------------------------------------------------------------------------------------------------
begin "8. Erweitert (whiptail): Name, Kerne, RAM, Swap, Festplatte, Speicher, Bridge, feste IP, Debian 12"
new_world erweitert
# Erst „Erweitert“ (no), Fehleingaben werden nochmal gefragt, dann „Anlegen“ (yes).
with_whiptail 123 morni.net "" no no Morni-Test 99 6 24 2 5 80 local-lvm vmbr1 192.0.2.60/33 192.0.2.60/24 192.0.2.1 12 yes
run_case tty
CT="${W}/ct/123"
check "läuft durch (Exit 0)" test "${RC}" -eq 0
for want in "--hostname morni-test" "--cores 6" "--memory 24576" "--swap 2048" "--rootfs local-lvm:80" \
  "name=eth0,bridge=vmbr1,ip=192.0.2.60/24,gw=192.0.2.1" "local:vztmpl/debian-12-standard_12.12-1_amd64.tar.zst"; do
  check "pct create ${want}" create_arg "${want}"
done
check "zu viele Kerne → nochmal gefragt" has "${W}/log/whiptail.log" "Dein Proxmox hat 16 Kerne – mehr gehen nicht"
check "zu kleine Festplatte → nochmal gefragt" has "${W}/log/whiptail.log" '„5“ ist keine ganze Zahl ab 10'
check "falsche Netzgröße → nochmal gefragt" has "${W}/log/whiptail.log" '„192.0.2.60/33“ ist weder „dhcp“'
check "Speicher aus einer Liste mit freiem Platz" has "${W}/log/whiptail.log" "local-lvm 325 GB frei"
check "Bridges aus einer Liste" has "${W}/log/whiptail.log" "vmbr0 Netzwerk-Bridge vmbr1 Netzwerk-Bridge"
check "Gateway-Vorschlag kommt vom Host" has "${W}/log/argv.log" "ip -4 route show default"
check "Zusammenfassung danach nochmal mit den neuen Werten" has "${W}/log/whiptail.log" "Netz: vmbr1, feste IP 192.0.2.60/24, Gateway 192.0.2.1"
check "RAM 24 GB → Hinweis, wie viele Modi gleichzeitig laufen" has "${W}/log/whiptail.log" "Mit 24 GB laufen Lobby und etwa 6 Spielmodi gleichzeitig"
check "Docker-Repo für bookworm" grep -Fx "Suites: bookworm" "${CT}/etc-apt/sources.list.d/docker.sources"
check "alle Antworten verbraucht" test ! -s "${W}/state/whiptail.answers"
check_secrets_safe
show_output_on_failure

# ---------------------------------------------------------------------------------------------------------------
begin "9. Kleiner Rechner (4 Kerne, 16 GB RAM, wenig Platz): Standard passt sich an und warnt verständlich"
new_world klein
echo 4 >"${W}/state/cpus"
host_ram_gb 16 12
echo $((40 * 1024 * 1024)) >"${W}/state/lvm-free-kb"
run_case plain CTID=160 MM_DISCORD_TOKEN= NETBIRD_SETUP_KEY=
check "läuft durch (Exit 0)" test "${RC}" -eq 0
check "RAM angepasst: 14 GB (2 GB bleiben für Proxmox)" create_arg "--memory 14336"
check "Kerne angepasst: 4" create_arg "--cores 4"
check "sagt, dass der RAM angepasst wurde" has "${W}/out.txt" "Angepasst – RAM: 14 GB statt 32 GB – dein Proxmox hat 16 GB"
check "sagt, dass die Kerne angepasst wurden" has "${W}/out.txt" "Angepasst – CPU-Kerne: 4 statt 8"
check "sagt, wie viele Modi gleichzeitig laufen" has "${W}/out.txt" "Mit 14 GB laufen Lobby und etwa 2 Spielmodi gleichzeitig"
check "warnt vor wenig freiem Speicher" has "${W}/out.txt" "Auf local-lvm sind nur noch 40 GB frei"
new_world klein-ram-gesetzt
host_ram_gb 16 12
run_case plain CTID=161 MM_DISCORD_TOKEN= NETBIRD_SETUP_KEY= RAM=32768 DISK=30
check "gesetzter RAM bleibt (32 GB)" create_arg "--memory 32768"
check "warnt: mehr RAM als der Rechner hat" has "${W}/out.txt" "Achtung – RAM: Der Container darf 32 GB nutzen, dein Proxmox hat aber nur 16 GB"
check "warnt: kleine Festplatte" has "${W}/out.txt" "Achtung – Festplatte: Unter 50 GB"
new_world winzig
host_ram_gb 8 6
run_case plain CTID=162 MM_DISCORD_TOKEN= NETBIRD_SETUP_KEY=
check "8-GB-Rechner: 6 GB für den Container" create_arg "--memory 6144"
check "8-GB-Rechner: sagt, dass nur Lobby und Proxy gut laufen" has "${W}/out.txt" "Mit 6 GB laufen nur Lobby und Proxy gut"

# ---------------------------------------------------------------------------------------------------------------
begin "10. Proxmox 8: Debian 12; feste IP ohne Fragen (Gateway vom Host)"
new_world pve8
echo "pve-manager/8.4.14/b502d23c55afcba1 (running kernel: 6.8.12-15-pve)" >"${W}/state/pveversion"
run_case plain CTID=170 MM_DISCORD_TOKEN= NETBIRD_SETUP_KEY= CT_IP=192.0.2.70/24
CT="${W}/ct/170"
check "läuft durch (Exit 0)" test "${RC}" -eq 0
check "erkennt Proxmox VE 8" has "${W}/out.txt" "Proxmox VE 8.4.14"
check "nimmt auf Proxmox 8 Debian 12 (lädt es)" has "${W}/log/argv.log" "pveam download local debian-12-standard_12.12-1_amd64.tar.zst"
check "feste IP mit Gateway vom Host" create_arg "name=eth0,bridge=vmbr0,ip=192.0.2.70/24,gw=192.0.2.1"
check "Docker-Repo für bookworm" grep -Fx "Suites: bookworm" "${CT}/etc-apt/sources.list.d/docker.sources"
show_output_on_failure

# ---------------------------------------------------------------------------------------------------------------
printf '\n'
if ((FAILED == 0)); then
  printf ' %s✔ Alle %d Prüfungen bestanden.%s\n\n' "${GN}" "${PASSED}" "${CL}"
else
  printf ' %s✖ %d von %d Prüfungen fehlgeschlagen.%s\n\n' "${RD}" "${FAILED}" "$((PASSED + FAILED))" "${CL}"
  exit 1
fi
