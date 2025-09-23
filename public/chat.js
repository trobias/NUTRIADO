const $log = document.getElementById('chat-log');
const $form = document.getElementById('chat-form');
const $input = document.getElementById('chat-input');

const sessionId = (() => {
  const k = 'nutriado_session';
  let v = localStorage.getItem(k);
  if (!v) {
    v = crypto.getRandomValues(new Uint32Array(1))[0].toString(16);
    localStorage.setItem(k, v);
  }
  return v;
})();

function addMsg(content, who = 'bot', isHTML = false) {
  const div = document.createElement('div');
  div.className = `msg ${who}`;
  if (isHTML) {
    div.innerHTML = content;
  } else {
    div.textContent = content;
  }
  $log.appendChild(div);
  $log.scrollTop = $log.scrollHeight;
}

function renderBotMessage(data) {
  const obj = Array.isArray(data) ? data[0] : data;
  let html = '';

  // Texto principal
  if (obj.reply) {
    html += `<p>${obj.reply}</p>`;
  }

  // Recetas sugeridas
  if (obj.recetas && obj.recetas.length) {
    html += `<h4>🍽️ Recetas sugeridas:</h4>`;
    obj.recetas.forEach(r => {
      html += `<div class="receta">
        <b>${r.nombre}</b>
        <ul>${(r.ingredientes || []).map(i => `<li>${i}</li>`).join('')}</ul>
        <ol>${(r.pasos || []).map(p => `<li>${p}</li>`).join('')}</ol>
        <small>Macros: ${r.macros?.kcal || 0} kcal, ${r.macros?.prot || 0}g prot, ${r.macros?.carb || 0}g carb, ${r.macros?.gras || 0}g gras</small>
      </div>`;
    });
  }

  // Lista de compras
  if (obj.compras && obj.compras.length) {
    html += `<h4>🛒 Podrías comprar:</h4><ul>${obj.compras.map(c => `<li>${c}</li>`).join('')}</ul>`;
  }

  return html || 'Sin respuesta';
}

$form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $input.value.trim();
  if (!text) return;
  addMsg(text, 'user');
  $input.value = '';
  addMsg('Pensando…', 'bot');

  const payload = { message: text, sessionId, context: { page: location.pathname } };

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
      try { data = JSON.parse(t); }
      catch { data = { reply: t }; }
    }

    const obj = Array.isArray(data) ? data[0] : data;
    const html = renderBotMessage(obj);

    const last = $log.querySelector('.msg.bot:last-of-type');
    last.innerHTML = html;
  } catch (err) {
    const last = $log.querySelector('.msg.bot:last-of-type');
    last.textContent = 'Error hablando con el asistente.';
    console.error(err);
  }
});
