# Lobby – „Dorfplatz am Schlossberg“

Philip hat Entwurf A gewählt (14.11.) und ausbauen lassen: **keine Portale, sondern Menschen zum Anklicken**, Leben im
Dorf, begehbare eingerichtete Häuser, Biergarten mit Wirt und Gästen.

## Was drin ist

- **Dorfmarkt** um den Maibaum: acht Stände eng im Kreis, je zwei an jeder Ecke, Gassen in alle vier Richtungen –
  je Spielmodus ein Stand mit Markise in der Farbe des Modus und einer Figur (Name, Spielerzahl bzw. Zustand,
  „Klick: Mitspielen“), dazu ein Brezn- und Lebkuchenstand. Ankunft in der Gasse südlich vom Markt. Hier stehen
  die ersten sieben Modi (`RING_MODES` in `packages/builder/src/lobby/schlossmarkt.ts`).
- **Schlossmarkt** (16.11., `schlossmarkt.ts`): alle weiteren Modi in einer Marktzeile auf dem Vorplatz vor der
  Schlosstreppe – je drei Stände links und rechts der Prachtstraße (innen zuerst: Wolkenkampf, Versteckerl,
  Wintersport, Adlerflug, Angelkönig, dazu die Blumenfrau mit Blumen und Kräutern), Marktbogen über der Straße mit
  Wimpeln in den Farben der Stände und Schild „Schlossmarkt“, Wegweiser am Nordausgang des Dorfplatzes, Stützmauer
  mit Hecke und Laternenpfeilern zum Schlossberg (der Hang wächst nicht mehr über den Vorplatz), Lager hinter den
  Ständen (Fässer, Heu, Holzstoß), Laternen und Blumen zwischen den Ständen, Brotzeit-Garnituren davor,
  Marktkarren unter Linden an beiden Enden, Blumenbeete zum Dorfplatz, Leute beim Schauen und Bummeln. Die
  Launchpads und ihre Flugbahn bleiben frei (Test `lobby-market.test.ts`). Zwischen den Ständen steht nichts mehr
  in Kopfhöhe der Figuren (vorher ein schwebendes Brett und ein Topf auf dem Fass): vorne die Laterne, ein Blumenbeet
  im Pflaster, hinten ein Fass; neben den Figuren stehen keine Blumentöpfe auf der Theke (Test).
- **Neue Figuren** bekommen eigene Trachten (`PENDING_CAST` in `cast.ts`: Ballonfahrerin, Dorfgendarm,
  Skilehrerin, Flieger, Fischer, Blumenfrau). Bis sie bei MineSkin signiert sind
  (`tsx tools/lobby-entwuerfe/src/sign-skins.ts`), trägt jede die Tracht einer passenden bestehenden Figur
  (`STAND_IN`); danach von selbst die eigene – Skin und 3D-Tracht passen immer zusammen.
- **Dorfstraße** nach Süden: Bäckerei, Krämerladen, Apotheke, Wohnhäuser, Kapelle; am Platz Rathaus und Gäste-Info.
- **Handwerkergasse** nach Westen (zwischen den Ständen hindurch): Schmiede, Trachten, Schreinerei, Wohnhäuser,
  Vorgärten, Brunnen am Ende.
- **Oberdorf** im Nordosten: kleiner Platz mit Brunnen und Linde, vier Häuser.
- **Wirtshaus „Zum Morni“** mit Wirt hinterm Tresen, Stammtisch und Gästen; davor der **Biergarten** mit Ausschank
  (Wirt), Kastanien, Lampions und Gästen an den Tischen.
- Alle Häuser sind **begehbar und eingerichtet** (Küche, Eckbank, Kachelofen, Schlafzimmer, Leiter nach oben; Läden
  mit Theke und Verkäufer). Einrichtung als Daten in `packages/builder/src/village.ts`.
- **Leute im Dorf**: Figuren mit Tag `mm_walker` schlendern um ihren Platz herum, stehende Figuren schauen Spieler
  in der Nähe an, Kinder sind kleiner.
