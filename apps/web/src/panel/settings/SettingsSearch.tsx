import { CornerDownLeft, Search } from 'lucide-react';
import { useId, useMemo, useState, type KeyboardEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { SettingArea, SettingDef, SettingSection } from '@morninet/shared';
import { Kbd } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { usePick } from '~/lib/text';
import { areaIcon } from '../PanelShell';
import { useSettingsQuery } from '../session';

const MAX_RESULTS = 8;
const BLUR_CLOSE_MS = 120;
// Accents after NFD splitting: "ä" → "a" + U+0308; matches the combining marks, not the letters.
// "Größe".normalize('NFD') matches the mark after "o"; plain "Grosse" has none.
// https://regex101.com/?flavor=javascript&regex=%5B%5Cu0300-%5Cu036f%5D&flags=g&testString=Gro%CC%88%C3%9Fe
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Lower case, without accents, "ß" as "ss" – so "grosse" finds "Größe". */
function normalise(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(COMBINING_MARKS, '').replaceAll('ß', 'ss');
}

interface Hit {
  readonly area: SettingArea;
  readonly section: SettingSection;
  readonly def: SettingDef;
  readonly haystack: string;
}

function allSettings(areas: readonly SettingArea[]): Hit[] {
  return areas.flatMap((area) =>
    area.sections.flatMap((section) =>
      section.settings.map((def) => ({
        area,
        section,
        def,
        haystack: normalise(
          [
            def.label.de,
            def.label.en,
            def.help.de,
            def.help.en,
            def.command ?? '',
            def.key,
            section.title.de,
            section.title.en,
            area.title.de,
            area.title.en,
          ].join(' '),
        ),
      })),
    ),
  );
}

/** Where a setting lives: its area's page, scrolled to the field. */
export function settingHref(areaId: string, key: string): string {
  return `/einstellungen/${areaId}#setting-${key}`;
}

/**
 * Searches all settings the person may see (label, explanation, in-game command) across every area and jumps to
 * the one picked. Every word typed has to appear somewhere.
 */
export function SettingsSearch(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const navigate = useNavigate();
  const listId = useId();
  const settings = useSettingsQuery();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const index = useMemo(() => allSettings((settings.data ?? []).map((e) => e.area)), [settings.data]);
  const words = normalise(query).split(' ').filter(Boolean);
  const results = words.length
    ? index.filter((hit) => words.every((w) => hit.haystack.includes(w))).slice(0, MAX_RESULTS)
    : [];
  const showList = open && words.length > 0;

  const go = (hit: Hit | undefined): void => {
    if (!hit) return;
    navigate(settingHref(hit.area.id, hit.def.key));
    setQuery('');
    setOpen(false);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    const moves: Readonly<Record<string, () => void>> = {
      ArrowDown: () => setActive((a) => Math.min(a + 1, results.length - 1)),
      ArrowUp: () => setActive((a) => Math.max(a - 1, 0)),
      Enter: () => go(results[active]),
      Escape: () => setOpen(false),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    move();
  };

  return (
    <div className="relative">
      <label htmlFor={`${listId}-input`} className="sr-only">
        {t('settings.searchLabel')}
      </label>
      <Search
        className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        id={`${listId}-input`}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder={t('settings.search')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), BLUR_CLOSE_MS)}
        onKeyDown={onKey}
        className="h-12 w-full rounded-[14px] border border-input bg-card pl-11 pr-4 text-[15px] shadow-card transition-[border-color,box-shadow] placeholder:text-muted-foreground/80 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/20"
      />
      {!query ? (
        <span className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 text-xs text-muted-foreground md:block">
          {t('settings.searchHint')}
        </span>
      ) : null}
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+6px)] z-30 grid max-h-[min(70vh,480px)] gap-0.5 overflow-y-auto rounded-[14px] border border-border bg-popover p-1.5 shadow-float"
        >
          {results.length ? (
            results.map((hit, i) => {
              const Icon = areaIcon(hit.area.icon);
              return (
                <li
                  key={`${hit.area.id}:${hit.def.key}`}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(hit)}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-[10px] px-3 py-2.5',
                    i === active && 'bg-accent',
                  )}
                >
                  <span
                    className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[9px] bg-muted text-muted-foreground"
                    aria-hidden
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="text-xs text-muted-foreground">
                      {pick(hit.area.title)} › {pick(hit.section.title)}
                    </span>
                    <span className="font-semibold">{pick(hit.def.label)}</span>
                    {hit.def.command ? <Kbd className="justify-self-start">{hit.def.command}</Kbd> : null}
                  </span>
                  {i === active ? (
                    <CornerDownLeft className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  ) : null}
                </li>
              );
            })
          ) : (
            <li className="px-3 py-3 text-sm text-muted-foreground">{t('settings.noResults')}</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
