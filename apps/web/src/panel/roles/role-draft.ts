import { DISCORD_RIGHTS, GAME_RIGHTS, OWNER_ONLY_ROLES, PANEL_AREAS, type Role } from '@moinmorni/shared';

/** Rules of the role template, kept in step with `roleSchema` in packages/shared/src/roles.ts. */
export const NAME_MAX = 24;
export const SYMBOL_MAX = 4;
export const OWNER = 'owner';
const ID_TRIES = 99;
const FIRST_SUFFIX = 2;
// A colour as #rrggbb: accepts "#ff5555", rejects "ff5555" and "#f55".
// https://regex101.com/?flavor=javascript&regex=%5E%23%5B0-9a-fA-F%5D%7B6%7D%24&testString=%23ff5555
const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
// Accents after NFD splitting ("é" → "e" + U+0301): matches the combining marks only.
// https://regex101.com/?flavor=javascript&regex=%5B%5Cu0300-%5Cu036f%5D&flags=g&testString=Caf%C3%A9
const COMBINING_MARKS = /[̀-ͯ]/g;
// Everything that is not a-z or 0-9 becomes one "-": "VIP Plus!" → "vip-plus-".
// https://regex101.com/?flavor=javascript&regex=%5B%5Ea-z0-9%5D%2B&flags=g&testString=vip%20plus!
const NOT_ID = /[^a-z0-9]+/g;
// Dashes at the start or end: "-vip-plus-" → "vip-plus".
// https://regex101.com/?flavor=javascript&regex=%5E-%2B%7C-%2B%24&flags=g&testString=-vip-plus-
const EDGE_DASHES = /^-+|-+$/g;
const UMLAUTS: readonly (readonly [string, string])[] = [
  ['ä', 'ae'],
  ['ö', 'oe'],
  ['ü', 'ue'],
  ['ß', 'ss'],
];
/** Colours for new roles, one after the other. */
const NEW_COLOURS = ['#55ffff', '#ffaa00', '#aa55ff', '#5555ff', '#ff55ff', '#00aa00'] as const;
export const SYMBOL_IDEAS = ['♛', '✦', '⚔', '⚒', '▶', '★', '✿', '☘', '⚡', '❤'] as const;

export function validColour(colour: string): boolean {
  return HEX_COLOUR.test(colour);
}

/** May this person change `role` at all? Owner and Admin only by the owner. */
export function lockedFor(role: Role, isOwner: boolean): boolean {
  return !isOwner && OWNER_ONLY_ROLES.includes(role.id);
}

/** "Helfer Plus" → "helfer-plus", "Bürger" → "buerger"; only a-z, 0-9 and "-", at most 24 characters. */
export function idFromName(name: string): string {
  const plain = UMLAUTS.reduce((text, [from, to]) => text.replaceAll(from, to), name.toLowerCase())
    .normalize('NFD')
    .replace(COMBINING_MARKS, '');
  return plain.replace(NOT_ID, '-').replace(EDGE_DASHES, '').slice(0, NAME_MAX).replace(EDGE_DASHES, '');
}

/** `base`, or "base-2", "base-3" … if the id is taken already. */
export function freeId(base: string, taken: readonly string[]): string {
  const start = base || 'rolle';
  if (!taken.includes(start)) return start;
  const options = Array.from({ length: ID_TRIES }, (_, i) => {
    const suffix = `-${i + FIRST_SUFFIX}`;
    return `${start.slice(0, NAME_MAX - suffix.length)}${suffix}`;
  });
  return options.find((id) => !taken.includes(id)) ?? `${start}-${Date.now()}`;
}

export function newRole(name: string, taken: readonly string[], count: number): Role {
  const trimmed = name.trim().slice(0, NAME_MAX);
  return {
    id: freeId(idFromName(trimmed), taken),
    name: { de: trimmed, en: trimmed },
    symbol: '',
    colour: NEW_COLOURS[count % NEW_COLOURS.length] ?? NEW_COLOURS[0],
    panel: [],
    game: [],
    discord: [],
    position: count,
    fallback: false,
  };
}

/** Rights in the catalog's order (so toggling one on and off again changes nothing). */
export const inOrder = {
  panel: (list: readonly string[]) => PANEL_AREAS.filter((a) => list.includes(a)),
  game: (list: readonly string[]) => GAME_RIGHTS.filter((r) => list.includes(r)),
  discord: (list: readonly string[]) => DISCORD_RIGHTS.filter((r) => list.includes(r)),
};

export type RoleProblem = 'name' | 'symbol' | 'colour';

export function problemsOf(role: Role): RoleProblem[] {
  const name =
    !role.name.de.trim() ||
    !role.name.en.trim() ||
    role.name.de.length > NAME_MAX ||
    role.name.en.length > NAME_MAX;
  return [
    ...(name ? (['name'] as const) : []),
    ...(role.symbol.length > SYMBOL_MAX ? (['symbol'] as const) : []),
    ...(validColour(role.colour) ? [] : (['colour'] as const)),
  ];
}

/** The role as the server keeps it, ignoring its place and the order inside the right lists. */
function comparable(role: Role): string {
  return JSON.stringify({
    ...role,
    position: 0,
    panel: [...role.panel].sort(),
    game: [...role.game].sort(),
    discord: [...role.discord].sort(),
  });
}

export function sameRole(a: Role, b: Role): boolean {
  return comparable(a) === comparable(b);
}

/** How many things differ: new, removed and changed roles, plus one for a new order. */
export function changeCount(saved: readonly Role[], draft: readonly Role[]): number {
  const savedIds = saved.map((r) => r.id);
  const draftIds = draft.map((r) => r.id);
  const added = draft.filter((r) => !savedIds.includes(r.id)).length;
  const removed = saved.filter((r) => !draftIds.includes(r.id)).length;
  const changed = draft.filter((r) => {
    const before = saved.find((s) => s.id === r.id);
    return before !== undefined && !sameRole(before, r);
  }).length;
  const kept = draftIds.filter((id) => savedIds.includes(id));
  const order = JSON.stringify(kept) !== JSON.stringify(savedIds.filter((id) => draftIds.includes(id)));
  return added + removed + changed + (order ? 1 : 0);
}

/**
 * The list to send: places counted from the top; untouched roles go out exactly as the server has them (it checks
 * Owner and Admin byte for byte).
 */
export function toSave(saved: readonly Role[], draft: readonly Role[], isOwner: boolean): Role[] {
  return draft.map((role, index) => {
    const before = saved.find((s) => s.id === role.id);
    if (before && lockedFor(before, isOwner)) return before;
    const base = before && sameRole(before, role) ? before : role;
    return { ...base, position: index };
  });
}
