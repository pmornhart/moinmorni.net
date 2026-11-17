// Darsteller für Trailer: Test-Spieler (mineflayer), die wie echte Spieler wirken – mit echter Physik im Takt der
// Zeitlupe, natürlichem Kopf, Wegen, Kampf und Handlungen. Kurzanleitung: README.md in diesem Ordner.
//
//   const { Ensemble } = require('./darsteller.cjs');
//   const e = new Ensemble({ host: '127.0.0.1', port: 26110 });
//   const mila = await e.add('Mila_Sonne');            // Name aus actors.json → eigener Skin im Aufnahme-Client
//   await mila.geh([1000.5, 104, 3.5]);                 // Weg suchen und hingehen (Zeiten in Spielzeit)
//   await mila.kaempfe('Toni_Wandert', { dauer: 6 });
'use strict';
const zeit = require('./zeit.cjs');   // zuerst: stellt die Uhr von mineflayer auf Spielzeit
const { need } = require('./mods.cjs');
const mineflayer = need('mineflayer');
const { Vec3 } = need('vec3');
const { findPath, makeWorld, clearLine } = require('./weg.cjs');

const TAU = Math.PI * 2;
const DT = 0.05;
const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const v3 = (p) => (p instanceof Vec3 ? p : Array.isArray(p) ? new Vec3(p[0], p[1], p[2]) : new Vec3(p.x, p.y, p.z));
const FACES = { down: 0, up: 1, north: 2, south: 3, west: 4, east: 5 };
const DIR = { nord: [0, -1], sued: [0, 1], 'süd': [0, 1], ost: [1, 0], west: [-1, 0],
  north: [0, -1], south: [0, 1], east: [1, 0] };

