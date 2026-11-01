import { EUROPEAN_PRIZE_MONEY } from "../src/data/balance";
import { renderTable } from "./balance-report";
import type { EuropeanCup } from "../src/data/types";
import {
  CUPS,
  STRENGTH_GRID,
  VARIANTS,
  analyticCell,
  rawAdvance,
  type CellAudit,
  type EuropeanCupsAudit,
} from "./european-cups-audit-core";
import {
  CAREER_CLUBS,
  CAREER_POLICIES,
  distributionOf,
  firstCampaignPerCareer,
  groupBy,
  qualifyResidual,
  type CampaignObservation,
  type CareerRun,
  type StrengthDistribution,
} from "./european-cups-careers";
import {
  ACCESS_LIST_2027_28,
  EUROPEAN_REFERENCE,
  REAL_LEAGUE_PHASE_PRIZE,
} from "./european-cups-audit-reference";

/** Polish decimal comma, as everywhere else the game prints a number. */
const pl = (value: number, digits = 2): string => value.toFixed(digits).replace(".", ",");
const pct = (value: number, digits = 1): string => `${pl(value * 100, digits)}%`;

const cellOf = (cells: readonly CellAudit[], cup: string, strength: number): CellAudit => {
  const found = cells.find((c) => c.analytic.cup === cup && c.analytic.strength === strength);
  if (!found) throw new Error(`No cell for ${cup}@${strength}`);
  return found;
};

const directTable = (audit: EuropeanCupsAudit): string =>
  renderTable(
    [
      "siła",
      ...CUPS.flatMap((cup) => [
        `${cup} pQ analit.`,
        `${cup} pQ empir.`,
        `${cup} pKO analit.`,
        `${cup} pKO empir.`,
      ]),
    ],
    STRENGTH_GRID.map((strength) => [
      String(strength),
      ...CUPS.flatMap((cup) => {
        const c = cellOf(audit.cells, cup, strength);
        return [
          pct(c.analytic.pQualify),
          pct(c.empirical.pQualify),
          pct(c.analytic.pKnockout),
          pct(c.empirical.pKnockout),
        ];
      }),
    ]),
    "markdown"
  );

const cascadeTable = (audit: EuropeanCupsAudit): string =>
  renderTable(
    [
      "start",
      "siła",
      "faza ligowa (analit.)",
      "faza ligowa (empir.)",
      "knockout (analit.)",
      "knockout (empir.)",
      "przychód (analit.)",
      "przychód (empir.)",
      "losowania (analit.)",
      "losowania (empir.)",
      "nogi 1/2/3",
    ],
    CUPS.flatMap((cup) =>
      STRENGTH_GRID.map((strength) => {
        const c = cellOf(audit.cells, cup, strength);
        const legs = c.empirical.legCounts.map((count) => pct(count / c.empirical.n, 0));
        return [
          cup,
          String(strength),
          pct(c.analytic.reachLeague),
          pct(c.empirical.reachLeague),
          pct(c.analytic.reachKnockout),
          pct(c.empirical.reachKnockout),
          pl(c.analytic.expectedIncome),
          `${pl(c.empirical.meanIncome)} ± ${pl(c.empirical.seIncome, 3)}`,
          pl(c.analytic.expectedDraws, 3),
          pl(c.empirical.meanDraws, 3),
          legs.join(" / "),
        ];
      })
    ),
    "markdown"
  );

const variantComparisonTable = (): string =>
  renderTable(
    ["siła", ...VARIANTS.map((v) => `LK pQualify (${v.id})`)],
    STRENGTH_GRID.map((strength) => [
      String(strength),
      ...VARIANTS.map((v) => pct(rawAdvance(v.odds, "LK", strength).pQualify)),
    ]),
    "markdown"
  );

const variantIncomeTable = (): string =>
  renderTable(
    ["start", "siła", ...VARIANTS.map((v) => `przychód (${v.id})`)],
    CUPS.flatMap((cup) =>
      STRENGTH_GRID.map((strength) => [
        cup,
        String(strength),
        ...VARIANTS.map((v) => pl(analyticCell(v.odds, cup, strength).expectedIncome)),
      ])
    ),
    "markdown"
  );

const strengthTable = (audit: EuropeanCupsAudit): string =>
  renderTable(
    ["klub", "n", "P25", "mediana", "P75"],
    audit.strength.clubs.map((club) => [
      club.krotko,
      String(club.n),
      pl(club.p25, 1),
      pl(club.median, 1),
      pl(club.p75, 1),
    ]),
    "markdown"
  );

