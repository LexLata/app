// Prüft XML-Textpfade vor der Übernahme in das fachliche Fallmodell.
import type { TextpfadEintrag } from '@/lib/domain/gesetzTypes';
import { liesTextpfadEintraege, type Textpfad } from '@/lib/domain/textpfad/textpfad.index';
import { xmlText, xmlKind } from '@/lib/utils/xmlVerarbeitung';

export const XML_BEREICH = {
  bezeichnung: 'bezeichnung',
  amtlicherTitel: 'amtlicher-titel',
  nichtamtlicherTitel: 'nichtamtlicher-titel',
} as const;

export function liesXmlBereich(wert: string | undefined): Textpfad['bereich'] {
  return Object.keys(XML_BEREICH)
    .filter((wert): wert is keyof typeof XML_BEREICH => Object.hasOwn(XML_BEREICH, wert))
    .find((bereich) => XML_BEREICH[bereich] === wert);
}

function index(roh: string | null, xmlGanzzahl = false): number | undefined {
  if (roh === null) return undefined;
  const text = xmlGanzzahl ? roh.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '') : roh;
  if (!(xmlGanzzahl ? /^(?:\+?\d+|-0+)$/ : /^\d+$/).test(text)) return undefined;
  const zahl = Number(roh);
  return Number.isSafeInteger(zahl) ? zahl : undefined;
}

function liesWiederholung(el: Element | undefined): { wiederholung?: number } | undefined {
  if (!el?.hasAttribute('wiederholung')) return {};
  const wiederholung = index(el.getAttribute('wiederholung'), el.tagName === 'absatz');
  return wiederholung !== undefined ? { wiederholung } : undefined;
}

function liesEintrag(el: Element): TextpfadEintrag | undefined {
  const wiederholung = liesWiederholung(el);
  if (!wiederholung || (el.tagName !== 'nummer' && el.tagName !== 'litera')) return undefined;
  return { ebene: el.tagName, bezeichnung: (el.textContent ?? '').trim(), ...wiederholung };
}

function liesSatz(el: Element | undefined): { satz?: number } | undefined {
  if (!el) return {};
  const satz = index(el.textContent);
  return satz !== undefined ? { satz } : undefined;
}

// Nur direkte Pfadkinder zählen. Unbekannte Erweiterungen bleiben wie bisher außen vor.
const PFAD_STUFEN: Readonly<Record<string, string>> = {
  absatz: 'a',
  unterabsatz: 'u',
  satz: 's',
  nummer: 'n',
  litera: 'l',
  bereich: 'b',
};

function liesNormtext(textstelle: Element, kinder: Element[]): Textpfad | undefined {
  // Vor und nach der nicht leeren Eintragskette ist jeweils höchstens ein Satz zulässig.
  if (['absatz', 'unterabsatz'].some((tag) => kinder.filter((el) => el.tagName === tag).length > 1))
    return undefined;
  // Absatz und Unterabsatz sind im XML mit der Satz-/Eintragsfolge verschachtelbar.
  // Nur die Reihenfolge innerhalb dieser Folge unterscheidet äußeren und inneren Satz.
  const reihenfolge = kinder
    .filter((el) => el.tagName !== 'absatz' && el.tagName !== 'unterabsatz')
    .map((el) => PFAD_STUFEN[el.tagName])
    .join('');
  if (!/^s?(?:[nl]+s?)?$/.test(reihenfolge)) return undefined;
  const absatz = xmlKind(textstelle, 'absatz');
  const wiederholung = liesWiederholung(absatz);
  const ersterEintrag = kinder.findIndex(
    (el) => el.tagName === 'nummer' || el.tagName === 'litera',
  );
  const saetze = kinder.filter((el) => el.tagName === 'satz');
  const aussen = saetze.find((el) => ersterEintrag < 0 || kinder.indexOf(el) < ersterEintrag);
  const innen = saetze.find((el) => ersterEintrag >= 0 && kinder.indexOf(el) > ersterEintrag);
  const satz = liesSatz(aussen);
  const satzImEintrag = liesSatz(innen);
  if (!wiederholung || !satz || !satzImEintrag) return undefined;
  const basis = {
    typ: 'normtext' as const,
    absatz: absatz?.textContent?.trim() || undefined,
    ...(wiederholung.wiederholung ? { absatzWiederholung: wiederholung.wiederholung } : {}),
    unterabsatz: xmlText(textstelle, 'unterabsatz') || undefined,
    ...satz,
  };
  const eintraege = kinder
    .filter((el) => el.tagName === 'nummer' || el.tagName === 'litera')
    .map(liesEintrag);
  if (eintraege.length === 0) return basis;
  const kette = liesTextpfadEintraege(eintraege);
  return kette
    ? {
        ...basis,
        eintraege: kette,
        ...(satzImEintrag.satz !== undefined ? { satzInEintrag: satzImEintrag.satz } : {}),
      }
    : undefined;
}

/** Die Lage der Satz-Tags vor/nach der Kette bestimmt äußeren/inneren Satz. */
export function parseTextpfad(textstelle: Element | undefined): Textpfad | undefined {
  if (!textstelle) return undefined;
  const kinder = Array.from(textstelle.children).filter((el) =>
    Object.hasOwn(PFAD_STUFEN, el.tagName),
  );
  const bereich = xmlText(textstelle, 'bereich')?.trim();
  if (bereich === undefined) return liesNormtext(textstelle, kinder);
  const intern = liesXmlBereich(bereich);
  if (!intern) return undefined;
  return kinder.length === 1 ? { typ: 'bereich', bereich: intern } : undefined;
}
