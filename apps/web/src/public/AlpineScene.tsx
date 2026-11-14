/* eslint-disable ts-patterns/no-magic-numbers -- drawing coordinates of the scene */
import { useId, type ReactElement } from 'react';
import { cn } from '~/lib/cn';

/**
 * MoinMorni's own Alpine village, drawn by hand as SVG (no screenshots, no game graphics): snowy peaks, a castle
 * on the hill, a church with an onion dome, wooden houses with flower boxes and a maypole in white and blue. In
 * the light design it is an evening in late summer, in the dark design a night with lit windows. Colours come
 * from the `--sc-*` variables in public.css; the sky is the background of the section around it.
 */

type Point = readonly [number, number];

/** Far range: peaks above y = 300 carry snow. */
const FAR: readonly Point[] = [
  [0, 470],
  [60, 400],
  [130, 430],
  [240, 330],
  [330, 400],
  [420, 350],
  [520, 410],
  [600, 318],
  [700, 395],
  [790, 360],
  [880, 420],
  [960, 296],
  [1040, 380],
  [1100, 432],
  [1180, 392],
  [1262, 252],
  [1330, 340],
  [1400, 300],
  [1484, 206],
  [1560, 300],
  [1600, 270],
];
const SNOW_LINE = 340;
const CAP_DEPTH = 0.3;

const MID: readonly Point[] = [
  [0, 522],
  [90, 470],
  [200, 500],
  [310, 444],
  [420, 495],
  [540, 456],
  [660, 505],
  [760, 470],
  [860, 512],
  [980, 458],
  [1080, 500],
  [1200, 472],
  [1300, 505],
  [1420, 462],
  [1520, 495],
  [1600, 472],
];

function ridge(points: readonly Point[], bottom = 700): string {
  return `M${points.map(([x, y]) => `${x} ${y}`).join(' L')} V${bottom} H0Z`;
}

