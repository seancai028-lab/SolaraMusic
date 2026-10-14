const MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
async function signToken(password: string, timestamp: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(timestamp)));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost(context: any) {
  const { request, env } = context;
  const passwordEnv = env.PASSWORD;
  const url = new URL(request.url);

  const body = await request.json().catch(() => ({ password: "" }));
  const providedPassword = typeof body.password === "string" ? body.password : "";

  if (typeof passwordEnv !== "string" || !passwordEnv) {
    return new Response(JSON.stringify({ error: "Server authentication is not configured" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  if (providedPassword === passwordEnv) {
    const issuedAt = String(Math.floor(Date.now() / 1000));
    const cookieSegments = [
      `auth=${issuedAt}.${await signToken(passwordEnv, issuedAt)}`,
      `Max-Age=${MAX_AGE_SECONDS}`,
      "Path=/",
      "SameSite=Lax",
      "HttpOnly",
    ];
    if (url.protocol === "https:") {
      cookieSegments.push("Secure");
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookieSegments.join("; "),
      },
    });
  }

  return new Response(JSON.stringify({ success: false }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
