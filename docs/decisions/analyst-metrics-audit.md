# Katalog metryk analityka — audyt źródeł i decyzja

**Audyt:** 2026-09-02
**Decyzja i wdrożenie:** 2026-09-03

## Decyzja

Raport analityka używa nazw metryk źródłowych albo jawnie opisanych pochodnych. Angielska nazwa nie wystarcza: wyświetlana liczba musi zachowywać definicję, jednostkę, licznik, mianownik, normalizację i naturalne granice wielkości, którą obiecuje.

Gra nie odtwarza licencjonowanych obserwacji meczowych. Każda wartość jest syntetyczną, liniową prezentacją tego samego percentyla jakości. Zakres `displayScale` nie udaje więc empirycznego 5.–95. percentyla dostawcy, ale musi być możliwy wymiarowo i mieć jawny status dowodu.

Audyt nie zmienia balansu: nie rusza `marketEdge`, percentyli, bundle'i, wpływu na atak lub obronę ani kolejności RNG. Dwa identyfikatory zostały poprawione, lecz zachowują dawne wejścia `metricDelta`, dlatego istniejący zawodnicy nie dostają nowych standingów wskutek samego przemianowania.

## Pełny katalog obowiązujący

Kierunek `↑` oznacza „więcej = lepiej”, a `↓` — „mniej = lepiej”; w drugim przypadku UI pokazuje odwrócony percentyl jakości. „Syntetyczny” przy zakresie nie oznacza dowolnego znaczenia metryki, tylko brak twierdzenia, że końce są rzeczywistymi percentylami ligi.

