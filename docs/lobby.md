# Lobby – „Dorfplatz am Schlossberg“

Philip hat Entwurf A gewählt (14.11.) und ausbauen lassen: **keine Portale, sondern Menschen zum Anklicken**, Leben im
Dorf, begehbare eingerichtete Häuser, Biergarten mit Wirt und Gästen.

## Was drin ist

- **Dorfmarkt** um den Maibaum: acht Stände eng im Kreis, je zwei an jeder Ecke, Gassen in alle vier Richtungen –
  je Spielmodus ein Stand mit Markise in der Farbe des Modus, Banner hinten außen und einer Figur mit einem passenden
  Gegenstand (siehe unten), dazu ein Brezn- und Lebkuchenstand. Innen bleibt die Rückwand frei (ein Banner direkt
  hinter der Figur sah aus wie ein Brett am Rücken, und das Schild ist vor dem dunklen Holz gut zu lesen). Ankunft in
  der Gasse südlich vom Markt. Hier stehen die ersten sieben Modi (`RING_MODES` in
  `packages/builder/src/lobby/schlossmarkt.ts`).
- **Schlossmarkt** (16.11., `schlossmarkt.ts`): alle weiteren Modi in einer Marktzeile auf dem Vorplatz vor der
  Schlosstreppe – je drei Stände links und rechts der Prachtstraße (innen zuerst: Wolkenkampf, Versteckerl,
  Wintersport, Adlerflug, Angelkönig, dazu die Blumenfrau mit Blumen und Kräutern), Marktbogen über der Straße mit
  Wimpeln in den Farben der Stände und Schild „Schlossmarkt“, Wegweiser am Nordausgang des Dorfplatzes, Stützmauer
  mit Hecke und Laternenpfeilern zum Schlossberg (der Hang wächst nicht mehr über den Vorplatz), Lager hinter den
  Ständen (Fässer, Heu, Holzstoß), Laternen und Blumen zwischen den Ständen, Brotzeit-Garnituren davor,
  Marktkarren unter Linden an beiden Enden, Blumenbeete zum Dorfplatz, Leute beim Schauen und Bummeln. Die
  Launchpads und ihre Flugbahn bleiben frei (Test `lobby-market.test.ts`).
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
- Schloss auf dem Hügel, Prachtstraße, Obstgarten, Felder, Teich, Alpengipfel ringsum.

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

## Figuren und Skins

Die Figuren sind Mannequins (Minecraft 1.21.9+) mit **eigenen Pixel-Skins** – gezeichnet in
`packages/builder/src/skins.ts`, die Leute stehen in `cast.ts` (33 Stück: zwölf Modus-Figuren, Wirt, Kellnerinnen,
Bäcker, Schmied, Bürgermeister, Gäste, Kinder, Blumenfrau). Gezeichnet mit Licht von oben vorn:

- **Gesicht:** Brauen, Augen mit Weiß und Pupille (2 × 2), Nase, rote Wangen, Mund; Bart mit Schnurrbart und Mund.
- **Haare** mit Strähnen und Schatten; Volumen und Pony auf der zweiten Ebene.
- **Kleidung** mit Kragen, Knopfleiste, Falten, Seitennaht, Gürtel mit Schnalle, Bündchen, Händen mit Daumen und
  Fingern, Schuhen mit Sohle und Schnürung (Dirndl: Schnalle), Lederhose mit Latz, Naht und Hirschhornknöpfen,
  Wadlstrümpfe mit Zopfmuster.
- **Zweite Ebene:** Westen mit Revers und Knöpfen, Hosenträger mit Steg (hinten über Kreuz), Arbeitsschürzen mit Latz,
  Rucksack-Gurte und Rucksack, Puffärmel mit Spitze, Ärmel-Bündchen, Rock und Schürze, Stutzen, Hüte.

