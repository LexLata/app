// @vitest-environment jsdom
// Echte Verzeichnispflege und Suchtext reagieren gemeinsam auf native Speicherabschlüsse.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act } from 'react';
import { initialisiereMarkierungen } from '@/lib/markierungen/markierungen.index';
import { assert, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { sendeGlobal } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
import { useSuchverzeichnis } from '@/hooks/useSuchverzeichnis';
import { erzeugeGeladeneGesetze } from '@/lib/gesetz-laden/gesetz-laden.index';
import { leiteSuchverzeichniseintragAb } from '@/lib/domain/app/oeffnen/oeffnen.index';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import {
  speichereGesetz,
  loescheGesetz,
  warteAufSpeicherBatchAbschluss,
} from '@/lib/persistenz/gesetz/gesetz.index';
import { useVolltextSuchtext, type VolltextSuchstand } from './useVolltextSuchtext';
const dom = domTestWurzel();
const a = { kurztitel: 'A', normgeber: 'de-bund' };
const xml = (titel: string, text: string, zeit = '2026-01-01T00:00:00Z') =>
  `<gesetz><infos><kurztitel>${titel}</kurztitel><normgeber>de-bund</normgeber><verarbeitungszeit>${zeit}</verarbeitungszeit></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><titel>Amtlich</titel><text><absatz>${text}</absatz></text></norm></inhalt></gesetz>`;
it('erneuert nur A bei Inhalts- und Prüfzeitpflege und entfernt gelöschte Treffer', async () => {
  nativeAttrappeZuruecksetzen();
  initialisiereMarkierungen();
  let stempel = 1;
  const nativ = io.invoke.getMockImplementation();
  io.invoke.mockImplementation(async (name, args) => {
    if (name === 'gesetz_dateistempel_lesen')
      return [...io.dateien]
        .filter(([pfad]) => pfad.startsWith('gesetze/'))
        .map(([pfad, inhalt]) => ({
          name: pfad.slice(8),
          dateistempel: {
            groesse: String(inhalt.length),
            aenderungszeit: pfad.includes('A_de-bund') ? String(stempel) : '1',
          },
        }));
    if (name === 'pruefvorgang_registrieren') return 'quelle';
    if (name.startsWith('pruefvorgang_'))
      return { offeneQuellen: 0, offenePruefungen: 0, vollbedarf: false };
    return nativ?.(name, args);
  });
  const eintraege = ['A', 'B'].map((titel) => {
    const inhalt = xml(titel, titel === 'A' ? 'Ausgangsfassung' : 'Unbeteiligt');
    io.dateien.set(`gesetze/${titel}_de-bund.xml`, inhalt);
    const gesetz = parseGesetzesXML(inhalt);
    assert(gesetz);
    return leiteSuchverzeichniseintragAb(gesetz, {
      groesse: String(inhalt.length),
      aenderungszeit: '1',
    });
  });
  io.dateien.set(
    'cache/suchverzeichnis.json',
    JSON.stringify({ version: 1, abgeglichen: true, eintraege }),
  );
  let anhalten = false;
  let freigeben = () => {};
  const warten = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  const senden = io.emitTo.getMockImplementation();
  io.emitTo.mockImplementation(async (...argumente: unknown[]) => {
    if (
      argumente[1] === 'gesetze-geaendert' &&
      Array.isArray(argumente[2]) &&
      argumente[2].length > 0
    )
      anhalten = true;
    await senden?.(...argumente);
  });
  const gelesen: string[] = [];
  io.vorLesen = (pfad) => {
    if (anhalten && pfad.endsWith('cache/suchverzeichnis.json')) return warten;
    if (pfad.includes('/gesetze/')) gelesen.push(pfad);
    return undefined;
  };
  const bestand = erzeugeGeladeneGesetze();
  const gezieltGeladen: string[] = [];
  bestand.abonnieren((aenderung) => {
    if (aenderung?.geladen) gezieltGeladen.push(aenderung.geladen.kurztitel);
  });
  let stand: VolltextSuchstand | undefined;
  let zeit: Date | undefined;
  function Fenster() {
    const verzeichnis = useSuchverzeichnis();
    const eintrag = verzeichnis.eintraege.find((e) => e.kurztitel === 'A');
    zeit = eintrag?.status === 'in-ordnung' ? eintrag.verarbeitungszeit : undefined;
    stand = useVolltextSuchtext(
      verzeichnis.eintraege,
      verzeichnis.wirdVorbereitet,
      bestand.ladeGesetz,
      true,
      verzeichnis.wirdAktualisiert,
    );
    return null;
  }
  const warte = async (pruefen: () => void) =>
    vi.waitFor(async () => {
      await act(async () => {});
      pruefen();
    });
  try {
    await act(async () => dom.root.render(<Fenster />));
    await warte(() => expect(stand?.vollstaendig).toBe(true));
    expect(gelesen).toHaveLength(2);
    gelesen.length = 0;
    const vorher = stand?.eintraege.find((e) => e.gesetz.kurztitel === 'A');
    stempel++;
    await act(async () => {
      await speichereGesetz(a, xml('A', 'Ausgangsfassung', '2026-02-03T00:00:00Z'), {
        inhaltGeaendert: false,
      });
      await warteAufSpeicherBatchAbschluss();
    });
    await warte(() => {
      expect(zeit?.toISOString()).toBe('2026-02-03T00:00:00.000Z');
      expect(stand?.vollstaendig).toBe(true);
    });
    expect(gelesen).toEqual(['/daten/LexLata/gesetze/A_de-bund.xml']);
    expect(stand?.eintraege.find((e) => e.gesetz.kurztitel === 'A')).toEqual(vorher);
    gezieltGeladen.length = 0;
    stempel++;
    await act(async () => {
      await speichereGesetz(a, xml('A', 'Geänderte Fassung mit zusätzlichem Text'));
      await warteAufSpeicherBatchAbschluss();
    });
    expect(stand?.vollstaendig).toBe(false);
    expect(stand?.eintraege.some((e) => e.gesetz.kurztitel === 'A')).toBe(false);
    expect(gezieltGeladen).toEqual([]);
    freigeben();
    await warte(() => {
      expect(stand?.vollstaendig).toBe(true);
      expect(stand?.eintraege.some((e) => e.volltext.includes('Geänderte Fassung'))).toBe(true);
    });
    // Die strenge Markierungsprüfung liest unabhängig weitere Gesetze.
    // Ausschließlich der gezielte Fensterbestand ist Quelle der Suchtexte.
    expect(gezieltGeladen).toEqual(['A']);
    gezieltGeladen.length = 0;
    gelesen.length = 0;
    // Ein frischer Eintrag kann auch ohne beobachtetes Inhaltsereignis eintreffen.
    // Der Dateistempel muss dafür weiterhin ausreichen, auch bei gleicher Normliste.
    stempel++;
    const ausserhalb = xml('A', 'Außerhalb aktualisierter Rechtstext');
    io.dateien.set('gesetze/A_de-bund.xml', ausserhalb);
    const neuesGesetz = parseGesetzesXML(ausserhalb);
    assert(neuesGesetz);
    io.dateien.set(
      'cache/suchverzeichnis.json',
      JSON.stringify({
        version: 1,
        abgeglichen: true,
        eintraege: [
          leiteSuchverzeichniseintragAb(neuesGesetz, {
            groesse: String(ausserhalb.length),
            aenderungszeit: String(stempel),
          }),
          ...eintraege.filter((e) => e.kurztitel === 'B'),
        ],
      }),
    );
    await act(async () => {
      await sendeGlobal('gesetze-geaendert', []);
    });
    await warte(() => {
      expect(stand?.vollstaendig).toBe(true);
      expect(stand?.eintraege.some((e) => e.volltext.includes('Außerhalb aktualisierter'))).toBe(
        true,
      );
    });
    expect(gezieltGeladen).toEqual(['A']);
    expect(gelesen).toEqual(['/daten/LexLata/gesetze/A_de-bund.xml']);
    gelesen.length = 0;
    gezieltGeladen.length = 0;
    await act(async () => {
      await loescheGesetz(a);
      await warteAufSpeicherBatchAbschluss();
    });
    await warte(() => {
      expect(stand?.vollstaendig).toBe(true);
      expect(stand?.gesamt).toBe(1);
    });
    expect(stand?.eintraege.map((e) => e.gesetz.kurztitel)).toEqual(['B']);
    expect(gezieltGeladen).toEqual([]);
    let erstesLesenFreigeben = () => {};
    let zweitesLesenFreigeben = () => {};
    const erstesLesen = new Promise<void>((resolve) => {
      erstesLesenFreigeben = resolve;
    });
    const zweitesLesen = new Promise<void>((resolve) => {
      zweitesLesenFreigeben = resolve;
    });
    let cacheZugriffe = 0;
    io.vorLesen = (pfad) =>
      pfad.endsWith('cache/suchverzeichnis.json')
        ? ++cacheZugriffe === 1
          ? erstesLesen
          : zweitesLesen
        : undefined;
    await act(async () => {
      await sendeGlobal('gesetze-geaendert', []);
    });
    expect(stand?.vollstaendig).toBe(false);
    await act(async () => {
      await sendeGlobal('gesetze-geaendert', []);
    });
    expect(cacheZugriffe).toBe(2);
    await act(async () => {
      erstesLesenFreigeben();
    });
    // Ein überholter Leseabschluss beendet nicht das noch laufende frische Lesen.
    expect(stand?.vollstaendig).toBe(false);
    await act(async () => {
      zweitesLesenFreigeben();
    });
    await warte(() => expect(stand?.vollstaendig).toBe(true));
    expect(gezieltGeladen).toEqual([]);
    io.vorLesen = (pfad) => {
      if (pfad.endsWith('cache/suchverzeichnis.json')) throw new Error('Lesefehler');
      return undefined;
    };
    await act(async () => {
      await sendeGlobal('gesetze-geaendert', []);
    });
    await warte(() => expect(stand?.vollstaendig).toBe(false));
    expect(io.dateien.has('gesetze/B_de-bund.xml')).toBe(true);
  } finally {
    freigeben();
    await act(async () => dom.root.render(null));
    bestand.beenden();
  }
});
