import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import { drawBadge, drawBadgeTile, type BadgeLook, type BadgePicture } from '@moinmorni/shared';
import { cn } from '~/lib/cn';

/** How many screen pixels one badge pixel gets by default (the badge is 9 pixels tall). */
const DEFAULT_SCALE = 3;
/** The tile is 27 pixels – one screen pixel each is already a good size next to a name. */
const DEFAULT_TILE_SCALE = 1;
const RGBA = 4;

/** A pixel picture on a canvas, scaled up without blurring; on a narrow phone it shrinks with its column. */
function PixelPicture({
  picture,
  scale,
  label,
  smooth = false,
  className,
}: {
  readonly picture: BadgePicture | null;
  readonly scale: number;
  readonly label: string;
  /** Shrunk below its size: smooth like a browser (and Discord) does, instead of dropping pixel rows. */
  readonly smooth?: boolean;
  readonly className?: string;
}): ReactElement | null {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx || !picture) return;
    const pixels = new Uint8ClampedArray(picture.width * picture.height * RGBA);
    pixels.set(picture.rgba);
    ctx.putImageData(new ImageData(pixels, picture.width, picture.height), 0, 0);
  }, [picture]);
  if (!picture) return null;
  return (
    <canvas
      ref={canvas}
      width={picture.width}
      height={picture.height}
      role="img"
      aria-label={label}
      className={cn('min-w-0', className)}
      style={{
        width: picture.width * scale,
        maxWidth: '100%',
        height: 'auto',
        aspectRatio: `${picture.width} / ${picture.height}`,
        imageRendering: smooth ? 'auto' : 'pixelated',
      }}
    />
  );
}

/**
 * A rank badge exactly as players with the badge pack see it in the game: the same pixel drawing the server puts into
 * the pack (packages/shared/src/badges.ts). Nothing to draw (no letters, no symbol) → nothing.
 */
export function PixelBadge({
  look,
  scale = DEFAULT_SCALE,
  className,
}: {
  readonly look: BadgeLook;
  readonly scale?: number;
  readonly className?: string;
}): ReactElement | null {
  const picture = useMemo(
    () => drawBadge({ text: look.text, symbol: look.symbol, colour: look.colour }),
    [look.text, look.symbol, look.colour],
  );
  return <PixelPicture picture={picture} scale={scale} label={look.text} className={className} />;
}

/**
 * The badge as a square tile (only the symbol, gold frame, ring in the rank's colour) – what Discord shows as the role
 * icon next to the role's name. No symbol → nothing.
 */
export function PixelTile({
  look,
  scale = DEFAULT_TILE_SCALE,
  className,
}: {
  readonly look: BadgeLook;
  /** Below 1 the tile is shrunk smoothly (like Discord shows role icons). */
  readonly scale?: number;
  readonly className?: string;
}): ReactElement | null {
  const picture = useMemo(
    () => drawBadgeTile({ symbol: look.symbol, colour: look.colour }),
    [look.symbol, look.colour],
  );
  return (
    <PixelPicture
      picture={picture}
      scale={scale}
      label={look.text}
      smooth={scale < 1}
      className={className}
    />
  );
}
