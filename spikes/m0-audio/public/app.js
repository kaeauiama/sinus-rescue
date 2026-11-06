import { AudioEngine } from './audio.js';
import { centsBetween, detectPitch, noteName, shuffled, summarizeTrack, targetsFromRange } from './dsp.js';

const params = new URLSearchParams(location.search);
const SIM = params.has('sim');
const FAST = params.has('fast');
const TONE_MS = FAST ? 300 : 2000;
const CHECK_TONE_MS = FAST ? 300 : 2500;
const HUM_MS = FAST ? 1200 : 5000;
const RANGE_MS = FAST ? 1200 : 6000;
const LOOPBACK_MS = FAST ? 300 : 1500;
const SETTLE_MS = FAST ? 200 : 800;
const FRAME_INTERVAL_MS = 50;
const TOLERANCE_CENTS = 50;
const SIM_REGISTERS = { mid: 165, low: 98, high: 294 };

const engine = new AudioEngine({ simulate: SIM });
const root = document.getElementById('app');
const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

const report = {
  check: 'm0-audio-1',
  mode: standalone ? 'home-screen' : 'browser',
  simulated: SIM,
  errors: [],
  tones: [],
  micRoute: [],
  mute: [],
  hum: {},
  flow: { trials: [] },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (v, digits = 0) => (v == null ? null : Number(v.toFixed(digits)));
const escapeHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function noteError(code, error) {
  report.errors.push({ code, name: error?.name, message: error?.message });
}

// iOS では通話や画面ロックで音声が中断されることがあるので、状態の変化を記録する。
function watchAudioEvents() {
  report.audioEvents = [];
  const started = performance.now();
  const note = (event) => report.audioEvents.push({ s: round((performance.now() - started) / 1000, 1), event });
  engine.ctx.addEventListener('statechange', () => note(`context:${engine.state}`));
  engine.onTrackEvent = (type) => note(`mic:${type}`);
}

let progress = 0;

function frame(stageHtml, actionsHtml = '') {
  root.innerHTML = `
    <div class="progress" aria-hidden="true"><span style="width:${Math.round(progress * 100)}%"></span></div>
    <main class="stage">${stageHtml}</main>
    <div class="actions">${actionsHtml}</div>`;
}

// 1画面1タスク。選択肢を押すまで待ち、選ばれた値を返す。
function ask({ title, note = '', options, layout = '' }) {
  const buttons = options
    .map(
      (o, i) =>
        `<button type="button" data-i="${i}" class="${o.primary ? 'primary' : ''} ${o.quiet ? 'quiet' : ''}">${escapeHtml(o.label)}</button>`,
    )
    .join('');
  frame(
    `<h1>${title}</h1>${note ? `<p class="note">${note}</p>` : ''}`,
    `<div class="choices ${layout}">${buttons}</div>`,
  );
  return new Promise((resolve) => {
    root.querySelector('.choices').addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      const option = options[Number(button.dataset.i)];
      resolve(option.value ?? option.label);
    });
  });
}

function showPhase(title, note = '') {
  frame(`<h1 class="phase">${title}</h1>${note ? `<p class="note">${note}</p>` : ''}`);
}

function capture(ms, onFrame) {
  return new Promise((resolve) => {
    const points = [];
    const started = performance.now();
    const timer = setInterval(() => {
      const t = performance.now() - started;
      const pitch = detectPitch(engine.readFrame(), engine.sampleRate);
      const point = { t, f0: pitch.f0, rms: pitch.rms };
      points.push(point);
      onFrame?.(point, t / ms);
      if (t >= ms) {
        clearInterval(timer);
        resolve(points);
      }
    }, FRAME_INTERVAL_MS);
  });
}

function compactSummary(summary) {
  return {
    voicedRatio: round(summary.voicedRatio, 2),
    medianHz: round(summary.medianHz, 1),
    note: summary.medianHz ? noteName(summary.medianHz) : null,
    spreadCents: round(summary.spreadCents),
    octaveJumps: summary.octaveJumps,
    levelDb: round(summary.levelDb),
    frames: summary.frames,
  };
}

