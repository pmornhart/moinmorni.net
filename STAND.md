# Stand – MoinMorni

**Ziel:** Eigenes Minecraft-Netzwerk unter moinmorni.net (Java + Bedrock) mit Lobby und mehreren Spielmodi, öffentlicher Webseite mit Panel, eigenem Discord-Bot und Modpack – läuft auf MorniHosting, richtet sich selbst ein und hält sich aktuell.

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
- Offen: Anbindung an MorniHosting (Q21–Q26), Folgefragen aus der Recherche.

## Stand

- 14.11.: Projekt angelegt (Cloud-Hooks, CLAUDE.md, STAND.md). Phase „Erst verstehen“ läuft: Fragerunden mit Philip.

## Offen

- Fragerunden abschließen, Verständnis bestätigen lassen, dann Plan in Bausteinen + Fortschrittsseite.
