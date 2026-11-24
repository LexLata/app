// @vitest-environment jsdom
// Echtes Verweisformular, Ausgangslader, Markierungsspeicher und Historienabschluss.
// Ersetzt ausschließlich native Grenzen und unabhängige Fensterdarstellungs-Effekte.
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import {
  bereiteMarkierungsFensterDateienVor,
  halteFensterHinweisAn,
  markierungsFensterBedienung,
  markierungsFensterNativeAttrappe,
} from '@/test/markierungen/markierungsFensterNativeAttrappe';
import { act } from 'react';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sicherungenImDatenordnerSatz } from '@/lib/domain/app/meldungsgruppen';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import VerweismarkierungFenster from './VerweismarkierungFenster';
import { importiereGesetzesreferenz } from '@/lib/import/import.index';
import {
  type VerweismarkierungKontext,
  hinzufuegenMarkierung,
  ladeMarkierungen,
  speichereVerweismarkierung,
} from '@/lib/markierungen/markierungen.index';
import { markierungsFensterGesetzLader } from '@/test/markierungen/markierungsFensterGesetzLader';
const markierungsEinzelzugriffFuerTest = markierungsFensterGesetzLader();

const netz = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: netz.fetch }));
vi.mock('@/components/hilfsfenster/gemeinsam/hilfsfensterGroesse', async (original) => ({
  ...(await original<typeof import('@/components/hilfsfenster/gemeinsam/hilfsfensterGroesse')>()),
  useDynamischeFensterGroesse: vi.fn(),
}));
const m = markierungsFensterNativeAttrappe<VerweismarkierungKontext>();
const dom = domTestWurzel();
const gesetz = gesetzesreferenz({ kurztitel: 'BGB' });
const markierungsPfad = 'markierungen/BGB_de-bund-markierungen.xml';
const titelPfad = 'nichtamtliche-titel/BGB_de-bund-nichtamtliche-titel.xml';
const pruefHinweis =
  'Der Verweis wurde gespeichert. Die Prüfung auf Markierungskonflikte konnte jedoch nicht zuverlässig abgeschlossen werden. Bitte im Markierungskonfliktfenster „Alle Markierungen neu prüfen“ ausführen.';
const { feld, knopf, schreibaufrufe, hinweise, warteAufAbschluss, warteAufAnzeige } =
  markierungsFensterBedienung(() => dom.host);
