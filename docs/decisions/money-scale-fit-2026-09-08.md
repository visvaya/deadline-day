# Skala pieniądza i płace — pomiar

**Status: ZABLOKOWANE.**

To jest **pomiar**, nie zgoda na aktywację. Wszystkie liczby niżej są
**kandydatami**, nie stałymi gotowymi do wpisania. Żadna z nich nie zmienia
`src/`; aktywacja wymaga decyzji właściciela produktu i pomiaru pełnych karier
w kroku 4.

Wersja narzędzia: **1.0.0**. Model referencyjny: `generator-expectation`.

## Co blokuje aktywację

- screen-projection: no slope in [2, 20] meets both wage criteria at any level
- generator-expectation: no slope in [2, 20] meets both wage criteria at any level
- 15 of 18 clubs cannot afford one median KUPNO card and its first-year wage

## Metoda

Cel dopasowania: `totalRevenuePln × wageToRevenueRatio × 0.764 × 0.85`. Pierwszy udział jest **raportowany**
(podział płac w raporcie GT), drugi **estymowany** (udział samych piłkarzy w płacach
pierwszej drużyny). Nie wolno nazywać obu raportowanymi.

`WAGE_PIVOT` jest przypięte na **70** i nie podlega dopasowaniu.
Strata referencyjna to **suma kwadratów logarytmów residuów**, każdy klub z równą wagą.
To **nie jest** minimalizacja mediany APE ani maksimum APE — kryteria akceptacji speka
są sprawdzane osobno, przy **swobodnym poziomie**, a nie w punkcie tej straty.

Błąd płac `predicted − reportedTarget` **nie jest bilansem finansowym klubu**
i nie wolno go nazywać deficytem.

## Populacja

Główna (raportowani, grywalni, porównywalni): **13** klubów.

| klub | przychód ogółem (mln PLN) | wskaźnik płac | cel płac (mln PLN) |
| --- | ---: | ---: | ---: |
| Legia | 230,87 | 0,48 | 71,96 |
| Lech | 145,32 | 0,52 | 49,07 |
| Raków | 142,92 | 0,50 | 46,41 |
| Jagiellonia | 129,17 | 0,37 | 31,04 |
| Pogoń | 78,41 | 0,55 | 28,01 |
| Górnik | 57,51 | 0,47 | 17,55 |
| Cracovia | 64,30 | 0,59 | 24,64 |
| Widzew | 64,10 | 0,47 | 19,56 |
| Śląsk | 60,42 | 0,75 | 29,43 |
| Piast | 41,89 | 0,73 | 19,86 |
| Radomiak | 26,60 | 0,93 | 16,06 |
| Korona | 33,92 | 0,65 | 14,32 |
| Zagłębie | 48,07 | 0,99 | 30,90 |

Wrażliwość (raportowani i grywalni, wyłączeni z dopasowania referencyjnego):

| klub | powód |
| --- | --- |
| Motor | promoted for 2024/25: wage bill assembled in the division below, held out by default |
| Wisła K. | first-division report: a different cohort and central package |
| GKS | promoted for 2024/25: wage bill assembled in the division below, held out by default |
| Wisła P. | first-division report: a different cohort and central package |

Wyłączeni:

| klub | powód |
| --- | --- |
| Wieczysta | constructed finance record: its wage ratio is an assumption, not a measurement |
| lechia-gdansk | reported but not playable: no career starts at this club |
| stal-mielec | reported but not playable: no career starts at this club |
| puszcza-niepolomice | reported but not playable: no career starts at this club |
| miedz-legnica | reported but not playable: no career starts at this club |
| stal-rzeszow | reported but not playable: no career starts at this club |
| lks-lodz | reported but not playable: no career starts at this club |
| ruch-chorzow | reported but not playable: no career starts at this club |
| arka-gdynia | reported but not playable: no career starts at this club |
| gks-tychy | reported but not playable: no career starts at this club |
| odra-opole | reported but not playable: no career starts at this club |
| warta-poznan | reported but not playable: no career starts at this club |
| gornik-leczna | reported but not playable: no career starts at this club |
| polonia-warszawa | reported but not playable: no career starts at this club |
| chrobry-glogow | reported but not playable: no career starts at this club |
| pogon-siedlce | reported but not playable: no career starts at this club |
| znicz-pruszkow | reported but not playable: no career starts at this club |
| stal-stalowa-wola | reported but not playable: no career starts at this club |

**Gwiazdka GT-EKS przy Motorze, Lechii i GKS dotyczy kolumny 2023/2024**, nie
2024/2025 — sprawdzone wobec legendy wykresu płac (str. 19) i kart klubowych.
Ich bieżące wskaźniki są więc porównywalne; Motor i GKS trafiają do wrażliwości
zachowawczo, jako kluby w pierwszym sezonie po awansie, a nie dlatego, że dane są złe.
Lechia odpada wcześniej — nie da się nią grać.

## Dopasowanie płac i wykonalność

### Model `screen-projection`

Nachylenie: **14,5838**, poziom: **1,83 mln PLN**.
Minimum na siatce: 14,58; wewnątrz zakresu.
Lokalnych minimów na siatce: **1** (zgodne z unimodalnością), remisów: 0.
Doprecyzowanie: 21 iteracji, zbieżne do 1e-6.

