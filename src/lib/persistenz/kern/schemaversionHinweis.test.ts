import { beforeEach, describe, expect, it, vi } from 'vitest';

const { emitTo } = vi.hoisted(() => ({ emitTo: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ emitTo }));

import { pruefeSchemaversion } from './schemaversionHinweis';

beforeEach(() => {
  emitTo.mockReset();
  emitTo.mockResolvedValue(undefined);
});

describe('pruefeSchemaversion', () => {
  it.each([
    '<gesetz version="1"/>',
    '<gesetz/>',
    '<dokumente version="2"/>',
    '{}',
    '',
    '<?xml version="1.0"?>',
    '<nichtamtlicheTitel/>',
    '<gesetz daten-version="2"/>',
    `<gesetz hinweis="version='2'"/>`,
    '<!-- unvollständig',
    '<!DOCTYPE gesetz [',
    '<!DOCTYPE gesetz [<!-- ] -->]><gesetz version="1"/>',
  ])('sendet für %s kein Ereignis', async (inhalt) => {
    await pruefeSchemaversion(inhalt);
    expect(emitTo).not.toHaveBeenCalled();
  });

  it.each([
    '<gesetz version="2"/>',
    '<markierungen version="0"/>',
    '<importindex version="abc"/>',
    '<favoriten version="2"/>',
    '<einstellungen version=""/>',
    '\uFEFF<?xml version="1.0"?>\n<nichtamtlicheTitel version="2"/>',
    '<!-- Hinweis --><!DOCTYPE gesetz [<!ENTITY x "a>b">]><GESETZ version=\'2\'/>',
    '<!DOCTYPE gesetz [<!-- ] -->]><gesetz version="2"/>',
    `<!--${'x'.repeat(2000)}--><gesetz version="2"/>`,
  ])('sendet für %s an main', async (inhalt) => {
    await pruefeSchemaversion(inhalt);
    expect(emitTo).toHaveBeenCalledWith('main', expect.any(String));
  });

  it('schluckt einen Sendefehler', async () => {
    emitTo.mockRejectedValue(new Error('kein Fenster'));
    await expect(pruefeSchemaversion('<gesetz version="2"/>')).resolves.toBeUndefined();
  });
});

it('liefert abweichende Versionen bei jedem Dateiimport an dessen Empfänger', async () => {
  const empfangen = vi.fn();
  await pruefeSchemaversion('<gesetz version="8"/>');
  expect(emitTo).toHaveBeenCalledOnce();
  emitTo.mockClear();
  await pruefeSchemaversion('<gesetz version="2"/>', empfangen);
  await pruefeSchemaversion('<gesetz version="3"/>', empfangen);
  expect(empfangen).toHaveBeenCalledTimes(2);
  expect(empfangen.mock.calls[0]?.[0].text).toContain('2');
  expect(empfangen.mock.calls[1]?.[0].text).toContain('3');
  expect(emitTo).not.toHaveBeenCalled();
  await pruefeSchemaversion('<gesetz version="2"/>');
  expect(emitTo).toHaveBeenCalledOnce();
});
