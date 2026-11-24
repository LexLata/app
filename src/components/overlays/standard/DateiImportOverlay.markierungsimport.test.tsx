// @vitest-environment jsdom
// Durchgängige Datei-/ZIP-Importproben mit realen Markierungsspeichern und Overlayaktionen.
import '@/test/import/dateiImportOverlayAnzeigeAttrappen';
import { act } from 'react';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { DateiImportOverlay } from './DateiImportOverlay';
import { type DateiImportErgebnis } from '@/lib/import-export/import-export.index';
import { importierePfade } from '@/test/import/dateiImportTesthilfe';
import {
  initialisiereMarkierungen,
  beurteileMarkierungsImport,
  type MarkierungsEintrag,
} from '@/lib/markierungen/markierungen.index';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { erzeugeSperreAttrappe } from '@/test/plattform/dateiSperreAttrappe';

const io = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  archive: new Map<string, Uint8Array>(),
  schreiben: vi.fn(),
  archiv: vi.fn(),
  banner: vi.fn(),
  sperren: vi.fn(),
  pruefvorgang: vi.fn(),
  vormerken: vi.fn(),
}));
// Native Brücke: Schreiben, Prüfvorgangsstand und Sperren der echten Markierungskonfliktprüfung,
// übrige Befehle (Archiv, Sicherung) getrennt.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (befehl: string, args: { relativerPfad: string; inhalt: string }) =>
    befehl === 'atomar_datei_schreiben'
      ? io.schreiben(args.relativerPfad, args.inhalt)
      : befehl.startsWith('pruefvorgang_')
        ? io.pruefvorgang(befehl, args)
        : befehl.startsWith('datei_sperre_')
          ? befehl === 'datei_sperre_fortsetzen' || undefined
          : io.archiv(befehl, args),
}));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: vi.fn(async () => {}) }));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: (...args: unknown[]) => io.banner(...args),
}));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: async (pfad: string) => {
    const inhalt = io.dateien.get(pfad.replace('/daten/LexLata/', ''));
    if (inhalt === undefined) throw new Error('Zugriff verweigert');
    return inhalt;
  },
  readFile: async (pfad: string) => erforderlich(io.archive.get(pfad)),
  exists: async (pfad: string) => io.dateien.has(pfad.replace('/daten/LexLata/', '')),
  mkdir: async () => {},
}));
vi.mock('@/lib/persistenz/kern/kern.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/kern/kern.index')>()),
  pruefeSchemaversion: async () => {},
  ermittleGesetzDateipfad: async () => bestand,
  mitGesetzDateiSperre: (
    _ref: unknown,
    _ordner: string,
    _suffix: string,
    aktion: (token: string) => Promise<unknown>,
  ) => io.sperren('quelle', aktion),
  merkePruefpflichtigeAenderungVor: (empfangen?: AktionsMeldungEmpfaenger) =>
    io.vormerken(empfangen),
  schliessePruefpflichtigeQuelleAb: async () => true,
  sicherstelleOrdner: async () => {},
}));
vi.mock('@/lib/import/import.index', async (original) => ({
  ...(await original<typeof import('@/lib/import/import.index')>()),
  mitGesetzDateiImport: async (aktion: (importieren: unknown) => Promise<unknown>) =>
    aktion(vi.fn()),
}));
// Die echte Markierungskonfliktprüfung folgt jedem Markierungsimport.
initialisiereMarkierungen();

const gesetz = { kurztitel: 'BGB', normgeber: 'de-bund' };
const bestand = 'markierungen/BGB_de-bund-markierungen.xml';

function erforderlich<T>(wert: T | null | undefined): T {
  if (wert === undefined || wert === null) throw new Error('Erwarteter Testwert fehlt.');
  return wert;
}
/** Kleine XML-Proben für die hier verwendeten Kommentare und Textmarkierungen. */
function testXML(eintraege: readonly MarkierungsEintrag[]) {
  const inhalt = eintraege
    .map((e) => {
      if (e.ausgangsstelle.typ !== 'norm') throw new Error('Diese Probe erwartet eine Norm.');
      const bezug =
        e.bezug.typ === 'pauschal'
          ? '<elementstand><textlaenge>0</textlaenge></elementstand>'
          : '<textstelle><zeichenbereich start="0" ende="4"/></textstelle><bezugstext>Text</bezugstext>';
      return `<${e.typ}><bezeichnung>${e.ausgangsstelle.bezeichnung}</bezeichnung>${bezug}${e.typ === 'kommentar' ? `<kommentartext>${e.kommentarText}</kommentartext>` : ''}</${e.typ}>`;
    })
    .join('');
  return `<markierungen schemaversion="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt>${inhalt}</inhalt></markierungen>`;
}
function parseTestXML(xml: string, referenz = gesetz) {
  return beurteileMarkierungsImport(xml, referenz);
}

