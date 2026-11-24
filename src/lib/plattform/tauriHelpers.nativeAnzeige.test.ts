// tauriHelpers.nativeAnzeige.test.ts
// Prüft sichtbare native Übergaben gegen API-Mocks und unveränderte technische Daten.
import { beforeEach, expect, expectTypeOf, it, vi } from 'vitest';
import * as helfer from './tauriHelpers';
const api = vi.hoisted(() => ({
  confirm: vi.fn(),
  message: vi.fn(),
  open: vi.fn(),
  save: vi.fn(),
  menu: vi.fn(),
  icon: vi.fn(),
  submenu: vi.fn(),
  invoke: vi.fn(),
  title: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  confirm: api.confirm,
  message: api.message,
  open: api.open,
  save: api.save,
}));
vi.mock('@tauri-apps/api/menu', () => ({
  MenuItem: { new: api.menu },
  IconMenuItem: { new: api.icon },
  Submenu: { new: api.submenu },
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: api.invoke }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ setTitle: api.title }) }));
beforeEach(() => vi.resetAllMocks());
const roh = 'Art. 1 Abs. 1 I 2';
const sichtbar = 'Art.\u00a01 Abs.\u00a01 I 2';
it('schützt confirm-Meldung, Titel und Labels, erhält Bestätigung und Abbruch', async () => {
  const optionen = { title: roh, okLabel: roh, cancelLabel: roh, kind: 'warning' as const };
  for (const ergebnis of [true, false]) {
    api.confirm.mockResolvedValueOnce(ergebnis);
    await expect(helfer.nativeBestaetigung(roh, optionen)).resolves.toBe(ergebnis);
  }
  expect(api.confirm).toHaveBeenCalledWith(sichtbar, {
    ...optionen,
    title: sichtbar,
    okLabel: sichtbar,
    cancelLabel: sichtbar,
  });
  expect(optionen.title).toBe(roh);
  await helfer.nativeBestaetigung(roh, roh);
  expect(api.confirm).toHaveBeenLastCalledWith(sichtbar, sichtbar);
});
it('schützt message einschließlich aller benannten Buttons und gibt ursprüngliche Aktionslabels zurück', async () => {
  const buttons = { yes: roh, no: '§ 2', cancel: '§ 3' };
  const optionen = { title: roh, buttons, okLabel: roh, kind: 'error' as const };
  api.message.mockResolvedValueOnce(sichtbar);
  await expect(helfer.nativeMeldung(roh, optionen)).resolves.toBe(roh);
  expect(api.message).toHaveBeenCalledWith(sichtbar, {
    ...optionen,
    title: sichtbar,
    okLabel: sichtbar,
    buttons: { yes: sichtbar, no: '§\u00a02', cancel: '§\u00a03' },
  });
  expect(buttons).toEqual({ yes: roh, no: '§ 2', cancel: '§ 3' });
  api.message.mockResolvedValueOnce('Cancel');
  await expect(helfer.nativeMeldung(roh, { buttons: 'YesNoCancel' })).resolves.toBe('Cancel');
  expect(api.message).toHaveBeenLastCalledWith(sichtbar, { buttons: 'YesNoCancel' });
  api.message.mockResolvedValueOnce(sichtbar);
  await expect(helfer.nativeMeldung(roh, { okLabel: roh })).resolves.toBe(roh);
  await helfer.nativeMeldung(roh, roh);
  expect(api.message).toHaveBeenLastCalledWith(sichtbar, sichtbar);
});
it('schützt Dateidialogtitel/Filter, niemals Pfade und Extensions; bewahrt Abbruch/Rückgabe', async () => {
  const extensions = ['§ 1', 'xml'];
  const optionen = {
    title: roh,
    defaultPath: '/Art. 1/§ 2.xml',
    filters: [{ name: roh, extensions }],
    multiple: true as const,
    directory: false,
  };
  const pfade = ['/§ 1.xml', '/Art. 2.xml'];
  api.open.mockResolvedValueOnce(pfade);
  const ergebnis = helfer.nativeDateiOeffnen(optionen);
  expectTypeOf(ergebnis).toEqualTypeOf<Promise<string[] | null>>();
  await expect(ergebnis).resolves.toBe(pfade);
  api.save.mockResolvedValueOnce(pfade[0]);
  await expect(helfer.nativeDateiSpeichern(optionen)).resolves.toBe(pfade[0]);
  for (const mock of [api.open, api.save]) {
    expect(mock).toHaveBeenCalledWith({
      ...optionen,
      title: sichtbar,
      filters: [{ name: sichtbar, extensions }],
    });
    expect(mock.mock.calls[0]![0].filters[0].extensions).toBe(extensions);
    mock.mockResolvedValueOnce(null);
  }
  await expect(helfer.nativeDateiOeffnen()).resolves.toBeNull();
  await expect(helfer.nativeDateiSpeichern()).resolves.toBeNull();
  expect(optionen.filters[0]!.name).toBe(roh);
});
it.each(['nativeMenuEintrag', 'nativeIconMenuEintrag', 'nativeUntermenue'] as const)(
  '%s verändert nur sichtbaren Text, weder Ressourcen noch Aktionen',
  async (name) => {
    const action = vi.fn();
    const icon = '/Art. 1.png';
    const items: [] = [];
    const optionen = {
      text: roh,
      id: roh,
      action,
      accelerator: 'Ctrl+1',
      enabled: false,
      icon,
      items,
    };
    const ressource = { close: vi.fn() };
    const mock =
      name === 'nativeMenuEintrag'
        ? api.menu
        : name === 'nativeIconMenuEintrag'
          ? api.icon
          : api.submenu;
    mock.mockResolvedValueOnce(ressource);
    await expect(helfer[name](optionen)).resolves.toBe(ressource);
    expect(mock).toHaveBeenCalledWith({ ...optionen, text: sichtbar });
    expect(mock.mock.calls[0]![0].action).toBe(action);
    expect(mock.mock.calls[0]![0].items).toBe(items);
    expect(ressource.close).not.toHaveBeenCalled();
    expect(optionen.text).toBe(roh);
  },
);
it.each(['kommentar_fenster_oeffnen', 'verweismarkierung_fenster_oeffnen'] as const)(
  'schützt nur Hilfsfenstertitel für %s',
  async (befehl) => {
    const daten = { label: roh, titel: roh, hoehe: 321 };
    await helfer.nativesMarkierungsfensterOeffnen(befehl, daten);
    expect(api.invoke).toHaveBeenCalledWith(befehl, { ...daten, titel: sichtbar });
    expect(daten.titel).toBe(roh);
  },
);
it('schützt die laufende Titelaktualisierung', async () => {
  await helfer.nativenFenstertitelSetzen(roh);
  expect(api.title).toHaveBeenCalledWith(sichtbar);
});
it('erhält ursprüngliche API-Fehler aller Übergaben', async () => {
  const fehler = new Error('native Übergabe');
  for (const mock of Object.values(api)) mock.mockRejectedValue(fehler);
  const aufrufe = [
    () => helfer.nativeBestaetigung(roh),
    () => helfer.nativeMeldung(roh),
    () => helfer.nativeDateiOeffnen(),
    () => helfer.nativeDateiSpeichern(),
    () => helfer.nativeMenuEintrag({ text: roh }),
    () => helfer.nativeIconMenuEintrag({ text: roh, icon: 'x' }),
    () => helfer.nativeUntermenue({ text: roh }),
    () =>
      helfer.nativesMarkierungsfensterOeffnen('kommentar_fenster_oeffnen', {
        label: 'a',
        titel: roh,
        hoehe: 321,
      }),
    () => helfer.nativenFenstertitelSetzen(roh),
  ];
  for (const aufruf of aufrufe) await expect(aufruf()).rejects.toBe(fehler);
});