async function eingeben(text = '§ 1 BGB') {
  const eingabe = feld();
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(() => {
    setter.call(eingabe, text);
    eingabe.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function starten() {
  await act(async () => dom.root.render(<VerweismarkierungFenster />));
  await eingeben();
}
async function speichern(abschlussAbwarten = true) {
  await act(async () => knopf('Fertig').click());
  if (abschlussAbwarten) await warteAufAbschluss();
}
function pruefeZaehler(
  erwartet: Partial<{ schreiben: number; historie: number; hinweise: number; schliessen: number }>,
) {
  expect({
    schreiben: schreibaufrufe().length,
    historie: m.historie.size,
    hinweise: hinweise().length,
    schliessen: m.close.mock.calls.length,
  }).toMatchObject(erwartet);
}
function pruefeAbgewiesen() {
  expect({ text: feld().value, gesperrt: feld().disabled }).toEqual({
    text: '§ 1 BGB',
    gesperrt: false,
  });
  expect([schreibaufrufe().length, m.historie.size]).toEqual([0, 0]);
  expect(m.close).toHaveBeenCalledTimes(0);
  expect(m.banner).toHaveBeenCalledTimes(0);
}
function pruefeGespeichert() {
  expect([schreibaufrufe().length, m.historie.size]).toEqual([1, 1]);
  expect(m.close).toHaveBeenCalledTimes(1);
  expect(m.banner).toHaveBeenCalledTimes(0);
}
async function ausfuehren(abschlussAbwarten = true) {
  await starten();
  await speichern(abschlussAbwarten);
}
function verweigereBefehl(befehl: string, ursache: unknown) {
  const vorher = m.invoke.getMockImplementation()!;
  m.invoke.mockImplementation((name, args) =>
    name === befehl ? Promise.reject(ursache) : vorher(name, args),
  );
}
function verweigereLesen(pfad: string) {
  const vorher = m.lesen.getMockImplementation()!;
  m.lesen.mockImplementation((absolut) =>
    absolut.endsWith(pfad) ? Promise.reject(new Error('Lesen')) : vorher(absolut),
  );
}
function offenerPruefabschluss() {
  m.abschliessen.mockRejectedValue(new Error('Abschluss'));
}
function offeneHinweisAnnahme() {
  let annehmen!: () => void;
  const annahme = new Promise<void>((resolve) => {
    annehmen = resolve;
  });
  return { annahme, annehmen: () => annehmen() };
}
async function klicke(text: string) {
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(knopf(text)).toBeDefined();
  });
  await act(() => knopf(text).click());
}
function sicherungMitSchreibfehler(status: string) {
  m.dateien.set(markierungsPfad, 'defekt');
  const vorher = m.invoke.getMockImplementation()!;
  m.invoke.mockImplementation((befehl, args) => {
    switch (befehl) {
      case 'archiviere_beschaedigte_datei':
        m.dateien.set('kopie', m.dateien.get(markierungsPfad) ?? '');
        if (status === 'archiviert') m.dateien.delete(markierungsPfad);
        return Promise.resolve({ status, sicherungspfad: 'kopie' });
      case 'atomar_datei_schreiben':
        return Promise.reject(new Error('Schreiben'));
      default:
        return vorher(befehl, args);
    }
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  for (const bestand of [m.dateien, m.empfang, m.historie]) bestand.clear();
  m.bestaetigen = true;
  m.label = 'verweismarkierung-1';
  m.kontext = {
    gesetz,
    openerLabel: 'fenster-1',
    ausgangsstelle: normAusgangsstelle('§ 1'),
  };
  bereiteMarkierungsFensterDateienVor();
  m.dateien.set(
    'gesetze/BGB_de-bund.xml',
    m.dateien.get('gesetze/BGB_de-bund.xml')!.replace('<norm>', '<norm id="p1">'),
  );
});
afterEach(() => vi.useRealTimers());
it.each(['wartefrist', 'ipc'])(
  'zeigt Sperrfehler %s im echten Formular und erhält Eingaben',
  async (fehler) => {
    verweigereBefehl('datei_sperre_erwerben', fehler);
    await ausfuehren();
    await warteAufAnzeige(() => {
      expect(dom.host.textContent).toContain(
        fehler === 'wartefrist'
          ? 'Die Datei wird noch bearbeitet. Bitte erneut versuchen.'
          : 'Die Dateisperre konnte nicht erworben werden. Bitte erneut versuchen.',
      );
    });
    pruefeAbgewiesen();
  },
);
it.each(['lesen', 'sicherung', 'pruefbedarf'])(
  'zeigt %s ohne Schreiben oder Historienübernahme lokal',
  async (fall) => {
    m.dateien.set(markierungsPfad, 'defekt');
    if (fall === 'lesen') verweigereLesen(markierungsPfad);
    if (fall === 'sicherung')
      verweigereBefehl('archiviere_beschaedigte_datei', new Error('Sichern'));
    if (fall === 'pruefbedarf') m.vormerken.mockRejectedValue(new Error('Bedarf'));
    await ausfuehren();
    await warteAufAnzeige(() => {
      expect(dom.host.textContent).toContain(
        fall === 'lesen'
          ? 'konnte nicht gelesen'
          : fall === 'sicherung'
            ? 'nicht bereinigt'
            : 'Prüfbedarf konnte nicht vorgemerkt',
      );
    });
    pruefeAbgewiesen();
  },
);
it('erhält gespeicherten Verweis und Historienaktion beim offenen Prüfabschluss', async () => {
  offenerPruefabschluss();
  await ausfuehren();
  expect((await ladeMarkierungen(gesetz))[0]!.verweisinhalt?.verweistext).toBe('§ 1 BGB');
  expect(hinweise()).toHaveLength(1);
  expect(hinweise()[0]).toMatchObject({ oeffner: 'fenster-1', hinweis: { text: pruefHinweis } });
  pruefeGespeichert();
});
it('nimmt Sicherungshinweis vor Schließen an und verhindert weiteres Speichern während der Übergabe', async () => {
  m.dateien.set(markierungsPfad, 'defekt');
  const { begonnen, annehmen } = halteFensterHinweisAn();
  await ausfuehren(false);
  await begonnen;
  expect(feld().disabled).toBe(true);
  pruefeZaehler({ schliessen: 0, historie: 1 });
  await klicke('Schließen');
  expect(schreibaufrufe()).toHaveLength(1);
  await act(async () => annehmen());
  pruefeZaehler({ schliessen: 1, hinweise: 1 });
  expect(m.banner).not.toHaveBeenCalled();
});
it.each(['archiviert', 'gesichert_aber_nicht_entfernt'])(
  'meldet Sicherung %s und anschließend fehlgeschlagene Speicherung als getrennte Tatsachen',
  async (status) => {
    sicherungMitSchreibfehler(status);
    await ausfuehren();
    await warteAufAnzeige(() => {
      expect(dom.host.textContent).toContain('Der Verweis konnte nicht gespeichert werden.');
    });
    expect(feld().value).toBe('§ 1 BGB');
    expect(feld().disabled).toBe(false);
    expect(m.close).not.toHaveBeenCalled();
    expect(m.historie.size).toBe(0);
    if (status === 'archiviert') {
      expect(hinweise()).toHaveLength(1);
      expect(hinweise()[0].hinweis.meldungen).toEqual([
        expect.objectContaining({ grund: 'imDatenordnerGesichert', sicherung: expect.any(String) }),
      ]);
      expect(hinweise()[0].hinweis.text).not.toContain('Verweis wurde gespeichert');
    } else {
      expect(hinweise()).toHaveLength(0);
      await warteAufAnzeige(() => {
        expect(dom.host.textContent).toContain('konnte nicht bereinigt werden');
        expect(dom.host.textContent).toContain(sicherungenImDatenordnerSatz(1));
      });
      expect(dom.host.textContent).not.toContain('kopie');
    }
    expect(m.banner).not.toHaveBeenCalled();
  },
);
it.each(['titel', 'fremdes-gesetz'])(
  'berücksichtigt beim Verweis nur benötigte Quellen %s',
  async (quelle) => {
    const pfad = quelle === 'titel' ? titelPfad : 'gesetze/Fremd_de-bund.xml';
    m.dateien.set(pfad, 'defekt');
    verweigereLesen(pfad);
    await ausfuehren();
    expect(hinweise()).toHaveLength(quelle === 'titel' ? 1 : 0);
    if (quelle === 'titel') {
      expect(hinweise()[0].hinweis.text).toContain('Der Verweis wurde gespeichert.');
      expect(hinweise()[0].hinweis.text).toContain('konnte nicht gelesen');
    }
    expect(schreibaufrufe()).toHaveLength(1);
    expect(m.historie.size).toBe(1);
    expect(m.close).toHaveBeenCalledOnce();
    expect(m.banner).not.toHaveBeenCalled();
  },
);
it('ein Archivierungsabschluss der Ausgangsquelle behauptet keinen gespeicherten Verweis', async () => {
  m.dateien.set('gesetze/BGB_de-bund.xml', 'defekt');
  offenerPruefabschluss();
  await ausfuehren();
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(feld().disabled).toBe(false);
  });
  pruefeZaehler({ schreiben: 0, historie: 0 });
  expect(m.close).not.toHaveBeenCalled();
  expect(feld().disabled).toBe(false);
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('Der Verweis konnte nicht gespeichert werden.');
  });
  // Ein Hinweis je Vorgang, der alle Meldungen trägt.
  expect(hinweise()).toHaveLength(1);
  expect(hinweise()[0]?.hinweis.meldungen).toHaveLength(2);
  expect(
    hinweise()
      .map((h) => h.hinweis.text)
      .join(' '),
  ).not.toContain('Verweis wurde gespeichert');
  expect(m.banner).not.toHaveBeenCalled();
});
it('eine endgültige Hinweisfrist ändert Speichererfolg und Historie nicht und erlaubt keinen zweiten Schreibversuch', async () => {
  await starten();
  vi.useFakeTimers();
  offenerPruefabschluss();
  const { begonnen } = halteFensterHinweisAn();
  m.close.mockRejectedValueOnce(new Error('Schließen'));
  await speichern(false);
  await begonnen;
  expect(m.close).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(29_999));
  pruefeZaehler({ schliessen: 0, schreiben: 1, historie: 1 });
  await act(async () => vi.advanceTimersByTimeAsync(1));
  pruefeZaehler({ schreiben: 1, historie: 1, hinweise: 1 });
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('Das Fenster konnte nicht geschlossen werden.');
  });
  await klicke('Schließen');
  pruefeZaehler({ schreiben: 1, hinweise: 1, schliessen: 2 });
  expect(m.banner).not.toHaveBeenCalled();
});
it('wiederholt bei offenem Historienabschluss ausschließlich die Übertragung, ohne erneute Hinweise', async () => {
  await starten();
  vi.useFakeTimers();
  m.bestaetigen = false;
  offenerPruefabschluss();
  await speichern(false);
  await vi.waitFor(() => expect(m.historie.size).toBe(1));
  await act(async () => vi.advanceTimersByTimeAsync(5_000));
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain(
      'Die Änderung wurde gespeichert. Die Übernahme für Rückgängig konnte nicht bestätigt werden.',
    );
  });
  pruefeZaehler({ schliessen: 0, hinweise: 1, schreiben: 1 });
  m.bestaetigen = true;
  await klicke('Erneut versuchen');
  await warteAufAbschluss();
  pruefeZaehler({ schliessen: 1, schreiben: 1, hinweise: 1, historie: 1 });
});
it('zeigt Überlappungsablehnung ohne Schreiben oder Übertragung lokal', async () => {
  const textstelle = { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 4 };
  await hinzufuegenMarkierung(
    gesetz,
    markierungsEintrag({
      typ: 'kommentar',
      kommentarText: 'Zwischenzeitlich gespeicherter Kommentar',
      ...{
        ausgangsstelle: m.kontext!.ausgangsstelle,
      },
      bezug: { typ: 'bezugstext' as const, textstelle: textstelle, bezugstext: 'Text' },
    }),
  );
  m.kontext = { ...m.kontext!, auswahl: { textstelle, bezugstext: 'Text' } };
  m.invoke.mockClear();
  m.historie.clear();
  await ausfuehren();
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain(
      'Es kann nicht mehrere Markierungen an der gleichen Stelle geben.',
    );
  });
  expect(feld().value).toBe('§ 1 BGB');
  expect(feld().disabled).toBe(false);
  pruefeZaehler({ schreiben: 0, historie: 0 });
  expect(m.close).not.toHaveBeenCalled();
  expect(m.banner).not.toHaveBeenCalled();
});

