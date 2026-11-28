// صفحة /invite — رابط دعوة المتجر اللي بيوصل للمدعو بالبريد (invite.html — المتجر وفريقه، ٢٧ نوفمبر ٢٠٢٦؛ الخادم: sync/stores.ts)
// الرابط فيه الرمز بس (t — ٤٣ حرف). القبول بعد ضغط الزرار (مش أول ما الصفحة تفتح) عشان برامج البريد اللي بتفحص الروابط لوحدها متقبلش
// الدعوة بدل صاحبها. اللي مالوش دخول في الأداة: الخادم بيرجّع رابط إنشاء كلمة المرور (reset) فبنروحله على طول — زي «نسيت كلمة المرور»
(function () {
  var SYNC_URL = 'https://rhrrnxsgodiideqeollo.supabase.co/functions/v1/sync';
  var q = new URLSearchParams(location.search);
  var token = q.get('t') || '', en = q.get('lang') === 'en' || document.documentElement.lang === 'en';
  var valid = /^[A-Za-z0-9_-]{43}$/.test(token);

  function show(state) {
    var had = document.activeElement;
    Array.prototype.forEach.call(document.querySelectorAll('[data-inv-state]'), function (el) {
      el.hidden = el.getAttribute('data-inv-state') !== state;
    });
    // الزرار اللي اتضغط اتخبّى مع قسمه: التركيز بيروح للقسم الجديد (زي stop.js) — ومش أول ما الصفحة تفتح
    if (had && had !== document.body && !had.getClientRects().length) document.querySelector('[data-inv-state="' + state + '"]').focus();
  }
  function post(body) {
    return fetch(SYNC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j || {} }; }); });
  }
  // نص من الخادم بيتحط كنص بس (textContent) — اسم المتجر كتبه عضو، ومينفعش يبقى HTML
  function fill(sel, text) { Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) { el.textContent = text; }); }
  function peek() {
    show('busy');
    post({ action: 'invite.peek', t: token }).then(function (r) {
      var b = r.body;
      if (r.status !== 200) { show('error'); return; }
      if (b.state === 'open') {
        fill('[data-inv-store]', String(b.store || ''));
        fill('[data-inv-email]', String(b.email || ''));
        fill('[data-inv-role-ar]', b.role === 'manager' ? 'مدير' : 'مشاهد');
        fill('[data-inv-role-en]', b.role === 'manager' ? 'manager' : 'viewer');
        Array.prototype.forEach.call(document.querySelectorAll('[data-inv-what]'), function (el) { el.hidden = el.getAttribute('data-inv-what') !== b.role; });
        show('view');
        return;
      }
      show(b.state === 'used' ? 'used' : (b.state === 'expired' ? 'expired' : 'bad'));
    }, function () { show('error'); });
  }
  function accept() {
    show('accepting');
    post({ action: 'invite.accept', t: token }).then(function (r) {
      var b = r.body;
      if (r.status === 200 && b.ok) {
        // حساب جديد (أو من غير دخول للأداة): صفحة إنشاء كلمة المرور على طول
        if (typeof b.reset === 'string' && /^[A-Za-z0-9_-]{10,200}$/.test(b.reset)) {
          location.href = '/login?reset=' + encodeURIComponent(b.reset) + (en ? '&lang=en' : '');
          return;
        }
        show('done');
        return;
      }
      if (r.status === 409) { show(b.error === 'used' ? 'used' : (b.error === 'expired' ? 'expired' : 'bad')); return; }
      show('error');
    }, function () { show('error'); });
  }

  // الرابط نفسه بيتشال من شريط العنوان بعد القراءة (فيه الرمز — ميتنسخش ولا يفضل في السجل)
  try { history.replaceState(null, '', location.pathname + (en ? '?lang=en' : '')); } catch (e) { /* مش مهم */ }
  if (!valid) { show('bad'); return; }
  document.getElementById('invAccept').addEventListener('click', accept);
  // إعادة المحاولة: لو الدعوة لسه متقريتش بنقراها، ولو القبول اللي فشل بنقرا تاني (يمكن اتقبلت فعلاً)
  document.getElementById('invRetry').addEventListener('click', peek);
  peek();
})();
