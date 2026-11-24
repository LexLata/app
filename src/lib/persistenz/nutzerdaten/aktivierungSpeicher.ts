// aktivierungSpeicher.ts
//
// Merkt sich pro Gesetz (Normgeber und Kurztitel), welches Element (Überschrift,
// Artikel oder Norm) dort zuletzt angeklickt/aktiviert war – und zwar
// GESETZ-bezogen, nicht tab-bezogen. Bleibt über App-Neustarts hinweg erhalten.
//
// Normen speichern ihre Bezeichnung (z.B. „§ 433", „229 3") und werden über
// verweisZuXmlId aufgelöst. Überschriften speichern ihre Gliederungskennzahl.
// Schlüssel sind kanonische Gesetzesreferenzschlüssel. Alte Dateibasis-Schlüssel
// und Stringeinträge werden nicht übernommen.
//
import {
  gesetzesreferenzSchluessel,
  istGesetzesreferenzSchluessel,
} from '@/lib/domain/gesetzesreferenz';
import type {
  GesetzDarstellung,
  DarstellungsElement,
  Gesetzesreferenz,
} from '@/lib/domain/gesetzTypes';
import { verweisZuXmlId, bezeichnungFuerAktivierung } from '@/lib/domain/norm/norm.index';
import {
  ladeJSON,
  speichereJSON,
  istRecord,
  ohneObjectPrototype,
} from '@/lib/persistenz/kern/kern.index';

// ---------------------------------------------------------------------------
// Basis-Speicher (localStorage)
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'lexlata.aktivierung';

type AktivierungsEintrag =
  { typ: 'norm'; bezeichnung: string } | { typ: 'ueberschrift'; gliederungskennzahl: string };

type AktivierungsMap = Record<string, AktivierungsEintrag>;

function istAktivierungsEintrag(wert: unknown): wert is AktivierungsEintrag {
  if (!istRecord(wert)) return false;
  if (wert.typ === 'norm') {
    return typeof wert.bezeichnung === 'string' && wert.bezeichnung.trim().length > 0;
  }
  return (
    wert.typ === 'ueberschrift' &&
    typeof wert.gliederungskennzahl === 'string' &&
    wert.gliederungskennzahl.trim().length > 0
  );
}

function ladeAlle(): AktivierungsMap {
  const gespeichert = ladeJSON(STORAGE_KEY, {} as Record<string, unknown>, istRecord);
  // Gesetzesschlüssel wie __proto__ müssen eigene Properties bleiben.
  const alle = ohneObjectPrototype<AktivierungsEintrag>({});
  for (const [schluessel, wert] of Object.entries(gespeichert)) {
    if (istGesetzesreferenzSchluessel(schluessel) && istAktivierungsEintrag(wert)) {
      alle[schluessel] = wert;
    }
  }
  return alle;
}

function speichereAlle(alle: AktivierungsMap): void {
  speichereJSON(STORAGE_KEY, alle);
}

/** Typisierten Eintrag des zuletzt aktiven Elements speichern. */
function speichereAktivesElement(gesetz: Gesetzesreferenz, eintrag: AktivierungsEintrag): void {
  const alle = ladeAlle();
  const schluessel = gesetzesreferenzSchluessel(gesetz);
  const bisher = alle[schluessel];
  if (JSON.stringify(bisher) === JSON.stringify(eintrag)) return;
  alle[schluessel] = eintrag;
  speichereAlle(alle);
}

/** Gespeicherten Zustand eines Gesetzes löschen (z.B. beim Löschen des Gesetzes). */
export function entferneAktivierung(gesetz: Gesetzesreferenz): void {
  const alle = ladeAlle();
  const schluessel = gesetzesreferenzSchluessel(gesetz);
  if (!(schluessel in alle)) return;
  delete alle[schluessel];
  speichereAlle(alle);
}

// ---------------------------------------------------------------------------
// Aktivierung speichern und laden
// ---------------------------------------------------------------------------

/**
 * Speichert das zuletzt aktive Element eines Gesetzes dauerhaft.
 * Für §-Normen in Gliederungsartikel-Gesetzen (z.B. EGBGB) wird der Artikel
 * mitgespeichert (Format „229 3"), damit beim Laden der richtige § gefunden wird.
 * Früher: speichereAktivierung in ElementOeffnen.ts.
 */
export function speichereAktivierung(gesetz: GesetzDarstellung, el: DarstellungsElement): void {
  if (el.typ === 'ueberschrift') {
    if (el.data.gliederungskennzahl.trim()) {
      speichereAktivesElement(gesetz, {
        typ: 'ueberschrift',
        gliederungskennzahl: el.data.gliederungskennzahl,
      });
    }
    return;
  }
  const bezeichnung = bezeichnungFuerAktivierung(gesetz, el);
  if (bezeichnung?.trim()) speichereAktivesElement(gesetz, { typ: 'norm', bezeichnung });
}

/**
 * Lädt das zuletzt aktive Element eines Gesetzes und löst es als xmlId auf.
 * Gibt null zurück wenn kein Element gespeichert oder auflösbar.
 * Früher: ladeAktivierungXmlId in ElementOeffnen.ts.
 */
export function ladeAktivierungXmlId(gesetz: GesetzDarstellung): string | null {
  const eintrag = ladeAlle()[gesetzesreferenzSchluessel(gesetz)];
  if (!eintrag) return null;
  if (eintrag.typ === 'norm') return verweisZuXmlId(gesetz, eintrag.bezeichnung);
  return (
    gesetz.elemente.find(
      (el) =>
        el.typ === 'ueberschrift' && el.data.gliederungskennzahl === eintrag.gliederungskennzahl,
    )?.data.xmlId ?? null
  );
}
