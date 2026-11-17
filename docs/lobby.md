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
  Schlosstreppe – seit dem 17.11. je vier Stände links und rechts der Prachtstraße, 8 Blöcke auseinander (innen
  zuerst: Wolkenkampf, Versteckerl, Wintersport, Adlerflug, Angelkönig, Maibaumklau, Dorfkrimi, Baumeister; innen nicht
  näher als x ±18, dort fliegen die Launchpads). Ist ein Stand frei, verkauft dort die Blumenfrau Blumen und Kräuter,
  sonst steht sie mit einer Blume neben dem westlichen Marktkarren. Marktbogen über der Straße mit
  Wimpeln in den Farben der Stände und Schild „Schlossmarkt“, Wegweiser am Nordausgang des Dorfplatzes (`wegweiser.ts`: Holzpfosten mit Laterne,
  kleine Pfeil-Bretter über Kopfhöhe, die wirklich zum Ziel zeigen – Schloss, Jump and Run, Dorfplatz –, Schrift in
  Schildgröße auf beiden Seiten, Pfeil für den Leser richtig herum; keine Modusnamen), Stützmauer
  mit Hecke und Laternenpfeilern zum Schlossberg (der Hang wächst nicht mehr über den Vorplatz), Lager hinter den
  Ständen (Fässer, Heu, Holzstoß), Laternen und Blumen zwischen den Ständen, Brotzeit-Garnituren davor,
  Marktkarren unter Linden an beiden Enden, Blumenbeete zum Dorfplatz, Leute beim Schauen und Bummeln. Die
  Launchpads und ihre Flugbahn bleiben frei (Test `lobby-market.test.ts`). Zwischen den Ständen steht nichts mehr
  in Kopfhöhe der Figuren (vorher ein schwebendes Brett und ein Topf auf dem Fass): vorne die Laterne, ein Blumenbeet
  im Pflaster, hinten ein Fass; neben den Figuren stehen keine Blumentöpfe auf der Theke (Test).
- **Neue Figuren** bekommen eigene Trachten (`PENDING_CAST` in `cast.ts`: Ballonfahrerin, Dorfgendarm,
  Skilehrerin, Flieger, Fischer, Blumenfrau; 17.11.: Maibaum-Bursch mit Kranzhut, grün-weißer Schärpe, Seil und Axt,
  Kommissar mit Jägerhut, Lodenmantel, Pinsel und Notizbuch, Baumeisterin mit Zimmermannshut, Kluft, Zollstock und
  Ziegel). Bis sie bei MineSkin signiert sind
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
  in der Nähe an, Kinder sind kleiner. So laufen sie (`LobbyNpcs.java`):
  - erst **auf der Stelle zum Ziel drehen** (12° je Tick), dann geradeaus gehen – ein Ruck um 180° ließ Minecraft den
    Körper kurz rückwärts drehen, die Tracht sprang hinterher;
  - **Abstand halten** (0,8 Blöcke) zu anderen Figuren, auch sitzenden, und zu Spielern: wer im Weg steht, wird
    angeschaut, nach drei Versuchen geht es woanders hin; Ziele, an denen schon jemand steht, werden nicht gewählt;
  - nur auf **festem, ebenem Boden** (voller Block oder Trampelpfad, kein Zaun, keine Mauer, keine halbe Stufe, kein
    Wasser) und nicht durch Schilder, Fahnen, Fackeln, Zuckerrohr oder hohe Blumen;
  - der **Platz aus dem Bau** wird an der Figur gemerkt (`moinmorni:home`) – nach Neustart oder Nachladen der Gegend
    schlendern sie weiter um denselben Platz statt mit der Zeit auszuwandern;
  - nur, wo die Welt gerade läuft (am Rand der geladenen Gegend bleiben sie stehen); wer stehen bleibt (Pause, mehr
    Dorfleute als im Panel eingestellt), schaut sich um wie die anderen Figuren;
  - der **Kopf dreht sich weich** (höchstens 9° je Tick, zum Ende langsamer) statt alle fünf Ticks einen Sprung;
  - der **Startplatz** einer laufenden Figur muss im Bau frei sein (Test in
    `packages/builder/test/lobby-market.test.ts` – vorher stand eine in einer Bierbank am Schlossmarkt, eine in der
    Brunnenmauer im Oberdorf, beide kamen nie los).
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
    beiden Paaren **Lichterketten** über den Platz (Ketten zwischen eisernen Knäufen, darunter goldene und blaue
    Laternen im Wechsel – weiß-blau; so hoch, dass der Blick aufs Schlosstor frei bleibt), Laternen am Mittelweg, zwei Linden, helle Brüstung (Dioritmauer), wo der
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
- Obstgarten, Felder, Teich, Alpengipfel ringsum.

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
  kein anderer Boden bleibt unerreichbar, und die gewollten Ausnahmen bleiben zu (`ON_PURPOSE`: die
  Arrestzelle). Kommt etwas Neues dazu, das man nicht erreicht, schlägt er an.
- Echt: `tools/netz-test/treppen-test.cjs` (Test-Spieler, Paper 26.1.2) läuft die Treppen nur mit der Vorwärts-Taste
  hinauf (an einer ganzen Blockstufe bliebe er stehen) und findet mit Pathfinder ohne Launchpads vom Ankunftspunkt
  ins Schloss.

