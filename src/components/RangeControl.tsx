import { useState, type CSSProperties } from "react";

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  hint: string;
  onChange: (value: number) => void;
};

export function RangeControl({ label, value, min, max, step, hint, onChange }: Props) {
  const [engaged, setEngaged] = useState(false);
  const rawPercentage = ((value - min) / (max - min)) * 100;
  const percentage = Math.min(100, Math.max(0, rawPercentage));
  const displayValue = Number(value.toFixed(step < 1 ? 1 : 0));
  const rangeStyle = { "--range-value": `${percentage}%` } as CSSProperties;

  return (
    <div className={`range-control ${engaged ? "is-engaged" : ""}`} style={rangeStyle}>
      <div className="range-heading">
        <div>
          <strong>{label}</strong>
          <span>{hint}</span>
        </div>
        <label className="number-field">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={displayValue}
            onFocus={() => setEngaged(true)}
            onBlur={() => setEngaged(false)}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
            }}
          />
          <span>%</span>
        </label>
      </div>

      <div className="range-track-wrap">
        <div className="range-value-popover" aria-hidden="true">
          {displayValue}%
        </div>
        <input
          className="range-input"
          style={rangeStyle}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onPointerDown={() => setEngaged(true)}
          onPointerUp={() => setEngaged(false)}
          onPointerCancel={() => setEngaged(false)}
          onFocus={() => setEngaged(true)}
          onBlur={() => setEngaged(false)}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
    </div>
  );
}
