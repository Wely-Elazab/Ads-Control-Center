// =====================================================================
// PauseProof — محرك التنبيهات والتقييم
// =====================================================================
// بياخد الإعلانات المحمّلة (بنفس الشكل اللي app.js بيبنيه) ويرجّع:
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

  // وصف كل إعداد لشاشة الإعدادات — بلغة بزنس
  // kind: multiple (×) / ratio (بيتعرض كنسبة مئوية) / days / times / count
  var SETTINGS_META = [
    { key: 'learningDays', kind: 'days', group: 'عام', label: 'فترة التعلّم للإعلان الجديد', help: 'الإعلانات الأحدث من كده مش هنحكم على أداءها لسه — المنصات بتحتاج كام يوم تتعلّم.' },
    { key: 'oldAdDays', kind: 'days', group: 'عام', label: 'الإعلان يعتبر قديم بعد', help: 'بنستخدمها مع تكرار الظهور لاكتشاف زهق الجمهور.' },
    { key: 'wasteCprMultiple', kind: 'multiple', group: 'الهدر', label: 'صرف بدون نتائج', help: 'ننبّه لو الإعلان صرف في آخر يومين أكتر من المضاعف ده من متوسط تكلفة النتيجة في حسابك، من غير ولا نتيجة.' },
    { key: 'cprWarnMultiple', kind: 'multiple', group: 'الهدر', label: 'تكلفة النتيجة مرتفعة (تحسين)', help: 'تكلفة النتيجة في الإعلان مقارنة بمتوسط حسابك.' },
    { key: 'cprCriticalMultiple', kind: 'multiple', group: 'الهدر', label: 'تكلفة النتيجة مرتفعة جداً (مراجعة)', help: 'تكلفة النتيجة في الإعلان مقارنة بمتوسط حسابك.' },
    { key: 'roasBreakEven', kind: 'multiple', group: 'العائد', label: 'حد الخسارة', help: 'لو كل ١ بيتصرف بيرجع أقل من كده مبيعات، الإعلان بيخسر.' },
    { key: 'roasTarget', kind: 'multiple', group: 'العائد', label: 'العائد المستهدف', help: 'كل ١ بيتصرف المفروض يرجع كام مبيعات.' },
    { key: 'lowDeliveryRatio', kind: 'ratio', group: 'الصرف', label: 'وصول ضعيف', help: 'إعلان فعّال صرف أمس أقل من النسبة دي من متوسطه اليومي.' },
    { key: 'spikeMultiple', kind: 'multiple', group: 'الصرف', label: 'صرف أعلى من المعتاد', help: 'إعلان صرف أمس أكتر من المضاعف ده من متوسطه، من غير ما النتائج تزيد بنفس النسبة.' },
    { key: 'dropRatio', kind: 'ratio', group: 'النتائج', label: 'انخفاض النتائج', help: 'نتائج أمس أقل من النسبة دي من متوسطها اليومي مع نفس مستوى الصرف.' },
    { key: 'scaleMinResults', kind: 'count', group: 'الفرص', label: 'أقل عدد نتائج لفرصة زيادة الاستثمار', help: 'عدد النتائج أمس.' },
    { key: 'scaleCprRatio', kind: 'ratio', group: 'الفرص', label: 'تكلفة النتيجة في الفرصة', help: 'تكلفة النتيجة أمس أقل من النسبة دي من متوسط حسابك.' },
    { key: 'frequencyWarn', kind: 'times', group: 'الجمهور', label: 'بداية زهق الجمهور (مع إعلان قديم)', help: 'متوسط عدد مرات ظهور الإعلان لنفس الشخص في آخر ٧ أيام.' },
    { key: 'frequencyHigh', kind: 'times', group: 'الجمهور', label: 'الجمهور زهق من الإعلان', help: 'متوسط عدد مرات ظهور الإعلان لنفس الشخص في آخر ٧ أيام.' },
    { key: 'accountSpikeMultiple', kind: 'multiple', group: 'الحساب', label: 'إنفاق الحساب زاد فجأة', help: 'إجمالي صرف الحساب أمس مقارنة بمتوسطه اليومي.' },
    { key: 'accountDropRatio', kind: 'ratio', group: 'الحساب', label: 'إنفاق الحساب قلّ فجأة', help: 'إجمالي صرف الحساب أمس مقارنة بمتوسطه اليومي.' },
    { key: 'concentrationShare', kind: 'ratio', group: 'الحساب', label: 'تركيز الميزانية في إعلان واحد', help: 'إعلان واحد أداؤه أقل من المتوسط واخد النسبة دي أو أكتر من صرف الحساب.' }
  ];

  var LEVEL_RANK = { critical: 3, warning: 2, info: 1, opportunity: 0 };

  // صيغة المفرد لكل نوع نتيجة — عشان الجمل تبقى طبيعية ("تكلفة عملية الشراء الواحدة" مش "تكلفة الـمشتريات")
  var SINGULAR = {
    'مشتريات': 'عملية شراء', 'عملاء محتملون': 'عميل محتمل', 'محادثات واتساب': 'محادثة',
    'نقرات على الرابط': 'نقرة', 'زيارات الصفحة المقصودة': 'زيارة', 'تثبيتات التطبيق': 'تثبيت',
    'تفاعل مع المنشور': 'تفاعل', 'مشاهدات الفيديو': 'مشاهدة', 'ردود أولى بالرسائل': 'رد',
    'تحويلات': 'تحويل', 'سوايب (نقرات)': 'سوايب'
  };
  function singularOf(label) { return SINGULAR[label] || 'نتيجة'; }

  function sum(arr, from, to) {
    var s = 0;
    for (var i = from; i <= to; i++) s += (arr && arr[i]) || 0;
    return s;
  }
  function any(arr) { return (arr || []).some(function (v) { return v > 0; }); }

  function mergeSettings(custom) {
    var s = {};
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
      var v = custom && custom[k];
      s[k] = (typeof v === 'number' && isFinite(v) && v >= 0) ? v : DEFAULT_SETTINGS[k];
    });
    return s;
  }

  // إحصائيات كل حساب (source) — متوسط تكلفة النتيجة محسوب لكل نوع نتيجة على حدة،
  // لأن مقارنة تكلفة "محادثة" بتكلفة "شراء" مقارنة مضلّلة
  function accountStats(ads) {
    var byLabel = {};
    var hasSales = false, spendByDay = [0, 0, 0, 0, 0, 0, 0], resultsByDay = [0, 0, 0, 0, 0, 0, 0];
    var total7 = 0, activeCount = 0;
    ads.forEach(function (c) {
      for (var i = 0; i < 7; i++) {
        spendByDay[i] += (c.daily && c.daily[i]) || 0;
        resultsByDay[i] += (c.dailyResults && c.dailyResults[i]) || 0;
      }
      total7 += c.spend || 0;
      if (c.active) activeCount++;
      if (any(c.dailySales)) hasSales = true;
      if (c.results == null || !c.resultLabel) return;
      var g = byLabel[c.resultLabel] || (byLabel[c.resultLabel] = { spend: 0, results: 0, adsWithResults: 0 });
      g.spend += c.spend || 0;
      g.results += c.results || 0;
      if (c.results > 0) g.adsWithResults++;
    });
    Object.keys(byLabel).forEach(function (k) {
      var g = byLabel[k];
      g.avgCpr = g.results > 0 ? g.spend / g.results : null;
    });
    return { byLabel: byLabel, hasSales: hasSales, spendByDay: spendByDay, resultsByDay: resultsByDay, total7: total7, activeCount: activeCount };
  }

  // amount: المبلغ المرتبط بالتنبيه (للترتيب). code: معرّف داخلي للتنبيه.
  // atRisk: المبلغ ده بيتحسب ضمن "الميزانية المعرّضة للهدر" (صرف بدون نتائج أو خسارة مباشرة بس)
  function makeIssue(level, metrics, title, detail, advice, amount, code, atRisk) {
    return { level: level, metrics: metrics, title: title, detail: detail, advice: advice, amount: amount || 0, code: code || null, atRisk: !!atRisk };
  }

  function evaluateAd(c, acc, s, fmt) {
    var issues = [];
    var name = '«' + (c.offer || c.headline || c.id) + '»';
    var cur = c.currency;
    var money = function (n) { return fmt.money(n, cur); };
    var label = c.resultLabel || 'نتائج';
    var one = singularOf(c.resultLabel);
    var group = c.resultLabel ? acc.byLabel[c.resultLabel] : null;
    // متوسط الحساب يبقى له معنى بس لو فيه أكتر من إعلان جاب نتائج من نفس النوع
    var avgCpr = group && group.adsWithResults >= 2 ? group.avgCpr : null;
    var age = c.daysAgo;
    var learning = age != null && age < s.learningDays;
    var daily = c.daily || [], results = c.dailyResults || [], sales = c.dailySales || [];
    var spendY = daily[YESTERDAY] || 0, spend2 = sum(daily, DAY_BEFORE, YESTERDAY);
    var resY = results[YESTERDAY] || 0, res2 = sum(results, DAY_BEFORE, YESTERDAY);
    var salesY = sales[YESTERDAY] || 0;
    var prevSpendAvg = sum(daily, 0, DAY_BEFORE) / 5;

    // 1) حالة المراجعة من المنصة — مهمة سواء الإعلان فعّال أو لا
    if (c.reviewStatus === 'disapproved') {
      issues.push(makeIssue('critical', ['status'], 'إعلان مرفوض من المنصة',
        'المنصة رفضت ' + name + '، فمش هيظهر للناس لحد ما يتعدّل.',
        'اطلب من مسؤول الإعلانات يراجع سبب الرفض ويعدّل الإعلان أو يستبدله.'));
    } else if (c.reviewStatus === 'limited') {
      issues.push(makeIssue('warning', ['status', 'delivery'], 'ظهور محدود بسبب سياسات المنصة',
        'المنصة بتعرض ' + name + ' لعدد محدود من الناس بسبب ملاحظة على محتواه.',
        'اسأل مسؤول الإعلانات عن الملاحظة — تعديل بسيط ممكن يرجّع الوصول الطبيعي.'));
    }

    // 2) إعلان غير فعّال: التنبيه الوحيد المفيد إنه وقف مؤخراً
    if (!c.active) {
      var recentSpend = sum(daily, 3, YESTERDAY);
      // (الإعلان غير فعّال دلوقتي — فأي صرف في آخر ٣ أيام معناه إنه كان شغّال ووقف قريب)
      var stoppedRecently = recentSpend > 0 && (spendY === 0 || !(daily[TODAY] > 0) || (c.updatedDaysAgo != null && c.updatedDaysAgo <= 1));
      if (stoppedRecently) {
        var STOP_REASONS = {
          campaign: ' (الحملة كلها متوقفة)', adset: ' (المجموعة الإعلانية متوقفة)',
          ended: ' لأن مدة الحملة انتهت', account: ' بسبب مشكلة في حساب الإعلانات',
          'account-cap': ' لأن الحساب وصل للحد الأقصى للصرف', rejected: ' لأن المنصة رفضته',
          pending: ' لأنه رجع تحت المراجعة', 'not-eligible': ' لأنه بقى غير مؤهل للظهور'
        };
        var where = STOP_REASONS[c.pausedLevel] || '';
        var wasGood = avgCpr && c.results > 0 && c.cpr != null && c.cpr <= avgCpr;
        issues.push(makeIssue(wasGood ? 'warning' : 'info', ['status'], 'إعلان توقف مؤخراً',
          name + ' اتوقف' + where + ' بعد ما صرف ' + money(recentSpend) + ' في آخر ٣ أيام' +
            (c.results > 0 ? ' وجاب ' + fmt.int(c.results) + ' ' + label + ' خلال الأسبوع.' : '.'),
          wasGood ? 'أداؤه كان أفضل من متوسط حسابك — اتأكد إن الإيقاف مقصود.' : 'لو الإيقاف مقصود، مفيش حاجة مطلوبة.',
          0));
      }
      return finalize(c, issues);
    }

    // 3) وصول ضعيف أو متوقف رغم إن الإعلان فعّال
    if (age == null || age >= 2) {
      if (spendY === 0 && prevSpendAvg > 0) {
        issues.push(makeIssue('warning', ['delivery', 'spend'], 'إعلان فعّال لكنه مصرفش أمس',
          name + ' فعّال، لكنه مصرفش أي حاجة أمس مع إن متوسط صرفه ' + money(prevSpendAvg) + ' في اليوم — يعني مش بيظهر للناس.',
          'اسأل مسؤول الإعلانات: هل الميزانية خلصت، أو الجمهور ضيق، أو فيه مشكلة في المزايدة؟'));
      } else if (spendY > 0 && prevSpendAvg > 0 && spendY < prevSpendAvg * s.lowDeliveryRatio) {
        issues.push(makeIssue('warning', ['delivery', 'spend'], 'إعلان فعّال لكن وصوله ضعيف',
          name + ' فعّال، لكنه صرف أمس ' + money(spendY) + ' بس، مقابل متوسط ' + money(prevSpendAvg) + ' في اليوم قبلها — يعني بيوصل لعدد قليل جداً من الناس.',
          'اسأل مسؤول الإعلانات عن السبب: ميزانية، جمهور، أو ملاحظة من المنصة.'));
      } else if (c.spend === 0 && prevSpendAvg === 0) {
        issues.push(makeIssue('warning', ['delivery', 'spend'], 'إعلان فعّال لكنه مصرفش خالص',
          name + ' فعّال لكنه مصرفش أي حاجة في آخر ٧ أيام.',
          'لو الإعلان المفروض يكون شغّال، راجع مع مسؤول الإعلانات ليه مش بيظهر.'));
      }
    }

    var wasteRaised = false;
    if (!learning && c.results != null) {
      // 4) صرف بدون نتائج في آخر يومين
      var threshold = avgCpr ? avgCpr * s.wasteCprMultiple : null;
      if (res2 === 0 && spend2 > 0 && threshold) {
        var expected = spend2 / avgCpr;
        var wasteDetail = name + ' صرف ' + money(spend2) + ' خلال آخر يومين بدون أي ' + label + '. متوسط تكلفة كل ' + one + ' في حسابك ' + money(avgCpr) +
          '، يعني الصرف ده كان المفروض يجيب حوالي ' + fmt.int(Math.max(1, expected)) + ' ' + label + '.';
        if (spend2 >= threshold) {
          wasteRaised = true;
          issues.push(makeIssue('critical', ['spend', 'results'], 'صرف بدون نتائج', wasteDetail,
            'راجع مع مسؤول الإعلانات: الإعلان محتاج تعديل أو إيقاف عشان الميزانية دي متتهدرش.', spend2, 'waste', true));
        } else if (spend2 >= threshold / 2) {
          wasteRaised = true;
          issues.push(makeIssue('warning', ['spend', 'results'], 'صرف بدون نتائج لحد دلوقتي', wasteDetail,
            'تابعه النهارده — لو فضل كده هيتحول لهدر في الميزانية.', spend2, 'waste-early'));
        }
      }

      // 5) العائد (بس للإعلانات اللي بتسجّل قيمة مبيعات)
      if (acc.hasSales && any(sales) && spendY > 0 && (!avgCpr || spendY >= avgCpr * 0.5) && !(salesY === 0 && wasteRaised)) {
        var roasY = salesY / spendY;
        var roasText = 'كل ١ ' + fmt.currencyLabel(cur) + ' اتصرف رجّع ' + fmt.num(roasY) + ' ' + fmt.currencyLabel(cur);
        if (roasY < s.roasBreakEven) {
          issues.push(makeIssue('critical', ['roas', 'spend'], 'الإعلان بيخسر',
            name + ' صرف أمس ' + money(spendY) + ' ورجّع مبيعات ' + money(salesY) + ' بس — ' + roasText + '، يعني أقل من التكلفة.',
            'الإعلان ده بيخسر فلوس حالياً — ناقش مع مسؤول الإعلانات تعديله أو تقليل ميزانيته.', spendY - salesY, 'loss', true));
        } else if (roasY < s.roasTarget) {
          issues.push(makeIssue('warning', ['roas'], 'عائد أقل من المستهدف',
            name + ' صرف أمس ' + money(spendY) + ' ورجّع مبيعات ' + money(salesY) + ' — ' + roasText + '، والمستهدف ' + fmt.num(s.roasTarget) + '.',
            'فيه عائد لكنه ضعيف — تحسين الإعلان أو الصفحة المقصودة أو الاستهداف ممكن يرفعه.', 0));
        } else if (roasY >= s.roasTarget * 1.5) {
          issues.push(makeIssue('opportunity', ['roas'], 'عائد ممتاز',
            name + ' صرف أمس ' + money(spendY) + ' ورجّع مبيعات ' + money(salesY) + ' — ' + roasText + '، أعلى بكتير من المستهدف.',
            'من أربح إعلاناتك حالياً — ممكن تناقش مع مسؤول الإعلانات زيادة ميزانيته تدريجياً.', 0, 'roas-great'));
        }
      }

      // 6) تكلفة النتيجة أعلى من متوسط الحساب (على مدار الأسبوع)
      if (avgCpr && c.results >= 2 && c.cpr != null) {
        var ratio = c.cpr / avgCpr;
        if (ratio >= s.cprWarnMultiple) {
          var critical = ratio >= s.cprCriticalMultiple;
          var oldNote = age != null && age >= s.oldAdDays ? ' (والإعلان شغّال من ' + fmt.int(age) + ' يوم)' : '';
          issues.push(makeIssue(critical ? 'critical' : 'warning', ['cpr'], 'تكلفة ' + label + ' عالية',
            'كل ' + one + ' في ' + name + ' بتتكلف ' + money(c.cpr) + oldNote + ' — أعلى بـ ' + fmt.int((ratio - 1) * 100) + '٪ من متوسط حسابك (' + money(avgCpr) + ').',
            'فيه إعلانات تانية بتجيب نفس النتيجة بتكلفة أقل — ممكن نقل جزء من الميزانية ليها.',
            c.spend - c.results * avgCpr));
        }
      }

      // 7) انخفاض النتائج أمس مقارنة بالمعتاد مع نفس مستوى الصرف
      var prevResAvg = sum(results, 1, DAY_BEFORE) / 4;
      var prevSpend4 = sum(daily, 1, DAY_BEFORE) / 4;
      if (!wasteRaised && prevResAvg >= 2 && prevSpend4 > 0 && spendY >= prevSpend4 * 0.7 && resY <= prevResAvg * s.dropRatio) {
        issues.push(makeIssue('warning', ['results'], 'نتائج أقل من المعتاد',
          name + ' جاب أمس ' + fmt.int(resY) + ' ' + label + ' بس، مقابل متوسط ' + fmt.num(prevResAvg) + ' في اليوم، مع إن الصرف تقريباً بنفس المعدل.',
          'ممكن الجمهور بدأ يزهق أو فيه مشكلة في الموقع أو رقم التواصل — تابعه النهارده.'));
      }
    }

    // 8) صرف أعلى من المعتاد من غير ما النتائج تتحسن بنفس النسبة
    // (بنتجاهله لو الإعلان لسه بادئ يصرف — أقل من ٣ أيام صرف قبل أمس — أو لو عليه تنبيه صرف بدون نتائج أصلاً)
    var priorSpendDays = daily.slice(0, YESTERDAY).filter(function (v) { return v > 0; }).length;
    if (!learning && !wasteRaised && priorSpendDays >= 3 && prevSpendAvg > 0 && spendY >= prevSpendAvg * s.spikeMultiple) {
      var yCpr = resY > 0 ? spendY / resY : null;
      if (!avgCpr || yCpr == null || yCpr > avgCpr) {
        issues.push(makeIssue('warning', ['spend'], 'صرف أعلى من المعتاد',
          name + ' صرف أمس ' + money(spendY) + ' — حوالي ' + fmt.num(spendY / prevSpendAvg) + ' أضعاف متوسطه اليومي (' + money(prevSpendAvg) + ')، من غير ما النتائج تتحسن بنفس النسبة.',
          'اتأكد إن زيادة الميزانية مقصودة وإن النتائج هتزيد معاها.', spendY - prevSpendAvg));
      }
    }

    // 9) تكرار الظهور لنفس الشخص (زهق الجمهور)
    if (c.frequency != null) {
      var isOld = age != null && age >= s.oldAdDays;
      if (c.frequency >= s.frequencyHigh || (isOld && c.frequency >= s.frequencyWarn)) {
        var hurting = avgCpr && c.cpr != null && c.cpr >= avgCpr * s.cprWarnMultiple;
        issues.push(makeIssue(hurting ? 'critical' : 'warning', ['frequency'], 'الجمهور زهق من الإعلان',
          'نفس الشخص شاف ' + name + ' حوالي ' + fmt.num(c.frequency) + ' مرات في المتوسط خلال آخر ٧ أيام' +
            (isOld ? '، والإعلان شغّال من ' + fmt.int(age) + ' يوم' : '') +
            '. تكرار نفس الإعلان بيخلّي الناس تتجاهله والتكلفة تزيد.',
          'وقت مناسب لتجديد الإعلان (صورة أو فيديو أو نص جديد) أو توسيع الجمهور.'));
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
          roasNote = ' وكمان كل ١ ' + fmt.currencyLabel(cur) + ' اتصرف أمس رجّع ' + fmt.num(salesY / spendY) + ' ' + fmt.currencyLabel(cur) + ' مبيعات.';
          issues.splice(greatIdx, 1);
        }
        issues.push(makeIssue('opportunity', ['results', 'cpr', 'roas'], 'فرصة لزيادة الاستثمار',
          name + ' جاب أمس ' + fmt.int(resY) + ' ' + label + ' بتكلفة ' + money(cprY) + ' لكل ' + one + ' — أرخص بـ ' + fmt.int((1 - cprY / avgCpr) * 100) + '٪ من متوسط حسابك (' + money(avgCpr) + ').' + roasNote,
          'من أفضل إعلاناتك حالياً — ممكن تناقش مع مسؤول الإعلانات زيادة ميزانيته تدريجياً.', 0, 'scale'));
      }
    }

    return finalize(c, issues);
  }

  function finalize(c, issues) {
    var worst = issues.reduce(function (m, i) { return Math.max(m, LEVEL_RANK[i.level]); }, -1);
    var health;
    if (c.reviewStatus === 'disapproved') health = 'review';
    else if (!c.active) health = 'inactive';
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

  var META_ACCOUNT_STATUS = {
    2: 'الحساب معطّل من Meta — الإعلانات مش هتشتغل.',
    3: 'فيه مبلغ مستحق لم يُدفع — الإعلانات ممكن تقف في أي وقت.',
    7: 'الحساب تحت مراجعة من Meta — الإعلانات ممكن تتأثر.',
    8: 'فيه تسوية دفع معلّقة على الحساب.',
    9: 'الحساب في فترة سماح بسبب مشكلة في الدفع — الإعلانات هتقف لو ماتحلّتش.',
    100: 'الحساب في طريقه للإغلاق.',
    101: 'الحساب مقفول.'
  };

  function evaluateAccount(source, ads, acc, meta, s, fmt) {
    var alerts = [];
    var cur = (meta && meta.currency) || (ads[0] && ads[0].currency);
    var money = function (n) { return fmt.money(n, cur); };
    var accName = (meta && meta.label) || source;

    if (meta && meta.metaAccountStatus != null && meta.metaAccountStatus !== 1) {
      alerts.push(makeIssue('critical', ['account'], 'مشكلة في حساب الإعلانات',
        META_ACCOUNT_STATUS[meta.metaAccountStatus] || 'فيه مشكلة في حالة الحساب.',
        'ادخل على إعدادات الدفع والحساب في Meta Business Suite أو تواصل مع مسؤول الإعلانات فوراً.'));
    }

    var spendY = acc.spendByDay[YESTERDAY];
    var prevAvg = sum(acc.spendByDay, 0, DAY_BEFORE) / 5;
    if (prevAvg > 0) {
      if (spendY === 0) {
        alerts.push(makeIssue('critical', ['account'], 'الحساب مصرفش خالص أمس',
          'مفيش ولا إعلان في ' + accName + ' وصل للناس أمس، مع إن متوسط صرف الحساب ' + money(prevAvg) + ' في اليوم.',
          'اتأكد من وسيلة الدفع وحالة الحملات مع مسؤول الإعلانات — كل يوم وقوف معناه مبيعات ضايعة.'));
      } else if (spendY >= prevAvg * s.accountSpikeMultiple) {
        var resPrev = sum(acc.resultsByDay, 0, DAY_BEFORE) / 5, resY = acc.resultsByDay[YESTERDAY];
        var resultsKeptUp = resPrev > 0 && resY / resPrev >= (spendY / prevAvg) * 0.8;
        alerts.push(makeIssue(resultsKeptUp ? 'info' : 'warning', ['account'], 'إنفاق الحساب زاد فجأة',
          'إجمالي صرف ' + accName + ' أمس ' + money(spendY) + ' مقابل متوسط ' + money(prevAvg) + ' في اليوم (+' + fmt.int((spendY / prevAvg - 1) * 100) + '٪)' +
            (resultsKeptUp ? '، والنتائج زادت معاه.' : '، والنتائج مازادتش بنفس النسبة.'),
          resultsKeptUp ? 'الزيادة شكلها مفيدة — اتأكد بس إنها ضمن الميزانية المخططة.' : 'اتأكد مع مسؤول الإعلانات إن زيادة الميزانية مقصودة.',
          resultsKeptUp ? 0 : spendY - prevAvg));
      } else if (spendY <= prevAvg * s.accountDropRatio) {
        alerts.push(makeIssue('warning', ['account'], 'إنفاق الحساب قلّ فجأة',
          'إجمالي صرف ' + accName + ' أمس ' + money(spendY) + ' بس، مقابل متوسط ' + money(prevAvg) + ' في اليوم (−' + fmt.int((1 - spendY / prevAvg) * 100) + '٪).',
          'ممكن إعلانات مهمة وقفت أو فيه مشكلة دفع — راجع مع مسؤول الإعلانات.'));
      }
    }

    // تركيز الميزانية في إعلان أداؤه أقل من المتوسط
    if (acc.total7 > 0 && acc.activeCount >= 2) {
      ads.forEach(function (c) {
        var share = (c.spend || 0) / acc.total7;
        if (share < s.concentrationShare || !c.active) return;
        var g = c.resultLabel ? acc.byLabel[c.resultLabel] : null;
        var avgCpr = g && g.adsWithResults >= 2 ? g.avgCpr : null;
        var weak = c.results === 0 || (avgCpr && c.cpr != null && c.cpr > avgCpr * 1.2);
        if (!weak) return;
        var concentration = makeIssue('warning', ['account'], 'الميزانية متركزة في إعلان أداؤه أقل',
          '«' + (c.offer || c.id) + '» واخد ' + fmt.int(share * 100) + '٪ من صرف ' + accName + ' في آخر ٧ أيام (' + money(c.spend) + ')، ونتائجه أقل من متوسط الحساب.',
          'توزيع الميزانية على الإعلانات الأفضل أداءً ممكن يجيب نتائج أكتر بنفس المبلغ.');
        concentration.adId = c.id;
        concentration.adName = c.offer || c.headline || c.id;
        alerts.push(concentration);
      });
    }

    alerts.forEach(function (a) {
      a.source = source; a.accountName = accName; a.currency = cur;
      // مشاكل الحساب نفسه (دفع، وقوف كامل) أهم من أي إعلان منفرد — تطلع أول القائمة في مستواها
      if (a.level === 'critical' && !a.adId) a.amount = Number.MAX_SAFE_INTEGER;
    });
    return alerts;
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
          alerts.push(Object.assign({ adId: c.id, source: source, platform: c.platform, adName: c.offer || c.headline || c.id, currency: c.currency }, i));
        });
      });
      evaluateAccount(source, ads, acc, accountsMeta && accountsMeta[source], s, fmt).forEach(function (a) {
        a.platform = ads[0] && ads[0].platform;
        alerts.push(a);
      });
    });

    alerts.sort(function (a, b) { return (LEVEL_RANK[b.level] - LEVEL_RANK[a.level]) || (b.amount - a.amount); });

    var summary = { health: { review: 0, improve: 0, good: 0, inactive: 0 }, levels: { critical: 0, warning: 0, opportunity: 0, info: 0 }, atRisk: {} };
    Object.keys(byAd).forEach(function (id) { summary.health[byAd[id].health]++; });
    alerts.forEach(function (a) {
      summary.levels[a.level]++;
      // الميزانية المعرّضة للهدر = صرف بدون نتائج + خسارة مباشرة (بعملة كل حساب)
      if (a.atRisk && a.amount > 0) summary.atRisk[a.currency || ''] = (summary.atRisk[a.currency || ''] || 0) + a.amount;
    });

    return { byAd: byAd, alerts: alerts, summary: summary, settings: s };
  }

  global.PauseProofAlerts = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    SETTINGS_META: SETTINGS_META,
    mergeSettings: mergeSettings,
    analyze: analyze
  };
})(window);
