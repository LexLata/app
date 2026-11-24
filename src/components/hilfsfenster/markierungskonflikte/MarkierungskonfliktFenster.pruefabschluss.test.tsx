// @vitest-environment jsdom
// Echte Integration von Fenster und Konfliktseitenleiste: Prüfabschluss und zusammenhängende Ladeergebnisse.
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { MarkierungskonfliktAnzeigeErgebnis } from '@/lib/markierungen/markierungen.index';
const m = vi.hoisted(() => ({
  laden: vi.fn(),
  moeglichkeit: vi.fn(),
  pruefen: vi.fn(),
  verknuepfen: vi.fn(),
  neuLaden: undefined as (() => void) | undefined,
}));
vi.mock('@/lib/markierungen/markierungen.index', () => ({
  ladeMarkierungskonflikteFuerAnzeige: m.laden,
  ermittleAktuelleVerknuepfungsMoeglichkeit: m.moeglichkeit,
  pruefeAlleMarkierungen: m.pruefen,
  verknuepfeMitAktuellenNormen: m.verknuepfen,
  ermittleFehlendeGesetze: () => [],
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (_name: string, callback: () => void) => {
    m.neuLaden = callback;
    return () => {};
  },
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ setTitle: async () => {} }),
}));
vi.mock('@/hooks/fenster/useSchliessenAnfrageSchliesstFenster', () => ({
  useSchliessenAnfrageSchliesstFenster: () => {},
}));
vi.mock('@/hooks/fenster/useFensterSichtbarMachen', () => ({ useFensterSichtbarMachen: () => {} }));
vi.mock('@/hooks/einstellungen/useAppAkzentfarbe', () => ({ useAppAkzentfarbe: () => {} }));
vi.mock('@/hooks/einstellungen/UiGroesseProvider', () => ({ UiGroesseProvider: 'div' }));
vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({
  useUiSkalierungsFaktor: () => 1,
}));
vi.mock('@/hooks/stil/useTextRollen', () => ({
  useIconGroessen: () => ({ standard: 16 }),
  useTextRollen: () => ({}),
}));
vi.mock('@/hooks/stil/useButtonRollen', () => ({
  useButtonRollen: () => ({
    sekundaerKompakt: () => ({}),
    paddingFaktorKompakt: () => '5px 8px',
  }),
}));
vi.mock('./KonfliktListe', () => ({
  GesetzZeile: () => <div>Konfliktliste</div>,
}));
import Fenster from './MarkierungskonfliktFenster';
let root: Root;
let container: HTMLDivElement;
const bestand: MarkierungskonfliktAnzeigeErgebnis = {
  pruefstatus: 'aktuell',
  gesetze: [
    { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), fehlendesGesetz: true, eintraege: [] },
  ],
};
function offen<T>() {
  let resolve!: (wert: T) => void;
  let reject!: (fehler: Error) => void;
  const promise = new Promise<T>((ja, nein) => {
    resolve = ja;
    reject = nein;
  });
  return { promise, resolve, reject };
}
function button(text: string) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent === text);
}
beforeEach(async () => {
  // Browser-Geometrie als externe Grenze; diese Tests beginnen nach der Erklärung.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  localStorage.setItem('lexlata.markierungskonfliktErklaerungGelesen', 'true');
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  m.laden.mockImplementation(async () => structuredClone(bestand));
  m.moeglichkeit.mockResolvedValue({ moeglich: true, fehler: [] });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Fenster />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it('zeigt den Haken erst nach dem Neuladen und der fertigen Ermittlung des Angebots', async () => {
  const laden = offen<MarkierungskonfliktAnzeigeErgebnis>();
  const angebot = offen<{ moeglich: boolean; fehler: [] }>();
  m.laden.mockReturnValue(laden.promise);
  m.moeglichkeit.mockReturnValue(angebot.promise);
  m.pruefen.mockImplementation(async () => m.neuLaden!());
  await act(async () => button('Alle Markierungen neu prüfen')!.click());
  expect(button('Prüfung durchgeführt ✓')).toBeUndefined();
  expect(button('Prüfung läuft …')?.disabled).toBe(true);
  await act(async () => laden.resolve(structuredClone(bestand)));
  expect(button('Prüfung durchgeführt ✓')).toBeUndefined();
  await act(async () => angebot.resolve({ moeglich: true, fehler: [] }));
  expect(button('Prüfung durchgeführt ✓')).toBeDefined();
  expect(button('Mit aktuellen Normen verknüpfen')?.disabled).toBe(false);
});
it('behält den Verknüpfungsbutton beim Nachladen bis Liste und Angebot gemeinsam bereit sind', async () => {
  const vorher = button('Mit aktuellen Normen verknüpfen');
  expect(vorher).toBeDefined();
  const angebot = offen<{ moeglich: boolean; fehler: [] }>();
  m.moeglichkeit.mockReturnValue(angebot.promise);
  await act(async () => m.neuLaden!());
  expect(button('Mit aktuellen Normen verknüpfen')).toBe(vorher);
  expect(vorher!.disabled).toBe(true);
  await act(async () => angebot.resolve({ moeglich: true, fehler: [] }));
  expect(button('Mit aktuellen Normen verknüpfen')).toBe(vorher);
  expect(vorher!.disabled).toBe(false);
});

it.each(['Ergebnis', 'Fehler'] as const)(
  'bündelt gleichzeitige Auslöser und verwirft überholtes %s',
  async (art) => {
    const vorher = button('Mit aktuellen Normen verknüpfen');
    const alt = offen<MarkierungskonfliktAnzeigeErgebnis>();
    m.laden.mockReturnValueOnce(alt.promise).mockResolvedValueOnce(structuredClone(bestand));
    await act(async () => {
      m.neuLaden!();
      m.neuLaden!();
      m.neuLaden!();
    });
    expect(m.laden).toHaveBeenCalledTimes(2); // Erstöffnung und ein laufender Auftrag.
    await act(async () => {
      if (art === 'Ergebnis') alt.resolve({ pruefstatus: 'aktuell', gesetze: [] });
      else alt.reject(new Error('überholter Lesefehler'));
    });
    expect(m.laden).toHaveBeenCalledTimes(3); // Ein gemeinsamer Nachlauf für beide weiteren Auslöser.
    expect(m.moeglichkeit).toHaveBeenCalledTimes(2);
    expect(m.moeglichkeit).toHaveBeenLastCalledWith(bestand.gesetze, expect.any(Function));
    expect(button('Mit aktuellen Normen verknüpfen')).toBe(vorher);
    expect(container.textContent).not.toContain('Keine Markierungskonflikte vorhanden.');
    expect(container.textContent).not.toContain('konnten nicht geladen werden');
  },
);

it.each(['Ergebnis', 'Fehler'] as const)(
  'verwirft überholtes Angebots-%s und wartet mit dem Prüfabschluss auf den Nachlauf',
  async (art) => {
    const vorher = button('Mit aktuellen Normen verknüpfen');
    const alt = offen<{ moeglich: boolean; fehler: [] }>();
    const frisch = offen<{ moeglich: boolean; fehler: [] }>();
    const melden = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      m.laden
        .mockResolvedValueOnce({ pruefstatus: 'aktuell', gesetze: [] })
        .mockResolvedValueOnce(structuredClone(bestand));
      m.moeglichkeit.mockReturnValueOnce(alt.promise).mockReturnValueOnce(frisch.promise);
      await act(async () => button('Alle Markierungen neu prüfen')!.click());
      expect(m.moeglichkeit).toHaveBeenCalledTimes(2);
      expect(m.moeglichkeit).toHaveBeenLastCalledWith([], expect.any(Function));
      await act(async () => {
        m.neuLaden!();
        m.neuLaden!();
      });
      expect(m.laden).toHaveBeenCalledTimes(2);
      await act(async () => {
        if (art === 'Ergebnis') alt.resolve({ moeglich: false, fehler: [] });
        else alt.reject(new Error('überholter Angebotsfehler'));
      });
      expect(m.laden).toHaveBeenCalledTimes(3);
      expect(m.moeglichkeit).toHaveBeenCalledTimes(3);
      expect(m.moeglichkeit).toHaveBeenLastCalledWith(bestand.gesetze, expect.any(Function));
      expect(button('Mit aktuellen Normen verknüpfen')).toBe(vorher);
      expect(vorher!.disabled).toBe(true);
      expect(button('Prüfung läuft …')?.disabled).toBe(true);
      expect(button('Prüfung durchgeführt ✓')).toBeUndefined();
      expect(container.textContent).toContain('Konfliktliste');
      expect(container.textContent).not.toContain('Keine Markierungskonflikte vorhanden.');
      expect(container.textContent).not.toContain('konnten nicht geladen werden');
      await act(async () => frisch.resolve({ moeglich: true, fehler: [] }));
      expect(button('Mit aktuellen Normen verknüpfen')).toBe(vorher);
      expect(vorher!.disabled).toBe(false);
      expect(button('Prüfung durchgeführt ✓')).toBeDefined();
    } finally {
      melden.mockRestore();
    }
  },
);

it.each(['Liste', 'Angebot'] as const)(
  'bestätigt nach gescheiterter Aktualisierung von %s keinen Prüfabschluss',
  async (teil) => {
    const fehler = new Error('unlesbar');
    const melden = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      if (teil === 'Liste') m.laden.mockRejectedValue(fehler);
      else m.moeglichkeit.mockRejectedValue(fehler);
      await act(async () => button('Alle Markierungen neu prüfen')!.click());
      expect(button('Prüfung durchgeführt ✓')).toBeUndefined();
      expect(container.textContent).toContain(
        'Die Markierungen konnten nicht vollständig geprüft werden.',
      );
      expect(container.textContent).toContain(
        teil === 'Liste'
          ? 'Die Markierungskonflikte konnten nicht geladen werden.'
          : 'Die Verknüpfungsmöglichkeiten konnten nicht geladen werden.',
      );
      expect(button('Alle Markierungen neu prüfen')!.disabled).toBe(false);
    } finally {
      melden.mockRestore();
    }
  },
);