it('unterscheidet unverändertes Bearbeiten mit offenem Prüfabschluss von neuer Speicherung', async () => {
  await speichereVerweismarkierung(
    m.kontext!,
    markierungsEinzelzugriffFuerTest,
    '§ 1 BGB',
    false,
    false,
    new Map(),
  );
  const elementstand = (await ladeMarkierungen(gesetz))[0]!.bezug.elementstand;
  m.kontext = {
    ...m.kontext!,
    bearbeiten: {
      zitatText: '§ 1 BGB',
      vorher: {
        verweisinhalt: (await ladeMarkierungen(gesetz))[0]!.verweisinhalt!,
        elementstand,
      },
    },
  };
  m.invoke.mockClear();
  m.historie.clear();
  await starten();
  offenerPruefabschluss();
  await speichern();
  pruefeZaehler({ schreiben: 0, historie: 0 });
  pruefeZaehler({ schliessen: 1, hinweise: 1 });
  expect(hinweise()[0].hinweis.text).toBe(
    'Der Verweis ist unverändert. Die Prüfung auf Markierungskonflikte konnte jedoch nicht zuverlässig abgeschlossen werden. Bitte im Markierungskonfliktfenster „Alle Markierungen neu prüfen“ ausführen.',
  );
  expect(m.banner).not.toHaveBeenCalled();
});
it('behält die Überarbeitung und ihre Historienaktion bei Hinweisfehlern', async () => {
  await speichereVerweismarkierung(
    m.kontext!,
    markierungsEinzelzugriffFuerTest,
    '§ 2 BGB',
    false,
    true,
    new Map(),
  );
  const vorher = (await ladeMarkierungen(gesetz))[0]!;
  m.kontext = {
    ...m.kontext!,
    bearbeiten: {
      zitatText: '§ 2 BGB',
      vorher: { verweisinhalt: vorher.verweisinhalt!, elementstand: vorher.bezug.elementstand },
    },
  };
  m.invoke.mockClear();
  m.historie.clear();
  await starten();
  offenerPruefabschluss();
  m.hinweise.mockRejectedValue(new Error('Fensterstart'));
  await speichern();
  expect((await ladeMarkierungen(gesetz))[0]!.verweisinhalt?.verweistext).toBe('§ 1 BGB');
  expect(schreibaufrufe()).toHaveLength(1);
  expect([...m.historie.values()]).toMatchObject([{ art: 'verweisBearbeiten' }]);
  pruefeZaehler({ schliessen: 1, hinweise: 1 });
  expect(dom.host.textContent).not.toContain('konnte nicht gespeichert');
  expect(dom.host.textContent).not.toContain('Prüfung auf Markierungskonflikte');
  expect(m.banner).not.toHaveBeenCalled();
});
it('stellt einen abgewiesenen Duplikatstart mit offenem Quellabschluss nicht als gespeichert dar', async () => {
  await speichereVerweismarkierung(
    m.kontext!,
    markierungsEinzelzugriffFuerTest,
    '§ 1 BGB',
    false,
    false,
    new Map(),
  );
  m.invoke.mockClear();
  m.historie.clear();
  await starten();
  offenerPruefabschluss();
  await speichern();
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('Ein identischer Verweis existiert bereits.');
  });
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('Prüfabschluss konnte nicht bestätigt werden');
  });
  expect(dom.host.textContent).not.toContain('Verweis wurde gespeichert');
  pruefeAbgewiesen();
  pruefeZaehler({ hinweise: 0 });
});

it('bündelt gleiche Prüfhinweise mehrerer Quellen einmal und erhält den Sicherungsbefund', async () => {
  m.dateien.set(titelPfad, 'defekt');
  offenerPruefabschluss();
  await ausfuehren();
  expect(
    hinweise()
      .flatMap((h) => h.hinweis.meldungen ?? [])
      .filter((x) => x.text === pruefHinweis),
  ).toHaveLength(1);
  // Ein Hinweis je Vorgang, der alle Meldungen trägt.
  expect(hinweise()).toHaveLength(1);
  expect(hinweise()[0]?.hinweis.meldungen).toHaveLength(2);
  expect(
    hinweise().some((hinweis) =>
      hinweis.hinweis.text.includes('Titeldatei für „BGB“ war beschädigt'),
    ),
  ).toBe(true);
  pruefeZaehler({ schreiben: 1, historie: 1, schliessen: 1 });
});

