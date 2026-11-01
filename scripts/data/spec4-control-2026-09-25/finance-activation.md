# Aktywacja ekonomii — pomiar kontrolny (2026-09-10)

Wygenerowane przez `pnpm audit:finance-activation`. Nic tutaj nie jest symulowane ponownie —
każda liczba pochodzi z zapisanego dumpu wymienionego niżej.

## Werdykty

| bramka | wynik | szczegóły |
| --- | --- | --- |
| money scale | OK | mediana klubowych median bilansu -0.016 mln (tolerancja 0,25); D implikowane 15546890 |
| cash drift | BLOKUJE | Legia -21.090; Wieczysta 2.000; Wisła K. -0.690; Zagłębie -0.330 |
| free agent overpay | OK | alwaysHaggle 0.488; alwaysTake 0.488; mixed 0.488 |
| playability | OK | 18/18 klubów stać na medianową kartę KUPNO z rocznej płacy (0.537 mln) |

**Co najmniej jedna bramka nie przechodzi — patrz tabela wyżej.**

## Stałe, na których to leciało

| stała | wartość |
| --- | ---: |
| `ENGINE_REVISION` | 2026-09-22.2 |
| `MONEY_SCALE_PLN_PER_GAME_MILLION` | 15774182 |
| `WAGE_SLOPE` | 12 |
| `WAGE_AT_PIVOT` | 0.16245668290738177 |
| `WAGE_AT_PIVOT_PLN` | 2562621.283297329 |
| `LEAGUE_PRIZE_RATE` | 0.020438312479132893 |
| `KOSZTY_STALE` | 1.1 |
| `WOLNY_WAGE_PREMIUM` | 1.9349745509003764 |
| `MIN_BUDGET_SHARE` | 0.18 |
| `MIN_INITIAL_BUDGET` | 0.75 |
| `LEGACY_KASA` | 17.98913043478261 |
| `LEGACY_WARTOSC_KADRY` | 3.1929663214172073 |

## Artefakty

| plik | wierszy | sha256 |
| --- | ---: | --- |
| `scripts/data/spec4-control-2026-09-25/control-seasons.csv` | 68599 | `f8c61c877d83ec9b43c79aee8e300ce8aeec0ec9f98e92a50462524ae4982fbb` |
| `scripts/data/spec4-control-2026-09-25/control-raw.csv` | 18000 | `aa14c3d9fbf8fba61a491f391dc4504f93fcca835f1c4ab46b2ba2a1c5f62ce5` |
| `scripts/data/spec4-control-2026-09-25/active-signings.csv` | 1061768 | `d2d4844f088dccb06c45bcf0254d5a1dd3af41208eaae3416d8547d0aeb9c4ea` |

## Skala pieniądza

Mediana klubowych median rocznego bilansu bez transferów i pucharów: **-0,02 mln €**.
Ta sama mediana przeliczona na PLN: 17101579; implikowane `D` = 15546890.

## Dryf gotówki po pięciu sezonach

| klub | karier | mediana residuum | w tolerancji 0,50 |
| --- | ---: | ---: | --- |
| Cracovia | 1000 | 0,43 | tak |
| GKS | 1000 | 2,87 | **nie** |
| Górnik | 1000 | 1,29 | **nie** |
| Jagiellonia | 1000 | -2,04 | **nie** |
| Korona | 1000 | 3,42 | **nie** |
| Lech | 1000 | -8,86 | **nie** |
| Legia | 1000 | -21,09 | **nie** |
| Motor | 1000 | 0,32 | tak |
| Piast | 1000 | 0,48 | tak |
| Pogoń | 1000 | -5,53 | **nie** |
| Radomiak | 1000 | 1,15 | **nie** |
| Raków | 1000 | -2,42 | **nie** |
| Śląsk | 1000 | -0,10 | tak |
| Widzew | 1000 | -0,63 | **nie** |
| Wieczysta | 1000 | 2,00 | **nie** |
| Wisła K. | 1000 | -0,69 | **nie** |
| Wisła P. | 1000 | 5,33 | **nie** |
| Zagłębie | 1000 | -0,33 | tak |

## Udział drabinki w przychodzie sezonu

| klub | przychód powtarzalny | udział jako mistrz | udział jako 18. | mediana bilansu |
| --- | ---: | ---: | ---: | ---: |
| Legia | 9,34 | 3,8% | 0,2% | 6,00 |
| Lech | 6,50 | 5,4% | 0,3% | 2,46 |
| Pogoń | 4,40 | 7,7% | 0,5% | 1,60 |
| Raków | 3,87 | 8,7% | 0,5% | 0,63 |
| Widzew | 3,49 | 9,5% | 0,6% | 0,11 |
| Jagiellonia | 3,35 | 9,9% | 0,6% | 0,63 |
| Cracovia | 2,86 | 11,4% | 0,7% | -0,22 |
| Zagłębie | 2,83 | 11,5% | 0,7% | 0,20 |
| Wisła K. | 2,83 | 11,5% | 0,7% | 0,35 |
| Górnik | 2,64 | 12,2% | 0,8% | -0,47 |
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
Udział karier przerwanych spadkiem: 39,3%.

## Budżety startowe i grywalność

