import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import preact from '@preact/preset-vite';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// アプリ名は .env の VITE_APP_NAME を唯一の置き場所にする。
const APP_NAME = loadEnv('production', process.cwd(), 'VITE_').VITE_APP_NAME;
const BACKGROUND = '#f2f5f6';

// マニフェストと、ビルド結果を一覧にした Service Worker を出力する。通信なしでも起動できるようにするため。
function pwaAssets(): Plugin {
  return {
    name: 'sinus-rescue-pwa-assets',
    apply: 'build',
    generateBundle(_, bundle) {
      const manifest = {
        name: APP_NAME,
        short_name: APP_NAME,
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: BACKGROUND,
        theme_color: BACKGROUND,
        lang: 'ja',
        icons: [
          { src: './icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: './icon-512.png', sizes: '512x512', type: 'image/png' },
          // 形はマスクの安全域に収めてある(tools/make-icons.mjs で確かめる)ので、Android の切り抜きにも同じ画像を使う。
          { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      };
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify(manifest, null, 2) });
      const files = ['./', 'manifest.webmanifest', ...Object.keys(bundle), ...readdirSync('public')].filter(
        (file, index, all) => file !== 'index.html' && all.indexOf(file) === index,
      );
      const contents = Object.values(bundle)
        .map((item) => (item.type === 'chunk' ? item.code : String(item.source)))
        .join('\n');
      const template = readFileSync('src/platform/sw.template.js', 'utf8');
      const version = createHash('sha256').update(files.join('\n')).update(contents).update(template).digest('hex').slice(0, 12);
      const source = template
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(files));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  // 一時トンネルと GitHub Pages のサブパスの両方で動くよう、相対パスで出力する。
  base: './',
  plugins: [preact(), pwaAssets()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true, allowedHosts: ['.trycloudflare.com'] },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.ts'],
  },
});
