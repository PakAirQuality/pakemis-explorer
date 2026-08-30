/**
 * The Overview deck's geometry and card chrome (Global Mangrove Watch's floating dashboard):
 * a 520 px column inset 20 px from the map pane's edges, a 12 px gap between separate white
 * cards, and the card class every deck card wears. The column itself lets pointer events
 * through to the map (`pointer-events-none`); each card takes them back (`pointer-events-auto`).
 * Every card is `shrink-0`: the column is a fixed-height flex container, and a card with
 * `overflow-hidden` (the header) would otherwise be shrunk to nothing.
 */
export const DECK_PX = 520;
export const DECK_INSET_PX = 20;
/** A deck card: white, `rounded-2xl`, `shadow-md`, catching pointer events the column lets through. */
export const DECK_CARD = "pointer-events-auto shrink-0 rounded-2xl bg-white p-5 shadow-md";
