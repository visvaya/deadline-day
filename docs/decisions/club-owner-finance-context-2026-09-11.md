# Kontekst właścicielsko-finansowy klubów 2026/27

**Stan źródeł: 2026-09-11.** Dokument jest datowanym zapleczem badawczym dla
`docs/decisions/club-character-convention.md` i dopasowania budżetu pierwszego okna. Nie jest
manifestem finansowym i nie zastępuje `src/data/club-finance-profiles.ts`.

## Werdykt

Model właścicielski jest wartościowym kontekstem redakcyjnym, ale sam w sobie nie jest dowodem na
dodatkowe pieniądze dostępne graczowi. W grze istnieje tylko jeden jawny wyjątek: udokumentowane
wsparcie sponsora albo właściciela może ustawić **dolną granicę budżetu pierwszego okna**. Nie jest
corocznym przelewem, nie dodaje się do pozostałych składników budżetu i nie działa w epilogu.

Dlatego docelowa nazwa mechaniki to `backerSupportFloor`, nie `ownerSupportFloor`. Obejmuje zarówno
właściciela, jak i głównego sponsora, a jednocześnie nie sugeruje stałego finansowania. Dla klubów
miejskich, ratowanych dokapitalizowaniem albo wspieranych zwykłą umową sponsorską domyślnym wynikiem
jest brak osobnej podłogi: te pieniądze służą płynności albo już znajdują się w przychodzie.

## Jak czytać tabelę

- **Stan realny** opisuje właściciela i najnowszy wiarygodny kontekst dostępny 2026-09-11.
- **Finanse gry** pozostają historycznym, znormalizowanym profilem ze źródeł 2024/25 lub 2025.
  Nie wolno nazywać ich bieżącym budżetem realnego klubu.
- **Klasa wsparcia** jest wejściem do pomiaru, nie gotową stałą. `strong` i `active` skanują
  percentyle; `restrained` oznacza świadomy brak podłogi; `none` oznacza brak wystarczającego dowodu,
  a nie brak zamożnego właściciela.
- Dokapitalizowanie przeznaczone na spłatę zobowiązań lub płynność nie jest automatycznie budżetem
  transferowym. Przejęcie klubu także nie dowodzi, że nowy właściciel finansuje pierwsze okno.

## Osiemnaście klubów

