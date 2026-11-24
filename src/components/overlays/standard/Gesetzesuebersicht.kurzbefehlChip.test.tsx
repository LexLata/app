// Fehler beim Speichern oder Löschen eines Kurzbefehls beenden die Aufnahme,
// ohne eine erfolgreiche Änderung an die Gesetzesübersicht zu melden.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const speichereGesetzeskurzbefehl = vi.fn();
const loescheGesetzeskurzbefehl = vi.fn();
const onGesetzeskurzbefehleGeaendert = vi.fn();
const onRecordingStop = vi.fn();
let recording = false;
let fehlerAnzeige: unknown = null;
let zustandsNummer = 0;
let keydownHandler: ((event: KeyboardEvent) => Promise<void>) | null = null;

vi.mock('react', async (importOriginal) => {
  const echt = await importOriginal<typeof import('react')>();
  return {
    ...echt,
    useState: (anfang: unknown) => {
      const nummer = zustandsNummer++;
      if (nummer === 0) return [recording, (wert: boolean) => (recording = wert)];
      if (nummer === 1) return [fehlerAnzeige, (wert: unknown) => (fehlerAnzeige = wert)];
      return [anfang, vi.fn()];
    },
    useEffect: (effekt: () => void) => effekt(),
    useRef: () => ({ current: null }),
  };
});
vi.mock('@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher', () => ({
  gesetzeskurzbefehlAlsText: () => '⌘K',
  gesetzeskurzbefehlVonEvent: () => ({ taste: 'k', meta: true }),
  speichereGesetzeskurzbefehl: (...args: unknown[]) => speichereGesetzeskurzbefehl(...args),
  loescheGesetzeskurzbefehl: (...args: unknown[]) => loescheGesetzeskurzbefehl(...args),
}));
vi.mock('@/hooks/stil/useTextRollen', () => ({ useTextRollen: () => ({ mikrotext: {} }) }));
vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({ useUiSkalierungsFaktor: () => 1 }));
vi.mock('@/hooks/stil/useRadiusRollen', () => ({ useRadiusRollen: () => ({ klein: 2 }) }));

import { KurzbefehlChip } from './Gesetzesuebersicht.kurzbefehlChip';

function rendern() {
  zustandsNummer = 0;
  return KurzbefehlChip({
    schluessel: 'gesetz-1',
    gesetz: { kurztitel: 'BGB', normgeber: 'de-bund' },
    kurzbefehl: null,
    rowHovered: true,
    anyRecording: false,
    onGesetzeskurzbefehleGeaendert,
    onSelektieren: vi.fn(),
    onRecordingStart: vi.fn(),
    onRecordingStop,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  recording = false;
  fehlerAnzeige = null;
  keydownHandler = null;
  vi.stubGlobal('window', {
    addEventListener: (_typ: string, handler: (event: KeyboardEvent) => Promise<void>) => {
      keydownHandler = handler;
    },
    removeEventListener: vi.fn(),
  });
});

describe('Kurzbefehl-Chip bei einem Speicherfehler', () => {
  it.each([
    ['Delete', loescheGesetzeskurzbefehl, new Error('Datei nicht lesbar')],
    ['k', speichereGesetzeskurzbefehl, new Error('Datei nicht lesbar')],
    ['Delete', loescheGesetzeskurzbefehl, 'wartefrist'],
    ['k', speichereGesetzeskurzbefehl, 'wartefrist'],
  ])('%s beendet die Aufnahme ohne Änderungsmeldung', async (taste, speicherAktion, fehler) => {
    const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
    speicherAktion.mockRejectedValue(fehler);
    const chip = rendern();
    chip.props.onClick({ stopPropagation: vi.fn() } as never);
    rendern();
    expect(keydownHandler).not.toBeNull();

    await expect(
      keydownHandler!({
        key: taste,
        code: 'KeyK',
        stopImmediatePropagation: vi.fn(),
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
      } as unknown as KeyboardEvent),
    ).resolves.toBeUndefined();

    expect(speicherAktion).toHaveBeenCalledTimes(1);
    expect(protokoll).toHaveBeenCalledWith(
      taste === 'Delete'
        ? 'Gesetzeskurzbefehl konnte nicht gelöscht werden:'
        : 'Gesetzeskurzbefehl konnte nicht gespeichert werden:',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      fehler,
    );
    protokoll.mockRestore();
    expect(onGesetzeskurzbefehleGeaendert).not.toHaveBeenCalled();
    expect(onRecordingStop).toHaveBeenCalledWith('gesetz-1');
    expect(recording).toBe(false);
    expect(rendern().props.text).toBe('Konnte nicht gespeichert werden');
    vi.unstubAllGlobals();
  });
});

it('bezeichnet die gesetzesbezogene Aufnahme als Kurzbefehl', () => {
  const chip = rendern();
  expect(chip.props.text).toBe('+ Kurzbefehl');
  expect(chip.props.title).toBe('Klicken, um Kurzbefehl festzulegen');
  vi.unstubAllGlobals();
});