/** What the model says at one strength, whatever that strength came from. */
const modelAtTable = (audit: EuropeanCupsAudit, strength: number): string =>
  renderTable(
    ["puchar", "pQualify", "pKnockout", "faza ligowa po kaskadzie", "przychód"],
    CUPS.map((cup) => {
      const c = analyticCell(audit.variant.odds, cup, strength);
      return [cup, pct(c.pQualify), pct(c.pKnockout), pct(c.reachLeague), pl(c.expectedIncome)];
    }),
    "markdown"
  );

const distributionRow = (
  audit: EuropeanCupsAudit,
  cup: EuropeanCup,
  d: StrengthDistribution
): string[] => [
  d.label,
  String(d.n),
  pl(d.p25, 1),
  pl(d.median, 1),
  pl(d.p75, 1),
  pl(d.mean, 1),
  pct(rawAdvance(audit.variant.odds, cup, d.median).pQualify),
  pct(d.qualifiedShare),
];

const DISTRIBUTION_HEADERS = [
  "grupa",
  "n kampanii",
  "P25 siły",
  "mediana siły",
  "P75 siły",
  "średnia siły",
  "`pQualify` modelu przy medianie",
  "obserwowany udział awansów",
];

const campaignTable = (audit: EuropeanCupsAudit, run: CareerRun): string =>
  renderTable(
    ["puchar", ...DISTRIBUTION_HEADERS.slice(1)],
    CUPS.flatMap((cup) => {
      const d = distributionOf(
        cup,
        run.observations.filter((o) => o.cup === cup)
      );
      return d ? [[cup, ...distributionRow(audit, cup, d).slice(1)]] : [];
    }),
    "markdown"
  );

/** One breakdown table per cup, split by whatever the caller groups on. The
 * split is the point: a single median hides that a `trudny` club and a
 * `latwy` club are not the same entrant, and that season 5 is not season 1. */
const breakdownTable = (
  audit: EuropeanCupsAudit,
  run: CareerRun,
  cup: EuropeanCup,
  key: (_o: CampaignObservation) => string | number,
  order: readonly (string | number)[]
): string =>
  renderTable(
    DISTRIBUTION_HEADERS,
    groupBy(
      run.observations.filter((o) => o.cup === cup),
      key,
      order
    ).flatMap(({ key: value, observations }) => {
      const d = distributionOf(String(value), observations);
      return d
        ? [distributionRow(audit, cup, d)]
        : [[String(value), "0", "—", "—", "—", "—", "—", "—"]];
    }),
    "markdown"
  );

const referenceTable = (): string =>
  renderTable(
    [
      "punkt",
      "rodzaj",
      "puchar",
      "sezon",
      "runda wejścia",
      "mierzone zdarzenie",
      "wartość",
      "próg?",
    ],
    EUROPEAN_REFERENCE.map((point) => [
      point.label,
      point.kind === "projection"
        ? "projekcja"
        : point.kind === "historical"
          ? "wynik historyczny"
          : "szacunek modelowy",
      point.cup,
      point.season,
      point.entryRound,
      point.eventDefinition,
      pct(point.value),
      "NIE",
    ]),
    "markdown"
  );

const accessTable = (): string =>
  renderTable(
    ["miejsce", "puchar", "runda wejścia", "dwumeczów do fazy ligowej"],
    ACCESS_LIST_2027_28.map((row) => [
      row.spot,
      row.cup,
      row.entryRound,
      row.tiesToLeaguePhase === null ? "—" : String(row.tiesToLeaguePhase),
    ]),
    "markdown"
  );

const checksTable = (audit: EuropeanCupsAudit): string =>
  renderTable(
    ["próg", "opis", "wynik", "szczegóły"],
    audit.checks.map((check) => [
      check.id,
      check.opis,
      check.passed ? "ZIELONY" : "CZERWONY",
      check.detail,
    ]),
    "markdown"
  );

