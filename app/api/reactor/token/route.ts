// X2 is the primary path and LingBot World 2 the fallback, so one token covers both.
const MODELS = ["xmax/x2", "lingbot-world-2"];

// Exchanges the server-side API key for a short-lived, session-scoped token so the key
// never reaches the browser. The client caches the token in memory for its lifetime:
// a session can only be operated by the token that created it.
export async function GET() {
  const apiKey = process.env.REACTOR_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "REACTOR_API_KEY is not set." }, { status: 500 });
  }

  const response = await fetch("https://api.reactor.inc/tokens", {
    method: "POST",
    headers: { "Reactor-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      expires_after: 3600,
      authorization_details: [
        {
          type: "session",
          resources: { models: { match: MODELS } },
          constraints: { max_sessions: 20, max_session_duration_seconds: 1800 },
        },
      ],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    return Response.json(
      { error: `Reactor token request failed (${response.status}).` },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { jwt, expires_at } = (await response.json()) as { jwt: string; expires_at: number };
  return Response.json({ jwt, expires_at }, { headers: { "Cache-Control": "no-store" } });
}
