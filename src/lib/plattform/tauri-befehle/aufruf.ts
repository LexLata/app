// Einziger nativer Befehlszugang; Name bestimmt Argumente und Antwort.
import { invoke } from '@tauri-apps/api/core';
import type { Befehlsname, Befehlsverzeichnis } from './befehle';

export function rufeBefehl<N extends Befehlsname>(
  name: N,
  ...argumente: Record<string, never> extends Befehlsverzeichnis[N]['argumente']
    ? [argumente?: Befehlsverzeichnis[N]['argumente']]
    : [argumente: Befehlsverzeichnis[N]['argumente']]
): Promise<Befehlsverzeichnis[N]['ergebnis']> {
  // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Keine Textanzeige: der einzige getypte Transport reicht Befehlsargumente durch; sichtbare Texte schützt der jeweilige native Anzeigehelfer vor dem Aufruf.
  return invoke<Befehlsverzeichnis[N]['ergebnis']>(name, ...argumente);
}
