# Golden master: formaty replayu, rewizja silnika i zamrożony baseline kariery

Czytaj, zanim dotkniesz `tests/golden/`, `src/logic/engine-version.ts` (`ENGINE_REVISION`), `pnpm golden:*`, formatu replayu w archiwum albo `CareerBaseline`.

## Korpus

`tests/golden/` niesie partie dobrane pod kryteria pokrycia, nie pod liczbę. Każda to para `.replay.json` (trwałe wejście) i `.trace.txt` (odtwarzalny ślad stanu gry). `pnpm test` odtwarza wszystkie przez czysty `gameReducer` (headless, bez DOM) i porównuje bit-identycznie.

Golden files nie są nigdy regenerowane po to, żeby test przeszedł. Regeneracja (`pnpm golden:retrace`, `pnpm golden:record`) wymaga przeczytania diffa i wyjaśnienia każdej kategorii różnicy w commicie.

## Dwa formaty replayu (od 2026-09-14)

- **`ReplayV2`** (`src/ui/game-archive.ts`) jest bieżącym kształtem, jaki produkuje runtime i archiwum: `{seed, clubId, manager, actions, engineVersion}`. `engineVersion` to zawsze rzeczywisty `ENGINE_REVISION` z chwili nagrania (`src/logic/engine-version.ts`), nigdy stała literalna.
- **Pliki `.replay.json` w `tests/golden/` zostają celowo w przejściowym formacie v1**: `{seed, poziom, akcje, engineVersion: "reducer-v1"}`. Migracja na model klubu zmieniła runtime, nie korpus. `tests/golden/headless.ts` rozpoznaje `"reducer-v1"` literalnie i odtwarza taki plik przez adapter (`playGoldenV1Replay`), który pomija pierwszy krok (`START:<poziom>`) i gra przez klub przypisany scenariuszowi w `tests/golden/scenarios.ts`, bo v1 nie zapisuje klubu.
- **Adapter nie odtwarza nagrania wiernie.** Usunięte losowanie klubu przesunęło kaskadę RNG, a kolejność terminarza przestała zależeć od literału `CLUBS`, więc kadencja może dziś trwać dłużej albo krócej niż nagrana. Gdy nagrane decyzje się skończą, adapter dobiera kolejne z polityki scenariusza (`scenario.policy`); gdy kadencja skończy się wcześniej, reszta nagrania zostaje niewykorzystana. Z replayem porównywany jest tylko **wykorzystany prefiks** nagranych decyzji (`recordedCount`); decyzje dobrane z polityki przypina wyłącznie `.trace.txt`, który obejmuje całą partię.
- **Nagranie v2.** `pnpm golden:record` umie już zapisać v2, ale nikt go nie uruchamia przed krokiem 8b speka 4 (nagranie v2 tuż przed kalibracją z kroku 9, decyzja z 2026-09-23). Do tego czasu trace'y zostają jedynym pełnym zapisem partii, a `.replay.json` w v1 nie jest pełnym zapisem partii, którą trace opisuje.

## `ENGINE_REVISION`

Bieżąca wartość mieszka w `src/logic/engine-version.ts` i przypina ją `tests/golden/engine-revision.test.ts`; nie przepisuj jej do notatek, bo starzeje się przy każdym retrace'ie. Podbija się ją przy każdej zmianie, która przesuwa kaskadę RNG albo zachowanie silnika w trace'ach, a commit z retrace'em wyjaśnia, dlaczego różnica jest zamierzona, a nie regresją. Wartość trafia do zapisów: autosave z inną rewizją jest dziś odrzucany (`docs/decisions/autosave.md`).

## `CareerBaseline`

Zamrażany raz, na `START_CAREER`, i nigdy przeliczany. `buildCareerBaseline(clubId)` (`src/logic/career-baseline.ts`) niesie `advantageScore`, `tenureHandicap`, `legacyHandicap` i pierwszy europejski puchar; werdykt i epilog czytają te pola z zamrożonego stanu, nie z nowego wywołania. Strażnik zapisu sprawdza, że zapisany baseline zgadza się z `buildCareerBaseline` dla bieżącego `ENGINE_REVISION`; inaczej odczyt jest odrzucany (`discarded`).
