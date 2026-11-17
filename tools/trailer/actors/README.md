# Darsteller (actors)

Test-Spieler (mineflayer), die im Trailer wie echte Spieler wirken: eigene Skins und Namen, echte Physik **im Takt der
Zeitlupe**, natürlicher Kopf, Wege, Kampf und Handlungen. Für alle Drehbücher ab jetzt (die alten `actors.cjs`/`wk-actors.cjs`
mit `tp`-Bewegung bleiben für alte Drehbücher).

> Videos und Bilder aus dem echten Client zeigen Minecraft-Grafik: **nur lokal** (`/home/user/mm-cache/…`), nie ins Repo.

## Namen und Skins

`actors.json` – 18 erfundene Spielernamen, jeder mit eigenem Skin (z. B. `Toni_Wandert11` = orange Softshelljacke mit
Rucksack, `ResiBlume19` = Dirndl). Der Skin hängt fest am Namen: Offline-Spieler bekommen in Minecraft einen
Standard-Skin aus ihrer UUID, und unser Ressourcenpaket (`../skins/`) ersetzt genau diese 18 Standard-Skins – **nur im
Aufnahme-Client**. Nichts wird hochgeladen oder signiert. Kein Darsteller trägt den Skin eines anderen; zwei Darsteller
mit demselben Skin gibt es nicht.

- Andere Namen? `python3 ../skins/namen.py <Name>` zeigt, welchen Skin ein Name bekäme.
- Der Aufnahme-Client braucht das Paket: siehe `../skins/README.md`.
- Ich-Sicht: Der Aufnahme-Client heißt dann wie ein Darsteller (z. B. `Toni_Wandert11`) – sein Arm trägt dessen Skin.
  Dieser Name darf dann nicht gleichzeitig als Darsteller laufen.

## Zeitlupe mit echter Physik

Beim Dreh läuft der Server langsamer (`/tick rate 1.33` bei SLOW 15). Der Server meldet seinen Takt jedem Spieler
(Paket `set_ticking_state`); `zeit.cjs` stellt damit die Uhr von mineflayer (`performance.now`) auf **Spielzeit** um.
Die Physik rechnet dann genau einen Schritt je Server-Tick – gehen, springen, Rückstoß, Fallen sehen im beschleunigten
Video normal schnell aus. Alle Zeiten in dieser Bibliothek sind Spielzeit (`zeit.wait(ms)`); nichts muss von Hand
umgerechnet werden. Gemessen: 2 Spielsekunden gehen = 8,4 Blöcke, bei `/tick rate 2` in 20 echten Sekunden, ohne
„moved too quickly“.

Version: mineflayer kann bis 26.1 – Darsteller verbinden sich direkt mit einem Paper-26.1.2-Server. Über ViaBackwards
auf 26.3 werden Bewegungspakete abgelehnt; dort gehen nur Darsteller ohne Physik (alte `actors.cjs`).

## Benutzen

### Als Prozess mit Befehlen (für Drehbücher mit `shot.py` / `ich.py`)

```bash
: > /tmp/regie && tail -n0 -F /tmp/regie | node regie.cjs 127.0.0.1 26110 jay_beatz2 Lena_Herbst05 Yuki_Tor10 &
export MM_ACTORS_FIFO=/tmp/regie      # shot.py/ich.py schreiben die Ereignisse dorthin
```

Im Drehbuch als Ereignis: `{"at": 0.4, "actor": "Lena_Herbst05", "act": "bruecke nord 6"}`. `shot.py` meldet außerdem
laufend den Ort der Kamera (`* kamera x y z`) – damit klappt `blick kamera`.

| Befehl | Was passiert |
|---|---|
| `geh x y z [sprint] [genau=0.4] [blick=Name\|x,y,z\|kamera]` · `lauf x y z` | Weg suchen (Stufen, bis 3 Blöcke hinunter) und mit echter Physik hingehen bzw. rennen, am Ende hinschauen |
| `folge <Name> [abstand]` · `stopp` | hinterhergehen · alles anhalten |
| `blick <Name\|x y z\|kamera\|frei>` | Kopf auf ein Ziel; `frei` = wieder umherschauen |
| `leute 0.6` · `kamera 0.12` · `leerlauf an\|aus` | wie oft der Blick im Leerlauf zu Leuten bzw. zur Kamera springt |
| `kaempfe <Gegner> [dauer=8] [stil=modern\|klassisch] [cps=8] [krit=0.35] [schild=0] [waffe=sword] [treffer=n]` | Kampf wie echte Spieler (unten) |
| `bruecke <nord\|sued\|ost\|west> [anzahl] [material=planks]` | rückwärts geduckt an die Kante, nach unten-hinten schauen, Block an die Kante, weiter |
| `truhe x y z [nimm=alles\|text] [dann=sword]` | hingehen, hinschauen, öffnen, Dinge einzeln herausnehmen, schließen, etwas in die Hand |
| `essen` · `nimm <text>` · `slot <0-8>` | essen (1,6 s; satt? vorher `effect give … hunger`) · Gegenstand in die Hand · Platz wählen |
| `chat <text …>` · `gruss [n]` · `springe [n]` · `schleiche an\|aus` | Chat-Zeile · kurz ducken als Gruß · springen · schleichen |
| `bogen <Ziel> [spannen=1.1]` · `schild [s]` | Bogen spannen, mit Fallkurve zielen, loslassen · Schild hochhalten |
| `klick x y z [seite]` · `setze x y z <seite>` | Block anklicken (mit Blick) · Block an eine Seite setzen |
| `bahn x,y,z,t x,y,z,t …` | geführte Bahn (z. B. schwerer Parkour): weiche Kurve, Beine laufen mit, Kopf schaut voraus |
| `physik an\|aus` | eigene Physik aus/an – wenn der Server den Darsteller selbst führt (z. B. ein Test-Autopilot, der ihn jeden Tick versetzt) |

