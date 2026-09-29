// =====================================================================
// Ads Center — تشخيص المتجر: إيه اللي اتغيّر في نتايج الإعلانات، وفين، وليه على الأرجح
// =====================================================================
// الملف ده حسابات بحتة (من غير أي طلب للمنصات): بياخد أرقام الحساب يوم بيوم + تقسيماته
// (الحملات، الدول، الأعمار، المواضع...) ويطلّع تقرير منظّم (DX.analyze). النصوص كلها في i18n.js
// (مفاتيح dx.*) وبتتركّب في DX.compose — عشان المنطق يتختبر لوحده من غير ما يتأثر بالصياغة.
//
// دي أكتر حتة حساسة في الأداة: تشخيص غلط واحد بيخلّي العميل يشك في كل حاجة. القواعد اللي أي تعديل لازم يحافظ عليها:
//  ١) الأرقام حقائق وبتظهر دايماً. «التفسير» (ليه) مش بيظهر إلا لو التغيّر أكبر من عشوائية العدّ.
//  ٢) «غير معتاد» = أكبر من تذبذب الحساب نفسه في الفترات اللي فاتت، مش أكبر من الفترة اللي قبلها وبس.
//     (حساب حقيقي: تكلفة الطلب الأسبوعية فيه اتنقلت بين ٢٨ و١٥٥ ريال في ٤ شهور — أغلبها تذبذب عادي)
//  ٣) السبب الحقيقي اللي برّه البيانات (عرض، منافس، مخزون...) مش بنقوله أبداً كحقيقة: بنحدد مكان الخلل
//     بالأرقام، ونعرض الأسباب المعتادة للنوع ده من جدول ثابت (PLAYBOOK)، ونقول «تحقّق أولاً من...».
//  ٤) التقسيمات فيها عشرات المقارنات في كل تقرير — فعتبتها أعلى بكتير من عتبة الحساب كله،
//     عشان «الاكتشاف» ميطلعش صدفة. المحاكاة في الاختبارات بتقيس نسبة الإنذار الكاذب فعلاً.
//  ٥) أي تقسيم أرقامه مش مطابقة لإجمالي الحساب بيتشال من التحليل
//     (Meta مثلاً مبترجّعش المشتريات حسب المنطقة ولا حسب المنتج — اتقاس على حساب حقيقي).
//
// الملفات بتتحمّل بالترتيب: i18n → alerts → core → diagnosis → meta → ... (بيستخدم shiftKey و keyDiffDays من core)

