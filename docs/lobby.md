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
  Launchpads und ihre Flugbahn bleiben frei (Test `lobby-market.test.ts`).
- **Neue Figuren** bekommen eigene Trachten (`PENDING_CAST` in `cast.ts`: Ballonfahrerin, Dorfgendarm,
  Skilehrerin, Flieger, Fischer, Blumenfrau). Bis sie bei MineSkin signiert sind
  (`tsx tools/lobby-entwuerfe/src/sign-skins.ts`), trägt jede die Tracht einer passenden bestehenden Figur
  (`STAND_IN`); danach von selbst die eigene – Skin und 3D-Tracht passen immer zusammen.
- **Dorfstraße** nach Süden (heller Sandweg, Laternen zwischen den Häusern): Bäckerei, Krämerladen, Apotheke,
  Wohnhäuser mit Gärten und Obstbaum, Kapelle (begehbar: Turmtür, Vorhalle, Bänke, Altar); am Platz Rathaus und
  Gäste-Info.
- **Handwerkergasse** nach Westen (zwischen den Ständen hindurch): Schmiede, Trachten, Schreinerei, Wohnhäuser,
  Vorgärten, **Dorfbrunnen** am Ende.
- **Oberdorf** im Nordosten: kleiner Platz mit Dorfbrunnen und Dorflinde (Rundbank), vier Häuser.
- **Wirtshaus „Zum Morni“** mit Wirt hinterm Tresen, Stammtisch und Gästen; davor der **Biergarten** mit Ausschank
  (Wirt, Laternen unter der Markise), Kastanien in den Gängen zwischen den Tischen, Laternen an Ketten unter den
  Kronen, Laternenmasten an den Ecken und Gäste an den Tischen.
- Alle Häuser sind **begehbar und eingerichtet** (Küche, Eckbank, Kachelofen, Schlafzimmer, Leiter nach oben; Läden
  mit Theke und Verkäufer). Einrichtung als Daten in `packages/builder/src/village.ts`.
- **Leute im Dorf**: Figuren mit Tag `mm_walker` schlendern um ihren Platz herum, stehende Figuren schauen Spieler
  in der Nähe an, Kinder sind kleiner.
- Schloss auf dem Hügel, Prachtstraße (am Hangfuß auf einem gemauerten Damm), Obstgarten, Felder, Teich,
  Alpengipfel ringsum.
- **Saftig und hell** (16.11., Philip: „Wir sind in Bayern für schön saftigen Boden bekannt“): Die Lobby setzt beim
  Bau das Biom **Wald** (`LOBBY_BIOME` in `datapack.ts`, `fillbiome` über die ganze Fläche) – Gras, Blätter und Wiesen
  werden saftig grün, egal welches Biom die Welt dort erzeugt hatte (bei Philip „bewaldete Tafelberge“ mit fahlem,
  bräunlichem Gras). Helles Pflaster (Steinziegel, polierter Andesit, Stein, etwas Diorit statt Moos-Kopfstein),
  Sandwege auf Dorfstraße, Gasse und Feldwegen, am Schlossberg Laubbäume und Birken statt nur Fichten und dichtes
  Gras mit Blumen über den Erdstufen, Dächer an der Dorfstraße im Wechsel hell und dunkel.

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

## Dorfbrunnen (Ressourcenpaket)

Am Ende der Handwerkergasse und im Oberdorf steht je ein **Dorfbrunnen** (`packages/builder/src/dorfbrunnen.ts`) – so
fein gearbeitet wie der Prunkbrunnen im Schlosshof (`brunnen.ts`), aber kleiner und ländlicher: achteckiger Trog aus
hellem Kalkstein mit Steinziegel-Sockel, glatter Abdeckung und Zierfeldern, in der Mitte die Brunnensäule mit
Kupferband, Kapitell und goldenem Zapfen, vier Wasserspeier aus Kupfer mit Wasserstrahlen ins Becken, Geranien auf dem
Rand, Blumenbeete an den Ecken. Wie beim Prunkbrunnen sind es Item-Anzeigen mit dem leeren Modell `minecraft:air` (Teile `dorf_*` im
Möbel-Paket), Spritzer und Plätschern kommen vom Lobby-Plugin.

**Ohne Paket und auf Bedrock** steht ein schlichter Brunnen aus Blöcken da: niedrige Tuffziegel-Mauer als Becken mit
echtem Wasser, Säule aus Mauer-Pfosten mit einem Endstab als Fontäne, dieselben Blumen. Tuffziegel-Mauern und
Endstäbe gibt es in der Lobby nur an den Brunnen – das Paket blendet sie aus.

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

## Bauplan-Prüfung

`packages/builder/src/pruefung.ts` prüft den fertigen Bauplan (`checkLobby()` in `lobby/pruefen.ts`) samt aller
Saison-Dekos und meldet jeden Fund mit Koordinaten:

- Laternen, Fackeln, Schilder, Banner, Falltüren, Blumentöpfe, Teppiche, Kerzen, Glocken, Knöpfe ohne Halt;
- Ketten, die oben bzw. an einem Ende im Leeren enden; Zäune, Mauern und Scheiben mit Armen ins Leere;
- Türen ohne Boden, Rahmen oder Sturz oder in eine Wand hinein;
- Bäume, die in Häuser, Dächer, Stände oder Wege wachsen, auf Pflaster stehen oder auf Kopfhöhe über den Weg hängen;
  zwei Bauten an derselben Stelle (an der Herkunft, die `Canvas.tagged` vergibt);
- auslaufendes Wasser, Pflanzen ohne passenden Boden, schwebende Blöcke (Parkour ausgenommen);
- **offen liegende Erde** dort, wo man herumläuft – nur, was man auch sieht: unter freiem Himmel oder wenige Schritte
  davon (Hohlräume im Berg, die das Gelände lässt, zählen nicht);
- Figuren in Wänden oder in der Luft, Saison-Deko in Blöcken oder ohne Halt, Wimpel- und Lichterketten ohne Ende.

Auf der Kommandozeile: `npx tsx tools/lobby-entwuerfe/src/pruefen.ts [art …]`. Der Test
`packages/builder/test/lobby-pruefung.test.ts` schlägt bei jedem neuen Fund an; Funde in Teilen, an denen gerade
andere arbeiten (Schloss, Schlossmarkt, Saison-Deko), stehen in `test/pruefung-offen.ts` – ist einer behoben, die
Zeile dort löschen. Die Lobby baut ohne Block-Updates; `fitConnections` (`verbindungen.ts`) verbindet darum Zäune,
Mauern und Scheiben wie beim Setzen von Hand.

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
4. Version in `plugins/moinmorni/lobby-world.version` – gleicher Plan = nichts zu tun. Die Bau-Version ist die Prüfsumme
   des Datenpakets: Jede Änderung am Bauplan zählt sie von selbst weiter, die Lobby baut sich beim nächsten Start neu.

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
