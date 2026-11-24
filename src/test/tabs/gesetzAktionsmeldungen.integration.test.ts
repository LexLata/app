// @vitest-environment jsdom
// Gemeinsame öffentliche Einzelzugriffe verteilen echte Dateibefunde an ihre Aufrufer.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { beforeEach, expect, it, vi } from 'vitest';
import { erzeugeGeladeneGesetze } from '@/lib/gesetz-laden/gesetz-laden.index';
import { alleBannerSchliessen, getSnapshot } from '@/lib/banner/banner.index';
import { sendeGlobal } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
const referenz = { kurztitel: 'A', normgeber: 'de-bund' };
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  alleBannerSchliessen();
  io.dateien.set('gesetze/A_de-bund.xml', '');
});
function halteLesenAn() {
  let freigeben = () => {};
  let begonnen = false;
  const wartet = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  io.vorLesen = (pfad) => {
    if (pfad.includes('/gesetze/')) {
      begonnen = true;
      return wartet;
    }
    return undefined;
  };
  return { freigeben: () => freigeben(), begonnen: () => begonnen };
}
it.each([false, true])(
  'liefert beiden Teilnehmern denselben Befund bei anfänglich lokalem Empfänger %s',
  async (lokal) => {
    const bestand = erzeugeGeladeneGesetze({ fenstertyp: 'hilfsfenster' });
    const halten = halteLesenAn();
    const zuerst = vi.fn();
    const danach = vi.fn();
    try {
      const ersterLauf = bestand.ladeGesetz(referenz, lokal ? zuerst : undefined);
      await vi.waitFor(() => expect(halten.begonnen()).toBe(true));
      const zweiterLauf = bestand.ladeGesetz(referenz, danach);
      await Promise.resolve();
      halten.freigeben();
      expect(await ersterLauf).toMatchObject({ status: 'nicht-lesbar' });
      expect(await zweiterLauf).toMatchObject({ status: 'nicht-lesbar' });
      expect(danach).toHaveBeenCalledOnce();
      expect(danach.mock.calls[0]?.[0].text).toContain('ist leer');
      expect(zuerst).toHaveBeenCalledTimes(lokal ? 1 : 0);
      expect(getSnapshot()).toEqual([]);
    } finally {
      bestand.beenden();
    }
  },
);
it('erhält lokale Teilnehmer im entwerteten Nachfolgelauf', async () => {
  const bestand = erzeugeGeladeneGesetze({ fenstertyp: 'hilfsfenster' });
  const halten = halteLesenAn();
  const empfangen = vi.fn();
  try {
    const lauf = bestand.ladeGesetz(referenz, empfangen);
    await vi.waitFor(() => expect(halten.begonnen()).toBe(true));
    await sendeGlobal('gesetze-geaendert', [referenz]);
    halten.freigeben();
    expect(await lauf).toMatchObject({ status: 'nicht-lesbar' });
    expect(empfangen).toHaveBeenCalledOnce();
    expect(empfangen.mock.calls[0]?.[0].text).toContain('ist leer');
    expect(getSnapshot()).toEqual([]);
  } finally {
    bestand.beenden();
  }
});
it('meldet nach Bestandsende keine verspäteten lokalen oder globalen Befunde', async () => {
  const bestand = erzeugeGeladeneGesetze({ fenstertyp: 'hilfsfenster' });
  const halten = halteLesenAn();
  const empfangen = vi.fn();
  const lauf = bestand.ladeGesetz(referenz, empfangen);
  await vi.waitFor(() => expect(halten.begonnen()).toBe(true));
  bestand.beenden();
  halten.freigeben();
  await lauf;
  expect(empfangen).not.toHaveBeenCalled();
  expect(getSnapshot()).toEqual([]);
});
