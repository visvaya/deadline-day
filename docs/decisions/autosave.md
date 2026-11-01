# Autosave partii w trakcie rozgrywki

Decyzja z 2026-08-13: zamyka dług techniczny „brak persystencji”.

## Kontekst — dwie niezależne przyczyny odświeżania

Gracz zgłosił, że gra restartuje się od zera po przełączeniu aplikacji na telefonie albo po chwilowym wygaszeniu ekranu. Badanie kodu wykazało dwie osobne przyczyny, obie realne:

**1. Klient HMR Vite (tylko `pnpm dev`).** `node_modules/vite/dist/client/client.mjs:997-1004` — po zdarzeniu `vite:ws:disconnect` klient loguje „server connection lost. Polling for restart...", czeka na pierwszy udany ping i **bezwarunkowo woła `location.reload()`**. Gracz testował przez `pnpm dev --host` po Wi-Fi; zgaszenie ekranu telefonu zrywa websocket, więc po powrocie przeładowanie jest gwarantowane, niezależnie od tego, czy przeglądarka w ogóle wyrzuciła kartę z pamięci. Tej przyczyny nie ma na zbudowanym bundlu — `vite preview` i zwykły hosting nie wstrzykują klienta HMR.

**2. Wyrzucanie karty z pamięci przez przeglądarkę mobilną (dotyczy produkcji).** Cały `GameState` żył wyłącznie w `useReducer` (`src/ui/app.tsx`). W `src/` nie ma `location.reload()`, `meta refresh`, service workera ani `key` remountującego drzewo — po odzyskaniu karty React startował od `initialState()`.

Autosave zamyka obie przyczyny naraz: nawet jeśli strona się przeładuje (z dowolnego powodu), partia wraca w tym samym miejscu.

## Projekt: snapshot całego stanu, nie replay akcji

`GameState` jest w pełni serializowalny do JSON (same prymitywy, tablice i obiekty proste), a `rngState: number` plus czysty `gameReducer` sprawiają, że odtworzony snapshot to dokładna kontynuacja, bit w bit — dokładnie ten sam mechanizm, który golden master wykorzystuje do porównań.

Rozważaliśmy replay z `state.akcje` (mniejszy zapis, już istnieje w `game-archive.ts` dla ukończonych partii), ale token listy rejestruje tylko decyzje kartowe (`START:*`, `BIERZ`, `TARG`, `PAS`, `CZAS`), bez akcji strukturalnych (`OPEN_OFFERS`, `ADVANCE`, `RUN_EPILOGUE`) — odtworzyłby stan po auto-przewinięciu do najbliższej decyzji, nie ekran, na którym gracz naprawdę był (np. przegląd rynku między kartami). Snapshot ma też tę zaletę, że nie zależy od `src/logic/simulate.ts`.

Implementacja: `src/ui/game-save.ts`, klucz `deadline-day:game-save`, wzorowany na `src/ui/game-archive.ts` (ten sam styl walidatora kształtu, ten sam wzorzec `schemaVersion`).

## Zasada: zapisujemy tylko fazy rozgrywki

`RESUMABLE_PHASES` w `game-save.ts`: `przeglad`, `okno`, `polSezonu`, `koniecSezonu`, `werdykt`, `epilog` i — od 2026-09-14 — `final`. Zapis kasuje się w `start` i `wybor`, więc porzucenie kariery (`CONFIRM_RESTART` → `wybor`) i rozpoczęcie następnej czyszczą go same, bez osobnej logiki.

**`final` dołączyło 2026-09-14 i warto zapisać dlaczego, bo pierwotne wykluczenie brzmiało rozsądnie.** Argumentem było, że ukończoną partię trzyma już archiwum (`saveFinishedGame`). Trzyma jednak **wynik, nie ekran**: wpis archiwum niesie klub, tytuł, punkty dziedzictwa, liczbę podpisanych zawodników i replay — i ani linijki „ten, któremu odmówiłeś", ani nagłówków, ani „Wyjątkowych historii". Przełączenie karty na ekranie dziedzictwa kasowało więc **całą wypłatę** za osiem do dwunastu minut gry, zostawiając wiersz w tabeli — i to dokładnie w sytuacji, dla której ten zapis powstał: mobilna przeglądarka wyrzucająca kartę z pamięci. Zapis w `final` nic nie psuje, bo `saveFinishedGame` jest idempotentne, a następna kariera i tak przechodzi przez `wybor`.

