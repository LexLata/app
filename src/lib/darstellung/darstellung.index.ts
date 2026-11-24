/**
 * Öffentliche Schnittstelle der Darstellung: GesetzesXML-Parser,
 * Textauszeichnung und Textsegmentierung.
 */

export { parseGesetzesXML } from './gesetzesXMLParser';
export type { Textauszeichnung, VerweisKlickziel } from './textauszeichnung';
export { segmentiere } from './textSegmentierung';
export type { TextSegment } from './textSegmentierung';
