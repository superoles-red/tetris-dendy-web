const words = {
  en: {
    title: 'Install Tetris?', install: 'INSTALL GAME', play: 'PLAY IN BROWSER',
    open: 'INSTALL GAME', ios: 'In Safari, tap Share, then Add to Home Screen. Enable Open as Web App if shown, then tap Add. If you opened this link inside another app, choose Open in Safari first.',
    chrome: 'In the browser menu, choose Install app or Add to Home screen, then Install.',
    samsung: 'Tap the install icon or choose Add page to → Home screen in the Samsung Internet menu.',
    safari: 'In Safari, choose File → Add to Dock.',
    desktop: 'Use the install option in the address bar or browser menu. You can also play here.',
    saving: 'Saving the game for offline play…',
    failed: 'Offline storage is unavailable. You can still play online.'
  },
  ru: {
    title: 'Установить Тетрис?', install: 'Установить игру', play: 'Играть в браузере',
    open: 'Установить игру', ios: 'В Safari нажмите «Поделиться» → «На экран Домой». Включите «Открыть как веб-приложение», если такой пункт есть, и нажмите «Добавить». Если вы открыли ссылку внутри другого приложения, сначала выберите «Открыть в Safari».',
    chrome: 'В меню браузера выберите «Установить приложение» или «Добавить на главный экран» → «Установить».',
    samsung: 'Нажмите значок установки или выберите «Добавить страницу» → «Главный экран» в меню Samsung Internet.',
    safari: 'В Safari выберите «Файл» → «Добавить в Dock».',
    desktop: 'Выберите установку в адресной строке или меню браузера. Можно также играть здесь.',
    saving: 'Сохраняем игру для запуска без интернета…',
    failed: 'Браузер не смог сохранить игру. Можно играть с подключением к сети.'
  }
};

const storageKey = 'tengen-install:' + new URL('.', import.meta.url).pathname;
const display = window.matchMedia('(display-mode: standalone), (display-mode: minimal-ui), (display-mode: window-controls-overlay)');
function standalone() { return display.matches || navigator.standalone === true; }
function platformHint() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/Android/i.test(ua)) return 'chrome';
  if (/Macintosh.*Safari/i.test(ua) && !/Chrome|Chromium|Edg/i.test(ua)) return 'safari';
  return 'desktop';
}

let nativePrompt;
let installed = false;
let notify = () => {};
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  nativePrompt = event;
  installed = false;
  notify();
});
window.addEventListener('appinstalled', () => {
  installed = true;
  nativePrompt = null;
  notify();
});

function preference() {
  try { return localStorage.getItem(storageKey); } catch { return null; }
}
function remember(value) {
  try { localStorage.setItem(storageKey, value); } catch {}
}

function prepareOffline(status, canReload) {
  const workers = navigator.serviceWorker;
  if (!window.isSecureContext || !workers) return () => {};
  let reg;
  let reloading = false;
  let checking = false;

  async function checkReady() {
    if (reloading || checking || document.hidden || !canReload() || !workers.controller) return;
    checking = true;
    try {
      const fresh = await new Promise(resolve => {
        const channel = new MessageChannel();
        const finish = value => { channel.port1.close(); resolve(value); };
        const timer = setTimeout(() => finish(true), 2000);
        channel.port1.onmessage = event => { clearTimeout(timer); finish(event.data?.fresh !== false); };
        workers.controller.postMessage({ type: 'tetris-check-release' }, [channel.port2]);
      });
      if (!fresh && !reloading && !document.hidden && canReload()) {
        reloading = true;
        location.reload();
      }
    } catch { /* Another worker may have taken control during the check. */ }
    finally { checking = false; }
  }
  function checkNetwork() {
    checkReady();
    if (reg && navigator.onLine && !document.hidden) reg.update().catch(() => {});
  }
  workers.addEventListener('controllerchange', checkReady);
  workers.addEventListener('message', event => {
    if (event.data?.type === 'tetris-release-ready') checkReady();
  });
  window.addEventListener('online', checkNetwork);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkNetwork(); });
  window.setInterval(checkNetwork, 5 * 60 * 1000);
  workers.register(new URL('./sw.js', import.meta.url), { updateViaCache: 'none' }).then(registration => {
    reg = registration;
    if (reg.active) status('ready');
    const watch = () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'redundant' && !reg.active) status('failed');
        if (worker.state === 'activated') { status('ready'); checkReady(); }
      });
    };
    watch();
    reg.addEventListener('updatefound', watch);
    workers.ready.then(() => status('ready'));
    checkNetwork();
  }).catch(() => status('failed'));
  return checkReady;
}

