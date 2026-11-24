// drittlizenzen-aktuell.mjs
// Aufruf: npm run pruefen:drittlizenzen – prüft, ob THIRD-PARTY-LICENSES zum installierten
// Stand passt: npm-Laufzeitpakete (Name, Version, Lizenz) exakt, Rust-Crates über den
// Fingerabdruck von src-tauri/Cargo.lock. Schnell und ohne cargo-about lauffähig.
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const { drittlizenzenAbweichungen, EIGENES_CRATE } = await tsImport(
  '../werkzeuge/drittlizenzenAblauf.ts',
  import.meta.url,
);
const wurzel = fileURLToPath(new URL('../..', import.meta.url));

const abweichungen = drittlizenzenAbweichungen(wurzel, EIGENES_CRATE);
if (abweichungen.length > 0) {
  console.error('❌ THIRD-PARTY-LICENSES ist nicht aktuell:');
  for (const abweichung of abweichungen) console.error(`  ${abweichung}`);
  console.error('Abhilfe: npm run drittlizenzen ausführen (Release-Schritt, braucht cargo-about).');
  process.exit(1);
}
console.log('THIRD-PARTY-LICENSES ist aktuell.');
