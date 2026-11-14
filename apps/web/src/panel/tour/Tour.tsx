import {
  ArrowLeft,
  ArrowRight,
  Check,
  Gamepad2,
  Gavel,
  LayoutDashboard,
  MessagesSquare,
  Newspaper,
  Server,
  Settings2,
  ShieldHalf,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { PanelArea } from '@moinmorni/shared';
import { Button } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { usePanel, useSettingsQuery } from '../session';

/**
 * The panel tour for the team: on the first visit (per person and browser) a few steps through the menu – a
 * darkened page, the menu entry lit up and a speech bubble next to it. On phones the menu is a bar, so the steps
 * come as simple cards. It can be started again from the account box at the bottom left.
 */

type StepId =
  'overview' | 'modes' | 'settings' | 'news' | 'players' | 'punishments' | 'roles' | 'discord' | 'servers';

interface TourStep {
  readonly id: StepId;
  readonly icon: LucideIcon;
  /** The panel area it belongs to; settings show when the person sees any settings area. */
  readonly area: PanelArea | null;
}

const STEPS: readonly TourStep[] = [
  { id: 'overview', icon: LayoutDashboard, area: 'overview' },
  { id: 'modes', icon: Gamepad2, area: 'modes' },
  { id: 'settings', icon: Settings2, area: null },
  { id: 'news', icon: Newspaper, area: 'content' },
  { id: 'players', icon: UsersRound, area: 'players' },
  { id: 'punishments', icon: Gavel, area: 'punishments' },
  { id: 'roles', icon: ShieldHalf, area: 'roles' },
  { id: 'discord', icon: MessagesSquare, area: 'discord' },
  { id: 'servers', icon: Server, area: 'servers' },
];

const STORAGE_PREFIX = 'mm-tour-done:';
const START_DELAY_MS = 700;
const DESKTOP_QUERY = '(min-width: 1024px)';
/** Room around the lit-up entry, gap to the bubble, distance to the window edge, arrow inset (px). */
const SPOT_PAD = 6;
const BUBBLE_GAP = 18;
const EDGE = 16;
const ARROW_INSET = 22;
const HALF = 2;
const SPOT_SHADOW = '0 0 0 9999px rgba(4, 12, 9, 0.64)';

function seen(username: string): boolean {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${username}`) !== null;
  } catch {
    return false;
  }
}

function markSeen(username: string): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${username}`, new Date().toISOString());
  } catch {
    // Private windows may refuse storage; then the tour simply comes again next time.
  }
}

const desktop = window.matchMedia(DESKTOP_QUERY);

function useDesktop(): boolean {
  return useSyncExternalStore(
    (notify) => {
      desktop.addEventListener('change', notify);
      return () => desktop.removeEventListener('change', notify);
    },
    () => desktop.matches,
  );
}

/** Where the step's menu entry sits in the side menu (null on phones or when it is not there). */
function useTargetRect(id: StepId, active: boolean): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    const el = active ? document.querySelector(`[data-tour-scope="desktop"] [data-tour="${id}"]`) : null;
    if (!el) {
      setRect(null);
      return undefined;
    }
    el.scrollIntoView({ block: 'nearest' });
    const measure = (): void => setRect(el.getBoundingClientRect());
    const later = (): void => {
      window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('resize', later);
    window.addEventListener('scroll', later, true);
    return () => {
      window.removeEventListener('resize', later);
      window.removeEventListener('scroll', later, true);
    };
  }, [id, active]);
  return rect;
}

interface StepProps {
  readonly step: TourStep;
  readonly index: number;
  readonly total: number;
  readonly onNext: () => void;
  readonly onBack: () => void;
  readonly onSkip: () => void;
  readonly nextRef: RefObject<HTMLButtonElement | null>;
  readonly titleId: string;
  readonly textId: string;
}

function StepBody({
  step,
  index,
  total,
  onNext,
  onBack,
  onSkip,
  nextRef,
  titleId,
  textId,
}: StepProps): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const Icon = step.icon;
  const last = index === total - 1;
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-gold">
          {t('tour.step', { n: index + 1, total })}
        </span>
        <span className="flex gap-1" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === index ? 'w-5 bg-gold' : 'w-1.5 bg-muted-foreground/30',
              )}
            />
          ))}
        </span>
      </div>
      <div className="flex items-start gap-3.5">
        <span
          className="grid size-11 shrink-0 place-items-center rounded-[13px] bg-gold-soft text-gold"
          aria-hidden
        >
          <Icon className="size-[22px]" />
        </span>
        <div className="grid gap-1.5" aria-live="polite">
          <h2 id={titleId} className="font-display text-xl font-semibold leading-tight">
            {t(`tour.${step.id}.title`)}
          </h2>
          <p id={textId} className="text-sm leading-relaxed text-muted-foreground text-pretty">
            {t(`tour.${step.id}.text`)}
          </p>
        </div>
      </div>
      {last ? (
        <p className="rounded-[12px] bg-muted/70 px-3 py-2 text-[13px] text-muted-foreground">
          {t('tour.again')}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        {last ? null : (
          <Button variant="ghost" size="sm" onClick={onSkip} className="-ml-2 text-muted-foreground">
            {t('tour.skip')}
          </Button>
        )}
        <span className="flex-1" />
        {index > 0 ? (
          <Button variant="secondary" size="sm" onClick={onBack}>
            <ArrowLeft />
            {t('tour.back')}
          </Button>
        ) : null}
        <Button ref={nextRef} size="sm" onClick={onNext}>
          {last ? t('tour.done') : t('tour.next')}
          {last ? <Check /> : <ArrowRight />}
        </Button>
      </div>
    </div>
  );
}

