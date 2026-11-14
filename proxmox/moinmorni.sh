#!/usr/bin/env bash
# MoinMorni – Proxmox-Einzeiler. Auf dem Proxmox-Host in der Shell (als root) ausführen:
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/pmornhart/moinmorni.net/main/proxmox/moinmorni.sh)"
#
# Was passiert: Ein Debian-Container (LXC) wird angelegt – unprivilegiert, mit „Nesting“ und „keyctl“ für Docker und
# dem Netzwerk-Gerät (TUN) für NetBird, startet mit dem Host. Darin landen Docker (aus dem offiziellen Paket-Repo von
# Docker), git und curl, dann MoinMorni in /opt/moinmorni, und install.sh läuft ohne Rückfragen durch. Optional wird
# der Container gleich in dein NetBird-Netz aufgenommen. Am Ende steht der Einrichtungs-Code für dein Owner-Konto da.
#
# Gefragt wird nur nach Container-ID, Domain, Discord-Bot-Token (unsichtbar, darf leer bleiben) und NetBird.
# Ohne Fragen geht es, wenn du die Werte vorher setzt, z. B.:
#
#   CTID=120 MM_DOMAIN=moinmorni.net MM_DISCORD_TOKEN_FILE=/root/bot-token NETBIRD_SETUP_KEY_FILE=/root/netbird-key \
#     bash -c "$(curl -fsSL https://raw.githubusercontent.com/pmornhart/moinmorni.net/main/proxmox/moinmorni.sh)"
#
# Geheimnisse (Bot-Token, NetBird-Key) am besten fragen lassen oder per *_FILE aus einer Datei lesen – direkt in der
# Befehlszeile landen sie in der Shell-History. MM_DISCORD_TOKEN= (leer) heißt: kein Token, nicht fragen.
# Weitere Werte: CT_HOSTNAME (moinmorni), CORES (8), RAM (32768 MB), SWAP (4096 MB), DISK (100 GB), STORAGE,
# TEMPLATE_STORAGE (local), BRIDGE (vmbr0), DEBIAN_VERSION (13, sonst 12), MM_BRANCH (main).
#
# Verfasst mit Claude 🤖

set -Eeuo pipefail

APP="MoinMorni"
REPO_URL="${MM_REPO_URL:-https://github.com/pmornhart/moinmorni.net.git}"
BRANCH="${MM_BRANCH:-main}"
INSTALL_DIR="/opt/moinmorni"
GUIDE_URL="https://github.com/pmornhart/moinmorni.net/blob/main/docs/proxmox-quickstart.md"
NETBIRD_INSTALL_URL="https://pkgs.netbird.io/install.sh"
# Hier liegen Bot-Token und NetBird-Key kurz im Container (nur für root lesbar), bis sie gebraucht und gelöscht werden.
TOKEN_IN_CT="/root/.moinmorni-discord-token"
NETBIRD_KEY_IN_CT="/root/.moinmorni-netbird-key"
WAIT_NET_TRIES=60
WAIT_SECONDS=2
# Kernel-Module auf dem Host – ein LXC teilt den Kernel des Hosts und kann keine eigenen laden:
# tun = NetBird, overlay = Speicher von Docker (overlay2), xt_* = DDoS-Schutz des Motors (MorniHosting).
HOST_MODULES=(tun overlay xt_hashlimit xt_connlimit xt_conntrack xt_comment)
# Domain: nur Buchstaben, Ziffern, Punkte und Bindestriche – "moinmorni.net" ja, "https://x" nein (wie install.sh).
DOMAIN_PATTERN='^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
# Discord-Bot-Token: drei Teile aus Buchstaben, Ziffern, _ und -, getrennt durch Punkte (wie install.sh).
TOKEN_PATTERN='^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{20,}$'
# Nur für den Test (proxmox/test/run.sh) änderbar:
PVE_LXC_CONF_DIR="${PVE_LXC_CONF_DIR:-/etc/pve/lxc}"
MODULES_LOAD_DIR="${MODULES_LOAD_DIR:-/etc/modules-load.d}"
TUN_DEVICE="${TUN_DEVICE:-/dev/net/tun}"

