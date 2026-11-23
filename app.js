import { Engine } from './engine.js';
import { Compositor } from './compositor.js';
import { readScene, createSoloStart, enteringInitials } from './cartridge.js';
import { bindControls } from './controls.js';

const byId = id => document.getElementById(id);
const game = byId('game');
const overlay = byId('overlay');
const notice = byId('notice');
const afterGame = byId('after-game');
const resultBar = byId('result-bar');
const initialsTip = byId('initials-tip');
const renderer = new Compositor(byId('picture'));
const menus = ['home', 'setup', 'pause', 'audio'];
const bindings = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down',
  ArrowUp: 'a', KeyX: 'a', KeyZ: 'b'
};
const tracks = ['SILENCE', 'LOGINSKA', 'BRADINSKY', 'KARINKA', 'TROIKA'];
const levels = Array.from({ length: 10 }, (_, n) => n);
const rows = [0, 3, 6, 9, 12];
const volumes = [0, 10, 25, 50, 100];
// Gravity measured in cartridge frames between consecutive unassisted drops.
const framesPerRow = [33, 28, 24, 20, 17, 14, 11, 9, 7, 6];
const settings = { level: 0, handicap: 0, track: 1, sound: 100, musicVolume: 100 };
try {
  const s = JSON.parse(localStorage.getItem('tengen-settings')) || {};
  if (levels.includes(s.level)) settings.level = s.level;
  if (rows.includes(s.handicap)) settings.handicap = s.handicap;
  const track = s.track ?? s.music;
  if ([1, 2, 3, 4].includes(track)) settings.track = track;
  if (s.muted) settings.sound = 0;
  if (s.muted || track === 0) settings.musicVolume = 0;
  if (volumes.includes(s.sound)) settings.sound = s.sound;
  if (volumes.includes(s.musicVolume)) settings.musicVolume = s.musicVolume;
} catch { /* Storage is optional. */ }

let view = 'home';
let activeScene = 'boot';
let runStart = null;
let menuCheckpoint = null;
let observedEnd = false;
let loaded = false;
const heldInputs = new Map();
const padButtons = new Map([...document.querySelectorAll('[data-button]')].map(node => [node.dataset.button, node]));
const engine = new Engine({ onFrame, onError: fail });
const controls = bindControls({ pad: document.querySelector('.pad'), setInput, pause });
const refreshChoices = [];

function applyMix() {
  engine.setMix({ sound: settings.sound, music: settings.musicVolume, track: settings.track });
}
function settingsChanged(previewTrack) {
  if (view === 'audio') {
    applyMix();
    if (previewTrack) engine.previewMusic(settings.track, settings.musicVolume);
  }
  try { localStorage.setItem('tengen-settings', JSON.stringify(settings)); } catch {}
  for (const refresh of refreshChoices) refresh();
}

function setInput(source, button, down) {
  if (down) {
    if (view !== 'game' || heldInputs.has(source)) return;
    heldInputs.set(source, button);
    engine.wakeAudio();
    engine.setButton(button, true);
    padButtons.get(button)?.classList.add('held');
  } else {
    const held = heldInputs.get(source);
    heldInputs.delete(source);
    if (held && ![...heldInputs.values()].includes(held)) {
      engine.setButton(held, false);
      padButtons.get(held)?.classList.remove('held');
    }
  }
}
function releaseAll() {
  controls.clear();
  heldInputs.clear();
  for (const node of padButtons.values()) node.classList.remove('held');
  engine.clearButtons();
}