Mediana APE: **22,12%** (kryterium ≤ 15%), maksimum: **79,33%** (kryterium ≤ 30%).
Suma celu: 398,81 mln PLN, suma prognozy: 367,09 mln PLN, **względny błąd sumy populacji dopasowania**: −7,95%.

Wykonalność sprawdzona przy **swobodnym poziomie**, osobno dla każdego nachylenia
w zakresie [2, 20] krokiem 0,01:

- nachyleń spełniających **oba** kryteria jednocześnie: **0** z 1801
- świadek kryterium maksimum w optimum: **Legia** kontra **Górnik**, rozrzut 3,835 wobec dopuszczalnego 1,857
- najmniejszy rozrzut w całym zakresie: **3,779**

Para klubów wskazana wyżej jest **certyfikatem dla tego nachylenia**: żaden poziom nie
leży jednocześnie w paśmie obu, dopóki ich rozrzut przekracza `(1+t)/(1−t)`. Świadek
zmienia się jednak wraz z nachyleniem, więc **nie jest to dowód niezależny od `s`** —
sonda niżej sprawdza dodatkowe nachylenia, nie dowodzi niewykonalności dla kontinuum.

Sonda log-równomierna po `[0.05; 10000]`, 600 punktów, poza zakresem skanu:

- najmniejszy rozrzut w całej sondzie: **3,779** przy nachyleniu 12,51
- rozrzut przy krzywej płaskiej (`s → ∞`): **5,026** = `max(cel)/min(cel)`
- dopuszczalny: 1,857
- czy gdziekolwiek wykonalne: **nie**

Granica przy `s → ∞` opisuje wyłącznie krzywą płaską:
przy płaskiej krzywej kształt każdego klubu dąży do liczebności kadry, ta sama dla
wszystkich, więc ilorazy zależą już tylko od celów. Rozrzut samych celów przekracza
dopuszczalny dla aktualnych danych; sonda sprawdza dodatkowo wybrane skończone nachylenia.

Werdykt numeryczny dotyczy zbadanych punktów, także poza `[2, 20]`, oraz granicy płaskiej.
Nie wyklucza matematycznie rozwiązania pomiędzy próbkami ani poza sondą.

| klub | cel (mln PLN) | prognoza (mln PLN) | błąd podpisany | błąd bezwzgl. |
| --- | ---: | ---: | ---: | ---: |
| Górnik | 17,55 | 31,48 | 79,33% | 79,33% |
| Korona | 14,32 | 25,47 | 77,86% | 77,86% |
| Widzew | 19,56 | 34,52 | 76,45% | 76,45% |
| Legia | 71,96 | 33,66 | −53,23% | 53,23% |
| Śląsk | 29,43 | 19,69 | −33,08% | 33,08% |
| Raków | 46,41 | 33,25 | −28,34% | 28,34% |
| Cracovia | 24,64 | 30,09 | 22,12% | 22,12% |
| Zagłębie | 30,90 | 24,15 | −21,85% | 21,85% |
| Radomiak | 16,06 | 18,52 | 15,30% | 15,30% |
| Jagiellonia | 31,04 | 26,35 | −15,08% | 15,08% |
| Lech | 49,07 | 42,70 | −12,98% | 12,98% |
| Pogoń | 28,01 | 27,49 | −1,83% | 1,83% |
| Piast | 19,86 | 19,71 | −0,74% | 0,74% |

Diagnostyka A (normalizacja do sumy): poziom 1,99 mln PLN, mediana APE 25,26%, maksimum 94,83%, błąd sumy −0,00%.
**Sama zgodność sumy nie identyfikuje nachylenia** — dla każdego slope istnieje poziom,
który trafia w sumę dokładnie.

### Model `generator-expectation`

Nachylenie: **14,5253**, poziom: **2,20 mln PLN**.
Minimum na siatce: 14,53; wewnątrz zakresu.
Lokalnych minimów na siatce: **1** (zgodne z unimodalnością), remisów: 0.
Doprecyzowanie: 21 iteracji, zbieżne do 1e-6.

Mediana APE: **22,58%** (kryterium ≤ 15%), maksimum: **79,08%** (kryterium ≤ 30%).
Suma celu: 398,81 mln PLN, suma prognozy: 367,02 mln PLN, **względny błąd sumy populacji dopasowania**: −7,97%.

Wykonalność sprawdzona przy **swobodnym poziomie**, osobno dla każdego nachylenia
w zakresie [2, 20] krokiem 0,01:

- nachyleń spełniających **oba** kryteria jednocześnie: **0** z 1801
- świadek kryterium maksimum w optimum: **Legia** kontra **Górnik**, rozrzut 3,822 wobec dopuszczalnego 1,857
- najmniejszy rozrzut w całym zakresie: **3,764**

Para klubów wskazana wyżej jest **certyfikatem dla tego nachylenia**: żaden poziom nie
leży jednocześnie w paśmie obu, dopóki ich rozrzut przekracza `(1+t)/(1−t)`. Świadek
zmienia się jednak wraz z nachyleniem, więc **nie jest to dowód niezależny od `s`** —
sonda niżej sprawdza dodatkowe nachylenia, nie dowodzi niewykonalności dla kontinuum.

