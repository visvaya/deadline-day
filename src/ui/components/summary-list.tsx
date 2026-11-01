import type { ReactNode } from "react";

type SummaryTone = "positive" | "negative" | "warning" | "muted";

/**
 * A row is either toned or emphasised, never both.
 *
 * Not a style preference - the CSS cannot honour both. `.dd-summary-list >
 * div.is-emphasis dd` has specificity (0,2,2) and `.dd-summary-list
 * dd.is-positive` has (0,2,1), so on an emphasised row the tone is inert: the
 * code would claim a colour the player never sees. A union says so at the
 * call site instead of leaving it to be rediscovered in a review.
 */
export type SummaryRow =
  | {
      label: string;
      value: ReactNode;
      tone?: SummaryTone;
      emphasis?: false;
    }
  | {
      label: string;
      value: ReactNode;
      tone?: never;
      emphasis: true;
    };

export const SummaryList = ({
  label,
  rows,
  note,
}: {
  label: string;
  rows: readonly SummaryRow[];
  note?: ReactNode;
}) => (
  <>
    <dl className="dd-summary-list" aria-label={label}>
      {rows.map((row) => (
        <div key={row.label} className={row.emphasis ? "is-emphasis" : undefined}>
          <dt>{row.label}</dt>
          <dd className={row.tone ? `is-${row.tone}` : undefined}>{row.value}</dd>
        </div>
      ))}
    </dl>
    {note && <p className="dd-note">{note}</p>}
  </>
);
