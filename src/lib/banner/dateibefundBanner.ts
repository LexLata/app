// dateibefundBanner.ts
// Sich erweiterndes Banner der Bannerart Dateibefunde: Solange es offen ist,
// kommen alle Dateibefunde des Fensters hinzu und werden neu gegliedert.
// Wurde es geschlossen, beginnt der nächste Befund ein neues Banner.
import { erzeugeErweiterbaresBanner, zeigeBanner, type BannerAktion } from './bannerStore';
import { oeffneDatenordner } from '@/lib/plattform/datenordner';
import { plattformFallsBekannt } from '@/lib/plattform/tauriHelpers';
import { gliedereVorgangsergebnis, type Vorgangsmeldung } from './aktionsMeldungsBanner';

/** Gleicher Befund = gleicher Grund und gleicher Betroffener; sonst (ohne Grund
 *  oder ohne Betroffenen) gleicher Grund bzw. keiner und gleicher Wortlaut. */
function gleicherBefund(a: Vorgangsmeldung, b: Vorgangsmeldung): boolean {
  if (a.grund && a.betroffen) return a.grund === b.grund && a.betroffen === b.betroffen;
  return !(b.grund && b.betroffen) && a.grund === b.grund && a.text === b.text && a.typ === b.typ;
}

const DESKTOP = new Set(['macos', 'windows', 'linux']);

/** „Datenordner öffnen“ bei Sicherungen, nur auf dem Desktop; bei genau
 *  einer Sicherung deren Ordner. Fehler beim Öffnen → Bedienhinweis. */
function datenordnerAktion(meldungen: readonly Vorgangsmeldung[]): BannerAktion | undefined {
  const plattform = plattformFallsBekannt();
  if (!plattform || !DESKTOP.has(plattform)) return undefined;
  const sicherungen = meldungen.flatMap((m) => (m.sicherung ? [m.sicherung] : []));
  if (sicherungen.length === 0) return undefined;
  const datei = sicherungen.length === 1 ? sicherungen[0] : undefined;
  return {
    label: 'Datenordner öffnen',
    onClick: () => {
      oeffneDatenordner(datei).catch((fehler: unknown) => {
        console.error('Datenordner konnte nicht geöffnet werden:', fehler);
        zeigeBanner({
          art: 'bedienhinweis',
          typ: 'fehler',
          text: 'Der Datenordner konnte nicht geöffnet werden.',
        });
      });
    },
  };
}

const erweitereDateibefunde =
  erzeugeErweiterbaresBanner<readonly Vorgangsmeldung[]>('dateibefunde');

/** Fügt einen Dateibefund dem offenen Dateibefund-Banner hinzu oder beginnt ein neues. */
export function meldeDateibefund(meldung: Vorgangsmeldung): void {
  const vorgangsmeldung: Vorgangsmeldung = {
    text: meldung.text,
    typ: meldung.typ,
    grund: meldung.grund,
    betroffen: meldung.betroffen,
    detail: meldung.detail,
    sicherung: meldung.sicherung,
  };
  erweitereDateibefunde((bisher = []) => {
    const gleich = bisher.find((m) => gleicherBefund(m, vorgangsmeldung));
    if (gleich?.text === vorgangsmeldung.text) return undefined;
    // Ein gleicher Befund mit neuerem Wortlaut ersetzt den bisherigen Eintrag.
    const meldungen = gleich
      ? bisher.map((m) => (m === gleich ? vorgangsmeldung : m))
      : [...bisher, vorgangsmeldung];
    const ergebnis = gliedereVorgangsergebnis(meldungen);
    if (!ergebnis) return undefined;
    return {
      inhalt: {
        text: ergebnis.text,
        typ: ergebnis.typ,
        gliederung: ergebnis.gliederung,
        aktion: datenordnerAktion(meldungen),
      },
      daten: meldungen,
    };
  });
}
