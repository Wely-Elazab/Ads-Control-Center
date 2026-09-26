// =====================================================================
// Ads Center — الاختبارات
// =====================================================================
// كل اختبار بيشغّل كود الأداة الحقيقي على بيانات تجريبية ويتأكد من النتيجة.
// الهدف الأساسي: أي غلطة اتصلحت قبل كده متظهرش تاني من غير ما نلاحظ.
(function () {
  var results = [], group = '';
  function describe(name, fn) { group = name; fn(); }
  function test(name, fn) {
    resetState();
    try { fn(); results.push({ group: group, name: name, ok: true }); }
    catch (e) { results.push({ group: group, name: name, ok: false, msg: e && e.message ? e.message : String(e) }); }
  }
  // اختبارات محتاجة تستنى (طلبات شبكة وهمية أو ملفات السيرفر) — بتشتغل بالدور بعد الاختبارات العادية
  var asyncQueue = [];
  function testAsync(name, fn) { asyncQueue.push({ group: group, name: name, fn: fn }); }
  function runAsync() {
    return asyncQueue.reduce(function (p, item) {
      return p.then(function () {
        resetState();
        return Promise.resolve().then(item.fn).then(
          function () { results.push({ group: item.group, name: item.name, ok: true }); },
          function (e) { results.push({ group: item.group, name: item.name, ok: false, msg: e && e.message ? e.message : String(e) }); });
      });
    }, Promise.resolve());
  }
  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }
  // رد وهمي من سيرفر الأداة بنفس شكل fetch (apiPost بيقرا text و status)
  function fakeFetch(obj, status) {
    status = status || 200;
    return function () {
      return Promise.resolve({ ok: status < 400, status: status,
        text: function () { return Promise.resolve(JSON.stringify(obj)); },
        json: function () { return Promise.resolve(obj); } });
    };
  }
  function eq(actual, expected, what) {
    var a = JSON.stringify(actual), b = JSON.stringify(expected);
    if (a !== b) throw new Error((what ? what + ': ' : '') + 'expected ' + b + ' but got ' + a);
  }
  function ok(cond, what) { if (!cond) throw new Error(what || 'expected true'); }
  function withLang(l, fn) {
    var prev = I18N.lang;
    I18N.setLang(l);
    try { return fn(); } finally { I18N.setLang(prev); }
  }

  // ---------- بيانات تجريبية ----------
  var TODAY = todayKeyInTz(BROWSER_TZ);
  var DAYS = last7Days(TODAY);
  var KEYS = DAYS.map(function (d) { return d.key; });
  function sumArr(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
  // إعلان بنفس الشكل اللي ملفات المنصات بتبنيه
  function ad(id, o) {
    o = o || {};
    var daily = o.daily || [0, 0, 0, 0, 0, 0, 0], res = o.res || [0, 0, 0, 0, 0, 0, 0], sales = o.sales || [0, 0, 0, 0, 0, 0, 0];
    var spend = sumArr(daily), r = sumArr(res), s = sumArr(sales);
    var c = {
      id: id, nativeId: id, platform: o.platform || 'Meta', source: o.source || 'meta:act_1',
      placement: o.camp || 'Camp', campaignId: o.cid || 'c1', campaignName: o.camp || 'Camp', adsetName: 'Set',
      offer: 'Ad ' + id, headline: 'H', desc: '', caption: 'C', format: 'image', themeClass: 'pv-t1', thumbUrl: null,
      landing: 'https://example.com', landingKind: 'website', active: o.active !== false, pausedLevel: o.pausedLevel || null,
      daily: daily, dailyResults: res, dailySales: sales, dailyDates: KEYS, spend: spend, results: o.noResults ? null : r,
      resultKey: o.key || 'purchase', cpr: r ? spend / r : null, roas: s && spend ? s / spend : null,
      frequency: o.freq || null, daysAgo: o.age != null ? o.age : 30, updatedDaysAgo: 5, currency: 'SAR',
      reviewStatus: o.review || null, deliveryReason: null, platformStatus: 'ACTIVE', period: null
    };
    return c;
  }
  function steady(n) { return [n, n, n, n, n, n, n]; }
  function engine(ads, meta, settings) { return PauseProofAlerts.analyze(ads, meta || {}, settings || {}, ALERT_FMT); }
  // حساب فيه إعلانين كويسين عشان يبقى فيه متوسط تكلفة نتيجة
  function baseAccount() {
    return [ad('good1', { daily: steady(100), res: steady(5) }), ad('good2', { daily: steady(100), res: steady(5) })];
  }

  function resetState() {
    candidates = [];
    filters = { platform: 'all', format: 'all', health: 'all', text: '', sort: 'priority' };
    viewMode = 'ads';
    alertSettings = {};
    period = { preset: 'last7' };
    // حالة المنصات والحسابات والجلسات — كل اختبار يبدأ من غير أي منصة متصلة
    [activeSources, platformState, sessionTokens, lastAccounts].forEach(function (o) { Object.keys(o).forEach(function (k) { delete o[k]; }); });
    Object.keys(platformOptions).forEach(function (p) { if ((platformOptions[p] || []).length) setPlatformOptions(p, []); });
    Object.keys(loadingPlatforms).forEach(function (p) { loadingPlatforms[p] = false; });
    googleAccessToken = null; snapchatAccessToken = null;
    lastUpdatedAt = null;
    I18N.setLang('ar');
  }

  // ================================================================
  describe('الترجمة', function () {
    test('كل مفتاح عربي ليه ترجمة إنجليزي والعكس', function () {
      eq(I18N.missingKeys(), { missingInEn: [], missingInAr: [] });
    });
    test('صيغة العدد في العربي', function () {
      var cases = [[0, 'many'], [1, 'one'], [2, 'one'], [3, 'many'], [10, 'many'], [11, 'one'], [99, 'one'], [100, 'one'], [102, 'one'], [103, 'many'], [110, 'many'], [111, 'one']];
      cases.forEach(function (c) { eq(I18N.form(c[0]), c[1], String(c[0])); });
    });
    test('صيغة العدد في الإنجليزي', function () {
      withLang('en', function () { [[0, 'many'], [1, 'one'], [2, 'many'], [21, 'many']].forEach(function (c) { eq(I18N.form(c[0]), c[1], String(c[0])); }); });
    });
    test('الاسم مع العدد', function () {
      eq(noun(5, 'n.ad'), 'إعلانات'); eq(noun(1, 'n.ad'), 'إعلان'); eq(noun(101, 'n.ad'), 'إعلان');
      // من ١١ لـ ٩٩ (وآخر رقمين في الأعداد الكبيرة) التمييز منصوب في الفصحى
      eq(noun(15, 'n.ad'), 'إعلاناً'); eq(noun(111, 'n.ad'), 'إعلاناً'); eq(noun(20, 'n.day'), 'يوماً'); eq(noun(12, 'n.account'), 'حساباً');
      eq(noun(15, 'n.campaign'), 'حملة', 'no .acc key = the singular');
      withLang('en', function () { eq(noun(1, 'n.ad'), 'ad'); eq(noun(2, 'n.ad'), 'ads'); eq(noun(15, 'n.ad'), 'ads'); });
    });
    test('مفتاح مش موجود بيرجع نفسه (عشان يتلاحظ)', function () { eq(t('no.such.key'), 'no.such.key'); });
    test('تبديل اللغة بيغيّر الاتجاه', function () {
      withLang('en', function () { eq(document.documentElement.dir, 'ltr'); });
      eq(document.documentElement.dir, 'rtl');
    });
  });

  describe('تنسيق الأرقام', function () {
    test('المبالغ بالعربي', function () {
      eq(money(1234.4, 'SAR'), '١٬٢٣٤ ر.س');
      eq(money(0.4, 'SAR'), '٠٫٤ ر.س');
      // من غير عملة معروفة: الرقم بس (قبل كده كان "ر.س" افتراضياً — حساب بالجنيه كان بيظهر بالريال)
      eq(money(null), '٠');
      eq(currencyLabel(null), '');
    });
    test('فاصل الآلاف والكسور الصغيرة', function () {
      eq(fmtNum(12500), '١٢٬٥٠٠');
      eq(fmtNum(0.4, true), '٠٫٤');
      eq(fmtNum(0.4), '٠');
      withLang('en', function () { eq(fmtNum(12500), '12,500'); });
    });
    test('المبالغ بالإنجليزي', function () {
      withLang('en', function () {
        eq(money(1234.4, 'SAR'), '1,234 SAR');
        eq(money(5, 'USD'), '5 $');
        eq(money(2.5, 'EGP'), '2.5 EGP');
      });
    });
    test('منذ كام يوم', function () {
      eq(sinceLabel(0), 'اليوم'); eq(sinceLabel(1), 'منذ يوم'); eq(sinceLabel(2), 'منذ يومين');
      eq(sinceLabel(5), 'منذ ٥ أيام'); eq(sinceLabel(15), 'منذ ١٥ يوماً');
      withLang('en', function () { eq(sinceLabel(5), '5 days ago'); });
    });
  });

  describe('الحماية', function () {
    test('esc بيشفّر رموز HTML', function () {
      eq(esc('<a href="x">\'&'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
    });
    test('safeUrl بيقبل http/https الكاملة بس', function () {
      eq(safeUrl('javascript:alert(1)'), null);
      eq(safeUrl('data:text/html,x'), null);
      eq(safeUrl('/relative'), null);
      eq(safeUrl('—'), null);
      eq(safeUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
    });
    test('معاينة Meta بتقبل facebook.com بس', function () {
      eq(metaIframeHtml('<iframe src="https://evil.com/x"></iframe>'), null);
      eq(metaIframeHtml('<iframe src="https://facebook.com.evil.com/x"></iframe>'), null);
      var ok1 = metaIframeHtml('<iframe src="https://www.facebook.com/ads/api/preview_iframe.php?d=1" width="540" height="690"></iframe>');
      ok(ok1 && ok1.indexOf('width:540px;height:690px;') > -1, 'preview size kept');
      var vid = metaIframeHtml('<iframe src="https://www.facebook.com/plugins/video.php?href=x" width="560" height="315"></iframe>');
      ok(vid && vid.indexOf('aspect-ratio:560 / 315') > -1, 'video keeps aspect ratio');
    });
  });

  describe('فترة البيانات', function () {
    var today = todayKeyInTz('UTC');
    test('أمس', function () {
      period = { preset: 'yesterday' };
      var r = resolvePeriodFor('UTC');
      eq([r.since, r.until, r.isDefault], [shiftKey(today, -1), shiftKey(today, -1), false]);
    });
    test('آخر ٣٠ يوم', function () {
      period = { preset: 'last30' };
      var r = resolvePeriodFor('UTC');
      eq([keyDiffDays(r.since, r.until), r.until], [29, today]);
    });
    test('الشهر ده والشهر اللي فات', function () {
      period = { preset: 'thisMonth' };
      eq(resolvePeriodFor('UTC').since, today.slice(0, 8) + '01');
      period = { preset: 'lastMonth' };
      var r = resolvePeriodFor('UTC');
      eq(r.until, shiftKey(today.slice(0, 8) + '01', -1));
      eq(r.since.slice(8), '01');
    });
    test('فترة مخصصة مقلوبة بتتعدل', function () {
      period = { preset: 'custom', since: shiftKey(today, -3), until: shiftKey(today, -10) };
      var r = resolvePeriodFor('UTC');
      eq([r.since, r.until], [shiftKey(today, -10), shiftKey(today, -3)]);
    });
    test('فترة مخصصة في المستقبل بتقف عند النهارده', function () {
      period = { preset: 'custom', since: shiftKey(today, -2), until: shiftKey(today, 5) };
      eq(resolvePeriodFor('UTC').until, today);
    });
    test('أقصى فترة ٩٣ يوم', function () {
      period = { preset: 'custom', since: shiftKey(today, -300), until: today };
      var r = resolvePeriodFor('UTC');
      eq(keyDiffDays(r.since, r.until), 92);
    });
    test('فترة مخصصة ناقصة بترجع لآخر ٧ أيام', function () {
      period = { preset: 'custom' };
      var r = resolvePeriodFor('UTC');
      eq([r.preset, r.isDefault], ['last7', true]);
    });
  });

  describe('حالة الإعلان — TikTok', function () {
    function level(ad) { var d = tiktokDelivery(ad); return d.active ? 'active' : d.level; }
    test('متوقف يدوي', function () { eq(level({ operation_status: 'DISABLE' }), 'ad'); });
    test('شغّال', function () {
      eq(level({ operation_status: 'ENABLE' }), 'active');
      eq(level({ operation_status: 'ENABLE', secondary_status: 'AD_STATUS_DELIVERY_OK' }), 'active');
    });
    test('ميزانية اليوم خلصت = شغّال (مش حد صرف الحساب)', function () {
      eq(level({ operation_status: 'ENABLE', secondary_status: 'AD_STATUS_BUDGET_EXCEED' }), 'active');
    });
    test('رصيد الحساب خلص = مشكلة حساب', function () {
      eq(level({ operation_status: 'ENABLE', secondary_status: 'AD_STATUS_BALANCE_EXCEED' }), 'account');
    });
    test('SUSPEND مش "انتهت المدة"', function () {
      ok(level({ operation_status: 'ENABLE', secondary_status: 'ADVERTISER_ACCOUNT_SUSPEND' }) !== 'ended');
    });
    test('باقي الحالات', function () {
      eq(level({ operation_status: 'ENABLE', secondary_status: 'AD_STATUS_TIME_DONE' }), 'ended');
      eq(level({ operation_status: 'ENABLE', secondary_status: 'AD_STATUS_CAMPAIGN_DISABLE' }), 'campaign');
      eq(level({ operation_status: 'ENABLE', secondary_status: 'AD_STATUS_AUDIT_DENY' }), 'rejected');
      eq(level({ operation_status: 'ENABLE', secondary_status: 'AD_STATUS_AUDIT' }), 'pending');
      eq(level({ operation_status: 'ENABLE', secondary_status: 'AD_STATUS_NOT_START' }), 'scheduled');
    });
  });

  describe('حالة الإعلان — Snapchat', function () {
    var past = new Date(Date.now() - 86400000).toISOString(), future = new Date(Date.now() + 86400000).toISOString();
    function level(adObj, squad, camp) {
      var d = snapchatDelivery(adObj, { sq: Object.assign({ id: 'sq', status: 'ACTIVE', campaign_id: 'c' }, squad || {}) },
        { c: Object.assign({ id: 'c', status: 'ACTIVE' }, camp || {}) });
      return d.active ? 'active' : d.level;
    }
    var live = { status: 'ACTIVE', ad_squad_id: 'sq' };
    test('شغّال', function () { eq(level(live), 'active'); });
    test('الحملة متوقفة', function () { eq(level(live, null, { status: 'PAUSED' }), 'campaign'); });
    test('المجموعة متوقفة', function () { eq(level(live, { status: 'PAUSED' }), 'adset'); });
    test('مرفوض', function () { eq(level(Object.assign({ review_status: 'REJECTED' }, live)), 'rejected'); });
    test('المدة خلصت / لسه مبدأتش', function () {
      eq(level(live, { end_time: past }), 'ended');
      eq(level(live, null, { start_time: future }), 'scheduled');
    });
    test('الإعلان نفسه متوقف', function () { eq(level({ status: 'PAUSED', ad_squad_id: 'sq' }), 'ad'); });
  });

  describe('حالة الإعلان — Google Ads', function () {
    function level(row, a, g, c, appr) { var d = googleDelivery(row, a || 'ENABLED', g || 'ENABLED', c || 'ENABLED', appr || 'APPROVED'); return d.active ? 'active' : d.level; }
    test('مؤهل = شغّال', function () { eq(level({ adGroupAd: { primaryStatus: 'ELIGIBLE' } }), 'active'); });
    test('السبب بيحدد المستوى', function () {
      eq(level({ adGroupAd: { primaryStatus: 'PAUSED', primaryStatusReasons: ['AD_GROUP_PAUSED'] } }), 'adset');
      eq(level({ adGroupAd: { primaryStatus: 'NOT_ELIGIBLE', primaryStatusReasons: ['AD_DISAPPROVED'] } }), 'rejected');
    });
    test('من غير الحقول الجديدة بنرجع للحالة اليدوية', function () {
      eq(level({}, 'ENABLED', 'ENABLED', 'PAUSED'), 'campaign');
      eq(level({}, 'ENABLED', 'ENABLED', 'ENABLED', 'DISAPPROVED'), 'rejected');
      eq(level({}), 'active');
    });
  });

  describe('حالة الإعلان — Meta', function () {
    var past = new Date(Date.now() - 86400000).toISOString();
    function level(adObj, acct) { var d = metaDelivery(adObj, {}, acct); return d.active ? 'active' : d.level; }
    test('حالات Meta المباشرة', function () {
      eq(level({ effective_status: 'PAUSED' }), 'ad');
      eq(level({ effective_status: 'CAMPAIGN_PAUSED' }), 'campaign');
      eq(level({ effective_status: 'DISAPPROVED' }), 'rejected');
    });
    test('سبب من Meta على مستوى الإعلان', function () {
      var d = metaDelivery({ effective_status: 'ACTIVE', issues_info: [{ level: 'AD', error_summary: 'Payment issue' }] }, {}, null);
      eq([d.active, d.level, d.reason], [false, 'ad-issue', 'Payment issue']);
    });
    test('ميزانية المجموعة الإجمالية خلصت', function () {
      eq(level({ effective_status: 'ACTIVE', adset: { id: 's', lifetime_budget: '1000', budget_remaining: '0' } }), 'budget');
    });
    test('الحساب معطّل', function () { eq(level({ effective_status: 'ACTIVE' }, { accountStatus: 2 }), 'account'); });
    test('مدة الحملة خلصت', function () { eq(level({ effective_status: 'ACTIVE', campaign: { stop_time: past } }), 'ended'); });
    test('شغّال', function () { eq(level({ effective_status: 'ACTIVE' }), 'active'); });
  });

  describe('نتائج Meta', function () {
    var baseAd = function () {
      return { id: '1', name: 'A', effective_status: 'ACTIVE', created_time: '2026-01-01T00:00:00+0000',
        adset: { id: 's', name: 'Set S', optimization_goal: 'OFFSITE_CONVERSIONS' }, campaign: { id: 'c', name: 'Camp C' }, creative: {} };
    };
    test('النتيجة من هدف المجموعة (مشتريات) والعائد', function () {
      var rows = [
        { date_start: KEYS[5], spend: '50', actions: [{ action_type: 'omni_purchase', value: '2' }], action_values: [{ action_type: 'omni_purchase', value: '200' }] },
        { date_start: KEYS[6], spend: '50', actions: [{ action_type: 'omni_purchase', value: '1' }], action_values: [{ action_type: 'omni_purchase', value: '100' }] }
      ];
      var c = transformRealAd(baseAd(), rows, {}, DAYS, null, 'SAR', null, null);
      eq([c.resultKey, c.results, c.spend, c.roas], ['purchase', 3, 100, 3]);
      eq([c.campaignName, c.adsetName, c.placement], ['Camp C', 'Set S', 'Camp C']);
    });
    test('رقم Meta نفسه (results) له الأولوية — والأيام من غيره = صفر', function () {
      var rows = [
        { date_start: KEYS[5], spend: '50', results: [{ indicator: 'actions:offsite_conversion.fb_pixel_lead', values: [{ value: '4' }] }],
          actions: [{ action_type: 'omni_purchase', value: '9' }] },
        { date_start: KEYS[6], spend: '50', actions: [{ action_type: 'omni_purchase', value: '1' }] }
      ];
      var c = transformRealAd(baseAd(), rows, {}, DAYS, null, 'SAR', null, null);
      eq([c.resultKey, c.results, c.dailyResults[5], c.dailyResults[6]], ['lead', 4, 4, 0]);
    });
    test('شكل results غير متوقع = نرجع لطريقتنا من غير ما نقع', function () {
      var rows = [{ date_start: KEYS[6], spend: '10', results: [{ weird: true }], actions: [{ action_type: 'omni_purchase', value: '2' }] }];
      var c = transformRealAd(baseAd(), rows, {}, DAYS, null, 'SAR', null, null);
      eq([c.resultKey, c.results], ['purchase', 2]);
    });
    test('أنواع النتائج', function () {
      eq(resultKeyForType('offsite_conversion.fb_pixel_purchase'), 'purchase');
      eq(resultKeyForType('onsite_conversion.messaging_first_reply'), 'reply');
      eq(resultKeyForType('onsite_conversion.messaging_conversation_started_7d'), 'message');
      eq(resultKeyForType('offsite_conversion.fb_pixel_complete_registration'), 'registration');
      eq(resultKeyForType('omni_initiated_checkout'), 'checkout');
      eq(resultKeyForType('offsite_conversion.fb_pixel_add_to_cart'), 'cart');
      eq(resultKeyForType('reach'), 'reach');
      eq(resultKeyForType('something_else'), 'generic');
    });
    test('إعلان عليه ملاحظة بس صرف النهارده = شغّال', function () {
      var a = baseAd(); a.issues_info = [{ level: 'AD', error_summary: 'x' }];
      var rows = [{ date_start: KEYS[6], spend: '10', actions: [] }];
      eq(transformRealAd(a, rows, {}, DAYS, null, 'SAR', null, null).active, true);
    });
  });

  describe('صياغة الفصحى مع الأعداد', function () {
    function details(res, id) { return res.byAd[id].issues.map(function (i) { return i.detail; }).join(' | '); }
    test('أنواع النتائج: المنصوب مع ١١–٩٩، والمجرور بعد ٣–١٠', function () {
      eq(I18N.resultNoun(15, 'conversion'), 'تحويلاً'); eq(I18N.resultNoun(15, 'lead'), 'عميلاً محتملاً');
      eq(I18N.resultNoun(5, 'lead'), 'عملاء محتملين'); eq(I18N.resultNoun(1, 'lead'), 'عميل محتمل');
      eq(I18N.resultNoun(15, 'purchase'), 'عملية شراء', 'same spelling = no resA key');
      eq(I18N.resultAny('lead'), 'عملاء محتملين'); eq(t('res.lead'), 'عملاء محتملون', 'standalone label stays nominative');
      withLang('en', function () { eq(I18N.resultNoun(15, 'lead'), t('res.lead')); eq(I18N.resultAny('lead'), t('res.lead')); });
    });
    test('المرات والأيام: «٧ مرات» و«٤٫٥ مرة» و«منذ ١٠٠ يوم»', function () {
      eq(I18N.measureNoun(7, 'n.time'), 'مرات'); eq(I18N.measureNoun(4.5, 'n.time'), 'مرة'); eq(I18N.measureNoun(12, 'n.time'), 'مرة');
      withLang('en', function () { eq(I18N.measureNoun(4.5, 'n.time'), 'times'); eq(I18N.measureNoun(1, 'n.time'), 'time'); });
      eq(sinceLabel(100), 'منذ ١٠٠ يوم'); eq(sinceLabel(115), 'منذ ١١٥ يوماً'); eq(sinceLabel(103), 'منذ ١٠٣ أيام');
    });
    test('الفترة من غير تكرار الشهر ولا شرطتين', function () {
      eq(fmtRange('2026-09-13', '2026-09-19'), '١٣–١٩ سبتمبر');
      eq(fmtRange('2026-08-28', '2026-09-03'), '٢٨ أغسطس – ٣ سبتمبر');
      eq(fmtRange('2026-09-16', '2026-09-16'), '١٦ سبتمبر');
      withLang('en', function () { eq(fmtRange('2026-09-13', '2026-09-19'), '13–19 Sep'); });
    });
    test('نصوص التنبيهات: «لم يحقق أي…» بدل «٠ … فقط»، و«دون أي عملاء محتملين»، و«٧ مرات»', function () {
      var base = [ad('g1', { daily: steady(100), res: steady(5), key: 'lead' }), ad('g2', { daily: steady(100), res: steady(5), key: 'lead' })];
      var drop = details(engine(base.concat([ad('d1', { daily: steady(100), res: [5, 5, 5, 5, 5, 0, 4], key: 'lead' })])), 'd1');
      ok(drop.indexOf('لم يحقق') > -1 && drop.indexOf('أي عملاء محتملين') > -1 && drop.indexOf('٠') === -1, drop);
      var waste = details(engine(base.concat([ad('w1', { daily: steady(100), res: steady(0), key: 'lead' })])), 'w1');
      ok(waste.indexOf('دون أي عملاء محتملين') > -1 && waste.indexOf('نحو ٧ عملاء محتملين') > -1, waste);
      var fat = details(engine(base.concat([ad('f1', { daily: steady(100), res: steady(5), key: 'lead', freq: 7, age: 120 })])), 'f1');
      ok(fat.indexOf('نحو ٧ مرات') > -1 && fat.indexOf('منذ ١٢٠ يوماً') > -1, fat);
    });
  });

  describe('محرك التنبيهات', function () {
    function issuesOf(res, id) { return res.byAd[id].issues; }
    test('صرف بدون نتائج = عاجل', function () {
      var ads = baseAccount().concat([ad('waste', { daily: [100, 100, 100, 100, 100, 100, 20], res: [5, 5, 5, 5, 0, 0, 0] })]);
      var r = engine(ads);
      var i = issuesOf(r, 'waste')[0];
      eq([i.level, i.title, r.byAd.waste.health], ['critical', t('al.waste.t'), 'review']);
      ok(r.summary.atRisk.SAR > 0, 'counted in at-risk');
    });
    test('إعلان جديد في فترة التعلّم مبيتحكمش عليه', function () {
      var ads = baseAccount().concat([ad('new', { daily: [0, 0, 0, 0, 100, 100, 20], res: [0, 0, 0, 0, 0, 0, 0], age: 1 })]);
      var r = engine(ads);
      ok(!issuesOf(r, 'new').some(function (i) { return i.code === 'waste'; }));
    });
    test('خسارة (العائد أقل من ١) = عاجل', function () {
      var ads = baseAccount().concat([ad('loss', { daily: [100, 100, 100, 100, 100, 100, 20], res: steady(5), sales: [300, 300, 300, 300, 300, 50, 0] })]);
      var r = engine(ads);
      var i = issuesOf(r, 'loss').filter(function (x) { return x.code === 'loss'; })[0];
      ok(i && i.level === 'critical', 'loss alert');
    });
    test('الإعلان الصغير = "للعلم" بس', function () {
      var ads = baseAccount().concat([ad('tiny', { daily: [3, 3, 3, 3, 3, 0, 0], res: [0, 0, 0, 0, 0, 0, 0] })]);
      var r = engine(ads);
      var list = issuesOf(r, 'tiny');
      ok(list.length > 0, 'has a note');
      ok(list.every(function (i) { return i.level === 'info' && i.minor && !i.atRisk; }), 'all notes are FYI');
      eq(r.byAd.tiny.health, 'good');
    });
    test('الإعلان الصغير بيبقى مهم لو صرفه عدّى متوسط تكلفة النتيجة', function () {
      var ads = baseAccount().concat([ad('mid', { daily: [30, 30, 30, 30, 30, 0, 0], res: [0, 0, 0, 0, 0, 0, 0] })]);
      var r = engine(ads);
      ok(issuesOf(r, 'mid').some(function (i) { return i.level === 'warning'; }), 'real warning');
    });
    test('وقف فجأة بسبب الرفض = عاجل', function () {
      var ads = baseAccount().concat([ad('rej', { daily: [100, 100, 100, 100, 100, 100, 0], active: false, pausedLevel: 'rejected' })]);
      var r = engine(ads);
      eq([issuesOf(r, 'rej')[0].title, r.byAd.rej.health], [t('al.rejected.t'), 'review']);
    });
    test('إيقاف يدوي = مفيش تنبيه', function () {
      var ads = baseAccount().concat([ad('man', { daily: [100, 100, 100, 100, 100, 100, 0], active: false, pausedLevel: 'ad' })]);
      var r = engine(ads);
      eq([issuesOf(r, 'man').length, r.byAd.man.health], [0, 'inactive']);
    });
    test('ميزانية المجموعة خلصت = مهم مش عاجل', function () {
      var ads = baseAccount().concat([ad('bud', { daily: [100, 100, 100, 100, 100, 100, 0], active: false, pausedLevel: 'budget' })]);
      var r = engine(ads);
      eq([issuesOf(r, 'bud')[0].level, r.byAd.bud.health], ['warning', 'inactive']);
    });
    test('حجم المشكلة: إنفاق الإعلان في آخر ٧ أيام ونسبته من الحساب، في التنبيه وفي تفاصيل الإعلان', function () {
      // good1 وgood2 = ٧٠٠ لكل واحد، والإعلان ده = ٦٢٠ ← ٣١٪ من ٢٬٠٢٠
      var ads = baseAccount().concat([ad('waste', { daily: [100, 100, 100, 100, 100, 100, 20], res: [5, 5, 5, 5, 0, 0, 0] })]);
      var r = engine(ads);
      var a = r.alerts.filter(function (x) { return x.adId === 'waste'; })[0];
      eq([a.impact.spend, Math.round(a.impact.share * 100)], [620, 31]);
      eq(a.impactText, t('al.impact', { spend: money(620, 'SAR'), pct: t('al.impactPct', { pct: ar(31) }) }));
      eq(issuesOf(r, 'waste')[0].impactText, a.impactText, 'same line in the ad details');
      ok(/alert-impact/.test(alertMarkup(a)) && alertMarkup(a).indexOf(esc(a.impactText)) > -1, 'shown on the alert card');
    });
    test('حجم المشكلة: أقل من ١٪ بيتكتب كده، وتنبيه الحساب بيوضّح إنه بيشمل الحساب كله', function () {
      var ads = [ad('huge', { daily: steady(10000), res: steady(100) }), ad('tiny', { daily: steady(10), res: steady(0), freq: 9 }), ad('g2', { daily: steady(10000), res: steady(100) })];
      var r = engine(ads);
      var tiny = r.byAd.tiny.issues.filter(function (i) { return i.impactText; })[0];
      ok(tiny && tiny.impactText.indexOf(t('al.impactPctLow')) > -1, 'under 1%: ' + (tiny && tiny.impactText));
      var stopped = [ad('s1', { daily: [100, 100, 100, 100, 100, 0, 0], res: [2, 2, 2, 2, 2, 0, 0] }), ad('s2', { daily: [100, 100, 100, 100, 100, 0, 0], res: [2, 2, 2, 2, 2, 0, 0] })];
      var acct = engine(stopped).alerts.filter(function (x) { return !x.adId; })[0];
      ok(acct && acct.impactText === t('al.impactAccount', { spend: money(1000, 'SAR') }), 'whole account: ' + (acct && acct.impactText));
    });
    test('الترتيب جوه كل مستوى: الأكبر في الميزانية الأول، ومشاكل الحساب العاجلة فوق الكل', function () {
      var ads = baseAccount().concat([
        ad('w1', { daily: [50, 50, 50, 50, 50, 50, 10], res: [3, 3, 3, 3, 0, 0, 0] }),
        ad('w2', { daily: [300, 300, 300, 300, 300, 300, 60], res: [9, 9, 9, 9, 0, 0, 0] }),
        ad('f1', { daily: steady(80), res: steady(4), freq: 8 }),
        ad('f2', { daily: steady(400), res: steady(20), freq: 8 })
      ]);
      var alerts = engine(ads).alerts, rank = { critical: 3, warning: 2, info: 1, opportunity: 0 };
      for (var k = 1; k < alerts.length; k++) {
        var p = alerts[k - 1], q = alerts[k];
        if (p.level !== q.level) { ok(rank[p.level] >= rank[q.level], 'levels in order'); continue; }
        var pAcct = p.amount === Number.MAX_SAFE_INTEGER, qAcct = q.amount === Number.MAX_SAFE_INTEGER;
        ok(pAcct || !qAcct, 'urgent account problems first');
        if (pAcct === qAcct) ok(p.impact.spend >= q.impact.spend, p.adId + ' (' + p.impact.spend + ') before ' + q.adId + ' (' + q.impact.spend + ')');
      }
      var waste = alerts.filter(function (x) { return x.title === t('al.waste.t'); }).map(function (x) { return x.adId; });
      eq(waste, ['w2', 'w1'], 'bigger ad first');
    });
    test('مشكلة الحساب = تنبيه واحد للحساب مش لكل إعلان', function () {
      var ads = baseAccount().concat([
        ad('a1', { daily: [100, 100, 100, 100, 100, 100, 0], active: false, pausedLevel: 'account' }),
        ad('a2', { daily: [100, 100, 100, 100, 100, 100, 0], active: false, pausedLevel: 'account' })
      ]);
      var r = engine(ads);
      eq([issuesOf(r, 'a1').length, issuesOf(r, 'a2').length], [0, 0]);
      eq(r.alerts.filter(function (a) { return a.title === t('al.acctStopped.t'); }).length, 1);
    });
    test('الإعدادات الناقصة بتاخد قيمة النمط المختار', function () {
      eq(PauseProofAlerts.mergeSettings({ _preset: 'calm' }).minSpendShare, 0.05);
      eq(PauseProofAlerts.mergeSettings({ _preset: 'calm', minSpendShare: 0.1 }).minSpendShare, 0.1);
      eq(PauseProofAlerts.mergeSettings({}).minSpendShare, 0.02);
    });
    test('نصوص التنبيهات بالإنجليزي', function () {
      var ads = baseAccount().concat([ad('waste', { daily: [100, 100, 100, 100, 100, 100, 20], res: [5, 5, 5, 5, 0, 0, 0] })]);
      withLang('en', function () {
        var i = engine(ads).byAd.waste.issues[0];
        eq(i.title, 'Spend without results');
        ok(/SAR/.test(i.detail) && !/[؀-ۿ]/.test(i.detail), 'english detail');
      });
    });
  });

  describe('الواجهة', function () {
    test('حالة الكارت = حالة المنصة (من غير "مش بيصرف")', function () {
      eq(statusLabelOf(ad('x', { daily: steady(0) })), t('st.active'));
    });
    test('فلتر "متوقف" = الإعلانات المتوقفة كلها', function () {
      candidates = [ad('on'), ad('off', { active: false, pausedLevel: 'ad' })];
      runAnalysis();
      filters.health = 'stopped';
      eq(visibleCandidates().map(function (c) { return c.id; }), ['off']);
    });
    test('لون الحملة بالفلوس مش بالعدد', function () {
      candidates = [ad('A', { daily: steady(10) }), ad('B', { daily: steady(90) })];
      analysis = { byAd: { A: { health: 'review', issues: [], metricLevels: {} }, B: { health: 'good', issues: [], metricLevels: {} } }, alerts: [], summary: { health: {}, levels: {}, atRisk: {} } };
      eq(groupCampaigns(candidates)[0].status, 'good');
      candidates = [ad('A', { daily: steady(50) }), ad('B', { daily: steady(50) })];
      eq(groupCampaigns(candidates)[0].status, 'review');
    });
    test('فلتر حملة مش موجودة بيتشال لوحده', function () {
      candidates = [ad('x')];
      filters.campaign = 'nope|nope';
      render();
      eq(filters.campaign, null);
    });
    test('الكروت بتترسم على دفعات من ٦٠', function () {
      var list = [];
      for (var i = 0; i < 130; i++) list.push(ad('n' + i, { daily: steady(10), res: steady(1) }));
      candidates = list;
      render();
      eq(document.querySelectorAll('#cardGrid .candidate-card').length, 60);
      ok(document.querySelector('#cardGrid [data-show-more]'), 'show-more button');
      document.querySelector('#cardGrid [data-show-more]').click();
      eq(document.querySelectorAll('#cardGrid .candidate-card').length, 120);
      filters.sort = 'spend';
      render();
      eq(document.querySelectorAll('#cardGrid .candidate-card').length, 60, 'reset after sort change');
    });
    test('الكارت بيظهر بحركة أول مرة بس، وتغيير الترتيب من غير كروت جديدة بيومّض الشبكة', function () {
      var prevSort = filters.sort, tag = 'mv' + Date.now();
      candidates = [ad(tag + 'a', { daily: steady(10) }), ad(tag + 'b', { daily: steady(20) })];
      render();
      eq(document.querySelectorAll('#cardGrid .candidate-card.card-in').length, 2, 'new cards animate in');
      render(); // زي تغيير اللغة أو تحميل منصة تانية
      eq(document.querySelectorAll('#cardGrid .card-in').length, 0, 'a plain re-render does not replay it');
      filters.sort = prevSort === 'spend' ? 'launch' : 'spend';
      render();
      ok(cardGrid.classList.contains('grid-refresh'), 'changing the sort flashes the grid');
      filters.sort = prevSort;
      render();
    });
    test('صفحة الإعلانات مقسّمة بعناوين أقسام، وزرار «لأعلى» مترجم', function () {
      ok(document.querySelector('#secSummary[data-i18n="sec.summary"]') && document.querySelector('#secAds[data-i18n="sec.ads"]'), 'section headings');
      ok(document.getElementById('kpiStrip').closest('.app-sec-summary') && cardGrid.closest('.app-sec-ads'), 'numbers and cards sit in their own sections');
      var btn = document.getElementById('toTopBtn');
      ok(btn && btn.getAttribute('data-i18n-aria') === 'btn.toTop' && btn.tabIndex === -1, 'to-top button, out of the Tab order while hidden');
      ['sec.summary', 'sec.ads', 'btn.toTop'].forEach(function (k) { ok(t(k) && t(k) !== k, k + ' translated'); });
    });
    test('روابط فتح الإعلان في المنصة', function () {
      eq(platformLink({ platform: 'Meta', source: 'meta:act_123', nativeId: '456', id: '456' }).url,
        'https://adsmanager.facebook.com/adsmanager/manage/ads?act=123&selected_ad_ids=456');
      var g = platformLink({ platform: 'Google Ads', source: 'google:1234567890', campaignId: '7', adGroupId: '8', offer: 'x' });
      eq(g.url, 'https://ads.google.com/aw/ads?campaignId=7&adGroupId=8');
      ok(g.note.indexOf('123-456-7890') > -1, 'formatted account id');
    });
  });

  describe('حماية تسجيل الدخول', function () {
    test('رابط رجوع فيه state=...nostore بيترفض لما التخزين شغّال (ثغرة CSRF)', function () {
      eq(consumeOauthState('snapchat', 'snapchat.nostore'), false);
      eq(consumeOauthState('tiktok', 'tiktok.nostore'), false);
    });
    test('الـ state الصح بيتقبل مرة واحدة بس، ولنفس المنصة بس', function () {
      var s = newOauthState('snapchat');
      eq(consumeOauthState('google', s), false, 'other platform');
      eq(consumeOauthState('snapchat', s), true, 'first use');
      eq(consumeOauthState('snapchat', s), false, 'replay');
    });
    test('رابط رجوع TikTok بيتجاهل وهو مقفول', function () {
      var before = location.href;
      history.replaceState({}, '', location.pathname + '?code=x&state=tiktok.nostore');
      try {
        setStatus('before');
        checkTikTokRedirect();
        eq(location.search, '?code=x&state=tiktok.nostore', 'url untouched');
        eq(document.getElementById('connectStatus').textContent, 'before');
      } finally { history.replaceState({}, '', before); }
    });
    test('إصدار Meta هو v26 (v21 كان منتهي)', function () { eq(GRAPH_VERSION, 'v26.0'); });
  });

  describe('خانة النتائج', function () {
    test('كل نوع نتيجة لوحده، مترتبين بالصرف — من غير رقم مجمّع', function () {
      candidates = [
        ad('p1', { daily: steady(100), res: [3, 3, 3, 3, 3, 3, 2], key: 'purchase' }),
        ad('s1', { daily: steady(10), res: steady(130), key: 'swipe', source: 'snapchat:a1', platform: 'Snapchat' })
      ];
      render();
      var box = document.querySelectorAll('#kpiStrip .kpi')[1];
      var lines = box.querySelectorAll('.kpi-line');
      eq(lines.length, 2);
      eq(lines[0].textContent, ar(20) + ' ' + t('res1.purchase'), 'purchases first (more spend)');
      eq(lines[1].textContent, ar(910) + ' ' + t('res.swipe'));
      ok(box.textContent.indexOf(ar(930)) === -1, 'no combined total');
    });
    test('الأرقام الكبيرة بفاصل الآلاف', function () {
      candidates = [ad('s1', { daily: steady(10), res: steady(350), key: 'swipe', source: 'snapchat:a1', platform: 'Snapchat' })];
      render();
      eq(document.querySelectorAll('#kpiStrip .kpi-value')[1].textContent, '٢٬٤٥٠ ' + t('res1.swipe'));
    });
    test('نوع واحد بيظهر مع اسمه', function () {
      candidates = [ad('p1', { daily: steady(100), res: steady(1), key: 'purchase' })];
      render();
      eq(document.querySelectorAll('#kpiStrip .kpi-value')[1].textContent, ar(7) + ' ' + t('res.purchase'));
    });
  });

  describe('Google — حملات Performance Max', function () {
    var rows = [
      { campaign: { id: '11', name: 'PMax A', status: 'ENABLED', primaryStatus: 'ELIGIBLE' }, segments: { date: KEYS[5] }, metrics: { costMicros: '50000000', conversions: 2, conversionsValue: 300 } },
      { campaign: { id: '11', name: 'PMax A', status: 'ENABLED', primaryStatus: 'ELIGIBLE' }, segments: { date: KEYS[4] }, metrics: { costMicros: '30000000', conversions: 1.5, conversionsValue: 0 } },
      { campaign: { id: '12', name: 'PMax B', status: 'PAUSED', primaryStatus: 'PAUSED', primaryStatusReasons: ['CAMPAIGN_PAUSED'] }, segments: { date: KEYS[0] }, metrics: { costMicros: '10000000' } }
    ];
    test('كل حملة PMax بتبقى كارت واحد بأرقام الحملة', function () {
      var list = transformGooglePmax(rows, null, DAYS, 'EGP');
      eq(list.length, 2);
      var a = list[0];
      eq([a.id, a.campaignLevel, a.active, a.spend, a.results, a.resultKey, a.currency], ['gp-11', true, true, 80, 4, 'conversion', 'EGP']);
      eq([a.daily[4], a.daily[5], a.dailySales[5]], [30, 50, 300]);
      eq([list[1].active, list[1].pausedLevel], [false, 'campaign']);
    });
    test('حملة صرفت في الفترة المختارة بس بتظهر برضه', function () {
      var list = transformGooglePmax([], [{ campaign: { id: '13', name: 'Old', status: 'ENABLED', primaryStatus: 'ELIGIBLE' }, metrics: { costMicros: '120000000', conversions: 3, conversionsValue: 0 } }], DAYS, 'EGP');
      eq(list.length, 1);
      eq([list[0].spend, list[0].period.spend, list[0].period.results], [0, 120, 3]);
    });
    test('من غير primary_status بنرجع للحالة اليدوية', function () {
      eq(googleCampaignDelivery({ status: 'PAUSED' }).level, 'campaign');
      eq(googleCampaignDelivery({ status: 'ENABLED' }).active, true);
      eq(googleCampaignDelivery({ primaryStatus: 'LEARNING' }).active, true);
    });
    test('كارت PMax: شارة واضحة، ورابط الحملة، وعرض الحملات', function () {
      var p = transformGooglePmax(rows, null, DAYS, 'EGP')[0];
      p.source = 'google:1234567890';
      ok(previewMarkup(p).indexOf('Performance Max') > -1, 'badge');
      eq(platformLink(p).url, 'https://ads.google.com/aw/overview?campaignId=11');
      candidates = [p];
      runAnalysis();
      ok(campaignMarkup(groupCampaigns(candidates)[0]).indexOf(t('camp.pmax')) > -1, 'campaign card says PMax, not "1 ad"');
    });
    test('حملة PMax واخدة أغلب الصرف مش بتطلّع تنبيه «الميزانية متركزة في إعلان»', function () {
      var p = transformGooglePmax([{ campaign: { id: '14', name: 'Big', status: 'ENABLED', primaryStatus: 'ELIGIBLE' }, segments: { date: KEYS[5] }, metrics: { costMicros: '900000000', conversions: 0 } }], null, DAYS, 'EGP')[0];
      p.source = 'google:1';
      var other = ad('g1', { daily: steady(5), res: steady(1), source: 'google:1', platform: 'Google Ads', key: 'conversion' });
      var r = engine([p, other]);
      ok(!r.alerts.some(function (al) { return al.adId === p.id && al.title === t('al.conc.t'); }), 'no concentration alert');
    });
    testAsync('حساب فيه PMax بس (من غير إعلانات) بيتعرض عادي', function () {
      var realFetch = window.fetch;
      window.fetch = fakeFetch({ ads: [], metrics: [], periodMetrics: null, pmax: rows, pmaxPeriod: null, pmaxError: null, range: { since: KEYS[0], until: KEYS[6] } });
      accountInfo['google:999'] = { currency: 'EGP' };
      sessionTokens.google = { token: 'tok', expiresAt: Date.now() + 3600000 };
      googleAccessToken = 'tok';
      loadGoogleAdsForAccount('999');
      return tick().then(tick).then(function () {
        window.fetch = realFetch;
        var pm = candidates.filter(function (c) { return c.campaignLevel; });
        eq(pm.length, 2);
        eq(pm[0].source, 'google:999');
      }, function (e) { window.fetch = realFetch; throw e; });
    });
    testAsync('صرف إعلانات Google المحذوفة مبيضيعش (السيرفر بيدوّر عليها برقمها)', function () {
      return import('/api/_google.js').then(function (g) {
        var ads = [{ adGroup: { id: '1' }, adGroupAd: { ad: { id: '10' } } }];
        var metrics = [
          { adGroup: { id: '1' }, adGroupAd: { ad: { id: '10' } }, metrics: { costMicros: '5000000' } },
          { adGroup: { id: '2' }, adGroupAd: { ad: { id: '20' } }, metrics: { costMicros: '7000000' } },
          { adGroup: { id: '3' }, adGroupAd: { ad: { id: '30' } }, metrics: { costMicros: '0' } }
        ];
        var periodRows = [{ adGroup: { id: '4' }, adGroupAd: { ad: { id: '40' } }, metrics: { costMicros: '1' } }];
        eq(g.missingSpendKeys(ads, [metrics, periodRows, null]), { keys: ['2-20', '4-40'], adIds: ['20', '40'] });
      });
    });
  });

  describe('الحسابات والجلسات', function () {
    test('تبديل الحساب بيشيل إعلانات الحساب القديم فوراً (ونفس الحساب بيفضل)', function () {
      candidates = [ad('a', { source: 'meta:act_1' }), ad('g', { source: 'google:1', platform: 'Google Ads' })];
      activeSources.meta = 'act_1'; activeSources.google = '1';
      selectSource('google', '1');
      eq(candidates.length, 2, 'same account kept');
      selectSource('meta', 'act_2');
      eq(candidates.map(function (c) { return c.id; }), ['g']);
      eq([activeSources.meta, lastAccounts.meta], ['act_2', 'act_2']);
    });
    test('الحساب اللي يتفتح: المحفوظ ← أول حساب شغّال ← الأول', function () {
      var list = [{ id: 'act_1', account_status: 2 }, { id: 'act_2', account_status: 1 }, { id: 'act_3', account_status: 1 }];
      var isActive = function (a) { return Number(a.account_status) === 1; };
      eq(pickAccount('meta', list, isActive), 'act_2');
      rememberAccount('meta', 'act_3');
      eq(pickAccount('meta', list, isActive), 'act_3');
      rememberAccount('meta', 'gone');
      eq(pickAccount('meta', list, isActive), 'act_2', 'remembered account no longer exists');
      eq(pickAccount('google', [{ id: 'x' }, { id: 'y' }]), 'x');
    });
    test('Meta بتفتح أول حساب شغّال — مش أول حساب في القايمة', function () {
      var hadFB = 'FB' in window, prevFB = window.FB, realLoad = loadAdsForAccount, picked = null;
      window.FB = { api: function (path, params, cb) { cb({ data: [{ id: 'act_1', name: 'Old', account_status: 2 }, { id: 'act_2', name: 'Live', account_status: 1 }] }); } };
      loadAdsForAccount = function (id) { picked = id; };
      try { loadAdAccounts(); } finally { loadAdsForAccount = realLoad; if (hadFB) window.FB = prevFB; else delete window.FB; }
      eq([picked, accountSelect.value], ['act_2', 'act_2']);
    });
    test('خطأ Meta 190 = الجلسة انتهت (مش عطل)', function () {
      ok(isMetaAuthError({ code: 190 }) && isMetaAuthError({ code: '102' }), 'auth codes');
      ok(!isMetaAuthError({ code: 17 }) && !isMetaAuthError(null), 'other errors');
    });
    test('Google: لو الجلسة خلصت قبل الطلب، مفيش طلب بيتبعت وبيظهر «انتهت الجلسة»', function () {
      var calls = 0, realFetch = window.fetch;
      window.fetch = function () { calls++; return new Promise(function () {}); };
      sessionTokens.google = { token: 'old', expiresAt: Date.now() - 1000 };
      try { loadGoogleAdsForAccount('777'); } finally { window.fetch = realFetch; }
      eq(calls, 0);
      eq(platformState.google.kind, 'expired');
      eq(document.getElementById('statusReconnect').getAttribute('data-reconnect'), 'google');
    });
    testAsync('Google: الجلسة انتهت أثناء التحميل = كارت «انتهت الجلسة» + «ربط تاني» (مش خطأ تقني)', function () {
      var realFetch = window.fetch;
      window.fetch = fakeFetch({ error: 'expired', code: 'AUTH' }, 401);
      sessionTokens.google = { token: 'tok', expiresAt: Date.now() + 3600000 };
      googleAccessToken = 'tok';
      accountInfo['google:555'] = {};
      loadGoogleAdsForAccount('555');
      return tick().then(tick).then(function () {
        window.fetch = realFetch;
        eq(platformState.google && platformState.google.kind, 'expired');
        eq(document.getElementById('connectStatus').textContent, t('s.platformExpired', { platform: 'Google Ads' }));
        ok(!document.getElementById('statusReconnect').hidden, 'reconnect button in the status line');
        ok(document.querySelector('#loadStates .ls-expired [data-ls-action="reconnect"]'), 'expired card with reconnect');
        ok(document.getElementById('emptyHero').classList.contains('hidden'), 'no "connect your account" screen');
        eq(googleAccessToken, null);
      }, function (e) { window.fetch = realFetch; throw e; });
    });
    testAsync('Snapchat: خطأ في قايمة الحسابات بيظهر كخطأ مش «مفيش حسابات»', function () {
      var realFetch = window.fetch;
      window.fetch = fakeFetch({ error: 'Internal error' }, 500);
      loadSnapchatAccounts();
      return tick().then(tick).then(function () {
        window.fetch = realFetch;
        eq(platformState.snapchat.kind, 'error');
        ok(document.getElementById('connectStatus').textContent.indexOf('Internal error') > -1, 'real reason shown');
        ok(document.querySelector('#loadStates .ls-error [data-ls-action="retry"]'), 'retry button');
      }, function (e) { window.fetch = realFetch; throw e; });
    });
    testAsync('رد مش JSON من السيرفر (زي صفحة خطأ Vercel) بيطلع رسالة مفهومة', function () {
      var realFetch = window.fetch;
      window.fetch = function () { return Promise.resolve({ ok: false, status: 504, text: function () { return Promise.resolve('<html>Gateway Timeout</html>'); } }); };
      return apiPost('/api/x', {}).then(function (res) {
        window.fetch = realFetch;
        eq(res.status, 504);
        eq(res.data.error, t('s.serverError', { code: ar(504) }));
      }, function (e) { window.fetch = realFetch; throw e; });
    });
    testAsync('Meta: خطأ غير متوقع بيوقف مؤشر التحميل ويظهر السبب', function () {
      var hadFB = 'FB' in window, prevFB = window.FB;
      var restore = function () { if (hadFB) window.FB = prevFB; else delete window.FB; };
      window.FB = { api: function () { throw new Error('boom'); } };
      accountInfo['meta:act_5'] = {};
      loadAdsForAccount('act_5');
      return tick().then(tick).then(function () {
        restore();
        eq(loadingPlatforms.meta, false);
        eq(platformState.meta.kind, 'error');
        ok(document.getElementById('connectStatus').textContent.indexOf('boom') > -1, 'reason shown');
      }, function (e) { restore(); throw e; });
    });
    test('حساب فاضي: كارت «الحساب ده مفيهوش إعلانات» بدل شاشة «اربط حسابك»', function () {
      activeSources.meta = 'act_9';
      setPlatformState('meta', { kind: 'empty' });
      render();
      ok(document.getElementById('emptyHero').classList.contains('hidden'), 'hero hidden');
      ok(document.querySelector('#loadStates .ls-empty'), 'empty card');
    });
    test('كروت الحالة مترتبة بالأهمية: الجلسة المنتهية قبل الحساب الفاضي', function () {
      activeSources.meta = 'act_1'; setPlatformState('meta', { kind: 'empty' });
      activeSources.google = '1'; setPlatformState('google', { kind: 'expired' });
      activeSources.snapchat = 's'; setPlatformState('snapchat', { kind: 'error', msg: 'x' });
      render();
      var kinds = Array.prototype.map.call(document.querySelectorAll('#loadStates .load-state'), function (el) { return el.className.replace('load-state ', ''); });
      eq(kinds, ['ls-expired', 'ls-error', 'ls-empty']);
    });
    test('من غير أي منصة متصلة: شاشة البداية ومفيش كروت حالة', function () {
      render();
      ok(!document.getElementById('emptyHero').classList.contains('hidden'), 'hero shown');
      eq(document.getElementById('loadStates').children.length, 0);
      eq(loginMenuBtn.textContent, t('btn.login'));
    });
    test('فصل منصة بيمسح بياناتها بس، و«فصل الكل» بيرجّع شاشة البداية', function () {
      setPlatformOptions('meta', [{ value: 'act_1', label: 'Meta — A' }]);
      setPlatformOptions('google', [{ value: '1', label: 'Google Ads — B (1)' }]);
      activeSources.meta = 'act_1'; activeSources.google = '1';
      rememberAccount('meta', 'act_1'); rememberAccount('google', '1');
      sessionTokens.google = { token: 't', expiresAt: null }; googleAccessToken = 't';
      candidates = [ad('m', { source: 'meta:act_1' }), ad('g', { source: 'google:1', platform: 'Google Ads' })];
      render();
      eq(loginMenuBtn.textContent, t('btn.accounts'));
      var row = document.querySelector('.platform-row[data-platform="meta"]');
      ok(!row.querySelector('[data-disconnect]').hidden, 'disconnect visible');
      eq(row.querySelector('[data-platform-status]').textContent, t('pf.connectedTo', { account: 'A' }));
      row.querySelector('[data-disconnect]').click();
      eq(candidates.map(function (c) { return c.id; }), ['g']);
      ok(!('meta' in activeSources) && !lastAccounts.meta, 'meta forgotten');
      eq(lastAccounts.google, '1', 'google kept');
      ok(row.querySelector('[data-disconnect]').hidden, 'meta now disconnected');
      document.getElementById('disconnectAll').click();
      eq(candidates.length, 0);
      eq(googleAccessToken, null);
      ok(!document.getElementById('emptyHero').classList.contains('hidden'), 'back to the start screen');
      eq(loginMenuBtn.textContent, t('btn.login'));
    });
    test('بعد reload: جلسة منتهية بتظهر «انتهت» مع «ربط تاني»', function () {
      restoreSession({ tokens: { snapchat: { token: 'x', expiresAt: Date.now() - 1 } }, options: {}, active: { snapchat: 's1' }, accountInfo: {} }, {});
      eq(platformState.snapchat && platformState.snapchat.kind, 'expired');
      eq(document.getElementById('statusReconnect').getAttribute('data-reconnect'), 'snapchat');
    });
    test('راجعين من Snapchat بكود جديد: الجلسة القديمة المنتهية مش بتتحسب «انتهت»', function () {
      restoreSession({ tokens: { snapchat: { token: 'x', expiresAt: Date.now() - 1 } }, options: {}, active: {}, accountInfo: {} }, { snapchat: true });
      ok(!platformState.snapchat, 'no expired state');
    });
  });

  describe('تحسينات الواجهة', function () {
    test('«معرّض للهدر: ٠» بعملة الحساب المعروض', function () {
      candidates = [ad('e1', { daily: steady(10), res: steady(1) })];
      candidates[0].currency = 'EGP';
      render();
      eq(document.querySelectorAll('#kpiStrip .kpi-value')[2].textContent, '٠ ج.م');
    });
    test('جدول الأيام: فاصل الآلاف، والصرف الصغير مش بيبان صفر', function () {
      var c = ad('t1', { daily: [0.4, 12500, 0, 0, 0, 0, 0] });
      c.currency = null;
      candidates = [c];
      render();
      openExpand(c);
      var cells = Array.prototype.map.call(document.querySelectorAll('#expandChart tbody tr:first-child td'), function (td) { return td.textContent; });
      eq(cells.slice(0, 3), [t('x.spend'), '٠٫٤', '١٢٬٥٠٠'], 'no empty "()" when the currency is unknown');
      expandOverlay.classList.add('hidden');
    });
    test('نص الخطأ اللي في الرابط مبيظهرش — رسالة من عندنا بس', function () {
      var denied = oauthErrorFromUrl(new URLSearchParams('error=access_denied&error_description=Call+0100+now'));
      eq(denied(), t('err.oauthDenied'));
      var junk = oauthErrorFromUrl(new URLSearchParams('error=call_us_on_0100&error_description=x'));
      eq(junk(), t('err.oauthOther', { code: 'unknown' }));
      ok(oauthErrorFromUrl(new URLSearchParams('error=invalid_scope'))().indexOf('invalid_scope') > -1, 'known codes kept');
      eq(oauthErrorFromUrl(new URLSearchParams('code=1')), null);
    });
    test('أسباب الأخطاء بلغة الواجهة (مش رسالة السيرفر العربي أو المنصة الخام)', function () {
      eq(apiErrorText({ status: 429, data: { error: 'Too Many Requests' } })(), t('err.rateLimit'));
      eq(apiErrorText({ status: 403, data: { error: 'x', code: 'WRONG_APP' } })(), t('err.wrongApp'));
      eq(apiErrorText({ status: 500, data: { error: 'Boom from platform' } })(), 'Boom from platform');
      withLang('en', function () {
        eq(apiErrorText({ status: 400, data: { error: 'رسالة عربي', code: 'BAD_REQUEST' } })(), t('err.badRequest'));
      });
      eq(metaErrorText({ code: 17, message: 'User request limit reached' })(), t('err.rateLimit'));
      eq(metaErrorText({ code: 200, message: 'Permissions error' })(), t('err.permission'));
      eq(metaErrorText({ code: 1, message: 'Unknown' })(), 'Unknown');
    });
    test('آخر تحديث: اليوم لو مش النهارده، و«حدّث» لو الأرقام قديمة', function () {
      candidates = [ad('u1')];
      lastUpdatedAt = Date.now();
      render();
      var upd = document.getElementById('lastUpdated');
      ok(!upd.classList.contains('stale') && !upd.querySelector('[data-stale-refresh]'), 'fresh');
      lastUpdatedAt = Date.now() - 26 * 3600 * 1000;
      render();
      ok(upd.classList.contains('stale') && upd.querySelector('[data-stale-refresh]'), 'stale with refresh button');
      var d = new Date(lastUpdatedAt);
      ok(upd.textContent.indexOf(fmtKey(localDateKey(d))) > -1, 'shows the day: ' + upd.textContent);
    });
    test('إعدادات التنبيهات: قيمة برّه الحدود أو حدود متلخبطة مبتتحفظش', function () {
      renderSettingsForm();
      var inp = function (k) { return settingsForm.querySelector('[name="' + k + '"]'); };
      inp('cprWarnMultiple').value = '3';
      inp('cprCriticalMultiple').value = '2';
      inp('minSpendShare').value = '90';
      document.getElementById('settingsSave').click();
      eq(JSON.stringify(alertSettings), '{}', 'nothing saved');
      eq(settingsForm.querySelectorAll('.setting-row.invalid').length, 2);
      eq(document.getElementById('settingsError').textContent, t('set.err.fix'));
      inp('cprWarnMultiple').value = '1.5';
      inp('minSpendShare').value = '3';
      document.getElementById('settingsSave').click();
      eq([alertSettings.cprCriticalMultiple, alertSettings.minSpendShare], [2, 0.03]);
      eq(document.getElementById('settingsError').textContent, '');
    });
    test('قيمة غلط محفوظة من قبل كده مبتتقبلش', function () {
      eq(PauseProofAlerts.mergeSettings({ cprWarnMultiple: 0.2 }).cprWarnMultiple, 1.5);
      eq(PauseProofAlerts.mergeSettings({ cprWarnMultiple: 1.8 }).cprWarnMultiple, 1.8);
    });
    test('الوضع الداكن بيتحفظ وبيتطبّق على الصفحة', function () {
      var root = document.documentElement, prev = root.getAttribute('data-theme');
      try {
        ACC_THEME.set('light');
        themeToggle.click();
        eq([root.getAttribute('data-theme'), ACC_THEME.isDark(), localStorage.getItem('acc.theme')], ['dark', true, 'dark']);
        eq(themeToggle.textContent, '🌙');
        themeToggle.click();
        eq([root.getAttribute('data-theme'), themeToggle.textContent], ['light', '☀️']);
      } finally { if (prev) root.setAttribute('data-theme', prev); else root.removeAttribute('data-theme'); }
    });
    test('زرار الوضع الداكن في صفحات الموقع (data-theme-toggle) — ومن تاب تاني بيتطبّق هنا', function () {
      var root = document.documentElement, prev = root.getAttribute('data-theme');
      var b = document.createElement('button');
      b.setAttribute('data-theme-toggle', ''); b.innerHTML = '<span data-theme-icon></span>';
      document.body.appendChild(b);
      try {
        ACC_THEME.set('light');
        b.click();
        eq([root.getAttribute('data-theme'), b.getAttribute('aria-pressed'), b.querySelector('[data-theme-icon]').textContent], ['dark', 'true', '🌙']);
        b.click();
        eq([root.getAttribute('data-theme'), b.getAttribute('aria-pressed'), b.querySelector('[data-theme-icon]').textContent], ['light', 'false', '☀️']);
        // العميل غيّر الوضع من تاب تاني: الصفحة وأيقونة الأداة بيتبعوه
        window.dispatchEvent(new StorageEvent('storage', { key: 'acc.theme', newValue: 'dark' }));
        eq([root.getAttribute('data-theme'), themeToggle.textContent, b.getAttribute('aria-pressed')], ['dark', '🌙', 'true']);
      } finally {
        b.remove();
        if (prev) ACC_THEME.set(prev); else { root.removeAttribute('data-theme'); try { localStorage.removeItem('acc.theme'); } catch (e) {} }
        window.dispatchEvent(new StorageEvent('storage', { key: 'acc.theme', newValue: prev }));
      }
    });
    test('اسم الأداة فوق رابط للصفحة الرئيسية', function () {
      var brand = document.querySelector('.appbar a.brand');
      ok(brand && brand.getAttribute('href') === '/', 'brand links to the landing page (/)');
      eq(brand.getAttribute('title'), t('brand.home'));
    });
    testAsync('النوافذ: التركيز بيدخل جوه النافذة وبيرجع للزرار اللي فتحها', function () {
      loginMenuBtn.focus();
      loginMenuBtn.click();
      return tick().then(function () {
        eq(document.activeElement && document.activeElement.id, 'platformClose');
        document.getElementById('platformClose').click();
        return tick();
      }).then(function () {
        eq(document.activeElement && document.activeElement.id, 'loginMenuBtn');
      });
    });
    testAsync('سياسة الأمان: script-src من غير unsafe-inline/eval، وصفحة الفحص مطابقة للموقع', function () {
      return Promise.all([import('/cloudflare/worker.js'), fetch('/tests/csp-check.html').then(function (r) { return r.text(); })]).then(function (r) {
        var live = r[0].SECURITY_HEADERS['Content-Security-Policy'];
        var check = new DOMParser().parseFromString(r[1], 'text/html').querySelector('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
        var scriptSrc = /script-src ([^;]+)/.exec(live)[1];
        ok(scriptSrc.indexOf('unsafe-inline') === -1 && scriptSrc.indexOf('unsafe-eval') === -1, 'strict script-src: ' + scriptSrc);
        // frame-ancestors مينفعش في <meta> — غير كده لازم تبقى نفس السياسة بالظبط
        eq(check, live.replace(" frame-ancestors 'self';", ''));
      });
    });
    testAsync('Snapchat: الطلبات بتبدأ بالتوازي من غير ما تستنى طلب الحساب', function () {
      var realFetch = window.fetch, order = [];
      var json = function (obj, delay) {
        return new Promise(function (r) { setTimeout(function () { r({ ok: true, status: 200, json: function () { return Promise.resolve(obj); } }); }, delay || 0); });
      };
      window.fetch = function (url) {
        var u = String(url);
        if (/\/adaccounts\/[^/?]+$/.test(u)) { order.push('account'); return json({ adaccounts: [{ adaccount: { timezone: 'Africa/Cairo', currency: 'EGP' } }] }, 40).then(function (r) { order.push('account-done'); return r; }); }
        if (/\/ads\?/.test(u)) { order.push('ads'); return json({ ads: [{ ad: { id: 'a1' } }] }); }
        if (/\/adsquads/.test(u)) { order.push('squads'); return json({ adsquads: [] }); }
        if (/\/campaigns/.test(u)) { order.push('campaigns'); return json({ campaigns: [] }); }
        if (/\/stats/.test(u)) { order.push('stats'); return json({ timeseries_stats: [] }); }
        return json({});
      };
      var out = null, code = null;
      var res = { setHeader: function () {}, status: function (c) { code = c; return this; }, json: function (b) { out = b; return this; }, end: function () {} };
      return import('/api/snapchat-ads-fetch.js').then(function (m) {
        return m.default({ method: 'POST', headers: {}, body: { accessToken: 't', action: 'ads', adAccountId: 'acc1', period: { preset: 'last7' } } }, res);
      }).then(function () {
        window.fetch = realFetch;
        eq(code, 200);
        eq([out.ads.length, out.account.currency], [1, 'EGP']);
        ok(order.indexOf('ads') < order.indexOf('account-done'), 'ads started before the account answered: ' + order.join(','));
        ok(order.indexOf('stats') > order.indexOf('account-done'), 'stats wait for the account time zone');
      }, function (e) { window.fetch = realFetch; throw e; });
    });
  });

  describe('الأسعار', function () {
    var P = function () { return window.ACC_PRICING; };
    test('السنوي = ١٢ × سعر الشهر، ونسبة التوفير صح', function () {
      var p = P();
      eq([p.monthly, p.yearlyPerMonth, p.trialDays, p.guaranteeDays], [9.99, 6.99, 14, 14]);
      eq(p.yearlyTotal(), 83.88);
      eq(p.savingPct(), 30);
    });
    test('العملة المحلية: رقم صحيح بيخلص بـ .٩٩', function () {
      var p = P();
      eq([p.localPrice(6.99, 'EGP'), p.localPrice(9.99, 'EGP')], [349.99, 499.99]);
      eq([p.localPrice(6.99, 'SAR'), p.localPrice(9.99, 'SAR')], [26.99, 37.99]);
      eq(p.localPrice(9.99, 'AED'), 36.99);
      eq(p.localPrice(6.99, 'USD'), 6.99);
    });
    test('العملات الغالية (دينار كويتي...) بتظهر بالدولار', function () {
      eq(P().localPrice(6.99, 'KWD'), 6.99);
      eq(P().currencyForTimezone('Asia/Kuwait'), 'USD');
    });
    test('العملة المبدئية من المنطقة الزمنية', function () {
      eq(['Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai', 'Europe/London'].map(P().currencyForTimezone), ['EGP', 'SAR', 'AED', 'USD']);
    });
    test('المجموع السنوي والتوفير بالعملة المحلية', function () {
      var x = P().prices('EGP');
      eq([x.yearlyTotal, x.savingPct], [4199.88, 30]);
    });
    test('الخصم بيتحسب بالظبط من غير تقريب لـ .٩٩', function () {
      var x = P().prices('EGP', 20);
      eq([x.monthlyAfter, x.yearlyPerMonthAfter, x.yearlyTotalAfter], [399.99, 279.99, 3359.88]);
    });
  });

  describe('مخفي مؤقتاً', function () {
    test('روابط صفحة الأسعار مخفية في الأداة', function () {
      var links = document.querySelectorAll('#appUnderTest a[href="/pricing"]');
      ok(links.length >= 2, 'links still exist (for easy restore)');
      ok(Array.prototype.every.call(links, function (a) { return a.closest('[hidden]'); }), 'all pricing links hidden');
    });
    test('TikTok «قريباً» ومقفول في نافذة تسجيل الدخول', function () {
      var btn = document.getElementById('platformTikTok');
      ok(btn.disabled && btn.classList.contains('soon'), 'disabled + soon');
      eq(btn.querySelector('.platform-item-sub').textContent, t('pf.tiktok'));
      eq(t('pf.tiktok'), 'قريباً');
      ok(document.querySelector('#appUnderTest .chip[data-value="TikTok"]').hasAttribute('hidden'), 'TikTok filter chip hidden');
    });
    test('تسجيل دخول TikTok مبيبدأش حتى لو اتنادى', function () {
      eq(TIKTOK_ENABLED, false);
      var before = location.href;
      loginWithTikTok();
      eq(location.href, before);
      eq(document.getElementById('connectStatus').textContent, t('s.tiktokSoon'));
    });
  });

  describe('التجربة المغلقة', function () {
    test('شاشة البداية فيها ملاحظة التجربة وطلب الانضمام ورابط الخطوات', function () {
      var hero = document.getElementById('emptyHero');
      ok(hero.querySelector('[data-i18n="hero.pilot"]'), 'pilot note');
      var join = hero.querySelector('a[data-join]');
      ok(join, 'join link');
      ok(join.getAttribute('href').indexOf('mailto:' + ACC_JOIN.email + '?subject=') === 0, 'full mailto: ' + join.getAttribute('href').slice(0, 60));
      ok(hero.querySelector('a[href="/help"]'), 'help link');
    });
    test('نافذة المنصات فيها ملاحظة التجربة وروابط الانضمام والخطوات', function () {
      var note = document.querySelector('#platformOverlay .pf-pilot');
      ok(note, 'note exists');
      ok(note.querySelector('a[data-join]') && note.querySelector('a[href="/help"]'), 'join + help links');
      eq(document.querySelector('#platformMeta .platform-item-sub').textContent, t('pf.meta'));
    });
    test('رسالة الانضمام فيها البيانات المطلوبة وموافقة المختبِر باللغتين', function () {
      ['ar', 'en'].forEach(function (l) {
        var href = ACC_JOIN.href(l);
        ok(href.indexOf('mailto:support@adscenter.online?subject=') === 0, l + ': mailto');
        var body = decodeURIComponent(href.split('&body=')[1]);
        ok(/فيسبوك|Facebook/.test(body), l + ': asks for the Facebook profile');
        ok(/Google Ads/.test(body), l + ': asks for the Google Ads email');
        ok(body.indexOf(location.origin + '/terms#pilot' + (l === 'en' ? '-en' : '')) > -1, l + ': links the pilot terms');
        ok(ACC_JOIN.text(l).indexOf(ACC_JOIN.email) > -1, l + ': copied text has the address');
      });
    });
    testAsync('رابط الانضمام بيتحدّث لما اللغة تتغيّر', function () {
      var a = document.querySelector('#emptyHero a[data-join]');
      I18N.setLang('en');
      return tick().then(function () {
        ok(decodeURIComponent(a.getAttribute('href')).indexOf(ACC_JOIN.subject.en) > -1, 'english subject');
        I18N.setLang('ar');
        return tick();
      }).then(function () {
        ok(decodeURIComponent(a.getAttribute('href')).indexOf(ACC_JOIN.subject.ar) > -1, 'arabic subject');
      });
    });
    test('إلغاء دخول Meta بيوضّح السبب ويظهر رابط خطوات Meta', function () {
      var hadFB = 'FB' in window, prevFB = window.FB;
      window.FB = { login: function (cb) { cb({ status: 'unknown', authResponse: null }); } };
      try { loginWithMeta(); } finally { if (hadFB) window.FB = prevFB; else delete window.FB; }
      eq(document.getElementById('connectStatus').textContent, t('s.metaCancelled'));
      ok(!document.getElementById('statusHelp').hidden, 'help links shown');
      eq(document.getElementById('statusHelpLink').getAttribute('href'), '/help#meta');
      setStatus(msg('s.notConnected'));
      ok(document.getElementById('statusHelp').hidden, 'hidden again with a normal message');
    });
    test('Google: النافذة اتقفلت، أو اتمنعت، أو الصلاحية مش متعلّم عليها', function () {
      var cfg = null;
      var hadGoogle = 'google' in window, prevGoogle = window.google;
      window.google = { accounts: { oauth2: {
        initTokenClient: function (c) { cfg = c; return { requestAccessToken: function () {} }; },
        hasGrantedAllScopes: function () { return false; }
      } } };
      googleTokenClient = null;
      googleAccessToken = null;
      try {
        loginWithGoogle();
        ok(cfg && typeof cfg.error_callback === 'function', 'error_callback registered');
        eq(cfg.scope, 'https://www.googleapis.com/auth/adwords');
        cfg.error_callback({ type: 'popup_closed' });
        eq(document.getElementById('connectStatus').textContent, t('s.googleCancelled'));
        ok(!document.getElementById('statusHelp').hidden, 'help shown after closing');
        eq(document.getElementById('statusHelpLink').getAttribute('href'), '/help#google');
        cfg.error_callback({ type: 'popup_failed_to_open' });
        eq(document.getElementById('connectStatus').textContent, t('s.popupBlocked', { platform: 'Google' }));
        ok(document.getElementById('statusHelp').hidden, 'no join link for a blocked pop-up');
        cfg.callback({ access_token: 'tok', scope: '' });
        eq(document.getElementById('connectStatus').textContent, t('s.googleScopeMissing'));
        eq(googleAccessToken, null, 'a token without the scope is not kept');
        cfg.callback({ error: 'access_denied' });
        eq(document.getElementById('connectStatus').textContent, t('s.googleLoginFailed'));
      } finally {
        googleTokenClient = null;
        googleAccessToken = null;
        if (hadGoogle) window.google = prevGoogle; else delete window.google;
      }
    });
  });

  describe('الصفحات والروابط', function () {
    var PAGES = ['/pauseproof-live.html', '/home.html', '/help.html', '/404.html', '/privacy.html', '/terms.html', '/data-deletion.html'];
    function getText(u) {
      return fetch(u + '?t=' + Date.now()).then(function (r) {
        if (!r.ok) throw new Error(u + ' → HTTP ' + r.status);
        return r.text();
      });
    }
    function parse(html) { return new DOMParser().parseFromString(html, 'text/html'); }
    // السيرفر المحلي مفيهوش rewrites الموقع (زي /help → /help.html) — فبنطبّقها من الـ Worker نفسه
    function routeMap() {
      return import('/cloudflare/worker.js').then(function (w) {
        var map = {};
        Object.keys(w.REWRITES).forEach(function (k) { map[k] = w.REWRITES[k]; });
        Object.keys(w.REDIRECTS).forEach(function (k) { map[k] = w.REDIRECTS[k].destination; });
        return function (path) { for (var i = 0; i < 5 && map[path]; i++) path = map[path]; return path; };
      });
    }
    testAsync('كل الروابط والملفات الداخلية في الصفحات موجودة (ومعاها الأقسام #)', function () {
      var problems = [], cache = {};
      function fileText(f) { return cache[f] || (cache[f] = getText(f)); }
      return routeMap().then(function (resolve) {
        return Promise.all(PAGES.map(function (page) {
          return fileText(page).then(function (html) {
            var els = parse(html).querySelectorAll('a[href], link[rel="stylesheet"][href], script[src]');
            return Promise.all(Array.prototype.map.call(els, function (el) {
              var raw = el.getAttribute('href') || el.getAttribute('src');
              if (/^(https?:|mailto:|tel:|data:|javascript:)/i.test(raw)) return null;
              var u = new URL(raw, location.origin + page);
              var file = raw.charAt(0) === '#' ? page : resolve(u.pathname);
              var hash = decodeURIComponent(u.hash.slice(1));
              return fileText(file).then(function (target) {
                if (hash && !parse(target).getElementById(hash)) problems.push(page + ': ' + raw + ' (#' + hash + ' missing)');
              }, function (e) { problems.push(page + ': ' + raw + ' → ' + e.message); });
            }));
          });
        }));
      }).then(function () { eq(problems, []); });
    });
    // كل النص العربي اللي بيشوفه العميل فصحى (قرار ١٩ سبتمبر ٢٠٢٦) — الكلمات دي عامية مصرية صريحة،
    // وأي واحدة منها في قاموس الأداة أو الصفحات أو رسايل السيرفر معناها إن نص عامي رجع
    var COLLOQUIAL = ['مش', 'مفيش', 'عشان', 'علشان', 'دلوقتي', 'إزاي', 'ازاي', 'اللي', 'بتاع', 'بتاعة', 'بتاعك', 'كده', 'النهارده',
      'عايز', 'عاوز', 'ده', 'دي', 'لسه', 'بس', 'كمان', 'إيه', 'فين', 'ليه', 'زي', 'خالص', 'شوية', 'تاني', 'دوس', 'اتنسخت', 'ابعتلنا', 'هنضيفك'];
    function colloquialIn(text) {
      var words = text.replace(/[ً-ْـ]/g, '').split(/[^ء-ي]+/);
      return words.filter(function (w, i) { return COLLOQUIAL.indexOf(w) > -1 && words.indexOf(w) === i; });
    }
    function pageArabicText(html) {
      var doc = parse(html);
      Array.prototype.forEach.call(doc.querySelectorAll('.only-en, script, style'), function (el) { el.remove(); });
      var meta = doc.querySelector('meta[name="description"]');
      return doc.title + ' ' + (meta ? meta.getAttribute('content') : '') + ' ' + doc.body.textContent + ' ' +
        Array.prototype.map.call(doc.querySelectorAll('[aria-label], [placeholder], [title]'), function (el) {
          return [el.getAttribute('aria-label'), el.getAttribute('placeholder'), el.getAttribute('title')].join(' ');
        }).join(' ');
    }
    testAsync('النص العربي فصحى: قاموس الأداة، والصفحات، ورسالة الانضمام، ورسايل السيرفر', function () {
      var problems = [];
      function check(src, text) { var w = colloquialIn(text); if (w.length) problems.push(src + ': ' + w.join('، ')); }
      check('join.js', ACC_JOIN.text('ar') + ' ' + ACC_JOIN.subject.ar);
      return getText('/js/i18n.js').then(function (js) {
        var ar = (js.match(/\n {4}ar: \{([\s\S]*?)\n {4}\},/) || [])[1];
        ok(ar, 'found the Arabic dictionary');
        var values = ar.split('\n').filter(function (l) { return !/^\s*\/\//.test(l); }).join('\n').match(/'[^']*'/g) || [];
        check('i18n.js (ar)', values.join(' '));
        return Promise.all(PAGES.concat(['/pricing.html']).map(function (u) {
          return getText(u).then(function (html) { check(u, pageArabicText(html)); });
        }));
      }).then(function () {
        return Promise.all(['/api/_cors.js', '/api/_verify.js', '/api/_google.js', '/api/google-ads-fetch.js', '/api/google-list-accounts.js',
          '/api/snapchat-ads-fetch.js', '/api/snapchat-token.js'].map(function (u) {
          return getText(u).then(function (src) {
            var msgs = (src.match(/(error:|new Error\()\s*'[^']*'/g) || []).join(' ');
            check(u, msgs);
          });
        }));
      }).then(function () { eq(problems, []); });
    });
    testAsync('العميل مبيشوفش تفاصيل داخلية عن مين يقدر يربط أنهي منصة', function () {
      var MECHANICS = /متاح لأي|لأي حد|لأي أحد|open to (everyone|anyone)|by name|بالاسم|نضيفهم|we add you by/i;
      ['hero.pilot', 'pf.pilot'].forEach(function (k) {
        ['ar', 'en'].forEach(function (l) {
          withLang(l, function () { ok(!/Snapchat|Meta|Google/.test(t(k)) && !MECHANICS.test(t(k)), k + ' (' + l + '): ' + t(k)); });
        });
      });
      return Promise.all(['/home.html', '/help.html', '/pauseproof-live.html'].map(function (u) {
        return getText(u).then(function (html) {
          var doc = parse(html);
          Array.prototype.forEach.call(doc.querySelectorAll('script, style'), function (el) { el.remove(); });
          var m = doc.body.textContent.match(MECHANICS);
          ok(!m, u + ': "' + (m && m[0]) + '"');
        });
      })).then(function () {
        return getText('/home.html');
      }).then(function (html) {
        var doc = parse(html);
        ok(!doc.querySelector('table.perm'), 'no permissions table on the landing page');
        // Google بتطلب إن الصفحة الرئيسية توضّح ليه بنطلب البيانات، مع رابط سياسة الخصوصية
        var data = doc.getElementById('data');
        ok(data && data.querySelector('a[href="/privacy"]') && /Limited Use/.test(data.textContent), 'data-use statement + privacy link');
      });
    });
    testAsync('كل صفحات الموقع فيها زرار الوضع الداكن، واسم الأداة بيودّي للرئيسية', function () {
      return Promise.all(['/home.html', '/help.html', '/privacy.html', '/terms.html', '/data-deletion.html', '/404.html'].map(function (u) {
        return getText(u).then(function (html) {
          var doc = parse(html);
          var btn = doc.querySelector('header [data-theme-toggle]');
          ok(btn && btn.querySelector('[data-theme-icon]'), u + ': dark-mode button');
          ok(btn.querySelector('.only-ar') && btn.querySelector('.only-en'), u + ': button has a label in both languages');
          var brand = doc.querySelector('header .legal-brand, header .site-brand');
          eq(brand && brand.getAttribute('href'), '/', u + ': brand link');
          ok(/theme\.js/.test(Array.prototype.map.call(doc.querySelectorAll('head script[src]'), function (s) { return s.getAttribute('src'); }).join(' ')), u + ': loads theme.js');
        });
      }));
    });
    testAsync('العرض التوضيحي في الرئيسية بيتحرك لوحده (من غير زرار) وبيبيّن إنه بيانات مثال', function () {
      var f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:900px;opacity:0;pointer-events:none';
      f.src = '/home.html?t=' + Date.now();
      document.body.appendChild(f);
      function active(d, sel) { return Array.prototype.findIndex.call(d.querySelectorAll(sel), function (s) { return s.classList.contains('is-active'); }); }
      return new Promise(function (r) { f.onload = r; }).then(function () {
        var d = f.contentDocument;
        eq(d.querySelectorAll('[data-demo] [data-scene]').length, 4, '4 scenes');
        eq(d.querySelectorAll('.demo-steps [data-step]').length, 4, '4 step captions');
        ok(d.querySelector('[data-demo]').getAttribute('aria-hidden') === 'true' && d.querySelector('.demo-wrap .sr-only'), 'decorative for screen readers, with a text description');
        ok(/بيانات توضيحية/.test(d.querySelector('.demo-tag').textContent), 'labelled as sample data');
        ok(!d.querySelector('[data-demo] button, [data-demo] a'), 'no buttons to press');
        var demoText = d.querySelector('.demo-wrap').textContent;
        ok(!/ج\.م|EGP/.test(demoText) && /\$/.test(demoText), 'amounts in dollars, no EGP left');
        ok(d.querySelector('.demo-hint') && d.querySelector('[data-demo] .demo-paused'), 'tap-to-pause hint + paused label');
        eq([active(d, '[data-scene]'), active(d, '.demo-steps [data-step]')], [0, 0], 'starts at step 1');
        return new Promise(function (r) { setTimeout(r, 3200); });
      }).then(function () {
        var d = f.contentDocument, now = [active(d, '[data-scene]'), active(d, '.demo-steps [data-step]')];
        // لو التاب مخفي (زي لوحة الاختبار وهي مقفولة) العرض لازم يفضل واقف عشان ميستهلكش جهاز الزائر
        if (d.hidden) eq(now, [0, 0], 'tab hidden: stays paused on step 1 (saves the device)');
        else eq(now, [1, 1], 'moved to step 2 on its own');
      }).then(function () { f.remove(); }, function (e) { f.remove(); throw e; });
    });
    testAsync('العرض التوضيحي: الضغط بيوقفه ثانيتين، وبيتقلّب حتى مع «تقليل الحركة»، والمبالغ بالدولار', function () {
      var f = document.createElement('iframe'), t0;
      f.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:900px;opacity:0;pointer-events:none';
      function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
      return getText('/home.html').then(function (html) {
        // «تقليل الحركة» شغال والتاب ظاهر — عشان النتيجة متتأثرش بإعدادات الجهاز ولا بلوحة الاختبار وهي مقفولة
        f.srcdoc = '<!doctype html><html lang="ar" dir="rtl"><head><link rel="stylesheet" href="/site.css"></head><body>' +
          '<script>Object.defineProperty(document, "hidden", { configurable: true, get: function () { return false; } });' +
          'window.matchMedia = function (q) { return { matches: /reduce/.test(q), media: q, addListener: function () {}, removeListener: function () {} }; };<\/script>' +
          parse(html).querySelector('.demo-wrap').outerHTML + '<script src="/js/demo.js"><\/script></body></html>';
        var loaded = new Promise(function (r) { f.onload = r; });
        document.body.appendChild(f);
        return loaded;
      }).then(function () {
        var d = f.contentDocument, w = f.contentWindow, demo = d.querySelector('[data-demo]');
        function scene() { return Array.prototype.findIndex.call(d.querySelectorAll('[data-scene]'), function (s) { return s.classList.contains('is-active'); }); }
        eq(scene(), 0, 'starts at scene 1');
        demo.dispatchEvent(new w.PointerEvent('pointerdown', { bubbles: true }));
        demo.dispatchEvent(new w.PointerEvent('pointerup', { bubbles: true }));
        t0 = Date.now();
        ok(demo.classList.contains('is-paused') && d.querySelector('.demo-steps').classList.contains('is-paused'), 'a tap pauses it');
        ok(w.getComputedStyle(d.querySelector('.demo-paused')).display !== 'none' && w.getComputedStyle(d.querySelector('.demo-url')).display === 'none', 'shows «⏸ متوقف مؤقتًا» instead of the URL');
        return sleep(3300).then(function () {
          // من غير الإيقاف كان هيتنقل عند ٢٫٨ ثانية
          eq(scene(), 0, 'still on scene 1 after 3.3s (the pause added time)');
          ok(!demo.classList.contains('is-paused'), 'pause lifted by itself after 2s');
          function poll() { return scene() === 1 || Date.now() - t0 > 9000 ? null : sleep(100).then(poll); }
          return poll();
        }).then(function () {
          eq(scene(), 1, 'reduced motion: still moves to the next scene (no animation, but not frozen)');
          ok(Date.now() - t0 >= 4500, 'resumed with the time that was left (' + (Date.now() - t0) + 'ms)');
          eq(Array.prototype.map.call(d.querySelectorAll('[data-count]'), function (el) { return el.textContent; }), ['٤٬٨٢٠ $', '٦١٢', '٣٤٥ $'], 'reduced motion: figures at full value right away, in dollars');
          d.documentElement.lang = 'en';
          return sleep(50);
        }).then(function () {
          eq(d.querySelector('[data-count]').textContent, '$4,820', 'English: $4,820');
        });
      }).then(function () { f.remove(); }, function (e) { f.remove(); throw e; });
    });
    // صفحة في iframe بمقاس معيّن — before (اختياري) بيتنفّذ في الصفحة قبل أي سكربت فيها
    function framePage(url, w, h, before) {
      var f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:0;top:0;width:' + w + 'px;height:' + h + 'px;opacity:0;pointer-events:none';
      var loaded = new Promise(function (r) { f.onload = r; });
      if (before) {
        return getText(url).then(function (html) {
          f.srcdoc = html.replace('<head>', '<head><script>' + before + '<\/script>');
          document.body.appendChild(f);
          return loaded;
        }).then(function () { return f; });
      }
      f.src = url + (url.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now();
      document.body.appendChild(f);
      return loaded.then(function () { return f; });
    }
    testAsync('الصفحات العامة كلها بتحمّل js/site.js (الحركة، القائمة، الفهرس، زرار «لأعلى»)', function () {
      return Promise.all(['/home.html', '/help.html', '/privacy.html', '/terms.html', '/data-deletion.html', '/404.html'].map(function (u) {
        return getText(u).then(function (html) {
          var srcs = Array.prototype.map.call(parse(html).querySelectorAll('body script[src]'), function (s) { return s.getAttribute('src'); });
          ok(srcs.some(function (s) { return /(^|\/)js\/site\.js$/.test(s); }), u + ': loads js/site.js');
        });
      }));
    });
    testAsync('قائمة الموبايل في الرئيسية: ☰ بتفتح وبتقفل، وفيها «دخول الأداة»، وعلى الكمبيوتر الروابط ظاهرة', function () {
      var f;
      return framePage('/home.html', 375, 800).then(function (fr) {
        f = fr;
        var d = f.contentDocument, w = f.contentWindow, btn = d.querySelector('[data-menu-toggle]'), nav = d.getElementById('siteNav');
        ok(btn && w.getComputedStyle(btn).display !== 'none', 'menu button shows on mobile');
        eq(w.getComputedStyle(nav).display, 'none', 'links hidden until opened');
        btn.click();
        eq([btn.getAttribute('aria-expanded'), w.getComputedStyle(nav).display], ['true', 'flex'], 'opens');
        ok(nav.querySelector('a[href="/app"]') && w.getComputedStyle(nav.querySelector('a[href="/app"]')).display !== 'none', '«Open the tool» is in the mobile menu');
        d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
        eq([btn.getAttribute('aria-expanded'), w.getComputedStyle(nav).display], ['false', 'none'], 'Escape closes it');
        f.remove();
        return framePage('/home.html', 1280, 800);
      }).then(function (fr) {
        f = fr;
        var d = f.contentDocument, w = f.contentWindow;
        eq(w.getComputedStyle(d.querySelector('[data-menu-toggle]')).display, 'none', 'desktop: no menu button');
        eq(w.getComputedStyle(d.getElementById('siteNav')).display, 'flex', 'desktop: links visible');
        eq(d.querySelectorAll('.eyebrow').length, 6, 'a small label above every section heading');
        ok(d.querySelectorAll('main > .band').length >= 3, 'alternating section backgrounds');
      }).then(function () { f.remove(); }, function (e) { if (f) f.remove(); throw e; });
    });
    testAsync('الصفحات القانونية الطويلة ليها فهرس تلقائي بروابط شغالة، والقصيرة لأ', function () {
      var f;
      return framePage('/privacy.html', 1000, 800).then(function (fr) {
        f = fr;
        var d = f.contentDocument, tocs = d.querySelectorAll('.doc-toc');
        eq(tocs.length, 2, 'one contents box per language');
        Array.prototype.forEach.call(tocs, function (toc) {
          var art = toc.closest('article'), links = toc.querySelectorAll('a');
          eq(links.length, art.querySelectorAll(':scope > h2').length, art.getAttribute('lang') + ': a link for every section');
          ok(Array.prototype.every.call(links, function (a) { var t = d.getElementById(a.getAttribute('href').slice(1)); return t && t.tagName === 'H2' && art.contains(t); }), art.getAttribute('lang') + ': every link points to its section');
        });
        f.remove();
        return framePage('/data-deletion.html', 1000, 800);
      }).then(function (fr) {
        f = fr;
        eq(f.contentDocument.querySelectorAll('.doc-toc').length, 0, 'short page (3 sections): no contents box');
      }).then(function () { f.remove(); }, function (e) { if (f) f.remove(); throw e; });
    });
    testAsync('مع «تقليل الحركة» مفيش أي محتوى بيستخبّى، ومن غيره اللي ظاهر أول ما الصفحة تفتح مبيستخبّاش', function () {
      var f, fake = 'window.matchMedia = function (q) { return { matches: /reduce/.test(q), media: q, addListener: function () {}, removeListener: function () {}, addEventListener: function () {}, removeEventListener: function () {} }; };';
      return framePage('/home.html', 1280, 800, fake).then(function (fr) {
        f = fr;
        var d = f.contentDocument;
        ok(!d.documentElement.classList.contains('has-reveal') && !d.querySelector('.rv'), 'reduced motion: nothing hidden');
        f.remove();
        return framePage('/home.html', 1280, 800);
      }).then(function (fr) {
        f = fr;
        var d = f.contentDocument, fold = f.contentWindow.innerHeight;
        var hiddenAboveFold = Array.prototype.filter.call(d.querySelectorAll('.rv:not(.is-in)'), function (el) { return el.getBoundingClientRect().top < fold; });
        eq(hiddenAboveFold.length, 0, 'nothing on the first screen waits to appear');
        ok(d.querySelectorAll('.rv').length > 10, 'sections further down appear as you scroll');
      }).then(function () { f.remove(); }, function (e) { if (f) f.remove(); throw e; });
    });
    testAsync('الصفحات الجديدة باللغتين ومنشورة، و404 بمسارات مطلقة', function () {
      return Promise.all(['/home.html', '/help.html', '/404.html'].map(function (u) {
        return getText(u).then(function (html) {
          var doc = parse(html), root = doc.documentElement;
          ok(root.getAttribute('data-title-ar') && root.getAttribute('data-title-en'), u + ': both titles');
          ok(doc.getElementById('legalLang'), u + ': language button');
          var nAr = doc.querySelectorAll('.only-ar').length, nEn = doc.querySelectorAll('.only-en').length;
          ok(nAr > 0 && nAr === nEn, u + ': every Arabic block has an English one (' + nAr + '/' + nEn + ')');
          if (u === '/404.html') {
            var relative = Array.prototype.filter.call(doc.querySelectorAll('a[href], link[href], script[src]'), function (el) {
              return !/^(https?:|mailto:|\/)/.test(el.getAttribute('href') || el.getAttribute('src'));
            });
            eq(relative.length, 0, '404 uses absolute paths only');
          }
        });
      })).then(function () {
        return getText('/.assetsignore');
      }).then(function (txt) {
        var ignored = txt.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(function (s) { return s && s.charAt(0) !== '#'; });
        ['/home.html', '/help.html', '/404.html', '/site.css', '/legal.css', '/js/join.js', '/js/legal.js', '/js/demo.js', '/js/site.js'].forEach(function (f) {
          ok(ignored.indexOf(f) === -1 && ignored.indexOf(f.slice(1)) === -1 && ignored.indexOf(f.split('/')[1]) === -1, f + ' is deployed');
        });
      });
    });
  });

  describe('Cloudflare', function () {
    // الـ Worker نفسه (cloudflare/worker.js) بيتحمّل هنا كـ module، وبنديله ASSETS وهمي بيقرا الملفات من
    // السيرفر المحلي (ملف مش موجود = 404 زي Cloudflare) — فبنختبر الـ routes والرؤوس وطبقة التحويل
    // لدوال api من غير Cloudflare
    function loadWorker() { return import('/cloudflare/worker.js'); }
    function fakeEnv(extra) {
      return Object.assign({
        ASSETS: { fetch: function (req) { return fetch(new URL(req.url).pathname + '?t=' + Date.now()); } }
      }, extra || {});
    }
    function call(w, path, init, env) { return w.default.fetch(new Request(location.origin + path, init || {}), env || fakeEnv()); }
    // الـ Worker بيحط الأسرار في process.env — بنرجّع الصفحة لحالتها بعد الاختبار
    var hadProcess = typeof globalThis.process !== 'undefined';
    function cleanProcess() { if (!hadProcess) delete globalThis.process; else ['SNAPCHAT_CLIENT_ID', 'SNAPCHAT_CLIENT_SECRET'].forEach(function (k) { delete globalThis.process.env[k]; }); }

    // الروابط الرسمية مسجّلة في Meta وGoogle وSnapchat (رابط الرجوع = /app) — أي تغيير فيها لازم يتسجّل هناك كمان
    testAsync('الروابط الرسمية ورؤوس الأمان ثابتة، وكل صفحة ليها ملف موجود', function () {
      return loadWorker().then(function (w) {
        eq(w.REWRITES, {
          '/': '/home.html', '/index.html': '/home.html', '/app': '/pauseproof-live.html',
          '/help': '/help.html', '/privacy': '/privacy.html', '/terms': '/terms.html', '/data-deletion': '/data-deletion.html',
          '/favicon.ico': '/favicon.svg'
        }, 'rewrites');
        eq(w.REDIRECTS['/home'], { destination: '/', permanent: true }, 'old /home');
        ['X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options', 'Permissions-Policy', 'Strict-Transport-Security', 'Content-Security-Policy'].forEach(function (h) {
          ok(w.SECURITY_HEADERS[h], 'security header: ' + h);
        });
        ok(/frame-ancestors 'self'/.test(w.SECURITY_HEADERS['Content-Security-Policy']), 'no framing by other sites');
        return Promise.all(Object.keys(w.REWRITES).map(function (k) {
          return fetch(w.REWRITES[k] + '?t=' + Date.now()).then(function (r) { return k + ' ' + r.status; });
        }));
      }).then(function (list) {
        list.forEach(function (s) { ok(/ 200$/.test(s), 'page file exists: ' + s); });
      });
    });
    testAsync('الصفحات: الرئيسية والروابط النظيفة والتحويل و404 — بنفس سلوك Vercel', function () {
      return loadWorker().then(function (w) {
        var csp = w.SECURITY_HEADERS['Content-Security-Policy'];
        return call(w, '/').then(function (res) {
          eq(res.status, 200, '/');
          eq(res.headers.get('Content-Security-Policy'), csp, 'CSP on pages');
          eq(res.headers.get('X-Frame-Options'), 'SAMEORIGIN');
          return res.text();
        }).then(function (html) {
          ok(html.indexOf('home-hero') > -1, '/ serves the landing page');
          return call(w, '/app');
        }).then(function (res) {
          eq(res.status, 200, '/app');
          return res.text();
        }).then(function (html) {
          ok(html.indexOf('id="emptyHero"') > -1, '/app serves the tool');
          return call(w, '/home?x=1');
        }).then(function (res) {
          eq([res.status, res.headers.get('Location')], [308, '/?x=1'], 'old /home links go to / permanently');
          return call(w, '/help.html');
        }).then(function (res) {
          eq(res.status, 200, '/help.html still works (html_handling: none)');
          return call(w, '/pricing?x=1');
        }).then(function (res) {
          eq([res.status, res.headers.get('Location')], [307, '/?x=1'], 'hidden pricing page redirects');
          return call(w, '/no-such-page');
        }).then(function (res) {
          eq(res.status, 404, 'missing page');
          eq(res.headers.get('Content-Security-Policy'), csp, 'CSP on 404');
          return res.text();
        }).then(function (html) {
          ok(html.indexOf('nf-code') > -1, 'our 404 page');
          return call(w, '/app', { method: 'POST' });
        }).then(function (res) {
          eq(res.status, 405, 'POST to a page');
          // www بيتحوّل للدومين الأساسي بنفس المسار
          return w.default.fetch(new Request('https://www.adscenter.online/help?x=1'), fakeEnv());
        }).then(function (res) {
          eq([res.status, res.headers.get('Location')], [301, 'https://adscenter.online/help?x=1'], 'www redirect');
        });
      });
    });
    testAsync('دوال api على Cloudflare بتدّي نفس ردود Vercel (طبقة التحويل)', function () {
      var w;
      return loadWorker().then(function (mod) {
        w = mod;
        cleanProcess();
        // من غير الأسرار: نفس رسالة CONFIG
        return call(w, '/api/snapchat-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      }).then(function (res) {
        eq(res.status, 500, 'no secrets');
        return res.json();
      }).then(function (data) {
        eq(data.code, 'CONFIG');
        var env = fakeEnv({ SNAPCHAT_CLIENT_ID: 'id', SNAPCHAT_CLIENT_SECRET: 'secret' });
        return call(w, '/api/snapchat-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, env);
      }).then(function (res) {
        eq(res.status, 400, 'missing fields');
        eq(res.headers.get('Cache-Control'), 'no-store', 'API replies are never cached');
        ok(/application\/json/.test(res.headers.get('Content-Type')), 'JSON reply');
        ok(res.headers.get('Content-Security-Policy'), 'security headers on API replies too');
        return res.json();
      }).then(function (data) {
        eq(data.code, 'BAD_REQUEST');
        return call(w, '/api/snapchat-token', { method: 'POST', body: 'not json' });
      }).then(function (res) {
        eq(res.status, 400, 'a body that is not JSON = BAD_REQUEST (like Vercel)');
        return call(w, '/api/snapchat-token', { method: 'OPTIONS' });
      }).then(function (res) {
        eq(res.status, 204, 'OPTIONS');
        return res.text();
      }).then(function (txt) {
        eq(txt, '', 'OPTIONS has no body');
        return call(w, '/api/google-list-accounts', { method: 'GET' });
      }).then(function (res) {
        eq(res.status, 405, 'GET on an API');
        return Promise.all(['/api/discount', '/api/_cors', '/api/_verify.js'].map(function (p) {
          return call(w, p, { method: 'POST', body: '{}' }).then(function (r) { return p + ' ' + r.status; });
        }));
      }).then(function (list) {
        eq(list, ['/api/discount 404', '/api/_cors 404', '/api/_verify.js 404'], 'hidden and private modules are not endpoints');
      }).then(cleanProcess, function (e) { cleanProcess(); throw e; });
    });
    testAsync('ملفات الخادم والاختبارات والأسعار المخفية مش بتتنشر', function () {
      return fetch('/.assetsignore?t=' + Date.now()).then(function (r) { return r.text(); }).then(function (txt) {
        var cf = txt.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(function (s) { return s && s.charAt(0) !== '#'; });
        ['api', 'cloudflare', 'tests', '.assetsignore', 'pricing.html', 'pricing.css', 'js/pricing.js'].forEach(function (f) { ok(cf.indexOf(f) > -1, '.assetsignore: ' + f); });
      });
    });
  });

  describe('أكواد الخصم (السيرفر)', function () {
    testAsync('قراءة الأكواد من متغيّر البيئة', function () {
      return import('/api/_discounts.js').then(function (d) {
        var codes = d.parseDiscountCodes('FOUNDER-7K2Q:50, partner-x9:20:2026-12-31, bad:0, nopct, over:150');
        eq(Object.keys(codes).sort(), ['FOUNDER-7K2Q', 'PARTNER-X9']);
        eq(codes['PARTNER-X9'], { percent: 20, until: '2026-12-31' });
      });
    });
    testAsync('التحقق: حروف صغيرة، صلاحية، وكود غلط', function () {
      return import('/api/_discounts.js').then(function (d) {
        var codes = d.parseDiscountCodes('FOUNDER-7K2Q:50, PARTNER-X9:20:2026-12-31');
        eq(d.checkDiscount(codes, ' founder-7k2q ', '2026-09-19'), { valid: true, code: 'FOUNDER-7K2Q', percent: 50 });
        eq(d.checkDiscount(codes, 'PARTNER-X9', '2026-12-31').valid, true);
        eq(d.checkDiscount(codes, 'PARTNER-X9', '2027-01-01'), { valid: false, expired: true });
        eq(d.checkDiscount(codes, 'NOPE', '2026-09-19'), { valid: false });
        eq(d.checkDiscount(codes, '', '2026-09-19'), { valid: false });
        eq(d.normalizeCode('a<b>"c'), 'ABC');
      });
    });
  });

  describe('Google Ads — الحسابات', function () {
    testAsync('السيرفر بيطلع كود الخطأ من رد Google', function () {
      return import('/api/_google.js').then(function (g) {
        var payload = { error: { message: 'x', details: [{ errors: [{ errorCode: { authorizationError: 'CUSTOMER_NOT_ENABLED' }, message: 'not enabled' }] }] } };
        eq(g.googleErrorCode(payload), 'CUSTOMER_NOT_ENABLED');
        eq(g.googleErrorMessage(payload, 403), 'not enabled');
        eq(g.googleErrorCode({}), null);
      });
    });
    testAsync('الـ developer token اختياري (Google بقت بتتجاهله)', function () {
      return import('/api/_google.js').then(function (g) {
        ok(!('developer-token' in g.googleHeaders(null, 'tok', null)), 'no header when missing');
        eq(g.googleHeaders('dev', 'tok', '123-456-7890')['login-customer-id'], '1234567890');
      });
    });
    testAsync('حساب مقفول بس = رسالة واضحة برقمه (مش "خطأ")', function () {
      var realFetch = window.fetch;
      window.fetch = fakeFetch({ accounts: [], errors: [], inactive: ['1234567890'] });
      googleAccessToken = 'test';
      loadGoogleAccounts();
      return tick().then(tick).then(function () {
        window.fetch = realFetch;
        var text = document.getElementById('connectStatus').textContent;
        ok(text.indexOf('123-456-7890') > -1, 'shows the account id: ' + text);
        ok(text.indexOf(t('s.googleAccountsFailed', { msg: '' }).slice(0, 10)) === -1, 'not shown as a failure');
      }, function (e) { window.fetch = realFetch; throw e; });
    });
  });

  // ---------- المراجعة الشاملة: الأمان والاعتمادية والوضوح ----------
  describe('المراجعة الشاملة', function () {
    function worker() { return import('/cloudflare/worker.js'); }
    function assets() { return { ASSETS: { fetch: function (req) { return fetch(new URL(req.url).pathname + '?t=' + Date.now()); } } }; }
    function post(w, path, body, env) {
      return w.default.fetch(new Request(location.origin + path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body)
      }), Object.assign(assets(), env || {}));
    }
    function cleanEnv() { if (globalThis.process && globalThis.process.env) ['SNAPCHAT_CLIENT_ID', 'SNAPCHAT_CLIENT_SECRET', 'GOOGLE_CLIENT_ID'].forEach(function (k) { delete globalThis.process.env[k]; }); }

    testAsync('الـ API: أي مدخل بشكل غلط = BAD_REQUEST قبل ما يوصل لأي منصة', function () {
      var w, env = { SNAPCHAT_CLIENT_ID: 'id', SNAPCHAT_CLIENT_SECRET: 'secret' };
      return worker().then(function (m) {
        w = m; cleanEnv();
        return post(w, '/api/google-ads-fetch', { accessToken: { x: 1 }, customerId: '123' }, env);
      }).then(function (res) {
        eq(res.status, 400, 'a token that is not text');
        return post(w, '/api/google-ads-fetch', { accessToken: 't', customerId: '12/../34' }, env);
      }).then(function (res) {
        eq(res.status, 400, 'Google account id with a path in it');
        return post(w, '/api/snapchat-ads-fetch', { accessToken: 't', action: 'ads', adAccountId: '../../me' }, env);
      }).then(function (res) {
        eq(res.status, 400, 'Snapchat account id with a path in it');
        return post(w, '/api/tiktok-ads-fetch', { accessToken: 't', advertiserId: '12a' }, env);
      }).then(function (res) {
        eq(res.status, 400, 'TikTok account id must be digits');
        return post(w, '/api/snapchat-token', { code: 'c', redirectUri: 'https://evil.example/app' }, env);
      }).then(function (res) {
        eq(res.status, 400, 'the Snapchat return link must be our own /app');
        return post(w, '/api/google-list-accounts', { accessToken: 'x'.repeat(9000) }, env);
      }).then(function (res) {
        eq(res.status, 400, 'absurdly long token');
      }).then(cleanEnv, function (e) { cleanEnv(); throw e; });
    });

    testAsync('الـ API: طلب ضخم = 413، ومسار مش موجود = JSON، وإعداد Google الناقص بيقفل الباب (مش بيفتحه)', function () {
      var w;
      return worker().then(function (m) {
        w = m; cleanEnv();
        return post(w, '/api/snapchat-token', '{"code":"' + 'x'.repeat(70 * 1024) + '"}');
      }).then(function (res) {
        eq(res.status, 413, 'huge body');
        return post(w, '/api/nope', {});
      }).then(function (res) {
        eq(res.status, 404, 'unknown API path');
        ok(/application\/json/.test(res.headers.get('Content-Type')), 'JSON, not the visitors\' 404 page');
        return res.json();
      }).then(function (data) {
        eq(data.code, 'NOT_FOUND');
        // GOOGLE_CLIENT_ID مش مضبوط: قبل كده أي توكن كان بيعدّي من غير تحقق
        return post(w, '/api/google-list-accounts', { accessToken: 'any-token' });
      }).then(function (res) {
        eq(res.status, 500, 'missing GOOGLE_CLIENT_ID');
        return res.json();
      }).then(function (data) {
        eq(data.code, 'CONFIG');
      }).then(cleanEnv, function (e) { cleanEnv(); throw e; });
    });

    testAsync('X-Forwarded-Host المزوّر مبيوصلش للدوال، وموقع تاني مرفوض حتى لو زوّره', function () {
      var seen = null;
      return worker().then(function (w) {
        var req = new Request(location.origin + '/api/x', { method: 'POST', headers: { 'X-Forwarded-Host': 'evil.example' }, body: '{}' });
        return w.runVercelHandler(function (rq, rs) { seen = rq.headers; rs.status(200).json({}); }, req, {});
      }).then(function () {
        ok(seen && !('x-forwarded-host' in seen), 'header dropped by the Worker');
        return import('/api/_cors.js');
      }).then(function (c) {
        var code = null, res = { setHeader: function () {}, status: function (s) { code = s; return this; }, json: function () { return this; }, end: function () { return this; } };
        var allowed = c.guardRequest({ method: 'POST', headers: { origin: 'https://evil.example', host: 'adscenter.online', 'x-forwarded-host': 'evil.example' } }, res);
        eq([allowed, code], [false, 403]);
      });
    });

    testAsync('رؤوس الأمان: نوافذ تسجيل الدخول شغّالة (COOP) والصور القديمة http بتتحوّل https', function () {
      return worker().then(function (w) {
        eq(w.SECURITY_HEADERS['Cross-Origin-Opener-Policy'], 'same-origin-allow-popups');
        ok(/upgrade-insecure-requests/.test(w.SECURITY_HEADERS['Content-Security-Policy']), 'upgrade-insecure-requests');
      });
    });

    testAsync('تاريخ مخصص مش حقيقي (٣١ فبراير) بيرجع لآخر ٧ أيام بدل ما يتبعت للمنصة', function () {
      return import('/api/_dates.js').then(function (d) {
        var r = d.resolvePeriod({ preset: 'custom', since: '2026-02-31', until: '2026-03-05' }, 'UTC');
        eq([r.preset, r.isDefault], ['last7', true]);
        var ok2 = d.resolvePeriod({ preset: 'custom', since: '2026-02-01', until: '2026-02-28' }, 'UTC');
        eq([ok2.since, ok2.until], ['2026-02-01', '2026-02-28'], 'a real custom range still works');
      });
    });

    testAsync('Snapchat: روابط الصفحات الجاية بتتتبع على API بتاع Snapchat بس (التوكن مبيروحش لدومين تاني)', function () {
      var realFetch = window.fetch, urls = [];
      var json = function (obj) { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(obj); } }); };
      window.fetch = function (url) {
        var u = String(url); urls.push(u);
        if (/\/adaccounts\/[^/?]+$/.test(u)) return json({ adaccounts: [{ adaccount: { timezone: 'UTC', currency: 'USD' } }] });
        if (/\/ads\?/.test(u)) return json({ ads: [{ ad: { id: 'a1' } }], paging: { next_link: 'https://evil.example/steal' } });
        return json({});
      };
      var res = { setHeader: function () {}, status: function () { return this; }, json: function () { return this; }, end: function () { return this; } };
      return import('/api/snapchat-ads-fetch.js').then(function (m) {
        return m.default({ method: 'POST', headers: {}, body: { accessToken: 't', action: 'ads', adAccountId: 'acc1' } }, res);
      }).then(function () {
        window.fetch = realFetch;
        var outside = urls.filter(function (u) { return u.indexOf('https://adsapi.snapchat.com/') !== 0; });
        eq(outside, [], 'requests outside Snapchat');
      }, function (e) { window.fetch = realFetch; throw e; });
    });

    testAsync('طلبات السيرفر: انقطاع النت أو طلب معلّق = رسالة مفهومة (مش خطأ تقني ولا تحميل على طول)', function () {
      var realFetch = window.fetch, realTimeout = API_TIMEOUT_MS;
      var restore = function () { window.fetch = realFetch; API_TIMEOUT_MS = realTimeout; };
      window.fetch = function () { return Promise.reject(new TypeError('Failed to fetch')); };
      return apiPost('/api/x', {}).then(function (res) {
        eq([res.status, res.ok, res.data.code], [0, false, 'NETWORK']);
        eq(apiErrorText(res)(), t('s.network'));
        API_TIMEOUT_MS = 30;
        window.fetch = function (u, init) {
          return new Promise(function (resolve, reject) {
            init.signal.addEventListener('abort', function () { var e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
          });
        };
        return apiPost('/api/x', {});
      }).then(function (res) {
        restore();
        eq(res.data.code, 'TIMEOUT');
        eq(apiErrorText(res)(), t('s.timeout'));
      }, function (e) { restore(); throw e; });
    });

    test('مكتبة Meta اتمنعت (حجب إعلانات مثلاً): رسالة واضحة، والجلسة المحفوظة بتبقى كارت خطأ بدل ما تعلّق', function () {
      var prev = fbSdkFailed;
      try {
        activeSources.meta = 'act_1';
        onFbSdkFailed();
        eq(platformState.meta && platformState.meta.kind, 'error');
        eq(document.getElementById('connectStatus').textContent, t('s.metaSdkBlocked'));
        if (typeof FB === 'undefined') {
          loginWithMeta();
          eq(document.getElementById('connectStatus').textContent, t('s.metaSdkBlocked'), 'login button says why');
        }
      } finally { fbSdkFailed = prev; }
    });

    test('أرقام Meta: قيمة مش رقم مبتطلعش «NaN»', function () {
      eq(valueForType([{ action_type: 'purchase', value: 'n/a' }], 'purchase'), null);
      eq(valueForType([{ action_type: 'purchase', value: '3' }], 'purchase'), 3);
      eq([num('12.5'), num('x'), num(null)], [12.5, 0, 0]);
    });

    test('قارئ الشاشة: رسالة الحالة بتتقري، والتبويبات بتتنقل بالأسهم، والقائمة بتقول إنها بتتحمّل', function () {
      var status = document.getElementById('connectStatus');
      eq([status.getAttribute('role'), status.getAttribute('aria-live')], ['status', 'polite']);
      var tabAds = document.getElementById('tabAds'), tabAlerts = document.getElementById('tabAlerts');
      try {
        showView('ads');
        tabAds.focus();
        var next = document.documentElement.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
        tabAds.dispatchEvent(new KeyboardEvent('keydown', { key: next, bubbles: true }));
        eq([document.activeElement && document.activeElement.id, tabAlerts.getAttribute('aria-selected'), tabAlerts.tabIndex, tabAds.tabIndex], ['tabAlerts', 'true', 0, -1]);
        eq(document.getElementById('viewAlerts').getAttribute('aria-labelledby'), 'tabAlerts');
      } finally { showView('ads'); }
      setLoading('google', true);
      eq(cardGrid.getAttribute('aria-busy'), 'true');
      setLoading('google', false);
      eq(cardGrid.getAttribute('aria-busy'), 'false');
    });

    test('رابط الرجوع من Snapchat وTikTok دايماً /app (مهما كانت الصفحة المفتوحة)', function () {
      eq(oauthReturnUrl(), location.origin + '/app');
    });

    test('البحث عن إعلان برقمه بيتحدّث مع أي قائمة جديدة', function () {
      candidates = [ad('f1'), ad('f2')];
      eq(findCandidate('f2').id, 'f2');
      candidates = [ad('f3')];
      eq(findCandidate('f2'), undefined, 'old list is not reused');
      eq(findCandidate('f3').id, 'f3');
      eq(findCandidate('constructor'), undefined, 'no inherited properties');
    });

    testAsync('الألوان: كل نص صغير مقروء (WCAG AA ٤٫٥:١) في الوضع الفاتح والداكن — في الموقع والأداة', function () {
      var L = function (h) {
        var c = [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16) / 255; })
          .map(function (v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      };
      var ratio = function (a, b) { var x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      // كل تعريف للون بالترتيب اللي في الملف: الأول = الفاتح، التاني = الداكن
      var tokens = function (css) {
        var out = {}, re = /--([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g, m;
        while ((m = re.exec(css))) (out[m[1]] = out[m[1]] || []).push(m[2]);
        return out;
      };
      var check = function (name, tk, pairs) {
        [0, 1].forEach(function (mode) {
          pairs.forEach(function (p) {
            var fg = tk[p[0]] && (tk[p[0]][mode] || tk[p[0]][0]), bg = tk[p[1]] && (tk[p[1]][mode] || tk[p[1]][0]);
            ok(fg && bg, name + ': tokens ' + p.join(' on '));
            var r = ratio(fg, bg);
            ok(r >= 4.5, name + (mode ? ' dark' : ' light') + ': ' + p[0] + ' on ' + p[1] + ' = ' + r.toFixed(2));
          });
        });
      };
      return Promise.all(['/pauseproof-live.html', '/legal.css', '/site.css'].map(function (u) { return fetch(u + '?t=' + Date.now()).then(function (r) { return r.text(); }); })).then(function (files) {
        check('tool', tokens(files[0]), [['ink-faint', 'paper'], ['ink-faint', 'card'], ['ink-faint', 'sending-bg'], ['ink-soft', 'paper'],
          ['pending', 'pending-bg'], ['alert', 'alert-bg'], ['verified', 'verified-bg'], ['on-verified', 'verified'], ['on-pending', 'pending'], ['on-alert', 'alert']]);
        var site = tokens(files[1]), extra = tokens(files[2]);
        Object.keys(extra).forEach(function (k) { site[k] = extra[k]; });
        check('site', site, [['ink-faint', 'paper'], ['ink-faint', 'card'], ['ink-faint', 'band'], ['ink-soft', 'paper'],
          ['pending', 'pending-bg'], ['verified', 'verified-bg'], ['on-verified', 'verified']]);
      });
    });
  });

  // ---------- اختبار المستخدم: اللي ظهر وأنا بستخدم البرنامج كمختبِر ----------
  describe('اختبار المستخدم', function () {
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    // الأداة الحقيقية في iframe (بالستايل بتاعها)
    function toolFrame(w, h, query) {
      var f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:0;top:0;width:' + w + 'px;height:' + h + 'px;opacity:0;pointer-events:none';
      f.src = '/pauseproof-live.html?t=' + Date.now() + (query || '');
      var loaded = new Promise(function (r) { f.onload = r; });
      document.body.appendChild(f);
      return loaded.then(function () { return sleep(100); }).then(function () { return f; });
    }
    function keepStorage(keys) {
      var saved = {};
      keys.forEach(function (k) { saved[k] = localStorage.getItem(k); });
      return function () { keys.forEach(function (k) { if (saved[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, saved[k]); }); };
    }

    testAsync('رابط بشرطة في الآخر أو بحروف كبيرة (/app/ و /HELP) بيوصل للصفحة، والأيقونة موجودة', function () {
      var w, env = { ASSETS: { fetch: function (req) { return fetch(new URL(req.url).pathname + '?t=' + Date.now()); } } };
      var get = function (path) { return w.default.fetch(new Request(location.origin + path), env); };
      return import('/cloudflare/worker.js').then(function (m) {
        w = m;
        return get('/app/');
      }).then(function (res) {
        eq([res.status, res.headers.get('Location')], [308, '/app'], '/app/');
        return get('/HELP/?x=1');
      }).then(function (res) {
        eq([res.status, res.headers.get('Location')], [308, '/help?x=1'], '/HELP/?x=1');
        return get('/no-such-page/');
      }).then(function (res) {
        eq(res.status, 404, 'unknown page with a slash is still 404');
        return get('/favicon.ico');
      }).then(function (res) {
        eq(res.status, 200, 'favicon');
        return res.text();
      }).then(function (svg) {
        ok(/<svg/.test(svg), 'the icon is an SVG');
        return fetch('/home.html?t=' + Date.now()).then(function (r) { return r.text(); });
      }).then(function (html) {
        ok(new DOMParser().parseFromString(html, 'text/html').querySelector('link[rel="icon"][href="/favicon.svg"]'), 'pages point to the icon');
      });
    });

    test('الإعدادات: «٢٫٥» و«2,5» بيتحفظوا ٢٫٥ (قبل كده كانوا بيتشالوا في صمت)، والنص الغلط بيطلع خطأ', function () {
      var inp = function (k) { return settingsForm.querySelector('[name="' + k + '"]'); };
      ['٢٫٥', '2,5', ' 2.5 ', '۲٫۵'].forEach(function (typed) {
        alertSettings = {};
        renderSettingsForm();
        inp('roasTarget').value = typed;
        document.getElementById('settingsSave').click();
        eq(alertSettings.roasTarget, 2.5, 'typed "' + typed + '"');
      });
      alertSettings = {};
      renderSettingsForm();
      inp('roasTarget').value = 'abc';
      document.getElementById('settingsSave').click();
      eq(JSON.stringify(alertSettings), '{}', 'not saved');
      ok(settingsForm.querySelector('.setting-row.invalid [name="roasTarget"]'), 'marked as an error');
      settingsOverlay.classList.add('hidden');
    });

    test('الفترة المخصصة: مقلوبة أو في المستقبل أو أطول من ٩٣ يوم بتتحفظ صح واسمها يطابق البيانات', function () {
      var today = todayKeyInTz(BROWSER_TZ);
      var apply = function (a, b) { dateFrom.value = a; dateTo.value = b; document.getElementById('periodApply').click(); };
      apply(shiftKey(today, -1), shiftKey(today, -10));
      eq([period.since, period.until], [shiftKey(today, -10), shiftKey(today, -1)], 'swapped');
      eq(periodLabel(), fmtRange(period.since, period.until), 'label in the right order');
      apply(shiftKey(today, -5), shiftKey(today, 400));
      eq(period.until, today, 'no future end date');
      apply(shiftKey(today, -300), today);
      eq(keyDiffDays(period.since, period.until), PERIOD_MAX_DAYS - 1, 'trimmed to 93 days');
      eq(document.getElementById('connectStatus').textContent, t('period.trimmed', { n: ar(PERIOD_MAX_DAYS), date: fmtKey(period.since) }), 'says it was trimmed');
    });

    test('تنبيه على مستوى حساب مالوش اسم معروف بيقول اسم المنصة (مش snapchat:123)', function () {
      var one = ad('z1', { daily: [50, 50, 50, 50, 50, 0, 0], res: steady(2) });
      one.platform = 'Snapchat'; one.source = 'snapchat:9f3c';
      var acct = engine([one]).alerts.filter(function (a) { return !a.adId; })[0];
      ok(acct, 'an account alert');
      eq(acct.accountName, 'Snapchat');
    });

    testAsync('الأداة بتفتح بالإنجليزي من ?lang=en وبتفتكرها', function () {
      var restore = keepStorage(['acc.lang']);
      return toolFrame(800, 600, '&lang=en').then(function (f) {
        var d = f.contentDocument;
        eq([d.documentElement.lang, localStorage.getItem('acc.lang')], ['en', 'en']);
        eq(d.querySelector('[data-view="alerts"] span').textContent, 'Alerts');
        f.remove();
      }).then(restore, function (e) { restore(); throw e; });
    });

    testAsync('بيانات محفوظة بشكل غلط (نسخة قديمة أو إضافة) متوقفش الأداة ولا زرار «فصل»', function () {
      var restore = keepStorage(['acc.lastAccount.v1', 'pauseproof.alertSettings.v1']);
      var oldSession = sessionStorage.getItem('pauseproof.session.v1');
      var done = function () {
        restore();
        if (oldSession == null) sessionStorage.removeItem('pauseproof.session.v1'); else sessionStorage.setItem('pauseproof.session.v1', oldSession);
      };
      localStorage.setItem('acc.lastAccount.v1', '5');
      localStorage.setItem('pauseproof.alertSettings.v1', '[1,2]');
      sessionStorage.setItem('pauseproof.session.v1', JSON.stringify({ tokens: 3, active: ['x'], options: { google: 'not-a-list' }, accountInfo: 7 }));
      return toolFrame(800, 600).then(function (f) {
        var w = f.contentWindow, threw = null;
        try { w.disconnectPlatform('meta'); w.disconnectAll(); } catch (e) { threw = e.message; }
        eq(threw, null, 'disconnect works');
        eq(JSON.stringify(w.alertSettings), '{}', 'bad settings ignored');
        f.remove();
      }).then(done, function (e) { done(); throw e; });
    });

    testAsync('اسم طويل من غير مسافات مبيوسّعش الصفحة على الموبايل (الإعلانات والحملات وشرائح الفلاتر)', function () {
      return toolFrame(360, 780).then(function (f) {
        var w = f.contentWindow, d = f.contentDocument;
        var long = 'Ramadan_Mega_Sale_2026_Retargeting_Lookalike_1pct_Video_15s_Final_v3_'.repeat(3);
        var one = ad('long1', { daily: steady(5), res: steady(1) });
        one.offer = one.headline = long; one.campaignName = one.placement = long; one.campaignId = 'c-long';
        w.candidates = [one];
        w.render();
        // المحتوى مش أعرض من الجزء الظاهر (من غير شريط التمرير)
        var extra = function () { return d.documentElement.scrollWidth - d.documentElement.clientWidth; };
        var widths = { ads: extra() };
        w.setViewMode('campaigns');
        widths.campaigns = extra();
        w.setViewMode('ads');
        w.filters.campaign = w.campaignKey(one); w.filters.campaignName = long; w.filters.text = long;
        w.render();
        widths.filterChips = extra();
        eq(widths, { ads: 0, campaigns: 0, filterChips: 0 }, 'extra width in px');
        f.remove();
      });
    });

    testAsync('أرقام العرض التوضيحي في الرئيسية بصيغة اللغة من أول لحظة', function () {
      var restore = keepStorage(['acc.lang']);
      var f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:0;top:0;width:1000px;height:700px;opacity:0;pointer-events:none';
      f.src = '/home.html?lang=en&t=' + Date.now();
      var loaded = new Promise(function (r) { f.onload = r; });
      document.body.appendChild(f);
      return loaded.then(function () {
        eq(f.contentDocument.querySelector('[data-count]').textContent, '$4,820');
        f.remove();
      }).then(restore, function (e) { restore(); throw e; });
    });
  });

  // ---------- التقرير ----------
  runAsync().then(finish);
  function finish() {
  resetState();
  candidates = []; render();
  window.__restoreStorage();
  var failed = results.filter(function (r) { return !r.ok; });
  window.__tests = { passed: results.length - failed.length, failed: failed.length, failures: failed };
  var html = '<h1>الاختبارات</h1>' +
    '<div class="t-summary ' + (failed.length ? 'fail' : 'pass') + '">' +
    (failed.length ? '✗ ' + failed.length + ' فشل من ' + results.length : '✓ كل الاختبارات نجحت (' + results.length + ')') + '</div>';
  var lastGroup = '';
  results.forEach(function (r) {
    if (r.group !== lastGroup) { html += '<div class="t-group">' + esc(r.group) + '</div>'; lastGroup = r.group; }
    html += '<div class="t-row ' + (r.ok ? 'pass' : 'fail') + '">' + (r.ok ? '✓ ' : '✗ ') + esc(r.name) +
      (r.ok ? '' : '<span class="t-msg">' + esc(r.msg) + '</span>') + '</div>';
  });
  document.getElementById('testReport').innerHTML = html;
  }
})();
