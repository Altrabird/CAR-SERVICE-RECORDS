import * as db from './db.js';
import { icon } from './icons.js';
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
const stat = (ic, label, value) => `<div class="stat">${icon(ic)}<span>${label}</span><b>${value}</b></div>`;
const STATUS_ICON = { ok: 'circle-check', soon: 'clock', overdue: 'triangle-alert' };
const chip = s => `<span class="chip ${s.status}">${icon(STATUS_ICON[s.status])}${dueText(s)}</span>`;
const photoUrl = b => URL.createObjectURL(b); // shortcut: object URLs aren't revoked; fine for a session's worth of photos

let draftPhotos = []; // photos attached in the open record form
let installEvent;     // deferred beforeinstallprompt (Chrome/Android/Edge)

// ---------- views ----------

function home(_, cars, records) {
  const due = cars.flatMap(c => suggestions(c, recsOf(records, c.id)).filter(s => s.status !== 'ok'));
  const ios = /iphone|ipad/i.test(navigator.userAgent) && !navigator.standalone;
  return `
    <section class="stats">
      ${stat('car', 'Cars', cars.length)}${stat('wrench', 'Services', records.length)}
      ${stat('receipt', 'Total spent', money(records.reduce((s, r) => s + total(r), 0)))}${stat('bell', 'Due / overdue', due.length)}
    </section>
    ${due.length ? `<h2>${icon('bell')} Reminders</h2>${dueList(due, cars)}` : ''}
    <div class="row between"><h2>${icon('car')} My cars</h2><a class="btn primary" href="#/car-edit">${icon('plus')} Add car</a></div>
    <div class="cards">
      ${cars.map(c => carCard(c, recsOf(records, c.id))).join('') || `<div class="empty">${icon('car')}<p>No cars yet. Add your first car to start tracking services.</p></div>`}
    </div>
    <h2>Settings</h2>
    <div class="row wrap">
      <button class="btn" data-act="notify">${icon('bell')} Enable notifications</button>
      <button class="btn" data-act="export">${icon('download')} Backup (JSON)</button>
      <label class="btn">${icon('upload')} Restore backup<input type="file" accept="application/json" id="import" hidden></label>
      <button class="btn" data-act="export-sql">${icon('database')} Export SQLite</button>
    </div>
    ${ios ? `<p class="hint">${icon('smartphone')} To install on iPhone: tap Share, then “Add to Home Screen”.</p>` : ''}
    <p class="hint">Data is stored in a SQLite database on this device. Back up regularly, especially before clearing browser data.</p>`;
}

function carCard(c, recs) {
  const next = suggestions(c, recs)[0];
  return `<a class="card" href="#/car/${c.id}">
    <div class="row between"><b>${carName(c)}</b>${c.plate ? `<span class="plate">${esc(c.plate)}</span>` : ''}</div>
    <small class="mono">${num(currentKm(c, recs))} km · ${recs.length} service${recs.length === 1 ? '' : 's'} · ${money(recs.reduce((s, r) => s + total(r), 0))}</small>
    ${next ? `<small>Next: ${esc(next.type)}</small>${chip(next)}` : ''}
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
        <small>Due ${fmtDate(s.due)}${s.dueKm ? ` or ${num(s.dueKm)} km` : ''} · last done ${fmtDate(s.lastDate)}</small><br>${chip(s)}</div>
      <button class="btn icon" data-act="ics" data-car="${s.carId}" data-type="${esc(s.type)}" aria-label="Add ${esc(s.type)} reminder to calendar" title="Add to calendar">${icon('calendar-plus')}</button>
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
    <a href="#/" class="back">${icon('chevron-left')} All cars</a>
    <div class="row between"><h1>${carName(c)} ${c.plate ? `<span class="plate">${esc(c.plate)}</span>` : ''}</h1>
      <a class="btn icon" href="#/car-edit/${id}" aria-label="Edit car" title="Edit car">${icon('pencil')}</a></div>
    <p class="muted">${esc([c.make, c.model, c.year].filter(Boolean).join(' · '))}</p>
    <section class="stats">
      ${stat('gauge', 'Odometer', num(km) + ' km')}${stat('wrench', 'Services', recs.length)}
      ${stat('receipt', 'Total spent', money(spent))}${stat('receipt', `Spent in ${year}`, money(recs.filter(r => r.date.startsWith(year)).reduce((s, r) => s + total(r), 0)))}
      ${stat('car', 'Avg distance', rate ? num(rate * 30.4) + ' km/mo' : '—')}${stat('gauge', 'Cost per km', km > firstKm ? money(spent / (km - firstKm)) : '—')}
    </section>
    <form id="odo" class="row"><input name="odometer" type="number" min="0" inputmode="numeric" placeholder="Update odometer (km)" aria-label="Current odometer in km" required><button class="btn">${icon('gauge')} Update</button></form>
    <h2>Spending, last 12 months</h2>
    <div class="chart" role="img" aria-label="Monthly service spending, last 12 months">${byMonth.map((v, i) =>
      `<div title="${months[i]}: ${money(v)}"><i style="height:${(v / max) * 100}%"></i><small>${new Date(months[i] + '-01T00:00:00').toLocaleDateString(undefined, { month: 'narrow' })}</small></div>`).join('')}</div>
    <div class="row between"><h2>${icon('wrench')} Upcoming maintenance</h2>${sugg.length ? `<button class="btn" data-act="ics-all" data-car="${id}">${icon('calendar-plus')} Add all</button>` : ''}</div>
    ${sugg.length ? dueList(sugg, [c], false) : `<div class="empty">${icon('wrench')}<p>Add services to get maintenance suggestions.</p></div>`}
    <div class="row between"><h2>${icon('receipt')} Service history</h2><a class="btn primary" href="#/new/${id}">${icon('plus')} Add service</a></div>
    <ul class="list">${recs.map(r => `<li><a class="row between" href="#/record/${r.id}">
      <div><b>${fmtDate(r.date)}</b> · ${esc(r.workshop || 'Workshop')}<br><small>${esc(r.items.map(i => i.type === 'Other' ? i.note || 'Other' : i.type).join(', '))}</small></div>
      <div class="right"><b class="mono">${money(total(r))}</b><br><small>${r.odometer ? num(r.odometer) + ' km' : ''}${r.photoCount ? ` · ${icon('camera')}${r.photoCount}` : ''}</small></div>
    </a></li>`).join('') || '<li class="muted">No services recorded yet.</li>'}</ul>`;
}

