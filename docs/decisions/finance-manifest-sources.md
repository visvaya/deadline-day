# Manifest finansowy — dowody źródłowe

Dowody za każdą liczbą w `src/data/club-finance-profiles.ts` i `src/data/club-finance-sources.ts`.
Manifest jest wykonywalnym źródłem prawdy; ten plik mówi, **skąd** wzięła się każda pozycja,
z jakiego dokumentu i strony, oraz co zostało odrzucone i dlaczego.

Czytaj przed zmianą jakiejkolwiek liczby finansowej. Nie czytaj prewencyjnie.

**Stan: bramka danych zamknięta 2026-09-08.** Badanie szło w czterech podejściach; ten dokument
jest zorganizowany **wokół liczb, nie wokół podejść**. Chronologia i historia korekt są
w załączniku na końcu — tam, gdzie nie zasłaniają aktualnego werdyktu.

Nie kontaktowano się z klubami, ligą ani PZPN. Pozyskanie dokumentów bezpośrednio od nich jest
osobnym krokiem.

## 1. Źródła

| Oznaczenie | Dokument | Okres | Dostęp |
| --- | --- | --- | --- |
| **GT-EKS** | Grant Thornton, „Finansowa Ekstraklasa — kluby PKO BP Ekstraklasy za sezon 2024/2025", 80 stron | 1.07.2024 – 30.06.2025 | [grantthornton.pl](https://grantthornton.pl/wp-content/uploads/2025/09/Finansowa-Ekstraklasa-sezon-2024-2025-Grant-Thornton.pdf), lokalnie `docs/finance/` (poza gitem) |
| **GT-1L** | Grant Thornton, „Finansowa pierwsza liga — kluby Betclic 1 Ligi za sezon 2024/2025", 68 stron | 1.07.2024 – 30.06.2025 | [grantthornton.pl](https://grantthornton.pl/wp-content/uploads/2025/10/Fiannsowa-pierwsza-liga-2024-2025-Grant-Thornton.pdf), lokalnie `docs/finance/` |
| **KSW-2025** | Sprawozdanie finansowe KS Wieczysta za 2025 | rok kalendarzowy 2025 | [kswieczysta.com](https://www.kswieczysta.com/storage/uploaded/sprawozdanie_2025.pdf) |
| **TSP-2025** | Sprawozdanie finansowe TS Podbeskidzie | 1.07.2024 – 30.06.2025 | [tspodbeskidzie.pl](https://tspodbeskidzie.pl/static/upload/store/Sprawozdania2025/SF_TSP_06_2025.pdf) |
| **UEFA-FR** | Raport finansowy UEFA 2024/25, strony drukowane 36–37 | 2024/25 | [editorial.uefa.com](https://editorial.uefa.com/resources/02a1-1fcc539a26d9-78ac6793e755-1000/20260113_enclosure_04_financial_report_2024-25_en.pdf) |
| **UEFA-13/2024** | Okólnik UEFA 13/2024, §2, str. 8–9 — stawki eliminacji | 2024/25 | [editorial.uefa.com](https://editorial.uefa.com/resources/028b-1a7880138a24-7a993e2e33d1-1000/20240322_circular_2024_13_en.pdf) |
| **EKS-RAPORT** | Oficjalny raport Ekstraklasy 2024/25, str. 39 — podział puli | 2024/25 | [umpire-esa-images…s3](https://umpire-esa-images-production.s3.eu-central-1.amazonaws.com/de5a136b-59d1-40ce-8b51-c043a004751b/documents/RAPORT_EKSTRAKLASA_2024_25.pdf) |
| **EKS-KOMUNIKAT** | Komunikat Ekstraklasy z 26.06.2025 — ok. 298 mln PLN wypłat | 2024/25 | [ekstraklasa.org](https://ekstraklasa.org/aktualnosci/wyplaty-z-ekstraklasy-za-sezon-2024-25-przekroczyly-300-mln-zl/) |
| **PZPN-III/53** | Uchwała PZPN III/53 z 28.03.2024, str. PDF 111–112 — 27 mln PLN dla I ligi | 2024/25 | [pzpn.pl](https://www.pzpn.pl/public/system/files/site_content/635/5971-Sprawozdanie%20z%20posiedzenia%20Zarz%C4%85du%20III.2024.pdf) |
| **PZPN-III/49** | Uchwała PZPN III/49 z 31.03.2025, str. PDF 191 — solidarność szkoleniowa | 2024/25 | [pzpn.pl](https://www.pzpn.pl/public/system/files/site_content/635/6617-Sprawozdanie%20z%20posiedzenia%20Zarz%C4%85du%20III.2025.pdf) |
| **RSSSF** | Karel Stokkermans, tabele Polski 2024/25 (źródło wtórne) | 2024/25 | [rsssf.org](https://www.rsssf.org/tablesp/pol2025.html) |

Oba raporty GT odczytano PyMuPDF 1.27.2.3 z warstwy tekstowej. Adres GT-EKS zweryfikowano
**pobraniem i porównaniem SHA-256** z kopią lokalną (2026-09-08):
`9822ca7ab7a076628c87c9e16db1a221ad8ccf7ef70be24f6a08f937181a2bae`, 8 443 344 bajty.
Sama zgodność `Content-Length` byłaby niewystarczająca — dowodem jest hash. Zgadywanie
miesiąca w ścieżce z siostrzanego raportu zwraca 404: ten wyszedł miesiąc wcześniej.

Jednostka tabel GT: mln PLN. Kwoty UEFA są w EUR i tak oznaczone.

## 2. Jak GT definiuje przychód, i dlaczego to jest problem

GT-EKS str. 5 dzieli przychód na cztery kategorie:

- **Dzień meczowy** — bilety, karnety, loże, catering.
- **Komercyjne** — sponsoring, reklama, dzień niemeczowy, dotacje miast.
- **Transfery** — sprzedaż zawodników wraz z bonusami warunkowymi.
- **Scentralizowane prawa mediowe i marketingowe** — „wpływy wynikające z udziału klubu
  w PKO Bank Polski Ekstraklasie **i europejskich pucharach** […] **wpływy od UEFA**
  wynikające z płatności solidarnościowych, transmisji, szkolenia, Pro Junior System".

Cztery kategorie sumują się do „przychodów ogółem"; „przychody z podstawowej działalności"
to ogółem minus transfery — **wciąż z prawami scentralizowanymi w środku**. To nie jest
jeszcze `recurringRevenuePln`.

**Czwarta kategoria łączy trzy rzeczy, które model musi rozdzielić**: dystrybucję ligową za
wynik sportowy, dystrybucję równą i rynkową oraz wpływy UEFA. Raport podaje rozbicie tylko
w narracji, dla kilku klubów. Cała reszta tego dokumentu bierze się z tego jednego zdania.

**Dzień meczowy też nie jest jednorodny.** Dla trzech klubów ekstraklasowych pieniądze UEFA
siedzą w prawach scentralizowanych, ale **dla Wisły Kraków GT umieszcza je wewnątrz dnia
meczowego** (GT-1L str. 9). Formuła „dzień meczowy minus Europa" zastosowana do Wisły
odjęłaby te same pieniądze dwa razy.

## 3. Ekstraklasa 2024/25 — odczyt per klub

**Źródłem są karty klubowe** (GT-EKS str. 44–78, parzyste), nie wykresy zbiorcze. Karta
drukuje liczby; wykres wymaga odczytu pozycyjnego i ma dwie kolumny na klub. Miejsca w tabeli
pochodzą z przypiętego `scripts/data/ekstraklasa-results.csv` — numeracja w raporcie jest
rankingiem przychodów i nie mówi nic o lokacie.

| Klub | str. | Ogółem | Transfery | Podstawowa | Dzień meczowy | Płace | Miejsce | Grywalny |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Legia Warszawa | 44 | 230,87 | 10,10 | 220,77 | 58,51 | 48% | 5 | tak |
| Lech Poznań | 46 | 145,32 | 37,02 | 108,30 | 31,28 | 52% | 1 | tak |
| Raków Częstochowa | 48 | 142,92 | 76,47 | 66,45 | 2,69 | 50% | 2 | tak |
| Jagiellonia Białystok | 50 | 129,17 | 20,16 | 109,01 | 18,24 | 37% | 3 | tak |
| Pogoń Szczecin | 52 | 78,41 | 4,09 | 74,32 | 18,43 | 55% | 4 | tak |
| Cracovia | 54 | 64,30 | 14,93 | 49,37 | 5,80 | 59% | 6 | tak |
| Widzew Łódź | 56 | 64,10 | 7,11 | 57,00 | 19,60 | 47% | 13 | tak |
| Śląsk Wrocław | 58 | 60,42 | 14,06 | 46,36 | 11,19 | 75% | 17 | tak |
| Górnik Zabrze | 60 | 57,51 | 12,67 | 44,84 | 10,65 | 47% | 9 | tak |
| KGHM Zagłębie Lubin | 62 | 48,07 | 2,08 | 45,98 | 2,17 | 99% | 15 | tak |
| Piast Gliwice | 64 | 41,89 | 7,27 | 34,61 | 1,57 | 73% | 10 | tak |
| Motor Lublin | 66 | 41,35 | 0,00 | 41,35 | 11,66 | 53% | 8 | tak |
| Korona Kielce | 68 | 33,92 | 6,50 | 27,41 | 5,27 | 65% | 11 | tak |
| Lechia Gdańsk | 70 | 33,25 | 0,44 | 32,81 | 7,28 | 75% | 14 | **nie** |
| GKS Katowice | 72 | 30,99 | 0,25 | 30,74 | 3,18 | 76% | 7 | tak |
| Radomiak Radom | 74 | 26,60 | 2,39 | 24,22 | 5,45 | 93% | 12 | tak |
| Stal Mielec | 76 | 26,08 | 4,40 | 21,68 | 1,60 | 51% | 16 | **nie** |
| Puszcza Niepołomice | 78 | 15,23 | 0,00 | 15,23 | 0,92 | 125% | 18 | **nie** |

**Kontrola sumy.** Kolumna „podstawowa" daje **1050,45 mln PLN** wobec „po raz pierwszy
przekroczyły miliard, osiągając 1 050 mln zł" (str. 12). Kolumna „ogółem" daje 1270,4 wobec
1 270 mln raportowanych dla ligi (str. 8). W każdym wierszu `ogółem − transferowe = podstawowa`
z dokładnością do 10 tys. PLN, czyli jednej jednostki zaokrąglenia raportu.

**Gwiazdka przy wykresie płac na str. 19 dotyczy kolumny 2023/2024**, nie 2024/2025. Motor,
Lechia i GKS grały tamten sezon w I lidze, więc **ich wcześniejszy** wskaźnik jest
nieporównywalny — bieżący nie. Powyższa kolumna to wyłącznie 2024/25.

**Źródłowa osiemnastka nie jest osiemnastką gry.** Kolumna „Grywalny" mówi, czy klub można
w grze poprowadzić — **nie** czy gra go zna. Lechia, Stal Mielec i Puszcza grały wtedy
Ekstraklasę, a w grze siedzą w `FIRST_DIVISION` jako pula awansów i **mają rekordy
w manifeście**; Wisła Kraków, Wisła Płock i Wieczysta są grywalne, ale nie ma ich w tym
raporcie. Percentyli i sum nie wolno liczyć „na osiemnastce gry".

## 4. Pierwsza liga 2024/25 — odczyt per klub

GT-1L str. 9 (ranking) i karty klubowe str. 36–66. **Szesnaście klubów, nie osiemnaście**:
raport jawnie pomija Bruk-Bet Termalicę Nieciecza i Kotwicę Kołobrzeg (brak udostępnionych
danych, str. 4). Miejsca z RSSSF; ranking raportu je potwierdza.

| Klub | str. | Ogółem | Transfery | Podstawowa | Płace | Miejsce | Grywalny |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Wisła Kraków | 36 | 50,80 | 0,85 | 49,95 | 58% | 4 | tak |
| Miedź Legnica | 38 | 32,65 | 8,59 | 24,06 | 62% | 5 | tak |
| Stal Rzeszów | 40 | 26,52 | 0,68 | 25,84 | 37% | 12 | tak |
| ŁKS Łódź | 42 | 25,55 | 3,16 | 22,39 | 68% | 11 | tak |
| Ruch Chorzów | 44 | 25,11 | 1,55 | 23,56 | 65% | 10 | tak |
| Arka Gdynia | 46 | 19,39 | 5,14 | 14,26 | 83% | 1 | tak |
| Wisła Płock | 48 | 15,34 | 0,59 | 14,75 | 97% | 3 | tak |
| GKS Tychy | 50 | 13,91 | 0,18 | 13,73 | 95% | 7 | **nie** |
| Odra Opole | 52 | 13,90 | 0,09 | 13,81 | 63% | 14 | tak |
| Warta Poznań | 54 | 13,58 | 0,31 | 13,27 | 66% | 17 | tak |
| Górnik Łęczna | 56 | 10,76 | 0,29 | 10,48 | 83% | 9 | **nie** |
| Polonia Warszawa | 58 | 10,51 | 0,79 | 9,72 | 129% | 6 | tak |
| Chrobry Głogów | 60 | 10,27 | 0,41 | 9,86 | 84% | 13 | tak |
| Pogoń Siedlce | 62 | 10,09 | 0,07 | 10,02 | 71% | 15 | tak |
| Znicz Pruszków | 64 | 4,97 | 0,12 | 4,86 | 90% | 8 | **nie** |
| Stal Stalowa Wola | 66 | 4,66 | 0,19 | 4,47 | 123% | 18 | **nie** |

**Kontrola sumy.** Ogółem **288,01** wobec 288,02 (str. 11); transfery **23,01** wobec 23,01 —
dokładnie. Kontrola 288 mln dotyczy **szesnastu klubów raportu**, nie osiemnastki ligi ani
osiemnastki `FIRST_DIVISION`.

**Cztery kluby spoza gry zostają w warstwie źródłowej manifestu.** Bez nich suma przestałaby
się odtwarzać, czyli najmocniejsza dostępna kontrola zamieniłaby się w słabszą.

Rozkład, do którego odwołują się dalsze oszacowania: podłoga 4,66, dolny kwartyl 10,27,
mediana 13,91 ogółem (13,77 podstawowej), górny kwartyl 25,11, maksimum 50,80.

## 5. Pula za miejsce w Ekstraklasie: 55,13 mln PLN

EKS-KOMUNIKAT podaje ok. **298 mln PLN** wypłat gotówkowych za 2024/25, dzielonych na 50%
równo, 33,5% za wynik sportowy bieżącego sezonu i 14% za ranking historyczny.

EKS-RAPORT str. 39 rozbija **wynik sportowy** dalej:

| Cel | Udział | Kwota, mln PLN |
| --- | ---: | ---: |
| **Miejsce w tabeli** | **18,5%** | **55,13** |
| Czterej pucharowicze | 14% | 41,72 |
| Solidarność spadkowiczów | 1% | 2,98 |
| Razem wynik sportowy | 33,5% | 99,83 |

Te same udziały niezależnie podaje
[Lech Poznań, 8.06.2025](https://www.lechpoznan.pl/aktualnosci,2,lider-rankingu-historycznego,45836.html);
artykuł operuje pulą wstępną 280 mln, nie końcową 298.

**Odejmujemy wyłącznie 18,5%.** Gra odtwarza drabinkę za miejsce i płaci `EUROPEAN_PRIZE_MONEY`
wzorowane na wypłatach UEFA, ale **nie ma krajowej premii za awans do Europy** ani solidarności
spadkowej. Te dwa składniki zostają w bazie razem z częścią równą, rynkową i rankingiem
historycznym.

**Kształt drabinki jest rekonstrukcją zgodną ze źródłem, nie dowodem dokładnych wag.**
Wagi `(19 − miejsce)/171` dają na puli wstępnej 280 mln krok **302 924 PLN**, co zgadza się
z „około 300 tys." z artykułu Lecha. Ale **drabinka afiniczna** o kroku dokładnie 300 000 PLN
i wypłacie ostatniego klubu 327 778 PLN sumuje się do tych samych 51,8 mln, więc przybliżony
krok **nie rozstrzyga wyrazu wolnego**. Po przeskalowaniu do 298 mln kroki obu wariantów to
322 398 i 319 286 PLN, a wypłata za pierwsze miejsce różni się o ok. 26 tys. PLN (0,5%).
To dwa scenariusze, nie przedział ufności. Udział 18,5% pozostaje źródłowy i pula 55,13 mln
się nie zmienia; niepewny jest wyłącznie kształt, i to w skali nieistotnej dla manifestu.

Mianownik 171 to `18 + 17 + … + 1`. Normalizacja jest konieczna, nie kosmetyczna: same wagi
nie zachowują puli i oddają więcej klubom niżej w tabeli.

## 6. Pierwsza liga: brak składnika za miejsce

PZPN-III/53 ustala **27 mln PLN** z praw marketingowych i telewizyjnych dla I ligi 2024/25,
zostawiając szczegółowy podział Biuru Sekretarza Generalnego i Zarządowi PLP.

Dwa niezależne świadectwa mówią, że podział był **równy, niezależny od miejsca**:
[relacja prasowa z 15.07.2024](https://www.goal.pl/1-liga/dwa-razy-wiecej-pieniedzy-zmiany-na-zapleczu-elity/)
(1,4–1,6 mln PLN na klub w czterech transzach) oraz
[prezes PLP Marcin Janicki, 3.07.2026](https://przegladsportowy.onet.pl/pilka-nozna/1-liga/prezes-plp-marcin-janicki-mowi-o-wyzwaniach-betclic-1-ligi/mj4lvt9),
który rozdziela pakiet centralny od nagród Pro Junior System. Arytmetyczne `27 / 18 = 1,5 mln`
mieści się w tej relacji. Żadne z tych źródeł nie jest podpisaną tabelą wykonawczą.

**Wniosek: `leaguePrizeRevenuePln = 0` dla całej pierwszej ligi w sezonie źródłowym.**
Zamyka to pytanie otwarte w speku §2.2 — baza 14,75 mln Wisły Płock przechodzi bez odjęcia.

**Uzasadnieniem jest równy podział, nie rola klubów w grze.** Padła kiedyś propozycja, żeby
uzasadnić to zero tym, że baza pierwszoligowa zasila wyłącznie `buyerCapacity` — to nieprawda:
**Wisła Płock i Wisła Kraków są klubami grywalnymi**. Pro Junior System nie jest premią za
miejsce i nie należy go zerować pod tą nazwą.

Szczeble niższe (II, III liga) nie mają składnika za miejsce w ogóle.

## 7. Europa 2024/25 per klub

**Uczestnikami byli Jagiellonia, Legia, Śląsk i Wisła Kraków.** Nie Pogoń Szczecin ani Górnik
Zabrze — ta para pojawiła się kiedyś w notatce i była błędem; test przypina im zero, żeby
pomyłka nie wróciła. Wisła zaczęła od Ligi Europy, nie od Konferencji. Wykazy:
[LK](https://www.uefa.com/uefaconferenceleague/history/seasons/2025/clubs/),
[LE](https://es.uefa.com/uefaeuropaleague/history/seasons/2025/clubs/),
[LM](https://www.uefa.com/uefachampionsleague/history/seasons/2025/clubs/).

Kluczem do rozwiązania jest agregat, którego raport nie ukrywa (GT-EKS str. 12):

> „Z kwoty 215 mln zł wygenerowanych w ostatnim sezonie z dnia meczowego, aż **28 mln zł
> (13%)** zapewniły Legia Warszawa, Jagiellonia Białystok oraz Śląsk Wrocław **wyłącznie
> dzięki udziałowi w rozgrywkach europejskich**."

| klub | UEFA / prawa scentralizowane | dzień meczowy europejski | razem | status |
| --- | ---: | ---: | ---: | --- |
| Legia | ok. 50,0 (str. 11) | ok. 19,0 (str. 11) | **69,0** | `reported` |
| Jagiellonia | ok. 44,0 (str. 11) | ok. 7,0 (reszta) | **51,0** (str. 11) | `reported` |
| Śląsk | 5,7 (str. 58) | ok. 2,0 (reszta) | **7,7** | `estimated` |
| Wisła Kraków | 5,3 (GT-1L str. 9, w dniu meczowym) | nieujawnione | **≥ 5,3** | `estimated` |

**Kontrola domknięcia:** `19,0 + 7,0 + 2,0 = 28,0`, dokładnie agregat ze str. 12. Trzy liczby
wyprowadzone z trzech różnych miejsc raportu domykają jego własną sumę.

**Legia.** Dzień meczowy 58,51 mln, „z czego prawie 19 mln zł z biletów na mecze w rozgrywkach
europejskich"; prawa scentralizowane 76,7 mln, „w tym blisko 50 mln zł od UEFA". Kontrola
wobec UEFA-FR: 10,837 mln EUR × 4,30 = 46,60 mln zł, o ok. 3,4 mln mniej niż „blisko 50" —
różnica jest w skali opłat za eliminacje, których tabela fazy ligowej nie obejmuje.

**Jagiellonia.** Raport podaje sumę wprost („blisko 51 mln zł"), z czego „prawie 44 mln zł od
UEFA" wewnątrz 71 mln praw scentralizowanych; dzień meczowy klubu to 18,24 mln. Składnik
biletowy jest resztą `51 − 44 ≈ 7`. Kontrola niezależna z frekwencji (str. 27, 29):
`424 923 − 16 473 × 17 = 144 882` widzów poza ligą, przy 43–51 zł na kibica daje
**6,2–7,4 mln**. Kontrola UEFA-FR: 9,582 mln EUR × 4,30 = 41,20 wobec „prawie 44".

**Śląsk.** Karta klubu podaje 5,7 mln „wpływów za uczestnictwo w kwalifikacjach LK"; dzień
meczowy klubu to 11,19 mln. Składnik biletowy jest resztą `28 − 19 − 7 ≈ 2` i **pochłania całe
zaokrąglenie trzech przybliżeń** („prawie 19", „blisko 51", „28"). Kontrola niezależna:
`363 264 − 18 825 × 17 = 43 239` widzów poza ligą (Puchar Polski **i** Europa), przy 26 zł na
kibica to 1,12 mln, przy cenach europejskich do ok. 1,9. **Zakres 1,1–2,0**; przyjęto 2,0,
bo domyka arytmetykę raportu.

**Wisła Kraków.** 5,3 mln od UEFA, zaklasyfikowane wewnątrz dnia meczowego (16,49 mln). Bilety
europejskie nie są wydzielone; ogranicza je cały wzrost dnia meczowego r/r, czyli 6,6 mln
(67%), z czego 5,3 to pieniądze UEFA — pozostałe 1,3 obejmuje też rekordową frekwencję ligową.
**Zakres 5,3–6,6**, przyjęto dolną granicę.

**Kurs 4,30 zł/€ służy wyłącznie kontrolom krzyżowym.** Do manifestu wchodzą liczby GT w PLN,
więc korekta europejska nie zależy od kursu. Poziom kursu i tak absorbuje dopasowanie skali
pieniądza ze speka §3.4; znaczenie mają wyłącznie różnice między klubami, niezmiennicze wobec
kursu.

## 8. UEFA poza kampanią: solidarność nie jest nagrodą

PZPN-III/49 określa dofinansowanie szkolenia młodzieży: **3,835 mln EUR dzielone po 1/16**,
z wyłączeniem uczestników faz ligowych — arytmetycznie 0,2396875 mln EUR na uprawniony klub.
Uchwała nie dowodzi daty przelewu ani ujęcia w konkretnym sprawozdaniu.

To wyjaśnia, dlaczego nieuczestniczenie w pucharach nie dowodzi zerowych wpływów od UEFA.
**Tych pieniędzy nie odejmujemy**: gra ich nie nalicza ponownie. `EUROPEAN_PRIZE_MONEY` płaci
za kampanię, nie za szkolenie młodzieży.

## 9. Kluby bez rekordu w raportach

Sześć klubów gry nie ma wiersza w żadnym z dwóch raportów.

**Wieczysta Kraków** (`estimated`). KSW-2025 wykazuje 37,96 mln przychodów działalności
statutowej za **rok kalendarzowy**, w kategoryzacji nieporównywalnej z raportem ligowym
i bez rozdzielenia płac pierwszego zespołu od wpływów właścicielskich. Spek §2.3 ustala
`recurringRevenuePln = 18,00 mln`, `ownerBudgetPercentile = 0,80`, `wageToRevenueRatio = 0,95`.
Różnica 19,96 mln to **korekta modelowa**, nie zaksięgowana kategoria — sprawozdanie nie
pokazuje takiej transakcji, a nazwanie jej wypłatą właściciela byłoby wymyśleniem jej.
Wpisana w `oneOffRevenuePln`, z `note` mówiącym to wprost. Klub nie grał w raportowanej lidze,
więc `sourceTier = "outside-reported-league"` i miejsce `0`.

**Podbeskidzie Bielsko-Biała** (`official-statement`). TSP-2025, str. 10/29 i nota 2.1 na
str. 23/29, sprawdzone wizualnie po lokalnym pobraniu:

| Pozycja rachunku wyników | PLN |
| --- | ---: |
| Sprzedaż i zrównane z nią przychody | 4 064 239,43 |
| Pozostałe przychody operacyjne | 6 775 069,91 |
| — w tym dotacje | 5 998 144,75 |
| — w tym aktualizacja aktywów niefinansowych | 495 630,28 |
| — w tym zysk z rozchodu aktywów niefinansowych | 155 678,63 |
| Przychody finansowe | 13 436,84 |
| Wynagrodzenia | 6 889 704,72 |
| Ubezpieczenia społeczne i inne świadczenia | 341 933,99 |

Suma trzech kategorii przychodów: **10 852 746 PLN**. Do `oneOffRevenuePln` wchodzą aktualizacja
i zysk z rozchodu aktywów (razem 651 309) — żadne się nie powtarza, a zysk z rozchodu **nie jest
dowiedziony jako przychód transferowy**, więc lepiej go usunąć niż źle nazwać. Baza: 10 201 437.
Wskaźnik płac to wynagrodzenia plus ubezpieczenia wobec przychodu ogółem, dla spółki, nie dla
pierwszego zespołu. Dotacji nie traktować jak podwyższenia kapitału. Nota 2.1 dzieli sprzedaż
geograficznie i nie wydziela transferów — ewentualne wpływy brutto ukryte w „sprzedaży"
zawyżałyby bazę, i to jest znany limit tego rekordu.

**Nieciecza** (`estimated`). Grała raportowaną ligę (2. miejsce), ale nie udostępniła danych.
Fallback: **mediana raportowanej ligi**, 13,77 mln bazy plus medianowa linia transferowa 0,50.
Powód, dla którego nie jest to punkt z krzywej — sekcja 11. Pasmo: rozstęp międzykwartylowy
ligi, `10,27–25,11 mln`.

**Polonia Bytom, Pogoń Grodzisk Mazowiecki, Unia Skierniewice** (`estimated`). Żaden nie ma
zweryfikowanego sprawozdania w sprawdzonych rejestrach. Właściciel produktu dopuścił
2026-09-08 wartości przybliżone: „to nie są kluby kluczowe dla gry".

Oszacowanie jest **lokowaniem porządkowym między dwiema zmierzonymi kotwicami**, nie
dopasowaniem. Kotwica górna: Podbeskidzie, jedyny zmierzony klub II ligi w tym samym sezonie
(10,85 mln, 7. miejsce), z zastrzeżeniem, że 6,00 mln z tego to dotacje — jest więc **górnym
końcem pasma II ligi**, nie środkiem. Kotwica dolna: podłoga raportowanej I ligi (4,66).

| klub | szczebel | `totalRevenuePln` | zakres | uzasadnienie |
| --- | --- | ---: | ---: | --- |
| Polonia Bytom | II liga, 1. | **9,0** | 6–11 | tuż pod Podbeskidziem; miasto 155 tys., wysoka frekwencja, silna marka, bez dotacji tej skali |
| Pogoń Grodzisk | II liga, 2. | **5,0** | 3,5–7 | na wysokości podłogi I ligi; miasto 32 tys., bez porównywalnej bazy miejskiej |
| Unia Skierniewice | III liga gr. I, 1. | **2,5** | 1,5–4 | szczebel niżej, ok. połowy oszacowania Pogoni |

**Dlaczego zakres nie zmienia zachowania gry.** Żaden z trzech nie jest grywalny — wchodzą
wyłącznie jako pula awansów, więc ich baza zasila `buyerCapacity` i `buyerFactor`, nigdy
`seasonRevenue` gracza. Istotna jest **pozycja porządkowa**, bo `buyerFactor` jest z niej
monotoniczny, a każdy punkt zakresów zostawia Polonię poniżej mediany I ligi, Pogoń w dolnym
kwartylu, a Unię poniżej podłogi. Błąd ±40% nie przesuwa żadnego do innego pasma.
**To nie jest argument przenośny na klub grywalny.**

Odrzucone jako materiał źródłowy:
[rekord rejestrowy Polonii, KRS 0000527357](https://rejestr.io/krs/527357/bytomski-sport-polonia-bytom/sprawozdania/s/4143198)
— prezentuje rok 2025 i nie pozwala oddzielić futbolu od innych obszarów spółki;
[wypowiedź prezesa Pogoni z 22.05.2025](https://przegladsportowy.onet.pl/pilka-nozna/1-liga/historyczny-wyczyn-pogoni-grodzisk-mazowiecki-marek-finkowski-wzmocnienia-sa/xe51xmf)
— to prognoza budżetu, nie przychód 2024/25. Nie używać finansów stowarzyszeń kibiców.

## 10. Miejsca źródłowe i szczeble

| clubId | Szczebel 2024/25 | Miejsce |
| --- | --- | ---: |
| lks-nieciecza | I liga (Bruk-Bet Termalica) | 2 |
| lechia-gdansk | Ekstraklasa | 14 |
| stal-mielec | Ekstraklasa | 16 |
| puszcza-niepolomice | Ekstraklasa | 18 |
| polonia-bytom | II liga | 1 |
| pogon-grodzisk-mazowiecki | II liga | 2 |
| podbeskidzie-bielsko-biala | II liga | 7 |
| unia-skierniewice | III liga, grupa I | 1 |

Siódmą lokatę Podbeskidzia potwierdza
[historia klubu](https://tspodbeskidzie.pl/klub/historia-1/lata-2024-2026); mistrzostwo III ligi
Unii — [podsumowanie klubu](https://uniaskierniewice.pl/blog/123). To ważne, bo agregatory
potrafią błędnie rozstrzygać remis punktowy Podbeskidzia z KKS Kalisz.

**Dlatego rekord ma `sourceTier`.** Samo `sourceLeaguePlace` cicho kłamie: `1` znaczy „mistrz
II ligi" dla Polonii Bytom i „mistrz I ligi" dla Arki Gdynia. Żaden konsument nie może czytać
miejsca bez uprzedniego porównania szczebli, a odjęcie nagrody musi brać pulę właściwą dla
tamtego szczebla. Mistrz III ligi nie jest finansowym odpowiednikiem mistrza I ligi,
a 16. miejsce w Ekstraklasie nie oznacza 16. w I lidze. **Nie używać `strength` zamiast
finansów.**

## 11. Co zostało odrzucone i dlaczego

**Pula 96,8 mln jako składnik zastępowany.** Doliczała 14% premii dla czterech pucharowiczów,
zakładając, że gra odtwarza także ją. Nie odtwarza: drabinka `(19 − miejsce)/171` jest czystą
funkcją miejsca i odpowiada wyłącznie składnikowi 18,5%. Rozdzielenie 96,8 mln liniowo między
18 klubów odejmowałoby premię europejską także klubom, które jej nie dostały. Poprawna wartość
to **55,13 mln**.

**Krzywa „miejsce → przychód" jako fallback.** Spek przewidywał monotoniczne dopasowanie
przychodu do lokaty. Na szesnastu raportowanych klubach I ligi:

| wielkość | wartość |
| --- | ---: |
| korelacja rang miejsca i przychodu podstawowego | **−0,40** |
| wyjaśniona wariancja | **12,6%** |
| 95% przedział predykcji dla 2. miejsca | **−0,6 … 45,5 mln PLN** |

Przedział zawiera wartości niemożliwe i jest szerszy niż cała liga. Widać to bez statystyki:
mistrz Arka Gdynia miał 14,26 mln przychodu podstawowego, a dwunasta Stal Rzeszów 25,84.
Gdy najlepszy predyktor warunkowy jest nieodróżnialny od bezwarunkowego, uczciwy jest ten
drugi — stąd mediana dla Nieciecze. **Zakaz używania `clubOvr` i `strength` zamiast finansów
zostaje w mocy**: odrzucona została konkretna krzywa, nie zasada, która jej broniła.

**Regulaminowe stawki eliminacji tam, gdzie raport podaje kwotę zaksięgowaną.** UEFA-13/2024
daje 0,175 mln EUR za rundę plus bonus odpadnięcia (0,55 w Q3 LK, 0,75 w play-off LK), co dla
Śląska dawałoby 0,900 mln EUR = 3,87 mln zł. Raport podaje **5,7 mln**, bo okólnik określa
minimum bez redystrybucji pozostałości puli. **Raport bije oszacowanie regulaminowe wszędzie,
gdzie oba istnieją.** Stawki zostają jako materiał pomocniczy dla Legii (0,525 mln EUR),
Jagiellonii (0,525) i Wisły (1,450), gdzie tłumaczą różnice wobec UEFA-FR. Nie doliczać
Jagiellonii premii mistrzowskiej: ta dotyczy mistrza bez awansu do którejkolwiek fazy ligowej.

**Nagłówek „Qualifying bonus" w UEFA-FR jako stawki za rundy.** To bonus 3,170 mln za
kwalifikację do fazy ligowej. Nie liczyć dwa razy.

**Klucz podziału premii 14%.** Pytanie „równo czy według miejsca" jest nieistotne, bo tej
premii w ogóle nie odejmujemy.

**„Pogoń Szczecin i Górnik Zabrze grały w Europie".** Nieprawda; wcześniejsza wersja notatki
zawierała ten błąd i został on propagowany dalej. Test przypina im zero.

## 12. Znane ograniczenia manifestu

Żadne z poniższych nie blokuje kolejnych etapów, ale wszystkie stoją w `note` odpowiednich
rekordów i muszą zostać uwzględnione przy zmianie rocznika.

- **Dzień meczowy Śląska jest resztą** i pochłania zaokrąglenie trzech przybliżeń; zakres 1,1–2,0.
- **Bilety europejskie Wisły Kraków nie są wydzielone**; zakres 5,3–6,6, przyjęto dolną granicę.
- **Podbeskidzie nie ma wydzielonych transferów brutto.**
- **Trzy kluby II/III ligi są oszacowaniami** bez dokumentu.
- **GT-EKS sam sobie przeczy w sumie dnia meczowego**: str. 12 podaje 215 mln, str. 28 podaje
  211 mln za tę samą kategorię i sezon. Manifest nie używa żadnej z tych sum — agregat 28 mln
  stoi we własnym zdaniu i od nich nie zależy.
- **Wskaźniki płac rekordów `estimated` i `official-statement` to założenia projektowe albo
  mediany.** Do dopasowania krzywej płac ze speka §3.4 wolno użyć wyłącznie rekordów `reported`,
  inaczej model uczyłby się z własnych zgadywań.
- **Zera w rekordach konstruowanych nie są brakami zastąpionymi zerem.** Cały rekord jest
  konstruowany, więc `transferRevenuePln = 0` jest jego składnikiem, nie luką.
- **Rocznik finansowy jest starszy od reszty gry.** Finanse z 2024/25, oceny klubów z bieżącego
  snapshotu, puchary z przydziału na 2026/27. Aktualizacja rocznika wymaga ponownej kontroli
  klasyfikacji wpływów, nie tylko podmiany sum. Nie ma potwierdzonej daty kolejnego wydania.

## Załącznik: przebieg badania

Cztery podejścia w dniach 2026-09-07 i 2026-09-08. Zapisane, bo **historia korekt jest częścią
dowodu** — pokazuje, które twierdzenie było kiedy fałszywe i co je obaliło.

| # | Co wniosło | Co obaliło |
| --- | --- | --- |
| 1 | tabele GT obu lig, definicje kategorii, pula 298 mln, stawki UEFA, wypłaty Legii i Jagiellonii | — |
| 2 | udział 18,5%, dowody równego podziału I ligi, sprawozdanie Podbeskidzia, kontrola wizualna UEFA | **96,8 mln**; „Pogoń i Górnik w Europie" |
| 3 | rozpoznanie, że reszty luk nie zamknie badanie sieciowe; kurs i klucz 14% jako nieistotne | dwa równoległe przeszukania sieci nie znalazły **żadnego** nowego źródła |
| 4 | Europa per klub z lokalnych PDF-ów, trzy oszacowania, manifest w kodzie | **krzywa miejsce → przychód**; stawki okólnika dla Śląska |

**Dwie liczby z pierwszego podejścia były błędne i manifest ich nie używa.** Wskaźniki płac
odczytano wtedy z wykresu na GT-EKS str. 19, który ma **dwie kolumny na klub** — trafiono
w kolumnę 2023/2024 dla Lecha (51% zamiast 52%) i Pogoni (52% zamiast 55%). Manifest czyta
karty klubowe, które drukują jedną liczbę za bieżący sezon. Tą samą drogą poszły cztery drobne
różnice w transferach (Pogoń 4,10 → 4,09, Cracovia 14,94 → 14,93, Górnik 12,68 → 12,67,
Korona 6,51 → 6,50): wykres słupkowy odczytany pozycyjnie kontra liczba wydrukowana na karcie.

To jest powód, dla którego ten dokument jest **jeden**, uporządkowany wokół liczb. Poprzedni
układ — dwa pliki, cztery warstwy chronologiczne, obalone twierdzenia oznaczone odsyłaczami —
wymagał od czytelnika przejścia całej historii, żeby dowiedzieć się, co obowiązuje teraz.
Przy dokumencie czytanym „na żądanie, przed zmianą" to jest dokładnie ten tryb awarii, którego
trzeba unikać. Poprzednie brzmienie obu plików jest w historii gita.
