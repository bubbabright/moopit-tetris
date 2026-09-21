// All audio is synthesised live with the Web Audio API — no audio files to
// load, so it works offline and costs nothing to host.
//
// Structure:
//   master ─┬─ musicGain ── (kick, hats, clap, bass, pad, arp, echo)
//           └─ sfxGain   ── (move, rotate, drop, clear, tetris, level, over…)
// Music and SFX are muted/scaled independently.

export interface AudioSettings {
  music: boolean;
  sfx: boolean;
  musicVol: number; // 0..1
  sfxVol: number; // 0..1
}

export type SfxName =
  | 'move' | 'rotate' | 'hold' | 'harddrop' | 'lock'
  | 'clear1' | 'clear2' | 'clear3' | 'tetris'
  | 'levelup' | 'gameover' | 'click';

// ✎ Music tuning: tempo and the four-chord loop (Am – F – C – G).
const BPM = 112;
const MUSIC_BASE = 0.55; // overall music loudness before the user's slider
const SFX_BASE = 0.8;

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

const CHORDS = [
  { bass: 33, tones: [57, 60, 64, 67] }, // Am7
  { bass: 29, tones: [57, 60, 65, 69] }, // Fmaj7
  { bass: 36, tones: [55, 60, 64, 71] }, // Cmaj7
  { bass: 31, tones: [55, 59, 62, 69] }, // G6
];

export class AudioEngine {
  settings: AudioSettings = { music: true, sfx: true, musicVol: 0.7, sfxVol: 0.8 };

  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private echo!: DelayNode;
  private noise!: AudioBuffer;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private ducked = false;

