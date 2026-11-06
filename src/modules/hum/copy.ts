// 長い文章の置き場所。医療効果をうたわないことを test/guards.test.ts で検査する(HC-1)。

export const APP_NAME = import.meta.env.VITE_APP_NAME as string;

export const NOTICE_LINES = [
  'ハミングの音程を合わせて、自分に響く音を記録するアプリです。診断や治療はせず、効果も約束しません。',
  'アプリが測るのは声の高さだけです。振動は、ご自身の感覚で確かめます。',
  'めまい、耳の痛み、頭痛が出たら中止してください。',
  '音声は端末の中だけで処理し、録音も送信もしません。',
];

export const DANGER_TITLE = '次の症状があるときは、早めに医療機関へ';

export const DANGER_SIGNS = [
  '目の周りの腫れや赤み',
  'ものが二重に見える、視力が落ちた',
  '額の腫れ、激しい頭痛',
  '首の硬さ、手足の麻痺、ろれつが回らない、意識がぼんやりする',
  '高熱など、全身の強い不調',
];

export const CONSULT_TITLE = '耳鼻科で相談する目安';

export const CONSULT_SIGNS = [
  '10日以上たっても良くならない',
  'いったん良くなったあと、また悪くなった',
  '片側だけの症状、血の混じる鼻水、嫌なにおいが続く',
  '症状が3か月続いている',
];

export const EXPERIMENT_INTRO = [
  '登録した音の日と楽な高さの音の日を3日ずつ入れ替えて、翌朝の鼻の通りを比べます。全部で24日です。',
  'どちらの日かはアプリが決め、今日のハミングをその音で案内します。',
  '毎日ハミングして、翌朝の1問に答えると、比べられる記録が増えます。',
];

export const EXPERIMENT_NO_DIFFERENCE =
  '差は検出できませんでした。差がないという意味ではありません。この方法で見つけられるのは大きな差だけです。';

export const EXPERIMENT_UNUSABLE = '比べられる記録が足りないので、判定しませんでした。';

export const EXPERIMENT_LIMITS = '自分の記録だけの比較です。音の違いは自分でわかるので、期待の影響は取り除けません。体調の波の影響も残ります。';

export function experimentDifferenceText(registeredMean: number, usualMean: number): string {
  const gap = Math.round(Math.abs(registeredMean - usualMean) * 10) / 10;
  return `この条件では差がありました。登録した音の翌朝は、楽な高さの音の翌朝より ${gap} ${registeredMean > usualMean ? '高く' : '低く'}記録されています。`;
}

export const BACKGROUND_TITLE = 'このアプリの考え方';

export const BACKGROUND_LINES = [
  'ハミングで鼻の中の一酸化窒素が大きく増えるという報告がありますが、健康な人を対象にした小規模な研究です。',
  'ハミングの呼吸法を標準治療に加えた小規模な試験はありますが、ハミングだけの効果は確かめられていません。',
  '響く音は本人の感覚による記録です。副鼻腔そのものの振動を測っているわけではありません。',
  '短セットと3分の休憩は、続けてハミングすると一酸化窒素の上昇が小さくなり、3分の休止で戻るという報告を参考にしています。',
  '連続型は、1例だけの報告を参考にした設定です。',
];