it('erhält den präzisen Zitatfehler und das unveränderte Zitat ohne Speicherung', async () => {
  await starten();
  await eingeben('§ 999 BGB');
  await speichern();
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('§\u00a0999 existiert nicht in BGB.');
  });
  expect(feld().value).toBe('§ 999 BGB');
  expect(feld().disabled).toBe(false);
  pruefeZaehler({ schreiben: 0, historie: 0, hinweise: 0, schliessen: 0 });
  expect(m.banner).not.toHaveBeenCalled();
});

// Der echte Importbutton führt durch Aktionskern, Dispatch, Bundquelle und Dateischreiben.
function bereiteImportVor(kurztitel = ['TestG']) {
  m.dateien.set(
    'importindizes/de-bund.xml',
    `<importindex version="1"><infos><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/></infos><inhalt>${kurztitel.map((titel) => `<gesetz><kurztitel>${titel}</kurztitel><langtitel>Testgesetz</langtitel><abrufkennung>${titel}</abrufkennung></gesetz>`).join('')}</inhalt></importindex>`,
  );
  netz.fetch.mockImplementation(async (url: string) => {
    const titel =
      kurztitel.find((titel) => url.toLowerCase().includes(titel.toLowerCase())) ?? kurztitel[0];
    const xml = `<dokumente doknr="gesetz"><norm doknr="gesetz"><metadaten><jurabk>${titel}</jurabk><langue>Testgesetz</langue><ausfertigung-datum>2000-01-01</ausfertigung-datum></metadaten></norm><norm doknr="norm"><metadaten><enbez>§ 1</enbez></metadaten><textdaten><text><Content><P>Text.</P></Content></text></textdaten></norm></dokumente>`;
    return { ok: true, arrayBuffer: async () => zipSync({ 'gesetz.xml': strToU8(xml) }).buffer };
  });
  const vorher = m.invoke.getMockImplementation()!;
  m.invoke.mockImplementation((name, args) => {
    if (name === 'import_aktualisierung_starten') return Promise.resolve('importvorgang');
    if (name === 'gesetz_import_sperre_versuchen_zu_erhalten') return Promise.resolve(true);
    if (name === 'gesetz_import_sperre_freigeben' || name === 'import_aktualisierung_beenden')
      return Promise.resolve();
    return vorher(name, args);
  });
}
async function importiereAusFormular(zitat = '§ 1 TestG') {
  await starten();
  await eingeben(zitat);
  await speichern();
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('ist nicht auf dem Gerät');
  });
  await klicke(zitat.includes(',') ? 'Gesetze importieren' : 'Gesetz importieren');
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(m.close.mock.calls.length > 0 || !feld().disabled).toBe(true);
  });
}
async function bereiteAktualisierungImFormularVor() {
  bereiteImportVor();
  expect(
    await importiereGesetzesreferenz(
      { kurztitel: 'TestG', normgeber: 'de-bund' },
      undefined,
      () => {},
    ),
  ).toMatchObject({ art: 'erfolg' });
  m.invoke.mockClear();
  await starten();
  await eingeben('§ 999 TestG');
  await speichern();
}
function gesetzSchreibaufrufe() {
  return schreibaufrufe().filter(([, args]) => args.relativerPfad.startsWith('gesetze/'));
}
it('zeigt nach echtem Import keinen BannerHost mehr und schließt mit einem gespeicherten Verweis', async () => {
  bereiteImportVor();
  await importiereAusFormular();
  expect(gesetzSchreibaufrufe()).toHaveLength(1);
  expect(
    schreibaufrufe().filter(([, args]) => args.relativerPfad.startsWith('markierungen/')),
  ).toHaveLength(1);
  expect((await ladeMarkierungen(gesetz))[0]?.verweisinhalt?.verweistext).toBe('§ 1 TestG');
  expect(m.historie.size).toBe(1);
  expect(m.close).toHaveBeenCalledOnce();
  expect(m.bannerHost).not.toHaveBeenCalled();
  expect(m.banner).not.toHaveBeenCalled();
});
it('übergibt den tatsächlichen Importabschluss vor einer nachfolgenden Verweissperrwartefrist', async () => {
  bereiteImportVor();
  m.abschliessen.mockImplementation(async (_vorgang, daten) => {
    if (daten === 'geaendert') throw new Error('Abschluss');
  });
  const vorher = m.invoke.getMockImplementation()!;
  m.invoke.mockImplementation((name, args) => {
    if (name === 'datei_sperre_erwerben' && args.relativerPfad.startsWith('markierungen/'))
      return Promise.reject('wartefrist');
    return vorher(name, args);
  });
  await importiereAusFormular();
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain(
      'Die Datei wird noch bearbeitet. Bitte erneut versuchen.',
    );
  });
  expect(feld().value).toBe('§ 1 TestG');
  expect(feld().disabled).toBe(false);
  expect(gesetzSchreibaufrufe()).toHaveLength(1);
  expect(m.historie.size).toBe(0);
  expect(m.close).not.toHaveBeenCalled();
  expect(hinweise().some((h) => h.hinweis.text.startsWith('TestG wurde importiert.'))).toBe(true);
  expect(m.banner).not.toHaveBeenCalled();
});
it('erhält zwei verschiedene Gesetzesabschlüsse mit gleichem Prüfhinweis', async () => {
  bereiteImportVor(['TestG', 'AndG']);
  m.abschliessen.mockRejectedValue(new Error('Abschluss'));
  await importiereAusFormular('§ 1 TestG, § 1 AndG');
  const texte = hinweise().map((h) => h.hinweis.text);
  expect(texte.some((text) => text.startsWith('TestG wurde importiert.'))).toBe(true);
  expect(texte.some((text) => text.startsWith('AndG wurde importiert.'))).toBe(true);
  expect(texte.filter((text) => text.startsWith('Der Verweis wurde gespeichert.'))).toHaveLength(1);
  expect(gesetzSchreibaufrufe()).toHaveLength(2);
  expect(m.historie.size).toBe(1);
  expect(m.banner).not.toHaveBeenCalled();
});
it('zeigt den fehlgeschlagenen Teilimport lokal neben dem erhaltenen Importhinweis', async () => {
  bereiteImportVor(['TestG', 'AndG']);
  const download = netz.fetch.getMockImplementation()!;
  netz.fetch.mockImplementation((url) =>
    url.toLowerCase().includes('andg') ? Promise.resolve({ ok: false }) : download(url),
  );
  m.abschliessen.mockRejectedValue(new Error('Abschluss'));
  await importiereAusFormular('§ 1 TestG, § 1 AndG');
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('AndG');
  });
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('nicht von gesetze-im-internet.de heruntergeladen');
  });
  expect(hinweise().some((h) => h.hinweis.text.startsWith('TestG wurde importiert.'))).toBe(true);
  expect(gesetzSchreibaufrufe()).toHaveLength(1);
  expect(m.historie.size).toBe(0);
  expect(m.close).not.toHaveBeenCalled();
  expect(feld().disabled).toBe(false);
  expect(m.banner).not.toHaveBeenCalled();
});

