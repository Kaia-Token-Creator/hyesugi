// Cloudflare Pages Functions - POST /api/face-read (REST 버전)
export const onRequestPost: PagesFunction<{ OPENAI_API_KEY: string }> = async (ctx) => {
  try {
    const form = await ctx.request.formData();
    const mode   = String(form.get("mode") || "single");
    const prompt = String(form.get("prompt") || "");
    const img1   = form.get("image1") as File | null;
    const img2   = form.get("image2") as File | null;

    if (!img1) return json({ ok:false, error:"image1 is required" }, 400);
    if (mode === "couple" && !img2) return json({ ok:false, error:"image2 is required" }, 400);

    const b64_1 = await fileToBase64(img1);
    const contents: any[] = [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: `data:${img1.type || "image/jpeg"};base64,${b64_1}` } },
    ];
    if (mode === "couple" && img2) {
      const b64_2 = await fileToBase64(img2);
      contents.push({ type: "image_url", image_url: { url: `data:${img2.type || "image/jpeg"};base64,${b64_2}` } });
    }

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ctx.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.95,
        max_tokens: 1800,
        messages: [
          { role: "system", content: "You are a respectful, entertainment-only face-reading assistant. Avoid sensitive attributes." },
          { role: "user", content: contents },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return json({ ok:false, error:`OpenAI HTTP ${resp.status} ${resp.statusText} - ${errText}` }, 502);
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content?.trim?.() || "";
    return json({ ok:true, content });

  } catch (e:any) {
    return json({ ok:false, error: e?.message || String(e) }, 500);
  }
};

async function fileToBase64(f: File) {
  const buf = await f.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // @ts-ignore (Workers 런타임 제공)
  return btoa(binary);
}
function json(data:any, status=200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
