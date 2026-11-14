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
- Lobby-Entwürfe A/B/C fertig – **Philip wählt A** und will ihn ausgebaut (mehr Häuser, NPCs statt Portale, Leben im Dorf).
- **Webseite (Philip):** Aufbau wie gommehd.net (nur Gliederung: News, Modi, Statistiken, Team, Regeln, Hilfe – keine fremden Texte/Grafiken).
- Repos zum Anlegen (Philip): MoinMorni-Lobby, -Duels, -Party, -Gipfelsturm, -Burgverlies, -Bollwerk.

## Stand

- 14.11.: Projekt angelegt (Cloud-Hooks, CLAUDE.md, STAND.md). Fragerunden 1+2 beantwortet, Recherche gesichert, Architektur festgelegt. Baustein 1 (Test- und Bildwerkzeug) läuft: Paper 26.1.2/26.3 + Velocity 4.3.1 + Java 25 laufen in der Sandbox (Cache unter `/home/user/mm-cache`, nicht im Repo).

- 14.11.: Baustein 1 fertig (echter Client 26.3 ohne Bildschirm, `tools/mc-client/`), Baustein 2 Entwürfe A/B/C fertig (`packages/builder`, `tools/lobby-entwuerfe`) – Wahl offen. Baustein 3 fertig: MorniHosting-PR https://github.com/pmornhart/MorniHosting/pull/116 (Netzwerke, Voice am Proxy, Motor-Modus `MH_HEADLESS`, Schlüssel mit Bereichen + `service-token`, `/api/ws` mit Schlüssel, `embed.ts` + `setApiBase`; Velocity-Volume-Fehler behoben) – wartet auf Philips Go.

