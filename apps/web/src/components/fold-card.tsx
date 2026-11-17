import { ChevronDown, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useId, useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';

/*
 * A card (or plain section) that folds open and closed – the panel's building block for long pages.
 *
 *   <FoldCard id="discord-ranks" title="Ränge" summary="8 Ränge" defaultOpen={false}>…</FoldCard>
 *
 * - Open/closed is remembered per `id` in this browser (localStorage, falls back to `defaultOpen` when blocked).
 * - The header is a real button with aria-expanded/aria-controls (keyboard: Tab, Enter/Space).
 * - Closed, the header shows `summary` (e.g. "3 geändert" or the most important value).
 * - The content stays mounted (inputs keep their state) and is `inert` while closed; it slides with a grid-rows
 *   transition that the global "reduce motion" rule switches off.
 * - `openFold(id)` or `revealFold(element)` open a fold from outside (search hits, jump links, #anchors).
 */

const STORE = 'mm:fold:';
const OPEN_EVENT = 'mm-fold-open';

function readSaved(id: string, initial: boolean): boolean {
  try {
    const saved = window.localStorage.getItem(STORE + id);
    return saved === null ? initial : saved === '1';
  } catch {
    return initial;
  }
}

function save(id: string, open: boolean): void {
  try {
    window.localStorage.setItem(STORE + id, open ? '1' : '0');
  } catch {
    // Storage blocked: the fold still works, it just forgets it.
  }
}

/** Open/closed of one fold, remembered per id; listens for `openFold(id)`. */
export function useFold(id: string, initial = true): readonly [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(() => readSaved(id, initial));
  const change = useCallback(
    (next: boolean) => {
      setOpen(next);
      save(id, next);
    },
    [id],
  );
  useEffect(() => {
    const onOpen = (e: Event): void => {
      if ((e as CustomEvent<string>).detail === id) change(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [id, change]);
  return [open, change] as const;
}

/** Opens the fold with this id (wherever it is on the page). */
export function openFold(id: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
}

/** All folds around an element, innermost first. */
function foldsAround(element: Element | null): readonly HTMLElement[] {
  const fold = element?.parentElement?.closest<HTMLElement>('[data-fold]') ?? null;
  return fold ? [fold, ...foldsAround(fold)] : [];
}

/** Opens every fold around an element (e.g. before scrolling to a setting inside a closed section). */
export function revealFold(element: Element | null): void {
  foldsAround(element)
    .filter((node) => node.dataset.fold && node.dataset.open !== 'true')
    .forEach((node) => openFold(node.dataset.fold ?? ''));
}

export interface FoldCardProps {
  /** Key for the remembered state, unique in the panel (e.g. "settings:lobby:music"). */
  readonly id: string;
  readonly title: ReactNode;
  readonly icon?: LucideIcon;
  /** Short explanation under the title (only while open). */
  readonly text?: ReactNode;
  /** Shown next to the title while closed: a count, the most important value … */
  readonly summary?: ReactNode;
  /** Buttons on the right of the header – clicking them does not fold. */
  readonly actions?: ReactNode;
  /** Open on the first visit; afterwards the viewer's own choice counts. */
  readonly defaultOpen?: boolean;
  /** Heading level of the title. */
  readonly as?: 'h2' | 'h3';
  /** `card`: own card with border; `plain`: only the header line (inside an existing card). */
  readonly look?: 'card' | 'plain';
  readonly className?: string;
  readonly bodyClassName?: string;
  /** Extra id on the outer element (jump target). */
  readonly anchor?: string;
  readonly children: ReactNode;
}

export function FoldCard({
  id,
  title,
  icon: Icon,
  text,
  summary,
  actions,
  defaultOpen = true,
  as: Heading = 'h2',
  look = 'card',
  className,
  bodyClassName,
  anchor,
  children,
}: FoldCardProps): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const [open, setOpen] = useFold(id, defaultOpen);
  const bodyId = useId();
  const card = look === 'card';
  return (
    <section
      id={anchor}
      data-fold={id}
      data-open={open}
      className={cn(
        'min-w-0 scroll-mt-28',
        card && 'rounded-[16px] border border-border bg-card text-card-foreground shadow-card',
        className,
      )}
    >
      <div className={cn('flex min-w-0 items-center gap-2', card ? 'px-5 py-4 sm:px-7' : 'py-3')}>
        <Heading className="m-0 min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            title={open ? t('fold.close') : t('fold.open')}
            onClick={() => setOpen(!open)}
            className="group -m-1.5 flex w-[calc(100%+12px)] min-w-0 cursor-pointer items-center gap-3 rounded-[12px] p-1.5 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/25"
          >
            {Icon ? (
              <span
                className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-gold-soft text-gold"
                aria-hidden
              >
                <Icon className="size-[18px]" />
              </span>
            ) : null}
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-display text-xl font-semibold leading-tight">{title}</span>
              {!open && summary ? (
                <span className="min-w-0 text-sm font-normal text-muted-foreground">{summary}</span>
              ) : null}
            </span>
            <ChevronDown
              className={cn(
                'size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:text-foreground',
                open && 'rotate-180',
              )}
              aria-hidden
            />
          </button>
        </Heading>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      <div
        id={bodyId}
        role="region"
        inert={!open}
        className={cn(
          'grid transition-[grid-template-rows,opacity,visibility] duration-200 ease-out',
          open ? 'visible grid-rows-[1fr] opacity-100' : 'invisible grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className={cn(card && 'border-t border-border px-5 pb-5 pt-4 sm:px-7', bodyClassName)}>
            {text ? <p className="mb-3 text-sm text-muted-foreground text-pretty">{text}</p> : null}
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
