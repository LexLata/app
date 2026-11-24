// Nachweis der echten Sicherungsbefehle einschließlich Quellenschutz.
use super::*;

#[test]
fn versionssicherung_kopiert_vollstaendig_mit_eindeutigen_namen_und_erhaelt_original() {
    let ordner = super::tests::TestOrdner::neu();
    let pfad = Path::new("daten.xml");
    let original = b"\xef\xbb\xbf<daten version=\"2\"><unbekannt>\xc3\xa4</unbekannt></daten>\r\n";
    fs::write(ordner.0.join(pfad), original).unwrap();
    let erste = archivieren::sichere_abweichende_version_in_basis(&ordner.0, pfad).unwrap();
    let zweite = archivieren::sichere_abweichende_version_in_basis(&ordner.0, pfad).unwrap();
    assert_ne!(erste, zweite);
    for sicherung in [erste, zweite] {
        assert!(sicherung.starts_with("daten.xml.abweichende-version-"));
        assert!(sicherung.ends_with(".bak"));
        assert!(!sicherung.contains(':'));
        assert_eq!(fs::read(ordner.0.join(sicherung)).unwrap(), original);
    }
    assert_eq!(fs::read(ordner.0.join(pfad)).unwrap(), original);
}

#[test]
fn echter_versionssicherungsbefehl_verlangt_vorgang_nur_fuer_markierungen() {
    let sperren = super::super::DateiSperren::default();
    let app = tauri::test::mock_builder()
        .manage(sperren.clone())
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let main = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let window = main.as_ref().window();
    let sitzung = super::super::datei_sperre::fenster_sitzung(&window).unwrap();
    let frist = std::time::Duration::from_secs(2);
    let konflikt_token = tauri::async_runtime::block_on(sperren.erwerben(
        sitzung,
        "markierungskonflikte.xml",
        frist,
    ))
    .unwrap();
    let vorgang = sperren
        .vorgang_registrieren(sitzung, &konflikt_token)
        .unwrap();
    sperren.freigeben(sitzung, &konflikt_token).unwrap();
    let basis = crate::app_daten_basis_pfad(app.handle()).unwrap();
    // Eindeutige Testdateien: weder vorhandene Nutzerdaten lesen noch überschreiben.
    let kennung = super::tests::TestOrdner::neu();
    let name = kennung.0.file_name().unwrap().to_string_lossy();
    for ordner in ["markierungen", "favoriten"] {
        fs::create_dir_all(basis.join(ordner)).unwrap();
        let pfad = format!("{ordner}/{name}.xml");
        fs::write(basis.join(&pfad), "Original").unwrap();
        let token =
            tauri::async_runtime::block_on(sperren.erwerben(sitzung, &pfad, frist)).unwrap();
        let aufruf = |v: Option<String>| {
            tauri::async_runtime::block_on(sichere_abweichende_version(
                app.handle().clone(),
                window.clone(),
                Some(token.clone()),
                v,
                pfad.clone(),
            ))
        };
        let (erlaubt, verboten) = if ordner == "markierungen" {
            (Some(vorgang.clone()), None)
        } else {
            (None, Some(vorgang.clone()))
        };
        let fehler = aufruf(verboten).unwrap_err();
        assert!(fehler.contains(if ordner == "markierungen" {
            "vorgemerkten Vorgang"
        } else {
            "nicht erlaubt"
        }));
        let sicherung = aufruf(erlaubt).unwrap();
        assert_eq!(
            fs::read_to_string(basis.join(&sicherung)).unwrap(),
            "Original"
        );
        assert_eq!(fs::read_to_string(basis.join(&pfad)).unwrap(), "Original");
        fs::remove_file(basis.join(sicherung)).unwrap();
        fs::remove_file(basis.join(pfad)).unwrap();
        sperren.freigeben(sitzung, &token).unwrap();
    }
}
