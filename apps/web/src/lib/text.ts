import type { Text } from '@moinmorni/shared';
import { useTranslation } from 'react-i18next';
import { MM_NAMESPACE, type Language } from '~/i18n';

/** Picks the German or English variant of a catalog text. */
export function pick(text: Text, language: Language): string {
  return language === 'en' ? text.en : text.de;
}

/** The language shown right now. */
export function useLanguage(): Language {
  const { i18n } = useTranslation(MM_NAMESPACE);
  return i18n.language === 'en' ? 'en' : 'de';
}

/** `pick` with the language currently shown. */
export function usePick(): (text: Text) => string {
  const language = useLanguage();
  return (text) => pick(text, language);
}