Sonda log-równomierna po `[0.05; 10000]`, 600 punktów, poza zakresem skanu:

- najmniejszy rozrzut w całej sondzie: **3,764** przy nachyleniu 8,85
- rozrzut przy krzywej płaskiej (`s → ∞`): **5,026** = `max(cel)/min(cel)`
- dopuszczalny: 1,857
- czy gdziekolwiek wykonalne: **nie**

Granica przy `s → ∞` opisuje wyłącznie krzywą płaską:
przy płaskiej krzywej kształt każdego klubu dąży do liczebności kadry, ta sama dla
wszystkich, więc ilorazy zależą już tylko od celów. Rozrzut samych celów przekracza
dopuszczalny dla aktualnych danych; sonda sprawdza dodatkowo wybrane skończone nachylenia.

Werdykt numeryczny dotyczy zbadanych punktów, także poza `[2, 20]`, oraz granicy płaskiej.
Nie wyklucza matematycznie rozwiązania pomiędzy próbkami ani poza sondą.

| klub | cel (mln PLN) | prognoza (mln PLN) | błąd podpisany | błąd bezwzgl. |
| --- | ---: | ---: | ---: | ---: |
| Górnik | 17,55 | 31,43 | 79,08% | 79,08% |
| Korona | 14,32 | 25,44 | 77,70% | 77,70% |
| Widzew | 19,56 | 34,54 | 76,52% | 76,52% |
| Legia | 71,96 | 33,72 | −53,15% | 53,15% |
| Śląsk | 29,43 | 19,70 | −33,07% | 33,07% |
| Raków | 46,41 | 33,12 | −28,64% | 28,64% |
| Cracovia | 24,64 | 30,20 | 22,58% | 22,58% |
| Zagłębie | 30,90 | 24,28 | −21,45% | 21,45% |
| Radomiak | 16,06 | 18,60 | 15,77% | 15,77% |
| Jagiellonia | 31,04 | 26,28 | −15,33% | 15,33% |
| Lech | 49,07 | 42,63 | −13,14% | 13,14% |
| Pogoń | 28,01 | 27,43 | −2,07% | 2,07% |
| Piast | 19,86 | 19,67 | −0,93% | 0,93% |

Diagnostyka A (normalizacja do sumy): poziom 2,39 mln PLN, mediana APE 25,80%, maksimum 94,59%, błąd sumy 0,00%.
**Sama zgodność sumy nie identyfikuje nachylenia** — dla każdego slope istnieje poziom,
który trafia w sumę dokładnie.

### Opcja A po nachyleniach: co wybiera nachylenie

Poziom jest tu ustawiony **warunkiem A** — trafia w sumę populacji dopasowania dokładnie,
przy każdym nachyleniu. Dlatego suma nie może być jedynym kryterium: wszystkie wiersze
niżej spełniają ją idealnie i różnią się dopiero **pojedynczą płacą**. To jest tabela,
wobec której trzeba wybrać warunek towarzyszący.

`D` jest w każdym wierszu **wyprowadzone od nowa**, bo skala idzie za dopasowaną listą płac.
Z tego samego powodu **koszt medianowej karty i grywalność też są liczone per wiersz**:
odstępne jest zakotwiczone w realnych euro i nie drgnie, ale płaca jedzie po krzywej
danego wiersza, więc próg, który klub musi pokryć, nie jest tym zmierzonym przy
nachyleniu referencyjnym. Tabela polityk budżetowych niżej stoi na wierszu referencyjnym.

| nachylenie | D (mln PLN) | OVR 60 | OVR 70 | OVR 80 | OVR 90 | OVR 90 / przychód najbog. | OVR 90 / przychód najuboż. | mediana APE | maks. APE | koszt 1. roku | grywalnych | podłoga na 18/18 | `WOLNY_WAGE_PREMIUM` |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 4,00 | 16,42 | 0,018 | 0,214 | 2,610 | 31,797 | 354,6% | 3540,0% | 55,78% | 138,44% | 0,669 | 3 / 18 | 0,669 | 1,3527 |
| 6,00 | 19,97 | 0,032 | 0,168 | 0,887 | 4,697 | 63,7% | 635,8% | 43,21% | 127,36% | 0,684 | 2 / 18 | 0,684 | 1,6551 |
| 8,00 | 16,92 | 0,051 | 0,178 | 0,622 | 2,172 | 25,0% | 249,1% | 25,62% | 114,91% | 0,706 | 3 / 18 | 0,706 | 1,7314 |
| 10,00 | 16,81 | 0,060 | 0,164 | 0,446 | 1,211 | 13,8% | 138,1% | 20,68% | 105,43% | 0,714 | 3 / 18 | 0,714 | 1,8732 |
| 12,00 | 15,77 | 0,071 | 0,162 | 0,374 | 0,860 | 9,2% | 92,0% | 20,19% | 98,37% | 0,724 | 3 / 18 | 0,724 | 1,9350 |
| 14,58 | 15,21 | 0,079 | 0,157 | 0,311 | 0,617 | 6,4% | 63,7% | 26,01% | 94,54% | 0,731 | 3 / 18 | 0,731 | 2,0445 |
| 16,00 | 14,97 | 0,082 | 0,154 | 0,288 | 0,538 | 5,5% | 54,6% | 24,63% | 95,53% | 0,734 | 3 / 18 | 0,734 | 2,0766 |
| 18,00 | 14,68 | 0,087 | 0,151 | 0,264 | 0,459 | 4,6% | 45,7% | 24,58% | 98,10% | 0,737 | 4 / 18 | 0,737 | 2,1220 |
| 20,00 | 14,44 | 0,090 | 0,149 | 0,245 | 0,405 | 4,0% | 39,6% | 25,49% | 100,07% | 0,740 | 4 / 18 | 0,740 | 2,1561 |

