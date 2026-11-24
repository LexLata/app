// Ein Wiederherstellungshinweis pro Start; nur main.tsx im Desktop-Hauptfenster ruft ihn auf.
import { zeigeBanner } from './bannerStore';

let hinweisBereitsGezeigt = false;

export function zeigeEinstellungenBackupBannerEinmal(): void {
  if (hinweisBereitsGezeigt) return;
  hinweisBereitsGezeigt = true;
  zeigeBanner({
    art: 'dateibefunde',
    typ: 'info',
    text: 'Einstellungen aus der Sicherung wiederhergestellt.',
  });
}
