// hauptfensterHinweise.ts
// Native Annahme und fensterlokaler, bestätigter Empfang serialisierbarer Hinweise.
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';
import { alsFehler } from '@/lib/utils/fehler';
import { isTauri } from '@tauri-apps/api/core';
import { hoereImEigenenFenster, type EreignisAnmeldung } from './ereignisAnbindung';
import type { MeldungsGrund } from '@/lib/domain/app/aktionsMeldung';

/** Einzelmeldung eines Vorgangs; das Hauptfenster gliedert alle Meldungen eines Hinweises gemeinsam. */
export interface HauptfensterMeldung {
  text: string;
  typ: 'info' | 'warnung' | 'fehler';
  grund?: MeldungsGrund;
  betroffen?: string;
  detail?: string;
  /** Sicherungsdatei relativ zum Datenordner; nur für den Sicherungshinweis, nie im Text. */
  sicherung?: string;
}

/** `text`/`typ` fassen zusammen; `meldungen` trägt optional alle Meldungen einer Aktion. */
export interface HauptfensterHinweis {
  text: string;
  typ: 'info' | 'warnung' | 'fehler';
  meldungen?: HauptfensterMeldung[];
}

/** Ein Hinweis für alle Meldungen einer Aktion (gleicher Wortlaut einmal, schwerster Typ). */
export function hinweisAusMeldungen(
  meldungen: readonly HauptfensterMeldung[],
): HauptfensterHinweis | undefined {
  const eindeutig = meldungen.filter(
    (m, i) => meldungen.findIndex((n) => n.text === m.text && n.typ === m.typ) === i,
  );
  if (!eindeutig.length) return undefined;
  return {
    text: [...new Set(eindeutig.map((m) => m.text))].join('\n'),
    typ: eindeutig.some((m) => m.typ === 'fehler')
      ? 'fehler'
      : eindeutig.some((m) => m.typ === 'warnung')
        ? 'warnung'
        : 'info',
    meldungen: eindeutig.map(({ text, typ, grund, betroffen, detail, sicherung }) => ({
      text,
      typ,
      ...(grund ? { grund } : {}),
      ...(betroffen ? { betroffen } : {}),
      ...(detail ? { detail } : {}),
      ...(sicherung ? { sicherung } : {}),
    })),
  };
}
interface Uebergabe {
  kennung: string;
  hinweis: HauptfensterHinweis;
}
const WARTEFRIST = 30_000;
const WIEDERHOLUNG = 250;
// Überlebt die erneute Effect-Anmeldung (StrictMode); nach der nativen Auftragsfrist
// kann dieselbe Sendung nicht mehr erneut ausgeliefert werden. Keine Bannerzustände.
const uebernommen = new Map<string, number>();
let letzteAnmeldung = Promise.resolve();

function mitFrist<T>(aufruf: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(alsFehler(signal.reason));
      return;
    }
    const timer = setTimeout(
      () => reject(new Error('Zeitüberschreitung: Hauptfenster-Hinweis')),
      WARTEFRIST,
    );
    const abbrechen = () => {
      clearTimeout(timer);
      reject(alsFehler(signal?.reason));
    };
    signal?.addEventListener('abort', abbrechen, { once: true });
    void aufruf()
      .then(resolve, reject)
      .finally(() => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abbrechen);
      });
  });
}

/** Erfüllung bedeutet native Annahme, nicht bereits erfolgte Banneranzeige.
 * Ein Annahmefehler wird dem Aufrufer überlassen und darf keinen Schreibvorgang wiederholen. */
export async function sendeHauptfensterHinweis(
  hinweis: HauptfensterHinweis,
  oeffner?: string,
): Promise<void> {
  try {
    await mitFrist(() =>
      rufeBefehl('hauptfenster_hinweis_senden', {
        kennung: crypto.randomUUID(),
        hinweis: {
          text: hinweis.text,
          typ: hinweis.typ,
          ...(hinweis.meldungen?.length ? { meldungen: hinweis.meldungen } : {}),
        },
        oeffner,
      }),
    );
  } catch (fehler) {
    console.error('Hauptfenster-Hinweis konnte nicht angenommen werden:', fehler);
    throw fehler;
  }
}

/** Der Empfänger muss synchron in seinen Bannerstore übernehmen; erst danach
 * wird nativ bestätigt. Alle Aufträge und Empfängerentscheidungen bleiben nativ. */
