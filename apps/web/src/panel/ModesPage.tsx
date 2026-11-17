import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronDown, Gamepad2, RotateCw, Save } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  MODE_ACCESS,
  MODE_IDLE,
  MODE_STATES,
  modeIdleOf,
  SPORT_MODES,
  sportReplacedBy,
  type Mode,
  type ModeIdle,
  type ModePatch,
  type ModeRest,
  type SportMode,
} from '@moinmorni/shared';
import { FieldBlock } from '~/components/controls';
import { ModeGlyph } from '~/components/mode-visuals';
import { Select } from '~/components/select';
import { Button, Card, Input, Pill, Skeleton, Textarea } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useErrorText } from '~/lib/errors';
import { mmApi } from '~/lib/mm-api';
import { MODE_STATE_TONE, useNetworkStatus } from '~/lib/status';
import { usePick } from '~/lib/text';
import { PageHead } from './PanelShell';

const MODES_KEY = ['panel', 'modes'] as const;
/** Idle memory per mode – kept by the motor, not with the modes. */
const REST_KEY = ['panel', 'modes', 'rest'] as const;
const NO_REST: ModeRest = { on: null, restartPending: false };
const STATUS_KEY = ['status'] as const;
/** Limits of the mode schema in packages/shared (modes.ts). */
const NAME_MAX = 32;
const DESCRIPTION_MAX = 240;
const PLAYERS_MIN = 1;
const PLAYERS_MAX = 500;

type Editable = Omit<Mode, 'id' | 'position' | 'server'>;

function editableOf(mode: Mode): Editable {
  return {
    name: mode.name,
    description: mode.description,
    state: mode.state,
    access: mode.access,
    maxPlayers: mode.maxPlayers,
    sleepWhenEmpty: mode.sleepWhenEmpty,
  };
}

/** Only the fields that differ from the saved mode. */
function patchOf(saved: Editable, draft: Editable): ModePatch {
  const keys = Object.keys(draft) as (keyof Editable)[];
  return Object.fromEntries(
    keys.filter((k) => JSON.stringify(saved[k]) !== JSON.stringify(draft[k])).map((k) => [k, draft[k]]),
  ) as ModePatch;
}

function draftValid(draft: Editable): boolean {
  return (
    draft.name.de.trim().length > 0 &&
    draft.name.en.trim().length > 0 &&
    Number.isInteger(draft.maxPlayers) &&
    draft.maxPlayers >= PLAYERS_MIN &&
    draft.maxPlayers <= PLAYERS_MAX
  );
}

/**
 * Winter Games and Summer Games share one place: a small note which one is at the sports stand right now – the other is
 * replaced by it on the website, in the compass and in Discord (both stay editable here).
 */
function SportPill({
  id,
  sport,
}: {
  readonly id: string;
  readonly sport: { readonly id: SportMode; readonly name: string } | null;
}): ReactElement | null {
  const { t } = useTranslation(MM_NAMESPACE);
  if (!sport || !(SPORT_MODES as readonly string[]).includes(id)) return null;
  return sportReplacedBy(id, sport.id) ? (
    <Pill tone="neutral">{t('modes.sportReplaced', { name: sport.name })}</Pill>
  ) : (
    <Pill tone="success">{t('modes.sportNow')}</Pill>
  );
}

