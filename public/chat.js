<!-- public/chat.js -->
<script>
// --- DOM ---
const $log   = document.getElementById('chat-log');
const $form  = document.getElementById('chat-form');
const $input = document.getElementById('chat-input');

const $userForm = document.getElementById('user-form');   // form de perfil (edad/sexo/peso/altura)
const $chatBox  = document.getElementById('nutriado-chat'); // contenedor del chat

// --- Session ---
const sessionId = (() => {
  const k = 'nutriado_session';
  let v = localStorage.getItem(k);
  if (!v) {
    v = crypto.getRandomValues(new Uint32Array(1))[0].toString(16);
    localStorage.setItem(k, v);
  }
  return v;
})();

// --- Estado ---
let userProfile = {}; // { edad, sexo, pesoKg, alturaCm, imc }
let lastPantry  = []; // cache de última “despensa” enviada

// --- Helpers UI ---
function addMsg(content, who = 'bot', isHTML = false) {
  const div = document.createElement('div');
  div.className = `msg ${who}`;
  if (isHTML) div.innerHTML = content;
  else div.textContent = content;
  $log.appendChild(div);
  $log.scrollTop = $log.scrollHeight;
  return div;
}

// Renderer para respuestas “legacy” (reply/recetas/compras)
function renderBotMessage(data) {
  const obj = Array.isArray(data) ? data[0] : data;
  let html = '';

  if (obj.reply) html += `<p>${obj.reply}</p>`;

  if (obj.recetas && obj.recetas.length) {
    html += `<h4>🍽️ Recetas sugeridas:</h4>`;
    obj.recetas.forEach(r => {
      html += `<div class="receta">
        <b>${r.nombre || 'Receta'}</b>
        <ul>${(r.ingredientes || []).map(i => `<li>${i}</li>`).join('')}</ul>
        <ol>${(r.pasos || []).map(p => `<li>${p}</li>`).join('')}</ol>
        <small>Macros: ${r.macros?.kcal ?? 0} kcal, ${r.macros?.prot ?? 0} g prot, ${r.macros?.carb ?? 0} g carb, ${r.macros?.gras ?? 0} g gras</small>
      </div>`;
    });
  }

  if (obj.compras && obj.compras.length) {
    html += `<h4>🛒 Podrías comprar:</h4><ul>${obj.compras.map(c => `<li>${c}</li>`).join('')}</ul>`;
  }

  return html || 'Sin respuesta';
}

// Renderer específico Nutriado (schema con dish/consejos/etc.)
function renderNutriado(obj = {}) {
  if (!obj || typeof obj !== 'object') return '';

  // tolera respuestas como [{output:{...}}] o {output:{...}} o {...}
  if (Array.isArray(obj)) obj = obj[0]?.output ?? obj[0] ?? {};
  if (obj.output) obj = obj.output;

  if (!obj.dish || !obj.profile) return ''; // no coincide con el esquema Nutriado

  const d    = obj.dish || {};
  const prop = d.proporciones || {};
  const pasos = Array.isArray(d.pasos) ? d.pasos : [];
  const ing   = Array.isArray(d.ingredientes_usados) ? d.ingredientes_usados : [];
  const alt   = Array.isArray(obj.alternativas_si_falta_algo) ? obj.alternativas_si_falta_algo : [];

  let html = '';
  html += `<h4>🍽️ ${d.nombre || 'Plato sugerido'}</h4>`;
  html += `<p><b>Método:</b> ${d.metodo || '—'} | <b>Bebida:</b> ${d.bebida || 'agua segura'}</p>`;
  // mostramos proporciones si existen (no “0” literal si no vinieron)
  const pV = typeof prop.verduras_y_frutas === 'number' ? prop.verduras_y_frutas : '½';
  const pP = typeof prop.proteinas === 'number' ? prop.proteinas : '¼';
  const pC = typeof prop.cereales_tuberculos_legumbres === 'number' ? prop.cereales_tuberculos_legumbres : '¼';
  html += `<p><b>Proporciones:</b> verduras/frutas ${pV}, proteínas ${pP}, cereales/tubérculos ${pC}</p>`;

  if (d.porciones_orientativas) {
    const po = d.porciones_orientativas;
    html += `<p><b>Porciones orientativas:</b> 
      proteínas: ${po.proteinas || '—'}, 
      cereales/tubérculos: ${po.cereales_tuberculos_legumbres || '—'}, 
      verduras/frutas: ${po.verduras_y_frutas || '—'}
    </p>`;
  }

  if (ing.length)   html += `<p><b>Ingredientes:</b> ${ing.join(', ')}</p>`;
  if (pasos.length) html += `<ol>${pasos.map(p => `<li>${p}</li>`).join('')}</ol>`;
  if (alt.length)   html += `<p><b>Alternativas:</b> ${alt.join(' ')}</p>`;

  if (obj.consejos) {
    html += `<p><b>Consejos:</b> sodio: ${obj.consejos.sodio || '—'} | azúcar: ${obj.consejos.azucar || '—'} | higiene: ${obj.consejos.higiene || '—'}</p>`;
  }
  if (obj.justificacion_breve) html += `<blockquote>${obj.justificacion_breve}</blockquote>`;

  return html;
}

