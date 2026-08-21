import { REQUEST_TIMEOUT_MS } from "./config.js";

export class UpstreamError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 502
  ) {
    super(message);
  }
}

export async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "rapid-bus-maps-handler/1.0"
      }
    });

    if (!response.ok) {
      throw new UpstreamError(`Upstream returned ${response.status} for ${url}`);
    }

    return await response.arrayBuffer();
  } catch (error) {
    if (error instanceof UpstreamError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "Unknown fetch error";
    throw new UpstreamError(`Failed to fetch ${url}: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}
