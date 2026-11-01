/**
 * Zadanie 4 of the rho study: the measurement itself.
 *
 * Offline, from the pinned CSV only, and it changes nothing in src/. What it
 * produces is a report - the decision about whether any of it reaches the
 * game belongs to zadanie 6 onward and to the product owner.
 *
 * Runs only after `pnpm audit:rho-power` has shown the estimator can find
 * what it is being pointed at. The order is not politeness: if power at
 * rho = -0.04 is poor, verdict B is likely and the study has to know that
 * before it sees a number, not after.
 */
import { valueAt } from "./value-at";
import { writeFileSync } from "node:fs";

import { MATCH_HOME_ADVANTAGE } from "../../src/data/balance";
import { renderTable, type TableFormat } from "../balance-report";
import { parseFlags } from "../cli-args";
import { BLOCK_GRID, separableBlockBootstrap } from "./dixon-coles-blocks";
import { stderrProgress, stderrStep } from "./progress";
import { fitProfile, type ProfileFit } from "./dixon-coles-profile";
import { matchOutcomeReferenceFrom, readPinnedResults } from "../match-engine-audit-reference";
import {
  DEFAULT_BLOCK_REPLICATIONS,
  DEFAULT_LRT_REPLICATIONS,
  ESCALATION_BAND,
  ESCALATION_REPLICATIONS,
  planRun,
  reportStatus,
  type BootstrapRun,
  bootstrapPValue,
  buildWindow,
  conservativeEnvelope,
  impliedDrawShare,
  parametricBootstrap,
  conservativePercentileInterval,
  profileInterval,
  rhoPerSeason,
  transportability,
  type RhoWindow,
} from "./audit-core";
import { mean, percent } from "../stats";

/** docs/decisions/rho-estimator-method.md fixes these. Lowering one is a
 * change to the protocol, not a convenience. */
const BASE_LRT_SEED = 0x1d3c0de;
const BASE_BLOCK_SEED = 0x1d3c0de + 1_000_000;

/**
 * The single pre-registered escalation, from
 * docs/decisions/rho-estimator-method.md: a p-value landing within three
 * Monte Carlo standard errors of the 0.01 threshold at B = 5000 buys exactly
 * one repeat at B = 20000, and that repeat decides.
 *
 * Evaluated by the tool rather than left to whoever reads the report. A rule
 * that depends on someone remembering it is not a stopping rule, and this is
 * the one place where remembering it is hardest - the moment the number lands
 * on the threshold is the moment there is most reason not to.
 */

const KNOWN_FLAGS = ["--md", "--lrt-replications", "--block-replications", "--seed", "--help"];

type WindowResult = {
  name: string;
  window: RhoWindow;
  fit: ProfileFit;
  profile: { lower: number; upper: number; truncated: boolean; failures: number };
  blockInterval: { lower: number; upper: number; estimable: boolean };
  envelope: { lower: number; upper: number };
  pValue: { lower: number; upper: number };
  lrt: BootstrapRun;
  block: BootstrapRun;
  blockDiagnostics: {
    curveFailures: number;
    curvesOutsideDomain: number;
    edgeMinima: number;
    coarseMinima: number;
  };
};

