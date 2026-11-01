# Estymator ρ — metoda, zbieżność i budżet czasu (2026-08-31)

Zadanie 2 protokołu badania ρ. Rozstrzyga, **czym** zostanie policzone ρ i **ile to potrwa**, zanim powstanie estymator. Wszystkie liczby niżej pochodzą z dopuszczonego przez plan spike'a benchmarkowego, który nie zaraportował ani ρ, ani `p`, ani przedziału, i nie wszedł do repozytorium.

Powód, dla którego ten dokument istnieje przed kodem: plan żąda dziesiątek tysięcy pełnych optymalizacji modelu o ~350 parametrach. Gdyby jedno dopasowanie kosztowało minutę, rozdział 3 planu byłby niewykonalny i trzeba by go przeprojektować, a nie odkrywać to po napisaniu estymatora.

## 1. Metoda: profilowanie ρ, L-BFGS w środku

**Zewnętrzna pętla po ρ, wewnętrzna po parametrach klubów i `home`.** Przy ustalonym ρ funkcja celu jest gładka i bezwarunkowa, a ρ jest jednowymiarowe — więc profil wiarygodności, którego plan i tak wymaga do przedziału ufności (2.2 punkt 2), **jest produktem ubocznym samego dopasowania**, nie osobnym przebiegiem. To rozstrzyga wybór: jednoczesna optymalizacja wszystkich 347 parametrów naraz dałaby tę samą estymatę i nie dałaby krzywej profilowej.

- **wewnątrz: L-BFGS** (pamięć 10) z **analitycznym gradientem** i **silnymi warunkami Wolfe'a** w line searchu (`c1 = 10⁻⁴`, `c2 = 0,9`, bracketing plus zoom przez bisekcję);
- **na zewnątrz: złoty podział** na przedziale `ρ ∈ [−0,20; 0,15]` do szerokości `10⁻⁵`, z ciepłym startem z poprzedniego punktu.

**Sam Armijo nie wystarcza i to jest wynik pomiaru, nie przezorność.** Pierwsza wersja spike'a miała backtracking wyłącznie z warunkiem spadku. Kończyła „zbieżnością" po 29 iteracjach z normą gradientu **6,5·10⁻³**, bo wychodziła po kryterium poprawy funkcji celu, nie po gradiencie; próba zaostrzenia kryterium do `10⁻⁴` nie skończyła się w dziesięć minut. Bez warunku krzywizny pary `(s, y)` są złej jakości, przybliżenie hesjanu się psuje i ogon zbieżności stoi. Po dołożeniu Wolfe'a to samo dopasowanie schodzi do `3,4·10⁻⁶` w 48 iteracjach i **97 ms**.

### Ograniczenia

- **`Σ_i atk_{i,s} = 0` per sezon jest wbudowane w funkcję celu, nie dołożone jako mnożnik.** Wektor parametrów jest wolny, a funkcja celu centruje atak w obrębie sezonu, zanim policzy λ i μ. Gradient przechodzi przez to odwzorowanie (`∂/∂raw_k = ∂/∂cent_k − średnia`), więc kierunek zerowy nie niesie gradientu i optymalizator nie błądzi wzdłuż niego. Odpowiada to dokładnie wymogowi z rozdziału 3 planu i jest tańsze niż mnożnik Lagrange'a.
- **`τ > 0` dla wszystkich czterech niskich wyników w każdym meczu** jest sprawdzane w pętli po meczach, a nie tylko dla wyniku zaobserwowanego. Naruszenie zwraca `+∞`, co line search Wolfe'a traktuje jak każdy inny zbyt duży krok i połowi. Nie ma tu żadnego `NaN` do wychwycenia po fakcie.

  **To zdanie opisywało zamiar, a nie kod, aż do 2026-08-31.** Funkcja wiarygodności sprawdzała wyłącznie komórkę faktycznie zaobserwowaną, więc przyjmowała punkty przypisujące ujemne prawdopodobieństwo wynikowi, który po prostu nie padł: przy `λ = μ = 3` i `ρ = 0,2` mamy `τ(0,0) = −0,8`, a mecz zakończony 2:2 wracał ze skończoną wartością. Wyłapała to zewnętrzna recenzja, nie test — fixture testowy zawierał niskie wyniki, na których ograniczenie działało przypadkiem. Konsekwencją zaostrzenia jest to, że profil potrafi trafić na `ρ`, przy którym model nie jest dopasowywalny; takie `ρ` jest raportowane jako nieskończoność, czyli **poza przedziałem**, i liczone w polu `searchFailures`. `feasibleRhoRange` nie zastępuje tego sprawdzenia, bo liczy się je raz, przy jednym zestawie parametrów, a λ i μ zmieniają się w trakcie dopasowania.
