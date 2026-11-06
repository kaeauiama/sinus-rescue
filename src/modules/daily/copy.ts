// 長い文章の置き場所。医療効果や薬の指示を書かないことを test/guards.test.ts で検査する(HC-1, HC-2)。
import type { HintCode } from './domain/hints';
import { DECONGESTANT_STOP_DAY, DECONGESTANT_WARN_DAY } from './rules';

export const DAILY_NOTICE_LINES = [
  '毎日のケアと症状を記録して、経過を見返すための機能です。病名の判定や治療の提案はしません。',
  '記録はこの端末の中だけにあり、外には送りません。',
  '薬を始める、やめる、量を変えるときは、医師か薬剤師に相談してください。',
];

export const WATER_TITLE = '洗浄に使う水';

export const WATER_LINES = [
  '蒸留水、滅菌水、一度煮沸して冷ました水が勧められています。',
  '器具は使うたびに洗って乾かしてください。',
];

export const WATER_CAUTION = 'この水はそのまま使わず、蒸留水、滅菌水、一度煮沸して冷ました水を使うことが勧められています。';

export const SCORE_ANCHORS = '0 なし　3 気になるが支障なし\n7 生活に支障　10 想像しうる最悪';

export const HINTS_TITLE = '相談の目安に当てはまる記録があります';

export const HINTS_NOTE = '記録から機械的に判定したもので、診断ではありません。';

export const HINT_TEXT: Record<HintCode, string> = {
  BLOOD: '洗浄液の戻りに血が混じった日があります。',
  UNILATERAL: '片側だけの症状が数日続いています。',
  ODOR: '嫌なにおいが数日続いています。',
  REBOUND: 'いったん軽くなったあと、また強くなっています。',
  PROLONGED: '10日ほど、症状が軽くならない状態が続いています。',
  LONG_TERM: '記録を始めて12週がたちました。受診サマリを持参すると、経過を伝えやすくなります。',
};

// 連続の日数と注意だけを伝える。やめるかどうかは医師や薬剤師の判断に委ねる(HC-2, HC-4)。
export function decongestantText(run: number): string | null {
  if (run >= DECONGESTANT_STOP_DAY) {
    return `連続${run}日目です。使用期間は製品の説明書に従い、続いているときは医師か薬剤師に確認してください。`;
  }
  if (run >= DECONGESTANT_WARN_DAY) return `連続${run}日目です。続けて使うと、鼻づまりが強くなることがあります。`;
  if (run >= 1) return `連続${run}日目`;
  return null;
}
