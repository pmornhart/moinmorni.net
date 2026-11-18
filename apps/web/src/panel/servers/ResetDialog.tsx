import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { Eraser, ShieldAlert, X } from 'lucide-react';
import { useId, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  RESET_ALL_WORD,
  RESET_WHATS,
  resetConfirmOk,
  type ResetOverview,
  type ResetStep,
  type ResetWhat,
} from '@moinmorni/shared';
import { Button, Input, Pill, Skeleton, type PillTone } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { useErrorText } from '~/lib/errors';
import { mmApi } from '~/lib/mm-api';
import { usePick } from '~/lib/text';
import { usePanel } from '../session';

/**
 * Panel → Server → „Zurücksetzen“ (nur Owner, apps/server/src/panel/reset-routes.ts): Welt, Spielstand oder beides
 * eines oder mehrerer Server löschen – mit Sicherung vorher und Bestätigung durch Eintippen des Namens bzw. „ALLE“.
 */

const RESET_KEY = ['panel', 'servers', 'reset'] as const;
const POLL_IDLE_MS = 10_000;
const POLL_BUSY_MS = 2_000;
const OWNER = 'owner';
const STEP_TONE: Readonly<Record<ResetStep, PillTone>> = {
  backup: 'blue',
  waiting: 'neutral',
  wiping: 'gold',
  done: 'success',
  failed: 'danger',
};

function ResetBody({ onDone }: { readonly onDone: () => void }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const errorText = useErrorText();
  const client = useQueryClient();
  const baseId = useId();
  const query = useQuery({
    queryKey: RESET_KEY,
    queryFn: () => mmApi<ResetOverview>('/api/panel/servers/reset'),
    refetchInterval: (q) => (q.state.data?.progress.running ? POLL_BUSY_MS : POLL_IDLE_MS),
  });
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [what, setWhat] = useState<ResetWhat>('progress');
  const [confirm, setConfirm] = useState('');
  const submit = useMutation({
    mutationFn: () =>
      mmApi<{ started: string[] }>('/api/panel/servers/reset', {
        method: 'POST',
        body: { servers: [...picked], what, confirm },
      }),
    onSuccess: () => {
      toast.success(t('resetDialog.started'));
      setPicked(new Set());
      setConfirm('');
      void client.invalidateQueries({ queryKey: RESET_KEY });
    },
    onError: (err) => toast.error(errorText(err)),
  });
  if (query.isPending) return <Skeleton className="h-64 rounded-[16px]" />;
  if (query.isError) return <p className="text-sm text-muted-foreground">{errorText(query.error)}</p>;
  const servers = query.data.servers;
  const steps = new Map(query.data.progress.servers.map((s) => [s.member, s.step]));
  const chosen = servers.filter((s) => picked.has(s.member));
  const one = chosen[0];
  const word = chosen.length > 1 || !one ? RESET_ALL_WORD : pick(one.name);
  const ok = resetConfirmOk(confirm, chosen) && !query.data.progress.running;
  const toggle = (member: string, on: boolean): void => {
    const next = new Set(picked);
    if (on) next.add(member);
    else next.delete(member);
    setPicked(next);
  };
  return (
    <div className="grid gap-4">
      <label className="flex cursor-pointer items-center gap-3 rounded-[12px] border border-border px-3 py-2.5">
        <input
          type="checkbox"
          checked={chosen.length === servers.length && servers.length > 0}
          onChange={(e) => setPicked(new Set(e.target.checked ? servers.map((s) => s.member) : []))}
          className="size-4 accent-[var(--primary)]"
        />
        <span className="flex-1 font-semibold">{t('resetDialog.all')}</span>
      </label>
      <ul className="grid max-h-[34dvh] gap-1 overflow-y-auto pr-1">
        {servers.map((s) => {
          const id = `${baseId}-${s.member}`;
          const step = steps.get(s.member);
          return (
            <li key={s.member}>
              <label
                htmlFor={id}
                className="flex cursor-pointer items-center gap-3 rounded-[12px] px-2 py-1.5 hover:bg-secondary"
              >
                <input
                  id={id}
                  type="checkbox"
                  checked={picked.has(s.member)}
                  onChange={(e) => toggle(s.member, e.target.checked)}
                  className="size-4 accent-[var(--primary)]"
                />
                <span className="flex-1 truncate font-semibold">{pick(s.name)}</span>
                {step ? (
                  <Pill tone={STEP_TONE[step]} dot>
                    {t(`resetDialog.step.${step}`)}
                  </Pill>
                ) : null}
              </label>
            </li>
          );
        })}
      </ul>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1 text-sm font-semibold">{t('resetDialog.what')}</legend>
        {RESET_WHATS.map((w) => (
          <label
            key={w}
            className="flex cursor-pointer items-start gap-2 rounded-[10px] px-2 py-1 hover:bg-secondary"
          >
            <input
              type="radio"
              name={`${baseId}-what`}
              checked={what === w}
              onChange={() => setWhat(w)}
              className="mt-1 accent-[var(--primary)]"
            />
            <span className="grid">
              <span className="font-semibold">{t(`resetDialog.whats.${w}`)}</span>
              <span className="text-xs text-muted-foreground">{t(`resetDialog.whatsHint.${w}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="flex items-start gap-2 rounded-[12px] bg-secondary px-3.5 py-3 text-sm text-muted-foreground">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        {t('resetDialog.keeps')}
      </p>
      {chosen.length ? (
        <label className="grid gap-1.5 text-sm">
          {t('resetDialog.confirmLabel', { word })}
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </label>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          {t('resetDialog.close')}
        </Button>
        <Button variant="danger" disabled={!ok || submit.isPending} onClick={() => submit.mutate()}>
          <Eraser />
          {t('resetDialog.confirm', { count: chosen.length })}
        </Button>
      </div>
    </div>
  );
}

/** Knopf + Fenster; nur für den Owner. */
export function ResetButton(): ReactElement | null {
  const { t } = useTranslation(MM_NAMESPACE);
  const me = usePanel();
  const [open, setOpen] = useState(false);
  if (me.role.id !== OWNER) return null;
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="outline" size="md">
          <Eraser />
          {t('resetDialog.button')}
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/55" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-[20px] border border-border bg-popover p-5 text-popover-foreground shadow-float sm:p-6">
          <div className="grid gap-1 pr-10">
            <DialogPrimitive.Title className="font-display text-2xl font-semibold leading-tight">
              {t('resetDialog.title')}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              {t('resetDialog.text')}
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close asChild>
            <Button
              variant="ghost"
              size="iconSm"
              className="absolute right-4 top-4"
              aria-label={t('resetDialog.close')}
            >
              <X />
            </Button>
          </DialogPrimitive.Close>
          {open ? <ResetBody onDone={() => setOpen(false)} /> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
