// Gemeinsame native Grenzen, Ausgangsdaten und Formular für echte Ausgangsstellenprüfungen.
import { gesetzDateistempelAttrappe } from '@/test/plattform/dateiAttrappen';

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { vi } from 'vitest';
import { useEffect } from 'react';
import type { AktionsMeldung } from '@/lib/domain/app/aktionsMeldung';
import { useMarkierungsAusgangsstellePruefung } from '@/hooks/markierungen/useVerweismarkierungUndKommentarHilfsfenster';
import type { KommentarKontext } from '@/lib/markierungen/markierungen.index';

import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { markierungsEinzelzugriffFuerTest } from '@/test/markierungen/markierungsEinzelzugriffFuerTest';

const m = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  invoke: vi.fn(),
  lesen: vi.fn(),
  banner: vi.fn(),
  emit: vi.fn(),
  vormerken: vi.fn(),
  abschliessen: vi.fn(),
  vollbedarf: false,
  wiederholen: false,
  hinweise: vi.fn(),
  callbacks: new Map<string, (event: { payload: unknown[] }) => void>(),
}));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: m.emit }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (befehl: string, ...argumente: unknown[]) =>
    befehl === 'gesetz_dateistempel_lesen'
      ? Promise.resolve(gesetzDateistempelAttrappe(m.dateien))
      : m.invoke(befehl, ...argumente),
}));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
}));
vi.mock('@tauri-apps/plugin-fs', async () => {
  const { dateiAttrappen } = await import('@/test/plattform/dateiAttrappen');
  return dateiAttrappen(m.dateien, m.lesen);
});
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: m.banner,
}));
vi.mock('@/lib/plattform/fensterkommunikation/fensterkommunikation.index', () => ({
  sendeGlobal: vi.fn(),
  hoereGlobal: (name: string, callback: (event: { payload: unknown[] }) => void) => {
    m.callbacks.set(name, callback);
    return { bereit: Promise.resolve(), abmelden: () => m.callbacks.delete(name) };
  },
}));
const kontext: KommentarKontext = {
  gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
  openerLabel: 'fenster-1',
  ausgangsstelle: normAusgangsstelle('§ 1'),

  bearbeiten: { kommentarText: 'Alt', vorher: { kommentarText: 'Alt' } },
};
export const gesetzPfad = 'gesetze/BGB_de-bund.xml';
export const titelPfad = 'nichtamtliche-titel/BGB_de-bund-nichtamtliche-titel.xml';
export const gesetzXML =
  '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel><langtitel>BGB</langtitel></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><absatz>Text</absatz></norm></inhalt></gesetz>';

export function markierungsAusgangspruefungNativeAttrappe() {
  return m;
}

const hinweiseUebergeben = (meldungen: AktionsMeldung[], oeffner: string) =>
  m.hinweise(meldungen, oeffner) as Promise<void>;
export function markierungsAusgangspruefungTestFormular() {
  let pruefung: ReturnType<typeof useMarkierungsAusgangsstellePruefung>;
  function FormularPruefung() {
    const aktuell = useMarkierungsAusgangsstellePruefung(
      kontext,
      markierungsEinzelzugriffFuerTest,
      hinweiseUebergeben,
    );
    useEffect(() => {
      pruefung = aktuell;
    }, [aktuell]);
    return <div>{aktuell.aktionsFehler ?? aktuell.bezugPrueffehler}</div>;
  }
  return {
    FormularPruefung,
    get pruefung() {
      return pruefung;
    },
  };
}