- **Prunkaufgang zum Schloss** (`schlosstreppe.ts`, Philip: „richtig schön, edel, wow – jetzt ist hier richtig Party
  angesagt“): Der **rote Teppich** beginnt am Rand des Dorfplatzes, läuft mit goldener Borte durch den Marktbogen,
  über die Stufen (Läufer aus rotem Netherziegel – Teppich liegt auf Treppen nicht), über den Vorplatz und durchs
  Schlosstor bis vor den Prunkbrunnen im Ehrenhof (Test: ohne Lücke).
  - **Prunkportal** am Fuß der Treppe: je Seite ein Pfeiler mit zwei Quarzsäulen und goldenen Kapitellen, dazwischen
    eine Nische mit Banner (links Smaragd/Gold, rechts Weiß-Blau) und Blumentopf, Rundbogen aus Marmor mit
    Schlussstein und Kronleuchter, Gebälk mit der Inschrift „♛ Zum Schloss ♛“, darüber die Attika mit dem Wappen
    (Smaragd, Gold, Weiß-Blau, Krone; hinten zur Treppe hin noch einmal), Fahnen auf den Pfeilern, Laternen an den
    Ecken, Blumenkübel davor und in den Ecken zur Stützmauer. Nachts angestrahlt (unsichtbares Licht vor der Front).
    Der Marktbogen steht dafür vorne am Markt (z −24, zum Dorfplatz hin) – vorher stand er vier Blöcke vor dem Portal
    und verdeckte es.
  - **Schlosstreppe**: vier Läufe mit 26 Stufen aus weißem Marmor und drei Podesten (Marmor, Quarzziegel-Rand,
    goldene Borte neben dem Teppich), dem Schlossberg nachgeführt. Wangen aus Marmor, als Geländer eine Blütenhecke,
    alle drei Stufen ein Quarzpfosten mit Laterne, an den Enden der Podeste Goldkugeln mit Laternen und Blumenkübel,
    neben jedem Podest zwei **Fahnenmasten** (Smaragd links, Weiß-Blau rechts), Blumen am Hang, Licht über den Stufen.
  - **Schlossvorplatz** in hellem Stein (Diorit, glatter Stein), Teppich mit Goldborte und einem Stern aus Gold und
    Smaragd darin, Blumenbeete, am Kopf der Treppe zwei hohe Fahnen, am Rand eine **Fahnenallee**, zwischen den ersten
    beiden Paaren **Lichterketten** über den Platz (goldene und blaue Laternen im Wechsel – weiß-blau; so hoch, dass
    der Blick aufs Schlosstor frei bleibt), Laternen am Mittelweg, zwei Linden, helle Brüstung (Dioritmauer), wo der
    Platz über dem Hang liegt.
  - **Schlosstor**: zwei Torpfeiler mit Pilastern, Fahnenmasten auf den Pfeilern, Laternen an den Ecken, Rundbogen,
    offene Torflügel, **Kronleuchter** im Torweg, darüber die Attika mit dem Wappen und Banner; nachts angestrahlt.
  - Fahnenmasten sind aus Blasseichen-Zaun (Endstäbe sind dem Prunkbrunnen vorbehalten – das Möbel-Paket blendet sie
    aus), jede Fahne bekommt unsichtbares Licht (`fahnen.ts`: `flagpole`, `banner`, Wappen).
  - Die Launchpads bleiben zusätzlich – ihre Flugbahn ist frei (Portal, Fahnen und Pfosten stehen außerhalb, Test mit
    Luftreibung wie im Spiel, ganzer Körper), gelandet wird auf der Treppe.
  - **Keine nackte Erde** am Rand von Schlossmarkt, Treppe und Vorplatz (Philip sah bei x −8, z −37 eine Erdwand
    neben der alten Rampe; Test `lobby-eingang.test.ts` sucht jede sichtbare Erde neben Gebautem). Behoben dabei: ein
    Erdhügel hinter dem niedrigen Teil der Stützmauer (`range` zählt auch rückwärts).
- **Schloss** auf dem Hügel: Vor Festsaal, Bibliothek und Rittersaal führt je eine **Freitreppe** mit Podest, Wangen,
  Laternen und Blumen zur Tür (die Säle liegen zwei Blöcke über dem Hof; vorher kam man nicht hinein, und vor jeder
  Tür stand ein Pilaster). Im Festsaal die **Prunktreppe** zur Galerie: zweiläufig links und rechts der Rotunde,
  Marmor mit rotem Läufer, schmiedeeisernes Geländer, Goldpfosten mit Laternen, Teppich unten und oben.
