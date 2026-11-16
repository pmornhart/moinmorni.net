import {
  Bird,
  Castle,
  Cloud,
  Dices,
  EyeOff,
  Fish,
  MountainSnow,
  Pickaxe,
  Shield,
  Snowflake,
  Sparkles,
  Sprout,
  Swords,
  type LucideIcon,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { cn } from '~/lib/cn';

/** Own symbols for the modes (lucide icons, no game graphics). Unknown modes get sparkles. */
const MODE_ICONS: Readonly<Record<string, LucideIcon>> = {
  mornicraft: Pickaxe,
  duels: Swords,
  party: Dices,
  gipfelsturm: MountainSnow,
  burgverlies: Castle,
  bollwerk: Shield,
  mirni: Sprout,
  wolkenkampf: Cloud,
  versteckerl: EyeOff,
  wintersport: Snowflake,
  adlerflug: Bird,
  angelkoenig: Fish,
};

const TINTS = ['bg-accent text-primary', 'bg-gold-soft text-gold', 'bg-blue-soft text-blue'] as const;

export function ModeGlyph({
  id,
  position,
  className,
}: {
  readonly id: string;
  readonly position: number;
  readonly className?: string;
}): ReactElement {
  const Icon = MODE_ICONS[id] ?? Sparkles;
  const tint = TINTS[position % TINTS.length] ?? TINTS[0];
  return (
    <span
      className={cn('grid size-11 shrink-0 place-items-center rounded-[13px]', tint, className)}
      aria-hidden
    >
      <Icon className="size-[22px]" strokeWidth={1.9} />
    </span>
  );
}
