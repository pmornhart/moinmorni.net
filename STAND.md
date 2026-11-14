# Stand – MoinMorni

**Ziel:** Eigenes Minecraft-Netzwerk unter moinmorni.net (Java + Bedrock) mit Lobby und mehreren Spielmodi, öffentlicher Webseite mit Panel, eigenem Discord-Bot und Modpack – **eigenständig** im eigenen Container (MorniHosting-Kern als eingebauter Motor), richtet sich selbst ein und hält sich aktuell. Architektur: `docs/architektur.md`.

## Entscheidungen (14.11.2026)

- Repo `pmornhart/moinmorni.net`, **öffentlich** → Chat-Sicherung aus
- Update-Funktion: **ja** · „Verfasst mit Claude 🤖“: **ja** · Proxmox-Quick-Start: **ja**
- Entwicklungs-Branch: `claude/funny-archimedes-awjk48`
- Mitbauen in `pmornhart/MorniHosting` und `pmornhart/MorniCraft` (eigene Branches + PRs)

## Antworten Runde 1 (14.11.)

- **Versionen:** Java ab 1.17 bis neueste (ViaVersion/ViaBackwards am Proxy), Bedrock immer aktuell (Geyser), nur echte Konten.
- **Erreichbarkeit:** wie MorniHosting über Philips NetBird-Proxy weiterleiten, Domain `moinmorni.net` in NetBird anlegen. DNS bei **INWX**, Verkehr läuft über NetBird.
- **Rollen:** Vorlage Owner ♛ / **Admin (neu)** / Moderator ⚔ / Builder ⚒ / Media ▶ / VIP ★ / Spieler. VIP vergibt nur Philip, **nie ein Shop**.
- **Discord:** noch kein Server → Vorlage oder Bot richtet alles allein ein (Machbarkeit wird geprüft).
- **Modpack:** alles, was es gut aussehen lässt, plus Werkzeuge für Builder; Veröffentlichung auf Modrinth.
- **Lobby:** groß und schön; Saison-Deko (Wiesn, Winter, Ostern, Halloween) ja.
- **Duels:** an MCPVP orientieren (nur Spielgefühl, keine Namen/Grafiken).
- **Morni Party:** mehrere Spielfelder und Minispiele, an Cytooxien orientieren (nur Mechanik, eigene Namen/Optik).
- **Modi allein/zusammen:** erst ein paar bauen, Philip schaut sie an, dann weiter.
- **MorniCraft:** nur für Leute auf der Whitelist, Bewerbung möglich; Modus kann ganz aus sein (läuft gerade nicht).
- **Chat:** gemeinsamer Chat mit Server-Kürzel, Runden-Chat, im Panel einstellbar. **Voice-Chat auch über Server/Modi hinweg.**
- **Strafen:** gelten überall inkl. Discord (Bann, Timeout, Gefängnis-Rolle). Admins/Mods können jeder Voice-Gruppe ohne Passwort beitreten und Leute im Voice-Chat stummschalten.
- **Sprache:** automatisch nach Client, `/sprache`. **Profile:** öffentlich, `/profil privat`.
- **Impressum:** gibt Philip bei Bedarf später; nie im Repo.
- **Panel:** unter `moinmorni.net/panel`.
- **Repos:** je Modus ein eigenes Repo; Philip legt sie an (Namensliste folgt).
- **Anbindung (Q21/Q23):** wie vorgeschlagen – in MorniHosting einbauen: Netzwerke (allgemeine Funktion), „Mit MorniHosting anmelden“, Schlüssel mit begrenzten Rechten, Server-Seiten als einbettbarer Baustein; MoinMorni bettet sie ein.
- **Login (Q22):** alle aus dem Team; Spieler nur optional (z. B. für Fragen/Support).
- **MorniCraft-Netzwerk-Modus (Q24):** ja, Ränge usw. in beiden Repos (MorniCraft + MorniHosting) anpassen.
- **RAM (Q25):** so viel wie nötig, Schlaf-Modus für leere Modi.
- **Bau-Server (Q26):** ja, Bauteam mit passenden Einstellungen.

## Antworten Runde 2 + Änderung (14.11.)

