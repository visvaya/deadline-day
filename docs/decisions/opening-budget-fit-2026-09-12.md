# Budżet pierwszego okna i reinwestycja — dopasowanie opening-budget-fit-2026-09-12

## DECISION REQUIRED

Ten raport **niczego nie aktywuje**. Mierzy wykonalne warianty budżetu pierwszego okna, jednorazowej podłogi wsparcia właściciela lub sponsora i stopy reinwestycji, i kończy się pięcioma pytaniami do właściciela produktu. Żadna stała w `src/` nie została zmieniona.

## Wejścia

- commit bazowy: `30a87c1737a96b9723095bb71eefa09b30d991f5`
- data pomiaru: 2026-09-12
- wersje silnika w dumpach: 2026-09-10.1
- kariery: 18000 na przebieg, sezony: 68502 na przebieg

| plik | sha256 |
| --- | --- |
| `control-seasons.csv` | `ce247333ce1813dbe561eb528809cbe3bb09c0f6dd209ec535a9bcbbb137510a` |
| `active-seasons.csv` | `b3c279a33894946f1d9806ea436870469c5295613461da68163c83a0dd1755b7` |
| `control-raw.csv` | `a9369343a0949eccb329cee8d7030b1de3d0a36b2f7a474b4c68c20bee2defd8` |
| `active-raw.csv` | `9e2188057b61df9c53a0c11aa5f4db529009c71cd5b534c61118abd7583cac6b` |
| `summary.json` | `105068124492f538f8b931baf879faceba63aef8cfb9b1d773e6136689787c90` |

### `passive always-pass estimate`

Gotówka pod każdą stopą reinwestycji jest odtworzona **post hoc** z sezonów, które silnik naprawdę rozegrał polityką `alwaysPass`:

```
candidateCashAfterN = candidateInitialBudget
                    + rate x sum(actualBalanceWithoutTransfersAndCups[1..n] + creditedCupIncome[1..n])
```

To jest **przybliżenie biernej polityki**, nie symulacja decyzji gracza. Aktywna polityka kupowałaby i sprzedawała zależnie od gotówki, którą wariant właśnie zmienia, więc jej kontrfaktycznej kadry nie da się odczytać z dumpu i nie jest tu udawana. Przychód pucharowy **jest** uwzględniony od schematu 4 dumpu sezonowego.

### Dryf wejścia

Mediana `actualBalanceWithoutTransfersAndCups` per klub z przebiegu kontrolnego, wobec `metrics.ladderShares[].medianSeasonBalance` przypiętego w podsumowaniu aktywacji z 2026-09-10. Największa różnica: **0.00e+0**, tolerancja `0.0001`. Dumpy nie są porównywane bajtowo, bo niosą `engineVersion`, które podniesiono później bez zmiany tej mechaniki.

| klub | zmierzone | przypięte | różnica |
| --- | --- | --- | --- |
| Legia | 6,0057 | 6,0057 | 0.00e+0 |
| Lech | 2,4379 | 2,4379 | 0.00e+0 |
| Pogoń | 1,5926 | 1,5926 | 0.00e+0 |
| Raków | 0,6261 | 0,6261 | 0.00e+0 |
| Widzew | 0,1075 | 0,1075 | 0.00e+0 |
| Jagiellonia | 0,6339 | 0,6339 | 0.00e+0 |
| Cracovia | -0,2178 | -0,2178 | 0.00e+0 |
| Zagłębie | 0,2070 | 0,2070 | 0.00e+0 |
| Wisła K. | 0,3613 | 0,3613 | 0.00e+0 |
| Górnik | -0,4830 | -0,4830 | 0.00e+0 |
| Śląsk | 0,1409 | 0,1409 | 0.00e+0 |
| Motor | -0,1474 | -0,1474 | 0.00e+0 |
| Piast | -0,2543 | -0,2543 | 0.00e+0 |
| GKS | -0,9456 | -0,9456 | 0.00e+0 |
| Korona | -1,1034 | -1,1034 | 0.00e+0 |
| Radomiak | -0,8056 | -0,8056 | 0.00e+0 |
| Wieczysta | -1,1796 | -1,1796 | 0.00e+0 |
| Wisła P. | -1,7276 | -1,7276 | 0.00e+0 |

### Tożsamość strumienia RNG

Licznik `rngDrawCount` musi być **identyczny po każdym rozegranym sezonie** w obu przebiegach. Różnica na którymkolwiek sezonie oznaczałaby, że przebiegi rozegrały inną piłkę, i blokuje raport — nawet gdyby werdykt też się różnił.

Różnica **końcowego** licznika jest dopuszczalna wyłącznie tam, gdzie kariera przekroczyła gałąź werdyktu `ROZWIĄZANIE KONTRAKTU`, jako jedyna nie wykonującą losowania. `computeVerdict` czyta `kasa`, a przebieg kontrolny nie księguje pucharów, więc to przekroczenie jest z konstrukcji, nie usterką; epilog kaskaduje potem to jedno losowanie. Różnica bez przekroczenia tej granicy jest **nieprzypisana** i blokuje raport.

