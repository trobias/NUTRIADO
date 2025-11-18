// public/chat.js

// --- DOM ---
const $log   = document.getElementById('chat-log');
const $form  = document.getElementById('chat-form');
const $input = document.getElementById('chat-input');

const $userForm = document.getElementById('user-form'); // form de perfil (edad/sexo/peso/altura)
const $chatBox  = document.getElementById('nutriado-chat'); // contenedor del chat (debajo del IMC)

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
  $log?.appendChild(div);
  if ($log) $log.scrollTop = $log.scrollHeight;
  return div;
}

// Unwrap tolerante para cualquier forma de respuesta
function unwrap(x) {
  if (!x) return {};
  if (Array.isArray(x)) return unwrap(x[0]);
  if (typeof x === 'string') return { reply: x };
  if (x.json) return unwrap(x.json);
  if (x.output) return unwrap(x.output);
  return x;
}

// Renderizador robusto
function renderBotMessage(data) {
  const o = unwrap(data);
  let html = '';

  // 1) Si viene reply (HTML o texto), lo mostramos tal cual
  if (typeof o.reply === 'string' && o.reply.trim()) {
    return `<div class="reply-block">${o.reply}</div>`;
  }

  // 2) Si no hay reply pero sí estructura normalizada/dish, armamos HTML básico
  const d = o.normalized?.dish || o.dish;
  if (d) {
    const ul = arr =>
      Array.isArray(arr) && arr.length
        ? `<ul>${arr.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
        : '';
    const ol = arr =>
      Array.isArray(arr) && arr.length
        ? `<ol>${arr.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ol>`
        : '';
    const prop = d.proporciones || {};
    html += `<h4>🍽️ ${escapeHtml(d.nombre || 'Plato sugerido')}</h4>`;
    html += `<p><b>Método:</b> ${escapeHtml(d.metodo || 'plancha')} | <b>Bebida:</b> ${escapeHtml(d.bebida || 'agua segura')}</p>`;
    if (prop.verduras_y_frutas || prop.proteinas || prop.cereales_tuberculos_legumbres) {
      html += `<p><b>Proporciones:</b> verduras/frutas ${prop.verduras_y_frutas ?? '½'}, proteínas ${prop.proteinas ?? '¼'}, cereales/tubérculos ${prop.cereales_tuberculos_legumbres ?? '¼'}</p>`;
    }
    if (Array.isArray(d.ingredientes_usados) && d.ingredientes_usados.length) {
      html += `<p><b>Ingredientes:</b></p>${ul(d.ingredientes_usados)}`;
    }
    html += ol(d.pasos || []);

    if (Array.isArray(o.alternativas_si_falta_algo) && o.alternativas_si_falta_algo.length) {
      html += `<h5>Alternativas</h5>${ul(o.alternativas_si_falta_algo)}`;
    }
    if (o.consejos && (o.consejos.sodio || o.consejos.azucar || o.consejos.higiene)) {
      html += `<h5>Consejos</h5><ul>${
        ['sodio','azucar','higiene']
          .map(k => o.consejos[k] ? `<li><b>${k}:</b> ${escapeHtml(o.consejos[k])}</li>` : '')
          .join('')
      }</ul>`;
    }
  }

  // 3) Última red: mostramos JSON legible o “Sin respuesta”
  if (!html) {
    try { html = `<pre>${escapeHtml(JSON.stringify(o, null, 2))}</pre>`; }
    catch { html = 'Sin respuesta'; }
  }
  return html;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// --- Bloqueo/Desbloqueo del chat y posición bajo el IMC ---
function setChatEnabled(on) {
  const btn = $form?.querySelector('button');
  if (btn) btn.disabled = !on;
  if ($input) {
    $input.disabled = !on;
    $input.placeholder = on
      ? 'Contame qué tenés en la heladera...'
      : 'Completa tu perfil (IMC) para chatear';
  }
}

function ensureChatBelowIMC() {
  if (!$chatBox) return;
  // Quita look flotante oscuro si existiera
  $chatBox.classList.remove('chat');
  // Modo embebido claro + centrado en el flujo
  $chatBox.classList.add('chat-center', 'chat-embedded');
  // Mostrar
  $chatBox.style.display = 'flex';
}

function unlockChat(profile = {}) {
  // Normaliza y guarda
  userProfile = {
    edad: Number(profile.edad) || 0,
    sexo: profile.sexo || '',
    pesoKg: Number(profile.pesoKg ?? profile.peso) || 0,
    alturaCm: Number(profile.alturaCm ?? profile.altura) || 0,
    imc: Number(profile.imc) || 0,
  };
  if (userProfile.imc > 0) {
    ensureChatBelowIMC();
    setChatEnabled(true);
  }
}

// Al cargar: bloqueado
setChatEnabled(false);

// Si el index.html ya expuso el perfil global, usarlo
if (window.__nutriadoProfile && Number(window.__nutriadoProfile.imc) > 0) {
  unlockChat(window.__nutriadoProfile);
}

// Escucha del evento posterior al cálculo del IMC en index.html
window.addEventListener('nutriado:profile:ready', (e) => {
  unlockChat(e.detail || {});
  if (userProfile?.imc > 0) {
    addMsg(`✅ Perfil listo. IMC: ${userProfile.imc}`, 'bot');
  }
});

// --- Pantry helper ---
// Partimos solo por COMAS (no por espacios) para respetar frases como "esencia de vainilla".
function guessPantryFromText(text = '') {
  return text
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.toLowerCase());
}

// --- Overlay helpers (usando jQuery LoadingOverlay de forma "segura") ---
function showOverlay(targetSelector = '#nutriado-chat', message = 'Generando tu receta...') {
  try {
    if (window.jQuery && typeof jQuery.fn.LoadingOverlay === 'function') {
      const $t = jQuery(targetSelector);
      if ($t.length) $t.LoadingOverlay('show', { text: message });
    }
  } catch (_) {}
}

function hideOverlay(targetSelector = '#nutriado-chat') {
  try {
    if (window.jQuery && typeof jQuery.fn.LoadingOverlay === 'function') {
      const $t = jQuery(targetSelector);
      if ($t.length) $t.LoadingOverlay('hide');
    }
  } catch (_) {}
}

// --- Perfil (fallback si no usás el script del index) ---
$userForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const edad    = parseInt(document.getElementById('edad')?.value, 10) || 0;
  const sexo    = (document.getElementById('sexo')?.value || '').trim();
  const pesoKg  = parseFloat(document.getElementById('peso')?.value) || 0;
  const alturaC = parseFloat(document.getElementById('altura')?.value) || 0; // cm
  const alturaM = alturaC / 100;
  const imc     = alturaM > 0 ? +(pesoKg / (alturaM * alturaM)).toFixed(1) : 0;

  unlockChat({ edad, sexo, pesoKg, alturaCm: alturaC, imc });

  if (userProfile?.imc > 0) {
    addMsg(`✅ Perfil guardado. Edad: ${edad}, Sexo: ${sexo || '—'}, Peso: ${pesoKg} kg, Altura: ${alturaC} cm, IMC: ${imc}`, 'bot');
    // Emitimos evento por si otras partes lo usan
    const ev = new CustomEvent('nutriado:profile:ready', { detail: userProfile });
    window.dispatchEvent(ev);
  } else {
    addMsg('⚠️ Revisá los datos del perfil para calcular el IMC.', 'bot');
  }
});

// --- Envío de mensajes ---
$form?.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Guardia: no chatear sin IMC válido
  if (!userProfile?.imc || userProfile.imc <= 0) {
    addMsg('⚠️ Primero completá tu perfil y calculá tu IMC.', 'bot');
    return;
  }

  const text = ($input?.value || '').trim();
  if (!text) return;

  addMsg(text, 'user');
  if ($input) $input.value = '';

  // Pantry por comas (o reusa última)
  const pantryDetected = guessPantryFromText(text);
  const pantry = pantryDetected.length ? pantryDetected : lastPantry;
  lastPantry = pantry;

  // Placeholder de “pensando…”
  const thinking = addMsg('Pensando…', 'bot');

  const payload = {
    message: text,
    sessionId,
    context: {
      page: location.pathname,
      profile: userProfile, // ya validado
      pantry                  // array de strings
    }
  };

  try {
    // Mostrar overlay mientras consultamos la IA
    showOverlay('#nutriado-chat', 'Generando tu receta...');

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

    console.debug('[Nutriado] IA RAW →', data); // debug útil

    const html = renderBotMessage(data);
    thinking.innerHTML = html;
  } catch (err) {
    console.error(err);
    thinking.textContent = '💥 Error hablando con el asistente.';
  } finally {
    // Ocultar overlay SIEMPRE (éxito o error)
    hideOverlay('#nutriado-chat');
  }
});

// --- UX: Enter envía, Shift+Enter hace salto de línea (si el input es <textarea>) ---
$input?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    $form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  }
});
