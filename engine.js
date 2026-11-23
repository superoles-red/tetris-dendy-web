import './vendor/jsnes.js';
import { remapCartridge } from './cartridge.js';
import { CartridgeMix } from './cartridge-audio.js';
import { CartridgeAudio, SAMPLE_RATE } from './audio-output.js';

const FRAME_MS = 1000 / 60.0988;
// A throttled mobile display may present only 10–15 frames/sec. Preserve
// cartridge time and input between those paints, bounding long tab stalls.
const MAX_CATCHUP = 8;
const AUDIO_CATCHUP_MS = 4 * FRAME_MS;
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

export class Engine {
  constructor({ onFrame, onError } = {}) {
    this.onFrame = onFrame;
    this.onError = onError;
    this.audio = new CartridgeAudio();
    this.mix = new CartridgeMix((left, right) => {
      if (this.emitAudio) this.audio.write(left, right);
    });
    this.nes = null;
    this.language = 'en';
    this.started = false;
    this.paused = false;
    this.present = true;
    this.totalFrames = 0;
    this.heldSince = new Map();
    this.pendingReleases = new Set();
    this.request = null;
    this.tick = this.tick.bind(this);
  }

  async load(language = this.language) {
    this.language = language;
    const entries = await Promise.all(Object.entries({ en: './game.nes', ru: './game-ru.nes' }).map(async ([key, path]) => {
      const response = await fetch(new URL(path, import.meta.url));
      if (!response.ok) throw new Error('Не удалось загрузить картридж Tetris.');
      return [key, new Uint8Array(await response.arrayBuffer())];
    }));
    this.cartridges = Object.fromEntries(entries);
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
    this.nes.loadROM(this.cartridges[this.language]);
    this.nes.cartridgeLanguage = this.language;
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
      this.playingMenu = false;
      if (this.request !== null) cancelAnimationFrame(this.request);
      this.request = null;
      this.clearButtons();
      this.audio.pause();
    } else if (this.started && this.request === null) {
      this.lastTime = null;
      this.accumulator = 0;
      this.request = requestAnimationFrame(this.tick);
    }
  }

  playMenuMusic(volume) {
    this.menuVolume = volume / 100;
    if (!this.menuVolume) {
      this.stopMenuMusic();
      return;
    }
    if (!this.cartridges) return;
    if (!this.menuConsole) {
      // The title theme is identical on both cartridges. Keep its APU
      // separate so it cannot advance the saved game or restart its music.
      this.menuConsole = new globalThis.jsnes.NES({
        sampleRate: SAMPLE_RATE,
        onAudioSample: (left, right) => {
          if (this.emitAudio) this.audio.write(left * this.menuVolume, right * this.menuVolume);
        }
      });
      this.menuConsole.loadROM(this.cartridges.en);
    }
    this.audio.wake();
    if (this.playingMenu) return;
    this.playingMenu = true;
    this.start();
  }

  stopMenuMusic() {
    if (this.playingMenu) this.setPaused(true);
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
    const stalled = delta > FRAME_MS * MAX_CATCHUP;
    if (stalled) this.audio.flush();
    this.accumulator += Math.min(Math.max(0, delta), FRAME_MS * MAX_CATCHUP);
    try {
      while (this.accumulator >= FRAME_MS && !this.paused) {
        this.accumulator -= FRAME_MS;
        this.present = this.accumulator < FRAME_MS;
        // After a long stall, keep only the tail of the catch-up audio.
        this.emitAudio = !stalled || this.accumulator < AUDIO_CATCHUP_MS;
        if (this.playingMenu) {
          this.menuConsole.frame();
          // The cartridge switches to its demo after the title theme ends.
          if (this.menuConsole.cpu.mem[0x29] === 0xfb) this.menuConsole.reloadROM();
          continue;
        }
        this.mix.flushTrack();
        this.nes.frame();
        this.mix.advancePlaylist();
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

  setLanguage(language) {
    if (language !== 'ru' && language !== 'en') throw new Error('Unknown cartridge language');
    if (this.language === language) return;
    if (this.nes) {
      remapCartridge(this.nes, this.cartridges[this.language], this.cartridges[language]);
      this.nes.cartridgeLanguage = language;
    }
    this.language = language;
  }

  renderPausedFrame(present) {
    if (!this.paused || !this.nes) return false;
    const preview = new globalThis.jsnes.NES({ emulateSound: false });
    preview.loadROM(this.cartridges[this.language]);
    preview.cartridgeLanguage = this.language;
    preview.cpu.mem.set(this.nes.cpu.mem);
    preview.ppu.fromJSON(cloneState(this.nes.ppu.toJSON()));
    preview.ppu.clipToTvSize = false;
    // The last completed picture still contains the previous cartridge's text.
    // Scan the frozen video memory again without executing a game instruction.
    preview.ppu.startFrame();
    preview.ppu.advanceDots(341 * 262 + 2);
    present(preview.ppu.buffer, preview);
    return true;
  }

  captureStart() {
    return { language: this.language, console: cloneState(this.nes.toJSON()), mix: this.mix.snapshot() };
  }

  restoreStart(state) {
    this.clearButtons();
    this.audio.clear();
    this.nes.fromJSON(cloneState(state.console));
    // A save can be taken while a thumb is down. Start the resumed run
    // with fresh inputs rather than inheriting the captured controller state.
    for (const button of Object.values(BUTTONS)) this.nes.buttonUp(1, button);
    const source = state.language ?? 'en';
    if (source !== this.language) remapCartridge(this.nes, this.cartridges[source], this.cartridges[this.language]);
    this.nes.cartridgeLanguage = this.language;
    this.nes.ppu.clipToTvSize = false;
    this.mix.attach(this.nes, state.mix);
    this.mix.requestTrack(this.paused);
    this.totalFrames = 0;
    this.lastTime = null;
    this.accumulator = 0;
  }

  captureProgress() {
    return { ...this.captureStart(), playlist: this.mix.capturePlaylist() };
  }

  restoreProgress(state) {
    this.mix.restorePlaylist(state.playlist);
    this.restoreStart(state);
    this.mix.atLoopEnd = state.playlist.atLoopEnd;
  }

  setMix(options) { this.mix.set(options, this.paused); }
  startMusic(track) { return this.mix.startMusic(track); }
  previewMusic(gain) { return this.audio.previewMusic(this.mix.track, gain); }
  stopPreview() { this.audio.pause(); }
  wakeAudio() { return this.audio.wake(); }
  setAudioPageActive(active) { this.audio.setPageActive(active); }
  setMuted(value) { this.audio.setMuted(Boolean(value)); }
}
