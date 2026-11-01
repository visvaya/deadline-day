import type { StaffAssessment, StaffConfidence } from "../../data/types";
import {
  staffOutlookBoundaryReason,
  type StaffOutlookBoundaryReason,
} from "../../logic/staff-assessment";
import { InfoPopover } from "./info-popover";

/**
 * What a confidence level actually means, as a small popover on the report's
 * confidence row.
 *
 * The level is the one part of a staff report a player has no way to interpret
 * from the words alone - "umiarkowana pewność" says nothing about what will
 * happen next season. So it explains the rule: whether the verdict may still
 * move, why a first-season read cannot be certain, and - on a band boundary -
 * why a high-confidence verdict may still change by one level without the
 * report having been wrong.
 *
 * Never a source of ceiling information. Every string here is either the rule
 * itself or general engine mechanics; the component receives a finished
 * assessment and the visible OVR, computes nothing about thresholds, and has no
 * access to the hidden potential at all.
 */

/**
 * Deliberately no number of levels. The remembered confidence caps how far a
 * verdict moves, but three paths go past that cap: the guaranteed high, the
 * floor from visible OVR and the switch to a current report at peakStart. The
 * floor is the one promise the engine always keeps, so `medium` states that.
 */
const CONFIDENCE_HELP: Record<Exclude<StaffConfidence, "high">, string> = {
  low: "Ten raport może się jeszcze wyraźnie zmienić.",
  medium:
    "Ten raport może się jeszcze zmienić. Zawsze dogoni jednak to, co zawodnik pokaże na boisku.",
};

const FIRST_OBSERVATION_HELP =
  "Sztab dopiero zbiera obserwacje o zawodniku, dlatego nie wystawia jeszcze raportu " +
  "z wysoką pewnością.";

const STABLE_POTENTIAL_HELP = "Sztab traktuje ten raport jako stabilny.";

const CURRENT_HELP = "Raport opisuje widoczny obecny poziom zawodnika.";

/**
 * The three boundary explanations.
 *
 * They describe where a seasonal OVR change comes from - the team beating or
 * missing expectations, and whether the player is in the automatic XI or the
 * rotation - because that is the mechanic a reader has no other way to learn.
 * "Podstawowy skład lub rotacja" is exactly the `played` set in ageSquad; the
 * engine tracks no minutes, so the text does not pretend it does.
 */
const BOUNDARY_HELP: Record<StaffOutlookBoundaryReason, string> = {
  currentUp:
    "Premia sezonowa może wynieść +1 OVR, gdy drużyna zagra powyżej oczekiwań, a zawodnik " +
    "mieści się w podstawowym składzie lub rotacji. Gdyby jego OVR wzrosło o 1, ten raport " +
    "wskazałby o jeden poziom wyżej. Wysoka pewność oznacza dokładny odczyt bieżącego OVR, " +
    "nie zamrożenie raportu.",
  currentDown:
    "Spadek OVR może wynikać z wieku albo z sezonowej kary, gdy drużyna zagra poniżej " +
    "oczekiwań, a zawodnik nie mieści się w podstawowym składzie ani rotacji. Gdyby jego OVR " +
    "spadło o 1, ten raport wskazałby o jeden poziom niżej. Wysoka pewność oznacza dokładny " +
    "odczyt bieżącego OVR, nie zamrożenie raportu.",
  potentialFloorUp:
    "Przed szczytem OVR rośnie wraz z rozwojem, a po sezonie powyżej oczekiwań zawodnik " +
    "z podstawowego składu lub rotacji może dodatkowo dostać +1 OVR. Tutaj już wzrost o 1 " +
    "podniósłby ten raport o jeden poziom: pewna prognoza nie może wskazywać niżej niż " +
    "widoczny obecny poziom.",
};

/** The single string this assessment deserves, in precedence order. */
export const staffConfidenceHelpText = (
  assessment: StaffAssessment,
  currentOvr: number
): string => {
  if (assessment.confidence !== "high") {
    // Only for a potential report: a `current` read is exact whatever the
    // tenure, so "still gathering observations" would be untrue there.
    if (assessment.focus === "potential" && assessment.isFirstObservation) {
      return FIRST_OBSERVATION_HELP;
    }
    return CONFIDENCE_HELP[assessment.confidence];
  }

  const reason = staffOutlookBoundaryReason(assessment, currentOvr);
  if (reason !== null) return BOUNDARY_HELP[reason];
  return assessment.focus === "potential" ? STABLE_POTENTIAL_HELP : CURRENT_HELP;
};

export const StaffConfidenceHelp = ({
  assessment,
  currentOvr,
}: {
  assessment: StaffAssessment;
  currentOvr: number;
}) => (
  <InfoPopover
    text={staffConfidenceHelpText(assessment, currentOvr)}
    label="Co oznacza ten poziom pewności"
    action="pewnosc-objasnienie"
  />
);
