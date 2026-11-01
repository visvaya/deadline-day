# System designu

Reguły, do których sięga się przy pisaniu każdego komponentu UI. Powstały z mockupów zatwierdzonych 2026-08-09. Ten plik jest żywy — jeśli kod i ten dokument się rozjadą, rozjazd trzeba zgłosić, a nie po cichu rozstrzygnąć.

**Mockupy** z sierpnia 2026 były drogowskazem dla wyglądu, nie zapisem stanu. Reguły niżej mówią, co zrobić w sytuacjach, których mockup nie pokazuje. **Gdy mockup i kod się rozjadą, rozstrzyga kod i ten dokument** (zmiana 2026-09-03): mockupy pochodzą z sierpnia i kod wyprzedził je w co najmniej dwóch miejscach — bloku „Kadra" na karcie oferty i nazwach metryk w raporcie analityka.

**Przeczytaj przed dotknięciem `src/ui`.** Nadrzędna jest reguła ukrytego sufitu: jego dokładna wartość nie trafia do UI przed ekranem końcowym, ani wprost, ani przez wskaźnik pochodny.

## Krój pisma

**Figtree**, licencja OFL, dogrywany razem z grą jako plik `.woff2` w `src/`; licencja jedzie z grą jako `public/licenses/figtree-OFL.txt`. Dwa podzbiory: `latin` i `latin-ext` — ten drugi jest konieczny, bez niego nie ma ą ć ę ł ń ś ź ż. Razem ok. 40 KB.

Nigdy `fonts.googleapis.com` ani inny zewnętrzny host — zakaz pobierania fontów z sieci obowiązuje.

Grubości: **400** tekst, **700** etykiety i wyróżnienia w zdaniu, **800** nazwiska, liczby i tytuły. Nic pośredniego.

Wszystkie cyfry, które stoją w kolumnie albo się zmieniają, dostają `font-variant-numeric: tabular-nums`. Bez tego licznik sekund i kwoty skaczą.

**Tracking zostaje przy zerze** w tekście czytanym. Ujemny tracking wolno stosować wyłącznie na dużych liczbach i nazwiskach (−0,02 do −0,04 em), gdzie faktycznie poprawia zbitkę. Rozstrzelenie (0,09–0,13 em) tylko w wersalikowych etykietach sekcji.

## Paleta

Trzy warstwy tła i cztery znaczenia. **Jeden kolor = jedno znaczenie.** Jeśli kolor musiałby powiedzieć dwie rzeczy, znaczy że brakuje osobnego wskaźnika.

### Powierzchnie

| Rola | Wartość |
| --- | --- |
| Tło ekranu | `#f2f4f6` |
| Karta, panel, pasek akcji | `#ffffff` |
| Tło wewnątrz karty (bloki kwot, paski nadawcy) | `#f7f9fa` |
| Obramowanie karty | `#dfe3e8` |
| Linia wewnątrz karty | `#eff1f4` |

### Tekst

| Rola | Wartość |
| --- | --- |
| Główny | `#0f1418` |
| Drugorzędny | `#4d5763`, `#5a6470` |
| Przygaszony, etykiety | `#7d8792`, `#8b939d`, `#98a1ab` |

### Znaczenia

| Znaczenie | Wartość | Gdzie |
| --- | --- | --- |
| Korzystne, przychód, akcja domykająca | `#0a7d45` | wpływy, ocena 71+, przycisk główny |
| Kosztowne, ubytek, pilna presja | `#c0362b` | odstępne, ujemna prognoza, ocena ≤62, ostatnie 5 s zegara |
| Uważaj | `#8a5d05` | ocena 63–70, ostrzeżenie o próbie |

Zmiana oceny używa **przygaszonych wariantów**, żeby nie konkurowała z samą oceną: `#7fb99b` w górę, `#d69f98` w dół (u rezerwowych jeszcze bledsze `#8dc0a6` / `#dcaba5`). **Uwaga: sam wskaźnik jest otwartą decyzją** — pokazany przy zawodniku poniżej 24 lat zdradza sufit. Patrz sekcja „Reguły niosące mechanikę".

### Typy kart — poza semantyką wartości

Etykieta typu oferty nie jest oceną, więc nie wolno jej malować kolorami znaczeń. Podział idzie za kierunkiem ruchu zawodnika:

| Typ | Wartość |
| --- | --- |
| Kupno (przychodzi) | `#2f5fa8` |
| Sprzedaż (odchodzi) | `#7d4aa8` |
| Przedłużenie (zostaje) | `#0f6b74` |
| Wolny agent (bez klubu) | `#6b7280` |

Żaden z tych czterech nie występuje nigdzie indziej w interfejsie.

### Rozgrywki europejskie

`LM` `#1e4b9c`, `LE` `#8a5d05`, `LK` `#0a7d45`, spadek `#c0362b`. To jedyne miejsce, gdzie kolor znaczy przynależność, a nie wartość — dlatego pojawia się wyłącznie jako mała plakietka w tabeli, nigdy w zdaniu.

## Kształt

Promienie: **6 px** drobne elementy, **7–8 px** kafelki i pigułki, **9 px** przyciski i bloki kwot, **10–12 px** karty. Nic większego.

**Zero cieni** poza jednym: pasek akcji rzuca cień do góry (`0 -5px 14px rgba(15,20,24,.05)`), bo musi być widać, że treść pod nim się przewija.

**Zero ikon w interfejsie.** Jedyne znaki graficzne w warstwie sterowania to trójkąty wieku i ptaszek potwierdzenia — oba są znakami z fontu. Ta reguła dotyczy **ikonografii interfejsu** i zostaje: strzałka, koło zębate czy kosz na śmieci jako plik nie wchodzą, bo estetyka narzędzia transferowego stoi na typografii, a nie na obrazkach.

**Zakaz plików graficznych zniesiony 2026-09-03** (decyzja właściciela produktu). Do tej daty reguła brzmiała „nie pliki graficzne" i obejmowała także herby. Powód zniesienia: **prawdziwe herby klubowe są celem produktu na odległą przyszłość** — gry tego gatunku je mają i właściciel nie uznaje tego za ryzyko, którego trzeba unikać projektem. Herb przestaje więc być ograniczony do SVG rysowanego z danych.

Co to **nie** zmienia. Dopóki prawdziwych herbów nie ma, obowiązuje dotychczasowa forma: herby i koszulki są SVG rysowanym z danych klubu (patrz niżej). Zniesienie zakazu otwiera drogę, nie zmienia dzisiejszego wyglądu. I nie dotyczy ikonografii interfejsu, która zostaje przy foncie.

Kto to kiedyś wdroży, musi wiedzieć jedno: **prawdziwe godła Lecha czy Legii to cudze znaki towarowe.** To jest kwestia praw do materiału, nie decyzja projektowa — i dlatego dzisiejsza forma rysowana z barw pozostaje sensownym stanem domyślnym, dopóki tamta sprawa nie jest załatwiona.

## Reguły niosące mechanikę

Trzy rzeczy wyglądają na decyzje wizualne, a są mechaniką ukrycia sufitu. Nie wolno ich zmienić bez konfrontacji z regułą ukrytego sufitu:

1. **Strzałka potencjału liczy się wyłącznie z wieku i pozycji zawodnika** (progi `peakStart`/`peakEnd` z `AGE_PROFILES`, różne dla każdej pozycji): `▲` poniżej `peakStart`, `≈` w przedziale plateau, `▼` powyżej `peakEnd`. Nigdy z sufitu ani z żadnej wielkości z nim skorelowanej — inaczej po jednym sezonie widać, kto był trafiony, i cała loteria traci sens. Modyfikator formy sezonowej (Task 7 planu z 2026-08-12) też nie wchodzi do glifu — pokazywanie go zamieniłoby strzałkę we wskaźnik przewidujący.
2. **Kolor oceny liczy się wyłącznie z OVR**: ≤62 czerwony, 63–70 bursztyn, 71+ zielony.
3. **Percentyle w raporcie analityka to obserwacje bieżącej niedoszacowanej wartości** (OVR + `marketEdge`, plus osobne `metricDelta` dla każdej z dwóch metryk — obie oceniają jakość). `marketEdge` jest stałe, wyprowadzone z ID i profilu pozycji oraz niezależne od sufitu, OVR i wieku. Wyświetlana wartość `wartość · percentyl` to deterministycznie przeskalowana obserwacja przez displayScale — nie nowy pomiar, ta sama obserwacja przystępniej. **Jedynym dozwolonym sygnałem sufitu jest StaffOutlook dla zawodników poniżej szczytowego wieku**, który jawnie podaje zaszumiony poziom docelowy wraz z niezależnie losowaną pewnością; sam percentyl zostaje wewnątrz i nigdy nie trafia na kartę.