Zmierzone: końcowy licznik różni się w **236 z 18000** karier (1.31%); granicę werdyktu przekroczyło 238 karier. Każda różnica licznika mieści się w tym zbiorze; kariery, które granicę przekroczyły, a licznik im się zgadza, to przypadki, w których kaskada epilogu skompensowała to jedno losowanie.

## Stan obecny

Dzisiejsza reguła to `max(scaledRecurringRevenue x 0.18, 0.75)` z jednym historycznym `ownerBudgetPercentile`. Podłoga wiąże u piętnastu z osiemnastu klubów; powyżej są tylko Legia, Lech i Pogoń.

| klub | dzisiejszy budżet |
| --- | --- |
| Legia | 1,680 |
| Lech | 1,170 |
| Raków | 0,750 |
| Jagiellonia | 0,750 |
| Pogoń | 0,793 |
| Górnik | 0,750 |
| Cracovia | 0,750 |
| Widzew | 0,750 |
| Śląsk | 0,750 |
| Piast | 0,750 |
| Radomiak | 0,750 |
| Korona | 0,750 |
| Motor | 0,750 |
| Zagłębie | 0,750 |
| Wisła K. | 0,750 |
| Wieczysta | 0,750 |
| GKS | 0,750 |
| Wisła P. | 0,750 |

## Siatka

Pełny iloczyn pięciu osi: `budgetShare` 0,18–0,30 co 0,01; `usefulUpgradeOvrDelta` 0/1/2; `boardReinvestmentRate` 0,20–0,80 co 0,05 plus kontrolne 1,00; `strongBackerPercentile` 0,90/0,95; `activeBackerPercentile` 0,75/0,80. **2184 wariantów**, z czego wykonalnych **1988**.

Wariant jest **niewykonalny**, gdy choć jeden klub nie pokrywa kosztu reprezentatywnego wzmocnienia, gdy `MIN_INITIAL_BUDGET` wiąże u co najmniej dziesięciu klubów, albo gdy którakolwiek wartość jest niedodatnia tam, gdzie kontrakt tego zabrania. Zdolność 18/18 jest **niezmiennikiem kontrolnym** formuły `max(...)`, nie osią wyboru.

## Front Pareto

Cztery dokładne osie, bez składania w jedną wagę: minimalizuj sumę `candidateInitialBudget - currentInitialBudget` po klubach, minimalizuj liczbę klubów z ujemną medianą `cashAfterSeason5`, minimalizuj pooled `p95(cashAfterSeason5)`, maksymalizuj `IQR(candidateInitialBudget)`.

Front liczy **15** wariantów.

| wariant | wykonalny | Σ Δ budżetu | kluby z ujemną medianą po S5 | pooled p95 po S5 | IQR budżetu | min | mediana | max | max/min | podłoga wiąże u |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `share=0.18 delta=1 rate=0.20 strong=0.90 active=0.75` | tak | 2,00 | 1 | 8,54 | 0,248 | 0,750 | 0,768 | 1,680 | 2,24 | 9 |
| `share=0.18 delta=1 rate=0.20 strong=0.90 active=0.80` | tak | 2,00 | 1 | 8,54 | 0,248 | 0,750 | 0,768 | 1,680 | 2,24 | 9 |
| `share=0.18 delta=1 rate=0.20 strong=0.95 active=0.75` | tak | 2,34 | 1 | 8,54 | 0,389 | 0,750 | 0,768 | 1,680 | 2,24 | 9 |
| `share=0.18 delta=1 rate=0.20 strong=0.95 active=0.80` | tak | 2,34 | 1 | 8,54 | 0,389 | 0,750 | 0,768 | 1,680 | 2,24 | 9 |
| `share=0.18 delta=2 rate=0.20 strong=0.95 active=0.75` | tak | 3,45 | 1 | 8,57 | 0,470 | 0,750 | 0,789 | 1,748 | 2,33 | 5 |
| `share=0.18 delta=2 rate=0.20 strong=0.95 active=0.80` | tak | 3,45 | 1 | 8,57 | 0,470 | 0,750 | 0,789 | 1,748 | 2,33 | 5 |
| `share=0.19 delta=1 rate=0.20 strong=0.90 active=0.75` | tak | 2,19 | 1 | 8,63 | 0,260 | 0,750 | 0,768 | 1,774 | 2,36 | 9 |
| `share=0.19 delta=1 rate=0.20 strong=0.90 active=0.80` | tak | 2,19 | 1 | 8,63 | 0,260 | 0,750 | 0,768 | 1,774 | 2,36 | 9 |
| `share=0.19 delta=2 rate=0.20 strong=0.95 active=0.75` | tak | 3,65 | 1 | 8,64 | 0,522 | 0,750 | 0,811 | 1,774 | 2,36 | 5 |
| `share=0.19 delta=2 rate=0.20 strong=0.95 active=0.80` | tak | 3,65 | 1 | 8,64 | 0,522 | 0,750 | 0,811 | 1,774 | 2,36 | 5 |
| `share=0.20 delta=2 rate=0.20 strong=0.95 active=0.75` | tak | 3,86 | 1 | 8,73 | 0,543 | 0,750 | 0,833 | 1,867 | 2,49 | 5 |
| `share=0.20 delta=2 rate=0.20 strong=0.95 active=0.80` | tak | 3,86 | 1 | 8,73 | 0,543 | 0,750 | 0,833 | 1,867 | 2,49 | 5 |
| `share=0.21 delta=0 rate=0.20 strong=0.90 active=0.80` | tak | 1,86 | 1 | 8,80 | 0,253 | 0,750 | 0,765 | 1,960 | 2,61 | 9 |
| `share=0.22 delta=0 rate=0.20 strong=0.90 active=0.75` | tak | 2,13 | 1 | 8,90 | 0,264 | 0,750 | 0,755 | 2,054 | 2,74 | 9 |
| `share=0.24 delta=1 rate=0.20 strong=0.90 active=0.75` | tak | 3,32 | 1 | 9,08 | 0,396 | 0,750 | 0,817 | 2,240 | 2,99 | 7 |

