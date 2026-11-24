// @vitest-environment jsdom
// Verweisspeicherung und Zielauflösung mit echten Gesetz-/Markierungsspeichern.
// Nur native Grenzen, Importindexangebote und Historienkommunikation sind ersetzt.
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';

import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { beforeEach, expect, it, vi } from 'vitest';
import { speichereVerweismarkierung } from './hilfsfenster-aktionen.index';
import { registrierePruefpflichtigeAenderung } from '@/lib/persistenz/kern/kern.index';
import { hinzufuegenMarkierung, ladeMarkierungen } from '@/lib/markierungen/eintrag/eintrag.index';
import type { AktionsMeldung } from '@/lib/domain/app/aktionsMeldung';
import type { VerweismarkierungKontext } from './markierungen.hilfsfensterKontext';

import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { markierungsFensterGesetzLader } from '@/test/markierungen/markierungsFensterGesetzLader';
const markierungsEinzelzugriffFuerTest = markierungsFensterGesetzLader();

const nativ = vi.hoisted(() => ({
  bestand: new Map<string, string>(),
  befehl: vi.fn(),
  lesen: vi.fn(),
  banner: vi.fn(),
  historie: vi.fn(),
  vormerken: vi.fn(),
  abschliessen: vi.fn(),
  ereignis: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: nativ.befehl }));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
}));
vi.mock('@tauri-apps/plugin-fs', async () => {
  const { dateiAttrappen } = await import('@/test/plattform/dateiAttrappen');
  return dateiAttrappen(nativ.bestand, nativ.lesen);
});
vi.mock('@tauri-apps/api/event', () => ({ emitTo: nativ.ereignis, listen: async () => () => {} }));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: nativ.banner,
}));
vi.mock('./markierungsUebertragung', () => ({
  schliesseGespeicherteMarkierungsAktionAb: nativ.historie,
}));
vi.mock('@/lib/import/import.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  alleImportindexEintraege: async () => [],
  leseEuropaVerzeichnis: async () => [],
}));
const gesetz = gesetzesreferenz({ kurztitel: 'BGB' });
const markierungen = 'markierungen/BGB_de-bund-markierungen.xml';
const gesetzPfad = 'gesetze/BGB_de-bund.xml';
const kontext: VerweismarkierungKontext = {
  gesetz,
  openerLabel: 'fenster-1',
  ausgangsstelle: normAusgangsstelle('§ 1'),
};
const kanal = { vormerken: nativ.vormerken, abschliessen: nativ.abschliessen };
let befunde: AktionsMeldung[];
const empfangen = (meldung: AktionsMeldung) => {
  befunde.push(meldung);
};
const speichern = (k = kontext, text = '§ 1 BGB', empfaenger = empfangen) =>
  speichereVerweismarkierung(
    k,
    markierungsEinzelzugriffFuerTest,
    text,
    false,
    false,
    new Map(),
    undefined,
    undefined,
    empfaenger,
  );
const geschrieben = () =>
  nativ.befehl.mock.calls.filter(([name]) => name === 'atomar_datei_schreiben');
