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
  `locale`, `command`, `complete`, `fallback`, `pack`, `badge-status`) nur vom Proxy an. Spielserver dürfen nur für Spieler sprechen, die gerade bei ihnen
  sind (`chat`, `play`, `voice-group`, `playing`, `ask-lobby`, `lobby-answer`, `rejoin`, Ton); alles andere wird
  verworfen. Einzige Ausnahme: `hold-slot` auch für Spieler, die den Server eben erst verlassen haben (siehe unten).

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

| Typ                    | Von         | Inhalt                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `online`               | Proxy       | `players: [{uuid, name, server, locale, bedrock}]` – nach jedem (Wieder-)Verbinden                                                                                                                                                                                                                                                                                                                           |
| `login` (Anfrage)      | Proxy       | `uuid, name, locale, bedrock` → `{allow, message?, lang?, server?}` – `server`: erster Server (`lobby`, oder `wartung`, wenn die Lobby nicht am Hub hängt oder Wartung ist und der Spieler nicht „Kommt immer rein“ hat)                                                                                                                                                                                     |
| `connecting` (Anfrage) | Proxy       | `uuid, server, fallback?` → `{allow, redirect?}` – vor jedem Serverwechsel: Modus offen und wach? Schläft er, weckt ihn der Hub, der Spieler kommt danach per `connect` hinein. `fallback`: der Proxy schickt ihn hin (Ankunft, Rauswurf) – in der Wartungs-Lobby wartet er dann und kommt automatisch zurück. Während der Wartung darf man nur in die Wartungs-Lobby (`redirect: "wartung"` beim Ankommen)  |
| `fallback` (Anfrage)   | Proxy       | `uuid, from, tried[]` → `{order[], bye}` – nach einem Rauswurf oder gescheiterten Verbinden: Server in dieser Reihenfolge (nur `lobby`/`wartung`, schon gescheiterte lässt der Proxy aus), `bye` zum Trennen, wenn keiner geht (warum man in der Wartungs-Lobby ist, sagt sie selbst beim Ankommen)                                                                                                          |
| `switch`               | Proxy       | `uuid, server` – Spieler ist auf einem anderen Server                                                                                                                                                                                                                                                                                                                                                        |
| `leave`                | Proxy       | `uuid`                                                                                                                                                                                                                                                                                                                                                                                                       |
| `locale`               | Proxy       | `uuid, locale` – Sprache des Clients (kommt erst nach der Anmeldung)                                                                                                                                                                                                                                                                                                                                         |
| `command` (Anfrage)    | Proxy       | `uuid, command, args[]` → `{}` (Antworten kommen als `msg`)                                                                                                                                                                                                                                                                                                                                                  |
| `complete` (Anfrage)   | Proxy       | `uuid, command, args[]` → `{suggestions[]}`                                                                                                                                                                                                                                                                                                                                                                  |
| `pack`                 | Proxy       | `uuid, loaded, status?` – Netzwerk-Paket (`packs/netz.ts`) geladen (`true`) bzw. abgelehnt, fehlgeschlagen oder abgenommen (`false`); `status` = `loaded`, `declined` (Pflicht → Hub wirft freundlich hinaus), `failed` (nach drei neuen Versuchen), `discarded`. Velocity sieht die Antwort des Clients, die Spielserver nicht. Geht mit `profile.pack` und `profile.music.pack` an den Server des Spielers |
| `badge-status`         | Proxy       | `uuid, status` – was der Spieler mit dem Abzeichen-Paket gemacht hat: `sent` (auf `/abzeichen` hin geschickt), `unsupported` (Client zu alt), `loaded`, `declined`, `failed` (nach drei neuen Versuchen)                                                                                                                                                                                                     |
| `chat`                 | Spielserver | `uuid, text, tag?{text, colour}` – `tag`: Kürzel nach dem Rang (Clan in MorniCraft; 1–6 Buchstaben/Ziffern, `#rrggbb`)                                                                                                                                                                                                                                                                                       |
| `mode-player`          | Spielserver | `mode, uuid, data{…}` – Zusammenfassung eines Spielers fürs Panel (nur vom Server des Modus; geprüft je Modus, bisher MorniCraft: `online, afk, homes[], clan, graves[]`), gespeichert in `mode_players`                                                                                                                                                                                                     |
| `mode-settings-state`  | Spielserver | `mode, restart, changed` – Antwort auf `mode-settings`: muss der Modus für die neuen Werte neu starten (verglichen mit dem, was er beim Start gelesen hat)? Nur vom Server des Modus; MoinMorni startet ihn dann neu, sobald niemand drauf ist                                                                                                                                                               |
| `voice-group`          | Spielserver | `uuid, group` (UUID oder null) – Gruppe im Sprachchat gewechselt                                                                                                                                                                                                                                                                                                                                             |
| `play`                 | Spielserver | `uuid, mode` – Figur in der Lobby angeklickt: Modus beitreten (geschlossen/bald/Wartung → Hinweis, schläft → wecken)                                                                                                                                                                                                                                                                                         |
| `playing`              | Spielserver | `uuid, playing` – der Modus meldet, ob der Spieler gerade eine Runde spielt (Schnittstelle 2, `playing`); dann fragt /lobby erst nach. Siehe „Mitten im Spiel“                                                                                                                                                                                                                                               |
| `ask-lobby`            | Spielserver | `uuid` – „Zur Lobby“ im Modus (`askToLobby`): wie /lobby, mitten im Spiel mit Nachfrage                                                                                                                                                                                                                                                                                                                      |
| `lobby-answer`         | Spielserver | `uuid, yes` – Antwort aus dem Fenster „Wirklich zur Lobby?“ (ja = zur Lobby, nein = weiterspielen)                                                                                                                                                                                                                                                                                                           |
| `hold-slot`            | Spielserver | `uuid, seconds` – Platz freihalten, weil die Verbindung mitten im Spiel weg ist (`holdSlot`); `0` nimmt das Angebot zurück. Nur vom Server eines Spielmodus, siehe „Mitten im Spiel“                                                                                                                                                                                                                         |
| `rejoin`               | Spielserver | `uuid` – Gegenstand „Zurück ins Spiel“ in der Lobby benutzt: auf den freigehaltenen Server (geprüft wie bei einer Figur)                                                                                                                                                                                                                                                                                     |
| _(binär)_ Audio        | Spielserver | Sprache aus einem Netzwerk-Kanal oder einer Party                                                                                                                                                                                                                                                                                                                                                            |

