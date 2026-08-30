/**
 * A chart axis from the server's tick labels (`envelope.axis.ticks_short`: "0", "50", …,
 * evenly spaced by the release's rule). The labels are printed as received; their numeric
 * reading places them and sizes the marks, and prints nothing: `labelFor` answers a tick's
 * own string for a position that is a tick and "" for any other, so ECharts can never invent
 * a number.
 */
export type Axis = { ticks: string[]; min: number; max: number; interval: number; labelFor: (v: number) => string };

export function axisFromTicks(ticks: string[] | null | undefined): Axis | null {
  if (!ticks || ticks.length < 2) return null;
  const nums = ticks.map((t) => Number(t));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const min = nums[0];
  const max = nums[nums.length - 1];
  if (!(max > min)) return null;
  const interval = (max - min) / (nums.length - 1);
  const labelFor = (v: number) => {
    const i = nums.findIndex((n) => Math.abs(n - v) <= Math.max(1e-9, Math.abs(n) * 1e-9));
    return i >= 0 ? ticks[i] : "";
  };
  return { ticks: [...ticks], min, max, interval, labelFor };
}

/** Where a number sits along the axis, as a fraction of its span (placement only). */
export function fraction(axis: Axis, v: number): number {
  return Math.min(1, Math.max(0, (v - axis.min) / (axis.max - axis.min)));
}
