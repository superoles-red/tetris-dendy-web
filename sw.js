// Run python3 tools/refresh-offline.py after modifying the game.
// BEGIN GENERATED OFFLINE BUNDLE
const BUILD = '9e5df477701d2a9efa8e';
const FILES = [
  ["app.js", "sha256-EAdeYukbQc1SgU4Jm8KH7Rxax0RT9rOqvDJY6FFnD48="],
  ["assets/arrow.png", "sha256-Xkt8bTzGyHK5hj+6p2X7RirhFsHgQqMSyP3W3DyHzBc="],
  ["assets/block.png", "sha256-bHHsaBDkKFKloGbXN9wtirolvFKFXAZTjCPYZu1GSO8="],
  ["assets/frame.png", "sha256-gG5M38iSOY1Ad2HuBi6nKUM4l7yWPpVfz+c/9nAzhiA="],
  ["assets/icons/apple-touch.png", "sha256-aKyqNcqUXse5dKFKKBTZ5cSnfSjLWEDDJzQLMfUqXx4="],
  ["assets/icons/icon-192.png", "sha256-X0p87zQBzEpixLy8HymHqwQmA5Fl2bLBpfg1JVumVz4="],
  ["assets/icons/icon-512.png", "sha256-55K5t4UZkHMgfMvd5W6EuWP68tUgJThk64xX3Z87sU4="],
  ["assets/icons/maskable.png", "sha256-OEcKGcKZmcc8EKOHDf6rGwWiXcTa/TKil98VfKQ3lsk="],
  ["assets/music/1.flac", "sha256-9OMonhOE+8uqkss7RXPV6ExoUd1FbJObxZ9+VvPUSz8="],
  ["assets/music/2.flac", "sha256-9Cn9ZmlsSg03gnm13llLbqK8nUkFQolKIquU7IrzoOE="],
  ["assets/music/3.flac", "sha256-bRONamDN6lehcNjf/mdhN1+kyvxhWDLV7K238kWxbTE="],
  ["assets/music/4.flac", "sha256-jtaVDegUuOwVR5KXu+cnrXVsUBCnpJrKY+UC0tojQjU="],
  ["assets/tengen.ttf", "sha256-npvd0k0ZdGLayZRQuUmEkfggXq7+ZeWNFqoQIId+MKE="],
  ["assets/title-motion.png", "sha256-ne231kRQrDCyvu+AcqDJhPtP8KO2nwJDarbXqc8wr9w="],
  ["assets/title-ru-motion.png", "sha256-T8IFcpIGhHU3pyw/ZCHsZ2VbQYpjv41pviSijGiUdx8="],
  ["assets/title-ru.png", "sha256-xoI4IQ3ycsqTnvnZdxUOgdHAsUaGeEoc3GAczb6Hgng="],
  ["assets/title.png", "sha256-xuEa7YZnurYAXyVBgFOpD7Gc9mnHp/BztVwQcctRJWw="],
  ["assets/well.png", "sha256-J4sDuw/Zrpe1+fgRJYiR7BzCmgj7L+V++oP0f1ZTNFA="],
  ["audio-output.js", "sha256-6InF/O0z1Tz8QZSYtWlElH31ZQXY1Q67/qX4SQJ9BZg="],
  ["cartridge-audio.js", "sha256-kZGHxT/++rzA3l9MkqtlTVq8k7xCb5QwavYsi2VcFT8="],
  ["cartridge.js", "sha256-GE4dL5S9G+aODLmrarnUWTpWqp0udFtzr55GTAVNw48="],
  ["compositor.js", "sha256-XqP5hbuy9M3sOX+C6YjKIzFoPj5J8Y9TO5i7XDHwlbU="],
  ["controls.css", "sha256-7nfd9HiF/RGkCc9XPP5UgcUdV+hnO94fxE/VraPawy8="],
  ["controls.js", "sha256-u+m4TakyTczslxaEXbCJdTK27jUHPRtLLmPmUpiyj4E="],
  ["engine.js", "sha256-hiNXY6ohqtHCy7kYRbYunc6JWaF9+xY5hnSyt0yNuao="],
  ["game-ru.nes", "sha256-M/BKw5U+fW092ICDzW+Q/93IBWg9IPqEB9jC2DWxHUY="],
  ["game.nes", "sha256-U5cKKyWBn5UUu38yp7Voo/S9vYdU2p57kUICDxq46mI="],
  ["index.html", "sha256-rvYoL85Bm96Gi5qCwNGePgc4KwXrnrWzGPkiyDynIjQ="],
  ["install.css", "sha256-4ZF2+KlnmA/QFDQiVxEx8cIbW+IkQDkbhsiBHTtD5M8="],
  ["install.js", "sha256-DTK3Cw1MfqEE4GN6H7rAfn5v2G86ZrHi9kIMDpNunP0="],
  ["locale.js", "sha256-lst5Wo9aODEyHkntKM++/0KeJdVw2/vfYJ1v+hegyWw="],
  ["manifest.webmanifest", "sha256-5nKMTk9rEvbDWQ9HW7FOAbX+V8rNu/1zMXftY1ooG3Y="],
  ["style.css", "sha256-gS0H5PLadeDsHCHmKsEUc/ay7wFbOLn2Rc8MnfOBMmU="],
  ["vendor/jsnes.js", "sha256-uIpOhApFnEU+rBKvQIrwLSzTCYdZfLlWyfLQ5pRXMPs="],
  ["viewport.js", "sha256-WbUSmMQWKacnoOhK9aqRfJ7L9GV99teYxVt1SoHpRow="]
];
// END GENERATED OFFLINE BUNDLE

