// tastenkuerzelFormat.ts
//
// Zentraler Formatter für die Anzeige von Tastenkürzeln in Tooltips und
// Hinweistexten (NICHT für die native Menüleiste – die ist ohnehin nur auf
// macOS sichtbar und bekommt ihre Beschriftung direkt vom Betriebssystem,
// siehe menu.rs). macOS zeigt Tastenkürzel als Symbole mit schmalen geschützten
// Leerzeichen und in der Reihenfolge Option–Shift–Command (⌥ ⇧ ⌘ S),
// Windows/Linux als ausgeschriebene, mit "+" verbundene
// Namen (Alt+Umschalt+S). Siehe useKlappstufenNavigation.ts u.a. für die
// analoge, aber vom Nutzer editierbare Gesetzeskurzbefehl-Zuordnung in gesetzeskurzbefehlSpeicher.ts
// – dort geht es um Persistierung/Matching, hier nur um Anzeige.

interface TastenkuerzelTeile {
  ctrl?: boolean; // ⌃ (Mac) / Strg (Win/Linux)
  meta?: boolean; // ⌘ (Mac) / Strg (Win/Linux)
  alt?: boolean; // ⌥ (Mac) / Alt (Win/Linux)
  shift?: boolean; // ⇧ (Mac) / Umschalt (Win/Linux)
  /** Kern-Taste in der auf macOS gezeigten Form, z. B. "S", "1", "←", "↩". */
  taste: string;
  /** Abweichende Darstellung der Kern-Taste für Windows/Linux, falls die
   *  Mac-Form dort unüblich/unverständlich wäre (z. B. "↩" → "Enter").
   *  Default: identisch zu `taste`. */
  tasteWinLinux?: string;
}

/** Formatiert eine Tastenkombination für die Anzeige in Tooltips o. Ä. –
 *  siehe Konventionsbeschreibung oben. `istMac` kommt üblicherweise aus
 *  usePlattform() (siehe src/hooks/usePlattform.ts). */
export function formatTastenkuerzel(istMac: boolean, teile: TastenkuerzelTeile): string {
  if (istMac) {
    return [
      teile.ctrl ? '⌃' : '',
      teile.alt ? '⌥' : '',
      teile.shift ? '⇧' : '',
      teile.meta ? '⌘' : '',
      teile.taste,
    ]
      .filter(Boolean)
      .join('\u202f');
  }
  const modifikatoren: string[] = [];
  if (teile.meta || teile.ctrl) modifikatoren.push('Strg');
  if (teile.alt) modifikatoren.push('Alt');
  if (teile.shift) modifikatoren.push('Umschalt');
  modifikatoren.push(teile.tasteWinLinux ?? teile.taste);
  return modifikatoren.join('+');
}
