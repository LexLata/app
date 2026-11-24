// @vitest-environment jsdom
// Unzulässige XML-Zeichen in Kommentartext und Verweistext werden bei der
// Übernahme der Fenstereingabe ersetzt (Plan 2026-11-19, Phase 1). Echte
// Gesetz-, Markierungs- und XML-Module; ersetzt sind nur native Grenzen,
// Importindexangebote und die Historienkommunikation.
import { gesetzDarstellung, gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { speichereKommentar, speichereVerweismarkierung } from './hilfsfenster-aktionen.index';
import { registrierePruefpflichtigeAenderung } from '@/lib/persistenz/kern/kern.index';
import {
  fuehreRueckgaengigAus,
  fuehreWiederholenAus,
  ladeEintraege,
  ladeMarkierungen,
  type MarkierungsAktion,
} from '@/lib/markierungen/eintrag/eintrag.index';
import {
  aktualisiereEinzelneMarkierung,
  baueMarkierungskonflikteXML,
  parseEintraege,
} from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import { identitaetsSchluessel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import type { MarkierungsEintrag } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import type { AktionsMeldung } from '@/lib/domain/app/aktionsMeldung';
import type {
  KommentarKontext,
  VerweismarkierungKontext,
} from './markierungen.hilfsfensterKontext';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { markierungsFensterGesetzLader } from '@/test/markierungen/markierungsFensterGesetzLader';
import { pruefeXmlWohlgeformtheit } from '@/test/plattform/xmlPruefung';

const lader = markierungsFensterGesetzLader();

const nativ = vi.hoisted(() => ({
  bestand: new Map<string, string>(),
  befehl: vi.fn(),
  lesen: vi.fn(),
  banner: vi.fn(),
  historie: vi.fn(),
  vormerken: vi.fn(),
  abschliessen: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: nativ.befehl }));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
}));
vi.mock('@tauri-apps/plugin-fs', async () => {
  const { dateiAttrappen } = await import('@/test/plattform/dateiAttrappen');
  return dateiAttrappen(nativ.bestand, nativ.lesen);
});
vi.mock('@tauri-apps/api/event', () => ({ emitTo: vi.fn(), listen: async () => () => {} }));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: nativ.banner,
}));
vi.mock('./markierungsUebertragung', () => ({
  schliesseGespeicherteMarkierungsAktionAb: nativ.historie,
}));
vi.mock('@/lib/import/import.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  alleImportindexEintraege: async () => [],
  leseEuropaVerzeichnis: async () => [],
}));

const gesetz = gesetzesreferenz({ kurztitel: 'BGB' });
const markierungsdatei = 'markierungen/BGB_de-bund-markierungen.xml';
const ausgangsstelle = normAusgangsstelle('§ 1');
const kanal = { vormerken: nativ.vormerken, abschliessen: nativ.abschliessen };
let meldungen: AktionsMeldung[];
const empfangen = (meldung: AktionsMeldung) => {
  meldungen.push(meldung);
};

/** Unzulässige Zeichen aus P1-A1 mit ihrem Ersatz (XML 1.0, Plan E1). */
const FAELLE: [string, string, string][] = [
  ['U+000B', '\u000B', '\n'],
  ['U+000C', '\u000C', '\n'],
  ['hohes Surrogat', '\uD83D', '\uFFFD'],
  ['niedriges Surrogat', '\uDE00', '\uFFFD'],
  ['U+0000', '\u0000', ' '],
  ['U+0007', '\u0007', ' '],
  ['U+001B', '\u001B', ' '],
  ['U+FFFE', '\uFFFE', ' '],
  ['U+FFFF', '\uFFFF', ' '],
];

const kommentarSpeichern = (text: string, bearbeiten?: KommentarKontext['bearbeiten']) =>
  speichereKommentar(
    { gesetz, openerLabel: 'fenster-1', ausgangsstelle, bearbeiten },
    lader,
    text,
    false,
    undefined,
    empfangen,
  );
const verweisSpeichern = (text: string, bearbeiten?: VerweismarkierungKontext['bearbeiten']) =>
  speichereVerweismarkierung(
    { gesetz, openerLabel: 'fenster-1', ausgangsstelle, bearbeiten },
    lader,
    text,
    false,
    false,
    new Map(),
    undefined,
    undefined,
    empfangen,
  );
function vorhanden<T>(wert: T | undefined): T {
  if (wert === undefined) throw new Error('Wert fehlt');
  return wert;
}
const erster = (eintraege: MarkierungsEintrag[]) => vorhanden(eintraege[0]);
const verweisinhaltVon = (eintrag: MarkierungsEintrag) => vorhanden(eintrag.verweisinhalt);
const letzteHistorienaktion = (): MarkierungsAktion =>
  vorhanden(nativ.historie.mock.calls.at(-1))[0];
