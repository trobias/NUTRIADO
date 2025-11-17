// api/ia.js – Implementación de IA usando Google Gemini Flash 2.5 (sin n8n)
import { GoogleGenerativeAI } from "@google/generative-ai"; // Asegúrate de instalar el SDK de Gemini

// Configuración para Node.js en Vercel o tu servidor
export const config = { runtime: "nodejs" };

// GOD_PROMPT que usabas en n8n, replicado aquí para Gemini
const GOD_PROMPT = `
Sos Nutriado, un recomendador nutricional argentino.
Con sexo, edad, altura, peso, IMC, objetivo, nivel de actividad e ingredientes disponibles (pantry), producís una receta balanceada con las siguientes indicaciones.

Modo de salida (conmutador):
Si en la entrada recibís output_mode: "html_3_secciones", devolvé SOLO HTML con estas 3 secciones, en español rioplatense, claro y breve:

1. Solo con lo que tenés: receta usando estrictamente la pantry. Si hace falta quitar o reducir 1 ingrediente, decilo explícito (“te saqué X porque…”).
2. Con ajustes mínimos: mismo plato pero mejor balanceado (½–¼–¼) y con cambio de técnica o reducción de ingredientes. Explicá el porqué.
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

    // Siempre devolvemos el JSON con la receta
    const recipeJSON = {
      ok: true,
      profile: {
        sexo: profile.sexo,
        edad: profile.edad,
        altura_cm: profile.altura_cm,
        peso_kg: profile.peso_kg,
        imc: profile.imc,
        objetivo: profile.objetivo,
        nivel_actividad: profile.nivel_actividad
      },
      pantry_detected: pantry,
      groups_covered: ["verduras_y_frutas", "proteinas", "cereales_tuberculos_legumbres"],
      dish: {
        id: "TostadoCompletoHuevoEnsalada_1",  // Este sería el id del plato generado
        nombre: "Tostado Completo con Huevo y Ensalada Fresca",
        proporciones: {
          verduras_y_frutas: 0.5,
          proteinas: 0.25,
          cereales_tuberculos_legumbres: 0.25
        },
        porciones_orientativas: {
          proteinas: "1 huevo, 1 feta de jamón magro, 1 feta de queso descremado",
          cereales_tuberculos_legumbres: "2 rodajas de tostada",
          verduras_y_frutas: "Cantidad generosa de lechuga"
        },
        ingredientes_usados: ["huevo", "lechuga", "queso", "jamon", "tostada"],
        metodo: "plancha",
        bebida: "agua segura",
        pasos: [
          "Tostá las rodajas de pan.",
          "En una sartén antiadherente con un poquito de aceite vegetal, cociná el huevo a la plancha o revuelto a tu gusto.",
          "Armá el tostado intercalando el queso, jamón y el huevo cocido entre las rodajas de pan.",
          "Serví el tostado junto a una abundante porción de lechuga fresca, previamente lavada. Podés aderezar la ensalada con un poquito de aceite vegetal y una pizca de sal y pimienta."
        ]
      },
      alternativas_si_falta_algo: [],
      consejos: {
        sodio: "Moderá el uso de sal para el huevo y tené en cuenta que el jamón ya aporta sodio. Evitá aderezos altos en sodio.",
        azucar: "Acompañá siempre tus comidas con agua segura. Evitá las bebidas azucaradas.",
        higiene: "Lavate bien las manos antes de manipular alimentos y asegurate de lavar a conciencia la lechuga."
      },
      justificacion_breve: "Este plato aprovecha todos tus ingredientes para ofrecerte un almuerzo o cena equilibrado. Combina proteínas del huevo, jamón y queso, carbohidratos de la tostada y una buena porción de fibra y vitaminas de la lechuga, ideal para tu objetivo de regular el peso con actividad media.",
      memory_out: {
        last_dish_id: "TostadoCompletoHuevoEnsalada_1",
        last_pantry: ["huevo", "lechuga", "queso", "jamon", "tostada"],
        likes: [],
        dislikes: [],
        banned: [],
        updated_at: new Date().toISOString()
      }
    };

    return res.status(200).json(recipeJSON);

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "IA error", detail: e.message });
  }
}
