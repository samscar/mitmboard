import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { WebSocketServer } from "ws";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const flow = { id: "e1", timestamp: 1, client: { ip: "192.168.1.23", label: "iPhone" },
  method: "GET", scheme: "https", host: "api.soum.sa", port: 443, path: "/v2/listings",
  query: "", http_version: "HTTP/2", request: { headers: [], size: 0 },
  response: { status: 200, reason: "OK", headers: [], size: 3, content_type: "application/json", body: '{"ok":true}' },
  duration_ms: 142, state: "complete", error: null };
const meta = { ...flow, request: { headers: [], size: 0 }, response: { ...flow.response } };
delete meta.response.body;

// SSL Proxying exclude state, standing in for ~/.mitmproxy/config.yaml.
const SEED = ["(?i)google", "^.*\\.example\\.com(:\\d+)?$"];
let sslEnabled = true;
let sslPatterns = [...SEED];
const rev = (arr) => createHash("sha1").update(JSON.stringify(arr)).digest("hex").slice(0, 12);

const readBody = (req) => new Promise((resolve) => {
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
});

const server = createServer(async (req, res) => {
  const send = (o, status = 200) => {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(o));
  };
  if (req.url === "/api/flows") return send([meta]);
  if (req.url === "/api/flows/e1" && req.method === "GET") return send(flow);
  if (req.url === "/api/flows/e1/replay" && req.method === "POST") return send({ ok: true });
  if (req.url === "/api/session" && req.method === "GET") return send([flow]);
  if (req.url === "/api/session" && req.method === "POST") return send({ loaded: 1 });
  if (req.url === "/api/clients") return send([{ ip: "192.168.1.23", label: "iPhone", count: 1 }]);
  if (req.url === "/api/paused") return send([]);
  if (req.url === "/api/breakpoints") return send({ enabled: false, rules: [] });
  if (req.url === "/api/maplocal") return send({ enabled: true, rules: [] });
  if (req.url === "/api/ca-info") return send({ present: true });
  if (req.url === "/api/connect-info") return send({ lan_ips: ["192.168.1.10"], proxy_port: 8080, cert_url: "http://mitm.it", proxy_hint: "192.168.1.10:8080" });

  if (req.url === "/api/ssl-proxying" && req.method === "GET") {
    return send({ enabled: sslEnabled, exclude: sslPatterns, revision: rev(sslPatterns) });
  }
  if (req.url === "/api/ssl-proxying" && req.method === "PUT") {
    const body = await readBody(req);
    const wanted = body.exclude ?? [];
    if (wanted.join("\n") !== sslPatterns.join("\n")) {
      if (!body.force && body.revision !== rev(sslPatterns)) {
        return send({ detail: "config.yaml changed externally", enabled: sslEnabled,
                      exclude: sslPatterns, revision: rev(sslPatterns) }, 409);
      }
      sslPatterns = wanted;
    }
    sslEnabled = Boolean(body.enabled);
    return send({ enabled: sslEnabled, exclude: sslPatterns, revision: rev(sslPatterns) });
  }
  // Test-only: seed / simulate an external edit of config.yaml.
  if (req.url === "/api/__ssl-reset") {
    sslPatterns = [...SEED]; sslEnabled = true; return send({ ok: true });
  }
  if (req.url === "/api/__ssl-external") {
    const body = await readBody(req);
    sslPatterns = body.exclude ?? sslPatterns;
    sslEnabled = body.enabled ?? sslEnabled;
    return send({ ok: true });
  }

  const urlPath = req.url.split("?")[0];
  const path = urlPath === "/" ? "index.html" : urlPath.slice(1);
  const ext = path.split(".").pop();
  const mime = { js: "application/javascript", css: "text/css", html: "text/html", json: "application/json" }[ext] ?? "application/octet-stream";
  if (existsSync(dist + path)) { res.setHeader("content-type", mime); res.end(readFileSync(dist + path)); return; }
  res.statusCode = 404; res.end("nf");
});
new WebSocketServer({ server, path: "/ws" }).on("connection", (ws) => ws.send(JSON.stringify({ type: "flow.complete", flow: meta })));
server.listen(8099, () => console.log("mock on 8099"));
