// praefixlauf.test.ts
// Prüflauf ohne Netz, App-Speicherung oder echte Wartezeiten.
import { normaleNorm, gesetzDarstellung, gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import { expect, it, vi } from 'vitest';
import { fuehrePraefixlaufAus } from './praefixstruktur.index';
import type { PraefixlaufUmgebung } from './praefixlauf.types';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';

const gesetz: GesetzDarstellung = gesetzDarstellung({
  kurztitel: 'G',
  langtitel: '',
  hatGliederungsartikel: false,
  elemente: [],
});
function fake(titel = ['A', 'B', 'C']) {
  let xml: string | null = null;
  const umgebung: PraefixlaufUmgebung = {
    leseDateistand: vi.fn(async () => ({ quellen: [], gesetzesxml: [] })),
    leseListe: vi.fn(async () => xml),
    schreibeListe: vi.fn(async (neu) => {
      xml = neu;
    }),
    ladeKandidaten: vi.fn(async () =>
      titel.map((kurztitel) => ({ kurztitel, langtitel: '', abrufkennung: '' })),
    ),
    ladeGesetz: vi.fn(async () => ({ gesetz, netz: true })),
    pruefeErreichbarkeit: vi.fn(async () => null),
    ausgabe: vi.fn(),
    pause: vi.fn(async () => {}),
    zufall: () => 0.5,
  };
  return { umgebung, xml: () => xml };
}
it('speichert und zählt erfolgreich geprüften leeren Inhalt ohne Präfixbehauptung', async () => {
  const { umgebung, xml } = fake(['A']);
  const bericht = await fuehrePraefixlaufAus(
    { modus: 'praefix', normgeber: 'de-bund', anzahl: 1 },
    umgebung,
  );
  expect(xml()).toContain('<gesetz ermittlungsstatus="leer">A</gesetz>');
  expect(bericht.geprueft.leer).toBe(1);
  expect(
    (
      await fuehrePraefixlaufAus(
        { modus: 'praefix', normgeber: 'de-bund', anzahl: 1, gescheitert: true },
        umgebung,
      )
    ).gespeichert,
  ).toBe(0);
});
it('speichert und zählt roemisch im Prüflauf', async () => {
  const { umgebung, xml } = fake(['R']);
  vi.mocked(umgebung.ladeGesetz).mockResolvedValue({
    netz: true,
    gesetz: gesetzMitNormen(['I.', 'II.', 'Schlußformel'], { ...gesetz }),
  });
  const bericht = await fuehrePraefixlaufAus(
    { modus: 'praefix', normgeber: 'de-bund', anzahl: 1 },
    umgebung,
  );
  expect(bericht.geprueft.roemisch).toBe(1);
  expect(xml()).toContain('<gesetz praefixstruktur="roemisch">R</gesetz>');
});
it('rückt bei Fehlern nach und setzt ohne Dopplungen fort', async () => {
  const { umgebung, xml } = fake();
  vi.mocked(umgebung.ladeGesetz).mockResolvedValueOnce({ fehler: 'Download', netz: true });
  const bericht = await fuehrePraefixlaufAus(
    { modus: 'praefix', normgeber: 'de-bund', anzahl: 2 },
    umgebung,
  );
  expect(bericht.gespeichert).toBe(2);
  expect(bericht.fehlgeschlagen).toEqual([{ kurztitel: 'A', meldung: 'Download' }]);
  expect(xml()).toContain('>B</gesetz>');
  expect(xml()).toContain('ermittlungsstatus="gescheitert"');
  expect(xml()).toContain('>A</gesetz>');
  expect(umgebung.pause).not.toHaveBeenCalled();
  expect(umgebung.pruefeErreichbarkeit).toHaveBeenCalledTimes(1);
  vi.mocked(umgebung.ladeGesetz).mockClear();
  expect(
    (await fuehrePraefixlaufAus({ modus: 'praefix', normgeber: 'de-bund', anzahl: 2 }, umgebung))
      .gespeichert,
  ).toBe(0);
  expect(umgebung.ladeGesetz).toHaveBeenCalledTimes(0);
});
it('begrenzt Bund auf zehn Stränge und serialisiert Schreiben', async () => {
  const { umgebung } = fake(Array.from({ length: 25 }, (_, i) => `${i}`));
  let aktiv = 0,
    maximum = 0,
    schreibend = 0;
  umgebung.ladeGesetz = vi.fn(async () => {
    aktiv++;
    maximum = Math.max(maximum, aktiv);
    await Promise.resolve();
    aktiv--;
    return { gesetz, netz: true };
  });
  umgebung.schreibeListe = vi.fn(async () => {
    expect(++schreibend).toBe(1);
    await Promise.resolve();
    schreibend--;
  });
  expect(
    (await fuehrePraefixlaufAus({ modus: 'praefix', normgeber: 'de-bund', anzahl: 14 }, umgebung))
      .gespeichert,
  ).toBe(14);
  expect(maximum).toBe(10);
  expect(umgebung.ladeGesetz).toHaveBeenCalledTimes(14);
});
it('meldet doppelte Titel und überspringt benannte geprüfte Titel', async () => {
  const { umgebung } = fake(['A', 'a', 'B']);
  const bericht = await fuehrePraefixlaufAus(
    { modus: 'praefix', normgeber: 'de-bund', anzahl: 3 },
    umgebung,
  );
  expect(bericht.fehlgeschlagen).toEqual([
    { kurztitel: 'A', meldung: 'Kurztitel nicht eindeutig' },
  ]);
  expect(umgebung.ladeGesetz).toHaveBeenCalledTimes(1);
  const fortsetzung = await fuehrePraefixlaufAus(
    { modus: 'praefix', normgeber: 'de-bund', anzahl: 1, kurztitel: ['b'] },
    umgebung,
  );
  expect(fortsetzung.uebersprungen).toEqual(['B']);
  expect(fortsetzung.gespeichert).toBe(0);
});
it.each(['liste', 'gesetz'])(
  'bricht bei Schreibfehler an %s ab und beginnt keine neuen Gesetze',
  async (ziel) => {
    const { umgebung } = fake(Array.from({ length: 30 }, (_, i) => `${i}`));
    const fehler = new Error('Schreiben fehlgeschlagen');
    if (ziel === 'liste') vi.mocked(umgebung.schreibeListe).mockRejectedValue(fehler);
    else vi.mocked(umgebung.ladeGesetz).mockRejectedValue(fehler);
    await expect(
      fuehrePraefixlaufAus({ modus: 'praefix', normgeber: 'de-bund', anzahl: 30 }, umgebung),
    ).rejects.toBe(fehler);
    expect(vi.mocked(umgebung.ladeGesetz).mock.calls.length).toBeLessThanOrEqual(10);
    expect(
      vi
        .mocked(umgebung.ausgabe)
        .mock.calls.some(([zeile]) =>
          /: (paragraph|artikel|gliederungsartikel|roemisch|regel|nummer|unklar|leer) \(/.test(
            zeile,
          ),
        ),
    ).toBe(false);
  },
);
it('überlässt BW-Wartezeiten auch über Ersatzwellen der Beschaffung', async () => {
  const zufall = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  const { umgebung } = fake();
  vi.mocked(umgebung.ladeGesetz).mockResolvedValueOnce({ fehler: 'Download', netz: true });
  await fuehrePraefixlaufAus({ modus: 'praefix', normgeber: 'de-bw', anzahl: 2 }, umgebung);
  expect(umgebung.pause).not.toHaveBeenCalled();
  zufall.mockRestore();
});
it('wirft vor Downloads bei ungültiger Liste oder unerreichbarer Quelle', async () => {
  const { umgebung } = fake();
  vi.mocked(umgebung.leseListe).mockResolvedValueOnce('<kaputt/>');
  await expect(
    fuehrePraefixlaufAus({ modus: 'praefix', normgeber: 'de-bund', anzahl: 1 }, umgebung),
  ).rejects.toThrow();
  vi.mocked(umgebung.pruefeErreichbarkeit).mockResolvedValue('offline');
  await expect(
    fuehrePraefixlaufAus({ modus: 'praefix', normgeber: 'de-bund', anzahl: 1 }, umgebung),
  ).rejects.toThrow('offline');
  expect(umgebung.ladeGesetz).not.toHaveBeenCalled();
});
it('bewahrt bestätigte Ergebnisse nach abgebrochenem Schreiben und setzt fort', async () => {
  const { umgebung, xml } = fake(['A', 'B', 'C']);
  const atomar = umgebung.schreibeListe;
  let schreiben = 0;
  umgebung.schreibeListe = vi.fn(async (neu) => {
    if (++schreiben === 2) throw new Error('Abbruch während Schreiben');
    await atomar(neu);
  });
  await expect(
    fuehrePraefixlaufAus({ modus: 'praefix', normgeber: 'de-bund', anzahl: 3 }, umgebung),
  ).rejects.toThrow('Abbruch');
  expect(xml()).toContain('>A</gesetz>');
  expect(xml()).not.toContain('>B</gesetz>');
  expect(
    vi.mocked(umgebung.ausgabe).mock.calls.filter(([zeile]) => /^A: leer \(/.test(zeile)),
  ).toHaveLength(1);
  umgebung.schreibeListe = atomar;
  vi.mocked(umgebung.ladeGesetz).mockClear();
  const bericht = await fuehrePraefixlaufAus(
    { modus: 'praefix', normgeber: 'de-bund', anzahl: 3 },
    umgebung,
  );
  expect(bericht.gespeichert).toBe(2);
  expect(vi.mocked(umgebung.ladeGesetz).mock.calls.map(([, e]) => e.kurztitel)).toEqual(['B', 'C']);
});
it('rückt auch nach spät fehlgeschlagenem letztem Strang in neuer Welle nach', async () => {
  const { umgebung } = fake(['A', 'B', 'C']);
  let scheitern!: () => void;
  vi.mocked(umgebung.ladeGesetz).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        scheitern = () => resolve({ fehler: 'später Fehler', netz: true });
      }),
  );
  const lauf = fuehrePraefixlaufAus(
    { modus: 'praefix', normgeber: 'de-bund', anzahl: 2 },
    umgebung,
  );
  await vi.waitFor(() =>
    expect(umgebung.ausgabe).toHaveBeenCalledWith(expect.stringMatching(/^B: leer \([\d.]+ s\)$/)),
  );
  expect(umgebung.ladeGesetz).toHaveBeenCalledTimes(2);
  scheitern();
  expect((await lauf).gespeichert).toBe(2);
  expect(vi.mocked(umgebung.ladeGesetz).mock.calls.map(([, e]) => e.kurztitel)).toEqual([
    'A',
    'B',
    'C',
  ]);
});
it.each([0, 0.5, 0.999])(
  'überlässt die Bund-Pause der Beschaffung bei Zufall %s',
  async (zufall) => {
    const { umgebung } = fake(['A']);
    umgebung.zufall = () => zufall;
    await fuehrePraefixlaufAus({ modus: 'praefix', normgeber: 'de-bund', anzahl: 1 }, umgebung);
    expect(umgebung.pause).not.toHaveBeenCalled();
  },
);
it('meldet Zeit je Gesetz bis zur dauerhaften Bestätigung ohne Drosselungspause', async () => {
  const { umgebung } = fake(['A']);
  let jetzt = 100;
  const zeit = vi.spyOn(performance, 'now').mockImplementation(() => jetzt);
  vi.mocked(umgebung.schreibeListe).mockImplementation(async () => {
    jetzt = 1350;
  });
  try {
    await fuehrePraefixlaufAus({ modus: 'praefix', normgeber: 'de-bund', anzahl: 1 }, umgebung);
    expect(umgebung.ausgabe).toHaveBeenCalledWith('A: leer (1.25 s)');
  } finally {
    zeit.mockRestore();
  }
});

