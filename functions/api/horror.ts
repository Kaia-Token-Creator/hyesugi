// Define the structure for the API key environment variable
interface Env {
  GEMINI_API_KEY: string;
}

// Define the expected JSON structure from the Gemini API
interface StoryChapter {
  chapter: number;
  story: string;
  choiceA?: string;
  choiceB?: string;
  finalSentence?: string;
}

// Main handler for the Cloudflare Worker
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const { storyHistory } = await request.json<any>();
    const apiKey = env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const systemPrompt = `
      너는 천재적인 공포 소설 작가다. 사용자와 상호작용하며 짧은 10챕터짜리 공포 게임을 만드는 임무를 맡았다.

      **규칙:**
      1.  전체 이야기는 반드시 10개의 챕터로 완결된다.
      2.  각 챕터는 한국어 150자 내외로, 상상력을 자극하는 문학적인 묘사를 사용해야 한다.
      3.  기승전결이 뚜렷해야 하며, 챕터가 진행될수록 긴장감이 고조되어야 한다.
      4.  사용자의 선택에 따라 다음 이야기가 유기적으로 연결되어야 한다. 선택의 결과를 명확히 반영해라.
      5.  챕터 10은 모든 것의 결말이며, 선택지 없이 소름 돋는 마지막 한 문장으로 끝내야 한다.
      6.  매번 새로운 사용자가 들어오면, 완전히 새로운 주제의 공포 이야기를 시작해야 한다. (예: 폐가, 저주받은 인형, 귀신 들린 학교, 미지의 존재 등)
      
      **출력 형식 (매우 중요):**
      - 반드시 아래의 JSON 형식 중 하나로만 응답해야 한다. 다른 설명이나 텍스트는 절대 추가하지 마라.
      - 챕터 1-9 형식:
        {
          "chapter": [현재 챕터 번호(숫자)],
          "story": "[이번 챕터 이야기]",
          "choiceA": "[선택지 A 텍스트]",
          "choiceB": "[선택지 B 텍스트]"
        }
      - 챕터 10 (마지막) 형식:
        {
          "chapter": 10,
          "story": "[마지막 챕터 이야기]",
          "finalSentence": "[소름 돋는 마지막 한 문장]"
        }
    `;

    const contents = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: "알겠습니다. 규칙을 숙지했으며, 요청에 따라 짜임새 있는 10챕터 공포 이야기를 JSON 형식으로 생성하겠습니다." }] },
      ...(Array.isArray(storyHistory) ? storyHistory : []),
      { role: 'user', parts: [{ text: '이제 이 기록을 바탕으로 다음 챕터를 JSON 형식으로 생성해줘. 기록이 비어있다면 챕터 1을 생성하면 된다.' }] },
    ];
    
    // ### 모델 이름을 최신 버전인 gemini-2.5-pro 로 변경했습니다! ###
    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`;

    const geminiResponse = await fetch(geminiApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        contents,
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 1.0,
            topP: 0.95,
            topK: 40,
        }
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API Error:", errorText);
      throw new Error(`Gemini API request failed with status ${geminiResponse.status}`);
    }

    const responseData = await geminiResponse.json();
    const modelResponseText = responseData.candidates[0].content.parts[0].text;
    
    const storyData: StoryChapter = JSON.parse(modelResponseText);

    return new Response(JSON.stringify(storyData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