| klub | budżet | medianowa karta KUPNO z płacą | stać |
| --- | ---: | ---: | --- |
| Śląsk | 0,75 | 0,54 | tak |
| Piast | 0,75 | 0,54 | tak |
| Radomiak | 0,75 | 0,54 | tak |
| Motor | 0,75 | 0,54 | tak |
| Wisła K. | 0,75 | 0,54 | tak |
| Jagiellonia | 0,79 | 0,54 | tak |
| Korona | 0,79 | 0,54 | tak |
| Zagłębie | 0,79 | 0,54 | tak |
| GKS | 0,79 | 0,54 | tak |
| Pogoń | 0,88 | 0,54 | tak |
| Wisła P. | 0,90 | 0,54 | tak |
| Raków | 1,03 | 0,54 | tak |
| Górnik | 1,18 | 0,54 | tak |
| Cracovia | 1,34 | 0,54 | tak |
| Wieczysta | 1,38 | 0,54 | tak |
| Widzew | 1,53 | 0,54 | tak |
| Lech | 1,75 | 0,54 | tak |
| Legia | 1,87 | 0,54 | tak |

## Zasięg pasma `KUPNO` — obserwacja bez progu

Bramka grywalności pyta o **medianową** kartę i przeszłaby nawet wtedy, gdyby cała górna połowa
archetypu `gotowy` (OVR 67–78, wiek 24–28) była poza zasięgiem wszystkich osiemnastu klubów.
Tabela niżej pyta o coś innego: nie „czy każdego stać na cokolwiek", tylko „czy kogokolwiek stać na kogoś dobrego".
Liczone analitycznie, przy medianowym modyfikatorze ceny `KUPNO`, spokojnym rynku, wieku 26 lat
i przypiętym profilu pozycji. **Bez progu** — gdzie ma leżeć góra pasma, jest decyzją właściciela produktu.

| klub | budżet | najwyższy OVR (samo odstępne) | najwyższy OVR (z rocznej płacy) |
| --- | ---: | ---: | ---: |
| Śląsk | 0,75 | 68 | 67 |
| Piast | 0,75 | 68 | 67 |
| Radomiak | 0,75 | 68 | 67 |
| Motor | 0,75 | 68 | 67 |
| Wisła K. | 0,75 | 68 | 67 |
| Jagiellonia | 0,79 | 69 | 67 |
| Korona | 0,79 | 69 | 67 |
| Zagłębie | 0,79 | 69 | 67 |
| GKS | 0,79 | 69 | 67 |
| Pogoń | 0,88 | 70 | 68 |
| Wisła P. | 0,90 | 70 | 68 |
| Raków | 1,03 | 71 | 69 |
| Górnik | 1,18 | 72 | 70 |
| Cracovia | 1,34 | 73 | 71 |
| Wieczysta | 1,38 | 73 | 72 |
| Widzew | 1,53 | 74 | 72 |
| Lech | 1,75 | 75 | 73 |
| Legia | 1,87 | 75 | 74 |

Klubów nieosiągających **żadnego** OVR z pasma: **0** z 18.

## Ile z tego maskuje `capPurchasePrice`

Limit tnie cenę karty `KUPNO`/`PANIC` do `kasa × PURCHASE_PRICE_CAP`, więc klub bez pieniędzy widzi
mocnego zawodnika za grosze — wyświetlana cena przestaje znaczyć „ile on jest wart”, a zaczyna znaczyć
„ile masz”. **Spek 5 §6 ten mechanizm usuwa**, więc ten raport go nie naprawia ani nie przypina jako
poprawnego. Liczba niżej jest bazą: gdy limit zniknie, ten sam pomiar pokaże, jak duży klif się odsłania.

| klub | budżet | ilu OVR z pasma limit tnie | najgłębsze cięcie |
| --- | ---: | ---: | ---: |
| Śląsk | 0,75 | 8 / 12 | 63,7% |
| Piast | 0,75 | 8 / 12 | 63,7% |
| Radomiak | 0,75 | 8 / 12 | 63,7% |
| Motor | 0,75 | 8 / 12 | 63,7% |
| Wisła K. | 0,75 | 8 / 12 | 63,7% |
| Jagiellonia | 0,79 | 8 / 12 | 62,0% |
| Korona | 0,79 | 8 / 12 | 62,0% |
| Zagłębie | 0,79 | 8 / 12 | 62,0% |
| GKS | 0,79 | 8 / 12 | 62,0% |
| Pogoń | 0,88 | 7 / 12 | 57,3% |
| Wisła P. | 0,90 | 7 / 12 | 56,5% |
| Raków | 1,03 | 6 / 12 | 50,2% |
| Górnik | 1,18 | 5 / 12 | 43,0% |
| Cracovia | 1,34 | 4 / 12 | 34,9% |
| Wieczysta | 1,38 | 4 / 12 | 32,9% |
| Widzew | 1,53 | 3 / 12 | 25,7% |
| Lech | 1,75 | 2 / 12 | 15,4% |
| Legia | 1,87 | 1 / 12 | 9,6% |

## Obciążenie płacowe karty WOLNY

| polityka | podpisań | mediana udziału jednostkowego | nadpłata / odstępne | w paśmie 0,40–0,60 |
| --- | ---: | ---: | ---: | --- |
| alwaysHaggle | 31800 | 0,5221 | 0,4881 | tak |
| alwaysTake | 53176 | 0,5221 | 0,4881 | tak |
| mixed | 26203 | 0,5221 | 0,4881 | tak |
