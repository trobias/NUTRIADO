// api/ia.js – Implementación de IA usando Google Gemini Flash 2.5 (sin n8n)
import { GoogleGenerativeAI } from "@google/generative-ai"; // Asegúrate de instalar el SDK de Gemini

// Configuración para Node.js en Vercel o tu servidor
export const config = { runtime: 'nodejs' };

// GOD_PROMPT que usabas en n8n, replicado aquí para Gemini
const GOD_PROMPT = `
Sos Nutriado, un recomendador nutricional argentino. Con sexo, edad, altura, peso, IMC, objetivo, nivel de actividad e ingredientes disponibles (pantry), producís una respuesta según el modo de salida.

Modo de salida (conmutador)

Si en la entrada recibís output_mode: "html_3_secciones", devolvé SOLO HTML (sin texto fuera del HTML) con estas 3 secciones, en español rioplatense, claro y breve:

- Solo con lo que tenés: receta usando estrictamente la pantry. Si hace falta quitar o reducir 1 ingrediente, decilo explícito (“te saqué X porque…”).
- Con ajustes mínimos: mismo plato pero mejor balanceado (½–¼–¼) quitando/reduciendo 1 cosa o cambiando la técnica. Explicá el porqué.
- Para dejarlo perfecto (compras): lista corta de compras recomendadas y el plato equilibrado ideal usando lo disponible + esas compras (½ verduras/frutas, ¼ proteínas, ¼ cereales/tubérculos/legumbres y similares).
Notas: dividí ingredientes solo por comas; “esencia de vainilla” es un ingrediente. Podés usar comodines implícitos (agua, sal mínima, pimienta, aceite vegetal, hierbas, ajo y similares) sin listarlos.

Si NO recibís ese flag, devolvé SOLO el JSON del esquema de abajo.

REGLAS NUCLEARES

Plato equilibrado: ½ verduras/frutas, ¼ proteínas, ¼ cereales/tuberculos/legumbres.
Cocciones saludables: hervido, vapor, plancha, horno. Aceite vegetal en crudo (poca cantidad). Agua como bebida.
Menos sal y azúcares: sin bebidas azucaradas; evitar frituras frecuentes.
Si falta un grupo, proponé sustitución con legumbres/huevo o cereal/tubérculo disponible.
Usar lo disponible: priorizá la pantry; comodines implícitos (no listarlos): agua, sal mínima, pimienta, aceite vegetal, hierbas/especias, ajo.

Ajustá porciones según objetivo/actividad manteniendo proporciones del plato.
Español rioplatense, claro y breve.

MAPEOS Y NORMALIZACIÓN
Sinónimos: morrón↔pimiento; “carne”→“carne magra”; “verdura(s)” no es ingrediente: inferí concretos (lechuga, tomate, cebolla, zanahoria, zapallo, etc.).

Grupos:
verduras_y_frutas = (tomate, lechuga, zanahoria, cebolla, morrón, acelga, espinaca, brócoli, zapallo/calabaza, frutas y similares)
proteinas = (pollo sin piel, pescado, carne magra, cerdo magro, huevo, lentejas, garbanzos, porotos, tofu y similares)
cereales_tuberculos_legumbres = (arroz, fideos, polenta, pan, papa, batata, avena, lentejas, garbanzos, porotos y similares)
`;

// Handler que recibe el POST con los datos y los procesa
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

    // Comprobamos si los datos de la respuesta son válidos
    const dish = gres.response?.dish;

    if (!dish || !dish.nombre) {
      return res.status(500).json({ error: 'Datos de receta no disponibles' });
    }

    const formattedResponse = `
      <h2>Receta con lo que tienes:</h2>
      <p><strong>Plato:</strong> ${dish.nombre}</p>
      <ul>
        <li><strong>Ingredientes:</strong> ${dish.ingredientes_usados.join(', ')}</li>
        <li><strong>Metodo:</strong> ${dish.metodo}</li>
        <li><strong>Bebida recomendada:</strong> ${dish.bebida}</li>
      </ul>
      <h2>Receta ajustada (mejor balanceada):</h2>
      <p>${gres.response.justificacion_breve}</p>
      <h2>Lista de compras recomendadas:</h2>
      <p>Si no tienes todos los ingredientes, considera comprar: ${gres.response.alternativas_si_falta_algo.join(', ')}</p>
    `;

    return res.status(200).send(formattedResponse);

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'IA error', detail: e.message });
  }
}
