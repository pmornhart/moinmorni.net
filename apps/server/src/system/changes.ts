import type { ChangeItem, ChangeKind } from '@moinmorni/shared';

/**
 * Was sich geändert hat – aus Commit-Nachrichten gelesen, für die Update-Karte im Panel (`update.ts`) und
 * für „Was ist neu“ (`changelog.ts`). Commits haben Stichpunkte wie „- Neu: …“, „- Behoben: …“,
 * „- Verbessert: …“, „- Entfernt: …“; ein Stichpunkt ohne diese Wörter und ein Commit ganz ohne Stichpunkte
 * (nur Betreff) werden nach ihren Wörtern eingeordnet (wie in MorniHosting). Unterschrift („Verfasst mit
 * Claude“, `Co-Authored-By`, …), Merge-Kopfzeilen und Commits nur für Doku und Stand bleiben weg.
 */

/** Längere Stichpunkte werden gekürzt (manche Commits erzählen sehr ausführlich). */
const MAX_TEXT = 600;
const ELLIPSIS = '…';
const MERGE_PREFIX = 'Merge ';
/** Zeilen, die nicht zur Änderung gehören (Unterschrift, Hinweise von Git). */
const SKIP_PREFIXES = ['Verfasst mit Claude', 'Co-Authored-By:', 'Claude-Session:', 'Signed-off-by:', '#'];

