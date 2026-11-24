// Ablaufsteuerung und lokale Fehleranzeigen der Konfliktseitenleiste.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import type { AnzeigeGesetzKonflikte } from '@/lib/markierungen/markierungen.index';
import type { Auswahl } from './MarkierungskonfliktFenster.helpers';
import { Konfliktseitenleiste } from './Konfliktseitenleiste';
import { KonfliktseitenleisteAuswahl } from './KonfliktseitenleisteAuswahl';
import { KonfliktseitenleisteHilfe } from './KonfliktseitenleisteHilfe';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

const mocks = vi.hoisted(() => ({
  pruefen: vi.fn(),
  loeschen: vi.fn(),
  alleLoeschen: vi.fn(),
  importieren: vi.fn(),
  confirm: vi.fn(),
  importErfolg: vi.fn(),
  geprueft: vi.fn(),
  ladeLive: vi.fn(),
  navigation: vi.fn(),
  moeglichkeit: vi.fn(),
  ausgang: vi.fn(),
  ziel: vi.fn(),
  alleVerknuepfen: vi.fn(),
  nachfehler: vi.fn(),
}));
let werte: unknown[] = [];
let setzer: ((wert: unknown) => void)[] = [];
let index = 0;
let effektIndex = 0;
let effektDeps: unknown[][] = [];
let effektProtokoll: string[] | null = null;
let effektAufraeumen: ((() => void) | undefined)[] = [];
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffectEvent: (handler: (...args: unknown[]) => unknown) => handler,
  useRef: (anfang: unknown) => {
    const nummer = index++;
    if (!(nummer in werte)) werte[nummer] = { current: anfang };
    return werte[nummer];
  },
  useState: (anfang: unknown) => {
    const nummer = index++;
    if (!(nummer in werte)) werte[nummer] = anfang;
    return [
      werte[nummer],
      (setzer[nummer] ??= (wert: unknown) => {
        werte[nummer] = typeof wert === 'function' ? wert(werte[nummer]) : wert;
      }),
    ];
  },
  useEffect: (effekt: () => void | (() => void), deps: unknown[]) => {
    const platz = effektIndex++;
    if (!effektDeps[platz] || deps.some((d, i) => d !== effektDeps[platz]![i])) {
      if (effektProtokoll && effektAufraeumen[platz]) {
        effektProtokoll.push(`aufraeumen:${platz}`);
        effektAufraeumen[platz]!();
      }
      effektDeps[platz] = deps;
      effektProtokoll?.push(`effekt:${platz}`);
      const aufraeumen = effekt();
      effektAufraeumen[platz] = typeof aufraeumen === 'function' ? aufraeumen : undefined;
    }
  },
}));
vi.mock('@/lib/markierungen/markierungen.index', () => ({
  ladeAktuelleMarkierung: mocks.ladeLive,
  ermittleFehlendeGesetze: () => [{ kurztitel: 'BGB', normgeber: 'de-bund' }],
  importFehlenderNormen: mocks.importieren,
  loescheAusgewaehlt: mocks.loeschen,
  loescheAlleMitKonflikten: mocks.alleLoeschen,
  aktualisiereVerknuepfungMitErgebnis: mocks.ziel,
  aktualisiereAusgangsVerknuepfungMitErgebnis: mocks.ausgang,
  ermittleAktuelleVerknuepfungsMoeglichkeit: mocks.moeglichkeit,
  verknuepfeMitAktuellenNormen: mocks.alleVerknuepfen,
  pruefeAlleMarkierungen: mocks.pruefen,
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: mocks.confirm }));
vi.mock('@/hooks/fenster/useInterneNavigation', () => ({ oeffneInternesZiel: mocks.navigation }));
vi.mock(
  '@/hooks/markierungen/useVerweismarkierungUndKommentarHilfsfenster.ausgangskontext',
  () => ({
    bearbeiteVerweismarkierung: vi.fn(),
  }),
);
vi.mock('@/hooks/stil/useTextRollen', () => ({
  useIconGroessen: () => ({ standard: 16 }),
  useTextRollen: () => ({ fehlertext: {}, standardtextBetont: {}, hinweistext: {} }),
}));
vi.mock('@/hooks/stil/useButtonRollen', () => ({
  useButtonRollen: () => ({
    sekundaerKompakt: () => ({}),
    paddingFaktorKompakt: () => '5px 8px',
  }),
}));
vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({ useUiSkalierungsFaktor: () => 1 }));
vi.mock('@/hooks/stil/useAbstandRollen', () => ({ useAbstandRollen: () => ({ gross: 12 }) }));

