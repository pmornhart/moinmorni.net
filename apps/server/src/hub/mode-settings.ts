import { z } from 'zod';
import { MODE_SETTING_AREAS, settingsOf, type SettingArea } from '@moinmorni/shared';
import type { Stores } from '../panel/stores.js';
import type { Body } from './transport.js';

/**
 * Einstellungen der Spielmodi (Panel → Einstellungen → Duels, Morni Party …): Der Hub schickt sie als
 * `mode-settings` an den Server des Modus – mit genau den Werten aus dem Katalog als „Pfad in der config.yml → Wert“.
 * Das Netzwerk-Plugin trägt sie in die config.yml des Modus-Plugins ein und meldet mit `mode-settings-state`, ob der
 * Modus dafür neu starten muss (das macht MoinMorni, sobald gerade niemand spielt).
 */

/** So heißt die Datei, in der sich das Netzwerk-Plugin die Werte merkt (und vor dem nächsten Start einträgt). */
export const MODE_SETTINGS_FILE = 'plugins/moinmorni/mode-settings.json';

/** Was an den Modus-Server geht und in `mode-settings.json` steht. */
export interface ModeSettings {
  readonly mode: string;
  readonly plugin: string;
  readonly values: Readonly<Record<string, unknown>>;
}

/**
 * Pfad → Wert aus den Werten eines Bereichs. An/Aus-Einträge einer Auswahl-Liste (`member`) werden zur Liste der
 * eingeschalteten; sind alle an oder alle aus, bleibt sie leer (= alle im Modus).
 */
export function configValues(
  area: SettingArea,
  values: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const defs = settingsOf(area).filter((d) => d.config);
  const plain = defs
    .filter((d) => !d.config?.member)
    .map((d) => [d.config?.path ?? '', values[d.key]] as const);
  const lists = [...new Set(defs.flatMap((d) => (d.config?.member ? [d.config.path] : [])))].map((path) => {
    const members = defs.filter((d) => d.config?.path === path && d.config.member);
    const chosen = members.filter((d) => values[d.key] === true).map((d) => d.config?.member ?? '');
    const everything = chosen.length === 0 || chosen.length === members.length;
    return [path, everything ? [] : chosen] as const;
  });
  return Object.fromEntries([...plain, ...lists]);
}

export function modeSettingsOf(
  area: SettingArea,
  values: Readonly<Record<string, unknown>>,
): ModeSettings | null {
  if (!area.mode) return null;
  return { mode: area.mode.id, plugin: area.mode.plugin, values: configValues(area, values) };
}

/** Der Einstellungs-Bereich, der zu einem Server im Netzwerk gehört (über den Modus). */
export function modeAreaOfServer(stores: Stores, server: string): SettingArea | undefined {
  const mode = stores.modes().find((m) => m.server === server);
  return mode ? MODE_SETTING_AREAS.find((a) => a.mode?.id === mode.id) : undefined;
}

/** Der Server eines Einstellungs-Bereichs (null = kein Modus-Bereich oder noch kein Server). */
export function serverOfModeArea(stores: Stores, areaId: string): string | null {
  const area = MODE_SETTING_AREAS.find((a) => a.id === areaId);
  return stores.modes().find((m) => m.id === area?.mode?.id)?.server ?? null;
}

/** Nachricht für den Modus-Server mit den aktuellen Werten aus dem Panel. */
export function modeSettingsBody(stores: Stores, area: SettingArea): Body | null {
  const settings = modeSettingsOf(area, stores.settings(area.id));
  return settings ? { t: 'mode-settings', ...settings } : null;
}

const CHANGED_MAX = 10_000;
const MODE_ID_MAX = 32;

/** Antwort des Netzwerk-Plugins: muss der Modus neu starten, damit die Werte gelten? */
export const modeSettingsStateSchema = z.object({
  mode: z.string().min(1).max(MODE_ID_MAX),
  restart: z.boolean(),
  /** Wie viele Werte sich gegenüber dem Start des Modus geändert haben. */
  changed: z.number().int().min(0).max(CHANGED_MAX),
});