| ID / nazwa w UI | Co oznacza | Dostawca i pole źródłowe | Zakres w grze | Typ wartości | Kierunek | Dowód zakresu |
| --- | --- | --- | ---: | --- | :---: | --- |
| `goalsPreventedPer90` / **Goals Prevented /90** | Niekarne PSxG strzałów celnych przeciw bramkarzowi minus niekarne gole stracone, na 90 minut. | StatsBomb `player_season_gsaa_90` | `−0,35…+0,35` | podpisane gole `/90` | ↑ | **uprawdopodobniony**: publiczne przykłady StatsBomb `+0,30` i `+0,32 /90`; końce pozostają syntetyczne |
| `positioningErrorAverage` / **Positioning Error Average** | Średnia odległość bramkarza od modelowanej pozycji optymalnej przy kwalifikowanych strzałach bez karnych. | StatsBomb `player_season_np_optimal_gk_dlength` / `gk_positioning_error` | `1,14…2,97 m` | dystans, metry | ↓ | **uprawdopodobniony**: player-facing przeliczenie syntetycznego `1,25…3,25 yd` przez `1 yd = 0,9144 m`; publiczny przykład `1,53 yd` przypina rząd wielkości źródłowej |
| `passCompletionAboveExpected` / **Pass Completion Above Expected** | `100 × (Σ completed − Σ xPass) / N`, gdzie `N` to podania z dostępnym xPass; równoważnie faktyczna skuteczność minus oczekiwana skuteczność. | StatsBomb xPass + jawna lokalna pochodna | `−8…+8 pp` | podpisane punkty procentowe | ↑ | niezweryfikowany syntetyczny zakres |
| `longBallCompletionPct` / **Long Ball Completion %** | Udział celnych długich podań wśród prób. | StatsBomb `player_season_long_ball_ratio` | `25…75%` | procent | ↑ | niezweryfikowany syntetyczny zakres |
| `crossClaimSuccessPct` / **Cross Claim Success %** | Udział udanych przejęć wśród prób wyjścia bramkarza do dośrodkowania. | StatsBomb `player_match_claim_success` | `78…97%` | procent prób | ↑ | niezweryfikowany syntetyczny zakres; mianownikiem są próby, nie wszystkie dośrodkowania |
| `successfulGkExitsPct` / **Successful GK Exits %** | Udział udanych wyjść bramkarza wśród wszystkich wyjść. | Wyscout `percent.gkSuccessfulExits` | `45…95%` | procent prób | ↑ | niezweryfikowany syntetyczny zakres |
| `stopReducePossessionDangerPct` / **Stop or Reduce Possession Danger %** | Udział interwencji przy piłce, które zatrzymały lub zmniejszyły zagrożenie posiadania rywala. | SkillCorner `Stop or Reduce Possession Danger %` | `15…65%` | procent interwencji | ↑ | niezweryfikowany syntetyczny zakres |
| `defensiveDuelsWonPct` / **Defensive Duels Won %** | Udział wygranych pojedynków defensywnych. | Wyscout `percent.defensiveDuelsWon` | `45…80%` | procent | ↑ | niezweryfikowany syntetyczny zakres |
| `lineBreakingPassCompletionPct` / **Line-Breaking Pass Completion %** | Udział celnych podań łamiących linię w otwartej grze. | StatsBomb `player_match_lbp_completed / player_match_lbp`, jawna pochodna | `45…92%` | procent | ↑ | niezweryfikowany syntetyczny zakres |
| `hops` / **HOPS Rating (Normalized)** | Kontekstowa ocena zdolności gry w powietrzu. | StatsBomb HOPS | `0…1` | znormalizowany rating | ↑ | **potwierdzony** przez definicję skali dostawcy |
| `aerialWinPct` / **Aerial Win %** | Udział wygranych pojedynków powietrznych. | StatsBomb `player_season_aerial_ratio` | `35…80%` | procent | ↑ | niezweryfikowany syntetyczny zakres |
| `successfulDribblesPct` / **Successful Dribbles %** | Udział udanych dryblingów. | StatsBomb `player_season_dribble_ratio` | `35…74%` | procent | ↑ | niezweryfikowany syntetyczny zakres |
| `xaPerKeyPass` / **xA per Key Pass** | Średnia wartość xA jednego kluczowego podania, łącznie ze stałymi fragmentami. | Wyscout `total.xgAssist / total.keyPasses`, jawna pochodna | `0,04…0,23` | xG na kluczowe podanie | ↑ | niezweryfikowany syntetyczny zakres |
| `ballRetentionRatioUnderHighPressure` / **Ball Retention Ratio Under High Pressure** | Udział posiadań utrzymanych pod wysoką presją. | SkillCorner | `60…95%` | procent | ↑ | **uprawdopodobniony** przez publiczne przykłady procentowe |
| `progressiveActionUnderIntensePressure` / **Progressive Action Under Intense Pressure** | Udział przyjęć pod wysoką lub bardzo wysoką presją, po których podanie albo prowadzenie przesuwa piłkę o co najmniej 8 m. | SkillCorner, jawna pochodna udziałowa | `20…70%` | procent kwalifikowanych przyjęć | ↑ | niezweryfikowany syntetyczny zakres |
| `dangerousOpponentHalfRecoveriesPer90` / **Dangerous Opponent-Half Recoveries** | Odzyskania na połowie rywala prowadzące do strzału w ciągu 20 sekund, na 90 minut. | Wyscout `average.dangerousOpponentHalfRecoveries` | `0…1 /90` | zdarzenia `/90` | ↑ | niezweryfikowany syntetyczny zakres; nazwa techniczna nie udaje już procentu |
| `dribbleCarryObv` / **Dribble & Carry OBV** | Suma On-Ball Value dodana przez dryblingi i prowadzenia piłki, na 90 minut. | StatsBomb `player_season_obv_dribble_carry_90` | `−0,05…+0,25 /90` | podpisane OBV `/90` | ↑ | niezweryfikowany syntetyczny zakres |
| `xgotMinusXg` / **Shooting Goals Added** | Suma post-shot xGOT minus suma pre-shot xG dla strzałów zawodnika, na 90 minut. | Opta `Shooting Goals Added = xGOT − xG` | `−0,10…+0,20 /90` | podpisane gole `/90` | ↑ | niezweryfikowany syntetyczny zakres; agregacja `/90` jest jawna w wartości |
| `xgPerShot` / **NP xG/Shot** | Średnie xG strzału bez rzutu karnego. | StatsBomb `player_season_np_xg_per_shot` | `0,06…0,24` | xG na strzał bez karnego | ↑ | niezweryfikowany syntetyczny zakres |
| `successfulLinkupPlaysPct` / **Successful Link-Up Plays %** | Udział udanych zagrań typu link-up play. | Wyscout `percent.successfulLinkupPlays` | `35…80%` | procent | ↑ | niezweryfikowany syntetyczny zakres |
| `passCompletionRatioUnderHighPressure` / **Pass Completion Ratio Under High Pressure** | Udział celnych podań wykonanych pod wysoką presją. | SkillCorner | `65…95%` | procent | ↑ | **uprawdopodobniony** przez publiczne przykłady procentowe |

Wykonywalnym źródłem prawdy dla pól, liczników, mianowników, jednostek, normalizacji i statusów jest `src/data/analyst-metric-sources.ts`. Test `tests/logic/analyst-metrics.test.ts` wymaga dokładnie jednego wpisu manifestu dla każdej aktywnej metryki i przypina wszystkie końce `displayScale`.

