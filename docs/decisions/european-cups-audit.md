# Audyt modelu europejskich pucharów — 2026-09-02

Metoda i dowody stojące za stałymi w `EUROPEAN_ADVANCE_ODDS`; ten plik odpowiada na pytanie **skąd wiadomo**.

Audyt read-only: żadna stała balansowa nie została zmieniona przy jego wykonywaniu. Tabele analityczne policzono pierwotnie w skrypcie poza repozytorium, na stałych przepisanych z `src/data/balance.ts`.

**Rozdział 9 jest wdrożony (2026-09-02).** Narzędzie `pnpm audit:european-cups` istnieje, wszystkie jego progi wewnętrzne są zielone, a przebieg bazowy odtworzył każdą liczbę z rozdziałów 3, 4 i 6 tego dokumentu. Od tej chwili tabele niżej są reprodukowalnym artefaktem, nie zrzutem z narzędzia poza repozytorium. Wyniki przebiegu i pierwsza zmierzona kotwica osi siły: rozdział 11.

**Stan stałych po zamknięciu audytu:** przez rozdziały 9–12 `EUROPEAN_ADVANCE_ODDS` pozostawało nietknięte, a wszystkie pomiary niżej wykonano na wartościach sprzed zmiany. **2026-09-02, już po tych pomiarach, właściciel produktu obniżył `LK.pQualifyBase` z 0,70 na 0,31** (rozdział 12). `pQualifySlope` i `pKnockout*` bez zmian.

**Zastępuje usunięty `docs/puchary.md`**, który był nieśledzonym zrzutem terminala z połamanymi tabelami i błędną metodą — powody w rozdziale 2.

---

## Werdykt: BRAK DANYCH DO ZMIANY STAŁYCH

Obecny przedział `pQualify` dla LK (`0,70–0,95`) wygląda wysoko na tle dwóch dostępnych zewnętrznych projekcji (`0,189` i `0,457`). To jest przesłanka do audytu, ale nie dowód wystarczający do zmiany balansu.

Porównanie nie jest niezależne od założeń:

- wartości `0,189` i `0,457` są projekcjami, nie obserwowanymi częstościami;
- dotyczą konkretnych klubów i ścieżek, których nie zmapowano na skalę `strength` gry;
- dwa punkty z jednego cyklu nie wyznaczają ani krańców populacji, ani nachylenia modelu;
- agregat gry nie odwzorowuje liczby rund osobno dla każdego miejsca.

Na dziś poprawna decyzja brzmi: **nie zmieniać stałych na podstawie tego dokumentu**. Najpierw trzeba przypiąć źródła i definicje zdarzeń, zbudować reprodukowalny audyt, ustalić referencyjną szansę przeciętnej kadry Ekstraklasy oraz — do kalibracji nachylenia — określić mapowanie realnej siły klubów na `strength`. Rozdział 4 pokazuje wyłącznie analizę wrażliwości dwóch hipotetycznych wariantów.

Osobne ustalenie jest rozstrzygnięte: pula miejsc dla sezonu gry 2026/27, przydzielana na rozgrywki UEFA 2027/28, to **`2 × LM`, `2 × LE`, `1 × LK`**. Audyt prawdopodobieństw nie podważa `BERTHS`.

---

## 1. Weryfikacja źródeł — access lista 2027/28

**Status: częściowo oficjalna, w istotnej części nieopublikowana.** Od tego zależy ważność każdego celu kalibracji.

