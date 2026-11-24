// @vitest-environment jsdom
// Ausgangsstellenprüfung mit echtem Gesetz-/Titellader, Dateisicherung und Persistenzkern.
import {
  markierungsAusgangspruefungNativeAttrappe,
  markierungsAusgangspruefungTestFormular,
  gesetzPfad,
  titelPfad,
  gesetzXML,
} from '@/test/markierungen/markierungsAusgangspruefungTestAufbau';
import { act } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { registrierePruefpflichtigeAenderung } from '@/lib/persistenz/kern/kern.index';

const m = markierungsAusgangspruefungNativeAttrappe();
const dom = domTestWurzel();
const kanal = { vormerken: m.vormerken, abschliessen: m.abschliessen };
const formular = markierungsAusgangspruefungTestFormular();
const { FormularPruefung } = formular;
beforeEach(() => {
  vi.clearAllMocks();
  m.dateien.clear();
  m.callbacks.clear();
  m.dateien.set(gesetzPfad, gesetzXML);
  registrierePruefpflichtigeAenderung(kanal);
  m.vormerken.mockResolvedValue('v1');
  m.abschliessen.mockResolvedValue(undefined);
  m.hinweise.mockResolvedValue(undefined);
  m.lesen.mockImplementation(async (pfad: string) => {
    const inhalt = m.dateien.get(pfad.replace('/daten/LexLata/', ''));
    if (inhalt === undefined) throw new Error('Fehlt');
    return inhalt;
  });
  m.invoke.mockImplementation(async (befehl: string, args: { relativerPfad: string }) => {
    if (befehl === 'datei_sperre_erwerben') return args.relativerPfad;
    if (befehl === 'datei_sperre_freigeben') return;
    if (befehl === 'archiviere_beschaedigte_datei') {
      m.dateien.delete(args.relativerPfad);
      return { status: 'archiviert', sicherungspfad: 'kopie' };
    }
    throw new Error(befehl);
  });
});
it('zeigt Sperrwartefrist der benötigten Quelle lokal und verwechselt sie nicht mit fehlender Stelle', async () => {
  m.dateien.set(gesetzPfad, 'defekt');
  m.invoke.mockRejectedValue('wartefrist');
  await act(async () => dom.root.render(<FormularPruefung />));
  expect(dom.host.textContent).toContain('Die Datei wird noch bearbeitet. Bitte erneut versuchen.');
  expect(formular.pruefung.bezugErhalten).toBe(false);
  expect(formular.pruefung.bezugPrueffehler).toContain('nicht zuverlässig gelesen');
  expect(m.banner).not.toHaveBeenCalled();
  expect(m.hinweise).not.toHaveBeenCalled();
});
it('zeigt einen optionalen Titellesefehler ohne die zuordenbare Ausgangsstelle umzudeuten', async () => {
  m.dateien.set(titelPfad, 'defekt');
  const lesen = m.lesen.getMockImplementation()!;
  m.lesen.mockImplementation(async (pfad) => {
    if (pfad.endsWith('-nichtamtliche-titel.xml')) throw new Error('Lesen');
    return lesen(pfad);
  });
  await act(async () => dom.root.render(<FormularPruefung />));
  expect(formular.pruefung.bezugErhalten).toBe(false);
  expect(formular.pruefung.bezugPrueffehler).toBeNull();
  expect(dom.host.textContent).toContain('Titeldatei');
  expect(m.banner).not.toHaveBeenCalled();
  expect(m.hinweise).not.toHaveBeenCalled();
});
it('übergibt Sicherung und offenen Prüfabschluss ohne einen gespeicherten Kommentar zu behaupten', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  m.dateien.set(gesetzPfad, 'defekt');
  m.abschliessen.mockRejectedValue(new Error('Abschluss'));
  await act(async () => dom.root.render(<FormularPruefung />));
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(formular.pruefung.bezugPrueffehler).not.toBeNull();
  });
  expect(formular.pruefung.bezugErhalten).toBe(false);
  expect(formular.pruefung.bezugPrueffehler).toContain('nicht zuverlässig gelesen');
  expect(m.hinweise).toHaveBeenCalledExactlyOnceWith(
    [
      expect.objectContaining({ anlass: 'sicherung' }),
      expect.objectContaining({ anlass: 'pruefabschluss' }),
    ],
    'fenster-1',
  );
  expect(m.banner).not.toHaveBeenCalled();
});
it('wartet vor Fensterabschluss auf die Hinweisannahme und verändert das Prüfergebnis nicht', async () => {
  m.dateien.set(titelPfad, 'defekt');
  let annehmen!: () => void;
  m.hinweise.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        annehmen = resolve;
      }),
  );
  await act(async () => dom.root.render(<FormularPruefung />));
  expect(formular.pruefung.bezugPruefungLaeuft).toBe(false);
  expect(formular.pruefung.bezugPrueffehler).toBeNull();
  let abgeschlossen = false;
  const abschluss = formular.pruefung.warteAufAbschluss().then(() => {
    abgeschlossen = true;
  });
  await Promise.resolve();
  expect(abgeschlossen).toBe(false);
  annehmen();
  await abschluss;
  expect(abgeschlossen).toBe(true);
  expect(formular.pruefung.bezugErhalten).toBe(false);
  expect(m.banner).not.toHaveBeenCalled();
});
it('ein Hinweisfehler verändert weder Ergebnis noch lokalen Ladefehler und löst keine neue Prüfung aus', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  m.dateien.set(titelPfad, 'defekt');
  m.hinweise.mockRejectedValue(new Error('Transport'));
  await act(async () => dom.root.render(<FormularPruefung />));
  await formular.pruefung.warteAufAbschluss();
  expect(formular.pruefung.bezugPrueffehler).toBeNull();
  expect(formular.pruefung.aktionsFehler).toBeNull();
  expect(formular.pruefung.bezugErhalten).toBe(false);
  expect(m.hinweise).toHaveBeenCalledOnce();
  expect(
    m.invoke.mock.calls.filter(([befehl]) => befehl === 'archiviere_beschaedigte_datei'),
  ).toHaveLength(1);
  expect(m.banner).not.toHaveBeenCalled();
});

