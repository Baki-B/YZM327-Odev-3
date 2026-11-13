// Atölyenin Agora örneğini (web/data/agora.json) gerçek dosyalar olarak ornek-agora/ klasörüne açar.
// Komut satırıyla karşılaştırma (scripts/paketler.js, scripts/arayuz-denetimi.js) bu klasörü tarar;
// böylece proje, Agora'nın kaynak kodu yanında olmadan da aynı veriyle denetlenebilir.
// Kullanım (proje kökünden): node scripts/agora-ac.js   → ornek-agora/forum/...
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const AGORA_DIR = 'ornek-agora';

export function agoraKlasoru() {
  const target = join(ROOT, AGORA_DIR);
  rmSync(target, { recursive: true, force: true });
  const files = JSON.parse(readFileSync(join(ROOT, 'web/data/agora.json'), 'utf8'));
  for (const f of files) {
    const p = join(target, f.path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, f.text);
  }
  return { dir: target, count: files.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { count } = agoraKlasoru();
  console.log(`${count} dosya → ${AGORA_DIR}/`);
}
