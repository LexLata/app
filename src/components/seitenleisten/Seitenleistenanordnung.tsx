// Seitenleistenanordnung.tsx
// Verteilt Listen und Schnellaktionen; der Textbereich bleibt an derselben Position.
import { useLayoutEffect, type ComponentProps, type ReactElement } from 'react';
import { meldeScrollDiagnose } from '@/lib/utils/scrollAufzeichnungDiagnose';
import { Favoritenleiste } from './favoriten/Favoritenleiste';
import { Lesezeichenleiste } from './lesezeichen/Lesezeichenleiste';
import {
  FavoritSchnellaktion,
  LesezeichenSchnellaktion,
  Schnellaktionen,
  type SchnellaktionenProps,
} from './Schnellaktionen';
type ListenProps<T> = Omit<T, 'seite' | 'schnellaktionen' | 'schnellaktionenAnzahl'>;
interface SeitenleistenanordnungProps {
  leistenTauschen: boolean;
  minimal: boolean;
  favoriten: ListenProps<ComponentProps<typeof Favoritenleiste>>;
  lesezeichen: ListenProps<ComponentProps<typeof Lesezeichenleiste>>;
  schnellaktionen: SchnellaktionenProps;
  einfuehrungAktiv: boolean;
  einfuehrungFavoritErlaubt: boolean;
  children: ReactElement;
}
export function Seitenleistenanordnung({
  leistenTauschen,
  minimal,
  favoriten,
  lesezeichen,
  schnellaktionen,
  einfuehrungAktiv,
  einfuehrungFavoritErlaubt,
  children,
}: SeitenleistenanordnungProps) {
  const hatFavoriten = favoriten.eintraege.length > 0;
  const hatLesezeichen = lesezeichen.eintraege.length > 0;
  const linkeAktionen = (
    <Schnellaktionen
      gesetzOffen={schnellaktionen.gesetzOffen}
      lesezeichen={schnellaktionen.lesezeichen}
      favoritenleisteSichtbar={hatFavoriten}
      onFavoritKlick={schnellaktionen.onFavoritKlick}
      onLesezeichenKlick={schnellaktionen.onLesezeichenKlick}
      kannZuklappen={schnellaktionen.kannZuklappen}
      onZuklappenKlick={schnellaktionen.onZuklappenKlick}
      kannAufklappen={schnellaktionen.kannAufklappen}
      onAufklappenKlick={schnellaktionen.onAufklappenKlick}
      onSucheKlick={schnellaktionen.onSucheKlick}
      einfuehrungErlaubt={schnellaktionen.einfuehrungErlaubt}
      leistenTauschen={leistenTauschen}
      hatLesezeichen={hatLesezeichen}
    />
  );
  const rechteAktion = leistenTauschen ? (
    <LesezeichenSchnellaktion
      gesetzOffen={schnellaktionen.gesetzOffen}
      lesezeichen={schnellaktionen.lesezeichen}
      onLesezeichenKlick={schnellaktionen.onLesezeichenKlick}
      erlaubt={schnellaktionen.einfuehrungErlaubt?.lesezeichen}
      hervorheben={einfuehrungAktiv}
    />
  ) : (
    <FavoritSchnellaktion
      onFavoritKlick={schnellaktionen.onFavoritKlick}
      einfuehrungFavoritErlaubt={einfuehrungFavoritErlaubt}
      einfuehrungAktiv={einfuehrungAktiv}
    />
  );
  const linksHatInhalt = leistenTauschen ? hatFavoriten : hatLesezeichen;
  const rechtsHatInhalt = leistenTauschen ? hatLesezeichen : hatFavoriten;
  const linksAnzahl = minimal ? 0 : rechtsHatInhalt ? 4 : 5;
  const favoritenleiste = (seite: 'links' | 'rechts', aktionen: ReactElement, anzahl: number) => (
    <Favoritenleiste
      gesetz={favoriten.gesetz}
      eintraege={favoriten.eintraege}
      onKlick={favoriten.onKlick}
      fontGroesse={favoriten.fontGroesse}
      seitenleistenTastenkuerzel={favoriten.seitenleistenTastenkuerzel}
      seite={seite}
      schnellaktionenAnzahl={anzahl}
      schnellaktionen={aktionen}
    />
  );
  const lesezeichenleiste = (seite: 'links' | 'rechts', aktionen: ReactElement, anzahl: number) => (
    <Lesezeichenleiste
      eintraege={lesezeichen.eintraege}
      onKlick={lesezeichen.onKlick}
      fontGroesse={lesezeichen.fontGroesse}
      seitenleistenTastenkuerzel={lesezeichen.seitenleistenTastenkuerzel}
      seite={seite}
      schnellaktionenAnzahl={anzahl}
      schnellaktionen={aktionen}
    />
  );
  const linkeLeiste: ReactElement | null =
    linksHatInhalt || !minimal
      ? (leistenTauschen ? favoritenleiste : lesezeichenleiste)('links', linkeAktionen, linksAnzahl)
      : null;
  const rechteLeiste: ReactElement | null = rechtsHatInhalt
    ? (leistenTauschen ? lesezeichenleiste : favoritenleiste)(
        'rechts',
        rechteAktion,
        minimal ? 0 : 1,
      )
    : null;
  const leistenDiagnose = `${seitenleistenLage(linkeLeiste, rechteLeiste)};lesezeichen=${hatLesezeichen};favoriten=${hatFavoriten};minimal=${minimal};getauscht=${leistenTauschen}`;
  useLayoutEffect(() => {
    meldeScrollDiagnose({ art: 'seitenleisten-geaendert', zustand: leistenDiagnose });
  }, [leistenDiagnose]);
  return (
    <div
      data-messlauf-seitenleisten={import.meta.env.DEV ? leistenDiagnose : undefined}
      style={{ flex: 1, overflow: 'hidden', display: 'flex' }}
    >
      {linkeLeiste}
      {children}
      {rechteLeiste}
    </div>
  );
}

/** Beschreibt ausschließlich die gerenderten Leisten für die Entwicklungsdiagnose. */
function seitenleistenLage(links: ReactElement | null, rechts: ReactElement | null) {
  return `${links ? 'links' : '-'}:${rechts ? 'rechts' : '-'}`;
}
