// ereignisAnbindung.ts
// Explizite Tauri-Reichweite und abbrechbare asynchrone Listeneranmeldung.
import { getCurrentWebview } from '@tauri-apps/api/webview';
import type { Event, EventCallback, UnlistenFn } from '@tauri-apps/api/event';
import type { FensterEreignisse, GlobaleEreignisse } from './ereignisVertraege';

export interface EreignisAnmeldung {
  /** Fertige Anmeldung; Fehler werden weitergegeben. */
  bereit: Promise<void>;
  /** Sofort wirksam und wiederholbar, auch vor fertiger Anmeldung. */
  abmelden: () => void;
}
function anmelden<T>(
  registrieren: (handler: EventCallback<T>) => Promise<UnlistenFn>,
  handler: (event: Event<T>) => void,
): EreignisAnmeldung {
  let aktiv = true;
  let unlisten: UnlistenFn | undefined;
  const abmelden = () => {
    if (!aktiv) return;
    aktiv = false;
    const fn = unlisten;
    unlisten = undefined;
    meldeNativAb(fn);
  };
  const bereit = registrieren((event) => {
    if (aktiv) handler(event);
  }).then((fn) => {
    if (aktiv) unlisten = fn;
    else meldeNativAb(fn);
  });
  return { bereit, abmelden };
}
function meldeNativAb(fn: UnlistenFn | undefined): void {
  try {
    fn?.();
  } catch (fehler) {
    console.error('Fensterlistener konnte nicht nativ abgemeldet werden:', fehler);
  }
}
export function hoereGlobal<K extends keyof GlobaleEreignisse>(
  name: K,
  handler: (event: Event<GlobaleEreignisse[K]>) => void,
): EreignisAnmeldung {
  return anmelden(async (callback) => {
    const { listen } = await import('@tauri-apps/api/event');
    return listen(name, callback);
  }, handler);
}
export function hoereImEigenenFenster<K extends keyof FensterEreignisse, Aktion = unknown>(
  name: K,
  handler: (event: Event<FensterEreignisse<Aktion>[K]>) => void,
): EreignisAnmeldung {
  return anmelden(async (callback) => {
    return getCurrentWebview().listen(name, callback);
  }, handler);
}
export async function sendeGlobal<K extends keyof GlobaleEreignisse>(
  name: K,
  payload: GlobaleEreignisse[K],
): Promise<void> {
  const { emitTo } = await import('@tauri-apps/api/event');
  await emitTo({ kind: 'Any' }, name, payload);
}
export async function sendeAnFenster<K extends keyof FensterEreignisse, Aktion = unknown>(
  label: string,
  name: K,
  payload: FensterEreignisse<Aktion>[K],
): Promise<void> {
  const { emitTo } = await import('@tauri-apps/api/event');
  await emitTo(label, name, payload);
}
