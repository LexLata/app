// gesetzestextansicht.index.ts
//
// Öffentliche Schnittstelle des components/gesetzestextansicht-Moduls.
//
// REGEL (durchgesetzt über dependency-cruiser, siehe
// scripts/automatisch/modulgrenzen.cjs, Regel
// 'nur-gesetzestextansicht-index-darf-von-aussen-genutzt-werden'): Code
// außerhalb von src/components/gesetzestextansicht/** darf ausschließlich aus
// DIESER Datei importieren, nie direkt aus den Unterordnern (ansichtssteuerung/,
// auswahl/, baum/, markierung/, text-darstellung/) oder den
// Kern-Dateien (Gesetzestextansicht.layout.ts usw.). gesetzestextansicht selbst
// darf weiterhin frei aus jedem anderen Bereich importieren (domain,
// markierungen, persistenz, …) – die Beschränkung gilt nur in
// Zugriffsrichtung "von außen nach rein".
//
// Ansicht und eigenständige Absatzvorschau mit ihren benannten Props-Verträgen.
//
// ---------------------------------------------------------------------------
// Die Gesetzestext-Ansicht selbst
// ---------------------------------------------------------------------------

/** Rendert die komplette virtualisierte Gesetzesansicht (Struktur,
 *  Markierungen, Navigation, Favoriten, Auswahl-Leiste). Aufrufer:
 *  hauptfenster/GesetzestextansichtHuelle.tsx, mobile/screens/GesetzTextScreen.tsx. */
export { Gesetzestextansicht } from '@/components/gesetzestextansicht/Gesetzestextansicht';

// ---------------------------------------------------------------------------
// Eigenständig nutzbare Rendering-Bausteine
// ---------------------------------------------------------------------------

/** Rendert eine Absatzliste OHNE Virtualisierung/Einklapp-Kontext – z.B.
 *  für den Vorher/Nachher-Vergleich im Verlauf. Explizite Textwerte oder
 *  zentrale Defaults und eigene Messung gelten lokal; keine Ansichtssteuerung
 *  erforderlich. Aufrufer:
 *  overlays/standard/VerlaufOverlay.tsx. */
export { AbsatzListe } from '@/components/gesetzestextansicht/baum/baum.index';
export type {
  GesetzestextansichtProps,
  AbsatzListeProps,
} from '@/components/gesetzestextansicht/Gesetzestextansicht.types';

/** Textdarstellungsmodell und Textmessung. Aufrufer: src/test/gesetz/testDarstellung.ts
 *  (Testgrundlage aus dem echten Darstellungsmodell). */
export { useTextDarstellungsModell } from '@/components/gesetzestextansicht/text-darstellung/text-darstellung.index';
