// Einheitlicher Zugriff auf nach einem Panic weiterhin konsistente Zustände.
use std::sync::{Mutex, MutexGuard};

pub(crate) fn sperren<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    // Nur für geprüfte Zustände: ihre Änderungen bleiben auch bei einem Panic
    // konsistent. Vergiftung allein verwirft sie nicht; weitere Zugriffe nutzen
    // denselben Zustand. Gekoppelte, unvollständige Änderungen müssen stattdessen
    // am Zugriff mit begründeter Fehlerbehandlung gesperrt bleiben.
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vergiftete_sperre_liefert_den_erhaltenen_zustand() {
        let mutex = Mutex::new(Some(String::from("erhalten")));
        std::thread::scope(|scope| {
            assert!(scope
                .spawn(|| {
                    let _guard = mutex.lock().unwrap();
                    panic!("absichtliche Vergiftung");
                })
                .join()
                .is_err());
        });
        assert!(mutex.is_poisoned());
        assert_eq!(sperren(&mutex).take().as_deref(), Some("erhalten"));
        assert!(sperren(&mutex).is_none());
    }
}
