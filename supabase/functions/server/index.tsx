import { Hono } from "npm:hono@4";
import { cors } from "npm:hono@4/cors";
import { registerRoutes } from "./routes.tsx";

console.log("[FioTech Server] Boot: module loading...");

const app = new Hono();

app.use("*", cors({
  origin: [
    "https://fiotech-app.vercel.app",
    "http://localhost:5173",
    "http://localhost:4173",
  ],
  allowHeaders: ["Content-Type", "Authorization", "x-client-info", "apikey", "Cache-Control", "x-user-token"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Length", "X-Kuma-Revision"],
  maxAge: 600,
}));

app.onError((err, c) => {
  console.log("Unhandled route error:", err?.message || String(err));
  return c.json({ error: "Internal server error." }, 500);
});

// Health endpoint
app.get("/make-server-4916a0b9/health", (c) => {
  return c.json({ status: "ok", schemaReady: true });
});

// Register ALL routes synchronously — the Supabase CLI already
// bundles everything into a single file, so deferred imports
// provide zero benefit and cause timing issues.
try {
  registerRoutes(app);
  console.log("[FioTech Server] All routes registered.");
} catch (e) {
  console.log("[FioTech Server] CRITICAL: Failed to register routes:", e);
}

console.log("[FioTech Server] Boot: starting Deno.serve()...");
Deno.serve(app.fetch);
