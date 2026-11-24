// Gemeinsame mobile Suchoberfläche für Import- und Invalidierungsprüfungen ohne installierte Gesetze.
import type { ComponentProps } from 'react';
import { OeffnenScreen } from '@/mobile/screens/OeffnenScreen';
import { suchtrefferOeffnenFuerTest } from './suchtrefferOeffnenFuerTest';
export function OeffnenScreenFixture({
  onGesetzGewaehlt,
}: Pick<ComponentProps<typeof OeffnenScreen>, 'onGesetzGewaehlt'>) {
  return (
    <OeffnenScreen
      zuletztGezeigtesGesetz={null}
      onGesetzGewaehlt={onGesetzGewaehlt}
      onGesetzImportiert={async () => {}}
      customTastaturAktiv={false}
      onReferenzGewaehlt={suchtrefferOeffnenFuerTest([], onGesetzGewaehlt, onGesetzGewaehlt)}
    />
  );
}