var DX = (function () {
  // ---------- العتبات — أي تغيير فيها لازم يعدّي اختبار المحاكاة (نسبة الإنذار الكاذب) ----------
  var PHI_SAMPLING = 1.5;    // أقل «تشتت» بنفترضه: الأرقام الحقيقية بتتذبذب أكتر من العدّ العشوائي البحت
  var PHI_DEFAULT_HIST = 3;  // تذبذب الحساب لو تاريخه أقصر من إنه يتقاس (تقدير متحفّظ)
  var PHI_MAX = 12;
  var Z_REAL = 2.5;          // الحساب كله: التغيّر حقيقي (احتمال الصدفة ≈ ١٪ أو أقل)
  var Z_WHERE = 2;           // بعد ما اتأكدنا إن فيه تغيّر: المرحلة اللي بتفسّره لازم تغيّرها يبقى حقيقي هي كمان
  var Z_UNUSUAL = 2;         // أكبر من تذبذب الحساب المعتاد
  var Z_SEG = 3.5;           // التقسيمات (مقارنات كتير في نفس التقرير) — احتمال الصدفة ≈ ٠٫٠٢٪
  var Z_SEG_STRONG = 4.5;
  var MIN_PCT = 0.10;        // أقل من ١٠٪ مش بنسميه تغيّر حتى لو حقيقي
  var MIN_ORDERS = 12;       // أقل من كده في الفترتين مع بعض = مفيش حكم
  var SPEND_MOVE = 0.15;     // تغيّر الإنفاق اللي بنعتبره «قرار ميزانية»
  var SHARE_DRIVER = 0.3;    // مرحلة بتفسّر ٣٠٪ على الأقل من التغيّر عشان تتذكر كسبب
  var ZERO_RUN_P = 0.001;    // يوم (أو أيام) من غير مبيعات: احتمال الصدفة لازم يبقى أقل من كده

  // ---------- إحصاء ----------
  function sign(x) { return x > 0 ? 1 : (x < 0 ? -1 : 0); }
  function median(arr) {
    var a = arr.slice().sort(function (x, y) { return x - y; }), n = a.length;
    if (!n) return null;
    return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
  }
  // log-gamma (Lanczos) — للدالة البيتا
  function gammaln(x) {
    var c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    var y = x, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    var ser = 1.000000000190015;
    for (var j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
  function betacf(a, b, x) {
    var FPMIN = 1e-300, qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    var h = d;
    for (var m = 1; m <= 300; m++) {
      var m2 = 2 * m, aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      var del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 3e-14) break;
    }
    return h;
  }
  // الدالة البيتا غير الكاملة المنتظمة I_x(a, b) — منها بنحسب ذيل توزيع ذي الحدين (حتى مع أعداد مش صحيحة)
  function betai(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  // مقلوب التوزيع الطبيعي (Acklam) — بيحوّل الاحتمال لـ z عشان كل العتبات تبقى بنفس المقياس
  function normInv(p) {
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    var b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    var c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    var d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    var q, r;
    if (p < 0.02425) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > 1 - 0.02425) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  // احتمال (من ذيل واحد) → z. أي حاجة أقوى من ٨ بتتقفل عند ٨ (كلها «مؤكد» بنفس الدرجة)
  function zFromP(p) {
    if (!(p > 1e-15)) return 8;
    if (p >= 0.5) return 0;
    var z = -normInv(p);
    return z > 8 ? 8 : z;
  }

  // مقارنة معدّلين: k1 من e1 (قبل) و k2 من e2 (بعد) — طلبات لكل ريال، إضافات للسلة لكل نقرة...
  // الاختبار «الشرطي»: لو المعدّل ما اتغيّرش، k2 من إجمالي (k1+k2) بيتوزع ذي الحدين بنسبة e2/(e1+e2).
  // ده دقيق حتى مع أعداد صغيرة جداً (طلب واحد مقابل ٢٥ متوقع) — عكس التقريب الطبيعي اللي بيضعف هناك.
  // phi = التشتت: بنقسم الأعداد عليه (كأن العيّنة أصغر) — كل ما يكبر الاختبار يبقى أحوط.
  // الناتج: ratio = المعدّل الجديد ÷ القديم، و z بإشارة (موجب = المعدّل زاد)
  function rateTest(k1, e1, k2, e2, phi) {
    phi = Math.max(1, phi || 1);
    k1 = k1 > 0 ? k1 : 0; k2 = k2 > 0 ? k2 : 0;
    if (!(e1 > 0) || !(e2 > 0)) return { ratio: null, z: 0 };
    var ratio = k1 > 0 ? (k2 / e2) / (k1 / e1) : null;
    var K = k1 + k2;
    if (K <= 0) return { ratio: ratio, z: 0 };
    var pi0 = e2 / (e1 + e2), Ks = K / phi, ks = k2 / phi, up = k2 / K >= pi0, p;
    if (up) p = ks <= 0 ? 1 : betai(ks, Ks - ks + 1, pi0);                // P(X ≥ k2)
    else p = (Ks - ks) <= 1e-9 ? 1 : betai(Ks - ks, ks + 1, 1 - pi0);     // P(X ≤ k2)
    return { ratio: ratio, z: (up ? 1 : -1) * zFromP(p) };
  }
  // تذبذب الحساب نفسه: كل فترة في التاريخ بتتقارن بالفترة اللي قبلها (من غير الفترة الحالية).
  // لو المعدّل بيتنقل بين الفترات أكتر من المتوقع من العدّ العشوائي، phi بيكبر.
  // الوسيط مش المتوسط: فترة واحدة شاذة في التاريخ متخليش الحساب كله «متذبذب».
  // وسيط z² لتوزيع كاي-تربيع بدرجة حرية واحدة = ٠٫٤٥٥ — فلو الحساب هادي تماماً phi بيطلع ≈ ١
  function historyPhi(chrono, kKey, eKey) {
    var z2 = [];
    for (var i = 1; i < chrono.length; i++) {
      var a = chrono[i - 1], b = chrono[i];
      if (!(a[eKey] > 0) || !(b[eKey] > 0) || (a[kKey] + b[kKey]) < 10) continue;
      var r = rateTest(a[kKey], a[eKey], b[kKey], b[eKey], 1);
      z2.push(r.z * r.z);
    }
    if (z2.length < 4) return null;
    return Math.min(PHI_MAX, Math.max(1, median(z2) / 0.455));
  }

  // ---------- الفترات ----------
  // الفترة الحالية والفترات اللي قبلها بنفس الطول. أقل من أسبوع: بنقارن بنفس أيام الأسبوع اللي قبله
  // (أمس الجمعة بالجمعة اللي قبلها) — لأن يوم الأسبوع نفسه بيفرق في المبيعات.
  // عدد الفترات: كفاية لقياس تذبذب الحساب (٤ مقارنات على الأقل للفترات القصيرة) من غير ما نسحب سنين
  function windowCount(len) {
    var step = len < 7 ? 7 : len;
    return Math.max(5, Math.min(9, Math.floor(210 / step) + 1));
  }
  function windowsFor(since, until) {
    var len = keyDiffDays(since, until) + 1, step = len < 7 ? 7 : len, n = windowCount(len), out = [];
    for (var i = 0; i < n; i++) out.push({ since: shiftKey(since, -step * i), until: shiftKey(until, -step * i), days: len });
    return out;
  }

  // ---------- الأرقام ----------
  var FIELDS = ['spend', 'imp', 'clicks', 'atc', 'ic', 'pur', 'rev'];
  function bundle(src) {
    var b = {};
    FIELDS.forEach(function (f) { var v = src ? Number(src[f]) : 0; b[f] = isFinite(v) && v > 0 ? v : 0; });
    return b;
  }
  function addTo(t, r) { FIELDS.forEach(function (f) { t[f] += (r && r[f]) || 0; }); return t; }
  function minus(a, b) { var o = bundle(); FIELDS.forEach(function (f) { o[f] = Math.max(0, (a[f] || 0) - (b[f] || 0)); }); return o; }
  function sumDays(daily, w) {
    var t = bundle();
    daily.forEach(function (d) { if (d.date >= w.since && d.date <= w.until) addTo(t, d); });
    t.since = w.since; t.until = w.until; t.len = w.days;
    return t;
  }
  function cpaOf(b) { return b && b.pur > 0 ? b.spend / b.pur : null; }

  // أنهي مراحل الرحلة متسجلة فعلاً في الحساب (على كل التاريخ اللي اتسحب):
  // «إضافة للسلة» طبيعي تبقى أكتر من الشراء — لو أقل، الحدث غالباً مش متركّب صح فبنتجاهله
  function trackingOf(total) {
    return {
      pur: total.pur >= 5,
      atc: total.atc >= Math.max(5, total.pur),
      ic: total.ic >= Math.max(5, 0.8 * total.pur),
      imp: total.imp > 0,
      clicks: total.clicks > 0
    };
  }
  // تكلفة الطلب = الإنفاق ÷ الطلبات = حاصل ضرب مقلوبات معدّلات المراحل:
  //   (الإنفاق/الظهور) × (الظهور/النقرات) × (النقرات/السلة) × (السلة/الدفع) × (الدفع/الشراء)
  // فأي تغيّر في تكلفة الطلب بيتوزع *بالظبط* على المراحل (بالـ log) — مفيش جزء «مش متفسّر» في الحسبة.
  // مرحلة مش متسجلة بتتدمج في اللي بعدها (مثلاً «الشراء من الزوار» بدل «الشراء بعد بدء الدفع»)
  function stagesFor(tr) {
    var s = [];
    if (tr.imp && tr.clicks) {
      s.push({ id: 'reach', k: 'imp', e: 'spend', group: 'before' });
      s.push({ id: 'ctr', k: 'clicks', e: 'imp', group: 'before' });
    } else if (tr.clicks) s.push({ id: 'cpc', k: 'clicks', e: 'spend', group: 'before' });
    var prev = tr.clicks ? 'clicks' : 'spend';
    if (tr.atc) { s.push({ id: 'cart', k: 'atc', e: prev, group: 'after' }); prev = 'atc'; }
    if (tr.ic) { s.push({ id: 'checkout', k: 'ic', e: prev, group: 'after' }); prev = 'ic'; }
    s.push({ id: 'pay', k: 'pur', e: prev, base: prev, group: prev === 'spend' ? 'before' : 'after' });
    return s;
  }
  function stageGroupOf(id) { return (id === 'reach' || id === 'ctr' || id === 'cpc') ? 'before' : 'after'; }
  // معدّل المجموعة كلها: قبل النقرة = نقرات لكل ريال، بعدها = طلبات لكل نقرة
  function groupRateKeys(g, tr) { return g === 'before' ? { k: 'clicks', e: 'spend' } : { k: 'pur', e: tr.clicks ? 'clicks' : 'spend' }; }

  // تذبذب الحساب من يوم ليوم (من غير الفترة الحالية): بنقسّم الأيام اللي فاتت لأسابيع، وجوه كل أسبوع
  // بنقيس بُعد كل يوم عن المتوقع بمعدّل الأسبوع نفسه. ده بيفصل «الطلب بيختلف من يوم ليوم» (عادي)
  // عن «المعدّل نفسه اتغيّر بين أسبوع وأسبوع» (اللي بنحاول نكشفه). محاكاة حسابات ثابتة أثبتت إنه لازم:
  // من غيره كان المحرك بيفسّر تذبذب عادي في الحسابات الكبيرة على إنه تغيّر في ٩٪ من المرات
  function dailyPhi(daily, before, kKey, eKey) {
    var days = daily.filter(function (d) { return d.date < before && d[eKey] > 0; }).sort(function (x, y) { return x.date < y.date ? -1 : 1; });
    var wd = function (d) { var p = d.date.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); };
    // فرق أيام الأسبوع الثابت (الجمعة أعلى كل أسبوع مثلاً) بيتلغي لما نقارن أسبوع بأسبوع، فمش المفروض يتحسب
    // «تذبذب». معامل لكل يوم من التاريخ كله، مقرّب لـ ١ (كأنه ٢٠ طلب إضافي بمعدل الحساب) عشان ميتبعش الصدفة
    var TK = 0, TE = 0, fk = [0, 0, 0, 0, 0, 0, 0], fe = [0, 0, 0, 0, 0, 0, 0];
    days.forEach(function (d) { TK += d[kKey]; TE += d[eKey]; fk[wd(d)] += d[kKey]; fe[wd(d)] += d[eKey]; });
    var r0 = TE > 0 ? TK / TE : 0;
    var f = fk.map(function (k, i) { return r0 > 0 ? (k + 20) / (r0 * fe[i] + 20) : 1; });
    var num = 0, df = 0;
    for (var i = days.length; i - 7 >= 0; i -= 7) {
      var block = days.slice(i - 7, i), K = 0, Wt = 0;
      block.forEach(function (d) { K += d[kKey]; Wt += d[eKey] * f[wd(d)]; });
      if (K < 5) continue;
      block.forEach(function (d) { var ex = K * d[eKey] * f[wd(d)] / Wt; if (ex > 0) num += (d[kKey] - ex) * (d[kKey] - ex) / ex; });
      df += block.length - 1;
    }
    if (df < 12) return null;
    return Math.min(8, Math.max(1, num / df));
  }

  // تغيّر الطلبات جه معظمه (نصه على الأقل) من تغيّر الإنفاق؟ ln(الطلبات) = ln(الإنفاق) − ln(تكلفة الطلب)
  function spendExplains(a, b) {
    if (!(a.pur > 0 && b.pur > 0 && a.spend > 0 && b.spend > 0) || a.pur === b.pur) return false;
    return Math.log(b.spend / a.spend) / Math.log(b.pur / a.pur) >= 0.5;
  }

  // ---------- العنوان: إيه اللي حصل للطلبات وتكلفتها ----------
  // phiD = تذبذب الحساب اليومي (الاختبار الأساسي «التغيّر حقيقي؟»)، phiH = تذبذبه بين الفترات («غير معتاد؟»)
  function headline(a, b, len, phiD, phiH, W) {
    var orders = rateTest(a.pur, len, b.pur, len, phiD);
    var eff = rateTest(a.pur, a.spend, b.pur, b.spend, phiD);   // موجب = طلبات أكتر لكل ريال
    // الفترة السابقة لوحدها فيها عشوائية زي الحالية بالظبط، فالمقارنة بيها ضعيفة في الحسابات الصغيرة.
    // متوسط آخر ٤ فترات أثبت بكتير: لو التغيّر حقيقي مقارنةً بيه وفي نفس اتجاه الفرق عن الفترة السابقة،
    // بنعتبره حقيقي (والكلام نفسه بيفضل مقارنةً بالفترة السابقة — الأرقام اللي العميل شايفها)
    var base = bundle(), baseDays = 0;
    W.slice(1, 5).forEach(function (w) { addTo(base, w); baseDays += w.len; });
    var effBase = rateTest(base.pur, base.spend, b.pur, b.spend, phiD);
    var ordBase = rateTest(base.pur, baseDays, b.pur, len, phiD);
    if (Math.abs(effBase.z) >= Z_REAL && sign(effBase.z) === sign(eff.z) && Math.abs(effBase.z) > Math.abs(eff.z)) eff = { ratio: eff.ratio, z: sign(eff.z) * Z_REAL, viaBase: true };
    if (Math.abs(ordBase.z) >= Z_REAL && sign(ordBase.z) === sign(orders.z) && Math.abs(ordBase.z) > Math.abs(orders.z)) orders = { ratio: orders.ratio, z: sign(orders.z) * Z_REAL, viaBase: true };
    var spendPct = a.spend > 0 ? b.spend / a.spend - 1 : null;
    var ordPct = a.pur > 0 ? b.pur / a.pur - 1 : null;
    var cpaA = cpaOf(a), cpaB = cpaOf(b);
    var cpaPct = (cpaA && cpaB) ? cpaB / cpaA - 1 : null;
    var dOrd = (Math.abs(orders.z) >= Z_REAL && ordPct != null && Math.abs(ordPct) >= MIN_PCT) ? sign(orders.z) : 0;
    var dEff = (Math.abs(eff.z) >= Z_REAL && cpaPct != null && Math.abs(cpaPct) >= MIN_PCT) ? sign(eff.z) : 0;
    var dSpend = spendPct != null && Math.abs(spendPct) >= SPEND_MOVE ? sign(spendPct) : 0;
    // «ثابتة» = الفرق نفسه صغير، مش «مش متأكدين». تكلفة اتغيّرت ٥٠٪ بس في حدود التذبذب مش «ثابتة» —
    // دي «غير مؤكدة»، والكلام عنها بيقول الرقم وإنه في حدود التذبذب، من غير ما يدّعي سبب
    var flatEff = cpaPct != null && Math.abs(cpaPct) < MIN_PCT;
    var effUncertain = dEff === 0 && cpaPct != null && !flatEff;
    var type;
    if (dEff > 0) type = dOrd > 0 ? 'betterMore' : (dOrd < 0 ? 'lessButEfficient' : (dSpend < 0 ? 'sameForLess' : 'better'));
    else if (dEff < 0) type = dOrd > 0 ? 'moreCostly' : ((dOrd === 0 && dSpend > 0) ? 'spendUpFlat' : 'worse');
    // الإنفاق اتغيّر وتكلفة الطلب ثابتة فعلاً: الطلبات اتحركت معاه بالتناسب — دي حقيقة حسابية مش محتاجة
    // اختبار عدد الطلبات (من غيرها ميزانية اتقصّت للنص كانت بتطلع «مستقر»)
    else if (dSpend !== 0 && ordPct != null && Math.abs(ordPct) >= MIN_PCT && sign(ordPct) === dSpend && spendExplains(a, b)) type = dSpend > 0 ? 'scaled' : 'budgetDown';
    else if (dOrd > 0) type = 'moreOrders';
    else if (dOrd < 0) type = 'fewer';
    // «مستقر» بس لو الفروق نفسها صغيرة؛ فروق كبيرة في حدود التذبذب ليها عنوان صادق تاني
    else type = (Math.abs(ordPct || 0) < 0.2 && Math.abs(cpaPct || 0) < 0.2) ? 'stable' : 'withinNoise';
    var tone = { betterMore: 'good', sameForLess: 'good', better: 'good', scaled: 'good', moreOrders: 'good', worse: 'bad', stable: 'neutral', withinNoise: 'neutral' }[type] || 'mixed';

    // مقارنة بتذبذب الحساب نفسه — بتحدد نبرة الكلام: «غير معتاد» ولا «في حدود تذبذبك»
    var effHist = rateTest(a.pur, a.spend, b.pur, b.spend, phiH);
    // ترتيب تكلفة الطلب الحالية بين كل الفترات اللي فيها طلبات كفاية
    var ranked = W.filter(function (w) { return w.pur >= 3; });
    var rank = null;
    if (ranked.length >= 5 && cpaB) {
      var better = ranked.filter(function (w) { return cpaOf(w) < cpaB; }).length;
      var worse = ranked.filter(function (w) { return cpaOf(w) > cpaB; }).length;
      if (better === 0) rank = { kind: 'best', n: ranked.length };
      else if (worse === 0) rank = { kind: 'worst', n: ranked.length };
    }
    // التكلفة الحدّية: لو الإنفاق زاد والطلبات زادت أقل منه — كل طلب «إضافي» كلّف كام
    var marginal = null;
    if (dSpend > 0 && b.pur > a.pur && cpaA && dEff < 0) {
      var m = (b.spend - a.spend) / (b.pur - a.pur);
      if (m >= 1.5 * cpaA) marginal = { cpa: m, avg: cpaA };
    }
    // متوسط قيمة الطلب: مفيش قيمة كل طلب لوحده، فبنفترض تفاوت معتاد بين الطلبات (معامل اختلاف ٠٫٨)
    var aov = null;
    if (a.pur >= 10 && b.pur >= 10 && a.rev > 0 && b.rev > 0) {
      var aovA = a.rev / a.pur, aovB = b.rev / b.pur, lnR = Math.log(aovB / aovA);
      var z = lnR / Math.sqrt(PHI_SAMPLING * 0.64 * (1 / a.pur + 1 / b.pur));
      aov = { from: aovA, to: aovB, pct: aovB / aovA - 1, z: z, real: Math.abs(z) >= Z_WHERE && Math.abs(aovB / aovA - 1) >= MIN_PCT };
    }
    // تقسيم تغيّر الطلبات بين «الإنفاق اتغيّر» و«تكلفة الطلب اتغيّرت»: ln(الطلبات) = ln(الإنفاق) − ln(تكلفة الطلب)
    var split = null;
    if (a.pur > 0 && b.pur > 0 && a.spend > 0 && b.spend > 0 && b.pur !== a.pur && (dOrd !== 0 || type === 'scaled' || type === 'budgetDown')) {
      var lo = Math.log(b.pur / a.pur), ls = Math.log(b.spend / a.spend), le = -Math.log(cpaB / cpaA);
      split = { spend: ls / lo, eff: le / lo };
    }
    return {
      type: type, tone: tone, dOrd: dOrd, dEff: dEff, dSpend: dSpend, flatEff: flatEff, effUncertain: effUncertain, phiDaily: phiD,
      ordersZ: orders.z, effZ: eff.z, spendPct: spendPct, ordPct: ordPct, cpaPct: cpaPct,
      unusual: Math.abs(effHist.z) >= Z_UNUSUAL, histZ: effHist.z, phiHist: phiH,
      rank: rank, marginal: marginal, aov: aov, split: split
    };
  }

  // ---------- لماذا: توزيع تغيّر تكلفة الطلب على مراحل الرحلة ----------
  function decompose(stages, a, b) {
    var parts = [], total = 0;
    for (var i = 0; i < stages.length; i++) {
      var s = stages[i];
      if (!(a[s.k] > 0 && a[s.e] > 0 && b[s.k] > 0 && b[s.e] > 0)) return null;
      var ra = a[s.k] / a[s.e], rb = b[s.k] / b[s.e], c = -Math.log(rb / ra);
      parts.push({ id: s.id, base: s.base || s.e, group: s.group, from: ra, to: rb, pct: rb / ra - 1, contrib: c,
        z: rateTest(a[s.k], a[s.e], b[s.k], b[s.e], PHI_SAMPLING).z });
      total += c;
    }
    return { parts: parts, total: total };
  }
  function explainEfficiency(stages, tr, a, b) {
    var d = decompose(stages, a, b);
    if (!d || Math.abs(d.total) < 1e-9) return null;
    var sgn = sign(d.total);   // موجب = تكلفة الطلب زادت (أسوأ)
    var groups = ['before', 'after'].map(function (g) {
      var parts = d.parts.filter(function (p) { return p.group === g; });
      if (!parts.length) return null;
      var keys = groupRateKeys(g, tr);
      var contrib = parts.reduce(function (s, p) { return s + p.contrib; }, 0);
      return { id: g, contrib: contrib, share: contrib / d.total, parts: parts,
        from: a[keys.k] / a[keys.e], to: b[keys.k] / b[keys.e],
        z: rateTest(a[keys.k], a[keys.e], b[keys.k], b[keys.e], PHI_SAMPLING).z };
    }).filter(Boolean);
    // المجموعة «بتفسّر» التغيّر لو: نفس اتجاهه، ٣٠٪ منه على الأقل، وتغيّرها نفسه حقيقي
    var pickStages = function (g, dir) {
      return g.parts.filter(function (p) {
        return sign(p.contrib) === dir && Math.abs(p.contrib) >= 0.4 * Math.abs(g.contrib) && Math.abs(p.z) >= Z_WHERE;
      }).sort(function (x, y) { return Math.abs(y.contrib) - Math.abs(x.contrib); }).slice(0, 2);
    };
    var drivers = groups.filter(function (g) { return sign(g.contrib) === sgn && Math.abs(g.share) >= SHARE_DRIVER && Math.abs(g.z) >= Z_WHERE; });
    drivers.forEach(function (g) { g.stages = pickStages(g, sgn); });
    // عامل «عكسي» ظاهر: اتحرك عكس النتيجة وقلّل أثرها (مثلاً: الوصول غلي، بس الزوار اشتروا أكتر)
    var counters = groups.filter(function (g) { return sign(g.contrib) === -sgn && Math.abs(g.contrib) >= 0.2 * Math.abs(d.total) && Math.abs(g.z) >= Z_WHERE; });
    counters.forEach(function (g) { g.stages = pickStages(g, -sgn); });
    return {
      dir: sgn > 0 ? 'worse' : 'better', pct: Math.exp(d.total) - 1, parts: d.parts, groups: groups,
      drivers: drivers, counters: counters,
      kind: drivers.length === 1 ? drivers[0].id : (drivers.length === 2 ? 'both' : 'spread')
    };
  }

  // ---------- التقسيمات: هل التغيّر عام ولا محصور؟ ----------
  // نوع كل تقسيم بيحدد مين المسؤول والأسباب المعتادة (جدول PLAYBOOK)
  var DIM_KIND = { campaign: 'ads', adset: 'ads', ad: 'ads', placement: 'ads', publisher: 'ads',
    country: 'market', region: 'market', age: 'audience', gender: 'audience', device: 'device', impDevice: 'device' };
  // لو أكتر من تقسيم بيقول نفس الحاجة (دولة الكويت = حملات الكويت) بنفضّل الأوضح لصاحب المتجر
  var DIM_ORDER = ['country', 'campaign', 'placement', 'publisher', 'impDevice', 'device', 'age', 'gender', 'region', 'adset', 'ad'];
  var SKIP_KEYS = { unknown: 1, '': 1 };

  // التقسيم ينفع للحقل ده؟ مجموع التقسيمات لازم يطابق إجمالي الحساب (±١٠٪) في كل فترة فيها أرقام كفاية
  function dimCovers(dim, W, field) {
    var n = Math.min(dim.segs.length ? dim.segs[0].w.length : 0, W.length), any = false;
    for (var i = 0; i < n; i++) {
      var tot = W[i][field];
      if (!(tot >= 5)) continue;
      any = true;
      var s = 0;
      dim.segs.forEach(function (sg) { s += (sg.w[i] && sg.w[i][field]) || 0; });
      if (s < 0.9 * tot || s > 1.1 * tot) return false;
    }
    return any;
  }
  // تقسيم فيه جزء واحد بياخد ٩٥٪ من الإنفاق (كل الإعلانات على iPhone مثلاً) مفيهوش حاجة تتقارن
  function dimInformative(dim) {
    var tot = 0, top = 0;
    dim.segs.forEach(function (sg) {
      var s = ((sg.w[0] && sg.w[0].spend) || 0) + ((sg.w[1] && sg.w[1].spend) || 0);
      tot += s; if (s > top) top = s;
    });
    return tot > 0 && top / tot < 0.95 && dim.segs.length >= 2;
  }
  function prepareDims(dims, W) {
    return (dims || []).filter(function (d) { return d && d.segs && d.segs.length; }).map(function (d) {
      var segs = d.segs.filter(function (s) { return !SKIP_KEYS[String(s.key).toLowerCase()]; })
        .map(function (s) { return { key: s.key, name: s.name, w: (s.w || []).map(bundle) }; });
      var dim = { id: d.id, kind: DIM_KIND[d.id] || 'ads', segs: segs };
      dim.cover = { pur: dimCovers(d, W, 'pur'), atc: dimCovers(d, W, 'atc'), ic: dimCovers(d, W, 'ic'), clicks: dimCovers(d, W, 'clicks'), imp: dimCovers(d, W, 'imp'), spend: dimCovers(d, W, 'spend') };
      dim.informative = dimInformative(dim);
      return dim;
    });
  }
  function dimRank(id) { var i = DIM_ORDER.indexOf(id); return i < 0 ? 99 : i; }

  // التغيّر في معدّل (k لكل e) بين الفترة السابقة (w[1]) والحالية (w[0]) — اتوزّع إزاي على أجزاء التقسيم؟
  //  - «مزيج»: الأجزاء نفسها ما اتغيّرتش، بس الميزانية راحت لجزء أضعف/أقوى
  //  - «محصور»: جزء واحد بيفسّر ٧٠٪ من التغيّر والباقي ثابت
  //  - «عام»: أجزاء بتمثّل ٦٠٪ من الحجم اتحركت كلها في نفس الاتجاه
  function localize(dim, k, e) {
    if (!dim.informative || !dim.cover[k] || !dim.cover[e]) return null;
    var rows = dim.segs.map(function (s) { return { s: s, A: s.w[1] || bundle(), B: s.w[0] || bundle() }; });
    var EA = 0, EB = 0, KA = 0, KB = 0;
    rows.forEach(function (x) { EA += x.A[e]; EB += x.B[e]; KA += x.A[k]; KB += x.B[k]; });
    if (!(EA > 0 && EB > 0 && KA > 0 && KB > 0)) return null;
    var RA = KA / EA, RB = KB / EB, total = Math.log(RB / RA);
    if (Math.abs(total) < 1e-9) return null;
    var dir = sign(total);
    // الأجزاء الصغيرة معدّلها القديم متذبذب — بنقرّبه لمتوسط الحساب (انكماش) عشان ميطلعش «مزيج» وهمي
    var m = EA * 0.05;
    rows.forEach(function (x) {
      x.ra = (x.A[k] + RA * m) / (x.A[e] + m);
      x.rb = x.B[e] > 0 ? x.B[k] / x.B[e] : x.ra;
      x.shareA = x.A[e] / EA; x.shareB = x.B[e] / EB;
      x.z = rateTest(x.A[k], x.A[e], x.B[k], x.B[e], PHI_SAMPLING).z;
      x.num = x.B[e] * (x.rb - x.ra);
    });
    var Rmix = rows.reduce(function (s, x) { return s + x.B[e] * x.ra; }, 0) / EB;
    var mix = Math.log(Rmix / RA), within = Math.log(RB / Rmix);
    var numTot = rows.reduce(function (s, x) { return s + x.num; }, 0);
    rows.forEach(function (x) { x.w = numTot !== 0 ? x.num / numTot : 0; });
    var material = rows.filter(function (x) { return x.shareA >= 0.05 || x.shareB >= 0.05; });
    var seg = function (x) { return { key: x.s.key, name: x.s.name, share: x.w, z: x.z, from: x.A[e] > 0 ? x.A[k] / x.A[e] : null, to: x.B[e] > 0 ? x.B[k] / x.B[e] : null, expShare: x.shareB }; };

    // مزيج: نص التغيّر أو أكتر جه من انتقال الميزانية (مش من أداء الأجزاء نفسها)
    if (Math.abs(mix) >= 0.5 * Math.abs(total) && Math.abs(mix) >= Math.log(1.1)) {
      var mover = material.slice().sort(function (x, y) {
        return dir * ((y.shareB - y.shareA) * (y.ra - RA)) - dir * ((x.shareB - x.shareA) * (x.ra - RA));
      })[0];
      if (mover && (mover.shareB - mover.shareA) * (mover.ra - RA) * dir > 0) {
        return { type: 'mix', dim: dim.id, kind: dim.kind, seg: seg(mover), toward: mover.shareB > mover.shareA, segBetter: mover.ra > RA, mixShare: mix / total };
      }
    }
    // محصور: جزء واحد بيفسّر ٧٠٪ على الأقل، تغيّره نفسه حقيقي، ومش هو الحساب كله تقريباً، والباقي ثابت
    var top = material.slice().sort(function (x, y) { return y.w - x.w; })[0];
    if (top && top.w >= 0.7 && sign(top.z) === dir && Math.abs(top.z) >= Z_WHERE && top.shareB <= 0.6) {
      var restA = bundle(), restB = bundle();
      rows.forEach(function (x) { if (x !== top) { addTo(restA, x.A); addTo(restB, x.B); } });
      var zRest = rateTest(restA[k], restA[e], restB[k], restB[e], PHI_SAMPLING).z;
      if (Math.abs(zRest) < Z_WHERE) return { type: 'local', dim: dim.id, kind: dim.kind, seg: seg(top), score: top.w * Math.abs(top.z) };
    }
    // عام: أجزاء بتمثّل ٦٠٪ من الحجم الحالي اتحركت في نفس الاتجاه بنص قوة الحساب على الأقل
    var movers = material.filter(function (x) {
      return sign(x.z) === dir && Math.abs(x.z) >= 1 && x.A[e] > 0 && x.B[e] > 0 && x.rb > 0 && Math.log(x.rb / x.ra) * dir >= 0.5 * Math.abs(total);
    });
    var cover = movers.reduce(function (s, x) { return s + x.shareB; }, 0);
    if (movers.length >= 2 && cover >= 0.6) {
      // جزء جديد (من غير فترة سابقة) مينفعش نقول «التغيّر مظهرش فيه» — مفيش حاجة يتقارن بيها
      var exceptions = material.filter(function (x) { return movers.indexOf(x) < 0 && x.shareB >= 0.1 && x.A[e] > 0; });
      return { type: 'general', dim: dim.id, kind: dim.kind, cover: cover,
        movers: movers.sort(function (x, y) { return y.shareB - x.shareB; }).map(seg), exceptions: exceptions.map(seg) };
    }
    return null;
  }
  // كل التقسيمات: أوضح «محصور» يكسب، وإلا «مزيج»، وإلا «عام» (من الحملات لو ممكن — أسماؤها مفهومة للعميل)
  function locateChange(dims, k, e) {
    var res = dims.map(function (d) { return localize(d, k, e); }).filter(Boolean);
    var local = res.filter(function (r) { return r.type === 'local'; }).sort(function (x, y) { return (y.score - x.score) || (dimRank(x.dim) - dimRank(y.dim)); });
    if (local.length) return local[0];
    var mix = res.filter(function (r) { return r.type === 'mix'; }).sort(function (x, y) { return dimRank(x.dim) - dimRank(y.dim); });
    if (mix.length) return mix[0];
    var gen = res.filter(function (r) { return r.type === 'general'; }).sort(function (x, y) {
      return (x.dim === 'campaign' ? -1 : 0) - (y.dim === 'campaign' ? -1 : 0) || dimRank(x.dim) - dimRank(y.dim);
    });
    return gen.length ? gen[0] : null;
  }

  // ---------- أجزاء أداؤها مختلف بوضوح عن باقي الحساب (مشكلة مستمرة أو فرصة) ----------
  // بنجمع آخر ٣ فترات (الإشارة بتقوى)، وبنقيس كل فترة لوحدها عشان نعرف إذا كانت المشكلة مستمرة.
  function sumWins(s, idx) { var t = bundle(); idx.forEach(function (i) { addTo(t, s.w[i]); }); return t; }
  function segmentGaps(dims, W, stages, idx) {
    var T = bundle(); idx.forEach(function (i) { addTo(T, W[i]); });
    var out = [];
    dims.forEach(function (dim) {
      if (!dim.informative || !dim.cover.pur || !dim.cover.spend) return;
      dim.segs.forEach(function (s) {
        if (s.w.length <= Math.max.apply(null, idx)) return;
        var S = sumWins(s, idx), R = minus(T, S);
        if (!(S.spend > 0 && R.spend > 0 && R.pur >= 10)) return;
        var restCpa = R.spend / R.pur, expected = S.spend / restCpa;
        var share = S.spend / T.spend, curShare = (s.w[idx[0]].spend || 0) / (W[idx[0]].spend || 1);
        // صغير جداً = مفيش فلوس كتير على المحك، ومفيش طلبات متوقعة كفاية للحكم
        if (share < 0.05 || expected < 5 || curShare < 0.03) return;
        var test = rateTest(R.pur, R.spend, S.pur, S.spend, PHI_SAMPLING);
        var ratio = (S.pur / S.spend) / (R.pur / R.spend);
        // المتأخر: الطلبات نفسها لازم تبيّن فرق كبير (نص المعدل أو أقل) ومش صدفة (z ≤ −٢)،
        // والدليل القاطع ممكن ييجي من الطلبات أو من مرحلة واحدة أعدادها أكبر (الإضافة للسلة مثلاً) —
        // جزء فيه ٦ طلبات بدل ٢٣ متوقعة، و٢٦ إضافة للسلة بدل ١٣٠، واضح بالمرحلة أكتر من الطلبات
        var kind = null;
        if (test.z <= -2 && ratio <= 0.5) kind = 'under';
        else if (test.z >= Z_SEG && ratio >= 2 && curShare <= 0.6) kind = 'over';
        if (!kind) return;
        var dirSign = kind === 'under' ? -1 : 1;
        // كل فترة لوحدها: الحالية لازم تأكد (وإلا المشكلة «كانت» مش «موجودة»)، واللي قبلها بتحدد الاستمرار
        var per = idx.map(function (i) {
          var Si = s.w[i], Ri = minus(W[i], Si);
          return (Si.spend > 0 && Ri.spend > 0 && Ri.pur > 0) ? rateTest(Ri.pur, Ri.spend, Si.pur, Si.spend, PHI_SAMPLING) : null;
        });
        if (!(per[0] && per[0].z * dirSign >= 1.5)) return;
        var persistent = per.slice(1).some(function (p) { return p && p.z * dirSign >= 1.5; });
        // الفرصة لازم تكون مستمرة — مش هنقترح نحوّل ميزانية بسبب فترة واحدة حلوة
        if (kind === 'over' && !persistent) return;
        // أنهي مرحلة بيتعطل فيها (للمتأخر): أكبر فرق عن باقي الحساب — ولازم يكون قوي هو كمان
        var stage = null;
        if (kind === 'under') {
          stages.forEach(function (st) {
            if (!dim.cover[st.k] || !dim.cover[st.e]) return;
            if (!(S[st.e] > 0 && R[st.e] > 0 && R[st.k] > 0)) return;
            var tt = rateTest(R[st.k], R[st.e], S[st.k], S[st.e], PHI_SAMPLING);
            var gap = Math.log(((S[st.k] + 0.5) / S[st.e]) / (R[st.k] / R[st.e]));
            if (tt.z <= -3 && gap < 0 && (!stage || gap < stage.gap)) {
              stage = { id: st.id, base: st.base || st.e, gap: gap, z: tt.z, seg: S[st.k] / S[st.e], rest: R[st.k] / R[st.e] };
            }
          });
        }
        // قوة الدليل: الأقوى بين الطلبات والمرحلة (المرحلة بعتبة أعلى نص درجة لأننا بندوّر في كذا مرحلة)
        var strength = Math.max(-test.z, stage ? -stage.z - 0.5 : 0);
        if (kind === 'under' && strength < Z_SEG) return;
        var S0 = s.w[idx[0]], R0 = minus(W[idx[0]], S0);
        out.push({
          kind: kind, dim: dim.id, dimKind: dim.kind, key: s.key, name: s.name, z: kind === 'under' ? -strength : test.z,
          conf: (kind === 'under' ? strength : test.z) >= Z_SEG_STRONG ? 'high' : 'medium', ratio: ratio,
          spend: S.spend, pur: S.pur, expected: expected, restCpa: restCpa, cpa: cpaOf(S),
          since: W[idx[idx.length - 1]].since, persistent: persistent, stage: stage,
          curSpend: S0.spend, curPur: S0.pur,
          curExcess: R0.pur > 0 ? Math.max(0, S0.spend - S0.pur * (R0.spend / R0.pur)) : null
        });
      });
    });
    // نفس المشكلة من تقسيمين (دولة الكويت = حملات الكويت): إنفاق وطلبات متقاربين → واحدة بس، بالتقسيم الأوضح
    out.sort(function (x, y) { return (dimRank(x.dim) - dimRank(y.dim)) || (Math.abs(y.z) - Math.abs(x.z)); });
    var kept = [];
    out.forEach(function (f) {
      var dup = kept.filter(function (k) {
        return k.kind === f.kind && Math.abs(k.spend - f.spend) <= 0.2 * Math.max(k.spend, f.spend) && Math.abs(k.pur - f.pur) <= Math.max(2, 0.2 * Math.max(k.pur, f.pur));
      })[0];
      if (dup) { (dup.alsoAs = dup.alsoAs || []).push({ dim: f.dim, key: f.key, name: f.name }); return; }
      kept.push(f);
    });
    // الأهم الأول: الفلوس اللي على المحك
    kept.sort(function (x, y) {
      var mx = x.kind === 'under' ? x.spend - x.pur * x.restCpa : 0, my = y.kind === 'under' ? y.spend - y.pur * y.restCpa : 0;
      return (x.kind === y.kind ? 0 : (x.kind === 'under' ? -1 : 1)) || (my - mx);
    });
    return kept;
  }

  // ---------- تغيّر حاد في حملة (أو دولة) كبيرة — حتى لو إجمالي الحساب ما اتغيّرش ----------
  // حملة كبيرة ساءت وحملة تانية اتحسنت بنفس القدر = الحساب يبان «مستقر» والمشكلة موجودة.
  // بنفحص الأجزاء الكبيرة بس (١٥٪ من الإنفاق على الأقل)، بعتبة التقسيمات العالية، وبتذبذب الحساب اليومي
  // الأجزاء اللي بتتفحص هنا قليلة (الكبيرة بس: ٢–٥ في العادة)، فعتبتها أقل من فحص كل التقسيمات (٣٫٥)
  var Z_CHANGE = 3;
  var CHANGE_DIMS = { campaign: 1, country: 1 };
  function segmentChanges(dims, stages, tr, phiD) {
    var out = [];
    dims.forEach(function (dim) {
      if (!CHANGE_DIMS[dim.id] || !dim.informative || !dim.cover.pur || !dim.cover.spend) return;
      var totA = 0, totB = 0;
      dim.segs.forEach(function (s) { totA += (s.w[1] && s.w[1].spend) || 0; totB += (s.w[0] && s.w[0].spend) || 0; });
      if (!(totA > 0 && totB > 0)) return;
      dim.segs.forEach(function (s) {
        var A = s.w[1], B = s.w[0];
        if (!A || !B || !(A.spend > 0 && B.spend > 0) || A.pur < 10) return;
        if (Math.max(A.spend / totA, B.spend / totB) < 0.15) return;
        // الإنفاق نفسه اتقص للنص أو أكتر = قرار ميزانية مش تغيّر أداء، ومتوقع أقل من ١٠ طلبات = مفيش حكم
        if (B.spend < 0.5 * A.spend || A.pur / A.spend * B.spend < 10) return;
        var test = rateTest(A.pur, A.spend, B.pur, B.spend, Math.max(PHI_SAMPLING, phiD));
        var cpaA = cpaOf(A), cpaB = cpaOf(B);
        if (!(test.z <= -Z_CHANGE && (cpaB == null || cpaB / cpaA >= 1.4))) return;
        out.push({ dim: dim.id, dimKind: dim.kind, key: s.key, name: s.name, share: B.spend / totB, z: test.z,
          cpaFrom: cpaA, cpaTo: cpaB, purFrom: A.pur, purTo: B.pur, conf: -test.z >= Z_SEG_STRONG ? 'high' : 'medium',
          why: B.pur > 0 ? explainEfficiency(stages, tr, A, B) : null });
      });
    });
    return out.sort(function (a, b) { return a.z - b.z; });
  }

  // ---------- أيام من غير أي مبيعات مسجلة رغم إن الزيارات مستمرة (عطل دفع أو تتبّع) ----------
  // المتوقع من معدّلات الفترات اللي قبلها. الاحتمال إن يوم كامل (أو أيام) يعدّوا صفر بالصدفة = e^(−المتوقع)
  function baseRates(W, from) {
    var t = bundle();
    for (var i = from; i < W.length; i++) addTo(t, W[i]);
    if (!(t.spend > 0) || !(t.pur >= 10)) return null;
    return { pur: t.pur / t.spend, atc: t.atc / t.spend, ic: t.ic / t.spend, clicks: t.clicks / t.spend };
  }
  function zeroRuns(daily, w, base, tr, phi) {
    if (!base) return [];
    // تذبذب الحساب اليومي نفسه: حساب أيامه متقلبة بطبيعتها محتاج «متوقع» أكبر قبل ما يوم صفر يبقى مريب
    phi = Math.max(PHI_SAMPLING, phi || PHI_SAMPLING);
    var days = daily.filter(function (d) { return d.date >= w.since && d.date <= w.until; })
      .sort(function (x, y) { return x.date < y.date ? -1 : 1; });
    var runs = [], cur = null;
    days.forEach(function (d) {
      var zero = !(d.pur > 0) && d.spend > 0;
      if (zero && cur && shiftKey(cur.end, 1) === d.date) { cur.end = d.date; cur.rows.push(d); }
      else if (zero) { cur = { start: d.date, end: d.date, rows: [d] }; runs.push(cur); }
      else cur = null;
    });
    return runs.map(function (r) {
      var s = bundle(); r.rows.forEach(function (d) { addTo(s, d); });
      var expected = s.spend * base.pur;
      if (Math.exp(-expected / phi) > ZERO_RUN_P) return null;
      // الزيارات نفسها وقفت؟ يبقى ده توقف ظهور مش عطل مبيعات — مش مكانه هنا
      if (tr.clicks && s.clicks < 0.5 * s.spend * base.clicks) return null;
      var atcOk = !tr.atc || s.atc >= 0.3 * s.spend * base.atc;
      return { start: r.start, end: r.end, days: r.rows.length, spend: s.spend, clicks: s.clicks, atc: s.atc, ic: s.ic,
        expected: expected, kind: atcOk ? 'cart' : 'site', now: r.end === w.until };
    }).filter(Boolean);
  }

  // ---------- فرصة: تكلفة الطلب أحسن بوضوح من المعتاد، والإنفاق مش أعلى من المعتاد ----------
  function scaleOpportunity(W, phiH) {
    var cur = W[0], hist = W.slice(1).filter(function (w) { return w.pur >= 3; });
    if (hist.length < 3 || cur.pur < 30) return null;
    var pooled = bundle(); hist.forEach(function (w) { addTo(pooled, w); });
    var medCpa = median(hist.map(cpaOf)), medSpend = median(hist.map(function (w) { return w.spend; })), cpa = cpaOf(cur);
    // المقارنة بتذبذب الحساب نفسه (phiH): الفرصة لازم تكون أكبر من التذبذب المعتاد، مش أسبوع حلو بالصدفة
    var t = rateTest(pooled.pur, pooled.spend, cur.pur, cur.spend, phiH);
    // والفترة اللي قبلها كانت أحسن من المعتاد هي كمان — فرصة ميزانية مبتتبنيش على فترة واحدة
    var prevCpa = cpaOf(W[1]);
    if (cpa <= 0.8 * medCpa && t.z >= Z_REAL && cur.spend <= 1.05 * medSpend && prevCpa && prevCpa <= 0.9 * medCpa) {
      return { cpa: cpa, medCpa: medCpa, spend: cur.spend, medSpend: medSpend, z: t.z };
    }
    return null;
  }

  // ---------- المواسم والمناسبات (سياق بس — عمرها ما بتتقال كسبب) ----------
  var FIXED_EVENTS = [
    { id: 'saNational', md: '09-23', days: 1, c: 'SA' }, { id: 'saFounding', md: '02-22', days: 1, c: 'SA' },
    { id: 'kwNational', md: '02-25', days: 2, c: 'KW' }, { id: 'aeNational', md: '12-02', days: 2, c: 'AE' },
    { id: 'qaNational', md: '12-18', days: 1, c: 'QA' }, { id: 'bhNational', md: '12-16', days: 2, c: 'BH' },
    { id: 'singles', md: '11-11', days: 1, c: '*' }
  ];
  var TZ_COUNTRY = { 'Asia/Riyadh': 'SA', 'Asia/Kuwait': 'KW', 'Asia/Dubai': 'AE', 'Asia/Qatar': 'QA', 'Asia/Bahrain': 'BH', 'Asia/Muscat': 'OM', 'Africa/Cairo': 'EG' };
  // التقويم الهجري (أم القرى) من المتصفح نفسه — لو مش مدعوم بنتجاهل رمضان والأعياد بدل ما نخمّن
  var HIJRI = (function () {
    try {
      var f = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { timeZone: 'UTC', day: 'numeric', month: 'numeric' });
      return f.resolvedOptions().calendar === 'islamic-umalqura' ? f : null;
    } catch (e) { return null; }
  })();
  function hijriOf(key) {
    if (!HIJRI) return null;
    var p = key.split('-').map(Number);
    var parts = HIJRI.formatToParts(new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)));
    var get = function (t) { var x = parts.filter(function (q) { return q.type === t; })[0]; return x ? parseInt(x.value, 10) : NaN; };
    return { m: get('month'), d: get('day') };
  }
  // الجمعة البيضاء: الجمعة اللي بعد رابع خميس في نوفمبر، لحد الاثنين اللي بعدها
  function isWhiteFridayWeekend(key) {
    var p = key.split('-').map(Number);
    if (p[1] !== 11 && !(p[1] === 12 && p[2] <= 3)) return false;
    var first = new Date(Date.UTC(p[0], 10, 1)).getUTCDay();          // ٠ = الأحد
    var firstThu = 1 + ((4 - first + 7) % 7), fri = firstThu + 21 + 1;  // رابع خميس + ١
    var start = p[0] + '-11-' + (fri < 10 ? '0' : '') + fri;
    return key >= start && key <= shiftKey(start, 3);
  }
  function eventsOn(key, countries) {
    var md = key.slice(5), ids = [];
    FIXED_EVENTS.forEach(function (ev) {
      if (ev.c !== '*' && countries.indexOf(ev.c) < 0) return;
      var start = key.slice(0, 5) + ev.md;
      if (key >= start && key <= shiftKey(start, ev.days - 1)) ids.push(ev.id);
    });
    if (isWhiteFridayWeekend(key)) ids.push('whiteFriday');
    if (+key.slice(8) >= 25) ids.push('monthEnd');
    var h = hijriOf(key);
    if (h && h.m === 9) ids.push(h.d >= 20 ? 'ramadanLast' : 'ramadan');
    if (h && h.m === 10 && h.d <= 3) ids.push('eidFitr');
    if (h && h.m === 12 && h.d >= 9 && h.d <= 13) ids.push('eidAdha');
    return ids;
  }
  function eventsIn(w, countries) {
    var count = {};
    for (var k = w.since; k <= w.until; k = shiftKey(k, 1)) eventsOn(k, countries).forEach(function (id) { count[id] = (count[id] || 0) + 1; });
    return count;
  }
  // المناسبات اللي موجودة في فترة ومش موجودة في التانية — «نهاية الشهر» بس لو ٣ أيام منها على الأقل
  function contextOf(W, countries) {
    var a = eventsIn(W[1], countries), b = eventsIn(W[0], countries);
    var enough = function (m, id) { return id === 'monthEnd' ? (m[id] || 0) >= Math.min(3, W[0].len) : !!m[id]; };
    var ids = Object.keys(a).concat(Object.keys(b)).filter(function (id, i, arr) { return arr.indexOf(id) === i; });
    var inCur = ids.filter(function (id) { return enough(b, id) && !a[id]; });
    var inPrev = ids.filter(function (id) { return enough(a, id) && !b[id]; });
    return { inCur: inCur, inPrev: inPrev, cur: Object.keys(b) };
  }
  function countriesOf(dims, tz) {
    var c = dims.filter(function (d) { return d.id === 'country'; })[0], out = [];
    if (c) {
      var tot = 0; c.segs.forEach(function (s) { tot += s.w[0] ? s.w[0].spend : 0; });
      c.segs.forEach(function (s) { if (tot > 0 && s.w[0] && s.w[0].spend / tot >= 0.1) out.push(String(s.key).toUpperCase()); });
    }
    if (!out.length && TZ_COUNTRY[tz]) out.push(TZ_COUNTRY[tz]);
    return out;
  }

  // ---------- ملاحظات صاحب المتجر على تشخيصات سابقة (زر «كان التشخيص صحيحاً؟») ----------
  // كل ملاحظة: { since, until, verdict: 'yes'|'no', reasons: [...], note }. بنستخدمها في حاجتين بس:
  //  ١) سياق: «حسب ملاحظتك، الفترة السابقة كان فيها عرض» — معلومة من صاحب المتجر نفسه، مش استنتاج
  //  ٢) ترتيب الأسباب: السبب اللي حصل قبل كده في المتجر ده بيطلع الأول ومتعلّم عليه
  // النص الحر نفسه مش بيدخل الحسابات (مش بنحاول نفهمه آلياً) — بيتحفظ عشان صاحب المتجر يرجعله
  var REASON_CAUSES = {
    offer: ['offerLess', 'offerNew'], stock: ['stock'], price: ['price'], site: ['siteSlow', 'payFail', 'cartChange'],
    shipping: ['shippingCost', 'marketShipping'], ads: ['targeting', 'weakerCreative', 'fatigue', 'creativeBetter'],
    season: ['season', 'seasonUp'], tracking: ['trackingPur']
  };
  function ownerContext(feedback, W) {
    var inCur = {}, inPrev = {}, seen = {};
    var overlaps = function (f, w) { return f.since <= w.until && f.until >= w.since; };
    (feedback || []).forEach(function (f) {
      if (!f || !/^\d{4}-\d{2}-\d{2}$/.test(f.since || '') || !/^\d{4}-\d{2}-\d{2}$/.test(f.until || '')) return;
      (f.reasons || []).forEach(function (rs) {
        if (!REASON_CAUSES[rs]) return;
        REASON_CAUSES[rs].forEach(function (c) { seen[c] = (seen[c] || 0) + 1; });
        if (overlaps(f, W[0])) inCur[rs] = 1;
        else if (overlaps(f, W[1])) inPrev[rs] = 1;
      });
    });
    return { inCur: Object.keys(inCur), inPrev: Object.keys(inPrev), seen: seen };
  }

  // ---------- المتابعة: اللي اتقال في الفترة اللي فاتت، اتحل؟ (من غير تخزين: بنعيد الحساب على الفترة السابقة) ----------
  function followUps(daily, W, dims, stages, tr, phi) {
    var out = [];
    if (W.length >= 3) {
      zeroRuns(daily, W[1], baseRates(W, 2), tr, phi).forEach(function (r) {
        out.push({ type: 'zeroRun', start: r.start, end: r.end, days: r.days, resolved: true });
      });
    }
    if (dims.length && dims[0].segs.length && dims[0].segs[0].w.length >= 3) {
      // مشاكل الأجزاء في الفترة السابقة (بنفس القواعد، على الفترتين اللي قبل الحالية)
      var prevGaps = segmentGapsOn(dims, W, stages, [1, 2]);
      prevGaps.filter(function (g) { return g.kind === 'under'; }).forEach(function (g) {
        var s = findSeg(dims, g.dim, g.key), now = s && s.w[0], rest = now && minus(W[0], now);
        if (!now) return;
        var status;
        if (now.spend < 0.2 * (s.w[1].spend || 0)) status = 'stopped';
        else if (rest.pur > 0 && now.spend > 0 && (now.pur / now.spend) >= 0.8 * (rest.pur / rest.spend)) status = 'improved';
        else status = 'ongoing';
        out.push({ type: 'segment', dim: g.dim, key: g.key, name: g.name, status: status });
      });
    }
    // «يوم بلا مبيعات» اتحل فعلاً لو الفترة الحالية مفيهاش أيام زيه
    var nowRuns = zeroRuns(daily, W[0], baseRates(W, 1), tr, phi);
    out.forEach(function (f) { if (f.type === 'zeroRun') f.resolved = !nowRuns.length; });
    return out;
  }
  // نسخة من segmentGaps بفترات مختلفة ومن غير شرط الاستمرار (عشان نعرف اللي كان ظاهر في الفترة السابقة)
  function segmentGapsOn(dims, W, stages, idx) { return segmentGaps(dims, W, stages, idx); }
  function findSeg(dims, dimId, key) {
    var d = dims.filter(function (x) { return x.id === dimId; })[0];
    return d ? d.segs.filter(function (s) { return s.key === key; })[0] : null;
  }

  // ---------- التحليل كله ----------
  // input: { since, until (أيام مكتملة)، currency، timezone،
  //          daily: [{ date, spend, imp, clicks, atc, ic, pur, rev }] بتغطي كل الفترات (DX.windows)،
  //          dims: [{ id, segs: [{ key, name, w: [الحالية، السابقة، اللي قبلها] }] }] }
  function analyze(input) {
    var ws = windowsFor(input.since, input.until);
    var daily = (input.daily || []).filter(function (d) { return d && /^\d{4}-\d{2}-\d{2}$/.test(d.date); })
      .map(function (d) { var b = bundle(d); b.date = d.date; return b; });
    var W = ws.map(function (w) { return sumDays(daily, w); });
    var cur = W[0], prev = W[1];
    var total = W.reduce(function (t, w) { return addTo(t, w); }, bundle());
    var tr = trackingOf(total);
    var report = {
      since: cur.since, until: cur.until, prevSince: prev.since, prevUntil: prev.until, len: cur.len,
      currency: input.currency || null, cur: cur, prev: prev, windows: W, tracked: tr
    };
    if (!tr.pur) { report.status = 'noPurchases'; return report; }
    if (cur.pur + prev.pur < MIN_ORDERS) { report.status = 'insufficient'; report.orders = cur.pur + prev.pur; return report; }
    report.status = 'ok';
    var stages = stagesFor(tr);
    // تذبذب الحساب في التاريخ (من الأقدم للأحدث، من غير الفترة الحالية)
    var phiH = historyPhi(W.slice(1).reverse(), 'pur', 'spend') || PHI_DEFAULT_HIST;
    var phiD = Math.max(PHI_SAMPLING, dailyPhi(daily, cur.since, 'pur', 'spend') || PHI_DEFAULT_HIST);
    // التذبذب بين الفترات عمره ما يبقى أقل من اليومي (الفترة مجموع أيام متذبذبة)
    phiH = Math.max(phiH, phiD);
    report.phiHist = phiH; report.phiDaily = phiD;
    report.head = headline(prev, cur, cur.len, phiD, phiH, W);
    var dims = prepareDims(input.dims, W);
    report.dims = dims.map(function (d) { return { id: d.id, informative: d.informative, cover: d.cover }; });

    // لماذا — بس لو تكلفة الطلب اتغيّرت فعلاً
    if (report.head.dEff !== 0) {
      var why = explainEfficiency(stages, tr, prev, cur);
      if (why) {
        // مكان التغيّر: بنفس معدّل المرحلة/المجموعة اللي فسّرته
        var target = why.drivers.length === 1 ? why.drivers[0] : null;
        var keys = null;
        if (target && target.stages && target.stages.length === 1) {
          var st = stages.filter(function (s) { return s.id === target.stages[0].id; })[0];
          keys = { k: st.k, e: st.e };
        } else if (target) keys = groupRateKeys(target.id, tr);
        else keys = { k: 'pur', e: 'spend' };
        why.scope = locateChange(dims, keys.k, keys.e);
      }
      report.why = why;
    }
    var idx = dims.length && dims[0].segs.length && dims[0].segs[0].w.length >= 3 ? [0, 1, 2] : [0, 1];
    report.segments = dims.length ? segmentGaps(dims, W, stages, idx) : [];
    // تغيّرات حادة في حملة/دولة كبيرة — من غير تكرار اللي اتقال في «لماذا» أو «يحتاج قرارك»
    var said = function (dimId, key) {
      var sc = report.why && report.why.scope;
      if (sc && sc.seg && sc.dim === dimId && sc.seg.key === key) return true;
      return report.segments.some(function (s) {
        return (s.dim === dimId && s.key === key) || (s.alsoAs || []).some(function (x) { return x.dim === dimId && x.key === key; });
      });
    };
    report.changes = segmentChanges(dims, stages, tr, phiD).filter(function (c) { return !said(c.dim, c.key); }).slice(0, 2);
    report.zeroRuns = zeroRuns(daily, W[0], baseRates(W, 1), tr, phiD);
    // المشكلة اللي لسه قايمة وظاهرة أصلاً في «يحتاج قرارك» مش بتتكرر في المتابعة
    var shown = function (f) {
      return report.segments.some(function (s) {
        return (s.dim === f.dim && s.key === f.key) || (s.alsoAs || []).some(function (x) { return x.dim === f.dim && x.key === f.key; });
      });
    };
    report.followUps = followUps(daily, W, dims, stages, tr, phiD).filter(function (f) { return !(f.type === 'segment' && f.status === 'ongoing' && shown(f)); });
    report.opportunity = scaleOpportunity(W, phiH);
    report.context = contextOf(W, countriesOf(dims, input.timezone));
    report.owner = ownerContext(input.feedback, W);
    return report;
  }

  // ---------- جدول الأسباب المعتادة ----------
  // المفتاح: المرحلة|نوع النطاق|الاتجاه. المرحلة ممكن تبقى مجموعة (before / after) لما مرحلة واحدة متبانش.
  // نوع النطاق: general (الحساب كله) أو نوع التقسيم (ads / market / audience / device).
  // دي «القائمة الثابتة» — أي سبب مش هنا مش بيتقال للعميل أبداً.
  var PLAYBOOK = {
    'reach|general|worse': { causes: ['competition', 'season', 'targeting'], check: 'season', owner: 'ads' },
    'reach|ads|worse': { causes: ['audienceUsed', 'targeting'], check: 'adsChanges', owner: 'ads' },
    'reach|market|worse': { causes: ['marketCompetition'], check: 'adsChanges', owner: 'ads' },
    'reach|audience|worse': { causes: ['audienceUsed', 'competition'], check: 'audience', owner: 'ads' },
    'reach|device|worse': { causes: ['competition', 'targeting'], check: 'adsChanges', owner: 'ads' },
    'ctr|general|worse': { causes: ['fatigue', 'offerLess', 'weakerCreative'], check: 'newCreatives', owner: 'ads' },
    'ctr|ads|worse': { causes: ['fatigue', 'weakerCreative'], check: 'adsChanges', owner: 'ads' },
    'ctr|market|worse': { causes: ['fatigue', 'audienceFit'], check: 'adsChanges', owner: 'ads' },
    'ctr|audience|worse': { causes: ['fatigue', 'audienceFit'], check: 'audience', owner: 'ads' },
    'ctr|device|worse': { causes: ['fatigue', 'weakerCreative'], check: 'adsChanges', owner: 'ads' },
    'cpc|general|worse': { causes: ['competition', 'fatigue', 'weakerCreative'], check: 'newCreatives', owner: 'ads' },
    'before|general|worse': { causes: ['competition', 'fatigue', 'weakerCreative'], check: 'newCreatives', owner: 'ads' },
    'before|ads|worse': { causes: ['fatigue', 'audienceUsed', 'targeting'], check: 'adsChanges', owner: 'ads' },
    'before|market|worse': { causes: ['marketCompetition', 'fatigue'], check: 'adsChanges', owner: 'ads' },
    'before|audience|worse': { causes: ['fatigue', 'audienceFit'], check: 'audience', owner: 'ads' },
    'before|device|worse': { causes: ['fatigue', 'targeting'], check: 'adsChanges', owner: 'ads' },
    'cart|general|worse': { causes: ['offerLess', 'price', 'stock', 'siteSlow'], check: 'storeAsCustomer', owner: 'store' },
    'cart|ads|worse': { causes: ['mismatch', 'lowIntent'], check: 'adLanding', owner: 'ads' },
    'cart|market|worse': { causes: ['marketCurrency', 'marketShipping', 'marketAvail'], check: 'market', owner: 'ops' },
    'cart|audience|worse': { causes: ['audienceFit', 'lowIntent'], check: 'audience', owner: 'ads' },
    'cart|device|worse': { causes: ['deviceSite'], check: 'device', owner: 'store' },
    'checkout|general|worse': { causes: ['shippingCost', 'cartChange', 'siteSlow'], check: 'cartFlow', owner: 'store' },
    'checkout|ads|worse': { causes: ['lowIntent', 'mismatch'], check: 'adLanding', owner: 'ads' },
    'checkout|market|worse': { causes: ['marketShipping', 'marketCurrency'], check: 'market', owner: 'ops' },
    'checkout|audience|worse': { causes: ['audienceFit', 'shippingCost'], check: 'audience', owner: 'ads' },
    'checkout|device|worse': { causes: ['deviceSite'], check: 'device', owner: 'store' },
    'pay|general|worse': { causes: ['payFail', 'payMethod', 'verifyStep', 'trackingPur'], check: 'orders', owner: 'store' },
    'pay|ads|worse': { causes: ['lowIntent', 'trackingPur'], check: 'orders', owner: 'ads' },
    'pay|market|worse': { causes: ['marketPay', 'marketShipping'], check: 'market', owner: 'ops' },
    'pay|audience|worse': { causes: ['audienceFit', 'payMethod'], check: 'audience', owner: 'ads' },
    'pay|device|worse': { causes: ['devicePay'], check: 'device', owner: 'store' },
    'after|general|worse': { causes: ['offerLess', 'price', 'stock', 'siteSlow', 'payFail'], check: 'storeAsCustomer', owner: 'store' },
    'after|ads|worse': { causes: ['mismatch', 'lowIntent'], check: 'adLanding', owner: 'ads' },
    'after|market|worse': { causes: ['marketCurrency', 'marketShipping', 'marketPay'], check: 'market', owner: 'ops' },
    'after|audience|worse': { causes: ['audienceFit', 'lowIntent'], check: 'audience', owner: 'ads' },
    'after|device|worse': { causes: ['deviceSite', 'devicePay'], check: 'device', owner: 'store' },
    'any|general|worse': { causes: ['offerLess', 'competition', 'fatigue', 'siteSlow'], check: 'storeAsCustomer', owner: 'store' },
    'any|local|worse': { causes: ['segWorse'], check: 'adsChanges', owner: 'ads' },
    'after|general|better': { causes: ['offerNew', 'seasonUp', 'siteBetter'], check: 'whatChanged', owner: 'store' },
    'before|general|better': { causes: ['creativeBetter', 'competitionLess'], check: 'winningAds', owner: 'ads' },
    'any|general|better': { causes: ['offerNew', 'creativeBetter', 'seasonUp'], check: 'whatChanged', owner: 'store' },
    'any|local|better': { causes: ['segBetter'], check: 'segWin', owner: 'ads' }
  };
  // البحث بالترتيب: المرحلة بالظبط ← المجموعة بتاعتها ← نفس المرحلة على الحساب كله ← أي مرحلة
  function playbook(stage, kind, dir) {
    var group = (stage === 'before' || stage === 'after') ? stage : stageGroupOf(stage);
    var local = kind && kind !== 'general' ? 'local' : 'general';
    // تغيّر محصور في جزء واحد: السبب العام للحساب كله (زي «منافسة في السوق») مش مناسب له —
    // فالصف العام للأجزاء («تغيير خاص في ...») قبل صفوف الحساب كله
    var tries = [stage + '|' + kind + '|' + dir, group + '|' + kind + '|' + dir];
    if (local === 'local') tries.push('any|local|' + dir);
    tries.push(stage + '|general|' + dir, group + '|general|' + dir, 'any|general|' + dir);
    for (var i = 0; i < tries.length; i++) if (PLAYBOOK[tries[i]]) return PLAYBOOK[tries[i]];
    return null;
  }

  // =====================================================================
  // الصياغة: من التقرير لكلام (المفاتيح dx.* في i18n.js)
  // =====================================================================
  // كل رقم بيتكتب بدوال core.js (money / fmtNum / fmtRange) عشان يطابق باقي الأداة في اللغتين.
  // الأسماء (حملات، مناطق) بتتعزل اتجاهياً (FSI…PDI) عشان اسم إنجليزي جوه جملة عربية ميلخبطش ترتيبها —
  // وده بيشتغل كمان في النص المنسوخ للواتساب.
  var FSI = '⁨', PDI = '⁩';
  function iso(s) { return FSI + s + PDI; }
  function tOr(key, vars, fallback) { var s = t(key, vars); return s === key ? fallback : s; }
  function pctSign() { return isAr() ? '٪' : '%'; }
  function pctText(x) { return ar(Math.round(Math.abs(x) * 100)) + pctSign(); }
  // معدّل كنسبة مئوية (٠٫٠٨٧ ← «٨٫٧»): خانة عشرية واحدة تحت ١٠
  function rateText(r) {
    var v = r * 100, s = v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
    return ar(s.replace('.', decSep()));
  }
  function pctOf(k, n) { return n > 0 ? rateText(k / n) + pctSign() : '—'; }
  // «طلب واحد» / «طلبين» / «٥ طلبات» / «٢٢ طلباً»
  function ordersText(n) {
    n = Math.round(n || 0);
    if (isAr() && n === 1) return t('dx.ord.1');
    if (isAr() && n === 2) return t('dx.ord.2');
    return fmtNum(n) + ' ' + noun(n, 'n.order');
  }
  // بالعربي كل عنصر بعد الأول بياخد «و»: «أ، وب، وج» — وبالإنجليزي «a, b and c»
  function listText(arr) {
    if (arr.length <= 1) return arr.join('');
    var last = arr[arr.length - 1], head = arr.slice(0, -1);
    if (isAr()) return head.join('، و') + (arr.length > 2 ? '، و' : t('join.and')) + last;
    return head.join(', ') + t('join.and') + last;
  }
  function periodsText(n, len) {
    if (len === 7) return fmtNum(n) + ' ' + noun(n, 'n.week');
    return t('dx.periodsSimilar', { n: fmtNum(n), periods: noun(n, 'n.period') });
  }
  function countryName(code) {
    try { return new Intl.DisplayNames([isAr() ? 'ar' : 'en'], { type: 'region' }).of(String(code).toUpperCase()) || code; }
    catch (e) { return code; }
  }
  // اسم الجزء بلغة صاحب المتجر: «حملة «...»» / «الكويت» / «الفئة العمرية ٢٥–٣٤ سنة» / «ريلز إنستغرام»
  function segName(dim, key, name) {
    var k = String(key), m;
    if (dim === 'campaign' || dim === 'adset' || dim === 'ad') return t('dx.seg.' + dim, { name: iso(name || k) });
    if (dim === 'country') return countryName(k);
    if (dim === 'age') {
      if ((m = k.match(/^(\d+)-(\d+)$/))) return t('dx.seg.age', { a: ar(m[1]), b: ar(m[2]) });
      if ((m = k.match(/^(\d+)\+$/))) return t('dx.seg.agePlus', { a: ar(m[1]) });
      return k;
    }
    if (dim === 'gender') return tOr('dx.seg.gender.' + k, null, k);
    if (dim === 'publisher') return tOr('dx.pub.' + k, null, k);
    if (dim === 'placement') {
      var p = k.split('|'), pub = tOr('dx.pub.' + p[0], null, p[0] || '');
      return tOr('dx.pos.' + p[1], { pub: pub }, t('dx.pos.other', { pub: pub, pos: p[1] || '' }));
    }
    if (dim === 'device') return tOr('dx.dev.' + k, null, k);
    if (dim === 'impDevice') return tOr('dx.idev.' + k, null, k);
    return iso(name || k);
  }
  // سياق الجملة: اسم الجزء، ولو دولة: وسائل الدفع المعتادة فيها
  function ctxOf(dim, key, name) {
    if (!dim) return { seg: '', country: null };
    return { seg: segName(dim, key, name), country: dim === 'country' ? String(key).toUpperCase() : null };
  }
  function methodsOf(ctx) { return ctx.country ? tOr('dx.pay.' + ctx.country, null, '') : ''; }
  function causeText(id, ctx) {
    var mth = methodsOf(ctx);
    return t('dx.cause.' + id, { seg: ctx.seg || '', methods: mth ? ' (' + mth + ')' : '' });
  }
  // وسائل الدفع بتتذكر في «تحقّق أولاً» بس لو الخلل عند الدفع — مش لو الزوار مبيوصلوش للسلة أصلاً
  var PAY_STAGES = { checkout: 1, pay: 1, after: 1, any: 1 };
  function checkText(id, ctx) {
    if (!ctx.seg && (id === 'adsChanges' || id === 'adLanding')) return t('dx.chk.' + id + 'All');
    var mth = ctx.stage && !PAY_STAGES[ctx.stage] ? '' : methodsOf(ctx);
    return t('dx.chk.' + id, { seg: ctx.seg || '', payHint: mth ? t('dx.payHint', { methods: mth }) : '' });
  }
  // الأسباب اللي صاحب المتجر نفسه قال إنها حصلت قبل كده (زر «كان التشخيص صحيحاً؟») بتطلع الأول ومتعلّم عليها.
  // SEEN بيتملي في بداية compose من التقرير — الترتيب بس اللي بيتغيّر، القائمة نفسها ثابتة من الجدول
  var SEEN = {};
  function applyPlaybook(b, stage, kind, dir, ctx) {
    var pb = playbook(stage, kind, dir);
    if (!pb) return;
    var list = pb.causes.map(function (c, i) { return { id: c, i: i, n: SEEN[c] || 0 }; })
      .sort(function (x, y) { return (y.n - x.n) || (x.i - y.i); });
    b.causes = list.map(function (c) { return causeText(c.id, ctx) + (c.n ? t('dx.cause.seen') : ''); });
    b.check = checkText(pb.check, ctx);
    b.owner = pb.owner;
  }
  // سياق من صاحب المتجر نفسه («حسب ملاحظتك عن الفترة السابقة: عرض أو خصم»)
  function ownerLines(r) {
    var o = r.owner || { inCur: [], inPrev: [] }, out = [];
    var names = function (ids) { return listText(ids.map(function (id) { return t('dx.fb.r.' + id); })); };
    if (o.inPrev.length) out.push(t('dx.ctx.ownerPrev', { list: names(o.inPrev) }));
    if (o.inCur.length) out.push(t('dx.ctx.ownerCur', { list: names(o.inCur) }));
    return out;
  }

  // جملة مرحلة واحدة. p.pct > 0 = المعدّل زاد (أحسن)
  function stageSentence(p) {
    var d = p.pct > 0 ? 'better' : 'worse';
    if (p.id === 'reach' || p.id === 'cpc') return t('dx.st.' + p.id + '.' + d, { pct: pctText(1 / (1 + p.pct) - 1) });
    var vars = { from: rateText(p.from), to: rateText(p.to) };
    if (p.id === 'checkout' || p.id === 'pay') return tOr('dx.st.' + p.id + '.' + p.base + '.' + d, vars, t('dx.st.' + p.id + '.clicks.' + d, vars));
    return t('dx.st.' + p.id + '.' + d, vars);
  }
  // جملة المجموعة كلها: قبل النقرة = تكلفة الزائر، بعدها = «من كل ١٠٠ زائر اشترى...»
  function groupSentence(g) {
    var d = g.to > g.from ? 'better' : 'worse';
    if (g.id === 'before') return t('dx.grp.before.' + d, { pct: pctText(g.from / g.to - 1) });
    // أعداد صحيحة من الناس («٩ من كل ١٠٠» مش «٩٫١»): بنكبّر الأساس لحد ما الرقمين يبقوا ٣ أو أكتر ومختلفين
    var base = 100;
    while (base < 100000 && (Math.min(g.from, g.to) * base < 3 || Math.round(g.from * base) === Math.round(g.to * base))) base *= 10;
    var f = function (r) { return fmtNum(Math.round(r * base)); };
    return t('dx.grp.after.' + d, { base: fmtNum(base), from: f(g.from), to: f(g.to) });
  }
  function groupBullets(g) {
    var out = [];
    if (g.id === 'after') out.push(groupSentence(g));
    (g.stages || []).forEach(function (p) { out.push(stageSentence(p)); });
    if (g.id === 'before' && !(g.stages || []).length) out.push(groupSentence(g));
    return out;
  }

  function kpiList(r, M) {
    var a = r.prev, b = r.cur, h = r.head || {};
    var ch = function (x, y) { return x > 0 ? y / x - 1 : null; };
    var cpaA = cpaOf(a), cpaB = cpaOf(b);
    var roasA = a.spend > 0 && a.rev > 0 ? a.rev / a.spend : null, roasB = b.spend > 0 && b.rev > 0 ? b.rev / b.spend : null;
    // sig = اتجاه التغيّر لو حقيقي بس (١ / −١)، وإلا صفر — الألوان (أخضر/أحمر) مبتظهرش على تذبذب عادي
    return [
      { id: 'orders', label: t('dx.kpi.orders'), value: fmtNum(b.pur), prev: fmtNum(a.pur), pct: ch(a.pur, b.pur), sig: h.dOrd || 0, goodUp: true },
      { id: 'revenue', label: t('dx.kpi.revenue'), value: money(b.rev, r.currency), prev: money(a.rev, r.currency), pct: ch(a.rev, b.rev),
        sig: (h.dOrd || (h.aov && h.aov.real)) ? sign(b.rev - a.rev) : 0, goodUp: true },
      { id: 'cpa', label: t('dx.kpi.cpa'), value: cpaB ? M(cpaB) : '—', prev: cpaA ? M(cpaA) : '—', pct: cpaA && cpaB ? cpaB / cpaA - 1 : null, sig: h.dEff ? -h.dEff : 0, goodUp: false },
      { id: 'roas', label: t('dx.kpi.roas'), value: roasB ? roasStr(roasB) : '—', prev: roasA ? roasStr(roasA) : '—', pct: roasA && roasB ? roasB / roasA - 1 : null, sig: h.dEff || 0, goodUp: true },
      { id: 'spend', label: t('dx.kpi.spend'), value: M(b.spend), prev: M(a.spend), pct: ch(a.spend, b.spend), sig: 0, goodUp: null }
    ];
  }
  // جدول الأدلة (للمسوّق): الفترتين جنب بعض، مرحلة مرحلة
  function evidence(a, b, tr, M) {
    var rows = [], row = function (label, x, y) { rows.push([label, x, y]); };
    row(t('dx.m.spend'), M(a.spend), M(b.spend));
    row(t('dx.m.orders'), fmtNum(a.pur), fmtNum(b.pur));
    row(t('dx.m.cpa'), cpaOf(a) ? M(cpaOf(a)) : '—', cpaOf(b) ? M(cpaOf(b)) : '—');
    if (a.pur > 0 && b.pur > 0 && a.rev > 0 && b.rev > 0) row(t('dx.m.aov'), M(a.rev / a.pur), M(b.rev / b.pur));
    if (tr.imp && a.imp > 0 && b.imp > 0) {
      row(t('dx.m.reach'), M(a.spend / a.imp * 1000), M(b.spend / b.imp * 1000));
      row(t('dx.m.ctr'), pctOf(a.clicks, a.imp), pctOf(b.clicks, b.imp));
    }
    if (a.clicks > 0 && b.clicks > 0) row(t('dx.m.cpc'), M(a.spend / a.clicks), M(b.spend / b.clicks));
    var base = 'clicks';
    if (tr.atc) { row(t('dx.m.cart'), pctOf(a.atc, a.clicks), pctOf(b.atc, b.clicks)); base = 'atc'; }
    if (tr.ic) { row(t('dx.m.checkout'), pctOf(a.ic, a[base]), pctOf(b.ic, b[base])); base = 'ic'; }
    row(t('dx.m.pay'), pctOf(a.pur, a[base]), pctOf(b.pur, b[base]));
    return { head: [t('dx.m.metric'), t('dx.m.prev'), t('dx.m.cur')], rows: rows };
  }

  // «لماذا؟» — التفسير كله في بلوك واحد
  function whyBlock(r, M) {
    var h = r.head, w = r.why, lines = [], bullets = [], after = [];
    // «لماذا؟» بس لو فيه تفسير فعلاً — لو الفرق في حدود التذبذب العنوان «ما الذي تغيّر؟»
    var blk = { kind: 'why', title: t(w ? 'dx.why.title' : 'dx.what.title'), lines: lines, bullets: bullets, after: after, evidence: evidence(r.prev, r.cur, r.tracked, M) };
    // ١) الطلبات: اتغيّرت بسبب الإنفاق ولا بسبب تكلفة الطلب؟
    var up = (h.ordPct || 0) > 0, byBudget = h.type === 'scaled' || h.type === 'budgetDown';
    var spendFact = function () { lines.push(t(h.spendPct > 0 ? 'dx.vol.spend.up' : 'dx.vol.spend.down', { pct: pctText(h.spendPct) })); };
    if (h.split && h.dSpend !== 0) {
      var sp = h.split.spend, ef = h.split.eff;
      if (h.dEff !== 0 && sp < 0) lines.push(t(up ? 'dx.vol.despiteUp' : 'dx.vol.despiteDown', { pct: pctText(h.spendPct) }));
      else if (byBudget || (h.dEff !== 0 && ef < 0.2)) {
        // الإنفاق فسّر معظم تغيّر الطلبات. «وبقيت تكلفة الطلب قريبة من مستواها» بس لو الفرق فعلاً صغير،
        // وإلا «تغيّرها ضمن التذبذب» — عمرنا ما بنقول «ثابتة» على تكلفة اتغيّرت ٣٠٪
        var key = h.flatEff ? (up ? 'dx.vol.spendUp' : 'dx.vol.spendDown') : (h.dEff === 0 ? (up ? 'dx.vol.spendUpMost' : 'dx.vol.spendDownMost') : null);
        if (key) lines.push(t(key, { pct: pctText(h.spendPct) })); else spendFact();
        if (!up) lines.push(t('dx.vol.askBudget'));
      } else if (h.dEff !== 0 && sp >= 0.2) lines.push(t(up ? 'dx.vol.splitUp' : 'dx.vol.splitDown', { sp: pctText(Math.min(1, sp)), ef: pctText(Math.min(1, ef)) }));
      else spendFact();
    } else if (h.dSpend !== 0 && (h.type === 'fewer' || h.type === 'moreOrders')) spendFact();
    if (h.type === 'spendUpFlat') lines.push(t('dx.vol.spendUpFlat', { pct: pctText(h.spendPct) }));
    // تكلفة الطلب اتحركت كتير بس في حدود تذبذب الحساب: نقول الرقم، ومن غير سبب
    if (!w && h.effUncertain && !byBudget) {
      lines.push(t('dx.eff.uncertain', { from: M(cpaOf(r.prev)), to: M(cpaOf(r.cur)) }));
      // الترتيب بين الفترات حقيقة مش استنتاج — بيتقال حتى لو الفرق نفسه في حدود التذبذب
      if (h.rank) lines.push(t('dx.rank.' + h.rank.kind, { n: periodsText(h.rank.n, r.len) }));
    }
    if (h.marginal) lines.push(t('dx.marginal', { m: M(h.marginal.cpa), avg: M(h.marginal.avg) }));
    // ٢) تكلفة الطلب: إيه اللي اتغيّر، وفين
    if (w) {
      lines.push(t('dx.why.eff.' + w.dir, { pct: pctText(w.pct), from: M(cpaOf(r.prev)), to: M(cpaOf(r.cur)) }));
      // ترتيبها بين الفترات جنب رقمها على طول («وهي أفضل تكلفة طلب في آخر ٩ أسابيع»)
      if (h.rank) lines.push(t('dx.rank.' + h.rank.kind, { n: periodsText(h.rank.n, r.len) }));
      var shareTxt = function (s) { return s >= 0.3 && s <= 0.95 ? t('dx.why.share', { share: pctText(s) }) : ''; };
      if (w.kind === 'after' || w.kind === 'before') {
        lines.push(t('dx.why.' + w.kind, { share: shareTxt(w.drivers[0].share) }));
        groupBullets(w.drivers[0]).forEach(function (s) { bullets.push(s); });
      } else if (w.kind === 'both') {
        lines.push(t('dx.why.both'));
        w.drivers.forEach(function (g) { groupBullets(g).forEach(function (s) { bullets.push(s); }); });
      } else lines.push(t('dx.why.spread'));
      w.counters.forEach(function (g) { after.push(t('dx.why.counter', { text: groupBullets(g).join(' ') })); });
      // عام ولا محصور
      var sc = w.scope, ctx = { seg: '', country: null }, kind = 'general';
      if (sc && sc.type === 'general') {
        var names = sc.movers.slice(0, 3).map(function (s) { return segName(sc.dim, s.key, s.name); });
        var list = sc.movers.length > 3 ? tOr('dx.scope.most.' + sc.dim, null, t('dx.scope.most.any')) : listText(names);
        after.push(t('dx.scope.general', { list: list }));
        if (sc.exceptions.length && sc.movers.length <= 3) after.push(t('dx.scope.except', { list: listText(sc.exceptions.slice(0, 2).map(function (s) { return segName(sc.dim, s.key, s.name); })) }));
      } else if (sc && sc.type === 'local') {
        ctx = ctxOf(sc.dim, sc.seg.key, sc.seg.name); kind = sc.kind;
        after.push(t('dx.scope.local', { share: pctText(Math.min(1, sc.seg.share)), seg: ctx.seg }));
      } else if (sc && sc.type === 'mix') {
        ctx = ctxOf(sc.dim, sc.seg.key, sc.seg.name); kind = sc.kind;
        after.push(t('dx.scope.mix.' + (sc.toward ? 'to' : 'away') + (sc.segBetter ? 'Good' : 'Bad'), { seg: ctx.seg }));
      }
      // الأسباب المعتادة: أدق مرحلة اتحددت، وإلا المجموعة، وإلا أي مرحلة
      var d0 = w.drivers.length === 1 ? w.drivers[0] : null;
      var stage = d0 ? ((d0.stages && d0.stages.length === 1) ? d0.stages[0].id : d0.id) : 'any';
      ctx.stage = stage;
      applyPlaybook(blk, stage, kind, w.dir, ctx);
      // هل ده غير معتاد؟ وترتيبه بين الفترات
      after.push(t(h.unusual ? 'dx.hist.unusual' : 'dx.hist.normal'));
      blk.conf = Math.abs(h.effZ) >= 3 && h.unusual ? 'high' : 'medium';
    }
    if (h.aov && h.aov.real) after.push(t(h.aov.pct > 0 ? 'dx.aov.up' : 'dx.aov.down', { pct: pctText(h.aov.pct), from: M(h.aov.from), to: M(h.aov.to) }));
    // المناسبات: سياق بس
    var c = r.context || { inCur: [], inPrev: [] };
    var evNames = function (ids) { return listText(ids.map(function (id) { return t('dx.event.' + id); })); };
    if (c.inCur.length) after.push(t('dx.ctx.cur', { events: evNames(c.inCur) }));
    if (c.inPrev.length) after.push(t('dx.ctx.prev', { events: evNames(c.inPrev) }));
    ownerLines(r).forEach(function (l) { after.push(l); });
    if (!lines.length && !bullets.length) return null;
    blk.fbKey = 'why';
    if (h.dOrd < 0 && h.dEff === 0 && !blk.check) blk.owner = 'ads';
    return blk;
  }

  function segBlock(s, M) {
    var ctx = ctxOf(s.dim, s.key, s.name), name = ctx.seg;
    var title = s.pur === 0 ? t('dx.seg.zero', { seg: name, spend: M(s.spend), since: fmtKey(s.since) })
      : (s.ratio <= 0.34 ? t('dx.seg.few', { seg: name, spend: M(s.spend), since: fmtKey(s.since), orders: ordersText(s.pur) })
        : t('dx.seg.costly', { seg: name, times: I18N.timesPhrase(1 / s.ratio, ar) }));
    var lines = [t('dx.seg.expected', { orders: ordersText(Math.round(s.expected)) })];
    if (s.stage) {
      var st = s.stage, vars = { seg: name, a: rateText(st.seg), b: rateText(st.rest) };
      if (st.id === 'reach') vars = { seg: name, a: M(1000 / st.seg), b: M(1000 / st.rest) };
      if (st.id === 'cpc') vars = { seg: name, a: M(1 / st.seg), b: M(1 / st.rest) };
      var key = (st.id === 'checkout' || st.id === 'pay') ? 'dx.seg.stage.' + st.id + '.' + st.base : 'dx.seg.stage.' + st.id;
      lines.push(tOr(key, vars, t('dx.seg.stageNone')));
    } else lines.push(t('dx.seg.stageNone'));
    lines.push(t(s.persistent ? 'dx.seg.persist' : 'dx.seg.new'));
    if (s.alsoAs && s.alsoAs.length) lines.push(t('dx.seg.alsoAs', { list: listText(s.alsoAs.map(function (x) { return segName(x.dim, x.key, x.name); })) }));
    var blk = { kind: 'decision', title: title, lines: lines, after: [t('dx.seg.decide', { seg: name })], conf: s.conf, fbKey: 'seg:' + s.dim + ':' + s.key };
    ctx.stage = s.stage ? s.stage.id : 'any';
    applyPlaybook(blk, ctx.stage, s.dimKind, 'worse', ctx);
    return blk;
  }
  // تغيّر حاد في حملة/دولة كبيرة: الرقم، وحجمها من الإنفاق، ومكان التغيّر جوّاها (لو اتحدد)، والأسباب المعتادة
  function changeBlock(c, r, M) {
    var ctx = ctxOf(c.dim, c.key, c.name), lines = [], bullets = [];
    var title = c.cpaTo == null ? t('dx.chg.titleZero', { seg: ctx.seg, orders: ordersText(c.purFrom) })
      : t('dx.chg.title', { seg: ctx.seg, pct: pctText(c.cpaTo / c.cpaFrom - 1) });
    lines.push(c.cpaTo == null ? t('dx.chg.bodyZero', { share: pctText(c.share) })
      : t('dx.chg.body', { from: M(c.cpaFrom), to: M(c.cpaTo), share: pctText(c.share) }));
    var w = c.why, stage = 'any';
    if (w && (w.kind === 'after' || w.kind === 'before')) {
      lines.push(t('dx.why.' + w.kind, { share: '' }));
      groupBullets(w.drivers[0]).forEach(function (s) { bullets.push(s); });
      stage = w.drivers[0].stages && w.drivers[0].stages.length === 1 ? w.drivers[0].stages[0].id : w.kind;
    }
    var after = [];
    if (r.head && (r.head.type === 'stable' || r.head.type === 'withinNoise')) after.push(t('dx.chg.hidden'));
    var blk = { kind: 'watch', title: title, lines: lines, bullets: bullets, after: after, conf: c.conf, fbKey: 'chg:' + c.dim + ':' + c.key };
    ctx.stage = stage;
    applyPlaybook(blk, stage, c.dimKind, 'worse', ctx);
    return blk;
  }
  function zeroBlock(z) {
    var days = z.days === 1 ? fmtKey(z.start) : fmtRange(z.start, z.end);
    return {
      kind: z.now ? 'urgent' : 'watch', conf: 'high', owner: 'tracking', fbKey: 'zero:' + z.start,
      title: z.now ? t('dx.zero.titleNow', { since: fmtKey(z.start) }) : t('dx.zero.titlePast', { days: days }),
      lines: [t('dx.zero.body.' + z.kind, { expected: ordersText(Math.round(z.expected)) })],
      check: t('dx.zero.check.' + z.kind, { days: days })
    };
  }
  function oppBlock(r, M) {
    var o = r.opportunity;
    if (!o) return null;
    var lines = [t('dx.opp.scale', { cpa: M(o.cpa), med: M(o.medCpa) })];
    var ev = (r.context && r.context.cur || []).filter(function (id) { return id !== 'monthEnd'; });
    if (ev.length) lines.push(t('dx.opp.season', { events: listText(ev.map(function (id) { return t('dx.event.' + id); })) }));
    return { kind: 'opportunity', title: t('dx.opp.title'), lines: lines, next: t('dx.opp.check'), owner: 'ads', conf: 'medium', fbKey: 'opp' };
  }
  function overBlock(s, M) {
    var name = segName(s.dim, s.key, s.name);
    return { kind: 'opportunity', title: t('dx.over.title', { seg: name }), conf: s.conf, owner: 'ads', fbKey: 'over:' + s.dim + ':' + s.key,
      lines: [t('dx.over.body', { seg: name, cpa: M(s.cpa), rest: M(s.restCpa) })], next: t('dx.over.check', { seg: name }) };
  }
  function followBlock(r) {
    var lines = [];
    (r.followUps || []).forEach(function (f) {
      if (f.type === 'zeroRun' && f.resolved) lines.push(t('dx.follow.zeroResolved', { days: f.days === 1 ? fmtKey(f.start) : fmtRange(f.start, f.end) }));
      if (f.type === 'segment') lines.push(t('dx.follow.seg.' + f.status, { seg: segName(f.dim, f.key, f.name) }));
    });
    return lines.length ? { kind: 'follow', title: t('dx.follow.title'), lines: lines } : null;
  }

  // التقرير كله جاهز للعرض — بالترتيب: العاجل، ثم «لماذا»، ثم اللي يحتاج قرار، ثم المتابعة والفرص
  function compose(r) {
    var M = function (v) { return money(v, r.currency); };
    SEEN = (r.owner && r.owner.seen) || {};
    var o = { status: r.status, blocks: [], kpis: [], notes: [],
      period: t('dx.compare', { cur: fmtRange(r.since, r.until), prev: fmtRange(r.prevSince, r.prevUntil) }) };
    if (r.status === 'noPurchases') {
      o.tone = 'neutral'; o.title = t('dx.head.noPurchases');
      o.blocks.push({ kind: 'note', title: t('dx.head.noPurchases'), lines: [t('dx.noPurchases')] });
      return o;
    }
    o.kpis = kpiList(r, M);
    if (r.status === 'insufficient') {
      o.tone = 'neutral'; o.title = t('dx.head.insufficient');
      o.blocks.push({ kind: 'note', title: t('dx.head.insufficient'), lines: [t('dx.insufficient', { orders: ordersText(r.orders) })] });
      return o;
    }
    var h = r.head;
    o.tone = h.tone; o.title = t('dx.head.' + h.type);
    r.zeroRuns.filter(function (z) { return z.now; }).forEach(function (z) { o.blocks.push(zeroBlock(z)); });
    var calm = h.type === 'stable' || h.type === 'withinNoise';
    var why = calm ? null : whyBlock(r, M);
    if (why) o.blocks.push(why);
    else if (calm) {
      o.blocks.push({ kind: 'note', title: t('dx.head.' + h.type),
        lines: [h.dSpend !== 0 ? t('dx.stable.spend', { pct: pctText(h.spendPct) }) : t('dx.stable')].concat(ownerLines(r)) });
    }
    r.segments.filter(function (s) { return s.kind === 'under'; }).slice(0, 3).forEach(function (s) { o.blocks.push(segBlock(s, M)); });
    (r.changes || []).forEach(function (c) { o.blocks.push(changeBlock(c, r, M)); });
    r.zeroRuns.filter(function (z) { return !z.now; }).forEach(function (z) { o.blocks.push(zeroBlock(z)); });
    var opp = oppBlock(r, M);
    if (opp) o.blocks.push(opp);
    r.segments.filter(function (s) { return s.kind === 'over'; }).slice(0, 2).forEach(function (s) { o.blocks.push(overBlock(s, M)); });
    var fu = followBlock(r);
    if (fu) o.blocks.push(fu);
    o.notes.push(t('dx.note.attribution'));
    return o;
  }

  // نسخة نصية (للواتساب): *نص* = عريض في واتساب
  var TONE_ICON = { good: '🟢', bad: '🔴', mixed: '🟠', neutral: '⚪' };
  var KIND_ICON = { urgent: '🚨', why: '💡', decision: '🔴', watch: '🟠', opportunity: '🟢', follow: '✅', note: 'ℹ️' };
  function blockText(b) {
    var L = [(KIND_ICON[b.kind] || '•') + ' *' + b.title + '*'];
    (b.lines || []).forEach(function (l) { L.push(l); });
    (b.bullets || []).forEach(function (x) { L.push('• ' + x); });
    (b.after || []).forEach(function (l) { L.push(l); });
    if (b.causes && b.causes.length) L.push(t('dx.causes') + ' ' + listText(b.causes) + '.');
    if (b.check) L.push('🔍 ' + t('dx.check') + ' ' + b.check);
    if (b.next) L.push('👉 ' + t('dx.next') + ' ' + b.next);
    return L.join('\n');
  }
  function toText(o, accountName) {
    var L = ['📊 ' + t('dx.title') + (accountName ? ' — ' + accountName : ''), o.period, '', (TONE_ICON[o.tone] || '') + ' *' + o.title + '*'];
    (o.kpis || []).forEach(function (k) { L.push('• ' + k.label + ': ' + k.value + ' (' + t('dx.kpi.prev', { v: k.prev }) + ')'); });
    (o.blocks || []).forEach(function (b) { L.push(''); L.push(blockText(b)); });
    (o.notes || []).forEach(function (n) { L.push(''); L.push('ℹ️ ' + n); });
    return L.join('\n');
  }

  return {
    analyze: analyze,
    compose: compose,
    toText: toText,
    blockText: blockText,
    segName: segName,
    listText: listText,
    // اختيارات «ما الذي حدث فعلاً؟» في زر التقييم (بنفس ترتيب ظهورها)
    REASONS: Object.keys(REASON_CAUSES).concat(['other']),
    windows: windowsFor,
    playbook: playbook,
    PLAYBOOK: PLAYBOOK,
    // للاختبارات
    _: { rateTest: rateTest, historyPhi: historyPhi, betai: betai, normInv: normInv, decompose: decompose, stagesFor: stagesFor,
      trackingOf: trackingOf, eventsOn: eventsOn, hijriOf: hijriOf, isWhiteFridayWeekend: isWhiteFridayWeekend, localize: localize,
      prepareDims: prepareDims, windowCount: windowCount, hijriSupported: !!HIJRI,
      T: { Z_REAL: Z_REAL, Z_SEG: Z_SEG, PHI_SAMPLING: PHI_SAMPLING },
      // للمعايرة بالمحاكاة بس (tests/dx-sim.js) — كود الأداة نفسه مبيغيّرش العتبات أبداً
      tune: function (o) { if (o.Z_REAL) Z_REAL = o.Z_REAL; if (o.Z_WHERE) Z_WHERE = o.Z_WHERE; return { Z_REAL: Z_REAL, Z_WHERE: Z_WHERE }; } }
  };
})();
