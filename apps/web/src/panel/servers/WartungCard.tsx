import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hammer, Megaphone, Power, RotateCcw, X } from 'lucide-react';
import { useEffect, useId, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  countdownWords,
  WARTUNG_REASON_MAX,
  WARTUNG_TIME_CHOICES,
  WARTUNG_TIME_DEFAULT,
  type WartungPlanKind,
  type WartungPlanView,
} from '@moinmorni/shared';
import { Button, Card, Input, Label, NativeSelect, Pill } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { useErrorText } from '~/lib/errors';
import { mmApi } from '~/lib/mm-api';

/**
 * Wartung als eine Sache (apps/server/src/hub/wartung-plan.ts): Wartung an/aus – sofort oder angekündigt mit großem
 * Titel und Countdown-Leiste im Spiel –, Wartungs-Neustart (alle in die Wartungs-Lobby, alle Server neu), laufender
 * Countdown, Fortschritt, Abbrechen. Dasselbe wie `/wartung …` im Spiel. Steht unter Einstellungen → Netzwerk und im
 * Fenster „Server neu starten“.
 */

export const WARTUNG_KEY = ['panel', 'wartung'] as const;
const POLL_IDLE_MS = 10_000;
const POLL_BUSY_MS = 1_000;
const SECOND_MS = 1000;
/** Wählbare Zeiten (Sekunden); 0 = sofort. */
const TIMES: readonly number[] = WARTUNG_TIME_CHOICES;
const DEFAULT_TIME = WARTUNG_TIME_DEFAULT;
const PERCENT = 100;

export function useWartung() {
  return useQuery({
    queryKey: WARTUNG_KEY,
    queryFn: () => mmApi<WartungPlanView>('/api/panel/wartung'),
    refetchInterval: (query) => (query.state.data?.plan ? POLL_BUSY_MS : POLL_IDLE_MS),
  });
}

function useLang(): 'de' | 'en' {
  const { i18n } = useTranslation(MM_NAMESPACE);
  return i18n.language.startsWith('en') ? 'en' : 'de';
}

/** Sekunden bis `at`, jede Sekunde neu. */
function useSecondsLeft(at: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!at) return undefined;
    const timer = setInterval(() => setNow(Date.now()), SECOND_MS);
    return () => clearInterval(timer);
  }, [at]);
  return at ? Math.max(0, Math.ceil((Date.parse(at) - now) / SECOND_MS)) : 0;
}

/** Was gerade läuft: angekündigt (Countdown) oder Neustart (Fortschritt) – mit Abbrechen. */
export function WartungRunning({ view }: { readonly view: WartungPlanView }): ReactElement | null {
  const { t } = useTranslation(MM_NAMESPACE);
  const lang = useLang();
  const errorText = useErrorText();
  const client = useQueryClient();
  const plan = view.plan;
  const left = useSecondsLeft(plan?.at ?? null);
  const cancel = useMutation({
    mutationFn: () => mmApi<WartungPlanView>('/api/panel/wartung/abbrechen', { method: 'POST' }),
    onSuccess: (next) => {
      client.setQueryData(WARTUNG_KEY, next);
      toast.success(t('wartung.cancelled'));
    },
    onError: (err) => toast.error(errorText(err)),
  });
  if (!plan) return null;
  const what = t(plan.kind === 'restart' ? 'wartung.kind.restart' : 'wartung.kind.on');
  if (plan.phase === 'restarting') {
    const done = plan.progress?.done ?? 0;
    const total = plan.progress?.total ?? 0;
    return (
      <div className="grid gap-2 rounded-[12px] bg-gold-soft px-3.5 py-3 text-sm" role="status">
        <p className="flex items-center gap-2 font-semibold">
          <RotateCcw className="size-4 animate-spin text-gold [animation-duration:2.4s]" aria-hidden />
          {t('wartung.restarting', { done, total })}
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-background/60">
          <div
            className="h-full rounded-full bg-gold transition-[width] duration-700"
            style={{ width: `${total ? Math.round((done / total) * PERCENT) : 0}%` }}
          />
        </div>
        <p className="text-muted-foreground">{t('wartung.restartingText')}</p>
      </div>
    );
  }
  return (
    <div className="grid gap-2 rounded-[12px] bg-gold-soft px-3.5 py-3 text-sm" role="status">
      <p className="flex flex-wrap items-center gap-2">
        <Megaphone className="size-4 text-gold" aria-hidden />
        <span className="font-semibold">{t('wartung.announced', { what })}</span>
        <span className="tabular font-display text-lg font-semibold">{countdownWords(left, lang)}</span>
      </p>
      {plan.reason ? <p>{t('wartung.reasonShown', { reason: plan.reason })}</p> : null}
      <p className="text-muted-foreground">{t('wartung.by', { by: plan.by })}</p>
      <div>
        <Button size="sm" variant="secondary" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
          <X />
          {t('wartung.cancel')}
        </Button>
      </div>
    </div>
  );
}

function goLabel(kind: WartungPlanKind, seconds: number): string {
  if (kind === 'restart') return 'wartung.goRestart';
  return seconds ? 'wartung.goAnnounce' : 'wartung.goNow';
}

