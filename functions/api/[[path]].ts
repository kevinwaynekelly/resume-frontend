export const onRequest: PagesFunction<{
  UPSTREAM_URL: string;
  CLIENT_TOKEN: string;
  ALLOWED_ORIGIN: string;
}> = async (ctx) => {
  const { request, env } = ctx;

  // Guard: required envs
  if (!env.UPSTREAM_URL || !/^https?:\/\//i.test(env.UPSTREAM_URL)) {
    return new Response("Misconfigured UPSTREAM_URL", { status: 500 });
  }
  if (!env.CLIENT_TOKEN) {
    return new Response("Missing CLIENT_TOKEN (Pages env)", { status: 500 });
  }
  if (!env.ALLOWED_ORIGIN) {
    return new Response("Missing ALLOWED_ORIGIN (Pages env)", { status: 500 });
  }

  const reqUrl = new URL(request.url);

  // Build upstream URL robustly
  const pathAfterApi = reqUrl.pathname.replace(/^\/api\/?/, "");
  const upstreamUrl = new URL(env.UPSTREAM_URL);
  upstreamUrl.pathname = pathAfterApi ? `/${pathAfterApi}` : "/";
  upstreamUrl.search = reqUrl.search;

  // Clone headers, inject token and strict origin for the Worker
  const fwdHeaders = new Headers(request.headers);
  fwdHeaders.set("X-Client-Token", env.CLIENT_TOKEN);
  fwdHeaders.set("Origin", env.ALLOWED_ORIGIN);
  fwdHeaders.delete("Cookie");

  const method = request.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

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

  try {
    const upstreamResp = await fetch(upstreamUrl.toString(), {
      method,
      headers: fwdHeaders,
      body,
      redirect: "manual",
    });

    const buf = await upstreamResp.arrayBuffer();
    const outHeaders = new Headers(upstreamResp.headers);
    outHeaders.set("Access-Control-Allow-Origin", reqUrl.origin);
    outHeaders.set("Vary", "Origin");
    outHeaders.set("X-Content-Type-Options", "nosniff");
    outHeaders.set("Cache-Control", "no-store");

    return new Response(buf, { status: upstreamResp.status, headers: outHeaders });
  } catch (e) {
    // Network or URL construction error
    return new Response("Proxy fetch failed", { status: 502 });
  }
};