it('bleibt nach zwei BW-Erfolgen beim dritten offenen Abruf sichtbar und setzt danach fort', async () => {
  vi.useFakeTimers();
  let weiter!: () => void;
  const { umgebung } = fake(['A', 'B', 'C']);
  umgebung.ladeGesetz = vi.fn(async (_, eintrag, schritt) => {
    await schritt?.('Abruf');
    if (eintrag.kurztitel === 'C')
      await new Promise<void>((resolve) => {
        weiter = resolve;
      });
    return { gesetz, netz: true };
  });
  const lauf = fuehrePraefixlaufAus({ modus: 'praefix', normgeber: 'de-bw', anzahl: 3 }, umgebung);
  try {
    await vi.advanceTimersByTimeAsync(2000);
    expect(umgebung.schreibeListe).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10000);
    expect(
      vi
        .mocked(umgebung.ausgabe)
        .mock.calls.some(([zeile]) => zeile.startsWith('C: wartet weiterhin bei „Abruf“')),
    ).toBe(true);
  } finally {
    weiter();
    await lauf;
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  }
  expect(umgebung.schreibeListe).toHaveBeenCalledTimes(3);
});

it('übergibt nach schwerem Schreibfehler den bis zum Abbruch erreichten Bericht', async () => {
  const { umgebung } = fake(['A', 'B', 'C']);
  vi.mocked(umgebung.ladeGesetz).mockResolvedValueOnce({ fehler: 'Download', netz: true });
  vi.mocked(umgebung.schreibeListe)
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('Schreibfehler'));
  const melden = vi.fn();
  await expect(
    fuehrePraefixlaufAus({ modus: 'praefix', normgeber: 'de-bund', anzahl: 3 }, umgebung, melden),
  ).rejects.toThrow('Schreibfehler');
  expect(melden).toHaveBeenLastCalledWith(
    expect.objectContaining({
      gespeichert: 0,
      fehlgeschlagen: [{ kurztitel: 'A', meldung: 'Download' }],
      verbleibendUngeprueft: 2,
    }),
  );
});