GN=$'\e[32m'
YW=$'\e[33m'
RD=$'\e[31m'
BL=$'\e[36m'
CL=$'\e[0m'

msg_info() { printf ' %s…%s %s\n' "${YW}" "${CL}" "$1"; }
msg_ok() { printf ' %s✔%s %s\n' "${GN}" "${CL}" "$1"; }
msg_error() { printf ' %s✖%s %s\n' "${RD}" "${CL}" "$1" >&2; }

CTID="${CTID:-}"
CT_CREATED=""
SECRETS_DIR=""
PUSHED=()

# Aufräumen: Geheimnisse auf dem Host (nur im RAM unter /run) und noch nicht abgeholte im Container löschen.
cleanup() {
  if [[ -n "${SECRETS_DIR}" ]]; then rm -rf "${SECRETS_DIR}"; fi
  if ((${#PUSHED[@]})); then pct exec "${CTID}" -- rm -f "${PUSHED[@]}" </dev/null >/dev/null 2>&1 || true; fi
}
on_error() {
  msg_error "Abgebrochen in Zeile $1. Details stehen oben."
  if [[ -n "${CT_CREATED}" ]]; then
    printf '   Der Container %s bleibt stehen, damit du nachsehen kannst: %spct enter %s%s\n' \
      "${CTID}" "${YW}" "${CTID}" "${CL}" >&2
    printf '   Ganz neu anfangen: %spct stop %s; pct destroy %s%s und das Skript nochmal starten.\n' \
      "${YW}" "${CTID}" "${CTID}" "${CL}" >&2
  fi
}
trap cleanup EXIT
trap 'on_error "${LINENO}"' ERR

if ! command -v pct >/dev/null 2>&1 || ! command -v pveversion >/dev/null 2>&1; then
  msg_error "Dieses Skript läuft nur auf einem Proxmox-VE-Host (in der Shell des Hosts, nicht in einem Container)."
  exit 1
fi
if [[ "${EUID}" -ne 0 ]]; then
  msg_error "Bitte als root starten."
  exit 1
fi

# ---------------------------------------------------------------------------------------------------------------
# Fragen (whiptail wie bei den community-scripts, sonst einfache Eingabe). Nur mit Bildschirm und Tastatur.
# ---------------------------------------------------------------------------------------------------------------

INTERACTIVE=""
if [[ -t 0 && -t 1 ]]; then INTERACTIVE="yes"; fi
ASKED=""

has_whiptail() { command -v whiptail >/dev/null 2>&1; }

cancelled() {
  printf '\n'
  msg_error "Abgebrochen – es wurde nichts angelegt."
  exit 1
}

# Frage mit Vorschlag; gibt die Antwort aus. Abbrechen → Rückgabe ungleich 0.
ask_text() {
  local title="$1" text="$2" value="$3" answer
  if has_whiptail; then
    whiptail --backtitle "${APP}" --title "${title}" --inputbox "${text}" 14 72 "${value}" 3>&1 1>&2 2>&3
  else
    printf '%b\n' "${text}" >&2
    read -r -p " [${value}]: " answer || return 1
    printf '%s' "${answer:-${value}}"
  fi
}

# Unsichtbare Eingabe (kein Vorschlag, nichts auf dem Bildschirm, nichts in der History).
ask_secret() {
  local title="$1" text="$2" answer
  if has_whiptail; then
    whiptail --backtitle "${APP}" --title "${title}" --passwordbox "${text}" 14 72 3>&1 1>&2 2>&3
  else
    printf '%b\n' "${text}" >&2
    read -r -s -p " > " answer || return 1
    printf '\n' >&2
    printf '%s' "${answer}"
  fi
}

# Ja/Nein: 0 = Ja, 1 = Nein, sonst abgebrochen. Drittes Argument "no" = Nein ist vorausgewählt.
ask_yesno() {
  local title="$1" text="$2" default="${3:-yes}" answer
  if has_whiptail; then
    local extra=()
    if [[ "${default}" == no ]]; then extra=(--defaultno); fi
    whiptail --backtitle "${APP}" --title "${title}" "${extra[@]}" --yesno "${text}" 22 76
  else
    printf '%b\n' "${text}" >&2
    if [[ "${default}" == no ]]; then
      read -r -p " (j/N): " answer || return 255
    else
      read -r -p " (J/n): " answer || return 255
    fi
    case "${answer,,}" in
      j | ja | y | yes) return 0 ;;
      n | nein | no) return 1 ;;
      "") [[ "${default}" != no ]] ;;
      *) return 1 ;;
    esac
  fi
}