Alte Befehle (`swing`, `use`, `attack`, `hit`, `equip`, `open`, `place`, `take`, `click`, `close`, `inv`, `sneak`) gehen
weiter. Ausgaben: `ONLINE <Name>`, `FERTIG <Name> <aufgabe>`, `FEHLER …`, `KICK …`.

### In Node (eigene Skripte)

```js
const { Ensemble, zeit } = require('./darsteller.cjs');
const e = new Ensemble({ host: '127.0.0.1', port: 26110 });     // Version 26.1, 3,6 s Abstand beim Betreten
const lena = await e.add('Lena_Herbst05');
await lena.geh([1000.5, 102, 3.5], { blick: 'kamera' });
lena.chat('hey :)');
await lena.bruecke('nord', 6);
const treffer = await lena.kaempfe('Yuki_Tor10', { dauer: 5, krit: 0.5 });
await zeit.wait(500);                                            // Spielzeit
e.close();
```

Eine neue Aufgabe (`geh`, `kaempfe`, `bruecke` …) beendet die laufende; `chat`, `gruss`, `springe`, `blick` laufen
nebenher.

## Was die Darsteller von sich aus tun

- **Kopf:** weiche Feder statt Sprung (Bewegung wie mit der Maus), leichtes Zittern, alle 1–4 s ein Blicksprung zu
  Mitspielern, zur Kamera (`kamera`-Anteil) oder umher; beim Gehen schaut der Kopf voraus und leicht nach unten.
- **Gehen:** erst grob in die Richtung drehen, dann loslaufen; Wege mit Körperbreite (keine Abkürzung durch Ecken),
  springt nur an echten Stufen; festgefahren → neu planen.
- **Kampf:** anlaufen (Sprint), Abstand halten, alle 0,4–1,2 s die Seite wechseln, nach einem Treffer kurz loslassen
  (W-Tap, Sprint neu → mehr Rückstoß), Sprung-Kritische (Schlag erst im Fallen), Klicks im Takt der Abklingzeit
  (`modern`) oder mit 7–11 Klicks pro Sekunde (`klassisch`), Luftschläge beim Anlaufen, Schild bei gegnerischen
  Schwüngen (`schild=0.3`). Rückstoß und Treffer macht der Server – also echt.
- **Brücke:** Blick nach hinten-unten (ca. 77°), geduckt rückwärts bis über die Kante, setzen, weiter.

## Tipps aus dem Beweis-Clip

- Darsteller tun ihre Aufgabe auch nach der Einstellung weiter (in normaler Geschwindigkeit). Vor einer Wiederholung
  aufräumen (z. B. Bretter einer Brücke entfernen, Kante neu messen).
- Spielmodi mit Runden (Wolkenkampf) lassen Schaden und Bauen nur in der Kampfphase zu – also in einer echten Runde
  drehen; Uhr der Runde vor jeder Einstellung zurückstellen, sonst kommen Gewitter/Nebel dazwischen.
- Speicher ist knapp: Ein Prozess mit fünf Darstellern braucht ~150 MB, mit 18 ~550 MB.
- `aufstellung.cjs` fotografiert alle 18 im echten Client (vorne/hinten) – zum Prüfen der Skins.

## Dateien

`zeit.cjs` (Spielzeit) · `darsteller.cjs` (Darsteller, Kopf, Bewegung, Kampf, Handlungen) · `weg.cjs` (Wegsuche) ·
`regie.cjs` (Befehle über stdin) · `rcon.cjs` (RCON für Node) · `mods.cjs` (findet mineflayer im Cache) ·
`aufstellung.cjs` (Fotos aller 18) · `actors.json` (Namen → Skins, erzeugt von `../skins/namen.py`).