it('behauptet bei unveränderter Quelle und offenem Abschluss keine erfolgte Änderung', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  m.dateien.set(gesetzPfad, 'defekt');
  const nativ = m.invoke.getMockImplementation()!;
  m.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'archiviere_beschaedigte_datei') {
      m.dateien.set(gesetzPfad, gesetzXML);
      return { status: 'veraendert', sicherungspfad: null };
    }
    return nativ(befehl, args);
  });
  m.abschliessen.mockRejectedValue(new Error('Abschluss'));
  await act(async () => dom.root.render(<FormularPruefung />));
  expect(formular.pruefung.bezugErhalten).toBe(false);
  expect(formular.pruefung.bezugPrueffehler).toBeNull();
  expect(formular.pruefung.aktionsFehler).toContain('Prüfabschluss konnte nicht bestätigt werden');
  expect(formular.pruefung.aktionsFehler).not.toContain('gespeichert');
  expect(m.hinweise).not.toHaveBeenCalled();
  expect(m.banner).not.toHaveBeenCalled();
});
it('erhält Sicherung ohne Entfernung und meldet ihren fehlgeschlagenen Abschluss gesondert lokal', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  m.dateien.set(gesetzPfad, 'defekt');
  const nativ = m.invoke.getMockImplementation()!;
  m.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'archiviere_beschaedigte_datei')
      return { status: 'gesichert_aber_nicht_entfernt', sicherungspfad: 'kopie' };
    return nativ(befehl, args);
  });
  m.abschliessen.mockRejectedValue(new Error('Abschluss'));
  await act(async () => dom.root.render(<FormularPruefung />));
  expect(m.dateien.get(gesetzPfad)).toBe('defekt');
  expect(formular.pruefung.bezugPrueffehler).toContain('nicht zuverlässig gelesen');
  expect(formular.pruefung.aktionsFehler).toContain('Prüfabschluss konnte nicht bestätigt werden');
  expect(m.hinweise).toHaveBeenCalledExactlyOnceWith(
    [
      expect.objectContaining({
        anlass: 'sicherung',
        aenderungsstand: 'teilweise',
        text: expect.stringContaining('nicht entfernt'),
      }),
    ],
    'fenster-1',
  );
  expect(m.banner).not.toHaveBeenCalled();
});
it('ein überholter Lesefehler überschreibt die aktuelle erfolgreiche Prüfung nicht', async () => {
  m.dateien.set(titelPfad, 'defekt');
  const lesen = m.lesen.getMockImplementation()!;
  let ablehnen!: (fehler: Error) => void;
  m.lesen.mockImplementationOnce(
    () =>
      new Promise<string>((_resolve, reject) => {
        ablehnen = reject;
      }),
  );
  await act(async () => dom.root.render(<FormularPruefung />));
  expect(formular.pruefung.bezugPruefungLaeuft).toBe(true);
  m.lesen.mockImplementation(lesen);
  m.dateien.delete(titelPfad);
  await act(async () =>
    m.callbacks.get('gesetze-geaendert')!({
      payload: [{ kurztitel: 'BGB', normgeber: 'de-bund' }],
    }),
  );
  expect(formular.pruefung.bezugPrueffehler).toBeNull();
  expect(formular.pruefung.aktionsFehler).toBeNull();
  await act(async () => ablehnen(new Error('Alter Lesefehler')));
  expect(formular.pruefung.bezugErhalten).toBe(false);
  expect(formular.pruefung.bezugPrueffehler).toBeNull();
  expect(formular.pruefung.aktionsFehler).toBeNull();
  expect(m.banner).not.toHaveBeenCalled();
});
