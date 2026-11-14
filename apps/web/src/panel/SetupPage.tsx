import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogIn, Sparkles } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import type { LoginResponse } from '@mornihosting/shared';
import { api } from '@/lib/api';
import { meQuery } from '@/features/auth/session';
import { FieldBlock } from '~/components/controls';
import { Button, Input, Kbd, NativeSelect, Skeleton } from '~/components/ui';
import { MM_NAMESPACE, setLanguage, SUPPORTED_LANGUAGES, type Language } from '~/i18n';
import { useErrorText } from '~/lib/errors';
import { mmApi } from '~/lib/mm-api';
import { useLanguage } from '~/lib/text';
import { AuthFrame, FormError } from './AuthFrame';
import { PANEL_ME_KEY, SETUP_KEY, useSetupQuery } from './session';

// A name of 3–32 letters, digits, ".", "-" or "_": accepts "Philip_M", rejects "ph" and "Philip M".
// https://regex101.com/?flavor=javascript&regex=%5E%5Ba-zA-Z0-9_.-%5D%7B3%2C32%7D%24&testString=Philip_M
const USERNAME = /^[a-zA-Z0-9_.-]{3,32}$/;
const PASSWORD_MIN = 10;
const SETUP_CODE_COMMAND = 'docker exec moinmorni cat /data/setup-code';

/** What still keeps the form from being sent, as a text key (null = all good). */
function problemOf(code: string, username: string, password: string, repeat: string): string | null {
  if (!code.trim()) return 'setup.codeMissing';
  if (!USERNAME.test(username)) return 'setup.nameInvalid';
  if (password.length < PASSWORD_MIN) return 'setup.passwordShort';
  if (password !== repeat) return 'setup.mismatch';
  return null;
}

/**
 * First start: create the owner account with the setup code from the installation, then sign in right away.
 * Before any sign-in there is no CSRF token, so the setup request goes without one.
 */
export function SetupPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setup = useSetupQuery();
  const shown = useLanguage();
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [locale, setLocale] = useState<Language>(shown);
  const [tried, setTried] = useState(false);

  const create = useMutation({
    mutationFn: async () => {
      await mmApi<{ readonly ok: boolean }>('/api/setup', {
        method: 'POST',
        body: { code: code.trim(), username, password, locale },
        anonymous: true,
      });
      // The account exists now; if signing in fails, the sign-in page takes over.
      try {
        return await api<LoginResponse>('/api/auth/login', { method: 'POST', body: { username, password } });
      } catch {
        return null;
      }
    },
    onSuccess: async (result) => {
      setLanguage(locale);
      if (result?.status === 'ok') queryClient.setQueryData(meQuery.queryKey, result.me);
      queryClient.setQueryData(SETUP_KEY, { required: false });
      await queryClient.invalidateQueries({ queryKey: PANEL_ME_KEY });
      navigate('/', { replace: true });
    },
    onError: () => undefined,
  });

  if (setup.isPending) {
    return (
      <AuthFrame>
        <Skeleton className="h-96 rounded-[16px]" />
      </AuthFrame>
    );
  }

  if (setup.data && !setup.data.required) {
    return (
      <AuthFrame>
        <div className="grid gap-4">
          <h1 className="font-display text-[2rem] font-semibold leading-tight">{t('setup.doneTitle')}</h1>
          <p className="text-muted-foreground">{t('setup.doneText')}</p>
          <Button asChild size="lg">
            <Link to="/">
              <LogIn />
              {t('setup.toLogin')}
            </Link>
          </Button>
        </div>
      </AuthFrame>
    );
  }

  const problem = problemOf(code, username, password, repeat);
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    setTried(true);
    if (!problem) create.mutate();
  };

  return (
    <AuthFrame>
      <form onSubmit={submit} className="grid gap-5" noValidate>
        <div className="grid gap-2">
          <span className="grid size-12 place-items-center rounded-[14px] bg-gold-soft text-gold" aria-hidden>
            <Sparkles className="size-6" />
          </span>
          <h1 className="font-display text-[2rem] font-semibold leading-tight">{t('setup.title')}</h1>
          <p className="text-muted-foreground">{t('setup.text')}</p>
        </div>
        <FieldBlock
          id="setup-code"
          label={t('setup.code')}
          help={
            <span className="grid gap-1.5">
              {t('setup.codeHelp')}
              <Kbd className="justify-self-start">{SETUP_CODE_COMMAND}</Kbd>
            </span>
          }
        >
          <Input
            id="setup-code"
            autoFocus
            autoComplete="one-time-code"
            spellCheck={false}
            className="font-mono tracking-[0.08em]"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </FieldBlock>
        <FieldBlock id="setup-name" label={t('setup.username')} help={t('setup.usernameHelp')}>
          <Input
            id="setup-name"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </FieldBlock>
        <FieldBlock id="setup-password" label={t('setup.password')} help={t('setup.passwordHelp')}>
          <Input
            id="setup-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FieldBlock>
        <FieldBlock id="setup-repeat" label={t('setup.passwordRepeat')}>
          <Input
            id="setup-repeat"
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </FieldBlock>
        <FieldBlock id="setup-language" label={t('setup.language')}>
          <NativeSelect
            id="setup-language"
            value={locale}
            onChange={(e) => {
              const next = SUPPORTED_LANGUAGES.find((l) => l === e.target.value) ?? 'de';
              setLocale(next);
              setLanguage(next);
            }}
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {t(`language.${l}`)}
              </option>
            ))}
          </NativeSelect>
        </FieldBlock>
        {tried && problem ? <FormError>{t(problem)}</FormError> : null}
        {create.error ? <FormError>{errorText(create.error)}</FormError> : null}
        <Button type="submit" size="lg" variant="gold" disabled={create.isPending}>
          <Sparkles />
          {create.isPending ? t('setup.busy') : t('setup.submit')}
        </Button>
      </form>
    </AuthFrame>
  );
}
