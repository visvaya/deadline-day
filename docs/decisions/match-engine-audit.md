# Powtarzalny audyt silnika meczowego i tabeli

## Cel

`pnpm audit:match-engine` mierzy pojedynczy sezon ligowy. Nie zastępuje `pnpm balance`, który mierzy całą karierę gracza, polityki transferowe, finanse, werdykt i dziedzictwo.

Audyt jest diagnostyczny: nie zmienia stałych w `src/data/balance.ts` ani nie regeneruje golden mastera. Opcjonalna macierz wyprowadza kontrfaktyczny wariant skalujący lambdy stron do danych rzeczywistych, ale niczego nie zapisuje w silniku i nie podejmuje decyzji wdrożeniowej.

## Uruchamianie

Szybka kontrola podczas pracy:

```powershell
pnpm audit:match-engine --runs 1000
```

Pełny pomiar po dużej zmianie silnika:

```powershell
pnpm audit:match-engine --runs 20000 --batches 3 --seed 0x1ea6e001 --md docs/decisions/_match-engine-nazwa-zmiany.md
```

Opcjonalny eksperyment modeli wyniku meczu:

```powershell
pnpm audit:match-engine --runs 20000 --batches 3 --seed 0x1ea6e001 --outcome-experiments --md docs/decisions/_match-outcomes-nazwa-zmiany.md
```

Flaga `--outcome-experiments` dokłada dwadzieścia kontrfaktycznych wariantów i wydłuża pełny przebieg do około 4 minut. Bez flagi stały audyt pozostaje lżejszy i nie liczy tej macierzy.

Pełną listę flag pokazuje:

```powershell
pnpm audit:match-engine --help
```

`--runs` oznacza liczbę pełnych sezonów w każdej raportowanej kohorcie. Nie oznacza liczby meczów ani pięciosezonowych partii gracza. Jeden sezon to 306 meczów.

## Co mierzy raport

1. Statyczny snapshot osiemnastu ocen z `TEAM_RATINGS` — czysty silnik plus obecny rozrzut danych wejściowych.
2. Osobną kohortę po jednym cyklu trzech awansów i spadków — silnik plus churn piramidy i mnożniki awansu/spadku.
3. Punkty mistrza i ostatniego, kwartyle, rozpiętość oraz SD punktów w tabeli.
4. Spearmana siła–miejsce, trafność top 4, udział dolnej połowy ocen w top 4 i odchylenie punktów od wartości oczekiwanej.
5. Dla każdego klubu statycznego snapshotu: średnie punkty, SD, tytuł, top 4 i spadek wraz z SE.
6. Gole, remisy, wygrane gospodarzy i gości oraz przewagę gospodarza w punktach na mecz.
7. Tytuł beniaminka i spadek poprzedniego mistrza.
8. Ruch miejsc między tabelą po 17 kolejkach i tabelą końcową.
9. Rozrzut wyników między trzema niezależnie wyprowadzonymi partiami ziaren.

Snapshot i liga po rotacji nigdy nie są łączone w jedną średnią.

Każda partia ma osobny `seed root`, wyprowadzony deterministycznie z seeda bazowego i numeru partii. Raport wypisuje te korzenie, więc stabilność nie jest pozornym podziałem jednego ciągłego strumienia RNG.

## Dane rzeczywiste

Pięć zakończonych sezonów Ekstraklasy jest **przypiętych w repo**, nie pobieranych — audyt ma być powtarzalny offline i recenzowalny, a nie zależny od tego, czy serwis żyje i czy akurat nie blokuje ruchu. Służą one do tabel, ruchu miejsc i anomalii.

Rozkład wyniku meczu ma osobny benchmark. Od 2026-08-26 stoi on na **surowych wynikach dziesięciu sezonów przypiętych w `scripts/data/ekstraklasa-results.csv`** — 2944 mecze, wiersz na mecz — a wszystkie agregaty (gole stron, wyniki dom/remis/wyjazd, komórki `0:0`, `1:0`, `0:1`, `1:1` i remisów `2:2+`) są z nich **wyliczane**, nie przepisywane. Ręcznie wpisane są wyłącznie dwa odciski palca w `tests/scripts/match-engine-audit-reference.test.ts`. Rozdzielenie benchmarków jest celowe: bieżąca tabela wymaga najnowszego formatu, a test zależności Poissona potrzebuje większej próby dokładnych wyników.

