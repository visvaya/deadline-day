export type ChangelogEntry = {
  version: string;
  date: string;
  notes: readonly string[];
};

/**
 * The version the player reads, and nothing else. The save file's engine
 * guard lives in src/logic/engine-version.ts - pointing it here was how it
 * came to accept saves from three different engines, because this number
 * moves when there is news and an engine changes whether or not there is.
 */
export const CURRENT_VERSION = "0.34";

export const NEXT_UPDATE_NOTE = "kolejna aktualizacja: wkrótce";

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: "0.34",
    date: "2026-09-23",
    notes: [
      "Przy sprzedaży zawodnika ofertę składa klub, którego stać na tę kwotę. Tańszych zawodników kupują kluby Ekstraklasy i pierwszej ligi, a droższych – od mniej więcej dwóch milionów – bierze zagranica, od Genku i Kopenhagi po Benfikę i Borussię Dortmund.",
      "Cena zależy od kupca, a nie od przypadku: bogatszy klub płaci trochę więcej, więc ten sam zawodnik dostaje oferty w węższym przedziale niż dotąd. Przeciętna sprzedaż przynosi przy tym mniej pieniędzy.",
      "Kariery zapisanej w poprzedniej wersji nie da się wznowić. Gra powie to wprost i zaproponuje nową.",
    ],
  },
  {
    version: "0.33",
    date: "2026-09-22",
    notes: [
      "Zamiast poziomu trudności wybierasz jeden z osiemnastu klubów Ekstraklasy. Lista idzie od najmocniejszego do najsłabszego według prognozy na sezon, a po zaznaczeniu klubu widzisz jego siłę w ataku i obronie, prognozowane miejsce, oczekiwane punkty, budżet pierwszego okna, stały przychód, udział płac i prognozowaną zmianę budżetu.",
      "Słabszym klubem gra się trudniej – mniejszy budżet, słabsza kadra, większe ryzyko spadku – dlatego do tego samego tytułu na koniec kariery wystarczy mu niższy wynik dziedzictwa. Radomiakiem zostaniesz Architektem przy mniejszej liczbie punktów niż Legią.",
      "Kluby z miejscem w europejskich pucharach zaczynają karierę od eliminacji.",
      "Przed wyborem klubu podajesz imię i nazwisko menedżera albo losujesz je jednym przyciskiem. Imię, nazwisko i wybrany klub zapisują się na bieżąco, więc przeładowanie strony niczego nie kasuje.",
      "Nowe ustawienie „Pasek akcji”: pasek z przyciskami może chować się podczas przewijania. Na telefonie, także trzymanym poziomo, domyślnie się chowa, a na komputerze zostaje widoczny.",
      "Na iPhonie szybkie przewinięcie nie zostawia już białego pasa na dole strony, a pasek akcji nie wchodzi pod pasek adresu ani pod kreskę gestu.",
      "Lepsza obsługa klawiatury i czytników ekranu: powiadomienie po zmianie ekranu nie zasłania nagłówka, a po decyzji w oknie transferowym fokus przechodzi na przyciski następnej oferty.",
      "Kariery zapisanej w poprzedniej wersji nie da się wznowić. Gra powie to wprost i zaproponuje nową.",
    ],
  },
  {
    version: "0.32",
    date: "2026-09-12",
    notes: [
      "Finanse klubów opierają się na prawdziwych sprawozdaniach. Każdy klub ma własny stały przychód, płace i ceny zawodników liczą się z jednej skali, a wartość zawodnika zależy od tego, jak daleko mu do szczytu kariery na jego pozycji.",
      "Budżet na pierwsze okno zależy od przychodu klubu, a kilka klubów z zamożnym właścicielem dostaje na start dodatkowe wsparcie. Po każdym sezonie zarząd przekazuje na transfery 30% wyniku, więc udany sezon i puchary realnie powiększają budżet.",
      "Prognoza w górnym pasku pokazuje, o ile zmieni się budżet na transfery po sezonie. Liczy się raz, na starcie sezonu, a transfer zmienia ją dokładnie o różnicę w płacach.",
    ],
  },
  {
    version: "0.31",
    date: "2026-09-03",
    notes: [
      "Eliminacje Ligi Konferencji przestały być formalnością. Przejście ich zależy teraz wyraźnie od siły kadry i dla klubu Ekstraklasy jest raczej wyjątkiem niż regułą – tak jak w prawdziwych eliminacjach, z których polskie kluby odpadają częściej, niż przez nie przechodzą.",
      "Odpadnięcie z Ligi Mistrzów albo Ligi Europy nie oznacza już prawie pewnej jesieni w Lidze Konferencji. Kaskada nadal daje drugą i trzecią szansę, ale ostatnia z nich jest realnym sitem, a nie siatką bezpieczeństwa.",
      "Mniej kampanii dochodzi do fazy ligowej, więc pieniądze z pucharów są niższe i mniej pewne. Budżet oparty na europejskich premiach jest ryzykowniejszy niż był.",
      "Metryki w raporcie analityka mają teraz nazwy i znaczenie zgodne ze źródłami. Część liczb wygląda inaczej niż wcześniej: wskaźniki pod presją to procenty, ocena HOPS mieści się w skali od 0 do 1, odzyskania na połowie rywala liczone są na 90 minut, a dystans ustawienia bramkarza pokazujemy w metrach.",
      "Kilka metryk zmieniło nazwę, żeby nie obiecywać czegoś innego, niż pokazuje: „Goals Prevented /90” liczy gole zapobieżone ponad oczekiwanie, „Shooting Goals Added” zastępuje „xGOT − xG”, a „NP xG/Shot” liczy wyłącznie strzały bez karnych.",
      "Przy każdej metryce pojawił się znak „?”. Po najechaniu, ustawieniu fokusu albo tapnięciu wyjaśnia po polsku, co mierzy dana statystyka i czy lepszy jest wyższy, czy niższy wynik.",
    ],
  },
  {
    version: "0.30",
    date: "2026-08-27",
    notes: [
      "Przy równym OVR młodszy zawodnik ma pierwszeństwo do gry i pozostania w kadrze. Jeśli także wiek jest równy, decyduje kolejność alfabetyczna.",
      "Gdy transfer przepełni pozycję i oznacza zwolnienie obecnego zawodnika, gra pokazuje wcześniej, kto odejdzie, i pyta o potwierdzenie. Czas nadal biegnie, a po decyzji log i powiadomienie podają, z kim klub rozwiązał kontrakt.",
      "Nie zobaczysz już oferty zawodnika, dla którego po transferze nie byłoby miejsca i który od razu wypadłby z kadry.",
    ],
  },
  {
    version: "0.29",
    date: "2026-08-27",
    notes: [
      "Sztab wyrabia sobie zdanie o zawodniku przez lata, zamiast oceniać go od nowa przy każdym otwarciu raportu. Jeden sezon to jedna opinia: latem i zimą przeczytasz to samo, a skaut i trener mówią jednym głosem – różni ich tylko nagłówek.",
      "Pewność raportu nigdy nie spada. Im dłużej masz zawodnika, tym mniej sztab się waha, a raport z wysoką pewnością przestaje się zmieniać.",
      "Im mniej pewny raport, tym większy skok przy następnym: przy niskiej pewności może przeskoczyć o dwa poziomy, przy umiarkowanej o jeden. Sztab nie zaprze się jednak przy opinii, której zaprzecza to, co zawodnik już pokazuje na boisku.",
      "Wysoką pewność sztab musi sobie zapracować – obserwacją przez kilka sezonów albo tym, że zawodnik jest już blisko swojego szczytu. Świeżo ściągnięty nastolatek jej nie dostanie.",
      "Przy poziomie pewności jest teraz znak zapytania, który tłumaczy, co ten poziom znaczy i o ile raport może się jeszcze zmienić. Przy raporcie o obecnym poziomie wyjaśnia też, skąd biorą się sezonowe wahania oceny ogólnej zawodnika.",
    ],
  },
  {
    version: "0.28",
    date: "2026-08-26",
    notes: [
      "Mecze kończą się wynikami bliższymi prawdziwej Ekstraklasie: mniej goli, więcej remisów i wyraźniejsza przewaga gospodarza. Wyjazdowe zwycięstwa przestały być tak częste, jak były.",
    ],
  },
  {
    version: "0.27",
    date: "2026-08-25",
    notes: [
      "Zawodnicy przychodzą teraz także z klubów pierwszej ligi, nie tylko z Ekstraklasy. Im słabszy klub, tym słabszy zawodnik – małe kluby nie mają gwiazd i już nie udają, że mają.",
      "Ostatnim klubem wolnego agenta może być drużyna z pierwszej ligi.",
    ],
  },
  {
    version: "0.26",
    date: "2026-08-24",
    notes: [
      "Z Ekstraklasy spadają teraz trzy kluby, a nie dwa – tak jak naprawdę. Miejsce szesnaste też oznacza spadek, więc walka o utrzymanie jest o jedno miejsce trudniejsza.",
      "Trzecie miejsce w lidze daje Ligę Europy, nie Ligę Konferencji. Wcześniej gra dawała trzeciej drużynie puchar o szczebel za nisko.",
      "Gdy zdobywca Pucharu Polski jest już w czołowej trójce, zwolnione miejsce w Lidze Europy schodzi o szczebel niżej: czwarta drużyna awansuje z Ligi Konferencji do Ligi Europy, a piąta wchodzi do Konferencyjnej. Wcześniej czwarty zostawał niżej niż piąty.",
      "Tabela na półmetku nie oznacza już nikogo jako spadkowicza – do końca sezonu zostaje siedemnaście kolejek i nic nie jest przesądzone.",
      "W kadrze na start nie znajdziesz już zawodnika tak słabego, że zakończy karierę po pierwszym sezonie, zanim zdążysz go sprzedać albo wystawić.",
    ],
  },
  {
    version: "0.25",
    date: "2026-08-23",
    notes: [
      "Skład Ekstraklasy zmienia się między sezonami. Ostatnie kluby spadają, a na ich miejsce wchodzą beniaminkowie z pierwszej ligi – im mocniejszy klub, tym częściej awansuje, ale pewności nie ma żaden.",
      "Klub, który spadł i wrócił, jest odrobinę słabszy niż przed spadkiem. Awans daje zastrzyk, spadek zabiera trochę więcej.",
      "Spadek kończy twoją kadencję. Nie ma roku na odbudowę: sezony, które zostały, nie zostaną rozegrane.",
      "Kadencja zakończona spadkiem ma własne zakończenie – krótsze, ale nadal odsłania ukryty potencjał twoich zawodników i mówi, kogo odrzuciłeś.",
      "Na ekranie dziedzictwa przy każdym transferze widać teraz, ile zawodnik miał lat, gdy go kupowałeś – wcześniej pokazywał się jego wiek na koniec kariery.",
    ],
  },
  {
    version: "0.24",
    date: "2026-08-22",
    notes: [
      "Zmiana oceny zawodnika z poprzedniego sezonu jest teraz widoczna przez cały sezon, także w oknie zimowym i przy ofertach dotyczących twoich zawodników. Wcześniej znikała po pierwszym oknie.",
      "Każdy zawodnik pokazuje tę zmianę, także gdy żadnej nie było – wtedy stoi tam zero. Znak zapytania znaczy, że gra nie ma czego pokazać: w pierwszym sezonie albo u zawodnika, który dołączył po zakończeniu poprzedniego. Zielony i czerwony pojawiają się w oknie letnim, bo wtedy zmiana jest świeża; w zimowym ta sama liczba jest wyszarzona.",
      "Raport zawodnika mówi teraz przy nazwisku, że jego kontrakt wygasa, a jego ocena traci kolor – tak samo jak na kafelku kadry.",
      "Sezon uznaje się za udany, gdy drużyna zdobędzie więcej punktów, niż zapowiadały prognozy. Wcześniej liczyło się miejsce w tabeli, przez co najsłabsze kluby miały udany sezon zawsze, a najmocniejsze prawie nigdy – i odbijało się to na formie zawodników.",
    ],
  },
  {
    version: "0.23",
    date: "2026-08-21",
    notes: [
      "W każdej kadrze siedzą teraz młodzi zawodnicy z rezerw i weterani po trzydziestce, tak jak w prawdziwym klubie. Wcześniej wszyscy mieli od 21 do 31 lat.",
      "Zawodnicy, których zastajesz w klubie, rozwijają się wiarygodniej – to, ile jeszcze mogą urosnąć, wynika teraz z ich wieku i poziomu, a nie z przypadku.",
      "Wszystkie osiemnaście klubów Ekstraklasy można poprowadzić. GKS Katowice i Wisła Płock grały dotąd tylko jako rywale.",
    ],
  },
  {
    version: "0.22",
    date: "2026-08-21",
    notes: [
      "Raporty trenera i analityka są teraz dostępne dla własnej kadry. Kliknij kafelek pozycji – na przeglądzie kadry albo w szufladzie przy ofercie – żeby zobaczyć wszystkich zawodników z tej pozycji i rozwinąć raport dowolnego z nich.",
      "Analityczna jakość dotyczy każdego zawodnika, nie tylko kupionych przez ciebie. Zawodnicy zastani, wolni agenci i wychowankowie też dają drużynie trochę więcej albo trochę mniej, niż sugerują OVR i cena – to zmiana wobec 0.91, gdzie byli neutralni.",
      "Epilog nie sprzedaje już twojego najlepszego młodego zawodnika ani nie wstawia za niego wychowanka. Zamiast tego kariera kończy się jedną pogłoską o zainteresowaniu z zagranicy – bez wpływu na kasę, kadrę i dziedzictwo.",
      "Raport o potencjale mówi teraz o poziomie, który zawodnik realnie zdąży osiągnąć, a nie o tym, jak wysoko sięga jego sufit. Zawodnik tuż przed szczytem formy nie zostanie już opisany jako przyszła klasa europejska, skoro został mu jeden sezon wzrostu.",
      "Ocena sztabu nie może już wypaść niżej niż to, co zawodnik pokazuje dziś – ocena 66 i werdykt „zawodnik niższej ligi” nie pojawią się obok siebie.",
      "Im bliżej szczytu formy, tym częściej sztab jest pewny swojej oceny; sezon przed szczytem nie usłyszysz już „niskiej pewności”. Skala werdyktów pokrywa się teraz z kolorami ocen: czerwony to niższa liga, bursztyn – przeciętny ligowiec, zielony – czołówka i klasa europejska.",
      "Minuty w raporcie własnego zawodnika zależą od tego, ile faktycznie gra. Rezerwowy nie pokazuje już kompletu minut podstawowego, a przy małej liczbie minut raport wprost ostrzega, że wie mniej.",
      "Sekcja „Kadra” na ofercie mówi, jaka jest jakość obsady tej pozycji i kim po transferze byłby oferowany zawodnik. Kliknięcie w dowolne miejsce sekcji otwiera pełną kadrę.",
      "Poprawki wyglądu na telefonach – kafelki kadry nie rozjeżdżają się już na iPhonie, a szuflada raportów zamyka się przeciągnięciem i nie przewija strony pod spodem.",
    ],
  },
  {
    version: "0.21",
    date: "2026-08-19",
    notes: [
      "Raport analityka przy każdej ofercie: dwie statystyki jakościowe z wartościami i percentylami, poziom klubu oraz wielkość próby. Dane pomagają znaleźć zawodników dających więcej albo mniej, niż sugerują OVR i cena.",
      "Ocena skauta albo trenera przy każdej ofercie: u młodych mówi o potencjale, u dojrzałych o obecnym poziomie – zawsze z jawnym poziomem pewności obserwacji.",
      "Zawodnicy, których sam kupisz, mogą dawać drużynie nieco więcej albo mniej, niż sugerują OVR i cena. Ta niewidoczna dla rynku różnica jest stała, dotyczy ataku albo obrony i nie mówi nic o potencjale; zawodnicy zastani i wychowankowie pozostają neutralni.",
      "Zastąpienie etykiety skauta pełniejszym raportem.",
    ],
  },
  {
    version: "0.20",
    date: "2026-08-17",
    notes: [
      "Sezon rozgrywa się naprawdę: 306 meczów, bramki, tabela z różnicą bramek. Punkty wypadają z wyników, nie z losowania.",
      "Każda kadra ma swoje ustawienie – jedno z siedmiu, losowane na start kariery. Pozycji jest piętnaście zamiast ośmiu.",
      "Siła klubu bierze się z jego prawdziwej formy w Ekstraklasie, osobno w ataku i w obronie. Klub z mocnym atakiem i dziurawą obroną wygląda tak na kafelkach.",
      "Wisła Kraków, Wisła Płock i Wieczysta w miejsce Puszczy, Stali i Arki.",
      "Puchary europejskie mają trzy szczeble i kaskadę spadania między nimi, doszedł Superpuchar Polski.",
      "Przekalibrowane poziomy trudności: ta sama jakość gry daje teraz ten sam tytuł niezależnie od klubu.",
    ],
  },
  {
    version: "0.12",
    date: "2026-08-13",
    notes: [
      "Przebudowany rozwój zawodników: płynniejsza krzywa wieku, inna dla każdej pozycji, plus forma sezonowa.",
      "Skrócony epilog kariery i przekalibrowany próg każdego tytułu dziedzictwa.",
    ],
  },
  {
    version: "0.11",
    date: "2026-08-13",
    notes: [
      "Przerwana partia wraca po odświeżeniu strony.",
      "Licznik czasu na ofercie leci dalej, nawet gdy zgasisz ekran.",
    ],
  },
  {
    version: "0.10",
    date: "2026-08-11",
    notes: [
      "Odświeżony układ ekranów gry pod telefony i desktop.",
      "Poprawki tabeli ligowej, powiadomień o transakcjach i przewijanych list.",
      "Naprawiony błąd blokujący przejście do kolejnego sezonu po dwóch kliknięciach.",
    ],
  },
];
