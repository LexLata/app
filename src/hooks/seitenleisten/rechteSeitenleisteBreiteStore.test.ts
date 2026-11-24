// rechteSeitenleisteBreiteStore.test.ts
//
// Reine Store-Logik (kein I/O), analog zu bannerStore.test.ts. Kein
// fast-check: setzeRechteLeisteBreite hat keine kombinatorische Logik,
// nur einen einzelnen Gleichheitsvergleich - Beispieltests decken das
// vollständig ab. Da der Store modulweiten Zustand hält (kein Reset-Hook),
// wird er in jedem Test explizit über setzeRechteLeisteBreite(0) auf den
// Default zurückgesetzt (siehe beforeEach).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setzeRechteLeisteBreite, subscribe, getSnapshot } from './rechteSeitenleisteBreiteStore';

beforeEach(() => {
  setzeRechteLeisteBreite(0);
});

describe('getSnapshot - Default', () => {
  it('ist 0, solange setzeRechteLeisteBreite noch nicht mit einem anderen Wert aufgerufen wurde', () => {
    expect(getSnapshot()).toBe(0);
  });
});

describe('setzeRechteLeisteBreite', () => {
  it('übernimmt einen neuen Wert', () => {
    setzeRechteLeisteBreite(240);
    expect(getSnapshot()).toBe(240);
  });

  it('benachrichtigt registrierte Listener bei einer tatsächlichen Änderung', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    setzeRechteLeisteBreite(240);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('MUTATIONSTEST: bei UNVERÄNDERTEM Wert (neu === breite) wird NICHT benachrichtigt', () => {
    setzeRechteLeisteBreite(240);
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    setzeRechteLeisteBreite(240);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('MUTATIONSTEST: das Setzen auf 0 (Unmount, Leiste unsichtbar) löst bei vorherigem Nicht-Null-Wert eine Benachrichtigung aus', () => {
    setzeRechteLeisteBreite(240);
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    setzeRechteLeisteBreite(0);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getSnapshot()).toBe(0);
    unsubscribe();
  });

  it('mehrere aufeinanderfolgende unterschiedliche Werte benachrichtigen jeweils erneut', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    setzeRechteLeisteBreite(100);
    setzeRechteLeisteBreite(200);
    setzeRechteLeisteBreite(300);
    expect(listener).toHaveBeenCalledTimes(3);
    expect(getSnapshot()).toBe(300);
    unsubscribe();
  });
});

describe('subscribe', () => {
  it('gibt eine Funktion zurück, die den Listener wieder entfernt', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    unsubscribe();
    setzeRechteLeisteBreite(150);
    expect(listener).not.toHaveBeenCalled();
  });

  it('benachrichtigt mehrere registrierte Listener bei derselben Änderung', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const u1 = subscribe(listener1);
    const u2 = subscribe(listener2);
    setzeRechteLeisteBreite(180);
    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
    u1();
    u2();
  });

  it('ein abgemeldeter Listener wird bei künftigen Änderungen nicht mehr benachrichtigt, ein weiterhin registrierter schon', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const u1 = subscribe(listener1);
    const u2 = subscribe(listener2);
    u1();
    setzeRechteLeisteBreite(220);
    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).toHaveBeenCalledTimes(1);
    u2();
  });
});
