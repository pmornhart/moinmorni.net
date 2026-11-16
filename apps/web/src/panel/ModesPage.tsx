import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronDown, Gamepad2, Save } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MODE_ACCESS, MODE_STATES, type Mode, type ModePatch } from '@moinmorni/shared';
import { FieldBlock } from '~/components/controls';
import { ModeGlyph } from '~/components/mode-visuals';
import { Select } from '~/components/select';
import { Button, Card, Input, Pill, Skeleton, Switch, Textarea } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useErrorText } from '~/lib/errors';
import { mmApi } from '~/lib/mm-api';
import { MODE_STATE_TONE } from '~/lib/status';
import { usePick } from '~/lib/text';
import { PageHead } from './PanelShell';

const MODES_KEY = ['panel', 'modes'] as const;
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

function ModeEditor({
  mode,
  index,
  count,
  onMove,
  moving,
  open,
  onToggle,
}: {
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
  const patch = patchOf(saved, draft);
  const dirty = Object.keys(patch).length > 0;
  const id = (field: string): string => `mode-${mode.id}-${field}`;
  const set = <K extends keyof Editable>(key: K, value: Editable[K]): void =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = useMutation({
    mutationFn: () => mmApi<Mode>(`/api/panel/modes/${mode.id}`, { method: 'PATCH', body: patch }),
    onSuccess: async (fresh) => {
      setDraft(editableOf(fresh));
      queryClient.setQueryData<Mode[]>(MODES_KEY, (list) =>
        list?.map((m) => (m.id === fresh.id ? fresh : m)),
      );
      await queryClient.invalidateQueries({ queryKey: STATUS_KEY });
      toast.success(t('modes.saved', { name: pick(fresh.name) }));
    },
    onError: (err) => toast.error(errorText(err)),
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
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {t('modes.position', { n: index + 1 })} ·{' '}
              {mode.server ? t('modes.server', { name: mode.server }) : t('modes.noServer')}
            </span>
          </span>
          <span className="hidden flex-wrap justify-end gap-1.5 sm:flex">
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
            <div className="grid content-start gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={id('sleep')} className="text-sm font-semibold">
                  {t('modes.sleep')}
                </label>
                <Switch
                  id={id('sleep')}
                  checked={draft.sleepWhenEmpty}
                  onCheckedChange={(v) => set('sleepWhenEmpty', v)}
                />
              </div>
              <p className="text-[13px] leading-snug text-muted-foreground">{t('modes.sleepHelp')}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
            {dirty ? (
              <Button variant="ghost" onClick={() => setDraft(saved)} disabled={save.isPending}>
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

/** All game modes: state, who may join, names, descriptions, limits, sleeping, order. */
export function ModesPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const modes = useQuery({ queryKey: MODES_KEY, queryFn: () => mmApi<Mode[]>('/api/panel/modes') });
  const list = [...(modes.data ?? [])].sort((a, b) => a.position - b.position);
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
            key={`${mode.id}:${JSON.stringify(editableOf(mode))}`}
            mode={mode}
            index={index}
            count={list.length}
            moving={move.isPending}
            open={open.has(mode.id)}
            onToggle={() => toggle(mode.id)}
            onMove={(direction) => move.mutate({ index, direction })}
          />
        ))}
      </div>
    </>
  );
}