# Fragt so lange, bis die Prüffunktion nichts mehr zu meckern hat. Art: text, lower (klein geschrieben) oder secret.
ask_checked() {
  local var="$1" check="$2" kind="$3" title="$4" text="$5" note="" answer
  while :; do
    if [[ "${kind}" == secret ]]; then
      answer="$(ask_secret "${title}" "${note}${text}")" || cancelled
      answer="$(trim "${answer}")"
    else
      answer="$(ask_text "${title}" "${note}${text}" "${!var}")" || cancelled
    fi
    if [[ "${kind}" == lower ]]; then answer="${answer,,}"; fi
    note="$("${check}" "${answer}")"
    if [[ -z "${note}" ]]; then
      printf -v "${var}" '%s' "${answer}"
      return 0
    fi
    note="${note}\n\n"
  done
}

# Prüfungen: geben einen Satz aus, was nicht passt – oder nichts. Ein Geheimnis selbst steht nie in der Ausgabe.
ctid_problem() {
  if [[ ! "$1" =~ ^[1-9][0-9]{2,8}$ ]]; then
    printf '„%s“ ist keine gültige Container-ID (eine Zahl ab 100).' "$1"
  elif ! pvesh get /cluster/nextid --vmid "$1" >/dev/null 2>&1; then
    printf 'Die Nummer %s ist schon vergeben (an einen Container oder eine VM).' "$1"
  fi
}
domain_problem() {
  if [[ ! "$1" =~ ${DOMAIN_PATTERN} ]]; then
    printf '„%s“ ist keine Domain (Beispiel: moinmorni.net – ohne https:// und ohne /).' "$1"
  fi
}
token_problem() {
  if [[ -n "$1" && ! "$1" =~ ${TOKEN_PATTERN} ]]; then
    printf 'Das sieht nicht wie ein Bot-Token aus (drei Teile mit Punkten dazwischen, aus dem Discord-Entwicklerportal → Bot → Reset Token).'
  fi
}
netbird_key_problem() {
  if [[ ! "$1" =~ ^[[:graph:]]{8,}$ ]]; then
    printf 'Das sieht nicht wie ein NetBird-Setup-Key aus (NetBird-Dashboard → Setup Keys → Create Setup Key).'
  fi
}
must_pass() {
  local problem
  problem="$("$@")"
  if [[ -n "${problem}" ]]; then
    msg_error "${problem}"
    exit 1
  fi
}

