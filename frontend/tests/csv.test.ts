import { describe, expect, it } from "vitest";

import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("quotes separators, keeps negative numbers, blanks nulls and defuses formulas", () => {
    const out = toCsv([{ a: 'say "hi", ok', b: -4.5, c: null as string | null, d: "=1+1" }], ["a", "b", "c", "d"]);
    expect(out).toBe('a,b,c,d\r\n"say ""hi"", ok",-4.5,,\'=1+1');
  });
});