**Cztery ostatnie kolumny wiążą decyzję o nachyleniu z resztą stałych.** Decyzje
o nachyleniu i o budżetach zapadły 2026-09-09, ale sprzężenie zostaje i obowiązuje
przy każdej ich rewizji: wybór nachylenia przesuwa
`D`, a przez `D` budżety i koszt pierwszego roku — więc podłoga odczytana z wiersza
referencyjnego byłaby podłogą dla nachylenia, którego nikt nie wybrał. Podłoga
gwarantująca grywalność wszystkich klubów to dokładnie koszt medianowej karty **przy tym
samym nachyleniu**.

Kwoty płac w **mln EUR gry**, rocznie. Dwie kolumny udziału mówią, ile jeden zawodnik OVR 90
zjada z całorocznego przychodu najbogatszego i najuboższego klubu — to jest wielkość, którą
da się ocenić **bez modelu**, i jedyna niezależna informacja, jakiej agregat nie zawiera.

Kolumny APE są tu **konsekwencją, nie celem**: pokazują, co dane nachylenie kosztuje po
stronie klubowej, skoro kryteria §4 i tak są nieosiągalne (sekcja wyżej).

**Narzędzie nie wybiera wiersza.**

### Rozjazd z wcześniejszym przepisem na krzywą płac

Ten dokument mówi wprost: „Wykładnik 8,5 trzeba **obniżyć** (stromsza krzywa), a bazę
**podnieść**". Dopasowanie zrobiło **odwrotnie w obu parametrach** i jest to wynik, nie
usterka — ale czytelnik speka spodziewa się krzywej stromszej, więc rozjazd musi tu stać.

Nachylenie: **8,5 → 14,53** (wyższe znaczy **płaszej**).

| OVR | dziś | kandydat |
| ---: | ---: | ---: |
| 60 | 0,084 | 0,064 |
| 70 | 0,271 | 0,128 |
| 80 | 0,878 | 0,254 |
| 90 | 2,848 | 0,506 |

Rozpiętość płac OVR 60→90 spada z **34,1×** na **7,9×**.

Dwie przyczyny, obie sprawdzalne, żadna nie unieważnia dopasowania:

1. **Diagnoza „3× za płasko" mieszała jednostki.** Cel Legii 16,74 mln € w tamtej tabeli
   to `71,96 mln PLN / 4,30`, czyli **realne** euro; kolumna „dziś w grze" była w **starych
   euro gry**. Wspólny błąd jednostki nie tłumaczy jednak rosnącej krotności (Legia 2,9×,
   Puszcza 1,8×, Stal 1,1×), więc sam kierunek tamtej diagnozy nie jest tym obalony.
2. **Diagnoza jest starsza od dzisiejszego generatora kadr.** Powstała przy `sila`,
   a `formationTargetOvr` ściska dziś projektowane kadry do wąskiego pasma OVR. To ta sama
   kompresja, która stoi za niewykonalnością kryteriów: krzywa stromsza rozjeżdżałaby
   kluby o podobnych ocenach i różnych przychodach jeszcze mocniej, nie słabiej.

**Wcześniejszy przepis został wycofany 2026-09-09** — jawną adnotacją w tamtym
dokumencie, nie po cichu. Tabela krotności zostaje tam jako zapis obserwacji z tamtego
momentu; obowiązuje wynik z tego raportu.

### Oba modele obok siebie

Różnica poziomów: **16,70%** — **materialna: modeli nie wolno mieszać**.

Spek §6 od 2026-09-09 wskazuje **model generatora** jako kontrakt prognozy i płac.
Projekcja ekranowa pozostaje diagnostyką historycznego uproszczenia.

## Skala pieniądza i drabinka

Kandydat wyprowadzony z tożsamości: `surplus = recurring − fittedPayroll +
pool × (19 − forecastPlace) / 171`, `D = mediana(surplus) / KOSZTY_STALE`.

Pula manifestowa: **55,13 mln PLN**. `KOSZTY_STALE` = **1,10** — wejście, nie pokrętło.

| wielkość | kandydat |
| --- | ---: |
| D (PLN na 1 mln EUR gry) | 17,19 mln |
| `LEAGUE_PRIZE_RATE` | 0,0188 |
| `WAGE_AT_PIVOT` | 0,1278 |
| `wageSlope` | 14,5253 |
| mediana nadwyżki | 18,91 mln PLN |

D **nie jest kursem walutowym**: ceny transferowe są zakotwiczone w realnych mln EUR
i przechodzą do jednostki gry 1:1.

