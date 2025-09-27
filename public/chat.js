// public/chat.js

// --- DOM ---
const $log   = document.getElementById('chat-log');
const $form  = document.getElementById('chat-form');
const $input = document.getElementById('chat-input');

const $userForm = document.getElementById('user-form'); // form de perfil (edad/sexo/peso/altura)
const $chatBox  = document.getElementById('nutriado-chat'); // contenedor del chat (lo mostramos debajo del IMC)

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
    // reply puede venir en HTML desde n8n
    html += `<div class="reply-block">${obj.reply}</div>`;
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
  // NO flotante
  $chatBox.classList.remove('chat');        // quita el look oscuro flotante
  // Modo embebido claro + centrado en el flujo de la página
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

// Al cargar: bloqueado y oculto (quedará visible al desbloquear)
setChatEnabled(false);

// Si el index.html ya calculó y expuso un perfil global, úsalo
if (window.__nutriadoProfile && Number(window.__nutriadoProfile.imc) > 0) {
  unlockChat(window.__nutriadoProfile);
}

// También escuchamos el evento que dispara index.html tras calcular IMC
window.addEventListener('nutriado:profile:ready', (e) => {
  unlockChat(e.detail || {});
  // feedback opcional
  if (userProfile?.imc > 0) {
    addMsg(`✅ Perfil listo. IMC: ${userProfile.imc}`, 'bot');
  }
});

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
// Si enviás el perfil desde index.html ya no es obligatorio este handler,
// pero lo dejamos para soportar páginas donde no está ese script.
$userForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const edad    = parseInt(document.getElementById('edad').value, 10) || 0;
  const sexo    = (document.getElementById('sexo').value || '').trim();
  const pesoKg  = parseFloat(document.getElementById('peso').value) || 0;
  const alturaC = parseFloat(document.getElementById('altura').value) || 0; // cm
  const alturaM = alturaC / 100;
  const imc     = alturaM > 0 ? +(pesoKg / (alturaM * alturaM)).toFixed(1) : 0;

  unlockChat({ edad, sexo, pesoKg, alturaCm: alturaC, imc });

  if (userProfile?.imc > 0) {
    addMsg(`✅ Perfil guardado. Edad: ${edad}, Sexo: ${sexo || '—'}, Peso: ${pesoKg} kg, Altura: ${alturaC} cm, IMC: ${imc}`, 'bot');
    // Emitimos también el evento por si otra parte del sitio lo usa
    const ev = new CustomEvent('nutriado:profile:ready', { detail: userProfile });
    window.dispatchEvent(ev);
  } else {
    addMsg('⚠️ Revisá los datos del perfil para calcular el IMC.', 'bot');
  }
});

// --- Envío de mensajes ---
$form?.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Guardia: no permitir chatear sin IMC
  if (!userProfile?.imc || userProfile.imc <= 0) {
    addMsg('⚠️ Primero completá tu perfil y calculá tu IMC.', 'bot');
    return;
  }

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
      profile: userProfile, // puede venir vacío si no completaron el form, pero acá ya lo validamos
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