// Ein Stichpunkt: "- Neu: Gefängnis" gibt "Neu: Gefängnis", "  * Teil" gibt "Teil"; "Verfasst …" nicht.
// https://regex101.com/?flavor=javascript&regex=%5E%5Cs*%5B-*%E2%80%A2%5D%5Cs%2B(.%2B)%24&testString=-%20Neu%3A%20Gef%C3%A4ngnis
const BULLET = /^\s*[-*•]\s+(.+)$/;
// Fortsetzung eines umgebrochenen Stichpunkts, eingerückt ohne Strich ("  weiter im Text" ja, "Absatz" nein).
// https://regex101.com/?flavor=javascript&regex=%5E%5Cs%2B%5CS&testString=%20%20weiter%20im%20Text
const CONTINUED = /^\s+\S/;
// Art vorn genannt: "Behoben: Bedrock-Port" gibt "Behoben" und "Bedrock-Port".
// https://regex101.com/?flavor=javascript&regex=%5E(neu%7Cbehoben%7Cverbessert%7Centfernt%7Cge%C3%A4ndert)%5Cs*%3A%5Cs*(.%2B)%24&flags=i&testString=Behoben%3A%20Bedrock-Port
const LABELLED = /^(neu|behoben|verbessert|entfernt|geändert)\s*:\s*(.+)$/i;
// Kein Teil der Änderung, sondern wie geprüft wurde: "Echt geprüft: …", "Tests: 12/12", "Hinweis: …".
// https://regex101.com/?flavor=javascript&regex=%5E(echt%20gepr%C3%BCft%7Cnicht%20gepr%C3%BCft%7Cgepr%C3%BCft%7Cgetestet%7Ctests%3F%7Chinweis%7Coffen)%5Cs*%3A&flags=i&testString=Echt%20gepr%C3%BCft%3A%20Plugin
const NOT_A_CHANGE = /^(echt geprüft|nicht geprüft|geprüft|getestet|tests?|hinweis|offen)\s*:/i;
// Commits nur für Doku und Stand: "STAND: …", "Fortschrittsseite: …", "STAND und Fortschrittsseite: …".
// https://regex101.com/?flavor=javascript&regex=%5E(STAND%7CFortschrittsseite%7CREADME%7CDoku)%5Cb&testString=STAND%3A%20Wartungs-Lobby
const DOCS_ONLY = /^(STAND|Fortschrittsseite|README|Doku)\b/;
// Markdown-Zeichen für Code: "`update.sh`" wird "update.sh".
// https://regex101.com/?flavor=javascript&regex=%60&flags=g&testString=%60update.sh%60
const BACKTICKS = /`/g;
// Mehrere Leerzeichen/Umbrüche zu einem: "a  b" → "a b".
// https://regex101.com/?flavor=javascript&regex=%5Cs%2B&flags=g&testString=a%20%20b
const SPACES = /\s+/g;

const LABEL_KINDS: Readonly<Record<string, ChangeKind>> = {
  neu: 'new',
  behoben: 'fixed',
  verbessert: 'improved',
  entfernt: 'removed',
  geändert: 'other',
};

// Wörter, die die Art eines Satzes ohne Angabe verraten; die Grenzen kennen Umlaute ((?<!\p{L}) statt \b).
// Behoben: "Funde aus dem Test behoben" passt, "Fundstück" nicht.
// https://regex101.com/?flavor=javascript&regex=(%3F%3C!%5Cp%7BL%7D)(behoben%7Crepariert%7Cfix%7Cfehler%7Cfunde%3F(%3F!%5Cp%7BL%7D)%7Cging%20nicht%7Ckam%20nicht)&flags=iu&testString=Funde%20aus%20dem%20Test%20behoben
const FIXED_WORDS = /(?<!\p{L})(behoben|repariert|fix|fehler|funde?(?!\p{L})|ging nicht|kam nicht)/iu;
// Entfernt: "Menüpunkt entfernt" passt, "Rückweg" nicht.
// https://regex101.com/?flavor=javascript&regex=(%3F%3C!%5Cp%7BL%7D)(entfernt%7Cgel%C3%B6scht%7Cweg%7Craus%7Cabgeschaltet)(%3F!%5Cp%7BL%7D)&flags=iu&testString=Men%C3%BCpunkt%20entfernt
const REMOVED_WORDS = /(?<!\p{L})(entfernt|gelöscht|weg|raus|abgeschaltet)(?!\p{L})/iu;
// Neu: "Neue Impressum-Seite" passt, "erneuert" nicht.
// https://regex101.com/?flavor=javascript&regex=(%3F%3C!%5Cp%7BL%7D)(neu%7Cneue%5Bnrs%5D%3F%7Chinzu%7Ckann%20jetzt)(%3F!%5Cp%7BL%7D)&flags=iu&testString=Neue%20Impressum-Seite
const NEW_WORDS = /(?<!\p{L})(neu|neue[nrs]?|hinzu|kann jetzt)(?!\p{L})/iu;
// Verbessert: "Start ist schneller" passt, "Besserwisser" nicht.
// https://regex101.com/?flavor=javascript&regex=(%3F%3C!%5Cp%7BL%7D)(schneller%7Cbessere%3F%5Bnrs%5D%3F%7Cweniger%7Cstabiler%7Cklarer%7Csch%C3%B6ner)(%3F!%5Cp%7BL%7D)&flags=iu&testString=Start%20ist%20schneller
const BETTER_WORDS = /(?<!\p{L})(schneller|bessere?[nrs]?|weniger|stabiler|klarer|schöner)(?!\p{L})/iu;
// Verbessert: "Proxmox-Einzeiler bequemer" passt, "verbesserungswürdig" nicht.
// https://regex101.com/?flavor=javascript&regex=(%3F%3C!%5Cp%7BL%7D)(bequemer%7Cfeinschliff%7Crobuster%7Ceinfacher%7Cverbessert%7Caufger%C3%A4umt)(%3F!%5Cp%7BL%7D)&flags=iu&testString=Proxmox-Einzeiler%20bequemer
const POLISHED_WORDS = /(?<!\p{L})(bequemer|feinschliff|robuster|einfacher|verbessert|aufgeräumt)(?!\p{L})/iu;
const GUESSES: readonly (readonly [RegExp, ChangeKind])[] = [
  [FIXED_WORDS, 'fixed'],
  [REMOVED_WORDS, 'removed'],
  [NEW_WORDS, 'new'],
  [BETTER_WORDS, 'improved'],
  [POLISHED_WORDS, 'improved'],
];

const clean = (text: string): string => {
  const plain = text.replace(BACKTICKS, '').replace(SPACES, ' ').trim();
  return plain.length > MAX_TEXT ? `${plain.slice(0, MAX_TEXT - 1).trimEnd()}${ELLIPSIS}` : plain;
};

/** Art aus den Wörtern – „other“, wenn nichts passt. */
export function guessKind(text: string): ChangeKind {
  return GUESSES.find(([words]) => words.test(text))?.[1] ?? 'other';
}

/** Ein Stichpunkt als Änderung: „Neu:“/„Behoben:“ … vorn zählt, sonst nach Wörtern; null = keine Änderung. */
function itemOf(line: string): ChangeItem | null {
  if (NOT_A_CHANGE.test(line)) return null;
  const labelled = LABELLED.exec(line);
  const text = clean(labelled ? (labelled[2] ?? '') : line);
  if (!text) return null;
  const kind = labelled ? (LABEL_KINDS[(labelled[1] ?? '').toLowerCase()] ?? 'other') : guessKind(text);
  return { kind, text };
}

const skipped = (line: string): boolean => SKIP_PREFIXES.some((prefix) => line.trim().startsWith(prefix));

/** Die Stichpunkte einer Commit-Nachricht (ohne Betreff), umgebrochene Zeilen wieder zusammengesetzt. */
export function bulletItems(message: string): ChangeItem[] {
  const bullets = message
    .split('\n')
    .slice(1)
    .filter((line) => !skipped(line))
    .reduce<{ readonly done: string[]; readonly open: boolean }>(
      (acc, line) => {
        const bullet = BULLET.exec(line);
        if (bullet) return { done: [...acc.done, bullet[1] ?? ''], open: true };
        if (acc.open && CONTINUED.test(line)) {
          const last = acc.done.length - 1;
          return { done: acc.done.map((b, i) => (i === last ? `${b} ${line.trim()}` : b)), open: true };
        }
        return { done: acc.done, open: false };
      },
      { done: [], open: false },
    ).done;
  return bullets.map(itemOf).filter((item): item is ChangeItem => item !== null);
}

/** Der Betreff als Änderung (nach Wörtern eingeordnet) – null für Merge-Kopfzeilen und reine Doku-Commits. */
export function subjectItem(message: string): ChangeItem | null {
  const subject = clean(message.split('\n')[0] ?? '');
  if (!subject || subject.startsWith(MERGE_PREFIX) || DOCS_ONLY.test(subject)) return null;
  return { kind: guessKind(subject), text: subject };
}

/** Ein reiner Doku-Commit („STAND: …“, „Fortschrittsseite: …“) zählt nicht als Änderung. */
export const docsOnly = (message: string): boolean => DOCS_ONLY.test(message.trimStart());

/** Was ein Commit geändert hat: seine Stichpunkte, sonst sein Betreff. Doku-Commits: nichts. */
export function itemsOf(message: string): ChangeItem[] {
  if (docsOnly(message)) return [];
  const bullets = bulletItems(message);
  if (bullets.length) return bullets;
  const subject = subjectItem(message);
  return subject ? [subject] : [];
}
