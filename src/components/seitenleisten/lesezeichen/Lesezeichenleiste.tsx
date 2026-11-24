// Lesezeichenleiste.tsx
// Gruppierte Lesezeichenzeilen; der gemeinsame Rahmen trägt das Layout.
import { useSyncExternalStore } from 'react';
import {
  abonniereSpeicherbareNorm,
  liesSpeicherbareNorm,
} from '@/lib/domain/aktives-element/aktives-element.index';
import { useMemo } from 'react';
import { baueZeilen, GAP_KOPF, lesezeichenTastenkuerzelInfo } from './lesezeichenHilfen';
import { LesezeichenKopf, LesezeichenItem } from './Lesezeichen';
import {
  Seitenleiste,
  type SeitenleistenRahmenProps,
} from '@/components/seitenleisten/Seitenleiste';
import { gesetzesreferenzSchluessel, istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { Lesezeichen } from '@/lib/persistenz/nutzerdaten/lesezeichenSpeicher';
import { usePlattform } from '@/hooks/utils/usePlattform';
interface LesezeichenleisteProps extends SeitenleistenRahmenProps {
  eintraege: Lesezeichen[];
  onKlick: (bezeichnung: string, gesetz: Gesetzesreferenz) => void;
  seitenleistenTastenkuerzel: boolean;
}
export function Lesezeichenleiste({
  eintraege,
  onKlick,
  fontGroesse = 11,
  seitenleistenTastenkuerzel,
  seite,
  schnellaktionen,
  schnellaktionenAnzahl,
}: LesezeichenleisteProps) {
  const aktiveNorm = useSyncExternalStore(abonniereSpeicherbareNorm, liesSpeicherbareNorm);
  const { istMac } = usePlattform();
  const zeilen = useMemo(() => baueZeilen(eintraege), [eintraege]);
  const layoutAngaben = useMemo(
    () => ({
      erlaubteTeilungen: zeilen.flatMap((zeile, i) =>
        zeile.typ === 'eintrag' && i + 1 < zeilen.length ? [i + 1] : [],
      ),
      hoehenFaktoren: zeilen.map((zeile) =>
        zeile.typ === 'kopf' && !zeile.ersteGesetzeszeile ? 0.5 : 1,
      ),
      zusatzabstaende: zeilen.map((zeile) =>
        zeile.typ === 'kopf' && zeile.ersteGesetzeszeile ? GAP_KOPF : 0,
      ),
    }),
    [zeilen],
  );
  const renderSpalte = (
    von: number,
    bis: number,
    lineHeight: number,
    paddingBlock: number,
    zeilenMehrhoehe: number,
  ) =>
    zeilen.slice(von, bis).map((zeile, i) => {
      if (zeile.typ === 'kopf') {
        return (
          <LesezeichenKopf
            key={`kopf-${gesetzesreferenzSchluessel(zeile.gesetz)}-${von + i}`}
            text={zeile.text}
            ersteGesetzeszeile={zeile.ersteGesetzeszeile}
            ersteZeile={i === 0}
            folgezeilenReduktion={zeilenMehrhoehe / 2}
            fontGroesse={fontGroesse}
            lineHeight={lineHeight}
            paddingBlock={paddingBlock}
          />
        );
      }
      return (
        <LesezeichenItem
          key={`${gesetzesreferenzSchluessel(zeile.eintrag.gesetz)}-${zeile.eintrag.bezeichnung}`}
          eintrag={zeile.eintrag}
          aktiv={
            !!aktiveNorm &&
            aktiveNorm.bezeichnung === zeile.eintrag.bezeichnung &&
            istGleichesGesetz(aktiveNorm.gesetz, zeile.eintrag.gesetz)
          }
          tastenkuerzel={lesezeichenTastenkuerzelInfo(zeile.tastenkuerzelIndex, istMac)}
          fontGroesse={fontGroesse}
          lineHeight={lineHeight}
          paddingBlock={paddingBlock}
          onKlick={() => onKlick(zeile.eintrag.bezeichnung, zeile.eintrag.gesetz)}
          kuerzelAnzeigen={seitenleistenTastenkuerzel}
        />
      );
    });

  return (
    <Seitenleiste
      seite={seite}
      schnellaktionen={schnellaktionen}
      schnellaktionenAnzahl={schnellaktionenAnzahl}
      fontGroesse={fontGroesse}
      anzahl={zeilen.length}
      layoutAngaben={layoutAngaben}
      renderSpalte={renderSpalte}
    />
  );
}
