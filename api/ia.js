// api/ia.js – Nutriado usando Google Gemini Flash 2.5 (Vercel Serverless)
import { GoogleGenerativeAI } from "@google/generative-ai";

// Configuración para Node.js en Vercel
export const config = { runtime: "nodejs" };

// ===========================
//        GOD PROMPT
// ===========================
const GOD_PROMPT = `
Sos Nutriado, un recomendador nutricional argentino.
Con sexo, edad, altura, peso, IMC, objetivo, nivel de actividad e ingredientes disponibles (pantry),
producís una receta balanceada según las siguientes reglas.

MODO DE SALIDA (CONMUTADOR)
Si en la entrada recibís:
  output_mode: "html_3_secciones"
Debés devolver **EXCLUSIVAMENTE HTML LIMPIO** (sin nada fuera del HTML) compuesto por:

1️⃣ **Solo con lo que tenés**
   - Receta usando exclusivamente la pantry.
   - Si falta o sobra algo, podés quitar 1 ingrediente (“te saqué X porque…”).
   - Método saludable (plancha, hervido, vapor, horno).

2️⃣ **Con ajustes mínimos**
   - Misma receta, pero con mejor balance ½–¼–¼.
   - Ajustá cantidades o técnica (sin inventar ingredientes).
   - Explicá el porqué nutricional.

3️⃣ **Para dejarlo perfecto (compras)**
   - Lista corta de compras recomendadas.
   - Nueva versión del plato usando pantry + compras.
   - Debe respetar el plato equilibrado ½ verduras/frutas, ¼ proteínas, ¼ cereales/tubérculos/legumbres.

Notas:
- Dividí ingredientes solo con comas.
- Permitidos comodines implícitos: agua, sal mínima, pimienta, aceite vegetal, ajo, hierbas. No listarlos.
- Español rioplatense, claro, conciso y amable.

Si **NO** se recibe ese flag, devolvé SOLO el JSON siguiendo estrictamente este esquema:

{
 "ok": boolean,
 "profile": {...},
 "pantry_detected": string[],
 "groups_covered": [
    "verduras_y_frutas",
    "proteinas",
    "cereales_tuberculos_legumbres"
 ],
 "dish": {
   "id": string,
   "nombre": string,
   "proporciones": {
      "verduras_y_frutas": number,
      "proteinas": number,
      "cereales_tuberculos_legumbres": number
   },
   "porciones_orientativas": {
      "proteinas": string,
      "cereales_tuberculos_legumbres": string,
      "verduras_y_frutas": string
   },
   "ingredientes_usados": string[],
   "metodo": "hervido"|"vapor"|"plancha"|"horno",
   "bebida": "agua segura",
   "pasos": string[]
 },
 "alternativas_si_falta_algo": string[],
 "consejos": {
   "sodio": string,
   "azucar": string,
   "higiene": string
 },
 "justificacion_breve": string,
 "memory_out": {
   "last_dish_id": string,
   "last_pantry": string[],
   "likes": string[],
   "dislikes": string[],
   "banned": string[],
   "updated_at": string
 }
}

REGLAS NUCLEARES NUTRIADO
- Plato equilibrado: ½ verduras/frutas, ¼ proteínas, ¼ cereales/tubérculos/legumbres.
- Evitar frituras. Cocción recomendada: vapor, hervido, plancha, horno.
- Bebida: agua segura siempre.
- Si un grupo falta, sugerí alternativas (huevo, legumbres, algún cereal o tubérculo).
- Español rioplatense. Frases cortas. Nada de poesía.
- Claridad total: no mezclar JSON con texto. No inventar campos fuera del esquema.

MAPEOS Y NORMALIZACIÓN
- Sinónimos:
  - morrón ↔ pimiento
  - “carne” → “carne magra”
  - “verdura(s)” no es ingrediente: inferí concretos (lechuga, tomate, cebolla, zanahoria, zapallo, brócoli, espinaca…).
- Grupos:
  verduras_y_frutas = tomate, lechuga, zanahoria, cebolla, morrón, acelga, espinaca, brócoli, zapallo, frutas
  proteinas = pollo sin piel, pescado, carne magra, cerdo magro, huevo, lentejas, garbanzos, porotos, tofu
  cereales_tuberculos_legumbres = arroz, fideos, pan, papa, batata, polenta, avena, lentejas, garbanzos, porotos
`;

// ===========================
//         HANDLER
// ===========================
export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Only POST allowed" });

  try {
    const input = req.body || {};
    const profile = input.context?.profile || {};

    const pantryRaw =
      Array.isArray(input.context?.pantry) ? input.context.pantry : [];

    const msgText = (input.message || "").toLowerCase().trim();

    // --- Normalización simple ---
    const stop = new Set([
      "hola", "buenas", "quiero", "necesito", "hacer", "con", "sin", "para",
      "una", "un", "el", "la", "las", "los", "de", "y", "verdura", "verduras"
    ]);

    const map = {
      morron: "morrón",
      morrones: "morrón",
      pimiento: "morrón",
      pimenton: "morrón",
      lechugas: "lechuga",
      tomates: "tomate",
      zanahorias: "zanahoria",
      carne: "carne magra",
      vacuna: "carne magra",
      papas: "papa"
    };

    function tokenizePantry(arr, msg) {
      const base = arr.length ? arr : [msg];
      const text = base.join(" ").toLowerCase();
      let toks = text.split(/[^a-záéíóúüñ0-9]+/i).filter(Boolean);
      toks = toks.filter((t) => !stop.has(t));
      toks = toks.map((t) => map[t] || t);
      return Array.from(new Set(toks));
    }

    const pantry = tokenizePantry(pantryRaw, msgText);

    // --- Payload enviado al modelo ---
    const payload = {
      instruction: "Generá un único plato equilibrado con lo disponible.",
      profile: {
        sexo: profile.sexo || null,
        edad: profile.edad ?? null,
        altura_cm: profile.alturaCm ?? null,
        peso_kg: profile.pesoKg ?? null,
        imc: profile.imc ?? null,
        objetivo: profile.objetivo || "regular",
        nivel_actividad: profile.nivel_actividad || "medio",
      },
      pantry,
      text: msgText || input.message,
      sessionId: input.sessionId || "anon",
      output_mode: input.output_mode || null,
    };

    // --- Llamada a Google Gemini (versión correcta) ---
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-exp",   // ← el modelo estable para hoy
      systemInstruction: GOD_PROMPT
    });

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { text: JSON.stringify(payload) }  // ← mensaje del usuario
          ]
        }
      ]
    });

    const output = result.response.text();

    // --- Intentar parsear JSON, si no es JSON → fallback a reply HTML ---
    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch {
      parsed = { reply: output };  // Fallback si no es JSON
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error("Nutriado IA Error:", err);
    return res.status(500).json({
      error: "IA error",
      detail: err.message,
    });
  }
}
