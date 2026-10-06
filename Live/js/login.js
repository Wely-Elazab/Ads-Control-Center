// صفحة /login — خطوات الدخول للأداة (login.html). الجلسة نفسها في js/auth.js (AuthLogin)، والرمز في دالة sync (auth.ts).
//   signin → code → /app (أو ?next=… لو جاي من الأداة)
//   forgot / first → sent   («نسيت كلمة المرور» و«أول دخول؟» نفس الخطوة: رابط على البريد)
//   ?reset=… (رابط البريد) → reset → signin برسالة «تم حفظ كلمة المرور»
// الدالة هي اللي بتقرر فعلاً (مين مسموح له، الرمز صح ولا لأ، حدود المحاولات)، والتحقق هنا عشان الرسالة تبان بسرعة
(function () {
  var A = window.AuthLogin;
  if (!A || !document.getElementById('signinForm')) return;
  var params = new URLSearchParams(location.search);
  var next = A.safeNext(params.get('next'));
  var EMAIL = /^[^@\s<>"',;]{1,64}@[^@\s<>"',;]{1,190}\.[A-Za-z]{2,24}$/;
  var MIN_PASSWORD = 8;

  var MESSAGES = {
    email: { ar: 'اكتب بريدك الإلكتروني بشكل صحيح.', en: 'Please enter a valid email address.' },
    password: { ar: 'اكتب كلمة المرور.', en: 'Please enter your password.' },
    credentials: { ar: 'البريد أو كلمة المرور غير صحيحة.', en: 'The email or password is incorrect.' },
    busy: { ar: 'محاولات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.', en: 'Too many attempts. Please wait a little and try again.' },
    network: { ar: 'تعذّر الاتصال. تأكد من الإنترنت وحاول مرة أخرى.', en: 'We couldn\'t connect. Check your internet and try again.' },
    access: { ar: 'هذا الحساب غير مفعّل في التجربة بعد. إن كنت أرسلت طلب انضمام، فسنفعّله خلال ٢٤ ساعة.', en: 'This account isn\'t activated in the pilot yet. If you sent a request to join, we\'ll activate it within 24 hours.' },
    code: { ar: 'اكتب الرمز المكوّن من ٦ أرقام.', en: 'Please enter the 6-digit code.' },
    wrong: { ar: 'الرمز غير صحيح.', en: 'That code isn\'t right.' },
    wrongLeft: { ar: 'الرمز غير صحيح. بقيت لك {n} من المحاولات.', en: 'That code isn\'t right. {n} attempts left.' },
    expired: { ar: 'انتهت صلاحية الرمز. اضغط «أعد إرسال الرمز».', en: 'The code has expired. Press "Send a new code".' },
    tries: { ar: 'تجاوزت عدد المحاولات لهذا الرمز. اضغط «أعد إرسال الرمز».', en: 'Too many attempts for this code. Press "Send a new code".' },
    sends: { ar: 'طلبت رموزاً كثيرة. اضغط «الدخول بحساب آخر» وسجّل الدخول من جديد بعد قليل.', en: 'You\'ve asked for many codes. Press "Use another account" and sign in again a little later.' },
    mail: { ar: 'تعذّر إرسال الرمز الآن. حاول مرة أخرى بعد قليل.', en: 'We couldn\'t send the code right now. Please try again shortly.' },
    weak: { ar: 'اختر كلمة مرور من ٨ أحرف على الأقل.', en: 'Please choose a password of at least 8 characters.' },
    mismatch: { ar: 'كلمتا المرور غير متطابقتين.', en: 'The two passwords don\'t match.' },
    link: { ar: 'انتهت صلاحية الرابط أو استُخدم من قبل. اطلب رابطاً جديداً من «نسيت كلمة المرور؟».', en: 'This link has expired or was already used. Ask for a new one from "Forgot your password?".' },
    failed: { ar: 'حدث خطأ. حاول مرة أخرى بعد قليل، أو راسلنا على support@adscenter.online.', en: 'Something went wrong. Please try again shortly, or email us at support@adscenter.online.' },
    saved: { ar: 'تم حفظ كلمة المرور. سجّل الدخول الآن.', en: 'Your password is saved. Sign in now.' },
    wait: { ar: 'يمكنك طلب رمز جديد بعد {n} ثانية.', en: 'You can ask for a new code in {n} seconds.' }
  };
  function lang() { return document.documentElement.lang === 'en' ? 'en' : 'ar'; }
  function digits(n) { return lang() === 'en' ? String(n) : String(n).replace(/\d/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }); }
  function text(key, n) { var m = MESSAGES[key] || MESSAGES.failed; return m[lang()].replace('{n}', digits(n)); }
  function $(id) { return document.getElementById(id); }

  function show(state, focusId) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-login-state]'), function (el) {
      el.hidden = el.getAttribute('data-login-state') !== state;
    });
    window.scrollTo(0, 0);
    var f = focusId && $(focusId);
    if (f) f.focus();
  }
  function error(boxId, key, n, inputId) {
    var box = $(boxId);
    box.textContent = text(key, n);
    box.hidden = false;
    var input = inputId && $(inputId);
    if (input) { input.setAttribute('aria-invalid', 'true'); input.focus(); }
  }
  function clear(boxId) {
    var box = $(boxId);
    box.hidden = true;
    box.textContent = '';
    Array.prototype.forEach.call(document.querySelectorAll('[aria-invalid]'), function (el) { el.removeAttribute('aria-invalid'); });
  }
  function busy(btnId, on) { var b = $(btnId); b.disabled = on; b.classList.toggle('is-busy', on); }
  function setEmail(email) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-login-email]'), function (el) { el.textContent = email || ''; });
  }
  function goApp() { location.replace(next); }

  // ---------- الرمز ----------
  var waitTimer = null;
  function waitResend(seconds) {
    var btn = $('resendCode'), note = $('resendWait');
    clearInterval(waitTimer);
    var left = Math.max(0, Math.round(seconds));
    var tick = function () {
      if (left <= 0) { clearInterval(waitTimer); btn.disabled = false; note.hidden = true; return; }
      btn.disabled = true; note.hidden = false; note.textContent = text('wait', left); left--;
    };
    tick();
    waitTimer = setInterval(tick, 1000);
  }
  // بيبعت الرمز ويفتح خطوته. الرد verified = الجلسة دي متأكدة خلاص (جهاز رجع للصفحة)
  function sendCode() {
    return A.sendCode().then(function (res) {
      if (res.ok && res.data.verified) { goApp(); return; }
      show('code', 'lCode');
      if (res.ok) { waitResend(60); return; }
      if (res.status === 429 && res.data.error === 'wait') { waitResend(res.data.retryIn || 60); return; }
      if (res.status === 401) { A.forget(); show('signin', 'lEmail'); return; }
      error('codeError', res.status === 403 ? 'access' : (res.status === 0 ? 'network' : (res.data.error === 'sends' ? 'sends' : 'mail')));
    });
  }

  $('signinForm').addEventListener('submit', function (e) {
    e.preventDefault();
    clear('signinError');
    var email = $('lEmail').value.trim(), password = $('lPassword').value;
    if (!EMAIL.test(email)) { error('signinError', 'email', 0, 'lEmail'); return; }
    if (!password) { error('signinError', 'password', 0, 'lPassword'); return; }
    busy('signinSubmit', true);
    A.signIn(email, password).then(function (res) {
      if (!res.ok) { busy('signinSubmit', false); error('signinError', res.error, 0, res.error === 'credentials' ? 'lPassword' : null); return; }
      $('lPassword').value = '';
      setEmail(email.toLowerCase());
      return A.status().then(function (st) {
        if (st.ok && !st.data.access) { busy('signinSubmit', false); error('signinError', 'access'); A.forget(); return; }
        return sendCode().then(function () { busy('signinSubmit', false); });
      });
    });
  });

  $('codeForm').addEventListener('submit', function (e) {
    e.preventDefault();
    clear('codeError');
    var code = $('lCode').value.replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); }).replace(/\s+/g, '');
    if (!/^\d{6}$/.test(code)) { error('codeError', 'code', 0, 'lCode'); return; }
    busy('codeSubmit', true);
    A.verifyCode(code).then(function (res) {
      busy('codeSubmit', false);
      if (res.ok && res.data.verified) { goApp(); return; }
      var k = res.data && res.data.error;
      if (res.status === 0) error('codeError', 'network');
      else if (k === 'code' && typeof res.data.left === 'number') error('codeError', res.data.left > 0 ? 'wrongLeft' : 'tries', res.data.left, 'lCode');
      else error('codeError', k === 'expired' || k === 'tries' ? k : (res.status === 401 ? 'credentials' : 'failed'), 0, 'lCode');
    });
  });
  $('resendCode').addEventListener('click', function () { clear('codeError'); sendCode(); });
  $('otherAccount').addEventListener('click', function () {
    A.forget();
    $('lCode').value = '';
    show('signin', 'lEmail');
  });

  // ---------- رابط كلمة المرور ----------
  function openForgot(kind) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-forgot-title]'), function (el) { el.hidden = el.getAttribute('data-forgot-title') !== kind; });
    var typed = $('lEmail').value.trim();
    if (typed && !$('fEmail').value) $('fEmail').value = typed;
    clear('forgotError');
    show('forgot', 'fEmail');
  }
  document.addEventListener('click', function (e) {
    var go = e.target && e.target.closest ? e.target.closest('[data-go]') : null;
    if (!go) return;
    var to = go.getAttribute('data-go');
    if (to === 'forgot' || to === 'first') openForgot(to);
    else { $('signinNote').hidden = true; show('signin', 'lEmail'); }
  });
  $('forgotForm').addEventListener('submit', function (e) {
    e.preventDefault();
    clear('forgotError');
    var email = $('fEmail').value.trim();
    if (!EMAIL.test(email)) { error('forgotError', 'email', 0, 'fEmail'); return; }
    busy('forgotSubmit', true);
    A.forgot(email).then(function (res) {
      busy('forgotSubmit', false);
      if (res.ok) { show('sent', 'sentBox'); return; }
      error('forgotError', res.status === 0 ? 'network' : (res.status === 400 ? 'email' : 'failed'), 0, res.status === 400 ? 'fEmail' : null);
    });
  });

  // ---------- كلمة مرور جديدة ----------
  var resetToken = params.get('reset');
  $('resetForm').addEventListener('submit', function (e) {
    e.preventDefault();
    clear('resetError');
    var p1 = $('rPassword').value, p2 = $('rConfirm').value;
    if (p1.length < MIN_PASSWORD) { error('resetError', 'weak', 0, 'rPassword'); return; }
    if (p1 !== p2) { error('resetError', 'mismatch', 0, 'rConfirm'); return; }
    busy('resetSubmit', true);
    A.resetPassword(resetToken, p1).then(function (res) {
      busy('resetSubmit', false);
      if (!res.ok) { error('resetError', res.error === 'weak' ? 'weak' : (res.error === 'link' ? 'link' : (res.error === 'network' ? 'network' : 'failed'))); return; }
      $('rPassword').value = ''; $('rConfirm').value = '';
      // الرابط مبيتستخدمش تاني، فبنشيله من العنوان
      history.replaceState(null, '', '/login');
      if (res.email) $('lEmail').value = res.email;
      var note = $('signinNote');
      note.textContent = text('saved');
      note.hidden = false;
      show('signin', res.email ? 'lPassword' : 'lEmail');
    });
  });

  // ---------- البداية ----------
  if (resetToken && /^[A-Za-z0-9_-]{10,200}$/.test(resetToken)) { show('reset', 'rPassword'); return; }
  if (params.get('first') === '1') { openForgot('first'); return; }
  // جلسة موجودة على الجهاز: مأكَّدة = على الأداة على طول، ولسه مستنية الرمز = خطوة الرمز
  if (A.read()) {
    A.status().then(function (st) {
      if (st.ok && st.data.verified) { goApp(); return; }
      if (st.ok && st.data.access) { setEmail(st.data.email); sendCode(); return; }
      if (st.status === 401 || (st.ok && !st.data.access)) A.forget();
    });
  }
})();
