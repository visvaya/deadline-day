# Aktywacja budżetu pierwszego okna i reinwestycji — pomiar kontrolny

Wygenerowane przez `pnpm audit:opening-budget-activation`, silnik `2026-09-12.1`, tryb **pełny**.
Nic tu nie jest ponownie symulowane: każda liczba pochodzi z zapisanego pliku albo z modułu, który czyta sama gra.

## Bramki

| bramka | wynik | szczegóły |
| --- | --- | --- |
| skala pieniądza | tak | mediana klubowych median bilansu -0,0200 mln, tolerancja ±0,25 |
| dryf gotówki | tak | 18/18 klubów w granicy 0,50 mln wobec sum(prognoza × 0,30) |
| grywalność | tak | 18/18 klubów stać na reprezentatywne wzmocnienie z pierwszym rokiem płacy |
| podłoga | tak | MIN_INITIAL_BUDGET wiąże u 5 klubów, oczekiwano 5 (Śląsk, Piast, Radomiak, Motor, Wisła K.) |
| jednostki gotówki | tak | VERDICT_KASA błąd 0,00%, LEGACY_KASA błąd 0,00%, tolerancja ±5,00% |
| atrybucja RNG | tak | 17668 identycznych, 332 przypisanych klasie werdyktu, 0 nieprzypisanych |

## Wdrożone wartości

| stała | wartość |
| --- | ---: |
| `INITIAL_BUDGET_SHARE` | 0.2 |
| `USEFUL_UPGRADE_OVR_DELTA` | 2 |
| `BOARD_REINVESTMENT_RATE` | 0.3 |
| `MIN_INITIAL_BUDGET` | 0.75 |
| `VERDICT_KASA` | 19.022988505747126 |
| `LEGACY_KASA` | 17.98913043478261 |
| `LEGACY_WARTOSC_KADRY` | 3.1929663214172073 |

## Budżety pierwszego okna

| klub | budżet | koszt wzmocnienia | stać |
| --- | ---: | ---: | --- |
| Legia | 1,870 | 1,533 | tak |
| Lech | 1,750 | 1,748 | tak |
| Widzew | 1,530 | 1,533 | tak |
| Wieczysta | 1,380 | 0,399 | tak |
| Cracovia | 1,340 | 1,343 | tak |
| Górnik | 1,180 | 1,176 | tak |
| Raków | 1,030 | 1,029 | tak |
| Wisła P. | 0,900 | 0,899 | tak |
| Pogoń | 0,880 | 0,785 | tak |
| Jagiellonia | 0,790 | 0,785 | tak |
| Korona | 0,790 | 0,785 | tak |
| Zagłębie | 0,790 | 0,785 | tak |
| GKS | 0,790 | 0,785 | tak |
| Śląsk | 0,750 | 0,349 | tak |
| Piast | 0,750 | 0,399 | tak |
| Radomiak | 0,750 | 0,305 | tak |
| Motor | 0,750 | 0,599 | tak |
| Wisła K. | 0,750 | 0,399 | tak |

Podłoga `MIN_INITIAL_BUDGET` wiąże u 5 klubów: Śląsk, Piast, Radomiak, Motor, Wisła K..

## Kluby z klasą wsparcia

| klub | budżet | ma podłogę wsparcia | wsparcie wiąże | podłoga bezwzględna wiąże |
| --- | ---: | --- | --- | --- |
| Widzew | 1,530 | tak | nie | nie |
| Wieczysta | 1,380 | tak | tak | nie |
| Korona | 0,790 | tak | nie | nie |
| Motor | 0,750 | nie | nie | tak |

## Startowi uczestnicy Europy

| klub | budżet | mediana bilansu sezonu | mediana zmiany budżetu |
| --- | ---: | ---: | ---: |
| Lech | 1,750 | 2,438 | 0,731 |
| Górnik | 1,180 | -0,483 | -0,145 |
| Jagiellonia | 0,790 | 0,634 | 0,190 |
| Raków | 1,030 | 0,626 | 0,188 |
| GKS | 0,790 | -0,946 | -0,284 |

## Jednostki gotówki