### Front nie rozstrzyga stopy reinwestycji

Wszystkie warianty frontu mają `rate` = 0.20. **To jest artefakt definicji osi, nie dowód, że ta stopa jest właściwa.**

Przy ustalonych czterech pozostałych osiach stopa reinwestycji **nie wpływa** ani na sumę różnic budżetu, ani na IQR — obie zależą wyłącznie od reguły budżetu. Wpływa natomiast monotonicznie na dwie pozostałe osie, i to w stronę pogorszenia: część klubów ma ujemną medianę bilansu operacyjnego, więc wyższa stopa pogłębia im gotówkę pod kreską, a zmierzony pooled `p95` rośnie w całym przebiegu. Niższa stopa dominuje więc wyższą na wszystkich czterech osiach naraz i front może zawierać wyłącznie minimum siatki.

Zmierzony przebieg osobno dla każdego nazwanego przekroju; zmienia się wyłącznie `rate`, pozostałe cztery osie pozostają jak w jego tabeli klubowej:

### Przebieg stopy: zachowawczy

| rate | kluby z ujemną medianą po S5 | pooled p95 po S5 | Σ Δ budżetu | IQR budżetu |
| --- | --- | --- | --- | --- |
| 0,20 | 1 | 8,80 | 1,859 | 0,2526 |
| 0,25 | 4 | 10,52 | 1,859 | 0,2526 |
| 0,30 | 4 | 12,23 | 1,859 | 0,2526 |
| 0,35 | 5 | 13,95 | 1,859 | 0,2526 |
| 0,40 | 5 | 15,66 | 1,859 | 0,2526 |
| 0,45 | 5 | 17,38 | 1,859 | 0,2526 |
| 0,50 | 5 | 19,09 | 1,859 | 0,2526 |
| 0,55 | 5 | 20,80 | 1,859 | 0,2526 |
| 0,60 | 5 | 22,52 | 1,859 | 0,2526 |
| 0,65 | 5 | 24,23 | 1,859 | 0,2526 |
| 0,70 | 5 | 25,96 | 1,859 | 0,2526 |
| 0,75 | 5 | 27,69 | 1,859 | 0,2526 |
| 0,80 | 5 | 29,40 | 1,859 | 0,2526 |
| 1,00 | 5 | 36,27 | 1,859 | 0,2526 |

### Przebieg stopy: środkowy

| rate | kluby z ujemną medianą po S5 | pooled p95 po S5 | Σ Δ budżetu | IQR budżetu |
| --- | --- | --- | --- | --- |
| 0,20 | 1 | 8,54 | 2,342 | 0,3891 |
| 0,25 | 3 | 10,26 | 2,342 | 0,3891 |
| 0,30 | 4 | 11,97 | 2,342 | 0,3891 |
| 0,35 | 5 | 13,69 | 2,342 | 0,3891 |
| 0,40 | 5 | 15,41 | 2,342 | 0,3891 |
| 0,45 | 5 | 17,13 | 2,342 | 0,3891 |
| 0,50 | 5 | 18,85 | 2,342 | 0,3891 |
| 0,55 | 5 | 20,56 | 2,342 | 0,3891 |
| 0,60 | 5 | 22,28 | 2,342 | 0,3891 |
| 0,65 | 5 | 24,00 | 2,342 | 0,3891 |
| 0,70 | 5 | 25,71 | 2,342 | 0,3891 |
| 0,75 | 5 | 27,43 | 2,342 | 0,3891 |
| 0,80 | 5 | 29,15 | 2,342 | 0,3891 |
| 1,00 | 5 | 36,01 | 2,342 | 0,3891 |

### Przebieg stopy: hojny

