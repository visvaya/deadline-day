import type { ForeignClub } from "./types";

/**
 * The foreign buyers of a SPRZEDAZ card (buyer-capacity spec §4.2). Tiers are
 * estimates from revenue, league status in 2026/27 and documented purchases
 * from the Ekstraklasa; every figure and its source is in
 * docs/decisions/foreign-buyer-tiers.md, which the rationale points to.
 */
export const FOREIGN_CLUBS: readonly ForeignClub[] = [
  {
    clubId: "brighton",
    name: "Brighton",
    tier: "legendarny",
    topFlight: true,
    provenance: "estimated",
    rationale:
      "Revenue about 260 mln EUR excl. transfers (2023/24); bought Moder and Kozlowski from the Ekstraklasa. See foreign-buyer-tiers.md.",
  },
  {
    clubId: "borussia-dortmund",
    name: "Borussia Dortmund",
    tier: "legendarny",
    topFlight: true,
    provenance: "estimated",
    rationale:
      "Revenue 509 mln EUR excl. transfers (2023/24), by far the highest in the pool. See foreign-buyer-tiers.md.",
  },
  {
    clubId: "benfica",
    name: "Benfica",
    tier: "legendarny",
    topFlight: true,
    provenance: "estimated",
    rationale:
      "Operating income about 179 mln EUR excl. transfers (2023/24), a recognisable European giant. See foreign-buyer-tiers.md.",
  },
  {
    clubId: "porto",
    name: "Porto",
    tier: "legendarny",
    topFlight: true,
    provenance: "estimated",
    rationale:
      "Operating revenue about 174 mln EUR (2023/24); owner decision keeps it legendarny for name recognition over Wolfsburg. See foreign-buyer-tiers.md.",
  },
  {
    clubId: "ajax",
    name: "Ajax",
    tier: "bardzo wysoki",
    topFlight: true,
    provenance: "estimated",
    rationale:
      "Net revenue 152 mln EUR (2023/24), confirmed by the club's own annual figures. See foreign-buyer-tiers.md.",
  },
  {
    clubId: "psv",
    name: "PSV",
    tier: "bardzo wysoki",
    topFlight: true,
    provenance: "estimated",
    rationale:
      "Revenue about 152 mln EUR (2023/24), a title-winning season for the club. See foreign-buyer-tiers.md.",
  },
  {
    clubId: "feyenoord",
    name: "Feyenoord",
    tier: "bardzo wysoki",
    topFlight: true,
    provenance: "estimated",
    rationale:
      "Revenue 126 mln EUR incl. transfers (2023/24), boosted by a Champions League return. See foreign-buyer-tiers.md.",
  },
  {
    clubId: "celtic",
    name: "Celtic",
    tier: "bardzo wysoki",
    topFlight: true,
    provenance: "estimated",
    rationale:
      "Revenue about 146 mln EUR excl. transfers (2023/24); bought Nawrocki from Legia. See foreign-buyer-tiers.md.",
  },
  {
    clubId: "club-brugge",
    name: "Brugge",
    tier: "bardzo wysoki",
    topFlight: true,
    provenance: "estimated",
    rationale:
      "Revenue about 165-176 mln EUR (2023/24); bought Skoras from Lech. See foreign-buyer-tiers.md.",
  },
  {
    clubId: "red-bull-salzburg",
    name: "Salzburg",
    tier: "bardzo wysoki",
    topFlight: true,
    provenance: "estimated",
    rationale:
      "Revenue about 183 mln EUR (2023/24); bought Piatkowski from Rakow. See foreign-buyer-tiers.md.",
  },
  {
    clubId: "rc-lens",
    name: "Lens",
    tier: "bardzo wysoki",
    topFlight: true,
    provenance: "estimated",
    rationale:
      "Record revenue about 145 mln EUR excl. transfers (2023/24) from a Champions League run. See foreign-buyer-tiers.md.",
  },
  {
    clubId: "besiktas",
    name: "Beşiktaş",
    tier: "bardzo wysoki",
    topFlight: true,
    provenance: "estimated",
    rationale:
      "No comparable euro revenue found; tier rests on documented buys of Muci, Kokcu and Trossard. See foreign-buyer-tiers.md.",
  },
  {
    clubId: "bologna",
    name: "Bologna",
    tier: "wysoki",
    topFlight: true,
    provenance: "estimated",
    rationale:
      "Revenue about 104 mln EUR excl. transfers (2023/24); loan-to-buy of Urbanski from Lechia. See foreign-buyer-tiers.md.",
  },
  {
    clubId: "udinese",
    name: "Udinese",
    tier: "wysoki",
    topFlight: true,
    provenance: "estimated",
    rationale:
      "Value of production about 120 mln EUR incl. transfers (2023/24). See foreign-buyer-tiers.md.",
  },
  {
    clubId: "lecce",
    name: "Lecce",
    tier: "wysoki",
    topFlight: true,
    provenance: "estimated",
    rationale:
      "Revenue about 85 mln EUR incl. transfers (2023/24); bought Marchwinski from Lech. See foreign-buyer-tiers.md.",
  },
  {
    clubId: "genoa",
    name: "Genoa",
    tier: "wysoki",
    topFlight: true,
    provenance: "estimated",
    rationale:
      "Consolidated value of production about 121 mln EUR incl. transfers (2023). See foreign-buyer-tiers.md.",
  },
  {
    clubId: "augsburg",
    name: "Augsburg",
    tier: "wysoki",
    topFlight: true,
    provenance: "estimated",
    rationale:
      "Record revenue about 109 mln EUR (2023/24), first time above 100 mln. See foreign-buyer-tiers.md.",
  },
  {
    clubId: "mainz-05",
    name: "Mainz",
    tier: "wysoki",
    topFlight: true,
    provenance: "estimated",
    rationale:
      "Revenue about 122 mln EUR (2023/24), per the club's own financial statement. See foreign-buyer-tiers.md.",
  },
  {
    clubId: "stade-rennais",
    name: "Rennes",
    tier: "wysoki",
    topFlight: true,
    provenance: "estimated",
    rationale:
      "No clean 2023/24 revenue figure found; estimated at 100-120 mln EUR from adjacent DNCG figures. See foreign-buyer-tiers.md.",
  },
  {
    clubId: "krc-genk",
    name: "Genk",
    tier: "wysoki",
    topFlight: true,
    provenance: "estimated",
    rationale:
      "Record turnover about 93 mln EUR incl. transfers (2023/24), no Ekstraklasa buy on record. See foreign-buyer-tiers.md.",
  },
  {
    clubId: "fc-kobenhavn",
    name: "Kopenhaga",
    tier: "wysoki",
    topFlight: true,
    provenance: "estimated",
    rationale:
      "Football division net revenue about 124 mln EUR (2023), converted from 925 mln DKK. See foreign-buyer-tiers.md.",
  },
  {
    clubId: "norwich-city",
    name: "Norwich",
    tier: "wysoki",
    topFlight: false,
    provenance: "estimated",
    rationale:
      "Championship club in 2026/27, capped at wysoki despite an 11 mln EUR buy of Crnac from Rakow. See foreign-buyer-tiers.md.",
  },
  {
    clubId: "cagliari",
    name: "Cagliari",
    tier: "wysoki",
    topFlight: true,
    provenance: "estimated",
    rationale:
      "Revenue about 79 mln EUR (2023/24); bought Walukiewicz from Pogon in 2019. See foreign-buyer-tiers.md.",
  },
  {
    clubId: "vfl-wolfsburg",
    name: "Wolfsburg",
    tier: "wysoki",
    topFlight: false,
    provenance: "estimated",
    rationale:
      "Relegated to 2. Bundesliga in 2026, capped at wysoki despite Bundesliga-scale revenue and buys of Kaminski and Bialek. See foreign-buyer-tiers.md.",
  },
];

/** Display names for the texts that only NAME a foreign club (epilogue
 * rumour, verdict line). Ordered by clubId so that reordering the literal
 * above cannot change which club a given draw names. */
export const FOREIGN_CLUB_NAMES: readonly string[] = [...FOREIGN_CLUBS]
  .sort((a, b) => (a.clubId < b.clubId ? -1 : a.clubId > b.clubId ? 1 : 0))
  .map((c) => c.name);
