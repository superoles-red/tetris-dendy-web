// Tengen's sound driver multiplexes eleven virtual voices onto four APU
// channels. Its RAM lists are walked at $D87A and $D838. Only the last
// voice on a channel emits hardware parameters ($FE == 0 at $D822).
// The sequence table at $DED4 identifies scores 0..8 (including the dance
// and jingles) and one-channel sound effects 9..20.
function effectOwner(ram, channel) {
  let node = ram[0x03e7 + channel];
  for (let depth = 0; node >= 1 && node <= 11 && depth < 11; depth++) {
    const next = ram[0x03dc + node - 1];
    if (next === 0) {
      const sequence = ram[0x020e + node - 1];
      return sequence >= 9 && sequence <= 20;
    }
    node = next;
  }
  return false;
}

function percent(value, fallback) {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) / 100 : fallback;
}

export const SHUFFLE = 'shuffle';
export const TRACKS = [1, 2, 3, 4];

// Each pair is the voice pointer immediately before and after the full
// score loops. Shorter repeats inside the score do not use these edges.
// Both language editions have the same score data and voice driver.
const SCORE_LOOPS = [
  [0xe82d, 0xe5d7],
  [0xf186, 0xf050],
  [0xf67c, 0xf612],
  [0xf8d1, 0xf811]
];

export class CartridgeMix {
  constructor(output) {
    this.output = output;
    this.sound = 1;
    this.music = 1;
    this.track = 1;
    this.trackChoice = 1;
    this.remainingTracks = [];
    this.atLoopEnd = false;
  }

  attach(nes, state) {
    this.nes = nes;
    this.apu = nes.papu;
    this.effectMask = state?.effectMask ?? 0;
    this.pendingTrack = state?.pendingTrack ?? false;
    this.filter = state?.filter ? [...state.filter] : [0, 0];
    this.filterFor = state?.filterFor ?? null;
    this.noise = 0;
    this.atLoopEnd = false;

    const apu = this.apu;
    const writeRegister = apu.writeReg.bind(apu);
    apu.writeReg = (address, value) => {
      if (address >= 0x4000 && address < 0x4010) {
        const channel = (address - 0x4000) >> 2;
        const bit = 1 << channel;
        if (effectOwner(nes.cpu.mem, channel)) this.effectMask |= bit;
        else this.effectMask &= ~bit;
      }
      writeRegister(address, value);
    };

    // JSNES retains the pulse and triangle averages until onAudioSample
    // returns. Preserve the noise average before the APU resets its counters.
    const sample = apu.sample.bind(apu);
    apu.sample = () => {
      if (this.sound !== this.music) {
        this.noise = Math.floor((apu.noise.accValue * 16) / apu.noise.accCount);
      }
      sample();
    };
  }

  snapshot() {
    return { pendingTrack: this.pendingTrack, effectMask: this.effectMask, filter: [...this.filter], filterFor: this.filterFor };
  }

  set({ sound, music, track }, deferTrack) {
    this.sound = percent(sound, this.sound);
    this.music = percent(music, this.music);
    if (track === SHUFFLE || TRACKS.includes(track)) {
      if (track !== this.trackChoice) this.startMusic(track, this.track);
      this.requestTrack(deferTrack);
    }
  }

  startMusic(choice, previous) {
    this.trackChoice = choice;
    this.remainingTracks = [];
    this.atLoopEnd = false;
    this.track = choice === SHUFFLE ? this.nextTrack(previous) : choice;
    return this.track;
  }

  nextTrack(previous) {
    const bag = this.remainingTracks;
    if (!bag.length) {
      bag.push(...TRACKS);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      const last = bag.length - 1;
      if (bag[last] === previous) [bag[last], bag[0]] = [bag[0], bag[last]];
    }
    return bag.pop();
  }