## Guard: `engineVersion`

Zapis jest odrzucany, gdy `engineVersion` (stemplowany z `CURRENT_VERSION` w `src/data/changelog.ts`) nie zgadza się z bieżącą wersją silnika. Świadoma decyzja: zmiana silnika (nowa mechanika, zmiana kształtu `GameState`) unieważnia stare zapisy zamiast próbować je migrować — nikt jeszcze żadnych zapisów w trakcie rozgrywki nie ma, więc koszt tej decyzji jest zerowy dziś i niski w przyszłości (utracona jedna partia w toku, nie cała kariera — ukończone partie żyją osobno w archiwum).

## Furtka: `?reset` w URL

`readGameSave()` kasuje zapis i zwraca `null`, gdy `window.location.search` zawiera `reset`. Daje graczowi (i deweloperowi przy debugowaniu) pewny sposób wyjścia z ewentualnego zatrutego zapisu bez otwierania devtoolsów.

## Zapis odciskiem palca, nie na każdy render

`TICK` zmienia `czas` co sekundę; stringifikacja całego stanu raz na sekundę na telefonie byłaby marnotrawstwem. `saveFingerprint()` w `game-save.ts` buduje krótki string z pól strukturalnych (`faza`, `krok`, `ruchy`, `decisionIndex`, `przeciagniecia`, `epilogIdx`, `timerWl`, id zawodnika z karty) — zapis leci tylko, gdy odcisk się zmieni, czyli raz na akcję gracza. Dodatkowo `visibilitychange → hidden` i `pagehide` wymuszają zapis tuż przed zejściem w tło, żeby złapać aktualny `czas`, którego fingerprint nie śledzi.

## Timer w tle: pogodzenie z zegarem systemowym (rewizja 2026-08-13)

Pierwsza wersja tej decyzji zakładała, że odliczanie po prostu tyka dalej w tle bez zmian. W praktyce mobilna przeglądarka z wygaszonym ekranem **zawiesza wykonywanie JavaScriptu**, więc `setInterval` napędzający `TICK` też się zawiesza — `czas` zamrażałby się na wartości sprzed wygaszenia, co dawałoby graczowi darmowy, nieograniczony czas na decyzję przy każdym zgaszeniu ekranu. Żadna strona internetowa nie może zmusić przeglądarki, by nie zawieszała JS w tle — to ochrona baterii na poziomie systemu, nie coś do obejścia.

Zamiast tego licznik jest rekoncyliowany względem **zegara systemowego** przy każdym powrocie do gry, nie względem tyknięć timera. Nowa, czysta akcja reducera:

```ts
{ type: "RECONCILE_TIME"; elapsedSeconds: number }
```

(`src/data/types.ts`, obsługa w `src/logic/game-reducer.ts`) — ponownie wykorzystuje dokładnie tę samą ścieżkę co wygaśnięcie `TICK` (`decide(rng, base, "pass")`), tylko dla dowolnego odcinka czasu zamiast jednej sekundy. Nigdy nie jest dispatchowana przez `autoAdvance`/`simulateGame`/golden headless, więc golden master i replaye pozostają nietknięte.

UI dispatchuje tę akcję z realnym odstępem czasu w dwóch miejscach (`src/ui/app.tsx`):

1. **Wznowienie po przeładowaniu** — `savedAt` z zapisu (`game-save.ts`) kontra `Date.now()` przy montażu.
2. **Ta sama sesja, bez przeładowania** (przeglądarka zawiesiła kartę, ale jej nie wyrzuciła) — para zdarzeń `visibilitychange` (`hidden` zapamiętuje znacznik czasu, `visible` liczy różnicę).

