import React, { useState, useRef, useLayoutEffect } from 'react';

// Small chart kit for the Instagram Insights and Comments pages (dark theme).
// One series per chart in the accent violet; with `highlight`, every other bar
// goes gray so the one that matters stands out. Thin columns (≤24px) with 4px
// rounded tops, hairline grid + baseline, a hover/focus tooltip on each bar, and
// a "View data" table so no value is reachable only by hovering.

export const compact = (n) => (n == null ? '—'
  : new Intl.NumberFormat(undefined, { notation: Math.abs(n) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n));

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

// 1, 2, 5 × 10^n at or above v.
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

// Column with a 4px rounded data-end, square at the baseline.
function columnPath(x, top, w, base) {
  const r = Math.min(4, w / 2, base - top);
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`;
}

// data: [{ key, label (axis), title (tooltip/table), value, extra }]
export function ColumnChart({ data, height = 180, highlight = null, format = compact, label, valueLabel = 'Value' }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const padL = 36, padR = 8, padT = 12, padB = 24;
  const plotW = Math.max(0, width - padL - padR);
  const plotH = height - padT - padB;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.max(2, Math.min(24, band - 2)); // ≥2px surface gap between neighbours
  const base = padT + plotH;
  const y = (v) => base - (Math.max(0, v) / max) * plotH;
  const ticks = max >= 2 && Number.isInteger(max / 2) ? [0, max / 2, max] : [0, max];
  const every = Math.max(1, Math.ceil(data.length / 7));
  const hovered = hover != null ? data[hover] : null;

  return (
    <>
      <div className="viz" ref={ref} style={{ height }} role="figure" aria-label={label}>
        {width > 0 && (
          <svg width={width} height={height}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} className="viz-grid" />
                <text x={padL - 6} y={y(t)} dy="0.32em" textAnchor="end" className="viz-tick">{compact(t)}</text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = padL + band * i + band / 2;
              return (
                <g key={d.key ?? i} className="viz-col" tabIndex={0} aria-label={`${d.title || d.label}: ${format(d.value)}`}
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
                  <rect x={padL + band * i} y={padT} width={band} height={plotH} fill="transparent" />
                  {d.value > 0 && (
                    <path d={columnPath(cx - barW / 2, y(d.value), barW, base)}
                      className={highlight != null && i !== highlight ? 'viz-mark-muted' : 'viz-mark'} opacity={hover === i ? 0.75 : 1} />
                  )}
                  {/* The highlighted bar always gets its label; regular ticks too close to it are dropped so they can't collide. */}
                  {(i === highlight || (i % every === 0 && (highlight == null || Math.abs(i - highlight) >= every))) && (
                    <text x={cx} y={height - 6} textAnchor="middle" className="viz-tick">{d.label}</text>
                  )}
                </g>
              );
            })}
            <line x1={padL} x2={width - padR} y1={base} y2={base} className="viz-axis" />
          </svg>
        )}
        {hovered && (
          <div className="viz-tooltip" style={{ left: Math.min(Math.max(padL + band * hover + band / 2, 70), width - 70), top: y(hovered.value) - 6 }}>
            <strong>{format(hovered.value)}</strong>
            <span>{hovered.title || hovered.label}</span>
            {hovered.extra && <span>{hovered.extra}</span>}
          </div>
        )}
      </div>
      <details className="viz-table">
        <summary>View data</summary>
        <table className="data-table">
          <thead><tr><th>{label}</th><th className="num">{valueLabel}</th></tr></thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={d.key ?? i}><td>{d.title || d.label}{d.extra ? ` · ${d.extra}` : ''}</td><td className="num">{format(d.value)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

// Ranked horizontal bars with the value (and optional share) at each bar's tip.
export function BarList({ rows, format = compact, total = null, limit = 8, label, empty = 'No data yet' }) {
  const shown = rows.slice(0, limit);
  if (!shown.length) return <p className="form-helper">{empty}</p>;
  const max = Math.max(1, ...shown.map((r) => r.value));
  return (
    <div className="viz-barlist" role="list" aria-label={label}>
      {shown.map((r) => (
        <div key={r.key ?? r.label} className="viz-barlist-row" role="listitem">
          <span className="viz-barlist-label" title={r.label}>{r.label}</span>
          <span className="viz-barlist-track">
            {r.value > 0 && <span className="viz-barlist-bar" style={{ width: `${(r.value / max) * 100}%` }} />}
          </span>
          <span className="viz-barlist-value">
            {format(r.value)}
            {total ? <span className="viz-barlist-pct"> {Math.round((r.value / total) * 100)}%</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Kpi({ label, value, sub, hint }) {
  return (
    <div className="kpi-tile" title={hint}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}
