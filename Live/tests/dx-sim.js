// =====================================================================
// Ads Center — محاكي حسابات لاختبار تشخيص المتجر (js/diagnosis.js)
// =====================================================================
// بيولّد حساب متجر إلكتروني يوم بيوم بأرقام عشوائية واقعية (ظهور ← نقرات ← سلة ← دفع ← شراء)،
// مقسّم على حملات ودول، وممكن نزرع فيه «مشكلة» معروفة (مرحلة معينة في حملة/دولة معينة تضعف من يوم معيّن).
// الاستخدام: نتأكد إن المحرك
//   ١) مبيطلعش مشاكل من حساب مفيهوش مشاكل (نسبة الإنذار الكاذب)
//   ٢) بيلاقي المشكلة المزروعة، وفي المرحلة والمكان الصح
// كل حاجة بـ seed ثابت — نفس النتيجة كل مرة.
(function (global) {
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normal(r) { var u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  // بواسون: مباشر للأعداد الصغيرة، وتقريب طبيعي للكبيرة (الظهور بالآلاف)
  function poisson(lambda, r) {
    if (!(lambda > 0)) return 0;
    if (lambda > 60) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal(r)));
    var L = Math.exp(-lambda), k = 0, p = 1;
    do { k++; p *= r(); } while (p > L);
    return k - 1;
  }
  // ذي الحدين (مين من الزوار أضاف للسلة...): كل مرحلة «بتختار» من اللي قبلها — مش بواسون جديد فوق بواسون،
  // اللي كان بيضخّم العشوائية ويخلّي المحاكاة أصعب من الواقع
  function binomial(n, p, r) {
    if (!(n > 0) || !(p > 0)) return 0;
    if (p >= 1) return n;
    if (n * p * (1 - p) > 30) return Math.min(n, Math.max(0, Math.round(n * p + Math.sqrt(n * p * (1 - p)) * normal(r))));
    var k = 0;
    for (var i = 0; i < n; i++) if (r() < p) k++;
    return k;
  }
  // تذبذب يومي حقيقي فوق العشوائية (الطلب بيختلف من يوم ليوم): معامل حول ١ بانحراف cv
  function jitter(r, cv) { return Math.exp(cv * normal(r) - cv * cv / 2); }
  function addKey(date, n) { var p = date.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10); }

  // opts: { seed, until, days, spend (يومي), campaigns: [{ key, name, country, share, mult: { ctr, cart, checkout, pay } }],
  //         base: { cpm, ctr, cart, checkout, pay, aov }, dayCv, spendCv, changes: [{ from (تاريخ), campaign أو country أو '*', stage, factor, spendFactor }] }
  function simulate(opts) {
    var r = rng(opts.seed || 1);
    var base = Object.assign({ cpm: 30, ctr: 0.01, cart: 0.25, checkout: 0.6, pay: 0.45, aov: 350 }, opts.base || {});
    var camps = opts.campaigns || [
      { key: 'c1', name: 'Scale A', country: 'SA', share: 0.4, mult: {} },
      { key: 'c2', name: 'Scale B', country: 'SA', share: 0.3, mult: {} },
      { key: 'c3', name: 'Test C', country: 'SA', share: 0.2, mult: {} },
      { key: 'c4', name: 'KW D', country: 'KW', share: 0.1, mult: {} }
    ];
    var days = opts.days || 63, until = opts.until || '2026-09-27', start = addKey(until, -(days - 1));
    var dayCv = opts.dayCv == null ? 0.15 : opts.dayCv, spendCv = opts.spendCv == null ? 0.2 : opts.spendCv;
    var changes = opts.changes || [];
    var rows = [];   // صف لكل يوم × حملة
    for (var i = 0; i < days; i++) {
      var date = addKey(start, i), dayMult = jitter(r, dayCv), spendDay = (opts.spend || 400) * jitter(r, spendCv);
      camps.forEach(function (c) {
        var m = { ctr: 1, cart: 1, checkout: 1, pay: 1, cpm: 1, spend: 1 };
        Object.keys(c.mult || {}).forEach(function (k) { m[k] = c.mult[k]; });
        changes.forEach(function (ch) {
          if (date < ch.from || (ch.to && date > ch.to)) return;
          var hit = ch.campaign ? ch.campaign === c.key : (ch.country ? ch.country === c.country : true);
          if (!hit) return;
          if (ch.stage) m[ch.stage] *= ch.factor;
          if (ch.spendFactor) m.spend *= ch.spendFactor;
        });
        var spend = Math.round(spendDay * c.share * m.spend * 100) / 100;
        var imp = poisson(spend / (base.cpm * m.cpm) * 1000, r);
        var clicks = binomial(imp, base.ctr * m.ctr, r);
        var atc = binomial(clicks, Math.min(1, base.cart * m.cart * dayMult), r);
        var ic = binomial(atc, Math.min(1, base.checkout * m.checkout), r);
        var pur = binomial(ic, Math.min(1, base.pay * m.pay), r);
        var rev = 0;
        for (var j = 0; j < pur; j++) rev += base.aov * jitter(r, 0.5);
        rows.push({ date: date, camp: c, spend: spend, imp: imp, clicks: clicks, atc: atc, ic: ic, pur: pur, rev: Math.round(rev * 100) / 100 });
      });
    }
    var F = ['spend', 'imp', 'clicks', 'atc', 'ic', 'pur', 'rev'];
    var sum = function (list) { var o = {}; F.forEach(function (f) { o[f] = 0; }); list.forEach(function (x) { F.forEach(function (f) { o[f] += x[f]; }); }); return o; };
    var byDate = {};
    rows.forEach(function (x) { (byDate[x.date] = byDate[x.date] || []).push(x); });
    var daily = Object.keys(byDate).sort().map(function (d) { var o = sum(byDate[d]); o.date = d; return o; });
    var since = opts.since || addKey(until, -6);
    var ws = DX.windows(since, until).slice(0, 3);
    var inW = function (x, w) { return x.date >= w.since && x.date <= w.until; };
    var dimOf = function (keyFn, nameFn) {
      var segs = {};
      rows.forEach(function (x) {
        var k = keyFn(x);
        var s = segs[k] = segs[k] || { key: k, name: nameFn ? nameFn(x) : null, rows: [] };
        s.rows.push(x);
      });
      return Object.keys(segs).map(function (k) {
        var s = segs[k];
        return { key: s.key, name: s.name, w: ws.map(function (w) { var list = s.rows.filter(function (x) { return inW(x, w); }); return list.length ? sum(list) : null; }) };
      });
    };
    return {
      since: since, until: until, currency: 'SAR', timezone: 'Asia/Riyadh', daily: daily,
      dims: [
        { id: 'campaign', segs: dimOf(function (x) { return x.camp.key; }, function (x) { return x.camp.name; }) },
        { id: 'country', segs: dimOf(function (x) { return x.camp.country; }) }
      ]
    };
  }
  global.DX_SIM = { simulate: simulate, rng: rng, poisson: poisson, binomial: binomial };
})(window);
