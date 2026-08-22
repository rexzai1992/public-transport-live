import express, { type ErrorRequestHandler } from "express";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import path from "node:path";
import { ZodError } from "zod";
import { apiRouter } from "./routes.js";
import { UpstreamError } from "./http.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);

/* Behind a reverse proxy the app should not also be reachable directly, so the
   bind address is configurable. Set HOST=127.0.0.1 in production; the default
   keeps local development reachable from other devices on the network. */
const host = process.env.HOST ?? "0.0.0.0";

/* Behind nginx; trust exactly one proxy hop so rate limiting sees the real
   client IP from X-Forwarded-For instead of 127.0.0.1 for everyone. */
app.set("trust proxy", 1);

app.use(morgan("dev"));

/* Security headers. The API is read-only JSON and the shell is same-origin
   static files, so the policy can be strict. connect-src lists the two hosts
   the page itself calls out to (map tiles, fonts). */
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

/* Rate limits: generous for one human, hostile to a script. The journey
   planner burns CPU and Singapore vehicle lookups burn LTA key quota —
   those two get tighter buckets than plain cached reads. */
const SPECIFIC_LIMITS = ["/api/journey", "/api/rapid-bus/sg-bus/vehicles", "/api/rapid-bus/sg-bus/map", "/api/flights"];
const readLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  // Paths with their own limiter shouldn't also drain (and re-label) this one.
  skip: (req) => SPECIFIC_LIMITS.some((path) => req.originalUrl.startsWith(path))
});
const journeyLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
const vehicleLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });
/* Flights ride on free community feeds (adsb.fi wants ~1 req/s total), so the
   scarce resource is upstream goodwill, not our CPU. Tiles need at most
   9 calls per 15 s refresh = 36/min per viewer; 120 leaves headroom without
   letting one tab starve the feed for everyone. Lookups are rarer still. */
const flightTileLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });
const flightLookupLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
app.use("/api/journey", journeyLimiter);
app.use(["/api/rapid-bus/sg-bus/vehicles", "/api/rapid-bus/sg-bus/map"], vehicleLimiter);
app.use(["/api/flights/route", "/api/flights/find"], flightLookupLimiter);
app.use("/api/flights", flightTileLimiter);
app.use("/api", readLimiter);

/* The Android shell serves its pages from the app bundle, so its API calls are
   cross-origin. Everything here is read-only public transit data, so GET is
   opened up; set CORS_ORIGIN to pin it to one origin instead. */
const corsOrigin = process.env.CORS_ORIGIN ?? "*";

app.use("/api", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

/* The service worker and the HTML shell must never sit in the browser's HTTP
   cache. express.static sends no Cache-Control, so browsers heuristic-cache
   both — and a browser that holds an old sw.js keeps running that worker, which
   then answers from ITS own cache. Edits to public/ never arrive and the app
   stays frozen on whatever build was loaded first, with no way to tell. These
   two files are small and must always be the server's real answer. */
app.use((req, res, next) => {
  if (req.path === "/sw.js" || req.path === "/" || req.path.endsWith(".html")) {
    res.setHeader("Cache-Control", "no-store, must-revalidate");
  }
  next();
});

app.use(express.static(path.join(process.cwd(), "public")));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api", apiRouter);

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Invalid request",
      issues: error.issues
    });
    return;
  }

  if (error instanceof UpstreamError) {
    res.status(error.statusCode).json({
      error: error.message
    });
    return;
  }

  /* Unexpected errors: log the detail, hand the client a generic line —
     internal messages (paths, upstream hostnames) are not for the public. */
  console.error("Unhandled error:", error);
  res.status(500).json({ error: "Internal server error" });
};

app.use(errorHandler);

app.listen(port, host, () => {
  console.log(`Rapid Bus Maps Handler listening on http://${host}:${port}`);
});