| ustalenie | źródło | data dostępu | czego dowodzi |
| --- | --- | --- | --- |
| Ekstraklasa 2026/27: miejsca 1–2 → LM, 3. → LE, 4. → LK; zdobywca Pucharu Polski → LE | [oficjalna tabela Ekstraklasy 2026/27](https://ekstraklasa.org/tabela/2026-2027/) | 2026-09-02 | docelowa pula `2 LM / 2 LE / 1 LK` dla gry opisującej sezon 2026/27 |
| Polska **12.** miejsce, współczynnik **46,750** (sezony 2021/22–2025/26) | [2027–28 UEFA Champions League, Wikipedia](https://en.wikipedia.org/wiki/2027%E2%80%9328_UEFA_Champions_League) | 2026-09-02 | pozycja rankingowa rządząca pulą miejsc 2027/28 |
| Mistrz → **runda play-off** LM (ścieżka mistrzowska); wicemistrz → **II runda el.** (ścieżka ligowa) | jw. | 2026-09-02 | rundy wejścia dla dwóch miejsc LM; strona sama określa listę jako prowizoryczną |
| Zdobywca pucharu ze związków **8–12** → **runda play-off** LE | [2027–28 UEFA Europa League, Wikipedia](https://en.wikipedia.org/wiki/2027%E2%80%9328_UEFA_Europa_League) | 2026-09-02 | runda wejścia miejsca pucharowego |
| **4. miejsce** ze związków 7–15 → **II runda el.** LK | [2027–28 UEFA Conference League, Wikipedia](https://en.wikipedia.org/wiki/2027%E2%80%9328_UEFA_Conference_League) | 2026-09-02 | runda wejścia jedynego miejsca LK |
| Access lista **2026/27**: Polska 15., podział **2 LM / 1 LE / 2 LK** | [euroranking.net/en/access-list](https://euroranking.net/en/access-list/) | 2026-09-02 | cykl, z którego pochodzi zrzut zewnętrznej symulacji kwalifikacji |
| Uczestnicy 2026/27: Lech, Górnik, Jagiellonia, Raków, GKS Katowice | wyszukiwanie + zrzut zewnętrznej symulacji | 2026-09-02 | tożsamość pięciu klubów ze zrzutu |
| Annex A dla 2027/28 **nie jest opublikowany** — portal UEFA ma tylko [2026/27](https://documents.uefa.com/r/Regulations-of-the-UEFA-Champions-League-2026/27/Annex-A-Access-List-for-the-2026/27-UEFA-Club-Competitions-Online) | documents.uefa.com | 2026-09-02 | brak źródła pierwotnego dla docelowego cyklu |
| `kassiesa.net/uefa/qual2027.html` | — | 2026-09-02 | **HTTP 403**, niedostępne |

**Czego nie udało się potwierdzić:** rundy wejścia dla **3. miejsca** w LE. Wiadomo, że związki 1–12 mają dwa miejsca w LE, więc drugie miejsce LE dla Polski przy 12. pozycji jest spójne z `BERTHS`. Sama runda pozostaje nieustalona.

### Konsekwencja: ścieżki różnią się liczbą rund, i to radykalnie

| miejsce | 2026/27 (obrazek) | 2027/28 (gra) | rund do fazy ligowej |
| --- | --- | --- | ---: |
| mistrz | LM Q2 | **LM play-off** | 3 → **1** |
| wicemistrz | LM Q2 | LM Q2 | 3 |
| zdobywca pucharu | LE Q3 | **LE play-off** | 2 → **1** |
| 3. miejsce | LK Q2 | LE (runda nieznana) | 3 → ≤2 |
| 4. miejsce | LK Q2 | **LK Q2** | 3 → **3** |

**To jedyny wiersz, który przenosi się między cyklami bez zmian: czwarte miejsce, LK, II runda eliminacji.** Wszystkie pozostałe wejścia zmieniły rundę, a mistrz przeszedł z trzyrundowego sita na jeden dwumecz z siatką bezpieczeństwa — przegrany play-off LM 2027/28 wpada prosto do **fazy ligowej LE**, nie do jej eliminacji.

Kaskada w grze (`LM → LE → LK`, każdorazowo od zagregowanego etapu `qualifying`) jest abstrakcją bliższą ścieżkom 2026/27 niż 2027/28, ale nie modeluje wiernie rund żadnego cyklu. Nie proponuję jej zmieniać — rozróżnienie mistrza i wicemistrza wymagałoby osobnych typów miejsc i naruszałoby zasadę jednego zagregowanego rozstrzygnięcia. Trzeba ją opisywać jako świadome uproszczenie, nie jako odwzorowanie konkretnej access listy.

---

## 2. Ocena usuniętego `docs/puchary.md` — nie używać jako źródła kalibracji

Dokument jest **nieśledzonym przez git zrzutem terminala** bez metody, ziarna, skryptu i daty. Ma widocznie połamane tabele: wiersz `Górnik` w drugiej tabeli zgubił dwie kolumny, a `Katowice` ma `0,83` w kolumnie `×` należącej do LS. Zdania są ucięte w połowie („liczba w balance-match-engine.md:91 yżona", „gra ma trzy etapy… s R16. To świadomy kształt modelu, nieusterka"). Sam ten stan dyskwalifikuje go jako artefakt kalibracyjny — nie da się odtworzyć tego, czego nie da się przeczytać.

Trzy błędy merytoryczne, każdy niezależnie wystarczający, żeby odrzucić wyprowadzone z niego parametry. Zawarte tam projekcje można zachować wyłącznie jako słaby sygnał, że obecny model warto zbadać; nie tworzą progu akceptacji.

### (a) Nieporównywalna pula miejsc

Wiersze `Raków | LK` i `Katowice | LK` to 3. i 4. miejsce związku o **dwóch** miejscach w LK. Gra ma **jedno**, dla 4. miejsca. Dopasowanie dwóch parametrów do klubu, który w docelowym cyklu grałby w LE, jest dopasowaniem do innej populacji.

### (b) Oś siły jest zmyślona

Kolumna `siła` — Lech 73,8, Górnik 66,1, Jagiellonia 68,3, Raków 68,3, Katowice 62,8 — to **mediany i maksima poziomów trudności gry**, przypisane realnym klubom bez żadnego uzasadnienia. Cały fit stoi na tym przypisaniu. Ile waży:

| siła Rakowa | siła Katowic | `pQualifyBase` | `pQualifySlope` | `pQualify` przy 80 |
| ---: | ---: | ---: | ---: | ---: |
| 68,3 | 62,8 | 0,151 | **0,875** | **1,026** |
| 70 | 62 | 0,189 | 0,602 | 0,791 |
| 70 | 64 | 0,100 | 0,802 | 0,902 |
| 68 | 64 | 0,056 | **1,203** | **1,259** |
| 66 | 62,5 | 0,151 | **1,375** | **1,526** |
| 74 | 62 | 0,189 | **0,401** | 0,591 |

Nachylenie waha się **od 0,40 do 1,38 — 3,4×** — przy przesunięciach o 2 punkty siły, których nic nie zabrania. Parametr jest **niezidentyfikowalny** z tych danych. Dwa punkty, dwie niewiadome, zerowe stopnie swobody: to nie jest dopasowanie, to rozwiązanie układu równań o dowolnie wybranych współczynnikach.

### (c) Kolumna `× R16` porównuje różne zdarzenia

Rozwinięte w rozdziale 5.

### Usterka odporności znaleziona przy okazji

`advanceProbabilities` (`src/logic/european-cups.ts`) klampuje wyłącznie `edge`, nie wynik. Cztery z sześciu fitów wyżej dają `pQualify > 1`, co przechodzi cicho — `r < pQualify` staje się zawsze prawdą. Dziś nieosiągalne (max `0,70 + 0,25 = 0,95`), ale każdy fit z nachyleniem powyżej `1 − base` przebija to bez ostrzeżenia. Wariant A (`0,15 + 0,80 = 0,95`) mieści się o włos.

---

## 3. Odtworzenie obecnego modelu

`pQualify` bezpośrednie:

| siła | LM | LE | LK |
| ---: | ---: | ---: | ---: |
| 62 | 25,0% | 55,0% | 70,0% |
| 65 | 32,5% | 60,8% | 74,2% |
| 68 | 40,0% | 66,7% | 78,3% |
| 70 | 45,0% | 70,6% | 81,1% |
| 74 | 55,0% | 78,3% | 86,7% |
| 77 | 62,5% | 84,2% | 90,8% |
| 80 | 70,0% | 90,0% | 95,0% |

Po kaskadzie — dowolna faza ligowa, faza knockout, oczekiwany przychód kampanii, oczekiwana liczba losowań:

| start | siła | faza ligowa | knockout | przychód | losowania |
| --- | ---: | ---: | ---: | ---: | ---: |
| LM | 62 | 89,9% | 22,3% | 2,82 | 2,087 |
| LM | 65 | 93,2% | 27,9% | 3,02 | 1,939 |
| LM | 68 | 95,7% | 33,6% | 3,22 | 1,800 |
| LM | 70 | 96,9% | 37,3% | 3,36 | 1,712 |
| LM | 74 | 98,7% | 44,5% | 3,65 | 1,547 |
| LM | 77 | 99,5% | 49,7% | 3,88 | 1,434 |
| LM | 80 | 99,8% | 54,7% | 4,12 | 1,330 |
| LE | 62 | 86,5% | 24,8% | 1,15 | 1,450 |
| LE | 65 | 89,9% | 31,4% | 1,18 | 1,392 |
| LE | 68 | 92,8% | 38,2% | 1,22 | 1,333 |
| LE | 70 | 94,4% | 42,8% | 1,24 | 1,294 |
| LE | 74 | 97,1% | 52,1% | 1,28 | 1,217 |
| LE | 77 | 98,5% | 58,9% | 1,31 | 1,158 |
| LE | 80 | 99,5% | 65,6% | 1,34 | 1,100 |
| LK | 62 | 70,0% | 24,5% | 0,68 | **1,000** |
| LK | 65 | 74,2% | 30,9% | 0,72 | **1,000** |
| LK | 68 | 78,3% | 37,9% | 0,76 | **1,000** |
| LK | 70 | 81,1% | 42,8% | 0,80 | **1,000** |
| LK | 74 | 86,7% | 53,4% | 0,86 | **1,000** |
| LK | 77 | 90,8% | 62,1% | 0,91 | **1,000** |
| LK | 80 | 95,0% | 71,2% | 0,96 | **1,000** |

---

## 4. Warianty eksploracyjne

Dwa warianty służą wyłącznie do pokazania wrażliwości modelu. Wariant A pochodzi z usuniętego `docs/puchary.md`; wariant B izoluje zmianę jednego parametru. Żaden nie jest rekomendacją wdrożeniową.

`pQualify` dla LK na tle dwóch zewnętrznych projekcji:

| siła | dziś | A: 0,15/0,80 | B: 0,20/0,25 | projekcje zewnętrzne |
| ---: | ---: | ---: | ---: | --- |
| 62 | 70,0% | 15,0% | 20,0% | 18,9% (Katowice) |
| 65 | 74,2% | 28,3% | 24,2% | |
| 68 | 78,3% | 41,7% | 28,3% | |
| 70 | 81,1% | 50,6% | 31,1% | |
| 74 | 86,7% | 68,3% | 36,7% | |
| 77 | 90,8% | 81,7% | 40,8% | |
| 80 | 95,0% | 95,0% | 45,0% | 45,7% (Raków) |

**Wariant A nie zmienia górnego końca.** `0,15 + 0,80 = 0,95` — dokładnie tyle co dziś przy sile 80. Obniża dół kosztem nachylenia 0,80, trzykrotnie większego niż w pozostałych rozgrywkach (`0,25–0,45`). Dostępne dane nie uzasadniają takiej krzywej.

**Wariant B zmienia jeden parametr.** `pQualifyBase 0,70 → 0,20`, a nachylenie zostawia na `0,25`. Przedział modelu (`0,20–0,45`) pokrywa się z dwiema dostępnymi projekcjami, ale to dopasowanie opisowe, nie walidacja.

Interpretacja parametrów:

- **`pQualifyBase = 0,20`** zakłada, że projekcja 18,9% dla Katowic reprezentuje przeciętną kadrę Ekstraklasy. Sama oś ma kotwicę: komentarz przy `advanceProbabilities` definiuje `edge = 0` jako przeciętną kadrę przy `strength = 62`. Brakuje wartości po drugiej stronie — wiarygodnego prawdopodobieństwa awansu przeciętnej kadry na porównywalnej ścieżce. Projekcja jednego klubu nie wypełnia tej luki bez wykazania, że klub jest reprezentatywny.
- **`pQualifySlope = 0,25`** zachowuje dzisiejsze nachylenie i ogranicza zakres eksperymentu, ale nie staje się przez to wartością potwierdzoną. Nachylenie pozostaje niezidentyfikowalne z dostępnych danych.
- **`pKnockoutBase` / `pKnockoutSlope`** pozostają poza zakresem obu wariantów. Powód w rozdziale 5: nie wiadomo, do którego realnego zdarzenia je porównać.

### Relacja prawdopodobieństw LM–LK

Wariant B zmienia także relację między rozgrywkami. Na całej siatce tej samej kadrze daje niższe `pQualify` w LK niż w LM:

| siła | LM dziś | LK dziś | LK wariant B |
| ---: | ---: | ---: | ---: |
| 62 | 25,0% | 70,0% | 20,0% |
| 80 | 70,0% | 95,0% | 45,0% |

Wariant A odwraca tę relację tylko przy sile 62 i 65; od siły 68 ponownie daje wyższe `pQualify` w LK niż w LM.

Niższe `pQualify` w LK niż w LM nie jest automatycznie błędem. Według prowizorycznej access listy mistrz Polski w cyklu 2027/28 ma krótszą drogę LM i siatkę bezpieczeństwa, podczas gdy miejsce LK zaczyna trzy rundy wcześniej. Gra przypisuje jednak LM zarówno mistrzowi, jak i wicemistrzowi i nie rozróżnia ich ścieżek. Przyjęcie wariantu B oznaczałoby więc świadomą akceptację agregatu, w którym eliminacje LM są łatwiejsze od LK dla obu miejsc LM. To założenie trzeba pokazać w audycie i rozstrzygnąć produktowo; nie należy zamieniać go w uniwersalny próg monotoniczności między rozgrywkami.

### Matematyczny wpływ obu wariantów na ścieżki LM i LE

Przez ogon kaskady, przy sile 62, faza ligowa w wariancie B spada z 89,9% na 73,0% dla startu w LM i z 86,5% na 64,0% dla startu w LE. Tabela pokazuje skalę sprzężenia przez kaskadę; nie jest porównaniem z rzeczywistą ścieżką konkretnego klubu.

| start | siła | LS dziś | LS A | LS B | KO dziś | KO A | KO B |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| LM | 62 | 89,9% | 71,3% | 73,0% | 22,3% | 15,8% | 16,4% |
| LM | 68 | 95,7% | 88,3% | 85,7% | 33,6% | 30,0% | 28,7% |
| LM | 74 | 98,7% | 96,9% | 93,8% | 44,5% | 43,4% | 41,5% |
| LM | 80 | 99,8% | 99,8% | 98,3% | 54,7% | 54,7% | 53,6% |
| LE | 62 | 86,5% | 61,8% | 64,0% | 24,8% | 16,1% | 16,9% |
| LE | 68 | 92,8% | 80,6% | 76,1% | 38,2% | 32,3% | 30,1% |
| LE | 74 | 97,1% | 93,1% | 86,3% | 52,1% | 49,6% | 45,4% |
| LE | 80 | 99,5% | 99,5% | 94,5% | 65,6% | 65,6% | 61,9% |

---

## 5. Semantyka etapu `knockout` — nierozstrzygnięta, i dlatego nie kalibrować

Gra ma trzy etapy: `qualifying` / `league` / `knockout`. Rzeczywistość od 2024/25 ma fazę ligową (36 drużyn) → miejsca 1–8 prosto do 1/8, miejsca 9–24 baraż → 1/8 → ćwierćfinał → półfinał → finał.

„Dotarcie do fazy pucharowej" może więc znaczyć **top 24** (wejście do fazy pucharowej łącznie z barażem) albo **1/8 finału**. Dla Lecha to 62,5% wobec 36,5% — różnica 26 punktów procentowych, czyli więcej niż cała rzekoma nadmiarowość.

Jedyna przesłanka wewnątrz repo to proporcja premii: `LM league 4,0 → knockout 5,6`, czyli **1,4×**. Repo **nie przypina żadnej realnej kwoty za etap pucharowy** — zrzut zewnętrznej symulacji podaje wyłącznie premie za fazę ligową (LM 18,6 / LE 4,31 / LK 3,17 mln €). Bez tej kwoty proporcji 1,4× nie da się skonfrontować z niczym.

Usunięty `docs/puchary.md` wybierał R16 i drukował kolumnę `×` tak, jakby to był pomiar. Był to wybór, nie wyprowadzenie, i nie został w dokumencie oznaczony jako wybór. **Dopóki nie zostanie przypięta realna premia za etap pucharowy i wykazane, które zdarzenie jej odpowiada, parametrów `pKnockout*` nie wolno kalibrować.**

---

## 6. Wpływ finansowy wariantu B

Oczekiwana premia kampanii (mln EUR na sezon), dziś → wariant B:

| start | siła 62 | siła 68 | siła 74 | siła 80 |
| --- | --- | --- | --- | --- |
| LM | 2,82 → 2,73 | 3,22 → 3,16 | 3,65 → 3,62 | 4,12 → 4,11 |
| LE | 1,15 → 1,03 | 1,22 → 1,12 | 1,28 → 1,21 | 1,34 → 1,30 |
| **LK** | **0,68 → 0,41** | **0,76 → 0,47** | **0,86 → 0,54** | **0,96 → 0,62** |

Ścieżki LM i LE tracą 0,01–0,12 mln — to wyłącznie ogon kaskady, bo ich własne parametry są nietknięte. Cały efekt siedzi na LK: **−0,27 do −0,34 mln na sezon**, czyli 35–40% premii tej ścieżki.

**Efekt oczekiwany, nie górne ograniczenie.** Wartość `0,34` mln jest największą różnicą wartości oczekiwanej na pokazanej siatce. Przy pięciu sezonach LK daje to `5 × 0,34 = 1,7` mln, czyli **8,5 punktu dziedzictwa** przez składnik `kasa × 5`. Nie jest to granica wyniku pojedynczej kariery.

Przy identycznym losowaniu bezpośrednia różnica nagrody za jedną nogę LK może wynieść do `0,8` mln (`knockout 1,1` zamiast `qualifying 0,3`), czyli do `4,0` mln i **20 punktów dziedzictwa** przez pięć sezonów LK. To ogranicza tylko bezpośrednią różnicę premii. Zmieniona kasa wpływa na ceny ofert i decyzje polityk, więc całkowitego efektu kariery nie da się ograniczyć tą prostą kalkulacją.

Nie należy przewidywać, że efekt na rozkład tytułów zniknie w szumie. Trzeba go zmierzyć według kryteriów z punktu 6 rozdziału 10, w tym sprawdzić zmianę udziału `kasa × 5` w dziedzictwie w obie strony. Epilog dziedziczy finanse pozostawione po sezonie 5, więc wpływ propaguje się na sezony 6–8.

---

## 7. RNG

`resolveEuropeanCampaign` kończy kaskadę na LK, bo `CASCADE.LK === null`. Liczba pobranych losowań zależy więc **wyłącznie od tego, czy klub odpadł w eliminacjach LM i LE** — wynik etapu LK nie wpływa na nic, bo po nim pętla i tak się kończy. Potwierdza to kolumna `losowania` w rozdziale 3: dla startu LK zawsze dokładnie **1,000**, niezależnie od siły.

**Zmiana wyłącznie parametrów LK nie zmienia liczby pobranych losowań w samej kampanii europejskiej.** Po jej zakończeniu kursor RNG pozostaje na tej samej pozycji.

To znaczy:

- **Golden traces mogą zmienić wartości pochodne** — etap LK, `money`, `kasa`, wartość kadry i dziedzictwo. Sam resolver pucharów nie przesuwa kursora względem wersji bazowej. Późniejsze gałęzie reduktora zależne od stanu nadal trzeba sprawdzić bezpośrednio.
- **`pnpm balance:compare` paruje wyniki po poziomie, polityce i seedzie, ale nie dowodzi zgodności strumieni RNG.** Wspólny seed pozostaje parą nawet wtedy, gdy przebiegi rozeszły się wewnątrz symulacji. Mniejsze `n` oznacza brak wiersza dla seeda w jednym z plików, na przykład przez wyjątek, a nie wykryty rozjazd kursora.
- **Polityki mogą rozdzielić przebiegi.** `offers.ts` przycina cenę karty KUPNO/PANIC do `kasa × PURCHASE_PRICE_CAP`, więc inna kasa może zmienić cenę, decyzję polityki i późniejsze zużycie RNG. Odsetek takich przebiegów wymaga osobnej telemetrii lub ledgera, którego obecny raport porównawczy nie zawiera.

Zmiana `pQualifyBase` dla LM albo LE mogłaby zmienić długość kaskady i liczbę losowań. Dlatego pierwszy eksperyment, jeśli dane uzasadnią zmianę, powinien dotyczyć wyłącznie parametrów LK. Nie przesądza to, że wariant B ma właściwe wartości.

---

## 8. Zgodność z zasadami projektu

| zasada | ocena |
| --- | --- |
| **Widoczność jako jedna liczba** | Spełniona bez zmian. Kampania to nadal jedna linijka wyniku i jedna kwota; prognoza HUD czyta `europeanExpectedIncome`, która jest wartością oczekiwaną tego samego modelu. Zmiana stałej nie dokłada graczowi niczego do śledzenia. |
| **Dylemat bez silnika** | Spełniona. Nie powstaje żaden system w tle — te same trzy etapy, ta sama jedna kaskada. |
| **Epilog dziedziczy klub** | Spełniona, i to jest właśnie kanał wpływu: mniejsza kasa po sezonie 5. przechodzi do sezonów 6–8 jako gorszy stan zastany, a nie jako korekta. |
| **Sekcja 8: zakaz faz grupowych, dwumeczów, rankingu UEFA** | Spełniona. Nie proponuje się symulowania rund ani drabinki. Rundy wejścia z rozdziału 1 służą wyłącznie do oceny, czy liczba w tabeli jest wiarygodna — nie wchodzą do kodu. Ranking krajowy pozostaje faktem o cyklu zapisanym w `BERTHS`, nie mechaniką. |

**Werdykt: PRZECHODZI.** Zmiana stałej w istniejącym modelu nie dodaje graczowi systemu ani informacji. Werdykt dotyczy rodzaju zmiany, nie wyboru wartości — ten pozostaje nierozstrzygnięty.

Jedno napięcie warte zgłoszenia właścicielowi produktu: `BERTHS` i kaskada są **zaszytymi faktami o cyklu UEFA**, a cykle się zmieniają. To nie łamie żadnej zasady, ale model powinien być jawnie opisany jako stabilna abstrakcja inspirowana określonym cyklem, nie jego wierna symulacja.

---

## 9. `pnpm audit:european-cups` — wdrożone 2026-09-02

Minimalne, odtwarzalne narzędzie. **Bez sieci** — access lista wchodzi jako przypięta stała z datą i źródłem, tak jak `MATCH_OUTCOME_REFERENCE`.

**Jak wdrożono.** `scripts/european-cups-audit.ts` (wejście CLI), `-cli.ts` (flagi, wydzielone, żeby test mógł je zaimportować bez uruchamiania `main()`), `-core.ts` (model analityczny, symulacja, progi), `-careers.ts` (**pomiar na pełnych karierach: kto gra w Europie i z jaką siłą**), `-report.ts` (raport markdown) i `-reference.ts` (przypięty materiał zewnętrzny). Warianty stałych żyją w `-core.ts`, więc `--variant A|B` mierzy kandydata **bez dotykania `src/data/balance.ts`**.

Trzy zmiany poza samym skryptem. Pierwsza: `advanceProbabilities` jest teraz eksportowane z `src/logic/european-cups.ts` — wyłącznie do pomiaru, bo kontraktu `[0, 1]` na **wyniku** nie da się zobaczyć przez wylosowany etap (`r < pQualify` przy `pQualify > 1` jest po prostu zawsze prawdą). Druga: `tests/logic/european-cups.test.ts` dostał trzy przypadki zapowiedziane niżej.

Trzecia jest jedyną, która ruszyła golden mastera: **linia sezonu w śladzie niesie teraz `sila=`** — dokładną wartość `squadStrength`, którą `symulujRunde` policzyło dla rundy wiosennej i podało do tabeli, losowania Pucharu Polski i `resolveSeasonalEuropeanOutcome`. Bez niej audyt nie ma jak zobaczyć siły uczestnika pucharów inaczej niż przez proxy — a proxy było właśnie tym, co unieważniło pierwszą wersję rozdziału 11. Retrace dotknął 54 linii w 13 plikach i **każda różnica to dopisane `sila=`**; żadna wartość się nie zmieniła, żadne losowanie nie przesunęło.

Audyt buduje model **dwa razy**: analitycznie ze stałych i empirycznie przez losowania. Dla wariantu bazowego dokłada trzecie przejście prawdziwym `resolveEuropeanCampaign` na tych samych ziarnach i porównuje noga po nodze — bez tego lokalny bliźniak potrzebny wariantom mógłby po cichu odjechać od silnika. Liczba losowań jest **liczona licznikiem opinającym strumień RNG**, nie wyprowadzana ze wzoru, który jest badany.

**Wejścia:** `--runs N` (kampanie na komórkę, domyślnie 20000), `--seed`, `--md <plik>`, `--variant <nazwa>` (porównanie zestawów stałych bez edycji `balance.ts`), `--help`.

**Raportowane metryki**, dla siatki `strength ∈ {62,65,68,70,74,77,80} × start ∈ {LM,LE,LK}`:

1. `pQualify` i `pKnockout` bezpośrednie — analitycznie i empirycznie; rozbieżność wykrywa błąd implementacji.
2. Prawdopodobieństwo dotarcia do dowolnej fazy ligowej i do fazy pucharowej po kaskadzie.
3. Rozkład długości kampanii (1/2/3 nogi) i **średnia liczba pobranych losowań** — to jest kontrakt RNG.
4. Oczekiwany przychód kampanii, z rozbiciem na nogi.
5. Zestawienie z przypiętym `EUROPEAN_REFERENCE` — z rozróżnieniem wyniku historycznego, prognozy i szacunku modelowego oraz z dokładną definicją mierzonego zdarzenia. Dla `pQualifyBase` potrzebny jest punkt referencyjny przeciętnej kadry; dla `pQualifySlope` — seria porównywalnych punktów z jawnym mapowaniem na `strength`.
6. Relacje `pQualify` między LM, LE i LK przy tej samej sile — jako diagnostyka założeń każdego wariantu, bez automatycznego progu zaliczenia.

**Progi akceptacji:**

- `pQualify` i `pKnockout` w `[0, 1]` na całej siatce — łapie usterkę z rozdziału 2 (brak klampowania wyniku).
- Monotoniczność po sile dla obu wielkości i dla przychodu.
- Liczba losowań dla startu LK **równa dokładnie 1** — przypina ustalenie z rozdziału 7.
- Zgodność wartości analitycznych z empirycznymi w granicy błędu wynikającej z `--runs`.

Nie ma progu porównującego `pQualify` między LM, LE i LK. Każdy agregat obejmuje inną drogę do fazy ligowej, więc prestiż rozgrywek nie wyznacza automatycznie kolejności tych prawdopodobieństw. Projekcje `0,189` i `0,457` również nie są progami przejścia audytu.

**Testy** — rozszerzyć `tests/logic/european-cups.test.ts` o trzy przypadki, których dziś nie ma:

- wynik `advanceProbabilities` w `[0,1]` dla wszystkich trzech rozgrywek na krańcach siatki;
- niezmienność liczby losowań przy podmianie samych stałych LK;
- zgodność `europeanExpectedIncome` z empiryczną średnią `campaignMoney` przy dużym `n`.

---

## 10. Pełna lista weryfikacji przed decyzją i wdrożeniem

1. **`pnpm audit:european-cups`** (narzędzie z rozdziału 9) — przebieg bazowy i warianty, wszystkie wewnętrzne progi poprawności zielone; dane zewnętrzne raportowane bez automatycznego werdyktu.
2. **`pnpm test`** — jednostkowe plus golden headless plus parytet DOM.
3. **Analiza golden diff.** Spodziewane wyłącznie różnice wartości pochodnych przy niezmienionej sekwencji losowań. **Jeśli w diffie pojawi się zmiana liczby ruchów, kolejności ofert albo długości kariery, założenie z rozdziału 7 jest złamane i zmianę trzeba wstrzymać, a nie przenagrywać.** Dopiero po wyjaśnieniu każdej kategorii — `pnpm golden:retrace`.
4. **`pnpm balance --runs 1000 --dump-raw`** przed i po, tym samym zestawem ziaren, następnie `pnpm balance:compare -- --before <plik-before.csv> --after <plik-after.csv> --md <raport.md>`. Raport musi podać liczbę wspólnych seedów. `n` mniejsze od `--runs` oznacza brak wyniku w jednym z plików i wymaga zbadania, ale nie jest dowodem rozjazdu RNG.
5. **Bezpośrednia kontrola RNG** — test kursora albo ledger losowań dla tych samych seedów, co najmniej do pierwszej decyzji zależnej od zmienionej kasy. Tylko ten pomiar może potwierdzić, gdzie przebiegi przestają być sparowane.
6. **Kryteria akceptacji**: udział `kasa × 5` w medianie dziedzictwa nie zmienia się o więcej niż 5 p.p. w żadnej komórce; rozkład tytułów bez systematycznego przesunięcia; mediana rozegranych sezonów bez zmian.
7. **`pnpm test:e2e`** — Chromium i WebKit, bo prognoza HUD czyta `europeanExpectedIncome` i jej wartość widać na ekranie.
8. **`pnpm verify`** — pełna bramka, z pokryciem `src/logic` powyżej progów z `vite.config.ts`.
9. **Aktualizacja dokumentów dopiero z przyjętą zmianą**: notatka kalibracji silnika meczowego niesie nieprawdziwe „2,5–10×"; założenia projektowe przypinają tabelę premii; decyzja „stałe zostają bez zmian" z 2026-08-12 jest zapisana. Cofnięcie tej decyzji wymaga wyników audytu i pomiaru balansu, nie samej analizy wrażliwości.

---

## 11. Wyniki przebiegu bazowego — 2026-09-02

`pnpm audit:european-cups --md <raport.md>`, domyślne wejścia: 20 000 kampanii na komórkę siatki, 200 pełnych karier na komórkę `poziom × polityka`, 200 kadr startowych na klub, ziarno `0x4e057c01`, ok. 21 sekund ściany. Pełne tabele w raporcie; tu wnioski.

**Wszystkie pięć progów wewnętrznych zielone.** Zakres `[0, 1]`, monotoniczność po sile, jedno losowanie dla startu w LK w 100% przebiegów (min = max = 1), zgodność analityki z empirią w 21 komórkach i parytet z silnikiem noga po nodze. Przebieg odtworzył co do cyfry tabele z rozdziałów 3, 4 i 6 — w tym spadek przychodu ścieżki LK z `0,68` na `0,41` przy sile 62 w wariancie B. **Rozdziały te przechodzą więc z materiału audytowego do wyników reprodukowalnych.**

### Kto naprawdę gra w Europie — pomiar na pełnych karierach

**Pierwsza wersja tego rozdziału była błędna i została wycofana.** Utożsamiała czwartą najsilniejszą kadrę z klubem kończącym ligę na czwartym miejscu, mierzyła kadry startowe sezonu 1 i ważyła ławkę jak dla klubu bez pucharów. Żadne z tych trzech nie opisuje uczestnika: tabelę rozgrywa silnik meczowy z własną losowością, więc ranga siły nie jest miejscem; kadra w chwili gry w Europie ma za sobą do pięciu sezonów transferów i rozwoju; a gra liczy siłę z wagą ławki dla **faktycznie granego** pucharu.

Poprawiony pomiar bierze **3000 pełnych, headlessowych karier** (200 na komórkę `poziom × polityka`, trzy poziomy × pięć polityk) i czyta **dokładną wartość `sila`**, którą silnik zapisuje na linii sezonu — tę samą, którą `symulujRunde` podaje do `resolveSeasonalEuropeanOutcome`. Żadnego proxy. Wypadło z tego 4594 kampanii europejskich.

| puchar | kampanii | P25 | mediana siły | P75 | `pQualify` modelu przy medianie |
| --- | ---: | ---: | ---: | ---: | ---: |
| LM | 2054 | 68,1 | **69,9** | 71,9 | 44,6% |
| LE | 1829 | 66,5 | **68,5** | 70,2 | 67,6% |
| LK | 711 | 66,6 | **68,4** | 70,1 | **78,9%** |

Raport rozbija każdy z tych rozkładów według sezonu, poziomu trudności i polityki gracza — rozpiętość jest realna (LM: mediana 71,7 na łatwym wobec 68,0 na trudnym), więc jedna liczba nie opisuje uczestnika w całości.

**Kotwica `strength = 62` jest punktem konstrukcyjnym modelu, nie zmierzoną średnią ligi.** Mediana kadry startowej wypada na 64,2, a klub grający w LK ma medianę 68,4. Komentarze w `src/logic/european-cups.ts` i `src/data/balance.ts` zostały poprawione — mówiły wcześniej, że 62 to „przeciętna kadra Ekstraklasy", co nie było nigdy sprawdzone i jest sprzeczne z pomiarem.

Konsekwencja dla stałych: **klub, który realnie gra w LK, dostaje dziś 78,9%, a nie 70%.** Obie zewnętrzne projekcje (18,9% i 45,7%) leżą poniżej całego dzisiejszego przedziału LK. To zaostrza pytanie i **nie rozstrzyga go** — projekcje pozostają projekcjami dwóch klubów z cyklu o dwóch miejscach LK, bez mapowania na skalę `strength`.

### Kontrola spójności: obserwacja kontra model

Raport podaje sparowaną różnicę między obserwowanym udziałem awansów a modelem przy zmierzonej sile każdej kampanii: **LM −1,9 ± 1,5, LE −0,9 ± 1,3, LK +1,5 ± 1,8 p.p.** Zero mieści się w każdym z nich, więc `sila` z linii sezonu jest tą samą liczbą, której użyło losowanie.

Błąd standardowy jest **klastrowany po ziarnie**, nie po karierze. To nie jest drobiazg metodologiczny: klastrowanie po karierze dawało dla LM −2,8 ± 1,2 p.p., co czyta się jak realny rozjazd silnika, a jest artefaktem — każde ziarno wraca we wszystkich piętnastu komórkach i losuje tam ten sam klub, tę samą formację i ten sam rynek. Kolumna nie jest niezależnym dowodem o stałych: te kariery rozegrał ten sam model.

### Materiał pomocniczy: rozkład kadr startowych

Tabela osiemnastu klubów z medianami siły kadry startowej **zostaje w raporcie wyłącznie jako obraz rozpiętości stawki na starcie** (59,3 Radomiak – 71,8 Lech, mediana 64,2). Nie przypisuje klubom miejsc pucharowych i nie jest wejściem do żadnego wniosku o `pQualify`.

### Etap `knockout` — bez zmian, nadal poza kalibracją

Raport drukuje realne premie za fazę ligową (LM 18,6 / LE 4,31 / LK 3,17 mln €) obok gry (4,0 / 1,0 / 0,7) i **pustą kolumnę realnej premii za etap pucharowy**. Ta kolumna jest pusta w całym repozytorium, więc proporcji 1,4× nie ma z czym skonfrontować i `pKnockoutBase` / `pKnockoutSlope` zostają poza kalibracją — dokładnie tak, jak rozstrzygnął rozdział 5.

### Co ten przebieg zmienia w liście z rozdziału 10

Punkt 1 jest **wykonany** dla wariantu bazowego. Punkty 2–9 pozostają otwarte i dotyczą wyłącznie ewentualnej zmiany stałej; żaden z nich nie był potrzebny do samego pomiaru, bo audyt niczego w silniku nie zmienił.

---

## 12. Obserwowana częstość awansu — pomiar zewnętrzny, 2026-09-02

Rozdział 11 domknął połowę pytania o `pQualifyBase`: wiadomo, **przy jakiej sile** czytać krzywą. Ten rozdział dokłada drugą połowę — **obserwowaną częstość awansu klubów na porównywalnej ścieżce**. W chwili pomiaru stałe były jeszcze nietknięte; obniżenie `LK.pQualifyBase` przyszło po nim, jako decyzja produktowa.

### Zdarzenie, kohorta, wskaźnik siły

- **Zdarzenie:** klub wchodzi do LK w **II rundzie eliminacji ścieżki głównej** i dociera do fazy głównej. Trzy dwumecze — dokładnie tyle, ile ma polski uczestnik LK w cyklu, który odwzorowuje gra (rozdział 1: to jedyny wiersz access listy, który przenosi się między cyklami bez zmian).
- **Kohorta:** sześć edycji, 2021/22–2026/27, **341 obserwacji**. Wynik główny to trzy edycje z 36-klubową fazą ligową (**165 obserwacji**); trzy starsze, z 32-klubową fazą grupową, raportowane osobno jako analiza wrażliwości — ta sama liczba dwumeczów, mniej miejsc po drugiej stronie sita.
- **Wskaźniki siły niezależne od wyniku badanego sezonu:** rozstawienie w losowaniu Q2, ranga związku i **współczynnik klubowy**. Wszystkie trzy są ustalone **przed** rundą, a rozstawienie jest wręcz z współczynnika wyprowadzone, więc współczynnik jest legalnym predyktorem i zmienną stratyfikującą — zbiór go niesie (`clubCoefficient`) i to on stoi za rozbiciem po rozstawieniu.

  Czego współczynnikiem **nie** wolno zrobić: podstawić go pod `edge`. Nie jest odpowiednikiem siły kadry w grze — mierzy pięcioletni dorobek klubu w europejskich pucharach na własnej skali, a `strength` jest średnią OVR jedenastki i ławki. Brak przeliczenia między nimi to właśnie brakujące ogniwo z werdyktu niżej.

### Wynik

| kohorta | n | awans do fazy głównej |
| --- | ---: | ---: |
| szeroki benchmark, format 36-klubowy | 165 | **18,2%** |
| związek rangi 10–15 | 27 | 33,3% |
| ranga 10–15 **i rozstawiony** — najbliższa strukturalnie obserwowalna kohorta | 24 | **37,5%** |
| kluby polskie, sześć edycji | 12 | 33,3% |
| starszy format 32-klubowy (wrażliwość) | 176 | 15,3% |

**Zawężanie kohorty jest tu istotą, nie ozdobą.** Szeroki benchmark miesza mistrza Andory z trzecią drużyną Holandii; gra ma **jedno** miejsce LK, klubu ze związku z okolic dwunastej rangi, i ten klub jest zwykle rozstawiony. Dlatego właściwym punktem odniesienia jest wiersz „ranga 10–15 i rozstawiony", a nie 18,2%.

**Nazywam go „najbliższą strukturalnie obserwowalną kohortą", a nie „kohortą polskiego typu" ani „najbliższą grze"** — i ta ostrożność jest merytoryczna, nie stylistyczna. Dopasowane jest wyłącznie **położenie na access liście**: ranga związku, runda wejścia, rozstawienie. Twierdzenie, że te kluby *przypominają* to, co gra wysyła do Europy, wymagałoby mapowania na oś `strength`, którego nie ma. To najbliższa kohorta, jaką da się **zaobserwować**, a nie najbliższa, jaką da się **porównać**.

**Rozstawienie niemal rozstrzyga to zdarzenie:** w formacie 36-klubowym awansowało 30 z 93 rozstawionych i **0 z 71 nierozstawionych**, a przez sześć edycji nierozstawiony awansował raz na 147 prób. To najsilniejszy pojedynczy fakt w tym zbiorze i sam w sobie mówi, że model gry, w którym ta sama krzywa obsługuje cały zakres, jest uproszczeniem grubszym niż zakładaliśmy.

### Niepewność — bez deklaracji precyzji strojenia

Przedział Wilsona (13,0–24,8% dla benchmarku) opisuje udział **przy założeniu niezależnych obserwacji, którego te dane nie spełniają**. Obok stoją więc bootstrapy klastrowe: po związku 11,0–25,9% (42 klastry), po sezonie 16,7–20,0% — ten drugi ma tylko **trzy** klastry, więc jest ograniczeniem metody, nie miarą precyzji. Odporność na powtarzające się kluby: licząc każdy klub raz, 18,8% (24/128) wobec 18,2%.

**Nie deklaruję dokładności strojenia rzędu 5 p.p.** Przy `n = 24` w najbliższej strukturalnie obserwowalnej kohorcie przedział Wilsona to 21–57%; to wystarcza, żeby odróżnić 37% od 79%, i nie wystarcza, żeby wybrać między 35% a 45%.

### Kompletność próby — skąd się brała różnica 55 kontra 53

Zwiad podawał 53 uczestników wobec 55 u UEFA i **nie umiał wskazać brakujących dwóch** — dlatego parser liczy teraz każde wykluczenie z nazwą i powodem, a przebieg przerywa, gdy kontrola się nie zgadza. Wykluczani są wyłącznie ci, którzy weszli do tej rundy **spadkiem z eliminacji Ligi Europy** (`UEL MP Q1`); ścieżka mistrzowska nie wchodzi do kohorty w ogóle, bo ma inne losowanie i inną pulę rywali. Kontrole: liczba klubów fazy głównej musi wyjść 36 (albo 32), zwycięzcy play-offów plus uczestnicy bezpośredni muszą się do niej sumować, a dla 2024/25 liczba klubów Q2 ścieżki głównej musi wynieść **86** — dokładnie tyle, ile podała UEFA.

Przy okazji tej kontroli wyszły trzy realne błędy parsowania: komórki wyników linkują artykuł o rzutach karnych (dawało 89 zamiast 86), „†" przy Košicach oznacza zastąpienie DAC-u po losowaniu, a nie transfer z LE, a kolumna `seeded` czytana ze zbioru jako tekst zamiast wartości logicznej po cichu zredukowała rozbicie po rozstawieniu ze 165 wierszy do jednego.

### Źródła

Access lista i ranking związków są u UEFA **nieosiągalne maszynowo** (`documents.uefa.com` nie oddaje aneksu, ranking renderuje się skryptem, `kassiesa.net` zwraca 403). Dane pochodzą więc z Wikipedii, **oznaczonej w manifeście jako źródło wtórne**, z przypiętym numerem rewizji każdej strony i datą dostępu, i są walidowane wobec liczb opublikowanych przez UEFA. `pnpm data:parse-uecl` **niczego nie pobiera** — czyta lokalne kopie i przy braku pliku wypisuje adres z numerem rewizji.

### Werdykt tego etapu

**Dane wystarczają na mocną przesłankę, nie na kalibrację.** Ścieżka jest porównywalna, zdarzenie zdefiniowane, próba policzalna i uzgodniona z UEFA. Brakuje jednego ogniwa: **mapowania siły realnego klubu na oś `strength`**. Model czyta prawdopodobieństwo przy sile uczestnika (68,4 — rozdział 11), a kohorta nie została na tę oś przełożona; bez tego 37,5% nie wolno wstawić jako `pQualifyBase`, bo to jest wartość krzywej w innym punkcie.

Co pomiar mówi mimo to: gra obiecuje uczestnikowi LK **78,9%**, a najbliższa mu kohorta rzeczywista osiąga **37,5%** — mniej więcej połowę. Kierunek jest jednoznaczny, wielkość korekty nie.

Osobno: **nachylenie pozostaje nieidentyfikowalne.** Jeden udział to jeden punkt na dwie niewiadome. Rozbicie po randze związku pokazuje gradient (58,3% dla rang 1–9, 0% dla 40–55), ale ranga związku nie jest siłą kadry i nie wolno jej podstawić pod `edge`.

`pKnockout*` pozostaje poza zakresem — nadal nie ma przypiętej realnej premii za etap pucharowy.

**Praca badawcza kończy się tutaj, a decyzja zapadła.** Dalszy ciąg nie był już pytaniem „jaka liczba wychodzi z danych", tylko „ile realizmu poświęcamy dla tempa i finansów" — i stał się decyzją produktową. Właściciel produktu przyjął 2026-09-02 wariant `lk40`: **`pQualifyBase` LK 0,70 → 0,31**, co daje 39,9% przy zmierzonej sile uczestnika wobec dawnych 78,9%. `pQualifySlope` zostaje na 0,25 jako jawne założenie projektowe, `pKnockout*` bez zmian.

Werdykt tego audytu — „dane wystarczają na mocną przesłankę, nie na kalibrację" — **pozostaje w mocy i nie został przez tę decyzję unieważniony**: 0,31 jest wyborem produktowym opartym na przesłance, nie wartością wyprowadzoną z danych.

### Produkt uboczny: lista realnych klubów

`scripts/data/uecl-clubs.csv` — **202 kluby**, z kodem związku, liczbą występów i współczynnikiem UEFA.

**To nie jest „poziom rozgrywek", tylko selekcja zdefiniowana przez zdarzenie z tego rozdziału**: kluby, które w sześciu edycjach weszły do LK bezpośrednio w II rundzie eliminacji ścieżki głównej. To pozycja na access liście, a nie klasa klubu, więc przekrój jest ogromny — współczynnik od 1,3 (Spaeri) do 63,8 (Braga), mediana **6,5**, 44 związki, 118 klubów tylko w jednej edycji.

Jako materiał pod przyszłe kierunki transferów (dzisiejsze `ZAGRANICA` to dziewięć ręcznie wybranych nazw) lista jest **surowcem, nie gotowym zbiorem**, z trzech powodów:

- **Rozkład jest skośny w dół.** Typowy wpis to klub rzędu Sliemy albo Bangi, nie Ajaksu. Dzisiejsza `ZAGRANICA` leży wyraźnie wyżej, a Salzburg, Bologna, Rennes, Feyenoord i Udinese nie spadają do Q2 LK, więc w ogóle ich tu nie ma — podmiana jeden do jednego osłabiłaby kierunki odejść.
- **Są tam polskie kluby** (siedem, z Rakowem i Legią), które do listy „zagranica" trzeba odfiltrować.
- **Dobór jest warunkowany wynikiem.** Klub trafia tu, bo jego liga i miejsce dały mu akurat tę rundę; Ajax figuruje za sezon, w którym mu się nie powiodło.

**Współczynnik nie jest `strength`** — przełożenie go na skalę gry to dokładnie to brakujące ogniwo z werdyktu wyżej. Lista wchodzi do repo jako dane, nie jako wejście do mechaniki; dobór progiem i odrzucenie Polski to decyzja projektowa o tym, dokąd odchodzą zawodnicy, a nie wniosek z tego pomiaru.

---

## Czego ten audyt nie ustalił

- Czy stałe LK należy zmienić — dostępne projekcje uzasadniają pomiar, ale nie rozstrzygają decyzji.
- Referencyjnego `pQualifyBase` gotowego do wstawienia. Obie połowy pytania są już zmierzone — siła uczestnika (68,4, rozdział 11) i obserwowana częstość awansu na porównywalnej ścieżce (37,5% w najbliższej strukturalnie obserwowalnej kohorcie, rozdział 12) — ale **brakuje ogniwa między nimi**: mapowania siły realnego klubu na oś `strength`. Bez niego 37,5% jest wartością krzywej w nieznanym punkcie.
- Właściwej wartości `pQualifySlope` dla LK — nachylenie pozostaje niezidentyfikowalne bez większej liczby porównywalnych danych i mapowania ich na skalę `strength`.
- Semantyki etapu `knockout` — brak przypiętej realnej premii za ten etap.
- Rundy wejścia 3. miejsca w LE 2027/28 — access lista nieopublikowana.
