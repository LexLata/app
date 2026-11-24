// eingabeAktionen.types.ts
// Beschreibt die Aktionen, die Menü und Tastenkürzel gemeinsam auslösen.

import type { Dispatch, SetStateAction } from 'react';
import type { AktivesOverlay } from '@/lib/domain/appTypes';

/** Aktionen, die natives Menü und Tastenkürzel gemeinsam auslösen. */
export interface MenueUndTastenAktionen {
  setAktivesOverlay: Dispatch<SetStateAction<AktivesOverlay | null>>;
  setOeffnenOverlayInitial: Dispatch<SetStateAction<string>>;
  handleExportOeffnen: () => void;
  tabOderFensterSchliessen: () => void;
  fensterSchliessen: () => void;
  handleFavoritSpeichern: () => void;
  handleLesezeichenSpeichern: () => void;
  handleAlleLesezeichenEntfernen: () => void;
  handleUnterstreichen: () => void;
  handleHervorheben: () => void;
  handleVerweismarkierungAnfrage: () => void;
  handleKommentarAnfrage: () => void;
  handleMarkierungRueckgaengig: () => void;
  handleMarkierungWiederholen: () => void;
  erstelleLeerenTab: () => void;
  tabWiederherstellen: () => void;
  handleDateiImportAnfrage: () => void;
}