Anfangs fand die Prüfung: Festsaal, Galerie, Bibliothek und Rittersaal unerreichbar (Türen zwei Blöcke über dem Hof),
den Hof nur mit 26 Sprüngen über die Prachtstraße (Rampe aus ganzen Blöcken), die oberste Stufe der alten
Galerie-Treppe fehlte, die Gartenzäune der Dorfstraße liefen durch acht Häuser (hintere Hälfte des Erdgeschosses und
alle oberen Stockwerke unerreichbar), sieben Gärten waren rundum zu. Die Bastei hinter dem Schloss liegt unter dem
Berghang (Hohlraum, kein Platz).

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

| Block                                                             | Möbel                                            |
| ----------------------------------------------------------------- | ------------------------------------------------ |
| Mangroven-Treppe unten, gerade/innen                              | Eckbank (mit Rückwand)                           |
| Mangroven-Treppe sonst                                            | Stuhl                                            |
| Mangroven-Stufe oben / unten                                      | Wirtstisch / Hocker                              |
| Birken-Stufe oben / unten                                         | Biertisch / Bierbank                             |
| braune Kerze (1–4, aus)                                           | 1–4 Steinkrüge                                   |
| Trockenbeton rot / gelb / hellgrau / blau (nur als Block-Anzeige) | runde Christbaumkugel rot / gold / silber / blau |

**Darum in der Lobby keine Mangroven-/Birken-Treppen und -Stufen, keine braunen Kerzen und keinen Trockenbeton für
anderes verbauen** (Test in `winter.test.ts`). Die Kugeln (`packages/builder/src/schmuck.ts`) sind übereinander gestapelte
Scheiben aus je vier gedrehten Quadraten – von allen Seiten rund; ohne Paket sieht man einen schräg gestellten Würfel in
der Farbe.
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
  hinunter; für die Modus-Figuren Umhang, Seilrolle, Schal, Adlerschwingen, Ski und Schulterstücke (unten). Mieder, Westen und Hosenträger malt der Skin (zweite Ebene) – als flache 3D-Teile standen sie vorher
  schief neben dem Körper, sobald die Figur den Kopf drehte.
- Kopf-Teile stecken im Kopf-Platz der Figur (drehen und nicken mit), Körper-Teile in einem Anzeige-Objekt, das auf
  der Figur mitfährt. **Stehende Figuren drehen nur den Kopf** (höchstens 60° zur Seite; der Körper bleibt, wie er
  gebaut ist – darum sitzen Rock und Zöpfe immer). Laufenden dreht das Lobby-Plugin den Körper-Teil so nach, wie
  Minecraft den Körper nachdreht (im Gehen 30 % je Tick in die Laufrichtung, im Stehen erst, wenn der Kopf mehr als 50°
  voraus ist – `bodyAfter`); wer einen Rock trägt (Tag `mm_rock`), geht kleinere Schritte, damit die Beine im
  Rock bleiben. Sitzende Figuren tragen nur die Kopf-Teile.
- Alle Teile benutzen das Modell `minecraft:air` – in Minecraft ist es leer. Unser Paket ersetzt
  `assets/minecraft/items/air.json` und wählt über `custom_model_data` die Teile. **Ohne Paket (oder auf Bedrock)
  sieht man nichts davon, nur die Skins.** Tests in `packages/builder/test/trachten.test.ts`: nichts liegt auf der
  zweiten Ebene des Skins, Hüte umschließen die Hutreihen, nichts steckt in den Armen.

## Die zwölf Modus-Figuren (Kostüme)

Seit dem 17.11. trägt jede Modus-Figur ein **Kostüm, das zu ihrem Spielmodus passt** – nicht mehr alle Lederhose
(Philip: „passender und schöner“). Man erkennt jede am Umriss (eigene Kopfbedeckung, 3D-Teile), an der Hauptfarbe
(= Farbe des Modus) und am Gegenstand. Gezeichnet in `packages/builder/src/figuren.ts` (`MODE_FIGURES`, ein Kostüm
malt über die Grundkleidung – `costume` im Outfit; Dorfleute sind unverändert):