const scope = new URL(self.registration.scope);
const prefix = 'tengen-tetris:' + scope.pathname + ':';
const cacheName = prefix + BUILD;
const metadataName = prefix + 'metadata';
const metaURL = name => new URL('.pwa/' + name, scope).href;

async function read(meta, key) {
  const response = await meta.match(metaURL(key));
  return response ? response.text() : null;
}
function write(meta, key, value) {
  return meta.put(metaURL(key), new Response(value));
}
function gameWindow(client) {
  return client.url.startsWith(scope.href);
}
const entry = new URL('index.html', scope).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const existed = await caches.has(cacheName);
    const cache = await caches.open(cacheName);
    // addAll writes the set atomically. Integrity also guards against an edge
    // serving an old module while publication updates the remaining files.
    try {
      await cache.addAll(FILES.map(([file, integrity]) => new Request(new URL(file, scope), {
        cache: 'reload', integrity
      })));
      await self.skipWaiting();
    } catch (error) {
      if (!existed) await caches.delete(cacheName);
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const meta = await caches.open(metadataName);
    const previous = await read(meta, 'active');
    const windows = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(gameWindow);
    const livePins = new Set();
    const keep = new Set([cacheName, metadataName]);
    for (const client of windows) {
      const key = 'pin/' + client.id;
      let release = await read(meta, key);
      if (!release) {
        release = previous || BUILD;
        await write(meta, key, release);
      }
      keep.add(prefix + release);
      livePins.add(metaURL(key));
    }
    await write(meta, 'active', BUILD);
    await self.clients.claim();
    for (const request of await meta.keys()) {
      if (request.url.startsWith(metaURL('pin/')) && !livePins.has(request.url)) await meta.delete(request);
    }
    for (const name of await caches.keys()) {
      if (name.startsWith(prefix) && !keep.has(name)) await caches.delete(name);
    }
    for (const client of windows) client.postMessage({ type: 'tetris-release-ready' });
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'tetris-check-release' || !event.source?.id) return;
  event.waitUntil((async () => {
    const meta = await caches.open(metadataName);
    const documentRelease = await read(meta, 'pin/' + event.source.id);
    event.ports[0]?.postMessage({ fresh: !documentRelease || documentRelease === BUILD });
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const home = request.mode === 'navigate' && (url.pathname === scope.pathname || url.origin + url.pathname === entry);
  event.respondWith((async () => {
    const meta = await caches.open(metadataName);
    if (home) {
      // The new document deliberately starts on the latest complete release.
      // Keep the previous document's pin until its own navigation finishes.
      if (event.resultingClientId) await write(meta, 'pin/' + event.resultingClientId, BUILD);
      return (await (await caches.open(cacheName)).match(entry)) || fetch(request);
    }
    // An existing game keeps all late resources (second ROM, music, graphics)
    // from its own release even after a different tab installs a newer worker.
    const release = event.clientId && await read(meta, 'pin/' + event.clientId);
    const cache = await caches.open(prefix + (release || BUILD));
    return (await cache.match(url.origin + url.pathname)) || fetch(request);
  })());
});