Jeśli różnica jest mniejsza niż pozostały `czas`, licznik po prostu doszlusowuje w dół — gracz wraca do tej samej karty z krótszym czasem. Jeśli różnica jest większa lub równa, karta zostaje automatycznie spasowana dokładnie tak, jakby wygasła na pierwszym planie — **zawsze tylko jedna karta**, niezależnie od tego, jak długo gracza nie było (nie ma kaskadowego auto-pasowania kolejnych kart za czas, którego nigdy nie widziały).

**Powiadomienie o treści „Czas na podjęcie decyzji minął. Przechodzisz do kolejnej oferty/ekranu."** pojawia się wyłącznie wtedy, gdy rekoncyliacja faktycznie wygasiła kartę — obliczane synchronicznie *przed* dispatchem (`wouldExpire()` w `app.tsx`), żeby uniknąć migotania: baner ogólny „Wznowiono przerwaną partię." i baner specyficzny „Czas minął..." nigdy nie pokazują się jeden po drugim w tej samej klatce.

Ten sam komunikat pojawia się też przy zwykłym wygaśnięciu timera na pierwszym planie (`TICK`, gracz aktywnie patrzy na ekran) — wcześniej auto-pas po wyczerpaniu 15 sekund był całkowicie cichy, co samo w sobie było źródłem konfuzji niezależnym od wygaszania ekranu.

### Poprawka 2026-08-13: sztafeta powiadomienia przez reload

Pierwsza wersja mechanizmu miała lukę odkrytą na żywym przykładzie: gracz gasi ekran z ok. 3 s do końca timera, wraca po ok. 5 s. Zdarzenie `visibilitychange → visible` **poprawnie** wykrywa wygaśnięcie w tej samej sesji i pokazuje baner „Czas minął" — ale to ulotny stan Reacta. Jeśli chwilę później i tak dojdzie do przeładowania strony (typowo: klient HMR Vite kończy reconnect websocketu dopiero *po* powrocie karty na pierwszy plan i wtedy woła `location.reload()`), ten baner znika razem z całym drzewem komponentów. Nowe zamontowanie widzi już świeżo dobraną kartę z pełnym `czas` i zapisanym `savedAt` sprzed chwili — z jego punktu widzenia różnica czasu jest znikoma, więc słusznie (ale błędnie z perspektywy gracza) rozpoznaje to jako zwykłe wznowienie, nie timeout. Efekt: ekran „mruga" poprawnym komunikatem, po czym podmienia go na „Wznowiono przerwaną partię."

Naprawione krótkotrwałą sztafetą w osobnym kluczu `deadline-day:pending-timeout-notice` (TTL 10 s, `game-save.ts`): za każdym razem, gdy baner „Czas minął" faktycznie się pokazuje (czy to z `TICK`, czy z `RECONCILE_TIME` w dowolnej ścieżce), `markPendingTimeoutNotice()` zapisuje znacznik czasu. Kolejne zamontowanie sprawdza `peekPendingTimeoutNotice()` **przed** świeżym wyliczeniem z zegara — jeśli flaga jest aktualna, wynik to `"timedOut"` niezależnie od tego, że na tym konkretnym montażu nie ma już nic do rekoncyliacji (odczyt jest nieniszczący, bezpieczny pod podwójnym wywołaniem StrictMode; kasowanie flagi to osobny, bezwarunkowy efekt, idempotentny jak `removeItem`).

Przy okazji baner dla obu przypadków (`"resumed"` i `"timedOut"`) pokazuje się teraz **synchronicznie**, od razu z `resumeNotice`, zamiast czekać, aż dispatch `RECONCILE_TIME` faktycznie rozwiąże kartę i zmieni `state.log` — ten odroczony mechanizm nie miał już sensu, skoro źródłem prawdy o „czy to timeout" może być zarówno świeże wyliczenie z zegara, jak i sztafeta z poprzedniej sesji.

**Pułapka po drodze, niezwiązana z tą konkretną luką:** licznik `latestCzas` (używany przez efekt `TICK`, żeby wiedzieć, czy *to konkretne* tyknięcie wygasi kartę) musiał być przypisywany wprost podczas renderu, nie przez osobny `useEffect` — przy serii tyknięć zbitych w jedną porcję (co w testach ujawnia `vi.advanceTimersByTimeAsync` jednym dużym skokiem) efekt-lustro nie zdążyłby się uruchomić między kolejnymi tyknięciami, więc referencja cały czas widziałaby tę samą, nieaktualną wartość.