| Figur        | Kostüm                                                                 | 3D im Paket                              | Hält (`holds`, `lobby/common.ts`) |
| ------------ | ---------------------------------------------------------------------- | ---------------------------------------- | --------------------------------- |
| MorniCraft   | Abenteurerin: grüner Reiseumhang mit Spange, Tasche am Riemen, Stiefel | Hut mit breiter Krempe und Feder         | Diamant-Spitzhacke, Elytra        |
| Duels        | Kämpfer: roter Wappenrock mit gekreuzten Schwertern, Kettenhemd        | Stirnband mit Enden, Schulterstücke      | Eisenschwert, Schild rot-weiß     |
| Morni Party  | Spielleiterin: Konfetti-Weste, Fliege, Ringelstrümpfe, Rock            | Federhut (drei bunte Federn), Rock       | Kuchen, Feuerwerksrakete          |
| Gipfelsturm  | Kletterer: Klettergurt, Seil über der Brust, Kletterschuhe             | Helm mit Stirnlampe, Seilrolle           | Eispickel                         |
| Burgverlies  | violetter Umhang, Amulett, Schlüsselbund                               | Kapuze, langer Umhang                    | Laterne                           |
| Bollwerk     | Stadtwache: orangefarbener Wappenrock mit Turm, gesteppte Ärmel        | Eisenhut mit Federbusch                  | Armbrust, Schild mit Mauerwerk    |
| MorniSMP     | Kaufmann: grauer Gehrock, Smaragd-Weste, Uhrkette, Geldbeutel          | Zylinder                                 | Smaragd, Bündel                   |
| Wolkenkampf  | Ballonfahrerin: Lederjacke mit Fellkragen, türkiser Schal              | Melone mit Fliegerbrille, Schal, Zöpfe   | Bogen                             |
| Versteckerl  | Dorfgendarm: Uniform, Schnauzbart, Bandelier, Trillerpfeife            | Pickelhaube                              | Fernrohr                          |
| Wintersport  | Skifahrerin: Rennanzug mit Startnummer, Skischuhe, rote Handschuhe     | Bommelmütze mit Skibrille, Ski am Rücken | Schneeball                        |
| Adlerflug    | Flieger: Overall, weißer Schal, Stulpen, gefaltete Schwingen gemalt    | Fliegerhaube, große Adlerschwingen       | Feder                             |
| Angelkönig   | Fischer: Anglerweste mit Ködern, Karohemd, Wathose                     | Fischerhut mit kleiner Krone             | Angel, Kabeljau                   |
| Maibaumklau  | Maibaum-Bursch: grün-weiße Schärpe, Seil, Weste, Lederhose             | Federhut mit Maibaum-Kranz und Bändern   | Axt, Leine                        |
| Dorfkrimi    | Kommissar: Lodenmantel, rotes Halstuch, Notizbuch in der Brusttasche   | Jägerhut mit Gamsbart                    | Pinsel, Notizbuch                 |
| Baumeister   | Baumeisterin: schwarze Kluft mit Perlmuttknöpfen, Zollstock, Gürtel    | Zimmermannshut mit breiter Krempe        | Ziegel, Schaufel                  |
| Sommerspiele | Ruderin: Ringeltrikot weiß-limette, kurze Hose, Medaille, Zöpfe        | Kreissäge (flacher Strohhut), Paddel     | Paddel (3D), Sonnenblume          |

Ohne Paket und auf Bedrock trägt der Skin alles allein (Hüte, Umhänge, Seile, Schals sind gemalt). Ein Gegenstand mit
Komponenten (z. B. ein Schild mit Muster) steht als `name{komponenten}` in `holds` (`itemSnbtOf` in `village.ts`).
Brezn-Stand Brot, Blumenfrau Mohn. Test: jede Modus-Figur hat eine eigene Kopfbedeckung und ihr Kostüm
(`trachten.test.ts`); Schulterstücke liegen oben auf den Armen, nicht darin.

## Sport-Stand (Wintersport ↔ Sommerspiele, `sportstand.ts`, `LobbySportStand.java`)

Wintersport (1. Dezember – 31. März) und die Sommerspiele (1. April – 30. November) teilen sich am Schlossmarkt einen
Stand (der Platz von Wintersport, x −26). Es steht dort immer, wer gerade offen ist:

- **Winter:** verschneite **Skihütte** – dunkles Fichtenholz, Stufendach mit dickem Schnee und zwei Reihen Überstand,
  Eiszapfen, Laternen darunter, drei Paar Ski am Eckpfosten, Startnummern-Banner (7 und 12), Bank mit Fell, Theke mit
  Schnee und blauem Eis, Ofen; davor die Skifahrerin.
- **Sommer:** helles **Bootshaus am Bergsee** – Birkenholz, Satteldach aus dunkler Eiche bis über den Steg, Ruderboot an
  der Rückwand, gekreuzte Paddel, Rettungsring, Bogenscheibe auf dem Strohballen, gelb-weißer Sonnenschirm,
  Blumenkästen, Wimpelkette, Vereinsfahne; davor die Ruderin.

**Wer dasteht**, entscheidet der Hub (`sportStand` in `@moinmorni/shared`, Feld `sport` der Nachricht `lobby`): Panel →
Lobby → Saison-Deko → „Sport-Stand am Schlossmarkt“ fest auf eine Seite (für Tests und Feste, `/lobby sportstand
auto|winter|sommer`) geht vor; sonst steht da, wer **keine** Saison-Pause meldet (Wintersport `closed` = Sommerpause,
Sommerspiele `closed` = Winterpause); hat nur einer schon einen Server, der; sonst (beide offen – Wintersport steht
in seiner config.yml ab Werk auf „das ganze Jahr“ – oder nichts gemeldet) der Kalender in der Zeitzone des Netzwerks.
Der Hub schickt den Stand stündlich noch einmal (Monatswechsel). Im **Kompass** steht nur der Modus am Stand; der
andere fehlt dort (er ist zu, und eine zweite Sport-Figur gibt es im Dorf nicht) – über `/server` geht er trotzdem.

**Ein Platz im ganzen Netzwerk:** Dieselbe Entscheidung (`hub.sport()`) liefert `/api/status` als `sport` mit. Webseite
(Startseite mit Figuren, Modus-Karten und „Spielmodi offen“, Spielmodi, Hilfe → Spielmodi, Befehle, Bestenlisten,
Nicht-gefunden-Seite) und Discord (Status-Nachricht, Kanal „Spielmodi“ – wechselt der Stand, wird er neu geschrieben)
zeigen nur den Modus, der dran ist (`modesNow`); der andere ist **ersetzt**, nicht „in Pause“. Seine Seite bleibt per
Link erreichbar (Statistiken, Profile, `/befehle/<modus>`, Bestenliste mit `?modus=`) und sagt „Im Winter/Sommer wieder
da – jetzt: …“ mit Link. Das Panel verwaltet weiter beide und zeigt unter Modi, wer gerade am Stand ist. Nur wenn der
Stand im Panel fest auf eine Seite steht, kann dort eine Pause angezeigt werden (Absicht, zum Testen).

