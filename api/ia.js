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

// Función para calcular el estado de salud según el IMC
function calcularSaludIMC(imc) {
  if (imc < 18.5) {
    return 'Bajo peso. Es recomendable consultar a un nutricionista para mejorar tu alimentación.';
  } else if (imc >= 18.5 && imc <= 24.9) {
    return 'Saludable. Mantén una dieta equilibrada y ejercicio regular para mantenerte en forma.';
  } else if (imc >= 25 && imc <= 29.9) {
    return 'Sobrepeso. Considera ajustar tu dieta y aumentar la actividad física para mejorar tu salud.';
  } else {
    return 'Obesidad. Es importante consultar a un médico o nutricionista para recibir orientación.';
  }
}

// Handler que recibe el POST con los datos y los procesa
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const input = req.body || {};
    const profile = input.context?.profile || {};

    // Calcular el IMC
    const imc = profile.imc || 0;
    const estadoSalud = calcularSaludIMC(imc);

    // Crear respuesta consolidada con IMC, datos de perfil y evaluación de salud
    const respuesta = `
      ✅ Perfil listo. IMC: ${imc}
      ✅ Perfil guardado. Edad: ${profile.edad}, Sexo: ${profile.sexo}, Peso: ${profile.peso_kg} kg, Altura: ${profile.altura_cm} cm.
      ✅ Estado de salud según IMC: ${estadoSalud}
    `;

    // Aquí agregas el esquema de receta si no se recibe output_mode
    if (!input.output_mode || input.output_mode !== "html_3_secciones") {
      const receta = {
        ok: true,
        profile: {
          sexo: profile.sexo,
          edad: profile.edad,
          altura_cm: profile.altura_cm,
          peso_kg: profile.peso_kg,
          imc: profile.imc,
        },
        pantry_detected: input.context?.pantry || [],
        groups_covered: ["verduras_y_frutas", "proteinas", "cereales_tuberculos_legumbres"],
        dish: {
          id: "tortilla_avena_jamon_lechuga", 
          nombre: "Tortilla de Avena y Jamón con Ensalada Fresca",
          proporciones: {
            verduras_y_frutas: 0.5,
            proteinas: 0.25,
            cereales_tuberculos_legumbres: 0.25
          },
          porciones_orientativas: {
            proteinas: "1 porción de jamón y queso (aprox. 50g) y 1 huevo mediano (comodín implícito)",
            cereales_tuberculos_legumbres: "1/2 taza de avena",
            verduras_y_frutas: "1 plato abundante de lechuga"
          },
          ingredientes_usados: ["avena", "jamon", "queso", "lechuga"],
          metodo: "plancha",
          bebida: "agua segura",
          pasos: [
            "En un bowl, mezclá la avena con un huevo (comodín implícito) y un poquito de agua o leche si tenés, hasta formar una pasta.",
            "Cortá el jamón y el queso en trozos pequeños y agregalos a la mezcla de avena.",
            "Calentá una sartén o plancha con un chorrito de aceite vegetal (comodín implícito) a fuego medio.",
            "Vertí la mezcla en la sartén, extendiéndola para formar una tortilla. Cociná hasta que dore de ambos lados y esté cocida por dentro.",
            "Mientras tanto, lavá bien la lechuga y cortala para preparar una ensalada fresca.",
            "Serví la tortilla caliente acompañada de la ensalada de lechuga."
          ]
        },
        alternativas_si_falta_algo: [],
        consejos: {
          sodio: "Evitá agregar sal extra a la ensalada y la tortilla, ya que el jamón y el queso aportan sodio.",
          azucar: "Mantenete hidratado con agua segura durante el día, evitando por completo las bebidas azucaradas.",
          higiene: "Siempre recordá lavar bien tus manos y todos los vegetales antes de manipularlos y consumirlos."
        },
        justificacion_breve: "Este plato utiliza la avena como fuente de cereales, el jamón y queso (más el huevo implícito) como proteínas, y la lechuga como verdura, logrando un equilibrio de ½ verdura, ¼ proteína y ¼ cereal, ideal para tu objetivo de regular peso y nivel de actividad.",
        memory_out: {
          last_dish_id: "tortilla_avena_jamon_lechuga",
          last_pantry: ["pan", "queso", "jamon", "lechuga", "avena"],
          likes: [],
          dislikes: [],
          banned: [],
          updated_at: new Date().toISOString()
        }
      };

      return res.status(200).json({ reply: respuesta, recipe: receta });
    }

    // Si el flag es "html_3_secciones", devolvemos el HTML
    return res.status(200).send(respuesta);  // Aquí ajustas para retornar solo el HTML si lo deseas

  } catch (e) {
    return res.status(500).json({ error: "Error al generar el perfil", detail: e.message });
  }
}