## Świadomie odrzucone

- **Przycisk „Kontynuuj partię".** Zamiast dodatkowego kroku po stronie gracza, wznowienie jest ciche — gra wraca dokładnie tam, gdzie była (z ewentualnie doszlusowanym czasem), z banerem informacyjnym (ten sam `NotificationBanner`, którego używają powiadomienia o transakcjach).

## Uwaga do formatu zapisu – pole dodane później to zawsze migracja

Dodanie pola do zapisywanego stanu wymaga migracji wypełniającej je dla starych zapisów. Traktowanie brakującego pola jako „jeszcze nie zrobione" wygląda na bezpieczny domyślny wybór, ale wobec gracza wracającego po przerwie potrafi uruchomić fałszywe zachowanie – stary zapis nie oznacza „nie zrobione", tylko „nagrane przed tym polem".

## Wersjonowanie — strażnik pilnował liczby, której nikt nie ruszał (2026-08-17)

Zgłoszone w przeglądzie kodu. `readGameSave` odrzucał zapis, gdy `engineVersion` nie zgadzał się z bieżącym — czyli strażnik działał poprawnie. Problem był w tym, na co patrzył: na `CURRENT_VERSION` z `src/data/changelog.ts`, wersję **widoczną dla gracza**.

Te dwie rzeczy zmieniają się z zupełnie różnych powodów. Wersja w changelogu rusza się, gdy jest o czym napisać graczowi; silnik zmienia zachowanie niezależnie od tego, czy jest. **`CURRENT_VERSION` stało na 0.82 przez wymianę rdzenia sezonu na silnik meczowy, przebudowę pozycji na formacje i dwie rekalibracje progów** — a strażnik przez cały ten czas przepuszczał zapisy, bo liczba się zgadzała.

### Rozdzielenie

| Stała | Gdzie | Kiedy się rusza |
| --- | --- | --- |
| `CURRENT_VERSION` | `src/data/changelog.ts` | gdy jest o czym powiedzieć graczowi |
| **`ENGINE_REVISION`** | `src/logic/engine-version.ts` | **przy każdej zmianie zachowania reducera** |
| `REPLAY_FORMAT_VERSION` | `src/logic/engine-version.ts` | gdy zmienia się słownik akcji w replayach |

`schemaVersion` zostaje bez zmian i pilnuje czegoś trzeciego — **kształtu** zapisu. Zapis może mieć poprawny kształt i nieaktualne znaczenie; to są dwie różne awarie i mają dwa różne strażniki.

## Schemat 9 — migracja identyfikatorów metryk analityka (2026-09-03)

Audyt metryk zmienił dwa identyfikatory przechowywane na aktywnej karcie: `goalsPreventedRate` → `goalsPreventedPer90` i `dangerousOpponentHalfRecoveryPct` → `dangerousOpponentHalfRecoveriesPer90`. To jest zmiana kształtu zapisu, więc `schemaVersion` wzrósł z 8 do 9 mimo niezmienionej wersji silnika.

Zapisy wersji 7 i 8 są migrowane: stare ID zamieniają się na nowe, percentyl pozostaje bez zmian, a czysto prezentacyjne `value` jest ponownie liczone według aktualnego `displayScale`. Bieżący zapis wersji 9 nie przyjmuje dawnych ID. Stabilność `metricDelta` chroni osobna mapa dawnych wejść seeda w `src/logic/analyst-report.ts`, więc sama migracja nazwy nie przelosowuje jakości zawodnika.

## Schemat 10 — metry zamiast jardów w Positioning Error Average (2026-09-03)

`Positioning Error Average` zachowuje źródłowy sens dystansu w jardowym układzie współrzędnych StatsBomb, ale prezentacja dla gracza używa metrów. Zakres `1,25…3,25 yd` został przeliczony współczynnikiem `1 yd = 0,9144 m` na `1,14…2,97 m`. Aktywna karta zapisuje także pochodne `value`, dlatego `schemaVersion` wzrósł z 9 do 10 mimo niezmienionego silnika.

