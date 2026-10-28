import * as db from './db.js';
import { SERVICE_TYPES, suggestions, currentKm, kmPerDay, readings, ics, iso } from './schedule.js';

const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const money = n => (n || 0).toLocaleString('en-MY', { style: 'currency', currency: 'MYR' });
const num = n => Math.round(n || 0).toLocaleString();
const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const total = r => r.items.reduce((s, i) => s + (+i.cost || 0), 0);
const recsOf = (records, carId) => records.filter(r => r.carId === carId).sort((a, b) => b.date.localeCompare(a.date));
const carName = c => esc(c.name || [c.make, c.model].join(' '));
const mapsLink = q => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const mapsEmbed = q => `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
const stat = (label, value) => `<div class="stat"><span>${label}</span><b>${value}</b></div>`;
const photoUrl = b => URL.createObjectURL(b); // shortcut: object URLs aren't revoked; fine for a session's worth of photos

let draftPhotos = []; // photos attached in the open record form

// ---------- views ----------

function home(_, cars, records) {
  const due = cars.flatMap(c => suggestions(c, recsOf(records, c.id)).filter(s => s.status !== 'ok'));
  return `
    <section class="stats">
      ${stat('Cars', cars.length)}${stat('Services', records.length)}
      ${stat('Total spent', money(records.reduce((s, r) => s + total(r), 0)))}${stat('Due / overdue', due.length)}
    </section>
    ${due.length ? `<h2>🔔 Reminders</h2>${dueList(due, cars)}` : ''}
    <h2>My cars</h2>
    <div class="cards">
      ${cars.map(c => carCard(c, recsOf(records, c.id))).join('') || '<p class="empty">No cars yet. Add your first car to start tracking services.</p>'}
    </div>
    <a class="btn primary block" href="#/car-edit">+ Add car</a>
    <h2>Settings</h2>
    <div class="row wrap">
      <button class="btn" data-act="notify">🔔 Enable reminder notifications</button>
      <button class="btn" data-act="export">⬇️ Backup data</button>
      <label class="btn">⬆️ Restore backup<input type="file" accept="application/json" id="import" hidden></label>
    </div>
    <p class="hint">Data stays on this device. Back up regularly, especially before clearing browser data.</p>`;
}

function carCard(c, recs) {
  const next = suggestions(c, recs)[0];
  return `<a class="card" href="#/car/${c.id}">
    <div class="row between"><b>${carName(c)}</b><span class="plate">${esc(c.plate)}</span></div>
    <small>${num(currentKm(c, recs))} km · ${recs.length} service${recs.length === 1 ? '' : 's'} · ${money(recs.reduce((s, r) => s + total(r), 0))}</small>
    ${next ? `<small>Next: ${esc(next.type)} — <span class="chip ${next.status}">${dueText(next)}</span></small>` : ''}
  </a>`;
}

function dueText(s) {
  const when = s.daysLeft < 0 ? `${-s.daysLeft} days overdue` : s.daysLeft === 0 ? 'today' : `in ${s.daysLeft} days`;
  const km = s.kmLeft === null ? '' : s.kmLeft <= 0 ? ` · ${num(-s.kmLeft)} km over` : ` · ${num(s.kmLeft)} km left`;
  return when + km;
}

function dueList(items, cars, showCar = true) {
  return `<ul class="list">${items.map(s => {
    const car = cars.find(c => c.id === s.carId);
    return `<li class="row between">
      <div><b>${esc(s.type)}</b>${showCar ? ` · <a href="#/car/${car.id}">${carName(car)}</a>` : ''}<br>
        <small>Due ${fmtDate(s.due)}${s.dueKm ? ` or ${num(s.dueKm)} km` : ''} · last done ${fmtDate(s.lastDate)}</small><br>
        <span class="chip ${s.status}">${dueText(s)}</span></div>
      <button class="btn icon" data-act="ics" data-car="${s.carId}" data-type="${esc(s.type)}" title="Add reminder to calendar" aria-label="Add ${esc(s.type)} reminder to calendar">📅</button>
    </li>`;
  }).join('')}</ul>`;
}

function carView(id, cars, records) {
  const c = cars.find(x => x.id === id);
  if (!c) return notFound();
  const recs = recsOf(records, id), sugg = suggestions(c, recs), spent = recs.reduce((s, r) => s + total(r), 0);
  const km = currentKm(c, recs), rate = kmPerDay(readings(c, recs)), year = String(new Date().getFullYear());
  const firstKm = Math.min(...recs.filter(r => +r.odometer).map(r => +r.odometer));
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 11 + i); return iso(d).slice(0, 7); });
  const byMonth = months.map(m => recs.filter(r => r.date.startsWith(m)).reduce((s, r) => s + total(r), 0));
  const max = Math.max(...byMonth, 1);
  return `
    <a href="#/" class="back">← All cars</a>
    <div class="row between"><h1>${carName(c)} <span class="plate">${esc(c.plate)}</span></h1><a class="btn" href="#/car-edit/${id}">Edit</a></div>
    <p class="muted">${esc([c.make, c.model, c.year].filter(Boolean).join(' · '))}</p>
    <section class="stats">
      ${stat('Odometer', num(km) + ' km')}${stat('Services', recs.length)}
      ${stat('Total spent', money(spent))}${stat(`Spent in ${year}`, money(recs.filter(r => r.date.startsWith(year)).reduce((s, r) => s + total(r), 0)))}
      ${stat('Avg distance', rate ? num(rate * 30.4) + ' km/mo' : '—')}${stat('Cost per km', km > firstKm ? money(spent / (km - firstKm)) : '—')}
    </section>
    <form id="odo" class="row"><input name="odometer" type="number" min="0" inputmode="numeric" placeholder="Update odometer (km)" aria-label="Current odometer in km" required><button class="btn">Update</button></form>
    <h2>Spending, last 12 months</h2>
    <div class="chart" role="img" aria-label="Monthly service spending">${byMonth.map((v, i) =>
      `<div title="${months[i]}: ${money(v)}"><i style="height:${(v / max) * 100}%"></i><small>${new Date(months[i] + '-01T00:00:00').toLocaleDateString(undefined, { month: 'narrow' })}</small></div>`).join('')}</div>
    <div class="row between"><h2>🔧 Upcoming maintenance</h2>${sugg.length ? '<button class="btn" data-act="ics-all" data-car="' + id + '">📅 Add all</button>' : ''}</div>
    ${sugg.length ? dueList(sugg, [c], false) : '<p class="empty">Add services to get maintenance suggestions.</p>'}
    <div class="row between"><h2>Service history</h2><a class="btn primary" href="#/new/${id}">+ Add service</a></div>
    <ul class="list">${recs.map(r => `<li><a class="row between" href="#/record/${r.id}">
      <div><b>${fmtDate(r.date)}</b> · ${esc(r.workshop || 'Workshop')}<br><small>${esc(r.items.map(i => i.type === 'Other' ? i.note || 'Other' : i.type).join(', '))}</small></div>
      <div class="right"><b>${money(total(r))}</b><br><small>${r.odometer ? num(r.odometer) + ' km' : ''} ${r.photos.length ? '📷' + r.photos.length : ''}</small></div>
    </a></li>`).join('') || '<li class="empty">No services recorded yet.</li>'}</ul>`;
}

function recordView(id, cars, records) {
  const r = records.find(x => x.id === id);
  if (!r) return notFound();
  const c = cars.find(x => x.id === r.carId) || {};
  const place = r.location || r.workshop;
  return `
    <a href="#/car/${r.carId}" class="back">← ${carName(c)}</a>
    <div class="row between"><h1>${fmtDate(r.date)}</h1><a class="btn" href="#/edit/${id}">Edit</a></div>
    <p class="muted">${r.odometer ? num(r.odometer) + ' km · ' : ''}${esc(r.workshop)}</p>
    <table><thead><tr><th>Service</th><th class="right">Cost</th></tr></thead><tbody>
      ${r.items.map(i => `<tr><td>${esc(i.type)}${i.note ? `<br><small>${esc(i.note)}</small>` : ''}</td><td class="right">${money(+i.cost)}</td></tr>`).join('')}
    </tbody><tfoot><tr><th>Total</th><th class="right">${money(total(r))}</th></tr></tfoot></table>
    ${r.notes ? `<p>${esc(r.notes)}</p>` : ''}
    ${place ? `<h2>📍 Workshop location</h2>
      <iframe class="map" src="${mapsEmbed(place)}" loading="lazy" title="Map of ${esc(r.workshop)}" referrerpolicy="no-referrer-when-downgrade"></iframe>
      <a class="btn block" href="${mapsLink(place)}" target="_blank" rel="noopener">Open in Google Maps</a>` : ''}
    ${r.photos.length ? `<h2>🧾 Bills & photos</h2><div class="photos">${r.photos.map(p => { const u = photoUrl(p); return `<a href="${u}" target="_blank"><img src="${u}" alt="Bill photo"></a>`; }).join('')}</div>` : ''}
    <button class="btn danger block" data-act="del-record" data-id="${id}">Delete record</button>`;
}

const itemRow = (it = {}) => `<div class="item">
  <select name="item-type" aria-label="Service type">${Object.keys(SERVICE_TYPES).map(t => `<option ${t === it.type ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
  <input name="item-note" placeholder="Details (part, brand…)" value="${esc(it.note)}" aria-label="Details">
  <input name="item-cost" type="number" min="0" step="0.01" inputmode="decimal" placeholder="RM" value="${esc(it.cost)}" aria-label="Cost">
  <button type="button" class="btn icon" data-act="del-item" aria-label="Remove item">✕</button>
</div>`;

function recordForm(r, cars) {
  if (!r) return notFound();
  draftPhotos = [...r.photos];
  return `
    <a href="${r.workshop !== undefined ? '#/record/' + r.id : '#/car/' + r.carId}" class="back">← Cancel</a>
    <h1>${r.workshop !== undefined ? 'Edit' : 'New'} service record</h1>
    <form id="record" data-id="${r.id}">
      <label>Car<select name="carId" required>${cars.map(c => `<option value="${c.id}" ${c.id === r.carId ? 'selected' : ''}>${carName(c)} ${esc(c.plate)}</option>`).join('')}</select></label>
      <fieldset><legend>🧾 Bill photos</legend>
        <div class="photos" id="thumbs"></div>
        <label class="btn block">📷 Snap / choose bill photo<input type="file" accept="image/*" capture="environment" multiple id="photo" hidden></label>
      </fieldset>
      <div class="row"><label>Service date<input type="date" name="date" value="${r.date}" max="${iso(new Date())}" required></label>
        <label>Odometer (km)<input type="number" name="odometer" min="0" inputmode="numeric" value="${esc(r.odometer)}"></label></div>
      <label>Workshop name<input name="workshop" value="${esc(r.workshop)}" placeholder="e.g. Bosch Car Service Setapak" required></label>
      <label>Workshop address / location
        <div class="row"><input name="location" value="${esc(r.location)}" placeholder="Address, or leave blank to search by name">
        <button type="button" class="btn" data-act="geo" title="Use my current location">📍 Here</button></div></label>
      <fieldset><legend>Services done</legend>
        <div id="items">${r.items.map(itemRow).join('')}</div>
        <button type="button" class="btn" data-act="add-item">+ Add item</button>
      </fieldset>
      <label>Notes<textarea name="notes" rows="3">${esc(r.notes)}</textarea></label>
      <button class="btn primary block">Save record</button>
    </form>`;
}

function carForm(id, cars) {
  const c = cars.find(x => x.id === id) || { id: crypto.randomUUID() };
  return `
    <a href="${id ? '#/car/' + id : '#/'}" class="back">← Cancel</a>
    <h1>${id ? 'Edit car' : 'Add car'}</h1>
    <form id="car" data-id="${c.id}">
      <label>Nickname<input name="name" value="${esc(c.name)}" placeholder="e.g. Family Myvi" required></label>
      <label>Plate number<input name="plate" value="${esc(c.plate)}" placeholder="e.g. WXY 1234" autocapitalize="characters"></label>
      <div class="row"><label>Make<input name="make" value="${esc(c.make)}" placeholder="Perodua"></label><label>Model<input name="model" value="${esc(c.model)}" placeholder="Myvi"></label></div>
      <div class="row"><label>Year<input name="year" type="number" min="1950" max="2100" value="${esc(c.year)}"></label>
        <label>Odometer (km)<input name="odometer" type="number" min="0" inputmode="numeric" value="${esc(c.odometer)}"></label></div>
      <button class="btn primary block">Save car</button>
    </form>
    ${id ? `<button class="btn danger block" data-act="del-car" data-id="${id}">Delete car and all its records</button>` : ''}`;
}

const notFound = () => '<p class="empty">Not found. <a href="#/">Go home</a></p>';

// ---------- router ----------

async function route() {
  const [, page, id] = location.hash.split('/');
  const [cars, records] = await Promise.all([db.all('cars'), db.all('records')]);
  const views = {
    car: carView, record: recordView, 'car-edit': carForm,
    new: carId => cars.length ? recordForm({ id: crypto.randomUUID(), carId: carId || cars[0].id, date: iso(new Date()), items: [{ type: 'Engine oil & filter' }], photos: [] }, cars) : carForm(undefined, cars),
    edit: rid => recordForm(records.find(r => r.id === rid), cars),
  };
  app.innerHTML = (views[page] || home)(id, cars, records);
  if (page === 'new' || page === 'edit') renderThumbs();
  scrollTo(0, 0);
  return { cars, records };
}

function renderThumbs() {
  document.getElementById('thumbs').innerHTML = draftPhotos.map((p, i) =>
    `<div class="thumb"><img src="${photoUrl(p)}" alt="Bill photo ${i + 1}"><button type="button" class="btn icon" data-act="del-photo" data-i="${i}" aria-label="Remove photo">✕</button></div>`).join('');
}

// Phone photos are 3–10 MB; shrink to ~1600px JPEG so hundreds of bills fit in browser storage.
async function shrink(file) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = Object.assign(document.createElement('canvas'), { width: img.width * scale, height: img.height * scale });
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.8));
}