**Umbau** (wie die Saisons, `saison-plan.ts`): Im Bauplan steht die Skihütte ohne Figur. Das Saison-Datenpaket hat
`sport/sommerspiele_on` (Bootshaus-Blöcke) und `sport/sommerspiele_off` (genau die alten Blöcke an genau den
geänderten Stellen) sowie `sport/wintersport` und `sport/sommerspiele` (räumt alle Wesen `mm_sport` am Stand ab, setzt
Figur, Schild und Deko mit `mm_sport_<modus>`). Ein Merker-Block unter dem Boden (x −26, y 62, z −33: Packeis =
Skihütte, Sandstein = Bootshaus) sagt, was steht. Das Lobby-Plugin hält die zwei Stücke des Stands geladen, prüft alle
5 Sekunden und bei jeder Hub-Meldung: Merker ≠ gewünscht → Umbau-Funktion (eine Funktion läuft in einem Tick – ein
Absturz trifft nie einen halben Stand); fehlt die Figur des richtigen Modus oder stehen Wesen des anderen herum →
Figur-Funktion. Saison-Deko (Schnee, Girlanden, Herzen, Kürbisse) lässt den Stand in Ruhe (`inSportZone`): beide Looks
bringen ihren eigenen Schmuck mit. Ein Neubau der Lobby setzt die Skihütte; das Plugin baut gleich danach um, wenn
Sommer ist. Bauplan-Prüfung für beide Looks samt Figur und Deko ohne Funde.

## Im Netzwerk-Plugin (`LobbyNpcs.java`)

