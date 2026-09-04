/**
 * Money is numeric(14,2), read from the database as a string end-to-end
 * (CLAUDE.md "Database conventions") -- this component is the one place that
 * string is formatted for display, via Intl.NumberFormat, never a JS number
 * computed or trusted in transit.
 */
export function Money({
  value,
  currency = "PHP",
}: {
  value: string | number | null;
  currency?: string;
}) {
  if (value === null) return <span className="text-muted-foreground/50">—</span>;
  const amount = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(amount)) return <span className="text-muted-foreground/50">—</span>;
  return (
    <span className="tabular-nums">
      {new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount)}
    </span>
  );
}