function download(name, content, type) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([content], { type })), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const toDataUrl = blob => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });

// ---------- events ----------

document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, data = Object.fromEntries(new FormData(f));
  if (f.id === 'car') {
    const old = (await db.all('cars')).find(c => c.id === f.dataset.id) || {};
    const odometer = +data.odometer || 0;
    await db.put('cars', { ...old, ...data, id: f.dataset.id, odometer, odometerDate: odometer === old.odometer ? old.odometerDate : iso(new Date()) });
    location.hash = '#/car/' + f.dataset.id;
  } else if (f.id === 'record') {
    const fd = new FormData(f), notes = fd.getAll('item-note'), costs = fd.getAll('item-cost');
    const items = fd.getAll('item-type').map((type, i) => ({ type, note: notes[i].trim(), cost: costs[i] === '' ? '' : +costs[i] }));
    if (!items.length) return alert('Add at least one service item.');
    const { carId, date, workshop, location: loc, notes: n } = data;
    const odometer = data.odometer === '' ? '' : +data.odometer;
    await db.put('records', { id: f.dataset.id, carId, date, odometer, workshop: workshop.trim(), location: loc.trim(), notes: n.trim(), items, photos: draftPhotos });
    const car = (await db.all('cars')).find(c => c.id === carId);
    if (car && odometer > (+car.odometer || 0)) await db.put('cars', { ...car, odometer, odometerDate: date });
    location.hash = '#/record/' + f.dataset.id;
  } else if (f.id === 'odo') {
    const id = location.hash.split('/')[2], car = (await db.all('cars')).find(c => c.id === id);
    await db.put('cars', { ...car, odometer: +data.odometer, odometerDate: iso(new Date()) });
    route();
  }
});

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'add-item') document.getElementById('items').insertAdjacentHTML('beforeend', itemRow());
  if (act === 'del-item' && document.querySelectorAll('#items .item').length > 1) el.parentElement.remove();
  if (act === 'del-photo') { draftPhotos.splice(+el.dataset.i, 1); renderThumbs(); }
  if (act === 'geo') {
    const input = el.form.elements.location;
    if (!navigator.geolocation) return alert('Location is not available on this device.');
    el.disabled = true;
    navigator.geolocation.getCurrentPosition(
      p => { input.value = `${p.coords.latitude.toFixed(6)},${p.coords.longitude.toFixed(6)}`; el.disabled = false; },
      err => { alert('Could not get location: ' + err.message); el.disabled = false; },
      { enableHighAccuracy: true, timeout: 15000 });
  }
  if (act === 'del-record' && confirm('Delete this service record?')) {
    const r = (await db.all('records')).find(x => x.id === el.dataset.id);
    await db.del('records', el.dataset.id);
    location.hash = '#/car/' + r.carId;
  }
  if (act === 'del-car' && confirm('Delete this car and ALL its service records? This cannot be undone.')) {
    for (const r of (await db.all('records')).filter(r => r.carId === el.dataset.id)) await db.del('records', r.id);
    await db.del('cars', el.dataset.id);
    location.hash = '#/';
  }
  if (act === 'ics' || act === 'ics-all') {
    const [cars, records] = await Promise.all([db.all('cars'), db.all('records')]);
    const car = cars.find(c => c.id === el.dataset.car);
    const list = suggestions(car, records.filter(r => r.carId === car.id)).filter(s => act === 'ics-all' || s.type === el.dataset.type);
    download(`${car.name || 'car'}-maintenance.ics`, ics(list.map(s => ({
      uid: `${car.id}-${s.type}-${s.due}`.replace(/\W+/g, '-'), date: s.due,
      title: `${s.type} due — ${car.name} ${car.plate || ''}`.trim(),
      desc: `Last done ${s.lastDate}.${s.dueKm ? ` Due at ${s.dueKm} km.` : ''}`,
    }))), 'text/calendar');
  }
  if (act === 'notify') {
    if (!('Notification' in window)) return alert('Notifications are not supported here. Use 📅 to add reminders to your calendar instead.');
    if (await Notification.requestPermission() === 'granted') { localStorage.removeItem('notified'); notifyDue(await route()); }
  }
  if (act === 'export') {
    const [cars, records] = await Promise.all([db.all('cars'), db.all('records')]);
    const recs = await Promise.all(records.map(async r => ({ ...r, photos: await Promise.all(r.photos.map(toDataUrl)) })));
    download(`car-service-backup-${iso(new Date())}.json`, JSON.stringify({ version: 1, cars, records: recs }), 'application/json');
  }
});

