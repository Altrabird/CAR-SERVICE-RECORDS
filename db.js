// Supabase (Postgres) backend. Row-level security limits every query to the signed-in user's rows,
// so the publishable key below is safe to ship in the page.
const sb = window.supabase.createClient('https://zqsuxefvtgkizjoptqpq.supabase.co', 'sb_publishable_usxfBggvd94xjdFGiSbpOw_49lutCwR');
const BUCKET = 'bills'; // private storage bucket, files live under "<user_id>/<record_id>/"

const ok = ({ data, error }) => { if (error) throw error; return data; };
const n = v => v === '' || v === undefined || v === null || isNaN(+v) ? null : +v;
const removeFiles = async paths => { if (paths.length) ok(await sb.storage.from(BUCKET).remove(paths)); };

// ---------- auth ----------
export const session = async () => ok(await sb.auth.getSession()).session;
export const signIn = async (email, password) => ok(await sb.auth.signInWithPassword({ email, password }));
export const signUp = async (email, password) =>
  ok(await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } }));
export const signOut = () => sb.auth.signOut({ scope: 'local' }); // this device only
export const onAuthChange = cb => sb.auth.onAuthStateChange(event => (event === 'SIGNED_IN' || event === 'SIGNED_OUT') && setTimeout(cb));

// ---------- data ----------
export const cars = async () =>
  ok(await sb.from('cars').select('id, name, plate, make, model, year, odometer, odometerDate:odometer_date').order('name'));

export const records = async () =>
  ok(await sb.from('records').select('id, carId:car_id, date, odometer, workshop, location, notes, items, photos').order('date', { ascending: false }))
    .map(r => ({ ...r, photoCount: r.photos.length }));

// Downloads a record's bill photos as Blobs tagged with their storage path, so saveRecord can tell kept from new.
export async function photos(recordId) {
  const row = ok(await sb.from('records').select('photos').eq('id', recordId).maybeSingle());
  return Promise.all((row?.photos || []).map(async path => Object.assign(ok(await sb.storage.from(BUCKET).download(path)), { path })));
}

export const saveCar = async c => ok(await sb.from('cars').upsert({
  id: c.id, name: c.name, plate: c.plate || null, make: c.make || null, model: c.model || null,
  year: n(c.year), odometer: n(c.odometer), odometer_date: c.odometerDate || null,
}));

// Uploads new photos first, then saves the row (with its items) in one request, then removes dropped photos.
// A failure part-way leaves at worst an orphaned file, never a record pointing at a missing one.
export async function saveRecord(r, photoBlobs) {
  const userId = (await session()).user.id;
  const old = ok(await sb.from('records').select('photos').eq('id', r.id).maybeSingle())?.photos || [];
  const paths = [];
  for (const b of photoBlobs) {
    if (b.path) { paths.push(b.path); continue; }
    const type = b.type || 'image/jpeg', path = `${userId}/${r.id}/${crypto.randomUUID()}.${type.split('/')[1]}`;
    ok(await sb.storage.from(BUCKET).upload(path, b, { contentType: type }));
    paths.push(path);
  }
  ok(await sb.from('records').upsert({
    id: r.id, car_id: r.carId, date: r.date, odometer: n(r.odometer),
    workshop: r.workshop || null, location: r.location || null, notes: r.notes || null,
    items: r.items.map(i => ({ type: i.type, note: i.note || null, cost: n(i.cost) })), photos: paths,
  }));
  await removeFiles(old.filter(p => !paths.includes(p)));
}

export async function deleteRecord(id) {
  await removeFiles(ok(await sb.from('records').delete().eq('id', id).select('photos')).flatMap(r => r.photos));
}

export async function deleteCar(id) {
  const recs = ok(await sb.from('records').select('photos').eq('car_id', id));
  ok(await sb.from('cars').delete().eq('id', id)); // records cascade in the database
  await removeFiles(recs.flatMap(r => r.photos));
}
