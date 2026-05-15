import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  lang: z.string().min(2).max(10),
  langName: z.string().min(2).max(80),
  phrases: z.array(z.string().min(1).max(800)).min(1).max(120),
});

const SYSTEM = `You translate short UI strings for a mobile web app.
- Translate naturally and concisely into the target language.
- Use simple, everyday, conversational language — the way real people speak. Avoid formal, academic, literary, or overly professional/classical wording.
- For Arabic (ar): use simple Modern Standard Arabic that feels close to spoken/everyday usage. Keep words short and familiar. Do NOT use heavy classical, literary, or bureaucratic vocabulary. Prefer common words an average user would say out loud. Keep sentences short. Do not add diacritics (tashkeel).
- Preserve numbers, percentages, currency symbols, currency codes (USD, EUR, GBP, NGN, KES…), proper nouns, brand names, and any sequence of digits exactly as-is.
- Keep punctuation, leading/trailing arrows or symbols (like "‹", "›", "·", "…"), and case style.
- Do NOT add quotes, explanations, or notes.
- Return ONLY a JSON object: {"out": ["…","…", …]} with the SAME number of items, in the same order as the input.`;

export const translateBatch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { out: data.phrases }; // graceful: leave English

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": key,
        },
        body: JSON.stringify({
          model: data.lang === "ar" ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM },
            {
              role: "user",
              content:
                `Target language: ${data.langName} (${data.lang}).\n` +
                `Translate this JSON array, return {"out":[...]} with same length and order:\n` +
                JSON.stringify(data.phrases),
            },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) {
        console.error("[translateBatch] gateway error", res.status, await res.text().catch(() => ""));
        return { out: data.phrases };
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = json.choices?.[0]?.message?.content ?? "";
      let parsed: { out?: unknown };
      try { parsed = JSON.parse(content); } catch { return { out: data.phrases }; }
      const out = Array.isArray(parsed.out) ? parsed.out.map(String) : [];
      if (out.length !== data.phrases.length) return { out: data.phrases };
      return { out };
    } catch (err) {
      console.error("[translateBatch] failed", err);
      return { out: data.phrases };
    }
  });
