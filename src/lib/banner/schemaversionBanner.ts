// Hält die einmalige Anzeige des Schemaversion-Hinweises im Hauptfenster.
import { zeigeBanner } from './bannerStore';

let hinweisBereitsGezeigt = false;

export function zeigeSchemaversionBannerEinmal(): void {
  if (hinweisBereitsGezeigt) return;
  hinweisBereitsGezeigt = true;
  zeigeBanner({
    art: 'systemfehler',
    typ: 'warnung',
    text: 'Mindestens eine Datei hat eine andere LexLata-Schemaversion. Bitte prüfen Sie, ob eine Aktualisierung der App verfügbar ist.',
  });
}
