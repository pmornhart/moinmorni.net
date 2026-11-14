import { useMutation } from '@tanstack/react-query';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { Info, X } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FieldBlock } from '~/components/controls';
import { Button, Input, NativeSelect, Textarea } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useDebounced } from '~/lib/debounce';
import { useErrorText } from '~/lib/errors';
import { mmApi } from '~/lib/mm-api';
import { MINUTES_PER_DAY, MINUTES_PER_HOUR, MINUTES_PER_WEEK, useTimeText } from '~/lib/time';
import { useCan } from '../session';
import { KIND_ICON } from './badges';
import {
  isLasting,
  MOD_KINDS,
  usePlayersQuery,
  useRefreshPlayers,
  type ModKind,
  type Punishment,
} from './model';

/** Limits of the punishment API (apps/server/src/panel/player-routes.ts). */
const REASON_MAX = 200;
const MINUTES_MAX = 5_256_000;
const NAME_MAX = 40;
const SUGGESTIONS = 8;
const SUGGEST_DELAY_MS = 250;
const HALF_HOUR = 30;
const DAYS_PER_MONTH = 30;
/** Quick choices: 30 Min., 1 Std., 1 Tag, 7 Tage, 30 Tage. */
const QUICK_MINUTES: readonly number[] = [
  HALF_HOUR,
  MINUTES_PER_HOUR,
  MINUTES_PER_DAY,
  MINUTES_PER_WEEK,
  DAYS_PER_MONTH * MINUTES_PER_DAY,
];
const UNITS = {
  minutes: 1,
  hours: MINUTES_PER_HOUR,
  days: MINUTES_PER_DAY,
  weeks: MINUTES_PER_WEEK,
} as const;
type Unit = keyof typeof UNITS;
const UNIT_NAMES = Object.keys(UNITS) as Unit[];
const QUICK_REASONS = ['spam', 'insult', 'cheats', 'grief', 'ads'] as const;
const DEFAULT_MINUTES: Readonly<Record<ModKind, number>> = {
  ban: MINUTES_PER_DAY,
  mute: MINUTES_PER_HOUR,
  warn: MINUTES_PER_HOUR,
  kick: MINUTES_PER_HOUR,
};

type Choice = number | 'forever' | 'custom';

export interface PunishTarget {
  readonly name: string;
  /** null = not known (a name typed in by hand). */
  readonly online: boolean | null;
}

function isUnit(value: string): value is Unit {
  return Object.hasOwn(UNITS, value);
}

