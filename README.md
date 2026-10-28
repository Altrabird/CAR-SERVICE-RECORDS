# Car Service Records

Mobile-first, installable web app (PWA) for tracking car maintenance. No build step. Data is stored in **Supabase** (Postgres) and syncs across devices.

![Car dashboard](screenshots/wide.png)

## Features
- **Multiple cars**: nickname, plate, make/model/year, odometer.
- **Service records**: snap or pick photos of the bill (camera opens on phones), mark the service date and odometer, and list the services with costs.
- **Google Maps**: each record shows the workshop on an embedded map plus an "Open in Google Maps" link. Type an address, or tap 📍 to use your current location.
- **Dashboards**: totals across all cars on the home screen. Per car: odometer, total and yearly spend, average km/month, cost per km, a 12-month spending chart, and the service history.
- **Maintenance suggestions**: for every service type a car has history for, the next due date and km are worked out from standard intervals (`SERVICE_TYPES` in `schedule.js`), whichever comes first. Due dates are pulled earlier using the car's real km/day trend. Items are marked ok / soon (≤30 days or ≤1,000 km) / overdue.
- **Reminders**:
  - 📅 adds a reminder to the phone calendar (`.ics` file, alerts 1 day before). This is the reliable option because it works when the app is closed.
  - 🔔 shows a notification for due items once a day, when the app is opened.
- **Accounts**: sign in with email and password. Data and bill photos sync across all your devices.
- **Backup / restore** as a JSON file, photos included. Restore also imports backups made by the earlier on-device version.
- **Installable PWA**: app screens load offline (data needs internet), with PNG + maskable icons, store screenshots, an "Add service" shortcut and an in-app Install button (on iPhone: Share, then Add to Home Screen).

## Database (Supabase / Postgres)
Data is stored in Supabase (project `zqsuxefvtgkizjoptqpq`, Singapore region), so it syncs across devices. Users sign in with email and password.

```sql
cars    (id PK, user_id → auth.users, name, plate, make, model, year, odometer, odometer_date)
records (id PK, user_id, car_id, date, odometer, workshop, location, notes,
         items jsonb,     -- [{type, note, cost}], saved together with the record in one request
         photos text[])   -- paths in the private "bills" storage bucket
         FK (car_id, user_id) → cars ON DELETE CASCADE
```
- Row-level security on both tables, and on the `bills` bucket (`<user_id>/…` folders only), means each user can only read or change their own rows and photos.
- The composite foreign key stops a record from being attached to another user's car.
- The publishable key in `db.js` is meant to be public. Security comes from the rules above, not from hiding the key.
- All queries live in `db.js`.

### Supabase dashboard settings (one-time)
- **Authentication → URL Configuration:** set **Site URL** to where the app is hosted (e.g. `https://<you>.github.io/car-service-records/`) and add the same URL under **Redirect URLs**. Email confirmation links open this address.
- **Email confirmation:** the built-in email service only sends to members of your Supabase team. For other people to sign up, either turn off **Confirm email** (Authentication → Sign In / Providers → Email), or set up your own SMTP server under Authentication → Emails.

## Design
The design system came from the UI UX Pro Max skill (automotive palette): slate `#1E293B` primary, action red `#DC2626` buttons, Fira Sans text with Fira Code numbers, Lucide SVG icons, 44px touch targets, visible focus, light and dark themes, and reduced motion when the phone asks for it. Fonts and icons are self-hosted.

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
| `db.js` | Supabase auth, queries and photo storage |
| `icons.js` | Lucide icons (ISC) |
| `sw.js`, `manifest.webmanifest`, `icons/`, `screenshots/` | Offline support and installability |
| `vendor/` | supabase-js 2.118.0 (MIT), Fira fonts (OFL) |
