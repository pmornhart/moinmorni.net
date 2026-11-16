/**
 * Reihenfolge unserer Rollen in Discord (oben = wichtiger, wie die Ränge). Der Bot sortiert nur unter seinen eigenen
 * Rollen: fremde Rollen bleiben auf ihrem Platz, unsere tauschen nur untereinander die Plätze, die sie schon haben.
 * Hat jemand unsere Rollen in Discord selbst umsortiert, bleibt das – neue Rollen kommen dann hinter ihren Vorgänger
 * aus der Vorlage.
 */

/**
 * @param current unsere Rollen, wie sie jetzt stehen (von oben nach unten, Schlüssel wie „role:moderator“)
 * @param desired die Reihenfolge der Vorlage (von oben nach unten)
 * @param last wie der Bot sie zuletzt gestellt hat (null = noch nie)
 * @param fresh in diesem Lauf neu angelegt (stehen in Discord noch ganz unten)
 */
export function roleOrder(
  current: readonly string[],
  desired: readonly string[],
  last: readonly string[] | null,
  fresh: ReadonlySet<string>,
): string[] {
  const known = current.filter((k) => !fresh.has(k));
  const untouched =
    last === null ||
    sameOrder(
      known,
      last.filter((k) => known.includes(k)),
    );
  if (untouched) return desired.filter((k) => current.includes(k));
  // Selbst umsortiert: diese Reihenfolge bleibt, neue Rollen kommen hinter ihren Vorgänger aus der Vorlage.
  return desired
    .filter((k) => fresh.has(k) && current.includes(k))
    .reduce<string[]>((order, key) => {
      const before = desired.slice(0, desired.indexOf(key)).reverse();
      const anchor = before.find((k) => order.includes(k));
      const at = anchor === undefined ? 0 : order.indexOf(anchor) + 1;
      return [...order.slice(0, at), key, ...order.slice(at)];
    }, known);
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

/**
 * Neue Plätze für Discords „Rollen-Reihenfolge ändern“: `order` von oben nach unten bekommt die Plätze, die unsere
 * Rollen jetzt haben (höchster Platz zuerst). Nur was sich wirklich bewegt.
 */
export function positionChanges(
  order: readonly string[],
  positionOf: ReadonlyMap<string, number>,
  idOf: ReadonlyMap<string, string>,
): Array<{ readonly id: string; readonly position: number }> {
  const slots = order.map((k) => positionOf.get(k) ?? 0).sort((a, b) => b - a);
  return order.flatMap((key, i) => {
    const id = idOf.get(key);
    const position = slots[i];
    if (!id || position === undefined || positionOf.get(key) === position) return [];
    return [{ id, position }];
  });
}
