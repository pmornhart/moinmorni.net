import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  CalendarPlus,
  Fingerprint,
  Gamepad2,
  KeyRound,
  Lock,
  LockOpen,
  LogIn,
  Mail,
  MessageCircle,
  ShieldCheck,
  ShieldHalf,
  Trash2,
  UserCog,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { Role } from '@moinmorni/shared';
import { MinecraftHead } from '~/components/minecraft-head';
import { RoleBadge } from '~/components/role-visuals';
import { Select } from '~/components/select';
import { Button, Card, Kbd, Pill, Skeleton, Switch } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useErrorText } from '~/lib/errors';
import { mmApi } from '~/lib/mm-api';
import { usePick } from '~/lib/text';
import { useTimeText } from '~/lib/time';
import { AreaGate } from '../AreaGate';
import { PageHead } from '../PanelShell';
import { usePanel, useRolesQuery } from '../session';
import { AccessDialog, ConfirmDialog, CreateMemberDialog, loginAddress, type AccessData } from './dialogs';
import { assignableRoles, TEAM_KEY, useTeamQuery, type TeamMember } from './model';

const SKELETON_ROWS = ['a', 'b', 'c'];
/** "Sperren" and "Entsperren" take the same room, so the rows line up. */
const LOCK_BUTTON = 'sm:min-w-[7.25rem]';

type Confirm = 'reset' | 'disable' | 'remove' | null;

