// public/chat.js

// --- DOM ---
const $log   = document.getElementById('chat-log');
const $form  = document.getElementById('chat-form');
const $input = document.getElementById('chat-input');

const $userForm = document.getElementById('user-form'); // form de perfil (edad/sexo/peso/altura)
const $chatBox  = document.getElementById('nutriado-chat'); // contenedor del chat (lo mostramos después de guardar perfil)

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
let userProfile = {};     // { edad, sexo, pesoKg, alturaCm, imc }
let lastPantry  = [];     // cache de la última “despensa” detectada/enviada

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

function renderBotMessage(data) {
  const obj = Array.isArray(data) ? data[0] : data;
  let html = '';

  if (obj.reply) {
    html += `<p>${obj.reply}</p>`;
  }

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

// --- Pantry helper ---
// Extractor muy simple: separa por comas y limpia.
// Si querés algo más fino, reemplazá por tu UI de checkboxes o chips.
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

  // Mostrar el chat y feedback
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

  // Detección simple de pantry desde el texto (podés reemplazarlo por tu UI)
  const pantryDetected = guessPantryFromText(text);
  // Si no detectamos nada en este turno, reutilizamos la última lista (si existe)
  const pantry = pantryDetected.length ? pantryDetected : lastPantry;
  lastPantry = pantry;

  // Placeholder de “pensando…”
  const thinking = addMsg('Pensando…', 'bot');

  const payload = {
    message: text,
    sessionId,
    context: {
      page: location.pathname,
      profile: userProfile, // puede venir vacío si no completaron el form
      pantry                  // array de strings
    }
  };

  try {
    const r = await fetch('/api/ia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const ct = r.headers.get('content-type') || '';
    let data;
    if (ct.includes('application/json')) {
      data = await r.json();
    } else {
      const t = await r.text();
      try { data = JSON.parse(t); } catch { data = { reply: t }; }
    }

    const obj  = Array.isArray(data) ? data[0] : data;
    const html = renderBotMessage(obj);
    thinking.innerHTML = html;
  } catch (err) {
    console.error(err);
    thinking.textContent = '💥 Error hablando con el asistente.';
  }
});

// --- UX: Enter envía, Shift+Enter hace salto de línea (si el input es <textarea>) ---
$input?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    $form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  }
});
