import React, { useState, useEffect, useRef } from "react";

import { randomSeed } from "../src/logic/rng.ts";
import { ambientFloat, setAmbientSeed, getAmbientRng } from "../src/logic/rng-ambient.ts";
import { zaokr, pl, znak } from "../src/logic/format.ts";
import { placaBazowa, placaZawodnika, placeRazem, placaSrednia } from "../src/logic/wages.ts";
import { createSquad, xiInOrder, substitutes, squadStrength } from "../src/logic/squad.ts";
import { rollMarket } from "../src/logic/market.ts";
import { rollOffer, buyPrice, sellPrice } from "../src/logic/offers.ts";
import {
  buildSchedule,
  leagueTable,
  pointsForStrength,
  expectedPlace,
} from "../src/logic/season.ts";
import { annualForecast } from "../src/logic/finance.ts";
import { ageSquad } from "../src/logic/development.ts";
import { computeVerdict } from "../src/logic/scoring.ts";
import { runEpilogue } from "../src/logic/epilogue.ts";

import { TYPY } from "../src/data/positions.ts";
import { POZIOMY } from "../src/data/difficulty-levels.ts";
import { RYNEK_OPIS } from "../src/data/market-states.ts";
import {
  SEZONY_GRY,
  SEZONY_EPILOGU,
  KOSZTY_STALE,
  PRZYCHOD_BAZOWY,
  CZAS_BAZOWY,
  CZAS_DODATKOWY,
  MAX_PRZECIAGNIEC,
  KARA_CENA,
  KARA_SPRZEDAZ,
  KARA_PLACA,
} from "../src/data/balance.ts";

/* ============================ DANE ============================ */

/* ============================ POMOCNICZE ============================ */

const wybierz = (a) => a[Math.floor(ambientFloat() * a.length)];

/* ============================ KADRA ============================ */

const stworzKadre = (silaKlubu, trudny) => createSquad(getAmbientRng(), silaKlubu, trudny);
const xiWKolejnosci = xiInOrder;
const rezerwowi = substitutes;
const silaKadry = squadStrength;

const kolorOvr = (o) => (o == null ? "pustko" : o <= 62 ? "czerw" : o <= 70 ? "zolty" : "zielo");

function potencjal(z) {
  if (z.brak || !z.wiek) return { znak: "·", klasa: "pot-n" };
  if (z.wiek <= 23) return { znak: "▲", klasa: "pot-w" };
  if (z.wiek >= 30) return { znak: "▼", klasa: "pot-s" };
  return { znak: "=", klasa: "pot-r" };
}

/* ============================ FINANSE ============================ */

const oczekiwaneMiejsce = (kadra, europa) => expectedPlace(silaKadry(kadra, europa));
const prognozaRoczna = annualForecast;

/* ============================ SYMULACJA ============================ */

const punktyZaSile = (s) => pointsForStrength(getAmbientRng(), s);
const tabelaSezonu = (pkt, krotko) => leagueTable(getAmbientRng(), pkt, krotko);
const starzenieKadry = (kadra) => ageSquad(getAmbientRng(), kadra);

/* ============================ RYNEK ============================ */

const losujRynek = () => rollMarket(getAmbientRng());

/* ============================ KARTY ============================ */

const losujKarte = (kadra, rynek, okres) => rollOffer(getAmbientRng(), kadra, rynek, okres);

/* ============================ HARMONOGRAM ============================ */

const harmonogram = buildSchedule;

/* ============================ STYL ============================ */

