"use client";
/** The 3D view (`view3d=1`): the ops dashboard's recipe of Mapbox terrain, the atmosphere and a tilted camera (layers.ts setView3d). */
import { Mountain } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";

export function View3dToggle() {
  const { state, setState } = useExplorer();
  const on = state.view3d;
  const title = on ? "Back to the flat view" : "3D: terrain, atmosphere and a tilted camera";
  return (
    <button title={title} aria-pressed={on} onClick={() => setState({ view3d: !on })} className={`glass flex h-9 w-9 items-center justify-center rounded-xl ${on ? "text-accent" : "text-muted hover:text-fg"}`} data-testid="view3d-toggle">
      <Mountain size={16} />
    </button>
  );
}
