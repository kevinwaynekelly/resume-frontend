// /functions/api/[[path]].ts
export const onRequest: PagesFunction<{
  UPSTREAM_URL: string,      // example: "https://api.kevinwaynekelly.com"
  CLIENT_TOKEN: string,      // same value as the Worker's CLIENT_TOKEN secret
  ALLOWED_ORIGIN: string     // example: "https://resume.kevinwaynekelly.com"
}> = async (ctx) => {
  const { request, env } = ctx;
  const reqUrl = new URL(request.url);

  // Build upstream URL. Everything after /api goes to the Worker.
  const upstreamBase = new URL(env.UPSTREAM_URL);
  // Keep query string
  const pathAfterApi = reqUrl.pathname.replace(/^\/api\/?/, "");
  const upstreamUrl = new URL(upstreamBase.toString());
  upstreamUrl.pathname = pathAfterApi ? `/${pathAfterApi}` : "/";
  upstreamUrl.search = reqUrl.search;

  // Clone headers, inject token and strict origin for the Worker
  const fwdHeaders = new Headers(request.headers);
  fwdHeaders.set("X-Client-Token", env.CLIENT_TOKEN);
  fwdHeaders.set("Origin", env.ALLOWED_ORIGIN);

  // Do not leak browser cookies or irrelevant headers upstream
  fwdHeaders.delete("Cookie");

  // Forward body for non-GET methods
  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

  // Preflight response, useful if you ever call from another subdomain
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": reqUrl.origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Client-Token",
        "Access-Control-Max-Age": "600",
        "Vary": "Origin",
      },
    });
  }

  // Call your Worker
  const upstreamResp = await fetch(upstreamUrl.toString(), {
    method,
    headers: fwdHeaders,
    body,
    redirect: "manual",
  });

  // Pass through response body, normalize CORS for your page origin
  const buf = await upstreamResp.arrayBuffer();
  const outHeaders = new Headers(upstreamResp.headers);
  outHeaders.set("Access-Control-Allow-Origin", reqUrl.origin);
  outHeaders.set("Vary", "Origin");
  // Optional hardening for the browser response
  outHeaders.set("X-Content-Type-Options", "nosniff");
  outHeaders.set("Cache-Control", "no-store");

  return new Response(buf, { status: upstreamResp.status, headers: outHeaders });
};