**Okno kalibracji to osobna decyzja od zakresu danych.** `MATCH_OUTCOME_REFERENCE` zawęża dziesięć sezonów do **dziewięciu — wszystkich poza pandemicznym 2020/21, razem 2704 mecze** — i do nich dopasowane są `MATCH_BASE_GOALS` i `MATCH_HOME_ADVANTAGE`.

Okno stało na ośmiu sezonach od 2026-08-26 do **2026-08-28**, kiedy właściciel produktu je poszerzył. Wąskie okno było wtedy świadomą ostrożnością: naprawa parsera nie miała po cichu przesuwać celu kalibracji w trakcie samej naprawy. Ostrożność spełniła swoje zadanie — agregaty wyszły identyczne (niżej) — więc jedyny powód, dla którego 2015/16 stał poza oknem, przestał istnieć. 2020/21 zostaje na zewnątrz, bo jego powód jest inny i żyje poza modelem: mecze bez publiczności, przewaga gospodarza 0,275 pkt/mecz przy 0,463 w sezonach obok, `z = -2,13`.

Naturalny zarzut wobec przyjęcia 2015/16 brzmi, że on też odstaje — ma najniższą przewagę gospodarza spośród sezonów niepandemicznych (0,334). Nie odstaje: `z = -1,74`, a **2022/23, który z okna nigdy nie wyszedł, leży dalej od średniej (`z = -1,88`)**. Trzymanie go na zewnątrz byłoby regułą stosowaną do jednego sezonu i nie do jego sąsiada.

Co dałoby każde z trzech okien, liczy `pnpm audit:outcome-windows`; każda kolejna zmiana pozostaje decyzją właściciela produktu.

**Sprostowanie do wcześniejszej wersji tego pliku.** Stało tu zdanie, że sezony 2015/16 i 2020/21 są pominięte, bo listy RSSSF nie domykają pełnego składu ligi. **To była nieprawda i nie jest usuwane po cichu, bo na tym zapisie stała wdrożona zmiana silnika** (dopasowanie lambd, commit `a8debb4`). Listy zawsze były kompletne; niekompletny był odczyt. Jednorazowy parser wymagał **dwóch spacji** przed wynikiem, a `Podbeskidzie` ma dwanaście znaków i wypełnia kolumnę nazwy co do jednego, zostawiając **jedną**. Podbeskidzie grało w Ekstraklasie wyłącznie w tych dwóch sezonach z dziesięciu, więc jego mecze domowe wyjaśniają zgubione wiersze co do sztuki — i zepsuły dokładnie te dwa sezony, a nie żadne inne. Zewnętrzne źródło zostało obwinione o brak, który wyprodukowała jedna nazwa klubu. Obroną przed powtórzeniem jest kontrola, której wtedy nie było: **każdy sezon jest teraz sprawdzany wobec tabeli z jego własnej strony** — występy oraz bramki zdobyte i stracone każdego klubu. Suma goli w lidze sama się nie broni i wtedy wyglądała wiarygodnie, dlatego nikt niczego nie zauważył.

Sprostowanie nie unieważniło kalibracji: agregaty okna ośmiu sezonów po naprawie parsera były **identyczne** z tymi, do których dopasowano lambdy (2408 meczów, 6425 goli, 3622 gole gospodarzy, 2803 gole gości), więc wada dotknęła wyłącznie dwóch pominiętych sezonów. Odcisk palca w testach przeszedł wtedy bez zmiany wartości — i właśnie dlatego dwa dni później dało się poszerzyć okno jako **decyzję**, a nie jako naprawę.

