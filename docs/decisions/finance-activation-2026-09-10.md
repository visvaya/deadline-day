# Aktywacja ekonomii — pomiar kontrolny (2026-09-10)

Wygenerowane przez `pnpm audit:finance-activation`. Nic tutaj nie jest symulowane ponownie —
każda liczba pochodzi z zapisanego dumpu wymienionego niżej.

> **Zakres werdyktu skorygowany 2026-09-11.** Raport poprawnie potwierdza aktywację
> skali pieniądza, lecz jego bramka `playability` jest słabsza od potrzeb produktu:
> sprawdza medianową kartę OVR 64, a nie użyteczne wzmocnienie konkretnego klubu.
> Nie sprawdza też, że `MIN_INITIAL_BUDGET = 0.75` wiąże u piętnastu klubów ani że
> cały wynik operacyjny trafia do `kasa`. Raport pozostaje prawidłowym baseline'em,
> ale nie zamyka korekty z §3.5–3.6 speka finansowego.

## Werdykty

| bramka | wynik | szczegóły |
| --- | --- | --- |
| money scale | OK | mediana klubowych median bilansu -0.020 mln (tolerancja 0,25); D implikowane 15488096 |
| cash drift | OK | Legia -0.230; Wieczysta 0.040; Wisła K. 0.020; Zagłębie 0.000 |
| rng attribution | OK | 12922/18000 identycznych; 4810 z pucharu sezonu 1, 268 z gałęzi werdyktu; 0 niewyjaśnionych, 0 braków, 0 zmian kadencji bez pucharu |
| free agent overpay | OK | alwaysHaggle 0.499; alwaysTake 0.500; mixed 0.488 |
| playability | OK | 18/18 klubów stać na medianową kartę KUPNO z rocznej płacy (0.582 mln) |
| legacy unit | OK | kasa 16.550 (0.0%); wartoscKadryMoj 3.986 (0.0%) |

**Wszystkie zmierzone bramki przechodzą.**

## Stałe, na których to leciało

| stała | wartość |
| --- | ---: |
| `ENGINE_REVISION` | 2026-09-10.1 |
| `MONEY_SCALE_PLN_PER_GAME_MILLION` | 15774182 |
| `WAGE_SLOPE` | 12 |
| `WAGE_AT_PIVOT` | 0.16245668290738177 |
| `WAGE_AT_PIVOT_PLN` | 2562621.283297329 |
| `LEAGUE_PRIZE_RATE` | 0.020438312479132893 |
| `KOSZTY_STALE` | 1.1 |
| `WOLNY_WAGE_PREMIUM` | 1.9349745509003764 |
| `MIN_BUDGET_SHARE` | 0.18 |
| `MIN_INITIAL_BUDGET` | 0.75 |
| `LEGACY_KASA` | 19.702380952380953 |
| `LEGACY_WARTOSC_KADRY` | 3.1929663214172073 |

## Artefakty

| plik | wierszy | sha256 |
| --- | ---: | --- |
| `scripts/data/finance-activation-2026-09-10/control-seasons.csv` | 68502 | `efd67251234fa400a3e8c02c0f48688fb383cf8706a41958ae1862d677458440` |
| `scripts/data/finance-activation-2026-09-10/control-raw.csv` | 18000 | `b3ac9ab6feafd81e9709966b5385b3e0e77ebb10491f76c4b4ccc7aac6529a23` |
| `scripts/data/finance-activation-2026-09-10/preactivation-rng.json` | 18000 | `a9cdc8eaaae0a0b0dacbe14740a5205a53f2bd6cf0134df118daf185f614ef24` |
| `scripts/data/finance-activation-2026-09-10/active-raw.csv` | 234000 | `81b264dee9db59f61e229841f6fd56d197c2dfbbd03e675ddde9b81678a5e678` |
| `scripts/data/finance-activation-2026-09-10/active-seasons.csv` | 915981 | `3d33f107376afc3d2a5e38dd7020a7f962ff250691329cd40c0b5628e44e1d7c` |
| `scripts/data/finance-activation-2026-09-10/active-signings.csv` | 986524 | `65ccf019124f8b6335bb5121850422ee941e4fbc575ded4aeabf3841f8358258` |
| `scripts/data/legacy-unit-baseline.json` | 1 | `9bc330b8fa3aa82ed2b2143b08b6cb3eaa7744045cddb97b3b8f6ebcf802a0f9` |

## Skala pieniądza

Mediana klubowych median rocznego bilansu bez transferów i pucharów: **-0,02 mln €**.
Ta sama mediana przeliczona na PLN: 17036905; implikowane `D` = 15488096.

