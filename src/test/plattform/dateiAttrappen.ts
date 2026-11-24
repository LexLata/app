// Native Datei-I/O-Attrappen für echte Lade-/Speicherintegration mit einem flüchtigen Dateibestand.
export function dateiAttrappen(
  dateien: Map<string, string>,
  leseDatei: (pfad: string) => Promise<string>,
) {
  const relativ = (pfad: string) => pfad.replace('/daten/LexLata/', '');
  return {
    readTextFile: leseDatei,
    exists: async (pfad: string) => dateien.has(relativ(pfad)),
    mkdir: async () => {},
    readDir: async (ordner: string) => {
      const ordnerpfad = relativ(ordner);
      return [...dateien.keys()]
        .filter((pfad) => pfad.startsWith(`${ordnerpfad}/`))
        .map((pfad) => ({
          name: pfad.slice(ordnerpfad.length + 1),
          isDirectory: false,
          isFile: true,
        }));
    },
  };
}

/** Vollständige native Metadaten desselben flüchtigen Dateibestands. */
export function gesetzDateistempelAttrappe(dateien: Map<string, string>) {
  return [...dateien]
    .filter(([pfad]) => pfad.startsWith('gesetze/') && pfad.toLowerCase().endsWith('.xml'))
    .map(([pfad, inhalt]) => ({
      name: pfad.slice(8),
      dateistempel: { groesse: String(inhalt.length), aenderungszeit: '1' },
    }));
}
