// @vitest-environment jsdom
// Nach dem Sichern beschädigter Gesetzdateien endet die Vorbereitungsanzeige der Gesetzesliste.
import { io, xml } from '@/test/suchverzeichnis/suchverzeichnisNativeAttrappe';
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { useSuchverzeichnis } from '@/hooks/useSuchverzeichnis';
import { bereiteSuchverzeichnisVor } from '@/lib/gesetz-laden/gesetz-laden.index';
import { leseGesetz, warteAufSpeicherBatchAbschluss } from '@/lib/persistenz/gesetz/gesetz.index';
import { alleBannerSchliessen } from '@/lib/banner/banner.index';

const dom = domTestWurzel();
const kaputt = '<kaputt>unbekannt</kaputt>';
const zweite = xml.replaceAll('Probe', 'Zweite');

function Liste() {
  const { eintraege, wirdVorbereitet } = useSuchverzeichnis();
  return (
    <output data-vorbereitet={String(wirdVorbereitet)}>
      {eintraege.map((e) => `${e.kurztitel}:${e.status}`).join(',')}
    </output>
  );
}
function anzeige(): HTMLOutputElement {
  const ausgabe = dom.host.querySelector('output');
  if (!ausgabe) throw new Error('Liste fehlt');
  return ausgabe;
}

async function warteBisRuhig() {
  await act(async () => {
    await warteAufSpeicherBatchAbschluss();
  });
}

it.each([
  ['ohne bisherigen Verzeichnisstand', false],
  ['mit zuvor abgeglichenem Stand', true],
])(
  'beendet die Vorbereitung nach Sicherung beschädigter Dateien %s und entfernt deren Eintrag',
  async (_fall, zuvorAbgeglichen) => {
    alleBannerSchliessen();
    io.dateien.set('gesetze/Zweite_de-bund.xml', zweite);
    if (zuvorAbgeglichen) {
      io.dateien.set('gesetze/Probe_de-bund.xml', xml);
      expect(await bereiteSuchverzeichnisVor()).toBe(true);
      // Danach wird die Datei beschädigt.
      io.dateien.set('gesetze/Probe_de-bund.xml', kaputt);
      io.stempel.set('gesetze/Probe_de-bund.xml', 99);
    } else io.dateien.set('gesetze/Probe_de-bund.xml', kaputt);
    await act(async () => dom.root.render(<Liste />));
    await act(async () => {
      await bereiteSuchverzeichnisVor();
    });
    await warteBisRuhig();
    expect([...io.dateien.keys()]).not.toContain('gesetze/Probe_de-bund.xml');
    await vi.waitFor(() => expect(anzeige().dataset.vorbereitet).toBe('false'));
    // Der Eintrag der gesicherten Datei ist schon nach diesem Lauf entfernt.
    expect(anzeige().textContent).toBe('Zweite:in-ordnung');
  },
);

it('beendet die Vorbereitung, wenn paralleles Laden eine bereits aufgezählte Datei sichert', async () => {
  alleBannerSchliessen();
  io.dateien.set('gesetze/Probe_de-bund.xml', kaputt);
  io.dateien.set('gesetze/Zweite_de-bund.xml', zweite);
  // Der Abgleich hat die Datei aufgezählt; bevor er sie liest, sichert ein
  // paralleles Laden (Vorladen, Tab eines anderen Fensters) sie.
  const lesen = io.lesen.getMockImplementation();
  if (!lesen) throw new Error('Leseattrappe fehlt');
  let abgleichLiest!: () => void;
  const abgleichLiestProbe = new Promise<void>((resolve) => {
    abgleichLiest = resolve;
  });
  let freigeben!: () => void;
  const freigabe = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  let ersterZugriff = true;
  io.lesen.mockImplementation(async (pfad: string) => {
    if (pfad === 'gesetze/Probe_de-bund.xml' && ersterZugriff) {
      ersterZugriff = false;
      abgleichLiest();
      await freigabe;
    }
    return lesen(pfad);
  });
  await act(async () => dom.root.render(<Liste />));
  await act(async () => {
    const abgleich = bereiteSuchverzeichnisVor();
    await abgleichLiestProbe;
    await leseGesetz({ kurztitel: 'Probe', normgeber: 'de-bund' });
    expect([...io.dateien.keys()]).not.toContain('gesetze/Probe_de-bund.xml');
    freigeben();
    expect(await abgleich).toBe(true);
  });
  await warteBisRuhig();
  expect([...io.dateien.keys()]).not.toContain('gesetze/Probe_de-bund.xml');
  await vi.waitFor(() => expect(anzeige().dataset.vorbereitet).toBe('false'));
  expect(anzeige().textContent).toBe('Zweite:in-ordnung');
});