const quelle = '/import/BGB.xml';
const gut = markierungsEintrag({
  typ: 'kommentar',
  ausgangsstelle: normAusgangsstelle('§ 1'),
  bezug: { typ: 'pauschal', elementstand: { textlaenge: 0 } },
  kommentarText: 'Lesbar',
});
const defekte =
  '<unterstreichung><bezeichnung>§ 9</bezeichnung></unterstreichung>' +
  '<kommentar><bezeichnung>§ 1313</bezeichnung><elementstand><textlaenge>0</textlaenge></elementstand></kommentar>';
function eingang(lesbar = true, defekt = true) {
  return testXML(lesbar ? [gut] : []).replace('</inhalt>', `${defekt ? defekte : ''}</inhalt>`);
}
let wurzel: Root;
let container: HTMLDivElement;
async function anzeigen(ergebnis: DateiImportErgebnis) {
  await act(async () =>
    wurzel.render(
      <DateiImportOverlay
        zustand={{ art: 'fertig', ergebnis }}
        onSchliessen={vi.fn()}
        onNeuLaden={vi.fn()}
      />,
    ),
  );
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  io.pruefvorgang.mockResolvedValue({ offeneQuellen: 0, offenePruefungen: 0, vollbedarf: false });
  io.vormerken.mockResolvedValue('vorgang');
  io.dateien.clear();
  io.archive.clear();
  io.sperren.mockImplementation(erzeugeSperreAttrappe());
  io.schreiben.mockImplementation(async (pfad: string, inhalt: string) => {
    io.dateien.set(pfad, inhalt);
  });
  container = document.createElement('div');
  document.body.append(container);
  wurzel = createRoot(container);
});
afterEach(async () => {
  await act(async () => wurzel.unmount());
  container.remove();
});
it('berichtet bei Erstimport Teilübernahme, beide Ausgangsstellen und Gründe mit Dateiherkunft ohne Banner', async () => {
  const original = eingang();
  io.dateien.set(quelle, original);
  const ergebnis = await importierePfade([quelle]);
  await anzeigen(ergebnis);
  // Erfolge nennen den Kurztitel, nicht die Herkunftsdatei.
  expect(container.textContent).toContain('BGB (2 Markierungen nicht lesbar)');
  expect(container.textContent).not.toContain('BGB.xml');
  expect(container.textContent).toContain('9');
  expect(container.textContent).toContain('Textbezug');
  expect(container.textContent).toContain('1313');
  expect(container.textContent).toContain('Kommentartext');
  expect(io.banner).not.toHaveBeenCalled();
  expect(io.dateien.get(quelle)).toBe(original);
  expect(parseTestXML(erforderlich(io.dateien.get(bestand)), gesetz).eintraege).toEqual([gut]);
});