Test komórek wyników jest diagnostyką agregatową, nie pełnym testem warunkowej niezależności. Używa jednej pary średnich lambd na sezon i nie kontroluje różnych sił par drużyn; mieszanka heterogenicznych Poissonów może sama zmienić liczbę remisów. Właściwe oszacowanie Dixona–Colesa wymaga surowych wyników z nazwami klubów i dopasowanego modelu attack/defence/home. Raport może więc stwierdzić brak dodatniego sygnału w agregatach, ale nie może z nich dowieść `ρ=0`.

**To oszacowanie zostało wykonane 2026-09-02 i pytanie jest zamknięte jako nierozstrzygnięte** (`pnpm audit:rho`, offline, wyłącznie z przypiętego CSV, bez zmian w `src/`). Werdykt B z zarejestrowanego protokołu badania, oparty na dwóch warunkach naraz: `p = 0,01005` wobec zarejestrowanego wcześniej progu `p < 0,01`, **oraz** materialny dolny koniec obwiedni konserwatywnej. Estymata to `ρ̂ = −0,0644`, obwiednia `[−0,1421; −0,0004]`.

Udziały remisów implikowane przez dopasowanie, liczone po prawdziwej liście spotkań, więc bez szumu Monte Carlo:

| model | okno | udział remisów |
| --- | --- | ---: |
| dane rzeczywiste | dziesięć sezonów, 2944 mecze | 26,83% |
| dopasowanie bez τ (`ρ = 0`) | dziesięć sezonów | 24,76% |
| dopasowanie z τ (`ρ = ρ̂`) | dziesięć sezonów | 26,23% |
| dane rzeczywiste | dziewięć sezonów, 2704 mecze | 26,78% |
| **silnik dziś** | — | **25,38%** |

**Dwa wiersze „dane rzeczywiste" nie są rozjazdem — różni je wyłącznie okno.** Estymacja ρ liczy na wszystkich dziesięciu sezonach, bo interesuje ją najwięcej danych; silnik porównuje się do dziewięciu, bo do dziewięciu dopasowane są jego lambdy, a 2020/21 wypadło z okna z powodu spoza modelu (mecze przy pustych trybunach). Ta sama arytmetyka na obu podzbiorach: 790/2944 wobec 724/2704.

**Konsekwencja dla silnika: niedomiar remisów o 1,4 p.p. jest odtąd znaną i świadomie przyjętą własnością, a nie otwartą usterką.** Znamy jego częściową przyczynę — heterogeniczność klubów nie tłumaczy całej nadwyżki remisów w danych — i znamy cenę naprawy: przyjęcie `ρ̂` domknęłoby lukę z 1,40 na 0,16 p.p., przechodząc wszystkie bramki kosztu z zapasem. Nie płacimy jej, bo dowód na istnienie zależności zatrzymał się pięć stutysięcznych od progu.

**Ponowne otwarcie tematu wymaga danych, nie argumentu.** Domknięcie pytania przy mocy 90% potrzebuje około **24 sezonów** zamiast dzisiejszych dziesięciu, czyli mniej więcej czternastu wstecz ponad przypięte okno. Nowy przebieg na tych samych dziesięciu sezonach odtworzy tę samą liczbę — narzędzia (`pnpm audit:rho`, `audit:rho-power`, `audit:rho-points`) zostają w repo właśnie po to, żeby dało się to wznowić, gdy CSV urośnie. Pełny zapis: `_rho-2026-09-01.md` (pomiar), `rho-estimator-method.md` (metoda i budżet); moc estymatora odtwarza `pnpm audit:rho-power`. <!-- gitleaks:allow: a file name, not a secret -->

Dla każdego sezonu przypięte są **dwie pełne tabele — po 17. kolejce i końcowa** — a w każdej z nich, dla każdego klubu: **punkty, bramki zdobyte, bramki stracone**. Kolejność klubów w tablicy **nie ma znaczenia**: wylicza ją `orderOf()` tą samą funkcją `sortStandings`, którą gra sortuje własną tabelę.

