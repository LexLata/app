// @vitest-environment jsdom
import { seitenleistenGroessenBeobachtung } from '@/test/hauptfenster/seitenleistenGroessenBeobachtung';
// Verhalten an den echten Einführungs-, Ansichts- und Speicheranschlüssen.
import { zeigeBanner, alleBannerSchliessen } from '@/lib/banner/banner.index';
import { io } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act } from 'react';
import { assert, expect, it, vi } from 'vitest';
import { umschaltenLesezeichen } from '@/lib/persistenz/nutzerdaten/lesezeichenSpeicher';
import {
  gesetz,
  dom,
  tabs,
  einfuehrung,
  button,
  suchen,
  hauptansicht,
  hauptansichtBis,
  aktiveNorm,
  einzelnKlappen,
  entnehmeFrames,
} from './einfuehrungBedienungTestAufbau';
it('G2: Escape, Außenklick und Tab-Schließen lassen die echte Hauptansicht in der offenen Suche', async () => {
  await hauptansicht();
  await act(async () => button('oeffnen').click());
  const vorher = tabs.tabs;
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  const hintergrund = document
    .querySelector<HTMLElement>('[data-overlay-aktiv] input')
    ?.closest<HTMLElement>('[data-overlay-aktiv]');
  assert(hintergrund);
  await act(async () => hintergrund.click());
  const schliessen = dom.host.querySelector<HTMLButtonElement>('[data-tab-id] button');
  assert(schliessen);
  await act(async () => schliessen.click());
  expect(tabs.tabs).toEqual(vorher);
  expect(einfuehrung.einfuehrungTeilaktion).toBe(1);
  expect(document.querySelector('input')).not.toBeNull();
});

it('G1: zwei echte Durchläufe zeigen 1,2,3,3,4,5,5,5 und schalten auch beim Entfernen eines vorhandenen Lesezeichens weiter', async () => {
  await hauptansicht();
  for (const wiederholung of [false, true]) {
    const zaehler: string[] = [];
    function stand(t: number) {
      expect(einfuehrung.einfuehrungTeilaktion).toBe(t);
      const text = dom.host.textContent?.match(/Schritt \d von 5/);
      assert(text);
      zaehler.push(text[0]);
    }
    stand(0);
    await act(async () => button('oeffnen').click());
    stand(1);
    // suchen() öffnet die schon offene Suche nochmals; die Navigation bleibt echt.
    await suchen();
    expect(aktiveNorm()).toBe('a');
    stand(2);
    await act(async () => button('favorit').click());
    stand(3);
    await act(async () => button('favorit').click());
    stand(4);
    await act(async () => button('lesezeichen').click());
    expect(io.dateien.has('lesezeichen/lesezeichen.xml')).toBe(!wiederholung);
    stand(5);
    await einzelnKlappen();
    stand(6);
    await act(async () => button('zuklappen').click());
    stand(7);
    await act(async () => button('aufklappen').click());
    expect(einfuehrung.einfuehrungTeilaktion).toBe(8);
    expect(dom.host.textContent).toContain('Einführung abgeschlossen');
    expect(zaehler).toEqual([1, 2, 3, 3, 4, 5, 5, 5].map((n) => `Schritt ${n} von 5`));
    const fertig = [...dom.host.querySelectorAll('button')].find((b) => b.textContent === 'Fertig');
    assert(fertig);
    await act(async () => fertig.click());
    expect(einfuehrung.einfuehrungAktiv).toBe(false);
    if (!wiederholung) await act(async () => einfuehrung.einfuehrungNeuStarten());
  }
});
it.each([0, 1, 2, 3, 4, 5, 6, 7, 8])(
  'P6-A2: Favoriteneinträge beachten Teilaktion %s in der echten Hauptansicht',
  async (t) => {
    await hauptansichtBis(t);
    const vorher = aktiveNorm();
    const eintrag = dom.host.querySelector<HTMLButtonElement>(
      '[data-einfuehrung-grenze="rechts"] button',
    );
    assert(eintrag);
    await act(async () => eintrag.click());
    expect(aktiveNorm()).toBe([0, 1, 3].includes(t) ? vorher : 'b');
  },
);
it.each([0, 1, 2, 3, 4, 5, 6, 7, 8])(
  'P6-A1: Tab-Schließen und neuer Tab sind in Teilaktion %s gesperrt',
  async (t) => {
    await hauptansichtBis(t);
    const vorher = tabs.tabs;
    const schliessen = dom.host.querySelector<HTMLButtonElement>('[data-tab-id] button');
    const neu = [...dom.host.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.title.startsWith('Neuer Tab ('),
    );
    assert(schliessen && neu);
    await act(async () => {
      schliessen.click();
      neu.click();
    });
    expect(tabs.tabs).toEqual(vorher);
  },
);

