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
  return (
    <div className="range-control">
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
            value={Number(value.toFixed(1))}
            onChange={(event) => onChange(Number(event.target.value))}
          />
          <span>%</span>
        </label>
      </div>
      <input
        className="range-input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ "--range-value": `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
      />
    </div>
  );
}
