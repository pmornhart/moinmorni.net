import { isNotNull } from 'drizzle-orm';
import { alwaysIn, type Role } from '@moinmorni/shared';
import type { Api } from '../app.js';
import type { Db } from '../db/index.js';
import { players, teamMembers } from '../db/schema.js';
import { normalUuid, type PlayerService } from '../hub/players.js';
import type { PanelAuth } from '../panel/auth.js';
import type { ApplicationService, WhitelistEntry } from './applications.js';

/**
 * Das Team steht von selbst mit auf der Whitelist: alle, deren Rang „Kommt immer rein“ hat (`alwaysIn` – dieselbe
 * Regel, nach der der Hub sie hineinlässt). Ein Rang kommt von zwei Stellen: eigener Rang (Panel → Spieler oder /rang)
 * und Team-Konto mit verbundenem Minecraft-Konto; es zählt der höhere, genau wie im Spiel (`roleOf`).
 */

export interface TeamOnList {
  readonly uuid: string;
  /** Minecraft-Name; war die Person noch nie im Netzwerk, der Name ihres Panel-Kontos. */
  readonly name: string;
  readonly seen: boolean;
  readonly role: Pick<Role, 'id' | 'name' | 'symbol' | 'colour' | 'position'>;
  /** Steht die Person zusätzlich von Hand auf der Whitelist: Kennung dieses Eintrags (sonst null). */
  readonly listed: number | null;
}

type Ranks = Pick<PlayerService, 'get' | 'roleOf'>;

/** Wer über den Rang immer hineinkommt – nach Rang (höchster zuerst), dann nach Name. */
export function teamOnWhitelist(db: Db, ranks: Ranks, entries: readonly WhitelistEntry[]): TeamOnList[] {
  const ranked = db
    .select({ uuid: players.uuid })
    .from(players)
    .where(isNotNull(players.roleId))
    .all()
    .map((p) => normalUuid(p.uuid));
  const accounts = new Map(
    db
      .select()
      .from(teamMembers)
      .where(isNotNull(teamMembers.minecraftUuid))
      .all()
      .map((m) => [normalUuid(m.minecraftUuid ?? ''), m.username] as const),
  );
  const people = [...new Set([...ranked, ...accounts.keys()])].filter((uuid) => uuid !== '');
  return people
    .flatMap((uuid): TeamOnList[] => {
      const role = ranks.roleOf(uuid);
      if (!alwaysIn(role)) return [];
      const row = ranks.get(uuid);
      const entry = entries.find((e) =>
        e.uuid ? normalUuid(e.uuid) === uuid : row !== undefined && e.name === row.name.toLowerCase(),
      );
      return [
        {
          uuid,
          name: row?.name ?? accounts.get(uuid) ?? uuid,
          seen: row !== undefined,
          role: {
            id: role.id,
            name: role.name,
            symbol: role.symbol,
            colour: role.colour,
            position: role.position,
          },
          listed: entry?.id ?? null,
        },
      ];
    })
    .sort((a, b) => a.role.position - b.role.position || a.name.localeCompare(b.name));
}

/** Panel → Einstellungen → MorniCraft → Whitelist: das Team, das von selbst hineinkommt (Bereich „Spieler“). */
export function registerWhitelistTeamRoute(
  app: Api,
  auth: PanelAuth,
  db: Db,
  ranks: Ranks,
  applications: Pick<ApplicationService, 'whitelist'>,
): void {
  app.get('/api/panel/whitelist/team', async (request) => {
    await auth.require(request, 'players');
    return teamOnWhitelist(db, ranks, applications.whitelist());
  });
}
