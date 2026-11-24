// praefixlaufDiagnose.ts
// Zeitlich begrenzte Diagnose eines Gesetzes, keine Fortschrittsquelle.
export function beobachtePraefixlauf(
  kurztitel: string,
  ausgabe: (zeile: string) => void | Promise<void>,
) {
  const beginn = performance.now();
  let schritt = 'Beginn';
  let schrittbeginn = beginn;
  const timer = setInterval(() => {
    const jetzt = performance.now();
    const sekunden = (seit: number) => Math.floor((jetzt - seit) / 1000);
    void Promise.resolve(
      ausgabe(
        `${kurztitel}: wartet weiterhin bei „${schritt}“ (${sekunden(schrittbeginn)} s, insgesamt ${sekunden(beginn)} s)`,
      ),
    ).catch((fehler: unknown) => console.error('Präfixlauf-Diagnose fehlgeschlagen:', fehler));
  }, 10000);
  return {
    async schritt(this: void, neu: string) {
      schritt = neu;
      schrittbeginn = performance.now();
      await ausgabe(`${kurztitel}: ${neu}`);
    },
    beenden() {
      clearInterval(timer);
    },
  };
}
