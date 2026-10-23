// Everything the app keeps lives in one IndexedDB database:
//   games    library entries (metadata only)
//   roms     ROM bytes, keyed by game id
//   saves    battery saves (.sav), keyed by game id
//   settings small key/value preferences
const DB_NAME = 'gba-link';
const DB_VERSION = 1;

let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('games', { keyPath: 'id' });
        db.createObjectStore('roms');
        db.createObjectStore('saves');
        db.createObjectStore('settings');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    Promise.resolve(fn(tx)).then((r) => { result = r; });
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transação cancelada'));
  });
}

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const db = {
  listGames() {
    return run('games', 'readonly', (tx) => req(tx.objectStore('games').getAll()));
  },
  getGame(id) {
    return run('games', 'readonly', (tx) => req(tx.objectStore('games').get(id)));
  },
  putGame(game) {
    return run('games', 'readwrite', (tx) => { tx.objectStore('games').put(game); });
  },
  addGame(game, rom) {
    return run(['games', 'roms'], 'readwrite', (tx) => {
      tx.objectStore('games').put(game);
      tx.objectStore('roms').put(rom, game.id);
    });
  },
  deleteGame(id) {
    return run(['games', 'roms', 'saves'], 'readwrite', (tx) => {
      tx.objectStore('games').delete(id);
      tx.objectStore('roms').delete(id);
      tx.objectStore('saves').delete(id);
    });
  },
  getRom(id) {
    return run('roms', 'readonly', (tx) => req(tx.objectStore('roms').get(id)));
  },
  getSave(id) {
    return run('saves', 'readonly', (tx) => req(tx.objectStore('saves').get(id)));
  },
  putSave(id, data) {
    return run('saves', 'readwrite', (tx) => { tx.objectStore('saves').put(data, id); });
  },
  getSetting(key, fallback) {
    return run('settings', 'readonly', (tx) => req(tx.objectStore('settings').get(key)))
      .then((v) => (v === undefined ? fallback : v));
  },
  putSetting(key, value) {
    return run('settings', 'readwrite', (tx) => { tx.objectStore('settings').put(value, key); });
  },
};
