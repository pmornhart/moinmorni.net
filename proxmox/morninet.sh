#!/usr/bin/env bash
# morni.net – Proxmox-Einzeiler. Auf dem Proxmox-Host in der Shell (als root) ausführen:
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/pmornhart/morni.net/main/proxmox/morninet.sh)"
#
# Was passiert: Erst prüft das Skript deinen Proxmox (Version 8 oder 9, RAM, Kerne, freier Platz) und sagt in einfachen
# Worten, was knapp ist. Dann legt es einen Debian-Container (LXC) an – unprivilegiert, mit „Nesting“ und „keyctl“ für
# Docker und dem Netzwerk-Gerät (TUN) für NetBird, startet mit dem Host. Darin landen Docker (aus dem offiziellen
# Paket-Repo von Docker), git und curl, dann morni.net in /opt/morninet, und install.sh läuft ohne Rückfragen durch.
# Optional wird der Container gleich in dein NetBird-Netz aufgenommen. Am Ende stehen IP, Panel-Adresse und der
# Einrichtungs-Code für dein Owner-Konto da.
#
# Gefragt wird nach Container-ID, Domain, Discord-Bot-Token (unsichtbar, darf leer bleiben) und NetBird (Setup-Key und,
# wenn du NetBird selbst betreibst, die Adresse deines NetBird-Servers). Danach zeigt das Skript alle Werte:
# „Anlegen“ nimmt die Standard-Einstellungen, „Erweitert“ lässt dich Name, Kerne, RAM, Swap, Festplatte, Speicher,
# Netz, feste IP und Debian-Version ändern.
#
# Ohne Fragen geht es, wenn du die Werte vorher setzt, z. B.:
#
#   CTID=120 MM_DOMAIN=morni.net MM_DISCORD_TOKEN_FILE=/root/bot-token NETBIRD_SETUP_KEY_FILE=/root/netbird-key \
#     bash -c "$(curl -fsSL https://raw.githubusercontent.com/pmornhart/morni.net/main/proxmox/morninet.sh)"
#
# Geheimnisse (Bot-Token, NetBird-Key) am besten fragen lassen oder per *_FILE aus einer Datei lesen – direkt in der
# Befehlszeile landen sie in der Shell-History. MM_DISCORD_TOKEN= (leer) heißt: kein Token, nicht fragen.
# Weitere Werte: CT_HOSTNAME (morninet), CORES (8), RAM (32768 MB), SWAP (4096 MB), DISK (100 GB), STORAGE,
# TEMPLATE_STORAGE (local), BRIDGE (vmbr0), CT_IP (dhcp oder z. B. 192.168.178.50/24), CT_GATEWAY (bei fester IP),
# DEBIAN_VERSION (Proxmox 9: 13, Proxmox 8: 12), NETBIRD_MANAGEMENT_URL (eigener NetBird-Server), MM_BRANCH (main).
# Hat dein Proxmox weniger Kerne oder RAM, nimmt das Skript von selbst weniger (außer du setzt CORES bzw. RAM).
#
# Anleitung von null an: docs/schnellstart.md
#
# Verfasst mit Claude 🤖

# Deutsche Anführungszeichen („…“) in den Texten sind gewollt:
# shellcheck disable=SC1111

set -Eeuo pipefail

