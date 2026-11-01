# Baseline finansowy przed zmianą ekonomii

Pomiar starej ekonomii, zachowany po to, żeby po zmianie było z czym porównać.
Nic tu nie jest przeliczane ponownie — liczby pochodzą wyłącznie z zapisanych dumpów.

## Co zostało uruchomione

- commit kodu: `81d611a6c50e2e7c718e7c949aba2339ea4a8d15`
- `ENGINE_REVISION`: `2026-09-07.1`
- wersja schematu dumpu: `2`
- ziarno bazowe: `0x5eed0001`, `--runs 1000`
- kluby (18): Legia, Lech, Raków, Jagiellonia, Pogoń, Górnik, Cracovia, Widzew, Śląsk, Piast, Radomiak, Korona, Motor, Zagłębie, Wisła K., Wieczysta, GKS, Wisła P.
- przebieg kontrolny (`--finance-control`): alwaysPass
- przebieg aktywny (13 polityk): youngOnly, primeOnly, veteranOnly, youngOnlyBuy, primeOnlyBuy, veteranOnlyBuy, youngBuySellAlways, alwaysTake, alwaysHaggle, stallThenTake, depthFirst, analystEdgeBuy, mixed

## Zachowane artefakty

| plik | bajtów | sha256 |
| --- | ---: | --- |
| `scripts/data/finance-baseline-2026-09-07/control.csv` | 3344461 | `ee250dc96a44229eb5a8b032ceb64be0dba107c6571cd74a9badfdf987151efd` |
| `scripts/data/finance-baseline-2026-09-07/active.csv` | 48519548 | `69e7cc611394c4cb52467735ce8b17c117aec91dbfeff4f378f51ddd501085ec` |
| `scripts/data/finance-baseline-2026-09-07/signings.csv` | 163409967 | `6d7bc82be672039a3af5ee1d7d3c7f66612e0f4274acc0d82fe4099bded1ba05` |

W historii repozytorium leży **wyłącznie `control.csv.gz`** (0,66 MB) — dump, na którym
stoi niezmiennik gotówki ze speka 4 §5.2. Dwa duże (`active.csv.gz` 13,1 MB,
`signings.csv.gz` 23,6 MB) oraz wszystkie rozpakowane CSV są **ignorowane i trzymane
lokalnie**: 37 MB w historii gita jest kosztem trwałym, płaconym przez każdy klon, a te
dwa pliki są w pełni odtwarzalne. Tym samym idą za precedensem raportów Grant Thorntona
(`docs/finance/*.pdf`, 14 MB), które z tego samego powodu nigdy nie weszły do repo.

Hashe w tabeli wyżej to hashe **rozpakowanych** plików — `gzip -dc <plik>.csv.gz | sha256sum`
odtwarza dokładnie te trzy sumy. To one, a nie obecność pliku w historii, są tożsamością
tego pomiaru.

### Jak odtworzyć dwa duże dumpy

Wymagane, jeżeli ktoś pracuje na świeżym klonie i potrzebuje surowych wierszy — na
przykład do `pnpm balance:scan` albo do dopasowania `WOLNY_WAGE_PREMIUM` w kroku 3 speka.

```bash
git checkout 81d611a6c50e2e7c718e7c949aba2339ea4a8d15   # ENGINE_REVISION 2026-09-07.1

pnpm balance -- --runs 1000 --seed 0x5eed0001 --clubs all --policies alwaysPass   --finance-control --dump-raw scripts/data/finance-baseline-2026-09-07/control.csv

pnpm balance -- --runs 1000 --seed 0x5eed0001 --clubs all   --policies youngOnly,primeOnly,veteranOnly,youngOnlyBuy,primeOnlyBuy,veteranOnlyBuy,youngBuySellAlways,alwaysTake,alwaysHaggle,stallThenTake,depthFirst,analystEdgeBuy,mixed   --dump-raw scripts/data/finance-baseline-2026-09-07/active.csv   --dump-signings scripts/data/finance-baseline-2026-09-07/signings.csv

sha256sum scripts/data/finance-baseline-2026-09-07/*.csv   # musi zgodzić się z tabelą wyżej
```