function Overlay(props: Omit<StepProps, 'nextRef' | 'titleId' | 'textId'>): ReactElement {
  const isDesktop = useDesktop();
  const rect = useTargetRect(props.step.id, isDesktop);
  const bubble = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [height, setHeight] = useState(0);
  const titleId = useId();
  const textId = useId();
  const { onNext, onBack, onSkip } = props;

  useLayoutEffect(() => {
    setHeight(bubble.current?.offsetHeight ?? 0);
  }, [props.step.id, rect, isDesktop]);
  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
  }, [props.step.id]);
  useEffect(() => {
    const keys: Readonly<Record<string, () => void>> = {
      Escape: onSkip,
      ArrowRight: onNext,
      ArrowLeft: onBack,
    };
    const onKey = (e: KeyboardEvent): void => {
      const action = keys[e.key];
      if (!action) return;
      e.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNext, onBack, onSkip]);

  const body = <StepBody {...props} nextRef={nextRef} titleId={titleId} textId={textId} />;
  const dialog = {
    role: 'dialog',
    'aria-modal': true,
    'aria-labelledby': titleId,
    'aria-describedby': textId,
  } as const;

  if (!rect) {
    // Phones (and a missing menu entry): dark page, a card at the bottom.
    return (
      <div className="fixed inset-0 z-[70] bg-black/60 animate-in fade-in-0">
        <div
          ref={bubble}
          {...dialog}
          className="fixed inset-x-3 bottom-3 mx-auto max-w-md rounded-[20px] border border-border bg-popover p-5 text-popover-foreground shadow-float animate-in slide-in-from-bottom-4 sm:bottom-6"
        >
          {body}
        </div>
      </div>
    );
  }

  const centre = rect.top + rect.height / HALF;
  const top = Math.min(
    Math.max(centre - height / HALF, EDGE),
    Math.max(window.innerHeight - height - EDGE, EDGE),
  );
  const arrow = Math.min(Math.max(centre - top, ARROW_INSET), Math.max(height - ARROW_INSET, ARROW_INSET));
  const spot: CSSProperties = {
    left: rect.left - SPOT_PAD,
    top: rect.top - SPOT_PAD,
    width: rect.width + SPOT_PAD * HALF,
    height: rect.height + SPOT_PAD * HALF,
    boxShadow: SPOT_SHADOW,
  };
  return (
    <div className="fixed inset-0 z-[70]">
      <div
        className="pointer-events-none fixed rounded-[14px] outline-2 outline-offset-0 outline-gold transition-all duration-300 ease-out outline"
        style={spot}
        aria-hidden
      />
      <div
        ref={bubble}
        {...dialog}
        className="fixed w-[min(360px,calc(100vw-2rem))] rounded-[18px] border border-border bg-popover p-5 text-popover-foreground shadow-float transition-[top,left] duration-300 ease-out"
        style={{ left: rect.right + BUBBLE_GAP, top }}
      >
        <span
          className="absolute -left-[7px] size-3.5 -translate-y-1/2 rotate-45 border-b border-l border-border bg-popover"
          style={{ top: arrow }}
          aria-hidden
        />
        {body}
      </div>
    </div>
  );
}

const TourContext = createContext<{ readonly start: () => void }>({ start: () => undefined });

/** Start the tour again (the button in the account box). */
export function useTour(): { readonly start: () => void } {
  return useContext(TourContext);
}

export function TourProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const me = usePanel();
  const settings = useSettingsQuery();
  const hasSettings = (settings.data?.length ?? 0) > 0;
  const steps = STEPS.filter((s) => (s.area ? me.areas.includes(s.area) : hasSettings));
  const [index, setIndex] = useState<number | null>(null);
  const ready = !settings.isPending;

  useEffect(() => {
    if (!ready || !steps.length || seen(me.username)) return undefined;
    const timer = window.setTimeout(() => setIndex(0), START_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [ready, steps.length, me.username]);

  const finish = useCallback(() => {
    markSeen(me.username);
    setIndex(null);
  }, [me.username]);
  const total = steps.length;
  const next = useCallback(() => {
    setIndex((i) => (i === null || i + 1 >= total ? null : i + 1));
    if (index !== null && index + 1 >= total) markSeen(me.username);
  }, [index, total, me.username]);
  const back = useCallback(() => setIndex((i) => (i === null ? null : Math.max(i - 1, 0))), []);
  const value = useMemo(() => ({ start: () => setIndex(0) }), []);
  const step = index === null ? undefined : steps[index];

  return (
    <TourContext.Provider value={value}>
      {children}
      {step && index !== null
        ? createPortal(
            <Overlay step={step} index={index} total={total} onNext={next} onBack={back} onSkip={finish} />,
            document.body,
          )
        : null}
    </TourContext.Provider>
  );
}
