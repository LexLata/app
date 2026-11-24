// schriften.ts
// Mitgelieferte Serifenschrift Source Serif 4 (Adobe, SIL Open Font License; Lizenztext in
// src/lib/stil/schriftdateien). Vollständige Originaldateien: nur sie enthalten echte Hochziffern
// („sups“); die Google-Fonts-Fassungen haben sie entfernt.

import normal from './schriftdateien/SourceSerif4Variable-Roman.ttf.woff2?url';
import kursiv from './schriftdateien/SourceSerif4Variable-Italic.ttf.woff2?url';

const SCHRIFTDATEIEN = [
  ['normal', normal],
  ['italic', kursiv],
] as const;

/** Meldet die mitgelieferte Schrift beim Dokument an. Die Dateien werden erst geladen,
 *  wenn Text sie braucht oder `document.fonts.load` sie anfordert. Lokal ausgeliefert:
 *  kein Netzzugriff, auf allen Plattformen identisches Schriftbild. */
export function registriereSchriften(): void {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return;
  for (const [stil, url] of SCHRIFTDATEIEN) {
    document.fonts.add(
      new FontFace('Source Serif 4', `url(${url}) format('woff2')`, {
        style: stil,
        weight: '200 900',
      }),
    );
  }
}
