import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Lock,
  MessageCircle,
  MonitorCog,
  Swords,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { DISCORD_RIGHTS, GAME_RIGHTS, PANEL_AREAS, type Role } from '@moinmorni/shared';
import { FieldBlock } from '~/components/controls';
import { Button, Card, Input, Pill, Switch } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { usePick } from '~/lib/text';
import { RoleSymbol } from '~/components/role-visuals';
import { inOrder, NAME_MAX, problemsOf, SYMBOL_IDEAS, SYMBOL_MAX, validColour } from './role-draft';

const CONFIRM_MS = 4000;
const PICKER_FALLBACK = '#000000';
const HEX_LENGTH = 7;
/** Rights that hand over everything: marked with a small warning. */
const MIGHTY: readonly string[] = ['admin', 'administrator', 'roles', 'settings'];

type RightsKey = 'panel' | 'game' | 'discord';

const SET_RIGHTS: Readonly<Record<RightsKey, (role: Role, list: readonly string[]) => Role>> = {
  panel: (role, list) => ({ ...role, panel: inOrder.panel(list) }),
  game: (role, list) => ({ ...role, game: inOrder.game(list) }),
  discord: (role, list) => ({ ...role, discord: inOrder.discord(list) }),
};

const GROUPS: readonly {
  readonly key: RightsKey;
  readonly icon: LucideIcon;
  readonly all: readonly string[];
  readonly names: string;
  readonly help: string;
}[] = [
  { key: 'panel', icon: MonitorCog, all: PANEL_AREAS, names: 'roles.areas', help: 'roles.areaHelp' },
  { key: 'game', icon: Swords, all: GAME_RIGHTS, names: 'roles.gameRights', help: 'roles.gameHelp' },
  {
    key: 'discord',
    icon: MessageCircle,
    all: DISCORD_RIGHTS,
    names: 'roles.discordRights',
    help: 'roles.discordHelp',
  },
];