const STYL = `
.dd-root{--tlo:#06080d;--tlo2:#0d1220;--cyjan:#4fd8e8;--zolty:#ffd23f;--zielo:#3ddc84;--czerw:#ff5757;--biel:#dfe6f0;--szary:#6b7a94;
 background:var(--tlo);color:var(--biel);min-height:100%;
 font-family:ui-monospace,'SF Mono','Cascadia Mono','Roboto Mono',Menlo,Consolas,monospace;
 font-size:14px;line-height:1.45;letter-spacing:.02em;padding:0 0 36px;}
.dd-wrap{max-width:470px;margin:0 auto;padding:0 12px;}
.dd-pasek{background:var(--cyjan);color:#02040a;font-weight:700;display:flex;justify-content:space-between;
 padding:6px 12px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;}
.dd-h{color:var(--zolty);font-weight:700;letter-spacing:.14em;text-transform:uppercase;font-size:12px;margin:16px 0 6px;}
.dd-box{border:1px solid #1e2b45;background:var(--tlo2);padding:12px;margin-bottom:10px;}
.dd-btn{display:block;width:100%;padding:14px;margin-top:8px;border:0;cursor:pointer;font-family:inherit;
 font-size:14px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;background:#16233c;color:var(--biel);border-left:4px solid var(--cyjan);}
.dd-btn.tak{border-left-color:var(--zielo);} .dd-btn.targ{border-left-color:var(--zolty);}
.dd-btn.czas{border-left-color:#a06cd5;}
.dd-btn.pas{border-left-color:var(--szary);color:var(--szary);}
.dd-btn:disabled{opacity:.32;cursor:default;}
.dd-btn .sub{display:block;font-size:10px;font-weight:400;letter-spacing:.04em;text-transform:none;color:var(--szary);margin-top:3px;}
.dd-restart{display:block;width:100%;margin-top:18px;padding:9px;background:transparent;border:1px solid #1e2b45;
 color:#4a5670;font-family:inherit;font-size:11px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;}
.dd-poziom{display:block;width:100%;text-align:left;padding:12px;margin-top:8px;border:0;cursor:pointer;
 font-family:inherit;background:#111a2c;color:var(--biel);border-left:4px solid;}
.dd-poziom .tyt{font-weight:700;letter-spacing:.12em;font-size:14px;}
.dd-poziom .op{font-size:11px;color:var(--szary);line-height:1.5;margin-top:4px;}
.dd-poziom.p-latwy{border-left-color:var(--zielo);} .dd-poziom.p-latwy .tyt{color:var(--zielo);}
.dd-poziom.p-sredni{border-left-color:var(--zolty);} .dd-poziom.p-sredni .tyt{color:var(--zolty);}
.dd-poziom.p-trudny{border-left-color:var(--czerw);} .dd-poziom.p-trudny .tyt{color:var(--czerw);}

.dd-siatka{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;align-items:start;}
.dd-kaf{background:#111a2c;padding:4px 2px 5px;text-align:center;border-bottom:3px solid;
 border-top:1px solid transparent;border-left:1px solid transparent;border-right:1px solid transparent;}
.dd-kaf .p{color:var(--szary);font-size:9px;letter-spacing:.08em;}
.dd-kaf .glowny{font-weight:700;font-size:16px;line-height:1.15;white-space:nowrap;}
.dd-kaf .rez{font-size:11px;color:#55637c;line-height:1.35;white-space:nowrap;}
.dd-kaf .pot{font-size:10px;margin-right:2px;font-weight:400;}
.dd-kaf .wiek{font-size:9px;color:var(--szary);font-weight:400;margin-left:2px;}
.dd-kaf .brak{font-size:10px;color:#3f4a60;font-style:italic;line-height:1.4;}
.dd-kaf.hl{border-top-color:var(--cyjan);border-left-color:var(--cyjan);border-right-color:var(--cyjan);
 background:#16253f;box-shadow:0 0 0 1px var(--cyjan) inset;}
.czerw{border-bottom-color:var(--czerw);} .czerw .glowny{color:var(--czerw);}
.zolty{border-bottom-color:var(--zolty);} .zolty .glowny{color:var(--zolty);}
.zielo{border-bottom-color:var(--zielo);} .zielo .glowny{color:var(--zielo);}
.pustko{border-bottom-color:#2a3550;} .pustko .glowny{color:#3f4a60;}
.pot-w{color:var(--zielo);} .pot-s{color:var(--czerw);} .pot-r{color:#4a5670;} .pot-n{color:#2f394d;}

.dd-hud{display:flex;justify-content:space-between;gap:6px;font-size:11px;padding:8px 0;border-bottom:1px solid #1e2b45;}
.dd-hud div{flex:1;}
.dd-hud b{display:block;color:var(--zolty);font-size:15px;font-weight:700;}
.dd-hud b .sr{font-size:10px;font-weight:400;color:#55637c;}
.dd-hud b.min{color:var(--czerw);} .dd-hud b.plus{color:var(--zielo);}
.dd-fin{display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px solid #131c2e;}
.dd-rynek{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;}
.dd-rk{background:#111a2c;padding:4px 2px;text-align:center;font-size:11px;}
.dd-rk span{display:block;font-size:14px;font-weight:700;}
.dd-raport{border-top:1px solid #1e2b45;margin-top:10px;padding-top:8px;}
.dd-raport div{font-size:12px;line-height:1.5;color:#a9b6c9;}
.dd-raport div.stat::before{content:"› ";color:var(--cyjan);}
.dd-tab{width:100%;border-collapse:collapse;font-size:12px;}
.dd-tab td{padding:3px 4px;border-bottom:1px solid #131c2e;}
.dd-tab tr.ja td{background:#16233c;color:var(--zolty);font-weight:700;}
.dd-timer{height:4px;background:#1e2b45;margin-top:10px;}
.dd-timer i{display:block;height:100%;background:var(--cyjan);transition:width .95s linear;}
.dd-timer.napiete i{background:var(--czerw);}
.dd-mini{color:var(--szary);font-size:11px;letter-spacing:.05em;}
.dd-news{border-left:3px solid var(--cyjan);padding:6px 0 6px 10px;margin:8px 0;font-size:13px;}
.dd-duza{font-size:32px;font-weight:700;color:var(--zolty);letter-spacing:-.02em;}
.dd-cyj{color:var(--cyjan);} .dd-zol{color:var(--zolty);} .dd-zie{color:var(--zielo);}
.dd-cze{color:var(--czerw);} .dd-sza{color:var(--szary);}
.dd-fiolet{color:#c39bf0;}
`;

/* ============================ APLIKACJA ============================ */

