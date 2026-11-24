import { gliederungsartikel as artikelDaten, normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { describe, it, expect } from 'vitest';
import { ermittleUnterArtikelIds } from './useEinklappZustand';
import type {
  DarstellungsElement,
  NormDarstellung,
  UeberschriftDarstellung,
} from '@/lib/domain/gesetzTypes';

function gliederungsartikel(
  id: string,
  gliederungsEbene: number,
  ueberschriftartig: boolean,
): DarstellungsElement {
  const data: Partial<NormDarstellung> & { id: string; bezeichnung: string } = artikelDaten({
    art: 'gliederungsartikel',
    id,
    xmlId: id,
    bezeichnung: `Art. ${id}`,
    absaetze: [],
    gliederungsEbene,
    ueberschriftartig: ueberschriftartig,
  });
  return { typ: 'norm', data: data as NormDarstellung };
}

function norm(id: string): DarstellungsElement {
  return {
    typ: 'norm',
    data: normaleNorm({ id, xmlId: id, bezeichnung: `§ ${id}`, absaetze: [] }) as NormDarstellung,
  };
}

function ueberschrift(id: string, ebene: number): DarstellungsElement {
  return {
    typ: 'ueberschrift',
    data: {
      id,
      xmlId: id,
      bezeichnung: `Titel ${id}`,
      ebene,
      gliederungskennzahl: '000000',
    } as UeberschriftDarstellung,
  };
}

describe('ermittleUnterArtikelIds', () => {
  it('gibt eine leere Menge zurück, wenn kein Gliederungsartikel überschriftsartig ist', () => {
    const elemente = [norm('n1'), ueberschrift('u1', 1), norm('n2')];
    expect(ermittleUnterArtikelIds(elemente)).toEqual(new Set());
  });

  it('markiert Überschriften TIEFER als der überschriftsartige Gliederungsartikel als Unter-Artikel', () => {
    const elemente = [
      gliederungsartikel('a1', 1, true),
      ueberschrift('u1', 2),
      ueberschrift('u2', 3),
    ];
    expect(ermittleUnterArtikelIds(elemente)).toEqual(new Set(['u1', 'u2']));
  });

  it('beendet den Scope bei einer Überschrift auf GLEICHER Ebene wie der Artikel', () => {
    const elemente = [
      gliederungsartikel('a1', 1, true),
      ueberschrift('u1', 1), // gleiche Ebene -> beendet Scope, selbst kein Treffer
      ueberschrift('u2', 2), // liegt danach außerhalb des Scopes
    ];
    expect(ermittleUnterArtikelIds(elemente)).toEqual(new Set());
  });

  it('beendet den Scope bei einem weiteren Gliederungsartikel auf gleicher/höherer Ebene', () => {
    const elemente = [
      gliederungsartikel('a1', 1, true),
      ueberschrift('u1', 2),
      gliederungsartikel('a2', 1, false), // gleiche Ebene, nicht überschriftsartig -> beendet Scope
      ueberschrift('u2', 2), // außerhalb des Scopes
    ];
    expect(ermittleUnterArtikelIds(elemente)).toEqual(new Set(['u1']));
  });

  it('startet nach Scope-Ende einen neuen Scope, wenn ein weiterer Artikel überschriftsartig ist', () => {
    const elemente = [
      gliederungsartikel('a1', 1, true),
      ueberschrift('u1', 2),
      gliederungsartikel('a2', 1, true), // neuer Scope
      ueberschrift('u2', 2),
    ];
    expect(ermittleUnterArtikelIds(elemente)).toEqual(new Set(['u1', 'u2']));
  });

  it('normale Normen ohne gliederungsEbene beeinflussen einen laufenden Scope nicht', () => {
    const elemente = [gliederungsartikel('a1', 1, true), norm('n1'), ueberschrift('u1', 2)];
    expect(ermittleUnterArtikelIds(elemente)).toEqual(new Set(['u1']));
  });
});