export function bindInstall({ onContinue, canReload = () => true, language } = {}) {
  let lang = language || (/^ru\b/i.test(navigator.language) ? 'ru' : 'en');
  let text = words[lang] || words.en;
  const dialog = document.createElement('dialog');
  dialog.id = 'install-dialog';
  dialog.lang = lang;
  dialog.setAttribute('aria-labelledby', 'install-heading');
  dialog.innerHTML = `
    <img src="assets/icons/icon-192.png" alt="" width="112" height="112">
    <h1 id="install-heading"></h1>
    <p id="install-hint" hidden></p>
    <p id="install-offline" role="status" hidden></p>
    <button id="install-game" type="button" class="action primary"></button>
    <button id="continue-browser" type="button" class="action"></button>`;
  document.body.append(dialog);
  const install = dialog.querySelector('#install-game');
  const play = dialog.querySelector('#continue-browser');
  const hint = dialog.querySelector('#install-hint');
  const offline = dialog.querySelector('#install-offline');
  const reopen = document.createElement('button');
  reopen.id = 'reopen-install';
  reopen.type = 'button';
  reopen.className = 'action';
  reopen.lang = lang;
  reopen.textContent = text.open;
  reopen.hidden = true;
  document.getElementById('home-menu').append(reopen);
  dialog.querySelector('h1').textContent = text.title;
  install.textContent = text.install;
  play.textContent = text.play;
  let skipped = preference() === 'browser';
  let rememberedInstall = preference() === 'installed';
  let help = false;
  let busy = false;
  let offlineState = 'saving';
  const eligible = window.isSecureContext && 'serviceWorker' in navigator;
  const checkReady = prepareOffline(state => { offlineState = state; render(); }, canReload);

  function close() {
    if (!dialog.hasAttribute('open')) return;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    onContinue?.();
  }
  function render() {
    if (nativePrompt && rememberedInstall) {
      rememberedInstall = false;
      skipped = true;
      remember('browser');
    }
    if (installed || standalone()) {
      rememberedInstall = true;
      remember('installed');
      close();
    }
    reopen.hidden = !eligible || (!skipped && !help) || installed || standalone() || rememberedInstall;
    hint.textContent = text[platformHint()];
    hint.hidden = !help;
    install.hidden = help && !nativePrompt;
    install.disabled = busy;
    offline.hidden = !help || offlineState === 'ready';
    offline.textContent = text[offlineState] || '';
  }
  function show() {
    if (!eligible || installed || standalone()) return;
    help = platformHint() === 'ios';
    render();
    if (!dialog.hasAttribute('open')) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      (install.hidden ? play : install).focus({ preventScroll: true });
    }
  }
  function continuePlaying() {
    skipped = true;
    remember('browser');
    close();
    render();
  }
  install.addEventListener('click', async () => {
    if (busy) return;
    if (!nativePrompt) {
      help = true;
      render();
      play.focus({ preventScroll: true });
      return;
    }
    const request = nativePrompt;
    nativePrompt = null;
    busy = true;
    try {
      // Trigger the OS dialog synchronously inside the user's click gesture.
      const promptResult = request.prompt();
      render();
      const choice = (await promptResult) || await request.userChoice;
      if (choice?.outcome === 'accepted') {
        installed = true;
        remember('installed');
      } else {
        help = true;
      }
    } catch { help = true; }
    finally {
      busy = false;
      render();
    }
  });
  play.addEventListener('click', continuePlaying);
  reopen.addEventListener('click', show);
  dialog.addEventListener('cancel', event => { event.preventDefault(); continuePlaying(); });
  notify = render;
  display.addEventListener?.('change', render);
  function setLanguage(language) {
    lang = language === 'ru' ? 'ru' : 'en';
    text = words[lang];
    dialog.lang = reopen.lang = lang;
    dialog.querySelector('h1').textContent = text.title;
    install.textContent = text.install;
    play.textContent = text.play;
    reopen.textContent = text.open;
    render();
  }
  render();
  if (!skipped && !rememberedInstall && !standalone()) show();
  return { isOpen: () => dialog.hasAttribute('open'), checkReady, setLanguage };
}
