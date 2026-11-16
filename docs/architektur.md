# Architektur – morni.net

Stand: 14.11.2026 (nach Philips Entscheidung „eigenständig, MorniHosting-Kern eingebaut“).

## Grundsätze

1. **Eigenständig.** morni.net läuft in einem eigenen Proxmox-Container mit eigener Webseite, eigenem Login und eigenen
   Minecraft-Servern. Philips MorniHosting-Panel sieht morni.net nicht und hat keinen Zugriff.
2. **Nichts doppelt bauen.** Server steuern (Docker, Konsole, Dateien, Backups, Marktplatz, Routinen, Absturz-Helfer,
   Geyser/Voice/Via, NetBird, DDoS, Dauerbetrieb, Login mit Passkeys/2FA …) übernimmt der **MorniHosting-Kern als
   eingebauter „Motor“** – unverändertes MorniHosting im Motor-Modus, ohne eigene Oberfläche, nur intern erreichbar.
   Was fehlt, wird in MorniHosting eingebaut (eigener Branch + PR), damit beide Projekte etwas davon haben.
3. **Alles im Panel.** Jede Einstellung, die im Spiel per Befehl geht, geht auch im Panel – nach Bereichen und Modi
   sortiert, mit Suche, Erklärungen und Rundgang. Technisch: ein **Einstellungs-Katalog** (eine Quelle, Zod-Schemas in
   `packages/shared`), aus dem Panel-Formulare, Prüfungen und die Konfiguration der Plugins entstehen. Befehle im Spiel
   ändern denselben Wert über den Hub.
4. **Sicher.** Keine Geheimnisse im Repo, Docker nur über den Socket-Proxy, von außen nur Proxy (Minecraft) und Webseite.

## Container (Proxmox-LXC, Standard 8 Kerne, 32 GB RAM)

```
                    NetBird-Proxy (morni.net)
             TCP 25565 · UDP 25565 · TCP/UDP 19132 · HTTPS
                               │
┌──────────────────────────────┼─────────────────────────────────────────┐
│ LXC „morninet“              │                                         │
│                              ▼                                         │
│   ┌────────────┐   ┌──────────────────┐   ┌──────────────────────────┐ │
│   │ morninet  │◄─►│ motor            │◄─►│ socket-proxy (Docker-API) │ │
│   │ Webseite   │   │ MorniHosting im  │   └──────────────────────────┘ │
│   │ Panel, Bot │   │ Motor-Modus      │                                │
│   │ Hub        │   │ (nur intern)     │──► Minecraft-Container          │
│   └─────▲──────┘   └──────────────────┘    velocity · lobby · duels …  │
│         │ signierte Verbindung (Hub)              │                     │
│         └─────────────────────────────────────────┘                     │
└─────────────────────────────────────────────────────────────────────────┘
```

- **morninet** (Fastify + React): öffentliche Webseite, Panel unter `/panel`, Discord-Bot (ohne offene Ports), Hub für
  die Plugins, Einstellungs-Katalog, Updates. Leitet `/panel/api/motor/*` an den Motor weiter (gleiche Domain → Login,
  Passkeys, Cookies des Motors gelten für morni.net).
- **motor** = MorniHosting-Server-Image im Motor-Modus: keine Oberfläche, kein Registrieren, API nur im internen Netz.
  Team-Konten (Passkeys, 2FA) leben hier; morni.net ordnet ihnen Rollen zu.
- **Minecraft-Container** legt der Motor an: ein **Netzwerk** (neue MorniHosting-Funktion) aus Velocity-Proxy und
  Paper-Servern, automatisch verbunden (Modern Forwarding, gemeinsames Geheimnis), Geyser/Floodgate/Via/Voice am Proxy.
- **Hub:** Netzwerk-Plugin (Velocity + Paper) und Modus-Plugins verbinden sich selbst zum Hub (internes Netz,
  jede Nachricht signiert). Der Hub ist die Quelle für Ränge, Strafen, Freunde, Party, Chat, Statistiken, Einstellungen.

