import type { FlowMeta } from "./types";

/** Requests that live under a tree node key.

    A key is either a host ("api.soum.sa") or a host plus path prefix
    ("api.soum.sa/v2"); the prefix matches whole segments so `/v2` does not
    swallow `/v20`. */
export function flowsUnderNode(flows: FlowMeta[], key: string): FlowMeta[] {
  const [host, ...rest] = key.split("/");
  if (!host) return [];
  const prefix = rest.length ? "/" + rest.join("/") : "";
  return flows.filter((f) => {
    if (f.host !== host) return false;
    if (!prefix) return true;
    const path = f.path.split("?")[0];
    return path === prefix || path.startsWith(prefix + "/");
  });
}