it('meldet einen gespeicherten Import auch neben gescheiterter frischer Bestandsladung wahrheitsgemäß', async () => {
  bereiteImportVor();
  m.abschliessen.mockRejectedValue(new Error('Abschluss'));
  const lesen = m.lesen.getMockImplementation()!;
  m.lesen.mockImplementation((pfad) =>
    pfad.includes('TestG_de-bund') ? Promise.reject(new Error('Frisch laden')) : lesen(pfad),
  );
  await importiereAusFormular();
  expect(gesetzSchreibaufrufe()).toHaveLength(1);
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('Das Gesetz konnte nicht verlässlich geladen werden.');
  });
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('konnte nicht gelesen');
  });
  expect(hinweise().some((h) => h.hinweis.text.startsWith('TestG wurde importiert.'))).toBe(true);
  expect(m.historie.size).toBe(0);
  expect(m.close).not.toHaveBeenCalled();
  expect(feld().value).toBe('§ 1 TestG');
  expect(feld().disabled).toBe(false);
  expect(m.banner).not.toHaveBeenCalled();
});
it('erhält Keine Neuerungen und den präzisen Zitatfehler neben einem Hinweis zur Prüfzeitpunktauffrischung', async () => {
  await bereiteAktualisierungImFormularVor();
  m.dateien.set('resources/nichtamtliche-titel/de-bund/TestG.xml', '<nichtamtlicheTitel/>');
  const vorher = m.invoke.getMockImplementation()!;
  m.invoke.mockImplementation((name, args) =>
    name === 'datei_sperre_erwerben' && args.relativerPfad.startsWith('nichtamtliche-titel/')
      ? Promise.reject('wartefrist')
      : vorher(name, args),
  );
  m.abschliessen.mockRejectedValue(new Error('Abschluss'));
  await klicke('Gesetz aktualisieren');
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(feld().disabled).toBe(false);
  });
  await act(async () => vi.waitFor(() => expect(hinweise().length).toBeGreaterThan(0)));
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('§\u00a0999 existiert nicht in TestG.');
  });
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('Keine Neuerungen.');
  });
  expect(
    hinweise().some((h) =>
      h.hinweis.text.startsWith('Der Prüfzeitpunkt des Gesetzes wurde aktualisiert.'),
    ),
    JSON.stringify(hinweise()),
  ).toBe(true);
  expect(gesetzSchreibaufrufe()).toHaveLength(1);
  expect(m.historie.size).toBe(0);
  expect(m.close).not.toHaveBeenCalled();
  expect(m.banner).not.toHaveBeenCalled();
});
it('wartet auf Importhinweisannahme vor erneuter Verweisspeicherung und Schließen', async () => {
  bereiteImportVor();
  m.abschliessen.mockRejectedValue(new Error('Abschluss'));
  const { annahme, annehmen } = offeneHinweisAnnahme();
  m.hinweise.mockReturnValueOnce(annahme);
  await starten();
  await eingeben('§ 1 TestG');
  await speichern();
  await klicke('Gesetz importieren');
  await act(async () => vi.waitFor(() => expect(hinweise().length).toBeGreaterThanOrEqual(1)));
  expect(gesetzSchreibaufrufe()).toHaveLength(1);
  expect(schreibaufrufe()).toHaveLength(1);
  expect(feld().disabled).toBe(true);
  await klicke('Abbrechen');
  expect(m.close).not.toHaveBeenCalled();
  expect(m.historie.size).toBe(0);
  await act(async () => annehmen());
  await act(async () => vi.waitFor(() => expect(m.close).toHaveBeenCalledOnce()));
  expect(gesetzSchreibaufrufe()).toHaveLength(1);
  expect(schreibaufrufe()).toHaveLength(2);
  expect(m.historie.size).toBe(1);
  expect(m.banner).not.toHaveBeenCalled();
});
it('ein endgültiger Importhinweisfehler löst keinen zweiten Import aus und lässt den Verweisabschluss zu', async () => {
  bereiteImportVor();
  m.abschliessen.mockRejectedValue(new Error('Abschluss'));
  m.hinweise.mockRejectedValue(new Error('Fensterstart'));
  await importiereAusFormular();
  expect(gesetzSchreibaufrufe()).toHaveLength(1);
  expect(schreibaufrufe()).toHaveLength(2);
  expect(m.historie.size).toBe(1);
  expect(m.close).toHaveBeenCalledOnce();
  expect(
    hinweise().filter(
      (h) =>
        h.hinweis.text.startsWith('TestG wurde importiert.') &&
        h.hinweis.text.includes('Prüfung auf Markierungskonflikte'),
    ),
  ).toHaveLength(1);
  expect(m.banner).not.toHaveBeenCalled();
});

