// strukturAuswertung.ts
// Reine Ableitungen von Sichtbarkeit, Hierarchie, Position und Tabbezeichnung.

import { ermittleUmfassendenGliederungsartikel } from '@/lib/domain/gesetzHierarchie';
import type { DarstellungsElement } from '@/lib/domain/gesetzTypes';

// ---------------------------------------------------------------------------
// Sichtbarkeits-Filter: blendet Inhalte hinter eingeklappten Überschriften
// und eingeklappten Gliederungsartikeln aus
// ---------------------------------------------------------------------------
// Läuft einmal über die flache elemente-Liste und führt dabei zwei Stacks:
// - kollapsStack:        eingeklappte Überschrift-Ebenen
// - artikelKollapsStack: eingeklappte Gliederungsartikel-Ebenen (z.B. Art. 229 EGBGB)
//
// Sobald eine eingeklappte Überschrift/Artikel der Ebene n erscheint, werden
// alle nachfolgenden Elemente übersprungen – bis wieder ein Element mit
// Ebene < n auftaucht. Beide Stacks wirken unabhängig; ein Element wird nur
// angezeigt, wenn BEIDE Stacks leer sind.

// Entfernt von beiden Stacks alles, was auf Ebene >= der übergebenen Ebene
// liegt: eine Überschrift/ein Gliederungsartikel auf Ebene n beendet jeden
// offenen ausgeblendeten Bereich ab dieser Ebene, gleichgültig welcher der
// beiden Stacks ihn ursprünglich geöffnet hat (s. Dateikommentar
// oben: "unabhängig wirkende Stacks" heißt nicht, dass sie sich gegenseitig
// ignorieren – ein neues Kopf-Element auf Ebene n ist für beide Stacks
// gleichermaßen ein Ebenenwechsel).
function stacksBisEbeneLeeren(
  kollapsStack: number[],
  artikelKollapsStack: number[],
  ebene: number,
): void {
  while (kollapsStack.length > 0 && kollapsStack[kollapsStack.length - 1]! >= ebene) {
    kollapsStack.pop();
  }
  while (
    artikelKollapsStack.length > 0 &&
    artikelKollapsStack[artikelKollapsStack.length - 1]! >= ebene
  ) {
    artikelKollapsStack.pop();
  }
}

function istSichtbar(kollapsStack: number[], artikelKollapsStack: number[]): boolean {
  return kollapsStack.length === 0 && artikelKollapsStack.length === 0;
}

// Verarbeitet ein Überschrift-Element: beendet ggf. offene ausgeblendete Bereiche
// beider Stacks, hängt das Element bei Sichtbarkeit an result an und öffnet
// selbst einen neuen ausgeblendeten Bereich, falls es in eingeklappteUeberschriften steht.
function verarbeiteUeberschrift(
  el: Extract<DarstellungsElement, { typ: 'ueberschrift' }>,
  kollapsStack: number[],
  artikelKollapsStack: number[],
  eingeklappteUeberschriften: ReadonlySet<string>,
  result: DarstellungsElement[],
): void {
  const ebene = el.data.ebene;
  stacksBisEbeneLeeren(kollapsStack, artikelKollapsStack, ebene);
  if (!istSichtbar(kollapsStack, artikelKollapsStack)) return;
  result.push(el);
  if (eingeklappteUeberschriften.has(el.data.id)) {
    kollapsStack.push(ebene);
  }
}

// Verarbeitet einen Gliederungsartikel (z.B. Art. 229 EGBGB): strukturell
// wie eine Überschrift – blendet nachfolgende §§ aus, wenn eingeklappt.
// Analog zu verarbeiteUeberschrift, nur auf artikelKollapsStack bezogen.
function verarbeiteGliederungsartikel(
  el: Extract<DarstellungsElement, { typ: 'norm' }>,
  ebene: number,
  kollapsStack: number[],
  artikelKollapsStack: number[],
  eingeklappteNormen: ReadonlySet<string>,
  result: DarstellungsElement[],
): void {
  stacksBisEbeneLeeren(kollapsStack, artikelKollapsStack, ebene);
  if (!istSichtbar(kollapsStack, artikelKollapsStack)) return;
  result.push(el);
  if (eingeklappteNormen.has(el.data.id)) {
    artikelKollapsStack.push(ebene);
  }
}

