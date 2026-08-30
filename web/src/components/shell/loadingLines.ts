/**
 * The loading screen's rotating status lines: sentences about how the inventory works, and nothing
 * else. They carry no digit (the rule that every number on screen is a server string holds on
 * the loading screen too), no "FY", no raw id and none of the avoid-list phrases; the tests
 * beside LoadingScreen.tsx assert all four.
 */
export const LOADING_LINES = [
  "Every figure carries its method, its evidence grade and its source document.",
  "Months close to the year they belong to; districts close to their province.",
  "Not estimated is never written as zero.",
  "Allocation is shown as allocation, never as observation.",
  "Two estimates, one question: which structural reading is being made.",
  "Every number on screen is a string the release returned, with a receipt that replays it.",
  "Uncertainty is carried at parameter level and reported as an interval.",
  "Explore greenhouse-gas emissions by place, sector and year.",
] as const;