/** Small fact under a name: icon + text. */
function Fact({
  icon: Icon,
  children,
}: {
  readonly icon: LucideIcon;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

function MemberFlags({ member }: { readonly member: TeamMember }): ReactElement | null {
  const { t } = useTranslation(MM_NAMESPACE);
  if (!member.twoFactor && !member.mustChangePassword && !member.disabled) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {member.disabled ? (
        <Pill tone="danger" className="gap-1">
          <Ban className="size-3" aria-hidden />
          {t('teamAdmin.disabled')}
        </Pill>
      ) : null}
      {member.mustChangePassword ? (
        <span title={t('teamAdmin.startPasswordHelp')}>
          <Pill tone="warning" className="gap-1">
            <KeyRound className="size-3" aria-hidden />
            {t('teamAdmin.startPassword')}
          </Pill>
        </span>
      ) : null}
      {member.twoFactor ? (
        <span title={t('teamAdmin.twoFactorHelp')}>
          <Pill tone="success" className="gap-1">
            <ShieldCheck className="size-3" aria-hidden />
            {t('teamAdmin.twoFactor')}
          </Pill>
        </span>
      ) : null}
    </span>
  );
}

/** Role, password, lock and remove – only for accounts below one's own role. */
function MemberActions({
  member,
  role,
  roles,
}: {
  readonly member: TeamMember;
  /** The member's role right now. */
  readonly role: Role | undefined;
  /** Roles this person may give. */
  readonly roles: readonly Role[];
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [removeFactors, setRemoveFactors] = useState(false);
  const [access, setAccess] = useState<AccessData | null>(null);
  const name = member.username;
  const refresh = (): Promise<void> => queryClient.invalidateQueries({ queryKey: TEAM_KEY });
  const fail = (err: unknown): void => {
    toast.error(errorText(err));
  };

  const changeRole = useMutation({
    mutationFn: (roleId: string) =>
      mmApi(`/api/panel/team/${member.id}`, { method: 'PATCH', body: { roleId } }),
    onSuccess: async (_result, roleId) => {
      const role = roles.find((r) => r.id === roleId);
      toast.success(t('teamAdmin.roleChanged', { name, role: role ? pick(role.name) : roleId }));
      await refresh();
    },
    onError: fail,
  });
  const reset = useMutation({
    mutationFn: () =>
      mmApi<{ password: string }>(`/api/panel/team/${member.id}/reset-password`, {
        method: 'POST',
        body: { removeSecondFactors: removeFactors },
      }),
    onSuccess: async ({ password }) => {
      setConfirm(null);
      setRemoveFactors(false);
      setAccess({ username: name, password, kind: 'reset' });
      await refresh();
    },
    onError: fail,
  });
  const lock = useMutation({
    mutationFn: (disabled: boolean) =>
      mmApi(`/api/panel/team/${member.id}/disabled`, { method: 'PUT', body: { disabled } }),
    onSuccess: async (_result, disabled) => {
      setConfirm(null);
      toast.success(disabled ? t('teamAdmin.disabledDone', { name }) : t('teamAdmin.enabledDone', { name }));
      await refresh();
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: () => mmApi(`/api/panel/team/${member.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setConfirm(null);
      toast.success(t('teamAdmin.removedDone', { name }));
      await refresh();
    },
    onError: fail,
  });
  const close = (open: boolean): void => {
    if (!open) setConfirm(null);
  };
  // A role that can no longer be given (e.g. it lost its panel areas) still shows as the current one.
  const options = role && !roles.includes(role) ? [role, ...roles] : roles;

  return (
    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
      <label htmlFor={`role-${member.id}`} className="sr-only">
        {t('teamAdmin.roleLabel', { name })}
      </label>
      <Select
        id={`role-${member.id}`}
        size="sm"
        className="min-w-0 flex-1 basis-40 sm:w-44 sm:flex-none"
        value={member.roleId}
        disabled={changeRole.isPending}
        onChange={(e) => changeRole.mutate(e.target.value)}
      >
        {options.map((r) => (
          <option key={r.id} value={r.id} disabled={!roles.includes(r)}>
            {r.symbol ? `${r.symbol} ` : ''}
            {pick(r.name)}
          </option>
        ))}
      </Select>
      <div className="flex flex-wrap gap-1.5">
        <Button variant="secondary" size="sm" onClick={() => setConfirm('reset')}>
          <KeyRound />
          {t('teamAdmin.resetPassword')}
        </Button>
        {member.disabled ? (
          <Button
            variant="secondary"
            size="sm"
            className={LOCK_BUTTON}
            onClick={() => lock.mutate(false)}
            disabled={lock.isPending}
          >
            <LockOpen />
            {t('teamAdmin.enable')}
          </Button>
        ) : (
          <Button variant="secondary" size="sm" className={LOCK_BUTTON} onClick={() => setConfirm('disable')}>
            <Lock />
            {t('teamAdmin.disable')}
          </Button>
        )}
        <Button
          variant="danger"
          size="iconSm"
          onClick={() => setConfirm('remove')}
          aria-label={t('teamAdmin.removeLabel', { name })}
          title={t('teamAdmin.removeLabel', { name })}
        >
          <Trash2 />
        </Button>
      </div>

      <ConfirmDialog
        open={confirm === 'reset'}
        onOpenChange={close}
        title={t('teamAdmin.reset.title', { name })}
        text={t('teamAdmin.reset.text', { name })}
        confirm={t('teamAdmin.reset.confirm')}
        icon={KeyRound}
        busy={reset.isPending}
        onConfirm={() => reset.mutate()}
      >
        <label className="flex cursor-pointer items-start gap-3 rounded-[12px] border border-border bg-muted/50 px-3.5 py-3">
          <Switch
            checked={removeFactors}
            onCheckedChange={setRemoveFactors}
            className="mt-0.5"
            aria-describedby={`factors-${member.id}`}
          />
          <span className="grid gap-0.5">
            <span className="text-sm font-semibold">{t('teamAdmin.reset.secondFactors')}</span>
            <span id={`factors-${member.id}`} className="text-[13px] leading-snug text-muted-foreground">
              {t('teamAdmin.reset.secondFactorsHelp', { name })}
            </span>
          </span>
        </label>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'disable'}
        onOpenChange={close}
        title={t('teamAdmin.disableConfirm.title', { name })}
        text={t('teamAdmin.disableConfirm.text', { name })}
        confirm={t('teamAdmin.disableConfirm.confirm')}
        icon={Lock}
        danger
        busy={lock.isPending}
        onConfirm={() => lock.mutate(true)}
      />
      <ConfirmDialog
        open={confirm === 'remove'}
        onOpenChange={close}
        title={t('teamAdmin.removeConfirm.title', { name })}
        text={t('teamAdmin.removeConfirm.text', { name })}
        confirm={t('teamAdmin.removeConfirm.confirm')}
        icon={Trash2}
        danger
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
      <AccessDialog data={access} onClose={() => setAccess(null)} />
    </div>
  );
}

function MemberRow({
  member,
  role,
  assignable,
}: {
  readonly member: TeamMember;
  readonly role: Role | undefined;
  readonly assignable: readonly Role[];
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
  return (
    <li
      className={cn(
        'grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center',
        member.disabled && 'bg-muted/40',
      )}
    >
      <div className="flex min-w-0 items-start gap-3.5">
        <MinecraftHead
          uuid={member.minecraft?.uuid ?? null}
          name={member.username}
          className={cn('size-11 rounded-[12px] bg-muted text-lg', member.disabled && 'opacity-60')}
          letterClassName="text-muted-foreground"
        />
        <div className="grid min-w-0 flex-1 gap-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="min-w-0 truncate text-[15px] font-bold">{member.username}</span>
            {member.self ? <Pill tone="gold">{t('teamAdmin.you')}</Pill> : null}
            {role ? <RoleBadge role={role} /> : <Pill>{member.roleId}</Pill>}
            <MemberFlags member={member} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
            <Fact icon={LogIn}>
              {member.lastLoginAt
                ? t('teamAdmin.lastLogin', { time: time.relative(member.lastLoginAt) })
                : t('teamAdmin.neverLoggedIn')}
            </Fact>
            <Fact icon={Gamepad2}>
              {member.minecraft?.name
                ? t(member.minecraft.confirmed ? 'teamAdmin.minecraftOk' : 'teamAdmin.minecraftUnconfirmed', {
                    name: member.minecraft.name,
                  })
                : t('teamAdmin.noMinecraft')}
            </Fact>
            <Fact icon={MessageCircle}>
              {member.discord
                ? t('teamAdmin.discordOk', { name: member.discord.name })
                : t('teamAdmin.noDiscord')}
            </Fact>
            {member.email ? <Fact icon={Mail}>{member.email}</Fact> : null}
            <Fact icon={CalendarPlus}>{t('teamAdmin.since', { date: time.day(member.createdAt) })}</Fact>
          </div>
        </div>
      </div>
      {member.manageable ? <MemberActions member={member} role={role} roles={assignable} /> : null}
      {member.self ? (
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-3 justify-self-start lg:ml-0 lg:justify-self-end"
        >
          <Link to="/konto">
            <UserRound />
            {t('teamAdmin.ownAccount')}
          </Link>
        </Button>
      ) : null}
    </li>
  );
}

/** How team accounts work, in three short points. */
function HowItWorks(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const points: readonly { readonly icon: LucideIcon; readonly text: string; readonly link?: ReactNode }[] = [
    {
      icon: LogIn,
      text: t('teamAdmin.how.login'),
      link: <Kbd className="text-[12.5px] font-semibold text-foreground">{loginAddress()}</Kbd>,
    },
    {
      icon: ShieldHalf,
      text: t('teamAdmin.how.roles'),
      link: <Link to="/rollen">{t('teamAdmin.how.rolesLink')}</Link>,
    },
    {
      icon: Fingerprint,
      text: t('teamAdmin.how.security'),
      link: <Link to="/konto">{t('teamAdmin.how.accountLink')}</Link>,
    },
  ];
  return (
    <Card className="grid gap-3 p-5 sm:p-6">
      <h2 className="font-display text-lg font-semibold">{t('teamAdmin.how.title')}</h2>
      <ul className="grid gap-3 md:grid-cols-3 md:gap-5">
        {points.map(({ icon: Icon, text, link }) => (
          <li key={text} className="flex items-start gap-3">
            <span
              className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-gold-soft text-gold"
              aria-hidden
            >
              <Icon className="size-[18px]" />
            </span>
            <span className="grid min-w-0 gap-1 text-sm leading-relaxed text-pretty [overflow-wrap:anywhere]">
              {text}
              {link ? (
                <span className="justify-self-start font-semibold text-primary underline-offset-2 hover:underline">
                  {link}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TeamList(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const me = usePanel();
  const team = useTeamQuery();
  const roles = useRolesQuery();
  const all = roles.data ?? [];
  const assignable = assignableRoles(all, me.role);
  const list = team.data ?? [];

  return (
    <>
      <PageHead icon={UserCog} title={t('teamAdmin.title')} text={t('teamAdmin.text')}>
        {roles.data ? <CreateMemberDialog roles={assignable} /> : null}
      </PageHead>
      <HowItWorks />
      {team.isError ? <Card className="p-6 text-muted-foreground">{errorText(team.error)}</Card> : null}
      {team.isPending ? (
        <Card className="grid divide-y divide-border">
          {SKELETON_ROWS.map((row) => (
            <div key={row} className="flex items-center gap-3.5 px-5 py-4">
              <Skeleton className="size-11" />
              <div className="grid flex-1 gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
            </div>
          ))}
        </Card>
      ) : null}
      {team.isSuccess ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
            <h2 className="font-display text-lg font-semibold">{t('teamAdmin.listTitle')}</h2>
            <span className="text-sm text-muted-foreground">
              {t('teamAdmin.members', { count: list.length })}
            </span>
          </div>
          <ul className="grid divide-y divide-border">
            {list.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                role={all.find((r) => r.id === member.roleId)}
                assignable={assignable}
              />
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}

/** Team accounts for the panel: create, give a role, new password, lock, remove. */
export function TeamPage(): ReactElement {
  return (
    <AreaGate area="roles">
      <TeamList />
    </AreaGate>
  );
}
