/**
 * The house style's tokens: globals.css carries the PAQI palette read off emissions.web.app,
 * lib/theme.ts's FALLBACK mirrors every colour token of it (so charts and the Mapbox strokes
 * follow the theme without a stylesheet), the UI type is the system stack and the map's hover /
 * selected strokes are dark slate, legible on the YlOrRd ramp.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chartTheme, cssVar, FALLBACK, mapTheme, UI_FONT, withAlpha } from "./theme";

const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");
const theme = css.slice(css.indexOf("@theme {"), css.indexOf("\n}\n", css.indexOf("@theme {")));

/** `--name: value;` inside the @theme block. */
function token(name: string): string {
  const m = new RegExp(`^\\s*${name}:\\s*([^;]+);`, "m").exec(theme);
  if (!m) throw new Error(`no token ${name}`);
  return m[1].trim();
}

describe("the palette tokens (globals.css)", () => {
  it("the six PAQI values: ground, card, fg, muted, line, accent", () => {
    expect(token("--color-surface")).toBe("#f9fafb");
    expect(token("--color-ground")).toBe("#f9fafb");
    expect(token("--color-surface-2")).toBe("#ffffff");
    expect(token("--color-card")).toBe("#ffffff");
    expect(token("--color-fg")).toBe("#030213");
    expect(token("--color-muted")).toBe("#717182");
    expect(token("--color-line")).toBe("#e5e7eb");
    expect(token("--color-accent")).toBe("#2563eb");
  });
  it("the accent's hover, the 8 % soft tint, the input ground, the brand gold and the card radius", () => {
    expect(token("--color-accent-bright")).toBe("#1d4ed8");
    expect(token("--color-accent-soft")).toBe("rgba(59, 130, 246, 0.08)");
    expect(token("--color-surface-3")).toBe("#f3f3f5");
    expect(token("--color-brand-gold")).toBe("#ffbb12");
    expect(token("--radius-card")).toBe("0.625rem");
  });
  it("the UI type is the system stack (no web font); JetBrains Mono stays for .mono", () => {
    expect(token("--font-sans")).toBe('-apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif');
    expect(token("--font-sans")).not.toContain("Inter");
    expect(token("--font-mono")).toContain("JetBrains Mono");
    expect(css).toMatch(/body \{[^}]*font-family: var\(--font-sans\)/);
  });
  it("the glass utility is the white pill: bg-white/90, backdrop-blur, shadow-md, a gray-200/50 hairline", () => {
    const glass = /@utility glass \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(glass).toContain("background: var(--color-panel)");
    expect(token("--color-panel")).toBe("rgba(255, 255, 255, 0.9)");
    expect(glass).toContain("backdrop-filter: blur(8px)");
    expect(glass).toContain("border: 1px solid rgba(229, 231, 235, 0.5)");
    expect(glass).toContain("box-shadow: var(--shadow-pill)");
    expect(token("--shadow-pill")).toBe("0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)");
  });
  it("no dark chrome remains: the map page re-values no token", () => {
    expect(css).not.toContain("#14181c");
    expect(css).not.toContain("#faf8f4");
  });
});

describe("lib/theme.ts", () => {
  it("FALLBACK mirrors every colour token it names, value for value", () => {
    for (const [name, value] of Object.entries(FALLBACK)) expect(token(name), name).toBe(value);
  });
  it("cssVar reads the fallback without a stylesheet (jsdom carries none)", () => {
    expect(cssVar("--color-accent")).toBe("#2563eb");
    expect(cssVar("--color-brand-gold")).toBe("#ffbb12");
    expect(cssVar("--no-such-token")).toBe("");
  });
  it("chartTheme: the accent blue, its 18 % area fill, the system font", () => {
    const t = chartTheme();
    expect(t.accent).toBe("#2563eb");
    expect(t.accentSoft).toBe("rgba(37, 99, 235, 0.18)");
    expect(t.fg).toBe("#030213");
    expect(t.muted).toBe("#717182");
    expect(t.grid).toBe("#e5e7eb");
    expect(t.font).toBe(UI_FONT);
    expect(t.font).not.toContain("Inter");
  });
  it("mapTheme: outline, hover and selected are dark slate, legible on the ramp's yellows and reds", () => {
    const m = mapTheme();
    expect(m.outline).toBe("#1e293b");
    expect(m.hover).toBe("#334155");
    expect(m.selected).toBe("#0f172a");
    expect(m.halo).toBe("#ffffff");
    expect(m.space).toBe("#f9fafb");
    // slate, not the ramp's family: each stroke is a cool grey-blue (blue channel above red), never a yellow, orange or red like the ramp, and never the amber of the charts' reference marker
    for (const c of [m.outline, m.hover, m.selected]) {
      const n = parseInt(c.slice(1), 16);
      expect((n & 255) > ((n >> 16) & 255), `${c} is a cool stroke`).toBe(true);
      expect(c).not.toBe("#d97706");
    }
  });
  it("withAlpha turns a hex into rgba and leaves other strings alone", () => {
    expect(withAlpha("#2563eb", 0.5)).toBe("rgba(37, 99, 235, 0.5)");
    expect(withAlpha("rgba(0,0,0,0.1)", 0.5)).toBe("rgba(0,0,0,0.1)");
  });
});