function seeded(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 3432918353), h = (h << 13) | (h >>> 19);
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Blickrichtung (mineflayer: yaw 0 = Norden, Bogenmaß; pitch > 0 = nach oben) von a nach b. */
function angles(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

class Abbruch extends Error {}

class Darsteller {
  constructor(ensemble, name, opts = {}) {
    this.e = ensemble;
    this.name = name;
    this.rand = seeded(name);
    this.opts = opts;
    this.task = null;          // laufende Aufgabe {id, cancelled}
    this.move = null;          // Bewegung (Weg, Kampf …) – wird in jedem Tick ausgewertet
    this.look = null;          // feste Blickrichtung/-ziel (Vec3 | Spielername | {yaw,pitch} | 'kamera')
    this.gaze = null;          // Ziel der Blicksprünge im Leerlauf
    this.gazeUntil = 0;
    this.head = null;          // {yaw, pitch, vy, vp}
    this.stiff = 45;           // Federhärte des Kopfes (höher = schneller)
    this.mood = { kamera: 0.12, leute: 0.6, umher: 0.28 };  // Gewichte der Blicksprünge
    this.idle = true;          // Blicksprünge im Leerlauf
    this.phase = [this.rand() * TAU, this.rand() * TAU, this.rand() * TAU, this.rand() * TAU];
    this.ticks = 0;
    this.listeners = [];
  }

  // ---------------------------------------------------------------- Verbindung
  connect() {
    const { host, port, version } = this.e;
    const bot = mineflayer.createBot({ host, port, username: this.name, version, auth: 'offline',
      hideErrors: true, checkTimeoutInterval: 120000, viewDistance: 'short', mainHand: this.opts.hand || 'right' });
    this.bot = bot;
    zeit.follow(bot);
    bot._client.on('add_resource_pack', (p) => bot._client.write('resource_pack_receive', { uuid: p.uuid, result: 1 }));
    bot.on('kicked', (r) => this.log('KICK', JSON.stringify(r).slice(0, 200)));
    bot.on('error', (e) => this.log('FEHLER', e.message));
    bot.on('end', () => { this.log('WEG'); this.bot = null; if (!this.e.closing) setTimeout(() => this.connect(), 5000); });
    if (process.env.MM_ACTORS_CHAT) bot.on('messagestr', (m) => this.log('CHAT', m));
    bot.on('physicsTick', () => { try { this.tick(); } catch (err) { this.log('FEHLER tick', err.stack); } });
    bot.on('windowOpen', (w) => this.log('MENU', JSON.stringify(w.title).slice(0, 80)));
    this.ready = new Promise((resolve) => bot.once('spawn', () => {
      this.head = { yaw: bot.entity.yaw, pitch: bot.entity.pitch, vy: 0, vp: 0 };
      this.log('ONLINE');
      resolve(this);
    }));
    return this.ready;
  }

  log(...a) { console.log(a[0], this.name, ...a.slice(1)); }

  get pos() { return this.bot.entity.position; }
  get eye() { return this.bot.entity.position.offset(0, this.bot.entity.eyeHeight || 1.62, 0); }

  // ---------------------------------------------------------------- Aufgaben
  /** Neue Aufgabe beginnen (die laufende hört auf). fn(token) – token.check() wirft bei Abbruch. */
  async run(label, fn) {
    if (this.task) this.task.cancelled = true;
    this.stop();
    const token = { cancelled: false, label, check() { if (this.cancelled) throw new Abbruch(label); } };
    this.task = token;
    try {
      const r = await fn(token);
      if (this.task === token) { this.task = null; this.log('FERTIG', label); }
      return r;
    } catch (err) {
      if (!(err instanceof Abbruch)) this.log('FEHLER', label, err.message);
      return null;
    }
  }

  async wait(s, token) {
    const end = zeit.now() + s * 1000;
    while (zeit.now() < end) {
      if (token) token.check();
      await zeit.wait(Math.min(100, end - zeit.now()));
    }
  }

  async until(cond, s, token) {
    const end = zeit.now() + s * 1000;
    while (zeit.now() < end) {
      if (token) token.check();
      if (cond()) return true;
      await zeit.wait(50);
    }
    return false;
  }

  /** Bewegung beenden (wartende Aufgabe läuft weiter) und Steuerung loslassen. */
  stop() {
    const m = this.move;
    this.move = null;
    this.release();
    if (m && m.resolve) m.resolve();
  }

  /** Nur die Steuerung loslassen. */
  release() {
    if (!this.bot) return;
    for (const c of ['forward', 'back', 'left', 'right', 'jump', 'sprint']) this.bot.setControlState(c, false);
  }

  // ---------------------------------------------------------------- jeder Tick (Spielzeit)
  tick() {
    const bot = this.bot;
    if (!bot || !bot.entity || !this.head) return;
    this.ticks++;
    const m = this.move;
    if (m) {
      const done = m.tick(this);
      if (done) { if (this.move === m) this.move = null; if (m.resolve) m.resolve(); }
    }
    this.headTick();
  }

  /** Wohin der Kopf will: {yaw, pitch} oder null (bleibt). */
  wantLook() {
    const t = this.move && this.move.look ? this.move.look(this) : null;
    if (t) return t;
    if (this.look) return this.lookAtTarget(this.look);
    if (!this.idle) return null;
    const now = zeit.now();
    if (!this.gaze || now > this.gazeUntil) this.pickGaze(now);
    return this.lookAtTarget(this.gaze);
  }

  lookAtTarget(t) {
    if (!t) return null;
    if (typeof t === 'object' && 'yaw' in t) return t;
    const p = this.targetPos(t);
    return p ? angles(this.eye, p) : null;
  }

  /** Position eines Blickziels: Vec3/Array, Spielername (Augen), 'kamera'. */
  targetPos(t) {
    if (t === 'kamera') return this.e.camera ? v3(this.e.camera) : null;
    if (typeof t === 'string') {
      const ent = this.bot.players[t] && this.bot.players[t].entity;
      return ent ? ent.position.offset(0, 1.5, 0) : null;
    }
    if (t && t.offset) return t;
    if (t && t.rel) {  // relative Blickrichtung (Grad) zur jetzigen
      return null;
    }
    return t ? v3(t) : null;
  }

  pickGaze(now) {
    const r = this.rand();
    const others = Object.values(this.bot.players).filter((p) => p.entity && p.username !== this.name &&
      p.entity.position.distanceTo(this.pos) < 14 && p.username !== this.e.cameraName);
    let target = null;
    if (r < this.mood.kamera && this.e.camera) target = 'kamera';
    else if (r < this.mood.kamera + this.mood.leute && others.length) {
      target = others[Math.floor(this.rand() * others.length)].username;
    } else {
      const base = this.head ? this.head.yaw : 0;
      const yaw = base + (this.rand() - 0.5) * 1.6;
      const pitch = (this.rand() - 0.6) * 0.35;
      target = { yaw, pitch };
    }
    this.gaze = target;
    this.gazeUntil = now + (1200 + this.rand() * 2600);
    this.saccade = 4;  // die nächsten Ticks schneller drehen (Blicksprung)
  }

  headTick() {
    const h = this.head;
    const want = this.wantLook();
    if (want) {
      let k = this.stiff;
      if (this.saccade > 0) { k = Math.max(k, 160); this.saccade--; }
      if (this.move && this.move.stiff) k = this.move.stiff;
      const c = 2 * Math.sqrt(k);
      const dy = wrap(want.yaw - h.yaw), dp = want.pitch - h.pitch;
      h.vy = clamp(h.vy + (k * dy - c * h.vy) * DT, -9, 9);
      h.vp = clamp(h.vp + (k * dp - c * h.vp) * DT, -7, 7);
    } else {
      h.vy *= 0.6; h.vp *= 0.6;
    }
    h.yaw = wrap(h.yaw + h.vy * DT);
    h.pitch = clamp(h.pitch + h.vp * DT, -1.45, 1.45);
    // leichtes Zittern: zwei langsame Schwingungen je Achse (Hand an der Maus ist nie ganz ruhig)
    const t = zeit.now() / 1000, [a, b, c, d] = this.phase;
    const amp = this.move && this.move.calm ? 0.3 : 1;
    const jy = amp * (0.0065 * Math.sin(1.1 * t + a) + 0.004 * Math.sin(2.9 * t + b));
    const jp = amp * (0.005 * Math.sin(0.9 * t + c) + 0.003 * Math.sin(3.7 * t + d));
    this.bot.entity.yaw = h.yaw + jy;
    this.bot.entity.pitch = clamp(h.pitch + jp, -1.5, 1.5);
  }

  /** Kopf sofort ausrichten (ohne Feder), z. B. nach einem Teleport. */
  face(target) {
    const a = this.lookAtTarget(target);
    if (a && this.head) { this.head.yaw = a.yaw; this.head.pitch = a.pitch; this.head.vy = 0; this.head.vp = 0; }
  }

  // ---------------------------------------------------------------- Lenken
  /** Steuerung so setzen, dass der Darsteller in Richtung d (x, z) läuft – egal, wohin er schaut. */
  steer(dx, dz, { sprint = false, slow = false } = {}) {
    const bot = this.bot, yaw = bot.entity.yaw;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const fwd = dx * -Math.sin(yaw) + dz * -Math.cos(yaw);
    const right = dx * Math.cos(yaw) + dz * -Math.sin(yaw);
    bot.setControlState('forward', fwd > 0.38);
    bot.setControlState('back', fwd < -0.38);
    bot.setControlState('right', right > 0.38);
    bot.setControlState('left', right < -0.38);
    bot.setControlState('sprint', sprint && fwd > 0.8 && !slow);
    bot.setControlState('sneak', !!slow && slow === 'sneak');
  }

  // ---------------------------------------------------------------- Bewegen
  /** Hingehen (Wegsuche). opts: sprint, genau (Abstand am Ziel), blick (Ziel am Ende), pfad:false = geradeaus */
  geh(ziel, opts = {}) {
    return this.run('geh', (tk) => this._go(v3(ziel), opts, tk));
  }

  lauf(ziel, opts = {}) { return this.geh(ziel, { ...opts, sprint: true }); }

  async _go(goal, { sprint = false, genau = 0.35, blick = null, pfad = true, sprung = 0.0 } = {}, tk) {
    const plan = () => {
      let pth = pfad ? findPath(this.bot, this.pos, goal) : null;
      if (!pth || !pth.length) pth = [goal];
      else pth[pth.length - 1] = new Vec3(goal.x, pth[pth.length - 1].y, goal.z);
      return pth;
    };
    let path = plan();
    let w = makeWorld(this.bot);
    let i = 0, still = 0, replans = 0, turnHold = 0, lastP = null;
    const level = (p) => Math.floor(p.y + 0.01);
    // Ziel zum Hinlaufen: so weit wie möglich den Weg entlang, solange die Linie mit Körperbreite frei ist
    const aim = (p) => {
      const here = new Vec3(p.x, level(p), p.z);
      while (i < path.length - 1 && path[i + 1].y === here.y && clearLine(w, here, path[i + 1])) i++;
      let a = path[i];
      if (a.y === here.y && i < path.length - 1 && path[i + 1].y === here.y) {
        const n = path[i + 1];
        const L = Math.hypot(n.x - a.x, n.z - a.z) || 1;
        for (let k = 1; k <= 6; k++) {
          const t = Math.min(1, (k * 0.3) / L);
          const c = new Vec3(a.x + (n.x - a.x) * t, a.y, a.z + (n.z - a.z) * t);
          if (!clearLine(w, here, c)) break;
          a = c;
          if (t >= 1) break;
        }
      }
      return a;
    };
    await new Promise((resolve) => {
      this.move = {
        resolve,
        look(me) {
          const p = me.pos, a = aim(p);
          if (Math.hypot(a.x - p.x, a.z - p.z) < 0.6) return blick ? me.lookAtTarget(blick) : null;
          return { yaw: Math.atan2(-(a.x - p.x), -(a.z - p.z)), pitch: -0.1 - 0.04 * Math.sin(me.ticks * 0.13) };
        },
        tick(me) {
          if (tk.cancelled) { me.release(); return true; }
          const p = me.pos;
          const a = aim(p);
          const end = path[path.length - 1];
          const dEnd = Math.hypot(end.x - p.x, end.z - p.z);
          if (i >= path.length - 1 && dEnd < genau) { me.release(); return true; }
          const d = Math.hypot(a.x - p.x, a.z - p.z);
          const want = Math.atan2(-(a.x - p.x), -(a.z - p.z));
          const off = Math.abs(wrap(want - me.bot.entity.yaw));
          // erst grob in die Richtung drehen, dann losgehen (echte Spieler drehen beim Anlaufen schnell)
          if (off > 1.2 && turnHold < 6 && d > 0.8) { turnHold++; me.saccade = 3; me.release(); return false; }
          turnHold = 0;
          const near = dEnd < 1.6;
          me.steer(a.x - p.x, a.z - p.z, { sprint: sprint && !near && off < 0.45 });
          // springen: nur an einer echten Stufe (vorne ein Block, darüber frei) oder für einen Lauf-Sprung
          const ux = (a.x - p.x) / (d || 1), uz = (a.z - p.z) / (d || 1);
          const fx = Math.floor(p.x + ux * 0.7), fz = Math.floor(p.z + uz * 0.7), y = level(p);
          const step = w.solid(fx, y, fz) && w.passable(fx, y + 1, fz) && w.passable(fx, y + 2, fz);
          const up = a.y > y && d < 1.4;
          const hop = sprint && sprung && dEnd > 4 && me.rand() < sprung;
          me.bot.setControlState('jump', !!(me.bot.entity.onGround && (up || (step && me.bot.entity.isCollidedHorizontally) || hop)));
          // festgefahren? einmal neu planen, dann aufgeben
          still = lastP && p.distanceTo(lastP) < 0.025 ? still + 1 : 0;
          lastP = p.clone();
          if (still > 30) {
            if (replans++ < 2) { w = makeWorld(me.bot); path = plan(); i = 0; still = 0; }
            else { me.log('FEHLER', 'geh: komme nicht weiter'); me.release(); return true; }
          }
          return false;
        },
      };
    });
    if (blick) this.look = blick;
  }

  /** Folgen: in etwa abstand Blöcken Abstand hinter einem anderen Darsteller/Spieler her. */
  folge(name, { abstand = 2.5, sprint = false, dauer = 30 } = {}) {
    return this.run('folge', async (tk) => {
      const end = zeit.now() + dauer * 1000;
      await new Promise((resolve) => {
        this.move = {
          resolve,
          look: (me) => me.lookAtTarget(name),
          tick: (me) => {
            if (tk.cancelled || zeit.now() > end) { me.release(); return true; }
            const t = me.bot.players[name] && me.bot.players[name].entity;
            if (!t) return false;
            const d = Math.hypot(t.position.x - me.pos.x, t.position.z - me.pos.z);
            if (d > abstand + 0.4) me.steer(t.position.x - me.pos.x, t.position.z - me.pos.z, { sprint: sprint && d > abstand + 3 });
            else for (const c of ['forward', 'back', 'left', 'right', 'sprint']) me.bot.setControlState(c, false);
            me.bot.setControlState('jump', me.bot.entity.isCollidedHorizontally && me.bot.entity.onGround);
            return false;
          },
        };
      });
    });
  }

  /** Geführte Bahn (z. B. schwieriger Parkour): Stützpunkte [{p:[x,y,z], t: Sekunden ab dem vorigen}], weiche Kurve,
   *  Beine bewegen sich (Positionspakete), Kopf schaut voraus. Physik ist so lange aus. */
  bahn(punkte, { blick = null } = {}) {
    return this.run('bahn', async (tk) => {
      const pts = punkte.map((q) => ({ p: v3(q.p), t: q.t || 0 }));
      const times = [];
      let acc = 0;
      for (const q of pts) { acc += q.t; times.push(acc); }
      const total = acc;
      const cr = (a, b, c, d, u) => {
        const f = (p0, p1, p2, p3) => 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u +
          (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
        return new Vec3(f(a.x, b.x, c.x, d.x), f(a.y, b.y, c.y, d.y), f(a.z, b.z, c.z, d.z));
      };
      const at = (t) => {
        if (t <= 0) return pts[0].p;
        for (let k = 1; k < pts.length; k++) {
          if (t <= times[k]) {
            const u = (t - times[k - 1]) / Math.max(1e-6, times[k] - times[k - 1]);
            const P = (j) => pts[clamp(j, 0, pts.length - 1)].p;
            return cr(P(k - 2), P(k - 1), P(k), P(k + 1), u);
          }
        }
        return pts[pts.length - 1].p;
      };
      const bot = this.bot;
      const t0 = zeit.now();
      // Physik bleibt an (sonst gäbe es keine Ticks); nach jedem Schritt wird die Lage auf die Bahn gesetzt.
      try {
        await new Promise((resolve) => {
          this.move = {
            resolve,
            look: (me) => {
              if (blick) return me.lookAtTarget(blick);
              const t = (zeit.now() - t0) / 1000;
              const a = at(t), b = at(t + 0.35);
              if (Math.hypot(b.x - a.x, b.z - a.z) < 0.05) return null;
              return angles(me.eye, b.offset(0, 1.3, 0));
            },
            tick: (me) => {
              const t = (zeit.now() - t0) / 1000;
              const p = at(Math.min(t, total));
              bot.entity.velocity.set(0, 0, 0);
              bot.entity.position.set(p.x, p.y, p.z);
              const below = bot.blockAt(p.offset(0, -0.05, 0), false);
              bot.entity.onGround = !!(below && below.boundingBox === 'block' && p.y - Math.floor(p.y) < 0.06);
              if (tk.cancelled || t >= total) return true;
              return false;
            },
          };
        });
      } finally {
        bot.entity.velocity.set(0, 0, 0);
      }
    });
  }

  // ---------------------------------------------------------------- Kleinigkeiten
  chat(text) { if (this.bot) this.bot.chat(text); }
  slot(n) { this.bot.setQuickBarSlot(n); }
  schwing(hand = 'right') { this.bot.swingArm(hand); }

  async springe(n = 1) {
    for (let k = 0; k < n; k++) {
      this.bot.setControlState('jump', true);
      await zeit.wait(100);
      this.bot.setControlState('jump', false);
      await this.until(() => this.bot.entity.onGround, 2);
      await zeit.wait(150 + this.rand() * 250);
    }
  }

  /** Kurz schleichen als Gruß (2–3-mal). */
  async gruss(n = 3) {
    for (let k = 0; k < n; k++) {
      this.bot.setControlState('sneak', true);
      await zeit.wait(120 + this.rand() * 60);
      this.bot.setControlState('sneak', false);
      await zeit.wait(110 + this.rand() * 80);
    }
  }

  schleiche(an = true) { this.bot.setControlState('sneak', !!an); }

  /** Gegenstand in die Hand: Text im Namen (auch „sword|axe“ für Alternativen). */
  async nimm(text) {
    const plain = (v) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v));
    let item = null;
    for (const want of String(text).toLowerCase().split('|')) {
      item = this.bot.inventory.items().find((i) => (plain(i.customName) + ' ' + i.name).toLowerCase().includes(want));
      if (item) break;
    }
    if (!item) { this.log('FEHLER', `nimm: ${text} nicht da (${this.bot.inventory.items().map((i) => i.name).join(',')})`); return false; }
    await this.bot.equip(item, 'hand');
    return true;
  }

  /** Essen: Essen in die Hand, 1,6 s benutzen (Spielzeit). Satt? Dann vorher hungrig machen (effect hunger). */
  essen(text = 'bread|apple|carrot|potato|beef|pork|chicken|cookie|melon|stew|soup') {
    return this.run('essen', async (tk) => {
      if (!(await this.nimm(text))) return;
      this.bot.activateItem();
      await this.wait(1.75, tk);
      this.bot.deactivateItem();
    });
  }

  /** Block anklicken (öffnet Truhen, Türen, Knöpfe …) – mit Blick dorthin. */
  async klick(x, y, z, face = 'up') {
    const p = new Vec3(x + 0.5, y + 0.5, z + 0.5);
    this.look = p;
    await this.until(() => Math.abs(wrap(angles(this.eye, p).yaw - this.head.yaw)) < 0.2, 1.5);
    this.useBlock(x, y, z, FACES[face] ?? 1);
  }

  /** Block abbauen (Schaufel, Spitzhacke …) – mit Blick dorthin, der Kopf folgt weich. */
  async grabe(x, y, z) {
    const b = this.bot.blockAt(new Vec3(x, y, z));
    if (!b || b.name === 'air') return;
    const p = new Vec3(x + 0.5, y + 0.5, z + 0.5);
    this.look = p;
    await this.until(() => Math.abs(wrap(angles(this.eye, p).yaw - this.head.yaw)) < 0.25, 1.0);
    // Selbst gesendet statt bot.dig: mineflayer rechnet die Abbauzeit aus den Verzauberungen und scheitert an 26.x.
    // Anfangen + Fertig (Schnee mit Schaufel bricht sofort), Arm schwingt mit.
    const loc = new Vec3(x, y, z);
    const send = (status) => {
      this.e.seq = (this.e.seq || 1) + 1;
      this.bot._client.write('block_dig', { status, location: loc, face: 1, sequence: this.e.seq });
    };
    send(0);
    this.bot.swingArm('right');
    await zeit.wait(100);
    send(2);
  }

  useBlock(x, y, z, face) {
    this.e.seq = (this.e.seq || 1) + 1;
    this.bot._client.write('block_place', {
      location: new Vec3(x, y, z), direction: face, hand: 0, cursorX: 0.5, cursorY: face === 0 ? 0 : face === 1 ? 1 : 0.5,
      cursorZ: 0.5, insideBlock: false, sequence: this.e.seq, worldBorderHit: false,
    });
    this.bot.swingArm('right');
  }

  /** Truhe öffnen und ausräumen: hingehen, hinschauen, öffnen, Dinge einzeln herausnehmen, schließen.
   *  opts.nimm: 'alles' oder Textfilter („sword|planks“), opts.dann: Gegenstand in die Hand nehmen */
  truhe(x, y, z, opts = {}) {
    return this.run('truhe', async (tk) => {
      const c = new Vec3(x + 0.5, y + 0.5, z + 0.5);
      if (this.pos.distanceTo(c) > 3.2) {
        const stand = opts.stand ? v3(opts.stand) : null;
        await this._go(stand || c, { genau: stand ? 0.3 : 2.3, blick: c }, tk);
      }
      this.look = c;
      await this.wait(0.25 + this.rand() * 0.2, tk);
      this.useBlock(x, y, z, 1);
      const opened = await this.until(() => !!this.bot.currentWindow, 2.5, tk);
      if (!opened) { this.log('FEHLER', 'truhe: geht nicht auf'); return; }
      await this.wait(0.35 + this.rand() * 0.3, tk);
      const w = this.bot.currentWindow;
      const want = opts.nimm && opts.nimm !== 'alles' ? String(opts.nimm).toLowerCase().split('|') : null;
      for (let s = 0; s < w.inventoryStart; s++) {
        const it = w.slots[s];
        if (!it || (want && !want.some((x_) => it.name.includes(x_)))) continue;
        await this.bot.clickWindow(s, 0, 1).catch(() => {});
        await this.wait(0.12 + this.rand() * 0.2, tk);
      }
      await this.wait(0.2 + this.rand() * 0.25, tk);
      if (this.bot.currentWindow) this.bot.closeWindow(this.bot.currentWindow);
      this.look = null;
      if (opts.dann) await this.nimm(opts.dann);
    });
  }

  /** Block setzen: an die Seite face eines vorhandenen Blocks. */
  setze(x, y, z, face) { this.useBlock(x, y, z, FACES[face] ?? 1); }

  /** Brücke bauen wie echte Spieler: rückwärts zur Kante schleichen, nach unten-hinten schauen, Block an die Kante
   *  setzen, weiter. richtung: nord|sued|ost|west oder [dx, dz]; anzahl Blöcke; material Textfilter. */
  bruecke(richtung, anzahl = 6, { material = 'planks|wool|stone|terracotta|concrete|log|bricks|sandstone|block', takt = 0.38 } = {}) {
    return this.run('bruecke', async (tk) => {
      const [dx, dz] = Array.isArray(richtung) ? richtung : DIR[richtung];
      if (!(await this.nimm(material))) return;
      const bot = this.bot;
      const back = Math.atan2(dx, dz);  // Blick entgegen der Baurichtung
      let placed = 0;
      this.look = { yaw: back, pitch: -1.35 };
      await this.wait(0.35, tk);
      bot.setControlState('sneak', true);
      await this.wait(0.15, tk);
      const face = dx === 1 ? 'east' : dx === -1 ? 'west' : dz === 1 ? 'south' : 'north';
      // Block unter den Füßen = der zuletzt gebaute; die Kante ist dessen Seite in Baurichtung
      const p0 = this.pos;
      let bx = Math.floor(p0.x), bz = Math.floor(p0.z);
      const gy = Math.floor(p0.y - 0.01);
      const solidAt = (x, z) => { const b = bot.blockAt(new Vec3(x, gy, z), false); return b && b.boundingBox === 'block'; };
      while (solidAt(bx + dx, bz + dz)) { bx += dx; bz += dz; }  // bis zur Kante: dort beginnt die Brücke
      let slow = 0;
      while (placed < anzahl) {
        tk.check();
        const p = this.pos;
        const edge = dx ? (dx > 0 ? bx + 1 : bx) : (dz > 0 ? bz + 1 : bz);
        const over = ((dx ? p.x : p.z) - edge) * (dx || dz);  // > 0 = über die Kante hinaus
        if (over < 0.2 && slow < 60) {
          this.steer(dx, dz, { slow: 'sneak' });
          slow++;
          await zeit.wait(50);
          continue;
        }
        slow = 0;
        this.release();
        this.look = { yaw: back + (this.rand() - 0.5) * 0.06, pitch: -1.32 - this.rand() * 0.08 };
        await this.wait(0.05 + this.rand() * 0.08, tk);
        this.useBlock(bx, gy, bz, FACES[face]);
        bx += dx; bz += dz;
        placed++;
        await this.wait(takt * (0.6 + this.rand() * 0.5), tk);
      }
      bot.setControlState('sneak', false);
      this.stop();
      this.look = null;
    });
  }

  // ---------------------------------------------------------------- Kampf
  /** Kämpfen wie ein echter Spieler: anlaufen, seitlich ausweichen, W-Tap, Sprung-Kritische, Klicks im Takt.
   *  opts: dauer (s), stil 'modern' (Abklingzeit abwarten) | 'klassisch' (CPS), cps, krit (Anteil Sprungschläge),
   *  schild (Anteil Blocken), reichweite, waffe (Textfilter), treffer (nach so vielen Treffern aufhören) */
  kaempfe(gegner, opts = {}) {
    return this.run('kaempfe', (tk) => this._fight(gegner, opts, tk));
  }

  async _fight(gegner, { dauer = 8, stil = 'modern', cps = 8, krit = 0.35, schild = 0, reichweite = 2.9, waffe = null,
    treffer = Infinity, abstand = 2.4 } = {}, tk) {
    if (waffe) await this.nimm(waffe);
    const bot = this.bot;
    const end = zeit.now() + dauer * 1000;
    const cool = () => {
      const held = bot.heldItem ? bot.heldItem.name : '';
      return held.includes('axe') ? 20 : held.includes('sword') ? 13 : held.includes('trident') ? 18 : 6;
    };
    let lastHit = -100, nextClick = 0, strafe = this.rand() < 0.5 ? 1 : -1, strafeUntil = 0, wtap = 0, jumping = false;
    let hits = 0, blockUntil = 0;
    const onSwing = (ent) => {
      if (schild && ent && ent.username === gegner && this.rand() < schild && blockUntil < this.ticks) {
        blockUntil = this.ticks + 6 + Math.floor(this.rand() * 8);
        bot.activateItem(true);
      }
    };
    bot.on('entitySwingArm', onSwing);
    const onHurt = (ent) => { if (ent && ent.username === gegner) hits++; };
    bot.on('entityHurt', onHurt);
    try {
      await new Promise((resolve) => {
        this.move = {
          resolve,
          stiff: 140,
          look: (me) => {
            const t = bot.players[gegner] && bot.players[gegner].entity;
            if (!t) return null;
            const err = 0.04 * Math.sin(me.ticks * 0.37 + me.phase[0]);
            const a = angles(me.eye, t.position.offset(0, 1.25 + 0.15 * Math.sin(me.ticks * 0.21), 0));
            return { yaw: a.yaw + err, pitch: a.pitch };
          },
          tick: (me) => {
            if (tk.cancelled || zeit.now() > end || hits >= treffer) { me.release(); return true; }
            const t = bot.players[gegner] && bot.players[gegner].entity;
            if (!t) { me.release(); return false; }
            const dx = t.position.x - me.pos.x, dz = t.position.z - me.pos.z;
            const d = Math.hypot(dx, dz);
            const blocking = blockUntil > me.ticks;
            if (!blocking && blockUntil && blockUntil <= me.ticks) { bot.deactivateItem(); blockUntil = 0; }
            // Seitwärts: Richtung wechselt alle 0,4–1,2 s
            if (me.ticks > strafeUntil) { strafe = me.rand() < 0.7 ? -strafe : strafe; strafeUntil = me.ticks + 8 + Math.floor(me.rand() * 16); }
            let mx = 0, mz = 0;
            const ux = dx / (d || 1), uz = dz / (d || 1);
            if (d > 3.4) { mx = ux; mz = uz; }
            else if (d < abstand - 0.6) { mx = -ux * 0.6 + -uz * strafe; mz = -uz * 0.6 + ux * strafe; }
            else { mx = ux * 0.5 + -uz * strafe; mz = uz * 0.5 + ux * strafe; }
            if (wtap > 0) { wtap--; mx = -uz * strafe * 0.5; mz = ux * strafe * 0.5; }
            me.steer(mx, mz, { sprint: !blocking && d > 2.2 && wtap === 0 });
            // Sprung für einen Kritischen (nur modern sinnvoll) oder zum Anlaufen
            const onGround = bot.entity.onGround;
            if (onGround && !blocking && stil === 'modern' && d < 4.2 && me.ticks - lastHit > cool() - 9 &&
                me.rand() < krit / 8) { bot.setControlState('jump', true); jumping = true; }
            else if (onGround && d > 5 && me.rand() < 0.04) { bot.setControlState('jump', true); }
            else bot.setControlState('jump', false);
            // Zuschlagen
            const ready = stil === 'modern' ? me.ticks - lastHit >= cool() + (nextClick || 0) : me.ticks >= nextClick;
            const falling = bot.entity.velocity.y < -0.08 && !onGround;
            const critWait = jumping && !falling && !onGround;
            if (!blocking && ready && !critWait) {
              const reach = me.eye.distanceTo(t.position.offset(0, 1, 0));
              if (reach <= reichweite + 0.4) {
                bot.attack(t);
                lastHit = me.ticks;
                jumping = false;
                if (bot.getControlState('sprint')) wtap = 1 + Math.floor(me.rand() * 3);
                nextClick = stil === 'modern' ? Math.floor(me.rand() * 3) : me.ticks + Math.max(1, Math.round(20 / (cps * (0.75 + me.rand() * 0.5))));
              } else if (d < 4.5 && me.rand() < 0.25 && stil === 'klassisch') {
                bot.swingArm('right');  // Luftschlag, wie echte Spieler beim Anlaufen
                nextClick = me.ticks + 3;
              }
            }
            return false;
          },
        };
      });
    } finally {
      bot.removeListener('entitySwingArm', onSwing);
      bot.removeListener('entityHurt', onHurt);
      if (blockUntil) bot.deactivateItem();
    }
    return hits;
  }

  /** Bogen: spannen (Spielzeit), dabei zielen (mit Fallkurve), loslassen. */
  bogen(ziel, { spannen = 1.1 } = {}) {
    return this.run('bogen', async (tk) => {
      if (!(await this.nimm('bow'))) return;
      const aim = () => {
        const t = this.targetPos(ziel);
        if (!t) return null;
        const a = angles(this.eye, t);
        const d = Math.hypot(t.x - this.eye.x, t.z - this.eye.z);
        return { yaw: a.yaw, pitch: a.pitch + Math.min(0.35, d * 0.006 + d * d * 0.00012) };
      };
      this.move = { look: () => aim(), stiff: 120, calm: true, tick: () => false };
      this.bot.activateItem();
      await this.wait(spannen, tk);
      this.bot.deactivateItem();
      await this.wait(0.3, tk);
      this.move = null;
    });
  }

  /** Schild hochhalten (Zweithand) für s Sekunden. */
  async schild(s = 1) {
    this.bot.activateItem(true);
    await this.wait(s);
    this.bot.deactivateItem();
  }
}

class Ensemble {
  constructor({ host = '127.0.0.1', port = 25565, version = '26.1', stagger = 3600 } = {}) {
    Object.assign(this, { host, port, version, stagger });
    this.actors = {};
    this.camera = null;         // [x, y, z] der Kamera (von shot.py gemeldet) – für „zur Kamera schauen“
    this.cameraName = process.env.MM_CAMERA || null;
    this.queue = Promise.resolve();
  }

  /** Darsteller dazuholen (nacheinander mit Abstand – der Server lässt nicht alle zugleich herein). */
  add(name, opts = {}) {
    const a = new Darsteller(this, name, opts);
    this.actors[name] = a;
    this.queue = this.queue.then(async () => {
      a.connect();
      await new Promise((r) => setTimeout(r, this.stagger));
    });
    return this.queue.then(() => a.ready);
  }

  get(name) { return this.actors[name]; }

  close() {
    this.closing = true;
    for (const a of Object.values(this.actors)) if (a.bot) a.bot.quit();
  }
}

module.exports = { Darsteller, Ensemble, angles, zeit, Vec3 };
