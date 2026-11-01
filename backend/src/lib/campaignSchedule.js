// Shared rules for campaigns and daily jobs: a start/end window, and how many
// images one post carries. A blank end date means the campaign has no end.

export const MAX_IMAGES_PER_POST = 10; // Instagram's carousel limit

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

export const clampImages = (value, fallback = 1) =>
  Math.min(Math.max(parseInt(value) || fallback, 1), MAX_IMAGES_PER_POST);

function readDate(value, label) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest(`${label} is not a valid date.`);
  return date.toISOString();
}

// { startsAt, endsAt } as ISO strings or null. Throws a 400 on bad input.
export function parseWindow({ startsAt, endsAt } = {}) {
  const start = readDate(startsAt, 'The start date');
  const end = readDate(endsAt, 'The end date');
  if (start && end && new Date(end) <= new Date(start)) throw badRequest('The end date must be after the start date.');
  return { startsAt: start, endsAt: end };
}

function addPeriod(date, cadence) {
  const next = new Date(date);
  if (cadence === 'daily') next.setDate(next.getDate() + 1);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

// The first run after now, counted from `from` so runs keep their time of day.
export function nextOccurrence(cadence, from = new Date()) {
  if (cadence !== 'daily' && cadence !== 'monthly') return null;
  const now = new Date();
  let next = addPeriod(from, cadence);
  while (next <= now) next = addPeriod(next, cadence);
  return next.toISOString();
}

// When a recurring campaign first runs: its start time, or one period from now.
export function firstRun({ cadence, startsAt }) {
  if (cadence !== 'daily' && cadence !== 'monthly') return null;
  if (startsAt && new Date(startsAt) > new Date()) return new Date(startsAt).toISOString();
  return nextOccurrence(cadence, startsAt || new Date());
}