function menu(name) {
  if (view === 'audio') engine.stopPreview();
  view = name;
  const inGame = name === 'pause' || name === 'audio';
  overlay.hidden = false;
  overlay.classList.toggle('in-game', inGame);
  game.hidden = !inGame;
  game.inert = true;
  byId('panel').className = name === 'home' ? 'panel cover' : 'panel dialog';
  byId('art').hidden = name !== 'home';
  for (const id of menus) byId(id + '-menu').hidden = id !== name;
  notice.hidden = true;
  const first = { home: 'play', setup: 'start', pause: 'resume', audio: 'audio-back' }[name];
  byId(first).focus({ preventScroll: true });
}
function pause() {
  if (view !== 'game') return;
  releaseAll();
  engine.setPaused(true);
  menu('pause');
}
function resume() {
  engine.wakeAudio();
  view = 'game';
  game.hidden = false;
  game.inert = false;
  overlay.hidden = true;
  renderer.resize();
  engine.start();
  if (document.hidden) pause();
}
function enterRun() {
  observedEnd = false;
  afterGame.hidden = true;
  resultBar.hidden = true;
  game.classList.remove('scores');
  activeScene = 'play';
  applyMix();
  engine.setMuted(false);
  resume();
}
function restart() {
  if (!runStart) return;
  releaseAll();
  engine.restoreStart(runStart);
  enterRun();
}
function home() {
  releaseAll();
  engine.setPaused(true);
  runStart = null;
  menu('home');
}

function showMessage(message) {
  overlay.hidden = false;
  game.hidden = true;
  byId('art').hidden = true;
  byId('panel').className = 'panel dialog';
  for (const id of menus) byId(id + '-menu').hidden = true;
  notice.hidden = false;
  notice.textContent = message;
}
function fail(error) {
  view = 'error';
  engine.setPaused(true);
  showMessage(error.message || 'Не удалось запустить игру.');
  console.error(error);
}

// Feed the selected options to the native menus. Short batches leave the UI
// responsive during startup on phones.
async function begin() {
  if (!loaded || view === 'starting' || view === 'error') return;
  view = 'starting';
  releaseAll();
  engine.setPaused(true);
  engine.wakeAudio();
  engine.setMuted(true);
  showMessage('STARTING…');
  try {
    const scene = readScene(engine.nes);
    if ((scene === 'scores' && !enteringInitials(engine.nes)) || scene === 'title') {
      menuCheckpoint = engine.captureStart();
    } else if (scene !== 'boot') {
      // A fresh run after leaving a game can retain the last completed ranking.
      if (menuCheckpoint) engine.restoreStart(menuCheckpoint);
      else engine.reset();
    }
    const advance = createSoloStart({ level: settings.level, handicap: settings.handicap, music: settings.track });
    let frames = 0;
    while (true) {
      await new Promise(requestAnimationFrame);
      const deadline = performance.now() + 12;
      do {
        if (advance(engine.nes)) {
          applyMix();
          runStart = engine.captureStart();
          enterRun();
          return;
        }
        engine.nes.frame();
        if (++frames > 540) throw new Error('Картридж не перешёл в одиночную игру.');
      } while (performance.now() < deadline);
    }
  } catch (error) { fail(error); }
}

function onFrame(buffer, nes, present = true) {
  if (view !== 'game') return;
  let scene = readScene(nes);
  if (scene === 'boot') scene = activeScene;
  activeScene = scene;
  if (scene === 'gameover' || scene === 'scores') observedEnd = true;
  if (observedEnd && ['title','demo','mode','level','music','handicap'].includes(scene)) {
    home();
    return;
  }
  if (present) renderer.draw(buffer, scene, nes);
  const showResults = scene === 'scores';
  if (resultBar.hidden === showResults) {
    resultBar.hidden = !showResults;
    game.classList.toggle('scores', showResults);
  }
  if (showResults) {
    const editing = enteringInitials(nes);
    if (afterGame.hidden !== editing) afterGame.hidden = editing;
    if (initialsTip.hidden === editing) initialsTip.hidden = !editing;
  }
}

