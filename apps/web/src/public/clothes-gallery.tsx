import { Shirt } from 'lucide-react';
import type { CSSProperties, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ANGEL_CLOTHES } from '@moinmorni/shared';
import { MM_NAMESPACE } from '~/i18n';
import { useLanguage } from '~/lib/text';
import { Panel } from './kit';
import { modeStyle } from './cards';

/**
 * Bild je Stück (Holzpuppe mit dem Stück, gezeichnet aus dem Angelkönig-Paket, `scripts/kleidung-bilder.ts`). Die
 * Pfade stehen hier ausgeschrieben, damit die Demo sie einbetten kann (`scripts/inline-demo.mjs` sucht nach `/bilder/…`).
 */
const PICTURES: Readonly<Record<string, string>> = {
  fischerhut: '/bilder/kleidung-fischerhut.png',
  strohhut: '/bilder/kleidung-strohhut.png',
  trachtenhut: '/bilder/kleidung-trachtenhut.png',
  koenigskrone: '/bilder/kleidung-koenigskrone.png',
  anglerweste: '/bilder/kleidung-anglerweste.png',
  regenjacke: '/bilder/kleidung-regenjacke.png',
  lederhose: '/bilder/kleidung-lederhose.png',
  wathose: '/bilder/kleidung-wathose.png',
  gummistiefel: '/bilder/kleidung-gummistiefel.png',
};

/** Pixel-Kanten bleiben scharf, wenn das Bild größer gezeigt wird. */
const PIXELATED: CSSProperties = { imageRendering: 'pixelated' };
const CROWN_GOLD = '#ffc83a';

/** Angelkönig: Hüte und Kleidung aus dem Kleiderschrank mit ihrem eigenen Aussehen. */
export function ClothesGallery(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const language = useLanguage();
  return (
    <Panel className="grid gap-5 p-6 sm:p-7" style={modeStyle('angelkoenig')}>
      <div className="grid gap-2">
        <h2 className="flex items-center gap-3 font-pixel text-[1.7rem] font-bold leading-tight">
          <span
            className="mm-mode-bg grid size-11 place-items-center rounded-[6px] border-2 border-black/20 text-white"
            aria-hidden
          >
            <Shirt className="size-5" />
          </span>
          {t('site.guide.angelkoenig.clothesTitle')}
        </h2>
        <p className="max-w-[70ch] text-[15px] leading-snug text-muted-foreground">
          {t('site.guide.angelkoenig.clothesIntro')}
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {ANGEL_CLOTHES.map((c) => {
          const crown = c.price === 0;
          return (
            <li
              key={c.id}
              className="grid content-start justify-items-center gap-2 rounded-[8px] border-2 border-border bg-background-alt p-3 text-center"
              style={crown ? { borderColor: CROWN_GOLD, boxShadow: `0 0 14px ${CROWN_GOLD}55` } : undefined}
            >
              <img
                src={PICTURES[c.id]}
                alt=""
                width={128}
                height={128}
                loading="lazy"
                className="size-32"
                style={PIXELATED}
              />
              <span
                className="font-pixel text-[1.15rem] font-bold leading-tight"
                style={crown ? { color: CROWN_GOLD } : undefined}
              >
                {language === 'en' ? c.en : c.de}
              </span>
              <span className="font-pixel text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                {t(`site.guide.angelkoenig.clothesSlot.${c.slot}`)} ·{' '}
                {crown
                  ? t('site.guide.angelkoenig.clothesCrown')
                  : t('site.guide.angelkoenig.clothesPrice', { price: c.price })}
              </span>
              <span className="text-[13px] leading-snug text-muted-foreground">
                {language === 'en' ? c.noteEn : c.noteDe}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
