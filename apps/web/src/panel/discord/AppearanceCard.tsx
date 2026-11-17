import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Image as ImageIcon,
  ImagePlus,
  Lock,
  Palette,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useId, useRef, useState, type ChangeEvent, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Crest } from '~/components/brand';
import { FoldCard } from '~/components/fold-card';
import { Button, Card, Input, Pill, Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useErrorText } from '~/lib/errors';
import { mmApi } from '~/lib/mm-api';
import { Notice } from '../settings/extras/parts';
import { IMAGE_TYPES, ImageCropDialog, type CropShape } from './ImageCropDialog';
import { APPEARANCE_KEY, useAppearance, type AppearanceView } from './model';

/**
 * Panel → Discord → Aussehen: the server's symbol (standard: the MoinMorni logo), a banner (Discord needs boost level
 * 2 for that) and the bot's own picture and name. Discord allows changes to the bot only a few times an hour – the
 * page says so instead of trying again and again.
 */

type Target = 'icon' | 'banner' | 'avatar';

const SHAPE: Readonly<Record<Target, CropShape>> = { icon: 'square', banner: 'banner', avatar: 'square' };
const NAME_MAX = 32;
const ACCEPT = IMAGE_TYPES.join(',');
const BANNER_TIER = 2;

function Section({
  icon: Icon,
  title,
  text,
  children,
}: {
  readonly icon: typeof Palette;
  readonly title: string;
  readonly text: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section className="grid min-w-0 content-start gap-3 border-t border-border pt-5 first:border-t-0 first:pt-0 xl:border-l xl:border-t-0 xl:px-6 xl:pt-0 xl:first:border-l-0 xl:first:pl-0 xl:last:pr-0">
      <div className="grid gap-0.5">
        <h3 className="flex items-center gap-2 font-semibold">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          {title}
        </h3>
        <p className="text-[13.5px] leading-relaxed text-muted-foreground text-pretty">{text}</p>
      </div>
      {children}
    </section>
  );
}

/** Round preview like Discord shows it; without a picture the MoinMorni crest on green. */
function Round({ src, label }: { readonly src: string | null; readonly label: string }): ReactElement {
  return src ? (
    <img
      src={src}
      alt={label}
      className="size-20 shrink-0 rounded-full border border-border bg-muted object-cover"
    />
  ) : (
    <span
      className="grid size-20 shrink-0 place-items-center rounded-full border border-dashed border-border bg-muted"
      role="img"
      aria-label={label}
    >
      <Crest className="size-9 opacity-50" />
    </span>
  );
}