**To przybliżenie startowe, nie dowód spełnienia §12.2.** Tam kryterium brzmi:
mediana klubowych median bilansów pełnych karier `finance-control` w granicach 0,25 mln
od zera. Rozwój, spadki i zmiana składu ligi nie znikają od rozwiązania tej tożsamości.

| klub | przychód | płace | drabinka | bilans po kosztach stałych |
| --- | ---: | ---: | ---: | ---: |
| Legia | 8,57 | 1,96 | 0,28 | 5,79 |
| Lech | 5,96 | 2,48 | 0,34 | 2,72 |
| Pogoń | 4,04 | 1,60 | 0,24 | 1,59 |
| Raków | 3,55 | 1,93 | 0,32 | 0,84 |
| Jagiellonia | 3,08 | 1,53 | 0,21 | 0,65 |
| Widzew | 3,20 | 2,01 | 0,30 | 0,39 |
| Wisła K. | 2,60 | 1,32 | 0,11 | 0,29 |
| Zagłębie | 2,60 | 1,41 | 0,09 | 0,18 |
| Śląsk | 2,21 | 1,15 | 0,04 | 0,00 |
| Cracovia | 2,63 | 1,76 | 0,23 | −0,00 |
| Motor | 2,20 | 1,39 | 0,15 | −0,14 |
| Górnik | 2,42 | 1,83 | 0,26 | −0,24 |
| Piast | 1,85 | 1,14 | 0,06 | −0,34 |
| GKS | 1,56 | 1,45 | 0,17 | −0,82 |
| Radomiak | 1,28 | 1,08 | 0,02 | −0,89 |
| Korona | 1,45 | 1,48 | 0,19 | −0,95 |
| Wieczysta | 1,05 | 1,20 | 0,08 | −1,17 |
| Wisła P. | 0,86 | 1,45 | 0,13 | −1,56 |

Kwoty w tej tabeli są w **mln EUR gry**. Podpisane residua klubów strukturalnie
deficytowych i nadwyżkowych **mają zostać widoczne**, a nie być kasowane poprawką.

Prognozowane miejsca (z `expectedPlace`, semantyka silnika — remisy dają to samo miejsce,
więc zbiór nie musi być permutacją 1–18):

Legia: 4 · Lech: 1 · Raków: 2 · Jagiellonia: 8 · Pogoń: 6 · Górnik: 5 · Cracovia: 7 · Widzew: 3 · Śląsk: 17 · Piast: 16 · Radomiak: 18 · Korona: 9 · Motor: 11 · Zagłębie: 14 · Wisła K.: 13 · Wieczysta: 15 · GKS: 10 · Wisła P.: 12

## Budżety i grywalność

Udział bazowy **0,18**, maksimum **0,30** — oba są **założeniami speka**.
Manifest nie ma pola `sourceBudgetShare`; brakujące udziały obsługuje lokalny adapter,
a nie nowe pole w manifeście.

Wyjątek właścicielski: percentyl **0,80** bazowych budżetów grywalnej
osiemnastki, liczony **przed** podstawieniem, żeby wyjątek nie zapętlał się przez własny wynik.

| klub | przychód | budżet bazowy | budżet | wyjątek |
| --- | ---: | ---: | ---: | --- |
| Legia | 8,57 | 1,54 | 1,54 | — |
| Lech | 5,96 | 1,07 | 1,07 | — |
| Raków | 3,55 | 0,64 | 0,64 | — |
| Jagiellonia | 3,08 | 0,55 | 0,55 | — |
| Pogoń | 4,04 | 0,73 | 0,73 | — |
| Górnik | 2,42 | 0,44 | 0,44 | — |
| Cracovia | 2,63 | 0,47 | 0,47 | — |
| Widzew | 3,20 | 0,58 | 0,58 | — |
| Śląsk | 2,21 | 0,40 | 0,40 | — |
| Piast | 1,85 | 0,33 | 0,33 | — |
| Radomiak | 1,28 | 0,23 | 0,23 | — |
| Korona | 1,45 | 0,26 | 0,26 | — |
| Motor | 2,20 | 0,40 | 0,40 | — |
| Zagłębie | 2,60 | 0,47 | 0,47 | — |
| Wisła K. | 2,60 | 0,47 | 0,47 | — |
| Wieczysta | 1,05 | 0,19 | 0,61 | tak |
| GKS | 1,56 | 0,28 | 0,28 | — |
| Wisła P. | 0,86 | 0,15 | 0,15 | — |

Kohorta wyceniona krzywą 3a i nową płacą: **896782** obserwacji, z `scripts/data/finance-baseline-2026-09-07/signings.csv.gz` (sha256 rozpakowanych bajtów 6d7bc82be672039a3af5ee1d7d3c7f66612e0f4274acc0d82fe4099bded1ba05).
Mediana odstępnego: **0,640**, mediana płacy rocznej: **0,085**,
**mediana kosztu pierwszego roku: 0,714** — liczona jako mediana sum
`fee + annualWage` per zawodnik, nie jako suma dwóch median (ta wynosi 0,725).

Kohorta pochodzi z **podpisanych kart `KUPNO`**, nie z pełnego zbioru ofert. Karta
odrzucona przez politykę albo przez limit obsady nie zostawia wiersza, więc rozkład
jest warunkowany dwoma filtrami. Wyniki są w tym sensie **warunkowe**.

