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
      if (res.ok && res.data.access_token) { write(fromResponse(res.data, email)); return { ok: true }; }
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
        authCall('POST', '/logout?scope=local', null, temp);
        if (u.ok) return { ok: true, email: (v.data.user && v.data.user.email) || null };
        var weak = u.status === 422 || /password/i.test(String(u.data.msg || u.data.message || u.data.error_code || ''));
        return { ok: false, error: u.status === 0 ? 'network' : (weak ? 'weak' : 'failed') };
      });
    });
  }

  // بيقفل الجلسة دي (على الجهاز وعند Supabase) — forget من غير ما يتنقل (صفحة الدخول: «الدخول بحساب آخر»)
  function forget() {
    var s = read();
    write(null);
    return s ? authCall('POST', '/logout?scope=local', null, s.access_token) : Promise.resolve(null);
  }
  function signOut() {
    var done = function () { location.replace('/login'); };
    forget().then(done, done);
  }

  // صفحة الدخول، والرجوع بعدها لنفس المكان (الأداة بس — مش أي رابط برّه الموقع)
  function toLogin() {
    var here = location.pathname + location.search + location.hash;
    location.replace('/login' + (here && here !== '/' ? '?next=' + encodeURIComponent(here) : ''));
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
    forgot: forgot, status: status, resetPassword: resetPassword, signOut: signOut, forget: forget, toLogin: toLogin, safeNext: safeNext,
    // رد من /api أو sync معناه «الدخول خلص أو مش مكتمل» (مش «ربط المنصة خلص»)
    isLoginFailure: function (res) { return !!res && res.status === 401 && !!res.data && res.data.code === 'LOGIN'; }
  };
  guardApp();
})(window);