async function collectEnvironment() {
  const swRegistered = await registerServiceWorker();
  report.env = {
    ua: navigator.userAgent,
    sampleRate: engine.sampleRate,
    baseLatencyMs: round((engine.ctx?.baseLatency ?? 0) * 1000, 1),
    outputLatencyMs: round((engine.ctx?.outputLatency ?? 0) * 1000, 1),
    audioSessionApi: engine.hasAudioSession,
    audioWorklet: Boolean(engine.ctx?.audioWorklet),
    wakeLockApi: 'wakeLock' in navigator,
    serviceWorker: swRegistered,
    swControlled: Boolean(navigator.serviceWorker?.controller),
  };
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  try {
    await navigator.serviceWorker.register('./sw.js');
    return 'registered';
  } catch (error) {
    noteError('SW_FAILED', error);
    return 'failed';
  }
}

async function runTones() {
  const trials = shuffled(
    [110, 147, 196, 262].flatMap((hz) => ['sine', 'rich'].map((kind) => ({ hz, kind }))),
  );
  for (const [i, trial] of trials.entries()) {
    progress = 0.05 + (0.2 * i) / trials.length;
    let answer;
    do {
      const stop = engine.playTone(trial.hz, { kind: trial.kind, ms: CHECK_TONE_MS });
      answer = await ask({
        title: '音は聞こえますか',
        note: `${i + 1} / ${trials.length}`,
        options: [
          { label: 'はっきり聞こえる', value: 'clear' },
          { label: 'かすかに聞こえる', value: 'faint' },
          { label: '聞こえない', value: 'none' },
          { label: 'もう一度鳴らす', value: 'replay', quiet: true },
        ],
      });
      stop();
    } while (answer === 'replay');
    report.tones.push({ ...trial, answer });
  }
}

async function measureLoopback() {
  const points = await capture(LOOPBACK_MS);
  return compactSummary(summarizeTrack(points));
}

async function runMicRoute() {
  const variants = engine.hasAudioSession ? ['play-and-record', 'auto'] : ['auto'];
  for (const [i, session] of variants.entries()) {
    progress = 0.28 + (0.14 * i) / variants.length;
    const entry = { session, actualSession: engine.setSession(session) };
    report.micRoute.push(entry);
    await engine.unlock();
    const stop = engine.startTone(196);
    await ask({
      title: 'この音量を覚えてください',
      note: 'このあとマイクをつなぎます。許可を求められたら「許可」を押してください。',
      options: [{ label: '覚えた', primary: true }],
    });
    try {
      showPhase('マイクをつないでいます');
      const mic = await engine.startMic();
      entry.micStartMs = mic.ms;
      entry.settings = mic.settings;
      entry.contextState = engine.state;
      entry.sessionWithMic = engine.hasAudioSession ? navigator.audioSession.type : null;
      entry.loopback = await measureLoopback();
    } catch (error) {
      stop();
      entry.micError = error.name;
      noteError(error.name === 'NotAllowedError' ? 'MIC_DENIED' : 'MIC_UNAVAILABLE', error);
      return false;
    }
    entry.volumeWithMic = await ask({
      title: '音はどう変わりましたか',
      options: [
        { label: '変わらない', value: 'same' },
        { label: '小さくなった', value: 'quieter' },
        { label: 'ほとんど聞こえない', value: 'almost-none' },
        { label: '上の受話口から聞こえる', value: 'earpiece' },
      ],
    });
    engine.stopMic();
    await sleep(200);
    entry.volumeAfterMic = await ask({
      title: 'マイクを切りました。音量は戻りましたか',
      options: [
        { label: '元に戻った', value: 'restored' },
        { label: '小さいまま', value: 'still-quiet' },
        { label: '聞こえない', value: 'none' },
      ],
    });
    stop();
  }
  report.micPrompts = await ask({
    title: 'マイクの許可を何回求められましたか',
    options: [
      { label: '0回', value: 0 },
      { label: '1回', value: 1 },
      { label: '2回以上', value: 2 },
    ],
  });
  return true;
}