**To nie jest ozdobnik, tylko sedno.** Prawdziwa liga rozstrzyga remisy punktowe **meczami bezpośrednimi**, o których ta gra nie ma pojęcia — sortuje różnicą bramek, potem bramkami zdobytymi, potem nazwą. Obie reguły bywają sprzeczne i obie są poprawne, każda dla swoich rozgrywek:

- **2021/22, miejsce 6.** Wisła Płock jest szósta w prawdziwej tabeli dzięki meczom bezpośrednim; przy równych 48 punktach różnica bramek daje szóste miejsce Radomiakowi (+2 wobec −3). Audyt liczy z Radomiakiem, bo tak liczy silnik.
- **2022/23, po 17. kolejce.** Lech i Widzew mają identyczne punkty (29), różnicę bramek (+5) **i bramki zdobyte** (22). O ich kolejności decyduje wyłącznie porównanie nazw — ostatni człon `sortStandings`.

Dopóki przypięta była sama kolejność nazw, **nikt nie potrafił odróżnić celowej rozbieżności od błędu przepisania** — a taki błąd przesunąłby punkt odniesienia, względem którego stroi się silnik. Teraz liczby porównuje się ze źródłem wiersz po wierszu, a kolejność się z nich wynika.

Testy w `tests/scripts/match-engine-audit-reference.test.ts` pilnują dodatkowo, że każda tabela domyka się sama: bramki zdobyte w lidze równe straconym, komplet osiemnastu klubów w obu odczytach, ten sam zbiór nazw po 17. kolejce i na koniec, a suma bramek w tabeli końcowej zgodna z liczbą goli przypiętą osobno, z innego źródła. Dla benchmarku wyników kontrolują 2704 mecze, 7203 gole, sumę trzech rozstrzygnięć, właściwy rozmiar terminarza w obu formatach i wszystkie przypięte komórki niskich wyników. Terminarz jest kluczowany **sezonem**, nie jego pozycją w oknie: liga urosła z szesnastu klubów na osiemnaście w 2021/22, a asercja indeksowa po cichu przecelowywała się przy każdym ruchu okna — czyli dokładnie wtedy, gdy miała pilnować.

Dodatkowo przypięty jest **punkt stały dopasowania**: stałe w `balance.ts` są własnymi średnimi bramkowymi tego okna, więc ponowne dopasowanie do niego musi zwrócić je bez zmiany. Rozjazd stałej i okna — w którąkolwiek stronę — zapala się tam natychmiast.

## Rozdzielenie ocen od losowości

Raport liczy trzy sparowane warianty na tych samych strumieniach losowych:

- `k=0`: wszystkie oceny są równe 1,00;
- `k=1`: bieżący snapshot;
- `k=1,5`: odchylenia ocen od 1,00 są poszerzone przez `x → x^1,5`.

Każda strona każdego meczu dostaje własny seed wspólny dla wariantów. Próbkowanie korzysta z produkcyjnych `expectedGoals` i `poisson`, więc nie istnieje druga kopia lambdy ani rozkładu bramek.

Audyt podaje także rozpiętość analitycznych punktów oczekiwanych bez losowania meczów. To odróżnia sygnał ocen od ekstremów wytwarzanych przez 34 losowe kolejki. Przy każdym wariancie raportuje również cenę w przewidywalności: szansę klubu nr 1 rankingu na tytuł, trafność top 4 i udział dolnej połowy ocen w top 4. Nie wolno dobierać `k` wyłącznie do rozpiętości tabeli.

**Surowa rozpiętość mistrz–ostatni jest najsłabszą z mierzonych tu wielkości i nie należy pod nią stroić.** Nie dlatego, że jest nieprawdziwa — jest — tylko dlatego, że w przeważającej części nie mówi o ocenach. Przy osiemnastu klubach o identycznych ocenach raport mierzy **28,58 pkt** rozpiętości; bieżący snapshot daje 34,94, czyli całe zróżnicowanie ocen dokłada **6,36 pkt**. Reszta to nieunikniona zmienność ekstremów: mistrz jest maksimum z osiemnastu wyników, ostatni minimum, a oczekiwany rozstęp osiemnastu prób przy odchyleniu ~7,5 pkt na klub to około 3,6 odchylenia — mniej więcej tyle, ile wychodzi z pomiaru. O sile sygnału ocen mówią, w kolejności przydatności: **rozpiętość punktów oczekiwanych** (bez losowania meczów), **sparowany przyrost względem wariantu `k=0`**, **korelacja Spearmana siła–miejsce**, **prawdopodobieństwo tytułu w rozbiciu na klub** i **SD punktów tego samego klubu** między sezonami.

