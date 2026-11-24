// useSeitenleistenStatus.ts
// Bündelt den gemeldeten Status der Gesetzestextansicht für Leisten und Einführung.
import { useEffect, useState } from 'react';

export function useSeitenleistenStatus(gesetzOffen: boolean) {
  // Gesetzestextansicht meldet reaktiven Favoriten- und Klappstufenstatus für Leiste und Einführung.
  const [favoritenStatus, setFavoritenStatus] = useState<{
    istAktuellFavorit: boolean;
    favoritenleisteSichtbar: boolean;
    favoritenEintraege: { bezeichnung: string; xmlId: string }[];
    favoritAufrufen: (xmlId: string) => void;
  }>({
    istAktuellFavorit: false,
    favoritenleisteSichtbar: false,
    favoritenEintraege: [],
    favoritAufrufen: () => {},
  });
  const [klappstufenStatus, setKlappstufenStatus] = useState<{
    zuklappen: () => void;
    aufklappen: () => void;
    kannZuklappen: boolean;
    kannAufklappen: boolean;
  }>({
    zuklappen: () => {},
    aufklappen: () => {},
    kannZuklappen: false,
    kannAufklappen: false,
  });

  // Ohne Gesetz meldet die unmontierte Gesetzestextansicht keinen neuen Status.
  useEffect(() => {
    if (gesetzOffen) return;
    setFavoritenStatus({
      istAktuellFavorit: false,
      favoritenleisteSichtbar: false,
      favoritenEintraege: [],
      favoritAufrufen: () => {},
    });
    setKlappstufenStatus({
      zuklappen: () => {},
      aufklappen: () => {},
      kannZuklappen: false,
      kannAufklappen: false,
    });
  }, [gesetzOffen]);

  return { favoritenStatus, setFavoritenStatus, klappstufenStatus, setKlappstufenStatus };
}
