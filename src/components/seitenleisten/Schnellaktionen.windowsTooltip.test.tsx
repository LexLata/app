// @vitest-environment jsdom
// Windows-/Linux-Schreibweise mit echter Plattformermittlung.
import { vi } from 'vitest';
import { pruefeSchnellaktionenTooltips } from '@/test/hauptfenster/schnellaktionenTooltipVerhalten';
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'windows' }));
pruefeSchnellaktionenTooltips(false);
