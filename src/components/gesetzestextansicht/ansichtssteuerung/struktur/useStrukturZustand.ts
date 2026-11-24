// useStrukturZustand.ts
// Einzige Quelle für Einklappen und Aktivierung; alle Änderungen sind semantische
// Operationen. Geometrie, DOM, Timer und Scrollausführung liegen außerhalb.
import { messeAufruf } from '@/lib/utils/perfMessung';
import { ermittleElternIndizes } from '@/lib/domain/gesetzHierarchie';
import { useMemo, useState } from 'react';
import { xmlIdZuSprungZiel, type SprungZiel } from '@/lib/domain/norm/norm.index';
import type {
  StrukturZustand,
  StrukturZustandOptionen,
  ZielVorbereitung,
  KlappschrittErgebnis,
} from './StrukturZustand.types';
import {
  berechneVisibleElemente,
  ermittleTrennerVorIds,
  ermittleUeberschriftArtigeNormIds,
} from './strukturAuswertung';
import { ermittleUnterArtikelIds } from './useEinklappZustand';
import { berechnePfeilaktion, ueberschriftartig } from './pfeilNavigation';
import {
  baueAlleStufenZustaende,
  baueEingeklappteMengenFuerZielstufe,
  ermittleAktuelleStufe,
  ermittleZielFuerAnker,
  klassifiziereSichtbarkeit,
  ermittleZielStufeRechts,
  ermittleZielStufeLinks,
  neuesAktivesElementLinks,
  istTeilmengeVon,
} from './klappstufenNavigation';
export function useStrukturZustand({
  elemente,
  initial,
  initialNormAktiv,
  sperren,
}: StrukturZustandOptionen): StrukturZustand {
  const [momentaufnahme, setzen] = useState(() => ({
    eingeklappteUeberschriften: new Set(
      initial?.eingeklappteUeberschriften ?? [],
    ) as ReadonlySet<string>,
    eingeklappteNormen: new Set(initial?.eingeklappteNormen ?? []) as ReadonlySet<string>,
    aktivesElementId: initialNormAktiv
      ? null
      : (initial?.aktivesElementId ?? elemente[0]?.data.id ?? null),
  }));
  const sichtbareElemente = useMemo(
    () =>
      berechneVisibleElemente(
        elemente,
        momentaufnahme.eingeklappteUeberschriften,
        momentaufnahme.eingeklappteNormen,
      ),
    [elemente, momentaufnahme.eingeklappteUeberschriften, momentaufnahme.eingeklappteNormen],
  );
  const unterArtikelIds = useMemo(() => ermittleUnterArtikelIds(elemente), [elemente]);
  const ueberschriftArtigeNormIds = useMemo(
    () => ermittleUeberschriftArtigeNormIds(elemente),
    [elemente],
  );
  const trennerVorIds = useMemo(
    () => ermittleTrennerVorIds(sichtbareElemente),
    [sichtbareElemente],
  );
  const struktur = useMemo(
    () =>
      messeAufruf('Struktur', () => {
        const artig = elemente.map((_el, i) => ueberschriftartig(elemente, i));
        const eltern = ermittleElternIndizes(elemente);
        return { artig, eltern, stufen: baueAlleStufenZustaende(elemente, artig, eltern) };
      }),
    [elemente],
  );
  const kollaps = {
    ueberschriften: momentaufnahme.eingeklappteUeberschriften,
    normen: momentaufnahme.eingeklappteNormen,
  };
  function schalten(id: string, ueberschrift: boolean) {
    setzen((vorher) => {
      const key = ueberschrift ? 'eingeklappteUeberschriften' : 'eingeklappteNormen';
      const ids = new Set(vorher[key]);
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      return { ...vorher, [key]: ids, aktivesElementId: id };
    });
  }
  function waehleNormText(id: string) {
    if (!sperren?.normAuswahlGesperrt)
      setzen((vorher) =>
        vorher.aktivesElementId === id ? vorher : { ...vorher, aktivesElementId: id },
      );
  }
  function bereiteZielVor(xmlId: string, vorfahrenAufklappen: boolean): ZielVorbereitung {
    const ziel: SprungZiel | null = xmlIdZuSprungZiel(elemente, xmlId);
    if (!ziel) return { status: 'nicht-gefunden' };
    const elementId = elemente[ziel.index]!.data.id;
    const verborgen = ziel.vorfahrenIds.some(
      (id) =>
        momentaufnahme.eingeklappteUeberschriften.has(id) ||
        momentaufnahme.eingeklappteNormen.has(id),
    );
    if (verborgen && !vorfahrenAufklappen) return { status: 'nicht-gefunden' };
    setzen((vorher) => {
      if (!verborgen && vorher.aktivesElementId === elementId) return vorher;
      if (!verborgen) return { ...vorher, aktivesElementId: elementId };
      const ueberschriften = new Set(vorher.eingeklappteUeberschriften);
      const normen = new Set(vorher.eingeklappteNormen);
      if (verborgen)
        ziel.vorfahrenIds.forEach((id) => {
          ueberschriften.delete(id);
          normen.delete(id);
        });
      return {
        eingeklappteUeberschriften: ueberschriften,
        eingeklappteNormen: normen,
        aktivesElementId: elementId,
      };
    });
    return verborgen
      ? { status: 'aufklappen', elementId }
      : {
          status: 'sichtbar',
          elementId,
          index: sichtbareElemente.findIndex((el) => el.data.id === elementId),
        };
  }
  function klappeStufe(richtung: 'auf' | 'zu', ankerId: string | null): KlappschrittErgebnis {
    const { artig, eltern, stufen } = struktur;
    const aktuell = ermittleAktuelleStufe(stufen, kollaps);
    const sichtbarkeit = klassifiziereSichtbarkeit(
      elemente,
      artig,
      new Set(sichtbareElemente.map((el) => el.data.id)),
      momentaufnahme.eingeklappteNormen,
    );
    const r = richtung === 'auf' ? 'rechts' : 'links';
    const zielStufe =
      r === 'rechts'
        ? ermittleZielStufeRechts(
            aktuell,
            sichtbarkeit.contentSichtbarAny,
            sichtbarkeit.titelSichtbarAny,
          )
        : ermittleZielStufeLinks(kollaps, stufen);
    const { ueberschriften, normen } = baueEingeklappteMengenFuerZielstufe(
      r,
      zielStufe,
      stufen,
      kollaps,
    );
    const ziel = ermittleZielFuerAnker(
      elemente.find((el) => el.data.id === ankerId),
      0,
      r,
      elemente,
      ueberschriften,
      normen,
      artig,
      eltern,
    );
    const aktivesElementId =
      r === 'links'
        ? neuesAktivesElementLinks(
            zielStufe,
            momentaufnahme.aktivesElementId,
            elemente,
            artig,
            eltern,
          )
        : momentaufnahme.aktivesElementId;
    setzen({
      eingeklappteUeberschriften: ueberschriften,
      eingeklappteNormen: normen,
      aktivesElementId,
    });
    return ankerId !== null && ankerId === momentaufnahme.aktivesElementId
      ? { zielId: aktivesElementId, offsetInItem: 0 }
      : { zielId: ziel.zielId, offsetInItem: ziel.zielOffset };
  }
  return {
    momentaufnahme,
    sichtbareElemente,
    unterArtikelIds,
    ueberschriftArtigeNormIds,
    trennerVorIds,
    kannAufklappen: kollaps.ueberschriften.size > 0 || kollaps.normen.size > 0,
    kannZuklappen: !istTeilmengeVon(struktur.stufen[4], kollaps),
    schalteUeberschrift: (id) => {
      if (!sperren?.ueberschriftenGesperrt) schalten(id, true);
    },
    schalteNorm: (id) => {
      if (sperren?.normAuswahlGesperrt) return;
      if (sperren?.einklappenGesperrt) waehleNormText(id);
      else schalten(id, false);
    },
    waehleNormText,
    bereiteZielVor,
    klappeStufe,
    fuehrePfeilaktionAus(richtung, optionen) {
      const ergebnis = berechnePfeilaktion(elemente, sichtbareElemente, momentaufnahme, richtung, {
        ...optionen,
        einklappenGesperrt: sperren?.einklappenGesperrt,
      });
      setzen(ergebnis.momentaufnahme);
      return { zielId: ergebnis.zielId };
    },
  };
}
