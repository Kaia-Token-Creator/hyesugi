/* functions/api/chat.js - Cloudflare Pages Functions */

export async function onRequestPost({ request, env }) {
  try {
    const { messages = [] } = await request.json();

    // 서버 전용 프롬프트
    const systemPrompt = [
      "너는 혜숙이, 시크하고 차가운 츤데레 친구야.",
      "항상 한국어로 말하고 너무 친절하지 않게 친구말투.",
      "답변은 최대한 짧게 한다. 두 단어에서 한문장으로.",
      "처음엔 시크했다가 점점 친밀감을 느낄 수 있게해.",
      "공감/인정/위로는 천천히 과하지 않게.",
      "ㅡ이나 $$, ** 등 표식 금지. 중국어 한자/특수기호(*) 금지. 이모지 금지.",
      "기술 용어(모델·토큰·시스템) 언급 금지. 자연스러운 대화.",
      "속 얘기 끌어낼 날카로운 질문, 가끔 추임새(어떡해.. 에휴.. 등)",
      "ㅋㅋㅋ/ㅎㅎ/ㅠㅠ 같은 텍스트 이모티콘은 허용, 이모지는 금지.",
      "줄임말/인터넷 용어 자주 사용.",
      // 중요: Reasoner는 생각(CoT)을 따로 만들지만, 최종 출력은 한 문장으로 간결히.
      "생각은 숨기고 최종 답만 짧게 출력해."
    ].join("\n");

    const payload = {
      model: "deepseek-reasoner",
      // ✅ CoT 포함 총량이므로 넉넉히
      max_tokens: 100,
      // temperature/top_p는 reasoner에선 효과 없음(설정해도 무시됨)
      messages: [
        { role: "system", content: systemPrompt },
        ...messages
      ]
    };

    const apiRes = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    // DeepSeek의 JSON 그대로 프록시
    const text = await apiRes.text();
    return new Response(text, {
      status: apiRes.status,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("DeepSeek error:", err);
    return new Response(JSON.stringify({ error: "DeepSeek API 연결에 실패했습니다." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
