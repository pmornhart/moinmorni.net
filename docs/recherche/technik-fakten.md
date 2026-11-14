# Technik-Fakten (geprüft 14.11.2026)

**V** = mit Quelle belegt, **U** = unsicher. Bei Zweifeln vor dem Einbau erneut prüfen.

## Versionen
- Minecraft Java **26.3** (15.09.2026), Schema Jahr.Drop.Hotfix. Paper **26.3** (#249, Java 25+), Velocity **4.3.1** (#45, Java 25+). **V**
- Geyser 2.12.1 (Java 26.3, Bedrock 26.40–26.63), Floodgate 2.2.5. **V**
- ViaVersion/ViaBackwards 5.12.2 (Java 17); ViaBackwards bis ca. 1.9/1.10, ViaRewind für 1.8/1.7. 1.17+ geht mit ViaBackwards allein. **V/U**
- Modern Forwarding (paper-global.yml `proxies.velocity`) gilt für Clients ab 1.13. **V**
- `minecraft:mannequin` (Spieler-NPC, seit 1.21.9) – Paper-API `org.bukkit.entity.Mannequin` in 26.3. **V**

## Discord
- Bots können seit 15.07.2025 **keine Server mehr anlegen** und keinen Besitz übertragen. **V** → Philip erstellt einen leeren Server, holt den Bot per Link; der Bot richtet alles ein.
- Vorlagen (`POST /guilds/{id}/templates`) kann ein Bot erstellen; „Server aus Vorlage“ nur per Link für Menschen (discord.new/…). **V**
- Bot mit Administrator: Kategorien, Kanäle, Rollen, Rechte, AutoMod, Community einschalten (`PATCH /guilds` features `COMMUNITY`; Voraussetzungen: Verifizierung ≥ E-Mail, Inhaltsfilter, Regel- und Update-Kanal). Onboarding braucht ≥ 7 Standard-Kanäle (5 schreibbar). **V/U**
- Rollen-Symbole nur ab Boost-Stufe 2 → sonst Symbol im Rollennamen. **V**
- Linked Roles: bis 5 Metadaten, OAuth2 `role_connections.write` je Nutzer. **V**
- Willkommen braucht Intent `GUILD_MEMBERS` (unter 10 000 Nutzern nur Schalter im Portal). Timeout max. 28 Tage. **V**
- Rate-Limit global 50/s, pro Route `retry_after` beachten. **V**

## Simple Voice Chat
- Offizielles Velocity-Plugin (velocity-2.6.26) + Plugin auf jedem Backend (2.6.27, 1.8.8–26.3). Ein UDP-Port am Proxy (Standard: der Minecraft-Port des Proxys). Backends auf demselben Rechner brauchen verschiedene Voice-Ports. `voice_host` am Proxy setzen. **V**
- API: `groupBuilder()`, `connection.setGroup(group)` **ohne Passwort**, `MicrophonePacketEvent` (Opus lesen/ersetzen, `cancel()` zum Stummschalten), statische/örtliche/Entity-Audiokanäle. **V** (cancel bei diesem Ereignis **U**)
- Über Server hinweg: nicht eingebaut, kein fertiges Add-on → eigene Brücke (Opus von Server A abgreifen, weiterreichen, auf Server B per statischem Kanal abspielen). Muster belegt durch die Discord-Bridge. **U (eigene Folgerung)**
- **Bedrock:** kein Voice-Chat (laut FAQ unmöglich). **V**

## NetBird Reverse Proxy (Beta, v0.83.1)
- HTTP (mit TLS), TCP, UDP, TLS; eigene Ports beim selbst betriebenen Proxy; TCP und UDP dürfen denselben Port teilen. UDP-Leerlauf 30 s (einstellbar). PROXY-Protokoll v2 möglich (Velocity `haproxy-protocol`). **V**
- Weiterleitung **nach Port**, nicht nach Hostname (außer TLS/SNI) → ein TCP-Dienst 25565 → Velocity; Bedrock 19132 (TCP-Signaling + UDP) → Geyser; Voice UDP. **V**
- Eigene Domain: `*.moinmorni.net` CNAME → Proxy, Prüfung über `validation.<domain>`. Hauptdomain als Dienst laut Forum möglich (**U**); DNS an der Hauptdomain: **A-Eintrag** auf die öffentliche IP des Proxys (INWX kann auch ALIAS, dann ohne DNSSEC). **V**

## Test- und Bildwerkzeuge
- mineflayer 4.39.0 kann bis **26.1** → Test-Spieler verbinden als 26.1 über ViaBackwards zum 26.3-Netzwerk. **V**
- prismarine-viewer 1.33.0 (Texturen bis 1.21.4, Headless nur mit nativem Build). **V/U**
- Chunky 2.5.0-Snapshot rendert bis 26.3, Kommandozeile `-render <scene>`, Texturen aus der Client-Jar (`-download-mc`). **V**
- HeadlessMC kann den echten Client (z. B. 26.3) unter Xvfb + Mesa starten. **U** → wird in Baustein 1 ausprobiert.

## Netzwerk-Test in der Sandbox (14.11., echt)
- Velocity 4.3.1 + Paper 26.3 dahinter, **Modern Forwarding**: `velocity.toml` → `player-info-forwarding-mode = "MODERN"`,
  `forwarding-secret-file = "forwarding.secret"`, `[servers]` Name → Adresse, `try = ["lobby"]`; Paper →
  `config/paper-global.yml`: `proxies.velocity.enabled: true`, `online-mode` wie am Proxy, `secret` = Inhalt von
  forwarding.secret; `server.properties`: `online-mode=false`.
- **ViaVersion + ViaBackwards (Velocity 5.12.2)** am Proxy: ein mineflayer-Spieler mit 26.1 kam in die 26.3-Lobby,
  aber erst nachdem Via die Server-Version per Ping erkannt hatte (`velocity-ping-interval: 60` → vorher „Outdated
  client! Please use 26.3“). → Im Netzwerk-Baustein Ping-Intervall kurz setzen bzw. `velocity-servers` vorbelegen.
- **Simple Voice Chat Velocity 2.6.26**: „Voice chat proxy server started at 0.0.0.0:<Proxy-Port>“ – UDP auf demselben
  Port wie Minecraft. Backends brauchen das Plugin ebenfalls (eigene UDP-Ports, intern).
- mineflayer über Via: nach dem Beitritt Kick wegen `invalid_player_movement` (Bewegungs-Pakete) → für Tests über den
  Proxy Physik der Test-Spieler aus bzw. nur kurz bewegen.
