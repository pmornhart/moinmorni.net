# MoinMorni installieren

So kommt MoinMorni auf deinen Rechner – am einfachsten mit **einer Zeile auf deinem Proxmox**. Das Skript legt einen
eigenen Container an, installiert darin alles und zeigt dir am Ende den Code für dein Owner-Konto.

## Was du brauchst

- **Proxmox VE** (8 oder 9) mit Internet.
- Platz für den Container – Standard: **32 GB RAM, 8 Kerne, 100 GB Festplatte** (leere Spielmodi schlafen und
  brauchen dann kaum etwas). Weniger geht auch, siehe unten.
- Deine **Domain** (z. B. `moinmorni.net`) – DNS bei INWX, Verkehr über NetBird.
- Optional: den **Token deines Discord-Bots** (geht auch später im Panel).
- Optional: einen **NetBird-Setup-Key** (NetBird-Dashboard → _Setup Keys → Create Setup Key_), dann ist der
  Container gleich in deinem NetBird-Netz.

## 1. Proxmox-Einzeiler

Öffne in Proxmox den Host (z. B. `pve`) → **Shell** und füge diese Zeile ein:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/pmornhart/moinmorni.net/main/proxmox/moinmorni.sh)"
```

Das Skript fragt nur vier Dinge:

| Frage                  | Vorschlag              | Hinweis                                                            |
| ---------------------- | ---------------------- | ------------------------------------------------------------------ |
| Container-ID           | die nächste freie Zahl | jede Nummer gibt es in Proxmox nur einmal (Container und VMs)      |
| Domain                 | `moinmorni.net`        | ohne `https://` und ohne `/`                                       |
| Token des Discord-Bots | leer                   | Eingabe bleibt unsichtbar; leer lassen = später im Panel eintragen |
| NetBird einrichten?    | Nein                   | bei Ja: Setup-Key einfügen (bleibt auch unsichtbar)                |

Danach siehst du eine Zusammenfassung. Mit **Ja** geht es los, mit **Nein** kannst du Kerne, RAM, Festplatte,
Speicher und Netzwerk ändern. Vertippt? Das Skript sagt, was nicht passt, und fragt nochmal.

### Was dann passiert

1. Die **Debian-Vorlage** wird geladen (Debian 13, gibt es die nicht: Debian 12).
2. Der **Container** wird angelegt:
   - _unprivilegiert_ – „root“ im Container ist auf dem Proxmox-Host kein root, das ist sicherer;
   - mit **Nesting** und **keyctl** – ohne diese beiden Schalter läuft Docker im Container nicht;
   - mit dem **Netzwerk-Gerät (TUN)** für NetBird – auch wenn du NetBird erst später einrichtest;
   - er **startet mit dem Host** und nimmt die Zeitzone des Hosts;
   - **ohne Root-Passwort** – hinein kommst du nur über den Host mit `pct enter <ID>`.
3. Auf dem Host werden die nötigen **Kernel-Module** geladen und dauerhaft eingetragen
   (`/etc/modules-load.d/moinmorni.conf`: `tun` für NetBird, `overlay` für Docker, Firewall-Module für den
   DDoS-Schutz). Ein Container teilt den Kernel des Hosts und kann sie nicht selbst laden.
4. Im Container: **Docker** aus dem offiziellen Paket-Repo von Docker, dazu `git` und `curl`. MoinMorni landet
   in `/opt/moinmorni`, zusammen mit dem **Motor** (MorniHosting, legt die Minecraft-Server an).
5. `install.sh` läuft **ohne Rückfragen**: Die Einstellungen kommen in `/opt/moinmorni/.env` – mit zufälligen
   Geheimnissen, **nur für root lesbar** –, dann starten Motor und MoinMorni. Das dauert beim ersten Mal ein paar
   Minuten.
6. Mit Setup-Key wird **NetBird** im Container installiert und verbunden. In NetBird heißt der Rechner `moinmorni`.
7. Am Ende stehen die **Adressen** und dein **Einrichtungs-Code** da.

**Dein Bot-Token** (und der NetBird-Key) wird nie angezeigt und steht nie in einer Befehlszeile, in der
Prozessliste oder in einem Protokoll. Er geht als Datei, die nur root lesen darf, in den Container, `install.sh`
trägt ihn in die `.env` ein, und die Datei wird sofort gelöscht.

Geht unterwegs etwas schief, sagt das Skript in welcher Zeile. Der Container bleibt dann zum Nachsehen stehen
(`pct enter <ID>`); ganz neu anfangen kannst du mit `pct stop <ID>; pct destroy <ID>` und nochmal dem Einzeiler.

### Ohne Fragen

Alle Antworten lassen sich vorher setzen – dann fragt das Skript gar nichts:

