import { useStore } from "../store";
import { FilterBar } from "./FilterBar";
import { FlowTable } from "./FlowTable";
import { StructureTree } from "./StructureTree";

/** The left half of Inspector: view switch on top, tree or list in the
    middle, filter box pinned to the bottom -- Charles' panel arrangement. */
export function ListPanel() {
  const listMode = useStore((s) => s.listMode);
  const setListMode = useStore((s) => s.setListMode);
  const shown = useStore((s) => s.visibleFlows().length);

  return (
    <div className="listpanel">
      <div className="lp-head">
        <div className="seg listmode" role="group" aria-label="List layout">
          <button className={"seg-item" + (listMode === "sequence" ? " active" : "")}
                  onClick={() => setListMode("sequence")}>Sequence</button>
          <button className={"seg-item" + (listMode === "structure" ? " active" : "")}
                  onClick={() => setListMode("structure")}>Structure</button>
        </div>
        <span className="lp-count">{shown} shown</span>
      </div>
      <div className="lp-body">
        {listMode === "structure" ? <StructureTree /> : <FlowTable />}
      </div>
      <FilterBar />
    </div>
  );
}