Kwartyle OVR kohorty `KUPNO`: 59 / 64 / 68, kwartyle wieku: 18 / 20 / 25. Polityk bez ani jednego zakupu: 2 (veteranOnly, veteranOnlyBuy).

Historyczne mediany `KUPNO` 0,32 / 0,134 z notatki bazowej są **kolumną historyczną**
starej ekonomii, nie celem ani punktem odniesienia dla liczb wyżej.

**Niedostępność ma dwa źródła, nie jedno.** Zestawienie ze starą ekonomią pokazuje, że
cena karty i budżet klubu ruszyły się w przeciwne strony:

| wielkość | stara ekonomia | kandydat | zmiana |
| --- | ---: | ---: | ---: |
| mediana odstępnego `KUPNO` | 0,320 | 0,640 | **×2,00** |
| mediana płacy rocznej | 0,134 | 0,085 | ×0,63 |
| koszt pierwszego roku | 0,454 | 0,714 | **×1,57** |

Odstępne rośnie przez **krzywą wartości z kroku 3a**, a budżety maleją przez **skalę
pieniądza z tego kroku**. Obie zmiany działają w tę samą stronę, a wszystkie trzy warianty
naprawy niżej (udział, podłoga bezwzględna, koszty stałe) siedzą wyłącznie po stronie
budżetu. **Druga połowa problemu jest w cenie** i naprawa po jednej stronie strojona pod
dzisiejszą medianę odstępnego stroi się pod liczbę, którą wyprodukował krok 3a.

Zestawienie jest **orientacyjne**: bazuje na tej samej kohorcie podpisań, ale nowe ceny
są kontrfaktyczne, z medianowym modyfikatorem i neutralnym rynkiem. Stary koszt pierwszego
roku jest sumą osobnych median, nie medianą sum. To nie jest sparowany pomiar kosztu.

| klub | budżet | grywalny | wymagany udział | brakuje |
| --- | ---: | --- | ---: | ---: |
| Legia | 1,54 | tak | 0,083 | 0,00 |
| Lech | 1,07 | tak | 0,120 | 0,00 |
| Raków | 0,64 | **nie** | 0,201 | 0,08 |
| Jagiellonia | 0,55 | **nie** | 0,232 | 0,16 |
| Pogoń | 0,73 | tak | 0,177 | 0,00 |
| Górnik | 0,44 | **nie** | 0,295 | 0,28 |
| Cracovia | 0,47 | **nie** | 0,272 | 0,24 |
| Widzew | 0,58 | **nie** | 0,223 | 0,14 |
| Śląsk | 0,40 | **nie** | 0,323 | 0,32 |
| Piast | 0,33 | **nie** | 0,387 | 0,38 |
| Radomiak | 0,23 | **nie** | 0,559 | 0,48 |
| Korona | 0,26 | **nie** | 0,494 | 0,45 |
| Motor | 0,40 | **nie** | 0,324 | 0,32 |
| Zagłębie | 0,47 | **nie** | 0,274 | 0,25 |
| Wisła K. | 0,47 | **nie** | 0,275 | 0,25 |
| Wieczysta | 0,61 | **nie** | 0,682 | 0,10 |
| GKS | 0,28 | **nie** | 0,457 | 0,43 |
| Wisła P. | 0,15 | **nie** | 0,832 | 0,56 |

Warianty polityki budżetowej. Udział i podłoga zawodzą **inaczej**, i to jest powód,
żeby stały obok siebie: udział podnosi wszystkich proporcjonalnie i zostawia najuboższego
najuboższym, a podłoga bezwzględna podnosi wyłącznie tych poniżej niej — za cenę udziału
przekraczającego `MAX_BUDGET_SHARE`, które spek ustawił jako sufit.

**Żaden z tych wariantów nie rusza przychodu ani `D`.** Zmieniają tylko regułę budżetu
startowego, więc nie unieważniają skali ani drabinki.

| wariant | udział min. | podłoga | grywalnych | podniesionych | maks. udział | ponad sufit | dodany budżet |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| dziś: udział 0,18, bez podłogi | 0,18 | 0,000 | 3 / 18 | 0 | 18,0% | nie | 0,00 |
| udział podniesiony do maksimum speka | 0,30 | 0,000 | 11 / 18 | 18 | 30,0% | nie | 6,42 |
| podłoga = medianowy koszt pierwszego roku | 0,18 | 0,714 | 18 / 18 | 15 | 83,2% | **tak** | 4,43 |
| podłoga = medianowe odstępne | 0,18 | 0,640 | 3 / 18 | 15 | 74,6% | **tak** | 3,32 |

„Dodany budżet" jest sumą po całej osiemnastce, w mln EUR gry. „Maks. udział" liczy się
z przychodu klubu **po** zastosowaniu podłogi i **z pominięciem wyjątku właścicielskiego**,
który stoi ponad sufitem z definicji (Wieczysta, percentyl 0.8). Kolumna
„ponad sufit" mówi więc, czy **sam wariant** łamie `MAX_BUDGET_SHARE = 0.3`,
a nie czy łamie go wyjątek, który spek już dopuścił.

