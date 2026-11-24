// beschaffung.test.ts
// Prüft Reihenfolge, Dateischutz und Gesetzfehler der Beschaffung.
import { expect, it, vi } from 'vitest';
import {
  beschaffeBundQuelldatei,
  beschaffeBWQuelldatei,
  erzeugeGesetzesXML,
  type BeschaffungsUmgebung,
} from './beschaffung';

function beispiel() {
  const schritte: string[] = [];
  const umgebung: BeschaffungsUmgebung = {
    laden: async () => {
      schritte.push('laden');
      return { xmlString: 'quelle' };
    },
    loescheGesetzesXML: async () => {
      schritte.push('löschen');
      return true;
    },
    schreibeQuelle: async () => {
      schritte.push('quelle');
    },
    konvertieren: () => {
      schritte.push('konvertieren');
      return { xmlString: 'xml' };
    },
    nachbereiten: async (xml) => {
      schritte.push('nachbereiten');
      return xml;
    },
    parsen: () => {
      schritte.push('parsen');
      return {
        kurztitel: 'GG',
        langtitel: 'Grundgesetz',
        normgeber: 'de-bund',
        hatGliederungsartikel: false,
        elemente: [],
      };
    },
    schreibeGesetzesXML: async () => {
      schritte.push('xml');
    },
    pause: async () => {
      schritte.push('pause');
    },
    zufall: () => 0,
  };
  return { umgebung, schritte };
}
const eintrag = { kurztitel: 'GG', langtitel: 'Grundgesetz', abrufkennung: 'gg' };
it('speichert die Quelle vor der Konvertierung und das GesetzesXML zuletzt', async () => {
  const { umgebung, schritte } = beispiel();
  expect(await beschaffeBundQuelldatei(eintrag, umgebung)).toMatchObject({
    netz: true,
    gesetz: {},
  });
  expect(schritte).toEqual([
    'laden',
    'löschen',
    'quelle',
    'konvertieren',
    'nachbereiten',
    'parsen',
    'xml',
    'pause',
  ]);
});
it.each(['', '  ', 'abruf'])(
  'bewahrt den Dateistand bei leerer Quelle oder Abruffehler (%s)',
  async (quelle) => {
    const { umgebung, schritte } = beispiel();
    umgebung.laden = async () =>
      quelle === 'abruf' ? { fehler: 'Abruffehler' } : { xmlString: quelle };
    expect(await beschaffeBundQuelldatei(eintrag, umgebung)).toHaveProperty('fehler');
    expect(schritte).toEqual(['pause']);
  },
);
it.each(['konvertieren', 'nachbereiten', 'parsen'] as const)(
  'löscht altes GesetzesXML bei Gesetzfehler in %s',
  async (stufe) => {
    const { umgebung, schritte } = beispiel();
    umgebung[stufe] = () => {
      throw new Error('ungültig');
    };
    expect(await erzeugeGesetzesXML('quelle', eintrag, umgebung)).toMatchObject({
      fehler: expect.stringContaining('GesetzesXML gelöscht'),
    });
    expect(schritte.at(-1)).toBe('löschen');
  },
);
it('bricht bei Löschfehler vor der Quellschreibung ab', async () => {
  const { umgebung, schritte } = beispiel();
  umgebung.loescheGesetzesXML = async () => {
    throw new Error('Dateifehler');
  };
  await expect(beschaffeBundQuelldatei(eintrag, umgebung)).rejects.toThrow('Dateifehler');
  expect(schritte).toEqual(['laden', 'pause']);
});
it('lässt nach fehlgeschlagener XML-Schreibung nur die gespeicherte Quelle zurück', async () => {
  const { umgebung, schritte } = beispiel();
  umgebung.schreibeGesetzesXML = async () => {
    throw new Error('Dateifehler');
  };
  await expect(beschaffeBundQuelldatei(eintrag, umgebung)).rejects.toThrow('Dateifehler');
  expect(schritte).toEqual([
    'laden',
    'löschen',
    'quelle',
    'konvertieren',
    'nachbereiten',
    'parsen',
    'pause',
  ]);
});

