// @vitest-environment jsdom
// Mobile Eingabe mit verzögertem beziehungsweise fehlgeschlagenem nativen Importindexlesen.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act } from 'react';
import { assert, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { OeffnenScreenFixture } from '@/test/suchverzeichnis/OeffnenScreenFixture';
import { suchverzeichnisTestdatei } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
import { importindexFixture } from './europaImportFixtures';
const dom = domTestWurzel();
it.each(['fehler', 'teilweise', 'erfolgreich'])(
  'zeigt beim mobilen Suchen ausstehende Importangebote und danach deren Abschluss (%s)',
  async (fall) => {
    const fehler = fall !== 'erfolgreich';
    nativeAttrappeZuruecksetzen();
    io.dateien.set('cache/suchverzeichnis.json', suchverzeichnisTestdatei([]));
    for (const name of ['de-bund', 'de-bw', 'eu']) {
      const xml = importindexFixture(
        name,
        name === 'de-bund'
          ? '<gesetz><kurztitel>MessImport</kurztitel><langtitel>Importangebot</langtitel><abrufkennung>mess.xml</abrufkennung></gesetz>'
          : '',
      );
      io.dateien.set(`importindizes/${name}.xml`, xml);
      io.dateien.set(`resources/importindizes/${name}.xml`, xml);
      if (name !== 'eu')
        io.dateien.set(
          `resources/praefixstrukturen/${name}.xml`,
          `<praefixstrukturen version="1"><infos><verarbeitungszeit>2026-10-01T00:00:00Z</verarbeitungszeit><normgeber>${name}</normgeber></infos><inhalt/></praefixstrukturen>`,
        );
    }
    io.dateien.set('resources/europa/europaKuratiert.json', '[]');
    let weiter = () => {};
    let lesenBegonnen = false;
    const warten = new Promise<void>((resolve) => {
      weiter = resolve;
    });
    io.vorLesen = async (pfad) => {
      if (!pfad.includes('/importindizes/')) return;
      lesenBegonnen = true;
      await warten;
      if (fall === 'fehler' || (fall === 'teilweise' && pfad.includes('de-bw.xml')))
        throw new Error('Index gesperrt');
    };
    const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await act(async () => dom.root.render(<OeffnenScreenFixture onGesetzGewaehlt={() => {}} />));
      const input = dom.host.querySelector('input');
      const setzen = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      assert(input && setzen);
      await act(async () => {
        setzen.call(input, 'Mess');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await vi.waitFor(() => expect(lesenBegonnen).toBe(true));
      expect(dom.host.textContent).toContain('Importangebote werden geladen …');
      expect(dom.host.textContent).not.toContain('Kein Treffer');
      await act(async () => weiter());
      await vi.waitFor(async () => {
        await act(async () => {});
        expect(dom.host.textContent).toContain(
          fehler ? 'Importangebote konnten nicht geladen werden.' : 'MessImport',
        );
      });
      expect(dom.host.textContent).not.toContain('Importangebote werden geladen …');
      if (fall === 'teilweise') expect(dom.host.textContent).toContain('MessImport');
      if (fehler) {
        expect(dom.host.textContent).not.toContain('Kein Treffer');
        await act(async () => {
          setzen.call(input, '999');
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(dom.host.textContent).toContain('Kein Treffer');
        expect(dom.host.textContent).not.toContain('Importangebote konnten nicht geladen werden.');
      }
    } finally {
      weiter();
      protokoll.mockRestore();
    }
  },
);
