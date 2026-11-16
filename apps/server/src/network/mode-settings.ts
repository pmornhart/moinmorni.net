import type { FastifyBaseLogger } from 'fastify';
import { MODE_SETTING_AREAS } from '@moinmorni/shared';
import type { Hub } from '../hub/index.js';
import { MODE_SETTINGS_FILE, modeSettingsOf, serverOfModeArea } from '../hub/mode-settings.js';
import type { EventBus } from '../lib/events.js';
import type { MotorClient } from '../motor/client.js';
import { readServerFile, writeServerFile } from '../motor/files.js';
import type { Stores } from '../panel/stores.js';
import type { RestartQueue } from './restart.js';

/**
 * Einstellungen der Spielmodi, die nicht über den Hub gehen können:
 * - Muss ein Modus für neue Einstellungen neu starten (meldet sein Netzwerk-Plugin), kommt er in die Warteschlange
 *   „Neustart, sobald niemand drauf ist“ – stellt jemand den alten Wert wieder ein, wieder heraus.
 * - Schläft ein Modus (oder ist er gestoppt, oder gerade neu angelegt), schreibt MoinMorni die Werte über den Motor
 *   nach plugins/moinmorni/mode-settings.json. Das Netzwerk-Plugin trägt sie beim nächsten Start in die config.yml
 *   ein, bevor der Modus sie liest – so gelten sie gleich beim Aufwachen, ohne weiteren Neustart.
 */

export interface ModeSettingsSync {
  /** Werte für alle Modi eintragen, deren Server gerade nicht mit dem Hub verbunden ist. */
  readonly syncFiles: () => Promise<void>;
  /** Neu angelegte Server vor dem ersten Start mit ihren Werten versorgen. */
  readonly prepare: (
    servers: ReadonlyArray<{ readonly serverId: string; readonly member: string }>,
  ) => Promise<void>;
}

export interface ModeSettingsSyncOptions {
  readonly motor: Pick<MotorClient, 'request'>;
  readonly hub: Pick<Hub, 'connectedServers'>;
  readonly stores: Stores;
  readonly events: EventBus;
  readonly restarts: Pick<RestartQueue, 'add' | 'remove'>;
  /** Server-ID im Motor zu einem Namen im Netzwerk. */
  readonly idOf: (member: string) => Promise<string | undefined>;
  readonly log: FastifyBaseLogger;
}

const JSON_INDENT = 2;

/** Gleicher Inhalt? (Das Plugin schreibt die Datei anders eingerückt.) */
function sameJson(text: string | null, value: unknown): boolean {
  if (text === null) return false;
  try {
    return JSON.stringify(JSON.parse(text)) === JSON.stringify(value);
  } catch {
    return false;
  }
}

export function createModeSettingsSync(o: ModeSettingsSyncOptions): ModeSettingsSync {
  const { motor, hub, stores, events, restarts, log } = o;

  const queue = async (server: string, needed: boolean): Promise<void> => {
    try {
      const serverId = await o.idOf(server);
      if (!serverId) return;
      if (needed) restarts.add([{ serverId, member: server }]);
      else restarts.remove(serverId);
    } catch (err) {
      log.warn({ err, server }, 'Spielmodus: Server im Motor nicht gefunden');
    }
  };
  events.on('mode.restart', ({ server, needed }) => void queue(server, needed));

  /** Werte eines Modus-Servers in seine mode-settings.json (nur wenn sie sich geändert haben). */
  const write = async (member: string, serverId: string): Promise<boolean> => {
    const area = MODE_SETTING_AREAS.find((a) => serverOfModeArea(stores, a.id) === member);
    const settings = area ? modeSettingsOf(area, stores.settings(area.id)) : null;
    if (!settings) return false;
    if (sameJson(await readServerFile(motor, serverId, MODE_SETTINGS_FILE), settings)) return false;
    await writeServerFile(
      motor,
      serverId,
      MODE_SETTINGS_FILE,
      `${JSON.stringify(settings, null, JSON_INDENT)}\n`,
    );
    log.info({ server: member }, 'Spielmodus: Einstellungen für den nächsten Start eingetragen');
    return true;
  };
  /** Läuft der Server gerade, trägt sein Plugin die Werte selbst ein (über den Hub). Fehler nur ins Protokoll. */
  const writeIfAsleep = async (member: string): Promise<void> => {
    try {
      if (hub.connectedServers().includes(member)) return;
      const serverId = await o.idOf(member);
      if (serverId) await write(member, serverId);
    } catch (err) {
      log.warn({ err, server: member }, 'Spielmodus: Einstellungen ließen sich nicht eintragen');
    }
  };

  events.on('settings.changed', ({ area }) => {
    const member = serverOfModeArea(stores, area);
    if (member) void writeIfAsleep(member);
  });

  return {
    syncFiles: async () => {
      const members = MODE_SETTING_AREAS.flatMap((a) => serverOfModeArea(stores, a.id) ?? []);
      await Promise.all(members.map(writeIfAsleep));
    },
    prepare: async (servers) => {
      await Promise.all(servers.map((s) => write(s.member, s.serverId)));
    },
  };
}
