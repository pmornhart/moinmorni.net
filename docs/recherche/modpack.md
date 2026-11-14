# Modpack – Recherche (14.11.2026)

Ziel: **Minecraft 26.3**, Fabric Loader 0.20.1, Java 25. Versionen live von api.modrinth.com geprüft.

## Kern (an)
| Mod | Version (26.3) | Lizenz | Zweck |
|---|---|---|---|
| fabric-api | 0.166.2+26.3 | Apache-2.0 | Grundlage |
| simple-voice-chat | fabric-2.6.27+26.3 (beta) | ARR (Modrinth-Verweis ok) | Voice-Chat |
| sodium | mc26.3-0.9.2 (fest, Iris braucht genau diese) | PolyForm Shield | Leistung |
| lithium | mc26.3-0.26.3 | LGPL-3.0 | Leistung |
| ferrite-core | 9.0.0 | MIT | Speicher |
| immediatelyfast | 1.17.1+26.3 | LGPL-3.0 | Leistung |
| entityculling | 1.12.1 | tr7zw Protective | Leistung |
| dynamic-fps | 3.11.10 | – | Leistung im Hintergrund |
| modmenu, controlling, appleskin, mouse-tweaks | 21.0.1 / 26.3.4 / 3.0.10 / 2.31 | – | Komfort |
| iris | 1.11.7+26.3 | LGPL-3.0 | Shader (aus, vorgewählt) |
| continuity, lambdynamiclights | 3.0.1 / 4.13.0 | – | Optik |
| entity-model-features, entitytexturefeatures + Fresh Animations | 3.3.12 / 7.2.7 / 1.11.2 | Fresh Animations nur per Modrinth-Verweis | Optik |
| 3dskinlayers, not-enough-animations, fallingleaves | 1.11.4 / 1.12.7 / 2.0.8 | – | Optik |
| worldedit-cui | 26.3+01 | EPL-2.0 | Bauen (Server: WorldEdit 7.4.6 oder FAWE 2.16.2) |
| yosbr | 26.3 | – | Standard-Einstellungen nur beim ersten Start (servers.dat, options.txt, iris.properties) |

## Optional (aus)
- Shader: **Complementary Reimagined** r5.9.3 (Lizenz erlaubt Modpacks über Modrinth, unverändert; bei „an“ Nennung nötig), MakeUp Ultra Fast (schwache PCs), Photon. **Nicht:** BSL, Bliss, Solas (keine Weitergabe erlaubt).
- Bauen: Litematica + MaLiLib, MiniHUD (Server-Overlays brauchen Fabric-Servux → auf Paper nur teilweise), Tweakeroo (nur fürs Bauteam), **Axiom** (braucht Axiom-Paper-Plugin genau für 26.3 **und** für Mehrspieler eine kommerzielle Lizenz oder Whitelist-Anfrage im Axiom-Discord).
- ReplayMod (Media), Sound Physics Remastered (CPU), AmbientSounds (stört Minispiel-Töne), Visuality, Particle Rain.
- Bewusst **nicht**: Minimap mit Radar (unfair), Jade (verrät Verstecke), Inventory Profiles Next, Freecam.
- Zoomify: leichter PvP-Vorteil → Entscheidung Philip.

## mrpack-Technik
- Datei-Eintrag `env.client`: required / optional / unsupported. Prism fragt optionale beim Installieren ab (Standard: aus), Modrinth-App installiert sie an → „aus“ zusätzlich über Pfad `*.jar.disabled`.
- Overrides werden bei Prism bei jedem Update erneut angewandt → Startwerte über **yosbr** (`overrides/config/yosbr/…`).
- `servers.dat` = unkomprimiertes NBT `{servers:[{name, ip, hidden}]}`.

## Modrinth
- Veröffentlichung lohnt sich (Updates, kostenlos, Ein-Klick-Beitritt). Projekt einmal von Hand anlegen (Prüfung), danach per API (`POST /v2/version`, PAT mit VERSION_CREATE).
- Seit 03/2026 „Server Projects“: Server-Eintrag mit verknüpftem Modpack.
- Ein von der Webseite geladenes `.mrpack` bekommt keine Updates → Webseite verweist auf die Modrinth-Installation.

## Automatisch aktuell
- **packwiz** im Ordner `modpack/`; täglicher GitHub-Action-Lauf: `packwiz update --all`, Release-Typ prüfen, Sodium/Iris als Paar, Export + Nachbearbeitung (`.disabled`), Test mit **mc-runtime-test** (Fabric 26.3, virtueller Bildschirm), dann PR → nach Philips Go Upload zu Modrinth + GitHub-Release.