it('behandelt fehlendes GesetzesXML beim Gesetzfehler als normalen Fehlerwert', async () => {
  const { umgebung } = beispiel();
  umgebung.konvertieren = () => ({ fehler: 'Konvertierung ungültig' });
  umgebung.loescheGesetzesXML = async () => false;
  expect(await erzeugeGesetzesXML('quelle', eintrag, umgebung)).toEqual({
    fehler: 'Error: Konvertierung ungültig',
  });
});
it('überschreibt vorhandenes GesetzesXML bei erfolgreicher Offline-Erzeugung ohne Pause', async () => {
  const { umgebung, schritte } = beispiel();
  await erzeugeGesetzesXML('quelle', eintrag, umgebung);
  expect(schritte).toEqual(['konvertieren', 'nachbereiten', 'parsen', 'xml']);
});
it('lässt bei Abbruch nach Quellschreibung kein altes GesetzesXML zurück', async () => {
  const { umgebung } = beispiel();
  let gesetzesxml: string | undefined = 'alt';
  let quelle = 'alt';
  umgebung.loescheGesetzesXML = async () => {
    const vorhanden = gesetzesxml !== undefined;
    gesetzesxml = undefined;
    return vorhanden;
  };
  umgebung.schreibeQuelle = async (_, inhalt) => {
    quelle = inhalt;
    throw new Error('Abbruch');
  };
  await expect(beschaffeBundQuelldatei(eintrag, umgebung)).rejects.toThrow('Abbruch');
  expect(quelle).toBe('quelle');
  expect(gesetzesxml).toBeUndefined();
});

it.each(['erfolg', 'abruf', 'konvertierung'])(
  'wartet nach einem tatsächlichen Abruf mit Fake-Zeit (%s)',
  async (fall) => {
    vi.useFakeTimers();
    try {
      const { umgebung } = beispiel();
      umgebung.zufall = () => 0.75;
      umgebung.pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      if (fall === 'abruf')
        umgebung.laden = async () => {
          throw new Error('Netzfehler');
        };
      if (fall === 'konvertierung') umgebung.konvertieren = () => ({ fehler: 'Ungültig' });
      let abgeschlossen = false;
      const lauf = beschaffeBundQuelldatei(eintrag, umgebung).then((e) => {
        abgeschlossen = true;
        return e;
      });
      await vi.advanceTimersByTimeAsync(1249);
      expect(abgeschlossen).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect((await lauf).netz).toBe(true);
      expect(abgeschlossen).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  },
);

it('speichert BW-HTML vor dem Gesetzfehler und erhält die Quelle ohne altes GesetzesXML', async () => {
  const { umgebung, schritte } = beispiel();
  umgebung.konvertieren = () => ({ fehler: 'Keine Normen im Dokument gefunden.' });
  const beschaffe = beschaffeBWQuelldatei(umgebung);
  expect(await beschaffe(eintrag)).toMatchObject({
    netz: true,
    fehler: expect.stringContaining('Keine Normen'),
  });
  expect(schritte).toEqual(['pause', 'laden', 'löschen', 'quelle', 'löschen']);
});
it('drosselt BW nur vor Netzabrufen und zählt auch fehlgeschlagene Abrufe', async () => {
  vi.useFakeTimers();
  try {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { umgebung } = beispiel();
    const laden = vi.fn(umgebung.laden);
    umgebung.laden = laden;
    umgebung.pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const beschaffe = beschaffeBWQuelldatei(umgebung);
    const erster = beschaffe(eintrag);
    await vi.advanceTimersByTimeAsync(0);
    await erster;
    await erzeugeGesetzesXML('vorhanden', eintrag, umgebung);
    laden.mockResolvedValueOnce({ fehler: 'Tab-Link-Zeitüberschreitung' });
    const zweiter = beschaffe(eintrag);
    await vi.advanceTimersByTimeAsync(199);
    expect(laden).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await zweiter).toMatchObject({ fehler: 'Tab-Link-Zeitüberschreitung' });
    const dritter = beschaffe(eintrag);
    await vi.advanceTimersByTimeAsync(299);
    expect(laden).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(await dritter).toHaveProperty('gesetz');
  } finally {
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});
