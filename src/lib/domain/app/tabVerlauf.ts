// Reine Verlaufsregeln: höchstens 100 Elemente, Nachtragen, Zeiger und Rückkehrmarke.
import { istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import type { TabVerlauf, VerlaufEintrag } from '@/lib/domain/appTypes';

const MAX_VERLAUF_EINTRAEGE = 100;

function gleich(a: VerlaufEintrag | undefined, b: VerlaufEintrag | undefined): boolean {
  return (
    !!a && !!b && a.xmlId === b.xmlId && istGleichesGesetz(a.gesetzesreferenz, b.gesetzesreferenz)
  );
}

function abgewichen(verlauf: TabVerlauf): boolean {
  return (
    !!verlauf.aktivesElement && !gleich(verlauf.aktivesElement, verlauf.eintraege[verlauf.position])
  );
}

export function leererVerlauf(): TabVerlauf {
  return { eintraege: [], position: 0 };
}

/** Ausschließlich übertragbare Daten; dieselbe Obergrenze gilt beim Laden. */
export function verlaufOhneAktivierung(verlauf: TabVerlauf): TabVerlauf {
  const eintraege = verlauf.eintraege.slice(0, MAX_VERLAUF_EINTRAEGE);
  return { eintraege, position: Math.max(0, Math.min(verlauf.position, eintraege.length - 1)) };
}

export function verlaufEintragHinzufuegen(
  verlauf: TabVerlauf,
  neuerEintrag: VerlaufEintrag,
): TabVerlauf {
  let liste = [...verlauf.eintraege];
  if (verlauf.position > 0 && verlauf.position < liste.length) {
    const [vorheriger] = liste.splice(verlauf.position, 1);
    liste.unshift(vorheriger!);
  }
  liste = liste.filter((e) => !gleich(e, neuerEintrag));
  liste.unshift(neuerEintrag);
  const { rueckkehrmarke: _marke, ...rest } = verlauf;
  return { ...rest, eintraege: liste.slice(0, MAX_VERLAUF_EINTRAEGE), position: 0 };
}

/** Beim Verweisklick ersetzt die Ausgangsnorm bzw. Ausgangsüberschrift die verlassene Stelle. */
export function verlaufSprung(
  verlauf: TabVerlauf,
  ziel: VerlaufEintrag,
  verlasseneStelle = verlauf.aktivesElement,
): TabVerlauf {
  if (gleich(verlauf.aktivesElement, ziel)) return verlauf;
  let neu = verlauf;
  if (verlasseneStelle && !gleich(verlasseneStelle, verlauf.eintraege[verlauf.position])) {
    neu = verlaufEintragHinzufuegen(neu, verlasseneStelle);
  }
  return verlaufEintragHinzufuegen(neu, ziel);
}

export function verlaufAktivierungMelden(
  verlauf: TabVerlauf,
  aktivesElement: VerlaufEintrag,
  art: 'schritt' | 'nachfuehrung' | 'vorgegeben',
): TabVerlauf {
  if (art === 'vorgegeben') return { ...verlauf, aktivesElement };
  const { rueckkehrmarke: _marke, ...rest } = verlauf;
  return { ...rest, aktivesElement };
}

type Navigation = { verlauf: TabVerlauf; ziel: VerlaufEintrag } | null;

/** Ergebnis beschreibt den erfolgreich abgeschlossenen Navigationsschritt. */
export function verlaufPositionSetzen(verlauf: TabVerlauf, position: number): Navigation {
  const ziel = verlauf.eintraege[position];
  if (!ziel) return null;
  const rueckkehrmarke = abgewichen(verlauf)
    ? { eintrag: verlauf.aktivesElement!, position }
    : verlauf.rueckkehrmarke;
  return {
    ziel,
    verlauf: {
      ...verlauf,
      position,
      aktivesElement: ziel,
      ...(rueckkehrmarke ? { rueckkehrmarke } : {}),
    },
  };
}

export function verlaufSchrittNavigieren(
  verlauf: TabVerlauf | undefined,
  richtung: 'zurueck' | 'vorwaerts',
): Navigation {
  if (!verlauf || !verlauf.eintraege.length) return null;
  if (richtung === 'zurueck' && abgewichen(verlauf))
    return verlaufPositionSetzen(verlauf, verlauf.position);
  if (
    richtung === 'vorwaerts' &&
    !abgewichen(verlauf) &&
    verlauf.rueckkehrmarke?.position === verlauf.position
  ) {
    const { rueckkehrmarke, ...rest } = verlauf;
    return {
      ziel: rueckkehrmarke.eintrag,
      verlauf: { ...rest, aktivesElement: rueckkehrmarke.eintrag },
    };
  }
  const position = verlauf.position + (richtung === 'zurueck' ? 1 : -1);
  const ziel = verlauf.eintraege[position];
  if (!ziel) return null;
  return {
    ziel,
    verlauf: { ...verlauf, position, ...(verlauf.aktivesElement ? { aktivesElement: ziel } : {}) },
  };
}

export function verlaufPfeilzustaende(verlauf: TabVerlauf | undefined): {
  kannZurueck: boolean;
  kannVorwaerts: boolean;
} {
  return {
    kannZurueck: !!verlaufSchrittNavigieren(verlauf, 'zurueck'),
    kannVorwaerts: !!verlaufSchrittNavigieren(verlauf, 'vorwaerts'),
  };
}
