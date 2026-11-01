import React from 'react';

const MAX_IMAGES = 10;

// The optional start and end of a campaign or daily job.
export function ScheduleWindow({ startsAt, endsAt, onChange, startHelp = 'Leave blank to start right away.' }) {
  return (
    <>
      <div className="form-group">
        <label className="form-label">Start (optional)</label>
        <input className="form-input" type="datetime-local" value={startsAt} onChange={(e) => onChange({ startsAt: e.target.value })} />
        <div className="form-helper">{startHelp}</div>
      </div>
      <div className="form-group">
        <label className="form-label">End date (optional)</label>
        <input className="form-input" type="date" value={endsAt} min={startsAt ? startsAt.slice(0, 10) : undefined} onChange={(e) => onChange({ endsAt: e.target.value })} />
        <div className="form-helper">Leave blank for no end date.</div>
      </div>
    </>
  );
}

export function ImagesPerPost({ value, onChange, label = 'Images in each post', help = 'Two or more post as a swipeable carousel.', max = MAX_IMAGES }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input className="form-input" type="number" min={1} max={max} value={value} onChange={(e) => onChange(e.target.value)} />
      <div className="form-helper">{help}</div>
    </div>
  );
}
