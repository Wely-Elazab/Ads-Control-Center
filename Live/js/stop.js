// صفحة /stop — رابط الإيقاف في آخر رسائل الملخص التلقائي (stop.html)
// الرابط فيه رقم الحساب والتوقيع بس. الإيقاف بعد ضغط الزرار (مش أول ما الصفحة تفتح) عشان برامج البريد
// اللي بتفحص الروابط لوحدها متوقفش الملخص من غير ما العميل يقصد
(function () {
  var SYNC_URL = 'https://rhrrnxsgodiideqeollo.supabase.co/functions/v1/sync';
  var q = new URLSearchParams(location.search);
  var account = q.get('a') || '', sig = q.get('s') || '';
  var valid = /^act_\d{1,30}$/.test(account) && /^[A-Za-z0-9_-]{20,100}$/.test(sig);

  function show(state) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-stop-state]'), function (el) {
      el.hidden = el.getAttribute('data-stop-state') !== state;
    });
  }
  function stop() {
    show('busy');
    fetch(SYNC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stop', account: account, sig: sig }) })
      .then(function (r) { show(r.ok ? 'done' : (r.status === 403 || r.status === 400 ? 'bad' : 'error')); })
      .catch(function () { show('error'); });
  }

  // الرابط نفسه بيتشال من شريط العنوان بعد القراءة (فيه التوقيع — ميتنسخش ولا يفضل في السجل)
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* مش مهم */ }
  if (!valid) { show('bad'); return; }
  document.getElementById('stopBtn').addEventListener('click', stop);
  document.getElementById('stopRetry').addEventListener('click', stop);
})();
