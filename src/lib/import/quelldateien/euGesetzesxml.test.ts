// @vitest-environment jsdom
// euGesetzesxml.test.ts
// Offline-Erzeugung aus gespeicherten EU-Quellen über die öffentliche Lauffassade.
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { erzeugeEuGesetzesXMLAusBestand } from './euGesetzesxml';
const eintrag = { kurztitel: 'DSGVO', langtitel: 'Datenschutz', abrufkennung: '32016R0679' };
const basis = new Uint8Array(
  readFileSync('src/lib/import/eu/testdaten/formex/02016R0679-20160504.fmx4'),
);
const original = new Uint8Array(readFileSync('src/lib/import/eu/testdaten/formex/32016R0679.fmx4'));
function umgebung(stand = 'fehlgeschlagen', originalBytes: Uint8Array | null = null) {
  const herkunft = {
    basisCelex: eintrag.abrufkennung,
    fassung: 'konsolidiert',
    celex: '02016R0679-20160504',
    datum: '2016-05-04',
    ergaenzung: stand,
  };
  return {
    leseHerkunft: vi.fn(async (): Promise<string | null> => JSON.stringify(herkunft)),
    leseArchiv: vi.fn(async (art: string) => (art === 'konsolidiert' ? basis : originalBytes)),
    nachbereiten: async (xml: string) => xml,
    pruefeXML: () => true,
    loescheGesetzesXML: vi.fn(async () => true),
    schreibeGesetzesXML: vi.fn(async () => {}),
    schreibeHerkunft: vi.fn(async () => {}),
    jetzt: () => new Date('2026-01-01T00:00:00Z'),
  };
}
it.each(['fehlgeschlagen', 'ergaenzt'])(
  'meldet fehlendes nötiges Original bei %s als Teilerfolg',
  async (stand) => {
    const u = umgebung(stand);
    expect(await erzeugeEuGesetzesXMLAusBestand(eintrag, u)).toMatchObject({
      teilerfolg: expect.any(String),
    });
    expect(u.schreibeGesetzesXML).toHaveBeenCalledOnce();
  },
);
it.each(['fehlgeschlagen', 'nicht-verfuegbar'])(
  'ergänzt vorhandenes passendes Original bei %s vor der XML-Schreibung',
  async (stand) => {
    const u = umgebung(stand, original);
    expect(await erzeugeEuGesetzesXMLAusBestand(eintrag, u)).toEqual({
      gesetzesXMLGeloescht: true,
    });
    expect(u.schreibeHerkunft).toHaveBeenCalledWith(
      'DSGVO',
      expect.objectContaining({ ergaenzung: 'ergaenzt' }),
    );
    expect(u.schreibeHerkunft.mock.invocationCallOrder[0]).toBeLessThan(
      u.schreibeGesetzesXML.mock.invocationCallOrder[0] ?? 0,
    );
  },
);
it('meldet das nicht angebotene Original nicht als Teilerfolg', async () => {
  expect(await erzeugeEuGesetzesXMLAusBestand(eintrag, umgebung('nicht-verfuegbar'))).toEqual({});
});
it('verwendet ein ausdrücklich fremd zugeordnetes Original nicht', async () => {
  const u = umgebung('fehlgeschlagen', original);
  const text = await u.leseHerkunft();
  u.leseHerkunft.mockResolvedValue(
    JSON.stringify({ ...JSON.parse(text ?? ''), originalBasisCelex: '32000R0001' }),
  );
  expect(await erzeugeEuGesetzesXMLAusBestand(eintrag, u)).toMatchObject({
    teilerfolg: expect.any(String),
  });
  expect(u.leseArchiv).toHaveBeenCalledTimes(1);
});
it.each([
  'fehlende Herkunft',
  'ungültiges JSON',
  'ungültige Felder',
  'fehlende Basis',
  'defektes ZIP',
  'defektes Original',
])('behandelt %s als Gesetzfehler mit Löschregel', async (fall) => {
  const u = umgebung('ergaenzt', original);
  if (fall === 'fehlende Herkunft') u.leseHerkunft = vi.fn(async () => null);
  if (fall === 'ungültiges JSON') u.leseHerkunft.mockResolvedValue('{');
  if (fall === 'ungültige Felder') u.leseHerkunft.mockResolvedValue('{"fassung":"anderes"}');
  if (fall === 'fehlende Basis') u.leseArchiv = vi.fn(async () => null);
  if (fall === 'defektes ZIP') u.leseArchiv = vi.fn(async () => new Uint8Array([1, 2, 3]));
  if (fall === 'defektes Original')
    u.leseArchiv = vi.fn(async (art) => (art === 'original' ? new Uint8Array([1, 2, 3]) : basis));
  expect(await erzeugeEuGesetzesXMLAusBestand(eintrag, u)).toMatchObject({
    fehler: expect.stringContaining('GesetzesXML gelöscht'),
  });
  expect(u.schreibeGesetzesXML).not.toHaveBeenCalled();
});
it.each(['Herkunft', 'Archiv'])(
  'bricht bei wirklichem Lesefehler der Datei %s ohne Änderung ab',
  async (art) => {
    const u = umgebung();
    if (art === 'Herkunft') u.leseHerkunft.mockRejectedValue(new Error('Lesefehler'));
    else u.leseArchiv.mockRejectedValue(new Error('Lesefehler'));
    await expect(erzeugeEuGesetzesXMLAusBestand(eintrag, u)).rejects.toThrow('Lesefehler');
    expect(u.loescheGesetzesXML).not.toHaveBeenCalled();
    expect(u.schreibeGesetzesXML).not.toHaveBeenCalled();
  },
);
it('benötigt bei nicht nötiger Ergänzung kein Original', async () => {
  const u = umgebung('nicht-noetig');
  expect(await erzeugeEuGesetzesXMLAusBestand(eintrag, u)).toEqual({});
  expect(u.leseArchiv).toHaveBeenCalledTimes(1);
});
it('entfernt bei nicht lesbarem nachbereitetem GesetzesXML das alte XML', async () => {
  const u = umgebung();
  u.pruefeXML = () => false;
  expect(await erzeugeEuGesetzesXMLAusBestand(eintrag, u)).toMatchObject({
    fehler: expect.stringContaining('GesetzesXML gelöscht'),
  });
  expect(u.schreibeGesetzesXML).not.toHaveBeenCalled();
});

