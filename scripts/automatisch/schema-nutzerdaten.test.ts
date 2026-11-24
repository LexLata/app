// schema-nutzerdaten.test.ts
// Prüft die echten Nutzerdaten-Schreiber und die Grenzen ihrer RelaxNG-Verträge.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { erzeugeSperreAttrappe } from '@/test/plattform/dateiSperreAttrappe';
import { umschaltenFavorit } from '@/lib/persistenz/nutzerdaten/favoritenSpeicher';
import { umschaltenLesezeichen } from '@/lib/persistenz/nutzerdaten/lesezeichenSpeicher';
import { speichereGesetzeskurzbefehl } from '@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher';
import { pruefeSchema } from './schema-hilfe';

const dateien = new Map<string, string>();
const sperre = erzeugeSperreAttrappe();
vi.mock('@tauri-apps/api/event', () => ({ emitTo: vi.fn(async () => undefined) }));
vi.mock('@/lib/plattform/tauriHelpers', () => ({ holePlattform: async () => 'macos' }));
vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  mitDateiSperre: (...args: Parameters<typeof sperre>) => sperre(...args),
  appDatenOrdnerLesen: async (ordner: string) =>
    [...dateien.keys()]
      .filter((pfad) => pfad.startsWith(`${ordner}/`))
      .map((pfad) => ({ name: pfad.slice(ordner.length + 1), isDirectory: false })),
  appDatenExistiert: async (pfad: string) => dateien.has(pfad),
  appDatenLesen: async (pfad: string) => dateien.get(pfad),
}));
vi.mock('@/lib/persistenz/kern/kern.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/kern/kern.index')>()),
  mitDateiSperre: (...args: Parameters<typeof sperre>) => sperre(...args),
  sicherstelleOrdner: async () => undefined,
  appDatenLesenGeschuetzt: async (pfad: string) => dateien.get(pfad) ?? null,
  appDatenLesenOderNull: async (pfad: string) => dateien.get(pfad) ?? null,
  nutzerdatenSchreiben: async (pfad: string, xml: string) => {
    dateien.set(pfad, xml);
  },
}));
beforeEach(() => dateien.clear());

async function schreiberAusgabe(format: string) {
  const referenz = { kurztitel: 'BGB & Sondertext', normgeber: 'de-bund' };
  if (format === 'favoriten') await umschaltenFavorit(referenz, '§ 433');
  else if (format === 'lesezeichen') await umschaltenLesezeichen(referenz, '§ 433');
  else
    expect(
      await speichereGesetzeskurzbefehl(referenz, {
        taste: 'b',
        meta: true,
        ctrl: true,
        shift: true,
        alt: true,
      }),
    ).toBe('ok');
  expect(dateien.size).toBe(1);
  return [...dateien.values()][0]!;
}

for (const format of ['favoriten', 'lesezeichen', 'gesetzeskurzbefehle']) {
  // Jede Negativprobe startet den externen WASM-Validator; alle Proben bleiben einzeln geprüft.
  describe(`${format}: RelaxNG`, { timeout: 30_000 }, () => {
    it('validiert die Ausgabe des öffentlichen Speichervorgangs', async () => {
      const xml = await schreiberAusgabe(format);
      expect((await pruefeSchema(format, xml)).valid).toBe(true);
      expect((await pruefeSchema(format, xml.replace(' normgeber="de-bund"', ''))).valid).toBe(
        false,
      );
    });
    it('erlaubt unbekannte Metadaten und Attribute, auch mit bekannten Namen darunter', async () => {
      const xml = await schreiberAusgabe(format);
      const erweitert = xml
        .replace('version="1"', 'version="1" neu="ja"')
        .replace(
          '<infos>',
          '<infos neu="ja"><neu><gesetz normgeber="de-bund">Metadatum</gesetz></neu>',
        )
        .replace('<inhalt>', '<inhalt><neu><eintrag/><gesetzeskurzbefehl/></neu>')
        .replace('normgeber="de-bund"', 'normgeber="de-bund" neu="ja"');
      expect((await pruefeSchema(format, erweitert)).valid).toBe(true);
    });
    it('weist fehlende Pflichtangaben, ungültige Werte und doppelte Einzelangaben zurück', async () => {
      const xml = await schreiberAusgabe(format);
      const element = format === 'gesetzeskurzbefehle' ? 'taste' : 'bezeichnung';
      const angabe = xml.match(new RegExp(`<${element}[^>]*>[^<]*</${element}>`))![0];
      const gesetz = xml.match(/<gesetz[^>]*>[^<]*<\/gesetz>/)![0];
      const fehler = [
        xml.replace(' version="1"', ''),
        xml.replace('version="1"', 'version="2"'),
        xml.replace(angabe, ''),
        xml.replace(angabe, `<neu>${angabe}</neu>`),
        xml.replace(angabe, angabe + angabe),
        xml.replace(gesetz, ''),
        xml.replace(gesetz, `<neu>${gesetz}</neu>`),
        xml.replace(gesetz, gesetz + gesetz),
        xml.replace(/<infos>[\s\S]*?<\/infos>/, ''),
        xml.replace(/<inhalt>[\s\S]*?<\/inhalt>/, ''),
        xml.replace('<infos>', '<infos/><infos>'),
        xml.replace('<verarbeitungszeit>', '<verarbeitungszeit>ungültig'),
        xml.replace(
          '</verarbeitungszeit>',
          '</verarbeitungszeit><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit>',
        ),
        // Gezielte Negativfälle: alte Normgeberwerte und ungültige Codes.
        ...[
          'Bund' /* normgeber-negativ: Konkreter alter Wert zur Ablehnungsprüfung. */,
          'BW' /* normgeber-negativ: Konkreter alter Wert zur Ablehnungsprüfung. */,
          'Österreich',
          '',
          'A_B',
          'A B',
          'aaaaaaaaaaaaaaaaaaaaa',
          '²',
          '😀',
        ].map((wert) => xml.replace('normgeber="de-bund"', `normgeber="${wert}"`)),
        xml.replace(gesetz, '<gesetz/>'),
        xml.replace(angabe, `<${element}> </${element}>`),
      ];
      if (format !== 'gesetzeskurzbefehle')
        fehler.push(xml.replace('<bezeichnung>', '<bezeichnung praefix="§">'));
      if (format === 'gesetzeskurzbefehle') {
        for (const modifier of ['primaer', 'sekundaer', 'shift', 'alt'])
          for (const wert of ['false', 'TRUE', '1', ''])
            fehler.push(xml.replace(`${modifier}="true"`, `${modifier}="${wert}"`));
      }
      for (const dokument of fehler)
        expect((await pruefeSchema(format, dokument)).valid, dokument).toBe(false);
    });
    it('erlaubt offene Normgeber mit Kleinbuchstaben, Ziffern und Bindestrichen', async () => {
      const xml = await schreiberAusgabe(format);
      for (const normgeber of [
        'unbekannt',
        'at-bund',
        'sachsen',
        'de-by',
        '123',
        'aaaaaaaaaaaaaaaaaaaa',
        'de-by',
      ])
        expect(
          (
            await pruefeSchema(
              format,
              xml.replace('normgeber="de-bund"', `normgeber="${normgeber}"`),
            )
          ).valid,
        ).toBe(true);
    });
  });
}
