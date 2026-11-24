// @vitest-environment jsdom
// Sammelbatch des Datei-Imports: Nur native Grenzen (Dateisystem, Tauri)
// sind ersetzt; Datei-Import, Gesetzspeicher und Suchverzeichnis laufen echt.
// Die Markierungskonfliktprüfung hängt als Batch-Subscriber am
// Speicher-Batch; hier steht ein über die öffentliche Schnittstelle
// beiSpeicherBatchAbgeschlossen angemeldeter Subscriber für sie.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { importierePfade } from '@/test/import/dateiImportTesthilfe';
import { mitGesetzDateiImport } from '@/lib/import/import.index';
import {
  beiSpeicherBatchAbgeschlossen,
  speichereGesetz,
  warteAufSpeicherBatchAbschluss,
} from '@/lib/persistenz/gesetz/gesetz.index';
import { registrierePruefpflichtigeAenderung } from '@/lib/persistenz/kern/kern.index';
import { loeseNormzielNachImportAuf } from '@/lib/gesetz-laden/gesetz-laden.index';
import { parseSuchanfrage } from '@/lib/domain/app/oeffnen/oeffnen.index';

// Native Prüfvorgangs-Registrierung (sonst Teil des Hauptfensters).
let vorgangNummer = 0;
registrierePruefpflichtigeAenderung({
  vormerken: async () => `v${++vorgangNummer}`,
  abschliessen: async () => {},
});

const NACHLAUF_MS = 200;
const SCHREIBDAUER_MS = 500;

function gesetzXML(kurztitel: string): string {
  return `<gesetz><infos><kurztitel>${kurztitel}</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><titel>Titel</titel><text><absatz>Inhalt ${kurztitel}</absatz></text></norm></inhalt></gesetz>`;
}

function legeQuelldateienAn(...kurztitel: string[]): string[] {
  return kurztitel.map((k) => {
    const pfad = `/quelle/${k}.xml`;
    io.dateien.set(pfad, gesetzXML(k));
    return pfad;
  });
}

type BatchAufruf = {
  betroffene: Gesetzesreferenz[];
  ausloeser?: { gesetz: Gesetzesreferenz; meldungEmpfangen?: AktionsMeldungEmpfaenger }[];
};
let batches: BatchAufruf[] = [];
let abmelden: () => void = () => {};
let batchReaktion: (aufruf: BatchAufruf) => void = () => {};

/** Kurztitel der betroffenen Gesetze des n-ten Batches. */
function kurztitelImBatch(n: number): string[] {
  return (batches[n]?.betroffene ?? []).map((r) => r.kurztitel).sort();
}

function referenz(kurztitel: string): Gesetzesreferenz {
  return { kurztitel, normgeber: 'de-bund' };
}

function suchverzeichnisPflegen(): number {
  return io.invoke.mock.calls.filter(
    ([name, args]) =>
      name === 'atomar_datei_schreiben' && args?.relativerPfad === 'cache/suchverzeichnis.json',
  ).length;
}

function gesetzeGeaendertEreignisse(): unknown[] {
  return io.emitTo.mock.calls
    .filter((args) => args[1] === 'gesetze-geaendert')
    .map((args) => args[2]);
}

/** Lässt Fake-Zeit verstreichen, bis das Versprechen erfüllt ist. */
async function mitZeit<T>(versprechen: Promise<T>): Promise<T> {
  let fertig = false;
  void versprechen.then(
    () => (fertig = true),
    () => (fertig = true),
  );
  for (let i = 0; i < 1000 && !fertig; i++) await vi.advanceTimersByTimeAsync(50);
  return versprechen;
}

function offenesTor() {
  let oeffnen: () => void = () => {};
  const tor = new Promise<void>((resolve) => (oeffnen = resolve));
  return { tor, oeffnen };
}

beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  vi.useFakeTimers();
  // Jeder Schreibvorgang dauert länger als die Nachlauf-Frist.
  io.schreiben.mockImplementation(
    () => new Promise<void>((resolve) => setTimeout(resolve, SCHREIBDAUER_MS)),
  );
  batches = [];
  batchReaktion = () => {};
  abmelden = beiSpeicherBatchAbgeschlossen((betroffene, _vorgaenge, ausloeser) => {
    const aufruf = { betroffene: [...betroffene], ausloeser };
    batches.push(aufruf);
    batchReaktion(aufruf);
  });
});

afterEach(async () => {
  abmelden();
  await vi.runAllTimersAsync();
  vi.useRealTimers();
});

describe('Sammelbatch des Datei-Imports', () => {
  it('P1-A1: benachrichtigt Suchverzeichnis, Fenster und Prüfung genau einmal für alle neuen Gesetze', async () => {
    const pfade = legeQuelldateienAn('A', 'B', 'C');
    // Die Pflege ändert nur ein vorhandenes Suchverzeichnis.
    io.dateien.set(
      'cache/suchverzeichnis.json',
      JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
    );

    const ergebnis = await mitZeit(importierePfade(pfade));
    await mitZeit(warteAufSpeicherBatchAbschluss());

    expect(ergebnis.berichtEintraege.map((e) => [e.name, e.aktion])).toEqual([
      ['A', 'neu'],
      ['B', 'neu'],
      ['C', 'neu'],
    ]);
    expect(batches).toHaveLength(1);
    expect(kurztitelImBatch(0)).toEqual(['A', 'B', 'C']);
    expect(suchverzeichnisPflegen()).toBe(1);
    expect(gesetzeGeaendertEreignisse()).toEqual([[referenz('A'), referenz('B'), referenz('C')]]);
  });

  it('P1-A2: ordnet eine Meldung der Prüfung nur dem Berichtseintrag der auslösenden Datei zu', async () => {
    batchReaktion = ({ ausloeser }) => {
      for (const a of ausloeser ?? [])
        if (a.gesetz.kurztitel === 'A')
          a.meldungEmpfangen?.({
            typ: 'warnung',
            art: 'hinweis',
            anlass: 'pruefabschluss',
            aenderungsstand: 'vollstaendig',
            text: 'Markierungskonflikt in A',
          });
    };
    const ergebnis = await mitZeit(importierePfade(legeQuelldateienAn('A', 'B')));

    const [a, b] = ergebnis.berichtEintraege;
    expect(a?.name).toBe('A');
    expect(a?.meldungen?.map((m) => m.text)).toEqual(['Markierungskonflikt in A']);
    expect(b?.name).toBe('B');
    expect(b?.meldungen ?? []).toEqual([]);
  });

  it('P1-A3: ein paralleler Speichervorgang ohne Sammelbatch schließt unabhängig ab', async () => {
    const { tor, oeffnen } = offenesTor();
    io.schreiben.mockImplementationOnce(() => tor);
    const dateiImport = importierePfade(legeQuelldateienAn('A', 'B'));
    // Warten, bis der Datei-Import am Tor hängt.
    await vi.advanceTimersByTimeAsync(NACHLAUF_MS);

    await mitZeit(speichereGesetz(referenz('X'), gesetzXML('X')));
    await vi.advanceTimersByTimeAsync(NACHLAUF_MS * 2);
    expect(batches).toHaveLength(1);
    expect(kurztitelImBatch(0)).toEqual(['X']);

    oeffnen();
    await mitZeit(dateiImport);
    await mitZeit(warteAufSpeicherBatchAbschluss());
    expect(batches).toHaveLength(2);
    expect(kurztitelImBatch(1)).toEqual(['A', 'B']);
  });

  it('P1-A4: schließt den Sammelbatch genau einmal ab, wenn die Sammelarbeit wirft', async () => {
    const arbeit = mitGesetzDateiImport(async (importiereDatei) => {
      await importiereDatei('kanonisch-xml', gesetzXML('A'));
      throw new Error('Abschluss gescheitert');
    });
    await expect(mitZeit(arbeit)).rejects.toThrow('Abschluss gescheitert');
    await mitZeit(warteAufSpeicherBatchAbschluss());

    expect(batches).toHaveLength(1);
    expect(kurztitelImBatch(0)).toEqual(['A']);
  });

  it('P1-A4: schließt den Sammelbatch genau einmal ab, wenn eine Datei scheitert', async () => {
    const [a = '', b = ''] = legeQuelldateienAn('A', 'B');
    io.dateien.set('/quelle/kaputt.xml', '<gesetz><infos>');
    const ergebnis = await mitZeit(importierePfade([a, '/quelle/kaputt.xml', b]));
    await mitZeit(warteAufSpeicherBatchAbschluss());

    expect(ergebnis.berichtEintraege.map((e) => e.aktion)).toContain('nichtUebernommen');
    expect(batches).toHaveLength(1);
    expect(kurztitelImBatch(0)).toEqual(['A', 'B']);
  });

  it('Nachbesserung: Abschlussfrist beträgt 30 s plus 1 s je Datei und wird im Hinweis genannt', async () => {
    let batchEnde = 0;
    const { tor: haengt, oeffnen: loesen } = offenesTor();
    // Eine nie endende Batch-Reaktion (z. B. eine hängende Markierungskonfliktprüfung).
    const abmeldenHaengend = beiSpeicherBatchAbgeschlossen(() => {
      batchEnde = Date.now();
      return haengt;
    });
    try {
      let importEnde = 0;
      const ergebnis = await mitZeit(
        importierePfade(legeQuelldateienAn('A', 'B', 'C')).then((e) => {
          importEnde = Date.now();
          return e;
        }),
      );
      expect(importEnde - batchEnde).toBe(33_000);
      const texte = ergebnis.berichtEintraege.flatMap((e) => e.meldungen ?? []).map((m) => m.text);
      expect(texte).toHaveLength(3);
      for (const text of texte) expect(text).toContain('nach 33 Sekunden nicht bestätigt');
    } finally {
      abmeldenHaengend();
      loesen();
      await mitZeit(warteAufSpeicherBatchAbschluss());
    }
  });

  it('Nachbesserung: Warten und Normsprung nach parallelem Speichern enden vor dem offenen Sammelbatch', async () => {
    io.dateien.set(
      'cache/suchverzeichnis.json',
      JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
    );
    const { tor, oeffnen } = offenesTor();
    io.schreiben.mockImplementationOnce(() => tor);
    let dateiImportFertig = false;
    const dateiImport = importierePfade(legeQuelldateienAn('A')).then((e) => {
      dateiImportFertig = true;
      return e;
    });
    // Warten, bis der Datei-Import am Tor hängt.
    await vi.advanceTimersByTimeAsync(NACHLAUF_MS);

    await mitZeit(speichereGesetz(referenz('X'), gesetzXML('X')));
    await mitZeit(warteAufSpeicherBatchAbschluss());
    const xmlId = await mitZeit(loeseNormzielNachImportAuf(referenz('X'), parseSuchanfrage('1 X')));
    expect(xmlId).toBe('p1');
    expect(dateiImportFertig).toBe(false);

    oeffnen();
    await mitZeit(dateiImport);
    expect(dateiImportFertig).toBe(true);
  });

  it('meldet den Abschluss der Dateien, bevor der gemeinsame Abschluss des Imports läuft', async () => {
    // Ohne frühe Schlussmeldung stünde während des Abschlusses weiter „Datei n von n“.
    const ablauf: string[] = [];
    batchReaktion = () => ablauf.push('sammelbatch-abschluss');
    await mitZeit(
      importierePfade(legeQuelldateienAn('A', 'B'), (f) =>
        ablauf.push(
          f.phase === 'verarbeiten' ? `${f.erledigt}/${f.gesamt}:${f.datei ?? '-'}` : f.phase,
        ),
      ),
    );
    expect(ablauf.filter((a) => a !== 'lesen')).toEqual([
      '0/2:A.xml',
      '1/2:B.xml',
      '2/2:-',
      'sammelbatch-abschluss',
    ]);
  });
});