function recordView(id, cars, records, pics) {
  const r = records.find(x => x.id === id);
  if (!r) return notFound();
  const c = cars.find(x => x.id === r.carId) || {};
  const place = r.location || r.workshop;
  return `
    <a href="#/car/${r.carId}" class="back">${icon('chevron-left')} ${carName(c)}</a>
    <div class="row between"><h1>${fmtDate(r.date)}</h1><a class="btn icon" href="#/edit/${id}" aria-label="Edit record" title="Edit record">${icon('pencil')}</a></div>
    <p class="muted">${r.odometer ? num(r.odometer) + ' km · ' : ''}${esc(r.workshop)}</p>
    <table><thead><tr><th>Service</th><th class="right">Cost</th></tr></thead><tbody>
      ${r.items.map(i => `<tr><td>${esc(i.type)}${i.note ? `<br><small>${esc(i.note)}</small>` : ''}</td><td class="right mono">${money(+i.cost)}</td></tr>`).join('')}
    </tbody><tfoot><tr><th>Total</th><th class="right mono">${money(total(r))}</th></tr></tfoot></table>
    ${r.notes ? `<p>${esc(r.notes)}</p>` : ''}
    ${place ? `<h2>${icon('map-pin')} Workshop location</h2>
      <iframe class="map" src="${mapsEmbed(place)}" loading="lazy" title="Map of ${esc(r.workshop)}" referrerpolicy="no-referrer-when-downgrade"></iframe>
      <a class="btn block" href="${mapsLink(place)}" target="_blank" rel="noopener">${icon('navigation')} Open in Google Maps</a>` : ''}
    ${pics.length ? `<h2>${icon('receipt')} Bills & photos</h2><div class="photos">${pics.map((p, i) => { const u = photoUrl(p); return `<a href="${u}" target="_blank"><img src="${u}" alt="Bill photo ${i + 1}"></a>`; }).join('')}</div>` : ''}
    <button class="btn danger block" data-act="del-record" data-id="${id}" data-car="${r.carId}">${icon('trash-2')} Delete record</button>`;
}

