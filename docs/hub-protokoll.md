# Hub-Protokoll (MoinMorni ↔ Netzwerk-Plugin)

Der **Hub** steckt im MoinMorni-Container (Port 8090, nur im Minecraft-Netz `moinmorni-mc`, nie nach außen). Das
**Netzwerk-Plugin** läuft auf dem Proxy (Velocity) und auf jedem Spielserver (Paper) und verbindet sich per
WebSocket mit `ws://moinmorni:8090/hub`.

Das Plugin ist bewusst dünn: Es meldet, was passiert (Spieler kommt, wechselt, schreibt), und führt aus, was der Hub
sagt (Nachricht zeigen, rauswerfen, verbinden). Alle Regeln, Texte und Befehle leben im Hub – so lässt sich alles im
Panel einstellen, und Velocity und Paper verhalten sich gleich.

## Schlüssel

- Jeder Server hat einen eigenen Schlüssel:
  `serverKey = hex(HMAC-SHA256(hubSecret, "server|" + server))`, mit
  `hubSecret = HMAC-SHA256(MM_SECRET, "moinmorni-hub")`.
- MoinMorni schreibt ihn über den Motor in `plugins/moinmorni/hub.json` des Servers:
  `{ "url": "ws://moinmorni:8090/hub", "server": "lobby", "kind": "backend", "key": "<hex>" }`.
- Ein Server kann sich nicht als ein anderer ausgeben (anderer Name → anderer Schlüssel).

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

## Nachrichten

Jede Nachricht hat `t` (Typ). Anfragen haben zusätzlich `id` (Zahl); die Antwort ist
`{"t":"reply","id":…,"ok":true,"data":…}` bzw. `{"t":"reply","id":…,"ok":false,"error":"<code>"}`.
Texte für Spieler kommen als [MiniMessage](https://docs.advntr.dev/minimessage/format.html), schon in der Sprache
des Spielers.

### Plugin → Hub

| Typ | Von | Inhalt |
| --- | --- | --- |
| `online` | Proxy | `players: [{uuid, name, server, locale, bedrock}]` – nach jedem (Wieder-)Verbinden |
| `login` (Anfrage) | Proxy | `uuid, name, locale, bedrock` → `{allow, message?, server?}` |
| `switch` | Proxy | `uuid, server` – Spieler ist auf einem anderen Server |
| `leave` | Proxy | `uuid` |
| `locale` | Proxy | `uuid, locale` – Sprache des Clients (kommt erst nach der Anmeldung) |
| `command` (Anfrage) | Proxy | `uuid, command, args[]` → `{}` (Antworten kommen als `msg`) |
| `complete` (Anfrage) | Proxy | `uuid, command, args[]` → `{suggestions[]}` |
| `chat` | Spielserver | `uuid, text` |

### Hub → Plugin

| Typ | An | Inhalt |
| --- | --- | --- |
| `welcome` | alle | `server, kind, commands[], network{…}, bans[]` |
| `network` | Proxy | MOTD, Spielerzahl, Wartung (bei Änderung im Panel) |
| `bans` | Proxy | `[{uuid, until}]` – damit Banns auch gelten, wenn der Hub kurz weg ist |
| `profile` | Spielserver | `uuid, name, prefix, colour` (Rang im Chat, in der Tab-Liste, über dem Kopf) |
| `chat` | Spielserver | `text` (fertige Zeile) |
| `msg` | Proxy | `uuid, text` (Nachricht an einen Spieler, egal wo er ist) |
| `kick` | Proxy | `uuid, text` |
| `connect` | Proxy | `uuid, server` |

Fällt der Hub aus, läuft das Netzwerk weiter: Chat bleibt auf dem eigenen Server, Banns aus der letzten `bans`-Liste
gelten weiter, das Plugin verbindet sich alle paar Sekunden neu.
