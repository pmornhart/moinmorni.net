import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, LogOut, MessagesSquare, X, type LucideIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { mmApi } from '~/lib/mm-api';
import { useSite } from '~/lib/site';
import { GameButton, Panel, type GameTone } from './kit';
import { EXTERNAL } from './parts';

/**
 * Pieces of the application pages on the website (MorniCraft and team): state cards, the Discord sign-in banner and
 * the form fields in the website's blocky look. Both pages share the Discord sign-in (one cookie).
 */

/** Form fields in the website's blocky look. */
export const FIELD =
  'rounded-[6px] border-2 bg-card shadow-[inset_0_3px_0_rgba(0,0,0,0.06)] dark:bg-[#0d1512]';
/** Both application pages ask the server about the sign-in; signing out refreshes both. */
export const APPLY_KEYS = [['apply'], ['team-apply']] as const;
/** Codes the server puts into "?fehler=" after the Discord sign-in. */
export const LOGIN_ERRORS = ['discord_login_off', 'discord_login_failed'] as const;
export type LoginError = (typeof LOGIN_ERRORS)[number];
export const ERROR_PARAM = 'fehler';

export function isLoginError(value: string | null): value is LoginError {
  return LOGIN_ERRORS.some((e) => e === value);
}

/** A big card with a round symbol, title and text – each state of the page is one. */
export function StateCard({
  icon: Icon,
  tone,
  title,
  children,
}: {
  readonly icon: LucideIcon;
  readonly tone: 'gold' | 'success' | 'neutral' | 'blue';
  readonly title: string;
  readonly children: ReactNode;
}): ReactElement {
  const tones = {
    gold: 'bg-gold-bright text-[#2a1b00]',
    success: 'bg-[#2fd27a] text-[#03240f]',
    neutral: 'bg-muted text-muted-foreground',
    blue: 'bg-[#2f6db3] text-white',
  } as const;
  return (
    <Panel className="grid content-start gap-5 p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <span
          className={cn(
            'grid size-14 shrink-0 place-items-center rounded-[6px] border-2 border-black/25 shadow-[inset_0_3px_0_rgba(255,255,255,0.35),inset_0_-4px_0_rgba(0,0,0,0.15)]',
            tones[tone],
          )}
          aria-hidden
        >
          <Icon className="size-7" />
        </span>
        <h2 className="pt-1 font-pixel text-[clamp(1.6rem,3.6vw,2rem)] font-bold leading-[1.05] text-balance">
          {title}
        </h2>
      </div>
      <div className="grid gap-4 text-[15.5px] leading-relaxed text-pretty">{children}</div>
    </Panel>
  );
}

export function DiscordInvite({ tone = 'stone' }: { readonly tone?: GameTone }): ReactElement | null {
  const { t } = useTranslation(MM_NAMESPACE);
  const invite = useSite().data?.discordInvite;
  if (!invite) return null;
  return (
    <GameButton asChild tone={tone} className="justify-self-start">
      <a href={invite} {...EXTERNAL}>
        <MessagesSquare />
        {t('apply.discordJoin')}
      </a>
    </GameButton>
  );
}

export function LoginBanner({
  code,
  onClose,
}: {
  readonly code: LoginError;
  readonly onClose: () => void;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-[8px] border-2 border-warning/40 bg-warning-soft px-4 py-3.5 text-warning"
    >
      <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
      <p className="flex-1 text-[15px] font-semibold leading-relaxed text-pretty">
        {t(`apply.loginError.${code}`)}
      </p>
      <button
        type="button"
        onClick={onClose}
        aria-label={t('nav.close')}
        className="-my-1 grid size-8 cursor-pointer place-items-center rounded-[4px] text-warning hover:bg-black/10"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

export function SignedIn({ name }: { readonly name: string }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: () => mmApi('/api/public/apply/logout', { method: 'POST', anonymous: true }),
    onSettled: () =>
      Promise.all(APPLY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey: [...queryKey] }))),
  });
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border-2 border-border bg-background-alt px-3.5 py-2 text-[14px]">
      <span className="flex min-w-0 items-center gap-2">
        <MessagesSquare className="size-4 shrink-0 text-blue" aria-hidden />
        <span className="min-w-0 [overflow-wrap:anywhere]">
          {t('apply.signedInAs')} <strong>{name}</strong>
        </span>
      </span>
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] px-2 py-1 font-pixel text-[13px] font-semibold uppercase tracking-[0.04em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <LogOut className="size-4" aria-hidden />
        {t('apply.logout')}
      </button>
    </div>
  );
}

export function Field({
  id,
  label,
  optional,
  help,
  problem,
  count,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly optional?: boolean;
  readonly help?: ReactNode;
  readonly problem?: string;
  readonly count?: string;
  readonly children: ReactNode;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <div className="grid content-start gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <label htmlFor={id} className="font-pixel text-[1.1rem] font-bold">
          {label}
          {optional ? (
            <span className="font-sans text-[14px] font-normal text-muted-foreground">
              {' '}
              · {t('apply.form.optional')}
            </span>
          ) : null}
        </label>
        {count ? <span className="tabular text-xs text-muted-foreground">{count}</span> : null}
      </div>
      {children}
      {problem || help ? (
        <p
          id={`${id}-help`}
          className={cn(
            'text-[13.5px] leading-snug',
            problem ? 'font-semibold text-destructive' : 'text-muted-foreground',
          )}
        >
          {problem ?? help}
        </p>
      ) : null}
    </div>
  );
}
