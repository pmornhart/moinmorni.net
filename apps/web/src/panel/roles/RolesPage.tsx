import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Info, Plus, RotateCcw, Save, ShieldHalf } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Role } from '@moinmorni/shared';
import { Button, Card, Input, Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useErrorText } from '~/lib/errors';
import { mmApi } from '~/lib/mm-api';
import { AreaGate } from '../AreaGate';
import { PageHead } from '../PanelShell';
import { PLAYERS_KEY } from '../players/model';
import { PANEL_ME_KEY, ROLES_KEY, usePanel, useRolesQuery } from '../session';
import {
  changeCount,
  freeId,
  idFromName,
  lockedFor,
  NAME_MAX,
  newRole,
  OWNER,
  problemsOf,
  sameRole,
  toSave,
} from './role-draft';
import { RoleEditor } from './RoleEditor';

function NewRoleForm({
  taken,
  onAdd,
}: {
  readonly taken: readonly string[];
  readonly onAdd: (name: string) => void;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const id = useId();
  const [name, setName] = useState('');
  const trimmed = name.trim();
  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    if (!trimmed) return;
    onAdd(trimmed);
    setName('');
  };
  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-2 rounded-[16px] border-2 border-dashed border-border bg-card/50 p-4 sm:p-5"
    >
      <label htmlFor={id} className="font-display text-lg font-semibold">
        {t('roles.new')}
      </label>
      <div className="flex flex-wrap gap-2">
        <Input
          id={id}
          maxLength={NAME_MAX}
          placeholder={t('roles.newPlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 basis-56"
        />
        <Button type="submit" variant="secondary" disabled={!trimmed}>
          <Plus />
          {t('roles.create')}
        </Button>
      </div>
      <p className="text-[13px] text-muted-foreground">
        {trimmed ? t('roles.newHelp', { id: freeId(idFromName(trimmed), taken) }) : t('roles.newHint')}
      </p>
    </form>
  );
}

function RolesEditor({
  saved,
  open,
  onToggle,
  onOpen,
}: {
  readonly saved: readonly Role[];
  readonly open: ReadonlySet<string>;
  readonly onToggle: (id: string) => void;
  readonly onOpen: (id: string) => void;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const me = usePanel();
  const isOwner = me.role.id === OWNER;
  const [draft, setDraft] = useState<readonly Role[]>(saved);
  const changes = changeCount(saved, draft);
  const broken = draft.filter((r) => problemsOf(r).length > 0);
  const previewName = `${me.username.slice(0, 1).toUpperCase()}${me.username.slice(1)}`;
  const savedIds = saved.map((r) => r.id);

  // Leaving the page with unsaved changes asks first (browser dialog).
  useEffect(() => {
    if (!changes) return undefined;
    const warn = (e: BeforeUnloadEvent): void => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changes]);

  const canMove = (index: number, direction: -1 | 1): boolean => {
    const role = draft[index];
    const other = draft[index + direction];
    if (!role || !other) return false;
    // The owner always stays on top; Owner and Admin keep their places for everyone but the owner.
    if (role.id === OWNER || other.id === OWNER) return false;
    return !lockedFor(role, isOwner) && !lockedFor(other, isOwner);
  };

  const move = (index: number, direction: -1 | 1): void =>
    setDraft((list) =>
      list.map((role, i) => {
        if (i === index) return list[index + direction] ?? role;
        if (i === index + direction) return list[index] ?? role;
        return role;
      }),
    );

  const update = (fresh: Role): void =>
    setDraft((list) => list.map((role) => (role.id === fresh.id ? fresh : role)));

  const add = (name: string): void => {
    const role = newRole(
      name,
      draft.map((r) => r.id),
      draft.length,
    );
    // New roles land just above the role for everyone else (usually the last one).
    const at = draft.findIndex((r) => r.fallback);
    setDraft((list) => (at < 0 ? [...list, role] : [...list.slice(0, at), role, ...list.slice(at)]));
    onOpen(role.id);
  };

  const save = useMutation({
    mutationFn: () =>
      mmApi<Role[]>('/api/panel/roles', { method: 'PUT', body: toSave(saved, draft, isOwner) }),
    onSuccess: async (fresh) => {
      queryClient.setQueryData<Role[]>(
        ROLES_KEY,
        [...fresh].sort((a, b) => a.position - b.position),
      );
      toast.success(t('roles.saved'));
      // Own areas and players' rank colours may have changed.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: PANEL_ME_KEY }),
        queryClient.invalidateQueries({ queryKey: PLAYERS_KEY }),
      ]);
    },
    onError: (err) => toast.error(errorText(err)),
  });

  return (
    <>
      <div className="grid gap-[22px]">
        {draft.map((role, index) => {
          const before = saved.find((s) => s.id === role.id);
          return (
            <RoleEditor
              key={role.id}
              role={role}
              index={index}
              isNew={!before}
              changed={!before || !sameRole(before, role)}
              locked={lockedFor(role, isOwner)}
              open={open.has(role.id)}
              previewName={previewName}
              canMoveUp={canMove(index, -1)}
              canMoveDown={canMove(index, 1)}
              onToggle={() => onToggle(role.id)}
              onChange={update}
              onMove={(direction) => move(index, direction)}
              onMakeFallback={() =>
                setDraft((list) => list.map((r) => ({ ...r, fallback: r.id === role.id })))
              }
              onDelete={() => setDraft((list) => list.filter((r) => r.id !== role.id))}
            />
          );
        })}
        <NewRoleForm taken={[...savedIds, ...draft.map((r) => r.id)]} onAdd={add} />
      </div>

      <div
        className={cn(
          'sticky bottom-4 z-20 transition-[opacity,transform] duration-200',
          changes ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0',
        )}
        aria-hidden={!changes}
      >
        <div className="grid gap-2 rounded-[16px] border border-gold/40 bg-popover/95 px-4 py-3 shadow-float backdrop-blur sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span className="size-2 rounded-full bg-gold" aria-hidden />
              {t('settings.unsaved', { count: changes })}
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setDraft(saved);
                  save.reset();
                }}
                disabled={save.isPending}
              >
                <RotateCcw />
                {t('settings.discard')}
              </Button>
              <Button onClick={() => save.mutate()} disabled={broken.length > 0 || save.isPending}>
                <Save />
                {save.isPending ? t('settings.saving') : t('settings.save')}
              </Button>
            </div>
          </div>
          {broken.length ? (
            <p className="text-[13px] text-destructive">
              {t('roles.fixFirst', { names: broken.map((r) => r.name.de.trim() || r.id).join(', ') })}
            </p>
          ) : null}
          {save.isError && !broken.length ? (
            <p role="alert" className="text-[13px] text-destructive">
              {errorText(save.error)}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Roles(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const me = usePanel();
  const roles = useRolesQuery();
  // Which roles are unfolded (kept here, so a card stays open when the list reloads after saving).
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string): void =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return (
    <>
      <PageHead icon={ShieldHalf} title={t('roles.title')} text={t('roles.text')} />
      <p className="flex items-start gap-2.5 rounded-[14px] border border-gold/30 bg-gold-soft px-4 py-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
        <span>
          {t('roles.howTo')} {me.role.id === OWNER ? null : t('roles.ownerOnlyNote')}
        </span>
      </p>
      {roles.isPending ? <Skeleton className="h-96 rounded-[16px]" /> : null}
      {roles.isError ? <Card className="p-6 text-muted-foreground">{errorText(roles.error)}</Card> : null}
      {roles.data ? (
        <RolesEditor
          key={JSON.stringify(roles.data)}
          saved={roles.data}
          open={open}
          onToggle={toggle}
          onOpen={(id) => setOpen((current) => new Set([...current, id]))}
        />
      ) : null}
    </>
  );
}

/**
 * The role template: name, symbol, colour and what each role may do in panel, game and Discord – with order,
 * the role for everyone else, new roles and deleting.
 */
export function RolesPage(): ReactElement {
  return (
    <AreaGate area="roles">
      <Roles />
    </AreaGate>
  );
}