async function klicken(text: string) {
  const button = [...container.querySelectorAll('button')].find((b) => b.textContent === text);
  expect(button).toBeDefined();
  await act(async () => erforderlich(button).click());
}
function gespeicherte() {
  return parseTestXML(erforderlich(io.dateien.get(bestand)), gesetz).eintraege;
}
/** Schreibvorgänge der Markierungsdatei; die Konfliktprüfung schreibt zusätzlich ihr Ergebnis. */
function markierungsdateiSchreibvorgaenge() {
  return io.schreiben.mock.calls.filter(([pfad]) => pfad === bestand).length;
}
const alt = { ...gut, ausgangsstelle: normAusgangsstelle('§ 2'), kommentarText: 'Bestand' };
it.each(['Ersetzen', 'Zusammenführen'])(
  'berichtet dieselben Einzelbefunde nach echter Overlayaktion %s',
  async (aktion) => {
    io.dateien.set(bestand, testXML([alt]));
    const original = eingang();
    io.dateien.set(quelle, original);
    await anzeigen(await importierePfade([quelle]));
    expect(container.textContent).toContain('BGB.xml (BGB Markierungen)');
    await klicken(aktion);
    expect(container.textContent).toContain('BGB (2 Markierungen nicht lesbar)');
    expect(container.textContent).toContain('9: Der Textbezug');
    expect(container.textContent).toContain('1313: Der Kommentartext');
    expect(container.textContent).not.toContain('Importkonflikte');
    expect(gespeicherte()).toEqual(aktion === 'Ersetzen' ? [gut] : [gut, alt]);
    expect(io.dateien.get(quelle)).toBe(original);
    expect(io.banner).not.toHaveBeenCalled();
  },
);
it.each([false, true])(
  'übernimmt ausschließlich ungültigen Eingang niemals (Bestand vorhanden: %s)',
  async (vorhanden) => {
    const originalBestand = testXML([alt]);
    if (vorhanden) io.dateien.set(bestand, originalBestand);
    io.dateien.set(quelle, eingang(false));
    const ergebnis = await importierePfade([quelle]);
    await anzeigen(ergebnis);
    expect(ergebnis.konflikte).toEqual([]);
    expect(container.textContent).toContain('nicht übernommen');
    expect(container.textContent).not.toContain('erfolgreich');
    expect(io.dateien.get(bestand)).toBe(vorhanden ? originalBestand : undefined);
    expect(io.schreiben).not.toHaveBeenCalled();
    expect(io.archiv).not.toHaveBeenCalled();
    expect(io.banner).not.toHaveBeenCalled();
  },
);
it('unterscheidet gültigen leeren Eingang: Ersetzen leert vorhandenen Bestand bewusst', async () => {
  io.dateien.set(bestand, testXML([alt]));
  io.dateien.set(quelle, eingang(false, false));
  await anzeigen(await importierePfade([quelle]));
  await klicken('Ersetzen');
  expect(gespeicherte()).toEqual([]);
  expect(container.textContent).toContain('ersetzt');
  expect(container.textContent).not.toContain('nicht übernommen');
});
it('wiederholter Teilimport bewahrt Diagnose ohne erneute Schreibung oder Sicherung', async () => {
  io.dateien.set(quelle, eingang());
  await importierePfade([quelle]);
  io.schreiben.mockClear();
  await anzeigen(await importierePfade([quelle]));
  expect(container.textContent).toContain('schon in dieser Version');
  expect(container.textContent).toContain('9: Der Textbezug');
  expect(container.textContent).toContain('1313: Der Kommentartext');
  expect(container.textContent).not.toContain('erfolgreich');
  expect(io.schreiben).not.toHaveBeenCalled();
  expect(io.archiv).not.toHaveBeenCalled();
});
it.each([true, false])(
  'Merge-Dopplungsregel bleibt bei Checkboxwert %s einschließlich unverändertem Speicherstand erhalten',
  async (behalten) => {
    const bestehend = {
      ausgangsstelle: gut.ausgangsstelle,
      typ: 'unterstreichung' as const,
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: { typ: 'normtext' as const },
          zeichenbereichStart: 0,
          zeichenbereichEnde: 4,
        },
        bezugstext: 'Text',
      },
    };
    const neu = { ...bestehend, typ: 'hervorhebung' as const };
    io.dateien.set(bestand, testXML([bestehend]));
    io.dateien.set(quelle, testXML([neu]).replace('</inhalt>', `${defekte}</inhalt>`));
    await anzeigen(await importierePfade([quelle]));
    if (!behalten)
      await act(async () =>
        erforderlich(container.querySelector<HTMLInputElement>('input[type="checkbox"]')).click(),
      );
    await klicken('Zusammenführen');
    expect(gespeicherte()).toEqual(
      parseTestXML(testXML([behalten ? bestehend : neu]), gesetz).eintraege,
    );
    expect(container.textContent).toContain(
      behalten ? 'schon in dieser Version' : 'zusammengeführt',
    );
    expect(container.textContent).toContain('1313: Der Kommentartext');
    expect(markierungsdateiSchreibvorgaenge()).toBe(behalten ? 0 : 1);
  },
);
it('gleichnamige ZIP-Dateien bleiben nach Konfliktentscheidung einschließlich Archiv und Ordner unterscheidbar', async () => {
  io.dateien.set(bestand, testXML([alt]));
  io.archive.set(
    '/import/Sicherung.zip',
    zipSync({
      'Ordner/BGB.xml': strToU8(eingang()),
      'Weiterer/BGB.xml': strToU8(eingang()),
    }),
  );
  await anzeigen(await importierePfade(['/import/Sicherung.zip']));
  expect(container.textContent).toContain('Sicherung.zip → Ordner/BGB.xml');
  expect(container.textContent).toContain('Sicherung.zip → Weiterer/BGB.xml');
  await klicken('Alle ersetzen');
  // Im Bericht erscheint der Kurztitel einmal; die Herkunft nennt nur die Konfliktliste.
  expect(container.textContent).toMatch(/BGB[^.]* ersetzt/);
  expect(container.textContent).not.toContain('Sicherung.zip');
  expect(container.textContent).not.toContain('Importkonflikte');
  expect(markierungsdateiSchreibvorgaenge()).toBe(1);
});
it('bewahrt defektes ZIP und Lesefehler gemeinsam mit erfolgreicher Nachbardatei und unterscheidbaren Einzelpfaden', async () => {
  io.archive.set('/import/Defekt.zip', new Uint8Array([1, 2, 3]));
  io.dateien.set('/anderer/BGB.xml', eingang(true, false));
  await anzeigen(await importierePfade(['/import/Defekt.zip', quelle, '/anderer/BGB.xml']));
  const fehler = erforderlich(container.querySelector('[data-kategorie="fehler"]')).textContent;
  expect(fehler).toContain('Defekt.zip');
  expect(fehler).toContain('BGB.xml');
  expect(fehler).not.toContain('/import/');
  expect(
    erforderlich(container.querySelector('[data-kategorie="markierung"]')).textContent,
  ).toContain('BGB');
  expect(gespeicherte()).toEqual([gut]);
});

