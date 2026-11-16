# 🏰 morni.net

Ein eigenes Minecraft-Netzwerk unter **morni.net** – Lobby, Spielmodi, Webseite mit Panel, Discord-Bot und Modpack. Java und Bedrock.

> 🚧 Im Aufbau. Den aktuellen Stand findest du in [STAND.md](STAND.md).
>
> Umbenannt in morni.net (16.11.2026). Bestehende Installationen ziehen beim nächsten Update von selbst um.

## Schnellstart

Du brauchst einen Rechner mit **Proxmox VE 8 oder 9** (empfohlen: 8 Kerne, 48 GB RAM oder mehr). Öffne in Proxmox
links deinen Rechner → **Shell** und füge diese Zeile ein:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/pmornhart/morni.net/main/proxmox/morninet.sh)"
```

Das Skript prüft deinen Rechner, fragt nach Domain, Discord-Bot-Token und NetBird, legt einen eigenen Container an und
installiert darin alles. Am Ende zeigt es die Adresse des Panels und deinen Einrichtungs-Code für das Owner-Konto.

**Alles Schritt für Schritt – vom leeren Rechner bis zum fertigen Netzwerk: [Von null zu morni.net](docs/schnellstart.md)**

## Quick start (English)

You need a machine running **Proxmox VE 8 or 9** (recommended: 8 cores, 48 GB RAM or more). In Proxmox, select your
node → **Shell** and paste this line:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/pmornhart/morni.net/main/proxmox/morninet.sh)"
```

The script checks your machine, asks for your domain, Discord bot token and NetBird setup key (all optional except the
domain), creates a dedicated container and installs everything into it. At the end it shows the panel address and the
setup code for your owner account: open `http://<container IP>:8080/panel` at home and enter it. The full step-by-step
guide (in German) is [docs/schnellstart.md](docs/schnellstart.md).

## Anleitungen

| Thema                                                  | Datei                                                    |
| ------------------------------------------------------ | -------------------------------------------------------- |
| Von null zu morni.net (Proxmox, Einrichtung, Domain …) | [docs/schnellstart.md](docs/schnellstart.md)             |
| Proxmox-Einzeiler im Detail (alle Einstellungen)       | [docs/proxmox-quickstart.md](docs/proxmox-quickstart.md) |
| Erreichbarkeit über NetBird, Hausanschluss verstecken  | [docs/netbird.md](docs/netbird.md)                       |
| Discord-Bot                                            | [docs/discord.md](docs/discord.md)                       |
| Modpack                                                | [docs/modpack.md](docs/modpack.md)                       |
| Wie alles zusammenhängt                                | [docs/architektur.md](docs/architektur.md)               |

---

<sub>Verfasst mit Claude 🤖</sub>