**Wariant `k=1,5` trafia w rozpiętość, ale nie kupuje „realizmu tabeli".** Kupuje zgodność z jedną pięciosezonową metryką, której własny błąd standardowy wynosi 4,34 pkt — przy pięciu obserwacjach rozjazd gry wobec rzeczywistości to około 1,4 SE, czyli sygnał istnieje, lecz jest słaby. Płaci za to prawie **20 p.p. szansy klubu nr 1 rankingu na tytuł** (39,65% → 59,64%, sparowane +19,98 ± 0,30) i 10,54 p.p. trafności top 4. Bez historycznego benchmarku **przedsezonowych** sił klubów nie wiadomo, czy realniejsze jest 39,7%, 50% czy 59,6%. To znaczy, że wybór między nimi jest **decyzją produktową o odczuciu gracza prowadzącego słabszy klub**, a nie kalibracją do danych.

Raport zawiera również sparowany pomiar czułości dla `MATCH_BASE_GOALS -10%`, `MATCH_HOME_ADVANTAGE +10%` i obu zmian naraz. Te warianty korzystają z produkcyjnych funkcji, nie zapisują nowych stałych i służą wyłącznie do pokazania efektów ubocznych potencjalnych dźwigni.

Tabele kontrfaktyczne pokazują zarówno absolutne średnie z SE, jak i różnicę wobec wariantu bazowego obliczoną sezon po sezonie na tych samych seedach. Do oceny efektu zmiany służy sparowana różnica i jej SE; osobne średnie służą do porównania z rzeczywistością.

## Eksperyment rozkładu wyniku meczu

Opcjonalna macierz rozdziela trzy pytania:

- Dixon–Coles przenosi prawdopodobieństwo wyłącznie między `0:0`, `0:1`, `1:0` i `1:1`, zachowując marginalne rozkłady Poissona;
- wspólny składnik Poissona dodaje obu klubom ten sam los o średniej `κ`, po uprzednim odjęciu `κ` od obu lambd niezależnych — zachowuje więc marginalne średnie i wariancje, ale wprowadza dodatnią kowariancję;
- podział przewagi gospodarza zapisuje jej część jako podbicie ataku gospodarza, a resztę jako osłabienie ataku gościa. Udział `100%` jest dokładnie obecną formułą.
- wariant `λ stron do 8 sezonów` mierzy produkcyjne średnie `expectedGoals` pełnego terminarza i skaluje dwie istniejące dźwignie tak, aby trafić historyczne gole gospodarzy i gości. Dzięki temu po zmianie wzoru nie pozostaje przy starych, ręcznie wpisanych współczynnikach.

Każdy wariant raportuje gole, remisy, wygrane dom/wyjazd, przewagę punktową, rozpiętość, Spearmana siła–miejsce, tytuł klubu nr 1 rankingu, top 4 i wejście dolnej połowy ocen do top 4. Wszystkie różnice są sparowane po sezonie.

Mechaniczna etykieta `przechodzi` wymaga nie tylko znaku i `2 SE` symulacji. Wzrost remisów oraz przewagi gospodarza musi przekroczyć również jedną czwartą SE ośmiosezonowego punktu odniesienia. Przy `n=20 000` sam mikroskopijny efekt może być bardzo istotny statystycznie; ten próg oddziela precyzję symulatora od materialności wobec rzeczywistości.


Istnieje granica identyfikowalności: w obecnej lambdzie poszerzenie ocen `x → x^k` jest algebraicznie równoważne podniesieniu ilorazu ocen do potęgi `k`. Pomiar wskazuje potrzebną efektywną czułość, ale bez niezależnej kalibracji skali ocen nie rozstrzyga, czy zmiana powinna trafić do źródła ocen, czy do lambdy.

