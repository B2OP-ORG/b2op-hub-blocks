import { describe, expect, it } from "vitest";
import { fmtBytes, fmtSpeed } from "../src/ui/TransferOverlay";

describe("transfer size formatting", () => {
  it("picks B / kB / MB by magnitude", () => {
    expect(fmtBytes(0)).toBe("0 B");
    expect(fmtBytes(1023)).toBe("1023 B");
    expect(fmtBytes(1024)).toBe("1.0 kB");
    expect(fmtBytes(12_595)).toBe("12.3 kB");
    expect(fmtBytes(1_048_576)).toBe("1.00 MB");
    expect(fmtBytes(5_400_000)).toBe("5.15 MB");
    expect(fmtSpeed(2048)).toBe("2.0 kB/s");
  });
});
