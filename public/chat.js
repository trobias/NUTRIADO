const $log = document.getElementById('chat-log');
const $form = document.getElementById('chat-form');
const $input = document.getElementById('chat-input');

const sessionId = (() => {
  const k = 'nutriado_session';
  let v = localStorage.getItem(k);
  if(!v){ v = crypto.getRandomValues(new Uint32Array(1))[0].toString(16); localStorage.setItem(k, v); }
  return v;
})();

function addMsg(text, who='bot'){
  const div = document.createElement('div');
  div.className = `msg ${who}`;
  div.textContent = text;
  $log.appendChild(div);
  $log.scrollTop = $log.scrollHeight;
}

$form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $input.value.trim();
  if(!text) return;
  addMsg(text, 'user');
  $input.value = '';
  addMsg('Pensando…', 'bot');

  const payload = { message: text, sessionId, context: { page: location.pathname } };

  try {
    const r = await fetch('/api/ia', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const isJSON = (r.headers.get('content-type') || '').includes('application/json');
    const data = isJSON ? await r.json() : { reply: await r.text() };
    const last = $log.querySelector('.msg.bot:last-of-type');
    last.textContent = data.reply || 'Sin respuesta';
  } catch (err) {
    const last = $log.querySelector('.msg.bot:last-of-type');
    last.textContent = 'Error hablando con el asistente.';
    console.error(err);
  }
});
