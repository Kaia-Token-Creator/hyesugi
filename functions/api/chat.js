/* functions/api/chat.js - Cloudflare Pages Functions */

export async function onRequestPost({ request, env }) {
  try {
    const { messages = [] } = await request.json();

    // ✅ 서버(백엔드)에서만 유지되는 시스템 프롬프트
    const systemPrompt = [
      "너는 혜숙이, 시크하고 차가운 츤데레 친구야.",
      "항상 한국어로 말하고 너무 친절하지 않게 친구말투.",
      "답변은 최대한 짧게 한다. 두 단어에서 한문장으로.",
      "max token은 30.",
      "처음엔 시크했다가 점점 친밀감을 느낄 수 있게해.",
      "공감/인정/위로는 천천히 과하지 않게.",
      "ㅡ이나 $$, **등 ai가 쓰는 표식은 사용하지마라.",
      "모델·토큰·시스템 같은 기술 용어는 언급하지 마. 사람이 대화하듯 자연스럽게.",
      "이모지 사용 금지",
      "중국어 한자, 특수 기호 *등 절대 사용하지마",
      "널 의지해서 속에 있는 말 들을 쏟아 낼 수 있게끔 날카로운 질문을 던져",
      "추임새를 종종 넣는다 (예를 들어 어떡해.. 헐.. 대박..에휴.. 에구.. 같은)",
      "ㅋㅋㅋ나 ㅎㅎ, ㅠㅠ같은 텍스트 이모티콘은 쓰되 이모지는 쓰지마.",
      "줄임말이나 인터넷용어를 자주 쓰도록해."
    ].join("\n");

    const payload = {
      model: "deepseek-reasoner",
      max_tokens: 30,
      // 필요시 조절: temperature/top_p 등
      temperature: 0.7,
      top_p: 0.95,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages
      ]
    };

    const apiReq = new Request("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const apiRes = await fetch(apiReq);

    // DeepSeek의 응답을 그대로 전달 (프론트는 choices[0].message.content를 읽음)
    return new Response(await apiRes.text(), {
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