APP="morni.net"
REPO_URL="${MM_REPO_URL:-https://github.com/pmornhart/morni.net.git}"
BRANCH="${MM_BRANCH:-main}"
INSTALL_DIR="/opt/morninet"
GUIDE_URL="https://github.com/pmornhart/morni.net/blob/main/docs/schnellstart.md"
NETBIRD_INSTALL_URL="https://pkgs.netbird.io/install.sh"
# Hier liegen Bot-Token und NetBird-Key kurz im Container (nur für root lesbar), bis sie gebraucht und gelöscht werden.
TOKEN_IN_CT="/root/.morninet-discord-token"
NETBIRD_KEY_IN_CT="/root/.morninet-netbird-key"
WAIT_NET_TRIES=60
WAIT_SECONDS=2
# Kernel-Module auf dem Host – ein LXC teilt den Kernel des Hosts und kann keine eigenen laden:
# tun = NetBird, overlay = Speicher von Docker (overlay2), xt_* = DDoS-Schutz des Motors (MorniHosting).
HOST_MODULES=(tun overlay xt_hashlimit xt_connlimit xt_conntrack xt_comment)
# Domain: nur Buchstaben, Ziffern, Punkte und Bindestriche – "morni.net" ja, "https://x" nein (wie install.sh).
DOMAIN_PATTERN='^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
# Discord-Bot-Token: drei Teile aus Buchstaben, Ziffern, _ und -, getrennt durch Punkte (wie install.sh).
TOKEN_PATTERN='^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{20,}$'
# Eigener NetBird-Server: "https://netbird.example.de" oder mit Port "https://netbird.example.de:33073" – nur https.
NETBIRD_URL_PATTERN='^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?/?$'
# Name des Containers: "morninet" oder "morni-net" ja, "Mein Netz" nein.
HOSTNAME_PATTERN='^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
# Feste Adresse: "192.168.178.50", mit Netzgröße "192.168.178.50/24".
IPV4_PATTERN='^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$'
CIDR_PATTERN='^([0-9.]+)/([0-9]{1,2})$'
# Proxmox VE ab 8 (Debian 12 „bookworm“). Ab 9 (Debian 13 „trixie“) bekommt der Container Debian 13.
PVE_MIN_MAJOR=8
PVE_DEBIAN13_MAJOR=9
# Standard: so groß, dass Lobby und alle Spielmodi gleichzeitig laufen können.
DEFAULT_CORES=8
DEFAULT_RAM_MB=32768
DEFAULT_SWAP_MB=4096
DEFAULT_DISK_GB=100
MB_PER_GB=1024
KB_PER_GB=1048576
# So viel RAM bleibt für Proxmox selbst, wenn das Skript den RAM an einen kleineren Rechner anpasst.
HOST_RESERVE_MB=2048
# Läuft immer: morni.net mit Motor und Docker (~1 GB), Proxy (1 GB) und Lobby (4 GB).
BASE_RAM_MB=6144
# Ein wacher Spielmodus (MorniSMP braucht 8 GB, MorniCraft 6 GB). Leere Modi schlafen und brauchen nichts.
MODE_RAM_MB=3072
# Darunter laufen nur Lobby und Proxy gut.
MIN_RAM_MB=8192
# Darunter wird es mit Welten, Sicherungen und Docker-Images schnell eng.
MIN_DISK_GB=50
SMALLEST_DISK_GB=10
# Nur für den Test (proxmox/test/run.sh) änderbar:
PVE_LXC_CONF_DIR="${PVE_LXC_CONF_DIR:-/etc/pve/lxc}"
MODULES_LOAD_DIR="${MODULES_LOAD_DIR:-/etc/modules-load.d}"
TUN_DEVICE="${TUN_DEVICE:-/dev/net/tun}"
HOST_MEMINFO="${HOST_MEMINFO:-/proc/meminfo}"
HOST_NET_DIR="${HOST_NET_DIR:-/sys/class/net}"

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
  printf '   Hilfe bei Problemen: %s\n' "${GUIDE_URL}" >&2
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
# Fragen (whiptail wie bei den bekannten Proxmox-Helfern, sonst einfache Eingabe). Nur mit Bildschirm und Tastatur.
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
    whiptail --backtitle "${APP}" --title "${title}" --inputbox "${text}" 16 76 "${value}" 3>&1 1>&2 2>&3
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
    whiptail --backtitle "${APP}" --title "${title}" --passwordbox "${text}" 16 76 3>&1 1>&2 2>&3
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

