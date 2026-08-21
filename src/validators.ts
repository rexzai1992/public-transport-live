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

export const sgArrivalSchema = z.object({
  stop: z.string().trim().regex(/^\d{5}$/, "Singapore bus stop codes are 5 digits")
});
