import { useId } from "react";

import type { AnalystReport, PositionCode, StaffAssessment } from "../../data/types";
import { ANALYST_METRICS, analystPositionGroup } from "../../data/analyst-metrics";
import { InfoPopover } from "./info-popover";
import { StaffConfidenceHelp } from "./staff-confidence-help";
import { at } from "../../logic/invariant";

/**
 * The staff assessment and analyst report, rendered identically wherever they
 * appear: on the offer card and in the squad drawer.
 *
 * Lifted out of offer-card.tsx unchanged. Two copies of these labels, value
 * formatting, the evidence rail, the metadata rows and the accessible strings
 * would drift, and the drift would be invisible - both would still look like
 * a report.
 */

const STAFF_OUTLOOK_LABELS: Record<string, string> = {
  limited: "Zawodnik niższej ligi",
  leagueLevel: "Przeciętny ligowiec",
  leadingLeague: "Czołowy ligowiec",
  aboveLeague: "Klasa europejska",
};

const STAFF_CONFIDENCE_LABELS: Record<string, string> = {
  /* All three speak the same language: how much weight the reading carries.
     "Spójne"/"niejednoznaczne" implied several observations agreeing or not,
     but there is only one - confidence is the width of its noise. */
  high: "Wysoka pewność – obserwacje są wiarygodne",
  medium: "Umiarkowana pewność – obserwacje nie są w pełni wiarygodne",
  low: "Niska pewność – obserwacje są mało wiarygodne",
};

/** The row's label already says "próba", so the value only carries the size. */
const SAMPLE_TIER_LABELS: Record<string, string> = {
  small: "mała",
  medium: "średnia",
  large: "duża",
};

const CONTEXT_TIER_LABELS: Record<string, string> = {
  bottom: "dół ligi",
  mid: "środek ligi",
  top: "czołówka ligi",
};

/* Locative, so the line reads as one phrase: "na tle napastnikow w ubieglym
   sezonie" rather than two fragments joined by a separator. */
const REPORT_PERIOD_LABELS: Record<string, string> = {
  summer: "w ubiegłym sezonie",
  winter: "w rundzie jesiennej",
};

/** Map analyst position groups to Polish text for comparison context. */
const ANALYST_POSITION_GROUP_LABELS: Record<string, string> = {
  goalkeeper: "bramkarzy",
  centreBack: "środkowych obrońców",
  wideDefender: "bocznych obrońców",
  centralMidfielder: "środkowych pomocników",
  attackingMidfielder: "ofensywnej pomocy",
  striker: "napastników",
};

/** Format analyst metric value with Polish comma, sign, and unit. */
const formatMetricValue = (value: number, metricId: string): string => {
  const metric = ANALYST_METRICS[metricId as keyof typeof ANALYST_METRICS];
  if (!metric) return String(value);

  const { decimals, unit, signed } = metric.displayScale;
  const fixed = value.toFixed(decimals).replace(".", ",");
  const withSign = signed && value > 0 ? `+${fixed}` : fixed;

  // Non-breaking space before word-like units; no space before %.
  const spaceBefore = unit !== "" && unit !== "%" ? " " : "";
  return `${withSign}${spaceBefore}${unit}`;
};

const StarRating = ({
  count,
  filled,
  semantic,
}: {
  count: number;
  filled: number;
  semantic?: string;
}) => {
  const className = semantic ? `dd-star ${semantic}` : "dd-star";
  return (
    <div className="dd-staff-rating" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={className}>
          {i < filled ? "★" : "☆"}
        </span>
      ))}
    </div>
  );
};

