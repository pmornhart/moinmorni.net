import { Plus, X } from 'lucide-react';
import { useState, type KeyboardEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { onStep, type SettingDef } from '@morninet/shared';
import { Button, Input, NativeSelect, Switch, Textarea } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { usePick } from '~/lib/text';

type Def<K extends SettingDef['type']> = Extract<SettingDef, { type: K }>;

/** Whether `value` is allowed for this setting (the server checks the same with the catalog's schema). */
export function valueValid(def: SettingDef, value: unknown): boolean {
  const checks: { [K in SettingDef['type']]: (d: Def<K>) => boolean } = {
    boolean: () => typeof value === 'boolean',
    number: (d) => typeof value === 'number' && onStep(value, d.step) && value >= d.min && value <= d.max,
    text: (d) => typeof value === 'string' && value.length <= d.maxLength,
    select: (d) => d.options.some((o) => o.value === value),
    list: (d) => Array.isArray(value) && value.length <= d.maxItems,
  };
  return (checks[def.type] as (d: SettingDef) => boolean)(def);
}

export function fieldId(key: string): string {
  return `field-${key}`;
}

interface FieldProps<K extends SettingDef['type']> {
  readonly def: Def<K>;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
}

function BooleanField({ def, value, onChange }: FieldProps<'boolean'>): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const on = value === true;
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn('text-sm font-semibold', on ? 'text-primary' : 'text-muted-foreground')}
        aria-hidden
      >
        {on ? t('settings.on') : t('settings.off')}
      </span>
      <Switch id={fieldId(def.key)} checked={on} onCheckedChange={(checked) => onChange(checked)} />
    </div>
  );
}

function NumberField({ def, value, onChange }: FieldProps<'number'>): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const invalid = !valueValid(def, value);
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2.5">
        <Input
          id={fieldId(def.key)}
          type="number"
          inputMode={def.step ? 'decimal' : 'numeric'}
          min={def.min}
          max={def.max}
          step={def.step ?? 1}
          value={typeof value === 'number' ? value : String(value ?? '')}
          aria-invalid={invalid}
          className={cn(
            'tabular w-32 shrink-0',
            invalid && 'border-destructive focus-visible:border-destructive',
          )}
          onChange={(e) => {
            const parsed = e.target.valueAsNumber;
            onChange(Number.isNaN(parsed) ? e.target.value : parsed);
          }}
        />
        {def.unit ? <span className="min-w-0 text-sm text-muted-foreground">{pick(def.unit)}</span> : null}
      </div>
      <span className={cn('text-xs', invalid ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
        {t('settings.range', { min: def.min, max: def.max })}
      </span>
    </div>
  );
}

/** Texts this short (a sign, a word) get a small box instead of a full-width one. */
const SHORT_TEXT = 8;
/** A multi-line box grows with its lines (one spare line), between these heights. */
const MIN_ROWS = 4;
const MAX_ROWS = 16;

function rowsFor(text: string): number {
  return Math.min(MAX_ROWS, Math.max(MIN_ROWS, text.split('\n').length + 1));
}

function TextField({ def, value, onChange }: FieldProps<'text'>): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const text = typeof value === 'string' ? value : '';
  const props = {
    id: fieldId(def.key),
    value: text,
    maxLength: def.maxLength,
    spellCheck: true,
  } as const;
  return (
    <div className="grid gap-1.5">
      {def.multiline ? (
        <Textarea {...props} rows={rowsFor(text)} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input
          {...props}
          className={def.maxLength <= SHORT_TEXT ? 'w-32 font-mono' : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      <span
        className={cn(
          'tabular text-xs text-muted-foreground',
          def.maxLength > SHORT_TEXT && 'justify-self-end',
        )}
      >
        {t('settings.chars', { count: text.length, max: def.maxLength })}
      </span>
    </div>
  );
}

function SelectField({ def, value, onChange }: FieldProps<'select'>): ReactElement {
  const pick = usePick();
  return (
    <NativeSelect id={fieldId(def.key)} value={String(value)} onChange={(e) => onChange(e.target.value)}>
      {def.options.map((o) => (
        <option key={o.value} value={o.value}>
          {pick(o.label)}
        </option>
      ))}
    </NativeSelect>
  );
}

function ListField({ def, value, onChange }: FieldProps<'list'>): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const items: readonly string[] = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
  const [draft, setDraft] = useState('');
  const entry = draft.trim();
  const full = items.length >= def.maxItems;
  const duplicate = items.some((i) => i.toLowerCase() === entry.toLowerCase());
  const add = (): void => {
    if (!entry || full || duplicate) return;
    onChange([...items, entry]);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    add();
  };
  const note = ((): string => {
    if (full) return t('settings.listFull');
    if (entry && duplicate) return t('settings.listDuplicate');
    return t('settings.listCount', { count: items.length, max: def.maxItems });
  })();
  return (
    <div className="grid gap-3">
      {items.length ? (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li
              key={item}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/70 py-1 pl-3 pr-1 text-sm font-medium"
            >
              <span className="min-w-0 [overflow-wrap:anywhere]">{item}</span>
              <button
                type="button"
                onClick={() => onChange(items.filter((i) => i !== item))}
                className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive"
                aria-label={t('settings.listRemove', { item })}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t('settings.listEmpty')}</p>
      )}
      <div className="flex gap-2">
        <Input
          id={fieldId(def.key)}
          value={draft}
          maxLength={def.maxLength}
          placeholder={t('settings.listPlaceholder')}
          disabled={full}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
        />
        <Button variant="secondary" className="h-11" onClick={add} disabled={!entry || full || duplicate}>
          <Plus />
          <span className="max-sm:sr-only">{t('settings.listAdd')}</span>
        </Button>
      </div>
      <span
        className={cn(
          'text-xs',
          full || (entry && duplicate) ? 'font-semibold text-warning' : 'text-muted-foreground',
        )}
      >
        {note}
      </span>
    </div>
  );
}

/** The input that fits the setting's type (switch, number, text, choice, list). */
export function SettingInput({
  def,
  value,
  onChange,
}: {
  readonly def: SettingDef;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
}): ReactElement {
  const inputs: { [K in SettingDef['type']]: (p: FieldProps<K>) => ReactElement } = {
    boolean: BooleanField,
    number: NumberField,
    text: TextField,
    select: SelectField,
    list: ListField,
  };
  const Input = inputs[def.type] as (p: FieldProps<SettingDef['type']>) => ReactElement;
  return <Input def={def as Def<SettingDef['type']>} value={value} onChange={onChange} />;
}
