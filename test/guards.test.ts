// Hard Constraint を文章だけにしないためのガード。ソースを静的に検査する。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(__dirname, '..');
const SRC = join(ROOT, 'src');
const HUM = join(SRC, 'modules', 'hum');
const DAILY = join(SRC, 'modules', 'daily');
const MODULE_FILES = [...sourceFiles(HUM), ...sourceFiles(DAILY)];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const read = (path: string) => readFileSync(path, 'utf8');
const label = (path: string) => relative(ROOT, path).split(sep).join('/');

// 文字列リテラルとタグの間の文字を、画面に出る文言の候補として取り出す。
function displayStrings(path: string): string[] {
  return [...read(path).matchAll(/(['"`])((?:(?!\1).)*)\1|>([^<>{}]+)</g)].map((m) => m[2] ?? m[3] ?? '');
}

function imports(path: string): string[] {
  const code = read(path);
  return [...code.matchAll(/(?:from\s+|import\s+|import\()['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

function resolveImport(path: string, specifier: string): string | null {
  return specifier.startsWith('.') ? resolve(dirname(path), specifier) : null;
}

describe('HC-8 ハミング機能は単体で動く', () => {
  it.each(sourceFiles(HUM).map((f) => [label(f), f]))('%s は hum と platform 以外のモジュールに依存しない', (_, file) => {
    for (const specifier of imports(file)) {
      const target = resolveImport(file, specifier);
      if (target) {
        const allowed = target.startsWith(HUM) || target.startsWith(join(SRC, 'platform'));
        expect(allowed, `${label(file)} -> ${specifier}`).toBe(true);
      } else {
        expect(['preact', 'preact/hooks'], `${label(file)} -> ${specifier}`).toContain(specifier);
      }
    }
  });

  it.each(sourceFiles(join(SRC, 'platform')).map((f) => [label(f), f]))('%s は機能モジュールに依存しない', (_, file) => {
    for (const specifier of imports(file)) {
      const target = resolveImport(file, specifier);
      if (target) expect(target.startsWith(join(SRC, 'platform')), `${label(file)} -> ${specifier}`).toBe(true);
    }
  });
});

describe('日々の記録からハミングへの依存は片方向で、中身には触れない', () => {
  it.each(sourceFiles(DAILY).map((f) => [label(f), f]))('%s が読むのはハミングの純粋な部分と文言だけ', (_, file) => {
    for (const specifier of imports(file)) {
      const target = resolveImport(file, specifier);
      if (!target) {
        expect(['preact', 'preact/hooks'], `${label(file)} -> ${specifier}`).toContain(specifier);
      } else if (target.startsWith(HUM)) {
        const allowed = target.startsWith(join(HUM, 'domain')) || target === join(HUM, 'copy');
        expect(allowed, `${label(file)} -> ${specifier}`).toBe(true);
      } else {
        const allowed = target.startsWith(DAILY) || target.startsWith(join(SRC, 'platform'));
        expect(allowed, `${label(file)} -> ${specifier}`).toBe(true);
      }
    }
  });
});

describe('HC-5 / HC-6 音声と健康データを外に出さない', () => {
  const FORBIDDEN = ['fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'EventSource', 'MediaRecorder', 'RTCPeerConnection'];

  it.each(sourceFiles(SRC).map((f) => [label(f), f]))('%s は通信と録音の API を使わない', (_, file) => {
    const code = read(file);
    for (const api of FORBIDDEN) expect(code.includes(api), `${label(file)} uses ${api}`).toBe(false);
  });
});

describe('HC-1 医療効果をうたわず、診断しない', () => {
  const FORBIDDEN = [
    '治ります',
    '治る',
    '効きます',
    '効果があります',
    '改善します',
    '診断します',
    '診断結果',
    '完治',
    '上顎洞に効',
    '前頭洞に効',
    '篩骨洞に効',
    '蝶形骨洞に効',
    '副鼻腔が振動',
    'あなたは副鼻腔炎',
  ];

  it.each(MODULE_FILES.map((f) => [label(f), f]))('%s に禁止表現がない', (_, file) => {
    for (const phrase of FORBIDDEN) {
      for (const text of displayStrings(file)) expect(text.includes(phrase), `${label(file)}: ${phrase}`).toBe(false);
    }
  });
});

describe('HC-2 薬の開始、中止、増減を提案しない', () => {
  const FORBIDDEN = ['薬をやめて', '服用を中止', '使用を中止', '使うのをやめ', '増量', '減量', '飲み始めて', '使い始めてください', '量を増やして', '量を減らして'];

  it.each(MODULE_FILES.map((f) => [label(f), f]))('%s に薬を指示する表現がない', (_, file) => {
    for (const phrase of FORBIDDEN) {
      for (const text of displayStrings(file)) expect(text.includes(phrase), `${label(file)}: ${phrase}`).toBe(false);
    }
  });
});

describe('HC-7 相関や差を因果として表示しない', () => {
  const FORBIDDEN = ['原因です', '原因は', 'のせいで', 'が効いた', '効果がありました', '効果があった', '悪化要因です', 'で改善しました'];

  it.each(MODULE_FILES.map((f) => [label(f), f]))('%s に因果を断定する表現がない', (_, file) => {
    for (const phrase of FORBIDDEN) {
      for (const text of displayStrings(file)) expect(text.includes(phrase), `${label(file)}: ${phrase}`).toBe(false);
    }
  });
});

describe('鼻と口の両方を閉じる指示を出さない(U-18)', () => {
  const FORBIDDEN = ['口を閉じて鼻をつまむ', '口を閉じたまま鼻をつまむ', '鼻と口を閉じ', '口と鼻を閉じ', '口も閉じ', '鼻をつまんで口を閉じ'];

  it.each(MODULE_FILES.map((f) => [label(f), f]))('%s に両方を閉じさせる表現がない', (_, file) => {
    for (const phrase of FORBIDDEN) {
      for (const text of displayStrings(file)) expect(text.includes(phrase), `${label(file)}: ${phrase}`).toBe(false);
    }
  });
});

describe('Service Worker のテンプレート', () => {
  it.each(['__VERSION__', '__PRECACHE__'])('%s はビルド時の置換先として1回だけ現れる', (placeholder) => {
    const template = read(join(SRC, 'platform', 'sw.template.js'));
    expect(template.split(placeholder).length - 1).toBe(1);
  });
});

describe('閾値は rules.ts に集約する', () => {
  it('M0 で決めた音量の下限が反映されている', () => {
    expect(read(join(HUM, 'rules.ts'))).toContain('PITCH_MIN_DB = -60');
  });
});

describe('アプリ名は .env だけに置く', () => {
  it('index.html に直書きしない', () => {
    const html = read(join(ROOT, 'index.html'));
    expect(html).toContain('%VITE_APP_NAME%');
    expect(html).not.toContain('副鼻腔振動計');
  });

  it('ソースに直書きしない', () => {
    for (const file of sourceFiles(SRC)) expect(read(file).includes('副鼻腔振動計'), label(file)).toBe(false);
  });
});
