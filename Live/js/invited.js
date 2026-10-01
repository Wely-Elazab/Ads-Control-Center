// صفحة /invited — لصاحب الأداة بس (invited.html): زرار «أرسلت الدعوة» في إشعار طلب الانضمام بيفتحها
// بالرابط الموقّع (r = رقم الطلب، s = التوقيع). بتعرض الطلب، والإرسال للعميل بعد ضغط الزرار بس.
// البيانات بتتكتب بـ textContent (جاية من نموذج عام — ممنوع innerHTML)
(function () {
  var SYNC_URL = 'https://rhrrnxsgodiideqeollo.supabase.co/functions/v1/sync';
  var q = new URLSearchParams(location.search);
  var id = q.get('r') || '', sig = q.get('s') || '';
  var NAMES = { meta: 'Meta', google: 'Google Ads', snapchat: 'Snapchat', tiktok: 'TikTok' };
  var last = 'load';

  function show(state) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-inv-state]'), function (el) {
      el.hidden = el.getAttribute('data-inv-state') !== state;
    });
  }
  function call(action) {
    return fetch(SYNC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: action, id: id, sig: sig }) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.status === 403 || r.status === 404 || r.status === 400) throw new Error('bad');
          if (!r.ok) throw new Error('error');
          return j;
        });
      });
  }
  function fail(e) { show(e && e.message === 'bad' ? 'bad' : 'error'); }
  function day(iso) { return iso ? String(iso).slice(0, 10) : ''; }

  function render(req) {
    var rows = [
      ['الاسم', req.name], ['النشاط', req.business], ['المتجر', req.store], ['البلد', req.country],
      ['المنصات', (req.platforms || []).map(function (p) { return NAMES[p] || p; }).join('، ')],
      ['فيسبوك', req.fb], ['بريد Google Ads', req.googleEmail], ['البريد', req.email], ['واتساب', req.whatsapp],
      ['لغة الرسائل', req.lang === 'en' ? 'الإنجليزية' : 'العربية'], ['تاريخ الطلب', day(req.createdAt)]
    ];
    var body = document.getElementById('invDetails');
    body.textContent = '';
    rows.forEach(function (r) {
      if (!r[1]) return;
      var tr = document.createElement('tr'), th = document.createElement('th'), td = document.createElement('td');
      th.textContent = r[0];
      td.textContent = r[1];
      if (/^https?:\/\//.test(r[1]) || /@/.test(r[1]) || r[0] === 'واتساب') td.dir = 'ltr';
      tr.appendChild(th); tr.appendChild(td); body.appendChild(tr);
    });
    var note = document.getElementById('invNote'), btn = document.getElementById('invSend');
    if (req.activatedAt) {
      note.textContent = 'أُرسلت إليه رسالة التفعيل من قبل يوم ' + day(req.activatedAt) + '. الإرسال مرة أخرى يرسل الرسالة نفسها من جديد.';
      note.hidden = false;
      btn.textContent = 'أعد إرسال رسالة التفعيل';
    }
  }

  function load() {
    last = 'load';
    show('busy');
    call('join.peek').then(function (j) { render(j.request || {}); show('view'); }, fail);
  }
  function send() {
    last = 'send';
    show('sending');
    call('join.activate').then(function (j) {
      var req = j.request || {};
      document.getElementById('invDoneText').textContent = 'أُرسلت الرسالة إلى ' + (req.email || 'العميل') + '، وأصبحت حالة الطلب «مفعّل».';
      show('done');
    }, fail);
  }

  // الرابط نفسه بيتشال من شريط العنوان بعد القراءة (فيه التوقيع)
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* مش مهم */ }
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[A-Za-z0-9_-]{20,100}$/.test(sig)) { show('bad'); return; }
  document.getElementById('invSend').addEventListener('click', send);
  document.getElementById('invRetry').addEventListener('click', function () { if (last === 'send') send(); else load(); });
  load();
})();