| rate | kluby z ujemną medianą po S5 | pooled p95 po S5 | Σ Δ budżetu | IQR budżetu |
| --- | --- | --- | --- | --- |
| 0,20 | 1 | 8,73 | 3,860 | 0,5427 |
| 0,25 | 3 | 10,44 | 3,860 | 0,5427 |
| 0,30 | 3 | 12,16 | 3,860 | 0,5427 |
| 0,35 | 4 | 13,88 | 3,860 | 0,5427 |
| 0,40 | 5 | 15,60 | 3,860 | 0,5427 |
| 0,45 | 5 | 17,32 | 3,860 | 0,5427 |
| 0,50 | 5 | 19,03 | 3,860 | 0,5427 |
| 0,55 | 5 | 20,75 | 3,860 | 0,5427 |
| 0,60 | 5 | 22,47 | 3,860 | 0,5427 |
| 0,65 | 5 | 24,18 | 3,860 | 0,5427 |
| 0,70 | 5 | 25,90 | 3,860 | 0,5427 |
| 0,75 | 5 | 27,62 | 3,860 | 0,5427 |
| 0,80 | 5 | 29,33 | 3,860 | 0,5427 |
| 1,00 | 5 | 36,20 | 3,860 | 0,5427 |


**Wniosek dla pytania 3:** front jej nie wskaże. Stopa reinwestycji jest wyborem między bezpieczeństwem gotówkowym słabszych klubów a wielkością puli, jaką gracz obraca w kolejnych oknach — i tego drugiego ten pomiar nie punktuje wcale, bo bierna polityka `alwaysPass` niczego nie kupuje. Odpowiedź na nie jest decyzją projektową, nie odczytem z tabeli.

## Trzy nazwane przekroje

### Przekrój „zachowawczy” — `share=0.21 delta=0 rate=0.20 strong=0.90 active=0.80`

Najmniejsza suma różnic wobec dzisiejszych budżetów na całym froncie — najmniej rusza to, co już zmierzone. **Nazwa nie jest rekomendacją.**

- wykonalny: tak
- suma różnic wobec dzisiejszych budżetów: 1,86 mln
- kluby ze wszystkich osiemnastu zdolne do reprezentatywnego wzmocnienia: 18/18
- kluby z ujemną **medianą** gotówki: po S1 0, po S5 1, przy przekazaniu 1
- pooled p95 gotówki po pięciu sezonach pełnej kariery: 8,80 mln
- gotówka przy przekazaniu: 21,1 pkt jako **proxy wkładu do dziedzictwa przy przekazaniu** (bez S6–S8), 5,4 pkt werdyktu (bieżące mnożniki)
- podłoga `MIN_INITIAL_BUDGET` wiąże u 9 klubów: Jagiellonia, Śląsk, Piast, Radomiak, Motor, Zagłębie, Wisła K., GKS, Wisła P.

#### Wszystkie osiemnaście klubów

| klub | podłoga | udział | koszt wzmocnienia | wsparcie | budżet | wiążące | udział w przychodzie | bilans bez pucharów | puchary / sezon | bilans z pucharami | reinwestycja / sezon | po S1 | po S5 | przy przekazaniu |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Legia | 0,75 | 1,960 | 1,176 | — | **1,960** | shareBudget | 0,210 | 6,006 | 0,300 | 6,530 | 1,306 | 3,185 | 8,996 | 8,904 |
| Lech | 0,75 | 1,365 | 1,343 | — | **1,365** | shareBudget | 0,210 | 2,438 | 2,700 | 5,030 | 1,006 | 2,634 | 6,632 | 6,613 |
| Raków | 0,75 | 0,812 | 0,785 | — | **0,812** | shareBudget | 0,210 | 0,626 | 1,000 | 1,508 | 0,302 | 1,053 | 2,678 | 2,618 |
| Jagiellonia | 0,75 | 0,704 | 0,599 | — | **0,750** | absoluteFloor | 0,224 | 0,634 | 0,800 | 1,362 | 0,272 | 1,093 | 2,140 | 1,922 |
| Pogoń | 0,75 | 0,925 | 0,599 | — | **0,925** | shareBudget | 0,210 | 1,593 | 0,000 | 1,777 | 0,355 | 1,258 | 3,154 | 2,949 |
| Górnik | 0,75 | 0,554 | 0,899 | — | **0,899** | usefulPurchaseCost | 0,341 | -0,483 | 1,400 | 0,777 | 0,155 | 1,372 | 1,996 | 1,898 |
| Cracovia | 0,75 | 0,601 | 1,029 | — | **1,029** | usefulPurchaseCost | 0,359 | -0,218 | 0,000 | -0,005 | -0,001 | 1,003 | 1,427 | 1,295 |
| Widzew | 0,75 | 0,733 | 1,176 | 1,057 | **1,176** | usefulPurchaseCost | 0,337 | 0,107 | 0,800 | 0,836 | 0,167 | 1,224 | 2,476 | 2,399 |
| Śląsk | 0,75 | 0,506 | 0,267 | — | **0,750** | absoluteFloor | 0,311 | 0,141 | 0,000 | 0,184 | 0,037 | 0,788 | 1,115 | 0,813 |
| Piast | 0,75 | 0,422 | 0,305 | — | **0,750** | absoluteFloor | 0,373 | -0,254 | 0,000 | -0,216 | -0,043 | 0,706 | 0,657 | 0,688 |
| Radomiak | 0,75 | 0,292 | 0,234 | — | **0,750** | absoluteFloor | 0,539 | -0,806 | 0,000 | -0,766 | -0,153 | 0,596 | 0,126 | 0,570 |
| Korona | 0,75 | 0,331 | 0,599 | 0,780 | **0,780** | backerSupportFloor | 0,495 | -1,103 | 0,000 | -0,996 | -0,199 | 0,575 | 0,113 | 0,262 |
| Motor | 0,75 | 0,503 | 0,457 | — | **0,750** | absoluteFloor | 0,313 | -0,147 | 0,000 | -0,054 | -0,011 | 0,731 | 0,999 | 0,808 |
| Zagłębie | 0,75 | 0,595 | 0,599 | — | **0,750** | absoluteFloor | 0,265 | 0,207 | 0,000 | 0,291 | 0,058 | 0,807 | 1,279 | 1,009 |
| Wisła K. | 0,75 | 0,594 | 0,305 | — | **0,750** | absoluteFloor | 0,265 | 0,361 | 0,000 | 0,427 | 0,086 | 0,832 | 1,424 | 1,137 |
| Wieczysta | 0,75 | 0,240 | 0,305 | 1,057 | **1,057** | backerSupportFloor | 0,926 | -1,180 | 0,000 | -1,136 | -0,227 | 0,829 | 0,164 | 0,603 |
| GKS | 0,75 | 0,358 | 0,599 | — | **0,750** | absoluteFloor | 0,440 | -0,946 | 0,300 | -0,647 | -0,129 | 0,654 | 0,307 | 0,503 |
| Wisła P. | 0,75 | 0,196 | 0,686 | — | **0,750** | absoluteFloor | 0,802 | -1,728 | 0,000 | -1,638 | -0,328 | 0,420 | -0,670 | -0,210 |

