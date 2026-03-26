import { Hono } from "npm:hono@4";
import { cors } from "npm:hono@4/cors";
import { registerRoutes } from "./routes.tsx";

console.log("[FioTec Server] Boot: module loading...");

const app = new Hono();

// Only allow localhost origins in development (DENO_DEPLOYMENT_ID is set in Deno Deploy / Supabase Edge)
const PROD_ORIGINS = ["https://fiotech-app.vercel.app"];
const DEV_ORIGINS  = [...PROD_ORIGINS, "http://localhost:5173", "http://localhost:4173"];
const isProduction = !!Deno.env.get("DENO_DEPLOYMENT_ID");

app.use("*", cors({
  origin: isProduction ? PROD_ORIGINS : DEV_ORIGINS,
  allowHeaders: ["Content-Type", "Authorization", "x-client-info", "apikey", "Cache-Control", "x-user-token", "X-Webhook-Token"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Length", "X-Kuma-Revision"],
  maxAge: 600,
}));

app.onError((err, c) => {
  console.log("Unhandled route error:", err?.message || String(err));
  return c.json({ error: "Internal server error." }, 500);
});

// Health endpoint — minimal safe payload (no internal state disclosure)
app.get("/make-server-4916a0b9/health", (c) => {
  return c.json({ status: "ok" });
});

// Register ALL routes synchronously — the Supabase CLI already
// bundles everything into a single file, so deferred imports
// provide zero benefit and cause timing issues.
try {
  registerRoutes(app);
  console.log("[FioTec Server] All routes registered.");
} catch (e) {
  console.log("[FioTec Server] CRITICAL: Failed to register routes:", e);
}

console.log("[FioTec Server] Boot: starting Deno.serve()...");
Deno.serve(app.fetch);
