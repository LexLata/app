// Fensterlokaler Suchtext: überlebt das Overlay, hält keine Gesetzesdarstellungen.
import { useEffect, useRef, useState } from 'react';
import type { Suchverzeichniseintrag } from '@/lib/domain/app/oeffnen/oeffnen.index';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { GesetzLader } from '@/lib/gesetz-laden/gesetz-laden.index';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { hoereGlobal } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
import { meldeSpeicherauskunft } from '@/lib/utils/speicherMessung';
import { baueSuchIndexFuerGesetz, type SuchtextEintrag } from './VolltextSucheOverlay.helpers';
export interface VolltextSuchstand {
  eintraege: SuchtextEintrag[];
  erledigt: number;
  gesamt: number;
  vollstaendig: boolean;
}
export function useVolltextSuchtext(
  eintraege: Suchverzeichniseintrag[],
  wirdVorbereitet: boolean,
  ladeGesetz: GesetzLader,
  angefordert: boolean,
  verzeichnisWirdAktualisiert = false,
): VolltextSuchstand {
  const speicher = useRef(
    new Map<string, { eintraege: SuchtextEintrag[]; lesbar: boolean; stempel: string }>(),
  );
  // Messmodus: speicherbericht() zählt den gehaltenen Suchtext erst beim Abruf.
  useEffect(
    () =>
      meldeSpeicherauskunft({
        art: 'posten',
        name: 'Volltextsuchindex',
        liefere: () => speicher.current,
      }),
    [],
  );
  const referenzierteEintraege = eintraege.filter(
    (e): e is Suchverzeichniseintrag & Gesetzesreferenz => !!e.kurztitel && !!e.normgeber,
  );
  const eingabe = {
    eintraege: referenzierteEintraege,
    wirdVorbereitet: wirdVorbereitet || referenzierteEintraege.length !== eintraege.length,
    ladeGesetz,
  };
  const aktuell = useRef(eingabe);
  aktuell.current = eingabe;
  const begonnen = useRef(false);
  const generation = useRef(0);
  const [revision, setRevision] = useState(0);
  const [bereit, setBereit] = useState(false);
  const [stand, setStand] = useState<VolltextSuchstand>({
    eintraege: [],
    erledigt: 0,
    gesamt: 0,
    vollstaendig: false,
  });
  const signatur = JSON.stringify(
    eintraege.map((e) => [e.kurztitel, e.normgeber, e.dateistempel, e.status]),
  );
  useEffect(() => {
    let aktiv = true;
    const entwerten = (event: { payload: { kurztitel: string; normgeber: string }[] }) => {
      if (!aktiv || event.payload.length === 0) return;
      generation.current++;
      for (const referenz of event.payload)
        speicher.current.delete(gesetzesreferenzSchluessel(referenz));
      setRevision((wert) => wert + 1);
    };
    const anmeldungen = [
      hoereGlobal('gesetze-geaendert', entwerten),
      hoereGlobal('gesetze-geloescht', entwerten),
    ];
    void Promise.all(anmeldungen.map((a) => a.bereit))
      .then(() => {
        if (aktiv) setBereit(true);
      })
      .catch((fehler: unknown) =>
        console.error('Volltextsuche konnte Gesetzesänderungen nicht beobachten:', fehler),
      );
    return () => {
      aktiv = false;
      for (const anmeldung of anmeldungen) anmeldung.abmelden();
    };
  }, []);
  useEffect(() => {
    if (!bereit || (!angefordert && !begonnen.current)) return;
    begonnen.current = true;
    let aktiv = true;
    const laufGeneration = ++generation.current;
    const { eintraege, wirdVorbereitet, ladeGesetz } = aktuell.current;
    for (const e of eintraege) {
      const key = gesetzesreferenzSchluessel(e);
      if (speicher.current.get(key)?.stempel !== JSON.stringify(e.dateistempel))
        speicher.current.delete(key);
    }
    const schluessel = new Set(eintraege.map((e) => gesetzesreferenzSchluessel(e)));
    for (const key of speicher.current.keys())
      if (!schluessel.has(key)) speicher.current.delete(key);
    const melden = () => {
      if (!aktiv) return;
      const vorhanden = eintraege.flatMap((e) => {
        const wert = speicher.current.get(gesetzesreferenzSchluessel(e));
        return wert ? [wert] : [];
      });
      setStand({
        eintraege: vorhanden.flatMap((e) => e.eintraege),
        erledigt: vorhanden.length,
        gesamt: eintraege.length,
        vollstaendig:
          !wirdVorbereitet &&
          !verzeichnisWirdAktualisiert &&
          vorhanden.length === eintraege.length &&
          vorhanden.every((e) => e.lesbar),
      });
    };
    melden();
    // Inhaltliches Ereignis und das frische Verzeichnis gehören zusammen.
    // Erst nach dessen Leseabschluss hat die Ableitung den richtigen Stempel.
    if (verzeichnisWirdAktualisiert)
      return () => {
        aktiv = false;
      };
    void (async () => {
      for (const eintrag of eintraege) {
        const key = gesetzesreferenzSchluessel(eintrag);
        if (speicher.current.has(key)) continue;
        const ergebnis = await ladeGesetz(eintrag, undefined, { behalten: false });
        if (!aktiv || laufGeneration !== generation.current) return;
        const suchtexte =
          ergebnis.status === 'geladen'
            ? baueSuchIndexFuerGesetz(ergebnis.gesetz).map(({ gesetz, norm, volltext }) => ({
                gesetz: { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber },
                norm: { xmlId: norm.xmlId, bezeichnung: norm.bezeichnung, titel: norm.titel },
                volltext,
              }))
            : [];
        speicher.current.set(key, {
          eintraege: suchtexte,
          lesbar: ergebnis.status === 'geladen',
          stempel: JSON.stringify(eintrag.dateistempel),
        });
        melden();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (!aktiv) return;
      }
    })();
    return () => {
      aktiv = false;
    };
  }, [angefordert, bereit, revision, signatur, wirdVorbereitet, verzeichnisWirdAktualisiert]);
  if (verzeichnisWirdAktualisiert) {
    return {
      ...stand,
      eintraege: stand.eintraege.filter((e) =>
        speicher.current.has(gesetzesreferenzSchluessel(e.gesetz)),
      ),
      erledigt: speicher.current.size,
      vollstaendig: false,
    };
  }
  return stand;
}
