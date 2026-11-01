# Pomiar kontrolny speka 4

## 1. Bramka pierwszego okna (punkt przed spekiem 5)

Progi: udział okien z użyteczną i tanią ofertą KUPNO >= 0,75; mediana użytecznych i tanich ofert w przedziale [1, 2]. Kolumna z targowaniem jest górną granicą osiągalności (targowanie może się nie udać); karty na cenowym limicie kosztują zaokr(kasa x PURCHASE_PRICE_CAP, 2) > kasa i są osiągalne wyłącznie przez targowanie.

| clubId | okna | udział spełnionych | udział z targowaniem | mediana | brak celu | brak ceny | brak ceny, osiągalne targowaniem | bramka udziału | bramka mediany |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| legia-warszawa | 1000 | 77,9% | 82,5% | 1,00 | 175 | 46 | 46 | spełnione | spełnione |
| zaglebie-lubin | 1000 | 67,1% | 90,8% | 1,00 | 92 | 237 | 237 | niespełnione | spełnione |
| wisla-krakow | 1000 | 67,0% | 90,7% | 1,00 | 93 | 237 | 237 | niespełnione | spełnione |
| wieczysta-krakow | 1000 | 87,8% | 92,8% | 2,00 | 72 | 50 | 50 | spełnione | spełnione |
| cracovia | 1000 | 76,9% | 86,8% | 1,00 | 132 | 99 | 99 | spełnione | spełnione |
| gks-katowice | 1000 | 65,8% | 90,6% | 1,00 | 94 | 248 | 248 | niespełnione | spełnione |
| gornik-zabrze | 1000 | 70,9% | 85,2% | 1,00 | 148 | 143 | 143 | niespełnione | spełnione |
| jagiellonia-bialystok | 1000 | 64,0% | 89,1% | 1,00 | 109 | 251 | 251 | niespełnione | spełnione |
| korona-kielce | 1000 | 65,5% | 90,2% | 1,00 | 98 | 247 | 247 | niespełnione | spełnione |
| lech-poznan | 1000 | 60,5% | 69,3% | 1,00 | 307 | 88 | 88 | niespełnione | spełnione |
| motor-lublin | 1000 | 66,4% | 90,9% | 1,00 | 91 | 245 | 245 | niespełnione | spełnione |
| piast-gliwice | 1000 | 72,6% | 93,1% | 1,00 | 69 | 205 | 205 | niespełnione | spełnione |
| pogon-szczecin | 1000 | 66,9% | 88,1% | 1,00 | 119 | 212 | 212 | niespełnione | spełnione |
| radomiak-radom | 1000 | 73,1% | 93,3% | 1,00 | 67 | 202 | 202 | niespełnione | spełnione |
| rakow-czestochowa | 1000 | 61,6% | 81,7% | 1,00 | 183 | 201 | 201 | niespełnione | spełnione |
| slask-wroclaw | 1000 | 72,5% | 92,9% | 1,00 | 71 | 204 | 204 | niespełnione | spełnione |
| widzew-lodz | 1000 | 72,6% | 81,5% | 1,00 | 185 | 89 | 89 | niespełnione | spełnione |
| wisla-plock | 1000 | 71,3% | 90,6% | 1,00 | 94 | 193 | 193 | niespełnione | spełnione |

## 2. Udział ofert zewnętrznych w cenowym zasięgu (obserwacja bez progu)

### Kluby