- **Eigenständig (ersetzt Q21/Q22-Anbindung):** eigener Container, eigene Webseite, eigener Login; Philips MorniHosting-Panel hat keinen Zugriff. MorniHosting-Kern als unsichtbarer Motor (Motor-Modus) – kein „Mit MorniHosting anmelden“ mehr. Team-Konten mit Passkeys/2FA leben im Motor.
- **Leistung:** Container 32 GB RAM, 8 Kerne; leere Modi schlafen.
- **Alles im Panel:** jede per Befehl änderbare Einstellung auch im Panel, sortiert, Suche, Rundgang.
- **Rundgänge:** Panel (Team), Lobby (neue Spieler), Hilfe-Seiten (Webseite), Discord `/hilfe` + Begrüßung.
- **Runde 2 – alle Empfehlungen:** Duels mit Klassisch (Suppe, ohne Abklingzeit) / Modern / Fähigkeiten + Kit-Editor, gewertet + locker; Morni Party mit Gipfelrennen + Edelweiß-Jagd, 3 Spielfelder (Almsommer am Morni-Kogel, Schloss Weißenstein, Goldstollen) + 12 Minispiele; Modpack Zoom an, keine Minimap, ohne Axiom (später nach Freigabe); MorniCraft-Bewerbung über Webseite (Discord-Login) und Discord-Knopf, Schalter „Bewerbungen offen“; Admin = alles außer Owner/Admin vergeben, Vorlage Owner/Admin, Bot verbinden, Server löschen; Party = gemeinsame Sprachgruppe über Server hinweg, eigene Gruppen netzwerkweit, Nähe-Chat pro Server, Team-Funk in Runden.
- **Recherche:** `docs/recherche/` (Discord: Bots legen keine Server mehr an; Voice: Velocity-Plugin, eigene Brücke über Server, kein Bedrock-Voice; NetBird nach Port; Versionen 26.3).
- **Lobby (Philip, 14.11. nachmittags):** keine Portale, sondern **Menschen (NPCs) zum Anklicken** → verbindet in den Modus (Name, Spielerzahl, Status über dem Kopf); **Leben im Dorf**: herumlaufende NPCs, **begehbare, eingerichtete Häuser**, Biergarten mit Wirt und Gästen. NPC-Outfits eigene Pixel-Skins über unser Texturpaket (keine fremden Skins).
- **Voice (Philip):** immer auch **gemeinsame Sprachkanäle über alle Modi** (feste Kanäle, z. B. „Dorfplatz“, von jedem Server aus), dazu Party- und eigene Gruppen netzwerkweit.
- Lobby-Entwürfe A/B/C fertig (Bilder an Philip) – Auswahl offen.
- Repos zum Anlegen (Philip): MoinMorni-Lobby, -Duels, -Party, -Gipfelsturm, -Burgverlies, -Bollwerk.

## Stand

- 14.11.: Projekt angelegt (Cloud-Hooks, CLAUDE.md, STAND.md). Fragerunden 1+2 beantwortet, Recherche gesichert, Architektur festgelegt. Baustein 1 (Test- und Bildwerkzeug) läuft: Paper 26.1.2/26.3 + Velocity 4.3.1 + Java 25 laufen in der Sandbox (Cache unter `/home/user/mm-cache`, nicht im Repo).

- 14.11.: Baustein 1 fertig (echter Client 26.3 ohne Bildschirm, `tools/mc-client/`), Baustein 2 Entwürfe A/B/C fertig (`packages/builder`, `tools/lobby-entwuerfe`) – Wahl offen. Baustein 3 fertig: MorniHosting-PR https://github.com/pmornhart/MorniHosting/pull/116 (Netzwerke, Voice am Proxy, Motor-Modus `MH_HEADLESS`, Schlüssel mit Bereichen + `service-token`, `/api/ws` mit Schlüssel, `embed.ts` + `setApiBase`; Velocity-Volume-Fehler behoben) – wartet auf Philips Go.

## Offen

- Bausteine siehe Fortschrittsseite (`docs/fortschritt/index.html`, Artefakt https://claude.ai/artifact/FDBGtjXT6fgaY85Z1AvTsR).
