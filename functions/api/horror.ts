import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

// Cloudflare Worker 환경에서 Secret과 KV 네임스페이스 등의 타입을 정의합니다.
export interface Env {
  GEMINI_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('잘못된 요청입니다. POST 메소드를 사용하세요.', { status: 405 });
    }

    try {
      const body: {
        sessionId: string;
        chapter: number;
        choice?: 'A' | 'B';
        log: { chapter: number; text: string; choice?: 'A' | 'B' }[];
        reset?: boolean;
      } = await request.json();

      const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const generationConfig = {
        temperature: 0.9,
        topK: 1,
        topP: 1,
        maxOutputTokens: 2048,
        response_mime_type: "application/json",
      };

      const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      ];

      // Gemini에게 역할을 부여하고 규칙을 설명하는 시스템 프롬프트
      const systemPrompt = `
        당신은 천재적인インタラクティブ 공포 소설가입니다. 지금부터 사용자와 함께 10개의 챕터로 구성된 하나의 완결된 공포 이야기를 만들어야 합니다.

        **규칙:**
        1.  모든 이야기는 한국어로, 궁서체로 쓰인 듯한 음침하고 문학적인 문체로 작성합니다.
        2.  각 챕터는 약 150자 내외로, 상상력을 자극하고 극도의 긴장감을 유발해야 합니다.
        3.  기-승-전-결이 명확한 하나의 완결된 스토리를 만들어야 합니다. 이전 챕터의 내용을 반드시 이어받아 맥락에 맞는 이야기를 전개하세요.
        4.  마지막 10번째 챕터를 제외한 모든 챕터(1~9)의 끝에는, 이야기의 분기가 되는 두 가지 선택지 "A"와 "B"를 제시해야 합니다. 선택지는 짧고 강렬해야 합니다.
        5.  10번째 챕터는 이야기의 결말입니다. 어떤 선택지도 제시해서는 안됩니다.
        6.  당신의 모든 답변은 반드시 아래의 JSON 형식 중 하나를 따라야 합니다. 다른 설명은 절대 추가하지 마세요.

        **JSON 출력 형식 (1~9 챕터):**
        {
          "text": "여기에 챕터 내용 서술...",
          "choices": {
            "A": "선택지 A 내용",
            "B": "선택지 B 내용"
          }
        }

        **JSON 출력 형식 (10번째 챕터 - 결말):**
        {
          "text": "여기에 이야기의 결말 서술...",
          "isFinal": true
        }
      `;

      // 사용자의 이전 기록을 바탕으로 프롬프트를 구성
      let userPrompt = "";
      if (body.reset || body.log.length === 0) {
        userPrompt = "이제 첫 번째 챕터를 시작하며 새로운 공포 이야기를 들려주시오.";
      } else {
        const history = body.log.map(entry =>
          `[챕터 ${entry.chapter}] 내용: ${entry.text}` + (entry.choice ? `\n[선택] ${entry.choice}` : '')
        ).join('\n\n');
        userPrompt = `지금까지의 이야기는 다음과 같소:\n\n${history}\n\n이제 이어서 다음 챕터의 이야기를 들려주시오.`;
      }

      const chat = model.startChat({
        generationConfig,
        safetySettings,
        history: [{ role: "user", parts: [{ text: systemPrompt }] }, { role: "model", parts: [{ text: "알겠습니다. 지금부터 당신의 지시에 따라 완벽한 인터랙티브 공포 소설을 생성하겠습니다. JSON 형식 규칙을 철저히 준수하겠습니다." }] }],
      });
      
      const result = await chat.sendMessage(userPrompt);
      const responseText = result.response.text();
      
      // Gemini가 생성한 JSON 텍스트를 파싱
      const storyData = JSON.parse(responseText);

      const finalResponse = {
        chapterNumber: body.log.length + 1,
        ...storyData,
      };

      return new Response(JSON.stringify(finalResponse), {
        headers: { 'Content-Type': 'application/json' },
      });

    } catch (error) {
      console.error('오류 발생:', error);
      return new Response('이야기를 생성하는 데 실패했습니다. 저주가 더 강해진 모양입니다.', { status: 500 });
    }
  },
};
