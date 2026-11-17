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

Die festen Punkte (Ankunft, Launchpads, Rundgang) stehen in `packages/builder/src/lobby/features.ts`, die des Jump and
Run in `jumpandrun.ts`; der Hub schickt sie zusammen mit den Panel-Einstellungen als `lobby-settings` an den
Lobby-Server (bei jeder Änderung neu).

- **Ankunft:** am Dorfplatz mit Blick zum Schloss; Begrüßung als Titel (Text im Panel).
- **Ankündigungen:** Leiste oben, wechselt alle n Sekunden (Liste und Takt im Panel).
- **Kompass „Spielmodi“:** Menü mit einem Symbol je Modus (`icon` in `MODES`), Zustand und Spielerzahl; wo gerade
  jemand spielt, glänzt das Symbol, geschlossene Modi sind grau. Klick = beitreten bzw. wecken.
- **Rundgang:** Buch in der Leiste oder `/rundgang`; neue Spieler bekommen ihn einmal automatisch (Schalter im Panel),
  acht Stationen im Zuschauer-Modus, `/rundgang stop` bricht ab.
- **Launchpads:** zwei Smaragd-Platten am Vorplatz schießen schräg zur Mitte die Schlosstreppe hinauf.
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

## Die Lobby baut sich selbst

Beim Einrichten (und nach jedem Update, wenn sich der Bauplan geändert hat) baut MoinMorni die Welt auf dem
Lobby-Server auf – ohne RCON von außen, nur über den Motor (`apps/server/src/lobby/world.ts`):

1. server.properties der Lobby: Abenteuermodus, friedlich, kein PvP, kein Nether, Fliegen erlaubt (Doppelsprung, Jump
   and Run), kein Texturpaket (die Skins sind signiert).
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