let auswahl: Auswahl | null;
let angebot: { moeglich: boolean; fehler: string | null };
let aktionsAbschlussOffen = false;
let registriereAbschluss: ((lauf: Promise<unknown>) => void) | undefined;
let gesetze: AnzeigeGesetzKonflikte[] = [
  { gesetz: { kurztitel: 'BGB', normgeber: 'de-bund' }, fehlendesGesetz: true, eintraege: [] },
];
function rendern() {
  index = 0;
  effektIndex = 0;
  return Konfliktseitenleiste({
    ladeGesetz: undefined,
    auswahl,
    gesetze,
    verknuepfungsMoeglichkeit: angebot,
    wirdGeladen: false,
    aktionsAbschlussOffen,
    registriereAbschluss,
    onErfolgreicherImport: mocks.importErfolg,
    onAlleGeprueft: mocks.geprueft,
    onAktionsNachfehler: mocks.nachfehler,
  });
}
function elemente(knoten: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(knoten)) return knoten.flatMap(elemente);
  if (!knoten || typeof knoten !== 'object' || !('props' in knoten)) return [];
  const element = knoten as ReactElement<Record<string, unknown>>;
  if (element.type === KonfliktseitenleisteAuswahl) {
    return elemente(
      KonfliktseitenleisteAuswahl(
        element.props as Parameters<typeof KonfliktseitenleisteAuswahl>[0],
      ),
    );
  }
  if (element.type === KonfliktseitenleisteHilfe) {
    return elemente(
      KonfliktseitenleisteHilfe(element.props as Parameters<typeof KonfliktseitenleisteHilfe>[0]),
    );
  }
  return [element, ...elemente(element.props.children)];
}
function button(text: string) {
  return elemente(rendern()).find(
    (e) =>
      (e.type === 'button' || e.props.element === 'button') &&
      elemente(e.props.children).some(
        (kind) => kind.props.children === text || kind.props.text === text,
      ),
  )!;
}
function texte() {
  return elemente(rendern()).flatMap((e) =>
    typeof e.props.text === 'string'
      ? [e.props.text]
      : typeof e.props.children === 'string'
        ? [e.props.children]
        : [],
  );
}
async function klicken(text: string) {
  await (button(text).props.onClick as () => Promise<unknown>)();
}
const speicherFehler = 'Die Aktion konnte nicht vollständig gespeichert werden.';
beforeEach(() => {
  vi.resetAllMocks();
  werte = [];
  setzer = [];
  aktionsAbschlussOffen = false;
  registriereAbschluss = undefined;
  angebot = { moeglich: false, fehler: null };
  effektDeps = [];
  effektProtokoll = null;
  effektAufraeumen = [];
  gesetze = [
    { gesetz: { kurztitel: 'BGB', normgeber: 'de-bund' }, fehlendesGesetz: true, eintraege: [] },
  ];
  mocks.moeglichkeit.mockResolvedValue({ moeglich: false, fehler: [] });
  auswahl = { art: 'datensatz', gesetz: { kurztitel: 'BGB', normgeber: 'de-bund' } };
  mocks.confirm.mockResolvedValue(true);
  mocks.navigation.mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('Charakterisierung des Aktionslaufs vor dem Konfliktseitenleisten-Schnitt', () => {
  it('erhält die Effektreihenfolge beim Mount, Auswahlwechsel und Aufräumen', () => {
    effektProtokoll = [];
    rendern();
    expect(effektProtokoll).toEqual(['effekt:0', 'effekt:1', 'effekt:2']);
    effektProtokoll.length = 0;
    mocks.ladeLive.mockImplementation(() => new Promise(() => {}));
    auswahl = zielAuswahl('live', 'zielNormUnpassend', gesetzesreferenz({ kurztitel: 'StGB' }));
    rendern();
    expect(effektProtokoll).toEqual(['aufraeumen:1', 'effekt:1', 'effekt:2']);
    effektProtokoll.length = 0;
    effektAufraeumen.forEach((aufraeumen, platz) => {
      if (!aufraeumen) return;
      effektProtokoll!.push(`aufraeumen:${platz}`);
      aufraeumen();
    });
    expect(effektProtokoll).toEqual(['aufraeumen:1', 'aufraeumen:2']);
  });
  it('verhindert einen zweiten Start auch über einen bereits erfassten Klickhandler', async () => {
    let abschliessen!: () => void;
    mocks.loeschen.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          abschliessen = resolve;
        }),
    );
    const starten = button('Markierungen löschen').props.onClick as () => Promise<unknown>;
    const ersterLauf = starten();
    await vi.waitFor(() => expect(mocks.loeschen).toHaveBeenCalledTimes(1));
    await starten();
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(mocks.loeschen).toHaveBeenCalledTimes(1);
    abschliessen();
    await ersterLauf;
    expect(button('Markierungen löschen').props.disabled).toBe(false);
  });

  it('zeigt die vollständige Folge idle, laeuft, fertig, idle bei verzögerter Vollprüfung', async () => {
    vi.useFakeTimers();
    try {
      let abschliessen!: () => void;
      mocks.pruefen.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            abschliessen = resolve;
          }),
      );
      expect(texte()).toContain('Alle Markierungen neu prüfen');
      const lauf = klicken('Alle Markierungen neu prüfen');
      expect(texte()).toContain('Prüfung läuft …');
      expect(button('Prüfung läuft …').props.disabled).toBe(true);
      abschliessen();
      await lauf;
      expect(texte()).toContain('Prüfung durchgeführt ✓');
      vi.advanceTimersByTime(2499);
      expect(texte()).toContain('Prüfung durchgeführt ✓');
      vi.advanceTimersByTime(1);
      expect(texte()).toContain('Alle Markierungen neu prüfen');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('lokale Aktionsfehler', () => {
  it('fängt Schreibfehler ab, gibt Laufzustand frei und setzt Auswahlfehler zurück', async () => {
    mocks.loeschen.mockRejectedValue(new Error('voll'));
    await expect(klicken('Markierungen löschen')).resolves.toBeUndefined();
    expect(texte()).toContain(speicherFehler);
    expect(button('Markierungen löschen').props.disabled).toBe(false);
    auswahl = { art: 'datensatz', gesetz: { kurztitel: 'StGB', normgeber: 'de-bund' } };
    rendern();
    expect(texte()).not.toContain(speicherFehler);
  });
  it('zeigt bei Prüfungsfehlern keinen Erfolg und erhält globale Fehler beim Auswahlwechsel', async () => {
    mocks.pruefen.mockRejectedValue(new Error('voll'));
    await expect(klicken('Alle Markierungen neu prüfen')).resolves.toBeUndefined();
    expect(texte()).toContain('Die Markierungen konnten nicht vollständig geprüft werden.');
    expect(texte()).not.toContain('Prüfung durchgeführt ✓');
    expect(button('Alle Markierungen neu prüfen').props.disabled).toBe(false);
    auswahl = { art: 'datensatz', gesetz: { kurztitel: 'StGB', normgeber: 'de-bund' } };
    rendern();
    expect(texte()).toContain('Die Markierungen konnten nicht vollständig geprüft werden.');
  });
  it('erhält den Teilbericht bei unerwartetem Sammelimport-Abbruch', async () => {
    mocks.importieren.mockImplementation(async (_titel, melden) => {
      melden({ gesetz: { kurztitel: 'BGB', normgeber: 'de-bund' }, erfolg: true });
      throw new Error('Folgefehler');
    });
    await expect(
      klicken('Fehlende Rechtstexte aus dem Internet importieren'),
    ).resolves.toBeUndefined();
    expect(texte().some((t) => t.includes('✓') && t.includes('BGB'))).toBe(true);
    expect(texte()).toContain('Der Import konnte nicht vollständig abgeschlossen werden.');
    expect(mocks.importErfolg).toHaveBeenCalledWith({ kurztitel: 'BGB', normgeber: 'de-bund' });
  });
  it('behält konkrete Einzelimportfehler und fängt unerwartete Folgefehler ab', async () => {
    mocks.importieren.mockResolvedValueOnce([
      {
        gesetz: { kurztitel: 'BGB', normgeber: 'de-bund' },
        erfolg: false,
        fehler: 'Konkreter Importfehler',
      },
    ]);
    await klicken('Import des Gesetzes aus dem Internet');
    expect(texte()).toContain('Konkreter Importfehler');
    mocks.importieren.mockResolvedValueOnce([
      { gesetz: { kurztitel: 'BGB', normgeber: 'de-bund' }, erfolg: true },
    ]);
    mocks.importErfolg.mockImplementationOnce(() => {
      throw new Error('Folgefehler');
    });
    await expect(klicken('Import des Gesetzes aus dem Internet')).resolves.toBeUndefined();
    expect(texte()).toContain(speicherFehler);
  });
  it('fängt Dialogfehler lokal ab und behandelt Abbruch still', async () => {
    mocks.confirm.mockRejectedValueOnce(new Error('Dialog'));
    await expect(klicken('Markierungen löschen')).resolves.toBeUndefined();
    expect(texte()).toContain(speicherFehler);
    mocks.confirm.mockResolvedValueOnce(false);
    await klicken('Markierungen löschen');
    expect(texte()).not.toContain(speicherFehler);
    expect(mocks.loeschen).not.toHaveBeenCalled();
  });
});

describe('Auswahlwechsel während Aktionen', () => {
  it('ordnet einen späten Aktionsfehler nicht der neuen Auswahl zu', async () => {
    let ablehnen!: (e: Error) => void;
    mocks.loeschen.mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          ablehnen = reject;
        }),
    );
    auswahl = {
      art: 'nichtamtlicheTitelXmlFehlt',
      gesetz: { kurztitel: 'BGB', normgeber: 'de-bund' },
    };
    const lauf = klicken('Markierungen nichtamtlicher Titel löschen');
    expect(button('Markierungen nichtamtlicher Titel löschen').props.disabled).toBe(true);
    await vi.waitFor(() => expect(ablehnen).toBeTypeOf('function'));
    auswahl = { art: 'datensatz', gesetz: { kurztitel: 'BGB', normgeber: 'de-bund' } };
    rendern();
    ablehnen(new Error('Fehler der vorigen Auswahl'));
    await lauf;
    expect(texte()).not.toContain(speicherFehler);
  });
  it('ordnet einen späten konkreten Importfehler nicht der neuen Auswahl zu', async () => {
    let abschliessen!: (bericht: unknown[]) => void;
    mocks.importieren.mockImplementation(
      () =>
        new Promise((resolve) => {
          abschliessen = resolve;
        }),
    );
    const lauf = klicken('Import des Gesetzes aus dem Internet');
    auswahl = { art: 'datensatz', gesetz: { kurztitel: 'StGB', normgeber: 'de-bund' } };
    rendern();
    abschliessen([
      {
        gesetz: { kurztitel: 'BGB', normgeber: 'de-bund' },
        erfolg: false,
        fehler: 'Fehler nur für BGB',
      },
    ]);
    await lauf;
    expect(texte()).not.toContain('Fehler nur für BGB');
  });
});