## Dryf gotówki po pięciu sezonach

| klub | karier | mediana residuum | w tolerancji 0,50 |
| --- | ---: | ---: | --- |
| Cracovia | 1000 | -0,15 | tak |
| GKS | 1000 | -0,04 | tak |
| Górnik | 1000 | -0,22 | tak |
| Jagiellonia | 1000 | -0,11 | tak |
| Korona | 1000 | -0,07 | tak |
| Lech | 1000 | -0,22 | tak |
| Legia | 1000 | -0,23 | tak |
| Motor | 1000 | -0,05 | tak |
| Piast | 1000 | 0,04 | tak |
| Pogoń | 1000 | -0,15 | tak |
| Radomiak | 1000 | 0,04 | tak |
| Raków | 1000 | -0,26 | tak |
| Śląsk | 1000 | 0,04 | tak |
| Widzew | 1000 | -0,25 | tak |
| Wieczysta | 1000 | 0,04 | tak |
| Wisła K. | 1000 | 0,02 | tak |
| Wisła P. | 1000 | -0,02 | tak |
| Zagłębie | 1000 | 0,00 | tak |

## Udział drabinki w przychodzie sezonu

| klub | przychód powtarzalny | udział jako mistrz | udział jako 18. | mediana bilansu |
| --- | ---: | ---: | ---: | ---: |
| Legia | 9,34 | 3,8% | 0,2% | 6,01 |
| Lech | 6,50 | 5,4% | 0,3% | 2,44 |
| Pogoń | 4,40 | 7,7% | 0,5% | 1,59 |
| Raków | 3,87 | 8,7% | 0,5% | 0,63 |
| Widzew | 3,49 | 9,5% | 0,6% | 0,11 |
| Jagiellonia | 3,35 | 9,9% | 0,6% | 0,63 |
| Cracovia | 2,86 | 11,4% | 0,7% | -0,22 |
| Zagłębie | 2,83 | 11,5% | 0,7% | 0,21 |
| Wisła K. | 2,83 | 11,5% | 0,7% | 0,36 |
| Górnik | 2,64 | 12,2% | 0,8% | -0,48 |
| Śląsk | 2,41 | 13,2% | 0,8% | 0,14 |
| Motor | 2,40 | 13,3% | 0,8% | -0,15 |
| Piast | 2,01 | 15,5% | 1,0% | -0,25 |
| GKS | 1,70 | 17,8% | 1,2% | -0,95 |
| Korona | 1,57 | 19,0% | 1,3% | -1,10 |
| Radomiak | 1,39 | 20,9% | 1,4% | -0,81 |
| Wieczysta | 1,14 | 24,4% | 1,8% | -1,18 |
| Wisła P. | 0,94 | 28,1% | 2,1% | -1,73 |

## Długość karier

Karier: 18000. Mediana rozegranych sezonów: 5, kwartyl dolny 2.
Udział karier przerwanych spadkiem: 39,7%.

## Budżety startowe i grywalność

| klub | budżet | medianowa karta KUPNO z płacą | stać |
| --- | ---: | ---: | --- |
| Raków | 0,75 | 0,58 | tak |
| Jagiellonia | 0,75 | 0,58 | tak |
| Górnik | 0,75 | 0,58 | tak |
| Cracovia | 0,75 | 0,58 | tak |
| Widzew | 0,75 | 0,58 | tak |
| Śląsk | 0,75 | 0,58 | tak |
| Piast | 0,75 | 0,58 | tak |
| Radomiak | 0,75 | 0,58 | tak |
| Korona | 0,75 | 0,58 | tak |
| Motor | 0,75 | 0,58 | tak |
| Zagłębie | 0,75 | 0,58 | tak |
| Wisła K. | 0,75 | 0,58 | tak |
| Wieczysta | 0,75 | 0,58 | tak |
| GKS | 0,75 | 0,58 | tak |
| Wisła P. | 0,75 | 0,58 | tak |
| Pogoń | 0,79 | 0,58 | tak |
| Lech | 1,17 | 0,58 | tak |
| Legia | 1,68 | 0,58 | tak |

## Zasięg pasma `KUPNO` — obserwacja bez progu

Bramka grywalności pyta o **medianową** kartę i przeszłaby nawet wtedy, gdyby cała górna połowa
archetypu `gotowy` (OVR 67–78, wiek 24–28) była poza zasięgiem wszystkich osiemnastu klubów.
Tabela niżej pyta o coś innego: nie „czy każdego stać na cokolwiek", tylko „czy kogokolwiek stać na kogoś dobrego".
Liczone analitycznie, przy medianowym modyfikatorze ceny `KUPNO`, spokojnym rynku, wieku 26 lat
i przypiętym profilu pozycji. **Bez progu** — gdzie ma leżeć góra pasma, jest decyzją właściciela produktu.

