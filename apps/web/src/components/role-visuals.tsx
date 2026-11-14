import type { Role } from '@moinmorni/shared';
import type { CSSProperties, ReactElement } from 'react';
import { cn } from '~/lib/cn';
import { usePick } from '~/lib/text';

const HEX_RADIX = 16;
const CHANNEL_MAX = 255;
const RED_START = 1;
const GREEN_START = 3;
const BLUE_START = 5;
const CHANNEL_DIGITS = 2;
// Relative luminance (WCAG): weights of red, green and blue; above the threshold, dark text reads better.
const RED_WEIGHT = 0.2126;
const GREEN_WEIGHT = 0.7152;
const BLUE_WEIGHT = 0.0722;
const LIGHT_THRESHOLD = 0.5;
const DARK_TEXT = '#0f1f18';
const LIGHT_TEXT = '#ffffff';

function channel(hex: string, start: number): number {
  return parseInt(hex.slice(start, start + CHANNEL_DIGITS), HEX_RADIX) / CHANNEL_MAX;
}

/** Black or white text on a background of `hex` (#rrggbb). */
export function textOn(hex: string): string {
  const luminance =
    RED_WEIGHT * channel(hex, RED_START) +
    GREEN_WEIGHT * channel(hex, GREEN_START) +
    BLUE_WEIGHT * channel(hex, BLUE_START);
  return luminance > LIGHT_THRESHOLD ? DARK_TEXT : LIGHT_TEXT;
}

/** What a badge needs of a role (players carry only these parts of their rank). */
export type RoleLook = Pick<Role, 'name' | 'symbol' | 'colour'>;

/** The role's symbol on a tile in its colour (a dot for roles without symbol). */
export function RoleSymbol({
  role,
  className,
}: {
  readonly role: RoleLook;
  readonly className?: string;
}): ReactElement {
  const style: CSSProperties = { backgroundColor: role.colour, color: textOn(role.colour) };
  return (
    <span
      className={cn('grid size-11 shrink-0 place-items-center rounded-[13px] text-xl font-bold', className)}
      style={style}
      aria-hidden
    >
      {role.symbol || '•'}
    </span>
  );
}

/**
 * Role name with symbol, coloured like in the game chat. On the dark band the game colours read well; on light
 * cards a dark chip (like Minecraft's chat background) keeps light colours such as VIP-yellow readable.
 */
export function RoleBadge({
  role,
  onBand = false,
  className,
}: {
  readonly role: RoleLook;
  readonly onBand?: boolean;
  readonly className?: string;
}): ReactElement {
  const pick = usePick();
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 justify-self-start rounded-full px-2 py-0.5 text-xs font-bold',
        onBand ? 'bg-white/[0.07]' : 'bg-[#16201b] dark:bg-black/50 dark:ring-1 dark:ring-white/10',
        className,
      )}
      style={{ color: role.colour }}
    >
      {role.symbol ? <span aria-hidden>{role.symbol}</span> : null}
      <span className="truncate">{pick(role.name)}</span>
    </span>
  );
}
