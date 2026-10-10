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

  var DEFAULT_SETTINGS = {
    learningDays: 3,          // الإعلان الأحدث من كده في فترة تعلّم — منقيّمش أداءه لسه
    minSpendShare: 0.02,      // حد الإعلان الصغير: التنبيه بيطلع بس لو صرف الإعلان ≥ النسبة دي من صرف الحساب
                              // (أو ≥ متوسط تكلفة النتيجة الواحدة) — أصغر من كده ملاحظاته "للعلم" بس
    wasteCprMultiple: 2,      // صرف بدون نتائج = الصرف ≥ (المضاعف ده × متوسط تكلفة النتيجة في الحساب)
    roasBreakEven: 1,         // العائد أقل من كده = خسارة
    roasTarget: 3,            // العائد المستهدف
    cprWarnMultiple: 1.5,     // تكلفة النتيجة أعلى من المتوسط بالمضاعف ده = يحتاج تحسين
    cprCriticalMultiple: 2,   // ... وبالمضاعف ده = يحتاج مراجعة
    lowDeliveryRatio: 0.2,    // صرف أمس أقل من النسبة دي من متوسطه اليومي = وصول ضعيف
    spikeMultiple: 2,         // صرف أمس ≥ المضاعف ده × متوسطه = صرف غير معتاد
    dropRatio: 0.5,           // نتائج أمس ≤ النسبة دي من متوسطها = انخفاض
    frequencyHigh: 6,         // نفس الشخص شاف الإعلان المرات دي أو أكتر = الجمهور زهق
    frequencyWarn: 4,         // ... ومع إعلان قديم = بداية زهق
    oldAdDays: 90,            // إعلان شغال من المدة دي أو أكتر = قديم
    scaleMinResults: 3,       // أقل عدد نتائج أمس عشان نعتبره فرصة زيادة استثمار
    scaleCprRatio: 0.8,       // ... وتكلفة النتيجة ≤ النسبة دي من المتوسط
    accountSpikeMultiple: 1.5,
    accountDropRatio: 0.5,
    concentrationShare: 0.4   // إعلان واحد واخد النسبة دي أو أكتر من ميزانية الحساب
  };

  // ٣ أنماط جاهزة بدل ما صاحب البزنس يظبط ١٧ رقم: كل نمط بيغيّر حساسية التنبيهات مع بعض.
  // العائد المستهدف وفترة التعلّم مش جوه الأنماط — دول قرارات بزنس بتتحدد لوحدها
  var PRESETS = {
    calm: {         // تنبيهات أقل — الحاجات الكبيرة بس
      wasteCprMultiple: 3, cprWarnMultiple: 2, cprCriticalMultiple: 3, lowDeliveryRatio: 0.1,
      spikeMultiple: 3, dropRatio: 0.3, frequencyHigh: 8, frequencyWarn: 5,
      accountSpikeMultiple: 2, accountDropRatio: 0.3, concentrationShare: 0.6, minSpendShare: 0.05
    },
    balanced: {},   // القيم الافتراضية
    strict: {       // تنبيهات أكتر — أي انحراف بسيط
      wasteCprMultiple: 1.5, cprWarnMultiple: 1.3, cprCriticalMultiple: 1.7, lowDeliveryRatio: 0.3,
      spikeMultiple: 1.5, dropRatio: 0.6, frequencyHigh: 5, frequencyWarn: 3.5,
      accountSpikeMultiple: 1.3, accountDropRatio: 0.6, concentrationShare: 0.3, minSpendShare: 0.01
    }
  };

  // النصوص كلها من i18n.js — عشان التنبيهات تطلع بلغة الواجهة
  // {wd} = عدد الأيام المكتملة في نافذة الحكم («آخر ٧ أيام») — من النافذة نفسها مش رقم ثابت في النص
  // (النصوص فضلت تقول «آخر ٦ أيام» بعد ما النافذة بقت ٧ أيام مكتملة في ١٠ أكتوبر ٢٠٢٦)
  var WEEK_TXT = null, WEEK_AD = null;   // WEEK_AD = أيام الإعلان ده بعد آخر تعديل (evaluateAd)
  var t = function (k, v) {
    if (v && v.wd == null) v.wd = WEEK_AD || WEEK_TXT || String(YESTERDAY + 1);
    return global.I18N ? global.I18N.t(k, v) : k;
  };

  // وصف كل إعداد لشاشة الإعدادات — بلغة بزنس (النص نفسه في i18n.js تحت set.<key> و set.<key>.help)
  // kind: multiple (×) / ratio (بيتعرض كنسبة مئوية) / days / times / count
  // min / max = أقل وأكبر قيمة مقبولة بوحدة الشاشة (النسب بالمئة) — القيم برّه الحدود دي بتخلّي
  // التنبيهات تطلع على كل حاجة أو متطلعش خالص (مثلاً مضاعف «أعلى من المتوسط» أقل من ١)
  var SETTINGS_META = [
    ['learningDays', 'days', 'general', 0, 30], ['minSpendShare', 'ratio', 'general', 0, 50], ['oldAdDays', 'days', 'general', 1, 730],
    ['wasteCprMultiple', 'multiple', 'waste', 0.5, 20], ['cprWarnMultiple', 'multiple', 'waste', 1, 20], ['cprCriticalMultiple', 'multiple', 'waste', 1, 20],
    ['roasBreakEven', 'multiple', 'roas', 0.1, 50], ['roasTarget', 'multiple', 'roas', 0.1, 50],
    ['lowDeliveryRatio', 'ratio', 'spend', 1, 100], ['spikeMultiple', 'multiple', 'spend', 1.1, 20],
    ['dropRatio', 'ratio', 'results', 1, 100],
    ['scaleMinResults', 'count', 'opps', 1, 10000], ['scaleCprRatio', 'ratio', 'opps', 1, 100],
    ['frequencyWarn', 'times', 'audience', 1, 50], ['frequencyHigh', 'times', 'audience', 1, 50],
    ['accountSpikeMultiple', 'multiple', 'account', 1.1, 20], ['accountDropRatio', 'ratio', 'account', 1, 100], ['concentrationShare', 'ratio', 'account', 5, 100]
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
    ['frequencyWarn', 'frequencyHigh', 'set.err.freqOrder'],
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
  // احتمال إن العدد يطلع k أو أقل بالصدفة لو المتوقع lambda (توزيع بواسون) — نتائج الإعلانات عدّ،
  // واليوم اللي فيه نتيجتين بدل خمسة ممكن يحصل صدفة. بنستخدمه عشان منطلعش تنبيه على تذبذب طبيعي
  function poissonAtMost(k, lambda) {
    if (!(lambda > 0)) return 1;
    var term = Math.exp(-lambda), total = term;
    for (var i = 1; i <= k; i++) { term *= lambda / i; total += term; }
    return Math.min(1, total);
  }

  // أي إعداد مش محفوظ بياخد قيمة النمط اللي المستخدم اختاره (مش القيمة الافتراضية) —
  // عشان إعداد جديد نضيفه بعدين يمشي مع اختيار المستخدم: اللي اختار "هادي" ياخد القيمة الهادية
  function mergeSettings(custom) {
    var s = {};
    var preset = (custom && PRESETS[custom._preset]) || {};
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
      var v = custom && custom[k], lim = SETTINGS_LIMITS[k];
      var ok = typeof v === 'number' && isFinite(v) && v >= 0 && (!lim || (v >= lim.min - 1e-9 && v <= lim.max + 1e-9));
      s[k] = ok ? v : (k in preset ? preset[k] : DEFAULT_SETTINGS[k]);
    });
    return s;
  }

  // إحصائيات كل حساب (source) — متوسط تكلفة النتيجة محسوب لكل نوع نتيجة على حدة،
  // لأن مقارنة تكلفة "محادثة" بتكلفة "شراء" مقارنة مضلّلة
  function accountStats(ads) {
    var byLabel = {}, byCampaign = {};
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
      if (any(c.dailySales)) hasSales = true;
      if (c.campaignId) (byCampaign[c.campaignId] = byCampaign[c.campaignId] || []).push(c);
      // عائد إعلانات الشراء في الأيام المكتملة (من غير النهارده) — للمقارنة جوه تقييم كل إعلان «في الفترة نفسها»
      if (any(c.dailySales) || c.resultKey === 'purchase' || c.resultKey === 'conversion') {
        purchSpendW += sum(c.daily || [], 0, YESTERDAY); purchSalesW += sum(c.dailySales || [], 0, YESTERDAY);
      }
      if (c.results == null || !c.resultKey) return;
      var g = byLabel[c.resultKey] || (byLabel[c.resultKey] = { spend: 0, results: 0, adsWithResults: 0 });
      g.spend += c.spend || 0;
      g.results += c.results || 0;
      if (c.results > 0) g.adsWithResults++;
    });
    Object.keys(byLabel).forEach(function (k) {
      var g = byLabel[k];
      g.avgCpr = g.results > 0 ? g.spend / g.results : null;
    });
    // متوسط صرف الإعلان الواحد في يومين — بنستخدمه كبديل لما الحساب ملوش متوسط تكلفة نتيجة أصلاً
    // (مثلاً حساب كل إعلاناته لسه مجابتش ولا نتيجة) — من غيره كان أهم تنبيه بيختفي تماماً
    var spend2All = spendByDay[DAY_BEFORE] + spendByDay[YESTERDAY];
    var avgAdSpend2 = spendingAds > 0 ? spend2All / spendingAds : 0;
    return {
      byLabel: byLabel, hasSales: hasSales, spendByDay: spendByDay, resultsByDay: resultsByDay,
      total7: total7, activeCount: activeCount, avgAdSpend2: avgAdSpend2, byCampaign: byCampaign,
      roasW: hasSales && purchSpendW > 0 ? purchSalesW / purchSpendW : null
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
    // متوسط الحساب له معنى لو فيه إعلانين جابوا نتائج من النوع ده، أو ٣ نتائج على الأقل حتى لو من إعلان واحد.
    // قبل كده إعلان رابح واحد في الحساب كان بيلغي المقارنة كلها، فإعلانات صرفت بالآلاف من غير ولا طلب طلعت «جيد»
    var avgCpr = group && group.results > 0 && (group.adsWithResults >= 2 || group.results >= 3) ? group.avgCpr : null;
    // إعلانات تانية (غير ده) جابت نتائج من نفس النوع — من غيرها مفيش حاجة نقارن تكلفته بيها
    var othersHave = !!group && group.adsWithResults - (c.results > 0 ? 1 : 0) > 0;
    var age = c.daysAgo;
    var learning = age != null && age < s.learningDays;
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
    var spendY = daily[YESTERDAY] || 0, spend2 = sum(daily, DAY_BEFORE, YESTERDAY);
    var resY = results[YESTERDAY] || 0, res2 = sum(results, DAY_BEFORE, YESTERDAY);
    // العائد وفرص الزيادة بتتقاس على آخر ٣ أيام مكتملة مش أمس لوحده: المبيعات بتتنسب ليوم ظهور الإعلان
    // (إعداد Meta الافتراضي)، فأرقام أمس لسه هتزيد لما مشتريات متأخرة تتسجّل، والإعلان اللي مشترياته قليلة
    // وغالية ممكن يغيب يوم كامل ويرجع — تقييم يوم واحد كان بيطلع «عاجل» على إعلان عائده في الأسبوع ممتاز
    var spend3 = sum(daily, RECENT3, YESTERDAY), res3 = sum(results, RECENT3, YESTERDAY), sales3 = sum(sales, RECENT3, YESTERDAY);
    // تكلفة النتيجة بمعدل الإعلان نفسه في الأسبوع — مقياس «هل الصرف ده كفاية نحكم عليه؟»
    var ownCpr = c.results > 0 && c.spend > 0 ? c.spend / c.results : null;
    // المتوسط بيتقسم على الأيام اللي الإعلان كان فيها موجود فعلاً — إعلان عمره ٣ أيام
    // كان متوسطه بيتقسم على كل الأيام فيطلع أقل من الحقيقة وتنبيه "وصوله ضعيف" ميظهرش
    // بعد تعديل: المعتاد = الأيام اللي بعده بس (رفع الميزانية مش «صرف أعلى من المعتاد»)
    var historyDays = Math.min(age != null ? Math.max(1, Math.min(DAY_BEFORE + 1, age - 1)) : DAY_BEFORE + 1, Math.max(1, DAY_BEFORE + 1 - weekStart));
    var prevSpendAvg = sum(daily, weekStart, DAY_BEFORE) / historyDays;
    // الأسبوع = الأيام المكتملة بس (من غير النهارده): أساس الحكم على الإعلان كله، مش آخر يومين بس — أو اللي بعد آخر تعديل
    var spendW = sum(daily, weekStart, YESTERDAY), resW = sum(results, weekStart, YESTERDAY), salesW = sum(sales, weekStart, YESTERDAY);
    // إعلان مبيعات بيسجّل قيمة الطلبات: الحكم بالربح الأول (العائد مقابل المستهدف وحد الخسارة)، والمقارنة بإعلانات
    // الحساب في الفترة نفسها شرح جنبه مش أساس الحكم (قرار صاحب المنتج ٧ أكتوبر ٢٠٢٦ — الفترات بتختلف: عروض، رواتب، موسم)
    var profitAd = acc.hasSales && any(sales);
    var evidenceCpr = ownCpr || avgCpr;
    // كفاية نحكم على الأسبوع: ٣ نتائج، أو إنفاق يكفي لـ٣ بمتوسط الحساب
    var weekEvidence = resW >= 3 || !!(avgCpr && spendW >= 3 * avgCpr);
    var roasW = spendW > 0 ? salesW / spendW : null;
    var roasLabel = function (r) {
      return fmt.currencyLabel(cur) ? t('al.roasText', { one: fmt.int(1), cur: fmt.currencyLabel(cur), roas: fmt.num(r) }) : t('al.roasTextNoCur', { roas: fmt.num(r) });
    };
    // الأقل من نتيجة واحدة: «أقل من عملية شراء واحدة» بدل «نحو صفر»
    var expText = function (x) { return x < 1 ? t('pend.lessThan', { one: countText(1, c.resultKey, fmt) }) : t('pend.about', { n: countText(Math.round(x), c.resultKey, fmt) }); };

    // حد الإعلان الصغير: الإعلان "مهم كفاية" للتنبيه لو تحقق أي شرط من الاتنين —
    //  - صرفه في آخر ٧ أيام ≥ نسبة من صرف الحساب كله في نفس الفترة
    //  - أو صرفه ≥ متوسط تكلفة النتيجة الواحدة في الحساب (لنفس نوع النتيجة)
    // غير كده ملاحظاته بتفضل ظاهرة في تفاصيله، بس كـ"للعلم" من غير ما تبقى تنبيه أو تلوّن الإعلان
    var adSpend = c.spend || 0;
    var accountCpr = group && group.results > 0 ? group.avgCpr : null;
    // الشرط التاني بيحتاج كمان ربع النسبة على الأقل: في نتائج رخيصة جداً (الوصول، المشاهدات) «تكلفة نتيجة واحدة»
    // أقل من سنت، فكل إعلان صغير كان بيبقى «مهم» — إعلانات بـ١ في الأسبوع (٠٫١٪ من الحساب) كانت بتطلع تنبيهات
    var share = acc.total7 > 0 ? adSpend / acc.total7 : 0;
    var material = share >= s.minSpendShare || (accountCpr != null && adSpend >= accountCpr && share >= s.minSpendShare / 4);
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
      if (/^prelim/.test(key)) {
        var pv = { count: countText(resW, c.resultKey, fmt), need: countText(3, c.resultKey, fmt), one: one,
          cmp: t('pend.cmp.' + key, { target: fmt.num(s.roasTarget), be: fmt.num(s.roasBreakEven) }) };
        if (profitAd) { pv.roas = fmt.num(roasW); return t('pend.prelim.profit', pv); }
        pv.cpr = money(spendW / resW); pv.avg = money(avgCpr);
        return t('pend.prelim.cpr', pv);
      }
      if (key === 'little' && profitAd && resW > 0) {
        return t('pend.little.profit', { count: countText(resW, c.resultKey, fmt), roas: fmt.num(roasW), need: countText(3, c.resultKey, fmt) });
      }
      if (key === 'little' && avgCpr) {
        return resW > 0 ? t('pend.little.d', { count: countText(resW, c.resultKey, fmt), spend: money(spendW), exp: expText(spendW / avgCpr) })
          : t('pend.little.zero', { spend: money(spendW), label: label, exp: expText(spendW / avgCpr) });
      }
      if (key === 'little' || key === 'noRef') {
        return resW > 0 ? t('pend.noRef.d', { count: countText(resW, c.resultKey, fmt) }) : t('pend.noRef.zero', { spend: money(spendW), label: label });
      }
      return t('pend.' + key + '.d');
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
    if (age == null || age >= 2) {
      if (spendY === 0 && prevSpendAvg > 0) {
        issues.push(spendShifted(c, acc, prevSpendAvg) ? shiftNote() : makeIssue('warning', ['delivery', 'spend'], t('al.noSpendY.t'),
          t('al.noSpendY.d', { name: name, avg: money(prevSpendAvg) }), t('al.noSpendY.a'), 0, 'no-spend-y'));
      } else if (spendY > 0 && prevSpendAvg > 0 && spendY < prevSpendAvg * s.lowDeliveryRatio) {
        issues.push(spendShifted(c, acc, prevSpendAvg) ? shiftNote() : makeIssue('warning', ['delivery', 'spend'], t('al.weak.t'),
          t('al.weak.d', { name: name, spend: money(spendY), avg: money(prevSpendAvg) }), t('al.weak.a'), 0, 'weak-delivery'));
      } else if (c.spend === 0 && prevSpendAvg === 0) {
        // مفيش إنفاق = مفيش حاجة نحكم عليها: حالته «لم يُحكم بعد»، والملاحظة للعلم
        issues.push(makeIssue('info', ['delivery'], t('al.noSpend7.t'),
          t('al.noSpend7.d', { name: name }), t('al.noSpend7.a'), 0, 'no-spend-7'));
      }
    }

    // إعلان جديد (فترة التعلّم) صرف ٣ أضعاف تكلفة النتيجة في الحساب من غير ولا نتيجة: «مهم» حتى قبل ما يكمّل التعلّم
    if (learning && c.results === 0 && avgCpr && c.spend >= 3 * avgCpr) {
      issues.push(withMoney(makeIssue('warning', ['spend', 'results'], t('al.wasteNew.t'),
        t('al.wasteNew.d', { name: name, spend: money(c.spend), label: label, expPhrase: countText(Math.round(c.spend / avgCpr), c.resultKey, fmt) }),
        t('al.wasteNew.a'), c.spend, 'waste-new'), 'waste', spend3 / 3));
    }

    var wasteRaised = false;
    if (!learning && c.results != null) {
      // الأساس: مضاعف من متوسط تكلفة النتيجة في الحساب. ولو الحساب ملوش متوسط (ولا إعلان جاب نتيجة)،
      // بنقارن بمتوسط صرف الإعلان الواحد في يومين — عشان التنبيه ميختفيش في أسوأ الحالات
      var accountHasResults = !!(group && group.results > 0);
      var threshold = avgCpr ? avgCpr * s.wasteCprMultiple
        : ((!accountHasResults && acc.avgAdSpend2 > 0) ? acc.avgAdSpend2 : null);
      // 4أ) ولا نتيجة طول الأسبوع: الإنفاق كله مقارنةً بتكلفة النتيجة في الحساب (نفس مضاعف «إنفاق دون نتائج»).
      //     قبل كده الحكم كان على آخر يومين بس، فإعلان بيصرف شوية كل يوم من غير ولا طلب فضل «جيد» طول الأسبوع
      var weekDry = resW === 0 && spendW > 0 && !!avgCpr;
      if (weekDry) {
        var wVars = { name: name, spend: money(spendW), label: label, one: one, avg: money(avgCpr),
          expPhrase: countText(Math.round(Math.max(1, spendW / avgCpr)), c.resultKey, fmt) };
        if (spendW >= threshold) {
          wasteRaised = true;
          issues.push(withMoney(makeIssue('critical', ['spend', 'results'], t('al.wasteWeek.t'), t('al.wasteWeek.d', wVars), t('al.waste.a'), spendW, 'waste-week', true), 'waste', spend3 / 3));
        } else if (spendW >= threshold / 2) {
          wasteRaised = true;
          issues.push(withMoney(makeIssue('warning', ['spend', 'results'], t('al.wasteWeekEarly.t'), t('al.wasteWeek.d', wVars), t('al.wasteEarly.a'), spendW, 'waste-early'), 'waste', spend3 / 3));
        }
      }
      // 4ب) صرف بدون نتائج في آخر يومين — للإعلان اللي جاب نتائج قبلها في الأسبوع (أو الحساب كله ملوش متوسط)
      // إعلان أداؤه في الأسبوع أحسن من متوسط الحساب، ويومين من غير نتائج بصرف أقل من تكلفة ٣ نتائج
      // بمعدله هو — ده وارد يحصل صدفة (نتائج قليلة العدد)، فمش هدر
      var dryIsNormal = ownCpr != null && avgCpr != null && ownCpr <= avgCpr && spend2 < ownCpr * 3;
      if (!weekDry && res2 === 0 && spend2 > 0 && threshold && !dryIsNormal) {
        var wasteDetail = avgCpr
          ? t('al.waste.d', { name: name, spend: money(spend2), label: label, one: one, avg: money(avgCpr),
              expPhrase: countText(Math.round(Math.max(1, spend2 / avgCpr)), c.resultKey, fmt) })
          : t('al.waste.dNoAvg', { name: name, spend: money(spend2), label: label });
        if (spend2 >= threshold) {
          wasteRaised = true;
          issues.push(withMoney(makeIssue('critical', ['spend', 'results'], t('al.waste.t'), wasteDetail,
            t('al.waste.a'), spend2, 'waste', true), 'waste', spend2 / 2));
        } else if (spend2 >= threshold / 2) {
          wasteRaised = true;
          issues.push(withMoney(makeIssue('warning', ['spend', 'results'], t('al.wasteEarly.t'), wasteDetail,
            t('al.wasteEarly.a'), spend2, 'waste-early'), 'waste', spend2 / 2));
        }
      }

      // 5) الربح (إعلان بيسجّل قيمة مبيعات): العائد على الأسبوع مقابل حد الخسارة والمستهدف، لو فيه دليل كفاية
      //    (٣ نتائج أو إنفاق يكفي لـ٣ بمتوسط الحساب). وآخر ٣ أيام بيكشف التراجع الجديد. جنب الحكم: عائد إعلانات
      //    الحساب في الفترة نفسها — لو الكل نازل، السبب غالباً الفترة (عروض، موسم) مش الإعلان
      if (profitAd) {
        var roas3 = spend3 > 0 ? sales3 / spend3 : null;
        var recentEvidence = spend3 > 0 && (!evidenceCpr || spend3 >= evidenceCpr * 3);
        var cmp = acc.roasW == null ? '' : (fmt.currencyLabel(cur)
          ? t('al.vsAcc', { one: fmt.int(1), cur: fmt.currencyLabel(cur), acc: fmt.num(acc.roasW) })
          : t('al.vsAccNoCur', { acc: fmt.num(acc.roasW) })) + (roasW != null && roasW < s.roasTarget && roasW >= acc.roasW ? t('al.vsAccBetter') : '');
        var wkVars = { name: name, spend: money(spendW), sales: money(salesW), roasText: roasW != null ? roasLabel(roasW) : '', target: fmt.num(s.roasTarget), cmp: cmp };
        var lossRecent = recentEvidence && roas3 < s.roasBreakEven && !(sales3 === 0 && wasteRaised);
        if (weekEvidence && roasW < s.roasBreakEven) {
          issues.push(withMoney(makeIssue('critical', ['roas', 'spend'], t('al.loss.t'), t('al.lossWeek.d', wkVars), t('al.loss.a'), spendW - salesW, 'loss', true), 'loss', (spend3 - sales3) / 3));
        } else if (lossRecent && (!weekEvidence || roasW < s.roasTarget)) {
          // آخر ٣ أيام بخسارة، والأسبوع نفسه مش قوي: عاجل
          issues.push(withMoney(makeIssue('critical', ['roas', 'spend'], t('al.loss.t'),
            t('al.loss.d', { name: name, spend: money(spend3), sales: money(sales3), roasText: roasLabel(roas3) }) +
              (weekEvidence ? t('al.weekCtx', { roas: fmt.num(roasW) }) : '') + cmp,
            t('al.loss.a'), spend3 - sales3, 'loss', true), 'loss', (spend3 - sales3) / 3));
        } else if (lossRecent) {
          // أسبوع قوي وآخر ٣ أيام بخسارة: تراجع يتابَع («مهم») — ممكن مبيعات اتأخر تسجيلها
          issues.push(makeIssue('warning', ['roas'], t('al.roasDrop.t'),
            t('al.roasDrop.d', { name: name, roasW: fmt.num(roasW), roas3: fmt.num(roas3), spend: money(spend3), sales: money(sales3) }),
            t('al.roasDrop.a'), 0, 'roas-drop'));
        } else if (weekEvidence && roasW < s.roasTarget) {
          issues.push(makeIssue('warning', ['roas'], t('al.lowRoas.t'), t('al.lowRoasWeek.d', wkVars), t('al.lowRoas.a'), 0, 'low-roas'));
        } else if (weekEvidence && roasW >= s.roasTarget * 1.5) {
          issues.push(makeIssue('opportunity', ['roas'], t('al.greatRoas.t'), t('al.greatRoasWeek.d', wkVars), t('al.greatRoas.a'), 0, 'roas-great'));
        }
      }

      // 6) تكلفة النتيجة أعلى من متوسط الحساب في الفترة نفسها (على مدار الأسبوع) — للإعلانات اللي مفيهاش قيمة مبيعات
      //    (إعلان المبيعات بيتحكم عليه بالربح فوق). بشرط إن الفرق صعب يكون صدفة: إعلان جاب نتيجتين بس ممكن تكلفته تطلع
      //    ضعف المتوسط بالحظ. المتوقع بمتوسط الحساب = صرفه ÷ المتوسط — «مهم» لو احتمال إن نتائجه تطلع بالقلة دي صدفة أقل
      //    من ١٠٪، و«عاجل» أقل من ١٪. نتيجة واحدة بتتحسب كمان: نتيجة واحدة بتكلفة عشرة كانت بتطلع «جيد»
      if (!profitAd && avgCpr && c.results >= 1 && c.cpr != null) {
        var ratio = c.cpr / avgCpr;
        var cprChance = poissonAtMost(c.results, c.spend / avgCpr);
        if (ratio >= s.cprWarnMultiple && cprChance < 0.1) {
          var critical = ratio >= s.cprCriticalMultiple && cprChance < 0.01;
          var oldNote = age != null && age >= s.oldAdDays ? t('al.cpr.old', { days: fmt.int(age), dayWord: dayWord(age) }) : '';
          issues.push(withMoney(makeIssue(critical ? 'critical' : 'warning', ['cpr'], t('al.cpr.t', { label: label, one1: one }),
            t('al.cpr.d', { one: one, name: name, cpr: money(c.cpr), old: oldNote, pct: fmt.int((ratio - 1) * 100), avg: money(avgCpr) }),
            t('al.cpr.a'),
            c.spend - c.results * avgCpr, 'cpr'), 'extra', 0));
        }
      }

      // 7) انخفاض النتائج أمس مقارنة بالمعتاد مع نفس مستوى الصرف — بشرطين عشان منطلعش تنبيه على تذبذب طبيعي:
      //    - أمس أسوأ من كل أيامه اللي فاتت (نتائج لكل ١ اتصرف): لو كان فيه يوم زيه قبل كده ورجع بعده،
      //      يبقى ده نمط الإعلان ده مش مشكلة جديدة
      //    - والانخفاض صعب يحصل صدفة (احتمال أقل من ٥٪ بالمعدل المتوقع لصرف أمس)
      var prevResAvg = sum(results, 1, DAY_BEFORE) / DAY_BEFORE;
      var prevSpend4 = sum(daily, 1, DAY_BEFORE) / DAY_BEFORE;
      var newLow = spendY > 0;
      for (var d = 1; d <= DAY_BEFORE && newLow; d++) {
        if ((daily[d] || 0) > 0 && (results[d] || 0) / daily[d] <= resY / spendY) newLow = false;
      }
      var unlikely = prevSpend4 > 0 && poissonAtMost(resY, prevResAvg * spendY / prevSpend4) < 0.05;
      if (!wasteRaised && prevResAvg >= 2 && prevSpend4 > 0 && spendY >= prevSpend4 * 0.7 && resY <= prevResAvg * s.dropRatio && newLow && unlikely) {
        issues.push(makeIssue('warning', ['results'], t('al.drop.t'),
          // صفر نتائج: «لم يحقق أي مشتريات» بدل «حقق ٠ مشتريات فقط»
          resY === 0
            ? t('al.drop.dZero', { name: name, label: label, avg: fmt.num(prevResAvg) })
            : t('al.drop.d', { name: name, count: countText(resY, c.resultKey, fmt), avg: fmt.num(prevResAvg) }),
          t('al.drop.a'), 0, 'drop'));
      }
    }

    // 8) صرف أعلى من المعتاد من غير ما النتائج تتحسن بنفس النسبة
    // (بنتجاهله لو الإعلان لسه بادئ يصرف — أقل من ٣ أيام صرف قبل أمس — أو لو عليه تنبيه صرف بدون نتائج أصلاً)
    // حد أدنى (ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦): الزيادة نفسها لازم تساوي تكلفة نتيجة واحدة بمتوسط الحساب على الأقل —
    // إعلان صرفه نط من ٥ لـ١٢ كان بيطلع «صرف أعلى من المعتاد». من غير متوسط في الحساب مفيش أساس نقيس عليه، فمفيش تنبيه
    var priorSpendDays = daily.slice(weekStart, YESTERDAY).filter(function (v) { return v > 0; }).length;
    var spikeFloor = avgCpr || accountCpr;
    if (!learning && !wasteRaised && priorSpendDays >= 3 && prevSpendAvg > 0 && spendY >= prevSpendAvg * s.spikeMultiple &&
      spikeFloor && spendY - prevSpendAvg >= spikeFloor) {
      var yCpr = resY > 0 ? spendY / resY : null;
      // «النتائج مزادتش معاه» = تكلفة النتيجة أمس أعلى بوضوح (نفس حد «تكلفة مرتفعة») — مش أعلى من المتوسط بسنت
      if (!avgCpr || yCpr == null || yCpr > avgCpr * s.cprWarnMultiple) {
        issues.push(withMoney(makeIssue('warning', ['spend'], t('al.spike.t'),
          t('al.spike.d', { name: name, spend: money(spendY), times: global.I18N ? global.I18N.timesPhrase(spendY / prevSpendAvg, fmt.num) : fmt.num(spendY / prevSpendAvg) + '×', avg: money(prevSpendAvg) }),
          t('al.spike.a'), spendY - prevSpendAvg, 'spike'), 'spike', 0));
      }
    }

    // 9) تكرار الظهور لنفس الشخص (زهق الجمهور)
    if (c.frequency != null) {
      var isOld = age != null && age >= s.oldAdDays;
      if (c.frequency >= s.frequencyHigh || (isOld && c.frequency >= s.frequencyWarn)) {
        // الربح الأول: إعلان مبيعات عائده فوق المستهدف مش «بيضره» التكرار مهما كانت تكلفته مقارنةً بالحساب
        var profitWeak = profitAd && weekEvidence && roasW < s.roasTarget;
        // الزهق «بيضر» (عاجل) بس لو غلو التكلفة مش صدفة — نفس شرط قاعدة التكلفة فوق
        var hurting = (!profitAd || profitWeak) && avgCpr && c.cpr != null && c.cpr >= avgCpr * s.cprWarnMultiple && poissonAtMost(c.results, c.spend / avgCpr) < 0.01;
        // التكرار العالي لوحده مش مشكلة (جمهور إعادة الاستهداف صغير وبيبقى مربح): «مهم» بس لو في أداء الإعلان علامة ضعف،
        // وغير كده ملاحظة «للعلم» — أفضل إعلان في الحساب كان بيطلع «يحتاج إلى تحسين» بسبب التكرار بس
        var weakPerf = profitWeak || issues.some(function (i) {
          return (i.level === 'critical' || i.level === 'warning') && i.metrics.some(function (m) { return m === 'results' || m === 'cpr' || m === 'roas'; });
        }) || (!profitAd && !!(avgCpr && c.cpr != null && c.cpr >= avgCpr * s.cprWarnMultiple));
        var fDetail = t('al.fatigue.d', { name: name, f: fmt.num(c.frequency), times: global.I18N ? global.I18N.measureNoun(c.frequency, 'n.time') : 'times', old: isOld ? t('al.fatigue.old', { days: fmt.int(age), dayWord: dayWord(age) }) : '' });
        if (hurting || weakPerf) {
          issues.push(makeIssue(hurting ? 'critical' : 'warning', ['frequency'], t('al.fatigue.t'), fDetail, t('al.fatigue.a'), 0, 'fatigue'));
        } else {
          issues.push(makeIssue('info', ['frequency'], t('al.fatigue.t'), fDetail + t('al.fatigue.ok'), t('al.fatigue.okA'), 0, 'fatigue'));
        }
      }
    }

    // 10) فرصة لزيادة الاستثمار — على آخر ٣ أيام زي العائد: يوم واحد حلو مش سبب كفاية لزيادة الميزانية.
    //     وإعلان المبيعات لازم كمان يكون عائده على الأسبوع فوق المستهدف (رخيص عن الحساب وخسران = مش فرصة)
    if (!learning && avgCpr && res3 >= s.scaleMinResults && spend3 > 0 && (!profitAd || (weekEvidence && roasW >= s.roasTarget))) {
      var cpr3 = spend3 / res3;
      var hasProblem = issues.some(function (i) { return i.level === 'critical' || i.level === 'warning'; });
      if (!hasProblem && cpr3 <= avgCpr * s.scaleCprRatio) {
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
          t('al.scale.d', { name: name, count: countText(res3, c.resultKey, fmt), cpr: money(cpr3), one1: one, pct: fmt.int((1 - cpr3 / avgCpr) * 100), avg: money(avgCpr), note: roasNote }),
          t('al.scale.a'), 0, 'scale'));
      }
    }

    // «لم يُحكم بعد» بدل «جيد» لما البيانات متكفيش للحكم (قرار صاحب المنتج ٧ أكتوبر ٢٠٢٦) — «جيد» بقى حكم بدليل:
    // إعلان المبيعات بعائد فوق حد الخسارة على أسبوع فيه دليل كفاية، والباقي بنتائج كفاية وتكلفة مش أعلى من الحساب
    // «لا يأخذ إنفاقاً كافياً» (ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦): إعلان نشط خلّص فترة التعلّم وإنفاقه في الأسبوع أقل من
    // تكلفة نتيجة واحدة بمتوسط الحساب = المنصة مش بتديله إنفاق، فـ«يحتاج إلى تحسين» بدل «لم يُحكم بعد» للأبد — جاب نتيجة
    // ولا لأ. quiet: على الكارت وفي التفاصيل بس، مش في قائمة التنبيهات ولا «يحتاج انتباهك الآن» (حسابات الميزانية على
    // مستوى الحملة فيها إعلانات كتير بإنفاق صغير — كانت هتغرق القائمة)
    var underspend = c.active && !learning && age != null && age > s.learningDays && c.results != null && !!avgCpr && spendW > 0 && spendW < avgCpr;
    if (underspend) {
      var usVars = { name: name, age: daysText(age, fmt), spend: money(spendW), count: countText(resW, c.resultKey, fmt), label: label, one: one, avg: money(avgCpr) };
      var us = makeIssue('warning', ['spend'], t('al.underspend.t'), t(resW > 0 ? 'al.underspend.d' : 'al.underspend.dZero', usVars), t('al.underspend.a'), 0, 'underspend');
      us.quiet = true;
      issues.push(us);
    }

    var pend = null;
    if (underspend) pend = null;
    else if (learning) pend = 'learning';
    else if (c.spend === 0) pend = 'noSpend';
    else if (c.results == null) pend = 'noGoal';
    else if (profitAd) { if (!weekEvidence) pend = 'little'; }
    else if (!avgCpr || !othersHave) pend = 'noRef';
    else if (resW < 2 && spendW < 2 * avgCpr) pend = 'little';
    // نتيجة على الأقل وإنفاق ≥ تكلفة نتيجة بمتوسط الحساب: حكم مبدئي بالمقارنة (مع المستهدف لإعلان المبيعات، ومع الحساب لغيره)
    if (pend === 'little' && resW > 0 && avgCpr && spendW >= avgCpr) {
      if (profitAd) pend = roasW < s.roasBreakEven ? 'prelimLoss' : (roasW < s.roasTarget ? 'prelimBelow' : 'prelimAbove');
      else { var rel = spendW / resW / avgCpr; pend = rel <= 0.85 ? 'prelimBetter' : (rel >= 1.15 ? 'prelimWorse' : 'prelimSimilar'); }
    }

    // سطر «على أي أساس الحكم» في تفاصيل الإعلان — حتى الإعلان «الجيد» بيقول ليه
    var basis = null;
    if (underspend) basis = t('basis.underspend', { spend: money(spendW), one: one, avg: money(avgCpr) });
    else if (pend) basis = pendText(pend);
    else if (profitAd && weekEvidence) {
      basis = t('basis.profit', { roas: fmt.num(roasW), target: fmt.num(s.roasTarget) }) + (acc.roasW != null ? t('basis.vsAcc', { acc: fmt.num(acc.roasW) }) : '');
    } else if (avgCpr && c.cpr != null) {
      basis = t('basis.cpr', { one: one, cpr: money(weekStart && resW > 0 ? spendW / resW : c.cpr), avg: money(avgCpr) });
    }
    // التعديل الأخير (ملاحظة ١٠ أكتوبر): حديث = الحكم بيستنى، والملاحظات «المهمة» بتبقى «للعلم» لأن نتيجة التعديل لسه
    // مظهرتش — والعاجل (هدر واضح) بيفضل زي ما هو. أقدم = الحكم على اللي بعده، وسطر «بعده مقابل قبله» في أساس الحكم
    if (edit && c.active && !learning) {
      var ago = TODAY - edit.idx, what = editText(edit.e);
      var when = ago === 0 ? t('edit.when.0') : (ago === 1 ? t('edit.when.1') : t('edit.when.n', { days: daysText(ago, fmt) }));
      if (editFresh) {
        var urgent = issues.some(function (i) { return i.level === 'critical'; });
        issues.forEach(function (i) { if (i.level === 'warning') { i.level = 'info'; i.detail += t('al.afterEditNote'); } });
        if (!urgent) { pend = 'edited'; basis = t('pend.edited.d', { what: what, when: when }); }
      } else if (basis) {
        var pre = { s: sum(daily, 0, edit.idx - 1), r: sum(results, 0, edit.idx - 1), v: sum(sales, 0, edit.idx - 1) };
        // «بعده مقابل قبله» بس لو كل جانب صرف تكلفة نتيجة على الأقل وفيه نتائج — حساب حقيقي: «×٠ مقابل ×٠» و«×١٫٤ مقابل
        // ×٢٤٫٤» على ١٠ ريال قبل التعديل كانوا بيظهروا
        var cmp = '', floor = evidenceCpr || 0, enough = pre.s >= floor && spendW >= floor && pre.s > 0 && spendW > 0;
        if (enough && profitAd && pre.v + salesW > 0 && pre.r + resW >= 2) cmp = t('basis.edit.roas', { after: fmt.num(salesW / spendW), before: fmt.num(pre.v / pre.s) });
        else if (enough && !profitAd && pre.r > 0 && resW > 0) cmp = t('basis.edit.cpr', { one: one, after: money(spendW / resW), before: money(pre.s / pre.r) });
        basis += t('basis.edit.window', { what: what, when: when }) + cmp;
      }
    }
    // ألوان أرقام الكارت (ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦: «كل النص رمادي وأسود»): أخضر/أحمر خفيف على العائد مقارنةً
    // بالمستهدف وحد الخسارة لإعلان المبيعات (الربح أولاً)، وعلى تكلفة النتيجة مقارنةً بمتوسط الحساب لغيره (±١٥٪) —
    // بس للإعلان اللي اتحكم عليه فعلاً (مش «لم يُحكم بعد» ولا متوقف)
    var tones = {};
    if (profitAd && weekEvidence && roasW != null) tones.roas = roasW >= s.roasTarget ? 1 : (roasW < s.roasBreakEven ? -1 : 0);
    else if (!profitAd && avgCpr && ownCpr && othersHave) tones.cpr = ownCpr <= avgCpr * 0.85 ? 1 : (ownCpr >= avgCpr * 1.15 ? -1 : 0);
    var out = done(pend, basis);
    out.tones = out.health === 'pending' || out.health === 'inactive' ? {} : tones;
    return out;
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

  function evaluateAccount(source, ads, acc, meta, s, fmt) {
    var alerts = [];
    var cur = (meta && meta.currency) || (ads[0] && ads[0].currency);
    var money = function (n) { return fmt.money(n, cur); };
    var accName = (meta && meta.label) || (ads[0] && ads[0].platform) || source;

    if (meta && meta.metaAccountStatus != null && meta.metaAccountStatus !== 1) {
      alerts.push(makeIssue('critical', ['account'], t('al.acct.t'),
        t(META_ACCOUNT_STATUS[meta.metaAccountStatus] ? 'acct.' + meta.metaAccountStatus : 'acct.other'),
        t('al.acct.a'), 0, 'acct-status'));
    }

    if (meta && meta.spendCapReached) {
      alerts.push(makeIssue('critical', ['account'], t('al.cap.t'),
        t('al.cap.d', { acc: accName }), t('al.cap.a'), 0, 'spend-cap'));
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
    if (prevAvg > 0) {
      // لو فيه تنبيه حساب عاجل فوق (دفع، حد صرف، إعلانات وقفت) فهو اللي بيفسّر الوقوف ده — منكررش
      var acctAlreadyFlagged = alerts.length > 0;
      if (spendY === 0 && acctAlreadyFlagged) {
        // مفيش تنبيه تاني
      } else if (spendY === 0 && !acc.activeCount) {
        // مفيش ولا إعلان شغّال: صاحب الحساب وقّف كل حاجة بنفسه (نهاية حملة، إجازة) — ده مش عطل
      } else if (spendY === 0) {
        alerts.push(makeIssue('critical', ['account'], t('al.acctZero.t'),
          t('al.acctZero.d', { acc: accName, avg: money(prevAvg) }), t('al.acctZero.a'), 0, 'acct-zero'));
      } else if (spendY >= prevAvg * s.accountSpikeMultiple) {
        // الزيادة بتتنبّه بس لو النتائج مازادتش معاها — زيادة مفيدة مش حاجة عاجلة
        var resPrev = sum(acc.resultsByDay, 0, DAY_BEFORE) / (DAY_BEFORE + 1), resY = acc.resultsByDay[YESTERDAY];
        var resultsKeptUp = resPrev > 0 && resY / resPrev >= (spendY / prevAvg) * 0.8;
        if (!resultsKeptUp) {
          alerts.push(makeIssue('warning', ['account'], t('al.acctSpike.t'),
            t('al.acctSpike.d', { acc: accName, spend: money(spendY), avg: money(prevAvg), pct: fmt.int((spendY / prevAvg - 1) * 100) }),
            t('al.acctSpike.a'), spendY - prevAvg, 'acct-spike'));
        }
      } else if (spendY <= prevAvg * s.accountDropRatio) {
        alerts.push(makeIssue('warning', ['account'], t('al.acctDrop.t'),
          t('al.acctDrop.d', { acc: accName, spend: money(spendY), avg: money(prevAvg), pct: fmt.int((1 - spendY / prevAvg) * 100) }),
          t('al.acctDrop.a'), 0, 'acct-drop'));
      }
    }

    // حد الإنفاق قرّب يخلص (٩٠٪ فأكتر): «عاجل» لو الباقي يكفي أسبوع أو أقل بمتوسط إنفاق الحساب، غير كده «مهم».
    // بعد تنبيهات الوقوف فوق عشان ميمنعهاش (acctStopped بتتشال لو فيه تنبيه حساب قبلها)
    if (meta && !meta.spendCapReached && meta.spendCap > 0 && meta.amountSpent >= CAP_NEAR * meta.spendCap) {
      var left = (meta.spendCap - meta.amountSpent) / unitOf(cur);   // Meta بترجّع الاتنين بأصغر وحدة للعملة (سنت)
      var perDay = acc.total7 / WINDOW, daysLeft = perDay > 0 ? left / perDay : null;
      alerts.push(makeIssue(daysLeft != null && daysLeft <= CAP_NEAR_DAYS ? 'critical' : 'warning', ['account'], t('al.capNear.t'),
        t(daysLeft != null ? 'al.capNear.d' : 'al.capNear.dNoRate', { acc: accName, pct: fmt.int(meta.amountSpent / meta.spendCap * 100),
          left: money(left), days: daysLeft != null && daysLeft < 1 ? t('al.capNear.lessDay') : daysText(Math.floor(daysLeft || 0), fmt) }),
        t('al.capNear.a'), 0, 'spend-cap-near'));
    }

    // أكبر مصدر مبيعات في الحساب وقف (لأي سبب، حتى لو بقصد): «عاجل» — لو مش مقصود كل ساعة بتفرق، ولو مقصود
    // فالرسالة بتتأكد إن فيه بديل. «أكبر» = ربع مبيعات الحساب في آخر ٧ أيام أو أكتر (أو نتائجه لو مفيش قيمة مبيعات)،
    // وكان بيصرف لحد امبارح (وقف قريب — مش إعلان واقف من أسبوع). الحملة كلها لو كل إعلاناتها وقفت، وإلا الإعلان لوحده
    var valueOf = function (c) { return acc.hasSales ? sum(c.dailySales || [], 0, TODAY) : (c.results || 0); };
    var totalValue = ads.reduce(function (s0, c) { return s0 + valueOf(c); }, 0);
    // الحساب كله واقف (مفيش ولا إعلان شغّال) = صاحبه وقّف كل حاجة بنفسه، والوقوف غير المقصود للحساب كله
    // (دفع، حد إنفاق، حالة الحساب) ليه تنبيهاته فوق
    if (totalValue > 0 && acc.activeCount > 0) {
      var justStopped = function (c) { return !c.active && sum(c.daily || [], DAY_BEFORE, TODAY) > 0; };
      var topText = function (name, value, share, status) {
        return t(acc.hasSales ? 'al.topStopped.d' : 'al.topStopped.dRes', { name: name, pct: fmt.int(share * 100), value: money(value), status: status });
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

    // تركيز الميزانية في إعلان أداؤه أقل من المتوسط
    if (acc.total7 > 0 && acc.activeCount >= 2) {
      ads.forEach(function (c) {
        var share = (c.spend || 0) / acc.total7;
        // حملة كاملة (Performance Max) طبيعي تاخد جزء كبير من الميزانية — مش "إعلان واحد" متركز فيه الصرف
        if (share < s.concentrationShare || !c.active || c.campaignLevel) return;
        var g = c.resultKey ? acc.byLabel[c.resultKey] : null;
        var avgCpr = g && g.adsWithResults >= 2 ? g.avgCpr : null;
        var weak = c.results === 0 || (avgCpr && c.cpr != null && c.cpr > avgCpr * 1.2);
        if (!weak) return;
        var concentration = makeIssue('warning', ['account'], t('al.conc.t'),
          t('al.conc.d', { name: t('al.name', { name: c.offer || c.id }), pct: fmt.int(share * 100), acc: accName, spend: money(c.spend) }),
          t('al.conc.a'), 0, 'concentration');
        concentration.adId = c.id;
        concentration.adName = c.offer || c.headline || c.id;
        alerts.push(concentration);
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
    var sales = (c.dailySales || []).reduce(function (a, b) { return a + b; }, 0);
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
  function analyze(candidates, accountsMeta, customSettings, fmt) {
    var s = mergeSettings(customSettings);
    // طول النافذة من البيانات نفسها (٨ خانات في الأداة، و٧ في بيانات قديمة أو اختبارات قديمة)
    setWindow(candidates.reduce(function (m, c) { return Math.max(m, (c.daily || []).length); }, 0));
    WEEK_TXT = fmt && fmt.int ? fmt.int(YESTERDAY + 1) : null;
    var bySource = {};
    candidates.forEach(function (c) { (bySource[c.source] = bySource[c.source] || []).push(c); });

    var byAd = {}, alerts = [];
    Object.keys(bySource).forEach(function (source) {
      var ads = bySource[source];
      var acc = accountStats(ads);
      ads.forEach(function (c) {
        var r = evaluateAd(c, acc, s, fmt);
        WEEK_AD = null;
        byAd[c.id] = r;
        r.issues.forEach(function (i) {
          setImpact(i, c.spend, acc.total7, c.currency, fmt, false);
          addCompare(i, c, fmt);
          if (i.quiet) return;   // على الكارت وفي التفاصيل بس (underspend)
          alerts.push(Object.assign({ adId: c.id, source: source, platform: c.platform, adName: c.offer || c.headline || c.id, currency: c.currency }, i));
        });
      });
      evaluateAccount(source, ads, acc, accountsMeta && accountsMeta[source], s, fmt).forEach(function (a) {
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
    alerts.forEach(function (a) {
      summary.levels[a.level]++;
      // الميزانية المعرّضة للهدر = صرف بدون نتائج + خسارة مباشرة (بعملة كل حساب)
      if (a.atRisk && a.amount > 0) summary.atRisk[a.currency || ''] = (summary.atRisk[a.currency || ''] || 0) + a.amount;
    });

    return { byAd: byAd, alerts: alerts, summary: summary, settings: s };
  }

  // بيرجّع إعدادات نمط معيّن كاملة (الافتراضي + تعديلات النمط)
  function presetSettings(name) {
    var out = {};
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) { out[k] = DEFAULT_SETTINGS[k]; });
    var p = PRESETS[name] || {};
    Object.keys(p).forEach(function (k) { out[k] = p[k]; });
    return out;
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
    PRESETS: PRESETS,
    presetSettings: presetSettings,
    SETTINGS_META: SETTINGS_META,
    SETTINGS_ORDER: SETTINGS_ORDER,
    mergeSettings: mergeSettings,
    analyze: analyze
  };
})(window);
