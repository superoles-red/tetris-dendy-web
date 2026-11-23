import './vendor/jsnes.js';
import { CartridgeMix } from './cartridge-audio.js';

const FRAME_MS = 1000 / 60.0988;
// A throttled mobile display may present only 10–15 frames/sec. Preserve
// cartridge time and input between those paints, bounding long tab stalls.
const MAX_CATCHUP = 8;
const SAMPLE_RATE = 48000;
const BLOCK_SIZE = 1024;
const BUTTONS = Object.fromEntries(
  ['left', 'right', 'down', 'up', 'a', 'b', 'start', 'select']
    .map(name => [name, globalThis.jsnes.Controller['BUTTON_' + name.toUpperCase()]])
);

// JSNES state is plain data; its loader accepts ordinary arrays.
function cloneState(state) {
  return typeof globalThis.structuredClone === 'function'
    ? globalThis.structuredClone(state)
    : JSON.parse(JSON.stringify(state));
}

// Scheduling short PCM blocks also works on plain-HTTP LAN addresses where
// AudioWorklet is unavailable. The browser converts the NES sample rate to the
// output device's rate. No audio files or replacement music are involved.
class CartridgeAudio {
  constructor() {
    this.left = new Float32Array(BLOCK_SIZE);
    this.right = new Float32Array(BLOCK_SIZE);
    this.sources = new Set();
    this.excerpts = new Map();
    this.previewToken = 0;
    this.count = 0;
    this.nextTime = 0;
    this.muted = false;
  }

  wake() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    try {
      if (!this.context) {
        this.context = new Audio();
        this.gain = this.context.createGain();
        this.gain.gain.value = this.muted ? 0 : 0.8;
        this.gain.connect(this.context.destination);
        this.context.addEventListener('statechange', () => {
          if (this.context.state !== 'running') this.clear();
        });
      }
      if (this.context.state !== 'running') {
        return this.context.resume().catch(() => {});
      }
    } catch {
      // A browser may block audio before a gesture. Retry on the next input.
    }
  }

  write(left, right) {
    if (this.muted || this.context?.state !== 'running') return;
    this.left[this.count] = left;
    this.right[this.count] = right;
    if (++this.count < BLOCK_SIZE) return;
    this.count = 0;

    const now = this.context.currentTime;
    if (this.nextTime > now + 0.18) return;
    if (this.nextTime < now) this.nextTime = now + 0.04;

    const buffer = this.context.createBuffer(2, BLOCK_SIZE, SAMPLE_RATE);
    buffer.copyToChannel(this.left, 0);
    buffer.copyToChannel(this.right, 1);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
    };
    source.start(this.nextTime);
    this.nextTime += buffer.duration;
  }

  async previewMusic(track, gain) {
    this.stopPreview();
    if (!Number.isInteger(track) || track < 1 || track > 4 || !(gain > 0) || this.muted) return;
    const token = this.previewToken;
    await this.wake();
    if (token !== this.previewToken || this.context?.state !== 'running') return;

    // Four seconds of each native cartridge score, rendered through this same
    // APU at 48 kHz. Auditioning the excerpt leaves the paused NES untouched.
    let decoding = this.excerpts.get(track);
    if (!decoding) {
      decoding = (async () => {
        const response = await fetch(new URL('./assets/music/' + track + '.flac', import.meta.url));
        if (!response.ok) throw new Error('Не удалось загрузить музыкальный отрывок.');
        return this.context.decodeAudioData(await response.arrayBuffer());
      })();
      this.excerpts.set(track, decoding);
    }
    let buffer;
    try {
      buffer = await decoding;
    } catch {
      if (this.excerpts.get(track) === decoding) this.excerpts.delete(track);
      return;
    }
    if (token !== this.previewToken || this.context.state !== 'running') return;
    const source = this.context.createBufferSource();
    const volume = this.context.createGain();
    const now = this.context.currentTime;
    const level = Math.min(100, gain) / 100;
    volume.gain.setValueAtTime(0, now);
    volume.gain.linearRampToValueAtTime(level, now + 0.008);
    volume.gain.setValueAtTime(level, now + buffer.duration - 0.035);
    volume.gain.linearRampToValueAtTime(0, now + buffer.duration);
    source.buffer = buffer;
    source.connect(volume);
    volume.connect(this.gain);
    this.preview = source;
    source.onended = () => {
      if (this.preview === source) this.preview = null;
      source.disconnect();
      volume.disconnect();
    };
    source.start(now);
  }

  stopPreview() {
    this.previewToken++;
    if (this.preview) {
      this.preview.stop();
      this.preview = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.gain) this.gain.gain.value = muted ? 0 : 0.8;
    if (muted) this.clear();
  }

  clear() {
    this.stopPreview();
    for (const source of this.sources) source.stop();
    this.sources.clear();
    this.nextTime = 0;
    this.count = 0;
  }
}

