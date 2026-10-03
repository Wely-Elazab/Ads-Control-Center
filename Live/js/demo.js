// =====================================================================
// Ads Center — العرض التوضيحي في الصفحة الرئيسية (بيتحرّك مع التمرير)
// =====================================================================
// ٤ مشاهد ([data-scene]): ربط الحسابات ← ملخص المتجر ← التنبيهات ← تفاصيل تنبيه.
// مش GIF بيتكرر لوحده (قرار صاحب المنتج ٣ أكتوبر ٢٠٢٦): العرض بيثبت على الشاشة (sticky جوه [data-demo-track])،
// وكل ما الزائر ينزل بالصفحة بينتقل للمشهد اللي بعده، ولو طلع لفوق بيرجع. مسافة التمرير = .demo-scroll-space (site.css).
// الضغط على اسم خطوة بينقل لها. الأرقام في المشهد التاني بتعدّ لحد قيمتها أول ما المشهد يظهر (data-count).
//  - «تقليل الحركة» في الجهاز: نفس التنقّل مع التمرير، بس قطع مباشر من غير حركة، والأرقام بقيمتها على طول
//  - متصفح قديم من غير overflow: clip (الـ sticky مبيشتغلش جوه main): مفيش مسافة تمرير، والخطوات بالضغط بس
// المبالغ بعملة بلد الزائر (من المنطقة الزمنية لجهازه — من غير ما نجمع أو نبعت أي حاجة): ريال، درهم، دينار، جنيه…
// وغير كده دولار. الأسعار تقريبية ومدوّرة — كلها بيانات توضيحية ومكتوب عليها كده
(function () {
  var AR = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  function isAr() { return document.documentElement.lang !== 'en'; }

  // ---------- العملة ----------
  var ZONES = { 'Asia/Riyadh': 'SAR', 'Asia/Dubai': 'AED', 'Asia/Kuwait': 'KWD', 'Asia/Qatar': 'QAR', 'Asia/Bahrain': 'BHD',
    'Asia/Muscat': 'OMR', 'Africa/Cairo': 'EGP', 'Asia/Amman': 'JOD' };
  // كام وحدة مقابل الدولار: الخليجية مربوطة بالدولار، والدينار الكويتي والأردني والجنيه تقريبي
  var PER_USD = { USD: 1, SAR: 3.75, AED: 3.6725, QAR: 3.64, BHD: 0.376, OMR: 0.3845, KWD: 0.307, JOD: 0.709, EGP: 48.5 };
  // نفس أسماء العملات اللي الأداة بتكتبها (CURRENCY_LABELS في core.js)
  var LABEL_AR = { USD: '$', SAR: 'ر.س', AED: 'د.إ', QAR: 'ر.ق', BHD: 'د.ب', OMR: 'ر.ع', KWD: 'د.ك', JOD: 'د.أ', EGP: 'ج.م' };
  function currencyFor(zone) { return ZONES[zone] || 'USD'; }
  function visitorCurrency() {
    try { return currencyFor(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch (e) { return 'USD'; }
  }
  // تدوير مريح للعين: أقل من ١٠ بخانة عشرية، أقل من ١٠٠ رقم صحيح، والأكبر ٣ أرقام مهمة (٨٠٬٣٠٠ مش ٨٠٬٢٥٠)
  function nice(v) {
    if (v < 10) return Math.round(v * 10) / 10;
    if (v < 100) return Math.round(v);
    var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10) - 2);
    return Math.round(v / p) * p;
  }
  function num(v, ar) {
    var parts = (Math.round(v) === v ? String(v) : v.toFixed(1)).split('.');
    var s = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (parts[1] ? '.' + parts[1] : '');
    return ar ? s.replace(/,/g, '٬').replace('.', '٫').replace(/\d/g, function (d) { return AR[+d]; }) : s;
  }
  // نفس صيغة الأداة: «٤٥ ر.س» / «45 SAR»، والدولار بالإنجليزي «$12»
  function moneyText(v, cur, ar) {
    var n = num(v < 10 ? Math.round(v * 10) / 10 : Math.round(v), ar);
    if (ar) return n + ' ' + LABEL_AR[cur];
    return cur === 'USD' ? '$' + n : n + ' ' + cur;
  }
  function moneyFor(usd, cur, ar) { return moneyText(nice(usd * PER_USD[cur]), cur, ar); }
  window.AdsDemo = { currencyFor: currencyFor, moneyFor: moneyFor };

  var root = document.querySelector('[data-demo]');
  if (!root) return;
  var track = root.closest('[data-demo-track]');
  var wrap = root.closest('.demo-wrap');
  var scenes = root.querySelectorAll('[data-scene]');
  var steps = Array.prototype.slice.call(document.querySelectorAll('.demo-steps [data-step]'));
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cur = visitorCurrency();
  var current = -1, countRaf = null, countDone = null;

  function setCounts(progress) {
    var ar = isAr();
    Array.prototype.forEach.call(root.querySelectorAll('[data-count]'), function (el) {
      var target = Number(el.getAttribute('data-count'));
      if (el.hasAttribute('data-money')) el.textContent = moneyText(nice(target * PER_USD[cur]) * progress, cur, ar);
      else el.textContent = num(Math.round(target * progress), ar);
    });
  }
  function setAmounts() {
    Array.prototype.forEach.call(root.querySelectorAll('[data-amount]'), function (el) {
      // الجملة العربية والإنجليزية الاتنين في الصفحة (only-ar / only-en) — كل واحدة بلغتها
      var ar = el.closest('.only-en') ? false : el.closest('.only-ar') ? true : isAr();
      el.textContent = moneyFor(Number(el.getAttribute('data-amount')), cur, ar);
    });
  }
  function countUp() {
    if (countRaf) cancelAnimationFrame(countRaf);
    var start = null, DUR = 1100, DELAY = 250;
    function frame(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, Math.max(0, (ts - start - DELAY) / DUR));
      setCounts(1 - Math.pow(1 - p, 3)); // بيبطّأ في الآخر
      if (p < 1) countRaf = requestAnimationFrame(frame);
    }
    setCounts(0);
    countRaf = requestAnimationFrame(frame);
    // احتياطي: لو المتصفح وقّف رسم الإطارات، الأرقام متفضلش صفر
    clearTimeout(countDone);
    countDone = setTimeout(function () { cancelAnimationFrame(countRaf); setCounts(1); }, DELAY + DUR + 150);
  }

  function show(i) {
    if (i === current) return;
    current = i;
    Array.prototype.forEach.call(scenes, function (s, k) { s.classList.toggle('is-active', k === i); });
    steps.forEach(function (s, k) { s.classList.toggle('is-active', k === i); s.classList.toggle('is-done', k < i); });
    if (i === 1) { if (reduce) setCounts(1); else countUp(); }
  }

  // ---------- التمرير ----------
  // range = المسافة اللي العرض بيفضل ثابت فيها (ارتفاع المسار ناقص العرض نفسه). صفر = المتصفح مبيدعمش الـ sticky هنا
  function stickyTop() { return parseFloat(window.getComputedStyle(wrap).top) || 0; }
  function range() { return track ? track.offsetHeight - wrap.offsetHeight : 0; }
  function progress() {
    var r = range();
    if (r <= 1) return -1;
    return Math.min(1, Math.max(0, (stickyTop() - track.getBoundingClientRect().top) / r));
  }
  function update() {
    var p = progress();
    if (p < 0) return; // من غير sticky: المشهد بيتغيّر بالضغط على الخطوات بس
    var pos = p * scenes.length, i = Math.min(scenes.length - 1, Math.floor(pos));
    show(i);
    // شريط كل خطوة: المكتمل كامل، والحالي بقد ما الزائر نزل جوه مشهده
    steps.forEach(function (s, k) {
      var fill = s.querySelector('.demo-step-fill');
      if (fill) fill.style.transform = 'scaleX(' + (k < i ? 1 : k > i ? 0 : Math.min(1, pos - i)) + ')';
    });
  }
  // ارتفاع شريط الموقع اللي فوق (العرض بيثبت تحته) وارتفاع العرض نفسه (عشان يتوسّط الشاشة على الموبايل — site.css)
  function measureBar() {
    var bar = document.querySelector('.site-bar');
    if (bar) document.documentElement.style.setProperty('--site-bar-h', bar.offsetHeight + 'px');
    document.documentElement.style.setProperty('--demo-h', wrap.offsetHeight + 'px');
  }
  steps.forEach(function (s, k) {
    s.addEventListener('click', function () {
      var r = range();
      if (r <= 1) { show(k); return; }
      var top = Math.max(0, window.pageYOffset + track.getBoundingClientRect().top - stickyTop() + (k + 0.2) / scenes.length * r);
      // «تقليل الحركة»: قفزة مباشرة (auto كان هيمشي على scroll-behavior: smooth بتاع الصفحة)
      try { window.scrollTo({ top: top, behavior: reduce ? 'instant' : 'smooth' }); } catch (e) { window.scrollTo(0, top); }
    });
  });
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', function () { measureBar(); update(); });
  // تغيير اللغة: الأرقام والمبالغ تتكتب بالصيغة الجديدة على طول
  new MutationObserver(function () { setAmounts(); if (current === 1) setCounts(1); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  measureBar();
  setAmounts();
  setCounts(1);
  show(0);
  update();
})();
