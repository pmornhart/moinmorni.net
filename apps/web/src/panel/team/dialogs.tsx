import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertDialog, Dialog as DialogPrimitive } from 'radix-ui';
import { Check, Copy, Info, KeyRound, UserPlus, X, type LucideIcon } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PANEL_AREAS, type Role } from '@moinmorni/shared';
import { FieldBlock, useCopy } from '~/components/controls';
import { RoleBadge } from '~/components/role-visuals';
import { Button, Input } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useErrorText } from '~/lib/errors';
import { mmApi } from '~/lib/mm-api';
import { useLanguage } from '~/lib/text';
import { TEAM_KEY, type CreatedMember } from './model';

/** Limits of the team API (apps/server/src/panel/team-routes.ts). */
const USERNAME_MIN = 3;
const USERNAME_MAX = 32;
const EMAIL_MAX = 254;
// A username like the motor takes it: letters, digits, dot, underscore, dash – "lena.mod" fits, "lena mod" not.
// https://regex101.com/?flavor=javascript&regex=%5E%5Ba-zA-Z0-9._-%5D%2B%24&testString=lena.mod%0Alena%20mod
const USERNAME = /^[a-zA-Z0-9._-]+$/;

const OVERLAY = 'fixed inset-0 z-40 bg-black/55 data-[state=open]:animate-in data-[state=open]:fade-in-0';
const CONTENT =
  'fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-[20px] border border-border bg-popover p-5 text-popover-foreground shadow-float data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:p-6';

/** What someone needs to sign in for the first time (after a new account or a password reset). */
export interface AccessData {
  readonly username: string;
  readonly password: string;
  readonly kind: 'created' | 'reset';
}

/** The panel's sign-in address on this site, e.g. "https://moinmorni.net/panel". */
export function loginAddress(): string {
  return `${window.location.origin}/panel`;
}

function DialogHead({
  icon: Icon,
  title,
  text,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly text: string;
}): ReactElement {
  return (
    <div className="flex items-start gap-3.5 pr-10">
      <span
        className="grid size-11 shrink-0 place-items-center rounded-[13px] bg-gold-soft text-gold"
        aria-hidden
      >
        <Icon className="size-[22px]" />
      </span>
      <div className="grid min-w-0 gap-1">
        <DialogPrimitive.Title className="font-display text-2xl font-semibold leading-tight text-balance">
          {title}
        </DialogPrimitive.Title>
        <DialogPrimitive.Description className="text-sm text-muted-foreground text-pretty">
          {text}
        </DialogPrimitive.Description>
      </div>
    </div>
  );
}

function CloseCross(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <DialogPrimitive.Close asChild>
      <Button variant="ghost" size="iconSm" className="absolute right-4 top-4" aria-label={t('nav.close')}>
        <X />
      </Button>
    </DialogPrimitive.Close>
  );
}

/** One line of the access data: label, value in the mono face and a copy button. */
function AccessRow({
  label,
  copyLabel,
  value,
  big = false,
}: {
  readonly label: string;
  /** Name of the copy button for screen readers and the tooltip ("Startpasswort kopieren"). */
  readonly copyLabel: string;
  readonly value: string;
  readonly big?: boolean;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const { copied, copy } = useCopy(value);
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <code
          className={cn(
            'min-w-0 flex-1 rounded-[12px] border border-border bg-muted/60 px-3 py-2.5 font-mono [overflow-wrap:anywhere] sm:px-3.5',
            big
              ? 'text-[1.3rem] font-semibold tracking-[0.04em] sm:text-[1.6rem]'
              : 'text-[12.5px] sm:text-[14px]',
          )}
        >
          {value}
        </code>
        {/* On phones only the icon, so the start password keeps to one line. */}
        <Button
          variant="secondary"
          onClick={copy}
          aria-label={copyLabel}
          title={copyLabel}
          aria-live="polite"
          className="size-10 px-0 sm:w-auto sm:min-w-[7.5rem] sm:px-4"
        >
          {copied ? <Check /> : <Copy />}
          <span className="hidden sm:inline">{copied ? t('copy.done') : t('copy.action')}</span>
        </Button>
      </div>
    </div>
  );
}

