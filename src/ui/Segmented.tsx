export interface SegmentedProps<T extends string> {
  label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}

export function Segmented<T extends string>({ label, options, value, onChange }: SegmentedProps<T>) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map(o => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : undefined} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}