describe('Aktionsbereiche und weiterer Importbutton', () => {
  it('zeigt Auswahlfehler vor und Sammelfehler nach den Sammelaktionen', async () => {
    mocks.loeschen.mockRejectedValueOnce(new Error('Speichern'));
    await klicken('Markierungen löschen');
    let inhalte = texte();
    expect(inhalte.indexOf(speicherFehler)).toBeLessThan(
      inhalte.indexOf('Aktionen für mehrere Konflikte'),
    );
    mocks.alleLoeschen.mockRejectedValueOnce(new Error('Speichern'));
    await klicken('Alle betroffenen Markierungen löschen');
    inhalte = texte();
    expect(inhalte.indexOf(speicherFehler)).toBeGreaterThan(
      inhalte.indexOf('Alle Markierungen neu prüfen'),
    );
  });
  it('fängt auch Fehler des Sammeldialogs ab und behandelt dessen Abbruch still', async () => {
    mocks.confirm.mockRejectedValueOnce(new Error('Dialog'));
    await expect(klicken('Alle betroffenen Markierungen löschen')).resolves.toBeUndefined();
    expect(texte()).toContain(speicherFehler);
    mocks.confirm.mockResolvedValueOnce(false);
    await klicken('Alle betroffenen Markierungen löschen');
    expect(texte()).not.toContain(speicherFehler);
    expect(mocks.alleLoeschen).not.toHaveBeenCalled();
  });
  it('behält konkrete Fehler des Zielgesetzimports und fängt unerwartete Rejections ab', async () => {
    auswahl = {
      art: 'zeile',
      gesetz: { kurztitel: 'BGB', normgeber: 'de-bund' },
      eintrag: {
        schluessel: 'markierung',
        ausgangsstelle: normAusgangsstelle('§ 1'),
        bezeichnungAnzeige: '§ 1',
        markierungstyp: 'verweismarkierung',
        zielKonflikte: [],
      },
      zeile: {
        schluessel: 'ziel',
        verweisziele: [],
        symbol: 'kreuz',
        zeilenart: 'zielGesetzFehlt',
        zielgesetz: { kurztitel: 'StGB', normgeber: 'de-bund' },
        vorschau: '',
        vorschauPunkt: '',
        erlaeuterung: 'fehlt',
      },
    };
    mocks.importieren.mockResolvedValueOnce([
      {
        gesetz: { kurztitel: 'StGB', normgeber: 'de-bund' },
        erfolg: false,
        fehler: 'Zielgesetz nicht erreichbar',
      },
    ]);
    await klicken('Import aus dem Internet');
    expect(texte()).toContain('Zielgesetz nicht erreichbar');
    mocks.importieren.mockRejectedValueOnce(new Error('Netzwerk'));
    await expect(klicken('Import aus dem Internet')).resolves.toBeUndefined();
    expect(texte()).toContain(speicherFehler);
    expect(texte()).not.toContain('Zielgesetz nicht erreichbar');
  });
  it('zeigt Erfolg der Prüfung und entfernt ihn nach der bestehenden Frist', async () => {
    vi.useFakeTimers();
    try {
      await klicken('Alle Markierungen neu prüfen');
      expect(texte()).toContain('Prüfung durchgeführt ✓');
      expect(texte()).not.toContain('Die Markierungen konnten nicht vollständig geprüft werden.');
      vi.advanceTimersByTime(2500);
      expect(texte()).toContain('Alle Markierungen neu prüfen');
    } finally {
      vi.useRealTimers();
    }
  });
});

