/**
 * Bekannte Funde der Bauplan-Prüfung in Teilen, an denen gerade andere arbeiten: Schloss (`schloss.ts`). Der
 * Schlossmarkt und die Saison-Deko haben keine Funde mehr. Der Test lässt genau diese Stellen durch – jede neue schlägt
 * an. Ist ein Fund behoben, die Zeile hier löschen.
 *
 * Form: „Art x y z Text“ wie `checkPlan` sie meldet.
 */
export const OFFEN_BAUPLAN: readonly string[] = [
  // Schloss (`schloss.ts`): Erde unter dem Berg hinter der Terrasse (x 30, z −150), Rüstungsständer in der Wand,
  // schwebende Quarz-Treppen
  'erde 30 91 -150 nackte Erde, frei nach east',
  'figur 30 93 -101 steckt in white_concrete, white_concrete',
  'schwebt -28 93 -111 1 Block/Blöcke ohne Verbindung zum Boden',
  'schwebt 1 93 -128 1 Block/Blöcke ohne Verbindung zum Boden',
  'schwebt 28 93 -113 1 Block/Blöcke ohne Verbindung zum Boden',
];

/** Saison-Deko: alle Saisons ohne Funde (Wiesn, Winter, Ostern, Halloween). */
export const OFFEN_SAISON: Readonly<Record<string, readonly string[]>> = {};
