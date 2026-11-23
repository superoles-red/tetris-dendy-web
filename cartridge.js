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

export function gameOverReady(nes) {
  if (readScene(nes) !== 'gameover') return false;
  const ram = nes.cpu.mem;
  // The score jingle ends around tick 173. Allow the buffered audio tail to
  // drain before enabling the button, even on a slower display.
  if (ram[0x6a] > 168) return false;
  for (let i = 0; i < 11; i++) {
    if (ram[0x020e + i] === 5 && ram[0x0292 + i]) return false;
  }
  return true;
}

export function endGameWait(nes) {
  // Let the cartridge run its own Game Over to ranking transition.
  if (gameOverReady(nes)) nes.cpu.mem[0x6a] = 1;
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

// Both supplied editions have the same 6502 instructions and RAM layout.
// The localized ROM changes the tile data those instructions copy to the PPU.
// Rebuild the native screen templates so a language switch can translate
// already-drawn labels without touching the current stack or falling piece.
const layoutNumber = { title: 0, mode: 1, level: 2, handicap: 3, music: 4, scores: 8 };
const PRG = 16 - 0x8000;
const CHR = 16 + 0x8000;

function screenTemplate(image, layout, overlays) {
  const word = at => image[PRG + at] | (image[PRG + at + 1] << 8);
  const base = PRG + word(0xb47e + layout * 2);
  const tiles = image.slice(base, base + 960);

  // $B3E9 draws the base map, then the title/menu rectangles.
  function rectangles(cursor, background) {
    while (image[PRG + cursor]) {
      const flags = image[PRG + cursor];
      const width = flags & 127;
      const height = image[PRG + cursor + 1];
      const dest = word(cursor + 2) - 0x2000;
      const src = PRG + word(cursor + 4);
      for (let row = 0; row < height; row++) {
        const output = dest + row * 32;
        if (output < 0 || output + width > tiles.length) continue;
        const input = src + (background || (flags & 128) ? row * width : 0);
        tiles.set(image.subarray(input, input + width), output);
      }
      cursor += 6;
    }
  }
  rectangles(word(0xb490 + 2 * layout), true);

  // $A159 adds variable-length, address-prefixed strings to the nametable.
  let cursor = PRG + word(0xa189 + 2 * layout);
  while (image[cursor]) {
    let dest = image[cursor] + 256 * image[cursor + 1] - 0x2000;
    cursor += 2;
    while (image[cursor] !== 0xff) tiles[dest++] = image[cursor++];
    cursor++;
  }
  for (const overlay of overlays) rectangles(word(0xb65d + 2 * overlay), false);
  return tiles;
}

// The line-clear animation at $89E9 stamps one letter per column in
// the well. A partly written message can share its row with block tiles.
function translateClearMessages(ppu, source, target) {
  for (let row = 6; row <= 27; row++) {
    const address = 0x2000 + row * 32 + 2;
    const cells = ppu.vramMem.subarray(address, address + 10);
    if (!cells.some(tile => tile > 0x20)) continue;
    for (let type = 0; type < 4; type++) {
      const offset = PRG + 0x8a2b + type * 12;
      if (!cells.every((tile, i) => tile < 0x20 || tile === source[offset + i])) continue;
      for (let i = 0; i < cells.length; i++) {
        if (cells[i] >= 0x20) ppu.writeMem(address + i, target[offset + i]);
      }
      break;
    }
  }
}

export function remapCartridge(nes, source, target) {
  const ppu = nes.ppu;
  const ram = nes.cpu.mem;
  const scene = readScene(nes);
  const layout = layoutNumber[scene] ?? 6;
  const overlays = [];
  if (scene === 'pause') overlays.push(0);
  if (scene === 'gameover') overlays.push(3);
  if (scene === 'dance' && ram[0x6a] >= 5) {
    overlays.push(9);
    if (ram[0x6a] >= 0x7c) overlays.push(12);
  }
  const oldTiles = screenTemplate(source, layout, overlays);
  const newTiles = screenTemplate(target, layout, overlays);

  // JSNES snapshots include the live 8 KiB CHR window but CNROM does
  // not serialize a latch number. Identify the source window exactly.
  const chr = ppu.vramMem.subarray(0, 8192);
  const bank = [0, 1].find(i => chr.every((byte, j) => byte === source[CHR + 8192 * i + j]));
  if (bank === undefined) throw new Error('Unrecognized Tetris pattern table.');

  const ports = nes.mmap.toJSON();
  const rom = new nes.rom.constructor(nes);
  rom.load(target);
  const mapper = rom.createMapper();
  mapper.fromJSON(ports);
  nes.rom = rom;
  nes.romData = target;
  nes.mmap = mapper;
  mapper.load32kRomBank(0, 0x8000);
  mapper.load8kVromBank(bank * 2, 0);

  if (layout === 6) translateClearMessages(ppu, source, target);
  for (let i = 0; i < oldTiles.length; i++) {
    const address = 0x2000 + i;
    if (oldTiles[i] !== newTiles[i] && ppu.vramMem[address] === oldTiles[i]) {
      ppu.writeMem(address, newTiles[i]);
    }
  }
  ppu.validTileData = false;
}