it('wiederholt höchstens die verlangte Zahl gespeicherter Fehlschläge und ersetzt sie bei Erfolg', async () => {
  const { umgebung, xml } = fake(['A', 'B', 'C']);
  vi.mocked(umgebung.ladeGesetz).mockResolvedValue({ fehler: 'Download', netz: true });
  await fuehrePraefixlaufAus({ modus: 'praefix', normgeber: 'de-bw', anzahl: 3 }, umgebung);
  vi.mocked(umgebung.ladeGesetz).mockClear().mockResolvedValueOnce({ gesetz, netz: true });
  const bericht = await fuehrePraefixlaufAus(
    { modus: 'praefix', normgeber: 'de-bw', anzahl: 2, gescheitert: true },
    umgebung,
  );
  expect(umgebung.ladeGesetz).toHaveBeenCalledTimes(2);
  expect(bericht.gespeichert).toBe(1);
  expect(xml()).toContain('ermittlungsstatus="leer">A</gesetz>');
  expect(xml()).toContain('ermittlungsstatus="gescheitert"');
  expect(xml()!.match(/>A<\/gesetz>/g) ?? []).toHaveLength(1);
});
it('prüft Eindeutigkeit beim Wiederholen erneut und lädt keinen mehrdeutigen Titel', async () => {
  const { umgebung, xml } = fake(['A', 'a', 'B']);
  await fuehrePraefixlaufAus({ modus: 'praefix', normgeber: 'de-bund', anzahl: 1 }, umgebung);
  expect(xml()).toContain('fehlerart="identifikation"');
  vi.mocked(umgebung.ladeGesetz).mockClear();
  await fuehrePraefixlaufAus(
    { modus: 'praefix', normgeber: 'de-bund', anzahl: 1, gescheitert: true },
    umgebung,
  );
  expect(umgebung.ladeGesetz).not.toHaveBeenCalled();
  vi.mocked(umgebung.ladeKandidaten).mockResolvedValue([
    { kurztitel: 'A', langtitel: '', abrufkennung: '' },
  ]);
  await fuehrePraefixlaufAus(
    { modus: 'praefix', normgeber: 'de-bund', anzahl: 1, gescheitert: true },
    umgebung,
  );
  expect(umgebung.ladeGesetz).toHaveBeenCalledTimes(1);
  expect(xml()).not.toContain('ermittlungsstatus="gescheitert"');
});