function PunishForm({
  target,
  initialKind,
  onDone,
}: {
  readonly target: PunishTarget | null;
  readonly initialKind: ModKind;
  readonly onDone: () => void;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
  const errorText = useErrorText();
  const refresh = useRefreshPlayers();
  const canSearch = useCan('players');
  const id = useId();
  const [kind, setKind] = useState<ModKind>(initialKind);
  const [name, setName] = useState(target?.name ?? '');
  const [choice, setChoice] = useState<Choice>(DEFAULT_MINUTES[initialKind]);
  const [amount, setAmount] = useState('2');
  const [unit, setUnit] = useState<Unit>('hours');
  const [reason, setReason] = useState('');
  const query = useDebounced(name.trim(), SUGGEST_DELAY_MS);
  const suggestions = usePlayersQuery(query, SUGGESTIONS, canSearch && !target && query.length > 0);
  const player = target?.name ?? name.trim();
  const lasting = isLasting(kind);
  const customMinutes = Number(amount) * UNITS[unit];
  const customValid = Number.isInteger(customMinutes) && customMinutes >= 1 && customMinutes <= MINUTES_MAX;
  const minutes: number | null = ((): number | null => {
    if (choice === 'forever') return null;
    return choice === 'custom' ? customMinutes : choice;
  })();
  const kickBlocked = kind === 'kick' && target?.online === false;
  const valid = player.length > 0 && !kickBlocked && (!lasting || choice !== 'custom' || customValid);

  const submit = useMutation({
    mutationFn: () =>
      mmApi<Punishment>('/api/panel/punishments', {
        method: 'POST',
        body: { player, kind, minutes: lasting ? minutes : null, reason: reason.trim() },
      }),
    onSuccess: async () => {
      toast.success(t(`punish.done.${kind}`, { name: player }));
      onDone();
      await refresh();
    },
  });

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    if (valid && !submit.isPending) submit.mutate();
  };

  const SubmitIcon = KIND_ICON[kind];
  const summary = ((): string => {
    const who = player || t('punish.someone');
    if (!lasting) return t(`punish.summary.${kind}`, { name: who });
    if (minutes === null) return t(`punish.summary.${kind}Forever`, { name: who });
    const span = choice === 'custom' && !customValid ? '…' : time.duration(minutes);
    return t(`punish.summary.${kind}`, { name: who, duration: span });
  })();

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      {target ? null : (
        <FieldBlock id={`${id}-player`} label={t('punish.player')} help={t('punish.playerHelp')}>
          <Input
            id={`${id}-player`}
            list={`${id}-suggestions`}
            autoComplete="off"
            maxLength={NAME_MAX}
            placeholder={t('punish.playerPlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <datalist id={`${id}-suggestions`}>
            {(suggestions.data?.players ?? []).map((p) => (
              <option key={p.uuid} value={p.name} />
            ))}
          </datalist>
        </FieldBlock>
      )}

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-semibold">{t('punish.kind')}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MOD_KINDS.map((k) => {
            const Icon = KIND_ICON[k];
            const offline = k === 'kick' && target?.online === false;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                disabled={offline}
                title={offline ? t('punish.kickOffline', { name: target?.name ?? '' }) : undefined}
                onClick={() => setKind(k)}
                className={cn(
                  'grid cursor-pointer justify-items-center gap-1.5 rounded-[12px] border px-2 py-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45',
                  kind === k
                    ? 'border-primary bg-accent text-foreground ring-3 ring-primary/15'
                    : 'border-input bg-secondary text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-5" aria-hidden />
                {t(`punish.verbs.${k}`)}
              </button>
            );
          })}
        </div>
        {target?.online === false ? (
          <p className="text-[13px] text-muted-foreground">
            {t('punish.kickOffline', { name: target.name })}
          </p>
        ) : null}
      </fieldset>

      {lasting ? (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-semibold">{t('punish.duration')}</legend>
          <div className="flex flex-wrap gap-2">
            {[...QUICK_MINUTES, 'forever' as const, 'custom' as const].map((c) => (
              <button
                key={String(c)}
                type="button"
                aria-pressed={choice === c}
                onClick={() => setChoice(c)}
                className={cn(
                  'cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
                  choice === c
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-secondary hover:bg-muted',
                )}
              >
                {typeof c === 'number' ? time.duration(c) : t(`punish.${c}`)}
              </button>
            ))}
          </div>
          {choice === 'custom' ? (
            <div className="grid gap-1.5">
              <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-2">
                <label htmlFor={`${id}-amount`} className="sr-only">
                  {t('punish.amount')}
                </label>
                <Input
                  id={`${id}-amount`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  className="tabular"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-invalid={!customValid}
                />
                <label htmlFor={`${id}-unit`} className="sr-only">
                  {t('punish.unit')}
                </label>
                <NativeSelect
                  id={`${id}-unit`}
                  value={unit}
                  onChange={(e) => setUnit(isUnit(e.target.value) ? e.target.value : unit)}
                >
                  {UNIT_NAMES.map((u) => (
                    <option key={u} value={u}>
                      {t(`punish.units.${u}`)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              {customValid ? null : (
                <p className="text-[13px] text-destructive">{t('punish.customInvalid')}</p>
              )}
            </div>
          ) : null}
        </fieldset>
      ) : null}

      <FieldBlock
        id={`${id}-reason`}
        label={t('punish.reason')}
        help={
          <span className="flex flex-wrap justify-between gap-x-3">
            <span>{t('punish.reasonHelp')}</span>
            <span className="tabular">{t('settings.chars', { count: reason.length, max: REASON_MAX })}</span>
          </span>
        }
      >
        <Textarea
          id={`${id}-reason`}
          rows={2}
          maxLength={REASON_MAX}
          placeholder={t('punish.reasonPlaceholder')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="min-h-20"
        />
        <div className="flex flex-wrap gap-1.5">
          {QUICK_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(t(`punish.reasons.${r}`))}
              className="cursor-pointer rounded-full border border-dashed border-input px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              {t(`punish.reasons.${r}`)}
            </button>
          ))}
        </div>
      </FieldBlock>

      <p className="flex items-start gap-2.5 rounded-[12px] bg-muted/70 px-3.5 py-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>{summary}</span>
      </p>

      {submit.isError ? (
        <p role="alert" className="rounded-[12px] bg-destructive-soft px-3.5 py-2.5 text-sm text-destructive">
          {errorText(submit.error)}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <DialogPrimitive.Close asChild>
          <Button variant="ghost">{t('punish.cancel')}</Button>
        </DialogPrimitive.Close>
        <Button type="submit" disabled={!valid || submit.isPending}>
          <SubmitIcon />
          {submit.isPending ? t('punish.busy') : t(`punish.verbs.${kind}`)}
        </Button>
      </div>
    </form>
  );
}

/**
 * Hand out a punishment: what (warn, mute, ban, kick), how long (quick choices or an own number) and why. With a
 * `target` the player is fixed (profile page); without, the name is typed in (punishments page).
 */
export function PunishDialog({
  open,
  onOpenChange,
  target,
  kind = 'warn',
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly target: PunishTarget | null;
  readonly kind?: ModKind;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/55 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-[20px] border border-border bg-popover p-5 text-popover-foreground shadow-float data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:p-6">
          <div className="grid gap-1 pr-10">
            <DialogPrimitive.Title className="font-display text-2xl font-semibold leading-tight">
              {target ? t('punish.titleFor', { name: target.name }) : t('punish.title')}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              {t('punish.text')}
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close asChild>
            <Button
              variant="ghost"
              size="iconSm"
              className="absolute right-4 top-4"
              aria-label={t('nav.close')}
            >
              <X />
            </Button>
          </DialogPrimitive.Close>
          <PunishForm target={target} initialKind={kind} onDone={() => onOpenChange(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