async function runMute() {
  progress = 0.45;
  await ask({
    title: '本体左側の消音スイッチをオンにしてください',
    note: 'スイッチがオンでも基準音が鳴るかを調べます。',
    options: [{ label: 'オンにした', primary: true }],
  });
  const variants = engine.hasAudioSession
    ? [
        { session: 'playback', mic: false },
        { session: 'auto', mic: false },
        { session: 'play-and-record', mic: true },
      ]
    : [{ session: null, mic: false }];
  for (const [i, variant] of variants.entries()) {
    if (variant.session) engine.setSession(variant.session);
    await engine.unlock();
    if (variant.mic) await engine.startMic();
    let answer;
    do {
      const stop = engine.playTone(196, { ms: CHECK_TONE_MS });
      answer = await ask({
        title: '音は聞こえますか',
        note: `消音オン  ${i + 1} / ${variants.length}`,
        options: [
          { label: '聞こえる', value: 'heard' },
          { label: '聞こえない', value: 'silent' },
          { label: 'もう一度鳴らす', value: 'replay', quiet: true },
        ],
      });
      stop();
    } while (answer === 'replay');
    report.mute.push({ ...variant, answer });
    if (variant.mic) engine.stopMic();
  }
  await ask({
    title: '消音スイッチをオフに戻してください',
    options: [{ label: '戻した', primary: true }],
  });
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) {
    report.wakeLock = 'unsupported';
    return;
  }
  try {
    await navigator.wakeLock.request('screen');
    report.wakeLock = 'granted';
  } catch (error) {
    report.wakeLock = error.name;
  }
}

function showHzLive(title) {
  frame(`
    <h1 class="phase small">${title}</h1>
    <div class="hz"><span id="hz">--</span><small>Hz</small></div>
    <p class="note center" id="note-name">&nbsp;</p>
    <div class="timebar"><span id="time"></span></div>`);
  const hz = root.querySelector('#hz');
  const name = root.querySelector('#note-name');
  const time = root.querySelector('#time');
  return (point, fraction) => {
    if (point.f0) {
      hz.textContent = point.f0.toFixed(0);
      name.textContent = noteName(point.f0);
    }
    time.style.width = `${Math.min(100, fraction * 100)}%`;
  };
}

async function runHum() {
  progress = 0.55;
  if (engine.hasAudioSession) engine.setSession('play-and-record');
  await engine.unlock();
  await engine.startMic();
  await requestWakeLock();
  const registers = [
    { key: 'mid', title: '楽な高さで「んー」', note: '口を閉じて、スマホは口元から30cmほど離して持ちます。' },
    { key: 'low', title: '楽に出せる一番低い音で「んー」', note: '無理のない範囲で構いません。' },
    { key: 'high', title: '楽に出せる一番高い音で「んー」', note: '無理のない範囲で構いません。' },
  ];
  for (const [i, register] of registers.entries()) {
    progress = 0.55 + (0.12 * i) / registers.length;
    let attempts = 0;
    let summary;
    for (;;) {
      attempts++;
      await ask({
        title: register.title,
        note: register.note,
        options: [{ label: '開始', primary: true }],
      });
      engine.simulateHum(SIM_REGISTERS[register.key]);
      const points = await capture(RANGE_MS, showHzLive(register.title));
      engine.simulateHum(null);
      summary = summarizeTrack(points, { settleMs: SETTLE_MS });
      if (summary.voicedRatio >= 0.3 || attempts >= 3) break;
      const retry = await ask({
        title: 'うまく拾えませんでした',
        note: 'もう少し大きめの声で試せますか。',
        options: [
          { label: 'もう一度', value: true, primary: true },
          { label: '次へ進む', value: false, quiet: true },
        ],
      });
      if (!retry) break;
    }
    report.hum[register.key] = { ...compactSummary(summary), attempts };
  }
}

