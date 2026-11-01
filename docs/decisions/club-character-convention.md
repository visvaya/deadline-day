# Konwencja opisów `character` klubów

**Status: decyzja właściciela produktu z 2026-09-11.** Ten dokument jest źródłem prawdy dla krótkich opisów klubów na ekranie wyboru. Liczby i kolejność sportowa nie są tu utrwalane — pochodzą z aktywnego snapshotu gry — ale sposób pisania i bieżąca redakcja są wersjonowane.

## Po co istnieje `character`

Sześć liczb na ekranie pozwala porównać kluby, lecz nie składa ich automatycznie w ofertę prowadzenia drużyny. `character` robi tylko to: jednym zdaniem łączy stan sportowy, sytuację finansową i — gdy ma znaczenie — trwały kontekst realnego klubu. Nie ocenia trudności i nie tworzy nowej mechaniki.

## Schemat

```text
[jakość lub profil sportowy] + [sytuacja finansowa] + [opcjonalny trwały kontekst]
```

Każde zdanie spełnia wszystkie reguły:

1. Ma jedną frazę sportową i jedną finansową; trzeci składnik jest opcjonalny.
2. Ma docelowo `70–125` znaków i nie więcej niż jedno zdanie.
3. Sport wynika z `initialClubProjection()` albo porównania `attack` i `defence` w aktywnym `TEAM_RATINGS`.
4. Finanse wynikają z wielkości gry: `scaledRecurringRevenue`, `projectedTransferBudgetChange` lub `projectedWageShare`. Historyczny `wageToRevenueRatio` z raportu nie opisuje wygenerowanej kadry i nie może uzasadniać tekstu.
5. Trwały kontekst może dotyczyć mistrzostwa, awansu, udziału w Europie albo modelu właścicielskiego. Nie używa formy po kilku kolejkach ani plotek transferowych.
6. Zdanie nie podaje dokładnego miejsca, punktów ani kwoty, bo te stoją obok i mogą się zestarzeć. Nazwa rozgrywek jest dozwolona.
7. Nie używa etykiet `łatwy`, `średni`, `trudny` ani synonimu będącego werdyktem projektanta.
8. Nie przypisuje klubowi strategii, której gra nie modeluje. W szczególności historyczne wpływy transferowe nie znaczą, że klub będzie sprzedawał zawodników za gracza.
9. Fakt o właścicielu albo sponsorze może opisywać pieniądze już włożone w obecną kadrę. Dodatkową gotówkę na start obiecuje wyłącznie wtedy, gdy aktywna formuła budżetu ma jawny, wiążący `backerSupportFloor`. Podłoga działa tylko przy tworzeniu kariery; nie jest corocznym przelewem.
10. Po zmianie `TEAM_RATINGS`, pucharów, finansów albo formuły reinwestycji wszystkie osiemnaście zdań przechodzi ponowny audyt, nawet jeżeli diff danych dotknął tylko jednego klubu.

Kod nie generuje tekstu z progów. Test sprawdza formę zdania, zakazane słowa oraz zgodność kierunku podstawowych tez z bieżącymi rangami i znakami projekcji. Ocena redakcyjna pozostaje jawna.

### Słownik siły bilansu

Słowa o bilansie nie zależą od kwoty bezwzględnej. Test liczy przedsezonową marżę operacyjną bez
transferów i pucharów:

```text
operatingMargin = projectedSeasonBalanceWithoutTransfersAndCups / scaledRecurringRevenue
```

- `|operatingMargin| < 0.10` — „bilans bliski zera”;
- `0.10..0.25` po właściwej stronie zera — „lekki” albo „umiarkowany” deficyt/nadwyżka;
- ponad `0.25` — „znaczny” lub „głęboki” deficyt/nadwyżka;
- „najgłębszy”, „największy” i podobne superlatywy wymagają skrajnej rangi w całej osiemnastce.

`BOARD_REINVESTMENT_RATE` zmienia część bilansu przekazaną do budżetu transferowego, ale nie zmienia
oceny zdrowia operacyjnego klubu. Dzięki temu słownik nie zmienia znaczenia tylko dlatego, że zarząd
zatrzyma większą część wyniku poza budżetem transferowym.

## Bieżące opisy