- **Dziedzina ρ jest ograniczona danymi, nie umową.** Warunki `1 − λμρ > 0`, `1 + λρ > 0`, `1 + μρ > 0`, `1 − ρ > 0` dają `ρ ∈ (max_m(−1/λ_m, −1/μ_m), min_m(1/(λ_mμ_m), 1))`. Przedział startowy `[−0,20; 0,15]` mieści się w środku tego, co dane dopuszczają — 24 dopasowania wewnętrzne złotego podziału przeszły bez jednego trafienia w `+∞`. **Estymator dopuszcza oba znaki ρ**, zgodnie z rozdziałem 3 planu; ograniczenie do `ρ ≤ 0` należy do samplera gry, nie do pomiaru.

### Kryterium zbieżności i zachowanie przy jego braku

**`‖∇‖_∞ < 10⁻⁵`, i to jest najciaśniejsze osiągalne kryterium.** Zmierzone: `10⁻³` → 34 iteracje, `10⁻⁴` → 39, `10⁻⁵` → 48 iteracji i norma `3,4·10⁻⁶`. Przy `10⁻⁶` optymalizator **nie zbiega** — zatrzymuje się na `3,0·10⁻⁶` i dalej nie schodzi. To podłoga arytmetyki zmiennoprzecinkowej na sumie 2944 składników, nie usterka. Kryterium `10⁻⁶` byłoby warunkiem, którego nie da się spełnić nigdy, więc żądanie go produkowałoby wyłącznie fałszywe alarmy.

**Kryterium skaluje się liczbą meczów, bo skaluje się nią gradient.** Powyższe `10⁻⁵` zmierzono na przypiętym oknie (2944 mecze). Każda składowa gradientu jest sumą po meczach i tak samo sumuje się jej błąd zaokrąglenia, więc próg bezwzględny zmierzony na jednym rozmiarze danych **nie jest progiem** — estymator wywracał się na czterokrotnie większej lidze, mając poprawną odpowiedź. Obowiązuje więc `10⁻⁵ · max(1, mecze/2944)`.

**Brak zbieżności jest błędem, nie cichą wartością** — ale flagi optymalizatora nie wolno mylić z jakością wyniku. Dwa z pięciu losowych punktów startowych zgłosiły niepowodzenie line searcha **po** osiągnięciu tej samej wartości funkcji celu co pozostałe trzy z dokładnością do `2·10⁻¹¹`. Dlatego reguła jest dwustopniowa. Historia krzywizny zbudowana blisko optimum potrafi wskazać kierunek, za którym line search nie umie pójść; **pierwsze niepowodzenie kasuje historię i ponawia krok najszybszego spadku**. Dopiero niepowodzenie przy pustej historii jest niepowodzeniem: estymator przyjmuje wynik, gdy norma gradientu jest poniżej dziesięciokrotności progu zbieżności, a poza tym **rzuca wyjątkiem z podaniem ρ i normy**. Restart zdjął wszystkie graniczne wywrotki, które wcześniej zależały od tego, o ile próg akceptacji rozminął się z rozmiarem zbioru. Replikacja bootstrapu, która rzuci, jest liczona i raportowana, nigdy po cichu pomijana — pominięcie przesuwałoby rozkład statystyki testowej.

### Wiele punktów startowych

