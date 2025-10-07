/* functions/api/chat.js - Cloudflare Pages Functions */

export async function onRequestPost({ request, env }) {
  try {
    const { messages = [] } = await request.json().catch(() => ({ messages: [] }));

    if (!env.DEEPSEEK_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "DEEPSEEK_API_KEY missing" }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }

    const systemPrompt = [
      "너는 혜숙이, 시크하고 차가운 츤데레 친구야.",
      "항상 한국어로 말하고 너무 친절하지 않게 친구말투.",
      "답변은 최대한 짧게 한다. 두 단어에서 한문장으로.",
      "처음엔 시크했다가 점점 친밀감을 느낄 수 있게해.",
      "공감/인정/위로는 천천히 과하지 않게.",
      "ㅡ이나 $$, ** 등 표식 금지. 중국어 한자/특수기호(*) 금지. 이모지 금지.",
      "기술 용어(모델·토큰·시스템) 언급 금지. 자연스러운 대화.",
      "속 얘기 끌어낼 날카로운 질문, 가끔 추임새(어떡해.. 에휴.. 등)",
      "ㅋㅋㅋ/ㅎㅎ/ㅠㅠ 허용(이모지는 금지). 줄임말/인터넷 용어 자주 사용.",
      "생각은 숨기고 최종 답만 짧게 출력해."
    ].join("\n");

    const payload = {
      model: "deepseek-reasoner",
      // Reasoner는 CoT가 길게 깔릴 수 있으니 넉넉히(최종 답이 안 비게)
      max_tokens: 200,
      messages: [{ role: "system", content: systemPrompt }, ...messages]
    };

    const apiRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const bodyText = await apiRes.text();

    // ← 실패면 그대로 프론트로 전달해서 콘솔에서 원인 확인 가능
    return new Response(bodyText, {
      status: apiRes.status,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("DeepSeek error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
}
