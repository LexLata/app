// @vitest-environment jsdom
// Der Suchtextzugriff benutzt die echte Ladepipeline ohne zusätzliche gehaltene Darstellungen.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { beforeEach, expect, it, vi } from 'vitest';
import { erzeugeGeladeneGesetze } from '@/lib/gesetz-laden/gesetz-laden.index';
const referenz = { kurztitel: 'A', normgeber: 'de-bund' };
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  io.dateien.set(
    'gesetze/A_de-bund.xml',
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>A</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><titel>Test</titel><text><absatz><satz>Text</satz></absatz></text></norm></inhalt></gesetz>',
  );
});
it('gibt ausschließlich für Suchtext geladene Darstellungen frei', async () => {
  const bestand = erzeugeGeladeneGesetze();
  try {
    expect(await bestand.ladeGesetz(referenz, undefined, { behalten: false })).toMatchObject({
      status: 'geladen',
    });
    expect(bestand.holeGeladenes(referenz)).toBeUndefined();
  } finally {
    bestand.beenden();
  }
});
it.each(['vorher', 'parallel', 'tab'] as const)(
  'erhält Schutz durch %s normalen Zugriff oder Tab',
  async (art) => {
    const bestand = erzeugeGeladeneGesetze();
    let freigeben = () => {};
    const wartet = new Promise<void>((resolve) => {
      freigeben = resolve;
    });
    let begonnen = false;
    try {
      if (art === 'vorher') await bestand.ladeGesetz(referenz);
      else
        io.vorLesen = (pfad) => {
          if (pfad.includes('/gesetze/')) {
            begonnen = true;
            return wartet;
          }
          return undefined;
        };
      const lauf = bestand.ladeGesetz(referenz, undefined, { behalten: false });
      if (art !== 'vorher') {
        await vi.waitFor(() => expect(begonnen).toBe(true));
        if (art === 'tab') bestand.meldeOffenenTab(referenz);
        else void bestand.ladeGesetz(referenz);
        await Promise.resolve();
        freigeben();
      }
      expect(await lauf).toMatchObject({ status: 'geladen' });
      expect(bestand.holeGeladenes(referenz)?.kurztitel).toBe('A');
    } finally {
      freigeben();
      bestand.beenden();
    }
  },
);