Każda z 21 metryk ma też krótkie polskie `helpText` w `ANALYST_METRICS`. UI podaje je przez współdzielony `InfoPopover` przy kanonicznej nazwie: objaśnienie mówi, co mierzy wartość i jaki ma kierunek, ale nie dodaje nowego sygnału ani nie odsłania ukrytego sufitu.

## Audyt par i strony wpływu

Para opisuje jeden czytelny aspekt gry zawodnika na danej pozycji. `impactSide` mówi, do której strony jakości zespołu trafia ukryty `marketEdge`; nie jest osobną oceną każdej metryki. Obowiązujący katalog par pozostaje bez zmian:

| Grupa | Zestaw | Para | Wpływ | Uzasadnienie |
| --- | --- | --- | :---: | --- |
| BR | obrona strzałów | Goals Prevented /90 + Positioning Error Average | obrona | rezultat obrony strzałów i jakość ustawienia |
| BR | rozegranie | Pass Completion Above Expected + Long Ball Completion % | atak | jakość podań ponad trudność prób i skuteczność długiego rozegrania |
| BR | kontrola pola karnego | Cross Claim Success % + Successful GK Exits % | obrona | skuteczność chwytów dośrodkowań i pozostałych wyjść |
| ŚO | bronienie | Stop or Reduce Possession Danger % + Defensive Duels Won % | obrona | wygaszanie zagrożenia i wynik pojedynku |
| ŚO | progresja | Line-Breaking Pass Completion % + Pass Completion Above Expected | atak | przełamywanie linii i jakość podań skorygowana o trudność |
| ŚO | powietrze | HOPS Rating (Normalized) + Aerial Win % | obrona | kontekstowa jakość i surowa skuteczność w powietrzu |
| boczny obrońca | bronienie | Stop or Reduce Possession Danger % + Defensive Duels Won % | obrona | ten sam aspekt obronny co u stopera |
| boczny obrońca | prowadzenie | Dribble & Carry OBV + Successful Dribbles % | atak | wartość progresji z piłką i skuteczność prób |
| boczny obrońca | kreacja | xA per Key Pass + Line-Breaking Pass Completion % | atak | jakość ostatniego podania i progresja podaniem |
| środkowy pomocnik | podania | Line-Breaking Pass Completion % + Pass Completion Above Expected | atak | progresja i jakość podań ponad modelowane oczekiwanie |
| środkowy pomocnik | odporność na pressing | Ball Retention Ratio Under High Pressure + Progressive Action Under Intense Pressure | atak | utrzymanie i progresja po przyjęciu pod presją |
| środkowy pomocnik | aktywna obrona | Dangerous Opponent-Half Recoveries + Stop or Reduce Possession Danger % | obrona | odzysk prowadzący do strzału w 20 s oraz wygaszanie zagrożenia; zestaw opisuje pressing, choć pierwsza metryka ma ofensywny skutek zdarzenia |
| ofensywny pomocnik | kreacja | xA per Key Pass + Line-Breaking Pass Completion % | atak | jakość kreowanych strzałów i podania przełamujące linie |
| ofensywny pomocnik | prowadzenie | Dribble & Carry OBV + Successful Dribbles % | atak | wartość oraz skuteczność gry jeden na jednego z piłką |
| ofensywny pomocnik | wykończenie | Shooting Goals Added + NP xG/Shot | atak | jakość wykonania strzałów oraz jakość wybieranych prób bez karnych |
| napastnik | wykończenie | Shooting Goals Added + NP xG/Shot | atak | ten sam aspekt strzelecki co u ofensywnego pomocnika |
| napastnik | gra łącznikowa | Successful Link-Up Plays % + Pass Completion Ratio Under High Pressure | atak | skuteczność zagrań łącznikowych i podań pod presją |
| napastnik | powietrze | HOPS Rating (Normalized) + Aerial Win % | atak | kontekstowa jakość oraz skuteczność pojedynków powietrznych w roli atakującej |

Jedyny zestaw wymagający dopowiedzenia to aktywna obrona środkowego pomocnika. Wyscout definiuje `dangerousOpponentHalfRecoveries` jako odzyskania na połowie rywala prowadzące do strzału w ciągu 20 sekund i udostępnia wariant `average` na 90 minut. To nie jest ogólny procent odzysków ani czysta produkcja ofensywna; w tej parze mierzy efekt pressingu. Dlatego pozostaje po stronie obrony, obok bezpośredniej miary wygaszania zagrożenia.

## Najważniejsze rozstrzygnięcia

### Goals Prevented zamiast Shot Stopping %

