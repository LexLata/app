// Native Einzel-Fenster-Fassade für ältere App-Abnahmen; getrennte Fenster prüfen die Phasenabnahmen.
export function startaufgabenBefehlsgrenze(nurImportindex = false) {
  let schritt = 0;
  return (befehl: string) => {
    if (befehl === 'startaufgaben_fortschritt') return schritt;
    if (befehl === 'startaufgaben_abmelden') return;
    if (befehl === 'startaufgaben_abschliessen') schritt++;
    return schritt < (nurImportindex ? 1 : 5) ? { kennung: 1, schritt } : null;
  };
}