const geschriebeneDatei = () => vorhanden(nativ.bestand.get(markierungsdatei));

/** Datei ist streng wohlgeformt und liest sich ohne Befund zurück. */
function dateiEintraege(): MarkierungsEintrag[] {
  const xml = geschriebeneDatei();
  pruefeXmlWohlgeformtheit(xml);
  const { eintraege, befunde } = parseEintraege(xml);
  expect(befunde).toEqual([]);
  return eintraege;
}

/** Konfliktdatei für den Fall „Norm fehlt“, gebaut aus dem gespeicherten Eintrag. */
function konfliktdatei(eintrag: MarkierungsEintrag): string {
  const ohneNorm = gesetzDarstellung({ kurztitel: 'BGB' });
  const block = aktualisiereEinzelneMarkierung(
    undefined,
    gesetz,
    identitaetsSchluessel(eintrag),
    [eintrag],
    ohneNorm,
    [ohneNorm],
    new Set(),
    false,
  );
  const xml = baueMarkierungskonflikteXML({
    gesetzKonflikte: new Map([['BGB', vorhanden(block)]]),
    pruefstatus: 'aktuell',
  });
  pruefeXmlWohlgeformtheit(xml);
  return xml;
}

beforeEach(() => {
  vi.resetAllMocks();
  meldungen = [];
  nativ.bestand.clear();
  nativ.bestand.set(
    'gesetze/BGB_de-bund.xml',
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel><langtitel>BGB</langtitel></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><text><absatz>Text</absatz></text></norm></inhalt></gesetz>',
  );
  registrierePruefpflichtigeAenderung(kanal);
  nativ.vormerken.mockResolvedValue('vorgang');
  nativ.abschliessen.mockResolvedValue(undefined);
  nativ.historie.mockResolvedValue({ art: 'erfolg' });
  nativ.lesen.mockImplementation(async (pfad: string) => {
    const wert = nativ.bestand.get(pfad.replace('/daten/LexLata/', ''));
    if (wert === undefined) throw new Error('Fehlt');
    return wert;
  });
  nativ.befehl.mockImplementation(
    async (name: string, daten: { relativerPfad: string; inhalt: string }) => {
      if (name === 'gesetz_dateistempel_lesen')
        return [...nativ.bestand.keys()]
          .filter((pfad) => pfad.startsWith('gesetze/'))
          .map((pfad) => ({
            name: pfad.slice(8),
            dateistempel: { groesse: '1', aenderungszeit: '1' },
          }));
      if (name === 'datei_sperre_erwerben') return daten.relativerPfad;
      if (name === 'datei_sperre_freigeben') return;
      if (name === 'atomar_datei_schreiben') {
        nativ.bestand.set(daten.relativerPfad, daten.inhalt);
        return;
      }
      throw new Error(name);
    },
  );
});

describe('Kommentartext', () => {
  it.each(FAELLE)('ersetzt %s beim Anlegen und Bearbeiten', async (_name, zeichen, ersatz) => {
    await expect(kommentarSpeichern(`Alt${zeichen}text`)).resolves.toEqual({ art: 'erfolg' });
    const angelegt = erster(await ladeMarkierungen(gesetz));
    expect(angelegt.kommentarText).toBe(`Alt${ersatz}text`);
    expect(erster(dateiEintraege()).kommentarText).toBe(`Alt${ersatz}text`);

    const result = await kommentarSpeichern(`Neu${zeichen}text`, {
      kommentarText: vorhanden(angelegt.kommentarText),
      vorher: {
        kommentarText: vorhanden(angelegt.kommentarText),
        elementstand: angelegt.bezug.elementstand,
      },
    });
    expect(result).toEqual({ art: 'erfolg' });
    expect((await ladeMarkierungen(gesetz)).map((e) => e.kommentarText)).toEqual([
      `Neu${ersatz}text`,
    ]);
    expect(dateiEintraege().map((e) => e.kommentarText)).toEqual([`Neu${ersatz}text`]);
    expect(konfliktdatei(erster(dateiEintraege()))).toContain(`Neu${ersatz}text`);
  });

  it('macht einen so angelegten pauschalen Kommentar rückgängig und wiederholt ihn', async () => {
    await kommentarSpeichern('A\u000BB');
    const aktion = letzteHistorienaktion();
    expect(await fuehreRueckgaengigAus(aktion)).toBe(true);
    expect(await ladeMarkierungen(gesetz)).toEqual([]);
    expect(await fuehreWiederholenAus(aktion)).toBe(true);
    expect((await ladeMarkierungen(gesetz)).map((e) => e.kommentarText)).toEqual(['A\nB']);
    expect(dateiEintraege().map((e) => e.kommentarText)).toEqual(['A\nB']);
  });

  it('liefert bei U+000B am Rand dasselbe Ergebnis wie das Kürzen', async () => {
    await kommentarSpeichern('\u000BRand\u000B');
    expect(erster(await ladeMarkierungen(gesetz)).kommentarText).toBe('Rand');
  });

  it('hält 100 Kommentare lesbar, wenn einer U+000B enthielt', async () => {
    for (let i = 0; i < 99; i++) await kommentarSpeichern(`Kommentar ${i}`);
    await kommentarSpeichern('Zeile 1\u000BZeile 2');
    const geladen = await ladeEintraege(gesetz, empfangen);
    expect(geladen).toHaveLength(100);
    expect(geladen.map((e) => e.kommentarText)).toContain('Zeile 1\nZeile 2');
    expect(meldungen).toEqual([]);
    expect(nativ.banner).not.toHaveBeenCalled();
    expect([...nativ.bestand.keys()].filter((pfad) => pfad.endsWith('.bak'))).toEqual([]);
    expect(nativ.befehl.mock.calls.map(([name]) => name)).not.toContain(
      'archiviere_beschaedigte_datei',
    );
  });
});

