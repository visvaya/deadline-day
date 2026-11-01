/**
 * Shared CSV field splitter for the scripts/*.ts tools. Lives here rather than
 * in one of them because `pnpm quality:duplicates` runs jscpd at threshold 0:
 * a second copy of this loop fails the full gate.
 *
 * Quoting is not theoretical - one legacy title contains a comma
 * (`CZŁOWIEK, KTÓRY ZRUJNOWAŁ KLUB`, src/logic/epilogue.ts), and every column
 * a balance decision rests on sits after it in the dump.
 */
export const parseCsvLine = (line: string): string[] => {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      fields.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  fields.push(current);
  return fields;
};

/**
 * Renders one CSV line, quoting only the fields that need it. The reader above
 * is the counterpart; keeping the two in one file means neither can drift into
 * a different idea of what a quoted field looks like.
 */
export const formatCsvRow = (fields: readonly string[]): string =>
  fields
    .map((field) => (/[",\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field))
    .join(",");
