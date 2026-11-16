# Hub-Protokoll (MoinMorni ↔ Netzwerk-Plugin)

Der **Hub** steckt im MoinMorni-Container (Port 8090, nur im Minecraft-Netz `moinmorni-mc`, nie nach außen). Das
**Netzwerk-Plugin** läuft auf dem Proxy (Velocity) und auf jedem Spielserver (Paper) und verbindet sich per
WebSocket mit `ws://moinmorni:8090/hub`.

Das Plugin ist bewusst dünn: Es meldet, was passiert (Spieler kommt, wechselt, schreibt), und führt aus, was der Hub
sagt (Nachricht zeigen, rauswerfen, verbinden). Alle Regeln, Texte und Befehle leben im Hub – so lässt sich alles im
Panel einstellen, und Velocity und Paper verhalten sich gleich.

## Schlüssel

- Jeder Server hat einen eigenen Schlüssel:
  `serverKey = hex(HMAC-SHA256(hubSecret, "server|" + kind + "|" + server))`, mit
  `hubSecret = HMAC-SHA256(MM_SECRET, "moinmorni-hub")`.
- MoinMorni schreibt ihn über den Motor in `plugins/moinmorni/hub.json` des Servers:
  `{ "url": "ws://moinmorni:8090/hub", "server": "lobby", "kind": "backend", "key": "<hex>" }`.
- Ein Server kann sich nicht als ein anderer ausgeben (anderer Name → anderer Schlüssel) und ein Spielserver nicht als
  Proxy (andere Art → anderer Schlüssel).
- Nach der Rückbenennung (16.11.2026, Name wieder MoinMorni) schreibt MoinMorni beim nächsten Start jedem Server seine
  hub.json neu, der Server übernimmt sie bei seinem nächsten Neustart (sobald niemand drauf ist).
- Der Hub nimmt Spieler-, Anmelde- und Befehls-Nachrichten (`online`, `login`, `connecting`, `switch`, `leave`,
  `locale`, `command`, `complete`) nur vom Proxy an. Spielserver dürfen nur für Spieler sprechen, die gerade bei ihnen
  sind (`chat`, `play`, `voice-group`, Ton); alles andere wird verworfen.

## Verbindung aufbauen

1. Hub → Plugin (unsigniert): `{"t":"hello","v":1,"nonce":"<32 Hex>"}`
2. Plugin → Hub (unsigniert):
   `{"t":"auth","v":1,"server":"lobby","kind":"backend","nonce":"<32 Hex>","proof":"<Hex>"}` mit
   `proof = HMAC-SHA256(serverKey, "auth|" + hubNonce + "|" + pluginNonce + "|" + server + "|" + kind)`.
3. Stimmt der Beweis nicht, schließt der Hub die Verbindung (Code 4001). Sonst gilt für diese Verbindung der
   `sessionKey = HMAC-SHA256(serverKey, "session|" + hubNonce + "|" + pluginNonce)` und der Hub schickt `welcome`.

`serverKey` geht dabei nie über die Leitung; zwei Verbindungen haben nie denselben `sessionKey`.

## Rahmen

Danach ist jede Nachricht in beide Richtungen ein signierter Rahmen:

```json
{ "s": 1, "b": "{\"t\":\"welcome\", …}", "h": "<Hex>" }
```

- `s`: Zähler pro Richtung, beginnt bei 1 und steigt genau um 1 (Wiederholungen fallen auf).
- `b`: die eigentliche Nachricht als JSON-**Text** (so gibt es kein Problem mit der Reihenfolge von Feldern).
- `h = HMAC-SHA256(sessionKey, s + "." + b)`.

Falscher Zähler oder falsche Signatur → Verbindung zu (Code 4002).

**Binär-Rahmen** (Sprache) laufen über denselben Zähler: `[8 Byte Zähler, big endian][32 Byte HMAC-SHA256(sessionKey,
Zähler-Bytes + Inhalt)][Inhalt]`. Inhalt eines Audio-Rahmens: `[1 = Audio][16 Byte Gruppe][16 Byte Sprecher][Opus]`.
Der Hub reicht ihn nur weiter, wenn der Sprecher wirklich auf dem sendenden Server ist, nicht stumm ist und die Gruppe
ein Netzwerk-Kanal oder eine Party ist.

