import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from './de.json';
import en from './en.json';

/**
 * One i18next for morni.net and the embedded MorniHosting server pages. morni.net's texts live in the namespace
 * "mm" (`useTranslation('mm')`); MorniHosting's pages use the default namespace "translation". Its texts are big
 * (about 200 KB per language), so they load only when the panel shows a server page (`loadMotorTexts`).
 * MorniHosting imports this module as "@/i18n" (alias in vite.config.ts), so it exports the same names.
 */

export const SUPPORTED_LANGUAGES = ['de', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const MM_NAMESPACE = 'mm';
const MOTOR_NAMESPACE = 'translation';
const STORAGE_KEY = 'mm-lang';
const FALLBACK: Language = 'de';

function isLanguage(value: unknown): value is Language {
  return SUPPORTED_LANGUAGES.includes(value as Language);
}

function storedLanguage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Saved choice, else the browser's language (German for every "de-…", English otherwise). */
function initialLanguage(): Language {
  const stored = storedLanguage();
  if (isLanguage(stored)) return stored;
  return navigator.language.toLowerCase().startsWith(FALLBACK) ? FALLBACK : 'en';
}

const first = initialLanguage();
document.documentElement.lang = first;

void i18n.use(initReactI18next).init({
  resources: { de: { [MM_NAMESPACE]: de }, en: { [MM_NAMESPACE]: en } },
  lng: first,
  fallbackLng: FALLBACK,
  ns: [MM_NAMESPACE, MOTOR_NAMESPACE],
  defaultNS: MOTOR_NAMESPACE,
  interpolation: { escapeValue: false },
  returnNull: false,
  // MorniHosting's option values such as "minecraft:flat" contain colons; namespaces are chosen explicitly.
  nsSeparator: false,
  showSupportNotice: false,
});

const motor = { wanted: false, loaded: new Set<Language>() };

const MOTOR_TEXTS: Readonly<Record<Language, () => Promise<{ default: Record<string, unknown> }>>> = {
  de: () => import('@/i18n/de.json'),
  en: () => import('@/i18n/en.json'),
};

async function loadMotorLanguage(language: Language): Promise<void> {
  if (motor.loaded.has(language)) return;
  const { default: texts } = await MOTOR_TEXTS[language]();
  i18n.addResourceBundle(language, MOTOR_NAMESPACE, texts, true, true);
  motor.loaded.add(language);
}

/** Makes sure the texts of `language` are there (MorniHosting's only once its pages are in use). */
export async function ensureLanguage(language: Language): Promise<void> {
  if (!motor.wanted) return;
  // English falls back to German for texts that are not translated yet.
  await Promise.all([loadMotorLanguage(FALLBACK), loadMotorLanguage(language)]);
}

/** The panel calls this before it shows MorniHosting's pages. */
export async function loadMotorTexts(): Promise<void> {
  motor.wanted = true;
  await ensureLanguage(currentLanguage());
}

export function currentLanguage(): Language {
  return isLanguage(i18n.language) ? i18n.language : FALLBACK;
}

/** morni.net's language switch: shows `language` and remembers it in this browser. */
export function chooseLanguage(language: Language): void {
  document.documentElement.lang = language;
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Private windows may refuse storage; the language still applies to this visit.
  }
  void (async () => {
    await ensureLanguage(language);
    await i18n.changeLanguage(language);
  })();
}

/**
 * The name MorniHosting's pages call with the language stored in their session (e.g. right after turning on
 * two-factor login). In the panel morni.net's own switch decides the language, so this never switches – it only makes
 * sure MorniHosting's texts for the language shown are there.
 */
export function setLanguage(_language: Language): void {
  void ensureLanguage(currentLanguage());
}

export default i18n;
