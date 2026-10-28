# Car Service Records

Mobile-first, installable web app (PWA) for tracking car maintenance. No server, no build step, no API keys. Data stays on the device (IndexedDB).

## Features
- **Multiple cars**: nickname, plate, make/model/year, odometer.
- **Service records**: snap or pick photos of the bill (camera opens on phones), mark the service date and odometer, and list the services with costs.
- **Google Maps**: each record shows the workshop on an embedded map plus an "Open in Google Maps" link. Type an address, or tap 📍 to use your current location.
- **Dashboards**: totals across all cars on the home screen. Per car: odometer, total and yearly spend, average km/month, cost per km, a 12-month spending chart, and the service history.
- **Maintenance suggestions**: for every service type a car has history for, the next due date and km are worked out from standard intervals (`SERVICE_TYPES` in `schedule.js`), whichever comes first. Due dates are pulled earlier using the car's real km/day trend. Items are marked ok / soon (≤30 days or ≤1,000 km) / overdue.
- **Reminders**:
  - 📅 adds a reminder to the phone calendar (`.ics` file, alerts 1 day before). This is the reliable option because it works when the app is closed.
  - 🔔 shows a notification for due items once a day, when the app is opened.
- **Backup / restore** as a JSON file, photos included.

## Run
```sh
npm start        # or: python3 -m http.server 8080
npm test         # scheduling logic tests (Node 20+)
```
Open http://localhost:8080. Camera, location and notifications need HTTPS or localhost. To use it on a phone, host the folder on any static HTTPS host (GitHub Pages, Netlify), open it and choose "Add to Home Screen".

## Files
| File | Purpose |
|---|---|
| `index.html`, `style.css` | Shell and styles (light/dark) |
| `app.js` | Views, routing, forms, photos, maps, reminders, backup |
| `schedule.js` | Maintenance intervals, suggestions, calendar export (unit-tested) |
| `db.js` | IndexedDB storage |
| `sw.js`, `manifest.webmanifest` | Offline support and installability |
