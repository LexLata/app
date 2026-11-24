// @vitest-environment jsdom
// Echtes Kommentarfenster mit nativem Dialog, Beenden-Nachrichten und Fensterkreuz an der Tauri-Grenze.
import { ausstehendesPromise } from '@/test/plattform/ausstehendesPromise';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import {
  bereiteMarkierungsFensterDateienVor,
  markierungsFensterBedienung,
  markierungsFensterNativeAttrappe,
} from '@/test/markierungen/markierungsFensterNativeAttrappe';
import { ladeMarkierungen, type KommentarKontext } from '@/lib/markierungen/markierungen.index';
import KommentarFenster from './KommentarFenster';

const dialog = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/plugin-dialog', () => ({ message: dialog }));

const nativ = markierungsFensterNativeAttrappe<KommentarKontext>();
const dom = domTestWurzel();
const { feld, knopf, schreibaufrufe, warteAufAnzeige } = markierungsFensterBedienung(
  () => dom.host,
);
const gesetz = gesetzesreferenz({ kurztitel: 'BGB' });
const antworten = () =>
  nativ.invoke.mock.calls.filter(([befehl]) => befehl === 'beenden_anfrage_antworten');

async function senden(id: number, abbrechen = false) {
  await act(async () => {
    const ereignis = abbrechen ? 'beenden-anfrage-abbruch' : 'beenden-anfrage';
    const empfaenger = nativ.empfang.get(ereignis);
    if (!empfaenger) throw Error(`Empfänger für ${ereignis} fehlt`);
    empfaenger({ payload: { id } });
  });
}

function fensterkreuz() {
  if (!nativ.schliessanfrage.handler) throw Error('Schließschutz fehlt');
  return nativ.schliessanfrage.handler({ preventDefault: () => {} });
}

beforeEach(async () => {
  vi.clearAllMocks();
  nativ.dateien.clear();
  nativ.empfang.clear();
  nativ.historie.clear();
  nativ.schliessschutz = true;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  nativ.kontext = { gesetz, openerLabel: 'fenster-1', ausgangsstelle: normAusgangsstelle('§ 1') };
  dialog.mockReset();
  bereiteMarkierungsFensterDateienVor();
  nativ.close.mockImplementation(fensterkreuz);
  const bisher = nativ.invoke.getMockImplementation();
  if (!bisher) throw Error('Native Testgrenze fehlt');
  nativ.invoke.mockImplementation(async (name, args) => {
    if (name === 'beenden_anfrage_antworten' || name === 'beenden_anfrage_rueckfrage') return;
    return bisher(name, args);
  });

  await act(async () => dom.root.render(<KommentarFenster />));
  await act(async () => {
    const setzeWert = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setzeWert?.call(feld(), 'Mein Entwurf');
    feld().dispatchEvent(new Event('input', { bubbles: true }));
  });
});

afterEach(() => {
  nativ.schliessschutz = false;
  vi.unstubAllGlobals();
});

it.each([
  ['Abbrechen', false],
  ['Verwerfen', true],
])('meldet die Rückfrage und beantwortet „%s“', async (wahl, bereit) => {
  const auswahl = ausstehendesPromise<string>();
  dialog.mockReturnValue(auswahl.promise);
  await senden(1);
  expect(nativ.invoke).toHaveBeenCalledWith('beenden_anfrage_rueckfrage', { id: 1 });
  expect(antworten()).toEqual([]);
  await act(async () => auswahl.resolve(wahl));
  expect(antworten()).toEqual([['beenden_anfrage_antworten', { id: 1, bereit }]]);
  expect(feld().value).toBe('Mein Entwurf');
  expect(schreibaufrufe()).toHaveLength(0);
  expect(nativ.destroy).not.toHaveBeenCalled();
});