function lerp(a: Point, b: Point, f: number): Point {
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

/** A snow cap on a peak: down both slopes, with a jagged lower edge. */
function snowCaps(points: readonly Point[]): string[] {
  return points.flatMap((peak, i) => {
    const before = points[i - 1];
    const after = points[i + 1];
    if (!before || !after || peak[1] > SNOW_LINE) return [];
    const left = lerp(peak, before, CAP_DEPTH);
    const right = lerp(peak, after, CAP_DEPTH);
    const at = (f: number, lift: number): Point => {
      const [x, y] = lerp(left, right, f);
      return [x, y - lift];
    };
    const edge = [left, at(0.22, 10), at(0.42, -6), at(0.6, 8), at(0.8, -4), right];
    return [`M${peak[0]} ${peak[1]} L${edge.map(([x, y]) => `${x} ${y}`).join(' L')}Z`];
  });
}

/** A fir: three stacked triangles on a short trunk. */
function Fir({ x, y, h, dark = false }: { x: number; y: number; h: number; dark?: boolean }): ReactElement {
  const w = h * 0.42;
  const tiers = [0, 0.3, 0.56].map((f) => {
    const top = y - h + h * f * 0.9;
    const base = top + h * 0.5;
    const half = w * (0.55 + f * 0.6);
    return `M${x} ${top} L${x - half} ${base} L${x + half} ${base}Z`;
  });
  return (
    <g className={dark ? 'sc-tree-2' : 'sc-tree'}>
      <rect x={x - h * 0.04} y={y - h * 0.12} width={h * 0.08} height={h * 0.14} className="sc-wood" />
      {tiers.map((d) => (
        <path key={d} d={d} />
      ))}
    </g>
  );
}

/** A round leaf tree for the village. */
function LeafTree({ x, y, r }: { x: number; y: number; r: number }): ReactElement {
  return (
    <g>
      <rect x={x - 2.5} y={y - r * 1.2} width={5} height={r * 1.2} className="sc-wood" />
      <circle cx={x} cy={y - r * 1.55} r={r} className="sc-tree" />
      <circle cx={x - r * 0.45} cy={y - r * 1.25} r={r * 0.7} className="sc-tree" />
      <circle cx={x + r * 0.5} cy={y - r * 1.3} r={r * 0.68} className="sc-tree-2" />
    </g>
  );
}

/** An Alpine house: plastered ground floor, wooden upper floor with balcony, wide low roof, flower boxes. */
function House({
  x,
  y,
  w,
  h,
  roof,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  roof: number;
}): ReactElement {
  const top = y - h;
  const split = top + h * 0.45;
  const eave = w * 0.13;
  const windowW = w * 0.16;
  const windowH = h * 0.2;
  const columns = [0.24, 0.6].map((f) => x + w * f);
  return (
    <g>
      <rect x={x} y={top} width={w} height={h} className="sc-wall" />
      <rect x={x} y={top} width={w} height={split - top} className="sc-wood" />
      <rect x={x - 3} y={split - 4} width={w + 6} height={5} className="sc-roof" />
      {columns.map((cx) => (
        <g key={cx}>
          <rect x={cx} y={top + h * 0.12} width={windowW} height={windowH} className="sc-window" />
          <rect x={cx} y={split + h * 0.14} width={windowW} height={windowH} className="sc-window" />
          <rect x={cx - 4} y={split + h * 0.14} width={4} height={windowH} className="sc-shutter" />
          <rect x={cx + windowW} y={split + h * 0.14} width={4} height={windowH} className="sc-shutter" />
          <rect
            x={cx - 2}
            y={split + h * 0.14 + windowH}
            width={windowW + 4}
            height={4}
            className="sc-flower"
          />
        </g>
      ))}
      <path
        d={`M${x - eave} ${top + 2} L${x + w / 2} ${top - roof} L${x + w + eave} ${top + 2} L${x + w + eave} ${top + 7} L${x + w / 2} ${top - roof + 6} L${x - eave} ${top + 7}Z`}
        className="sc-roof"
      />
      <path
        d={`M${x} ${top} L${x + w / 2} ${top - roof + 6} L${x + w} ${top}Z`}
        className="sc-wood"
        opacity={0.75}
      />
      <rect x={x + w * 0.42} y={y - h * 0.32} width={w * 0.16} height={h * 0.32} rx={2} className="sc-roof" />
    </g>
  );
}

function Church(): ReactElement {
  return (
    <g>
      <rect x={878} y={548} width={70} height={62} className="sc-wall" />
      <path d="M872 550L913 518L954 550L954 555L913 524L872 555Z" className="sc-roof" />
      <rect x={890} y={566} width={10} height={18} rx={5} className="sc-window" />
      <rect x={920} y={566} width={10} height={18} rx={5} className="sc-window" />
      <rect x={942} y={474} width={30} height={136} className="sc-wall" />
      <rect x={942} y={474} width={30} height={6} className="sc-castle-shade" />
      <circle cx={957} cy={498} r={7} className="sc-castle-shade" />
      <circle cx={957} cy={498} r={5} className="sc-window" />
      <rect x={952} y={520} width={10} height={16} rx={5} className="sc-window" />
      <path d="M941 474Q934 457 957 440Q980 457 973 474Z" className="sc-dome" />
      <path d="M950 441Q952 432 957 426Q962 432 964 441Z" className="sc-dome" />
      <line x1={957} y1={426} x2={957} y2={410} strokeWidth={2} className="sc-stroke-gold" />
      <circle cx={957} cy={409} r={3} className="sc-gold" />
    </g>
  );
}

const MERLONS = Array.from({ length: 11 }, (_, i) => 1250 + i * 16.8);

function Castle({ flag }: { flag: string }): ReactElement {
  const windows: readonly Point[] = [
    [1240, 396],
    [1240, 420],
    [1328, 350],
    [1340, 350],
    [1334, 384],
    [1416, 392],
    [1416, 416],
    [1278, 412],
    [1296, 412],
    [1372, 428],
    [1392, 428],
  ];
  return (
    <g>
      {MERLONS.map((x) => (
        <rect key={x} x={x} y={412} width={8} height={9} className="sc-castle" />
      ))}
      <rect x={1250} y={420} width={176} height={50} className="sc-castle" />
      <path d="M1328 470 v-22 a10 10 0 0 1 20 0 v22Z" className="sc-castle-shade" />
      <rect x={1232} y={382} width={26} height={88} className="sc-castle" />
      <path d="M1227 384 L1245 336 L1263 384Z" className="sc-castle-roof" />
      <rect x={1266} y={396} width={46} height={74} className="sc-castle" />
      <path d="M1261 398 L1289 368 L1317 398Z" className="sc-castle-roof" />
      <rect x={1318} y={332} width={34} height={138} className="sc-castle" />
      <rect x={1318} y={332} width={8} height={138} className="sc-castle-shade" />
      <path d="M1312 334 L1335 262 L1358 334Z" className="sc-castle-roof" />
      <line x1={1335} y1={262} x2={1335} y2={236} strokeWidth={2} className="sc-stroke-gold" />
      <rect x={1335} y={237} width={26} height={15} fill={`url(#${flag})`} className="mm-flag" />
      <rect x={1362} y={402} width={44} height={68} className="sc-castle" />
      <path d="M1358 404 L1384 380 L1410 404Z" className="sc-castle-roof" />
      <rect x={1408} y={374} width={28} height={96} className="sc-castle" />
      <rect x={1428} y={374} width={8} height={96} className="sc-castle-shade" />
      <path d="M1403 376 L1422 324 L1441 376Z" className="sc-castle-roof" />
      {windows.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={6} height={11} rx={3} className="sc-window" />
      ))}
    </g>
  );
}

