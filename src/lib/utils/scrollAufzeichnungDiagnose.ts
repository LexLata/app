// scrollAufzeichnungDiagnose.ts
// Sitzungsgebundene Entwicklungsdiagnose der Scroll-Aufzeichnung. Ausschließlich Arbeitsspeicher;
// kein Bedienzustand. Ereignisse aus anderen Ansichten werden verworfen. Layout wird separat
// im bereits vorhandenen Nach-Bild-Termin gelesen, niemals durch eine Ereignismeldung.
type DiagnoseSkalar = string | number | boolean | null;
type DiagnoseWert = DiagnoseSkalar | readonly Record<string, DiagnoseSkalar>[];
interface DiagnoseEreignis {
  art: string;
  [feld: string]: DiagnoseWert;
}
interface DiagnoseSitzung {
  container: HTMLElement;
  beginn: number;
  ereignisse: (DiagnoseEreignis & { zeitMs: number; nummer: number })[];
  verworfen: number;
  referenzAnlass: number;
}
let sitzung: DiagnoseSitzung | undefined;
const HOECHSTZAHL = 20000;

/** Meldungen enthalten ausschließlich technische Werte und XML-IDs, niemals Annotationstext. */
export function meldeScrollDiagnose(ereignis: DiagnoseEreignis, container?: HTMLElement | null) {
  if (
    !import.meta.env.DEV ||
    !sitzung ||
    (container !== undefined && sitzung.container !== container)
  )
    return;
  if (ereignis.art === 'lesezeichen-geloescht' || ereignis.art === 'seitenleisten-geaendert')
    sitzung.referenzAnlass++;
  if (sitzung.ereignisse.length >= HOECHSTZAHL) {
    sitzung.verworfen++;
    return;
  }
  sitzung.ereignisse.push({
    ...ereignis,
    zeitMs: performance.now() - sitzung.beginn,
    nummer: sitzung.ereignisse.length + 1,
  });
}

/** Nur für die vorhandene Aufzeichnung; parallele Sitzungen würden Ereignisse vermischen. */
export function beginneScrollDiagnose(container: HTMLElement) {
  if (sitzung) throw new Error('Eine Scroll-Aufzeichnung läuft bereits');
  const lauf: DiagnoseSitzung = {
    container,
    beginn: performance.now(),
    ereignisse: [],
    verworfen: 0,
    referenzAnlass: 0,
  };
  if (import.meta.env.DEV) sitzung = lauf;
  return {
    beenden() {
      if (sitzung === lauf) sitzung = undefined;
      return {
        zeitbezug: 'Millisekunden seit Aufzeichnungsbeginn; nummer ordnet gleiche Zeitpunkte',
        hoechstzahl: HOECHSTZAHL,
        verworfen: lauf.verworfen,
        ereignisse: lauf.ereignisse,
      };
    },
  };
}

/** Bewahrt genau die bisherige Zuweisung; auch Browserbegrenzung/Rundung bleibt sichtbar. */
export function schreibeScrollPosition(container: HTMLElement, ziel: number, anlass: string) {
  if (!import.meta.env.DEV || sitzung?.container !== container) {
    container.scrollTop = ziel;
    return;
  }
  const vorher = container.scrollTop;
  container.scrollTop = ziel;
  meldeScrollDiagnose(
    { art: 'scroll-schreiben', anlass, vorher, angefordert: ziel, erreicht: container.scrollTop },
    container,
  );
}

/** Layoutlesung nur bei aktiver Aufzeichnung und zusammen mit der Textsprunglesung.
 * Beim Löschen/Seitenleistenwechsel bleibt die zuletzt vor dem Ereignis sichtbare XML-ID
 * bis zum nächsten solchen Anlass fest. Ohne vorherige Lesung gilt die erste sichtbare ID.
 * Die ersten acht ausgewählten Referenzen werden weiterverfolgt, auch wenn weitere Ereignisse
 * die aktuelle Referenz wechseln. Fehlende DOM-Elemente werden ausdrücklich gemeldet. */
export function erstelleLayoutDiagnose(container: HTMLElement) {
  let xmlId: string | null = null;
  let zuletzt = '';
  let vorherSichtbar: string | null = null;
  let referenzAnlass = -1;
  const referenzIds = new Set<string>();
  return (containerRechteck: DOMRect) => {
    if (!sitzung || sitzung.container !== container) return;
    const elemente = [...container.querySelectorAll<HTMLElement>('[data-xml-id]')];
    const oberste = elemente.find(
      (el) => el.getBoundingClientRect().bottom > containerRechteck.top,
    );
    if (referenzAnlass !== sitzung.referenzAnlass || !xmlId) {
      xmlId = vorherSichtbar ?? oberste?.dataset.xmlId ?? null;
      referenzAnlass = sitzung.referenzAnlass;
    }
    vorherSichtbar = oberste?.dataset.xmlId ?? null;
    if (xmlId && referenzIds.size < 8) referenzIds.add(xmlId);
    const referenzen = [...referenzIds].map((id) => {
      const element = elemente.find((el) => el.dataset.xmlId === id);
      const lage = element?.getBoundingClientRect();
      return {
        xmlId: id,
        vorhanden: !!element,
        bildschirmTop: lage?.top ?? null,
        bildschirmLinks: lage?.left ?? null,
      };
    });
    const referenz = elemente.find((el) => el.dataset.xmlId === xmlId);
    const rechteck = referenz?.getBoundingClientRect();
    const text = container.querySelector('[data-index]')?.getBoundingClientRect();
    const leisten = container.closest('[data-messlauf-seitenleisten]');
    const daten = {
      art: 'layout',
      referenzen,
      referenzAnlass,
      obersteXmlId: vorherSichtbar,
      obersteBildschirmTop: oberste?.getBoundingClientRect().top ?? null,
      containerBreite: containerRechteck.width,
      containerClientBreite: container.clientWidth,
      containerHoehe: containerRechteck.height,
      containerTop: containerRechteck.top,
      textBreite: text?.width ?? null,
      scrollTop: container.scrollTop,
      scrollHoehe: container.scrollHeight,
      xmlId,
      referenzVorhanden: !!referenz,
      bildschirmTop: rechteck?.top ?? null,
      bildschirmLinks: rechteck?.left ?? null,
      seitenleisten: leisten?.getAttribute('data-messlauf-seitenleisten') ?? null,
    };
    const schluessel = JSON.stringify(daten);
    if (schluessel === zuletzt) return;
    zuletzt = schluessel;
    meldeScrollDiagnose(daten, container);
  };
}
