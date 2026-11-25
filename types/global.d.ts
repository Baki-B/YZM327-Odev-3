// Tür denetleyicisi (tsc --checkJs) için genel bildirimler. Çalışan koda girmez.
export {};

declare global {
  interface Window {
    /** Atölyenin test ve hata ayıklama kancası (web/app.js). */
    __atolye: any;
    /** Güvenlik denetiminde (scripts/arayuz-denetimi.js) betik çalışırsa kurulacak işaretler. */
    __xss?: unknown;
    __inline?: unknown;
  }
}
