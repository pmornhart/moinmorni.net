/**
 * Kleidung im Angelkönig-Paket: je Stück ein Modell für den Gegenstand (`moinmorni:item/kleidung/<stück>`) – Hüte als
 * 3D-Modell, das auch auf dem Kopf sitzt, die übrigen Stücke als kleines 3D-Bild aus ihrer Körper-Textur –, dazu für
 * Weste, Jacke, Hosen und Stiefel ein Ausrüstungs-Aussehen `moinmorni:kleidung/<stück>` (Muster am Körper).
 * Angelkönig schreibt den Namen `moinmorni:kleidung/<stück>` als `custom_model_data` in jedes Stück; ohne Paket bleibt
 * es der gewöhnliche Minecraft-Gegenstand. Welches Aussehen am Körper gilt, entscheidet Angelkönig je Spieler (Hut ohne
 * Rüstungs-Aussehen, damit Minecraft das 3D-Modell zeigt; sonst das eigene Aussehen) – nur wer das Paket geladen hat,
 * bekommt es.
 */
import type { ZipEntry } from '../png.js';
import { HAT_BUILDERS } from './huete.js';
import { garment, koerperModell } from './ruestung.js';

export interface ClothingPackEntry {
  /** Kennung des Stücks (`Cosmetic.id()` in Angelkönig). */
  readonly id: string;
  /** Minecraft-Gegenstand ohne Paket. */
  readonly base: string;
}

const NS = 'moinmorni';
const JSON_INDENT = 2;
/** Ticks je Bild der Krone (Lichtstreif). */
const CROWN_FRAMETIME = 3;
const json = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, JSON_INDENT)}\n`);

/** Name im Gegenstand (`custom_model_data`) und des Ausrüstungs-Aussehens, gleich wie `ANGEL_CLOTHING_PREFIX`. */
export const clothingPackName = (id: string): string => `${NS}:kleidung/${id}`;

/** Ist das Stück ein Hut (3D-Modell auf dem Kopf)? */
export const isHat = (id: string): boolean => Boolean(HAT_BUILDERS[id]);

/** Fall im `select` der Gegenstands-Definition. */
export function clothingCase(id: string): { when: string; model: unknown } {
  return {
    when: clothingPackName(id),
    model: { type: 'minecraft:model', model: `${NS}:item/kleidung/${id}` },
  };
}

/** Alle Dateien der Kleidung (ohne die Gegenstands-Definitionen, die baut das Paket gemeinsam mit den Fischen). */
export function clothingFiles(entries: readonly ClothingPackEntry[]): ZipEntry[] {
  return entries.flatMap(({ id }) => {
    const hat = HAT_BUILDERS[id];
    if (hat) {
      const built = hat();
      const texture = `assets/${NS}/textures/item/kleidung/${id}.png`;
      return [
        { name: `assets/${NS}/models/item/kleidung/${id}.json`, data: json(built.json) },
        { name: texture, data: built.texture.png() },
        ...(built.frames > 1
          ? [{ name: `${texture}.mcmeta`, data: json({ animation: { frametime: CROWN_FRAMETIME } }) }]
          : []),
      ];
    }
    const g = garment(id);
    const png = g.texture.png();
    return [
      { name: `assets/${NS}/models/item/kleidung/${id}.json`, data: json(koerperModell(g).json) },
      { name: `assets/${NS}/textures/item/kleidung/${id}_koerper.png`, data: png },
      {
        name: `assets/${NS}/equipment/kleidung/${id}.json`,
        data: json({ layers: { [g.layer]: [{ texture: `${NS}:kleidung/${id}` }] } }),
      },
      { name: `assets/${NS}/textures/entity/equipment/${g.layer}/kleidung/${id}.png`, data: png },
    ];
  });
}
