import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ListChecks, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MinecraftHead } from '~/components/minecraft-head';
import { RoleBadge } from '~/components/role-visuals';
import { Button, Input, Pill, Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { errorCode, useErrorText } from '~/lib/errors';
import { INVALID_FIELD } from '~/lib/minecraft-name';
import { mmApi } from '~/lib/mm-api';
import { useTimeText } from '~/lib/time';
import { usePanel } from '../../session';
import { ConfirmDialog } from '../../team/dialogs';
import { NameHead } from './ApplicationsCard';
import {
  isBedrockName,
  MINECRAFT_NAME_MAX,
  useWhitelistQuery,
  useWhitelistTeamQuery,
  validMinecraftName,
  WHITELIST_KEY,
  type WhitelistEntry,
  type WhitelistTeamEntry,
} from './model';
import { ExtraCard } from './parts';

const SKELETON_ROWS = ['a', 'b', 'c'];
/** From this many names on, a search field helps. */
const SEARCH_FROM = 8;
const ROW = 'flex min-w-0 items-center gap-3 px-4 py-3 sm:px-5';

/** Someone who gets in through their rank: head, name, rank badge – nothing to remove here. */
function TeamEntry({ entry }: { readonly entry: WhitelistTeamEntry }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const notes = [
    t('whitelistCard.team'),
    ...(entry.listed !== null ? [t('whitelistCard.alsoListed')] : []),
    ...(entry.seen ? [] : [t('whitelistCard.notSeen')]),
  ];
  return (
    <li className={ROW}>
      <MinecraftHead
        uuid={entry.uuid}
        name={entry.name.replace('.', '')}
        className="size-9 rounded-[10px] bg-muted text-base"
        letterClassName="text-muted-foreground"
      />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">{entry.name}</span>
          <RoleBadge role={entry.role} />
          {isBedrockName(entry.name) ? <Pill tone="blue">{t('applicationsCard.bedrock')}</Pill> : null}
        </p>
        <p className="text-[13px] text-muted-foreground">{notes.join(' · ')}</p>
      </div>
      <span
        className="grid size-9 shrink-0 place-items-center rounded-[10px] text-success"
        title={t('whitelistCard.teamHelp')}
      >
        <ShieldCheck className="size-5" aria-hidden />
        <span className="sr-only">{t('whitelistCard.teamHelp')}</span>
      </span>
    </li>
  );
}

function Entry({
  entry,
  onRemove,
}: {
  readonly entry: WhitelistEntry;
  /** Missing = this person may not take names off the list. */
  readonly onRemove?: (() => void) | undefined;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
  const name = entry.displayName;
  return (
    <li className={ROW}>
      <NameHead name={name} className="size-9 rounded-[10px] text-base" />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">{name}</span>
          {isBedrockName(name) ? <Pill tone="blue">{t('applicationsCard.bedrock')}</Pill> : null}
          {entry.uuid ? (
            <span title={t('whitelistCard.seenHelp')}>
              <Pill tone="success">{t('whitelistCard.seen')}</Pill>
            </span>
          ) : null}
        </p>
        <p className="text-[13px] text-muted-foreground" title={time.date(entry.createdAt)}>
          {t('whitelistCard.added', { name: entry.addedBy, time: time.relative(entry.createdAt) })}
        </p>
      </div>
      {onRemove ? (
        <Button
          variant="danger"
          size="iconSm"
          onClick={onRemove}
          aria-label={t('whitelistCard.removeLabel', { name })}
          title={t('whitelistCard.removeLabel', { name })}
        >
          <Trash2 />
        </Button>
      ) : null}
    </li>
  );
}

/** A titled part of the list (team first, then the names added by hand or by an application). */
function Group({
  title,
  children,
}: {
  readonly title: string | null;
  readonly children: ReactNode;
}): ReactElement {
  const headingId = useId();
  return (
    <section className="grid gap-2" aria-labelledby={title ? headingId : undefined}>
      {title ? (
        <h3 id={headingId} className="text-sm font-semibold text-muted-foreground">
          {title}
        </h3>
      ) : null}
      <div className="overflow-hidden rounded-[14px] border border-border">
        <ul className="grid divide-y divide-border">{children}</ul>
      </div>
    </section>
  );
}

/**
 * Einstellungen → MorniCraft: who may join. The team (everyone whose rank always gets in) shows up by itself;
 * accepted applications land here by themselves.
 */
export function WhitelistCard(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const inputId = useId();
  const searchId = useId();
  const list = useWhitelistQuery();
  const team = useWhitelistTeamQuery();
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [removing, setRemoving] = useState<WhitelistEntry | null>(null);
  // Like accepting applications (also in Discord): only who may kick – the owner always.
  const me = usePanel();
  const mayEdit = me.role.id === 'owner' || me.role.game.includes('kick');
  const teamRows = team.data ?? [];
  // Someone in the team who was also added by hand shows up once – as team member.
  const inTeam = new Set(teamRows.flatMap((row) => (row.listed === null ? [] : [row.listed])));
  const rows = (list.data ?? []).filter((r) => !inTeam.has(r.id));
  const total = teamRows.length + rows.length;
  const words = query.trim().toLowerCase();
  const shownTeam = words ? teamRows.filter((r) => r.name.toLowerCase().includes(words)) : teamRows;
  const shown = words ? rows.filter((r) => r.name.includes(words)) : rows;

  const add = useMutation({
    mutationFn: (value: string) =>
      mmApi<WhitelistEntry>('/api/panel/whitelist', { method: 'POST', body: { name: value } }),
    onSuccess: async (entry) => {
      setName('');
      toast.success(t('whitelistCard.addedToast', { name: entry.displayName }));
      await queryClient.invalidateQueries({ queryKey: WHITELIST_KEY });
    },
    onError: (err) =>
      setProblem(errorCode(err) === 'invalid_request' ? t('whitelistCard.invalidName') : errorText(err)),
  });
  const remove = useMutation({
    mutationFn: (entry: WhitelistEntry) => mmApi(`/api/panel/whitelist/${entry.id}`, { method: 'DELETE' }),
    onSuccess: async (_r, entry) => {
      setRemoving(null);
      toast.success(t('whitelistCard.removedToast', { name: entry.displayName }));
      await queryClient.invalidateQueries({ queryKey: WHITELIST_KEY });
    },
    onError: async (err) => {
      setRemoving(null);
      toast.error(errorText(err));
      await queryClient.invalidateQueries({ queryKey: WHITELIST_KEY });
    },
  });

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const value = name.trim();
    const lower = value.toLowerCase();
    if (!validMinecraftName(value)) {
      setProblem(t('whitelistCard.invalidName'));
      return;
    }
    if (teamRows.some((r) => r.seen && r.name.toLowerCase() === lower)) {
      setProblem(t('whitelistCard.alreadyTeam', { name: value }));
      return;
    }
    if ((list.data ?? []).some((r) => r.name === lower)) {
      setProblem(t('whitelistCard.already', { name: value }));
      return;
    }
    setProblem(null);
    add.mutate(value);
  };

  const loaded = list.isSuccess && (team.isSuccess || team.isError);
  return (
    <ExtraCard
      fold="extra:mornicraft-whitelist"
      foldOpen={false}
      id="whitelist"
      icon={ListChecks}
      title={t('whitelistCard.title')}
      text={t('whitelistCard.text')}
      aside={
        loaded ? (
          <span className="text-sm text-muted-foreground">{t('whitelistCard.count', { count: total })}</span>
        ) : null
      }
    >
      {mayEdit ? null : <p className="text-sm text-muted-foreground">{t('whitelistCard.noRight')}</p>}
      <form onSubmit={submit} noValidate className={mayEdit ? 'grid gap-1.5' : 'hidden'}>
        <label htmlFor={inputId} className="text-sm font-semibold">
          {t('whitelistCard.addLabel')}
        </label>
        <div className="flex flex-wrap gap-2">
          <Input
            id={inputId}
            value={name}
            maxLength={MINECRAFT_NAME_MAX}
            autoComplete="off"
            spellCheck={false}
            placeholder={t('whitelistCard.placeholder')}
            aria-invalid={problem ? true : undefined}
            aria-describedby={`${inputId}-help`}
            onChange={(e) => {
              setName(e.target.value);
              setProblem(null);
            }}
            className={cn('min-w-0 flex-1 basis-56', INVALID_FIELD)}
          />
          <Button type="submit" disabled={add.isPending || !name.trim()} className="h-11">
            <Plus />
            {t('whitelistCard.add')}
          </Button>
        </div>
        <p
          id={`${inputId}-help`}
          className={
            problem ? 'text-[13px] font-semibold text-destructive' : 'text-[13px] text-muted-foreground'
          }
          role={problem ? 'alert' : undefined}
        >
          {problem ?? t('whitelistCard.addHelp')}
        </p>
      </form>

      {list.isError ? <p className="text-muted-foreground">{errorText(list.error)}</p> : null}
      {team.isError ? <p className="text-muted-foreground">{errorText(team.error)}</p> : null}
      {list.isPending || team.isPending ? (
        <div className="grid gap-2">
          {SKELETON_ROWS.map((row) => (
            <Skeleton key={row} className="h-14 rounded-[12px]" />
          ))}
        </div>
      ) : null}
      {loaded && !total ? (
        <p className="rounded-[14px] border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
          {t('whitelistCard.empty')}
        </p>
      ) : null}
      {total >= SEARCH_FROM ? (
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            {t('whitelistCard.search')}
          </label>
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id={searchId}
            type="search"
            value={query}
            autoComplete="off"
            placeholder={t('whitelistCard.search')}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      ) : null}
      {total && !shownTeam.length && !shown.length ? (
        <p className="text-sm text-muted-foreground">{t('whitelistCard.noMatch')}</p>
      ) : null}
      {shownTeam.length ? (
        <Group title={t('whitelistCard.teamTitle')}>
          {shownTeam.map((entry) => (
            <TeamEntry key={entry.uuid} entry={entry} />
          ))}
        </Group>
      ) : null}
      {shown.length ? (
        <Group title={teamRows.length ? t('whitelistCard.ownTitle') : null}>
          {shown.map((entry) => (
            <Entry key={entry.id} entry={entry} onRemove={mayEdit ? () => setRemoving(entry) : undefined} />
          ))}
        </Group>
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={t('whitelistCard.removeTitle', { name: removing?.displayName ?? '' })}
        text={t('whitelistCard.removeText', { name: removing?.displayName ?? '' })}
        confirm={t('whitelistCard.remove')}
        icon={Trash2}
        danger
        busy={remove.isPending}
        onConfirm={() => {
          if (removing) remove.mutate(removing);
        }}
      />
    </ExtraCard>
  );
}