**Odtworzenie wymaga tamtego commita**, bo krok 4 speka zmieni `ENGINE_REVISION`, a wraz
z nim wyniki. Podany SHA jest commitem kodu, na którym pomiar faktycznie leciał, i nie
zmienia się przy późniejszych porządkach w gałęzi. Jeżeli którakolwiek suma się nie zgadza,
**dump nie jest tym baseline'em** i nie wolno go użyć do porównania.

Karier: kontrolnych 18000, aktywnych 234000.
Obserwacji podpisań: 1356714.

## Dwa niezmienniki punktacji

Jednostka obu to **mln EUR**. Iloczyn to wkład składnika do dziedzictwa przy
dzisiejszych stałych `LEGACY_KASA = 5` i `LEGACY_WARTOSC_KADRY = 2`.

| wielkość | przebieg | mediana | × stała |
| --- | --- | ---: | ---: |
| `kasa` | kontrolny | 3.31 | 16.55 |
| `kasa` | aktywny | 2.49 | 12.45 |
| `wartoscKadryMoj` | kontrolny | 0.00 | 0.00 |
| `wartoscKadryMoj` | aktywny | 1.99 | 3.99 |

Zero w wierszu kontrolnym nie jest brakiem danych: przebieg kontrolny gra wyłącznie
`alwaysPass`, więc nie podpisuje nikogo i `wartoscKadryMoj` z definicji wynosi zero.
Kontrolny wiersz `kasa` jest tym, po co ten przebieg istnieje — pokazuje, ile klub ma
na koniec, kiedy nie zarobił ani na pucharze, ani na sprzedaży.

## Mediany per klub

| klub | poziom | `kasa` kontr. | `kasa` akt. | `wartoscKadryMoj` kontr. | `wartoscKadryMoj` akt. |
| --- | --- | ---: | ---: | ---: | ---: |
| Legia | latwy | 4.84 | 4.54 | 0.00 | 2.95 |
| Lech | latwy | -3.39 | 5.30 | 0.00 | 2.95 |
| Raków | latwy | 5.99 | 6.75 | 0.00 | 3.18 |
| Jagiellonia | latwy | 8.02 | 4.70 | 0.00 | 2.66 |
| Pogoń | sredni | 6.88 | 4.60 | 0.00 | 2.59 |
| Górnik | sredni | 4.50 | 5.00 | 0.00 | 2.68 |
| Cracovia | sredni | 1.25 | 1.40 | 0.00 | 1.95 |
| Widzew | sredni | 0.77 | 3.84 | 0.00 | 2.35 |
| Śląsk | sredni | 3.09 | 1.97 | 0.00 | 1.62 |
| Piast | sredni | 2.99 | 1.85 | 0.00 | 1.57 |
| Radomiak | trudny | 2.19 | 1.48 | 0.00 | 1.35 |
| Korona | trudny | 4.05 | 2.38 | 0.00 | 1.95 |
| Motor | trudny | 4.38 | 2.21 | 0.00 | 1.82 |
| Zagłębie | trudny | 1.79 | 0.94 | 0.00 | 1.51 |
| Wisła K. | trudny | 4.03 | 2.09 | 0.00 | 1.81 |
| Wieczysta | trudny | 2.83 | 1.50 | 0.00 | 1.51 |
| GKS | trudny | 3.25 | 2.00 | 0.00 | 1.86 |
| Wisła P. | trudny | 1.73 | 0.77 | 0.00 | 1.48 |

## Ceny i płace podpisanych, per typ oferty

Z surowych obserwacji, nie z ilorazu sum. Mediana `KUPNO` obejmuje cały przekrój
wieku, pozycji i OVR — **nie jest** odpowiednikiem konkretnego wolnego weterana i nie
wolno jej użyć jako referencji do dopasowania nadpłaty. Taką referencję o ustalonym
OVR, wieku i pozycji wyznacza dopiero następny etap.

| typ | n | cena | płaca | płaca bazowa | wiek | OVR |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| KUPNO | 896782 | 0.32 | 0.134 | 0.134 | 20.0 | 64.0 |
| PANIC | 139335 | 0.62 | 0.106 | 0.106 | 20.0 | 62.0 |
| WOLNY | 320597 | 0.00 | 0.434 | 0.434 | 32.0 | 74.0 |
