# Librata Zazen

A quiet meditation timer. Sessions are albums, sections are tracks: press
begin and the timer plays through settling, breath, and return, ringing
bells at each boundary, exactly like a music player moving through an
album.

## Local development

No build step, no dependencies. Serve the repo root and open it:

```
python -m http.server
```

Then visit `http://localhost:8000`.

## Architecture

See `docs/PLAN.md` for the product spec and `docs/ARCHITECTURE.md` for
the module contract (file map, data model, engine API). `docs/DESIGN-NOTES.md`
covers voice and visual rules.

## Offline and installable

Librata Zazen is an offline-first Progressive Web App. `sw.js` precaches
the full app shell, fonts, icons, and manifest on install, then serves
everything cache-first; there is no runtime network call after that.
Install it from the browser's "add to home screen" prompt for a
standalone, full-screen app.

## License

Librata Zazen is free software, licensed under the GNU Affero General
Public License v3.0. See `LICENSE` for the full text.

```
+------------------------------------------------------------------------+
|  SYSTEM AUDITABILITY SPECIFICATIONS                                    |
|  - License:        GNU AGPLv3 (Fully Copyleft, Non-Enclosable Source)  |
|  - Telemetry:      0.00% Tracking SDKs, 0.00% Third-Party Network Calls|
|  - Accounts:       None Required, None Offered                         |
|  - Infrastructure: Zero-Knowledge, Client-Side Local Storage Only      |
|  - Connectivity:   100% Offline-Capable (No server handshake required) |
|  - Version Control: Openly auditable via GitHub/Librata                |
+------------------------------------------------------------------------+
```