// --- Pantry helper ---
// Muy simple: separa por comas; reemplazalo por UI de chips/checkboxes si querés.
function guessPantryFromText(text = '') {
  return text
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.toLowerCase());
}

// --- Perfil (captura y cálculo de IMC) ---
$userForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const edad    = parseInt(document.getElementById('edad').value, 10) || 0;
  const sexo    = (document.getElementById('sexo').value || '').trim();
  const pesoKg  = parseFloat(document.getElementById('peso').value) || 0;
  const alturaC = parseFloat(document.getElementById('altura').value) || 0; // cm
  const alturaM = alturaC / 100;
  const imc     = alturaM > 0 ? +(pesoKg / (alturaM * alturaM)).toFixed(1) : 0;

  userProfile = { edad, sexo, pesoKg, alturaCm: alturaC, imc };

  if ($chatBox) $chatBox.style.display = 'flex';
  addMsg(`✅ Perfil guardado. Edad: ${edad}, Sexo: ${sexo || '—'}, Peso: ${pesoKg} kg, Altura: ${alturaC} cm, IMC: ${imc}`, 'bot');
});

// --- Envío de mensajes ---
$form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = ($input.value || '').trim();
  if (!text) return;

  addMsg(text, 'user');
  $input.value = '';

  // Detección naive de pantry desde el texto
  const pantryDetected = guessPantryFromText(text);
  const pantry = pantryDetected.length ? pantryDetected : lastPantry;
  lastPantry = pantry;

  // Placeholder “pensando…”
  const thinking = addMsg('Pensando…', 'bot');

  const payload = {
    message: text,
    sessionId,
    context: {
      page: location.pathname,
      profile: userProfile, // puede estar vacío si no completaron el form
      pantry                    // array de strings
    }
  };

  try {
    const r = await fetch('/api/ia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const ct = (r.headers.get('content-type') || '').toLowerCase();
    let data;
    if (ct.includes('application/json')) {
      data = await r.json();
    } else {
      const t = await r.text();
      try { data = JSON.parse(t); } catch { data = { reply: t }; }
    }

    // Normalización de respuesta: soporta {…}, {output:{…}}, [{…}], [{output:{…}}]
    const obj = Array.isArray(data)
      ? (data[0]?.output ?? data[0])
      : (data?.output ?? data);

    // Renderer Nutriado primero; si vacío, fallback al renderer legacy
    const htmlNutriado = renderNutriado(obj);
    if (htmlNutriado) thinking.innerHTML = htmlNutriado;
    else thinking.innerHTML = renderBotMessage(obj);
  } catch (err) {
    console.error(err);
    thinking.textContent = '💥 Error hablando con el asistente.';
  }
});

// --- UX: Enter envía (en inputs de una línea); Shift+Enter para salto (si es textarea) ---
$input?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    $form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  }
});
</script>