const measure = (
  name: string,
  seasons: readonly string[],
  lrtReplications: number,
  blockReplications: number,
  seedOffset: number
): WindowResult => {
  process.stderr.write(`
[${name}]
`);
  const window = buildWindow(seasons);
  const doneFit = stderrStep("dopasowanie pięciostartowe i profil");
  const fit = fitProfile(window.matches, { starts: 5 });
  if (fit.startSpread > 1e-6) {
    throw new Error(`starts disagree by ${fit.startSpread.toExponential(2)} on window ${name}`);
  }
  const profile = profileInterval(window.matches, fit, 0.99);
  doneFit();
  const nullRun = parametricBootstrap(
    window,
    fit,
    lrtReplications,
    BASE_LRT_SEED + seedOffset,
    stderrProgress("bootstrap parametryczny")
  );
  // Separable path: identical draws to the direct implementation, agreeing
  // to 2.4e-6 on rho and under 1.1e-6 on the interval ends over 200 paired
  // resamples, at a thousandth of the cost. See dixon-coles-blocks.ts.
  const blockRun = separableBlockBootstrap(
    window,
    blockReplications,
    BASE_BLOCK_SEED + seedOffset,
    BLOCK_GRID,
    stderrProgress("bootstrap blokowy")
  );
  const blockInterval = conservativePercentileInterval(blockRun, 0.99);
  return {
    name,
    window,
    fit,
    profile,
    blockInterval,
    envelope: conservativeEnvelope(profile, blockInterval),
    pValue: bootstrapPValue(nullRun, fit.likelihoodRatio),
    lrt: nullRun,
    block: blockRun,
    blockDiagnostics: {
      curveFailures: blockRun.curveFailures,
      curvesOutsideDomain: blockRun.curvesOutsideDomain,
      edgeMinima: blockRun.edgeMinima,
      coarseMinima: blockRun.coarseMinima,
    },
  };
};

const num = (value: number, digits = 4): string => value.toFixed(digits);
const pct = (value: number): string => `${value.toFixed(2)}%`;

const observedDrawShare = (seasons: readonly string[]): number => {
  const reference = matchOutcomeReferenceFrom(readPinnedResults(), seasons);
  const draws = reference.reduce((total, season) => total + season.draws, 0);
  const matches = reference.reduce((total, season) => total + season.matches, 0);
  return percent(draws, matches);
};

const renderWindow = (result: WindowResult, format: TableFormat): string =>
  renderTable(
    ["wielkość", "wartość"],
    [
      ["sezonów / meczów", `${result.window.seasons.length} / ${result.window.matches.length}`],
      ["**ρ̂**", `**${num(result.fit.rho)}**`],
      ["przedział profilowy 99%", `[${num(result.profile.lower)}; ${num(result.profile.upper)}]`],
      [
        "przedział blokowy, nominalnie 99% / zmierzone pokrycie 95,9%",
        result.blockInterval.estimable
          ? `[${num(result.blockInterval.lower)}; ${num(result.blockInterval.upper)}]`
          : "**nieoszacowalny — awarie mogłyby wypełnić ogon**",
      ],
      [
        "**obwiednia konserwatywna** (pokrycie ≥ 98,2%)",
        `**[${num(result.envelope.lower)}; ${num(result.envelope.upper)}]**`,
      ],
      [
        "obwiednia obejmuje zero",
        result.envelope.lower < 0 && result.envelope.upper > 0 ? "tak" : "nie",
      ],
      ["statystyka LRT", num(result.fit.likelihoodRatio, 3)],
      [
        "**p (bootstrap parametryczny)**",
        result.pValue.lower === result.pValue.upper
          ? `**${num(result.pValue.lower, 5)}**`
          : `**[${num(result.pValue.lower, 5)}; ${num(result.pValue.upper, 5)}]**`,
      ],
      ["rozrzut między pięcioma startami", result.fit.startSpread.toExponential(2)],
      [
        "ρ bez dopasowania: profil / szukanie przedziału",
        `${result.fit.searchFailures} / ${result.profile.failures}`,
      ],
      ["przedział profilowy ucięty", result.profile.truncated ? "**tak**" : "nie"],
      [
        "dopuszczalny zakres ρ z danych",
        `[${num(result.fit.feasible.lower, 3)}; ${num(result.fit.feasible.upper, 3)}]`,
      ],
      [
        "replikacje wykonane / zamówione (LRT)",
        `${result.lrt.values.length} / ${result.lrt.requested}`,
      ],
      [
        "replikacje wykonane / zamówione (blokowy)",
        `${result.block.values.length} / ${result.block.requested}`,
      ],
      [
        "awarie optymalizatora w krzywych / punkty poza dziedziną sezonu",
        `${result.blockDiagnostics.curveFailures} / ${result.blockDiagnostics.curvesOutsideDomain}`,
      ],
      ["minima ocenzurowane na brzegu siatki", String(result.blockDiagnostics.edgeMinima)],
      [
        "minima zgrubne (bez paraboli, dokładność pół kroku siatki)",
        String(result.blockDiagnostics.coarseMinima),
      ],
    ],
    format
  );

