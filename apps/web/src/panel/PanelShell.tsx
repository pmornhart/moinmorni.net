import { Dialog as DialogPrimitive } from 'radix-ui';
import {
  Award,
  Bird,
  BrickWall,
  Castle,
  ChevronDown,
  ClipboardList,
  Cloud,
  Compass,
  Dices,
  EyeOff,
  Fish,
  Gamepad2,
  Gavel,
  Globe,
  Globe2,
  Hammer,
  House,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Mic,
  Mountain,
  Network,
  Newspaper,
  Pickaxe,
  RefreshCw,
  Search,
  Server,
  Settings2,
  Shield,
  ShieldHalf,
  Snowflake,
  Store,
  Sun,
  Swords,
  TreePine,
  UserCog,
  UserRoundCog,
  Users,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  Children,
  isValidElement,
  lazy,
  Suspense,
  useEffect,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { Lozenge, Wordmark } from '~/components/brand';
import { useFold } from '~/components/fold-card';
import { LanguageSwitch, ThemeToggle } from '~/components/controls';
import { MinecraftHead } from '~/components/minecraft-head';
import { VersionPill } from '~/components/whats-new';
import { Button } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { usePick } from '~/lib/text';
import { useLogout } from './PanelGate';
import { RoleBadge } from '~/components/role-visuals';
import { usePendingCount } from './applications/model';
import { usePanel, useSettingsQuery, type SettingsEntry } from './session';
import { TourProvider, useTour } from './tour/Tour';

/** The catalog names an icon per settings area; these are the ones it uses (others get a cog). */
const AREA_ICONS: Readonly<Record<string, LucideIcon>> = {
  Award,
  Globe,
  Globe2,
  MessagesSquare,
  Mic,
  Newspaper,
  Users,
  Castle,
  ClipboardList,
  Pickaxe,
  Hammer,
  RefreshCw,
  Swords,
  Dices,
  Mountain,
  KeyRound,
  Shield,
  Store,
  Cloud,
  EyeOff,
  Snowflake,
  Bird,
  Fish,
  TreePine,
  Search,
  BrickWall,
  Sun,
  Network,
};

export function areaIcon(name: string): LucideIcon {
  return AREA_ICONS[name] ?? Settings2;
}

/** The window that asks for an own password after a start password – only loaded when needed. */
const ForcePassword = lazy(async () => ({
  default: (await import('./account/ForcePassword')).ForcePassword,
}));

/** Settings areas of the game modes (MorniCraft, Duels …) get their own group in the menu. */
const MODE_PANEL = 'modes';

/** Settings area with the update card ("Was ist neu" links there when an update is ready). */
const UPDATES_PAGE = '/einstellungen/updates';

const ITEM =
  'group relative flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-[14.5px] font-semibold text-band-muted transition-colors hover:bg-white/[0.06] hover:text-band-foreground';
const ACTIVE =
  'bg-white/[0.09] text-band-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-gold';

function Item({
  to,
  icon: Icon,
  label,
  end,
  tour,
  badge,
  onNavigate,
}: {
  readonly to: string;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly end?: boolean;
  /** Step of the panel tour that lights up this entry. */
  readonly tour?: string;
  /** A number in gold at the right (e.g. open applications). */
  readonly badge?: number;
  readonly onNavigate?: () => void;
}): ReactElement {
  return (
    <NavLink
      to={to}
      end={end}
      data-tour={tour}
      onClick={onNavigate}
      className={({ isActive }) => cn(ITEM, isActive && ACTIVE)}
    >
      <Icon className="size-[18px] shrink-0 opacity-80 group-hover:opacity-100" aria-hidden />
      <span className="truncate">{label}</span>
      {badge ? (
        <span className="tabular ml-auto rounded-full bg-gold px-1.5 text-[11px] font-bold leading-[18px] text-[#1f1503]">
          {badge}
        </span>
      ) : null}
    </NavLink>
  );
}

/** Which menu group a settings area belongs to (areas not named here go to "Netzwerk & Lobby"). */
const AREA_GROUP: Readonly<Record<string, MenuGroup>> = {
  badges: 'team',
  'team-apply': 'team',
  website: 'content',
  reach: 'system',
  updates: 'system',
};

type MenuGroup = 'players' | 'team' | 'network' | 'modes' | 'content' | 'system';

function groupOf({ area }: SettingsEntry): MenuGroup {
  return area.panel === MODE_PANEL ? 'modes' : (AREA_GROUP[area.id] ?? 'network');
}

/**
 * A menu group that folds open and closed (remembered per group). It opens by itself when one of its pages is shown.
 */
function Group({
  id,
  label,
  tour,
  children,
}: {
  readonly id: MenuGroup;
  readonly label: string;
  readonly tour?: string;
  readonly children: ReactNode;
}): ReactElement | null {
  const { t } = useTranslation(MM_NAMESPACE);
  const [open, setOpen] = useFold(`nav:${id}`, true);
  const listId = useId();
  const items = Children.toArray(children);
  const { pathname } = useLocation();
  const active = items.some(
    (item) =>
      isValidElement<{ to?: string }>(item) &&
      item.props.to !== undefined &&
      pathname.startsWith(item.props.to),
  );
  // Open when one of its pages is reached (only then – closing it again by hand stays possible).
  useEffect(() => {
    if (active) setOpen(true);
  }, [pathname]);
  if (!items.length) return null;
  return (
    <div className="grid gap-0.5 rounded-[12px]" data-tour={tour} data-fold={`nav:${id}`} data-open={open}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        title={t('shell.toggleGroup', { name: label })}
        onClick={() => setOpen(!open)}
        className="group mt-3 flex cursor-pointer items-center justify-between rounded-[9px] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-band-muted/70 transition-colors hover:text-band-foreground"
      >
        {label}
        <ChevronDown
          className={cn('size-3.5 transition-transform duration-200', open ? 'rotate-0' : '-rotate-90')}
          aria-hidden
        />
      </button>
      <div
        id={listId}
        inert={!open}
        className={cn(
          'grid transition-[grid-template-rows,opacity,visibility] duration-200 ease-out',
          open ? 'visible grid-rows-[1fr] opacity-100' : 'invisible grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="grid min-h-0 gap-0.5 overflow-hidden">{items}</div>
      </div>
    </div>
  );
}

function SidebarContent({ onNavigate }: { readonly onNavigate?: () => void }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const me = usePanel();
  const pick = usePick();
  const settings = useSettingsQuery();
  const { logout, busy } = useLogout();
  const tour = useTour();
  const can = (area: (typeof me.areas)[number]): boolean => me.areas.includes(area);
  const openApplications = usePendingCount(can('players'));
  const areas = settings.data ?? [];
  const settingsOf = (group: MenuGroup): ReactElement[] =>
    areas
      .filter((entry) => groupOf(entry) === group)
      .map(({ area }) => (
        <Item
          key={area.id}
          to={`/einstellungen/${area.id}`}
          icon={areaIcon(area.icon)}
          label={pick(area.title)}
          onNavigate={onNavigate}
        />
      ));
  return (
    <div className="flex min-h-full flex-col gap-1 px-3.5 py-5">
      <div className="px-2 pb-4">
        <Wordmark tag={t('brand.panelTag')} crestClassName="size-8" />
      </div>
      <nav className="grid gap-0.5" aria-label={t('nav.main')}>
        {can('overview') ? (
          <Item
            to="/"
            end
            icon={LayoutDashboard}
            label={t('shell.overview')}
            tour="overview"
            onNavigate={onNavigate}
          />
        ) : null}
        {can('modes') ? (
          <Item to="/modi" icon={Gamepad2} label={t('shell.modes')} tour="modes" onNavigate={onNavigate} />
        ) : null}
        <Group id="players" label={t('shell.groupPlayers')}>
          {can('players') ? (
            <Item
              to="/spieler"
              icon={UsersRound}
              label={t('shell.players')}
              tour="players"
              onNavigate={onNavigate}
            />
          ) : null}
          {can('players') ? (
            <Item
              to="/bewerbungen"
              icon={ClipboardList}
              label={t('shell.applications')}
              tour="applications"
              badge={openApplications}
              onNavigate={onNavigate}
            />
          ) : null}
          {can('punishments') ? (
            <Item
              to="/strafen"
              icon={Gavel}
              label={t('shell.punishments')}
              tour="punishments"
              onNavigate={onNavigate}
            />
          ) : null}
        </Group>
        <Group id="team" label={t('shell.groupTeam')}>
          {can('roles') ? (
            <Item
              to="/rollen"
              icon={ShieldHalf}
              label={t('shell.roles')}
              tour="roles"
              onNavigate={onNavigate}
            />
          ) : null}
          {can('roles') ? (
            <Item to="/team" icon={UserCog} label={t('shell.team')} tour="team" onNavigate={onNavigate} />
          ) : null}
          {settingsOf('team')}
        </Group>
        <Group id="network" label={t('shell.groupNetwork')} tour="settings">
          {settingsOf('network')}
          {can('servers') ? (
            <Item
              to="/server"
              icon={Server}
              label={t('shell.servers')}
              tour="servers"
              onNavigate={onNavigate}
            />
          ) : null}
        </Group>
        <Group id="modes" label={t('shell.modeSettings')}>
          {settingsOf('modes')}
        </Group>
        <Group id="content" label={t('shell.groupContent')}>
          {can('content') ? (
            <Item to="/news" icon={Newspaper} label={t('shell.news')} tour="news" onNavigate={onNavigate} />
          ) : null}
          {settingsOf('content')}
          {can('discord') ? (
            <Item
              to="/discord"
              icon={MessagesSquare}
              label={t('shell.discord')}
              tour="discord"
              onNavigate={onNavigate}
            />
          ) : null}
        </Group>
        <Group id="system" label={t('shell.groupSystem')}>
          {settingsOf('system')}
        </Group>
      </nav>
      <div className="mt-auto grid gap-3 pt-6">
        <div className="grid gap-3 rounded-[14px] border border-band-line bg-white/[0.04] p-3">
          <NavLink
            to="/konto"
            onClick={onNavigate}
            title={t('shell.myAccount')}
            className={({ isActive }) =>
              cn(
                'group -m-1.5 flex items-center gap-3 rounded-[11px] p-1.5 transition-colors hover:bg-white/[0.06]',
                isActive && 'bg-white/[0.09]',
              )
            }
          >
            <MinecraftHead
              uuid={me.minecraftUuid}
              name={me.username}
              className="size-10 rounded-[10px] bg-white/10 text-lg"
              letterClassName="text-band-foreground"
            />
            <div className="grid min-w-0 flex-1 gap-1">
              <span className="sr-only">{t('shell.account')}</span>
              <span className="truncate text-sm font-bold text-band-foreground">{me.username}</span>
              <RoleBadge role={me.role} onBand />
            </div>
            <span className="grid shrink-0 justify-items-center gap-0.5 text-band-muted transition-colors group-hover:text-band-foreground">
              <UserRoundCog className="size-[18px]" aria-hidden />
              <span className="text-[10px] font-bold uppercase tracking-[0.08em]">
                {t('shell.accountShort')}
              </span>
            </span>
          </NavLink>
          <Button
            variant="band"
            size="sm"
            className="w-full"
            onClick={() => {
              onNavigate?.();
              tour.start();
            }}
          >
            <Compass />
            {t('shell.tour')}
          </Button>
          <div className="flex items-center gap-1 border-t border-band-line pt-2.5">
            <Button
              asChild
              variant="bandGhost"
              size="iconSm"
              aria-label={t('shell.website')}
              title={t('shell.website')}
            >
              <a href="/">
                <House />
              </a>
            </Button>
            <ThemeToggle variant="bandGhost" className="size-8 rounded-[10px]" />
            <LanguageSwitch className="ml-auto" />
            <Button
              variant="bandGhost"
              size="iconSm"
              onClick={logout}
              disabled={busy}
              aria-label={t('shell.logout')}
              title={t('shell.logout')}
            >
              <LogOut />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileBar(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const me = usePanel();
  const [open, setOpen] = useState(false);
  return (
    <header className="band sticky top-0 z-30 flex items-center gap-3 px-4 py-3 lg:hidden">
      <Wordmark tag={t('brand.panelTag')} crestClassName="size-8" />
      <NavLink
        to="/konto"
        className="ml-auto rounded-[10px] p-1 transition-colors hover:bg-white/[0.08]"
        aria-label={t('shell.myAccount')}
        title={t('shell.myAccount')}
      >
        <MinecraftHead
          uuid={me.minecraftUuid}
          name={me.username}
          className="size-8 rounded-[8px] bg-white/10 text-base"
          letterClassName="text-band-foreground"
        />
      </NavLink>
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Trigger asChild>
          <Button variant="bandGhost" size="icon" aria-label={t('nav.menu')}>
            <Menu />
          </Button>
        </DialogPrimitive.Trigger>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/55 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="band fixed inset-y-0 left-0 z-50 w-[min(304px,86vw)] overflow-y-auto shadow-float data-[state=open]:animate-in data-[state=open]:slide-in-from-left">
            <DialogPrimitive.Title className="sr-only">{t('nav.main')}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              {t('brand.tagline')}
            </DialogPrimitive.Description>
            <DialogPrimitive.Close asChild>
              <Button
                variant="bandGhost"
                size="iconSm"
                className="absolute right-3 top-5 z-10"
                aria-label={t('nav.close')}
              >
                <X />
              </Button>
            </DialogPrimitive.Close>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <Lozenge className="absolute inset-x-0 bottom-0 h-1" />
    </header>
  );
}

/** The panel's frame: menu on the left (a bar with a slide-in menu on phones), pages on the right. */
export function PanelShell(): ReactElement {
  return (
    <TourProvider>
      <Frame />
    </TourProvider>
  );
}

function Frame(): ReactElement {
  const me = usePanel();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="band sticky top-0 hidden h-dvh overflow-y-auto lg:block" data-tour-scope="desktop">
        <SidebarContent />
        <Lozenge className="absolute inset-y-0 right-0 h-full w-1 opacity-70" />
      </aside>
      <MobileBar />
      <main className="min-w-0">
        {/* Room at the bottom so the version pill never covers the last line of a page. */}
        <div className="mx-auto grid max-w-[1440px] content-start gap-[22px] px-4 pb-16 pt-6 sm:px-8 sm:pb-16 sm:pt-8">
          <Outlet />
        </div>
      </main>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center pb-[calc(10px+env(safe-area-inset-bottom))] lg:left-[264px]">
        <VersionPill
          look="panel"
          audience="team"
          className="pointer-events-auto"
          updatesTo={me.areas.includes('updates') ? UPDATES_PAGE : undefined}
        />
      </div>
      <ScrollRestoration />
      {me.mustChangePassword ? (
        <Suspense fallback={null}>
          <ForcePassword />
        </Suspense>
      ) : null}
    </div>
  );
}

/** Page head inside the panel: icon, title in the display face, short text. */
export function PageHead({
  icon: Icon,
  title,
  text,
  children,
}: {
  readonly icon?: LucideIcon;
  readonly title: string;
  readonly text?: string;
  readonly children?: ReactElement | null;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3.5">
        {Icon ? (
          <span
            className="mt-1 grid size-11 shrink-0 place-items-center rounded-[13px] bg-gold-soft text-gold"
            aria-hidden
          >
            <Icon className="size-[22px]" />
          </span>
        ) : null}
        <div className="grid min-w-0 gap-1">
          <h1 className="font-display text-[clamp(1.7rem,3vw,2.2rem)] font-semibold leading-tight">
            {title}
          </h1>
          {text ? <p className="max-w-[70ch] text-muted-foreground text-pretty">{text}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}
