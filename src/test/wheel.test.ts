import { describe, expect, it } from "vitest";
import { wheelPans, wheelPixels } from "@/lib/wheel";

const ev = (o: Partial<Parameters<typeof wheelPans>[0]>) => ({
  deltaX: 0,
  deltaY: 0,
  deltaMode: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...o,
});

describe("wheel gestures", () => {
  it("pans on a trackpad / Magic Mouse scroll", () => {
    expect(wheelPans(ev({ deltaX: 12 }))).toBe(true);
    expect(wheelPans(ev({ deltaY: 6, wheelDeltaY: -18 }))).toBe(true);
    expect(wheelPans(ev({ deltaY: 7.5 }))).toBe(true);
  });
  it("zooms on a mouse wheel or a pinch", () => {
    expect(wheelPans(ev({ deltaY: 100, wheelDeltaY: -120 }))).toBe(false);
    expect(wheelPans(ev({ deltaY: 4, wheelDeltaY: -120 }))).toBe(false);
    expect(wheelPans(ev({ deltaY: 3, deltaMode: 1 }))).toBe(false);
    expect(wheelPans(ev({ deltaY: 120 }))).toBe(false);
    expect(wheelPans(ev({ deltaX: 5, deltaY: 3, ctrlKey: true }))).toBe(false);
  });
  it("keeps a gesture panning once it started", () => {
    expect(wheelPans(ev({ deltaY: 120 }), true)).toBe(true);
  });
  it("turns shift + wheel into a sideways scroll", () => {
    expect(wheelPans(ev({ deltaY: 100, shiftKey: true }))).toBe(true);
    expect(wheelPixels(ev({ deltaY: 100, shiftKey: true }))).toEqual({ x: 100, y: 0 });
    expect(wheelPixels(ev({ deltaX: 2, deltaY: 3, deltaMode: 1 }))).toEqual({ x: 32, y: 48 });
  });
});