/** The start password, shown once – big, with copy buttons and what happens at the first sign-in. */
function AccessView({ data }: { readonly data: AccessData }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const address = loginAddress();
  const all = useCopy(
    t('teamAdmin.result.allText', { address, username: data.username, password: data.password }),
  );
  const name = data.username;
  return (
    <>
      <DialogHead
        icon={KeyRound}
        title={
          data.kind === 'created'
            ? t('teamAdmin.result.createdTitle', { name })
            : t('teamAdmin.result.resetTitle', { name })
        }
        text={t('teamAdmin.result.text', { name })}
      />
      <div className="grid gap-4 rounded-[16px] border border-border bg-card p-3.5 sm:p-5">
        <AccessRow
          label={t('teamAdmin.result.address')}
          copyLabel={t('teamAdmin.result.copyAddress')}
          value={address}
        />
        <AccessRow
          label={t('teamAdmin.result.username')}
          copyLabel={t('teamAdmin.result.copyUsername')}
          value={data.username}
        />
        <AccessRow
          label={t('teamAdmin.result.password')}
          copyLabel={t('teamAdmin.result.copyPassword')}
          value={data.password}
          big
        />
      </div>
      <p className="flex items-start gap-2.5 rounded-[12px] bg-warning-soft px-3.5 py-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <span>{t('teamAdmin.result.change', { name })}</span>
      </p>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <Button variant="secondary" onClick={all.copy} aria-live="polite">
          {all.copied ? <Check /> : <Copy />}
          {all.copied ? t('copy.done') : t('teamAdmin.result.copyAll')}
        </Button>
        <DialogPrimitive.Close asChild>
          <Button>{t('teamAdmin.result.done')}</Button>
        </DialogPrimitive.Close>
      </div>
    </>
  );
}