it('verwendet ein zwischenzeitlich vorhandenes Gesetz ohne eigenen Import oder Speicherbehauptung', async () => {
  bereiteImportVor();
  await starten();
  await eingeben('§ 1 TestG');
  await speichern();
  const aufrufen = m.invoke.getMockImplementation()!;
  let eingefuegt = false;
  m.invoke.mockImplementation(async (befehl, args) => {
    const ergebnis = await aufrufen(befehl, args);
    // Der gezielte Existenzlauf sieht noch Abwesenheit. Erst der anschließende
    // Referenzimport sieht die zwischenzeitlich gespeicherte Datei.
    if (!eingefuegt && befehl === 'gesetz_dateistempel_lesen') {
      eingefuegt = true;
      m.dateien.set(
        'gesetze/TestG_de-bund.xml',
        m.dateien.get('gesetze/BGB_de-bund.xml')!.replaceAll('BGB', 'TestG'),
      );
      m.dateien.set('gesetze/Fremd_de-bund.xml', 'kaputt');
    }
    return ergebnis;
  });
  m.abschliessen.mockRejectedValue(new Error('Abschluss'));
  await klicke('Gesetz importieren');
  await act(async () => vi.waitFor(() => expect(m.close).toHaveBeenCalledOnce()));
  expect(gesetzSchreibaufrufe()).toHaveLength(0);
  expect(netz.fetch).not.toHaveBeenCalled();
  expect(m.historie.size).toBe(1);
  const texte = hinweise().map((h) => h.hinweis.text);
  expect(texte.some((text) => text.includes('TestG wurde importiert'))).toBe(false);
  expect(texte.some((text) => text.startsWith('Eine Quelldatei für TestG wurde geändert.'))).toBe(
    false,
  );
  expect(m.dateien.get('gesetze/Fremd_de-bund.xml')).toBe('kaputt');
  expect(texte.some((text) => text.startsWith('Der Verweis wurde gespeichert.'))).toBe(true);
  expect(m.banner).not.toHaveBeenCalled();
});
it('beendet eine ausbleibende Importhinweisannahme nach der Frist ohne erneuten Import', async () => {
  bereiteImportVor();
  await starten();
  await eingeben('§ 1 TestG');
  await speichern();
  vi.useFakeTimers();
  m.abschliessen.mockRejectedValue(new Error('Abschluss'));
  m.hinweise.mockImplementation((hinweis) =>
    hinweis.text.startsWith('TestG') ? new Promise(() => {}) : Promise.resolve(),
  );
  await klicke('Gesetz importieren');
  await act(async () => vi.waitFor(() => expect(hinweise().length).toBeGreaterThanOrEqual(1)));
  expect(schreibaufrufe()).toHaveLength(1);
  expect(m.close).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(29_000));
  expect(schreibaufrufe()).toHaveLength(1);
  expect(m.close).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(1_000));
  expect(gesetzSchreibaufrufe()).toHaveLength(1);
  expect(schreibaufrufe()).toHaveLength(2);
  expect(m.historie.size).toBe(1);
  expect(m.close).toHaveBeenCalledOnce();
  expect(m.banner).not.toHaveBeenCalled();
});

it('behält den präzisen Normfehler und zeigt den Fehler einer gescheiterten Aktualisierung lokal', async () => {
  await bereiteAktualisierungImFormularVor();
  netz.fetch.mockResolvedValue({ ok: false });
  await klicke('Gesetz aktualisieren');
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(feld().disabled).toBe(false);
  });
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('§\u00a0999 existiert nicht in TestG.');
  });
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('nicht von gesetze-im-internet.de heruntergeladen');
  });
  expect(feld().value).toBe('§ 999 TestG');
  expect(gesetzSchreibaufrufe()).toHaveLength(0);
  expect(m.historie.size).toBe(0);
  expect(m.close).not.toHaveBeenCalled();
  expect(m.banner).not.toHaveBeenCalled();
});

function verweigereErstenImportbestandsLauf(pfad: string) {
  const vorher = m.lesen.getMockImplementation()!;
  let fehlgeschlagen = false;
  m.lesen.mockImplementation((absolut) => {
    // Die Datei bleibt beim Fehler vorhanden, sonst wäre ihr zwischenzeitliches
    // Fehlen zutreffend kein Lesefehler. Erst der nächste Dateilauf sieht sie nicht.
    if (fehlgeschlagen && absolut.endsWith('BGB_de-bund.xml')) m.dateien.delete(pfad);
    if (!fehlgeschlagen && absolut.endsWith(pfad)) {
      fehlgeschlagen = true;
      return Promise.reject(new Error('Erster Importbestand'));
    }
    return vorher(absolut);
  });
}
it.each(['titel', 'fremdes-gesetz'] as const)(
  'ordnet Titelbefunde der Verweisspeicherung zu und lässt fremde Gesetzdateien unberührt (%s)',
  async (quelle) => {
    bereiteImportVor();
    await starten();
    await eingeben('§ 1 TestG');
    await speichern();
    const pfad = quelle === 'titel' ? titelPfad : 'gesetze/Fremd_de-bund.xml';
    m.dateien.set(pfad, 'defekt');
    verweigereErstenImportbestandsLauf(pfad);
    m.close.mockRejectedValueOnce(new Error('Schließen'));
    await klicke('Gesetz importieren');
    await act(async () => vi.waitFor(() => expect(m.close).toHaveBeenCalledOnce()));
    await warteAufAnzeige(() => {
      expect(dom.host.textContent).toContain('Das Fenster konnte nicht geschlossen werden.');
    });
    expect(dom.host.textContent).not.toContain('konnte nicht gelesen');
    const befunde = hinweise().filter((h) => h.hinweis.text.includes('konnte nicht gelesen'));
    expect(befunde).toHaveLength(quelle === 'titel' ? 1 : 0);
    if (quelle === 'titel')
      expect(befunde[0].hinweis.text).toContain('Der Verweis wurde gespeichert.');
    expect(gesetzSchreibaufrufe()).toHaveLength(1);
    expect(schreibaufrufe()).toHaveLength(2);
    expect(m.historie.size).toBe(1);
    await klicke('Schließen');
    expect(schreibaufrufe()).toHaveLength(2);
    expect(hinweise().filter((h) => h.hinweis.text.includes('konnte nicht gelesen'))).toHaveLength(
      quelle === 'titel' ? 1 : 0,
    );
    expect(m.banner).not.toHaveBeenCalled();
  },
);
it('übergibt einen Titel-Lesefehler der Verweisspeicherung vor offenem Historienabschluss und wiederholt ihn nicht', async () => {
  bereiteImportVor();
  await starten();
  await eingeben('§ 1 TestG');
  await speichern();
  m.dateien.set(titelPfad, 'defekt');
  verweigereErstenImportbestandsLauf(titelPfad);
  vi.useFakeTimers();
  m.bestaetigen = false;
  await klicke('Gesetz importieren');
  await act(async () => vi.waitFor(() => expect(m.historie.size).toBe(1)));
  await act(async () => vi.advanceTimersByTimeAsync(5_000));
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain(
      'Die Änderung wurde gespeichert. Die Übernahme für Rückgängig konnte nicht bestätigt werden.',
    );
  });
  expect(dom.host.textContent).not.toContain('konnte nicht gelesen');
  const befunde = hinweise().filter((h) => h.hinweis.text.includes('konnte nicht gelesen'));
  expect(befunde).toHaveLength(1);
  expect(befunde[0].hinweis.text).toContain('Der Verweis wurde gespeichert.');
  expect(schreibaufrufe()).toHaveLength(2);
  expect(m.close).not.toHaveBeenCalled();
  m.bestaetigen = true;
  await klicke('Erneut versuchen');
  await warteAufAbschluss();
  expect(m.close).toHaveBeenCalledOnce();
  expect(schreibaufrufe()).toHaveLength(2);
  expect(hinweise().filter((h) => h.hinweis.text.includes('konnte nicht gelesen'))).toHaveLength(1);
  expect(m.banner).not.toHaveBeenCalled();
});
it.each([1, 2])(
  'zeigt einen wiederkehrenden optionalen Ladebefund bei %i Importzielen nach Verweiserfolg genau einmal im Hauptfenster',
  async (anzahl) => {
    bereiteImportVor(anzahl === 1 ? ['TestG'] : ['TestG', 'AndG']);
    await starten();
    await eingeben(anzahl === 1 ? '§ 1 TestG' : '§ 1 TestG, § 1 AndG');
    await speichern();
    m.dateien.set(titelPfad, 'defekt');
    verweigereLesen(titelPfad);
    m.close.mockRejectedValueOnce(new Error('Schließen'));
    await klicke(anzahl === 1 ? 'Gesetz importieren' : 'Gesetze importieren');
    await act(async () => vi.waitFor(() => expect(m.close).toHaveBeenCalledOnce()));
    await warteAufAnzeige(() => {
      expect(dom.host.textContent).toContain('Das Fenster konnte nicht geschlossen werden.');
    });
    expect(dom.host.textContent).not.toContain('konnte nicht gelesen');
    expect(hinweise().filter((h) => h.hinweis.text.includes('konnte nicht gelesen'))).toHaveLength(
      1,
    );
    expect(gesetzSchreibaufrufe()).toHaveLength(anzahl);
    expect(m.historie.size).toBe(1);
    expect(m.banner).not.toHaveBeenCalled();
  },
);

