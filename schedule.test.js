import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestions, kmPerDay, ics } from './schedule.js';

const car = { id: 'c1', odometer: 0 };
const today = new Date('2026-06-01T00:00:00');

test('date-based due when no mileage trend', () => {
  const [s] = suggestions(car, [{ date: '2026-01-01', odometer: 50000, items: [{ type: 'Engine oil & filter' }] }], today);
  assert.equal(s.due, '2026-07-01');
  assert.equal(s.status, 'soon');
  assert.equal(s.dueKm, 60000);
});

test('mileage trend pulls due date earlier and flags overdue km', () => {
  const recs = [
    { date: '2026-01-01', odometer: 50000, items: [{ type: 'Engine oil & filter' }] },
    { date: '2026-05-01', odometer: 61000, items: [{ type: 'Other' }] },
  ];
  assert.ok(kmPerDay(recs) > 90);
  const [s] = suggestions(car, recs, today);
  assert.equal(s.kmLeft, -1000);
  assert.equal(s.status, 'overdue');
});

test('latest record of a type wins; Other is never suggested', () => {
  const recs = [
    { date: '2025-01-01', items: [{ type: 'Battery' }, { type: 'Other' }] },
    { date: '2026-05-01', items: [{ type: 'Battery' }] },
  ];
  const s = suggestions(car, recs, today);
  assert.equal(s.length, 1);
  assert.equal(s[0].due, '2028-05-01');
  assert.equal(s[0].status, 'ok');
});

test('ics escapes and has alarm', () => {
  const out = ics([{ uid: 'x', date: '2026-07-01', title: 'Oil, filter; Myvi' }]);
  assert.match(out, /DTSTART;VALUE=DATE:20260701/);
  assert.match(out, /SUMMARY:Oil\\, filter\\; Myvi/);
  assert.match(out, /TRIGGER:-P1D/);
});

test('manual odometer update counts toward the mileage trend', () => {
  const recs = [{ date: '2026-01-01', odometer: 50000, items: [{ type: 'Engine oil & filter' }] }];
  const [s] = suggestions({ id: 'c', odometer: 59000, odometerDate: '2026-04-01' }, recs, today);
  assert.equal(s.kmLeft, 1000);
  assert.equal(s.due, '2026-06-11'); // 100 km/day → 1000 km in 10 days
});