| Tag                               | Bedeutung                                                                                                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mm_npc`                          | Figur der Lobby: nimmt keinen Schaden (nur `/kill` beim Neubau wirkt)                                                                                                                              |
| `mm_mode_<id>`                    | Anklicken (rechts oder links) → Nachricht `play` an den Hub → Modus beitreten bzw. wecken                                                                                                          |
| `mm_mode_label`                   | Schild aus dem Bau – das Plugin ersetzt es durch eigene Schilder mit Live-Zahlen                                                                                                                   |
| `mm_walker`                       | läuft gemütlich in 2–8 Blöcken um den Platz herum (nur auf freiem, ebenem Boden, mit Abstand zu anderen; Platz in `moinmorni:home`)                                                                |
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

Die festen Punkte (Ankunft, Launchpads, Rundgang) stehen in `packages/builder/src/lobby/features.ts`, die des Jump and
Run in `jumpandrun.ts`; der Hub schickt sie zusammen mit den Panel-Einstellungen als `lobby-settings` an den
Lobby-Server (bei jeder Änderung neu).

- **Ankunft:** am Dorfplatz mit Blick zum Schloss; Begrüßung als Titel (Text im Panel).
- **Ankündigungen:** Leiste oben, wechselt alle n Sekunden (Liste und Takt im Panel).
- **Kompass „Spielmodi“:** Menü mit einem Symbol je Modus (`icon` in `MODES`), Zustand und Spielerzahl; wo gerade
  jemand spielt, glänzt das Symbol, geschlossene Modi sind grau. Klick = beitreten bzw. wecken.
- **Rundgang:** Buch in der Leiste oder `/rundgang`; neue Spieler bekommen ihn einmal automatisch (Schalter im Panel),
  acht Stationen im Zuschauer-Modus, `/rundgang stop` bricht ab.
- **Launchpads:** zwei Smaragd-Platten am Vorplatz schießen schräg zur Mitte die Schlosstreppe hinauf (zu Fuß geht
  es über die Stufen).
- **Jump and Run** (statt der Parkour-Spirale, `LobbyJump.java`, Weg in `JumpCourse.java`): Startplatz im Nordwesten
  neben dem Schlossmarkt (runder Platz, Smaragd in der Mitte, Tafel mit Dach, weiß-blaue Fahnen, Laternen, ein Bogen
  schwebender Blöcke in den Himmel). Auf den Smaragd treten oder `/jnr` (`/jumpandrun`): Man steht hoch über dem Dorf
  (86–106 Blöcke über dem Boden) in einer **eigenen Bahn** (neun Würfel à 32 × 32, die nächste zuerst), vor einem
  ploppt ein Block nach dem anderen auf. Die Blöcke gibt es **nur beim Läufer** (`sendBlockChange`, dazu ein
  unsichtbares Licht darüber und ein Anzeige-Wesen zum Aufploppen, das nur er sieht) – der Server kennt sie nicht,
  niemand sonst sieht sie oder steht darauf. Jeder geschaffte Sprung ein Punkt; gelandet ist, wer nach seinen eigenen
  Bewegungen auf der Fläche des nächsten Blocks steht (lag-sicher, nicht nach der Zeit), alle halbe Sekunde werden die
  Blöcke neu geschickt. Bis „schwerer ab“ (Panel, Standard 10) nur kurze Sprünge ohne Sprinten, danach alle 15 Punkte
  eine Stufe mehr: weiter, höher und tiefer, halbe Stufen, Zaun- und Mauerpfosten, offene Falltüren als Balken, Eis
  (schmilzt 2 s nach der Landung), Schleim zum Hochfedern – jeder Sprung bleibt unter dem, was Minecrafts Bewegung
  (Java und Bedrock) schafft (Tick-für-Tick-Rechnung in `JumpCourseTest`). Fallen beendet den Lauf: zurück am
  Startplatz, Titel mit Punkten. Rekord je Spieler in `plugins/moinmorni/jumpandrun.yml`, **Top 10 auf der Tafel**,
  `/jnr top`, `/jnr stop`; Werte gehen als Statistik „lobby“ an den Hub (`jump_best`, `jump_runs`, `jumps` – Profil
  und Bestenliste der Webseite). `/parkour` leitet um. Ein Teleport, Kreativ-/Zuschauermodus, Gefängnis oder Rundgang
  beenden den Lauf. Die alte `parkour.yml` bleibt liegen (Zeiten passen nicht zu Punkten).
- **Doppelsprung** (`LobbyDoubleJump.java`): in der Luft noch einmal springen gibt einen zweiten Schwung nach vorn und
  oben, mit Funken und Klang (Stärke im Panel 0,5–2). Wer darf, hat „Fliegen erlaubt“; das Einschalten des Fliegens
  fängt das Plugin ab und gibt stattdessen den Schwung, bis zur Landung kein zweiter. Bedrock (Geyser) meldet das
  Fliegen genauso. Nicht im Jump and Run, nicht im Gefängnis, nicht beim Rundgang; Kreativ und Zuschauer bleiben
  unberührt. Die Lobby läuft mit `allow-flight=true` (sonst würde Minecraft Läufer, die auf Blöcken stehen, die nur
  ihr Client kennt, wegen „Schwebens“ hinauswerfen).
- **Schutz:** kein Abbauen/Setzen, kein Schaden, kein Hunger, nichts fallen lassen; aus der Welt gefallen → Dorfplatz.
- **Saison-Deko:** Wiesn, Winter, Ostern, Halloween oder keine (`packages/builder/src/lobby/season.ts`, eigenes
  Datenpaket `moinmorni-lobby-season`). Wechsel im Panel setzt die Deko sofort neu. Anzeige-Blöcke tragen den Block
  doppelt (`Name` bis 26.2, `id` ab 26.3 – sonst zeigt 26.3 nur Luft). **Alle Anzeige-Wesen der Lobby haben keine
  Hitbox** (F3+B zeigt dort keine Rahmen und Pfeile): sie tragen `"Bukkit.invisible":1b` – Minecraft lässt unsichtbare
  Wesen beim Hitbox-Zeichnen aus, zeichnet Anzeigen aber trotzdem (`withoutHitbox` in `lobby/deko.ts`; Schilder des
  Plugins ebenso). **Die Deko sucht sich ihren Platz** (`lobby/halt.ts`) mit den Regeln der Bauplan-Prüfung
  (`pruefung.ts`): Ketten rücken mit beiden Enden an die nächste Wand, Markise oder den Maibaum (sonst hängen sie
  nicht), Eier, Kürbisse und Spinnweben rücken auf den nächsten freien Fleck am Boden bzw. an der Wand, Kugeln an die
  Zweige des Christbaums, Sterne und Schlitten herab, bis sie aufliegen, Schneeplatten, die in einem Turm stecken
  würden, werden geteilt. Lebkuchenherzen und Kürbisse hängen an den Ständen, wo sie heute stehen. Test: jede Saison
  ohne Funde (`test/lobby-pruefung.test.ts`; die Prüfung rechnet gedrehte Anzeigen und Treppen genau, kleine Teile
  dicht beieinander sind ein Modell, keine Kette).
- **Winter-Wunderland** (Saison „Winter“, `lobby/winter.ts`, `christbaum.ts`, `weihnachtsmarkt.ts`,
  `winter-figuren.ts`): Schnee auf allem (Wiesen mit Verwehungen, Schneewall neben Wegen und Plätzen, sechs
  Schneehaufen, dünne begehbare Schicht auf Wegen, dicker Schnee auf den Markisen, Schneeplatten auf den Dächern,
  Eiszapfen, Schneekappen auf Zäunen, Gras an den Bergen wird Schnee, Teich friert zu), kaltes Biom (Plugin
  `LobbyWinter.java` merkt sich jedes Biom und stellt es danach wieder her), klares Wetter mit leichtem Flocken-Gestöber
  (kein echter Schneefall – der macht den Himmel grau). **Statt des Maibaums ein riesiger Christbaum** (acht Stufen,
  gut 36 Blöcke, hängende Zweige, echte Kerzen, 177 Kugeln in Rot, Gold, Silber, Blau, warme Lichterkette direkt auf
  den Zweigen jeder Stufe, großer Stern, Geschenke, unsichtbares Licht ringsum); Dorfleute, die um den Maibaum liefen, gehen ein Stück nach
  außen und laufen nicht unter tief hängende Zweige. **Weihnachtsmarkt:** jede Bude am Dorfmarkt und am Schlossmarkt mit
  Tannengirlande und Lichtern vorne und an den Seiten, Eiszapfen und warmem Licht; Lichterketten im Ring von Bude zu Bude
  und am Schlossmarkt bis zum Marktbogen (Girlande, Stern); Glühwein- und Lebkuchenbude am Eingang von der Ankunft her
  (Kessel überm Feuer, Krüge, Plätzchen, Lebkuchenherzen), dazwischen das **Weihnachtstor** (`weihnachtstor.ts`: dicke
  Tannengirlande vorne und hinten am Balken, vier Bögen mit roten Schleifen, Lichtern, Kugeln und Tannenzapfen,
  Girlande um beide Pfosten gewunden, Holzschild „✦ Weihnachtsmarkt ✦ / Christmas Market“ (hinten „Frohe
  Weihnachten!“) mit Goldrahmen und Stern **oben** auf dem Balken – unter dem Balken lag es genau hinter dem
  Begrüßungstitel –, Kränze, Laternen, zwei Christbäumchen im Kübel; ohne Paket/Bedrock Fichtenlaub mit Schnee auf
  dem Balken, Laternen, Kübel mit Tannenbusch); Krippe auf der Wiese
  westlich (Stall, Maria, Josef, Kind in der Krippe, Ochs, Esel, Schafe, Stern), Eisbahn, großer Pferdeschlitten mit
  Geschenken, Rodel, drei Schneemänner, verschneite Fichten rund ums Dorf; Laternen statt Kürbis an den Marktecken. Die
  Figuren der Spielmodi bleiben, wie sie sind. Jede geänderte Stelle steht mit ihrem alten Block im Plan – jede andere
  Saison stellt sie genau wieder her (auch den Maibaum), Merker `moinmorni:season` in der Welt.
  Probe in einer echten Lobby: `apps/server/scripts/winter-probe.ts <ordner> <rcon> <passwort-datei> an|aus`.
- **Wiesn** (Saison „Wiesn“, `lobby/wiesn.ts`, Baukasten der Saisons `lobby/saison-kit.ts`): **Kettenkarussell um
  den Maibaum** (Herzstück: weiß-blaues Dach in 16 Feldern sechs Blöcke über dem Platz, 16 Sitze an Ketten, Wimpel und
  Lichter am Rand, Licht darunter – darunter läuft man frei durch, der Maibaum bleibt der Mast), **Festzelt-Eingang**
  von der Ankunft her (Giebel mit weiß-blauen Rauten, großes Herz und „Wiesn“, Fahnen, Laternen, Wimpel, Lichter an
  den Giebelkanten, Schild „Servus auf der Wiesn!“), **Riesenrad** auf der Wiese westlich vom Platz (Ring aus Beton auf
  einer Stütze am Einstieg, Bühne mit Laternen, Nabe, Achse, Stützen und Speichen als Anzeigen, acht bunte Gondeln,
  Lichterkranz, Tafel), **Lebkuchenherzen- und Breznbude** am Eingang, Lebkuchenherzen an allen Marktständen,
  weiß-blaue Wimpel und Lichter von Stand zu Stand, Wimpel über Dorfstraße und Handwerkergasse, Fässer am Biergarten.
- **Ostern** (Saison „Ostern“, `lobby/ostern.ts`): **Osterbrunnen um den Maibaum** (Herzstück: runder Brunnen aus
  Kalkstein mit Wasser, acht Bögen aus Tannengrün zur Osterkrone am Maibaum, über 100 bunte Ostereier an den Bögen,
  Bänder an der Krone, Blumentöpfe auf dem Rand; Dorfleute gehen ein Stück zur Seite), **Eierbaum** (blühender
  Kirschbaum voller Eier auf der Westwiese, Tulpenkreis, Tafel), **Osterhase** aus Wolle neben der Ankunft (Korb mit
  Eiern, bemaltes Riesen-Ei, „Frohe Ostern!“), **Frühling überall**: die Laubbäume im Dorf blühen (je Krone
  Kirschblüte, Azaleenblüte oder grün – Kirschblüten lassen von selbst Blüten fallen), Frühlingsblumen in Flecken auf
  den Wiesen (nicht vor Figuren, Launchpads, Jump and Run), **Ostermarkt** am Eingang (Ostereier, Osterlamm &
  Hefezopf, Blütengirlanden), Eingangsbogen mit Blütengirlande und Eiern, Wimpel in Pastell, Eier in den Vorgärten,
  Hasen. Die Eier sind die runden Kugeln aus dem Lobby-Paket (`schmuck.ts`, neue Farben rosa, grün, hellblau, lila,
  orange), in die Höhe gezogen. Biom „Kirschblütenhain“ (helles Grün) und ab und zu eine Blüte in der Luft
  (`LobbyWinter.java`).
- **Halloween** (Saison „Halloween“, `lobby/halloween.ts`): **Riesenkürbis statt Maibaum** (Herzstück: runder
  Kürbis aus Beton und Terrakotta, gut zehn Blöcke hoch, geschnitztes Gesicht nach Süden und Norden, dahinter
  Pilzlicht – nachts leuchtet das Gesicht –, Stiel mit Blatt; der Maibaum kommt mit jeder anderen Saison genau zurück,
  Dorfleute gehen ein Stück zur Seite), **Kürbisfeld** auf der Westwiese (Reihen auf grober Erde, Kürbisse und
  Fratzen, zwei Vogelscheuchen mit Hut), **Schaurige Ruine** neben der Ankunft (zerfallene Kapelle aus bemoostem
  Stein, Turmstumpf, Seelenlaternen, Seelenfeuer, Grabsteine, Gespenster aus Laken, Tafel „Alte Kapelle“),
  **Gruselmarkt** am Eingang (Kürbissuppe, Süßes oder Saures), Eingangsbogen mit leuchtenden Kürbissen und Lichtern in
  Orange, Lila und Grün, Lichter von Stand zu Stand; dazu wie bisher Kürbisse an Türen und Ständen, Spinnweben,
  Wimpel, Grabsteine an der Dorfstraße. Biom „Blasser Garten“ (grauer Himmel, Nebel, fahles Gras) und Asche in der
  Luft (`LobbyWinter.java`).
- **Saisons mit Bauten** (Winter, Wiesn, Ostern, Halloween): jede setzt Blöcke über den Bauplan und merkt sich je Stelle den alten Block
  (`lobby/saison-plan.ts`). Beim Wechsel räumt erst jede andere Saison ihre Blöcke weg (nur, wenn ihr Merker liegt),
  dann wird gespeichert, die Merker kommen weg, wieder gespeichert, dann setzt die neue Saison Merker, Blöcke und Deko
  (`seasonStepsFor` in `datapack.ts`) – auch nach einem Absturz mitten im Wechsel passt der Merker zu den Blöcken.
  Die Bauplan-Prüfung prüft bei diesen Saisons auch ihre Blöcke (über dem Bauplan, `checkLobbyCanvas`). Probe in einer
  echten Lobby für jede Saison: `apps/server/scripts/saison-probe.ts <ordner> <rcon> <passwort-datei> <saison> an|aus`
  (Stellen, die gerade eine andere Saison belegt, zählen bei „aus“ nicht).
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
- **Gedämpft** im Jump and Run, beim Rundgang und im Gefängnis (Panel: „Gedämpft“, Vorgabe 40 %): Eine laufende
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

## Bauplan-Prüfung

`packages/builder/src/pruefung.ts` prüft den fertigen Bauplan (`checkLobby()` in `lobby/pruefen.ts`) samt aller
Saison-Dekos und meldet jeden Fund mit Koordinaten:

- Laternen, Fackeln, Schilder, Banner, Falltüren, Blumentöpfe, Teppiche, Kerzen, Glocken, Knöpfe ohne Halt;
- Ketten, die oben bzw. an einem Ende im Leeren enden; Zäune, Mauern und Scheiben mit Armen ins Leere;
- Türen ohne Boden, Rahmen oder Sturz oder in eine Wand hinein;
- Bäume, die in Häuser, Dächer, Stände oder Wege wachsen, auf Pflaster stehen oder auf Kopfhöhe über den Weg hängen;
  zwei Bauten an derselben Stelle (an der Herkunft, die `Canvas.tagged` vergibt);
- auslaufendes Wasser, Pflanzen ohne passenden Boden, schwebende Blöcke (ausgenommen der bunte Bogen über dem Start des Jump and Run);
- **offen liegende Erde** dort, wo man herumläuft – nur, was man auch sieht: unter freiem Himmel oder wenige Schritte
  davon (Hohlräume im Berg, die das Gelände lässt, zählen nicht);
- Figuren in Wänden oder in der Luft, Saison-Deko in Blöcken oder ohne Halt, Wimpel- und Lichterketten ohne Ende.

Auf der Kommandozeile: `npx tsx tools/lobby-entwuerfe/src/pruefen.ts [art …]`. Der Test
`packages/builder/test/lobby-pruefung.test.ts` schlägt bei jedem neuen Fund an; Funde in Teilen, an denen gerade
andere arbeiten (Schloss, Saison-Deko), stehen in `test/pruefung-offen.ts` – ist einer behoben, die
Zeile dort löschen. Die Lobby baut ohne Block-Updates; `fitConnections` (`verbindungen.ts`) verbindet darum Zäune,
Mauern und Scheiben wie beim Setzen von Hand.

## Die Lobby baut sich selbst

Beim Einrichten (und nach jedem Update, wenn sich der Bauplan geändert hat) baut MoinMorni die Welt auf dem
Lobby-Server auf – ohne RCON von außen, nur über den Motor (`apps/server/src/lobby/world.ts`):

1. server.properties der Lobby: Abenteuermodus, friedlich, kein PvP, kein Nether, Fliegen erlaubt (Doppelsprung, Jump
   and Run), kein Texturpaket (die Skins sind signiert).
2. Bauplan als Datenpaket nach `world/datapacks/moinmorni-lobby/` (`lobbyPack()` in
   `packages/builder/src/lobby/datapack.ts`, ~83 Funktionen à 3000 Befehle).
3. `minecraft:reload`, Welt-Stücke in kleinen Portionen festhalten (`forceload`, 4×4 Stücke pro Befehl – alles auf
   einmal ließ den Server minutenlang hängen), warten bis geladen, `clean` (alte Wesen weg), Bau-Funktionen
   nacheinander, `finish` (Spielregeln, Ankunftspunkt, Weltgrenze, Reste älterer Bauten), `save-all flush` (stürzt
   der Server gleich danach ab, steht sonst eine halb gebaute Welt mit neuer Version da), Stücke loslassen,
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

## Wartungs-Lobby (Server „wartung“)

Die **zweite Wahl nach der Lobby**: Wer gerade nicht in die Lobby kann (Neustart, Update, Absturz, sie startet
noch) oder während der Wartung des Netzwerks nicht hinein darf, wartet hier – nie geht es weiter auf Bau-Server oder
Spielmodi. Gibt es auch sie nicht, trennt der Proxy freundlich („Die Lobby startet gerade neu – gleich wieder da“).

- **Server:** das Netzwerk legt ihn selbst an (`network/provision.ts`, auch bei bestehenden Installationen beim
  Start), 768 MB (`WARTUNG_MEMORY_MB` in `packages/shared/src/wartung.ts`), flache Welt (`WARTUNG_GENERATOR`),
  Sichtweite 6, immer an, schläft nie (kein Modus) – im Ruhezustand wie alle (Arbeitsspeicher im Leerlauf frei).
  Höchstzahl wie bei allen Spielservern hinter dem Proxy `SERVER_MAX_PLAYERS` (siehe unten).
- **Bau:** wie die Lobby per Datenpaket mit Bau-Version (`packages/builder/src/wartung/`, Namensraum
  `moinmorni_wartung`, Selbstbau über `lobby/wartung.ts` → `lobby/world.ts`): kleine Alm im Talkessel mit Bergen
  ringsum; vorne der **Aushang** „⚒ Wartungsarbeiten – Gleich geht’s weiter! / Maintenance – back in a moment!“ mit
  dem Text aus dem Panel darunter (Tag `mm_wartung_text`), dahinter die offene **Bergwerkstatt** (Werkbänke, Amboss,
  Holzstapel, Schmied und Schreiner), rechts eine **Baustelle** mit Gerüst, Kran mit Last und gelb-schwarzer
  Absperrung, daneben **Brotzeit** am Lagerfeuer, links der **Sprung-Parcours** über Heuballen, Fässer und Stämme
  hinauf zur Glocke (Startplatte leicht, Zielplatte schwer – Zeit in der Aktionsleiste, Bestzeit je Spieler in
  `plugins/moinmorni/wartung-parkour.yml`). Aussichtspunkte für Bilder: `WARTUNG_VIEWS`.
- **Plugin** (`paper/WartungLobby.java`, nur auf dem Server „wartung“): Ankunft am Aushang, Schutz (nichts abbauen,
  kein Schaden, kein Hunger, Truhen und Werkbänke sind Deko – nur die Glocke läutet), Kompass „Zurück in die Lobby“,
  Leiste oben mit dem Stand: „Die Lobby startet gerade neu …“, „Wartung bis ca. 22:30 – Grund“, „Die Lobby ist
  wieder da – zurück in 7 s“, ohne Hub „Das Netzwerk startet gerade neu“. Chat geht wie überall.
- **Hub** (`hub/wartung.ts`): sagt dem Proxy beim Ankommen und nach jedem Rauswurf, wohin (Lobby oder
  Wartungs-Lobby), schickt der Wartungs-Lobby ihren Stand (`wartung`) und holt alle Wartenden nach 10 s Countdown
  zurück, sobald die Lobby wieder am Hub hängt bzw. die Wartung aus ist. Wer freiwillig dort ist, bleibt.
- **Wartung des Netzwerks:** Spieler ohne „Kommt immer rein“ kommen beim Einschalten (und beim Anmelden) in die
  Wartungs-Lobby und können von dort nirgends hin (`/lobby`, Kompass und `/server` sagen warum); das Team kommt
  überall hin. Ist die Wartungs-Lobby aus, werden sie wie früher beim Anmelden abgewiesen.
- **Panel → Einstellungen → Netzwerk → Wartung** (auch im Spiel): `/wartung an|aus`, `/wartung text <text>` (Text und
  Grund), `/wartung bis <uhrzeit>` (z. B. 22:30, `weg` löscht sie – steht dann in Leiste, Aushang und Serverliste),
  `/wartung lobby an|aus` (Wartungs-Lobby), `/wartung zurueck an|aus` (automatisch zurück).
- **Proxy** (`velocity/VelocityPlugin.java`, `velocity/Fallback.java`): wählt den ersten Server und das Ziel nach
  einem Rauswurf selbst (`PlayerChooseInitialServerEvent`, `KickedFromServerEvent`) – die `try`-Liste in der
  velocity.toml (vom Motor: alle Mitglieder) spielt keine Rolle mehr. Ohne Hub: Lobby, dann Wartungs-Lobby (bei
  Wartung nur sie); antwortet die Lobby wieder, holt der Proxy die Wartenden selbst zurück.
- **Neustart nach einem Update** (`network/restart-now.ts`): Die Wartungs-Lobby startet nie als Erste neu – erst die
  Spielmodi und der Bau-Server, dann sie, zuletzt die Lobby. Vor ihrem Neustart kommt, wer darf, in die Lobby; wen die
  Wartung festhält, der muss kurz raus („in etwa einer Minute wieder rein“). Startet danach die Lobby allein neu,
  warten ihre Spieler in der Wartungs-Lobby und kommen von selbst zurück, sobald sie wieder läuft (vorher flogen sie
  raus). Startet auch der Proxy neu (neues Netzwerk-Plugin), starten Lobby, Wartungs-Lobby und Proxy zusammen mit einem
  Countdown für alle – jeder verbindet nur einmal neu.

### Höchstzahl hinter dem Proxy

Minecraft legt neue Server mit `max-players=20` an – dann hätte die Lobby den 21. Spieler abgewiesen, obwohl das
Netzwerk 200 hineinlässt. Nach Zahl weisen jetzt nur Proxy und Hub ab (Panel → Netzwerk → „Spieler höchstens“, bis
`NETWORK_PLAYERS_MAX` = 2000, Team und VIP auch bei voll; je Modus dessen Höchstzahl). Jeder Spielserver dahinter hat
`max-players` = `SERVER_MAX_PLAYERS` (10 000, `packages/shared/src/settings.ts`): Lobby, Wartungs-Lobby und Bau-Server
in ihren eigenen server.properties (`lobbyProperties`, `wartungProperties`, `buildProperties`), die Spielmodi über
`network/player-cap.ts` – neue vor dem ersten Start, bestehende einmal (danach steht es drin; ein höherer Wert
bleibt). Der Server übernimmt es beim nächsten Neustart (nach einem Update gleich, sonst sobald niemand drauf ist).

Echt geprüft: `tools/netz-test/wartung-test.cjs` (Velocity 4.3.1, Lobby, Wartungs-Lobby, Bau-Server, Test-Hub mit
Steuerung).
