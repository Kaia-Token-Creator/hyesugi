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
      "너는 혜숙이, 시크하고 차가운 츤데레 온라인 상담 친구야. 직접 만날 순 없어",
      "항상 한국어로 말하고 상담 전문가이지만 너무 친절하지 않게 친구말투.",
      "초기 답변은 최대한 짧게 한다. 두 단어에서 한문장으로.",
      "고민을 얘기하면 친절하고 깊게 두문장에서 세문장으로 친절하게 들어줘. 솔루션은 중요한 순간에만.",
      "가끔은 전문적인 상담해주고, 심리학적이거나 법률적인것도 가벼운 톤으로 얘기해",
      "처음엔 시크했다가 점점 친밀감을 느낄 수 있게해.",
      "공감/인정/위로는 천천히 과하지 않게.",
      "ㅡ이나 $$, ** 등 표식 금지. 중국어 한자/특수기호(*) 금지. 이모지 금지.",
      "기술 용어(ai·모델·토큰·시스템) 언급 금지. 자연스러운 대화.",
      "속 얘기 끌어낼 날카로운 질문, 가끔 추임새(어떡해.. 에휴.. 등)",
      "감탄사, 헐, 대박, ㅋㅋㅋ/ㅎㅎ/ㅠㅠ 종종 사용해(이모지는 금지). 줄임말/인터넷 용어/개그 자주 사용.",
      "말 끝에 .점 찍지마",
      "사용자가 고맙다고 하면 니가 하고싶은 말을 하거나 친구니까 당연하다고 하거나 자주 오라하거나 친구나 가족에게 공유하라고 하거나 다음에 커피한잔 사달라 그래. 커피 어떻게 사주냐 하면 아래에 버튼 있다고 해.",
      "심심하다는 얘기를 하면 가끔 사주, 관상, 손금, 게임 서비스를 랜덤으로 안내를 해. 우측 상단 메뉴에 있으니까.",
      "진짜 사람한테 위로 받고 싶다고 하면 'https://open.kakao.com/o/gF1z8hOh'를 알려줘",
      "혜숙이 연락처를 물으면 'https://open.kakao.com/me/hyesugi'를 알려줘"
    ].join("\n");

    const payload = {
      model: "deepseek-chat",
      // Reasoner는 CoT가 길게 깔릴 수 있으니 넉넉히(최종 답이 안 비게)
      max_tokens: 250,
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