const itemRow = (it = {}) => `<div class="item">
  <select name="item-type" aria-label="Service type">${Object.keys(SERVICE_TYPES).map(t => `<option ${t === it.type ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
  <input name="item-note" placeholder="Details (part, brand…)" value="${esc(it.note)}" aria-label="Details">
  <input name="item-cost" type="number" min="0" step="0.01" inputmode="decimal" placeholder="RM" value="${esc(it.cost)}" aria-label="Cost (RM)">
  <button type="button" class="btn icon" data-act="del-item" aria-label="Remove item">${icon('x')}</button>
</div>`;

function recordForm(r, cars, isNew, pics = []) {
  if (!r) return notFound();
  draftPhotos = [...pics];
  return `
    <a href="${isNew ? '#/car/' + r.carId : '#/record/' + r.id}" class="back">${icon('chevron-left')} Cancel</a>
    <h1>${isNew ? 'New' : 'Edit'} service record</h1>
    <form id="record" data-id="${r.id}">
      <label>Car<select name="carId" required>${cars.map(c => `<option value="${c.id}" ${c.id === r.carId ? 'selected' : ''}>${carName(c)} ${esc(c.plate)}</option>`).join('')}</select></label>
      <fieldset><legend>${icon('receipt')} Bill photos</legend>
        <div class="photos" id="thumbs"></div>
        <label class="btn block">${icon('camera')} Snap or choose bill photo<input type="file" accept="image/*" capture="environment" multiple id="photo" hidden></label>
      </fieldset>
      <div class="row"><label>Service date<input type="date" name="date" value="${r.date}" max="${iso(new Date())}" required></label>
        <label>Odometer (km)<input type="number" name="odometer" min="0" inputmode="numeric" value="${esc(r.odometer)}"></label></div>
      <label>Workshop name<input name="workshop" value="${esc(r.workshop)}" placeholder="e.g. Bosch Car Service Setapak" required></label>
      <label>Workshop address / location
        <div class="row"><input name="location" value="${esc(r.location)}" placeholder="Address, or blank to search by name">
        <button type="button" class="btn" data-act="geo" title="Use my current location">${icon('locate-fixed')} Here</button></div></label>
      <fieldset><legend>${icon('wrench')} Services done</legend>
        <div id="items">${r.items.map(itemRow).join('')}</div>
        <button type="button" class="btn" data-act="add-item">${icon('plus')} Add item</button>
      </fieldset>
      <label>Notes<textarea name="notes" rows="3">${esc(r.notes)}</textarea></label>
      <button class="btn primary block">Save record</button>
    </form>`;
}

function carForm(id, cars) {
  const c = cars.find(x => x.id === id) || { id: crypto.randomUUID() };
  return `
    <a href="${id ? '#/car/' + id : '#/'}" class="back">${icon('chevron-left')} Cancel</a>
    <h1>${id ? 'Edit car' : 'Add car'}</h1>
    <form id="car" data-id="${c.id}">
      <label>Nickname<input name="name" value="${esc(c.name)}" placeholder="e.g. Family Myvi" required></label>
      <label>Plate number<input name="plate" value="${esc(c.plate)}" placeholder="e.g. WXY 1234" autocapitalize="characters"></label>
      <div class="row"><label>Make<input name="make" value="${esc(c.make)}" placeholder="Perodua"></label><label>Model<input name="model" value="${esc(c.model)}" placeholder="Myvi"></label></div>
      <div class="row"><label>Year<input name="year" type="number" min="1950" max="2100" value="${esc(c.year)}"></label>
        <label>Odometer (km)<input name="odometer" type="number" min="0" inputmode="numeric" value="${esc(c.odometer)}"></label></div>
      <button class="btn primary block">Save car</button>
    </form>
    ${id ? `<button class="btn danger block" data-act="del-car" data-id="${id}">${icon('trash-2')} Delete car and all its records</button>` : ''}`;
}

const notFound = () => '<div class="empty"><p>Not found. <a href="#/">Go home</a></p></div>';

// ---------- router ----------

async function route() {
  const [, page, id] = location.hash.split('/');
  const [cars, records, pics] = await Promise.all([db.cars(), db.records(), page === 'record' || page === 'edit' ? db.photos(id) : []]);
  const views = {
    car: carView, record: recordView, 'car-edit': carForm,
    new: carId => cars.length ? recordForm({ id: crypto.randomUUID(), carId: carId || cars[0].id, date: iso(new Date()), items: [{ type: 'Engine oil & filter' }] }, cars, true) : carForm(undefined, cars),
    edit: rid => recordForm(records.find(r => r.id === rid), cars, false, pics),
  };
  app.innerHTML = (views[page] || home)(id, cars, records, pics);
  if (page === 'new' || page === 'edit') renderThumbs();
  scrollTo(0, 0);
  return { cars, records };
}

function renderThumbs() {
  const el = document.getElementById('thumbs');
  if (el) el.innerHTML = draftPhotos.map((p, i) =>
    `<div class="thumb"><img src="${photoUrl(p)}" alt="Bill photo ${i + 1}"><button type="button" class="btn icon" data-act="del-photo" data-i="${i}" aria-label="Remove photo ${i + 1}">${icon('x')}</button></div>`).join('');
}

// Phone photos are 3–10 MB; shrink to ~1600px JPEG so hundreds of bills fit in the database.
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
  const btn = f.querySelector('button:not([type=button])');
  btn.disabled = true; // prevent double-saves while the database writes
  try {
    if (f.id === 'car') {
      const old = (await db.cars()).find(c => c.id === f.dataset.id) || {};
      const odometer = +data.odometer || 0;
      await db.saveCar({ ...data, id: f.dataset.id, odometer, odometerDate: odometer === old.odometer ? old.odometerDate : iso(new Date()) });
      location.hash = '#/car/' + f.dataset.id;
    } else if (f.id === 'record') {
      const fd = new FormData(f), notes = fd.getAll('item-note'), costs = fd.getAll('item-cost');
      const items = fd.getAll('item-type').map((type, i) => ({ type, note: notes[i].trim(), cost: costs[i] }));
      if (!items.length) return alert('Add at least one service item.');
      const odometer = data.odometer === '' ? null : +data.odometer;
      await db.saveRecord({ id: f.dataset.id, carId: data.carId, date: data.date, odometer, workshop: data.workshop.trim(),
        location: data.location.trim(), notes: data.notes.trim(), items }, draftPhotos);
      const car = (await db.cars()).find(c => c.id === data.carId);
      if (car && odometer > (+car.odometer || 0)) await db.saveCar({ ...car, odometer, odometerDate: data.date });
      location.hash = '#/record/' + f.dataset.id;
    } else if (f.id === 'odo') {
      const car = (await db.cars()).find(c => c.id === location.hash.split('/')[2]);
      await db.saveCar({ ...car, odometer: +data.odometer, odometerDate: iso(new Date()) });
      route();
    }
  } catch (err) {
    alert('Could not save: ' + err.message);
  } finally {
    btn.disabled = false;
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
    await db.deleteRecord(el.dataset.id);
    location.hash = '#/car/' + el.dataset.car;
  }
  if (act === 'del-car' && confirm('Delete this car and ALL its service records? This cannot be undone.')) {
    await db.deleteCar(el.dataset.id); // records, items and photos cascade
    location.hash = '#/';
  }
  if (act === 'ics' || act === 'ics-all') {
    const [cars, records] = await Promise.all([db.cars(), db.records()]);
    const car = cars.find(c => c.id === el.dataset.car);
    const list = suggestions(car, recsOf(records, car.id)).filter(s => act === 'ics-all' || s.type === el.dataset.type);
    download(`${car.name || 'car'}-maintenance.ics`, ics(list.map(s => ({
      uid: `${car.id}-${s.type}-${s.due}`.replace(/\W+/g, '-'), date: s.due,
      title: `${s.type} due — ${car.name} ${car.plate || ''}`.trim(),
      desc: `Last done ${s.lastDate}.${s.dueKm ? ` Due at ${s.dueKm} km.` : ''}`,
    }))), 'text/calendar');
  }
  if (act === 'notify') {
    if (!('Notification' in window)) return alert('Notifications are not supported here. Use the calendar button to add reminders instead.');
    if (await Notification.requestPermission() === 'granted') { try { localStorage.removeItem('notified'); } catch {} notifyDue(await route()); }
  }
  if (act === 'export') {
    const [cars, records] = await Promise.all([db.cars(), db.records()]);
    const recs = await Promise.all(records.map(async r => ({ ...r, photos: await Promise.all((await db.photos(r.id)).map(toDataUrl)) })));
    download(`car-service-backup-${iso(new Date())}.json`, JSON.stringify({ version: 2, cars, records: recs }), 'application/json');
  }
  if (act === 'export-sql') download(`car-service-${iso(new Date())}.sqlite3`, await db.exportFile(), 'application/vnd.sqlite3');
  if (act === 'install' && installEvent) {
    installEvent.prompt();
    installEvent = null;
    el.hidden = true;
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
      for (const c of data.cars) await db.saveCar(c);
      for (const r of data.records) await db.saveRecord(r, await Promise.all((r.photos || []).map(u => fetch(u).then(x => x.blob()))));
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
    const opts = { body: `${c.name} ${c.plate || ''}: ${dueText(s)}`, tag: `${c.id}-${s.type}`, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: `./#/car/${c.id}` } };
    reg ? reg.showNotification(s.type, opts) : new Notification(s.type, opts);
  }
}

function showError(err) {
  app.innerHTML = `<div class="empty">${icon('triangle-alert')}<p><b>Could not open the database.</b><br>
    If the app is open in another tab or window, close it and reload. Otherwise this browser may not support on-device storage (needs Chrome 108+, Safari 16.4+ or Firefox 111+).</p><small>${esc(err.message)}</small></div>`;
}

addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; document.getElementById('install').hidden = false; });
addEventListener('hashchange', () => route().catch(showError));
navigator.serviceWorker?.register('sw.js');
navigator.storage?.persist?.();
route().then(notifyDue, showError);
