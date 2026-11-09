import { canGoBack, goBack } from './back';

// iPhone でホーム画面から開いたアプリには、ブラウザの戻るジェスチャーが無い。
// 画面の左端から右へなぞったら、ほかの戻る操作と同じように今の画面の戻る処理を呼ぶ。
// Safari のタブや Android では端末側のジェスチャーが履歴を戻すので、ここでは何もしない。
// 動作確認用に ?swipe=1 で、ほかの環境でも有効にできる。

export const EDGE_PX = 24;
export const COMMIT_PX = 72;
const LOCK_PX = 12;

export interface SwipeTrack {
  startX: number;
  startY: number;
  dx: number;
  locked: boolean;
}

export function swipeStart(x: number, y: number): SwipeTrack | null {
  return x <= EDGE_PX ? { startX: x, startY: y, dx: 0, locked: false } : null;
}

// 縦の動きが先に大きくなったらスクロールとみなして追跡をやめる。
export function swipeMove(track: SwipeTrack, x: number, y: number): SwipeTrack | null {
  const dx = x - track.startX;
  const dy = Math.abs(y - track.startY);
  if (!track.locked) {
    if (dy > LOCK_PX && dy > dx) return null;
    return { ...track, dx: Math.max(0, dx), locked: dx > LOCK_PX };
  }
  return { ...track, dx: Math.max(0, dx) };
}

export const swipeCommits = (track: SwipeTrack | null) => Boolean(track?.locked && track.dx >= COMMIT_PX);

const wanted = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true || new URLSearchParams(location.search).has('swipe');

let installed = false;

export function installEdgeSwipe(): void {
  if (installed || typeof window === 'undefined' || !wanted()) return;
  installed = true;

  const marker = document.createElement('div');
  marker.className = 'edge-back';
  marker.setAttribute('aria-hidden', 'true');
  marker.innerHTML =
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
  document.body.append(marker);

  let track: SwipeTrack | null = null;

  const hide = () => {
    marker.classList.remove('ready');
    marker.style.opacity = '0';
  };
  const show = (t: SwipeTrack, y: number) => {
    const ratio = Math.min(t.dx / COMMIT_PX, 1);
    marker.style.transform = `translate(${Math.round(-44 + 60 * ratio)}px, ${Math.round(y - 22)}px)`;
    marker.style.opacity = String(ratio);
    marker.classList.toggle('ready', ratio >= 1);
  };
  const stop = () => {
    track = null;
    hide();
  };

  window.addEventListener(
    'touchstart',
    (event) => {
      const touch = event.touches[0];
      track = event.touches.length === 1 && canGoBack() ? swipeStart(touch.clientX, touch.clientY) : null;
    },
    { passive: true },
  );
  window.addEventListener(
    'touchmove',
    (event) => {
      if (!track) return;
      const touch = event.touches[0];
      track = swipeMove(track, touch.clientX, touch.clientY);
      if (!track) hide();
      else if (track.locked) show(track, touch.clientY);
    },
    { passive: true },
  );
  window.addEventListener('touchend', () => {
    const commit = swipeCommits(track);
    stop();
    if (commit) goBack();
  });
  // 端末がジェスチャーを引き取ったときは touchcancel が届くので、こちらでは戻らない。
  window.addEventListener('touchcancel', stop);
  window.addEventListener('popstate', stop);
}
