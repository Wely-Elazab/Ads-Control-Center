// =====================================================================
// Ads Control Center — مشغّل الاختبارات
// =====================================================================
// 1) بيحفظ نسخة من التخزين (اللغة، الإعدادات، الجلسة) عشان الاختبارات متبوّظش إعداداتك
// 2) بيحمّل HTML الصفحة الحقيقية جوه الصفحة دي (الكود بيدوّر على عناصرها بالـ id)
// 3) بيمنع تحميل مكتبات Meta وGoogle (مش محتاجينها، والاختبارات بتشتغل من غير نت)
// 4) بيحمّل ملفات الأداة بنفس ترتيب الموقع، وبعدين tests.js
(function () {
  var KEYS_LOCAL = ['acc.lang', 'acc.period.v1', 'acc.view.v1', 'pauseproof.alertSettings.v1'];
  var KEYS_SESSION = ['pauseproof.session.v1', 'pauseproof.oauthState'];
  var backup = { local: {}, session: {} };
  KEYS_LOCAL.forEach(function (k) { backup.local[k] = localStorage.getItem(k); localStorage.removeItem(k); });
  KEYS_SESSION.forEach(function (k) { backup.session[k] = sessionStorage.getItem(k); sessionStorage.removeItem(k); });
  window.__restoreStorage = function () {
    KEYS_LOCAL.forEach(function (k) { if (backup.local[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, backup.local[k]); });
    KEYS_SESSION.forEach(function (k) { if (backup.session[k] == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, backup.session[k]); });
  };

  // عناصر وهمية بنفس id سكربتات المكتبات — الكود بيشوفها موجودة فمبيحمّلش المكتبة الحقيقية
  ['facebook-jssdk', 'google-identity-sdk'].forEach(function (id) {
    var s = document.createElement('script'); s.id = id; s.type = 'text/plain'; document.head.appendChild(s);
  });

  var SCRIPTS = ['/js/i18n.js', '/js/alerts.js', '/js/core.js', '/js/meta.js', '/js/google.js', '/js/snapchat.js',
    '/js/tiktok.js', '/js/ui.js', '/js/main.js', '/js/pricing.js', '/tests/tests.js'];

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
