// @vitest-environment jsdom
// G-A4: sieben echte XML-Eingänge im ZIP, reale Fachschichten und reale Übersicht.
import { io, vorbereiten } from '@/test/import/gemischterZipNativeAttrappe';
import { act } from 'react';
import { alleBannerSchliessen, getSnapshot, zeigeBanner } from '@/lib/banner/banner.index';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { DateiImportOverlay } from './DateiImportOverlay';
import { MELDUNGSGRUND_HINWEIS } from '@/lib/domain/app/aktionsMeldung';
import { importierePfade } from '@/test/import/dateiImportTesthilfe';
import { initialisiereMarkierungen, ladeMarkierungen } from '@/lib/markierungen/markierungen.index';
import { setzeReservierteTastenkuerzel } from '@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher';

const gesetz = { normgeber: 'de-bund', kurztitel: 'BGB' };
const favoriten = 'favoriten/BGB_de-bund-favoriten.xml';
const markierungen = 'markierungen/BGB_de-bund-markierungen.xml';
const kommentar =
  '<kommentar><bezeichnung>§ 1</bezeichnung><elementstand><textlaenge>4</textlaenge></elementstand><kommentartext>Lesbar</kommentartext></kommentar>';
const defekte =
  '<unterstreichung><bezeichnung>§ 9</bezeichnung></unterstreichung><kommentar><bezeichnung>§ 1313</bezeichnung><elementstand><textlaenge>0</textlaenge></elementstand></kommentar>';
