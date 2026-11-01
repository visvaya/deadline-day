import { MIN_BUDGET_SHARE, MIN_INITIAL_BUDGET } from "../src/data/balance";
import { FIT_CLUB_IDS, shortNameForClubId } from "./opening-budget-fit-core";
import type {
  ClubVariantRow,
  DriftRow,
  RngPairing,
  VariantResult,
} from "./opening-budget-fit-scan";
import { candidateKey } from "./opening-budget-fit-scan";

/**
 * Rendering for `pnpm fit:opening-budget`. Text only: every number arrives
 * already computed, so a table can never quietly become a second calculation
 * that disagrees with the JSON beside it.
 */

/** Polish decimal comma, the repo's convention for money on screen. Report
 * tables are read by a person, so they round; the JSON keeps full precision. */
const pl = (value: number, digits = 3): string => value.toFixed(digits).replace(".", ",");

const row = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`;

const table = (header: readonly string[], rows: readonly string[][]): string =>
  [row(header), row(header.map(() => "---")), ...rows.map((cells) => row(cells))].join("\n");

export type NamedSlice = {
  readonly label: string;
  readonly rationale: string;
  readonly variant: VariantResult;
};

export type NamedRateSweep = {
  readonly label: string;
  readonly variants: readonly VariantResult[];
};

/** The four clubs whose backer tier is anything but `none`. */
const BACKER_CLUBS = ["Widzew", "Wieczysta", "Korona", "Motor"];

/** The five clubs that start a career in Europe. Later qualifications are a
 * simulation result, never a static list, so only the starting berths are
 * named here. */
const EUROPEAN_STARTERS = ["Lech", "Górnik", "Jagiellonia", "Raków", "GKS"];

const clubTable = (clubs: readonly ClubVariantRow[]): string =>
  table(
    [
      "klub",
      "podłoga",
      "udział",
      "koszt wzmocnienia",
      "wsparcie",
      "budżet",
      "wiążące",
      "udział w przychodzie",
      "bilans bez pucharów",
      "puchary / sezon",
      "bilans z pucharami",
      "reinwestycja / sezon",
      "po S1",
      "po S5",
      "przy przekazaniu",
    ],
    clubs.map((club) => [
      club.shortName,
      pl(club.absoluteFloor, 2),
      pl(club.shareBudget),
      pl(club.usefulPurchaseCost),
      club.backerSupportFloor === null ? "—" : pl(club.backerSupportFloor),
      `**${pl(club.initialBudget)}**`,
      club.binding.join(" + "),
      pl(club.budgetShareOfRevenue, 3),
      pl(club.medianOperatingBalance),
      pl(club.medianCupIncome),
      pl(club.medianSeasonIncome),
      pl(club.projectedTransferBudgetChange),
      pl(club.medianCashAfterSeason1),
      pl(club.medianCashAfterSeason5),
      pl(club.medianCashAtHandover),
    ])
  );

const backerTable = (clubs: readonly ClubVariantRow[]): string =>
  table(
    ["klub", "klasa", "podłoga wsparcia", "budżet", "czy wiąże"],
    clubs
      .filter((club) => BACKER_CLUBS.includes(club.shortName))
      .map((club) => [
        club.shortName,
        club.backerTier,
        club.backerSupportFloor === null ? "—" : pl(club.backerSupportFloor),
        pl(club.initialBudget),
        club.binding.includes("backerSupportFloor")
          ? "**tak**"
          : club.backerSupportFloor === null
            ? "brak podłogi"
            : "nie — istnieje, lecz nie wiąże",
      ])
  );

const europeanTable = (clubs: readonly ClubVariantRow[]): string =>
  table(
    [
      "klub",
      "budżet",
      "mediana bilansu bez pucharów",
      "mediana pucharów w S1",
      "mediana pucharów w karierze",
      "z pucharów wraca do budżetu",
      "po S5",
      "przy przekazaniu",
    ],
    clubs
      .filter((club) => EUROPEAN_STARTERS.includes(club.shortName))
      .map((club) => [
        club.shortName,
        pl(club.initialBudget),
        pl(club.medianOperatingBalance),
        pl(club.medianFirstSeasonCupIncome),
        pl(club.medianCareerCupIncome),
        pl(club.medianReinvestedCareerCupIncome),
        pl(club.medianCashAfterSeason5),
        pl(club.medianCashAtHandover),
      ])
  );

const aggregateTable = (variants: readonly VariantResult[]): string =>
  table(
    [
      "wariant",
      "wykonalny",
      "Σ Δ budżetu",
      "kluby z ujemną medianą po S5",
      "pooled p95 po S5",
      "IQR budżetu",
      "min",
      "mediana",
      "max",
      "max/min",
      "podłoga wiąże u",
    ],
    variants.map((variant) => [
      `\`${variant.key}\``,
      variant.feasible ? "tak" : "**nie**",
      pl(variant.aggregate.totalBudgetDeltaVsCurrent, 2),
      String(variant.aggregate.clubsNegativeMedianCashAfterSeason5),
      pl(variant.aggregate.pooledP95CashAfterSeason5, 2),
      pl(variant.aggregate.iqrBudget),
      pl(variant.aggregate.minBudget),
      pl(variant.aggregate.medianBudget),
      pl(variant.aggregate.maxBudget),
      pl(variant.aggregate.maxOverMinBudget, 2),
      String(variant.aggregate.boundByComponent.absoluteFloor),
    ])
  );

