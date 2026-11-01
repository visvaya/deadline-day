import { pluralPl, titleCasePl } from "../../logic/format";
import { groupArchiveEntries, readGameArchive, type ArchiveEntry } from "../game-archive";
import { AppHero } from "../components/app-hero";
import { SectionHeading } from "../components/section-heading";
import { StickyActionBar } from "../components/sticky-action-bar";

const LEGACY_DIFFICULTY_LABEL: Record<string, string> = {
  latwy: "Łatwy",
  sredni: "Średni",
  trudny: "Trudny",
};

/** Only a v1 row may still carry a historical difficulty label - v2 never
 * has one, because there is no difficulty to speak of any more. */
const legacyMeta = (entry: ArchiveEntry): string => {
  if (entry.kind === "v1") {
    return `${titleCasePl(LEGACY_DIFFICULTY_LABEL[entry.difficulty] ?? entry.difficulty)} · ${entry.clubName}`;
  }
  return `${managerLabel(entry)} · ${entry.clubName}`;
};

/** V1 rows never recorded a manager - the setup form did not exist yet. */
const managerLabel = (entry: ArchiveEntry): string =>
  entry.kind === "v2"
    ? `${entry.manager.firstName} ${entry.manager.lastName}`
    : "Menedżer nieznany";

const formatDateTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export const ArchiveScreen = ({
  onClose,
  highlightId,
}: {
  onClose: () => void;
  highlightId?: string | null;
}) => {
  const groups = groupArchiveEntries(readGameArchive().entries);
  const totalEntries = groups.reduce((total, group) => total + group.entries.length, 0);

  return (
    <>
      <AppHero />
      <main className="dd-wrap dd-screen-content">
        <SectionHeading
          title="Archiwum wyników"
          meta={
            totalEntries > 0 ? pluralPl(totalEntries, ["partia", "partie", "partii"]) : undefined
          }
        />
        {totalEntries === 0 ? (
          <p className="dd-note">Brak zapisanych partii na tym urządzeniu.</p>
        ) : (
          groups.map((group) => (
            <div key={group.engineVersion} className="dd-archive-group">
              <ol className="dd-archive-list" aria-label={group.caption}>
                {group.entries.map((entry, index) => {
                  const isLast = entry.id === highlightId;
                  return (
                    <li
                      key={entry.id}
                      className={isLast ? "dd-archive-entry is-last" : "dd-archive-entry"}
                    >
                      <span className="dd-archive-place">{index + 1}.</span>
                      <div className="dd-archive-details">
                        <span className="dd-archive-title">
                          {entry.legacyTitle}
                          {isLast && <span className="dd-archive-flag">Ostatnia partia</span>}
                        </span>
                        <span className="dd-archive-meta">
                          {legacyMeta(entry)} · {formatDateTime(entry.finishedAt)}
                        </span>
                      </div>
                      <span className="dd-archive-score">{entry.legacyScore}</span>
                    </li>
                  );
                })}
              </ol>
              <p className="dd-note">{group.caption}</p>
            </div>
          ))
        )}
      </main>
      <StickyActionBar label="Powrót">
        <button
          type="button"
          className="dd-action-primary"
          data-dd-action="archiwum-powrot"
          onClick={onClose}
        >
          Powrót
        </button>
      </StickyActionBar>
    </>
  );
};