export const renderEuropeanCupsAudit = (audit: EuropeanCupsAudit): string => {
  const failed = audit.checks.filter((c) => !c.passed);
  const lines: string[] = [];

  lines.push(`# Audyt europejskich pucharów — wariant \`${audit.variant.id}\``);
  lines.push("");
  lines.push(
    `Narzędzie z rozdziału 9 \`docs/decisions/european-cups-audit.md\`. Offline, read-only: żadna stała balansowa nie jest zmieniana, warianty żyją w \`scripts/european-cups-audit-core.ts\`.`
  );
  lines.push("");
  lines.push(
    `Wariant: **${audit.variant.id}** — ${audit.variant.opis}. Kampanii na komórkę: ${audit.cli.runs}. Ziarno: \`0x${audit.cli.seed.toString(16)}\`. Kadr startowych na klub: ${audit.strength.samplesPerClub}.`
  );
  lines.push("");
  lines.push(
    `**Progi wewnętrzne: ${failed.length === 0 ? "wszystkie zielone" : `${failed.length} CZERWONYCH`}.** Progi sprawdzają wyłącznie, czy model robi to, co o sobie mówi. Żaden nie porównuje gry ze światem zewnętrznym — audyt ustalił, że nie ma liczby zewnętrznej nadającej się na próg.`
  );
  lines.push("");
  lines.push(checksTable(audit));

  lines.push("");
  lines.push("## 1. Prawdopodobieństwa bezpośrednie");
  lines.push("");
  lines.push(
    "`pQualify` z pierwszej nogi, `pKnockout` warunkowe na przejściu eliminacji — po jednej kolumnie analitycznej i empirycznej. Rozjazd większy niż szum próby oznacza błąd implementacji, nie błąd stałej."
  );
  lines.push("");
  lines.push(directTable(audit));

  lines.push("");
  lines.push("## 2. Po kaskadzie: fazy, przychód, losowania");
  lines.push("");
  lines.push(
    "`faza ligowa` to dotarcie do fazy ligowej **dowolnej** z rozgrywek, do których klub może spaść. `losowania` to zmierzona liczba wywołań `rng.next()` w kampanii — kontrakt RNG z rozdziału 7, liczony licznikiem opinającym strumień, a nie wyprowadzany z tego samego wzoru, który jest badany."
  );
  lines.push("");
  lines.push(cascadeTable(audit));

  lines.push("");
  lines.push("## 3. Kto naprawdę gra w Europie i z jaką siłą");
  lines.push("");
  if (audit.campaigns === null) {
    lines.push(
      "**Warstwa karier wyłączona (`--careers 0`).** Bez niej ten raport nie ma czym odpowiedzieć na pytanie o siłę uczestnika pucharów — rozkład kadr startowych z podrozdziału niżej **nie jest** jego zamiennikiem."
    );
  } else {
    const run = audit.campaigns;
    lines.push(
      `Pomiar na pełnych, headlessowych karierach: ${run.careers} partii (${audit.cli.careers} na komórkę \`klub × polityka\`, ${CAREER_CLUBS.length} kluby × ${Object.keys(CAREER_POLICIES).length} polityk), z których wypadło ${run.observations.length} kampanii europejskich. Siła to **dokładna wartość \`sila\` zapisana przez silnik** na linii sezonu — ta sama liczba, którą \`symulujRunde\` podało do \`resolveSeasonalEuropeanOutcome\`, ważona ławką dla faktycznie granego pucharu i wzięta z kadry po transferach i rozwoju. Żadnego mapowania rang siły na miejsca w tabeli.`
    );
    const [firstError] = run.errors;
    if (firstError !== undefined) {
      lines.push("");
      lines.push(
        `**${run.errors.length} karier rzuciło wyjątkiem i nie weszło do rozkładu** — pierwsza: ${firstError.clubId}/${firstError.policy}/${firstError.seed}: ${firstError.message}`
      );
    }
    lines.push("");
    lines.push(campaignTable(audit, run));
    lines.push("");
    lines.push(
      "Sezon 1 nigdy nie ma kampanii — klub wchodzi do gry bez pucharu, więc rozkłady poniżej zaczynają się od sezonu 2. Ostatnia kolumna to **obserwowany** udział kampanii, które przeszły eliminacje w pucharze startowym. Nie jest niezależnym dowodem: te kariery rozegrał ten sam model, więc mierzy spójność implementacji, nie trafność stałych."
    );
    lines.push("");
    lines.push(
      "Sparowana różnica między obserwacją a modelem przy **zmierzonej** sile każdej kampanii:"
    );
    lines.push("");
    lines.push(
      renderTable(
        ["puchar", "próba", "kampanie", "ziarna", "obserwacja − model (p.p.)"],
        CUPS.flatMap((cup) => {
          const all = run.observations.filter((o) => o.cup === cup);
          const model = (o: CampaignObservation): number =>
            Math.min(1, rawAdvance(audit.variant.odds, cup, o.strength).pQualify);
          const rows: string[][] = [];
          for (const [label, sample] of [
            ["wszystkie kampanie", all],
            ["pierwsza w karierze", firstCampaignPerCareer(all)],
          ] as const) {
            const residual = qualifyResidual(sample, model);
            if (residual) {
              rows.push([
                cup,
                label,
                String(residual.observations),
                String(residual.clusters),
                `${pl(residual.mean * 100, 1)} ± ${pl(residual.se * 100, 1)}`,
              ]);
            }
          }
          return rows;
        }),
        "markdown"
      )
    );
    lines.push("");
    lines.push(
      "Błąd standardowy jest **klastrowany po ziarnie**, nie po karierze ani po kampanii. Każde ziarno wraca we wszystkich komórkach `klub × polityka` i losuje tam tę samą formację i ten sam rynek, więc kariery z jednego ziarna też nie są niezależne. Poziom klastra nie jest tu drobiazgiem: klastrowanie po karierze dawało dla LM −2,8 ± 1,2 p.p., co czyta się jak realny rozjazd, a po ziarnie −1,9 ± 1,5 p.p., czyli szum. Traktowanie każdej kampanii jako niezależnej zaciska przedział jeszcze mocniej i myli jeszcze bardziej."
    );
    lines.push("");
    lines.push(
      "Drugi wiersz każdego pucharu bierze **wyłącznie pierwszą kampanię danej kariery**. Liczba kampanii w karierze zależy od ich wyników — awans w LM płaci, bogatszy klub zostaje w czołowej dwójce i gra tam znowu — więc uśrednianie po wszystkich kampaniach próbkuje sukcesy i porażki w różnym tempie. To, czy **pierwsza** kampania w ogóle istnieje, nie może zależeć od jej własnego wyniku, więc ta próba jest wolna od tego efektu, kosztem mniejszego n."
    );
    for (const cup of CUPS) {
      lines.push("");
      lines.push(`### ${cup} — rozkład według sezonu, klubu i polityki`);
      lines.push("");
      lines.push("Sezon:");
      lines.push("");
      lines.push(breakdownTable(audit, run, cup, (o) => o.sezon, [1, 2, 3, 4, 5]));
      lines.push("");
      lines.push("Klub:");
      lines.push("");
      lines.push(breakdownTable(audit, run, cup, (o) => o.clubId, CAREER_CLUBS));
      lines.push("");
      lines.push("Polityka gracza:");
      lines.push("");
      lines.push(breakdownTable(audit, run, cup, (o) => o.policy, Object.keys(CAREER_POLICIES)));
    }
    lines.push("");
    lines.push("### Model przy medianie siły uczestnika LK");
    lines.push("");
    const lk = distributionOf(
      "LK",
      run.observations.filter((o) => o.cup === "LK")
    );
    if (lk) {
      lines.push(
        `Mediana siły klubu, który faktycznie gra w LK: **${pl(lk.median, 1)}** (n = ${lk.n}, P25–P75 ${pl(lk.p25, 1)}–${pl(lk.p75, 1)}). To jest punkt, w którym trzeba czytać \`pQualify\` — nie kotwica \`strength = 62\`, która jest punktem konstrukcyjnym modelu, a nie zmierzoną średnią uczestnika.`
      );
      lines.push("");
      lines.push(modelAtTable(audit, lk.median));
    }
  }
  lines.push("");
  lines.push("### Rozkład siły początkowych kadr — materiał pomocniczy");
  lines.push("");
  lines.push(
    `Kadry startowe sezonu 1, generowane ścieżką \`CHOOSE_DIFFICULTY\`, ważone ławką jak dla klubu **bez** pucharów. Mediana klubowych median: **${pl(audit.strength.leagueMedian, 1)}**. Tabela mówi wyłącznie, jak szeroka jest stawka na starcie; **nie przypisuje klubom miejsc pucharowych** — kto zagra w Europie, rozstrzyga rozegrany sezon, nie ranga siły kadry.`
  );
  lines.push("");
  lines.push(strengthTable(audit));
  lines.push("");
  lines.push(
    `Kotwica modelu \`edge = 0\` przy sile 62 jest **punktem konstrukcyjnym**, nie potwierdzoną średnią ligi: mediana kadry startowej wypada na ${pl(audit.strength.leagueMedian, 1)}, a kluby grające w pucharach są wyraźnie mocniejsze od obu tych liczb.`
  );
  lines.push("");
  lines.push("## 4. Warianty — wyłącznie analiza wrażliwości");
  lines.push("");
  lines.push(
    "Ani A, ani B nie jest rekomendacją. Tabele pokazują, co każdy zestaw stałych zrobiłby z `pQualify` w LK i z przychodem wszystkich trzech ścieżek (LM i LE zmieniają się wyłącznie ogonem kaskady)."
  );
  lines.push("");
  lines.push(variantComparisonTable());
  lines.push("");
  lines.push(variantIncomeTable());

  lines.push("");
  lines.push("## 5. Materiał zewnętrzny — przypięty, bez werdyktu");
  lines.push("");
  lines.push(
    "Każdy punkt niesie rodzaj, rundę wejścia i dokładną definicję zdarzenia, bo dokładnie tego brakowało w usuniętym `docs/puchary.md`. Kolumna `próg?` jest twardo `NIE` dla wszystkich."
  );
  lines.push("");
  lines.push(referenceTable());
  lines.push("");
  for (const point of EUROPEAN_REFERENCE) {
    lines.push(
      `- **${point.label}** — ${point.caveat}. Źródło: ${point.source} (dostęp ${point.accessedAt}).`
    );
  }
  lines.push("");
  lines.push("### Prowizoryczna access lista 2027/28");
  lines.push("");
  lines.push(
    "Gra rozstrzyga każdą ścieżkę jednym losowaniem, niezależnie od liczby dwumeczów. Tabela jest miarą tego uproszczenia, a nie propozycją modelowania rund."
  );
  lines.push("");
  lines.push(accessTable());

  lines.push("");
  lines.push("## 6. Etap `knockout` — czego nadal nie da się skalibrować");
  lines.push("");
  lines.push(
    renderTable(
      [
        "puchar",
        "realna premia za fazę ligową (mln €)",
        "gra: faza ligowa",
        "gra: knockout",
        "gra: knockout / faza ligowa",
        "realna premia za knockout",
      ],
      CUPS.map((cup) => [
        cup,
        pl(REAL_LEAGUE_PHASE_PRIZE[cup]),
        pl(EUROPEAN_PRIZE_MONEY[cup].league),
        pl(EUROPEAN_PRIZE_MONEY[cup].knockout),
        pl(EUROPEAN_PRIZE_MONEY[cup].knockout / EUROPEAN_PRIZE_MONEY[cup].league),
        "**brak przypiętej kwoty**",
      ]),
      "markdown"
    )
  );
  lines.push("");
  lines.push(
    "Ostatnia kolumna jest pusta w całym repozytorium. Dopóki taka pozostaje, proporcji `knockout / faza ligowa` nie ma z czym skonfrontować i `pKnockoutBase` / `pKnockoutSlope` pozostają poza kalibracją — rozdział 5 audytu."
  );

  lines.push("");
  lines.push("## Czego ten przebieg nie ustala");
  lines.push("");
  lines.push(
    "- Nie mówi, czy stałe LK należy zmienić. Rozdział 3 podaje, **przy jakiej sile** trzeba czytać krzywą, ale sama krzywa pozostaje modelem: do rozstrzygnięcia `pQualifyBase` potrzebna jest obserwowana częstość awansu porównywalnej kadry na porównywalnej ścieżce, której nie ma."
  );
  lines.push(
    "- Nie identyfikuje `pQualifySlope`. Dwa punkty projekcyjne bez mapowania na skalę `strength` nie wyznaczają nachylenia — rozdział 2 audytu pokazał rozrzut 3,4× przy przesunięciach o 2 punkty siły."
  );
  lines.push(
    "- Nie mierzy wpływu na karierę. To robią `pnpm balance --dump-raw` i `pnpm balance:compare`, według listy z rozdziału 10."
  );
  lines.push(
    "- Nie mapuje siły na realne kluby. Rozkład z rozdziału 3 jest rozkładem uczestnika **w tej grze**; przełożenie go na Lecha czy GKS Katowice wymagałoby osi, której nikt nie zbudował — i której zmyślenie było błędem usuniętego `docs/puchary.md`."
  );
  lines.push(
    "- Nie obejmuje kampanii z epilogu. Sezony 6–8 dziedziczą klub, ale ich kampanie nie mają linii sezonu w śladzie, więc rozkład opisuje kadencję gracza, nie całą historię klubu."
  );

  return lines.join("\n");
};
