// ハミング機能の閾値と既定値の単一の置き場所。文書からは名前で参照する。

// 音程の検出(M0 の実機結果: 最も低い声が -52dB、雑音が -62dB 前後)
export const PITCH_MIN_DB = -60;
export const PITCH_F_MIN = 65;
export const PITCH_F_MAX = 650;
export const PITCH_THRESHOLD = 0.15;
export const PITCH_MAX_APERIODICITY = 0.35;
export const FRAME_INTERVAL_MS = 50;

// 音程合わせ
export const PITCH_TOLERANCE_CENTS = 50;
export const OCTAVE_TOLERANCE_CENTS = 150;
export const LEVEL_TOLERANCE_DB = 6;
export const SETTLE_MS = 800;
export const STABLE_WINDOW_MS = 1200;
export const STABLE_MIN_FRAMES = 6;

// 基準音とハミングの長さ
export const HUM_TONE_SEC = 2;
export const HUM_HOLD_SEC = 5;
export const TONE_GAP_MS = 250;

// おまかせ探索
export const COARSE_STEP_SEMITONES = 2;
export const FINE_STEP_SEMITONES = 1;
export const SWEEP_LOW_LIMIT_HZ = 70;
export const SWEEP_HIGH_LIMIT_HZ = 600;
export const SWEEP_MAX_NOTES = 12;
export const COMFORT_TO_TOP_RATIO = 2;
export const FOREHEAD_TOP_RATIO = 2.5;

// 今日のハミング
export const HUM_REST_SEC = 180;
export const DEFAULT_HUMS_PER_SET = 5;
export const DEFAULT_SETS_PER_TONE = 1;
export const BREATH_SEC = 2.5;
export const BREATH_TONE_SEC = 1.5;
export const CONTINUOUS_HUMS_PER_MIN = 18;
export const CONTINUOUS_BREATH_SEC = 1;
export const CONTINUOUS_DEFAULT_MIN = 5;
export const CONTINUOUS_DEFAULT_HZ = 130.81;

// 翌朝の1問
export const MORNING_END_HOUR = 14;

// ハミングのメニュー(docs/01-hum-mechanics.md §9)。高さは楽な高さからの半音で表す。
export const HILL_LOW_SEMITONES = -3;
export const HILL_HIGH_SEMITONES = 4;
export const GLIDE_LOW_SEMITONES = -3;
export const GLIDE_HIGH_SEMITONES = 4;
export const STEP_MIN_SEMITONES = -5;
export const STEP_MAX_SEMITONES = 7;
export const COMPARE_HUMS = 3;
export const COMPARE_REST_SEC = 20;
export const PROGRAM_MAX_BLOCKS = 12;
export const PROGRAM_MAX_CUSTOM = 10;
export const BLOCK_MAX_HUMS = 20;
export const BLOCK_MAX_SETS = 5;
export const BLOCK_REST_CHOICES = [0, 30, 60, 120, 180];

// 流れる帯(D-038)。帯の太さは片側の幅で、高さが一定の回は PITCH_TOLERANCE_CENTS を使う。
export const GLIDE_TOLERANCE_CENTS = 70;
// 滑らせる回の始めと終わりに、高さを止めておく長さ(1回の長さに対する割合。5秒なら0.8秒ずつ)
export const GLIDE_HOLD_RATIO = 0.16;
export const LANE_HISTORY_SEC = 1.4;
export const LANE_PREVIEW_SEC = 3.6;
// 1セットの回数がこれより多い(連続型など)ときは、結果の丸を並べない
export const LANE_STAMP_MAX = 12;
// 判定は帯の中にいた時間の割合。出だしは声が定まらないので数えない
export const JUDGE_ONSET_MS = 400;
export const GRADE_GREAT_RATIO = 0.8;
export const GRADE_GOOD_RATIO = 0.5;
export const GRADE_BAD_RATIO = 0.2;

// 実施に数えるセッション。途中でやめた短いものは数えない
export const SESSION_COUNTED_SEC = 60;

// 比較実験。全部で24日。8ブロックなら、完全に分かれたときに5%水準に届く
export const EXPERIMENT_BLOCK_DAYS = 3;
export const EXPERIMENT_BLOCKS = 8;
export const EXPERIMENT_ALPHA = 0.05;
export const EXPERIMENT_MIN_BLOCKS_PER_CONDITION = 3;

// 記録の画面
export const RECORD_DAYS = 14;
