// =====================================================================
// Ads Control Center — الوضع الداكن / الفاتح (كل الصفحات)
// =====================================================================
// بيتنفّذ في <head> قبل ما الصفحة ترسم — عشان مفيش وميض أبيض لو العميل مختار الداكن.
// الافتراضي: نفس وضع الجهاز (prefers-color-scheme في CSS). لو العميل غيّر من زرار الأداة،
// اختياره بيتحفظ (acc.theme) وبيتطبّق على كل الصفحات: data-theme="dark" أو "light" على <html>
(function (global) {
  var KEY = 'acc.theme';
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* تخزين مقفول */ }
  if (saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);

  var media = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null;
  global.ACC_THEME = {
    // الوضع الظاهر فعلاً: اختيار العميل لو موجود، وإلا وضع الجهاز
    isDark: function () {
      var v = document.documentElement.getAttribute('data-theme');
      if (v === 'dark') return true;
      if (v === 'light') return false;
      return !!(media && media.matches);
    },
    set: function (mode) {
      document.documentElement.setAttribute('data-theme', mode);
      try { localStorage.setItem(KEY, mode); } catch (e) { /* مش مهم */ }
    },
    // لما وضع الجهاز يتغيّر (والعميل مختارش بنفسه) — عشان أيقونة الزرار تفضل صح
    onSystemChange: function (cb) {
      if (!media) return;
      if (media.addEventListener) media.addEventListener('change', cb); else if (media.addListener) media.addListener(cb);
    }
  };
})(window);
