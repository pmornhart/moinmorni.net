import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogIn, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { LoginResponse } from '@mornihosting/shared';
import { api } from '@/lib/api';
import { passkeysUsable, signInWithPasskey } from '@/features/auth/passkey';
import { meQuery, statusQuery } from '@/features/auth/session';
import { FieldBlock } from '~/components/controls';
import { Button, Input } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { useErrorText } from '~/lib/errors';
import { AuthFrame, FormError } from './AuthFrame';
import { PANEL_ME_KEY } from './session';

// Keeps digits only: "12 34-56" → "123456"; "abc" → "".
// https://regex101.com/?flavor=javascript&regex=%5CD&flags=g&testString=12%2034-56
const NOT_A_DIGIT = /\D/g;
const CODE_LENGTH = 6;

/**
 * Sign in to the panel. The accounts live in the motor (MorniHosting): password, then the 6-digit code if two-step
 * sign-in is on, or a passkey. The motor's session cookie then also opens MoinMorni's panel.
 */
export function LoginPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const status = useQuery(statusQuery);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'password' | 'code'>('password');

  const finish = async (result: LoginResponse): Promise<void> => {
    if (result.status === 'two-factor') {
      setStep('code');
      return;
    }
    queryClient.setQueryData(meQuery.queryKey, result.me);
    await queryClient.invalidateQueries({ queryKey: PANEL_ME_KEY });
  };

  const login = useMutation({
    mutationFn: () => api<LoginResponse>('/api/auth/login', { method: 'POST', body: { username, password } }),
    onSuccess: finish,
    onError: () => undefined,
  });
  const verify = useMutation({
    mutationFn: () => api<LoginResponse>('/api/auth/two-factor', { method: 'POST', body: { code } }),
    onSuccess: finish,
    onError: () => undefined,
  });
  const passkey = useMutation({ mutationFn: signInWithPasskey, onSuccess: finish, onError: () => undefined });

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    passkey.reset();
    if (step === 'password') login.mutate();
    else verify.mutate();
  };
  const error = step === 'password' ? (login.error ?? passkey.error) : verify.error;
  const busy = login.isPending || verify.isPending || passkey.isPending;
  const passkeyReady = step === 'password' && status.data !== undefined && passkeysUsable(status.data);

  return (
    <AuthFrame>
      <form onSubmit={submit} className="grid gap-5" noValidate>
        {step === 'password' ? (
          <>
            <div className="grid gap-1.5">
              <h1 className="font-display text-[2rem] font-semibold leading-tight">{t('login.title')}</h1>
              <p className="text-muted-foreground">{t('login.subtitle')}</p>
            </div>
            <FieldBlock id="username" label={t('login.username')}>
              <Input
                id="username"
                autoComplete="username webauthn"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </FieldBlock>
            <FieldBlock id="password" label={t('login.password')}>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </FieldBlock>
          </>
        ) : (
          <>
            <div className="grid gap-2">
              <span
                className="grid size-12 place-items-center rounded-[14px] bg-gold-soft text-gold"
                aria-hidden
              >
                <ShieldCheck className="size-6" />
              </span>
              <h1 className="font-display text-[2rem] font-semibold leading-tight">
                {t('login.twoFactorTitle')}
              </h1>
              <p className="text-muted-foreground">{t('login.twoFactorText')}</p>
            </div>
            <FieldBlock id="code" label={t('login.code')}>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={CODE_LENGTH}
                className="h-14 text-center font-mono text-2xl tracking-[0.45em]"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(NOT_A_DIGIT, ''))}
              />
            </FieldBlock>
          </>
        )}
        {error ? <FormError>{errorText(error)}</FormError> : null}
        <Button type="submit" size="lg" disabled={busy}>
          {step === 'password' ? <LogIn /> : <ShieldCheck />}
          {busy ? t('login.busy') : t(step === 'password' ? 'login.submit' : 'login.twoFactorSubmit')}
        </Button>
        {passkeyReady ? (
          <>
            <div
              className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"
              aria-hidden
            >
              <span className="h-px flex-1 bg-border" />
              {t('login.or')}
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              disabled={busy}
              onClick={() => {
                login.reset();
                passkey.mutate();
              }}
            >
              <KeyRound />
              {passkey.isPending ? t('login.passkeyWaiting') : t('login.passkey')}
            </Button>
            <p className="text-center text-[13px] leading-snug text-muted-foreground">
              {t('login.passkeyHint')}
            </p>
          </>
        ) : null}
        {step === 'code' ? (
          <Button variant="ghost" onClick={() => setStep('password')}>
            {t('login.backToLogin')}
          </Button>
        ) : (
          <p className="border-t border-border pt-4 text-center text-[13px] text-muted-foreground">
            {t('login.forTeam')}
          </p>
        )}
      </form>
    </AuthFrame>
  );
}