| Klub | Obecny model i charakter finansowy | Klasa do pomiaru | Konsekwencja dla `character` |
| --- | --- | --- | --- |
| Legia Warszawa | Dariusz Mioduski ma 100% akcji. Klub jest prywatnie kontrolowany, lecz w grze wyróżnia go przede wszystkim najwyższy przychód powtarzalny, nie osobny grant właściciela.[^legia] | `none` | Opisać skalę przychodu i relację kadry do zaplecza finansowego; nazwisko właściciela nie wnosi nowego dylematu. |
| Lech Poznań | Kontrola pozostaje rodzinna: Piotr Rutkowski ma ok. 66,67%, Maja Rutkowska ok. 33,33% akcji.[^lech] | `none` | Najmocniejsza kadra, wysoki przychód i zdrowy bilans są ważniejsze niż sam model rodzinny. |
| Raków Częstochowa | Michał Świerczewski pozostaje jedynym właścicielem. To długofalowy projekt właścicielski, ale brak aktualnego, kwotowego dowodu na osobną pulę pierwszego okna.[^rakow] | `none` | Można mówić o projekcie właściciela, lecz bez obietnicy dodatkowej gotówki. |
| Jagiellonia Białystok | Klub ma rozproszony akcjonariat lokalnych osób i spółek, a nie jednego patrona.[^jagiellonia] | `none` | Puchary, sport i zdrowy bilans są czytelniejszym charakterem niż długa lista akcjonariuszy. |
| Pogoń Szczecin | Alex Haditaghi przejął pakiet większościowy w marcu 2025 w transakcji przedstawionej jako ratunek przed niewypłacalnością.[^pogon] Ratowanie zobowiązań nie dowodzi wolnej puli transferowej. | `none` | Wolno wspomnieć właścicielski reset po kryzysie, ale nie „bogatego właściciela” jako przyszły przelew. |
| Górnik Zabrze | Od maja 2026 LP Holding Lukasa Podolskiego posiada 86% akcji.[^gornik] Sama świeża prywatyzacja nie określa jeszcze skali finansowania transferów. | `none` | „Nowa prywatna era” jest aktualną ciekawostką; pieniądze muszą nadal wynikać z liczb gry. |
| Cracovia | Robert Platek jest większościowym akcjonariuszem, Elżbieta Filipiak mniejszościowym, a Comarch pozostał sponsorem.[^cracovia] | `none` | Można nazwać zmianę właścicielską, ale bez dopisywania podłogi bez kwotowego dowodu. |
| Widzew Łódź | Robert Dobrzycki został większościowym właścicielem w 2025; po początkowym dokapitalizowaniu 13,4 mln PLN udokumentowano także 22 mln PLN pożyczki konwertowanej na akcje.[^widzew-official][^widzew-capital] To realnie zbudowało kosztowną kadrę, lecz nie jest obietnicą corocznych wpłat. | `strong` | Używać czasu przeszłego: pieniądze właściciela **zbudowały** kadrę. Ewentualna podłoga dotyczy wyłącznie startu kariery. |
| Śląsk Wrocław | Miasto pozostaje właścicielem i w 2026 przeznaczyło 30 mln PLN na klub; równolegle trwa restrukturyzacja finansowa i przygotowanie do prywatyzacji.[^slask-capital][^slask-restructuring] To finansowanie płynności i naprawy, nie dowód na swobodny budżet transferowy. | `none` | Można nazwać miejski model i restrukturyzację; nie przedstawiać dokapitalizowania jako przewagi zakupowej. |
| Piast Gliwice | Gmina Gliwice ma 75,25% akcji, Zbigniew Kałuża 19,33%, a stowarzyszenie 5,42%.[^piast] Klub realizuje plan naprawczy i pozostaje pod nadzorem finansowym. | `none` | Miejska kontrola i ograniczony margines są kontekstem; brak podstawy do dodatkowej gotówki na start. |
| Radomiak Radom | Według aktualnego przeglądu TVP większościowym właścicielem jest Grzegorz Gilewski, który wcześniej finansowo wspierał klub.[^radomiak] Brak jednak wiarygodnego rozdzielenia tych wpłat na kapitał, płynność i przyszłe transfery. | `none` | Nie uzależniać opisu ani budżetu od nieudokumentowanej wolnej puli; wystarczą słabe finanse i prognoza sportowa gry. |
| Korona Kielce | Korona 4ever Łukasza Maciejczyka ma 99% akcji. Umowa obejmowała 6 mln PLN dokapitalizowania, zapewnienie płynności i rosnące cele budżetowe.[^korona] | `active` | Można napisać, że nowy właściciel **już wzmocnił** klub. Podłoga, jeśli wygra pomiar, działa tylko w pierwszym oknie. |
| Motor Lublin | Zbigniew Jakubas jest większościowym akcjonariuszem i prezesem. W 2026 jawnie odrzucił model stałego utrzymywania klubu przez właściciela i postawił na samofinansowanie bieżącej działalności.[^motor] | `restrained` | Zamożność właściciela jest ciekawostką, nie mechaniką. Opisuje się stopniową budowę bez finansowej szarży. |
| Zagłębie Lubin | KGHM ma 100% akcji i pozostaje właścicielskim zapleczem klubu.[^zaglebie] Zwykłe finansowanie sponsorskie jest częścią realnych przychodów, więc osobna podłoga liczyłaby je drugi raz. | `none` | Wolno wymienić stabilne zaplecze KGHM; nie wolno obiecywać dodatkowego transferu właścicielskiego. |
| Wisła Kraków | Jarosław Królewski pozostaje właścicielem i prezesem, obok innych akcjonariuszy, w tym Petera Moore'a.[^wisla-krakow] | `none` | Najważniejsze są powrót do ligi, profil sportowy i finanse gry; rozproszony akcjonariat nie daje osobnej podłogi. |
| Wieczysta Kraków | Formalnym jedynym akcjonariuszem spółki jest Klub Sportowy Wieczysta Kraków, a Wojciech Kwiecień jest głównym sponsorem projektu.[^wieczysta-owner] Najnowsze materiały pokazują też, że stadion i część organizacji nie nadążyły jeszcze za awansem.[^wieczysta-structure] | `strong` | Pisać „główny sponsor”, nie „właściciel”. Pieniądze zbudowały kosztowną kadrę; podłoga jest jednorazowa i musi faktycznie wiązać, by tekst obiecywał większy budżet na start. |
| GKS Katowice | Miasto Katowice ma 89,75% akcji i w 2025 objęło nowe akcje za 9 mln PLN.[^gks] To dokapitalizowanie klubu z wysoką stratą, nie osobna pula transferowa. | `none` | Miejski model może być kontekstem, ale pierwszoplanowe są deficyt i szansa przychodu z Europy. |
| Wisła Płock | Jedynym akcjonariuszem jest Miasto Płock; ORLEN i Budmat pozostają widocznymi sponsorami także w sezonie 2026/27.[^wisla-plock-owner][^wisla-plock-sponsors] | `none` | Wsparcie właściciela i sponsorów jest realne, ale przychód powtarzalny gry pozostaje niski; nie dodawać drugiej puli. |

