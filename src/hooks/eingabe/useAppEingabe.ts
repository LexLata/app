// useAppEingabe.ts
// Bindet Tastenkürzel und Menüereignisse an dieselben aktuellen App-Aktionen an.
import { useTastenkuerzel } from './useTastenkuerzel';
import { useMenueEvents } from './useMenueEvents';

type AppEingabeOptionen = Parameters<typeof useTastenkuerzel>[0] &
  Parameters<typeof useMenueEvents>[0];

export function useAppEingabe(optionen: AppEingabeOptionen) {
  useTastenkuerzel(optionen);
  useMenueEvents(optionen);
}
