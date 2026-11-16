/* eslint-disable ts-patterns/no-magic-numbers -- display maths: half sizes, quaternion halves and rounding as Minecraft needs them */
/**
 * Anzeige-Wesen für die Saison-Deko: Block-Anzeigen (block_display) mit Mitte, Größe und Drehung, dazu kleine
 * Modelle aus mehreren Teilen (Schneemann, Schlitten, Geschenk), die als Ganzes gedreht werden.
 * Alles nur Minecraft-Blöcke – keine eigenen Texturen.
 *
 * Ohne Hitbox: Anzeige-Wesen haben keinen Körper, aber mit F3+B zeichnet Minecraft trotzdem einen Rahmen und einen
 * blauen Blick-Pfeil an jedes Wesen – bei Hunderten Kugeln und Lichtern ein Wald aus Strichen. Unsichtbare Wesen
 * lässt Minecraft dabei aus; eine Anzeige zeichnet es trotzdem ganz normal (der Renderer fragt nicht danach).
 * Paper liest `Bukkit.invisible` beim Erzeugen und merkt es sich dauerhaft.
 */

export type Vec = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];

const HALF = 0.5;
/** Unsichtbar für Minecraft (keine Hitbox mit F3+B), Anzeige bleibt sichtbar – siehe oben. */
export const NO_HITBOX = '"Bukkit.invisible":1b';
/**
 * Anzeige-Wesen bekommen „unsichtbar“ (keine F3+B-Hitbox), andere Befehle bleiben, wie sie sind.
 * Passt: "summon text_display 1 2 3 {Tags:[]}"; passt nicht: "summon mannequin 1 2 3 {…}", "setblock …".
 * https://regex101.com/?flavor=javascript&regex=%5E(summon%20(%3F%3Ablock_display%7Citem_display%7Ctext_display)%20%5CS%2B%20%5CS%2B%20%5CS%2B%20%5C%7B)&testString=summon%20text_display%201%202%203%20%7BTags%3A%5B%5D%7D
 */
const DISPLAY_SUMMON = /^(summon (?:block_display|item_display|text_display) \S+ \S+ \S+ \{)/;
export function withoutHitbox(command: string): string {
  if (command.includes(NO_HITBOX)) return command;
  return command.replace(DISPLAY_SUMMON, `$1${NO_HITBOX},`);
}
export const NO_TURN: Quat = [0, 0, 0, 1];

export function multiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** Vektor mit einer Drehung (Quaternion) drehen. */
export function rotate(q: Quat, v: Vec): Vec {
  const [x, y, z] = v;
  const [rx, ry, rz] = multiply(multiply(q, [x, y, z, 0]), [-q[0], -q[1], -q[2], q[3]]);
  return [rx, ry, rz];
}

/** Drehung um die x-, y- bzw. z-Achse (Bogenmaß, rechte Hand). */
export const aroundX = (a: number): Quat => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
export const aroundY = (a: number): Quat => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
export const aroundZ = (a: number): Quat => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];

/** Zahl für NBT (Kommazahl mit f) bzw. für Koordinaten (ohne). */
export const f = (n: number): string => `${Number(n.toFixed(4))}f`;
export const c = (n: number): string => `${Number(n.toFixed(4))}`;

export interface DisplayOptions {
  readonly scale: Vec;
  readonly rotation?: Quat;
  /** Leuchtet unabhängig vom Licht (Lichterketten). */
  readonly glow?: boolean;
  /** Feste Helligkeit (z. B. Dachschnee: Himmelslicht wie draußen, egal wo die Mitte liegt). */
  readonly light?: { readonly sky: number; readonly block: number };
  readonly properties?: Readonly<Record<string, string>>;
  /** Sichtweite (1 = 64 Blöcke); große Teile wie Dachschnee sieht man von weiter weg. */
  readonly view?: number;
}

