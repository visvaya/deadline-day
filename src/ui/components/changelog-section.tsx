import { useState } from "react";

import { CHANGELOG, DEVELOPMENT_NOTICE, TECHNICAL_CHANGES_NOTE } from "../../data/changelog";
import { groupChangelog, groupDateLabel, groupVersionLabel } from "../../logic/changelog-groups";
import { SectionHeading } from "./section-heading";

/** The changelog as the player reads it: runs of technical-only versions as one row. */
const CHANGELOG_GROUPS = groupChangelog(CHANGELOG, TECHNICAL_CHANGES_NOTE);

/**
 * "Historia zmian" on the start screen: collapsed to the newest row until the
 * player expands it; the state is not kept (docs/decisions/design-system.md).
 */
export const ChangelogSection = () => {
  const [expanded, setExpanded] = useState(false);
  return (
    <section aria-labelledby="changelog-heading">
      <SectionHeading id="changelog-heading" title="Historia zmian" />
      <p className="dd-note">{DEVELOPMENT_NOTICE}</p>
      <ul className="dd-changelog">
        {(expanded ? CHANGELOG_GROUPS : CHANGELOG_GROUPS.slice(0, 1)).map((group) => (
          <li key={group.newest}>
            <div className="dd-changelog-heading">
              <strong>{groupVersionLabel(group)}</strong>
              <span>{groupDateLabel(group)}</span>
            </div>
            <ul>
              {group.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {CHANGELOG_GROUPS.length > 1 && (
        <button
          type="button"
          className="dd-changelog-toggle"
          data-dd-action="historia-zmian"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded
            ? "Zwiń starsze wersje"
            : `Pokaż starsze wersje (${CHANGELOG_GROUPS.length - 1})`}{" "}
          <span aria-hidden="true">{expanded ? "▴" : "▾"}</span>
        </button>
      )}
    </section>
  );
};
