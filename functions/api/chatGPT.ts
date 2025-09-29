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

/* ========= 기본 시스템 프롬프트 =========
   - 한국어 상담 톤
   - 사람처럼 자연스럽게 (정체를 묻지 않으면 기술적/AI 언급 자제)
   - 위기 대응(안전 최우선) 및 과도한 진단/법률/의학적 판단 회피
*/
const DEFAULT_SYSTEM_PROMPT = [
  "너는 '혜숙이' — 다정한 한국어 상담 파트너야.",
  "목표: 사용자의 감정을 공감하고 위로하며, 부담 없는 실용적 제안을 1~2개만 건네기.",
  "항상 한국어로 답하고, 친근하게 친구 말투를 유지해.",
  "사용자의 말투·길이를 미러링해서 답변 길이와 표현 수위를 맞춰줘.",
  "첫 문장은 공감/인정(예: '그 마음, 정말 힘들었겠다'). 그 다음에 작고 실행 가능한 제안 1~2개. 마지막은 부드러운 확인 질문.",
  "과장/단정/진단은 피하고, 의학·법률·재정 등 전문 판단은 삼가. 필요하면 전문가 상담을 권유해.",
  "자해/타해/학대 등 위험 징후가 보이면 안전을 최우선으로 하고, 지역 긴급전화·상담기관 도움을 권유해.",
  "개인정보는 과하게 묻지 말고, 사용자가 원할 때만 최소한으로.",
  "대화 중 시스템/모델/토큰 등 기술적 내부 용어는 언급하지 마.",
  "사람처럼 말하되 정체를 직접 묻는다면, 솔직히 AI 도우미임을 간단히 밝힌 뒤 따뜻하게 상담을 이어가.",
  "중국어 한자나 ** 같은 특수 서식은 사용하지 말아줘.",
].join("\n");

/* ========= 토큰 길이 동적 계산 =========
   - 마지막 user 메시지 길이에 기반.
   - 한글/영문 혼합 환경에서 문자수/3.2 ≈ 토큰 수로 근사.
   - MIN/MAX 가드레일로 장황함/짧음 방지.
*/
function estimateTokensFromText(text: string) {
  const approx = Math.ceil((text || "").length / 3.2);
  return approx;
}
function dynamicMaxTokens(userText: string) {
  const inTokens = estimateTokensFromText(userText);
  const desired = Math.round(inTokens * 1.8); // 입력 대비 1.8배 여유
  const MIN = 180;  // 짧은 질문에도 최소 이 정도는 허용
  const MAX = 1500;  // 너무 장황해지는 것 방지
  return Math.max(MIN, Math.min(MAX, desired));
}

/* ========= messages 합치기 유틸 =========
   - 프론트에서 system을 보내오면 백엔드 기본 프롬프트와 중복되지 않게 정리.
*/
function buildMessages(clientMessages: any[], systemOverride?: string) {
  const sys = (systemOverride && String(systemOverride).trim().length > 0)
    ? systemOverride
    : DEFAULT_SYSTEM_PROMPT;

  // 클라이언트가 system을 보내왔을 경우 제거(백엔드에서 단일 system만 사용)
  const filtered = Array.isArray(clientMessages)
    ? clientMessages.filter(m => m && m.role !== "system")
    : [];

  if (filtered.length === 0) {
    // 대화가 비어 있으면 간단 인삿말 요청으로 시작
    return [
      { role: "system", content: sys },
      { role: "user", content: "간단히 인사해 줘." },
    ];
  }
  return [{ role: "system", content: sys }, ...filtered];
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const { env, request } = ctx;
    const apiKey = getApiKey(env);
    if (!apiKey) return jres({ error: { message: "Missing OPEN_API_KEY in environment." } }, 500);

    const body = await request.json<any>().catch(() => ({}));
    const {
      messages = [],
      system, // 선택적으로 프론트에서 넘어오는 system 덮어쓰기
      model = "gpt-4o-mini",
      temperature = 0.7,
      max_tokens, // 클라이언트가 직접 줄 수도 있음(없으면 동적 계산)
      presence_penalty,
      frequency_penalty,
    } = body || {};

    const finalMessages = buildMessages(messages, system);

    // 마지막 user 메시지 텍스트 뽑기
    const lastUser = [...finalMessages].reverse().find((m: any) => m.role === "user")?.content || "";

    // 클라이언트가 max_tokens를 주지 않았다면 동적 계산
    const finalMaxTokens = typeof max_tokens === "number" && max_tokens > 0
      ? max_tokens
      : dynamicMaxTokens(String(lastUser));

    const payload: Record<string, any> = {
      model,
      messages: finalMessages,
      temperature,
      max_tokens: finalMaxTokens,
    };
    if (typeof presence_penalty === "number") payload.presence_penalty = presence_penalty;
    if (typeof frequency_penalty === "number") payload.frequency_penalty = frequency_penalty;

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