# Leerzeichen und Zeilenumbrüche am Rand weg (z. B. beim Einfügen mitkopiert). Nur Bash, kein Programm-Aufruf.
trim() {
  local s="${1//$'\r'/}"
  s="${s#"${s%%[![:space:]]*}"}"
  printf '%s' "${s%"${s##*[![:space:]]}"}"
}

# Liest ein Geheimnis aus NAME oder NAME_FILE nach REPLY. Rückgabe 1, wenn keins von beiden gesetzt ist.
secret_from_env() {
  local name="$1" file_var="$1_FILE"
  if [[ -n "${!file_var:-}" ]]; then
    if [[ ! -r "${!file_var}" ]]; then
      msg_error "${file_var}: Die Datei ${!file_var} lässt sich nicht lesen."
      exit 1
    fi
    REPLY="$(trim "$(<"${!file_var}")")"
  elif [[ -n "${!name+set}" ]]; then
    REPLY="$(trim "${!name}")"
  else
    return 1
  fi
}

default_storage() {
  pvesm status -content rootdir 2>/dev/null | awk 'NR > 1 && $3 == "active" { print $1; exit }'
}

# Neueste Debian-Vorlage einer Version – aus der Liste von Proxmox oder schon heruntergeladen.
find_template() {
  {
    pveam available --section system 2>/dev/null || true
    pveam list "${TEMPLATE_STORAGE}" 2>/dev/null || true
  } | awk -v want="debian-$1-standard_" '
    { for (i = 1; i <= NF; i++) { name = $i; sub(/^.*vztmpl\//, "", name); if (index(name, want) == 1) print name } }
  ' | sort -uV | tail -n 1
}

printf '\n %s%s%s – dein Minecraft-Netzwerk als Proxmox-Container\n\n' "${BL}" "${APP}" "${CL}"

CT_HOSTNAME="${CT_HOSTNAME:-moinmorni}"
CORES="${CORES:-8}"
RAM="${RAM:-32768}"
SWAP="${SWAP:-4096}"
DISK="${DISK:-100}"
STORAGE="${STORAGE:-$(default_storage)}"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"
BRIDGE="${BRIDGE:-vmbr0}"
DEBIAN_VERSION="${DEBIAN_VERSION:-13}"

# Geheimnisse sofort aus der Umgebung nehmen, damit sie nicht an andere Programme weitervererbt werden.
TOKEN=""
TOKEN_GIVEN=""
if secret_from_env MM_DISCORD_TOKEN; then
  TOKEN="${REPLY}"
  TOKEN_GIVEN="yes"
fi
NB_KEY=""
NB_GIVEN=""
if secret_from_env NETBIRD_SETUP_KEY; then
  NB_KEY="${REPLY}"
  NB_GIVEN="yes"
fi
unset MM_DISCORD_TOKEN NETBIRD_SETUP_KEY REPLY

# 1. Container-ID
if [[ -z "${CTID}" ]]; then
  CTID="$(pvesh get /cluster/nextid)"
  if [[ -n "${INTERACTIVE}" ]]; then
    ASKED="yes"
    ask_checked CTID ctid_problem text "Container-ID" "Unter welcher Nummer soll der Container angelegt werden?\n(Vorschlag: die nächste freie)"
  fi
fi
must_pass ctid_problem "${CTID}"

# 2. Domain
DOMAIN="${MM_DOMAIN:-}"
if [[ -z "${DOMAIN}" ]]; then
  DOMAIN="moinmorni.net"
  if [[ -n "${INTERACTIVE}" ]]; then
    ASKED="yes"
    ask_checked DOMAIN domain_problem lower "Domain" "Unter welcher Domain läuft dein Netzwerk?\n(Webseite und Panel kommen dorthin, Spieler verbinden sich mit dieser Adresse.)"
  fi
fi
DOMAIN="${DOMAIN,,}"
must_pass domain_problem "${DOMAIN}"

# 3. Discord-Bot-Token (unsichtbar, darf leer bleiben)
if [[ -z "${TOKEN_GIVEN}" && -n "${INTERACTIVE}" ]]; then
  ASKED="yes"
  ask_checked TOKEN token_problem secret "Discord-Bot" "Token deines Discord-Bots – die Eingabe bleibt unsichtbar.\n\nLeer lassen geht auch: Dann trägst du ihn später im Panel ein."
fi
must_pass token_problem "${TOKEN}"

# 4. NetBird (optional)
if [[ -z "${NB_GIVEN}" && -n "${INTERACTIVE}" ]]; then
  ASKED="yes"
  if ask_yesno "NetBird" "NetBird gleich mit einrichten?\n\nDann kommt deine Domain über NetBird bei MoinMorni an – ohne Portfreigabe im Router.\n\nDu brauchst dafür einen Setup-Key aus dem NetBird-Dashboard (Setup Keys → Create Setup Key). Das geht auch später." no; then
    ask_checked NB_KEY netbird_key_problem secret "NetBird" "Setup-Key aus dem NetBird-Dashboard – die Eingabe bleibt unsichtbar:"
  fi
fi
if [[ -n "${NB_KEY}" ]]; then must_pass netbird_key_problem "${NB_KEY}"; fi

summary() {
  local bot="noch keiner – trägst du später im Panel ein" netbird="nein (geht auch später)"
  if [[ -n "${TOKEN}" ]]; then bot="Token ist hinterlegt (wird nicht angezeigt)"; fi
  if [[ -n "${NB_KEY}" ]]; then netbird="ja, mit Setup-Key"; fi
  printf '%s\n' \
    "Container-ID: ${CTID} (Name: ${CT_HOSTNAME})" \
    "Domain: ${DOMAIN}" \
    "Discord-Bot: ${bot}" \
    "NetBird: ${netbird}" \
    "CPU-Kerne: ${CORES}" \
    "RAM: ${RAM} MB (dazu ${SWAP} MB Swap)" \
    "Festplatte: ${DISK} GB auf ${STORAGE:-?}" \
    "Netz: ${BRIDGE} (DHCP)"
}

if [[ -n "${ASKED}" ]]; then
  answer=0
  ask_yesno "Einstellungen" "Mit diesen Werten anlegen?\n\n$(summary)\n\nMit Nein kannst du Kerne, RAM, Festplatte, Speicher und Netz ändern." || answer=$?
  if ((answer == 1)); then
    CORES="$(ask_text "CPU" "CPU-Kerne" "${CORES}")" || cancelled
    RAM="$(ask_text "Arbeitsspeicher" "RAM in MB (MoinMorni und alle Spielmodi zusammen – leere Modi schlafen)" "${RAM}")" || cancelled
    DISK="$(ask_text "Festplatte" "Größe in GB (Welten, Backups, Docker-Images)" "${DISK}")" || cancelled
    STORAGE="$(ask_text "Speicher" "Proxmox-Speicher für den Container" "${STORAGE}")" || cancelled
    BRIDGE="$(ask_text "Netzwerk" "Netzwerk-Bridge" "${BRIDGE}")" || cancelled
  elif ((answer != 0)); then
    cancelled
  fi
fi

if [[ ! "${CORES}" =~ ^[1-9][0-9]*$ || ! "${RAM}" =~ ^[1-9][0-9]*$ || ! "${SWAP}" =~ ^[0-9]+$ || ! "${DISK}" =~ ^[1-9][0-9]*$ ]]; then
  msg_error "CPU-Kerne, RAM, Swap und Festplatte müssen ganze Zahlen sein (RAM/Swap in MB, Festplatte in GB)."
  exit 1
fi
if [[ -z "${STORAGE}" ]]; then
  msg_error "Kein Speicher für Container gefunden. Setze STORAGE=… (z. B. local-lvm) und starte neu."
  exit 1
fi
if [[ ! "${BRANCH}" =~ ^[A-Za-z0-9._/-]+$ || ! "${REPO_URL}" =~ ^https:// ]]; then
  msg_error "MM_BRANCH oder MM_REPO_URL sehen falsch aus."
  exit 1
fi

summary | sed 's/^/    /'
printf '\n'

# ---------------------------------------------------------------------------------------------------------------
# Container anlegen
# ---------------------------------------------------------------------------------------------------------------

msg_info "Debian-Vorlage wird gesucht"
if ! pveam update >/dev/null 2>&1; then
  msg_error "Die Vorlagen-Liste ließ sich nicht aktualisieren – ich nehme, was schon bekannt ist."
fi
TEMPLATE="$(find_template "${DEBIAN_VERSION}")"
if [[ -z "${TEMPLATE}" && "${DEBIAN_VERSION}" != 12 ]]; then TEMPLATE="$(find_template 12)"; fi
if [[ -z "${TEMPLATE}" ]]; then
  msg_error "Keine Debian-Vorlage gefunden (pveam available --section system)."
  exit 1
fi
if ! pveam list "${TEMPLATE_STORAGE}" 2>/dev/null | grep -F "${TEMPLATE}" >/dev/null; then
  msg_info "Vorlage ${TEMPLATE} wird geladen"
  pveam download "${TEMPLATE_STORAGE}" "${TEMPLATE}" >/dev/null
fi
msg_ok "Vorlage ${TEMPLATE}"

msg_info "Container ${CTID} wird angelegt"
pct create "${CTID}" "${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}" \
  --hostname "${CT_HOSTNAME}" \
  --cores "${CORES}" \
  --memory "${RAM}" \
  --swap "${SWAP}" \
  --rootfs "${STORAGE}:${DISK}" \
  --net0 "name=eth0,bridge=${BRIDGE},ip=dhcp" \
  --unprivileged 1 \
  --features nesting=1,keyctl=1 \
  --onboot 1 \
  --timezone host \
  --tags "minecraft;moinmorni" \
  --description "MoinMorni – Minecraft-Netzwerk (Webseite + Panel auf Port 8080). Anleitung: ${GUIDE_URL}" >/dev/null
CT_CREATED="yes"

# Kernel-Module (siehe HOST_MODULES) laden und dauerhaft eintragen. Dazu das Netzwerk-Gerät (TUN) für NetBird im
# Container – immer, damit NetBird auch später ohne Umbau geht.
for module in "${HOST_MODULES[@]}"; do modprobe "${module}" 2>/dev/null || true; done
printf '%s\n' "# MoinMorni: Kernel-Module für den Container (ein LXC kann keine eigenen laden)" "${HOST_MODULES[@]}" \
  >"${MODULES_LOAD_DIR}/moinmorni.conf"
TUN_OK=""
if [[ -c "${TUN_DEVICE}" ]]; then
  printf '%s\n' 'lxc.cgroup2.devices.allow: c 10:200 rwm' \
    'lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file' >>"${PVE_LXC_CONF_DIR}/${CTID}.conf"
  TUN_OK="yes"
else
  msg_error "Der Host hat kein Netzwerk-Gerät für VPNs (/dev/net/tun) – NetBird im Container geht dann nicht."
fi
pct start "${CTID}"
msg_ok "Container ${CTID} läuft (startet ab jetzt mit dem Host)"

# ---------------------------------------------------------------------------------------------------------------
# Im Container. Die ct_…-Funktionen laufen dort (per declare -f hinübergereicht); Werte sind sicher zitiert.
# Geheimnisse wandern nie als Argument mit, sondern als Datei (pct push, Rechte 600) und werden sofort gelöscht.
# ---------------------------------------------------------------------------------------------------------------

# Erste IPv4-Adresse des Containers (hostname -I, sonst ip).
ct_ip() {
  {
    hostname -I 2>/dev/null || ip -4 -o addr show scope global 2>/dev/null | awk '{ sub(/\/.*/, "", $4); print $4 }'
  } | awk 'NF { print $1; exit }'
}

# Pakete, Docker aus dem offiziellen Paket-Repo von Docker, MoinMorni holen.
ct_prepare() {
  set -Eeuo pipefail
  local repo="$1" branch="$2" dir="$3" codename arch
  export DEBIAN_FRONTEND=noninteractive HOME="${HOME:-/root}"
  msg_info "Pakete werden installiert (curl, git)"
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl git >/dev/null
  # install.sh liest die Heimnetz-Adresse mit "hostname -I" – nicht in jeder Debian-Vorlage dabei.
  if ! hostname -I >/dev/null 2>&1; then apt-get install -y -qq hostname >/dev/null 2>&1 || true; fi
  msg_ok "curl und git sind da"
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    msg_ok "Docker ist schon da"
  else
    msg_info "Docker wird aus dem offiziellen Paket-Repo installiert (download.docker.com)"
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    # shellcheck disable=SC1091 # gehört zum System im Container
    codename="$(. /etc/os-release && printf '%s' "${VERSION_CODENAME}")"
    arch="$(dpkg --print-architecture)"
    printf '%s\n' "Types: deb" "URIs: https://download.docker.com/linux/debian" "Suites: ${codename}" \
      "Components: stable" "Architectures: ${arch}" "Signed-By: /etc/apt/keyrings/docker.asc" \
      >/etc/apt/sources.list.d/docker.sources
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
    systemctl enable --now docker >/dev/null 2>&1 || true
    msg_ok "Docker installiert"
  fi
  local i
  for ((i = 0; i < 30; i++)); do
    if docker info >/dev/null 2>&1; then break; fi
    sleep 2
  done
  if ! docker info >/dev/null 2>&1; then
    msg_error "Docker startet im Container nicht. Prüfe in Proxmox: Container → Optionen → Features → Nesting und keyctl."
    return 1
  fi
  if [[ -d "${dir}/.git" ]]; then
    msg_ok "MoinMorni liegt schon in ${dir}"
  else
    msg_info "MoinMorni wird nach ${dir} geladen (Branch ${branch})"
    git clone --quiet --recurse-submodules --branch "${branch}" "${repo}" "${dir}"
    msg_ok "MoinMorni liegt in ${dir}"
  fi
}

# install.sh ohne Fragen: Domain und Branch als Werte, der Bot-Token aus der Datei (sofort gelöscht) über die
# Umgebung – so steht er nie in der Prozessliste.
ct_install() {
  set -Eeuo pipefail
  local domain="$1" branch="$2" dir="$3" secret="$4" token=""
  export HOME="${HOME:-/root}"
  if [[ -f "${secret}" ]]; then
    token="$(<"${secret}")"
    rm -f "${secret}"
  fi
  MM_DOMAIN="${domain}" MM_BRANCH="${branch}" MM_INSTALL_DIR="${dir}" MM_DISCORD_TOKEN="${token}" \
    bash "${dir}/install.sh" </dev/null
}

# NetBird installieren (Skript erst laden, dann ausführen) und mit dem Setup-Key verbinden – der Key geht über die
# Umgebung (NB_SETUP_KEY), nicht als Argument.
ct_netbird() {
  set -Eeuo pipefail
  local url="$1" secret="$2" key installer
  export HOME="${HOME:-/root}" DEBIAN_FRONTEND=noninteractive
  key="$(<"${secret}")"
  rm -f "${secret}"
  if ! command -v netbird >/dev/null 2>&1; then
    installer="$(mktemp)"
    curl -fsSL "${url}" -o "${installer}"
    sh "${installer}" </dev/null >/dev/null
    rm -f "${installer}"
  fi
  # Ohne laufenden Hintergrunddienst: "dial unix /var/run/netbird.sock: no such file".
  if ! systemctl is-active --quiet netbird 2>/dev/null; then
    netbird service install >/dev/null 2>&1 || true
    netbird service start >/dev/null 2>&1 || true
  fi
  NB_SETUP_KEY="${key}" netbird up </dev/null >/dev/null
}

# Führt eine ct_…-Funktion im Container aus.
in_ct() {
  local fn="$1" args=""
  shift
  if (($#)); then args="$(printf ' %q' "$@")"; fi
  pct exec "${CTID}" -- bash -c "$(declare -p GN YW RD BL CL); $(declare -f msg_info msg_ok msg_error "${fn}"); ${fn}${args}"
}

# Legt ein Geheimnis als Datei (nur für root lesbar) in den Container. Auf dem Host liegt es dafür kurz unter /run
# (nur im Arbeitsspeicher) und wird gleich wieder gelöscht.
push_secret() {
  local value="$1" target="$2" file
  if [[ -z "${SECRETS_DIR}" ]]; then SECRETS_DIR="$(mktemp -d /run/moinmorni-setup.XXXXXX)"; fi
  file="${SECRETS_DIR}/secret"
  (umask 077 && printf '%s' "${value}" >"${file}")
  PUSHED+=("${target}")
  pct push "${CTID}" "${file}" "${target}" --perms 0600
  rm -f "${file}"
}

msg_info "Warte auf das Netzwerk"
IP=""
for _ in $(seq 1 "${WAIT_NET_TRIES}"); do
  IP="$(in_ct ct_ip </dev/null 2>/dev/null)" || IP=""
  if [[ -n "${IP}" ]] && pct exec "${CTID}" -- getent hosts github.com </dev/null >/dev/null 2>&1; then
    break
  fi
  sleep "${WAIT_SECONDS}"
done
if [[ -z "${IP}" ]]; then
  msg_error "Der Container hat keine IP bekommen. Prüfe DHCP auf ${BRIDGE}."
  exit 1
fi
msg_ok "Container-IP: ${IP}"

in_ct ct_prepare "${REPO_URL}" "${BRANCH}" "${INSTALL_DIR}" </dev/null

if [[ -n "${TOKEN}" ]]; then push_secret "${TOKEN}" "${TOKEN_IN_CT}"; fi
msg_info "MoinMorni wird im Container eingerichtet (das erste Mal dauert es ein paar Minuten)"
in_ct ct_install "${DOMAIN}" "${BRANCH}" "${INSTALL_DIR}" "${TOKEN_IN_CT}" </dev/null
PUSHED=()
msg_ok "MoinMorni ist installiert"

NETBIRD_OK=""
if [[ -n "${NB_KEY}" && -z "${TUN_OK}" ]]; then
  msg_error "NetBird übersprungen: Ohne Netzwerk-Gerät (TUN) auf dem Host geht es nicht."
elif [[ -n "${NB_KEY}" ]]; then
  msg_info "NetBird wird im Container eingerichtet"
  push_secret "${NB_KEY}" "${NETBIRD_KEY_IN_CT}"
  if in_ct ct_netbird "${NETBIRD_INSTALL_URL}" "${NETBIRD_KEY_IN_CT}" </dev/null; then
    NETBIRD_OK="yes"
    msg_ok "NetBird verbunden – im NetBird-Dashboard heißt dieser Rechner ${CT_HOSTNAME}"
  else
    msg_error "NetBird ließ sich nicht einrichten. Später im Container (pct enter ${CTID}): netbird up"
  fi
  PUSHED=()
fi

CODE="$(pct exec "${CTID}" -- docker exec moinmorni cat /data/setup-code </dev/null 2>/dev/null | tr -d '\r\n')" || CODE=""

printf '\n %s🎉 %s ist bereit!%s\n\n' "${GN}" "${APP}" "${CL}"
if [[ -n "${CODE}" ]]; then
  printf '    1. Leg dein Owner-Konto an: %shttps://%s/panel/einrichtung%s\n' "${BL}" "${DOMAIN}" "${CL}"
  printf '       (zu Hause auch: http://%s:8080/panel/einrichtung)\n' "${IP}"
  printf '       Einrichtungs-Code: %s%s%s\n' "${GN}" "${CODE}" "${CL}"
  printf '       Später nochmal anzeigen: %spct exec %s -- docker exec moinmorni cat /data/setup-code%s\n' \
    "${YW}" "${CTID}" "${CL}"
else
  printf '    1. Panel: %shttps://%s/panel%s (zu Hause auch: http://%s:8080/panel)\n' "${BL}" "${DOMAIN}" "${CL}" "${IP}"
fi
if [[ -n "${NETBIRD_OK}" ]]; then
  printf '    2. NetBird: HTTP-Dienst für %s auf den Rechner „%s“, Port 8080, mit „Pass Host Header“.\n' \
    "${DOMAIN}" "${CT_HOSTNAME}"
else
  printf '    2. HTTPS: in NetBird einen HTTP-Dienst für %s auf http://%s:8080 anlegen (mit „Pass Host Header“).\n' \
    "${DOMAIN}" "${IP}"
fi
if [[ -z "${TOKEN}" ]]; then
  printf '    3. Discord-Bot: den Token trägst du im Panel unter Discord ein.\n'
fi
printf '\n    Im Container ist nur Port 8080 offen (Webseite + Panel). Die Minecraft-Ports öffnet MoinMorni selbst,\n'
printf '    sobald es den Proxy für die Spieler anlegt. Motor, Docker-Zugang und Hub bleiben intern.\n'
printf '    In den Container: %spct enter %s%s · Anleitung: %s\n\n' "${YW}" "${CTID}" "${CL}" "${GUIDE_URL}"
