// =====================================================================
// Ads Center — مشغّل الاختبارات
// =====================================================================
// 1) بيحفظ نسخة من التخزين (اللغة، الإعدادات، الجلسة) عشان الاختبارات متبوّظش إعداداتك
// 2) بيحمّل HTML الصفحة الحقيقية جوه الصفحة دي (الكود بيدوّر على عناصرها بالـ id)
// 3) بيمنع تحميل مكتبات Meta وGoogle (مش محتاجينها، والاختبارات بتشتغل من غير نت)
// 4) بيحمّل ملفات الأداة بنفس ترتيب الموقع، وبعدين tests.js
(function () {
  // كل مفاتيح الأداة بتبدأ بواحدة من دول (ac.login جلسة الدخول، acc.* الإعدادات، pauseproof.* القديمة).
  // قبل كده كانت قايمة ثابتة بـ ١٠ مفاتيح، فـ ٩ مفاتيح زي ac.login وacc.renew.v1 كانت بتتغيّر في متصفحك من غير ما ترجع
  // (اختبار «الاختبارات مبتغيّرش تخزين المتصفح» في tests.js بيقارن القايمة دي بكل مفتاح مكتوب في الكود)
  var PREFIXES = ['ac.', 'acc.', 'pauseproof.'];
  function ours(k) { return typeof k === 'string' && PREFIXES.some(function (p) { return k.indexOf(p) === 0; }); }
  function keysIn(store) {
    var out = [];
    for (var i = 0; i < store.length; i++) { var k = store.key(i); if (ours(k)) out.push(k); }
    return out;
  }
  // بيحفظ مفاتيحنا ويشيلها — الاختبارات بتبدأ من تخزين نضيف
  function take(store) {
    var saved = {};
    keysIn(store).forEach(function (k) { saved[k] = store.getItem(k); });
    Object.keys(saved).forEach(function (k) { store.removeItem(k); });
    return saved;
  }
  // بيشيل أي مفتاح من بتوعنا اتعمل أثناء الاختبارات، ويرجّع اللي كان موجود قبلها بالظبط
  function putBack(store, saved) {
    keysIn(store).forEach(function (k) { store.removeItem(k); });
    Object.keys(saved).forEach(function (k) { store.setItem(k, saved[k]); });
  }
  var backup = { local: take(localStorage), session: take(sessionStorage) };
  // نافذة أول مرة (ضبط التنبيهات) متظهرش في نص الاختبارات — اختبارها بيشيل العلامة دي بنفسه
  localStorage.setItem('acc.welcome.v1', '1');
  window.__restoreStorage = function () {
    putBack(localStorage, backup.local);
    putBack(sessionStorage, backup.session);
  };

  // عناصر وهمية بنفس id سكربتات المكتبات — الكود بيشوفها موجودة فمبيحمّلش المكتبة الحقيقية
  ['facebook-jssdk', 'google-identity-sdk'].forEach(function (id) {
    var s = document.createElement('script'); s.id = id; s.type = 'text/plain'; document.head.appendChild(s);
  });

  var SCRIPTS = ['/js/theme.js', '/js/i18n.js', '/js/auth.js', '/js/alerts.js', '/js/core.js', '/js/diagnosis.js', '/js/meta.js', '/js/google.js', '/js/snapchat.js',
    '/js/tiktok.js', '/js/ui.js', '/js/route.js', '/js/main.js', '/js/pricing.js', '/tests/dx-sim.js', '/tests/tests.js'];
  // لاختبارات «البنية التقنية» في tests.js
  window.__testScripts = SCRIPTS.slice();
  window.__storageCovered = ours;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src + '?t=' + Date.now();
      s.onload = resolve;
      s.onerror = function () { reject(new Error('failed to load ' + src)); };
      document.body.appendChild(s);
    });
  }

  fetch('/pauseproof-live.html?t=' + Date.now())
    .then(function (r) { return r.text(); })
    .then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      Array.prototype.forEach.call(doc.body.querySelectorAll('script'), function (s) { s.remove(); });
      var holder = document.createElement('div');
      holder.id = 'appUnderTest';
      holder.innerHTML = doc.body.innerHTML;
      document.body.insertBefore(holder, document.body.firstChild);
      return SCRIPTS.reduce(function (p, src) { return p.then(function () { return loadScript(src); }); }, Promise.resolve());
    })
    .catch(function (err) {
      document.getElementById('testReport').innerHTML = '<h1>الاختبارات</h1><div class="t-summary fail">تعذّر التحميل: ' + err.message + '</div>';
      window.__tests = { passed: 0, failed: 1, failures: [{ name: 'load', msg: err.message }] };
      window.__restoreStorage();
    });
})();
