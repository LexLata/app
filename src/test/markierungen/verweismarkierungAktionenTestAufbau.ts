// verweismarkierungAktionenTestAufbau.ts
//
// Gemeinsame Fixtures für verweismarkierungAktionen.zitatAufloesung.test.ts
// und verweismarkierungAktionen.persistieren.test.ts (zweiter echter
// Anwendungsfall, siehe Absprache zur Abstraktionsschwelle – daher hier
// ausgelagert statt in beiden Dateien dupliziert, siehe jscpd). Bewusst
// NICHT von verweismarkierungAktionen.test.ts wiederverwendet: dessen
// `gesetz()`-Fixture hat andere Parameter (quelle) für die dortigen
// versucheAktualisierung/speichereVerweismarkierung-Charakterisierungstests.

import { normaleNorm, gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import type {
  GesetzDarstellung,
  DarstellungsElement,
  NormDarstellung,
} from '@/lib/domain/gesetzTypes';

export function gesetz(kurztitel: string, elemente: DarstellungsElement[] = []): GesetzDarstellung {
  return gesetzDarstellung({
    kurztitel,
    langtitel: 'irrelevant',
    hatGliederungsartikel: false,
    elemente,
  });
}

export function normDarstellung(
  xmlId: string,
  absaetze: NormDarstellung['absaetze'] = [],
): NormDarstellung {
  return normaleNorm({ id: `id-${xmlId}`, xmlId, bezeichnung: `§ ${xmlId}`, absaetze });
}

export function norm(
  xmlId: string,
  absaetze: NormDarstellung['absaetze'] = [],
): DarstellungsElement {
  return { typ: 'norm', data: normDarstellung(xmlId, absaetze) };
}