export default function DeadlineDay() {
  const [faza, setFaza] = useState("start");
  const [poziom, setPoziom] = useState(null);
  const [klub, setKlub] = useState(null);
  const [kadra, setKadra] = useState([]);
  const [kasa, setKasa] = useState(0);
  const [kroki] = useState(() => harmonogram());
  const [krok, setKrok] = useState(0);
  const [ruchy, setRuchy] = useState(0);
  const [rynek, setRynek] = useState(() => losujRynek());
  const [karta, setKarta] = useState(null);
  const [czas, setCzas] = useState(CZAS_BAZOWY);
  const [maxCzas, setMaxCzas] = useState(CZAS_BAZOWY);
  const [przeciagniecia, setPrzeciagniecia] = useState(0);
  const [timerWl, setTimerWl] = useState(true);
  const [log, setLog] = useState([]);
  const [historia, setHistoria] = useState([]);
  const [moje, setMoje] = useState([]);
  const [odrzuceni, setOdrzuceni] = useState([]);
  const [polowa1, setPolowa1] = useState(0);
  const [tabela, setTabela] = useState(null);
  const [wynikSezonu, setWynikSezonu] = useState(null);
  const [europa, setEuropa] = useState(false);
  const [werdykt, setWerdykt] = useState(null);
  const [epilog, setEpilog] = useState([]);
  const [epilogIdx, setEpilogIdx] = useState(0);
  const [finalne, setFinalne] = useState(null);
  const [drugaSzansa, setDrugaSzansa] = useState(null);
  const [pytamRestart, setPytamRestart] = useState(false);
  const tick = useRef(null);
  const [seed, setSeed] = useState(null);
  const akcjeRef = useRef([]);
  const eventsRef = useRef([]);
  const cardActionsRef = useRef([]);
  const decisionIndexRef = useRef(0);

  const okresTekst = () => {
    const k = kroki[krok];
    if (!k || k.typ !== "okno") return "ligi";
    return k.tura === "lato" ? "w ubiegłym sezonie" : "w rundzie jesiennej";
  };

  function startZPoziomem(p) {
    const nowySeed = globalThis.__DD_SEED__ ?? randomSeed();
    setAmbientSeed(nowySeed);
    setSeed(nowySeed);
    akcjeRef.current = [`START:${p.id}`];
    const k = wybierz(p.kluby);
    const kd = stworzKadre(k.sila, p.id === "trudny");
    eventsRef.current = [
      {
        type: "start",
        seed: nowySeed,
        poziom: p.id,
        klub: k.krotko,
        budzet: k.budzet,
        sila: k.sila,
      },
      {
        type: "window",
        sezon: kroki[0].sezon,
        tura: kroki[0].tura.toUpperCase(),
        ruchy: kroki[0].ruchy,
      },
    ];
    cardActionsRef.current = [];
    decisionIndexRef.current = 0;
    setPoziom(p);
    setKlub(k);
    setKadra(kd);
    setKasa(k.budzet);
    setRynek(losujRynek());
    setKrok(0);
    setRuchy(kroki[0].ruchy);
    setHistoria([]);
    setMoje([]);
    setOdrzuceni([]);
    setLog([]);
    setEpilog([]);
    setEpilogIdx(0);
    setFinalne(null);
    setWerdykt(null);
    setDrugaSzansa(null);
    setEuropa(false);
    setWynikSezonu(null);
    setKarta(null);
    setCzas(CZAS_BAZOWY);
    setMaxCzas(CZAS_BAZOWY);
    setPrzeciagniecia(0);
    setPytamRestart(false);
    setFaza("przeglad");
  }

  function otworzOferty() {
    setKarta(losujKarte(kadra, rynek, okresTekst()));
    setCzas(CZAS_BAZOWY);
    setMaxCzas(CZAS_BAZOWY);
    setPrzeciagniecia(0);
    setFaza("okno");
  }

  function przeciagnij() {
    if (przeciagniecia >= MAX_PRZECIAGNIEC) return;
    akcjeRef.current = [...akcjeRef.current, "CZAS"];
    cardActionsRef.current = [...cardActionsRef.current, "CZAS"];
    setPrzeciagniecia((n) => n + 1);
    setCzas((c) => c + CZAS_DODATKOWY);
    setMaxCzas((m) => m + CZAS_DODATKOWY);
  }

  useEffect(() => {
    if (faza !== "okno" || !timerWl || !karta) return;
    clearInterval(tick.current);
    tick.current = setInterval(() => {
      setCzas((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(tick.current);
  }, [karta, faza, timerWl]);

  useEffect(() => {
    if (faza !== "okno" || !timerWl || !karta || czas > 0) return;
    clearInterval(tick.current);
    decyzja("pas");
    // eslint-disable-next-line
  }, [czas, faza, timerWl, karta]);

  /* ---------- ceny po przeciągnięciu ---------- */
  const cenaKupna = buyPrice;
  const cenaSprzedazy = sellPrice;

  /* ---------- decyzje ---------- */
  function decyzja(akcja) {
    clearInterval(tick.current);
    if (!karta) return;
    // Matches data-dd-action, not the internal "tak"/"pas"/"targ" argument -
    // the golden replay format is driven by the DOM, not this function's API.
    const tokenAkcji = akcja === "tak" ? "BIERZ" : akcja.toUpperCase();
    akcjeRef.current = [...akcjeRef.current, tokenAkcji];
    cardActionsRef.current = [...cardActionsRef.current, tokenAkcji];
    const n = przeciagniecia;
    let wpis = null;
    let wynikId = "OK";
    let nowaKasa = kasa;
    let cena = karta.typ === "SPRZEDAZ" ? cenaSprzedazy(karta, n) : cenaKupna(karta, n);
    const cenaWyswietlana = cena;
    const pushDecisionEvent = () => {
      decisionIndexRef.current += 1;
      eventsRef.current = [
        ...eventsRef.current,
        {
          type: "decision",
          index: decisionIndexRef.current,
          kartaTyp: karta.typ,
          poz: karta.zawodnik.poz,
          ovr: karta.zawodnik.ovr,
          wiek: karta.zawodnik.wiek,
          ceiling: karta.zawodnik.sufit,
          cena: cenaWyswietlana,
          akcje: cardActionsRef.current,
          wynik: wynikId,
          cenaKoncowa: cena,
          kasa: nowaKasa,
        },
      ];
      cardActionsRef.current = [];
    };

    if (akcja === "targ") {
      const r = ambientFloat();
      if (r < 0.5) {
        cena = karta.typ === "SPRZEDAZ" ? zaokr(cena * 1.2, 2) : zaokr(cena * 0.8, 2);
        wpis = `Utargowane: ${karta.zawodnik.nazwa} — ${cena} mln.`;
        wynikId = "UTARG";
        akcja = "tak";
      } else if (r < 0.8) {
        wpis = `Bez ruchu w cenie. ${karta.zawodnik.nazwa} — ${cena} mln.`;
        wynikId = "BEZ_RUCHU";
        akcja = "tak";
      } else {
        wpis = `Przeciągnąłeś strunę. ${karta.zawodnik.nazwa} przepadł.`;
        wynikId = "PRZEPADL";
        akcja = "pas";
      }
    }

    if (akcja === "tak") {
      if (karta.typ === "SPRZEDAZ") {
        nowaKasa = zaokr(kasa + cena, 2);
        setKadra(kadra.filter((z) => z.id !== karta.zawodnik.id));
        setKasa((k) => zaokr(k + cena, 2));
        wpis =
          wpis ||
          `Sprzedany ${karta.zawodnik.nazwa} za ${cena} mln. Płace w dół o ${pl(placaZawodnika(karta.zawodnik))} mln/rok.`;
      } else {
        if (cena > kasa) {
          wynikId = "BRAK_SRODKOW";
          setLog((l) => [`Brak środków na ${karta.zawodnik.nazwa}.`, ...l].slice(0, 6));
          pushDecisionEvent();
          nastepnaKarta();
          return;
        }
        const nowy = {
          ...karta.zawodnik,
          moj: true,
          cenaZakupu: cena,
          mnoznikPlacy: 1 + KARA_PLACA * n,
        };
        let nk = [...kadra, nowy];
        const t = TYPY.find((x) => x.kod === nowy.poz);
        const naPoz = nk.filter((z) => z.poz === nowy.poz).sort((a, b) => b.ovr - a.ovr);
        if (naPoz.length > t.kadra + 1) {
          const odpad = naPoz[naPoz.length - 1];
          nk = nk.filter((z) => z.id !== odpad.id);
        }
        nowaKasa = zaokr(kasa - cena, 2);
        setKadra(nk);
        setMoje((m) => [...m, nowy]);
        setKasa((k) => zaokr(k - cena, 2));
        wpis =
          wpis ||
          `Kupiony ${karta.zawodnik.nazwa} (${karta.zawodnik.ovr}) za ${cena} mln. Płaca ${pl(placaZawodnika(nowy))} mln/rok.`;
      }
    } else {
      if (karta.typ === "KUPNO" || karta.typ === "PANIC")
        setOdrzuceni((o) => [...o, karta.zawodnik]);
      wpis = wpis || `Pas: ${karta.zawodnik.nazwa}.`;
    }

    pushDecisionEvent();
    setLog((l) => [wpis, ...l].slice(0, 6));
    nastepnaKarta();
  }

  function nastepnaKarta() {
    const zostalo = ruchy - 1;
    setRuchy(zostalo);
    setCzas(CZAS_BAZOWY);
    setMaxCzas(CZAS_BAZOWY);
    setPrzeciagniecia(0);
    if (zostalo <= 0) dalejKrok();
    else setKarta(losujKarte(kadra, rynek, okresTekst()));
  }

  /* ---------- harmonogram ---------- */
  function dalejKrok() {
    const n = krok + 1;
    setKrok(n);
    const k = kroki[n];
    if (!k) return;
    if (k.typ === "okno") {
      eventsRef.current = [
        ...eventsRef.current,
        { type: "window", sezon: k.sezon, tura: k.tura.toUpperCase(), ruchy: k.ruchy },
      ];
      setRynek(losujRynek());
      setRuchy(k.ruchy);
      setKarta(null);
      setLog([]);
      setFaza("przeglad");
    } else if (k.typ === "runda") symulujRunde(k);
    else if (k.typ === "koniecSezonu") setFaza("koniecSezonu");
    else if (k.typ === "werdykt") policzWerdykt();
  }

  function symulujRunde(k) {
    const s = silaKadry(kadra, europa);
    const pkt = Math.round(punktyZaSile(s) / 2);
    if (k.polowa === 1) {
      eventsRef.current = [...eventsRef.current, { type: "half", sezon: k.sezon, polowa: 1, pkt }];
      setPolowa1(pkt);
      setTabela(tabelaSezonu(pkt, klub.krotko));
      setFaza("polSezonu");
      return;
    }
    const razem = polowa1 + pkt;
    const tab = tabelaSezonu(razem, klub.krotko);
    const miejsce = tab.findIndex((r) => r.ja) + 1;
    const puchar = ambientFloat() < Math.max(0.08, (s - 60) / 60);
    const mistrz = miejsce === 1;
    const doEuropy = miejsce <= 3 || puchar;

    const place = placeRazem(kadra);
    const przychod = PRZYCHOD_BAZOWY + (19 - miejsce) * 0.22;
    const zPucharow = (puchar ? 1.4 : 0) + (europa ? (ambientFloat() < 0.45 ? 3.6 : 0.6) : 0);
    const bilans = zaokr(przychod + zPucharow - (place + KOSZTY_STALE), 2);

    const { kadra: nowa, emeryci } = starzenieKadry(kadra);
    setKadra(nowa);
    setKasa((kk) => zaokr(kk + bilans, 2));
    setTabela(tab);
    setEuropa(doEuropy);
    setWynikSezonu({
      sezon: k.sezon,
      pkt: razem,
      miejsce,
      puchar,
      mistrz,
      europa: doEuropy,
      bilans,
      place: zaokr(place, 2),
      zPucharow: zaokr(zPucharow, 2),
      spadek: miejsce >= 17,
      emeryci,
    });
    setHistoria((h) => [
      ...h,
      { sezon: k.sezon, pkt: razem, miejsce, puchar, mistrz, spadek: miejsce >= 17 },
    ]);
    eventsRef.current = [
      ...eventsRef.current,
      {
        type: "season",
        sezon: k.sezon,
        miejsce,
        pkt: razem,
        bilans,
        place: zaokr(place, 2),
        puchar,
        europa: doEuropy,
        emeryci: emeryci.length,
      },
    ];
    setFaza("koniecSezonu");
  }

  /* ---------- werdykt ---------- */
  function policzWerdykt() {
    const werdykt = computeVerdict(getAmbientRng(), historia, kasa, poziom.handicapKadencja);
    eventsRef.current = [
      ...eventsRef.current,
      { type: "verdict", ocena: werdykt.ocena, tytul: werdykt.tytul },
    ];
    setWerdykt(werdykt);
    setFaza("werdykt");
  }

  /* ---------- epilog ---------- */
  function uruchomEpilog() {
    const result = runEpilogue(getAmbientRng(), {
      kadra,
      kasa,
      europa,
      klub,
      historia,
      odrzuceni,
      handicapDziedzictwo: poziom.handicapDziedzictwo,
    });

    result.pages.forEach((s) => {
      eventsRef.current = [
        ...eventsRef.current,
        {
          type: "epilogue",
          nr: s.nr,
          miejsce: s.miejsce,
          pkt: s.pkt,
          naglowki: s.naglowki.map((x) => x.kind),
        },
      ];
    });

    if (result.secondChance) {
      setDrugaSzansa(result.secondChance.text);
      eventsRef.current = [
        ...eventsRef.current,
        { type: "secondChance", ceiling: result.secondChance.ceiling },
      ];
    }

    eventsRef.current = [
      ...eventsRef.current,
      {
        type: "end",
        dziedzictwo: result.legacy.dziedzictwo,
        kasa: result.legacy.kasa,
        tytul: result.legacy.tytul,
        nastepny: result.legacy.nastepny,
      },
    ];

    setEpilog(result.pages);
    setEpilogIdx(0);
    setFinalne(result.legacy);
    setFaza("epilog");
  }

  /* ============================ WIDOKI ============================ */

  const Linia = ({ z, glowna }) => {
    const p = potencjal(z);
    if (z.brak) {
      return (
        <>
          <div className="glowny">
            <span className="pot pot-n">·</span>—
          </div>
          <div className="brak">brak zawodnika</div>
        </>
      );
    }
    return (
      <div className={glowna ? "glowny" : "rez"}>
        <span className={`pot ${p.klasa}`}>{p.znak}</span>
        {z.ovr}
        <span className="wiek">{z.wiek}</span>
      </div>
    );
  };

  const Kafelek = ({ z, rezerwy, pokazRezerwy, hl }) => (
    <div className={`dd-kaf ${kolorOvr(z.ovr)}${hl ? " hl" : ""}`}>
      <div className="p">
        {z.poz}
        {z.moj ? "•" : ""}
      </div>
      <Linia z={z} glowna />
      {pokazRezerwy &&
        (rezerwy.length > 0 ? (
          rezerwy.map((r) => <Linia key={r.id} z={r} />)
        ) : (
          <div className="brak">brak zmiennika</div>
        ))}
    </div>
  );

  const Siatka = ({ k, podswietl }) => {
    const xi = xiWKolejnosci(k);
    const rez = rezerwowi(k);
    const ostatni = {};
    xi.forEach((z, i) => {
      ostatni[z.poz] = i;
    });
    return (
      <div className="dd-siatka">
        {xi.map((z, i) => (
          <Kafelek
            key={z.id + i}
            z={z}
            hl={podswietl === z.poz}
            pokazRezerwy={ostatni[z.poz] === i}
            rezerwy={rez.filter((r) => r.poz === z.poz)}
          />
        ))}
      </div>
    );
  };

  const Hud = () => {
    const p = prognozaRoczna(kadra, europa);
    return (
      <div className="dd-hud">
        <div>
          KASA<b>{pl(kasa)}</b>
        </div>
        <div>
          PŁACE/ROK
          <b>
            {pl(placeRazem(kadra))} <span className="sr">(Ø {pl(placaSrednia(kadra))})</span>
          </b>
        </div>
        <div>
          PROGNOZA
          <b className={p < 0 ? "min" : "plus"}>
            {znak(p)}
            {pl(p)}
          </b>
        </div>
        <div style={{ flex: "0 0 46px", textAlign: "right" }}>
          RUCHY<b>{ruchy}</b>
        </div>
      </div>
    );
  };

  const Rynek = () => (
    <div className="dd-rynek">
      {TYPY.map((t) => {
        const o = RYNEK_OPIS[rynek[t.kod]];
        return (
          <div key={t.kod} className="dd-rk">
            <div className="dd-mini">{t.kod}</div>
            <span className={o.klasa}>{o.znak}</span>
          </div>
        );
      })}
    </div>
  );

  const Restart = () =>
    pytamRestart ? (
      <>
        <button
          className="dd-restart"
          style={{ color: "#ff5757", borderColor: "#40202c" }}
          data-dd-action="restart-tak"
          onClick={() => setFaza("wybor")}
        >
          Tak, porzuć tę karierę
        </button>
        <button
          className="dd-restart"
          data-dd-action="restart-nie"
          onClick={() => setPytamRestart(false)}
        >
          Nie, wracam do gry
        </button>
      </>
    ) : (
      <button
        className="dd-restart"
        data-dd-action="restart-pytaj"
        onClick={() => setPytamRestart(true)}
      >
        Porzuć karierę i zacznij od nowa
      </button>
    );

  const Pasek = ({ prawa }) => (
    <div className="dd-pasek">
      <span>EKSTRAKLASA 300</span>
      <span>{prawa}</span>
    </div>
  );

  useEffect(() => {
    if (!globalThis.__DD_TEST__) return;
    globalThis.__DD_DEBUG__ = {
      state: {
        faza,
        seed,
        poziom,
        klub,
        krok,
        ruchy,
        kasa,
        kadra,
        karta,
        rynek,
        wynikSezonu,
        werdykt,
        epilog,
        epilogIdx,
        finalne,
        drugaSzansa,
        historia,
        odrzuceni,
        przeciagniecia,
      },
      actions: akcjeRef.current,
      events: eventsRef.current,
    };
  });

  let widok = null;

  if (faza === "start") {
    widok = (
      <>
        <Pasek prawa="P.300" />
        <div className="dd-wrap">
          <div style={{ margin: "26px 0 6px" }}>
            <div className="dd-mini">PROTOTYP v7</div>
            <div className="dd-duza" style={{ lineHeight: 1.05, fontSize: 38 }}>
              DEADLINE
              <br />
              DAY
            </div>
          </div>
          <div className="dd-box" style={{ marginTop: 16 }}>
            <p style={{ margin: 0 }}>Jesteś dyrektorem sportowym klubu Ekstraklasy.</p>
            <p style={{ margin: "10px 0 0" }} className="dd-sza">
              Osiem ruchów w pierwszym oknie, potem po dwa. Pięć sezonów pod Twoją kontrolą, ocena
              kadencji, a potem pięć sezonów, na które nie masz już wpływu. Każdy zawodnik kosztuje
              nie tylko odstępne, ale i pensję co roku.
            </p>
          </div>
          <button
            className="dd-btn pas"
            data-dd-action="timer-toggle"
            onClick={() => setTimerWl(!timerWl)}
          >
            Zegar: {timerWl ? "włączony" : "wyłączony"}
          </button>
          <button className="dd-btn tak" data-dd-action="start" onClick={() => setFaza("wybor")}>
            Zaczynamy
          </button>
        </div>
      </>
    );
  }

  if (faza === "wybor") {
    widok = (
      <>
        <Pasek prawa="WYBÓR KLUBU" />
        <div className="dd-wrap">
          <div className="dd-h">Jaką posadę bierzesz</div>
          <div className="dd-mini" style={{ marginBottom: 4 }}>
            Klub zostanie wylosowany z wybranej puli. Poprzeczka jest ustawiona osobno dla każdego
            poziomu — mistrzostwo z Puszczą waży więcej niż mistrzostwo z Legią.
          </div>
          {POZIOMY.map((p) => (
            <button
              key={p.id}
              className={`dd-poziom p-${p.id}`}
              data-dd-action={`poziom:${p.id}`}
              onClick={() => startZPoziomem(p)}
            >
              <div className="tyt">{p.nazwa}</div>
              <div className="op">{p.opis}</div>
              <div className="op dd-sza">Pula: {p.kluby.map((k) => k.krotko).join(", ")}</div>
            </button>
          ))}
          <button className="dd-btn pas" data-dd-action="wstecz" onClick={() => setFaza("start")}>
            Wróć
          </button>
        </div>
      </>
    );
  }

  if (faza === "przeglad") {
    const k = kroki[krok];
    const p = prognozaRoczna(kadra, europa);
    const miejsce = oczekiwaneMiejsce(kadra, europa);
    widok = (
      <>
        <Pasek prawa={`SEZON ${k.sezon} · ${k.tura === "lato" ? "LATO" : "ZIMA"}`} />
        <div className="dd-wrap">
          <Hud />
          <div className="dd-h">
            {klub.nazwa}{" "}
            <span
              className={
                poziom.id === "latwy" ? "dd-zie" : poziom.id === "sredni" ? "dd-zol" : "dd-cze"
              }
            >
              · {poziom.nazwa}
            </span>
          </div>
          <Siatka k={kadra} podswietl={null} />
          <div className="dd-mini" style={{ marginTop: 6, lineHeight: 1.6 }}>
            Duża liczba: podstawowy, szare pod spodem: zmiennicy. Po lewej{" "}
            <span className="pot-w">▲</span> rośnie / <span className="pot-r">=</span> szczyt /{" "}
            <span className="pot-s">▼</span> spada, po prawej wiek.
          </div>

          <div className="dd-h">Prognoza na koniec roku</div>
          <div className="dd-box" style={{ padding: 10 }}>
            <div className="dd-fin">
              <span>Przewidywane miejsce</span>
              <span className="dd-zol">{miejsce}.</span>
            </div>
            <div className="dd-fin">
              <span>Przychód z ligi</span>
              <span>{pl(PRZYCHOD_BAZOWY + (19 - miejsce) * 0.22)} mln</span>
            </div>
            <div className="dd-fin">
              <span>Płace (Ø {pl(placaSrednia(kadra))})</span>
              <span className="dd-cze">−{pl(placeRazem(kadra))} mln</span>
            </div>
            <div className="dd-fin">
              <span>Koszty stałe</span>
              <span className="dd-cze">−{pl(KOSZTY_STALE)} mln</span>
            </div>
            <div className="dd-fin" style={{ borderBottom: 0, fontWeight: 700 }}>
              <span>Wynik</span>
              <span className={p < 0 ? "dd-cze" : "dd-zie"}>
                {znak(p)}
                {pl(p)} mln
              </span>
            </div>
            <div className="dd-mini" style={{ marginTop: 6 }}>
              Bez pieniędzy z pucharów i bez sprzedaży zawodników.
            </div>
          </div>

          <div className="dd-h">Rynek pozycji</div>
          <Rynek />
          <div className="dd-mini" style={{ marginTop: 4 }}>
            <span className="dd-zie">▼</span> podaż, taniej &nbsp;·&nbsp;
            <span className="dd-cze">▲</span> pusto, przyjdą po Twojego
          </div>

          <div className="dd-mini" style={{ marginTop: 16 }}>
            {timerWl ? "Zegar rusza dopiero po otwarciu ofert." : "Zegar wyłączony."}
          </div>
          <button className="dd-btn tak" data-dd-action="oferty" onClick={otworzOferty}>
            Otwórz oferty ({ruchy})
          </button>
          <Restart />
        </div>
      </>
    );
  }

  if (faza === "okno" && karta) {
    const k = kroki[krok];
    const n = przeciagniecia;
    const sprzedaz = karta.typ === "SPRZEDAZ";
    const cena = sprzedaz ? cenaSprzedazy(karta, n) : cenaKupna(karta, n);
    const stac = sprzedaz || cena <= kasa;
    const r = karta.raport;
    const w = placaBazowa(karta.zawodnik.ovr) * (sprzedaz ? 1 : 1 + KARA_PLACA * n);
    const kasaPo = zaokr(sprzedaz ? kasa + cena : kasa - cena, 2);
    const kadraPo = sprzedaz
      ? kadra.filter((z) => z.id !== karta.zawodnik.id)
      : [...kadra, { ...karta.zawodnik, mnoznikPlacy: 1 + KARA_PLACA * n }];
    const prognozaPo = prognozaRoczna(kadraPo, europa);

    widok = (
      <>
        <Pasek prawa={`SEZON ${k.sezon} · ${k.tura === "lato" ? "LATO" : "ZIMA"}`} />
        <div className="dd-wrap">
          <Hud />
          <div className="dd-h">Kadra</div>
          <Siatka k={kadra} podswietl={karta.zawodnik.poz} />

          <div className="dd-h">
            {sprzedaz
              ? "Oferta za Twojego zawodnika"
              : karta.typ === "PANIC"
                ? "Panika"
                : karta.typ === "WOLNY"
                  ? "Wolny zawodnik"
                  : "Dostępny"}
            {" · "}
            {karta.zawodnik.poz}
          </div>
          <div className="dd-box">
            <div style={{ fontSize: 18, fontWeight: 700 }} className="dd-cyj">
              {karta.zawodnik.nazwa}
            </div>
            <div className="dd-mini" style={{ marginTop: 4 }}>
              {karta.tekst}
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap" }}>
              <span>
                Ocena <b className="dd-zol">{karta.zawodnik.ovr}</b>
              </span>
              <span className="dd-sza">Skaut: {karta.zawodnik.etykieta}</span>
              <span className={RYNEK_OPIS[rynek[karta.zawodnik.poz]].klasa}>
                Rynek: {RYNEK_OPIS[rynek[karta.zawodnik.poz]].znak}
              </span>
            </div>

            <div className="dd-raport">
              {r.linie.map((x, i) => (
                <div key={i} className="stat">
                  {x}
                </div>
              ))}
              <div className="dd-mini" style={{ marginTop: 6 }}>
                Próba: {r.minuty} min{r.maleProby ? " — mało materiału, dane niepewne" : ""}
              </div>
            </div>

            <div className="dd-raport">
              <div className="stat">
                {sprzedaz ? "Wpływ " : "Odstępne "}
                <b className={sprzedaz ? "dd-zie" : "dd-cze"}>
                  {sprzedaz ? "+" : "−"}
                  {pl(cena)} mln
                </b>
                {" → kasa "}
                <b className={kasaPo < 0 ? "dd-cze" : "dd-zol"}>{pl(kasaPo)} mln</b>
              </div>
              <div className="stat">
                {sprzedaz ? `Zdejmie z płac ${pl(w)} mln/rok` : `Płaca ${pl(w)} mln/rok`}
                {" → prognoza "}
                <b className={prognozaPo < 0 ? "dd-cze" : "dd-zie"}>
                  {znak(prognozaPo)}
                  {pl(prognozaPo)} mln
                </b>
              </div>
              {n > 0 && (
                <div className="stat dd-fiolet">
                  Negocjacje przeciągnięte {n}× —{" "}
                  {sprzedaz
                    ? `kwota niższa o ${Math.round(KARA_SPRZEDAZ * n * 100)}%`
                    : `odstępne wyższe o ${Math.round(KARA_CENA * n * 100)}%, pensja o ${Math.round(KARA_PLACA * n * 100)}%`}
                </div>
              )}
            </div>

            {timerWl && (
              <>
                <div className={`dd-timer${czas <= 5 ? " napiete" : ""}`}>
                  <i style={{ width: `${(czas / maxCzas) * 100}%` }} />
                </div>
                <div className="dd-mini" style={{ marginTop: 4 }}>
                  {czas} s do decyzji
                </div>
              </>
            )}
          </div>

          <button
            className="dd-btn tak"
            data-dd-action="bierz"
            disabled={!stac}
            onClick={() => decyzja("tak")}
          >
            {sprzedaz ? `Sprzedaj za ${pl(cena)} mln` : `Bierz za ${pl(cena)} mln`}
          </button>
          <button className="dd-btn targ" data-dd-action="targ" onClick={() => decyzja("targ")}>
            Targuj się
            <span className="sub">Losowo: taniej, bez zmian albo zawodnik przepada</span>
          </button>
          {timerWl && (
            <button
              className="dd-btn czas"
              data-dd-action="czas"
              onClick={przeciagnij}
              disabled={przeciagniecia >= MAX_PRZECIAGNIEC}
            >
              Przeciągnij negocjacje
              <span className="sub">
                {przeciagniecia >= MAX_PRZECIAGNIEC
                  ? "Limit wykorzystany — druga strona traci cierpliwość"
                  : `+${CZAS_DODATKOWY} s, ale ${sprzedaz ? "kwota −12%" : "odstępne +12% i pensja +8%"} · ${przeciagniecia}/${MAX_PRZECIAGNIEC}`}
              </span>
            </button>
          )}
          <button className="dd-btn pas" data-dd-action="pas" onClick={() => decyzja("pas")}>
            Pas
          </button>

          {log.length > 0 && (
            <div style={{ marginTop: 14 }}>
              {log.map((x, i) => (
                <div key={i} className="dd-mini">
                  › {x}
                </div>
              ))}
            </div>
          )}
          <Restart />
        </div>
      </>
    );
  }

  if (faza === "polSezonu" && tabela) {
    const k = kroki[krok];
    widok = (
      <>
        <Pasek prawa={`SEZON ${k.sezon} · PÓŁMETEK`} />
        <div className="dd-wrap">
          <div className="dd-h">Tabela po rundzie jesiennej</div>
          <table className="dd-tab">
            <tbody>
              {tabela.map((r, i) => (
                <tr key={i} className={r.ja ? "ja" : ""}>
                  <td style={{ width: 24 }}>{i + 1}</td>
                  <td>{r.nazwa}</td>
                  <td style={{ textAlign: "right", width: 32 }}>{r.pkt}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="dd-btn tak" data-dd-action="dalej" onClick={dalejKrok}>
            Do okna zimowego
          </button>
          <Restart />
        </div>
      </>
    );
  }

  if (faza === "koniecSezonu" && wynikSezonu) {
    const w = wynikSezonu;
    widok = (
      <>
        <Pasek prawa={`SEZON ${w.sezon} · KONIEC`} />
        <div className="dd-wrap">
          <div className="dd-h">Wynik sezonu</div>
          <div className="dd-box">
            <div className="dd-duza">{w.miejsce}. miejsce</div>
            <div className="dd-mini">{w.pkt} punktów</div>
            <div style={{ marginTop: 10 }}>
              {w.mistrz && <div className="dd-zie">Mistrzostwo Polski</div>}
              {w.puchar && <div className="dd-zie">Puchar Polski</div>}
              {w.europa && !w.mistrz && (
                <div className="dd-cyj">Kwalifikacja do europejskich pucharów</div>
              )}
              {w.spadek && <div className="dd-cze">Spadek z Ekstraklasy</div>}
            </div>
            <div style={{ marginTop: 10 }}>
              <div className="dd-fin">
                <span>Płace</span>
                <span className="dd-cze">−{pl(w.place)} mln</span>
              </div>
              <div className="dd-fin">
                <span>Wpływy z pucharów</span>
                <span className={w.zPucharow > 0 ? "dd-zie" : "dd-sza"}>
                  +{pl(w.zPucharow)} mln
                </span>
              </div>
              <div className="dd-fin" style={{ borderBottom: 0, fontWeight: 700 }}>
                <span>Bilans</span>
                <span className={w.bilans >= 0 ? "dd-zie" : "dd-cze"}>
                  {znak(w.bilans)}
                  {pl(w.bilans)} mln
                </span>
              </div>
            </div>
            {w.emeryci?.length > 0 && (
              <div className="dd-mini" style={{ marginTop: 8 }}>
                Karierę kończą: {w.emeryci.map((z) => z.nazwa).join(", ")}
              </div>
            )}
          </div>
          <div className="dd-h">Kadra po sezonie</div>
          <Siatka k={kadra} podswietl={null} />
          <button className="dd-btn tak" data-dd-action="dalej" onClick={dalejKrok}>
            Dalej
          </button>
          <Restart />
        </div>
      </>
    );
  }

  if (faza === "werdykt" && werdykt) {
    widok = (
      <>
        <Pasek prawa="OCENA KADENCJI" />
        <div className="dd-wrap">
          <div className="dd-h">
            {klub.nazwa} — po {SEZONY_GRY} sezonach
          </div>
          <div className="dd-box">
            <div className="dd-duza" style={{ fontSize: 24 }}>
              {werdykt.tytul}
            </div>
            <div className="dd-mini" style={{ marginTop: 8 }}>
              {werdykt.opis}
            </div>
          </div>
          <table className="dd-tab">
            <tbody>
              {historia.map((h, i) => (
                <tr key={i}>
                  <td>Sezon {h.sezon}</td>
                  <td style={{ textAlign: "right" }}>
                    {h.miejsce}. m. · {h.pkt} pkt
                  </td>
                </tr>
              ))}
              <tr>
                <td>Kasa w klubie</td>
                <td style={{ textAlign: "right" }}>{pl(kasa)} mln</td>
              </tr>
              <tr>
                <td>Płace po Tobie</td>
                <td style={{ textAlign: "right" }}>
                  {pl(placeRazem(kadra))} mln/rok (Ø {pl(placaSrednia(kadra))})
                </td>
              </tr>
            </tbody>
          </table>
          <div className="dd-mini" style={{ marginTop: 14 }}>
            To była ocena Twojego szefa. Prawdziwy wynik jest dalej.
          </div>
          <button className="dd-btn tak" data-dd-action="epilog" onClick={uruchomEpilog}>
            Przesymuluj kolejne {SEZONY_EPILOGU} sezonów
          </button>
        </div>
      </>
    );
  }

  if (faza === "epilog" && epilog[epilogIdx]) {
    const s = epilog[epilogIdx];
    widok = (
      <>
        <Pasek prawa={`SEZON ${s.nr} · Z BOKU`} />
        <div className="dd-wrap">
          <div className="dd-h">
            {klub.nazwa} — sezon {s.nr}
          </div>
          <div className="dd-box">
            <div className="dd-duza" style={{ fontSize: 26 }}>
              {s.miejsce}. miejsce
            </div>
            <div className="dd-mini">{s.pkt} punktów</div>
          </div>
          {s.naglowki.map((n) => (
            <div key={n.kind} className="dd-news">
              {n.text}
            </div>
          ))}
          <button
            className="dd-btn tak"
            data-dd-action="dalej"
            onClick={() =>
              epilogIdx < epilog.length - 1 ? setEpilogIdx(epilogIdx + 1) : setFaza("final")
            }
          >
            {epilogIdx < epilog.length - 1 ? "Następny sezon" : "Podsumowanie"}
          </button>
        </div>
      </>
    );
  }

  if (faza === "final" && finalne) {
    widok = (
      <>
        <Pasek prawa="DZIEDZICTWO" />
        <div className="dd-wrap">
          <div className="dd-h">
            {klub.nazwa}{" "}
            <span
              className={
                poziom.id === "latwy" ? "dd-zie" : poziom.id === "sredni" ? "dd-zol" : "dd-cze"
              }
            >
              · {poziom.nazwa}
            </span>
          </div>
          <div className="dd-box">
            <div className="dd-duza">{finalne.dziedzictwo}</div>
            <div
              className="dd-cyj"
              style={{ fontWeight: 700, letterSpacing: ".1em", marginTop: 4 }}
            >
              {finalne.tytul}
            </div>
            <div className="dd-mini" style={{ marginTop: 8 }}>
              Kasa klubu po dziesięciu latach: {pl(finalne.kasa)} mln
            </div>
            {finalne.nastepny && (
              <div className="dd-mini" style={{ marginTop: 4 }}>
                Zabrakło {finalne.nastepny - finalne.dziedzictwo} pkt do kolejnego progu.
              </div>
            )}
          </div>

          <div className="dd-h">Twoje transfery — odkryte karty</div>
          {moje.length === 0 && <div className="dd-mini">Nie kupiłeś nikogo.</div>}
          {moje.map((z, i) => (
            <div key={i} className="dd-box" style={{ padding: 8 }}>
              <div>
                <b className="dd-cyj">{z.nazwa}</b> <span className="dd-sza">{z.poz}</span>
              </div>
              <div className="dd-mini">
                Kupiony za {z.cenaZakupu ?? 0} mln · ocena {z.ovr} · skaut: {z.etykieta}
                {z.mnoznikPlacy > 1
                  ? ` · pensja podbita o ${Math.round((z.mnoznikPlacy - 1) * 100)}%`
                  : ""}
              </div>
              <div className={z.sufit >= 78 ? "dd-zie" : z.sufit >= 70 ? "dd-zol" : "dd-cze"}>
                Ukryty sufit: {z.sufit}
              </div>
            </div>
          ))}

          {drugaSzansa && (
            <>
              <div className="dd-h">Ten, któremu odmówiłeś</div>
              <div className="dd-news dd-zol">{drugaSzansa}</div>
            </>
          )}

          <button
            className="dd-btn tak"
            data-dd-action="znowu"
            onClick={() => startZPoziomem(poziom)}
          >
            Jeszcze raz — {poziom.nazwa}
          </button>
          <button className="dd-btn" data-dd-action="zmien-poziom" onClick={() => setFaza("wybor")}>
            Zmień poziom
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="dd-root">
      <style>{STYL}</style>
      {widok}
    </div>
  );
}