## Wniosek dla dopasowania

Do siatki `backerSupportFloor` wchodzą tylko trzy kluby: Widzew i Wieczysta jako `strong` oraz
Korona jako `active`. Motor jest kontrolą `restrained = null`. Pozostałe czternaście klubów ma
`none`, nawet jeśli stoją za nimi zamożne osoby, miasto albo duża spółka. Ten rygor zapobiega
zamianie ciekawostki właścicielskiej w osiemnaście ręcznie strojonych handicapów.

Podłoga nie musi wygrać maksimum. Jeżeli koszt użytecznego wzmocnienia albo udział przychodu jest
wyższy, raport ma pokazać wsparcie jako istniejące, lecz niewiążące. `character` nie może wtedy
twierdzić, że wsparcie daje dodatkową gotówkę; nadal może prawdziwie opisać kadrę już zbudowaną za
pieniądze sponsora lub właściciela.

## Źródła

[^legia]: Legia Warszawa, [Władze klubu](https://legia.com/wladze-klubu), odczyt 2026-09-11.
[^lech]: KKS Lech Poznań, [sprawozdanie finansowe za 2024/25, nota 11](https://www.lechpoznan.pl/files/upload/files/2025-06-30_KKS_Lech_Poznan_SF.pdf), odczyt 2026-09-11.
[^rakow]: Raków Częstochowa, [Zmiany w strukturach właścicielskich RKS-u Raków](https://rakow.com/aktualnosci/zmiany-w-strukturach-wlascicielskich-rks-u-rakow-2691), stan potwierdzony w przeglądzie ligi 2026/27, odczyt 2026-09-11.
[^jagiellonia]: Jagiellonia Białystok, [O klubie — akcjonariusze](https://jagiellonia.pl/oklubie), odczyt 2026-09-11.
[^pogon]: Radio Szczecin, [Haditaghi oficjalnie stał się właścicielem Pogoni](https://radioszczecin.pl/index.php?go=morelist&idp=449&idx=170&sp=4), 2025-03-22, odczyt 2026-09-11.
[^gornik]: Górnik Zabrze, [Lukas Podolski nowym właścicielem Górnika](https://www.gornikzabrze.pl/aktualnosci/wydarzenia/nowa-era-lukas-podolski-nowym-wlascicielem-gornika-zabrze), 2026-05-21, odczyt 2026-09-11.
[^cracovia]: Cracovia, [Robert Platek i Elżbieta Filipiak nowymi akcjonariuszami](https://www.cracovia.pl/posts/robert-platek-i-elzbieta-filipiak-nowymi-akcjonariuszami-cracovii/219), 2025-08-14, oraz [potwierdzenie większościowego akcjonariusza](https://cracovia.pl/posts/nowy-skad-rady-nadzorczej-ks-cracovia-sa/5855), 2026-03-18, odczyt 2026-09-11.
[^widzew-official]: Widzew Łódź, [prezentacja biznesowa](https://widzew.com/dokumenty/Prezentacja-Biznes_20250305-2.pdf), 2025, odczyt 2026-09-11.
[^widzew-capital]: Money.pl, [umowa inwestycyjna i dokapitalizowanie 13,4 mln PLN](https://www.money.pl/pieniadze/miliarder-wlozyl-miliony-w-widzew-nam-mowi-czy-interesuje-go-pzpn-7154890505820672a.html), oraz WidzewToMy, [22 mln PLN pożyczki z konwersją na akcje](https://www.widzewtomy.net/dobrzycki-wyjasnil-kwestie-kapitalu-i-pozyczki/), 2026-02-03, odczyt 2026-09-11.
[^slask-capital]: Wrocław.pl, [30 mln PLN dla Śląska w 2026](https://www.wroclaw.pl/dla-mieszkanca/30-milionow-dla-slaska-i-koniec-dyskusji-o-sprzedazy-pytamy-o-wroclaw-mateusz-zak-wiceprezydent-wroclawia), 2026-06-24, odczyt 2026-09-11.
[^slask-restructuring]: Wrocław.pl, [restrukturyzacja finansowa i przygotowanie do prywatyzacji](https://www.wroclaw.pl/sport/zmiany-w-zarzadzie-slaska-wroclaw-nowy-wiceprezes), 2026-03-17, odczyt 2026-09-11.
[^piast]: BIP Piasta Gliwice, [Struktura własnościowa](https://piast-gliwice.nowybip.pl/struktura-wlasnosciowa), aktualizacja 2026-06-09, odczyt 2026-09-11.
[^radomiak]: TVP Sport, [Właściciele klubów Ekstraklasy 2026/27 — Radomiak](https://sport.tvp.pl/94455002/wlasciciele-klubow-pko-bp-ekstraklasy-20262027-twarze-polskiego-futbolu/amp), 2026, odczyt 2026-09-11.
[^korona]: Miasto Kielce, [warunki sprzedaży 99% akcji Korony](https://www.kielce.eu/pl/aktualnosci/radni-jednomyslnie-za-sprzedaza-korony-kielce.html), 2025-03-06, i [finalizacja transakcji](https://www.kielce.eu/pl/aktualnosci/korona-oficjalnie-ma-nowego-wiekszosciowego-udzialowca-i-wygrywa-po-raz-3-z-rzedu.html), 2025-03-07, odczyt 2026-09-11.
[^motor]: Dziennik Wschodni, [Zbigniew Jakubas: „Idziemy krok po kroku”](https://www.dziennikwschodni.pl/artykul/386132%2Czbigniew-jakubas-motor-lublin-idziemy-krok-po-kroku-jak-jagiellonia), 2026-02-11, oraz BIP Miasta Lublin, [władze Motoru](https://bip.lublin.eu/jednostki-organizacyjne-miasta-lublin/spolki/spolki-z-udzialem-miasta-lublin/3%2C23665%2C2%2C35%2C1%2Cver.html), aktualizacja 2025-07-03, odczyt 2026-09-11.
[^zaglebie]: Zagłębie Lubin, [Akcjonariusze](https://www.zaglebie.com/Akcjonariusze), odczyt 2026-09-11.
[^wisla-krakow]: Wisła Kraków, [konferencja z właścicielem i akcjonariuszem](https://wislakrakow.com/en/news/wisla-krakow-swietuje-120-lat-wyjatkowy-mecz-z-wrexham-afc-konferencja-prasowa?wcag=1), 2026-01-28, oraz [sprawozdanie zarządu 2024/25](https://dfdu1vke3eg77.cloudfront.net/spaces/289/uploads/vlzBAINNvrB5tiP8oOh4QWu8al56pWd6tV4bxL3z.pdf), odczyt 2026-09-11.
[^wieczysta-owner]: TVP Sport, [Właściciele klubów Ekstraklasy 2026/27 — Wieczysta](https://sport.tvp.pl/94455002/wlasciciele-klubow-pko-bp-ekstraklasy-20262027-twarze-polskiego-futbolu/amp), oraz Rejestr.io, [Wieczysta Kraków S.A.](https://rejestr.io/krs/1245568/wieczysta-krakow), stan od 2026-07-09, odczyt 2026-09-11.
[^wieczysta-structure]: TVP Sport, [Za kulisami Wieczystej](https://sport.tvp.pl/94466241/pko-ekstraklasa-za-kulisami-wieczystej-krakow-jak-wojciech-kwiecien-negocjuje-transfery/amp), oraz Gazeta Krakowska, [organizacyjne wymogi po awansie](https://gazetakrakowska.pl/wieczysta-krakow-jest-juz-spolka-akcyjna-problem-jest-ze-stadionem-do-gry-w-ekstraklasie/ar/c2p2-29066823), 2026-06-06, odczyt 2026-09-11.
[^gks]: GKS Katowice, [akcjonariat](https://www.gkskatowice.eu/akcjonariat) i [objęcie 9 mln nowych akcji przez Miasto Katowice](https://www.gkskatowice.eu/announcement/522), 2025-09-23, odczyt 2026-09-11.
[^wisla-plock-owner]: Wisła Płock, [statut spółki](https://www.wisla-plock.pl/userfiles_2019/files/STATUT.pdf), odczyt 2026-09-11.
[^wisla-plock-sponsors]: Wisła Płock, [stroje i sponsorzy sezonu 2026/27](https://wisla-plock.pl/aktualnosci/piekny-blekit-oraz-biel-nowe-koszulki-meczowe-juz-w-sprzedazy/), 2026-07-21, odczyt 2026-09-11.