export function empfangeHauptfensterHinweise(
  uebernehmen: (hinweis: HauptfensterHinweis) => undefined,
): EreignisAnmeldung {
  if (!isTauri()) return { bereit: Promise.resolve(), abmelden: () => {} };
  const anmeldung = crypto.randomUUID();
  const empfangsende = new AbortController();
  let aktiv = true;
  let angemeldet = false;
  let abgemeldet = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fehlerSeit: number | undefined;
  let abrufLaeuft = false;
  let erneutAbrufen = false;
  let listener: EreignisAnmeldung | undefined;
  const nativAbmelden = async () => {
    if (abgemeldet) return;
    abgemeldet = true;
    try {
      await mitFrist(() => rufeBefehl('hauptfenster_hinweise_abmelden', { anmeldung }));
    } catch (fehler) {
      console.error('Hauptfenster-Hinweisempfang konnte nicht abgemeldet werden:', fehler);
    }
  };
  const abmelden = () => {
    aktiv = false;
    empfangsende.abort();
    clearTimeout(timer);
    listener?.abmelden();
    if (angemeldet) void nativAbmelden();
  };
  const uebernehmeUndBestaetige = async (
    daten: Uebergabe[],
    begonnen: number,
  ): Promise<unknown> => {
    let fehlerImAbruf: unknown;
    for (const { kennung, hinweis } of daten) {
      if (!aktiv || Date.now() - begonnen >= WARTEFRIST) return fehlerImAbruf;
      try {
        if (!uebernommen.has(kennung)) {
          uebernehmen(hinweis);
          uebernommen.set(kennung, Date.now());
        }
        await mitFrist(
          () => rufeBefehl('hauptfenster_hinweis_bestaetigen', { anmeldung, kennung }),
          empfangsende.signal,
        );
      } catch (fehler) {
        fehlerImAbruf = fehler;
      }
    }
    return fehlerImAbruf;
  };
  const abrufen = async () => {
    if (!aktiv || !angemeldet) return;
    if (abrufLaeuft) {
      erneutAbrufen = true;
      return;
    }
    clearTimeout(timer);
    abrufLaeuft = true;
    erneutAbrufen = false;
    const begonnen = Date.now();
    let fehlerImAbruf: unknown;
    for (const [kennung, zeit] of uebernommen) {
      if (begonnen - zeit > WARTEFRIST * 2) uebernommen.delete(kennung);
    }
    try {
      const daten = await mitFrist(
        () => rufeBefehl('hauptfenster_hinweise_lesen', { anmeldung }),
        empfangsende.signal,
      );
      fehlerImAbruf = await uebernehmeUndBestaetige(daten, begonnen);
    } catch (fehler) {
      fehlerImAbruf = fehler;
    }
    abrufLaeuft = false;
    if (!aktiv) return;
    if (fehlerImAbruf !== undefined) {
      if (fehlerSeit === undefined) {
        fehlerSeit = begonnen;
        console.error('Hauptfenster-Hinweisübernahme fehlgeschlagen:', fehlerImAbruf);
      }
      if (Date.now() - fehlerSeit >= WARTEFRIST) {
        console.error('Hauptfenster-Hinweisempfang nach anhaltendem Fehler beendet.');
        abmelden();
        return;
      }
    } else fehlerSeit = undefined;
    if (fehlerImAbruf !== undefined) {
      timer = setTimeout(() => void abrufen(), WIEDERHOLUNG);
    } else if (erneutAbrufen) void abrufen();
  };
  // Serialisiert eine verspätete Anmeldung samt Cleanup vor der nächsten
  // Effect-Anmeldung; ein alter Empfänger verdrängt dadurch keinen neuen.
  const bereit = letzteAnmeldung.then(async () => {
    if (!aktiv) return;
    try {
      listener = hoereImEigenenFenster('hauptfenster-hinweise-verfuegbar', () => {
        void abrufen();
      });
      await listener.bereit;
      if (!aktiv) {
        listener.abmelden();
        return;
      }
      await mitFrist(() => rufeBefehl('hauptfenster_hinweise_bereit', { anmeldung }));
      angemeldet = true;
      if (!aktiv) await nativAbmelden();
      else void abrufen();
    } catch (fehler) {
      aktiv = false;
      listener?.abmelden();
      await nativAbmelden();
      throw fehler;
    }
  });
  letzteAnmeldung = bereit.catch(() => {});
  return { bereit, abmelden };
}
