// praefixlaufDiagnose.test.ts
// Laufende Vorgänge bleiben sichtbar; nach Abschluss endet die Wartemeldung.
import { expect, it, vi } from 'vitest';
import { beobachtePraefixlauf } from '@/lib/import/quelldateien/quelldateien.index';
it('meldet Schritt und Wartezeit und beendet den Timer zuverlässig', async () => {
  vi.useFakeTimers();
  try {
    const ausgabe = vi.fn();
    const diagnose = beobachtePraefixlauf('LBO', ausgabe);
    await diagnose.schritt('Abruf');
    await vi.advanceTimersByTimeAsync(10000);
    expect(ausgabe).toHaveBeenCalledWith(
      'LBO: wartet weiterhin bei „Abruf“ (10 s, insgesamt 10 s)',
    );
    await diagnose.schritt('Verweistagging');
    await vi.advanceTimersByTimeAsync(10000);
    expect(ausgabe).toHaveBeenLastCalledWith(
      'LBO: wartet weiterhin bei „Verweistagging“ (10 s, insgesamt 20 s)',
    );
    diagnose.beenden();
    const anzahl = ausgabe.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30000);
    expect(ausgabe).toHaveBeenCalledTimes(anzahl);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
it('wartet die Ausgabe eines Schritts vor der nachfolgenden Arbeit ab', async () => {
  let fertig!: () => void;
  const ausgabe = new Promise<void>((resolve) => {
    fertig = resolve;
  });
  const diagnose = beobachtePraefixlauf('LBO', () => ausgabe);
  const folgearbeit = vi.fn();
  try {
    const schritt = diagnose.schritt('Konvertierung').then(folgearbeit);
    await Promise.resolve();
    expect(folgearbeit).not.toHaveBeenCalled();
    fertig();
    await schritt;
    expect(folgearbeit).toHaveBeenCalledOnce();
  } finally {
    diagnose.beenden();
  }
});
