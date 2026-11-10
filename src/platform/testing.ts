// テスト専用。アプリからは読み込まない。
import { act, cleanup } from '@testing-library/preact';

// 描いた画面をすべて外し、後片付け(effect の cleanup)もその場で済ませる。
// Preact 11 は外した部品の後片付けを次の描画のあとへ回すので、act の外で外すと、テストファイルが終わって
// 環境が片付いたあとに document へ触れて落ちることがある(2026-11-11 に CI で起きた)。
export function unmountAll(): void {
  act(() => cleanup());
}