/** The maypole: white-blue spiral, wreaths, little guild boards and ribbons that sway. */
function Maypole({ stripes }: { stripes: string }): ReactElement {
  const boards: readonly (readonly [number, 'l' | 'r'])[] = [
    [372, 'l'],
    [412, 'r'],
    [452, 'l'],
    [492, 'r'],
    [532, 'l'],
  ];
  const ribbons = [-14, -5, 5, 14];
  return (
    <g>
      <rect x={1146} y={300} width={9} height={312} fill={`url(#${stripes})`} />
      {boards.map(([y, side]) => {
        const x = side === 'l' ? 1122 : 1157;
        return (
          <g key={y}>
            <line
              x1={side === 'l' ? 1138 : 1155}
              y1={y + 7}
              x2={side === 'l' ? 1146 : 1162}
              y2={y + 7}
              strokeWidth={2}
              className="sc-stroke-wood"
            />
            <rect x={x} y={y} width={22} height={15} rx={2} className="sc-board" />
            <rect x={x + 3} y={y + 3} width={16} height={9} rx={1} className="sc-board-art" />
          </g>
        );
      })}
      <ellipse cx={1150.5} cy={336} rx={24} ry={6} fill="none" strokeWidth={5} className="sc-stroke-wreath" />
      <g className="mm-sway" style={{ transformOrigin: '1150px 338px' }}>
        {ribbons.map((dx, i) => (
          <path
            key={dx}
            d={`M${1150 + dx} 338 q${dx * 0.3} 26 ${dx * 0.1} 52`}
            fill="none"
            strokeWidth={3}
            strokeLinecap="round"
            className={i % 2 ? 'sc-stroke-blue' : 'sc-stroke-white'}
          />
        ))}
      </g>
      <path d="M1150 256 L1136 284 L1164 284Z M1150 270 L1132 304 L1168 304Z" className="sc-tree" />
    </g>
  );
}

function BeerGarden(): ReactElement {
  return (
    <g>
      {[1196, 1276].map((x) => (
        <g key={x}>
          <rect x={x - 1} y={572} width={2} height={44} className="sc-wood" />
          <path d={`M${x - 26} 578 Q${x} 560 ${x + 26} 578Z`} className="sc-umbrella" />
          <path d={`M${x - 26} 578 Q${x - 13} 571 ${x} 570 L${x} 578Z`} className="sc-umbrella-blue" />
          <rect x={x - 18} y={604} width={36} height={4} className="sc-wood" />
          <rect x={x - 16} y={608} width={3} height={10} className="sc-wood" />
          <rect x={x + 13} y={608} width={3} height={10} className="sc-wood" />
        </g>
      ))}
    </g>
  );
}

