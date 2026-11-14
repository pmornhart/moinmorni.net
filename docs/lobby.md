# Lobby – „Dorfplatz am Schlossberg“

Philip hat Entwurf A gewählt (14.11.) und ausbauen lassen: **keine Portale, sondern Menschen zum Anklicken**, Leben im
Dorf, begehbare eingerichtete Häuser, Biergarten mit Wirt und Gästen.

## Was drin ist

- **Dorfplatz** mit Maibaum, Vorplatz mit vier Marktständen, Westplatz mit drei Marktständen – je Spielmodus ein Stand
  mit Markise in der Farbe des Modus und einer Figur in der Mitte. Über ihrem Kopf: Name, Spielerzahl bzw. Zustand,
  „Klick: Mitspielen“.
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

## Figuren und Skins

Die Figuren sind Mannequins (Minecraft 1.21.9+) mit **eigenen Pixel-Skins** – gezeichnet in
`packages/builder/src/skins.ts`, die Leute stehen in `cast.ts` (27 Stück: Modus-Figuren, Wirt, Kellnerinnen, Bäcker,
Schmied, Bürgermeister, Gäste, Kinder). Das Texturpaket (`castPack()`, `tsx tools/lobby-entwuerfe/src/pack.ts
<ziel.zip> [vorschau.png]`) legt sie unter `assets/moinmorni/textures/npc/<id>.png` ab; die Figur nutzt sie mit
`profile:{texture:'moinmorni:npc/<id>'}`.

> Ohne Texturpaket zeigt Minecraft dort ein Fehlerbild, Bedrock-Spieler sehen die Skins über Geyser nicht. Für den
> Betrieb: Paket in der Lobby verpflichtend anbieten und die Skins zusätzlich als signierte Skin-Daten hinterlegen
> (dann sehen alle sie) – kommt mit dem Lobby-Server.

## Im Netzwerk-Plugin (`LobbyNpcs.java`)

| Tag | Bedeutung |
| --- | --- |
| `mm_npc` | Figur der Lobby: nimmt keinen Schaden |
| `mm_mode_<id>` | Anklicken (rechts oder links) → Nachricht `play` an den Hub → Modus beitreten bzw. wecken |
| `mm_mode_label` | Schild aus dem Bau – das Plugin ersetzt es durch eigene Schilder mit Live-Zahlen |
| `mm_walker` | läuft gemütlich in bis zu 8 Blöcken um den Platz herum (nur auf freiem, ebenem Boden) |

Der Hub schickt allen Spielservern `lobby` mit Zustand und Spielerzahl je Modus (`docs/hub-protokoll.md`). Das Plugin
hält je Figur zwei Schilder (Deutsch/Englisch); jeder Spieler sieht nur das in seiner Sprache (`/sprache` gilt sofort).

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
