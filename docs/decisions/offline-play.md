# Instalacja i gra bez sieci (PWA)

Decyzja z 2026-11-02: gra jest instalowalna (manifest, ikony 192 i 512 px) i po jednej wizycie startuje bez sieci. Wzór: siostrzany projekt Telemark, którego service worker przeszedł kilka poprawek w produkcji; przeniesiony jest rdzeń tych poprawek, bez warstwy stanu offline i komunikatów.

## Jak działa

- `pnpm build` po `vite build` uruchamia `scripts/write-service-worker.mjs`: lista wszystkich plików `dist/` (poza `_headers` i samym workerem) z SHA-256 trafia do szablonu `scripts/service-worker-template.js` i powstaje `dist/sw.js`. Każde wydanie ma więc worker różny bajt w bajt, a cache nazwany skrótem listy plików. Build bez zmiany plików daje ten sam worker.
- **Instalacja wszystko albo nic.** Worker pobiera każdy plik z pominięciem cache przeglądarki, bez przekierowań, sprawdza skrót i dopiero potem zapisuje. Jeden zły plik (np. wdrożenie w toku: stary worker, nowe pliki) przerywa instalację i nie zostawia części wydania; dotychczasowe działa dalej.
- **Bez `skipWaiting` i `clients.claim`.** Strona zawsze dostaje dokument i skrypty z jednego wydania. Nowe wydanie czeka, aż gracz zamknie wszystkie okna gry, albo instaluje się od razu na prośbę z ekranu startowego.
- **Poprzednie wydanie zostaje, dopóki nie wystartuje strona nowego** (lekcja Telemarka). Tuż po aktualizacji przeglądarka może jeszcze raz podać stronę starego wydania i przełączyć pod nią workera; ta strona prosi o skrypt i fonty, których serwer już nie ma, i dostaje je z cache starego wydania. Stare cache usuwa dopiero strona startowa nowego wydania podana z jego własnego cache, i to tylko gdy nic nowszego się nie instaluje ani nie czeka. Usuwane są wyłącznie cache z prefiksem gry; `localStorage` (zapisy) worker nigdy nie rusza.
- Żądanie, którego sieć nie obsłuży, dostaje `Response.error()` zamiast odrzuconej obietnicy (lekcja Telemarka: Firefox raportował to jako błąd workera).
- Nagłówki (`public/_headers`): `no-cache` dla `/sw.js` i manifestu, typ `application/manifest+json`, w CSP `worker-src 'self'` i `manifest-src 'self'`. `/assets/*` zostaje przy `no-cache` (powód w pliku).

## Aktualizacja na żądanie

Decyzja właściciela z 2026-11-02: przycisk na ekranie startowym, w sekcji „Historia zmian”, tuż pod ostrzeżeniem, że partia w toku może przepaść po aktualizacji. W trakcie kariery nic się nie pokazuje: gra nie ma tam menu, a instalacja w środku partii z nową wersją silnika skasowałaby karierę w toku (`readStoredState` odrzuca zapis z innym `ENGINE_REVISION`).

`src/ui/game-update.ts`: „Szukaj aktualizacji” najpierw pyta serwer wprost (`HEAD /sw.js`, który worker przepuszcza do sieci), bo bez sieci Chromium kończy `registration.update()` bez błędu i gracz offline czytałby „Masz najnowszą wersję”. Potem woła `registration.update()` i mówi, co znalazł (najnowsza, pobieranie, gotowa, brak sieci, gra jeszcze się zapisuje). Gotowa wersja zamienia przycisk na „Zainstaluj nową wersję”: strona wysyła workerowi komunikat `deadline-day:take-over`, worker woła `skipWaiting`, a strona przeładowuje się, gdy **ten** worker osiągnie stan `activated` (śledzony jego własny stan, nie `controllerchange`, więc działa też po wymuszonym przeładowaniu). Inne otwarte okna nie są przeładowywane.

Przycisk ma osobny element (`key`) dla każdego znaczenia. Przeglądarka sama szuka nowego workera i potrafi go znaleźć tuż przed kliknięciem „Szukaj aktualizacji”; z jednym elementem kliknięcie w drodze trafiało w „Zainstaluj nową wersję” i przeładowywało grę (złapane w WebKicie, raz na kilka przebiegów).

Pułapka zauważona w testach: strona z pierwszej wizyty nie jest kontrolowana przez workera. Gdy żadne okno nie używa działającego wydania, przeglądarka aktywuje nowe od razu, bez czekania (WebKit robi to natychmiast, zgodnie ze specyfikacją). Komunikat „gotowa” znika wtedy sam; test e2e przeładowuje stronę przed sprawdzeniem, jak przy każdym kolejnym uruchomieniu.

## Testy

- `tests/scripts/service-worker.test.ts`: wygenerowany worker uruchamiany przez `vm` na atrapach `caches` i sieci (instalacja, odmowy, pełny dysk, przejęcie bez kasowania, pliki starego wydania, sprzątanie, błąd sieci, komunikat przejęcia).
- `tests/ui/game-update.test.ts`: sprawdzenie, śledzenie i instalacja na atrapach rejestracji.
- `tests/e2e/offline.spec.ts`: gra startuje bez sieci po jednej wizycie (Chromium i WebKit; ta sama próba z zablokowanymi workerami pada w obu), brak błędów instalowalności według Chromium, pełna ścieżka „Szukaj aktualizacji” → „Zainstaluj nową wersję” → przeładowanie na kopii buildu na osobnym serwerze (Playwright nie przechwytuje pobrania skryptu workera przez `context.route`).

## Warunek przy przejściu na własną domenę

Worker sprawdza skrót każdego pliku, także `index.html`. Funkcje strefy Cloudflare, które przepisują HTML w locie (Rocket Loader, ukrywanie adresów e-mail, wstrzykiwany skrypt Web Analytics), zmieniłyby bajty strony startowej i żadna instalacja by się nie udała: gra działałaby tylko online. Na `*.workers.dev` ich nie ma; na własnej domenie trzeba je wyłączyć albo sprawdzić, że są wyłączone, a test po wdrożeniu powinien porównać serwowany `/` z buildem. Z tego samego powodu każdy dodatkowy plik `.html` w `dist/` wymaga uwagi: host przekierowuje `/x.html` na `/x`, a worker odrzuca przekierowania.

## Świadomie pominięte (są w Telemarku)

- Komunikaty o stanie gotowości offline i „Spróbuj ponownie”: bez nich każde wejście i tak ponawia rejestrację.
- Ponowna instalacja, gdy przeglądarka usunie cache przy żywym workerze: gra działa wtedy online, a offline wraca z następnym wydaniem. Tanie warianty na później: worker uzupełnia cache przy starcie strony albo `navigator.storage.persist()`.
- Numer oczekującej wersji w komunikacie, notka „zaktualizowano w innym oknie”, `release.json` i kontrola wdrożenia po zawartości.
- Ikona `maskable`: obecny rysunek dochodzi do krawędzi i maska by go przycięła, więc Android pokazuje go pomniejszonego na tle; pełna ikona wymaga osobnej grafiki z marginesem.