const sliceSection = (slice: NamedSlice): string => {
  const a = slice.variant.aggregate;
  return [
    `### Przekrój „${slice.label}” — \`${slice.variant.key}\``,
    "",
    `${slice.rationale} **Nazwa nie jest rekomendacją.**`,
    "",
    `- wykonalny: ${slice.variant.feasible ? "tak" : `**nie** — ${slice.variant.infeasibleReasons.join("; ")}`}`,
    `- suma różnic wobec dzisiejszych budżetów: ${pl(a.totalBudgetDeltaVsCurrent, 2)} mln`,
    `- kluby ze wszystkich osiemnastu zdolne do reprezentatywnego wzmocnienia: ${a.clubsCoveringUsefulCost}/18`,
    `- kluby z ujemną **medianą** gotówki: po S1 ${a.clubsNegativeMedianCashAfterSeason1}, po S5 ${a.clubsNegativeMedianCashAfterSeason5}, przy przekazaniu ${a.clubsNegativeMedianCashAtHandover}`,
    `- pooled p95 gotówki po pięciu sezonach pełnej kariery: ${pl(a.pooledP95CashAfterSeason5, 2)} mln`,
    `- gotówka przy przekazaniu: ${pl(a.handoverCashLegacyProxyPoints, 1)} pkt jako **proxy wkładu do dziedzictwa przy przekazaniu** (bez S6–S8), ${pl(a.medianHandoverVerdictPoints, 1)} pkt werdyktu (bieżące mnożniki)`,
    `- podłoga \`MIN_INITIAL_BUDGET\` wiąże u ${a.boundByComponent.absoluteFloor} klubów: ${a.floorBoundClubs.join(", ") || "—"}`,
    "",
    "#### Wszystkie osiemnaście klubów",
    "",
    clubTable(slice.variant.clubs),
    "",
    "#### Cztery kluby z klasą wsparcia",
    "",
    backerTable(slice.variant.clubs),
    "",
    "#### Pięciu startowych uczestników Europy",
    "",
    "Późniejsze kwalifikacje są wynikiem symulacji i siedzą już w medianie bilansu; ta tabela wyróżnia wyłącznie kluby, które wchodzą do Europy na starcie kadencji.",
    "",
    europeanTable(slice.variant.clubs),
  ].join("\n");
};

