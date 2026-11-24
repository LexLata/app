// Liest native Fenstergeometrie.
import type { FensterGeometrie } from '@/lib/persistenz/fenster/fenster.index';

/** Liest Größe/Position/Maximiert-Status dieses Fensters aus, falls in Tauri-Umgebung. */
export async function aktuelleGeometrieLesen(): Promise<FensterGeometrie | undefined> {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const fenster = getCurrentWindow();
    // Im nativen Fullscreen meldet innerSize() die volle Bildschirmgröße
    // (eigener AppKit-Zustand, von isMaximized() NICHT erfasst). Würde das
    // hier ungefiltert gespeichert, "vergiftet" das sowohl den eigenen
    // Fenster-Zustand als auch – über letzteFensterGeometrieSpeichern –
    // die plattformweite Fallback-Geometrie, die für NEUE Fenster (⌘N,
    // Wiederherstellung ohne eigenen Zustand) herangezogen wird. Genau das
    // führte dazu, dass per ⌘N erzeugte Fenster bildschirmfüllend
    // erschienen, obwohl die Größen-Vererbung vom fokussierten Fenster
    // bereits in menu.rs gefiltert wurde – die Fallback-Datei war über
    // diesen Weg trotzdem bereits "vergiftet".
    if (await fenster.isFullscreen()) return undefined;
    const groesse = await fenster.innerSize();
    const position = await fenster.outerPosition();
    const maximiert = await fenster.isMaximized();
    return {
      breite: groesse.width,
      hoehe: groesse.height,
      x: position.x,
      y: position.y,
      maximiert,
    };
  } catch {
    return undefined; // nicht in Tauri-Umgebung
  }
}
