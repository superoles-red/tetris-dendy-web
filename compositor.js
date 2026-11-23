// All visible marks come from the cartridge's background, sprite tiles or frame.
// Coordinates in this file refer to the uncropped 256 × 240 NES picture.
const LABELS = {
  next: [16, 16, 32, 8],
  score: [108, 16, 40, 8],
  lines: [108, 32, 40, 8],
  level: [108, 48, 40, 8],
  high: [160, 16, 80, 8],
  stats: [176, 48, 40, 8]
};
const NUMBERS = {
  score: [7, 12, 2], lines: [9, 12, 4], level: [11, 12, 6], high: [19, 29, 4]
};
const GAME = new Set(['play', 'pause', 'gameover', 'dance']);
const BLACK = 0xff000000;
const SRC_WIDTH = 256;
const WELL_W = 88;
const WELL_H = 184;
const PAUSE_CORNER = 52;
const round = Math.round;

function numberBox(ppu, key) {
  let [first, last, row] = NUMBERS[key];
  const addr = 0x2000 + 32 * row;
  while (first < last && !ppu.vramMem[addr + first]) first++;
  while (last > first && !ppu.vramMem[addr + last]) last--;
  return [first * 8, row * 8, (last - first + 1) * 8, 8];
}

// OAM slots 0–3 are the live piece and 8–11 the preview. The first two
// spawn rows share the native HUD. Copy the original sprite tiles there
// independently so those rows and the preview have a clean black backing.
function copyPiece(ppu, pixels, first, originX, originY, destX, destY, width, height) {
  const oam = ppu.spriteMem;
  for (let index = first; index < first + 4; index++) {
    const i = index * 4;
    const left = oam[i + 3] - originX;
    const top = oam[i] + 1 - originY;
    if (left >= width || top >= height || left <= -8 || top <= -8) continue;
    const attr = oam[i + 2];
    const tile = ppu.ptTile[256 * ppu.f_spPatternTable + oam[i + 1]].pix;
    for (let y = Math.max(0, -top); y < Math.min(8, height - top); y++) {
      const row = (attr & 128 ? 7 - y : y) * 8;
      const offset = (destY + top + y) * SRC_WIDTH + destX + left;
      for (let x = Math.max(0, -left); x < Math.min(8, width - left); x++) {
        const ink = tile[row + (attr & 64 ? 7 - x : x)];
        if (ink) pixels[offset + x] = BLACK | ppu.sprPalette[(attr & 3) * 4 + ink];
      }
    }
  }
}

