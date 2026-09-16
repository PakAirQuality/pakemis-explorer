/**
 * The boundary credit, for the pages that draw the district motif.
 *
 * geoBoundaries gbOpen is CC-BY, so the geometry cannot be decoration without saying whose it is.
 * On the map this is carried by Mapbox's attribution control; on a page that only draws the outlines
 * there is nothing to carry it, so this one quiet line does.
 */
import { MOTIF_CREDIT } from "./MapMotif";

export function MotifCredit() {
  return (
    <p className="px-5 pb-6 text-micro normal-case tracking-normal text-muted" data-testid="motif-credit">
      {MOTIF_CREDIT}
    </p>
  );
}
