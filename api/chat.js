/* functions/api/chat.js */

export async function onRequestPost({ request, env }) {
  // 1. 클라이언트(index.html)에서 보낸 채팅 데이터를 받습니다.
  const clientData = await request.json();

  // 2. DeepSeek API 서버로 보낼 요청을 준비합니다.
  const apiRequest = new Request("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // 3. Cloudflare에 저장된 DEEPSEEK_API_KEY 비밀 변수를 가져와 헤더에 추가합니다.
      //    이 부분이 가장 중요합니다! API 키가 여기에 삽입됩니다.
      "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}` 
    },
    // 4. 클라이언트에서 받은 채팅 데이터를 그대로 담아서 보냅니다.
    body: JSON.stringify(clientData) 
  });

  // 5. 준비된 요청을 DeepSeek API로 보내고, 받은 응답을 다시 클라이언트(index.html)로 전달합니다.
  try {
    const response = await fetch(apiRequest);
    return response; // DeepSeek의 응답을 그대로 반환
  } catch (error) {
    // 만약 오류가 발생하면, 오류 메시지를 클라이언트로 보냅니다.
    console.error("Error fetching from DeepSeek API:", error);
    return new Response(JSON.stringify({ error: 'DeepSeek API 연결에 실패했습니다.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}