it.each(['Ersetzen', 'Zusammenführen'])(
  'wehrt ausschließlich ungültigen Eingang auch unmittelbar vor Overlayaktion %s ab',
  async (aktion) => {
    const original = testXML([alt]);
    io.dateien.set(bestand, original);
    await anzeigen({
      konflikte: [
        {
          art: 'markierung',
          gesetz,
          kurztitel: 'BGB',
          anzeigename: 'BGB Markierungen',
          importInhalt: eingang(false),
          quelle: 'Sicherung.zip → Ordner/BGB.xml',
        },
      ],
      berichtEintraege: [],
      fehler: [],
    });
    await klicken(aktion);
    expect(container.textContent).toContain('BGB');
    expect(container.textContent).toContain('nicht übernommen');
    expect(container.textContent).toContain('1313: Der Kommentartext');
    expect(io.dateien.get(bestand)).toBe(original);
    expect(io.schreiben).not.toHaveBeenCalled();
    expect(io.archiv).not.toHaveBeenCalled();
    expect(io.banner).not.toHaveBeenCalled();
  },
);
it('bewahrt die bisherigen Ersetzen-Regeln gesunder Dateien einschließlich unbekannter Erweiterungen', async () => {
  io.dateien.set(bestand, testXML([gut]));
  const original = eingang(true, false).replace(
    '</inhalt>',
    '<erweiterung>Import</erweiterung></inhalt>',
  );
  io.dateien.set(quelle, original);
  await anzeigen(await importierePfade([quelle]));
  await klicken('Ersetzen');
  expect(io.dateien.get(bestand)).toBe(original);
  expect(markierungsdateiSchreibvorgaenge()).toBe(1);
});

