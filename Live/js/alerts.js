// =====================================================================
// Ads Center — محرك التنبيهات والتقييم
// =====================================================================
// بياخد الإعلانات المحمّلة (بنفس الشكل اللي ملفات المنصات في js/ بتبنيه) ويرجّع:
//   - تقييم كل إعلان: review (يحتاج مراجعة) / improve (يحتاج تحسين) / good (جيد) / inactive (غير فعال)
//   - تنبيهات بلغة البزنس لكل إعلان ولكل حساب
//
// مبدأ أساسي: المحرك ده بيقرا ويحلل بس — مفيش فيه أي حاجة بتغيّر في الإعلانات.
//
// ترتيب الأيام في كل إعلان: 7 خانات من الأقدم للأحدث، آخر خانة (6) = النهارده (يوم لسه مخلصش)،
// عشان كده "أمس" = خانة 5، و"آخر يومين" = خانتين 4 و5 — أيام كاملة بس، عشان النهارده ميظلمش أي إعلان.
//
// الحدود الافتراضية نسبية لأداء الحساب نفسه (مثلاً مضاعفات متوسط تكلفة النتيجة) —
// كده بتشتغل مع أي عملة وأي حجم ميزانية، وصاحب البزنس يقدر يعدّلها من الإعدادات.
(function (global) {
  var TODAY = 6, YESTERDAY = 5, DAY_BEFORE = 4;

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
  var t = function (k, v) { return global.I18N ? global.I18N.t(k, v) : k; };

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

  // اسم نوع النتيجة (جمع) وصيغة المفرد — عشان الجمل تبقى طبيعية ("تكلفة عملية الشراء الواحدة" مش "تكلفة الـمشتريات")
  function pluralOf(key) { return t('res.' + (key || 'generic')); }
  function singularOf(key) { return t('res1.' + (key || 'generic')); }
  // اسم النتيجة مظبوط على العدد: "١ عملية شراء" / "٥ مشتريات" / "١٥ تحويلاً" / "1 purchase" / "3 purchases"
  function countOf(n, key) {
    if (global.I18N) return global.I18N.resultNoun(n, key);
    return n === 1 ? singularOf(key) : pluralOf(key);
  }
  function dayWord(n) { return global.I18N ? global.I18N.noun(n, 'n.day') : ''; }

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
  function recentSpend(c) { return sum(c.daily || [], 3, TODAY); }

  function sum(arr, from, to) {
    var s = 0;
    for (var i = from; i <= to; i++) s += (arr && arr[i]) || 0;
    return s;
  }
  function any(arr) { return (arr || []).some(function (v) { return v > 0; }); }

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
    var byLabel = {};
    var hasSales = false, spendByDay = [0, 0, 0, 0, 0, 0, 0], resultsByDay = [0, 0, 0, 0, 0, 0, 0];
    var total7 = 0, activeCount = 0, spendingAds = 0;
    ads.forEach(function (c) {
      if ((c.spend || 0) > 0) spendingAds++;
      for (var i = 0; i < 7; i++) {
        spendByDay[i] += (c.daily && c.daily[i]) || 0;
        resultsByDay[i] += (c.dailyResults && c.dailyResults[i]) || 0;
      }
      total7 += c.spend || 0;
      if (c.active) activeCount++;
      if (any(c.dailySales)) hasSales = true;
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
      total7: total7, activeCount: activeCount, avgAdSpend2: avgAdSpend2
    };
  }

  // amount: المبلغ المرتبط بالتنبيه (للترتيب). code: معرّف داخلي للتنبيه.
  // atRisk: المبلغ ده بيتحسب ضمن "الميزانية المعرّضة للهدر" (صرف بدون نتائج أو خسارة مباشرة بس)
  function makeIssue(level, metrics, title, detail, advice, amount, code, atRisk) {
    return { level: level, metrics: metrics, title: title, detail: detail, advice: advice, amount: amount || 0, code: code || null, atRisk: !!atRisk };
  }

  function evaluateAd(c, acc, s, fmt) {
    var issues = [];
    var name = t('al.name', { name: c.offer || c.headline || c.id });
    var cur = c.currency;
    var money = function (n) { return fmt.money(n, cur); };
    // الجمع هنا بييجي بعد «أي» («دون أي عملاء محتملين») — فبنستخدم الصيغة المجرورة لو موجودة
    var label = global.I18N ? global.I18N.resultAny(c.resultKey) : pluralOf(c.resultKey);
    var one = singularOf(c.resultKey);
    var group = c.resultKey ? acc.byLabel[c.resultKey] : null;
    // متوسط الحساب يبقى له معنى بس لو فيه أكتر من إعلان جاب نتائج من نفس النوع
    var avgCpr = group && group.adsWithResults >= 2 ? group.avgCpr : null;
    var age = c.daysAgo;
    var learning = age != null && age < s.learningDays;
    var daily = c.daily || [], results = c.dailyResults || [], sales = c.dailySales || [];
    var spendY = daily[YESTERDAY] || 0, spend2 = sum(daily, DAY_BEFORE, YESTERDAY);
    var resY = results[YESTERDAY] || 0, res2 = sum(results, DAY_BEFORE, YESTERDAY);
    var salesY = sales[YESTERDAY] || 0;
    // المتوسط بيتقسم على الأيام اللي الإعلان كان فيها موجود فعلاً — إعلان عمره ٣ أيام
    // كان متوسطه بيتقسم على ٥ فيطلع أقل من الحقيقة وتنبيه "وصوله ضعيف" ميظهرش
    var historyDays = age != null ? Math.max(1, Math.min(5, age - 1)) : 5;
    var prevSpendAvg = sum(daily, 0, DAY_BEFORE) / historyDays;

    // حد الإعلان الصغير: الإعلان "مهم كفاية" للتنبيه لو تحقق أي شرط من الاتنين —
    //  - صرفه في آخر ٧ أيام ≥ نسبة من صرف الحساب كله في نفس الفترة
    //  - أو صرفه ≥ متوسط تكلفة النتيجة الواحدة في الحساب (لنفس نوع النتيجة)
    // غير كده ملاحظاته بتفضل ظاهرة في تفاصيله، بس كـ"للعلم" من غير ما تبقى تنبيه أو تلوّن الإعلان
    var adSpend = c.spend || 0;
    var accountCpr = group && group.results > 0 ? group.avgCpr : null;
    var material = (acc.total7 > 0 && adSpend / acc.total7 >= s.minSpendShare) || (accountCpr != null && adSpend >= accountCpr);
    function done() { return finalize(c, material ? issues : issues.map(minor)); }

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
        t('al.limited.d', { name: name }), t('al.limited.a')));
    }

    // 3) وصول ضعيف أو متوقف رغم إن الإعلان فعّال
    if (age == null || age >= 2) {
      if (spendY === 0 && prevSpendAvg > 0) {
        issues.push(makeIssue('warning', ['delivery', 'spend'], t('al.noSpendY.t'),
          t('al.noSpendY.d', { name: name, avg: money(prevSpendAvg) }), t('al.noSpendY.a')));
      } else if (spendY > 0 && prevSpendAvg > 0 && spendY < prevSpendAvg * s.lowDeliveryRatio) {
        issues.push(makeIssue('warning', ['delivery', 'spend'], t('al.weak.t'),
          t('al.weak.d', { name: name, spend: money(spendY), avg: money(prevSpendAvg) }), t('al.weak.a')));
      } else if (c.spend === 0 && prevSpendAvg === 0) {
        issues.push(makeIssue('warning', ['delivery', 'spend'], t('al.noSpend7.t'),
          t('al.noSpend7.d', { name: name }), t('al.noSpend7.a')));
      }
    }

    var wasteRaised = false;
    if (!learning && c.results != null) {
      // 4) صرف بدون نتائج في آخر يومين
      //    الأساس: مضاعف من متوسط تكلفة النتيجة في الحساب. ولو الحساب ملوش متوسط (ولا إعلان جاب نتيجة)،
      //    بنقارن بمتوسط صرف الإعلان الواحد في يومين — عشان التنبيه ميختفيش في أسوأ الحالات
      var accountHasResults = !!(group && group.results > 0);
      var threshold = avgCpr ? avgCpr * s.wasteCprMultiple
        : ((!accountHasResults && acc.avgAdSpend2 > 0) ? acc.avgAdSpend2 : null);
      if (res2 === 0 && spend2 > 0 && threshold) {
        var wasteDetail = avgCpr
          ? t('al.waste.d', { name: name, spend: money(spend2), label: label, one: one, avg: money(avgCpr),
              expected: fmt.int(Math.max(1, spend2 / avgCpr)), labelExp: countOf(Math.round(Math.max(1, spend2 / avgCpr)), c.resultKey) })
          : t('al.waste.dNoAvg', { name: name, spend: money(spend2), label: label });
        if (spend2 >= threshold) {
          wasteRaised = true;
          issues.push(makeIssue('critical', ['spend', 'results'], t('al.waste.t'), wasteDetail,
            t('al.waste.a'), spend2, 'waste', true));
        } else if (spend2 >= threshold / 2) {
          wasteRaised = true;
          issues.push(makeIssue('warning', ['spend', 'results'], t('al.wasteEarly.t'), wasteDetail,
            t('al.wasteEarly.a'), spend2, 'waste-early'));
        }
      }

      // 5) العائد (بس للإعلانات اللي بتسجّل قيمة مبيعات)
      if (acc.hasSales && any(sales) && spendY > 0 && (!avgCpr || spendY >= avgCpr * 0.5) && !(salesY === 0 && wasteRaised)) {
        var roasY = salesY / spendY;
        // لو عملة الحساب مش معروفة: "العائد ×٣" بدل "كل ١  اتصرف رجّع ٣ " من غير عملة
        var roasText = fmt.currencyLabel(cur)
          ? t('al.roasText', { one: fmt.int(1), cur: fmt.currencyLabel(cur), roas: fmt.num(roasY) })
          : t('al.roasTextNoCur', { roas: fmt.num(roasY) });
        var roasVars = { name: name, spend: money(spendY), sales: money(salesY), roasText: roasText, target: fmt.num(s.roasTarget) };
        if (roasY < s.roasBreakEven) {
          issues.push(makeIssue('critical', ['roas', 'spend'], t('al.loss.t'), t('al.loss.d', roasVars),
            t('al.loss.a'), spendY - salesY, 'loss', true));
        } else if (roasY < s.roasTarget) {
          issues.push(makeIssue('warning', ['roas'], t('al.lowRoas.t'), t('al.lowRoas.d', roasVars),
            t('al.lowRoas.a'), 0));
        } else if (roasY >= s.roasTarget * 1.5) {
          issues.push(makeIssue('opportunity', ['roas'], t('al.greatRoas.t'), t('al.greatRoas.d', roasVars),
            t('al.greatRoas.a'), 0, 'roas-great'));
        }
      }

      // 6) تكلفة النتيجة أعلى من متوسط الحساب (على مدار الأسبوع)
      if (avgCpr && c.results >= 2 && c.cpr != null) {
        var ratio = c.cpr / avgCpr;
        if (ratio >= s.cprWarnMultiple) {
          var critical = ratio >= s.cprCriticalMultiple;
          var oldNote = age != null && age >= s.oldAdDays ? t('al.cpr.old', { days: fmt.int(age), dayWord: dayWord(age) }) : '';
          issues.push(makeIssue(critical ? 'critical' : 'warning', ['cpr'], t('al.cpr.t', { label: label, one1: one }),
            t('al.cpr.d', { one: one, name: name, cpr: money(c.cpr), old: oldNote, pct: fmt.int((ratio - 1) * 100), avg: money(avgCpr) }),
            t('al.cpr.a'),
            c.spend - c.results * avgCpr));
        }
      }

      // 7) انخفاض النتائج أمس مقارنة بالمعتاد مع نفس مستوى الصرف
      var prevResAvg = sum(results, 1, DAY_BEFORE) / 4;
      var prevSpend4 = sum(daily, 1, DAY_BEFORE) / 4;
      if (!wasteRaised && prevResAvg >= 2 && prevSpend4 > 0 && spendY >= prevSpend4 * 0.7 && resY <= prevResAvg * s.dropRatio) {
        issues.push(makeIssue('warning', ['results'], t('al.drop.t'),
          // صفر نتائج: «لم يحقق أي مشتريات» بدل «حقق ٠ مشتريات فقط»
          resY === 0
            ? t('al.drop.dZero', { name: name, label: label, avg: fmt.num(prevResAvg) })
            : t('al.drop.d', { name: name, n: fmt.int(resY), label: countOf(resY, c.resultKey), avg: fmt.num(prevResAvg) }),
          t('al.drop.a')));
      }
    }

    // 8) صرف أعلى من المعتاد من غير ما النتائج تتحسن بنفس النسبة
    // (بنتجاهله لو الإعلان لسه بادئ يصرف — أقل من ٣ أيام صرف قبل أمس — أو لو عليه تنبيه صرف بدون نتائج أصلاً)
    var priorSpendDays = daily.slice(0, YESTERDAY).filter(function (v) { return v > 0; }).length;
    if (!learning && !wasteRaised && priorSpendDays >= 3 && prevSpendAvg > 0 && spendY >= prevSpendAvg * s.spikeMultiple) {
      var yCpr = resY > 0 ? spendY / resY : null;
      if (!avgCpr || yCpr == null || yCpr > avgCpr) {
        issues.push(makeIssue('warning', ['spend'], t('al.spike.t'),
          t('al.spike.d', { name: name, spend: money(spendY), x: fmt.num(spendY / prevSpendAvg), avg: money(prevSpendAvg) }),
          t('al.spike.a'), spendY - prevSpendAvg));
      }
    }

    // 9) تكرار الظهور لنفس الشخص (زهق الجمهور)
    if (c.frequency != null) {
      var isOld = age != null && age >= s.oldAdDays;
      if (c.frequency >= s.frequencyHigh || (isOld && c.frequency >= s.frequencyWarn)) {
        var hurting = avgCpr && c.cpr != null && c.cpr >= avgCpr * s.cprWarnMultiple;
        issues.push(makeIssue(hurting ? 'critical' : 'warning', ['frequency'], t('al.fatigue.t'),
          t('al.fatigue.d', { name: name, f: fmt.num(c.frequency), times: global.I18N ? global.I18N.measureNoun(c.frequency, 'n.time') : 'times', old: isOld ? t('al.fatigue.old', { days: fmt.int(age), dayWord: dayWord(age) }) : '' }),
          t('al.fatigue.a')));
      }
    }

    // 10) فرصة لزيادة الاستثمار
    if (!learning && avgCpr && resY >= s.scaleMinResults && spendY > 0) {
      var cprY = spendY / resY;
      var hasProblem = issues.some(function (i) { return i.level === 'critical' || i.level === 'warning'; });
      if (!hasProblem && cprY <= avgCpr * s.scaleCprRatio) {
        // لو عليه تنبيه "عائد ممتاز"، ندمجه هنا بدل تنبيهين لنفس الإعلان ونفس النصيحة
        var greatIdx = -1;
        issues.forEach(function (i, idx) { if (i.code === 'roas-great') greatIdx = idx; });
        var roasNote = '';
        if (greatIdx !== -1) {
          roasNote = fmt.currencyLabel(cur)
            ? t('al.scale.note', { one: fmt.int(1), cur: fmt.currencyLabel(cur), roas: fmt.num(salesY / spendY) })
            : t('al.scale.noteNoCur', { roas: fmt.num(salesY / spendY) });
          issues.splice(greatIdx, 1);
        }
        issues.push(makeIssue('opportunity', ['results', 'cpr', 'roas'], t('al.scale.t'),
          t('al.scale.d', { name: name, n: fmt.int(resY), label: countOf(resY, c.resultKey), cpr: money(cprY), one1: one, pct: fmt.int((1 - cprY / avgCpr) * 100), avg: money(avgCpr), note: roasNote }),
          t('al.scale.a'), 0, 'scale'));
      }
    }

    return done();
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

  function finalize(c, issues) {
    var worst = issues.reduce(function (m, i) { return Math.max(m, LEVEL_RANK[i.level]); }, -1);
    var health;
    // الإعلان المتوقف بيبقى "يحتاج مراجعة" بس لو عليه تنبيه عاجل (وقف فجأة وهو بيصرف) —
    // إعلان مرفوض من شهور ومحدش بيصرف عليه مش محتاج حاجة، فبيفضل "غير فعال"
    if (!c.active) health = worst === LEVEL_RANK.critical ? 'review' : 'inactive';
    else if (worst === LEVEL_RANK.critical) health = 'review';
    else if (worst === LEVEL_RANK.warning) health = 'improve';
    else health = 'good';
    // كل مقياس عليه ملاحظة بياخد أسوأ مستوى — عشان نلوّنه جوه الكارت
    var metricLevels = {};
    issues.forEach(function (i) {
      i.metrics.forEach(function (m) {
        if (i.level !== 'critical' && i.level !== 'warning' && i.level !== 'opportunity') return;
        if (!metricLevels[m] || LEVEL_RANK[i.level] > LEVEL_RANK[metricLevels[m]]) metricLevels[m] = i.level;
      });
    });
    issues.sort(function (a, b) { return (LEVEL_RANK[b.level] - LEVEL_RANK[a.level]) || (b.amount - a.amount); });
    return { health: health, issues: issues, metricLevels: metricLevels };
  }

  // حالات حساب Meta اللي فيها مشكلة — النص في i18n.js تحت acct.<رقم الحالة>
  var META_ACCOUNT_STATUS = { 2: 1, 3: 1, 7: 1, 8: 1, 9: 1, 100: 1, 101: 1 };

  function evaluateAccount(source, ads, acc, meta, s, fmt) {
    var alerts = [];
    var cur = (meta && meta.currency) || (ads[0] && ads[0].currency);
    var money = function (n) { return fmt.money(n, cur); };
    var accName = (meta && meta.label) || source;

    if (meta && meta.metaAccountStatus != null && meta.metaAccountStatus !== 1) {
      alerts.push(makeIssue('critical', ['account'], t('al.acct.t'),
        t(META_ACCOUNT_STATUS[meta.metaAccountStatus] ? 'acct.' + meta.metaAccountStatus : 'acct.other'),
        t('al.acct.a')));
    }

    if (meta && meta.spendCapReached) {
      alerts.push(makeIssue('critical', ['account'], t('al.cap.t'),
        t('al.cap.d', { acc: accName }), t('al.cap.a')));
    }

    // إعلانات كانت بتصرف ووقفت بسبب مشكلة في الحساب — تنبيه واحد للحساب كله.
    // لو فيه تنبيه حالة الحساب أو حد الصرف فوق، هو نفسه اللي بيشرح السبب فمش بنكرر
    var acctStopped = ads.filter(function (c) { return !c.active && ACCOUNT_STOP[c.pausedLevel] && recentSpend(c) > 0; });
    if (acctStopped.length && !alerts.length) {
      var n = acctStopped.length;
      alerts.push(makeIssue('critical', ['account'], t('al.acctStopped.t'),
        t('al.acctStopped.d', { n: fmt.int(n), ads: global.I18N ? global.I18N.noun(n, 'n.ad') : '', acc: accName }),
        t('al.acctStopped.a')));
    }

    var spendY = acc.spendByDay[YESTERDAY];
    var prevAvg = sum(acc.spendByDay, 0, DAY_BEFORE) / 5;
    if (prevAvg > 0) {
      // لو فيه تنبيه حساب عاجل فوق (دفع، حد صرف، إعلانات وقفت) فهو اللي بيفسّر الوقوف ده — منكررش
      var acctAlreadyFlagged = alerts.length > 0;
      if (spendY === 0 && acctAlreadyFlagged) {
        // مفيش تنبيه تاني
      } else if (spendY === 0) {
        alerts.push(makeIssue('critical', ['account'], t('al.acctZero.t'),
          t('al.acctZero.d', { acc: accName, avg: money(prevAvg) }), t('al.acctZero.a')));
      } else if (spendY >= prevAvg * s.accountSpikeMultiple) {
        // الزيادة بتتنبّه بس لو النتائج مازادتش معاها — زيادة مفيدة مش حاجة عاجلة
        var resPrev = sum(acc.resultsByDay, 0, DAY_BEFORE) / 5, resY = acc.resultsByDay[YESTERDAY];
        var resultsKeptUp = resPrev > 0 && resY / resPrev >= (spendY / prevAvg) * 0.8;
        if (!resultsKeptUp) {
          alerts.push(makeIssue('warning', ['account'], t('al.acctSpike.t'),
            t('al.acctSpike.d', { acc: accName, spend: money(spendY), avg: money(prevAvg), pct: fmt.int((spendY / prevAvg - 1) * 100) }),
            t('al.acctSpike.a'), spendY - prevAvg));
        }
      } else if (spendY <= prevAvg * s.accountDropRatio) {
        alerts.push(makeIssue('warning', ['account'], t('al.acctDrop.t'),
          t('al.acctDrop.d', { acc: accName, spend: money(spendY), avg: money(prevAvg), pct: fmt.int((1 - spendY / prevAvg) * 100) }),
          t('al.acctDrop.a')));
      }
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
          t('al.conc.a'));
        concentration.adId = c.id;
        concentration.adName = c.offer || c.headline || c.id;
        alerts.push(concentration);
      });
    }

    alerts.forEach(function (a) {
      a.source = source; a.accountName = accName; a.currency = cur;
      // مشاكل الحساب نفسه (دفع، وقوف كامل) أهم من أي إعلان منفرد — تطلع أول القائمة في مستواها
      if (a.level === 'critical' && !a.adId) a.amount = Number.MAX_SAFE_INTEGER;
      // حجم المشكلة: تنبيه التركيز خاص بإعلان واحد، والباقي بيخص الحساب كله
      var concAd = a.adId ? ads.filter(function (c) { return c.id === a.adId; })[0] : null;
      setImpact(a, concAd ? concAd.spend : acc.total7, acc.total7, cur, fmt, !concAd);
    });
    return alerts;
  }

  // حجم المشكلة في ميزانية صاحب النشاط: إنفاق الإعلان (أو الحساب) خلال آخر ٧ أيام ونسبته من إنفاق الحساب —
  // رقم واحد بنفس المعنى في كل التنبيهات، وبيه بنرتّب التنبيهات جوه كل مستوى (الأكبر في الميزانية الأول)
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
    var bySource = {};
    candidates.forEach(function (c) { (bySource[c.source] = bySource[c.source] || []).push(c); });

    var byAd = {}, alerts = [];
    Object.keys(bySource).forEach(function (source) {
      var ads = bySource[source];
      var acc = accountStats(ads);
      ads.forEach(function (c) {
        var r = evaluateAd(c, acc, s, fmt);
        byAd[c.id] = r;
        r.issues.forEach(function (i) {
          setImpact(i, c.spend, acc.total7, c.currency, fmt, false);
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

    var summary = { health: { review: 0, improve: 0, good: 0, inactive: 0 }, levels: { critical: 0, warning: 0, opportunity: 0, info: 0 }, atRisk: {} };
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

  global.PauseProofAlerts = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    PRESETS: PRESETS,
    presetSettings: presetSettings,
    SETTINGS_META: SETTINGS_META,
    SETTINGS_ORDER: SETTINGS_ORDER,
    mergeSettings: mergeSettings,
    analyze: analyze
  };
})(window);
