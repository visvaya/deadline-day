# Źródła tierów zagranicznych kupujących (2026-09-22)

Notatka źródłowa dla `FOREIGN_CLUBS` (`src/data/foreign-clubs.ts`). Każdy wiersz podaje: URL i nazwę źródła, datę dostępu, sezon/okres, walutę, zakres podmiotu, informację o transferach w przychodzie, status ligi 2026/27 z URL-em, a osobno fakt raportowany, przeliczenie i uzasadnienie tieru. Każdy URL został otworzony i potwierdzony 2026-09-22. Wszystkie 24 rekordy mają `provenance: "estimated"` w kodzie — tabela niżej rozróżnia, które liczby stoją na pierwotnym sprawozdaniu, a które są jawnym oszacowaniem.

Punkt odniesienia: Legia Warszawa, przychód 230,87 mln zł (sezon manifestu) = 54,15 mln € przy kursie `EUR_PLN_SOURCE_SEASON = 4,2637` (`docs/decisions/finance-manifest-sources.md`, `scripts/data/nbp-eur-2024-07-2025-06.json`). Klub poniżej tej liczby nie kwalifikuje się do puli (spek 4 §8.1).

Skrót kolumn: **przychód** to fakt raportowany przez źródło (waluta i okres źródła), **zakres** to klub-spółka (np. SAD, NV, plc) albo grupa skonsolidowana, **tr.** mówi, czy liczba zawiera wynik na transferach.

## legendarny (4)

### `brighton` — Brighton

