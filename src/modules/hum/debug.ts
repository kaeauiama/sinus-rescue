// ブラウザ上の動作確認用。?sim=1 でマイクを合成音に、?fast=1 で待ち時間を短くする。
const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);

export const SIMULATE = params.has('sim');

const SCALE = params.has('fast') ? 0.15 : 1;

export const scaled = (ms: number) => Math.round(ms * SCALE);