| klucz | karty zewnętrzne | udział użytecznych i tanich | na limicie / zewnętrzne | na limicie / płatne |
| --- | --- | --- | --- | --- |
| legia-warszawa | 260671 | 69,0% | 6,2% | 8,0% |
| zaglebie-lubin | 201401 | 45,3% | 35,0% | 44,7% |
| wisla-krakow | 201879 | 46,1% | 36,1% | 46,1% |
| wieczysta-krakow | 175619 | 41,6% | 23,1% | 29,5% |
| cracovia | 246849 | 48,2% | 25,1% | 32,2% |
| gks-katowice | 217042 | 34,0% | 30,6% | 39,2% |
| gornik-zabrze | 258060 | 51,6% | 21,3% | 27,4% |
| jagiellonia-bialystok | 235752 | 52,4% | 28,7% | 36,8% |
| korona-kielce | 222164 | 30,4% | 28,4% | 36,3% |
| lech-poznan | 277559 | 58,4% | 7,2% | 9,3% |
| motor-lublin | 214471 | 40,6% | 35,1% | 44,9% |
| piast-gliwice | 167304 | 40,3% | 36,2% | 46,0% |
| pogon-szczecin | 245216 | 56,7% | 23,5% | 30,1% |
| radomiak-radom | 147360 | 35,4% | 33,3% | 42,2% |
| rakow-czestochowa | 266453 | 52,4% | 22,5% | 28,9% |
| slask-wroclaw | 166056 | 44,8% | 37,8% | 48,2% |
| widzew-lodz | 268970 | 51,8% | 21,0% | 27,1% |
| wisla-plock | 208791 | 27,2% | 22,4% | 28,8% |

### Polityki

| klucz | karty zewnętrzne | udział użytecznych i tanich | na limicie / zewnętrzne | na limicie / płatne |
| --- | --- | --- | --- | --- |
| alwaysHaggle | 272608 | 47,3% | 19,7% | 25,3% |
| alwaysPass | 259005 | 57,5% | 18,3% | 23,4% |
| alwaysTake | 270493 | 47,5% | 27,4% | 35,1% |
| analystEdgeBuy | 264976 | 43,3% | 27,5% | 35,2% |
| depthFirst | 276206 | 30,6% | 30,1% | 38,6% |
| mixed | 268021 | 46,9% | 24,6% | 31,5% |
| primeOnly | 258327 | 51,4% | 25,1% | 32,1% |
| primeOnlyBuy | 263247 | 42,9% | 29,1% | 37,2% |
| stallThenTake | 266790 | 42,7% | 29,5% | 37,8% |
| veteranOnly | 272509 | 56,0% | 18,0% | 23,1% |
| veteranOnlyBuy | 274213 | 50,9% | 19,7% | 25,3% |
| youngBuySellAlways | 250218 | 61,1% | 20,5% | 26,2% |
| youngBuySellStars | 262783 | 39,5% | 31,1% | 39,9% |
| youngOnly | 259422 | 50,4% | 25,8% | 33,0% |
| youngOnlyBuy | 262799 | 38,8% | 31,4% | 40,2% |

## 3. Presja finansowa: przekroczenie stałego progu zakupu (obserwacja bez progu)

Wskaźnik zastępczy dla dylematu (ii) z par. 12.2: liczy przekroczenia stałego progu zakupu, nie odpowiada, czy sprzedaż była konieczna.

| clubId | udział okien pod presją | przekroczenia / 100 sprzedaży | przekroczenia / karierę |
| --- | --- | --- | --- |
| legia-warszawa | 9,1% | 6,9 | 0,18 |
| zaglebie-lubin | 49,2% | 19,9 | 0,38 |
| wisla-krakow | 29,6% | 17,9 | 0,34 |
| wieczysta-krakow | 46,6% | 15,4 | 0,25 |
| cracovia | 75,9% | 27,6 | 0,64 |
| gks-katowice | 66,1% | 20,4 | 0,41 |
| gornik-zabrze | 40,4% | 18,4 | 0,45 |
| jagiellonia-bialystok | 33,0% | 18,4 | 0,41 |
| korona-kielce | 68,7% | 20,1 | 0,42 |
| lech-poznan | 14,8% | 11,1 | 0,29 |
| motor-lublin | 48,6% | 21,8 | 0,43 |
| piast-gliwice | 41,4% | 19,2 | 0,30 |
| pogon-szczecin | 24,0% | 16,4 | 0,38 |
| radomiak-radom | 45,0% | 16,9 | 0,22 |
| rakow-czestochowa | 34,0% | 18,6 | 0,47 |
| slask-wroclaw | 31,9% | 18,2 | 0,28 |
| widzew-lodz | 63,2% | 26,7 | 0,68 |
| wisla-plock | 73,0% | 16,2 | 0,31 |