**Pięć startów tam, gdzie coś się rozstrzyga, i zapisana rozbieżność.** Zmierzona rozbieżność wartości funkcji celu między pięcioma losowymi punktami startowymi przy `ρ = −0,05` wynosi **najwyżej `2,0·10⁻¹¹`** na ujemnej log-wiarygodności rzędu `5·10³`. To jedenaście rzędów wielkości poniżej skali, na której rozstrzyga test ilorazu wiarygodności (χ² przy `p = 0,01` to 6,63), więc powtarzalność optimum jest rozstrzygnięta, a nie założona. Estymator liczy wszystkie pięć, bierze najlepsze i **raportuje rozrzut**; rozrzut powyżej `10⁻⁶` jest błędem, nie ciekawostką.

**Replikacje bootstrapu i syntetyczne zbiory analizy mocy dostają jeden start, i to nie jest odstępstwo.** Startują ciepło z dopasowania, które już zbiegło na danych o tym samym kształcie, co jest startem mocniejszym niż którykolwiek z pięciu losowych. Pięć startów należy do **tego jednego dopasowania, które o czymś rozstrzyga** — pomnożenie ich przez 3500 zbiorów kupiłoby wyłącznie pięciokrotny rachunek.

Gradient analityczny sprawdzony wobec różnic centralnych w sześciu współrzędnych: największy błąd względny **`2,5·10⁻⁷`**. Ten test wchodzi do `pnpm verify` w zadaniu 3.

## 2. Zależność zewnętrzna: nie

**Optymalizator jest własny, ~150 linii w `scripts/rho/`.** Powody, w kolejności wagi:

1. Cała subtelność tego problemu siedzi w warunku krzywizny line searcha — czyli dokładnie w tym miejscu, które biblioteka schowałaby. Skoro pierwsza wersja spike'a przewróciła się właśnie na tym, ten fragment ma być widoczny i otestowany, a nie przyjęty na wiarę.
2. Gradient analityczny wyprowadza się z modelu i tak; biblioteka bezgradientowa byłaby o rząd wielkości wolniejsza, a gradientowa i tak wymaga tej samej funkcji.
3. Repo nie ma dziś ani jednej zależności runtime w `scripts/`. Dołożenie jej dla jednorazowego audytu kosztuje wpis w `knip.config.ts`, powierzchnię dostaw i decyzję do udokumentowania — przy 150 liniach, które i tak trzeba przetestować.

Gdyby ta decyzja się kiedyś odwróciła, dokumentuje się ją tutaj.

## 3. Budżet czasu ściany

Zmierzone na tej maszynie, jednowątkowo, przez `tsx`:

| operacja | czas |
| --- | ---: |
| jedno dopasowanie wewnętrzne, zimny start, `gtol = 10⁻⁵` | **97 ms** |
| jedno dopasowanie wewnętrzne, ciepły start | **62 ms** |
| **jedno pełne dopasowanie** (profil ρ złotym podziałem, 24 dopasowania wewnętrzne) | **0,9 s** |
| **jedna replikacja bootstrapu parametrycznego** (dopasowanie pod H₀ + pełny profil) | **1,75 s** |
| **cały bootstrap blokowy, 2000 replikacji** (2026-09-01, po separacji) | **≈ 2,7 s** |

Stąd cały plan:

| przebieg | replikacje | czas |
| --- | ---: | ---: |
| estymata punktowa + krzywa profilowa, okno dziesięciu sezonów | — | < 10 s |
| to samo, okno dziewięciu sezonów | — | < 10 s |
| bootstrap parametryczny LRT, okno główne | 5 000 | **146 min** |
| bootstrap blokowy po sezonach, okno główne | 2 000 | **≈ 3 s** |
| kalibracja błędu I rodzaju (`ρ = 0`) | 2 000 | 40 min |
| moc dla `ρ = −0,04 / −0,08 / −0,12` | 3 × 500 | 30 min |
| powtórka LRT i bootstrapu blokowego na oknie dziewięciu sezonów | 2 000 + 2 000 | 40 min |
| **razem** | | **≈ 4,3 h** |