export const renderReport = (input: {
  readonly stem: string;
  readonly generatedAt: string;
  readonly inputs: readonly { readonly path: string; readonly sha256: string }[];
  readonly baseSha: string;
  readonly engineVersions: readonly string[];
  readonly careers: number;
  readonly seasons: number;
  readonly drift: readonly DriftRow[];
  readonly driftTolerance: number;
  readonly rngPairing: RngPairing;
  readonly gridSize: number;
  readonly feasibleCount: number;
  readonly front: readonly VariantResult[];
  readonly rateSweeps: readonly NamedRateSweep[];
  readonly slices: readonly NamedSlice[];
  readonly current: readonly ClubVariantRow[];
}): string => {
  const maxDrift = Math.max(...input.drift.map((d) => Math.abs(d.difference)));
  return [
    `# Budżet pierwszego okna i reinwestycja — dopasowanie ${input.stem}`,
    "",
    "## DECISION REQUIRED",
    "",
    "Ten raport **niczego nie aktywuje**. Mierzy wykonalne warianty budżetu pierwszego okna, jednorazowej podłogi wsparcia właściciela lub sponsora i stopy reinwestycji, i kończy się pięcioma pytaniami do właściciela produktu. Żadna stała w `src/` nie została zmieniona.",
    "",
    "## Wejścia",
    "",
    `- commit bazowy: \`${input.baseSha}\``,
    `- data pomiaru: ${input.generatedAt}`,
    `- wersje silnika w dumpach: ${input.engineVersions.join(", ")}`,
    `- kariery: ${input.careers} na przebieg, sezony: ${input.seasons} na przebieg`,
    "",
    table(
      ["plik", "sha256"],
      input.inputs.map((entry) => [`\`${entry.path}\``, `\`${entry.sha256}\``])
    ),
    "",
    "### `passive always-pass estimate`",
    "",
    "Gotówka pod każdą stopą reinwestycji jest odtworzona **post hoc** z sezonów, które silnik naprawdę rozegrał polityką `alwaysPass`:",
    "",
    "```",
    "candidateCashAfterN = candidateInitialBudget",
    "                    + rate x sum(actualBalanceWithoutTransfersAndCups[1..n] + creditedCupIncome[1..n])",
    "```",
    "",
    "To jest **przybliżenie biernej polityki**, nie symulacja decyzji gracza. Aktywna polityka kupowałaby i sprzedawała zależnie od gotówki, którą wariant właśnie zmienia, więc jej kontrfaktycznej kadry nie da się odczytać z dumpu i nie jest tu udawana. Przychód pucharowy **jest** uwzględniony od schematu 4 dumpu sezonowego.",
    "",
    "### Dryf wejścia",
    "",
    `Mediana \`actualBalanceWithoutTransfersAndCups\` per klub z przebiegu kontrolnego, wobec \`metrics.ladderShares[].medianSeasonBalance\` przypiętego w podsumowaniu aktywacji z 2026-09-10. Największa różnica: **${maxDrift.toExponential(2)}**, tolerancja \`${input.driftTolerance}\`. Dumpy nie są porównywane bajtowo, bo niosą \`engineVersion\`, które podniesiono później bez zmiany tej mechaniki.`,
    "",
    table(
      ["klub", "zmierzone", "przypięte", "różnica"],
      input.drift.map((d) => [
        d.clubShortName,
        pl(d.measured, 4),
        pl(d.pinned, 4),
        d.difference.toExponential(2),
      ])
    ),
    "",
    "### Tożsamość strumienia RNG",
    "",
    "Licznik `rngDrawCount` musi być **identyczny po każdym rozegranym sezonie** w obu przebiegach. Różnica na którymkolwiek sezonie oznaczałaby, że przebiegi rozegrały inną piłkę, i blokuje raport — nawet gdyby werdykt też się różnił.",
    "",
    "Różnica **końcowego** licznika jest dopuszczalna wyłącznie tam, gdzie kariera przekroczyła gałąź werdyktu `ROZWIĄZANIE KONTRAKTU`, jako jedyna nie wykonującą losowania. `computeVerdict` czyta `kasa`, a przebieg kontrolny nie księguje pucharów, więc to przekroczenie jest z konstrukcji, nie usterką; epilog kaskaduje potem to jedno losowanie. Różnica bez przekroczenia tej granicy jest **nieprzypisana** i blokuje raport.",
    "",
    `Zmierzone: końcowy licznik różni się w **${input.rngPairing.finalTallyDiffers} z ${input.rngPairing.totalCareers}** karier (${((100 * input.rngPairing.finalTallyDiffers) / input.rngPairing.totalCareers).toFixed(2)}%); granicę werdyktu przekroczyło ${input.rngPairing.verdictBoundaryCrossed} karier. Każda różnica licznika mieści się w tym zbiorze; kariery, które granicę przekroczyły, a licznik im się zgadza, to przypadki, w których kaskada epilogu skompensowała to jedno losowanie.`,
    "",
    "## Stan obecny",
    "",
    `Dzisiejsza reguła to \`max(scaledRecurringRevenue x ${MIN_BUDGET_SHARE}, ${MIN_INITIAL_BUDGET})\` z jednym historycznym \`ownerBudgetPercentile\`. Podłoga wiąże u piętnastu z osiemnastu klubów; powyżej są tylko Legia, Lech i Pogoń.`,
    "",
    table(
      ["klub", "dzisiejszy budżet"],
      input.current.map((club) => [club.shortName, pl(club.currentInitialBudget)])
    ),
    "",
    "## Siatka",
    "",
    `Pełny iloczyn pięciu osi: \`budgetShare\` 0,18–0,30 co 0,01; \`usefulUpgradeOvrDelta\` 0/1/2; \`boardReinvestmentRate\` 0,20–0,80 co 0,05 plus kontrolne 1,00; \`strongBackerPercentile\` 0,90/0,95; \`activeBackerPercentile\` 0,75/0,80. **${input.gridSize} wariantów**, z czego wykonalnych **${input.feasibleCount}**.`,
    "",
    `Wariant jest **niewykonalny**, gdy choć jeden klub nie pokrywa kosztu reprezentatywnego wzmocnienia, gdy \`MIN_INITIAL_BUDGET\` wiąże u co najmniej dziesięciu klubów, albo gdy którakolwiek wartość jest niedodatnia tam, gdzie kontrakt tego zabrania. Zdolność 18/18 jest **niezmiennikiem kontrolnym** formuły \`max(...)\`, nie osią wyboru.`,
    "",
    "## Front Pareto",
    "",
    "Cztery dokładne osie, bez składania w jedną wagę: minimalizuj sumę `candidateInitialBudget - currentInitialBudget` po klubach, minimalizuj liczbę klubów z ujemną medianą `cashAfterSeason5`, minimalizuj pooled `p95(cashAfterSeason5)`, maksymalizuj `IQR(candidateInitialBudget)`.",
    "",
    `Front liczy **${input.front.length}** wariantów.`,
    "",
    aggregateTable(input.front),
    "",
    "### Front nie rozstrzyga stopy reinwestycji",
    "",
    `Wszystkie warianty frontu mają \`rate\` = ${[...new Set(input.front.map((v) => v.candidate.boardReinvestmentRate.toFixed(2)))].join(", ")}. **To jest artefakt definicji osi, nie dowód, że ta stopa jest właściwa.**`,
    "",
    "Przy ustalonych czterech pozostałych osiach stopa reinwestycji **nie wpływa** ani na sumę różnic budżetu, ani na IQR — obie zależą wyłącznie od reguły budżetu. Wpływa natomiast monotonicznie na dwie pozostałe osie, i to w stronę pogorszenia: część klubów ma ujemną medianę bilansu operacyjnego, więc wyższa stopa pogłębia im gotówkę pod kreską, a zmierzony pooled `p95` rośnie w całym przebiegu. Niższa stopa dominuje więc wyższą na wszystkich czterech osiach naraz i front może zawierać wyłącznie minimum siatki.",
    "",
    "Zmierzony przebieg osobno dla każdego nazwanego przekroju; zmienia się wyłącznie `rate`, pozostałe cztery osie pozostają jak w jego tabeli klubowej:",
    "",
    ...input.rateSweeps.flatMap((sweep) => [
      `### Przebieg stopy: ${sweep.label}`,
      "",
      table(
        ["rate", "kluby z ujemną medianą po S5", "pooled p95 po S5", "Σ Δ budżetu", "IQR budżetu"],
        sweep.variants.map((variant) => [
          pl(variant.candidate.boardReinvestmentRate, 2),
          String(variant.aggregate.clubsNegativeMedianCashAfterSeason5),
          pl(variant.aggregate.pooledP95CashAfterSeason5, 2),
          pl(variant.aggregate.totalBudgetDeltaVsCurrent, 3),
          pl(variant.aggregate.iqrBudget, 4),
        ])
      ),
      "",
    ]),
    "",
    "**Wniosek dla pytania 3:** front jej nie wskaże. Stopa reinwestycji jest wyborem między bezpieczeństwem gotówkowym słabszych klubów a wielkością puli, jaką gracz obraca w kolejnych oknach — i tego drugiego ten pomiar nie punktuje wcale, bo bierna polityka `alwaysPass` niczego nie kupuje. Odpowiedź na nie jest decyzją projektową, nie odczytem z tabeli.",
    "",
    "## Trzy nazwane przekroje",
    "",
    ...input.slices.map((slice) => `${sliceSection(slice)}\n`),
    "## Czego ten raport nie dowodzi",
    "",
    "- **Nie mierzy czterech kart reaktywnego rynku.** Bramka czterech ofert leży po speku 5 i nie jest tu udawana przez obecny generator.",
    "- **Nie mierzy zmiany decyzji gracza.** Cała warstwa gotówki to przybliżenie biernej polityki `alwaysPass`; aktywna polityka wydawałaby inaczej, a jej kadra byłaby inna.",
    "- **Nie mierzy docelowego rozkładu tytułów.** Handicapy, progi dziedzictwa i kalibracja trudności zostają nietknięte; nowe budżety je ruszą i wymagają osobnej kalibracji.",
    "- **Nie mierzy gotówki końcowej po epilogu.** `LEGACY_KASA` punktuje stan po S8, a dump kończy się na przekazaniu klubu. Pokazana liczba legacy jest wyłącznie przeliczeniem gotówki z S5 w tej samej jednostce; aktywacja wymaga pomiaru pełnych karier.",
    "",
    "Pominięcia pucharów na tej liście **nie ma i być nie powinno**: od schematu 4 dumpu sezonowego `creditedCupIncome` wchodzi do przybliżenia i jest zmierzony, nie pominięty.",
    "",
    "## Pięć pytań do właściciela produktu",
    "",
    "1. **`budgetShare`** — jaki udział skalowanego przychodu powtarzalnego klub oddaje na pierwsze okno?",
    "2. **`usefulUpgradeOvrDelta`** — o ile OVR powyżej docelowego poziomu pozycji zakup ma być „użytecznym wzmocnieniem”: 0, 1 czy 2?",
    "3. **`boardReinvestmentRate`** — jaka część wyniku operacyjnego sezonu wraca do budżetu transferowego?",
    "4. **percentyl `strong`** — 0,90 czy 0,95, dla Widzewa i Wieczystej?",
    "5. **percentyl `active`** — 0,75 czy 0,80, dla Korony?",
    "",
    "Nie ma szóstego pokrętła i nie ma osobnych wartości per klub. Motor pozostaje `restrained` — świadomym brakiem podłogi — a czternaście pozostałych klubów `none`.",
    "",
    "Po decyzji powstaje osobny plan **atomowej aktywacji**. Jego wykonanie wymaga migracji historycznego pola `ownerBudgetPercentile` na `backerBudgetPercentile` wraz ze wszystkimi typami, testami i konsumentami: oba pola nie mogą współistnieć po aktywacji.",
    "",
  ].join("\n");
};

/** Every club in the declared order, for the "state today" table. */
export const clubOrder = (): readonly string[] => FIT_CLUB_IDS.map(shortNameForClubId);

export { candidateKey };