Historyczny iloczyn odczytany z baseline'u: **16.55**.

| wielkość | nowa mediana | kandydat mnożnika | wpisana stała | iloczyn | błąd |
| --- | ---: | ---: | ---: | ---: | ---: |
| kasa przy werdykcie | 0.87 | 19.022988505747126 | 19.022988505747126 | 16.55 | 0,00% |
| kasa po epilogu | 0.92 | 17.98913043478261 | 17.98913043478261 | 16.55 | 0,00% |

Przesunięcie `wartoscKadryMoj` (raportowane, nie bramkujące): nowa mediana 1.352815704587367, iloczyn 4.319494983831753 wobec historycznego 3.9864753148485743, czyli 8,35%. `LEGACY_WARTOSC_KADRY` pozostaje bit-identyczne.

## Dryf gotówki

| klub | kariery | mediana rezyduum | w granicy |
| --- | ---: | ---: | --- |
| Cracovia | 1000 | -0,043 | tak |
| GKS | 1000 | -0,009 | tak |
| Górnik | 1000 | -0,063 | tak |
| Jagiellonia | 1000 | -0,033 | tak |
| Korona | 1000 | -0,019 | tak |
| Lech | 1000 | -0,063 | tak |
| Legia | 1000 | -0,067 | tak |
| Motor | 1000 | -0,014 | tak |
| Piast | 1000 | 0,013 | tak |
| Pogoń | 1000 | -0,045 | tak |
| Radomiak | 1000 | 0,015 | tak |
| Raków | 1000 | -0,075 | tak |
| Śląsk | 1000 | 0,017 | tak |
| Widzew | 1000 | -0,074 | tak |
| Wieczysta | 1000 | 0,012 | tak |
| Wisła K. | 1000 | 0,005 | tak |
| Wisła P. | 1000 | -0,003 | tak |
| Zagłębie | 1000 | 0,005 | tak |

## Atrybucja RNG

Snapshot `scripts/data/opening-budget-activation-2026-09-12/preactivation-rng.json`, silnik `2026-09-10.1`, commit dumpów `03e4d73a39a471528df670771c29564a346e2df2`, commit narzędzia `cce808c163e6c317e7538eb1083af8ececd9f48c`.

| wielkość | liczba |
| --- | ---: |
| pary | 18000 |
| brak odpowiednika w snapshocie | 0 |
| identyczne pola prewerdyktowe | 18000 |
| zmieniony składnik trofeów po epilogu | 154 |
| z tego bez zmiany klasy werdyktu | 0 |
| zmieniony pełny tytuł werdyktu | 2349 |
| zmieniona klasa losowania werdyktu | 336 |
| identyczny licznik losowań | 17668 |
| różnica przypisana klasie werdyktu | 332 |
| różnica nieprzypisana | 0 |
| rozjazd liczby sezonów | 0 |
| rozjazd bilansu albo wpływu pucharowego | 0 |
| rozjazd sezonowego licznika losowań | 0 |
| zmienione pola prewerdyktowe | 0 |

## Artefakty

| plik | wiersze | sha256 |
| --- | ---: | --- |
| `scripts/data/opening-budget-activation-2026-09-12/control-raw.csv` (controlRaw) | 18000 | `9add34c5dac81a08c94a8a630ba87238c5bb2770e60a861d8235022362e30a92` |
| `scripts/data/opening-budget-activation-2026-09-12/control-seasons.csv` (controlSeasons) | 68502 | `4a6a26f136ec2c7f68342295c3f3898b252a2f5c77639843ab8ded7543a46328` |
| `scripts/data/opening-budget-activation-2026-09-12/active-raw.csv` (activeRaw) | 234000 | `eddbe506cba204ecbd3fe26ac16508c523f4c198c4069e81b081624fea840919` |
| `scripts/data/opening-budget-activation-2026-09-12/active-seasons.csv` (activeSeasons) | 920585 | `a53ac0ce565be4b716fcac4a2733fccd38a289d878993bd20cbe321f6101c8eb` |

Baseline: `scripts/data/legacy-unit-baseline.json`.
