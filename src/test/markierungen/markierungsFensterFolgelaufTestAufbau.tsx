// markierungsFensterFolgelaufTestAufbau.tsx
// Gemeinsame echte Formularabnahme mit registrierter Prüfkoordination, Quellen und Prüfqueue.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import {
  bereiteMarkierungsFensterDateienVor,
  bereiteMarkierungsFensterPruefverwaltungVor,
  markierungsFensterBedienung,
  markierungsFensterNativeAttrappe,
} from '@/test/markierungen/markierungsFensterNativeAttrappe';
import { act, type ComponentType } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import type {
  KommentarKontext,
  VerweismarkierungKontext,
} from '@/lib/markierungen/markierungen.index';

import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { markierungsFensterGesetzLader } from '@/test/markierungen/markierungsFensterGesetzLader';
const markierungsEinzelzugriffFuerTest = markierungsFensterGesetzLader();

export function pruefeMarkierungsFensterFolgelauf(
  istVerweis: boolean,
  ladeFenster: () => Promise<ComponentType>,
) {
  const eingabe = istVerweis ? '§ 1 BGB' : 'Mein Kommentar';
  const bezeichnung = istVerweis ? 'Der Verweis' : 'Der Kommentar';
  const m = markierungsFensterNativeAttrappe<KommentarKontext | VerweismarkierungKontext>();
  const dom = domTestWurzel();
  const { feld, knopf, hinweise } = markierungsFensterBedienung(() => dom.host);
  const markierungsPfad = 'markierungen/BGB_de-bund-markierungen.xml';
  const titelPfad = 'nichtamtliche-titel/BGB_de-bund-nichtamtliche-titel.xml';
  const konfliktPfad = 'markierungskonflikte.xml';
  const prueftext =
    'Die Prüfung auf Markierungskonflikte konnte jedoch nicht zuverlässig abgeschlossen werden.';
  let markierungen: typeof import('@/lib/markierungen/markierungen.index');
  let Fenster: ComponentType;
  let pruefverwaltung: ReturnType<typeof bereiteMarkierungsFensterPruefverwaltungVor>;
  const freigaben: (() => void)[] = [];
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    m.dateien.clear();
    m.empfang.clear();
    m.historie.clear();
    m.bestaetigen = true;
    m.kontext = {
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      openerLabel: 'fenster-1',
      ausgangsstelle: normAusgangsstelle('§ 1'),
    };
    m.label = istVerweis ? 'verweismarkierung-1' : 'kommentar-1';
    bereiteMarkierungsFensterDateienVor();
    if (istVerweis)
      m.dateien.set(
        'gesetze/BGB_de-bund.xml',
        m.dateien.get('gesetze/BGB_de-bund.xml')!.replace('<norm>', '<norm id="p1">'),
      );
    m.dateien.set(konfliktPfad, '<markierungskonflikte pruefstatus="aktuell"/>');
    pruefverwaltung = bereiteMarkierungsFensterPruefverwaltungVor();
    markierungen = await import('@/lib/markierungen/markierungen.index');
    markierungen.initialisiereMarkierungen();
    Fenster = await ladeFenster();
  });
  afterEach(async () => {
    freigaben.splice(0).forEach((freigeben) => freigeben());
    await markierungen.pruefeAlleMarkierungen(() => {}).catch(() => undefined);
    vi.useRealTimers();
  });
  function warteTor() {
    let freigeben!: () => void;
    const warten = new Promise<void>((resolve) => {
      freigeben = resolve;
    });
    freigaben.push(freigeben);
    return { warten, freigeben };
  }
  async function starten() {
    await act(async () => dom.root.render(<Fenster />));
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        feld(),
        eingabe,
      );
      feld().dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  function markierungsSchreibaufrufe() {
    return m.invoke.mock.calls.filter(
      ([befehl, args]) =>
        befehl === 'atomar_datei_schreiben' && args.relativerPfad === markierungsPfad,
    );
  }
  async function verzögerteFolge(repariert = true) {
    const { tor, davor } = await blockierePruefqueue();
    const nativ = m.invoke.getMockImplementation()!;
    let reparaturAusstehend = true;
    let quelleAbgeschlossen!: () => void;
    const quellenabschluss = new Promise<void>((resolve) => {
      quelleAbgeschlossen = resolve;
    });
    m.invoke.mockImplementation(async (befehl, args) => {
      if (befehl === 'pruefvorgang_quelle_abschliessen') quelleAbgeschlossen();
      if (
        befehl === 'archiviere_beschaedigte_datei' &&
        args.relativerPfad === titelPfad &&
        reparaturAusstehend
      ) {
        reparaturAusstehend = false;
        if (repariert) m.dateien.delete(titelPfad);
        return { status: 'veraendert', sicherungspfad: null };
      }
      return nativ(befehl, args);
    });
    m.dateien.set(titelPfad, '<defekt');
    await act(async () => knopf('Fertig').click());
    await quellenabschluss;
    expect(m.invoke).toHaveBeenCalledWith('pruefvorgang_quelle_abschliessen', expect.anything());
    return { tor, davor };
  }
  it('wartet nach Markierungserfolg auf die registrierte Folge und danach auf native Hinweisannahme', async () => {
    await starten();
    const { tor, davor } = await verzögerteFolge();
    expect(markierungsSchreibaufrufe()).toHaveLength(1);
    expect(m.historie.size).toBe(1);
    expect(m.close).not.toHaveBeenCalled();
    expect(feld().disabled).toBe(true);
    // Erst in der Folge entstandene Sicherung muss vor dem Schließen ankommen.
    m.dateien.set(titelPfad, '<defekt');
    const sicherungenVorFolge = m.invoke.mock.calls.filter(
      ([befehl, args]) =>
        befehl === 'archiviere_beschaedigte_datei' && args.relativerPfad === titelPfad,
    ).length;
    const annahme = warteTor();
    m.hinweise.mockImplementation(() => annahme.warten);
    await act(async () => {
      tor.freigeben();
      await davor;
    });
    expect(hinweise().some((hinweis) => hinweis.hinweis.text.includes('Titeldatei'))).toBe(true);
    expect(
      m.invoke.mock.calls.filter(
        ([befehl, args]) =>
          befehl === 'archiviere_beschaedigte_datei' && args.relativerPfad === titelPfad,
      ),
    ).toHaveLength(sicherungenVorFolge + 1);
    expect(m.dateien.has(titelPfad)).toBe(false);
    expect(m.close).not.toHaveBeenCalled();
    await act(async () => annahme.freigeben());
    expect(m.close).toHaveBeenCalledOnce();
    expect(markierungsSchreibaufrufe()).toHaveLength(1);
    expect(m.banner).not.toHaveBeenCalled();
  });
  it('meldet eine Folgelauffrist nach Speicherung wahrheitsgemäß einmal und lässt die Folge weiterarbeiten', async () => {
    await starten();
    vi.useFakeTimers();
    const { tor, davor } = await verzögerteFolge();
    await act(async () => vi.advanceTimersByTimeAsync(29_999));
    expect(m.close).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(hinweise()).toHaveLength(1);
    expect(hinweise()[0].hinweis.text).toContain(`${bezeichnung} wurde gespeichert.`);
    expect(hinweise()[0].hinweis.text).toContain(prueftext);
    expect(m.close).toHaveBeenCalledOnce();
    expect(m.historie.size).toBe(1);
    expect(markierungsSchreibaufrufe()).toHaveLength(1);
    await act(async () => {
      tor.freigeben();
      await davor;
    });
    expect(m.dateien.get(konfliktPfad)).toContain('pruefstatus="aktuell"');
    expect(hinweise()).toHaveLength(1);
  });
  it('erhält die gespeicherte Markierung bei einem erst im Folgelauf fehlgeschlagenen Prüfstand', async () => {
    await starten();
    const { tor, davor } = await verzögerteFolge();
    const nativ = m.invoke.getMockImplementation()!;
    m.invoke.mockImplementation(async (befehl, args) => {
      if (befehl === 'atomar_datei_schreiben' && args.relativerPfad === konfliktPfad) {
        throw Error('Prüfstand im Folgelauf');
      }
      return nativ(befehl, args);
    });
    await act(async () => {
      tor.freigeben();
      await davor;
    });
    expect(hinweise()).toHaveLength(1);
    expect(hinweise()[0].hinweis.text).toContain(`${bezeichnung} wurde gespeichert.`);
    expect(hinweise()[0].hinweis.text).toContain(prueftext);
    expect(m.dateien.get(markierungsPfad)).toContain(eingabe);
    expect(markierungsSchreibaufrufe()).toHaveLength(1);
    expect(m.historie.size).toBe(1);
    expect(m.close).toHaveBeenCalledOnce();
    expect(dom.host.textContent).not.toContain('konnte nicht gespeichert');
    expect(dom.host.textContent).not.toContain(prueftext);
    expect(m.banner).not.toHaveBeenCalled();
  });
  async function vorhandeneMarkierungVorbereiten(bearbeiten: boolean) {
    if (istVerweis) {
      await markierungen.speichereVerweismarkierung(
        m.kontext! as VerweismarkierungKontext,
        markierungsEinzelzugriffFuerTest,
        eingabe,
        false,
        false,
        new Map(),
      );
    } else
      await markierungen.speichereKommentar(
        m.kontext! as KommentarKontext,
        markierungsEinzelzugriffFuerTest,
        eingabe,
        false,
      );
    await markierungen.pruefeAlleMarkierungen(() => {});
    if (bearbeiten) {
      const eintrag = (await markierungen.ladeMarkierungen(m.kontext!.gesetz))[0]!;
      const gemeinsam = {
        gesetz: m.kontext!.gesetz,
        openerLabel: 'fenster-1',
        ausgangsstelle: normAusgangsstelle('§ 1'),
      };
      m.kontext = istVerweis
        ? {
            ...gemeinsam,
            bearbeiten: {
              zitatText: eingabe,
              vorher: {
                verweisinhalt: eintrag.verweisinhalt!,
                elementstand: eintrag.bezug.elementstand,
              },
            },
          }
        : {
            ...gemeinsam,
            bearbeiten: {
              kommentarText: eingabe,
              vorher: { kommentarText: eingabe, elementstand: eintrag.bezug.elementstand },
            },
          };
    }
    m.invoke.mockClear();
    m.historie.clear();
    await starten();
  }
  it('meldet unverändertes Bearbeiten bei Folgelauffrist ohne Speicherung oder Historienaktion', async () => {
    await vorhandeneMarkierungVorbereiten(true);
    vi.useFakeTimers();
    const { tor, davor } = await verzögerteFolge();
    expect(m.close).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(hinweise()).toHaveLength(1);
    expect(hinweise()[0].hinweis.text).toBe(
      `${bezeichnung} ist unverändert. ${prueftext} Bitte im Markierungskonfliktfenster „Alle Markierungen neu prüfen“ ausführen.`,
    );
    expect(markierungsSchreibaufrufe()).toHaveLength(0);
    expect(m.historie.size).toBe(0);
    expect(m.close).toHaveBeenCalledOnce();
    await act(async () => {
      tor.freigeben();
      await davor;
    });
    expect(hinweise()).toHaveLength(1);
  });
  it('behält bei abgewiesenem Duplikat den Folgelauffristbefund lokal ohne Quelländerungsbehauptung', async () => {
    await vorhandeneMarkierungVorbereiten(false);
    vi.useFakeTimers();
    const { tor, davor } = await verzögerteFolge();
    expect(feld().disabled).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(dom.host.textContent).toContain(
      `Ein identischer ${istVerweis ? 'Verweis' : 'Kommentar'} existiert bereits.`,
    );
    expect(dom.host.textContent).toContain('nicht zuverlässig abgeschlossen');
    expect(dom.host.textContent).not.toContain('wurde gespeichert');
    expect(dom.host.textContent).not.toContain('Quelldatei wurde geändert');
    expect(hinweise()).toHaveLength(0);
    expect(feld().value).toBe(eingabe);
    expect(feld().disabled).toBe(false);
    expect(m.close).not.toHaveBeenCalled();
    expect(markierungsSchreibaufrufe()).toHaveLength(0);
    expect(m.historie.size).toBe(0);
    await act(async () => {
      tor.freigeben();
      await davor;
    });
  });
  it.each([false, true])(
    'wartet nach Speicher-Ausnahme und erhält vorherige Sicherung %s',
    async (sicherung) => {
      await starten();
      vi.useFakeTimers();
      if (sicherung) m.dateien.set(markierungsPfad, '<defekt');
      const nativ = m.invoke.getMockImplementation()!;
      m.invoke.mockImplementation(async (befehl, args) => {
        if (befehl === 'atomar_datei_schreiben' && args.relativerPfad === markierungsPfad)
          throw Error('Eigene Speicherung fehlgeschlagen');
        return nativ(befehl, args);
      });
      const { tor, davor } = await verzögerteFolge();
      expect(feld().disabled).toBe(true);
      expect(hinweise()).toHaveLength(0);
      await act(async () => vi.advanceTimersByTimeAsync(30_000));
      expect(dom.host.textContent).toContain(`${bezeichnung} konnte nicht gespeichert werden.`);
      expect(feld().value).toBe(eingabe);
      expect(feld().disabled).toBe(false);
      expect(m.close).not.toHaveBeenCalled();
      expect(m.historie.size).toBe(0);
      if (sicherung) {
        // Ein Hinweis je Vorgang, der alle Meldungen trägt.
        expect(hinweise()).toHaveLength(1);
        expect(hinweise()[0]?.hinweis.meldungen).toHaveLength(2);
        expect(
          hinweise()[0]?.hinweis.meldungen?.some(
            (meldung: { grund?: string }) => meldung.grund === 'imDatenordnerGesichert',
          ),
        ).toBe(true);
        expect(
          hinweise().some((hinweis) =>
            hinweis.hinweis.text.includes('Eine Quelldatei wurde geändert.'),
          ),
        ).toBe(true);
        expect(m.dateien.has(markierungsPfad)).toBe(false);
      } else {
        expect(hinweise()).toHaveLength(0);
        expect(dom.host.textContent).toContain('nicht zuverlässig abgeschlossen');
        expect(dom.host.textContent).not.toContain('Quelldatei wurde geändert');
      }
      expect(
        hinweise().some((hinweis) =>
          hinweis.hinweis.text.includes(`${bezeichnung} wurde gespeichert`),
        ),
      ).toBe(false);
      await act(async () => {
        tor.freigeben();
        await davor;
      });
    },
  );
  it('wiederholt nach Folgelauffrist ausschließlich die offene Historienübertragung', async () => {
    await starten();
    vi.useFakeTimers();
    m.bestaetigen = false;
    const { tor, davor } = await verzögerteFolge();
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(markierungsSchreibaufrufe()).toHaveLength(1);
    expect(m.close).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(hinweise()).toHaveLength(1);
    expect(hinweise()[0].hinweis.text).toContain(`${bezeichnung} wurde gespeichert.`);
    expect(dom.host.textContent).toContain(
      'Die Übernahme für Rückgängig konnte nicht bestätigt werden.',
    );
    m.bestaetigen = true;
    await act(async () => knopf('Erneut versuchen').click());
    expect(m.close).toHaveBeenCalledOnce();
    expect(markierungsSchreibaufrufe()).toHaveLength(1);
    expect(hinweise()).toHaveLength(1);
    expect(m.historie.size).toBe(1);
    await act(async () => {
      tor.freigeben();
      await davor;
    });
  });

  async function blockierePruefqueue() {
    const tor = warteTor();
    const nativ = m.invoke.getMockImplementation()!;
    let blockieren = true;
    m.invoke.mockImplementation(async (befehl, args) => {
      if (befehl === 'datei_sperre_erwerben' && args.relativerPfad === konfliktPfad && blockieren) {
        blockieren = false;
        await tor.warten;
        throw Error('Sperre des vorausgehenden Prüflaufs');
      }
      return nativ(befehl, args);
    });
    const davor = markierungen.pruefeAlleMarkierungen(() => {}).catch(() => undefined);
    pruefverwaltung.vollbedarf = true;
    return { tor, davor };
  }
  return {
    m,
    dom,
    feld,
    knopf,
    hinweise,
    starten,
    verzögerteFolge,
    markierungsSchreibaufrufe,
    warteTor,
    blockierePruefqueue,
  };
}
