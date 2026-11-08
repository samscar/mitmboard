import { useStore } from "../store";
import { FilterBar } from "./FilterBar";
import { FlowTable } from "./FlowTable";
import { StructureTree } from "./StructureTree";

/** The left half of the inspector.
 *
 *  Charles puts the Structure/Sequence switch in the window toolbar, not in a
 *  panel header, so the panel goes straight from the toolbar to the tree. The
 *  filter box stays pinned to the bottom, where Charles keeps it. */
export function ListPanel() {
  const listMode = useStore((s) => s.listMode);
  return (
    <div className="listpanel">
      <div className="lp-body">
        {listMode === "structure" ? <StructureTree /> : <FlowTable />}
      </div>
      <FilterBar />
    </div>
  );
}
