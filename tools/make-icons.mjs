// ホーム画面用のアイコン「音叉と副鼻腔」(D-037)を PNG で書き出す。依存を増やさないよう、描画も符号化も自前で行う。
// 形は 100×100 の座標で持ち、サイズごとに拡大して描く。音叉が鼻で、両脇の淡い形が頬の奥の副鼻腔(上顎洞)。
// 地は角丸にせず全面を塗る。角は iOS と Android がそれぞれの形に切り抜く。
import { writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const SIZES = [180, 192, 512];
const BACKGROUND = [255, 255, 255];
const FORK = [0, 133, 122]; // styles.css の --teal
const SINUS = [0, 169, 157]; // styles.css の --brand
const SINUS_OPACITY = 0.28;
const FORK_HALF_WIDTH = 3.5;
// Android のマスク可能アイコンで切れない範囲(中心から一辺の 40%)。
const SAFE_RADIUS = 40;

// 音叉: 左右の歯、二股の底の半円、柄。線の端と継ぎ目は丸い。
const FORK_LINES = [
  [41, 18, 41, 50],
  [59, 50, 59, 18],
  [50, 59, 50, 84],
];
const FORK_ARC = { cx: 50, cy: 50, r: 9 }; // 下半分だけを描く

// 左の副鼻腔の輪郭。右側は左右を反転して使う。
const SINUS_PATH = [
  [33, 34],
  ['C', 25, 34, 16, 39, 16, 48],
  ['C', 16, 58, 23, 67, 29, 70],
  ['C', 32, 71.5, 34, 69, 34, 65],
  ['L', 34, 37],
  ['C', 34, 35, 33.5, 34, 33, 34],
];

function flatten(path, steps = 32) {
  const [start, ...segments] = path;
  const points = [start];
  let [x0, y0] = start;
  for (const [kind, ...v] of segments) {
    if (kind === 'L') {
      points.push(v);
      [x0, y0] = v;
      continue;
    }
    const [x1, y1, x2, y2, x3, y3] = v;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      points.push([
        u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
      ]);
    }
    [x0, y0] = [x3, y3];
  }
  // 閉じた輪郭の終点は始点と重なるので落とす(多角形は最後と最初を結ぶ)。
  const [lx, ly] = points[points.length - 1];
  if (lx === start[0] && ly === start[1]) points.pop();
  return points;
}

const SINUS_POLYGON = flatten(SINUS_PATH);
const SINUS_BOX = {
  minX: Math.min(...SINUS_POLYGON.map(([x]) => x)),
  maxX: Math.max(...SINUS_POLYGON.map(([x]) => x)),
  minY: Math.min(...SINUS_POLYGON.map(([, y]) => y)),
  maxY: Math.max(...SINUS_POLYGON.map(([, y]) => y)),
};

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const length2 = dx * dx + dy * dy;
  if (length2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length2));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function forkDistance(px, py) {
  const { cx, cy, r } = FORK_ARC;
  const arc = py >= cy ? Math.abs(Math.hypot(px - cx, py - cy) - r) : Math.min(Math.hypot(px - cx + r, py - cy), Math.hypot(px - cx - r, py - cy));
  return Math.min(arc, ...FORK_LINES.map(([ax, ay, bx, by]) => segmentDistance(px, py, ax, ay, bx, by)));
}

// 内側なら正、外側なら負の距離。
function sinusSignedDistance(px, py) {
  let inside = false;
  let nearest = Infinity;
  for (let i = 0, j = SINUS_POLYGON.length - 1; i < SINUS_POLYGON.length; j = i++) {
    const [xi, yi] = SINUS_POLYGON[i];
    const [xj, yj] = SINUS_POLYGON[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    nearest = Math.min(nearest, segmentDistance(px, py, xi, yi, xj, yj));
  }
  return inside ? nearest : -nearest;
}

function assertInsideSafeZone() {
  const far = [
    ...FORK_LINES.flatMap(([ax, ay, bx, by]) => [
      [ax, ay],
      [bx, by],
    ]).map(([x, y]) => Math.hypot(x - 50, y - 50) + FORK_HALF_WIDTH),
    ...SINUS_POLYGON.map(([x, y]) => Math.hypot(x - 50, y - 50)),
  ];
  const max = Math.max(...far);
  if (max > SAFE_RADIUS) throw new Error(`アイコンの形がマスクの安全域からはみ出しています(${max.toFixed(1)} > ${SAFE_RADIUS})`);
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

function sinusCoverage(px, py, pixel) {
  // 右側は左右反転して左の輪郭で測る。
  const x = px < 50 ? px : 100 - px;
  const margin = 1 / pixel;
  if (x < SINUS_BOX.minX - margin || x > SINUS_BOX.maxX + margin || py < SINUS_BOX.minY - margin || py > SINUS_BOX.maxY + margin) return 0;
  return clamp01(sinusSignedDistance(x, py) * pixel + 0.5);
}

function drawIcon(size) {
  const pixel = size / 100; // 1 座標あたりの画素数
  const stride = size * 3 + 1;
  const pixels = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    pixels[y * stride] = 0; // 行ごとのフィルタ: なし
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / pixel;
      const py = (y + 0.5) / pixel;
      const sinus = sinusCoverage(px, py, pixel) * SINUS_OPACITY;
      const fork = clamp01((FORK_HALF_WIDTH - forkDistance(px, py)) * pixel + 0.5);
      for (let channel = 0; channel < 3; channel++) {
        let value = BACKGROUND[channel];
        value += (SINUS[channel] - value) * sinus;
        value += (FORK[channel] - value) * fork;
        pixels[y * stride + 1 + x * 3 + channel] = Math.round(value);
      }
    }
  }
  return encodePng(size, pixels);
}

function chunk(type, data) {
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(4 + typed.length + 4); // 長さ、種類+中身、CRC
  out.writeUInt32BE(data.length, 0);
  typed.copy(out, 4);
  out.writeUInt32BE(crc32(typed), 4 + typed.length);
  return out;
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // 1 色 8 ビット
  header[9] = 2; // RGB(透明なし。iOS は透明部分を黒にするため)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

assertInsideSafeZone();
for (const size of SIZES) {
  writeFileSync(`${OUT_DIR}icon-${size}.png`, drawIcon(size));
}
