// صفحة /stop — رابط الإيقاف في آخر رسائل الملخص التلقائي (stop.html)
// الرابط فيه رقم المستخدم (u — من ٣١ أكتوبر ٢٠٢٦ الملخص لكل مستخدم) أو رقم الحساب (a — رسائل اتبعتت قبل كده) والتوقيع بس.
// الإيقاف بعد ضغط الزرار (مش أول ما الصفحة تفتح) عشان برامج البريد اللي بتفحص الروابط لوحدها متوقفش الملخص من غير ما العميل يقصد
(function () {
  var SYNC_URL = 'https://rhrrnxsgodiideqeollo.supabase.co/functions/v1/sync';
  var q = new URLSearchParams(location.search);
  var user = q.get('u') || '', account = q.get('a') || '', sig = q.get('s') || '';
  var uOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user), aOk = /^act_\d{1,30}$/.test(account);
  var valid = (uOk || aOk) && /^[A-Za-z0-9_-]{20,100}$/.test(sig);
  // الطلب بنفس المعرّف اللي عدّى التحقق: u غلط مع a صح كانت بتعدّي التحقق وتبعت u الغلط (التدقيق الشامل ٢٥ نوفمبر ٢٠٢٦، ١١٣)
  var payload = uOk ? { action: 'stop', u: user, sig: sig } : { action: 'stop', account: account, sig: sig };

  function show(state) {
    var had = document.activeElement;
    Array.prototype.forEach.call(document.querySelectorAll('[data-stop-state]'), function (el) {
      el.hidden = el.getAttribute('data-stop-state') !== state;
    });
    // الزرار اللي اتضغط اتخبّى مع قسمه: التركيز بيروح للقسم الجديد (زي #joinDone و#sentBox) بدل ما يضيع — ومش أول ما الصفحة تفتح
    // (التدقيق الشامل ٢٥ نوفمبر ٢٠٢٦، ١١٤)
    if (had && had !== document.body && !had.getClientRects().length) document.querySelector('[data-stop-state="' + state + '"]').focus();
  }
  function stop() {
    show('busy');
    fetch(SYNC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { show(r.ok ? 'done' : (r.status === 403 || r.status === 400 ? 'bad' : 'error')); })
      .catch(function () { show('error'); });
  }

  // الرابط نفسه بيتشال من شريط العنوان بعد القراءة (فيه التوقيع — ميتنسخش ولا يفضل في السجل)
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* مش مهم */ }
  if (!valid) { show('bad'); return; }
  document.getElementById('stopBtn').addEventListener('click', stop);
  document.getElementById('stopRetry').addEventListener('click', stop);
})();
