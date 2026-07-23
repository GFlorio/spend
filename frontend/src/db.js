/**
 * Single storage boundary over raw IndexedDB.
 */

const DB_NAME = 'spend';
const DB_VERSION = 2;

/** store name -> index definitions [indexName, keyPath] */
const STORES = {
  envelopes: [],
  months: [],
  billSeries: [],
  billOccurrences: [['by_month', 'monthKey'], ['by_series', 'seriesId']],
  activities: [['by_month', 'monthKey']],
};

/** @type {Promise<IDBDatabase>|null} */
let dbPromise = null;

function openDB() {
  if (dbPromise) { return dbPromise; }
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      for (const name of Array.from(database.objectStoreNames)) {
        database.deleteObjectStore(name);
      }
      for (const [name, indexes] of Object.entries(STORES)) {
        const store = database.createObjectStore(name, { keyPath: 'id' });
        for (const [indexName, keyPath] of indexes) { store.createIndex(indexName, keyPath); }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/**
 * @param {IDBRequest} req
 * @returns {Promise<any>}
 */
function toPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * @param {string} store
 * @param {IDBTransactionMode} mode
 * @returns {Promise<IDBObjectStore>}
 */
async function objectStore(store, mode) {
  const database = await openDB();
  return database.transaction(store, mode).objectStore(store);
}

/**
 * @param {string} store
 * @param {IDBValidKey} key
 * @returns {Promise<any>}
 */
export async function get(store, key) {
  return toPromise((await objectStore(store, 'readonly')).get(key));
}

/**
 * @param {string} store
 * @returns {Promise<any[]>}
 */
export async function getAll(store) {
  return toPromise((await objectStore(store, 'readonly')).getAll());
}

/**
 * @param {string} store
 * @param {string} index
 * @param {IDBValidKey} key
 * @returns {Promise<any[]>}
 */
export async function getAllByIndex(store, index, key) {
  return toPromise((await objectStore(store, 'readonly')).index(index).getAll(key));
}

/**
 * @param {string} store
 * @param {{ id:string, [key:string]:any }} val record with a string id
 * @returns {Promise<string>} the record id
 */
export async function put(store, val) {
  await toPromise((await objectStore(store, 'readwrite')).put(val));
  return val.id;
}

/**
 * @param {string} store
 * @param {IDBValidKey} key
 * @returns {Promise<void>}
 */
export async function del(store, key) {
  await toPromise((await objectStore(store, 'readwrite')).delete(key));
}

/** Closes and deletes the database. @returns {Promise<void>} */
export async function resetDB() {
  if (dbPromise) { (await dbPromise).close(); dbPromise = null; }
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve(undefined);
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(undefined);
  });
}

/**
 * Serialises every store. Import is added in Slice 3.
 * @returns {Promise<{version:number, exportedAt:string, envelopes:any[], months:any[], billSeries:any[], billOccurrences:any[], activities:any[]}>}
 */
export async function exportDB() {
  const [envelopes, months, billSeries, billOccurrences, activities] = await Promise.all([
    getAll('envelopes'), getAll('months'), getAll('billSeries'), getAll('billOccurrences'), getAll('activities'),
  ]);
  return { version: 2, exportedAt: new Date().toISOString(), envelopes, months, billSeries, billOccurrences, activities };
}

// Test seam for E2E: seed IndexedDB without the UI.
if (typeof window !== 'undefined') {
  /** @type {any} */ (window).__testDB = { reset: resetDB, put, getAll };
}
