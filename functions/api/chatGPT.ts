// /functions/api/chatGPT.ts  — Cloudflare Pages Functions
// Secrets: OPEN_API_KEY (Pages → Settings → Variables → Secrets)
// 주의: 파일명 대소문자 = 경로 대소문자 → 이 파일이면 URL은 /api/chatGPT

type Env = {
  OPEN_API_KEY: string;
};

const JSON_HEADERS = { "content-type": "application/json" };
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "POST, OPTIONS, GET",
};

function jres(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...JSON_HEADERS, ...CORS_HEADERS } });
}

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, { headers: { ...CORS_HEADERS, "content-length": "0" } });

/** 헬스체크: /api/chatGPT GET → {ok:true} */
export const onRequestGet: PagesFunction<Env> = async () => jres({ ok: true });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const { env, request } = ctx;
    const apiKey = env.OPEN_API_KEY;
    if (!apiKey) return jres({ error: { message: "Missing OPEN_API_KEY in environment." } }, 500);

    // 프런트에서 보낸 페이로드
    const body = await request.json().catch(() => ({} as any));
    // 프런트 기본 형태와 호환: { model, messages, system, temperature, max_tokens }
    const {
      messages = [],
      system = "You are '혜숙이', a professional counselor and warm-hearted friend. Always respond in Korean with a gentle, empathetic tone. Keep answers concise and supportive. Avoid Chinese characters and asterisks.",
      model = "gpt-4o-mini", // 안전 기본값
      temperature = 0.6,
      max_tokens = 512,
    } = body || {};

    // 방어: messages가 비어있으면 system+placeholder라도 보냄
    const finalMessages =
      (Array.isArray(messages) && messages.length > 0)
        ? [{ role: "system", content: system }, ...messages]
        : [
            { role: "system", content: system },
            { role: "user", content: "간단히 인사해 줘." },
          ];

    const payload = {
      model,
      messages: finalMessages,
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

    const text = await r.text(); // 항상 텍스트로 받아 에러/성공 모두 표준화
    // 디버그: OpenAI에서 에러가 오면 그대로 넘겨서 프런트에서 메시지 보이게
    if (!r.ok) return jres({ error: { message: `OpenAI error: ${text}` } }, r.status);

    // 성공 시 OpenAI 원본 그대로 반환(프런트가 data.choices[0].message.content 사용)
    try {
      const data = JSON.parse(text);
      return jres(data, 200);
    } catch {
      // 혹시 JSON 파싱 실패 시 원문 전달
      return jres({ error: { message: `Malformed JSON from OpenAI: ${text}` } }, 502);
    }
  } catch (e: any) {
    return jres({ error: { message: e?.message || "Unknown server error" } }, 500);
  }
};