Warianty kosztów stałych (każdy **ponownie wyprowadza D**, nie tylko obniża wydatek):

| KOSZTY_STALE | D (mln PLN) | WAGE_AT_PIVOT | LEAGUE_PRIZE_RATE | klubów grywalnych |
| ---: | ---: | ---: | ---: | ---: |
| 1,10 | 17,19 | 0,1278 | 0,0188 | 3 / 18 |
| 0,90 | 21,01 | 0,1045 | 0,0153 | 2 / 18 |
| 0,75 | 25,21 | 0,0871 | 0,0128 | 2 / 18 |
| 0,60 | 31,51 | 0,0697 | 0,0102 | 1 / 18 |

**Narzędzie nie wybiera wariantu i nie zmienia speka.**

Krajowa zdolność nabywcza: `min(5,50, recurring / D × 0,20)`, oferta przed targowaniem
= zdolność / 1,20. Klubów, dla których limit 5,50 faktycznie wiąże: **0** z 36.
Nieaktywny limit jest **diagnostyką**, nie błędem wymagającym podniesienia przychodu.

| klub | zdolność | oferta przed targiem | limit wiąże |
| --- | ---: | ---: | --- |
| Legia | 1,714 | 1,428 | — |
| Lech | 1,193 | 0,994 | — |
| Pogoń | 0,809 | 0,674 | — |
| Raków | 0,709 | 0,591 | — |
| Widzew | 0,641 | 0,534 | — |
| Jagiellonia | 0,615 | 0,513 | — |
| Cracovia | 0,526 | 0,438 | — |
| Zagłębie | 0,520 | 0,433 | — |
| Wisła K. | 0,520 | 0,433 | — |
| Górnik | 0,484 | 0,404 | — |
| Śląsk | 0,442 | 0,369 | — |
| Motor | 0,440 | 0,367 | — |
| Piast | 0,369 | 0,308 | — |
| Lechia | 0,363 | 0,303 | — |
| GKS | 0,313 | 0,261 | — |
| Stal R. | 0,301 | 0,251 | — |
| Korona | 0,289 | 0,241 | — |
| Miedź | 0,280 | 0,233 | — |
| Ruch | 0,274 | 0,228 | — |
| ŁKS | 0,261 | 0,217 | — |
| Radomiak | 0,255 | 0,213 | — |
| Stal M. | 0,241 | 0,201 | — |
| Wieczysta | 0,209 | 0,175 | — |
| Puszcza | 0,173 | 0,145 | — |
| Wisła P. | 0,172 | 0,143 | — |
| Arka | 0,166 | 0,138 | — |
| Odra | 0,161 | 0,134 | — |
| Nieciecza | 0,160 | 0,134 | — |
| Warta | 0,154 | 0,129 | — |
| Podbeskidzie | 0,119 | 0,099 | — |
| Pogoń S. | 0,117 | 0,097 | — |
| Chrobry | 0,115 | 0,096 | — |
| Polonia W. | 0,113 | 0,094 | — |
| Polonia B. | 0,105 | 0,087 | — |
| Pogoń G. | 0,058 | 0,048 | — |
| Unia | 0,029 | 0,024 | — |

## Krzywa wartości (krok 3a)

Parametry uzyskane ponownie z `bestFit(feasibleJointSets(SEARCH_RANGE))`, nie przepisane.
Zgodność z przypiętym raportem: **tak**.
Wersja narzędzia 3a: 1.0.0.

## Premia za podpis (`WOLNY`)

Dump: `scripts/data/finance-baseline-2026-09-07/signings.csv.gz`, sha256 rozpakowanych bajtów **6d7bc82be672039a3af5ee1d7d3c7f66612e0f4274acc0d82fe4099bded1ba05**,
wierszy w dumpie: 1356714, obserwacji `WOLNY`: **320597**.

**To są podpisania, nie oferty.** Selekcja jest widoczna i istotna:

- polityki, które nie podpisały ani jednego wolnego agenta: **5** (youngOnly, primeOnly, youngOnlyBuy, primeOnlyBuy, youngBuySellAlways)
- rozkład po sezonach: 1: 95217, 2: 68198, 3: 58716, 4: 51472, 5: 46994 — malejący, bo krótsze kariery kończą się wcześniej
- kwartyle OVR: 71 / 74 / 77, kwartyle wieku: 31 / 32 / 33

Karty odrzucone przez limit obsady nie zostawiają wiersza, więc rozkład jest
warunkowany **dwoma** filtrami: polityką i pojemnością kadry. Liczba 320597 i mediany
74/32 z notatki bazowej są tym samym pomiarem, nie dowodem braku selekcji.

| polityka | podpisań |
| --- | ---: |
| veteranOnly | 58647 |
| veteranOnlyBuy | 58370 |
| alwaysTake | 53045 |
| stallThenTake | 46603 |
| alwaysHaggle | 35644 |
| depthFirst | 30236 |
| mixed | 28334 |
| analystEdgeBuy | 9718 |

Odniesienie: **medianowe odstępne za zawodnika o tym samym OVR, wieku i pozycji**,
liczone krzywą 3a razy medianowy modyfikator ceny `KUPNO` (**1,20**, mediana
`U(0,9; 1,5)`) i neutralny stan rynku. `marketValue` **nie jest** medianą odstępnego —
jest nią dopiero po przemnożeniu przez ten modyfikator.

