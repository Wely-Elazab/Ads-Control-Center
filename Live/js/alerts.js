// =====================================================================
// Ads Center — محرك التنبيهات والتقييم
// =====================================================================
// بياخد الإعلانات المحمّلة (بنفس الشكل اللي ملفات المنصات في js/ بتبنيه) ويرجّع:
//   - تقييم كل إعلان: review (يحتاج مراجعة) / improve (يحتاج تحسين) / good (جيد) / pending (لم يُحكم بعد) / inactive (متوقف)
//     ومعاه pending (سبب «لم يُحكم بعد») وbasis (سطر أساس الحكم في تفاصيل الإعلان)
//   - تنبيهات بلغة البزنس لكل إعلان ولكل حساب
//
// مبدأ أساسي: المحرك ده بيقرا ويحلل بس — مفيش فيه أي حاجة بتغيّر في الإعلانات.
//
// ترتيب الأيام في كل إعلان: خانات من الأقدم للأحدث، آخر خانة = النهارده (يوم لسه مخلصش)، واللي قبلها = «أمس».
// من ١٠ أكتوبر ٢٠٢٦ النافذة ٨ خانات = ٧ أيام مكتملة + النهارده (قرار صاحب المنتج — قبل كده كانت ٧ خانات، فـ«الأسبوع»
// كان ٦ أيام بس). المؤشرات بتتحسب من آخر النافذة (setWindow في analyze)، فالمحرك بيشتغل بأي طول — أيام كاملة بس
// في الحكم، عشان النهارده ميظلمش أي إعلان.
//
// الحدود الافتراضية نسبية لأداء الحساب نفسه (مثلاً مضاعفات متوسط تكلفة النتيجة) —
// كده بتشتغل مع أي عملة وأي حجم ميزانية، وصاحب البزنس يقدر يعدّلها من الإعدادات.
(function (global) {
  var WINDOW = 7, TODAY = 6, YESTERDAY = 5, DAY_BEFORE = 4, RECENT3 = 3;
  // RECENT3 = أول يوم من «آخر ٣ أيام مكتملة»
  function setWindow(n) {
    WINDOW = n >= 5 ? n : 7;
    TODAY = WINDOW - 1; YESTERDAY = WINDOW - 2; DAY_BEFORE = WINDOW - 3; RECENT3 = WINDOW - 4;
  }
  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }
  // الساعة دلوقتي (٠–٢٣) بتوقيت الحساب، أو null لو التوقيت غلط
  function hourInTz(tz) {
    try { return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(new Date())) % 24; } catch (e) { return null; }
  }

  // إعدادات الحساب الإعلاني (مراجعة الإعدادات ٢٤ أكتوبر ٢٠٢٦ — audit/settings-review.md): ٩ حدود، دي قيمها اللي الحساب بيبدأ بيها
  // وبتبان مكتوبة في نموذج إعداداته لحد ما يحفظها. مفيش أنماط ولا «استعادة القيم الافتراضية» (قرار صاحب المنتج).
  // المستهدف وحد الخسارة مالهمش قيمة ابتدائية خالص (GOAL_KEYS تحت): حكم الربح بيستنى لحد ما العميل يحددهم (قرار صاحب المنتج —
  // حد خسارة ×١ مايناسبش أغلب المتاجر، فإعلان خسران فعلاً كان ممكن يطلع «جيد»)
  var DEFAULT_SETTINGS = {
    learningDays: 3,          // الإعلان الأحدث من كده في فترة تعلّم — منقيّمش أداءه لسه
    minSpendShare: 0.02,      // حد الإعلان الصغير: التنبيه بيطلع بس لو صرف الإعلان ≥ النسبة دي من صرف الحساب
                              // (أو ≥ تكلفة نتيجة واحدة و≥ ربع النسبة) — أصغر من كده ملاحظاته "للعلم" بس
    cprWarnMultiple: 1.5,     // تكلفة النتيجة أعلى من متوسط باقي الإعلانات بالمضاعف ده (وبدليل) = يحتاج تحسين
    cprCriticalMultiple: 2,   // ... وبالمضاعف ده (وبدليل مصحّح) = يحتاج مراجعة
    lowDeliveryRatio: 0.2,    // صرف أمس أقل من النسبة دي من متوسطه اليومي = وصول ضعيف
    spikeMultiple: 2,         // صرف أمس ≥ المضاعف ده × متوسطه = صرف غير معتاد
    frequencyHigh: 6,         // نفس الشخص شاف الإعلان المرات دي أو أكتر = الجمهور زهق
    accountSpikeMultiple: 1.5,
    accountDropRatio: 0.5
  };
  var GOAL_KEYS = ['roasTarget', 'roasBreakEven'];
  // كانت إعدادات واتشالت من الشاشة (مراجعة الإعدادات): أربعة منهم قياسهم أثبت إنهم مالهمش أثر — اختبار الدليل (ق١) هو اللي بيقرّر
  // («إنفاق دون نتائج» من ×٠٫٥ لـ×٥ التنبيه بيبدأ دايماً عند ×٣٫٢٥)، وتلاتة زيادة (العمر مش جزء من تعريف Meta للإرهاق، والتركّز
  // جملة والحصة ظاهرة أصلاً). القيم دي نفس قيمها القديمة بالظبط، فسلوك المحرك متغيّرش
  var WASTE_X = 2, DROP_RATIO = 0.5, SCALE_MIN = 3, SCALE_RATIO = 0.8, OLD_AD_DAYS = 90, CONC_SHARE = 0.4;
  // نتائج أعلى المسار (نقرة، زيارة، تفاعل، مشاهدة، وصول، تمريرة، إضافة للسلة، بدء دفع، وغير المعروف): «أرخص» فيها مش فلوس — مفيش «فرصة
  // لزيادة الاستثمار» عليها (صاحب المنتج ٢٥ أكتوبر: «لم أفهم سبب أن إعلاناً بهدف الزيارات عليه تنبيه فرصة لزيادة الاستثمار»). الفرصة
  // للنتائج اللي ليها قيمة تجارية مباشرة: طلب، عميل محتمل، محادثة، تسجيل، تثبيت، تحويل. مستوى تكلفتها العالية من حدود الإعدادات زي الباقي
  var UPPER_FUNNEL = { click: 1, lpv: 1, engagement: 1, video: 1, reach: 1, swipe: 1, cart: 1, checkout: 1, generic: 1 };

  // النصوص كلها من i18n.js — عشان التنبيهات تطلع بلغة الواجهة
  // {wd} = عدد الأيام المكتملة في نافذة الحكم («آخر ٧ أيام») — من النافذة نفسها مش رقم ثابت في النص
  // (النصوص فضلت تقول «آخر ٦ أيام» بعد ما النافذة بقت ٧ أيام مكتملة في ١٠ أكتوبر ٢٠٢٦)
  var WEEK_TXT = null, WEEK_AD = null;   // WEEK_AD = أيام الإعلان ده بعد آخر تعديل (evaluateAd)
  // {rest} = المرجع اللي الإعلان بيتقارن بيه («باقي إعلانات حملته» أو «باقي إعلاناتك»)، و{avgOf} = متوسط مين («حملته» أو «حسابك») —
  // REF_CAMP بيتحدد في evaluateAd لكل إعلان (التدقيق العميق ٢٤ أكتوبر ٢٠٢٦: المقارنة جوه الحملة نفسها)
  var REF_CAMP = false;
  var t = function (k, v) {
    // من غير متغيرات كمان: {rest} في نصيحة «فرصة الزيادة» كان بيطلع زي ما هو (حساب حقيقي ٢٤ أكتوبر)
    v = v || {};
    if (v.wd == null) v.wd = WEEK_AD || WEEK_TXT || String(YESTERDAY + 1);
    if (v.rest == null && global.I18N) v.rest = global.I18N.t(REF_CAMP ? 'ref.rest.camp' : 'ref.rest.acc');
    if (v.avgOf == null && global.I18N) v.avgOf = global.I18N.t(REF_CAMP ? 'ref.avgOf.camp' : 'ref.avgOf.acc');
    return global.I18N ? global.I18N.t(k, v) : k;
  };

  // وصف كل إعداد لشاشة الإعدادات — بلغة بزنس (النص نفسه في i18n.js تحت set.<key> و set.<key>.help)
  // kind: multiple (×) / ratio (بيتعرض كنسبة مئوية) / days / times / count
  // min / max = أقل وأكبر قيمة مقبولة بوحدة الشاشة (النسب بالمئة) — القيم برّه الحدود دي بتخلّي
  // التنبيهات تطلع على كل حاجة أو متطلعش خالص (مثلاً مضاعف «أعلى من المتوسط» أقل من ١)
  var SETTINGS_META = [
    ['learningDays', 'days', 'general', 0, 30], ['minSpendShare', 'ratio', 'general', 0, 50],
    ['cprWarnMultiple', 'multiple', 'cost', 1, 20], ['cprCriticalMultiple', 'multiple', 'cost', 1, 20],
    ['roasBreakEven', 'multiple', 'roas', 0.1, 50], ['roasTarget', 'multiple', 'roas', 0.1, 50],
    ['lowDeliveryRatio', 'ratio', 'spend', 1, 100], ['spikeMultiple', 'multiple', 'spend', 1.1, 20],
    ['frequencyHigh', 'times', 'audience', 1, 50],
    ['accountSpikeMultiple', 'multiple', 'account', 1.1, 20], ['accountDropRatio', 'ratio', 'account', 1, 100]
  ].map(function (m) {
    return {
      key: m[0], kind: m[1], min: m[3], max: m[4],
      get group() { return t('setgroup.' + m[2]); },
      get label() { return t('set.' + m[0]); },
      get help() { return t('set.' + m[0] + '.help'); }
    };
  });
  // نفس الحدود بالوحدة الداخلية (النسبة ٠–١) — عشان قيمة غلط محفوظة من قبل كده متتقبلش
  var SETTINGS_LIMITS = {};
  SETTINGS_META.forEach(function (m) {
    var f = m.kind === 'ratio' ? 0.01 : 1;
    SETTINGS_LIMITS[m.key] = { min: m.min * f, max: m.max * f };
  });
  // حدود لازم تكون مترتبة: [الأصغر، الأكبر، مفتاح الرسالة]
  var SETTINGS_ORDER = [
    ['cprWarnMultiple', 'cprCriticalMultiple', 'set.err.cprOrder'],
    ['roasBreakEven', 'roasTarget', 'set.err.roasOrder']
  ];

  var LEVEL_RANK = { critical: 3, warning: 2, info: 1, opportunity: 0 };

  var TOP_SHARE = 0.25;      // «أكبر مصدر مبيعات» = ربع مبيعات الحساب في آخر ٧ أيام أو أكتر
  var CAP_NEAR = 0.9;        // حد الإنفاق: التنبيه من ٩٠٪
  var CAP_NEAR_DAYS = 7;     // ... و«عاجل» لو الباقي يكفي أسبوع أو أقل
  // Meta بترجّع حد الإنفاق والمبالغ في السجل بأصغر وحدة للعملة (سنت). العملات دي مالهاش كسور عندها
  var CUR_UNIT1 = { JPY: 1, KRW: 1, CLP: 1, VND: 1, ISK: 1, HUF: 1, TWD: 1, PYG: 1, IDR: 1, COP: 1, CRC: 1 };
  function unitOf(cur) { return CUR_UNIT1[cur] ? 1 : 100; }

  // اسم نوع النتيجة (جمع) وصيغة المفرد — عشان الجمل تبقى طبيعية ("تكلفة عملية الشراء الواحدة" مش "تكلفة الـمشتريات")
  function pluralOf(key) { return t('res.' + (key || 'generic')); }
  function singularOf(key) { return t('res1.' + (key || 'generic')); }
  // اسم النتيجة مظبوط على العدد: "١ عملية شراء" / "٥ مشتريات" / "١٥ تحويلاً" / "1 purchase" / "3 purchases"
  function countOf(n, key) {
    if (global.I18N) return global.I18N.resultNoun(n, key);
    return n === 1 ? singularOf(key) : pluralOf(key);
  }
  function dayWord(n) { return global.I18N ? global.I18N.noun(n, 'n.day') : ''; }
  // «يوم واحد» / «يومين» / «٣ أيام» — بعد «نحو»
  function daysText(n, fmt) { return n === 1 ? t('dx.act.d1') : (n === 2 ? t('dx.act.d2') : fmt.int(n) + ' ' + dayWord(n)); }
  // عدد + نوع النتيجة جوه جملة («عملية شراء واحدة»، «عمليتي شراء»، «٥ مشتريات»)
  function countText(n, key, fmt) { return global.I18N ? global.I18N.countPhrase(n, key, fmt.int) : fmt.int(n) + ' ' + countOf(n, key); }

  // أسباب الوقوف اللي مش بقصد (المنصة أو الحساب وقّفوا الإعلان مش المعلن) — دي بس اللي بيطلع عليها تنبيه
  // لإعلان متوقف. الوقوف المقصود (إيقاف يدوي، انتهاء المدة، مجدول) مفيش عليه تنبيهات.
  // "تحت المراجعة" مش هنا: غالباً مؤقت وبسبب تعديل عمله المعلن نفسه.
  var UNINTENDED_STOP = {
    rejected: 'critical', 'not-eligible': 'critical',
    issue: 'critical', 'ad-issue': 'critical', 'adset-issue': 'critical', 'campaign-issue': 'critical',
    budget: 'warning'   // ميزانية إجمالية خلصت — كتير بتبقى مخططة، فـ"مهم" مش "عاجل"
  };
  // مشاكل الحساب بتوقف كل إعلاناته مرة واحدة — بتطلع تنبيه واحد على مستوى الحساب مش تنبيه لكل إعلان
  var ACCOUNT_STOP = { account: true, 'account-cap': true };
  function recentSpend(c) { return sum(c.daily || [], RECENT3, TODAY); }

  function sum(arr, from, to) {
    var s = 0;
    for (var i = from; i <= to; i++) s += (arr && arr[i]) || 0;
    return s;
  }
  function any(arr) { return (arr || []).some(function (v) { return v > 0; }); }
  // الأيام المكتملة بس (من غير خانة النهارده): «إعلان مبيعات» و«الحساب بيسجّل مبيعات» على نفس الأيام اللي بيتحكم عليها (التدقيق
  // العميق ٢٤ أكتوبر ٢٠٢٦ — حساب حقيقي: إعلان صرف ٩١ $ في ٧ أيام من غير ولا طلب وجاله النهارده طلبين، فاتحكم عليه «عائد ×٠ أقل من
  // حد الخسارة» كإعلان مبيعات، وإعلان زيه بالظبط من غير طلبات النهارده اتحكم عليه بأقصى التكلفة: حالة واحدة وحكمين)
  function anyDone(arr) { return any((arr || []).slice(0, YESTERDAY + 1)); }
  // احتمال إن العدد يطلع k أو أقل بالصدفة لو المتوقع lambda (توزيع بواسون) — نتائج الإعلانات عدّ،
  // واليوم اللي فيه نتيجتين بدل خمسة ممكن يحصل صدفة. بنستخدمه عشان منطلعش تنبيه على تذبذب طبيعي
  // باللوغاريتم (log-sum-exp): e^(−λ) بيبقى صفر لما المتوقع أكبر من نحو ٧٤٥ (حد الأرقام العشرية)، فالاحتمال كان بيطلع صفر حتى
  // لو العدد قد المتوقع بالظبط (مراجعة المرحلة ٤ — مكانش بيغيّر حكم النهارده لأن كل قاعدة بتشترط فرق كبير قبله، بس خطأ رياضي)
  function poissonAtMost(k, lambda) {
    if (!(lambda > 0)) return 1;
    if (!(k >= 0)) return 0;
    var lt = -lambda, logs = [lt], mx = lt;
    for (var i = 1; i <= k; i++) { lt += Math.log(lambda / i); logs.push(lt); if (lt > mx) mx = lt; }
    var s = 0;
    for (var j = 0; j < logs.length; j++) s += Math.exp(logs[j] - mx);
    return Math.min(1, Math.exp(mx + Math.log(s)));
  }

  // ---------- معيار الدليل لأحكام أداء الإعلان: نفس معيار تشخيص المتجر (diagnosis.js) — المرحلة ٥، ق١ ----------
  // قبل كده: بواسون من غير تشتت، و«عاجل» عند ١٪ لكل إعلان لوحده، وتلات قواعد من غير أي اختبار (خسارة بـ٣ طلبات، وصفر نتائج عند
  // ضعف تكلفة النتيجة في الأسبوع وفي يومين). محاكاة حساب سليم تماماً (tests/private/alert-sim.html — كل إعلاناته بنفس الأداء
  // الحقيقي): ٣٫٩ رسالة عاجلة كاذبة في الأسبوع، و٦٤٪ من الفحوص فيها عاجل كاذب. دلوقتي:
  //  - العدّ بتشتت: نتايج الإعلان بتتذبذب من يوم ليوم أكتر من العدّ العشوائي البحت (McCullagh & Nelder). التشتت بيكبر مع حجم
  //    العدد (السالب ذو الحدين — Cameron & Trivedi): φ = ١ + λ·cv²/الأيام، وcv = ٣٠٪ تذبذب يومي لمعدّل الإعلان (أعلى من افتراض
  //    محاكاة الملخص احتياطاً). أول نسخة كانت φ ثابت ١٫٥ زي الملخص — الملخص أعداده كبيرة (الحساب كله)، والإعلان أعداده صغيرة:
  //    المحاكاة قالت إنه بيوقف الإنذار الكاذب بس بيضيّع الكشف (إعلان تكلفته ×٣ اتكشف في ٩٪ بس). القياس من حساب حقيقي لسه ما اتعملش
  //    (الحسابات المتاحة نتايج إعلاناتها أقل من ٥ في الأسبوع)
  //  - المبيعات = طلبات × قيمة، فتذبذبها × (١ + ٠٫٨²) = ١٫٦٤ — نفس افتراض الملخص لتفاوت قيمة الطلب
  //  - من ٢٥ أكتوبر ٢٠٢٦ الاختبارات دي **مبتحددش مستوى** أي تنبيه بيحمي الفلوس — المستوى من حدود صاحب الحساب نفسه (الحكم بحدودك، تحت في
  //    evaluateAd). صاحب المنتج رفض مستوى «احتمال الصدفة» كله: «لم أفهم سببك ولم أقتنع أبداً… كل هذه الإعلانات عاجلة لأنها خاسرة».
  //    الاختبارات فاضلة بس للفرص (زوّد الميزانية — الصرف على حظ بيصرف فلوس حقيقية)، ولانخفاض/ارتفاع يوم واحد، ولـ«أغلى قليلاً»
  var AD_CV2 = 0.09, VALUE_VAR = 1.64, P_LIKELY = 0.05;
  function phiOf(lambda, days) { return 1 + Math.max(0, lambda || 0) * AD_CV2 / Math.max(1, days || 1); }
  var FATIGUE_X = 2;   // الإرهاق «عاجل» عند ضعف تكلفة النتيجة — تعريف Meta (Creative fatigue)
  // log-gamma (Lanczos — نفس diagnosis.js)
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
  // الدالة البيتا غير الكاملة المنتظمة I_x(a, b)
  function betai(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  // Q(a, x) = الجزء العلوي المنتظم من دالة جاما الناقصة (Numerical Recipes gammq): بواسون P(X ≤ k) = Q(k + 1, λ)، ولأعداد مش صحيحة كمان
  function gammq(a, x) {
    if (!(x > 0)) return 1;
    if (!(a > 0)) return 0;
    var gln = gammaln(a);
    if (x < a + 1) {
      var ap = a, total = 1 / a, del = total;
      for (var n = 1; n <= 500; n++) { ap += 1; del *= x / ap; total += del; if (Math.abs(del) < Math.abs(total) * 3e-14) break; }
      return Math.min(1, Math.max(0, 1 - total * Math.exp(-x + a * Math.log(x) - gln)));
    }
    var FPMIN = 1e-300, b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
    for (var i = 1; i <= 500; i++) {
      var an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      var dl = d * c;
      h *= dl;
      if (Math.abs(dl - 1) < 3e-14) break;
    }
    return Math.min(1, Math.max(0, Math.exp(-x + a * Math.log(x) - gln) * h));
  }
  // الإعلان جاب kAd نتيجة أو أقل في إنفاقه eAd — احتمال ده صدفة لو معدّله زي باقي الحساب (kRest من eRest). ذو الحدين الشرطي بتشتت —
  // نفس اختبار الملخص (diagnosis.js rateTest)، وبيحسب حساب إن معدّل باقي الحساب نفسه تقدير مش رقم مضبوط. ١ = مفيش دليل إنه أسوأ
  // days = عدد الأيام اللي الاختبار عليها (للتشتت)
  function fewerP(kRest, eRest, kAd, eAd, days) {
    if (!(eRest > 0) || !(eAd > 0) || !(kRest >= 0) || !(kAd >= 0)) return 1;
    var K = kRest + kAd, pi0 = eAd / (eRest + eAd);
    if (!(K > 0) || kAd / K >= pi0) return 1;
    var phi = phiOf(K * pi0, days), Ks = K / phi, ks = kAd / phi;
    return (Ks - ks) <= 1e-9 ? 1 : betai(Ks - ks, ks + 1, 1 - pi0);
  }
  // العكس: جاب kAd أو أكتر (فرصة) — احتمال ده صدفة لو معدّله زي الباقي
  function moreP(kRest, eRest, kAd, eAd, days) {
    if (!(eRest > 0) || !(eAd > 0) || !(kRest >= 0) || !(kAd > 0)) return 1;
    var K = kRest + kAd, pi0 = eAd / (eRest + eAd);
    if (kAd / K <= pi0) return 1;
    var phi = phiOf(K * pi0, days);
    return betai(kAd / phi, (K - kAd) / phi + 1, pi0);
  }
  // المبيعات = عدد طلبات عشوائي × قيمة كل طلب عشوائية (بواسون مركّب مع جاما — Tweedie / Jørgensen ١٩٨٧، النموذج المعروف للمطالبات
  // والإيرادات): العدد سالب ذو الحدين بمتوسط lam وتشتت phi، وقيمة الطلب جاما بمتوسط mu ومعامل اختلاف ٠٫٨ (نفس افتراض الملخص).
  // مجموع n طلب = جاما(n·K)، فاحتمال المبيعات s أو أقل = Σ P(N = n) × P(جاما(nK) ≤ s). أدق من أي تقريب في الطلبات القليلة:
  // أسوأ إعلان في حساب حقيقي (٥٠٩ ر.س وطلب واحد بـ٣٢٩، والحد ×٥ — المتوقع على الحد ٧٫٧ طلب) احتماله الدقيق نحو ٠٫٦٪، والتقريبات
  // اللي قبله (كل المبيعات بواسون مضخّم، أو لوغاريتم العائد ÷ عدد الطلبات) كانت بتقول ٤–٦٪ — معلومة عدد الطلبات بتضيع فيهم
  var VALUE_K = 1 / 0.64;   // ١ ÷ معامل الاختلاف² (٠٫٨)
  function compoundTail(s, lam, mu, phi, below) {
    if (!(lam > 0) || !(mu > 0)) return 1;
    var x = Math.max(0, s) * VALUE_K / mu, v = lam * phi, sd = Math.sqrt(v);
    var lo = Math.max(0, Math.floor(lam - 12 * sd - 5)), hi = Math.ceil(lam + 12 * sd + 15), total = 0;
    var nb = phi > 1 + 1e-9, r = nb ? lam / (phi - 1) : 0, lq = nb ? Math.log(1 / phi) : 0, l1q = nb ? Math.log(1 - 1 / phi) : 0, lgr = nb ? gammaln(r) : 0;
    for (var n = lo; n <= hi; n++) {
      var lp = nb ? gammaln(n + r) - lgr - gammaln(n + 1) + r * lq + n * l1q : -lam + (n ? n * Math.log(lam) : 0) - gammaln(n + 1);
      var pn = Math.exp(lp);
      if (!(pn > 0)) continue;
      // P(مجموع n طلب ≤ s) — صفر طلبات = مبيعات صفر بالظبط
      var cdf = n === 0 ? 1 : (x > 0 ? 1 - gammq(n * VALUE_K, x) : 0);
      total += pn * (below ? cdf : (n === 0 ? 0 : 1 - cdf));
    }
    return Math.min(1, Math.max(0, total));
  }
  // العائد (المبيعات ÷ الإنفاق) مقابل حد ثابت bar (حد الخسارة أو المستهدف): احتمال الصدفة لو العائد الحقيقي على الحد بالظبط.
  // قيمة الطلب على الحد: قيمة طلب الإعلان نفسه مقرّبة لقيمة الطلب في الحساب بـ٣ طلبات افتراضية (تقليص بايزي تجريبي) — طلب واحد
  // مبيكفيش يحدد قيمة طلب الإعلان، و١٨ طلب بيكفوا. المتوقع على الحد = الإنفاق × الحد ÷ القيمة دي. dir = −١ (أقل) أو ١ (أكتر)
  function roasP(sales, spend, bar, orders, aovRef, days, dir) {
    if (!(spend > 0) || !(bar > 0)) return 1;
    var s = Math.max(0, sales), ratio = s / (spend * bar);
    if (dir < 0 ? !(ratio < 1) : !(ratio > 1)) return 1;
    var n = orders > 0 && s > 0 ? orders : 0;
    var mu = aovRef > 0 ? (s + 3 * aovRef) / (n + 3) : (n > 0 ? s / n : 0);
    if (!(mu > 0)) return 1;
    var lam = spend * bar / mu;
    return compoundTail(s, lam, mu, phiOf(lam, days), dir < 0);
  }
  function salesBelowP(sales, spend, bar, orders, aovRef, days) { return roasP(sales, spend, bar, orders, aovRef, days, -1); }
  function salesAboveP(sales, spend, bar, orders, aovRef, days) { return roasP(sales, spend, bar, orders, aovRef, days, 1); }
  // عدد k أو أقل لو المتوقع lambda — بالتشتت (بديل poissonAtMost لأحكام الأداء)
  function countBelowP(k, lambda, days) { var phi = phiOf(lambda, days); return lambda > 0 && k < lambda ? gammq(k / phi + 1, lambda / phi) : 1; }
  // إعدادات الحساب كاملة: القيمة المحفوظة لو صحيحة (جوه حدودها)، وإلا قيمة البداية. المستهدف وحد الخسارة null لو مش محفوظين
  // (حكم الربح بيستنى). والتكلفة المقبولة لكل نتيجة (مراجعة الإعدادات — قرار صاحب المنتج): maxCost لكل نوع نتيجة في الحساب،
  // وcampaignMaxCost لكل حملة (متجر بفئات أسعار مختلفة: تكلفة الطلب أو المحادثة بتختلف من حملة لحملة)
  function costMap(v) {
    var out = {};
    if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
    Object.keys(v).slice(0, 500).forEach(function (k) {
      var n = v[k];
      if (k.length <= 64 && typeof n === 'number' && isFinite(n) && n > 0 && n <= 1e9) out[k] = n;
    });
    return out;
  }
  function mergeSettings(custom) {
    var s = {};
    var valid = function (k, v) {
      var lim = SETTINGS_LIMITS[k];
      return typeof v === 'number' && isFinite(v) && v >= 0 && (!lim || (v >= lim.min - 1e-9 && v <= lim.max + 1e-9));
    };
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) { var v = custom && custom[k]; s[k] = valid(k, v) ? v : DEFAULT_SETTINGS[k]; });
    GOAL_KEYS.forEach(function (k) { var v = custom && custom[k]; s[k] = valid(k, v) && v > 0 ? v : null; });
    s.maxCost = costMap(custom && custom.maxCost);
    s.campaignMaxCost = costMap(custom && custom.campaignMaxCost);
    return s;
  }

  // إحصائيات كل حساب (source) — متوسط تكلفة النتيجة محسوب لكل نوع نتيجة على حدة،
  // لأن مقارنة تكلفة "محادثة" بتكلفة "شراء" مقارنة مضلّلة
  function accountStats(ads) {
    var byLabel = {}, byCampaign = {}, byAdset = {}, purchAds = [];
    var hasSales = false, spendByDay = zeros(WINDOW), resultsByDay = zeros(WINDOW);
    var total7 = 0, activeCount = 0, spendingAds = 0, purchSpendW = 0, purchSalesW = 0;
    ads.forEach(function (c) {
      if ((c.spend || 0) > 0) spendingAds++;
      for (var i = 0; i < WINDOW; i++) {
        spendByDay[i] += (c.daily && c.daily[i]) || 0;
        resultsByDay[i] += (c.dailyResults && c.dailyResults[i]) || 0;
      }
      total7 += c.spend || 0;
      if (c.active) activeCount++;
      if (anyDone(c.dailySales)) hasSales = true;
      if (c.campaignId) (byCampaign[c.campaignId] = byCampaign[c.campaignId] || []).push(c);
      // إعلانات كل مجموعة إعلانية — عشان نعرف لو اتضاف فيها إعلان جديد (المرحلة ٥ ق٦)
      if (c.adsetId) (byAdset[c.adsetId] = byAdset[c.adsetId] || []).push(c);
      // عائد إعلانات الشراء في الأيام المكتملة (من غير النهارده) — للمقارنة جوه تقييم كل إعلان «في الفترة نفسها»
      if (anyDone(c.dailySales) || c.resultKey === 'purchase' || c.resultKey === 'conversion') {
        purchSpendW += sum(c.daily || [], 0, YESTERDAY); purchSalesW += sum(c.dailySales || [], 0, YESTERDAY);
        purchAds.push(c);
      }
      if (c.results == null || !c.resultKey) return;
      var g = byLabel[c.resultKey] || (byLabel[c.resultKey] = { spend: 0, results: 0, adsWithResults: 0, ads: [] });
      g.spend += c.spend || 0;
      g.results += c.results || 0;
      if (c.results > 0) g.adsWithResults++;
      g.ads.push(c);
    });
    Object.keys(byLabel).forEach(function (k) {
      var g = byLabel[k];
      g.avgCpr = g.results > 0 ? g.spend / g.results : null;
    });
    // النتائج بأنواعها في رقم واحد بوحدة واحدة: كل نتيجة بمتوسط تكلفة نوعها في الحساب (محادثة بـ٢ وعميل محتمل بـ٥٠) — جمع
    // العدد نفسه (محادثات + عملاء محتملين + سوايب) رقم ملوش معنى، والنوع الرخيص الكتير كان بيغطي على الغالي (مراجعة المرحلة ٤
    // ر٦٩ — Kimball & Ross: مقاييس موحّدة قبل الجمع). حساب نوعه واحد = نفس النسب بالظبط
    var typeCount = Object.keys(byLabel).filter(function (k) { return byLabel[k].results > 0; }).length;
    var equivByDay = zeros(WINDOW);
    Object.keys(byLabel).forEach(function (k) {
      var g = byLabel[k];
      if (!g.avgCpr) return;
      g.ads.forEach(function (c) { for (var i = 0; i < WINDOW; i++) equivByDay[i] += ((c.dailyResults && c.dailyResults[i]) || 0) * g.avgCpr; });
    });
    // متوسط صرف الإعلان الواحد في يومين — بنستخدمه كبديل لما الحساب ملوش متوسط تكلفة نتيجة أصلاً
    // (مثلاً حساب كل إعلاناته لسه مجابتش ولا نتيجة) — من غيره كان أهم تنبيه بيختفي تماماً
    var spend2All = spendByDay[DAY_BEFORE] + spendByDay[YESTERDAY];
    var avgAdSpend2 = spendingAds > 0 ? spend2All / spendingAds : 0;
    return {
      byLabel: byLabel, hasSales: hasSales, spendByDay: spendByDay, resultsByDay: resultsByDay, equivByDay: equivByDay, mixedTypes: typeCount > 1,
      total7: total7, activeCount: activeCount, avgAdSpend2: avgAdSpend2, byCampaign: byCampaign, byAdset: byAdset,
      roasW: hasSales && purchSpendW > 0 ? purchSalesW / purchSpendW : null, purchSpendW: purchSpendW,
      // نفس المتوسطات على أيام معيّنة بس (المرحلة ٤، مراجعة ١٧ أكتوبر ٢٠٢٦ — تعريف واحد للمقياس: Kimball & Ross، «conformed facts»):
      // الإعلان المتعدَّل بيتحكم عليه بالأيام اللي بعد التعديل، فمتوسط الحساب اللي بيتقارن بيه لازم يبقى على نفس الأيام —
      // قبل كده تكلفته «خلال آخر ٣ أيام» كانت بتتقارن بمتوسط الحساب في ٧ أيام والنص بيقول «في الفترة نفسها»
      // camp = حملة واحدة بس (مرجع المقارنة جوه الحملة — evaluateAd)
      labelIn: function (key, from, to, camp) {
        var g = byLabel[key];
        if (!g) return null;
        var o = { spend: 0, results: 0, adsWithResults: 0 };
        g.ads.forEach(function (c) {
          if (camp && c.campaignId !== camp) return;
          var r = sum(c.dailyResults || [], from, to);
          o.spend += sum(c.daily || [], from, to); o.results += r;
          if (r > 0) o.adsWithResults++;
        });
        o.avgCpr = o.results > 0 ? o.spend / o.results : null;
        return o;
      },
      purchIn: function (from, to) {
        var o = { spend: 0, sales: 0, results: 0 }, valued = { sales: 0, results: 0 };
        purchAds.forEach(function (c) {
          var sa = sum(c.dailySales || [], from, to), re = sum(c.dailyResults || [], from, to);
          o.spend += sum(c.daily || [], from, to); o.sales += sa; o.results += re;
          if (anyDone(c.dailySales)) { valued.sales += sa; valued.results += re; }
        });
        o.roas = hasSales && o.spend > 0 ? o.sales / o.spend : null;
        // متوسط قيمة الطلب — مرجع دليل الخسارة (salesBelowP): من الإعلانات اللي بتسجّل قيمة مبيعات بس. إعلان شراء من غير قيمة
        // (تتبّع القيمة ناقص) كانت طلباته بتدخل المقام من غير مبيعاتها، فالمتوسط يطلع أقل من الحقيقة (المرحلة ٥)
        o.aov = valued.results > 0 && valued.sales > 0 ? valued.sales / valued.results : null;
        return o;
      }
    };
  }

  // المنصة نقلت إنفاق الإعلان ده أمس لإعلانات تانية في نفس الحملة (زادت بنص اللي نقص منه على الأقل) —
  // ده اختيار المنصة في توزيع الميزانية مش مشكلة في الإعلان نفسه، فبيبقى «للعلم» بس
  function spendShifted(c, acc, prevAvg) {
    var peers = (c.campaignId && acc.byCampaign && acc.byCampaign[c.campaignId]) || [];
    var lost = prevAvg - ((c.daily || [])[YESTERDAY] || 0), gained = 0;
    if (!(lost > 0)) return false;
    peers.forEach(function (o) {
      if (o === c || !o.active) return;
      var d = o.daily || [];
      gained += Math.max(0, (d[YESTERDAY] || 0) - sum(d, 0, DAY_BEFORE) / (DAY_BEFORE + 1));
    });
    return gained >= lost * 0.5;
  }

  // amount: المبلغ المرتبط بالتنبيه (للترتيب). code: معرّف داخلي للتنبيه.
  // atRisk: المبلغ ده بيتحسب ضمن "الميزانية المعرّضة للهدر" (صرف بدون نتائج أو خسارة مباشرة بس)
  function makeIssue(level, metrics, title, detail, advice, amount, code, atRisk) {
    return { level: level, metrics: metrics, title: title, detail: detail, advice: advice, amount: amount || 0, code: code || null, atRisk: !!atRisk };
  }
  // الأثر بالفلوس (ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦: «يحتاج انتباهك الآن» مبيبيّنش التأثير المالي من برّه): kind = نوع المبلغ
  // (waste = إنفاق من غير ولا نتيجة، loss = الإنفاق اللي المبيعات مغطّتهوش، extra = تكلفة زيادة عن متوسط الحساب، spike = زيادة
  // أمس عن المعتاد)، v = المبلغ (= amount)، daily = اللي بيتصرف بنفس الشكل كل يوم دلوقتي (متوسط آخر أيام مكتملة) — «هدر يمكن إيقافه»
  function withMoney(i, kind, daily) { i.money = { kind: kind, v: i.amount, daily: daily > 0 ? daily : 0 }; return i; }

  function evaluateAd(c, acc, s, fmt) {
    var issues = [];
    var name = t('al.name', { name: c.offer || c.headline || c.id });
    var cur = c.currency;
    var money = function (n) { return fmt.money(n, cur); };
    // الجمع هنا بييجي بعد «أي» («دون أي عملاء محتملين») — فبنستخدم الصيغة المجرورة لو موجودة
    var label = global.I18N ? global.I18N.resultAny(c.resultKey) : pluralOf(c.resultKey);
    var one = singularOf(c.resultKey);
    var group = c.resultKey ? acc.byLabel[c.resultKey] : null;
    var age = c.daysAgo;
    var learning = age != null && age < s.learningDays;
    // إعلان جديد اتضاف لنفس المجموعة الإعلانية (المرحلة ٥ ق٦) — Meta: ده «تعديل كبير» بيرجّع المجموعة كلها لمرحلة التعلّم
    // (مركز المساعدة: About the learning phase / Significant edits)، فأرقام إخواته في الأيام الأولى بتبقى غير مستقرة:
    // المنصة بتوزّع الإنفاق من أول وجديد. مش بنمنع الحكم زي التعديل على الإعلان نفسه (إعلان رابح من شهرين مش عايز يرجع
    // «لم يُحكم بعد» لأن جنبه إعلان جديد)، بس بنمنع التصعيد للعاجل في القواعد اللي أساسها التوزيع، وبنقول السبب في أساس الحكم
    var newSib = null;
    ((c.adsetId && acc.byAdset && acc.byAdset[c.adsetId]) || []).forEach(function (o) {
      if (o === c || o.daysAgo == null || o.daysAgo >= s.learningDays) return;
      if (newSib == null || o.daysAgo < newSib) newSib = o.daysAgo;
    });
    var reLearn = newSib != null && !learning;
    var daily = c.daily || [], results = c.dailyResults || [], sales = c.dailySales || [];
    // آخر تعديل على الإعلان أو مجموعته أو حملته جوه النافذة (ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦ — meta.js loadAdEdits):
    // أقل من ٣ أيام مكتملة بعده = الحكم بيستنى (إلا الهدر الواضح — العاجل). ٣ أيام أو أكتر = الحكم على الأيام اللي بعده بس
    var edit = null;
    (c.edits || []).forEach(function (e) {
      var i = (c.dailyDates || []).indexOf(e.date);
      if (i >= 0 && i <= TODAY) edit = { e: e, idx: i };   // مترتبة بالوقت — الأخير يكسب
    });
    var editFresh = !!edit && YESTERDAY - edit.idx < 3;
    var weekStart = edit && !editFresh ? edit.idx + 1 : 0;
    WEEK_AD = weekStart ? (fmt && fmt.int ? fmt.int(YESTERDAY - weekStart + 1) : String(YESTERDAY - weekStart + 1)) : null;
    // إعلانات الحساب من نفس نوع النتيجة على نفس أيام الحكم (كل الأسبوع، أو اللي بعد آخر تعديل) — المقارنة «في الفترة نفسها»
    // لازم تبقى فعلاً على نفس الأيام (مراجعة المرحلة ٤، ١٧ أكتوبر ٢٠٢٦: إعلان اتحكم عليه بـ٣ أيام بعد تعديله تكلفته فيهم ٥٠ وطلع
    // عليه «تكلفة مرتفعة ١٤٤» من الأسبوع كله، وسبب الحكم تحته بيقول إن الحكم على الأيام اللي بعد التعديل بس)
    // المرجع جوه الحملة نفسها لو باقيها جاب ٣ نتائج على الأقل من نفس النوع في أيام الحكم، وإلا الحساب كله (التدقيق العميق ٢٤ أكتوبر
    // ٢٠٢٦ — التقسيم لطبقات متجانسة: Fisher، ومفارقة سيمبسون). الحملة في الغالب منتج أو عرض أو سوق واحد بتكلفة نتيجة خاصة بيه
    // (ملاحظة صاحب المنتج: «متجر يبيع منتجات بفئات أسعار مختلفة، فتكلفة الطلب ستختلف كثيراً»). حساب حقيقي: تكلفة المحادثة بين حملات
    // الحساب الواحد من ٠٫٩٦ لـ٨٫٣٩ $ — المقارنة بمتوسط الحساب طلّعت «أعلى بنسبة ٧٦٪» على إعلان أرخص من حملته، وخبّت إعلان أغلى ٢٫٨
    // مرة من حملته الرخيصة. المحاكاة (tests/private/hier-sim.html): ٢٢٪ من الإعلانات السليمة عليها تنبيه، و٥٩٪ في الحملة الأغلى
    // تجميع جزئي (النماذج الهرمية — Gelman & Hill): الحملة مرجع بس لو باقيها مختلف فعلاً عن باقي الحساب (احتمال الصدفة في الفرق أقل
    // من ١٠٪ في الاتجاهين)، وإلا الحساب كله بقوته الكاملة — حساب بيقسّم نفس المنتج على كذا حملة كان هيخسر نص قدرة الكشف من غير
    // سبب (المحاكاة: إعلان ضعف التكلفة اتكشف ٨٤ مرة من ٣٠٠ بدل ١٥٥)
    var resW0 = sum(results, weekStart, YESTERDAY), spendW0 = sum(daily, weekStart, YESTERDAY);
    var accPeer = weekStart && c.resultKey ? acc.labelIn(c.resultKey, weekStart, YESTERDAY) : group;
    var campPeer = c.resultKey && c.campaignId ? acc.labelIn(c.resultKey, weekStart, YESTERDAY, c.campaignId) : null;
    var campRef = false;
    if (campPeer && accPeer && campPeer.results - resW0 >= 3) {
      var kC = campPeer.results - resW0, eC = campPeer.spend - spendW0, kO = accPeer.results - campPeer.results, eO = accPeer.spend - campPeer.spend;
      var dJ = YESTERDAY - weekStart + 1;
      campRef = kO >= 0 && eO > 0 && eC > 0 && 2 * Math.min(fewerP(kO, eO, kC, eC, dJ), moreP(kO, eO, kC, eC, dJ)) < 0.1;
    }
    REF_CAMP = campRef;
    var refCamp = campRef ? c.campaignId : null;
    var peer = campRef ? campPeer : accPeer;
    // المتوسط له معنى لو فيه إعلانين جابوا نتائج من النوع ده، أو ٣ نتائج على الأقل حتى لو من إعلان واحد.
    // قبل كده إعلان رابح واحد في الحساب كان بيلغي المقارنة كلها، فإعلانات صرفت بالآلاف من غير ولا طلب طلعت «جيد»
    var avgCpr = peer && peer.results > 0 && (peer.adsWithResults >= 2 || peer.results >= 3) ? peer.avgCpr : null;
    var spendY = daily[YESTERDAY] || 0, spend2 = sum(daily, DAY_BEFORE, YESTERDAY);
    var resY = results[YESTERDAY] || 0, res2 = sum(results, DAY_BEFORE, YESTERDAY);
    // العائد وفرص الزيادة بتتقاس على آخر ٣ أيام مكتملة مش أمس لوحده: أرقام أمس لسه هتزيد لما مشتريات متأخرة تتسجّل
    // (المنصات بتحدّث التحويلات المتأخرة لأيام)، والإعلان اللي مشترياته قليلة وغالية ممكن يغيب يوم كامل ويرجع — تقييم يوم
    // واحد كان بيطلع «عاجل» على إعلان عائده في الأسبوع ممتاز
    var spend3 = sum(daily, RECENT3, YESTERDAY), res3 = sum(results, RECENT3, YESTERDAY), sales3 = sum(sales, RECENT3, YESTERDAY);
    // الأسبوع = الأيام المكتملة بس (من غير النهارده): أساس الحكم على الإعلان كله، مش آخر يومين بس — أو اللي بعد آخر تعديل
    var spendW = sum(daily, weekStart, YESTERDAY), resW = sum(results, weekStart, YESTERDAY), salesW = sum(sales, weekStart, YESTERDAY);
    // إعلانات تانية (غير ده) جابت نتائج من نفس النوع في نفس الأيام — من غيرها مفيش حاجة نقارن تكلفته بيها
    var othersHave = !!peer && peer.adsWithResults - (resW > 0 ? 1 : 0) > 0;
    // تكلفة النتيجة بمعدل الإعلان نفسه في أيام الحكم — مقياس «هل الصرف ده كفاية نحكم عليه؟» وأساس قاعدة التكلفة
    var ownCpr = resW > 0 && spendW > 0 ? spendW / resW : null;
    // المتوسط بيتقسم على الأيام اللي الإعلان كان فيها موجود فعلاً — إعلان عمره ٣ أيام
    // كان متوسطه بيتقسم على كل الأيام فيطلع أقل من الحقيقة وتنبيه "وصوله ضعيف" ميظهرش
    // بعد تعديل: المعتاد = الأيام اللي بعده بس (رفع الميزانية مش «صرف أعلى من المعتاد»)
    var historyDays = Math.min(age != null ? Math.max(1, Math.min(DAY_BEFORE + 1, age - 1)) : DAY_BEFORE + 1, Math.max(1, DAY_BEFORE + 1 - weekStart));
    var prevSpendAvg = sum(daily, weekStart, DAY_BEFORE) / historyDays;
    // إعلان مبيعات بيسجّل قيمة الطلبات: الحكم بالربح الأول (العائد مقابل المستهدف وحد الخسارة)، والمقارنة بإعلانات
    // الحساب في الفترة نفسها شرح جنبه مش أساس الحكم (قرار صاحب المنتج ٧ أكتوبر ٢٠٢٦ — الفترات بتختلف: عروض، رواتب، موسم)
    var profitAd = acc.hasSales && anyDone(sales);
    var upperFunnel = !profitAd && !!UPPER_FUNNEL[c.resultKey || 'generic'];   // نتيجة أعلى المسار (فوق — UPPER_FUNNEL)
    // المستهدف وحد الخسارة محددين للحساب؟ لو لأ: حكم الربح بيستنى (pend «noTarget») وتنبيهات الربح مبتطلعش، والباقي (هدر،
    // توصيل، تكرار) شغّال (قرار صاحب المنتج ٢٤ أكتوبر). كل مقارنة بالمستهدف لازم تمر من هنا: «رقم ≥ قيمة فاضية» = صح في JavaScript
    var hasGoal = s.roasTarget > 0 && s.roasBreakEven > 0;
    // أقصى تكلفة مقبولة لكل نتيجة (قرار صاحب المنتج ٢٤ أكتوبر): حملته أولاً، وإلا نوع نتيجته في الحساب. ومن ٢٥ أكتوبر لإعلان المبيعات
    // كمان (صاحب المنتج: «عاجلة لأنها خاسرة… أو تكلفة الطلب أعلى من الحد الأقصى») — كان إعلان المبيعات بيتحكم عليه بالعائد بس، فإعلان
    // تكلفة طلبه ٣٨ $ والحد ٢٠ $ ملوش أي تنبيه تكلفة. الخطين بيتطبّقوا مع بعض، وأي واحد فيهم بيكفي
    var maxCost = c.results != null
      ? ((c.campaignId && s.campaignMaxCost && s.campaignMaxCost[c.campaignId]) || (c.resultKey && s.maxCost && s.maxCost[c.resultKey]) || null) : null;
    var maxScope = maxCost && c.campaignId && s.campaignMaxCost && s.campaignMaxCost[c.campaignId] ? 'camp' : 'acc';
    // عائد إعلانات المبيعات في الحساب على نفس أيام الحكم
    var purch = weekStart ? acc.purchIn(weekStart, YESTERDAY) : { spend: acc.purchSpendW, roas: acc.roasW };
    // الإعلان ده هو أغلب إنفاق إعلانات المبيعات في الحساب (٩٠٪ أو أكتر): «متوسط حسابك» هو تقريباً الإعلان نفسه — المقارنة بيه
    // كانت بتطلع «×٧٫٦ ومتوسط حسابك ×٧٫٦» و«أفضل من متوسط حسابك» لإعلان بيقارَن بنفسه (حساب فيه إعلان مبيعات واحد)
    var selfAcc = profitAd && purch.spend > 0 && spendW >= purch.spend * 0.9;
    var roasW = spendW > 0 ? salesW / spendW : null;
    // ---- الدليل (ق١ — المرحلة ٥): كل حكم أداء باحتمال الصدفة بمعيار الملخص (fewerP / salesBelowP فوق) ----
    // المرجع للعدّ: باقي الحساب (من غير الإعلان ده) بنفس نوع النتيجة على أيام الحكم نفسها
    var restK = peer ? Math.max(0, peer.results - resW) : 0, restE = peer ? Math.max(0, peer.spend - spendW) : 0;
    // المرجع للمقارنة وللأرقام في النص = متوسط باقي إعلاناتك (المراجعة الثانية للمرحلة ٥ — «ترك واحد» leave-one-out، نفس مرجع
    // اختبار الدليل fewerP). قبل كده متوسط الحساب كله والإعلان نفسه جوّاه: إعلان واخد نص إنفاق نوعه كان بيتقارن بمتوسط نصه هو —
    // النسبة الظاهرة = الحصة + الفرق الحقيقي × (١ − الحصة)، فإعلان أغلى ١٫٦ مرة وحصته ٤٠٪ كان بيبان ١٫٣٦ (مفيش تنبيه خالص)،
    // وإعلان صفر نتائج «كان يكفي لنحو ٢٩» والحقيقي ٩٨ (حساب حقيقي ٢٤ أكتوبر: إعلانين في مشتريات Meta واخدين ٥٤٪ و٤٥٪ من إنفاقها).
    // avgCpr بيفضل شرط وجود مرجع زي ما هو، ولو باقي الإعلانات مجابتش ولا نتيجة بيفضل هو (ومفيش مقارنة أصلاً — othersHave)
    var refCpr = avgCpr ? (restK > 0 && restE > 0 ? restE / restK : avgCpr) : null;
    var evidenceCpr = ownCpr || avgCpr;
    // كفاية نحكم على الأسبوع: ٣ نتائج، أو إنفاق يكفي لـ٣ بمتوسط باقي الإعلانات — للفرص بس (زوّد الميزانية)
    var weekEvidence = resW >= 3 || !!(avgCpr && spendW >= 3 * avgCpr);
    var judgedDays = YESTERDAY - weekStart + 1;
    // تكلفة النتيجة أعلى من باقي الحساب: احتمال الصدفة في أيام الحكم — لـ«أغلى قليلاً» (حالة رمادية مش تنبيه) بس
    var pFew = c.results != null && avgCpr && spendW > 0 ? fewerP(restK, restE, resW, spendW, judgedDays) : 1;
    // إعلان شراء في حساب بيسجّل قيمة المبيعات وليه مستهدف — حتى لو مجابش ولا طلب في الأسبوع (حكمه بخطوط المبيعات نفسها)
    var salesLike = acc.hasSales && hasGoal && (profitAd || c.resultKey === 'purchase' || c.resultKey === 'conversion');
    // قيمة الطلب المرجعية للمبيعات: إعلانات المبيعات في الحساب على أيام الحكم، ولو مفيش: قيمة طلب الإعلان نفسه
    var aovFor = function (from) { var a0 = acc.purchIn(from, YESTERDAY).aov; return a0 || (resW > 0 && salesW > 0 ? salesW / resW : null); };
    var aovW = salesLike ? aovFor(weekStart) : null;

    // ---- الحكم بحدودك (صاحب المنتج ٢٥ أكتوبر ٢٠٢٦: «لم أفهم سببك ولم أقتنع أبداً… كل هذه الإعلانات عاجلة لأنها خاسرة: العائد أقل من
    //      المطلوب، أو تكلفة الطلب أعلى من الحد الأقصى، أو مر عليها ٣ أيام بدون أي مشتريات») ----
    // كان مستوى التنبيه باحتمال الصدفة: إعلان عائده ×٤٫٨ وحد الخسارة ×١٥ كان «أقل من المستهدف — مهم» لأن ٥ طلبات «ممكن تكون صدفة»،
    // و×٠٫٢ بطلب واحد «مهم». ده عكس قرار صاحب المنتج نفسه في الملخص (١٠ أكتوبر): «حجم الحركة يحدد الانتباه، واليقين يحدد الصياغة
    // بس». دلوقتي الرقم المقاس على أيام الحكم (نفس أرقام الكارت) مقابل خطوط الإعدادات هو اللي بيحدد المستوى، بشرط واحد بالفلوس:
    // R = التكلفة المسموحة لنتيجة واحدة —
    //  ١) أقصى تكلفة حددتها للحملة أو لنوع النتيجة
    //  ٢) إعلان المبيعات: تكلفة الطلب المستهدفة = متوسط قيمة الطلب في الحساب ÷ العائد المستهدف — هي «التكلفة المستهدفة» اللي قاعدة
    //     الإيقاف المعروفة بتتقاس بيها. جرّبنا قبلها الأقل من (قيمة الطلب ÷ حد الخسارة) و(التكلفة المعتادة): في حساب سليم تماماً (العائد
    //     الحقيقي مرة ونص المستهدف) التكلفة المعتادة أقل من المستهدفة بالتلت، فضعفها = طلبين متوقعين بس، و«٣ أيام دون طلب» كانت
    //     بتطلع عاجل على ٣٫٣٪ من الإعلانات السليمة كل فحص (٢٫٨ رسالة عاجلة كاذبة في الأسبوع — tests/private/alert-sim.html)
    //  ٣) غير كده: تكلفة النتيجة المعتادة في باقي إعلاناتك (حملته أو حسابك) — مفيش مستهدف نقيس بيه
    // الحكم بيبدأ بعد إنفاق R، و«عاجل» محتاج ضعفه — قاعدة الإيقاف المعروفة عند مشتري الإعلانات (١٫٥–٢ ضعف التكلفة المستهدفة خلال
    // ٣ أيام من غير شراء)، وقواعد Meta الآلية نفسها (شرط المقياس مع شرط إنفاق)
    var usualOne = othersHave && refCpr ? refCpr : null;   // تكلفة النتيجة عند باقي إعلاناتك — مش الإعلان نفسه
    var targetOne = salesLike && aovW ? aovW / s.roasTarget : null;
    var refKind = maxCost ? 'max' : (targetOne ? 'target' : (usualOne ? 'usual' : null));
    var R = refKind === 'max' ? maxCost : (refKind === 'target' ? targetOne : usualOne);
    // الحكم الكامل (الخط الأصفر و«جيد»): نتيجتين، أو إنفاق ضعف R — إعلان جاب ١٨ طلب بعائد ×١٠٫٥ وحد الخسارة ×١ (المسموح للطلب =
    // قيمته كلها) مكانش هيتحكم عليه قبل ضعف قيمة الطلب. و«عاجل» على خط أحمر محتاج ضعف R دايماً (redLv وzeroLv تحت)
    var judgedW = !!R && spendW >= R && (resW >= 2 || spendW >= 2 * R);
    // جملة المرجع في نص الإنفاق دون نتائج: كان الإنفاق ده يكفي لكام نتيجة بالتكلفة المسموحة
    var refSpent = function (sp) {
      return refKind ? t('ref.spent.' + refKind, { one: one, r: money(R), avg: money(R), aov: aovW ? money(aovW) : '', target: fmt.num(s.roasTarget || 0),
        expPhrase: countText(Math.round(Math.max(1, sp / R)), c.resultKey, fmt) }) : '';
    };
    // العائد جنب حد بيتقارن بيه في نفس الجملة: لو التقريب لخانة واحدة بيخلّيه زي الحد بالظبط بنكتبه بخانتين — «×٥، أقل من
    // حد الخسارة (×٥)» كانت بتطلع لعائد ×٤٫٩٦ (مراجعة المرحلة ٤ ر٧٥). الحد = حد الخسارة لو تحته، وإلا المستهدف
    var num2 = fmt.num2 || fmt.num;
    var rx = function (x, ref) { return ref != null && x != null && fmt.num(x) === fmt.num(ref) && Math.abs(x - ref) > 1e-9 ? num2(x) : fmt.num(x); };
    var rr = function (r) { return rx(r, r < s.roasBreakEven ? s.roasBreakEven : s.roasTarget); };
    var roasLabel = function (r) {
      return fmt.currencyLabel(cur) ? t('al.roasText', { one: fmt.int(1), cur: fmt.currencyLabel(cur), roas: rr(r) }) : t('al.roasTextNoCur', { roas: rr(r) });
    };

    // حد الإعلان الصغير: الإعلان "مهم كفاية" للتنبيه لو تحقق أي شرط من الاتنين —
    //  - صرفه في آخر ٧ أيام ≥ نسبة من صرف الحساب كله في نفس الفترة
    //  - أو صرفه ≥ متوسط تكلفة النتيجة الواحدة في الحساب (لنفس نوع النتيجة)
    // غير كده ملاحظاته بتفضل ظاهرة في تفاصيله، بس كـ"للعلم" من غير ما تبقى تنبيه أو تلوّن الإعلان
    var adSpend = c.spend || 0;
    var accountCpr = group && group.results > 0 ? group.avgCpr : null;
    // الشرط التاني بيحتاج كمان ربع النسبة على الأقل: في نتائج رخيصة جداً (الوصول، المشاهدات) «تكلفة نتيجة واحدة»
    // أقل من سنت، فكل إعلان صغير كان بيبقى «مهم» — إعلانات بـ١ في الأسبوع (٠٫١٪ من الحساب) كانت بتطلع تنبيهات
    var share = acc.total7 > 0 ? adSpend / acc.total7 : 0;
    // ومن ٢٥ أكتوبر: صرف التكلفة المسموحة لنتيجة واحدة (R) بيكفي برضه — بحدود صاحب الحساب نفسه (إعلان صرف ٣٥ $ والحد ٢٠ $ للطلب)
    var oneCost = R || accountCpr;
    var material = share >= s.minSpendShare || (oneCost != null && adSpend >= oneCost && share >= s.minSpendShare / 4);
    // «عاجل» للإعلان المؤثر الشغّال اللي خلّص التعلّم وصرف ضعف R على الأقل في أيام القاعدة، وتخطّى خط أحمر من خطوط الإعدادات —
    // بين R وضعفه «مهم» (قراءة مبكرة)، وقبل R «لم يُحكم بعد» بالمبلغ اللي محتاجه
    var urgentEligible = material && c.active && !learning && c.results != null;
    // «الفرق أكبر من طلب واحد» (قاعدة لابلاس للتتابع — نزوّد مشاهدة واحدة قبل الحكم): الخط الأحمر بنتائج «عاجل» بس لو الإعلان يفضل
    // وراه حتى لو جاله طلب كمان بمتوسط قيمة طلباتك (أو نتيجة كمان في التكلفة)، وقريب منه كده «مهم» بالسبب ده. والخط الأصفر (تحت
    // المستهدف) بيظهر بس لو الفرق أكبر من طلب. محاكاة حساب سليم تماماً (العائد الحقيقي ×٤٫٥ والمستهدف ×٣) بالرقم المقاس لوحده: تلت
    // الإعلانات عليها تنبيه كل أسبوع و٧٪ «عاجل» — أغلبها إعلانات بطلبين أو تلاتة، وقيمة الطلب الواحد بتقلب العائد. كروت صاحب المنتج
    // (×٠٫٢–×٦٫٥ وحد الخسارة ×١٥) بعيدة عن حدها بأضعاف طلب، فبتفضل «عاجل». الصفر (مفيش طلبات أصلاً) قاعدته الإنفاق بس
    var beyondRoas = function (sa, sp, bar) { return !(aovW > 0) || (sa + aovW) / sp < bar; };
    var beyondCost = function (sp, k, bar) { return sp / (k + 1) > bar; };
    var redLv = function (sp, beyond) { return urgentEligible && sp >= 2 * R && beyond ? 'critical' : 'warning'; };
    var redWhy = function (line, sp, beyond, v, near) { return sp < 2 * R || beyond ? { line: line, sp: sp, v: v } : { cap: near, v: v }; };
    // الصفر (ولا نتيجة): «عاجل» من ضعف R لو R رقم صاحب الحساب نفسه (أقصى تكلفة، أو المستهدف لإعلان المبيعات)، ومن ٣ أضعافه لو R تقديرنا
    // إحنا (التكلفة المعتادة في باقي إعلاناته — مفيش مستهدف): المعتادة أقل من المستهدف عادةً، فضعفها = نتيجتين متوقعتين بس، والمحاكاة
    // (حساب عملاء محتملين سليم تماماً): ٣٫٦ رسالة عاجلة كاذبة في الأسبوع. اللي عايز الحد بتاعه يحدد أقصى تكلفة لكل نتيجة
    var zeroX = refKind === 'usual' ? 3 : 2;
    var zeroLv = function (sp) { return urgentEligible && sp >= zeroX * R ? 'critical' : 'warning'; };
    // سبب مستوى التنبيه (صاحب المنتج ٢٥ أكتوبر: «لم أفهم سبب أن بعض الإعلانات تظهر بتنبيه عاجل وأخرى بمهم رغم أنه نفس السبب»):
    // why = { line: الخط اللي اتخطّى، sp: إنفاق أيام القاعدة، v: أرقام الخط } أو { cap: سبب ثابت يخلّيه «مهم» } — levelWhy تحت بتكتب
    // الجملة بعد كل الدمج والتخفيض
    var ev = function (i, why) { i.why = why || null; return i; };
    // الإعلان الصغير: ملاحظاته «للعلم» من غير تنبيه — وحالته «لم يُحكم بعد» (مش «جيد») لو كان عليه ملاحظة حقيقية
    // الملاحظة الهادية (quiet — «لا يأخذ إنفاقاً كافياً») بتفضل زي ما هي: هي نفسها عن إن الإنفاق صغير
    function done(pend, basis) {
      if (material) return finalize(c, issues, pend, basis);
      var raised = issues.some(function (i) { return (i.level === 'critical' || i.level === 'warning') && !i.quiet; });
      issues = issues.map(function (i) { return i.level === 'info' || i.quiet ? i : minor(i); });
      return finalize(c, issues, raised && c.active ? 'small' : pend, raised && c.active ? pendText('small') : basis);
    }
    // التعديل بكلام واضح: «رفع ميزانية الحملة من ٢٠٠ إلى ٤٠٠ ر.س»، «تعديل استهداف المجموعة الإعلانية»…
    function editText(e) {
      var lvl = t('edit.lvl.' + e.level);
      if (e.kind === 'budget' && e.from > 0 && e.to > 0) {
        return t(e.to > e.from ? 'edit.budget.up' : 'edit.budget.down', { lvl: lvl, from: fmt.money(e.from / unitOf(cur), cur), to: fmt.money(e.to / unitOf(cur), cur) });
      }
      return t('edit.' + e.kind, { lvl: lvl });
    }
    // سبب «لم يُحكم بعد» بكلام واضح — بيظهر في تفاصيل الإعلان
    function pendText(key) {
      if (key === 'learning') return t('pend.learning.d', { age: age === 0 ? t('al.capNear.lessDay') : daysText(age, fmt), days: daysText(s.learningDays, fmt) });
      if (key === 'small') return t('pend.small.d', { pct: share < 0.01 ? t('al.impactPctLow') : t('al.impactPct', { pct: fmt.int(share * 100) }) });
      // حكم مبدئي (ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦): نتيجة أو اتنين بإنفاق ≥ تكلفة نتيجة — بنقول القراءة الأولية بدل «لا تكفي»
      // «حتى يحقق ٣» (المراجعة الثانية للمرحلة ٥): إعلان المبيعات بقى بيتحكم عليه باحتمال الصدفة (ق١) مش بعدد طلبات ثابت — النص
      // كان بيقول «حقق ٩ مشتريات فقط… حتى يحقق ٣ مشتريات». وغير المبيعات بيتحكم عليه عند نتيجتين أو إنفاق يكفي لهم
      // (pend «little» تحت)، والنص كان بيقول ٣
      // الحكم بحدودك (٢٥ أكتوبر): السبب بالمبلغ اللي محتاجه مش «قد يكون صدفة» — «نحكم عليه حين يبلغ إنفاقه ٤٠ $ (ضعف أقصى تكلفة
      // حددتها لكل عملية شراء)»، أو «حين يحقق عمليتي شراء» لو صرف ضعف R بنتيجة واحدة. الصفر بيتحكم عليه من R (مهم) زي القاعدة
      var needText = function () {
        var what = t('ref.what.' + refKind, { one: one, target: fmt.num(s.roasTarget || 0) });
        if (spendW < R || resW === 0) return t('pend.need.one', { need: money(R), what: what });
        return spendW < 2 * R ? t('pend.need.two', { need: money(2 * R), what: what }) : t('pend.need.second', { two: countText(2, c.resultKey, fmt) });
      };
      if (/^prelim/.test(key)) {
        var pv = { count: countText(resW, c.resultKey, fmt), need: needText(), one: one,
          cmp: t('pend.cmp.' + key, { target: fmt.num(s.roasTarget), be: fmt.num(s.roasBreakEven) }) };
        if (profitAd) { pv.roas = rr(roasW); return t('pend.prelim.profit', pv); }
        pv.cpr = money(spendW / resW); pv.avg = money(refCpr);
        return t('pend.prelim.cpr', pv);
      }
      if (key === 'little' && profitAd && resW > 0 && R) {
        return t('pend.little.profit', { count: countText(resW, c.resultKey, fmt), roas: rr(roasW), spend: money(spendW), need: needText() });
      }
      if (key === 'little' && R) {
        return resW > 0 ? t('pend.little.d', { count: countText(resW, c.resultKey, fmt), spend: money(spendW), need: needText() })
          : t('pend.little.zero', { spend: money(spendW), label: label, need: needText() });
      }
      if (key === 'little' || key === 'noRef') {
        return resW > 0 ? t('pend.noRef.d', { count: countText(resW, c.resultKey, fmt) }) : t('pend.noRef.zero', { spend: money(spendW), label: label });
      }
      if (key === 'costlier') return t('pend.costlier.d', { one: one, cpr: money(ownCpr), pct: fmt.int((ownCpr / refCpr - 1) * 100), avg: money(refCpr), warn: fmt.num(s.cprWarnMultiple) });
      return t('pend.' + key + '.d');
    }
    // سطر «لماذا عاجل / لماذا مهم وليس عاجلاً» — من الخط اللي اتخطّى والإنفاق (ev فوق): «عاجل لأن عائده ×٣ تحت حد الخسارة الذي حددته
    // (×١٥) بعد إنفاق ١٩٢ $، وهو ضعف أقصى تكلفة حددتها لكل عملية شراء (٢٠ $) أو أكثر»
    function levelWhy(i) {
      var w = i.why;
      if (!w || (i.level !== 'critical' && i.level !== 'warning')) return null;
      if (w.cap) return i.level === 'warning' ? t('lv.why.cap.' + w.cap, w.v || {}) : null;
      var kind = w.kind || refKind, r = w.r || R;
      if (!kind || !r) return null;
      // الصفر بمضاعفه هو (ضعف أو ٣ أضعاف — zeroX فوق). جملة لكل خط فيها رقمه نفسه (العائد، أو تكلفة الطلب) — «تخطّى حد الخسارة»
      // مكانتش بتتقري طبيعي على العائد، و«أقصى تكلفة… وهو ضعف أقصى تكلفة» كانت بتكرر نفسها (فحص كروت حساب حقيقي ٢٥ أكتوبر)
      var x = w.line === 'zero' ? zeroX : 2;
      var v = { spend: money(w.sp), r: money(r), need: money(x * r), label: label, one: one,
        times: global.I18N ? global.I18N.timesPhrase(x, fmt.num) : x + '×',
        what: t('ref.what.' + kind, { one: one, target: fmt.num(s.roasTarget || 0) }) };
      Object.keys(w.v || {}).forEach(function (k) { v[k] = w.v[k]; });
      var hot = i.level === 'critical';
      if (w.line === 'zero') return t(hot ? 'lv.why.redZero' : 'lv.why.earlyZero', v);
      return t('lv.why.' + (hot ? 'red' : 'early') + '.' + w.line, v);
    }

    // 1) الإعلانات المتوقفة: مفيش تنبيهات على الوقوف المقصود. التنبيه بيطلع بس لو الإعلان كان بيصرف
    //    في آخر ٣ أيام ووقف لسبب مش من المعلن (رفض، مشكلة من المنصة، ميزانية خلصت) — ده وقوف مفاجئ
    if (!c.active) {
      var stopLevel = UNINTENDED_STOP[c.pausedLevel] || (c.reviewStatus === 'disapproved' ? 'critical' : null);
      var spent3 = recentSpend(c);
      if (stopLevel && spent3 > 0) {
        if (c.pausedLevel === 'rejected' || c.reviewStatus === 'disapproved') {
          issues.push(makeIssue('critical', ['status'], t('al.rejected.t'),
            t('al.rejected.d', { name: name, spend: money(spent3) }), t('al.rejected.a'), spent3, 'stopped'));
        } else if (c.pausedLevel === 'budget') {
          issues.push(makeIssue('warning', ['status'], t('al.budgetDone.t'),
            t('al.budgetDone.d', { name: name, spend: money(spent3) }), t('al.budgetDone.a'), spent3, 'stopped'));
        } else {
          // السبب: وصفنا للحالة + سبب المنصة الحرفي لو رجّعته (عشان مسؤول الإعلانات يعرف يدوّر عليه)
          var reason = t('why.' + c.pausedLevel) + (c.deliveryReason ? ' (' + t('al.name', { name: c.deliveryReason }) + ')' : '');
          issues.push(makeIssue(stopLevel, ['status'], t('al.stopped.t'),
            t('al.stopped.d', { name: name, spend: money(spent3), reason: reason }), t('al.stopped.a'), spent3, 'stopped'));
        }
      }
      return done();
    }

    // 2) ظهور محدود بسبب ملاحظة من المنصة (والإعلان لسه شغّال)
    if (c.reviewStatus === 'limited') {
      issues.push(makeIssue('warning', ['status', 'delivery'], t('al.limited.t'),
        t('al.limited.d', { name: name }), t('al.limited.a'), 0, 'limited'));
    }

    // 3) وصول ضعيف أو متوقف رغم إن الإعلان فعّال. لو المنصة نقلت إنفاقه لإعلانات تانية في نفس الحملة
    //    فده اختيارها في التوزيع مش مشكلة في الإعلان: «للعلم» بس (إعلان مربح كان بيطلع «يحتاج إلى تحسين» بسببها)
    var shiftNote = function () {
      return makeIssue('info', ['delivery'], t('al.shift.t'), t(spendY > 0 ? 'al.shift.d' : 'al.shift.dZero', { name: name, spend: money(spendY), avg: money(prevSpendAvg) }), t('al.shift.a'), 0, 'shift');
    };
    // إنفاق الحساب كله أمس مقابل متوسطه: لو الحساب نفسه نزل للنص أو أقل، نزول الإعلان جزء منه (ميزانية، دفع، إيقاف) —
    // حساب Snapchat حقيقي ١١ أكتوبر: الحساب نزل ٥٨٪ فطلع «وصول ضعيف» على كل إعلان لوحده بنفس السبب
    var accPrevDaily = sum(acc.spendByDay, 0, DAY_BEFORE) / (DAY_BEFORE + 1), accY = acc.spendByDay[YESTERDAY] || 0;
    var accShrank = accPrevDaily > 0 && accY <= accPrevDaily * s.accountDropRatio;
    var acctNote = function () {
      return makeIssue('info', ['delivery'], t('al.weakAcct.t'), t('al.weakAcct.d', { name: name, spend: money(spendY), avg: money(prevSpendAvg),
        pct: fmt.int((1 - accY / accPrevDaily) * 100) }), t('al.weakAcct.a'), 0, 'weak-acct');
    };
    // إعلان كان بيصرف أقل من ١٪ من إنفاق الحساب اليومي: نزوله مش معلومة — «كان ينفق نحو ٠ ر.س يومياً» كانت بتطلع
    var tinyAd = prevSpendAvg > 0 && prevSpendAvg < accPrevDaily * 0.01;
    // المرحلة ٥ ق٧: حالة مجموعته الإعلانية مش مقروءة من المنصة (meta.js statusPartial) — السبب ممكن يكون إعداد في
    // المجموعة (مدة أو ميزانية خلصت) مش الإعلان، فبنقول كده في التنبيه بدل ما يفهم إن العيب في الإعلان
    var partialNote = c.statusPartial ? t('al.statusPartial') : '';
    if ((age == null || age >= 2) && !tinyAd) {
      if (spendY === 0 && prevSpendAvg > 0) {
        issues.push(spendShifted(c, acc, prevSpendAvg) ? shiftNote() : (accShrank ? acctNote() : makeIssue('warning', ['delivery', 'spend'], t('al.noSpendY.t'),
          t('al.noSpendY.d', { name: name, avg: money(prevSpendAvg) }) + partialNote, t('al.noSpendY.a'), 0, 'no-spend-y')));
      } else if (spendY > 0 && prevSpendAvg > 0 && spendY < prevSpendAvg * s.lowDeliveryRatio) {
        issues.push(spendShifted(c, acc, prevSpendAvg) ? shiftNote() : (accShrank ? acctNote() : makeIssue('warning', ['delivery', 'spend'], t('al.weak.t'),
          t('al.weak.d', { name: name, spend: money(spendY), avg: money(prevSpendAvg) }) + partialNote, t('al.weak.a'), 0, 'weak-delivery')));
      } else if (!any(daily) && prevSpendAvg === 0) {
        // مفيش إنفاق = مفيش حاجة نحكم عليها: حالته «لم يُحكم بعد»، والملاحظة للعلم
        issues.push(makeIssue('info', ['delivery'], t('al.noSpend7.t'),
          t('al.noSpend7.d', { name: name }), t('al.noSpend7.a'), 0, 'no-spend-7'));
      }
    }

    // إعلان جديد (فترة التعلّم) صرف ٣ أضعاف التكلفة المسموحة لنتيجة (R) من غير ولا نتيجة: «مهم» حتى قبل ما يكمّل التعلّم —
    // ومبيوصلش «عاجل»: Meta نفسها بتقول نتائج فترة التعلّم «مش بالضرورة مؤشر على الأداء الجاي»
    if (learning && c.results === 0 && R && c.spend >= 3 * R) {
      issues.push(ev(withMoney(makeIssue('warning', ['spend', 'results'], t('al.wasteNew.t'),
        t('al.wasteNew.d', { name: name, spend: money(c.spend), label: label, refSpent: refSpent(c.spend) }),
        t('al.wasteNew.a'), c.spend, 'waste-new'), 'waste', spend3 / 3), { cap: 'learning' }));
    }

    var wasteRaised = false;
    if (!learning && c.results != null) {
      // من غير أي مرجع (ولا حد محدد ولا إعلان في الحساب جاب نتيجة من النوع ده): متوسط صرف الإعلان الواحد في يومين — «مهم» بس،
      // عشان التنبيه ميختفيش في أسوأ الحالات
      var accountHasResults = !!(group && group.results > 0);
      var noRefFloor = !R && !accountHasResults && acc.avgAdSpend2 > 0 ? acc.avgAdSpend2 : null;
      // 4أ) ولا نتيجة طول أيام الحكم: «مهم» من R و«عاجل» من ضعفه (قاعدة الإيقاف عند مشتري الإعلانات). قبل كده باحتمال الصدفة — حساب
      //     حقيقي ٢٥ أكتوبر: ٩١ $ من غير ولا طلب «لم يُحكم بعد»، و٧٠ $ والحد ٢٠ $ «مهم»
      var weekDry = resW === 0 && spendW > 0 && !!R;
      // المنصة بتنسب له نتيجتين أو أكتر بعد المشاهدة من غير نقر (مراجعة ١١ أكتوبر ٢٠٢٦، حساب حقيقي: «عاجل — إنفاق دون نتائج» على
      // إعلان المنصة بتنسب له ٦ مشتريات بعائد ×٩٫٧، والتاني ٦ بعائد ×٧٫٦). أساسنا النقر زي ما هو (قرار ٦ أكتوبر)، بس «هدر مؤكد
      // عاجل» مش أمين هنا: «مهم»، ومبيتحسبش في لوحة الهدر ولا بيوصل بريد عاجل، والاقتراح نقارن بطلبات المتجر قبل الإيقاف
      var platOnly = weekDry && c.plat && c.plat.results >= 2 ? c.plat.results : 0;
      if (platOnly && spendW >= R) {
        wasteRaised = true;
        // ر٤٣ (مرحَّل من المرحلة ٤): سبب الفرق بين رقمنا ورقم المنصة يختلف بالمنصة — في Meta أساسنا النقر والمنصة بتنسب
        // كمان بعد المشاهدة من غير نقر، وفي سناب شات أساسنا الطلبات المسجّلة في المتجر والمنصة بتنسب بنوافذ النسب بتاعتها
        var vk = c.baseStore ? 'Store' : '';
        issues.push(ev(withMoney(makeIssue('warning', ['spend', 'results'], t('al.wasteView' + vk + '.t', { label: label }),
          t('al.wasteView' + vk + '.d', { name: name, spend: money(spendW), label: label, plat: countText(platOnly, c.resultKey, fmt) }),
          t('al.wasteView' + vk + '.a'), spendW, 'waste-view'), 'wasteClick', spend3 / 3), { cap: 'platform' }));
      } else if (weekDry && spendW >= R) {
        wasteRaised = true;
        var dryLv = zeroLv(spendW), dryHot = dryLv === 'critical';
        issues.push(ev(withMoney(makeIssue(dryLv, ['spend', 'results'], t(dryHot ? 'al.wasteWeek.t' : 'al.wasteWeekEarly.t'),
          t('al.wasteWeek.d', { name: name, spend: money(spendW), label: label, refSpent: refSpent(spendW) }),
          t(dryHot ? 'al.waste.a' : 'al.wasteEarly.a'), spendW, dryHot ? 'waste-week' : 'waste-early', dryHot), 'waste', spend3 / 3), { line: 'zero', sp: spendW }));
      }
      // 4ب) آخر ٣ أيام مكتملة من غير ولا نتيجة — للإعلان اللي جاب نتائج قبلها (قاعدة صاحب المنتج: «مر عليها ٣ أيام بدون أي
      //     مشتريات»): «مهم» من R و«عاجل» من ضعفه. ويومين بس بإنفاق ضعف R: «مهم» (اليوم التالت هو اللي بيخلّيه عاجل)
      if (!weekDry && R && res3 === 0 && spend3 >= R) {
        wasteRaised = true;
        var d3Lv = zeroLv(spend3), d3Hot = d3Lv === 'critical';
        issues.push(ev(withMoney(makeIssue(d3Lv, ['spend', 'results'], t(d3Hot ? 'al.waste3.t' : 'al.waste3Early.t'),
          t('al.waste3.d', { name: name, spend: money(spend3), label: label, refSpent: refSpent(spend3) }),
          t(d3Hot ? 'al.waste.a' : 'al.wasteEarly.a'), spend3, d3Hot ? 'waste' : 'waste-early', d3Hot), 'waste', spend3 / 3), { line: 'zero', sp: spend3 }));
      } else if (!weekDry && R && res3 > 0 && res2 === 0 && spend2 >= zeroX * R) {
        wasteRaised = true;
        issues.push(ev(withMoney(makeIssue('warning', ['spend', 'results'], t('al.wasteEarly.t'),
          t('al.waste.d', { name: name, spend: money(spend2), label: label, refSpent: refSpent(spend2) }),
          t('al.wasteEarly.a'), spend2, 'waste-early'), 'waste', spend2 / 2), { cap: 'twoDays', v: { need: money(zeroX * R) } }));
      } else if (noRefFloor && res2 === 0 && spend2 >= noRefFloor) {
        wasteRaised = true;
        issues.push(ev(withMoney(makeIssue('warning', ['spend', 'results'], t('al.wasteEarly.t'),
          t('al.waste.dNoAvg', { name: name, spend: money(spend2), label: label }),
          t('al.wasteEarly.a'), spend2, 'waste-early'), 'waste', spend2 / 2), { cap: 'noRef' }));
      }

      // 5) الربح (إعلان بيسجّل قيمة مبيعات): العائد المقاس على أيام الحكم مقابل حد الخسارة (أحمر) والمستهدف (أصفر) — نفس أرقام
      //    الكارت. وآخر ٣ أيام بيكشف التراجع الجديد. جنب الحكم: عائد إعلانات الحساب في الفترة نفسها — لو الكل نازل، السبب غالباً الفترة
      //    (عروض، موسم) مش الإعلان. قبل ٢٥ أكتوبر باحتمال الصدفة: ×٤٫٨ وحد الخسارة ×١٥ كان «أقل من المستهدف» (عنوان غلط كمان)
      if (profitAd && hasGoal && R) {
        var roas3 = spend3 > 0 ? sales3 / spend3 : null;
        // المقارنة بعائد إعلانات المبيعات في الحساب على نفس أيام الجملة اللي قبلها (Kimball & Ross: نفس التعريف ونفس الفترة).
        // better = الإعلان أحسن من متوسط الحساب، يعني متوسط باقي إعلانات المبيعات أضعف منه — فالنصيحة متبقاش «اخفض ميزانيته»
        // (حساب حقيقي ١٨ أكتوبر: أفضل إعلان في الحساب ×١٫٩ والحساب ×٠٫٨، والتنبيه بيقول «أفضل من متوسط حسابك» وينصح بخفض ميزانيته)
        var vsAcc = function (p, own, ownSpend) {
          if (!p || p.roas == null || !(p.spend > 0) || ownSpend >= p.spend * 0.9) return { text: '', better: false };
          var better = own != null && own < s.roasTarget && own >= p.roas;
          return { better: better, text: (fmt.currencyLabel(cur)
            ? t('al.vsAcc', { one: fmt.int(1), cur: fmt.currencyLabel(cur), acc: rx(p.roas, own) })
            : t('al.vsAccNoCur', { acc: rx(p.roas, own) })) + (better ? t('al.vsAccBetter') : '') };
        };
        var wk = vsAcc(purch, roasW, spendW), cmp = wk.text;
        // الأسبوع فيه مبيعات بس آخر ٣ أيام مفيهاش ولا طلب: سطر لوحده — متوسط الأسبوع كان بيخبّي إن الإعلان وقف يبيع
        // (حساب حقيقي ١١ أكتوبر: «×١٫٨ خلال ٥ أيام» وآخر ٣ أيام صفر مبيعات بإنفاق ٢٦٠ ر.س)
        var zero3 = sales3 === 0 && spend3 > 0 && salesW > 0 ? t('al.zero3', { spend: money(spend3) }) : '';
        var wkVars = { name: name, spend: money(spendW), sales: money(salesW), roasText: roasW != null ? roasLabel(roasW) : '', target: fmt.num(s.roasTarget),
          be: fmt.num(s.roasBreakEven), cmp: zero3 + cmp };
        // حد الخسارة أعلى من ١: العائد ×١٫٨ مش «أقل من التكلفة» (كل ريال رجّع ١٫٨) — أقل من حد الخسارة اللي العميل حطه.
        // والمبلغ: الناقص عن حد الخسارة (الإنفاق أكبر من المبيعات بس لو الحد ١)
        var beOver = s.roasBreakEven > 1, lossK = beOver ? 'BE' : '';
        var lossAmt = function (sp, sa) { return beOver ? sp * s.roasBreakEven - sa : sp - sa; };
        // تحت حد الخسارة مش «هدر»: مبيدخلش في المعرّض للهدر ولا لوحة الهدر. والخسارة «المهمة» (لسه متأكدتش) برّه المعرّض كمان
        var lossMoney = function (i, sp, sa) { i.amount = lossAmt(sp, sa); i.atRisk = !beOver && i.level === 'critical'; return withMoney(i, beOver ? 'belowBE' : 'loss', beOver ? 0 : (spend3 - sales3) / 3); };
        // better = الإعلان أحسن من متوسط إعلانات المبيعات في الحساب — جملة «تركّز الميزانية» (evaluateAccount) بتنصح بنقل ميزانيته
        // «للإعلانات الأفضل أداءً»، ومفيش أفضل منه (المراجعة الثانية للمرحلة ٥)
        var markBetter = function (i, b) { i.better = !!b; return i; };
        // تحت حد الخسارة (الخط الأحمر): «مهم» من R و«عاجل» من ضعفه. صفر طلبات قاعدته فوق (4أ)
        var lossV = { be: fmt.num(s.roasBreakEven), aov: aovW ? money(aovW) : '' };
        if (resW > 0 && roasW < s.roasBreakEven && spendW >= R) {
          var lossFar = beyondRoas(salesW, spendW, s.roasBreakEven);
          var lossIssue = makeIssue(redLv(spendW, lossFar), ['roas', 'spend'], t('al.loss' + lossK + '.t'), t('al.lossWeek' + lossK + (salesW > 0 ? '' : 'Zero') + '.d', wkVars), t(wk.better ? 'al.loss.aBetter' : 'al.loss.a'), 0, 'loss', true);
          // نفس المعلومة كجملة جوه تنبيه تاني على نفس الإعلان لو هو اللي بقى المضيف (الدمج تحت — 11): «٣ أيام دون مشتريات» وعائد الأسبوع
          lossIssue.inline = t('al.loss.in', { roas: rr(roasW), be: fmt.num(s.roasBreakEven) });
          issues.push(ev(markBetter(lossMoney(lossIssue, spendW, salesW), wk.better), redWhy('loss', spendW, lossFar, Object.assign({ roas: rr(roasW) }, lossV), 'nearLoss')));
        } else if (resW > 0 && roasW < s.roasTarget && judgedW && beyondRoas(salesW, spendW, s.roasTarget)) {
          // تحت المستهدف وفوق حد الخسارة (الخط الأصفر): «مهم» — ما زال يربح بحدك. الأثر بالفلوس: المبيعات أقل قد إيه من اللي كان
          // المفروض الإنفاق ده يجيبه بالعائد المستهدف
          var lowIssue = makeIssue('warning', ['roas'], t('al.lowRoas.t'), t('al.lowRoasWeek.d', wkVars), t(wk.better ? 'al.lowRoas.aBetter' : 'al.lowRoas.a'), spendW * s.roasTarget - salesW, 'low-roas');
          lowIssue.inline = t('al.lowRoas.in', { roas: rr(roasW), target: fmt.num(s.roasTarget) });
          issues.push(ev(markBetter(withMoney(lowIssue, 'short', 0), wk.better), { cap: 'belowTarget' }));
        } else if (resW > 0 && judgedW && roasW >= s.roasTarget * 1.5 && salesAboveP(salesW, spendW, s.roasTarget, resW, aovW, judgedDays) < P_LIKELY &&
            !(roas3 != null && roas3 < s.roasBreakEven)) {
          // فوق المستهدف بدليل — الفرصة (زوّد الميزانية) بتفضل بالدليل: الصرف على حظ بيصرف فلوس حقيقية. ومش لو آخر ٣ أيام تحت حد
          // الخسارة: «زوّد الميزانية» محتاج إشارات متسقة
          issues.push(makeIssue('opportunity', ['roas'], t('al.greatRoas.t'), t('al.greatRoasWeek.d', wkVars), t('al.greatRoas.a'), 0, 'roas-great'));
        }
        // آخر ٣ أيام تحت حد الخسارة بطلبات (الصفر قاعدته فوق — 4ب) والأسبوع نفسه فوقه:
        //  - الأسبوع تحت المستهدف = الإعلان بيخسر دلوقتي وأسبوعه مش مغطّيه: خسارة على الـ٣ أيام («مهم» من R و«عاجل» من ضعفه)
        //  - الأسبوع فوق المستهدف = تراجع يتابَع («مهم») — ممكن مبيعات اتأخر تسجيلها
        if (resW > 0 && roasW >= s.roasBreakEven && res3 > 0 && spend3 >= R && roas3 < s.roasBreakEven) {
          if (roasW < s.roasTarget) {
            // «في الفترة نفسها» بعد جملة الـ٣ أيام = عائد الحساب في نفس الـ٣ أيام (Kimball & Ross: نفس الفترة)
            var r3 = vsAcc(acc.purchIn(RECENT3, YESTERDAY), roas3, spend3);
            var loss3Far = beyondRoas(sales3, spend3, s.roasBreakEven);
            var loss3 = makeIssue(redLv(spend3, loss3Far), ['roas', 'spend'], t('al.loss' + lossK + '.t'),
              t('al.loss' + lossK + (sales3 > 0 ? '' : 'Zero') + '.d', { name: name, spend: money(spend3), sales: money(sales3), roasText: roasLabel(roas3), be: wkVars.be }) +
                t('al.weekCtx', { roas: fmt.num(roasW) }) + r3.text,
              t(r3.better ? 'al.loss.aBetter' : 'al.loss.a'), 0, 'loss', true);
            // عائد الأسبوع مكتوب في الجملة نفسها — من غير ما «أقل من المستهدف» يكرّره جوّاه بعد الدمج
            if (lowIssue) lowIssue.inline = null;
            issues.push(ev(markBetter(lossMoney(loss3, spend3, sales3), r3.better), redWhy('loss', spend3, loss3Far, Object.assign({ roas: rr(roas3) }, lossV), 'nearLoss')));
          } else {
            issues.push(ev(withMoney(makeIssue('warning', ['roas'], t('al.roasDrop.t'),
              t('al.roasDrop.d', { name: name, roasW: fmt.num(roasW), roas3: fmt.num(roas3), spend: money(spend3), sales: money(sales3) }),
              t('al.roasDrop.a'), spend3 - sales3, 'roas-drop'), 'loss', 0), { cap: 'weekStrong' }));
          }
        }
      }

      // 6) تكلفة النتيجة أعلى من متوسط باقي إعلاناتك (حملته أو حسابك) على أيام الحكم — للإعلانات اللي مفيهاش قيمة مبيعات (إعلان
      //    المبيعات بيتحكم عليه بالربح فوق). الخطين من الإعدادات: «مهم» من ×{warn} بعد إنفاق ضعف التكلفة المعتادة، و«عاجل» من ×{crit}
      //    (الإنفاق ساعتها ضعفها أو أكتر تلقائياً). نتيجة واحدة بتتحسب: نتيجة واحدة بتكلفة عشرة كانت بتطلع «جيد». ولو حددت أقصى تكلفة
      //    فهي خطك الأحمر: المقارنة بالباقي «مهم» بس، والعاجل من قاعدة أقصى التكلفة (6ب)
      //    كان «عاجل» محتاج احتمال صدفة صغير، ومش جوه ميزانية الحملة ولا بعد إعلان جديد في المجموعة ولا لنتائج أعلى المسار — دلوقتي
      //    ميزانية الحملة جملة في النص (Meta بتوزّع الإنفاق بنفسها) مش سبب يخفّض المستوى
      if (!profitAd && refCpr && resW >= 1 && ownCpr != null) {
        var ratio = ownCpr / refCpr;
        // والخط الأصفر (×{warn}) كمان «الفرق أكبر من نتيجة» زي المستهدف — من غيرها ١١٪ من إعلانات حساب عملاء محتملين سليم تماماً
        // كان عليها «تكلفة مرتفعة» كل فحص (المحاكاة)
        if (ratio >= s.cprWarnMultiple && beyondCost(spendW, resW, refCpr * s.cprWarnMultiple) && (ratio >= s.cprCriticalMultiple || spendW >= 2 * refCpr)) {
          // «عاجل» لو فضل فوق حد العاجل حتى بنتيجة كمان (الفرق أكبر من نتيجة)، وغير كده «مهم» بالسبب ده
          var cprFar = beyondCost(spendW, resW, refCpr * s.cprCriticalMultiple);
          var critical = urgentEligible && !maxCost && ratio >= s.cprCriticalMultiple && cprFar;
          var cprNear = urgentEligible && !maxCost && ratio >= s.cprCriticalMultiple && !cprFar;
          var oldNote = age != null && age >= OLD_AD_DAYS ? t('al.cpr.old', { days: fmt.int(age), dayWord: dayWord(age) }) : '';
          issues.push(ev(withMoney(makeIssue(critical ? 'critical' : 'warning', ['cpr'], t('al.cpr.t', { label: label, one1: one }),
            t('al.cpr.d', { one: one, name: name, cpr: money(ownCpr), old: oldNote, pct: fmt.int((ratio - 1) * 100), avg: money(refCpr) }) +
              (c.campaignBudget ? t('al.cboNote') : ''),
            t('al.cpr.a'),
            spendW - resW * refCpr, 'cpr'), 'extra', 0),
            critical ? { line: 'cpr', sp: spendW, kind: 'usual', r: refCpr, v: { crit: fmt.num(s.cprCriticalMultiple), cpr: money(ownCpr), avg: money(refCpr), ratio: fmt.num(Math.round(ratio * 10) / 10) } }
              : { cap: cprNear ? 'nearCpr' : (maxCost ? 'ratioMax' : 'ratio'), v: { ratio: fmt.num(Math.round(ratio * 10) / 10), crit: fmt.num(s.cprCriticalMultiple), max: maxCost ? money(maxCost) : '' } }));
        }
      }

      // 6ب) أعلى من أقصى تكلفة مقبولة لكل نتيجة (قرار صاحب المنتج ٢٤ أكتوبر — خطك الأحمر، ولإعلان المبيعات كمان من ٢٥ أكتوبر): بنتائج
      //     تكلفتها فوق الحد — «مهم» من R (= الحد نفسه، تلقائي) و«عاجل» من ضعفه. صفر نتائج قاعدته فوق (4أ — R هو الحد برضه)
      if (maxCost && resW > 0 && spendW / resW > maxCost) {
        var mVars = { one: one, name: name, cpr: money(spendW / resW), max: money(maxCost), spend: money(spendW), label: label,
          scope: t(maxScope === 'camp' ? 'al.costMax.camp' : 'al.costMax.acc') };
        var maxFar = beyondCost(spendW, resW, maxCost);
        var maxIssue = makeIssue(redLv(spendW, maxFar), ['cpr'], t('al.costMax.t', { one1: one }), t('al.costMax.d', mVars) + (c.campaignBudget ? t('al.cboNote') : ''),
          t('al.costMax.a'), spendW - resW * maxCost, 'cost-max');
        maxIssue.inline = t('al.costMax.in', mVars);
        issues.push(ev(withMoney(maxIssue, 'extra', 0), redWhy('max', spendW, maxFar, { one: one, max: money(maxCost), cpr: money(spendW / resW) }, 'nearMax')));
      }

      // 7) انخفاض النتائج أمس مقارنة بالمعتاد مع نفس مستوى الصرف — بشرطين عشان منطلعش تنبيه على تذبذب طبيعي:
      //    - أمس أسوأ من كل أيامه اللي فاتت (نتائج لكل ١ اتصرف): لو كان فيه يوم زيه قبل كده ورجع بعده،
      //      يبقى ده نمط الإعلان ده مش مشكلة جديدة
      //    - والانخفاض صعب يحصل صدفة (احتمال أقل من ٥٪ بالمعدل المتوقع لصرف أمس)
      // المعتاد = الأيام قبل أمس (من غير أقدم يوم زي الأول) — وبعد آخر تعديل بس زي باقي القواعد
      var dropFrom = Math.max(1, weekStart), dropDays = DAY_BEFORE - dropFrom + 1;
      var prevResAvg = sum(results, dropFrom, DAY_BEFORE) / dropDays;
      var prevSpend4 = sum(daily, dropFrom, DAY_BEFORE) / dropDays;
      var newLow = spendY > 0;
      for (var d = dropFrom; d <= DAY_BEFORE && newLow; d++) {
        if ((daily[d] || 0) > 0 && (results[d] || 0) / daily[d] <= resY / spendY) newLow = false;
      }
      var unlikely = prevSpend4 > 0 && countBelowP(resY, prevResAvg * spendY / prevSpend4, 1) < P_LIKELY;   // بالتشتت (ق١)
      // ق٦: مع إعلان جديد في المجموعة، نزول النتائج متوقّع — المنصة بتعيد توزيع الإنفاق والجمهور بين إعلانات المجموعة
      if (!wasteRaised && !reLearn && prevResAvg >= 2 && prevSpend4 > 0 && spendY >= prevSpend4 * 0.7 && resY <= prevResAvg * DROP_RATIO && newLow && unlikely) {
        issues.push(ev(makeIssue('warning', ['results'], t('al.drop.t'),
          // صفر نتائج: «لم يحقق أي مشتريات» بدل «حقق ٠ مشتريات فقط»
          resY === 0
            ? t('al.drop.dZero', { name: name, label: label, avg: fmt.num(prevResAvg) })
            : t('al.drop.d', { name: name, count: countText(resY, c.resultKey, fmt), avg: fmt.num(prevResAvg) }),
          t('al.drop.a'), 0, 'drop'), { cap: 'oneDay' }));
      }
    }

    // 8) صرف أعلى من المعتاد من غير ما النتائج تتحسن بنفس النسبة
    // (بنتجاهله لو الإعلان لسه بادئ يصرف — أقل من ٣ أيام صرف قبل أمس — أو لو عليه تنبيه صرف بدون نتائج أصلاً)
    // حد أدنى (ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦): الزيادة نفسها لازم تساوي تكلفة نتيجة واحدة بمتوسط الحساب على الأقل —
    // إعلان صرفه نط من ٥ لـ١٢ كان بيطلع «صرف أعلى من المعتاد». من غير متوسط في الحساب مفيش أساس نقيس عليه، فمفيش تنبيه
    var priorSpendDays = daily.slice(weekStart, YESTERDAY).filter(function (v) { return v > 0; }).length;
    var spikeFloor = refCpr || accountCpr;
    if (!learning && !wasteRaised && priorSpendDays >= 3 && prevSpendAvg > 0 && spendY >= prevSpendAvg * s.spikeMultiple &&
      spikeFloor && spendY - prevSpendAvg >= spikeFloor) {
      var yCpr = resY > 0 ? spendY / resY : null;
      // والنتائج القليلة دي صعب تكون صدفة (المراجعة الثانية للمرحلة ٥ — معيار الدليل الواحد م٢): نتائج أمس أقل من المتوقع بمعدّل
      // الإعلان نفسه قبلها (أو معدّل الحساب لو ملوش نتائج) لإنفاق أمس، باحتمال صدفة أقل من ٥٪. قبل كده من غير أي اختبار:
      // نتيجتين بدل ٤ متوقعة (احتمالها صدفة نحو ٢٤٪) كانت بتطلع «مهم»
      var priorS = sum(daily, weekStart, DAY_BEFORE), priorR = sum(results, weekStart, DAY_BEFORE);
      var rateY = priorS > 0 && priorR > 0 ? priorR / priorS : (spikeFloor ? 1 / spikeFloor : 0);
      var spikeEvid = rateY > 0 && countBelowP(resY, spendY * rateY, 1) < P_LIKELY;
      // «النتائج مزادتش معاه» = تكلفة النتيجة أمس أعلى بوضوح (نفس حد «تكلفة مرتفعة») — مش أعلى من المتوسط بسنت
      if (spikeEvid && (!avgCpr || yCpr == null || yCpr > refCpr * s.cprWarnMultiple)) {
        issues.push(ev(withMoney(makeIssue('warning', ['spend'], t('al.spike.t'),
          t('al.spike.d', { name: name, spend: money(spendY), times: global.I18N ? global.I18N.timesPhrase(spendY / prevSpendAvg, fmt.num) : fmt.num(spendY / prevSpendAvg) + '×', avg: money(prevSpendAvg) }),
          t('al.spike.a'), spendY - prevSpendAvg, 'spike'), 'spike', 0), { cap: 'oneDay' }));
      }
    }

    // 9) تكرار الظهور لنفس الشخص (زهق الجمهور)
    if (c.frequency != null) {
      var isOld = age != null && age >= OLD_AD_DAYS;
      if (c.frequency >= s.frequencyHigh) {
        // الربح الأول: إعلان مبيعات عائده فوق المستهدف مش «بيضره» التكرار مهما كانت تكلفته مقارنةً بالحساب
        var profitWeak = profitAd && hasGoal && judgedW && roasW < s.roasTarget;
        // الزهق «بيضر» (عاجل) زي تعريف Meta للإرهاق (Creative fatigue — مركز مساعدة Meta ١٣٤٦٨١٦١٤٢٣٢٧٨٥٨): مرات ظهور كتير
        // و**ضعف** التكلفة أو أكتر. بين ١٫٥ وضعفين «مهم» زي «Creative limited» عندها. كان ١٫٥ ضعف = عاجل (المرحلة ٥ ق٤).
        // إعلان المبيعات العاجل بتاعه قاعدة الخسارة فوق. ولو حددت أقصى تكلفة وتكلفته تحتها مش «بيضر»
        var hurting = !profitAd && !learning && urgentEligible && refCpr && ownCpr != null && ownCpr >= refCpr * FATIGUE_X && (!maxCost || ownCpr > maxCost);
        // التكرار العالي لوحده مش مشكلة (جمهور إعادة الاستهداف صغير وبيبقى مربح): «مهم» بس لو في أداء الإعلان علامة ضعف،
        // وغير كده ملاحظة «للعلم» — أفضل إعلان في الحساب كان بيطلع «يحتاج إلى تحسين» بسبب التكرار بس
        var weakPerf = profitWeak || issues.some(function (i) {
          return (i.level === 'critical' || i.level === 'warning') && i.metrics.some(function (m) { return m === 'results' || m === 'cpr' || m === 'roas'; });
        }) || (!profitAd && !!(refCpr && ownCpr != null && ownCpr >= refCpr * s.cprWarnMultiple && spendW >= 2 * refCpr));
        var fVars = { name: name, freq: global.I18N ? global.I18N.timesText(c.frequency, fmt.num, true) : fmt.num(c.frequency) + ' times', old: isOld ? t('al.fatigue.old', { days: fmt.int(age), dayWord: dayWord(age) }) : '' };
        var fDetail = t('al.fatigue.d', fVars);
        if (hurting || weakPerf) {
          var fIssue = makeIssue(hurting ? 'critical' : 'warning', ['frequency'], t('al.fatigue.t'), fDetail, t('al.fatigue.a'), 0, 'fatigue');
          // نفس المعلومة كجملة جوه تنبيه الأداء اللي على الإعلان (الدمج تحت — 11)
          fIssue.inline = t('al.fatigue.in', fVars);
          issues.push(ev(fIssue, hurting ? { line: 'fatigue', sp: spendW, kind: 'usual', r: refCpr, v: { ratio: fmt.num(Math.round(ownCpr / refCpr * 10) / 10) } } : { cap: 'fatigue' }));
        } else {
          issues.push(makeIssue('info', ['frequency'], t('al.fatigue.t'), fDetail + t('al.fatigue.ok'), t('al.fatigue.okA'), 0, 'fatigue'));
        }
      }
    }

    // 10) فرصة لزيادة الاستثمار — على آخر ٣ أيام زي العائد: يوم واحد حلو مش سبب كفاية لزيادة الميزانية.
    //     وإعلان المبيعات لازم كمان يكون عائده على الأسبوع فوق المستهدف (رخيص عن الحساب وخسران = مش فرصة)
    if (!learning && !upperFunnel && avgCpr && res3 >= SCALE_MIN && spend3 > 0 && (!profitAd || (hasGoal && weekEvidence && roasW >= s.roasTarget))) {
      var cpr3 = spend3 / res3;
      var hasProblem = issues.some(function (i) { return i.level === 'critical' || i.level === 'warning'; });
      // والرخص نفسه صعب يكون صدفة (ق١): نتائج آخر ٣ أيام أكتر من باقي الحساب بنفس الإنفاق باحتمال صدفة أقل من ٥٪ — «زوّد
      // الميزانية» على ٣ نتائج رخيصة بالحظ بيصرف فلوس حقيقية
      var peer3 = acc.labelIn(c.resultKey, RECENT3, YESTERDAY, refCamp);
      var p3 = peer3 ? moreP(Math.max(0, peer3.results - res3), Math.max(0, peer3.spend - spend3), res3, spend3, 3) : 1;
      // المرجع: باقي الإعلانات على نفس الـ٣ أيام (نفس الاختبار p3 — المراجعة الثانية للمرحلة ٥). كان متوسط الأسبوع والإعلان جوّاه
      var rest3K = peer3 ? peer3.results - res3 : 0, ref3 = rest3K > 0 ? (peer3.spend - spend3) / rest3K : refCpr;
      if (!hasProblem && cpr3 <= ref3 * SCALE_RATIO && p3 < P_LIKELY) {
        // لو عليه تنبيه "عائد ممتاز"، ندمجه هنا بدل تنبيهين لنفس الإعلان ونفس النصيحة
        var greatIdx = -1;
        issues.forEach(function (i, idx) { if (i.code === 'roas-great') greatIdx = idx; });
        var roasNote = '';
        if (greatIdx !== -1) {
          roasNote = fmt.currencyLabel(cur)
            ? t('al.scale.note', { one: fmt.int(1), cur: fmt.currencyLabel(cur), roas: fmt.num(sales3 / spend3) })
            : t('al.scale.noteNoCur', { roas: fmt.num(sales3 / spend3) });
          issues.splice(greatIdx, 1);
        }
        issues.push(makeIssue('opportunity', ['results', 'cpr', 'roas'], t('al.scale.t'),
          t('al.scale.d', { name: name, count: countText(res3, c.resultKey, fmt), cpr: money(cpr3), one1: one, pct: fmt.int((1 - cpr3 / ref3) * 100), avg: money(ref3), note: roasNote }),
          t('al.scale.a'), 0, 'scale'));
      }
    }

    // 11) تنبيه أداء واحد لكل إعلان (المراجعة الثانية للمرحلة ٥ — ISA-18.2 وEEMUA 191، إدارة الإنذارات: إنذار واحد لكل حالة غير
    //     طبيعية، والتابع والمكرر بيتدمجوا). «يومان دون نتائج» و«تكلفة مرتفعة» و«تشبّع الجمهور» على نفس الإعلان كانوا ٣ تنبيهات
    //     عاجلة بنفس الدليل (نفس اختبار باقي الحساب): ٣ خانات من ٥ في «يحتاج انتباهك الآن» و٣ صناديق في بريد واحد عن إعلان واحد.
    //     المضيف = الأعلى مستوى، ثم المعرّض للهدر، ثم الأكبر بالفلوس، ثم الأوضح معنى؛ والباقي بيتشال — تكلفة الأسبوع موجودة في
    //     «سبب الحكم». تكرار الظهور بس بيضيف معلومة مش موجودة (الجمهور شاف الإعلان كتير) فبيتكتب جوه المضيف هو ونصيحته، ومستوى
    //     المضيف بيعلى لمستواه لو أعلى (Meta: تكرار كتير + ضعف التكلفة = إرهاق)
    // و«إنفاق أعلى من المعتاد» و«انخفاض النتائج» بيطلعوا على نفس اليوم (أمس) لنفس السبب — من نفس العيلة
    var PERF_ORDER = ['waste-week', 'waste', 'loss', 'cost-max', 'waste-view', 'cpr', 'waste-early', 'waste-new', 'roas-drop', 'low-roas', 'spike', 'drop', 'fatigue'];
    var perf = issues.filter(function (i) { return PERF_ORDER.indexOf(i.code) > -1 && (i.level === 'critical' || i.level === 'warning'); });
    if (perf.length > 1) {
      // وفي نفس المستوى: الخط الأحمر اللي اتخطّى (تحت حد الخسارة، فوق أقصى تكلفة، دون نتائج) قبل الأصفر (تحت المستهدف) — «أقل من
      // المستهدف» بمبلغ أكبر كان بيبلع «خسارة آخر ٣ أيام» (الحكم بحدودك — ٢٥ أكتوبر)
      var red = function (i) { return i.why && i.why.line ? 1 : 0; };
      var host = perf.filter(function (i) { return i.code !== 'fatigue'; }).sort(function (a, b) {
        return (LEVEL_RANK[b.level] - LEVEL_RANK[a.level]) || (red(b) - red(a)) || ((b.atRisk ? 1 : 0) - (a.atRisk ? 1 : 0)) ||
          ((b.amount || 0) - (a.amount || 0)) || (PERF_ORDER.indexOf(a.code) - PERF_ORDER.indexOf(b.code));
      })[0];
      perf.forEach(function (i) {
        if (i === host) return;
        if (LEVEL_RANK[i.level] > LEVEL_RANK[host.level]) { host.level = i.level; host.why = i.why; }   // سبب المستوى ييجي من اللي رفعه
        if (i.code === 'fatigue') {
          host.detail += i.inline || '';
          host.advice += t('al.fatigue.inA');
          if (host.metrics.indexOf('frequency') < 0) host.metrics = host.metrics.concat(['frequency']);
        } else if (i.inline) {
          // خط تاني اتخطّى على نفس الإعلان (عائد تحت حد الخسارة + تكلفة طلب فوق أقصى تكلفة + ٣ أيام دون مشتريات): جملته جوه المضيف —
          // صاحب المنتج عايز يشوف كل سبب، مش واحد بس
          host.detail += i.inline;
        }
      });
      issues = issues.filter(function (i) { return perf.indexOf(i) < 0 || i === host; });
    }
    // «عائد ممتاز — زوّد الميزانية» جنب مشكلة على نفس الإعلان (حساب نموذجي: «عاجل — يومان دون مشتريات» و«فرصة» معاً على إعلان
    // أسبوعه ×١١): اقتراحين عكس بعض. زي «فرصة زيادة» (hasProblem فوق) — الفرصة بتستنى لحد ما المشكلة تتحل
    if (issues.some(function (i) { return (i.level === 'critical' || i.level === 'warning') && !i.quiet; })) {
      issues = issues.filter(function (i) { return i.code !== 'roas-great'; });
    }

    // «لم يُحكم بعد» بدل «جيد» لما البيانات متكفيش للحكم (قرار صاحب المنتج ٧ أكتوبر ٢٠٢٦) — «جيد» بقى حكم بدليل:
    // إعلان المبيعات بعائد فوق حد الخسارة على أسبوع فيه دليل كفاية، والباقي بنتائج كفاية وتكلفة مش أعلى من الحساب
    // «لا يأخذ إنفاقاً كافياً» (ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦): إعلان نشط خلّص فترة التعلّم وإنفاقه في الأسبوع أقل من
    // تكلفة نتيجة واحدة بمتوسط الحساب = المنصة مش بتديله إنفاق. quiet: على الكارت وفي التفاصيل بس، مش في قائمة التنبيهات ولا
    // «يحتاج انتباهك الآن» (حسابات الميزانية على مستوى الحملة فيها إعلانات كتير بإنفاق صغير — كانت هتغرق القائمة).
    // من ١٩ أكتوبر ٢٠٢٦ (المرحلة ٥ ه٨، بموافقة صاحب المنتج): حالة محايدة «لم يُحكم بعد — يأخذ إنفاقاً قليلاً» مش «يحتاج إلى
    // تحسين» بالأصفر. Meta (Understand fluctuations — الأثر التفصيلي): النظام بيدي الإعلان إنفاق أقل لأن إخواته أكفأ عنده في
    // نفس الوقت، فده مش عيب في الإعلان نفسه — حساب حقيقي: ١٤ من ١٥ إعلان أصفر كانوا بالقاعدة دي لوحدها، ومفيش ولا إعلان «جيد»
    // وبس لو مفيش خط اتخطّى (الحكم بحدودك): إعلان صرف ٣٥ $ والحد ٢٠ $ للطلب وعائده تحت حد الخسارة مش «يأخذ إنفاقاً قليلاً»
    var lineCrossed = issues.some(function (i) { return (i.level === 'critical' || i.level === 'warning') && !i.quiet; });
    var underspend = c.active && !learning && age != null && age > s.learningDays && c.results != null && !!avgCpr && spendW > 0 && spendW < avgCpr && !lineCrossed;
    // إعلان مبيعات بيكسب على القليل اللي بياخده (طلبين أو أكتر وعائده عند المستهدف): «فرصة» وقراءة مبدئية، مش «يحتاج إلى تحسين» —
    // حساب Snapchat حقيقي ١١ أكتوبر: طلبين بـ١٧$ (×٩٫٣) كان عليه «لا يأخذ إنفاقاً كافياً» بالأصفر كأن المشكلة فيه. ومش «جيد»: الإنفاق
    // أقل من تكلفة نتيجة واحدة، فالدليل لسه مبدئي. لغير إعلان المبيعات «التكلفة أقل من المتوسط» مضمونة تلقائياً لأي إعلان صرف أقل من
    // تكلفة نتيجة وجاب نتيجة، فقاعدة صاحب المنتج زي ما هي
    var starvedWin = underspend && profitAd && hasGoal && resW >= 2 && roasW >= s.roasTarget;
    if (underspend) {
      var usVars = { name: name, age: daysText(age, fmt), spend: money(spendW), count: countText(resW, c.resultKey, fmt), label: label, one: one, avg: money(avgCpr),
        cpr: resW > 0 ? money(spendW / resW) : '' };
      var us = starvedWin
        ? makeIssue('opportunity', ['spend'], t('al.underspendWin.t'), t('al.underspendWin.d', usVars), t('al.underspendWin.a'), 0, 'underspend-win')
        : makeIssue('info', ['spend'], t('al.underspend.t'), t(resW > 0 ? 'al.underspend.d' : 'al.underspend.dZero', usVars), t('al.underspend.a'), 0, 'underspend');
      us.quiet = true;
      issues.push(us);
    }

    var pend = null;
    var raisedNow = issues.some(function (i) { return (i.level === 'critical' || i.level === 'warning') && !i.quiet; });
    if (underspend) pend = starvedWin ? 'prelimAbove' : 'underspend';
    else if (learning) pend = 'learning';
    else if (!any(daily)) pend = 'noSpend';   // ولا مليم في النافذة كلها (حتى النهارده) — c.spend للأيام المكتملة بس
    else if (c.results == null) pend = 'noGoal';
    else if (profitAd && !hasGoal) pend = 'noTarget';
    // مفيش أي مرجع (ولا حد محدد، ولا إعلانات تانية بنتائج، ولا قيمة طلب لإعلان المبيعات)
    // (وغير المبيعات من غير حد محدد ومن غير إعلانات تانية بنتائج: مفيش حاجة نقارن بيها)
    else if (!R || (!profitAd && !maxCost && !othersHave)) pend = 'noRef';
    // «جيد» = صرف ضعف التكلفة المسموحة لنتيجة (R) ومعاه نتيجتين على الأقل، ومفيش خط اتخطّى (قرار صاحب المنتج ٧ أكتوبر: «جيد» محتاج
    // نتائج كفاية). أقل من كده «لم يُحكم بعد» بالمبلغ اللي محتاجه
    else if (!raisedNow && (!judgedW || resW < 2)) pend = 'little';
    // نتيجة على الأقل وإنفاق ≥ R: حكم مبدئي بالمقارنة (مع المستهدف لإعلان المبيعات، ومع باقي إعلاناتك لغيره)
    if (pend === 'little' && resW > 0 && spendW >= R && (profitAd || refCpr)) {
      if (profitAd) pend = roasW < s.roasBreakEven ? 'prelimLoss' : (roasW < s.roasTarget ? 'prelimBelow' : 'prelimAbove');
      else { var rel = spendW / resW / refCpr; pend = rel <= 0.85 ? 'prelimBetter' : (rel >= 1.15 ? 'prelimWorse' : 'prelimSimilar'); }
    }
    // «جيد» لغير المبيعات = تكلفة مش أعلى من المرجع (قرار صاحب المنتج ٧ أكتوبر ٢٠٢٦). أغلى بـ١٥٪ أو أكتر بدليل (احتمال الصدفة أقل من
    // ٥٪ — نفس معيار «مهم») بس الفرق أقل من حد التنبيه = «لم يُحكم بعد» بالسبب، مش «جيد» (التدقيق العميق ٢٤ أكتوبر، حساب حقيقي: أغلى
    // ٤٢٪ من باقي الإعلانات و«جيد» ورقمه بالأحمر). بالدليل مش بالرقم لوحده: أول نسخة (الرقم بس) نقلت ثلث الإعلانات السليمة في محاكاة
    // حساب كل إعلاناته بنفس الأداء من «جيد» لـ«أغلى» (من ٩٠٪ «جيد» لـ٥٩٪) — تذبذب عدد صغير. أقصى تكلفة محددة = هي الخط
    if (!pend && c.active && !profitAd && !maxCost && avgCpr && othersHave && ownCpr != null && refCpr && ownCpr >= refCpr * 1.15 && pFew < P_LIKELY &&
        !issues.some(function (i) { return (i.level === 'critical' || i.level === 'warning') && !i.quiet; })) pend = 'costlier';

    // سطر «على أي أساس الحكم» في تفاصيل الإعلان — حتى الإعلان «الجيد» بيقول ليه
    var basis = null;
    if (underspend && !starvedWin) basis = t('basis.underspend', { spend: money(spendW), one: one, avg: money(avgCpr) });
    else if (pend) basis = pendText(pend);
    else if (profitAd && hasGoal && roasW != null) {
      basis = t('basis.profit', { roas: rr(roasW), target: fmt.num(s.roasTarget) }) + (purch.roas != null && !selfAcc ? t('basis.vsAcc', { acc: rx(purch.roas, roasW) }) : '') +
        // وأقصى تكلفة الطلب لو محددة — الخطين بيتطبّقوا مع بعض
        (maxCost && ownCpr != null ? ' ' + t('basis.cprMax', { one: one, cpr: money(ownCpr), max: money(maxCost), scope: t(maxScope === 'camp' ? 'al.costMax.camp' : 'al.costMax.acc') }) : '');
    } else if (maxCost && ownCpr != null) {
      // الحكم بأقصى التكلفة المقبولة (خط العميل)، ومعاه باقي الإعلانات لو فيه
      basis = t('basis.cprMax', { one: one, cpr: money(ownCpr), max: money(maxCost), scope: t(maxScope === 'camp' ? 'al.costMax.camp' : 'al.costMax.acc') }) +
        (avgCpr && othersHave ? t('basis.cprRest', { avg: money(refCpr) }) : '');
    } else if (avgCpr && ownCpr != null) {
      basis = t('basis.cpr', { one: one, cpr: money(ownCpr), avg: money(refCpr) });
    }
    // التعديل الأخير (ملاحظة ١٠ أكتوبر): حديث = الحكم بيستنى، والملاحظات «المهمة» بتبقى «للعلم» لأن نتيجة التعديل لسه
    // مظهرتش — والعاجل (هدر واضح) بيفضل زي ما هو. أقدم = الحكم على اللي بعده، وسطر «بعده مقابل قبله» في أساس الحكم
    if (edit && c.active && !learning) {
      var ago = TODAY - edit.idx, what = editText(edit.e);
      var when = ago === 0 ? t('edit.when.0') : (ago === 1 ? t('edit.when.1') : t('edit.when.n', { days: daysText(ago, fmt) }));
      if (editFresh) {
        var urgent = issues.some(function (i) { return i.level === 'critical'; });
        // والفرص كمان (زيادة الميزانية / عائد ممتاز) — مبنية على الأيام اللي قبل التعديل، وسبب الحكم بيقول «ملاحظات ما قبله للعلم فقط».
        // حساب حقيقي ١٨ أكتوبر: «رُفعت ميزانية المجموعة أمس من ١٠ لـ ٢٠ $، ونحتاج ٣ أيام» وجنبه فرصة «زوّد الميزانية» (مراجعة المرحلة ٤)
        // واقتراح الفرصة («زوّد الميزانية») بيستنى هو كمان: تغيير تاني قبل ما أثر الأول يبان بيناقض «ننتظر ٣ أيام للحكم» اللي جنبه —
        // نفس الحساب: الميزانية اتضاعفت أمس والاقتراح كان «قد يستحق اختبار زيادة ميزانيته تدريجياً»
        var waitA = t('al.afterEdit.a', { what: what });
        issues.forEach(function (i) {
          if (i.level !== 'warning' && i.level !== 'opportunity') return;
          if (i.level === 'opportunity') i.advice = waitA;
          i.level = 'info'; i.detail += t('al.afterEditNote');
        });
        if (!urgent) { pend = 'edited'; basis = t('pend.edited.d', { what: what, when: when }); }
      } else if (basis) {
        var pre = { s: sum(daily, 0, edit.idx - 1), r: sum(results, 0, edit.idx - 1), v: sum(sales, 0, edit.idx - 1) };
        // «بعده مقابل قبله» بس لو كل جانب صرف تكلفة نتيجة على الأقل وفيه نتائج — حساب حقيقي: «×٠ مقابل ×٠» و«×١٫٤ مقابل
        // ×٢٤٫٤» على ١٠ ريال قبل التعديل كانوا بيظهروا
        var cmp = '', floor = evidenceCpr || 0, enough = pre.s >= floor && spendW >= floor && pre.s > 0 && spendW > 0;
        // «قبله» = الأيام اللي قبل التعديل جوه النافذة بس — لو يوم واحد بنقول كده (كان «×٤٫١ قبله» وهو يوم واحد قصاد ٥)
        var preTxt = edit.idx === 1 ? t('basis.edit.pre1') : t('basis.edit.preN', { n: daysText(edit.idx, fmt) });
        if (enough && profitAd && pre.v + salesW > 0 && pre.r + resW >= 2) cmp = t('basis.edit.roas', { after: fmt.num(salesW / spendW), before: fmt.num(pre.v / pre.s), pre: preTxt });
        else if (enough && !profitAd && pre.r > 0 && resW > 0) cmp = t('basis.edit.cpr', { one: one, after: money(spendW / resW), before: money(pre.s / pre.r), pre: preTxt });
        basis += t('basis.edit.window', { what: what, when: when }) + cmp;
      }
    }
    // ق٦: إخوات الإعلان الجديد يعرفوا السبب — «أرقام هذه الأيام غير مستقرة» (وبرضه القواعد الموصوفة فوق مش بتوصل عاجل)
    if (reLearn && c.active && basis) {
      // Meta: «رجعت لمرحلة التعلّم» (موثّق عندها). غيرها: سبب التوزيع وحده — تقاسم ميزانية المجموعة (setLearns)
      basis += t(c.setLearns ? 'basis.relearn' : 'basis.relearnShare',
        { when: newSib === 0 ? t('edit.when.0') : (newSib === 1 ? t('edit.when.1') : t('edit.when.n', { days: daysText(newSib, fmt) })) });
    }
    // ألوان أرقام الكارت (ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦: «كل النص رمادي وأسود»): أخضر/أحمر خفيف على العائد مقارنةً
    // بالمستهدف وحد الخسارة لإعلان المبيعات (الربح أولاً)، وعلى تكلفة النتيجة مقارنةً بمتوسط الحساب لغيره (±١٥٪) —
    // بس للإعلان اللي اتحكم عليه فعلاً (مش «لم يُحكم بعد» ولا متوقف)
    // الإعلان المتعدَّل: أرقام الكارت للأسبوع كله والحكم على اللي بعد التعديل — لون على رقم مش هو اللي اتحكم عليه كان هيناقضه
    // (تكلفة ١٤٤ للأسبوع بالأخضر لأن تكلفته بعد التعديل ٥٠)، فمن غير ألوان خفيفة
    var tones = {};
    if (weekStart) { /* من غير ألوان */ }
    else if (profitAd && hasGoal && R && spendW >= R && roasW != null) tones.roas = roasW >= s.roasTarget ? 1 : (roasW < s.roasBreakEven ? -1 : 0);
    // أقصى التكلفة المقبولة محددة: اللون بالنسبة لها (خط العميل) — فوقها أحمر، وأقل منها بـ١٥٪ أو أكتر أخضر
    else if (!profitAd && maxCost && ownCpr) { tones.cpr = ownCpr > maxCost ? -1 : (ownCpr <= maxCost * 0.85 ? 1 : 0); tones.cprMax = true; }
    else if (!profitAd && avgCpr && ownCpr && othersHave) tones.cpr = ownCpr <= refCpr * 0.85 ? 1 : (ownCpr >= refCpr * 1.15 ? -1 : 0);
    // سبب «لم يُحكم بعد» والإعلان عليه تنبيه مهم أو عاجل (المراجعة الثانية للمرحلة ٥): الحالة «يحتاج إلى تحسين» وسبب الحكم تحتها
    // «لا نحكم على الإعلان قبل أن يُكمل ٣ أيام» — جملتين بيناقضوا بعض. سبب الحكم العام بيفضل، ومعاه التنبيه اللي حدّد الحالة
    var raisedTop = issues.filter(function (i) { return (i.level === 'critical' || i.level === 'warning') && !i.quiet; })
      .sort(function (a, b) { return (LEVEL_RANK[b.level] - LEVEL_RANK[a.level]) || ((b.amount || 0) - (a.amount || 0)); })[0];
    if (pend && raisedTop && basis && c.active) basis += t('basis.butAlert', { title: raisedTop.title });
    // اللون على التكلفة بالنسبة لباقي الحملة: التلميح بيقول كده (ui.js tnTip)
    if (tones.cpr != null && !tones.cprMax && campRef) tones.cprCamp = true;
    var out = done(pend, basis);
    out.tones = out.health === 'pending' || out.health === 'inactive' ? {} : tones;
    // عنوان «لم يُحكم بعد» على الكارت بالمرجع نفسه («أغلى من باقي إعلانات حملته»…) — ui.js
    out.pendingTitle = out.pending ? t('pend.' + out.pending + '.t', {}) : null;
    out.refScope = campRef ? 'camp' : 'acc';
    // سطر «لماذا هذا المستوى» لكل تنبيه عاجل أو مهم (بعد الدمج والتخفيض — الإعلان الصغير والتعديل الحديث ليهم سطرهم في النص نفسه)
    out.issues.forEach(function (i) { i.levelWhy = levelWhy(i); });
    // الإعلان المتعدَّل: عدد الأيام المكتملة اللي اتحكم عليها (اللي بعد آخر تعديل) — سطر «التقييم مبني على…» في التفاصيل (ui.js).
    // null = الأسبوع كله
    out.days = weekStart ? YESTERDAY - weekStart + 1 : null;
    return out;
  }

  // تنبيه واحد لكل مجموعة إعلانية (ISA-18.2 وEEMUA 191 — إنذار واحد لكل حالة غير طبيعية، والتابع بيتدمج في الأصلي): لو إعلانين أو
  // أكتر في نفس المجموعة عليهم تنبيه تكلفة أو إنفاق دون نتائج، السبب غالباً المجموعة نفسها (الجمهور، المزايدة، الصفحة) مش كل إعلان
  // لوحده (التدقيق العميق ٢٤ أكتوبر ٢٠٢٦ — حساب حقيقي: ٤ إعلانات في مجموعة واحدة، كل واحد عليه «تكلفة مرتفعة — عاجل»، والمجموعة كلها
  // ×٥ من باقي حملتها: ٤ خانات من ٥ في «يحتاج انتباهك الآن» لمشكلة واحدة). المضيف = الأعلى مستوى ثم الأكبر بالفلوس، ونصه بيذكر
  // الباقيين (setMerged — المُشغّل بيعتبرهم قايمين عشان محدش منهم يتقال عليه «حُلّت» غلط). كروت الإعلانات نفسها بتفضل بأحكامها
  var SET_MERGE = { cpr: 1, 'waste-week': 1, waste: 1, 'waste-early': 1, 'cost-max': 1 };
  function mergeBySet(list, fmt) {
    var groups = {}, drop = [];
    list.forEach(function (a) {
      if (!a.adsetId || !SET_MERGE[a.code] || a.minor || (a.level !== 'critical' && a.level !== 'warning')) return;
      (groups[a.adsetId] = groups[a.adsetId] || []).push(a);
    });
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      if (g.length < 2) return;
      g.sort(function (x, y) { return (LEVEL_RANK[y.level] - LEVEL_RANK[x.level]) || ((y.amount || 0) - (x.amount || 0)); });
      var host = g[0], others = g.slice(1), n = others.length;
      var sep = global.I18N && global.I18N.lang === 'en' ? ', ' : '، ';
      var names = others.slice(0, 3).map(function (o) { return t('al.name', { name: o.adName }); }).join(sep) +
        (n > 3 ? t('al.setMerge.more', { n: fmt.int(n - 3) }) : '');
      host.detail += t(n === 1 ? 'al.setMerge1' : (n === 2 ? 'al.setMerge2' : 'al.setMerge'), { n: fmt.int(n), ads: global.I18N ? global.I18N.noun(n, 'n.ad') : '', names: names });
      host.advice += t('al.setMerge.a');
      host.setMerged = others.map(function (o) { return o.adId; });
      drop = drop.concat(others);
    });
    return drop.length ? list.filter(function (a) { return drop.indexOf(a) < 0; }) : list;
  }

  // ملاحظة على إعلان صغير بالنسبة لحسابه: بتفضل ظاهرة في تفاصيله "للعلم"، بس مش تنبيه —
  // مبتظهرش في صفحة التنبيهات، ومبتلوّنش الإعلان، ومبتدخلش في "الميزانية المعرّضة للهدر"
  function minor(i) {
    i.level = 'info';
    i.minor = true;
    i.atRisk = false;
    i.detail += t('al.minorNote');
    return i;
  }

  // pend = سبب «لم يُحكم بعد» (learning / noSpend / noGoal / small / little / noRef)، وbasis = سطر أساس الحكم
  function finalize(c, issues, pend, basis) {
    var worst = issues.reduce(function (m, i) { return Math.max(m, LEVEL_RANK[i.level]); }, -1);
    var health;
    // الإعلان المتوقف بيبقى "يحتاج مراجعة" بس لو عليه تنبيه عاجل (وقف فجأة وهو بيصرف) —
    // إعلان مرفوض من شهور ومحدش بيصرف عليه مش محتاج حاجة، فبيفضل "غير فعال"
    if (!c.active) health = worst === LEVEL_RANK.critical ? 'review' : 'inactive';
    else if (worst === LEVEL_RANK.critical) health = 'review';
    else if (worst === LEVEL_RANK.warning) health = 'improve';
    else health = pend ? 'pending' : 'good';
    // كل مقياس عليه ملاحظة بياخد أسوأ مستوى — عشان نلوّنه جوه الكارت
    var metricLevels = {};
    issues.forEach(function (i) {
      i.metrics.forEach(function (m) {
        if (i.level !== 'critical' && i.level !== 'warning' && i.level !== 'opportunity') return;
        if (!metricLevels[m] || LEVEL_RANK[i.level] > LEVEL_RANK[metricLevels[m]]) metricLevels[m] = i.level;
      });
    });
    issues.sort(function (a, b) { return (LEVEL_RANK[b.level] - LEVEL_RANK[a.level]) || (b.amount - a.amount); });
    return { health: health, issues: issues, metricLevels: metricLevels, pending: health === 'pending' ? pend : null, basis: c.active ? basis || null : null };
  }

  // حالات حساب Meta اللي فيها مشكلة — النص في i18n.js تحت acct.<رقم الحالة>
  var META_ACCOUNT_STATUS = { 2: 1, 3: 1, 7: 1, 8: 1, 9: 1, 100: 1, 101: 1 };

  function evaluateAccount(source, ads, acc, meta, s, fmt, byAd) {
    var alerts = [];
    var cur = (meta && meta.currency) || (ads[0] && ads[0].currency);
    var money = function (n) { return fmt.money(n, cur); };
    var accName = (meta && meta.label) || (ads[0] && ads[0].platform) || source;

    // مشكلة الحساب (دفع، حد صرف) والإنفاق وقف فعلاً النهارده: «قد تتوقف» بتبقى «الأرجح توقفت بالفعل» (مراجعة ١١ أكتوبر ٢٠٢٦، حساب
    // حقيقي: مبلغ مستحق غير مسدّد، وصفر إنفاق الساعة ١٠ بالليل مقابل نحو ٢٥٠ في اليوم — والتنبيه كان بيقول «قد تتوقف»).
    // بعد الضهر بتوقيت الحساب بس (أول اليوم الصفر طبيعي)، ولو أمس كان فيه صرف
    var stoppedToday = function () {
      var hr = meta && meta.timeZone ? hourInTz(meta.timeZone) : null;
      var avg = sum(acc.spendByDay, 0, YESTERDAY) / (YESTERDAY + 1);
      if (hr == null || hr < 12 || (acc.spendByDay[TODAY] || 0) > 0 || !((acc.spendByDay[YESTERDAY] || 0) > 0) || !(avg > 0)) return '';
      return t('al.acct.stoppedToday', { hour: t(hr === 12 ? 'al.clock.noon' : 'al.clock.pm', { h: fmt.int(hr === 12 ? 12 : hr - 12) }), avg: money(avg) });
    };
    if (meta && meta.metaAccountStatus != null && meta.metaAccountStatus !== 1) {
      alerts.push(makeIssue('critical', ['account'], t('al.acct.t'),
        t(META_ACCOUNT_STATUS[meta.metaAccountStatus] ? 'acct.' + meta.metaAccountStatus : 'acct.other') + stoppedToday(),
        t('al.acct.a'), 0, 'acct-status'));
    }

    if (meta && meta.spendCapReached) {
      alerts.push(makeIssue('critical', ['account'], t('al.cap.t'),
        t('al.cap.d', { acc: accName }) + stoppedToday(), t('al.cap.a'), 0, 'spend-cap'));
    }

    // إعلانات كانت بتصرف ووقفت بسبب مشكلة في الحساب — تنبيه واحد للحساب كله.
    // لو فيه تنبيه حالة الحساب أو حد الصرف فوق، هو نفسه اللي بيشرح السبب فمش بنكرر
    var acctStopped = ads.filter(function (c) { return !c.active && ACCOUNT_STOP[c.pausedLevel] && recentSpend(c) > 0; });
    if (acctStopped.length && !alerts.length) {
      var n = acctStopped.length;
      alerts.push(makeIssue('critical', ['account'], t('al.acctStopped.t'),
        t('al.acctStopped.d', { n: fmt.int(n), ads: global.I18N ? global.I18N.noun(n, 'n.ad') : '', acc: accName }),
        t('al.acctStopped.a'), 0, 'acct-stopped'));
    }

    var spendY = acc.spendByDay[YESTERDAY];
    var prevAvg = sum(acc.spendByDay, 0, DAY_BEFORE) / (DAY_BEFORE + 1);
    // عدد الأيام اللي المتوسط اتحسب عليها بيتكتب في النص: «متوسط ٣٠٠ يومياً» جنب «أُنفق ١٬٨٩٠ خلال آخر ٧ أيام» كان
    // بيبان غلط (١٬٨٩٠ ÷ ٧ = ٢٧٠) — المتوسط على الأيام اللي قبل أمس بس (مراجعة المرحلة ٤، حساب حقيقي ١٨ أكتوبر)
    var prevDays = fmt.int(DAY_BEFORE + 1);
    if (prevAvg > 0) {
      // لو فيه تنبيه حساب عاجل فوق (دفع، حد صرف، إعلانات وقفت) فهو اللي بيفسّر الوقوف ده — منكررش
      var acctAlreadyFlagged = alerts.length > 0;
      if (spendY === 0 && acctAlreadyFlagged) {
        // مفيش تنبيه تاني
      } else if (spendY === 0 && !acc.activeCount) {
        // مفيش ولا إعلان شغّال: صاحب الحساب وقّف كل حاجة بنفسه (نهاية حملة، إجازة) — ده مش عطل
      } else if (spendY === 0) {
        alerts.push(makeIssue('critical', ['account'], t('al.acctZero.t'),
          t('al.acctZero.d', { acc: accName, avg: money(prevAvg), n: prevDays }), t('al.acctZero.a'), 0, 'acct-zero'));
      } else if (spendY >= prevAvg * s.accountSpikeMultiple) {
        // الزيادة بتتنبّه بس لو النتائج مازادتش معاها — زيادة مفيدة مش حاجة عاجلة
        // النتائج بوحدة واحدة (كل نوع بمتوسط تكلفته — accountStats equivByDay، ر٦٩): محادثات رخيصة كتير مكانتش تغطي على عملاء
        // محتملين زادوا مع الإنفاق
        var resPrev = sum(acc.equivByDay, 0, DAY_BEFORE) / (DAY_BEFORE + 1), resY = acc.equivByDay[YESTERDAY];
        var resultsKeptUp = resPrev > 0 && resY / resPrev >= (spendY / prevAvg) * 0.8;
        if (!resultsKeptUp) {
          // رفع ميزانية جوه الحساب في آخر ٣ أيام (سجل Meta — c.edits): الزيادة من فعل المعلن نفسه، فالتنبيه بيقول كده (ISA-18.2: الإنذار
          // يفرّق بين فعل المشغّل والحالة غير الطبيعية). بيفضل «مهم»: النتائج مزادتش معاها، وده بالظبط اللي يستاهل يتشاف (التدقيق العميق
          // ٢٤ أكتوبر — حساب حقيقي: الميزانية اترفعت ١٠ أضعاف من يومين والتنبيه بيقول «ارتفاع مفاجئ» من غير ما يذكر السبب)
          var lastRaise = null;
          ads.forEach(function (c) {
            (c.edits || []).forEach(function (e) {
              var i = (c.dailyDates || []).indexOf(e.date);
              if (e.kind !== 'budget' || !(e.to > e.from) || i < YESTERDAY - 2 || i > YESTERDAY) return;   // رفع النهارده مبيفسّرش إنفاق أمس
              if (!lastRaise || i > lastRaise.idx || (i === lastRaise.idx && e.to - e.from > lastRaise.e.to - lastRaise.e.from)) lastRaise = { e: e, idx: i };
            });
          });
          var raiseTxt = '';
          if (lastRaise) {
            var ago = TODAY - lastRaise.idx, le = lastRaise.e;
            raiseTxt = t('al.acctSpike.edit', { what: t('edit.budget.up', { lvl: t('edit.lvl.' + le.level), from: fmt.money(le.from / unitOf(cur), cur), to: fmt.money(le.to / unitOf(cur), cur) }),
              when: ago === 0 ? t('edit.when.0') : (ago === 1 ? t('edit.when.1') : t('edit.when.n', { days: daysText(ago, fmt) })) });
          }
          alerts.push(makeIssue('warning', ['account'], t('al.acctSpike.t'),
            t('al.acctSpike.d', { acc: accName, spend: money(spendY), avg: money(prevAvg), n: prevDays, pct: fmt.int((spendY / prevAvg - 1) * 100) }) + raiseTxt,
            t('al.acctSpike.a'), spendY - prevAvg, 'acct-spike'));
        }
      } else if (spendY <= prevAvg * s.accountDropRatio) {
        // النزول بدأ من أول امبارح (اليومين تحت النص): المتوسط من الأيام اللي قبلهم، والنص بيقول «في آخر يومين» —
        // كان بيقول «أمس فقط مقابل متوسط ٥٧» والمتوسط نفسه فيه يوم النزول الأول (حساب Snapchat حقيقي ١١ أكتوبر)
        var dayB = acc.spendByDay[DAY_BEFORE] || 0, base = DAY_BEFORE > 0 ? sum(acc.spendByDay, 0, DAY_BEFORE - 1) / DAY_BEFORE : 0;
        if (base > 0 && dayB <= base * s.accountDropRatio) {
          var two = (dayB + spendY) / 2;
          alerts.push(makeIssue('warning', ['account'], t('al.acctDrop.t'),
            t('al.acctDrop.d2', { acc: accName, spend: money(two), avg: money(base), n: fmt.int(DAY_BEFORE), pct: fmt.int((1 - two / base) * 100) }),
            t('al.acctDrop.a'), 0, 'acct-drop'));
        } else {
          alerts.push(makeIssue('warning', ['account'], t('al.acctDrop.t'),
            t('al.acctDrop.d', { acc: accName, spend: money(spendY), avg: money(prevAvg), n: prevDays, pct: fmt.int((1 - spendY / prevAvg) * 100) }),
            t('al.acctDrop.a'), 0, 'acct-drop'));
        }
      }
    }

    // حد الإنفاق قرّب يخلص (٩٠٪ فأكتر): «عاجل» لو الباقي يكفي أسبوع أو أقل بمتوسط إنفاق الحساب، غير كده «مهم».
    // بعد تنبيهات الوقوف فوق عشان ميمنعهاش (acctStopped بتتشال لو فيه تنبيه حساب قبلها)
    if (meta && !meta.spendCapReached && meta.spendCap > 0 && meta.amountSpent >= CAP_NEAR * meta.spendCap) {
      var left = (meta.spendCap - meta.amountSpent) / unitOf(cur);   // Meta بترجّع الاتنين بأصغر وحدة للعملة (سنت)
      // total7 = الأيام المكتملة بس (YESTERDAY + 1)، مش خانات النافذة (فيها النهارده) — كانت بتقسم ٧ أيام إنفاق على ٨،
      // فالباقي «يكفي نحو ٧ أيام» وهو ٦٫٥ والتنبيه «مهم» بدل «عاجل» (مراجعة المرحلة ٤، ١٧ أكتوبر ٢٠٢٦)
      var perDay = acc.total7 / (YESTERDAY + 1), daysLeft = perDay > 0 ? left / perDay : null;
      alerts.push(makeIssue(daysLeft != null && daysLeft <= CAP_NEAR_DAYS ? 'critical' : 'warning', ['account'], t('al.capNear.t'),
        t(daysLeft != null ? 'al.capNear.d' : 'al.capNear.dNoRate', { acc: accName, pct: fmt.int(meta.amountSpent / meta.spendCap * 100),
          left: money(left), days: daysLeft != null && daysLeft < 1 ? t('al.capNear.lessDay') : daysText(Math.floor(daysLeft || 0), fmt) }),
        t('al.capNear.a'), 0, 'spend-cap-near'));
    }

    // أكبر مصدر مبيعات في الحساب وقف (لأي سبب، حتى لو بقصد): «عاجل» — لو مش مقصود كل ساعة بتفرق، ولو مقصود
    // فالرسالة بتتأكد إن فيه بديل. «أكبر» = ربع مبيعات الحساب في آخر ٧ أيام أو أكتر (أو نتائجه لو مفيش قيمة مبيعات)،
    // وكان بيصرف لحد امبارح (وقف قريب — مش إعلان واقف من أسبوع). الحملة كلها لو كل إعلاناتها وقفت، وإلا الإعلان لوحده
    // أيام مكتملة (لحد امبارح) زي «مبيعاته في ٧ أيام» جنب التنبيه (ui.js alertMoneyHtml) — النهارده كان داخل في الرقم اللي في النص
    // من غير مبيعات: النتائج، ولو الحساب فيه أكتر من نوع كل نتيجة بمتوسط تكلفة نوعها (ر٦٩ — العدد نفسه بيخلط محادثة بعميل محتمل)
    var valueOf = function (c) {
      if (acc.hasSales) return sum(c.dailySales || [], 0, YESTERDAY);
      var g = acc.mixedTypes && c.resultKey ? acc.byLabel[c.resultKey] : null;
      return (c.results || 0) * (acc.mixedTypes ? ((g && g.avgCpr) || 0) : 1);
    };
    var totalValue = ads.reduce(function (s0, c) { return s0 + valueOf(c); }, 0);
    // الحساب كله واقف (مفيش ولا إعلان شغّال) = صاحبه وقّف كل حاجة بنفسه، والوقوف غير المقصود للحساب كله
    // (دفع، حد إنفاق، حالة الحساب) ليه تنبيهاته فوق
    if (totalValue > 0 && acc.activeCount > 0) {
      var justStopped = function (c) { return !c.active && sum(c.daily || [], DAY_BEFORE, TODAY) > 0; };
      var topText = function (name, value, share, status) {
        return t(acc.hasSales ? 'al.topStopped.d' : (acc.mixedTypes ? 'al.topStopped.dResMix' : 'al.topStopped.dRes'), { name: name, pct: fmt.int(share * 100), value: money(value), status: status });
      };
      var camps = {}, doneCamp = {};
      ads.forEach(function (c) {
        if (!c.campaignId) return;
        var cg = camps[c.campaignId] = camps[c.campaignId] || { ads: [], value: 0, spend: 0, name: c.campaignName || c.placement };
        cg.ads.push(c); cg.value += valueOf(c); cg.spend += c.spend || 0;
      });
      Object.keys(camps).forEach(function (k) {
        var cg = camps[k], share = cg.value / totalValue;
        if (share < TOP_SHARE || cg.ads.some(function (c) { return c.active; }) || !cg.ads.some(justStopped)) return;
        doneCamp[k] = true;
        var ct = makeIssue('critical', ['status'], t('al.topStopped.t'),
          topText(t('al.topStopped.camp', { name: cg.name }), cg.value, share, t('st.' + (cg.ads[0].pausedLevel || 'ad'))), t('al.topStopped.a'), cg.spend, 'top-stopped');
        ct.objectId = 'c:' + k; ct.impactSpend = cg.spend;
        alerts.push(ct);
      });
      ads.forEach(function (c) {
        var share = valueOf(c) / totalValue;
        if (share < TOP_SHARE || doneCamp[c.campaignId] || !justStopped(c)) return;
        // الوقوف غير المقصود (رفض، مشكلة) عليه تنبيه «توقف فجأة» أصلاً على الإعلان نفسه — منكررش
        if (UNINTENDED_STOP[c.pausedLevel] || c.reviewStatus === 'disapproved') return;
        var at = makeIssue('critical', ['status'], t('al.topStopped.t'),
          topText(t('al.name', { name: c.offer || c.headline || c.id }), valueOf(c), share, t('st.' + (c.pausedLevel || 'ad'))), t('al.topStopped.a'), c.spend, 'top-stopped');
        at.adId = c.id; at.adName = c.offer || c.headline || c.id;
        alerts.push(at);
      });
    }

    // تركيز الميزانية في إعلان أداؤه ضعيف. «ضعيف» = حكم الإعلان نفسه (تنبيه عاجل أو مهم على نتائجه أو تكلفتها أو عائده) —
    // مراجعة المرحلة ٤ (١٧ أكتوبر ٢٠٢٦): كانت قاعدة لوحدها (تكلفة النتيجة أعلى من المتوسط بـ٢٠٪)، فأفضل إعلان مبيعات في الحساب
    // (عائد ×٤ والمستهدف ×٣، حكمه «جيد») كان بيطلع عليه «إعلان أقل أداءً… نتائجه دون متوسط الحساب».
    // من المراجعة الثانية للمرحلة ٥ (ISA-18.2 — الإنذار التابع بيتدمج في الأصلي): جملة واقتراح جوه تنبيه الإعلان نفسه، مش تنبيه
    // تاني عن نفس الإعلان ونفس المشكلة (كان بياخد خانة تانية من ٥ في «يحتاج انتباهك الآن»). byAd لسه مااتنسخش لقائمة التنبيهات
    // (analyze بينسخه بعد الدالة دي)، فالتعديل بيوصل للقائمة والبريد
    if (acc.total7 > 0 && acc.activeCount >= 2) {
      ads.forEach(function (c) {
        var share = (c.spend || 0) / acc.total7;
        // حملة كاملة (Performance Max) طبيعي تاخد جزء كبير من الميزانية — مش "إعلان واحد" متركز فيه الصرف
        if (share < CONC_SHARE || !c.active || c.campaignLevel) return;
        var weak = ((byAd && byAd[c.id] && byAd[c.id].issues) || []).filter(function (i) {
          return (i.level === 'critical' || i.level === 'warning') && !i.quiet && i.metrics.some(function (m) { return m === 'results' || m === 'cpr' || m === 'roas'; });
        })[0];
        // الإعلان أحسن من متوسط إعلانات المبيعات في الحساب (better): مفيش «إعلانات أفضل أداءً» ننقل ليها ميزانيته
        if (!weak || weak.better) return;
        weak.advice += t('al.conc.in', { pct: fmt.int(share * 100) });
      });
    }

    alerts.forEach(function (a) {
      a.source = source; a.accountName = accName; a.currency = cur;
      // مشاكل الحساب نفسه (دفع، وقوف كامل) أهم من أي إعلان منفرد — تطلع أول القائمة في مستواها
      if (a.level === 'critical' && !a.adId) a.amount = Number.MAX_SAFE_INTEGER;
      // حجم المشكلة: تنبيهات الإعلان الواحد (التركيز، أكبر مصدر وقف) بإنفاقه، والحملة بإنفاقها، والباقي الحساب كله
      var concAd = a.adId ? ads.filter(function (c) { return c.id === a.adId; })[0] : null;
      var own = concAd ? concAd.spend : a.impactSpend;
      setImpact(a, own != null ? own : acc.total7, acc.total7, cur, fmt, own == null);
      addCompare(a, concAd, fmt);
    });
    return alerts;
  }

  // حجم المشكلة في ميزانية صاحب النشاط: إنفاق الإعلان (أو الحساب) خلال آخر ٧ أيام ونسبته من إنفاق الحساب —
  // رقم واحد بنفس المعنى في كل التنبيهات، وبيه بنرتّب التنبيهات جوه كل مستوى (الأكبر في الميزانية الأول)
  // المقارنة في التنبيه (قرار صاحب المنتج ٦ أكتوبر ٢٠٢٦): كل التنبيهات مبنية على «الأقرب للمتجر» (نقرة أو سوايب خلال
  // ٧ أيام — meta.js وsnapchat.js وgoogle.js)، وتنبيهات النتائج والتكلفة والعائد بتعرض جنبه رقم المنصة لنفس الإعلان في آخر ٧ أيام (c.plat)، عشان
  // العميل يشوف قد إيه الأداة فرقت في القرار. مفيش سطر لو الرقمين زي بعض أو مفيش مقارنة (TikTok لسه)
  var CMP_METRICS = { results: 1, cpr: 1, roas: 1 };
  function compareText(c, fmt) {
    var pl = c && c.plat;
    if (!pl || pl.results == null || c.results == null) return null;
    // أيام مكتملة بس زي الإنفاق والطلبات ورقم المنصة (c.sales — meta.js وsnapchat.js وgoogle.js): مبيعات النهارده كانت
    // بتتجمع هنا لوحدها، فالعائد في السطر بيعلى والسطر بيظهر والرقمين متساويين
    var sales = c.sales != null ? c.sales : sum(c.dailySales || [], 0, YESTERDAY);
    var platSales = pl.sales || 0;
    if (pl.results === c.results && Math.abs(platSales - sales) <= Math.max(0.01 * platSales, 0.01)) return null;
    var roas = function (s) { return c.spend > 0 && s > 0 ? t('al.cmpRoas', { r: fmt.num(s / c.spend) }) : ''; };
    return t('al.compare', { p: countText(pl.results, c.resultKey, fmt), pr: roas(platSales), s: countText(c.results, c.resultKey, fmt), sr: roas(sales) });
  }
  function addCompare(i, c, fmt) {
    if (!c || !(i.metrics || []).some(function (m) { return CMP_METRICS[m]; })) return;
    var cmp = compareText(c, fmt);
    if (cmp) i.compare = cmp;
  }

  function setImpact(i, spend, total, cur, fmt, wholeAccount) {
    spend = spend || 0;
    i.impact = { spend: spend, share: total > 0 ? spend / total : null, account: !!wholeAccount };
    if (spend <= 0) { i.impactText = null; return; }
    if (wholeAccount) { i.impactText = t('al.impactAccount', { spend: fmt.money(spend, cur) }); return; }
    var share = i.impact.share;
    var pct = share == null ? null : (share < 0.01 ? t('al.impactPctLow') : t('al.impactPct', { pct: fmt.int(share * 100) }));
    i.impactText = pct ? t('al.impact', { spend: fmt.money(spend, cur), pct: pct }) : t('al.impactNoPct', { spend: fmt.money(spend, cur) });
  }

  // الدالة الرئيسية
  // candidates: الإعلانات — accountsMeta: { source: { label, currency, metaAccountStatus } }
  // fmt: { money(n, cur), currencyLabel(cur), num(n), int(n) }
  // customSettings = إعدادات واحدة لكل الحسابات (المُشغّل — حساب واحد)، أو { bySource: { 'meta:act_1': {...}, ... } } = إعدادات كل حساب
  // إعلاني لوحده (مراجعة الإعدادات ٢٤ أكتوبر — الإعدادات على مستوى الحساب: متجرين بهامشين مختلفين ليهم حدّين خسارة مختلفين)
  function analyze(candidates, accountsMeta, customSettings, fmt) {
    var perSource = customSettings && customSettings.bySource && typeof customSettings.bySource === 'object' ? customSettings.bySource : null;
    var base = mergeSettings(perSource ? {} : customSettings);
    var settingsOf = function (source) { return perSource ? mergeSettings(perSource[source] || {}) : base; };
    // طول النافذة من البيانات نفسها (٨ خانات في الأداة، و٧ في بيانات قديمة أو اختبارات قديمة)
    setWindow(candidates.reduce(function (m, c) { return Math.max(m, (c.daily || []).length); }, 0));
    WEEK_TXT = fmt && fmt.int ? fmt.int(YESTERDAY + 1) : null;
    var bySource = {};
    candidates.forEach(function (c) { (bySource[c.source] = bySource[c.source] || []).push(c); });

    var byAd = {}, alerts = [], settingsBySource = {};
    Object.keys(bySource).forEach(function (source) {
      var ads = bySource[source];
      var acc = accountStats(ads);
      var s = settingsBySource[source] = settingsOf(source);
      ads.forEach(function (c) {
        byAd[c.id] = evaluateAd(c, acc, s, fmt);
        WEEK_AD = null; REF_CAMP = false;
      });
      // تنبيهات الحساب قبل نسخ تنبيهات الإعلانات للقائمة: «تركّز الميزانية» بيتكتب جوه تنبيه الإعلان نفسه (المراجعة الثانية للمرحلة ٥)
      var accAlerts = evaluateAccount(source, ads, acc, accountsMeta && accountsMeta[source], s, fmt, byAd);
      var adAlerts = [];
      ads.forEach(function (c) {
        byAd[c.id].issues.forEach(function (i) {
          setImpact(i, c.spend, acc.total7, c.currency, fmt, false);
          addCompare(i, c, fmt);
          if (i.quiet) return;   // على الكارت وفي التفاصيل بس (underspend)
          adAlerts.push(Object.assign({ adId: c.id, adsetId: c.adsetId || null, source: source, platform: c.platform, adName: c.offer || c.headline || c.id, currency: c.currency }, i));
        });
      });
      mergeBySet(adAlerts, fmt).forEach(function (a) { alerts.push(a); });
      accAlerts.forEach(function (a) {
        a.platform = ads[0] && ads[0].platform;
        alerts.push(a);
      });
    });

    // الترتيب: المستوى، وبعدين مشاكل الحساب العاجلة (دفع، وقوف كامل)، وبعدين الأكبر في الميزانية
    alerts.sort(function (a, b) {
      return (LEVEL_RANK[b.level] - LEVEL_RANK[a.level]) ||
        ((b.amount === Number.MAX_SAFE_INTEGER) - (a.amount === Number.MAX_SAFE_INTEGER)) ||
        (((b.impact && b.impact.spend) || 0) - ((a.impact && a.impact.spend) || 0)) ||
        (b.amount - a.amount);
    });

    var summary = { health: { review: 0, improve: 0, good: 0, pending: 0, inactive: 0 }, levels: { critical: 0, warning: 0, opportunity: 0, info: 0 }, atRisk: {} };
    Object.keys(byAd).forEach(function (id) { summary.health[byAd[id].health]++; });
    // الميزانية المعرّضة للهدر = صرف بدون نتائج + خسارة مباشرة (بعملة كل حساب) — الإعلان مرة واحدة بأكبر مبلغ عليه، زي لوحة
    // الهدر (ui.js wasteData). قبل كده «إنفاق دون نتائج آخر يومين» و«خسارة الأسبوع» على نفس الإعلان كانوا بيتجمعوا: نفس الفلوس
    // مرتين (١٬٠٥٠ وخسارته الفعلية ٦٥٠)، واللوحة تقول ٦٥٠ والشريط اللي وراها ١٬٠٥٠ (مراجعة المرحلة ٤، ١٧ أكتوبر ٢٠٢٦)
    var riskByAd = {};
    alerts.forEach(function (a) {
      summary.levels[a.level]++;
      if (!(a.atRisk && a.amount > 0)) return;
      var k = a.adId ? 'ad:' + a.adId : 'x:' + Object.keys(riskByAd).length;
      var r = riskByAd[k] || (riskByAd[k] = { cur: a.currency || '', v: 0 });
      r.v = Math.max(r.v, a.amount);
    });
    Object.keys(riskByAd).forEach(function (k) { var r = riskByAd[k]; summary.atRisk[r.cur] = (summary.atRisk[r.cur] || 0) + r.v; });

    // settings = إعدادات الحساب الواحد (المُشغّل والاختبارات القديمة)، وsettingsBySource = إعدادات كل حساب
    return { byAd: byAd, alerts: alerts, summary: summary, settings: base, settingsBySource: settingsBySource };
  }

  // =====================================================================
  // تنبيهات عاجلة بتحتاج بيانات زيادة (بيجيبها المُشغّل على السيرفر: supabase/functions/sync/runner.ts) —
  // حسابات بحتة هنا عشان تتختبر زي باقي المحرك. كلها «عاجل» وبرمز ثابت (البصمة)، والعنصر في objectId
  // =====================================================================

  // الموقع والتتبّع — أرقام الحساب يوم بيوم لحملات الطلبات بس (من غير حملات الواتساب والوعي اللي نقراتها مش
  // بتروح للموقع أصلاً): days = آخر ٨ أيام بالترتيب، آخر واحد = النهارده (لسه بيتحسب)،
  // [{ date, clicks, lpv, atc, ic, pur }]. الأساس = الأيام قبل امبارح. بنحكم على امبارح، والنهارده لو فيه نقرات كفاية
  //  - tracking-off: نقرات من غير أي زيارة ولا إضافة ولا شراء، والمتوقع ١٠ أحداث على الأقل (احتمال الصفر صدفة < ١ في ٢٠ ألف)
  //  - lpv-drop: الزيارات أقل من نص نسبتها المعتادة من النقرات، واحتمال الصدفة < ١ في الألف
  //  - checkout-off: زيارات عادي بس صفر إضافات للسلة وبدء دفع وشراء، والمتوقع ١٠ على الأقل
  function siteAlerts(days, fmt) {
    var out = [];
    if (!days || days.length < 5) return out;
    var base = days.slice(0, days.length - 2), B = { clicks: 0, lpv: 0, ev: 0 };
    base.forEach(function (d) { B.clicks += +d.clicks || 0; B.lpv += +d.lpv || 0; B.ev += (+d.atc || 0) + (+d.ic || 0) + (+d.pur || 0); });
    if (B.clicks < 200) return out;
    var rLpv = B.lpv / B.clicks, rEv = B.ev / B.clicks, found = {};
    [{ d: days[days.length - 2], when: 'y', min: 30 }, { d: days[days.length - 1], when: 't', min: 50 }].forEach(function (x) {
      var clicks = +x.d.clicks || 0, lpv = +x.d.lpv || 0, ev = (+x.d.atc || 0) + (+x.d.ic || 0) + (+x.d.pur || 0);
      if (clicks < x.min) return;
      if (!found.all && lpv === 0 && ev === 0 && clicks * (rLpv + rEv) >= 10) { found.all = { x: x, clicks: clicks, exp: clicks * (rLpv + rEv) }; return; }
      if (!found.lpv && rLpv >= 0.3 && lpv > 0 && lpv / clicks < 0.5 * rLpv && poissonAtMost(lpv, clicks * rLpv) < 0.001) found.lpv = { x: x, pct: lpv / clicks };
      if (!found.buy && lpv > 0 && ev === 0 && clicks * rEv >= 10) found.buy = { x: x, lpv: lpv, exp: clicks * rEv };
    });
    var when = function (f) { return t('al.when.' + f.x.when); };
    if (found.all) {
      out.push(makeIssue('critical', ['account'], t('al.trackOff.t'),
        t('al.trackOff.d', { when: when(found.all), clicks: fmt.int(found.all.clicks), exp: fmt.int(found.all.exp) }), t('al.trackOff.a'), 0, 'tracking-off'));
      return out;
    }
    if (found.lpv) {
      out.push(makeIssue('critical', ['account'], t('al.lpvDrop.t'),
        t('al.lpvDrop.d', { when: when(found.lpv), pct: fmt.int(found.lpv.pct * 100), base: fmt.int(rLpv * 100) }), t('al.lpvDrop.a'), 0, 'lpv-drop'));
    }
    if (found.buy) {
      out.push(makeIssue('critical', ['account'], t('al.buyOff.t'),
        t('al.buyOff.d', { when: when(found.buy), lpv: fmt.int(found.buy.lpv), exp: fmt.int(found.buy.exp) }), t('al.buyOff.a'), 0, 'checkout-off'));
    }
    return out;
  }

  // تعديلات كبيرة مفاجئة من سجل Meta (من آخر فحص): edits = نتيجة DX._.actionOf لكل حدث + share = نصيب العنصر
  // من إنفاق الحساب في آخر ٧ أيام، + when = الوقت مكتوب (المُشغّل بيكتبه بتوقيت الحساب). dailySpend = متوسط إنفاق الحساب اليومي.
  // كبير = الميزانية اتضاعفت أو نزلت للنص، والفرق نفسه ١٥٪ على الأقل من إنفاق الحساب اليومي (الميزانية الإجمالية: العنصر
  // نصيبه ١٠٪ فأكتر)، أو إيقاف عنصر نصيبه ١٠٪ فأكتر. تعديلات نفس العنصر بتتجمع (الصافي من أول قيمة لآخر قيمة) —
  // على حساب حقيقي كان يوم إعادة هيكلة هيطلّع ٦ رسايل «عاجل» منها ٥$ ← ١٥$ ورفع وخفض متعاكسين في نفس اليوم
  var EDIT_ABS_SHARE = 0.15, EDIT_PAUSE_SHARE = 0.1;
  function editAlerts(edits, fmt, currency, dailySpend) {
    var out = [], byId = {}, order = [];
    (edits || []).slice().sort(function (a, b) { return String(a.time) < String(b.time) ? -1 : 1; }).forEach(function (e) {
      if (!e || !e.id) return;
      var g = byId[e.id];
      if (!g) { g = byId[e.id] = { id: e.id, level: e.level, name: e.name, share: e.share, actors: [], events: [] }; order.push(g); }
      g.events.push(e);
      if (e.actor && g.actors.indexOf(e.actor) < 0) g.actors.push(e.actor);
      g.when = e.when; g.time = e.time;
    });
    order.forEach(function (g) {
      if (!(g.share >= 0)) return;
      var budgets = g.events.filter(function (e) { return e.kind === 'budget'; }), last = g.events[g.events.length - 1];
      var e = { kind: last.kind === 'pause' ? 'pause' : (budgets.length ? 'budget' : last.kind), level: g.level, name: g.name, share: g.share,
        actor: g.actors.join('، '), when: g.when, id: g.id, time: g.time };
      if (budgets.length) { e.from = budgets[0].from; e.to = budgets[budgets.length - 1].to; e.lifetime = budgets[budgets.length - 1].lifetime; }
      var obj = t('dx.act.lv.' + e.level) + (e.name ? ' ' + t('dx.act.q', { name: e.name }) : '');
      var who = e.actor ? t('al.edit.who', { actor: e.actor, when: e.when || '' }) : (e.when || '');
      var vars = { obj: obj, who: who, pct: fmt.int(Math.max(1, e.share * 100)) }, a = null;
      var bigMove = e.kind === 'budget' && e.from > 0 && e.to > 0 && (e.to / e.from >= 2 || e.to / e.from <= 0.5) &&
        (e.lifetime ? e.share >= EDIT_PAUSE_SHARE : dailySpend > 0 && Math.abs(e.to - e.from) / unitOf(currency) >= EDIT_ABS_SHARE * dailySpend);
      if (bigMove) {
        var up = e.to > e.from;
        vars.from = fmt.money(e.from / unitOf(currency), currency); vars.to = fmt.money(e.to / unitOf(currency), currency);
        vars.life = t(e.lifetime ? 'al.edit.life' : 'al.edit.daily');
        a = makeIssue('critical', ['account'], t(up ? 'al.editUp.t' : 'al.editDown.t'), t(up ? 'al.editUp.d' : 'al.editDown.d', vars), t(up ? 'al.editUp.a' : 'al.editDown.a'), 0, 'big-edit');
      } else if (e.kind === 'pause' && e.share >= EDIT_PAUSE_SHARE) {
        a = makeIssue('critical', ['account'], t('al.editPause.t'), t('al.editPause.d', vars), t('al.editPause.a'), 0, 'big-edit');
      }
      if (a) { a.objectId = String(e.id) + '@' + String(e.time || '').slice(0, 19); out.push(a); }
    });
    return out;
  }

  // روابط إعلانات معطّلة (المُشغّل بيفتح الرابط بنفسه): results = [{ key, url, status, error, ads: [أسماء] }].
  // المعطّل بس: صفحة مش موجودة (404/410)، أو خطأ الخادم (5xx) أو عدم استجابة اتكرر مرتين — الحجب الأمني
  // (403/429، تحدّي Cloudflare) مش بيوصل هنا أصلاً
  function linkAlerts(results) {
    return (results || []).map(function (r) {
      var ads = r.ads || [], first = t('al.name', { name: ads[0] || '' });
      var adsText = ads.length > 1 ? t('al.link.adsN', { a: first, n: String(ads.length - 1) }) : first;
      var url = String(r.url || '');
      if (url.length > 90) url = url.slice(0, 89) + '…';
      var key = r.status === 404 || r.status === 410 ? 'al.link.d404' : (r.status ? 'al.link.d5xx' : 'al.link.dNet');
      var a = makeIssue('critical', ['status'], t('al.link.t'), t(key, { ads: adsText, status: String(r.status || ''), url: url }), t('al.link.a'), 0, 'link-broken');
      a.objectId = r.key;
      return a;
    });
  }

  global.PauseProofAlerts = {
    siteAlerts: siteAlerts,
    editAlerts: editAlerts,
    linkAlerts: linkAlerts,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    GOAL_KEYS: GOAL_KEYS,
    SETTINGS_META: SETTINGS_META,
    SETTINGS_ORDER: SETTINGS_ORDER,
    mergeSettings: mergeSettings,
    analyze: analyze,
    // اختبار العائد مقابل حد (بواسون مركّب مع جاما) — الملخص بيستخدمه لسطر المستهدف (diagnosis.js targetLine)، معيار واحد للأداة
    roasP: roasP,
    _: { poissonAtMost: poissonAtMost, roasP: roasP, fewerP: fewerP }   // للاختبارات
  };
})(window);
