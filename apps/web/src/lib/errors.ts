import { useTranslation } from 'react-i18next';
import { MM_NAMESPACE } from '~/i18n';

const HTTP_TOO_MANY = 429;
const NETWORK = 'network';
const GENERIC = 'generic';
/** Browser errors from a passkey dialog, by their DOMException name. */
const WEBAUTHN_CODES: Readonly<Record<string, string>> = {
  NotAllowedError: 'passkey_cancelled',
  AbortError: 'passkey_cancelled',
};

function hasCode(err: unknown): err is { readonly code: string; readonly status?: number } {
  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';
}

/**
 * The error code behind an error from morni.net's API, the motor's API (MorniHosting's ApiError has the same
 * shape) or a passkey dialog.
 */
export function errorCode(err: unknown): string {
  if (hasCode(err)) return err.status === HTTP_TOO_MANY ? 'too_many' : err.code;
  if (err instanceof Error && Object.hasOwn(WEBAUTHN_CODES, err.name))
    return WEBAUTHN_CODES[err.name] ?? GENERIC;
  if (err instanceof TypeError) return NETWORK;
  return GENERIC;
}

/** A friendly sentence for any error (texts under errors.* in morni.net's namespace). */
export function useErrorText(): (err: unknown) => string {
  const { t, i18n } = useTranslation(MM_NAMESPACE);
  return (err) => {
    const key = `errors.${errorCode(err)}`;
    return i18n.exists(key, { ns: MM_NAMESPACE }) ? t(key) : t('errors.generic');
  };
}