const erklaerung =
  'Diese Aktion aktualisiert nur Verknüpfungen von Verweisen und Kommentaren, die sich auf die gesamte Norm beziehen, sowie Verknüpfungen zu Zielnormen, die in den Gesetzen auf dem Gerät vorhanden sind. Konflikte an spezifischen Textstellen müssen einzeln geprüft werden.';
const erfolgreicheVerknuepfung = {
  zahlen: { elementstaende: 2, verweisziele: 4, markierungen: 5 },
  gesetze: [],
  fehler: [],
  unbearbeiteteGesetze: [],
};
it.each([
  { verknuepfung: 'Erfolg', pruefabschluss: 'Erfolg' },
  { verknuepfung: 'Erfolg', pruefabschluss: 'Fehler' },
  { verknuepfung: 'unerwarteter Fehler', pruefabschluss: 'Erfolg' },
  { verknuepfung: 'unerwarteter Fehler', pruefabschluss: 'Fehler' },
] as const)(
  'behält Rückmeldung und Fragezeichen nach Verknüpfung mit $verknuepfung bei erneuter Prüfung mit $pruefabschluss gemeinsam',
  async ({ verknuepfung, pruefabschluss }) => {
    const melden = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      if (verknuepfung === 'Erfolg') m.verknuepfen.mockResolvedValue(erfolgreicheVerknuepfung);
      else m.verknuepfen.mockRejectedValue(new Error('Schreiben'));
      const rueckmeldung =
        verknuepfung === 'Erfolg'
          ? '2 Elementstände und 4 Zielnormen in 5 Markierungen neu verknüpft.'
          : 'Die Aktion konnte nicht vollständig gespeichert werden.';
      await act(async () => button('Mit aktuellen Normen verknüpfen')!.click());
      const hilfe = container.querySelector<HTMLButtonElement>(
        '[aria-label="Erklärung zur allgemeinen Verknüpfung"]',
      )!;
      expect(container.textContent).toContain(rueckmeldung);
      expect(hilfe).not.toBeNull();
      const pruefung = offen<void>();
      m.pruefen.mockReturnValue(pruefung.promise);
      await act(async () => button('Alle Markierungen neu prüfen')!.click());
      expect(container.textContent).toContain(rueckmeldung);
      expect(container.querySelector('[aria-label="Erklärung zur allgemeinen Verknüpfung"]')).toBe(
        hilfe,
      );
      await act(async () => {
        if (pruefabschluss === 'Erfolg') pruefung.resolve(undefined);
        else pruefung.reject(new Error('Prüfung fehlgeschlagen'));
      });
      expect(container.textContent).toContain(rueckmeldung);
      expect(container.querySelector('[aria-label="Erklärung zur allgemeinen Verknüpfung"]')).toBe(
        hilfe,
      );
      expect(
        container.querySelectorAll('[aria-label="Erklärung zur allgemeinen Verknüpfung"]'),
      ).toHaveLength(1);
      await act(async () => hilfe.click());
      expect(container.querySelector('[role="tooltip"]')!.textContent).toBe(erklaerung);
    } finally {
      melden.mockRestore();
    }
  },
);
it('zeigt die allgemeine Erklärung vor der Aktion nur als Button-Tooltip', () => {
  expect(button('Mit aktuellen Normen verknüpfen')!.title).toBe(
    'Aktualisiert Verknüpfungen von Verweisen und Kommentaren, die sich auf die gesamte Norm beziehen, sowie Verknüpfungen zu Zielnormen, die in den Gesetzen auf dem Gerät vorhanden sind. Konflikte an spezifischen Textstellen müssen einzeln geprüft werden.',
  );
  expect(container.textContent).not.toContain('Konflikte an spezifischen Textstellen');
  expect(
    container.querySelector('[aria-label="Erklärung zur allgemeinen Verknüpfung"]'),
  ).toBeNull();
});
it.each(['Hover', 'Fokus', 'Klick'] as const)(
  'öffnet die Rückmeldungshilfe mit %s und schließt mit Escape',
  async (art) => {
    m.verknuepfen.mockResolvedValue(erfolgreicheVerknuepfung);
    await act(async () => button('Mit aktuellen Normen verknüpfen')!.click());
    const hilfe = container.querySelector<HTMLButtonElement>(
      '[aria-label="Erklärung zur allgemeinen Verknüpfung"]',
    )!;
    expect(hilfe).not.toBeNull();
    expect(container.textContent).toContain(
      '2 Elementstände und 4 Zielnormen in 5 Markierungen neu verknüpft.',
    );
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
    await act(async () => {
      if (art === 'Hover') hilfe.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      else if (art === 'Fokus') hilfe.focus();
      else hilfe.click();
    });
    expect(container.querySelector('[role="tooltip"]')!.textContent).toBe(erklaerung);
    if (art === 'Hover') {
      const tooltip = container.querySelector('[role="tooltip"]')!;
      await act(async () =>
        hilfe.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: tooltip })),
      );
      expect(container.querySelector('[role="tooltip"]')).not.toBeNull();
    }
    const fensterEscape = vi.fn();
    window.addEventListener('keydown', fensterEscape);
    await act(async () =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(fensterEscape).not.toHaveBeenCalled();
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
    await act(async () =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(fensterEscape).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', fensterEscape);
    expect(m.verknuepfen).toHaveBeenCalledTimes(1);
  },
);