#### Cztery kluby z klasą wsparcia

| klub | klasa | podłoga wsparcia | budżet | czy wiąże |
| --- | --- | --- | --- | --- |
| Widzew | strong | 1,057 | 1,176 | nie — istnieje, lecz nie wiąże |
| Korona | active | 0,780 | 0,780 | **tak** |
| Motor | restrained | — | 0,750 | brak podłogi |
| Wieczysta | strong | 1,057 | 1,057 | **tak** |

#### Pięciu startowych uczestników Europy

Późniejsze kwalifikacje są wynikiem symulacji i siedzą już w medianie bilansu; ta tabela wyróżnia wyłącznie kluby, które wchodzą do Europy na starcie kadencji.

| klub | budżet | mediana bilansu bez pucharów | mediana pucharów w S1 | mediana pucharów w karierze | z pucharów wraca do budżetu | po S5 | przy przekazaniu |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lech | 1,365 | 2,438 | 4,000 | 13,900 | 2,780 | 6,632 | 6,613 |
| Raków | 0,812 | 0,626 | 0,300 | 6,100 | 1,220 | 2,678 | 2,618 |
| Jagiellonia | 0,750 | 0,634 | 1,000 | 3,000 | 0,600 | 2,140 | 1,922 |
| Górnik | 0,899 | -0,483 | 2,700 | 7,200 | 1,440 | 1,996 | 1,898 |
| GKS | 0,750 | -0,946 | 0,300 | 1,500 | 0,300 | 0,307 | 0,503 |

### Przekrój „środkowy” — `share=0.18 delta=1 rate=0.20 strong=0.95 active=0.80`

Mediana frontu po tej samej osi: ani najmniejsza, ani największa zmiana budżetów. **Nazwa nie jest rekomendacją.**

- wykonalny: tak
- suma różnic wobec dzisiejszych budżetów: 2,34 mln
- kluby ze wszystkich osiemnastu zdolne do reprezentatywnego wzmocnienia: 18/18
- kluby z ujemną **medianą** gotówki: po S1 0, po S5 1, przy przekazaniu 1
- pooled p95 gotówki po pięciu sezonach pełnej kariery: 8,54 mln
- gotówka przy przekazaniu: 21,1 pkt jako **proxy wkładu do dziedzictwa przy przekazaniu** (bez S6–S8), 5,4 pkt werdyktu (bieżące mnożniki)
- podłoga `MIN_INITIAL_BUDGET` wiąże u 9 klubów: Jagiellonia, Śląsk, Piast, Radomiak, Korona, Motor, Zagłębie, Wisła K., GKS

#### Wszystkie osiemnaście klubów