it.each([0, 1, 2, 3, 4, 5, 6, 7, 8])(
  'P6-A2: Lesezeicheneinträge beachten Teilaktion %s',
  async (t) => {
    await act(async () => {
      await umschaltenLesezeichen(gesetz, '2');
    });
    await hauptansichtBis(t);
    const vorher = aktiveNorm();
    const eintrag = [
      ...dom.host.querySelectorAll<HTMLButtonElement>('[data-einfuehrung-grenze="links"] button'),
    ].find((b) => !b.dataset.einfuehrungZiel && b.textContent?.endsWith('2'));
    assert(eintrag);
    await act(async () => eintrag.click());
    expect(aktiveNorm()).toBe(t < 4 ? vorher : 'b');
  },
);
async function speichereVerweismarkierung() {
  io.dateien.set(
    'markierungen/GG_de-bund-markierungen.xml',
    '<markierungen version="1"><infos><gesetz normgeber="de-bund">GG</gesetz></infos><inhalt><verweismarkierung><bezeichnung>Art. 1</bezeichnung><elementstand><textlaenge>6</textlaenge></elementstand><verweisinhalt><verweistext>Verweisziel</verweistext><verweisziel><bezeichnung>Art. 2</bezeichnung><verweistextZeichenbereich start="0" ende="11"/></verweisziel></verweisinhalt></verweismarkierung></inhalt></markierungen>',
  );
}
function getaggterVerweis() {
  const link = dom.host.querySelector<HTMLElement>('[data-leaf] span[style*="cursor: pointer"]');
  assert(link);
  return link;
}
it.each([0, 3, 8])(
  'P6-A5: getaggte Verweise bleiben in Teilaktion %s auch mit Cmd/Strg wirkungslos; Verweismarkierungen sind ausgeblendet',
  async (t) => {
    await speichereVerweismarkierung();
    await hauptansichtBis(t);
    expect(dom.host.textContent).not.toContain('Verweisziel');
    const vorher = { tabs: tabs.tabs, aktiv: tabs.aktiverTabId, norm: aktiveNorm() };
    for (const modifikator of [{}, { metaKey: true }, { ctrlKey: true }]) {
      await act(async () =>
        getaggterVerweis().dispatchEvent(
          new MouseEvent('click', { bubbles: true, ...modifikator }),
        ),
      );
      expect({ tabs: tabs.tabs, aktiv: tabs.aktiverTabId, norm: aktiveNorm() }).toEqual(vorher);
    }
  },
);
it.each([{}, { metaKey: true }, { ctrlKey: true }])(
  'P6-A5/E7: getaggter Verweis navigiert außerhalb der Einführung (%j)',
  async (modifikator) => {
    await hauptansichtBis(2);
    await act(async () => einfuehrung.einfuehrungBeenden());
    const vorher = tabs.tabs.length;
    await act(async () =>
      getaggterVerweis().dispatchEvent(new MouseEvent('click', { bubbles: true, ...modifikator })),
    );
    expect(aktiveNorm()).toBe('b');
    expect(tabs.tabs).toHaveLength(vorher + (Object.keys(modifikator).length ? 1 : 0));
  },
);
it.each([{}, { metaKey: true }, { ctrlKey: true }])(
  'P6-A5/E7: gespeicherte Verweismarkierung navigiert außerhalb der Einführung (%j)',
  async (modifikator) => {
    await speichereVerweismarkierung();
    await hauptansichtBis(2);
    await act(async () => einfuehrung.einfuehrungBeenden());
    await act(async () => vi.dynamicImportSettled());
    const link = [...dom.host.querySelectorAll<HTMLElement>('span[style*="cursor: pointer"]')].find(
      (el) => el.textContent === 'Verweisziel',
    );
    assert(link);
    const vorher = tabs.tabs.length;
    await act(async () =>
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, ...modifikator })),
    );
    expect(aktiveNorm()).toBe('b');
    expect(tabs.tabs).toHaveLength(vorher + (Object.keys(modifikator).length ? 1 : 0));
  },
);