## 4. Dylemat sprzedaży gwiazdy (obserwacja bez progu)

Założenie pomiaru: gwiazda = własny transfer (moj) w pierwszej trójce kadry wg bySquadPriority, OWN_STAR_RANK = 3.

| clubId | sparowane ziarna | kariery ze sprzedażą | dziedzictwo delta | dziedzictwo delta (sprzedano) | kasa delta |
| --- | --- | --- | --- | --- | --- |
| legia-warszawa | 1000 | 78 | 2,96 +/- 1,01 | 37,96 +/- 12,28 | 0,32 +/- 0,05 |
| zaglebie-lubin | 1000 | 47 | 1,00 +/- 0,60 | 21,32 +/- 12,50 | 0,10 +/- 0,02 |
| wisla-krakow | 1000 | 70 | 2,03 +/- 0,89 | 28,96 +/- 12,37 | 0,12 +/- 0,02 |
| wieczysta-krakow | 1000 | 98 | 0,63 +/- 1,06 | 6,42 +/- 10,81 | 0,16 +/- 0,02 |
| cracovia | 1000 | 59 | 1,19 +/- 0,83 | 20,20 +/- 13,97 | 0,17 +/- 0,03 |
| gks-katowice | 1000 | 42 | -0,50 +/- 0,59 | -11,90 +/- 14,21 | 0,07 +/- 0,02 |
| gornik-zabrze | 1000 | 78 | 2,00 +/- 0,74 | 25,58 +/- 9,17 | 0,22 +/- 0,03 |
| jagiellonia-bialystok | 1000 | 90 | -0,06 +/- 1,02 | -0,71 +/- 11,42 | 0,17 +/- 0,03 |
| korona-kielce | 1000 | 50 | 0,89 +/- 0,62 | 17,78 +/- 12,23 | 0,09 +/- 0,02 |
| lech-poznan | 1000 | 28 | 1,44 +/- 0,77 | 51,29 +/- 26,07 | 0,13 +/- 0,03 |
| motor-lublin | 1000 | 60 | -0,20 +/- 0,73 | -3,40 +/- 12,33 | 0,09 +/- 0,02 |
| piast-gliwice | 1000 | 65 | 2,25 +/- 0,82 | 34,65 +/- 12,01 | 0,09 +/- 0,02 |
| pogon-szczecin | 1000 | 89 | 1,90 +/- 1,01 | 21,35 +/- 11,23 | 0,22 +/- 0,03 |
| radomiak-radom | 1000 | 46 | 0,60 +/- 0,67 | 12,96 +/- 14,60 | 0,06 +/- 0,01 |
| rakow-czestochowa | 1000 | 43 | 1,08 +/- 0,61 | 25,23 +/- 13,85 | 0,14 +/- 0,03 |
| slask-wroclaw | 1000 | 73 | 2,88 +/- 1,00 | 39,48 +/- 12,97 | 0,10 +/- 0,02 |
| widzew-lodz | 1000 | 53 | 2,10 +/- 0,60 | 39,66 +/- 10,15 | 0,19 +/- 0,03 |
| wisla-plock | 1000 | 51 | 0,77 +/- 0,68 | 15,12 +/- 13,37 | 0,14 +/- 0,02 |

## 5. Koszt płacowy wolnych agentów (obserwacja bez progu)

Nadpłata w stałym horyzoncie dwóch lat i stosunek 0,40-0,60 liczy pnpm audit:finance-activation; poniżej diagnostyka dodatkowa.

