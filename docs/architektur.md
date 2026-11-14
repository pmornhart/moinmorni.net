# Architektur – MoinMorni

Stand: 14.11.2026 (nach Philips Entscheidung „eigenständig, MorniHosting-Kern eingebaut“).

## Grundsätze

1. **Eigenständig.** MoinMorni läuft in einem eigenen Proxmox-Container mit eigener Webseite, eigenem Login und eigenen
   Minecraft-Servern. Philips MorniHosting-Panel sieht MoinMorni nicht und hat keinen Zugriff.
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
                    NetBird-Proxy (moinmorni.net)
             TCP 25565 · UDP 25565 · TCP/UDP 19132 · HTTPS
                               │
┌──────────────────────────────┼─────────────────────────────────────────┐
│ LXC „moinmorni“              │                                         │
│                              ▼                                         │
│   ┌────────────┐   ┌──────────────────┐   ┌──────────────────────────┐ │
│   │ moinmorni  │◄─►│ motor            │◄─►│ socket-proxy (Docker-API) │ │
│   │ Webseite   │   │ MorniHosting im  │   └──────────────────────────┘ │
│   │ Panel, Bot │   │ Motor-Modus      │                                │
│   │ Hub        │   │ (nur intern)     │──► Minecraft-Container          │
│   └─────▲──────┘   └──────────────────┘    velocity · lobby · duels …  │
│         │ signierte Verbindung (Hub)              │                     │
│         └─────────────────────────────────────────┘                     │
└─────────────────────────────────────────────────────────────────────────┘
```

- **moinmorni** (Fastify + React): öffentliche Webseite, Panel unter `/panel`, Discord-Bot (ohne offene Ports), Hub für
  die Plugins, Einstellungs-Katalog, Updates. Leitet `/panel/api/motor/*` an den Motor weiter (gleiche Domain → Login,
  Passkeys, Cookies des Motors gelten für moinmorni.net).
- **motor** = MorniHosting-Server-Image im Motor-Modus: keine Oberfläche, kein Registrieren, API nur im internen Netz.
  Team-Konten (Passkeys, 2FA) leben hier; MoinMorni ordnet ihnen Rollen zu.
- **Minecraft-Container** legt der Motor an: ein **Netzwerk** (neue MorniHosting-Funktion) aus Velocity-Proxy und
  Paper-Servern, automatisch verbunden (Modern Forwarding, gemeinsames Geheimnis), Geyser/Floodgate/Via/Voice am Proxy.
- **Hub:** Netzwerk-Plugin (Velocity + Paper) und Modus-Plugins verbinden sich selbst zum Hub (internes Netz,
  jede Nachricht signiert). Der Hub ist die Quelle für Ränge, Strafen, Freunde, Party, Chat, Statistiken, Einstellungen.

## Was in MorniHosting dazukommt (Branch + PR dort)

1. **Motor-Modus** (`MH_HEADLESS`): nur API, keine Oberfläche/Startseite/Registrierung, Dienst-Schlüssel per Befehl.
2. **Netzwerke:** Proxy + Server als Gruppe, Forwarding, Floodgate-Schlüssel, Geyser/Via/Voice am Proxy, Server dahinter
   ohne eigene Ports nach außen, Netzwerk an der Hauptdomain (NetBird).
3. **Schlüssel mit begrenzten Rechten** (Bereiche + Server), für Hub und Updates.
4. **Server-Seiten als Baustein:** API-Pfad einstellbar, Seiten/Reiter als Komponenten exportiert → MoinMorni bettet sie ein.
5. **Ereignisse nach außen, signiert** (Absturz, Backup, Update …) → MoinMorni-Bot meldet in Discord.

## Updates

- MoinMorni folgt seinem `main`; der Motor folgt MorniHosting `main` (eingebunden als Git-Submodul unter
  `vendor/mornihosting`, beim Update auf den neuesten Stand gezogen).
- Vor jedem Update Backup; nach dem Update Gesundheitsprüfung; schlägt sie fehl → alte Version zurück, Meldung in Discord.
- Modi holen sich neue Releases ihrer Repos; MorniCraft kommt über den Motor; Geyser/Floodgate/Via/Voice hält der Motor aktuell.