it('ermöglicht nach gescheiterter Prüfung einen erfolgreichen erneuten Versuch', async () => {
  vi.useFakeTimers();
  try {
    mocks.pruefen
      .mockRejectedValueOnce(new Error('Speicher voll'))
      .mockResolvedValueOnce(undefined);
    await klicken('Alle Markierungen neu prüfen');
    expect(texte()).toContain('Die Markierungen konnten nicht vollständig geprüft werden.');
    await klicken('Alle Markierungen neu prüfen');
    expect(texte()).toContain('Prüfung durchgeführt ✓');
    expect(texte()).not.toContain('Die Markierungen konnten nicht vollständig geprüft werden.');
    expect(mocks.pruefen).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

it('meldet die Vollprüfung erst nach Erfolg zum ausdrücklichen Neuladen', async () => {
  let abschliessen!: () => void;
  mocks.pruefen.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        abschliessen = resolve;
      }),
  );
  const lauf = klicken('Alle Markierungen neu prüfen');
  expect(mocks.geprueft).not.toHaveBeenCalled();
  abschliessen();
  await lauf;
  expect(mocks.geprueft).toHaveBeenCalledTimes(1);
});

function zielAuswahl(
  schluessel: string,
  typ: 'zielNormFehlt' | 'zielNormUnpassend',
  zielgesetz: Gesetzesreferenz,
): Auswahl {
  return {
    art: 'zeile',
    gesetz: { kurztitel: 'BGB', normgeber: 'de-bund' },
    eintrag: {
      schluessel,
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezeichnungAnzeige: '§ 1',
      markierungstyp: 'verweismarkierung',
      zielKonflikte: [],
    },
    zeile: {
      schluessel: 'ziel',
      verweisziele: [{ bezeichnung: '§ 1' }],
      symbol: 'kreuz',
      zeilenart: typ,
      zielgesetz,
      vorschau: '',
      vorschauPunkt: '',
      erlaeuterung: typ === 'zielNormFehlt' ? 'fehlt' : 'geändert',
    },
  };
}