| klub | podłoga | udział | koszt wzmocnienia | wsparcie | budżet | wiążące | udział w przychodzie | bilans bez pucharów | puchary / sezon | bilans z pucharami | reinwestycja / sezon | po S1 | po S5 | przy przekazaniu |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Legia | 0,75 | 1,680 | 1,343 | — | **1,680** | shareBudget | 0,180 | 6,006 | 0,300 | 6,530 | 1,306 | 2,905 | 8,716 | 8,624 |
| Lech | 0,75 | 1,170 | 1,533 | — | **1,533** | usefulPurchaseCost | 0,236 | 2,438 | 2,700 | 5,030 | 1,006 | 2,802 | 6,800 | 6,782 |
| Raków | 0,75 | 0,696 | 0,899 | — | **0,899** | usefulPurchaseCost | 0,233 | 0,626 | 1,000 | 1,508 | 0,302 | 1,140 | 2,765 | 2,705 |
| Jagiellonia | 0,75 | 0,603 | 0,686 | — | **0,750** | absoluteFloor | 0,224 | 0,634 | 0,800 | 1,362 | 0,272 | 1,093 | 2,140 | 1,922 |
| Pogoń | 0,75 | 0,793 | 0,686 | — | **0,793** | shareBudget | 0,180 | 1,593 | 0,000 | 1,777 | 0,355 | 1,125 | 3,022 | 2,817 |
| Górnik | 0,75 | 0,475 | 1,029 | — | **1,029** | usefulPurchaseCost | 0,390 | -0,483 | 1,400 | 0,777 | 0,155 | 1,502 | 2,125 | 2,028 |
| Cracovia | 0,75 | 0,516 | 1,176 | — | **1,176** | usefulPurchaseCost | 0,411 | -0,218 | 0,000 | -0,005 | -0,001 | 1,151 | 1,575 | 1,442 |
| Widzew | 0,75 | 0,628 | 1,343 | 1,246 | **1,343** | usefulPurchaseCost | 0,385 | 0,107 | 0,800 | 0,836 | 0,167 | 1,392 | 2,644 | 2,567 |
| Śląsk | 0,75 | 0,434 | 0,305 | — | **0,750** | absoluteFloor | 0,311 | 0,141 | 0,000 | 0,184 | 0,037 | 0,788 | 1,115 | 0,813 |
| Piast | 0,75 | 0,362 | 0,349 | — | **0,750** | absoluteFloor | 0,373 | -0,254 | 0,000 | -0,216 | -0,043 | 0,706 | 0,657 | 0,688 |
| Radomiak | 0,75 | 0,251 | 0,267 | — | **0,750** | absoluteFloor | 0,539 | -0,806 | 0,000 | -0,766 | -0,153 | 0,596 | 0,126 | 0,570 |
| Korona | 0,75 | 0,283 | 0,686 | 0,669 | **0,750** | absoluteFloor | 0,476 | -1,103 | 0,000 | -0,996 | -0,199 | 0,545 | 0,082 | 0,232 |
| Motor | 0,75 | 0,431 | 0,523 | — | **0,750** | absoluteFloor | 0,313 | -0,147 | 0,000 | -0,054 | -0,011 | 0,731 | 0,999 | 0,808 |
| Zagłębie | 0,75 | 0,510 | 0,686 | — | **0,750** | absoluteFloor | 0,265 | 0,207 | 0,000 | 0,291 | 0,058 | 0,807 | 1,279 | 1,009 |
| Wisła K. | 0,75 | 0,510 | 0,349 | — | **0,750** | absoluteFloor | 0,265 | 0,361 | 0,000 | 0,427 | 0,086 | 0,832 | 1,424 | 1,137 |
| Wieczysta | 0,75 | 0,205 | 0,349 | 1,246 | **1,246** | backerSupportFloor | 1,092 | -1,180 | 0,000 | -1,136 | -0,227 | 1,018 | 0,353 | 0,793 |
| GKS | 0,75 | 0,307 | 0,686 | — | **0,750** | absoluteFloor | 0,440 | -0,946 | 0,300 | -0,647 | -0,129 | 0,654 | 0,307 | 0,503 |
| Wisła P. | 0,75 | 0,168 | 0,785 | — | **0,785** | usefulPurchaseCost | 0,840 | -1,728 | 0,000 | -1,638 | -0,328 | 0,456 | -0,634 | -0,174 |

#### Cztery kluby z klasą wsparcia

| klub | klasa | podłoga wsparcia | budżet | czy wiąże |
| --- | --- | --- | --- | --- |
| Widzew | strong | 1,246 | 1,343 | nie — istnieje, lecz nie wiąże |
| Korona | active | 0,669 | 0,750 | nie — istnieje, lecz nie wiąże |
| Motor | restrained | — | 0,750 | brak podłogi |
| Wieczysta | strong | 1,246 | 1,246 | **tak** |

#### Pięciu startowych uczestników Europy

Późniejsze kwalifikacje są wynikiem symulacji i siedzą już w medianie bilansu; ta tabela wyróżnia wyłącznie kluby, które wchodzą do Europy na starcie kadencji.

