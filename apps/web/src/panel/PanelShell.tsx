import { Dialog as DialogPrimitive } from 'radix-ui';
import {
  Castle,
  Compass,
  Gamepad2,
  Gavel,
  Globe,
  House,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Mic,
  Server,
  Settings2,
  ShieldHalf,
  Users,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, ScrollRestoration } from 'react-router';
import { Lozenge, Wordmark } from '~/components/brand';
import { LanguageSwitch, ThemeToggle } from '~/components/controls';
import { Button } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { usePick } from '~/lib/text';
import { useLogout } from './PanelGate';
import { RoleBadge } from './role-visuals';
import { usePanel, useSettingsQuery } from './session';
import { TourProvider, useTour } from './tour/Tour';

/** The catalog names an icon per settings area; these are the ones it uses (others get a cog). */
const AREA_ICONS: Readonly<Record<string, LucideIcon>> = {
  Globe,
  MessagesSquare,
  Mic,
  Users,
  Castle,
};

export function areaIcon(name: string): LucideIcon {
  return AREA_ICONS[name] ?? Settings2;
}

/** Areas listed under "Verwaltung". */
const MANAGE_AREAS = ['players', 'punishments', 'roles', 'servers'] as const;

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
  onNavigate,
}: {
  readonly to: string;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly end?: boolean;
  /** Step of the panel tour that lights up this entry. */
  readonly tour?: string;
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
    </NavLink>
  );
}

function Group({ label }: { readonly label: string }): ReactElement {
  return (
    <p className="px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-[0.16em] text-band-muted/70">
      {label}
    </p>
  );
}

function Avatar({ uuid, name }: { readonly uuid: string | null; readonly name: string }): ReactElement {
  const [failed, setFailed] = useState(false);
  if (uuid && !failed) {
    return (
      <img
        src={`/panel/motor/api/heads/${uuid}`}
        alt=""
        className="size-10 shrink-0 rounded-[10px] bg-white/10 [image-rendering:pixelated]"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-white/10 font-display text-lg font-semibold uppercase text-band-foreground"
      aria-hidden
    >
      {name.slice(0, 1)}
    </span>
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
  const areas = settings.data ?? [];
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
        {areas.length ? (
          <div className="grid gap-0.5 rounded-[12px]" data-tour="settings">
            <Group label={t('shell.settings')} />
            {areas.map(({ area }) => (
              <Item
                key={area.id}
                to={`/einstellungen/${area.id}`}
                icon={areaIcon(area.icon)}
                label={pick(area.title)}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ) : null}
        {MANAGE_AREAS.some(can) ? <Group label={t('shell.manage')} /> : null}
        {can('players') ? (
          <Item
            to="/spieler"
            icon={UsersRound}
            label={t('shell.players')}
            tour="players"
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
        {can('roles') ? (
          <Item
            to="/rollen"
            icon={ShieldHalf}
            label={t('shell.roles')}
            tour="roles"
            onNavigate={onNavigate}
          />
        ) : null}
        {can('servers') ? (
          <Item
            to="/server"
            icon={Server}
            label={t('shell.servers')}
            tour="servers"
            onNavigate={onNavigate}
          />
        ) : null}
      </nav>
      <div className="mt-auto grid gap-3 pt-6">
        <div className="grid gap-3 rounded-[14px] border border-band-line bg-white/[0.04] p-3">
          <div className="flex items-center gap-3">
            <Avatar uuid={me.minecraftUuid} name={me.username} />
            <div className="grid min-w-0 gap-1">
              <span className="sr-only">{t('shell.account')}</span>
              <span className="truncate text-sm font-bold text-band-foreground">{me.username}</span>
              <RoleBadge role={me.role} onBand />
            </div>
          </div>
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
  const [open, setOpen] = useState(false);
  return (
    <header className="band sticky top-0 z-30 flex items-center gap-3 px-4 py-3 lg:hidden">
      <Wordmark tag={t('brand.panelTag')} crestClassName="size-8" />
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Trigger asChild>
          <Button variant="bandGhost" size="icon" className="ml-auto" aria-label={t('nav.menu')}>
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
  return (
    <div className="grid min-h-dvh lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="band sticky top-0 hidden h-dvh overflow-y-auto lg:block" data-tour-scope="desktop">
        <SidebarContent />
        <Lozenge className="absolute inset-y-0 right-0 h-full w-1 opacity-70" />
      </aside>
      <MobileBar />
      <main className="min-w-0">
        <div className="mx-auto grid max-w-[1440px] content-start gap-[22px] px-4 py-6 sm:px-8 sm:py-8">
          <Outlet />
        </div>
      </main>
      <ScrollRestoration />
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
