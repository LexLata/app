// Schnellaktionen.tsx
// Zusammenstellung der Schnellaktionen mit den bestehenden Sperrregeln.
import { useSyncExternalStore } from 'react';
import {
  abonniereSpeicherbareNorm,
  liesSpeicherbareNorm,
} from '@/lib/domain/aktives-element/aktives-element.index';
import { istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import type { Lesezeichen } from '@/lib/persistenz/nutzerdaten/lesezeichenSpeicher';
import type { ReactElement } from 'react';
import { usePlattform } from '@/hooks/utils/usePlattform';
import { tastenkuerzelAnzeige } from '@/lib/plattform/tastenkuerzel/tastenkuerzel.index';
import {
  SeitenleistenIconButton,
  SternIcon,
  LesezeichenIcon,
  ZuklappenIcon,
  AufklappenIcon,
  SucheIcon,
} from './SeitenleistenAktionen';

export interface SchnellaktionenProps {
  /** Ob ein Gesetz geöffnet ist – alle Buttons außer Suche werden sonst grau. */
  gesetzOffen: boolean;
  leistenTauschen?: boolean;
  hatLesezeichen?: boolean;
  /** In der Standardanordnung steht der Stern bei vorhandenen Favoriten rechts. */
  favoritenleisteSichtbar: boolean;
  onFavoritKlick: () => void;
  lesezeichen: Lesezeichen[];
  onLesezeichenKlick: () => void;
  kannZuklappen: boolean;
  onZuklappenKlick: () => void;
  kannAufklappen: boolean;
  onAufklappenKlick: () => void;
  onSucheKlick: () => void;
  /** Während der Einführung (useEinfuehrung.ts) ist immer nur GENAU EIN
   *  Button erlaubt – die übrigen bleiben deaktiviert, damit der Nutzer
   *  nicht vorgreift. Undefined/alle-true außerhalb der Einführung (siehe
   *  App.tsx: Default-Objekt ohne Einschränkung). */
  einfuehrungErlaubt?: {
    suche: boolean;
    favorit: boolean;
    lesezeichen: boolean;
    zuklappen: boolean;
    aufklappen: boolean;
  };
}

const EINFUEHRUNG_KEINE_EINSCHRAENKUNG = {
  suche: true,
  favorit: true,
  lesezeichen: true,
  zuklappen: true,
  aufklappen: true,
};

export function Schnellaktionen({
  gesetzOffen,
  leistenTauschen = false,
  hatLesezeichen = false,
  favoritenleisteSichtbar,
  onFavoritKlick,
  lesezeichen,
  onLesezeichenKlick,
  kannZuklappen,
  onZuklappenKlick,
  kannAufklappen,
  onAufklappenKlick,
  onSucheKlick,
  einfuehrungErlaubt: einfuehrungErlaubtProp,
}: SchnellaktionenProps) {
  const { istMac } = usePlattform();
  const norm = useSyncExternalStore(abonniereSpeicherbareNorm, liesSpeicherbareNorm);
  const istAktuellFavorit = norm?.istFavorit ?? false;
  const einfuehrungErlaubt = einfuehrungErlaubtProp ?? EINFUEHRUNG_KEINE_EINSCHRAENKUNG;
  const hervorheben = !!einfuehrungErlaubtProp;
  const lesezeichenAktion: ReactElement = (
    <LesezeichenSchnellaktion
      gesetzOffen={gesetzOffen}
      lesezeichen={lesezeichen}
      onLesezeichenKlick={onLesezeichenKlick}
      erlaubt={einfuehrungErlaubt.lesezeichen}
      hervorheben={hervorheben}
    />
  );
  const buttonGruppe = (
    <>
      {leistenTauschen && !hatLesezeichen ? lesezeichenAktion : null}
      {leistenTauschen || !favoritenleisteSichtbar ? (
        <SeitenleistenIconButton
          icon={<SternIcon ausgefuellt={istAktuellFavorit} />}
          titel={`${norm ? `${norm.bezeichnung} ${istAktuellFavorit ? 'aus Favoriten entfernen' : 'als Favorit speichern'}` : 'Favorit speichern'} (${tastenkuerzelAnzeige('favorit-speichern', istMac)})`}
          onClick={onFavoritKlick}
          disabled={!gesetzOffen || !einfuehrungErlaubt.favorit}
          einfuehrungsZiel="favorit"
          hervorgehoben={hervorheben && einfuehrungErlaubt.favorit}
        />
      ) : null}
      {!leistenTauschen && lesezeichenAktion}
      <SeitenleistenIconButton
        icon={<ZuklappenIcon />}
        titel={`Zuklappen (${tastenkuerzelAnzeige('klappstufe-zuklappen', istMac)})`}
        onClick={onZuklappenKlick}
        disabled={!gesetzOffen || !kannZuklappen || !einfuehrungErlaubt.zuklappen}
        einfuehrungsZiel="zuklappen"
        hervorgehoben={hervorheben && einfuehrungErlaubt.zuklappen}
      />
      <SeitenleistenIconButton
        icon={<AufklappenIcon />}
        titel={`Aufklappen (${tastenkuerzelAnzeige('klappstufe-aufklappen', istMac)})`}
        onClick={onAufklappenKlick}
        disabled={!gesetzOffen || !kannAufklappen || !einfuehrungErlaubt.aufklappen}
        einfuehrungsZiel="aufklappen"
        hervorgehoben={hervorheben && einfuehrungErlaubt.aufklappen}
      />
      <SeitenleistenIconButton
        icon={<SucheIcon />}
        titel={`Gesetz oder Norm öffnen (${tastenkuerzelAnzeige('oeffnen', istMac)})`}
        onClick={onSucheKlick}
        betont
        disabled={!einfuehrungErlaubt.suche}
        einfuehrungsZiel="oeffnen"
        hervorgehoben={hervorheben && einfuehrungErlaubt.suche}
      />
    </>
  );

  return buttonGruppe;
}

export function FavoritSchnellaktion({
  onFavoritKlick,
  einfuehrungFavoritErlaubt = true,
  einfuehrungAktiv = false,
}: {
  onFavoritKlick: () => void;
  einfuehrungFavoritErlaubt?: boolean;
  einfuehrungAktiv?: boolean;
}) {
  const { istMac } = usePlattform();
  const norm = useSyncExternalStore(abonniereSpeicherbareNorm, liesSpeicherbareNorm);
  const istAktuellFavorit = norm?.istFavorit ?? false;
  return (
    <SeitenleistenIconButton
      icon={<SternIcon ausgefuellt={istAktuellFavorit} />}
      titel={`${norm ? `${norm.bezeichnung} ${istAktuellFavorit ? 'aus Favoriten entfernen' : 'als Favorit speichern'}` : 'Favorit speichern'} (${tastenkuerzelAnzeige('favorit-speichern', istMac)})`}
      onClick={onFavoritKlick}
      disabled={!einfuehrungFavoritErlaubt}
      einfuehrungsZiel="favorit"
      hervorgehoben={einfuehrungAktiv && einfuehrungFavoritErlaubt}
    />
  );
}

export function LesezeichenSchnellaktion({
  gesetzOffen,
  lesezeichen,
  onLesezeichenKlick,
  erlaubt = true,
  hervorheben = false,
}: Pick<SchnellaktionenProps, 'gesetzOffen' | 'lesezeichen' | 'onLesezeichenKlick'> & {
  erlaubt?: boolean;
  hervorheben?: boolean;
}) {
  const { istMac } = usePlattform();
  const norm = useSyncExternalStore(abonniereSpeicherbareNorm, liesSpeicherbareNorm);
  const istAktuellLesezeichen =
    !!norm &&
    lesezeichen.some(
      (l) => l.bezeichnung === norm.bezeichnung && istGleichesGesetz(l.gesetz, norm.gesetz),
    );
  return (
    <SeitenleistenIconButton
      icon={<LesezeichenIcon ausgefuellt={istAktuellLesezeichen} />}
      titel={`${norm ? `${norm.bezeichnung} ${istAktuellLesezeichen ? 'aus Lesezeichen entfernen' : 'als Lesezeichen speichern'}` : 'Lesezeichen speichern'} (${tastenkuerzelAnzeige('lesezeichen-speichern', istMac)})`}
      onClick={onLesezeichenKlick}
      disabled={!gesetzOffen || !erlaubt}
      einfuehrungsZiel="lesezeichen"
      hervorgehoben={hervorheben && erlaubt}
    />
  );
}