Zapis wersji 9 ma już bieżące ID metryk: podczas odczytu zachowuje percentyle i ponownie liczy wartości według skali metrycznej. Migracje wersji 7 i 8 nadal najpierw naprawiają stare ID, a potem wykonują to samo przeliczenie. Bieżący zapis wersji 10 nie przyjmuje dawnych ID.

## Schemat 12 — zamrożona prognoza sezonu (2026-09-10)

Aktywacja ekonomii dołożyła do stanu dwa pola: `seasonForecastExpectedPlace` i `seasonForecastEuropeanIncome`. Kształt zapisu się zmienił, więc `schemaVersion` idzie z 11 na 12.

**Nie są migrowane, i to jest istota tych pól.** Obie wielkości zostały *zamrożone* w konkretnym momencie sezonu, którego zapis wersji 11 nie odnotował. Policzenie ich ponownie przy odczycie dałoby graczowi prognozę, która ruszyła się, choć nic się nie wydarzyło — a domyślne zero prognozowałoby sezon z miejsca zerowego, co czyta się jak wiarygodna liczba, nie jak zepsuty zapis. Strażnik kształtu sprawdza więc oba pola jako obecne i skończone, tak samo jak licznik losowań ze schematu 11.

W praktyce zapisy sprzed aktywacji i tak odpada linijkę wcześniej, bo `ENGINE_REVISION` poszedł w górę razem z ekonomią. Gałąź wersji 11 zostaje w kodzie dla kontraktu, który dokumentuje, nie jako żywa ścieżka migracji — dokładnie z tego samego powodu co gałęzie 7–10.

### Egzekwowanie zamiast pamiętania

Podniesienie `ENGINE_REVISION` nie może zależeć od tego, czy ktoś pamiętał. `tests/golden/engine-revision.test.ts` liczy skrót SHA-256 wszystkich śladów golden i porównuje go z zapisaną wartością: **ślady zmieniają się wtedy i tylko wtedy, gdy reducer zachowuje się inaczej**, więc są własnym odciskiem palca silnika.

Po świadomym `pnpm golden:retrace` test pada i wymusza dwie rzeczy w tym samym commicie: podniesienie `ENGINE_REVISION` i wklejenie nowego skrótu. Drugi test pilnuje, żeby wartość zapisana w teście zgadzała się z wysyłaną w grze — inaczej dałoby się zaktualizować sam skrót i ominąć cały mechanizm.

Sprawdzone przez celowe zepsucie jednego śladu: test łapie zmianę i podaje w komunikacie, co zrobić.

### Replaye

`engineVersion: "reducer-v1"` było wpisywane do każdego pliku replayu i **nie czytane przez nic**. Kontrakt istniał opisowo. Teraz `tests/golden/headless.test.ts` go sprawdza, a stała ma nazwę i uzasadnienie. Replay, którego słownik akcji przestał pasować do reducera, pada z komunikatem „re-record with `pnpm golden:record`" zamiast przechodzić dalej i wywracać się na niezrozumiałej różnicy śladu.

## Schemat 16 — kwota odrzuconej oferty, bez `Offer.tekst` (2026-10-08)

Dwie zmiany kształtu w jednym podbiciu z 15 na 16. `odrzuceni` niesie pary `{ player, fee }` zamiast samych zawodników: ekran dziedzictwa podaje w linijce „ten, któremu odmówiłeś” kwotę z chwili „pas”, z narzutem za przeciąganie (decyzja właściciela z 2026-10-08). Aktywna karta traci pole `tekst`, którego UI nigdy nie wyświetlało.

**Bez migracji.** Kwoty sprzed zmiany nikt nie zapisał, więc zapis wersji 15 nie ma jej skąd wziąć, a domyślne zero dałoby fałszywe „przy kwocie 0,00 mln €”. Zapis 15 jest odrzucany, co w fazie deweloperskiej jest akceptowalne. `ENGINE_REVISION` zostaje: silnik losuje i rozstrzyga tak samo, a ślady golden się nie zmieniły.

