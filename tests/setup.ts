// This helper must retain the real implementation so it can restore the guard.
// eslint-disable-next-line no-restricted-properties
const original = Math.random;

export const armMathRandomGuard = (): void => {
  // Intentional interception: production and fixture code must never assign it.
  // eslint-disable-next-line no-restricted-properties
  Math.random = () => {
    throw new Error(
      "Math.random() called under test. Simulation code must draw from src/logic/rng."
    );
  };
};

export const disarmMathRandomGuard = (): void => {
  // Restore the implementation captured before the guard was armed.
  // eslint-disable-next-line no-restricted-properties
  Math.random = original;
};
