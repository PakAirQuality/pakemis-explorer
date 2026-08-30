/**
 * The house style's tokens: globals.css carries PAQI's warm civic palette (oxblood, saffron,
 * warm white), lib/theme.ts's FALLBACK mirrors every colour token of it in BOTH directions (so
 * charts and the Mapbox strokes follow the theme without a stylesheet), the UI type is the
 * system stack, and no blue literal survives anywhere under src outside a named allowlist.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chartTheme, cssVar, FALLBACK, mapTheme, UI_FONT, withAlpha } from "./theme";
import { RAMP } from "./palette";

const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");
const theme = css.slice(css.indexOf("@theme {"), css.indexOf("\n}\n", css.indexOf("@theme {")));

/** `--name: value;` inside the @theme block. */
function token(name: string): string {
  const m = new RegExp(`^\\s*${name}:\\s*([^;]+);`, "m").exec(theme);
  if (!m) throw new Error(`no token ${name}`);
  return m[1].trim();
}

/** Every `--color-*` token the @theme block declares. */
function colorTokens(): string[] {
  return [...theme.matchAll(/^\s*(--color-[a-z0-9-]+):/gm)].map((m) => m[1]);
}

describe("the palette tokens (globals.css)", () => {
  it("the PAQI values: the warm canvas, the white card, the charcoal, the muted, the hairline and the oxblood primary", () => {
    expect(token("--color-surface")).toBe("#f6f4f1");
    expect(token("--color-ground")).toBe("#f6f4f1");
    expect(token("--color-surface-2")).toBe("#ffffff");
    expect(token("--color-card")).toBe("#ffffff");
    expect(token("--color-fg")).toBe("#242128");
    expect(token("--color-muted")).toBe("#666677");
    expect(token("--color-line")).toBe("#e5e1da");
    expect(token("--color-line-strong")).toBe("#d7d5d1");
    expect(token("--color-accent")).toBe("#5e1a2a");
    expect(token("--color-primary")).toBe("#5e1a2a");
  });
  it("the primary's hover, the 8 % soft tint, the input ground, the saffron accent, the no-data grey and the card radius", () => {
    expect(token("--color-accent-bright")).toBe("#7a2436");
    expect(token("--color-primary-bright")).toBe("#7a2436");
    expect(token("--color-accent-soft")).toBe("rgba(94, 26, 42, 0.08)");
    expect(token("--color-primary-soft")).toBe("rgba(94, 26, 42, 0.08)");
    expect(token("--color-surface-3")).toBe("#efece7");
    expect(token("--color-brand-gold")).toBe("#ffb313");
    expect(token("--color-accent-2")).toBe("#ffb313");
    expect(token("--color-no-data")).toBe("#d7d5d1");
    expect(token("--radius-card")).toBe("0.625rem");
  });
  it("oxblood carries white text and saffron carries charcoal text", () => {
    expect(token("--color-on-accent")).toBe("#ffffff");
    expect(token("--color-on-accent-2")).toBe("#242128");
  });
  it("the note, refusal and warn tints are warm, and the amber pair is the saffron family", () => {
    expect(token("--color-note-bg")).toBe("#fff6e2");
    expect(token("--color-note-border")).toBe("#f0c36d");
    expect(token("--color-note-text")).toBe("#6b4a12");
    expect(token("--color-refusal")).toBe("#fdefe9");
    expect(token("--color-warn")).toBe("#8a3b12");
    expect(token("--color-amber")).toBe("#ffb313");
    expect(token("--color-amber-soft")).toBe("#8a5a0c");
  });
  it("the UI type is the system stack (no web font); JetBrains Mono stays for .mono", () => {
    expect(token("--font-sans")).toBe('-apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif');
    expect(token("--font-sans")).not.toContain("Inter");
    expect(token("--font-mono")).toContain("JetBrains Mono");
    expect(css).toMatch(/body \{[^}]*font-family: var\(--font-sans\)/);
  });
  it("the glass utility is the white pill: the panel token, backdrop-blur, shadow-md, a warm hairline", () => {
    const glass = /@utility glass \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(glass).toContain("background: var(--color-panel)");
    expect(token("--color-panel")).toBe("rgba(255, 255, 255, 0.92)");
    expect(glass).toContain("backdrop-filter: blur(8px)");
    expect(glass).toContain("border: 1px solid rgba(229, 225, 218, 0.6)");
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
  it("and the other way: every --color-* token of globals.css is in FALLBACK", () => {
    for (const name of colorTokens()) expect(Object.keys(FALLBACK), name).toContain(name);
  });
  it("cssVar reads the fallback without a stylesheet (jsdom carries none)", () => {
    expect(cssVar("--color-accent")).toBe("#5e1a2a");
    expect(cssVar("--color-brand-gold")).toBe("#ffb313");
    expect(cssVar("--no-such-token")).toBe("");
  });
  it("chartTheme: the oxblood, its 18 % area fill, the saffron reference mark, the system font", () => {
    const t = chartTheme();
    expect(t.accent).toBe("#5e1a2a");
    expect(t.accentSoft).toBe("rgba(94, 26, 42, 0.18)");
    expect(t.amber).toBe("#ffb313");
    expect(t.amberSoft).toBe("#8a5a0c");
    expect(t.fg).toBe("#242128");
    expect(t.muted).toBe("#666677");
    expect(t.grid).toBe("#e5e1da");
    expect(t.font).toBe(UI_FONT);
    expect(t.font).not.toContain("Inter");
  });
  it("mapTheme: a warm-grey outline, the oxblood hover and the charcoal selected, all legible over the PAQI ramp", () => {
    const m = mapTheme();
    expect(m.outline).toBe("#6b5b57");
    expect(m.hover).toBe("#5e1a2a");
    expect(m.selected).toBe("#242128");
    expect(m.halo).toBe("#ffffff");
    expect(m.space).toBe("#f6f4f1");
    // warm, not cool: no stroke's blue channel leads its red by more than a hair, so nothing on the basemap reads as the retired slate
    for (const c of [m.outline, m.hover, m.selected]) {
      const n = parseInt(c.slice(1), 16);
      expect((n & 255) - ((n >> 16) & 255), `${c} is a warm stroke`).toBeLessThanOrEqual(8);
    }
    // the hover stroke IS the ramp's darkest stop (the primary oxblood); the outline and the selected stroke are not, so a boundary is never mistaken for a shade
    expect(m.hover).toBe(RAMP[RAMP.length - 1]);
    for (const c of [m.outline, m.selected]) expect((RAMP as readonly string[]).includes(c), c).toBe(false);
  });
  it("withAlpha turns a hex into rgba and leaves other strings alone", () => {
    expect(withAlpha("#5e1a2a", 0.5)).toBe("rgba(94, 26, 42, 0.5)");
    expect(withAlpha("rgba(0,0,0,0.1)", 0.5)).toBe("rgba(0,0,0,0.1)");
  });
});

// --- the blue is gone

const SRC = join(__dirname, "..");

/** Every source file under src that ships (its tests and fixtures are not the interface). */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "__tests__") sourceFiles(p, out);
    } else if (/\.(tsx?|css)$/.test(name) && !/\.test\.[tj]sx?$/.test(name) && name !== "types.gen.ts") {
      out.push(p);
    }
  }
  return out;
}

