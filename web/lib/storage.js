// Tarayıcı deposu: tema tercihi ve son iş akışının otomatik kaydı.
// localStorage gizli pencerede ya da engellendiğinde hata verebilir; her erişim sarmalanır
// ve depo yoksa atölye kayıtsız çalışır. Depo dışarıdan verilebilir (testlerde sahte depo).

/**
 * @param {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null} [store]
 */
export function createStorage(store = safeLocalStorage()) {
  return {
    get(key) {
      try { return store ? store.getItem(key) : null; } catch { return null; }
    },
    set(key, value) {
      try { store?.setItem(key, value); return Boolean(store); } catch { return false; }
    },
    remove(key) {
      try { store?.removeItem(key); } catch { /* yok say */ }
    },
  };
}

function safeLocalStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/**
 * Art arda çağrıları birleştirip son çağrıdan "ms" sonra bir kez çalıştırır (otomatik kayıt).
 * @param {() => void} fn
 * @param {number} ms
 * @param {{ setTimeout: typeof setTimeout, clearTimeout: typeof clearTimeout }} [timers]
 */
export function debounce(fn, ms, timers = globalThis) {
  let t = null;
  const run = () => { t = null; fn(); };
  const call = () => {
    if (t !== null) timers.clearTimeout(t);
    t = timers.setTimeout(run, ms);
  };
  call.flush = () => {
    if (t !== null) { timers.clearTimeout(t); run(); }
  };
  return call;
}

export const KEYS = { theme: 'kba-tema', autosave: 'kba-son-is-akisi' };
