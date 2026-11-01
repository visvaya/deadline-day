# Zdolność kupującego (krok 7 speka 4) — pomiar aktywacji

Krok 7 speka 4 podłącza kupca przy karcie
`SPRZEDAZ`: `buyerCapacity` liczona w prawdziwych euro (kurs NBP, nie skala gry), krajowy kupujący ograniczony do
`MAX_INTRA_LEAGUE_FEE = 2,0 mln`, kupujący zagraniczny z tierów speka 4, a cena karty wynika z `buyerFactor` zamiast z
losowego mnożnika `1,0–1,6`. Ten dokument jest pomiarem kontrolnym aktywacji — konfrontuje przebieg sprzed zmiany
(przebieg bazowy) z przebiegiem po (przebieg aktywacji) na tych samych 252 000 par ziaren.

## Przebiegi

**Przebieg bazowy** — silnik z Taska 2 (terminarz po `clubId`), obserwator sprzedaży z Taska 5, kupiec jeszcze
niepodłączony:

```
pnpm balance --clubs all --runs 1000 --seed 0x5eed0001 --dump-raw baseline-raw.csv --dump-sales baseline-sales.csv --md baseline.md
```

- commit: `184fc2ada3fb45eaa43ca85b3ed0a3f8cc5c2019` (Task 5: `b1039f0` obserwator sprzedaży bez dotykania stanu +
  `184fc2a` wyciszenie nieużywanych nazw w typie obserwatora)
- wynik: 252 000 partii, 0 błędów, 2420,4 s
- sha256 `baseline-raw.csv`: `410a40b982116668289400dce4102cbcbac7ec3ca9e09a188d3fbd56d50297fb`
- sha256 `baseline-sales.csv`: `be5c8daba8573264700b4ff97865fc1a43ad85f406d46a95c3a363c344ad685b`