## Nachrichten

Jede Nachricht hat `t` (Typ). Anfragen haben zusätzlich `id` (Zahl); die Antwort ist
`{"t":"reply","id":…,"ok":true,"data":…}` bzw. `{"t":"reply","id":…,"ok":false,"error":"<code>"}`.
Texte für Spieler kommen als [MiniMessage](https://docs.advntr.dev/minimessage/format.html), schon in der Sprache
des Spielers.

### Plugin → Hub

| Typ                    | Von         | Inhalt                                                                                                                                                                                                                                         |
| ---------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `online`               | Proxy       | `players: [{uuid, name, server, locale, bedrock}]` – nach jedem (Wieder-)Verbinden                                                                                                                                                             |
| `login` (Anfrage)      | Proxy       | `uuid, name, locale, bedrock` → `{allow, message?, server?}`                                                                                                                                                                                   |
| `connecting` (Anfrage) | Proxy       | `uuid, server` → `{allow}` – vor jedem Serverwechsel: Modus offen und wach? Schläft er, weckt ihn der Hub, der Spieler kommt danach per `connect` hinein                                                                                       |
| `switch`               | Proxy       | `uuid, server` – Spieler ist auf einem anderen Server                                                                                                                                                                                          |
| `leave`                | Proxy       | `uuid`                                                                                                                                                                                                                                         |
| `locale`               | Proxy       | `uuid, locale` – Sprache des Clients (kommt erst nach der Anmeldung)                                                                                                                                                                           |
| `command` (Anfrage)    | Proxy       | `uuid, command, args[]` → `{}` (Antworten kommen als `msg`)                                                                                                                                                                                    |
| `complete` (Anfrage)   | Proxy       | `uuid, command, args[]` → `{suggestions[]}`                                                                                                                                                                                                    |
| `chat`                 | Spielserver | `uuid, text, tag?{text, colour}` – `tag`: Kürzel nach dem Rang (Clan in MorniCraft; 1–6 Buchstaben/Ziffern, `#rrggbb`)                                                                                                                         |
| `mode-player`          | Spielserver | `mode, uuid, data{…}` – Zusammenfassung eines Spielers fürs Panel (nur vom Server des Modus; geprüft je Modus, bisher MorniCraft: `online, afk, homes[], clan, graves[]`), gespeichert in `mode_players`                                       |
| `mode-settings-state`  | Spielserver | `mode, restart, changed` – Antwort auf `mode-settings`: muss der Modus für die neuen Werte neu starten (verglichen mit dem, was er beim Start gelesen hat)? Nur vom Server des Modus; MoinMorni startet ihn dann neu, sobald niemand drauf ist |
| `voice-group`          | Spielserver | `uuid, group` (UUID oder null) – Gruppe im Sprachchat gewechselt                                                                                                                                                                               |
| `play`                 | Spielserver | `uuid, mode` – Figur in der Lobby angeklickt: Modus beitreten (geschlossen/bald/Wartung → Hinweis, schläft → wecken)                                                                                                                           |
| _(binär)_ Audio        | Spielserver | Sprache aus einem Netzwerk-Kanal oder einer Party                                                                                                                                                                                              |

### Hub → Plugin

| Typ                   | An                     | Inhalt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `welcome`             | alle                   | `server, kind, commands[], network{…}, bans[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `network`             | Proxy                  | MOTD, Spielerzahl, Wartung (bei Änderung im Panel)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `bans`                | Proxy                  | `[{uuid, until}]` – damit Banns auch gelten, wenn der Hub kurz weg ist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `profile`             | Spielserver            | `uuid, name, prefix, colour` (Rang im Chat, in der Tab-Liste, über dem Kopf)                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `chat`                | Spielserver            | `text` (fertige Zeile)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `msg`                 | Proxy                  | `uuid, text` (Nachricht an einen Spieler, egal wo er ist)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `kick`                | Proxy                  | `uuid, text`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `connect`             | Proxy                  | `uuid, server`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `lobby`               | Spielserver            | `modes[{id, name{de,en}, state, access, max, players, hasServer, awake, icon}]` – für die Schilder der Lobby-Figuren; höchstens einmal pro Sekunde                                                                                                                                                                                                                                                                                                                                                                                                         |
| `jail`                | nur Lobby              | `cell{spawn, min, max}`, `players[{uuid, until, reason}]` – wer im Gefängnis sitzt; beim Verbinden und bei jeder Änderung                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `mornicraft-settings` | nur MorniCraft         | `config{…}` – Einstellungen aus Panel → MorniCraft (Schlüssel der config.yml von MorniCraft, dazu `network{rules-de, rules-en, address, panel-players, panel-punishments}`); beim Verbinden und bei jeder Änderung von MorniCraft, Webseite (Regeln) oder Netzwerk. Das Plugin schreibt sie nach `plugins/MorniCraft/network.json` und ruft `mornicraft reload`                                                                                                                                                                                            |
| `mode-settings`       | nur Server eines Modus | `mode, plugin, values{pfad: wert}` – Einstellungen aus Panel → Einstellungen → Spielmodi (Katalog `packages/shared/src/mode-settings.ts`); beim Verbinden und bei jeder Änderung. Pfade nur `a-z 0-9 . _ -`, Zahl als Teil = Stelle in einer Liste. Das Plugin merkt sie in `plugins/moinmorni/mode-settings.json`, trägt sie in `plugins/<plugin>/config.yml` ein (Kommentare bleiben, nur bei Änderung) und beim nächsten Start schon vor dem Modus (`onLoad`). Schläft der Modus, schreibt MoinMorni die Datei über den Motor                           |
| `voice`               | Spielserver            | `channels[{id, name}], muted[], parties[{id, name, members[]}], own[{id, name, locked}], ownGroups, distance` – Kanäle mit gleicher ID auf jedem Server; eigene Gruppen (`/voice gruppe`) – das Passwort kennt nur der Hub, abgeschlossene Gruppen bekommen auf dem Server ein zufälliges (beitreten über `/voice <name> <passwort>`); Ton geht nur an Server, auf denen gerade jemand aus der Gruppe ist; `ownGroups` aus = auch das Sprachchat-Menü legt keine Gruppen an; `distance` trägt das Plugin als `max_voice_distance` ein (gilt nach Neustart) |
| `voice-join`          | Spielserver            | `uuid, group, force?` – Spieler in eine Gruppe setzen (Team ohne Passwort)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| _(binär)_ Audio       | Spielserver            | Sprache von anderen Servern zum Abspielen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Fällt der Hub aus, läuft das Netzwerk weiter: Chat bleibt auf dem eigenen Server, Banns aus der letzten `bans`-Liste
gelten weiter, das Plugin verbindet sich alle paar Sekunden neu.

## Auf dem Spielserver: Spielmodi und MorniCraft

Das Netzwerk-Plugin heißt auf Paper `MoinMorni` (auf Velocity ID `moinmorni`) und legt seine Dateien in
`plugins/moinmorni/`. Für die Plugins der Spielmodi und für MorniCraft gilt:

- **Schnittstelle:** Bukkit-Dienst `de.moinmorni.api.MoinMorni` (Datei in jedem Modus-Repo byte-gleich, nur zum
  Übersetzen, nicht in der Jar). Ein Modus holt ihn mit `MoinMorni.get()` und hat `softdepend: [MoinMorni]` in seiner
  plugin.yml; MorniCraft sucht die Klasse per Reflexion (läuft auch ohne Netzwerk).
- **Clan-Kürzel im Chat:** MorniCraft setzt am Spieler die Metadaten `moinmorni:tag` (Text) und `moinmorni:tag-colour`
  (`#rrggbb`); das Netzwerk-Plugin hängt das Kürzel im Chat hinter den Rang.
- **Dateien:** `plugins/MorniCraft/network.json` (Einstellungen aus dem Panel, siehe `mornicraft-settings`) und
  `plugins/MorniCraft/summary/<uuid>.json` (Zusammenfassung fürs Panel, geht als `mode-player` an den Hub).
