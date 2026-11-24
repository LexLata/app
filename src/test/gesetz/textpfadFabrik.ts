// Zentrale Fabriken für gültige Bereichs- und Normtextpfade in Verhaltenstests.
import type { Textpfad } from '@/lib/domain/textpfad/textpfad.index';

type Normtext = Extract<Textpfad, { typ: 'normtext' }>;
type MitEintrag = Extract<Normtext, { eintraege: readonly unknown[] }>;
type Bereich = Extract<Textpfad, { typ: 'bereich' }>['bereich'];
type Eintragskette = MitEintrag['eintraege'];
type OhneEintrag = Exclude<Normtext, MitEintrag>;
type ListenWerte = Omit<MitEintrag, 'typ' | 'eintraege'> & {
  eintraege: readonly import('@/lib/domain/gesetzTypes').TextpfadEintrag[];
};

export function normtextPfad(werte: ListenWerte): MitEintrag;
export function normtextPfad(werte: Omit<OhneEintrag, 'typ'>): OhneEintrag;
export function normtextPfad(werte: ListenWerte | Omit<OhneEintrag, 'typ'>): Normtext {
  if (werte.eintraege !== undefined)
    return { ...werte, typ: 'normtext', eintraege: eintragskette(werte.eintraege) };
  return { ...werte, typ: 'normtext' };
}

export function bereichPfad(bereich: Bereich): Extract<Textpfad, { typ: 'bereich' }> {
  return { typ: 'bereich', bereich };
}

/** Gesicherte DOM-Pfade für Tests, die nachfolgend die Rekonstruktion prüfen. */
export function pfadAusBlatt(pfad: Textpfad | undefined): Textpfad {
  if (!pfad) throw new Error('Der Test erwartet einen gültigen Blattpfad.');
  return pfad;
}

/** Prüft bereits vorhandene Testketten und erhält ihren Inhalt. */
function eintragskette(
  eintraege: readonly import('@/lib/domain/gesetzTypes').TextpfadEintrag[],
): Eintragskette {
  const [erster, ...rest] = eintraege;
  if (!erster) throw new Error('Eine Listeneintragsadresse braucht mindestens einen Schritt.');
  return [erster, ...rest];
}

/** Getaggte Verweise erhalten ihre bisherigen einzelnen Adressfelder bis Phase 9. */
export function pfadOhneDiskriminante(pfad: Textpfad): Omit<Textpfad, 'typ'> {
  const { typ: _typ, ...adresse } = pfad;
  return adresse;
}
