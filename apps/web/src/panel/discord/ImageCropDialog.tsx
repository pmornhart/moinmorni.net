import { Dialog as DialogPrimitive } from 'radix-ui';
import { Check, Crop, Film, Info, X, ZoomIn } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { Notice } from '../settings/extras/parts';

/**
 * Pick the part of a picture for Discord: a square (server symbol, bot picture – Discord shows it round) or a 16:9
 * banner. Drag to move, slider to zoom, arrow keys work too. Out comes a PNG (square, 512 px) or JPG (banner,
 * 960 × 540) – small enough for Discord. A moving GIF can stay as it is where Discord allows it (boost).
 */

export type CropShape = 'square' | 'banner';

/** Discord shows icons and avatars up to 512 px; banners at 960 × 540 (16:9). */
const SQUARE_SIDE = 512;
const BANNER_WIDTH = 960;
const BANNER_HEIGHT = 540;
const SQUARE_VIEW = 280;
const BANNER_VIEW = 360;
const HALF = 0.5;
const OUTPUT: Readonly<Record<CropShape, { readonly width: number; readonly height: number }>> = {
  square: { width: SQUARE_SIDE, height: SQUARE_SIDE },
  banner: { width: BANNER_WIDTH, height: BANNER_HEIGHT },
};
const VIEW_MAX: Readonly<Record<CropShape, number>> = { square: SQUARE_VIEW, banner: BANNER_VIEW };
const BANNER_RATIO = BANNER_WIDTH / BANNER_HEIGHT;
/** Room the dialog needs around the picture on small screens. */
const DIALOG_ROOM = 88;
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.01;
const KEY_STEP = 8;
const JPEG_QUALITY = 0.9;
/** Discord takes pictures up to 10 MB. */
export const IMAGE_MAX_BYTES = 10_485_760;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif'] as const;
/** „Graphic Control Extension“ – stands before every picture of a moving GIF. */
const GIF_FRAME = [0x21, 0xf9, 0x04] as const; // eslint-disable-line ts-patterns/no-magic-numbers -- bytes of the GIF format
const OVERLAY = 'fixed inset-0 z-40 bg-black/55 data-[state=open]:animate-in data-[state=open]:fade-in-0';
const CONTENT =
  'fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-[20px] border border-border bg-popover p-5 text-popover-foreground shadow-float data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:p-6';

/** Does this GIF have more than one picture? */
function isMoving(bytes: Uint8Array): boolean {
  const starts = bytes.reduce<number[]>((found, b, i) => {
    if (found.length > 1) return found;
    const hit = b === GIF_FRAME[0] && GIF_FRAME.every((part, k) => bytes[i + k] === part);
    return hit ? [...found, i] : found;
  }, []);
  return starts.length > 1;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(file);
  });
}