/** The window with the start password after a password reset. */
export function AccessDialog({
  data,
  onClose,
}: {
  readonly data: AccessData | null;
  readonly onClose: () => void;
}): ReactElement {
  return (
    <DialogPrimitive.Root open={data !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={OVERLAY} />
        <DialogPrimitive.Content
          className={cn(CONTENT, 'max-w-[560px]')}
          onInteractOutside={(e) => e.preventDefault()}
        >
          {data ? <AccessView data={data} /> : null}
          <CloseCross />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** "Sieht: Übersicht, Spieler, Strafen" – or "sieht alles" for roles with every area. */
function useAreaSummary(): (role: Role) => string {
  const { t } = useTranslation(MM_NAMESPACE);
  const language = useLanguage();
  const list = new Intl.ListFormat(language, { type: 'conjunction' });
  return (role) =>
    role.panel.length >= PANEL_AREAS.length
      ? t('teamAdmin.create.seesAll')
      : t('teamAdmin.create.sees', { areas: list.format(role.panel.map((a) => t(`roles.areas.${a}`))) });
}

function RoleChoice({
  roles,
  value,
  onChange,
}: {
  readonly roles: readonly Role[];
  readonly value: string;
  readonly onChange: (id: string) => void;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const summary = useAreaSummary();
  const name = useId();
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1.5 text-sm font-semibold">{t('teamAdmin.create.role')}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {roles.map((role) => (
          <label
            key={role.id}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-[14px] border px-3.5 py-3 transition-colors',
              value === role.id
                ? 'border-primary bg-accent ring-3 ring-primary/15'
                : 'border-input bg-secondary/60 hover:bg-muted',
            )}
          >
            <input
              type="radio"
              name={name}
              value={role.id}
              checked={value === role.id}
              onChange={() => onChange(role.id)}
              className="mt-1 size-4 shrink-0 accent-primary"
            />
            <span className="grid min-w-0 gap-1">
              <RoleBadge role={role} className="text-[13px]" />
              <span className="text-[13px] leading-snug text-muted-foreground">{summary(role)}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="text-[13px] leading-snug text-muted-foreground">{t('teamAdmin.create.roleHelp')}</p>
    </fieldset>
  );
}

function CreateForm({
  roles,
  onCreated,
}: {
  readonly roles: readonly Role[];
  readonly onCreated: (data: AccessData) => void;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const language = useLanguage();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const id = useId();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  // Nothing chosen beforehand: the role is a conscious choice.
  const [roleId, setRoleId] = useState('');
  const name = username.trim();
  const nameValid = name.length >= USERNAME_MIN && USERNAME.test(name);
  const showNameProblem = name.length > 0 && !nameValid;
  const valid = nameValid && roles.some((r) => r.id === roleId);

  const create = useMutation({
    mutationFn: () =>
      mmApi<CreatedMember>('/api/panel/team', {
        method: 'POST',
        body: {
          username: name,
          roleId,
          locale: language,
          ...(email.trim() ? { email: email.trim() } : {}),
        },
      }),
    onSuccess: async (result) => {
      onCreated({ username: result.member?.username ?? name, password: result.password, kind: 'created' });
      await queryClient.invalidateQueries({ queryKey: TEAM_KEY });
    },
    onError: () => undefined,
  });

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    if (valid && !create.isPending) create.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <FieldBlock
        id={`${id}-name`}
        label={t('teamAdmin.create.username')}
        help={
          showNameProblem ? (
            <span className="text-destructive">{t('teamAdmin.create.usernameInvalid')}</span>
          ) : (
            t('teamAdmin.create.usernameHelp')
          )
        }
      >
        <Input
          id={`${id}-name`}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={USERNAME_MAX}
          placeholder={t('teamAdmin.create.usernamePlaceholder')}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          aria-invalid={showNameProblem}
          autoFocus
        />
      </FieldBlock>
      <FieldBlock
        id={`${id}-mail`}
        label={t('teamAdmin.create.email')}
        help={t('teamAdmin.create.emailHelp')}
      >
        <Input
          id={`${id}-mail`}
          type="email"
          autoComplete="off"
          maxLength={EMAIL_MAX}
          placeholder={t('teamAdmin.create.emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FieldBlock>
      {roles.length ? (
        <RoleChoice roles={roles} value={roleId} onChange={setRoleId} />
      ) : (
        <p className="rounded-[12px] bg-muted/70 px-3.5 py-3 text-sm">{t('teamAdmin.create.noRoles')}</p>
      )}
      {create.isError ? (
        <p role="alert" className="rounded-[12px] bg-destructive-soft px-3.5 py-2.5 text-sm text-destructive">
          {errorText(create.error)}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <DialogPrimitive.Close asChild>
          <Button variant="ghost">{t('teamAdmin.cancel')}</Button>
        </DialogPrimitive.Close>
        <Button type="submit" disabled={!valid || create.isPending}>
          <UserPlus />
          {create.isPending ? t('teamAdmin.create.busy') : t('teamAdmin.create.submit')}
        </Button>
      </div>
    </form>
  );
}

/** Steps 1 and 2 of a new team account: the form, then the start password (once). */
function CreateBody({ roles }: { readonly roles: readonly Role[] }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const [access, setAccess] = useState<AccessData | null>(null);
  if (access) return <AccessView data={access} />;
  return (
    <>
      <DialogHead icon={UserPlus} title={t('teamAdmin.create.title')} text={t('teamAdmin.create.text')} />
      <CreateForm roles={roles} onCreated={setAccess} />
    </>
  );
}

/** "Konto anlegen": a button that opens the form; afterwards the same window shows the start password. */
export function CreateMemberDialog({ roles }: { readonly roles: readonly Role[] }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>
        <Button data-testid="team-add">
          <UserPlus />
          {t('teamAdmin.add')}
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={OVERLAY} />
        <DialogPrimitive.Content
          className={cn(CONTENT, 'max-w-[560px]')}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <CreateBody roles={roles} />
          <CloseCross />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Asks once more before something changes an account; `children` may add an option (e.g. a switch). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  text,
  confirm,
  icon: Icon,
  danger = false,
  busy,
  onConfirm,
  children,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly text: string;
  readonly confirm: string;
  readonly icon: LucideIcon;
  readonly danger?: boolean;
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly children?: ReactNode;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-[18px] border border-border bg-popover p-6 text-popover-foreground shadow-float data-[state=open]:animate-in data-[state=open]:zoom-in-95">
          <AlertDialog.Title className="font-display text-xl font-semibold leading-tight text-balance">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-muted-foreground text-pretty">
            {text}
          </AlertDialog.Description>
          {children}
          <div className="flex flex-wrap justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="ghost">{t('teamAdmin.cancel')}</Button>
            </AlertDialog.Cancel>
            <Button
              variant={danger ? 'danger' : 'primary'}
              className={danger ? 'border-destructive bg-destructive-soft' : undefined}
              onClick={onConfirm}
              disabled={busy}
            >
              <Icon />
              {confirm}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
