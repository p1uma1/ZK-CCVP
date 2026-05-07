/**
 * server.ts
 *
 * Express entry point for the Gemstone Traceability backend.
 *
 * Routes:
 *   GET  /health                          → chain connection status
 *   POST /api/certificates/issue          → issue cert on all 3 chains
 *   GET  /api/certificates/verify/:hash   → verify cert across all 3 chains
 *   POST /api/identity/register           → register identity on Ethereum
 *   GET  /api/identity/:address           → look up Ethereum identity
 *   DELETE /api/identity/:address         → revoke Ethereum identity
 *   POST /api/events/log                  → log gem event on Aptos
 *   GET  /api/events/:gemId               → fetch gem event history from Aptos
 */

import express from "express";
import cors from "cors";
import { SERVER_PORT, NODE_ENV } from "./config/config";
import { getChainStatus } from "./services/certificateService";
import certificatesRouter from "./routes/certificates";
import identityRouter from "./routes/identity";
import eventsRouter from "./routes/events";

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Request logger (dev only)
if (NODE_ENV === "development") {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", async (_req, res) => {
  try {
    const status = await getChainStatus();
    const allHealthy = Object.values(status).every((s) => !("error" in s));
    res.status(allHealthy ? 200 : 207).json({
      status: allHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      chains: status,
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// ─── API routes ───────────────────────────────────────────────────────────────
app.use("/api/certificates", certificatesRouter);
app.use("/api/identity",     identityRouter);
app.use("/api/events",       eventsRouter);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("[Unhandled error]", err);
    res.status(500).json({ error: "Internal server error." });
  }
);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(SERVER_PORT, () => {
  console.log(`\n🚀 Gemstone Traceability API running on http://localhost:${SERVER_PORT}`);
  console.log(`   ENV: ${NODE_ENV}`);
  console.log(`\n   Routes:`);
  console.log(`   GET  /health`);
  console.log(`   POST /api/certificates/issue`);
  console.log(`   GET  /api/certificates/verify/:certHash`);
  console.log(`   POST /api/identity/register`);
  console.log(`   GET  /api/identity/:address`);
  console.log(`   POST /api/events/log`);
  console.log(`   GET  /api/events/:gemId\n`);
});

export default app;
