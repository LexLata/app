// Klon des gezogenen Tabs mit denselben Stilrollen wie die Tableiste.
import type { Tab } from '@/lib/domain/appTypes';
import type { DragZustand } from './hooks/useTabDragUndReihenfolge';
import { basisTabStil } from './tableisteStil';
import { TabBeschriftung } from './TabBeschriftung';
import { useRadiusRollen } from '@/hooks/stil/useRadiusRollen';

export function TableisteDragKlon({
  zustand,
  tab,
  untertitel,
  aktiv,
  uiFaktor,
  offset,
  hoehe,
}: {
  zustand: DragZustand;
  tab: Tab;
  untertitel?: string;
  aktiv: boolean;
  uiFaktor: number;
  offset: number;
  hoehe: number;
}) {
  const radiusRollen = useRadiusRollen();
  return (
    <div
      style={{
        ...basisTabStil(uiFaktor),
        position: 'fixed',
        top: zustand.klon.y,
        left: zustand.klon.x - offset,
        width: zustand.klon.breite,
        height: hoehe,
        minWidth: undefined,
        maxWidth: undefined,
        flexShrink: undefined,
        borderRight: undefined,
        background: 'var(--bg-haupt)',
        border: '1px solid var(--rahmen)',
        borderBottom: 'none',
        borderRadius: `${radiusRollen.standard}px ${radiusRollen.standard}px 0 0`,
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    >
      <TabBeschriftung
        titel={tab.gesetzesreferenz?.kurztitel ?? 'Neuer Tab'}
        untertitel={untertitel}
        aktiv={aktiv}
      />
    </div>
  );
}
