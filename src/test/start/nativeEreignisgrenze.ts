// Native IPC-Grenze für Ereignisanmeldungen auch bei dynamischem Tauri-Import.
import type { EventCallback } from '@tauri-apps/api/event';
export function richteNativeEreignisgrenzeEin(
  weitereBefehle: (befehl: string, argumente?: Record<string, unknown>) => Promise<unknown>,
  anmelden: (name: string, callback: EventCallback<unknown>) => Promise<() => void> = async () =>
    () => {},
  senden: (
    befehl: string,
    argumente?: Record<string, unknown>,
  ) => Promise<unknown> = async () => {},
  label = 'main',
) {
  let nummer = 0;
  const callbacks = new Map<number, EventCallback<unknown>>();
  const abmeldungen = new Map<number, () => void>();
  Object.assign(window, {
    __TAURI_INTERNALS__: {
      metadata: { currentWindow: { label }, currentWebview: { label } },
      transformCallback: (callback: EventCallback<unknown>) => {
        callbacks.set(++nummer, callback);
        return nummer;
      },
      invoke: async (befehl: string, argumente?: Record<string, unknown>) => {
        if (befehl === 'plugin:event|listen') {
          const id = Number(argumente?.handler);
          const callback = callbacks.get(id);
          if (callback) abmeldungen.set(id, await anmelden(String(argumente?.event), callback));
          return id;
        }
        if (befehl === 'plugin:event|unlisten') {
          const id = Number(argumente?.eventId);
          abmeldungen.get(id)?.();
          abmeldungen.delete(id);
          callbacks.delete(id);
          return;
        }
        if (befehl === 'plugin:event|emit' || befehl === 'plugin:event|emit_to')
          return senden(befehl, argumente);
        return weitereBefehle(befehl, argumente);
      },
    },
    __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
  });
}
