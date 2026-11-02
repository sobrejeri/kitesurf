import assert from 'node:assert/strict';
import { getBookingProgress } from '../src/lib/booking-progress.ts';

const scenarios = [
  {
    name: 'no meetings',
    states: [],
    expected: { total: 0, completed: 0, inProgress: 0, remaining: 0, percent: 0, inProgressPercent: 0 },
  },
  {
    name: 'four booked encounters not started',
    states: ['scheduled','scheduled','scheduled','scheduled'],
    expected: { total: 4, completed: 0, inProgress: 0, remaining: 4, percent: 0, inProgressPercent: 0 },
  },
  {
    name: 'first of four encounters completed',
    states: ['done','scheduled','scheduled','scheduled'],
    expected: { total: 4, completed: 1, inProgress: 0, remaining: 3, percent: 25, inProgressPercent: 0 },
  },
  {
    name: 'two done, one actively in class and one scheduled',
    states: ['done','done','in_progress','scheduled'],
    expected: { total: 4, completed: 2, inProgress: 1, remaining: 1, percent: 50, inProgressPercent: 25 },
  },
  {
    name: 'all lessons completed',
    states: ['done','done','done'],
    expected: { total: 3, completed: 3, inProgress: 0, remaining: 0, percent: 100, inProgressPercent: 0 },
  },
  {
    name: 'cancelled encounter not counted as deliverable',
    states: ['done','cancelled','scheduled'],
    expected: { total: 2, completed: 1, inProgress: 0, remaining: 1, percent: 50, inProgressPercent: 0 },
  },
  {
    name: 'only cancelled encounters',
    states: ['cancelled','cancelled'],
    expected: { total: 0, completed: 0, inProgress: 0, remaining: 0, percent: 0, inProgressPercent: 0 },
  },
  {
    name: 'in progress cannot be mistaken for completed',
    states: ['in_progress'],
    expected: { total: 1, completed: 0, inProgress: 1, remaining: 0, percent: 0, inProgressPercent: 100 },
  },
];
for (const { name, states, expected } of scenarios) {
  assert.deepEqual(
    getBookingProgress(states.map((status) => ({ status }))),
    expected,
    name,
  );
}
console.log('Booking progress: all 8 status scenarios passed');
