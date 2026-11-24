// @vitest-environment jsdom
// Sofortige Einzelzugriffe brauchen keine vom Verbraucher abgewartete Listeneranmeldung.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import * as ereignisse from '@tauri-apps/api/event';
import { beforeEach, expect, it, vi } from 'vitest';
import { erzeugeGeladeneGesetze } from '@/lib/gesetz-laden/gesetz-laden.index';
import { sendeGlobal } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
import { alleBannerSchliessen, getSnapshot } from '@/lib/banner/banner.index';
const referenz = { kurztitel: 'A', normgeber: 'de-bund' };
const pfad = 'gesetze/A_de-bund.xml';
function datei(langtitel: string) {
  io.dateien.set(
    pfad,
    `<gesetz><infos><kurztitel>A</kurztitel><langtitel>${langtitel}</langtitel><normgeber>de-bund</normgeber></infos><inhalt/></gesetz>`,
  );
}
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  alleBannerSchliessen();
  datei('Alt');
});
it.each(['gesetze-geaendert', 'gesetze-geloescht'] as const)(
  'beginnt vor zuverlässiger Anmeldung keinen Dateizugriff und berücksichtigt %s',
  async (ereignis) => {
    let freigeben!: () => void;
    const warten = new Promise<void>((resolve) => {
      freigeben = resolve;
    });
    const nativ = ereignisse.listen;
    const anmelden = vi.spyOn(ereignisse, 'listen').mockImplementation(async (name, handler) => {
      await warten;
      return nativ(name, handler);
    });
    const lesen = vi.fn();
    io.vorLesen = () => {
      lesen();
      return undefined;
    };
    const bestand = erzeugeGeladeneGesetze();
    const lauf = bestand.ladeGesetz(referenz);
    try {
      await vi.waitFor(() => expect(anmelden).toHaveBeenCalled());
      expect(lesen).not.toHaveBeenCalled();
      if (ereignis === 'gesetze-geaendert') datei('Aktuell');
      else io.dateien.delete(pfad);
      await sendeGlobal(ereignis, [referenz]);
      freigeben();
      expect(await lauf).toMatchObject(
        ereignis === 'gesetze-geaendert'
          ? { status: 'geladen', gesetz: { langtitel: 'Aktuell' } }
          : { status: 'fehlt' },
      );
    } finally {
      freigeben();
      bestand.beenden();
      anmelden.mockRestore();
    }
  },
);
it('liefert bei fehlgeschlagener Anmeldung einen erklärten Fehlerstatus ohne Dateizugriff oder Teilbestand', async () => {
  const nativ = ereignisse.listen;
  const anmelden = vi.spyOn(ereignisse, 'listen').mockImplementation(async (name, handler) => {
    if (name === 'gesetze-geaendert') throw new Error('Anmeldung gesperrt');
    return nativ(name, handler);
  });
  const lesen = vi.fn();
  io.vorLesen = () => {
    lesen();
    return undefined;
  };
  const bestand = erzeugeGeladeneGesetze();
  try {
    expect(await bestand.ladeGesetz(referenz)).toEqual({ status: 'nicht-lesbar', befunde: [] });
    expect(await bestand.ladeGesetz({ kurztitel: 'B', normgeber: 'de-bund' })).toEqual({
      status: 'nicht-lesbar',
      befunde: [],
    });
    await bestand.bereit;
    expect(lesen).not.toHaveBeenCalled();
    expect(bestand.holeGeladenes(referenz)).toBeUndefined();
    expect(
      getSnapshot().some(
        (b) => b.text.includes('Gesetzesänderungen') && b.text.includes('angemeldet'),
      ),
    ).toBe(true);
  } finally {
    bestand.beenden();
    anmelden.mockRestore();
  }
});
