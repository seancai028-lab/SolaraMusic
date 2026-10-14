const PUBLIC_PATH_PATTERNS = [/^\/login(?:\/|$)/, /^\/api\/login(?:\/|$)/];
const PUBLIC_FILE_EXTENSIONS = new Set([
  ".css",
  ".js",
  ".png",
  ".svg",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".txt",
  ".map",
  ".json",
  ".woff",
  ".woff2",
]);

function hasPublicExtension(pathname: string): boolean {
  const lastDotIndex = pathname.lastIndexOf(".");
  if (lastDotIndex === -1) {
    return false;
  }
  const extension = pathname.slice(lastDotIndex).toLowerCase();
  return PUBLIC_FILE_EXTENSIONS.has(extension);
}

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATH_PATTERNS.some((pattern) => pattern.test(pathname)) ||
    hasPublicExtension(pathname)
  );
}

const COOKIE_TTL = 400 * 24 * 60 * 60;
async function signToken(password: string, timestamp: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(timestamp)));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
async function authMiddleware(context: any) {
  const { request, env } = context;
  const password = env.PASSWORD;

  if (typeof password !== "string" || !password) {
    return new Response(JSON.stringify({ error: "Server authentication is not configured" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const url = new URL(request.url);
  // 本地回环发起的内部请求（如 Docker 容器内 Node.js 转发给 Wrangler）直接放行
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
    return context.next();
  }

  const pathname = url.pathname;
  if (isPublicPath(pathname)) {
    return context.next();
  }

  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies: Record<string, string> = {};
  cookieHeader.split(";").forEach((part) => {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) {
      return;
    }
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (key) {
      cookies[key] = value;
    }
  });

  const [issuedAt, signature] = (cookies.auth || "").split(".");
  const issued = Number(issuedAt);
  const validTime = /^\d+$/.test(issuedAt || "") && Number.isSafeInteger(issued) && issued <= Math.floor(Date.now() / 1000) && issued > Math.floor(Date.now() / 1000) - COOKIE_TTL;
  if (validTime && signature && signature === await signToken(password, issuedAt)) {
    const response = await context.next();
    const headers = new Headers(response.headers);
    const now = String(Math.floor(Date.now() / 1000));
    const cookie = [`auth=${now}.${await signToken(password, now)}`, `Max-Age=${COOKIE_TTL}`, "Path=/", "SameSite=Lax", "HttpOnly"];
    if (url.protocol === "https:") cookie.push("Secure");
    headers.append("Set-Cookie", cookie.join("; "));
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }

  // API 路由未授权时返回 401 JSON，杜绝返回 HTML 重定向导致前端 JSON 解析崩溃
  if (pathname.startsWith("/proxy") || pathname.startsWith("/api/") || pathname.startsWith("/palette")) {
    return new Response(JSON.stringify({ error: "Unauthorized", message: "Login required" }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const loginUrl = new URL("/login", url);
  return Response.redirect(loginUrl.toString(), 302);
}

async function i18nMiddleware(context: any) {
  const { env, next } = context;
  const response = await next();
  const language = env.language || env.LANGUAGE;
  
  if (language === "ENG" && response.headers.get("content-type")?.includes("text/html")) {
    return new HTMLRewriter().on("head", {
      element(element: any) {
        element.prepend(`<script>window.SITE_LANGUAGE = "ENG";</script>`, { html: true });
      }
    }).transform(response);
  }
  
  return response;
}

export const onRequest = [authMiddleware, i18nMiddleware];