/** Block-Anzeige mit Mitte bei (x, y, z) – gedreht um ihre eigene Mitte. `tags` = SNBT-Teil `Tags:[…]`. */
export function blockDisplay(tags: string, at: Vec, block: string, o: DisplayOptions): string {
  const [x, y, z] = at;
  const [sx, sy, sz] = o.scale;
  const list = o.properties
    ? `{${Object.entries(o.properties)
        .map(([k, v]) => `${k}:'${v}'`)
        .join(',')}}`
    : '';
  // Bis 26.2 heißt es Name/Properties, ab 26.3 id/properties – beide mitgeben, jede Version nimmt ihre.
  const props = list ? `,Properties:${list},properties:${list}` : '';
  const rotation = o.rotation ?? NO_TURN;
  // Minecraft dreht erst und verschiebt dann: damit die Drehung um die Mitte geht, die Verschiebung mitdrehen.
  const [tx, ty, tz] = rotate(rotation, [sx * HALF, sy * HALF, sz * HALF]);
  const light = o.glow ? { sky: 15, block: 15 } : o.light;
  const bright = light ? `,brightness:{sky:${light.sky},block:${light.block}}` : '';
  const view = o.view ? `,view_range:${f(o.view)}` : '';
  return (
    `summon block_display ${c(x)} ${c(y)} ${c(z)} {${NO_HITBOX},${tags},block_state:{Name:'minecraft:${block}',id:'minecraft:${block}'${props}},` +
    `transformation:{left_rotation:[${rotation.map(f).join(',')}],right_rotation:[0f,0f,0f,1f],` +
    `translation:[${f(-tx)},${f(-ty)},${f(-tz)}],scale:[${f(sx)},${f(sy)},${f(sz)}]}${bright}${view}}`
  );
}

/** Ein Teil eines kleinen Modells: Mitte und Drehung in eigenen Koordinaten (vorne = +z, oben = +y). */
export interface Part {
  readonly at: Vec;
  readonly block: string;
  readonly scale: Vec;
  readonly rotation?: Quat;
  readonly glow?: boolean;
  readonly properties?: Readonly<Record<string, string>>;
}

/** Modell an (x, y, z) aufstellen, Vorderseite in Richtung `yaw` (Bogenmaß, 0 = Süden/+z, π/2 = Osten/+x). */
export function placeModel(tags: string, origin: Vec, yaw: number, parts: readonly Part[]): string[] {
  const turn = aroundY(yaw);
  return parts.map((p) => {
    const [lx, ly, lz] = rotate(turn, p.at);
    return blockDisplay(tags, [origin[0] + lx, origin[1] + ly, origin[2] + lz], p.block, {
      scale: p.scale,
      rotation: multiply(turn, p.rotation ?? NO_TURN),
      ...(p.glow ? { glow: true } : {}),
      ...(p.properties ? { properties: p.properties } : {}),
    });
  });
}

/** Schild als Text-Anzeige (Zeilen mit `\n`), feste Richtung `yaw` in Grad (0 = schaut nach Süden). */
export function textSign(
  tags: string,
  at: Vec,
  yaw: number,
  lines: readonly { readonly text: string; readonly color: string; readonly bold?: boolean }[],
  scale: number,
): string {
  const [x, y, z] = at;
  const text = lines
    .map((l) => `{text:'${l.text.replaceAll("'", "\\'")}',color:'${l.color}'${l.bold ? ',bold:true' : ''}}`)
    .join(',');
  return (
    `summon text_display ${c(x)} ${c(y)} ${c(z)} {${NO_HITBOX},${tags},billboard:'fixed',Rotation:[${f(yaw)},0f],` +
    `text:[${text}],background:0,shadow:true,` +
    `transformation:{left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f],translation:[0f,0f,0f],` +
    `scale:[${f(scale)},${f(scale)},${f(scale)}]}}`
  );
}

/** Gegenstand als Anzeige (z. B. Plätzchen auf der Theke), Mitte bei (x, y, z). */
export function itemDisplay(
  tags: string,
  at: Vec,
  item: string,
  scale: number,
  rotation: Quat = NO_TURN,
): string {
  const [x, y, z] = at;
  return (
    `summon item_display ${c(x)} ${c(y)} ${c(z)} {${NO_HITBOX},${tags},item:{id:'minecraft:${item}',count:1},` +
    `item_display:'fixed',transformation:{left_rotation:[${rotation.map(f).join(',')}],right_rotation:[0f,0f,0f,1f],` +
    `translation:[0f,0f,0f],scale:[${f(scale)},${f(scale)},${f(scale)}]}}`
  );
}