## Was in MorniHosting dazukommt (Branch + PR dort)

1. **Motor-Modus** (`MH_HEADLESS`): nur API, keine Oberfläche/Startseite/Registrierung, Dienst-Schlüssel per Befehl.
2. **Netzwerke:** Proxy + Server als Gruppe, Forwarding, Floodgate-Schlüssel, Geyser/Via/Voice am Proxy, Server dahinter
   ohne eigene Ports nach außen, Netzwerk an der Hauptdomain (NetBird).
3. **Schlüssel mit begrenzten Rechten** (Bereiche + Server), für Hub und Updates.
4. **Server-Seiten als Baustein:** API-Pfad einstellbar, Seiten/Reiter als Komponenten exportiert → morni.net bettet sie ein.
5. **Meldungen nach außen** (Wächter, NetBird-Ausgang, Absturz, Backup …) über die Live-Verbindung `/api/ws`
   (Kanal „alerts“, nur mit Schlüssel) → morni.net meldet sie im Discord-Team-Log.
6. **NetBird für ein zweites Produkt** (`MH_BRAND=morni.net`): eigene Namen in NetBird, Spiel direkt auf der Domain,
   derselbe Ausgang wie MorniHosting („Hausanschluss verstecken“), Karten zum Einbetten, Wächter mit eigenen Namen
   (siehe [NetBird-Anleitung](netbird.md)).

## Updates

- morni.net folgt seinem `main`; der Motor folgt MorniHosting `main` (eingebunden als Git-Submodul unter
  `vendor/mornihosting`, beim Update auf den neuesten Stand gezogen).
- Vor jedem Update Backup; nach dem Update Gesundheitsprüfung; schlägt sie fehl → alte Version zurück, Meldung in Discord.
- Modi holen sich neue Releases ihrer Repos; MorniCraft kommt über den Motor; Geyser/Floodgate/Via/Voice hält der Motor aktuell.

## Aufbau im Detail (Baustein 4, 14.11.)

### Repo `morni.net`
```
apps/server        Fastify 5 + Zod + SQLite/Drizzle: Webseite-API, Panel-API, Hub, Motor-Anbindung, Bot (später)
apps/web           React 19 + Vite + Tailwind 4: öffentliche Webseite (/) und Panel (/panel)
packages/shared    Typen, Zod-Schemas, Rollen-Vorlage, Einstellungs-Katalog
packages/builder   Bau-Baukasten (Lobby, Arenen, Spielfelder)
plugins/           Java: Netzwerk-Plugin (Velocity + Paper) und gemeinsame API für die Modi
vendor/mornihosting  Git-Submodul: MorniHosting (Motor-Image + einbettbare Server-Seiten)
proxmox/, install.sh, update.sh, docker-compose.yml
```

### Container (docker compose im LXC)
| Dienst | Netz | nach außen |
|---|---|---|
| `socket-proxy` (tecnativa) | `docker-api` (intern) | – |
| `motor` = MorniHosting, `MH_HEADLESS=true`, Router aus | `docker-api`, `morninet-intern` | – |
| `morninet` (Webseite, Panel, Hub, Bot) | `morninet-intern`, `morninet-mc` | 8080 (HTTP, NetBird macht HTTPS) |
| Minecraft-Container (vom Motor angelegt) | `morninet-mc` | nur der Proxy: 25565 TCP+UDP, 19132 TCP+UDP |

- Plugins erreichen den Hub als `ws://morninet:8090` im Netz `morninet-mc` – der Hub-Port ist nie nach außen offen.
- `morninet` spricht den Motor als `http://motor:8080` mit einem Dienst-Schlüssel (`service-token morninet`),
  und leitet `/panel/motor/api/*` (inkl. WebSocket) für angemeldete Team-Mitglieder an den Motor weiter.
- Login: Team-Konten leben im Motor (Passkeys, 2FA). morni.net prüft die Sitzung über `/api/auth/me` des Motors
  und ordnet dem Konto eine morni.net-Rolle zu (Owner, Admin, Moderator …).
