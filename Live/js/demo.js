// =====================================================================
// Ads Center — العرض التوضيحي المتحرك في الصفحة الرئيسية (زي GIF بيتكرر)
// =====================================================================
// بيقلّب ٤ مشاهد ([data-scene]) في حلقة: ربط الحسابات ← اللوحة ← التنبيهات ← تفاصيل تنبيه.
// الأرقام في المشهد التاني بتعدّ لحد قيمتها (data-count، وdata-money = بالدولار) بصيغة اللغة الحالية.
//  - الضغط على العرض بيوقفه PAUSE_MS (وكل ضغطة بتبدأ العدّ من جديد)، والضغط المطوّل بيوقفه لحد ما يشيل صباعه
//  - «تقليل الحركة» في الجهاز: المشاهد بتتقلّب برضه بس من غير أي حركة (قطع مباشر، والأرقام بقيمتها على طول)
//    — كتير من موبايلات أندرويد بيبقى الإعداد ده شغال فيها، ولو وقّفنا العرض خالص الزائر بيفتكره عطلان
//  - بيقف لو المشهد مش ظاهر على الشاشة أو التاب مخفي — عشان ميستهلكش الجهاز
(function () {
  var root = document.querySelector('[data-demo]');
  if (!root) return;
  var scenes = root.querySelectorAll('[data-scene]');
  var stepsList = document.querySelector('.demo-steps');
  var steps = document.querySelectorAll('.demo-steps [data-step]');
  var DURATIONS = [2800, 3600, 3800, 4600];
  var PAUSE_MS = 2000;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var current = 0, timer = null, due = 0, left = DURATIONS[0], visible = true;
  var pressing = false, pauseTimer = null, countRaf = null, countDone = null;

  function isAr() { return document.documentElement.lang !== 'en'; }
  var AR = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  // نفس صيغة الأداة بالعربي (٤٬٨٢٠ $)، وبالإنجليزي الصيغة المعتادة ($4,820)
  function fmt(n, money) {
    var s = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (isAr()) {
      s = s.replace(/,/g, '٬').replace(/\d/g, function (d) { return AR[+d]; });
      return money ? s + ' $' : s;
    }
    return money ? '$' + s : s;
  }
  function setCounts(progress) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-count]'), function (el) {
      var target = Number(el.getAttribute('data-count'));
      el.textContent = fmt(target * progress, el.hasAttribute('data-money'));
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
    current = i;
    left = DURATIONS[i];
    Array.prototype.forEach.call(scenes, function (s, k) { s.classList.toggle('is-active', k === i); });
    Array.prototype.forEach.call(steps, function (s, k) {
      s.classList.toggle('is-done', k < i);
      s.classList.remove('is-active');
      if (k === i) {
        s.style.setProperty('--dur', DURATIONS[i] + 'ms');
        void s.offsetWidth; // يعيد تشغيل شريط التقدّم من الأول
        s.classList.add('is-active');
      }
    });
    if (i === 1) { if (reduce) setCounts(1); else countUp(); }
  }

  // العدّاد: run بيكمّل اللي فاضل من وقت المشهد، وhalt بيوقفه ويحفظ اللي فاضل
  function paused() { return pressing || pauseTimer !== null; }
  function run() {
    clearTimeout(timer); timer = null;
    if (!visible || document.hidden || paused()) return;
    due = Date.now() + left;
    timer = setTimeout(function () { show((current + 1) % scenes.length); run(); }, left);
  }
  function halt() {
    if (timer === null) return;
    left = Math.max(0, due - Date.now());
    clearTimeout(timer); timer = null;
  }
  // يبدأ المشهد الحالي من الأول كل ما العرض يرجع يظهر — عشان الزائر يشوف القصة كاملة
  function resume() { if (!visible || document.hidden) return; show(current); run(); }

  // الإيقاف المؤقت بالضغط (الموبايل والكمبيوتر)
  function setPausedLook(on) {
    root.classList.toggle('is-paused', on);
    if (stepsList) stepsList.classList.toggle('is-paused', on);
  }
  function press() {
    pressing = true;
    clearTimeout(pauseTimer); pauseTimer = null;
    halt();
    setPausedLook(true);
  }
  function release() {
    if (!pressing) return;
    pressing = false;
    pauseTimer = setTimeout(function () { pauseTimer = null; setPausedLook(false); run(); }, PAUSE_MS);
  }
  var opts = { passive: true };
  if (window.PointerEvent) {
    root.addEventListener('pointerdown', press, opts);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { root.addEventListener(ev, release, opts); });
  } else {
    ['touchstart', 'mousedown'].forEach(function (ev) { root.addEventListener(ev, press, opts); });
    ['touchend', 'touchcancel', 'mouseup', 'mouseleave'].forEach(function (ev) { root.addEventListener(ev, release, opts); });
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) resume(); else halt();
    }, { threshold: 0.25 }).observe(root);
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) halt(); else resume(); });
  // تغيير اللغة: الأرقام تتكتب بالصيغة الجديدة على طول
  new MutationObserver(function () { if (current === 1) setCounts(1); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  setCounts(1);
  show(0);
  run();
})();
