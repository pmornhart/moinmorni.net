# morni.net auf Proxmox – der Einzeiler im Detail

> Neu hier, noch ohne Proxmox? Fang mit **[Von null zu morni.net](schnellstart.md)** an – dort steht alles Schritt für
> Schritt, vom leeren Rechner bis zum fertigen Netzwerk. Hier steht der Einzeiler zum Nachschlagen.

So kommt morni.net auf deinen Rechner – am einfachsten mit **einer Zeile auf deinem Proxmox**. Das Skript legt einen
eigenen Container an, installiert darin alles und zeigt dir am Ende IP, Panel-Adresse und den Code für dein
Owner-Konto.

## Was du brauchst

- **Proxmox VE 8 oder 9** mit Internet (frisch installiert reicht).
- Platz für den Container – Standard: **32 GB RAM, 8 Kerne, 100 GB Festplatte**. Leere Spielmodi schlafen und
  brauchen dann nichts. Hat dein Proxmox weniger Kerne oder RAM, nimmt das Skript von selbst weniger und sagt dir, was
  das bedeutet.
- Deine **Domain** (z. B. `morni.net`) – DNS bei INWX, Verkehr über NetBird.
- Optional: den **Token deines Discord-Bots** (geht auch später, siehe [Discord einrichten](discord.md)).
- Optional: einen **NetBird-Setup-Key** (NetBird-Dashboard → _Setup Keys → Create Setup Key_), dann ist der
  Container gleich in deinem NetBird-Netz.

## 1. Proxmox-Einzeiler

Öffne in Proxmox den Host (z. B. `pve`) → **Shell** und füge diese Zeile ein:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/pmornhart/morni.net/main/proxmox/morninet.sh)"
```

### Vorher prüft das Skript deinen Rechner

- **Proxmox-Version:** 8 oder 9. Ältere Versionen bekommen keine Sicherheits-Updates mehr – dann bricht das Skript ab,
  bevor es etwas anlegt.
- **Kerne und RAM:** Hat dein Proxmox weniger als 8 Kerne, bekommt der Container so viele, wie da sind. Hat er weniger
  als 34 GB RAM, bekommt der Container den RAM des Rechners minus 2 GB (die braucht Proxmox selbst). Das Skript sagt
  dir, wie viele Spielmodi dann gleichzeitig laufen.
- **Freier Platz:** Ist auf dem Proxmox-Speicher weniger frei, als der Container werden darf, kommt eine Warnung –
  läuft der Speicher voll, bleiben alle Container stehen.

### Die Fragen

| Frage                  | Vorschlag              | Hinweis                                                                                          |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------------------------------ |
| Container-ID           | die nächste freie Zahl | jede Nummer gibt es in Proxmox nur einmal (Container und VMs)                                    |
| Domain                 | `morni.net`            | ohne `https://` und ohne `/`                                                                     |
| Token des Discord-Bots | leer                   | Eingabe bleibt unsichtbar; leer lassen = später eintragen (zeigt das Panel)                      |
| NetBird einrichten?    | Nein                   | bei Ja: Setup-Key einfügen (bleibt auch unsichtbar)                                              |
| NetBird-Server         | leer                   | nur bei eigenem NetBird: seine Adresse, z. B. `https://netbird.example.de`; leer = NetBird Cloud |

Danach zeigt das Skript alle Werte auf einen Blick – mit Hinweisen, falls am Rechner etwas knapp ist:

- **Anlegen** nimmt die Standard-Einstellungen.
- **Erweitert** lässt dich alles selbst festlegen: Name des Containers, CPU-Kerne, RAM, Swap, Festplatte,
  Proxmox-Speicher (aus einer Liste mit freiem Platz), Netzwerk-Bridge (aus einer Liste), **feste IP-Adresse** mit
  Gateway (statt per DHCP vom Router) und Debian-Version. Danach kommt die Übersicht nochmal.

Vertippt? Das Skript sagt, was nicht passt, und fragt nochmal. Mit **Esc** brichst du ab, dann wird nichts angelegt.

### Was dann passiert

1. Die **Debian-Vorlage** wird geladen: auf Proxmox 9 Debian 13, auf Proxmox 8 Debian 12 (gibt es Debian 13 nicht, nimmt
   es Debian 12).
2. Der **Container** wird angelegt:
   - _unprivilegiert_ – „root“ im Container ist auf dem Proxmox-Host kein root, das ist sicherer;
   - mit **Nesting** und **keyctl** – ohne diese beiden Schalter läuft Docker im Container nicht;
   - mit dem **Netzwerk-Gerät (TUN)** für NetBird – auch wenn du NetBird erst später einrichtest;
   - er **startet mit dem Host** und nimmt die Zeitzone des Hosts;
   - **ohne Root-Passwort** – hinein kommst du nur über den Host mit `pct enter <ID>`.
