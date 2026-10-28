// Maintenance intervals (whichever comes first). Typical manufacturer guidance; adjust to your car's manual.
export const SERVICE_TYPES = {
  'Engine oil & filter': { km: 10000, months: 6 },
  'Tyre rotation': { km: 10000, months: 6 },
  'Wheel alignment & balancing': { km: 10000, months: 12 },
  'Air filter': { km: 20000, months: 12 },
  'Cabin (A/C) filter': { km: 20000, months: 12 },
  'Brake pads': { km: 40000, months: 24 },
  'Brake fluid': { km: 40000, months: 24 },
  'Coolant': { km: 40000, months: 24 },
  'Spark plugs': { km: 40000, months: 24 },
  'Transmission fluid': { km: 40000, months: 24 },
  'Battery': { km: null, months: 24 },
  'Tyres': { km: 50000, months: 48 },
  'Timing belt': { km: 100000, months: 60 },
  'Other': null,
};

const DAY = 864e5;
export const iso = d => d.toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d;
}

export const currentKm = (car, records) => Math.max(+car.odometer || 0, ...records.map(r => +r.odometer || 0));

// Service records plus the car's last manual odometer update count as readings.
export const readings = (car, records) => car.odometerDate ? [...records, { date: car.odometerDate, odometer: +car.odometer }] : records;

// Average daily distance from the oldest to newest odometer reading.
export function kmPerDay(records) {
  const pts = records.filter(r => +r.odometer).sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length < 2) return 0;
  const days = (Date.parse(pts.at(-1).date) - Date.parse(pts[0].date)) / DAY;
  return days > 0 ? Math.max(0, (pts.at(-1).odometer - pts[0].odometer) / days) : 0;
}

// Next due date for every service type the car has history for, soonest first.
export function suggestions(car, records, today = new Date()) {
  today = new Date(iso(today) + 'T00:00:00');
  const km = currentKm(car, records), rate = kmPerDay(readings(car, records)), last = {};
  for (const r of records) for (const it of r.items) {
    if (SERVICE_TYPES[it.type] && (!last[it.type] || r.date > last[it.type].date)) last[it.type] = r;
  }
  return Object.entries(last).map(([type, r]) => {
    const iv = SERVICE_TYPES[type];
    let due = addMonths(r.date, iv.months);
    const dueKm = iv.km && +r.odometer ? +r.odometer + iv.km : null;
    const kmLeft = dueKm && km ? dueKm - km : null;
    if (kmLeft !== null && rate) {
      const byKm = new Date(today.getTime() + Math.round(kmLeft / rate) * DAY);
      if (byKm < due) due = byKm;
    }
    const daysLeft = Math.round((due - today) / DAY);
    const status = daysLeft < 0 || kmLeft <= 0 && kmLeft !== null ? 'overdue'
      : daysLeft <= 30 || kmLeft !== null && kmLeft <= 1000 ? 'soon' : 'ok';
    return { type, carId: car.id, lastDate: r.date, due: iso(due), dueKm, kmLeft, daysLeft, status };
  }).sort((a, b) => a.due.localeCompare(b.due));
}

// iCalendar file with an all-day event + alarm the day before, so reminders fire from the phone's calendar.
export function ics(events) {
  const stamp = new Date().toISOString().replace(/[-:]|\.\d+/g, '');
  const esc = s => String(s).replace(/[\;,]/g, c => '\\' + c).replace(/\n/g, '\\n');
  const body = events.map(e => {
    const d = e.date.replaceAll('-', '');
    return ['BEGIN:VEVENT', `UID:${e.uid}@car-service-records`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d}`, `SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(e.desc || '')}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, 'TRIGGER:-P1D', 'END:VALARM', 'END:VEVENT'];
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Car Service Records//EN', ...body.flat(), 'END:VCALENDAR'].join('\r\n');
}
