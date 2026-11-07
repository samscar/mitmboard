import type { FlowMeta, MapLocal, MapLocalRule } from "./types";
import { draftRuleForFlow, ruleFor } from "./maplocal";
import { copyCurl, copyUrl, replayFlow } from "./flowActions";

export interface MenuItem {
  label?: string;
  onSelect?: () => void;
  disabled?: boolean;
  separator?: boolean;
}

export interface FlowMenuOptions {
  maplocal: MapLocal;
  focused: boolean;
  onFocus: (host: string) => void;
  onMapLocal: (rule: MapLocalRule, replace: boolean) => void;
  onDisableRule: (ruleId: string) => void;
  onResend: (flowId: string) => void;
}

/** The request context menu, shared by the sequence list and the tree.

    One builder so the two views cannot drift apart -- the mapped-flow entries
    in particular must match, otherwise "edit the rule that fired" would exist
    in one view and silently be missing in the other. */
export function flowMenuItems(f: FlowMeta, o: FlowMenuOptions): MenuItem[] {
  const hit = ruleFor(o.maplocal, f.maplocal_rule_id);
  const mapEntries: MenuItem[] = hit
    ? [
        { label: "Edit Map Local rule…", onSelect: () => o.onMapLocal(hit, true) },
        { label: "Disable this rule", onSelect: () => o.onDisableRule(hit.id) },
      ]
    : [{ label: "Map Local…", onSelect: () => o.onMapLocal(draftRuleForFlow(f), false) }];
  return [
    ...mapEntries,
    { label: o.focused ? "Unfocus" : "Focus", onSelect: () => o.onFocus(f.host) },
    { separator: true },
    { label: "Copy URL", onSelect: () => { copyUrl(f).catch(() => {}); } },
    { label: "Copy cURL", onSelect: () => { copyCurl(f).catch(() => {}); } },
    { separator: true },
    { label: "Replay", onSelect: () => { replayFlow(f).catch(() => {}); } },
    { label: "Edit & Resend", onSelect: () => o.onResend(f.id) },
  ];
}
