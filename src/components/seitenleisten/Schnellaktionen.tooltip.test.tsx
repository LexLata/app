// @vitest-environment jsdom
// Mac-Tooltiptexte mit echter Plattformermittlung.
import { vi } from 'vitest';
import { pruefeSchnellaktionenTooltips } from '@/test/hauptfenster/schnellaktionenTooltipVerhalten';
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'macos' }));
pruefeSchnellaktionenTooltips(true);