`Goals Prevented Rate` Opta jest ilorazem `xGOT faced / goals conceded` z bazą `1,0`, więc nie pasuje do signed procentu wokół zera. Wybrana została ciekawsza wielkość StatsBomb: `gsaa_90`, czyli gole zapobieżone ponad oczekiwanie na 90 minut. UI pokazuje ją jako `Goals Prevented /90`; zakres `−0,35…+0,35 /90` obejmuje publiczne przykłady StatsBomb `+0,30` i `+0,32 /90`.

### Positioning Error Average pozostaje rzeczywistym dystansem

To nie jest lokalny indeks. StatsBomb opisuje wielkość jako średni dystans od modelowanej pozycji optymalnej, a w nowszym materiale używa dokładnego określenia `Positioning Error Average`. Źródłowe jardy są świadomym wnioskiem z udokumentowanego systemu współrzędnych boiska `120 × 80`; publiczny przykład `1,53` ustala rząd wielkości, ale nie empiryczny rozkład. UI używa wygodniejszych dla polskiego gracza metrów: syntetyczny zakres `1,25…3,25 yd` po dokładnym przeliczeniu `1 yd = 0,9144 m` daje prezentacyjne `1,14…2,97 m`. Status pozostaje uprawdopodobniony, nie potwierdzony.

### Pass Completion Above Expected jest wykonalną pochodną xPass

xPass przypisuje każdej kwalifikującej się próbie prawdopodobieństwo ukończenia. Dla zbioru podań, dla których model zwraca xPass, sumę prawdopodobieństw można traktować jako oczekiwaną liczbę celnych podań. Gra przypina więc pochodną `100 × (Σ completed − Σ xPass) / N`, gdzie `completed` ma wartość `1` albo `0`, a `N` jest liczbą podań z dostępnym xPass. To dokładnie różnica faktycznego i oczekiwanego procentu celności, wyrażona w punktach procentowych. Nazwa nie udaje natywnego pola StatsBomb, a zakres `−8…+8 pp` nadal ma status niezweryfikowanego syntetycznego zakresu.

### Shooting Goals Added nie jest Goals Added