function showOffsetLive(targetHz) {
  frame(`
    <h1 class="phase small">同じ高さで「んー」</h1>
    <div class="tuner" aria-hidden="true">
      <span class="tuner-line"></span><span class="tuner-center"></span><span class="tuner-dot" id="dot"></span>
    </div>
    <p class="note center" id="hint">&nbsp;</p>
    <div class="timebar"><span id="time"></span></div>`);
  const dot = root.querySelector('#dot');
  const hint = root.querySelector('#hint');
  const time = root.querySelector('#time');
  return (point, fraction) => {
    time.style.width = `${Math.min(100, fraction * 100)}%`;
    if (!point.f0) {
      dot.classList.remove('visible');
      return;
    }
    const cents = centsBetween(point.f0, targetHz);
    const clamped = Math.max(-200, Math.min(200, cents));
    dot.classList.add('visible');
    dot.classList.toggle('in-tune', Math.abs(cents) <= TOLERANCE_CENTS);
    dot.style.left = `${50 + clamped / 4}%`;
    if (Math.abs(cents) <= TOLERANCE_CENTS) hint.textContent = 'そのまま';
    else hint.textContent = cents < 0 ? 'もう少し高く' : 'もう少し低く';
  };
}

async function runFlow() {
  const low = report.hum.low?.medianHz ?? 110;
  const high = report.hum.high?.medianHz ?? 262;
  const targets = shuffled(targetsFromRange(Math.max(70, low), Math.min(500, high), 5));
  report.flow.rangeHz = [round(low, 1), round(high, 1)];
  progress = 0.7;
  await ask({
    title: '本番と同じ流れを試します',
    note: `音を聞いて、同じ高さでハミングし、鼻の奥の震えを選びます。全部で${targets.length}音です。`,
    options: [{ label: '始める', primary: true }],
  });
  const flowStarted = performance.now();
  for (const [i, targetHz] of targets.entries()) {
    progress = 0.7 + (0.25 * i) / targets.length;
    const trialStarted = performance.now();
    showPhase('聞いてください');
    engine.playTone(targetHz, { ms: TONE_MS });
    await sleep(TONE_MS + 250);
    engine.simulateHum(targetHz * 2 ** ((Math.random() * 40 - 20) / 1200));
    const points = await capture(HUM_MS, showOffsetLive(targetHz));
    engine.simulateHum(null);
    const summary = summarizeTrack(points, { settleMs: SETTLE_MS, targetHz, toleranceCents: TOLERANCE_CENTS });
    const rating = await ask({
      title: '鼻の奥の震えは',
      note: '0 なし　3 強い',
      layout: 'row',
      options: [0, 1, 2, 3].map((n) => ({ label: String(n), value: n })),
    });
    let where = null;
    if (rating > 0) {
      where = await ask({
        title: 'どこが一番響きましたか',
        options: [
          { label: '鼻の奥', value: 'deep-nose' },
          { label: '鼻の付け根', value: 'nose-bridge' },
          { label: '頬', value: 'cheek' },
          { label: '額', value: 'forehead' },
        ],
      });
    }
    report.flow.trials.push({
      targetHz: round(targetHz, 1),
      medianHz: round(summary.medianHz, 1),
      centsOff: round(summary.centsOff),
      inTuneRatio: round(summary.inTuneRatio, 2),
      voicedRatio: round(summary.voicedRatio, 2),
      levelDb: round(summary.levelDb),
      rating,
      where,
      seconds: round((performance.now() - trialStarted) / 1000, 1),
    });
  }
  report.flow.totalSeconds = round((performance.now() - flowStarted) / 1000);
  engine.stopMic();
  progress = 0.96;
  report.flow.toneClarity = await ask({
    title: '基準音は聞き取りやすかったですか',
    options: [
      { label: '聞き取りやすい', value: 'clear' },
      { label: '小さいが音程はわかる', value: 'quiet' },
      { label: '音程がわかりにくい', value: 'unclear' },
    ],
  });
  report.flow.matchEase = await ask({
    title: '音程は合わせやすかったですか',
    options: [
      { label: '合わせやすい', value: 'easy' },
      { label: 'ふつう', value: 'ok' },
      { label: '難しい', value: 'hard' },
    ],
  });
  report.flow.locationEffort = await ask({
    title: '部位を選ぶのは手間でしたか',
    options: [
      { label: '手間ではない', value: 'fine' },
      { label: '少し手間', value: 'some' },
      { label: '手間', value: 'bad' },
    ],
  });
}

