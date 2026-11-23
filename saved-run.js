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
      request.onsuccess = () => result(request.result ?? null);
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
    return this.transaction('readwrite', (store, result) => {
      const request = store.get('info');
      request.onsuccess = () => {
        if (request.result?.id !== id) return result(null);
        const info = { ...request.result, owner };
        const checkpoint = store.get('checkpoint');
        const initial = store.get('initial');
        initial.onsuccess = () => {
          if (!checkpoint.result || !initial.result) return result(null);
          store.put(info, 'info');
          result({ info, checkpoint: checkpoint.result, initial: initial.result });
        };
      };
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
    });
  }
}
