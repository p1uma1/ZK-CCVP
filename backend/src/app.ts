

import express from "express";
import cors    from "cors";
import aptosEventRoutes from "./routes/aptosEventRoutes.js";
import gemRoutes from "./routes/gemRoutes.js";
import certificateRoutes from "./routes/certificateRoutes.js";

const app = express();


app.use(express.json());


app.use(cors({ origin: "*" }));

app.get("/health", (_req, res) => {
  res.json({
    status:    "ok",
    service:   "zk-ccvp-backend",
    timestamp: new Date().toISOString(),
  });
});


app.use("/api/aptos", aptosEventRoutes);
app.use("/api/gems", gemRoutes);
app.use("/api/certificates", certificateRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

export default app;