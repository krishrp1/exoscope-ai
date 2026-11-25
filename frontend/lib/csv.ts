/** Minimal CSV writer. Text that a spreadsheet would run as a formula is prefixed with a quote mark. */
export function toCsv<T extends object>(rows: T[], columns: (keyof T & string)[]): string {
  const cell = (value: unknown) => {
    if (value === null || value === undefined) return "";
    let text = String(value);
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [columns.join(","), ...rows.map((row) => columns.map((c) => cell(row[c])).join(","))].join("\r\n");
}
