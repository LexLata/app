// markierungskonflikteSpeicher.fensterOeffnen.ts
//
// Plant das Öffnen des Markierungskonflikte-Fensters bei neu entdeckten
// Konflikten. Aufrufer ist fuehrePruefungAus() in
// markierungskonflikteSpeicher.pruefdurchlauf.ts.
//
// Die Prüfkette wird in markierungskonflikteSpeicher.pruefkette.ts fortgesetzt;
// ihr Zustand liegt in markierungskonflikteSpeicher.zustand.ts. Der Aufrufer
// übergibt dessen liesPruefungsKette als Getter, damit jeder Schleifendurchlauf
// auch zwischenzeitlich eingereihte Prüfaufträge berücksichtigt.
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';

import { istSpeicherBatchRuhig } from '@/lib/persistenz/gesetz/gesetz.index';

const WARTE_TIMEOUT_MS = 30_000;

/**
 * Stößt das Öffnen des Markierungskonflikte-Fensters an – aber erst, wenn
 * WIRKLICH alles zur Ruhe gekommen ist: kein Speicher-/Lösch-Batch mehr
 * läuft und kein Debounce-Timer mehr aussteht (istSpeicherBatchRuhig() aus
 * gesetzSpeicherEreignisse.ts) UND die pruefungsKette seit der letzten
 * Prüfung unverändert blieb. Beide müssen GLEICHZEITIG gelten, da sie sich
 * gegenseitig neu auslösen können (z.B. beendet sich die Kette genau in dem
 * Moment, in dem ein neuer Speichervorgang beginnt) – daher wiederholtes
 * Polling, bis ein voller Durchlauf ohne Änderung bleibt. Läuft bewusst
 * AUSSERHALB der Kette selbst (nicht awaited von fuehrePruefungAus), sonst
 * würde das Warten auf die Kette die Kette selbst blockieren (Deadlock: der
 * aktuelle Lauf müsste auf sich selbst warten).
 *
 * Beheben zwei verwandte Bugs:
 * 1. Zwei kurz hintereinander eingereihte fuehrePruefungAus()-Läufe: öffnete
 *    der ERSTE Lauf das Fenster sofort nach dem eigenen Schreiben, war der
 *    ZWEITE (bereits angehängt, aber noch nicht fertig) beim Lesen oft noch
 *    nicht abgeschlossen – ein Gesetz fehlte dann komplett in der Anzeige.
 * 2. Reines Ketten-Beobachten (siehe (1)) erkennt nur bereits EINGEREIHTE
 *    Läufe – nicht, dass noch ein Speichervorgang LÄUFT oder der
 *    200ms-Debounce-Timer erst NOCH einen weiteren Lauf einreihen WIRD. War
 *    die Kette in diesem Moment zufällig gerade leer, öffnete sich das
 *    Fenster, bevor die eigentliche Sammelprüfung überhaupt gestartet war.
 *
 * `holeAktuelleKette` liefert bei jedem Aufruf das aktuelle Kettenende aus
 * markierungskonflikteSpeicher.zustand.ts, keinen einmaligen Schnappschuss.
 */
export function planeFensterOeffnen(holeAktuelleKette: () => Promise<void>): void {
  void (async () => {
    const start = Date.now();
    for (;;) {
      const referenz = holeAktuelleKette();
      await referenz;
      const ruhig = istSpeicherBatchRuhig() && referenz === holeAktuelleKette();
      if (ruhig || Date.now() - start > WARTE_TIMEOUT_MS) break;
      // Kurze Pause, damit ein GERADE erst gestarteter Speichervorgang bzw.
      // ein GERADE erst geplanter Nachlauf-Timer Gelegenheit hat, sich in
      // laufendeSpeichervorgaenge/nachlaufTimer bzw. der pruefungsKette
      // niederzuschlagen, bevor der nächste Durchlauf erneut prüft.
      await new Promise((r) => setTimeout(r, 50));
    }
    await meldeNeueMarkierungskonflikte();
  })();
}

// Öffnet (best-effort) das eigenständige Markierungskonflikte-Fenster –
// Singleton mit festem Label (siehe fenster.rs:
// markierungskonflikte_fenster_oeffnen), holt sich seine Daten beim Öffnen
// selbst über ladeMarkierungskonflikteFuerAnzeige() (kein Kontext-Transfer
// nötig, anders als beim Verweismarkierung-/Kommentar-Fenster).
async function meldeNeueMarkierungskonflikte(): Promise<void> {
  try {
    await rufeBefehl('markierungskonflikte_fenster_oeffnen');
  } catch {
    // nicht in Tauri-Umgebung – kein Fehler.
  }
}
