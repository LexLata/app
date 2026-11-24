// Speicherfehler dürfen Hilfsfenstereingaben und das offene Fenster nicht verlieren.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import KommentarFenster from '@/components/hilfsfenster/kommentar/KommentarFenster';
import VerweismarkierungFenster from '@/components/hilfsfenster/verweismarkierung/VerweismarkierungFenster';

import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { markierungsEinzelzugriffFuerTest } from '@/test/markierungen/markierungsEinzelzugriffFuerTest';

const { zustand, speichern, schliessen, bewusstSchliessen } = vi.hoisted(() => ({
  zustand: { werte: [] as unknown[], nummer: 0 },
  speichern: vi.fn(),
  schliessen: vi.fn(),
  bewusstSchliessen: vi.fn(),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: vi.fn(),
  useRef: (current: unknown) => ({ current }),
  useState: (anfang: unknown) => {
    const nummer = zustand.nummer++;
    if (!(nummer in zustand.werte)) zustand.werte[nummer] = anfang;
    return [
      zustand.werte[nummer],
      (wert: unknown) => {
        zustand.werte[nummer] = wert;
      },
    ];
  },
}));
vi.mock('@/lib/markierungen/markierungen.index', () => ({
  speichereVerweismarkierung: speichern,
  speichereKommentar: speichern,
  wiederholeMarkierungsUebertragung: vi.fn(),
  verwerfeMarkierungsUebertragung: vi.fn(),
}));
vi.mock('@/hooks/fenster/useSchliessenAnfrageSchliesstFenster', () => ({
  useSchliessenAnfrageSchliesstFenster: vi.fn(),
}));
vi.mock('@/hooks/fenster/useFensterSichtbarMachen', () => ({ useFensterSichtbarMachen: vi.fn() }));
vi.mock('@/hooks/einstellungen/useAppAkzentfarbe', () => ({ useAppAkzentfarbe: vi.fn() }));
vi.mock('@/hooks/fenster/useFensterEnterTaste', () => ({ useFensterEnterTaste: vi.fn() }));
vi.mock('@/hooks/fenster/useFensterSchliessenAbsichern', async (original) => ({
  ...(await original<typeof import('@/hooks/fenster/useFensterSchliessenAbsichern')>()),
  useFensterSchliessenAbsichern: () => ({
    bewusstSchliessen,
    bereit: true,
    schliessvorgangAktiv: false,
    istSchliessvorgangAktiv: () => false,
  }),
}));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ close: schliessen }) }));

beforeEach(() => {
  vi.clearAllMocks();
  zustand.nummer = -3;
  zustand.werte = [
    {
      kurztitel: 'TestG',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      openerLabel: 'main',
    },
    'Meine Eingabe',
    true,
    false,
  ];
  zustand.werte[-2] = { ladeGesetz: markierungsEinzelzugriffFuerTest };
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('Hilfsfenster bei Dateisperren-Wartefrist', () => {
  it.each([
    ['Kommentar', KommentarFenster],
    ['Verweis', VerweismarkierungFenster],
  ] as const)(
    '%s behält Eingabe und Fenster mit dem jeweiligen lokalen Meldungsweg',
    async (_art, Fenster) => {
      const original = 'Art.  1\tAbs. 1\n§ 9999';
      zustand.werte[1] = original;
      speichern.mockRejectedValue('wartefrist');
      const baum = Fenster();
      const formular = Array.isArray(baum.props.children)
        ? baum.props.children[0]
        : baum.props.children;
      formular.props.onFertig();
      await vi.waitFor(() => expect(zustand.werte[3]).toBe(false));
      expect(speichern).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(Function),
        original,
        true,
        ...(_art === 'Verweis' ? [expect.anything(), expect.anything(), expect.anything()] : []),
        expect.any(AbortSignal),
        expect.any(Function),
      );
      expect(zustand.werte[1]).toBe(original);
      expect(zustand.werte[4]).toEqual(
        _art === 'Kommentar'
          ? 'Die Datei wird noch bearbeitet. Bitte erneut versuchen.'
          : [{ art: 'sonst', text: 'Die Datei wird noch bearbeitet. Bitte erneut versuchen.' }],
      );
      expect(bewusstSchliessen).not.toHaveBeenCalled();
      expect(schliessen).not.toHaveBeenCalled();
    },
  );
});

it('bindet automatisch gewählte Verweisziele bis zur Änderung des Zitattexts', async () => {
  const ziel = { kurztitel: 'ZPO', normgeber: 'de-bund' };
  speichern.mockImplementation(
    async (
      _kontext,
      _ladeGesetz,
      _text,
      _textbezug,
      _ohneElementstand,
      _fehlgeschlagen,
      gewaehlt,
    ) => {
      gewaehlt.set('0', ziel);
      return { art: 'fehler', fehler: [{ art: 'gesetz', gesetz: ziel, text: 'ZPO fehlt' }] };
    },
  );
  const formular = VerweismarkierungFenster().props.children;
  await formular.props.onFertig();
  const ersteAuswahl = speichern.mock.calls[0]![6];
  expect(ersteAuswahl.get('0')).toEqual(ziel);

  await formular.props.onTrotzdemSpeichern();
  expect(speichern.mock.calls[1]![6]).toBe(ersteAuswahl);
  expect(speichern.mock.calls[1]![4]).toBe(true);
  expect(ersteAuswahl.get('0')).toEqual(ziel);

  formular.props.onZitatTextChange('§ 2 ZPO');
  expect(ersteAuswahl.size).toBe(0);
  expect(zustand.werte[1]).toBe('§ 2 ZPO');
});

vi.mock('@/hooks/markierungen/useVerweismarkierungUndKommentarHilfsfenster', () => ({
  useMarkierungsAusgangsstellePruefung: () => ({
    bezugErhalten: false,
    bezugPruefungLaeuft: false,
    bezugPrueffehler: null,
    aktionsFehler: null,
    warteAufAbschluss: async () => {},
  }),
}));