describe('Verweistext', () => {
  it.each(FAELLE)('ersetzt %s beim Anlegen und Bearbeiten', async (_name, zeichen, ersatz) => {
    await expect(verweisSpeichern(`vgl.${zeichen}§ 1`)).resolves.toEqual({ art: 'erfolg' });
    const angelegt = erster(await ladeMarkierungen(gesetz));
    expect(verweisinhaltVon(angelegt).verweistext).toBe(`vgl.${ersatz}§ 1`);
    expect(verweisinhaltVon(erster(dateiEintraege())).verweistext).toBe(`vgl.${ersatz}§ 1`);

    const result = await verweisSpeichern(`siehe${zeichen}§ 1`, {
      zitatText: verweisinhaltVon(angelegt).verweistext,
      vorher: {
        elementstand: angelegt.bezug.elementstand,
        verweisinhalt: verweisinhaltVon(angelegt),
      },
    });
    expect(result).toEqual({ art: 'erfolg' });
    const texte = (eintraege: MarkierungsEintrag[]) =>
      eintraege.map((e) => verweisinhaltVon(e).verweistext);
    expect(texte(await ladeMarkierungen(gesetz))).toEqual([`siehe${ersatz}§ 1`]);
    expect(texte(dateiEintraege())).toEqual([`siehe${ersatz}§ 1`]);
    expect(konfliktdatei(erster(dateiEintraege()))).toContain(`siehe${ersatz}§ 1`);
  });

  it('macht eine so angelegte pauschale Verweismarkierung rückgängig und wiederholt sie', async () => {
    await verweisSpeichern('Siehe\u000B§ 1');
    const aktion = letzteHistorienaktion();
    expect(await fuehreRueckgaengigAus(aktion)).toBe(true);
    expect(await ladeMarkierungen(gesetz)).toEqual([]);
    expect(await fuehreWiederholenAus(aktion)).toBe(true);
    const texte = (await ladeMarkierungen(gesetz)).map((e) => verweisinhaltVon(e).verweistext);
    expect(texte).toEqual(['Siehe\n§ 1']);
  });

  it('lässt den Zeichenbereich eines Verweisziels hinter einem Steuerzeichen auf denselben Abschnitt zeigen', async () => {
    // Zwei Zitate; das zweite „§ 1“ steht in „§ 1; § 1“ an den UTF-16-Positionen 5 bis 8.
    await verweisSpeichern('§ 1;\u0007§ 1');
    const inhalt = verweisinhaltVon(erster(await ladeMarkierungen(gesetz)));
    expect(inhalt.verweistext).toBe('§ 1; § 1');
    const bereiche = inhalt.verweisziele.map((ziel) => ziel.verweistextZeichenbereich);
    expect(bereiche[1]).toEqual([5, 8]);
    const ausDatei = verweisinhaltVon(erster(dateiEintraege())).verweisziele;
    expect(ausDatei.map((ziel) => ziel.verweistextZeichenbereich)).toEqual(bereiche);
  });

  it('liefert bei U+000B am Rand dasselbe Ergebnis wie das Kürzen', async () => {
    await verweisSpeichern('\u000B§ 1\u000B');
    expect(verweisinhaltVon(erster(await ladeMarkierungen(gesetz))).verweistext).toBe('§ 1');
  });
});