export class Compositor {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.source = document.createElement('canvas');
    this.source.width = SRC_WIDTH;
    this.source.height = 272;
    this.sourceCtx = this.source.getContext('2d', { alpha: false });
    this.image = this.sourceCtx.createImageData(SRC_WIDTH, 272);
    this.pixels = new Uint32Array(this.image.data.buffer);
    this.frame = new Image();
    this.frame.onload = () => this.paint();
    this.frame.src = new URL('./assets/well.png', import.meta.url).href;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }

  resize() {
    // Measure the content box. Styles arrange the canvas and touch controls.
    const w = Math.max(1, round(this.canvas.clientWidth));
    const h = Math.max(1, round(this.canvas.clientHeight));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.ctx.imageSmoothingEnabled = false;
    this.landscape = window.matchMedia('(orientation: landscape)').matches;
    this.paint();
  }

  draw(buffer, scene, nes) {
    if (!buffer || !nes?.ppu) return;
    this.nes = nes;
    if (this.scene !== 'dance' || scene !== 'dance') this.firstFloor = 5;
    this.scene = scene;
    const pixels = this.pixels;
    for (let i = 0; i < 256 * 240; i++) pixels[i] = BLACK | buffer[i];
    if (scene === 'scores') {
      // Use the border's sky blue for ordinary table glyphs. The cartridge
      // flashes the edited letter in a separate sprite palette; leave it live.
      const tableInk = 0xdc0e22, borderInk = 0xffab3c; // JSNES BGR colors
      for (let y = 96; y < 216; y++) {
        for (let x = 56; x < 200; x++) {
          const i = y * 256 + x;
          if ((buffer[i] & 0xffffff) === tableInk) pixels[i] = BLACK | borderInk;
        }
      }
    }
    if (GAME.has(scene)) {
      const ppu = nes.ppu;
      pixels.fill(BLACK, 256 * 240);
      // A piece that locks close to the ceiling can reach either spawn
      // row. Copy only native block tiles (1..15); the other tiles in those
      // rows belong to the original score panel.
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 10; col++) {
          const tile = ppu.vramMem[0x2000 + (row + 6) * 32 + col + 2];
          if (tile === 0 || tile > 15) continue;
          for (let line = 0; line < 8; line++) {
            const from = (48 + row * 8 + line) * 256 + 16 + col * 8;
            const to = (240 + row * 8 + line) * 256 + col * 8;
            for (let j = 0; j < 8; j++) pixels[to + j] = BLACK | buffer[from + j];
          }
        }
      }
      copyPiece(ppu, pixels, 0, 16, 48, 0, 240, 80, 16);
      copyPiece(ppu, pixels, 8, 16, 24, 80, 240, 32, 24);
      // Align preview to its own painted bounds (tetromino origins differ).
      this.preview = this.inkBounds(80, 240, 32, 24);
      this.graph = this.graphBox(buffer);
      if (scene === 'dance') {
        const oam = ppu.spriteMem;
        for (let i = 0; i < 256; i += 4) {
          const foot = oam[i] + 8;
          const x = oam[i + 3];
          if (x >= 108 && x < 144 && foot >= 80 && foot <= 224) {
            this.firstFloor = Math.min(this.firstFloor, Math.min(5, Math.floor((foot - 80) / 24)));
          }
        }
      }
    }
    this.sourceCtx.putImageData(this.image, 0, 0);
    this.paint();
  }

  inkBounds(x, y, w, h) {
    let x1 = w, x2 = -1, y1 = h, y2 = -1;
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        if ((this.pixels[(y + row) * 256 + x + col] & 0xffffff) === 0) continue;
        x1 = Math.min(x1, col); x2 = Math.max(x2, col);
        y1 = Math.min(y1, row); y2 = Math.max(y2, row);
      }
    }
    return x2 < 0 ? null : [x + x1, y + y1, x2 - x1 + 1, y2 - y1 + 1];
  }

  graphBox(buffer) {
    // The seven original counters grow up from the tetromino-shaped key.
    // Retain the full height, including counters in a long-running game.
    for (let y = 64; y < 208; y++) {
      for (let x = 168; x < 224; x++) {
        if (buffer[y * 256 + x] & 0xffffff) return [168, y, 56, 224 - y];
      }
    }
    return [168, 208, 56, 16];
  }

  blit(rect, x, y, width, height) {
    if (!rect || width <= 0 || height <= 0) return;
    const x1 = round(x), y1 = round(y);
    this.ctx.drawImage(this.source, ...rect, x1, y1, round(x + width) - x1, round(y + height) - y1);
  }

  fit(rect, cx, y, scale, maxWidth = Infinity) {
    if (!rect) return;
    const size = Math.min(scale, maxWidth / rect[2]);
    this.blit(rect, cx - rect[2] * size / 2, y, rect[2] * size, rect[3] * size);
  }

  metric(key, cx, y, width, scale, previewHeight = Infinity) {
    const label = LABELS[key];
    const small = Math.min(scale, width / label[2]);
    this.fit(label, cx, y, small);
    const top = y + 8 * small + 4 * scale;
    if (key === 'next') {
      if (this.preview) this.fit(this.preview, cx, top, Math.min(scale * 1.4, previewHeight / this.preview[3]), width);
    } else {
      this.fit(numberBox(this.nes.ppu, key), cx, top, scale * 1.4, width);
    }
  }

  stats(cx, y, width, height, scale) {
    this.fit(LABELS.stats, cx, y, scale, width);
    const top = y + 11 * scale;
    this.chart(cx, top, width, height - 11 * scale, scale * 1.3);
  }

  chart(cx, y, width, height, scale, bottomAlign = false) {
    const graph = this.graph;
    // Keep the native key legible as its counters grow. Only the variable-
    // height stalks compress vertically on a small display.
    const designRows = bottomAlign ? 30 : 20;
    const zoom = Math.min(scale, width / 56, Math.max(.5, height / designRows));
    const keyHeight = 16 * zoom;
    const bars = graph[3] - 16;
    const barHeight = Math.max(0, Math.min(bars * zoom, height - keyHeight));
    const top = y + (bottomAlign ? height - barHeight - keyHeight : 0);
    if (bars) this.blit([168, graph[1], 56, bars], cx - 28 * zoom, top, 56 * zoom, barHeight);
    this.blit([168, 208, 56, 16], cx - 28 * zoom, top + barHeight, 56 * zoom, keyHeight);
  }

  well(left, top, k) {
    const x = left + 4 * k, y = top + 4 * k;
    if (this.frame.naturalWidth) {
      this.ctx.drawImage(this.frame, round(left), round(top), round(WELL_W * k), round(WELL_H * k));
    }
    if (this.scene === 'dance') {
      this.dance(x, y, k);
      return;
    }
    this.blit([0, 240, 80, 16], x, y, 80 * k, 16 * k);
    this.blit([16, 64, 80, 160], x, y + 16 * k, 80 * k, 160 * k);
    if (this.scene === 'pause') this.fit([96, 64, 64, 16], x + 40 * k, y + 70 * k, k);
  }

  dance(x, y, k) {
    // Remove the large vertical gaps in the bonus table, preserving all
    // five live subtotal rows. Reuse the newly available well for the stage.
    const tally = [88, 120, 152, 184, 208];
    this.fit([16, 64, 80, 16], x + 40 * k, y + 3 * k, .9 * k);
    for (let i = 0; i < tally.length; i++) {
      this.fit([16, tally[i], 80, 16], x + 40 * k, y + (21 + 16.5 * i) * k, .86 * k);
    }
    // Each occupied story keeps its original floor and sprite animation.
    const count = 6 - this.firstFloor;
    const cols = count >= 3 ? 2 : 1;
    const rows = Math.ceil(count / cols);
    const s = Math.min(72 / (cols * 32 + (cols - 1) * 4), 69 / (rows * 24 + (rows - 1) * 2));
    const sceneTop = 104 + (69 - (rows * 24 + (rows - 1) * 2) * s) / 2;
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, count - row * cols);
      const start = 40 - ((32 * inRow + (inRow - 1) * 4) * s) / 2;
      const floor = this.firstFloor + i;
      this.blit([112, 85 + 24 * floor, 32, 24], x + (start + (i % cols) * 36 * s) * k,
        y + (sceneTop + row * 26 * s) * k, 32 * s * k, 24 * s * k);
    }
  }

  sideHUD(x, top, width, height, keys, anchored = false) {
    if (this.scene === 'dance') keys = keys.filter(key => key !== 'next');
    const cx = x + width / 2;
    const slots = keys.map(key => key === 'next' || key === 'stats' ? 38 : 25);
    const slotTotal = slots.reduce((a, b) => a + b, 0);
    const gaps = keys.length - 1;
    const scale = Math.min(width / 50, height / (slotTotal + 6 * gaps), 2);
    const gap = gaps ? Math.min((anchored ? 12 : 24) * scale, (height - slotTotal * scale) / gaps) : 0;
    const total = slotTotal * scale + gap * gaps;
    let y = top + (anchored ? 0 : Math.max(0, (height - total) / 2));
    keys.forEach((key, i) => {
      const slot = slots[i] * scale;
      if (key === 'stats') this.stats(cx, y, width, slot, scale);
      else this.metric(key, cx, y, width, scale, slot - 12 * scale);
      y += slot + gap;
    });
  }

  scores(w, h) {
    const gap = Math.min(20, w * .035);
    const wide = this.landscape && w > h * 1.22;
    const rail = wide ? Math.min(140, w * .27) : 0;
    const designHeight = wide ? 164 : 202;
    const cx = wide ? (w + rail) / 2 : w / 2;
    // The result bar already has its own 48px. In portrait, short screens
    // can otherwise put the bottom of the last table column under the pad.
    const lower = wide ? gap : 60;
    let upper = gap;
    let k = Math.min(3.5, (w - 2 * gap - rail) / 144, (h - upper - lower) / designHeight);
    if (cx + 68 * k > w - PAUSE_CORNER && (h - lower + upper - designHeight * k) / 2 < PAUSE_CORNER) {
      upper = PAUSE_CORNER;
      k = Math.min(k, (h - upper - lower) / designHeight);
    }
    const listW = 144 * k;
    const top = upper + (h - upper - lower - designHeight * k) / 2;
    this.fit([64, 80, 136, 8], cx, top, k);
    if (wide) {
      const x = cx - listW / 2 - gap - rail;
      this.sideHUD(x, top, rail, 164 * k, ['score', 'lines', 'level']);
    } else {
      const slot = listW / 3;
      ['score', 'lines', 'level'].forEach((key, i) => {
        this.metric(key, cx + (i - 1) * slot, top + 18 * k, slot - 3, k * .78);
      });
    }
    const first = top + (wide ? 16 : 54) * k;
    for (let i = 0; i < 15; i++) this.fit([56, 96 + 8 * i, 144, 8], cx, first + 10 * i * k, k);
  }

  inlineMetric(key, left, cy, width, scale, height) {
    const label = LABELS[key];
    const rect = key === 'stats' ? this.graph : numberBox(this.nes.ppu, key);
    const valueWidth = key === 'stats' ? 56 : rect[2];
    const zoom = Math.min(scale, width / (label[2] + 5 + valueWidth * 1.12));
    const labelW = label[2] * zoom;
    const valueW = valueWidth * 1.12 * zoom;
    const x = left + (width - labelW - 5 * zoom - valueW) / 2;
    this.blit(label, x, cy - 4 * zoom, labelW, 8 * zoom);
    const valueX = x + labelW + 5 * zoom;
    if (key === 'stats') {
      this.chart(valueX + valueW / 2, cy - height / 2, valueW, height, 1.12 * zoom, true);
    } else {
      this.blit(rect, valueX, cy - 4.48 * zoom, valueW, 8.96 * zoom);
    }
  }

  portrait(w, h) {
    const pad = Math.min(7, Math.max(3, w * .012));
    const width = Math.min(w - 2 * pad, 624);
    const x = (w - width) / 2;
    const firstW = Math.min(x + width, w - PAUSE_CORNER) - x;
    const scale = Math.min(2.05, w / 260, h / 320);
    const first = this.scene === 'dance' ? [['score', .45], ['high', .55]] :
      [['next', .24], ['score', .34], ['high', .42]];
    let left = x;
    for (const [key, portion] of first) {
      const slot = firstW * portion;
      this.metric(key, left + slot / 2, pad, slot - 5, scale, 18 * scale);
      left += slot;
    }
    // The first row leaves the NES pause control its full target. The
    // second row uses the entire width once it is below that corner.
    const secondTop = Math.max(PAUSE_CORNER + 1, pad + 30 * scale + 2);
    const strip = 18 * scale;
    left = x;
    for (const [key, portion] of [['lines', .31], ['level', .26], ['stats', .43]]) {
      const slot = width * portion;
      this.inlineMetric(key, left, secondTop + strip / 2, slot - 3, scale, strip);
      left += slot;
    }

    const fieldTop = secondTop + strip + pad;
    const k = Math.min((w - 2 * pad) / WELL_W, (h - fieldTop - pad) / WELL_H);
    // Extra room on unusually tall displays remains under the well for
    // thumbs. The HUD and playfield always stay together.
    this.well((w - WELL_W * k) / 2, fieldTop, k);
  }

  landscapeGame(w, h) {
    const pad = Math.min(9, Math.max(3, h * .012));
    const k = Math.min((h - 2 * pad) / WELL_H, (w - 2 * (58 + pad)) / WELL_W);
    const fieldW = WELL_W * k, left = (w - fieldW) / 2;
    this.well(left, (h - WELL_H * k) / 2, k);

    // Keep each rail close to the field and in the upper part of the
    // viewport. The lower corners are reserved for the player's hands.
    const gap = Math.min(38, Math.max(10, left * .09));
    const side = Math.max(20, Math.min(180, left - gap - pad));
    const rightX = left + fieldW + gap;
    const clearRight = w - PAUSE_CORNER - rightX;
    const rightW = clearRight >= 66 ? Math.min(side, clearRight) : side;
    const y = Math.min(38, Math.max(9, h * .05));
    const rightY = clearRight < 66 ? Math.max(PAUSE_CORNER + 2, y) : y;
    const bottom = Math.min(h - 112, h * .68);
    this.sideHUD(left - gap - side, y, side, Math.max(48, bottom - y), ['score', 'lines', 'level'], true);
    this.sideHUD(rightX, rightY, rightW, Math.max(48, bottom - rightY), ['next', 'high', 'stats'], true);
  }

  paint() {
    if (!this.nes) return;
    const w = this.canvas.width, h = this.canvas.height;
    if (w < 2 || h < 2) return;
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, w, h);
    if (this.scene === 'scores') {
      this.scores(w, h);
      return;
    }
    if (!GAME.has(this.scene)) {
      const k = Math.min(w / 256, h / 240);
      this.blit([0, 0, 256, 240], (w - 256 * k) / 2, (h - 240 * k) / 2, 256 * k, 240 * k);
      return;
    }

    if (this.landscape) this.landscapeGame(w, h);
    else this.portrait(w, h);
  }
}
