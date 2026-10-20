import type { CreateDraft } from './create-logic';

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Safe to drop inside a <script>: no closing tag can be spelled out of the data. */
const jsonForScript = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, ' ');

export function windowHtml(draft: CreateDraft, channel: string): string {
  return `<html><head><title>Create in Civa</title><style>
    body { font-family: system-ui; padding: 18px; font-size: 13px; }
    h2 { margin: 0 0 4px; font-size: 16px; }
    table { border-collapse: collapse; width: 100%; margin: 10px 0; }
    th, td { text-align: left; padding: 5px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
    input[type=text], select { padding: 5px; width: 100%; box-sizing: border-box; }
    .hint { color: #666; font-size: 12px; }
    .err { color: #a33; white-space: pre-wrap; margin: 8px 0; }
    .ok { color: #0a6b0a; margin: 8px 0; }
    .results { position: absolute; background: #fff; border: 1px solid #aaa; z-index: 5; min-width: 180px; }
    .results div { padding: 4px 8px; cursor: pointer; }
    .results div:hover { background: #eef; }
    .row { margin: 10px 0; }
    button { padding: 8px 16px; margin-right: 8px; }
    .picked { font-weight: 600; }
  </style></head><body>
    <h2>Create "${escapeHtml(draft.gameName)}" in Civa</h2>
    <div class="hint">Signed in as <b>${escapeHtml(draft.owner.name)}</b>. Match each seat to a Civa account, or leave it open or AI. You must hold one seat.</div>
    <table><thead><tr><th>Seat</th><th>PYDT player</th><th>Civa player</th><th>Role</th></tr></thead><tbody id="seats"></tbody></table>
    <div class="row"><label>Ruleset <select id="pin"></select></label></div>
    <div class="row">Mode:
      <label><input type="radio" name="mode" value="mirror" checked> Read-only mirror (follows the PYDT game)</label>
      <label><input type="radio" name="mode" value="playable"> Playable (continue in Civa)</label></div>
    <div id="warnings" class="hint"></div>
    <div id="msg"></div>
    <div class="row"><button id="create">Create</button><button id="cancel">Cancel</button><button id="open" style="display:none">Open in browser</button></div>
    <script>
      const { ipcRenderer } = require('electron');
      const draft = ${jsonForScript(draft)};
      const chan = ${jsonForScript(channel)};
      const state = draft.seats.map(s => ({ index: s.index, role: s.match ? 'account' : 'open', account: s.match, timer: null }));
      const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const tbody = document.getElementById('seats');
      function render() {
        tbody.innerHTML = '';
        draft.seats.forEach((s, i) => {
          const st = state[i];
          const tr = document.createElement('tr');
          const how = s.matchedBy === 'search' ? 'matched by name' : s.matchedBy === 'suggestion' ? 'suggested by Civa' : '';
          tr.innerHTML = '<td>' + esc(s.civilization) + '<br><span class="hint">' + esc(s.leader) + '</span></td>' +
            '<td>' + esc(s.playerName || '—') + '</td>' +
            '<td><div class="picked" id="pick' + i + '">' + (st.account ? esc(st.account.name) + (st.account === s.match && how ? ' <span class="hint">(' + how + ')</span>' : '') : '<span class="hint">no account</span>') + '</div>' +
            '<input type="text" id="q' + i + '" placeholder="Search Civa players…" autocomplete="off"><div class="results" id="res' + i + '" style="display:none"></div></td>' +
            '<td><select id="role' + i + '"><option value="account">Account</option><option value="open">Open</option><option value="ai">AI</option></select></td>';
          tbody.appendChild(tr);
          const role = tr.querySelector('#role' + i);
          role.value = st.role;
          role.onchange = () => { st.role = role.value; };
          const q = tr.querySelector('#q' + i);
          const res = tr.querySelector('#res' + i);
          q.oninput = () => {
            clearTimeout(st.timer);
            const text = q.value.trim();
            if (text.length < 2) { res.style.display = 'none'; return; }
            st.timer = setTimeout(async () => {
              const hits = await ipcRenderer.invoke(chan + ':search', text);
              res.innerHTML = '';
              hits.forEach(h => {
                const d = document.createElement('div');
                d.textContent = h.name;
                d.onclick = () => { st.account = h; st.role = 'account'; q.value = ''; render(); };
                res.appendChild(d);
              });
              if (!hits.length) res.innerHTML = '<div class="hint">No player found</div>';
              res.style.display = 'block';
            }, 250);
          };
        });
      }
      render();
      const pin = document.getElementById('pin');
      draft.rulesets.forEach((r, i) => {
        const o = document.createElement('option');
        o.value = String(i); o.textContent = r.label + (r.ok ? '' : ' — cannot load this game');
        o.disabled = !r.ok;
        pin.appendChild(o);
      });
      pin.value = String(Math.max(0, draft.rulesets.findIndex(r => JSON.stringify(r.pin) === JSON.stringify(draft.defaultPin))));
      document.getElementById('warnings').textContent = draft.warnings.slice(0, 3).join(' · ');
      const msg = document.getElementById('msg');
      let createdId = null;
      document.getElementById('create').onclick = async () => {
        msg.className = ''; msg.textContent = 'Creating…';
        const choice = {
          pin: draft.rulesets[Number(pin.value)].pin,
          mode: document.querySelector('input[name=mode]:checked').value,
          seats: state.map(s => ({ index: s.index, role: s.role, accountId: s.account ? s.account.id : null })),
        };
        const result = await ipcRenderer.invoke(chan + ':create', choice);
        if (result.ok) {
          createdId = result.url;
          msg.className = 'ok'; msg.textContent = 'Created. ' + result.url;
          document.getElementById('open').style.display = 'inline-block';
          document.getElementById('create').disabled = true;
        } else { msg.className = 'err'; msg.textContent = result.error; }
      };
      document.getElementById('open').onclick = () => ipcRenderer.send(chan + ':open', createdId);
      document.getElementById('cancel').onclick = () => window.close();
    </script></body></html>`;
}
