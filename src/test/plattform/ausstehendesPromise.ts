// Ein Test legt selbst fest, wann eine native Operation ihr Ergebnis liefert.
export function ausstehendesPromise<T>() {
  let resolve: (wert: T) => void = () => {
    throw Error('Das Testversprechen wurde noch nicht eingerichtet');
  };
  const promise = new Promise<T>((fertig) => {
    resolve = fertig;
  });
  return { promise, resolve };
}
