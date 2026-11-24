// praefixAuswertung.ts
// Offline-Auswertung vorhandener GesetzesXML mit bestätigten Schreibpaketen.
import { NORMGEBER_DE_BUND, NORMGEBER_DE_BW } from '@/lib/domain/normgeber';
import {
  meldeLaufErgebnis,
  meldeLaufFortschritt,
} from '@/lib/import/quelldateien/quelldateien.index';
import type { LaufAusgabe, LaufFortschritt } from '@/lib/import/quelldateien/quelldateien.index';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { ermittlePraefixstruktur } from '@/lib/domain/praefixstruktur';
import type { ImportindexSucheEintrag } from '@/lib/import/importindex/importindex.index';
import type { LaufBericht } from '@/lib/import/quelldateien/quelldateien.index';
import type { PraefixlaufAuftrag } from '@/lib/plattform/praefixlaufAuftrag';
import { erzeugePraefixlistenSchreiber } from './praefixlistenSchreiber';
import type { PraefixstrukturEintrag } from './praefixstrukturXml';

export interface PraefixAuswertungUmgebung extends LaufAusgabe {
  leseListe(): Promise<string | null>;
  schreibeListe(xml: string): Promise<void>;
  leseDateistand(): Promise<{ gesetzesxml: string[] }>;
  ladeKandidaten(
    normgeber: typeof NORMGEBER_DE_BUND | typeof NORMGEBER_DE_BW,
  ): Promise<ImportindexSucheEintrag[]>;
  leseGesetzesXML(kurztitel: string): Promise<string>;
  ausgabe(zeile: string): void | Promise<void>;
}

export async function fuehrePraefixAuswertungAus(
  auftrag: Extract<PraefixlaufAuftrag, { modus: 'auswerten' }>,
  umgebung: PraefixAuswertungUmgebung,
  meldeBericht?: (bericht: LaufBericht) => void,
): Promise<LaufBericht> {
  const schreiber = erzeugePraefixlistenSchreiber(
    auftrag.normgeber,
    await umgebung.leseListe(),
    (xml) => umgebung.schreibeListe(xml),
  );
  const bericht: LaufBericht = {
    gespeichert: 0,
    teilerfolge: [],
    fehlgeschlagen: [],
    zusatzzeilen: [],
  };
  const werte = new Map<string, number>();
  const paket: PraefixstrukturEintrag[] = [];
  const stand: LaufFortschritt = {
    erfolgreich: 0,
    teilerfolge: 0,
    fehlgeschlagen: 0,
    uebersprungen: 0,
    aktiv: 0,
  };
  const melden = () => fortschritt({ ...stand });
  const fortschritt = meldeLaufFortschritt(umgebung);
  async function speichern() {
    if (!paket.length) return;
    try {
      await schreiber.speichern(paket);
    } catch (fehler) {
      stand.fehlgeschlagen += paket.length;
      stand.aktiv = 0;
      melden();
      throw fehler;
    }
    for (const e of paket) {
      const wert = e.ermittlungsstatus ?? e.praefixstruktur;
      werte.set(wert, (werte.get(wert) ?? 0) + 1);
      await meldeLaufErgebnis(umgebung, `${e.kurztitel}: ${wert}`);
    }
    bericht.gespeichert += paket.length;
    stand.erfolgreich += paket.length;
    paket.length = 0;
    stand.aktiv = 0;
    melden();
  }
  try {
    const index = await umgebung.ladeKandidaten(auftrag.normgeber);
    const dateistand = await umgebung.leseDateistand();
    melden();
    const benannt = auftrag.kurztitel?.map((k) => k.toLowerCase());
    for (const kurztitel of dateistand.gesetzesxml) {
      const k = kurztitel.toLowerCase();
      if (benannt && !benannt.includes(k)) continue;
      stand.aktiv = 1;
      melden();
      let ergebnis;
      try {
        ergebnis = await werteGesetzAus(kurztitel, index, auftrag.normgeber, umgebung);
      } catch (fehler) {
        stand.fehlgeschlagen++;
        stand.aktiv = 0;
        melden();
        throw fehler;
      }
      const meldung = ergebnis.meldung;
      if (ergebnis.eintrag) {
        paket.push(ergebnis.eintrag);
        if (paket.length === 200) await speichern();
      }
      if (meldung) {
        bericht.fehlgeschlagen.push({ kurztitel, meldung });
        await meldeLaufErgebnis(umgebung, `${kurztitel}: ausgelassen – ${meldung}`);
        stand.fehlgeschlagen++;
      }
      stand.aktiv = 0;
      melden();
    }
    await speichern();
    return bericht;
  } finally {
    bericht.zusatzzeilen = [...werte].map(([wert, zahl]) => `${wert}: ${zahl}`);
    bericht.zusatzzeilen.push(`Ausgelassen: ${bericht.fehlgeschlagen.length}`);
    meldeBericht?.(bericht);
    for (const zeile of bericht.zusatzzeilen) await umgebung.ausgabe(zeile);
  }
}

async function werteGesetzAus(
  kurztitel: string,
  index: ImportindexSucheEintrag[],
  normgeber: typeof NORMGEBER_DE_BUND | typeof NORMGEBER_DE_BW,
  umgebung: PraefixAuswertungUmgebung,
): Promise<{ meldung?: string; eintrag?: PraefixstrukturEintrag }> {
  const k = kurztitel.toLowerCase();
  const treffer = index.filter((e) => e.kurztitel.toLowerCase() === k);
  const [eintrag] = treffer;
  if (!eintrag) return { meldung: 'Kein Importindexeintrag' };
  if (treffer.length > 1) return { meldung: 'Kurztitel nicht eindeutig' };
  // Dateifehler verlassen den Lauf; ausschließlich Inhaltsfehler werden ausgelassen.
  const xml = await umgebung.leseGesetzesXML(kurztitel);
  let gesetz;
  try {
    gesetz = parseGesetzesXML(xml);
  } catch {
    gesetz = null;
  }
  if (!gesetz || gesetz.kurztitel.toLowerCase() !== k || gesetz.normgeber !== normgeber)
    return { meldung: 'Ungültiger XML-Inhalt oder abweichende Gesetzesreferenz' };
  return { eintrag: { kurztitel: eintrag.kurztitel, ...ermittlePraefixstruktur(gesetz) } };
}
