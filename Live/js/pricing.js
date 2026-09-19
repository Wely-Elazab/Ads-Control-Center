// =====================================================================
// Ads Control Center — صفحة الأسعار
// =====================================================================
// الأسعار كلها هنا في مكان واحد — تغيير السعر = تعديل الرقم ده بس
(function (global) {
  var PRICING = {
    currency: 'USD',
    monthly: 9.99,        // اشتراك شهري
    yearlyPerMonth: 6.99, // اشتراك سنوي (السعر للشهر)
    trialDays: 14,
    contactEmail: 'walid.elazab20@gmail.com'
  };
  PRICING.yearlyTotal = function () { return Math.round(PRICING.yearlyPerMonth * 12 * 100) / 100; };
  PRICING.savingPct = function () { return Math.round((1 - PRICING.yearlyPerMonth / PRICING.monthly) * 100); };
  global.ACC_PRICING = PRICING;

  // ---------- الصفحة نفسها (لو موجودة) ----------
  var AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  function isAr() { return document.documentElement.lang !== 'en'; }
  function num(n) {
    var s = (Math.round(n * 100) / 100).toFixed(2);
    return isAr() ? s.replace('.', '٫').replace(/[0-9]/g, function (d) { return AR_DIGITS[d]; }) : s;
  }
  function int(n) { return isAr() ? String(n).replace(/[0-9]/g, function (d) { return AR_DIGITS[d]; }) : String(n); }

  var billing = 'yearly';
  function render() {
    var card = document.getElementById('planCard');
    if (!card) return;
    var yearly = billing === 'yearly';
    var price = yearly ? PRICING.yearlyPerMonth : PRICING.monthly;
    Array.prototype.forEach.call(document.querySelectorAll('[data-price]'), function (el) { el.textContent = num(price); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-yearly-total]'), function (el) { el.textContent = num(PRICING.yearlyTotal()); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-saving]'), function (el) { el.textContent = int(PRICING.savingPct()); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-trial-days]'), function (el) { el.textContent = int(PRICING.trialDays); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-billing-note]'), function (el) {
      el.classList.toggle('hidden', el.getAttribute('data-billing-note') !== billing);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-billing]'), function (b) {
      var on = b.getAttribute('data-billing') === billing;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    // زرار التجربة: إيميل جاهز فيه الخطة والبيانات اللي محتاجينها عشان نضيفك على Meta وGoogle
    var ar = isAr();
    var planName = ar ? (yearly ? 'السنوي' : 'الشهري') : (yearly ? 'yearly' : 'monthly');
    var subject = ar ? 'طلب تجربة مجانية — الاشتراك ' + planName : 'Free trial request — ' + planName + ' plan';
    var body = ar
      ? 'الاسم:\nاسم النشاط:\nالبلد:\nالمنصات اللي بتعلن عليها (Meta / Google / Snapchat / TikTok):\nإيميل Google اللي عليه حساب Google Ads (لو هتربط Google):\nرابط حسابك على فيسبوك (لو هتربط Meta):\nرقم واتساب للتواصل:\n'
      : 'Name:\nBusiness name:\nCountry:\nPlatforms you advertise on (Meta / Google / Snapchat / TikTok):\nGoogle email with your Google Ads account (if connecting Google):\nYour Facebook profile link (if connecting Meta):\nWhatsApp number:\n';
    var href = 'mailto:' + PRICING.contactEmail + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    Array.prototype.forEach.call(document.querySelectorAll('[data-trial-cta]'), function (a) { a.setAttribute('href', href); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var toggle = document.getElementById('billingToggle');
    if (!toggle) return;
    toggle.addEventListener('click', function (e) {
      var b = e.target.closest('[data-billing]'); if (!b) return;
      billing = b.getAttribute('data-billing');
      render();
    });
    // الأرقام بتتكتب تاني لما اللغة تتغيّر (عربي ↔ إنجليزي)
    var lang = document.getElementById('legalLang');
    if (lang) lang.addEventListener('click', function () { setTimeout(render, 0); });
    render();
  });
})(window);
