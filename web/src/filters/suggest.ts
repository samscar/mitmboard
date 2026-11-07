export type Suggestion = { token: string; desc: string };
export type DeviceOption = { ip: string; label: string };
const FIELDS = ["method", "status", "host", "path", "type", "size", "dur", "client", "device"];
const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"];

export function suggest(query: string, devices: DeviceOption[] = []): Suggestion[] {
  const last = query.split(/\s+/).pop() ?? "";
  const colon = last.indexOf(":");
  if (colon === -1) {
    return FIELDS.filter((f) => f.startsWith(last))
      .slice(0, 6).map((f) => ({ token: `${f}:`, desc: `Filter by ${f}` }));
  }
  const field = last.slice(0, colon);
  const partial = last.slice(colon + 1);
  if (field === "method") {
    return METHODS.filter((m) => m.startsWith(partial.toUpperCase()))
      .slice(0, 6).map((m) => ({ token: `method:${m}`, desc: `${m} requests` }));
  }
  if (field === "device" || field === "client") {
    // Both spellings address the same set, so the completion offers both the
    // device name (as derived from its User-Agent) and its IP.
    const needle = partial.toLowerCase();
    const out: Suggestion[] = [];
    for (const d of devices) {
      const token = `${field}:${d.label}`;
      if (d.label.toLowerCase().includes(needle)) out.push({ token, desc: `${d.ip} · ${field}` });
      if (d.ip.includes(needle)) out.push({ token: `${field}:${d.ip}`, desc: `${d.label} · ${field}` });
    }
    return out.slice(0, 6);
  }
  return [];
}