- 14.11. abends: Baustein 4 fertig – `docker-compose.yml` (MoinMorni, Motor mit `MH_HEADLESS`, Socket-Proxy; nur 8080 offen; jeder Dienst nur seine eigenen .env-Werte), `Dockerfile` (Web + Server + Netzwerk-Plugin), `install.sh` (fragt Domain + Bot-Token, .env nur root, holt `service-token moinmorni`, zeigt Einrichtungs-Code; mit nachgebautem Docker getestet). Ersteinrichtung `/api/setup` mit einmaligem Code (`/data/setup-code`), danach offene Registrierung im Motor aus. Netzwerk richtet sich selbst ein (`apps/server/src/network/provision.ts`): Proxy (Velocity + Geyser + Via + Voice) und Lobby (Paper) im Motor anlegen, als Netzwerk „MoinMorni“ verdrahten, Plugin + `plugins/moinmorni/hub.json` aufspielen. MorniHosting: Dienst-Konten zählen bei der Einrichtung nicht (Commit auf PR #116).
- 14.11. abends: Baustein 5 Kern fertig – Hub (`apps/server/src/hub/`, Port 8090, `docs/hub-protokoll.md`: Schlüssel pro Server, Handschlag, jeder Rahmen mit Zähler + HMAC), Plugin `plugins/moinmorni-network` (eine Jar für Velocity 4.3 + Paper 26.x, Java 25). Anmeldung (Bann, Wartung, voll/Reserveplatz), Chat über alle Server (Rang, Server-Kürzel, Stumm, Langsam, Links, Großbuchstaben, Schimpfwörter), Befehle /ban /unban /mute /unmute /kick /warn /strafen /rang /msg /r /sprache /lobby, jede Katalog-Einstellung als Spielbefehl (`setting-commands.ts`), Rang in Chat/Tab/über dem Kopf, Sprache aus dem Client. Fällt der Hub aus, läuft alles lokal weiter. Echt getestet: Velocity 4.3.1 + Paper 26.1.2/26.3 + mineflayer (`tools/netz-test`, 20/20) und echter Client 26.3 (Bilder). Hinweis: mineflayer (bis 26.1) wird über Via auf 26.3 wegen Bewegungspaketen gekickt – Test-Spieler dort ohne Bewegung.
- 14.11. abends: Webseite + Panel (`apps/web`) fertig für den ersten Stand (Helfer-Agent, von mir geprüft): Startseite, Panel mit Einrichtung, Übersicht, Modi, Einstellungen mit Suche, Rollen (ansehen), eingebettete MorniHosting-Server-Seiten. Mojang-Bilder (Spielbilder, Item-Texturen) gehen nicht durch die Motor-Weiterleitung.
- 14.11. nachts: Freunde + Party (`hub/social.ts`, Party folgt dem Leiter), Schlaf-Modus (`network/sleep.ts` + `connecting`-Anfrage im Proxy, echt geprüft: Duels wacht in 21 s auf), Panel-APIs Spieler/Strafen (`panel/player-routes.ts`, gemeinsame `hub/moderation.ts`), Discord-Bot (`apps/server/src/discord/`: eigener Client mit Gateway, Server einrichten, Status, /verbinden, Rang- und Straf-Abgleich, Tickets; `docs/discord.md`; Tests gegen `test/fake-discord.ts`), Sprachchat-Brücke (`hub/voice.ts`, Binär-Rahmen im Protokoll, `paper/VoiceBridge.java` mit Simple-Voice-Chat-API 2.6.25 – Gruppen über `getGroups()` suchen, `getGroup(id)` liefert sonst eine leere Hülle), Panel-Seiten Spieler/Strafen/Rollen/Rundgang (Helfer-Agent, geprüft). 48 Server-Tests grün.

- 14.11. spätabends: **Lobby Entwurf A ausgebaut** (Philips Wahl, `docs/lobby.md`): statt Portalen 7 Marktstände mit Figuren (eigene Pixel-Skins aus `packages/builder/src/skins.ts` + `cast.ts`, 27 Leute, Texturpaket `castPack()`), alle Häuser begehbar und eingerichtet (`village.ts`: Wohnhaus, Wirtshaus, Bäckerei, Krämer, Apotheke, Rathaus, Gäste-Info, Schmiede, Schreinerei), Handwerkergasse (8 Häuser, Vorgärten, Brunnen), Oberdorf (4 Häuser), Wirtshaus mit Wirt und Stammtisch, Biergarten mit Wirt und 12 Gästen (Tische niedriger), Leute im Dorf. Netzwerk-Plugin `LobbyNpcs.java`: Figur anklicken → Hub `play` → Modus (schläft → wecken), Schilder mit Live-Zahlen je Sprache (Hub `lobby`), Dorfleute laufen herum, Figuren schauen Spieler an. Echt getestet mit Paper 26.3 + echtem Client 26.3: Klick auf Duels → auf dem Duels-Server, englisches Schild nach `/sprache en`. 52 Server-Tests grün. Offen: Skins auch ohne Paket/für Bedrock (signierte Skin-Daten).

- 15.11. nachts: **Webseite neu** im Aufbau großer Netzwerke (Helfer-Agent, von mir geprüft): Kopf mit Adresse/Spielerzahl/Discord, eigenes Alpendorf-Kopfbild, News, Spielmodi, Statistiken mit Rangliste und Suche, Spielerprofile, Team, Regeln, Hilfe; Panel-Seiten News und Discord. `/api/site` liefert die Sprachkanäle, `/api/status` den Server-Namen je Modus; Discord „einrichten“ ohne Token meldet `discord_not_configured`.
- 15.11. nachts: **Lobby baut sich selbst** (`apps/server/src/lobby/`): Bauplan liegt jetzt im Baukasten (`packages/builder/src/lobby/`), `lobbyPack()` als Datenpaket, `world.ts` spielt es über den Motor auf, baut Schritt für Schritt, merkt sich die Version; server.properties der Lobby (Abenteuer, friedlich, Figuren-Paket `/api/public/packs/lobby.zip` mit SHA-1, Pflicht nur per Schalter Lobby → Figuren). Echt mit frischem Paper 26.3 geprüft (Funde behoben: Zeilenumbrüche in Schildern, forceload in kleinen Portionen). 55 Server-Tests grün.

- 15.11.: **Philips Go → MorniHosting-PR #116 gemergt** (https://github.com/pmornhart/MorniHosting/pull/116, Merge 1046a49 auf `main`). Motor-Submodul `vendor/mornihosting` folgt jetzt `main`.

## Offen

- Offen: Gefängnis (mit der Lobby), Discord-Seite + Team-Konten im Panel, Webseite (Regeln, Team, Hilfe, News), Updates, Proxmox-Einzeiler, Modi.
- Bausteine siehe Fortschrittsseite (`docs/fortschritt/index.html`, Artefakt https://claude.ai/artifact/FDBGtjXT6fgaY85Z1AvTsR).