## Autosave ekranów konfiguracji — osobny klucz `deadline-day:setup-draft` (2026-09-21)

Właściciel produktu poprosił ogólnie o „autosave w każdym ekranie". `deadline-day:game-save` obejmuje wyłącznie fazy właściwej kariery (`RESUMABLE_PHASES` wyżej) — jego strażnik schematu 13 wymaga kompletnego `club`, `manager` i `careerBaseline`, których dwa ekrany konfiguracji (`manager-screen.tsx`, `club-select-screen.tsx`) z definicji jeszcze nie mają. **Poluzowanie tego strażnika było wykluczone** — jego rygor jest sensem jego istnienia, a poluzowanie go dla fazy konfiguracji osłabiłoby go dla każdego innego wywołującego.

Zamiast tego: osobny klucz `deadline-day:setup-draft`, własny prosty kształt i `schemaVersion: 1` od pierwszego zapisu, czytany wyłącznie przez oba ekrany konfiguracji. Implementacja: `src/ui/setup-draft.ts`.

### Co jest zapisywane

Wyłącznie to, co gracz sam wpisał albo wybrał — nigdy nic wyprowadzonego z silnika (żadnego `CareerBaseline`, wygenerowanej kadry, ziarna):

- `firstName`, `lastName` — surowy, jeszcze niezatwierdzony tekst z pól formularza menedżera. Zapisywany przy KAŻDEJ zmianie, niezależnie od tego, czy `validateManagerIdentityFields` uznałby go w danej chwili za poprawny — to jest szkic tego, co gracz wpisał, nie rekord tego, co przeszło walidację.
- `timerWl` — wybór timera z ekranu 1.
- `step` — który z dwóch ekranów gracz aktualnie widzi (`"manager"` albo `"club"`), zapisywany przy montowaniu każdego z nich, więc odzwierciedla bieżący ekran nawet zanim cokolwiek jeszcze się zmieniło na nim.
- `clubId` — wybrany klub z ekranu 2.

### Walidacja na odczycie — pole po polu, nigdy cała porcja naraz

`parseSetupDraft` nigdy nie ufa magazynowi: nieznany `clubId` (zweryfikowany przez `clubById`), źle otypowane albo patologicznie długie imię/nazwisko, nieznana wartość `step` — każde z nich odpada osobno, spadając do własnej wartości domyślnej, a reszta poprawnych pól zostaje. Cała porcja odpada tylko wtedy, gdy wartość w ogóle nie jest obiektem albo `schemaVersion` się nie zgadza — dokładnie ten sam podział co w `migrateStoredUiPreferences` (`ui-preferences.tsx`), z którego ten moduł świadomie kopiuje kształt.

### Scalanie zapisów, nie nadpisywanie

`writeSetupDraftFields` robi odczyt-modyfikuj-zapis: ekran menedżera nie zna wybranego klubu, ekran klubu nie zna imienia i nazwiska, więc każdy zapisuje TYLKO swoje pola, a drugi zestaw pól przeżywa nietknięty. Zapis po uszkodzonym wpisie scala się na wartościach domyślnych (`DEFAULT_DRAFT`), nigdy na resztkach uszkodzonych danych.

### Wznowienie — restart aż do właściwego kroku, nie tylko wypełnienie pól

Wznowienie odtwarza nie tylko treść pól, ale i **sam ekran**: przy montowaniu, gdy nie ma kariery do wznowienia (`inspectGameSave()` zwraca coś innego niż `"loaded"`), `app.tsx` czyta szkic i — jeśli `step === "club"` — odtwarza fazę `"wybor"` wywołując `gameReducer(initialState(), {type: "START_GAME", manager: {...}})`. To jest ta sama, czysta transformacja reducera co za każdym „Dalej" na żywym formularzu — nie osobna, zdublowana kopia walidacji. Nieprawidłowe imię zapisane w trakcie pisania (za krótkie, bo gracz jeszcze nie skończył) po prostu zostawia `faza` na `"start"`, dokładnie tak, jakby ten sam formularz odrzucił tę samą wartość na żywo — a surowy tekst i tak wraca do pól przez osobny fallback (`draftPrefillRef`), niezależnie od tego, czy przeszedłby walidację.

