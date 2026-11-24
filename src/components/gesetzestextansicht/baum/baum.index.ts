// baum.index.ts
// Getrennte Einstiege für die gesteuerte Ansicht und eigenständige Vorschauen.
export { VirtualisierteListe } from './Gesetzestextansicht.bausteine';
// Der Wrapper erzeugt seinen lokalen Rahmen; interne Listen erben den Elternkontext.
export { AbsatzListe } from './absatzVorschau';
