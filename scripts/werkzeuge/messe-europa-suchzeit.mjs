// messe-europa-suchzeit.mjs
// Bewusster manueller Messlauf mit echten Ressourcen, außerhalb der automatischen Tests.
import { startVitest } from 'vitest/node';
const lauf = await startVitest('test', [], {
  include: ['scripts/werkzeuge/europaSuchzeit.messung.ts'],
  watch: false,
});
await lauf?.close();
