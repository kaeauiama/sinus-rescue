import { latestOn, type LogEvent } from '../../../platform/events';
import { MIN_SCORES_FOR_OVERALL } from '../rules';

export const KIND_SYMPTOM = 'symptom';
export const KIND_TAG = 'tag';
export const SETTING_TAGS = 'daily.tags';

export type SymptomId = 'congestion' | 'drip' | 'smellLoss' | 'heaviness' | 'odor' | 'stress';
export type Side = 'left' | 'right' | 'both';

export interface SymptomDef {
  id: SymptomId;
  label: string;
  question: string;
  sided: boolean;
  inOverall: boolean;
}

// 嗅覚は「低下」に揃え、すべて数字が大きいほど悪い向きにする。
export const SYMPTOMS: SymptomDef[] = [
  { id: 'congestion', label: '鼻づまり', question: '今日の鼻づまりは', sided: true, inOverall: true },
  { id: 'drip', label: '後鼻漏の不快感', question: 'のどに流れる不快感は', sided: false, inOverall: true },
  { id: 'smellLoss', label: '嗅覚の低下', question: 'においの分かりにくさは', sided: false, inOverall: true },
  { id: 'heaviness', label: '顔・頭の重さ', question: '顔や頭の重さは', sided: true, inOverall: true },
  { id: 'odor', label: '嫌なにおい', question: '鼻の嫌なにおいは', sided: true, inOverall: true },
  { id: 'stress', label: 'ストレス', question: '今日のストレスは', sided: false, inOverall: false },
];

export const SIDE_LABELS: Record<Side, string> = { left: '左', right: '右', both: '両方' };

export const DEFAULT_TAGS = ['風邪気味', '飲酒', '歯科治療', 'ほこり', '乾燥', '飛行機'];

export interface SymptomRecord {
  scores: Partial<Record<SymptomId, number>>;
  sides: Partial<Record<SymptomId, Side>>;
}

export interface TagRecord {
  tags: string[];
}

export const symptomOn = (events: LogEvent[], day: string) => latestOn<SymptomRecord>(events, KIND_SYMPTOM, day);

export const tagsOn = (events: LogEvent[], day: string) => latestOn<TagRecord>(events, KIND_TAG, day)?.tags ?? [];

// 未入力は0と見なさず、答えた項目だけで平均する。少なすぎる日はスコアを出さない。
export function overallScore(record: SymptomRecord | null): number | null {
  if (!record) return null;
  const values = SYMPTOMS.filter((s) => s.inOverall)
    .map((s) => record.scores[s.id])
    .filter((value): value is number => value != null);
  if (values.length < MIN_SCORES_FOR_OVERALL) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}