**Przebieg po aktywacji** — ta sama komenda, na niezacommitowanej wtedy aktywacji Taska 7, spiętej potem w
commity `85d68a5` (wybór kupca po tym, co go stać), `3b5b5a0` (deduplikacja unii `buyerOrigin`) i `4a31ace`
(fixture'y sprzedaży z kupcem):

- wynik: 252 000 partii, 0 błędów, 2601,2 s
- sha256 `activation-raw.csv`: `16f12ba4ce148ef1ca0286791ac42d53c5ee1f20079a593e40e0555a0449625f`
- sha256 `activation-sales.csv`: `7e12cf8318040ff953197f1fa7de77adbfce8f8ccafdf4ba81df75767a39cd40`

Sparowanie `pnpm balance:compare`: każda komórka `klub × polityka` ma pełne 1000 par, zero porzuconych ziaren.

## Bezpiecznik (próg: |Δ| > 5 p.p. udziału tytułu u czterech kotwic)

Bezpiecznik speka zdolności kupującego obowiązuje wyłącznie u czterech
kotwic (Legia, Zagłębie, Wisła Kraków, Wieczysta), w którejkolwiek aktywnej polityce, dla **któregokolwiek** tytułu
dziedzictwa.

**Wynik: bezpiecznik przechodzi, na granicy.** Największe przesunięcie u kotwic:

| klub | polityka | tytuł | Δ | próg | wynik |
| --- | --- | --- | ---: | ---: | --- |
| Legia | alwaysTake | LEGENDA GABINETU | −5,0 p.p. ± 1,08 | 5,0 p.p. | **równe progowi, nie większe → przechodzi** |
| Wisła K. | stallThenTake | UCZCIWY WYROBNIK | +4,5 p.p. ± 1,38 | 5,0 p.p. | przechodzi |
| Legia | stallThenTake | LEGENDA GABINETU | −4,2 p.p. ± 1,22 | 5,0 p.p. | przechodzi |
| Wieczysta | stallThenTake | CZŁOWIEK, KTÓRY ZRUJNOWAŁ KLUB | +3,2 p.p. ± 0,99 | 5,0 p.p. | przechodzi |
| Zagłębie | alwaysTake | SOLIDNA ROBOTA | −3,1 p.p. ± 1,49 | 5,0 p.p. | przechodzi |

Reguła brzmi: „więcej niż 5 p.p." zatrzymuje pracę; `−5,0` jest dokładnie progiem, nie ponad nim, więc przechodzi na
granicy. Nie odczytywać tego jako komfortowego zapasu — najbliższa kolejna komórka (Wisła K., `stallThenTake`,
`+4,5`) jest o pół punktu od tego samego progu.

**Obserwacja poza kotwicami, dla kroku 9 (nie bramka):** Raków, `youngBuySellAlways`, LEGENDA GABINETU: `−6,5 p.p. ±
0,84` — jedyna komórka w całej lidze powyżej 5 p.p. Raków nie jest kotwicą, więc bezpiecznik jej nie zatrzymuje, ale
wspólna kalibracja w kroku 9 powinna wiedzieć, że tam jest.

### Zakres przesunięć dziedzictwa u kotwic (`Δ dziedzictwo`, punkty)

Dla orientacji przy kroku 9 — pełny zakres, nie tylko skrajne komórki, po aktywnych politykach (bez wierszy
`alwaysPass`/`analystEdgeBuy`/`depthFirst`/`primeOnlyBuy`/`veteranOnlyBuy`/`youngOnlyBuy`, gdzie karta `SPRZEDAZ`
owszem się pojawia, ale ta polityka nigdy jej nie przyjmuje, więc Δ jest strukturalnym zerem):

| klub | zakres Δ dziedzictwo |
| --- | --- |
| Legia | −17,93 do −3,47 |
| Wisła K. | −10,22 do −1,18 |
| Wieczysta | −7,82 do −1,60 |
| Zagłębie | −6,50 do −1,44 |

Dziedzictwo spada wszędzie — aktywacja przesuwa realizowane kwoty sprzedaży w dół (patrz sekcja o sprzedażach niżej),
więc mniej gotówki i słabszy `wartoscKadryMoj` wchodzą do formuły dziedzictwa. To zgodne z §9.2 speka 4: aktywacja
miała zredukować niewytłumaczalną część ceny, nie podnieść jej poziom.

### Rozkład zmiany gotówki i dziedzictwa (§8 speka: rozkład, nie sama mediana)

Powyższy zakres jest zakresem *median po polityce*; poniżej jest inna wielkość: rozkład różnicy **na pojedynczej
karierze**, sparowanej `clubId × polityka × ziarno` między `activation-raw.csv` i `baseline-raw.csv` (dumpy przypięte
w `scripts/data/buyer-capacity-2026-09-22/`, sha256 w sekcji „Przebiegi" wyżej). Δ = wartość po aktywacji minus wartość
przed, na tej samej parze ziaren; gotówka to kolumna `kasa`, dziedzictwo to kolumna `dziedzictwo` surowego dumpu
`--dump-raw` (schema 5). Pula wyklucza te same sześć polityk strukturalnego zera co tabela wyżej — 144 000 sparowanych
karier łącznie (18 klubów × 8 aktywnych polityk × 1000 ziaren), 8000 na każdą z czterech kotwic.

Policzone jednorazowym skryptem `node delta-quantiles.mjs`, uruchomionym poza repo i usuniętym po
pomiarze: wczytuje oba CSV do mapy
kluczowanej `clubId|polityka|ziarno`, odrzuca wiersze sześciu wykluczonych polityk, dla każdej pozostałej pary liczy
`Δ kasa` i `Δ dziedzictwo`, i raportuje p10/p50/p90 metodą liniowej interpolacji (R-7) — osobno dla każdej kotwicy i
łącznie dla całej ligi. Tabelę przeliczono niezależnie drugi raz (Python, ta sama metoda) po wykryciu błędu w
kolumnach gotówki pierwszej wersji; kolumny dziedzictwa zgadzały się.

| pula | n | Δ kasa p10 | Δ kasa p50 | Δ kasa p90 | Δ dziedzictwo p10 | Δ dziedzictwo p50 | Δ dziedzictwo p90 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Legia | 8000 | −1,48 | −0,49 | 0,00 | −28 | −9 | 0 |
| Zagłębie | 8000 | −0,83 | −0,10 | 0,35 | −21 | −2 | 7,1 |
| Wisła K. | 8000 | −0,73 | −0,10 | 0,26 | −18 | −2 | 3 |
| Wieczysta | 8000 | −0,49 | −0,07 | 0,05 | −14 | −1 | 0 |
| liga (pula) | 144 000 | −1,12 | −0,15 | 0,30 | −28 | −3 | 4 |

Mediana gotówki jest ujemna wszędzie (od −0,07 do −0,49 mln na kotwicę; −0,15 w puli ligowej) — aktywacja przesuwa
typową karierę, nie tylko ogon: p10 jest ujemny wszędzie (gotówka spada, gdy sprzedaż faktycznie się zdarzy i
realizowana kwota jest niższa niż przed aktywacją), a p90 jest zerowy wyłącznie u Legii; u pozostałych kotwic i w
puli ligowej jest mały dodatni (Wieczysta 0,05, Wisła K. 0,26, Zagłębie 0,35, liga 0,30). Zerowy p90 (Legia) znaczy,
że w co najmniej dziesiątej z kariery Δ jest dokładnie zero — sprzedaż w tej karierze albo się nie zdarzyła, albo
aktywacja nie zmieniła jej realizowanej kwoty; dodatni p90 u pozostałych znaczy, że u tych klubów górny decyl
kariery faktycznie zyskuje. Dziedzictwo powtarza ten sam kształt w jednostkach punktów, zgodnie z formułą, która
czyta `kasa` i `wartoscKadryMoj`.

## Sprzedaże (obserwator `--dump-sales`, wszystkie kluby i polityki)

- **oferty**: mediana `0,46 → 0,38 mln` (−17%), średnia `0,753 → 0,643 mln` (−15%)
- **transakcje**: mediana `0,44 → 0,36 mln`, średnia `0,736 → 0,627 mln`
- **udział zagranicy**: oferty `0% → 7,7%`, transakcje `0% → 7,8%` — przed aktywacją kupiec zawsze był krajowy
  (obserwator istniał, ale kupiec jeszcze nie), po aktywacji zagraniczny kupiec pojawia się tam, gdzie żaden krajowy
  klub nie kwalifikuje się do `maxOffer`. Rozkład udziału zagranicy w ofertach po aktywnych politykach (bez sześciu
  wykluczonych wyżej, gdzie karta `SPRZEDAZ` nigdy nie jest przyjęta), z lokalnego, nieśledzonego `scratch/buyer-capacity/sales.md`: Legia
  13,7–15,3%, Zagłębie 3,9–5,5%, Wisła K. 3,1–4,3%, Wieczysta 0,8–2,0% — im bogatszy klub gracza, tym droższa jego
  kadra na sprzedaż i tym częściej cena przekracza krajowe `maxOffer`.

**Selekcja prób.** Mediany zrealizowanych kwot są liczone na próbach wyselekcjonowanych przez politykę i przez
odrzucenia (targowanie, przeciąganie negocjacji) — nie porównuje się pojedynczych kart po indeksie między przebiegami,
tylko rozkłady tej samej wielkości w tej samej kohorcie ziaren.

## Dwa ustalenia procesowe

1. **Test pozostawiony czerwonym po Tasku 2 przeszedł niezauważony, bo Task 2 uruchamiał tylko testy dotkniętych
   plików.** Commit `4a4cd94` (terminarz po `clubId`) przesunął kaskadę RNG na tyle, że przy stałym ziarnie
   `0x5000_0005` liczba kart `PANIC` i `SPRZEDAZ` wyrównała się (`5:5`), łamiąc asercję
   `typeCounts.PANIC < typeCounts.SPRZEDAZ` w `tests/logic/game-reducer-offers.test.ts`. Ponieważ Task 2 nie dotykał
   tego pliku testowego, testy dotkniętych plików nie złapały regresji — złapał ją dopiero pełny przebieg `pnpm test`
   przy Tasku 7. Naprawione w `85d68a5` przeszukaniem deterministycznym od `0x5000_0006` w górę; pierwszy kandydat
   spełnił wszystkie warunki testu, więc ziarno w teście zmieniło się z `0x5000_0005` na `0x5000_0006`, a komentarz
   przy asercji przypisuje starą kolizję commitowi `4a4cd94`, nie Taskowi 7.
2. **`COVERAGE_LOST_TO_ACTIVATION` (`tests/golden/headless.test.ts`) zmieniało się dwa razy w tym łańcuchu zadań.**
   Task 2 (terminarz po `clubId`) usunęło `trudny-mieszany`, `latwy-pas` i `przedluzenie` (ich predykaty znów są
   osiągalne pod nowym porządkiem terminarza) i dodało `same-mlode` (43,5% — nagłówek PRZEŁOM wypchnięty poza zasięg).
   Task 7 (kupiec przy `SPRZEDAZ`) osobno usunęło `sredni-wykupiony`. Żadna z tych zmian nie jest regresją — obie są
   spodziewaną konsekwencją przesunięcia kaskady RNG retrace'em, przypisaną do właściwego commitu w komentarzach
   listy.

## Przesunięcia jako obserwacje dla kroku 9

Wspólna kalibracja handicapów i progów dziedzictwa (krok 9 speka 4, dopiero po speku 5) powinna wziąć pod uwagę:

- dziedzictwo spada u wszystkich czterech kotwic po aktywacji (zakresy wyżej) — spójne z zamierzonym spadkiem cen
  sprzedaży, nie z błędem;
- Raków, `youngBuySellAlways`, `−6,5 p.p.` na LEGENDZIE GABINETU jest jedyną komórką w lidze powyżej progu
  bezpiecznika, mimo że Raków nie jest kotwicą — wspólna kalibracja powinna to zmierzyć ponownie na pełnym modelu po
  speku 5, nie ignorować jako szum;
- mediana ceny oferty sprzedaży spadła o ok. 17% i mediana zrealizowanej kwoty o ok. 18% — te dwie liczby wchodzą do
  tej samej formuły dziedzictwa (`wartoscKadryMoj`, `kasa`) co handicapy, więc kalibracja kroku 9 startuje z niższego
  punktu odniesienia niż przed tym krokiem.

## Artefakty

Skompresowane dumpy `--dump-raw` i `--dump-sales` obu przebiegów leżą w
`scripts/data/buyer-capacity-2026-09-22/` (poniżej 20 MB każdy, więc wszystkie cztery są zacommitowane):

| plik | sha256 (gzip) |
| --- | --- |
| `baseline-raw.csv.gz` | `565716486d9ce288b3d80a083adc12a3edf0d0b457b00944fd5bc638c38e3a12` |
| `baseline-sales.csv.gz` | `fbc1af41f41ef6bb5ef8734f9062e8d0bebf0cd0aeec4888f95e380aaa652b4f` |
| `activation-raw.csv.gz` | `cae2d65a02a77bed1165ad7c3cd16012290dedab7c5e95af119d46d0b3eb7bef` |
| `activation-sales.csv.gz` | `2ebf6b587c0fc66ad85ab11f89d9f5847f0a593d2f6f750064875da24e112895` |

Odtworzenie (rozpakowuje do `<plik>.csv` obok, sha256 nieskompresowanych plików podane w sekcji „Przebiegi” wyżej):

```
gunzip -k scripts/data/buyer-capacity-2026-09-22/baseline-raw.csv.gz
gunzip -k scripts/data/buyer-capacity-2026-09-22/baseline-sales.csv.gz
gunzip -k scripts/data/buyer-capacity-2026-09-22/activation-raw.csv.gz
gunzip -k scripts/data/buyer-capacity-2026-09-22/activation-sales.csv.gz
```

Albo od zera, na wskazanych commitach, komendami z sekcji „Przebiegi”. Sparowane porównanie:
`pnpm balance:compare --before baseline-raw.csv --after activation-raw.csv --md compare.md` i
`pnpm balance:sales --before baseline-sales.csv --after activation-sales.csv --md sales.md`.
