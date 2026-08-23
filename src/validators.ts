import { z } from "zod";
import { FEED_IDS } from "./config.js";

export const categoryParamSchema = z.object({
  category: z.enum(FEED_IDS)
});

export const routeParamSchema = categoryParamSchema.extend({
  routeId: z.string().min(1)
});

export const routeSearchSchema = z.object({
  search: z.string().trim().optional()
});

export const vehicleQuerySchema = z.object({
  routeId: z.string().trim().min(1).optional()
});

export const mapQuerySchema = z.object({
  routeId: z.string().trim().min(1),
  // The handler clamps to the route's actual pattern count, so a stale deep
  // link degrades to direction 0 rather than failing the request.
  direction: z.coerce.number().int().min(0).optional()
});

export const stopSearchSchema = z.object({
  q: z.string().trim().min(1),
  feeds: z.string().trim().optional()
});

export const journeySchema = z.object({
  fromLat: z.coerce.number().min(-90).max(90),
  fromLon: z.coerce.number().min(-180).max(180),
  fromName: z.string().trim().optional(),
  toStop: z.string().trim().optional(),
  toLat: z.coerce.number().min(-90).max(90).optional(),
  toLon: z.coerce.number().min(-180).max(180).optional(),
  toName: z.string().trim().optional(),
  feeds: z.string().trim().optional(),
  departAfter: z.coerce.number().int().min(0).max(1439).optional()
});

export const nearbySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  feeds: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(10).optional()
});

/* A stop key is "<feed>:<stopId>"; stop ids vary wildly across feeds, so the
   shape is checked loosely and the lookup itself decides if it exists. */
export const stopBoardSchema = z.object({
  key: z.string().trim().min(3).max(120).regex(/^[A-Za-z0-9-]+:.+$/, "Expected <feed>:<stopId>"),
  feeds: z.string().trim().optional(),
  minutes: z.coerce.number().int().min(15).max(240).optional()
});

export const sgArrivalSchema = z.object({
  stop: z.string().trim().regex(/^\d{5}$/, "Singapore bus stop codes are 5 digits")
});

export const crowdSchema = z.object({
  line: z.string().trim().regex(/^[A-Z-]{3,6}$/)
});

export const flightsSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  r: z.coerce.number().min(10).max(250).optional()
});

export const flightRouteSchema = z.object({
  callsign: z.string().trim().regex(/^[A-Z0-9]{3,8}$/i)
});