### Hub → Plugin

| Typ                   | An                     | Inhalt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `welcome`             | alle                   | `server, kind, commands[], network{…}, bans[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `network`             | Proxy                  | MOTD (bei Wartung mit „bis ca. 22:30“), Spielerzahl, `maintenance`, `wartung` (Wartungs-Lobby an) – bei Änderung im Panel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `bans`                | Proxy                  | `[{uuid, until}]` – damit Banns auch gelten, wenn der Hub kurz weg ist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `profile`             | Spielserver            | `uuid, name, lang, role{id, name, symbol, colour, position, badge}, rights[], streamer{on, parts[]}, pack` – Rang im Chat, in der Tab-Liste, über dem Kopf; `rights` = Rechte im Spiel aus dem Rang. Das Plugin macht daraus Rechte des Servers (`paper/Rights.java`): Teleport, Zuschauen, Spielmodus (Kreativ nur mit `creative`), `modes-admin` = alle `.admin`-Rechte der Spielmodi dort, `admin` = was ein Operator hätte (ohne OP). Bei jedem Wechsel und jeder Rang- oder Rollenänderung neu; `badge` = Schlüssel des Abzeichens (siehe „Rang-Abzeichen“), `null` = aus, dann Symbol und Farbe wie bisher; mit ● LIVE: Abzeichen vorn, Name, „● LIVE“ hinten |
| `chat`                | Spielserver            | `text` (fertige Zeile)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `msg`                 | Proxy                  | `uuid, text, mask?` (Nachricht an einen Spieler, egal wo er ist; `mask` = Streamer: IP-Adressen und eigene Adressen als „•••“)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `kick`                | Proxy                  | `uuid, text`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `connect`             | Proxy                  | `uuid, server`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `countdown`           | Proxy                  | `uuid, text, seconds` – Leiste oben, die herunterzählt (vor einem Neustart, `network/restart-now.ts`); `{s}` im Text = verbleibende Sekunden. Ältere Plugins überhören sie – derselbe Hinweis kommt darum immer auch per `msg`                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `title`               | Proxy                  | `uuid, title, subtitle` – großer Titel auf dem Bildschirm (angekündigte Wartung, `hub/wartung-plan.ts`; MiniMessage). Ältere Plugins überhören ihn – der Hinweis kommt immer auch per `msg`. In `countdown` zählt `{t}` als Uhr („9:59“, „1:02:03“), Leisten bis 6 Stunden                                                                                                                                                                                                                                                                                                                                                                                          |
| `badges`              | Proxy                  | `enabled, url, sha1, required, prompt{de, en}` – Abzeichen-Paket (Panel → Rollen → Rang-Abzeichen); beim Verbinden und bei jeder Änderung der Einstellung oder der Rollen (neue SHA-1). Der Proxy bietet es jedem Java-Spieler ab 1.20.3 beim ersten Betreten an, mit eigener Kennung, damit es bei jedem Serverwechsel bleibt                                                                                                                                                                                                                                                                                                                                      |
| `badges-send`         | Proxy                  | `uuid` – Paket diesem Spieler jetzt (noch einmal) anbieten (`/abzeichen`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `netzpaket`           | Proxy                  | `enabled, url, sha1, required, prompt{de, en}` – Netzwerk-Paket (Möbel, Brunnen, Fische, Kleidung, Musik); beim Verbinden und bei jeder Änderung (Pflicht-Schalter Netzwerk → Ressourcenpaket gilt für beide Pakete). Der Proxy bietet es jedem Java-Client einmal beim ersten Server an und nimmt es nie ab; Pakete, die ein Spielserver selbst schicken will (alte Kennungen, Adressen unter `/api/public/packs/`), lässt er nicht durch                                                                                                                                                                                                                          |
| `netzpaket-send`      | Proxy                  | `uuid` – Netzwerk-Paket diesem Spieler jetzt (noch einmal) anbieten (`/paket`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `lobby`               | Spielserver            | `modes[{id, name{de,en}, state, access, max, players, hasServer, awake, icon}]` – für die Schilder der Lobby-Figuren; höchstens einmal pro Sekunde                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `jail`                | nur Lobby              | `cell{spawn, min, max}`, `players[{uuid, until, reason}]` – wer im Gefängnis sitzt; beim Verbinden, bei jeder Änderung und jede Minute                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `wartung`             | nur Wartungs-Lobby     | `lobby` (hängt die Lobby am Hub?), `hold` (Wartungs-Neustart: alle warten hier), `restart{done,total}` (wie weit die Server sind, sonst null), `maintenance`, `message`, `until` („22:30“ oder null), `returnAuto`, `returnIn` (Sekunden bis zurück in die Lobby, sonst null), `points{spawn, parkourStart, parkourFinish, parkourFloor}` – beim Verbinden und bei jeder Änderung (Lobby kommt/geht, Wartung, Countdown)                                                                                                                                                                                                                                            |
| `lobby-music`         | nur Lobby              | `on, volume, quiet, pause, season, songs[{id, title{de,en}, ticks, sound, soundTicks, notes[]}]` – Lobbymusik (Panel → Lobby → Musik): Stücke der aktuellen Saison in Reihenfolge, je Stück die Notenblock-Fassung (`notes`: je vier Zahlen – Ticks seit dem vorigen Klang, Notenblock 0–15 in der Reihenfolge harp, bass, basedrum, snare, hat, bell, flute, chime, guitar, xylophone, iron_xylophone, cow_bell, didgeridoo, bit, banjo, pling –, Klick 0–24, Lautstärke in %) und das Geräusch im Lobby-Paket (`sound`, z. B. `moinmorni:lobby.musik.stille-nacht`, null = nur Notenblöcke). Beim Verbinden und bei jeder Änderung im Bereich Lobby               |
| `mornicraft-settings` | nur MorniCraft         | `config{…}` – Einstellungen aus Panel → MorniCraft (Schlüssel der config.yml von MorniCraft, dazu `network{rules-de, rules-en, address, panel-players, panel-punishments}`); beim Verbinden und bei jeder Änderung von MorniCraft, Webseite (Regeln) oder Netzwerk. Das Plugin schreibt sie nach `plugins/MorniCraft/network.json` und ruft `mornicraft reload`                                                                                                                                                                                                                                                                                                     |
| `mode-settings`       | nur Server eines Modus | `mode, plugin, values{pfad: wert}` – Einstellungen aus Panel → Einstellungen → Spielmodi (Katalog `packages/shared/src/mode-settings.ts`); beim Verbinden und bei jeder Änderung. Pfade nur `a-z 0-9 . _ -`, Zahl als Teil = Stelle in einer Liste. Das Plugin merkt sie in `plugins/moinmorni/mode-settings.json`, trägt sie in `plugins/<plugin>/config.yml` ein (Kommentare bleiben, nur bei Änderung) und beim nächsten Start schon vor dem Modus (`onLoad`). Schläft der Modus, schreibt MoinMorni die Datei über den Motor                                                                                                                                    |
| `voice`               | Spielserver            | `channels[{id, name}], muted[], parties[{id, name, members[]}], own[{id, name, locked}], ownGroups, distance` – Kanäle mit gleicher ID auf jedem Server; eigene Gruppen (`/voice gruppe`) – das Passwort kennt nur der Hub, abgeschlossene Gruppen bekommen auf dem Server ein zufälliges (beitreten über `/voice <name> <passwort>`); Ton geht nur an Server, auf denen gerade jemand aus der Gruppe ist; `ownGroups` aus = auch das Sprachchat-Menü legt keine Gruppen an; `distance` trägt das Plugin als `max_voice_distance` ein (gilt nach Neustart)                                                                                                          |
| `streamer-config`     | alle                   | `hosts[]` – Streamer-Modus: eigene Adressen, die für Streamer zu „•••“ werden (mit allem davor und Port); beim Verbinden und bei jeder Änderung im Bereich Netzwerk                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `voice-join`          | Spielserver            | `uuid, group, force?` – Spieler in eine Gruppe setzen (Team ohne Passwort)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `lobby-ask`           | Spielserver            | `uuid, mode` – Fenster „Wirklich zur Lobby?“ öffnen (Truhen-Fenster, geht auch auf Bedrock); `mode` = Name des Modus in der Sprache des Spielers. Die Frage im Chat schickt der Hub selbst (`msg`, auf Java mit Knöpfen `/lobby ja` und `/lobby nein`)                                                                                                                                                                                                                                                                                                                                                                                                              |
| `lobby-ask-close`     | Spielserver            | `uuid` – die Antwort kam über den Chat: Fenster zu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `rejoin-offer`        | nur Lobby              | `uuid, server, mode{id, de, en}, seconds, chat` – „Zurück ins Spiel“ anbieten: Zeile im Chat (`chat`, MiniMessage in der Sprache des Spielers, auf Java mit Klick auf `/rueckkehr`), Restzeit über der Schnellleiste, Gegenstand in der Mitte der Leiste. Kommt beim Ankommen in der Lobby, bei einem neuen Platz, wenn die Lobby sich neu verbindet und wenn der Schalter wieder an ist – das Plugin zeigt die Zeile pro Besuch nur einmal                                                                                                                                                                                                                         |
| `rejoin-off`          | nur Lobby              | `uuid` – Angebot weg (abgelaufen, vom Modus zurückgenommen, Server weg, Gefängnis, Schalter aus, wieder in der Runde)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| _(binär)_ Audio       | Spielserver            | Sprache von anderen Servern zum Abspielen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

In `mode-settings` kommen Listen aus Zahlen oder Texten (Rundenzahlen zur Wahl, Taler oder Punkte je Platz …) immer
als ganze Liste (`"edelweiss-jagd-runden": [10, 15, 20]`), Felder von Listen-Einträgen einzeln
(`ankauf.stufen.1.prozent`). So entsteht eine Liste auch in einer älteren config.yml, die sie noch nicht hat – eine
einzelne Stelle ließe sich dort nicht eintragen.

Sprachchat-Stumm (`/voicemute` oder Panel) läuft über dieselbe Moderation wie die anderen Strafen; `muted` in `voice`
kommt bei jeder Änderung neu und spätestens eine Minute nach Ablauf einer Stummschaltung.

**Streamer-Modus** (`/streamer`, Panel → Einstellungen → Netzwerk → Streamer-Modus): Der Hub merkt sich je Spieler an/aus
und welche Teile er für sich abgeschaltet hat (`setting_values`, Bereich `_streamer`); was gilt (Panel erlaubt den Teil,
Rang darf, Spieler will), steht im `profile` als `streamer{on, parts[]}` mit `parts` aus `ip`, `coords`, `msg`, `live`.
Verdeckt wird beim Empfänger: Chat-Zeilen auf dem Spielserver, `msg` mit `mask` auf dem Proxy (Regeln in
`common/StreamerMask.java`, Adressen aus `streamer-config`); private Nachrichten deckt der Hub selbst ab (nur mit der
Maus lesbar); `● LIVE` steht im Chat (Hub), in der Tab-Liste und über dem Kopf (Plugin bzw. MorniCraft) hinter dem
Namen – Rang bzw. Abzeichen vorn, Name, „● LIVE“ hinten. Wer das Recht verliert oder wenn das Panel den Modus abschaltet, ist sofort aus (neues `profile`).

Fällt der Hub aus, läuft das Netzwerk weiter: Chat bleibt auf dem eigenen Server, Banns aus der letzten `bans`-Liste
gelten weiter, das Plugin verbindet sich alle paar Sekunden neu.

## Ankommen und Rauswurf: Lobby, dann Wartungs-Lobby

Der Proxy entscheidet den ersten Server (`PlayerChooseInitialServerEvent`) und das Ziel nach jedem Rauswurf oder
gescheiterten Verbinden (`KickedFromServerEvent`) selbst – die `try`-Liste der velocity.toml (vom Motor: alle
Mitglieder) wird nie durchlaufen. Reihenfolge: erst die Lobby, dann die Wartungs-Lobby (`wartung`), sonst freundlich
trennen. Mit Hub fragt der Proxy per `fallback`, ohne Hub gilt: Lobby, Wartungs-Lobby (bei Wartung nur sie). Scheitert
ein Wechsel, während der Spieler noch auf einem Server ist, bleibt er dort (Velocity sagt ihm warum). Ohne Hub sind nur
Lobby und Wartungs-Lobby offen; antwortet die Lobby wieder, holt der Proxy die Wartenden selbst zurück (nicht bei
Wartung). `to-lobby` (Kompass in der Wartungs-Lobby, „zurück“ in den Modi) läuft wie `/lobby`: in der Wartung bleibt
man, ist die Lobby nicht da, sagt der Hub es.

## Rang-Abzeichen

Ein Rang steht im Spiel als **Übersetzung** (`translatable`) mit dem Schlüssel „Symbol + Leerzeichen“, z. B. `♛ `
(Owner) oder `⚔ ` (Moderator); ein Rang ohne Symbol hat den Schlüssel `""` (leer), gleiche Symbole bekommen weitere
Leerzeichen angehängt (`packages/shared/src/badges.ts`, `badgeKeys`). Im Chat schickt der Hub `<lang:'♛ '/>`, auf
dem Spielserver malt das Plugin Tab-Liste und Namen über dem Kopf mit demselben Schlüssel (`profile.role.badge`).

- **Mit Paket** übersetzt der Client den Schlüssel in ein Zeichen der Schrift `minecraft:default`, hinter dem das
  Bild des Abzeichens liegt – das Schild mit Symbol und Rang-Namen (je Sprache des Clients, Deutsch für `de_*`).
- **Ohne Paket** (abgelehnt, Bedrock über Geyser, Client vor 1.20.3) zeigt der Client den Schlüssel selbst – also
  Symbol und Farbe wie vorher. Das entscheidet jeder Client für sich, auch im selben Chat.
- **Gefängnis:** Schlüssel `%1$s%2$s%3$s ` mit den Argumenten `[`, `⛓ Gefängnis`, `]` – ohne Paket „[⛓ Gefängnis]“.
- **Paket:** `GET /api/public/packs/abzeichen.zip?v=<sha1>` (ohne Anmeldung, nur mit eigener Domain), gebaut aus den
  Rollen des Panels (`apps/server/src/badges/pack.ts`): `assets/minecraft/font/default.json` (Bitmap-Zeichen ab
  U+E900), Bilder unter `assets/moinmorni/textures/font/abzeichen/`, Übersetzungen `assets/moinmorni/lang/` (en_us,
  de_de, de_at, de_ch), immer gleiche Bytes → gleiche SHA-1. Jede Änderung an Name, Symbol, Farbe oder Reihenfolge einer
  Rolle ergibt ein neues Paket; wer online ist, bekommt die neue Fassung gleich (wer abgelehnt hat, wird nicht noch
  einmal gefragt – `/abzeichen` holt es jederzeit).
- **Pflicht** (Schalter im Panel): Velocity darf ein Paket ab Minecraft 1.17 nicht erzwingen – der Proxy bietet es an,
  der Text im Fenster sagt, dass es Pflicht ist, und wer ablehnt, wird vom Hub mit einer Erklärung hinausgeworfen.

## Mitten im Spiel: Nachfrage und „Zurück ins Spiel“

Schnittstelle Fassung 2 (`askToLobby`, `playing`, `holdSlot`), Hub-Teil in `apps/server/src/hub/rejoin.ts`, auf dem
Spielserver `paper/LeaveAsk.java` (Fenster) und `paper/ReturnOffer.java` (Lobby). Beides lässt sich im Panel
abschalten: Einstellungen → Netzwerk → Mitten im Spiel (`lobbyConfirm`, `rejoinOffer`; im Spiel
`/netzwerk nachfragen an|aus`, `/netzwerk rueckkehr an|aus`).

- **Nachfrage:** Hat der Modus für den Spieler `playing = true` gemeldet, fragen /lobby (auch /hub, /l) und
  `ask-lobby` erst nach: `lobby-ask` an den Spielserver (Fenster) und die Frage im Chat. Ein zweites /lobby (oder ein
  zweites `ask-lobby`) innerhalb von 10 Sekunden gilt als Ja; `/lobby ja|yes` geht sofort, `/lobby nein|no` schließt
  das Fenster. Wer wartet, zuschaut oder ausgeschieden ist (`playing = false`), geht sofort. `toLobby` fragt nie. Ein
  Wechsel auf einen anderen Server oder das Abmelden vergessen den Stand. Meldet der Modus `playing` schon beim
  Betreten, kommt das oft vor dem `switch` des Proxys an – es gilt, wenn der Spieler binnen 5 Sekunden dort ankommt.
  Das Plugin meldet alle 30 Sekunden noch einmal, wer gerade spielt (nach einem Neustart des Hubs). Ohne Hub fragt der
  Spielserver selbst (Fenster), „Ja“ geht dann wie `toLobby`.
- **Zurück ins Spiel:** `hold-slot` gilt nur vom Server eines Spielmodus (nicht Lobby, nicht Bau-Server) und nur für
  Spieler, die gerade auf diesem Server sind oder ihn vor höchstens 30 Sekunden verlassen haben – meist kommt die
  Abmeldung beim Proxy zuerst. Der Platz zeigt immer auf den meldenden Server, höchstens 3600 Sekunden; ein neuer
  Platz ersetzt den alten. Wer selbst gegangen ist (Ja zur Lobby oder `toLobby` des Modus), bekommt dafür kein
  Angebot (15 Sekunden lang, bis er wieder auf diesem Server ist) – auf dem Spielserver sieht ein Wechsel in die Lobby
  genauso aus wie ein Abbruch. In der Lobby: `rejoin-offer`; Klick oder `/rueckkehr` (`/rejoin`) → `rejoin` →
  derselbe Weg wie bei einer Figur (Gefängnis, Wartung, Einladung) auf genau diesen Server. Das Angebot verschwindet
  (`rejoin-off`), wenn die Zeit um ist, der Modus `0` meldet, der Server sich vom Hub trennt (schläft, neu gestartet),
  der Spieler ins Gefängnis kommt, der Schalter aus ist oder er wieder in der Runde ist. Wartet ein Modus auf jemanden,
  geht sein Server nicht schlafen.

## Auf dem Spielserver: Spielmodi und MorniCraft

Das Netzwerk-Plugin heißt auf Paper `MoinMorni` (auf Velocity ID `moinmorni`) und legt seine Dateien in
`plugins/moinmorni/`. Für die Plugins der Spielmodi und für MorniCraft gilt:

- **Schnittstelle:** Bukkit-Dienst `de.moinmorni.api.MoinMorni` (Datei in jedem Modus-Repo byte-gleich, nur zum
  Übersetzen, nicht in der Jar). Ein Modus holt ihn mit `MoinMorni.get()` und hat `softdepend: [MoinMorni]` in seiner
  plugin.yml; MorniCraft sucht die Klasse per Reflexion (läuft auch ohne Netzwerk). Fassung 2 (`API_VERSION = 2`)
  bringt `askToLobby`, `playing` und `holdSlot` (siehe „Mitten im Spiel“) – ein Modus ruft sie so auf, dass ein
  `LinkageError` (älteres Netzwerk-Plugin) abgefangen wird.
- **Clan-Kürzel im Chat:** MorniCraft setzt am Spieler die Metadaten `moinmorni:tag` (Text) und `moinmorni:tag-colour`
  (`#rrggbb`); das Netzwerk-Plugin hängt das Kürzel im Chat hinter den Rang.
