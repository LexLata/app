// gesetzDateiFormat.ts
// Erkennt das Dateiformat von Gesetzesinhalten anhand von Pfad und Inhalt.

import type { GesetzDateiFormat } from '@/lib/import/importVertrag.types';

function siehtNachHtmlInhaltAus(inhalt: string): boolean {
  const getrimmt = inhalt.trimStart();
  return (
    /^<!doctype html/i.test(getrimmt) ||
    /^<html[\s>]/i.test(getrimmt) ||
    /^<\?xml[^>]*\?>\s*<!doctype html/i.test(getrimmt) ||
    /^<!--\?xml[^>]*\?-->\s*<!doctype html/i.test(getrimmt)
  );
}

export function istHtmlDatei(inhalt: string, dateiPfad: string): boolean {
  const endung = dateiPfad.toLowerCase().split('.').pop() ?? '';
  return endung === 'html' || endung === 'htm' || siehtNachHtmlInhaltAus(inhalt);
}

export function erkenneGesetzDateiFormat(
  inhalt: string,
  dateiPfad: string,
): GesetzDateiFormat | null {
  const getrimmt = inhalt.trimStart();
  const siehtNachHTMLAus = siehtNachHtmlInhaltAus(inhalt);
  if (istHtmlDatei(inhalt, dateiPfad)) {
    if (!siehtNachHTMLAus) return null;
    // EUR-Lex-HTML ist kein Gesetzdateiformat (EU-Recht kommt über „Gesetz
    // oder Norm öffnen“); es darf nicht als Landesrecht BW gelesen werden.
    if (/class="eli-container"/.test(inhalt) || /href="https:\/\/eur-lex\.europa\.eu/.test(inhalt))
      return null;
    return 'html-bw';
  }

  const ohneDeklaration = getrimmt
    .replace(/<!--[\s\S]*?-->/g, '')
    .trimStart()
    .replace(/^<\?xml[^>]*\?>/i, '')
    .trimStart()
    .replace(/^<!DOCTYPE[^>[\]]*(\[[\s\S]*?\])?\s*>/i, '')
    .trimStart();
  const rootTag = ohneDeklaration.match(/^<([A-Za-z][\w:-]*)/)?.[1]?.toLowerCase();
  if (rootTag === 'gesetz') return 'kanonisch-xml';
  if (/<norm\b[^>]*>[\s\S]*?<metadaten>/i.test(ohneDeklaration)) return 'bja-xml';
  return null;
}