/** Formular: Zeit, Grund (Titel, Chat, Wartungs-Text) und – beim Neustart – den Proxy mitnehmen. */
export function WartungForm({
  kind,
  view,
  onSent,
}: {
  readonly kind: WartungPlanKind;
  readonly view: WartungPlanView;
  readonly onSent?: () => void;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const lang = useLang();
  const errorText = useErrorText();
  const client = useQueryClient();
  const baseId = useId();
  const [seconds, setSeconds] = useState(DEFAULT_TIME);
  const [reason, setReason] = useState('');
  const [proxy, setProxy] = useState(false);
  const send = useMutation({
    mutationFn: () =>
      mmApi<WartungPlanView>('/api/panel/wartung', {
        method: 'POST',
        body: { kind, seconds, reason: reason.trim(), proxy: kind === 'restart' && proxy },
      }),
    onSuccess: (next) => {
      client.setQueryData(WARTUNG_KEY, next);
      setReason('');
      toast.success(t(seconds ? 'wartung.sentAnnounced' : 'wartung.sentNow'));
      onSent?.();
    },
    onError: (err) => toast.error(errorText(err)),
  });
  const busy = view.plan !== null;
  const blocked =
    busy || (kind === 'restart' && !view.canRestart) || (kind === 'on' && view.maintenance && !seconds);
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
        <div className="grid gap-1.5">
          <Label htmlFor={`${baseId}-time`}>{t('wartung.when')}</Label>
          <NativeSelect
            id={`${baseId}-time`}
            value={String(seconds)}
            onChange={(e) => setSeconds(Number(e.target.value))}
          >
            {TIMES.map((s) => (
              <option key={s} value={s}>
                {s ? t('wartung.in', { time: countdownWords(s, lang) }) : t('wartung.now')}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${baseId}-reason`}>{t('wartung.reason')}</Label>
          <Input
            id={`${baseId}-reason`}
            value={reason}
            maxLength={WARTUNG_REASON_MAX}
            placeholder={t('wartung.reasonPlaceholder')}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>
      {kind === 'restart' ? (
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={proxy}
            onChange={(e) => setProxy(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
          />
          <span>
            <span className="font-semibold">{t('wartung.proxy')}</span>{' '}
            <span className="text-muted-foreground">{t('wartung.proxyText')}</span>
          </span>
        </label>
      ) : null}
      <p className="text-sm text-muted-foreground">
        {t(kind === 'restart' ? 'wartung.restartExplain' : 'wartung.onExplain')}
      </p>
      {kind === 'restart' && !view.canRestart ? (
        <p className="text-sm text-warning">{t('wartung.noRestart')}</p>
      ) : null}
      <div className="flex justify-end">
        <Button variant="primary" disabled={blocked || send.isPending} onClick={() => send.mutate()}>
          {kind === 'restart' ? <RotateCcw /> : <Hammer />}
          {t(goLabel(kind, seconds))}
        </Button>
      </div>
    </div>
  );
}

/** Karte unter Einstellungen → Netzwerk: Stand, laufende Ankündigung, Wartung an (oder aus), Wartungs-Neustart. */
export function WartungCard(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const client = useQueryClient();
  const query = useWartung();
  const [kind, setKind] = useState<WartungPlanKind>('on');
  const off = useMutation({
    mutationFn: () => mmApi<WartungPlanView>('/api/panel/wartung/aus', { method: 'POST' }),
    onSuccess: (next) => {
      client.setQueryData(WARTUNG_KEY, next);
      void client.invalidateQueries({ queryKey: ['panel', 'settings'] });
      toast.success(t('wartung.offDone'));
    },
    onError: (err) => toast.error(errorText(err)),
  });
  const view = query.data;
  return (
    <Card className="grid gap-4 p-5" data-tour="wartung">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-10 place-items-center rounded-[12px] bg-accent text-primary" aria-hidden>
          <Hammer className="size-5" />
        </span>
        <div className="grid min-w-0 flex-1">
          <h3 className="font-display text-lg font-semibold">{t('wartung.title')}</h3>
          <p className="text-sm text-muted-foreground">{t('wartung.text')}</p>
        </div>
        {view ? (
          <Pill tone={view.maintenance ? 'gold' : 'success'} dot>
            {t(view.maintenance ? 'wartung.isOn' : 'wartung.isOff')}
          </Pill>
        ) : null}
      </div>
      {view ? <WartungRunning view={view} /> : null}
      {view?.maintenance && view.plan?.phase !== 'restarting' ? (
        <div>
          <Button variant="secondary" disabled={off.isPending} onClick={() => off.mutate()}>
            <Power />
            {t('wartung.off')}
          </Button>
        </div>
      ) : null}
      {view && !view.plan ? (
        <div className="grid gap-3 rounded-[14px] border border-border p-3.5">
          <div className="flex flex-wrap gap-2" role="tablist">
            {(['on', 'restart'] as const).map((k) => (
              <Button
                key={k}
                size="sm"
                role="tab"
                aria-selected={kind === k}
                variant={kind === k ? 'primary' : 'ghost'}
                onClick={() => setKind(k)}
              >
                {t(k === 'restart' ? 'wartung.kind.restart' : 'wartung.kind.on')}
              </Button>
            ))}
          </div>
          <WartungForm kind={kind} view={view} />
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{t('wartung.ingame')}</p>
    </Card>
  );
}
