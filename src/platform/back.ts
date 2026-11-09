import { useLayoutEffect, useRef } from 'preact/hooks';

// 端末の「戻る」(ブラウザやマウスの戻るボタン、Android の戻るジェスチャー、iPhone の端からのスワイプ)を、
// 今の画面の「戻る」に結びつける。履歴は、ページを開いたときの1枚と、その上に積む目印の1枚だけを使う。
// 戻る先のある画面では目印を積んでおき、戻る操作で目印が外れたら、その画面の戻る処理を呼ぶ。
// 戻る先のない画面(タブの最初の画面など)では目印を外し、端末の戻るは通常どおりアプリを離れる。

const MARK = 'sinusRescueBack';
const OWN_POP_TIMEOUT_MS = 500;

interface Entry {
  run: () => void;
}

const entries: Entry[] = [];
let guarded = false;
let ownPop = false;
let ownPopTimer: ReturnType<typeof setTimeout> | undefined;
let scheduled = false;
let installed = false;

const isMark = (state: unknown) => Boolean(state && typeof state === 'object' && (state as Record<string, unknown>)[MARK]);

const current = () => entries[entries.length - 1];

function sync() {
  scheduled = false;
  if (ownPop) return;
  if (current() && !guarded) {
    history.pushState({ [MARK]: true }, '');
    guarded = true;
  } else if (!current() && guarded) {
    guarded = false;
    popOwnMark();
  }
}

// 目印を自分で外す。戻った知らせが届かなかったときは、今の履歴を見て合わせ直す。
function popOwnMark() {
  ownPop = true;
  history.back();
  clearTimeout(ownPopTimer);
  ownPopTimer = setTimeout(() => {
    if (!ownPop) return;
    ownPop = false;
    guarded = isMark(history.state);
    schedule();
  }, OWN_POP_TIMEOUT_MS);
}

// 画面の切り替えでは、古い画面の解除と新しい画面の登録が続けて起きるので、まとめてから履歴を合わせる。
function schedule() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(sync);
}

function onPopState(event: PopStateEvent) {
  const onMark = isMark(event.state);
  if (ownPop) {
    ownPop = false;
    clearTimeout(ownPopTimer);
    guarded = onMark;
    schedule();
    return;
  }
  if (onMark) {
    // 「進む」で目印の上に戻ってきた。
    guarded = true;
    schedule();
    return;
  }
  guarded = false;
  current()?.run();
  schedule();
}

export function installBack(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  // 再読み込みで目印の上から始まった場合も、次の同期で正しい枚数に戻す。
  guarded = isMark(history.state);
  window.addEventListener('popstate', onPopState);
  schedule();
}

export const canGoBack = () => Boolean(current());

// 端からのスワイプなど、アプリ側で検出した戻る操作。履歴を経由して、ほかの戻る操作と同じ道を通す。
export function goBack(): boolean {
  const entry = current();
  if (!entry) return false;
  if (guarded && !ownPop) history.back();
  else entry.run();
  return true;
}

// 画面ごとの戻る処理を登録する。handler が無い画面は戻る先のない画面として扱う。
export function useBack(handler: (() => void) | undefined): void {
  const latest = useRef(handler);
  latest.current = handler;
  const active = Boolean(handler);
  useLayoutEffect(() => {
    if (!active) return undefined;
    installBack();
    const entry: Entry = { run: () => latest.current?.() };
    entries.push(entry);
    schedule();
    return () => {
      entries.splice(entries.indexOf(entry), 1);
      schedule();
    };
  }, [active]);
}
