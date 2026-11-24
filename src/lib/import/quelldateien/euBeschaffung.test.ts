// @vitest-environment jsdom
// euBeschaffung.test.ts
// EU-Quellen ersetzen Herkunft erst nach vollständiger Beschaffung.
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { expect, it, vi } from 'vitest';
import {
  beschaffeEuQuelldatei,
  erzeugeEuGesetzesXML,
  type EuBeschaffungsUmgebung,
} from './euBeschaffung';
const eintrag = { kurztitel: 'DSGVO', langtitel: 'Verordnung', abrufkennung: '32016R0679' };
const archiv = (name: string) =>
  new Uint8Array(readFileSync(`src/lib/import/eu/testdaten/formex/${name}.fmx4`));
function beispiel() {
  const schritte: string[] = [];
  const umgebung: EuBeschaffungsUmgebung = {
    laden: vi.fn(async () => ({
      archive: { konsolidiert: archiv('02016R0679-20160504') },
      herkunft: {
        basisCelex: eintrag.abrufkennung,
        fassung: 'konsolidiert' as const,
        celex: '02016R0679-20160504',
        datum: '2016-05-04',
        ergaenzung: 'fehlgeschlagen' as const,
      },
    })),
    leseHerkunft: async () =>
      JSON.stringify({
        basisCelex: eintrag.abrufkennung,
        fassung: 'original',
        ergaenzung: 'nicht-noetig',
      }),
    leseOriginal: async () => archiv(eintrag.abrufkennung),
    loescheGesetzesXML: async () => {
      schritte.push('xml-loeschen');
      return true;
    },
    loescheHerkunft: async () => {
      schritte.push('herkunft-loeschen');
    },
    schreibeArchiv: async (art) => {
      schritte.push(art);
    },
    schreibeHerkunft: async () => {
      schritte.push('herkunft');
    },
    nachbereiten: async (xml) => xml,
    pruefeXML: () => true,
    schreibeGesetzesXML: async () => {
      schritte.push('xml');
    },
    pause: async () => {},
    zufall: () => 0,
    jetzt: () => new Date('2026-10-25'),
  };
  return { umgebung, schritte };
}
it('verwendet ein zugeordnetes Original und schreibt Archive vor Herkunft und XML', async () => {
  const { umgebung, schritte } = beispiel();
  const ergebnis = await beschaffeEuQuelldatei(eintrag, umgebung);
  expect(ergebnis).toMatchObject({
    rueckfall: false,
    hinweis: expect.stringContaining('wiederverwendet'),
  });
  expect(ergebnis.teilerfolg).toBeUndefined();
  expect(schritte).toEqual([
    'xml-loeschen',
    'herkunft-loeschen',
    'konsolidiert',
    'original',
    'herkunft',
    'xml',
  ]);
});
it('verwendet kein Original eines anderen Gesetzes und meldet Teilerfolg', async () => {
  const { umgebung } = beispiel();
  umgebung.leseHerkunft = async () => JSON.stringify({ basisCelex: 'fremd' });
  umgebung.leseOriginal = vi.fn();
  expect(await beschaffeEuQuelldatei(eintrag, umgebung)).toMatchObject({
    teilerfolg: expect.stringContaining('Original'),
  });
  expect(umgebung.leseOriginal).not.toHaveBeenCalled();
});
it('bricht bei tatsächlichen Lesefehlern vor jeder Bestandsänderung ab', async () => {
  const { umgebung, schritte } = beispiel();
  umgebung.leseOriginal = async () => {
    throw Error('Lesefehler');
  };
  await expect(beschaffeEuQuelldatei(eintrag, umgebung)).rejects.toThrow('Lesefehler');
  expect(schritte).toEqual([]);
});

