// Binary project files (images): the bytes live in IndexedDB, content-addressed
// by SHA-256, and the project file only keeps a reference (ProjectFile.asset).
// Content addressing means duplicating a file or project shares the blob and
// deleting one never breaks another; unreferenced blobs are swept by gcAssets().

/** Where blobs are kept; swapped for an in-memory map in tests. */
export interface AssetBackend {
  get(hash: string): Promise<Uint8Array | undefined>;
  put(hash: string, bytes: Uint8Array): Promise<void>;
  keys(): Promise<string[]>;
  delete(hash: string): Promise<void>;
}

const DB_NAME = "b2op-assets";
const STORE = "blobs";

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => { dbPromise = null; reject(open.error); };
  });
  return dbPromise;
}

async function store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return (await db()).transaction(STORE, mode).objectStore(STORE);
}

export const indexedDbBackend: AssetBackend = {
  async get(hash) {
    const v = await req((await store("readonly")).get(hash)) as Uint8Array | ArrayBuffer | undefined;
    return v === undefined ? undefined : v instanceof Uint8Array ? v : new Uint8Array(v);
  },
  async put(hash, bytes) { await req((await store("readwrite")).put(bytes, hash)); },
  async keys() { return (await req((await store("readonly")).getAllKeys())).map(String); },
  async delete(hash) { await req((await store("readwrite")).delete(hash)); },
};

let backend: AssetBackend = indexedDbBackend;

/** Replace the storage (tests). */
export function setAssetBackend(b: AssetBackend): void {
  backend = b;
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
}

/** In-memory backend (tests, or when IndexedDB is unavailable). */
export function memoryAssetBackend(): AssetBackend {
  const m = new Map<string, Uint8Array>();
  return {
    get: async (h) => m.get(h),
    put: async (h, b) => { m.set(h, b); },
    keys: async () => [...m.keys()],
    delete: async (h) => { m.delete(h); },
  };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Store bytes; returns their hash (the asset id). */
export async function putAsset(bytes: Uint8Array): Promise<string> {
  const hash = await sha256Hex(bytes);
  await backend.put(hash, bytes);
  return hash;
}

export function getAssetBytes(hash: string): Promise<Uint8Array | undefined> {
  return backend.get(hash);
}

const urls = new Map<string, string>();

/** Object URL of an asset (cached for the session); undefined when the blob is missing. */
export async function assetUrl(hash: string, type: string): Promise<string | undefined> {
  const cached = urls.get(hash);
  if (cached) return cached;
  const bytes = await backend.get(hash);
  if (!bytes) return undefined;
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  urls.set(hash, url);
  return url;
}

/** Delete every blob not in `referenced`. Returns how many went. */
export async function gcAssets(referenced: ReadonlySet<string>): Promise<number> {
  let n = 0;
  for (const k of await backend.keys()) {
    if (referenced.has(k)) continue;
    await backend.delete(k);
    n++;
  }
  return n;
}

/** Bytes of every binary file of a project and of the images they were made from, by hash (missing blobs are left out). */
export async function loadProjectAssets(files: readonly { asset?: { hash: string; source?: { hash: string } } }[]): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  for (const f of files) {
    for (const h of [f.asset?.hash, f.asset?.source?.hash]) {
      if (!h || out.has(h)) continue;
      const b = await backend.get(h);
      if (b) out.set(h, b);
    }
  }
  return out;
}

/** Put already-hashed bytes into the store (e.g. from a zip import). */
export async function storeAssets(assets: ReadonlyMap<string, Uint8Array>): Promise<void> {
  for (const [hash, bytes] of assets) await backend.put(hash, bytes);
}