export function AlpineScene({ className }: { readonly className?: string }): ReactElement {
  const id = useId().replaceAll(':', '');
  const stripes = `${id}-pole`;
  const flag = `${id}-flag`;
  const glow = `${id}-glow`;
  const firs: readonly (readonly [number, number, number, boolean?])[] = [
    [36, 594, 70],
    [84, 582, 92],
    [132, 596, 64],
    [300, 588, 58],
    [338, 592, 74],
    [560, 556, 60],
    [604, 548, 80],
    [652, 556, 56],
    [1032, 566, 44],
    [1060, 560, 52],
    [1520, 586, 70],
    [1566, 578, 88],
  ];
  const flowers: readonly Point[] = [
    [420, 662],
    [466, 676],
    [520, 660],
    [590, 684],
    [640, 668],
    [700, 690],
    [1240, 660],
    [1300, 676],
    [1380, 664],
    [1450, 684],
    [1520, 668],
    [880, 676],
  ];
  return (
    <svg
      viewBox="0 0 1600 700"
      preserveAspectRatio="xMaxYMax slice"
      className={cn('mm-scene pointer-events-none block h-full w-full', className)}
      aria-hidden
    >
      <defs>
        <pattern
          id={stripes}
          width={10}
          height={14}
          patternUnits="userSpaceOnUse"
          patternTransform="skewY(-28)"
        >
          <rect width={10} height={7} className="sc-pole-white" />
          <rect y={7} width={10} height={7} className="sc-pole-blue" />
        </pattern>
        <pattern id={flag} width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={8} height={8} className="sc-pole-white" />
          <rect width={4} height={4} className="sc-pole-blue" />
          <rect x={4} y={4} width={4} height={4} className="sc-pole-blue" />
        </pattern>
        <radialGradient id={glow}>
          <stop offset="0" className="sc-glow-stop" />
          <stop offset="1" className="sc-glow-stop" stopOpacity={0} />
        </radialGradient>
      </defs>

      <g className="sc-day">
        <circle cx={1056} cy={398} r={150} fill={`url(#${glow})`} />
        <circle cx={1056} cy={398} r={46} className="sc-sun" />
      </g>
      <g className="sc-night">
        <circle cx={1330} cy={118} r={90} fill={`url(#${glow})`} />
        <circle cx={1330} cy={118} r={26} className="sc-sun" />
        <circle cx={1322} cy={112} r={5} className="sc-moon-spot" />
        <circle cx={1338} cy={126} r={3.5} className="sc-moon-spot" />
      </g>

      <g className="mm-drift sc-cloud">
        <ellipse cx={1440} cy={92} rx={80} ry={13} />
        <ellipse cx={1480} cy={82} rx={44} ry={15} />
        <ellipse cx={1000} cy={120} rx={110} ry={14} />
        <ellipse cx={1050} cy={108} rx={56} ry={16} />
        <ellipse cx={1500} cy={210} rx={70} ry={12} />
      </g>

      <path d={ridge(FAR)} className="sc-far" />
      {snowCaps(FAR).map((d) => (
        <path key={d} d={d} className="sc-snow" />
      ))}
      <path d={ridge(MID)} className="sc-mid" />

      <path
        d="M1010 700 L1010 566 Q1140 478 1300 462 Q1430 452 1530 506 Q1572 528 1600 540 V700Z"
        className="sc-castle-hill"
      />
      <Castle flag={flag} />

      <path
        d="M0 602 Q120 556 260 570 Q420 590 560 548 Q700 512 860 550 Q960 574 1060 562 Q1200 546 1320 578 Q1460 612 1600 578 V700 H0Z"
        className="sc-hill"
      />
      {firs.map(([x, y, h]) => (
        <Fir key={`${x}-${y}`} x={x} y={y} h={h} />
      ))}

      <path
        d="M0 646 Q200 604 420 620 Q620 638 800 612 Q980 588 1160 606 Q1380 630 1600 600 V700 H0Z"
        className="sc-meadow"
      />
      <path
        d="M930 700 C960 662 1040 640 1128 618 L1172 618 C1100 642 1046 668 1036 700Z"
        className="sc-path"
      />

      <Church />
      <LeafTree x={986} y={604} r={16} />
      <House x={1002} y={602} w={112} h={74} roof={28} />
      <rect x={1030} y={548} width={56} height={10} rx={2} className="sc-board" />
      <BeerGarden />
      <Maypole stripes={stripes} />
      <House x={1306} y={622} w={96} h={60} roof={24} />
      <LeafTree x={1420} y={624} r={18} />
      <House x={1440} y={620} w={104} h={64} roof={26} />

      <path d="M0 700 L0 664 Q260 630 560 652 Q760 666 900 650 L900 700Z" className="sc-meadow-2" />
      <g className="sc-stroke-wood" strokeWidth={3}>
        <line x1={300} y1={660} x2={700} y2={664} />
        <line x1={300} y1={672} x2={700} y2={676} />
        {[300, 360, 420, 480, 540, 600, 660, 700].map((x) => (
          <line key={x} x1={x} y1={652} x2={x} y2={684} />
        ))}
      </g>
      {flowers.map(([x, y], i) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={3} className={i % 3 ? 'sc-flower' : 'sc-flower-2'} />
      ))}
      <Fir x={40} y={712} h={170} dark />
      <Fir x={128} y={716} h={128} dark />
      <Fir x={1588} y={714} h={150} dark />
    </svg>
  );
}