| klub | budżet | mediana bilansu bez pucharów | mediana pucharów w S1 | mediana pucharów w karierze | z pucharów wraca do budżetu | po S5 | przy przekazaniu |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lech | 1,533 | 2,438 | 4,000 | 13,900 | 2,780 | 6,800 | 6,782 |
| Raków | 0,899 | 0,626 | 0,300 | 6,100 | 1,220 | 2,765 | 2,705 |
| Jagiellonia | 0,750 | 0,634 | 1,000 | 3,000 | 0,600 | 2,140 | 1,922 |
| Górnik | 1,029 | -0,483 | 2,700 | 7,200 | 1,440 | 2,125 | 2,028 |
| GKS | 0,750 | -0,946 | 0,300 | 1,500 | 0,300 | 0,307 | 0,503 |

### Przekrój „hojny” — `share=0.20 delta=2 rate=0.20 strong=0.95 active=0.80`

Największa suma różnic na froncie — najwięcej pieniędzy w pierwszym oknie, i największa dalsza kalibracja do wykonania. **Nazwa nie jest rekomendacją.**

- wykonalny: tak
- suma różnic wobec dzisiejszych budżetów: 3,86 mln
- kluby ze wszystkich osiemnastu zdolne do reprezentatywnego wzmocnienia: 18/18
- kluby z ujemną **medianą** gotówki: po S1 0, po S5 1, przy przekazaniu 1
- pooled p95 gotówki po pięciu sezonach pełnej kariery: 8,73 mln
- gotówka przy przekazaniu: 21,5 pkt jako **proxy wkładu do dziedzictwa przy przekazaniu** (bez S6–S8), 5,5 pkt werdyktu (bieżące mnożniki)
- podłoga `MIN_INITIAL_BUDGET` wiąże u 5 klubów: Śląsk, Piast, Radomiak, Motor, Wisła K.

#### Wszystkie osiemnaście klubów

| klub | podłoga | udział | koszt wzmocnienia | wsparcie | budżet | wiążące | udział w przychodzie | bilans bez pucharów | puchary / sezon | bilans z pucharami | reinwestycja / sezon | po S1 | po S5 | przy przekazaniu |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Legia | 0,75 | 1,867 | 1,533 | — | **1,867** | shareBudget | 0,200 | 6,006 | 0,300 | 6,530 | 1,306 | 3,091 | 8,903 | 8,811 |
| Lech | 0,75 | 1,300 | 1,748 | — | **1,748** | usefulPurchaseCost | 0,269 | 2,438 | 2,700 | 5,030 | 1,006 | 3,017 | 7,015 | 6,996 |
| Raków | 0,75 | 0,773 | 1,029 | — | **1,029** | usefulPurchaseCost | 0,266 | 0,626 | 1,000 | 1,508 | 0,302 | 1,270 | 2,895 | 2,835 |
| Jagiellonia | 0,75 | 0,670 | 0,785 | — | **0,785** | usefulPurchaseCost | 0,234 | 0,634 | 0,800 | 1,362 | 0,272 | 1,128 | 2,176 | 1,957 |
| Pogoń | 0,75 | 0,881 | 0,785 | — | **0,881** | shareBudget | 0,200 | 1,593 | 0,000 | 1,777 | 0,355 | 1,214 | 3,110 | 2,905 |
| Górnik | 0,75 | 0,528 | 1,176 | — | **1,176** | usefulPurchaseCost | 0,446 | -0,483 | 1,400 | 0,777 | 0,155 | 1,649 | 2,273 | 2,175 |
| Cracovia | 0,75 | 0,573 | 1,343 | — | **1,343** | usefulPurchaseCost | 0,469 | -0,218 | 0,000 | -0,005 | -0,001 | 1,318 | 1,742 | 1,610 |
| Widzew | 0,75 | 0,698 | 1,533 | 1,385 | **1,533** | usefulPurchaseCost | 0,439 | 0,107 | 0,800 | 0,836 | 0,167 | 1,582 | 2,833 | 2,756 |
| Śląsk | 0,75 | 0,482 | 0,349 | — | **0,750** | absoluteFloor | 0,311 | 0,141 | 0,000 | 0,184 | 0,037 | 0,788 | 1,115 | 0,813 |
| Piast | 0,75 | 0,402 | 0,399 | — | **0,750** | absoluteFloor | 0,373 | -0,254 | 0,000 | -0,216 | -0,043 | 0,706 | 0,657 | 0,688 |
| Radomiak | 0,75 | 0,278 | 0,305 | — | **0,750** | absoluteFloor | 0,539 | -0,806 | 0,000 | -0,766 | -0,153 | 0,596 | 0,126 | 0,570 |
| Korona | 0,75 | 0,315 | 0,785 | 0,743 | **0,785** | usefulPurchaseCost | 0,499 | -1,103 | 0,000 | -0,996 | -0,199 | 0,580 | 0,118 | 0,267 |
| Motor | 0,75 | 0,479 | 0,599 | — | **0,750** | absoluteFloor | 0,313 | -0,147 | 0,000 | -0,054 | -0,011 | 0,731 | 0,999 | 0,808 |
| Zagłębie | 0,75 | 0,567 | 0,785 | — | **0,785** | usefulPurchaseCost | 0,277 | 0,207 | 0,000 | 0,291 | 0,058 | 0,842 | 1,314 | 1,045 |
| Wisła K. | 0,75 | 0,566 | 0,399 | — | **0,750** | absoluteFloor | 0,265 | 0,361 | 0,000 | 0,427 | 0,086 | 0,832 | 1,424 | 1,137 |
| Wieczysta | 0,75 | 0,228 | 0,399 | 1,385 | **1,385** | backerSupportFloor | 1,213 | -1,180 | 0,000 | -1,136 | -0,227 | 1,157 | 0,491 | 0,931 |
| GKS | 0,75 | 0,341 | 0,785 | — | **0,785** | usefulPurchaseCost | 0,461 | -0,946 | 0,300 | -0,647 | -0,129 | 0,689 | 0,343 | 0,538 |
| Wisła P. | 0,75 | 0,187 | 0,899 | — | **0,899** | usefulPurchaseCost | 0,961 | -1,728 | 0,000 | -1,638 | -0,328 | 0,569 | -0,521 | -0,061 |