function dateien(teilweise = false, version = '1') {
  return {
    'Gesetze/BGB.xml':
      '<gesetz version="1"><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel><langtitel>Bürgerliches Gesetzbuch</langtitel></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><text><absatz>Text</absatz></text></norm></inhalt></gesetz>',
    'Markierungen/BGB.xml': `<markierungen version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt>${kommentar}${teilweise ? defekte : ''}</inhalt></markierungen>`,
    'Favoriten/BGB.xml': `<favoriten version="${version}"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><eintrag><bezeichnung>1</bezeichnung></eintrag></inhalt></favoriten>`,
    'Daten/lesezeichen.xml':
      '<lesezeichen version="1"><inhalt><eintrag><gesetz normgeber="de-bund">BGB</gesetz><bezeichnung>1</bezeichnung></eintrag></inhalt></lesezeichen>',
    'Daten/Kurzbefehle.xml':
      '<gesetzeskurzbefehle version="1"><inhalt><gesetzeskurzbefehl><gesetz normgeber="de-bund">BGB</gesetz><taste primaer="true">e</taste></gesetzeskurzbefehl></inhalt></gesetzeskurzbefehle>',
    'Titel/BGB.xml':
      '<nichtamtlicheTitel version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><norm><bezeichnung>§ 1</bezeichnung><titel>Mein Titel</titel></norm></inhalt></nichtamtlicheTitel>',
    'Optionen/Einstellungen.xml':
      '<einstellungen version="1"><verarbeitungszeit>2026-10-24T00:00:00Z</verarbeitungszeit><farbschema>hell</farbschema></einstellungen>',
  };
}
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vorbereiten();
  alleBannerSchliessen();
  initialisiereMarkierungen();
  setzeReservierteTastenkuerzel([]);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    await vi.runAllTimersAsync();
    root.unmount();
  });
  host.remove();
  vi.useRealTimers();
});
async function importieren(teilweise = false, version = '1') {
  const eingang = dateien(teilweise, version);
  io.archive.set(
    '/import/Sicherung.zip',
    zipSync(Object.fromEntries(Object.entries(eingang).map(([pfad, xml]) => [pfad, strToU8(xml)]))),
  );
  const lauf = importierePfade(['/import/Sicherung.zip']);
  let fertig = false;
  void lauf.then(() => {
    fertig = true;
  });
  await vi.waitFor(() => expect(fertig).toBe(true), { timeout: 3000 });
  const ergebnis = await lauf;
  await act(async () =>
    root.render(
      <DateiImportOverlay
        zustand={{ art: 'fertig', ergebnis }}
        onSchliessen={vi.fn()}
        onNeuLaden={async () => {}}
      />,
    ),
  );
  return ergebnis;
}
async function ersetzen(aktion = 'Ersetzen') {
  const button = [...host.querySelectorAll('button')].find((b) => b.textContent === aktion);
  if (!button) throw Error('Entscheidungsbutton fehlt');
  await act(async () => {
    button.click();
    await vi.runAllTimersAsync();
  });
}
it('übernimmt alle sieben Dateitypen mit ZIP-Herkunft, echtem Prüfabschluss, Backup und Broadcast ohne Banner', async () => {
  const ergebnis = await importieren();
  expect(ergebnis.fehler).toEqual([]);
  expect(ergebnis.konflikte).toEqual([]);
  expect(ergebnis.berichtEintraege).toHaveLength(7);
  // Je Dateityp eine Kategorie; Erfolge ohne Herkunftsdatei.
  expect(host.querySelectorAll('[data-kategorie]')).toHaveLength(Object.keys(dateien()).length);
  expect(host.textContent).not.toContain('Sicherung.zip');
  expect(io.dateien.get('gesetze/BGB_de-bund.xml')).toContain('Bürgerliches Gesetzbuch');
  expect(await ladeMarkierungen(gesetz)).toHaveLength(1);
  expect(io.dateien.get(favoriten)).toContain('<bezeichnung>1</bezeichnung>');
  expect(io.dateien.get('lesezeichen/lesezeichen.xml')).toContain('BGB');
  expect(io.dateien.get('einstellungen/gesetzeskurzbefehle.xml')).toContain('BGB');
  expect(io.dateien.get('nichtamtliche-titel/BGB_de-bund-nichtamtliche-titel.xml')).toContain(
    'Mein Titel',
  );
  expect(localStorage.getItem('lexlata.farbschema')).toBe('hell');
  expect(io.dateien.get('einstellungen/einstellungen-backup.xml')).toContain(
    '<farbschema>hell</farbschema>',
  );
  expect(io.quellen.size).toBe(0);
  expect(io.pruefungen.size).toBe(0);
  expect(io.dateien.get('markierungskonflikte.xml')).toContain('pruefstatus="aktuell"');
  expect(io.emit).toHaveBeenCalledWith({ kind: 'Any' }, 'gesetze-geaendert', [gesetz]);
  expect(getSnapshot()).toEqual([]);
});
it('berichtet Teilübernahme 9/1313, fremde Schemaversion und archivierten Bestand samt tatsächlicher Sicherung im selben ZIP', async () => {
  io.dateien.set(favoriten, 'beschädigter Bestand');
  await importieren(true, '999');
  expect(host.textContent).toContain('9: Der Textbezug');
  expect(host.textContent).toContain('1313: Der Kommentartext');
  expect(host.querySelector('[data-kategorie="markierung"]')?.textContent).toContain(
    'BGB (2 Markierungen nicht lesbar)',
  );
  expect(host.textContent).not.toContain('Sicherung.zip → Markierungen/BGB.xml');
  expect(host.textContent).toContain('Sicherung.zip → Favoriten/BGB.xml');
  expect(host.textContent).toContain('999');
  await ersetzen('Zusammenführen');
  // Sicherung als Grund am Namen; Pfade erscheinen nicht im Bericht.
  expect(host.querySelector('[data-kategorie="favoriten"]')?.textContent).toContain(
    MELDUNGSGRUND_HINWEIS.imDatenordnerGesichert,
  );
  expect(host.textContent).not.toContain(favoriten);
  // Nach der Übernahme steht die abweichende Schemaversion als Hinweis am Namen.
  expect(host.querySelector('[data-kategorie="favoriten"]')?.textContent).toContain(
    'Schemaversion abweichend',
  );
  expect(io.dateien.get(favoriten + '.sicherung')).toBe('beschädigter Bestand');
  expect(io.dateien.get(favoriten)).toContain('<bezeichnung>1</bezeichnung>');
  expect(await ladeMarkierungen(gesetz)).toHaveLength(1);
  expect(getSnapshot()).toEqual([]);
});
it.each(['offen', 'folgefehler', 'schreibfehler'] as const)(
  'bewahrt bei %s den tatsächlichen Entscheidungsstand neben sechs erfolgreichen ZIP-Dateien',
  async (fall) => {
    const alt = dateien()['Favoriten/BGB.xml'].replace(
      '<bezeichnung>1</bezeichnung>',
      '<bezeichnung>2</bezeichnung>',
    );
    io.dateien.set(favoriten, alt);
    const ergebnis = await importieren();
    expect(ergebnis.konflikte).toHaveLength(1);
    expect(host.textContent).toContain('Importkonflikte');
    expect(io.dateien.get(favoriten)).toBe(alt);
    expect(io.dateien.get(markierungen)).toContain('Lesbar');
    if (fall === 'folgefehler') io.ereignisfehler = 'favoriten-geaendert';
    if (fall === 'schreibfehler') io.schreibfehler = favoriten;
    if (fall !== 'offen') {
      const vorher = io.invoke.mock.calls.filter(
        ([name, args]) => name === 'atomar_datei_schreiben' && args.relativerPfad === favoriten,
      ).length;
      await ersetzen();
      const nachher = io.invoke.mock.calls.filter(
        ([name, args]) => name === 'atomar_datei_schreiben' && args.relativerPfad === favoriten,
      ).length;
      expect(nachher - vorher).toBe(1);
      expect(host.querySelector('[data-kategorie="favoriten"]')?.textContent).toContain('BGB');
      if (fall === 'folgefehler') {
        expect(io.dateien.get(favoriten)).toContain('<bezeichnung>1</bezeichnung>');
        expect(host.textContent).toContain(
          'Geöffnete Fenster zeigen den aktuellen Stand möglicherweise erst nach erneutem Öffnen',
        );
        expect(host.textContent).not.toContain('Importkonflikte');
      } else {
        expect(io.dateien.get(favoriten)).toBe(alt);
        expect(host.textContent).toContain('Importkonflikte');
        expect(host.textContent).toContain('Schreiben verweigert');
      }
    }
    expect(getSnapshot()).toEqual([]);
  },
);

it('erhält einen unabhängigen Nichtimport-Banner beim gemischten ZIP-Import', async () => {
  zeigeBanner({ art: 'systemfehler', text: 'Unabhängiger Hinweis' });
  const vorher = getSnapshot();
  await importieren();
  expect(getSnapshot()).toEqual(vorher);
});
