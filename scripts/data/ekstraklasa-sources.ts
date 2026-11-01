/**
 * Where every row of ekstraklasa-results.csv came from.
 *
 * Data without an address of origin is not reviewable, and the CSV is pinned
 * precisely so nobody has to take the aggregates on trust. The pages
 * themselves stay out of the repository: they are large, they are somebody
 * else's, and they are not what a reviewer would read - the CSV is.
 *
 * The file name carries the year the season ENDED, so pol2016.html is 2015/16.
 * The 2025/26 page exists too and is deliberately absent: that season is still
 * being played, and half a season would quietly bias every aggregate below it.
 */
export type EkstraklasaSource = {
  season: string;
  /** File name as `pnpm data:parse-results --in <dir>` expects to find it. */
  file: string;
  url: string;
};

/** The day these pages were downloaded into a local working directory. */
export const EKSTRAKLASA_RETRIEVED = "2026-08-25";

const source = (endYear: number): EkstraklasaSource => ({
  season: `${endYear - 1}/${String(endYear).slice(2)}`,
  file: `pol${endYear}.html`,
  url: `https://www.rsssf.org/tablesp/pol${endYear}.html`,
});

/** Ten completed seasons, oldest first. */
export const EKSTRAKLASA_SOURCES: readonly EkstraklasaSource[] = [
  2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
].map(source);