it('zeigt Fehler beim aktuellen Nachladen einer gespeicherten Konfliktzeile ohne globale Aktionssperre', async () => {
  auswahl = zielAuswahl(
    'gespeicherte-identitaet',
    'zielNormFehlt',
    gesetzesreferenz({ kurztitel: 'StGB' }),
  );
  mocks.ladeLive.mockRejectedValue(new Error('Aktuelle Markierungsdatei unlesbar'));
  rendern();
  await vi.waitFor(() => expect(texte()).toContain('Die Markierung konnte nicht geladen werden.'));
  expect(mocks.ladeLive).toHaveBeenCalledWith(
    { kurztitel: 'BGB', normgeber: 'de-bund' },
    'gespeicherte-identitaet',
    expect.any(Function),
  );
  expect(button('Alle Markierungen neu prüfen').props.disabled).toBe(false);
  auswahl = { art: 'datensatz', gesetz: { kurztitel: 'StGB', normgeber: 'de-bund' } };
  rendern();
  expect(texte()).not.toContain('Die Markierung konnte nicht geladen werden.');
});

it.each([false, true])(
  'übergibt die Zielnorm mit Präfix; technische Fehler werden angezeigt (Fehler: %s)',
  async (fehler) => {
    auswahl = zielAuswahl('live', 'zielNormUnpassend', {
      kurztitel: 'EGBGB',
      normgeber: 'de-bund',
    });
    if (auswahl.art === 'zeile') auswahl.zeile.verweisziele = [{ bezeichnung: 'Art. 229 § 3' }];
    mocks.ladeLive.mockResolvedValue({
      verweisinhalt: {
        verweisziele: [
          {
            gesetz: { kurztitel: 'EGBGB', normgeber: 'de-bund' },
            bezeichnung: 'Art. 229 § 3',
          },
        ],
      },
    });
    rendern();
    await vi.waitFor(() => expect(button('Zielnorm öffnen')).toBeDefined());
    if (fehler) mocks.navigation.mockRejectedValueOnce(new Error('Erzeugung fehlgeschlagen'));
    await klicken('Zielnorm öffnen');
    expect(mocks.navigation).toHaveBeenCalledExactlyOnceWith({
      gesetz: { kurztitel: 'EGBGB', normgeber: 'de-bund' },
      ziel: { type: 'norm', bezeichnung: 'Art. 229 § 3' },
    });
    if (fehler)
      await vi.waitFor(() =>
        expect(texte()).toContain('Das Ziel konnte nicht an das Hauptfenster übergeben werden.'),
      );
  },
);

it.each([false, true])(
  'bestätigt Löschung aller Titelmarkierungen und schreibt nur bei Zustimmung (%s)',
  async (bestaetigt) => {
    auswahl = {
      art: 'nichtamtlicheTitelXmlFehlt',
      gesetz: { kurztitel: 'BGB', normgeber: 'de-bund' },
    };
    mocks.confirm.mockResolvedValue(bestaetigt);
    await klicken('Markierungen nichtamtlicher Titel löschen');
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.stringContaining('Alle Markierungen nichtamtlicher Titel des Gesetzes BGB'),
      expect.objectContaining({ cancelLabel: 'Abbrechen' }),
    );
    expect(mocks.loeschen).toHaveBeenCalledTimes(bestaetigt ? 1 : 0);
  },
);

it.each([false, true])(
  'bietet die allgemeine Verknüpfung allein nach frischer Möglichkeit an (%s)',
  async (moeglich) => {
    auswahl = null;
    angebot = { moeglich, fehler: null };
    rendern();
    await vi.waitFor(() => expect(!!button('Mit aktuellen Normen verknüpfen')).toBe(moeglich));
    expect(mocks.moeglichkeit).not.toHaveBeenCalled();
    if (moeglich)
      expect(button('Mit aktuellen Normen verknüpfen').props.title).toBe(
        'Aktualisiert Verknüpfungen von Verweisen und Kommentaren, die sich auf die gesamte Norm beziehen, sowie Verknüpfungen zu Zielnormen, die in den Gesetzen auf dem Gerät vorhanden sind. Konflikte an spezifischen Textstellen müssen einzeln geprüft werden.',
      );
  },
);

