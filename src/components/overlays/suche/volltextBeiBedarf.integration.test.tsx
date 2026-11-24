// @vitest-environment jsdom
// Öffentliche Suche mit echten Hooks, React, Parser und Fensterbestand; nur native Grenzen ersetzt.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act } from 'react';
import { assert, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { erzeugeGeladeneGesetze } from '@/lib/gesetz-laden/gesetz-laden.index';
import { sendeGlobal } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
import {
  baueSuchIndexFuerGesetz,
  normMatchtTokens,
  tokenisiere,
} from './VolltextSucheOverlay.helpers';
import { useVolltextSuchtext, type VolltextSuchstand } from './useVolltextSuchtext';
import { VolltextSucheOverlay } from './VolltextSucheOverlay';
import { erstelleSpeicherbericht } from '@/lib/utils/speicherMessung';
const dom = domTestWurzel();
const xml = (titel: string, text: string) =>
  `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>${titel}</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><titel>Titel</titel><text><absatz><satz>${text}</satz></absatz></text></norm></inhalt></gesetz>`;
function erstelleGesetz(titel: string, text: string) {
  const gesetz = parseGesetzesXML(xml(titel, text));
  assert(gesetz);
  return gesetz;
}
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
});
async function eingeben(text: string) {
  const input = dom.host.querySelector('input');
  if (!(input instanceof HTMLInputElement)) throw new Error('Suchfeld fehlt');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
it('zeigt Teilergebnisse, behält nur Suchtext und erneuert ausschließlich das geänderte Gesetz', async () => {
  const gesetze = [
    erstelleGesetz('A', 'Kündigung Frist'),
    erstelleGesetz('B', 'Kündigung Vertrag'),
  ];
  for (const g of gesetze)
    io.dateien.set(
      `gesetze/${g.kurztitel}_de-bund.xml`,
      xml(g.kurztitel, g.kurztitel === 'A' ? 'Kündigung Frist' : 'Kündigung Vertrag'),
    );
  const [a, b] = gesetze;
  assert(a && b);
  const eintraege = alsSuchverzeichniseintraege(gesetze);
  const gelesen: string[] = [];
  let freigeben = () => {};
  const wartet = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  io.vorLesen = (pfad) => {
    if (!pfad.includes('/gesetze/')) return undefined;
    gelesen.push(pfad);
    return pfad.includes('B_de-bund') ? wartet : undefined;
  };
  const bestand = erzeugeGeladeneGesetze();
  let stand: VolltextSuchstand | undefined;
  function Fenster({ offen }: { offen: boolean }) {
    stand = useVolltextSuchtext(eintraege, false, bestand.ladeGesetz, offen);
    return offen ? (
      <VolltextSucheOverlay suchstand={stand} onSchliessen={() => {}} onNormNavigieren={() => {}} />
    ) : null;
  }
  const zeichnen = async (offen: boolean) => {
    await act(async () => dom.root.render(<Fenster offen={offen} />));
  };
  try {
    await zeichnen(true);
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(stand?.erledigt).toBe(1);
    });
    await eingeben('Kündigung');
    expect(dom.host.querySelectorAll('[data-idx]')).toHaveLength(1);
    expect(dom.host.textContent).toContain('Durchsucht 1 von 2 Gesetzen');
    await eingeben('unbekannt');
    expect(dom.host.textContent).not.toContain('Kein Treffer');
    freigeben();
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(stand?.vollstaendig).toBe(true);
    });
    for (const query of ['KÜNDIGUNG', 'künd frist', 'vertrag', 'unbekannt']) {
      await eingeben(query);
      expect(dom.host.querySelectorAll('[data-idx]')).toHaveLength(
        gesetze
          .flatMap(baueSuchIndexFuerGesetz)
          .filter((e) => normMatchtTokens(e.volltext, tokenisiere(query))).length,
      );
    }
    expect(dom.host.textContent).toContain('Kein Treffer');
    expect(bestand.holeGeladenes(a)).toBeUndefined();
    expect(bestand.holeGeladenes(b)).toBeUndefined();
    expect(stand?.eintraege[0]?.gesetz).not.toHaveProperty('elemente');
    expect(stand?.eintraege[0]?.norm).not.toHaveProperty('absaetze');
    await zeichnen(false);
    await zeichnen(true);
    await eingeben('Kündigung');
    expect(gelesen).toHaveLength(2);
    io.dateien.set('gesetze/A_de-bund.xml', xml('A', 'Neufassung'));
    await act(async () => {
      await sendeGlobal('gesetze-geaendert', [a]);
    });
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(stand?.eintraege.some((e) => e.volltext.includes('Neufassung'))).toBe(true);
    });
    expect(gelesen.filter((p) => p.includes('A_de-bund'))).toHaveLength(2);
    expect(gelesen.filter((p) => p.includes('B_de-bund'))).toHaveLength(1);
  } finally {
    freigeben();
    await act(async () => dom.root.render(null));
    bestand.beenden();
  }
});
it('behauptet bei nicht lesbarem Gesetz und unabgeglichenem Verzeichnis keinen vollständigen Suchbestand', async () => {
  const gesetz = erstelleGesetz('A', 'Text');
  const eintraege = alsSuchverzeichniseintraege([gesetz]);
  io.dateien.set('gesetze/A_de-bund.xml', '');
  const bestand = erzeugeGeladeneGesetze();
  let stand: VolltextSuchstand | undefined;
  function Fenster() {
    stand = useVolltextSuchtext(eintraege, true, bestand.ladeGesetz, true);
    return (
      <VolltextSucheOverlay suchstand={stand} onSchliessen={() => {}} onNormNavigieren={() => {}} />
    );
  }
  try {
    await act(async () => dom.root.render(<Fenster />));
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(stand?.erledigt).toBe(1);
    });
    await eingeben('unbekannt');
    expect(stand?.vollstaendig).toBe(false);
    expect(dom.host.textContent).toContain('Suchbestand unvollständig');
    expect(dom.host.textContent).not.toContain('Kein Treffer');
  } finally {
    await act(async () => dom.root.render(null));
    bestand.beenden();
  }
});
it('führt den aufgebauten Volltextsuchindex im Speicherbericht, solange das Fenster ihn hält', async () => {
  const gesetz = erstelleGesetz('A', 'Kündigung Frist');
  io.dateien.set('gesetze/A_de-bund.xml', xml('A', 'Kündigung Frist'));
  const eintraege = alsSuchverzeichniseintraege([gesetz]);
  const bestand = erzeugeGeladeneGesetze();
  let stand: VolltextSuchstand | undefined;
  function Fenster() {
    stand = useVolltextSuchtext(eintraege, false, bestand.ladeGesetz, true);
    return null;
  }
  const volltextposten = () =>
    erstelleSpeicherbericht().posten.find((p) => p.name === 'Volltextsuchindex');
  try {
    await act(async () => dom.root.render(<Fenster />));
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(stand?.vollstaendig).toBe(true);
    });
    expect(volltextposten()?.zeichen).toBeGreaterThanOrEqual('Kündigung Frist'.length);
    await act(async () => dom.root.render(null));
    expect(volltextposten()).toBeUndefined();
  } finally {
    await act(async () => dom.root.render(null));
    bestand.beenden();
  }
});