| klub | budżet | najwyższy OVR (samo odstępne) | najwyższy OVR (z rocznej płacy) |
| --- | ---: | ---: | ---: |
| Raków | 0,75 | 68 | 67 |
| Jagiellonia | 0,75 | 68 | 67 |
| Górnik | 0,75 | 68 | 67 |
| Cracovia | 0,75 | 68 | 67 |
| Widzew | 0,75 | 68 | 67 |
| Śląsk | 0,75 | 68 | 67 |
| Piast | 0,75 | 68 | 67 |
| Radomiak | 0,75 | 68 | 67 |
| Korona | 0,75 | 68 | 67 |
| Motor | 0,75 | 68 | 67 |
| Zagłębie | 0,75 | 68 | 67 |
| Wisła K. | 0,75 | 68 | 67 |
| Wieczysta | 0,75 | 68 | 67 |
| GKS | 0,75 | 68 | 67 |
| Wisła P. | 0,75 | 68 | 67 |
| Pogoń | 0,79 | 69 | 68 |
| Lech | 1,17 | 72 | 70 |
| Legia | 1,68 | 74 | 73 |

Klubów nieosiągających **żadnego** OVR z pasma: **0** z 18.

## Ile z tego maskuje `capPurchasePrice`

Limit tnie cenę karty `KUPNO`/`PANIC` do `kasa × PURCHASE_PRICE_CAP`, więc klub bez pieniędzy widzi
mocnego zawodnika za grosze — wyświetlana cena przestaje znaczyć „ile on jest wart”, a zaczyna znaczyć
„ile masz”. **Spek 5 §6 ten mechanizm usuwa**, więc ten raport go nie naprawia ani nie przypina jako
poprawnego. Liczba niżej jest bazą: gdy limit zniknie, ten sam pomiar pokaże, jak duży klif się odsłania.

| klub | budżet | ilu OVR z pasma limit tnie | najgłębsze cięcie |
| --- | ---: | ---: | ---: |
| Raków | 0,75 | 8 / 12 | 63,7% |
| Jagiellonia | 0,75 | 8 / 12 | 63,7% |
| Górnik | 0,75 | 8 / 12 | 63,7% |
| Cracovia | 0,75 | 8 / 12 | 63,7% |
| Widzew | 0,75 | 8 / 12 | 63,7% |
| Śląsk | 0,75 | 8 / 12 | 63,7% |
| Piast | 0,75 | 8 / 12 | 63,7% |
| Radomiak | 0,75 | 8 / 12 | 63,7% |
| Korona | 0,75 | 8 / 12 | 63,7% |
| Motor | 0,75 | 8 / 12 | 63,7% |
| Zagłębie | 0,75 | 8 / 12 | 63,7% |
| Wisła K. | 0,75 | 8 / 12 | 63,7% |
| Wieczysta | 0,75 | 8 / 12 | 63,7% |
| GKS | 0,75 | 8 / 12 | 63,7% |
| Wisła P. | 0,75 | 8 / 12 | 63,7% |
| Pogoń | 0,79 | 8 / 12 | 61,6% |
| Lech | 1,17 | 5 / 12 | 43,4% |
| Legia | 1,68 | 2 / 12 | 18,6% |

## `VERDICT_KASA` — pomiar i późniejsza decyzja jednostki

`computeVerdict` liczy `ocena = pkt + trofea × VERDICT_TROFEUM + kasa × VERDICT_KASA − spadki × VERDICT_SPADEK`
i porównuje ją z `PROGI_WERDYKTU`. `VERDICT_KASA = 5` to **ta sama liczba co historyczne `LEGACY_KASA`**
i z tego samego powodu: obie przeliczały gotówkę na punkty przy starej skali. Ani plan, ani spek nie
wymieniały jej wśród stałych, które aktywacja przecenia — więc **została nietknięta**, a to jest pomiar,
który zamienia tę nietykalność w decyzję do podjęcia, nie w przeoczenie.

| wielkość | przed | po |
| --- | ---: | ---: |
| mediana gotówki końcowej | 3,31 | 0,84 |
| wkład `kasa × VERDICT_KASA` do `ocena` | 16,6 | 4,2 |
| kariery: ROZWIĄZANIE KONTRAKTU | 8656 | 8704 |
| kariery: GAŁĄŹ Z LOSOWANIEM | 9344 | 9296 |

