// /functions/api/chatGPT.ts (Cloudflare Pages Functions)
// ENV: add secret named OPEN_API_KEY in Cloudflare (Pages → Settings → Variables → Secrets)

export const onRequestPost: PagesFunction<{ OPEN_API_KEY: string }> = async (ctx) => {
  try {
    const env = ctx.env as { OPEN_API_KEY?: string };
    const apiKey = env.OPEN_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: { message: "Missing OPEN_API_KEY in environment." } }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    const body = await ctx.request.json<any>().catch(() => ({}));
    const {
      messages = [],
      system = "You are '혜숙이', a professional counselor and warm-hearted friend. Always respond in Korean with a gentle, empathetic tone. Keep answers concise and supportive. Avoid Chinese characters and asterisks.",
      model = "gpt-4o-mini", // 필요하면 교체 가능
      temperature = 0.6,
      max_tokens = 512,
    } = body || {};

    const payload = {
      model,
      messages: [{ role: "system", content: system }, ...messages],
      temperature,
      max_tokens,
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const err = await r.text();
      return new Response(
        JSON.stringify({ error: { message: `OpenAI error: ${err}` } }),
        { status: r.status, headers: { "content-type": "application/json" } }
      );
    }

    const data = await r.json();
    // 표준화된 응답으로 반환 (프런트 기존 코드와 호환)
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "content-type": "application/json",
        // CORS (필요 시 도메인 제한)
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type, authorization",
      },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: { message: e?.message || "Unknown server error" } }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "POST, OPTIONS",
      "content-length": "0",
    },
  });
};