it.each(['Teilfehler', 'unerwarteter Fehler'] as const)(
  'erhält Erklärung und konkrete Fehlerrückmeldung bei allgemeinem %s',
  async (art) => {
    const melden = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      if (art === 'Teilfehler')
        m.verknuepfen.mockResolvedValue({
          zahlen: { elementstaende: 1, verweisziele: 0, markierungen: 1 },
          gesetze: [],
          fehler: [
            { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), fehler: new Error('Prüfabschluss') },
          ],
          unbearbeiteteGesetze: [],
        });
      else m.verknuepfen.mockRejectedValue(new Error('Schreiben'));
      await act(async () => button('Mit aktuellen Normen verknüpfen')!.click());
      expect(container.textContent).toContain(
        art === 'Teilfehler'
          ? 'Bereits gespeicherte Änderungen bleiben erhalten.'
          : 'Die Aktion konnte nicht vollständig gespeichert werden.',
      );
      const hilfe = container.querySelector<HTMLButtonElement>(
        '[aria-label="Erklärung zur allgemeinen Verknüpfung"]',
      )!;
      expect(hilfe).not.toBeNull();
      await act(async () => hilfe.click());
      expect(container.querySelector('[role="tooltip"]')!.textContent).toBe(erklaerung);
    } finally {
      melden.mockRestore();
    }
  },
);