it('zeigt Ladefehler bei der Ermittlung statt eines wirkungslosen Angebots', async () => {
  angebot = {
    moeglich: false,
    fehler: 'Die Verknüpfungsmöglichkeiten konnten nicht vollständig geladen werden (BGB).',
  };
  rendern();
  await vi.waitFor(() =>
    expect(texte().join()).toContain('nicht vollständig geladen werden (BGB)'),
  );
  expect(button('Mit aktuellen Normen verknüpfen')).toBeUndefined();
});

it('verknüpft ohne Auswahl die ganze angezeigte Liste ohne zusätzliche Bestätigung und berichtet gespeicherte Zahlen', async () => {
  auswahl = null;
  angebot = { moeglich: true, fehler: null };
  mocks.moeglichkeit.mockResolvedValue({ moeglich: true, fehler: [] });
  mocks.alleVerknuepfen.mockResolvedValue({
    zahlen: { elementstaende: 2, verweisziele: 3, markierungen: 4 },
    gesetze: [],
    fehler: [],
    unbearbeiteteGesetze: [],
  });
  rendern();
  await vi.waitFor(() => expect(button('Mit aktuellen Normen verknüpfen')).toBeDefined());
  await klicken('Mit aktuellen Normen verknüpfen');
  expect(mocks.alleVerknuepfen).toHaveBeenCalledExactlyOnceWith(gesetze, expect.any(Function));
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(texte()).toContain('2 Elementstände und 3 Zielnormen in 4 Markierungen neu verknüpft.');
  expect(texte()).not.toContain('Verbleibende Konflikte sind in der Liste sichtbar.');
  expect(texte().join()).not.toContain('Keine verbleibenden Konflikte');
});

it('erhält gespeicherte Teilzahlen, nennt unbearbeitete Gesetze und wartet bei Nachfehlern auf keine neue Verifikation', async () => {
  angebot = { moeglich: true, fehler: null };
  mocks.moeglichkeit.mockResolvedValue({ moeglich: true, fehler: [] });
  mocks.alleVerknuepfen.mockResolvedValue({
    zahlen: { elementstaende: 1, verweisziele: 2, markierungen: 1 },
    gesetze: [],
    fehler: [
      { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), fehler: new Error('Prüfabschluss') },
    ],
    unbearbeiteteGesetze: [gesetzesreferenz({ kurztitel: 'StGB' })],
  });
  rendern();
  await vi.waitFor(() => expect(button('Mit aktuellen Normen verknüpfen')).toBeDefined());
  await klicken('Mit aktuellen Normen verknüpfen');
  expect(texte()).toContain('1 Elementstand und 2 Zielnormen in 1 Markierung neu verknüpft.');
  expect(texte().join()).toContain('Noch nicht bearbeitet: StGB.');
  expect(texte().join()).toContain('Bereits gespeicherte Änderungen bleiben erhalten.');
  expect(texte().join()).not.toContain('Keine verbleibenden Konflikte');
  expect(mocks.nachfehler).toHaveBeenCalledTimes(1);
  expect(mocks.pruefen).not.toHaveBeenCalled();
});

it('aktualisiert den Ausgangsstand nur bei frischer Anwendbarkeit und meldet übersprungene Einträge', async () => {
  auswahl = ausgangsAuswahl();
  angebot = { moeglich: true, fehler: null };
  mocks.moeglichkeit.mockResolvedValue({ moeglich: true, fehler: [] });
  mocks.ausgang.mockResolvedValue({
    status: 'unveraendert',
    ergebnis: { elementstaende: 0, verweisziele: 0, markierungen: 0 },
  });
  rendern();
  await vi.waitFor(() => expect(button('Mit aktueller Norm verknüpfen')).toBeDefined());
  await klicken('Mit aktueller Norm verknüpfen');
  expect(mocks.ausgang).toHaveBeenCalledExactlyOnceWith(
    auswahl.gesetz,
    'live',
    expect.any(Function),
  );
  expect(mocks.ziel).not.toHaveBeenCalled();
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(texte().join()).toContain('Keine Verknüpfung geändert');
  expect(texte().join()).not.toContain('neu verknüpft.');
});

it('bietet bei Typ-/Zielwechsel keine früheren Live-Aktionen an, solange das frische Laden aussteht', async () => {
  auswahl = zielAuswahl('live', 'zielNormUnpassend', { kurztitel: 'BGB', normgeber: 'de-bund' });
  mocks.ladeLive
    .mockResolvedValueOnce({
      verweisinhalt: { verweisziele: [{ bezeichnung: '§ 1' }] },
    })
    .mockImplementationOnce(() => new Promise(() => {}));
  rendern();
  await vi.waitFor(() => expect(button('Zielnorm öffnen')).toBeDefined());
  auswahl = zielAuswahl('live', 'zielNormFehlt', { kurztitel: 'StGB', normgeber: 'de-bund' });
  const ersterRender = elemente(rendern());
  expect(
    ersterRender
      .filter((e) => e.type === 'button')
      .flatMap((e) => elemente(e.props.children).map((kind) => kind.props.children)),
  ).not.toContain('Zielnorm öffnen');
  expect(button('Mit aktueller Norm verknüpfen')).toBeUndefined();
  expect(button('Verweis bearbeiten')).toBeUndefined();
});

