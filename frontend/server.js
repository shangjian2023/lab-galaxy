const { createServer } = require("http");
const httpProxy = require("http-proxy");
const next = require("next");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
console.log(`Starting frontend with BACKEND_URL=${BACKEND_URL}`);

const proxy = httpProxy.createProxyServer();
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    if (req.url && req.url.startsWith("/api/v1/")) {
      proxy.web(req, res, {
        target: BACKEND_URL,
        changeOrigin: true,
      }, (err) => {
        if (err) {
          console.error(`Proxy error: ${err.message}`);
          if (!res.headersSent) {
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Backend service unavailable" }));
          }
        }
      });
      return;
    }
    handle(req, res);
  });

  server.listen(3000, "0.0.0.0", () => {
    console.log("> Ready on http://0.0.0.0:3000");
  });
}).catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