/** "[Lobby] ♛ Philip » Servus!" – how the role looks in the game chat. */
export function ChatPreview({
  role,
  name,
  className,
}: {
  readonly role: Role;
  readonly name: string;
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const colour = validColour(role.colour) ? role.colour : PICKER_FALLBACK;
  return (
    <span
      className={cn(
        'inline-flex max-w-full flex-wrap items-center gap-x-1.5 rounded-[10px] bg-[#16201b] px-3 py-1.5 font-mono text-[13px] text-[#f4f4f4] dark:bg-black/50 dark:ring-1 dark:ring-white/10',
        className,
      )}
    >
      <span className="text-[#aaaaaa]">[{t('roles.previewServer')}]</span>
      <span style={{ color: colour }} className="font-medium">
        {role.symbol ? `${role.symbol} ` : ''}
        {name}
      </span>
      <span className="text-[#8a8a8a]">»</span>
      <span>{t('roles.chatSample')}</span>
    </span>
  );
}

function RightsGroup({
  group,
  role,
  locked,
  onChange,
}: {
  readonly group: (typeof GROUPS)[number];
  readonly role: Role;
  readonly locked: boolean;
  readonly onChange: (list: string[]) => void;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const Icon = group.icon;
  const selected: readonly string[] = role[group.key];
  const toggle = (right: string, on: boolean): void =>
    onChange(on ? [...selected, right] : selected.filter((r) => r !== right));
  return (
    <fieldset className="grid gap-3 rounded-[14px] border border-border p-4" disabled={locked}>
      <legend className="sr-only">{t(`roles.${group.key}`)}</legend>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold">
          <Icon className="size-4 text-gold" aria-hidden />
          {t(`roles.${group.key}`)}
          <span className="text-xs font-medium text-muted-foreground">
            {t('roles.countOf', { count: selected.length, total: group.all.length })}
          </span>
        </p>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => onChange([...group.all])}>
            {t('roles.selectAll')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onChange([])}>
            {t('roles.selectNone')}
          </Button>
        </div>
      </div>
      <div className="grid gap-1 sm:grid-cols-2">
        {group.all.map((right) => {
          const id = `role-${role.id}-${group.key}-${right}`;
          const on = selected.includes(right);
          return (
            <label
              key={right}
              htmlFor={id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-[10px] px-2.5 py-2 transition-colors hover:bg-muted/60',
                on && 'bg-accent/50',
                locked && 'cursor-not-allowed opacity-70',
              )}
            >
              <input
                id={id}
                type="checkbox"
                checked={on}
                onChange={(e) => toggle(right, e.target.checked)}
                className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--primary)]"
              />
              <span className="grid min-w-0 gap-0.5">
                <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                  {t(`${group.names}.${right}`, { defaultValue: right })}
                  {MIGHTY.includes(right) ? (
                    <TriangleAlert className="size-3.5 text-warning" aria-label={t('roles.mighty')} />
                  ) : null}
                </span>
                <span className="text-[12.5px] leading-snug text-muted-foreground">
                  {t(`${group.help}.${right}`, { defaultValue: '' })}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Second click within a few seconds confirms the deletion. */
function DeleteButton({
  disabledReason,
  onDelete,
}: {
  readonly disabledReason: string | null;
  readonly onDelete: () => void;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!asking) return undefined;
    const timer = window.setTimeout(() => setAsking(false), CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [asking]);
  return (
    <div className="grid justify-items-start gap-1.5">
      <Button
        variant="danger"
        size="sm"
        disabled={disabledReason !== null}
        onClick={() => (asking ? onDelete() : setAsking(true))}
        className={cn(asking && 'border-destructive bg-destructive-soft')}
      >
        <Trash2 />
        {asking ? t('roles.deleteConfirm') : t('roles.delete')}
      </Button>
      <p className="text-[12.5px] text-muted-foreground">{disabledReason ?? t('roles.deleteHelp')}</p>
    </div>
  );
}

export function RoleEditor({
  role,
  index,
  isNew,
  changed,
  locked,
  open,
  previewName,
  canMoveUp,
  canMoveDown,
  onToggle,
  onChange,
  onMove,
  onMakeFallback,
  onDelete,
}: {
  readonly role: Role;
  readonly index: number;
  readonly isNew: boolean;
  readonly changed: boolean;
  readonly locked: boolean;
  readonly open: boolean;
  readonly previewName: string;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly onToggle: () => void;
  readonly onChange: (role: Role) => void;
  readonly onMove: (direction: -1 | 1) => void;
  readonly onMakeFallback: () => void;
  readonly onDelete: () => void;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const id = (field: string): string => `role-${role.id}-${field}`;
  const problems = problemsOf(role);
  const set = <K extends keyof Role>(key: K, value: Role[K]): void => onChange({ ...role, [key]: value });
  const deleteBlocked = ((): string | null => {
    if (role.id === 'owner') return t('roles.cantDelete.owner');
    if (role.fallback) return t('roles.cantDelete.fallback');
    return locked ? t('roles.locked') : null;
  })();
  const shownName = pick(role.name) || role.id;

  return (
    <Card className={cn('grid gap-5 p-4 sm:p-5', problems.length && 'border-destructive/50')}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={id('body')}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-[12px] text-left"
        >
          <RoleSymbol role={{ ...role, colour: validColour(role.colour) ? role.colour : PICKER_FALLBACK }} />
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="truncate font-display text-xl font-semibold">{shownName}</span>
              {changed && !isNew ? (
                <span className="size-2 rounded-full bg-gold" title={t('roles.changed')} />
              ) : null}
              {isNew ? <Pill tone="gold">{t('roles.newPill')}</Pill> : null}
              {role.fallback ? <Pill tone="blue">{t('roles.fallback')}</Pill> : null}
              {locked ? (
                <Pill tone="neutral" className="gap-1">
                  <Lock className="size-3" aria-hidden />
                  {t('roles.lockedPill')}
                </Pill>
              ) : null}
              {problems.length ? <Pill tone="danger">{t('roles.problem')}</Pill> : null}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {t('roles.rank', { n: index + 1 })} · {t('roles.id', { id: role.id })}
            </span>
          </span>
          <ChatPreview role={role} name={previewName} className="hidden xl:inline-flex" />
          <ChevronDown
            className={cn('size-5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
            aria-hidden
          />
        </button>
        <div className="flex shrink-0 gap-1 border-l border-border pl-3">
          <Button
            variant="secondary"
            size="iconSm"
            onClick={() => onMove(-1)}
            disabled={!canMoveUp}
            aria-label={t('roles.up')}
            title={t('roles.up')}
          >
            <ArrowUp />
          </Button>
          <Button
            variant="secondary"
            size="iconSm"
            onClick={() => onMove(1)}
            disabled={!canMoveDown}
            aria-label={t('roles.down')}
            title={t('roles.down')}
          >
            <ArrowDown />
          </Button>
        </div>
      </div>

      {open ? (
        <div id={id('body')} className="grid gap-5 border-t border-border pt-5">
          {locked ? (
            <p className="flex items-start gap-2.5 rounded-[12px] bg-muted px-3.5 py-2.5 text-sm">
              <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              {t('roles.locked')}
            </p>
          ) : null}
          <div className="grid gap-2">
            <p className="text-sm font-semibold">{t('roles.preview')}</p>
            <ChatPreview role={role} name={previewName} className="justify-self-start text-sm" />
          </div>
          <fieldset disabled={locked} className="grid gap-4 md:grid-cols-2">
            <FieldBlock id={id('name-de')} label={t('roles.nameDe')}>
              <Input
                id={id('name-de')}
                lang="de"
                maxLength={NAME_MAX}
                value={role.name.de}
                aria-invalid={!role.name.de.trim()}
                onChange={(e) => set('name', { ...role.name, de: e.target.value })}
              />
            </FieldBlock>
            <FieldBlock id={id('name-en')} label={t('roles.nameEn')}>
              <Input
                id={id('name-en')}
                lang="en"
                maxLength={NAME_MAX}
                value={role.name.en}
                aria-invalid={!role.name.en.trim()}
                onChange={(e) => set('name', { ...role.name, en: e.target.value })}
              />
            </FieldBlock>
            <FieldBlock id={id('symbol')} label={t('roles.symbol')} help={t('roles.symbolHelp')}>
              <Input
                id={id('symbol')}
                maxLength={SYMBOL_MAX}
                className="w-28 text-center text-lg"
                value={role.symbol}
                onChange={(e) => set('symbol', e.target.value)}
              />
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('roles.symbolIdeas')}>
                {SYMBOL_IDEAS.map((symbol) => (
                  <button
                    key={symbol}
                    type="button"
                    aria-pressed={role.symbol === symbol}
                    onClick={() => set('symbol', symbol)}
                    className={cn(
                      'grid size-9 cursor-pointer place-items-center rounded-[10px] border text-lg transition-colors disabled:cursor-not-allowed',
                      role.symbol === symbol
                        ? 'border-primary bg-accent'
                        : 'border-input bg-secondary hover:bg-muted',
                    )}
                  >
                    {symbol}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={!role.symbol}
                  onClick={() => set('symbol', '')}
                  className={cn(
                    'h-9 cursor-pointer rounded-[10px] border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed',
                    role.symbol ? 'border-input bg-secondary hover:bg-muted' : 'border-primary bg-accent',
                  )}
                >
                  {t('roles.symbolNone')}
                </button>
              </div>
            </FieldBlock>
            <FieldBlock
              id={id('colour')}
              label={t('roles.colour')}
              help={problems.includes('colour') ? t('roles.colourInvalid') : t('roles.colourHelp')}
            >
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={t('roles.colourPicker')}
                  value={validColour(role.colour) ? role.colour.toLowerCase() : PICKER_FALLBACK}
                  onChange={(e) => set('colour', e.target.value)}
                  className="h-11 w-14 shrink-0 cursor-pointer rounded-[12px] border border-input bg-transparent p-1 disabled:cursor-not-allowed"
                />
                <Input
                  id={id('colour')}
                  maxLength={HEX_LENGTH}
                  className="w-32 font-mono uppercase"
                  value={role.colour}
                  aria-invalid={problems.includes('colour')}
                  onChange={(e) => set('colour', e.target.value.trim())}
                />
              </div>
            </FieldBlock>
          </fieldset>

          <div className="flex items-start justify-between gap-4 rounded-[14px] border border-border p-4">
            <div className="grid gap-1">
              <label htmlFor={id('fallback')} className="font-semibold">
                {t('roles.fallbackLabel')}
              </label>
              <p className="text-[13px] leading-snug text-muted-foreground">{t('roles.fallbackHelp')}</p>
            </div>
            <Switch
              id={id('fallback')}
              checked={role.fallback}
              disabled={role.fallback || locked}
              onCheckedChange={(on) => (on ? onMakeFallback() : undefined)}
            />
          </div>

          <div className="grid gap-3">
            {GROUPS.map((group) => (
              <RightsGroup
                key={group.key}
                group={group}
                role={role}
                locked={locked}
                onChange={(list) => onChange(SET_RIGHTS[group.key](role, list))}
              />
            ))}
          </div>

          <div className="border-t border-border pt-4">
            <DeleteButton disabledReason={deleteBlocked} onDelete={onDelete} />
          </div>
        </div>
      ) : null}
    </Card>
  );
}