# Auswahl aus einer Liste (Kennung, Beschreibung, Kennung, …); gibt die gewählte Kennung aus. Abbrechen → ungleich 0.
ask_menu() {
  local title="$1" text="$2" current="$3" answer i
  shift 3
  if has_whiptail; then
    whiptail --backtitle "${APP}" --title "${title}" --default-item "${current}" --menu "${text}" 20 76 8 "$@" \
      3>&1 1>&2 2>&3
    return
  fi
  printf '%b\n' "${text}" >&2
  for ((i = 1; i < $#; i += 2)); do printf '   %s – %s\n' "${!i}" "${@:i+1:1}" >&2; done
  while :; do
    read -r -p " [${current}]: " answer || return 1
    answer="${answer:-${current}}"
    for ((i = 1; i < $#; i += 2)); do
      if [[ "${!i}" == "${answer}" ]]; then
        printf '%s' "${answer}"
        return 0
      fi
    done
    printf ' „%s“ steht nicht in der Liste.\n' "${answer}" >&2
  done
}

# Alle Werte auf einen Blick: 0 = anlegen, 1 = erweitert (ändern), sonst abgebrochen.
ask_summary() {
  local text="$1" answer
  if has_whiptail; then
    whiptail --backtitle "${APP}" --title "So wird der Container angelegt" --scrolltext \
      --yes-button "Anlegen" --no-button "Erweitert" --yesno "${text}" 24 78
    return
  fi
  printf '%b\n' "${text}" >&2
  read -r -p " Mit diesen Werten anlegen? (j = anlegen, e = erweitert, a = abbrechen) [j]: " answer || return 255
  case "${answer,,}" in
    "" | j | ja | y | yes) return 0 ;;
    e | erweitert | n | nein) return 1 ;;
    *) return 255 ;;
  esac
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
      answer="$(trim "${answer}")"
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

# ---------------------------------------------------------------------------------------------------------------
# Prüfungen: geben einen Satz aus, was nicht passt – oder nichts. Ein Geheimnis selbst steht nie in der Ausgabe.
# ---------------------------------------------------------------------------------------------------------------

whole_number() { [[ "$1" =~ ^[0-9]{1,7}$ ]]; }

ctid_problem() {
  if [[ ! "$1" =~ ^[1-9][0-9]{2,8}$ ]]; then
    printf '„%s“ ist keine gültige Container-ID (eine Zahl ab 100).' "$1"
  elif ! pvesh get /cluster/nextid --vmid "$1" >/dev/null 2>&1; then
    printf 'Die Nummer %s ist schon vergeben (an einen Container oder eine VM).' "$1"
  fi
}
domain_problem() {
  if [[ ! "$1" =~ ${DOMAIN_PATTERN} ]]; then
    printf '„%s“ ist keine Domain (Beispiel: morni.net – ohne https:// und ohne /).' "$1"
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
netbird_url_problem() {
  if [[ -n "$1" && ! "$1" =~ ${NETBIRD_URL_PATTERN} ]]; then
    printf '„%s“ ist keine Adresse wie https://netbird.example.de (leer lassen = NetBird Cloud).' "$1"
  fi
}
hostname_problem() {
  if [[ ! "$1" =~ ${HOSTNAME_PATTERN} ]]; then
    printf '„%s“ geht als Name nicht: nur Kleinbuchstaben, Ziffern und Bindestriche (Beispiel: morninet).' "$1"
  fi
}
cores_problem() {
  if ! whole_number "$1" || ((10#$1 < 1)); then
    printf '„%s“ ist keine ganze Zahl ab 1.' "$1"
  elif ((HOST_CPUS > 0 && 10#$1 > HOST_CPUS)); then
    printf 'Dein Proxmox hat %s Kerne – mehr gehen nicht.' "${HOST_CPUS}"
  fi
}
# Ganze Zahl ab $2 (RAM, Swap und Festplatte in GB).
number_problem() {
  if ! whole_number "$1" || ((10#$1 < $2)); then printf '„%s“ ist keine ganze Zahl ab %s.' "$1" "$2"; fi
}
ram_problem() { number_problem "$1" 1; }
swap_problem() { number_problem "$1" 0; }
disk_problem() { number_problem "$1" "${SMALLEST_DISK_GB}"; }
valid_ipv4() {
  [[ "$1" =~ ${IPV4_PATTERN} ]] || return 1
  local part
  for part in "${BASH_REMATCH[@]:1}"; do
    ((10#${part} <= 255)) || return 1
  done
}
valid_cidr() {
  [[ "$1" =~ ${CIDR_PATTERN} ]] || return 1
  local address="${BASH_REMATCH[1]}" prefix="${BASH_REMATCH[2]}"
  valid_ipv4 "${address}" && ((10#${prefix} >= 8 && 10#${prefix} <= 32))
}
ip_problem() {
  if [[ "$1" != dhcp ]] && ! valid_cidr "$1"; then
    printf '„%s“ ist weder „dhcp“ noch eine feste Adresse mit Netzgröße wie 192.168.178.50/24.' "$1"
  fi
}
gateway_problem() {
  if ! valid_ipv4 "$1"; then
    printf '„%s“ ist keine Adresse wie 192.168.178.1 (meist die Adresse deines Routers).' "$1"
  fi
}
storage_problem() {
  if [[ -z "$(storage_free_gb "$1")" ]]; then
    printf 'Einen Speicher „%s“ für Container gibt es nicht. Vorhanden: %s' "$1" "$(storages | awk '{ printf "%s ", $1 }')"
  fi
}
bridge_problem() {
  local known
  known="$(bridges)"
  if [[ -n "${known}" ]] && ! grep -qxF -- "$1" <<<"${known}"; then
    printf 'Eine Netzwerk-Bridge „%s“ gibt es nicht. Vorhanden: %s' "$1" "$(tr '\n' ' ' <<<"${known}")"
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

# ---------------------------------------------------------------------------------------------------------------
# Was der Proxmox-Rechner hat
# ---------------------------------------------------------------------------------------------------------------

# Speicher, die Container aufnehmen (aktiv, Inhalt „rootdir“): je Zeile Name und freie GB.
storages() {
  pvesm status -content rootdir 2>/dev/null |
    awk -v kb="${KB_PER_GB}" 'NR > 1 && $3 == "active" { printf "%s %d\n", $1, $6 / kb }'
}
default_storage() { storages | awk 'NR == 1 { print $1 }'; }
storage_free_gb() { storages | awk -v s="$1" '$1 == s { print $2; exit }'; }
# Netzwerk-Bridges des Hosts (vmbr0 …).
bridges() {
  local dir
  for dir in "${HOST_NET_DIR}"/*/bridge; do
    if [[ -d "${dir}" ]]; then
      dir="${dir%/bridge}"
      printf '%s\n' "${dir##*/}"
    fi
  done
}
default_gateway() {
  ip -4 route show default 2>/dev/null | awk '{ for (i = 1; i < NF; i++) if ($i == "via") { print $(i + 1); exit } }'
}
host_mb() { awk -v key="$1" '$1 == key { print int($2 / 1024); exit }' "${HOST_MEMINFO}" 2>/dev/null || true; }
# 64264 MB → 63 (GB, gerundet).
gb_round() { printf '%s' $((($1 + MB_PER_GB / 2) / MB_PER_GB)); }
# 32768 → "32 GB", 12000 → "12000 MB".
size_mb() {
  if (($1 % MB_PER_GB == 0)); then printf '%s GB' $(($1 / MB_PER_GB)); else printf '%s MB' "$1"; fi
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

PVE_VERSION="$(pveversion 2>/dev/null | awk -F/ 'NR == 1 { print $2 }')"
PVE_MAJOR="${PVE_VERSION%%.*}"
if [[ ! "${PVE_MAJOR}" =~ ^[0-9]+$ ]]; then
  msg_error "Die Version deines Proxmox ließ sich nicht lesen (pveversion)."
  exit 1
fi
if ((PVE_MAJOR < PVE_MIN_MAJOR)); then
  msg_error "Dein Proxmox VE hat Version ${PVE_VERSION}. morni.net braucht Proxmox VE 8 oder 9 – bitte erst aktualisieren."
  printf '   Wie das geht, steht in der Anleitung: %s\n' "${GUIDE_URL}" >&2
  exit 1
fi
msg_ok "Proxmox VE ${PVE_VERSION}"
HOST_RAM_MB="$(host_mb MemTotal:)"
HOST_RAM_MB="${HOST_RAM_MB:-0}"
HOST_FREE_MB="$(host_mb MemAvailable:)"
HOST_FREE_MB="${HOST_FREE_MB:-0}"
HOST_CPUS="$(nproc 2>/dev/null || true)"
if [[ ! "${HOST_CPUS}" =~ ^[0-9]+$ ]]; then HOST_CPUS=0; fi
msg_ok "Dein Proxmox: ${HOST_CPUS} Kerne, $(gb_round "${HOST_RAM_MB}") GB RAM ($(gb_round "${HOST_FREE_MB}") GB gerade frei)"

for var in CORES RAM SWAP DISK; do
  if [[ -n "${!var:-}" ]] && ! whole_number "${!var}"; then
    msg_error "${var} muss eine ganze Zahl sein (RAM und SWAP in MB, DISK in GB)."
    exit 1
  fi
done

# Standard-Einstellungen – auf einem kleineren Rechner von selbst passend gemacht (außer CORES/RAM sind gesetzt).
ADJUSTED=()
CT_HOSTNAME="${CT_HOSTNAME:-morninet}"
if [[ -z "${CORES:-}" ]]; then
  CORES="${DEFAULT_CORES}"
  if ((HOST_CPUS > 0 && CORES > HOST_CPUS)); then
    CORES="${HOST_CPUS}"
    ADJUSTED+=("CPU-Kerne: ${CORES} statt ${DEFAULT_CORES} – so viele hat dein Proxmox.")
  fi
fi
if [[ -z "${RAM:-}" ]]; then
  RAM="${DEFAULT_RAM_MB}"
  if ((HOST_RAM_MB > 0 && RAM > HOST_RAM_MB - HOST_RESERVE_MB)); then
    RAM=$(((HOST_RAM_MB - HOST_RESERVE_MB) / MB_PER_GB * MB_PER_GB))
    if ((RAM < MB_PER_GB)); then RAM="${MB_PER_GB}"; fi
    ADJUSTED+=("RAM: $(size_mb "${RAM}") statt $(size_mb "${DEFAULT_RAM_MB}") – dein Proxmox hat $(gb_round "${HOST_RAM_MB}") GB, etwa 2 GB braucht er selbst.")
  fi
fi
SWAP="${SWAP:-${DEFAULT_SWAP_MB}}"
DISK="${DISK:-${DEFAULT_DISK_GB}}"
STORAGE="${STORAGE:-$(default_storage)}"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"
BRIDGE="${BRIDGE:-vmbr0}"
CT_IP="${CT_IP:-dhcp}"
CT_IP="${CT_IP,,}"
CT_GATEWAY="${CT_GATEWAY:-}"
if [[ -z "${DEBIAN_VERSION:-}" ]]; then
  DEBIAN_VERSION=12
  if ((PVE_MAJOR >= PVE_DEBIAN13_MAJOR)); then DEBIAN_VERSION=13; fi
fi
NB_URL="$(trim "${NETBIRD_MANAGEMENT_URL:-}")"

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
    ask_checked CTID ctid_problem text "Container-ID" "Unter welcher Nummer soll der Container in Proxmox stehen?\n\nJede Nummer gibt es nur einmal (Container und VMs zusammen). Mit ihr sprichst du den Container später an, z. B. pct enter <Nummer>. Vorschlag: die nächste freie."
  fi
fi
must_pass ctid_problem "${CTID}"

# 2. Domain
DOMAIN="${MM_DOMAIN:-}"
if [[ -z "${DOMAIN}" ]]; then
  DOMAIN="morni.net"
  if [[ -n "${INTERACTIVE}" ]]; then
    ASKED="yes"
    ask_checked DOMAIN domain_problem lower "Domain" "Unter welcher Domain läuft dein Netzwerk?\n\nDort stehen später Webseite und Panel (https://<Domain>/panel), und Spieler verbinden sich mit dieser Adresse. Ohne https:// und ohne / – z. B. morni.net. Die DNS-Einträge kommen später (Anleitung, Teil 5)."
  fi
fi
DOMAIN="${DOMAIN,,}"
must_pass domain_problem "${DOMAIN}"

# 3. Discord-Bot-Token (unsichtbar, darf leer bleiben)
if [[ -z "${TOKEN_GIVEN}" && -n "${INTERACTIVE}" ]]; then
  ASKED="yes"
  ask_checked TOKEN token_problem secret "Discord-Bot" "Token deines Discord-Bots (Entwicklerportal → Bot → Reset Token) – die Eingabe bleibt unsichtbar. Er landet nur in der Einstellungs-Datei im Container, die nur root lesen darf.\n\nLeer lassen geht auch: Wie du ihn später einträgst, zeigt dir das Panel unter „Discord“."
fi
must_pass token_problem "${TOKEN}"

# 4. NetBird (optional): Setup-Key und – bei einem eigenen NetBird-Server – dessen Adresse
if [[ -z "${NB_GIVEN}" && -n "${INTERACTIVE}" ]]; then
  ASKED="yes"
  if ask_yesno "NetBird" "NetBird gleich mit einrichten?\n\nÜber NetBird erreichen Spieler und Besucher dein Netzwerk unter deiner Domain – ohne Portfreigabe im Router und ohne dass jemand die IP deines Anschlusses sieht.\n\nDu brauchst dafür einen Setup-Key aus dem NetBird-Dashboard (Setup Keys → Create Setup Key). Das geht auch später." no; then
    ask_checked NB_KEY netbird_key_problem secret "NetBird" "Setup-Key aus dem NetBird-Dashboard – die Eingabe bleibt unsichtbar:"
    if [[ -z "${NETBIRD_MANAGEMENT_URL+set}" ]]; then
      ask_checked NB_URL netbird_url_problem text "NetBird-Server" "Wo läuft dein NetBird?\n\nBei NetBird selbst (netbird.io, „NetBird Cloud“): leer lassen.\n\nEigener NetBird-Server (z. B. auf deinem IONOS-Server): seine Adresse – so, wie du das NetBird-Dashboard öffnest, z. B. https://netbird.example.de"
    fi
  fi
fi
if [[ -n "${NB_KEY}" ]]; then
  must_pass netbird_key_problem "${NB_KEY}"
  must_pass netbird_url_problem "${NB_URL}"
fi

# Erweiterte Einstellungen: alles, was „Anlegen“ sonst von selbst nimmt.
advanced_settings() {
  local value name free storage_items=() bridge_items=()
  ask_checked CT_HOSTNAME hostname_problem lower "Name" "Name des Containers – in Proxmox und in NetBird (Standard: morninet):"
  value="${CORES}"
  ask_checked value cores_problem text "CPU-Kerne" "Wie viele Prozessorkerne darf morni.net nutzen? Dein Proxmox hat ${HOST_CPUS}.\n\nMinecraft mag schnelle Kerne mehr als viele. Empfohlen: ${DEFAULT_CORES}."
  CORES=$((10#${value}))
  value=$((RAM / MB_PER_GB))
  ask_checked value ram_problem text "Arbeitsspeicher" "RAM in GB für morni.net und alle Spielmodi zusammen. Dein Proxmox hat $(gb_round "${HOST_RAM_MB}") GB, etwa 2 GB braucht er selbst.\n\nImmer an: Lobby und Proxy (zusammen etwa 6 GB). Jeder Spielmodus, in dem gerade jemand spielt, etwa 3 GB (MorniSMP 8 GB). Leere Modi schlafen. Empfohlen: 32."
  RAM=$((10#${value} * MB_PER_GB))
  value=$((SWAP / MB_PER_GB))
  ask_checked value swap_problem text "Swap" "Auslagerung in GB – eine Notreserve, wenn der RAM knapp wird. Empfohlen: 4."
  SWAP=$((10#${value} * MB_PER_GB))
  value="${DISK}"
  ask_checked value disk_problem text "Festplatte" "Größe in GB für Welten, Sicherungen und Docker-Images. Empfohlen: ${DEFAULT_DISK_GB}.\n\nVergrößern geht später jederzeit, verkleinern nicht."
  DISK=$((10#${value}))
  while read -r name free; do storage_items+=("${name}" "${free} GB frei"); done < <(storages)
  if ((${#storage_items[@]})); then
    STORAGE="$(ask_menu "Speicher" "Auf welchem Proxmox-Speicher soll der Container liegen?" "${STORAGE}" "${storage_items[@]}")" ||
      cancelled
  fi
  while read -r name; do bridge_items+=("${name}" "Netzwerk-Bridge"); done < <(bridges)
  if ((${#bridge_items[@]})); then
    BRIDGE="$(ask_menu "Netzwerk" "Über welche Netzwerk-Bridge geht der Container ins Heimnetz? (Fast immer: vmbr0)" "${BRIDGE}" "${bridge_items[@]}")" ||
      cancelled
  else
    ask_checked BRIDGE bridge_problem text "Netzwerk" "Netzwerk-Bridge (fast immer: vmbr0):"
  fi
  ask_checked CT_IP ip_problem lower "IP-Adresse" "„dhcp“: Der Router gibt dem Container eine Adresse – einfach, kann sich aber ändern.\n\nFeste Adresse, z. B. 192.168.178.50/24: am besten außerhalb des Bereichs, den dein Router selbst verteilt. Dann findest du das Panel zu Hause immer unter derselben Adresse."
  if [[ "${CT_IP}" != dhcp ]]; then
    if [[ -z "${CT_GATEWAY}" ]]; then CT_GATEWAY="$(default_gateway)"; fi
    ask_checked CT_GATEWAY gateway_problem text "Gateway" "Gateway – meist die Adresse deines Routers, z. B. 192.168.178.1:"
  fi
  if ((PVE_MAJOR >= PVE_DEBIAN13_MAJOR)); then
    DEBIAN_VERSION="$(ask_menu "System" "Welches Debian soll im Container laufen?" "${DEBIAN_VERSION}" \
      13 "Debian 13 „trixie“ (empfohlen)" 12 "Debian 12 „bookworm“")" || cancelled
  fi
}

summary() {
  local bot="noch keiner – Anleitung im Panel unter „Discord“" netbird="nein (geht auch später)" net disk free
  if [[ -n "${TOKEN}" ]]; then bot="Token ist hinterlegt (wird nicht angezeigt)"; fi
  if [[ -n "${NB_KEY}" ]]; then netbird="ja, mit Setup-Key (${NB_URL:-NetBird Cloud})"; fi
  net="${BRIDGE}, IP per DHCP"
  if [[ "${CT_IP}" != dhcp ]]; then net="${BRIDGE}, feste IP ${CT_IP}, Gateway ${CT_GATEWAY:-?}"; fi
  disk="${DISK} GB auf ${STORAGE:-?}"
  free="$(storage_free_gb "${STORAGE}")"
  if [[ -n "${free}" ]]; then disk="${disk} (dort frei: ${free} GB)"; fi
  printf '%s\n' \
    "Container-ID: ${CTID} (Name: ${CT_HOSTNAME})" \
    "Domain: ${DOMAIN}" \
    "Discord-Bot: ${bot}" \
    "NetBird: ${netbird}" \
    "CPU-Kerne: ${CORES}" \
    "RAM: $(size_mb "${RAM}") (dazu $(size_mb "${SWAP}") Swap)" \
    "Festplatte: ${disk}" \
    "Netz: ${net}" \
    "System: Debian ${DEBIAN_VERSION}"
}

# Was am Rechner knapp ist – in einfachen Worten. Nichts, wenn alles passt.
resource_notes() {
  local line free awake modes
  for line in "${ADJUSTED[@]}"; do printf 'Angepasst – %s\n' "${line}"; done
  if ((HOST_RAM_MB > 0 && RAM > HOST_RAM_MB - HOST_RESERVE_MB)); then
    printf 'Achtung – RAM: Der Container darf %s nutzen, dein Proxmox hat aber nur %s GB (etwa 2 GB braucht er selbst). Laufen viele Spielmodi gleichzeitig, wird es eng.\n' \
      "$(size_mb "${RAM}")" "$(gb_round "${HOST_RAM_MB}")"
  fi
  if ((RAM < MIN_RAM_MB)); then
    printf 'Achtung – RAM: Mit %s laufen nur Lobby und Proxy gut. Für Spielmodi brauchst du mindestens 16 GB.\n' \
      "$(size_mb "${RAM}")"
  elif ((RAM < DEFAULT_RAM_MB)); then
    awake=$(((RAM - BASE_RAM_MB) / MODE_RAM_MB))
    modes="etwa ${awake} Spielmodi"
    if ((awake <= 1)); then modes="ein Spielmodus"; fi
    printf 'Hinweis – RAM: Mit %s laufen Lobby und %s gleichzeitig. Leere Modi schlafen und brauchen dann nichts; empfohlen sind 32 GB.\n' \
      "$(size_mb "${RAM}")" "${modes}"
  fi
  if ((HOST_CPUS > 0 && CORES > HOST_CPUS)); then
    printf 'Achtung – Kerne: Dein Proxmox hat nur %s Kerne.\n' "${HOST_CPUS}"
  fi
  if ((DISK < MIN_DISK_GB)); then
    printf 'Achtung – Festplatte: Unter %s GB wird es mit Welten, Sicherungen und Docker-Images schnell eng.\n' "${MIN_DISK_GB}"
  fi
  free="$(storage_free_gb "${STORAGE}")"
  if [[ -n "${free}" ]] && ((free < DISK)); then
    printf 'Achtung – Speicher: Auf %s sind nur noch %s GB frei, der Container darf bis zu %s GB groß werden. Läuft der Speicher voll, bleiben alle Container stehen – nimm weniger Festplatte oder räum auf.\n' \
      "${STORAGE}" "${free}" "${DISK}"
  fi
}

summary_text() {
  local notes
  notes="$(resource_notes)"
  summary
  if [[ -n "${notes}" ]]; then printf '\n%s\n' "${notes}"; fi
  printf '\n%s' "„Anlegen“ nimmt diese Werte. „Erweitert“: Name, Kerne, RAM, Swap, Festplatte, Speicher, Netz, feste IP und Debian-Version selbst festlegen."
}

if [[ -n "${ASKED}" ]]; then
  while :; do
    answer=0
    ask_summary "$(summary_text)" || answer=$?
    if ((answer == 0)); then break; fi
    if ((answer != 1)); then cancelled; fi
    advanced_settings
  done
fi

if [[ -z "${STORAGE}" ]]; then
  msg_error "Kein Speicher für Container gefunden. Setze STORAGE=… (z. B. local-lvm) und starte neu."
  exit 1
fi
must_pass hostname_problem "${CT_HOSTNAME}"
must_pass storage_problem "${STORAGE}"
must_pass bridge_problem "${BRIDGE}"
must_pass ip_problem "${CT_IP}"
if [[ "${CT_IP}" != dhcp ]]; then
  CT_GATEWAY="${CT_GATEWAY:-$(default_gateway)}"
  must_pass gateway_problem "${CT_GATEWAY}"
fi
if ((CORES < 1 || RAM < MB_PER_GB || DISK < SMALLEST_DISK_GB)); then
  msg_error "Zu wenig: mindestens 1 Kern, 1024 MB RAM und ${SMALLEST_DISK_GB} GB Festplatte."
  exit 1
fi
if [[ ! "${DEBIAN_VERSION}" =~ ^(12|13)$ ]]; then
  msg_error "DEBIAN_VERSION geht nur mit 12 oder 13."
  exit 1
fi
if [[ ! "${BRANCH}" =~ ^[A-Za-z0-9._/-]+$ || ! "${REPO_URL}" =~ ^https:// ]]; then
  msg_error "MM_BRANCH oder MM_REPO_URL sehen falsch aus."
  exit 1
fi

summary | sed 's/^/    /'
NOTES="$(resource_notes)"
if [[ -n "${NOTES}" ]]; then
  printf '\n'
  printf '%s\n' "${NOTES}" | sed "s/^/    ${YW}/; s/\$/${CL}/"
fi
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

NET0="name=eth0,bridge=${BRIDGE},ip=${CT_IP}"
if [[ "${CT_IP}" != dhcp ]]; then NET0="${NET0},gw=${CT_GATEWAY}"; fi

msg_info "Container ${CTID} wird angelegt"
pct create "${CTID}" "${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}" \
  --hostname "${CT_HOSTNAME}" \
  --cores "${CORES}" \
  --memory "${RAM}" \
  --swap "${SWAP}" \
  --rootfs "${STORAGE}:${DISK}" \
  --net0 "${NET0}" \
  --unprivileged 1 \
  --features nesting=1,keyctl=1 \
  --onboot 1 \
  --timezone host \
  --tags "minecraft;morninet" \
  --description "morni.net – Minecraft-Netzwerk (Webseite + Panel auf Port 8080). Anleitung: ${GUIDE_URL}" >/dev/null
CT_CREATED="yes"

# Kernel-Module (siehe HOST_MODULES) laden und dauerhaft eintragen. Dazu das Netzwerk-Gerät (TUN) für NetBird im
# Container – immer, damit NetBird auch später ohne Umbau geht.
for module in "${HOST_MODULES[@]}"; do modprobe "${module}" 2>/dev/null || true; done
printf '%s\n' "# morni.net: Kernel-Module für den Container (ein LXC kann keine eigenen laden)" "${HOST_MODULES[@]}" \
  >"${MODULES_LOAD_DIR}/morninet.conf"
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

# Pakete, Docker aus dem offiziellen Paket-Repo von Docker, morni.net holen.
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
    msg_ok "morni.net liegt schon in ${dir}"
  else
    msg_info "morni.net wird nach ${dir} geladen (Branch ${branch})"
    git clone --quiet --recurse-submodules --branch "${branch}" "${repo}" "${dir}"
    msg_ok "morni.net liegt in ${dir}"
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
# Umgebung (NB_SETUP_KEY), nicht als Argument. Bei einem eigenen NetBird-Server kommt dessen Adresse dazu (kein
# Geheimnis); ohne sie meldet sich NetBird bei NetBird Cloud an.
ct_netbird() {
  set -Eeuo pipefail
  local url="$1" secret="$2" management="$3" key installer
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
  if [[ -n "${management}" ]]; then
    NB_SETUP_KEY="${key}" netbird up --management-url "${management}" </dev/null >/dev/null
  else
    NB_SETUP_KEY="${key}" netbird up </dev/null >/dev/null
  fi
}

# Nach dem Verbinden: die Adresse des NetBird-Servers als Vorgabe fürs Panel (Einstellungen → Erreichbarkeit). Der
# Motor liest sie beim Start, darum startet er danach kurz neu (die Minecraft-Server laufen weiter).
ct_netbird_env() {
  set -Eeuo pipefail
  local dir="$1" script="vendor/mornihosting/scripts/netbird-env.sh"
  cd "${dir}"
  [[ -f "${script}" ]] || return 0
  if [[ -n "$(MH_ENV_FILE="${dir}/.env" bash "${script}")" ]]; then
    docker compose up -d motor >/dev/null
  fi
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
  if [[ -z "${SECRETS_DIR}" ]]; then SECRETS_DIR="$(mktemp -d /run/morninet-setup.XXXXXX)"; fi
  file="${SECRETS_DIR}/secret"
  (umask 077 && printf '%s' "${value}" >"${file}")
  PUSHED+=("${target}")
  pct push "${CTID}" "${file}" "${target}" --perms 0600
  rm -f "${file}"
}

msg_info "Warte auf das Netzwerk"
CT_ADDR=""
for _ in $(seq 1 "${WAIT_NET_TRIES}"); do
  CT_ADDR="$(in_ct ct_ip </dev/null 2>/dev/null)" || CT_ADDR=""
  if [[ -n "${CT_ADDR}" ]] && pct exec "${CTID}" -- getent hosts github.com </dev/null >/dev/null 2>&1; then
    break
  fi
  sleep "${WAIT_SECONDS}"
done
if [[ -z "${CT_ADDR}" ]]; then
  msg_error "Der Container hat keine IP bekommen. Prüfe DHCP auf ${BRIDGE} (oder nimm unter „Erweitert“ eine feste IP)."
  exit 1
fi
msg_ok "Container-IP: ${CT_ADDR}"

in_ct ct_prepare "${REPO_URL}" "${BRANCH}" "${INSTALL_DIR}" </dev/null

if [[ -n "${TOKEN}" ]]; then push_secret "${TOKEN}" "${TOKEN_IN_CT}"; fi
msg_info "morni.net wird im Container eingerichtet (das erste Mal dauert es ein paar Minuten)"
in_ct ct_install "${DOMAIN}" "${BRANCH}" "${INSTALL_DIR}" "${TOKEN_IN_CT}" </dev/null
PUSHED=()
msg_ok "morni.net ist installiert"

NETBIRD_OK=""
if [[ -n "${NB_KEY}" && -z "${TUN_OK}" ]]; then
  msg_error "NetBird übersprungen: Ohne Netzwerk-Gerät (TUN) auf dem Host geht es nicht."
elif [[ -n "${NB_KEY}" ]]; then
  msg_info "NetBird wird im Container eingerichtet"
  push_secret "${NB_KEY}" "${NETBIRD_KEY_IN_CT}"
  if in_ct ct_netbird "${NETBIRD_INSTALL_URL}" "${NETBIRD_KEY_IN_CT}" "${NB_URL}" </dev/null; then
    NETBIRD_OK="yes"
    msg_ok "NetBird verbunden – im NetBird-Dashboard heißt dieser Rechner ${CT_HOSTNAME}"
    in_ct ct_netbird_env "${INSTALL_DIR}" </dev/null || true
  else
    msg_error "NetBird ließ sich nicht einrichten. Später im Container (pct enter ${CTID}): netbird up"
  fi
  PUSHED=()
fi

CODE="$(pct exec "${CTID}" -- docker exec morninet cat /data/setup-code </dev/null 2>/dev/null | tr -d '\r\n')" || CODE=""

printf '\n %s🎉 %s ist bereit!%s\n\n' "${GN}" "${APP}" "${CL}"
printf '    Container %s „%s“ · IP %s\n\n' "${CTID}" "${CT_HOSTNAME}" "${CT_ADDR}"
if [[ -n "${CODE}" ]]; then
  printf '    1. Leg dein Owner-Konto an – im Browser bei dir zu Hause:\n'
  printf '       %shttp://%s:8080/panel/einrichtung%s\n' "${BL}" "${CT_ADDR}" "${CL}"
  printf '       Einrichtungs-Code: %s%s%s\n' "${GN}" "${CODE}" "${CL}"
  printf '       (Sobald deine Domain steht, geht es auch über https://%s/panel/einrichtung)\n' "${DOMAIN}"
else
  printf '    1. Panel: %shttp://%s:8080/panel%s (sobald die Domain steht: https://%s/panel)\n' \
    "${BL}" "${CT_ADDR}" "${CL}" "${DOMAIN}"
fi
if [[ -n "${NETBIRD_OK}" ]]; then
  printf '    2. NetBird: im Panel unter Einstellungen → Erreichbarkeit verbinden (Rechner „%s“) – Webseite, Proxy und\n' \
    "${CT_HOSTNAME}"
  printf '       „Hausanschluss verstecken“ richtet morni.net dann selbst ein (Domain %s).\n' "${DOMAIN}"
else
  printf '    2. Erreichbar machen: NetBird im Container verbinden, dann im Panel unter Einstellungen → Erreichbarkeit\n'
  printf '       (Domain %s, HTTPS, Minecraft-Ports) – Schritt für Schritt in der Anleitung, Teil 5.\n' "${DOMAIN}"
fi
if [[ -z "${TOKEN}" ]]; then
  printf '    3. Discord-Bot: Schritt für Schritt im Panel unter „Discord“.\n'
fi
printf '\n    Code nochmal anzeigen: %spct exec %s -- docker exec morninet cat /data/setup-code%s\n' \
  "${YW}" "${CTID}" "${CL}"
printf '    In den Container:      %spct enter %s%s\n' "${YW}" "${CTID}" "${CL}"
printf '    Anleitung:             %s\n' "${GUIDE_URL}"
printf '\n    Im Container ist nur Port 8080 offen (Webseite + Panel). Die Minecraft-Ports öffnet morni.net selbst,\n'
printf '    sobald es den Proxy für die Spieler anlegt. Motor, Docker-Zugang und Hub bleiben intern.\n\n'
