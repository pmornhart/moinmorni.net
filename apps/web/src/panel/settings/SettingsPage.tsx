import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Gamepad2, RotateCcw, Save } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router';
import { toast } from 'sonner';
import type { SettingDef, SettingSection } from '@moinmorni/shared';
import { Button, Card, Kbd, Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useErrorText } from '~/lib/errors';
import { mmApi } from '~/lib/mm-api';
import { usePick } from '~/lib/text';
import { areaIcon, PageHead } from '../PanelShell';
import { SETTINGS_KEY, useSettingsQuery, type SettingsEntry } from '../session';
import { fieldId, SettingInput, valueValid } from './fields';
import { SettingsSearch } from './SettingsSearch';

const FLASH_MS = 3200;
const SETTING_ANCHOR = '#setting-';

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Wide inputs (lists, long texts) go below the explanation, switches stay next to it. */
function layoutOf(def: SettingDef): 'inline' | 'side' | 'below' {
  if (def.type === 'boolean') return 'inline';
  if (def.type === 'list' || (def.type === 'text' && def.multiline)) return 'below';
  return 'side';
}

function SettingRow({
  def,
  value,
  changed,
  onChange,
}: {
  readonly def: SettingDef;
  readonly value: unknown;
  readonly changed: boolean;
  readonly onChange: (value: unknown) => void;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const layout = layoutOf(def);
  const input = <SettingInput def={def} value={value} onChange={onChange} />;
  return (
    <div
      id={`setting-${def.key}`}
      className={cn(
        'relative -mx-3 grid scroll-mt-28 gap-x-8 gap-y-3 px-3 py-5 sm:-mx-4 sm:px-4',
        layout === 'side' && 'md:grid-cols-[minmax(0,1fr)_minmax(240px,340px)]',
      )}
    >
      {changed ? (
        <span
          className="absolute left-0 top-7 size-1.5 rounded-full bg-gold sm:left-1"
          title={t('settings.unsaved_one', { count: 1 })}
        />
      ) : null}
      <div className="grid min-w-0 content-start gap-1.5">
        <div className="flex items-start justify-between gap-4">
          <label htmlFor={fieldId(def.key)} className="pt-0.5 font-semibold leading-snug">
            {pick(def.label)}
          </label>
          {layout === 'inline' ? input : null}
        </div>
        <p className="max-w-[68ch] text-sm leading-relaxed text-muted-foreground text-pretty">
          {pick(def.help)}
        </p>
        {def.command ? (
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Gamepad2 className="size-3.5" aria-hidden />
            {t('settings.inGame')}
            <Kbd>{def.command}</Kbd>
          </p>
        ) : null}
      </div>
      {layout === 'inline' ? null : <div className="min-w-0">{input}</div>}
    </div>
  );
}

function SectionCard({
  section,
  draft,
  saved,
  onChange,
}: {
  readonly section: SettingSection;
  readonly draft: Readonly<Record<string, unknown>>;
  readonly saved: Readonly<Record<string, unknown>>;
  readonly onChange: (key: string, value: unknown) => void;
}): ReactElement {
  const pick = usePick();
  return (
    <Card className="grid gap-1 px-5 pt-5 pb-1 sm:px-7 sm:pt-6">
      <div className="grid gap-1 border-b border-border pb-4">
        <h2 className="font-display text-xl font-semibold">{pick(section.title)}</h2>
        {section.text ? <p className="text-sm text-muted-foreground">{pick(section.text)}</p> : null}
      </div>
      <div className="grid divide-y divide-border">
        {section.settings.map((def) => (
          <SettingRow
            key={def.key}
            def={def}
            value={draft[def.key]}
            changed={!same(draft[def.key], saved[def.key])}
            onChange={(value) => onChange(def.key, value)}
          />
        ))}
      </div>
    </Card>
  );
}

function AreaForm({ entry }: { readonly entry: SettingsEntry }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { area, values } = entry;
  const [draft, setDraft] = useState<Readonly<Record<string, unknown>>>(values);
  const base = useRef(values);
  // New values from the server (saved elsewhere, e.g. by a command in the game): take them over for every field
  // this person has not touched.
  useEffect(() => {
    const before = base.current;
    if (before === values) return;
    setDraft((d) =>
      Object.fromEntries(Object.keys(values).map((k) => [k, same(d[k], before[k]) ? values[k] : d[k]])),
    );
    base.current = values;
  }, [values]);
  const defs = area.sections.flatMap((s) => s.settings);
  const changed = defs.filter((d) => !same(draft[d.key], values[d.key]));
  const valid = changed.every((d) => valueValid(d, draft[d.key]));

  const save = useMutation({
    mutationFn: () =>
      mmApi<Record<string, unknown>>(`/api/panel/settings/${area.id}`, {
        method: 'PUT',
        body: Object.fromEntries(changed.map((d) => [d.key, draft[d.key]])),
      }),
    onSuccess: (fresh) => {
      queryClient.setQueryData<SettingsEntry[]>(SETTINGS_KEY, (list) =>
        list?.map((e) => (e.area.id === area.id ? { ...e, values: fresh } : e)),
      );
      setDraft(fresh);
      toast.success(t('settings.saved'));
    },
    onError: (err) => toast.error(errorText(err)),
  });

  return (
    <>
      <div className="grid gap-[22px]">
        {area.sections.map((section) => (
          <SectionCard
            key={section.id}
            section={section}
            draft={draft}
            saved={values}
            onChange={(key, value) => setDraft((d) => ({ ...d, [key]: value }))}
          />
        ))}
      </div>
      <div
        className={cn(
          'sticky bottom-4 z-20 transition-[opacity,transform] duration-200',
          changed.length ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0',
        )}
        aria-hidden={!changed.length}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-gold/40 bg-popover/95 px-4 py-3 shadow-float backdrop-blur sm:px-5">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span className="size-2 rounded-full bg-gold" aria-hidden />
            {t('settings.unsaved', { count: changed.length })}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDraft(values)} disabled={save.isPending}>
              <RotateCcw />
              {t('settings.discard')}
            </Button>
            <Button onClick={() => save.mutate()} disabled={!valid || save.isPending}>
              <Save />
              {save.isPending ? t('settings.saving') : t('settings.save')}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

/** Jumps to a setting named in the address ("#setting-slowMode") and lets it glow for a moment. */
function useJumpToSetting(ready: boolean): void {
  const { hash } = useLocation();
  useEffect(() => {
    if (!ready || !hash.startsWith(SETTING_ANCHOR)) return undefined;
    const row = document.getElementById(hash.slice(1));
    if (!row) return undefined;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('mm-flash');
    document.getElementById(fieldId(hash.slice(SETTING_ANCHOR.length)))?.focus({ preventScroll: true });
    const timer = window.setTimeout(() => row.classList.remove('mm-flash'), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [hash, ready]);
}

/** One settings area (Network, Chat, …), generated from the catalog, with the search over all areas on top. */
export function SettingsPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const { areaId } = useParams();
  const settings = useSettingsQuery();
  const entry = settings.data?.find((e) => e.area.id === areaId);
  useJumpToSetting(Boolean(entry));

  return (
    <>
      <SettingsSearch />
      {settings.isPending ? <Skeleton className="h-96 rounded-[16px]" /> : null}
      {settings.data && !entry ? (
        <Card className="p-6 text-muted-foreground">{t('settings.missing')}</Card>
      ) : null}
      {entry ? (
        <>
          <PageHead
            icon={areaIcon(entry.area.icon)}
            title={pick(entry.area.title)}
            text={pick(entry.area.text)}
          />
          <AreaForm key={entry.area.id} entry={entry} />
        </>
      ) : null}
    </>
  );
}
