import type { FlowMeta, MapLocal, MapLocalRule } from "./types";
import { saveMaplocal } from "./api";

export const newRuleId = (): string =>
  crypto.randomUUID?.() ?? String(Date.now() + Math.random());

/** Prefill a rule from a request row the way Charles does: the exact host and
    path (query stripped, since the matcher ignores it), and that request's
    method so a GET and a POST on one path cannot shadow each other. */
export function draftRuleForFlow(f: FlowMeta): MapLocalRule {
  return {
    id: newRuleId(),
    enabled: true,
    host: f.host,
    path: f.path.split("?")[0],
    method: f.method,
    file: "",
    status: f.response?.status ?? 200,
  };
}

/** Prefill a rule from a directory node: the whole prefix, any method.

    A directory has no captured response of its own, so the dialog opens with
    "Use captured response" disabled and a plain 200. */
export function draftRuleForDir(host: string, pathPrefix: string): MapLocalRule {
  const prefix = pathPrefix.endsWith("/") ? pathPrefix.slice(0, -1) : pathPrefix;
  return {
    id: newRuleId(), enabled: true, host,
    path: prefix ? `${prefix}/*` : "/*", method: "", file: "", status: 200,
  };
}

/** Prefill a rule from a host node: the host alone, so the whole host is mocked. */
export function draftRuleForHost(host: string): MapLocalRule {
  return { id: newRuleId(), enabled: true, host, path: "", method: "", file: "", status: 200 };
}

/** True when the flow was served by a rule that no longer exists. */
export function ruleWasDeleted(maplocal: MapLocal, ruleId: string | null | undefined): boolean {
  if (!ruleId) return false;
  return !maplocal.rules.some((r) => r.id === ruleId);
}

/** Save `rule` at the front of the list and return the server's view.

    Front matters because the first matching rule wins, so a freshly created
    narrow rule must not sit behind an older, broader one. */
export async function saveRuleFirst(maplocal: MapLocal, rule: MapLocalRule): Promise<MapLocal> {
  return saveMaplocal({ ...maplocal, rules: [rule, ...maplocal.rules] });
}

/** Replace the rule with `rule.id` in place, keeping its position. */
export async function replaceRule(maplocal: MapLocal, rule: MapLocalRule): Promise<MapLocal> {
  return saveMaplocal({
    ...maplocal,
    rules: maplocal.rules.map((r) => (r.id === rule.id ? rule : r)),
  });
}

/** Turn the rule that served this flow off, without deleting or reordering it. */
export async function setRuleEnabled(maplocal: MapLocal, ruleId: string, enabled: boolean): Promise<MapLocal> {
  return saveMaplocal({
    ...maplocal,
    rules: maplocal.rules.map((r) => (r.id === ruleId ? { ...r, enabled } : r)),
  });
}

export function ruleFor(maplocal: MapLocal, ruleId: string | null | undefined) {
  if (!ruleId) return null;
  return maplocal.rules.find((r) => r.id === ruleId) ?? null;
}