it('zeigt bei fehlgeschlagener Ausgangsaktion keinen gespeicherten Erfolg und behält den Fehler über Auswahlwechsel', async () => {
  auswahl = ausgangsAuswahl();
  angebot = { moeglich: true, fehler: null };
  mocks.moeglichkeit.mockResolvedValue({ moeglich: true, fehler: [] });
  mocks.ausgang.mockResolvedValue({ status: 'fehlgeschlagen', fehler: new Error('Schreiben') });
  rendern();
  await vi.waitFor(() => expect(button('Mit aktueller Norm verknüpfen')).toBeDefined());
  await klicken('Mit aktueller Norm verknüpfen');
  expect(texte().join()).toContain('Die Änderung konnte nicht gespeichert werden.');
  expect(texte().join()).not.toContain('neu verknüpft.');
  expect(mocks.nachfehler).toHaveBeenCalledTimes(1);
  auswahl = null;
  rendern();
  expect(texte().join()).toContain('Die Änderung konnte nicht gespeichert werden.');
  expect(button('Alle Markierungen neu prüfen').props.disabled).toBe(false);
});

it('entfernt veraltete allgemeine Angebote sofort beim Wechsel zur frischen Liste', async () => {
  angebot = { moeglich: true, fehler: null };
  rendern();
  await vi.waitFor(() => expect(button('Mit aktuellen Normen verknüpfen')).toBeDefined());
  gesetze = [];
  angebot = { moeglich: false, fehler: null };
  const ersterRender = elemente(rendern());
  expect(
    ersterRender
      .filter((e) => e.type === 'button')
      .flatMap((e) => elemente(e.props.children).map((kind) => kind.props.children)),
  ).not.toContain('Mit aktuellen Normen verknüpfen');
});

function ausgangsAuswahl(): Extract<Auswahl, { art: 'zeile' }> {
  const a = zielAuswahl('live', 'zielNormUnpassend', gesetzesreferenz({ kurztitel: 'StGB' }));
  if (a.art !== 'zeile') throw new Error('Testauswahl');
  a.zeile = {
    verweisziele: [],
    symbol: 'fragezeichen',
    schluessel: 'live:eigen',
    zeilenart: 'pauschalerBezugUnpassend',
    vorschau: '',
    vorschauPunkt: '',
    erlaeuterung: 'geändert',
  };
  a.eintrag.eigenerKonflikt = 'pauschalerBezugUnpassend';
  return a;
}

