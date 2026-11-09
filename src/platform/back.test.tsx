import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { COMMIT_PX, EDGE_PX, swipeCommits, swipeMove, swipeStart } from './edgeSwipe';
import { Screen } from './ui';

const marked = () => Boolean((history.state as Record<string, unknown> | null)?.sinusRescueBack);

function Demo() {
  const [page, setPage] = useState<'root' | 'detail' | 'edit' | 'question'>('root');
  if (page === 'root') {
    return (
      <Screen title="一覧">
        <button type="button" onClick={() => setPage('detail')}>
          開く
        </button>
      </Screen>
    );
  }
  if (page === 'detail') {
    return (
      <Screen title="詳細" onClose={() => setPage('root')}>
        <button type="button" onClick={() => setPage('edit')}>
          編集へ
        </button>
        <button type="button" onClick={() => setPage('question')}>
          質問へ
        </button>
      </Screen>
    );
  }
  if (page === 'edit') return <Screen title="編集" onClose={() => setPage('detail')} />;
  return <Screen title="質問" onBack={() => setPage('root')} />;
}

afterEach(async () => {
  cleanup();
  await waitFor(() => expect(marked()).toBe(false));
});

describe('端末の戻る操作', () => {
  it('戻る先のない画面では、履歴に目印を積まない', async () => {
    render(<Demo />);
    await screen.findByText('一覧');
    await Promise.resolve();
    expect(marked()).toBe(false);
  });

  it('戻る先のある画面では、端末の戻るでその画面の戻る処理を呼ぶ', async () => {
    render(<Demo />);
    fireEvent.click(await screen.findByText('開く'));
    await waitFor(() => expect(marked()).toBe(true));
    history.back();
    await screen.findByText('一覧');
    await waitFor(() => expect(marked()).toBe(false));
  });

  it('奥へ進んでも、戻るたびに1画面ずつ戻る', async () => {
    render(<Demo />);
    fireEvent.click(await screen.findByText('開く'));
    fireEvent.click(await screen.findByText('編集へ'));
    await screen.findByText('編集');
    await waitFor(() => expect(marked()).toBe(true));
    history.back();
    await screen.findByText('詳細');
    await waitFor(() => expect(marked()).toBe(true));
    history.back();
    await screen.findByText('一覧');
  });

  it('画面の閉じるで戻ったときは、目印を外す', async () => {
    render(<Demo />);
    fireEvent.click(await screen.findByText('開く'));
    await waitFor(() => expect(marked()).toBe(true));
    fireEvent.click(screen.getByText('閉じる'));
    await screen.findByText('一覧');
    await waitFor(() => expect(marked()).toBe(false));
  });

  it('閉じるの無い画面でも、onBack を渡せば戻れる', async () => {
    render(<Demo />);
    fireEvent.click(await screen.findByText('開く'));
    fireEvent.click(await screen.findByText('質問へ'));
    await screen.findByText('質問');
    expect(screen.queryByText('閉じる')).toBeNull();
    await waitFor(() => expect(marked()).toBe(true));
    history.back();
    await screen.findByText('一覧');
  });
});

describe('左端からのスワイプ', () => {
  it('左端から始めたときだけ追跡する', () => {
    expect(swipeStart(EDGE_PX + 1, 300)).toBeNull();
    expect(swipeStart(EDGE_PX, 300)).not.toBeNull();
  });

  it('右へ十分になぞると戻る', () => {
    let track = swipeStart(4, 300);
    track = swipeMove(track!, 30, 304);
    track = swipeMove(track!, 4 + COMMIT_PX, 320);
    expect(swipeCommits(track)).toBe(true);
  });

  it('短いスワイプでは戻らない', () => {
    let track = swipeStart(4, 300);
    track = swipeMove(track!, 4 + COMMIT_PX - 1, 302);
    expect(swipeCommits(track)).toBe(false);
  });

  it('縦の動きが先なら、スクロールとみなしてやめる', () => {
    const track = swipeStart(4, 300);
    expect(swipeMove(track!, 10, 340)).toBeNull();
  });
});
