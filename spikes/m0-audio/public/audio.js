import { harmonicSeries } from './dsp.js';

const FADE_SEC = 0.03;
const RESUME_TIMEOUT_MS = 1500;

// 基準音の再生とマイク入力をまとめる。音声は波形を読むだけで、保存も送信もしない。
export class AudioEngine {
  constructor({ simulate = false } = {}) {
    this.simulate = simulate;
    this.ctx = null;
    this.stream = null;
    this.source = null;
    this.sim = null;
  }

  get hasAudioSession() {
    return 'audioSession' in navigator;
  }

  get sampleRate() {
    return this.ctx?.sampleRate ?? 0;
  }

  get state() {
    return this.ctx?.state ?? 'none';
  }

  get micActive() {
    return Boolean(this.stream || this.sim);
  }

  async unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 4096;
      this.analyser.smoothingTimeConstant = 0;
      this.frame = new Float32Array(this.analyser.fftSize);
      // 接続先がないと処理が止まるブラウザに備え、無音で出力へつなぐ。
      const sink = this.ctx.createGain();
      sink.gain.value = 0;
      this.analyser.connect(sink);
      sink.connect(this.ctx.destination);
      this.waves = {};
      for (const kind of ['sine', 'rich']) {
        const { real, imag } = harmonicSeries(kind);
        this.waves[kind] = this.ctx.createPeriodicWave(real, imag);
      }
    }
    if (this.ctx.state !== 'running') {
      await Promise.race([
        this.ctx.resume(),
        new Promise((resolve) => setTimeout(resolve, RESUME_TIMEOUT_MS)),
      ]);
    }
    return this.ctx.state;
  }

  setSession(type) {
    if (!this.hasAudioSession) return null;
    navigator.audioSession.type = type;
    return navigator.audioSession.type;
  }

  startTone(hz, { kind = 'rich', level = 0.8 } = {}) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.setPeriodicWave(this.waves[kind]);
    osc.frequency.value = hz;
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + FADE_SEC);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      const end = this.ctx.currentTime;
      gain.gain.cancelScheduledValues(end);
      gain.gain.setValueAtTime(gain.gain.value, end);
      gain.gain.linearRampToValueAtTime(0, end + FADE_SEC);
      osc.stop(end + FADE_SEC + 0.01);
    };
  }

  playTone(hz, { kind, level, ms }) {
    const stop = this.startTone(hz, { kind, level });
    const timer = setTimeout(stop, ms);
    return () => {
      clearTimeout(timer);
      stop();
    };
  }

  async startMic() {
    if (this.micActive) return { ms: 0, settings: this.settings };
    if (this.simulate) return this.startSimulatedMic();
    const started = performance.now();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    const ms = Math.round(performance.now() - started);
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.source.connect(this.analyser);
    const track = this.stream.getAudioTracks()[0];
    for (const type of ['mute', 'unmute', 'ended']) {
      track.addEventListener(type, () => this.onTrackEvent?.(type));
    }
    const { echoCancellation, noiseSuppression, autoGainControl, sampleRate } = track.getSettings();
    this.settings = { echoCancellation, noiseSuppression, autoGainControl, sampleRate };
    return { ms, settings: this.settings };
  }

  stopMic() {
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.source = null;
    this.stream = null;
    if (this.sim) {
      this.sim.osc.stop();
      this.sim.noise.stop();
      this.sim.out.disconnect();
      this.sim = null;
    }
  }

  readFrame() {
    this.analyser.getFloatTimeDomainData(this.frame);
    return this.frame;
  }

  // ブラウザ上の動作確認用。URL に ?sim=1 を付けると、マイクの代わりに合成音を入力する。
  startSimulatedMic() {
    const osc = this.ctx.createOscillator();
    osc.setPeriodicWave(this.waves.rich);
    const out = this.ctx.createGain();
    out.gain.value = 0;
    osc.connect(out);
    out.connect(this.analyser);
    osc.start();
    const noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    noiseBuffer.getChannelData(0).forEach((_, i, data) => {
      data[i] = 0.004 * (Math.random() * 2 - 1);
    });
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    noise.connect(this.analyser);
    noise.start();
    this.sim = { osc, out, noise };
    this.settings = { simulated: true };
    return { ms: 0, settings: this.settings };
  }

  simulateHum(hz) {
    if (!this.sim) return;
    if (hz) this.sim.osc.frequency.value = hz;
    this.sim.out.gain.value = hz ? 0.2 : 0;
  }
}
