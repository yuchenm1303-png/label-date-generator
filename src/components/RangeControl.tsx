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
  const percentage = ((value - min) / (max - min)) * 100;
  const displayValue = Number(value.toFixed(step < 1 ? 1 : 0));

  return (
    <div
      className={`range-control ${engaged ? "is-engaged" : ""}`}
      style={{ "--range-value": `${percentage}%` } as CSSProperties}
    >
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
            onChange={(event) => onChange(Number(event.target.value))}
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
