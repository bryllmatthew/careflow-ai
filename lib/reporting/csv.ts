/** Minimal, dependency-free CSV serialization (section 33). RFC 4180 quoting: a field containing a comma, quote, or newline is quoted, with quotes doubled. */
function escapeCsvField(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
): string {
  const lines = [headers.map(escapeCsvField).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(","));
  }
  // CRLF per RFC 4180 -- Excel and most spreadsheet tools expect it.
  return lines.join("\r\n");
}