it('meldet bei einer bereits offenen Rückfrage zum Fensterkreuz nicht bereit', async () => {
  const auswahl = ausstehendesPromise<string>();
  dialog.mockReturnValue(auswahl.promise);
  let schliessen: Promise<void> | undefined;
  await act(async () => {
    schliessen = fensterkreuz();
  });
  expect(dialog).toHaveBeenCalledOnce();
  await senden(2);
  expect(antworten()).toEqual([['beenden_anfrage_antworten', { id: 2, bereit: false }]]);
  expect(dialog).toHaveBeenCalledOnce();
  await act(async () => {
    auswahl.resolve('Abbrechen');
    await schliessen;
  });
  expect(feld().value).toBe('Mein Entwurf');
  expect(nativ.destroy).not.toHaveBeenCalled();
});

it.each(['Verwerfen', 'Speichern'])(
  'behandelt „%s“ nach abgebrochener Beenden-Anfrage bei offenem Fenster',
  async (wahl) => {
    const auswahl = ausstehendesPromise<string>();
    dialog.mockReturnValue(auswahl.promise);
    await senden(3);
    expect(nativ.invoke).toHaveBeenCalledWith('beenden_anfrage_rueckfrage', { id: 3 });
    await senden(3, true);
    await act(async () => auswahl.resolve(wahl));
    await warteAufAnzeige(() => {
      if (wahl === 'Speichern') expect(knopf('Schließen').disabled).toBe(false);
      else expect(feld().disabled).toBe(false);
    });
    expect(antworten()).toEqual([]);
    expect(nativ.destroy).not.toHaveBeenCalled();
    expect(feld().value).toBe('Mein Entwurf');
    const gespeichert = await ladeMarkierungen(gesetz);
    expect(gespeichert.map((markierung) => markierung.kommentarText)).toEqual(
      wahl === 'Speichern' ? ['Mein Entwurf'] : [],
    );
  },
);

it.each([false, true])(
  'wartet auf eigenes Speichern und Schließen (Fensterkreuz: %s)',
  async (perFensterkreuz) => {
    const schreiben = ausstehendesPromise<void>();
    const schreibbeginn = ausstehendesPromise<void>();
    const bisher = nativ.invoke.getMockImplementation();
    if (!bisher) throw Error('Native Testgrenze fehlt');
    nativ.invoke.mockImplementation(async (name, args) => {
      if (name === 'atomar_datei_schreiben' && args.relativerPfad.startsWith('markierungen/')) {
        schreibbeginn.resolve();
        await schreiben.promise;
      }
      return bisher(name, args);
    });
    dialog.mockResolvedValue('Speichern');
    await act(async () => {
      if (perFensterkreuz) void fensterkreuz();
      else knopf('Fertig').click();
      await schreibbeginn.promise;
    });
    await senden(4);
    expect(antworten()).toEqual([]);
    expect(nativ.destroy).not.toHaveBeenCalled();

    await act(async () => schreiben.resolve());
    await warteAufAnzeige(() =>
      expect(antworten()).toEqual([['beenden_anfrage_antworten', { id: 4, bereit: true }]]),
    );
    expect(nativ.destroy).toHaveBeenCalledOnce();
    expect((await ladeMarkierungen(gesetz))[0]?.kommentarText).toBe('Mein Entwurf');
  },
);

it('lässt den Entwurf offen, wenn das bereits laufende Speichern fehlschlägt', async () => {
  const schreiben = ausstehendesPromise<void>();
  const schreibbeginn = ausstehendesPromise<void>();
  const bisher = nativ.invoke.getMockImplementation();
  if (!bisher) throw Error('Native Testgrenze fehlt');
  nativ.invoke.mockImplementation(async (name, args) => {
    if (name === 'atomar_datei_schreiben' && args.relativerPfad.startsWith('markierungen/')) {
      schreibbeginn.resolve();
      await schreiben.promise;
      throw new Error('Speichern fehlgeschlagen');
    }
    return bisher(name, args);
  });
  await act(async () => {
    knopf('Fertig').click();
    await schreibbeginn.promise;
  });
  await senden(5);
  expect(antworten()).toEqual([]);

  await act(async () => schreiben.resolve());
  await warteAufAnzeige(() =>
    expect(antworten()).toEqual([['beenden_anfrage_antworten', { id: 5, bereit: false }]]),
  );
  expect(nativ.destroy).not.toHaveBeenCalled();
  expect(feld().value).toBe('Mein Entwurf');
  expect(feld().disabled).toBe(false);
});
