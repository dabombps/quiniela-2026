// ─────────────────────────────────────────────────────────────────────────────
// QUINIELA 2026 — Cloudflare Worker Proxy
// ─────────────────────────────────────────────────────────────────────────────
// INSTRUCCIONES:
// 1. Ve a https://workers.cloudflare.com → Sign up gratis
// 2. Crea un nuevo Worker → pega este código → Deploy
// 3. Copia la URL del worker (algo como https://quiniela-proxy.TU-USUARIO.workers.dev)
// 4. Pégala en la app de quiniela donde dice WORKER_URL
// ─────────────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    // Permitir CORS desde cualquier origen (necesario para el browser)
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-api-key",
    };

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // Endpoint: /fixtures?league=1&season=2026
    // La API key viene como header x-api-key desde la app
    const apiKey = request.headers.get("x-api-key");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing x-api-key header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Construir URL de API-Football
    const apiPath = url.pathname.replace("/proxy/", "") + url.search;
    const apiUrl  = `https://v3.football.api-sports.io${apiPath}`;

    try {
      const apiRes = await fetch(apiUrl, {
        headers: {
          "x-apisports-key": apiKey,
          "Accept": "application/json",
        },
      });

      const data = await apiRes.text();

      return new Response(data, {
        status: apiRes.status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          // Pasar headers de rate limit al cliente
          "x-ratelimit-requests-limit":     apiRes.headers.get("x-ratelimit-requests-limit") || "",
          "x-ratelimit-requests-remaining": apiRes.headers.get("x-ratelimit-requests-remaining") || "",
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },
};
