// importindexErstellungSteuerung.test.ts
//
// Testet ProzessBanner (Abbrechen-Aktion, pruefeAbbruch, abschliessen,
// wiederEinblenden) sowie die kategorienweise Sperre (versucheZuStarten/
// istKategorieAktiv/beenden) gegen den ECHTEN bannerStore (kein Mock) - er
// ist ein simpler In-Memory-Store ohne I/O; ein Mock würde nur seine Logik
// nachbilden statt das Zusammenspiel echt zu prüfen. Der Store selbst hat
// eine eigene Testdatei: bannerStore.test.ts. Reset über
// alleBannerSchliessen() in beforeEach; laufendeProzesse (Modul-Map in
// importindexErstellungSteuerung.ts) hat keinen Reset-Hook. Die beiden festen
// Indexkategorien werden deshalb nach jedem Test wieder freigegeben.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ProzessBanner,
  mitImportindexVorgang,
  versucheZuStarten,
  istKategorieAktiv,
  istImportindexAktiv,
  beenden,
} from './importindexErstellungSteuerung';
import { getSnapshot, alleBannerSchliessen } from '@/lib/banner/banner.index';

beforeEach(() => {
  alleBannerSchliessen();
  beenden('de-bund');
  beenden('de-bw');
});

// ---------------------------------------------------------------------------
// ProzessBanner
// ---------------------------------------------------------------------------

describe('ProzessBanner.erzeugen', () => {
  it('zeigt sofort ein Banner mit dem übergebenen Text und einer Abbrechen-Aktion', () => {
    const banner = ProzessBanner.erzeugen('Starte …');
    const eintrag = getSnapshot().find((b) => b.id === banner.bannerId);
    expect(eintrag?.text).toBe('Starte …');
    expect(eintrag?.aktion?.label).toBe('Abbrechen');
  });
});

describe('ProzessBanner.fortschritt', () => {
  it('aktualisiert Text und Typ des bestehenden Banners, Abbrechen-Aktion bleibt sichtbar', () => {
    const banner = ProzessBanner.erzeugen('Start');
    banner.fortschritt('50%', 'warnung');
    const eintrag = getSnapshot().find((b) => b.id === banner.bannerId);
    expect(eintrag).toMatchObject({ text: '50%', typ: 'warnung' });
    expect(eintrag?.aktion?.label).toBe('Abbrechen');
  });

  it('erzeugt das Banner unter neuer id neu, wenn der Nutzer es zwischenzeitlich weggeklickt hat (Vorgang läuft weiter)', () => {
    const banner = ProzessBanner.erzeugen('Start');
    const alteId = banner.bannerId;
    alleBannerSchliessen(); // Nutzer klickt Banner weg
    banner.fortschritt('Läuft weiter …');
    expect(banner.bannerId).not.toBe(alteId);
    expect(getSnapshot().some((b) => b.id === banner.bannerId)).toBe(true);
  });
});

describe('ProzessBanner.abschliessen', () => {
  it('MUTATIONSTEST: entfernt die Abbrechen-Aktion (nichts mehr abzubrechen)', () => {
    const banner = ProzessBanner.erzeugen('Start');
    banner.abschliessen('Fertig', 'info');
    const eintrag = getSnapshot().find((b) => b.id === banner.bannerId);
    expect(eintrag?.text).toBe('Fertig');
    expect(eintrag?.aktion).toBeUndefined();
  });
});

describe('ProzessBanner.wiederEinblenden', () => {
  it('zeigt das Banner mit dem zuletzt gesetzten Text/Typ erneut, wenn es weggeklickt wurde', () => {
    const banner = ProzessBanner.erzeugen('Start');
    banner.fortschritt('Zwischenstand');
    alleBannerSchliessen();
    banner.wiederEinblenden();
    const eintrag = getSnapshot().find((b) => b.id === banner.bannerId);
    expect(eintrag?.text).toBe('Zwischenstand');
    expect(eintrag?.aktion?.label).toBe('Abbrechen');
  });
});