function ModeEditor({
  mode,
  rest,
  index,
  count,
  onMove,
  moving,
  open,
  onToggle,
  sport,
}: {
  /** Which sports mode is at the sports stand right now (Winter Games or Summer Games) and its name. */
  readonly sport: { readonly id: SportMode; readonly name: string } | null;
  readonly rest: ModeRest;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly mode: Mode;
  readonly index: number;
  readonly count: number;
  readonly onMove: (direction: -1 | 1) => void;
  readonly moving: boolean;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const saved = editableOf(mode);
  const [draft, setDraft] = useState<Editable>(saved);
  const id = (field: string): string => `mode-${mode.id}-${field}`;
  const set = <K extends keyof Editable>(key: K, value: Editable[K]): void =>
    setDraft((d) => ({ ...d, [key]: value }));
  // Idle memory of the mode's server (lives in the motor): null = no server yet – then only "rest" or "sleep".
  const [restOn, setRestOn] = useState<boolean | null>(rest.on);
  const patch = patchOf(saved, draft);
  const restChanged = restOn !== rest.on;
  const dirty = Object.keys(patch).length > 0 || restChanged;
  const idle = modeIdleOf(draft.sleepWhenEmpty, restOn);
  const chooseIdle = (choice: ModeIdle): void => {
    set('sleepWhenEmpty', choice === 'sleep');
    // Sleeping leaves the idle memory setting as it is (the server is off most of the time anyway).
    if (choice !== 'sleep' && rest.on !== null) setRestOn(choice === 'rest');
  };

  const save = useMutation({
    mutationFn: async (): Promise<Mode> => {
      const fresh = Object.keys(patch).length
        ? await mmApi<Mode>(`/api/panel/modes/${mode.id}`, { method: 'PATCH', body: patch })
        : mode;
      if (restChanged && restOn !== null)
        await mmApi<ModeRest>(`/api/panel/modes/${mode.id}/rest`, { method: 'PUT', body: { on: restOn } });
      return fresh;
    },
    onSuccess: async (fresh) => {
      setDraft(editableOf(fresh));
      queryClient.setQueryData<Mode[]>(MODES_KEY, (list) =>
        list?.map((m) => (m.id === fresh.id ? fresh : m)),
      );
      await queryClient.invalidateQueries({ queryKey: STATUS_KEY });
      await queryClient.invalidateQueries({ queryKey: REST_KEY, exact: true });
      toast.success(t('modes.saved', { name: pick(fresh.name) }));
    },
    onError: async (err) => {
      toast.error(errorText(err));
      await queryClient.invalidateQueries({ queryKey: REST_KEY, exact: true });
    },
  });

  return (
    <Card className="grid gap-5 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={id('body')}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-[12px] text-left"
        >
          <ModeGlyph id={mode.id} position={index} />
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="truncate font-display text-xl font-semibold">{pick(draft.name)}</span>
              {dirty ? (
                <span
                  className="size-2 rounded-full bg-gold"
                  title={t('settings.unsaved_one', { count: 1 })}
                />
              ) : null}
              <Pill tone={MODE_STATE_TONE[draft.state]} dot className="sm:hidden">
                {t(`mode.state.${draft.state}`)}
              </Pill>
              <span className="sm:hidden">
                <SportPill id={mode.id} sport={sport} />
              </span>
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {t('modes.position', { n: index + 1 })} ·{' '}
              {mode.server ? t('modes.server', { name: mode.server }) : t('modes.noServer')}
            </span>
          </span>
          <span className="hidden flex-wrap justify-end gap-1.5 sm:flex">
            <SportPill id={mode.id} sport={sport} />
            {draft.access === 'whitelist' ? <Pill tone="gold">{t('mode.whitelist')}</Pill> : null}
            <Pill tone={MODE_STATE_TONE[draft.state]} dot>
              {t(`mode.state.${draft.state}`)}
            </Pill>
          </span>
          <ChevronDown
            className={cn('size-5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
            aria-hidden
          />
        </button>
        <div className="flex shrink-0 gap-1 border-l border-border pl-3">
          <Button
            variant="secondary"
            size="iconSm"
            onClick={() => onMove(-1)}
            disabled={index === 0 || moving}
            aria-label={t('modes.up')}
            title={t('modes.up')}
          >
            <ArrowUp />
          </Button>
          <Button
            variant="secondary"
            size="iconSm"
            onClick={() => onMove(1)}
            disabled={index === count - 1 || moving}
            aria-label={t('modes.down')}
            title={t('modes.down')}
          >
            <ArrowDown />
          </Button>
        </div>
      </div>

      {open ? (
        <div id={id('body')} className="grid gap-5 border-t border-border pt-5">
          <div className="grid gap-4 md:grid-cols-2">
            <FieldBlock id={id('state')} label={t('modes.state')} help={t('modes.stateHelp')}>
              <Select
                id={id('state')}
                value={draft.state}
                onChange={(e) => set('state', MODE_STATES.find((s) => s === e.target.value) ?? draft.state)}
              >
                {MODE_STATES.map((s) => (
                  <option key={s} value={s}>
                    {t(`mode.state.${s}`)}
                  </option>
                ))}
              </Select>
            </FieldBlock>
            <FieldBlock id={id('access')} label={t('modes.access')}>
              <Select
                id={id('access')}
                value={draft.access}
                onChange={(e) => set('access', MODE_ACCESS.find((a) => a === e.target.value) ?? draft.access)}
              >
                <option value="everyone">{t('modes.accessEveryone')}</option>
                <option value="whitelist">{t('modes.accessWhitelist')}</option>
              </Select>
            </FieldBlock>
            <FieldBlock id={id('name-de')} label={t('modes.nameDe')}>
              <Input
                id={id('name-de')}
                lang="de"
                maxLength={NAME_MAX}
                value={draft.name.de}
                onChange={(e) => set('name', { ...draft.name, de: e.target.value })}
              />
            </FieldBlock>
            <FieldBlock id={id('name-en')} label={t('modes.nameEn')}>
              <Input
                id={id('name-en')}
                lang="en"
                maxLength={NAME_MAX}
                value={draft.name.en}
                onChange={(e) => set('name', { ...draft.name, en: e.target.value })}
              />
            </FieldBlock>
            <FieldBlock id={id('desc-de')} label={t('modes.descDe')}>
              <Textarea
                id={id('desc-de')}
                lang="de"
                rows={3}
                maxLength={DESCRIPTION_MAX}
                value={draft.description.de}
                onChange={(e) => set('description', { ...draft.description, de: e.target.value })}
              />
            </FieldBlock>
            <FieldBlock id={id('desc-en')} label={t('modes.descEn')}>
              <Textarea
                id={id('desc-en')}
                lang="en"
                rows={3}
                maxLength={DESCRIPTION_MAX}
                value={draft.description.en}
                onChange={(e) => set('description', { ...draft.description, en: e.target.value })}
              />
            </FieldBlock>
            <FieldBlock
              id={id('max')}
              label={t('modes.maxPlayers')}
              help={t('settings.range', { min: PLAYERS_MIN, max: PLAYERS_MAX })}
            >
              <Input
                id={id('max')}
                type="number"
                inputMode="numeric"
                min={PLAYERS_MIN}
                max={PLAYERS_MAX}
                className="tabular"
                value={Number.isNaN(draft.maxPlayers) ? '' : draft.maxPlayers}
                onChange={(e) => set('maxPlayers', e.target.valueAsNumber)}
              />
            </FieldBlock>
            <FieldBlock
              id={id('idle')}
              label={t('modes.idle')}
              help={
                <>
                  {t(`modes.idleHelp.${idle}`)}
                  {restChanged || rest.restartPending ? (
                    <span className="mt-1.5 flex items-start gap-1.5 text-gold">
                      <RotateCw className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {t(restChanged ? 'modes.idleRestart' : 'modes.idleRestartPending')}
                    </span>
                  ) : null}
                </>
              }
            >
              <Select
                id={id('idle')}
                value={idle}
                onChange={(e) => chooseIdle(MODE_IDLE.find((c) => c === e.target.value) ?? idle)}
              >
                {MODE_IDLE.map((c) => (
                  <option
                    key={c}
                    value={c}
                    // Staying fully awake switches idle memory off in the motor – that needs a server.
                    disabled={c === 'awake' && rest.on === null}
                    title={c === 'awake' && rest.on === null ? t('modes.idleNoServer') : undefined}
                  >
                    {t(`modes.idleChoice.${c}`)}
                  </option>
                ))}
              </Select>
            </FieldBlock>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
            {dirty ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setDraft(saved);
                  setRestOn(rest.on);
                }}
                disabled={save.isPending}
              >
                {t('settings.discard')}
              </Button>
            ) : null}
            <Button onClick={() => save.mutate()} disabled={!dirty || !draftValid(draft) || save.isPending}>
              <Save />
              {save.isPending ? t('settings.saving') : t('modes.save')}
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

/** All game modes: state, who may join, names, descriptions, limits, what happens when empty, order. */
export function ModesPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const pick = usePick();
  const queryClient = useQueryClient();
  const modes = useQuery({ queryKey: MODES_KEY, queryFn: () => mmApi<Mode[]>('/api/panel/modes') });
  // Asks the motor; if that fails (motor away), the page still shows the modes.
  const rest = useQuery({
    queryKey: REST_KEY,
    queryFn: () => mmApi<Record<string, ModeRest>>('/api/panel/modes/rest'),
  });
  const list = [...(modes.data ?? [])].sort((a, b) => a.position - b.position);
  const sportId = useNetworkStatus().data?.sport;
  const sportMode = list.find((m) => m.id === sportId);
  const sport = sportId && sportMode ? { id: sportId, name: pick(sportMode.name) } : null;
  // Which modes are unfolded (kept here, so a card stays open when it reloads after saving).
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string): void =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const move = useMutation({
    mutationFn: async ({ index, direction }: { readonly index: number; readonly direction: -1 | 1 }) => {
      const a = list[index];
      const b = list[index + direction];
      if (!a || !b) return;
      // Swap the two places; equal numbers (never sorted yet) fall back to the order shown.
      const tie = a.position === b.position;
      const placeA = tie ? index + direction : b.position;
      const placeB = tie ? index : a.position;
      await mmApi<Mode>(`/api/panel/modes/${a.id}`, { method: 'PATCH', body: { position: placeA } });
      await mmApi<Mode>(`/api/panel/modes/${b.id}`, { method: 'PATCH', body: { position: placeB } });
    },
    onSuccess: () => toast.success(t('modes.moved')),
    onError: (err) => toast.error(errorText(err)),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: MODES_KEY });
      await queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    },
  });

  return (
    <>
      <PageHead icon={Gamepad2} title={t('modes.title')} text={t('modes.text')} />
      {modes.isPending ? <Skeleton className="h-96 rounded-[16px]" /> : null}
      {modes.isError ? <Card className="p-6 text-muted-foreground">{errorText(modes.error)}</Card> : null}
      <div className="grid gap-[22px]">
        {list.map((mode, index) => (
          <ModeEditor
            // A new key when the saved content changes, so the form starts from the fresh values (not on moves).
            key={`${mode.id}:${JSON.stringify(editableOf(mode))}:${String(rest.data?.[mode.id]?.on)}`}
            mode={mode}
            rest={rest.data?.[mode.id] ?? NO_REST}
            index={index}
            count={list.length}
            moving={move.isPending}
            open={open.has(mode.id)}
            onToggle={() => toggle(mode.id)}
            sport={sport}
            onMove={(direction) => move.mutate({ index, direction })}
          />
        ))}
      </div>
    </>
  );
}