const buildReport = (
  main: WindowResult,
  sensitivity: WindowResult,
  elapsed: number,
  lrtReplications: number,
  blockReplications: number
): string => {
  const format: TableFormat = "markdown";
  const lines: string[] = [];
  const sameSign = Math.sign(main.fit.rho) === Math.sign(sensitivity.fit.rho);
  const overlap =
    main.envelope.lower <= sensitivity.envelope.upper &&
    sensitivity.envelope.lower <= main.envelope.upper;

  lines.push(
    `# Zależność wyników stron (ρ) — pomiar (${new Date().toISOString().slice(0, 10)})`,
    "",
    `Odtworzenie: \`pnpm audit:rho --lrt-replications ${lrtReplications} --block-replications ${blockReplications} --md <plik>\`. Wyłącznie z przypiętego \`scripts/data/ekstraklasa-results.csv\`, offline, bez zmian w \`src/\`. Czas obliczeń: ${(elapsed / 60).toFixed(1)} min.`,
    "",
    "Metoda, budżet i protokół decyzyjny: `docs/decisions/rho-estimator-method.md`. Moc i obciążenie estymatora: `pnpm audit:rho-power` — **liczby niżej czyta się razem z tamtym obciążeniem**.",
    "",
    "## 1. Okno główne — dziesięć sezonów",
    "",
    renderWindow(main, format),
    "",
    "## 2. Analiza wrażliwości — dziewięć sezonów bez 2020/21",
    "",
    renderWindow(sensitivity, format),
    "",
    "**Dlaczego przedział blokowy nosi dwie liczby.** Jego nominalne 99% pokrywa zmierzone **95,9% ± 0,70 p.p.** (`pnpm audit:rho-power`), bo o pokryciu przedziału percentylowego rządzi liczba klastrów — dziesięć sezonów — a nie 2944 mecze ani 2000 losowań. Nazywanie go dalej „przedziałem 99%” byłoby nazywaniem czegoś, o czym wiadomo, że tym nie jest. **Rozstrzyga jednak obwiednia, nie on**, a pokrycie sumy dwóch przedziałów jest nie mniejsze niż każdego z osobna: przy nominalnym pokryciu przedziału profilowego (98,2–99,1%) obwiednia pokrywa **co najmniej 98,2%**. To jest granica dolna wyprowadzona, nie zmierzona — za wąski składnik blokowy nie zawęża obwiedni, tylko przestaje ją poszerzać.",
    "",
    "## 3. Zgodność okien (punkt 3 z 2.2)",
    "",
    renderTable(
      ["kryterium", "wynik"],
      [
        ["ten sam znak ρ̂", sameSign ? "tak" : "**nie**"],
        ["obwiednie zachodzą na siebie", overlap ? "tak" : "**nie**"],
        [
          "werdykt punktu 3",
          sameSign && overlap ? "spełniony" : "**niespełniony — całe 2.2 upada, werdykt B**",
        ],
      ],
      format
    ),
    ""
  );

  lines.push("## 4. Reguła zatrzymania — czy ten raport jest ostateczny", "");
  const status = reportStatus(main.pValue, {
    lrtReplications,
    blockReplications,
    seedShift: 0,
  });
  const straddles = main.pValue.lower <= 0.01 && main.pValue.upper > 0.01;
  lines.push(
    renderTable(
      ["kryterium", "wynik"],
      [
        ["replikacje LRT / blokowe w tym przebiegu", `${lrtReplications} / ${blockReplications}`],
        [
          "pas eskalacji",
          `[${ESCALATION_BAND.lower.toFixed(4)}; ${ESCALATION_BAND.upper.toFixed(4)}]`,
        ],
        [
          "p wpada w pas",
          main.pValue.upper >= ESCALATION_BAND.lower && main.pValue.lower <= ESCALATION_BAND.upper
            ? "tak"
            : "nie",
        ],
        [
          "przedział p przekracza próg 0,01",
          straddles ? "**tak — sam przebieg nie rozstrzyga**" : "nie",
        ],
        [
          "**status raportu**",
          status === "inconclusive"
            ? "**NIEROZSTRZYGNIĘTY — przedział p przecina 0,01 przez awarie replikacji, a trzeciego przebiegu protokół nie przewiduje**"
            : status === "smoke"
              ? `**NIEOSTATECZNY — przebieg dymny, poniżej wiążących ${DEFAULT_LRT_REPLICATIONS} / ${DEFAULT_BLOCK_REPLICATIONS}**`
              : status === "escalation-owed"
                ? `**NIEOSTATECZNY — protokół żąda jednokrotnej powtórki przy \`--lrt-replications ${ESCALATION_REPLICATIONS}\`, i decyduje tamten wynik**`
                : "**ostateczny**",
        ],
      ],
      format
    ),
    "",
    "Reguła pochodzi z `docs/decisions/rho-estimator-method.md` i została spisana przed jakimkolwiek przebiegiem. Jest jednorazowa: po powtórce przy 20 000 nie ma trzeciej próby, a poza pasem nie ma nawet pierwszej.",
    ""
  );

  lines.push("## 5. Udział remisów implikowany przez dopasowanie", "");
  const observed = observedDrawShare(main.window.seasons);
  lines.push(
    renderTable(
      ["model", "udział remisów"],
      [
        ["dane rzeczywiste (dziesięć sezonów)", pct(observed)],
        [
          "dopasowanie bez τ (ρ = 0, dopasowanie ograniczone)",
          pct(impliedDrawShare(main.window, main.fit.layout, main.fit.nullParams, 0)),
        ],
        [
          "dopasowanie z τ (ρ = ρ̂)",
          pct(impliedDrawShare(main.window, main.fit.layout, main.fit.params, main.fit.rho)),
        ],
      ],
      format
    ),
    "",
    "Liczone po prawdziwej liście spotkań z rozkładu implikowanego przez dopasowanie, nie symulowane — więc bez szumu Monte Carlo. To jest ta część nadwyżki remisów, której **nie** tłumaczy heterogeniczność klubów; reszta luki silnika ma inne źródło.",
    ""
  );

  lines.push("## 6. Efekt gry u siebie, sezon po sezonie", "");
  const homeRows = main.window.seasons.map((season, index) => {
    const value = valueAt(main.fit.params, main.fit.layout.homeOffset + index);
    return [season, num(value, 4), num(Math.exp(value), 4)];
  });
  const engineAdvantage = MATCH_HOME_ADVANTAGE;
  lines.push(
    renderTable(["sezon", "home (log)", "mnożnik"], homeRows, format),
    "",
    `Średni mnożnik z dopasowania: **${num(Math.exp(mean(main.window.seasons.map((_, index) => valueAt(main.fit.params, main.fit.layout.homeOffset + index)))), 4)}**, wobec \`MATCH_HOME_ADVANTAGE\` = ${num(engineAdvantage, 4)} w silniku. Te dwie liczby **nie muszą się zgadzać** i rozjazd nie jest usterką: silnik stosuje przewagę jako jednostronny mnożnik gospodarza przy wspólnej bazie, a tutaj \`home\` jest efektem w logarytmie obok pełnego zestawu sił klubów.`,
    ""
  );

  lines.push("## 7. ρ sezon po sezonie — wyłącznie diagnostyka stabilności", "");
  lines.push(
    renderTable(
      ["sezon", "ρ̂ z jednego sezonu"],
      rhoPerSeason(main.window).map((row) => [row.season, row.rho === null ? "—" : num(row.rho)]),
      format
    ),
    "",
    "Model tego badania ma **jedno wspólne ρ** (rozdział 3 planu); tabela wyżej istnieje po to, żeby zobaczyć, czy któryś sezon nie ciągnie wyniku sam. Pojedynczy sezon to 306 meczów przy 35 parametrach, więc te wartości są z założenia bardzo niedokładne i **nie są wynikiem**.",
    ""
  );

  const transport = transportability(main.window, main.fit, main.window.seasons.length - 1);
  lines.push("## 8. Transportowalność ocen klubów — diagnostyka, nie rozstrzygnięcie", "");
  lines.push(
    renderTable(
      ["wielkość", "wartość"],
      [
        ["klubów dopasowanych do `TEAM_RATINGS`", String(transport.matched)],
        [
          "klubów bez pary",
          transport.unmatched.length === 0 ? "—" : transport.unmatched.join(", "),
        ],
        [
          "korelacja rang ataku",
          transport.attackCorrelation === null ? "—" : num(transport.attackCorrelation, 3),
        ],
        [
          "korelacja rang obrony",
          transport.defenceCorrelation === null ? "—" : num(transport.defenceCorrelation, 3),
        ],
      ],
      format
    ),
    "",
    '**Tej tabeli nie wolno awansować na rozstrzygnięcie, z następującego powodu.** `TEAM_RATINGS` niesie `snapshotDate: "2026-08-13"` i opisuje dzisiejszy skład ligi — jest tam Wieczysta, której w przypiętym CSV kończącym się na 2024/25 nie ma w ogóle. To nie są te same kluby w tym samym momencie ani ta sama skala parametrów, więc korelacja rang mierzy głównie to, że silne kluby bywają silne przez lata. Rozstrzygnięcie wymagałoby przypiętych historycznych snapshotów ocen; repo ich nie ma, a to badanie ich nie zdobywa.',
    ""
  );

  return lines.join("\n");
};