const ohneSpeicherung = () => {
  expect(geschrieben()).toHaveLength(0);
  expect(nativ.historie).not.toHaveBeenCalled();
  expect(nativ.banner).not.toHaveBeenCalled();
};
beforeEach(() => {
  vi.resetAllMocks();
  befunde = [];
  nativ.bestand.clear();
  nativ.bestand.set(
    gesetzPfad,
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel><langtitel>BGB</langtitel></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><text><absatz>Text</absatz></text></norm></inhalt></gesetz>',
  );
  registrierePruefpflichtigeAenderung(kanal);
  nativ.vormerken.mockResolvedValue('vorgang');
  nativ.abschliessen.mockResolvedValue(undefined);
  nativ.historie.mockResolvedValue({ art: 'erfolg' });
  nativ.lesen.mockImplementation(async (pfad: string) => {
    const wert = nativ.bestand.get(pfad.replace('/daten/LexLata/', ''));
    if (wert === undefined) throw new Error('Fehlt');
    return wert;
  });
  nativ.befehl.mockImplementation(
    async (name: string, daten: { relativerPfad: string; inhalt: string }) => {
      if (name === 'gesetz_dateistempel_lesen')
        return [...nativ.bestand.keys()]
          .filter((pfad) => pfad.startsWith('gesetze/'))
          .map((pfad) => ({
            name: pfad.slice(8),
            dateistempel: { groesse: '1', aenderungszeit: '1' },
          }));
      if (name === 'datei_sperre_erwerben') return daten.relativerPfad;
      if (name === 'datei_sperre_freigeben') return;
      if (name === 'atomar_datei_schreiben') {
        nativ.bestand.set(daten.relativerPfad, daten.inhalt);
        return;
      }
      throw new Error(name);
    },
  );
});
it.each(['wartefrist', 'ipc'])('liefert %s lokal vor einer Speicherung', async (fehler) => {
  const nativAufrufen = nativ.befehl.getMockImplementation()!;
  nativ.befehl.mockImplementation(async (name, args) => {
    if (name === 'datei_sperre_erwerben') throw fehler;
    return nativAufrufen(name, args);
  });
  await expect(speichern()).rejects.toBe(fehler);
  expect(befunde).toEqual([
    expect.objectContaining({ anlass: 'dateisperre', aenderungsstand: 'keine' }),
  ]);
  ohneSpeicherung();
});
it('erhält einen Lesefehler der Markierungsdatei im Vorgang', async () => {
  nativ.bestand.set(markierungen, '<markierungen/>');
  const lesen = nativ.lesen.getMockImplementation()!;
  nativ.lesen.mockImplementation(async (pfad) => {
    if (pfad.endsWith('-markierungen.xml')) throw new Error('Zugriff');
    return lesen(pfad);
  });
  await expect(speichern()).rejects.toThrow('Zugriff');
  expect(befunde).toEqual([expect.objectContaining({ anlass: 'lesen', art: 'fehler' })]);
  ohneSpeicherung();
});
it('meldet fehlenden Prüfbedarf vor dem Schreibzugriff', async () => {
  nativ.vormerken.mockRejectedValue(new Error('Prüfbedarf'));
  await expect(speichern()).rejects.toThrow('Prüfbedarf');
  expect(befunde).toEqual([expect.objectContaining({ anlass: 'pruefbedarf', art: 'fehler' })]);
  ohneSpeicherung();
});
it.each(['archiviert', 'gesichert_aber_nicht_entfernt', 'sicherungsfehler'])(
  'unterscheidet Sicherung %s vom gescheiterten Verweisspeichern',
  async (status) => {
    nativ.bestand.set(markierungen, 'defekt');
    const befehl = nativ.befehl.getMockImplementation()!;
    nativ.befehl.mockImplementation(async (name, daten) => {
      if (name === 'archiviere_beschaedigte_datei') {
        if (status === 'sicherungsfehler') throw new Error('Sicherung');
        nativ.bestand.set('Kopie', nativ.bestand.get(markierungen) ?? '');
        if (status === 'archiviert') nativ.bestand.delete(markierungen);
        return { status, sicherungspfad: 'Kopie' };
      }
      if (name === 'atomar_datei_schreiben') throw new Error('Schreiben');
      return befehl(name, daten);
    });
    await expect(speichern()).rejects.toThrow();
    expect(befunde).toEqual([
      expect.objectContaining({
        anlass: 'sicherung',
        art: status === 'archiviert' ? 'hinweis' : 'fehler',
        aenderungsstand: status === 'sicherungsfehler' ? 'keine' : 'teilweise',
      }),
    ]);
    expect(nativ.historie).not.toHaveBeenCalled();
    expect(nativ.banner).not.toHaveBeenCalled();
  },
);
it.each([false, true])(
  'bewahrt gespeicherten Verweis und Historie trotz Prüfabschlussfehler (Bearbeiten=%s)',
  async (bearbeiten) => {
    if (bearbeiten) await speichern(kontext, '§ 1');
    const vorher = bearbeiten
      ? (await ladeMarkierungen(gesetz))[0]!.verweisinhalt!
      : { verweistext: '§ 1', verweisziele: [] };
    nativ.historie.mockClear();
    nativ.befehl.mockClear();
    nativ.abschliessen.mockRejectedValue(new Error('Abschluss'));
    const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const k = bearbeiten
        ? {
            ...kontext,
            bearbeiten: {
              zitatText: '§ 1',
              vorher: { elementstand: testElementstand(), verweisinhalt: vorher },
            },
          }
        : kontext;
      await expect(speichern(k)).resolves.toEqual({ art: 'erfolg' });
      expect((await ladeMarkierungen(gesetz))[0]!.verweisinhalt?.verweistext).toBe('§ 1 BGB');
      expect(befunde).toEqual([
        expect.objectContaining({ anlass: 'pruefabschluss', aenderungsstand: 'vollstaendig' }),
      ]);
      expect(geschrieben()).toHaveLength(1);
      expect(nativ.historie).toHaveBeenCalledTimes(1);
      expect(nativ.historie.mock.calls[0]![0].art).toBe(
        bearbeiten ? 'verweisBearbeiten' : 'hinzufuegen',
      );
      expect(nativ.banner).not.toHaveBeenCalled();
    } finally {
      protokoll.mockRestore();
    }
  },
);
it('verliert bei einem defekten Meldungsempfänger weder Speicherung noch Historie', async () => {
  nativ.abschliessen.mockRejectedValue(new Error('Abschluss'));
  const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await expect(
      speichern(kontext, '§ 1 BGB', () => {
        throw new Error('Meldung');
      }),
    ).resolves.toEqual({ art: 'erfolg' });
    expect(geschrieben()).toHaveLength(1);
    expect(nativ.historie).toHaveBeenCalledTimes(1);
    expect(nativ.banner).not.toHaveBeenCalled();
  } finally {
    protokoll.mockRestore();
  }
});
it('gibt echte Überlappungsablehnung lokal ohne Ereignis oder neue Historienaktion zurück', async () => {
  const textstelle = { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 4 };
  await hinzufuegenMarkierung(
    gesetz,
    markierungsEintrag({
      bezug: { typ: 'bezugstext' as const, textstelle: textstelle, bezugstext: '' },
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle('§ 1'),

      kommentarText: 'Besetzt',
    }),
  );
  nativ.befehl.mockClear();
  const k = { ...kontext, auswahl: { textstelle, bezugstext: 'Text' } };
  const ergebnis = await speichereVerweismarkierung(
    k,
    markierungsEinzelzugriffFuerTest,
    '§ 1 BGB',
    true,
    false,
    new Map(),
    undefined,
    undefined,
    empfangen,
  );
  expect(ergebnis).toEqual({
    art: 'fehler',
    fehler: [
      { art: 'sonst', text: 'Es kann nicht mehrere Markierungen an der gleichen Stelle geben.' },
    ],
  });
  expect(nativ.ereignis).not.toHaveBeenCalled();
  ohneSpeicherung();
});
it('kennzeichnet unverändertes Bearbeiten ohne Schreiben oder Historienaktion', async () => {
  await speichern();
  const eintrag = (await ladeMarkierungen(gesetz))[0]!;
  nativ.befehl.mockClear();
  nativ.historie.mockClear();
  await expect(
    speichern({
      ...kontext,
      bearbeiten: {
        zitatText: '§ 1 BGB',
        vorher: {
          verweisinhalt: eintrag.verweisinhalt!,
          elementstand: eintrag.bezug.elementstand,
        },
      },
    }),
  ).resolves.toEqual({ art: 'erfolg', unveraendert: true });
  ohneSpeicherung();
});
it('behält präzise Zielnormfehler trotz zusätzlichem Ladebefund', async () => {
  nativ.bestand.set('gesetze/StGB_de-bund.xml', 'unlesbar');
  const lesen = nativ.lesen.getMockImplementation()!;
  nativ.lesen.mockImplementation(async (pfad) => {
    if (pfad.endsWith('StGB_de-bund.xml')) throw new Error('Fremdquelle');
    return lesen(pfad);
  });
  await expect(speichern(kontext, '§ 999 BGB')).resolves.toMatchObject({
    art: 'fehler',
    fehler: [expect.objectContaining({ art: 'norm' })],
  });
  expect(befunde).toEqual([]);
  expect(befunde.every((meldung) => meldung.anlass === 'lesen')).toBe(true);
  ohneSpeicherung();
});
it('liest bei der Kandidatenermittlung keine zusätzliche Gesetzdatei', async () => {
  const lesen = nativ.lesen.getMockImplementation()!;
  let anzahl = 0;
  nativ.lesen.mockImplementation(async (pfad) => {
    if (pfad.endsWith('BGB_de-bund.xml')) ++anzahl;
    return lesen(pfad);
  });
  await expect(speichern(kontext, '§ 1')).resolves.toEqual({ art: 'erfolg' });
  expect(anzahl).toBe(3);
  expect(befunde).toEqual([]);
  expect(nativ.banner).not.toHaveBeenCalled();
});
it('verhindert Speichern bei unlesbarer Ausgangsquelle und meldet den Ladefehler', async () => {
  nativ.lesen.mockRejectedValue(new Error('Ausgangsquelle'));
  await expect(speichern()).rejects.toThrow('Ausgangsquelle konnte nicht zuverlässig gelesen');
  expect(befunde).toEqual([expect.objectContaining({ anlass: 'lesen', art: 'fehler' })]);
  ohneSpeicherung();
});
it('meldet auch Ladefehler der frischen Ausgangsquelle beim Bearbeiten', async () => {
  await speichern();
  const eintrag = (await ladeMarkierungen(gesetz))[0]!;
  nativ.befehl.mockClear();
  nativ.historie.mockClear();
  const lesen = nativ.lesen.getMockImplementation()!;
  let laeufe = 0;
  nativ.lesen.mockImplementation(async (pfad) => {
    if (pfad.endsWith('BGB_de-bund.xml') && ++laeufe === 2) throw new Error('Frische Quelle');
    return lesen(pfad);
  });
  await expect(
    speichern({
      ...kontext,
      bearbeiten: {
        zitatText: '§ 1 BGB',
        vorher: { elementstand: testElementstand(), verweisinhalt: eintrag.verweisinhalt! },
      },
    }),
  ).rejects.toThrow('Ausgangsquelle');
  expect(befunde).toEqual([expect.objectContaining({ anlass: 'lesen', art: 'fehler' })]);
  ohneSpeicherung();
});
it('behandelt Archivierung eines verschwundenen Verweises nicht als erfolgreiche Bearbeitung', async () => {
  nativ.bestand.set(markierungen, 'defekt');
  const befehl = nativ.befehl.getMockImplementation()!;
  nativ.befehl.mockImplementation(async (name, daten) => {
    if (name === 'archiviere_beschaedigte_datei') {
      nativ.bestand.set('Kopie', nativ.bestand.get(markierungen) ?? '');
      nativ.bestand.delete(markierungen);
      return { status: 'archiviert', sicherungspfad: 'Kopie' };
    }
    return befehl(name, daten);
  });
  await expect(
    speichern({
      ...kontext,
      bearbeiten: {
        zitatText: '§ 1',
        vorher: {
          elementstand: testElementstand(),
          verweisinhalt: { verweistext: '§ 1', verweisziele: [] },
        },
      },
    }),
  ).resolves.toMatchObject({ art: 'fehler', fehler: [expect.objectContaining({ art: 'sonst' })] });
  expect(befunde).toEqual([
    expect.objectContaining({ anlass: 'sicherung', aenderungsstand: 'teilweise' }),
  ]);
  ohneSpeicherung();
});
it('trennt Meldungen paralleler Speicheraktionen ohne globalen Empfänger', async () => {
  let freigeben!: () => void;
  const warten = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  let sperren = 0;
  const nativAufrufen = nativ.befehl.getMockImplementation()!;
  nativ.befehl.mockImplementation(async (name, args) => {
    if (name !== 'datei_sperre_erwerben') return nativAufrufen(name, args);
    if (++sperren === 1) {
      await warten;
      throw 'wartefrist';
    }
    throw 'ipc';
  });
  const andere: AktionsMeldung[] = [];
  const erste = expect(speichern()).rejects.toBe('wartefrist');
  await expect(
    speichern(kontext, '§ 1', (meldung) => {
      andere.push(meldung);
    }),
  ).rejects.toBe('ipc');
  expect(befunde).toEqual([]);
  freigeben();
  await erste;
  expect(befunde).toEqual([
    expect.objectContaining({ text: 'Die Datei wird noch bearbeitet. Bitte erneut versuchen.' }),
  ]);
  expect(andere).toEqual([
    expect.objectContaining({
      text: 'Die Dateisperre konnte nicht erworben werden. Bitte erneut versuchen.',
    }),
  ]);
  ohneSpeicherung();
});
