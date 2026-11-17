/**
 * Bekannte Funde der Bauplan-Prüfung in Teilen, an denen gerade andere arbeiten: Schlossmarkt und Schloss
 * (`schlossmarkt.ts`, Schloss-Eingang, `schloss.ts`). Der Test lässt genau diese
 * Stellen durch – jede neue schlägt an. Ist ein Fund behoben, die Zeile hier löschen.
 *
 * Form: „Art x y z Text“ wie `checkPlan` sie meldet.
 */
export const OFFEN_BAUPLAN: readonly string[] = [
  // Stützmauer am Schlossmarkt: Erde hinter der Mauer, wo der Hang schon flach ist (schlossmarkt.ts `retainingWall`),
  // und unter dem Berg hinter dem Schloss (Terrasse bei x 30, z −150)
  'erde 30 91 -150 nackte Erde, frei nach east',
  'erde -48 65 -40 nackte Erde, frei nach north, west, up',
  'erde -47 65 -40 nackte Erde, frei nach north, up',
  'erde -46 65 -40 nackte Erde, frei nach north, up',
  'erde -45 65 -40 nackte Erde, frei nach north, up',
  'erde -44 65 -40 nackte Erde, frei nach north, up',
  'erde -43 65 -40 nackte Erde, frei nach north, up',
  'erde -42 65 -40 nackte Erde, frei nach north, up',
  'erde -41 65 -40 nackte Erde, frei nach north, up',
  'erde -40 65 -40 nackte Erde, frei nach up',
  'erde -39 65 -40 nackte Erde, frei nach up',
  'erde 39 65 -40 nackte Erde, frei nach up',
  'erde 40 65 -40 nackte Erde, frei nach up',
  'erde 41 65 -40 nackte Erde, frei nach north, up',
  'erde 42 65 -40 nackte Erde, frei nach north, up',
  'erde 43 65 -40 nackte Erde, frei nach north, up',
  'erde 44 65 -40 nackte Erde, frei nach north, up',
  'erde 45 65 -40 nackte Erde, frei nach north, up',
  'erde 46 65 -40 nackte Erde, frei nach north, up',
  'erde 47 65 -40 nackte Erde, frei nach north, up',
  'erde 48 65 -40 nackte Erde, frei nach north, east, up',
  'baum -47 65 -36 Baum steht auf cobblestone (Weg/Pflaster)',
  'baum 47 65 -36 Baum steht auf stone (Weg/Pflaster)',
  'figur 30 93 -101 steckt in white_concrete, white_concrete',
  'ohne-halt -25 65 -32 Falltür berührt nichts Festes (schwebt vor der Wand)',
  'ohne-halt -3 70 -27 liegt an keiner Wand an (dahinter: air)',
  'ohne-halt -3 70 -29 liegt an keiner Wand an (dahinter: air)',
  'ohne-halt -35 65 -32 Falltür berührt nichts Festes (schwebt vor der Wand)',
  'ohne-halt -4 70 -27 liegt an keiner Wand an (dahinter: air)',
  'ohne-halt -4 70 -29 liegt an keiner Wand an (dahinter: air)',
  'ohne-halt -5 70 -27 liegt an keiner Wand an (dahinter: air)',
  'ohne-halt -5 70 -29 liegt an keiner Wand an (dahinter: air)',
  'ohne-halt 25 65 -32 Falltür berührt nichts Festes (schwebt vor der Wand)',
  'ohne-halt 3 70 -27 liegt an keiner Wand an (dahinter: air)',
  'ohne-halt 3 70 -29 liegt an keiner Wand an (dahinter: air)',
  'ohne-halt 35 65 -32 Falltür berührt nichts Festes (schwebt vor der Wand)',
  'ohne-halt 4 70 -27 liegt an keiner Wand an (dahinter: air)',
  'ohne-halt 4 70 -29 liegt an keiner Wand an (dahinter: air)',
  'ohne-halt 5 70 -27 liegt an keiner Wand an (dahinter: air)',
  'ohne-halt 5 70 -29 liegt an keiner Wand an (dahinter: air)',
  'ohne-halt 7 67 -22 liegt an keiner Wand an (dahinter: spruce_fence[north=false,east=false,south=false,west=false])',
  'schwebt -28 93 -111 1 Block/Blöcke ohne Verbindung zum Boden',
  'schwebt -5 70 -27 3 Block/Blöcke ohne Verbindung zum Boden',
  'schwebt -5 70 -29 3 Block/Blöcke ohne Verbindung zum Boden',
  'schwebt 1 93 -128 1 Block/Blöcke ohne Verbindung zum Boden',
  'schwebt 28 93 -113 1 Block/Blöcke ohne Verbindung zum Boden',
  'schwebt 3 70 -27 3 Block/Blöcke ohne Verbindung zum Boden',
  'schwebt 3 70 -29 3 Block/Blöcke ohne Verbindung zum Boden',
];

/** Saison-Deko: alle Saisons ohne Funde (Wiesn, Winter, Ostern, Halloween). */
export const OFFEN_SAISON: Readonly<Record<string, readonly string[]>> = {};
