# Aktywacja budżetu pierwszego okna i reinwestycji — pomiar kontrolny

Wygenerowane przez `pnpm audit:opening-budget-activation`, silnik `2026-09-22.2`, tryb **częściowy**.
Nic tu nie jest ponownie symulowane: każda liczba pochodzi z zapisanego pliku albo z modułu, który czyta sama gra.

## Bramki

| bramka | wynik | szczegóły |
| --- | --- | --- |
| skala pieniądza | tak | mediana klubowych median bilansu -0,0159 mln, tolerancja ±0,25 |
| dryf gotówki | tak | 18/18 klubów w granicy 0,50 mln wobec sum(prognoza × 0,30) |
| grywalność | tak | 18/18 klubów stać na reprezentatywne wzmocnienie z pierwszym rokiem płacy |
| podłoga | tak | MIN_INITIAL_BUDGET wiąże u 5 klubów, oczekiwano 5 (Śląsk, Piast, Radomiak, Motor, Wisła K.) |
| jednostki gotówki | tak | VERDICT_KASA błąd 0,00%, LEGACY_KASA błąd 0,00%, tolerancja ±5,00% |
| atrybucja RNG | niezmierzone | brak --preactivation-rng: pomiar niewykonany |

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
| Lech | 1,750 | 2,458 | 0,737 |
| Górnik | 1,180 | -0,467 | -0,140 |
| Jagiellonia | 0,790 | 0,626 | 0,188 |
| Raków | 1,030 | 0,625 | 0,188 |
| GKS | 0,790 | -0,946 | -0,284 |

## Jednostki gotówki

Historyczny iloczyn odczytany z baseline'u: **16.55**.

| wielkość | nowa mediana | kandydat mnożnika | wpisana stała | iloczyn | błąd |
| --- | ---: | ---: | ---: | ---: | ---: |
| kasa przy werdykcie | 0.87 | 19.022988505747126 | 19.022988505747126 | 16.55 | 0,00% |
| kasa po epilogu | 0.92 | 17.98913043478261 | 17.98913043478261 | 16.55 | 0,00% |

Przesunięcie `wartoscKadryMoj` (raportowane, nie bramkujące): nowa mediana 1.305137716521375, iloczyn 4.1672607736641085 wobec historycznego 3.9864753148485743, czyli 4,53%. `LEGACY_WARTOSC_KADRY` pozostaje bit-identyczne.

## Dryf gotówki

| klub | kariery | mediana rezyduum | w granicy |
| --- | ---: | ---: | --- |
| Cracovia | 1000 | -0,041 | tak |
| GKS | 1000 | -0,012 | tak |
| Górnik | 1000 | -0,061 | tak |
| Jagiellonia | 1000 | -0,030 | tak |
| Korona | 1000 | -0,022 | tak |
| Lech | 1000 | -0,062 | tak |
| Legia | 1000 | -0,066 | tak |
| Motor | 1000 | -0,009 | tak |
| Piast | 1000 | 0,019 | tak |
| Pogoń | 1000 | -0,038 | tak |
| Radomiak | 1000 | 0,014 | tak |
| Raków | 1000 | -0,076 | tak |
| Śląsk | 1000 | 0,014 | tak |
| Widzew | 1000 | -0,075 | tak |
| Wieczysta | 1000 | 0,012 | tak |
| Wisła K. | 1000 | 0,003 | tak |
| Wisła P. | 1000 | 0,000 | tak |
| Zagłębie | 1000 | -0,000 | tak |

## Atrybucja RNG

Niezmierzona: `--preactivation-rng` nie został podany.

## Artefakty

| plik | wiersze | sha256 |
| --- | ---: | --- |
| `scripts/data/spec4-control-2026-09-25/control-raw.csv` (controlRaw) | 18000 | `aa14c3d9fbf8fba61a491f391dc4504f93fcca835f1c4ab46b2ba2a1c5f62ce5` |
| `scripts/data/spec4-control-2026-09-25/control-seasons.csv` (controlSeasons) | 68599 | `f8c61c877d83ec9b43c79aee8e300ce8aeec0ec9f98e92a50462524ae4982fbb` |
| `scripts/data/spec4-control-2026-09-25/active-original-13-raw.csv` (activeRaw) | 234000 | `c89b24a1ebb2a527af093f2e4970844bf9b296fe18401fbc856e574f587e252d` |
| `scripts/data/spec4-control-2026-09-25/active-original-13-seasons.csv` (activeSeasons) | 919162 | `8891d3421d7d773a1bc881b561e6f7c0e22c1aada2212f97d72300153ffdbf29` |

Baseline: `scripts/data/legacy-unit-baseline.json`.
