/**
 * Für den echten Test des Sport-Stands (`tools/netz-test/sportstand-test.cjs`): welche Blöcke Skihütte und Bootshaus
 * an den Stellen haben, die der Umbau ändert – als JSON.
 *   tsx scripts/sport-stand-plan.ts > sport-plan.json
 */
import { buildLobby, SPORT_STAND, sportPlan } from '@moinmorni/builder';

const { canvas } = buildLobby();
const plan = sportPlan(canvas);
const list = (c: typeof plan.blocks): Array<[number, number, number, string]> =>
  c.find(() => true).map(([x, y, z, b]) => [x, y, z, b]);
console.log(
  JSON.stringify({ stand: SPORT_STAND, sommerspiele: list(plan.blocks), wintersport: list(plan.restore) }),
);
