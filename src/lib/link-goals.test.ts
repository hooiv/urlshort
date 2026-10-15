import { describe, expect, it } from "vitest";
import { evaluateGoal } from "./link-goals";

const s = new Date("2026-01-01T00:00:00Z");
const d = new Date("2026-01-11T00:00:00Z");

describe("evaluateGoal", () => {
  it("on track when pace projects to target", () => {
    const r = evaluateGoal({ target: 100, clicks: 50, startedAt: s, deadline: d, now: new Date("2026-01-06T00:00:00Z") });
    expect(r.status).toBe("on_track");
    expect(r.percent).toBe(50);
    expect(r.requiredPerDay).toBe(10);
  });
  it("behind when pace is too slow", () => {
    expect(evaluateGoal({ target: 100, clicks: 10, startedAt: s, deadline: d, now: new Date("2026-01-06T00:00:00Z") }).status).toBe("behind");
  });
  it("achieved and missed", () => {
    expect(evaluateGoal({ target: 10, clicks: 12, startedAt: s, deadline: d, now: s }).status).toBe("achieved");
    const m = evaluateGoal({ target: 100, clicks: 40, startedAt: s, deadline: d, now: new Date("2026-02-01T00:00:00Z") });
    expect(m.status).toBe("missed");
    expect(m.remaining).toBe(60);
  });
  it("validates input", () => {
    expect(() => evaluateGoal({ target: 0, clicks: 0, startedAt: s, deadline: d })).toThrow();
    expect(() => evaluateGoal({ target: 5, clicks: 0, startedAt: d, deadline: s })).toThrow();
  });
});
