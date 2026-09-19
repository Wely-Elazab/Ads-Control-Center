// =====================================================================
// Ads Control Center — الوضع الداكن / الفاتح (كل الصفحات)
// =====================================================================
// بيتنفّذ في <head> قبل ما الصفحة ترسم — عشان مفيش وميض أبيض لو العميل مختار الداكن.
// الافتراضي: نفس وضع الجهاز (prefers-color-scheme في CSS). لو العميل غيّر من زرار الأداة أو صفحات الموقع،
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
    },
    // لما العميل يغيّر الوضع من تاب تاني (الاختيار بيتطبّق هنا على طول)
    onChange: function (cb) { listeners.push(cb); }
  };
  var listeners = [];

  // زرار الوضع الداكن في صفحات الموقع (الرئيسية، الدليل، الصفحات القانونية، 404): أي زرار عليه data-theme-toggle.
  // الأيقونة بتوضّح الوضع الحالي (☀️ فاتح / 🌙 داكن) زي زرار الأداة، و aria-pressed = الداكن شغّال.
  // زرار الأداة نفسها ليه كوده في ui.js ومش عليه data-theme-toggle
  function syncButtons() {
    var dark = global.ACC_THEME.isDark();
    Array.prototype.forEach.call(document.querySelectorAll('[data-theme-toggle]'), function (b) {
      b.setAttribute('aria-pressed', dark ? 'true' : 'false');
      var icon = b.querySelector('[data-theme-icon]');
      if (icon) icon.textContent = dark ? '🌙' : '☀️';
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-theme-toggle]') : null;
    if (!b) return;
    global.ACC_THEME.set(global.ACC_THEME.isDark() ? 'light' : 'dark');
    syncButtons();
  });
  global.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    if (e.newValue === 'dark' || e.newValue === 'light') document.documentElement.setAttribute('data-theme', e.newValue);
    else document.documentElement.removeAttribute('data-theme');
    syncButtons();
    listeners.forEach(function (cb) { cb(); });
  });
  global.ACC_THEME.onSystemChange(syncButtons);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncButtons); else syncButtons();
})(window);