Karier, które **na pewno** zmieniły szczebel werdyktu: **1658** z 18000 — to przejścia między najniższą gałęzią a jedną z trzech wyższych.
Wśród klubów **bez** miejsca europejskiego, gdzie zmieniły się wyłącznie pieniądze: co najmniej **270** z 13000.
Ta druga liczba jest właściwym odczytem wpływu `VERDICT_KASA` — werdykt klubu z pucharem rusza się także
dlatego, że kampania sezonu 1 zmienia siłę kadry, a przez nią tabelę i punkty, na których werdykt stoi.

Rozdzielczość tego pomiaru jest ograniczona i trzeba to powiedzieć wprost: snapshot preaktywacyjny
zapisuje, **czy** werdykt losował, a nie jego tytuł, więc odróżnia najniższą gałąź od pozostałych trzech,
ale nie tych trzech od siebie. Liczba wyżej jest zatem **podłogą** liczby zmian szczebla, nie jej
dokładną wartością — kariera, która przeszła z drugiej gałęzi na trzecią, jest tu niewidoczna.

**Decyzja zamknięta 2026-09-11:** `VERDICT_KASA` jest jednostką gotówki. Korekta budżetu i reinwestycji
przelicza ją w swoim atomowym commicie według historycznego iloczynu `16,55`, zanim wspólna kalibracja
dotknie `handicapKadencja` lub `PROGI_WERDYKTU`. Ten raport pozostaje dowodem, dlaczego pominięcie nie było
neutralne, ale nie jest już miejscem otwartego pytania.

## Obciążenie płacowe karty WOLNY

| polityka | podpisań | mediana udziału jednostkowego | nadpłata / odstępne | w paśmie 0,40–0,60 |
| --- | ---: | ---: | ---: | --- |
| alwaysHaggle | 30338 | 0,5334 | 0,4987 | tak |
| alwaysTake | 46812 | 0,5348 | 0,5000 | tak |
| mixed | 24051 | 0,5221 | 0,4881 | tak |

## Jednostka dziedzictwa

| wielkość | iloczyn historyczny | nowa mediana | mnożnik | iloczyn odtworzony | błąd |
| --- | ---: | ---: | ---: | ---: | ---: |
| `kasa` | 16,5500 | 0,8400 | 19,7024 | 16,5500 | 0,00% |
| `wartoscKadryMoj` | 3,9865 | 1,2485 | 3,1930 | 3,9865 | 0,00% |

## Parowanie liczników RNG

Aktywacja zmienia to, ile pieniądz jest wart, a nie ile wartości kariera losuje — z dwoma
wyjątkami, obydwoma wymuszonymi przez sam plan. Pierwszy sezon odtwarza prawdziwe miejsca
europejskie 2026/27, więc pięć klubów rozgrywa kampanię, której wcześniej nie było, a kampania
losuje. Drugi: `computeVerdict` punktuje kadencję **także z gotówki**, a najniższa z jego
czterech gałęzi jako jedyna wraca bez losowania — kariera, którą gotówka przesunęła przez tę
granicę, zużywa o jedno losowanie więcej lub mniej i przestawia cały epilog za sobą.

| wielkość | wartość |
| --- | ---: |
| sparowanych po (klub, seed) | 18000 |
| identycznych | 12922 |
| wyjaśnione pucharem sezonu 1 | 4810 |
| wyjaśnione gałęzią werdyktu | 268 |
| **niewyjaśnionych** | **0** |
| braków w snapshocie | 0 |
| **zmian kadencji w klubie bez pucharu** | **0** |

Kariery pięciu klubów z pucharem: 5000. Kampania zużywa **zmienną** liczbę losowań, więc różnica jest
szerokim rozkładem, nie stałym przesunięciem: p05 -6190, mediana 1, p95 6057.
Z tego **190** karier ma niezmieniony licznik — i to nie jest osobna kategoria wymagająca własnej
przyczyny, tylko środek tego rozkładu. Rozstrzyga je `pktA`, które zależy od siły kadry i losowości meczu,
ale nigdy od pieniędzy: **112** z nich zachowało identyczne punkty, czyli ich strumień faktycznie się nie
rozszedł, a pozostałe rozeszły się i wróciły do tej samej sumy przypadkiem. W drugą stronę **298** karier ma
inną sumę przy identycznych punktach.

Dwa ostatnie wiersze tabeli są bramką. Zero w drugim z nich mówi więcej niż sama zgodność liczników:
kadencja klubu bez pucharu — liczba rozegranych sezonów i liczba spadków — jest nietknięta,
czyli nowa ekonomia nie przestawiła po cichu samej rozgrywki.