it('behält einen gespeicherten Fehlschlag bei fehlendem Importindex-Kandidaten ohne Ersatzzuordnung', async () => {
  const { umgebung, xml } = fake(['A']);
  vi.mocked(umgebung.ladeGesetz).mockResolvedValue({ fehler: 'Download', netz: true });
  await fuehrePraefixlaufAus({ modus: 'praefix', normgeber: 'de-bw', anzahl: 1 }, umgebung);
  const vorher = xml();
  vi.mocked(umgebung.ladeGesetz).mockClear();
  vi.mocked(umgebung.ladeKandidaten).mockResolvedValue([
    { kurztitel: 'B', langtitel: '', abrufkennung: '' },
  ]);
  const bericht = await fuehrePraefixlaufAus(
    { modus: 'praefix', normgeber: 'de-bw', anzahl: 1, gescheitert: true },
    umgebung,
  );
  expect(umgebung.ladeGesetz).not.toHaveBeenCalled();
  expect(bericht.gespeichert).toBe(0);
  expect(xml()).toBe(vorher);
});

it.each([
  [['1.', '7a.', '1. bis 6.'], 'arabisch'],
  [['A.', 'B.', 'C.'], 'alphabetisch'],
] as const)('speichert und zählt die neue Familie %s', async (namen, familie) => {
  const { umgebung, xml } = fake(['R']);
  vi.mocked(umgebung.ladeGesetz).mockResolvedValue({
    netz: true,
    gesetz: {
      ...gesetz,
      elemente: namen.map((bezeichnung, index) => ({
        typ: 'norm',
        data: normaleNorm({
          id: `${index}`,
          xmlId: `${index}`,
          bezeichnung,
          absaetze: [],
        }),
      })),
    },
  });
  const bericht = await fuehrePraefixlaufAus(
    { modus: 'praefix', normgeber: 'de-bund', anzahl: 1 },
    umgebung,
  );
  expect(bericht.geprueft[familie]).toBe(1);
  expect(xml()).toContain(`praefixstruktur="${familie}"`);
});