const StaffAssessmentSection = ({
  assessment,
  currentOvr,
}: {
  assessment: StaffAssessment;
  currentOvr: number;
}) => {
  const labelId = useId();
  const staffLabel =
    assessment.source === "coach"
      ? assessment.focus === "potential"
        ? "Raport trenera (potencjał)"
        : "Raport trenera (obecny poziom)"
      : assessment.focus === "potential"
        ? "Raport skauta (potencjał)"
        : "Raport skauta (obecny poziom)";

  // Outlook: limited→1, leagueLevel→2, leadingLeague→3, aboveLeague→4
  const outlookStars: Record<string, number> = {
    limited: 1,
    leagueLevel: 2,
    leadingLeague: 3,
    aboveLeague: 4,
  };

  // Confidence: low→1, medium→2, high→3
  const confidenceStars: Record<string, number> = {
    low: 1,
    medium: 2,
    high: 3,
  };

  const outlookFilled = outlookStars[assessment.outlook] || 0;
  const confidenceFilled = confidenceStars[assessment.confidence] || 0;

  return (
    // A11y fix (2026-09-16, best-practice audit): this component renders
    // identically on the offer card and inside the squad drawer, and both
    // can be present in the accessibility tree at once - the drawer opens
    // as an overlay over the card, not in its place. `<section>` with an
    // accessible name is an implicit ARIA landmark ("region"), and every
    // instance here carries the exact same four-string label
    // (STAFF_OUTLOOK_LABELS's siblings), never the player's name - so two
    // simultaneous instances read as duplicate, indistinguishable regions
    // to a screen reader's landmark list (axe's `landmark-unique`).
    // `role="group"` keeps the name association (`aria-labelledby` still
    // works on a group) while dropping it out of the landmark list
    // entirely, which is the right semantic anyway: this is a content
    // grouping inside a card or drawer, not a page-level region a keyboard
    // user would want to jump straight to.
    <section
      className="dd-staff-assessment"
      role="group"
      aria-labelledby={labelId}
      aria-label="Ocena sztabu"
    >
      <span className="dd-offer-section-label" id={labelId}>
        {staffLabel}
      </span>
      <div className="dd-staff-outlook">
        <span className="dd-staff-label">{STAFF_OUTLOOK_LABELS[assessment.outlook]}</span>
        <span className="dd-staff-leader" aria-hidden="true" />
        <StarRating count={4} filled={outlookFilled} />
      </div>
      <div className="dd-staff-confidence">
        {/* Inside the label, not beside it: as a flex sibling the mark sat
            vertically centred against a two-line label, floating away from
            the words it explains. In the text flow it follows the last word
            and wraps with it. */}
        <span className="dd-staff-label">
          {STAFF_CONFIDENCE_LABELS[assessment.confidence]}{" "}
          <StaffConfidenceHelp assessment={assessment} currentOvr={currentOvr} />
        </span>
        <span className="dd-staff-leader" aria-hidden="true" />
        <StarRating count={3} filled={confidenceFilled} semantic="dd-staff-confidence" />
      </div>
    </section>
  );
};

