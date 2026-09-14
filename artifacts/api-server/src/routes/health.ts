import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Detailed health check with database connectivity
router.get("/healthz/detailed", async (_req, res) => {
  const start = Date.now();
  let dbStatus = "ok";
  let dbLatency = 0;
  
  try {
    await db.execute(sql`SELECT 1`);
  } catch (e) {
    dbStatus = "error";
  }
  const dbLatencyMs = Date.now() - start;

  const mem = process.memoryUsage();
  const memStatus = mem.heapUsed < 500 * 1024 * 1024 ? "ok" : "warning";

  const status = dbStatus === "ok" && mem.heapUsed < 500 * 1024 * 1024 ? "ok" : "degraded";
  const statusCode = status === "ok" ? 200 : 503;
  
  res.status(statusCode).json({
    status,
    timestamp: new Date().toISOString(),
    database: { status: dbStatus, latencyMs: Date.now() - Date.now() + Date.now() },
    memory: { 
      status: memStatus, 
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
    },
  });
});

export default router;
