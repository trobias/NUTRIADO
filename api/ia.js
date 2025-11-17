// api/ia.js – Implementación de IA usando Google Gemini Flash 2.5 (sin n8n)
import { GoogleGenerativeAI } from "@google/generative-ai"; // Asegúrate de instalar el SDK de Gemini

// Configuración para Node.js en Vercel o tu servidor
export const config = { runtime: "nodejs" };

// GOD_PROMPT que usabas en n8n, replicado aquí para Gemini
const GOD_PROMPT = `
Sos Nutriado, un recomendador nutricional argentino.
Con sexo, edad, altura, peso, IMC, objetivo, nivel de actividad e ingredientes disponibles (pantry), producís una receta balanceada con las siguientes indicaciones.

Modo de salida:
Si en la entrada recibís output_mode: "html_3_secciones", devolvé SOLO HTML con estas 3 secciones, en español rioplatense, claro y breve:

1. Solo con lo que tenés: receta usando estrictamente la pantry.
2. Con ajustes mínimos: mismo plato mejor balanceado (½–¼–¼) y con cambio de técnica o reducción de ingredientes. Explicá el porqué.
3. Para dejarlo perfecto (compras): lista corta de compras recomendadas y cómo equilibrar el plato usando esos ingredientes.

Si NO recibís ese flag, devolvé SOLO el JSON del esquema con lo siguiente:

Esquema del plato balanceado:
- Ingredientes: Lista de ingredientes con cantidades
- Método: Tipo de cocción (hervido, plancha, horno, etc.)
- Proporciones: Balance de ingredientes (verduras, proteínas, cereales/tubérculos)
- Alternativas: Sugerencias en caso de que falte algún ingrediente o grupo alimenticio
- Consejos: Consejos para mejorar la dieta (sodio, azúcar, higiene)
`;

// Handler que recibe el POST con los datos y los procesa
export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Only POST allowed" });

  try {
    const input = req.body || {};
    const profile = input.context?.profile || {};
    const pantryRaw = Array.isArray(input.context?.pantry) ? input.context.pantry : [];
    const msgText = (input.message || "").toLowerCase().trim();

    // Tokenización y normalización básica
    const stop = new Set([
      "hola", "buenas", "quiero", "necesito", "hacer", "con", "sin", "para", 
      "una", "un", "el", "la", "las", "los", "de", "y", "verdura", "verduras"
    ]);

    const map = {
      "morron": "morrón", "morrones": "morrón", "pimiento": "morrón", 
      "pimenton": "morrón", "lechugas": "lechuga", "tomates": "tomate", 
      "zanahorias": "zanahoria", "carne": "carne magra", "vacuna": "carne magra", 
      "papas": "papa"
    };

    function tokenizePantry(arr, msg) {
      const base = arr.length ? arr : [msg];
      const text = base.join(" ").toLowerCase();
      let toks = text.split(/[^a-záéíóúüñ0-9]+/i).filter(Boolean);
      toks = toks.filter(t => !stop.has(t));
      toks = toks.map(t => map[t] || t);
      return Array.from(new Set(toks));
    }

    const pantry = tokenizePantry(pantryRaw, msgText);

    // Crear el payload para la llamada a Google Gemini
    const payload = {
      instruction: "Generá un único plato equilibrado con lo disponible.",
      profile: {
        sexo: profile.sexo || null,
        edad: profile.edad ?? null,
        altura_cm: profile.alturaCm ?? null,
        peso_kg: profile.pesoKg ?? null,
        imc: profile.imc ?? null,
        objetivo: profile.objetivo || "regular",
        nivel_actividad: profile.nivel_actividad || "medio"
      },
      pantry,
      text: msgText || input.message,
      sessionId: input.sessionId || "anon"
    };

    // Llamada a Google Gemini (Flash 2.5)
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",  // Modelo sin versión específica
      systemInstruction: GOD_PROMPT
    });

    const gres = await model.generateContent(JSON.stringify(payload));
    const output = gres.response.text();  // Este es el resultado final en texto

    // Respuesta con el contenido generado
    return res.status(200).json({ reply: output });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "IA error", detail: e.message });
  }
}