Opta nazywa różnicę `xGOT − xG` dokładnie `Shooting Goals Added (SGA)`. [Goals Added (g+) American Soccer Analysis](https://www.americansocceranalysis.com/what-are-goals-added) jest innym modelem: przypisuje wartość wielu akcjom z piłką, a nie wyłącznie jakości wykonania strzału. Zmiana etykiety na samo `Goals Added` byłaby więc mniej precyzyjna.

### CCAA pozostaje wykluczone

StatsBomb `CCAA` opisuje skłonność bramkarza do podejmowania prób przejęcia dośrodkowania względem oczekiwania, nie skuteczność ani jakość. Gra bez taktyki i dopasowania stylu nie daje graczowi decyzji, w której samo „częściej wychodzi” byłoby jednoznacznie lepsze. Informację o jakości przejęć niesie `Cross Claim Success %`.

## Statusy dowodu zakresu

1. **potwierdzony** — końce wynikają z udokumentowanej skali albo rozkładu;
2. **uprawdopodobniony** — publiczne przykłady potwierdzają jednostkę i rząd wielkości, ale nie cały rozkład;
3. **ograniczony definicją** — brak rozkładu, lecz definicja i naturalne granice wykluczają wartości niemożliwe;
4. **niezweryfikowany** — końce są syntetyczne i nie mają jeszcze publicznego zakotwiczenia. To nie unieważnia poprawnej definicji, lecz nie wolno nazywać zakresu empirycznie zweryfikowanym.

## Źródła przypięte

| ID | Źródło | Czego dowodzi |
| --- | --- | --- |
| SB-IQ | MCP `football-docs` → `statsbomb/iq-metrics-glossary`, dostęp 2026-09-02 | definicje StatsBomb: GSAA, positioning error, OBV, claim success, LBP i CCAA |
| SB-PS | MCP `football-docs` → `statsbomb/player-season-stats`, dostęp 2026-09-02 | pola sezonowe, w tym `gsaa_90`, `np_optimal_gk_dlength`, `np_xg_per_shot` i `obv_dribble_carry_90` |
| SB-COORD | MCP `football-docs` → `statsbomb/coordinate-system`, dostęp 2026-09-03 | boisko StatsBomb ma współrzędne `120 × 80` w jardach; podstawa wniosku o jednostce dystansu |
| SB-GK-2019 | [StatsBomb: The Two Gianluigis](https://statsbomb.com/articles/soccer/the-two-gianluigis-will-donnarumma-dominate-in-goal-for-the-next-20-years-like-buffon-did-for-the-last-20/), dostęp 2026-09-03 | publiczne przykłady `+0,30`, `+0,32 GSAA/90` i positioning error `1,53` |
| SB-GK-2025 | [Hudl StatsBomb: Europe Women's Goalkeepers 2024-25](https://www.hudl.com/blog/europe-women-goalkeepers-2024-25-statsbomb), dostęp 2026-09-03 | dokładna nazwa `Positioning Error Average` |
| SB-RADAR | [Hudl StatsBomb: New Radars 2023](https://www.hudl.com/blog/new-statsbomb-radars-2023-update), dostęp 2026-09-02 | publiczne nazwy i definicje radarowe StatsBomb |
| SB-HOPS | [Hudl StatsBomb: HOPS metrics](https://www.hudl.com/blog/statsbomb-hops-set-pieces-upgrades), dostęp 2026-09-02 | `HOPS Rating (Normalized)` ma skalę `0–1` |
| SB-XPASS | [Hudl StatsBomb: Expected Pass](https://www.hudl.com/blog/statsbomb-models-expected-pass-xpass-and-pass-clustering), dostęp 2026-09-02 | prawdopodobieństwo ukończenia pojedynczego podania i zasadność porównania sumy wykonania z sumą oczekiwań |
| SB-LBP | [Hudl StatsBomb: Line-Breaking Passes](https://www.hudl.com/blog/hudl-statsbomb-launch-new-360-metrics-line-breaking-passes-and-ball-receipts-in-space), dostęp 2026-09-02 | definicja podań łamiących linię |
| OPTA-XGOT | [Opta Analyst: What Are Expected Goals on Target?](https://theanalyst.com/articles/what-are-expected-goals-on-target-xgot), dostęp 2026-09-02 | `Shooting Goals Added = xGOT − xG` oraz odrębna definicja `Goals Prevented Rate` |
| WY-API | [Wyscout: Players WyID AdvancedStats](https://support.wyscout.com/players-wyid-advancedstats), dostęp 2026-09-02 | rozdzielenie `total`, `average` i `percent`, w tym odzyskania `/90` |
| WY-GLOSSARY | [Wyscout Data Glossary](https://dataglossary.wyscout.com/player_metrics/), dostęp 2026-09-02 | definicje pojedynków, dryblingów, długich podań i wyjść bramkarza |
| SC-PRESSURE | [SkillCorner: Scouting South America](https://skillcorner.com/articles/scouting-south-america), dostęp 2026-09-02 | wskaźniki pod presją są prezentowane jako procenty |
| SC-PROGRESSIVE | [SkillCorner: Progressive Actions Under Intense Pressure](https://www.skillcorner.com/es/articles/metric-explainer-progressive-actions-under-intense-pressure), dostęp 2026-09-02 | próg progresji 8 m i zakres zdarzeń pod presją |
| SC-DEFENCE | [SkillCorner: Profiling Centre-Backs](https://skillcorner.com/us/articles/smarter-scouting---profiling-players-beyond-the-position-group-centre-backs), dostęp 2026-09-02 | licznik i mianownik `Stop or Reduce Possession Danger %` |

Materiały StatsBomb z MCP są opracowaniem katalogowym `football-docs`, a nie publicznym eksportem komercyjnego IQ. Służą do przypięcia pól i definicji; publiczne strony Hudl StatsBomb są dodatkowym dowodem nazw i rzędu wielkości. Raport nie twierdzi, że pozyskał licencjonowany rozkład ligi.

## Kontrakty techniczne

- `tests/logic/analyst-metrics.test.ts` przypina komplet katalogu, jednostki, naturalne granice i wszystkie końce skal.
- `tests/logic/analyst-report.test.ts` przypina percentyle dla przemianowanych metryk. Mapa kompatybilności seeda w `src/logic/analyst-report.ts` zapobiega ich przelosowaniu.
- `tests/ui/game-save.test.ts` przypina migrację schematu 7/8/9 → 10. Stare ID są przyjmowane wyłącznie dla wersji 7/8; wersja 9 przelicza jardową wartość prezentacyjną na metry z zachowanego percentyla, a bieżący zapis wymaga nowych ID.
- `tests/ui/common-components.test.ts` i jego snapshot przypinają wyrenderowane nazwy, liczby, jednostki, pełne `aria-label` oraz obecność polskiego objaśnienia przy każdej metryce.
- `tests/e2e/smoke.spec.ts` sprawdza na szerokości 360 px, że oba znaki `?` są dostępne, popover otwiera się na hover i nie powoduje poziomego przepełnienia.
- Zmiana nie wymaga `golden:retrace`: stan silnika, decyzje, RNG i replaye są niezmienione.