- Obstgarten, Felder, Teich, Alpengipfel ringsum. Die **Gärten** hinter den Häusern der Dorfstraße haben ein
  Gartentor zur Gasse (vorher lief ihr Zaun quer durch die Häuser – hinten und oben kam man nicht hin), die
  **Kapelle** ist innen begehbar (durch den Turm: Bänke, Teppich, Altar, goldenes Kreuz).

## Zu Fuß erreichbar (Prüfung ohne Server)

`packages/builder/src/lobby/walk.ts` wertet den fertigen Bauplan aus: Wo kann man stehen (fester Boden, 1,8 Blöcke
frei), wohin kommt man vom Ankunftspunkt aus zu Fuß? Regeln wie im Spiel: höchstens 1 Block hinauf (über 0,6 nur mit
Sprung, mit Platz über dem Kopf), Stufen und Treppen mit ihrer echten Höhe (Treppen von vorne und von der Seite in zwei
halben Stufen, von hinten nur mit Sprung), Zäune und Mauern sind zu hoch, Türen, Tore und Falltüren gehen auf,
Leitern klettert man, hinunter geht es beliebig. Die Bauten melden ihre Räume und Plätze (`Canvas.place` – Häuser je
Stockwerk, Säle, Galerie, Stände, Gärten, Plätze, Podeste …).

- Bericht: `npx tsx tools/lobby-entwuerfe/src/zu-fuss.ts` – jeder Ort mit „zu Fuß“ bzw. Zahl der Sprünge, dazu jeder
  zusammenhängende Boden, den man nicht erreicht (Deko wie Dächer, Baumkronen, Markisen, Möbel-Oberseiten, Hänge und
  Hohlräume unter dem Gelände zusammengefasst).
- Test `packages/builder/test/lobby-walk.test.ts`: jeder Ort ist zu Fuß erreichbar **ohne einen einzigen Sprung**,
  kein anderer Boden bleibt unerreichbar, und die gewollten Ausnahmen bleiben zu (`ON_PURPOSE`: Arrestzelle,
  Parkour-Ziel, Brunnenbecken der Handwerkergasse). Kommt etwas Neues dazu, das man nicht erreicht, schlägt er an.
- Echt: `tools/netz-test/treppen-test.cjs` (Test-Spieler, Paper 26.1.2) läuft die Treppen nur mit der Vorwärts-Taste
  hinauf (an einer ganzen Blockstufe bliebe er stehen) und findet mit Pathfinder ohne Launchpads vom Ankunftspunkt
  ins Schloss.

Anfangs fand die Prüfung: Festsaal, Galerie, Bibliothek und Rittersaal unerreichbar (Türen zwei Blöcke über dem Hof),
den Hof nur mit 26 Sprüngen über die Prachtstraße (Rampe aus ganzen Blöcken), die oberste Stufe der alten
Galerie-Treppe fehlte, die Gartenzäune der Dorfstraße liefen durch acht Häuser (hintere Hälfte des Erdgeschosses und
alle oberen Stockwerke unerreichbar), sieben Gärten waren rundum zu. Die Bastei hinter dem Schloss liegt unter dem
Berghang (Hohlraum, kein Platz).

## Möbel (Ressourcenpaket)

Stühle mit Herz-Lehne, Eckbänke, Wirtstische, Hocker, Bierbänke, Biertische und Steinkrüge sind **eigene 3D-Modelle**
(`packages/builder/src/furniture.ts`). Sie hängen an Blöcken, die es in der Lobby **nur als Möbel** gibt – das Paket
gibt ihnen ein neues Aussehen, Kollision und Sitzhöhe bleiben echt:

| Block                                | Möbel                  |
| ------------------------------------ | ---------------------- |
| Mangroven-Treppe unten, gerade/innen | Eckbank (mit Rückwand) |
| Mangroven-Treppe sonst               | Stuhl                  |
| Mangroven-Stufe oben / unten         | Wirtstisch / Hocker    |
| Birken-Stufe oben / unten            | Biertisch / Bierbank   |
| braune Kerze (1–4, aus)              | 1–4 Steinkrüge         |

