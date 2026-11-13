import sinusMap from '../assets/sinus-map.webp';
import { SITES, type SiteId } from '../domain/sites';

// 図の押せる範囲(D-040)。元の画像(1536×940)で部位の色の塊を囲んだ凸多角形で、正面と横顔の両方に置く。
// 図を差し替えたら作り直す。赤い鼻腔は選ぶ部位ではないので押せない。
const ZONES: Record<SiteId, string[]> = {
  cheek: [
    'M190 499L290 468L309 473L316 504L315 522L289 595L281 613L265 631L243 636L224 625L172 552L164 535L168 515L187 500Z',
    'M475 468L578 500L595 513L600 534L593 551L542 623L526 635L503 633L488 620L478 602L452 534L449 516L449 491L455 474Z',
    'M999 454L1018 454L1115 474L1132 482L1141 510L1091 604L1075 621L1048 624L1025 619L1008 609L996 590L966 507L964 485L975 464Z',
  ],
  'between-eyes': [
    'M437 461L323 460L301 409L317 357L365 333L402 333L438 348L464 398L444 459Z',
    'M1119 451L971 435L948 402L938 361L954 346L1006 338L1044 339L1089 350L1113 367L1135 415L1141 438L1128 451Z',
  ],
  forehead: [
    'M366 212L369 273L369 299L362 318L346 333L318 337L218 310L203 296L206 277L221 261L324 186L350 178L363 191Z',
    'M395 278L398 207L404 185L425 178L545 262L559 278L561 298L447 337L428 337L410 327L398 309Z',
    'M979 294L980 313L966 325L905 355L887 358L872 347L868 327L896 247L906 223L924 193L940 184Z',
  ],
  'deep-nose': ['M1119 357L1129 342L1156 340L1246 364L1261 382L1259 401L1221 466L1207 483L1189 487L1170 476Z'],
};

// 副鼻腔のおおよその位置を示す図。診断のためではなく、響きを感じる場所の案内に使う。
// 正面からは見えない鼻の奥(蝶形骨洞)は、右の横顔で示す。
export function FaceMap({ onPick }: { onPick?: (site: SiteId) => void }) {
  return (
    <div class="sinus-map">
      <img src={sinusMap} width={1000} height={612} alt="副鼻腔のおおよその位置を示す図。左が正面、右が横から見たところ" />
      <svg viewBox="0 0 1536 940" aria-hidden="true">
        {SITES.map((site) => (
          <g key={site.id} class="zone" data-site={site.id} onClick={() => onPick?.(site.id)}>
            {ZONES[site.id].map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}