it.each(['Favorit', 'Lesezeichen'])(
  'E7: %s-Einträge navigieren nach dem Überspringen wieder',
  async (art) => {
    if (art === 'Lesezeichen')
      await act(async () => {
        await umschaltenLesezeichen(gesetz, '2');
      });
    await hauptansichtBis(0);
    await act(async () => einfuehrung.einfuehrungBeenden());
    const seite = art === 'Favorit' ? 'rechts' : 'links';
    const eintrag = [
      ...dom.host.querySelectorAll<HTMLButtonElement>(
        `[data-einfuehrung-grenze="${seite}"] button`,
      ),
    ].find((b) => !b.dataset.einfuehrungZiel && b.textContent?.endsWith('2'));
    assert(eintrag);
    await act(async () => eintrag.click());
    expect(aktiveNorm()).toBe('b');
  },
);

it.each(['Fertig', 'Überspringen'])(
  'kehrt nach %s zur gespeicherten getauschten Anordnung zurück',
  async (abschluss) => {
    localStorage.setItem('lexlata.leistenTauschen', 'true');
    await act(async () =>
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'lexlata.leistenTauschen', newValue: 'true' }),
      ),
    );
    await hauptansichtBis(abschluss === 'Fertig' ? 8 : 5);
    const leiste = (seite: string) =>
      dom.host.querySelector(`[data-einfuehrung-grenze="${seite}"]`);
    expect(leiste('links')?.textContent).toContain('GG');
    expect(leiste('rechts')?.textContent).toContain('2');
    expect(leiste('rechts')?.querySelector('[data-einfuehrung-ziel="favorit"]')).not.toBeNull();
    const knopf = Array.from(dom.host.querySelectorAll('button')).find(
      (b) => b.textContent === (abschluss === 'Fertig' ? 'Fertig' : 'Einführung überspringen'),
    );
    assert(knopf);
    await act(async () => knopf.click());
    expect(einfuehrung.einfuehrungAktiv).toBe(false);
    expect(localStorage.getItem('lexlata.leistenTauschen')).toBe('true');
    expect(leiste('links')?.textContent).toContain('2');
    expect(leiste('rechts')?.textContent).toContain('GG');
    expect(leiste('links')?.querySelector('[data-einfuehrung-ziel="favorit"]')).not.toBeNull();
    expect(leiste('rechts')?.querySelector('[data-einfuehrung-ziel="lesezeichen"]')).not.toBeNull();
    await act(async () => button('lesezeichen').click());
    expect(leiste('rechts')).toBeNull();
    await act(async () => button('lesezeichen').click());
    expect(leiste('rechts')?.textContent).toContain('GG');
  },
);

it('passt den Bannerabstand beim Start und Ende der Einführung an die jeweils rechte Liste an', async () => {
  seitenleistenGroessenBeobachtung();
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.textContent?.includes('GG') ? 83 : 47;
  });
  localStorage.setItem('lexlata.leistenTauschen', 'true');
  await act(async () =>
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'lexlata.leistenTauschen', newValue: 'true' }),
    ),
  );
  await hauptansichtBis(5);
  const messen = () => act(async () => entnehmeFrames().forEach((fn) => fn(0)));
  const abstand = () =>
    dom.host.querySelector<HTMLElement>('[style*="position: fixed"][style*="right:"]')?.style.right;
  await act(async () => {
    zeigeBanner({ art: 'systemfehler', text: 'Gespeichert' });
  });
  await messen();
  expect(abstand()).toBe('63px');
  await act(async () => einfuehrung.einfuehrungBeenden());
  await messen();
  expect(abstand()).toBe('99px');
  await act(async () => einfuehrung.einfuehrungNeuStarten());
  await messen();
  expect(abstand()).toBe('63px');
  await act(async () => einfuehrung.einfuehrungBeenden());
  await messen();
  expect(abstand()).toBe('99px');
  await act(async () => {
    alleBannerSchliessen();
  });
});

it.each([null, 'true', 'false'])(
  'erhält die Seitenleisten-Einstellung während der Einführung: %s',
  async (wert) => {
    if (wert !== null) localStorage.setItem('lexlata.seitenleistenTastenkuerzel', wert);
    await act(async () =>
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'lexlata.seitenleistenTastenkuerzel', newValue: wert }),
      ),
    );
    await hauptansichtBis(5);
    const eintraege = Array.from(
      dom.host.querySelectorAll<HTMLButtonElement>('[data-einfuehrung-grenze] button'),
    ).filter((b) => b.textContent?.endsWith('2'));
    expect(eintraege.length).toBeGreaterThan(0);
    for (const b of eintraege) {
      expect(b.children).toHaveLength(wert === 'true' ? 2 : 1);
      expect(b.title.includes('(')).toBe(wert === 'true');
    }
    await act(async () => einfuehrung.einfuehrungBeenden());
    expect(localStorage.getItem('lexlata.seitenleistenTastenkuerzel')).toBe(wert);
  },
);
