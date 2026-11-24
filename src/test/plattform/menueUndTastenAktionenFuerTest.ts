// Gemeinsame beobachtbare Aktionen für Menü- und Tastenkürzeltests.
import { vi } from 'vitest';

export function menueUndTastenAktionenFuerTest() {
  return {
    setAktivesOverlay: vi.fn(),
    setOeffnenOverlayInitial: vi.fn(),
    handleExportOeffnen: vi.fn(),
    tabOderFensterSchliessen: vi.fn(),
    fensterSchliessen: vi.fn(),
    handleFavoritSpeichern: vi.fn(),
    handleLesezeichenSpeichern: vi.fn(),
    handleAlleLesezeichenEntfernen: vi.fn(),
    handleUnterstreichen: vi.fn(),
    handleHervorheben: vi.fn(),
    handleVerweismarkierungAnfrage: vi.fn(),
    handleKommentarAnfrage: vi.fn(),
    handleMarkierungRueckgaengig: vi.fn(),
    handleMarkierungWiederholen: vi.fn(),
    erstelleLeerenTab: vi.fn(),
    tabWiederherstellen: vi.fn(),
    handleDateiImportAnfrage: vi.fn(),
  };
}
