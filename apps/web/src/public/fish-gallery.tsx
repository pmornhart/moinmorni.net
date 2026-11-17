import { Fish } from 'lucide-react';
import type { CSSProperties, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ANGEL_FISH, type AngelRarity } from '@moinmorni/shared';
import { MM_NAMESPACE } from '~/i18n';
import { useLanguage } from '~/lib/text';
import { Panel } from './kit';
import { modeStyle } from './cards';

/** Farbe je Seltenheit (wie die Namen der Fänge im Spiel). */
const RARITY_COLOUR: Readonly<Record<AngelRarity, string>> = {
  common: '#b8c0c4',
  uncommon: '#5fd068',
  rare: '#5b93ff',
  epic: '#b06cff',
  legendary: '#ffc83a',
  junk: '#a08060',
};

/**
 * Bild je Art (eigene Zeichnung wie im Paket, `scripts/fische-bilder.ts`). Die Pfade stehen hier ausgeschrieben, damit die
 * Demo sie einbetten kann (`scripts/inline-demo.mjs` sucht nach `/bilder/…`).
 */
const PICTURES: Readonly<Record<string, string>> = {
  rotauge: '/bilder/fisch-rotauge.png',
  barsch: '/bilder/fisch-barsch.png',
  bachforelle: '/bilder/fisch-bachforelle.png',
  karausche: '/bilder/fisch-karausche.png',
  renke: '/bilder/fisch-renke.png',
  aesche: '/bilder/fisch-aesche.png',
  schleie: '/bilder/fisch-schleie.png',
  steinkrebs: '/bilder/fisch-steinkrebs.png',
  seesaibling: '/bilder/fisch-seesaibling.png',
  hecht: '/bilder/fisch-hecht.png',
  zander: '/bilder/fisch-zander.png',
  aal: '/bilder/fisch-aal.png',
  rutte: '/bilder/fisch-rutte.png',
  waller: '/bilder/fisch-waller.png',
  huchen: '/bilder/fisch-huchen.png',
  seeforelle: '/bilder/fisch-seeforelle.png',
  goldforelle: '/bilder/fisch-goldforelle.png',
  seekoenig: '/bilder/fisch-seekoenig.png',
  moorkoenig: '/bilder/fisch-moorkoenig.png',
  kristallsaibling: '/bilder/fisch-kristallsaibling.png',
  stiefel: '/bilder/fisch-stiefel.png',
  treibholz: '/bilder/fisch-treibholz.png',
  flaschenpost: '/bilder/fisch-flaschenpost.png',
};

/** Pixel-Zeichnungen bleiben scharf, wenn sie größer gezeigt werden. */
const PIXELATED: CSSProperties = { imageRendering: 'pixelated' };

/**
 * Angelkönig: alle Fische mit ihrer eigenen Zeichnung (dieselben Bilder wie im Angelkönig-Paket, eigene Pixel-Kunst,
 * `packages/builder/src/fische/`).
 */
export function FishGallery(): ReactElement {
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
            <Fish className="size-5" />
          </span>
          {t('site.guide.angelkoenig.fishTitle')}
        </h2>
        <p className="max-w-[70ch] text-[15px] leading-snug text-muted-foreground">
          {t('site.guide.angelkoenig.fishIntro')}
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {ANGEL_FISH.map((f) => {
          const colour = RARITY_COLOUR[f.rarity];
          const legendary = f.rarity === 'legendary';
          return (
            <li
              key={f.id}
              className="grid content-start justify-items-center gap-2 rounded-[8px] border-2 border-border bg-background-alt p-3 text-center"
              style={legendary ? { borderColor: colour, boxShadow: `0 0 14px ${colour}55` } : undefined}
            >
              <img
                src={PICTURES[f.id]}
                alt=""
                width={96}
                height={96}
                loading="lazy"
                className="size-24"
                style={PIXELATED}
              />
              <span className="font-pixel text-[1.15rem] font-bold leading-tight" style={{ color: colour }}>
                {language === 'en' ? f.en : f.de}
              </span>
              <span className="font-pixel text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                {t(`site.guide.angelkoenig.fishRarity.${f.rarity}`)}
              </span>
              <span className="text-[13px] leading-snug text-muted-foreground">
                {language === 'en' ? f.noteEn : f.noteDe}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