it('weist EU auch am öffentlichen Typvertrag des Präfixlaufs ab', () => {
  type Laufauftrag = Parameters<typeof import('./praefixstruktur.index').fuehrePraefixlaufAus>[0];
  // @ts-expect-error Der Präfixlauf nimmt ausschließlich Bund und BW an.
  const auftrag: Laufauftrag = { modus: 'praefix', normgeber: 'eu', anzahl: 1 };
  expect(auftrag.normgeber).toBe('eu');
});

it('verwendet vorhandene Quellen ohne Erreichbarkeitsprüfung und lässt GesetzesXML neu erzeugen', async () => {
  const { umgebung } = fake(['A']);
  vi.mocked(umgebung.leseDateistand).mockResolvedValue({ quellen: ['a'], gesetzesxml: ['A'] });
  await fuehrePraefixlaufAus({ modus: 'praefix', normgeber: 'de-bund', anzahl: 1 }, umgebung);
  expect(umgebung.leseDateistand).toHaveBeenCalledTimes(1);
  expect(umgebung.pruefeErreichbarkeit).not.toHaveBeenCalled();
  expect(umgebung.ladeGesetz).toHaveBeenCalledWith(
    'de-bund',
    expect.objectContaining({ kurztitel: 'A' }),
    expect.any(Function),
    true,
  );
  expect(umgebung.pause).not.toHaveBeenCalled();
});

