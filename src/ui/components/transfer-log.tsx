import { pluralPl } from "../../logic/format";
import { SectionHeading } from "./section-heading";

/**
 * Keys that stay put as entries arrive. The text alone is the natural key -
 * a new decision is inserted as a new node, so the polite live region
 * announces only it - but two decisions can read the same. Numbering repeats
 * from the oldest end keeps every existing key unchanged when a new entry is
 * prepended, which an index would not.
 */
export const keyedTransferLog = (entries: readonly string[]): { key: string; entry: string }[] =>
  entries.map((entry, index) => {
    const olderRepeats = entries.slice(index + 1).filter((other) => other === entry).length;
    return { key: `${entry}#${olderRepeats}`, entry };
  });

export const TransferLog = ({
  entries,
  live = false,
}: {
  entries: readonly string[];
  live?: boolean;
}) =>
  entries.length > 0 ? (
    <section aria-label="Ostatnie decyzje transferowe" aria-live={live ? "polite" : undefined}>
      <SectionHeading
        title="Ostatnie decyzje transferowe"
        meta={pluralPl(entries.length, ["akcja", "akcje", "akcji"])}
      />
      <div className="dd-transfer-log">
        {keyedTransferLog(entries).map(({ key, entry }) => (
          <p key={key}>{entry}</p>
        ))}
      </div>
    </section>
  ) : null;
