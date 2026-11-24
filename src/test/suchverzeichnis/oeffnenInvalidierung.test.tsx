// @vitest-environment jsdom
// Offene Desktop-/mobile Suche über echte Ansichten und Importmodule aktualisieren.
import { suchverzeichnisTestdatei } from './suchverzeichnisFabriken';
import { io, bereiteImportindexDateienVor } from '@/test/import/importindexAnsichtUmgebung';
import { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OeffnenOverlay } from '@/components/overlays/overlays.index';
import { OeffnenScreenFixture } from '@/test/suchverzeichnis/OeffnenScreenFixture';
import { useImportindizesBereithalten } from '@/hooks/useImportindizesBereithalten';
import {
  leseImportindexZwischenspeicher,
  uebernehmeImportindexDatei,
  sucheKandidatenAlleQuellen,
} from '@/lib/import/import.index';
import { erzeugeSuchmessungBestand } from '@/test/import/suchmessungBestand';
import { importindexFixture } from '@/test/import/europaImportFixtures';
import { suchtrefferOeffnenFuerTest } from '@/test/suchverzeichnis/suchtrefferOeffnenFuerTest';
import { erstelleSpeicherbericht } from '@/lib/utils/speicherMessung';

let root: Root;
const oeffnen = vi.fn();
function neuerBund(kurztitel: string) {
  return importindexFixture(
    'de-bund',
    `<gesetz><kurztitel>${kurztitel}</kurztitel><langtitel>Gesetz zur Prüfung</langtitel><abrufkennung>${kurztitel}.xml</abrufkennung></gesetz>`,
  );
}
function fremd() {
  const handler = io.listener.get('importindex-geaendert');
  if (!handler) throw Error('Ereignisanmeldung fehlt');
  handler({ payload: { kategorie: 'de-bund', absender: 'fenster-a' } });
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  HTMLElement.prototype.scrollIntoView = vi.fn();
  bereiteImportindexDateienVor();
  io.lokal.set('importindizes/de-bund.xml', neuerBund('AltGesetz'));
  oeffnen.mockReset();
  leseImportindexZwischenspeicher();
  await vi.waitFor(() => expect(io.listener.has('importindex-geaendert')).toBe(true));
  fremd();
  const container = document.createElement('main');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function anzeigen(mobil: boolean) {
  await act(async () =>
    root.render(
      mobil ? (
        <OeffnenScreenFixture onGesetzGewaehlt={oeffnen} />
      ) : (
        <OeffnenOverlay
          gesetze={[]}
          aktivesGesetz={null}
          onSchliessen={() => {}}
          onGesetzOeffnen={oeffnen}
          onNeuenTabOeffnen={oeffnen}
          onInstalliertOeffnen={suchtrefferOeffnenFuerTest([], oeffnen, oeffnen)}
        />
      ),
    ),
  );
}
function eingeben(wert: string) {
  const input = document.querySelector('input');
  if (!input) throw Error('Suchfeld fehlt');
  const setzen = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setzen) throw Error('Browser-Eingabeschnittstelle fehlt');
  setzen.call(input, wert);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
async function suche(wert = 'Gesetz') {
  await act(async () => eingeben(wert));
}
function angebot() {
  const zeile = document.querySelector<HTMLElement>('[data-idx="0"]');
  if (!zeile) throw Error('Treffer fehlt');
  return zeile;
}
async function warteAuf(text: string) {
  await act(async () => {
    await vi.waitFor(() => expect(document.body.textContent).toContain(text));
  });
}
const ansichten = [false, true];
it.each(ansichten)(
  'aktualisiert eine offene Suche mit unverändertem Text (mobil: %s)',
  async (mobil) => {
    await anzeigen(mobil);
    await suche();
    await warteAuf('AltGesetz');
    io.lokal.set('importindizes/de-bund.xml', neuerBund('NeuGesetz'));
    await act(async () => fremd());
    await warteAuf('NeuGesetz');
    expect(document.body.textContent).not.toContain('AltGesetz');
    expect(document.querySelector('input')?.value).toBe('Gesetz');
  },
);
it.each(ansichten)(
  'sperrt alte Auswahl unmittelbar nach einem Signal vor Reacts Darstellung (mobil: %s)',
  async (mobil) => {
    await anzeigen(mobil);
    await suche();
    await warteAuf('AltGesetz');
    const alt = angebot();
    let freigeben!: () => void;
    const sperre = new Promise<void>((r) => {
      freigeben = r;
    });
    const lesen = io.lesen.getMockImplementation();
    if (!lesen) throw Error('Dateileser fehlt');
    io.lesen.mockImplementation(async (p: string) => {
      await sperre;
      return lesen(p);
    });
    await act(async () => {
      fremd();
      alt.click();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(document.body.textContent).not.toContain('AltGesetz');
    expect(document.body.textContent).not.toContain('wird importiert');
    expect(io.netz).not.toHaveBeenCalled();
    expect(oeffnen).not.toHaveBeenCalled();
    io.lokal.set('importindizes/de-bund.xml', neuerBund('NeuGesetz'));
    await act(async () => freigeben());
    await warteAuf('NeuGesetz');
  },
);
it.each(ansichten)(
  'übernimmt bei Invalidierung während des Ladens nur aktuelle Angebote (mobil: %s)',
  async (mobil) => {
    let freigeben!: () => void;
    const sperre = new Promise<void>((r) => {
      freigeben = r;
    });
    const ressourcen = io.ressourcen.getMockImplementation();
    if (!ressourcen) throw Error('Ressourcenleser fehlt');
    let erster = true;
    io.ressourcen.mockImplementation(async (p: string) => {
      if (erster && p.includes('praefixstrukturen')) {
        erster = false;
        await sperre;
      }
      return ressourcen(p);
    });
    await anzeigen(mobil);
    await suche();
    await vi.waitFor(() => expect(erster).toBe(false));
    io.lokal.set('importindizes/de-bund.xml', neuerBund('NeuGesetz'));
    await act(async () => fremd());
    await warteAuf('NeuGesetz');
    await act(async () => freigeben());
    expect(document.body.textContent).not.toContain('AltGesetz');
    expect(document.body.textContent).toContain('NeuGesetz');
  },
);
it.each(ansichten)(
  'öffnet mit vollständigem Bestand erneut ohne Lesen oder Ladehinweis (mobil: %s)',
  async (mobil) => {
    await anzeigen(mobil);
    await suche();
    await warteAuf('AltGesetz');
    await act(async () => root.render(null));
    const lesungen = indexLesungen().length + io.ressourcen.mock.calls.length;
    await anzeigen(mobil);
    await suche();
    expect(document.body.textContent).toContain('AltGesetz');
    expect(document.body.textContent).not.toContain('werden geladen');
    expect(indexLesungen().length + io.ressourcen.mock.calls.length).toBe(lesungen);
  },
);
it.each(ansichten)(
  'behält Teilergebnisse ohne Wiederholen beim Tippen; neuer Bedarf und erneutes Öffnen erlauben einen Versuch (mobil: %s)',
  async (mobil) => {
    io.fehler = true;
    await anzeigen(mobil);
    await suche();
    await warteAuf('AltGesetz');
    expect(leseImportindexZwischenspeicher()).toBeUndefined();
    const lesungen = indexLesungen().length;
    await suche('Geset');
    await suche('Gesetz');
    expect(indexLesungen()).toHaveLength(lesungen);
    await suche('');
    await suche();
    await warteAuf('AltGesetz');
    expect(indexLesungen()).toHaveLength(lesungen + 9);
    await act(async () => root.render(null));
    await anzeigen(mobil);
    await suche();
    await warteAuf('AltGesetz');
    expect(indexLesungen()).toHaveLength(lesungen + 18);
    await act(async () => fremd());
    await warteAuf('AltGesetz');
    expect(indexLesungen()).toHaveLength(lesungen + 27);
  },
);
it('lädt ohne Indexbedarf nach einem Signal erst beim späteren Bedarf', async () => {
  await anzeigen(false);
  const lesungen = indexLesungen().length;
  await act(async () => fremd());
  expect(indexLesungen()).toHaveLength(lesungen);
  await suche();
  await warteAuf('AltGesetz');
});
it('behält mobil ausschließlich Bund-Angebote auch nach Invalidierung', async () => {
  await anzeigen(true);
  await suche('PolG');
  await act(async () => {
    await sucheKandidatenAlleQuellen();
  });
  expect(document.body.textContent).not.toContain('Polizeigesetz');
  await act(async () => fremd());
  await act(async () => {
    await sucheKandidatenAlleQuellen();
  });
  expect(document.querySelector('[data-idx]')).toBeNull();
  await suche('DSGVO');
  expect(document.querySelector('[data-idx]')).toBeNull();
});

function Bereithalten({
  start,
  vorbereitung,
}: {
  start: boolean;
  vorbereitung: React.RefObject<Promise<void> | null>;
}) {
  useImportindizesBereithalten(start, vorbereitung);
  return null;
}
it('hält erst nach beiden Startbarrieren einmalig und teilt einen bereits laufenden Suchzugriff', async () => {
  vi.useFakeTimers();
  let freigeben!: () => void;
  const vorbereitung = {
    current: new Promise<void>((r) => {
      freigeben = r;
    }),
  };
  await act(async () => root.render(<Bereithalten start={false} vorbereitung={vorbereitung} />));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(io.lesen).not.toHaveBeenCalled();
  await act(async () => root.render(<Bereithalten start vorbereitung={vorbereitung} />));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(io.lesen).not.toHaveBeenCalled();
  await act(async () => freigeben());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(249);
  });
  expect(io.lesen).not.toHaveBeenCalled();
  let ladefreigabe!: () => void;
  const sperre = new Promise<void>((r) => {
    ladefreigabe = r;
  });
  const lesen = io.lesen.getMockImplementation();
  if (!lesen) throw Error('Dateileser fehlt');
  io.lesen.mockImplementation(async (p: string) => {
    await sperre;
    return lesen(p);
  });
  const frueheSuche = sucheKandidatenAlleQuellen();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(indexLesungen()).toHaveLength(3);
  ladefreigabe();
  await act(async () => {
    await frueheSuche;
  });
  expect(indexLesungen()).toHaveLength(9);
  const lesungen = indexLesungen().length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(indexLesungen()).toHaveLength(lesungen);
  const posten = erstelleSpeicherbericht().posten.find((p) => p.name.startsWith('Importindizes'));
  expect(posten?.zeichen).toBeGreaterThan(0);
});
it.each(['Abbau', 'Teilfehler'])('wiederholt Bereithalten nicht nach %s', async (fall) => {
  vi.useFakeTimers();
  io.fehler = fall === 'Teilfehler';
  const vorbereitung = { current: Promise.resolve() };
  await act(async () => root.render(<Bereithalten start vorbereitung={vorbereitung} />));
  if (fall === 'Abbau') await act(async () => root.render(null));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(indexLesungen()).toHaveLength(fall === 'Abbau' ? 0 : 9);
  const lesungen = indexLesungen().length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(indexLesungen()).toHaveLength(lesungen);
});

function FruehesSignal() {
  useLayoutEffect(() => {
    io.lokal.set('importindizes/de-bund.xml', neuerBund('NeuGesetz'));
    fremd();
    angebot().click();
  }, []);
  return null;
}
it('erkennt auch ein Signal zwischen erstem Rendern und Anmeldung der Ansicht', async () => {
  await sucheKandidatenAlleQuellen();
  await act(async () =>
    root.render(
      <>
        <FruehesSignal />
        <OeffnenOverlay
          gesetze={[]}
          aktivesGesetz={null}
          initialInput="Gesetz"
          onSchliessen={() => {}}
          onGesetzOeffnen={oeffnen}
          onNeuenTabOeffnen={oeffnen}
          onInstalliertOeffnen={suchtrefferOeffnenFuerTest([], oeffnen, oeffnen)}
        />
      </>,
    ),
  );
  await warteAuf('NeuGesetz');
  expect(document.body.textContent).not.toContain('AltGesetz');
});

it('aktualisiert die offene Suche auch nach einer echten lokalen Dateiübernahme', async () => {
  await anzeigen(false);
  await suche();
  await warteAuf('AltGesetz');
  await act(async () => {
    await uebernehmeImportindexDatei(neuerBund('NeuGesetz').replace('2026-10-01', '2026-10-29'));
  });
  await warteAuf('NeuGesetz');
  expect(document.body.textContent).not.toContain('AltGesetz');
});

it('verbindet schnelle Eingabe, Trefferregeln und warme Zweitöffnung im echten Overlay mit dem Referenzbestand', async () => {
  const bestand = erzeugeSuchmessungBestand();
  io.lokal.set('cache/suchverzeichnis.json', suchverzeichnisTestdatei(bestand.gesetze));
  for (const [normgeber, eintraege] of Object.entries(bestand.importindex)) {
    const quelle = normgeber === 'eu' ? 'eu' : normgeber === 'de-bw' ? 'de-bw' : 'de-bund';
    io.lokal.set(
      `importindizes/${normgeber}.xml`,
      importindexFixture(
        quelle,
        eintraege
          .map(
            (e) =>
              `<gesetz${e.typ ? ` typ="${e.typ}"` : ''}><kurztitel>${e.kurztitel}</kurztitel><langtitel>${e.langtitel}</langtitel><abrufkennung>${e.abrufkennung}</abrufkennung></gesetz>`,
          )
          .join(''),
      ),
    );
  }
  const overlay = (
    <OeffnenOverlay
      gesetze={bestand.gesetze}
      aktivesGesetz={null}
      onSchliessen={() => {}}
      onGesetzOeffnen={oeffnen}
      onNeuenTabOeffnen={oeffnen}
      onInstalliertOeffnen={suchtrefferOeffnenFuerTest(bestand.gesetze, oeffnen, oeffnen)}
    />
  );
  await act(async () => root.render(overlay));
  await act(async () => {
    for (const zeichen of '2301') {
      const input = document.querySelector('input');
      if (!input) throw Error('Suchfeld fehlt');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: zeichen, bubbles: true }));
      eingeben(input.value + zeichen);
    }
  });
  expect(document.querySelector('input')?.value).toBe('2301');
  expect(document.querySelectorAll('[data-idx]').length).toBeGreaterThan(0);
  const bezeichnungen = Array.from(document.querySelectorAll('[data-idx] span'), (el) =>
    el.textContent?.replaceAll('\u00a0', ' '),
  );
  for (const gesetz of bestand.gesetze.filter((_g, i) => i % 20 === 0)) {
    expect(bezeichnungen).not.toContain(gesetz.kurztitel);
  }
  await suche('2301 pkhb 2012');
  await warteAuf('PKHB 2012');
  expect(document.querySelectorAll('[data-idx]')).toHaveLength(1);
  await suche('g');
  await act(async () => {
    const geladen = await sucheKandidatenAlleQuellen();
    expect(geladen['de-bund']).toHaveLength(7000);
    expect(geladen['de-bw']).toHaveLength(1200);
    expect(geladen.eu.length).toBeGreaterThanOrEqual(1500);
  });
  expect(document.querySelectorAll('[data-idx]')).toHaveLength(30);
  await act(async () => root.render(null));
  const lesungen = indexLesungen().length + io.ressourcen.mock.calls.length;
  await act(async () => root.render(overlay));
  await suche('g');
  expect(document.querySelectorAll('[data-idx]')).toHaveLength(30);
  expect(document.body.textContent).not.toContain('werden geladen');
  expect(indexLesungen().length + io.ressourcen.mock.calls.length).toBe(lesungen);
});

