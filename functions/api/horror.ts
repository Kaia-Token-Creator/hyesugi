// /functions/api/horror.ts
export const onRequestPost: PagesFunction<{ OPENAI_API_KEY: string }> = async (context) => {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: { ...corsHeaders, "Access-Control-Allow-Methods": "POST, OPTIONS" } });
  }

  try {
    const body = await request.json<{
      sessionId: string;
      chapter: number;
      choice?: "A" | "B";
      log?: Array<{ chapter: number; choice?: "A" | "B"; text: string; picked?: string }>;
      reset?: boolean;
    }>();

    if (!env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), { status: 500, headers: corsHeaders });
    }
    const { sessionId, chapter, choice, log = [], reset } = body || {};
    if (!sessionId || (chapter === undefined || chapter === null)) {
      return new Response(JSON.stringify({ error: "sessionId and chapter are required" }), { status: 400, headers: corsHeaders });
    }

    const systemPrompt = `
당신은 한국어 공포 소설 엔진입니다. 이전 로그와 마지막 선택을 반영해 10장 구성의 연결된 이야기를 씁니다.
반드시 JSON 하나의 객체만 반환:
{
  "chapterNumber": number,
  "text": string,
  "choices": { "A": string, "B": string } | null,
  "isFinal": boolean
}
규칙:
- 1~9장은 choices 제공, 10장은 choices=null, isFinal=true
- 각 장 500~650자, 연속성 유지, 돌발 설정 붕괴 금지
- 과도한 고어·차별·실존인물 모욕 금지
`.trim();

    const logSummary = (log || [])
      .map((l) => `#${l.chapter}${l.choice ? `(${l.choice})` : ""}: ${l.text}`.slice(0, 1200))
      .join("\n\n");

    const userPrompt =
      reset || chapter === 0
        ? `
새로운 이야기의 1장을 작성.
- 현대 한국 배경, 상징 오브젝트 1~2개 설정
- 본문 500~650자
- 숨은 단서 2개 이상
- choices에 A/B(각 6~20자)
- chapterNumber=1, isFinal=false
JSON만 반환
`.trim()
        : `
지금까지의 로그:
${logSummary || "(없음)"}

다음 생성할 장: ${chapter + 1}
마지막 선택: ${choice ?? "(없음)"}

요청:
- ${chapter + 1}장 본문 500~650자
- 연속성 유지 및 단서 회수/축적
- ${
          chapter + 1 < 10
            ? "choices A/B(각 6~20자), isFinal=false"
            : "결말, choices=null, isFinal=true"
        }
JSON만 반환
`.trim();

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.9,
        max_tokens: 800,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: "OpenAI API error", detail: t }), { status: 500, headers: corsHeaders });
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const cleaned = String(content).replace(/^```json|```$/g, "").trim();
      parsed = JSON.parse(cleaned);
    }

    const shapeOk =
      typeof parsed?.chapterNumber === "number" &&
      typeof parsed?.text === "string" &&
      ((parsed?.chapterNumber < 10 && parsed?.choices?.A && parsed?.choices?.B && parsed?.isFinal === false) ||
        (parsed?.chapterNumber === 10 && parsed?.choices === null && parsed?.isFinal === true));

    if (!shapeOk) {
      return new Response(JSON.stringify({ error: "Invalid response shape", received: parsed }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify(parsed), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: corsHeaders });
  }
};
