import { describe, expect, it } from "vitest";

import { fmt, fmtDuration, fmtInt, fmtPct } from "@/lib/format";

describe("formatting", () => {
  it("never invents a number for missing values", () => {
    for (const f of [fmt, fmtInt, fmtPct, fmtDuration]) {
      expect(f(null)).toBe("n/a");
      expect(f(undefined)).toBe("n/a");
      expect(f(Number.NaN)).toBe("n/a");
    }
  });

  it("formats numbers", () => {
    expect(fmt(0.87698, 3)).toBe("0.877");
    expect(fmtInt(184995022)).toBe("184,995,022");
    expect(fmtPct(0.9041)).toBe("90.4%");
    expect(fmtDuration(13.6)).toBe("14 s");
    expect(fmtDuration(125)).toBe("2 min 5 s");
  });
});
