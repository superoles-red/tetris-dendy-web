const EXIT_CHECKPOINT = 'tengen-tetris-exit-checkpoint';

function exitCheckpoint(info) {
  if (!info) return null;
  try {
    const saved = JSON.parse(localStorage.getItem(EXIT_CHECKPOINT));
    if (saved?.info?.id === info.id && saved.info.owner === info.owner && saved.info.savedAt >= (info.savedAt || 0)) {
      return saved;
    }
  } catch { /* Storage may be unavailable. */ }
  return null;
}

export function saveOnExit(info, checkpoint) {
  // Closing a tab can interrupt IndexedDB before an async transaction commits.
  // One synchronous copy covers that gap; the restart snapshot stays in IDB.
  try { localStorage.setItem(EXIT_CHECKPOINT, JSON.stringify({ info, checkpoint })); }
  catch { /* The periodic IndexedDB checkpoint is still available. */ }
}

function clearExitCheckpoint(id, owner) {
  try {
    const saved = JSON.parse(localStorage.getItem(EXIT_CHECKPOINT));
    if (saved?.info?.id === id && saved.info.owner === owner) localStorage.removeItem(EXIT_CHECKPOINT);
  } catch {}
}

// Keep the small menu preview separate from the full emulator snapshots.
export function openSavedRun() {
  return new Promise(resolve => {
    if (!globalThis.indexedDB) return resolve(null);
    const request = indexedDB.open('tengen-tetris-run', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('slot');
    request.onerror = request.onblocked = () => resolve(null);
    request.onsuccess = () => resolve(new RunStore(request.result));
  });
}

class RunStore {
  constructor(db) {
    this.db = db;
  }

  transaction(mode, operation) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('slot', mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error);
      operation(tx.objectStore('slot'), value => { result = value; });
    });
  }

  read() {
    return this.transaction('readonly', (store, result) => {
      const request = store.get('info');
      request.onsuccess = () => {
        const info = request.result ?? null;
        result(exitCheckpoint(info)?.info ?? info);
      };
    });
  }

  save(info, checkpoint, initial) {
    return this.transaction('readwrite', (store, result) => {
      function write() {
        store.put(info, 'info');
        store.put(checkpoint, 'checkpoint');
        if (initial) store.put(initial, 'initial');
        result(info);
      }
      if (initial) {
        write();
        return;
      }
      const request = store.get('info');
      request.onsuccess = () => {
        const saved = request.result;
        // A tab from a replaced run can no longer overwrite the slot.
        if (saved?.id === info.id && saved.owner === info.owner) write();
        else result(saved ?? null);
      };
    });
  }

  take(id, owner) {
    let consumedOwner;
    return this.transaction('readwrite', (store, result) => {
      const request = store.get('info');
      request.onsuccess = () => {
        if (request.result?.id !== id) return result(null);
        const backup = exitCheckpoint(request.result);
        const info = { ...(backup?.info ?? request.result), owner };
        const checkpoint = store.get('checkpoint');
        const initial = store.get('initial');
        initial.onsuccess = () => {
          if (!checkpoint.result || !initial.result) return result(null);
          store.put(info, 'info');
          const state = backup?.checkpoint ?? checkpoint.result;
          if (backup) {
            consumedOwner = backup.info.owner;
            store.put(state, 'checkpoint');
          }
          result({ info, checkpoint: state, initial: initial.result });
        };
      };
    }).then(slot => {
      if (consumedOwner) clearExitCheckpoint(id, consumedOwner);
      return slot;
    });
  }

  finish(id, owner) {
    return this.transaction('readwrite', (store, result) => {
      const request = store.get('info');
      request.onsuccess = () => {
        if (request.result?.id === id && request.result.owner === owner) {
          store.clear();
          result(null);
        } else result(request.result ?? null);
      };
    }).then(info => {
      if (!info) clearExitCheckpoint(id, owner);
      return info;
    });
  }
}