  /** Must be called from a user gesture (the Start button). */
  start() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = 0.9;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(c.destination);
      this.musicGain = c.createGain();
      this.sfxGain = c.createGain();
      this.musicGain.connect(this.master);
      this.sfxGain.connect(this.master);
      // dotted-eighth echo for the arp
      this.echo = c.createDelay(1);
      this.echo.delayTime.value = (60 / BPM) * 0.75;
      const fb = c.createGain();
      fb.gain.value = 0.38;
      const wet = c.createGain();
      wet.gain.value = 0.45;
      this.echo.connect(fb).connect(this.echo);
      this.echo.connect(wet).connect(this.musicGain);
      // 1s of white noise, reused for hats/claps/thuds
      this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
    }
    void this.ctx.resume();
    if (this.timer === null) {
      this.nextTime = this.ctx.currentTime + 0.1;
      this.step = 0;
      this.timer = window.setInterval(() => this.schedule(), 30);
    }
  }

  setSettings(s: Partial<AudioSettings>) {
    this.settings = { ...this.settings, ...s };
    this.applyVolumes();
  }

  /** Softer, quieter music while the game is paused. */
  setPaused(p: boolean) {
    this.ducked = p;
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const m = this.settings.music ? this.settings.musicVol * MUSIC_BASE * (this.ducked ? 0.35 : 1) : 0;
    const s = this.settings.sfx ? this.settings.sfxVol * SFX_BASE : 0;
    this.musicGain.gain.setTargetAtTime(m, t, 0.08);
    this.sfxGain.gain.setTargetAtTime(s, t, 0.02);
  }

  // ---------- music ----------

  private schedule() {
    const c = this.ctx;
    if (!c) return;
    const stepLen = 60 / BPM / 4;
    while (this.nextTime < c.currentTime + 0.15) {
      this.playStep(this.step, this.nextTime, stepLen);
      this.nextTime += stepLen;
      this.step = (this.step + 1) % 128;
    }
  }

  private playStep(step: number, t: number, len: number) {
    const chord = CHORDS[Math.floor(step / 32) % 4];
    const s16 = step % 16;

    if (s16 % 4 === 0) this.kick(t);
    if (s16 % 4 === 2) this.hat(t, 0.07, 0.05);
    else if (s16 % 2 === 1) this.hat(t, 0.022, 0.025);
    if (s16 === 4 || s16 === 12) this.clap(t);

    // off-beat rolling bass
    if (s16 % 4 === 2 || s16 === 7 || s16 === 15) {
      this.bass(t, mtof(chord.bass), len * 1.6);
    }

    // sustained pad, once per chord (8 beats)
    if (step % 32 === 0) this.pad(t, chord.tones, len * 32);

    // sparse arpeggio
    const arpSteps = [0, 3, 6, 8, 11, 14];
    const idx = arpSteps.indexOf(s16);
    if (idx >= 0) {
      const note = chord.tones[(idx + Math.floor(step / 16)) % chord.tones.length] + 12;
      this.pluck(t, mtof(note));
    }
  }

  private kick(t: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(0.85, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g);
    g.connect(this.musicGain);
    o.start(t);
    o.stop(t + 0.25);
  }

  private noiseBurst(dest: AudioNode, t: number, dur: number, gain: number, type: BiquadFilterType, freq: number, q = 0.7) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private hat(t: number, gain: number, dur: number) {
    this.noiseBurst(this.musicGain, t, dur, gain, 'highpass', 7500);
  }

  private clap(t: number) {
    this.noiseBurst(this.musicGain, t, 0.12, 0.1, 'bandpass', 1400, 0.9);
  }

  private bass(t: number, freq: number, dur: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(700, t);
    f.frequency.exponentialRampToValueAtTime(140, t + dur);
    f.Q.value = 5;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.26, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f).connect(g).connect(this.musicGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private pad(t: number, tones: number[], dur: number) {
    const c = this.ctx!;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(500, t);
    f.frequency.linearRampToValueAtTime(1500, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(600, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.11, t + dur * 0.25);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(g);
    g.connect(this.musicGain);
    for (const m of tones) {
      for (const detune of [-7, 7]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = detune;
        const og = c.createGain();
        og.gain.value = 0.22;
        o.connect(og).connect(f);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  private pluck(t: number, freq: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.11, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(g);
    g.connect(this.musicGain);
    g.connect(this.echo);
    o.start(t);
    o.stop(t + 0.3);
  }

  // ---------- sound effects ----------

  private tone(freq: number, type: OscillatorType, t: number, dur: number, gain: number, endFreq?: number, lp?: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    let node: AudioNode = o;
    if (lp) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      o.connect(f);
      node = f;
    }
    node.connect(g).connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  sfx(name: SfxName) {
    const c = this.ctx;
    if (!c || !this.settings.sfx) return;
    const t = c.currentTime;
    // Am pentatonic — always pleasant together
    const P = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79].map(mtof);
    switch (name) {
      case 'move':
        this.tone(520, 'triangle', t, 0.04, 0.09, 480, 2500);
        break;
      case 'rotate':
        this.tone(440, 'triangle', t, 0.05, 0.1, undefined, 3000);
        this.tone(660, 'triangle', t + 0.04, 0.06, 0.1, undefined, 3000);
        break;
      case 'hold':
        this.tone(280, 'sawtooth', t, 0.14, 0.09, 700, 1800);
        break;
      case 'lock':
        this.tone(190, 'sine', t, 0.09, 0.3, 90);
        break;
      case 'harddrop':
        this.tone(150, 'sine', t, 0.16, 0.5, 45);
        this.noiseBurst(this.sfxGain, t, 0.09, 0.22, 'lowpass', 900);
        break;
      case 'clear1':
      case 'clear2':
      case 'clear3': {
        const n = name === 'clear1' ? 3 : name === 'clear2' ? 4 : 5;
        for (let i = 0; i < n; i++) {
          this.tone(P[i + 2], 'triangle', t + i * 0.06, 0.22, 0.16, undefined, 4000);
          this.tone(P[i + 2] * 2, 'sine', t + i * 0.06, 0.16, 0.06);
        }
        this.tone(110, 'sine', t, 0.25, 0.3, 70);
        break;
      }
      case 'tetris': {
        [57, 64, 69, 72, 76].forEach((m, i) => {
          this.tone(mtof(m), 'sawtooth', t + i * 0.05, 0.9, 0.09, undefined, 500 + i * 700);
        });
        for (let i = 0; i < 7; i++) this.tone(P[i + 2], 'triangle', t + 0.1 + i * 0.055, 0.25, 0.15, undefined, 5000);
        this.tone(100, 'sine', t, 0.4, 0.45, 50);
        break;
      }
      case 'levelup':
        [69, 72, 76, 81].forEach((m, i) => this.tone(mtof(m), 'square', t + i * 0.08, 0.2, 0.07, undefined, 3200));
        break;
      case 'gameover':
        this.tone(330, 'sawtooth', t, 1.3, 0.14, 82, 1400);
        this.tone(247, 'sawtooth', t + 0.05, 1.3, 0.1, 62, 900);
        break;
      case 'click':
        this.tone(760, 'triangle', t, 0.05, 0.08, undefined, 3000);
        break;
    }
  }
}

export const audio = new AudioEngine();

const KEY = 'moopit-tetris:settings';

export interface Prefs extends AudioSettings {
  theme: 'dark' | 'indigo' | 'light';
  contrast: boolean;
  hold: boolean; // hold-piece feature on/off
  nextCount: number; // 0-5 upcoming pieces shown (phones show at most 3)
  best: number;
}

export const DEFAULT_PREFS: Prefs = {
  music: true,
  sfx: true,
  musicVol: 0.7,
  sfxVol: 0.8,
  theme: 'dark',
  contrast: false,
  hold: true,
  nextCount: 5,
  best: 0,
};

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    /* private mode etc. — fall through to defaults */
  }
  return { ...DEFAULT_PREFS };
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
