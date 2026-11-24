// EinstellungenZeile.tsx
// Gemeinsame Zeile "Label links, Control rechts" für Einstellungen-
// Abschnitte (Dropdown, FarbAuswahlDropdown, o.ä.) – siehe Absprache
// Zeilenabstand-Vereinheitlichung. Ersetzt den zuvor 14× wortgleich
// kopierten Wrapper-Div (display: flex, justifyContent: space-between,
// alignItems: center) in AllgemeinAbschnitt.tsx, GesetzestextAbschnitt.tsx,
// WerkzeugeAbschnitt.tsx, ErweitertAbschnitt.tsx, SeitenleistenAbschnitt.tsx,
// HervorhebungsfarbeAbschnitt.tsx.
//
// label ist bewusst ReactElement statt reinem String: deckt damit auch den
// Sonderfall "Lesbare Zeilenlänge" in GesetzestextAbschnitt.tsx ab
// (Checkbox+Text als linker Teil, Select als rechter Teil), ohne dass diese
// eine Zeile als Ausnahme aus dem gemeinsamen Muster herausfallen müsste
// (siehe Absprache).
//
// marginTop als expliziter Zahlen-Prop (nicht als bloßes ersteZeile-
// Boolean): manche Zeilen brauchen einen abweichenden Wert (z. B. 0 direkt
// nach einer Abschnitts-Überschrift oder als erste Zeile im Abschnitt) –
// explizit statt eines zweiten, verdeckten Sonderfalls.
//
// Reine Layout-Zeile: die Select-/FarbAuswahlDropdown-Gestaltung selbst
// (dropdownPadding(), Rahmen, Hintergrund) bleibt bewusst an der jeweiligen
// Verwendungsstelle – diese Komponente kennt nur die äußere Anordnung.
import type { ReactElement } from 'react';

interface EinstellungenZeileProps {
  label: ReactElement;
  children: ReactElement;
  marginTop?: number;
}

export function EinstellungenZeile({ label, children, marginTop = 10 }: EinstellungenZeileProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop,
      }}
    >
      {label}
      {children}
    </div>
  );
}