function addChoice(container, label, values, read, change, format = String, note) {
  const row = document.createElement('div');
  row.className = 'choice';
  const center = document.createElement('div');
  const heading = document.createElement('small');
  heading.textContent = label;
  const output = document.createElement('output');
  output.setAttribute('aria-label', label);
  center.append(heading, output);
  const detail = note ? document.createElement('span') : null;
  if (detail) { detail.id = 'speed'; center.append(detail); }
  function refresh() {
    output.textContent = format(read());
    if (detail) detail.textContent = note(read());
  }
  refresh();
  refreshChoices.push(refresh);
  function arrow(direction) {
    const button = document.createElement('button');
    button.setAttribute('aria-label', (direction < 0 ? 'Previous ' : 'Next ') + label.toLowerCase());
    const image = document.createElement('img');
    image.src = 'assets/arrow.png';
    image.alt = '';
    button.append(image);
    button.onclick = () => {
      change(values[(values.indexOf(read()) + direction + values.length) % values.length]);
      settingsChanged(label === 'MUSIC' || label === 'TRACK');
    };
    return button;
  }
  row.append(arrow(-1), center, arrow(1));
  byId(container + '-choices').append(row);
}

addChoice('setup', 'LEVEL', levels, () => settings.level, n => { settings.level = n; }, String,
  n => (60.0988 / framesPerRow[n]).toFixed(1) + ' ROWS/SEC');
addChoice('setup', 'GARBAGE ROWS', rows, () => settings.handicap, n => { settings.handicap = n; });
addChoice('setup', 'MUSIC', [0,1,2,3,4], () => settings.musicVolume ? settings.track : 0, n => {
  if (n === 0) settings.musicVolume = 0;
  else {
    settings.track = n;
    if (!settings.musicVolume) settings.musicVolume = 100;
  }
}, n => tracks[n]);

const volumeText = n => n ? n + '%' : 'OFF';
addChoice('audio', 'SOUND FX', volumes, () => settings.sound, n => { settings.sound = n; }, volumeText);
addChoice('audio', 'MUSIC', volumes, () => settings.musicVolume, n => { settings.musicVolume = n; }, volumeText);
addChoice('audio', 'TRACK', [1,2,3,4], () => settings.track, n => { settings.track = n; }, n => tracks[n]);

byId('play').onclick = () => menu('setup');
byId('setup-back').onclick = home;
byId('start').onclick = begin;
byId('resume').onclick = resume;
byId('restart').onclick = restart;
byId('main-menu').onclick = home;
byId('sound').onclick = () => menu('audio');
byId('audio-back').onclick = () => menu('pause');
afterGame.onclick = () => {
  releaseAll();
  engine.setPaused(true);
  menu('setup');
};

document.addEventListener('contextmenu', event => { if (game.contains(event.target)) event.preventDefault(); });
window.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const code = event.code;
  if (view === 'game') {
    if (bindings[code]) {
      event.preventDefault();
      setInput(code, bindings[code], true);
    } else if (['Escape','KeyP','Space','Enter'].includes(code)) {
      event.preventDefault();
      if (!event.repeat) {
        if (code === 'Enter' && !resultBar.hidden && !afterGame.hidden) afterGame.click();
        else pause();
      }
    }
  } else if (code === 'Escape' || (code === 'KeyP' && view === 'pause')) {
    if (!['audio', 'pause', 'setup'].includes(view)) return;
    event.preventDefault();
    if (!event.repeat) {
      if (view === 'audio') menu('pause');
      else if (view === 'pause') resume();
      else home();
    }
  } else if (view === 'home' && code === 'Enter' && !event.target.closest('button')) {
    event.preventDefault();
    if (!event.repeat && loaded) menu('setup');
  }
});
window.addEventListener('keyup', event => setInput(event.code, bindings[event.code], false));
function suspend() {
  if (view === 'audio') engine.stopPreview();
  pause();
}
window.addEventListener('blur', suspend);
window.addEventListener('pagehide', suspend);
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });

try {
  await engine.load();
  loaded = true;
  byId('play').disabled = false;
  byId('start').disabled = false;
} catch (error) { fail(error); }