function toneLine(kind) {
  const rows = report.tones.filter((t) => t.kind === kind);
  const clear = rows.filter((t) => t.answer === 'clear').length;
  return `${clear} / ${rows.length}`;
}

function showResult() {
  progress = 1;
  report.env.finishedState = engine.state;
  const text = JSON.stringify(report);
  try {
    localStorage.setItem(`m0-report-${report.mode}`, text);
  } catch (error) {
    noteError('STORAGE_FAILED', error);
  }
  const trials = report.flow.trials;
  const offs = trials.filter((t) => t.centsOff != null).map((t) => Math.abs(t.centsOff));
  const meanOff = offs.length ? Math.round(offs.reduce((a, b) => a + b, 0) / offs.length) : null;
  const rows = [
    ['純音がはっきり聞こえた', toneLine('sine')],
    ['倍音ありがはっきり聞こえた', toneLine('rich')],
    ['低い音 / 高い音', report.hum.low ? `${report.hum.low.medianHz ?? '-'} / ${report.hum.high?.medianHz ?? '-'} Hz` : '-'],
    ['基準音とのズレ(平均)', meanOff == null ? '-' : `${meanOff} セント`],
    ['1音あたり', trials.length ? `${Math.round(report.flow.totalSeconds / trials.length)} 秒` : '-'],
  ];
  const next = standalone
    ? '<p class="note">これで検証は完了です。結果をコピーして、チャットに貼り付けてください。</p>'
    : '<p class="note">結果をコピーしてチャットに貼り付けたら、共有ボタンから「ホーム画面に追加」を選び、追加したアイコンから同じ検証をもう一度行ってください。</p>';
  frame(
    `<h1>検証が終わりました</h1>
     <p class="note">${standalone ? 'ホーム画面から実行' : 'ブラウザで実行'}</p>
     <dl class="result">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join('')}</dl>
     ${report.errors.length ? `<p class="note">エラー: ${escapeHtml(report.errors.map((e) => e.code).join(', '))}</p>` : ''}
     ${next}
     <textarea id="raw" class="raw" readonly aria-label="結果の全文">${escapeHtml(text)}</textarea>`,
    `<div class="choices"><button type="button" class="primary" id="copy">結果をコピー</button></div>`,
  );
  root.querySelector('#copy').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'コピーしました';
    } catch {
      const raw = root.querySelector('#raw');
      raw.classList.add('visible');
      raw.select();
      button.textContent = '上の文字を選択してコピーしてください';
    }
  });
}

function showFailure(error) {
  noteError('UNEXPECTED', error);
  report.env = report.env ?? { ua: navigator.userAgent };
  showResult();
}

async function main() {
  await ask({
    title: '音声チェック',
    note: `基準音とマイクがこの端末で使えるかを確かめます。約5分です。<br><br>
      静かな場所で、イヤホンを外し、消音スイッチをオフ、音量を中くらいにしてください。<br><br>
      音声は端末の中だけで処理し、録音も送信もしません。`,
    options: [{ label: '始める', primary: true }],
  });
  progress = 0.03;
  if (engine.hasAudioSession) engine.setSession('playback');
  report.unlockState = await engine.unlock();
  watchAudioEvents();
  await collectEnvironment();
  await runTones();
  const micOk = await runMicRoute();
  if (micOk) {
    await runMute();
    await runHum();
    await runFlow();
  }
  showResult();
}

main().catch(showFailure);
