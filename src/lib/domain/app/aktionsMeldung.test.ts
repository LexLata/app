// Flüchtige Meldungssammlung und begrenzter Abschluss des einzelnen Aufrufs.
import { expect, it, vi } from 'vitest';
import { erzeugeAktionsMeldungsSammlung, erfasseAktionsFolgelauf } from './aktionsMeldung';

function offen() {
  let beenden!: () => void;
  const lauf = new Promise<void>((resolve) => {
    beenden = resolve;
  });
  return { lauf, beenden };
}

it('lässt einen defekten Folgelaufregistrierer den Arbeitsvorgang nicht unterbrechen', () => {
  const fehler = new Error('Registrierung');
  const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
  const empfangen = Object.assign(() => {}, {
    folgelaufErfassen: () => {
      throw fehler;
    },
  });
  try {
    expect(() => erfasseAktionsFolgelauf(empfangen, Promise.resolve())).not.toThrow();
    expect(protokoll).toHaveBeenCalledWith('Aktionsfolgelauf konnte nicht erfasst werden:', fehler);
  } finally {
    protokoll.mockRestore();
  }
});

it('erfasst auch während eines Folgelaufs registrierte weitere Folgeläufe', async () => {
  const sammlung = erzeugeAktionsMeldungsSammlung();
  const erster = offen();
  const zweiter = offen();
  erfasseAktionsFolgelauf(
    sammlung.meldungEmpfangen,
    erster.lauf.then(() => {
      erfasseAktionsFolgelauf(sammlung.meldungEmpfangen, zweiter.lauf);
    }),
  );
  const fertig = vi.fn();
  const abschluss = sammlung.warteAufAbschluss(1000).then(fertig);
  erster.beenden();
  await Promise.resolve();
  expect(fertig).not.toHaveBeenCalled();
  zweiter.beenden();
  await abschluss;
  expect(fertig).toHaveBeenCalledWith('abgeschlossen');
});

it('begrenzt das Warten ohne den laufenden Vorgang oder seine Meldungen zu verlieren', async () => {
  const sammlung = erzeugeAktionsMeldungsSammlung();
  const folge = offen();
  erfasseAktionsFolgelauf(sammlung.meldungEmpfangen, folge.lauf);
  expect(await sammlung.warteAufAbschluss(0)).toBe('wartefrist');
  sammlung.meldungEmpfangen({
    text: 'spät',
    typ: 'warnung',
    art: 'hinweis',
    anlass: 'pruefabschluss',
    aenderungsstand: 'vollstaendig',
  });
  folge.beenden();
  expect(await sammlung.warteAufAbschluss(1000)).toBe('abgeschlossen');
  expect(sammlung.meldungen()).toHaveLength(1);
});

it('vertauscht parallele Vorgänge nicht und behandelt Abschluss nicht als Erfolg', async () => {
  const a = erzeugeAktionsMeldungsSammlung();
  const b = erzeugeAktionsMeldungsSammlung();
  const folge = offen();
  erfasseAktionsFolgelauf(a.meldungEmpfangen, folge.lauf);
  erfasseAktionsFolgelauf(b.meldungEmpfangen, Promise.reject(Error('Prüfung')));
  expect(await b.warteAufAbschluss(1000)).toBe('abgeschlossen');
  expect(await a.warteAufAbschluss(0)).toBe('wartefrist');
  folge.beenden();
  expect(await a.warteAufAbschluss(1000)).toBe('abgeschlossen');
});

it('lehnt ungültige Wartefristen ab und gibt Meldungen als getrennte Momentaufnahme zurück', async () => {
  const sammlung = erzeugeAktionsMeldungsSammlung();
  await expect(sammlung.warteAufAbschluss(-1)).rejects.toThrow();
  await expect(sammlung.warteAufAbschluss(Infinity)).rejects.toThrow();
  const vorher = sammlung.meldungen();
  sammlung.meldungEmpfangen({
    text: 'Befund',
    typ: 'info',
    art: 'hinweis',
    anlass: 'sicherung',
    aenderungsstand: 'teilweise',
  });
  expect(vorher).toHaveLength(0);
  expect(sammlung.meldungen()).toHaveLength(1);
});

it('berichtet eine abgelehnte Promise ohne Detailbefund als Abschlussfehler', async () => {
  const sammlung = erzeugeAktionsMeldungsSammlung();
  erfasseAktionsFolgelauf(sammlung.meldungEmpfangen, Promise.reject(Error('Prüftransport')));
  await sammlung.warteAufAbschluss(1000);
  expect(sammlung.meldungen()).toEqual([
    expect.objectContaining({
      anlass: 'pruefabschluss',
      text: expect.stringContaining('Prüftransport'),
    }),
  ]);
});

it('wartet auf einen vorab registrierten verzögerten Start und löst nur Anzeigeempfänger', async () => {
  vi.useFakeTimers();
  try {
    const sammlung = erzeugeAktionsMeldungsSammlung();
    const folge = offen();
    const anzeigen = vi.fn();
    const abmelden = sammlung.abonnieren(anzeigen);
    const verzögert = new Promise<void>((resolve) => {
      setTimeout(() => {
        void folge.lauf.then(resolve);
      }, 200);
    });
    erfasseAktionsFolgelauf(sammlung.meldungEmpfangen, verzögert);
    const abschluss = sammlung.warteAufAbschluss(30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await abschluss).toBe('wartefrist');
    expect(sammlung.hatOffeneFolgelaeufe()).toBe(true);
    abmelden();
    folge.beenden();
    await sammlung.warteAufAbschluss(1000);
    expect(sammlung.hatOffeneFolgelaeufe()).toBe(false);
    expect(anzeigen).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

it('behält Nachbarbefunde und unterdrückt nur den zur Ausnahme gehörenden Detailbefund', async () => {
  const sammlung = erzeugeAktionsMeldungsSammlung();
  const lauf = Promise.resolve().then(() => {
    sammlung.meldungEmpfangen({
      text: 'Prüfstand beschädigt',
      typ: 'fehler',
      art: 'hinweis',
      anlass: 'pruefabschluss',
      aenderungsstand: 'keine',
    });
    throw Error('Fenstertransport');
  });
  erfasseAktionsFolgelauf(sammlung.meldungEmpfangen, lauf);
  await sammlung.warteAufAbschluss(1000);
  expect(sammlung.meldungen()).toHaveLength(2);
  const gleich = Promise.resolve().then(() => {
    sammlung.meldungEmpfangen({
      text: 'Weiterer Prüfstandfehler',
      typ: 'fehler',
      art: 'hinweis',
      anlass: 'pruefabschluss',
      aenderungsstand: 'keine',
    });
    throw Error('Weiterer Prüfstandfehler');
  });
  erfasseAktionsFolgelauf(sammlung.meldungEmpfangen, gleich);
  await sammlung.warteAufAbschluss(1000);
  expect(sammlung.meldungen()).toHaveLength(3);
});

it('erkennt schon vor der Registrierung empfangene Details derselben Ablehnung', async () => {
  const sammlung = erzeugeAktionsMeldungsSammlung();
  sammlung.meldungEmpfangen({
    text: 'Prüfung gescheitert',
    typ: 'fehler',
    art: 'hinweis',
    anlass: 'pruefabschluss',
    aenderungsstand: 'keine',
  });
  erfasseAktionsFolgelauf(sammlung.meldungEmpfangen, Promise.reject(Error('Prüfung gescheitert')));
  await sammlung.warteAufAbschluss(1000);
  expect(sammlung.meldungen()).toHaveLength(1);
});
