# Modpack

Das MoinMorni-Modpack macht Minecraft (Java **26.3**, Mod-Lader **Fabric**) schöner und flüssiger, bringt Zoom und
den Sprachchat des Netzwerks mit und – für das Bauteam – Bau-Werkzeuge. Es erscheint auf **Modrinth** im
Modrinth-Format (`.mrpack`). Der Eintrag **MoinMorni → moinmorni.net** steht nach der Installation schon in der
Serverliste.

Das Pack enthält **keine Mod-Dateien**, sondern nur eine Liste mit Download-Adressen bei Modrinth und Prüfsummen
(damit niemand unterwegs eine Datei austauschen kann). Jede Mod behält ihre eigene Lizenz.

## Was drin ist

Die genaue Liste mit Version und Lizenz steht nach jedem Bau in `tools/modpack/dist/mods.md` (und auf Modrinth als
Änderungstext). Stand 14.11.2026: 29 Mods, davon 6 zum Abwählen.

| Bereich                      | Mods                                                                                                                                                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grundlage                    | Fabric API, Mod Menu (Knopf „Mods“ im Hauptmenü)                                                                                                                                                                                                   |
| Flüssiger spielen            | Sodium, Lithium, FerriteCore, ImmediatelyFast, Entity Culling, Dynamic FPS                                                                                                                                                                         |
| Schöner                      | Continuity (Glas ohne Ränder), 3D Skin Layers, Not Enough Animations, Wavey Capes, LambDynamicLights (Fackel in der Hand leuchtet), Particle Rain; zum Abwählen: Iris (Shader), Entity Model Features (für Texturpakete mit eigenen Tier-Modellen) |
| Spielhilfen                  | Zoomify (Zoom), Simple Voice Chat (Sprachchat des Netzwerks), AppleSkin, Jade (zeigt, was man anschaut)                                                                                                                                            |
| Bau-Werkzeuge (zum Abwählen) | Litematica, MiniHUD, WorldEdit, WorldEdit CUI                                                                                                                                                                                                      |

Dazu kommen automatisch die Bausteine, die einzelne Mods brauchen (z. B. MaLiLib für Litematica, YACL und Fabric
Language Kotlin für Zoomify).

**Bewusst nicht dabei:** keine Minimap und keine Weltkarte (Philips Wunsch), kein Axiom (erst nach Philips
Freigabe). Das Bau-Skript bricht ab, wenn so etwas – auch als Abhängigkeit einer anderen Mod – hineinrutschen
würde. ModernFix gibt es (noch) nicht für Fabric 26.3; Krypton und Debugify bringen im Spiel kaum etwas.

**Zoom:** Taste **C** gedrückt halten, mit dem Mausrad weiter hineinzoomen. Andere Taste: Optionen → Steuerung →
Tastenbelegung → Zoomify.

## Bauen

```bash
pnpm install
pnpm --filter @moinmorni/modpack build
```

Das Skript fragt Modrinth nach der neuesten Version jeder Mod aus `tools/modpack/src/mods.ts`, die es für Fabric und
Minecraft 26.3 gibt. Eine stabile Version hat Vorrang vor einer neueren Test-Version (Beta); gibt es nur Test-
Versionen (z. B. Simple Voice Chat), nimmt es die neueste davon. Pflicht-Abhängigkeiten holt es selbst dazu; verlangt
eine Mod eine ganz bestimmte Version einer anderen (Iris → Sodium), bekommt sie genau diese. Der Fabric-Lader ist
die neueste stabile Version von <https://meta.fabricmc.net>. Ein Schlüssel ist dafür nicht nötig.

Ergebnis in `tools/modpack/dist/` (nicht im Repo):

- `MoinMorni-26.3-<Jahr>.<Monat>.<Tag>.mrpack` – das Pack
- `mods.md` – Übersicht mit Version, Lizenz und Zweck jeder Mod, dazu Hinweise (z. B. übersprungene Abhängigkeiten)
- `release.json` – Angaben fürs Hochladen

Zweiter Bau am selben Tag: eigene Versionsnummer angeben, z. B. `… build --version 26.3-2026.11.14b`.

**Mod dazunehmen oder entfernen:** Eintrag in `tools/modpack/src/mods.ts` (Name aus der Modrinth-Adresse, Zweck in
einfachen Worten, Pflicht oder optional, nur im Spiel oder auch auf Servern), dann neu bauen. Tests:
`pnpm --filter @moinmorni/modpack test`.

## Auf Modrinth veröffentlichen (Philip)

Einmal vorbereiten:

1. Auf <https://modrinth.com> anmelden → **Create a project** → Typ **Modpack**, Name „MoinMorni“, Adresse
   (Slug) `moinmorni`. Beschreibung, Bild und Links (Webseite, Discord) eintragen.
2. Einstellungen → **Personal access tokens** → neuen Schlüssel anlegen mit den Rechten **Read projects**,
   **Read versions** und **Create versions**. Den Schlüssel nur im Terminal benutzen – nie in eine Datei im Repo
   oder in einen Chat.

Jede neue Version:

```bash
pnpm --filter @moinmorni/modpack build
pnpm --filter @moinmorni/modpack publish:modrinth --trocken   # zeigt nur, was hochgeladen würde
MODRINTH_TOKEN=mrp_… pnpm --filter @moinmorni/modpack publish:modrinth
```

- Ohne `MODRINTH_TOKEN` lädt das Skript nichts hoch und erklärt, was fehlt.
- Anderes Projekt: `MODRINTH_PROJECT=<slug>`; als Testversion: `--type beta`.
- Gibt es die Versionsnummer dort schon, bricht es ab (neu bauen mit `--version …b`).
- Modrinth liest die enthaltenen Mods selbst aus dem Pack. Beim ersten Mal muss das Projekt noch von Modrinth
  geprüft werden (**Submit for review**), danach erscheinen neue Versionen sofort.

## Installieren (Spieler)

**Modrinth App** (<https://modrinth.com/app>): oben suchen nach „MoinMorni“ → **Installieren** → **Spielen**.

**Prism Launcher** (<https://prismlauncher.org>): **Instanz hinzufügen** → links **Modrinth** → „MoinMorni“ suchen →
**OK**. Alternativ eine heruntergeladene `.mrpack`-Datei über **Importieren** öffnen.

Optionale Mods (Shader, Bau-Werkzeuge, Tier-Modelle) werden je nach Launcher mit installiert oder abgefragt; in der
Mod-Liste des Profils lassen sie sich jederzeit an- und ausschalten.

Danach im Spiel: **Mehrspieler** → **MoinMorni** → **Beitreten**.

- **Shader:** Optionen → Videoeinstellungen → **Shader-Pakete**. Shader-Pakete selbst sind nicht im Pack (eigene
  Lizenzen) – auf Modrinth gibt es viele unter „Shaders“. Sie brauchen einen kräftigen Rechner.
- **Sprachchat:** Beim Betreten verbindet sich Simple Voice Chat von selbst. Taste **V** öffnet die Einstellungen
  (Mikrofon testen), **G** die Gruppen.
- **Serverliste:** Der Eintrag „MoinMorni“ kommt aus dem Pack. Manche Launcher legen die Liste bei einem Update des
  Packs neu an; eigene Einträge können dann fehlen.
- Bedrock (Handy, Konsole) braucht kein Modpack – dort geht es ohne Mods auf moinmorni.net.
