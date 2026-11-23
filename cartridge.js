// The Tengen cartridge's screen selector. $8CB5 starts the bonus dance
// after a line milestone, and $90C3 restores play when its tally finishes.
const scenes = new Map([
  [0xfa, 'title'],
  [0xfb, 'demo'],
  [0xfc, 'mode'],
  [0xfd, 'level'],
  [0xfe, 'handicap'],
  [0xff, 'music'],
  [0x00, 'play'],
  [0x01, 'pause'],
  [0x03, 'dance'],
  [0xf9, 'gameover'],
  [0xf8, 'scores']
]);

export function readScene(nes) {
  const ram = nes.cpu.mem;
  // RAM may still be uninitialized while the PPU powers up.
  if (ram[0x49] !== 1 || (ram[0x29] === 0 && ram[0x4a] === 0)) return 'boot';
  return scenes.get(ram[0x29]) ?? 'boot';
}

export function enteringInitials(nes) {
  return readScene(nes) === 'scores' && nes.cpu.mem[0x74] !== 0;
}

const START = 3, UP = 4, DOWN = 5;
const menuSizes = { mode: 5, level: 10, handicap: 5, music: 5 };
const cursorAddress = { mode: 0x4f0, level: 0x4f1, handicap: 0x4f3, music: 0x4f5 };

function clampIndex(value, max, fallback) {
  return Number.isFinite(value) ? Math.max(0, Math.min(max, Math.round(value))) : fallback;
}

// Call once per emulated frame, passing the NES. All selections go through
// controller 1. Native setup initializes the RNG, collision grid and scores.
// handicap is the number of garbage rows: 0, 3, 6, 9 or 12.
export function createSoloStart({ level = 0, handicap = 0, music = 1 } = {}) {
  const selections = {
    mode: 0,
    level: clampIndex(level, 9, 0),
    handicap: clampIndex(handicap / 3, 4, 0),
    music: clampIndex(music, 4, 1)
  };

  // With a frozen title or accelerated setup, the player's tap timing must
  // still influence the ROM's random stream, just as waiting on a NES does.
  let wait = Math.floor(performance.now() * 10) % 32;
  let held = null;
  return function advanceMenu(nes) {
    if (held !== null) {
      nes.buttonUp(1, held);
      held = null;
      wait = 2;
    }
    const scene = readScene(nes);
    if (scene === 'play') return true;
    if (wait > 0) {
      wait--;
      return false;
    }

    let button = START;
    if (scene in selections) {
      const current = nes.cpu.mem[cursorAddress[scene]];
      const target = selections[scene];
      if (target !== current) {
        const size = menuSizes[scene];
        const downSteps = (target + size - current) % size;
        button = downSteps <= size / 2 ? DOWN : UP;
      }
    } else if (!['title', 'demo', 'gameover', 'scores'].includes(scene) || enteringInitials(nes)) {
      return false;
    }
    nes.buttonDown(1, button);
    held = button;
    return false;
  };
}
