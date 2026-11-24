// Bindet unter Windows/MSVC das Manifest auch in Rust-Testprogramme ein.
fn main() {
    let attributes = tauri_build::Attributes::new();
    let attributes = if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
    {
        // Tauri verknüpft seine Manifest-Ressource nur mit der App. Der allgemeine
        // Linker-Auftrag gilt auch für Unit- und Integrationstests; ohne Common
        // Controls v6 können diese vor dem ersten Test mit 0xc0000139 abbrechen.
        // Siehe https://github.com/tauri-apps/tauri/issues/13419.
        let manifest =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows-app-manifest.xml");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
        // Die regulären Tauri-Ressourcen bleiben erhalten; ihr Manifest wird
        // durch die gemeinsame Einbindung ersetzt, damit es nicht doppelt ist.
        attributes.windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest())
    } else {
        attributes
    };

    tauri_build::try_build(attributes).expect("Tauri-Baukonfiguration fehlgeschlagen");
}