export class Engine {
  constructor({ onFrame, onError } = {}) {
    this.onFrame = onFrame;
    this.onError = onError;
    this.audio = new CartridgeAudio();
    this.mix = new CartridgeMix((left, right) => this.audio.write(left, right));
    this.nes = null;
    this.started = false;
    this.paused = false;
    this.present = true;
    this.totalFrames = 0;
    this.heldSince = new Map();
    this.pendingReleases = new Set();
    this.request = null;
    this.tick = this.tick.bind(this);
  }

  async load() {
    const response = await fetch(new URL('./game.nes', import.meta.url));
    if (!response.ok) throw new Error('Не удалось загрузить картридж Tetris.');
    this.rom = new Uint8Array(await response.arrayBuffer());
    this.nes = new globalThis.jsnes.NES({
      sampleRate: SAMPLE_RATE,
      onFrame: buffer => this.onFrame?.(buffer, this.nes, this.present),
      onAudioSample: (left, right) => this.mix.sample(left, right)
    });
    this.reset();
    return this;
  }

  reset() {
    this.clearButtons();
    this.audio.clear();
    this.nes.loadROM(this.rom);
    this.nes.ppu.clipToTvSize = false;
    this.mix.attach(this.nes);
    this.totalFrames = 0;
    this.lastTime = null;
    this.accumulator = 0;
  }

  start() {
    this.audio.stopPreview();
    this.started = true;
    this.setPaused(false);
  }

  setPaused(value) {
    this.paused = Boolean(value);
    if (this.paused) {
      if (this.request !== null) cancelAnimationFrame(this.request);
      this.request = null;
      this.clearButtons();
      this.audio.clear();
    } else if (this.started && this.request === null) {
      this.lastTime = null;
      this.accumulator = 0;
      this.request = requestAnimationFrame(this.tick);
    }
  }

  setButton(name, pressed) {
    if (!Object.hasOwn(BUTTONS, name) || !this.nes) return;
    if (pressed) {
      this.pendingReleases.delete(name);
      if (this.heldSince.has(name)) return;
      this.heldSince.set(name, this.totalFrames);
      this.nes.buttonDown(1, BUTTONS[name]);
    } else if (this.heldSince.has(name)) {
      // A tap can start and end between RAFs. Give the cartridge a chance
      // to read it while keeping long holds under its own repeat logic.
      if (this.totalFrames - this.heldSince.get(name) < 2) this.pendingReleases.add(name);
      else this.release(name);
    }
  }

  release(name) {
    this.pendingReleases.delete(name);
    this.heldSince.delete(name);
    this.nes.buttonUp(1, BUTTONS[name]);
  }

  clearButtons() {
    for (const name of this.heldSince.keys()) this.release(name);
  }

  tick(time) {
    if (this.paused) return;
    const delta = this.lastTime === null ? FRAME_MS : time - this.lastTime;
    this.lastTime = time;
    this.accumulator += Math.min(Math.max(0, delta), FRAME_MS * MAX_CATCHUP);
    try {
      while (this.accumulator >= FRAME_MS && !this.paused) {
        this.accumulator -= FRAME_MS;
        this.present = this.accumulator < FRAME_MS;
        this.mix.flushTrack();
        this.nes.frame();
        this.totalFrames++;
        for (const name of this.pendingReleases) {
          if (this.totalFrames - this.heldSince.get(name) >= 2) this.release(name);
        }
      }
    } catch (error) {
      this.setPaused(true);
      if (this.onError) this.onError(error);
      else throw error;
      return;
    }
    this.present = true;
    if (!this.paused) this.request = requestAnimationFrame(this.tick);
  }

  captureStart() {
    return { console: cloneState(this.nes.toJSON()), mix: this.mix.snapshot() };
  }

  restoreStart(state) {
    this.clearButtons();
    this.audio.clear();
    this.nes.fromJSON(cloneState(state.console));
    this.nes.ppu.clipToTvSize = false;
    this.mix.attach(this.nes, state.mix);
    this.mix.requestTrack(this.paused);
    this.totalFrames = 0;
    this.lastTime = null;
    this.accumulator = 0;
  }

  setMix(options) { this.mix.set(options, this.paused); }
  previewMusic(track, gain) { return this.audio.previewMusic(track, gain); }
  stopPreview() { this.audio.stopPreview(); }
  wakeAudio() { return this.audio.wake(); }
  setMuted(value) { this.audio.setMuted(Boolean(value)); }
}