**Bootstrap blokowy przestał być pozycją w tym budżecie 2026-09-01.** Jego bloki sezonowe nie dzielą żadnego parametru poza ρ, więc profilowana wiarygodność się po nich rozpada i jedna krzywa na sezon obsługuje wszystkie replikacje jako ważone sumy (`scripts/rho/dixon-coles-blocks.ts`). Z 30 minut zrobiło się 2,7 s — dwa rzędy wielkości, zmierzone, nie oszacowane.

Ma to jedną konsekwencję ważniejszą od samego czasu. **Pomiar pokrycia przedziału blokowego, dotąd niewykonalny**, kosztuje teraz około 40 minut (200 zbiorów × 4 ρ × 2000 losowań). Dopóki był niewykonalny, wybór między przedziałem percentylowym, BCa a zejściem na 95% musiał zapaść na teorii; teraz może zapaść na liczbie, tak jak zapadło pokrycie przedziału profilowego. Ta zmiana budżetu jest więc zmianą tego, co badanie umie rozstrzygnąć, a nie tylko tego, jak długo czeka.

**Stawka 1,20 s była pomiarem sprzed dwóch zmian, które ją podniosły** — sprawdzania τ dla wszystkich czterech niskich wyników i ponawiania ze świeżych losowych startów. Obie były słuszne, obu nie przemierzono, i przez to szacunek całego przebiegu chybiał o 46%. Zmierzone ponownie 2026-09-01 różnicowo: sto dodatkowych replikacji wydłużyło przebieg z 35 s na 367 s, czyli **1,75 s na replikację**. Ten dokument sam żąda mierzenia zamiast szacowania; regułę stosuje się także do samego dokumentu.

Cztery godziny jednorazowo są do przyjęcia i **nie wymagają zrównoleglenia**. Gdyby wymagały, `node:worker_threads` jest oczywistą drogą — funkcja celu nie ma stanu dzielonego poza tablicą meczów — ale dokładanie tego teraz byłoby optymalizacją bez potrzeby.

**`pnpm audit:rho-power` i `pnpm audit:rho` stoją poza `pnpm verify`**, tak jak `pnpm balance` i `pnpm test:e2e`. W bramce siedzą wyłącznie sekundowe testy z zadania 3.

## 4. Replikacje, ziarna i reguła zatrzymania

Plan (2.2) żąda podania ich **przed** uruchomieniem, bo „dolosuję jeszcze setkę" jest cichym stopniem swobody. Zatem:

- **Bootstrap parametryczny losuje z ograniczonego MLE, nie z alternatywy z wyzerowanym ρ.** Do 2026-08-31 losował z `params` przy ρ ustawionym na zero, a to jest inny model: na przypiętym oknie ograniczone dopasowanie ma ujemną log-wiarygodność mniejszą o 0,150, a pojedyncze λ różnią się nawet o 0,039. Test ilorazu wiarygodności symuluje pod hipotezą zerową **dopasowaną pod hipotezą zerową** — użycie parametrów zakłócających z alternatywy przesuwa rozkład, z którego odczytuje się `p`, a przy statystyce leżącej na progu 0,01 to przesuwa werdykt. Dlatego `ProfileFit` niesie osobne `nullParams`. Ta sama poprawka dotyczy wiersza „dopasowanie bez τ" w raporcie.

**Replikacja, która zawiodła, nie jest replikacją, która wypadła nisko.** Nieudane dopasowanie jest najpierw **ponawiane z trzech świeżych losowych startów**; dopiero potem liczy się jako awaria. Kwantyle i `p` liczy się wtedy wobec liczby **zamówionej**, nie ocalałej, a `p` raportuje się jako **przedział**: dolny koniec zakłada, że wszystkie awarie wypadłyby poniżej statystyki obserwowanej, górny — że powyżej. Przedział przekraczający próg 0,01 znaczy, że przebieg **nic nie rozstrzygnął** i trzeba go powtórzyć. Do 2026-08-31 kod liczył z krótszej tablicy, czyli robił dokładnie to pominięcie, którego ten dokument zakazuje akapit wyżej.

