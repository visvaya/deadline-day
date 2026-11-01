/**
 * @vitest-environment jsdom
 */
import { afterEach, expect, test } from "vitest";

import { armMathRandomGuard, disarmMathRandomGuard } from "./setup";

afterEach(() => {
  disarmMathRandomGuard();
});

test("jsdom provides a document", () => {
  expect(document.body).toBeDefined();
});

test("the guard makes Math.random throw once armed", () => {
  armMathRandomGuard();
  // This test deliberately probes the forbidden API after arming its guard.
  // eslint-disable-next-line no-restricted-properties
  expect(() => Math.random()).toThrow("Math.random() called under test");
});

test("disarming restores a working Math.random", () => {
  armMathRandomGuard();
  disarmMathRandomGuard();
  // This test deliberately probes the restored API after disarming its guard.
  // eslint-disable-next-line no-restricted-properties
  expect(typeof Math.random()).toBe("number");
});
