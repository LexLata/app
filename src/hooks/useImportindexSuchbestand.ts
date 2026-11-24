// Darstellungsbestand einer geöffneten Suche; Gültigkeit folgt den gemeinsamen Invalidierungen.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  beiImportindexInvalidiert,
  leseImportindexZwischenspeicher,
  istImportindexSuchbestandVollstaendig,
  sucheKandidatenAlleQuellen,
} from '@/lib/import/import.index';

type Bestand = Awaited<ReturnType<typeof sucheKandidatenAlleQuellen>>;

export function useImportindexSuchbestand(bedarf: boolean) {
  const [bestand, setBestand] = useState<Bestand | null>(
    () => leseImportindexZwischenspeicher() ?? null,
  );
  const gueltig = useRef(bestand);
  const generation = useRef(0);
  const aktiv = useRef(false);
  const laufend = useRef<{ generation: number; ergebnis: Promise<Bestand> } | null>(null);
  const [invalidierung, setInvalidierung] = useState(0);
  const [fehler, setFehler] = useState(false);
  useLayoutEffect(() => {
    aktiv.current = true;
    const invalidiere = () => {
      generation.current++;
      gueltig.current = null;
      setBestand(null);
      setFehler(false);
      setInvalidierung(generation.current);
    };
    const abmelden = beiImportindexInvalidiert(invalidiere);
    // Zwischen Rendern und Anmeldung kann bereits ein Fensterereignis eintreffen.
    if (gueltig.current && leseImportindexZwischenspeicher() !== gueltig.current) invalidiere();
    return () => {
      aktiv.current = false;
      abmelden();
    };
  }, []);
  useEffect(() => {
    if (!bedarf || (gueltig.current && leseImportindexZwischenspeicher() === gueltig.current))
      return;
    let aktiv = true;
    const angefordert = generation.current;
    setFehler(false);
    let vorgang = laufend.current;
    if (!vorgang || vorgang.generation !== angefordert) {
      vorgang = { generation: angefordert, ergebnis: sucheKandidatenAlleQuellen() };
      laufend.current = vorgang;
      const abschliessen = () => {
        if (laufend.current === vorgang) laufend.current = null;
      };
      void vorgang.ergebnis.then(abschliessen, abschliessen);
    }
    void vorgang.ergebnis
      .then((eintraege) => {
        if (!aktiv || angefordert !== generation.current) return;
        gueltig.current = eintraege;
        setBestand(eintraege);
        setFehler(!istImportindexSuchbestandVollstaendig(eintraege));
      })
      .catch((ursache: unknown) => {
        console.error('Importindexsuche fehlgeschlagen:', ursache);
        if (aktiv && angefordert === generation.current) setFehler(true);
      });
    return () => {
      aktiv = false;
    };
  }, [bedarf, invalidierung]);
  return {
    bestand,
    fehler: bedarf && fehler,
    wartet: bedarf && !bestand && !fehler,
    // Auch ein Signal unmittelbar vor Auswahl sperrt die noch gerenderte Zeile.
    istAktuell: () => aktiv.current && generation.current === invalidierung,
  };
}