// Gesamtabnahme: zusätzliche Quellen erreichen denselben echten Formularabschluss.
function bereiteWeitereQuelleVor(quelle: 'de-bw' | 'eu') {
  bereiteImportVor();
  m.dateien.set(
    'importindizes/de-bund.xml',
    m.dateien.get('importindizes/de-bund.xml')!.replace(/<gesetz>.*<\/gesetz>/, ''),
  );
  if (quelle === 'de-bw') {
    m.dateien.set(
      'importindizes/de-bw.xml',
      '<importindex version="1"><infos><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit><normgeber>de-bw</normgeber><datenquelle name="Landesrecht BW"/></infos><inhalt><gesetz><kurztitel>TestG</kurztitel><langtitel>Testgesetz</langtitel><abrufkennung>TestG</abrufkennung></gesetz></inhalt></importindex>',
    );
    const vorher = m.invoke.getMockImplementation()!;
    m.invoke.mockImplementation((name, args) =>
      name === 'lade_gesetz_html_bw'
        ? Promise.resolve(
            '<html><head><title>Landesrecht BW - TestG | Landesnorm Baden-Württemberg | Gesamtausgabe | Testgesetz (TestG) vom 1. Januar 2000</title><meta charset="utf-8"></head><body><div class="docLayoutText"><h4 style="font-family: Arial">§ 1<br/>Titel</h4><p>Text.</p></div></body></html>',
          )
        : vorher(name, args),
    );
  } else {
    m.dateien.set(
      'resources/europa/TestG_vollstaendig.xml',
      '<gesetz version="1"><infos><kurztitel>TestG</kurztitel><langtitel>Testgesetz</langtitel><normgeber>eu</normgeber><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit></infos><inhalt><norm id="n"><bezeichnung>Art. 1</bezeichnung><text><absatz>Text</absatz></text></norm></inhalt></gesetz>',
    );
  }
}
it.each(['de-bw', 'eu'] as const)(
  '%s importiert aus dem Formular und erhält Gesetz, Verweis und Historie bei Hinweisfehler',
  async (quelle) => {
    bereiteWeitereQuelleVor(quelle);
    m.abschliessen.mockRejectedValue(new Error('Abschluss'));
    m.hinweise.mockRejectedValue(new Error('Fensterstart'));
    const zitat = quelle === 'de-bw' ? '§ 1 TestG' : 'Art. 1 TestG';
    await importiereAusFormular(zitat);
    expect(m.dateien.has(`gesetze/TestG_${quelle}.xml`), dom.host.textContent ?? '').toBe(true);
    expect((await ladeMarkierungen(gesetz))[0]?.verweisinhalt?.verweistext).toBe(zitat);
    expect(gesetzSchreibaufrufe()).toHaveLength(1);
    expect(schreibaufrufe()).toHaveLength(2);
    expect(m.historie.size).toBe(1);
    expect(m.close).toHaveBeenCalledOnce();
    expect(
      hinweise().filter((h) => h.hinweis.text.startsWith('TestG wurde importiert.')),
    ).toHaveLength(1);
    expect(m.banner).not.toHaveBeenCalled();
    expect(m.bannerHost).not.toHaveBeenCalled();
  },
);
it('erhält eine echte Inhaltsaktualisierung vor anschließendem Verweisabschluss', async () => {
  await bereiteAktualisierungImFormularVor();
  const download = netz.fetch.getMockImplementation()!;
  netz.fetch.mockImplementation(async (url) => {
    const antwort = await download(url);
    // Eine neue Norm macht das zuvor abgewiesene Zitat nun auflösbar.
    const xml =
      '<dokumente doknr="gesetz"><norm doknr="gesetz"><metadaten><jurabk>TestG</jurabk><langue>Testgesetz</langue><ausfertigung-datum>2000-01-01</ausfertigung-datum></metadaten></norm><norm doknr="norm"><metadaten><enbez>§ 999</enbez></metadaten><textdaten><text><Content><P>Neuer Text.</P></Content></text></textdaten></norm></dokumente>';
    return { ...antwort, arrayBuffer: async () => zipSync({ 'gesetz.xml': strToU8(xml) }).buffer };
  });
  m.abschliessen.mockRejectedValue(new Error('Abschluss'));
  await klicke('Gesetz aktualisieren');
  await act(async () => vi.waitFor(() => expect(m.close).toHaveBeenCalledOnce()));
  expect(m.dateien.get('gesetze/TestG_de-bund.xml')).toContain('Neuer Text');
  expect((await ladeMarkierungen(gesetz))[0]?.verweisinhalt?.verweistext).toBe('§ 999 TestG');
  expect(gesetzSchreibaufrufe()).toHaveLength(1);
  expect(schreibaufrufe()).toHaveLength(2);
  expect(
    hinweise().filter((h) => h.hinweis.text.startsWith('TestG wurde aktualisiert.')),
  ).toHaveLength(1);
  expect(m.historie.size).toBe(1);
  expect(m.banner).not.toHaveBeenCalled();
});
it.each(['archiviert', 'gesichert_aber_nicht_entfernt'] as const)(
  'lässt fremde beschädigte Dateien bei Importschreibfehler unberührt (fremder Sicherungsstatus: %s)',
  async (status) => {
    bereiteImportVor();
    await starten();
    await eingeben('§ 1 TestG');
    await speichern();
    m.dateien.set('gesetze/Fremd_de-sn.xml', 'kaputt');
    const vorher = m.invoke.getMockImplementation()!;
    m.invoke.mockImplementation((name, args) => {
      if (name === 'archiviere_beschaedigte_datei') {
        if (status === 'archiviert') m.dateien.delete(args.relativerPfad);
        return Promise.resolve({ status, sicherungspfad: 'kopie' });
      }
      if (name === 'atomar_datei_schreiben' && args.relativerPfad.startsWith('gesetze/'))
        return Promise.reject(new Error('Importschreiben'));
      return vorher(name, args);
    });
    await klicke('Gesetz importieren');
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(feld().disabled).toBe(false);
    });
    await warteAufAnzeige(() => {
      expect(dom.host.textContent).toContain('nicht gespeichert');
    });
    expect(feld().value).toBe('§ 1 TestG');
    expect(m.dateien.has('gesetze/TestG_de-bund.xml')).toBe(false);
    expect(m.historie.size).toBe(0);
    expect(m.close).not.toHaveBeenCalled();
    expect(m.dateien.get('gesetze/Fremd_de-sn.xml')).toBe('kaputt');
    expect(
      hinweise().some(
        (h) =>
          h.hinweis.grund === 'gesichertNichtEntfernt' || h.hinweis.text.includes('nicht entfernt'),
      ),
    ).toBe(false);
    expect(hinweise().some((h) => h.hinweis.text.includes('TestG wurde importiert.'))).toBe(false);
    expect(m.banner).not.toHaveBeenCalled();
  },
);

