# sinus-rescue

自分に響くハミングの音を登録し、毎日のルーティンでガイドするスマホ向けPWA。必要なら、ケアと症状の記録も併せて使えます。音声は端末内だけで処理し、録音も送信もしません。

診断や治療を行うものではなく、効果を約束するものでもありません。

## 開発

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

URL に `?sim=1` を付けるとマイクの代わりに合成音を入力し、`&fast=1` で待ち時間を短縮します。`?swipe=1` を付けると、iPhone のホーム画面アプリ用の左端スワイプで戻る操作を、ほかの環境でも試せます。ブラウザ上の動作確認用で、iPhone 固有の挙動の確認にはなりません。

仕様と決定の経緯は [docs/00-concept.md](docs/00-concept.md) にあります。

## 公開

`main` に push すると、GitHub Actions がテストとビルドを行い、できたファイルを `gh-pages` ブランチに置きます。GitHub Pages は Settings → Pages で「Deploy from a branch」を選び、`gh-pages` の `/ (root)` を配信します。

## ライセンス

[MIT](LICENSE)。アイコンの形は [Feather Icons](https://github.com/feathericons/feather)(MIT)を参考にしています。
