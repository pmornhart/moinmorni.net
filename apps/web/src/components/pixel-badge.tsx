import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import { drawBadge, type BadgeLook } from '@moinmorni/shared';
import { cn } from '~/lib/cn';

/** How many screen pixels one badge pixel gets by default (the badge is 9 pixels tall). */
const DEFAULT_SCALE = 3;
const RGBA = 4;

/**
 * A rank badge exactly as players with the badge pack see it in the game: the same pixel drawing the server puts into
 * the pack (packages/shared/src/badges.ts), scaled up without blurring. Nothing to draw (no letters, no symbol) →
 * nothing.
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
  const canvas = useRef<HTMLCanvasElement>(null);
  const picture = useMemo(
    () => drawBadge({ text: look.text, symbol: look.symbol, colour: look.colour }),
    [look.text, look.symbol, look.colour],
  );
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
      aria-label={look.text}
      className={cn('min-w-0', className)}
      // Pixel-sharp at its size; on a narrow phone it shrinks with the column instead of sticking out.
      style={{
        width: picture.width * scale,
        maxWidth: '100%',
        height: 'auto',
        aspectRatio: `${picture.width} / ${picture.height}`,
        imageRendering: 'pixelated',
      }}
    />
  );
}