it.each([false, true])(
  'behält eine gültige Tastaturauswahl nach Schrumpfen und Wiederanwachsen (erneut erweitern: %s)',
  async (erweitern) => {
    const index = (titel: string[]) =>
      importindexFixture(
        'de-bund',
        titel
          .map(
            (t) =>
              `<gesetz><kurztitel>${t}</kurztitel><langtitel>Gesetz</langtitel><abrufkennung>${t}.xml</abrufkennung></gesetz>`,
          )
          .join(''),
      );
    io.lokal.set('importindizes/de-bund.xml', index(['AltGesetz', 'ZweitGesetz']));
    await anzeigen(false);
    await suche();
    await warteAuf('ZweitGesetz');
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' })));
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' })));
    io.lokal.set('importindizes/de-bund.xml', index(['NeuGesetz']));
    await act(async () => fremd());
    await warteAuf('NeuGesetz');
    if (erweitern) {
      io.lokal.set('importindizes/de-bund.xml', index(['NeuGesetz', 'ZweitGesetz']));
      await act(async () => fremd());
      await warteAuf('ZweitGesetz');
    }
    expect(document.querySelector('input')?.value).toBe('Gesetz');
    expect(angebot().style.background).toContain('color-mix');
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })));
    await vi.waitFor(() => expect(io.netz).toHaveBeenCalled());
    expect(io.netz.mock.calls[0]?.[0]).toContain('neugesetz');
  },
);

function indexLesungen() {
  return io.lesen.mock.calls.filter(
    ([pfad]) => !String(pfad).includes('cache/suchverzeichnis.json'),
  );
}