| Variable                 | Standard                      | Bedeutung                                                |
| ------------------------ | ----------------------------- | -------------------------------------------------------- |
| `CTID`                   | nächste freie Nummer          | Container-ID                                             |
| `MM_DOMAIN`              | `moinmorni.net`               | Domain                                                   |
| `MM_DISCORD_TOKEN_FILE`  | –                             | Datei, in der der Bot-Token steht                        |
| `MM_DISCORD_TOKEN`       | –                             | `MM_DISCORD_TOKEN=` (leer) = kein Token, nicht fragen    |
| `NETBIRD_SETUP_KEY_FILE` | –                             | Datei, in der der NetBird-Setup-Key steht                |
| `NETBIRD_SETUP_KEY`      | –                             | `NETBIRD_SETUP_KEY=` (leer) = kein NetBird, nicht fragen |
| `MM_BRANCH`              | `main`                        | welcher Stand von MoinMorni geladen wird                 |
| `CT_HOSTNAME`            | `moinmorni`                   | Name des Containers (auch in NetBird)                    |
| `CORES`                  | `8`                           | CPU-Kerne                                                |
| `RAM` / `SWAP`           | `32768` / `4096`              | Arbeitsspeicher und Auslagerung in MB                    |
| `DISK`                   | `100`                         | Festplatte in GB                                         |
| `STORAGE`                | erster Speicher für Container | z. B. `local-lvm`                                        |
| `TEMPLATE_STORAGE`       | `local`                       | wo die Debian-Vorlage liegt                              |
| `BRIDGE`                 | `vmbr0`                       | Netzwerk (der Container holt sich seine IP per DHCP)     |
| `DEBIAN_VERSION`         | `13`                          | `12` für Debian 12                                       |

Geheimnisse bitte **nicht** direkt in die Zeile schreiben (`MM_DISCORD_TOKEN=abc…`) – sonst stehen sie in der
Shell-History. Besser fragen lassen oder aus einer Datei lesen:

```bash
nano /root/bot-token && chmod 600 /root/bot-token
```

```bash
CTID=120 MM_DOMAIN=moinmorni.net MM_DISCORD_TOKEN_FILE=/root/bot-token NETBIRD_SETUP_KEY= \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/pmornhart/moinmorni.net/main/proxmox/moinmorni.sh)"
```

```bash
shred -u /root/bot-token
```

## 2. Erstes Konto anlegen

Öffne `https://<deine Domain>/panel/einrichtung` (oder zu Hause `http://<IP des Containers>:8080/panel/einrichtung`),
gib den Einrichtungs-Code ein und leg dein Konto an – es wird automatisch **Owner**. Den Code kannst du jederzeit
nochmal anzeigen lassen (in der Shell des Hosts):

```bash
pct exec <ID> -- docker exec moinmorni cat /data/setup-code
```

Nach der Einrichtung gilt der Code nicht mehr, und niemand kann sich selbst registrieren – Team-Konten legst du im
Panel an.

## 3. HTTPS über NetBird

Lege in NetBird einen **HTTP-Dienst** für deine Domain an, Ziel der Container auf Port **8080**, mit
**„Pass Host Header“** (sonst gehen Passkeys nicht). Hast du beim Einzeiler einen Setup-Key angegeben, ist der
Container schon in NetBird und heißt dort `moinmorni`. Die Minecraft-Adressen richtet MoinMorni später selbst ein.

NetBird später nachholen: `pct enter <ID>`, dann
`curl -fsSL https://pkgs.netbird.io/install.sh -o /tmp/netbird.sh && sh /tmp/netbird.sh` und `netbird up`
(die Anmeldung läuft dann im Browser). Das Netzwerk-Gerät dafür ist schon eingerichtet.

## Was von außen erreichbar ist

Im Container ist nur die Webseite offen (Port 8080, HTTPS macht NetBird). Den Proxy für die Minecraft-Spieler legt
MoinMorni selbst an. Der Motor, der Zugang zu Docker (nur über einen Socket-Proxy) und der Hub für die Plugins
bleiben im Container.

## Ohne Proxmox-Einzeiler

In einer VM oder einem selbst angelegten Container mit **Debian 12/13 oder Ubuntu 24.04** (als root):

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/pmornhart/moinmorni.net/main/install.sh)"
```

Beim selbst angelegten Container unter _Optionen → Features_ **„Nesting“ und „keyctl“** anhaken – sonst läuft
Docker darin nicht. `install.sh` fragt nur nach Domain und Bot-Token.

## Später mehr RAM oder Festplatte

In der Shell des Hosts, `<ID>` ist die Nummer des Containers:

```bash
pct set <ID> --memory 65536     # RAM in MB, hier 64 GB
pct resize <ID> rootfs +200G    # Festplatte um 200 GB vergrößern
```

Der RAM gilt sofort. Verkleinern geht bei der Festplatte nicht.

## Nützliche Befehle

In den Container wechseln (Shell des Hosts):

```bash
pct enter <ID>
```

Im Container:

```bash
cd /opt/moinmorni && docker compose ps
```

```bash
cd /opt/moinmorni && docker compose logs -f moinmorni
```

```bash
docker exec moinmorni-motor node /app/server/dist/cli.js list-users
```

## Fragen

**Docker startet im Container nicht.** Der Container braucht _Nesting_ und _keyctl_ (der Einzeiler setzt beide).
Hilft das nicht, Proxmox auf den neuesten Stand bringen (`apt update && apt full-upgrade` auf dem Host).

**„Keine Debian-Vorlage gefunden“.** Der Host kommt nicht an die Vorlagen-Liste von Proxmox. Prüfe das Internet
des Hosts oder lade die Vorlage unter _local → CT-Vorlagen → Vorlagen_ von Hand.

**Ich will das Skript ausprobieren, ohne etwas anzulegen.** Im Repo gibt es einen Test mit nachgebautem Proxmox:
`sudo bash proxmox/test/run.sh` (braucht Linux mit `unshare` und `script`).
