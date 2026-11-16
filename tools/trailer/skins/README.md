# Darsteller-Skins

18 eigene Skins (Pixelkunst, zweite Ebene für Jacken, Kapuzen, Mützen, Brillen, Kopfhörer) – je einer für die neun
Standard-Skins von Minecraft in breit (`wide`, Arme 4 Bildpunkte) und schmal (`slim`, Arme 3). Ein lokales
Ressourcenpaket ersetzt im **Aufnahme-Client** die Standard-Skins; Darsteller ohne Konto (offline) tragen dann unsere
Figuren. Nichts wird hochgeladen oder signiert, kein Server-Paket. Keine Vorlagen, keine Kopien bestehender Skins,
Figuren oder Marken.

| Datei | Inhalt |
|---|---|
| `skins.py` | die 18 Figuren (feste Startwerte → jeder Lauf gibt dieselben Bilder), Ausgabe, Paket |
| `teile.py` | Bausteine: Licht, Haut, Gesicht (Karten 8×8), Haare (Strähnen, Wirbel, Glanzband), Kleidung, Zubehör |
| `kit.py` | Skin-Format (Flächen, Raum-Koordinaten je Bildpunkt), Farbrampen mit Farbverschiebung, festes Rauschen |
| `vorschau.py` | schnelle 3D-Vorschau ohne Minecraft (nur zum Zeichnen) |
| `namen.py` | Namen → Skin (Offline-UUID), schreibt `../actors/actors.json` |
| `png/` | die fertigen Skins (eigene Kunst) · `figuren.json` Liste mit Beschreibung |

## So wählt Minecraft den Skin (Client 26.3 geprüft)

`net.minecraft.client.resources.DefaultPlayerSkin.get(uuid)` = `DEFAULT_SKINS[Math.floorMod(uuid.hashCode(), 18)]`,
Reihenfolge: slim alex, ari, efe, kai, makena, noor, steve, sunny, zuri, dann wide in derselben Reihenfolge; Textur
`minecraft:textures/entity/player/{slim,wide}/<name>.png`. Ohne Skin-Daten im Profil (offline) nimmt `SkinManager`
diesen Standard-Skin – für andere Spieler und für den eigenen Spieler (Arm in der Ich-Sicht) gleich. Offline-UUID =
`UUID.nameUUIDFromBytes("OfflinePlayer:" + Name)`; groß/klein zählt.

## Bauen und benutzen

```bash
python3 skins.py png                    # png/ + figuren.json
python3 skins.py paket                  # → /home/user/mm-cache/trailer/skins-paket/morni-darsteller(.zip)
python3 skins.py vorschau /tmp/v.png    # 3D-Vorschau aller 18 (oder: … vorschau /tmp/v.png lena toni)
python3 namen.py                        # actors.json neu (prüft: jeder Name trifft genau seine Figur)
```

Aufnahme-Client mit Paket starten (Ordner in `resourcepacks/` der Instanz, Eintrag in options.txt):

```bash
INST=/home/user/mm-cache/client/instances/26.3-<Name>
mkdir -p $INST/resourcepacks && cp -r /home/user/mm-cache/trailer/skins-paket/morni-darsteller $INST/resourcepacks/
MM_CACHE=/home/user/mm-cache/client MM_CLIENT_XMX=1536M MM_JAVA=… python3 ../../mc-client/launch.py --version 26.3 \
  --name <Name> --server 127.0.0.1:<port> --display :<n> --option 'resourcePacks:["vanilla","file/morni-darsteller"]'
```

Im Client-Protokoll steht dann `Reloading ResourceManager: vanilla, …, file/morni-darsteller`. Prüfbild aller 18
(vorne/hinten, mit Namensschild): `node ../actors/aufstellung.cjs …` (siehe dort). Bilder nur lokal.

## Neue Figur?

Eine Funktion mit `@figur(modell, textur, id, seed, beschreibung)` in `skins.py` – Gesicht als 8×8-Karte
(`face_map`, Zeichen siehe `face_pal`), Haare mit `hair(…)`, Kleidung mit `top_wear`/`pants`/`shoes`, zweite Ebene mit
`overlay_top`/`overlay_legs`/`beanie`/`cap`/`headphones`/`glasses`. Jeder der 18 Plätze ist genau einmal belegt; wer
eine Figur ersetzt, behält ihren Platz (Modell + Textur) und sucht in `namen.py` einen passenden Namen.
