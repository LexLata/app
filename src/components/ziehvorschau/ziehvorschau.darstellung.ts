// ziehvorschau.darstellung.ts – Baut die kleine, von der App unabhängige Vorschauseite.
export function stelleZiehvorschauDar(
  dokument: Document,
  parameter: URLSearchParams,
): HTMLDivElement {
  const kaestchen = dokument.createElement('div');
  Object.assign(dokument.body.style, {
    margin: '0',
    overflow: 'hidden',
    cursor: 'grabbing',
    backgroundColor: parameter.get('hintergrund') ?? '',
  });
  Object.assign(kaestchen.style, {
    boxSizing: 'border-box',
    width: '100vw',
    height: '100vh',
    padding: parameter.get('innenabstand') ?? '',
    paddingTop: '0',
    paddingBottom: '0',
    display: 'flex',
    alignItems: 'center',
    borderRadius: parameter.get('eckenradius') ?? '',
    overflow: 'hidden',
    backgroundColor: parameter.get('hintergrund') ?? '',
    color: parameter.get('textfarbe') ?? '',
    font: parameter.get('schrift') ?? '',
  });
  const text = dokument.createElement('span');
  Object.assign(text.style, {
    flex: '1',
    minWidth: '0',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  });
  // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: Das Textelement begrenzt den Titel mit nowrap und Ellipsis; Seitentests prüfen Normangaben, Zeilenumbrüche und Überlänge.
  text.textContent = parameter.get('titel') ?? '';
  // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: Nur das oben mit nowrap und Ellipsis begrenzte Textelement wird angehängt; Seitentests prüfen Normangaben, Umbrüche und Überlänge.
  kaestchen.append(text);
  // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: Eingesetzt wird nur das Kästchen mit seinem oben durch nowrap und Ellipsis geschützten Textelement; Seitentests prüfen diesen Anzeigeweg.
  dokument.body.replaceChildren(kaestchen);
  return kaestchen;
}