Die Skins sind **von Mojang signiert** (`tools/lobby-entwuerfe/src/sign-skins.ts` lädt jede Tracht einmal bei
[MineSkin](https://docs.mineskin.org) hoch – ohne Schlüssel, nicht öffentlich gelistet – und schreibt Adresse +
Signatur nach `packages/builder/src/cast-textures.ts`, öffentliche Daten, keine Geheimnisse). Die Figur trägt sie als
`profile:{properties:[{name:'textures',value:…,signature:…}]}` – so sieht **jeder Java-Spieler die Trachten ohne
Texturpaket**, und Geyser kann sie an Bedrock weitergeben (ohne Bedrock-Client nicht prüfbar). Ändert sich eine
Tracht, schlägt der Test `packages/builder/test/cast.test.ts` an: dann `npx tsx tools/lobby-entwuerfe/src/sign-skins.ts`
(lädt nur Geändertes neu hoch, etwa 10 pro Minute). Neue Figuren (`PENDING_CAST`) tragen bis zur Signatur die Tracht
einer passenden Figur (`STAND_IN`).

`castPack()` / `tools/lobby-entwuerfe/src/pack.ts` bauen weiterhin ein Texturpaket mit allen Trachten – nur noch für
Vorschaubilder.

## Trachten in 3D (Ressourcenpaket)

Was über die Figur hinausragt, kommt mit dem Möbel-Paket in 3D dazu (`packages/builder/src/trachten.ts`); alles
Flache malt der Skin selbst (oben). Farben kommen aus der Tracht der Figur (`cast.ts`).

- **Hüte** (Trachtenhut mit Gamsbart, Strohhut, Kochmütze, Mütze mit Bommel, Kappe mit Schirm, Kopftuch, Krone,
  Partyhut, Helm mit kurzem Nasenschutz zwischen den Augen, Fliegerhaube mit Brille und Ohrenklappen, Kapuze) sitzen
  auf dem Kopf: Ihre Wände umschließen die drei obersten Reihen, auf
  die der Skin seinen Hut malt, mit Abstand zur zweiten Ebene (nichts flimmert, nichts schwebt).
- **Bart** mit Schnurrbart und Lücke für den Mund, **Dutt** am Hinterkopf (mit Hut tiefer im Nacken).
- **Am Körper:** Dirndl-Rock in Stufen ab der Taille mit Schürze, Bund und Schleife; langes Haar und Zöpfe den Rücken
  hinunter. Mieder, Westen und Hosenträger malt der Skin (zweite Ebene) – als flache 3D-Teile standen sie vorher
  schief neben dem Körper, sobald die Figur den Kopf drehte.
- Kopf-Teile stecken im Kopf-Platz der Figur (drehen und nicken mit), Körper-Teile in einem Anzeige-Objekt, das auf
  der Figur mitfährt. **Stehende Figuren drehen nur den Kopf** (höchstens 60° zur Seite; der Körper bleibt, wie er
  gebaut ist – darum sitzen Rock und Zöpfe immer). Laufenden dreht das Lobby-Plugin den Körper-Teil so nach, wie
  Minecraft den Körper nachdreht; wer einen Rock trägt (Tag `mm_rock`), geht kleinere Schritte, damit die Beine im
  Rock bleiben. Sitzende Figuren tragen nur die Kopf-Teile.
- Alle Teile benutzen das Modell `minecraft:air` – in Minecraft ist es leer. Unser Paket ersetzt
  `assets/minecraft/items/air.json` und wählt über `custom_model_data` die Teile. **Ohne Paket (oder auf Bedrock)
  sieht man nichts davon, nur die Skins.** Tests in `packages/builder/test/trachten.test.ts`: nichts liegt auf der
  zweiten Ebene des Skins, Hüte umschließen die Hutreihen, nichts steckt in den Armen.

## Was die Modus-Figuren halten

Wie auf den Figuren-Bildern der Webseite (`holds` in `MODES`, `packages/builder/src/lobby/common.ts`; ohne Angabe das
Symbol des Kompass-Menüs): MorniCraft Diamant-Spitzhacke, Duels Eisenschwert, Morni Party Notenblock, Gipfelsturm
Eisen-Spitzhacke als Eispickel, Burgverlies Streitkolben, Bollwerk Schild (links), MorniSMP Truhe, Wolkenkampf Bogen,
Versteckerl Fernrohr, Wintersport Schneeblock, Adlerflug Flügel auf dem Rücken, Angelkönig Angel; Brezn-Stand Brot,
Blumenfrau Mohn.

## Im Netzwerk-Plugin (`LobbyNpcs.java`)

| Tag                               | Bedeutung                                                                                                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mm_npc`                          | Figur der Lobby: nimmt keinen Schaden (nur `/kill` beim Neubau wirkt)                                                                                                                              |
| `mm_mode_<id>`                    | Anklicken (rechts oder links) → Nachricht `play` an den Hub → Modus beitreten bzw. wecken                                                                                                          |
| `mm_mode_label`                   | Schild aus dem Bau – das Plugin ersetzt es durch eigene Schilder mit Live-Zahlen                                                                                                                   |
| `mm_walker`                       | läuft gemütlich in bis zu 8 Blöcken um den Platz herum (nur auf freiem, ebenem Boden)                                                                                                              |
| `mm_rock`                         | trägt einen 3D-Rock: läuft mit kleineren Schritten (1,2 statt 1,8 Blöcke pro Sekunde)                                                                                                              |
| `mm_tint_<rrggbb>`                | Farbe des Modus für den Namen über der Figur (wie auf der Webseite); ohne Tag Gold                                                                                                                 |
| `mm_lobby` + `mm_build_<version>` | alles, was der Lobby-Bau setzt; Wesen aus älteren Bauten entfernt das Plugin, sobald sie geladen werden oder die Version wechselt (Datei `plugins/moinmorni/lobby-world.target`, alle 2 s geprüft) |

Der Hub schickt allen Spielservern `lobby` mit Zustand und Spielerzahl je Modus (`docs/hub-protokoll.md`). Über jeder
Modus-Figur stehen drei Zeilen, jede ein eigenes kleines Schild – unten anfangend 2,38 Blöcke über den Füßen, also
über jedem Hut:

1. **Name** fett in der Farbe des Modus (Größe 0,9 – so groß wie der Name über einem Spieler),
2. **Zustand** (0,75): „● 12 spielen“ / „● 1 spielt“ (grün), „☾ schläft – Klick weckt“ (türkis), „● geschlossen“ (rot),
   „⚒ Wartung“ (gold), „○ bald“ (grau), „☀ Sommerpause“ (gelb),
3. **Hinweis** klein (0,6): „Rechtsklick: Mitspielen“, „Rechtsklick: Dorf anschauen“ oder „Nur auf Einladung“.

Die Schilder drehen sich nur seitlich zum Betrachter (bleiben aufrecht, nichts rutscht ineinander), leuchten immer
(nachts so lesbar wie am Tag) und haben einen leicht dunklen Grund. Je Sprache gibt es eigene Schilder; jeder Spieler
sieht nur die in seiner Sprache (`/sprache` gilt sofort). Gleiche Maße im Baukasten (`LABEL_LAYOUT` in `village.ts`)
für die Stände ohne Modus (Brezn, Blumen). Beim Anklicken: kurzer Klang, ein paar Funken in der Farbe des Modus, die
Figur winkt.

## Leben in der Lobby (`LobbyFeatures.java`, Einstellungen im Panel unter „Lobby“)

Die festen Punkte (Ankunft, Launchpads, Parkour, Rundgang) stehen in `packages/builder/src/lobby/features.ts`; der Hub
schickt sie zusammen mit den Panel-Einstellungen als `lobby-settings` an den Lobby-Server (bei jeder Änderung neu).

- **Ankunft:** am Dorfplatz mit Blick zum Schloss; Begrüßung als Titel (Text im Panel).
- **Ankündigungen:** Leiste oben, wechselt alle n Sekunden (Liste und Takt im Panel).
- **Kompass „Spielmodi“:** Menü mit einem Symbol je Modus (`icon` in `MODES`), Zustand und Spielerzahl; wo gerade
  jemand spielt, glänzt das Symbol, geschlossene Modi sind grau. Klick = beitreten bzw. wecken.
- **Rundgang:** Buch in der Leiste oder `/rundgang`; neue Spieler bekommen ihn einmal automatisch (Schalter im Panel),
  acht Stationen im Zuschauer-Modus, `/rundgang stop` bricht ab.
- **Launchpads:** zwei Smaragd-Platten am Vorplatz schießen schräg zur Mitte die Schlosstreppe hinauf.
- **Parkour:** weiß-blaue Spirale im Nordwesten (Start = Smaragd, Kontrollpunkte = Gold, Ziel = Diamant), Zeitmessung,
  Sturz → letzter Kontrollpunkt, Bestzeiten in `plugins/moinmorni/parkour.yml`, Bestenliste als Schild und `/parkour`.
- **Schutz:** kein Abbauen/Setzen, kein Schaden, kein Hunger, nichts fallen lassen; aus der Welt gefallen → Dorfplatz.
- **Saison-Deko:** Wiesn, Winter, Ostern, Halloween oder keine (`packages/builder/src/lobby/season.ts`, eigenes
  Datenpaket `moinmorni-lobby-season`). Wechsel im Panel setzt die Deko sofort neu. Anzeige-Blöcke tragen den Block
  doppelt (`Name` bis 26.2, `id` ab 26.3 – sonst zeigt 26.3 nur Luft).
- **Dorfleute:** wie viele herumlaufen, stellt das Panel ein.

## Gefängnis (`LobbyJail.java`, Zelle in `packages/builder/src/lobby/jail.ts`)

`/gefaengnis <spieler> [dauer] [grund]` (auch `/jail`, ohne Dauer zehn Minuten) oder im Panel unter Spieler/Strafen.
Die Strafe gilt im ganzen Netzwerk:

- Wer gerade einen Modus spielt, kommt in die Lobby; andere Server lehnt der Hub ab, solange die Strafe läuft.
- Die Zelle liegt im Keller des Rathauses. Das Plugin hält Eingesperrte darin (auch Teleports nach draußen), zeigt
  eine Leiste mit der Restzeit und lässt nur `/msg`, `/r`, `/regeln`, `/hilfe`, `/sprache` zu.
- Chat aus der Zelle lesen nur das Team (Recht „Gefängnis“) und andere Eingesperrte; `/msg` geht nur ans Team.
- Nach Ablauf oder `/frei <spieler>` zurück auf den Dorfplatz mit Kompass und Buch. Wer offline eingesperrt wird,
  landet beim Betreten direkt in der Zelle.
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
4. Version in `plugins/moinmorni/lobby-world.version` – gleicher Plan = nichts zu tun.

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
