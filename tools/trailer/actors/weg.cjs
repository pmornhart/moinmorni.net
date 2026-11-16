// Einfache Wegsuche für Darsteller (A* auf dem Blockgitter): gehen, eine Stufe hoch springen, bis zu drei Blöcke
// hinunter. Kein Schwimmen, kein Klettern, keine Blöcke abbauen oder setzen – für Wege in Bauten und auf Inseln reicht
// das. Danach wird der Weg geglättet (gerade Stücke, wo man gerade gehen kann).
'use strict';
const { Vec3 } = require('./mods.cjs').need('vec3');

const LIQUID = new Set(['water', 'lava', 'bubble_column']);
const AVOID = new Set(['fire', 'soul_fire', 'campfire', 'soul_campfire', 'magma_block', 'cactus', 'sweet_berry_bush',
  'powder_snow', 'cobweb', 'wither_rose']);

function makeWorld(bot) {
  const cache = new Map();
  const get = (x, y, z) => {
    const k = `${x},${y},${z}`;
    if (!cache.has(k)) cache.set(k, bot.blockAt(new Vec3(x, y, z), false));
    return cache.get(k);
  };
  const passable = (x, y, z) => {
    const b = get(x, y, z);
    if (!b) return false;
    if (LIQUID.has(b.name) || AVOID.has(b.name)) return false;
    return b.boundingBox === 'empty';
  };
  const solid = (x, y, z) => {
    const b = get(x, y, z);
    if (!b || LIQUID.has(b.name) || AVOID.has(b.name)) return false;
    if (b.boundingBox !== 'block') return false;
    // Zäune, Mauern, Gitter: 1,5 hoch bzw. schmal – darauf geht niemand
    return !/_fence$|_wall$|^iron_bars$|_pane$|_fence_gate$/.test(b.name);
  };
  const stand = (x, y, z) => solid(x, y - 1, z) && passable(x, y, z) && passable(x, y + 1, z);
  return { get, passable, solid, stand };
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Weg von start nach goal (Vec3, Füße) – Liste von Blockmitten (Vec3) oder null. */
function findPath(bot, start, goal, { maxNodes = 6000, maxDrop = 3 } = {}) {
  const w = makeWorld(bot);
  const s = start.floored();
  const g = goal.floored();
  // Start darf leicht in der Luft oder auf einer Stufe stehen: nächsten Stand suchen
  for (const dy of [0, 1, -1, -2]) {
    if (w.stand(s.x, s.y + dy, s.z)) { s.y += dy; break; }
  }
  const key = (x, y, z) => `${x},${y},${z}`;
  const h = (x, y, z) => {
    const dx = Math.abs(x - g.x), dz = Math.abs(z - g.z);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz) + Math.abs(y - g.y) * 0.5;
  };
  const open = [{ x: s.x, y: s.y, z: s.z, g: 0, f: h(s.x, s.y, s.z), parent: null }];
  const best = new Map([[key(s.x, s.y, s.z), 0]]);
  let n = 0, found = null, closest = open[0];
  while (open.length && n++ < maxNodes) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (h(cur.x, cur.y, cur.z) < h(closest.x, closest.y, closest.z)) closest = cur;
    if (cur.x === g.x && cur.z === g.z && Math.abs(cur.y - g.y) <= 1) { found = cur; break; }
    for (const [dx, dz] of DIRS) {
      const nx = cur.x + dx, nz = cur.z + dz;
      const diag = dx !== 0 && dz !== 0;
      if (diag && !(w.passable(cur.x + dx, cur.y, cur.z) && w.passable(cur.x + dx, cur.y + 1, cur.z) &&
          w.passable(cur.x, cur.y, cur.z + dz) && w.passable(cur.x, cur.y + 1, cur.z + dz))) continue;
      const cand = [];
      if (w.stand(nx, cur.y, nz)) cand.push([cur.y, 0]);
      else if (!diag && w.stand(nx, cur.y + 1, nz) && w.passable(cur.x, cur.y + 2, cur.z)) cand.push([cur.y + 1, 0.8]);
      else if (w.passable(nx, cur.y, nz) && w.passable(nx, cur.y + 1, nz)) {
        for (let d = 1; d <= maxDrop; d++) {
          if (w.stand(nx, cur.y - d, nz)) { cand.push([cur.y - d, 0.3 * d]); break; }
          if (!w.passable(nx, cur.y - d, nz)) break;
        }
      }
      for (const [ny, extra] of cand) {
        const cost = cur.g + (diag ? Math.SQRT2 : 1) + extra;
        const k = key(nx, ny, nz);
        if (best.has(k) && best.get(k) <= cost) continue;
        best.set(k, cost);
        open.push({ x: nx, y: ny, z: nz, g: cost, f: cost + h(nx, ny, nz), parent: cur });
      }
    }
  }
  const end = found || (h(closest.x, closest.y, closest.z) < 2.5 ? closest : null);
  if (!end) return null;
  const pts = [];
  for (let c = end; c; c = c.parent) pts.push(new Vec3(c.x + 0.5, c.y, c.z + 0.5));
  pts.reverse();
  return smooth(w, pts);
}

/** Geradeaus begehbar? (gleiche Höhe, mit halber Körperbreite Abstand zu Wänden, Boden überall) */
function clearLine(w, a, b) {
  if (a.y !== b.y) return false;
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.ceil(len / 0.25);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    for (const [ox, oz] of [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) {
      if (!w.stand(Math.floor(x + ox), a.y, Math.floor(z + oz))) return false;
    }
  }
  return true;
}

function smooth(w, pts) {
  if (pts.length <= 2) return pts.slice(1).length ? pts.slice(1) : pts;
  const out = [];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !clearLine(w, pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

module.exports = { findPath, makeWorld, clearLine };
