/**
 * Bekannte Funde der Bauplan-Prüfung in Teilen, an denen gerade andere arbeiten. Zurzeit keine: Schloss, Schlosstreppe,
 * Schlossmarkt und die Saison-Deko sind frei von Funden. Der Test lässt genau die Stellen hier durch – jede neue schlägt
 * an. Ist ein Fund behoben, die Zeile hier löschen.
 *
 * Form: „Art x y z Text“ wie `checkPlan` sie meldet.
 */
export const OFFEN_BAUPLAN: readonly string[] = [];

/** Saison-Deko: alle Saisons ohne Funde (Wiesn, Winter, Ostern, Halloween). */
export const OFFEN_SAISON: Readonly<Record<string, readonly string[]>> = {};