const main = (): void => {
  const cli = parseFlags(process.argv.slice(2), KNOWN_FLAGS, ["--help"]);
  if (cli.has("--help")) {
    console.log(
      [
        "pnpm audit:rho --md <plik> [--lrt-replications N] [--block-replications N]",
        "",
        `  --lrt-replications    bootstrap parametryczny pod H0 (domyślnie ${DEFAULT_LRT_REPLICATIONS})`,
        `  --block-replications  bootstrap blokowy po sezonach (domyślnie ${DEFAULT_BLOCK_REPLICATIONS})`,
        "  --md                  plik docelowy raportu (wymagany)",
      ].join("\n")
    );
    return;
  }
  const target = cli.get("--md");
  if (!target) throw new Error("--md <plik> is required: this run is too slow to print and lose");
  const lrtReplications = Number(cli.get("--lrt-replications") ?? DEFAULT_LRT_REPLICATIONS);
  const blockReplications = Number(cli.get("--block-replications") ?? DEFAULT_BLOCK_REPLICATIONS);
  const seedShift = Number(cli.get("--seed") ?? 0);
  if (!Number.isInteger(seedShift)) throw new Error("--seed must be an integer offset");

  const started = Date.now();
  const plan = planRun({ lrtReplications, blockReplications, seedShift });
  const [mainWindow, sensitivity] = plan.map((entry) =>
    measure(
      entry.name,
      entry.seasons,
      entry.lrtReplications,
      entry.blockReplications,
      entry.seedOffset
    )
  );
  const elapsed = (Date.now() - started) / 1000;
  process.stderr.write(`
Składanie raportu (diagnostyka sezonowa i transportowalność)...
`);

  if (mainWindow === undefined || sensitivity === undefined) {
    throw new Error("the run plan must measure a main and a sensitivity window");
  }
  writeFileSync(
    target,
    buildReport(mainWindow, sensitivity, elapsed, lrtReplications, blockReplications),
    "utf8"
  );
  console.log(`Raport zapisany: ${target}`);
};

main();
