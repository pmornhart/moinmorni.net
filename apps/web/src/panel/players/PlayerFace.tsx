/* eslint-disable ts-patterns/no-magic-numbers -- colour tables and pixel art of the face */
import { useMemo, type CSSProperties, type ReactElement } from 'react';
import { cn } from '~/lib/cn';

/**
 * A player's picture without Mojang skins: an own little pixel face with a hood in the colour of their rank. Skin
 * tone, eyes, fringe and mouth come from the UUID, so everyone keeps the same face.
 *
 * Letters in the pattern: H hood, S skin, E eye, C cheek, M mouth, . background.
 */

const SIZE = 10;
const FRINGES = ['HHSSSSSSHH', 'HHHSSSSHHH', 'HHSHSSHSHH'] as const;
const MOUTHS = ['HHSSMMSSHH', 'HHSMMMMSHH'] as const;
const SKINS = ['#f2c9a0', '#e0ac7e', '#c68a5c', '#8d5a3b'] as const;
const EYES = ['#2b1d14', '#2f5fa8', '#2f7d4f', '#3a3f47'] as const;
const CHEEK = 'rgba(232, 106, 106, 0.55)';
const MOUTH = 'rgba(80, 30, 20, 0.6)';

function pattern(fringe: string, mouth: string): readonly string[] {
  return [
    '..HHHHHH..',
    '.HHHHHHHH.',
    'HHHHHHHHHH',
    fringe,
    'HSSSSSSSSH',
    'HSSESSESSH',
    'HSSESSESSH',
    'HSCSSSSCSH',
    mouth,
    '.HHHHHHHH.',
  ];
}

/** A small, stable number from a text (FNV-1a). */
function hash(text: string): number {
  return Array.from(text).reduce(
    (h, c) => Math.imul(h ^ (c.codePointAt(0) ?? 0), 16_777_619) >>> 0,
    2_166_136_261,
  );
}

function pickOf<T>(list: readonly T[], seed: number, salt: number): T {
  return list[(seed >>> salt) % list.length] as T;
}

/** `hex` (#rrggbb) mixed towards black by `amount` (0…1). */
export function darken(hex: string, amount: number): string {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  const mixed = channels.map((c) => Math.round(c * (1 - amount)));
  return `rgb(${mixed.join(', ')})`;
}

export function PlayerFace({
  uuid,
  colour,
  online = false,
  className,
}: {
  readonly uuid: string;
  /** The rank colour (#rrggbb). */
  readonly colour: string;
  readonly online?: boolean;
  readonly className?: string;
}): ReactElement {
  const seed = hash(uuid);
  const pixels = useMemo(() => {
    const colours: Readonly<Record<string, string>> = {
      H: colour,
      S: pickOf(SKINS, seed, 0),
      E: pickOf(EYES, seed, 4),
      C: CHEEK,
      M: MOUTH,
    };
    return pattern(pickOf(FRINGES, seed, 8), pickOf(MOUTHS, seed, 12)).flatMap((row, y) =>
      Array.from(row).flatMap((letter, x) => {
        const fill = colours[letter];
        // Cheeks and mouth are see-through: skin underneath.
        const under = letter === 'C' || letter === 'M' ? colours['S'] : undefined;
        return fill ? [{ key: `${x}-${y}`, x, y, fill, under }] : [];
      }),
    );
  }, [colour, seed]);
  const style: CSSProperties = { backgroundColor: darken(colour, 0.62) };
  return (
    <span className={cn('relative inline-grid size-11 shrink-0', className)}>
      <span className="grid size-full place-items-center overflow-hidden rounded-[12px] p-[8%]" style={style}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} shapeRendering="crispEdges" className="size-full" aria-hidden>
          {pixels.map((p) => (
            <g key={p.key}>
              {p.under ? <rect x={p.x} y={p.y} width={1} height={1} fill={p.under} /> : null}
              <rect x={p.x} y={p.y} width={1} height={1} fill={p.fill} />
            </g>
          ))}
        </svg>
      </span>
      {online ? (
        <span
          className="mm-pulse absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-card bg-success"
          aria-hidden
        />
      ) : null}
    </span>
  );
}