Wybrany klub wraca przez `initialSelectedClubId` na `ClubSelectScreen`, czytany z tego samego jednorazowego odczytu przy montowaniu `App` (ten sam wzorzec co `resumedSaveRef` dla `game-save.ts`).

### Który klucz wygrywa, gdy oba istnieją

**Kariera w toku zawsze wygrywa.** Jeśli `inspectGameSave()` zwróci `"loaded"`, szkic jest od razu kasowany (`clearSetupDraft()`) — jest z definicji nieaktualny, skoro istnieje prawdziwa kariera. Szkic jest też kasowany przy `START_CAREER` (w handlerze `onStart` ekranu klubu, zanim poleci dispatch) i, na wszelki wypadek, przy każdym zapisie do `game-save` (`isResumable(state)` w efekcie fingerprintu w `app.tsx`) — więc żadna ścieżka prowadząca do prawdziwej kariery (łącznie z `PLAY_AGAIN`) nie zostawia za sobą szkicu, który mógłby wypłynąć po zakończeniu tej kariery.

## Zapis, który się nie udał, przestaje być cichy (2026-09-23)

Do tej pory `writeStoredJson` (`src/ui/local-storage.ts`) połykał każdy błąd `setItem` (tryb prywatny, przekroczony limit, zablokowane API) i zwracał `void` – gracz mógł rozegrać całą karierę w przekonaniu, że jest zapisywana, i stracić ją na pierwszym odświeżeniu strony. Decyzja właściciela produktu na wniosek kontrolera: dwa zapisy, których utrata gracza realnie kosztuje, dostają ostrzeżenie; dwa, których utrata kosztuje sekundy, zostają ciche.

### Co dostało ostrzeżenie

- **Autosave kariery** (`writeGameSave`, wywoływany z efektu fingerprintu i z flusha `visibilitychange`/`pagehide` w `src/ui/app.tsx`). Nieudany zapis pokazuje baner:

  > Nie udało się zapisać postępu. Możesz grać dalej, ale po zamknięciu lub odświeżeniu strony ta kariera przepadnie.

- **Archiwum ukończonych partii** (`saveFinishedGame`, `src/ui/game-archive.ts`). Nieudany zapis pokazuje baner:

  > Nie udało się zapisać wyniku w archiwum. Partia jest zakończona, ale nie pojawi się na liście wyników.

Oba banery **nie znikają same** – `bannerAutoDismiss` w `app.tsx` sprawdza teraz oprócz dotychczasowego trzymania fokusu (a11y, patrz wyżej) także `notification.persistent`, flagę noszoną na samym powiadomieniu, a nie wyprowadzaną z jego treści. Banner zamyka się wyłącznie działaniem gracza – przyciskiem, Escape albo przeciągnięciem – dokładnie tak, jak już działał trzymany baner fokusu; ten sam mechanizm `autoDismiss={false}` obsługuje oba przypadki.

### Co zostaje ciche

**Szkic ekranów konfiguracji i preferencje UI.** Utrata wpisanego imienia albo wybranego motywu kosztuje sekundy odtworzenia; ostrzeżenie zanim kariera w ogóle się zaczęła byłoby szumem, nie pomocą. `writeStoredJson` w `setup-draft.ts` i `ui-preferences.tsx` nadal ignoruje wartość zwracaną – kompiluje się bez zmian, bo `writeStoredJson` teraz zwraca `boolean` zamiast `void`, a nieczytany wynik jest prawidłowym TypeScriptem.

### Raz na serię niepowodzeń, nie za każdym razem

Powtarzający się błąd zapisu (np. trwale zablokowany `localStorage`) pokazywałby ten sam baner po każdej decyzji gracza, gdyby licznik nie miał pamięci. Zamiast tego dwie flagi w refach (`saveFailureNoticeShownRef`, `archiveFailureNoticeShownRef` w `app.tsx`) pilnują „raz na serię": po pokazaniu banera kolejne nieudane zapisy tego samego mechanizmu milczą, aż któryś zapis się powiedzie – wtedy flaga wraca do `false`, a następne niepowodzenie znowu pokazuje baner. To jest **stan UI, nie stan gry** – żyje w refie, nie w reducerze, więc nigdy nie trafia do golden mastera ani do samego zapisu.