describe('ProzessBanner Abbrechen-Klick + pruefeAbbruch', () => {
  it('pruefeAbbruch gibt false zurück, solange nicht auf Abbrechen geklickt wurde', () => {
    const banner = ProzessBanner.erzeugen('Start');
    expect(banner.pruefeAbbruch()).toBe(false);
  });

  it('MUTATIONSTEST: Klick auf Abbrechen setzt Text auf "Wird abgebrochen …", pruefeAbbruch gibt danach true zurück und entfernt das Banner', () => {
    const banner = ProzessBanner.erzeugen('Start');
    const aktion = getSnapshot().find((b) => b.id === banner.bannerId)!.aktion!;
    aktion.onClick();

    expect(getSnapshot().find((b) => b.id === banner.bannerId)?.text).toBe('Wird abgebrochen …');
    expect(banner.pruefeAbbruch()).toBe(true);
    expect(getSnapshot().some((b) => b.id === banner.bannerId)).toBe(false);
  });

  it('pruefeAbbruch bleibt bei wiederholtem Aufruf true, nachdem einmal abgebrochen wurde', () => {
    const banner = ProzessBanner.erzeugen('Start');
    const aktion = getSnapshot().find((b) => b.id === banner.bannerId)!.aktion!;
    aktion.onClick();
    expect(banner.pruefeAbbruch()).toBe(true);
    expect(banner.pruefeAbbruch()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// versucheZuStarten / istKategorieAktiv / beenden
// ---------------------------------------------------------------------------

describe('versucheZuStarten', () => {
  it('gibt beim ersten Aufruf einer Kategorie ein neues ProzessBanner zurück', () => {
    const kategorie = 'de-bund';
    const banner = versucheZuStarten(kategorie, 'Starte …');
    expect(banner).toBeInstanceOf(ProzessBanner);
    beenden(kategorie);
  });

  it('MUTATIONSTEST: ein zweiter Aufruf derselben Kategorie mit sichtbarem Banner gibt null zurück (zweiter Befehl wird ignoriert)', () => {
    const kategorie = 'de-bund';
    versucheZuStarten(kategorie, 'Erster Lauf');
    const zweiter = versucheZuStarten(kategorie, 'Zweiter Lauf');
    expect(zweiter).toBeNull();
    beenden(kategorie);
  });

  it('unterschiedliche Kategorien dürfen parallel laufen', () => {
    const kat1 = 'de-bund';
    const kat2 = 'de-bw';
    const banner1 = versucheZuStarten(kat1, 'Bundesrecht');
    const banner2 = versucheZuStarten(kat2, 'Landesrecht BW');
    expect(banner1).not.toBeNull();
    expect(banner2).not.toBeNull();
    beenden(kat1);
    beenden(kat2);
  });

  it('MUTATIONSTEST: läuft ein Vorgang laut Merkliste, ist sein Banner aber weggeklickt (nicht sichtbar) -> Hinweismeldung + Banner wird wieder eingeblendet, Sperre bleibt bestehen (kein neues ProzessBanner)', () => {
    const kategorie = 'de-bund';
    const erster = versucheZuStarten(kategorie, 'Läuft …');
    expect(erster).not.toBeNull();
    const ersteBannerId = erster!.bannerId;
    alleBannerSchliessen(); // Nutzer klickt weg, Vorgang läuft im Hintergrund weiter

    const zweiter = versucheZuStarten(kategorie, 'Neuer Versuch');

    expect(zweiter).toBeNull();
    // Hinweismeldung + wieder eingeblendetes Original-Banner (neue id, da
    // wiederEinblenden bei fehlendem Banner neu erzeugt) sind jetzt sichtbar.
    const sichtbar = getSnapshot();
    expect(sichtbar.some((b) => b.text === 'Dieser Vorgang läuft bereits im Hintergrund.')).toBe(
      true,
    );
    expect(sichtbar.some((b) => b.text === 'Läuft …')).toBe(true);
    expect(sichtbar.some((b) => b.id === ersteBannerId)).toBe(false); // alte id weg, neu erzeugt
    beenden(kategorie);
  });

  it('nach beenden() kann dieselbe Kategorie erneut gestartet werden', () => {
    const kategorie = 'de-bund';
    versucheZuStarten(kategorie, 'Erster Lauf');
    beenden(kategorie);
    const zweiter = versucheZuStarten(kategorie, 'Zweiter Lauf');
    expect(zweiter).not.toBeNull();
    beenden(kategorie);
  });
});

describe('istKategorieAktiv', () => {
  it('gibt false zurück, solange kein Vorgang für die Kategorie läuft', () => {
    expect(istKategorieAktiv('de-bund')).toBe(false);
  });

  it('gibt true zurück, während ein Vorgang läuft', () => {
    const kategorie = 'de-bund';
    versucheZuStarten(kategorie, 'Läuft');
    expect(istKategorieAktiv(kategorie)).toBe(true);
    beenden(kategorie);
  });

  it('MUTATIONSTEST: bleibt true, auch wenn das Banner weggeklickt wurde (Vorgang läuft im Hintergrund weiter)', () => {
    const kategorie = 'de-bund';
    versucheZuStarten(kategorie, 'Läuft');
    alleBannerSchliessen();
    expect(istKategorieAktiv(kategorie)).toBe(true);
    beenden(kategorie);
  });

  it('gibt false zurück, nachdem beenden() aufgerufen wurde', () => {
    const kategorie = 'de-bund';
    versucheZuStarten(kategorie, 'Läuft');
    beenden(kategorie);
    expect(istKategorieAktiv(kategorie)).toBe(false);
  });
});

describe('istImportindexAktiv', () => {
  it('meldet den Status beim Öffnen synchron und gibt nur die beendete Kategorie frei', () => {
    versucheZuStarten('de-bund', 'Bundesrecht');
    versucheZuStarten('de-bw', 'Landesrecht BW');

    expect(istImportindexAktiv('de-bund')).toBe(true);
    expect(istImportindexAktiv('de-bw')).toBe(true);

    beenden('de-bund');

    expect(istImportindexAktiv('de-bund')).toBe(false);
    expect(istImportindexAktiv('de-bw')).toBe(true);
    beenden('de-bw');
  });
});

describe('beenden', () => {
  it('hat keine Wirkung, wenn die Kategorie nicht (mehr) aktiv ist', () => {
    expect(() => beenden('de-bund')).not.toThrow();
  });
});

describe('vollständiger Indexvorgang', () => {
  it('schließt unerwartete Fehler ab und gibt die Kategorie frei', async () => {
    const ergebnis = await mitImportindexVorgang('de-bw', 'Start', async () => {
      throw new Error('Lesefehler');
    });
    expect(ergebnis).toEqual({ erfolg: false, fehler: 'Lesefehler' });
    expect(istImportindexAktiv('de-bw')).toBe(false);
    expect(getSnapshot()[0]?.aktion).toBeUndefined();
    expect(getSnapshot()[0]?.typ).toBe('fehler');
  });

  it('stellt beim Speichern auch nach Wiederanzeige keine Abbrechen-Aktion her', () => {
    const banner = ProzessBanner.erzeugen('Start');
    banner.beginneSpeichern('Speichern');
    alleBannerSchliessen();
    banner.wiederEinblenden();
    expect(getSnapshot()[0]?.aktion).toBeUndefined();
    banner.fortschritt('Schreiben');
    expect(getSnapshot()[0]?.aktion).toBeUndefined();
  });
});

it('klammert gleiche Kategorien und erlaubt unabhängige Kategorien parallel', async () => {
  let freigeben!: () => void;
  const warten = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  const erster = mitImportindexVorgang('de-bund', 'de-bund', async (banner) => {
    await warten;
    banner.abschliessen('Fertig');
    return { erfolg: true, anzahl: 1 };
  });
  const zweiter = await mitImportindexVorgang('de-bund', 'Bund erneut', async () => {
    throw new Error('Darf nicht starten');
  });
  expect(zweiter.erfolg).toBe(false);
  expect(istImportindexAktiv('de-bund')).toBe(true);
  const anderer = await mitImportindexVorgang('de-bw', 'de-bw', async (banner) => {
    banner.abschliessen('Fertig');
    return { erfolg: true, anzahl: 1 };
  });
  expect(anderer.erfolg).toBe(true);
  freigeben();
  await erster;
  expect(istImportindexAktiv('de-bund')).toBe(false);
});
