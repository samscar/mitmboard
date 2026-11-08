import type { FlowMeta } from "../types";

/** Row glyphs for the Structure tree.
 *
 *  Charles' Structure view is a plain outline: a leaf row is an icon plus a
 *  file name, with the icon carrying both the content type and the outcome.
 *  Method, status code and size are Sequence-view columns, not tree content,
 *  so this component is the only place the tree communicates them now. */

type Family = "json" | "markup" | "code" | "image" | "text" | "binary" | "ws";

function familyOf(f: FlowMeta): Family {
  if (f.kind === "ws") return "ws";
  const ct = (f.response?.content_type ?? "").toLowerCase();
  if (ct.includes("json")) return "json";
  if (ct.includes("html") || ct.includes("xml")) return "markup";
  if (ct.includes("javascript") || ct.includes("css") || ct.includes("ecmascript")) return "code";
  if (ct.startsWith("image/") || ct.includes("svg")) return "image";
  if (ct.startsWith("text/")) return "text";
  if (ct) return "binary";
  // No response yet: fall back to the path's extension so a pending JSON
  // request does not look like an unknown blob.
  const ext = f.path.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  if (ext === "json") return "json";
  if (ext === "html" || ext === "htm" || ext === "xml") return "markup";
  if (ext === "js" || ext === "css") return "code";
  return "binary";
}

function outcomeColor(f: FlowMeta): string {
  const status = f.response?.status;
  if (f.state === "error" || (status != null && status >= 500)) return "var(--err5xx)";
  if (status != null && status >= 400) return "var(--err4xx)";
  if (status != null && status >= 300) return "var(--redir)";
  if (f.kind === "ws") return "var(--patch)";
  return "var(--muted)";
}

const MARK: Record<Family, React.ReactNode> = {
  json: (
    <>
      <path d="M6.6 4.4c-.9 0-1.2.5-1.2 1.3v.9c0 .6-.3.9-.9.9.6 0 .9.3.9.9v.9c0 .8.3 1.3 1.2 1.3" />
      <path d="M9.4 4.4c.9 0 1.2.5 1.2 1.3v.9c0 .6.3.9.9.9-.6 0-.9.3-.9.9v.9c0 .8-.3 1.3-1.2 1.3" />
    </>
  ),
  markup: (
    <>
      <path d="M6.2 6 4.4 8l1.8 2" />
      <path d="M9.8 6l1.8 2-1.8 2" />
    </>
  ),
  code: (
    <>
      <path d="M6.4 6 4.6 8l1.8 2" />
      <path d="M8.8 5.6 7.6 10.4" />
      <path d="M10.2 6l1.4 2-1.4 2" />
    </>
  ),
  image: (
    <>
      <circle cx="6.6" cy="6.4" r="1" />
      <path d="M4.6 10.6 7 8.4l1.2 1 1.3-1.1 1.7 2.3" />
    </>
  ),
  text: (
    <>
      <path d="M5.2 6.2h5.6" />
      <path d="M5.2 8h5.6" />
      <path d="M5.2 9.8h3.2" />
    </>
  ),
  binary: (
    <>
      <circle cx="6" cy="7" r=".8" />
      <circle cx="10" cy="7" r=".8" />
      <circle cx="6" cy="9.6" r=".8" />
      <circle cx="10" cy="9.6" r=".8" />
    </>
  ),
  ws: <path d="M4.4 5.4h7.2v4.2H7.6L5.6 11V9.6H4.4z" />,
};

export function FlowIcon({ flow }: { flow: FlowMeta }) {
  const family = familyOf(flow);
  return (
    <svg className="flow-ico" width="14" height="14" viewBox="0 0 14 14" fill="none"
         xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ color: outcomeColor(flow) }}>
      {family === "ws" ? (
        <g stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round">{MARK.ws}</g>
      ) : (
        <>
          <rect x="2.2" y="2" width="9.6" height="10" rx="1.6" stroke="currentColor" strokeWidth="1.1" opacity="0.55" />
          <g stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">{MARK[family]}</g>
        </>
      )}
    </svg>
  );
}

export function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg className="flow-ico folder-ico" width="14" height="14" viewBox="0 0 14 14" fill="none"
         xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d={open
        ? "M2 11.2V3.6h3.3l1.2 1.4h5.5v1.6M2 11.2l1.3-4.3h9.2l-1.3 4.3z"
        : "M2 3.6h3.3l1.2 1.4H12v6.2H2z"}
            stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}