it.each(['Basis', 'Original'])(
  'behandelt ungültiges XML in gültigem %s-Archiv als Gesetzfehler',
  async (art) => {
    const kaputt = zipSync({
      'a.doc.xml': strToU8('<DOC><REF.PHYS TYPE="DOC.XML" FILE="a.xml"/></DOC>'),
      'a.xml': strToU8('<ACT>'),
    });
    const u = umgebung('ergaenzt', original);
    u.leseArchiv = vi.fn(async (a) =>
      (art === 'Basis' ? a === 'konsolidiert' : a === 'original') ? kaputt : basis,
    );
    expect(await erzeugeEuGesetzesXMLAusBestand(eintrag, u)).toMatchObject({
      fehler: expect.stringContaining('GesetzesXML gelöscht'),
    });
    expect(u.schreibeGesetzesXML).not.toHaveBeenCalled();
  },
);
it('entfernt vor nachgeholter Ergänzung altes XML und kann nach gescheiterter abschließender Schreibung fortsetzen', async () => {
  const u = umgebung('fehlgeschlagen', original);
  u.schreibeGesetzesXML.mockRejectedValue(new Error('Schreibfehler'));
  await expect(erzeugeEuGesetzesXMLAusBestand(eintrag, u)).rejects.toThrow('Schreibfehler');
  expect(u.loescheGesetzesXML.mock.invocationCallOrder[0]).toBeLessThan(
    u.schreibeHerkunft.mock.invocationCallOrder[0] ?? 0,
  );
  expect(u.schreibeHerkunft.mock.invocationCallOrder[0]).toBeLessThan(
    u.schreibeGesetzesXML.mock.invocationCallOrder[0] ?? 0,
  );
});

it.each([
  { datum: undefined },
  { datum: '2016-02-30', celex: '02016R0679-20160230' },
  { datum: '2015-02-29', celex: '02016R0679-20150229' },
  { celex: 'beliebig' },
  { celex: '02016R0001-20160504' },
  { celex: '02016R0679-20160505' },
  { fassung: 'original' },
  { fassung: 'original', datum: undefined, celex: '02016R0679-20160504' },
])('weist widersprüchliche Herkunft %j vor Archivlesung mit Löschregel ab', async (abweichung) => {
  const u = umgebung();
  const text = await u.leseHerkunft();
  u.leseHerkunft.mockResolvedValue(JSON.stringify({ ...JSON.parse(text ?? ''), ...abweichung }));
  expect(await erzeugeEuGesetzesXMLAusBestand(eintrag, u)).toMatchObject({
    fehler: expect.stringContaining('Ungültige Herkunftsangabe'),
  });
  expect(u.loescheGesetzesXML).toHaveBeenCalledWith('DSGVO');
  expect(u.leseArchiv).not.toHaveBeenCalled();
  expect(u.schreibeHerkunft).not.toHaveBeenCalled();
  expect(u.schreibeGesetzesXML).not.toHaveBeenCalled();
});
it('erzeugt gültige Originalherkunft offline als Originaltext', async () => {
  const u = umgebung('nicht-noetig', original);
  u.leseHerkunft.mockResolvedValue(
    JSON.stringify({
      basisCelex: eintrag.abrufkennung,
      fassung: 'original',
      celex: eintrag.abrufkennung,
      ergaenzung: 'nicht-noetig',
    }),
  );
  expect(await erzeugeEuGesetzesXMLAusBestand(eintrag, u)).toEqual({});
  expect(u.schreibeGesetzesXML).toHaveBeenCalledWith(
    'DSGVO',
    expect.stringContaining('<fassung art="original"/>'),
  );
});

it.each(['12016E/TXT', '32026R12345'])(
  'erhält den vorhandenen Cellar-Basisvertrag für Original %s',
  async (celex) => {
    const u = umgebung('nicht-noetig', original);
    u.leseHerkunft.mockResolvedValue(
      JSON.stringify({ basisCelex: celex, celex, fassung: 'original', ergaenzung: 'nicht-noetig' }),
    );
    expect(await erzeugeEuGesetzesXMLAusBestand({ ...eintrag, abrufkennung: celex }, u)).toEqual(
      {},
    );
    expect(u.schreibeGesetzesXML).toHaveBeenCalled();
  },
);
