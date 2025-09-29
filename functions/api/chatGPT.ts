// /functions/api/chatGPT.ts — Cloudflare Pages Functions
// Secrets: OPEN_API_KEY (권장) 또는 OPENAI_API_KEY (호환)
// NOTE: 배포 후 /api/chatGPT?diag=1, /api/chatGPT?probe=1 로 서버 자체 진단 가능

type Env = { OPEN_API_KEY?: string; OPENAI_API_KEY?: string };

const JSON_HEADERS = { "content-type": "application/json" };
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "POST, OPTIONS, GET",
};

const jres = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...JSON_HEADERS, ...CORS_HEADERS } });

const getApiKey = (env: Env) => (env.OPEN_API_KEY || env.OPENAI_API_KEY || "").toString().trim();

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, { headers: { ...CORS_HEADERS, "content-length": "0" } });

/** GET: 헬스체크 & 진단
 *  - /api/chatGPT                → { ok: true }
 *  - /api/chatGPT?diag=1         → { hasKey: boolean, keyLen: number }
 *  - /api/chatGPT?probe=1        → OpenAI에 "ping" 호출 결과(성공/에러 원문 표시)
 */
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  if (url.searchParams.has("diag")) {
    const key = getApiKey(env);
    return jres({ hasKey: !!key, keyLen: key ? key.length : 0 });
  }
  if (url.searchParams.has("probe")) {
    const apiKey = getApiKey(env);
    if (!apiKey) return jres({ error: { message: "Missing OPEN_API_KEY/OPENAI_API_KEY" } }, 500);
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Respond in Korean, one short word only." },
            { role: "user", content: "ping" },
          ],
          max_tokens: 8,
        }),
      });
      const text = await r.text();
      if (!r.ok) return jres({ probe: "openai_error", status: r.status, body: text }, r.status);
      return jres({ probe: "ok", body: JSON.parse(text) });
    } catch (e: any) {
      return jres({ probe: "fetch_fail", message: e?.message || "unknown" }, 500);
    }
  }
  return jres({ ok: true });
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const { env, request } = ctx;
    const apiKey = getApiKey(env);
    if (!apiKey) return jres({ error: { message: "Missing OPEN_API_KEY in environment." } }, 500);

    const body = await request.json<any>().catch(() => ({}));
    const {
      messages = [],
      system = "You are '혜숙이', a professional counselor and warm-hearted friend. Always respond in Korean with a gentle, empathetic tone. Keep answers concise and supportive. Avoid Chinese characters and asterisks.",
      model = "gpt-4o-mini",
      temperature = 0.6,
      max_tokens = 512,
    } = body || {};

    const finalMessages =
      Array.isArray(messages) && messages.length > 0
        ? [{ role: "system", content: system }, ...messages]
        : [{ role: "system", content: system }, { role: "user", content: "간단히 인사해 줘." }];

    const payload = { model, messages: finalMessages, temperature, max_tokens };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    if (!r.ok) return jres({ error: { message: `OpenAI error: ${text}` } }, r.status);

    try {
      const data = JSON.parse(text);
      return jres(data, 200);
    } catch {
      return jres({ error: { message: `Malformed JSON from OpenAI: ${text}` } }, 502);
    }
  } catch (e: any) {
    return jres({ error: { message: e?.message || "Unknown server error" } }, 500);
  }
};