**Liczby replikacji są te z tabeli wyżej i są wiążące.**
- **Ziarna są jawne i deterministyczne**: replikacja `r` przebiegu `X` dostaje ziarno `BASE_X + r`, gdzie `BASE_LRT = 0x1d3c0de`, `BASE_BLOCK = 0x1d3c0de + 1_000_000`, `BASE_POWER = 0x1d3c0de + 2_000_000`. Ta sama baza co w pomiarze kosztu z 2026-08-28, żeby ziarna całego badania dały się odtworzyć z jednej liczby. Generatorem jest `src/logic/rng` (Mulberry32), nigdy `Math.random()`.
- **Reguła zatrzymania — zmieniona 2026-09-01 decyzją właściciela produktu. Pierwotne brzmienie zostaje niżej, bo protokół, którego historii nie widać, nie jest protokołem.**

  **Brzmienie pierwotne (2026-08-31), obowiązujące do zmiany:** `B = 5000` daje najmniejsze osiągalne `p` równe `1/5001` i błąd Monte Carlo `p` w okolicy 0,01 równy 0,0014. Jeżeli — i tylko jeżeli — wyjdzie `|p̂ − 0,01| < 3 · MC-SE`, czyli p̂ wpadnie w pas `0,0058–0,0142`, przebieg LRT zostaje **jednokrotnie** powtórzony przy `B = 20000` i decyduje ten drugi wynik. Nie ma trzeciej próby, a poza tym pasem nie ma pierwszego powtórzenia.

  **Brzmienie obowiązujące (2026-09-01):** `B = 20000` od razu, jednym przebiegiem, bez etapu pośredniego. Próg `p < 0,01` i **wszystkie pozostałe kryteria pozostają bez zmian**; zmienia się wyłącznie liczba replikacji i to, że nie ma etapu, który mógłby ją podnieść.

  **Dlaczego.** Stałe `B = 20000` daje wyższą precyzję niezależnie od tego, gdzie wypadnie `p`, i usuwa prawdopodobne powtórzenie tych samych pierwszych 5000 ziaren. Przy zmierzonej stawce 1,75 s na replikację ścieżka literalna kosztuje 14,1 h, z czego 3,4 h trafiłoby do kosza w gałęzi, w której eskalacja i tak zachodzi.

  **Czego ta zmiana NIE jest.** Nie jest równoważna pierwotnej regule: obie ścieżki dają tę samą liczbę **tylko w gałęzi, w której przebieg 5000 rzeczywiście uruchomiłby eskalację**. Gdyby `p̂` przy 5000 wypadło poza pasem, reguła pierwotna zatrzymałaby się tam i to tamten, mniej precyzyjny wynik by obowiązywał. Różnica między ścieżkami jest zatem realna, nie tylko czasowa — i idzie w stronę większej precyzji.

  **Kiedy zapadła.** Nie „przed poznaniem `p`". Statystyka `LRT = 6,726` była już policzona ostatecznie (nie zależy od liczby replikacji), a przebieg mocy dał przybliżony rozkład zerowy ze skalibrowanym kwantylem 99% równym 6,354 — czyli **mocną przesłankę, że `p` wypadnie w pasie eskalacji**. Decyzja zapadła przed właściwym bootstrapem, ale **po zobaczeniu tej przesłanki**, i tak trzeba ją czytać. Nie wprowadza nowego stopnia swobody, bo nie zależy od tego, po której stronie progu `p` ostatecznie wypadnie — ale nie wolno jej opisywać jako podjętej w nieświadomości.

  **Brak trzeciego przebiegu, w obie strony.** Jeżeli awarie replikacji dadzą przedziałowe `p` przecinające 0,01, wynik jest **nierozstrzygnięty** i nie ma kolejnej próby. Narzędzie samo to stwierdza (`reportStatus` → `inconclusive`), zamiast zostawiać ocenę czytającemu.


## 5. Czego ten dokument nie rozstrzyga

Nie rozstrzyga ρ, jego znaku, przedziału ani `p` — spike ich nie policzył i nie miał prawa. Nie rozstrzyga też werdyktu A–F: ten wymaga symulacji z zadania 6, nie samego dopasowania.