## Trzy narzędzia, trzy różne pytania

Nie zastępują się nawzajem i żadne nie odpowiada na pytanie pozostałych:

- **`pnpm audit:match-engine`** mierzy **sezon ligowy** — 306 meczów neutralnej ligi, bez gracza. Odpowiada na „jak wyglądają wyniki, tabela i przewaga gospodarza".
- **`pnpm balance`** mierzy **karierę gracza** — pięć sezonów, decyzje kartowe, dziedzictwo. Odpowiada na „jak gra się tą grą".
- **`pnpm balance:compare`** mierzy **różnicę dwóch przebiegów `pnpm balance`**, sparowaną po ziarnie. Nie mierzy niczego sam — potrzebuje dwóch dumpów `--dump-raw` z tym samym zestawem ziaren. Odpowiada wyłącznie na „o ile przesunęła się kariera między tymi dwoma stanami kodu", i tylko dlatego, że oba przebiegi poszły tymi samymi ziarnami.

Dwie komendy stoją obok, a nie w tym szeregu, bo **nie mierzą niczego symulowanego**: przygotowują i opisują dane rzeczywiste, wobec których mierzy się `audit:match-engine`.

- **`pnpm data:parse-results`** zamienia lokalne strony RSSSF na przypięty `scripts/data/ekstraklasa-results.csv`. Niczego nie pobiera i sprawdza każdy sezon wobec jego własnej tabeli, zanim cokolwiek zapisze.
- **`pnpm audit:outcome-windows`** porównuje okna kalibracji — osiem, dziesięć, dziewięć bez 2020/21 — i podaje stałe, które każde z nich implikuje. Niczego nie zmienia.

Zmiana dotykająca punktów albo miejsc wymaga **obu** pomiarów: audytu na sezon ligowy i `balance` na karierę, a potem `balance:compare` do odczytania różnicy.

## Jak porównywać zmianę silnika

- Przed i po zmianie użyj dokładnie tych samych `--runs`, `--batches` i `--seed`.
- Czytaj średnie i SE; median nie używaj jako głównej miary strojenia.
- Jeżeli wynik jest blisko progu decyzji, powtórz pełny audyt z innym seedem bazowym. Strukturalny problem pozostanie w tej samej metryce; szum przemieści się między klubami i partiami.
- Nie porównuj statycznego snapshotu z kohortą po awansach jako „przed/po”. To różne pytania.
- Po każdej zmianie wpływającej na punkty lub miejsca uruchom również `pnpm balance`. Miejsca zasilają przychód, ryzyko spadku, werdykt i dziedzictwo, więc mogą wymagać ponownej kalibracji handicapów oraz progów.

## Zweryfikowane zależności

Przed dodaniem komendy sprawdzono testami i niezależnymi rachunkami:

- 18 klubów daje 34 kolejki i 306 meczów, po 17 u siebie i na wyjeździe;
- suma goli zdobytych równa się straconym, a punkty mieszczą się między granicą wszystkich remisów i wszystkich rozstrzygnięć;
- Poisson ma średnią i wariancję równą lambdzie w dużej próbie;
- lambdy dla równych klubów wynoszą dokładnie 1,4890 i 1,1523 (wartości sprzed dopasowania z 2026-08-26: 1,5525 i 1,35);
- analityczne oczekiwanie równego klubu wynosi 46,6284 pkt na sezon, policzone niezależną enumeracją Poissona 0..60 po obu stronach (przed dopasowaniem: 46,8141);
- ogon obcięty przez istniejące `expected-points.ts` powyżej 10 goli ma przy maksymalnej obecnej lambdzie masę 0,00286%, czyli nie wpływa materialnie na raport;
- parser snapshotu wymaga kompletnego wiersza oraz głośno odrzuca zmianę struktury źródła;
- awanse są losowane bez zwracania przed dołączeniem spadkowiczów, a oceny zachowują asymetrię atak–obrona.
