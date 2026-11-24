// FIFO-Sperre pro Pfad für Überlappungstests der Speicherschicht.
import type { mitDateiSperre, mitDateiSperren } from '@/lib/persistenz/kern/kern.index';

export function erzeugeSperreAttrappe(): typeof mitDateiSperre {
  const wartende = new Map<string, Promise<void>>();
  let tokenNummer = 0;
  return async (pfad, aktion) => {
    const schluessel = pfad.toLowerCase();
    const vorherige = wartende.get(schluessel) ?? Promise.resolve();
    let freigeben!: () => void;
    const fertig = new Promise<void>((resolve) => {
      freigeben = resolve;
    });
    wartende.set(schluessel, fertig);
    await vorherige;
    try {
      return await aktion(`test-token-${++tokenNummer}`);
    } finally {
      freigeben();
      if (wartende.get(schluessel) === fertig) wartende.delete(schluessel);
    }
  };
}

/** Mehrere Pfade verwenden dieselbe FIFO-Attrappe wie einzelne Dateizugriffe. */
export function erzeugeMehrfachSperreAttrappe(
  sperre: typeof mitDateiSperre,
): typeof mitDateiSperren {
  return async (pfade, aktion, meldung) => {
    const sortiert = [...new Set(pfade)].sort();
    const tokens = new Map<string, string>();
    const erwerben = async (index: number): ReturnType<typeof aktion> => {
      const pfad = sortiert[index];
      if (pfad === undefined) return aktion(tokens);
      return sperre(
        pfad,
        async (token) => {
          tokens.set(pfad, token);
          return erwerben(index + 1);
        },
        meldung,
      );
    };
    return erwerben(0);
  };
}
