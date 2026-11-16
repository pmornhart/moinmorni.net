import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { players, teamMembers } from '../db/schema.js';
import { normalUuid } from '../hub/players.js';

/** Steht über einer News, wenn das Team-Konto kein Minecraft-Konto verbunden hat (oder nie im Netzwerk war). */
export const TEAM_AUTHOR = 'MoinMorni-Team';

/**
 * Wer eine News geschrieben hat, so wie Besucher (Webseite, Discord) es sehen: der Minecraft-Name des Team-Kontos – den
 * sieht im Spiel ohnehin jeder –, sonst „MoinMorni-Team“. Nie der Anmeldename fürs Panel: der ist die halbe
 * Anmeldung und gehört nicht auf eine öffentliche Seite.
 */
export function publicAuthor(db: Db, username: string): string {
  const member = db.select().from(teamMembers).where(eq(teamMembers.username, username)).get();
  const uuid = member?.minecraftUuid ? normalUuid(member.minecraftUuid) : null;
  const player = uuid ? db.select().from(players).where(eq(players.uuid, uuid)).get() : undefined;
  return player?.name ?? TEAM_AUTHOR;
}
