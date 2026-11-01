import { readFileSync, writeFileSync } from "node:fs";

import { EUROPEAN_ADVANCE_ODDS } from "../../src/data/balance";
import { renderTable } from "../balance-report";
import { parseFlags } from "../cli-args";
import { UECL_ACCESSED_AT, UECL_CROSS_CHECKS, UECL_SOURCES } from "../data/uecl-sources";
import type { CohortRow } from "./dataset";
import {
  OBSERVABLE_COHORT_RANKS,
  RANK_BANDS,
  bandOf,
  isClosestObservable,
  clusterBootstrap,
  oneSeasonPerClub,
  parseCohortCsv,
  rateOf,
  repeatedClubs,
  type Rate,
} from "./report-core";

/**
 * Reads the pinned cohort and reports how often a club entering the
 * Conference League at the Main Path second qualifying round reached the main
 * phase - the real-world counterpart of the berth this game hands its player.
 *
 * Offline and read-only. It changes no constant, and it deliberately stops
 * short of a calibration: the model's axis is squad strength, and nothing here
 * maps a real club onto that axis. See the closing section.
 */

const HELP = `Usage:
  pnpm audit:uecl [--in <csv>] [--replications N] [--seed 0xHEX] [--md FILE]

Defaults:
  --in scripts/data/uecl-q2-cohort.csv
  --replications 20000   cluster bootstrap replications
  --seed 0x1ec10001

Offline: reads the pinned CSV only. Rebuild that with pnpm data:parse-uecl.`;

const pl = (value: number, digits = 1): string => value.toFixed(digits).replace(".", ",");
const pct = (value: number, digits = 1): string => `${pl(value * 100, digits)}%`;

const rateRow = (rate: Rate): string[] => [
  rate.label,
  String(rate.n),
  String(rate.advanced),
  pct(rate.share),
  `${pct(rate.wilsonLower)} – ${pct(rate.wilsonUpper)}`,
];

const RATE_HEADERS = ["grupa", "n", "awansowało", "udział", "przedział Wilsona"];

const rateTable = (groups: readonly { label: string; rows: CohortRow[] }[]): string =>
  renderTable(
    RATE_HEADERS,
    groups.flatMap((group) => {
      const rate = rateOf(group.label, group.rows);
      return rate ? [rateRow(rate)] : [[group.label, "0", "0", "—", "—"]];
    }),
    "markdown"
  );

const groupBy = <T extends string>(
  rows: readonly CohortRow[],
  keyOf: (_row: CohortRow) => T | null,
  order: readonly T[]
): { label: string; rows: CohortRow[] }[] =>
  order.map((value) => ({ label: value, rows: rows.filter((row) => keyOf(row) === value) }));

