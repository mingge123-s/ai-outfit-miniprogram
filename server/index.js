import "dotenv/config";
import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL_ID = process.env.MODEL_ID || "gemini-2.5-flash-image-preview";

if (!GEMINI_API_KEY) {
  console.error("Missing GEMINI_API_KEY environment variable.");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const app = express();
app.use(cors());
app.use(express.json({ limit: "40mb" }));

const ITEM_LABELS = {
  top: "上衣 (top garment)",
  pants: "裤子 (pants/bottoms)",
  shoes: "鞋子 (shoes)",
  hat: "帽子 (hat/headwear)",
};

const BACKGROUND_STYLES = {
  street: "urban street-style scene (city sidewalk, storefronts, natural daylight)",
  studio: "clean professional photo studio with a neutral seamless backdrop and soft studio lighting",
  outdoor: "natural outdoor scene (park, greenery, golden-hour sunlight)",
};

function buildPrompt(itemKeys, hasPerson, backgroundStyle) {
  const itemList = itemKeys.map((k, i) => `input_${i + 1}: ${ITEM_LABELS[k]}`).join("; ");
  const background = BACKGROUND_STYLES[backgroundStyle] || BACKGROUND_STYLES.studio;
  const personInstruction = hasPerson
    ? `The LAST input image contains the target person/model. ABSOLUTE CRITICAL: preserve the person's facial identity, features, skin tone and expression with ZERO alterations. Retain their exact body pose. DO NOT guess or hallucinate facial features.`
    : `No person image is provided. Generate a photorealistic, full-body fashion model with a natural standing pose suitable for showcasing the outfit.`;

  return `
Task: High-fidelity virtual outfit composition (multi-garment try-on).

Inputs: ${itemList}.
${personInstruction}

Objective: Generate ONE photorealistic, high-resolution, full-body image of the model wearing ALL of the provided clothing items together as a complete outfit.

Core constraints:
1. GARMENT FIDELITY (ABSOLUTE CRITICAL): For every provided item, preserve its EXACT color (hue, saturation, brightness), pattern, texture, material and design details. ZERO deviations. Discard any original model, mannequin or background present in the item images.
2. For any clothing category NOT provided, choose a simple, neutral, non-distracting default (e.g. plain basic garment) so the outfit looks complete and natural.
3. REALISTIC INTEGRATION: Simulate physically plausible draping, folding and fit of every garment on the body. Scale each item correctly to body proportions. Handle occlusion correctly (e.g. top over pants waistband, hat over hair).
4. BACKGROUND: Place the model in a ${background}. The background must be photorealistic and must not distract from the outfit.
5. LIGHTING: Apply consistent lighting, shadows and highlights across the model, all garments and the background.

Prohibitions:
- DO NOT alter the intrinsic appearance of any provided garment.
- DO NOT crop out the shoes or hat; the full outfit from head to toe must be visible.
- DO NOT add extra clothing items or accessories that conflict with the provided ones.
- DO NOT produce collage-like or split images; output a single coherent photograph.
`;
}

app.get("/health", (_req, res) => res.json({ ok: true }));

// POST /api/tryon
// JSON body: {
//   items: { top?: {data, mimeType}, pants?: {...}, shoes?: {...}, hat?: {...} },
//   personImage?: {data, mimeType},   // base64, optional
//   backgroundStyle?: "street" | "studio" | "outdoor"
// }
app.post("/api/tryon", async (req, res) => {
  try {
    const { items = {}, personImage, backgroundStyle } = req.body || {};
    const itemKeys = Object.keys(ITEM_LABELS).filter((k) => items[k]?.data);

    if (itemKeys.length === 0) {
      return res.status(400).json({ error: "至少上传一件单品图片（上衣/裤子/鞋子/帽子）" });
    }

    const parts = [{ text: buildPrompt(itemKeys, !!personImage?.data, backgroundStyle) }];
    for (const key of itemKeys) {
      parts.push({
        inlineData: {
          mimeType: items[key].mimeType || "image/jpeg",
          data: items[key].data,
        },
      });
    }
    if (personImage?.data) {
      parts.push({
        inlineData: {
          mimeType: personImage.mimeType || "image/jpeg",
          data: personImage.data,
        },
      });
    }

    const response = await ai.models.generateContent({
      model: MODEL_ID,
      contents: [{ role: "user", parts }],
      config: {
        temperature: 0.6,
        topP: 0.95,
        responseModalities: ["Text", "Image"],
      },
    });

    let imageData = null;
    let imageMimeType = "image/png";
    let textResponse = null;

    const candidateParts = response.candidates?.[0]?.content?.parts || [];
    for (const part of candidateParts) {
      if (part.inlineData?.data) {
        imageData = part.inlineData.data;
        imageMimeType = part.inlineData.mimeType || "image/png";
      } else if (part.text) {
        textResponse = part.text;
      }
    }

    if (!imageData) {
      const blockReason = response.promptFeedback?.blockReason;
      return res.status(502).json({
        error: blockReason
          ? `生成被安全策略拦截: ${blockReason}`
          : "模型未返回图片，请重试",
        description: textResponse,
      });
    }

    return res.json({
      image: `data:${imageMimeType};base64,${imageData}`,
      description: textResponse || null,
    });
  } catch (err) {
    console.error("tryon error:", err);
    return res.status(500).json({
      error: "生成失败",
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

app.listen(PORT, () => {
  console.log(`AI outfit server listening on http://localhost:${PORT}`);
});
