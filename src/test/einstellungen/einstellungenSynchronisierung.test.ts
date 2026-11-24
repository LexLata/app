// @vitest-environment jsdom
// einstellungenSynchronisierung.test.ts
// Neue Optionsverträge, Altbestandsschutz und Speicherereignisse für Haupt- und Hilfsfenster.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSeitenleistenTastenkuerzel } from '@/hooks/einstellungen/useSeitenleistenTastenkuerzel';
import { useMarkierungenDeaktiviert } from '@/hooks/einstellungen/useMarkierungenDeaktiviert';
import { useTextDarstellung } from '@/hooks/einstellungen/useTextDarstellung';
import { useGesetzestextAkzentfarbe } from '@/hooks/einstellungen/useGesetzestextAkzentfarbe';
import {
  setzeEinstellungenZurueck,
  wendeEinstellungenXMLAn,
} from '@/lib/einstellungen/einstellungen.index';

// Dieser Test prüft StorageEvent und Hook-Synchronisierung; Dateisperren und
// Backup-Fehler werden separat in einstellungenBackup.test.ts abgedeckt.
// Externe Dateigrenze: Das Backup läuft echt, schreibt aber nicht in den Datenordner.
vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  appDatenSchreiben: async () => {},
  appDatenLoeschen: async () => {},
  appDatenExistiert: async () => false,
  mitDateiSperre: async (_pfad: string, aktion: (token: string) => Promise<unknown>) =>
    aktion('token'),
}));

const altbestand = {
  'lexlata.markierungenAktiviert': 'false',
  'lexlata.strukturLeisteSkalierung': 'gross',
  'lexlata.gesetzestextAkzent': 'rot',
  'lexlata.zeilenlaengeBreite': 'breit',
};
const wurzeln: ReturnType<typeof createRoot>[] = [];
beforeEach(() => {
  localStorage.clear();
  for (const [key, wert] of Object.entries(altbestand)) localStorage.setItem(key, wert);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});