const main = (): void => {
  const argv = process.argv.slice(2);
  if (argv.includes("--help")) {
    console.log(HELP);
    return;
  }
  const flags = parseFlags(
    argv,
    ["--in", "--replications", "--seed", "--md", "--help"],
    ["--help"]
  );
  const input = flags.get("--in") ?? "scripts/data/uecl-q2-cohort.csv";
  const replications = Number(flags.get("--replications") ?? 20_000);
  const seed = Number(flags.get("--seed") ?? 0x1ec1_0001) >>> 0;
  const md = flags.get("--md") ?? null;

  const all = parseCohortCsv(readFileSync(input, "utf8"));
  const modern = all.filter((row) => row.format === "leaguePhase36");
  const legacy = all.filter((row) => row.format === "groupStage32");
  const seasons = [...new Set(all.map((row) => row.season))].sort();
  const modernSeasons = [...new Set(modern.map((row) => row.season))].sort();

  const headline = rateOf("2024/25–2026/27 (36 klubów)", modern)!;
  const legacyRate = rateOf("2021/22–2023/24 (32 kluby)", legacy)!;
  const pooled = rateOf("wszystkie sześć edycji", all)!;

  const bySeasonBootstrap = clusterBootstrap(
    modern,
    "sezon",
    (row) => row.season,
    replications,
    seed
  );
  const byAssociationBootstrap = clusterBootstrap(
    modern,
    "związek",
    (row) => row.association,
    replications,
    seed ^ 0x5eed
  );
  const unique = oneSeasonPerClub(modern);
  const uniqueRate = rateOf("jedna edycja na klub", unique)!;
  const repeats = repeatedClubs(modern);

  const lines: string[] = [];
  lines.push("# Obserwowana częstość awansu z Q2 Ligi Konferencji");
  lines.push("");
  lines.push(
    `Zdarzenie: klub wchodzi do Ligi Konferencji w **II rundzie eliminacji ścieżki głównej** i dociera do fazy głównej — trzy dwumecze, ta sama liczba co dla polskiego uczestnika LK w cyklu, który odwzorowuje gra. Dane przypięte w \`scripts/data/uecl-q2-cohort.csv\`, zbudowane przez \`pnpm data:parse-uecl\` z lokalnych kopii stron (dostęp ${UECL_ACCESSED_AT}). Ten raport niczego nie pobiera i nie zmienia żadnej stałej.`
  );
  lines.push("");
  lines.push("## Wynik główny");
  lines.push("");
  lines.push(
    `**${pct(headline.share)}** (${headline.advanced}/${headline.n}) w sezonach ${modernSeasons.join(", ")} — format 36-klubowej fazy ligowej, ten sam co w grze.`
  );
  lines.push("");
  lines.push(
    rateTable([
      { label: headline.label, rows: modern },
      { label: legacyRate.label, rows: legacy },
      { label: pooled.label, rows: all },
    ])
  );
  lines.push("");
  lines.push(
    "Starszy format (32 kluby w fazie grupowej) ma tę samą liczbę dwumeczów, ale mniej miejsc po drugiej stronie sita, więc jest **analizą wrażliwości, nie częścią wyniku głównego**."
  );

  lines.push("");
  lines.push("## Zawężanie kohorty — najbliższa strukturalnie obserwowalna");
  lines.push("");
  lines.push(
    `Szeroka kohorta jest **benchmarkiem, nie celem**: miesza mistrza Andory z trzecią drużyną Holandii. Gra odwzorowuje **jedno** miejsce LK, należące do związku z okolic dwunastej rangi, a jego klub jest w tym losowaniu rozstawiony. Każdy krok niżej to osobne twierdzenie o porównywalności, więc każdy ma własne \`n\`.

Dopasowane jest wyłącznie **położenie na access liście** — ranga związku, runda wejścia, rozstawienie. Stąd nazwa „najbliższa strukturalnie obserwowalna kohorta”, a nie „kohorta polskiego typu” czy „najbliższa grze”: twierdzenie, że te kluby przypominają to, co gra wysyła do Europy, wymagałoby mapowania na oś \`strength\`, którego nie ma. To najbliższa kohorta, jaką da się **zaobserwować**, nie najbliższa, jaką da się **porównać**.`
  );
  lines.push("");
  const observable = modern.filter(isClosestObservable);
  lines.push(
    rateTable([
      { label: "wszyscy wchodzący w Q2 (szeroki benchmark)", rows: modern },
      {
        label: `związek rangi ${OBSERVABLE_COHORT_RANKS.from}–${OBSERVABLE_COHORT_RANKS.to}`,
        rows: observable,
      },
      {
        label: `ranga ${OBSERVABLE_COHORT_RANKS.from}–${OBSERVABLE_COHORT_RANKS.to} i rozstawiony — najbliższa strukturalnie obserwowalna kohorta`,
        rows: observable.filter((row) => row.seeded === true),
      },
      {
        label: "kluby polskie (wszystkie sześć edycji)",
        rows: all.filter((row) => row.association === "POL"),
      },
    ])
  );
  lines.push("");
  lines.push(
    "Rozstawienie i współczynnik klubowy są ustalone **przed** rundą — rozstawienie jest wręcz z współczynnika wyprowadzone — więc oba są legalnymi predyktorami tego zdarzenia. Nie są natomiast odpowiednikiem siły kadry w grze."
  );
  lines.push("");
  lines.push(
    "**Rozstawienie niemal rozstrzyga to zdarzenie.** W formacie 36-klubowym awansowało 30 z 93 rozstawionych i **0 z 71 nierozstawionych**; przez wszystkie sześć edycji nierozstawiony awansował raz na 147 prób. Wchodzący w Q2 nierozstawiony to najsłabszy z bezpośrednich uczestników, który musi wygrać trzy dwumecze — a uczestnik z rangi 10–15 zwykle nim nie jest."
  );
  lines.push("");
  lines.push("Polskie kluby w tej rundzie, wszystkie sześć edycji:");
  lines.push("");
  lines.push(
    renderTable(
      ["sezon", "klub", "podstawa krajowa", "rozstawiony", "faza główna"],
      all
        .filter((row) => row.association === "POL")
        .map((row) => [
          row.season,
          row.club,
          row.domesticBasis ?? "—",
          row.seeded === null ? "—" : row.seeded ? "tak" : "nie",
          row.reachedLeaguePhase ? "tak" : "nie",
        ]),
      "markdown"
    )
  );
  lines.push("");
  lines.push(
    "Dwanaście obserwacji to za mało na własny przedział, ale pokazują kształt: polskie miejsce trafia tu i rozstawione, i nierozstawione, a **żaden nierozstawiony polski klub nie awansował**."
  );

  lines.push("");
  lines.push("## Niepewność");
  lines.push("");
  lines.push(
    "Przedział Wilsona opisuje udział przy założeniu niezależnych obserwacji, którego te dane **nie spełniają**: kluby z jednego sezonu dzielą to samo losowanie i tę samą stawkę, związki wracają co roku, a część klubów pojawia się w kilku edycjach. Dlatego obok niego stoi bootstrap losujący **całe klastry**."
  );
  lines.push("");
  lines.push(
    renderTable(
      ["metoda", "jednostka", "klastrów", "replikacji", "środek", "przedział 95%"],
      [
        [
          "Wilson (opisowy)",
          "—",
          "—",
          "—",
          pct(headline.share),
          `${pct(headline.wilsonLower)} – ${pct(headline.wilsonUpper)}`,
        ],
        [
          "bootstrap klastrowy",
          bySeasonBootstrap.unit,
          String(bySeasonBootstrap.clusters),
          String(bySeasonBootstrap.replications),
          pct(bySeasonBootstrap.mean),
          `${pct(bySeasonBootstrap.lower)} – ${pct(bySeasonBootstrap.upper)}`,
        ],
        [
          "bootstrap klastrowy",
          byAssociationBootstrap.unit,
          String(byAssociationBootstrap.clusters),
          String(byAssociationBootstrap.replications),
          pct(byAssociationBootstrap.mean),
          `${pct(byAssociationBootstrap.lower)} – ${pct(byAssociationBootstrap.upper)}`,
        ],
      ],
      "markdown"
    )
  );
  lines.push("");
  lines.push(
    `Bootstrap po sezonie ma tylko ${bySeasonBootstrap.clusters} klastry — to jest **jego własne ograniczenie**, nie miara precyzji: przy trzech sezonach przedział percentylowy odtwarza garść możliwych średnich, a nie gładki rozkład. Bootstrap po związku (${byAssociationBootstrap.clusters} klastrów) jest pod tym względem lepiej ugruntowany, ale ignoruje zależność w obrębie sezonu.`
  );
  lines.push("");
  lines.push("### Odporność na powtarzające się kluby");
  lines.push("");
  lines.push(
    `Ten sam klub wchodzi tą ścieżką rok po roku, więc udział zbiorczy po części mierzy, jak często wracają te same nazwy. Licząc **każdy klub raz** (najwcześniejsza edycja): **${pct(uniqueRate.share)}** (${uniqueRate.advanced}/${uniqueRate.n}), Wilson ${pct(uniqueRate.wilsonLower)} – ${pct(uniqueRate.wilsonUpper)}.`
  );
  if (repeats.length > 0) {
    lines.push("");
    lines.push(
      `Kluby w więcej niż jednej edycji (${repeats.length}): ${repeats
        .slice(0, 12)
        .map((entry) => `${entry.club} ×${entry.seasons}`)
        .join(", ")}${repeats.length > 12 ? ", …" : ""}.`
    );
  }

  lines.push("");
  lines.push("## Rozbicia");
  lines.push("");
  lines.push("Sezon:");
  lines.push("");
  lines.push(rateTable(groupBy(all, (row) => row.season, seasons)));
  lines.push("");
  lines.push("Ranga związku (wynik główny, 36 klubów):");
  lines.push("");
  lines.push(
    rateTable(
      groupBy(
        modern,
        (row) => bandOf(row.associationRank),
        RANK_BANDS.map((band) => band.label)
      )
    )
  );
  lines.push("");
  lines.push(
    "**Pasmo 10–15 jest tym, które odpowiada grze** — Polska siedzi w tym cyklu koło dwunastego miejsca. Pozostałe pasma pokazują gradient; uśrednianie po wszystkich mieszałoby mistrza Andory z trzecią drużyną Holandii."
  );
  lines.push("");
  lines.push("Rozstawienie w losowaniu Q2 (wynik główny):");
  lines.push("");
  lines.push(
    rateTable([
      { label: "rozstawiony", rows: modern.filter((row) => row.seeded === true) },
      { label: "nierozstawiony", rows: modern.filter((row) => row.seeded === false) },
      { label: "brak danych", rows: modern.filter((row) => row.seeded === null) },
    ])
  );
  lines.push("");
  lines.push("Podstawa krajowa (wynik główny, grupy o n ≥ 5):");
  lines.push("");
  const bases = [...new Set(modern.map((row) => row.domesticBasis ?? "brak danych"))]
    .map((label) => ({
      label,
      rows: modern.filter((row) => (row.domesticBasis ?? "brak danych") === label),
    }))
    .filter((group) => group.rows.length >= 5)
    .sort((a, b) => b.rows.length - a.rows.length);
  lines.push(rateTable(bases));

  lines.push("");
  lines.push("## Zestawienie z modelem gry — z zastrzeżeniem");
  lines.push("");
  lines.push(
    renderTable(
      ["wielkość", "wartość"],
      [
        [
          "obserwowany awans, szeroki benchmark (36 klubów)",
          `${pct(headline.share)} (n=${headline.n})`,
        ],
        [
          "obserwowany awans, najbliższa strukturalnie obserwowalna kohorta (ranga 10–15, rozstawiony)",
          (() => {
            const rate = rateOf(
              "kohorta obserwowalna",
              modern.filter((row) => isClosestObservable(row) && row.seeded === true)
            );
            return rate ? `${pct(rate.share)} (n=${rate.n})` : "—";
          })(),
        ],
        [
          "obserwowany awans, kluby polskie (sześć edycji)",
          (() => {
            const rate = rateOf(
              "POL",
              all.filter((row) => row.association === "POL")
            );
            return rate ? `${pct(rate.share)} (n=${rate.n})` : "—";
          })(),
        ],
        ["`pQualifyBase` LK w grze (siła 62)", pct(EUROPEAN_ADVANCE_ODDS.LK.pQualifyBase)],
        [
          "model gry przy zmierzonej medianie uczestnika LK (68,4)",
          pct(
            EUROPEAN_ADVANCE_ODDS.LK.pQualifyBase +
              EUROPEAN_ADVANCE_ODDS.LK.pQualifySlope * ((68.4 - 62) / 18)
          ),
        ],
      ],
      "markdown"
    )
  );
  lines.push("");
  lines.push(
    "**To nie jest jeszcze porównanie dwóch liczb tej samej wielkości.** Ścieżka jest porównywalna — trzy dwumecze do fazy głównej, ta sama runda wejścia. Siła nie: model czyta prawdopodobieństwo z osi `strength` swojej własnej gry, a kohorta nie została na tę oś zmapowana. Wiersz najbliższej strukturalnie obserwowalnej kohorty, a nie szeroki benchmark, jest właściwym punktem odniesienia — nadal jednak jako **mocna przesłanka**, że dzisiejsze stałe LK są za wysokie, a nie jako wynik kalibracji. Nawet ten wiersz mówi o połowie tego, co obiecuje model."
  );

  lines.push("");
  lines.push("## Kompletność próby");
  lines.push("");
  lines.push(
    "UEFA podaje liczbę klubów wchodzących do Q2 ścieżki głównej. Każda różnica między tą liczbą a kohortą jest wykluczeniem z jawnym powodem — parser zlicza je i przerywa, gdy kontrola się nie zgadza."
  );
  lines.push("");
  lines.push(
    renderTable(
      ["sezon", "format", "kohorta", "kluby fazy głównej", "źródło (rewizja)"],
      UECL_SOURCES.map((source) => {
        const rows = all.filter((row) => row.season === source.season);
        return [
          source.season,
          source.format === "leaguePhase36" ? "36 (faza ligowa)" : "32 (faza grupowa)",
          String(rows.length),
          String(source.mainPhaseClubs),
          `${source.qualifying.tier} / ${source.qualifying.revision}`,
        ];
      }),
      "markdown"
    )
  );
  lines.push("");
  lines.push(
    "Wykluczani są wyłącznie ci, którzy weszli do tej rundy **spadkiem z innych rozgrywek** (znacznik `UEL MP Q1` i pokrewne) — przegrali eliminacje Ligi Europy i wpadli tu w trakcie, więc nie mają polskiej ścieżki. Ścieżka mistrzowska jest osobnym losowaniem o innej puli rywali i nie wchodzi do kohorty w ogóle."
  );
  lines.push("");
  lines.push("Kontrole wobec liczb opublikowanych przez UEFA:");
  lines.push("");
  lines.push(
    renderTable(
      ["sezon", "co podaje UEFA", "wartość", "źródło"],
      UECL_CROSS_CHECKS.map((check) => [
        check.season,
        check.statement,
        String(check.value),
        check.url,
      ]),
      "markdown"
    )
  );

  lines.push("");
  lines.push("## Czego ten pomiar nie ustala");
  lines.push("");
  lines.push(
    "- **Nie mapuje siły klubów na skalę gry.** Bez tego obserwowanego udziału nie wolno wstawić wprost jako `pQualifyBase`: model czyta krzywą przy sile uczestnika, a nie przy średniej całej kohorty."
  );
  lines.push(
    "- **Nie identyfikuje nachylenia.** Jeden udział to jeden punkt; `pQualifyBase` i `pQualifySlope` to dwie niewiadome. Rozbicie po randze związku pokazuje gradient, ale ranga związku nie jest siłą kadry."
  );
  lines.push(
    "- **Nie rozstrzyga o `pKnockout*`.** Etap pucharowy pozostaje poza zakresem, bo repozytorium nie ma przypiętej realnej premii za ten etap."
  );
  lines.push(
    "- **Nie zastępuje access listy.** Rangi związku i podstawy krajowe pochodzą ze źródła wtórnego, oznaczonego w manifeście; kontrole UEFA obejmują liczby uczestników i klubów fazy głównej, nie każdy pojedynczy wiersz."
  );

  const report = lines.join("\n");
  console.log(report);
  if (md) {
    writeFileSync(md, `${report}\n`, "utf8");
    console.log(`\nRaport markdown zapisany do ${md}`);
  }
};

main();
