import { richHarmonics } from '../domain/dsp';

const FADE_SEC = 0.03;
const RESUME_TIMEOUT_MS = 1500;
const TONE_LEVEL = 0.8;
const FFT_SIZE = 4096;

export type MicFailure = 'MIC_DENIED' | 'MIC_UNAVAILABLE';
export type PrepareResult = { ok: true } | { ok: false; code: MicFailure };

interface SimulatedMic {
  osc: OscillatorNode;
  out: GainNode;
  noise: AudioBufferSourceNode;
}

interface AudioSessionLike {
  type: string;
}

const audioSession = () => (navigator as unknown as { audioSession?: AudioSessionLike }).audioSession;

// 基準音の再生とマイク入力をまとめる。音声は波形を読むだけで、保存も送信もしない(HC-6)。
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private wave: PeriodicWave | null = null;
  private frame = new Float32Array(FFT_SIZE);
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private sim: SimulatedMic | null = null;
  private readonly simulate: boolean;

  constructor({ simulate = false }: { simulate?: boolean } = {}) {
    this.simulate = simulate;
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 48000;
  }

  // 読み取る波形の中心は、読んだ時刻より窓の半分だけ前にある。声の跡と判定はこの分を引いて扱う。
  get frameLagMs(): number {
    return (FFT_SIZE / 2 / this.sampleRate) * 1000;
  }

  get micActive(): boolean {
    return Boolean(this.sim) || this.stream?.getAudioTracks()[0]?.readyState === 'live';
  }

  // ボタンの押下から同期的に呼ぶこと。音声の開始にはユーザー操作が必要なため。
  async prepare({ mic }: { mic: boolean }): Promise<PrepareResult> {
    this.setSession(mic ? 'play-and-record' : 'playback');
    await this.unlock();
    if (!mic) return { ok: true };
    try {
      await this.startMic();
      return { ok: true };
    } catch (error) {
      return { ok: false, code: (error as Error).name === 'NotAllowedError' ? 'MIC_DENIED' : 'MIC_UNAVAILABLE' };
    }
  }

  // 他のアプリから戻ったあとなど、音声が止まっていたら再開する。
  async ensureRunning(): Promise<void> {
    if (!this.ctx) return;
    await this.unlock();
    if ((this.stream || this.sim) && !this.micActive) {
      this.stopMic();
      await this.startMic();
    }
  }

  private setSession(type: string): void {
    const session = audioSession();
    if (session) session.type = type;
  }

  private async unlock(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = FFT_SIZE;
      this.analyser.smoothingTimeConstant = 0;
      // 接続先がないと処理が止まるブラウザに備え、無音で出力へつなぐ。
      const sink = this.ctx.createGain();
      sink.gain.value = 0;
      this.analyser.connect(sink);
      sink.connect(this.ctx.destination);
      const { real, imag } = richHarmonics();
      this.wave = this.ctx.createPeriodicWave(real as Float32Array<ArrayBuffer>, imag as Float32Array<ArrayBuffer>);
    }
    if (this.ctx.state !== 'running') {
      await Promise.race([
        this.ctx.resume(),
        new Promise((resolve) => setTimeout(resolve, RESUME_TIMEOUT_MS)),
      ]);
    }
  }

  startTone(hz: number): () => void {
    const ctx = this.ctx;
    if (!ctx || !this.wave) return () => {};
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.setPeriodicWave(this.wave);
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(hz, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(TONE_LEVEL, now + FADE_SEC);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      const end = ctx.currentTime;
      gain.gain.cancelScheduledValues(end);
      gain.gain.setValueAtTime(gain.gain.value, end);
      gain.gain.linearRampToValueAtTime(0, end + FADE_SEC);
      osc.stop(end + FADE_SEC + 0.01);
    };
  }

  playTone(hz: number, ms: number): () => void {
    const stop = this.startTone(hz);
    const timer = setTimeout(stop, ms);
    return () => {
      clearTimeout(timer);
      stop();
    };
  }

  // お手本の音(D-039)。path の高さを順にたどり、点と点の間は半音の刻みで等速に動かす。
  // ms は鳴らし始めからの時刻で、鳴らし始めは startInMs 後(負なら、その分だけ途中から)。
  playPath(path: { ms: number; hz: number }[], startInMs: number): () => void {
    const ctx = this.ctx;
    if (!ctx || !this.wave || path.length < 2) return () => {};
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.setPeriodicWave(this.wave);
    // 画面の丸と耳に届く音がそろうよう、出力の遅れの分だけ早めに鳴らす。
    const start = ctx.currentTime + startInMs / 1000 - (ctx.outputLatency || 0);
    const at = (ms: number) => start + ms / 1000;
    const end = at(path[path.length - 1].ms);
    osc.frequency.setValueAtTime(path[0].hz, at(path[0].ms));
    for (const point of path.slice(1)) osc.frequency.exponentialRampToValueAtTime(point.hz, at(point.ms));
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(TONE_LEVEL, start + FADE_SEC);
    gain.gain.setValueAtTime(TONE_LEVEL, end - FADE_SEC);
    gain.gain.linearRampToValueAtTime(0, end);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(Math.max(start, ctx.currentTime));
    osc.stop(end + 0.01);
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + FADE_SEC);
      try {
        osc.stop(now + FADE_SEC + 0.01);
      } catch {
        // すでに止まっている
      }
    };
  }

  private async startMic(): Promise<void> {
    if (this.micActive) return;
    if (this.simulate) {
      this.startSimulatedMic();
      return;
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    this.source = (this.ctx as AudioContext).createMediaStreamSource(this.stream);
    this.source.connect(this.analyser as AnalyserNode);
  }

  stopMic(): void {
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.source = null;
    this.stream = null;
    if (this.sim) {
      this.sim.osc.stop();
      this.sim.noise.stop();
      this.sim.out.disconnect();
      this.sim.noise.disconnect();
      this.sim = null;
    }
  }

  // 別のモジュールへ移るときに、マイクと音声の資源を手放す。
  dispose(): void {
    this.stopMic();
    void this.ctx?.close();
    this.ctx = null;
    this.analyser = null;
    this.wave = null;
  }

  readFrame(): Float32Array {
    this.analyser?.getFloatTimeDomainData(this.frame);
    return this.frame;
  }

  // ブラウザ上の動作確認用。URL に ?sim=1 を付けると、マイクの代わりに合成音を入力する。
  private startSimulatedMic(): void {
    const ctx = this.ctx as AudioContext;
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this.wave as PeriodicWave);
    const out = ctx.createGain();
    out.gain.value = 0;
    osc.connect(out);
    out.connect(this.analyser as AnalyserNode);
    osc.start();
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = 0.0008 * (Math.random() * 2 - 1);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    noise.connect(this.analyser as AnalyserNode);
    noise.start();
    this.sim = { osc, out, noise };
  }

  simulateHum(hz: number | null): void {
    if (!this.sim) return;
    if (hz) this.sim.osc.frequency.value = hz;
    this.sim.out.gain.value = hz ? 0.02 : 0;
  }
}
