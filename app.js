import { Engine } from './engine.js';
import { Compositor } from './compositor.js';
import { readScene, createSoloStart, enteringInitials } from './cartridge.js';
import { SHUFFLE, TRACKS } from './cartridge-audio.js';
import { bindControls } from './controls.js';
import { bindInstall } from './install.js';
import { translations, preferredLanguage } from './locale.js';
import { bindPhoneInsets } from './viewport.js';
import { openSavedRun, saveOnExit } from './saved-run.js';
import { addRecord, editingRecord, limitRecordName, loadRecords, readRankedResult, recordName, seedRanking } from './rankings.js';

bindPhoneInsets();

const byId = id => document.getElementById(id);
const game = byId('game');
const overlay = byId('overlay');
const notice = byId('notice');
const afterGame = byId('after-game');
const resultBar = byId('result-bar');
const recordInput = byId('record-input');
const recordsTable = byId('records-table');
const renderer = new Compositor(byId('picture'), resultBar);
const menus = ['home', 'confirm', 'setup', 'pause', 'audio', 'records', 'record-edit', 'record-confirm'];
const SAVE_INTERVAL = 6000;
const bindings = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down',
  ArrowUp: 'a', KeyX: 'a', KeyZ: 'b'
};
const levels = Array.from({ length: 10 }, (_, n) => n);
const rows = [0, 3, 6, 9, 12];
const volumes = [0, 10, 25, 50, 100];
const musicTracks = [SHUFFLE, ...TRACKS];
const settings = { level: 0, handicap: 0, track: SHUFFLE, sound: 100, musicVolume: 100, language: preferredLanguage() };
try {
  const s = JSON.parse(localStorage.getItem('tengen-settings')) || {};
  if (s.language === 'en' || s.language === 'ru') settings.language = s.language;
  if (levels.includes(s.level)) settings.level = s.level;
  if (rows.includes(s.handicap)) settings.handicap = s.handicap;
  const track = s.track ?? s.music;
  if (musicTracks.includes(track)) settings.track = track;
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
let records = loadRecords();
let pendingRecord = null;
let recordsAfterGame = false;
let menuMusicUnlocked = false;
let runStore = null;
let activeRun = null;
let savedInfo = null;
let confirmIntent = null;
let nextSaveAt = 0;
let savePending = 0;
let saveRevision = 0;
let pageLeaving = false;
const runId = () => globalThis.crypto?.randomUUID?.() ?? Date.now() + '-' + Math.random();
const owner = runId();
const heldInputs = new Map();
const padButtons = new Map([...document.querySelectorAll('[data-button]')].map(node => [node.dataset.button, node]));
const engine = new Engine({ onFrame, onError: fail });
const controls = bindControls({ pad: document.querySelector('.pad'), setInput, pause });
const installation = bindInstall({
  language: settings.language,
  canReload: () => view === 'home' && savePending === 0,
  onContinue: () => {
    byId('play').focus({ preventScroll: true });
    unlockMenuMusic();
  }
});
const refreshChoices = [];

function syncMenuMusic() {
  if (menuMusicUnlocked && !document.hidden && isFrontMenu()) {
    engine.playMenuMusic(settings.musicVolume);
  }
}
function unlockMenuMusic() {
  if (isFrontMenu()) {
    menuMusicUnlocked = true;
    syncMenuMusic();
  }
}
function isFrontMenu() {
  return view === 'home' || view === 'setup' || view === 'confirm' || view === 'records';
}

function applyMix() {
  engine.setMix({ sound: settings.sound, music: settings.musicVolume, track: settings.track });
}
function settingsChanged(previewTrack) {
  if (view === 'audio') {
    applyMix();
    if (previewTrack) engine.previewMusic(settings.musicVolume);
  }
  if (view === 'setup') syncMenuMusic();
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
  overlay.dataset.menu = name;
  const inGame = name === 'pause' || name === 'audio';
  overlay.hidden = false;
  overlay.classList.toggle('in-game', inGame);
  game.hidden = !inGame;
  game.inert = true;
  byId('panel').className = name === 'home' ? 'panel cover' : 'panel dialog';
  byId('art').hidden = name !== 'home';
  for (const id of menus) byId(id + '-menu').hidden = id !== name;
  notice.hidden = true;
  if (name === 'records') renderRecords();
  const first = {
    home: savedInfo ? 'continue-run' : 'play', confirm: 'confirm-no', setup: 'start',
    pause: 'resume', audio: 'audio-back', records: 'records-back',
    'record-edit': 'record-edit-title', 'record-confirm': 'record-confirm-no'
  }[name];
  byId(first).focus({ preventScroll: true });
  if (name === 'home') installation.checkReady();
  syncMenuMusic();
}
function pause(save = true) {
  if (view !== 'game') return;
  releaseAll();
  engine.setPaused(true);
  if (save) saveCurrentRun();
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
function enterRun(scene = 'play') {
  nextSaveAt = 0;
  observedEnd = false;
  pendingRecord = null;
  afterGame.hidden = true;
  resultBar.hidden = true;
  game.classList.remove('scores');
  activeScene = scene;
  game.dataset.scene = scene;
  applyMix();
  engine.setMuted(false);
  resume();
}
function restart() {
  if (!runStart) return;
  releaseAll();
  engine.restoreStart(runStart);
  seedRanking(engine.nes, records);
  enterRun();
}
function home() {
  releaseAll();
  engine.setPaused(true);
  runStart = null;
  activeRun = null;
  menu('home');
}

function renderSavedMenu() {
  const t = translations[settings.language];
  byId('play').textContent = savedInfo ? t.setup : t.play;
  byId('play').classList.toggle('primary', !savedInfo);
  byId('continue-run').hidden = !savedInfo;
  byId('continue-run').textContent = t.continueRun;
  byId('confirm-title').textContent = confirmIntent === 'replace' ? t.replacePrompt : t.resumePrompt;
  byId('confirm-note').textContent = t.replaceNote;
  byId('confirm-note').hidden = confirmIntent !== 'replace';
  byId('confirm-no').textContent = t.no;
  byId('confirm-yes').textContent = t.yes;
  byId('saved-level').textContent = savedInfo ? t.level + ' ' + savedInfo.level : '';
  const thumbnail = byId('saved-thumbnail');
  thumbnail.hidden = !savedInfo?.thumbnail;
  if (savedInfo?.thumbnail) thumbnail.src = savedInfo.thumbnail;
  else thumbnail.removeAttribute('src');
}

function observeSave(operation) {
  const revision = ++saveRevision;
  savePending++;
  return operation.then(info => {
    if (revision === saveRevision) {
      savedInfo = info;
      renderSavedMenu();
    }
  }).finally(() => {
    savePending--;
    if (view === 'home') installation.checkReady();
  });
}

function saveCurrentRun(exiting = false) {
  const run = activeRun;
  if (!runStore || !run || !runStart) return;
  const nes = engine.nes;
  if (!['play', 'dance'].includes(readScene(nes))) return;
  // Read the actual level shown by the cartridge, including bonus advances.
  const level = nes.ppu.vramMem.subarray(0x20cb, 0x20cd);
  const digits = Array.from(level).filter(tile => tile >= 0x30 && tile <= 0x39);
  const info = {
    id: run.id, owner, savedAt: Date.now(),
    level: digits.length ? Number(String.fromCharCode(...digits)) : settings.level,
    thumbnail: renderer.thumbnail()
  };
  const initial = run.fresh ? runStart : undefined;
  const checkpoint = engine.captureProgress();
  if (exiting) saveOnExit(info, checkpoint);
  const operation = runStore.save(info, checkpoint, initial);
  run.fresh = false;
  nextSaveAt = performance.now() + SAVE_INTERVAL;
  observeSave(operation).catch(() => {
    if (initial && activeRun === run) run.fresh = true;
  });
}

function finishCurrentRun() {
  if (!runStore || !activeRun) return;
  const id = activeRun.id;
  activeRun = null;
  if (savedInfo?.id === id) {
    savedInfo = null;
    renderSavedMenu();
  }
  observeSave(runStore.finish(id, owner)).catch(() => {});
}

function confirmRun(intent) {
  confirmIntent = intent;
  renderSavedMenu();
  menu('confirm');
}

async function continueSavedRun() {
  if (!savedInfo || !runStore) return;
  const yes = byId('confirm-yes');
  yes.disabled = true;
  try {
    const slot = await runStore.take(savedInfo.id, owner);
    if (view !== 'confirm' || confirmIntent !== 'continue') return;
    if (!slot) {
      await observeSave(runStore.read());
      menu('home');
      return;
    }
    engine.setPaused(true);
    engine.restoreProgress(slot.checkpoint);
    seedRanking(engine.nes, records);
    runStart = slot.initial;
    activeRun = { id: slot.info.id, fresh: false };
    enterRun(readScene(engine.nes));
  } catch {
    menu('home');
  } finally {
    yes.disabled = false;
  }
}

function fitRecordNames() {
  if (recordsTable.hidden || view !== 'records') return;
  for (const slot of recordsTable.querySelectorAll('.record-name-slot')) {
    const name = slot.firstElementChild;
    name.style.fontSize = '';
    const width = name.getBoundingClientRect().width;
    if (width > slot.clientWidth) {
      const size = parseFloat(getComputedStyle(name).fontSize);
      name.style.fontSize = (size * slot.clientWidth / width) + 'px';
    }
  }
}
new ResizeObserver(fitRecordNames).observe(recordsTable);
document.fonts.ready.then(fitRecordNames);

function renderRecords() {
  const tbody = byId('record-rows');
  tbody.replaceChildren();
  records.forEach((entry, index) => {
    const row = tbody.insertRow();
    row.insertCell().textContent = index + 1;
    const slot = document.createElement('span');
    slot.className = 'record-name-slot';
    const name = document.createElement('bdi');
    name.textContent = recordName(entry);
    slot.append(name);
    row.insertCell().append(slot);
    row.insertCell().textContent = entry.score;
    row.insertCell().textContent = entry.lines;
  });
  recordsTable.hidden = records.length === 0;
  byId('records-empty').hidden = records.length > 0;
  byId('records-replay').hidden = !recordsAfterGame;
  const t = translations[settings.language];
  byId('records-back').textContent = recordsAfterGame ? t.mainMenu : t.back;
  fitRecordNames();
}

function openRecordEditor(nes) {
  const row = editingRecord(nes);
  if (row === null) return false;
  pendingRecord = readRankedResult(nes, row, engine.language);
  if (!pendingRecord) return false;
  releaseAll();
  engine.setPaused(true);
  recordInput.value = '';
  byId('record-submit').disabled = true;
  menu('record-edit');
  return true;
}

function updateRecordInput(event) {
  if (event.isComposing) return;
  const limited = limitRecordName(recordInput.value);
  if (limited !== recordInput.value) recordInput.value = limited;
  byId('record-submit').disabled = limited.trim().length === 0;
}
recordInput.addEventListener('input', updateRecordInput);
recordInput.addEventListener('compositionend', updateRecordInput);

byId('record-form').addEventListener('submit', event => {
  event.preventDefault();
  if (view !== 'record-edit' || !pendingRecord) return;
  const name = limitRecordName(recordInput.value);
  if (!name.trim()) return;
  pendingRecord.name = name;
  byId('record-confirm-name').firstElementChild.textContent = name;
  menu('record-confirm');
});

byId('record-confirm-no').onclick = () => {
  menu('record-edit');
  recordInput.focus();
};
byId('record-confirm-yes').onclick = () => {
  if (view !== 'record-confirm' || !pendingRecord?.name) return;
  records = addRecord(pendingRecord, records);
  pendingRecord = null;
  recordsAfterGame = true;
  menu('records');
};

function showMessage(message) {
  overlay.dataset.menu = 'notice';
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
  showMessage(translations[settings.language].error);
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
  showMessage(translations[settings.language].starting);
  try {
    const scene = readScene(engine.nes);
    if ((scene === 'scores' && !enteringInitials(engine.nes)) || scene === 'title') {
      menuCheckpoint = engine.captureStart();
    } else if (scene !== 'boot') {
      // A fresh run after leaving a game can retain the last completed ranking.
      if (menuCheckpoint) engine.restoreStart(menuCheckpoint);
      else engine.reset();
    }
    const advance = createSoloStart({ level: settings.level, handicap: settings.handicap, music: engine.startMusic(settings.track) });
    let frames = 0;
    let rankingSeeded = false;
    while (true) {
      await new Promise(requestAnimationFrame);
      const deadline = performance.now() + 12;
      do {
        if (!rankingSeeded && ['title', 'scores'].includes(readScene(engine.nes))) {
          seedRanking(engine.nes, records);
          rankingSeeded = true;
        }
        if (advance(engine.nes)) {
          if (!rankingSeeded) seedRanking(engine.nes, records);
          applyMix();
          runStart = engine.captureStart();
          activeRun = { id: runId(), fresh: true };
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
  // The cartridge blanks the PPU while it writes the ranking screen.
  // Leave the last complete picture visible until the table is ready.
  if (scene === 'scores' && !nes.ppu.f_bgVisibility) return;
  if (scene !== activeScene) {
    releaseAll();
    activeScene = scene;
    game.dataset.scene = scene;
  }
  if (!observedEnd && (scene === 'gameover' || scene === 'scores')) {
    observedEnd = true;
    finishCurrentRun();
  }
  if (observedEnd && ['title','demo','mode','level','music','handicap'].includes(scene)) {
    home();
    return;
  }
  const showResults = scene === 'scores';
  if (resultBar.hidden === showResults) {
    resultBar.hidden = !showResults;
    game.classList.toggle('scores', showResults);
  }
  if (showResults) {
    if (enteringInitials(nes) && openRecordEditor(nes)) return;
    afterGame.hidden = false;
  }
  if (present) {
    renderer.draw(buffer, scene, nes);
    if (runStore && activeRun && ['play', 'dance'].includes(scene) && performance.now() >= nextSaveAt) {
      nextSaveAt = performance.now() + SAVE_INTERVAL;
      // The PPU calls onFrame before the CPU finishes the current frame.
      const run = activeRun;
      setTimeout(() => { if (activeRun === run) saveCurrentRun(); }, 0);
    }
  }
}

function localize() {
  const lang = settings.language;
  const t = translations[lang];
  document.documentElement.lang = lang;
  document.title = t.pageTitle;
  const art = byId('art');
  const title = 'assets/title' + (lang === 'ru' ? '-ru' : '');
  art.querySelector('source').srcset = title + '-motion.png';
  art.querySelector('img').src = title + '.png';
  art.querySelector('img').alt = t.titleArt;
  const text = {
    '#play': t.play, '#setup-menu h1': t.setup, '#start': t.start, '#setup-back': t.back,
    '#pause-menu h1': t.pause, '#resume': t.resume, '#restart': t.restart, '#main-menu': t.mainMenu,
    '#sound': t.sound, '#audio-menu h1': t.sound, '#audio-back': t.back, '#after-game': t.playAgain,
    '#home-support': t.support,
    '#record-edit-title': t.newRecord, '#record-label': t.recordName,
    '#record-name-hint': t.recordNameHint, '#record-submit': t.saveRecord,
    '#record-confirm-title': t.saveRecordPrompt, '#record-confirm-yes': t.yes, '#record-confirm-no': t.no,
    '#records-replay': t.playAgain,
    '#records': t.records, '#records-menu h1': t.records, '#records-back': t.back,
    '#records-empty': t.emptyRecords, '#records-name': t.recordName,
    '#records-score': t.recordScore, '#records-lines': t.recordLines
  };
  for (const [selector, value] of Object.entries(text)) document.querySelector(selector).textContent = value;
  byId('home-support').title = t.supportHint;
  const labels = {
    '#machine': t.pageTitle, '#game': t.game, '#overlay': t.gameMenu, '#picture': t.field,
    '.pad': t.controls, '#pause-key': t.pause
  };
  for (const [selector, label] of Object.entries(labels)) document.querySelector(selector).setAttribute('aria-label', label);
  byId('pause-key').title = t.pause + ' · Esc';
  const shortcuts = { left: '←', right: '→', down: '↓', a: 'X / ↑', b: 'Z' };
  for (const [key, node] of padButtons) {
    node.setAttribute('aria-label', t[key]);
    node.title = t[key] + ' · ' + shortcuts[key];
  }
  installation.setLanguage(lang);
  renderSavedMenu();
}

function addChoice(container, key, values, read, change, format = String) {
  const row = document.createElement('div');
  row.className = 'choice';
  const center = document.createElement('div');
  const heading = document.createElement('small');
  const output = document.createElement('output');
  center.append(heading, output);
  function arrow(direction) {
    const button = document.createElement('button');
    const image = document.createElement('img');
    image.src = 'assets/arrow.png';
    image.alt = '';
    button.append(image);
    button.onclick = () => {
      change(values[(values.indexOf(read()) + direction + values.length) % values.length]);
      settingsChanged(key === 'music' || key === 'track');
    };
    return button;
  }
  const previous = arrow(-1), next = arrow(1);
  function refresh() {
    const t = translations[settings.language];
    const label = t[key];
    heading.textContent = label;
    output.setAttribute('aria-label', label);
    output.textContent = format(read(), t);
    previous.setAttribute('aria-label', t.previous + ' ' + label.toLowerCase());
    next.setAttribute('aria-label', t.next + ' ' + label.toLowerCase());
  }
  refresh();
  refreshChoices.push(refresh);
  row.append(previous, center, next);
  byId(container + '-choices').append(row);
}

function addLanguageSwitch(container) {
  const row = document.createElement('div');
  row.className = 'language-choice';
  row.setAttribute('role', 'group');
  const heading = document.createElement('small');
  row.append(heading);
  for (const [code, label] of [['ru', 'РУС'], ['en', 'ENG']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.lang = code;
    button.dataset.language = code;
    button.textContent = label;
    button.setAttribute('aria-label', code === 'ru' ? 'Русский' : 'English');
    button.onclick = () => {
      if (code === settings.language) return;
      engine.setLanguage(code);
      if (view === 'audio') {
        engine.renderPausedFrame((buffer, nes) => renderer.draw(buffer, activeScene, nes));
      }
      settings.language = code;
      localize();
      settingsChanged(false);
    };
    row.append(button);
  }
  function refresh() {
    heading.textContent = translations[settings.language].language;
    row.setAttribute('aria-label', heading.textContent);
    for (const button of row.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.language === settings.language));
    }
  }
  refresh();
  refreshChoices.push(refresh);
  byId(container + '-choices').append(row);
}

addChoice('setup', 'level', levels, () => settings.level, n => { settings.level = n; });
addChoice('setup', 'rows', rows, () => settings.handicap, n => { settings.handicap = n; });
const trackText = (track, t) => track === SHUFFLE ? t.shuffle : t.tracks[track];
addChoice('setup', 'music', [...musicTracks, 0], () => settings.musicVolume ? settings.track : 0, n => {
  if (n === 0) settings.musicVolume = 0;
  else {
    settings.track = n;
    if (!settings.musicVolume) settings.musicVolume = 100;
  }
}, trackText);
addLanguageSwitch('setup');

const volumeText = (n, t) => n ? n + '%' : t.off;
addChoice('audio', 'effects', volumes, () => settings.sound, n => { settings.sound = n; }, volumeText);
addChoice('audio', 'music', volumes, () => settings.musicVolume, n => { settings.musicVolume = n; }, volumeText);
addChoice('audio', 'track', musicTracks, () => settings.track, n => { settings.track = n; }, trackText);
addLanguageSwitch('audio');
localize();

byId('records').onclick = () => {
  recordsAfterGame = false;
  menu('records');
};
byId('records-back').onclick = () => menu('home');
window.addEventListener('storage', event => {
  if (event.key === 'tengen-local-records' || event.key === null) {
    records = loadRecords();
    if (view === 'records') renderRecords();
  }
});
byId('play').onclick = () => savedInfo ? confirmRun('replace') : menu('setup');
byId('continue-run').onclick = () => confirmRun('continue');
byId('confirm-no').onclick = () => menu('home');
byId('confirm-yes').onclick = () => {
  if (confirmIntent === 'replace') menu('setup');
  else continueSavedRun();
};
byId('setup-back').onclick = home;
byId('start').onclick = begin;
byId('resume').onclick = resume;
byId('restart').onclick = restart;
byId('main-menu').onclick = home;
byId('sound').onclick = () => menu('audio');
byId('audio-back').onclick = () => menu('pause');
afterGame.onclick = byId('records-replay').onclick = () => {
  releaseAll();
  engine.setPaused(true);
  menu('setup');
};

function tapCartridge(button) {
  setInput('tap-' + button, button, true);
  setInput('tap-' + button, button, false);
}
byId('screen').addEventListener('click', () => {
  if (view === 'game' && activeScene === 'dance') tapCartridge('a');
});

for (const type of ['contextmenu', 'selectstart', 'dragstart', 'dblclick', 'gesturestart', 'gesturechange']) {
  document.addEventListener(type, event => {
    if (event.target === recordInput && ['contextmenu', 'selectstart', 'dblclick'].includes(type)) return;
    event.preventDefault();
  }, { passive: false });
}
document.addEventListener('wheel', event => {
  if (event.ctrlKey) event.preventDefault();
}, { passive: false });
window.addEventListener('keydown', event => {
  if (installation.isOpen() || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target === recordInput) return;
  const code = event.code;
  if (event.isTrusted) unlockMenuMusic();
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
    if (view === 'record-confirm' && code === 'Escape') {
      event.preventDefault();
      byId('record-confirm-no').click();
      return;
    }
    if (!['audio', 'pause', 'setup', 'confirm', 'records'].includes(view)) return;
    event.preventDefault();
    if (!event.repeat) {
      if (view === 'audio') menu('pause');
      else if (view === 'pause') resume();
      else home();
    }
  } else if (view === 'home' && code === 'Enter' && !event.target.closest('button')) {
    event.preventDefault();
    if (!event.repeat && loaded) byId(savedInfo ? 'continue-run' : 'play').click();
  }
});
window.addEventListener('keyup', event => setInput(event.code, bindings[event.code], false));
window.addEventListener('pointerup', event => {
  // On iOS a touch can grant audio activation on release, after pointerdown.
  if (!event.isTrusted) return;
  if (view === 'game') engine.wakeAudio();
  else if (!installation.isOpen()) unlockMenuMusic();
}, { capture: true });
function suspend(save = true) {
  if (view === 'audio') engine.stopPreview();
  pause(save);
}
window.addEventListener('blur', suspend);
function hidePage() {
  if (!pageLeaving && ['game', 'pause', 'audio'].includes(view)) saveCurrentRun(true);
  pageLeaving = true;
  engine.stopMenuMusic();
  suspend(false);
  engine.setAudioPageActive(false);
}
function showPage() {
  if (document.hidden) return;
  pageLeaving = false;
  engine.setAudioPageActive(true);
  syncMenuMusic();
}
window.addEventListener('pagehide', hidePage);
window.addEventListener('pageshow', showPage);
window.addEventListener('focus', showPage);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hidePage();
  else showPage();
});

try {
  const [, store] = await Promise.all([engine.load(settings.language), openSavedRun()]);
  runStore = store;
  if (runStore) await observeSave(runStore.read()).catch(() => {});
  loaded = true;
  byId('play').disabled = false;
  byId('start').disabled = false;
  syncMenuMusic();
} catch (error) { fail(error); }