it.each([{ gesetze: ['TestG'] }, { gesetze: ['TestG', 'AndG'] }])(
  'meldet eingeschränkte Referenzerkennung nach echtem Formularimport von %j einmalig im Hauptfenster',
  async ({ gesetze }) => {
    bereiteImportVor(gesetze);
    m.dateien.set('resources/europa/defekt.xml', 'kaputt');
    await importiereAusFormular(gesetze.map((titel) => `§ 1 ${titel}`).join(', '));
    const diagnosen = hinweise().filter((h) =>
      h.hinweis.text.includes('Erkennung von Gesetzesverweisen ist eingeschränkt'),
    );
    expect(diagnosen).toHaveLength(1);
    expect(diagnosen[0].hinweis.text).toContain('Europa-Datei defekt.xml nicht verwendbar');
    expect(dom.host.textContent).not.toContain('Erkennung von Gesetzesverweisen ist eingeschränkt');
    expect(gesetzSchreibaufrufe()).toHaveLength(gesetze.length);
    expect(schreibaufrufe()).toHaveLength(gesetze.length + 1);
    expect(m.historie.size).toBe(1);
    expect(m.close).toHaveBeenCalledOnce();
    expect(m.banner).not.toHaveBeenCalled();
  },
);
it('lässt eine fremde beschädigte Datei auch bei gesperrter Sicherung neben erfolgreichem Verweisabschluss unberührt', async () => {
  bereiteImportVor();
  await starten();
  await eingeben('§ 1 TestG');
  await speichern();
  m.dateien.set('gesetze/Fremd_de-sn.xml', 'kaputt');
  verweigereBefehl('archiviere_beschaedigte_datei', new Error('Importsicherung'));
  await klicke('Gesetz importieren');
  await act(async () => vi.waitFor(() => expect(m.close).toHaveBeenCalledOnce()));
  expect(m.dateien.has('gesetze/Fremd_de-sn.xml')).toBe(true);
  expect(hinweise().filter((h) => h.hinweis.text.includes('nicht gesichert'))).toHaveLength(0);
  expect(dom.host.textContent).not.toContain('nicht gesichert');
  expect(gesetzSchreibaufrufe()).toHaveLength(1);
  expect(m.historie.size).toBe(1);
  expect(m.banner).not.toHaveBeenCalled();
});

it('übernimmt beim Schließen während des Sperrwartens keine Historie und schließt nicht erneut', async () => {
  await starten();
  const nativ = m.invoke.getMockImplementation()!;
  let freigeben = () => {};
  const warten = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  let meldeSperrwarte = () => {};
  const sperrwarteBegonnen = new Promise<void>((resolve) => {
    meldeSperrwarte = resolve;
  });
  let meldeQuellabschluss = () => {};
  const quelleAbgeschlossen = new Promise<void>((resolve) => {
    meldeQuellabschluss = resolve;
  });
  const abschliessen = m.abschliessen.getMockImplementation();
  if (!abschliessen) throw new Error('Native Quellabschlussattrappe fehlt');
  m.abschliessen.mockImplementation(async (...args) => {
    const ergebnis = await abschliessen(...args);
    if (args[1] === 'geaendert') meldeQuellabschluss();
    return ergebnis;
  });
  m.invoke.mockImplementation(async (name, args) => {
    if (name === 'datei_sperre_erwerben' && args.relativerPfad === markierungsPfad) {
      meldeSperrwarte();
      await warten;
    }
    return nativ(name, args);
  });
  await speichern(false);
  await act(async () => sperrwarteBegonnen);
  expect(feld().disabled).toBe(true);
  expect(
    schreibaufrufe().filter(([, args]) => args.relativerPfad === markierungsPfad),
  ).toHaveLength(0);
  await act(async () => dom.root.render(null));
  await act(async () => {
    freigeben();
    await quelleAbgeschlossen;
  });
  expect(
    schreibaufrufe().filter(([, args]) => args.relativerPfad === markierungsPfad),
  ).toHaveLength(1);
  expect((await ladeMarkierungen(gesetz))[0]?.verweisinhalt?.verweistext).toBe('§ 1 BGB');
  pruefeZaehler({ historie: 0, hinweise: 0, schliessen: 0 });
});