| polityka | podpisania | mediana rocznej płacy | udział w przychodzie klubu | mediana kosztu do rozliczenia | mediana sezonów na liście płac |
| --- | --- | --- | --- | --- | --- |
| alwaysTake | 53176 | 0,44 | 15,3% | 0,86 | 2,00 |
| alwaysHaggle | 31800 | 0,37 | 12,6% | 0,75 | 2,00 |
| mixed | 26203 | 0,41 | 14,1% | 0,84 | 2,00 |

## 6. Wynik surowy kontra zmiana budżetu (obserwacja bez progu)

| clubId | mediana sumy wyniku surowego | mediana zmiany budżetu | mediana reszty stopy |
| --- | --- | --- | --- |
| legia-warszawa | 29,86 | 8,96 | -0,00 |
| zaglebie-lubin | 0,47 | 0,15 | 0,00 |
| wisla-krakow | 1,03 | 0,31 | 0,00 |
| wieczysta-krakow | -2,82 | -0,84 | 0,00 |
| cracovia | -0,82 | -0,24 | 0,01 |
| gks-katowice | -4,02 | -1,20 | 0,00 |
| gornik-zabrze | -2,14 | -0,64 | -0,00 |
| jagiellonia-bialystok | 2,81 | 0,85 | 0,00 |
| korona-kielce | -4,86 | -1,45 | 0,01 |
| lech-poznan | 12,33 | 3,70 | -0,00 |
| motor-lublin | -0,43 | -0,13 | -0,00 |
| piast-gliwice | -0,49 | -0,14 | 0,00 |
| pogon-szczecin | 7,70 | 2,32 | 0,01 |
| radomiak-radom | -1,50 | -0,45 | 0,00 |
| rakow-czestochowa | 3,09 | 0,92 | -0,01 |
| slask-wroclaw | 0,21 | 0,06 | 0,00 |
| widzew-lodz | 0,52 | 0,16 | 0,00 |
| wisla-plock | -7,46 | -2,25 | -0,00 |

## 7. Tytuły wg kwartyla advantageScore (obserwacja bez progu)

Rozkład jest pulą wszystkich 15 polityk naraz, nie osobnym pomiarem na politykę; grupy Q1-Q2 i Q3-Q4 mają różną liczbę klubów, więc porównywać należy udziały, nie surowe liczby.

| grupa | kluby | kariery | ARCHITEKT | CZŁOWIEK, KTÓRY ZRUJNOWAŁ KLUB | LEGENDA GABINETU | SOLIDNA ROBOTA | UCZCIWY WYROBNIK | ZAPOMNIANY | ARCHITEKT % | CZŁOWIEK, KTÓRY ZRUJNOWAŁ KLUB % | LEGENDA GABINETU % | SOLIDNA ROBOTA % | UCZCIWY WYROBNIK % | ZAPOMNIANY % |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Q1 (najniższy advantageScore) | radomiak-radom, wisla-plock, piast-gliwice, gks-katowice, slask-wroclaw | 75000 | 901 | 53099 | 59 | 4164 | 8457 | 8320 | 1,2% | 70,8% | 0,1% | 5,6% | 11,3% | 11,1% |
| Q2 | motor-lublin, zaglebie-lubin, korona-kielce, wisla-krakow, wieczysta-krakow | 75000 | 2953 | 43246 | 277 | 9234 | 11450 | 7840 | 3,9% | 57,7% | 0,4% | 12,3% | 15,3% | 10,5% |
| Q3 | cracovia, gornik-zabrze, jagiellonia-bialystok, pogon-szczecin | 60000 | 8813 | 15999 | 1960 | 15162 | 12696 | 5370 | 14,7% | 26,7% | 3,3% | 25,3% | 21,2% | 8,9% |
| Q4 (najwyższy advantageScore) | rakow-czestochowa, widzew-lodz, lech-poznan, legia-warszawa | 60000 | 11835 | 5176 | 24472 | 9518 | 5977 | 3022 | 19,7% | 8,6% | 40,8% | 15,9% | 10,0% | 5,0% |