**Darum in der Lobby keine Mangroven-/Birken-Treppen und -Stufen und keine braunen Kerzen für anderes verbauen.**
Die Modelle nutzen nur Minecrafts eigene Texturen (es liegen keine Mojang-Dateien im Paket). Weil Minecraft die Fläche
unter Treppen/Stufen weglässt, malen die Modelle ein Stück Boden (Dielen bzw. Kies) mit; `fitFurniture` setzt vor einer
Wand eine Eckbank statt eines Stuhls und Kies unter jede Bierbank (Tests in `packages/builder/test/`).

Ausgeliefert unter `/api/public/packs/lobby.zip`; die Lobby bietet es per `server.properties` an (ID
`6d6f696e-6d6f-726e-692d-6d6f6562656c`), Pflicht nur mit dem Schalter **Lobby → Möbel-Paket → Möbel-Paket verpflichtend**
(`/lobby paket an|aus`). Der Proxy nimmt es beim Wechsel auf einen anderen Server wieder ab. Ohne Paket (abgelehnt,
Bedrock) sieht man die normalen Blöcke – nichts fehlt. Echt geprüft mit Client 26.3 in der Docker-Lobby: angeboten,
geladen, `/bau` → weg, `/lobby` → wieder da.

## Trachten in 3D (Ressourcenpaket)

Die Bewohner tragen 3D-Frisuren (kurz, lang, Zöpfe, Dutt), Bärte und Hüte (Trachtenhut mit Gamsbart, Strohhut,
Kochmütze, Mütze, Kappe, Kopftuch, Krone, Helm, Kapuze) und am Körper Dirndl (Rock, Schürze, Mieder mit Schnürung und
Bluse), Westen und Hosenträger (`packages/builder/src/trachten.ts`). Farben kommen aus der Tracht der Figur
(`cast.ts`).

- Kopf-Teile stecken im Kopf-Platz der Figur (drehen und nicken mit), Körper-Teile in einem Anzeige-Objekt, das auf der
  Figur mitfährt; das Lobby-Plugin dreht es mit, wenn die Figur sich umschaut oder läuft. Sitzende Figuren tragen nur
  die Kopf-Teile.
- Alle Teile benutzen das Modell `minecraft:air` – in Minecraft ist es leer. Unser Paket ersetzt
  `assets/minecraft/items/air.json` und wählt über `custom_model_data` die Teile. **Ohne Paket (oder auf Bedrock)
  sieht man nichts davon, nur die gewohnten Skins.**

## Figuren und Skins

Die Figuren sind Mannequins (Minecraft 1.21.9+) mit **eigenen Pixel-Skins** – gezeichnet in
`packages/builder/src/skins.ts`, die Leute stehen in `cast.ts` (27 Stück: Modus-Figuren, Wirt, Kellnerinnen, Bäcker,
Schmied, Bürgermeister, Gäste, Kinder).

