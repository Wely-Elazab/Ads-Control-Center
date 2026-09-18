// الصفحات القانونية: نفس اختيار اللغة بتاع الأداة (acc.lang)، أو ?lang=en في الرابط.
// بيتنفّذ في <head> عشان الصفحة تترسم باللغة الصح من أول لحظة
(function () {
  var KEY = 'acc.lang';
  var lang = new URLSearchParams(location.search).get('lang');
  if (lang !== 'ar' && lang !== 'en') { try { lang = localStorage.getItem(KEY); } catch (e) { /* تخزين مقفول */ } }
  if (lang !== 'ar' && lang !== 'en') lang = 'ar';

  function apply(l) {
    lang = l;
    var root = document.documentElement;
    root.lang = l;
    root.dir = l === 'ar' ? 'rtl' : 'ltr';
    var title = root.getAttribute('data-title-' + l);
    if (title) document.title = title;
    var btn = document.getElementById('legalLang');
    if (btn) btn.textContent = l === 'ar' ? 'English' : 'العربية';
  }
  apply(lang);

  document.addEventListener('DOMContentLoaded', function () {
    apply(lang);
    document.getElementById('legalLang').addEventListener('click', function () {
      var next = lang === 'ar' ? 'en' : 'ar';
      try { localStorage.setItem(KEY, next); } catch (e) { /* مش مهم */ }
      apply(next);
    });
  });
})();