it('sperrt nach gemeldetem Nachfehler alte Angebote und alle Folgeaufrufe bis zur erfolgreichen ausdrücklichen Vollprüfung', async () => {
  auswahl = zielAuswahl('live', 'zielNormUnpassend', { kurztitel: 'BGB', normgeber: 'de-bund' });
  angebot = { moeglich: true, fehler: null };
  mocks.moeglichkeit.mockResolvedValue({ moeglich: true, fehler: [] });
  mocks.ladeLive.mockResolvedValue({ verweisinhalt: { verweisziele: [] } });
  mocks.ziel.mockResolvedValue({
    status: 'geaendert',
    ergebnis: { elementstaende: 0, verweisziele: 1, markierungen: 1 },
    nachgelagerterFehler: new Error('Prüfabschluss'),
  });
  // Diese beiden Rückmeldungen bilden die Zustandsübergänge des Elternfensters ab.
  mocks.nachfehler.mockImplementation(() => {
    aktionsAbschlussOffen = true;
  });
  mocks.geprueft.mockImplementation(() => {
    aktionsAbschlussOffen = false;
    registriereAbschluss = undefined;
  });
  rendern();
  await vi.waitFor(() => expect(button('Mit aktueller Norm verknüpfen')).toBeDefined());
  await klicken('Mit aktueller Norm verknüpfen');
  const moeglichkeitAufrufe = mocks.moeglichkeit.mock.calls.length;
  const detailAufrufe = mocks.ladeLive.mock.calls.length;
  expect(button('Mit aktueller Norm verknüpfen')).toBeUndefined();
  expect(button('Mit aktuellen Normen verknüpfen')).toBeUndefined();
  expect(button('Verknüpfung entfernen')).toBeUndefined();
  expect(button('Markierung löschen').props.disabled).toBe(true);
  expect(button('Alle betroffenen Markierungen löschen').props.disabled).toBe(true);
  expect(button('Fehlende Rechtstexte aus dem Internet importieren').props.disabled).toBe(true);
  expect(button('Alle Markierungen neu prüfen').props.disabled).toBe(false);
  await klicken('Markierung löschen');
  await klicken('Alle betroffenen Markierungen löschen');
  await klicken('Fehlende Rechtstexte aus dem Internet importieren');
  expect(mocks.loeschen).not.toHaveBeenCalled();
  expect(mocks.alleLoeschen).not.toHaveBeenCalled();
  expect(mocks.importieren).not.toHaveBeenCalled();
  expect(mocks.confirm).not.toHaveBeenCalled();
  auswahl = zielAuswahl('andere', 'zielNormUnpassend', gesetzesreferenz({ kurztitel: 'StGB' }));
  rendern();
  auswahl = ausgangsAuswahl();
  rendern();
  expect(button('Mit aktueller Norm verknüpfen')).toBeUndefined();
  expect(mocks.moeglichkeit).toHaveBeenCalledTimes(moeglichkeitAufrufe);
  expect(mocks.ladeLive).toHaveBeenCalledTimes(detailAufrufe);
  expect(mocks.ziel).toHaveBeenCalledTimes(1);
  expect(mocks.ausgang).not.toHaveBeenCalled();
  expect(mocks.alleVerknuepfen).not.toHaveBeenCalled();
  expect(texte().join()).toContain('1 Zielnorm in 1 Markierung neu verknüpft.');
  expect(texte().join()).toContain(
    'anschließende Prüfung oder Synchronisierung ist fehlgeschlagen',
  );
  mocks.pruefen
    .mockRejectedValueOnce(new Error('Noch unbestätigt'))
    .mockResolvedValueOnce(undefined);
  await klicken('Alle Markierungen neu prüfen');
  expect(aktionsAbschlussOffen).toBe(true);
  expect(mocks.geprueft).not.toHaveBeenCalled();
  expect(button('Mit aktueller Norm verknüpfen')).toBeUndefined();
  expect(mocks.moeglichkeit).toHaveBeenCalledTimes(moeglichkeitAufrufe);
  await klicken('Alle Markierungen neu prüfen');
  expect(aktionsAbschlussOffen).toBe(false);
  await vi.waitFor(() => expect(button('Mit aktueller Norm verknüpfen')).toBeDefined());
  expect(button('Mit aktuellen Normen verknüpfen')).toBeDefined();
  expect(mocks.moeglichkeit.mock.calls.length).toBeGreaterThan(moeglichkeitAufrufe);
  expect(button('Markierung löschen').props.disabled).toBe(false);
});

it('ordnet die Rückmeldungshilfe ausschließlich der allgemeinen Verknüpfung zu', async () => {
  angebot = { moeglich: true, fehler: null };
  mocks.alleVerknuepfen.mockResolvedValue({
    zahlen: { elementstaende: 1, verweisziele: 0, markierungen: 1 },
    gesetze: [],
    fehler: [],
    unbearbeiteteGesetze: [],
  });
  await klicken('Mit aktuellen Normen verknüpfen');
  const hilfen = () =>
    elemente(rendern()).filter(
      (e) => e.props['aria-label'] === 'Erklärung zur allgemeinen Verknüpfung',
    );
  expect(hilfen()).toHaveLength(1);
  auswahl = ausgangsAuswahl();
  mocks.moeglichkeit.mockResolvedValue({ moeglich: true, fehler: [] });
  rendern();
  await vi.waitFor(() => expect(button('Mit aktueller Norm verknüpfen')).toBeDefined());
  mocks.ausgang.mockResolvedValue({
    status: 'unveraendert',
    ergebnis: { elementstaende: 0, verweisziele: 0, markierungen: 0 },
  });
  await klicken('Mit aktueller Norm verknüpfen');
  expect(texte().join()).toContain('Keine Verknüpfung geändert');
  expect(hilfen()).toHaveLength(0);
});

it('lädt die Markierung nur bei Auswahlwechsel und Änderung der Abschlusssperre erneut', () => {
  mocks.ladeLive.mockResolvedValue(null);
  auswahl = zielAuswahl('live', 'zielNormFehlt', gesetzesreferenz({ kurztitel: 'StGB' }));
  const ersteRegistrierung = vi.fn();
  registriereAbschluss = ersteRegistrierung;
  rendern();
  expect(mocks.ladeLive).toHaveBeenCalledTimes(1);
  expect(ersteRegistrierung).toHaveBeenCalledTimes(1);
  registriereAbschluss = vi.fn();
  angebot = { moeglich: true, fehler: null };
  rendern();
  expect(mocks.ladeLive).toHaveBeenCalledTimes(1);
  expect(registriereAbschluss).not.toHaveBeenCalled();
  auswahl = { ...auswahl };
  rendern();
  expect(mocks.ladeLive).toHaveBeenCalledTimes(2);
  expect(registriereAbschluss).toHaveBeenCalledTimes(1);
  aktionsAbschlussOffen = true;
  rendern();
  expect(mocks.ladeLive).toHaveBeenCalledTimes(2);
  aktionsAbschlussOffen = false;
  rendern();
  expect(mocks.ladeLive).toHaveBeenCalledTimes(3);
  auswahl = null;
  rendern();
  expect(mocks.ladeLive).toHaveBeenCalledTimes(3);
});
