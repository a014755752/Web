export function ChartPlaceholder({ label }: { label: string }) {
  return (
    <div className="chart-placeholder" role="status">
      <span className="sr-only">{label}</span>
      <div className="chart-placeholder-plot" aria-hidden="true" />
    </div>
  );
}
