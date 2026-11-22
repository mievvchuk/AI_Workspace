import { describe, expect, it } from "vitest";
import { formatDuration, formatTokens, plural } from "./utils";

describe("utils", () => {
  it("pluralizes Ukrainian nouns", () => {
    const f = (n: number) => plural(n, "файл", "файли", "файлів");
    expect([1, 2, 5, 11, 21, 22, 25].map(f)).toEqual(["файл", "файли", "файлів", "файлів", "файл", "файли", "файлів"]);
  });
  it("formats durations and tokens", () => {
    expect(formatDuration(420)).toBe("420 мс");
    expect(formatDuration(2500)).toBe("2.5 с");
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(500_000)).toBe("500k");
  });
});