3. Auf dem Host werden die nötigen **Kernel-Module** geladen und dauerhaft eingetragen
   (`/etc/modules-load.d/morninet.conf`: `tun` für NetBird, `overlay` für Docker, Firewall-Module für den
   DDoS-Schutz). Ein Container teilt den Kernel des Hosts und kann sie nicht selbst laden.
4. Im Container: **Docker** aus dem offiziellen Paket-Repo von Docker, dazu `git` und `curl`. morni.net landet
   in `/opt/morninet`, zusammen mit dem **Motor** (MorniHosting, legt die Minecraft-Server an).
5. `install.sh` läuft **ohne Rückfragen**: Die Einstellungen kommen in `/opt/morninet/.env` – mit zufälligen
   Geheimnissen, **nur für root lesbar** –, dann starten Motor und morni.net. Das dauert beim ersten Mal 10 bis 30
   Minuten.
6. Mit Setup-Key wird **NetBird** im Container installiert und verbunden (bei eigenem NetBird-Server mit dessen
   Adresse). In NetBird heißt der Rechner `morninet`.
7. Am Ende stehen **IP**, **Panel-Adresse** und dein **Einrichtungs-Code** da, dazu die nächsten Schritte.

**Dein Bot-Token** (und der NetBird-Key) wird nie angezeigt und steht nie in einer Befehlszeile, in der
Prozessliste oder in einem Protokoll. Er geht als Datei, die nur root lesen darf, in den Container, `install.sh`
trägt ihn in die `.env` ein, und die Datei wird sofort gelöscht.

Geht unterwegs etwas schief, sagt das Skript in welcher Zeile. Der Container bleibt dann zum Nachsehen stehen
(`pct enter <ID>`); ganz neu anfangen kannst du mit `pct stop <ID>; pct destroy <ID>` und nochmal dem Einzeiler.

### Ohne Fragen

Alle Antworten lassen sich vorher setzen – dann fragt das Skript gar nichts:

| Variable                 | Standard                                   | Bedeutung                                                                                      |
| ------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `CTID`                   | nächste freie Nummer                       | Container-ID                                                                                   |
| `MM_DOMAIN`              | `morni.net`                                | Domain                                                                                         |
| `MM_DISCORD_TOKEN_FILE`  | –                                          | Datei, in der der Bot-Token steht                                                              |
| `MM_DISCORD_TOKEN`       | –                                          | `MM_DISCORD_TOKEN=` (leer) = kein Token, nicht fragen                                          |
| `NETBIRD_SETUP_KEY_FILE` | –                                          | Datei, in der der NetBird-Setup-Key steht                                                      |
| `NETBIRD_SETUP_KEY`      | –                                          | `NETBIRD_SETUP_KEY=` (leer) = kein NetBird, nicht fragen                                       |
| `NETBIRD_MANAGEMENT_URL` | – (NetBird Cloud)                          | Adresse deines eigenen NetBird-Servers (nur `https://…`)                                       |
| `MM_BRANCH`              | `main`                                     | welcher Stand von morni.net geladen wird                                                       |
| `CT_HOSTNAME`            | `morninet`                                 | Name des Containers (auch in NetBird)                                                          |
| `CORES`                  | `8` (höchstens so viele, wie der Host hat) | CPU-Kerne                                                                                      |
| `RAM` / `SWAP`           | `32768` / `4096`                           | Arbeitsspeicher und Auslagerung in MB (RAM: höchstens Host-RAM minus 2 GB, außer du setzt ihn) |
| `DISK`                   | `100`                                      | Festplatte in GB                                                                               |
| `STORAGE`                | erster Speicher für Container              | z. B. `local-lvm`                                                                              |
| `TEMPLATE_STORAGE`       | `local`                                    | wo die Debian-Vorlage liegt                                                                    |
| `BRIDGE`                 | `vmbr0`                                    | Netzwerk-Bridge                                                                                |
| `CT_IP`                  | `dhcp`                                     | oder eine feste Adresse mit Netzgröße, z. B. `192.168.178.50/24`                               |
| `CT_GATEWAY`             | Gateway des Hosts                          | nur bei fester IP, z. B. `192.168.178.1`                                                       |
| `DEBIAN_VERSION`         | `13` (Proxmox 9) / `12` (Proxmox 8)        | Debian im Container                                                                            |

Geheimnisse bitte **nicht** direkt in die Zeile schreiben (`MM_DISCORD_TOKEN=abc…`) – sonst stehen sie in der
Shell-History. Besser fragen lassen oder aus einer Datei lesen:

```bash
nano /root/bot-token && chmod 600 /root/bot-token
```

```bash
CTID=120 MM_DOMAIN=morni.net MM_DISCORD_TOKEN_FILE=/root/bot-token NETBIRD_SETUP_KEY= CT_IP=192.168.178.50/24 \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/pmornhart/morni.net/main/proxmox/morninet.sh)"
```

```bash
shred -u /root/bot-token
```

## 2. Erstes Konto anlegen