interface Loaded {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly moving: boolean;
  readonly image: HTMLImageElement;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function ImageCropDialog({
  file,
  shape,
  allowMoving,
  onCancel,
  onDone,
}: {
  readonly file: File | null;
  readonly shape: CropShape;
  /** The server may show moving pictures here (boost). */
  readonly allowMoving: boolean;
  readonly onCancel: () => void;
  readonly onDone: (dataUri: string) => void;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const zoomId = useId();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [zoom, setZoom] = useState(ZOOM_MIN);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const viewWidth = Math.min(VIEW_MAX[shape], Math.max(0, window.innerWidth - DIALOG_ROOM));
  const view = {
    width: viewWidth,
    height: shape === 'square' ? viewWidth : Math.round(viewWidth / BANNER_RATIO),
  };

  useEffect(() => {
    setLoaded(null);
    setProblem(null);
    setZoom(ZOOM_MIN);
    if (!file) return;
    if (!IMAGE_TYPES.some((type) => type === file.type)) {
      setProblem(t('discordLook.crop.wrongType'));
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setProblem(t('discordLook.crop.tooBig'));
      return;
    }
    void (async () => {
      try {
        const [src, bytes] = await Promise.all([readAsDataUrl(file), file.arrayBuffer()]);
        const image = new Image();
        image.src = src;
        await image.decode();
        setLoaded({
          src,
          width: image.naturalWidth,
          height: image.naturalHeight,
          moving: file.type === 'image/gif' && isMoving(new Uint8Array(bytes)),
          image,
        });
      } catch {
        setProblem(t('discordLook.crop.unreadable'));
      }
    })();
  }, [file, t]);

  const scale = loaded ? Math.max(view.width / loaded.width, view.height / loaded.height) * zoom : 1;
  const shown = loaded
    ? { width: loaded.width * scale, height: loaded.height * scale }
    : { width: 0, height: 0 };
  const fit = useCallback(
    (x: number, y: number) => ({
      x: clamp(x, view.width - shown.width, 0),
      y: clamp(y, view.height - shown.height, 0),
    }),
    [view.width, view.height, shown.width, shown.height],
  );
  // New picture or new zoom: keep the middle of the view where it was.
  useEffect(() => {
    setOffset((o) => fit(o.x, o.y));
  }, [fit]);
  useEffect(() => {
    if (loaded) setOffset({ x: (view.width - shown.width) * HALF, y: (view.height - shown.height) * HALF });
    // Only when a new picture is there – zoom and moving keep their own place.
  }, [loaded]);

  const changeZoom = (next: number): void => {
    if (!loaded) return;
    const before = scale;
    const after = Math.max(view.width / loaded.width, view.height / loaded.height) * next;
    const cx = (view.width * HALF - offset.x) / before;
    const cy = (view.height * HALF - offset.y) / before;
    setZoom(next);
    setOffset(fit(view.width * HALF - cx * after, view.height * HALF - cy * after));
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (d) setOffset(fit(d.ox + e.clientX - d.x, d.oy + e.clientY - d.y));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const moves: Readonly<Record<string, readonly [number, number]>> = {
      ArrowLeft: [KEY_STEP, 0],
      ArrowRight: [-KEY_STEP, 0],
      ArrowUp: [0, KEY_STEP],
      ArrowDown: [0, -KEY_STEP],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    setOffset((o) => fit(o.x + move[0], o.y + move[1]));
  };

  const finish = (): void => {
    if (!loaded) return;
    const out = OUTPUT[shape];
    const canvas = document.createElement('canvas');
    canvas.width = out.width;
    canvas.height = out.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      loaded.image,
      -offset.x / scale,
      -offset.y / scale,
      view.width / scale,
      view.height / scale,
      0,
      0,
      out.width,
      out.height,
    );
    onDone(shape === 'banner' ? canvas.toDataURL('image/jpeg', JPEG_QUALITY) : canvas.toDataURL('image/png'));
  };

  return (
    <DialogPrimitive.Root open={file !== null} onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={OVERLAY} />
        <DialogPrimitive.Content className={CONTENT}>
          <div className="flex items-start gap-3.5 pr-10">
            <span
              className="grid size-11 shrink-0 place-items-center rounded-[13px] bg-gold-soft text-gold"
              aria-hidden
            >
              <Crop className="size-[22px]" />
            </span>
            <div className="grid min-w-0 gap-1">
              <DialogPrimitive.Title className="font-display text-2xl font-semibold leading-tight">
                {t(`discordLook.crop.title.${shape}`)}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm text-muted-foreground text-pretty">
                {t('discordLook.crop.text')}
              </DialogPrimitive.Description>
            </div>
          </div>
          {problem ? <Notice tone="danger" icon={X} title={problem} /> : null}
          {loaded?.moving ? (
            <Notice
              tone={allowMoving ? 'blue' : 'warning'}
              icon={Film}
              title={t('discordLook.crop.movingTitle')}
            >
              {allowMoving ? t('discordLook.crop.movingOk') : t(`discordLook.crop.movingNo.${shape}`)}
            </Notice>
          ) : null}
          {loaded ? (
            <div className="grid justify-items-center gap-4">
              <div
                role="application"
                aria-label={t('discordLook.crop.area')}
                tabIndex={0}
                onKeyDown={onKey}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={() => {
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
                className="relative cursor-grab touch-none select-none overflow-hidden rounded-[14px] bg-muted outline-none ring-primary/40 focus-visible:ring-4 active:cursor-grabbing"
                style={{ width: view.width, height: view.height }}
              >
                <img
                  src={loaded.src}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute max-w-none"
                  style={{ left: offset.x, top: offset.y, width: shown.width, height: shown.height }}
                />
                {shape === 'square' ? (
                  <div
                    className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgba(0,0,0,0.45)]"
                    aria-hidden
                  />
                ) : null}
              </div>
              <div className="flex w-full max-w-[360px] items-center gap-3">
                <ZoomIn className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <label htmlFor={zoomId} className="sr-only">
                  {t('discordLook.crop.zoom')}
                </label>
                <input
                  id={zoomId}
                  type="range"
                  min={ZOOM_MIN}
                  max={ZOOM_MAX}
                  step={ZOOM_STEP}
                  value={zoom}
                  onChange={(e) => changeZoom(Number(e.target.value))}
                  className="w-full accent-[var(--primary)]"
                />
              </div>
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {t('discordLook.crop.hint')}
              </p>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" onClick={onCancel}>
              {t('discordAccess.cancel')}
            </Button>
            {loaded?.moving && allowMoving ? (
              <Button variant="secondary" onClick={() => onDone(loaded.src)}>
                <Film />
                {t('discordLook.crop.keepMoving')}
              </Button>
            ) : null}
            <Button onClick={finish} disabled={!loaded}>
              <Check />
              {t('discordLook.crop.use')}
            </Button>
          </div>
          <DialogPrimitive.Close asChild>
            <Button
              variant="ghost"
              size="iconSm"
              className={cn('absolute right-4 top-4')}
              aria-label={t('nav.close')}
            >
              <X />
            </Button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