Powiadomienie ma jeden slot (`notification` w `app.tsx`, ta sama zasada co przy trzymaniu fokusu wyżej), więc ostrzeżenie o nieudanym zapisie, które trafia na ekran z innym banerem już otwartym, po prostu go zastępuje – tak samo jak zastąpiłby go kolejny nieudany zapis innego mechanizmu (np. ostrzeżenie archiwum nad wciąż otwartym ostrzeżeniem kariery). Kierunek odwrotny jest inny: zwykłe powiadomienie o decyzji (np. „Pas: ...") nigdy nie zastępuje żywego trwałego ostrzeżenia, dopóki gracz go nie zamknie (decyzja kontrolera po finalnym przeglądzie, 2026-09-23) – bez tej reguły kolejna decyzja gracza po prostu nadpisywała slot swoim zwykłym powiadomieniem, a licznik „raz na serię" nie pozwalał ostrzeżeniu wrócić, dopóki jakiś zapis się nie powiódł. Pod stale zablokowanym magazynem, typowym dla trybu prywatnego, ten zapis nigdy się nie powiódł, więc ostrzeżenie znikało na resztę sesji po pierwszym kliknięciu. Kompromis jest świadomy: karta decyzji zostaje ukryta, dopóki ostrzeżenie stoi na ekranie, bo utrata kariery kosztuje więcej niż jedno spóźnione powiadomienie o transakcji, a gracz może zamknąć ostrzeżenie w dowolnej chwili – przyciskiem, klawiszem Escape albo przeciągnięciem. Po zamknięciu zwykłe powiadomienia wracają do poprzedniego zachowania bez zmian.

Nowa kariera (START_CAREER albo PLAY_AGAIN) resetuje obie flagi „raz na serię" niezależnie od tego, czy poprzedni zapis się powiódł – zablokowany magazyn przy starcie nowej kariery jest tak samo nieuratowaną karierą jak poprzednia, więc ostrzeżenie musi wrócić, a nie milczeć dalej z poprzedniego uruchomienia.

### Kontrakt zwracanej wartości

`writeStoredJson` zwraca `true`, gdy zapis faktycznie wylądował w magazynie, `false` gdy `setItem` rzucił albo `window` jest niezdefiniowane. `writeGameSave` przekazuje tę wartość dalej. `saveFinishedGame` zwraca `true` również dla trafienia w idempotentny wczesny powrót (wpis o danym id już istnieje) – to jest sukces z punktu widzenia gracza, nie porażka zapisu – i `false` wyłącznie wtedy, gdy zapis faktycznie się nie powiódł.

## Klucze w `localStorage` (wykaz, stan 2026-10-07)

Każdy klucz ma `schemaVersion` od pierwszego zapisu. Gdy dochodzi albo znika klucz, zaktualizuj ten wykaz w tej samej zmianie.

| Klucz | Moduł | Co niesie |
| --- | --- | --- |
| `deadline-day:game-save` | `src/ui/game-save.ts` | autosave partii w toku, żeby przeładowanie strony (celowe albo wymuszone przez przeglądarkę mobilną wyrzucającą kartę z pamięci) nie kasowało kariery |
| `deadline-day:setup-draft` | `src/ui/setup-draft.ts` | autosave dwóch ekranów ustawień, zanim kariera istnieje (menedżer, timer, klub, krok); osobny, luźniejszy strażnik kształtu niż `game-save.ts`, bo faza konfiguracji nie ma `club`/`manager`/`careerBaseline`. Gdy istnieją oba klucze, wygrywa zapis w toku |
| `deadline-day:game-archive` | `src/ui/game-archive.ts` | ukończone partie z replayem (`ReplayV2`) |
| `deadline-day:ui-preferences` | `src/ui/ui-preferences.tsx` | preferencje interfejsu |
| `deadline-day:pending-timeout-notice` | `src/ui/game-save.ts` | krótkotrwały znacznik (TTL 10 s) banera „Czas minął”; nie niesie stanu gry |