- **Streamer-Modus:** Das Netzwerk-Plugin setzt am Spieler die Metadaten `moinmorni:streamer` = Teile mit Komma
  (`ip,coords,msg,live`, leer = alle aus), ohne Streamer-Modus fehlen sie. Spielmodi verdecken danach, was nur sie zeigen
  (Koordinaten, Post …); MorniCraft liest so den Zustand des Netzwerks (`/streamer` beantwortet der Proxy überall).
- **Rang-Abzeichen:** Das Netzwerk-Plugin setzt am Spieler die Metadaten `moinmorni:badge` = Schlüssel des Abzeichens
  aus dem Profil (`role.badge`, z. B. „♛ “, leer = Rang ohne Symbol); sind Abzeichen aus, fehlen sie. Modi, die Tab-Liste,
  Namen über dem Kopf oder eigene Leisten selbst malen (MorniCraft ab 1.12.1), zeigen den Rang damit als
  `translatable(key, Rangfarbe)` – mit Abzeichen-Paket das Schild, sonst das Symbol.
- **Dateien:** `plugins/MorniCraft/network.json` (Einstellungen aus dem Panel, siehe `mornicraft-settings`) und
  `plugins/MorniCraft/summary/<uuid>.json` (Zusammenfassung fürs Panel, geht als `mode-player` an den Hub).

**Wartung ankündigen und Wartungs-Neustart** (`hub/wartung-plan.ts`, `/wartung an|aus|neustart|status|abbrechen`,
englisch `/maintenance`, Kurzform `/wartung-restart`, Panel `GET/POST /api/panel/wartung`, `…/abbrechen`, `…/aus`):
Mit Zeit (30s, 10m, 1h, höchstens 6 h) bekommen alle sofort `title`, `msg` und `countdown`, wer während des
Countdowns kommt, auch; Erinnerungen bei 60/30/15/10/5/2/1 Minuten und 30/10/5…1 Sekunden. Bei Ablauf: `an` = Wartung
des Netzwerks an (Grund = Wartungs-Text); `neustart` = Wartung an, der Wartungs-Lobby-Teil hält **alle** fest (auch das
Team, `hold`), jeder kommt per `connect` in die Wartungs-Lobby, MoinMorni startet alle Server außer ihr neu
(`network/restart-now.ts`, Proxy nur mit `--proxy`); danach (oder nach höchstens 30 Minuten, mit Hinweis ans Team und
ins Discord-Team-Log) Wartung aus – nur wenn sie erst der Neustart eingeschaltet hat – und alle kommen von selbst zurück.