#### Cztery kluby z klasą wsparcia

| klub | klasa | podłoga wsparcia | budżet | czy wiąże |
| --- | --- | --- | --- | --- |
| Widzew | strong | 1,385 | 1,533 | nie — istnieje, lecz nie wiąże |
| Korona | active | 0,743 | 0,785 | nie — istnieje, lecz nie wiąże |
| Motor | restrained | — | 0,750 | brak podłogi |
| Wieczysta | strong | 1,385 | 1,385 | **tak** |

#### Pięciu startowych uczestników Europy

Późniejsze kwalifikacje są wynikiem symulacji i siedzą już w medianie bilansu; ta tabela wyróżnia wyłącznie kluby, które wchodzą do Europy na starcie kadencji.

| klub | budżet | mediana bilansu bez pucharów | mediana pucharów w S1 | mediana pucharów w karierze | z pucharów wraca do budżetu | po S5 | przy przekazaniu |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lech | 1,748 | 2,438 | 4,000 | 13,900 | 2,780 | 7,015 | 6,996 |
| Raków | 1,029 | 0,626 | 0,300 | 6,100 | 1,220 | 2,895 | 2,835 |
| Jagiellonia | 0,785 | 0,634 | 1,000 | 3,000 | 0,600 | 2,176 | 1,957 |
| Górnik | 1,176 | -0,483 | 2,700 | 7,200 | 1,440 | 2,273 | 2,175 |
| GKS | 0,785 | -0,946 | 0,300 | 1,500 | 0,300 | 0,343 | 0,538 |

## Czego ten raport nie dowodzi

- **Nie mierzy czterech kart reaktywnego rynku.** Bramka czterech ofert leży po speku 5 i nie jest tu udawana przez obecny generator.
- **Nie mierzy zmiany decyzji gracza.** Cała warstwa gotówki to przybliżenie biernej polityki `alwaysPass`; aktywna polityka wydawałaby inaczej, a jej kadra byłaby inna.
- **Nie mierzy docelowego rozkładu tytułów.** Handicapy, progi dziedzictwa i kalibracja trudności zostają nietknięte; nowe budżety je ruszą i wymagają osobnej kalibracji.
- **Nie mierzy gotówki końcowej po epilogu.** `LEGACY_KASA` punktuje stan po S8, a dump kończy się na przekazaniu klubu. Pokazana liczba legacy jest wyłącznie przeliczeniem gotówki z S5 w tej samej jednostce; aktywacja wymaga pomiaru pełnych karier.

Pominięcia pucharów na tej liście **nie ma i być nie powinno**: od schematu 4 dumpu sezonowego `creditedCupIncome` wchodzi do przybliżenia i jest zmierzony, nie pominięty.

## Pięć pytań do właściciela produktu

1. **`budgetShare`** — jaki udział skalowanego przychodu powtarzalnego klub oddaje na pierwsze okno?
2. **`usefulUpgradeOvrDelta`** — o ile OVR powyżej docelowego poziomu pozycji zakup ma być „użytecznym wzmocnieniem”: 0, 1 czy 2?
3. **`boardReinvestmentRate`** — jaka część wyniku operacyjnego sezonu wraca do budżetu transferowego?
4. **percentyl `strong`** — 0,90 czy 0,95, dla Widzewa i Wieczystej?
5. **percentyl `active`** — 0,75 czy 0,80, dla Korony?

Nie ma szóstego pokrętła i nie ma osobnych wartości per klub. Motor pozostaje `restrained` — świadomym brakiem podłogi — a czternaście pozostałych klubów `none`.

Po decyzji powstaje osobny plan **atomowej aktywacji**. Jego wykonanie wymaga migracji historycznego pola `ownerBudgetPercentile` na `backerBudgetPercentile` wraz ze wszystkimi typami, testami i konsumentami: oba pola nie mogą współistnieć po aktywacji.