/** The literals the retired cobalt set was written as; none of them may appear in a shipped file. */
const RETIRED = ["#2563eb", "#1d4ed8", "#3b82f6", "rgba(59, 130, 246", "#f9fafb", "#e5e7eb", "#d1d5db", "#030213", "#717182", "#1e293b", "#334155", "#0f172a", "#f3f3f5", "#ffbb12", "#d97706", "#b45309", "#f8f9fa", "#3A86FF", "#48CAE4", "#4C9F70", "#D1495B", "#8D6A9F", "#2A9D8F", "blue-600", "blue-700", "bg-blue-", "text-blue-"];

/**
 * The literals whose blue channel leads by more than a hair, and why: `#666677` is the palette's
 * own secondary text (a warm grey with a violet cast, the token itself) and `#7a5d86` is the
 * "outside the frame" exception hue, kept a violet so the four allocation statuses stay mutually
 * distinguishable. `rgba(16, 24, 40` is the card shadow, not a colour of the palette.
 */
const ALLOWLIST = ["#666677", "#7a5d86", "rgba(16, 24, 40"];

describe("no blue survives under src", () => {
  const files = sourceFiles(SRC);
  it("finds the shipped files (the guard is not scanning an empty tree)", () => {
    expect(files.length).toBeGreaterThan(100);
  });
  it("no file carries a literal of the retired cobalt palette", () => {
    for (const f of files) {
      const s = readFileSync(f, "utf8");
      for (const bad of RETIRED) expect(s.includes(bad), `${f.slice(SRC.length + 1)} carries ${bad}`).toBe(false);
    }
  });
  it("no colour literal is blue-dominant (its blue channel never leads red and green by more than 8)", () => {
    for (const f of files) {
      const s = readFileSync(f, "utf8");
      const rel = f.slice(SRC.length + 1);
      for (const m of s.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
        if (ALLOWLIST.includes(`#${m[1].toLowerCase()}`)) continue;
        const n = parseInt(m[1], 16);
        const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        expect(b - Math.max(r, g), `${rel}: #${m[1]}`).toBeLessThanOrEqual(8);
      }
      for (const m of s.matchAll(/rgba?\((\d+), ?(\d+), ?(\d+)/g)) {
        if (ALLOWLIST.some((a) => m[0].startsWith(a))) continue;
        const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
        expect(b - Math.max(r, g), `${rel}: ${m[0]})`).toBeLessThanOrEqual(8);
      }
    }
  });
});