Konsekwencja dla wykresu percentyli: dwa znaczniki na jednej osi 1–99, **bez punktu środkowego i bez wypełnienia między nimi**. Oba są jakościowymi obserwacjami tej samej domeny z osobnymi odchyleniami metryk — mogą się potwierdzać albo rozchodzić, ale nie są szacunkami sufitu.

**Jeden świadomy wyjątek: przyrost OVR wolno pokazywać.** Dla wieku poniżej `peakStart` (zależnego od pozycji) `develop()` liczy `ovr += (sufit − ovr) · los(0,26–0,42)`, więc przyrost koreluje z odległością do sufitu. Mimo to pokazujemy go wszystkim zawodnikom — decyzja właściciela produktu z 2026-08-09. Uzasadnienie: różnicę OVR między sezonami gracz i tak widzi na własne oczy, więc wskaźnik nie odsłania nowej wiedzy, tylko oszczędza liczenie w pamięci. Modyfikator formy sezonowej dokłada do tej samej, już widocznej liczby dodatkowy, niesufitowy składnik — to nie jest nowy wyciek, bo forma nie koreluje z sufitem w żaden sposób.

To jest **jedyne** dopuszczone odstępstwo. Wszystkie pozostałe wskaźniki pochodne sufitu (sortowanie po przyroście, nagłówek „urósł najbardziej", jakikolwiek ranking rozwoju) pozostają wyciekiem.

Rozwój liczy się **raz na sezon**, w kroku `koniecSezonu` — nie po rundzie. Wskaźnik pokazuje więc **zmianę od poprzedniego sezonu**, pojawia się w oknie letnim, a legenda musi to mówić wprost. „Zmiana od poprzedniej rundy" byłaby zawsze zerem.

## HUD

Cztery liczby, nigdy więcej (kryterium akceptacji 2). W oknie transferowym: **kasa · średnia płaca na rok · prognoza · licznik ofert**.

Wartość kadry, mimo że liczy się do dziedzictwa, **nie wchodzi do HUD-u okna** — pod zegarem nie zmienia decyzji. Jej miejsce jest na ekranie końca sezonu.

Nazwa klubu i rozgrywki europejskie stoją nad HUD-em jako **słowa**, więc limitu nie naruszają.

## Układ

- Szerokość odniesienia **360 px**, bez poziomego przewijania (kryterium akceptacji 8).
- **Nagłówek nie jest przyklejony.** Pasek klubu i HUD przewijają się z treścią; przyklejony jest wyłącznie pasek akcji.
- **Na mobile pasek akcji reaguje na przewijanie**: chowa się w dół, wraca w górę i **zawsze wraca na końcu listy**. Od szerokości 768 px pozostaje stale widoczny. Przy `prefers-reduced-motion: reduce` mechanizm jest wyłączony i pasek zostaje na stałe.
- Na desktopie nagłówek i pasek akcji są wyśrodkowanymi panelami o szerokości maksymalnie 470 px, z pełną obwódką i zaokrągleniem — nie rozlewają się na całą szerokość okna.
- **Kadra to linie formacji** 1 · 4 · 3 · 3, kafelki równej szerokości, linie wyśrodkowane względem siebie. Zmiennicy pod podstawowym, każdy w osobnym wierszu, bez limitu liczby.
- Wszystkie listy poziome (anomalie rynkowe) muszą dać się przewijać **przeciąganiem myszą**, nie tylko gestem — gracze desktopowi też będą.

## Karta oferty

Jedna gramatyka dla wszystkich czterech typów, w tej kolejności:

```
pasek nadawcy: herb klubu + zdanie + zegar
─────────────────────────────────────────
typ · pozycja (skrótem: POM, ŚO, ŚN)
nazwisko                        [koszulka]
ocena · wiek
klub zawodnika
blok kwot
kadra na tej pozycji  →  Rozwiń
ocena sztabu (Staff Assessment) — zawsze obecna, semantyka zależna od wieku
raport analityka (Analyst Report) — dwie metryki
```

**Blok „Kadra" na karcie oferty** (stan z 2026-08-20; **wyprzedza mockup z 18 sierpnia**). Cały blok jest jednym przyciskiem otwierającym szufladę — kafelki są tym, w co gracz celuje najpierw, a wcześniej nie robiły nic. Jest to legalne, bo nieinteraktywny `Tile` renderuje się jako phrasing content (`<span>` ze `<span>`ami, bez `<div>` i `<ul>`), a `role="group"` nie jest interaktywne, więc nie powstaje `nested-interactive`.

Blok niesie podgląd kafelków pozycji i dwa wiersze etykieta–wartość w tej samej gramatyce z kropkami co metadane raportu:

| wiersz | treść | uwagi |
| --- | --- | --- |
| `Głębia pozycji` | `1 podstawowy · 1 zmiennik` | **ukryty w UI**, zostawiony w kodzie — kafelki obok mówią to samo. Wraca po zdjęciu `hidden`, ale wymaga też reguły CSS: `display: flex` bije UA-owe `[hidden]` |
| `Jakość pozycji` | `dobra` / `średnia` / `słaba` | ocena z widocznego OVR: podstawowy wobec średniej naszej XI plus zabezpieczenie za nim; Europa podnosi wymóg głębi, bo `squadRatings` waży wtedy ławkę mocniej |
| `Status zawodnika po transferze` | `podstawowy` / `pierwszy zmiennik` / `uzupełnienie kadry` | gdzie oferowany zawodnik wskoczyłby **na swojej pozycji**. Przy ofercie sprzedaży i przedłużenia etykieta brzmi `Obecny status zawodnika` — to samo pytanie z drugiej strony |

Sygnał otwarcia to **`cała kadra ›`**, nie `rozwiń`: nic nie rozwija się w miejscu, nad kartą wysuwa się szuflada z całą formacją. Szewron mówi „to prowadzi dalej", czyli prawdę.

Linie leżą obok kafelków, kiedy mają na to miejsce, i pod nimi, kiedy nie mają — decyduje `flex-basis` treści, nie breakpoint. Kafelek wyśrodkowuje się dopiero wtedy, gdy zostaje na swoim wierszu sam.

- **Ocena sztabu** pojawia się dla każdej oferty, z różną semantyką zależną od wieku zawodnika. Poniżej `peakStart` pozycji pokazuje **potencjał** (outlook: `limited`/`leagueLevel`/`leadingLeague`/`aboveLeague` + pewność `high`/`medium`/`low`, losowana niezależnie od percentyla, ale tym częściej wysoka, im bliżej `peakStart`). Przy `peakStart` lub wyżej pokazuje **obecny poziom** (outlook zależny od OVR, pewność zawsze wysoka). Etykieta zmienia się razem z semantyką („Potencjał według skauta" vs. „Obecny poziom według trenera"). To jedyny dozwolony sygnał o suficie dla zawodników poniżej szczytowego wieku; dla dorosłych zawodników okno nie odsłania sufitu, tylko bieżącą ocenę.
- **Raport analityka** zawsze pojawia się jako osobna sekcja, zawiera dwie metryki jakościowe z wymiarem próby (`small`/`medium`/`large`). Obie linie pokazują `wartość · percentyl` — deterministycznie przeskalowaną obserwację bieżącej domeny (OVR + `marketEdge` i osobne `metricDelta` na metrykę). Nigdy sufitu.
- Linijki analityka podają **wartość, nie samą pozycję w rozkładzie**.
- Blok kwot: dwie duże liczby obok siebie, pasek udziału w kasie, etykieta rynku, trzy skutki transakcji z podpisami.
- Przyciski tłumaczą, co się stanie, **prostym językiem zamiast procentów**. Każdy typ oferty ma własne teksty.

## Szuflada kadry

Jeden kontener, dwa tryby, jeden nagłówek. Wejście z karty oferty otwiera **siatkę formacji** z wyróżnioną pozycją oferty; kliknięcie kafelka przełącza szufladę w **listę zawodników tej pozycji**. Wejście z ekranu przeglądu kadry pomija pierwszy poziom — kafelek otwiera listę od razu. Raport rozwija się **w miejscu**, wewnątrz listy: lista i raport to jeden ekran, bo gracz ma porównywać zawodników między sobą, a nie wędrować w głąb.

Układ pochodzi z produkcji i jest jeden: uchwyt → nagłówek (obszar przeciągania) → treść jako **jedyny** scroller → przycisk wyjścia. Nie powstaje osobny popup na mobile, dwukolumnowe okno na desktopie ani wyśrodkowany dialog dla którejkolwiek ścieżki wejścia.

Cztery rzeczy, które wyglądają na drobiazgi, a nie są:

1. **Dwie kontrolki, dwie różne czynności.** Strzałka `‹` w nagłówku cofa o jeden poziom i **zostawia szufladę otwartą**; przycisk na całą szerokość na dole **wychodzi z szuflady** z dowolnej głębokości. Nie wolno ich połączyć: szuflada jest dodatkiem do oferty, graczowi tyka zegar, a sekwencja „najpierw wróć do kadry, potem do oferty" to dwa dotknięcia zamiast jednego. Strzałka jest ukryta wszędzie tam, gdzie nie ma poziomu, z którego można cofnąć.
2. **Napis przycisku wyjścia zależy od wejścia:** `Wróć do oferty` z karty oferty, `Zamknij` z ekranu przeglądu kadry — tam nie ma żadnej oferty, do której można wrócić. Zmienia się napis, nie obecność: przycisk jest widoczny w obu trybach i **poza obszarem przewijania**, żeby nie odpływał przy długiej liście na niskim ekranie.
3. **Nagłówek jest jeden i zostaje obszarem przeciągania.** Drugi nagłówek w obszarze treści renderuje się jako karta pływająca na własnym tle szuflady, z podwójnym zaokrągleniem i podwójnym tłem. Przeniesienie uchwytu do przewijanej treści zabiłoby gest zamykania dokładnie wtedy, gdy raport jest długi.
4. **Przy każdym otwarciu wszystkie wiersze są zwinięte.** Szuflada nie pamięta, kogo rozwinięto poprzednio — ani po zamknięciu i ponownym otwarciu, ani po powrocie strzałką do siatki i wejściu z powrotem. Kafelek wyznacza pozycję, nigdy rozwinięcie. **Jeden wyjątek:** pozycja obsadzona przez dokładnie jednego zawodnika otwiera się z jego raportem już rozwiniętym — nie ma między kim wybierać, więc wybór jest całą interakcją, a wykonywanie go ręcznie to praca bez treści. Dwóch i więcej startuje zwiniętych.

Rozwinięcie wiersza przewija listę tak, żeby raport był widoczny, zostawiając nad nim kilka pikseli oddechu — **mniej niż odstęp między kartami**, żeby zmieścił się w przerwie zamiast wciągać z powrotem dolną krawędź poprzedniej karty; wtedy wygląda to jak nietrafione przewinięcie, a nie jak margines. Raport wyższy od listy równa się do **swojej góry**, żeby czytanie zaczynało się od początku, a nie w środku metryki. Przewijanie jest natychmiastowe, nigdy animowane — dzieje się przy każdym rozwinięciu i animacja kłóciłaby się z `prefers-reduced-motion`.

W szufladzie przewija się **dokładnie jeden pojemnik**: treść. Lista raportów nie może być drugim — dwa zagnieżdżone dają dwa paski obok siebie i sprawiają, że to loteria, który z nich ruszy gest. Kod przewijający do rozwiniętego wiersza musi **znaleźć** faktyczny scroller, a nie zakładać, że jest nim lista.

**Glif wieku w wierszu zostaje wygaszony i nie wolno go nazwać „potencjałem".** Liczy się wyłącznie z wieku i pozycji; kolorowanie go łamałoby regułę „jeden kolor = jedno znaczenie", bo zielone `▼` czytałoby się jak dobra wiadomość o zawodniku po szczycie. Kolor niesie liczbowa zmiana oceny, bo ona jest zmierzoną różnicą, a nie etykietą.

## Herby i koszulki

Rysowane z danych klubu, nie wgrywane jako pliki. Klub ma parę kolorów i wzór (pasy, szarfa, połowy); herb i koszulka biorą je z tego samego zestawu.

Przygaszenie jest obowiązkowe — `opacity` 0,55–0,6 plus obniżona saturacja i kontrast. To ozdoba, nie nośnik informacji: nazwisko czytelne stoi obok, w 27 px.

Koszulka pojawia się **wyłącznie tam, gdzie mowa o konkretnym zawodniku**. W kadrze byłaby szumem.

Nadruk: nazwisko po łagodnym łuku, pod nim duży numer. **Jeden stopień pisma i jeden łuk na wszystkich koszulkach** — nazwiska, które się nie mieszczą, są skracane z kropką („JĘDRZ."), a nie zmniejszane. Tak samo robi prawdziwy nadruk.

Wolny agent ma **szarą, gładką koszulkę i pasek bez herbu** — nigdzie nie gra.

### Barwy klubowe — model danych i kolejność wdrożenia (2026-09-11)

**Barw jeszcze nie ma i dzisiejszy herb jest neutralnym monogramem.** Zdanie wyżej o „parze kolorów
i wzorze" opisuje **stan docelowy**, nie dane w repo: `src/data/clubs.ts` nigdy nie miał pola
`colors`, a spek 4 §8.1 obiecywał, że barwy „przenoszą się z dzisiejszych wartości w kodzie" —
czego zrobić się nie da, bo takich wartości nie ma. Poniżej jest rozstrzygnięcie, żeby nikt
nie wymyślił palet ani nie szukał ich tam, gdzie ich nie było.

**Klub ma od jednego do trzech kolorów, nie parę.** Cracovia jest biało-czerwona, Legia zielono-
biało-czerwona, a niejeden klub identyfikuje się jednym kolorem. Model danych musi to unieść:
lista `1..3` kolorów, a **wzór** (pasy, szarfa, połowy) ma sens dopiero od dwóch. Wymuszenie pary
kazałoby dopisać drugi kolor tam, gdzie klub go nie ma — czyli wymyślić dane.

**Czytelność rozwiązuje reaktywna obwódka, nie dobór barw.** Herb i koszulka dostają obrys, którego
kolor — biały albo czarny — wybiera się z **relatywnej luminancji sąsiadującej barwy**: jasne barwy
dostają ciemny obrys, ciemne jasny. Dzięki temu **żadna barwa klubowa nie jest zdyskwalifikowana**,
łącznie z żółtą i białą, które na jasnym panelu same by zniknęły — a przypomnijmy, że przygaszenie
do `opacity` 0,55–0,6 dodatkowo je osłabia. Obwódka jest tańsza i uczciwsza niż podkręcanie barw
klubu do kontrastu: klub ma wyglądać jak on sam, nie jak jego czytelniejszy wariant.

**Obwódka jest własnością wspólnego komponentu, nie pojedynczego ekranu.** Znak klubu renderuje
dziś jeden `ClubHeading` (`src/ui/components/club-heading.tsx`) wołany przez `top-bar`, więc pojawia
się w HUD, przy ofertach i wszędzie tam, gdzie pasek jest widoczny. Reguła luminancji ma mieszkać
**w tym komponencie**, żeby nie dało się jej wdrożyć na jednym ekranie i zapomnieć o pozostałych.
To samo dotyczy przyszłej koszulki.

**Rozróżnienie tekstu jest dwustopniowe i pierwsza wersja tej sekcji była tu nieprecyzyjna.**
Herb **jest** monogramem, czyli dwiema literami wewnątrz kształtu, a koszulka niesie nadruk
z nazwiskiem i numerem — więc „barwa nigdy nie maluje tekstu" byłoby zdaniem bez sensu:

- **tekst wewnątrz pokolorowanego kształtu** (litery monogramu, nadruk koszulki) bierze kolor
  z **tej samej reguły luminancji co obwódka**. To jeden mechanizm, nie dwa: obrys i napis
  odcinają się od barwy klubu w ten sam sposób;
- **tekst obok kształtu** (nazwa klubu, sześć liczb na ekranie wyboru, etykiety) zostaje na palecie
  systemu i nigdy nie przechodzi na barwy klubowe.

Tam, gdzie kolor jest dekoracją, obowiązuje czytelność; gdzie niesie treść, obowiązuje pełny
kontrast WCAG 2.2 AA — i dlatego treść czyta się z palety, a nie z barwy klubu.

**Dane mieszkają we własnej tabeli, nie w plikach lig.** Kluby siedzą dziś w trzech populacjach
o trzech różnych kształtach rekordu: `clubs.ts` (osiemnastka Ekstraklasy), `first-division.ts`
(pula awansów z `strength`) i `foreign-clubs.ts` (same nazwy, **bez `clubId`**). Barwy obejmują
wszystkie trzy, więc dopisanie ich do każdego z tych plików z osobna dałoby trzy kształty tej samej
danej i trzy miejsca do rozjechania — dokładnie to, przed czym ostrzega komentarz w `clubs.ts`
(„tabela edytowana w dwóch miejscach rozjedzie się w jednym"). Barwy idą więc do **osobnego
`src/data/club-visuals.ts` (plik jeszcze nie istnieje), kluczowanego `clubId`**, tak samo jak finanse i miejsca europejskie.
Test wymaga dokładnie jednego rekordu na każdy klub każdej populacji.

**Pochodzenie jest obowiązkowe, jak przy każdej innej tabeli danych w tym repo.** Wzorem
`club-finance-sources.ts` i `uecl-sources.ts` każdy wpis niesie źródło i datę dostępu.

**Źródła istnieją i są sprawdzone — to nie jest temat do zgadywania.** Pierwotna wersja tej sekcji
sugerowała, że przy klubach niższych szczebli barwy trzeba będzie zgadywać; **to była nieprawda**
i została sprawdzona 2026-09-11:

- **[RSSSF, Poland Team Colours](https://www.rsssf.org/colours/poland.html)** — źródło **już zaufane
  i przypięte w tym repo** (`scripts/data/ekstraklasa-sources.ts` czyta z RSSSF wyniki ligowe).
  Obejmuje Ekstraklasę, II ligę i część niższych szczebli, a opisy niosą **także wzór**: pasy,
  połowy, obręcze, rękawy, szarfy i krawędzie — czyli dokładnie to, czego potrzebuje model wyżej.
  Przykłady odczytane przy sprawdzeniu: Znicz Pruszków „żółty, czerwone krawędzie", Stal Stalowa
  Wola „biały, czerwone krawędzie", GKS Katowice „żółto-czarne pasy".
- **Strony klubów** dla tego, czego RSSSF nie ma (przy sprawdzeniu brakowało Chrobrego, Pogoni
  Siedlce, Unii i Wieczystej). Chrobry Głogów podaje własną identyfikację wizualną — pomarańczowy
  i czarny — [w ogłoszeniu na stronie klubu](https://www.chrobry-glogow.pl/Klub/Aktualnosci/Nowa-identyfikacja-wizualna-Chrobrego-Glogow-SA~n2935).

RSSSF opisuje barwy **nazwami**, nie kodami; hex bierze się z identyfikacji wizualnej klubu, a RSSSF
rozstrzyga **wzór i układ**. Dwa źródła na dwie różne rzeczy, każde oznaczone osobno.

Reguła bezpieczeństwa zostaje mimo to: barwa, której nie da się potwierdzić, **nie jest zgadywana** —
rekord zostaje pusty, a klub renderuje neutralny monogram do czasu potwierdzenia. Po powyższym jest
to jednak **rzadki wyjątek, nie spodziewany wynik**.

**Monogram znika wraz z barwami — ale zostaje jako awaryjny.** Decyzja właściciela produktu
z 2026-09-11: gdy herb ma własne barwy i wzór, dwie litery w środku przestają być potrzebne i mają
zniknąć. Sprawdzone i bezpieczne: `ClubHeading` renderuje herb z `aria-hidden="true"`, a **nazwa
klubu stoi zawsze obok, w `<h1>`** — litery nie niosą więc żadnej informacji, której nie ma
w sąsiednim tekście, a WCAG 1.4.1 („kolor nie jest jedynym nośnikiem") nie wiąże, bo nośnikiem jest
ta nazwa, nie kształt.

Zastrzeżenie jest jedno i wynika z reguły „czego nie potwierdzisz, tego nie zgadujesz": **klub bez
potwierdzonych barw nadal renderuje monogram.** Inaczej dwa kluby bez danych byłyby nieodróżnialnymi
szarymi kształtami, a brak danych przestałby być widoczny. Monogram przestaje być domyślnym
wyglądem i staje się **sygnałem luki**.

**Kolejność: po kroku 7 speka 4.** Krok 7 rozszerza pulę zagraniczną z dziewięciu nazw do około
dwudziestu czterech i dopiero wtedy nadaje im identyfikatory. Zrobienie barw wcześniej znaczy
zrobienie ich dwa razy. Do tego czasu obowiązuje monogram — **z jednym jawnym wyjątkiem**: ekran
wyboru klubu może nieść prowizoryczny akcent barwny dla osiemnastki Ekstraklasy, opisany w planie
kroków 5–6 i przeznaczony do wymiany razem z resztą. Prowizorka ma być mała i oznaczona, żeby nikt
nie wziął jej za docelowy model.

## Język

- Kwoty w **mln €**, polski przecinek dziesiętny, twarda spacja przed jednostką (`1,25&nbsp;mln&nbsp;€`), żeby kwota nie łamała się na końcu wiersza.
- **Półpauzy** (`–`), nie pauzy (`—`).
- Liczebniki porządkowe z kropką: „sezon 5.", „Transfery sezonu 3.".
- Zwroty do gracza **małą literą**: „twojego zawodnika", nie „Twojego". To gra, nie korespondencja.
- Pozycje w kartach ofert **skrótem** (`POM`, `ŚO`), pełne nazwy tylko tam, gdzie jest miejsce.
- Nazwy stanów rynku na karcie oferty: **okazja / regularny / zawyżona**, a w podsumowaniu **nadpodaż / niedobór**. Opis nie może obiecywać, że ktoś przyjdzie po zawodnika — niedobór **podnosi szansę**, nie gwarantuje.
- **Karta sprzedaży czyta rynek od strony sprzedającego** (2026-10-08): **zaniżona / regularny / korzystna**, z kolorem odwróconym względem kart zakupu. Nadpodaż obniża kwotę sprzedaży (×0,78) i utrudnia targowanie, niedobór działa odwrotnie, więc zielona „okazja” nad obciętą ceną była nieprawdą. Pozostałe typy kart zostają przy brzmieniu kupującego, bo rynek działa na nie w tę samą stronę co na zakup (`marketLabel` w `src/ui/components/offer-card.tsx`).

## Popover objaśniający (`InfoPopover`, 2026-08-26)

Wspólny, wielokrotnego użytku komponent `src/ui/components/info-popover.tsx`: małe `?`, które objaśnia regułę podaną obok. Używają go wiersz pewności w ocenie sztabu oraz każda kanoniczna nazwa metryki w raporcie analityka. Metryka zachowuje angielską nazwę, ale tekst panelu jest po polsku i objaśnia definicję, jednostkę oraz kierunek wyniku. Każdy kolejny wiersz raportu podający regułę zamiast liczby ma używać tego samego komponentu; druga ręczna kopia rozjechałaby się dokładnie na tym, co najłatwiej zepsuć — obsłudze dotyku i powiązaniu dostępnościowym.

**Co komponent ma na własność:** otwieranie myszą (hover), klawiaturą (focus) i **jednym** tapnięciem; zamykanie przez zjechanie myszą, utratę fokusu, `Escape`, drugie tapnięcie i **dowolny pointer poza nim** (co obejmuje przełączenie na raport innego zawodnika); `aria-describedby`.

**Szerokość.** Panel ma szerokość swojego tekstu (`width: max-content`), nie całego wiersza — `right: 0` dawał czterowyrazowemu objaśnieniu to samo pudełko co czterowierszowemu. Ogranicza go `max-width: 100%` liczone względem **kontenera z `position: relative`**, który wybiera wywołujący; dla oceny sztabu jest to `.dd-staff-confidence`, a dla metryki `.dd-analyst-metric`, czyli cały właściwy wiersz. Wybór kontenera jest tu istotą rzeczy: żaden `max-width` liczony z viewportu nie wystarcza, bo przepełnienie zachodzi względem elementu dużo węższego niż viewport.

**Pozycja w poziomie.** Panel jest **wyśrodkowany na znaku `?` i przycięty do wiersza**. Liczy to czysty `popoverLeft` (`src/ui/components/info-popover.tsx`): `triggerCentre − panelWidth / 2`, a następnie clamp do przedziału od zera do `rowWidth − panelWidth`. Samo centrowanie, bez clampu, było pierwotną przyczyną wychodzenia panelu poza kartę — znak stoi na końcu etykiety, która często dobiega do prawej krawędzi.

Zmierzone: przy 1070 px krótkie objaśnienie trafia w środek znaku co do piksela, a długie przycina się o 16 px. Przy 360 px prawie zawsze wygrywa clamp, bo 267-pikselowy panel nie zmieści się wyśrodkowany pod znakiem w 292-pikselowym wierszu — i to jest zamierzone, bo mieszczenie się w karcie jest ważniejsze od symetrii. Arytmetyka jest czysta i przypięta testem jednostkowym, bo jsdom nie ma silnika układu: każda asercja o prawdziwym położeniu byłaby tam pusta.

**Dotyk: jedno tapnięcie, nie dwa.** Tapnięcie emituje `pointerdown`, potem `focus`, potem `click`. Zestaw handlerów otwierający na którymkolwiek z nich i przełączający na `click` zużywał całe tapnięcie na otwarcie i zamknięcie. Przełącznik siedzi więc na `pointerdown` (**tylko dla `pointerType !== "mouse"`**), przed `focus`: pierwsze tapnięcie otwiera, drugie zamyka — bez zdarzenia `focus`, bo przycisk już je ma. Mysz otwiera hoverem i nie zamyka kliknięciem.

**Animacja.** Panel nigdy nie znika z DOM i **nigdy nie jest ukrywany przed czytnikiem ekranu** — gaśnie samym `opacity` (160 ms, plus 3 px podjazdu), a bezczynny staje się przez `pointer-events: none`. Dzięki temu `aria-describedby` rozwiązuje się w obu stanach i jest co animować. `prefers-reduced-motion: reduce` wyłącza jedno i drugie.

**Osadzenie.** `?` stoi **w przepływie tekstu**, zaraz za słowami, które objaśnia (`display: inline-flex; vertical-align: middle`). Jako sąsiad we flexie był centrowany w pionie względem całego, dwuwierszowego bloku etykiety i odrywał się od tekstu.

**Wyśrodkowanie glifu.** Przycisk 13 px, `font-size: 8.5px`, `font-weight: 500`; wewnętrzny `span` ma `display: block` i `line-height: 1` — i **żadnej korekty optycznej**, co jest wynikiem pomiaru, a nie przeoczeniem. Zmierzone w Figtree przy 400 px (przy 8,5 px Chrome zaokrągla metryki do liczb całkowitych): pudełko czcionki to 380 nad linią bazową i 100 pod, a `?` zapisuje się od 287,5 nad do 6,25 pod — środek tuszu wypada 140,6 nad linią bazową wobec 140 dla pudełka. Sześć dziesiątych piksela przy 400 px to 0,0016 em, czyli nic. `display: block` z `line-height: 1` jest warunkiem koniecznym: podaje flexowi pudełko, którego środek jest środkiem czcionki. Bez którejkolwiek z tych deklaracji przycisk wraca do dziedziczonego `line-height: 1.4` i glif ucieka. W poziomie korekty też nie ma — obie odsadki `?` różnią się o 0,05 px. Ponieważ korekta wynika z metryk czcionki, a nie z ręcznego nudge'a, trzyma się tak samo na telefonie i na desktopie: zmierzone odchylenie środka tuszu od środka koła wynosi **−0,013 px w pionie i 0,000 px w poziomie** przy 360 px i przy 1280 px.

### Dokładne teksty objaśnienia pewności

W `src/ui/components/staff-confidence-help.tsx`, w kolejności pierwszeństwa:

1. **Pierwsza obserwacja** — wyłącznie gdy `focus === "potential"`, `confidence !== "high"` i `isFirstObservation`: „Sztab dopiero zbiera obserwacje o zawodniku, dlatego nie wystawia jeszcze raportu z wysoką pewnością." Nie pokazuje się w `current` ani przy gwarantowanym `high`.
2. `low` — „Ten raport może się jeszcze wyraźnie zmienić."
3. `medium` — „Ten raport może się jeszcze zmienić. Zawsze dogoni jednak to, co zawodnik pokaże na boisku."

   Bez liczby poziomów (decyzja właściciela z 2026-10-22). Limit z zapamiętanej pewności (`MAX_OUTLOOK_STEPS` w `src/logic/staff-assessment.ts`) omijają trzy ścieżki: gwarantowane `high`, podłoga z widocznego OVR i przejście na `focus: current` w sezonie `peakStart`, więc obietnica „najwyżej jeden poziom” bywała fałszywa. Podłoga jest jedyną obietnicą, której silnik dotrzymuje zawsze, i to ją podaje tekst `medium`.
4. **`high` na granicy pasma** — trzy teksty wybierane przez czysty `staffOutlookBoundaryReason(assessment, currentOvr)` (`currentUp`, `currentDown`, `potentialFloorUp`). Komponent **nie liczy progów** i nie rozstrzyga podłogi; dostaje wyłącznie gotową ocenę i widoczne OVR, nigdy `Player`. Ostrzeżenie pojawia się tylko wtedy, gdy zmiana OVR o **dokładnie jeden punkt** zmieniłaby widoczną kategorię — samo sąsiedztwo granicy nie wystarcza. W `potential` dodatkowo wymagane jest, żeby prognoza leżała dziś dokładnie na podłodze; spadek OVR nie obniża zamrożonej prognozy, więc nie dostaje analogicznego ostrzeżenia.
5. `high` w `potential` poza granicą — „Sztab traktuje ten raport jako stabilny."
6. `high` w `current` poza granicą — „Raport opisuje widoczny obecny poziom zawodnika."

**Ani jeden z tych tekstów nie używa słowa „ocena".** Gra nazywa OVR „oceną ogólną", więc „ocena" w objaśnieniu raportu skauta czyta się jako liczba obok, a nie jak gwiazdki i określenie tekstowe, o które chodzi. Mówimy „ten raport" — tymi samymi słowami, które stoją w nagłówku sekcji („Raport trenera (potencjał)"). Test `tests/ui/staff-confidence-help.test.tsx` pilnuje, żeby to słowo nie wróciło.

Teksty granicy uczą, **skąd bierze się sezonowa zmiana OVR** — wynik drużyny względem oczekiwań i miejsce w podstawowym składzie lub rotacji, przy spadku także wiek. „Podstawowy skład lub rotacja" odpowiada dokładnie zbiorowi `played` z `ageSquad`; silnik nie śledzi minut, więc tooltip nie udaje, że je zna. Żaden z tekstów nie podaje progu pasma, zakresu, sufitu ani dokładnego docelowego OVR.

## Kontrakt z testami

`data-dd-action` na przyciskach jest **publicznym kontraktem** z `tests/ui/dom-parity.test.ts` i `tests/e2e/smoke.spec.ts`. Wolno dokładać nowe, nie wolno zmieniać ani usuwać istniejących bez aktualizacji obu testów w tym samym commicie. Zmiana nazwy wywala test z powodu niezwiązanego z regresją.

## Dostępność

- Widoczny stan `:focus-visible` na każdym elemencie interaktywnym.
- Kontrast tekstu min. 4,5:1, elementów UI min. 3:1. **Paleta wyżej tego dziś nie spełnia i wie o tym** — zmierzone 2026-08-17, osiem tokenów w tekście 7,5–12,5 px: `--trend-reserve-negative` 1,83:1, `--trend-reserve-positive` 1,86:1, `--trend-positive` 2,04:1, `--trend-negative` 2,05:1, `--text-faint` 2,37:1, `--text-label` 2,82:1, `--text-muted` 3,31:1, `--text-caption` 4,21:1. Wiersz „Przygaszony, etykiety" w tabeli palety (`#7d8792`, `#8b939d`, `#98a1ab`) jest źródłem części tego rozjazdu: żadna z tych trzech wartości nie dochodzi do 4,5:1 na białym. **Najgorsze są jednak kolory trendu** — sezonowa zmiana OVR na kafelku zawodnika. To nie jest ozdoba, tylko informacja podana tekstem, więc obowiązuje 4,5:1, a nie 3:1; jasne zielenie i czerwienie z tego zakresu (73–78% jasności) nie mają szans przejść i wymagają przemyślenia razem z resztą kafelka, a nie samego przyciemnienia. Próg wymaga jasności ≤54,4%, więc spełnienie go zlewa całą czwórkę w jeden odcień obok `--text-meta` i kasuje hierarchię przygaszenia — to jest decyzja do podjęcia w redesignie, nie poprawka jednego tokenu. Liczby są przypięte przez `tests/ui/palette-contrast.test.ts` i **mogą tylko rosnąć**; `pnpm lint` i `tests/e2e/a11y.spec.ts` pilnują reszty dostępności.
- `prefers-reduced-motion: reduce` wyłącza animację zegara i chowanie paska akcji.
- Kolor nigdy nie niesie informacji sam — ocenie towarzyszy liczba, rozgrywkom skrót, zmianie OVR znak.

## Przegląd 2026-08-19: Decyzje właściciela produktu

Właściciel przejrzał działającą warstwę UI i wymagał następujących zmian :

- **Wyróżnienie percentyla zamiast nazwy metryki.** Nazwy metryk w raportach analityka wracają do zwykłej grubości (500), a percentyl (`25. percentyl`) zostaje pogrubiony (800). Zmienia to hierarchię wizualną — obserwacja (percentyl) jest teraz pierwszoplanowa, nazwa metryki jest kontekstem.
- **Zwiększona wielkość tekstu metadanych.** Wiersze „Percentyle na tle…", „Poziom klubu…", „Wielkość próby…" podniesiono z 9px do 10px. Wymóg: zachować co najmniej 4,5:1 kontrastu na `--text-secondary`.
- **Ozdobne separatory-przecinki między nazwą a wartością metryki.** Liderami z drobnych, niskiego kontrastu kratek między metryką a percentylem (CSS, `::after` na `.dd-metric-name`), degradujące się elegancko na wąskich ekranach gdy nie ma miejsca.
- **Koniec z przesunięciami poziomych markerów.** Poprzednia taktyka — przesunięcie drugiego markera w górę, gdy dwa percentyle były w odległości ≤5 punktów — jest zastępowana wyróżnieniem przez kształt (`circle` vs `diamond`) i wyraźne obramowanie (biały `border` + `box-shadow` na krawędzi). Oznacza to, że markery mogą się teraz nakładać, ale są rozróżniane kształtem i pierścieniem, nie pozycją. Mechanizm `.has-close-markers` i `.is-offset` jest całkowicie usunięty.

Zmiana nr 3 (liderami) jest czysto dekoracyjna — dostępność nie zmienia się. Zmiany 1–2 i 4 nie naruszają ukrytego sufitu ani żadnej z pozostałych reguł.

## Przegląd 2026-08-19: Zmiana gramatyki nagłówków Raportu skauta/trenera

Cztery nagłówki sekcji oceny sztabu (Staff Assessment) zmieniły się z formy „{typ} według {źródła}" na „Raport {źródła} ({typ})":

| focus | source | stare | nowe |
| --- | --- | --- | --- |
| potential | scout | Potencjał według skauta | Raport skauta (potencjał) |
| current | scout | Obecny poziom według skauta | Raport skauta (obecny poziom) |
| potential | coach | Potencjał według trenera | Raport trenera (potencjał) |
| current | coach | Obecny poziom według trenera | Raport trenera (obecny poziom) |

Zmiana jest czysto terminologiczna i nie dotyka zachowania.

## Przegląd 2026-08-19: Kolejne udoskonalenia Raportu analityka

Właściciel produktu wymagał czterech drobnych, ale istotnych zmian w warstwie UI raportu analityka:

1. **Kolor liderów — zmiana z `--border-subtle` na `--border-card`.** Kropkowany lider wypełniający lukę między nazwą metryki a percentylem był zbyt blady. Zmiana na jeden stopień ciemniej. Ten sam lider pojawia się również między tytułem raportu (`Raport analityka`) a liczbą minut (`2310 min`) — malowany tą samą, raz zadeklarowaną regułą, ale jako osobny element `.dd-analyst-leader`, nie pseudo-element (powód w punkcie 2 niżej).

2. **Lider w nagłówku Raportu analityka.** Wcześniej tekst i liczba minut były zsunięte w jeden wiersz bez separatora. Teraz nagłówek jest flex-kontenerem, a lukę wypełnia lider. **Uwaga:** w nagłówku lider musi być osobnym elementem (`<span class="dd-analyst-leader">`), nie pseudo-elementem na spanie z etykietą — pseudo-element takiego spana nie jest elementem flex tego wiersza, więc `flex: 1 1 auto` na nim nie działa i kropki w ogóle się nie renderują. Ten błąd wystąpił dwukrotnie, najpierw w rzędach metryk, potem w nagłówku. W rzędach metryk pseudo-element jest poprawny, bo to `.dd-metric-name` samo jest kontenerem flex.

3. **Zmniejszenie przerw wokół wykresu percentyli (evidence rail).** Wcześniej `.dd-evidence-rail { margin: 8px 0 0; padding-top: 9px }` i `.dd-analyst-metadata { margin-top: 12px; padding-top: 9px }`. Zmieniono na `{ margin: 4px 0 0; padding-top: 5px }` dla rail i `{ margin-top: 6px; padding-top: 5px }` dla metadanych. Wykres siedzi teraz bliżej rzędów metryk powyżej i bliżej metadanych poniżej, ale pozostałe trzy grupy (metryki → rail → metadata) są wciąż wizualnie odrębne dzięki samemu rozstępowi — brak linii separatorów. Końce wykresu (`1` i `99`) zostały dostosowane, aby się nie obcinały.

4. **Emfaza w trzech wierszach metadanych** przeszła najpierw z etykiet na wartości, a ostatecznie **zniknęła zupełnie** — patrz wpis „Układ dwukolumnowy…" niżej, który jest obowiązujący.

Żadna z tych zmian nie narusza mechaniki, dostępności ani bezpieczeństwa sufitu.

## Przegląd 2026-08-19: Skala osi percentyli i osadzenie glifów

1. **Końce osi to `1` i `99`, nigdy `0` ani `100`.** Percentyl to pozycja w rozkładzie, więc ani `0`, ani `100` nie są osiągalne: zawodnik nie może być gorszy ani lepszy od samego siebie. Podpisy `1/99` są też konwencją dostawców analityki, z których katalog czerpie kanoniczne nazwy metryk (StatsBomb, Opta, Wyscout) — skoro nazwy zostają po angielsku jako element edukacyjny, skala powinna czytać się tak samo jak u nich. Generator i tak losuje z `[3, 99]`, więc `99` jest realnie osiągalne, a `1` jest uczciwym dnem samej skali odniesienia, nie zakresu tego konkretnego losowania. Zastępuje to zapis `oś 0/99` z planu wdrożeniowego.

2. **Glif metryki podnosi się optycznie przez `position: relative; top: -1px`, nigdy przez `align-self: center`.** Pusty kwadracik wyrównany do linii bazowej siada pod optycznym środkiem tekstu i wygląda na opadnięty, więc trzeba go podnieść — ale wyłącznie malarsko. `align-self: center` wyjmuje glif z wyrównania bazowego, przez co linię bazową całego wiersza przejmuje span z tekstem; wiersz się przesuwa, karta zmienia wysokość, a przy 360×800 karta przewyższa ekran o tak niewiele, że strona przestaje się przewijać na tyle, żeby pasek akcji zdążył się schować. To nie jest teoretyczne: ta zmiana wywaliła e2e `keeps the offer card and action bar usable at 360 px` i odtwarzała się deterministycznie. `position`/`top` nie rusza układu.

## Przegląd 2026-08-19: Układ dwukolumnowy raportów, gwiazdki i brzmienia

Ten wpis jest **obowiązujący** dla wszystkiego, co dotyczy raportów na karcie oferty — jeśli któryś ze starszych wpisów wyżej mówi inaczej, rozstrzyga ten.

1. **Wszystkie wiersze obu raportów mają tę samą gramatykę: etykieta po lewej, kropkowany lider, wartość po prawej.** Dotyczy nagłówka raportu analityka (`Raport analityka` … `1202 min`), obu wierszy oceny sztabu i trzech wierszy metadanych. Lider jest zawsze pusty (`content: ""` albo pusty `<span>`) i malowany powtarzanym `radial-gradient` na `--border-card`; reguły paint są zadeklarowane **raz**, w jednej liście selektorów. Nigdy znakami — część czytników ekranu czyta treść generowaną, a ciąg kropek zamienia się wtedy w bełkot.

   **Lider musi być osobnym elementem wszędzie tam, gdzie kontenerem flex jest sam wiersz.** Pseudo-element na spanie-dziecku nie jest elementem flex tego wiersza, więc `flex: 1 1 auto` na nim nie działa i kropki nie renderują się w ogóle. Ten sam błąd wystąpił na tej gałęzi **trzykrotnie**. Wyjątkiem jest `.dd-metric-name::after`, bo `.dd-metric-name` samo jest kontenerem flex.

2. **W trzech wierszach metadanych nie ma żadnej emfazy.** Ani etykiety, ani wartości nie są pogrubione. Wcześniejsze wpisy opisujące pogrubienie etykiet, a potem wartości, są **nieaktualne**. Wiersz wielkości próby nosi etykietę `Wielkość próby minutowej` i podaje wyłącznie stopień (`mała` / `średnia` / `duża`) — słowo „próba” stoi już w etykiecie, a „minutowej” mówi wprost, czego ta próba dotyczy — dawne zdanie o tym, że metryki mogą sobie przeczyć, wyciągało za gracza wniosek i kosztowało wiersz przy 360 px.

3. **Ocena sztabu dostaje gwiazdki po prawej:** cztery stopnie dla poziomu (kolorem tekstu), trzy dla pewności (wyszarzone). Są **dekoracją** — `aria-hidden`, a znaczenie niosą sąsiednie teksty, które i tak podają to samo. Wolno je wyprowadzać wyłącznie z `staffAssessment.outlook` i `staffAssessment.confidence`; nigdy z sufitu, `marketEdge` ani percentyla.

4. **Poziomy nazywają zawodnika, nie miejsce w tabeli:** `Zawodnik niższej ligi` · `Przeciętny ligowiec` · `Czołowy ligowiec` · `Klasa europejska`. Świadomie **nie** powielają brzmień poziomu klubu (`dół ligi` / `środek ligi` / `czołówka ligi`), które stoją trzy wiersze niżej i mówią o zupełnie czym innym — te same słowa w obu miejscach czytałyby się jak ocena zawodnika, przed czym plan wprost ostrzegał przy linii o klubie.

5. **Pewność mówi o wiarygodności, nie o zgodności:** `obserwacje są wiarygodne` / `nie są w pełni wiarygodne` / `są mało wiarygodne`. Za outlookiem stoi jedna obserwacja, więc „spójne" sugerowało zgodność odczytów, której nie ma — pewność to szerokość szumu.

6. **Grupa porównawcza `attackingMidfielder` to `ofensywnej pomocy`.** Pełne „ofensywnych pomocników i skrzydłowych" było poprawne, ale najdłuższe z sześciu. Rozbicie grupy na dwie **nie wchodzi w grę bez retrace'u**: nazwa grupy wchodzi do ziarna `deriveSeed(id, grupa, …)`, które wyznacza zestaw metryk i `marketEdge`, a edge zmienia oceny meczowe.

7. **Okresy są w miejscowniku** (`w ubiegłym sezonie`, `w rundzie jesiennej`), żeby wiersz czytał się jako jedna fraza, bez kropki rozdzielającej.

8. **Historia zmian na ekranie startowym jest domyślnie zwinięta** do najnowszej wersji, z przyciskiem podającym liczbę ukrytych. Przycisk wygląda jak kolejna linijka changelogu, nie jak kontrolka: bez obwódki i tła, w kolorze i rozmiarze notatek, ze strzałką `▾`/`▴` (sama strzałka `aria-hidden`). Stan nie jest utrwalany.

9. **Dwie metryki jakości mówią dwie różne rzeczy.** Każda dostaje trwałe `metricDelta` z `[-20, 20]` pp względem wspólnej bazy domeny, wyprowadzone z ID zawodnika i ID metryki. Wcześniej obie obserwowały jedną liczbę i różniły się wyłącznie szumem: zmierzona korelacja `0,86`, a przy dużej próbie `0,94`. Druga linijka nie mogła więc zaprzeczyć pierwszej — a skoro nie mogła zaprzeczyć, jej zgodność z pierwszą nic nie znaczyła. Promień `20` wybrano pomiarem na 12 000 zawodników: mediana rozstępu pary rośnie z 9 do 11 pp, ale udział par rozjeżdżających się o 25 pp i więcej rośnie z `6,7%` do `16,7%` — zgodność zostaje przypadkiem typowym, a wyraźny rozjazd przestaje być ewenementem. `metricDelta` jest **wyłącznie warstwą prezentacji**: silnik dalej czyta `marketEdge`, więc zmiana nie wymagała retrace'u golden mastera. Ziarno nie dotyka sufitu ani niczego z nim skorelowanego.

10. **Karta nazywa klub, z którego zawodnik przychodzi.** `KUPNO` i `PANIC` pokazują nazwę zamiast `Klub nieujawniony`, a wolny agent `Bez klubu · ostatnio <klub>`. Nazwa i poziom w linii `Poziom klubu, w którym występuje/występował` pochodzą **z tego samego, raz wybranego klubu** (`externalAnalystContext`), więc nie mogą wskazać dwóch różnych miejsc. Wybór był deterministyczny już wcześniej — zmiana dokłada wyłącznie nazwę, nie rusza głównego RNG i nie zmienia śladu golden mastera. `SPRZEDAŻ` i `PRZEDŁUŻENIE` mają `sourceClub: null`, bo zawodnik jest już nasz. Odczyt na karcie jest odporny na brak pola: partia zapisana przed tą zmianą wznawia się bez niego, a `ENGINE_REVISION` nie rośnie, więc taki zapis nadal się wczytuje.

11. **Trzy wiersze metadanych mówią wprost, z czym porównujemy** (2026-08-20). Wiersz percentyli podaje `… z całej ligi w ubiegłym sezonie` — bez tego czytał się tak, jakby grupą odniesienia mógł być własny klub, a to zmienia sens całej liczby. Wiersz próby nosi etykietę `Wielkość próby minutowej` i wartość `mała` / `średnia` / `duża`: rzeczownik stał wcześniej po obu stronach lidera, a „minutowej” nazywa to, czego próba dotyczy. Wartości wszystkich trzech wierszy pozostają **z małej litery** — to dopowiedzenia do etykiety, nie samodzielne zdania.

## Potwierdzenie eksmisji z kadry (2026-08-27)

Transfer, który przepełnia pozycję, zwalnia obecnego zawodnika. Do 2026-08-27 działo się to po cichu — gracz akceptował ofertę i dopiero potem odkrywał, że kogoś brakuje. Nakładka pyta wcześniej i nazywa konkretnego zawodnika.

**Dokładne brzmienia.** Pasek: `LICZEBNOŚĆ KADRY`. Tytuł: `Limit zawodników na <POZ> został osiągnięty`. Wprowadzenie, wspólne dla `Bierz` i `Targuj się`: `W celu finalizacji transferu musielibyśmy zwolnić jednego zawodnika:`. Dalej dwa wiersze: `DOŁĄCZY` z nazwą, OVR i wiekiem oferowanego zawodnika oraz `ODEJDZIE` z tymi samymi danymi zwalnianego zawodnika. Pytanie: `Czy chcesz kontynuować?`. Przyciski: `Wróć do oferty` oraz odpowiednio `Potwierdź transfer` / `Rozpocznij negocjacje`.

**Zachowanie.** Fokus początkowy stoi na bezpiecznym `Wróć do oferty`, żeby przypadkowy Enter wracał do oferty, a nie zwalniał zawodnika; anulowanie oddaje fokus przyciskowi, który nakładkę otworzył. Escape i kliknięcie tła anulują. Escape należy do otwartej nakładki, nie do aktualnego celu fokusu, dlatego nasłuchuje go `document` i działa także po kliknięciu nieinteraktywnego tekstu. Tab krąży między dwoma przyciskami i nie wychodzi poza nakładkę.

**Timer biegnie pod nakładką.** To jest jeden krok tej samej decyzji pod presją czasu, nie pauza — nakładka nie daje darmowych sekund. Oferta, która wygaśnie w trakcie, unieważnia potwierdzenie, a gracz widzi wtedy wyłącznie zwykły komunikat o upływie czasu, nigdy fałszywego „kupiono”.

**`data-dd-action="eksmisja-kontynuuj"` i `eksmisja-anuluj` są publicznym kontraktem** na równi z pozostałymi — zmiana wymaga aktualizacji `tests/ui/dom-parity.test.ts` i `tests/e2e/smoke.spec.ts` w tym samym commicie.

**Zdanie po eksmisji jest identyczne w logu i powiadomieniu** — pochodzi z jednego formattera `squadEvictionMessage`: `Brak miejsca na <POZ> – kontrakt rozwiązany: <nazwa> (<ovr> OVR, <wiek> <lata/lat>).`. Nakładka opisuje tę samą parę zawodników przed decyzją, ale używa formy przyszłej i dwuwierszowego bilansu, więc nie współdzieli zdania przeznaczonego dla wykonanego zdarzenia.

Nakładka nie dostaje własnego koloru: eksmisja jest następstwem zwykłego transferu, nie nową kategorią zdarzenia, więc korzysta z istniejących tokenów `--surface-panel`, `--border-card` i `--text-primary`.

**Gramatyka wizualna.** Nakładka wygląda jak zwarta karta oferty, nie jak osobny ekran alarmowy: ma promień `10px`, neutralny pasek `LICZEBNOŚĆ KADRY` na `--surface-inset`, wnętrze z paddingiem `13px` i tę samą hierarchię Figtree co pozostałe karty. Pasek ma padding `12px 13px`, tekst `12px/700` z `line-height: 1.25`, tracking `0.08em` i kolor `--text-secondary`: jest etykietą sekcji, ale nie ściśniętą mikroetykietą ani drugim tytułem. Bilans transferu jest listą definicji z dwoma neutralnymi wierszami: wersalikowa etykieta `DOŁĄCZY` / `ODEJDZIE` po lewej, pogrubione nazwisko, OVR i wiek po prawej. Informacja nie dostaje koloru kierunku, bo oba wiersze są faktami składającymi się na jedną decyzję, nie osobnymi ocenami. Przyciski mają promień `9px`, minimum `44px`, bezpieczny wariant neutralny i ciemny wariant potwierdzający; ciemny oznacza „potwierdzam negatywne następstwo”, podczas gdy zielony wariant pozostaje zarezerwowany dla zwykłego, korzystnego wyboru oferty. Zachowują stany hover, active i focus oraz `touch-action: manipulation`. Panel zatrzymuje overscroll, a padding nakładki uwzględnia safe area. Nakładka stoi na warstwie `50`, jawnie nad powiadomieniem (`40`), więc ich kolejność nie zależy od miejsca renderowania w DOM.

## Powiadomienia i log decyzji (2026-10-08)

Decyzja właściciela: spójność i żadnych pominiętych danych. **Każda decyzja transferowa ma jedno zdanie**, z formattera w `src/logic/decision-messages.ts`. Reduktor wpisuje je do logu („Ostatnie decyzje transferowe”), a powiadomienie pokazuje **ten sam wpis słowo w słowo**, dopiero gdy reduktor przyjął decyzję (`pendingNotificationText`), więc baner i log nie mogą opisać jednej decyzji inaczej. Dotyczy wzięcia, targowania (wygranego i przegranego), braku środków i „pas” na każdym typie karty.

- **Druga osoba czasu przeszłego**: „Kupiłeś”, „Sprzedałeś”, „Podpisałeś kontrakt z”, „Przedłużyłeś kontrakt z”, „Odrzuciłeś ofertę:”, „Zatrzymałeś”. Wygrane targowanie to prefiks („Utargowałeś niższą kwotę.”) przed zwykłym zdaniem transakcji, więc kwota i płaca są zawsze. Prefiks zostaje także wtedy, gdy po targu zabrakło pieniędzy na zakup: gracz wygrał targ i stracił transfer, a log mówi jedno i drugie.
- **Zawodnik zawsze jako `playerFacts`**: `K. Nowy (73 OVR, 24 lata)`, tak samo w zdaniu o eksmisji i o debiucie z akademii.
- **Każda kwota przez `money()`**, płaca jako `money()/rok`. Płaca pada przy każdej decyzji, która zmienia listę płac (zakup, wolny agent, sprzedaż, przedłużenie, odejście po przegranym targu), a przy sprzedaży jest to płaca z kontraktu, z mnożnikiem.
- **Powiadomienie dokłada tylko prognozę budżetu**: „Prognozowana zmiana budżetu rośnie do +1,20 mln €.”, liczoną ze składu, który reduktor faktycznie zostawił (eksmisja i debiutant z akademii wliczone). Gdy decyzja jej nie ruszyła, zdania nie ma.
- **Przeciąganie** ogłasza się od razu (nowe warunki są znane przed reduktorem) i wymienia każdy warunek, który się zmienił: przy zakupie kwotę i płacę, przy wolnym agencie i przedłużeniu płacę, przy sprzedaży kwotę.

Komunikaty spoza decyzji (wznowienie partii, upływ czasu, błędy zapisu) zostają przy własnych tekstach w `src/ui/app.tsx`.

## Świadomie odłożone

**Tryb ciemny.** Dołożenie później to wymiana wartości w jednym pliku zmiennych; projektowanie obu naraz teraz podwaja liczbę decyzji, zanim którakolwiek jest sprawdzona w grze. Do tego czasu paleta ma żyć w zmiennych CSS, nie w wartościach wpisanych w komponenty.