it.each([
  ['Tab-Link: Zeitüberschreitung', 'tablink-zeitueberschreitung'],
  ['Keine Normen gefunden', 'keine-normen'],
  ['Die Quelldatei ist leer.', 'gesetz-laden'],
])('klassifiziert den Beschaffungsfehler %s als %s', async (fehler, fehlerart) => {
  const { umgebung, xml } = fake(['A']);
  vi.mocked(umgebung.ladeGesetz).mockResolvedValue({ fehler, netz: true });
  await fuehrePraefixlaufAus({ modus: 'praefix', normgeber: 'de-bw', anzahl: 1 }, umgebung);
  expect(xml()).toContain(`fehlerart="${fehlerart}"`);
});

it('erreicht das Erfolgsziel mit lokaler Quelle trotz nichtlokalem Rest vollständig offline', async () => {
  const { umgebung } = fake(['A', 'B']);
  vi.mocked(umgebung.leseDateistand).mockResolvedValue({ quellen: ['a'], gesetzesxml: [] });
  vi.mocked(umgebung.pruefeErreichbarkeit).mockResolvedValue('offline');
  expect(
    (await fuehrePraefixlaufAus({ modus: 'praefix', normgeber: 'de-bund', anzahl: 1 }, umgebung))
      .gespeichert,
  ).toBe(1);
  expect(umgebung.pruefeErreichbarkeit).not.toHaveBeenCalled();
  expect(umgebung.ladeGesetz).toHaveBeenCalledTimes(1);
});
it('prüft Erreichbarkeit erst nach lokalem Fehler beim nachrückenden Netzfall', async () => {
  const { umgebung } = fake(['A', 'B', 'C']);
  vi.mocked(umgebung.leseDateistand).mockResolvedValue({ quellen: ['A'], gesetzesxml: [] });
  vi.mocked(umgebung.ladeGesetz).mockResolvedValueOnce({ fehler: 'Inhalt ungültig', netz: false });
  expect(
    (await fuehrePraefixlaufAus({ modus: 'praefix', normgeber: 'de-bund', anzahl: 1 }, umgebung))
      .gespeichert,
  ).toBe(1);
  expect(umgebung.pruefeErreichbarkeit).toHaveBeenCalledOnce();
  expect(vi.mocked(umgebung.ladeGesetz).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(umgebung.pruefeErreichbarkeit).mock.invocationCallOrder[0] ?? 0,
  );
});
it('teilt eine noch laufende Erreichbarkeitsprüfung zwischen parallelen Netzfällen', async () => {
  const { umgebung } = fake(['A', 'B', 'C']);
  let freigeben: (wert: null) => void = () => {};
  vi.mocked(umgebung.pruefeErreichbarkeit).mockImplementation(
    () =>
      new Promise((resolve) => {
        freigeben = resolve;
      }),
  );
  const lauf = fuehrePraefixlaufAus(
    { modus: 'praefix', normgeber: 'de-bund', anzahl: 3 },
    umgebung,
  );
  await vi.waitFor(() => expect(umgebung.pruefeErreichbarkeit).toHaveBeenCalledOnce());
  expect(umgebung.ladeGesetz).not.toHaveBeenCalled();
  freigeben(null);
  expect((await lauf).gespeichert).toBe(3);
  expect(umgebung.pruefeErreichbarkeit).toHaveBeenCalledOnce();
});