| `clubId` | `character` |
| --- | --- |
| `legia-warszawa` | Największe przychody ligi dają ogromny margines finansowy, choć kadra jest prognozowana tylko do walki o czołówkę. |
| `lech-poznan` | Najmocniejsza kadra, zdrowa nadwyżka i obrona mistrzostwa połączona z eliminacjami Ligi Mistrzów. |
| `rakow-czestochowa` | Kadra na walkę o tytuł i stabilne finanse, do tego eliminacje Ligi Konferencji. |
| `jagiellonia-bialystok` | Kadra górnej połowy, zdrowy bilans i start w eliminacjach Ligi Europy. |
| `pogon-szczecin` | Kadra na górną połowę i wysokie przychody zostawiają duży margines na przebudowę. |
| `gornik-zabrze` | Mocna kadra i eliminacje Ligi Mistrzów przy skromnym przychodzie i lekkim deficycie. |
| `cracovia` | Solidna obrona i bilans bliski zera wymagają ostrożności u progu nowej ery prywatnego właściciela. |
| `widzew-lodz` | Pieniądze właściciela zbudowały kadrę na podium, a własne przychody są w górnej połowie ligi. |
| `slask-wroclaw` | Kadra do walki o utrzymanie i bilans bliski zera w miejskim klubie po szybkim powrocie. |
| `piast-gliwice` | Słaba kadra, zwłaszcza w obronie, i lekki deficyt to wyzwanie dla klubu pod miejską kontrolą. |
| `radomiak-radom` | Najniższa prognoza sportowa i znaczny deficyt przy jednym z najniższych przychodów ligi. |
| `korona-kielce` | Nowy właściciel już wzmocnił kadrę środka tabeli, lecz niski przychód zostawia znaczny deficyt. |
| `motor-lublin` | Wyrównana kadra i bilans bliski zera, przy właścicielu budującym klub bez finansowej szarży. |
| `zaglebie-lubin` | Słaby atak i bilans bliski zera mimo przychodu z górnej połowy oraz stabilnego zaplecza KGHM. |
| `wisla-krakow` | Ofensywny profil, słaba obrona i niewielka nadwyżka w sezonie powrotu do Ekstraklasy. |
| `wieczysta-krakow` | Pieniądze głównego sponsora zbudowały kosztowną kadrę; niski przychód i niedojrzałe zaplecze tworzą deficyt. |
| `gks-katowice` | Kadra środka tabeli ma znaczny deficyt, który może zmniejszyć udana kampania w Lidze Konferencji. |
| `wisla-plock` | Niezła obrona, lecz najniższy przychód i najgłębszy deficyt mimo miejskiego właściciela oraz ORLENU i Budmatu. |

## Podstawa i ograniczenia

Warstwa sportowa i finansowa powyższej tabeli została sprawdzona 2026-09-11 względem `TEAM_RATINGS`, `initialClubBudget`, `scaledRecurringRevenue` oraz analitycznej projekcji płac generatora. Po aktywacji §3.5–3.6 speka finansowego trzeba powtórzyć sprawdzenie na `projectedTransferBudgetChange`; nie wolno zachować zdania, któremu nowy znak albo ranga przeczy.

Pełny, datowany audyt modelu właścicielskiego i znaczenia finansowego dla każdego klubu znajduje się
w `docs/decisions/club-owner-finance-context-2026-09-11.md`. Rozdziela on bieżący stan realny,
historyczne liczby manifestu oraz mechanikę jednorazowej podłogi. Tylko Widzew, Wieczysta i Korona
wchodzą do pomiaru `backerSupportFloor`; Motor jest kontrolą powściągliwego właściciela bez podłogi.
Pozostały kontekst jest redakcyjny i nie zmienia ekonomii.

Puchary 2026/27 i sezonowy kontekst awansów wynikają z przypiętych snapshotów sezonu źródłowego. Kampania GKS-u jest szansą na poprawę budżetu, nie przychodem dopisanym do porównawczej
prognozy przed sezonem.

Jeżeli źródło trwałej ciekawostki znika albo staje się nieaktualne, usuwa się trzeci składnik zdania. Nie zastępuje się go słabszą plotką.

Ponowny audyt 2026-09-14 skonfrontował wszystkie osiemnaście zdań z aktywowaną ekonomią —
`projectedTransferBudgetChange`, `projectedSeasonBalance` i `scaledRecurringRevenue` — zamiast ze
stanem sprzed aktywacji z 2026-09-11. Jedno zdanie okazało się fałszywe: Górnik Zabrze mówił o
„zdrowym bilansie", podczas gdy projekcja daje margines operacyjny −13,9% przychodu — lekki deficyt,
nie zdrowie ani nadwyżkę. Zdanie zostało poprawione do „lekkiego deficytu", zachowując resztę
struktury i słownictwa. Pozostałych siedemnaście zdań pomiar potwierdził jako zgodne z danymi.
