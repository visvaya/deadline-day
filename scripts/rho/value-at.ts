/**
 * Checked read of a numeric array element for the rho estimator's hot loops.
 *
 * Every index there is derived from the layout that sized the array, so a
 * missing element is a bug upstream: this throws instead of letting
 * `undefined` turn into NaN inside a likelihood. Kept separate from
 * `at()` in src/logic/invariant.ts because it takes typed arrays and builds
 * no message string on the success path.
 */
export const valueAt = (values: ArrayLike<number>, index: number): number => {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`invariant violated: numeric index ${index} out of ${values.length}`);
  }
  return value;
};