export function AppearanceCard({ ready }: { readonly ready: boolean }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const look = useAppearance(ready);
  const fileInput = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const [target, setTarget] = useState<Target>('icon');
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState<string | null>(null);
  /** A fresh file field after every pick, so the same file can be chosen again. */
  const [inputKey, setInputKey] = useState(0);

  const change = useMutation({
    mutationFn: ({ path, body }: { readonly path: string; readonly body: object }) =>
      mmApi<AppearanceView>(path, { method: 'PUT', body }),
    onSuccess: (view, { path }) => {
      queryClient.setQueryData(APPEARANCE_KEY, view);
      toast.success(t(`discordLook.saved.${path.split('/').at(-1) ?? 'icon'}`));
      setName(null);
    },
    onError: (err) => toast.error(errorText(err)),
  });
  const pick = (which: Target): void => {
    setTarget(which);
    fileInput.current?.click();
  };
  const onFile = (e: ChangeEvent<HTMLInputElement>): void => {
    setFile(e.target.files?.[0] ?? null);
    setInputKey((k) => k + 1);
  };
  const upload = (dataUri: string): void => {
    setFile(null);
    const paths: Readonly<Record<Target, { path: string; body: object }>> = {
      icon: { path: '/api/panel/discord/appearance/icon', body: { image: dataUri } },
      banner: { path: '/api/panel/discord/appearance/banner', body: { image: dataUri } },
      avatar: { path: '/api/panel/discord/appearance/bot', body: { avatar: dataUri } },
    };
    change.mutate(paths[target]);
  };

  if (!ready) {
    return (
      <Card className="grid gap-3 p-6">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
          <Palette className="size-5 text-gold" aria-hidden />
          {t('discordLook.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('discordLook.notReady')}</p>
      </Card>
    );
  }
  const view = look.data;
  const g = view?.guild ?? null;
  const bot = view?.bot ?? null;
  const busy = change.isPending;
  const shownName = name ?? bot?.name ?? '';

  return (
    <FoldCard
      id="discord:look"
      anchor="aussehen"
      icon={Palette}
      title={t('discordLook.title')}
      text={t('discordLook.text')}
      defaultOpen={false}
      bodyClassName="grid gap-5"
    >
      {look.isPending ? <Skeleton className="h-64" /> : null}
      {look.isError ? <p className="text-sm text-muted-foreground">{errorText(look.error)}</p> : null}
      {view ? (
        <div className="grid gap-5 xl:grid-cols-3 xl:gap-0">
          <Section icon={ImageIcon} title={t('discordLook.icon.title')} text={t('discordLook.icon.text')}>
            {g ? (
              <div className="flex flex-wrap items-center gap-4">
                <Round src={g.icon} label={t('discordLook.icon.preview', { name: g.name })} />
                <div className="grid gap-2">
                  {g.iconIsLogo ? (
                    <Pill tone="success" className="justify-self-start">
                      <Sparkles className="size-3" aria-hidden />
                      {t('discordLook.icon.isLogo')}
                    </Pill>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => pick('icon')} disabled={busy}>
                      <ImagePlus />
                      {t('discordLook.upload')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy || g.iconIsLogo}
                      onClick={() =>
                        change.mutate({ path: '/api/panel/discord/appearance/icon', body: { image: 'logo' } })
                      }
                    >
                      <RotateCcw />
                      {t('discordLook.useLogo')}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {g.animatedIcon ? t('discordLook.icon.animatedOk') : t('discordLook.icon.animatedNo')}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('discordLook.noGuild')}</p>
            )}
          </Section>

          <Section icon={ImagePlus} title={t('discordLook.banner.title')} text={t('discordLook.banner.text')}>
            {g ? (
              <div className="grid gap-3">
                <div
                  className={cn(
                    'relative grid aspect-[16/9] w-full max-w-[420px] place-items-center overflow-hidden rounded-[14px] border',
                    g.banners ? 'border-border bg-muted' : 'border-dashed border-border bg-muted/50',
                  )}
                >
                  {g.banner ? (
                    <img
                      src={g.banner}
                      alt={t('discordLook.banner.preview')}
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="flex items-center gap-2 px-4 text-center text-[13px] text-muted-foreground">
                      {g.banners ? null : <Lock className="size-4 shrink-0" aria-hidden />}
                      {g.banners
                        ? t('discordLook.banner.empty')
                        : t('discordLook.banner.locked', { tier: g.premiumTier, need: BANNER_TIER })}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => pick('banner')} disabled={busy || !g.banners}>
                    <ImagePlus />
                    {t('discordLook.upload')}
                  </Button>
                  {g.banner ? (
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy}
                      onClick={() =>
                        change.mutate({ path: '/api/panel/discord/appearance/banner', body: { image: null } })
                      }
                    >
                      <Trash2 />
                      {t('discordLook.banner.remove')}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('discordLook.noGuild')}</p>
            )}
          </Section>

          <Section icon={Bot} title={t('discordLook.bot.title')} text={t('discordLook.bot.text')}>
            {bot ? (
              <div className="grid gap-4">
                <div className="flex flex-wrap items-center gap-4">
                  <Round src={bot.avatar} label={t('discordLook.bot.preview', { name: bot.name })} />
                  <div className="grid gap-2">
                    {bot.avatarIsLogo ? (
                      <Pill tone="success" className="justify-self-start">
                        <Sparkles className="size-3" aria-hidden />
                        {t('discordLook.icon.isLogo')}
                      </Pill>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => pick('avatar')} disabled={busy}>
                        <ImagePlus />
                        {t('discordLook.upload')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy || bot.avatarIsLogo}
                        onClick={() =>
                          change.mutate({
                            path: '/api/panel/discord/appearance/bot',
                            body: { avatar: 'logo' },
                          })
                        }
                      >
                        <RotateCcw />
                        {t('discordLook.useLogo')}
                      </Button>
                    </div>
                  </div>
                </div>
                <form
                  className="grid gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (shownName.trim() && shownName.trim() !== bot.name)
                      change.mutate({
                        path: '/api/panel/discord/appearance/bot',
                        body: { name: shownName.trim() },
                      });
                  }}
                >
                  <label htmlFor={nameId} className="text-sm font-semibold">
                    {t('discordLook.bot.name')}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      id={nameId}
                      value={shownName}
                      maxLength={NAME_MAX}
                      onChange={(e) => setName(e.target.value)}
                      className="min-w-0 flex-1 basis-48"
                    />
                    <Button
                      type="submit"
                      variant="secondary"
                      disabled={busy || !shownName.trim() || shownName.trim() === bot.name}
                    >
                      <Save />
                      {t('discordLook.bot.saveName')}
                    </Button>
                  </div>
                </form>
                <Notice tone="neutral" icon={Lock}>
                  {t('discordLook.bot.limit')}
                </Notice>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('discordLook.noBot')}</p>
            )}
          </Section>
        </div>
      ) : null}
      <input
        key={inputKey}
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={onFile}
      />
      <ImageCropDialog
        file={file}
        shape={SHAPE[target]}
        allowMoving={
          target === 'icon' ? Boolean(g?.animatedIcon) : target === 'banner' && Boolean(g?.animatedBanner)
        }
        onCancel={() => setFile(null)}
        onDone={upload}
      />
    </FoldCard>
  );
}