it.each(['Ersetzen', 'Zusammenführen'])(
  'bestätigt echte Markierungsspeicherung trotz anschließendem Ereignisfehler: %s',
  async (aktion) => {
    io.dateien.set(bestand, testXML([alt]));
    io.dateien.set(quelle, eingang(true, false));
    await anzeigen(await importierePfade([quelle]));
    // Die anschließende Konfliktprüfung scheitert am nativen Prüfvorgang.
    io.pruefvorgang.mockRejectedValue(new Error('Ereignis nach Schreiben'));
    await klicken(aktion);
    expect(container.textContent).not.toContain('Importkonflikte');
    expect(container.textContent).toContain('Ereignis nach Schreiben');
    expect(container.textContent).toContain('BGB');
    expect(gespeicherte()).toEqual(aktion === 'Ersetzen' ? [gut] : [gut, alt]);
    expect(io.schreiben).toHaveBeenCalledOnce();
    expect(io.banner).not.toHaveBeenCalled();
  },
);

it.each(['erfolg', 'fehler', 'geschlossen'] as const)(
  'behält nach 30 Sekunden Speicherstand und Dateiherkunft bei spätem %s',
  async (ende) => {
    vi.useFakeTimers();
    let beenden!: () => void;
    let ablehnen!: (fehler: Error) => void;
    const lauf = new Promise<void>((resolve, reject) => {
      beenden = resolve;
      ablehnen = reject;
    });
    // Die anschließende Konfliktprüfung wartet auf den nativen Prüfvorgangsstand.
    const stand = { offeneQuellen: 0, offenePruefungen: 0, vollbedarf: false };
    io.pruefvorgang.mockImplementation(() => lauf.then(() => stand));
    io.dateien.set(quelle, eingang(true, false));
    try {
      const importieren = importierePfade([quelle]);
      await vi.advanceTimersByTimeAsync(30_000);
      const ergebnis = await importieren;
      await anzeigen(ergebnis);
      expect(container.textContent).toContain('nach 30 Sekunden nicht bestätigt');
      expect(container.textContent).toContain('BGB');
      expect(io.dateien.get(bestand)).toContain('Lesbar');
      if (ende === 'geschlossen') await act(async () => wurzel.render(null));
      await act(async () => {
        if (ende === 'erfolg') beenden();
        else ablehnen(Error('Später Prüftransportfehler'));
        await vi.advanceTimersByTimeAsync(0);
      });
      if (ende !== 'geschlossen') {
        expect(container.textContent).not.toContain('nach 30 Sekunden nicht bestätigt');
        expect(container.textContent).toContain('BGB');
        if (ende === 'fehler')
          expect(container.textContent).toContain('Später Prüftransportfehler');
      }
      expect(markierungsdateiSchreibvorgaenge()).toBe(1);
      expect(io.banner).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  },
);

it.each(['erstimport', 'konflikt'] as const)(
  'erhält nach fehlgeschlagenem %s auch späte Reparaturbefunde',
  async (weg) => {
    vi.useFakeTimers();
    let ablehnen!: (fehler: Error) => void;
    const lauf = new Promise<void>((_resolve, reject) => {
      ablehnen = reject;
    });
    io.dateien.set(quelle, eingang(true, false));
    if (weg === 'konflikt') io.dateien.set(bestand, testXML([]));
    io.vormerken.mockImplementation((empfangen: AktionsMeldungEmpfaenger) => {
      empfangen.folgelaufErfassen?.(lauf);
      throw Error('Vormerkung fehlgeschlagen');
    });
    try {
      if (weg === 'erstimport') {
        const importieren = importierePfade([quelle]);
        await vi.advanceTimersByTimeAsync(30_000);
        await anzeigen(await importieren);
      } else {
        await anzeigen(await importierePfade([quelle]));
        await act(async () => {
          const button = [...container.querySelectorAll('button')].find(
            (b) => b.textContent === 'Ersetzen',
          );
          if (!button) throw Error('Importaktion fehlt');
          button.click();
          await vi.advanceTimersByTimeAsync(30_000);
        });
        expect(container.textContent).toContain('Importkonflikte');
      }
      expect(container.textContent).toContain('nicht übernommen');
      expect(container.textContent).toContain('nach 30 Sekunden nicht bestätigt');
      await act(async () => {
        ablehnen(Error('Späte Reparatur fehlgeschlagen'));
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(container.textContent).toContain('Späte Reparatur fehlgeschlagen');
      expect(container.textContent).toContain('BGB');
      expect(io.schreiben).not.toHaveBeenCalled();
      expect(io.banner).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  },
);
