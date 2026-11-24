// ziehvorschau.start.ts – Minimaler Seiteneinstieg ohne App, React oder Tauri-API.
import { stelleZiehvorschauDar } from './ziehvorschau.darstellung';

stelleZiehvorschauDar(document, new URLSearchParams(window.location.search));
