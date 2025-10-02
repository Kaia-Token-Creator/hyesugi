// /functions/api/horror.ts
export const onRequestPost: PagesFunction<{ GEMINI_API_KEY: string }> = async (context) => {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await request.json<{
      sessionId: string;
      chapter: number;
      choice?: "A" | "B";
      log?: Array<{ chapter: number; choice?: "A" | "B"; text: string; picked?: string }>;
      reset?: boolean;
    }>();

    if (!env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing GEMINI_API_KEY" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const { sessionId, chapter, choice, log = [], reset } = body || {};
    if (!sessionId || (chapter === undefined || chapter === null)) {
      return new Response(JSON.stringify({ error: "sessionId and chapter are required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // reset이면 과거 로그 무시, 아니면 최근 2장만 전달
    const effectiveLogAll = reset ? [] : (log || []);
    const effectiveLog = effectiveLogAll.slice(-2);

    // === 시스템 프롬프트
    const systemPrompt = `
당신은 한국어 공포 소설 엔진입니다.  
사용자의 선택(A 또는 B)에 따라 반드시 다른 사건 전개가 이어지도록 작성하세요.  
이전 로그와 마지막 선택은 반드시 반영해야 하며, 같은 전개로 합치지 마세요.  

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
- 각 장은 반드시 분기된 선택의 결과로 이어질 것
- 각 장 120~180자(약 150자 내외)
- 인물/오브젝트/시간 흐름의 일관성 유지, 단서와 떡밥은 이어져야 함
- 과도한 고어·차별·실존인물 모욕 금지
- 10장은 "엄청난 반전"과 "강렬한 공포 분위기"를 담고, 마지막 한마디는 finalLine에 별도로 넣기
`.trim();

    const logSummary = (effectiveLog || [])
      .map((l) => `#${l.chapter}${l.choice ? `(${l.choice})` : ""}: ${l.text}`.slice(0, 1200))
      .join("\n\n");

    const userPrompt =
      reset || chapter === 0
        ? `
새로운 이야기의 1장을 작성.  
- 현대 한국 배경, 오브젝트와 단서를 창의적으로 설정  
- 본문 120~180자(약 150자 내외)  
- 숨은 단서 2개 이상 포함  
- choices에 A/B(각 6~20자)  
- chapterNumber=1, isFinal=false  
- finalLine는 포함하지 마세요(최종장 전용)  
JSON만 반환
`.trim()
        : `
지금까지의 로그:
${logSummary || "(없음)"}

사용자가 직전 장에서 고른 선택: ${choice}

요청:
- ${chapter + 1}장 본문 120~180자(약 150자 내외)
- 반드시 "${choice}" 선택의 직접적인 결과로 이어지는 사건 전개만 작성할 것
- 다른 선택의 내용은 절대 포함하지 말 것
- 같은 사건으로 합치지 말고, 선택에 따라 새로운 단서/사건/분위기를 다르게 제시
- 연속성 유지 및 단서 회수/축적
- ${
          chapter + 1 < 10
            ? "choices A/B(각 6~20자), isFinal=false, finalLine는 포함하지 마세요"
            : "결말: 엄청난 반전 + 강렬한 공포 분위기. choices=null, isFinal=true. 본문(text)은 120~180자, 마지막 소름 돋는 한마디는 text에 넣지 말고 finalLine(6~20자, 한 문장)에 따로 담으세요."
        }
JSON만 반환
`.trim();

    // === Gemini 2.5 Flash 호출
    const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
    const r = await fetch(`${endpoint}?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          topK: 64,
          presencePenalty: 0.7,
          frequencyPenalty: 0.4,
          response_mime_type: "application/json",
          maxOutputTokens: 800,
        },
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: "Gemini API error", detail: t }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const data = await r.json();
    const content =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => (typeof p?.text === "string" ? p.text : ""))
        .join("") ?? "";

    if (!content) {
      return new Response(JSON.stringify({ error: "Empty response from Gemini", raw: data }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const cleaned = String(content).replace(/^```json|```$/g, "").trim();
      parsed = JSON.parse(cleaned);
    }

    // 응답 스키마 검증
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

    // 10장 finalLine 보강 표시
    if (parsed?.isFinal && typeof parsed?.finalLine === "string" && parsed.finalLine.trim().length > 0) {
      const line = parsed.finalLine.trim();
      parsed.text = `${parsed.text.trim()}\n\n《${line}》`;
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
};
