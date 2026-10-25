// @ts-ignore Bun provides this module at runtime; its types may not be installed in the editor.
import { serve, type BunRequest } from "bun";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
//import { errorResponse} from "./utils/response";
// , errorJSONResponseCORS, successJSONResponseCORS,errorJSONResponse, successJSONResponse 

// Static HTML pages will be served using Bun.file to avoid HTMLBundle type issues.
// No need to import them as modules.

import { GaloisField256 } from "./services/galoisField";

const imageDir = "./images";



/**
 * Creates a standardized JSON Response with optional CORS headers enabled.
 */
export function jsonResponse<T>(data: T, status = 200, enableCors = true): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
  };

  if (enableCors) {
    headers["Access-Control-Allow-Origin"] = "*";
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, X-Session-ID, X-Correlation-ID";
  }

  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

/**
 * Creates a standardized error JSON Response.
 */
export function errorResponse(message: string, status = 400, enableCors = true): Response {
  return jsonResponse(
    {
      success: false,
      error: message,
      timestamp: new Date().toISOString(), // AS ISO 8601 UTC
    },
    status,
    enableCors
  );
}



(async function main() {
  // inits here
  await mkdir(imageDir, { recursive: true });

  const port = Number(Bun.env.APP_PORT ?? 3000);
  const host = Bun.env.APP_HOST ?? "0.0.0.0";
  const defaultGF = new GaloisField256(0x11b, 0x03);

  const server = serve({
    hostname: host,
    port: port,
    routes: {
      // root
      "/": () => {
        return new Response(Bun.file("./pages/profile.html"), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      },
      "/glow2": () => {
        return new Response(Bun.file("./pages/glow2.html"), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      },
      "/galois": () => {
        return new Response(Bun.file("./public/galois.html"), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      },
      "/api/galois/eval": async (req: BunRequest) => {
        try {
          const url = new URL(req.url);
          const a = parseInt(url.searchParams.get("a") ?? "0x57", 16);
          const b = parseInt(url.searchParams.get("b") ?? "0x83", 16);
          const poly = parseInt(url.searchParams.get("poly") ?? "0x11b", 16);
          const op = url.searchParams.get("op") ?? "mul";

          const engine = (poly === defaultGF.poly) ? defaultGF : new GaloisField256(poly);
          let result = 0;
          if (op === "add") result = engine.add(a, b);
          else if (op === "sub") result = engine.subtract(a, b);
          else if (op === "mul") result = engine.multiply(a, b);
          else if (op === "div") result = engine.divide(a, b);
          else if (op === "inv") result = engine.inverse(a);

          return jsonResponse({
            success: true,
            a,
            b,
            poly,
            op,
            result,
            hex: GaloisField256.toHexString(result),
            binary: GaloisField256.toBinaryString(result),
            polynomial: GaloisField256.toPolynomialString(result),
          });
        } catch (err: any) {
          return errorResponse(err.message, 400);
        }
      },

      
    
    },

    // Global catch-all block - public HTMLs and error

    async fetch(req: BunRequest) {
      const url = new URL(req.url);
      const path = new URL(req.url).pathname;
      //if (url.pathname === "/signin.html" || url.pathname === "/index.html") {
      //NOTE if html file is in public folder, it will be served here!
        const file = Bun.file(`./public${url.pathname}`);
        if (await file.exists()) {
          return new Response(file);
        }
      //}

      return errorResponse("Not Found", 404, true);
    },
  });
 

})().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});

console.log(`Evariste API running. http://localhost:3000`);