afterEach(async () => {
  await act(async () => {
    for (const root of wurzeln.splice(0)) root.unmount();
  });
  document.documentElement.removeAttribute('data-gesetzestext-akzent');
  vi.unstubAllGlobals();
});
async function fenster() {
  const root = createRoot(document.createElement('div'));
  wurzeln.push(root);
  let zustand!: ReturnType<typeof useSeitenleistenTastenkuerzel> &
    ReturnType<typeof useMarkierungenDeaktiviert> &
    ReturnType<typeof useTextDarstellung> &
    ReturnType<typeof useGesetzestextAkzentfarbe>;
  function Ansicht() {
    zustand = {
      ...useSeitenleistenTastenkuerzel(),
      ...useMarkierungenDeaktiviert(),
      ...useTextDarstellung(),
      ...useGesetzestextAkzentfarbe(),
    };
    return null;
  }
  await act(async () => root.render(createElement(Ansicht)));
  return () => zustand;
}
it.each(['false', 'true'])(
  'verwendet bei altem Markierungswert %s ausschließlich die Standards ohne Übernahme oder Veränderung',
  async (alterWert) => {
    localStorage.setItem('lexlata.markierungenAktiviert', alterWert);
    const zustand = (await fenster())();
    expect(zustand).toMatchObject({
      markierungenDeaktiviert: false,
      strukturKontextLeisteGroesse: 'normal',
      gesetzestextAkzentfarbe: 'blau',
      lesbareZeilenlaengeBreite: 'normal',
    });
    for (const [key, wert] of Object.entries(altbestand))
      expect(localStorage.getItem(key)).toBe(
        key === 'lexlata.markierungenAktiviert' ? alterWert : wert,
      );
  },
);
it('synchronisiert Import und Reset in Haupt- und Hilfsfenster einschließlich Ref und erhält Altbestand', async () => {
  const haupt = await fenster();
  const hilfs = await fenster();
  await act(async () =>
    wendeEinstellungenXMLAn(
      '<einstellungen><markierungenDeaktiviert>true</markierungenDeaktiviert><strukturKontextLeisteGroesse>klein</strukturKontextLeisteGroesse><gesetzestextAkzentfarbe>orange</gesetzestextAkzentfarbe><lesbareZeilenlaengeBreite>schmal</lesbareZeilenlaengeBreite><satzNeuZeile>false</satzNeuZeile><blocksatz>false</blocksatz></einstellungen>',
    ),
  );
  for (const zustand of [haupt, hilfs]) {
    expect(zustand()).toMatchObject({
      markierungenDeaktiviert: true,
      strukturKontextLeisteGroesse: 'klein',
      gesetzestextAkzentfarbe: 'orange',
      lesbareZeilenlaengeBreite: 'schmal',
      blocksatz: false,
      satzNeuZeile: false,
    });
    expect(zustand().markierungenDeaktiviertRef.current).toBe(true);
  }
  await act(async () => {
    expect(await setzeEinstellungenZurueck()).toEqual({ erfolgreich: true });
  });
  for (const zustand of [haupt, hilfs]) {
    expect(zustand()).toMatchObject({
      markierungenDeaktiviert: false,
      strukturKontextLeisteGroesse: 'normal',
      gesetzestextAkzentfarbe: 'blau',
      lesbareZeilenlaengeBreite: 'normal',
      blocksatz: true,
      satzNeuZeile: true,
    });
    expect(zustand().markierungenDeaktiviertRef.current).toBe(false);
  }
  for (const [key, wert] of Object.entries(altbestand))
    expect(localStorage.getItem(key)).toBe(wert);
});
it('schreibt neue Schlüssel und übernimmt fremde Speicherereignisse einschließlich sofortigem Ref', async () => {
  const haupt = await fenster();
  const hilfs = await fenster();
  await act(async () => {
    hilfs().setMarkierungenDeaktiviert(true);
    hilfs().setStrukturKontextLeisteGroesse('gross');
    hilfs().setGesetzestextAkzentfarbe('gruen');
    hilfs().setLesbareZeilenlaengeBreite('breit');
  });
  const erwarteteWerte = {
    markierungenDeaktiviert: 'true',
    strukturKontextLeisteGroesse: 'gross',
    gesetzestextAkzentfarbe: 'gruen',
    lesbareZeilenlaengeBreite: 'breit',
  };
  await act(async () => {
    for (const [tag, wert] of Object.entries(erwarteteWerte)) {
      expect(localStorage.getItem(`lexlata.${tag}`)).toBe(wert);
      window.dispatchEvent(new StorageEvent('storage', { key: `lexlata.${tag}`, newValue: wert }));
    }
    expect(haupt().markierungenDeaktiviertRef.current).toBe(true);
  });
  expect(haupt()).toMatchObject({
    markierungenDeaktiviert: true,
    strukturKontextLeisteGroesse: 'gross',
    gesetzestextAkzentfarbe: 'gruen',
    lesbareZeilenlaengeBreite: 'breit',
  });
});
it('erhält die bisherigen Rohwert- und Fallbackregeln für ungültige Werte', async () => {
  const zustand = await fenster();
  await act(async () =>
    wendeEinstellungenXMLAn(
      '<einstellungen><markierungenDeaktiviert>unbekannt</markierungenDeaktiviert><strukturKontextLeisteGroesse>unbekannt</strukturKontextLeisteGroesse><gesetzestextAkzentfarbe>unbekannt</gesetzestextAkzentfarbe><lesbareZeilenlaengeBreite>unbekannt</lesbareZeilenlaengeBreite></einstellungen>',
    ),
  );
  expect(zustand()).toMatchObject({
    markierungenDeaktiviert: false,
    strukturKontextLeisteGroesse: 'unbekannt',
    gesetzestextAkzentfarbe: 'blau',
    lesbareZeilenlaengeBreite: 'unbekannt',
  });
  expect(localStorage.getItem('lexlata.gesetzestextAkzentfarbe')).toBe('unbekannt');
});

it('ignoriert alte Seitenleistenwerte und synchronisiert die positive Einstellung sofort', async () => {
  localStorage.setItem('lexlata.tastaturHinweiseAusblenden', 'false');
  const haupt = await fenster();
  const hilfe = await fenster();
  expect(haupt().seitenleistenTastenkuerzel).toBe(false);
  await act(async () => hilfe().setSeitenleistenTastenkuerzel(true));
  await act(async () =>
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'lexlata.seitenleistenTastenkuerzel', newValue: 'true' }),
    ),
  );
  expect(haupt().seitenleistenTastenkuerzel).toBe(true);
  expect(localStorage.getItem('lexlata.tastaturHinweiseAusblenden')).toBe('false');
});