Öffne zu Hause `http://<IP des Containers>:8080/panel/einrichtung` (sobald deine Domain steht, geht auch
`https://<deine Domain>/panel/einrichtung`), gib den Einrichtungs-Code ein und leg dein Konto an – es wird
automatisch **Owner**. Den Code kannst du jederzeit nochmal anzeigen lassen (in der Shell des Hosts):

```bash
pct exec <ID> -- docker exec morninet cat /data/setup-code
```

Nach der Einrichtung gilt der Code nicht mehr, und niemand kann sich selbst registrieren – Team-Konten legst du im
Panel an.

## 3. HTTPS über NetBird

Am einfachsten im Panel: **Einstellungen → Erreichbarkeit** verbindet NetBird, legt die Webseite auf deine Domain
(HTTPS mit „Pass Host Header“, Port **8080**), bringt das Spiel auf die Domain und versteckt auf Wunsch deinen
Hausanschluss – Schritt für Schritt in der [NetBird-Anleitung](netbird.md). Hast du beim Einzeiler einen Setup-Key
angegeben, ist der Container schon in NetBird und heißt dort `morninet`.

Von Hand geht es auch: in NetBird einen **HTTP-Dienst** für deine Domain anlegen, Ziel der Container auf Port
**8080**, mit **„Pass Host Header“** (sonst gehen Passkeys nicht).

NetBird später nachholen – mit unsichtbarer Eingabe des Setup-Keys und, bei eigenem NetBird-Server, dessen Adresse:
siehe [Von null zu morni.net, Teil 5.1](schnellstart.md#51-netbird-im-container). Das Netzwerk-Gerät dafür ist schon
eingerichtet.

## Was von außen erreichbar ist

Im Container ist nur die Webseite offen (Port 8080, HTTPS macht NetBird). Den Proxy für die Minecraft-Spieler legt
morni.net selbst an. Der Motor, der Zugang zu Docker (nur über einen Socket-Proxy) und der Hub für die Plugins
bleiben im Container.

## Ohne Proxmox-Einzeiler

In einer VM oder einem selbst angelegten Container mit **Debian 12/13 oder Ubuntu 24.04** (als root):

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/pmornhart/morni.net/main/install.sh)"
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
cd /opt/morninet && docker compose ps
```

```bash
cd /opt/morninet && docker compose logs -f morninet
```

```bash
docker exec morninet-motor node /app/server/dist/cli.js list-users
```

## Umbenennung in morni.net (16.11.2026)

Eine Installation, die noch unter dem früheren Namen läuft, zieht bei ihrem nächsten Update von selbst um (Knopf im
Panel oder automatisch): Docker-Volumes (auf derselben Platte nur umbenannt – Welten und Datenbanken bleiben, wie sie
sind), Container, systemd-Einheiten, der Ordner `/opt/morninet` und die Sicherungen unter `/var/backups/morninet`.
Minecraft-Server laufen dabei weiter und kommen bei ihrem nächsten Neustart ins neue Netz. Klappt etwas nicht, liegt
alles wieder am alten Platz und die alte Fassung läuft weiter.

Was nicht im Container liegt, bleibt, wie es ist, und darf so bleiben:

- der Name des Containers in Proxmox und in NetBird – umbenennen geht mit `pct set <ID> --hostname morninet`
  (danach NetBird im Container neu verbinden),
- die Datei mit den Kernel-Modulen unter `/etc/modules-load.d/` auf dem Host,
- die Domain in `/opt/morninet/.env` (`MM_DOMAIN`): erst auf `morni.net` stellen, wenn DNS und NetBird für die neue
  Domain stehen, dann `cd /opt/morninet && docker compose up -d`. Passkeys gehören zur Domain – nach dem Wechsel
  meldet sich das Team einmal mit Passwort (und 2FA) an und legt seine Passkeys neu an.

## Fragen

Mehr Probleme und Lösungen: [Von null zu morni.net, Teil 10](schnellstart.md#10-probleme-und-lösungen).

**Das Skript sagt, mein Rechner hat zu wenig RAM.** Das ist nur ein Hinweis. morni.net läuft trotzdem – es laufen
dann nur weniger Spielmodi gleichzeitig. Leere Modi schlafen und brauchen nichts. Später mehr RAM geben: siehe oben.

**Docker startet im Container nicht.** Der Container braucht _Nesting_ und _keyctl_ (der Einzeiler setzt beide).
Hilft das nicht, Proxmox auf den neuesten Stand bringen (`apt update && apt full-upgrade` auf dem Host).

**„Keine Debian-Vorlage gefunden“.** Der Host kommt nicht an die Vorlagen-Liste von Proxmox. Prüfe das Internet
des Hosts oder lade die Vorlage unter _local → CT-Vorlagen → Vorlagen_ von Hand.

**Ich will das Skript ausprobieren, ohne etwas anzulegen.** Im Repo gibt es einen Test mit nachgebautem Proxmox:
`sudo bash proxmox/test/run.sh` (braucht Linux mit `unshare` und `script`).