  advancePlaylist() {
    if (this.trackChoice !== SHUFFLE) return;
    const ram = this.nes.cpu.mem;
    if (ram[0x29] !== 0 || this.pendingTrack) {
      this.atLoopEnd = false;
      return;
    }
    const [end, start] = SCORE_LOOPS[this.track - 1];
    const id = this.track - 1;
    let ending = false;
    let looped = false;
    for (let i = 0; i < 11; i++) {
      const sequence = ram[0x020e + i];
      if ((sequence !== id && sequence !== id + 4) || !ram[0x0292 + i]) continue;
      const pointer = ram[0x0219 + i] | (ram[0x0224 + i] << 8);
      ending ||= pointer === end;
      looped ||= pointer === start;
    }
    if (this.atLoopEnd && looped) {
      this.track = this.nextTrack(this.track);
      this.atLoopEnd = false;
      this.requestTrack(true);
    } else {
      this.atLoopEnd = ending;
    }
  }

  requestTrack(deferTrack = false) {
    if (!this.nes) return;
    const ram = this.nes.cpu.mem;
    if (ram[0x49] !== 1 || ![0, 1, 3].includes(ram[0x29])) return;
    if (ram[0x04f5] === this.track) return;
    ram[0x04f5] = this.track;
    // The dance owns its score. At $90E2 the game itself reads $04F5
    // and restarts the selected melody after the dancers leave.
    this.pendingTrack = ram[0x29] !== 3;
    // A paused menu can pass through several titles before resuming. Only
    // the final choice needs a command pair on the next console frame.
    if (!deferTrack) this.flushTrack();
  }

  flushTrack() {
    if (!this.pendingTrack) return;
    const ram = this.nes.cpu.mem;
    if (ram[0x29] !== 0 && ram[0x29] !== 1) {
      this.pendingTrack = false;
      return;
    }
    // Reproduce the two commands issued by $A035. The original eight-slot
    // FIFO at $CFB1 drains one command per tick. Keep existing SFX queued.
    const first = (ram[0x0209] + 1) & 7;
    const second = (first + 1) & 7;
    if (first === ram[0x0208] || second === ram[0x0208]) return;
    ram[0x0200 + first] = 8;
    ram[0x0200 + second] = ram[0xa043 + this.track];
    ram[0x0209] = second;
    this.pendingTrack = false;
  }

  sample(left, right) {
    if (this.sound === this.music) {
      this.filterFor = null;
      this.output(left * this.music, right * this.music);
      return;
    }
    // At equal gains the original nonlinear NES DAC mix is exact. For
    // unequal gains keep that shared part, and add just the louder stem's
    // difference through the same NES pulse/TND DAC lookup tables.
    const louderIsSound = this.sound > this.music;
    const mask = louderIsSound ? this.effectMask : ~this.effectMask;
    const apu = this.apu;
    const sq1 = mask & 1 ? apu.smpSquare1 : 0;
    const sq2 = mask & 2 ? apu.smpSquare2 : 0;
    const tri = mask & 4 ? apu.smpTriangle * 3 : 0;
    const noise = mask & 8 ? this.noise * 2 : 0;
    const dmc = louderIsSound ? 0 : apu.smpDmc;
    const dryLeft = apu.square_table[(sq1 * apu.stereoPosLSquare1 + sq2 * apu.stereoPosLSquare2) >> 8]
      + apu.tnd_table[(tri * apu.stereoPosLTriangle + noise * apu.stereoPosLNoise + dmc * apu.stereoPosLDMC) >> 8];
    const dryRight = apu.square_table[(sq1 * apu.stereoPosRSquare1 + sq2 * apu.stereoPosRSquare2) >> 8]
      + apu.tnd_table[(tri * apu.stereoPosRTriangle + noise * apu.stereoPosRNoise + dmc * apu.stereoPosRDMC) >> 8];

    if (this.filterFor !== louderIsSound) {
      this.filter[0] = dryLeft;
      this.filter[1] = dryRight;
      this.filterFor = louderIsSound;
    }
    const acLeft = dryLeft - this.filter[0];
    const acRight = dryRight - this.filter[1];
    this.filter[0] += acLeft / 1024;
    this.filter[1] += acRight / 1024;
    const base = Math.min(this.music, this.sound);
    const difference = Math.abs(this.music - this.sound) / 32768;
    this.output(base * left + difference * acLeft, base * right + difference * acRight);
  }
}