it.each(['nicht-verfuegbar', 'fehlgeschlagen', 'nicht-noetig'])(
  'verwendet ein zugeordnetes Original auch bei bisheriger Ergänzung %s',
  async (ergaenzung) => {
    const { umgebung } = beispiel();
    umgebung.leseHerkunft = async () =>
      JSON.stringify({ basisCelex: eintrag.abrufkennung, fassung: 'konsolidiert', ergaenzung });
    expect(await beschaffeEuQuelldatei(eintrag, umgebung)).toMatchObject({
      hinweis: expect.stringContaining('wiederverwendet'),
    });
  },
);
it('verwendet kein ungültiges Alt-Original', async () => {
  const { umgebung } = beispiel();
  umgebung.leseOriginal = async () => new Uint8Array([1, 2, 3]);
  expect(await beschaffeEuQuelldatei(eintrag, umgebung)).toMatchObject({
    teilerfolg: expect.any(String),
  });
});
it.each(['xml-loeschen', 'herkunft-loeschen', 'konsolidiert', 'original', 'herkunft', 'xml'])(
  'bricht bei Speicherfehler nach %s ab und veröffentlicht keinen gemischten Stand',
  async (abbruch) => {
    const { umgebung, schritte } = beispiel();
    const alteHerkunft = JSON.stringify({
      basisCelex: eintrag.abrufkennung,
      fassung: 'konsolidiert',
      celex: '02016R0679-20160430',
      datum: '2016-04-30',
      ergaenzung: 'ergaenzt',
    });
    let herkunft: string | null = alteHerkunft;
    let basis = 'alt';
    let xml: string | null = 'alt';
    const schreiben = (schritt: string, mutation: () => void) => {
      schritte.push(schritt);
      mutation();
      if (abbruch === schritt) throw Error('Abbruch');
    };
    umgebung.loescheGesetzesXML = async () => {
      schreiben('xml-loeschen', () => {
        xml = null;
      });
      return true;
    };
    umgebung.loescheHerkunft = async () => {
      schreiben('herkunft-loeschen', () => {
        herkunft = null;
      });
    };
    umgebung.schreibeArchiv = async (art) => {
      schreiben(art, () => {
        if (art === 'konsolidiert') basis = 'neu';
      });
    };
    umgebung.schreibeHerkunft = async (_, neu) => {
      schreiben('herkunft', () => {
        herkunft = JSON.stringify(neu);
      });
    };
    umgebung.schreibeGesetzesXML = async (_, neu) => {
      schreiben('xml', () => {
        xml = neu;
      });
    };
    await expect(beschaffeEuQuelldatei(eintrag, umgebung)).rejects.toThrow('Abbruch');
    if (['herkunft-loeschen', 'konsolidiert', 'original'].includes(abbruch))
      expect(herkunft).toBeNull();
    if (['herkunft', 'xml'].includes(abbruch))
      expect(JSON.parse(herkunft ?? '')).toMatchObject({
        celex: '02016R0679-20160504',
        datum: '2016-05-04',
      });
    if (herkunft === alteHerkunft) expect(basis).toBe('alt');
    if (['herkunft', 'xml'].includes(abbruch)) expect(basis).toBe('neu');
    if (abbruch !== 'xml') expect(xml).toBeNull();
  },
);
it('erhält den Bestand bei fehlgeschlagenem Basisabruf und pausiert dennoch', async () => {
  const { umgebung, schritte } = beispiel();
  umgebung.laden = async () => ({ fehler: { grund: 'nichtVerfuegbar', meldung: 'Fehlt' } });
  umgebung.pause = vi.fn(async () => {});
  expect(await beschaffeEuQuelldatei(eintrag, umgebung)).toMatchObject({
    fehlerart: 'nicht-verfuegbar',
  });
  expect(schritte).toEqual([]);
  expect(umgebung.pause).toHaveBeenCalledWith(500);
});

it('erhält die Originalzuordnung bei Wechsel der Basis-CELEX und verwendet den Archivrest später nicht für das neue Gesetz', async () => {
  const { umgebung } = beispiel();
  let gespeichert = '';
  umgebung.leseHerkunft = async () => JSON.stringify({ basisCelex: 'anderes-gesetz' });
  umgebung.schreibeHerkunft = async (_, herkunft) => {
    gespeichert = JSON.stringify(herkunft);
  };
  umgebung.leseOriginal = vi.fn();
  await beschaffeEuQuelldatei(eintrag, umgebung);
  expect(JSON.parse(gespeichert)).toMatchObject({
    basisCelex: eintrag.abrufkennung,
    originalBasisCelex: 'anderes-gesetz',
  });
  umgebung.leseHerkunft = async () => gespeichert;
  expect(await beschaffeEuQuelldatei(eintrag, umgebung)).toMatchObject({
    teilerfolg: expect.any(String),
  });
  expect(umgebung.leseOriginal).not.toHaveBeenCalled();
});

it.each(['konvertieren', 'nachbereiten', 'parsen'])(
  'entfernt bei Fehler in %s ein bisheriges GesetzesXML und erhält die Quellen',
  async (schritt) => {
    const { umgebung, schritte } = beispiel();
    const quelle = {
      archive: {
        original: schritt === 'konvertieren' ? new Uint8Array([1]) : archiv(eintrag.abrufkennung),
      },
      herkunft: {
        basisCelex: eintrag.abrufkennung,
        fassung: 'original' as const,
        celex: eintrag.abrufkennung,
        ergaenzung: 'nicht-noetig' as const,
      },
    };
    if (schritt === 'nachbereiten')
      umgebung.nachbereiten = async () => {
        throw Error('Nachbereitung');
      };
    if (schritt === 'parsen') umgebung.pruefeXML = () => false;
    expect(await erzeugeEuGesetzesXML(quelle, eintrag, umgebung)).toMatchObject({
      fehler: expect.stringContaining('GesetzesXML gelöscht'),
    });
    expect(schritte).toEqual(['xml-loeschen']);
  },
);

it('verwendet kein Alt-Original mit ungültigem XML innerhalb eines gültigen Archivs', async () => {
  const { umgebung } = beispiel();
  umgebung.leseOriginal = async () =>
    zipSync({
      'akt.doc.xml': strToU8('<DOC><REF.PHYS TYPE="DOC.XML" FILE="haupt.xml"/></DOC>'),
      'haupt.xml': strToU8('<ACT><unvollstaendig>'),
    });
  expect(await beschaffeEuQuelldatei(eintrag, umgebung)).toMatchObject({
    teilerfolg: expect.any(String),
  });
});
