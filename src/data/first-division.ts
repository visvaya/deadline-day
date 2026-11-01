/**
 * The first division, as a pool of clubs that can be promoted - never as a
 * division that gets played. See the spec, chapters 3 and 4.3.
 *
 * One strength number rather than the attack/defence pair the snapshot gives
 * top-flight clubs: soccer-rating.com rates overall form only. clubOvr is the
 * geometric mean of the pair, so attack = defence = strength reproduces the
 * level exactly, and the missing asymmetry is an honest "we do not know his
 * shape" rather than an invented one.
 *
 * Already normalised (x0.9989) so the best of these is no better than the
 * weakest top-flight club. Source, mapping and the regression behind it are
 * in the spec's appendix; the screenshots are gitignored, which is why the
 * numbers live here rather than being referenced.
 *
 * `clubId` is the stable join key described in src/data/clubs.ts. Written
 * out rather than slugged for the same reason: a slugifier's own decisions
 * about ł and ę would silently rename a club the day it was tidied. Nothing
 * about the promotion draw reads it - the pool, its order and every strength
 * below are untouched.
 *
 * Polonia Warszawa reads 0.883 rather than the 0.884 the plan drafted: the
 * weakest top-flight club is Radomiak at sqrt(0.93 * 0.84) = 0.88386, so
 * 0.884 would have broken the very invariant the normalisation exists for.
 */
export const FIRST_DIVISION = [
  {
    clubId: "polonia-warszawa",
    name: "Polonia Warszawa",
    shortName: "Polonia W.",
    strength: 0.883,
  },
  { clubId: "ruch-chorzow", name: "Ruch Chorzów", shortName: "Ruch", strength: 0.882 },
  { clubId: "arka-gdynia", name: "Arka Gdynia", shortName: "Arka", strength: 0.867 },
  { clubId: "miedz-legnica", name: "Miedź Legnica", shortName: "Miedź", strength: 0.853 },
  { clubId: "lks-lodz", name: "ŁKS Łódź", shortName: "ŁKS", strength: 0.843 },
  { clubId: "lks-nieciecza", name: "LKS Nieciecza", shortName: "Nieciecza", strength: 0.839 },
  { clubId: "polonia-bytom", name: "Polonia Bytom", shortName: "Polonia B.", strength: 0.828 },
  {
    clubId: "podbeskidzie-bielsko-biala",
    name: "Podbeskidzie Bielsko-Biała",
    shortName: "Podbeskidzie",
    strength: 0.819,
  },
  { clubId: "odra-opole", name: "Odra Opole", shortName: "Odra", strength: 0.801 },
  {
    clubId: "pogon-grodzisk-mazowiecki",
    name: "Pogoń Grodzisk Mazowiecki",
    shortName: "Pogoń G.",
    strength: 0.792,
  },
  { clubId: "stal-mielec", name: "Stal Mielec", shortName: "Stal M.", strength: 0.788 },
  {
    clubId: "puszcza-niepolomice",
    name: "Puszcza Niepołomice",
    shortName: "Puszcza",
    strength: 0.774,
  },
  { clubId: "chrobry-glogow", name: "Chrobry Głogów", shortName: "Chrobry", strength: 0.77 },
  { clubId: "warta-poznan", name: "Warta Poznań", shortName: "Warta", strength: 0.769 },
  { clubId: "unia-skierniewice", name: "Unia Skierniewice", shortName: "Unia", strength: 0.763 },
  { clubId: "lechia-gdansk", name: "Lechia Gdańsk", shortName: "Lechia", strength: 0.742 },
  { clubId: "stal-rzeszow", name: "Stal Rzeszów", shortName: "Stal R.", strength: 0.713 },
  { clubId: "pogon-siedlce", name: "Pogoń Siedlce", shortName: "Pogoń S.", strength: 0.705 },
] as const;
