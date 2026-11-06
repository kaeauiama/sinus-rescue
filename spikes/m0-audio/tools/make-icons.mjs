// ホーム画面用のアイコンを PNG で書き出す。依存を増やさないよう自前で符号化する。
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const BACKGROUND = [47, 111, 107];
const WAVE = [250, 249, 246];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typed = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(8 + typed.length + 4);
  out.writeUInt32BE(data.length, 0);
  typed.copy(out, 4);
  out.writeUInt32BE(crc32(typed), 4 + typed.length);
  return out;
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function drawIcon(size) {
  const stride = size * 3 + 1;
  const pixels = Buffer.alloc(stride * size);
  const halfWidth = size * 0.022;
  const margin = size * 0.2;
  const amplitude = size * 0.13;
  const curveY = (x) => size / 2 - amplitude * Math.sin((((x - margin) / (size - 2 * margin)) * 3 * Math.PI));
  for (let y = 0; y < size; y++) {
    pixels[y * stride] = 0;
    for (let x = 0; x < size; x++) {
      let distance = Infinity;
      for (let cx = Math.max(margin, x - amplitude); cx <= Math.min(size - margin, x + amplitude); cx += 0.5) {
        distance = Math.min(distance, Math.hypot(x - cx, y - curveY(cx)));
      }
      const coverage = Math.max(0, Math.min(1, halfWidth - distance + 0.5));
      for (let channel = 0; channel < 3; channel++) {
        pixels[y * stride + 1 + x * 3 + channel] = Math.round(
          BACKGROUND[channel] + (WAVE[channel] - BACKGROUND[channel]) * coverage,
        );
      }
    }
  }
  return encodePng(size, pixels);
}

for (const size of [180, 192, 512]) {
  writeFileSync(`${OUT_DIR}icon-${size}.png`, drawIcon(size));
}