export function berechneVisibleElemente(
  elemente: readonly DarstellungsElement[],
  eingeklappteUeberschriften: ReadonlySet<string>,
  eingeklappteNormen: ReadonlySet<string>,
): DarstellungsElement[] {
  const result: DarstellungsElement[] = [];
  // Stack für eingeklappte Überschrift-Ebenen
  const kollapsStack: number[] = [];
  // Stack für eingeklappte Gliederungsartikel-Ebenen (nur EGBGB o.Ä.)
  const artikelKollapsStack: number[] = [];

  for (const el of elemente) {
    if (el.typ === 'ueberschrift') {
      verarbeiteUeberschrift(
        el,
        kollapsStack,
        artikelKollapsStack,
        eingeklappteUeberschriften,
        result,
      );
    } else if (el.typ === 'norm' && el.data.art === 'gliederungsartikel') {
      verarbeiteGliederungsartikel(
        el,
        el.data.gliederungsEbene,
        kollapsStack,
        artikelKollapsStack,
        eingeklappteNormen,
        result,
      );
    } else if (istSichtbar(kollapsStack, artikelKollapsStack)) {
      // Normale Norm (§): nur anzeigen, wenn kein Kollaps-Stack aktiv ist.
      result.push(el);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Geschütztes Leerzeichen
// ---------------------------------------------------------------------------
// schuetzeLeerzeichen()/schuetzeLeerzeichenZitat() sind nach
// lib/domain/basis/textNachbearbeitung.ts verschoben (reine, React-freie
// Funktionen ohne Abhängigkeit zum Rest dieser Datei, mit Konsumenten
// außerhalb von gesetzestextansicht – siehe dortiger Kopfkommentar).

// Gibt die Bezeichnung eines Elements zurück (Norm-bezeichnung oder Überschrift-Bezeichnung).
function elementBezeichnung(el: DarstellungsElement): string | undefined {
  switch (el.typ) {
    case 'norm':
      return el.data.bezeichnung;
    case 'ueberschrift':
      return el.data.bezeichnung;
  }
}

export function ermittleTabBezeichnung(
  sichtbareElemente: readonly DarstellungsElement[],
  index: number,
): string | undefined {
  const el = sichtbareElemente[index];
  if (!el) return undefined;

  if (el.typ === 'norm' && el.data.art !== 'gliederungsartikel') {
    const artikel = ermittleUmfassendenGliederungsartikel([...sichtbareElemente], el.data.id);
    if (artikel) {
      // Beide Bezeichnungen kombinieren: "Art. 224 § 2" statt nur "Art. 224"
      const artikelBez = artikel.bezeichnung;
      const normBez = elementBezeichnung(el);
      return artikelBez && normBez ? `${artikelBez} ${normBez}` : (artikelBez ?? normBez);
    }
  }

  return elementBezeichnung(el);
}

// ---------------------------------------------------------------------------
// Überschrift-artige Normen + Trennstriche
// ---------------------------------------------------------------------------

// Normen, die wie Überschriften behandelt werden: Gliederungsartikel mit
// untergeordneten §§. Das Feld ueberschriftartig wird vom Parser
// vorberechnet (zweiter Pass in gesetzesXMLParser.ts), kein Nachbar-Zugriff
// mehr nötig. Läuft über die VOLLE Elementliste (elemente), nicht über
// sichtbareElemente – die Zuordnung ist unabhängig vom Einklapp-Zustand.
export function ermittleUeberschriftArtigeNormIds(
  elemente: readonly DarstellungsElement[],
): Set<string> {
  return new Set(
    elemente
      .filter(
        (el) =>
          el.typ === 'norm' && el.data.art === 'gliederungsartikel' && el.data.ueberschriftartig,
      )
      .map((el) => el.data.id),
  );
}

// Trennstriche: IDs aller heading-artigen Elemente, vor denen ein horizontaler
// Strich erscheint (Wechsel von tieferer zu höherer Ebene in sichtbareElemente).
// Basiert auf sichtbareElemente, berücksichtigt damit automatisch den Einklapp-Zustand:
// eingeklappte Kinder fehlen in der Liste und beeinflussen den Trenner nicht.
export function ermittleTrennerVorIds(
  sichtbareElemente: readonly DarstellungsElement[],
): Set<string> {
  const ids = new Set<string>();
  let letzteKopfEbene: number | null = null;
  for (const el of sichtbareElemente) {
    let ebene: number | null = null;
    if (el.typ === 'ueberschrift') {
      ebene = el.data.ebene;
    } else if (
      el.typ === 'norm' &&
      el.data.art === 'gliederungsartikel' &&
      el.data.ueberschriftartig
    ) {
      ebene = el.data.gliederungsEbene;
    }
    if (ebene === null) continue;
    if (letzteKopfEbene !== null && ebene < letzteKopfEbene) {
      ids.add(el.data.id);
    }
    letzteKopfEbene = ebene;
  }
  return ids;
}
