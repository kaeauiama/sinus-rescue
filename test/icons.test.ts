// 公開するアイコンの PNG が読めることを確かめる。以前は塊の後ろに余分な 0 が入り、どの端末でも読めなかった(D-037)。
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { crc32, inflateSync } from 'node:zlib';

const PUBLIC = resolve(__dirname, '..', 'public');
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface Chunk {
  type: string;
  data: Buffer;
}

function readChunks(file: Buffer): Chunk[] {
  const chunks: Chunk[] = [];
  let offset = SIGNATURE.length;
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const typed = file.subarray(offset + 4, offset + 8 + length);
    expect(crc32(typed)).toBe(file.readUInt32BE(offset + 8 + length));
    chunks.push({ type: typed.subarray(0, 4).toString('ascii'), data: typed.subarray(4) });
    offset += 12 + length;
  }
  expect(offset).toBe(file.length);
  return chunks;
}

describe.each([180, 192, 512])('icon-%i.png', (size) => {
  it('PNG として最後まで正しく読め、大きさと画素数が合う', () => {
    const file = readFileSync(join(PUBLIC, `icon-${size}.png`));
    expect(file.subarray(0, SIGNATURE.length).equals(SIGNATURE)).toBe(true);
    const chunks = readChunks(file);
    expect(chunks[0].type).toBe('IHDR');
    expect(chunks.at(-1)?.type).toBe('IEND');
    const header = chunks[0].data;
    expect([header.readUInt32BE(0), header.readUInt32BE(4)]).toEqual([size, size]);
    // 8 ビットの RGB。iOS は透明な部分を黒くするので、透明は持たせない。
    expect([header[8], header[9]]).toEqual([8, 2]);
    const pixels = inflateSync(Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data)));
    expect(pixels.length).toBe((size * 3 + 1) * size);
  });
});
