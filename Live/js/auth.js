// =====================================================================
// Ads Center — تسجيل الدخول للأداة (قرار صاحب المنتج ٦ أكتوبر ٢٠٢٦)
// =====================================================================
// بريد وكلمة مرور (Supabase Auth)، وبعدهم رمز من ٦ أرقام على البريد في كل دخول جديد (supabase/functions/sync/auth.ts).
// الجلسة على الجهاز ده (localStorage) لحد «خروج» — والتأكيد بالرمز بيفضل ٣٠ يوم، وبعدها دخول جديد.
// - AuthLogin.headers(): هيدر الدخول لطلبات /api ودالة sync (core.js apiPost وui.js syncCall)
// - حارس صفحة الأداة (/app): من غير دخول مكتمل → /login?next=… ، والأداة مبتظهرش لحد ما نتأكد
// - زرار «خروج» في الأداة (#logoutBtn)
// المفتاح العام (publishable) عام بطبيعته — زي رقم تطبيق Meta. مفيش أي سر هنا
(function (global) {
  var PROJECT = 'https://rhrrnxsgodiideqeollo.supabase.co';
  var KEY = 'sb_publishable_rrAe735nWhuBQRJxt7lxiw_4DP37wo0';
  var AUTH_URL = PROJECT + '/auth/v1', SYNC_URL = PROJECT + '/functions/v1/sync';
  var STORE = 'ac.login';
  var APP_PATH = '/app';

  function read() {
    try { var s = JSON.parse(localStorage.getItem(STORE) || 'null'); return s && s.access_token && s.refresh_token ? s : null; }
    catch (e) { return null; }
  }
  function write(s) {
    try { if (s) localStorage.setItem(STORE, JSON.stringify(s)); else localStorage.removeItem(STORE); } catch (e) { /* وضع خاص */ }
  }
  function fromResponse(j, email) {
    return {
      access_token: j.access_token, refresh_token: j.refresh_token,
      expires_at: j.expires_at ? j.expires_at * 1000 : Date.now() + (j.expires_in || 3600) * 1000,
      email: (j.user && j.user.email) || email || null
    };
  }
  function lang() { return document.documentElement.lang === 'en' ? 'en' : 'ar'; }

  // طلب لـ Supabase Auth: { status, ok, data } — من غير ما يرمي
  function authCall(method, path, body, token) {
    var headers = { 'apikey': KEY, 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    return fetch(AUTH_URL + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, ok: r.ok, data: j || {} }; }); })
      .catch(function () { return { status: 0, ok: false, data: { code: 'NETWORK' } }; });
  }

  // مفتاح دخول صالح (بيتجدد لوحده قبل ما يخلص بدقيقة)، أو null
  var refreshing = null;
  function token() {
    var s = read();
    if (!s) return Promise.resolve(null);
    if (s.expires_at - Date.now() > 60000) return Promise.resolve(s.access_token);
    if (!refreshing) {
      refreshing = authCall('POST', '/token?grant_type=refresh_token', { refresh_token: s.refresh_token }).then(function (res) {
        refreshing = null;
        if (res.ok && res.data.access_token) { write(fromResponse(res.data, s.email)); return res.data.access_token; }
        // الجلسة اتلغت (خروج من جهاز تاني، أو انتهت) — مش عطل شبكة
        if (res.status >= 400 && res.status < 500) write(null);
        return null;
      });
    }
    return refreshing;
  }
  function headers() { return token().then(function (t) { return t ? { 'Authorization': 'Bearer ' + t } : {}; }); }
  // نفس headers() بس فوراً (الطلب بيتبعت في نفس اللحظة) — null لو المفتاح محتاج تجديد، وساعتها headers()
  function headersNow() {
    var s = read();
    if (!s) return {};
    return s.expires_at - Date.now() > 60000 ? { 'Authorization': 'Bearer ' + s.access_token } : null;
  }

  // عمليات login.* في دالة sync
  function sync(action, body) {
    return headers().then(function (h) {
      var all = { 'Content-Type': 'application/json' };
      Object.keys(h).forEach(function (k) { all[k] = h[k]; });
      return fetch(SYNC_URL, { method: 'POST', headers: all, body: JSON.stringify(Object.assign({ action: action, lang: lang() }, body || {})) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, ok: r.ok, data: j || {} }; }); })
        .catch(function () { return { status: 0, ok: false, data: { error: 'network' } }; });
    });
  }

  // الخطوة الأولى: البريد وكلمة المرور. الخطأ: 'credentials' (غلط) / 'network' / 'busy' (محاولات كتير)
  function signIn(email, password) {
    return authCall('POST', '/token?grant_type=password', { email: email, password: password }).then(function (res) {
      if (res.ok && res.data.access_token) {
        var s = fromResponse(res.data, email);
        bindDevice(s.email);   // قبل أي حاجة: لو اللي كان داخل قبله حد تاني، بياناته على الجهاز بتتمسح
        write(s);
        return { ok: true };
      }
      return { ok: false, error: res.status === 0 ? 'network' : (res.status === 429 ? 'busy' : 'credentials') };
    });
  }
  function sendCode() { return sync('login.code'); }
  function verifyCode(code) { return sync('login.verify', { code: code }); }
  function forgot(email) { return sync('login.forgot', { email: email }); }
  function status() { return sync('login.status'); }

  // رابط «اختر كلمة المرور» من البريد: الرابط بيفتح جلسة مؤقتة بنغيّر بيها كلمة المرور وبعدين بنقفلها —
  // الدخول نفسه بعدها بكلمة المرور + الرمز زي العادي
  function resetPassword(tokenHash, password) {
    return authCall('POST', '/verify', { type: 'recovery', token_hash: tokenHash }).then(function (v) {
      if (!v.ok || !v.data.access_token) return { ok: false, error: v.status === 0 ? 'network' : 'link' };
      var temp = v.data.access_token;
      return authCall('PUT', '/user', { password: password }, temp).then(function (u) {
        // كلمة المرور اتغيّرت = كل الجلسات بتتقفل، مش الجلسة المؤقتة دي بس (التدقيق الشامل ١١ نوفمبر ٢٠٢٦ — OWASP ASVS 3.3.3): تغيير
        // كلمة المرور هو طريق صاحب الحساب لما حد تاني يعرفها (رسالة الرمز نفسها بتقول «غيّرها فوراً»)، فلازم يطلّع أي جلسة مفتوحة بيها —
        // مش يسيبها مأكَّدة ٣٠ يوم. ماتغيّرتش = المؤقتة بس
        authCall('POST', '/logout?scope=' + (u.ok ? 'global' : 'local'), null, temp);
        if (u.ok) return { ok: true, email: (v.data.user && v.data.user.email) || null };
        var weak = u.status === 422 || /password/i.test(String(u.data.msg || u.data.message || u.data.error_code || ''));
        return { ok: false, error: u.status === 0 ? 'network' : (weak ? 'weak' : 'failed') };
      });
    });
  }

  // كلمة المرور الجديدة ظهرت في تسريبات قبل كده؟ (مراجعة ١ نوفمبر ٢٠٢٦، ق٧ — NIST SP 800-63B: «SHALL» تتقارن بقائمة
  // المسرَّب). خيار Supabase نفسه للخطة المدفوعة بس، فبنسأل نفس المصدر (Pwned Passwords) من المتصفح بإخفاء الهوية:
  // بنبعت أول ٥ حروف من بصمة SHA-1 بس، والرد كل البصمات اللي بتبدأ بيهم، والمقارنة هنا على الجهاز — كلمة المرور
  // نفسها وبصمتها الكاملة مبيطلعوش. Add-Padding: الرد بحجم ثابت تقريباً، فحجمه مبيكشفش حاجة (السطور الزيادة عددها ٠).
  // بيرجّع عدد مرات الظهور، أو null لو المصدر مش متاح (شبكة، حجب، ٥ ثواني): ساعتها بنكمّل — منقفلش الدخول بسبب خدمة برّه
  var PWNED_URL = 'https://api.pwnedpasswords.com/range/';
  function pwnedCount(password) {
    if (!global.crypto || !crypto.subtle || typeof TextEncoder === 'undefined' || typeof AbortController === 'undefined') return Promise.resolve(null);
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 5000);
    return crypto.subtle.digest('SHA-1', new TextEncoder().encode(password)).then(function (buf) {
      var hex = Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('').toUpperCase();
      var suffix = hex.slice(5);
      return fetch(PWNED_URL + hex.slice(0, 5), { headers: { 'Add-Padding': 'true' }, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctrl.signal })
        .then(function (r) { return r.ok ? r.text() : null; })
        .then(function (body) {
          if (body == null) return null;
          var lines = body.split('\n');
          for (var i = 0; i < lines.length; i++) {
            var parts = lines[i].trim().split(':');
            if (parts[0] === suffix) return Number(parts[1]) || 0;
          }
          return 0;
        });
    }).then(function (n) { clearTimeout(timer); return n; }, function () { clearTimeout(timer); return null; });
  }

  // بيقفل الجلسة دي (على الجهاز وعند Supabase) — forget من غير ما يتنقل (صفحة الدخول: «الدخول بحساب آخر»)
  function forget() {
    var s = read();
    write(null);
    return s ? authCall('POST', '/logout?scope=local', null, s.access_token) : Promise.resolve(null);
  }
  // «خروج» = مفيش حاجة من الحساب تفضل على الجهاز: الربط المحفوظ (Meta وGoogle وSnapchat — core.js acc.renew.v1)،
  // وآخر حساب إعلاني، وجلسة التاب. قبل كده اللي يدخل بعدك على نفس الجهاز كان بيلاقي حسابات Google وSnapchat
  // بتاعتك مربوطة. الملخص التلقائي بالبريد مبيتأثرش (ده «فصل» Meta بس اللي بيوقفه).
  // ومن ٣١ أكتوبر (كل حاجة لكل مستخدم): نسخة الجهاز من إجاباتك على «هل كان التشخيص صحيحاً؟»، والمبالغ المحسوبة للوحة «ما حققته مع
  // الأداة»، وموافقتك على ملاحظتها — كانت بتبان للي يدخل بعدك
  // value.money.v2 من ٣ نوفمبر ٢٠٢٦ (المبالغ المقيسة)، وv1 بتفضل عشان أجهزة لسه عليها النسخة القديمة
  // acc.digestHint وacc.welcome.accounts.v1 (التدقيق الشامل ١١ نوفمبر ٢٠٢٦): فيهم أرقام الحسابات الإعلانية اللي المستخدم فتحها — كانوا بيفضلوا
  // pauseproof.alertSettings.v1 (التدقيق الشامل ١٢ نوفمبر ٢٠٢٦): نسخة الجهاز القديمة من إعدادات التنبيهات (قبل ما تبقى لكل مستخدم). مستخدم
  // مالوش سجل لسه بتتنقل لسجله أول ما يفتح الأداة (ui.js legacyMerge) — فلو فضلت بعد «خروج» أو بعد تغيّر صاحب الدخول، اللي يدخل بعده
  // كان هيورث مستهدف وحدود اللي قبله من غير ما يعرف
  var DEVICE_KEYS = ['acc.renew.v1', 'acc.lastAccount.v1', 'acc.dx.fb.v1', 'pauseproof.value.money.v1', 'pauseproof.value.money.v2', 'pauseproof.value.ack.v1',
    'acc.digestHint', 'acc.welcome.accounts.v1', 'pauseproof.alertSettings.v1'];
  // ---------- بيانات الجهاز لصاحب الدخول بس ----------
  // التدقيق الشامل ١١ نوفمبر ٢٠٢٦ (OWASP ASVS 3.3.1 و4.1.x — عزل المستخدمين): ربط المنصات المحفوظ (acc.renew.v1) وجلسة التاب
  // (sessionStorage: مفاتيح Google وSnapchat، ومفتاح Meta الطويل نحو ٦٠ يوم) كانوا بيفضلوا لو صاحب الدخول اتغيّر من غير «خروج» — جلسة
  // انتهت، أو «الدخول بحساب آخر» في صفحة الدخول. اللي يدخل بعده في نفس التاب كان بيفتح الأداة على حسابات اللي قبله الإعلانية.
  // دلوقتي الجهاز والتاب ليهم «صاحب» (بريد الدخول): أول ما يتغيّر، بيانات اللي قبله بتتمسح قبل ما الأداة تقراها. نفس الصاحب = كل حاجة
  // زي ما هي (الربط المحفوظ بيفضل). جهاز أو تاب من قبل التحديث ملوش صاحب مسجّل: بيتسجّل من غير مسح
  var OWNER_KEY = 'ac.owner';
  function wipeDevice() {
    try { DEVICE_KEYS.forEach(function (k) { localStorage.removeItem(k); }); sessionStorage.clear(); } catch (e) { /* التخزين مقفول */ }
  }
  function bindDevice(email) {
    if (!email) return;
    var me = String(email).toLowerCase();
    try {
      var prev = localStorage.getItem(OWNER_KEY);
      if (prev && prev !== me) wipeDevice();
      if (prev !== me) localStorage.setItem(OWNER_KEY, me);
      // التاب نفسه: جلسة المنصات اللي فيه ليها صاحبها (تاب مفتوح من قبل ما الدخول يتغيّر في تاب تاني)
      var tab = sessionStorage.getItem(OWNER_KEY);
      if (tab && tab !== me) sessionStorage.clear();
      if (tab !== me) sessionStorage.setItem(OWNER_KEY, me);
    } catch (e) { /* التخزين مقفول — مفيش حاجة محفوظة أصلاً */ }
  }
  // الدخول اتغيّر لحساب تاني في تاب تاني والأداة مفتوحة هنا: التاب بيتحمّل من جديد (bindDevice بيمسح جلسته في أول التحميل) بدل ما
  // يفضل عارض حسابات اللي قبله
  global.addEventListener('storage', function (e) {
    if (e.key !== STORE || location.pathname !== APP_PATH) return;
    var s = read(), tab = null;
    try { tab = sessionStorage.getItem(OWNER_KEY); } catch (x) { /* مقفول */ }
    if (s && s.email && tab && String(s.email).toLowerCase() !== tab) location.reload();
  });

  function signOut() {
    wipeDevice();
    try { localStorage.removeItem(OWNER_KEY); } catch (e) { /* التخزين مقفول */ }
    var done = function () { goLogin('/login'); };
    forget().then(done, done);
  }
  // النقل لصفحة الدخول بييجي بعد رد من الشبكة: في الأداة بيعدّي على PageExit.leave (route.js) اللي بيوقف رابط الأداة.
  // احتياط: اللي بيلغي النقل هو الرجوع خطوة في السجل بس — replaceState وpushState لأ (تجربة ١٧ أكتوبر في Chromium) —
  // ونفس الخلل ده هو اللي وقّف ربط Google وSnapchat ١١–١٢ أكتوبر. باقي الصفحات مفيهاش route.js
  function goLogin(url) {
    if (global.PageExit) global.PageExit.leave(url, true); else location.replace(url);
  }

  // صفحة الدخول، والرجوع بعدها لنفس المكان (الأداة بس — مش أي رابط برّه الموقع)
  function toLogin() {
    var here = location.pathname + location.search + location.hash;
    goLogin('/login' + (here && here !== '/' ? '?next=' + encodeURIComponent(here) : ''));
  }
  function safeNext(v) {
    return typeof v === 'string' && /^\/app(?:[?#].*)?$/.test(v) ? v : APP_PATH;
  }

  // ---------- حارس صفحة الأداة ----------
  // على /app بس: صفحة الاختبارات المحلية بتفتح pauseproof-live.html من غير دخول، وعلى الموقع العنوان ده
  // بيتحوّل لـ /app في الـ Worker (isToolFile) — فمفيش طريق عادي للأداة من غير الحارس.
  // الأداة مخفية (auth-pending) لحد ما الدالة تقول إن الجلسة مأكَّدة. لو الشبكة وقعت بنسيبها تفتح —
  // طلبات Google وSnapchat والملخص والإجابات محمية في الخادم نفسه (api/_login.js وauth.ts).
  // قراءة أرقام Meta بس هي اللي بتروح من المتصفح لـ Meta على طول، فالحارس ده قفل على الصفحة مش على البيانات:
  // اللي يعطّله في متصفحه يقدر يربط Meta لحساباته هو بس، ولو Meta قابلاه (وضع التطوير = المختبِرين بس)
  function guardApp() {
    if (location.pathname !== APP_PATH) return;
    var root = document.documentElement;
    if (!read()) { toLogin(); return; }
    root.classList.add('auth-pending');
    status().then(function (res) {
      if (res.status === 401 || (res.ok && !res.data.verified)) { toLogin(); return; }
      root.classList.remove('auth-pending');
      if (res.ok && res.data.email) showAccount(res.data.email);
    });
  }
  function showAccount(email) {
    var apply = function () {
      var btn = document.getElementById('logoutBtn');
      if (!btn) return;
      btn.hidden = false;
      var title = global.I18N ? I18N.t('auth.logoutTitle', { email: email }) : email;
      btn.title = title;
      btn.setAttribute('aria-label', title);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
  }
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('#logoutBtn') : null;
    if (t) { e.preventDefault(); signOut(); }
  });

  global.AuthLogin = {
    read: read, token: token, headers: headers, headersNow: headersNow, signIn: signIn, sendCode: sendCode, verifyCode: verifyCode,
    forgot: forgot, status: status, resetPassword: resetPassword, pwnedCount: pwnedCount, signOut: signOut, forget: forget, toLogin: toLogin, safeNext: safeNext,
    bindDevice: bindDevice,
    // رد من /api أو sync معناه «الدخول خلص أو مش مكتمل» (مش «ربط المنصة خلص»)
    isLoginFailure: function (res) { return !!res && res.status === 401 && !!res.data && res.data.code === 'LOGIN'; }
  };
  // قبل ما core.js يقرا جلسة التاب والربط المحفوظ (الملف ده بيتحمّل قبله): صاحب الدخول الحالي هو صاحب بيانات الجهاز
  (function () { var s = read(); if (s && s.email) bindDevice(s.email); })();
  guardApp();
})(window);
