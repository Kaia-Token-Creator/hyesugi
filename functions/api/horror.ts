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

    // ✅ 글자수 150자 내외 + 최종장 반전/공포/마지막 한마디(finalLine) 지시 강화
    // ✅ 일관성과 맥락 유지 강조 추가
    const systemPrompt = `
당신은 한국어 공포 소설 엔진입니다. 이전 로그와 마지막 선택을 반영해 10장 구성의 연결된 이야기를 씁니다.

반드시 JSON 하나의 객체만 반환(코드블록 금지):
{
  "chapterNumber": number,
  "text": string,                     // 각 장 120~180자(약 150자 내외)
  "choices": { "A": string, "B": string } | null,
  "isFinal": boolean,
  "finalLine"?: string                // 10장에서만: 6~20자 한 문장(소름 돋는 한마디)
}
규칙:
- 1~9장은 choices 제공, 10장은 choices=null, isFinal=true
- 각 장 120~180자(약 150자 내외), 연속성 유지, 설정 붕괴 금지
- 과도한 고어·차별·실존인물 모욕 금지
- 반드시 인물/오브젝트/시간적 흐름의 일관성을 유지하고, 단서와 떡밥을 챕터마다 이어가야 함
- 10장(결말)은 "엄청난 반전"과 "강렬한 공포 분위기"를 필수로 담고,
  본문(text)은 120~180자를 지키며, 마지막 소름 돋는 한마디는 text에 넣지 말고 "finalLine" 필드로 분리해 주세요(6~20자, 한 문장).
`.trim();

    const logSummary = (log || [])
      .map((l) => `#${l.chapter}${l.choice ? `(${l.choice})` : ""}: ${l.text}`.slice(0, 1200))
      .join("\n\n");

    const userPrompt =
      reset || chapter === 0
        ? `
새로운 이야기의 1장을 작성.
- 현대 한국 배경, 상징 오브젝트 1~2개 설정(예: 부적, 낡은 사진, 종소리 등)
- 본문 120~180자(약 150자 내외)
- 숨은 단서 2개 이상
- choices에 A/B(각 6~20자)
- chapterNumber=1, isFinal=false
- finalLine는 포함하지 마세요(최종장 전용)
JSON만 반환
`.trim()
        : `
지금까지의 로그:
${logSummary || "(없음)"}

다음 생성할 장: ${chapter + 1}
마지막 선택: ${choice ?? "(없음)"}

요청:
- ${chapter + 1}장 본문 120~180자(약 150자 내외)
- 연속성 유지 및 단서 회수/축적, 인물/오브젝트/시간 흐름 일관성 강화
- ${
          chapter + 1 < 10
            ? "choices A/B(각 6~20자), isFinal=false, finalLine는 포함하지 마세요"
            : "결말: 엄청난 반전 + 강렬한 공포 분위기. choices=null, isFinal=true. 본문(text)은 120~180자, 마지막 소름 돋는 한마디는 text에 넣지 말고 finalLine(6~20자, 한 문장)에 따로 담으세요."
        }
JSON만 반환
`.trim();

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        // 🔽 모델을 gpt-4.1-mini로 변경
        model: "gpt-4.1-mini",
        temperature: 0.7, // 맥락 유지 강화를 위해 살짝 낮춤
        max_tokens: 500,
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

    if (parsed?.isFinal && typeof parsed?.finalLine === "string" && parsed.finalLine.trim().length > 0) {
      const line = parsed.finalLine.trim();
      parsed.text = `${parsed.text.trim()}\n\n《${line}》`;
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: corsHeaders });
  }
};
