// Date inputs work in the browser's local time; the API stores ISO timestamps.

const pad = (n) => String(n).padStart(2, '0');

export function toDateTimeInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const toDateInput = (iso) => toDateTimeInput(iso).slice(0, 10);
export const fromDateTimeInput = (value) => (value ? new Date(value).toISOString() : null);

// An end date covers that whole day.
export const endOfDay = (value) => (value ? new Date(`${value}T23:59:59`).toISOString() : null);

export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString([], { dateStyle: 'medium' }) : '');

// "Created 1 Nov 2026, 4:10 pm · Starts 2 Nov 2026, 10:00 am · No end date"
export function scheduleText(row) {
  return [
    `Created ${fmtDateTime(row.created_at)}`,
    row.starts_at && `Starts ${fmtDateTime(row.starts_at)}`,
    row.ends_at ? `Ends ${fmtDate(row.ends_at)}` : 'No end date',
  ].filter(Boolean).join(' · ');
}
