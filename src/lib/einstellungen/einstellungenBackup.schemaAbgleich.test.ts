// Gemeinsame Fälle prüfen die lokale Backup-Prüfung gegen das unveränderte RelaxNG-Schema.
import { expect, it } from 'vitest';
import fc from 'fast-check';
import { pruefeSchema } from '@/../scripts/automatisch/schema-hilfe';
import { istEinstellungenBackupGueltig } from '@/lib/einstellungen/einstellungenBackup';
import {
  baueEinstellungenXML,
  EXPORTIERBARE_SCHLUESSEL,
  istEinstellungsbestandLeer,
} from '@/lib/einstellungen/einstellungenXML';
import { BACKUP_SCHEMA_FAELLE as faelle } from '@/test/einstellungen/einstellungenBackupFaelle';
it.each(faelle)('%s stimmt mit RelaxNG überein', async (_name, inhalt, erwartet) => {
  expect((await pruefeSchema('einstellungen', inhalt)).valid).toBe(erwartet);
  expect(istEinstellungenBackupGueltig(inhalt)).toBe(erwartet);
});
const backupOhneDTD =
  '<einstellungen version="1"><verarbeitungszeit>2026-10-16T12:00:00Z</verarbeitungszeit><schriftart>&amp;&lt;&gt;&quot;&apos;&#32;&#xA0;</schriftart></einstellungen>';
it.each([
  '<!DOCTYPE einstellungen>',
  '<!DOCTYPE einstellungen [<!ENTITY intern "Text">]>',
  '<!DOCTYPE einstellungen SYSTEM "urn:lexlata:test-dtd">',
  '<!DOCTYPE einstellungen [<!ENTITY extern SYSTEM "urn:lexlata:test-entity">]>',
  '<!DOCTYPE einstellungen [<!ENTITY % parameter "Text">]>',
])('lehnt im Backup jede DTD ab: %s', (doctype) => {
  expect(istEinstellungenBackupGueltig(doctype + backupOhneDTD)).toBe(false);
});
it('fasst den Backup-Vertrag bewusst enger als RelaxNG und erlaubt normale XML-Escapes', async () => {
  const mitDTD = '<!DOCTYPE einstellungen>' + backupOhneDTD;
  expect((await pruefeSchema('einstellungen', mitDTD)).valid).toBe(true);
  expect(istEinstellungenBackupGueltig(mitDTD)).toBe(false);
  expect((await pruefeSchema('einstellungen', backupOhneDTD)).valid).toBe(true);
  expect(istEinstellungenBackupGueltig(backupOhneDTD)).toBe(true);
});
it('prüft alle exportierbaren Werte im vollständigen XML', async () => {
  const werte = new Map(
    EXPORTIERBARE_SCHLUESSEL.map((key) => [
      key,
      key.endsWith('nachbereitungBeiImport')
        ? 'aus'
        : key.endsWith('euFassung')
          ? 'konsolidiert'
          : key.endsWith('euDurchfuehrungsaktSuche') ||
              key.endsWith('seitenleistenTastenkuerzel') ||
              key.endsWith('appUpdatesAutomatischSuchen')
            ? 'false'
            : 'roh',
    ]),
  );
  const original = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => werte.get(key) ?? null },
  });
  try {
    const inhalt = baueEinstellungenXML();
    expect((await pruefeSchema('einstellungen', inhalt)).valid).toBe(true);
    expect(istEinstellungenBackupGueltig(inhalt)).toBe(true);
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original });
  }
});
it('erkennt beliebige Mengen ohne und mit exportierbaren Schlüsseln', () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.string().filter((key) => !EXPORTIERBARE_SCHLUESSEL.includes(key))),
      fc.constantFrom(...EXPORTIERBARE_SCHLUESSEL),
      (fremde, bekannt) => {
        expect(istEinstellungsbestandLeer(fremde)).toBe(true);
        expect(istEinstellungsbestandLeer([...fremde, bekannt])).toBe(false);
      },
    ),
  );
});