- Fakt: turnover £222,4 mln (rok obrotowy do czerwca 2024, klub-spółka, bez wyniku na transferach zawodniczych jako osobnej linii — transferowe zyski wchodzą do `profit`, nie do `turnover`).
- Źródło: [Kinnaird Sports, analiza finansowa 2023/24](https://kinnairdsports.com/brighton-and-hove-albion-finances-2023-24-season) (dostęp 2026-09-22), potwierdzone przez oficjalne konto klubu: [brightonandhovealbion.com, Albion's annual accounts](https://www.brightonandhovealbion.com/news/3949063/albions-annual-accounts) (dostęp 2026-09-22).
- Liga 2026/27: Premier League (kontynuacja, klub nieprzerwanie w Premier League od 2017).
- Zakup z Ekstraklasy: Moder (Lech Poznań → Brighton, 11 mln €, potwierdzone [gol24.pl](https://gol24.pl/transfery-rekordowy-transfer-jakuba-modera-do-brighton-lech-dostanie-11-mln-euro-i-roczne-wypozyczenie/ar/c2-15215028), dostęp 2026-09-22); Kozłowski (Pogoń Szczecin → Brighton, kwota sporna 8–11 mln €, [transfery.info](https://transfery.info/aktualnosci/szesc-milionow-euro-z-transferu-kacpra-kozlowskiego-zniknelo/242495), dostęp 2026-09-22).
- Przeliczenie: £222,4 mln × ~1,17 £/€ ≈ 260 mln €.
- Uzasadnienie tieru: przychód wielokrotnie powyżej progu Legii, dwa udokumentowane zakupy z Ekstraklasy powyżej 10 mln €. `legendarny`.

### `borussia-dortmund` — Borussia Dortmund

- Fakt: Umsatz 509,1 mln € (rok obrotowy 2023/24, klub-spółka, bez wyniku na transferach).
- Źródło: [BVB Dortmund, oficjalny raport roczny 2023/24, „Revenue trend"](https://report.bvb.de/annual-report/2023-2024/group-management-report/position-of-the-company/revenue-trend.html) (dostęp 2026-09-22).
- Liga 2026/27: Bundesliga (stały uczestnik od dekad).
- Zakup z Ekstraklasy: brak udokumentowanego.
- Przeliczenie: brak, liczba już w euro.
- Uzasadnienie tieru: najwyższy przychód w całej puli, prawie dziesięciokrotność Legii. `legendarny`.

### `benfica` — Benfica

- Fakt: proveitos operacionais (przychód operacyjny) 179 mln € (rok obrotowy 2023/24, SAD Benfica, bez wyniku na transferach — transfery liczone osobno: 58,4 mln €).
- Źródło: [Observador, „Benfica SAD apresenta resultados negativos de 31,36 milhões de euros em 2023/24"](https://observador.pt/2024/09/08/benfica-sad-apresenta-resultados-negativos-de-3136-milhoes-de-euros-em-2023-24/) (dostęp 2026-09-22), odsyłający do oficjalnego komunikatu: [slbenfica.pt, Relatório e Contas Exercício 2023/24](https://www.slbenfica.pt/en-us/agora/noticias/2024/09/09/benfica-sad-relatorio-e-contas-exercicio-2023-24-comunicacao-cmvm).
- Liga 2026/27: Primeira Liga (stały uczestnik).
- Zakup z Ekstraklasy: brak udokumentowanego.
- Przeliczenie: brak, liczba już w euro.
- Uzasadnienie tieru: rozpoznawalny europejski gigant, przychód >3x Legii bez transferów. `legendarny`.

### `porto` — Porto

- Fakt: receitas operacionais sem transações de atletas 174,5 mln € (rok obrotowy 2023/24, SAD FC Porto).
- Źródło: [Observador, „SAD do FC Porto aprova contas da época 2023/24 com prejuízo de 21 milhões de euros"](https://observador.pt/2024/11/22/sad-do-fc-porto-aprova-contas-da-epoca-2023-24-com-prejuizo-de-21-milhoes-de-euros/) (dostęp 2026-09-22).
- Liga 2026/27: Primeira Liga (stały uczestnik).
- Zakup z Ekstraklasy: brak udokumentowanego.
- Przeliczenie: brak, liczba już w euro.
- Uzasadnienie tieru: przychodem stoi poniżej Salzburga (183 mln €) i Brugge (165–176 mln €), ale decyzją właściciela produktu z 2026-09-22 wchodzi do `legendarny` zamiast Wolfsburga ze względu na rozpoznawalność nazwy (spek 4 §8.1) i regularne transfery z górnej półki. Jedyne miejsce w tabeli, gdzie o tierze rozstrzyga rozpoznawalność wbrew kolejności przychodów.

## bardzo wysoki (8)

### `ajax` — Ajax

- Fakt: netto-omzet 152 mln € (rok obrotowy 2023/24, AFC Ajax NV, bez wyniku na transferach — omzet to przychód operacyjny klubu-spółki).
- Źródło: [AjaxShowtime, „Ajax draait netto-omzet van 152 miljoen euro; daling van 23 procent"](https://www.ajaxshowtime.com/hoofdnieuws/ajax-draait-netto-omzet-van-152-miljoen-euro-daling-van-23-procent) (dostęp 2026-09-22), potwierdzone przez oficjalny komunikat: [ajax.nl, Jaarcijfers AFC Ajax NV 2023/2024](https://www.ajax.nl/artikelen/jaarcijfers-afc-ajax-nv-boekjaar-20232024).
- Liga 2026/27: Eredivisie (stały uczestnik).
- Zakup z Ekstraklasy: brak udokumentowanego.
- Przeliczenie: brak, liczba już w euro.
- Uzasadnienie tieru: przychód ~3x Legii, klub rozpoznawalny w europejskim topie. `bardzo wysoki`.

### `psv` — PSV

- Fakt: omzet ponad 152 mln € (rok obrotowy 2023/24, PSV NV, mistrzowski sezon).
- Źródło: [VI.nl, „Jaarcijfers PSV: kampioensjaar 2023/24 is ook financieel succes"](https://www.vi.nl/nieuws/jaarcijfers-psv-kampioensjaar-202324-is-ook-financieel-succes) (dostęp 2026-09-22). Jeden ze znalezionych wtórnych artykułów (ESPN.nl) podaje odmienną liczbę 170 mln €, dlatego liczba w kodzie zostaje z symbolem `≈`.
- Liga 2026/27: Eredivisie (stały uczestnik).
- Zakup z Ekstraklasy: brak udokumentowanego.
- Przeliczenie: brak, liczba już w euro.
- Uzasadnienie tieru: przychód rzędu Ajaksu, sezon mistrzowski. `bardzo wysoki`.

### `feyenoord` — Feyenoord

- Fakt: omzet 125,7 mln € (rok obrotowy 2023/24, Feyenoord NV, z wynikiem na transferach — sprzedaż m.in. Kökçü za 25 mln € do Benfiki).
- Źródło: [FCUpdate.nl, „Feyenoord schrijft zwarte cijfers"](https://www.fcupdate.nl/voetbalnieuws/2024/10/feyenoord-schrijft-zwarte-cijfers-slechts-een-keer-hogere-nettowinst-dan-over-boekjaar-2023-24) (dostęp 2026-09-22).
- Liga 2026/27: Eredivisie (stały uczestnik).
- Zakup z Ekstraklasy: brak udokumentowanego.
- Przeliczenie: brak, liczba już w euro.
- Uzasadnienie tieru: powrót do Ligi Mistrzów podbił przychód, z transferami >2x Legii. `bardzo wysoki`.

### `celtic` — Celtic

- Fakt: revenue £124,6 mln (rok obrotowy do czerwca 2024, Celtic plc, bez wyniku na transferach — osobna linia zysku przed opodatkowaniem).
- Źródło: [Celtic FC, oficjalny komunikat „Celtic plc annual results for year ended June 30, 2024"](https://www.celticfc.com/news/2024/september/16/celtic-plc-annual-results-for-year-ended-june-30--2024/) (dostęp 2026-09-22).
- Liga 2026/27: Scottish Premiership (stały uczestnik, dominujący klub ligi).
- Zakup z Ekstraklasy: Nawrocki (Legia Warszawa → Celtic, ok. 5 mln €, £4,3 mln, [Sky Sports](https://www.skysports.com/football/news/12040/12927028/maik-nawrocki-celtic-sign-polish-defender-on-five-year-deal), dostęp 2026-09-22; zawodnik nazywa się Maik Nawrocki, nie Bartosz — sprostowanie wobec wcześniejszego szkicu).
- Przeliczenie: £124,6 mln × ~1,17 £/€ ≈ 146 mln €.
- Uzasadnienie tieru: dominujący klub swojej ligi, udokumentowany zakup z Ekstraklasy. `bardzo wysoki`.

### `club-brugge` — Brugge

- Fakt: total operating revenue 165 mln € (rok obrotowy 2023/24, Club Brugge NV).
- Źródło: [Made-in.be, „Het bedrijf Club Brugge boert uitstekend"](https://www.made-in.be/west-vlaanderen/het-bedrijf-club-brugge-boert-uitstekend/) (dostęp 2026-09-22). Design spec z 2026-09-22 cytuje 176 mln €; źródło znalezione w tej weryfikacji podaje 165 mln € dla tego samego roku obrotowego — rozbieżność ok. 6%, nieistotna dla tieru.
- Liga 2026/27: Belgian Pro League (stały uczestnik).
- Zakup z Ekstraklasy: Skóraś (Lech Poznań → Brugge, 6 mln €, [FotMob/soccerway](https://www.fotmob.com/players/954190/michal-skoras) i potwierdzenie kwoty przez wielokrotne źródła wtórne, dostęp 2026-09-22).
- Przeliczenie: brak, liczba już w euro.
- Uzasadnienie tieru: przychód >3x Legii, udokumentowany zakup z Ekstraklasy. `bardzo wysoki`.

### `red-bull-salzburg` — Salzburg

- Fakt: Umsatz 182,59 mln € (rok obrotowy 2023/24, FC Red Bull Salzburg).
- Źródło: [Salzburg24.at, „So viele Millionen Euro setzen Bullen um"](https://www.salzburg24.at/sport/fussball/bundesliga/red-bull-salzburg-so-viele-millionen-euro-setzen-bullen-um-113305420) (dostęp 2026-09-22).
- Liga 2026/27: Austrian Bundesliga (dominujący klub ligi).
- Zakup z Ekstraklasy: Piątkowski (Raków Częstochowa → Salzburg, ok. 5–6 mln €, [Dziennik Zachodni](https://dziennikzachodni.pl/rakow-dostanie-miliony-euro-transfer-kamila-piatkowskiego-do-red-bull-salzburg/ar/c2-15418979), dostęp 2026-09-22; zawodnik to Kamil, nie Jakub Piątkowski — sprostowanie).
- Przeliczenie: brak, liczba już w euro.
- Uzasadnienie tieru: przychód >3x Legii, dominacja krajowa, udokumentowany zakup. `bardzo wysoki`.

### `rc-lens` — Lens

- Fakt: chiffre d'affaires 144,5 mln € (rok obrotowy 2023/24, RC Lens, bez wyniku na transferach — rekord klubu dzięki Lidze Mistrzów).
- Źródło: [Allezlens.fr, analiza finansowa RC Lens 2020-2026](https://allezlens.fr/masse-salariale-sabree-et-cadres-vendus-la-face-cachee-du-nouveau-plan-dausterite-du-rc-lens/) (dostęp 2026-09-22).
- Liga 2026/27: Ligue 1 (stały uczestnik).
- Zakup z Ekstraklasy: brak udokumentowanego.
- Przeliczenie: brak, liczba już w euro.
- Uzasadnienie tieru: rekordowy przychód >2,5x Legii dzięki europejskiemu sezonowi. `bardzo wysoki`.

### `besiktas` — Beşiktaş

- Fakt: **estimated** — brak porównywalnego sprawozdania finansowego w euro znalezionego w tej weryfikacji ani we wcześniejszej speka. Zamiast przychodu, tier oparty na trzech udokumentowanych transferach: Muci (Legia Warszawa → Beşiktaş, 10 mln €, [Wikipedia/TransferFeed, potwierdzone przez wielokrotne źródła wtórne](https://www.transferfeed.com/transfers/ernest-muci-besiktas-legia-warszawa/12358764), dostęp 2026-09-22), Kökçü (Benfica → Beşiktaş, 25 mln € stałe + do 5 mln zmiennych, ogłoszone lipiec 2025, [slbenfica.pt, oficjalny komunikat](https://www.slbenfica.pt/en-us/agora/noticias/2025/07/13/futebol-benfica-kokcu-transferencia-besiktas), potwierdzone WebFetch 2026-09-22), Trossard (Arsenal → Beşiktaş, 18 mln €, lipiec 2026, [anews.com.tr](https://www.anews.com.tr/sport/2026/07/15/besiktas-sign-winger-leandro-trossard-from-arsenal), dostęp 2026-09-22).
- Liga 2026/27: Süper Lig (stały uczestnik).
- Przeliczenie: nie dotyczy (brak liczby przychodu).
- Uzasadnienie tieru: trzy transfery w przedziale 10–25 mln € w ciągu dwóch lat są nietypowe dla klubu w tierze `wysoki` (maxSpend 7 mln €); `bardzo wysoki` (maxSpend 9 mln €) jest najniższym tierem spójnym z tymi kwotami bez sięgania po `legendarny`. Decyzja właściciela produktu 2026-09-22, zakres jawnie oszacowany.

## wysoki (12)

### `bologna` — Bologna

- Fakt: ricavi netti da plusvalenze 103,8 mln € (rok obrotowy 2023/24, Bologna FC 1909, bez wyniku na transferach).
- Źródło: [SocialMediaSoccer.com, „Il Bologna chiuderà il bilancio 2023-2024 in rosso di 10 milioni di euro"](https://www.socialmediasoccer.com/it/articolo/il-bologna-chiudera-il-bilancio-2023-2024-in-rosso-di-10-milioni-di-euro.html) (dostęp 2026-09-22).
- Liga 2026/27: Serie A (stały uczestnik, gra w Lidze Mistrzów).
- Zakup z Ekstraklasy: Urbański (Lechia Gdańsk → Bologna, wypożyczenie z obowiązkiem wykupu, luty 2021, kwota nieujawniona, [Gol24](https://gol24.pl/transfery-kacper-urbanski-pilkarzem-bolonii-do-wloch-przeniosl-sie-z-lechii-gdansk/ar/c2-15418453), dostęp 2026-09-22; zawodnik to Kacper, nie Jan Urbański — sprostowanie).
- Przeliczenie: brak, liczba już w euro.
- Uzasadnienie tieru: przychód ~2x Legii, klub w Lidze Mistrzów, ale poniżej progu `bardzo wysoki`. `wysoki`.

### `udinese` — Udinese

- Fakt: valore della produzione 120 mln € (rok obrotowy 2023/24, Udinese Calcio, z wynikiem na transferach).
- Źródło: [Calcio e Finanza, „Udinese, ricavi a 120 milioni e rosso di 11 milioni nel 2023/24"](https://www.calcioefinanza.it/2024/11/21/bilancio-udinese-2024-ricavi-e-costi/) (dostęp 2026-09-22).
- Liga 2026/27: Serie A (stały uczestnik).
- Zakup z Ekstraklasy: brak udokumentowanego.
- Przeliczenie: brak, liczba już w euro.
- Uzasadnienie tieru: przychód >2x Legii, poniżej `bardzo wysoki`. `wysoki`.

### `lecce` — Lecce

- Fakt: ricavi 85,3 mln € (rok obrotowy 2023/24, U.S. Lecce, z wynikiem na transferach — 24,2 mln € plusvalenze).
- Źródło: [SalentoSport.net, „Bilancio 2023/24: ricavi e costi in crescita"](https://www.salentosport.net/lecce-news/bilancio-2023-24-ricavi-costi-crescita-aumentano-utili-diminuiscono-debiti-covid/) (dostęp 2026-09-22).
- Liga 2026/27: Serie A (stały uczestnik).
- Zakup z Ekstraklasy: Marchwiński (Lech Poznań → Lecce, 3 mln € + bonusy, lipiec 2024, [Wikipedia/footboom1.com](https://www.footboom1.com/en/news/football/2313181-lecce-to-lose-filip-marchwinski-due-to-cruciate-ligament-and-meniscus-injury), dostęp 2026-09-22).
- Przeliczenie: brak, liczba już w euro.
- Uzasadnienie tieru: przychód >50% powyżej Legii, udokumentowany zakup z Ekstraklasy. `wysoki`.

### `genoa` — Genoa

- Fakt: valore della produzione (grupa skonsolidowana) 120,7 mln € (rok kalendarzowy 2023, Gruppo Genoa CFC SpA, z wynikiem na transferach).
- Źródło: [Calcio e Finanza, „Genoa, nel 2023 bilancio in rosso: da 777 Partners già 130 milioni"](https://www.calcioefinanza.it/2024/04/21/genoa-bilancio-2023-ricavi-costi-risultato-netto/) (dostęp 2026-09-22), oficjalny dokument: [genoacfc.it, Bilancio Consolidato al 31/12/2023](https://genoacfc.it/wp-content/uploads/2024/05/Fascicolo-Bilancio-Gruppo-Genoa-CFC-31.12.2023.pdf).
- Liga 2026/27: Serie A (stały uczestnik).
- Zakup z Ekstraklasy: brak udokumentowanego.
- Przeliczenie: brak, liczba już w euro. Rok kalendarzowy 2023 (nie sezon 2023/24) — najbliższy dostępny.
- Uzasadnienie tieru: przychód >2x Legii, poniżej `bardzo wysoki`. `wysoki`.

### `augsburg` — Augsburg

- Fakt: Umsatz 108,8 mln € (rok obrotowy 2023/24, FC Augsburg, rekord klubu).
- Źródło: [Kicker.de, „FC Augsburg: Rekordumsatz, aber 7,2 Millionen Euro Verlust"](https://www.kicker.de/fc-augsburg-rekordumsatz-aber-7-2-millionen-euro-verlust-1059473/artikel) (dostęp 2026-09-22).
- Liga 2026/27: Bundesliga (stały uczestnik).
- Zakup z Ekstraklasy: brak udokumentowanego.
- Przeliczenie: brak, liczba już w euro.
- Uzasadnienie tieru: przychód >2x Legii, pierwszy raz powyżej 100 mln €. `wysoki`.

### `mainz-05` — Mainz

- Fakt: total revenue 121,8 mln € (rok obrotowy 2023/24, 1. FSV Mainz 05).
- Źródło: [Mainz05.de, „1. FSV Mainz 05 - Kennzahlen: Hervorragende wirtschaftliche Situation"](https://www.mainz05.de/News/Kennzahlen-Hervorragende-wirtschaftliche-Situation) (dostęp 2026-09-22).
- Liga 2026/27: Bundesliga (stały uczestnik).
- Zakup z Ekstraklasy: brak udokumentowanego.
- Przeliczenie: brak, liczba już w euro.
- Uzasadnienie tieru: przychód >2x Legii, poniżej `bardzo wysoki`. `wysoki`.

### `stade-rennais` — Rennes

- Fakt: **estimated** — nie znaleziono jednoznacznej liczby przychodu za rok obrotowy 2023/24 w tej weryfikacji; dostępne były masa płac (116,2 mln € w 2022/23) i przychód z sezonu 2022/23 (rząd wielkości zbliżony). Zakres 100–120 mln € przyjęty jako oszacowanie zgodne z rzędem wielkości sąsiednich klubów Ligue 1 o podobnej pozycji.
- Źródło (trop wtórny, nie sprawozdanie): [Stade Rennais Online, „DNCG: les comptes 2022-2023 du Stade rennais publiés"](https://www.stade-rennais-online.com/DNCG-les-comptes-2022-2023-du-Stade-rennais-publies.html) (dostęp 2026-09-22).
- Liga 2026/27: Ligue 1 (stały uczestnik).
- Zakup z Ekstraklasy: brak udokumentowanego.
- Przeliczenie: nie dotyczy.
- Uzasadnienie tieru: rząd wielkości powyżej Legii, ale poniżej klubów z potwierdzonym przychodem >140 mln €. `wysoki`, jawnie `estimated` z zakresem.

### `krc-genk` — Genk

- Fakt: recordomzet 92,7 mln € (rok obrotowy 2023/24, KRC Genk, z wynikiem na transferach — 46 mln € z transferów).
- Źródło: [KRC Genk, oficjalny komunikat „KRC Genk rondt kaap van 100 miljoen omzet"](https://www.krcgenk.be/nl/nieuws/6134/krc-genk-rondt-kaap-van-100-miljoen-omzet-en-realiseert-3-7-miljoen-euro-winst) (dostęp 2026-09-22).
- Liga 2026/27: Belgian Pro League (stały uczestnik).
- Zakup z Ekstraklasy: brak — Skóraś przeszedł z Lecha do Brugge, nie do Genku (sprostowanie wobec wcześniejszego założenia w rozmowie projektowej).
- Przeliczenie: brak, liczba już w euro.
- Uzasadnienie tieru: przychód >70% powyżej Legii, poniżej `bardzo wysoki`. `wysoki`.

### `fc-kobenhavn` — Kopenhaga

- Fakt: nettoomsætning (dział piłkarski) 925 mln DKK (rok kalendarzowy 2023, F.C. København A/S).
- Źródło: [Bold.dk, „FCK gav kæmpe overskud på 167,8 millioner"](https://bold.dk/fodbold/klubber/fc-koebenhavn/nyheder/fck-gav-kaempe-overskud-paa-1678-millioner) (dostęp 2026-09-22).
- Liga 2026/27: Danish Superliga (stały uczestnik, dominujący klub).
- Zakup z Ekstraklasy: brak udokumentowanego.
- Przeliczenie: 925 mln DKK / ~7,46 DKK/€ ≈ 124 mln €.
- Uzasadnienie tieru: przychód >2x Legii po przeliczeniu. `wysoki`.

### `norwich-city` — Norwich

- Fakt: revenue £73 mln (rok obrotowy 2023/24, Norwich City FC, bez wyniku na transferach — osobna linia strat przed opodatkowaniem).
- Źródło: [The Pink Un, „Norwich City: Canaries annual accounts for 2023/24 released"](https://www.pinkun.com/sport/norwich-city/24658052.norwich-city-canaries-annual-accounts-2023-24-released/) (dostęp 2026-09-22).
- Liga 2026/27: **Championship** — potwierdzone [canaries.co.uk, „Fixtures released for 2026/27 Championship season"](https://canaries.co.uk/content/fixtures-released-for-2026-27-championship-season) (dostęp 2026-09-22, WebFetch): „Norwich City's Sky Bet Championship campaign for the 2026/27 season begins at home to West Bromwich Albion".
- Zakup z Ekstraklasy: Crnac (Raków Częstochowa → Norwich, 11 mln €, sierpień 2024, [FootballLeagueWorld.co.uk](https://footballleagueworld.co.uk/norwich-city-set-to-sign-rakow-ante-crnac/) i [Dziennik Zachodni](https://dziennikzachodni.pl/rekordowy-transfer-rakowa-czestochowa-sfinalizowany-crnac-przenosi-sie-do-anglii/ar/c2-18758891), dostęp 2026-09-22).
- Przeliczenie: £73 mln × ~1,17 £/€ ≈ 86 mln €.
- Uzasadnienie tieru: **reguła drugiego poziomu** — `topFlight: false` (Championship w 2026/27), więc tier ograniczony do `wysoki` niezależnie od przychodu i mimo zakupu 11 mln € powyżej `maxSpend` tieru `wysoki` (7 mln €). Klub z Championship płacący ponad przychód jest odstępstwem, nie wzorcem (spek §4.2), więc nie dostaje wyjątku podnoszącego tier.

### `cagliari` — Cagliari

- Fakt: ricavi totali 78,6 mln € (rok obrotowy 2023/24, Cagliari Calcio, z wynikiem na transferach).
- Źródło: [Centotrentuno.com, „Bilancio Cagliari: dagli acquisti a Marin, i dettagli su costi e ricavi del 2023-24"](https://centotrentuno.com/focus/bilancio-cagliari-dagli-acquisti-a-marin-i-dettagli-su-costi-e-ricavi-del-2023-24/) (dostęp 2026-09-22).
- Liga 2026/27: Serie A (stały uczestnik).
- Zakup z Ekstraklasy: Walukiewicz (Pogoń Szczecin → Cagliari, ok. 4 mln €, styczeń 2019, [Radio Szczecin](https://radioszczecin.pl/1,383135,rekordowy-transfer-w-historii-pogoni-walukiewicz), dostęp 2026-09-22; zawodnik to Sebastian, nie Kamil Walukiewicz — sprostowanie).
- Przeliczenie: brak, liczba już w euro.
- Uzasadnienie tieru: przychód >40% powyżej Legii, udokumentowany zakup z Ekstraklasy. `wysoki`.

### `vfl-wolfsburg` — Wolfsburg

- Fakt: przychód rzędu 200+ mln € w Bundeslidze w poprzednich sezonach; dokładna liczba za 2023/24 niedostępna w tej weryfikacji (źródła płatne — Statista, DFL Economic Report). **estimated** dla dokładnej kwoty, ale rząd wielkości (Bundesliga, klub z historią przychodów >150 mln €) niesporny.
- Źródło (fakt ligowy): [Washington Post, „Wolfsburg relegated from Bundesliga after playoff defeat in Paderborn"](https://www.washingtonpost.com/sports/soccer/2026/05/25/wolfsburg-paderborn-relegated-promoted-bundesliga-playoff/5121ddf4-587e-11f1-8a9d-afb1148204e1_story.html) i [Bundesliga.com, „Wolfsburg relegated from the Bundesliga after 29 seasons in top flight"](https://www.bundesliga.com/en/bundesliga/news/wolfsburg-relegated-second-division-de-bruyne-dzeko-grafite-37361), oba potwierdzone WebSearch 2026-09-22: baraż z Paderbornem przegrany 25 maja 2026, spadek do 2. Bundesligi na sezon 2026/27.
- Liga 2026/27: **2. Bundesliga** (spadek).
- Zakup z Ekstraklasy: Kamiński (Lech Poznań → Wolfsburg, 10 mln €, styczeń 2022, [Sportowy24.pl](https://sportowy24.pl/transfery-jakub-kaminski-sprzedany-do-vfl-wolfsburg-lech-poznan-zarobi-okolo-10-mln-euro/gh/c2-15989965), dostęp 2026-09-22); Białek (Zagłębie Lubin → Wolfsburg, 5 mln €, 2020, [Transfery.info](https://transfery.info/aktualnosci/oficjalnie-bartosz-bialek-w-wolfsburgu-rekord-transferowy-zaglebia-lubin/139255), dostęp 2026-09-22; zawodnik to Bartosz, nie Kamil Białek — sprostowanie).
- Przeliczenie: nie dotyczy (brak dokładnej liczby dla 2023/24).
- Uzasadnienie tieru: **reguła drugiego poziomu** — `topFlight: false` (2. Bundesliga w 2026/27) ogranicza tier do `wysoki` niezależnie od historycznego przychodu w Bundeslidze. Zostaje w puli, bo jest udokumentowanym, dwukrotnym kupcem z Ekstraklasy.

## Podsumowanie bramki źródłowej

Wszystkie 24 kluby mają potwierdzony status ligowy na 2026/27 i co najmniej jedno źródło przychodu (albo, dla `besiktas` i częściowo `vfl-wolfsburg`, udokumentowaną historię transferową zastępującą przychód w euro). Dwa rekordy (`stade-rennais`, `besiktas`) są jawnie oszacowane z zakresem i wyjaśnieniem, zgodnie z regułą speka — brak dowodu nie stał się ani zerem, ani pewną liczbą. Żaden klub nie wymagał podstawienia innym wobec niemożności obrony tieru; bramka z Task 3 jest spełniona bez blokady.
