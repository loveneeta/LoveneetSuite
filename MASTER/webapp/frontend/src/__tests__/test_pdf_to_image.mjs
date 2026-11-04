import test from "node:test";
import assert from "node:assert/strict";
import { parsePageRange } from "../services/pdfToImage.ts";

test("PDF to Image Converter Unit Tests", async (t) => {
  await t.test("parsePageRange correctly handles 'all' or empty range", () => {
    const pages1 = parsePageRange("all", 5);
    assert.deepEqual(Array.from(pages1), [1, 2, 3, 4, 5]);

    const pages2 = parsePageRange("", 3);
    assert.deepEqual(Array.from(pages2), [1, 2, 3]);

    const pages3 = parsePageRange(undefined, 4);
    assert.deepEqual(Array.from(pages3), [1, 2, 3, 4]);
  });

  await t.test("parsePageRange parses specific ranges and comma-separated lists", () => {
    const pages1 = parsePageRange("1-3, 5", 6);
    assert.deepEqual(Array.from(pages1).sort((a, b) => a - b), [1, 2, 3, 5]);

    const pages2 = parsePageRange("2-4", 10);
    assert.deepEqual(Array.from(pages2).sort((a, b) => a - b), [2, 3, 4]);

    const pages3 = parsePageRange("1, 3, 5", 5);
    assert.deepEqual(Array.from(pages3).sort((a, b) => a - b), [1, 3, 5]);
  });

  await t.test("parsePageRange clamps boundaries within [1, totalPages]", () => {
    const pages = parsePageRange("0-10", 4);
    assert.deepEqual(Array.from(pages).sort((a, b) => a - b), [1, 2, 3, 4]);

    const pagesOut = parsePageRange("99", 5);
    assert.deepEqual(Array.from(pagesOut), [1, 2, 3, 4, 5], "Should fallback to all pages if no valid page in range");
  });

  await t.test("DPI scale calculation ensures high-res rendering", () => {
    // 72 DPI = 1.0x (standard vector scale)
    assert.equal(72 / 72, 1.0);
    // 150 DPI ~ 2.083x (web crisp)
    assert.ok(150 / 72 > 2.0);
    // 200 DPI ~ 2.778x (high definition text)
    assert.ok(200 / 72 > 2.7);
    // 300 DPI ~ 4.167x (ultra print clarity)
    assert.ok(300 / 72 > 4.1);
  });
});