Die Skins sind **von Mojang signiert** (Philips Go, 15.11.): `tools/lobby-entwuerfe/src/sign-skins.ts` lädt jede Tracht
einmal bei [MineSkin](https://docs.mineskin.org) hoch (ohne Schlüssel, nicht öffentlich gelistet) und schreibt Adresse

- Signatur nach `packages/builder/src/cast-textures.ts` (öffentliche Daten, keine Geheimnisse). Die Figur trägt sie als
  `profile:{properties:[{name:'textures',value:…,signature:…}]}` – so sieht **jeder Java-Spieler die Trachten ohne
  Texturpaket** (echt geprüft mit Client 26.3 ohne Paket), und Geyser kann sie an Bedrock weitergeben (ohne
  Bedrock-Client nicht prüfbar). Ändert sich eine Tracht, schlägt der Test `packages/builder/test/cast.test.ts` an:
  dann `npx tsx tools/lobby-entwuerfe/src/sign-skins.ts` (lädt nur Geändertes neu hoch, ~10 pro Minute).

`castPack()` / `tools/lobby-entwuerfe/src/pack.ts` bauen weiterhin ein Texturpaket mit allen Trachten – nur noch für
Vorschaubilder.

## Im Netzwerk-Plugin (`LobbyNpcs.java`)

| Tag                               | Bedeutung                                                                                                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mm_npc`                          | Figur der Lobby: nimmt keinen Schaden (nur `/kill` beim Neubau wirkt)                                                                                                                              |
| `mm_mode_<id>`                    | Anklicken (rechts oder links) → Nachricht `play` an den Hub → Modus beitreten bzw. wecken                                                                                                          |
| `mm_mode_label`                   | Schild aus dem Bau – das Plugin ersetzt es durch eigene Schilder mit Live-Zahlen                                                                                                                   |
| `mm_walker`                       | läuft gemütlich in bis zu 8 Blöcken um den Platz herum (nur auf freiem, ebenem Boden)                                                                                                              |
| `mm_lobby` + `mm_build_<version>` | alles, was der Lobby-Bau setzt; Wesen aus älteren Bauten entfernt das Plugin, sobald sie geladen werden oder die Version wechselt (Datei `plugins/moinmorni/lobby-world.target`, alle 2 s geprüft) |

Der Hub schickt allen Spielservern `lobby` mit Zustand und Spielerzahl je Modus (`docs/hub-protokoll.md`). Das Plugin
hält je Figur zwei Schilder (Deutsch/Englisch); jeder Spieler sieht nur das in seiner Sprache (`/sprache` gilt sofort).

## Leben in der Lobby (`LobbyFeatures.java`, Einstellungen im Panel unter „Lobby“)

Die festen Punkte (Ankunft, Launchpads, Parkour, Rundgang) stehen in `packages/builder/src/lobby/features.ts`; der Hub
schickt sie zusammen mit den Panel-Einstellungen als `lobby-settings` an den Lobby-Server (bei jeder Änderung neu).

- **Ankunft:** am Dorfplatz mit Blick zum Schloss; Begrüßung als Titel (Text im Panel).
- **Ankündigungen:** Leiste oben, wechselt alle n Sekunden (Liste und Takt im Panel).
- **Kompass „Spielmodi“:** Menü mit einem Symbol je Modus (`icon` in `MODES`), Zustand und Spielerzahl; wo gerade
  jemand spielt, glänzt das Symbol, geschlossene Modi sind grau. Klick = beitreten bzw. wecken.
- **Rundgang:** Buch in der Leiste oder `/rundgang`; neue Spieler bekommen ihn einmal automatisch (Schalter im Panel),
  acht Stationen im Zuschauer-Modus, `/rundgang stop` bricht ab.
- **Launchpads:** zwei Smaragd-Platten am Vorplatz schießen schräg zur Mitte die Schlosstreppe hinauf (zu Fuß geht
  es über die Stufen).
- **Parkour:** weiß-blaue Spirale im Nordwesten (Start = Smaragd, Kontrollpunkte = Gold, Ziel = Diamant), Zeitmessung,
  Sturz → letzter Kontrollpunkt, Bestzeiten in `plugins/moinmorni/parkour.yml`, Bestenliste als Schild und `/parkour`.
- **Schutz:** kein Abbauen/Setzen, kein Schaden, kein Hunger, nichts fallen lassen; aus der Welt gefallen → Dorfplatz.
- **Saison-Deko:** Wiesn, Winter, Ostern, Halloween oder keine (`packages/builder/src/lobby/season.ts`, eigenes
  Datenpaket `moinmorni-lobby-season`). Wechsel im Panel setzt die Deko sofort neu. Anzeige-Blöcke tragen den Block
  doppelt (`Name` bis 26.2, `id` ab 26.3 – sonst zeigt 26.3 nur Luft).
- **Dorfleute:** wie viele herumlaufen, stellt das Panel ein.

## Lobbymusik (`LobbyMusic.java`, Noten in `packages/builder/src/musik/`)

Zur Saison-Deko spielt passende Musik – im Alltag Blasmusik und Stubenmusik, zur Wiesn Polka, Schunkelwalzer,
Einzugsmarsch und Schuhplattler, im Winter Weihnachtslieder, zu Ostern Frühlingslieder und Griegs Morgenstimmung, zu
Halloween Griegs Bergkönig und zwei Gruselstücke. 25 Stücke, jedes eine bis anderthalb Minuten.

- **Nur eigene oder gemeinfreie Melodien:** 13 selbst geschrieben (MoinMorni-Marsch = das MoinMorni-Thema aus den
  Trailern), dazu Volksweisen und Stücke von Komponisten, die seit über 70 Jahren tot sind (Gruber, Silcher, Schulz,
  Ebel, Zöllner, Lyra, Grieg). Herkunft steht im Panel bei jedem Stück (`packages/shared/src/lobby-music.ts`). Die
  Melodien der Weihnachts- und Frühlingslieder sind nach den Noten der deutschen Wikipedia geschrieben (nur die
  Melodie – Begleitung und Satz sind eigene). Keine geschützten Wiesn-Hits, nichts von Mojang.
- **Noten als Text** (`musik/noten.ts`, wie LilyPond: `"g'8 e' f' g' | c''4."`, Taktstriche werden geprüft, Auftakt
  erlaubt) und Akkorde je Takt; `musik/arrangement.ts` macht daraus die Kapelle je Stil (Polka, Marsch, Walzer,
  Ländler, Lied, Choral, Wiegenlied, Spuk): Tuba auf den Hauptschlägen, Nachschlag, zweite Stimme in Terzen und Sexten,
  gebrochene Akkorde, Liegeakkorde, Schlagwerk, Klatschen, Schlittenschellen; Besetzungen in `musik/band.ts`
  (Blaskapelle, Bierzelt, Stubenmusik, Glocken, Turmblasen, Frühling, Spuk, Geister).
- **Mit Lobby-Paket:** echte Klangdateien (`apps/server/musik/<stück>.ogg`, `sounds.json` im Paket mit
  `stream: true`). Gerendert mit `npx tsx tools/lobby-musik/src/render.ts` (MIDI → FluidSynth mit dem Klangsatz
  FluidR3_GM, MIT-Lizenz → ffmpeg, Lautheit −18 LUFS, Ogg Vorbis); `lieder.json` merkt sich einen Fingerabdruck der
  Noten – ändert sich ein Stück, meldet es der Server-Test, bis es neu gerendert ist (rendert nur Geänderte).
- **Ohne Paket und auf Bedrock:** dieselbe Kapelle mit Notenblöcken (Flöte + Harfe für die Melodie, Bass +
  Didgeridoo für die Tuba, Gitarre/Harfe im Nachschlag, Glocke für Glockenspiel, Xylophon für den Geisterwalzer, Pauke
  und Trommeln als Bassdrum/Snare/Hi-Hat). Der Hub schickt die Töne mit `lobby-music` (`docs/hub-protokoll.md`).
- Gespielt wird für jeden Spieler einzeln (zufälliges erstes Stück, dann der Reihe nach), im Bereich
  **„Plattenspieler/Notenblöcke“** – der Regler im Spiel wirkt, und Minecrafts eigene Hintergrundmusik wird so lange
  angehalten. Ob jemand das Paket geladen hat, meldet der Proxy (`pack`) – der Lobby-Server sieht es nicht.
- **Gedämpft** im Parkour, beim Rundgang und im Gefängnis (Panel: „Gedämpft“, Vorgabe 40 %): Eine laufende
  Klangdatei lässt sich nicht leiser drehen – dann spielt dasselbe Stück an derselben Stelle leise mit Notenblöcken
  weiter, das nächste wieder als Klangdatei.
- **Jeder Spieler:** `/musik an|aus|leiser|lauter|weiter|0–100` (englisch `/music on|off|quieter|louder|next`),
  gemerkt im Hub (`mode_players` unter `_musik`). Neue Lautstärke für eine Klangdatei → gleich das nächste Stück.
- **Panel:** Lobby → Musik (an/aus, Lautstärke, gedämpft, Pause zwischen den Stücken) und je Saison eine Liste der
  Stücke zum Ein- und Ausschalten; alles auch als `/lobby musik …`. Saison-Wechsel → neue Musik sofort.

Hörproben: die Dateien unter `apps/server/musik/` (Ogg Vorbis, jeder Player spielt sie ab).

## Gefängnis (`LobbyJail.java`, Zelle in `packages/builder/src/lobby/jail.ts`)

`/gefaengnis <spieler> [dauer] [grund]` (auch `/jail`, ohne Dauer zehn Minuten) oder im Panel unter Spieler/Strafen.
Die Strafe gilt im ganzen Netzwerk:

- Wer gerade einen Modus spielt, kommt in die Lobby; andere Server lehnt der Hub ab, solange die Strafe läuft.
- Die Zelle liegt im Keller des Rathauses. Das Plugin hält Eingesperrte darin (auch Teleports nach draußen), zeigt
  eine Leiste mit der Restzeit und lässt nur `/msg`, `/r`, `/regeln`, `/hilfe`, `/sprache` zu.
- Chat aus der Zelle lesen nur das Team (Recht „Gefängnis“) und andere Eingesperrte; `/msg` geht nur ans Team.
- Nach Ablauf oder `/frei <spieler>` zurück auf den Dorfplatz mit Kompass und Buch. Wer offline eingesperrt wird,
  landet beim Betreten direkt in der Zelle.
- **Raus kommt man immer:** Wer nicht (mehr) eingesperrt ist und trotzdem in der Zelle steht – nach einem Neustart der
  Lobby, einer Freilassung während man weg war, oder wenn ein Teleport nicht geklappt hat –, wird jede Sekunde und
  beim Betreten an den Dorfplatz gesetzt (ohne Lobby-Einstellungen an den Spawn der Welt). Zuschauer- und Kreativmodus
  dürfen hinein (das Team zum Reden). Der Stand liegt zusätzlich in `plugins/moinmorni/jail.json` (`JailBook.java`):
  Nach einem Neustart kennt die Lobby Zelle und Eingesperrte, bevor sich der Hub meldet. Zwei Strafen auf einmal: die
  längste zählt (wie im Hub). Der Hub schickt den Stand jede Minute noch einmal.
- Strafen gehen nur an niedrigere Ränge (auch `/frei`): den Owner sperrt niemand ein, Admins nur der Owner. Eine alte
  Strafe auf einem Owner hebt nur ein Owner auf (auch der Owner selbst, im Panel).
- Discord: Rolle „⛓ Gefängnis“ (sieht nur den Gefängnis-Kanal), wird nach Ablauf wieder abgenommen; Eintrag im
  Team-Log.

## Die Lobby baut sich selbst

Beim Einrichten (und nach jedem Update, wenn sich der Bauplan geändert hat) baut MoinMorni die Welt auf dem
Lobby-Server auf – ohne RCON von außen, nur über den Motor (`apps/server/src/lobby/world.ts`):

1. server.properties der Lobby: Abenteuermodus, friedlich, kein PvP, kein Nether, kein Texturpaket (die Skins sind
   signiert).
2. Bauplan als Datenpaket nach `world/datapacks/moinmorni-lobby/` (`lobbyPack()` in
   `packages/builder/src/lobby/datapack.ts`, ~83 Funktionen à 3000 Befehle).
3. `minecraft:reload`, Welt-Stücke in kleinen Portionen festhalten (`forceload`, 4×4 Stücke pro Befehl – alles auf
   einmal ließ den Server minutenlang hängen), warten bis geladen, `clean` (alte Wesen weg), Bau-Funktionen
   nacheinander, `finish` (Spielregeln, Ankunftspunkt, Weltgrenze, Reste älterer Bauten), Stücke loslassen,
   Datenpaket wieder ausschalten. Minecraft lädt die Wesen eines Stücks erst nach den Blöcken – was dabei noch nicht
   geladen war, räumt das Lobby-Plugin über die Bau-Version weg.
4. Version in `plugins/moinmorni/lobby-world.version` – gleicher Plan = nichts zu tun. Die **Bau-Version** ist die
   Prüfsumme des Datenpakets (`lobbyPack()`): jede Änderung am Bauplan zählt sie von selbst weiter, das nächste
   Update baut die Lobby neu (von Hand muss nichts hochgezählt werden).

Echt geprüft mit einem frischen Paper 26.3 (`apps/server/scripts/lobby-selbstbau.ts`, Brücke statt Motor):
Welt-Stücke erzeugen ~4 Min., Bau 55 s, keine Ladefehler, kein Hänger.

## Bauen und Bilder

```bash
MM_RCON=127.0.0.1:25710 MM_RCON_PASS_FILE=.rcon-pass npx tsx tools/lobby-entwuerfe/src/build.ts a
```

```bash
npx tsx tools/lobby-entwuerfe/src/plan.ts a plan.png 130
```

Bilder mit dem echten Client: `tools/mc-client` (Texturpaket in `resourcepacks/` und
`--option 'resourcePacks:["vanilla","file/MoinMorni-Lobby.zip"]'`). Aussichtspunkte: `VIEWS_A` in
`tools/lobby-entwuerfe/src/draft-a.ts`.