document.addEventListener('change', async e => {
  if (e.target.id === 'photo') {
    for (const file of e.target.files) {
      try { draftPhotos.push(await shrink(file)); } catch { draftPhotos.push(file); } // unsupported format: keep the original
    }
    e.target.value = '';
    renderThumbs();
  }
  if (e.target.id === 'import') {
    try {
      const data = JSON.parse(await e.target.files[0].text());
      if (!Array.isArray(data.cars) || !Array.isArray(data.records)) throw new Error('Not a Car Service Records backup.');
      if (!confirm(`Restore ${data.cars.length} cars and ${data.records.length} records? Matching entries will be overwritten.`)) return;
      for (const c of data.cars) await db.put('cars', c);
      for (const r of data.records) await db.put('records', { ...r, photos: await Promise.all((r.photos || []).map(u => fetch(u).then(x => x.blob()))) });
      route();
    } catch (err) { alert('Restore failed: ' + err.message); }
    e.target.value = '';
  }
});

// Notify once per day about due/overdue items. Fires when the app is opened; calendar export covers the rest.
async function notifyDue({ cars, records }) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { if (localStorage.getItem('notified') === iso(new Date())) return; localStorage.setItem('notified', iso(new Date())); } catch {}
  const reg = await navigator.serviceWorker?.ready;
  for (const c of cars) for (const s of suggestions(c, recsOf(records, c.id)).filter(s => s.status !== 'ok')) {
    const opts = { body: `${c.name} ${c.plate || ''}: ${dueText(s)}`, tag: `${c.id}-${s.type}`, data: { url: `./#/car/${c.id}` } };
    reg ? reg.showNotification(`🔧 ${s.type}`, opts) : new Notification(`🔧 ${s.type}`, opts);
  }
}

window.addEventListener('hashchange', route);
navigator.serviceWorker?.register('sw.js');
navigator.storage?.persist?.();
route().then(notifyDue).catch(err => { app.innerHTML = `<p class="empty">Could not open storage: ${esc(err.message)}</p>`; });
