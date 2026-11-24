// datumFormat.ts
// Gemeinsame Datumsformatierung für Anzeigezwecke. Ausgelagert aus
// GesetzInfoOverlay.tsx, da AktualisierenOverlay.tsx ("Zuletzt aktualisiert")
// denselben Lang-Datum+Kurz-Uhrzeit-Format braucht – zwei echte Aufrufer
// rechtfertigen die gemeinsame Stelle.

/** Datum lang + Uhrzeit kurz, z.B. "15. Juli 2026, 14:32". */
export function formatDatumLang(d: Date): string {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'long', timeStyle: 'short' }).format(d);
}

/** UTC-Datum nur für einen gültigen Kalendertag, auch in den Jahren 0–99. */
export function datumAusKalendertag(jahr: number, monat: number, tag: number): Date | undefined {
  const datum = new Date(0);
  datum.setUTCFullYear(jahr, monat - 1, tag);
  if (
    datum.getUTCFullYear() !== jahr ||
    datum.getUTCMonth() !== monat - 1 ||
    datum.getUTCDate() !== tag
  )
    return undefined;
  return datum;
}

/** Vollständiges gültiges ISO-Datum deutsch anzeigen; sonst Originaltext erhalten. */
export function formatAusfertigung(wert: string): string {
  const monat = /^(\d{4})-(\d{2})$/.exec(wert);
  if (monat) {
    const datum = datumAusKalendertag(Number(monat[1]), Number(monat[2]), 1);
    return datum
      ? new Intl.DateTimeFormat('de-DE', {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(datum)
      : wert;
  }
  const treffer = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wert);
  if (!treffer) return wert;
  const datum = datumAusKalendertag(Number(treffer[1]), Number(treffer[2]), Number(treffer[3]));
  return datum
    ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'long', timeZone: 'UTC' }).format(datum)
    : wert;
}