| wielkość | wartość |
| --- | ---: |
| mediana odstępnego referencyjnego | 0,848 |
| mediana płacy bazowej | 0,168 |
| mediana `unitShare` = 2×płaca/odstępne | 0,3906 |
| kandydat przy dopasowaniu **referencyjnym** | 2,2799 |
| ten sam fit z równą wagą klubów | 2,2799 |
| nadpłata przez dwa sezony / odstępne | 0,500 |
| w paśmie 0,40–0,60 speka | tak |

Diagnostyka bez progu: przez pięć sezonów nadpłata wynosi 1,250
odstępnego. Horyzont dopasowania to **dwa sezony**, nie koniec kadencji.

**Premia < 2 nie wynika z tego kryterium.** Dwukrotna płaca nie znaczy nadpłaty równej
odstępnemu, więc żaden limit nie jest tu nakładany ani wynik przycinany.

**Liczba wyżej jest dopasowana przy nachyleniu referencyjnym i nie wolno jej wziąć
do aktywacji razem z innym nachyleniem.** `unitShare` to dwa sezony płacy wobec
odstępnego zakotwiczonego w realnych euro — odstępne nie drga, płaca jedzie po
krzywej, więc premia należy do tej krzywej, na której ją dopasowano. Wartość dla
każdego rozważanego nachylenia stoi w ostatniej kolumnie tabeli opcji A;
**stałą do aktywacji bierze się stamtąd, nie stąd.**

## Jednostka dziedzictwa

Agregacja: `pooledMedian` — krok 4 musi użyć **tej samej** definicji.

| dump | plik | sha256 rozpakowanych bajtów | wiersze | tryb przychodu |
| --- | --- | --- | ---: | --- |
| control | `scripts/data/finance-baseline-2026-09-07/control.csv` | `ee250dc96a44229eb5a8b032ceb64be0dba107c6571cd74a9badfdf987151efd` | 18000 | finance-control |
| active | `scripts/data/finance-baseline-2026-09-07/active.csv` | `69e7cc611394c4cb52467735ce8b17c117aec91dbfeff4f378f51ddd501085ec` | 234000 | normal |

| składnik | przebieg | mediana surowa | × stała historyczna | iloczyn |
| --- | --- | ---: | ---: | ---: |
| `kasa` | finance-control | 3.31 | 5 | 16.55 |
| `wartoscKadryMoj` | aktywny | 1.9932376574242872 | 2 | 3.9864753148485743 |

Iloczyn wartości kadry to **dwa razy mediana surowa**, nie `2 × 1,99`. 1,99 jest
zaokrągleniem prezentacyjnym; odbudowanie iloczynu z niego dałoby 3,98 i zmieniłoby
jednostkę, którą krok 4 ma zachować.

Procedura kroku 4: sparować przebieg **tego samego typu i tych samych ziaren**, policzyć
nową medianę i wziąć `nowa stała = iloczyn historyczny / nowa mediana`. Przy medianie
zerowej, ujemnej lub niestabilnej **nie wolno dzielić mechanicznie** — należy zgłosić brak
sensownej konwersji. Progi tolerancji czyta się ze speka (§5.2: ±5% dla mediany ligowej,
plus tolerancja bezwzględna w punktach dla klubów blisko zera).

## Wrażliwość

Europejskie korekty oznaczone `estimated`. Zmieniają wyłącznie **bazę powtarzalną**;
cel dopasowania płac czyta przychód **ogółem** i pozostaje nietknięty.

| klub | korekta niska | korekta wysoka | baza przy niskiej | baza przy wysokiej | D przy niskiej | D przy wysokiej |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Śląsk | 6,80 | 7,70 | 38,92 | 38,02 | 17,60 | 17,19 |
| Wisła K. | 5,30 | 6,60 | 44,65 | 43,35 | 17,19 | 17,19 |

Miejsc historycznych z różnych szczebli nie składano w jedną sztuczną tabelę.

## Decyzje wymagane przed krokiem 4

- **Rozstrzygnięte 2026-09-09** decyzją właściciela produktu: kryteria płac §4 zastąpione opcją A z nachyleniem 12,00. Narzędzie nadal raportuje samą wykonalność i nie wybiera wiersza — tabela opcji A wyżej jest dowodem, wobec którego ta decyzja zapadła.
- **Rozstrzygnięte 2026-09-09** (ten sam dokument): grywalność budżetów naprawia podłoga bezwzględna 0,75 mln EUR gry, jako jawny wyjątek od `MAX_BUDGET_SHARE`. Wariant kosztów stałych odrzucony — jako jedyny wyprowadza `D` od nowa i przesuwa całą skalę.
- **Otwarte:** krok 4 musi przemierzyć skalę pieniądza na pełnych karierach `finance-control`. Tożsamość rozwiązana tutaj centruje medianę jednorocznej nadwyżki i jest przybliżeniem startowym, nie kryterium §12.2.
- **Otwarte:** kryteria §4 trzeba przepisać w speku razem z aktywacją. Dziś spek nadal podaje medianę ≤ 15% i maksimum ≤ 30%, oznaczone jako nieosiągalne.
