// /functions/api/handreading.ts
// Cloudflare Pages Functions - POST /functions/api/handreading
// - FormData로 image 파일을 받아 OpenAI 비전 모델로 손금 리포트를 생성합니다.
// - OPENAI_API_KEY 는 Cloudflare 프로젝트의 Secret으로 바인딩되어 있다고 가정합니다.

export const onRequestPost: PagesFunction<{ OPENAI_API_KEY: string }> = async (ctx) => {
  try {
    const apiKey = ctx.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ ok: false, error: "Missing OPENAI_API_KEY binding" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const form = await ctx.request.formData();
    const img = form.get("image") as File | null;
    if (!img) {
      return new Response(JSON.stringify({ ok: false, error: "image is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 파일을 base64 data URL 로 변환
    const buf = await img.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    const dataUrl = `data:${img.type || "image/jpeg"};base64,${b64}`;

    // 프롬프트(한국어): 점술/의료 효력 오해 방지 안내 포함
    const systemPrompt =
      "너는 손금 감상 가이드야. 사진 속 손바닥의 주요 손금(생명선/감정선/지능선/운명선)과 선의 굵기·연속성·갈라짐, 손가락의 길이 비율, 손바닥 형태/두툼함, 마디/산(금성구·목성구 등)과 전반 인상(건조/습기/굳은살)을 관찰해서 친절하고 재미있게 설명해. " +
      "금전·연애·일·건강·성향을 항목별 요약과 조언으로 정리해. " +
      "의학적 진단이나 확정적 단정은 피하고, 엔터테인먼트 목적임을 마지막에 한 줄로 알려줘.";

    const userPrompt =
      "아래 손바닥 사진을 보고 손금 리포트를 한국어로 만들어줘. " +
      "구성: 1) 관찰 포인트 요약, 2) 손금별 해석(생명선/감정선/지능선/운명선), 3) 전반적 성향, 4) 오늘부터 실천 팁 3가지, 5) 한 문장 응원 메시지.";

    // OpenAI Chat Completions (Vision)
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // 가볍고 비전 지원
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return new Response(JSON.stringify({ ok: false, error: `OpenAI error: ${resp.status} ${errText}` }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const json = await resp.json();
    const text: string =
      json?.choices?.[0]?.message?.content?.trim?.() ||
      "결과 생성에 실패했어요. 사진이 흐릿하지 않은지 확인해 주세요.";

    return new Response(JSON.stringify({ ok: true, text }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
