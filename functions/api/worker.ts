// Cloudflare Worker 환경의 타입을 참조합니다.
/// <reference types="@cloudflare/workers-types" />

// 환경 변수 타입을 정의합니다.
// C3는 Cloudflare의 Worker 생성 도구입니다.
export interface Env {
  GEMINI_API_KEY: string;
}

// 이 코드는 Cloudflare Worker에서 실행됩니다.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS Preflight 요청 처리
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }
    
    // POST 요청만 허용
    if (request.method !== 'POST') {
      return new Response('잘못된 요청입니다. POST 메소드를 사용해주세요.', { status: 405 });
    }

    try {
      // 클라이언트로부터 받은 요청 본문을 파싱합니다.
      const { storyLog, choice, reset } = await request.json() as { storyLog: any[], choice: string, reset: boolean };
      
      const model = 'gemini-1.5-flash';
      const apiKey = env.GEMINI_API_KEY;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      // Gemini API에 보낼 프롬프트를 생성합니다.
      const prompt = createPrompt(storyLog, choice, reset);
      
      const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          topK: 1,
          topP: 1,
          maxOutputTokens: 2048,
        },
      };

      // Gemini API 호출
      const geminiResponse = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        throw new Error(`Gemini API 오류: ${errorText}`);
      }

      const geminiData = await geminiResponse.json();
      
      // API 응답에서 텍스트를 추출하고 JSON으로 변환합니다.
      const jsonString = geminiData.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
      const storyData = JSON.parse(jsonString);

      // 클라이언트에 JSON 형태로 응답을 보냅니다.
      return new Response(JSON.stringify(storyData), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*' // 실제 프로덕션 환경에서는 특정 도메인으로 제한하세요.
        },
      });

    } catch (error) {
      console.error(error);
      return new Response('스토리를 생성하는 중 오류가 발생했습니다.', { 
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }
  },
};

/**
 * Gemini API에 전달할 프롬프트를 생성하는 함수
 * @param storyLog - 이전 스토리 기록
 * @param choice - 사용자의 마지막 선택
 * @param reset - 새 게임 시작 여부
 * @returns 생성된 프롬프트 문자열
 */
function createPrompt(storyLog: any[], choice: string, reset: boolean): string {
  const chapter = storyLog.length + 1;
  const baseInstruction = `
    당신은 천재적인 공포 소설가입니다. 사용자와 상호작용하는 10개의 챕터로 구성된 짧은 공포 스토리를 만들어야 합니다.
    - 각 챕터는 반드시 150자 내외로, 상상력을 자극하는 문학적인 묘사와 함께 긴장감 있고 공포스럽게 작성해야 합니다.
    - 이야기는 이전 챕터와 선택지에 맞춰 자연스럽게 이어져야 하며, 기승전결이 뚜렷해야 합니다.
    - 출력은 반드시 아래의 JSON 형식이어야 하며, 다른 어떤 텍스트도 포함해서는 안 됩니다.
  `;

  if (reset || storyLog.length === 0) {
    return `
      ${baseInstruction}
      이제 이야기의 첫 번째 챕터를 시작해주세요. 두 가지 선택지 A, B를 제시해야 합니다.
      JSON 형식: {"chapterNumber": 1, "text": "...", "choices": {"A": "...", "B": "..."}}
    `;
  }

  const history = storyLog.map(log => `챕터 ${log.chapterNumber}: ${log.text}\n선택: ${log.choice || ''}`).join('\n\n');

  if (chapter < 10) {
    return `
      ${baseInstruction}
      다음은 지금까지의 이야기입니다:
      ---
      ${history}
      ---
      사용자는 방금 "${choice}"를 선택했습니다. 이 선택을 반영하여 다음 챕터(${chapter})를 작성하고, 새로운 선택지 A, B를 제시해주세요.
      JSON 형식: {"chapterNumber": ${chapter}, "text": "...", "choices": {"A": "...", "B": "..."}}
    `;
  } else {
    return `
      ${baseInstruction}
      다음은 지금까지의 이야기입니다:
      ---
      ${history}
      ---
      사용자는 방금 "${choice}"를 선택했습니다. 이 선택을 반영하여 이야기의 마지막 챕터(10)를 작성해주세요. 모든 비밀이 밝혀지거나 충격적인 결말을 제시해야 합니다. 선택지는 없어야 합니다.
      JSON 형식: {"chapterNumber": 10, "text": "...", "isFinal": true}
    `;
  }
}

// CORS Preflight 요청을 처리하는 함수
function handleOptions(request: Request) {
  const headers = request.headers;
  if (
    headers.get('Origin') !== null &&
    headers.get('Access-Control-Request-Method') !== null &&
    headers.get('Access-Control-Request-Headers') !== null
  ) {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*', // 실제 프로덕션 환경에서는 특정 도메인으로 제한하세요.
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } else {
    return new Response(null, {
      headers: {
        Allow: 'POST, OPTIONS',
      },
    });
  }
}