const AnalystReportSection = ({
  report,
  position,
  pastTense = false,
}: {
  report: AnalystReport;
  position: PositionCode;
  /** A free agent's club is the one he *played* at. Everyone else plays there
   * now, including a player already in our own squad. */
  pastTense?: boolean;
}) => {
  const reportLabelId = useId();
  const comparisonPositionGroup = analystPositionGroup(position);
  const positionGroupText = ANALYST_POSITION_GROUP_LABELS[comparisonPositionGroup];
  const period = REPORT_PERIOD_LABELS[report.period.window];
  const contextTier = CONTEXT_TIER_LABELS[report.contextTier];
  const sampleNote = SAMPLE_TIER_LABELS[report.sampleTier];

  // Get metric definitions for detailed rendering
  const metricDefs = report.metrics.map((metricResult) => {
    const def = ANALYST_METRICS[metricResult.metricId];
    return { result: metricResult, def };
  });

  // Build marker info paired directly with each metric (shape + semantics)
  const metricMarkers = metricDefs.map((def, index) => ({
    metricIndex: index,
    percentile: Math.round(def.result.percentile),
    marker: index === 0 ? "circle" : "diamond",
    semantics: def.def.semantics,
  }));

  // Every metric keeps its own marker, even at the same rounded percentile:
  // deduplicating by value let the diamond replace the circle. Ordered along
  // the axis; which one is drawn on top is the stylesheet's call, not DOM order.
  const railMarkers = [...metricMarkers].sort((a, b) => a.percentile - b.percentile);

  return (
    // A11y fix (2026-09-16, best-practice audit): same reasoning as
    // StaffAssessmentSection above - this section's label ("Raport
    // analityka") is completely static, and the component renders on both
    // the offer card and inside the squad drawer, so two simultaneous
    // instances collided as duplicate landmarks (axe's `landmark-unique`).
    // `role="group"` removes it from the landmark list without touching the
    // `aria-labelledby` association.
    <section className="dd-analyst-report" role="group" aria-labelledby={reportLabelId}>
      <div className="dd-offer-section-label dd-analyst-report-header" id={reportLabelId}>
        <span className="dd-analyst-label-text">Raport analityka</span>
        <span className="dd-analyst-leader" aria-hidden="true" />
        <span className="dd-analyst-minutes">{report.minutes} min</span>
      </div>

      {/* Metrics list */}
      <div className="dd-analyst-metrics">
        {metricDefs.map(({ result, def }, index) => {
          const markerInfo = at(metricMarkers, index, "analyst metric marker");
          const marker = markerInfo.marker;
          const semanticsClass = `data-semantics-${markerInfo.semantics}`;
          const markerClass = `data-marker-${marker}`;

          // For aria-label, strip trailing ` %` from name
          const ariaMetricName = def.label.replace(/ %$/, "");

          // Build aria-label based on semantics
          let ariaLabel = `${ariaMetricName} ${formatMetricValue(result.value, result.metricId)}; ${Math.round(result.percentile)}. `;

          if (def.semantics === "qualityLowerRaw") {
            ariaLabel += `odwrócony percentyl jakości; w surowej wartości mniej oznacza lepiej; wyższy odwrócony percentyl oznacza lepszy wynik; wykres pokazuje odwrócony percentyl jakości`;
          } else {
            ariaLabel += `percentyl jakości`;
          }

          return (
            <div
              key={result.metricId}
              className={`dd-analyst-metric ${semanticsClass} ${markerClass}`}
              data-marker={marker}
              data-semantics={def.semantics}
            >
              <div className="dd-metric-header">
                <span className="dd-metric-name">
                  <span className="dd-metric-symbol" aria-hidden="true"></span>
                  <span className="dd-metric-label-text">{def.label}</span>
                  <InfoPopover
                    text={def.helpText}
                    label={`Co oznacza metryka ${def.label}`}
                    action="metric-help"
                  />
                </span>
                <span className="dd-metric-result" aria-label={ariaLabel}>
                  <span>{formatMetricValue(result.value, result.metricId)}</span>
                  <span className="dd-metric-separator">·</span>
                  <strong>{Math.round(result.percentile)}. percentyl</strong>
                </span>
              </div>

              {def.semantics === "qualityLowerRaw" && (
                <div className="dd-metric-hint">
                  surowa wartość: ↓ mniej = lepiej · percentyl odwrócony
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Evidence rail */}
      {railMarkers.length > 0 && (
        <div className="dd-evidence-rail" role="img" aria-hidden="true">
          <div className="dd-rail-track" />
          {railMarkers.map((railMarker) => (
            <div
              key={railMarker.metricIndex}
              className="dd-rail-marker"
              style={{ left: `${railMarker.percentile}%` }}
              data-marker={railMarker.marker}
              data-semantics={railMarker.semantics}
            />
          ))}
          <div className="dd-rail-end dd-rail-end--low">1</div>
          <div className="dd-rail-end dd-rail-end--high">99</div>
        </div>
      )}

      {/* Metadata lines */}
      <div className="dd-analyst-metadata">
        <p>
          <span className="dd-metadata-label">Percentyle na tle</span>
          <span className="dd-metadata-leader" aria-hidden="true" />
          {/* "z całej ligi" spelled out: without it the row reads as though the
              comparison group might be the player's own club. */}
          <span className="dd-metadata-value">
            {positionGroupText} z całej ligi {period}
          </span>
        </p>
        <p>
          <span className="dd-metadata-label">
            Poziom klubu, w którym {pastTense ? "występował" : "występuje"}
          </span>
          <span className="dd-metadata-leader" aria-hidden="true" />
          <span className="dd-metadata-value">{contextTier}</span>
        </p>
        <p>
          <span className="dd-metadata-label">Wielkość próby minutowej</span>
          <span className="dd-metadata-leader" aria-hidden="true" />
          <span className="dd-metadata-value">{sampleNote}</span>
        </p>
      </div>
    </section>
  );
};

/** Both sections in their fixed order.
 *
 * The only export: every caller wants the pair, and exporting the halves as
 * well would let the two of them drift apart in one place while staying
 * together everywhere else - which is exactly what this component exists to
 * prevent. */
export const PlayerReports = ({
  staffAssessment,
  analystReport,
  position,
  currentOvr,
  pastTense = false,
}: {
  staffAssessment: StaffAssessment;
  analystReport: AnalystReport;
  position: PositionCode;
  /** The OVR the reader can see next to this report. Used only to work out
   * whether a one-point change would move the verdict's band - never to
   * decide what the verdict is. */
  currentOvr: number;
  pastTense?: boolean;
}) => (
  <>
    <StaffAssessmentSection assessment={staffAssessment} currentOvr={currentOvr} />
    <AnalystReportSection report={analystReport} position={position} pastTense={pastTense} />
  </>
);
