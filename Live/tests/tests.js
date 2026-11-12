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
  // الاختبارات القديمة مبنية على ٧ خانات (٦ أيام مكتملة + النهارده) — المحرك بيحسب الأيام من آخر النافذة فبيشتغل بيها،
  // ونافذة الأداة الحقيقية (٨ خانات = ٧ مكتملة + النهارده) ليها اختبارات لوحدها تحت
  var DAYS = last7Days(TODAY).slice(-7);
  // ملفات المنصات بتعتبر آخر خانة «النهارده» (مبتدخلش الإجماليات — مراجعة ١١ أكتوبر). بيانات الاختبارات على DAYS كلها أيام مكتملة،
  // فبنديها نافذة الأداة الحقيقية (٨ خانات): DAYS وبعدها يوم «النهارده»
  var DAYS_X = DAYS.concat([{ key: shiftKey(TODAY, 1) }]);
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
      reviewStatus: o.review || null, deliveryReason: null, platformStatus: 'ACTIVE', period: null,
      // المرحلة ٥: aid = المجموعة الإعلانية (ق٦ — إعلان جديد فيها)، partial = حالة المجموعة مش مقروءة من المنصة (ق٧)،
      // plat = رقم المنصة جنب رقمنا، baseStore = أساس رقمنا هو طلبات المتجر مش النقر (ر٤٣)،
      // setLearns = المنصة بتوثّق إن إضافة إعلان بترجّع المجموعة لمرحلة التعلّم (Meta)
      adsetId: o.aid || null, statusPartial: !!o.partial, plat: o.plat || null, baseStore: !!o.baseStore,
      setLearns: o.setLearns !== false
    };
    return c;
  }
  function steady(n) { return [n, n, n, n, n, n, n]; }
  // حساب متحدد ليه المستهدف ×٣ وحد الخسارة ×١ (مراجعة الإعدادات ٢٤ أكتوبر: مبقاش ليهم قيمة ابتدائية — حكم الربح بيستنى لحد ما
  // يتحددوا). الاختبارات القديمة مكتوبة على الحالة دي؛ وحالة «من غير مستهدف» ليها اختبارها لوحدها (noGoal: true)
  function engine(ads, meta, settings) {
    var s = settings && settings.noGoal ? {} : Object.assign({ roasTarget: 3 }, settings || {});
    return PauseProofAlerts.analyze(ads, meta || {}, s, ALERT_FMT);
  }
  // حساب فيه إعلانين كويسين عشان يبقى فيه متوسط تكلفة نتيجة
  function baseAccount() {
    return [ad('good1', { daily: steady(100), res: steady(5) }), ad('good2', { daily: steady(100), res: steady(5) })];
  }

  // إعدادات المستخدم في الاختبارات (قرار صاحب المنتج ٢٦ أكتوبر ٢٠٢٦ — سجل واحد للمستخدم): كأن سجله وصل من السيرفر
  function useSettings(all, plat, asked, acct) {
    userSet = normUserSet({ all: all || {}, plat: plat || {}, acct: acct || {}, asked: asked !== false });
    userSetState = 'ready';
  }
  // الحفظ بيروح للسيرفر: الطلب بيتسجّل وبيفضل من غير رد (الاختبار العادي مبيستناش) — restore بيرجّع الدالة وزرار الحفظ
  function captureSaves() {
    var prev = window.syncCall, calls = [];
    window.syncCall = function (b) { calls.push(JSON.parse(JSON.stringify(b))); return new Promise(function () {}); };
    calls.restore = function () { window.syncCall = prev; setSaving(settingsSaveBtn, false, 'settings.save'); setSaving(welcomeSaveBtn, false, 'welcome.save'); settingsOverlay.classList.add('hidden'); };
    calls.last = function () {
      var c = calls[calls.length - 1];
      if (!c || !c.changes) return null;
      if (c.changes.acct) { var k = Object.keys(c.changes.acct)[0]; return k ? c.changes.acct[k] : null; }
      return c.changes.all || null;
    };
    return calls;
  }

  function resetState() {
    candidates = [];
    filters = { platform: 'all', format: 'all', health: 'all', text: '', sort: 'priority' };
    viewMode = 'ads';
    alertSettings = {};
    // إعدادات المستخدم (٢٦ أكتوبر) — كل اختبار بسجل فاضي وصل خلاص (قيم البداية، ونافذة أول مرة اتسألت)، من غير طلبات للسيرفر
    useSettings({});
    migrating = false;
    settingsScope = ''; settingsPending = {}; settingsDirty = false; settingsSaving = false;
    extraInputs = {}; extraAt = {};
    userSetBase = null; userSetGen = 0; userSetInFlight = 0; userSetRefreshing = false; userSetFails = 0;
    welcomeDone = false; welcomeOpen = false; welcomeOverlay.classList.add('hidden');
    period = { preset: 'last7' };
    clearMetaBase();
    // حالة المنصات والحسابات والجلسات — كل اختبار يبدأ من غير أي منصة متصلة
    [activeSources, platformState, sessionTokens, lastAccounts].forEach(function (o) { Object.keys(o).forEach(function (k) { delete o[k]; }); });
    Object.keys(platformOptions).forEach(function (p) { if ((platformOptions[p] || []).length) setPlatformOptions(p, []); });
    Object.keys(loadingPlatforms).forEach(function (p) { loadingPlatforms[p] = false; });
    googleAccessToken = null; snapchatAccessToken = null;
    lastUpdatedAt = null;
    showStopped = false;
    Object.keys(stoppedLoaders).forEach(function (k) { delete stoppedLoaders[k]; });
    dxReset();
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
    // ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦ (المرة التانية): «آخر ٧ أيام» = الـ٧ أيام اللي فاتت بس، والنهارده منفصل
    test('آخر ٣٠ يوم = ٣٠ يوماً مكتملة من غير النهارده', function () {
      period = { preset: 'last30' };
      var r = resolvePeriodFor('UTC');
      eq([keyDiffDays(r.since, r.until) + 1, r.until], [30, shiftKey(today, -1)]);
    });
    test('آخر ٧ أيام = ٧ أيام مكتملة من غير النهارده، ونافذة الإعلانات فيها النهارده لوحده', function () {
      period = { preset: 'last7' };
      var r = resolvePeriodFor('UTC');
      eq([keyDiffDays(r.since, r.until) + 1, r.until, r.isDefault], [7, shiftKey(today, -1), false]);
      var w = last7Days(today);
      eq([w.length, w[0].key, w[6].key, w[7].key], [8, r.since, r.until, today], 'ad window = the 7 days + today');
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
      eq([r.preset, r.isDefault, r.until], ['last7', false, shiftKey(today, -1)]);
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

  // «الأقرب للمتجر» في Snapchat (قرار ٦ أكتوبر ٢٠٢٦): ٧ أيام من السوايب ومن غير المشاهدة، بطلب منفصل جنب رقم المنصة
  describe('أرقام Snapchat — الأقرب للمتجر', function () {
    // آخر خانة (٨ أكتوبر) = «النهارده» — مبتدخلش الإجماليات، والبيانات على الأيام المكتملة قبلها
    var days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map(function (k) { return { key: k }; });
    var M = 1000000;
    var series = function (rows) {
      return [{ timeseries_stat: { breakdown_stats: { ad: Object.keys(rows).map(function (id) {
        return { id: id, timeseries: rows[id].map(function (r) { return { start_time: days[r[0]].key + 'T00:00:00.000+03:00', stats: r[1] }; }) };
      }) } } }];
    };
    var totals = function (rows) {
      return { total_stats: [{ total_stat: { breakdown_stats: { ad: Object.keys(rows).map(function (id) { return { id: id, stats: rows[id] }; }) } } }] };
    };
    var ads = [{ ad: { id: 'a1', name: 'Snap ad 1', status: 'ACTIVE', ad_squad_id: 'sq1' } }];
    var plat = series({ a1: [[5, { spend: 100 * M, swipes: 40, conversion_purchases: 10, conversion_purchases_value: 1000 * M }],
      [6, { spend: 50 * M, swipes: 20, conversion_purchases: 4, conversion_purchases_value: 400 * M }]] });
    var store = series({ a1: [[5, { conversion_purchases: 6, conversion_purchases_value: 600 * M }], [6, { conversion_purchases: 3, conversion_purchases_value: 300 * M }]] });
    var json = function (obj) { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(obj); } }); };

    test('الأرقام الأساسية = «الأقرب للمتجر»، ورقم المنصة جنبها', function () {
      var c = transformSnapchatAds(ads, plat, days, 'SAR', [], [], null, store, null)[0];
      eq([c.results, c.dailySales[5] + c.dailySales[6], c.spend, c.resultKey], [9, 900, 150, 'purchase']);
      eq(c.plat, { results: 14, sales: 1400 });
      var pp = platOf(c);
      eq([pp.results, pp.sales, pp.spend], [14, 1400, 150]);
      // ق٦ لسناب شات: معرّف المجموعة لازم يوصل للمحرك عشان يشوف الإعلان الجديد في نفس المجموعة.
      // وbaseStore = أساس رقمنا طلبات المتجر (ر٤٣)، وsetLearns مش متعيّن: مفيش مقالة رسمية لسناب عن مرحلة التعلّم
      eq([c.adsetId, c.baseStore, !!c.setLearns], ['sq1', true, false]);
    });
    test('نوع نتيجة إعلان Snapchat من هدف مجموعته زي Meta — مش من مشتريات الحساب في آخر ٧ أيام (مراجعة المرحلة ٤ ر٧٧)', function () {
      var two = [{ ad: { id: 'b', name: 'buy', status: 'ACTIVE', ad_squad_id: 'sqB' } }, { ad: { id: 'w', name: 'swipe', status: 'ACTIVE', ad_squad_id: 'sqW' } }];
      var noBuys = series({ b: [[5, { spend: 100 * M, swipes: 40, conversion_purchases: 0 }]], w: [[5, { spend: 50 * M, swipes: 30, conversion_purchases: 0 }]] });
      var squads = [{ id: 'sqB', optimization_goal: 'PIXEL_PURCHASE' }, { id: 'sqW', optimization_goal: 'SWIPES' }];
      // حساب مبيعات وقفت مشترياته أسبوع: إعلان المشتريات بيتحكم عليه بالمشتريات (صفر)، مش بالسوايب
      eq(transformSnapchatAds(two, noBuys, days, 'SAR', squads, [], null, null, null).map(function (c) { return c.resultKey + ':' + c.results; }), ['purchase:0', 'swipe:30']);
      // من غير هدف المجموعة (رد قديم من الخادم): القرار القديم على مستوى الحساب
      eq(transformSnapchatAds(two, noBuys, days, 'SAR', [], [], null, null, null).map(function (c) { return c.resultKey; }), ['swipe', 'swipe']);
    });
    // المرحلة ٤ (دقة الأرقام): ٥٥ إعلان × ٧ أيام بتقريب كل يوم لأقرب سنت طلّعوا إجمالي ٥١٠٫٠٠ وSnapchat ٥٠٩٫٩٨.
    // المبالغ بدقة المايكرو لحد العرض: مجموع الإعلانات = مجموع المنصة نفسه (إلى جزء من المليون)
    test('مبالغ Snapchat بدقتها الكاملة: مجموع الإعلانات = مجموع المنصة (من غير تقريب كل يوم)', function () {
      var rows = {}, three = ['b1', 'b2', 'b3'].map(function (id) { return { ad: { id: id, name: id, status: 'ACTIVE' } }; });
      three.forEach(function (a) { rows[a.ad.id] = [0, 1, 2, 3, 4, 5, 6].map(function (d) { return [d, { spend: 1004999, conversion_purchases: 0, conversion_purchases_value: 2004999 }]; }); });
      var list = transformSnapchatAds(three, series(rows), days, 'USD', [], [], null, null, null);
      var spend = list.reduce(function (s, c) { return s + c.spend; }, 0);
      var exact = 3 * 7 * 1004999 / M;   // ٢١٫١٠٤٩٧٩ — بالتقريب اليومي كانت ٢١٫٠٠
      ok(Math.abs(spend - exact) < 1e-9, 'total spend ' + spend + ' = ' + exact);
      ok(Math.abs(list[0].spend - 7 * 1004999 / M) < 1e-9, 'per ad, no daily rounding');
    });
    // المرحلة ٤ (١٧ أكتوبر ٢٠٢٦): رقم المنصة بيوم ظهور الإعلان (زي Ads Manager) و«الأقرب» بيوم الطلب — الحد الأعلى برقم المنصة
    // كان بيقلّل أرقام صحيحة (حساب حقيقي: إعلان إنفاقه صفر في الفترة، ليه طلب بيوم الطلب وصفر بيوم الظهور)
    test('«الأقرب للمتجر» بيفضل زي ما Snapchat رجّعه حتى لو أكبر من رقم المنصة (أساسين مختلفين)', function () {
      var c = transformSnapchatAds(ads, plat, days, 'SAR', [], [], null, series({ a1: [[5, { conversion_purchases: 12, conversion_purchases_value: 1200 * M }], [4, { conversion_purchases: 1, conversion_purchases_value: 19 * M }]] }), null)[0];
      eq([c.dailyResults[5], c.dailySales[5], c.dailyResults[4], c.dailySales[4], c.dailyResults[6]], [12, 1200, 1, 19, 0]);
      eq([c.results, c.plat.results], [13, 14]);
      var pPlat = totals({ a1: { spend: 0, conversion_purchases: 0, conversion_purchases_value: 0 } });
      var pStore = totals({ a1: { conversion_purchases: 1, conversion_purchases_value: 19 * M } });
      var p = transformSnapchatAds(ads, plat, days, 'SAR', [], [], pPlat, store, pStore)[0].period;
      eq([p.results, p.sales, p.plat.results], [1, 19, 0], 'the period too');
    });
    test('طلب «الأقرب للمتجر» فشل = أرقام المنصة زي الأول ومن غير مقارنة', function () {
      var c = transformSnapchatAds(ads, plat, days, 'SAR', [], [], null, null, null)[0];
      eq([c.results, c.plat, platOf(c)], [14, null, null]);
    });
    test('المحتوى من السيرفر: فيديو بيتعرض فيديو (مش «صورة ثابتة»)، والعنوان ورابط الصفحة الحقيقيين', function () {
      // حساب حقيقي ١١ أكتوبر: كل الإعلانات «صورة ثابتة» ووجهتها «—» حتى إعلانات الفيديو
      var two = [{ ad: { id: 'v1', name: 'SingleVideo-EGC-1', status: 'ACTIVE', creative_id: 'cv' } }, { ad: { id: 'i1', name: 'SingleImage-1', status: 'ACTIVE', creative_id: 'ci' } },
        { ad: { id: 'n1', name: 'No creative', status: 'ACTIVE' } }];
      var crs = { cv: { type: 'WEB_VIEW', headline: 'اطلب الآن', brand: 'Shop', cta: 'ORDER_NOW', mediaId: 'mv', url: 'https://shop.example/p' },
        ci: { type: 'WEB_VIEW', headline: 'Sale', mediaId: 'mi', url: 'javascript:alert(1)' } };
      var med = { mv: { type: 'VIDEO', url: 'https://cdn.example/v.mp4' }, mi: { type: 'IMAGE', url: 'https://cdn.example/i.jpg' } };
      var list = transformSnapchatAds(two, plat, days, 'SAR', [], [], null, store, null, crs, med);
      var v = list[0], i = list[1], n = list[2];
      eq([v.format, v.videoSrc, v.thumbUrl, v.headline, v.caption, v.landing, v.landingKind, v.cta], ['video', 'https://cdn.example/v.mp4', null, 'اطلب الآن', 'اطلب الآن', 'https://shop.example/p', 'website', 'ORDER_NOW']);
      eq([i.format, i.thumbUrl, i.videoSrc, i.landing, i.landingKind], ['image', 'https://cdn.example/i.jpg', null, '—', null], 'image; an unsafe link is dropped');
      eq([n.format, n.thumbUrl, n.headline, n.landing], ['image', null, 'No creative', '—'], 'no creative = as before');
    });
    test('حساب مش بيسجّل مشتريات (النتيجة سوايب): مفيش مقارنة', function () {
      var c = transformSnapchatAds(ads, series({ a1: [[5, { spend: 100 * M, swipes: 40 }]] }), days, 'SAR', [], [], null, series({ a1: [] }), null)[0];
      eq([c.resultKey, c.results, c.plat], ['swipe', 40, null]);
    });
    test('الفترة المختارة: «الأقرب للمتجر» ورقم المنصة جنبه، ولو طلبها فشل رقم المنصة من غير مقارنة', function () {
      var pPlat = totals({ a1: { spend: 300 * M, swipes: 90, conversion_purchases: 20, conversion_purchases_value: 2000 * M } });
      var pStore = totals({ a1: { conversion_purchases: 15, conversion_purchases_value: 1500 * M } });
      var c = transformSnapchatAds(ads, plat, days, 'SAR', [], [], pPlat, store, pStore)[0];
      eq([c.period.results, c.period.sales, c.period.spend], [15, 1500, 300]);
      var pp = platOf(c);
      eq([pp.results, pp.sales, pp.spend], [20, 2000, 300]);
      var c2 = transformSnapchatAds(ads, plat, days, 'SAR', [], [], pPlat, store, null)[0];
      eq([c2.period.results, c2.period.plat, platOf(c2)], [20, undefined, null]);
    });
    test('تفاصيل إعلان Snapchat: جدول الأرقام التلاتة، والكارت رقمه الكبير «الأقرب للمتجر» وتحته رقم المنصة', function () {
      var prev = candidates;
      var c = transformSnapchatAds(ads, plat, days, 'SAR', [], [], null, store, null)[0];
      try {
        candidates = [c];
        render();
        var card = document.getElementById('card-' + c.id);
        var main = Array.prototype.map.call(card.querySelectorAll('.card-stat-v'), function (x) { return x.textContent; }).join(' ');
        ok(main.indexOf(fmtNum(9)) > -1 && main.indexOf(fmtNum(14)) === -1, 'the big number is ours: ' + main);
        ok(card.textContent.indexOf(t('card.plat', { v: fmtNum(14) })) > -1, 'the platform number under it');
        openExpand(c);
        var box = document.querySelector('#expandMetrics .attr-compare');
        ok(box, 'comparison table');
        eq(box.querySelector('.attr-note').textContent, t('cmp.note', { head: t('cmp.head.purchase'), kept: I18N.countPhrase(9, 'order', ar),
          kv: t('cmp.noteValue', { m: money(900, 'SAR') }), gone: I18N.countPhrase(5, 'order', ar), other: t('cmp.other'), gv: t('cmp.noteValue', { m: money(500, 'SAR') }) }));
      } finally {
        expandOverlay.classList.add('hidden');
        candidates = prev;
        render();
      }
    });
    // «٣ أرقام في كل الأداة» (٧ نوفمبر ٢٠٢٦): أرقام فترة المقارنة من نفس طلب الإعلانات على مدى المقارنة ونفس التحويل
    testAsync('Snapchat: أرقام فترة المقارنة لكل إعلان من نفس طلب الإعلانات على مدى المقارنة — من غير المحتوى والوسائط', function () {
      var realFetch = window.fetch, sent = [], trim = false;
      var reply = function (obj) { return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve(JSON.stringify(obj)); }, json: function () { return Promise.resolve(obj); } }); };
      var main = { ads: ads, stats: { timeseries_stats: plat }, storeStats: { timeseries_stats: store },
        periodStats: totals({ a1: { spend: 150 * M, swipes: 30, conversion_purchases: 14, conversion_purchases_value: 1400 * M } }),
        periodStoreStats: totals({ a1: { conversion_purchases: 9, conversion_purchases_value: 900 * M } }),
        squads: [{ id: 'sq1', optimization_goal: 'PIXEL_PURCHASE' }],
        period: { since: days[0].key, until: days[6].key }, range: { since: days[0].key, until: days[7].key }, account: { currency: 'SAR', timezone: 'UTC' } };
      window.fetch = function (url, opts) {
        var body = {};
        try { body = JSON.parse((opts && opts.body) || '{}'); } catch (e) { /* مش JSON */ }
        if (String(url).indexOf('/api/snapchat-ads-fetch') < 0 || body.action !== 'ads') return reply({});
        sent.push(body);
        if (!body.numbersOnly) return reply(main);
        var w = cardCompareRange('UTC');
        return reply(Object.assign({}, main, { period: { since: trim ? shiftKey(w.since, 1) : w.since, until: w.until },
          periodStats: totals({ a1: { spend: 50 * M, swipes: 10, conversion_purchases: 3, conversion_purchases_value: 300 * M } }),
          periodStoreStats: totals({ a1: { conversion_purchases: 2, conversion_purchases_value: 200 * M } }) }));
      };
      sessionTokens.snapchat = { token: 'tok', expiresAt: Date.now() + 3600000 };
      snapchatAccessToken = 'tok';
      loadSnapchatAdsForAccount('acc-c');
      var wait = function () { return tick().then(tick).then(tick).then(tick).then(tick).then(tick); };
      return wait().then(function () {
        var w = cardCompareRange('UTC'), cmpCall = sent.filter(function (b) { return b.numbersOnly; })[0];
        ok(cmpCall, 'a comparison request');
        eq([cmpCall.numbersOnly, cmpCall.period], [true, { preset: 'custom', since: w.since, until: w.until }]);
        var c = candidates.filter(function (x) { return x.source === 'snapchat:acc-c'; })[0], x = cmpOf(c);
        eq([x.state, x.p.spend, x.p.results, x.p.sales, x.p.plat.results], ['ok', 50, 2, 200, 3], 'the same numbers the card would show for that range');
        // السيرفر قص المدى (حد ٩٣ يوم): أرقام مدى تاني مش مقارنة
        trim = true;
        cmpLoaders.snapchat();
        return wait();
      }).then(function () {
        window.fetch = realFetch;
        eq(cmpOf(candidates.filter(function (x) { return x.source === 'snapchat:acc-c'; })[0]).state, 'failed', 'another range = no comparison');
      }, function (e) { window.fetch = realFetch; throw e; });
    });
    test('شرح المقارنة من غير أي كلام تقني', function () {
      ['ar', 'en'].forEach(function (lang) {
        var all = withLang(lang, function () { return ['cmp.note', 'cmp.noteSame', 'cmp.noteZero', 'cmp.noteNone', 'cmp.noteMore', 'cmp.noteMoreNone', 'al.compare', 'diff.source', 'dx.platWhy', 'dx.platWhyAll', 'cmp.noteOwn', 'dx.noPurchases.plat'].map(function (k) { return t(k); }).join(' '); });
        ok(!/نقر|سوايب|مشاهدة|نسب الإحالة|\b(click|clicks|swipe|swipes|view|views|attribution)\b/i.test(all), lang + ': ' + all);
      });
    });
    // صيغة صاحب المنتج: المعتمد الأول (مرفوع) وبعده المستبعد (منصوب)، و«أخرى» من ٣ وطالع بس
    test('جملة الشرح: الأعداد مضبوطة نحوياً، والحالات الأربع', function () {
      withLang('ar', function () {
        var c = { resultKey: 'purchase', currency: null };
        eq(compareNote(c, { results: 1, sales: 0 }, { results: 3, sales: 0 }),
          'الطلبات التي يثبت أنها جاءت من هذا الإعلان طلب واحد فقط، لذلك استبعدنا طلبين مما تنسبه له المنصة، لتكون أرقامك أدق وأقرب لطلبات متجرك.');
        eq(compareNote(c, { results: 40, sales: 0 }, { results: 50, sales: 0 }),
          'الطلبات التي يثبت أنها جاءت من هذا الإعلان ٤٠ طلباً فقط، لذلك استبعدنا ١٠ طلبات أخرى مما تنسبه له المنصة، لتكون أرقامك أدق وأقرب لطلبات متجرك.');
        eq(compareNote({ resultKey: 'conversion', currency: null }, { results: 2, sales: 0 }, { results: 3, sales: 0 }),
          'التحويلات التي يثبت أنها جاءت من هذا الإعلان تحويلان فقط، لذلك استبعدنا تحويلاً واحداً مما تنسبه له المنصة، لتكون أرقامك أدق وأقرب لطلبات متجرك.');
        eq(compareNote(c, { results: 0, sales: 0 }, { results: 4, sales: 0 }),
          'لا يثبت أن هذا الإعلان جلب أي طلبات في هذه الفترة، لذلك استبعدنا ٤ طلبات مما تنسبه له المنصة، لتكون أرقامك أدق وأقرب لطلبات متجرك.');
        eq(compareNote(c, { results: 40, sales: 0 }, { results: 40, sales: 0 }),
          'كل ما تنسبه المنصة لهذا الإعلان (٤٠ طلباً) يثبت أنه جاء منه، فلم نستبعد شيئاً.');
        eq(compareNote(c, { results: 0, sales: 0 }, { results: 0, sales: 0 }), t('cmp.noteNone'));
        // Snapchat (المرحلة ٤): رقمنا أكبر من رقم المنصة — مش «لم نستبعد شيئاً» ولا «لم تنسب المنصة أي نتيجة»
        eq(compareNote(c, { results: 2, sales: 0 }, { results: 1, sales: 0 }),
          'الطلبات التي يثبت أنها جاءت من هذا الإعلان طلبان، وهي أكثر مما تنسبه له المنصة (طلب واحد)، لأن المنصة تحتسب الطلب في يوم عرض الإعلان، ونحتسبه نحن في يوم الطلب نفسه كما يظهر في متجرك.');
        eq(compareNote(c, { results: 1, sales: 20 }, { results: 1, sales: 18 }), 'كل ما تنسبه المنصة لهذا الإعلان (طلب واحد) يثبت أنه جاء منه، فلم نستبعد شيئاً.',
          'same count, different value: no value in the sentence');
        eq(compareNote(c, { results: 1, sales: 0 }, { results: 0, sales: 0 }),
          'الطلبات التي يثبت أنها جاءت من هذا الإعلان طلب واحد، بينما لا تنسب له المنصة شيئاً في هذه الفترة، لأنها تحتسب الطلب في يوم عرض الإعلان، ونحتسبه نحن في يوم الطلب نفسه كما يظهر في متجرك.');
      });
    });

    testAsync('السيرفر: طلب «الأقرب للمتجر» بنوافذ ٧ أيام سوايب ومن غير مشاهدة، ولو رجع بنوافذ تانية بيتجاهل', function () {
      var realFetch = window.fetch, urls = [], echo = '7_DAY';
      window.fetch = function (url) {
        var u = String(url); urls.push(u);
        if (/\/adaccounts\/[^/?]+$/.test(u)) return json({ adaccounts: [{ adaccount: { timezone: 'UTC', currency: 'USD' } }] });
        if (/\/ads\?/.test(u)) return json({ ads: [{ ad: { id: 'a1' } }] });
        if (/\/stats/.test(u) && /view_attribution_window=none/.test(u)) {
          return json({ timeseries_stats: [{ timeseries_stat: { swipe_up_attribution_window: echo, view_attribution_window: 'none', breakdown_stats: { ad: [] } } }] });
        }
        if (/\/stats/.test(u)) return json({ timeseries_stats: [{ timeseries_stat: { breakdown_stats: { ad: [] } } }] });
        return json({});
      };
      var run = function () {
        var out = null;
        var res = { setHeader: function () {}, status: function () { return this; }, json: function (b) { out = b; return this; }, end: function () {} };
        return import('/api/snapchat-ads-fetch.js').then(function (m) {
          return m.default({ method: 'POST', headers: {}, body: { accessToken: 't', action: 'ads', adAccountId: 'acc1' } }, res);
        }).then(function () { return out; });
      };
      return run().then(function (out) {
        var windowed = urls.filter(function (u) { return /view_attribution_window=none/.test(u); });
        // اتنين: النافذة اليومية + مجموع الفترة (آخر ٧ أيام بقت أيام مكتملة بس وبتتجاب لوحدها — ١٠ أكتوبر ٢٠٢٦)
        eq(windowed.length, 2, 'store requests: the daily window and the period total');
        ok(/swipe_up_attribution_window=7_DAY&view_attribution_window=none&action_report_time=conversion/.test(windowed[0]), windowed[0]);
        ok(/fields=conversion_purchases,conversion_purchases_value&/.test(windowed[0]), 'store fields only');
        ok(out.storeStats && out.storeStats.timeseries_stats, 'store stats returned');
        echo = '28_DAY';
        return run();
      }).then(function (out) {
        window.fetch = realFetch;
        eq(out.storeStats, null, 'windows other than what we asked = ignored');
      }, function (e) { window.fetch = realFetch; throw e; });
    });

    // المرحلة ٤ (١٧ أكتوبر ٢٠٢٦): الأداة كانت ٢٨ طلب والشاشة ٢٦ لنفس الحساب والأسبوع — Ads Manager بيوم الظهور وافتراضي الـ API بيوم الشراء
    testAsync('السيرفر: رقم المنصة في Snapchat بإعداد Ads Manager (٢٨ يوم + يوم، بيوم الظهور)، ولو اترفض فبافتراضي الـ API', function () {
      var realFetch = window.fetch, urls = [], rejectPlat = false, rejectFull = false;
      var PLAT = 'swipe_up_attribution_window=28_DAY&view_attribution_window=1_DAY&action_report_time=impression';
      var bad = function () { return Promise.resolve({ ok: false, status: 400, json: function () { return Promise.resolve({ request_status: 'ERROR', debug_message: 'bad param' }); } }); };
      window.fetch = function (url) {
        var u = String(url);
        if (/\/adaccounts\/[^/?]+$/.test(u)) return json({ adaccounts: [{ adaccount: { timezone: 'UTC', currency: 'USD' } }] });
        if (/\/ads\?/.test(u)) return json({ ads: [{ ad: { id: 'a1' } }] });
        if (/\/stats/.test(u)) {
          if (/view_attribution_window=none/.test(u)) return bad();   // «الأقرب للمتجر» مش موضوع الاختبار ده
          if (/fields=spend,conversion_purchases&/.test(u)) return json({ total_stats: [] });   // هدر الشهر — ليه اختبار لوحده
          urls.push(u);
          if (rejectPlat && u.indexOf(PLAT) > -1) return bad();
          if (rejectFull && /conversion_purchases/.test(u)) return bad();
          return json({ timeseries_stats: [{ timeseries_stat: { breakdown_stats: { ad: [{ id: 'a1', timeseries: [] }] } } }],
            total_stats: [{ total_stat: { breakdown_stats: { ad: [{ id: 'a1', stats: { spend: 1000000 } }] } } }] });
        }
        return json({});
      };
      var run = function () {
        var out = null;
        urls = [];
        var res = { setHeader: function () {}, status: function () { return this; }, json: function (b) { out = b; return this; }, end: function () {} };
        return import('/api/snapchat-ads-fetch.js').then(function (m) {
          return m.default({ method: 'POST', headers: {}, body: { accessToken: 't', action: 'ads', adAccountId: 'acc1' } }, res);
        }).then(function () { return out; });
      };
      return run().then(function (out) {
        eq(urls.length, 2, 'platform requests: the days and the period total');
        ok(urls.every(function (u) { return u.indexOf(PLAT) > -1; }), urls.join('\n'));
        ok(out.stats && !out.statsError && out.periodStats, 'numbers returned');
        rejectPlat = true;
        return run();
      }).then(function (out) {
        eq(urls.length, 4, 'each one rejected once, then retried');
        eq(urls.filter(function (u) { return u.indexOf(PLAT) === -1 && /attribution_window/.test(u); }).length, 0, 'the retry has no windows (API default)');
        ok(out.stats && !out.statsError && out.periodStats, 'numbers still load');
        rejectFull = true;
        return run();
      }).then(function (out) {
        window.fetch = realFetch;
        ok(out.stats && !out.statsError, 'an account without purchases: spend and swipes, like before');
        eq(urls.filter(function (u) { return /fields=spend,swipes,impressions&/.test(u); }).length, 2, urls.join('\n'));
      }, function (e) { window.fetch = realFetch; throw e; });
    });

    // حساب حقيقي ١٧ أكتوبر: بعد رقم المنصة بيوم الظهور، إعلان متوقف اتعرض قبل الفترة واتشرى منه جواها اختفى، و«الأقرب» بقى ١٣ بدل ١٤
    testAsync('السيرفر: طلب أرقام فترة المقارنة (numbersOnly) من غير المحتوى والوسائط — والطلب العادي بيهم', function () {
      var realFetch = window.fetch, urls = [];
      window.fetch = function (url) {
        var u = String(url);
        urls.push(u);
        if (/\/adaccounts\/[^/?]+$/.test(u)) return json({ adaccounts: [{ adaccount: { timezone: 'UTC', currency: 'USD' } }] });
        return json({});
      };
      var run = function (lean) {
        urls = [];
        var res = { setHeader: function () {}, status: function () { return this; }, json: function () { return this; }, end: function () {} };
        return import('/api/snapchat-ads-fetch.js').then(function (m) {
          return m.default({ method: 'POST', headers: {}, body: { accessToken: 't', action: 'ads', adAccountId: 'acc1', numbersOnly: lean, period: { preset: 'custom', since: '2026-09-01', until: '2026-09-07' } } }, res);
        }).then(function () { return urls.filter(function (u) { return /\/(creatives|media)\b/.test(u); }).length; });
      };
      return run(true).then(function (n) {
        eq(n, 0, 'numbers only: no creatives or media');
        return run(false);
      }).then(function (n) {
        window.fetch = realFetch;
        ok(n >= 2, 'the normal request fetches them: ' + n);
      }, function (e) { window.fetch = realFetch; throw e; });
    });
    testAsync('السيرفر: إعلان متوقف ليه طلبات في «الأقرب للمتجر» بس (مش في أرقام المنصة) بيفضل في القائمة', function () {
      var realFetch = window.fetch;
      var withAds = function (ids, pur) { return { breakdown_stats: { ad: ids.map(function (id) {
        var st = { conversion_purchases: (pur && pur[id]) || 0 };
        return { id: id, timeseries: [{ start_time: '2026-10-05T00:00:00.000Z', stats: st }], stats: st };
      }) } }; };
      window.fetch = function (url) {
        var u = String(url);
        if (/\/adaccounts\/[^/?]+$/.test(u)) return json({ adaccounts: [{ adaccount: { timezone: 'UTC', currency: 'USD' } }] });
        if (/\/ads\?/.test(u)) return json({ ads: [{ ad: { id: 'live', status: 'ACTIVE', delivery_status: ['VALID'] } }, { ad: { id: 'old', status: 'PAUSED' } },
          { ad: { id: 'zero', status: 'PAUSED' } }, { ad: { id: 'gone', status: 'PAUSED' } }] });
        if (/\/stats/.test(u) && /view_attribution_window=none/.test(u)) {
          // Snapchat بيرجّع كمان إعلانات أرقامها صفر في الطلب ده (حساب حقيقي ١٧ أكتوبر) — دي مبتتضافش
          var st = Object.assign({ swipe_up_attribution_window: '7_DAY', view_attribution_window: 'none' }, withAds(['old', 'zero'], { old: 1 }));
          return json({ timeseries_stats: [{ timeseries_stat: st }], total_stats: [{ total_stat: st }] });
        }
        if (/\/stats/.test(u)) return json({ timeseries_stats: [{ timeseries_stat: withAds(['live']) }], total_stats: [{ total_stat: withAds(['live']) }] });
        return json({});
      };
      var out = null;
      var res = { setHeader: function () {}, status: function () { return this; }, json: function (b) { out = b; return this; }, end: function () {} };
      return import('/api/snapchat-ads-fetch.js').then(function (m) {
        return m.default({ method: 'POST', headers: {}, body: { accessToken: 't', action: 'ads', adAccountId: 'acc1' } }, res);
      }).then(function () {
        window.fetch = realFetch;
        eq(out.ads.map(function (a) { return a.id; }), ['live', 'old'], 'the stopped ad with store orders stays; all-zero and absent ones are dropped');
      }, function (e) { window.fetch = realFetch; throw e; });
    });

    // التدقيق الشامل ١١ نوفمبر ٢٠٢٦ (ن٣٠): عطل عابر في أول طلب (503، شبكة، حد السرعة) كان بيقلب الملخص كله لأرقام المنصة كأن Snapchat
    // رفض نوافذ «الأقرب للمتجر»
    testAsync('السيرفر: عطل عابر في أول طلب لملخص Snapchat بيتعاد مرة، والملخص بيفضل على «الأقرب للمتجر»', function () {
      var realFetch = window.fetch, urls = [], failed = 0;
      var st = { spend: 50000000, impressions: 1000, swipes: 30, conversion_purchases: 3, conversion_purchases_value: 300000000 };
      window.fetch = function (url) {
        var u = String(url);
        if (/\/adaccounts\/[^/?]+$/.test(u)) return json({ adaccounts: [{ adaccount: { timezone: 'Asia/Riyadh', currency: 'SAR' } }] });
        if (/\/campaigns\?/.test(u)) return json({ campaigns: [] });
        if (/\/stats/.test(u)) {
          urls.push(u);
          if (!failed && /view_attribution_window=none/.test(u)) {
            failed++;
            return Promise.resolve({ ok: false, status: 503, json: function () { return Promise.resolve({ request_status: 'ERROR', debug_message: 'try later' }); } });
          }
          if (/granularity=TOTAL/.test(u)) return json({ total_stats: [{ total_stat: { breakdown_stats: { campaign: [{ id: 'c1', stats: st }] }, dimension_stats: [] } }] });
          var from = decodeURIComponent((u.match(/start_time=([^&]+)/) || [])[1] || '').slice(0, 10);
          var to = decodeURIComponent((u.match(/end_time=([^&]+)/) || [])[1] || '').slice(0, 10);
          var inRange = '2026-09-25' >= from && '2026-09-25' < to;
          return json({ timeseries_stats: [{ timeseries_stat: { breakdown_stats: { campaign: [{ id: 'c1', timeseries: inRange ? [{ start_time: '2026-09-25T00:00:00.000+03:00', stats: st }] : [] }] } } }] });
        }
        return json({});
      };
      var out = null, keep = null;
      var res = { setHeader: function () {}, status: function () { return this; }, json: function (b) { out = b; return this; }, end: function () {} };
      var ws = DX.windows('2026-09-21', '2026-09-27');
      return import('/api/snapchat-ads-fetch.js').then(function (m) {
        keep = m.CHANGE_TIMING.retry;
        m.CHANGE_TIMING.retry = 0;
        var back = function () { m.CHANGE_TIMING.retry = keep; };
        return m.default({ method: 'POST', headers: {}, body: { accessToken: 't', action: 'diagnosis', adAccountId: 'acc1',
          daily: { since: ws[ws.length - 1].since, until: '2026-09-27' }, windows: ws.slice(0, 3).map(function (w) { return { since: w.since, until: w.until }; }) } }, res)
          .then(back, function (e) { back(); throw e; });
      }).then(function () {
        window.fetch = realFetch;
        eq(failed, 1, 'the first request failed once');
        eq(out.numbers, 'store', 'still the closest-to-store numbers');
        eq(urls.filter(function (u) { return /action_report_time=impression/.test(u) && /granularity=DAY/.test(u); }).length, 0, 'no day request with the platform windows');
        eq(out.daily.filter(function (d) { return d.date === '2026-09-25'; })[0].pur, 3);
      }, function (e) { window.fetch = realFetch; throw e; });
    });

    testAsync('السيرفر: ملخص المتجر على «الأقرب للمتجر»، ولو Snapchat رفض النوافذ بيكمّل كله بنوافذ المنصة', function () {
      // reject: '' = مفيش رفض، 'store' = نوافذ «الأقرب» بس، 'all' = أي نوافذ (حتى إعداد Ads Manager)، 'country' = أي نوافذ مع الدول بس
      var realFetch = window.fetch, urls = [], reject = '';
      var st = { spend: 50000000, impressions: 1000, swipes: 30, conversion_purchases: 3, conversion_purchases_value: 300000000 };
      window.fetch = function (url) {
        var u = String(url);
        if (/\/adaccounts\/[^/?]+$/.test(u)) return json({ adaccounts: [{ adaccount: { timezone: 'Asia/Riyadh', currency: 'SAR' } }] });
        if (/\/campaigns\?/.test(u)) return json({ campaigns: [] });
        if (/\/stats/.test(u)) {
          urls.push(u);
          if ((reject === 'store' && /view_attribution_window=none/.test(u)) || (reject === 'all' && /swipe_up_attribution_window/.test(u)) ||
            (reject === 'country' && /report_dimension=country/.test(u) && /swipe_up_attribution_window/.test(u)) ||
            (reject === 'campTotal' && /granularity=TOTAL/.test(u) && /breakdown=campaign/.test(u) && /view_attribution_window=none/.test(u))) {
            return Promise.resolve({ ok: false, status: 400, json: function () { return Promise.resolve({ request_status: 'ERROR', debug_message: 'bad param' }); } });
          }
          var from = decodeURIComponent((u.match(/start_time=([^&]+)/) || [])[1] || '').slice(0, 10);
          var to = decodeURIComponent((u.match(/end_time=([^&]+)/) || [])[1] || '').slice(0, 10);
          var inRange = /granularity=DAY/.test(u) && '2026-09-25' >= from && '2026-09-25' < to;
          // رقم المنصة للفترة (الحساب كله بإعداد Ads Manager — طلب واحد TOTAL بنوافذ المنصة)
          if (/granularity=TOTAL/.test(u) && /action_report_time=impression/.test(u)) return json({ total_stats: [{ total_stat: { breakdown_stats: { campaign: [{ id: 'c1', stats: { conversion_purchases: 5, conversion_purchases_value: 500000000 } }, { id: 'c2', stats: { conversion_purchases: 2, conversion_purchases_value: 100000000 } }] } } }] });
          return json({ timeseries_stats: [{ timeseries_stat: { timeseries: inRange ? [{ start_time: '2026-09-25T00:00:00.000+03:00', stats: st }] : [] } }], total_stats: [] });
        }
        return json({});
      };
      var ws = DX.windows('2026-09-21', '2026-09-27');
      var run = function () {
        var out = null;
        urls = [];
        var res = { setHeader: function () {}, status: function () { return this; }, json: function (b) { out = b; return this; }, end: function () {} };
        return import('/api/snapchat-ads-fetch.js').then(function (m) {
          return m.default({ method: 'POST', headers: {}, body: { accessToken: 't', action: 'diagnosis', adAccountId: 'acc1',
            daily: { since: ws[ws.length - 1].since, until: '2026-09-27' }, windows: ws.slice(0, 3).map(function (w) { return { since: w.since, until: w.until }; }) } }, res);
        }).then(function () { return out; });
      };
      var windowed = function () { return urls.filter(function (u) { return /swipe_up_attribution_window=7_DAY&view_attribution_window=none/.test(u); }).length; };
      var platWin = function () { return urls.filter(function (u) { return /swipe_up_attribution_window=28_DAY&view_attribution_window=1_DAY&action_report_time=impression/.test(u); }).length; };
      return run().then(function (out) {
        eq([windowed(), platWin()], [urls.length - 1, 1], 'every summary request uses the store windows, plus one for the platform number');
        ok(urls.filter(function (u) { return /action_report_time=impression/.test(u); })[0].indexOf('granularity=TOTAL') > -1, 'one total for the period');
        eq([out.numbers, out.plat], ['store', { pur: 7, rev: 600 }], 'the whole account, as in Ads Manager');
        eq(out.daily.filter(function (d) { return d.date === '2026-09-25'; })[0].pur, 3);
        reject = 'store';
        return run();
      }).then(function (out) {
        eq(windowed(), 1, 'one rejected try');
        eq(platWin(), urls.length - 1, 'then the platform numbers as in Ads Manager (like the ad cards) for everything');
        eq([out.numbers, out.plat], ['platform', null], 'the summary is already the platform numbers: no extra request');
        eq(out.daily.filter(function (d) { return d.date === '2026-09-25'; })[0].pur, 3, 'the summary still works');
        reject = 'all';
        return run();
      }).then(function (out) {
        eq([windowed(), platWin()], [1, 1], 'one try each, then the API default for everything');
        eq(out.daily.filter(function (d) { return d.date === '2026-09-25'; })[0].pur, 3, 'the summary still works');
        // فحص حي ٨ نوفمبر ٢٠٢٦: طلب الدول بيرفض النوافذ — كان بيقلب الأساس لحملات فترات المقارنة اللي بعده
        reject = 'country';
        return run();
      }).then(function (out) {
        var camp = urls.filter(function (u) { return /breakdown=campaign/.test(u) && /granularity=TOTAL/.test(u) && !/action_report_time=impression/.test(u); });
        ok(camp.length === 3 && camp.every(function (u) { return /swipe_up_attribution_window=7_DAY&view_attribution_window=none/.test(u); }), 'every period of campaigns stays on the store windows: ' + camp.length);
        eq([out.numbers, out.plat, out.dims.some(function (d) { return d.id === 'country'; })], ['store', { pur: 7, rev: 600 }, false], 'countries on another basis are left out, not mixed in');
        eq(urls.filter(function (u) { return /report_dimension=country/.test(u) && !/swipe_up_attribution_window/.test(u); }).length, 0, 'no retry of the countries without windows (or without purchases)');
        // الحملات نفسها اترفضت: مفيش تقسيم حملات، مش حملات من غير طلبات
        reject = 'campTotal';
        return run();
      }).then(function (out) {
        window.fetch = realFetch;
        var plain = urls.filter(function (u) { return /breakdown=campaign/.test(u) && /granularity=TOTAL/.test(u) && !/swipe_up_attribution_window/.test(u); });
        eq([plain.length, out.dims.some(function (d) { return d.id === 'campaign'; }), out.numbers], [0, false, 'store'], 'campaigns on another basis or without purchases are left out');
      }, function (e) { window.fetch = realFetch; throw e; });
    });
  });

  // TikTok: نفس التوحيد (٣ نوفمبر ٢٠٢٦) — adgroup_id مطلوب أصلاً في حقول الطلب (api/tiktok-ads-fetch.js adFields)
  describe('TikTok — المجموعة الإعلانية', function () {
    test('رقم المجموعة واسمها بيتوحّدوا على adsetId وadsetName', function () {
      var rows = [{ ad_id: '9', ad_name: 'T', campaign_id: '3', campaign_name: 'C', adgroup_id: '77', adgroup_name: 'AG',
        operation_status: 'ENABLE', ad_format: 'SINGLE_VIDEO' }];
      var c = transformTikTokAds(rows, [], DAYS_X, 'SAR', null)[0];
      eq([c.adsetId, c.adsetName, c.campaignId], ['77', 'AG', '3']);
    });
  });

  // «الأقرب للمتجر» في Google (قرار ٦ أكتوبر ٢٠٢٦): التحويلات بعد نقرة على الإعلان وخلال ٧ أيام منها، جنب رقم المنصة
  describe('أرقام Google — الأقرب للمتجر', function () {
    var M = 1000000;
    var adRows = [{ adGroup: { id: '7', name: 'AG', status: 'ENABLED' }, adGroupAd: { ad: { id: '9', name: 'Search ad' }, status: 'ENABLED' }, campaign: { id: '3', name: 'Search', status: 'ENABLED' } }];
    var who = { adGroup: { id: '7' }, adGroupAd: { ad: { id: '9' } } };
    var day = function (i, m) { return Object.assign({ segments: { date: KEYS[i] }, metrics: m }, who); };
    var plat = [day(5, { costMicros: String(100 * M), conversions: 10, conversionsValue: 1000 }), day(6, { costMicros: String(50 * M), conversions: 4, conversionsValue: 400 })];
    var store = [day(5, { conversions: 6, conversionsValue: 600 }), day(6, { conversions: 3, conversionsValue: 300 })];
    var json = function (obj) { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(obj); } }); };

    test('الأرقام الأساسية = «الأقرب للمتجر»، ورقم المنصة جنبها', function () {
      var c = transformGoogleRows(adRows, plat, DAYS_X, 'SAR', null, store, null)[0];
      // توحيد المستوى الأوسط (٣ نوفمبر ٢٠٢٦): Google تسمّيها adGroup — بتتوحّد على adsetId زي Meta وSnapchat،
      // وadGroupId بيفضل زي ما هو لأن رابط Google Ads نفسه بيستعمله
      eq([c.adsetId, c.adGroupId, c.adsetName], ['7', '7', 'AG'], 'the ad group is adsetId too');
      eq([c.results, c.dailySales[5] + c.dailySales[6], c.spend, c.resultKey], [9, 900, 150, 'conversion']);
      eq(c.plat, { results: 14, sales: 1400 });
      var pp = platOf(c);
      eq([pp.results, pp.sales, pp.spend], [14, 1400, 150]);
    });
    test('«الأقرب للمتجر» مبيطلعش أكبر من رقم المنصة، والكسور بتتجمع قبل التقريب', function () {
      var c = transformGoogleRows(adRows, plat, DAYS_X, 'SAR', null, [day(5, { conversions: 12, conversionsValue: 1200 }), day(6, { conversions: 0.6, conversionsValue: 60 })], null)[0];
      eq([c.dailyResults[5], c.dailySales[5], c.dailyResults[6], c.results], [10, 1000, 1, 11]);
    });
    test('طلب «الأقرب للمتجر» فشل = أرقام المنصة زي الأول ومن غير مقارنة', function () {
      var c = transformGoogleRows(adRows, plat, DAYS_X, 'SAR', null, null, null)[0];
      eq([c.results, c.plat, platOf(c)], [14, null, null]);
    });
    test('الفترة المختارة: «الأقرب للمتجر» ورقم المنصة جنبه، ولو طلبها فشل رقم المنصة من غير مقارنة', function () {
      var pPlat = [Object.assign({ metrics: { costMicros: String(300 * M), conversions: 20, conversionsValue: 2000 } }, who)];
      var pStore = [Object.assign({ metrics: { conversions: 15, conversionsValue: 1500 } }, who)];
      var c = transformGoogleRows(adRows, plat, DAYS_X, 'SAR', pPlat, store, pStore)[0];
      eq([c.period.results, c.period.sales, c.period.spend], [15, 1500, 300]);
      var pp = platOf(c);
      eq([pp.results, pp.sales], [20, 2000]);
      var c2 = transformGoogleRows(adRows, plat, DAYS_X, 'SAR', pPlat, store, null)[0];
      eq([c2.period.results, c2.period.plat, platOf(c2)], [20, undefined, null]);
    });
    test('حملات Performance Max: نفس المقارنة', function () {
      var camp = { id: '21', name: 'PMax', status: 'ENABLED', primaryStatus: 'ELIGIBLE' };
      var rows = [{ campaign: camp, segments: { date: KEYS[5] }, metrics: { costMicros: String(80 * M), conversions: 8, conversionsValue: 800 } }];
      var p = transformGooglePmax(rows, null, DAYS_X, 'SAR', [{ campaign: { id: '21' }, segments: { date: KEYS[5] }, metrics: { conversions: 5, conversionsValue: 500 } }], null)[0];
      eq([p.results, p.dailySales[5], p.plat], [5, 500, { results: 8, sales: 800 }]);
      eq(transformGooglePmax(rows, null, DAYS_X, 'SAR', null, null)[0].plat, null);
    });

    // عدد الطلبات صحيح دايماً (قرار ٦ أكتوبر ٢٠٢٦): Google بيرجّع كسور، والأداة بتقسم الإجمالي المقرّب على الإعلانات والأيام
    var adN = function (i) { return { adGroup: { id: 'g' + i, name: 'AG', status: 'ENABLED' }, adGroupAd: { ad: { id: String(i), name: 'Ad ' + i }, status: 'ENABLED' }, campaign: { id: '3', name: 'S', status: 'ENABLED' } }; };
    var rowN = function (i, d, conv) { return { adGroup: { id: 'g' + i }, adGroupAd: { ad: { id: String(i) } }, segments: { date: KEYS[d] }, metrics: { costMicros: String(10 * M), conversions: conv, conversionsValue: conv * 100 } }; };
    test('الطلبات أعداد صحيحة: الكسور مبتضيعش من إجمالي الحساب', function () {
      eq(wholeShares([0.4, 0.4, 0.4], 1), [1, 0, 0]);
      eq(wholeShares([0.45, 0.55], 1, [0, 1]), [0, 1], 'the cap is respected');
      var ids = []; for (var i = 0; i < 30; i++) ids.push(i);
      var list = googleWholeOrders(transformGoogleRows(ids.map(adN), ids.map(function (i) { return rowN(i, 5, 0.4); }), DAYS_X, 'SAR', null, null, null));
      var total = list.reduce(function (s, c) { return s + c.results; }, 0);
      eq(total, 12, '30 × 0.4 = 12 orders, not 0');
      ok(list.every(function (c) { return c.results === Math.floor(c.results) && c._raw === undefined; }), 'whole numbers, raw values removed');
      ok(list.every(function (c) { return c.dailyResults.reduce(function (a, b) { return a + b; }, 0) === c.results; }), 'days add up to the ad');
    });
    test('أيام الإعلان مجموعها = إجمالي الإعلان، و«الأقرب للمتجر» مبيعدّيش رقم المنصة بعد التقريب', function () {
      var days7 = [0, 1, 2, 3, 4, 5, 6].map(function (d) { return rowN(1, d, 0.4); });
      var one = googleWholeOrders(transformGoogleRows([adN(1)], days7, DAYS_X, 'SAR', null, null, null))[0];
      eq([one.results, one.dailyResults.reduce(function (a, b) { return a + b; }, 0)], [3, 3], '7 × 0.4 → 3, not 0 per day');
      var pl = [rowN(1, 5, 0.45), rowN(2, 5, 0.55)];
      var st = [rowN(1, 5, 0.45), rowN(2, 5, 0.3)];
      var two = googleWholeOrders(transformGoogleRows([adN(1), adN(2)], pl, DAYS_X, 'SAR', null, st, null));
      eq(two.map(function (c) { return [c.plat.results, c.results]; }), [[0, 0], [1, 1]]);
      ok(two.every(function (c) { return c.results <= c.plat.results; }), 'ours never above the platform');
      eq(two[1].cpr, 10, 'cost per order from the whole number');
    });
    testAsync('ملخص المتجر (السيرفر): الطلبات أعداد صحيحة في الأيام والتقسيمات', function () {
      return import('/api/_dx.js').then(function (m) {
        var daily = [{ date: '2026-09-21', pur: 0.4 }, { date: '2026-09-22', pur: 0.4 }, { date: '2026-09-23', pur: 0.4 }];
        var dims = [{ id: 'campaign', segs: [{ key: 'a', w: [{ pur: 2.6 }, { pur: 0.3 }, null] }, { key: 'b', w: [{ pur: 1.6 }, { pur: 0.3 }, null] }] }];
        m.wholeCounts(daily, dims, ['pur']);
        eq(daily.map(function (d) { return d.pur; }), [0, 1, 0], 'running total 0.4 / 0.8 / 1.2 → 0 / 1 / 1');
        eq(dims[0].segs.map(function (s) { return s.w[0].pur; }), [3, 1], '2.6 + 1.6 = 4.2 → 4');
        eq(dims[0].segs.map(function (s) { return s.w[1].pur; }), [1, 0], '0.6 → 1');
        eq(dims[0].segs[0].w[2], null);
      });
    });

    // المرحلة ٣، أ٤ (OWASP ASVS — الفشل الآمن): لو Google مردّتش على سؤال «الرمز ده لتطبيقنا؟» الطلب بيترفض (٥٠٢) —
    // قبل كده كان بيعدّي من غير تحقق. ومحدش بيحفظ الفشل ده: أول ما Google ترد الرمز نفسه بيتقبل
    testAsync('التحقق من رمز Google: تعذّر سؤال Google = رفض مؤقت (٥٠٢) مش تمرير، والمحاولة الجاية بتتحقق من الأول', function () {
      var realFetch = window.fetch, hadProcess = 'process' in window, prevProcess = window.process, down = true, asked = 0;
      window.process = { env: { GOOGLE_CLIENT_ID: 'cid' } };
      window.fetch = function (url) {
        if (String(url).indexOf('tokeninfo') > -1) {
          asked++;
          if (down) return Promise.reject(new TypeError('Failed to fetch'));
          return json({ aud: 'cid', scope: 'https://www.googleapis.com/auth/adwords' });
        }
        return realFetch.apply(window, arguments);
      };
      var restore = function () { window.fetch = realFetch; if (hadProcess) window.process = prevProcess; else delete window.process; };
      var token = 'tok-net-' + Date.now(), status = null, body = null;
      var res = { status: function (s) { status = s; return this; }, json: function (b) { body = b; return this; } };
      return import('/api/_verify.js').then(function (v) {
        return v.verifyGoogleToken(token).then(function (r) {
          eq([r.ok, r.code], [false, 'NETWORK'], 'Google unreachable = not verified');
          v.sendVerifyFailure(res, r);
          eq([status, body.code], [502, 'NETWORK']);
          down = false;
          return v.verifyGoogleToken(token);
        }).then(function (r) {
          eq([r.ok, asked], [true, 2], 'the failure was not cached');
        });
      }).then(restore, function (e) { restore(); throw e; });
    });
    // مراجعة المرحلة ٣ العميقة: خطأ عند Google نفسها (٥٠٣) أو حد الطلبات (٤٢٩) مش «رمز غلط» — قبل كده كان بيتقري «الجلسة
    // انتهت» (٤٠١ AUTH فالعميل بيتطلب منه يربط تاني) وبيتحفظ ٥ دقايق. الرمز الغلط فعلاً (٤٠٠ من Google) بيفضل «الجلسة انتهت»
    testAsync('التحقق من رمز Google: ٥٠٣ و٤٢٩ من Google = رفض مؤقت مش «الجلسة انتهت»، و٤٠٠ = الجلسة انتهت', function () {
      var realFetch = window.fetch, hadProcess = 'process' in window, prevProcess = window.process, status = 503, asked = 0;
      window.process = { env: { GOOGLE_CLIENT_ID: 'cid' } };
      window.fetch = function (url) {
        if (String(url).indexOf('tokeninfo') > -1) {
          asked++;
          if (status === 200) return json({ aud: 'cid', scope: 'https://www.googleapis.com/auth/adwords' });
          return Promise.resolve({ ok: false, status: status, json: function () { return Promise.resolve({ error: 'x' }); } });
        }
        return realFetch.apply(window, arguments);
      };
      var restore = function () { window.fetch = realFetch; if (hadProcess) window.process = prevProcess; else delete window.process; };
      var token = 'tok-5xx-' + Date.now();
      return import('/api/_verify.js').then(function (v) {
        return v.verifyGoogleToken(token).then(function (r) {
          eq([r.ok, r.code, !!r.auth], [false, 'NETWORK', false], '503 = temporary');
          status = 429;
          return v.verifyGoogleToken(token);
        }).then(function (r) {
          eq([r.code, !!r.auth, asked], ['NETWORK', false, 2], '429 = temporary, and the 503 was not cached');
          status = 200;
          return v.verifyGoogleToken(token);
        }).then(function (r) {
          eq(r.ok, true, 'Google back = accepted');
          status = 400;
          return v.verifyGoogleToken('tok-bad-' + Date.now());
        }).then(function (r) {
          eq([r.ok, !!r.auth], [false, true], 'a really invalid token = session expired');
        });
      }).then(restore, function (e) { restore(); throw e; });
    });

    testAsync('السيرفر: استعلامات «الأقرب للمتجر» بالنقرة وخلال ٧ أيام، وأي صف بنوع تاني بيتشال، وفشلها مبيوقفش الإعلانات', function () {
      var realFetch = window.fetch, hadProcess = 'process' in window, prevProcess = window.process, queries = [], failStore = false;
      window.process = { env: { GOOGLE_CLIENT_ID: 'cid' } };
      var rows = function (results) { return json([{ results: results }]); };
      window.fetch = function (url, opts) {
        var u = String(url);
        if (u.indexOf('tokeninfo') > -1) return json({ aud: 'cid', scope: 'https://www.googleapis.com/auth/adwords' });
        var q = JSON.parse(opts.body).query;
        queries.push(q);
        if (q.indexOf('conversion_attribution_event_type') > -1) {
          if (failStore) return Promise.resolve({ ok: false, status: 400, json: function () { return Promise.resolve({ error: { message: 'bad' } }); } });
          return rows([
            Object.assign({ segments: { date: KEYS[5], conversionAttributionEventType: 'INTERACTION', conversionLagBucket: 'LESS_THAN_ONE_DAY' }, metrics: { conversions: 6, conversionsValue: 600 } }, who),
            Object.assign({ segments: { date: KEYS[5], conversionAttributionEventType: 'ENGAGED_VIEW', conversionLagBucket: 'LESS_THAN_ONE_DAY' }, metrics: { conversions: 4, conversionsValue: 400 } }, who)
          ]);
        }
        if (q.indexOf('ad_group_ad.ad.name') > -1) return rows(adRows);
        if (q.indexOf('FROM ad_group_ad') > -1) return rows(plat);
        return rows([]);
      };
      var restore = function () { window.fetch = realFetch; if (hadProcess) window.process = prevProcess; else delete window.process; };
      var run = function () {
        var out = null;
        queries = [];
        var res = { setHeader: function () {}, status: function () { return this; }, json: function (b) { out = b; return this; }, end: function () {} };
        return import('/api/google-ads-fetch.js').then(function (m) {
          return m.default({ method: 'POST', headers: {}, body: { accessToken: 'tok-store', customerId: '1234567890' } }, res);
        }).then(function () { return out; });
      };
      return run().then(function (out) {
        var storeQ = queries.filter(function (x) { return x.indexOf('conversion_attribution_event_type') > -1; });
        // ستة: الإعلانات وPMax للنافذة اليومية، ونفسهم لمجموع الفترة (آخر ٧ أيام بتتجاب لوحدها من ١٠ أكتوبر ٢٠٢٦)، ونفسهم
        // للفترة يوم بيوم (٣ نوفمبر ٢٠٢٦ — تقييم الإعلان والحملة على أيام الفترة)
        eq(storeQ.length, 6, 'ads + PMax for the daily window, for the period total and for the period day by day');
        eq(storeQ.filter(function (x) { return /FROM ad_group_ad/.test(x) && /segments.date, segments.conversion_attribution_event_type/.test(x); }).length, 2, 'ads: the week and the period by day');
        eq(storeQ.filter(function (x) { return /FROM campaign/.test(x) && /segments.date, segments.conversion_attribution_event_type/.test(x); }).length, 2, 'PMax: the week and the period by day');
        // وأرقام المنصة لحملات PMax يوم بيوم للنافذة وللفترة
        eq(queries.filter(function (x) { return /FROM campaign/.test(x) && x.indexOf('conversion_attribution_event_type') < 0 && /segments\.date,/.test(x); }).length, 2, 'PMax platform rows by day: week and period');
        ok(storeQ.every(function (x) {
          return x.indexOf("segments.conversion_attribution_event_type = 'INTERACTION'") > -1 && x.indexOf("'SIX_TO_SEVEN_DAYS')") > -1 &&
            x.indexOf('SEVEN_TO_EIGHT') < 0 && x.indexOf('metrics.cost_micros') < 0;
        }), storeQ[0]);
        eq(out.storeMetrics.length, 1, 'the engaged-view row is dropped');
        eq(out.storeMetrics[0].metrics.conversions, 6);
        failStore = true;
        return run();
      }).then(function (out) {
        restore();
        eq([out.ads.length, out.storeMetrics, out.storePmax], [1, null, null], 'ads still load, no comparison');
      }, function (e) { restore(); throw e; });
    });

    // التدقيق الشامل ١١ نوفمبر ٢٠٢٦ (ن٢٩): خطأ Google نفسه بيرجع بنصه ورمزه (الأداة بتشرحه)، وأي خطأ داخلي غير متوقع من غير نصه في الرد —
    // الملفين دول كانوا بيرجّعوا نص الخطأ الداخلي، وباقي ملفات الخادم رسالة عامة (OWASP ASVS 7.4.1)
    testAsync('السيرفر — Google: خطأ Google بيرجع بنصه وحالته، والخطأ الداخلي غير المتوقع رسالة عامة من غير تفاصيل', function () {
      var realFetch = window.fetch, hadProcess = 'process' in window, prevProcess = window.process, mode = 'google';
      window.process = { env: { GOOGLE_CLIENT_ID: 'cid' } };
      window.fetch = function (url) {
        var u = String(url);
        if (u.indexOf('tokeninfo') > -1) return json({ aud: 'cid', scope: 'https://www.googleapis.com/auth/adwords' });
        if (mode === 'google') {
          return Promise.resolve({ ok: false, status: 403, json: function () {
            return Promise.resolve({ error: { message: 'The caller does not have permission', details: [{ errors: [{ message: 'no access to customer', errorCode: { authorizationError: 'USER_PERMISSION_DENIED' } }] }] } });
          } });
        }
        // رد غريب من غير json(): الدالة نفسها بتقع (خطأ داخلي مش من Google)
        return Promise.resolve({ ok: true, status: 200 });
      };
      var restore = function () { window.fetch = realFetch; if (hadProcess) window.process = prevProcess; else delete window.process; };
      var call = function (path, body) {
        var out = null, code = null;
        var res = { setHeader: function () {}, status: function (s) { code = s; return this; }, json: function (b) { out = b; return this; }, end: function () {} };
        return import(path).then(function (m) { return m.default({ method: 'POST', headers: {}, body: body }, res); }).then(function () { return { code: code, out: out }; });
      };
      var ws = DX.windows('2026-09-21', '2026-09-27');
      var dxBody = { accessToken: 'tok-err', customerId: '1234567890', daily: { since: ws[ws.length - 1].since, until: '2026-09-27' },
        windows: ws.slice(0, 3).map(function (w) { return { since: w.since, until: w.until }; }) };
      var internal = /json|function|undefined|TypeError|not a/i;
      return call('/api/google-ads-fetch.js', { accessToken: 'tok-err', customerId: '1234567890' }).then(function (r) {
        eq([r.code, r.out.error, r.out.code], [403, 'no access to customer', 'USER_PERMISSION_DENIED'], 'a Google error keeps its text and code');
        return call('/api/google-diagnosis.js', dxBody);
      }).then(function (r) {
        eq([r.code, r.out.code], [403, 'USER_PERMISSION_DENIED']);
        mode = 'crash';
        return call('/api/google-ads-fetch.js', { accessToken: 'tok-err', customerId: '1234567890' });
      }).then(function (r) {
        eq([r.code, r.out.code], [500, 'SERVER'], 'an unexpected failure');
        ok(!internal.test(r.out.error), 'no internal text: ' + r.out.error);
        return call('/api/google-diagnosis.js', dxBody);
      }).then(function (r) {
        eq([r.code, r.out.code], [500, 'SERVER']);
        ok(!internal.test(r.out.error), 'no internal text: ' + r.out.error);
      }).then(restore, function (e) { restore(); throw e; });
    });

    // فترة مقارنة بعيدة (السنة السابقة) بتتطلب على مديين من غير الأيام اللي بينهم، وحد الطلب اليومي على مجموع الأيام
    testAsync('السيرفر — dxRanges: مدى واحد أو أكتر، وكل فترة لازم تبقى جوه مدى، وحد ٥٠٠ يوم على المجموع', function () {
      return import('/api/_dx.js').then(function (m) {
        var w = function (a, b) { return { since: a, until: b }; }, ws = [w('2026-10-01', '2026-10-07'), w('2025-10-01', '2025-10-07'), w('2025-09-24', '2025-09-30')];
        eq(m.dxRanges({ daily: w('2026-09-01', '2026-10-07'), windows: [w('2026-10-01', '2026-10-07'), w('2026-09-24', '2026-09-30'), w('2026-09-17', '2026-09-23')] }).daily, [w('2026-09-01', '2026-10-07')], 'one range still works');
        eq(m.dxRanges({ daily: [w('2025-09-24', '2025-10-07'), w('2026-10-01', '2026-10-07')], windows: ws }).daily.length, 2, 'two ranges');
        eq(m.dxRanges({ daily: [w('2026-10-01', '2026-10-07')], windows: ws }), null, 'a window outside every range');
        eq(m.dxRanges({ daily: [w('2024-01-01', '2024-12-31'), w('2025-01-01', '2026-10-07')], windows: ws }), null, 'over 500 days in total');
        eq(m.windowsSpans(ws), [w('2025-09-24', '2025-10-07'), w('2026-10-01', '2026-10-07')], 'the far window on its own');
        eq(m.windowsSpans([w('2026-10-10', '2026-10-20'), w('2026-10-05', '2026-10-15'), w('2026-09-25', '2026-10-04')]), [w('2026-09-25', '2026-10-20')], 'overlapping = one range');
        // يوم جوه فترتين متداخلتين بيتحسب في الاتنين، زي أرقام الحساب نفسها
        var segs = m.dxSegments([{ date: '2026-10-12', key: 'c', spend: 5 }, { date: '2026-10-03', key: 'c', spend: 2 }, { date: '2026-08-01', key: 'c', spend: 99 }],
          [w('2026-10-10', '2026-10-20'), w('2026-10-05', '2026-10-15'), w('2026-09-25', '2026-10-04')]);
        eq(segs[0].w.map(function (b) { return b.spend; }), [5, 5, 2]);
      });
    });
    testAsync('السيرفر — Snapchat: كل مدى بدفعاته اليومية، والنهارده بالنهار زي أي يوم', function () {
      var realFetch = window.fetch, urls = [];
      window.fetch = function (url) {
        var u = String(url); urls.push(u);
        if (/\/adaccounts\/[^/?]+$/.test(u)) return json({ adaccounts: [{ adaccount: { timezone: 'Asia/Riyadh', currency: 'SAR' } }] });
        if (/\/campaigns\?/.test(u)) return json({ campaigns: [] });
        if (/\/stats/.test(u) && /granularity=DAY/.test(u) && /view_attribution_window=none/.test(u)) {
          var d = /start_time=2025/.test(decodeURIComponent(u)) ? '2025-11-03' : '2026-11-03';
          return json({ timeseries_stats: [{ timeseries_stat: { swipe_up_attribution_window: '7_DAY', view_attribution_window: 'none', breakdown_stats: { campaign: [
            { id: 'c1', timeseries: [{ start_time: d + 'T00:00:00.000+03:00', stats: { spend: 10 * 1e6, conversion_purchases: 2, conversion_purchases_value: 200 * 1e6 } }] }] } } }] });
        }
        return json({});
      };
      var out = null, ws = DX.windows('2026-11-03', '2026-11-03', { cmp: { since: '2025-11-03', until: '2025-11-03' } });
      var res = { setHeader: function () {}, status: function () { return this; }, json: function (b) { out = b; return this; }, end: function () {} };
      return import('/api/snapchat-ads-fetch.js').then(function (m) {
        return m.default({ method: 'POST', headers: {}, body: { accessToken: 't', action: 'diagnosis', adAccountId: 'acc1',
          daily: DX.spans(ws), windows: ws.slice(0, 3).map(function (w) { return { since: w.since, until: w.until }; }) } }, res);
      }).then(function () {
        window.fetch = realFetch;
        var days = urls.filter(function (u) { return /\/stats/.test(u) && /granularity=DAY/.test(u); }).map(decodeURIComponent);
        ok(days.some(function (u) { return /start_time=2025/.test(u); }) && days.some(function (u) { return /start_time=2026-11-03/.test(u); }), 'both ranges were asked: ' + days.join(' '));
        ok(!days.some(function (u) { return /start_time=2026-0/.test(u); }), 'not the months between');
        ok(!urls.some(function (u) { return /granularity=HOUR/.test(u); }), 'no hourly request any more');
        eq(out.daily.map(function (d) { return [d.date, d.spend, d.pur]; }), [['2025-11-03', 10, 2], ['2026-11-03', 10, 2]]);
      }, function (e) { window.fetch = realFetch; throw e; });
    });
    testAsync('السيرفر — Google: الأرقام اليومية والتقسيمات على كل مدى، ومن غير ساعة', function () {
      var realFetch = window.fetch, hadProcess = 'process' in window, prevProcess = window.process, queries = [];
      window.process = { env: { GOOGLE_CLIENT_ID: 'cid' } };
      window.fetch = function (url, opts) {
        var u = String(url);
        if (u.indexOf('tokeninfo') > -1) return json({ aud: 'cid', scope: 'https://www.googleapis.com/auth/adwords' });
        var q = JSON.parse(opts.body).query, date = q.indexOf("'2025-") > -1 ? '2025-11-03' : '2026-11-03';
        queries.push(q);
        if (q.indexOf('conversion_action_category') > -1) {
          return json([{ results: [{ segments: { date: date, conversionActionCategory: 'PURCHASE', conversionAttributionEventType: 'INTERACTION', conversionLagBucket: 'LESS_THAN_ONE_DAY' }, metrics: { conversions: 2, allConversions: 2, conversionsValue: 200, allConversionsValue: 200 } }] }]);
        }
        return json([{ results: [{ segments: { date: date }, metrics: { costMicros: '30000000', impressions: '900', clicks: '40' } }] }]);
      };
      var restore = function () { window.fetch = realFetch; if (hadProcess) window.process = prevProcess; else delete window.process; };
      var out = null, code = null;
      var res = { setHeader: function () {}, status: function (c) { code = c; return this; }, json: function (b) { out = b; return this; }, end: function () {} };
      var ws = DX.windows('2026-11-03', '2026-11-03', { cmp: { since: '2025-11-03', until: '2025-11-03' } });
      return import('/api/google-diagnosis.js').then(function (m) {
        return m.default({ method: 'POST', headers: {}, body: { accessToken: 'tok-dx3', customerId: '1234567890',
          daily: DX.spans(ws), windows: ws.slice(0, 3).map(function (w) { return { since: w.since, until: w.until }; }) } }, res);
      }).then(function () {
        restore();
        eq(code, 200);
        var acct = queries.filter(function (q) { return /FROM customer/.test(q); });
        ok(acct.some(function (q) { return q.indexOf("'2025-") > -1; }) && acct.some(function (q) { return q.indexOf("BETWEEN '2026-11-03' AND '2026-11-03'") > -1; }), acct.join(' || '));
        ok(!queries.some(function (q) { return /segments\.hour/.test(q) || /BETWEEN '2025[^']*' AND '2026/.test(q); }), 'no hour, and never one query across the whole gap');
        eq(out.daily.map(function (d) { return [d.date, d.spend, d.pur]; }), [['2025-11-03', 30, 2], ['2026-11-03', 30, 2]]);
      }, function (e) { restore(); throw e; });
    });
    testAsync('السيرفر: لو Google رفض الفلتر في ملخص المتجر، الملخص كله بأرقام المنصة', function () {
      var realFetch = window.fetch, hadProcess = 'process' in window, prevProcess = window.process, queries = [];
      window.process = { env: { GOOGLE_CLIENT_ID: 'cid' } };
      window.fetch = function (url, opts) {
        var u = String(url);
        if (u.indexOf('tokeninfo') > -1) return json({ aud: 'cid', scope: 'https://www.googleapis.com/auth/adwords' });
        var q = JSON.parse(opts.body).query;
        queries.push(q);
        if (q.indexOf('conversion_attribution_event_type') > -1) return Promise.resolve({ ok: false, status: 400, json: function () { return Promise.resolve({ error: { message: 'bad' } }); } });
        if (q.indexOf('conversion_action_category') > -1 && q.indexOf('FROM customer') > -1 && q.indexOf('segments.device') < 0 && q.indexOf('ad_network_type') < 0) {
          return json([{ results: [{ segments: { date: '2026-09-25', conversionActionCategory: 'PURCHASE' }, metrics: { conversions: 4, allConversions: 4, conversionsValue: 400, allConversionsValue: 400 } }] }]);
        }
        if (q.indexOf('FROM customer') > -1 && q.indexOf('segments.device') < 0 && q.indexOf('ad_network_type') < 0) {
          return json([{ results: [{ segments: { date: '2026-09-25' }, metrics: { costMicros: '80000000', impressions: '900', clicks: '40' } }] }]);
        }
        return json([{ results: [] }]);
      };
      var restore = function () { window.fetch = realFetch; if (hadProcess) window.process = prevProcess; else delete window.process; };
      var out = null, code = null;
      var res = { setHeader: function () {}, status: function (c) { code = c; return this; }, json: function (b) { out = b; return this; }, end: function () {} };
      var ws = DX.windows('2026-09-21', '2026-09-27');
      return import('/api/google-diagnosis.js').then(function (m) {
        return m.default({ method: 'POST', headers: {}, body: { accessToken: 'tok-dx2', customerId: '1234567890',
          daily: { since: ws[ws.length - 1].since, until: '2026-09-27' }, windows: ws.slice(0, 3).map(function (w) { return { since: w.since, until: w.until }; }) } }, res);
      }).then(function () {
        restore();
        eq([code, out.numbers], [200, 'platform']);
        eq(out.daily.filter(function (d) { return d.date === '2026-09-25'; })[0].pur, 4, 'the summary still works');
      }, function (e) { restore(); throw e; });
    });
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
      var c = transformRealAd(baseAd(), rows, {}, DAYS_X, null, 'SAR', null, null);
      eq([c.resultKey, c.results, c.spend, c.roas], ['purchase', 3, 100, 3]);
      eq([c.campaignName, c.adsetName, c.placement], ['Camp C', 'Set S', 'Camp C']);
    });
    test('النهارده (آخر خانة) مبيدخلش الإجمالي: «آخر ٧ أيام» = الأيام المكتملة، واليوم في الجدول لوحده (مراجعة ١١ أكتوبر)', function () {
      var today = DAYS_X[DAYS_X.length - 1].key;
      var rows = [
        { date_start: KEYS[5], spend: '100', actions: [{ action_type: 'omni_purchase', value: '2' }], action_values: [{ action_type: 'omni_purchase', value: '300' }] },
        { date_start: today, spend: '40', actions: [{ action_type: 'omni_purchase', value: '1' }], action_values: [{ action_type: 'omni_purchase', value: '150' }] }
      ];
      var c = transformRealAd(baseAd(), rows, {}, DAYS_X, null, 'SAR', null, null);
      var last = c.daily.length - 1;
      eq([c.spend, c.results, c.sales, c.roas, periodOf(c).sales], [100, 2, 300, 3, 300], 'totals = complete days');
      eq([c.daily[last], c.dailyResults[last], c.dailySales[last]], [40, 1, 150], 'today still shown on its own');
    });
    test('رقم Meta نفسه (results) له الأولوية — والأيام من غيره = صفر', function () {
      var rows = [
        { date_start: KEYS[5], spend: '50', results: [{ indicator: 'actions:offsite_conversion.fb_pixel_lead', values: [{ value: '4' }] }],
          actions: [{ action_type: 'omni_purchase', value: '9' }] },
        { date_start: KEYS[6], spend: '50', actions: [{ action_type: 'omni_purchase', value: '1' }] }
      ];
      var c = transformRealAd(baseAd(), rows, {}, DAYS_X, null, 'SAR', null, null);
      eq([c.resultKey, c.results, c.dailyResults[5], c.dailyResults[6]], ['lead', 4, 4, 0]);
    });
    test('شكل results غير متوقع = نرجع لطريقتنا من غير ما نقع', function () {
      var rows = [{ date_start: KEYS[6], spend: '10', results: [{ weird: true }], actions: [{ action_type: 'omni_purchase', value: '2' }] }];
      var c = transformRealAd(baseAd(), rows, {}, DAYS_X, null, 'SAR', null, null);
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
      var rows = [{ date_start: DAYS_X[DAYS_X.length - 1].key, spend: '10', actions: [] }];   // آخر خانة في النافذة = النهارده
      eq(transformRealAd(a, rows, {}, DAYS_X, null, 'SAR', null, null).active, true);
    });

    // «الأقرب للمتجر» (قرار ٦ أكتوبر ٢٠٢٦): الأساس = نقرة خلال ٧ أيام، ورقم المنصة (value) للمقارنة بس.
    // Meta بتشيل النوافذ اللي قيمتها صفر — يوم كل نتايجه من المشاهدة = «نقرة ٧ أيام» صفر
    test('الأقرب للمتجر = النقرة خلال ٧ أيام، ورقم المنصة جنبه للمقارنة', function () {
      var rows = [
        { date_start: KEYS[5], spend: '50', actions: [{ action_type: 'omni_purchase', value: '5', '7d_click': '3', '1d_view': '2' }],
          action_values: [{ action_type: 'omni_purchase', value: '500', '7d_click': '300', '1d_view': '200' }] },
        { date_start: KEYS[6], spend: '50', actions: [{ action_type: 'omni_purchase', value: '2', '1d_view': '2' }],
          action_values: [{ action_type: 'omni_purchase', value: '200', '1d_view': '200' }] }
      ];
      var c = transformRealAd(baseAd(), rows, {}, DAYS_X, null, 'SAR', null, null);
      eq([c.results, c.dailyResults[5], c.dailyResults[6], sumArr(c.dailySales), c.roas], [3, 3, 0, 300, 3]);
      eq(c.plat, { results: 7, sales: 700 });
    });
    test('الأقرب للمتجر مش أكتر من رقم المنصة، ومن غير نوافذ = رقم المنصة ومفيش مقارنة', function () {
      var narrow = [{ date_start: KEYS[6], spend: '30', actions: [{ action_type: 'omni_purchase', value: '1', '7d_click': '2' }] }];
      eq(transformRealAd(baseAd(), narrow, {}, DAYS_X, null, 'SAR', null, null).results, 1, 'ad set uses a narrower window');
      var old = [{ date_start: KEYS[6], spend: '30', actions: [{ action_type: 'omni_purchase', value: '4' }] }];
      var c = transformRealAd(baseAd(), old, {}, DAYS_X, null, 'SAR', null, null);
      eq([c.results, c.plat], [4, null], 'no windows returned');
      eq(platOf(c), null);
    });
    test('عمود Results بتاع Meta: نوع النتيجة منه، والأقرب للمتجر من actions لنفس النوع', function () {
      var rows = [{ date_start: KEYS[6], spend: '40',
        results: [{ indicator: 'actions:offsite_conversion.fb_pixel_purchase', values: [{ value: '4', attribution_windows: ['7d_click'] }, { value: '6', attribution_windows: ['default'] }] }],
        actions: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '6', '7d_click': '4', '1d_view': '2' }] }];
      var c = transformRealAd(baseAd(), rows, {}, DAYS_X, null, 'SAR', null, null);
      eq([c.resultKey, c.results, c.plat.results], ['purchase', 4, 6]);
    });
    // حساب حقيقي ١٨ أكتوبر (مراجعة المرحلة ٤): إعلانين مجموعتهم مبتحسبش المشاهدة — Meta شالت value و7d_click (صفر) وسابت 1d_view،
    // وResults فيها «1d_view» بس من غير «default». الكارت كان بيعدّ المشاهدة «الأقرب للمتجر» (مجموع ٣٠ يوم ١٠٢ والملخص ٩٩)
    test('من غير value ولا «default» (الافتراضي صفر): الأقرب للمتجر صفر ورقم المنصة صفر — مش المشاهدة', function () {
      var viewOnly = { spend: '57.66', actions: [{ action_type: 'offsite_conversion.fb_pixel_purchase', '1d_view': '2' }, { action_type: 'omni_purchase', '1d_view': '2' }],
        results: [{ indicator: 'actions:offsite_conversion.fb_pixel_purchase', values: [{ attribution_windows: ['1d_view'], value: '2' }] }] };
      var c = transformRealAd(baseAd(), [Object.assign({ date_start: KEYS[3] }, viewOnly)], {}, DAYS_X, null, 'SAR', null, viewOnly);
      eq([c.results, periodOf(c).results, c.plat && c.plat.results, platOf(c) && platOf(c).results], [0, 0, 0, 0]);
      // نافذتين من غير «default» (مشاهدة ومشاهدة متفاعلة): برضه صفر، مش الأكبر فيهم
      var two = { spend: '86.26', actions: [{ action_type: 'offsite_conversion.fb_pixel_purchase', '1d_view': '1', '1d_ev': '1' }],
        results: [{ indicator: 'actions:offsite_conversion.fb_pixel_purchase', values: [{ attribution_windows: ['1d_view'], value: '1' }, { attribution_windows: ['1d_ev'], value: '1' }] }] };
      var d = transformRealAd(baseAd(), [], {}, DAYS_X, null, 'SAR', null, two);
      eq([periodOf(d).results, platOf(d) && platOf(d).results], [0, 0]);
    });
    test('الفترة المختارة: الأقرب للمتجر في الكارت، ورقم المنصة في platOf بنفس الإنفاق', function () {
      var periodRow = { spend: '200', actions: [{ action_type: 'omni_purchase', value: '10', '7d_click': '8', '1d_view': '2' }],
        action_values: [{ action_type: 'omni_purchase', value: '1000', '7d_click': '800', '1d_view': '200' }] };
      var c = transformRealAd(baseAd(), [], {}, DAYS_X, null, 'SAR', null, periodRow);
      var p = periodOf(c), pp = platOf(c);
      eq([p.results, p.sales, p.cpr, p.roas], [8, 800, 25, 4]);
      eq([pp.spend, pp.results, pp.sales, pp.cpr, pp.roas], [200, 10, 1000, 20, 5]);
    });
    testAsync('طلبات أرقام Meta بتطلب «نقرة ٧ أيام»، ولو اترفضت بتتعاد من غيرها', function () {
      var calls = [], hadFB = 'FB' in window, prevFB = window.FB;
      window.FB = { api: function (path, params, cb) {
        calls.push({ path: path, w: params.action_attribution_windows || null });
        cb(params.action_attribution_windows && /act_bad/.test(path) ? { error: { message: 'unsupported' } } : { data: [{ x: 1 }] });
      } };
      var restore = function () { if (hadFB) window.FB = prevFB; else delete window.FB; };
      return Promise.all([
        fbPagesPromise('/act_1/insights', { fields: 'ad_id,spend,actions,action_values' }, 10),
        fbPagesPromise('/act_1/insights', { fields: 'ad_id,frequency,reach' }, 10),
        fbPagesPromise('/act_1/ads', { fields: 'id,name' }, 10),
        fbPagesPromise('/act_bad/insights', { fields: 'date_start,actions' }, 10)
      ]).then(function (res) {
        restore();
        var windows = JSON.stringify(['7d_click', '1d_view', '1d_ev']);
        // الرفض بيتعاد مرة بالنوافذ قبل ما نرجع لرقم المنصة (فشل عابر كان بيبدّل الأرقام كلها — ١٠ أكتوبر ٢٠٢٦)، وnoWindows بيقول ده
        eq(calls.map(function (c) { return c.path + ' ' + (c.w ? 'w' : '-'); }),
          ['/act_1/insights w', '/act_1/insights -', '/act_1/ads -', '/act_bad/insights w', '/act_bad/insights w', '/act_bad/insights -']);
        eq(calls[0].w, windows);
        ok(res.every(function (r) { return !r.err && r.data.length === 1; }), 'every request ends with data');
        eq([!!res[0].noWindows, !!res[3].noWindows], [false, true]);
      }, function (e) { restore(); throw e; });
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
    // صاحب المنتج ٢٥ أكتوبر (الجولة الرابعة): «إعلان لم يحقق مبيعات بالنقر… والمنصة تنسب له من المشاهدة، رغم صرف ضعف الحد الأقصى
    // للتكلفة المحددة أو أكثر فيعتبر عاجل وليس مهم فقط، لأننا نعتمد على النقر وليس المشاهدة» — كان «مهم» من ١١ أكتوبر
    test('ولا طلب بالنقر طول الأسبوع والمنصة بتنسب له طلبات بعد المشاهدة: «عاجل» زي أي إعلان من غير طلبات، ورقم المنصة جملة للعلم', function () {
      var mk = function (platRes, settings) {
        var w = ad('W', { daily: [60, 60, 60, 60, 60, 60, 60], res: [0, 0, 0, 0, 0, 0, 0] });
        w.plat = { results: platRes, sales: platRes * 400 };
        return engine([ad('A', { daily: steady(100), res: steady(2), sales: steady(400) }), ad('B', { daily: steady(100), res: steady(2), sales: steady(400) }), w], {}, settings);
      };
      withLang('ar', function () {
        var view = mk(6, { maxCost: { purchase: 50 } });
        var v = view.alerts.filter(function (a) { return a.adId === 'W' && /^waste/.test(a.code); })[0];
        eq([v.code, v.level, v.atRisk, v.money.kind], ['waste-week', 'critical', true, 'waste']);
        ok(/وتنسب له المنصة ٦ مشتريات بعد المشاهدة دون نقر، ولا نحتسبها/.test(v.detail), v.detail);
        ok(view.summary.atRisk.SAR > 0, 'counted as waste');
        // من غير أقصى تكلفة: «مهم» وسببه بيقول إن تحديدها بيخلّيه عاجل
        var nm = mk(6).alerts.filter(function (a) { return a.adId === 'W' && /^waste/.test(a.code); })[0];
        ok(nm && nm.level === 'warning' && /لم تحدد أقصى تكلفة لكل عملية شراء/.test(nm.levelWhy), nm ? nm.level + ' ' + nm.levelWhy : 'none');
      });
    });
    // الجولة الخامسة (حساب حقيقي ٢٥ أكتوبر كله من غير ولا طلب بالنقر، والمنصة بتنسب بالمشاهدة): إعلان صرف ٦٨٩ ر.س الأسبوع كله كان
    // تنبيهه بإنفاق آخر يومين بس ومن غير رقم المنصة، وسببه «لا توجد إعلانات أخرى بنتائج نقارن بها» — والسبب إن مفيش أقصى تكلفة
    test('حساب من غير أي مرجع (ولا حد ولا متوسط): التنبيه بإنفاق الأسبوع كما في الكارت، ورقم المنصة، وسببه إن مفيش أقصى تكلفة', function () {
      withLang('ar', function () {
        var w = ad('W', { daily: [60, 60, 60, 60, 60, 60, 60], res: [0, 0, 0, 0, 0, 0, 0] });
        w.plat = { results: 7, sales: 2600 };
        var dry = function (r) { return r.alerts.filter(function (a) { return a.adId === 'W' && /^waste/.test(a.code); })[0]; };
        var v = dry(engine([w, ad('X', { daily: steady(20) }), ad('Y', { daily: steady(20) })]));
        ok(v && v.level === 'warning', v ? v.level : 'none');
        ok(/مبلغ ٣٦٠ ر\.س خلال آخر ٦ أيام دون أي مشتريات/.test(v.detail), v.detail);   // نافذة الاختبارات القديمة: ٦ أيام مكتملة + النهارده
        ok(/وتنسب له المنصة ٧ مشتريات بعد المشاهدة دون نقر/.test(v.detail), v.detail);
        ok(/لم تحدد أقصى تكلفة لكل عملية شراء/.test(v.levelWhy), v.levelWhy);
        // وإعلان تاني جاب طلب واحد بس (مش كفاية لمتوسط ولا ليه قيمة): التنبيه كان بيختفي خالص
        var v2 = dry(engine([w, ad('Z', { daily: steady(20), res: [0, 0, 0, 1, 0, 0, 0] }), ad('Y', { daily: steady(20) })]));
        ok(v2 && v2.level === 'warning' && /لم تحدد أقصى تكلفة/.test(v2.levelWhy), v2 ? v2.level + ' ' + v2.levelWhy : 'none');
      });
    });
    // مراجعة ١١ أكتوبر ٢٠٢٦ (حساب حقيقي): مبلغ مستحق غير مسدّد وصفر إنفاق الساعة ١٠ بالليل، والتنبيه كان بيقول «قد تتوقف»
    test('مشكلة الحساب والإنفاق وقف النهارده بعد الضهر: «الأرجح أن الإعلانات توقفت بالفعل» — وقبل الضهر أو فيه صرف: لا', function () {
      // منطقة زمنية الساعة فيها دلوقتي بين ١ و١٠ بالليل، وتانية الساعة فيها الصبح
      var tzAt = function (target) {
        var off = target - new Date().getUTCHours();
        if (off > 14) off -= 24;
        if (off < -12) off += 24;
        return 'Etc/GMT' + (off > 0 ? '-' + off : '+' + (-off));
      };
      var stopped = ad('S1', { daily: [100, 100, 100, 100, 100, 100, 0], res: [2, 2, 2, 2, 2, 2, 0], sales: [400, 400, 400, 400, 400, 400, 0] });
      var spending = ad('S2', { daily: [100, 100, 100, 100, 100, 100, 30], res: [2, 2, 2, 2, 2, 2, 1], sales: [400, 400, 400, 400, 400, 400, 200] });
      var acctAlert = function (c, tz) {
        var r = engine([c], { 'meta:act_1': { label: 'Shop', currency: 'SAR', metaAccountStatus: 3, timeZone: tz } });
        return r.alerts.filter(function (a) { return a.code === 'acct-status'; })[0];
      };
      withLang('ar', function () {
        var late = acctAlert(stopped, tzAt(18)), morning = acctAlert(stopped, tzAt(8)), live = acctAlert(spending, tzAt(18)), noTz = acctAlert(stopped, null);
        ok(/توقفت بالفعل/.test(late.detail) && /مساءً/.test(late.detail) && /١٠٠ ر\.س يومياً/.test(late.detail), late.detail);
        ok(!/توقفت بالفعل/.test(morning.detail), 'morning: ' + morning.detail);
        ok(!/توقفت بالفعل/.test(live.detail), 'still spending: ' + live.detail);
        ok(!/توقفت بالفعل/.test(noTz.detail), 'no time zone');
      });
    });
    test('المرات والأيام: «٧ مرات» و«٤٫٥ مرة» و«منذ ١٠٠ يوم»', function () {
      eq(I18N.measureNoun(7, 'n.time'), 'مرات'); eq(I18N.measureNoun(4.5, 'n.time'), 'مرة'); eq(I18N.measureNoun(12, 'n.time'), 'مرة');
      withLang('en', function () { eq(I18N.measureNoun(4.5, 'n.time'), 'times'); eq(I18N.measureNoun(1, 'n.time'), 'time'); });
      // المراجعة (١١ أكتوبر ٢٠٢٦): «٢ مرة» و«١ مرة» كانوا بيظهروا في التكرار
      withLang('ar', function () {
        eq([1, 1.96, 2, 2.04, 2.5, 3, 11].map(function (v) { return I18N.timesText(v, numAr); }), ['مرة واحدة', 'مرتان', 'مرتان', 'مرتان', '٢٫٥ مرة', '٣ مرات', '١١ مرة']);
        eq(I18N.timesText(2, numAr, true), 'مرتين');
      });
      withLang('en', function () { eq([1, 2, 2.5].map(function (v) { return I18N.timesText(v, numAr); }), ['1 time', '2 times', '2.5 times']); });
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
      // ولا نتيجة طول الأسبوع = الحكم على الأسبوع كله — «كان يكفي لنحو» بمتوسط باقي الإعلانات (المراجعة الثانية للمرحلة ٥): باقيها
      // ١٥٠٠ ÷ ٧٠ ≈ ٢١٫٤ (مساعد الاختبار بيحسب إنفاق النهارده في الإجمالي)، فـ٦٠٠ ÷ ٢١٫٤ ≈ ٢٨ — كان ٢٠ والإعلان نفسه جوّه المتوسط
      // (٢١٠٠ ÷ ٧٠ = ٣٠). المنصوب مع ١١–٩٩
      // الكل في حملة واحدة: مفيش حملة تانية تختلف عنها، فالمرجع الحساب كله (التدقيق العميق — تجميع جزئي)
      var waste = details(engine(base.concat([ad('w1', { daily: steady(100), res: steady(0), key: 'lead' })])), 'w1');
      ok(waste.indexOf('دون أي عملاء محتملين') > -1 && waste.indexOf('لنحو ٢٨ عميلاً محتملاً') > -1 && waste.indexOf('باقي إعلاناتك') > -1, waste);
      // نتائج قبل كده في الأسبوع ويومين من غير = قاعدة آخر يومين (٢٠٠ ÷ ~٢٣ ≈ ٩ — المجرور بعد ٣–١٠)
      var dry2 = details(engine(base.concat([ad('w2', { daily: steady(100), res: [5, 5, 5, 5, 0, 0, 0], key: 'lead' })])), 'w2');
      ok(dry2.indexOf('خلال آخر يومين') > -1 && dry2.indexOf('نحو ٩ عملاء محتملين') > -1, dry2);
      var fat = details(engine(base.concat([ad('f1', { daily: steady(100), res: steady(5), key: 'lead', freq: 7, age: 120 })])), 'f1');
      ok(fat.indexOf('نحو ٧ مرات') > -1 && fat.indexOf('منذ ١٢٠ يوماً') > -1, fat);
    });
  });

  describe('محرك التنبيهات', function () {
    function issuesOf(res, id) { return res.byAd[id].issues; }
    // الحكم بحدودك (صاحب المنتج ٢٥ أكتوبر): «مر عليها ٣ أيام بدون أي مشتريات» = عاجل بعد ضعف أقصى التكلفة اللي حددها، ويومين = «مهم»،
    // ومن غير أقصى تكلفة «مهم» بس (قراره في الجولة الرابعة)
    test('صرف بدون نتائج ٣ أيام = عاجل بعد ضعف أقصى التكلفة، ويومين بس = «مهم»، ومن غير أقصى تكلفة «مهم»', function () {
      var MAX = { maxCost: { purchase: 20 } };
      var ads = baseAccount().concat([ad('waste', { daily: [100, 100, 100, 100, 100, 100, 20], res: [5, 5, 5, 0, 0, 0, 0] })]);
      var r = engine(ads, {}, MAX);
      var i = issuesOf(r, 'waste')[0];
      eq([i.level, i.title, r.byAd.waste.health], ['critical', t('al.waste3.t'), 'review']);
      ok(r.summary.atRisk.SAR > 0, 'counted in at-risk');
      var two = engine(baseAccount().concat([ad('waste', { daily: [100, 100, 100, 100, 100, 100, 20], res: [5, 5, 5, 5, 0, 0, 0] })]), {}, { maxCost: { purchase: 40 } });
      var j = issuesOf(two, 'waste')[0];
      eq([j.level, j.title], ['warning', t('al.wasteEarly.t')]);
      var noMax = issuesOf(engine(ads), 'waste')[0];
      eq([noMax.level, noMax.code], ['warning', 'waste-early']);
    });
    test('إعلان جديد في فترة التعلّم مبيتحكمش عليه', function () {
      var ads = baseAccount().concat([ad('new', { daily: [0, 0, 0, 0, 100, 100, 20], res: [0, 0, 0, 0, 0, 0, 0], age: 1 })]);
      var r = engine(ads);
      ok(!issuesOf(r, 'new').some(function (i) { return i.code === 'waste'; }));
    });
    // الحكم بحدودك (٢٥ أكتوبر): الأسبوع تحت المستهدف وآخر ٣ أيام تحت حد الخسارة = خسارة الـ٣ أيام — «عاجل» بعد ضعف التكلفة
    // المسموحة للطلب، و«مهم» بينها وبين ضعفها (كان باحتمال الصدفة: «مرجّح» = مهم و«مؤكد» = عاجل)
    // من ٨ نوفمبر ٢٠٢٦ الخط الوحيد هو العائد المستهدف على فترة الحكم كلها (قرار صاحب المنتج: «الغاء حد الخسارة والاكتفاء بالعائد
    // المطلوب فقط») — وآخر ٣ أيام مالهاش حكم لوحدها (الوسم على الكارت بيقول التراجع)
    test('العائد تحت المستهدف على فترة الحكم: عاجل بعد ضعف أقصى التكلفة، و«مهم» قبلها بالمبلغ', function () {
      var MAX = { maxCost: { purchase: 10 } };
      var ads = baseAccount().concat([ad('loss', { daily: [100, 100, 100, 100, 100, 100, 20], res: steady(10), sales: [400, 400, 400, 40, 40, 40, 0] })]);
      var r = engine(ads, {}, MAX);
      var i = issuesOf(r, 'loss').filter(function (x) { return x.code === 'loss'; })[0];
      ok(i && i.level === 'critical', 'loss alert: ' + (i && i.level));
      // أرقام الفترة كلها: ٦٠٠ إنفاق و١٬٣٢٠ مبيعات (×٢٫٢) مقابل المستهدف ×٣
      ok(i.detail.indexOf(money(600, 'SAR')) > -1 && i.detail.indexOf(money(1320, 'SAR')) > -1, i.detail);
      // ٦٠ إنفاق وأقصى تكلفة ٤٠: بين الحد وضعفه = «مهم» وسببه بيقول إمتى يبقى عاجل
      var early = withLang('ar', function () { return engine(baseAccount().concat([ad('loss', { daily: [10, 10, 10, 10, 10, 10, 2], res: steady(1), sales: steady(20) })]), {}, { maxCost: { purchase: 40 } }); });
      var j = issuesOf(early, 'loss').filter(function (x) { return x.code === 'loss'; })[0];
      ok(j && j.level === 'warning' && /ويصبح عاجلاً إذا بلغ إنفاقه ٨٠ ر\.س، أي ضعف أقصى تكلفة حددتها لكل عملية شراء/.test(j.levelWhy), j ? j.level + ' ' + j.levelWhy : 'no loss');
      // من غير أقصى تكلفة: «مهم» حتى بعد إنفاق كبير، وسببه بيقول حدّدها — وبيفضل «خسارة» مش «أقل من المستهدف» (الخط الأحمر الأول)
      var nm = withLang('ar', function () { return engine(ads); });
      var k = issuesOf(nm, 'loss').filter(function (x) { return x.code === 'loss'; })[0];
      ok(k && k.level === 'warning' && /لم تحدد أقصى تكلفة/.test(k.levelWhy), k ? k.level + ' ' + k.levelWhy : issuesOf(nm, 'loss').map(function (x) { return x.code; }).join(' '));
    });
    test('يوم واحد من غير مبيعات في إعلان أسبوعه ممتاز = مفيش «عاجل» ولا «مهم» (حالة حقيقية)', function () {
      // مشتريات قليلة وغالية (~٤٠٠ للطلب): يوم ٣ كان صفر ورجع، وأمس صفر — العائد في الأسبوع ×١٦٠ تقريباً
      var lumpy = ad('lumpy', { daily: [6, 5.2, 3.6, 6.8, 5.4, 9.2, 2.5], res: [5, 5, 0, 2, 4, 0, 0], sales: [1951, 1984, 0, 646, 1738, 0, 0] });
      var list = issuesOf(engine(baseAccount().concat([lumpy])), 'lumpy');
      ok(!list.some(function (i) { return i.level === 'critical' || i.level === 'warning'; }),
        list.map(function (i) { return i.level + ': ' + i.title; }).join(' | '));
    });
    test('مبيعات صفر في ٣ أيام بصرف ميكفيش لـ٣ نتائج بمعدل الإعلان = مفيش حكم بخسارة (والأسبوع نفسه عائده ×٥)', function () {
      var small = ad('small', { daily: [10, 10, 10, 10, 10, 10, 2], res: [1, 1, 1, 0, 0, 0, 0], sales: [100, 100, 100, 0, 0, 0, 0] });
      ok(!issuesOf(engine(baseAccount().concat([small])), 'small').some(function (i) { return i.code === 'loss' || i.code === 'low-roas' || i.code === 'roas-drop'; }));
    });
    test('انخفاض النتائج: إعلان ثابت وقع لصفر فجأة = مهم، وإعلان بيتذبذب طبيعي = لا', function () {
      var steadyDrop = ad('sd', { daily: steady(100), res: [5, 5, 5, 5, 5, 0, 4] });
      ok(issuesOf(engine(baseAccount().concat([steadyDrop])), 'sd').some(function (i) { return i.title === t('al.drop.t'); }), 'steady ad drop');
      var wobbly = ad('wb', { daily: steady(100), res: [6, 0, 6, 7, 6, 0, 4] });
      ok(!issuesOf(engine(baseAccount().concat([wobbly])), 'wb').some(function (i) { return i.title === t('al.drop.t'); }), 'had a zero day before and recovered');
      var noisy = ad('nz', { daily: steady(100), res: [2, 3, 2, 3, 2, 1, 2] });
      ok(!issuesOf(engine(baseAccount().concat([noisy])), 'nz').some(function (i) { return i.title === t('al.drop.t'); }), '1 vs ~2.5 can be chance');
    });
    test('يومين من غير نتائج في إعلان أرخص من متوسط الحساب ونتائجه قليلة = مش هدر', function () {
      var lumpy = ad('lw', { daily: steady(10), res: [2, 1, 2, 1, 0, 0, 1] });
      ok(!issuesOf(engine(baseAccount().concat([lumpy])), 'lw').some(function (i) { return /^waste/.test(i.code || ''); }));
    });
    // الحكم بحدودك (٢٥ أكتوبر، الجولة الرابعة): المقارنة بباقي الإعلانات «مهم» بس (مضاعف «مراجعة» اتشال) — «عاجل» في التكلفة بأقصى
    // تكلفة كتبها صاحب الحساب
    test('تكلفة النتيجة العالية مقارنةً بالباقي = «مهم» بسبب يقول حدّد أقصى تكلفة، وفوق أقصى التكلفة بعد ضعفها = عاجل، وقبل ضعف المعتاد مفيش حكم', function () {
      // حساب حقيقي: ~٣٧ في الأسبوع ونتيجتين، والمعتاد ~٧ — أغلى ٢٫٨ مرة
      var few = ad('few', { daily: [7, 5.97, 3.78, 4.45, 4.72, 7.56, 3.71], res: [0, 1, 0, 0, 0, 1, 0] });
      var cheap = [ad('c1', { daily: steady(20), res: steady(3) }), ad('c2', { daily: steady(20), res: steady(3) })];
      var fi = withLang('ar', function () { return issuesOf(engine(cheap.concat([few])), 'few').filter(function (i) { return i.code === 'cpr'; })[0]; });
      ok(fi && fi.level === 'warning' && /حين تحدد أقصى تكلفة لكل عملية شراء/.test(fi.levelWhy), fi ? fi.level + ' ' + fi.levelWhy : 'no cpr');
      // نتيجة واحدة بـ١١ والمعتاد ~٧: أغلى ×١٫٦ بس الإنفاق أقل من ضعف المعتاد — مفيش تنبيه (قراءة مبدئية)
      var early = ad('early', { daily: [2, 2, 2, 2, 2, 1, 0], res: [0, 0, 0, 0, 0, 1, 0] });
      ok(!issuesOf(engine(cheap.concat([early])), 'early').some(function (i) { return i.code === 'cpr'; }), 'below twice the usual cost');
      var many = ad('many', { daily: steady(100), res: [1, 1, 2, 1, 1, 2, 2] });
      var i = issuesOf(engine(baseAccount().concat([many])), 'many').filter(function (x) { return x.code === 'cpr'; })[0];
      ok(i && i.level === 'warning', 'ten purchases at ~2.7x the average, no highest cost set: ' + (i && i.level));
      // أقصى تكلفة ٢٠ والطلب بـ٦٠ بعد ٦٠٠: عاجل. وجوه حملة ميزانيتها على مستوى الحملة المستوى زي ما هو، والسبب جملة في النص
      many.campaignBudget = true;
      var j = issuesOf(engine(baseAccount().concat([many]), {}, { maxCost: { purchase: 20 } }), 'many').filter(function (x) { return x.level === 'critical'; })[0];
      ok(j && j.code === 'cost-max' && j.detail.indexOf(t('al.cboNote')) > -1, 'campaign budget: ' + (j && j.code + ' ' + j.level));
      // والنصيحة: الإعلان مالهوش ميزانية — «نقل الميزانية» اتشالت
      ok(withLang('ar', function () { return t('al.cpr.a'); }).indexOf('نقل جزء من الميزانية') === -1, 'advice');
    });
    test('Meta: ميزانية على مستوى الحملة (daily_budget أو lifetime_budget) بتتقري من طلب الإعلانات', function () {
      var raw = function () {
        return { id: '1', name: 'A', effective_status: 'ACTIVE', created_time: '2026-01-01T00:00:00+0000',
          adset: { id: 's', name: 'Set S', optimization_goal: 'OFFSITE_CONVERSIONS' }, campaign: { id: 'c', name: 'Camp C' }, creative: {} };
      };
      var a = raw(); a.campaign.daily_budget = '5000';
      ok(transformRealAd(a, [], {}, DAYS_X, null, 'SAR', null, null).campaignBudget === true, 'daily budget on the campaign');
      ok(transformRealAd(raw(), [], {}, DAYS_X, null, 'SAR', null, null).campaignBudget === false, 'ad set budgets');
      ok(/campaign\{[^}]*daily_budget,lifetime_budget/.test(META_AD_FIELDS), 'requested from Meta');
    });
    test('إعلان وصول بـ٥ في الأسبوع (٠٫٤٪ من الحساب) = «للعلم» بس حتى لو صرفه أكبر من تكلفة نتيجة واحدة (حالة حقيقية)', function () {
      var reach = ad('rc', { daily: [0.06, 2.01, 2.36, 0.41, 0.4, 0, 0.05], res: [66, 3021, 3532, 639, 597, 0, 94], key: 'reach' });
      var list = issuesOf(engine(baseAccount().concat([reach])), 'rc');
      // من ١١ أكتوبر: إعلان بيصرف أقل من ١٪ من إنفاق الحساب اليومي مبيطلعش عليه ملاحظات توصيل خالص (ولا «للعلم»)
      ok(list.every(function (i) { return i.level === 'info' && i.minor; }), list.map(function (i) { return i.level + ':' + i.code; }).join(' '));
    });
    test('صرف أعلى من المعتاد: بس لو تكلفة النتيجة أمس أعلى بوضوح، مش أعلى من المتوسط بقليل', function () {
      var fine = ad('sf', { daily: [100, 100, 100, 100, 100, 250, 50], res: [5, 5, 5, 5, 5, 10, 2] });
      ok(!issuesOf(engine(baseAccount().concat([fine])), 'sf').some(function (i) { return i.code === 'spike'; }), 'results kept up');
      var bad = ad('sb', { daily: [100, 100, 100, 100, 100, 250, 50], res: [5, 5, 5, 5, 5, 3, 2] });
      ok(issuesOf(engine(baseAccount().concat([bad])), 'sb').some(function (i) { return i.code === 'spike'; }), 'cost per result jumped');
    });
    test('فرصة زيادة الاستثمار على آخر ٣ أيام مش يوم واحد', function () {
      var oneDay = ad('od', { daily: steady(100), res: [5, 5, 5, 0, 0, 12, 3] });
      ok(!issuesOf(engine(baseAccount().concat([oneDay])), 'od').some(function (i) { return i.code === 'scale'; }), 'one great day');
      // الضعف لـ٣ أيام (١٠ في اليوم مقابل ٥ في الباقي) — زيادة ٦٠٪ لـ٣ أيام بقت في حدود الصدفة (المرحلة ٥ ق١: الفرصة محتاجة دليل)
      var three = ad('th', { daily: steady(100), res: [5, 5, 5, 10, 10, 10, 3] });
      var sc = issuesOf(engine(baseAccount().concat([three])), 'th').filter(function (i) { return i.code === 'scale'; })[0];
      ok(sc && sc.detail.indexOf('آخر ٣ أيام') > -1, sc ? sc.detail : 'no scale');
    });
    test('الإعلان الصغير = "للعلم" بس', function () {
      var ads = baseAccount().concat([ad('tiny', { daily: [3, 3, 3, 3, 3, 0, 0], res: [0, 0, 0, 0, 0, 0, 0] })]);
      var r = engine(ads);
      var list = issuesOf(r, 'tiny');
      ok(list.length > 0, 'has a note');
      ok(list.filter(function (i) { return i.code !== 'underspend'; }).every(function (i) { return i.level === 'info' && i.minor && !i.atRisk; }), 'other notes are FYI');
      // نشط من أكتر من ٣ أيام وإنفاقه أقل من تكلفة نتيجة: «لم يُحكم بعد — يأخذ إنفاقاً قليلاً» (حالة محايدة — المرحلة ٥ ه٨،
      // بموافقة صاحب المنتج ١٩ أكتوبر ٢٠٢٦؛ كانت «يحتاج إلى تحسين» من ١٠ أكتوبر) — على الكارت بس، مش في قائمة التنبيهات
      // وعليه ملاحظة تانية (وقف أمس)، فسبب «لم يُحكم بعد» = «إنفاق صغير» (أقل من ٢٪ من الحساب) — أدق من «يأخذ إنفاقاً قليلاً» هنا
      eq([r.byAd.tiny.health, r.byAd.tiny.pending], ['pending', 'small']);
      ok(!r.alerts.some(function (a) { return a.adId === 'tiny' && a.code === 'underspend'; }), 'not in the alerts list');
    });
    test('لا يأخذ إنفاقاً كافياً: جاب نتيجة بإنفاق أقل من تكلفة نتيجة = «لم يُحكم بعد — يأخذ إنفاقاً قليلاً»، وفي فترة التعلّم «جديد»', function () {
      var low = ad('low', { daily: [2, 2, 2, 2, 2, 2, 0], res: [0, 0, 1, 0, 0, 0, 0] });
      var r = withLang('ar', function () { return engine(baseAccount().concat([low])); });
      var us = issuesOf(r, 'low').filter(function (i) { return i.code === 'underspend'; })[0];
      // المرحلة ٥ (ه٨): ملاحظة «للعلم» في التفاصيل وحالة محايدة على الكارت — كانت «يحتاج إلى تحسين» بالأصفر
      ok(us && us.level === 'info' && us.quiet, 'quiet FYI note');
      eq([r.byAd.low.health, r.byAd.low.pending], ['pending', 'underspend']);
      eq(withLang('ar', function () { return t('pend.underspend.t'); }), 'يأخذ إنفاقاً قليلاً');
      ok(/لا يأخذ إنفاقاً كافياً/.test(us.title) && /وحقق عملية شراء واحدة/.test(us.detail), us.detail);
      var fresh = ad('fresh', { daily: [0, 0, 0, 0, 2, 2, 0], res: [0, 0, 0, 0, 1, 0, 0], age: 2 });
      eq(engine(baseAccount().concat([fresh])).byAd.fresh.health, 'pending', 'still learning');
    });
    test('إعلان مبيعات بيكسب على إنفاق قليل (طلبين وعائد فوق المستهدف) = «فرصة» وقراءة مبدئية، مش «يحتاج إلى تحسين»', function () {
      // حساب Snapchat حقيقي ١١ أكتوبر: طلبين بـ١٧$ وعائد ×٩٫٣ كان عليه «لا يأخذ إنفاقاً كافياً» بالأصفر
      var win = ad('win', { daily: [3, 3, 3, 3, 3, 3, 0], res: [0, 1, 0, 1, 0, 0, 0], sales: [0, 80, 0, 80, 0, 0, 0], cid: 'kw' });
      var base = [ad('sa', { daily: steady(100), res: [2, 2, 2, 2, 2, 2, 1], sales: steady(400), cid: 'ka' }), ad('sb', { daily: steady(100), res: [2, 2, 2, 2, 2, 2, 1], sales: steady(400), cid: 'kb' })];
      var r = withLang('ar', function () { return engine(base.concat([win])); });
      var w = issuesOf(r, 'win').filter(function (i) { return i.code === 'underspend-win'; })[0];
      ok(w && w.level === 'opportunity' && w.quiet && /نتائج جيدة بإنفاق قليل/.test(w.title), w ? w.title : list(r, 'win'));
      eq([r.byAd.win.health, r.byAd.win.pending], ['pending', 'prelimAbove']);
      ok(!issuesOf(r, 'win').some(function (i) { return i.code === 'underspend'; }), 'not «needs improvement»');
    });
    // ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦: «لا يتم اعتبار إجراءات التحسين في الإعلان»
    var editOn = function (i, kind, extra) { return [Object.assign({ kind: kind, level: 'campaign', date: KEYS[i], time: KEYS[i] + 'T10:00:00+0000' }, extra || {})]; };
    // قرار صاحب المنتج ٢٥ أكتوبر: «يبقى الحكم كما هو ونضيف Tag على أي إعلان تم تعديله… حتى وإن كان جيداً أو سيئاً»، ٣ أيام كاملة
    // بعده — كان من ١٠ أكتوبر «عُدّل مؤخراً — ننتظر نتيجة التعديل» والملاحظات المهمة «للعلم» (إلا «دون أي نتيجة» من الجولة الخامسة)
    test('تعديل من أقل من ٣ أيام: الحكم بأرقام الكارت زي ما هو، والتعديل وسم «عُدّل…» وسطر في أساس الحكم', function () {
      var weak = ad('w1', { cid: 'c9', camp: 'Other', daily: [100, 100, 100, 100, 100, 10, 0], res: [5, 5, 5, 5, 5, 1, 0] });
      var plain = engine(baseAccount().concat([weak]));
      eq(plain.byAd.w1.editTag, null, 'no edit = no tag');
      weak.edits = editOn(4, 'budget', { from: 20000, to: 5000 });
      var r = withLang('ar', function () { return engine(baseAccount().concat([weak])); });
      eq([r.byAd.w1.health, r.byAd.w1.pending, issuesOf(r, 'w1').map(function (i) { return i.code + ':' + i.level; }).join(' ')],
        [plain.byAd.w1.health, plain.byAd.w1.pending, issuesOf(plain, 'w1').map(function (i) { return i.code + ':' + i.level; }).join(' ')], 'same verdict and alerts as without the edit');
      eq(r.byAd.w1.editTag, { when: 'منذ يومين', what: 'خفض ميزانية الحملة من ٢٠٠ ر.س إلى ٥٠ ر.س' });
      ok(r.byAd.w1.basis && /وجرى خفض ميزانية الحملة من ٢٠٠ ر\.س إلى ٥٠ ر\.س \(منذ يومين\)، والحكم على الفترة كاملة كما في الكارت\./.test(r.byAd.w1.basis), r.byAd.w1.basis);
      ok(!/بعده .* مقابل/.test(r.byAd.w1.basis), 'no after-vs-before on 2 days: ' + r.byAd.w1.basis);
      // «دون أي نتيجة» و«تكلفة مرتفعة» بعد التعديل الحديث: زي أي إعلان (مهم من غير أقصى تكلفة، عاجل بأقصى تكلفة بعد ضعفها)
      var dry = ad('d1', { daily: [100, 100, 100, 100, 100, 100, 0] });
      dry.edits = editOn(5, 'budget', { from: 20000, to: 30000 });
      var rd = engine(baseAccount().concat([dry]));
      eq([rd.byAd.d1.health, !!rd.byAd.d1.editTag], ['improve', true]);
      eq(engine(baseAccount().concat([dry]), {}, { maxCost: { purchase: 20 } }).byAd.d1.health, 'review');
      var pricey = ad('p1', { daily: [100, 100, 100, 100, 100, 100, 0], res: [2, 2, 2, 2, 2, 2, 0] });
      pricey.edits = editOn(5, 'budget', { from: 20000, to: 30000 });
      var rp = engine(baseAccount().concat([pricey]));
      ok(issuesOf(rp, 'p1').some(function (i) { return i.level === 'warning'; }) && rp.byAd.p1.pending == null, issuesOf(rp, 'p1').map(function (i) { return i.code + ':' + i.level; }).join(' '));
      ['pend.edited.t', 'pend.edited.d', 'al.afterEditNote', 'basis.edit.keepZero'].forEach(function (k) { eq(t(k), k, 'text removed: ' + k); });
      // وبعد ٣ أيام كاملة: من غير وسم (التعديل سطر في أساس الحكم بس)
      var old = ad('o1', { daily: [100, 100, 100, 100, 100, 100, 0], res: steady(5) });
      old.edits = editOn(2, 'budget', { from: 20000, to: 30000 });
      eq(engine(baseAccount().concat([old])).byAd.o1.editTag, null, 'tag for 3 full days only');
    });
    // قرار صاحب المنتج ٢٥ أكتوبر (الجولة الرابعة): الحكم على أرقام الكارت دايماً — كان (١٠ أكتوبر) على الأيام اللي بعد التعديل بس
    test('تعديل من ٣ أيام أو أكتر: الحكم على الفترة كاملة كما في الكارت، وسطر «بعده مقابل قبله»', function () {
      var c = ad('a1', { daily: [100, 100, 50, 50, 50, 50, 0], res: [1, 1, 5, 5, 5, 5, 0] });
      c.edits = editOn(1, 'budget', { from: 10000, to: 5000 });
      var r = withLang('ar', function () { return engine(baseAccount().concat([c])); });
      ok(/وجرى خفض ميزانية الحملة من ١٠٠ ر\.س إلى ٥٠ ر\.س \(منذ ٥ أيام\)، والحكم على الفترة كاملة كما في الكارت\./.test(r.byAd.a1.basis), r.byAd.a1.basis);
      // قبل التعديل يوم واحد بس جوه النافذة: بنقول كده بدل «قبله» كأنه زي اللي بعده
      ok(/تكلفة كل عملية شراء بعده ١٠ ر.س مقابل ١٠٠ ر.س في اليوم الوحيد قبله داخل الفترة، فالمقارنة تقريبية/.test(r.byAd.a1.basis), r.byAd.a1.basis);
      eq(r.byAd.a1.health, 'good');
    });
    test('ألوان أرقام الكارت: تكلفة النتيجة أرخص من متوسط الحساب = أخضر، وأغلى = أحمر، والإعلان اللي لم يُحكم عليه من غير لون', function () {
      var cheap = ad('cheap', { daily: steady(100), res: steady(8) }), dear = ad('dear', { daily: steady(100), res: steady(3) });
      var r = engine(baseAccount().concat([cheap, dear]));
      eq([r.byAd.cheap.tones.cpr, r.byAd.dear.tones.cpr], [1, -1]);
      var fresh = ad('fresh2', { daily: steady(100), res: steady(8), age: 1 });
      eq(engine(baseAccount().concat([fresh])).byAd.fresh2.tones, {}, 'learning = no colour');
    });
    test('حكم مبدئي: نتيجة واحدة بإنفاق بين تكلفة نتيجة واتنين = قراءة أولية بالمقارنة بدل «لا تكفي»', function () {
      // متوسط الحساب ≈ ٢٠ للطلب: ٣٠ في الأسبوع وطلب واحد = بين تكلفة طلب واتنين، وأغلى من المتوسط
      var one = ad('one', { daily: [5, 5, 5, 5, 5, 5, 0], res: [0, 0, 0, 1, 0, 0, 0] });
      var r = withLang('ar', function () { return engine(baseAccount().concat([one])); });
      eq([r.byAd.one.health, r.byAd.one.pending], ['pending', 'prelimWorse'], r.byAd.one.basis);
      ok(/^قراءة مبدئية: تكلفة كل عملية شراء فيه ٣٠ ر\.س مقابل/.test(r.byAd.one.basis), r.byAd.one.basis);
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
      // العبارة من أيام النافذة نفسها ({wd} — ٣ نوفمبر ٢٠٢٦): هنا ٧ خانات = ٦ أيام مكتملة، وفي الأداة ٨ = «خلال آخر ٧ أيام»
      var wd6 = t('wd.last', { n: ar(6) + ' ' + I18N.noun(6, 'n.day') });
      eq(a.impactText, t('al.impact', { spend: money(620, 'SAR'), pct: t('al.impactPct', { pct: ar(31) }), wd: wd6 }));
      eq(issuesOf(r, 'waste')[0].impactText, a.impactText, 'same line in the ad details');
      ok(/alert-impact/.test(alertMarkup(a)) && alertMarkup(a).indexOf(esc(a.impactText)) > -1, 'shown on the alert card');
    });
    // التنبيهات مبنية على «الأقرب للمتجر» (results)، وتنبيهات النتائج والتكلفة والعائد بتعرض رقم المنصة جنبه (c.plat)
    test('المقارنة في التنبيه: رقم المنصة جنب الأقرب للمتجر في التنبيه وتفاصيل الإعلان وكارت التنبيه', function () {
      var w = ad('waste', { daily: [100, 100, 100, 100, 100, 100, 20], res: [5, 5, 5, 0, 0, 0, 0], sales: [500, 500, 500, 0, 0, 0, 0] });
      w.plat = { results: 31, sales: 3100 };
      var rej = ad('rej', { daily: [100, 100, 100, 100, 100, 100, 0], active: false, pausedLevel: 'rejected' });
      rej.plat = { results: 9, sales: 0 };
      var r = engine(baseAccount().concat([w, rej]), {}, { maxCost: { purchase: 20 } });
      var a = r.alerts.filter(function (x) { return x.adId === 'waste' && x.code === 'waste'; })[0];
      var want = t('al.compare', {
        p: I18N.countPhrase(31, 'purchase', ar), pr: t('al.cmpRoas', { r: numAr(3100 / 620) }),
        s: I18N.countPhrase(15, 'purchase', ar), sr: t('al.cmpRoas', { r: numAr(1500 / 620) })
      });
      eq(a.compare, want);
      eq(issuesOf(r, 'waste').filter(function (i) { return i.code === 'waste'; })[0].compare, want, 'same line in the ad details');
      ok(alertMarkup(a).indexOf('alert-compare') > -1 && alertMarkup(a).indexOf(esc(want)) > -1, 'shown on the alert card');
      ok(!issuesOf(r, 'rej')[0].compare, 'a rejected ad has nothing to compare');
      w.plat = { results: 15, sales: 1500 };
      ok(!engine(baseAccount().concat([w])).alerts.some(function (x) { return x.compare; }), 'same numbers = no line');
      delete w.plat;
      ok(!engine(baseAccount().concat([w])).alerts.some(function (x) { return x.compare; }), 'no platform number = no line');
    });
    // مراجعة ١ نوفمبر (ر٣، حساب Snapchat حقيقي): «والأقرب لطلبات متجرك ٠ مشتريات» — صفر بجملة لوحدها
    test('المقارنة في التنبيه: صفر في الأقرب للمتجر بجملة سليمة من غير «٠ مشتريات»', function () {
      var z = ad('zero', { daily: [10, 10, 10, 10, 10, 10, 2], res: [0, 0, 0, 0, 0, 0, 0] });
      z.plat = { results: 2, sales: 400 };
      var a = engine(baseAccount().concat([z]), {}, { maxCost: { purchase: 20 } }).alerts.filter(function (x) { return x.adId === 'zero' && x.compare; })[0];
      ok(a, 'a zero-result alert with the platform number');
      withLang('ar', function () {
        eq(a.compare, t('al.compareZero', { p: I18N.countPhrase(2, 'purchase', ar), pr: t('al.cmpRoas', { r: numAr(400 / z.spend) }) }));
        ok(a.compare.indexOf('٠') < 0, a.compare);
      });
    });
    test('المقارنة في التنبيه: مبيعات النهارده مش داخلة (زي الإنفاق والطلبات ورقم المنصة)', function () {
      // نفس شكل الإنتاج: c.sales = الأيام المكتملة (meta.js)، والخانة الأخيرة = النهارده وفيها مبيعات
      var w = ad('waste', { daily: [100, 100, 100, 100, 100, 100, 20], res: [5, 5, 5, 5, 0, 0, 0], sales: [500, 500, 500, 500, 0, 0, 900] });
      w.sales = 2000;
      w.plat = { results: 20, sales: 2000 };
      ok(!engine(baseAccount().concat([w])).alerts.some(function (x) { return x.compare; }), 'same numbers on complete days = no line');
      w.plat = { results: 31, sales: 3100 };
      var a = engine(baseAccount().concat([w])).alerts.filter(function (x) { return x.adId === 'waste' && x.compare; })[0];
      ok(a && a.compare.indexOf(t('al.cmpRoas', { r: numAr(2000 / 620) })) > -1, 'store-closest return uses complete days: ' + (a && a.compare));
      // من غير c.sales (منصة مالهاش الحقل): الأيام لحد امبارح
      delete w.sales;
      a = engine(baseAccount().concat([w])).alerts.filter(function (x) { return x.adId === 'waste' && x.compare; })[0];
      ok(a && a.compare.indexOf(t('al.cmpRoas', { r: numAr(2000 / 620) })) > -1, 'fallback without c.sales: ' + (a && a.compare));
    });
    test('حجم المشكلة: أقل من ١٪ بيتكتب كده، وتنبيه الحساب بيوضّح إنه بيشمل الحساب كله', function () {
      var ads = [ad('huge', { daily: steady(10000), res: steady(100) }), ad('tiny', { daily: steady(10), res: steady(0), freq: 9 }), ad('g2', { daily: steady(10000), res: steady(100) })];
      var r = engine(ads);
      var tiny = r.byAd.tiny.issues.filter(function (i) { return i.impactText; })[0];
      ok(tiny && tiny.impactText.indexOf(t('al.impactPctLow')) > -1, 'under 1%: ' + (tiny && tiny.impactText));
      var stopped = [ad('s1', { daily: [100, 100, 100, 100, 100, 0, 0], res: [2, 2, 2, 2, 2, 0, 0] }), ad('s2', { daily: [100, 100, 100, 100, 100, 0, 0], res: [2, 2, 2, 2, 2, 0, 0] })];
      var acct = engine(stopped).alerts.filter(function (x) { return !x.adId; })[0];
      ok(acct && acct.impactText === t('al.impactAccount', { spend: money(1000, 'SAR'), wd: t('wd.last', { n: ar(6) + ' ' + I18N.noun(6, 'n.day') }) }), 'whole account: ' + (acct && acct.impactText));
    });
    test('الترتيب جوه كل مستوى: الأكبر في الميزانية الأول، ومشاكل الحساب العاجلة فوق الكل', function () {
      var ads = baseAccount().concat([
        // ٣ أيام صفر بإنفاق أكتر من ضعف تكلفة الطلب المعتادة = عاجل (الحكم بحدودك — ٢٥ أكتوبر)
        ad('w1', { daily: [200, 200, 200, 200, 200, 200, 40], res: [10, 10, 10, 0, 0, 0, 0] }),
        ad('w2', { daily: [300, 300, 300, 300, 300, 300, 60], res: [9, 9, 9, 0, 0, 0, 0] }),
        ad('f1', { daily: steady(80), res: steady(4), freq: 8 }),
        ad('f2', { daily: steady(400), res: steady(20), freq: 8 })
      ]);
      var alerts = engine(ads, {}, { maxCost: { purchase: 20 } }).alerts, rank = { critical: 3, warning: 2, info: 1, opportunity: 0 };
      for (var k = 1; k < alerts.length; k++) {
        var p = alerts[k - 1], q = alerts[k];
        if (p.level !== q.level) { ok(rank[p.level] >= rank[q.level], 'levels in order'); continue; }
        var pAcct = p.amount === Number.MAX_SAFE_INTEGER, qAcct = q.amount === Number.MAX_SAFE_INTEGER;
        ok(pAcct || !qAcct, 'urgent account problems first');
        if (pAcct === qAcct) ok(p.impact.spend >= q.impact.spend, p.adId + ' (' + p.impact.spend + ') before ' + q.adId + ' (' + q.impact.spend + ')');
      }
      var waste = alerts.filter(function (x) { return x.title === t('al.waste3.t'); }).map(function (x) { return x.adId; });
      eq(waste, ['w2', 'w1'], 'bigger ad first');
    });
    test('الحساب مصرفش أمس: عاجل لو فيه إعلانات شغّالة، ولا حاجة لو صاحبه وقّفها كلها بنفسه', function () {
      var running = [ad('r1', { daily: [100, 100, 100, 100, 100, 0, 0], res: [2, 2, 2, 2, 2, 0, 0] }), ad('r2', { daily: [100, 100, 100, 100, 100, 0, 0], res: [2, 2, 2, 2, 2, 0, 0] })];
      ok(engine(running).alerts.some(function (a) { return a.code === 'acct-zero' && a.level === 'critical'; }), 'active ads, no spend');
      var paused = [ad('p1', { daily: [100, 100, 100, 100, 100, 0, 0], res: [2, 2, 2, 2, 2, 0, 0], active: false, pausedLevel: 'campaign' }),
        ad('p2', { daily: [100, 100, 100, 100, 100, 0, 0], res: [2, 2, 2, 2, 2, 0, 0], active: false, pausedLevel: 'ad' })];
      ok(!engine(paused).alerts.some(function (a) { return !a.adId && (a.level === 'critical' || a.level === 'warning'); }), 'owner paused everything');
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
    // مراجعة الإعدادات (٢٤ أكتوبر): من غير أنماط — الحد الناقص بقيمة البداية، والمستهدف وحد الخسارة فاضيين، والتكلفة المقبولة أرقام موجبة بس
    test('الإعدادات: الحد الناقص بقيمة البداية، والعائد المستهدف مالوش قيمة ابتدائية، و٩ إعدادات بس (حد الخسارة اتشال ٨ نوفمبر)', function () {
      var s = PauseProofAlerts.mergeSettings({ minSpendShare: 0.1, _preset: 'calm' });
      eq([s.minSpendShare, s.cprWarnMultiple, s.roasTarget], [0.1, 1.5, null]);
      eq(PauseProofAlerts.GOAL_KEYS, ['roasTarget'], 'the target is the only goal');
      ok(!PauseProofAlerts.SETTINGS_META.some(function (m) { return m.key === 'roasBreakEven'; }), 'no loss limit');
      eq(PauseProofAlerts.SETTINGS_META.length, 9);
      ok(!PauseProofAlerts.SETTINGS_META.some(function (m) { return m.key === 'cprCriticalMultiple'; }), 'no «review» multiple');
      ok(!('PRESETS' in PauseProofAlerts) && !('presetSettings' in PauseProofAlerts), 'no presets');
      var m = PauseProofAlerts.mergeSettings({ maxCost: { lead: 30, message: -5, x: 'a' }, campaignMaxCost: { c1: 12 } });
      eq([JSON.stringify(m.maxCost), JSON.stringify(m.campaignMaxCost)], ['{"lead":30}', '{"c1":12}']);
    });
    test('نصوص التنبيهات بالإنجليزي', function () {
      var ads = baseAccount().concat([ad('waste', { daily: [100, 100, 100, 100, 100, 100, 20], res: [5, 5, 5, 0, 0, 0, 0] })]);
      withLang('en', function () {
        var i = engine(ads, {}, { maxCost: { purchase: 20 } }).byAd.waste.issues[0];
        eq(i.title, 'Spend with no results in the last 3 days');
        ok(/^Urgent because it spent/.test(i.levelWhy) && !/[؀-ۿ]/.test(i.levelWhy), i.levelWhy);
        ok(/SAR/.test(i.detail) && !/[؀-ۿ]/.test(i.detail), 'english detail');
      });
    });
  });

  // مراجعة التقييم (٧ أكتوبر ٢٠٢٦): كل حالة هنا كانت بتطلع «جيد» أو حكم غلط قبل المراجعة
  describe('تقييم الإعلان — الحكم بدليل', function () {
    function health(r, id) { return r.byAd[id].health; }
    function has(r, id, code, level) { return r.byAd[id].issues.some(function (i) { return i.code === code && (!level || i.level === level); }); }
    function list(r, id) { return r.byAd[id].issues.map(function (i) { return i.code + ':' + i.level; }).join(' '); }
    // إعلانين عائدهم ×٤ (المستهدف ×٣) — أساس حساب بيسجّل المبيعات
    function salesBase() {
      return [ad('a', { daily: steady(100), res: [2, 2, 2, 2, 2, 2, 1], sales: steady(400), cid: 'ka' }),
        ad('b', { daily: steady(100), res: [2, 2, 2, 2, 2, 2, 1], sales: steady(400), cid: 'kb' })];
    }
    test('رابح واحد في الحساب: الإعلانات اللي صرفت الأسبوع كله من غير ولا طلب = «يحتاج إلى مراجعة»', function () {
      var r = engine([ad('win', { daily: steady(100), res: [3, 3, 3, 3, 3, 3, 2], sales: steady(1050), cid: 'k1' }),
        ad('l1', { daily: steady(100), cid: 'k2' }), ad('l2', { daily: steady(80), cid: 'k3' })], {}, { maxCost: { purchase: 40 } });
      eq([health(r, 'l1'), health(r, 'l2'), health(r, 'win')], ['review', 'review', 'good']);
      ok(has(r, 'l1', 'waste-week', 'critical') && /آخر ٦ أيام/.test(r.byAd.l1.issues[0].detail), list(r, 'l1'));
    });
    test('ولا طلب طول الأسبوع بإنفاق يومي صغير (آخر يومين لوحدهم مكانوش كفاية) = عاجل لو الإنفاق كفاية دليل', function () {
      // ١٥٠ في الأسبوع ومتوسط الحساب ٢٠ للطلب: المتوقع ٧٫٥ والصفر صعب يكون صدفة — وآخر يومين لوحدهم (٥٠، المتوقع ٢٫٥) مش كفاية
      var r = engine(baseAccount().concat([ad('dry', { daily: steady(25) })]), {}, { maxCost: { purchase: 20 } });
      ok(has(r, 'dry', 'waste-week', 'critical'), list(r, 'dry'));
      eq(health(r, 'dry'), 'review');
      // ٣٦ في الأسبوع والطلب المعتاد بـ٢٠: بين التكلفة وضعفها = «مهم» مش «عاجل» (الحكم بحدودك — ٢٥ أكتوبر: العاجل من ضعف التكلفة)
      var small = engine(baseAccount().concat([ad('dry', { daily: steady(6) })]), {}, { maxCost: { purchase: 20 } });
      ok(!has(small, 'dry', 'waste-week', 'critical') && has(small, 'dry', 'waste-early', 'warning'), list(small, 'dry'));
    });
    test('نتيجة واحدة بإنفاق يكفي لعشرة = «عاجل» فوق أقصى التكلفة (القاعدة كانت محتاجة نتيجتين)', function () {
      var r = engine(baseAccount().concat([ad('one', { daily: steady(30), res: [0, 0, 0, 0, 0, 1, 0] })]), {}, { maxCost: { purchase: 20 } });
      ok(has(r, 'one', 'cost-max', 'critical'), list(r, 'one'));
    });
    // المرحلة ٥ ق٦ — Meta (About the learning phase / Significant edits): إضافة إعلان جديد للمجموعة بترجّعها لمرحلة التعلّم،
    // فأرقام إخواته في الأيام الأولى غير مستقرة. الحكم بيفضل، والسبب مكتوب في أساس الحكم. من ٢٥ أكتوبر (الحكم بحدودك) المستوى من حدود
    // الإعدادات زي أي إعلان — عدم الاستقرار سبب يتقال، مش سبب يخفّض «عاجل» لإعلان فوق أقصى تكلفة حددتها بعد ضعفها
    test('ق٦: إعلان جديد في نفس المجموعة = السبب في أساس الحكم، والمستوى من حدود الإعدادات زي أي إعلان', function () {
      var MAX = { maxCost: { purchase: 20 } };
      var pricey = function () { return ad('old', { daily: steady(30), res: [0, 0, 0, 0, 0, 1, 0], aid: 's1' }); };
      var alone = engine(baseAccount().concat([pricey()]), {}, MAX);
      ok(has(alone, 'old', 'cost-max', 'critical'), 'من غير إعلان جديد عاجل: ' + list(alone, 'old'));
      var withNew = engine(baseAccount().concat([pricey(), ad('fresh', { daily: [0, 0, 0, 0, 0, 20, 10], age: 1, aid: 's1' })]), {}, MAX);
      ok(has(withNew, 'old', 'cost-max', 'critical'), list(withNew, 'old'));
      ok(/مرحلة التعلّم/.test(withNew.byAd.old.basis || ''), 'أساس الحكم: ' + withNew.byAd.old.basis);
      // إعلان جديد في مجموعة تانية ملوش علاقة
      var other = engine(baseAccount().concat([pricey(), ad('fresh', { daily: [0, 0, 0, 0, 0, 20, 10], age: 1, aid: 's2' })]), {}, MAX);
      ok(has(other, 'old', 'cost-max', 'critical') && !/مرحلة التعلّم/.test(other.byAd.old.basis || ''), list(other, 'old'));
    });
    // ق٦ في سناب شات (قرار صاحب المنتج ١٩ أكتوبر): نفس القاعدة، والسبب المكتوب تقاسم ميزانية المجموعة — من غير أي كلام
    // عن «مرحلة تعلّم» سناب شات (مقالتها الرسمية مقرأناهاش)
    test('ق٦ لسناب شات: السبب تقاسم الميزانية مش مرحلة التعلّم', function () {
      var snap = { platform: 'Snapchat', source: 'snap:acc_1', setLearns: false };
      var r = engine([ad('g1', Object.assign({ daily: steady(100), res: steady(5) }, snap)),
        ad('g2', Object.assign({ daily: steady(100), res: steady(5) }, snap)),
        ad('old', Object.assign({ daily: steady(30), res: [0, 0, 0, 0, 0, 1, 0], aid: 'q1' }, snap)),
        ad('fresh', Object.assign({ daily: [0, 0, 0, 0, 0, 20, 10], age: 1, aid: 'q1' }, snap))], {}, { maxCost: { purchase: 20 } });
      ok(has(r, 'old', 'cost-max', 'critical'), list(r, 'old'));
      var b = r.byAd.old.basis || '';
      ok(/يتقاسمها إعلاناتها/.test(b) && !/مرحلة التعلّم/.test(b), 'أساس الحكم: ' + b);
    });
    // ر٤٣ (مرحَّل من المرحلة ٤): أساس رقمنا في سناب شات = طلبات المتجر، فسبب الفرق مش «مشاهدة من غير نقر» زي Meta. ومن ٢٥ أكتوبر
    // رقم المنصة جملة للعلم جوه «إنفاق دون نتائج» (الحكم بالنقر — قرار صاحب المنتج)
    test('ر٤٣: أساس الرقم من المتجر = جملة رقم المنصة في «إنفاق دون نتائج» تقول سبب الفرق الصحيح', function () {
      var mk = function (store) { return withLang('ar', function () { return engine(baseAccount().concat([ad('sv', { daily: steady(40), plat: { results: 3, sales: 0 }, baseStore: store })]), {}, { maxCost: { purchase: 20 } }); }); };
      var pick = function (r) { return r.byAd.sv.issues.filter(function (i) { return i.code === 'waste-week'; })[0]; };
      var st = pick(mk(true)), clk = pick(mk(false));
      ok(st && st.level === 'critical' && /المسجّلة في متجرك/.test(st.detail) && !/دون نقر/.test(st.detail), st ? st.title + ' — ' + st.detail : list(mk(true), 'sv'));
      ok(clk && clk.level === 'critical' && /بعد المشاهدة دون نقر/.test(clk.detail), clk ? clk.detail : list(mk(false), 'sv'));
    });
    // المرحلة ٥ ق٧: مصدرا حالة المجموعة الإعلانية فشلوا — التنبيه ميقولش إن العيب في الإعلان وهو ممكن يكون إعداد في المجموعة
    test('ق٧: حالة المجموعة غير مقروءة = تنبيه التوصيل بيقول إن السبب قد يكون من المجموعة', function () {
      var mk = function (p) { return engine(baseAccount().concat([ad('w', { daily: [50, 50, 50, 50, 50, 0, 0], res: steady(2), partial: p })])); };
      var dim = mk(true).byAd.w.issues.filter(function (i) { return i.code === 'no-spend-y'; })[0];
      var known = mk(false).byAd.w.issues.filter(function (i) { return i.code === 'no-spend-y'; })[0];
      ok(dim && /حالة مجموعته الإعلانية/.test(dim.detail), dim ? dim.detail : list(mk(true), 'w'));
      ok(known && !/حالة مجموعته الإعلانية/.test(known.detail), known ? known.detail : list(mk(false), 'w'));
    });

    // ---- المراجعة العميقة الثانية للمرحلة ٥: التوافق والتكامل بين التنبيهات (ISA-18.2 / EEMUA 191 — إنذار واحد لكل حالة) ----
    var PERF_CODES = ['waste-week', 'waste', 'waste-early', 'waste-view', 'waste-new', 'cpr', 'loss', 'roas-drop', 'low-roas', 'spike', 'drop', 'fatigue'];
    function perfOf(r, id) { return r.byAd[id].issues.filter(function (i) { return PERF_CODES.indexOf(i.code) > -1 && (i.level === 'critical' || i.level === 'warning'); }); }
    test('تنبيه أداء واحد للإعلان: «يومان دون نتائج» و«تكلفة مرتفعة» و«تشبّع الجمهور» بنفس الدليل = تنبيه واحد فيه التكرار', function () {
      // ٣ نتائج أول يوم وبعدها صفر، والشخص شاف الإعلان ٧ مرات: قبل الإصلاح ٣ تنبيهات عاجلة على نفس الإعلان (٣ خانات من ٥)
      var r = withLang('ar', function () { return engine(baseAccount().concat([ad('x', { daily: steady(60), res: [3, 0, 0, 0, 0, 0, 0], freq: 7 })]), {}, { maxCost: { purchase: 20 } }); });
      var p = perfOf(r, 'x');
      eq(p.length, 1, list(r, 'x'));
      ok(p[0].level === 'critical' && /شاهد الشخص نفسه هذا الإعلان/.test(p[0].detail) && p[0].metrics.indexOf('frequency') > -1, p[0].code + ': ' + p[0].detail);
      eq(health(r, 'x'), 'review');
      eq(r.alerts.filter(function (a) { return a.adId === 'x'; }).length, 1, 'once in the alert list');
    });
    test('لا «فرصة — زوّد الميزانية» جنب «يومان دون مشتريات» على نفس الإعلان', function () {
      var r = engine([ad('g1', { daily: steady(100), res: steady(2), sales: steady(600) }), ad('g2', { daily: steady(100), res: steady(2), sales: steady(600) }),
        ad('d', { daily: [100, 100, 100, 100, 300, 300, 0], res: [3, 3, 3, 4, 0, 0, 0], sales: [2400, 2400, 2400, 3200, 0, 0, 0] })], {}, { roasTarget: 3, roasBreakEven: 1 });
      ok(perfOf(r, 'd').length === 1 && !has(r, 'd', 'roas-great'), list(r, 'd'));
    });
    // الحكم بحدودك (٢٥ أكتوبر): سبب «مبدئي» بالمبلغ اللي محتاجه الحكم — مش «قد يكون صدفة» (قرار صاحب المنتج ١٠ أكتوبر: ممنوع «صدفة»)
    test('الحكم المبدئي بيقول المبلغ اللي يكمّل الحكم (ضعف التكلفة المسموحة)، أو «حين يحقق عمليتي شراء» لو صرفه كفاية — من غير «صدفة»', function () {
      var r = withLang('ar', function () {
        return engine([ad('g1', { daily: steady(100), res: steady(1), sales: steady(330) }), ad('g2', { daily: steady(100), res: steady(1), sales: steady(330) }),
          ad('m', { daily: [20, 20, 20, 30, 30, 30, 0], res: [0, 0, 0, 0, 0, 1, 0], sales: [0, 0, 0, 0, 0, 500, 0] })], {}, { roasTarget: 3, roasBreakEven: 1 });
      });
      ok(/^prelim/.test(r.byAd.m.pending || '') && /ويكتمل الحكم حين يبلغ إنفاقه ٢٢٩ ر\.س \(ضعف تكلفة الطلب المستهدفة\)/.test(r.byAd.m.basis) && !/صدفة/.test(r.byAd.m.basis), (r.byAd.m.pending || '') + ': ' + r.byAd.m.basis);
      var q = withLang('ar', function () { return engine(baseAccount().concat([ad('q', { daily: [5, 5, 5, 5, 5, 5, 0], res: [0, 0, 0, 0, 0, 1, 0] })])); });
      ok(/^prelim/.test(q.byAd.q.pending || '') && /حين يبلغ إنفاقه ٤٠ ر\.س \(ضعف تكلفة عملية شراء المعتادة في باقي إعلاناتك\)/.test(q.byAd.q.basis), (q.byAd.q.pending || '') + ': ' + q.byAd.q.basis);
      // صرف ضعف التكلفة بطلب واحد كبير (عائده فوق المستهدف): الحكم بيكمل بطلب تاني
      var once = withLang('ar', function () {
        return engine([ad('g1', { daily: steady(100), res: steady(1), sales: steady(330) }), ad('g2', { daily: steady(100), res: steady(1), sales: steady(330) }),
          ad('o', { daily: [55, 55, 55, 55, 55, 55, 0], res: [0, 0, 0, 0, 0, 1, 0], sales: [0, 0, 0, 0, 0, 2000, 0] })], {}, { roasTarget: 3, roasBreakEven: 1 });
      });
      ok(once.byAd.o.pending === 'prelimAbove' && /ويكتمل الحكم حين يحقق عمليتي شراء/.test(once.byAd.o.basis || ''), once.byAd.o.pending + ': ' + once.byAd.o.basis);
    });
    test('الحالة «يحتاج إلى تحسين» وسبب «لم نحكم بعد»: سبب الحكم بيقول التنبيه اللي حدّد الحالة', function () {
      var r = withLang('ar', function () { return engine(baseAccount().concat([ad('n', { daily: [0, 0, 0, 0, 200, 150, 20], age: 2 })])); });
      eq(health(r, 'n'), 'improve');
      var top = r.byAd.n.issues.filter(function (i) { return i.level === 'warning'; })[0];
      ok(top && /لا نحكم/.test(r.byAd.n.basis) && r.byAd.n.basis.indexOf('«' + top.title + '»') > -1, r.byAd.n.basis);
    });
    test('«إنفاق أعلى من المعتاد» بدليل: نتائج أمس قليلة بشكل صعب يكون صدفة', function () {
      // إنفاق أمس ٢٫٥ ضعف، و٣ نتائج والمتوقع بمعدّله ٥ (احتمالها صدفة نحو ٢٧٪): قبل الإصلاح «مهم»
      var noisy = engine(baseAccount().concat([ad('l', { daily: [40, 40, 40, 40, 40, 100, 0], res: [2, 2, 2, 2, 2, 3, 0] })]));
      ok(!has(noisy, 'l', 'spike'), list(noisy, 'l'));
      // صفر نتائج والمتوقع ٥: بيطلع — تنبيه واحد (كان «إنفاق أعلى من المعتاد» و«انخفاض النتائج» عن نفس اليوم). ومن ٢٥ أكتوبر تكلفة
      // أسبوعه ×١٫٥ من المعتاد (خط «تحسين» في الإعدادات) فالمضيف ممكن يبقى «تكلفة مرتفعة» واليوم ده جوّاه — تنبيه واحد «مهم» برضه
      var real = engine(baseAccount().concat([ad('l', { daily: [40, 40, 40, 40, 40, 100, 0], res: [2, 2, 2, 2, 2, 0, 0] })]));
      var rp = perfOf(real, 'l');
      ok(rp.length === 1 && rp[0].level === 'warning' && (rp[0].code === 'spike' || rp[0].code === 'cpr'), list(real, 'l'));
    });
    test('الإعلان الكبير بيتقارن بباقي إعلاناته مش بمتوسط هو نفسه جوّاه (ترك واحد): أغلى ~١٫٧ مرة وحصته ٣٩٪ = «تكلفة مرتفعة»', function () {
      // متوسط الحساب كله وفيه الإعلان: النسبة الظاهرة = الحصة + الفرق × (١ − الحصة) ≈ ١٫٤٩ — تحت حد «مهم» (١٫٥) فمكانش فيه تنبيه
      var r = withLang('ar', function () {
        return engine([ad('g1', { daily: steady(140), res: steady(7) }), ad('g2', { daily: steady(140), res: steady(7) }), ad('dom', { daily: steady(180), res: steady(5) })]);
      });
      var cpr = r.byAd.dom.issues.filter(function (i) { return i.code === 'cpr'; })[0];
      ok(cpr && /باقي إعلاناتك/.test(cpr.detail), cpr ? cpr.detail : list(r, 'dom'));
      // ومن غير ما «لا يأخذ إنفاقاً كافياً» يتأثر: الإعلانين الكويسين حكمهم زي ما هو
      eq([health(r, 'g1'), health(r, 'g2')], ['good', 'good']);
    });

    // ---- التدقيق العميق للمحرك (٢٤ أكتوبر ٢٠٢٦ — حسابات حقيقية بالتنقّل بينها) ----
    test('إعلان المبيعات = مبيعات في الأيام المكتملة بس: طلبات النهارده مبتخلّيش إعلان صرف أسبوع من غير ولا طلب «عائد أقل من حد الخسارة»', function () {
      var ads = [ad('g1', { daily: steady(100), res: steady(2), sales: steady(600) }), ad('g2', { daily: steady(100), res: steady(2), sales: steady(600) }),
        ad('today', { daily: steady(60), res: [0, 0, 0, 0, 0, 0, 2], sales: [0, 0, 0, 0, 0, 0, 300] })];
      var r = withLang('ar', function () { return engine(ads, {}, { maxCost: { purchase: 50 } }); });
      ok(!has(r, 'today', 'loss') && !/×٠/.test(r.byAd.today.basis || ''), list(r, 'today') + ' | ' + r.byAd.today.basis);
      ok(has(r, 'today', 'waste-week'), list(r, 'today'));
    });
    test('المرجع جوه الحملة نفسها: حملة منتج غالي مش «تكلفة مرتفعة» قصاد حملة رخيصة، والنص بيقول «باقي إعلانات حملته»', function () {
      var ads = [ad('a1', { cid: 'c1', daily: steady(100), res: steady(5), key: 'lead' }), ad('a2', { cid: 'c1', daily: steady(100), res: steady(5), key: 'lead' }),
        ad('b1', { cid: 'c2', daily: steady(100), res: steady(1), key: 'lead' }), ad('b2', { cid: 'c2', daily: steady(100), res: steady(1), key: 'lead' }),
        ad('b3', { cid: 'c2', daily: steady(100), res: steady(1), key: 'lead' }),
        // لوحده في حملته: مفيش باقي يكفي، فالمرجع الحساب كله
        ad('solo', { cid: 'c3', daily: steady(100), res: steady(4), key: 'lead' })];
      var r = withLang('ar', function () { return engine(ads); });
      ok(!has(r, 'b1', 'cpr') && r.byAd.b1.health === 'good', list(r, 'b1') + ' ' + r.byAd.b1.health);
      eq([r.byAd.b1.refScope, r.byAd.solo.refScope], ['camp', 'acc']);
      ok(/باقي إعلانات حملته/.test(r.byAd.b1.basis), r.byAd.b1.basis);
      ok(/باقي إعلاناتك/.test(r.byAd.solo.basis || '') || r.byAd.solo.health !== 'good', r.byAd.solo.basis);
    });
    test('أغلى من المرجع بـ١٥٪ أو أكتر بدليل بس تحت حد التنبيه = «لم يُحكم بعد — أغلى قليلاً»، مش «جيد» ورقمه بالأحمر؛ ومن غير دليل = «جيد»', function () {
      var ads = [ad('g1', { daily: steady(1000), res: steady(50), key: 'lead' }), ad('g2', { daily: steady(1000), res: steady(50), key: 'lead' }),
        // أغلى ~١٫٤ مرة بأعداد كبيرة (الفرق مؤكد) بس تحت حد التنبيه ×١٫٥
        ad('m', { daily: steady(1000), res: steady(35), key: 'lead' })];
      var r = withLang('ar', function () { return engine(ads); });
      eq([r.byAd.m.health, r.byAd.m.pending], ['pending', 'costlier']);
      ok(/أغلى قليلاً من متوسط باقي إعلاناتك/.test(r.byAd.m.pendingTitle) && /الفرق مؤكد/.test(r.byAd.m.basis) && /×١٫٥/.test(r.byAd.m.basis), r.byAd.m.pendingTitle + ' | ' + r.byAd.m.basis);
      eq([r.byAd.g1.health, r.byAd.g2.health], ['good', 'good']);
      // نفس النسبة بأعداد صغيرة (تذبذب، مفيش دليل): «جيد» زي ما هو — من غير الشرط ده ثلث الإعلانات السليمة كانت هتطلع «أغلى»
      var small = withLang('ar', function () {
        return engine([ad('g1', { daily: steady(100), res: steady(5), key: 'lead' }), ad('g2', { daily: steady(100), res: steady(5), key: 'lead' }),
          ad('m', { daily: steady(100), res: [4, 4, 3, 4, 4, 3, 4], key: 'lead' })]);
      });
      eq(small.byAd.m.health, 'good');
    });
    test('آخر ٣ أيام من غير ولا بيعة في إعلان فترته فيها مبيعات: سطر صريح جوه تنبيه العائد', function () {
      var ads = [ad('g1', { daily: steady(100), res: steady(2), sales: steady(600) }), ad('g2', { daily: steady(100), res: steady(2), sales: steady(600) }),
        ad('z2', { daily: steady(300), res: [2, 2, 2, 1, 1, 1, 0], sales: [900, 900, 900, 0, 0, 0, 0] })];
      var mix = withLang('ar', function () { return engine(ads); });
      var l2 = mix.byAd.z2.issues.filter(function (i) { return i.code === 'loss'; })[0];
      ok(l2 && /ولم يحقق أي مبيعات في آخر ٣ أيام رغم إنفاق ٩٠٠ ر\.س/.test(l2.detail), l2 ? l2.detail : list(mix, 'z2'));
      // إعلان مالوش ولا بيعة في أي يوم مكتمل مش «إعلان مبيعات» أصلاً (anyDone) — بيتحكم عليه بتكلفة النتيجة
      var none = withLang('ar', function () { return engine([ads[0], ads[1], ad('z', { daily: steady(300), res: steady(2), sales: steady(0) })]); });
      ok(!none.byAd.z.issues.some(function (i) { return i.code === 'loss'; }), list(none, 'z'));
    });
    test('حملتين بنفس التكلفة (نفس المنتج مقسوم): المرجع الحساب كله بقوته الكاملة (تجميع جزئي)، مش الحملة لوحدها', function () {
      var ads = [ad('a1', { cid: 'c1', daily: steady(100), res: steady(5), key: 'lead' }), ad('a2', { cid: 'c1', daily: steady(100), res: steady(5), key: 'lead' }),
        ad('b1', { cid: 'c2', daily: steady(100), res: steady(5), key: 'lead' }), ad('b2', { cid: 'c2', daily: steady(100), res: steady(5), key: 'lead' })];
      var r = engine(ads);
      eq([r.byAd.a1.refScope, r.byAd.b1.refScope], ['acc', 'acc']);
    });
    test('٣ إعلانات في نفس المجموعة الإعلانية عليها تكلفة مرتفعة = تنبيه واحد في القائمة بيذكر الباقيين (ISA-18.2)، وكروتهم بأحكامها', function () {
      var ads = [ad('g1', { aid: 's1', daily: steady(100), res: steady(5), key: 'lead' }), ad('g2', { aid: 's1', daily: steady(100), res: steady(5), key: 'lead' }),
        ad('g3', { aid: 's1', daily: steady(100), res: steady(5), key: 'lead' }),
        ad('x1', { aid: 's2', daily: steady(100), res: [2, 1, 2, 1, 2, 1, 2], key: 'lead' }), ad('x2', { aid: 's2', daily: steady(100), res: [2, 1, 2, 1, 2, 1, 2], key: 'lead' }),
        ad('x3', { aid: 's2', daily: steady(100), res: [2, 1, 2, 1, 2, 1, 2], key: 'lead' })];
      var r = withLang('ar', function () { return engine(ads); });
      ok(['x1', 'x2', 'x3'].every(function (id) { return has(r, id, 'cpr'); }), ['x1', 'x2', 'x3'].map(function (id) { return list(r, id); }).join(' / '));
      var inList = r.alerts.filter(function (a) { return a.adsetId === 's2' && a.code === 'cpr'; });
      eq(inList.length, 1);
      eq((inList[0].setMerged || []).length, 2);
      ok(/إعلانان آخران/.test(inList[0].detail) && /المجموعة الإعلانية/.test(inList[0].advice), inList[0].detail);
      // مجموعة فيها إعلان واحد عليه تنبيه: من غير دمج
      ok(!r.alerts.some(function (a) { return a.adsetId === 's1' && a.setMerged; }));
    });
    test('«ارتفاع مفاجئ في إنفاق الحساب» بعد ما المعلن رفع الميزانية بنفسه: بيفضل «مهم» وبيقول السبب (ISA-18.2)', function () {
      var raise = [{ date: KEYS[5], kind: 'budget', level: 'campaign', from: 10000, to: 30000 }];
      var ads = [ad('a1', { daily: [100, 100, 100, 100, 100, 300, 100], res: steady(5), key: 'lead', edits: raise }), ad('a2', { daily: [100, 100, 100, 100, 100, 300, 100], res: steady(5), key: 'lead' })];
      ads[0].edits = raise;
      var r = withLang('ar', function () { return engine(ads); });
      var sp = r.alerts.filter(function (a) { return a.code === 'acct-spike'; })[0];
      ok(sp && sp.level === 'warning' && /رفع ميزانية الحملة من ١٠٠ ر\.س إلى ٣٠٠ ر\.س/.test(sp.detail) && /أمس/.test(sp.detail), sp ? sp.detail : r.alerts.map(function (a) { return a.code; }).join(' '));
      // من غير رفع: نفس التنبيه من غير الجملة
      ads[0].edits = [];
      var r2 = withLang('ar', function () { return engine(ads); });
      var sp2 = r2.alerts.filter(function (a) { return a.code === 'acct-spike'; })[0];
      ok(sp2 && !/رفع ميزانية/.test(sp2.detail), sp2 ? sp2.detail : 'none');
    });
    // التدقيق الشامل ١١ نوفمبر ٢٠٢٦ (ن٣٣): تعديلات سناب شات بالمايكرو (e.unit — snapchat.js snapEditsOf)، والجملة دي كانت بتقسم على
    // ١٠٠ دايماً (وحدة Meta)، فرفع ميزانية من ١٠٠ لـ٣٠٠ كان بيتكتب «من ١٬٠٠٠٬٠٠٠ إلى ٣٬٠٠٠٬٠٠٠»
    test('«ارتفاع مفاجئ في إنفاق الحساب» لحساب سناب شات رفع ميزانيته: المبلغ بوحدة سناب شات (مايكرو) مش ×١٠٬٠٠٠', function () {
      var raise = [{ date: KEYS[5], kind: 'budget', level: 'campaign', from: 100e6, to: 300e6, unit: 1e6 }];
      var ads = [ad('a1', { daily: [100, 100, 100, 100, 100, 300, 100], res: steady(5), key: 'lead', edits: raise }), ad('a2', { daily: [100, 100, 100, 100, 100, 300, 100], res: steady(5), key: 'lead' })];
      ads[0].edits = raise;
      var r = withLang('ar', function () { return engine(ads); });
      var sp = r.alerts.filter(function (a) { return a.code === 'acct-spike'; })[0];
      ok(sp && /رفع ميزانية الحملة من ١٠٠ ر\.س إلى ٣٠٠ ر\.س/.test(sp.detail), sp ? sp.detail : 'none');
    });
    // الحكم بحدودك (٢٥ أكتوبر): صفر نتائج بإنفاق ضعف التكلفة المعتادة = عاجل (كان «لم يُحكم بعد» لأن الصفر «ممكن يكون صدفة»)، وقبل
    // التكلفة نفسها «لم يُحكم بعد» بالمبلغ — ومش «جيد» من غير سبب في الحالتين
    test('صفر نتائج: «لم يُحكم بعد» قبل تكلفة نتيجة واحدة بالمبلغ اللي محتاجه، و«عاجل» بعد ٣ أضعاف التكلفة المعتادة (أو ضعف حدك)', function () {
      var mk = function (d, settings) {
        return withLang('ar', function () {
          return engine([ad('g1', { daily: steady(100), res: steady(5), key: 'lead' }), ad('g2', { daily: steady(100), res: steady(5), key: 'lead' }),
            ad('z', { daily: d, res: steady(0), key: 'lead' })], {}, settings);
        });
      };
      // من غير أقصى تكلفة (قرار صاحب المنتج ٢٥ أكتوبر، الجولة الرابعة): «مهم» مهما صرف، وسببه بيقول حدّدها
      var hot = mk([11, 11, 11, 11, 11, 11, 0]);
      var hz = hot.byAd.z.issues.filter(function (i) { return /^waste/.test(i.code); })[0];
      ok(hz && hz.level === 'warning' && /لم تحدد أقصى تكلفة لكل عميل محتمل/.test(hz.levelWhy), hz ? hz.level + ' ' + hz.levelWhy : list(hot, 'z'));
      // أقصى تكلفة محددة (رقمك): عاجل من ضعفها — ٦٦ وحدك ٢٠
      var mine = mk([11, 11, 11, 11, 11, 11, 0], { maxCost: { lead: 20 } });
      ok(mine.byAd.z.issues.some(function (i) { return /^waste/.test(i.code) && i.level === 'critical' && /أي ضعف أقصى تكلفة حددتها لكل عميل محتمل \(٢٠ ر\.س\) أو أكثر/.test(i.levelWhy); }), list(mine, 'z'));
      // أقصى تكلفة للعميل المحتمل ٥٠: ٣٠ من غير ولا عميل = لسه قبل التكلفة المسموحة — «لم يُحكم بعد» بالمبلغ
      var r = mk([5, 5, 5, 5, 5, 5, 0], { maxCost: { lead: 50 } });
      ok(!r.byAd.z.issues.some(function (i) { return i.level === 'critical' || i.level === 'warning'; }), list(r, 'z'));
      eq([r.byAd.z.health, r.byAd.z.pending], ['pending', 'little']);
      ok(/دون أي عملاء محتملين/.test(r.byAd.z.basis || '') && /حين يبلغ إنفاقه ٥٠ ر\.س \(أقصى تكلفة حددتها لكل عميل محتمل\)/.test(r.byAd.z.basis || ''), r.byAd.z.basis);
    });
    test('كل نصوص المحرك من غير متغير ناقص ({rest} وغيره) ولا undefined ولا NaN — بالعربي والإنجليزي، على حساب فيه أغلب الحالات', function () {
      var ads = [ad('g1', { daily: steady(100), res: steady(5), key: 'lead' }), ad('g2', { daily: steady(100), res: steady(5), key: 'lead' }),
        ad('cheap', { daily: steady(100), res: [5, 5, 5, 10, 10, 10, 5], key: 'lead' }),                 // فرصة زيادة (نصيحتها كان فيها {rest})
        ad('dear', { daily: steady(100), res: [1, 1, 1, 1, 1, 1, 1], key: 'lead' }),                     // تكلفة مرتفعة
        ad('dry', { daily: steady(100), res: steady(0), key: 'lead' }),                                  // أسبوع دون نتائج
        ad('fat', { daily: steady(100), res: steady(5), key: 'lead', freq: 9, age: 120 }),
        ad('s1', { daily: steady(100), res: steady(2), sales: steady(600) }), ad('s2', { daily: steady(100), res: steady(2), sales: steady(600) }),
        ad('lossy', { daily: steady(150), res: steady(3), sales: steady(45) }), ad('star', { daily: steady(100), res: steady(4), sales: steady(1800) }),
        ad('few', { daily: [9, 8, 8, 8, 9, 8, 0], res: steady(0), key: 'lead' }), ad('new', { daily: [0, 0, 0, 0, 0, 80, 40], res: steady(0), key: 'lead', age: 1 })];
      ['ar', 'en'].forEach(function (lang) {
        var r = withLang(lang, function () { return engine(ads); });
        var bad = [];
        Object.keys(r.byAd).forEach(function (id) {
          var a = r.byAd[id], txt = [a.basis || '', a.pendingTitle || ''].concat(a.issues.map(function (i) { return [i.title, i.detail, i.advice, i.inline || '', i.levelWhy || ''].join(' '); })).join(' ');
          if (/undefined|NaN|\{[a-zA-Z0-9]+\}/.test(txt)) bad.push(lang + ' ' + id + ': ' + txt.match(/.{0,30}(undefined|NaN|\{[a-zA-Z0-9]+\}).{0,30}/)[0]);
        });
        r.alerts.forEach(function (a) { var x = [a.title, a.detail, a.advice].join(' '); if (/undefined|NaN|\{[a-zA-Z0-9]+\}/.test(x)) bad.push(lang + ' alert ' + a.code); });
        eq(bad, []);
        ok(r.byAd.cheap.issues.some(function (i) { return i.code === 'scale'; }), lang + ' scale: ' + list(r, 'cheap'));
      });
    });
    test('التكاليف الصغيرة بخانات كفاية: ٠٫٠٧ مش ٠٫١، و٠٫٠٠٤ مش ٠', function () {
      withLang('ar', function () {
        eq([money(0.07, 'USD'), money(0.004, 'USD'), money(0.45, 'USD'), money(2.36, 'USD'), money(12.4, 'USD')], ['٠٫٠٧ $', '٠٫٠٠٤ $', '٠٫٤٥ $', '٢٫٤ $', '١٢ $']);
      });
    });

    // ---- مستويات التنبيه (صاحب المنتج ٢٥ أكتوبر: «لم أفهم سبب أن بعض الإعلانات عاجل وأخرى مهم رغم أنه نفس السبب») ----
    var LEVEL_RANK_T = { none: 0, info: 1, warning: 2, critical: 3 };
    // صاحب المنتج ٢٥ أكتوبر (الجولة التالتة، كروت حساب حقيقي بإعداداته: المستهدف ×١٨، حد الخسارة ×١٥، أقصى تكلفة للطلب ٢٠): «كل هذه
    // الإعلانات عاجلة لأنها خاسرة: العائد أقل من المطلوب، أو تكلفة الطلب أعلى من الحد الأقصى، أو مر عليها ٣ أيام بدون أي مشتريات»
    test('الحكم بحدودك — كروت صاحب المنتج: تحت العائد المستهدف أو فوق أقصى تكلفة أو ٣ أيام دون مشتريات = عاجل بعد ضعف أقصى التكلفة، و«مهم» قبلها بالمبلغ', function () {
      var r = withLang('ar', function () {
        return engine([
          ad('pc', { daily: [32, 32, 32, 32, 32, 32, 0], res: [1, 1, 1, 1, 1, 0, 0], sales: [117, 117, 117, 116, 116, 0, 0] }),     // ×٣
          ad('vga', { daily: [13, 13, 13, 13, 14, 14, 0], res: [1, 1, 1, 1, 1, 0, 0], sales: [77, 77, 77, 77, 76, 0, 0] }),         // ×٤٫٨ — كان «أقل من المستهدف»
          ad('emg', { daily: [12, 12, 12, 12, 11, 11, 0] }),                                                                          // ٧٠ دون أي طلب
          ad('mon', { daily: [8, 8, 8, 9, 9, 9, 0], res: [0, 0, 1, 0, 0, 0, 0], sales: [0, 0, 13, 0, 0, 0, 0] }),                    // ×٠٫٢٥
          ad('cost', { daily: [20, 20, 20, 20, 20, 20, 0], res: [1, 1, 0, 1, 1, 0, 0], sales: [600, 600, 0, 600, 600, 0, 0] }),     // ×٢٠ فوق المستهدف والطلب بـ٣٠
          ad('near', { daily: [10, 10, 10, 10, 10, 10, 0], res: [0, 1, 0, 0, 1, 0, 0], sales: [0, 600, 0, 0, 600, 0, 0] }),         // ×٢٠ والطلب بـ٣٠ بطلبين
          ad('early', { daily: [5, 5, 5, 5, 5, 5, 0], res: [0, 0, 0, 1, 0, 0, 0], sales: [0, 0, 0, 200, 0, 0, 0] })                  // ×٦٫٧ بـ٣٠ بس
        ], {}, { roasTarget: 18, maxCost: { purchase: 20 } });
      });
      var top = function (id) { return r.byAd[id].issues.filter(function (i) { return i.level === 'critical' || i.level === 'warning'; })[0] || {}; };
      eq([top('pc').code, top('pc').level], ['loss', 'critical'], list(r, 'pc'));
      eq([top('vga').code, top('vga').level], ['loss', 'critical'], list(r, 'vga'));
      ok(!has(r, 'vga', 'low-roas'), 'the target is the only line now: one «loss» issue, no separate «below target»: ' + list(r, 'vga'));
      eq([top('emg').code, top('emg').level], ['waste-week', 'critical'], list(r, 'emg'));
      eq(top('mon').level, 'critical', list(r, 'mon'));
      // عائده ×٢٠ فوق المستهدف بس الطلب بـ٣٠ والحد ٢٠ بـ٤ طلبات: أقصى التكلفة لوحدها عاجل
      ok(top('cost').code === 'cost-max' && top('cost').level === 'critical' && !/أقل من المستهدف/.test(top('cost').detail), top('cost').code + ' ' + top('cost').level + ' ' + top('cost').detail);
      // والخطين مع بعض على إعلان واحد (pc: ×٣ تحت المستهدف وطلبه بـ٣٨): الخسارة هي المضيف وجملة التكلفة جوّاها
      ok(top('pc').detail.indexOf('أعلى من أقصى تكلفة حددتها') > -1, top('pc').detail);
      // نفس التكلفة بطلبين بعد ٦٠ (ضعف الحد أو أكتر): عاجل — من غير استثناء «طلب تالت كان هينزّلها» (قرار صاحب المنتج، الجولة الرابعة)
      ok(top('near').code === 'cost-max' && top('near').level === 'critical', top('near').code + ' ' + top('near').level + ' ' + top('near').levelWhy);
      // ٣٠ بس (بين أقصى التكلفة وضعفها): «مهم» وسببه بيقول إمتى يبقى عاجل
      ok(top('early').code === 'loss' && top('early').level === 'warning' && /ويصبح عاجلاً إذا بلغ إنفاقه ٤٠ ر\.س/.test(top('early').levelWhy), top('early').level + ' ' + top('early').levelWhy);
      eq(top('pc').levelWhy, 'عاجل لأن عائده ×٣ تحت العائد المستهدف الذي حددته (×١٨) بعد إنفاق ١٩٢ ر.س، أي ضعف أقصى تكلفة حددتها لكل عملية شراء (٢٠ ر.س) أو أكثر.');
      ok(/^عاجل لأن تكلفة كل عملية شراء فيه ٣٠ ر\.س فوق أقصى تكلفة حددتها \(٢٠ ر\.س\)/.test(top('cost').levelWhy), top('cost').levelWhy);
      ok(/^عاجل لأنه أنفق ٧٠ ر\.س دون أي/.test(top('emg').levelWhy), top('emg').levelWhy);
      // ولا كلمة «صدفة» في أي سبب (قرار صاحب المنتج ١٠ أكتوبر)
      ok(Object.keys(r.byAd).every(function (id) { return r.byAd[id].issues.every(function (i) { return !/صدفة/.test((i.levelWhy || '') + i.detail + (r.byAd[id].basis || '')); }); }), 'no «صدفة»');
    });
    test('نفس الإعلان بنفس الأرقام = نفس المستوى في حساب صغير وفي حساب كبير (كان التصحيح بعدد اختبارات كل حساب بيغيّره)', function () {
      var lossy = function (src) { return ad('L', { source: src, daily: steady(60), res: [1, 0, 1, 0, 1, 0, 0], sales: [80, 0, 80, 0, 80, 0, 0] }); };
      var fill = function (src, n) { var a = []; for (var i = 0; i < n; i++) a.push(ad('f' + src.length + i, { source: src, daily: steady(60), res: steady(1), sales: steady(400) })); return a; };
      var small = engine([lossy('meta:act_1')].concat(fill('meta:act_1', 2)), {}, { roasTarget: 6, roasBreakEven: 5, maxCost: { purchase: 60 } });
      var big = engine([lossy('meta:act_1')].concat(fill('meta:act_1', 30)), {}, { roasTarget: 6, roasBreakEven: 5, maxCost: { purchase: 60 } });
      var lv = function (r) { var i = r.byAd.L.issues.filter(function (x) { return x.code === 'loss'; })[0]; return i ? i.level : 'none'; };
      ok(lv(small) !== 'none', list(small, 'L'));
      // الإعلان في الحساب الكبير حصته أصغر (درجة الخطورة)، فممكن يبقى أقل — بس مش أعلى. نفس الحصة = نفس المستوى (تحت)
      var sameShare = engine([lossy('meta:act_1')].concat(fill('meta:act_1', 2)).concat([lossy('meta:act_2')]).concat(fill('meta:act_2', 2)).map(function (c, k) { c.id = c.id + '_' + k; return c; }), {}, { roasTarget: 6, roasBreakEven: 5 });
      var levels = Object.keys(sameShare.byAd).filter(function (id) { return id.indexOf('L_') === 0; }).map(function (id) { var i = sameShare.byAd[id].issues.filter(function (x) { return x.code === 'loss'; })[0]; return i ? i.level : 'none'; });
      eq(levels.length, 2);
      eq(levels[0], levels[1], 'two accounts, same numbers, same level');
      ok(LEVEL_RANK_T[lv(big)] <= LEVEL_RANK_T[lv(small)], lv(big) + ' vs ' + lv(small));
    });
    test('كل تنبيه عاجل أو مهم بيقول ليه بالأرقام (الخط اللي اتخطّى والإنفاق، أو السبب اللي خلّاه «مهم»)', function () {
      var r = withLang('ar', function () {
        return engine([ad('g1', { daily: steady(100), res: steady(2), sales: steady(600) }), ad('g2', { daily: steady(100), res: steady(2), sales: steady(600) }),
          ad('lossy', { daily: steady(150), res: steady(3), sales: steady(45) }), ad('low', { daily: steady(300), res: steady(6), sales: steady(600) })], {}, { maxCost: { purchase: 60 } });
      });
      var all = [];
      Object.keys(r.byAd).forEach(function (id) { r.byAd[id].issues.forEach(function (i) { if (i.level === 'critical' || i.level === 'warning') all.push(i); }); });
      ok(all.length >= 2, all.map(function (i) { return i.code; }).join(' '));
      ok(all.every(function (i) { return typeof i.levelWhy === 'string' && i.levelWhy.length > 10 && !/\{/.test(i.levelWhy); }), all.map(function (i) { return i.code + ':' + i.levelWhy; }).join(' | '));
      var crit = all.filter(function (i) { return i.level === 'critical'; })[0], low = r.byAd.low.issues.filter(function (i) { return i.code === 'loss'; })[0];
      ok(crit && /^عاجل لأن/.test(crit.levelWhy) && !/صدفة/.test(crit.levelWhy), crit ? crit.levelWhy : 'no critical');
      // العائد ×٢ تحت المستهدف ×٣ بإنفاق ١٬٨٠٠ (ضعف أقصى التكلفة ٦٠ أو أكتر) = عاجل بالخط نفسه
      ok(low && /^عاجل لأن عائده ×٢ تحت العائد المستهدف/.test(low.levelWhy), low ? low.levelWhy : list(r, 'low'));
      // في القائمة كمان (نسخة التنبيه)
      ok(r.alerts.filter(function (a) { return a.level === 'critical' || a.level === 'warning'; }).every(function (a) { return !a.adId || a.levelWhy; }));
    });
    // الجولة التالتة (٢٥ أكتوبر — الحكم بحدودك): تكلفتها العالية مستواها من حد الإعدادات زي أي نتيجة (كانت «مهم» دايماً في الجولة التانية)
    test('نتائج أعلى المسار (نقرات وزيارات): مفيش «فرصة لزيادة الاستثمار»، وتكلفتها العالية بحد الإعدادات زي أي نتيجة', function () {
      var mk = function (key) {
        return withLang('ar', function () {
          return engine([ad('g1', { daily: steady(100), res: steady(50), key: key }), ad('g2', { daily: steady(100), res: steady(50), key: key }),
            ad('cheap', { daily: steady(100), res: [50, 50, 50, 100, 100, 100, 50], key: key }),
            ad('dear', { daily: steady(300), res: steady(30), key: key })]);
        });
      };
      var clicks = mk('click'), leads = mk('lead');
      ok(!has(clicks, 'cheap', 'scale'), 'clicks: ' + list(clicks, 'cheap'));
      ok(has(leads, 'cheap', 'scale'), 'leads: ' + list(leads, 'cheap'));
      var dc = clicks.byAd.dear.issues.filter(function (i) { return i.code === 'cpr'; })[0], dl = leads.byAd.dear.issues.filter(function (i) { return i.code === 'cpr'; })[0];
      // المقارنة بالباقي «مهم» بس (الجولة الرابعة)، وسببه بيقول إن العاجل في التكلفة بأقصى تكلفة تحددها
      ok(dc && dc.level === 'warning' && /حين تحدد أقصى تكلفة لكل نقرة/.test(dc.levelWhy), dc ? dc.level + ' ' + dc.levelWhy : list(clicks, 'dear'));
      ok(dl && dl.level === 'warning', dl ? dl.level : list(leads, 'dear'));
    });
    test('إعلانين مختلفين بنفس الاسم في مجموعتين وعلى كل واحد تنبيه: اسم المجموعة الإعلانية جنب الاسم في القائمة (مش تناقض ظاهري)', function () {
      var x = ad('x', { aid: 'sa', daily: steady(300), res: steady(1), key: 'lead' }), y = ad('y', { aid: 'sb', daily: steady(100), res: steady(0), key: 'lead' });
      x.offer = y.offer = 'Same creative'; x.adsetName = 'Set A'; y.adsetName = 'Set B';
      candidates = [ad('g1', { daily: steady(100), res: steady(5), key: 'lead' }), ad('g2', { daily: steady(100), res: steady(5), key: 'lead' }), x, y];
      withLang('ar', function () {
        runAnalysis();
        var al = analysis.alerts.filter(function (a) { return a.adName === 'Same creative' && (a.level === 'critical' || a.level === 'warning'); });
        eq(al.length, 2, al.map(function (a) { return a.code; }).join(' '));
        var html = al.map(function (a) { return alertMarkup(a, 0) + attnAlertHtml(a); }).join('');
        ok(/Set A/.test(html) && /Set B/.test(html), html.slice(0, 300));
        // اسم من غير تكرار: من غير إضافة
        var g = analysis.alerts.filter(function (a) { return a.adName !== 'Same creative' && a.adId; })[0];
        ok(!g || !/المجموعة الإعلانية:/.test(alertMarkup(g, 0)));
      });
      candidates = []; runAnalysis();
    });

    // مراجعة ١ نوفمبر ٢٠٢٦، الطبقة ٨ (جولة المُختبِر): اسم الإعلان جاي من المنصة، ومين عنده صلاحية على
    // الحساب الإعلاني يقدر يحطّ فيه أي نص. بنعدّيه في مسار العرض الحقيقي ونتأكد إنه بيبان كنص لا ككود.
    // OWASP XSS Prevention Cheat Sheet — القاعدة ١ (الهروب قبل الحقن في HTML)
    test('اسم إعلان فيه وسوم: بيتعرض كنص، ومبيبقاش عنصراً في الصفحة', function () {
      var PAYLOAD = '<img src=x onerror=e()>" onmouseover=\'f()\'';
      var bad = ad('inj', { aid: 'sa', daily: steady(400), res: steady(0), key: 'lead' });
      bad.offer = PAYLOAD;
      candidates = [ad('g1', { daily: steady(100), res: steady(5), key: 'lead' }), ad('g2', { daily: steady(100), res: steady(5), key: 'lead' }), bad];
      withLang('ar', function () {
        runAnalysis();
        var al = analysis.alerts.filter(function (a) { return a.adName === PAYLOAD; });
        ok(al.length, 'لازم يطلع تنبيه على الإعلان ده');
        var html = al.map(function (a) { return alertMarkup(a, 0) + attnAlertHtml(a); }).join('');
        var doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
        // مفيش عنصر اتولد من النص، ولا سمة بتشغّل كود
        eq(doc.querySelectorAll('img, script, iframe, object, embed, svg').length, 0, 'عنصر اتحقن: ' + html.slice(0, 400));
        eq(doc.querySelectorAll('[onerror], [onmouseover], [onload], [onclick]').length, 0, 'سمة بتشغّل كود: ' + html.slice(0, 400));
        // وبيبان للعميل كنص كامل (مش متشال ولا متقصقص) — ده اللي بيفرّق بين هروب صح وحذف
        ok(doc.body.textContent.indexOf('<img src=x onerror=e()>') > -1, 'النص نفسه لازم يبان: ' + doc.body.textContent.slice(0, 200));
        // ونفس النص في بطاقة الإعلان ومعاينتها (مسار تاني بيعرض نصوص الإعلان)
        var card = new DOMParser().parseFromString('<body>' + cardMarkup(bad) + previewMarkup(bad) + '</body>', 'text/html');
        eq(card.querySelectorAll('img[src="x"], script, iframe, object, embed').length, 0, 'عنصر اتحقن في البطاقة');
        eq(card.querySelectorAll('[onerror], [onmouseover], [onload], [onclick]').length, 0, 'سمة بتشغّل كود في البطاقة');
      });
      candidates = []; runAnalysis();
    });

    // ---- مراجعة الإعدادات (٢٤ أكتوبر — قرارات صاحب المنتج) ----
    test('حساب من غير مستهدف وحد خسارة: حكم الربح بيستنى («حدّد هدف الربح») ومفيش تنبيه ربح ولا فرصة، والهدر شغّال', function () {
      var ads = [ad('g1', { daily: steady(100), res: steady(2), sales: steady(600) }), ad('g2', { daily: steady(100), res: steady(2), sales: steady(600) }),
        ad('lossy', { daily: steady(150), res: steady(3), sales: steady(45) }),      // ×٠٫٣ بدليل
        ad('star', { daily: steady(100), res: steady(4), sales: steady(1800) }),     // ×١٨ (كانت «عائد ممتاز» و«فرصة»)
        ad('dry', { daily: steady(120) })];                                          // صفر طلبات
      var r = withLang('ar', function () { return engine(ads, {}, { noGoal: true }); });
      eq([r.byAd.lossy.pending, r.byAd.star.pending], ['noTarget', 'noTarget']);
      // ومنها فخ JavaScript: «رقم ≥ قيمة فاضية» = صح — «فرصة الزيادة» و«نتائج جيدة بإنفاق قليل» كانوا هيطلعوا على أي إعلان مبيعات
      ok(!r.alerts.some(function (a) { return /^(loss|low-roas|roas-great|roas-drop|scale|underspend-win)$/.test(a.code); }), r.alerts.map(function (a) { return a.code; }).join(' '));
      ok(/حدّد/.test(r.byAd.lossy.basis), r.byAd.lossy.basis);
      ok(r.byAd.dry.issues.some(function (i) { return /^waste/.test(i.code) && i.level === 'warning'; }), list(r, 'dry'));
      // ونفس الحساب بمستهدف محدد: الخسارة بتطلع
      var withGoal = engine(ads);
      ok(has(withGoal, 'lossy', 'loss'), list(withGoal, 'lossy'));
    });
    test('أقصى تكلفة مقبولة لكل نتيجة: أعلى منها بدليل = تنبيه، وقيمة الحملة مقدَّمة على قيمة الحساب', function () {
      // الإعلانين ٢٥ للعميل (زي بعض، فمفيش «تكلفة مرتفعة» بالمقارنة) — كل الحساب غالي على النشاط ومكانش فيه ولا تنبيه
      var ads = function () { return [ad('l1', { daily: steady(100), res: steady(4), key: 'lead', cid: 'cA' }), ad('l2', { daily: steady(100), res: steady(4), key: 'lead', cid: 'cB' })]; };
      var r = withLang('ar', function () { return engine(ads(), {}, { maxCost: { lead: 10 } }); });
      ok(has(r, 'l1', 'cost-max') && has(r, 'l2', 'cost-max'), list(r, 'l1') + ' | ' + list(r, 'l2'));
      var d = r.byAd.l1.issues.filter(function (i) { return i.code === 'cost-max'; })[0];
      ok(/في هذا الحساب/.test(d.detail), d.detail);
      // الحملة A مقبولها ٥٠ للعميل (منتجات أغلى): إعلانها مبيطلعش عليه، والحملة B بقيمة الحساب
      var r2 = withLang('ar', function () { return engine(ads(), {}, { maxCost: { lead: 10 }, campaignMaxCost: { cA: 50 } }); });
      ok(!has(r2, 'l1', 'cost-max') && has(r2, 'l2', 'cost-max'), list(r2, 'l1') + ' | ' + list(r2, 'l2'));
      ok(!has(engine(ads()), 'l1', 'cost-max'), 'no limit set: no alert');
    });
    test('حساب فيه إعلان واحد ومحدد له أقصى تكلفة: بيتحكم عليه بيها بدل «لا يوجد ما نقارن به»', function () {
      var one = [ad('solo', { daily: steady(100), res: steady(10), key: 'lead' })];   // ١٠ للعميل
      eq(engine(one).byAd.solo.pending, 'noRef');
      var r = withLang('ar', function () { return engine(one, {}, { maxCost: { lead: 20 } }); });
      eq([health(r, 'solo'), r.byAd.solo.pending], ['good', null]);
      ok(/أقصى التكلفة المقبولة/.test(r.byAd.solo.basis), r.byAd.solo.basis);
    });
    test('إعدادات كل حساب إعلاني لوحده (bySource): متجرين بمستهدفين مختلفين بيتحكم عليهم كل واحد بمستهدفه', function () {
      var A = ad('a', { daily: steady(100), res: steady(2), sales: steady(150), source: 'meta:act_A' });   // ×١٫٥
      var B = ad('b', { daily: steady(100), res: steady(2), sales: steady(150), source: 'meta:act_B' });   // نفس الأرقام
      var r = PauseProofAlerts.analyze([A, B], {}, { bySource: { 'meta:act_A': { roasTarget: 6 }, 'meta:act_B': { roasTarget: 1.2 } } }, ALERT_FMT);
      ok(has(r, 'a', 'loss') && !has(r, 'b', 'loss'), list(r, 'a') + ' | ' + list(r, 'b'));
      eq([r.settingsBySource['meta:act_A'].roasTarget, r.settingsBySource['meta:act_B'].roasTarget], [6, 1.2]);
    });
    test('إعلان جديد = «لم يُحكم بعد» بسببه، وإنفاق كبير من غير نتائج وهو جديد = «مهم»', function () {
      var r = engine(baseAccount().concat([ad('n1', { daily: [0, 0, 0, 0, 0, 10, 5], age: 1 }), ad('n2', { daily: [0, 0, 0, 0, 0, 200, 100], age: 1 })]));
      eq([health(r, 'n1'), r.byAd.n1.pending], ['pending', 'learning']);
      ok(/فترة/.test(r.byAd.n1.basis) || /توزيعه/.test(r.byAd.n1.basis), r.byAd.n1.basis);
      ok(has(r, 'n2', 'waste-new', 'warning') && health(r, 'n2') === 'improve', list(r, 'n2'));
      // المبلغ أيام مكتملة (لحد أمس) — والجملة بتقول كده (مراجعة المرحلة ٤ ر٦٨)
      var n2 = withLang('ar', function () { return engine(baseAccount().concat([ad('n2', { daily: [0, 0, 0, 0, 0, 200, 100], age: 1 })])); }).byAd.n2.issues.filter(function (i) { return i.code === 'waste-new'; })[0];
      ok(n2 && n2.detail.indexOf('منذ بدايته حتى أمس') > -1, n2 ? n2.detail : 'no issue');
    });
    test('نشط ومصرفش = «لم يُحكم بعد» مش «جيد»', function () {
      var r = engine(baseAccount().concat([ad('idle', { daily: steady(0) })]));
      eq([health(r, 'idle'), r.byAd.idle.pending], ['pending', 'noSpend']);
    });
    test('الربح أولاً: عائد ×٤ والمستهدف ×٣ = «جيد» حتى لو فيه إعلان أرخص، وأفضل إعلان بتكرار عالي = «جيد» والتكرار للعلم', function () {
      var r = engine(salesBase().concat([ad('best', { daily: steady(100), res: [5, 5, 5, 5, 5, 5, 3], sales: steady(2000), freq: 7, cid: 'kc' })]));
      eq([health(r, 'a'), health(r, 'b'), health(r, 'best')], ['good', 'good', 'good']);
      ok(!has(r, 'a', 'cpr'), 'profit ads are judged by profit, not by the cheapest ad: ' + list(r, 'a'));
      ok(has(r, 'best', 'fatigue', 'info'), list(r, 'best'));
      // السبب مكتوب: عائده ومستهدفه بس — من غير «متوسط عائد إعلانات المبيعات في حسابك» (قرار صاحب المنتج ٢٥ أكتوبر: الإعدادات بس)
      ok(/×٤/.test(r.byAd.a.basis) && !/متوسط عائد إعلانات المبيعات في حسابك/.test(r.byAd.a.basis), r.byAd.a.basis);
    });
    test('خسارة طول الأسبوع (عائد ×٠٫٣ بـ٢٤ طلباً) = عاجل «عائد أقل من التكلفة»، من غير مقارنة بمتوسط الحساب', function () {
      var HI = { maxCost: { purchase: 250 } };
      var r = engine(salesBase().concat([ad('lose', { daily: steady(100), res: steady(4), sales: steady(30), cid: 'kd' })]), {}, HI);
      var i = r.byAd.lose.issues.filter(function (x) { return x.code === 'loss'; })[0];
      ok(i && i.level === 'critical' && /آخر ٦ أيام/.test(i.detail) && !/إعلانات المبيعات في حسابك/.test(i.detail), i ? i.detail : list(r, 'lose'));
      // ٣ طلبات بعائد ×٠٫٧ على ٦٠٠ وأقصى تكلفة ٢٥٠: تحت حد الخسارة بعد ضعف الحد = عاجل — من غير استثناء «طلب كمان كان هيرجّعه»
      // (قرار صاحب المنتج ٢٥ أكتوبر، الجولة الرابعة)
      var weak = withLang('ar', function () { return engine(salesBase().concat([ad('lose', { daily: steady(100), res: [1, 0, 1, 0, 1, 0, 0], sales: [140, 0, 140, 0, 140, 0, 0], cid: 'kd' })]), {}, HI); });
      var wl = weak.byAd.lose.issues.filter(function (x) { return x.code === 'loss'; })[0];
      ok(wl && wl.level === 'critical', wl ? wl.level + ' ' + wl.levelWhy : list(weak, 'lose'));
      // ٩٠ وأقصى تكلفة ٥٠: بين الحد وضعفه = «مهم»
      var early = engine(salesBase().concat([ad('lose', { daily: [15, 15, 15, 15, 15, 15, 0], res: [0, 0, 1, 0, 0, 0, 0], sales: [0, 0, 40, 0, 0, 0, 0], cid: 'kd' })]), {}, { maxCost: { purchase: 50 } });
      ok(has(early, 'lose', 'loss', 'warning') && !has(early, 'lose', 'loss', 'critical'), list(early, 'lose'));
    });
    // الجولة الرابعة (٢٥ أكتوبر): الخط الأصفر كمان بالرقم المقاس زي ما هو — كان «الفرق أكبر من طلب» (طلب زيادة بيرجّعه للمستهدف = مفيش تنبيه)
    test('عائد تحت المستهدف بفرق أقل من طلب واحد = «أقل من المستهدف» برضه (الرقم المقاس مقابل الخط، من غير استثناء)', function () {
      // ×٢٫٨٣ والمستهدف ×٣: طلب زيادة بقيمة ٢٠٠ كان هيرجّعه ×٣٫١٧
      var x = ad('near', { daily: steady(100), res: [2, 2, 1, 1, 2, 1, 0], sales: [380, 380, 190, 190, 370, 190, 0], cid: 'kn' });
      var r = engine(salesBase().concat([x]));
      ok(has(r, 'near', 'loss', 'warning'), list(r, 'near'));
    });
    // قرار صاحب المنتج ٢٥ أكتوبر: «لا تقارنها بمتوسط الحساب، فقط قارنها بالاعدادات المسجلة لتكون دقيقة» — كانت جملة «أفضل من متوسط
    // حسابك، فقد يكون السبب الفترة» ونصيحة مختلفة («ابدأ بالحساب كله») للإعلان الأحسن من متوسط حساب شامل الإعلان نفسه
    test('عائد أقل من المستهدف وأحسن من باقي إعلاناتك: الجملة والنصيحة بإعداداتك بس، من غير مقارنة بمتوسط الحساب', function () {
      var weak = [ad('w1', { daily: steady(300), res: steady(6), sales: steady(360), cid: 'k1' }), ad('w2', { daily: steady(300), res: steady(6), sales: steady(360), cid: 'k2' }),
        ad('mid', { daily: steady(300), res: steady(6), sales: steady(480), cid: 'k3' })];
      var i = withLang('ar', function () { return engine(weak); }).byAd.mid.issues.filter(function (x) { return x.code === 'loss'; })[0];
      ok(i && !/متوسط|حسابك/.test(i.detail), i ? i.detail : 'no loss');
      eq(i.advice, withLang('ar', function () { return t('al.lowRoas.a'); }));
      ['al.vsAcc', 'al.vsAccNoCur', 'al.vsAccBetter', 'basis.vsAcc', 'al.loss.aBetter', 'al.lowRoas.aBetter'].forEach(function (k) { eq(t(k), k, 'text removed: ' + k); });
    });
    // من ٨ نوفمبر ٢٠٢٦: المستهدف هو الحد الوحيد، والمبلغ = اللي كان الإنفاق ده المفروض يجيبه بالمستهدف ناقص اللي جابه فعلاً.
    // وبيدخل «المعرّض للهدر» (لوحة «ما حققته مع الأداة») لو المبيعات أقل من الإنفاق نفسه بس — الإعلان اللي بيكسب وتحت المستهدف لأ
    test('العائد تحت المستهدف (×٢ والمستهدف ×٥): الجملة بالمستهدف، والمبلغ الناقص عنه — وهدر بس لو المبيعات أقل من الإنفاق', function () {
      // حساب حقيقي ١١ أكتوبر: «كل ١ ر.س عاد بـ ١٫٨ ر.س، أي أقل من التكلفة» — والمستهدف ×٥ من إعدادات العميل
      var x = ad('be', { daily: steady(100), res: steady(2), sales: steady(200), cid: 'kx' });
      var r = withLang('ar', function () { return engine(salesBase().concat([x]), {}, { roasTarget: 5 }); });
      var i = r.byAd.be.issues.filter(function (j) { return j.code === 'loss'; })[0];
      ok(i && i.title === t('al.lowRoas.t') && /×٥/.test(i.detail) && !/أقل من التكلفة/.test(i.detail), i ? i.title + ' | ' + i.detail : list(r, 'be'));
      // ٦٠٠ إنفاق و١٬٢٠٠ مبيعات بالمستهدف ×٥ = ناقص ١٬٨٠٠ — ومش هدر (المبيعات أكبر من الإنفاق)
      ok(i && i.money.kind === 'short' && i.amount === 1800 && !i.atRisk, i && JSON.stringify([i.money, i.amount, i.atRisk]));
      // المبيعات أقل من الإنفاق فعلاً (٢٤ طلباً بعائد ×٠٫٤): هدر — ومبلغه الناقص عن المستهدف برضه
      var y = ad('l1', { daily: steady(100), res: steady(4), sales: steady(40), cid: 'ky' });
      var j = engine(salesBase().concat([y]), {}, { maxCost: { purchase: 50 } }).byAd.l1.issues.filter(function (k) { return k.code === 'loss'; })[0];
      // ٦٠٠ إنفاق و٢٤٠ مبيعات: المبلغ هو الخسارة الحقيقية ٣٦٠ (مش النقص عن المستهدف ٢٬٧٦٠) — ده اللي بيدخل لوحة «ما حققته»
      ok(j && j.title === t('al.lowRoas.t') && j.money.kind === 'loss' && j.amount === 360 && j.atRisk, j ? j.title + ' ' + j.money.kind + ' ' + j.amount : 'no loss');
    });
    test('أسبوع فيه مبيعات بس آخر ٣ أيام من غير ولا بيعة: سطر صريح بدل ما متوسط الأسبوع يخبّيه', function () {
      // ١٨ طلباً بعائد ×٠٫٢٥ في الأسبوع (خسارة بدليل)، وآخر ٣ أيام من غير ولا بيعة بإنفاق ٩٠٠
      var z = ad('z3', { daily: steady(300), res: [6, 6, 6, 0, 0, 0, 0], sales: [150, 150, 150, 0, 0, 0, 0], cid: 'kz' });
      var i = withLang('ar', function () { return engine(salesBase().concat([z])); }).byAd.z3.issues.filter(function (k) { return k.code === 'loss'; })[0];
      ok(i && /ولم يحقق أي مبيعات في آخر ٣ أيام رغم إنفاق ٩٠٠ ر\.س/.test(i.detail), i ? i.detail : 'no loss');
    });
    test('الحساب كله نزل أمس: نزول الإعلان «للعلم» بسبب الحساب، مش «وصول ضعيف» على كل إعلان لوحده', function () {
      var mk = function (id, cid) { return ad(id, { daily: [100, 100, 100, 100, 100, 10, 10], res: [5, 5, 5, 5, 5, 1, 1], cid: cid }); };
      var r = engine([mk('w1', 'c1'), mk('w2', 'c2')]);
      ['w1', 'w2'].forEach(function (id) {
        var codes = r.byAd[id].issues.map(function (i) { return i.code; });
        ok(codes.indexOf('weak-delivery') < 0 && codes.indexOf('weak-acct') > -1, id + ': ' + codes.join(' '));
      });
      ok(r.alerts.some(function (a) { return a.code === 'acct-drop'; }), 'the account drop itself is the alert');
    });
    test('إنفاق الحساب نازل من يومين: «في آخر يومين» والمتوسط من الأيام اللي قبلهم، مش «أمس فقط»', function () {
      var mk = function (id, cid) { return ad(id, { daily: [100, 100, 100, 100, 20, 20, 5], res: steady(1), cid: cid }); };
      var a = withLang('ar', function () { return engine([mk('d1', 'c1'), mk('d2', 'c2')]); }).alerts.filter(function (x) { return x.code === 'acct-drop'; })[0];
      ok(a && /في آخر يومين إلى نحو ٤٠ ر\.س يومياً، مقابل متوسط ٢٠٠ ر\.س/.test(a.detail) && /−٨٠٪/.test(a.detail), a ? a.detail : 'no acct-drop');
    });
    test('إعلان كان بيصرف أقل من ١٪ من إنفاق الحساب يومياً: مفيش «كان ينفق نحو ٠ ر.س» ولا «وصول ضعيف»', function () {
      var tiny = ad('tn', { daily: [0.4, 0.4, 0.4, 0.4, 0.4, 0, 0], cid: 'c9' });
      var codes = engine(baseAccount().concat([tiny])).byAd.tn.issues.map(function (i) { return i.code; });
      ok(['shift', 'weak-delivery', 'no-spend-y', 'weak-acct'].every(function (k) { return codes.indexOf(k) < 0; }), codes.join(' '));
    });
    test('إعلان المبيعات الوحيد (أو ٩٠٪+ من إنفاقها) مبيتقارنش بـ«متوسط حسابك» — اللي هو نفسه', function () {
      var solo = engine([ad('solo', { daily: steady(100), res: steady(4), sales: steady(800), cid: 'ks' })]);
      var g = solo.byAd.solo.issues.filter(function (x) { return x.code === 'roas-great'; })[0];
      ok(g && !/متوسط|حسابك/.test(g.detail) && g.advice && !/حسابك|إعلاناتك/.test(g.advice), g ? g.detail + ' | ' + g.advice : list(solo, 'solo'));
      ok(/×٨/.test(solo.byAd.solo.basis) && !/متوسط عائد إعلانات المبيعات في حسابك/.test(solo.byAd.solo.basis), solo.byAd.solo.basis);
      // عائد ضعيف لإعلان وحيد: كان بيقول «أفضل من متوسط حسابك، فالسبب ممكن الفترة» وهو بيقارن نفسه بنفسه
      var weakSolo = engine([ad('ws', { daily: steady(100), res: steady(2), sales: steady(150), cid: 'kw' })]);
      var lw = weakSolo.byAd.ws.issues.filter(function (x) { return x.code === 'loss'; })[0];
      ok(lw && lw.detail.indexOf(t('al.vsAccBetter').trim().slice(0, 20)) === -1 && !/في الفترة نفسها/.test(lw.detail), lw ? lw.detail : list(weakSolo, 'ws'));
      // إعلانين بنص الإنفاق: ومن ٢٥ أكتوبر مفيش مقارنة بمتوسط الحساب أصلاً (الإعدادات بس)
      var two = engine([ad('p1', { daily: steady(100), res: steady(4), sales: steady(800), cid: 'k1' }), ad('p2', { daily: steady(100), res: steady(2), sales: steady(300), cid: 'k2' })]);
      ok(/×٨/.test(two.byAd.p1.basis) && !/متوسط عائد إعلانات المبيعات في حسابك/.test(two.byAd.p1.basis), two.byAd.p1.basis);
    });
    test('المنصة نقلت إنفاقه لإعلان تاني في نفس الحملة = «للعلم»، والإعلان المربح بيفضل «جيد»', function () {
      var r = engine([ad('x', { daily: [100, 100, 100, 100, 100, 0, 0], res: [2, 2, 2, 2, 2, 0, 0], sales: [400, 400, 400, 400, 400, 0, 0], cid: 'k' }),
        ad('y', { daily: [100, 100, 100, 100, 100, 200, 150], res: [2, 2, 2, 2, 2, 4, 3], sales: [400, 400, 400, 400, 400, 800, 600], cid: 'k' }),
        ad('z', { daily: steady(100), res: [2, 2, 2, 2, 2, 2, 1], sales: steady(400), cid: 'k2' })]);
      ok(has(r, 'x', 'shift', 'info') && !has(r, 'x', 'no-spend-y'), list(r, 'x'));
      eq(health(r, 'x'), 'good');
    });
    // قرار صاحب المنتج ٣ نوفمبر ٢٠٢٦: «إعلان أداؤه جيد لفترة ثم انخفض بفرق كبير آخر يومين يظل الحكم على الفترة كاملة أنه جيد» —
    // فآخر ٣ أيام مالهاش تنبيه لوحدها (وسم «▼ آخر ٣ أيام» على الكارت هو اللي بيقول التراجع)، والفترة كلها هي الحكم
    test('أسبوع قوي وآخر ٣ أيام بخسارة: الحكم على الفترة كلها، والتراجع وسم مش تنبيه', function () {
      // آخر ٣ أيام: ١٨ طلباً بمبيعات ١٢٠ (×٠٫٤)، والفترة كلها ×٤٫١ فوق المستهدف ×٣
      var r = withLang('ar', function () { return engine(salesBase().concat([ad('dip', { daily: steady(100), res: [6, 6, 6, 6, 6, 6, 0], sales: [2400, 2400, 2400, 40, 40, 40, 0], cid: 'ke' })])); });
      ok(!has(r, 'dip', 'loss') && !has(r, 'dip', 'roas-drop'), list(r, 'dip'));
      eq(health(r, 'dip'), 'good', 'the whole period is the verdict');
      ok(r.byAd.dip.trendTag && r.byAd.dip.trendTag.dir === 'down', JSON.stringify(r.byAd.dip.trendTag));
      // ومفيش «عائد ممتاز — زوّد الميزانية» وآخر ٣ أيام تحت المستهدف: الفرصة محتاجة إشارات متسقة
      var r2 = engine(salesBase().concat([ad('dip', { daily: steady(100), res: [6, 6, 6, 1, 0, 1, 0], sales: [2400, 2400, 2400, 80, 0, 80, 0], cid: 'ke' })]));
      ok(!has(r2, 'dip', 'roas-great') && !has(r2, 'dip', 'loss'), list(r2, 'dip'));
    });
    test('الواجهة: «لم يُحكم بعد» على الكارت بسببه، والتفاصيل فيها أساس الحكم وفترته، والنصيحة «اقتراح للمراجعة»', function () {
      var fresh = ad('fresh', { daily: [0, 0, 0, 0, 0, 10, 5], age: 1 });
      var w = ad('w', { daily: steady(100), res: [5, 5, 5, 5, 0, 0, 0] });
      candidates = baseAccount().concat([fresh, w]);
      render();
      var card = document.getElementById('card-fresh');
      ok(card && card.querySelector('.health-dot.h-pending') && card.textContent.indexOf(t('pend.learning.t')) > -1, card ? card.textContent : 'no card');
      openExpand(fresh);
      ok(document.querySelector('#expandHealth .health-basis') && document.getElementById('expandHealth').textContent.indexOf(t('x.basisPeriod', { period: periodLabel() })) > -1, document.getElementById('expandHealth').textContent);
      openExpand(w);
      ok(document.querySelector('#expandIssues .issue-advice').textContent.indexOf(t('x.suggest')) > -1, 'suggestion label');
      expandOverlay.classList.add('hidden');
      filters.health = 'pending';
      eq(visibleCandidates().map(function (c) { return c.id; }), ['fresh'], 'filter by «لم يُحكم بعد»');
      filters.health = 'all';
    });
    testAsync('النصائح لمسؤول الإعلانات نفسه بصيغة اقتراح: مفيش «اسأل/استفسر من مسؤول الإعلانات»', function () {
      return fetch('/js/i18n.js?t=' + Date.now()).then(function (r) { return r.text(); }).then(function (src) {
        var keys = {};
        (src.match(/'al\.[A-Za-z]+\.(a|okA)'/g) || []).forEach(function (k) { keys[k.slice(1, -1)] = true; });
        keys = Object.keys(keys);
        ok(keys.length >= 30, 'advice keys found: ' + keys.length);
        eq(keys.filter(function (k) { return /مسؤول الإعلانات/.test(t(k)); }), []);
        withLang('en', function () { eq(keys.filter(function (k) { return /ads manager/i.test(t(k)); }), []); });
      });
    });
  });

  describe('التنبيهات العاجلة الجديدة', function () {
    var META = function (o) { var m = { label: 'Meta — Store', currency: 'SAR' }; for (var k in o) m[k] = o[k]; return { 'meta:act_1': m }; };
    var codes = function (alerts, code) { return alerts.filter(function (a) { return a.code === code; }); };
    test('حد الإنفاق ٩٠٪: «عاجل» لو الباقي أسبوع أو أقل، «مهم» لو أكتر، ولا حاجة تحت ٩٠٪ (المبالغ بالهللة زي Meta)', function () {
      // إنفاق الحساب ٢٠٠ ر.س يومياً (baseAccount)، والمتبقي ١٠٠ ر.س = نص يوم
      var near = codes(engine(baseAccount(), META({ spendCap: 150000, amountSpent: 140000 })).alerts, 'spend-cap-near')[0];
      ok(near && near.level === 'critical' && /أقل من يوم/.test(near.detail) && /٩٣٪/.test(near.detail), near && near.detail);
      var far = codes(engine(baseAccount(), META({ spendCap: 10000000, amountSpent: 9100000 })).alerts, 'spend-cap-near')[0];
      eq(far && far.level, 'warning', 'the rest lasts ~45 days');
      eq(codes(engine(baseAccount(), META({ spendCap: 10000000, amountSpent: 5000000 })).alerts, 'spend-cap-near').length, 0);
    });
    test('أكبر مصدر مبيعات وقف (ربع المبيعات فأكتر، وكان شغّال لحد امبارح): الإعلان لوحده، أو الحملة لو كلها وقفت', function () {
      var star = ad('star', { daily: [100, 100, 100, 100, 100, 100, 0], res: steady(3), sales: [900, 900, 900, 900, 900, 900, 0], active: false, pausedLevel: 'ad' });
      var other = ad('s1', { daily: steady(100), res: steady(2), sales: steady(200) });
      var a = codes(engine([star, other]).alerts, 'top-stopped');
      // أيام مكتملة بس (آخر خانة = النهارده): ٥٬٤٠٠ من ٦٬٦٠٠ = ٨٢٪ (كان ٧٩٪ لما مبيعات النهارده كانت داخلة في الحساب)
      ok(a.length === 1 && a[0].adId === 'star' && a[0].level === 'critical' && /٨٢٪/.test(a[0].detail) && /متوقف/.test(a[0].detail), JSON.stringify(a.map(function (x) { return x.detail; })));
      var inCamp = ad('star', { daily: [100, 100, 100, 100, 100, 100, 0], res: steady(3), sales: [900, 900, 900, 900, 900, 900, 0], active: false, pausedLevel: 'campaign', cid: 'c9', camp: 'Big' });
      var c = codes(engine([inCamp, other]).alerts, 'top-stopped');
      ok(c.length === 1 && c[0].objectId === 'c:c9' && !c[0].adId && /حملة «Big»/.test(c[0].detail), JSON.stringify(c));
      var old = ad('old', { daily: [100, 100, 100, 0, 0, 0, 0], res: [3, 3, 3, 0, 0, 0, 0], sales: [900, 900, 900, 0, 0, 0, 0], active: false, pausedLevel: 'ad' });
      eq(codes(engine([old, other]).alerts, 'top-stopped').length, 0, 'stopped days ago is not news');
      var rejected = ad('rej', { daily: [100, 100, 100, 100, 100, 100, 0], res: steady(3), sales: [900, 900, 900, 900, 900, 900, 0], active: false, pausedLevel: 'rejected' });
      eq(codes(engine([rejected, other]).alerts, 'top-stopped').length, 0, 'the rejected-ad alert already covers it');
    });
    test('الموقع والتتبّع: صفر أحداث مع نقرات = «توقف التسجيل»، ونسبة زيارات وقعت = «نقرات لا تصل»، وزيارات من غير سلة = «الدفع/السلة»', function () {
      var day = function (k, clicks, lpv, atc, ic, pur) { return { date: '2026-09-' + k, clicks: clicks, lpv: lpv, atc: atc, ic: ic, pur: pur }; };
      var base = ['22', '23', '24', '25', '26', '27'].map(function (k) { return day(k, 100, 70, 10, 5, 3); });
      var run = function (y, td) { return PauseProofAlerts.siteAlerts(base.concat([y, td || day('29', 10, 7, 1, 0, 0)]), ALERT_FMT); };
      eq(run(day('28', 100, 70, 10, 5, 3)).length, 0, 'normal day');
      var off = run(day('28', 100, 0, 0, 0, 0));
      ok(off.length === 1 && off[0].code === 'tracking-off' && /أمس/.test(off[0].detail), JSON.stringify(off));
      var lpv = run(day('28', 100, 20, 3, 1, 1));
      ok(lpv.length === 1 && lpv[0].code === 'lpv-drop' && /٢٠٪/.test(lpv[0].detail) && /٧٠٪/.test(lpv[0].detail), JSON.stringify(lpv));
      var buy = run(day('28', 100, 70, 0, 0, 0));
      ok(buy.length === 1 && buy[0].code === 'checkout-off', JSON.stringify(buy));
      eq(run(day('28', 100, 70, 10, 5, 3), day('29', 40, 0, 0, 0, 0)).length, 0, 'today with too few clicks is not judged');
      var today = run(day('28', 100, 70, 10, 5, 3), day('29', 80, 0, 0, 0, 0));
      ok(today.length === 1 && /منذ بداية اليوم/.test(today[0].detail), JSON.stringify(today));
    });
    test('تعديل كبير مفاجئ: الميزانية ×٢ أو النص والفرق ١٥٪ من إنفاق اليوم فأكتر، أو إيقاف عنصر ١٠٪ فأكتر — والصافي بس (حالة حقيقية)', function () {
      // الحساب بينفق ٢٠٠$ يومياً: ١٠$ ← ٥٠$ (+٤٠$ = ٢٠٪) كبير، و١$ ← ٥$ لأ، و١٠$ ← ١٥$ لأ، ورفع ورجوع في نفس الساعة = لا شيء
      var edits = [
        { kind: 'budget', level: 'adset', id: '1', name: 'Set A', actor: 'Eslam', when: '٢٤ سبتمبر ١٦:١٥', time: '2026-09-24T16:15:19+0000', from: 1000, to: 5000, share: 0.2 },
        { kind: 'budget', level: 'adset', id: '2', name: 'Tiny', actor: 'Eslam', when: 'x', time: '2026-09-24T16:15:19+0000', from: 100, to: 500, share: 0.02 },
        { kind: 'budget', level: 'adset', id: '3', name: 'Mild', actor: 'Eslam', when: 'x', time: '2026-09-24T16:15:19+0000', from: 1000, to: 1500, share: 0.3 },
        { kind: 'pause', level: 'campaign', id: '4', name: 'Main', actor: 'Eslam', when: 'x', time: '2026-09-24T17:00:00+0000', share: 0.15 },
        { kind: 'budget', level: 'adset', id: '5', name: 'PingPong', actor: 'Eslam', when: 'x', time: '2026-09-24T12:57:30+0000', from: 1000, to: 5000, share: 0.1 },
        { kind: 'budget', level: 'adset', id: '5', name: 'PingPong', actor: 'Eslam', when: 'x', time: '2026-09-24T13:10:00+0000', from: 5000, to: 1000, share: 0.1 }
      ];
      var out = PauseProofAlerts.editAlerts(edits, ALERT_FMT, 'USD', 200);
      eq(out.length, 2);
      ok(/رُفعت ميزانية المجموعة الإعلانية «Set A» اليومية/.test(out[0].detail) && out[0].detail.indexOf(money(10, 'USD')) > -1 && out[0].detail.indexOf(money(50, 'USD')) > -1 && /بواسطة Eslam/.test(out[0].detail), out[0].detail);
      ok(/تم إيقاف الحملة «Main»/.test(out[1].detail) && out[1].objectId === '4@2026-09-24T17:00:00', JSON.stringify(out[1]));
    });
    test('رابط معطّل: ٤٠٤ = صفحة غير موجودة، ومن غير رد = لا يستجيب، وأكتر من إعلان على نفس الرابط', function () {
      var out = PauseProofAlerts.linkAlerts([{ key: 'k1', url: 'https://shop.example/p/1', status: 404, ads: ['Ad 1', 'Ad 2', 'Ad 3'] }, { key: 'k2', url: 'https://gone.example/', status: 0, ads: ['Ad 9'] }]);
      ok(out[0].code === 'link-broken' && out[0].objectId === 'k1' && /صفحة غير موجودة/.test(out[0].detail) && /وإعلانات أخرى \(2\)/.test(out[0].detail), out[0].detail);
      ok(/لا يستجيب/.test(out[1].detail), out[1].detail);
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
      ok(document.querySelector('#secStore[data-i18n="dx.title"]') && document.querySelector('#secAds[data-i18n="sec.ads"]'), 'section headings');
      ok(!document.getElementById('secSummary'), 'no separate «ملخص الأداء» section any more');
      ['kpiStrip', 'dxToday', 'topAlerts', 'dxMore'].forEach(function (id) { ok(document.getElementById(id).closest('#storeSec'), id + ' inside the store summary'); });
      ok(cardGrid.closest('.app-sec-ads'), 'cards in their own section');
      var btn = document.getElementById('toTopBtn');
      ok(btn && btn.getAttribute('data-i18n-aria') === 'btn.toTop' && btn.tabIndex === -1, 'to-top button, out of the Tab order while hidden');
      ['dx.title', 'sec.attn', 'sec.ads', 'btn.toTop'].forEach(function (k) { ok(t(k) && t(k) !== k, k + ' translated'); });
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
    // حساب حقيقي ١٨ أكتوبر: شريحة Meta (حساب رسائل من غير مشتريات) كان عنوانها «لا تُسجَّل مشتريات» وتحته «١٦ عملية شراء» وإنفاق
    // ٩٠٧ $ — أرقام Meta وSnapchat مع بعض. الشريط بيتبع شريحة الملخص المختارة زي العنوان
    test('الشريط بيتبع اختيار المنصات (Meta لوحدها) — مش كل المنصات', function () {
      candidates = [
        ad('m1', { daily: steady(50), res: steady(7), key: 'message' }),
        ad('s1', { daily: steady(70), res: [3, 3, 2, 2, 2, 2, 2], key: 'purchase', source: 'snapchat:a1', platform: 'Snapchat' })
      ];
      candidates.forEach(function (c) { c.currency = 'USD'; });
      try {
        platSel = ['meta'];
        render();
        var v = document.querySelectorAll('#kpiStrip .kpi-value');
        ok(v[0].textContent.indexOf(fmtNum(350)) > -1 && v[0].textContent.indexOf(fmtNum(840)) === -1, v[0].textContent);
        ok(v[1].textContent.indexOf(t('res1.purchase')) === -1 && v[1].textContent.indexOf(t('res.purchase')) === -1, v[1].textContent);
        // وقائمة الإعلانات بنفس الاختيار (قراره: «تتبع الاختيار»)
        eq(visibleCandidates().map(function (c) { return c.id; }), ['m1']);
        platSel = ['meta', 'snapchat'];
        eq(visibleCandidates().map(function (c) { return c.id; }).sort(), ['m1', 's1']);
        platSel = null;
        render();
        ok(document.querySelectorAll('#kpiStrip .kpi-value')[0].textContent.indexOf(fmtNum(840)) > -1, 'all platforms = combined');
      } finally { platSel = null; }
    });
    // قرار صاحب المنتج ٢٥ أكتوبر: «بسعر الربط الرسمي» — مجموع بعملتين مربوطتين بالدولار = مبلغ واحد بالعملة المختارة
    test('مجموع بعملتين مربوطتين بالدولار (ريال ودولار) = مبلغ واحد بسعر الربط، وعملة مش مربوطة = كل عملة لوحدها', function () {
      var kept = localStorage.getItem('acc.currency');
      var restore = function () { if (kept == null) localStorage.removeItem('acc.currency'); else localStorage.setItem('acc.currency', kept); };
      try {
        setCurPref('SAR');
        eq(moneyByCur({ SAR: 100, USD: 10 }), money(137.5, 'SAR'));
        setCurPref('USD');
        eq(moneyByCur({ SAR: 375, USD: 10 }), money(110, 'USD'));
        setCurPref(null);
        eq(moneyByCur({ SAR: 1000, USD: 10 }), money(1037.5, 'SAR'), 'automatic: the bigger amount (in dollars) decides');
        eq(moneyByCur({ EGP: 500, USD: 10 }), money(500, 'EGP') + ' + ' + money(10, 'USD'), 'the Egyptian pound floats: side by side');
        eq([DX.pegRate('SAR', 'USD'), DX.pegRate('USD', 'AED'), DX.pegRate('KWD', 'USD'), DX.pegRate('SAR', 'SAR')], [1 / 3.75, 3.6725, null, 1]);
      } finally { restore(); }
    });
  });

  describe('Google — حملات Performance Max', function () {
    var rows = [
      { campaign: { id: '11', name: 'PMax A', status: 'ENABLED', primaryStatus: 'ELIGIBLE' }, segments: { date: KEYS[5] }, metrics: { costMicros: '50000000', conversions: 2, conversionsValue: 300 } },
      { campaign: { id: '11', name: 'PMax A', status: 'ENABLED', primaryStatus: 'ELIGIBLE' }, segments: { date: KEYS[4] }, metrics: { costMicros: '30000000', conversions: 1.5, conversionsValue: 0 } },
      { campaign: { id: '12', name: 'PMax B', status: 'PAUSED', primaryStatus: 'PAUSED', primaryStatusReasons: ['CAMPAIGN_PAUSED'] }, segments: { date: KEYS[0] }, metrics: { costMicros: '10000000' } }
    ];
    test('كل حملة PMax بتبقى كارت واحد بأرقام الحملة', function () {
      var list = transformGooglePmax(rows, null, DAYS_X, 'EGP');
      eq(list.length, 2);
      var a = list[0];
      eq([a.id, a.campaignLevel, a.active, a.spend, a.results, a.resultKey, a.currency], ['gp-11', true, true, 80, 4, 'conversion', 'EGP']);
      eq([a.daily[4], a.daily[5], a.dailySales[5]], [30, 50, 300]);
      eq([list[1].active, list[1].pausedLevel], [false, 'campaign']);
    });
    test('حملة صرفت في الفترة المختارة بس بتظهر برضه', function () {
      var list = transformGooglePmax([], [{ campaign: { id: '13', name: 'Old', status: 'ENABLED', primaryStatus: 'ELIGIBLE' }, metrics: { costMicros: '120000000', conversions: 3, conversionsValue: 0 } }], DAYS_X, 'EGP');
      eq(list.length, 1);
      eq([list[0].spend, list[0].period.spend, list[0].period.results], [0, 120, 3]);
    });
    test('من غير primary_status بنرجع للحالة اليدوية', function () {
      eq(googleCampaignDelivery({ status: 'PAUSED' }).level, 'campaign');
      eq(googleCampaignDelivery({ status: 'ENABLED' }).active, true);
      eq(googleCampaignDelivery({ primaryStatus: 'LEARNING' }).active, true);
    });
    test('كارت PMax: شارة واضحة، ورابط الحملة، وعرض الحملات', function () {
      var p = transformGooglePmax(rows, null, DAYS_X, 'EGP')[0];
      p.source = 'google:1234567890';
      ok(previewMarkup(p).indexOf('Performance Max') > -1, 'badge');
      eq(platformLink(p).url, 'https://ads.google.com/aw/overview?campaignId=11');
      candidates = [p];
      runAnalysis();
      ok(campaignMarkup(groupCampaigns(candidates)[0]).indexOf(t('camp.pmax')) > -1, 'campaign card says PMax, not "1 ad"');
    });
    test('حملة PMax واخدة أغلب الصرف مش بتطلّع تنبيه «الميزانية متركزة في إعلان»', function () {
      var p = transformGooglePmax([{ campaign: { id: '14', name: 'Big', status: 'ENABLED', primaryStatus: 'ELIGIBLE' }, segments: { date: KEYS[5] }, metrics: { costMicros: '900000000', conversions: 0 } }], null, DAYS_X, 'EGP')[0];
      p.source = 'google:1';
      var other = ad('g1', { daily: steady(5), res: steady(1), source: 'google:1', platform: 'Google Ads', key: 'conversion' });
      var r = engine([p, other]);
      // من المراجعة الثانية للمرحلة ٥ التركّز جملة جوه تنبيه الإعلان (al.conc.in) مش تنبيه لوحده — والحملة الكاملة مالهاش الجملة دي
      var conc = t('al.conc.in', { pct: '' }).slice(0, 12);
      ok(!r.alerts.some(function (al) { return al.adId === p.id && String(al.advice || '').indexOf(conc) > -1; }), 'no concentration sentence');
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
    test('إنفاق صفر بعملة الحساب المعروض', function () {
      candidates = [ad('e1', { active: false })];
      candidates[0].currency = 'EGP';
      render();
      eq(document.querySelectorAll('#kpiStrip .kpi-value')[0].textContent, '٠ ج.م');
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
    // الكارت برا = «الأقرب للمتجر» بس؛ والتفاصيل جوه = جدول المنصة مقابل الأقرب للمتجر والفرق وشرح الفايدة
    // قرار صاحب المنتج ٨ نوفمبر ٢٠٢٦: «كلمة المقارنة غير واضحة، الأفضل تكون مقارنتها بالفترة الماضية او صياغة اوضح» — الاسم هو
    // اختيار «قارن مع» نفسه، فاللي مكتوب تحت الرقم هو اللي المستخدم اختاره
    test('اسم فترة المقارنة = اختيار «قارن مع» نفسه (الفترة السابقة/الأسبوع/الشهر/السنة)، والمخصصة بتواريخها', function () {
      var keepP = period, keepC = compare;
      try {
        withLang('ar', function () {
          period = { preset: 'last7' };
          [['prev', 'period.cmpPrev'], ['week', 'period.cmpWeek'], ['month', 'period.cmpMonth'], ['year', 'period.cmpYear']].forEach(function (x) {
            compare = { mode: x[0] };
            eq([cmpName(), cmpLabel()], [t(x[1]), t(x[1])], 'compare mode ' + x[0]);
          });
          // الفترة نفسها بتحدد الافتراضي: «الشهر الماضي» مقارنته الافتراضية الشهر اللي قبله
          period = { preset: 'lastMonth' }; compare = { mode: 'prev' };
          eq(cmpLabel(), t('period.cmpMonth'), 'last month vs the month before it');
          period = { preset: 'lastWeek' };
          eq(cmpLabel(), t('period.cmpWeek'));
          // مخصصة: تواريخها (مش كلمة عامة)
          period = { preset: 'last7' }; compare = { mode: 'custom', since: '2026-10-01', until: '2026-10-07' };
          eq(cmpName(), null, 'a custom range has no mode name');
          var lbl = cmpLabel();
          ok(lbl && lbl !== t('period.cmpPrev') && /\d|[٠-٩]/.test(lbl), lbl);
        });
      } finally { period = keepP; compare = keepC; }
    });
    // الأرقام التلاتة (طلب صاحب المنتج ٧ نوفمبر ٢٠٢٦): الرقم الكبير «الأقرب للمتجر»، وتحته فترة المقارنة ورقم المنصة، والتفاصيل جدول بالتلاتة
    test('الأرقام التلاتة: تحت كل رقم في الكارت فترة المقارنة ورقم المنصة، والتفاصيل جدول بيهم', function () {
      var c = ad('cmp1', { daily: steady(100), res: [10, 10, 10, 10, 10, 10, 22], sales: steady(1000) });
      c.period = buildPeriod(700, 82, 7000);
      c.period.plat = { results: 100, sales: 8750 };
      var tz = BROWSER_TZ, w = cardCompareRange(tz), saved = cmpStore[c.source];
      var subs = function () { return Array.prototype.map.call(document.getElementById('card-cmp1').querySelectorAll('.card-stat-s'), function (x) { return x.textContent; }); };
      try {
        delete cmpStore[c.source];
        candidates = [c];
        render();
        var main = Array.prototype.map.call(document.getElementById('card-cmp1').querySelectorAll('.card-stat-v'), function (x) { return x.textContent; }).join(' ');
        ok(main.indexOf(fmtNum(82)) > -1 && main.indexOf(fmtNum(100)) === -1, 'the big number is ours: ' + main);
        var cmpV = function (v) { return t('card.cmp', { label: cmpLabel(), v: v }); };
        eq(subs().slice(0, 4), [cmpV('…'), t('card.plat', { v: money(700, 'SAR') }), cmpV('…'), t('card.plat', { v: fmtNum(100) })], 'still loading; the platform under each');
        // التفاصيل مفتوحة وأرقام المقارنة وصلت: الجدول بيتحدّث من غير ما تتقفل وتتفتح
        openExpand(c);
        var cell = function () { return document.querySelectorAll('#expandMetrics tbody tr')[1].children[2].textContent.trim(); };
        eq(cell(), '…', 'the open details wait too');
        cmpStore[c.source] = { key: cmpKeyOf(w), tz: tz, status: 'ok', byId: { cmp1: Object.assign(buildPeriod(500, 50, 4000), { plat: { results: 60, sales: 5000 } }) }, calc: null };
        refreshOpenExpand();
        eq(cell(), fmtNum(50), 'and refresh when the numbers arrive');
        expandOverlay.classList.add('hidden');
        // نفس الأساس (الأقرب للمتجر جنب رقم المنصة) في الفترتين
        cmpStore[c.source] = { key: cmpKeyOf(w), tz: tz, status: 'ok', byId: { cmp1: Object.assign(buildPeriod(500, 50, 4000), { plat: { results: 60, sales: 5000 } }) }, calc: null };
        render();
        var s = subs();
        eq([s.length, s[0], s[2], s[4], s[6], s[7]], [8, cmpV(money(500, 'SAR')), cmpV(fmtNum(50)), cmpV(money(10, 'SAR')),
          cmpV(roasStr(8)), t('card.plat', { v: roasStr(8750 / 700) })], 'the comparison period and the platform under every number');
        openExpand(c);
        var box = document.querySelector('#expandMetrics .attr-compare');
        ok(box, 'comparison table');
        var rowText = function (i) { return Array.prototype.map.call(box.querySelectorAll('tbody tr')[i].children, function (x) { return x.textContent.trim(); }); };
        var head = Array.prototype.map.call(box.querySelectorAll('thead th'), function (x) { return x.textContent; });
        // اسم فترة المقارنة زي «قارن مع» (٨ نوفمبر ٢٠٢٦: «الأفضل تكون مقارنتها بالفترة الماضية او صياغة اوضح»)
        eq(head.slice(1), [t('cmp.store') + periodLabel(), cmpName() + fmtRange(w.since, w.until), t('cmp.platformOf', { plat: 'Meta' }) + periodLabel()], 'ours, the comparison period, the platform');
        eq(rowText(1), [resultLabelOf(c), fmtNum(82) + ' ↑ ' + dxPct(0.64), fmtNum(50), fmtNum(100)], 'orders: ours (and its change), the comparison period, the platform');
        eq(rowText(0), [t('x.spend'), money(700, 'SAR') + ' ↑ ' + dxPct(0.4), money(500, 'SAR'), money(700, 'SAR')], 'spend: the platform spends the same');
        eq(box.querySelector('.attr-note').textContent, t('cmp.note', { head: t('cmp.head.purchase'), kept: I18N.countPhrase(82, 'order', ar),
          kv: t('cmp.noteValue', { m: money(7000, 'SAR') }), gone: I18N.countPhrase(18, 'order', ar), other: t('cmp.other'), gv: t('cmp.noteValue', { m: money(1750, 'SAR') }) }));
        expandOverlay.classList.add('hidden');
        cmpStore[c.source].status = 'failed';
        render();
        eq(subs()[0], cmpV('—'), 'not available');
        openExpand(c);
        eq(Array.prototype.map.call(document.querySelectorAll('#expandMetrics tbody tr')[1].children, function (x) { return x.textContent.trim(); })[2], '—');
        expandOverlay.classList.add('hidden');
        // مفيش رقم منصة منفصل: الأقرب للمتجر هو رقم المنصة نفسه، والشرح بيقول كده
        delete c.period.plat;
        openExpand(c);
        var row1 = Array.prototype.map.call(document.querySelectorAll('#expandMetrics tbody tr')[1].children, function (x) { return x.textContent.trim(); });
        eq([row1[3], document.querySelector('#expandMetrics .attr-note').textContent], [fmtNum(82), t('cmp.noteOwn')]);
        expandOverlay.classList.add('hidden');
      } finally {
        expandOverlay.classList.add('hidden');
        if (saved) cmpStore[c.source] = saved; else delete cmpStore[c.source];
      }
    });
    test('أرقام فترة المقارنة لإعلان (cmpOf): لسه بتتحمّل، ومش متاحة، وصفر لو مصرفش، ومدى قديم = مستنية الجديد، وأساس مختلف = مش متاحة', function () {
      var c = ad('co1', { daily: steady(10), res: steady(1) }), tz = BROWSER_TZ, w = cardCompareRange(tz), saved = cmpStore[c.source];
      try {
        eq(cmpOf(c).state, 'failed', 'the period itself failed: nothing to compare');
        c.period = buildPeriod(70, 7, 0);
        delete cmpStore[c.source];
        eq(cmpOf(c).state, 'loading', 'not started yet');
        cmpStore[c.source] = { key: cmpKeyOf(w), tz: tz, status: 'ok', byId: {}, calc: null };
        eq(cmpOf(c), { state: 'ok', p: buildPeriod(0, 0, 0) }, 'not in the reply = no spend in that range');
        cmpStore[c.source].key = '2020-01-01:2020-01-07';
        eq(cmpOf(c).state, 'loading', 'another range: waiting for the new one');
        cmpStore[c.source].key = cmpKeyOf(w);
        cmpStore[c.source].byId = { co1: false };
        eq(cmpOf(c).state, 'failed', 'that ad has no numbers');
        // الفترة بالأقرب للمتجر والمقارنة برقم المنصة (طلب المتجر فشل فيها بس) — مش نفس الرقم
        c.period.plat = { results: 9, sales: 0 };
        cmpStore[c.source].byId = { co1: buildPeriod(30, 3, 0) };
        eq(cmpOf(c).state, 'failed', 'another basis');
        cmpStore[c.source].byId.co1.plat = { results: 4, sales: 0 };
        eq(cmpOf(c).p.results, 3, 'same basis');
        // Meta (calc): أساس واحد في الطلبين
        cmpStore[c.source].calc = function () { return buildPeriod(30, 3, 0); };
        eq(cmpOf(c).state, 'ok');
        // نوع نتيجة تاني في فترة المقارنة: الإنفاق بس
        cmpStore[c.source].calc = function () { return { spend: 30, results: null, sales: 0, cpr: null, roas: null, otherType: true }; };
        eq([cmpOf(c).p.results, cmpOf(c).p.spend], [null, 30]);
        eq(cmpStore[c.source].status = 'loading', 'loading');
        ok(cmpDone(c.source, w, { co1: buildPeriod(1, 1, 0) }) && cmpStore[c.source].status === 'ok', 'done');
        ok(!cmpFail(c.source, w), 'a late failure does not undo it');
        ok(!cmpDone(c.source, { since: '2020-01-01', until: '2020-01-07' }, {}), 'an old range does not overwrite');
      } finally { if (saved) cmpStore[c.source] = saved; else delete cmpStore[c.source]; }
    });
    test('كارت الحملة والمجموعة: نفس شبكة الأرقام بالتلاتة — مجموع فترة المقارنة لو كل إعلاناتها جاهزة', function () {
      var a = ad('ga', { daily: steady(10), res: steady(1), sales: steady(100) }), b = ad('gb', { daily: steady(20), res: steady(1), sales: steady(50) });
      a.period = buildPeriod(70, 7, 700); a.period.plat = { results: 9, sales: 900 };
      b.period = buildPeriod(140, 7, 350);   // من غير رقم منصة منفصل = رقمه هو رقم المنصة
      // إعلان من غير نتائج في الفترة (نوع نتيجة تاني): إنفاقه في المجموع، وعدده لأ — زي أرقام الكارت نفسها
      var x3 = ad('gx', { daily: steady(5), noResults: true });
      x3.period = buildPeriod(30, null, 0);
      var saved = cmpStore['meta:act_1'], tz = BROWSER_TZ, w = cardCompareRange(tz);
      try {
        var g = { kind: 'campaign', key: 'c1', name: 'Camp', platform: 'Meta', currency: 'SAR', ads: [a, b, x3], total: 3, spend: 240, results: 14, resultKey: 'purchase',
          sales: 1050, cpr: 15, roas: 5, mixedResults: false, status: 'good', active: 3, urgent: 0, important: 0, health: { good: 3 }, sets: 1 };
        eq(groupPlat(g), buildPeriod(240, 16, 1250), 'the platform: its own number, or ours where they are the same');
        delete cmpStore['meta:act_1'];
        eq(groupCmp(g).state, 'loading');
        cmpStore['meta:act_1'] = { key: cmpKeyOf(w), tz: tz, status: 'ok', byId: { ga: Object.assign(buildPeriod(50, 5, 400), { plat: { results: 6, sales: 500 } }), gx: buildPeriod(20, 4, 0) }, calc: null };
        eq(groupCmp(g), { state: 'ok', p: buildPeriod(70, 5, 400) }, 'an ad that did not run then = zero; an ad without results: its spend only');
        var box = document.createElement('div');
        box.innerHTML = campaignMarkup(g);
        var lines = Array.prototype.map.call(box.querySelectorAll('.card-stats .card-stat-s'), function (x) { return x.textContent; });
        ok(lines.indexOf(t('card.cmp', { label: cmpLabel(), v: money(70, 'SAR') })) > -1 && lines.indexOf(t('card.plat', { v: fmtNum(16) })) > -1, 'the same grid as the ad card, with the three numbers: ' + lines.join(' | '));
        ok(box.querySelectorAll('.card-stat-s .card-stat-n').length === lines.length, 'the number itself in its own element (never cut off)');
        cmpStore['meta:act_1'].byId.gb = false;
        eq(groupCmp(g).state, 'failed', 'one ad not available = the total is not (a partial total would be wrong)');
      } finally { if (saved) cmpStore['meta:act_1'] = saved; else delete cmpStore['meta:act_1']; }
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
      // رمز الخطأ العام من الخادم (SERVER) بيتكتب بلغة الواجهة — نص الخادم نفسه عربي بس (التدقيق الشامل ١١ نوفمبر ٢٠٢٦)
      eq(apiErrorText({ status: 500, data: { error: 'حدث خطأ غير متوقع في الخادم.', code: 'SERVER' } })(), t('s.unexpected'));
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
      var calls = captureSaves();
      try {
        activeSources.google = '1';
        renderSettingsForm();
        var inp = function (k) { return settingsForm.querySelector('[name="' + k + '"]'); };
        inp('roasTarget').value = '3';
        inp('minSpendShare').value = '90';
        document.getElementById('settingsSave').click();
        eq(calls.length, 0, 'nothing saved');
        eq(settingsForm.querySelectorAll('.setting-row.invalid').length, 1);
        eq(document.getElementById('settingsError').textContent, t('set.err.fix'));
        inp('minSpendShare').value = '3';
        document.getElementById('settingsSave').click();
        var s = calls.last();
        eq([s.roasTarget, s.minSpendShare], [3, 0.03]);
        eq(document.getElementById('settingsError').textContent, '');
      } finally { calls.restore(); }
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
    // قبل المراجعة كان بيروح لصفحة التعريف (/) ويخرج من الأداة (ف٩ — NN/g: الاسم بيرجّع للرئيسية، ورئيسية الأداة هي الملخص)
    test('اسم الأداة فوق بيرجّع لصفحة الملخص جوه الأداة من غير تحميل', function () {
      var brand = document.querySelector('.appbar a.brand');
      ok(brand && brand.getAttribute('href') === '/app', 'brand links to the tool (/app)');
      eq(brand.getAttribute('title'), t('nav.summaryTitle'));
      try {
        showView('settings');
        var ev = new MouseEvent('click', { bubbles: true, cancelable: true });
        brand.dispatchEvent(ev);
        ok(ev.defaultPrevented, 'no page load');
        eq(currentView, 'summary');
      } finally { showView('summary'); }
    });
    // قبل المراجعة: ٥ صيغ تذييل وأسماء مختلفة لنفس الرابط («دليل البدء/البداية»، «الرجوع/العودة/دخول الأداة»)، والدعم في كل
    // الصفحات إلا الأداة (ف١٠). المساعدة لازم تبقى بنفس الترتيب في كل الصفحات (WCAG 3.2.6)
    testAsync('التذييل: نفس الروابط بنفس الترتيب في كل الصفحات وفيها الدعم، من غير رابط الصفحة نفسها', function () {
      var ORDER = ['/app', '/', '/help', '/privacy', '/terms', '/data-deletion', 'mailto:support@adscenter.online'];
      var pages = { '/home.html': '/', '/help.html': '/help', '/join.html': null, '/login.html': '/app', '/terms.html': '/terms', '/privacy.html': '/privacy',
        '/data-deletion.html': '/data-deletion', '/404.html': null, '/stop.html': null, '/pauseproof-live.html': '/app' };
      return Promise.all(Object.keys(pages).map(function (u) {
        return fetch(u + '?t=' + Date.now()).then(function (r) { return r.text(); }).then(function (html) {
          var f = new DOMParser().parseFromString(html, 'text/html').querySelector('footer');
          return [u, f ? Array.prototype.filter.call(f.querySelectorAll('a'), function (a) { return !a.hasAttribute('hidden'); }).map(function (a) { return a.getAttribute('href'); }) : null];
        });
      })).then(function (rows) {
        rows.forEach(function (row) { eq(row[1], ORDER.filter(function (h) { return h !== pages[row[0]]; }), row[0]); });
      });
    });
    testAsync('النوافذ: التركيز بيدخل جوه النافذة وبيرجع للزرار اللي فتحها', function () {
      // زرار الحسابات بقى في صفحة «الإعدادات»
      showView('settings');
      loginMenuBtn.focus();
      loginMenuBtn.click();
      return tick().then(function () {
        eq(document.activeElement && document.activeElement.id, 'platformClose');
        document.getElementById('platformClose').click();
        return tick();
      }).then(function () {
        eq(document.activeElement && document.activeElement.id, 'loginMenuBtn');
      }).then(function () { showView('summary'); }, function (e) { showView('summary'); throw e; });
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
        if (/\/ads\?/.test(u)) { order.push('ads'); return json({ ads: [{ ad: { id: 'a1', status: 'ACTIVE' } }] }); }
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
    testAsync('Snapchat: الإعلانات اللي صرفت أو شغّالة فعلاً بس، ومعاها الفيديو أو الصورة ورابط الصفحة', function () {
      // حساب حقيقي ١١ أكتوبر: ١٢٣٦ إعلان من أول ما الحساب اتعمل (٤٠ صرفوا و١٨ شغّالين)، وكلها «صورة ثابتة» من غير وجهة
      var realFetch = window.fetch;
      var json = function (obj) { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(obj); } }); };
      window.fetch = function (url) {
        var u = String(url);
        if (/\/adaccounts\/[^/?]+$/.test(u)) return json({ adaccounts: [{ adaccount: { timezone: 'Asia/Riyadh', currency: 'USD' } }] });
        if (/\/ads\?/.test(u)) return json({ ads: [
          { ad: { id: 'dead', status: 'PAUSED', ad_squad_id: 'sq1' } },
          { ad: { id: 'idle', status: 'ACTIVE', ad_squad_id: 'sq1', delivery_status: ['INVALID_NOT_EFFECTIVE_ACTIVE', 'INVALID_EFFECTIVE_INVALID'] } },
          { ad: { id: 'spent', status: 'PAUSED', ad_squad_id: 'sq1' } },
          { ad: { id: 'live', status: 'ACTIVE', ad_squad_id: 'sq2', creative_id: 'cr1', delivery_status: ['VALID'] } }] });
        if (/\/adsquads/.test(u)) return json({ adsquads: [{ adsquad: { id: 'sq1', campaign_id: 'c1' } }, { adsquad: { id: 'sq2', campaign_id: 'c2' } }, { adsquad: { id: 'sq9', campaign_id: 'c9' } }] });
        if (/\/campaigns/.test(u)) return json({ campaigns: [{ campaign: { id: 'c1' } }, { campaign: { id: 'c2' } }, { campaign: { id: 'c9' } }] });
        if (/\/creatives/.test(u)) return json({ creatives: [
          { creative: { id: 'cr1', type: 'WEB_VIEW', headline: 'Summer sale', brand_name: 'Shop', call_to_action: 'SHOP_NOW', top_snap_media_id: 'm1', web_view_properties: { url: 'https://shop.example/p' } } },
          { creative: { id: 'cr9', type: 'SNAP_AD', top_snap_media_id: 'm9' } }] });
        if (/\/media/.test(u)) return json({ media: [{ media: { id: 'm1', type: 'VIDEO', download_link: 'https://cdn.example/v.mp4', duration_in_seconds: 15 } }, { media: { id: 'm9', type: 'IMAGE' } }] });
        if (/\/stats/.test(u)) return json({ timeseries_stats: [{ timeseries_stat: { breakdown_stats: { ad: [{ id: 'spent', timeseries: [] }] } } }] });
        return json({});
      };
      var out = null;
      var res = { setHeader: function () {}, status: function () { return this; }, json: function (b) { out = b; return this; }, end: function () {} };
      return import('/api/snapchat-ads-fetch.js').then(function (m) {
        return m.default({ method: 'POST', headers: {}, body: { accessToken: 't', action: 'ads', adAccountId: 'acc1', period: { preset: 'last7' } } }, res);
      }).then(function () {
        window.fetch = realFetch;
        eq(out.ads.map(function (a) { return a.id; }), ['spent', 'live'], 'dead and not-delivering ads dropped');
        eq([out.squads.map(function (s) { return s.id; }), out.campaigns.map(function (c) { return c.id; })], [['sq1', 'sq2'], ['c1', 'c2']], 'only the squads and campaigns in use');
        eq(out.creatives, { cr1: { type: 'WEB_VIEW', headline: 'Summer sale', brand: 'Shop', cta: 'SHOP_NOW', mediaId: 'm1', url: 'https://shop.example/p', dynamic: false, productSetId: null } });
        eq(out.media, { m1: { type: 'VIDEO', url: 'https://cdn.example/v.mp4', w: null, h: null, duration: 15 } });
        ok(!('_probe' in out), 'no debug data unless asked');
      }, function (e) { window.fetch = realFetch; throw e; });
    });
    // لوحة «قيمة الأداة» (قرار صاحب المنتج ٢٥ أكتوبر ٢٠٢٦): ما كان الإعلان بيصرفه في اليوم قبل التنبيه، لما الأيام دي أقدم من أسبوع الكروت
    testAsync('Snapchat: إنفاق إعلانات محددة يوم بيوم بتوقيت الحساب (طلب واحد للحساب)، والنطاق لحد ٣١ يوم', function () {
      var realFetch = window.fetch, asked = [];
      var json = function (obj) { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(obj); } }); };
      window.fetch = function (url) {
        var raw = String(url), u = decodeURIComponent(raw);
        asked.push(u);
        if (/\/adaccounts\/[^/?]+$/.test(raw)) return json({ adaccounts: [{ adaccount: { id: 'acc1', timezone: 'Asia/Riyadh', currency: 'SAR' } }] });
        if (/\/stats\?/.test(u)) return json({ timeseries_stats: [{ timeseries_stat: { breakdown_stats: { ad: [
          { id: 'a1', timeseries: [{ start_time: '2026-10-10T00:00:00.000+03:00', stats: { spend: 30000000 } }, { start_time: '2026-10-11T00:00:00.000+03:00', stats: { spend: 0 } }] },
          { id: 'other', timeseries: [{ start_time: '2026-10-10T00:00:00.000+03:00', stats: { spend: 99000000 } }] }] } } }] });
        return json({});
      };
      var out = null, code = 200;
      var res = { setHeader: function () {}, status: function (c) { code = c; return this; }, json: function (b) { out = b; return this; }, end: function () {} };
      var call = function (m, body) { out = null; code = 200; return m.default({ method: 'POST', headers: {}, body: Object.assign({ accessToken: 't', action: 'daily' }, body) }, res); };
      var mod;
      return import('/api/snapchat-ads-fetch.js').then(function (m) {
        mod = m;
        return call(m, { adAccountId: 'acc1', adIds: ['a1', 'gone'], since: '2026-10-10', until: '2026-10-11' });
      }).then(function () {
        eq(out, { spend: { a1: { '2026-10-10': 30, '2026-10-11': 0 } } }, 'only the ads asked, in currency units');
        var stats = asked.filter(function (u) { return /\/stats\?/.test(u); })[0];
        ok(/granularity=DAY&breakdown=ad&fields=spend/.test(stats) && /start_time=2026-10-10T00:00:00\.000\+03:00/.test(stats) && /end_time=2026-10-12T00:00:00\.000\+03:00/.test(stats), stats);
        return call(mod, { adAccountId: 'acc1', adIds: ['a1'], since: '2026-09-01', until: '2026-10-11' });
      }).then(function () {
        eq(code, 400, 'more than 31 days');
        return call(mod, { adAccountId: 'acc1', adIds: [], since: '2026-10-10', until: '2026-10-11' });
      }).then(function () {
        eq(code, 400, 'no ads');
        window.fetch = realFetch;
      }, function (e) { window.fetch = realFetch; throw e; });
    });
    // طلب صاحب المنتج ٢٥ أكتوبر: وسم «عُدّل…» على كروت سناب شات زي Meta — الحملات والمجموعات والإعلانات (توثيق Snap: Audit Logs،
    // سجل لكل عنصر). الخادم بيرجّع الحقول اللي بتهمّ الوسم بس، ولحد CHANGE_IDS_MAX عنصر في الطلب (حد الطلبات في Cloudflare)
    testAsync('Snapchat: سجل التعديلات لكل عنصر — الحقول المهمة بس (الاستهداف من غير قيمه)، والعنصر اللي فشل بيتعد', function () {
      var realFetch = window.fetch, asked = [];
      var json = function (obj, ok) { return Promise.resolve({ ok: ok !== false, status: ok === false ? 403 : 200, json: function () { return Promise.resolve(obj); } }); };
      var logs = {
        c1: [{ changelog: { event_at: '2026-10-24T10:00:00.000Z', action: 'UPDATED', update_value_records: { status: { before_value: 'PAUSED', after_value: 'ACTIVE' } } } }],
        s1: [{ changelog: { event_at: '2026-10-24T10:00:00.000Z', action: 'UPDATED', update_value_records: {
          daily_budget_micro: { before_value: 20000000, after_value: 25000000 }, name: { before_value: 'x', after_value: 'y' },
          targeting: { before_value: { geos: [{ country_code: 'sa' }] }, after_value: { geos: [{ country_code: 'ae' }] } } } } }],
        a1: [{ changelog: { event_at: '2026-10-23T08:00:00.000Z', action: 'CREATED' } },
          { changelog: { event_at: '2026-10-24T09:00:00.000Z', action: 'UPDATED', update_value_records: { creative_id: { before_value: 'cr1', after_value: 'cr2' } } } }],
        // حساب حقيقي ٢٥ أكتوبر: الاستهداف بيتسجّل مع خفض الميزانية بنفس قيمته (المفاتيح بترتيب تاني) — ده مش تعديل استهداف
        s2: [{ changelog: { event_at: '2026-10-24T09:30:00.000Z', action: 'UPDATED', update_value_records: {
          daily_budget_micro: { before_value: 100000000, after_value: 10000000 }, bid_micro: { before_value: 5, after_value: 5 },
          targeting: { before_value: { geos: [{ country_code: 'sa' }], regulated_content: false }, after_value: { regulated_content: false, geos: [{ country_code: 'sa' }] } } } } }]
      };
      var slowSeen = 0;
      window.fetch = function (url) {
        var u = String(url), m = u.match(/\/v1\/(campaigns|adsquads|ads)\/([^/]+)\/external_changelogs\?limit=50$/);
        asked.push(u);
        if (!m) return json({});
        if (m[2] === 'bad') return json({ request_status: 'ERROR', debug_message: 'E3002' }, false);
        // حد سرعة Snapchat (429) أول مرة: بيتعاد مرة واحدة
        if (m[2] === 'slow' && !slowSeen++) return Promise.resolve({ ok: false, status: 429, json: function () { return Promise.resolve({ request_status: 'ERROR' }); } });
        return json({ request_status: 'SUCCESS', changelogs: logs[m[2]] || [] });
      };
      var out = null;
      var res = { setHeader: function () {}, status: function () { return this; }, json: function (b) { out = b; return this; }, end: function () {} };
      var mod = null, timing = null;
      return import('/api/snapchat-ads-fetch.js').then(function (m) {
        mod = m;
        timing = Object.assign({}, m.CHANGE_TIMING);
        m.CHANGE_TIMING.gap = 0; m.CHANGE_TIMING.retry = 0;
        return m.default({ method: 'POST', headers: {}, body: { accessToken: 't', action: 'changes', ids: { campaign: ['c1'], adsquad: ['s1', 's2'], ad: ['a1', 'bad', 'slow'] } } }, res);
      }).then(function () {
        // slow اتطلب مرتين (429 وبعدين نجح) — ٦ عناصر و٧ طلبات، وbad بس فشل وسببه مكتوب
        eq([out.asked, out.failed, asked.length, out.codes], [6, 1, 7, { 403: 1 }]);
        // اللي سجلها وصل بس (لوحة «قيمة الأداة» مبتقولش «متعالجتش» على عنصر سجله فشل)
        eq(out.done, ['campaign:c1', 'adsquad:s1', 'adsquad:s2', 'ad:a1', 'ad:slow']);
        var by = {};
        out.changes.forEach(function (ch) { by[ch.level + ':' + ch.id] = ch.fields; });
        eq(by['campaign:c1'], { status: { before: 'PAUSED', after: 'ACTIVE' } });
        eq(by['adsquad:s1'], { daily_budget_micro: { before: 20000000, after: 25000000 }, targeting: { changed: true } }, 'name dropped, targeting without its values');
        eq(by['adsquad:s2'], { daily_budget_micro: { before: 100000000, after: 10000000 } }, 'same targeting (other key order) and same bid are not edits');
        eq(by['ad:a1'], { creative_id: { before: 'cr1', after: 'cr2' } });
        eq(out.changes.length, 4, 'the CREATED entry without changed fields is dropped');
        // لحد CHANGE_IDS_MAX عنصر في الطلب الواحد
        asked = [];
        var many = []; for (var i = 0; i < 30; i++) many.push('x' + i);
        return mod.default({ method: 'POST', headers: {}, body: { accessToken: 't', action: 'changes', ids: { ad: many } } }, res);
      }).then(function () {
        window.fetch = realFetch; Object.assign(mod.CHANGE_TIMING, timing);
        eq([asked.length, out.asked], [mod.CHANGE_IDS_MAX, mod.CHANGE_IDS_MAX]);
        // ٥ طلبات في المجموعة وبعدها انتظار (١٠ في الثانية لكل مفتاح عند Snapchat)
        ok(timing.group <= 5 && timing.gap >= 1000, JSON.stringify(timing));
      }, function (e) { window.fetch = realFetch; if (timing) Object.assign(mod.CHANGE_TIMING, timing); throw e; });
    });
    // طلب صاحب المنتج ٢٥ أكتوبر: «لا توجد صورة Preview لإعلانات سناب شات» و«بعض الفيديوهات لا تعمل» — توثيق Snap: Get Media Thumbnail
    // (VIDEO)، وGet Media Preview، وCreative Preview (صفحة ad-preview.snapchat.com من غير دخول). روابط Snapchat بس بتعدّي
    testAsync('Snapchat: صور الفيديوهات (لحد ٢٠ في الطلب، وروابط Snapchat بس)، ومعاينة الوسيط وصفحة معاينة الإعلان عند الفتح', function () {
      var realFetch = window.fetch, asked = [];
      var json = function (obj, ok) { return Promise.resolve({ ok: ok !== false, status: ok === false ? 403 : 200, json: function () { return Promise.resolve(obj); } }); };
      window.fetch = function (url) {
        var u = String(url), m;
        asked.push(u);
        if ((m = u.match(/\/v1\/media\/([^/]+)\/thumbnail$/))) {
          if (m[1] === 'denied') return json({ request_status: 'ERROR' }, false);
          if (m[1] === 'evil') return json({ request_status: 'SUCCESS', link: 'https://evil.example/x.jpg' });
          return json({ request_status: 'SUCCESS', expires_at: '2026-10-26T00:00:00Z', link: 'https://adsapi.snapchat.com/media/video_thumbnail?media_id=' + m[1] + '&signature=s' });
        }
        if (/\/v1\/media\/m1\/preview$/.test(u)) return json({ request_status: 'SUCCESS', link: 'https://adsapi.snapchat.com/media/video_preview?media_id=m1&signature=s' });
        if (/\/v1\/creatives\/cr1\/creative_preview$/.test(u)) return json({ request_status: 'SUCCESS', creative_id: 'cr1', expires_at: '2026-10-26T00:00:00Z',
          creative_preview_link: 'https://adsapi.snapchat.com/media/creative_preview?creative_id=cr1&expires_at=1768346953709&signature=abc%2Bdef' });
        return json({});
      };
      var out = null;
      var res = { setHeader: function () {}, status: function () { return this; }, json: function (b) { out = b; return this; }, end: function () {} };
      var mod = null, timing = null;
      return import('/api/snapchat-ads-fetch.js').then(function (m) {
        mod = m; timing = Object.assign({}, m.CHANGE_TIMING); m.CHANGE_TIMING.gap = 0; m.CHANGE_TIMING.retry = 0;
        return m.default({ method: 'POST', headers: {}, body: { accessToken: 't', action: 'thumbs', media: ['v1', 'denied', 'evil', 'bad id!'] } }, res);
      }).then(function () {
        eq([out.asked, out.failed, Object.keys(out.thumbs)], [3, 1, ['v1']], 'an invalid id is dropped, a foreign link is dropped');
        ok(/^https:\/\/adsapi\.snapchat\.com\/media\/video_thumbnail\?media_id=v1/.test(out.thumbs.v1), out.thumbs.v1);
        return mod.default({ method: 'POST', headers: {}, body: { accessToken: 't', action: 'preview', mediaId: 'm1', creativeId: 'cr1' } }, res);
      }).then(function () {
        eq(out, { video: 'https://adsapi.snapchat.com/media/video_preview?media_id=m1&signature=s',
          page: 'https://ad-preview.snapchat.com/?creative_id=cr1&expires_at=1768346953709&signature=abc%2Bdef' });
        eq([mod.snapLink('http://adsapi.snapchat.com/x'), mod.snapLink('https://snapchat.com.evil.example/x'), mod.snapPreviewPage('https://x/?creative_id=a&expires_at=b&signature=c')],
          [null, null, null], 'http, a look-alike domain and a malformed preview link are refused');
      }).then(function () { window.fetch = realFetch; Object.assign(mod.CHANGE_TIMING, timing); },
        function (e) { window.fetch = realFetch; if (timing) Object.assign(mod.CHANGE_TIMING, timing); throw e; });
    });
    // إعلان الكتالوج كان «إعلان مجموعة منتجات» من غير صورة، ومعاينة Snapchat بتقول له «Preview Not Supported» (اتجرّب ٢٥ أكتوبر):
    // منتجات المجموعة من الكتالوج (توثيق Snap: GET /product_sets/{id} ← catalog_id، وPOST /catalogs/{id}/products/search)
    testAsync('Snapchat: منتجات إعلان الكتالوج (المجموعة ← الكتالوج ← البحث بالمجموعة)، والقصة بوسيط أول لقطة فيها', function () {
      var realFetch = window.fetch, asked = [];
      var json = function (obj) { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(obj); } }); };
      window.fetch = function (url, init) {
        var u = String(url);
        asked.push((init && init.method || 'GET') + ' ' + u.replace(/^https:\/\/adsapi\.snapchat\.com\/v1/, '') + (init && init.body ? ' ' + init.body : ''));
        if (/\/v1\/product_sets\/ps1$/.test(u)) return json({ request_status: 'SUCCESS', product_sets: [{ sub_request_status: 'SUCCESS', product_set: { id: 'ps1', catalog_id: 'cat1', name: 'In Stock' } }] });
        if (/\/v1\/catalogs\/cat1\/products\/search$/.test(u)) return json({ request_status: 'SUCCESS', products: [
          { sub_request_status: 'SUCCESS', product: { title: 'Diamond Cut', link: 'https://shop.example/p/1', image_link: 'https://shop.example/i/1.jpg', price: { value: '329.00', currency: 'SAR' } } },
          { sub_request_status: 'SUCCESS', product: { title: 'Willow', link: 'javascript:alert(1)', image_link: 'http://shop.example/i/2.jpg', price: { value: '299', currency: 'SAR' }, sale_price: { value: '199', currency: 'SAR' } } }] });
        return json({});
      };
      var out = null;
      var res = { setHeader: function () {}, status: function () { return this; }, json: function (b) { out = b; return this; }, end: function () {} };
      var mod = null;
      return import('/api/snapchat-ads-fetch.js').then(function (m) {
        mod = m;
        return m.default({ method: 'POST', headers: {}, body: { accessToken: 't', action: 'products', productSetId: 'ps1' } }, res);
      }).then(function () {
        eq(asked, ['GET /product_sets/ps1', 'POST /catalogs/cat1/products/search {"limit":50,"filter":{"PRODUCT_SET_ID":{"EQ":"ps1"}}}']);
        eq(out.products, [
          { name: 'Diamond Cut', image: 'https://shop.example/i/1.jpg', url: 'https://shop.example/p/1', price: { value: 329, currency: 'SAR' } },
          { name: 'Willow', image: null, url: null, price: { value: 199, currency: 'SAR' } }], 'https only, and the sale price when there is one');
        // الكتالوج الديناميكي بمجموعته، والقصة (COMPOSITE) ملهاش وسيط لوحدها
        eq(mod.snapCreative({ type: 'COLLECTION', render_type: 'DYNAMIC', dynamic_render_properties: { product_set_id: 'ps1' }, collection_properties: {} }),
          { type: 'COLLECTION', headline: null, brand: null, cta: null, mediaId: null, url: null, dynamic: true, productSetId: 'ps1' });
      }).then(function () { window.fetch = realFetch; }, function (e) { window.fetch = realFetch; throw e; });
    });
    testAsync('Snapchat: صورة الفيديو بتوصل للكروت (كل الإعلانات اللي على نفس الوسيط)، والصور والإعلانات المتوقفة برّه الطلب', function () {
      var saved = { apiPost: window.apiPost, isCurrentLoad: window.isCurrentLoad, render: window.render, candidates: candidates }, calls = [];
      var mk = function (n, media, format) {
        var c = ad('s-' + n, { daily: steady(10), res: steady(1), source: 'snapchat:acc1', platform: 'Snapchat' });
        c.format = format || 'video'; c.snapMediaId = media; c.thumbUrl = format === 'image' ? 'https://cdn.example/i.jpg' : null;
        return c;
      };
      var list = [mk('a', 'm1'), mk('b', 'm1'), mk('c', 'm2'), mk('d', 'm3', 'image')];
      var restore = function () { window.apiPost = saved.apiPost; window.isCurrentLoad = saved.isCurrentLoad; window.render = saved.render; candidates = saved.candidates; };
      window.apiPost = function (url, body) {
        calls.push(body.media.slice().sort());
        return Promise.resolve({ ok: true, data: { thumbs: { m1: 'https://adsapi.snapchat.com/t1', m2: 'https://adsapi.snapchat.com/t2' } } });
      };
      window.isCurrentLoad = function () { return true; };
      window.render = function () {};
      candidates = list;
      var p;
      try { p = loadSnapchatThumbs('acc1', 'tok'); } catch (e) { restore(); throw e; }
      return p.then(function () {
        eq(calls, [['m1', 'm2']], 'videos only, each media once');
        eq(list.map(function (c) { return c.thumbUrl; }), ['https://adsapi.snapchat.com/t1', 'https://adsapi.snapchat.com/t1', 'https://adsapi.snapchat.com/t2', 'https://cdn.example/i.jpg']);
      }).then(restore, function (e) { restore(); throw e; });
    });
    // طلب صاحب المنتج ٢٥ أكتوبر: «فيديوهات ميتا تظهر بمساحة إضافية فارغة داخل الكارت» — صفحة المعاينة بترسم الإعلان في صندوق بمقاس
    // Meta بالظبط (فحص حي: ٣٢٠×٥٢٥ إنستغرام، ٣٣٥×٤٥٠ فيسبوك)، والإطار الثابت ٣٦٠×٧٦٠ كان بيضيف فراغ تحته
    test('معاينة Meta بمقاس Meta نفسها للصيغة، والمقاس الثابت لو مقاس Meta مش معقول (ريلز ٢٧٤×٢١٣)', function () {
      var body = function (w, h) { return '<iframe src="https://www.facebook.com/ads/api/preview_iframe.php?d=x" width="' + w + '" height="' + h + '" scrolling="yes"></iframe>'; };
      eq(metaPreviewSize(body(320, 525), 'ig'), { w: 320, h: 525 });
      eq(metaPreviewSize(body(335, 450), 'fb'), { w: 335, h: 450 });
      eq(metaPreviewSize(body(274, 213), 'reels'), PREVIEW_SIZES.reels, 'too short: the fixed size');
      eq(metaPreviewSize('<p>no frame</p>', 'ig'), PREVIEW_SIZES.ig);
      ok(/width:320px;height:525px/.test(metaIframeHtml(body(320, 525), metaPreviewSize(body(320, 525), 'ig'))), 'the frame takes Meta\'s size');
    });
    // فحص حي ٢٥ أكتوبر: منتجات إعلان كتالوج سناب شات كان مكتوب تحتها «تختار Meta…»
    test('ملاحظة منتجات الكتالوج باسم منصة الإعلان نفسها', function () {
      var items = [{ image: 'https://cdn.example/p.jpg', name: 'P', price: '', url: '' }];
      var snap = catalogGridHtml(items, I18N.t('dx.plat.snapchat')), meta = catalogGridHtml(items, I18N.t('dx.plat.meta'));
      ok(/Snapchat/.test(snap) && !/Meta/.test(snap), 'Snapchat ad: ' + snap);
      ok(/Meta/.test(meta) && !/Snapchat/.test(meta), 'Meta ad');
      ok(!/\{platform\}/.test(snap + meta), 'no raw placeholder');
    });
    test('Snapchat: تغيير السجل ← تعديل بشكل Meta (الميزانية بالمايكرو، ٢٠٪ على الأقل، والإيقاف مش وسم)، واليوم بتوقيت الحساب', function () {
      var ch = function (level, at, fields) { return { level: level, id: 'x', at: at, fields: fields }; };
      eq(snapEditsOf(ch('adsquad', '2026-10-24T10:00:00.000Z', { daily_budget_micro: { before: 20000000, after: 25000000 }, targeting: { changed: true } }), 'Asia/Riyadh'), [
        { kind: 'budget', level: 'adset', date: '2026-10-24', time: '2026-10-24T10:00:00.000Z', from: 20000000, to: 25000000, unit: 1e6 },
        { kind: 'targeting', level: 'adset', date: '2026-10-24', time: '2026-10-24T10:00:00.000Z', from: null, to: null }]);
      eq(snapEditsOf(ch('adsquad', '2026-10-24T10:00:00.000Z', { daily_budget_micro: { before: 20000000, after: 22000000 } }), 'UTC'), [], '10% is not an edit');
      eq(snapEditsOf(ch('campaign', '2026-10-24T22:30:00.000Z', { status: { before: 'PAUSED', after: 'ACTIVE' } }), 'Asia/Riyadh').map(function (e) { return [e.kind, e.level, e.date]; }),
        [['resume', 'campaign', '2026-10-25']], 'the day in the account time zone');
      eq(snapEditsOf(ch('ad', '2026-10-24T10:00:00.000Z', { status: { before: 'ACTIVE', after: 'PAUSED' } }), 'UTC'), [], 'a pause is not a tag');
      eq(snapEditsOf(ch('ad', '2026-10-24T10:00:00.000Z', { creative_id: { before: 'a', after: 'b' }, bid_micro: { before: 1, after: 2 } }), 'UTC').map(function (e) { return e.kind; }), ['creative', 'bid']);
      // ونص الوسم في المحرك: الميزانية بالمايكرو بالعملة الصح
      var c = ad('sn', { daily: steady(100), res: steady(5), cid: 'cs' });
      c.edits = [{ kind: 'budget', level: 'adset', date: KEYS[5], time: KEYS[5] + 'T10:00:00.000Z', from: 20000000, to: 25000000, unit: 1e6 }];
      var r = withLang('ar', function () { return engine(baseAccount().concat([c])); });
      eq(r.byAd.sn.editTag && r.byAd.sn.editTag.what, 'رفع ميزانية المجموعة الإعلانية من ٢٠ ر.س إلى ٢٥ ر.س');
      c.edits = [{ kind: 'bid', level: 'adset', date: KEYS[5], time: KEYS[5] + 'T10:00:00.000Z', from: null, to: null }];
      eq(withLang('ar', function () { return engine(baseAccount().concat([c])); }).byAd.sn.editTag.what, 'تعديل مزايدة المجموعة الإعلانية');
    });
    testAsync('Snapchat: الكروت بتاخد تعديلات إعلانها ومجموعته وحملته، والطلبات دفعات لحد ٢٠ عنصر', function () {
      var saved = { apiPost: window.apiPost, isCurrentLoad: window.isCurrentLoad, render: window.render, candidates: candidates }, calls = [];
      var mk = function (n, sq, camp, active) {
        var c = ad('s-' + n, { daily: steady(10), res: steady(1), source: 'snapchat:acc1', platform: 'Snapchat', active: active !== false });
        c.nativeId = n; c.adsetId = sq; c.campaignId = camp;
        return c;
      };
      var list = [mk('a1', 's1', 'c1'), mk('a2', 's1', 'c1'), mk('a3', 's2', 'c1', false)];
      for (var i = 0; i < 20; i++) list.push(mk('z' + i, 's3', 'c2'));
      window.apiPost = function (url, body) {
        calls.push(body.ids);
        var ch = [];
        if ((body.ids.adsquad || []).indexOf('s1') > -1) ch.push({ level: 'adsquad', id: 's1', at: KEYS[5] + 'T09:00:00.000Z', fields: { targeting: { changed: true } } });
        if ((body.ids.ad || []).indexOf('a2') > -1) ch.push({ level: 'ad', id: 'a2', at: KEYS[5] + 'T11:00:00.000Z', fields: { creative_id: { before: 'x', after: 'y' } } });
        return Promise.resolve({ ok: true, status: 200, data: { changes: ch } });
      };
      window.isCurrentLoad = function () { return true; };
      window.render = function () {};
      candidates = list;
      var restore = function () { window.apiPost = saved.apiPost; window.isCurrentLoad = saved.isCurrentLoad; window.render = saved.render; candidates = saved.candidates; };
      try { loadSnapchatEdits('acc1', 'UTC', 'tok'); } catch (e) { restore(); throw e; }
      return new Promise(function (r) { setTimeout(r, 30); }).then(function () {
        var asked = calls.reduce(function (n, ids) { return n + ids.campaign.length + ids.adsquad.length + ids.ad.length; }, 0);
        // الشغّالة بس: ٢٢ إعلان + مجموعتين (s1، s3) + حملتين = ٢٦ عنصر ← دفعتين، ورا بعض (حد سرعة Snapchat)
        eq([calls.length, asked, SNAP_CHANGE_PARALLEL], [2, 26, 1]);
        ok(calls.every(function (ids) { return ids.campaign.length + ids.adsquad.length + ids.ad.length <= 20; }), 'batches of 20 at most');
        eq(list[0].edits.map(function (e) { return e.kind + ':' + e.level; }), ['targeting:adset'], 'the ad set edit reaches its ads');
        eq(list[1].edits.map(function (e) { return e.kind + ':' + e.level; }), ['targeting:adset', 'creative:ad'], 'sorted by time');
        eq([list[2].edits || null, list[3].edits || null], [null, null]);
      }).then(restore, function (e) { restore(); throw e; });
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
      // أزرار المنصات للمتصلة بس (platChipsHtml) — TikTok مش متصل
      ok(!document.querySelector('#appUnderTest [data-plat-pick="tiktok"]'), 'no TikTok chip');
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
      eq(join.getAttribute('href'), '/join', 'join form');
      ok(hero.querySelector('a[href="/help"]'), 'help link');
    });
    test('نافذة المنصات فيها ملاحظة التجربة وروابط الانضمام والخطوات', function () {
      var note = document.querySelector('#platformOverlay .pf-pilot');
      ok(note, 'note exists');
      ok(note.querySelector('a[data-join]') && note.querySelector('a[href="/help"]'), 'join + help links');
      eq(document.querySelector('#platformMeta .platform-item-sub').textContent, t('pf.meta'));
    });
    // نموذج الانضمام (join.html) بيطلب نفس البيانات اللي محتاجينها عشان نضيف العميل، وموافقة المختبِر إجبارية
    // (Meta بتشترط اتفاق مع أي حد بنضيفه Tester — بند «برنامج التجربة» في الشروط)
    testAsync('نموذج الانضمام فيه البيانات المطلوبة وموافقة المختبِر باللغتين', function () {
      return fetch('/join.html?t=' + Date.now()).then(function (r) { return r.text(); }).then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html'), form = doc.getElementById('joinForm');
        ok(form, 'form');
        ['role', 'name', 'business', 'store', 'country', 'fb', 'email', 'googleEmail', 'whatsapp', 'consent', 'hpx'].forEach(function (n) {
          ok(form.elements[n], 'field: ' + n);
        });
        // «أنت:» أول حاجة في النموذج، وقيمها نفس ROLES في join.ts وقيد الجدول (pilot_requests.role)
        var roles = form.querySelectorAll('input[name="role"]');
        eq(Array.prototype.map.call(roles, function (c) { return c.type + ':' + c.value; }),
          ['radio:media_buyer', 'radio:agency', 'radio:owner_self', 'radio:owner_managed']);
        eq(form.querySelector('input, select, textarea').name, 'role', 'role comes first');
        ok(Array.prototype.every.call(roles, function (c) {
          var l = c.closest('label');
          return l.querySelector('.only-ar').textContent.trim() && l.querySelector('.only-en').textContent.trim();
        }), 'every choice in both languages');
        eq(Array.prototype.map.call(form.querySelectorAll('input[name="platforms"]'), function (c) { return c.value; }), ['meta', 'google', 'snapchat', 'tiktok']);
        ok(form.elements.consent.required, 'consent required');
        ok(form.querySelector('.consent .only-ar a[href="/terms#pilot"]') && form.querySelector('.consent .only-en a[href="/terms#pilot-en"]'), 'links the pilot terms');
        ok(doc.querySelector('[data-for="meta"] #jFb') && doc.querySelector('[data-for="google"] #jGoogle'), 'platform fields');
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
    var PAGES = ['/pauseproof-live.html', '/home.html', '/help.html', '/join.html', '/invited.html', '/404.html', '/privacy.html', '/terms.html', '/data-deletion.html'];
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
          '/api/snapchat-ads-fetch.js', '/api/snapchat-token.js', '/api/google-token.js', '/api/_seal.js'].map(function (u) {
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
      return Promise.all(['/home.html', '/help.html', '/join.html', '/pauseproof-live.html'].map(function (u) {
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
      return Promise.all(['/home.html', '/help.html', '/join.html', '/privacy.html', '/terms.html', '/data-deletion.html', '/404.html'].map(function (u) {
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
    testAsync('العرض التوضيحي في الرئيسية: بيانات مثال، ومبيتحركش لوحده (بيتحرك مع التمرير بس)', function () {
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
        ok(!d.querySelector('[data-demo] button, [data-demo] a'), 'no buttons inside the demo');
        ok(d.querySelector('[data-demo-track] .demo-scroll-space') && d.querySelector('.demo-hint'), 'scroll track + scroll hint');
        ok(!d.querySelector('.demo-paused'), 'the old tap-to-pause label is gone');
        eq([active(d, '[data-scene]'), active(d, '.demo-steps [data-step]')], [0, 0], 'starts at step 1');
        return new Promise(function (r) { setTimeout(r, 3200); });
      }).then(function () {
        var d = f.contentDocument;
        eq([active(d, '[data-scene]'), active(d, '.demo-steps [data-step]')], [0, 0], 'no scrolling = no auto-advance (not a looping GIF)');
      }).then(function () { f.remove(); }, function (e) { f.remove(); throw e; });
    });
    testAsync('العرض التوضيحي: النزول بالصفحة بيقلّب المشاهد والطلوع بيرجّعها، والضغط على خطوة بينقل لها، والمبالغ بعملة بلد الزائر', function () {
      var f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:900px;opacity:0;pointer-events:none';
      function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
      return getText('/home.html').then(function (html) {
        // زائر من السعودية (المنطقة الزمنية) و«تقليل الحركة» شغال — عشان النتيجة متتأثرش بجهاز اللي بيشغّل الاختبار
        f.srcdoc = '<!doctype html><html lang="ar" dir="rtl"><head><link rel="stylesheet" href="/site.css"></head><body>' +
          '<script>var R = Intl.DateTimeFormat.prototype.resolvedOptions; Intl.DateTimeFormat.prototype.resolvedOptions = function () { var o = R.call(this); o.timeZone = "Asia/Riyadh"; return o; };' +
          'window.matchMedia = function (q) { return { matches: /reduce/.test(q), media: q, addListener: function () {}, removeListener: function () {} }; };<\/script>' +
          '<main>' + parse(html).querySelector('[data-demo-track]').outerHTML + '<div style="height:2400px"></div></main><script src="/js/demo.js"><\/script></body></html>';
        var loaded = new Promise(function (r) { f.onload = r; });
        document.body.appendChild(f);
        return loaded;
      }).then(function () {
        var d = f.contentDocument, w = f.contentWindow;
        var track = d.querySelector('[data-demo-track]'), wrap = d.querySelector('.demo-wrap');
        function scene() { return Array.prototype.findIndex.call(d.querySelectorAll('[data-scene]'), function (s) { return s.classList.contains('is-active'); }); }
        var range = track.offsetHeight - wrap.offsetHeight, top0 = w.pageYOffset + track.getBoundingClientRect().top - parseFloat(w.getComputedStyle(wrap).top);
        ok(range > 400, 'the demo stays pinned for a scroll distance (' + range + 'px)');
        // instant: الصفحة فيها scroll-behavior: smooth، والحدث بنبعته بإيدنا (لوحة الاختبار المقفولة مبترسمش إطارات)
        function at(fr) { w.scrollTo({ top: top0 + fr * range, behavior: 'instant' }); w.dispatchEvent(new w.Event('scroll')); return scene(); }
        eq([at(0), at(0.3), at(0.6), at(0.9), at(1.3), at(0.4), at(0)], [0, 1, 2, 3, 3, 1, 0], 'scenes follow the scroll, both ways');
        at(0.6);
        ok(Math.abs(wrap.getBoundingClientRect().top - parseFloat(w.getComputedStyle(wrap).top)) < 2, 'pinned on screen while scrolling');
        var fills = Array.prototype.map.call(d.querySelectorAll('.demo-step-fill'), function (el) { return el.style.transform; });
        eq([fills[0], fills[1], fills[3]], ['scaleX(1)', 'scaleX(1)', 'scaleX(0)'], 'step bars follow the scroll');
        at(0);
        d.querySelectorAll('.demo-steps [data-step]')[3].click();
        w.dispatchEvent(new w.Event('scroll'));
        eq(scene(), 3, 'tapping a step jumps to it');
        at(0.3);
        eq(Array.prototype.map.call(d.querySelectorAll('[data-count]'), function (el) { return el.textContent; }), ['٤١٢', '٤٥ ر.س', '٨٠٬٣٠٠ ر.س'], 'reduced motion: full values right away, in riyals for a Saudi visitor');
        eq(Array.prototype.map.call(d.querySelectorAll('[data-amount]'), function (el) { return el.textContent; }), ['٤٥٠ ر.س', '450 SAR', '١٬٢٨٠ ر.س', '1,280 SAR', '٢٢٥ ر.س', '225 SAR', '٢٬٣٥٠ ر.س', '2,350 SAR'], 'sentence amounts in riyals, each in its own language (incl. the attention items)');
        d.documentElement.lang = 'en';
        return sleep(50).then(function () {
          eq(d.querySelector('[data-count][data-money]').textContent, '45 SAR', 'English: 45 SAR');
          var A = w.AdsDemo;
          eq([A.currencyFor('Asia/Kuwait'), A.currencyFor('Africa/Cairo'), A.currencyFor('Europe/London')], ['KWD', 'EGP', 'USD'], 'country by time zone, dollars for everyone else');
          eq([A.moneyFor(12, 'KWD', true), A.moneyFor(12, 'USD', false), A.moneyFor(12, 'USD', true), A.moneyFor(21400, 'EGP', true)],
            ['٣٫٧ د.ك', '$12', '١٢ $', '١٬٠٤٠٬٠٠٠ ج.م'], 'rounded like the tool writes money');
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
      return Promise.all(['/home.html', '/help.html', '/join.html', '/privacy.html', '/terms.html', '/data-deletion.html', '/404.html'].map(function (u) {
        return getText(u).then(function (html) {
          var srcs = Array.prototype.map.call(parse(html).querySelectorAll('body script[src]'), function (s) { return s.getAttribute('src'); });
          ok(srcs.some(function (s) { return /(^|\/)js\/site\.js$/.test(s); }), u + ': loads js/site.js');
        });
      }));
    });
    // js/join-form.js على مقاس موبايل: الطلب بيتبعت لدالة sync (fetch وهمي هنا — مفيش طلب حقيقي)
    testAsync('نموذج الانضمام: «أنت:» إجباري، وحقل فيسبوك مع Meta بس، والغلط بيظهر على الحقل، والطلب بيتبعت كامل', function () {
      var f;
      return framePage('/join.html', 375, 800).then(function (fr) {
        f = fr;
        var d = f.contentDocument, w = f.contentWindow, form = d.getElementById('joinForm'), err = d.getElementById('joinError');
        var fbBox = d.querySelector('[data-for="meta"]'), googleBox = d.querySelector('[data-for="google"]');
        ok(fbBox.hidden && googleBox.hidden, 'platform fields hidden at first');
        form.querySelector('input[value="meta"]').click();
        ok(!fbBox.hidden && googleBox.hidden, 'facebook field shows with Meta only');
        form.requestSubmit();
        ok(!err.hidden && err.textContent, 'error shown');
        eq(d.activeElement && d.activeElement.id, 'jRole1', 'focus on the first wrong field («أنت:»)');
        form.querySelector('input[name="role"][value="agency"]').click();
        ok(err.hidden && !form.querySelector('[aria-invalid]'), 'choosing any role clears the error');
        form.requestSubmit();
        eq(d.activeElement && d.activeElement.id, 'jName', 'then the name');
        function set(id, v) { d.getElementById(id).value = v; }
        set('jName', 'Test'); set('jBusiness', 'Shop'); set('jStore', 'shop.example'); set('jCountry', 'مصر');
        set('jFb', 'facebook.com/test.user'); set('jEmail', 'a@b.co');
        // بريد Snapchat (٢٦ أكتوبر): بيظهر مع Snapchat زي Google، والغلط فيه بيتقال
        var snapBox = d.querySelector('[data-for="snapchat"]');
        ok(snapBox && snapBox.hidden, 'snapchat email hidden before choosing Snapchat');
        form.querySelector('input[value="snapchat"]').click();
        ok(!snapBox.hidden, 'snapchat email shows with Snapchat');
        set('jSnap', 'not-an-email');
        var sent = null;
        w.fetch = function (url, init) { sent = JSON.parse(init.body); return Promise.resolve(new w.Response('{"ok":true}', { status: 200 })); };
        form.requestSubmit();
        eq([sent, d.activeElement && d.activeElement.id], [null, 'jSnap'], 'a wrong Snapchat email is caught');
        set('jSnap', 'snap@b.co');
        form.requestSubmit();
        eq([sent, d.activeElement && d.activeElement.id], [null, 'jConsent'], 'consent is required before sending');
        d.getElementById('jConsent').click();
        form.requestSubmit();
        return new Promise(function (r) { setTimeout(r, 30); }).then(function () {
          ok(sent, 'sent');
          eq([sent.action, sent.role, sent.platforms, sent.fb, sent.email, sent.googleEmail, sent.snapEmail, sent.consent, sent.hp],
            ['join', 'agency', ['meta', 'snapchat'], 'facebook.com/test.user', 'a@b.co', '', 'snap@b.co', true, '']);
          ok(sent.ms >= 0, 'fill time');
          ok(d.querySelector('[data-join-state="form"]').hidden && !d.querySelector('[data-join-state="done"]').hidden, 'done state');
        });
      }).then(function () { f.remove(); }, function (e) { if (f) f.remove(); throw e; });
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
        eq(d.querySelectorAll('.eyebrow').length, 7, 'a small label above every section heading (incl. #owners)');
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
        ['/home.html', '/help.html', '/join.html', '/invited.html', '/404.html', '/site.css', '/legal.css', '/js/join-form.js', '/js/invited.js', '/js/legal.js', '/js/demo.js', '/js/site.js'].forEach(function (f) {
          ok(ignored.indexOf(f) === -1 && ignored.indexOf(f.slice(1)) === -1 && ignored.indexOf(f.split('/')[1]) === -1, f + ' is deployed');
        });
      });
    });
  });

  // ---------- التثبيت على شاشة الهاتف (manifest.webmanifest + installBtn في ui.js) ----------
  describe('التثبيت على الهاتف', function () {
    // مقاس صورة PNG من رأسها (IHDR) — عشان الأيقونة اللي مكتوب إنها ٥١٢ تكون ٥١٢ فعلاً
    function pngSize(u) {
      return fetch(u + '?t=' + Date.now()).then(function (r) {
        if (!r.ok) throw new Error(u + ' → HTTP ' + r.status);
        return r.arrayBuffer();
      }).then(function (buf) {
        var b = new Uint8Array(buf), dv = new DataView(buf);
        var png = [137, 80, 78, 71, 13, 10, 26, 10].every(function (x, i) { return b[i] === x; });
        return png ? dv.getUint32(16) + 'x' + dv.getUint32(20) : 'not a png';
      });
    }
    testAsync('بيانات التثبيت: الاسم والأيقونات (بمقاساتها الحقيقية) والأداة هي صفحة البداية، وعرض كتطبيق', function () {
      var m;
      return fetch('/manifest.webmanifest?t=' + Date.now()).then(function (r) { return r.json(); }).then(function (json) {
        m = json;
        eq([m.id, m.name, m.short_name, m.start_url, m.scope, m.display, m.lang, m.dir], ['/app', 'Ads Center', 'Ads Center', '/app', '/', 'standalone', 'ar', 'rtl']);
        var any = m.icons.filter(function (i) { return (i.purpose || 'any') === 'any'; }).map(function (i) { return i.sizes; }).sort();
        eq(any, ['192x192', '512x512'], 'Chrome needs 192 and 512');
        ok(m.icons.some(function (i) { return i.purpose === 'maskable'; }), 'a maskable icon for Android');
        return Promise.all(m.icons.map(function (i) { return pngSize(i.src); }));
      }).then(function (sizes) {
        eq(sizes, m.icons.map(function (i) { return i.sizes; }));
        return pngSize('/icons/apple-touch-icon.png');
      }).then(function (s) { eq(s, '180x180', 'iPhone icon'); });
    });

    testAsync('صورة المعاينة لما الرابط يتشارك: ١٢٠٠×٦٣٠، والصفحات اللي بتتشارك بتشاور عليها برابط كامل', function () {
      return pngSize('/og.png').then(function (s) {
        eq(s, '1200x630');
        return Promise.all(['/home.html', '/join.html', '/help.html', '/pauseproof-live.html'].map(function (u) {
          return fetch(u + '?t=' + Date.now()).then(function (r) { return r.text(); });
        }));
      }).then(function (pages) {
        pages.forEach(function (html, i) {
          var d = new DOMParser().parseFromString(html, 'text/html');
          var img = d.querySelector('meta[property="og:image"]'), card = d.querySelector('meta[name="twitter:card"]');
          eq([img && img.getAttribute('content'), card && card.getAttribute('content')], ['https://adscenter.online/og.png', 'summary_large_image'], 'page ' + i);
          ok(d.querySelector('meta[property="og:title"]') && d.querySelector('meta[property="og:url"]'), 'title and url ' + i);
        });
      });
    });

    testAsync('الأداة والصفحة الرئيسية بيشاوروا على بيانات التثبيت وأيقونة آيفون، ومفيش service worker', function () {
      return Promise.all(['/pauseproof-live.html', '/home.html', '/js/ui.js', '/js/main.js', '/js/core.js'].map(function (u) {
        return fetch(u + '?t=' + Date.now()).then(function (r) { return r.text(); });
      })).then(function (texts) {
        texts.slice(0, 2).forEach(function (html) {
          var d = new DOMParser().parseFromString(html, 'text/html');
          ok(d.querySelector('link[rel="manifest"][href="/manifest.webmanifest"]'), 'manifest link');
          ok(d.querySelector('link[rel="apple-touch-icon"][href="/icons/apple-touch-icon.png"]'), 'iPhone icon link');
        });
        ok(texts.every(function (s) { return s.indexOf('serviceWorker.register') < 0; }), 'no service worker (it would cache old versions of the tool)');
      });
    });

    test('زرار «ثبّت الأداة»: أندرويد بيفتح نافذة المتصفح مرة، آيفون بيفتح الخطوات، والأداة المثبّتة أو الكمبيوتر = مفيش زرار', function () {
      var real = { touch: window.isTouchDevice, installed: window.runningInstalled, ios: window.iosCanAddToHome };
      var seenBefore = localStorage.getItem(INSTALL_KEY), sessionBefore = sessionStorage.getItem(INSTALL_SESSION_KEY);
      var env = { touch: true, installed: false, ios: false };
      window.isTouchDevice = function () { return env.touch; };
      window.runningInstalled = function () { return env.installed; };
      window.iosCanAddToHome = function () { return env.ios; };
      function fire() {
        var ev = new Event('beforeinstallprompt', { cancelable: true });
        ev.prompted = 0;
        ev.prompt = function () { ev.prompted++; };
        window.dispatchEvent(ev);
        return ev;
      }
      try {
        installPrompt = null; renderInstallButton();
        ok(installBtn.hidden, 'hidden until the browser says the tool can be installed');
        var ev = fire();
        ok(ev.defaultPrevented && !installBtn.hidden, 'our button instead of the browser bar');
        installBtn.click();
        eq(ev.prompted, 1);
        ok(installBtn.hidden && installPrompt === null, 'the event works once — hidden until the browser sends it again');

        env.installed = true; fire();
        ok(installBtn.hidden, 'already opened from the home screen');
        env.installed = false; env.touch = false; installPrompt = null; fire();
        ok(installBtn.hidden, 'computer: no button');

        env.touch = true; env.ios = true; installPrompt = null; localStorage.removeItem(INSTALL_KEY); sessionStorage.removeItem(INSTALL_SESSION_KEY); renderInstallButton();
        ok(!installBtn.hidden, 'iPhone: steps button');
        installBtn.click();
        ok(!installOverlay.classList.contains('hidden'), 'steps open');
        ok(!installBtn.hidden && installState().seen, 'the button stays until the customer answers the question');
        closeOverlays();
        ok(installOverlay.classList.contains('hidden'), 'closes like the other windows');
        var steps = installOverlay.textContent.replace(/ /g, ' ');
        ok(steps.indexOf('Open as Web App') > -1, 'iPhone steps turn off "Open as Web App" until full app mode is tested on a real iPhone');
      } finally {
        window.isTouchDevice = real.touch; window.runningInstalled = real.installed; window.iosCanAddToHome = real.ios;
        installPrompt = null;
        if (seenBefore === null) localStorage.removeItem(INSTALL_KEY); else localStorage.setItem(INSTALL_KEY, seenBefore);
        if (sessionBefore === null) sessionStorage.removeItem(INSTALL_SESSION_KEY); else sessionStorage.setItem(INSTALL_SESSION_KEY, sessionBefore);
        renderInstallButton(); renderInstallAsk();
      }
    });

    test('سؤال آيفون «هل أضفت الأداة؟»: الزيارة اللي بعد الخطوات بس، ٣ زيارات بالكتير، و«نعم» أو «لا، شكراً» = مفيش زرار ولا سؤال تاني', function () {
      var real = { touch: window.isTouchDevice, installed: window.runningInstalled, ios: window.iosCanAddToHome };
      var keep = localStorage.getItem(INSTALL_KEY), keepSession = sessionStorage.getItem(INSTALL_SESSION_KEY);
      var env = { installed: false, ios: true };
      window.isTouchDevice = function () { return true; };
      window.runningInstalled = function () { return env.installed; };
      window.iosCanAddToHome = function () { return env.ios; };
      function newVisit() { sessionStorage.removeItem(INSTALL_SESSION_KEY); renderInstallButton(); renderInstallAsk(); }
      function shown() { return !installAsk.hidden; }
      try {
        installPrompt = null; localStorage.removeItem(INSTALL_KEY); newVisit();
        ok(!shown(), 'never opened the steps: no question');
        openInstallSteps(); closeOverlays(); renderInstallAsk();
        ok(!shown(), 'not in the same visit the steps were opened');

        newVisit();
        ok(shown() && installState().asked === 1, 'next visit: the question');
        renderInstallAsk();
        eq(installState().asked, 1, 'counted once per visit');
        document.getElementById('installAskSteps').click();
        ok(!installOverlay.classList.contains('hidden') && !shown(), '«Show the steps» opens them and hides the card');
        closeOverlays();
        newVisit(); newVisit();
        eq([shown(), installState().asked], [true, 3]);
        newVisit();
        ok(!shown(), 'ignored three times: stops asking');
        ok(!installBtn.hidden, 'the header button stays (unobtrusive) until an answer');

        localStorage.setItem(INSTALL_KEY, JSON.stringify({ seen: true, asked: 1, answer: null })); newVisit();
        document.getElementById('installAskYes').click();
        ok(!shown() && installBtn.hidden && installState().answer === 'yes', '«Yes»: no card, no button');
        newVisit();
        ok(!shown() && installBtn.hidden, '…and they never come back');

        localStorage.setItem(INSTALL_KEY, JSON.stringify({ seen: true, asked: 0, answer: null })); newVisit();
        document.getElementById('installAskNo').click();
        newVisit();
        ok(!shown() && installBtn.hidden && installState().answer === 'no', '«No, thanks»: the same');

        localStorage.setItem(INSTALL_KEY, '1'); newVisit();
        ok(shown(), 'steps opened before this change (old value) still get the question');
        localStorage.setItem(INSTALL_KEY, JSON.stringify({ seen: true, asked: 0, answer: null }));
        env.installed = true; newVisit();
        ok(!shown(), 'opened from the icon as an app: we know, no question');
        env.installed = false; env.ios = false; newVisit();
        ok(!shown(), 'Android: no question');
      } finally {
        window.isTouchDevice = real.touch; window.runningInstalled = real.installed; window.iosCanAddToHome = real.ios;
        if (keep === null) localStorage.removeItem(INSTALL_KEY); else localStorage.setItem(INSTALL_KEY, keep);
        if (keepSession === null) sessionStorage.removeItem(INSTALL_SESSION_KEY); else sessionStorage.setItem(INSTALL_SESSION_KEY, keepSession);
        closeOverlays(); renderInstallButton(); renderInstallAsk();
      }
    });

    test('آيفون: Safari وChrome آه، ومتصفحات فيسبوك وإنستغرام وأندرويد لأ', function () {
      var iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
      eq([
        iosCanAddToHome(iphone),
        iosCanAddToHome(iphone.replace('Version/18.5', 'CriOS/140.0.0.0')),
        iosCanAddToHome(iphone + ' [FBAN/FBIOS;FBAV/500.0]'),
        iosCanAddToHome(iphone + ' Instagram 400.0'),
        iosCanAddToHome('Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36')
      ], [true, true, false, false, false]);
    });

    test('Meta في تاب جديد (أو من الأيقونة): الجلسة شغّالة = نفس الحساب على طول، غير كده شاشة الربط من غير رسالة خطأ، و«فصل» = مفيش محاولة', function () {
      var real = { FB: window.FB, queue: fbReadyQueue, load: window.loadAdAccounts, last: lastAccounts.meta };
      var loaded = [], status = 'connected';
      window.FB = { getLoginStatus: function (cb) { cb({ status: status }); } };
      fbReadyQueue = null;
      window.loadAdAccounts = function (id) { loaded.push(id); };
      try {
        delete activeSources.meta; setPlatformOptions('meta', []); setPlatformState('meta', null);
        lastAccounts.meta = 'act_42';
        autoReconnectMeta();
        eq([loaded, activeSources.meta], [['act_42'], 'act_42'], 'same account straight away');

        delete activeSources.meta; loaded = []; status = 'unknown';
        autoReconnectMeta();
        eq([loaded, activeSources.meta, platformState.meta || null], [[], undefined, null], 'no session: connect screen, no error card');

        status = 'connected'; delete lastAccounts.meta;
        autoReconnectMeta();
        eq(loaded, [], 'after «Disconnect» (no remembered account) nothing happens');
      } finally {
        window.FB = real.FB; fbReadyQueue = real.queue; window.loadAdAccounts = real.load;
        if (real.last === undefined) delete lastAccounts.meta; else lastAccounts.meta = real.last;
        delete activeSources.meta;
      }
    });
  });

  // ---------- إعدادات التنبيهات بلغة صاحب المتجر + نافذة أول مرة (ui.js) ----------
  describe('إعدادات التنبيهات لصاحب المتجر', function () {
    test('الشاشة الأساسية: سؤال الفلوس الواحد وباقي الحدود في «المتقدمة» — من غير أنماط ولا «استعادة القيم الافتراضية» (مراجعة الإعدادات)', function () {
      try {
        activeSources.google = '1';
        renderSettingsForm();
        var adv = settingsForm.querySelector('details.settings-advanced');
        var main = Array.prototype.filter.call(settingsForm.querySelectorAll('input[type="text"]'), function (i) { return !adv.contains(i); }).map(function (i) { return i.name; });
        eq(main, ['roasTarget'], 'the target alone (the loss limit was removed 8 Nov 2026)');
        ok(adv.querySelector('[name="learningDays"]'), 'learning period in advanced');
        eq(settingsForm.querySelectorAll('input[type="radio"]').length, 0, 'no presets');
        ok(!document.getElementById('settingsReset'), 'no «back to defaults» button');
        // المستهدف فاضي لحد ما يتحدد (مش ×٣)
        eq(settingsForm.querySelector('[name="roasTarget"]').value, '');
        // الحدود المتقدمة التمانية بس — المحذوفة مبقتش في الشاشة (ومضاعف «مراجعة» اتشال ٢٥ أكتوبر)
        eq(adv.querySelectorAll('input[type="text"]').length, 8);
        ok(!adv.querySelector('[name="cprCriticalMultiple"]'), 'no «review» multiple');
        ok(!adv.querySelector('[name="wasteCprMultiple"]') && !adv.querySelector('[name="scaleCprRatio"]'), 'removed settings are gone');
        var text = settingsForm.textContent;
        ok(text.indexOf(t('goal.roasTarget')) > -1, 'a money question, not the technical name');
        ok(text.indexOf(t('set.roasTarget')) < 0, 'no technical label on the main screen');
        // المستهدف لوحده بقى الهدف كله: بيتحفظ من غير خطأ
        settingsForm.querySelector('[name="roasTarget"]').value = '4';
        var r = readSettingsForm();
        eq([r.errors.length, r.values.roasTarget], [0, 4], 'the target alone is accepted');
      } finally { settingsOverlay.classList.add('hidden'); }
    });
    // نسخة الجهاز القديمة بتتقري بس وقت النقل لإعدادات المستخدم (٢٦ أكتوبر) — بقيم نمطها الصريحة
    test('إعدادات محفوظة بنمط قديم بتتحول لقيمه الصريحة وقت النقل (اللي اختار «هادئ» حدوده متتغيرش)', function () {
      var keep = localStorage.getItem(SETTINGS_KEY);
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ _preset: 'calm', roasTarget: 5, roasBreakEven: 5, cprWarnMultiple: 1.8 }));
        var v = loadAlertSettings();
        eq([v._preset, v.roasTarget, v.cprWarnMultiple, v.cprCriticalMultiple, v.frequencyHigh], [undefined, 5, 1.8, 3, 8]);
      } finally { if (keep === null) localStorage.removeItem(SETTINGS_KEY); else localStorage.setItem(SETTINGS_KEY, keep); }
    });

    // ---------- إعدادات التنبيهات لكل مستخدم (قرار صاحب المنتج ٢٦ أكتوبر ٢٠٢٦: «نعم اجعلها لكل مستخدم»، والافتراضي «لكل الحسابات
    // المتصلة» مع اختيار تخصيص منصة) — ومراجعتها ٣١ أكتوبر («دقق جيداً»): الحفظ بالجزء اللي اتغيّر بس، وتعديلات كل التبويبات ----------
    function withSync(answer, fn) {
      var prev = window.syncCall, prevRead = AuthLogin.read, calls = [];
      window.syncCall = function (b) { calls.push(JSON.parse(JSON.stringify(b))); return answer(b, calls.length); };
      // دخول وهمي: من غيره الأداة مبتطلبش سجل المستخدم أصلاً (صفحة الاختبارات من غير دخول)
      AuthLogin.read = function () { return { access_token: 'test', expires_at: Date.now() + 3600000 }; };
      var done = function () {
        window.syncCall = prev;
        AuthLogin.read = prevRead;
        ['meta:act_1', 'meta:act_2', 'snapchat:abc-1', 'google:1'].forEach(function (k) { delete accountInfo[k]; });
        closeOverlays();
      };
      return Promise.resolve().then(function () { return fn(calls); }).then(done, function (e) { done(); throw e; });
    }
    // سيرفر وهمي بنفس دمج قاعدة البيانات (user_settings_merge — اتجرّبت على Postgres نفسه ٣١ أكتوبر): السجل، وطلبات الحفظ
    function fakeServer(initial) {
      var copy = function (v) { return v == null ? v : JSON.parse(JSON.stringify(v)); };
      var srv = { rec: copy(initial === undefined ? null : initial), sets: [] };
      srv.answer = function (b) {
        if (b.action === 'usettings.get') return Promise.resolve({ settings: copy(srv.rec) });
        if (b.action !== 'usettings.set') return Promise.resolve({});
        srv.sets.push(copy(b));
        var cur = srv.rec || copy(b.base) || { all: {} }, ch = b.changes || {};
        Object.keys(ch).forEach(function (k) {
          if (k === 'all') { if (ch.all) cur.all = copy(ch.all); }
          else if (k === 'acct') {
            cur.acct = cur.acct || {};
            Object.keys(ch.acct || {}).forEach(function (a) {
              if (ch.acct[a] === null) delete cur.acct[a]; else cur.acct[a] = copy(ch.acct[a]);
            });
            if (!Object.keys(cur.acct).length) delete cur.acct;
          } else if (ch[k] === null) { if (cur.plat) delete cur.plat[k]; }
          else { cur.plat = cur.plat || {}; cur.plat[k] = copy(ch[k]); }
        });
        if (b.goals) cur.all = Object.assign({}, cur.all, b.goals);
        if (b.asked) cur.asked = true;
        if (cur.plat && !Object.keys(cur.plat).length) delete cur.plat;
        srv.rec = cur;
        return Promise.resolve({ ok: true, settings: copy(cur) });
      };
      return srv;
    }
    // كتابة في خانة زي المستخدم (حدث input — النافذة بتعرف إن فيه تعديل)
    function typeIn(input, value) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }
    var inp = function (k) { return settingsForm.querySelector('[name="' + k + '"]'); };
    var tab = function (p) { return settingsForm.querySelector('[data-settings-scope="' + p + '"]'); };
    var META_TOKEN = { token: 'TEST_meta_token_1234567890', expiresAt: Date.now() + 86400000 };
    var SNAP_TOKEN = { token: 'snap.test-token_1234567890', expiresAt: Date.now() + 86400000 };
    var actionsOf = function (calls) { return calls.map(function (c) { return c.action; }); };
    test('المحرك: إعدادات الحساب من إعدادات المستخدم — سجل الحساب نفسه وإلا المنصة وإلا «كل الحسابات»، وحد النوع بعملة الحساب', function () {
      var us = { all: { roasTarget: 5, maxCost: { lead: 30 }, maxCostCur: 'SAR', campaignMaxCost: { c1: 40 } }, plat: { snapchat: { roasTarget: 2 } },
        acct: { 'meta:act_9': { roasTarget: 9 } } };
      var f = function (p, cur, id) { return PauseProofAlerts.settingsForAccount(us, p, cur, DX.pegRate, id); };
      eq(f('meta', 'SAR'), { roasTarget: 5, maxCost: { lead: 30 }, campaignMaxCost: { c1: 40 } }, 'same currency: as is, without the currency key');
      eq(f('google', 'USD').maxCost, { lead: 8 }, '30 SAR = 8 $ at the peg');
      eq(f('google', 'USD').campaignMaxCost, { c1: 40 }, 'a campaign limit is in its own account currency: not converted');
      ok(!('maxCost' in f('meta', 'EGP')), 'no official peg: the type limit is left out (no wrong urgent alert)');
      ok(!('maxCost' in f('meta', null)), 'currency not known yet: left out too');
      eq(f('snapchat', 'USD'), { roasTarget: 2 }, 'a customized platform: its own set only');
      // سجل الحساب الإعلاني نفسه (٨ نوفمبر ٢٠٢٦) بيسبق المنصة و«كل الحسابات»، والحسابات التانية في نفس المنصة بتفضل على القديم
      eq(f('meta', 'SAR', 'act_9'), { roasTarget: 9 }, 'the account\'s own record wins');
      eq(f('meta', 'SAR', 'act_1').roasTarget, 5, 'another account on the same platform keeps the old numbers');
      eq(PauseProofAlerts.ownSettingsOf(us, 'meta', 'act_9'), { roasTarget: 9 });
      eq([PauseProofAlerts.ownSettingsOf(us, 'meta', 'act_1'), PauseProofAlerts.ownSettingsOf(us, 'snapchat', 'act_9')], [null, null], 'no record for this account');
      eq(PauseProofAlerts.acctKey('meta', 'act_9'), 'meta:act_9', 'the key is the tool\'s own source');
      eq(PauseProofAlerts.settingsForAccount(null, 'meta', 'SAR', DX.pegRate), {}, 'no record: start values');
      eq(PauseProofAlerts.settingsForAccount({ all: { maxCost: { lead: 30 } } }, 'meta', 'USD', DX.pegRate).maxCost, { lead: 30 }, 'an old record without a currency: as is');
    });
    // مراجعة ٣١ أكتوبر: «كل الحسابات» فيها حدود حملات كل الحسابات مع بعض — الحد كان ٥٠٠ والزيادة بتضيع في صمت
    test('حد قوائم الحدود ٢٬٠٠٠ في المحرك زي السيرفر، ورفض السيرفر بسببه بيتقال بوضوح', function () {
      var big = {};
      for (var i = 0; i < 2001; i++) big['c' + i] = 1;
      eq(Object.keys(PauseProofAlerts.mergeSettings({ campaignMaxCost: big }).campaignMaxCost).length, 2000);
      eq(PauseProofAlerts.MAX_COST_KEYS, 2000);
      eq(saveErrText({ code: 'too many' }), t('settings.err.tooMany'));
      eq(saveErrText(new Error('HTTP 502')), t('settings.err.save'));
    });
    testAsync('إعدادات المستخدم من السيرفر: سجل كل حساب إعلاني لوحده، وأرقامه القديمة قيم بداية للباقي — طلب واحد في الجلسة من غير مفتاح منصة', function () {
      return withSync(function (b) {
        return Promise.resolve(b.action === 'usettings.get' ? { settings: {
          all: { roasTarget: 5, maxCost: { lead: 30 }, maxCostCur: 'SAR' },
          plat: { snapchat: { roasTarget: 2 } },
          acct: { 'meta:act_1': { roasTarget: 9, maxCost: { lead: 8 }, maxCostCur: 'USD' } }
        } } : {});
      }, function (calls) {
        userSet = null; userSetState = 'none';
        alertSettings = { roasTarget: 3 };   // نسخة جهاز قديمة (ممكن تكون لمستخدم تاني)
        activeSources.meta = 'act_1'; activeSources.snapchat = 'abc-1'; activeSources.google = '1';
        accountInfo['meta:act_1'] = { currency: 'USD' }; accountInfo['google:1'] = { currency: 'SAR' };
        candidates = [ad('m1', { source: 'meta:act_1' }), ad('s1', { source: 'snapchat:abc-1', platform: 'snapchat' }), ad('g1', { source: 'google:1', platform: 'google' })];
        runAnalysis();
        eq(analysis.settingsBySource['meta:act_1'].roasTarget, null, 'before the record arrives: start values (profit waits) — not the device copy');
        eq(calls.map(function (c) { return [c.action, 'platformToken' in c, 'accountId' in c]; }), [['usettings.get', false, false]], 'one read for the user, no account or platform token');
        return tick().then(function () {
          runAnalysis();
          var by = analysis.settingsBySource;
          eq([by['meta:act_1'].roasTarget, by['google:1'].roasTarget, by['snapchat:abc-1'].roasTarget], [9, 5, 2],
            'the account\'s own record, then the old platform numbers, then the old all-accounts numbers');
          eq([by['meta:act_1'].maxCost.lead, by['google:1'].maxCost.lead], [8, 30], 'its own limit in its own currency, and the inherited one converted');
          eq(actionsOf(calls), ['usettings.get'], 'one read per session');
          disconnectPlatform('snapchat', true);
          ok(settingsKnown() && userSet.acct['meta:act_1'], 'disconnecting a platform keeps the user settings');
        });
      });
    });
    testAsync('نقل الإعدادات القديمة مرة واحدة: سجل Meta = «كل الحسابات»، وSnapchat لو مختلف = إعداداته الخاصة، وبعد الحسابات ما تخلص تحميل', function () {
      var srv = fakeServer(null);
      return withSync(function (b) {
        if (b.action === 'usettings.get') return Promise.resolve({ settings: null });
        if (b.action === 'settings.get') return Promise.resolve({ settings: b.platform === 'meta' ? { roasTarget: 5, roasBreakEven: 5, maxCost: { lead: 30 } } : { roasTarget: 2, roasBreakEven: 1 } });
        return srv.answer(b);
      }, function (calls) {
        userSet = null; userSetState = 'none';
        alertSettings = { roasTarget: 3, roasBreakEven: 1 };
        activeSources.meta = 'act_1'; activeSources.snapchat = 'abc-1';
        sessionTokens.meta = META_TOKEN; sessionTokens.snapchat = SNAP_TOKEN;
        accountInfo['meta:act_1'] = { currency: 'SAR' };
        loadingPlatforms.snapchat = true;
        runAnalysis();
        return tick().then(function () {
          eq(actionsOf(calls), ['usettings.get'], 'an account still loading: waits');
          ok(!settingsKnown(), 'not ready yet');
          loadingPlatforms.snapchat = false;
          runAnalysis();
          return tick();
        }).then(function () {
          eq(calls.map(function (c) { return [c.action, c.platform || null, c.accountId || null, c.platformToken || null]; }), [
            ['usettings.get', null, null, null], ['settings.get', 'meta', 'act_1', META_TOKEN.token], ['settings.get', 'snapchat', 'abc-1', SNAP_TOKEN.token], ['usettings.set', null, null, null]]);
          var c = calls[3];
          ok(c.base && !c.changes && !c.goals, 'sent as «create if missing» (base), not as a change');
          eq(c.base.all, { roasTarget: 5, roasBreakEven: 5, maxCost: { lead: 30 }, maxCostCur: 'SAR' }, 'the Meta record = all accounts, its max cost in its account currency');
          eq(c.base.plat, { snapchat: { roasTarget: 2, roasBreakEven: 1 } }, 'Snapchat was different: its own settings, so nothing changes for it');
          eq(JSON.stringify(alertSettings), '{}', 'the device copy is gone once saved');
          eq(userSetBase, null, 'saved: nothing left to send');
          eq([settingsFor('meta:act_1').roasBreakEven, settingsFor('snapchat:abc-1').roasBreakEven], [5, 1]);
        });
      });
    });
    testAsync('نقل الإعدادات القديمة من جهازين في نفس الوقت: التاني بياخد سجل الأول (إنشاء لو مش موجود بس)', function () {
      var srv = fakeServer(null);
      return withSync(function (b) {
        if (b.action === 'usettings.get') return Promise.resolve({ settings: null });
        if (b.action === 'settings.get') return Promise.resolve({ settings: { roasTarget: 5, roasBreakEven: 5 } });
        if (!srv.rec) srv.rec = { all: { roasTarget: 9, roasBreakEven: 9 }, asked: true };   // الجهاز التاني سبق بلحظة
        return srv.answer(b);
      }, function () {
        userSet = null; userSetState = 'none';
        activeSources.meta = 'act_1'; sessionTokens.meta = META_TOKEN;
        runAnalysis();
        return tick().then(function () {
          eq(srv.sets[0].base.all, { roasTarget: 5, roasBreakEven: 5 }, 'this device offered its move');
          eq([srv.rec.all.roasTarget, userSet.all.roasTarget], [9, 9], 'the record already there is kept, and used here too');
        });
      });
    });
    testAsync('نقل الإعدادات القديمة بيستنى المنصة المتذكَّرة على الجهاز لحد ما ترجع (من غيرها كان هيحفظ قيم البداية مكان سجلها)', function () {
      var srv = fakeServer(null);
      return withSync(function (b) {
        if (b.action === 'usettings.get') return Promise.resolve({ settings: null });
        if (b.action === 'settings.get') return Promise.resolve({ settings: { roasTarget: 5, roasBreakEven: 5 } });
        return srv.answer(b);
      }, function (calls) {
        userSet = null; userSetState = 'none';
        lastAccounts.meta = 'act_1'; lastAccounts.snapchat = 'abc-1';
        activeSources.snapchat = 'abc-1'; sessionTokens.snapchat = SNAP_TOKEN;
        runAnalysis();
        return tick().then(function () {
          eq(actionsOf(calls), ['usettings.get'], 'Meta remembered but not back yet: waits');
          openAlertSettings();
          ok(settingsForm.textContent.indexOf(t('settings.loading')) > -1 && !settingsForm.querySelector('input'), 'the window waits too');
          closeOverlays();
          activeSources.meta = 'act_1'; sessionTokens.meta = META_TOKEN;
          runAnalysis();
          return tick();
        }).then(function () {
          eq(actionsOf(calls), ['usettings.get', 'settings.get', 'settings.get', 'usettings.set']);
          eq(calls[3].base.all, { roasTarget: 5, roasBreakEven: 5 }, 'Meta came back: its record moved');
        });
      });
    });
    testAsync('نقل الإعدادات القديمة فشل: الجلسة دي بالمنقول ومفيش حفظ لوحده، وأول حفظ من المستخدم بياخده معاه (مكانش بيضيع)', function () {
      var srv = fakeServer(null);
      return withSync(function (b) {
        if (b.action === 'usettings.get') return Promise.resolve({ settings: null });
        if (b.action === 'settings.get') return Promise.reject(new Error('HTTP 500'));
        return srv.answer(b);
      }, function (calls) {
        userSet = null; userSetState = 'none';
        alertSettings = { roasTarget: 5, cprWarnMultiple: 2 };
        activeSources.meta = 'act_1';
        sessionTokens.meta = META_TOKEN;
        runAnalysis();
        return tick().then(function () {
          eq(actionsOf(calls), ['usettings.get', 'settings.get'], 'nothing saved by itself (the next session reads again)');
          ok(settingsKnown(), 'the tool works with what it has');
          eq(settingsFor('meta:act_1').roasTarget, 5, 'this session: the device copy');
          eq(alertSettings.roasTarget, 5, 'the device copy is kept for the next try');
          openAlertSettings();
          return tick();
        }).then(function () {
          typeIn(inp('roasTarget'), '6');
          settingsSaveBtn.click();
          return tick();
        }).then(function () {
          var c = srv.sets[0];
          ok(c.base && c.base.all.cprWarnMultiple === 2, 'the moved settings go with the first save');
          eq([srv.rec.all.roasTarget, srv.rec.all.cprWarnMultiple], [5, 2], 'the moved settings become the starting values');
          eq([srv.rec.acct['meta:act_1'].roasTarget, srv.rec.acct['meta:act_1'].cprWarnMultiple], [6, 2], 'the account record starts from them, then the change');
          eq(userSetBase, null, 'sent once');
        });
      });
    });
    // قرار صاحب المنتج ٨ نوفمبر ٢٠٢٦: «تسجل الارقام لكل حساب اعلاني في كل منصة لكل مستخدم، بحيث عند تبديل الحساب الاعلاني يتغير
    // معها العائد المطلوب وباقي اعدادات التنبيهات» — تبويب لكل حساب متصل، وأرقامه القديمة قيم بداية لحد أول حفظ
    testAsync('نافذة الإعدادات: تبويب لكل حساب إعلاني، والأرقام القديمة قيم بداية، والحفظ بالحساب اللي اتغيّر بس (حساب جهاز تاني بيفضل)، والفشل بيظهر', function () {
      var srv = fakeServer({ all: { roasTarget: 4, maxCost: { lead: 30 }, maxCostCur: 'SAR' }, asked: true });
      var fail = false;
      return withSync(function (b) {
        if (fail && b.action === 'usettings.set') { var e = new Error('HTTP 502'); e.status = 502; return Promise.reject(e); }
        return srv.answer(b);
      }, function () {
        activeSources.meta = 'act_1'; activeSources.snapchat = 'abc-1';
        accountInfo['meta:act_1'] = { currency: 'SAR' }; accountInfo['snapchat:abc-1'] = { currency: 'SAR' };
        useSettings(srv.rec.all);
        openAlertSettings();
        ok(tab('meta:act_1') && tab('snapchat:abc-1') && !tab('google:1'), 'a tab per connected ad account');
        ok(tab('meta:act_1').classList.contains('active'), 'the account of the first connected platform by default');
        eq(inp('roasTarget').value, '4', 'the previous numbers as starting values');
        ok(settingsForm.textContent.indexOf(t('settings.scope.start')) > -1, 'says they are starting values until the first save');
        ok(settingsForm.textContent.indexOf(t('settings.scope.acctNote', { account: 'act_1', platform: PLATFORM_NAMES.meta })) > -1, 'says these settings are for this account alone');
        ok(!settingsForm.querySelector('[data-settings-custom]') && !settingsForm.querySelector('[data-settings-uncustom]'), 'no «customize» step any more');
        // رأس النافذة كان لسه «لهذا الحساب الإعلاني وحده» بعد ما الإعدادات بقت لكل مستخدم (اتشاف حياً ٣١ أكتوبر)
        ok(document.querySelector('#settingsOverlay .expand-sub').textContent.indexOf('لهذا الحساب الإعلاني') < 0, 'the window header does not claim it is only this account');
        tab('snapchat:abc-1').click();
        eq(inp('roasTarget').value, '4', 'the other account starts from the same numbers');
        eq(srv.sets.length, 0, 'switching tabs saves nothing');
        typeIn(inp('roasTarget'), '3');
        settingsSaveBtn.click();
        ok(settingsSaveBtn.disabled, 'busy while saving');
        return tick().then(function () {
          var c = srv.sets[0];
          eq(Object.keys(c.changes), ['acct'], 'saved for the ad account itself');
          eq(Object.keys(c.changes.acct), ['snapchat:abc-1'], 'only the changed account is sent');
          eq([c.changes.acct['snapchat:abc-1'].roasTarget, c.asked], [3, true]);
          ok(!('settings' in c) && !('platformToken' in c) && !('accountId' in c), 'per user, and never the whole record');
          ok(settingsOverlay.classList.contains('hidden'), 'closed after the save');
          eq([settingsFor('snapchat:abc-1').roasTarget, settingsFor('meta:act_1').roasTarget], [3, 4], 'switching the account switches the number');
          openAlertSettings();
          return tick();
        }).then(function () {
          // جهاز تاني حفظ لحساب Snapchat بعد ما النافذة دي اتفتحت (الصفحة دي متعرفش)
          srv.rec.acct['snapchat:abc-1'] = { roasTarget: 9 };
          ok(settingsForm.textContent.indexOf(t('settings.scope.start')) > -1, 'Meta still on the starting values');
          typeIn(inp('roasTarget'), '6');
          tab('snapchat:abc-1').click();
          ok(document.activeElement === tab('snapchat:abc-1'), 'focus stays on the chosen tab');
          ok(settingsForm.textContent.indexOf(t('settings.scope.start')) < 0, 'an account with its own record: not called starting values');
          tab('meta:act_1').click();
          eq(inp('roasTarget').value, '6', 'what was typed stays when switching tabs');
          ok(tab('meta:act_1').textContent.indexOf('•') > -1, 'and the tab is marked unsaved');
          fail = true;
          settingsSaveBtn.click();
          return tick();
        }).then(function () {
          ok(!settingsOverlay.classList.contains('hidden'), 'failed save keeps the window open');
          eq(document.getElementById('settingsError').textContent, t('settings.err.save'));
          ok(!srv.rec.acct['meta:act_1'], 'nothing changed on the server');
          fail = false;
          settingsSaveBtn.click();
          return tick();
        }).then(function () {
          var c = srv.sets[srv.sets.length - 1], mine = c.changes.acct['meta:act_1'];
          eq(Object.keys(c.changes.acct), ['meta:act_1']);
          eq([mine.roasTarget, mine.maxCost, mine.maxCostCur], [6, { lead: 30 }, 'SAR'], 'the max cost and its currency kept');
          eq([srv.rec.acct['meta:act_1'].roasTarget, srv.rec.acct['snapchat:abc-1'].roasTarget], [6, 9], 'the other device\'s account record survives');
          eq(settingsFor('snapchat:abc-1').roasTarget, 9, 'and this page now has it');
          eq(srv.rec.all.roasTarget, 4, 'the old all-accounts numbers stay as starting values for any other account');
          delete accountInfo['meta:act_1']; delete accountInfo['snapchat:abc-1'];
        });
      });
    });
    testAsync('«حفظ» بيحفظ تعديلات كل التبويبات في طلب واحد (قبل كده التبويب الظاهر بس، والتاني كان بيضيع)، والقيمة الغلط بتمنع ترك التبويب', function () {
      var srv = fakeServer({ all: { roasTarget: 4 }, acct: { 'snapchat:abc-1': { roasTarget: 3 } }, asked: true });
      return withSync(srv.answer, function () {
        activeSources.meta = 'act_1'; activeSources.snapchat = 'abc-1';
        useSettings(srv.rec.all, null, true, srv.rec.acct);
        openAlertSettings();
        return tick().then(function () {
          typeIn(inp('roasTarget'), 'abc');
          tab('snapchat:abc-1').click();
          ok(tab('meta:act_1').classList.contains('active') && settingsForm.querySelector('.setting-row.invalid [name="roasTarget"]'), 'a wrong value: stays on the tab, with the error next to it');
          typeIn(inp('roasTarget'), '7');
          tab('snapchat:abc-1').click();
          ok(tab('snapchat:abc-1').classList.contains('active'), 'fixed: moves on');
          eq(inp('roasTarget').value, '3', 'the Snapchat account shows its own');
          typeIn(inp('cprWarnMultiple'), '2');
          settingsSaveBtn.click();
          return tick();
        }).then(function () {
          eq(srv.sets.length, 1, 'one request');
          eq(Object.keys(srv.sets[0].changes.acct).sort(), ['meta:act_1', 'snapchat:abc-1'], 'both tabs');
          eq([srv.rec.acct['meta:act_1'].roasTarget, srv.rec.acct['snapchat:abc-1'].roasTarget, srv.rec.acct['snapchat:abc-1'].cprWarnMultiple], [7, 3, 2]);
          eq(srv.rec.all.roasTarget, 4, 'the starting values are untouched');
          ok(settingsOverlay.classList.contains('hidden'));
        });
      });
    });
    testAsync('فتح النافذة بيجيب أحدث نسخة (تعديل من جهاز تاني) — ومبيمسحش اللي المستخدم بدأ يكتبه', function () {
      var srv = fakeServer({ all: { roasTarget: 4, roasBreakEven: 2 }, asked: true });
      return withSync(srv.answer, function (calls) {
        activeSources.meta = 'act_1';
        useSettings({ roasTarget: 4, roasBreakEven: 2 });
        srv.rec.all = { roasTarget: 6, roasBreakEven: 3 };   // اتغيّرت من جهاز تاني
        openAlertSettings();
        eq(inp('roasTarget').value, '4', 'shows what it has right away');
        return tick().then(function () {
          eq(actionsOf(calls), ['usettings.get'], 'one fresh read on open');
          eq(inp('roasTarget').value, '6', 'then the latest from the server');
          eq(settingsFor('meta:act_1').roasTarget, 6, 'the alerts follow it too');
          closeOverlays();
          srv.rec.all = { roasTarget: 8, roasBreakEven: 3 };
          openAlertSettings();
          typeIn(inp('roasTarget'), '5');   // بدأ يكتب قبل ما الرد يوصل
          return tick();
        }).then(function () {
          eq(inp('roasTarget').value, '5', 'what the user typed stays');
          eq(userSet.all.roasTarget, 8, 'the rest is up to date');
        });
      });
    });
    testAsync('قراءة بدأت قبل حفظ متتسجلش فوقه (الرد القديم بيتجاهل)', function () {
      var resolveGet = null;
      return withSync(function (b) {
        if (b.action === 'usettings.get') return new Promise(function (r) { resolveGet = r; });
        return Promise.resolve({ ok: true, settings: { all: { roasTarget: 7, roasBreakEven: 2 }, asked: true } });
      }, function () {
        useSettings({ roasTarget: 4, roasBreakEven: 2 });
        refreshUserSettings();
        return writeUserSettings({ changes: { all: { roasTarget: 7, roasBreakEven: 2 } } }).then(function () {
          resolveGet({ settings: { all: { roasTarget: 4, roasBreakEven: 2 }, asked: true } });   // الرد القديم وصل بعد الحفظ
          return tick();
        }).then(function () {
          eq(userSet.all.roasTarget, 7, 'the save wins');
        });
      });
    });
    testAsync('قراءة الإعدادات فشلت: رسالة في شريط الحالة مرة واحدة، وإعادة تلقائية لحد ما تنجح (قبل كده قيم البداية في صمت)', function () {
      var keepRetry = USER_RETRY_MS, n = 0;
      USER_RETRY_MS = [5];
      return withSync(function (b) {
        if (b.action !== 'usettings.get') return Promise.resolve({});
        n++;
        return n < 3 ? Promise.reject(new Error('network')) : Promise.resolve({ settings: { all: { roasTarget: 4, roasBreakEven: 2 }, asked: true } });
      }, function () {
        userSet = null; userSetState = 'none';
        pullUserSettings();
        return tick().then(function () {
          eq(userSetState, 'error');
          eq(document.getElementById('connectStatus').textContent, t('settings.err.loadAuto'), 'says so');
          return new Promise(function (r) { setTimeout(r, 80); });
        }).then(function () {
          eq([n, userSetState, userSetFails], [3, 'ready', 0], 'tried again by itself until it worked');
          eq(settingsFor('meta:act_1').roasTarget, 4);
        });
      }).then(function () { USER_RETRY_MS = keepRetry; }, function (e) { USER_RETRY_MS = keepRetry; throw e; });
    });
    test('نافذة الإعدادات قبل ما سجل المستخدم يوصل، أو لو معرفناش نجيبه: مفيش خانات ولا حفظ، و«حاول مرة أخرى» بيطلبه تاني', function () {
      var prev = window.syncCall, prevRead = AuthLogin.read, asked = 0;
      window.syncCall = function () { asked++; return new Promise(function () {}); };   // الطلب ميخلصش في الاختبار
      AuthLogin.read = function () { return { access_token: 'test', expires_at: Date.now() + 3600000 }; };
      try {
        userSet = null; userSetState = 'loading';
        openAlertSettings();
        ok(!settingsForm.querySelector('input') && settingsSaveBtn.disabled && settingsForm.textContent.indexOf(t('settings.loading')) > -1, 'record on its way: no form (no overwriting what we have not seen)');
        userSetState = 'error';
        renderSettingsForm();
        ok(!settingsForm.querySelector('input') && settingsSaveBtn.disabled && settingsForm.querySelector('[data-settings-retry]'), 'failed: retry, no form');
        settingsForm.querySelector('[data-settings-retry]').click();
        eq([asked, userSetState], [1, 'loading'], 'retry asks again');
        ok(settingsForm.textContent.indexOf(t('settings.loading')) > -1);
        // من غير أي حساب متصل: مفيش خانات خالص (الإعدادات بقت لكل حساب إعلاني — ٨ نوفمبر ٢٠٢٦)
        useSettings({});
        openAlertSettings();
        ok(!settingsForm.querySelector('[name="roasTarget"]') && settingsSaveBtn.disabled, 'no account: nothing to set');
        ok(settingsForm.textContent.indexOf(t('settings.scope.none')) > -1, 'asks to connect an ad account first');
        ok(!settingsForm.querySelector('[data-settings-scope]'), 'no tabs');
        // ومع حساب متصل: خانات الحساب ده
        activeSources.meta = 'act_1';
        openAlertSettings();
        ok(settingsForm.querySelector('[name="roasTarget"]') && !settingsSaveBtn.disabled, 'with an account: its own fields');
      } finally { window.syncCall = prev; AuthLogin.read = prevRead; closeOverlays(); }
    });
    testAsync('نافذة أول مرة للمستخدم: بتستنى سجله، والحفظ بالعائد المستهدف بس كقيمة بداية لكل حساباته، و«لاحقاً» أو Esc بيتسجّلوا في سجله', function () {
      var srv = fakeServer(null), fail = false;
      var hidden = function () { return welcomeOverlay.classList.contains('hidden'); };
      // مستخدم من غير مستهدف، وعنده حد تكلفة محفوظ (من جهاز تاني) — نسخة الصفحة متعرفوش
      var fresh = function (all) {
        srv.rec = { all: Object.assign({ maxCost: { purchase: 30 }, maxCostCur: 'USD' }, all || {}) };
        userSet = normUserSet({ all: all || {} }); userSetState = 'ready'; welcomeDone = false;
      };
      return withSync(function (b) {
        if (fail && b.action === 'usettings.set') { var e = new Error('HTTP 502'); e.status = 502; return Promise.reject(e); }
        return srv.answer(b);
      }, function () {
        fresh();
        maybeShowWelcome();
        ok(hidden(), 'no account yet: nothing');
        activeSources.meta = 'act_1';
        userSetState = 'loading';
        render();
        ok(hidden(), 'waits for the user record (no question before we know)');
        userSetState = 'ready';
        render();
        ok(!hidden(), 'no target yet: the window opens');
        ok(welcomeForm.textContent.indexOf(t('welcome.scope')) > -1, 'says it is a starting point for every ad account');
        eq(welcomeForm.querySelectorAll('input[type="radio"]').length, 0, 'no presets');
        eq(welcomeForm.querySelectorAll('input[type="text"]').length, 1, 'one money question (the loss limit was removed 8 Nov 2026)');
        eq(welcomeForm.querySelector('[name="roasTarget"]').value, '', 'the goal starts empty');
        welcomeForm.querySelector('[name="roasTarget"]').value = '0';
        document.getElementById('welcomeSave').click();
        ok(!hidden() && welcomeForm.querySelector('.setting-row.invalid [name="roasTarget"]'), 'a number out of range: error');
        eq(srv.sets.length, 0, 'nothing sent');
        welcomeForm.querySelector('[name="roasTarget"]').value = '5';
        document.getElementById('welcomeSave').click();
        return tick().then(function () {
          eq(srv.sets.length, 1, 'one save');
          eq(srv.sets[0].goals, { roasTarget: 5 }, 'only the goal');
          ok(srv.sets[0].asked && !srv.sets[0].changes, 'no whole set from this page');
          eq(srv.rec.all, { maxCost: { purchase: 30 }, maxCostCur: 'USD', roasTarget: 5 }, 'the cost limit saved from the other device stays');
          ok(hidden(), 'closed');
          render();
          ok(hidden(), 'never again');
          fresh();
          render();
          ok(!hidden(), 'asked again for a user without goals');
          document.getElementById('welcomeSkip').click();
          ok(hidden());
          return tick();
        }).then(function () {
          var c = srv.sets[srv.sets.length - 1];
          ok(c.asked && !c.goals && !c.changes, '«Later»: only remembered, profit waits');
          fresh();
          render();
          closeOverlays();
          ok(hidden(), 'Esc closes it');
          return tick();
        }).then(function () {
          var c = srv.sets[srv.sets.length - 1];
          ok(c.asked && !c.goals, 'Esc is remembered too');
          fresh();
          render();
          welcomeForm.querySelector('[name="roasTarget"]').value = '5';
          fail = true;
          document.getElementById('welcomeSave').click();
          return tick();
        }).then(function () {
          ok(!hidden(), 'failed save keeps the window open');
          eq(welcomeErrorEl.textContent, t('settings.err.save'));
          eq(srv.rec.all.roasTarget, undefined, 'nothing changed');
          fail = false;
          closeOverlays();
          fresh({ roasTarget: 4 });
          render();
          ok(hidden(), 'goals set: not asked');
          useSettings({});
          welcomeDone = false;
          render();
          ok(hidden(), 'already asked (on any device): not asked');
        });
      });
    });
    test('ملخص المتجر: المستهدف المشترك بين المنصات المعروضة بس (حساب بهامش مختلف = من غير سطر مستهدف)', function () {
      activeSources.meta = 'act_1'; activeSources.snapchat = 'abc-1';
      useSettings({ roasTarget: 4 }, { snapchat: { roasTarget: 3 } });
      // منصات أرقام المبيعات في العرض المختار (dxState.sel.plats — dxSelection)
      var saved = dxState.sel;
      try {
        dxState.sel = { plats: ['meta'] };
        eq(dxGoals(), { roas: 4 });
        dxState.sel = { plats: ['snapchat'] };
        eq(dxGoals(), { roas: 3 });
        dxState.sel = { plats: ['meta', 'snapchat'] };
        eq(dxGoals(), null, 'different goals: no target line');
        useSettings({ roasTarget: 4 });
        eq(dxGoals(), { roas: 4 }, 'all accounts: shared');
        // الحساب نفسه بمستهدف مختلف (٨ نوفمبر): العرض بحسابين بمستهدفين = من غير سطر مستهدف
        useSettings({ roasTarget: 4 }, null, true, { 'snapchat:abc-1': { roasTarget: 6 } });
        eq(dxGoals(), null, 'one account has its own target: no shared target line');
        dxState.sel = { plats: ['snapchat'] };
        eq(dxGoals(), { roas: 6 }, 'that account alone: its own');
        useSettings({ roasTarget: 4 }, { snapchat: {} });
        eq(dxGoals(), null, 'a platform without goals: no target line');
      } finally { dxState.sel = saved; }
    });

    // ---------- أقصى تكلفة مقبولة لكل نتيجة: للحساب ولكل حملة (مراجعة الإعدادات ٢٤ أكتوبر — قرار صاحب المنتج) ----------
    function costAccount() {
      return [
        ad('m1', { key: 'message', cid: 'c-cheap', camp: 'Cheap', daily: steady(100), res: steady(10) }),
        ad('m2', { key: 'message', cid: 'c-prem', camp: 'Premium', daily: steady(100), res: steady(2) }),
        // إعلان مبيعات بيسجّل قيمة الطلبات: من ٢٥ أكتوبر في قائمة التكلفة كمان (الحد بيتطبّق مع العائد — الحكم بحدودك)
        ad('p1', { key: 'purchase', cid: 'c-shop', camp: 'Shop', daily: steady(100), res: steady(2), sales: steady(400) })
      ];
    }
    testAsync('نافذة الإعدادات: أقصى تكلفة لكل نوع نتيجة ولكل حملة — نفس إعلانات المحرك، والفاضي يشيل الحد، والمبلغ الغلط خطأ ظاهر', function () {
      var own = { roasTarget: 4, maxCost: { message: 12, lead: 30 }, campaignMaxCost: { 'c-gone': 50 }, maxCostCur: 'SAR' };
      var srv = fakeServer({ all: { roasTarget: 4 }, acct: { 'meta:act_1': own }, asked: true });
      return withSync(srv.answer, function () {
        activeSources.meta = 'act_1';
        sessionTokens.meta = META_TOKEN;
        useSettings(srv.rec.all, null, true, srv.rec.acct);
        candidates = costAccount();
        accountInfo['meta:act_1'] = { currency: 'SAR' };
        var cost = function (name) { return settingsForm.querySelector('[data-cost="' + name + '"]'); };
        openAlertSettings();
        var sec = settingsForm.querySelector('[data-cost-section]');
        ok(sec, 'the section is on the main screen');
        ok(!settingsForm.querySelector('details.settings-advanced [data-cost-section]'), 'not hidden in advanced');
        ok(cost('type:message') && cost('type:lead') && cost('type:purchase'), 'message (loaded), lead (saved) and purchase (sales ads too since 25 Oct)');
        eq([cost('type:message').value, cost('type:lead').value], ['12', '30']);
        ok(sec.textContent.indexOf(t('settings.cost.now', { cpr: money(1400 / 84, 'SAR'), one: t('res1.message') })) > -1, 'shows the current cost');
        ok(cost('camp:c-cheap') && cost('camp:c-prem') && cost('camp:c-shop'), 'every campaign with known results, sales too');
        eq(cost('camp:c-prem').placeholder, '12', 'empty campaign field shows the account limit it inherits');
        ok(cost('camp:c-gone') && sec.textContent.indexOf(t('settings.cost.campId', { id: 'c-gone' })) > -1, 'a campaign saved in this account\'s own record but not loaded: shown by its ID, so it can be removed');
        ok(sec.querySelector('details.settings-camps').open, 'opened when a campaign has its own limit');
        cost('type:message').value = '-5';
        cost('camp:c-prem').value = 'abc';
        settingsSaveBtn.click();
        eq(srv.sets.length, 0, 'nothing sent');
        eq(settingsForm.querySelectorAll('.setting-row.invalid [data-cost]').length, 2);
        ok(settingsForm.textContent.indexOf(t('set.err.cost')) > -1);
        cost('type:message').value = '12,5';
        cost('type:lead').value = '';
        cost('camp:c-prem').value = '1,500';
        cost('camp:c-gone').value = '';
        settingsSaveBtn.click();
        return tick().then(function () {
          var s = srv.sets[0].changes.acct['meta:act_1'];
          eq([s.maxCost, s.campaignMaxCost, s.maxCostCur], [{ message: 12.5 }, { 'c-prem': 1500 }, 'SAR'], 'decimal comma, thousands separator, emptied = removed, the limits currency saved');
          openAlertSettings();
          settingsForm.querySelectorAll('[data-cost]').forEach(function (i) { i.value = ''; });
          settingsSaveBtn.click();
          return tick();
        }).then(function () {
          var s = srv.sets[1].changes.acct['meta:act_1'];
          ok(!('maxCost' in s) && !('campaignMaxCost' in s) && !('maxCostCur' in s), 'all emptied: no limits (or their currency) kept from the old record');
          delete accountInfo['meta:act_1'];
          // المحرك بياخد حد الحملة قبل حد الحساب
          useSettings({ roasTarget: 4, maxCost: { message: 12 }, campaignMaxCost: { 'c-prem': 60 } });
          runAnalysis();
          var b = analysis.byAd.m2 && analysis.byAd.m2.basis || '';
          ok(b.indexOf(money(60, 'SAR')) > -1 && b.indexOf(t('al.costMax.camp')) > -1, 'Premium judged against its own 60: ' + b);
        });
      });
    });
    // إعدادات لكل حساب إعلاني (٨ نوفمبر): أرقامه القديمة بتتحوّل لعملة الحساب بسعر الربط الرسمي — زي ما المحرك بيعمل بالظبط،
    // فاللي معروض في النافذة هو اللي بيتحكم بيه فعلاً. وعملة مش مربوطة = الخانة فاضية (الحد القديم مش منطبّق عليه أصلاً)
    test('قسم التكلفة لكل حساب: الحد الموروث بعملة الحساب نفسه، والعملة اللي مش مربوطة خانتها فاضية، وحد حملة حساب تاني مبيتورّثش', function () {
      activeSources.meta = 'act_1'; activeSources.google = '1';
      accountInfo['meta:act_1'] = { currency: 'SAR' }; accountInfo['google:1'] = { currency: 'EGP' };
      try {
        useSettings({ maxCost: { message: 12 }, maxCostCur: 'SAR', campaignMaxCost: { c1: 20, 'c-gone': 50 } });
        candidates = [ad('m1', { key: 'message', cid: 'c1', camp: 'A', daily: steady(100), res: steady(10), source: 'meta:act_1' }),
          ad('g1', { key: 'message', cid: 'c2', camp: 'B', daily: steady(100), res: steady(10), source: 'google:1', platform: 'google' })];
        renderSettingsForm();
        var sec = settingsForm.querySelector('[data-cost-section]');
        var row = function (n) { return settingsForm.querySelector('[data-cost="' + n + '"]'); };
        eq(row('type:message').value, '12', 'the account currency is the saved one: as is');
        ok(row('type:message').closest('.setting-row').textContent.indexOf(currencyLabel('SAR')) > -1, 'in its own currency');
        eq(row('camp:c1').value, '20', 'a campaign of this account: inherited');
        ok(!row('camp:c-gone'), 'a campaign that is not this account\'s: not inherited (one campaign belongs to one account)');
        // حساب بعملة غير مربوطة بالمحفوظة: الحد القديم مش منطبّق عليه (المحرك بيسقطه) فالخانة فاضية بعملته
        settingsScope = 'google:1';
        renderSettingsForm();
        sec = settingsForm.querySelector('[data-cost-section]');
        eq(row('type:message').value, '', 'no official peg: nothing inherited');
        // عملة مربوطة: الحد بيتحوّل (١٢ ر.س = ٣٫٢ $)
        accountInfo['google:1'] = { currency: 'USD' };
        renderSettingsForm();
        eq(row('type:message').value, '3.2', '12 SAR = 3.2 $ at the peg');
        ok(row('type:message').closest('.setting-row').textContent.indexOf(currencyLabel('USD')) > -1, 'in dollars');
        // الحد المحوَّل بخانتين زي الحفظ (٢٫٥ $ = ٩٫٣٧٥ ر.س ← ٩٫٣٨) — الخانة والمحفوظ نفس الرقم
        useSettings({ maxCost: { message: 2.5 }, maxCostCur: 'USD' });
        settingsScope = 'meta:act_1';
        renderSettingsForm();
        eq(row('type:message').value, '9.38', '2.5 $ = 9.38 SAR, two decimals like the save');
      } finally { delete accountInfo['meta:act_1']; delete accountInfo['google:1']; settingsScope = ''; settingsOverlay.classList.add('hidden'); }
    });
    // فحص بعد حفظ صاحب المنتج الحقيقي (٨ نوفمبر): حسابه بالريال وحدوده محفوظة بالدولار، وفيه حد لنوع نتيجة ملوش إعلانات في الحساب
    // (رسائل في حساب مبيعات) — أول حفظ لازم يحتفظ بالحدّين بعملة الحساب، ميسقطش اللي مالوش إعلانات
    testAsync('أول حفظ لحساب: الحدود الموروثة كلها بتتحفظ بعملته — حتى حد نوع نتيجة مالوش إعلانات في الحساب', function () {
      var srv = fakeServer({ all: { roasTarget: 8, maxCost: { purchase: 20, message: 2.5 }, maxCostCur: 'USD' }, asked: true });
      return withSync(srv.answer, function () {
        activeSources.meta = 'act_1';
        accountInfo['meta:act_1'] = { currency: 'SAR' };
        useSettings(srv.rec.all);
        candidates = [ad('p1', { key: 'purchase', cid: 'c1', camp: 'A', daily: steady(100), res: steady(2), sales: steady(400), source: 'meta:act_1' })];
        openAlertSettings();
        return tick().then(function () {
          var cost = function (n) { return settingsForm.querySelector('[data-cost="' + n + '"]'); };
          eq([cost('type:purchase').value, cost('type:message').value], ['75', '9.38'], 'both limits in the account currency (20 $ and 2.5 $ at the peg)');
          typeIn(inp('roasTarget'), '6');
          settingsSaveBtn.click();
          return tick();
        }).then(function () {
          var s = srv.rec.acct['meta:act_1'];
          eq([s.roasTarget, s.maxCost, s.maxCostCur], [6, { purchase: 75, message: 9.38 }, 'SAR'], 'nothing silently dropped');
          eq(srv.rec.all.maxCost, { purchase: 20, message: 2.5 }, 'the old numbers stay as starting values for other accounts');
          delete accountInfo['meta:act_1'];
        });
      });
    });
    test('ملخص المتجر: التكلفة مقابل الحد لكل نوع نتيجة (أرقام من غير حكم)، والحملات بحدها الخاص برّه الرقم، و«كل المنصات» من غيره', function () {
      activeSources.meta = 'act_1';
      useSettings({ maxCost: { message: 12 } });
      candidates = costAccount();
      var line = costVsMax(['meta']);
      eq(line.length, 1);
      // ١٤٠٠ على ٨٤ محادثة (الإعلانين)، ومن غير إعلان المبيعات
      ok(line[0].text.indexOf(money(1400 / 84, 'SAR')) > -1 && line[0].text.indexOf(money(12, 'SAR')) > -1, line[0].text);
      ok(line[0].text.indexOf(t('dx.costMax.campNote')) < 0);
      useSettings({ maxCost: { message: 12 }, campaignMaxCost: { 'c-prem': 60 } });
      line = costVsMax(['meta']);
      ok(line[0].text.indexOf(money(10, 'SAR')) > -1 && line[0].text.indexOf(t('dx.costMax.campNote')) > -1, 'Premium out of the number, and said so: ' + line[0].text);
      eq(costVsMax(['meta', 'snapchat']), [], 'several accounts: no line');
      useSettings({});
      eq(costVsMax(['meta']), [], 'no limits: no line');
    });
    // الملخص المرسوم فعلاً في «كل المنصات» (الافتراضي — ومنصة واحدة متصلة دايماً كده): رقم المنصة في كل خانة، وسطر «ليه أعلى»، وسطر
    // التكلفة مقابل الحد. من ٢٥ أكتوبر (a749cbc) السطرين دول مكانوش بيظهروا خالص في الأداة — في البريد بس (مراجعة ٨ نوفمبر ٢٠٢٦)
    test('الملخص في العرض الافتراضي: رقم المنصة في كل خانة، وسطر «ليه أعلى»، وسطر التكلفة مقابل الحد بيظهروا', function () {
      var keep = { on: DX_ON, period: period, compare: compare, sel: platSel, dx: dxState };
      try {
        DX_ON = true; period = { preset: 'last7' }; compare = { mode: 'prev' }; platSel = null;
        activeSources.meta = 'act_1';
        useSettings({ maxCost: { message: 12 } });
        candidates = costAccount();
        var p = dxPeriodFor(BROWSER_TZ), daily = [];
        for (var k = shiftKey(p.since, -60); k <= p.until; k = shiftKey(k, 1)) daily.push({ date: k, spend: 100, imp: 5000, clicks: 100, atc: 20, ic: 10, pur: 5, rev: 500, ppur: 8, prev: 900 });
        var inp = { since: p.since, until: p.until, unit: p.unit, cmp: p.cmp, today: p.today, currency: 'SAR', timezone: BROWSER_TZ, daily: daily, dims: [] };
        dxState = dxFresh();
        dxState.status = 'ready';
        dxState.sources.meta = { status: 'ready', key: 'k', input: inp, report: DX.analyze(inp), account: 'A', accountId: 'act_1', gen: 1 };
        dxBuild();
        renderDiagnosis();
        var body = document.getElementById('dxBody').textContent, under = document.getElementById('dxToday').textContent;
        ok(body.indexOf(t('dx.kpi.plat', { v: fmtNum(56) })) > -1 && body.indexOf(t('dx.kpi.plat', { v: money(6300, 'SAR') })) > -1, 'the platform number in the boxes: ' + body);
        ok(under.indexOf(t('dx.platWhy', { plat: 'Meta' })) > -1, 'why it is higher: ' + under);
        ok(under.indexOf(money(1400 / 84, 'SAR')) > -1 && under.indexOf(money(12, 'SAR')) > -1, 'the cost against the limit: ' + under);
      } finally {
        DX_ON = keep.on; period = keep.period; compare = keep.compare; platSel = keep.sel; dxState = keep.dx;
        useSettings({});
        renderDiagnosis();
      }
    });
    // قرار صاحب المنتج ٢٥ أكتوبر: «ضيفه في البريد ايضاً» — السطر كان في الأداة بس. الحساب بقى في المحرك (DX.costVsMax)، والمُشغّل
    // بيديله أرقام فترة الملخص لكل إعلان (runner.ts costLine)، والنص المنسوخ ونص البريد (DX.toText) بيقولوه
    test('سطر «التكلفة مقابل الحد» من المحرك نفسه: الأداة والنص المنسوخ ورسالة البريد بنفس الكلام', function () {
      var s = PauseProofAlerts.mergeSettings({ maxCost: { message: 12 }, campaignMaxCost: { 'c-prem': 60 } });
      var ads = [
        { resultKey: 'message', campaignId: 'c-a', currency: 'SAR', spend: 600, results: 50 },
        { resultKey: 'message', campaignId: 'c-prem', currency: 'SAR', spend: 800, results: 34 },
        { resultKey: 'purchase', campaignId: 'c-a', currency: 'SAR', spend: 900, results: 3 }
      ];
      var line = withLang('ar', function () { return DX.costVsMax(ads, s, '١٩–٢٢ أكتوبر'); });
      ok(line && line.indexOf('(١٩–٢٢ أكتوبر)') > -1 && line.indexOf(money(12, 'SAR')) > -1 && line.indexOf(t('dx.costMax.campNote')) > -1, line || 'no line');
      ok(line.indexOf(money(600 / 50, 'SAR')) > -1, 'the premium campaign is out of the number: ' + line);
      // ونفس الكلام اللي الأداة بتعرضه لنفس الأرقام
      activeSources.meta = 'act_1';
      useSettings({ maxCost: { message: 12 }, campaignMaxCost: { 'c-prem': 60 } });
      candidates = costAccount();
      var tool = withLang('ar', function () { return costVsMax(['meta']); });
      var mine = costAds('meta:act_1').map(function (c) { var p = periodOf(c); return { resultKey: c.resultKey, campaignId: c.campaignId, currency: c.currency, spend: p.spend, results: p.results }; });
      eq(tool[0].text, withLang('ar', function () { return DX.costVsMax(mine, PauseProofAlerts.mergeSettings(userSet.all), periodLabel()); }));
      eq(dxState.costCmp, tool[0].text, 'kept for the copied text');
      var text = withLang('ar', function () { return DX.toText({ period: 'p', title: 'T', tone: 'bad', kpis: [], blocks: [], notes: [], costCmp: line }, 'Acc'); });
      ok(text.indexOf(line) > -1, text);
      eq(DX.costVsMax(ads, PauseProofAlerts.mergeSettings({}), 'p'), null, 'no limits: no line');
      eq(DX.costVsMax([{ resultKey: 'message', spend: 50, results: 0 }], s, 'p'), null, 'no results in the period: no line');
      useSettings({});
    });
  });

  // ---------- دخول الأداة في الاختبارات (api/_login.js) ----------
  // مفتاح توقيع وهمي (ES256) بيتعمل هنا، ومفتاح دخول موقّع بيه. api/_login.js بيحفظ مفاتيح التوقيع وإجابة «الجلسة
  // مأكَّدة» — فبعد التجهيز ده (setupLogin) كل طلبات /api في الاختبارات بتعدّي بالهيدر من غير أي شبكة
  var TEST_LOGIN = { token: null, key: null, jwk: null };
  var LOGIN_ISSUER = 'https://rhrrnxsgodiideqeollo.supabase.co/auth/v1';
  function b64urlOf(bytes) { var s = ''; new Uint8Array(bytes).forEach(function (b) { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64urlText(t) { return b64urlOf(new TextEncoder().encode(t)); }
  function signJwt(key, header, payload) {
    var head = b64urlText(JSON.stringify(header)) + '.' + b64urlText(JSON.stringify(payload));
    return crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(head)).then(function (sig) { return head + '.' + b64urlOf(sig); });
  }
  function loginClaims(extra) {
    return Object.assign({ iss: LOGIN_ISSUER, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 6 * 3600, sub: 'u-test', session_id: 's-test', email: 'tester@example.com' }, extra || {});
  }
  // بيرد على مفاتيح Supabase العامة وسؤال session_ok — والباقي للـ fetch الأصلي
  function loginFetch(realFetch, sessionOk) {
    return function (url, opts) {
      var u = String(url);
      var json = function (o) { return Promise.resolve(new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } })); };
      if (u.indexOf('/.well-known/jwks.json') > -1) return json({ keys: [Object.assign({ kid: 'test-kid', alg: 'ES256', use: 'sig' }, TEST_LOGIN.jwk)] });
      if (u.indexOf('/rest/v1/rpc/session_ok') > -1) return json(sessionOk ? sessionOk(JSON.parse(opts.body)) : true);
      return realFetch.apply(window, arguments);
    };
  }
  function setupLogin() {
    var keys = TEST_LOGIN.key ? Promise.resolve() : crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']).then(function (kp) {
      TEST_LOGIN.key = kp.privateKey;
      return crypto.subtle.exportKey('jwk', kp.publicKey).then(function (jwk) { TEST_LOGIN.jwk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }; });
    });
    var m;
    return keys.then(function () { return signJwt(TEST_LOGIN.key, { alg: 'ES256', kid: 'test-kid', typ: 'JWT' }, loginClaims()); })
      .then(function (tok) { TEST_LOGIN.token = tok; return import('/api/_login.js'); })
      .then(function (mod) {
        m = mod; m.resetLoginCache();
        var realFetch = window.fetch;
        window.fetch = loginFetch(realFetch);
        return m.checkLogin(new Request(location.origin + '/api/x', { headers: { authorization: 'Bearer ' + TEST_LOGIN.token } }))
          .then(function (okd) { window.fetch = realFetch; if (!okd) throw new Error('test login setup failed'); }, function (e) { window.fetch = realFetch; throw e; });
      });
  }
  // طلب لـ /api بهيدر الدخول (لو مش موجود)
  function withLogin(req) {
    var h = new Headers(req.headers);
    if (!h.has('authorization') && TEST_LOGIN.token && new URL(req.url).pathname.indexOf('/api/') === 0) h.set('authorization', 'Bearer ' + TEST_LOGIN.token);
    return new Request(req, { headers: h });
  }

  // ---------- دخول الأداة (قرار ٦ أكتوبر ٢٠٢٦): كلمة المرور + رمز على البريد ----------
  describe('دخول الأداة', function () {
    function loadWorker() { return import('/cloudflare/worker.js'); }
    function env() { return { ASSETS: { fetch: function (req) { return fetch(new URL(req.url).pathname); } } }; }
    function api(w, token) {
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers.authorization = 'Bearer ' + token;
      return w.default.fetch(new Request(location.origin + '/api/google-ads-fetch', { method: 'POST', headers: headers, body: '{}' }), env())
        .then(function (r) { return r.json().then(function (j) { return { status: r.status, code: j.code }; }); });
    }
    function tokenWith(claims) { return signJwt(TEST_LOGIN.key, { alg: 'ES256', kid: 'test-kid', typ: 'JWT' }, loginClaims(claims)); }

    testAsync('/api: من غير دخول مكتمل = ٤٠١ LOGIN، وبالدخول الطلب بيوصل للدالة', function () {
      var w, realFetch = window.fetch;
      var restore = function () { window.fetch = realFetch; };
      return setupLogin().then(loadWorker).then(function (m) { w = m; return api(w, null); }).then(function (r) {
        eq([r.status, r.code], [401, 'LOGIN'], 'no token');
        return api(w, TEST_LOGIN.token);
      }).then(function (r) {
        eq(r.status, 400, 'logged in: the handler itself answers (bad request)');
        return api(w, 'not.a.token');
      }).then(function (r) {
        eq(r.status, 401, 'garbage');
        return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
          .then(function (kp) { return signJwt(kp.privateKey, { alg: 'ES256', kid: 'test-kid' }, loginClaims({ session_id: 's-forged' })); });
      }).then(function (forged) {
        window.fetch = loginFetch(realFetch);
        return api(w, forged);
      }).then(function (r) {
        eq(r.status, 401, 'signed with another key');
        return tokenWith({ session_id: 's-old', exp: Math.floor(Date.now() / 1000) - 10 }).then(function (t) { return api(w, t); });
      }).then(function (r) {
        eq(r.status, 401, 'expired');
        return tokenWith({ session_id: 's-iss', iss: 'https://evil.example/auth/v1' }).then(function (t) { return api(w, t); });
      }).then(function (r) {
        eq(r.status, 401, 'another issuer');
        // كلمة المرور بس ولسه مأكّدش الرمز (أو الجلسة اتقفلت): session_ok = لأ
        window.fetch = loginFetch(realFetch, function (b) { return b.p_session !== 's-pending'; });
        return tokenWith({ session_id: 's-pending' }).then(function (t) { return api(w, t); });
      }).then(function (r) {
        restore();
        eq(r.status, 401, 'code not confirmed');
      }, function (e) { restore(); throw e; });
    });

    // التدقيق الشامل ١١ نوفمبر ٢٠٢٦ (ن٤): مفتاح دخول برقم مفتاح توقيع مش معروف كان بيخلّي كل طلب يجيب قائمة المفاتيح من Supabase من جديد
    testAsync('مفتاح دخول برقم مفتاح توقيع مش معروف: قائمة المفاتيح بتتجاب تاني مرة واحدة بس، مش مع كل طلب', function () {
      var realFetch = window.fetch, jwksCalls = 0, mod;
      var restore = function () { window.fetch = realFetch; };
      return setupLogin().then(function () { return import('/api/_login.js'); }).then(function (m) {
        mod = m;
        var inner = loginFetch(realFetch);
        window.fetch = function (url) { if (String(url).indexOf('/.well-known/jwks.json') > -1) jwksCalls++; return inner.apply(window, arguments); };
        return signJwt(TEST_LOGIN.key, { alg: 'ES256', kid: 'rotated-1', typ: 'JWT' }, loginClaims());
      }).then(function (t1) {
        return mod.verifyJwt(t1);
      }).then(function (p) {
        eq([p, jwksCalls], [null, 1], 'unknown key id: refused after one refresh');
        return signJwt(TEST_LOGIN.key, { alg: 'ES256', kid: 'rotated-2', typ: 'JWT' }, loginClaims());
      }).then(function (t2) {
        return mod.verifyJwt(t2);
      }).then(function (p) {
        eq([p, jwksCalls], [null, 1], 'a second unknown key id within a minute: no new download');
        return mod.verifyJwt(TEST_LOGIN.token);
      }).then(function (p) {
        ok(p && p.sub === 'u-test', 'the real key still works');
      }).then(restore, function (e) { restore(); throw e; });
    });

    // التدقيق الشامل ١١ نوفمبر ٢٠٢٦ (OWASP ASVS 3.3.3): تغيير كلمة المرور كان بيقفل الجلسة المؤقتة بس، فأي جلسة مفتوحة بالكلمة القديمة
    // (حد تاني عرفها) كانت بتفضل مأكَّدة لحد ٣٠ يوم
    testAsync('تغيير كلمة المرور بيقفل كل جلسات الحساب، ولو ماتغيّرتش بيقفل الجلسة المؤقتة بس', function () {
      var realFetch = window.fetch, calls = [], putOk = true;
      var restore = function () { window.fetch = realFetch; };
      window.fetch = function (url, opts) {
        var u = String(url);
        calls.push((opts && opts.method) + ' ' + u.replace(/^https:\/\/[^/]+\/auth\/v1/, ''));
        var reply = function (status, body) { return Promise.resolve(new Response(JSON.stringify(body), { status: status, headers: { 'Content-Type': 'application/json' } })); };
        if (u.indexOf('/verify') > -1) return reply(200, { access_token: 'temp-token', user: { email: 'a@b.co' } });
        if (u.indexOf('/user') > -1) return putOk ? reply(200, { id: 'u1' }) : reply(422, { msg: 'Password should be at least 8 characters' });
        return reply(200, {});
      };
      return AuthLogin.resetPassword('hash-1', 'a-good-new-password').then(function (r) {
        eq([r.ok, r.email], [true, 'a@b.co']);
        eq(calls, ['POST /verify', 'PUT /user', 'POST /logout?scope=global'], 'every session of the account is closed');
        calls = []; putOk = false;
        return AuthLogin.resetPassword('hash-2', 'short');
      }).then(function (r) {
        eq([r.ok, r.error], [false, 'weak']);
        eq(calls[2], 'POST /logout?scope=local', 'password not changed: only the temporary session');
      }).then(restore, function (e) { restore(); throw e; });
    });

    // التدقيق الشامل ١١ نوفمبر ٢٠٢٦: صاحب الدخول اتغيّر من غير «خروج» (جلسة انتهت، أو «الدخول بحساب آخر») — اللي يدخل بعده في نفس التاب
    // كان بيفتح الأداة على ربط المنصات وجلسة التاب بتاعة اللي قبله (حساباته الإعلانية)
    test('بيانات الجهاز لصاحب الدخول بس: مستخدم تاني يدخل = ربط المنصات وجلسة التاب بتوع اللي قبله بيتمسحوا، ونفس المستخدم = زي ما هي', function () {
      var LS = ['ac.owner', 'acc.renew.v1', 'acc.lastAccount.v1', 'acc.digestHint'], keepL = {}, keepS = {};
      LS.forEach(function (k) { keepL[k] = localStorage.getItem(k); });
      for (var i = 0; i < sessionStorage.length; i++) { var sk = sessionStorage.key(i); keepS[sk] = sessionStorage.getItem(sk); }
      var restore = function () {
        LS.forEach(function (k) { if (keepL[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, keepL[k]); });
        sessionStorage.clear();
        Object.keys(keepS).forEach(function (k) { sessionStorage.setItem(k, keepS[k]); });
      };
      try {
        localStorage.removeItem('ac.owner'); sessionStorage.removeItem('ac.owner');
        localStorage.setItem('acc.renew.v1', '{"google":"sealed-a"}');
        localStorage.setItem('acc.lastAccount.v1', '{"meta":"act_1"}');
        sessionStorage.setItem('pauseproof.session.v1', '{"tokens":{"meta":{"token":"long-lived-a"}}}');
        // جهاز من قبل التحديث (ملوش صاحب مسجّل): بيتسجّل من غير مسح
        AuthLogin.bindDevice('A@Store.com');
        eq([localStorage.getItem('ac.owner'), sessionStorage.getItem('ac.owner')], ['a@store.com', 'a@store.com']);
        ok(localStorage.getItem('acc.renew.v1') && sessionStorage.getItem('pauseproof.session.v1'), 'nothing wiped the first time');
        // نفس المستخدم دخل تاني: كله زي ما هو
        AuthLogin.bindDevice('a@store.com');
        ok(localStorage.getItem('acc.renew.v1') && localStorage.getItem('acc.lastAccount.v1') && sessionStorage.getItem('pauseproof.session.v1'), 'the same user keeps everything');
        // مستخدم تاني: ربط المنصات وآخر حساب وجلسة التاب بتوع الأول اتمسحوا
        AuthLogin.bindDevice('b@store.com');
        eq([localStorage.getItem('acc.renew.v1'), localStorage.getItem('acc.lastAccount.v1'), sessionStorage.getItem('pauseproof.session.v1')], [null, null, null], 'the previous user data is gone');
        eq([localStorage.getItem('ac.owner'), sessionStorage.getItem('ac.owner')], ['b@store.com', 'b@store.com']);
        // تاب قديم لسه فيه جلسة الأول، والجهاز بقى للتاني (الدخول اتغيّر في تاب تاني): جلسة التاب بتتمسح
        sessionStorage.setItem('ac.owner', 'a@store.com');
        sessionStorage.setItem('pauseproof.session.v1', '{"tokens":{"meta":{"token":"long-lived-a"}}}');
        localStorage.setItem('acc.renew.v1', '{"google":"sealed-b"}');
        AuthLogin.bindDevice('b@store.com');
        eq([sessionStorage.getItem('pauseproof.session.v1'), localStorage.getItem('acc.renew.v1')], [null, '{"google":"sealed-b"}'], 'the stale tab is cleared, the device data of the current user stays');
      } finally { restore(); }
    });

    test('الرجوع بعد الدخول للأداة بس (مش أي رابط برّه الموقع)', function () {
      eq(['/app', '/app?code=1&state=snapchat', 'https://evil.example/app', '//evil.example', '/appx', null].map(AuthLogin.safeNext),
        ['/app', '/app?code=1&state=snapchat', '/app', '/app', '/app', '/app']);
    });

    // مراجعة ١ نوفمبر ٢٠٢٦ (ق٧ — NIST SP 800-63B): كلمة المرور بتتقارن بقائمة المسرَّب.
    // بصمة SHA-1 لـ "password" هي 5BAA6:1E4C9B93F3F0682250B6CF8331B7EE68FD8 — أول ٥ حروف بس هي اللي بتتبعت
    testAsync('كلمة المرور المسرَّبة بتترفض، والمصدر لو مش متاح الدخول مبيتقفلش', function () {
      var realFetch = window.fetch, asked = [];
      var restore = function () { window.fetch = realFetch; };
      window.fetch = function (url) {
        asked.push(String(url));
        return Promise.resolve({ ok: true, text: function () {
          return Promise.resolve('1E4C9B93F3F0682250B6CF8331B7EE68FD8:9659365\r\n0000000000000000000000000000000000A:0');
        } });
      };
      return AuthLogin.pwnedCount('password').then(function (n) {
        eq(n, 9659365, 'ظهرت في التسريبات');
        eq(asked[0], 'https://api.pwnedpasswords.com/range/5BAA6', 'أول ٥ حروف من البصمة بس');
        ok(asked[0].indexOf('1E4C9B93') === -1, 'باقي البصمة مبيطلعش من الجهاز');
        window.fetch = function () { return Promise.resolve({ ok: true, text: function () { return Promise.resolve('AAAA:1'); } }); };
        return AuthLogin.pwnedCount('a-password-nobody-leaked-9f3b');
      }).then(function (n) {
        eq(n, 0, 'مش في التسريبات');
        window.fetch = function () { return Promise.reject(new Error('offline')); };
        return AuthLogin.pwnedCount('anything');
      }).then(function (n) {
        eq(n, null, 'المصدر مش متاح = منقفلش الدخول');
        restore();
      }, function (e) { restore(); throw e; });
    });

    testAsync('الجلسة على الجهاز: الهيدر، والتجديد قبل ما تخلص، ولو اتلغت بتتشال', function () {
      var key = 'ac.login', prev = localStorage.getItem(key), realFetch = window.fetch, calls = [];
      var restore = function () { window.fetch = realFetch; if (prev == null) localStorage.removeItem(key); else localStorage.setItem(key, prev); };
      localStorage.setItem(key, JSON.stringify({ access_token: 'a1', refresh_token: 'r1', expires_at: Date.now() + 3600000, email: 'x@example.com' }));
      return AuthLogin.headers().then(function (h) {
        eq(h, { Authorization: 'Bearer a1' });
        localStorage.setItem(key, JSON.stringify({ access_token: 'a1', refresh_token: 'r1', expires_at: Date.now() + 10000, email: 'x@example.com' }));
        window.fetch = function (url) {
          calls.push(String(url));
          return Promise.resolve(new Response(JSON.stringify({ access_token: 'a2', refresh_token: 'r2', expires_in: 3600, user: { email: 'x@example.com' } }), { status: 200 }));
        };
        return AuthLogin.headers();
      }).then(function (h) {
        eq(h, { Authorization: 'Bearer a2' }, 'refreshed a minute before it ends');
        ok(/grant_type=refresh_token/.test(calls[0]), calls[0]);
        eq(JSON.parse(localStorage.getItem(key)).refresh_token, 'r2');
        localStorage.setItem(key, JSON.stringify({ access_token: 'a2', refresh_token: 'r2', expires_at: Date.now() - 1000 }));
        window.fetch = function () { return Promise.resolve(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })); };
        return AuthLogin.headers();
      }).then(function (h) {
        eq([h, localStorage.getItem(key)], [{}, null], 'signed out elsewhere');
        restore();
      }, function (e) { restore(); throw e; });
    });

    testAsync('ردّ «الدخول مش مكتمل» = صفحة الدخول، مش «ربط المنصة خلص»', function () {
      var realFetch = window.fetch, realTo = AuthLogin.toLogin, went = 0;
      var restore = function () { window.fetch = realFetch; AuthLogin.toLogin = realTo; };
      AuthLogin.toLogin = function () { went++; };
      window.fetch = function () { return Promise.resolve(new Response(JSON.stringify({ error: 'x', code: 'LOGIN' }), { status: 401 })); };
      return apiPost('/api/google-ads-fetch', {}).then(function (res) {
        restore();
        eq([res.status, went, isAuthFailure(res)], [401, 1, false]);
        ok(isAuthFailure({ status: 401, data: { code: 'AUTH' } }) && isAuthFailure({ status: 401, data: {} }), 'platform sign-in expiry still counts');
      }, function (e) { restore(); throw e; });
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
    function call(w, path, init, env) { return w.default.fetch(withLogin(new Request(location.origin + path, init || {})), env || fakeEnv()); }

    testAsync('تجهيز دخول الاختبارات (مفتاح توقيع وهمي)', setupLogin);
    // الـ Worker بيحط الأسرار في process.env — بنرجّع الصفحة لحالتها بعد الاختبار
    var hadProcess = typeof globalThis.process !== 'undefined';
    function cleanProcess() { if (!hadProcess) delete globalThis.process; else ['SNAPCHAT_CLIENT_ID', 'SNAPCHAT_CLIENT_SECRET'].forEach(function (k) { delete globalThis.process.env[k]; }); }

    // الروابط الرسمية مسجّلة في Meta وGoogle وSnapchat (رابط الرجوع = /app) — أي تغيير فيها لازم يتسجّل هناك كمان
    testAsync('الروابط الرسمية ورؤوس الأمان ثابتة، وكل صفحة ليها ملف موجود', function () {
      return loadWorker().then(function (w) {
        eq(w.REWRITES, {
          '/': '/home.html', '/index.html': '/home.html', '/app': '/pauseproof-live.html', '/login': '/login.html',
          '/help': '/help.html', '/privacy': '/privacy.html', '/terms': '/terms.html', '/data-deletion': '/data-deletion.html',
          '/stop': '/stop.html', '/join': '/join.html', '/invited': '/invited.html', '/favicon.ico': '/favicon.svg'
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
          // ملف الأداة بعنوانه المباشر كان بيتخطّى حارس الدخول (js/auth.js بيحرس /app بس) → /app
          return Promise.all(['/pauseproof-live.html?x=1', '/PauseProof-Live.html', '/pauseproof-live.html/'].map(function (p) { return call(w, p); }));
        }).then(function (list) {
          eq(list.map(function (r) { return r.status + ' ' + r.headers.get('Location'); }), ['308 /app?x=1', '308 /app', '308 /app'], 'the tool file redirects to /app');
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
          // من غير تشفير (http) بيتحوّل لـ https بنفس المسار — الصفحات والـ API
          return Promise.all(['http://adscenter.online/app?x=1', 'http://adscenter.online/', 'http://www.adscenter.online/join', 'http://adscenter.online/api/google-token']
            .map(function (u) { return w.default.fetch(new Request(u), fakeEnv()); }));
        }).then(function (list) {
          eq(list.map(function (r) { return r.status + ' ' + r.headers.get('Location'); }), [
            '301 https://adscenter.online/app?x=1', '301 https://adscenter.online/', '301 https://adscenter.online/join', '301 https://adscenter.online/api/google-token'
          ], 'http → https');
          ok(list[0].headers.get('Strict-Transport-Security'), 'HSTS on the redirect too');
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

  // ---------- الربط المحفوظ على الجهاز: رمز التجديد المختوم (api/_seal.js) ----------
  describe('الربط المحفوظ على الجهاز (Google وSnapchat)', function () {
    function worker() { return import('/cloudflare/worker.js'); }
    function post(w, path, body, env) {
      return w.default.fetch(withLogin(new Request(location.origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })),
        Object.assign({ ASSETS: { fetch: function (req) { return fetch(new URL(req.url).pathname); } } }, env || {}));
    }
    function cleanEnv() {
      if (globalThis.process && globalThis.process.env) ['SNAPCHAT_CLIENT_ID', 'SNAPCHAT_CLIENT_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'].forEach(function (k) { delete globalThis.process.env[k]; });
    }
    // المنصة نفسها (Snapchat/Google) وهمية: بنسجّل كل طلب راح لها ونرد بالرد اللي الاختبار عايزه
    function withPlatform(reply, fn) {
      var realFetch = window.fetch, sent = [];
      window.fetch = function (url, opts) {
        var u = String(url);
        if (u.indexOf('accounts.snapchat.com') > -1 || u.indexOf('oauth2.googleapis.com') > -1) {
          var params = {};
          new URLSearchParams((opts && opts.body) || '').forEach(function (v, k) { params[k] = v; });
          sent.push({ url: u, params: params });
          var r = reply(u, params);
          return Promise.resolve(new Response(JSON.stringify(r.body), { status: r.status || 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return realFetch.apply(this, arguments);
      };
      var restore = function () { window.fetch = realFetch; cleanEnv(); };
      return Promise.resolve().then(function () { return fn(sent); }).then(function (v) { restore(); return v; }, function (e) { restore(); throw e; });
    }
    var json = function (res) { return res.json().then(function (d) { return { status: res.status, data: d }; }); };

    testAsync('القفل: النسخة بتتفتح بنفس السر والمنصة وصاحب الدخول بس، وأي تعديل أو ٦٠ يوم من غير استخدام = مرفوضة', function () {
      return import('/api/_seal.js').then(function (s) {
        var now = Date.parse('2026-10-03T00:00:00Z');
        return s.sealToken('snapchat', 'secret-1', 'refresh-abc', now, 'user-a').then(function (sealed) {
          ok(/^v2\./.test(sealed) && sealed.indexOf('refresh-abc') < 0, 'v2, no plain token inside');
          var i = sealed.length - 12, bad = sealed.slice(0, i) + (sealed.charAt(i) === 'A' ? 'B' : 'A') + sealed.slice(i + 1);
          return Promise.all([
            s.unsealToken('snapchat', 'secret-1', sealed, now + 86400000, 'user-a'),
            s.unsealToken('google', 'secret-1', sealed, now, 'user-a'),
            s.unsealToken('snapchat', 'secret-2', sealed, now, 'user-a'),
            s.unsealToken('snapchat', 'secret-1', bad, now, 'user-a'),
            s.unsealToken('snapchat', 'secret-1', sealed, now + 61 * 86400000, 'user-a'),
            s.unsealToken('snapchat', 'secret-1', 'not-a-sealed-token', now, 'user-a'),
            // المرحلة ٣، أ١: نسخة صاحب دخول تاني، أو من غير صاحب دخول خالص
            s.unsealToken('snapchat', 'secret-1', sealed, now, 'user-b'),
            s.unsealToken('snapchat', 'secret-1', sealed, now),
            // نسخة مزوّرة بتقول v1 لنفس المحتوى (تخطّي الربط بصاحب الدخول)
            s.unsealToken('snapchat', 'secret-1', 'v1' + sealed.slice(2), now, 'user-b')
          ]);
        }).then(function (r) {
          eq(r, ['refresh-abc', null, null, null, null, null, null, null, null], 'same secret, platform and sign-in user within 60 days only');
          return s.sealToken('snapchat', 'secret-1', 'x', now).then(function () { return 'sealed'; }, function () { return 'refused'; });
        }).then(function (r) {
          eq(r, 'refused', 'no new copy without a sign-in user');
        });
      });
    });
    // النسخ القديمة (v1، قبل ١٧ أكتوبر ٢٠٢٦ — المنصة بس جوه التشفير) اتوقف قبولها في ١ نوفمبر ٢٠٢٦ (ح١):
    // مفيش نسخة بتتفتح دلوقتي من غير ما صاحب الدخول يكون جوه التشفير
    testAsync('النسخ القديمة v1 (من غير صاحب دخول) مبقتش تتفتح خالص', function () {
      var enc = new TextEncoder(), now = Date.parse('2026-10-17T00:00:00Z');
      var b64u = function (bytes) { var s = ''; new Uint8Array(bytes).forEach(function (b) { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
      var iv = crypto.getRandomValues(new Uint8Array(12));
      return crypto.subtle.digest('SHA-256', enc.encode('ads-center/seal/snapchat/v1:secret-1')).then(function (raw) {
        return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
      }).then(function (key) {
        return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: enc.encode('snapchat') }, key, enc.encode(JSON.stringify({ rt: 'refresh-old', at: now })));
      }).then(function (ct) {
        var v1 = 'v1.' + b64u(iv) + '.' + b64u(ct);
        return import('/api/_seal.js').then(function (s) {
          return Promise.all([
            s.unsealToken('snapchat', 'secret-1', v1, now + 86400000, 'user-a'),
            s.unsealToken('google', 'secret-1', v1, now, 'user-a'),
            s.unsealToken('snapchat', 'secret-1', v1, now + 61 * 86400000, 'user-a'),
            s.unsealToken('snapchat', 'secret-1', 'v2' + v1.slice(2), now, 'user-a')
          ]);
        });
      }).then(function (r) {
        eq(r, [null, null, null, null]);
      });
    });

    testAsync('Snapchat: أول دخول بيرجّع نسخة مقفولة بس (مش مفتاح التجديد)، والتجديد بيشتغل بيها لحد ما Snapchat ترفضه', function () {
      var w, env = { SNAPCHAT_CLIENT_ID: 'id', SNAPCHAT_CLIENT_SECRET: 'secret' }, first;
      return withPlatform(function (u, p) {
        if (p.grant_type === 'authorization_code') return { body: { access_token: 'acc-1', expires_in: 1800, refresh_token: 'ref-1' } };
        if (p.refresh_token === 'ref-1') return { body: { access_token: 'acc-2', expires_in: 1800, refresh_token: 'ref-2' } };
        return { status: 400, body: { error: 'invalid_grant' } };
      }, function (sent) {
        return worker().then(function (m) {
          w = m;
          return post(w, '/api/snapchat-token', { code: 'c', redirectUri: location.origin + '/app' }, env).then(json);
        }).then(function (r) {
          eq(r.data.access_token, 'acc-1');
          ok(r.data.sealed && JSON.stringify(r.data).indexOf('ref-1') < 0, 'only the sealed copy reaches the browser');
          first = r.data.sealed;
          return post(w, '/api/snapchat-token', { sealed: first }, env).then(json);
        }).then(function (r) {
          eq([r.status, r.data.access_token], [200, 'acc-2'], 'renewed without logging in');
          eq([sent[1].params.grant_type, sent[1].params.refresh_token, sent[1].params.client_secret], ['refresh_token', 'ref-1', 'secret']);
          ok(r.data.sealed && r.data.sealed !== first, 'a fresh sealed copy (Snapchat rotated the refresh token)');
          ok(/^v2\./.test(first) && /^v2\./.test(r.data.sealed), 'copies are bound to the sign-in user (v2)');
          // المرحلة ٣، أ١: مستخدم تاني داخل للأداة ومعاه النسخة دي (من جهاز أو نسخ احتياطي) — متتفتحش له، ومفيش طلب لـ Snapchat
          var copy = r.data.sealed, before = sent.length, platformFetch = window.fetch;
          // مفاتيح Supabase العامة وسؤال session_ok للمستخدم التاني من غير شبكة (loginFetch)، والباقي لـ Snapchat الوهمية
          window.fetch = loginFetch(platformFetch);
          return signJwt(TEST_LOGIN.key, { alg: 'ES256', kid: 'test-kid', typ: 'JWT' }, loginClaims({ sub: 'u-other', session_id: 's-other' })).then(function (other) {
            return w.default.fetch(new Request(location.origin + '/api/snapchat-token', { method: 'POST',
              headers: { 'Content-Type': 'application/json', authorization: 'Bearer ' + other }, body: JSON.stringify({ sealed: copy }) }),
            Object.assign({ ASSETS: { fetch: function (req) { return fetch(new URL(req.url).pathname); } } }, env));
          }).then(json).then(function (o) {
            window.fetch = platformFetch;
            eq([o.status, o.data.code, sent.length - before], [401, 'AUTH', 0], 'another sign-in user cannot renew this copy');
            return { status: 200, data: { sealed: copy } };
          }, function (e) { window.fetch = platformFetch; throw e; });
        }).then(function (r) {
          return post(w, '/api/snapchat-token', { sealed: r.data.sealed }, env).then(json);
        }).then(function (r) {
          eq([r.status, r.data.code], [401, 'AUTH'], 'Snapchat rejected the refresh token = log in again');
          return post(w, '/api/snapchat-token', { sealed: 'v1.forged' }, env).then(json);
        }).then(function (r) {
          eq([r.status, r.data.code], [401, 'AUTH'], 'a forged copy');
        });
      });
    });

    // الملخص التلقائي لكل المنصات (٣١ أكتوبر ٢٠٢٦): المُشغّل معاه نسخة المستخدم المقفولة ومبيقدرش يفتحها — بيبعتها للـ Worker بمفتاحه
    testAsync('المُشغّل: /api/digest-fetch بمفتاح المُشغّل بس، والنسخة بتتفتح لصاحبها بس، ومفتاح الجلسة ومفتاح التجديد مبيطلعوش', function () {
      var w, env = { SNAPCHAT_CLIENT_ID: 'id', SNAPCHAT_CLIENT_SECRET: 'secret' }, KEY = new Array(65).join('k');
      var A = '11111111-2222-3333-4444-555555555555', B = '99999999-8888-7777-6666-555555555555';
      var keyChecks = 0, auth = [], sealedA;
      var call = { action: 'daily', adAccountId: 'acc-1', adIds: ['ad-1'], since: '2026-10-20', until: '2026-10-26' };
      return withPlatform(function (u, p) {
        if (p.refresh_token === 'ref-1') return { body: { access_token: 'acc-9', expires_in: 3600 } };
        return { status: 400, body: { error: 'invalid_grant' } };
      }, function (sent) {
        var platformFetch = window.fetch;
        var reply = function (obj) { return Promise.resolve(new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json' } })); };
        window.fetch = function (url, opts) {
          var u = String(url);
          if (u.indexOf('/rest/v1/rpc/runner_key_check') > -1) { keyChecks++; return reply(JSON.parse(opts.body).p_key === KEY); }
          if (u.indexOf('adsapi.snapchat.com') > -1) {
            auth.push(opts && opts.headers && opts.headers.Authorization);
            return reply(/\/stats\?/.test(u) ? { request_status: 'SUCCESS', timeseries_stats: [] } : { adaccounts: [{ adaccount: { id: 'acc-1', timezone: 'Asia/Riyadh' } }] });
          }
          return platformFetch.apply(this, arguments);
        };
        var runner = function (body, key, method) {
          var h = { 'Content-Type': 'application/json' };
          if (key) h['x-runner-key'] = key;
          return w.default.fetch(new Request(location.origin + '/api/digest-fetch', { method: method || 'POST', headers: h, body: method === 'GET' ? undefined : JSON.stringify(body) }),
            Object.assign({ ASSETS: { fetch: function (req) { return fetch(new URL(req.url).pathname); } } }, env)).then(json);
        };
        return import('/api/_seal.js').then(function (s) {
          return s.sealToken('snapchat', 'secret', 'ref-1', undefined, A);
        }).then(function (sl) {
          sealedA = sl;
          return worker();
        }).then(function (m) {
          w = m;
          eq(Object.keys(w.RUNNER_HANDLERS), ['digest-fetch']);
          ok(!('digest-fetch' in w.HANDLERS), 'not reachable with a tool sign-in either');
          return runner({ platform: 'snapchat', user: A, sealed: sealedA, call: call }, null);
        }).then(function (r) {
          eq([r.status, r.data.code, keyChecks, sent.length], [403, 'RUNNER', 0, 0], 'no runner key: refused before anything');
          return runner({ platform: 'snapchat', user: A, sealed: sealedA, call: call }, new Array(65).join('x'));
        }).then(function (r) {
          eq([r.status, keyChecks, sent.length], [403, 1, 0], 'a wrong key: the database says no');
          return runner({}, KEY, 'GET');
        }).then(function (r) {
          eq(r.status, 405, 'POST only');
          return runner({ platform: 'snapchat', user: B, sealed: sealedA, call: call }, KEY);
        }).then(function (r) {
          eq([r.status, r.data.code, sent.length], [401, 'AUTH', 0], 'another user\'s copy does not open');
          return runner({ platform: 'snapchat', user: A, sealed: sealedA, call: { action: 'accounts' } }, KEY);
        }).then(function (r) {
          eq(r.status, 400, 'only the requests the runner needs');
          return runner({ platform: 'snapchat', user: A, sealed: sealedA, call: call }, KEY);
        }).then(function (r) {
          eq([r.status, r.data.status], [200, 200]);
          eq(r.data.data, { spend: {} }, 'the same reply as the tool\'s own request');
          eq([sent.length, sent[0].params.grant_type, sent[0].params.refresh_token], [1, 'refresh_token', 'ref-1']);
          ok(auth.length === 2 && auth.every(function (a) { return a === 'Bearer acc-9'; }), 'the fresh session is used for Snapchat');
          ok(JSON.stringify(r.data).indexOf('acc-9') < 0 && JSON.stringify(r.data).indexOf('ref-1') < 0, 'neither the session nor the refresh token leaves the worker');
          ok(/^v2\./.test(r.data.sealed) && r.data.sealed !== sealedA, 'a fresh copy for the server');
          eq(keyChecks, 2, 'the right key is remembered for a few minutes');
          return import('/api/_seal.js').then(function (s) { return s.sealToken('snapchat', 'secret', 'ref-revoked', undefined, A); });
        }).then(function (revoked) {
          return runner({ platform: 'snapchat', user: A, sealed: revoked, call: call }, KEY);
        }).then(function (r) {
          eq([r.status, r.data.code], [401, 'AUTH'], 'Snapchat rejected the refresh token = connect again');
        }).then(function () { window.fetch = platformFetch; }, function (e) { window.fetch = platformFetch; throw e; });
      });
    });

    testAsync('Google: الطريقة الجديدة بتشتغل بس لما السر موجود، ودخول من غير صلاحية Google Ads مرفوض، و«فصل» بيلغي الصلاحية عند Google', function () {
      var w, env = { GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret' }, sealed;
      var ADS = 'https://www.googleapis.com/auth/adwords';
      return withPlatform(function (u, p) {
        if (u.indexOf('/revoke') > -1) return { body: {} };
        if (p.code === 'good') return { body: { access_token: 'g-1', expires_in: 3599, refresh_token: 'gr-1', scope: ADS } };
        if (p.code === 'noscope') return { body: { access_token: 'g-x', expires_in: 3599, refresh_token: 'gr-x', scope: 'openid' } };
        if (p.refresh_token === 'gr-1') return { body: { access_token: 'g-2', expires_in: 3599, scope: ADS } };
        return { status: 400, body: { error: 'invalid_grant' } };
      }, function (sent) {
        return worker().then(function (m) {
          w = m;
          return post(w, '/api/google-token', { probe: true }, { GOOGLE_CLIENT_ID: 'gid' }).then(json);
        }).then(function (r) {
          eq(r.data.codeFlow, false, 'no secret yet = keep the old popup');
          cleanEnv();
          return post(w, '/api/google-token', { probe: true }, env).then(json);
        }).then(function (r) {
          eq(r.data.codeFlow, true);
          return post(w, '/api/google-token', { code: 'good', redirectUri: 'https://evil.example/app' }, env).then(json);
        }).then(function (r) {
          eq(r.status, 400, 'the return link must be our own /app');
          return post(w, '/api/google-token', { code: 'good', redirectUri: location.origin + '/app' }, env).then(json);
        }).then(function (r) {
          eq(r.data.access_token, 'g-1');
          ok(r.data.sealed && JSON.stringify(r.data).indexOf('gr-1') < 0, 'sealed copy only');
          eq([sent[0].params.grant_type, sent[0].params.redirect_uri], ['authorization_code', location.origin + '/app']);
          sealed = r.data.sealed;
          return post(w, '/api/google-token', { code: 'noscope', redirectUri: location.origin + '/app' }, env).then(json);
        }).then(function (r) {
          eq([r.status, r.data.code, 'sealed' in r.data], [403, 'NO_SCOPE', false], 'Google Ads permission unticked');
          return post(w, '/api/google-token', { sealed: sealed }, env).then(json);
        }).then(function (r) {
          eq([r.status, r.data.access_token], [200, 'g-2'], 'renewed');
          return post(w, '/api/google-token', { sealed: sealed, revoke: true }, env).then(json);
        }).then(function (r) {
          eq(r.data, { ok: true });
          var rv = sent.filter(function (s) { return s.url.indexOf('/revoke') > -1; })[0];
          eq(rv && rv.params.token, 'gr-1', 'revoked at Google itself');
        });
      });
    });

    testAsync('المتصفح: التجديد بيحفظ الجلسة والنسخة الجديدة، والربط اللي مبقاش صالح بيتمسح، وعطل الشبكة مبيمسحوش', function () {
      var realFetch = window.fetch, before = localStorage.getItem(RENEW_KEY), replies = [];
      window.fetch = function () {
        var r = replies.shift();
        return r === 'net' ? Promise.reject(new TypeError('Failed to fetch')) : fakeFetch(r.body, r.status)();
      };
      var restore = function () { window.fetch = realFetch; if (before === null) localStorage.removeItem(RENEW_KEY); else localStorage.setItem(RENEW_KEY, before); };
      keepSealed('snapchat', 'v1.old');
      replies = [{ body: { access_token: 'tok-new', expires_in: 1800, sealed: 'v1.new' } }];
      return renewSession('snapchat').then(function (r1) {
        ok(r1 && snapchatAccessToken === 'tok-new' && validToken(sessionTokens.snapchat) === 'tok-new', 'new session');
        eq(sealedFor('snapchat'), 'v1.new', 'fresh sealed copy kept');
        replies = ['net'];
        return renewSession('snapchat');
      }).then(function (r2) {
        ok(!r2);
        eq(sealedFor('snapchat'), 'v1.new', 'kept after a network error');
        replies = [{ status: 401, body: { error: 'x', code: 'AUTH' } }];
        return renewSession('snapchat');
      }).then(function (r3) {
        ok(!r3);
        eq(sealedFor('snapchat'), null, 'removed once the server says it is no longer valid');
      }).then(restore, function (e) { restore(); throw e; });
    });

    testAsync('الجلسة خلصت والربط محفوظ: تجديد بهدوء وإكمال (مش «انتهت الجلسة»)، ومن غير لفّ لو التجديد مكفاش', function () {
      var realFetch = window.fetch, realRetry = window.retryPlatform, before = localStorage.getItem(RENEW_KEY), retried = [];
      window.fetch = fakeFetch({ access_token: 'g-new', expires_in: 3599, sealed: 'v1.g2' });
      window.retryPlatform = function (p) { retried.push(p); };
      var restore = function () {
        window.fetch = realFetch; window.retryPlatform = realRetry; renewedAt = {};
        if (before === null) localStorage.removeItem(RENEW_KEY); else localStorage.setItem(RENEW_KEY, before);
      };
      renewedAt = {};
      keepSealed('google', 'v1.g');
      markExpired('google');
      return tick().then(tick).then(tick).then(function () {
        eq(retried, ['google'], 'picked up where it left off');
        ok(!platformState.google, 'no «session expired» card');
        // تاني مرة في نفس الدقيقة (المنصة رفضت التوكن الجديد نفسه): الجلسة انتهت فعلاً — مفيش تجديد تاني
        markExpired('google');
        eq(platformState.google && platformState.google.kind, 'expired');
        eq(retried.length, 1);
      }).then(restore, function (e) { restore(); throw e; });
    });

    testAsync('«فصل» بيمسح الربط المحفوظ، وGoogle بيطلب إلغاء الصلاحية عند Google نفسها', function () {
      var realFetch = window.fetch, before = localStorage.getItem(RENEW_KEY), calls = [];
      window.fetch = function (url, opts) { calls.push({ url: String(url), body: opts && opts.body ? JSON.parse(opts.body) : null }); return fakeFetch({ ok: true })(); };
      var restore = function () { window.fetch = realFetch; if (before === null) localStorage.removeItem(RENEW_KEY); else localStorage.setItem(RENEW_KEY, before); };
      keepSealed('google', 'v1.g'); keepSealed('snapchat', 'v1.s');
      disconnectPlatform('google', true);
      disconnectPlatform('snapchat', true);
      return tick().then(function () {
        eq([sealedFor('google'), sealedFor('snapchat')], [null, null], 'nothing left on the device');
        var revoke = calls.filter(function (c) { return c.url.indexOf('/api/google-token') > -1; })[0];
        eq(revoke && revoke.body, { sealed: 'v1.g', revoke: true });
        eq(calls.filter(function (c) { return c.url.indexOf('/api/snapchat-token') > -1; }).length, 0);
      }).then(restore, function (e) { restore(); throw e; });
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
      return w.default.fetch(withLogin(new Request(location.origin + path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body)
      })), Object.assign(assets(), env || {}));
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

    // التدقيق الشامل ١١ نوفمبر ٢٠٢٦ (ن١٠): ترويسة دخول الأداة لازم تبقى مسموحة في رد OPTIONS، وإلا طلب أي نطاق مضاف في ALLOWED_ORIGINS
    // بيترفض في المتصفح قبل ما يتبعت
    testAsync('نطاق مضاف في ALLOWED_ORIGINS: رد OPTIONS بيسمح بترويسة الدخول Authorization', function () {
      var hadProcess = 'process' in window, prevProcess = window.process;
      window.process = { env: { ALLOWED_ORIGINS: 'https://partner.example' } };
      var restore = function () { if (hadProcess) window.process = prevProcess; else delete window.process; };
      return import('/api/_cors.js').then(function (c) {
        var set = {}, code = null;
        var res = { setHeader: function (k, v) { set[k] = v; }, status: function (s) { code = s; return this; }, json: function () { return this; }, end: function () { return this; } };
        var go = c.guardRequest({ method: 'OPTIONS', headers: { origin: 'https://partner.example', host: 'adscenter.online' } }, res);
        eq([go, code, set['Access-Control-Allow-Origin']], [false, 204, 'https://partner.example']);
        var allow = String(set['Access-Control-Allow-Headers']).split(',').map(function (x) { return x.trim(); });
        ok(allow.indexOf('Authorization') > -1 && allow.indexOf('Content-Type') > -1, set['Access-Control-Allow-Headers']);
      }).then(restore, function (e) { restore(); throw e; });
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
        eq([r.preset, r.isDefault, r.until], ['last7', false, shiftKey(todayKeyInTz('UTC'), -1)]);
        var ok2 = d.resolvePeriod({ preset: 'custom', since: '2026-02-01', until: '2026-02-28' }, 'UTC');
        eq([ok2.since, ok2.until], ['2026-02-01', '2026-02-28'], 'a real custom range still works');
      });
    });

    // التدقيق الشامل ١١ نوفمبر ٢٠٢٦ (ن١٢): الفرق كان بيتاخد عند ظهر UTC، وفي يوم تغيير التوقيت الصيفي بداية اليوم المحلي بفرق تاني —
    // Snapchat بيرفض أي وقت مش على بداية يوم بتوقيت الحساب، فالتحميل كان هيفشل في الأيام اللي يوم التغيير على حد نطاقها
    testAsync('بداية اليوم بتوقيت الحساب صح في كل يوم من السنة، حتى يوم تغيير التوقيت الصيفي (Snapchat start_time)', function () {
      return import('/api/_dates.js').then(function (d) {
        var keyAt = function (ms, tz) {
          var p = {};
          new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
          return p.year + '-' + p.month + '-' + p.day;
        };
        var zones = ['Asia/Riyadh', 'Africa/Cairo', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'Pacific/Auckland',
          'America/Santiago', 'Atlantic/Azores', 'Asia/Kolkata', 'Asia/Kathmandu', 'America/St_Johns', 'Pacific/Kiritimati', 'UTC'];
        var bad = [];
        zones.forEach(function (tz) {
          for (var k = '2026-01-01'; k <= '2026-12-31'; k = shiftKey(k, 1)) {
            var off = d.tzOffsetString(k, tz), ms = Date.parse(k + 'T00:00:00.000' + off);
            // اللحظة دي أول لحظة في اليوم المحلي: تاريخها هو اليوم، واللي قبلها بثانية في اليوم اللي قبله
            if (!/^[+-]\d{2}:\d{2}$/.test(off) || keyAt(ms, tz) !== k || keyAt(ms - 1000, tz) !== shiftKey(k, -1)) bad.push(tz + ' ' + k + ' ' + off);
          }
        });
        eq(bad, []);
        // أمثلة بالاسم: الرياض ثابت، وبرلين يوم التقديم ويوم التأخير، والقاهرة (التقديم عند منتصف الليل نفسه)
        eq(d.tzOffsetString('2026-06-15', 'Asia/Riyadh'), '+03:00');
        eq([d.tzOffsetString('2026-03-29', 'Europe/Berlin'), d.tzOffsetString('2026-03-30', 'Europe/Berlin')], ['+01:00', '+02:00']);
        eq([d.tzOffsetString('2026-10-25', 'Europe/Berlin'), d.tzOffsetString('2026-10-26', 'Europe/Berlin')], ['+02:00', '+01:00']);
        eq([d.tzOffsetString('2026-04-24', 'Africa/Cairo'), d.tzOffsetString('2026-04-25', 'Africa/Cairo')], ['+02:00', '+03:00']);
        // توقيت مش معروف = UTC زي الأول
        eq(d.tzOffsetString('2026-06-15', 'Not/AZone'), '+00:00');
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

    test('قارئ الشاشة: رسالة الحالة بتتقري، والقسم الحالي معلَّم في القائمة (aria-current)، والقائمة بتقول إنها بتتحمّل', function () {
      var status = document.getElementById('connectStatus');
      eq([status.getAttribute('role'), status.getAttribute('aria-live')], ['status', 'polite']);
      var nav = document.getElementById('appNav');
      eq([nav.tagName, nav.getAttribute('aria-label')], ['NAV', t('nav.aria')], 'a labelled navigation landmark');
      try {
        showView('alerts');
        var current = Array.prototype.map.call(nav.querySelectorAll('[aria-current="page"]'), function (n) { return n.id; });
        eq(current, ['tabAlerts'], 'only the open page is marked');
        // صفحات مش تبويبات: كل زرار بيتوصله بـ Tab عادي (من غير tabindex=-1)
        ok(Array.prototype.every.call(nav.querySelectorAll('.nav-item'), function (n) { return n.tabIndex === 0 && !n.getAttribute('role'); }), 'plain buttons reachable with Tab');
      } finally { showView('summary'); }
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
      var calls = captureSaves();
      var inp = function (k) { return settingsForm.querySelector('[name="' + k + '"]'); };
      try {
        activeSources.google = '1';
        ['٢٫٥', '2,5', ' 2.5 ', '۲٫۵'].forEach(function (typed) {
          settingsSaving = false;
          renderSettingsForm();
          inp('roasTarget').value = typed;
          document.getElementById('settingsSave').click();
          eq(calls.last().roasTarget, 2.5, 'typed "' + typed + '"');
        });
        var before = calls.length;
        settingsSaving = false;
        renderSettingsForm();
        inp('roasTarget').value = 'abc';
        document.getElementById('settingsSave').click();
        eq(calls.length, before, 'not saved');
        ok(settingsForm.querySelector('.setting-row.invalid [name="roasTarget"]'), 'marked as an error');
      } finally { calls.restore(); }
    });

    // المراجعة التانية للمرحلة ٤ (ر٧٩): «1,000» في «أقل عدد نتائج» (حدّه ١٠٬٠٠٠) كان بيتحفظ ١ في صمت — الفاصلة كانت عشرية في كل الخانات
    // من مراجعة الإعدادات الخانة الصحيحة الوحيدة «فترة التعلّم» (أيام، حدّها ٣٠) — «أقل عدد نتائج» و«يُعدّ قديماً» اتشالوا
    test('الإعدادات: «1,000» في خانة أيام = ألف مش ١ (برّه الحد = خطأ ظاهر)، و«١٢» = ١٢ (ر٧٩)', function () {
      var calls = captureSaves();
      var inp = function (k) { return settingsForm.querySelector('[name="' + k + '"]'); };
      var save = function (k, typed) { settingsSaving = false; renderSettingsForm(); inp(k).value = typed; document.getElementById('settingsSave').click(); };
      try {
        activeSources.google = '1';
        [['12', 12], ['١٢', 12], ['7 ', 7]].forEach(function (x) {
          save('learningDays', x[0]);
          eq(calls.last().learningDays, x[1], 'typed "' + x[0] + '"');
        });
        var before = calls.length;
        save('learningDays', '1,000');
        eq(calls.length, before, 'not saved as 1 day');
        ok(settingsForm.querySelector('.setting-row.invalid [name="learningDays"]'), 'out of range (30) is shown as an error');
        settingsSaving = false; renderSettingsForm(); inp('roasTarget').value = '2,5'; document.getElementById('settingsSave').click();
        eq(calls.last().roasTarget, 2.5, 'a multiplier keeps the decimal comma');
      } finally { calls.restore(); }
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
    // رد Meta نفسها (١٨ أكتوبر ٢٠٢٦): «(#3018) The start date of the time range cannot be beyond 37 months from the current date» —
    // وملخص المتجر بيجيب فترات قبل الفترة بنفس الطول (DX.windows). فترة قديمة كانت بتفشل كلها من غير سبب مكتوب
    test('فترة مخصصة أقدم من حد Meta (٣٧ شهراً مع فترات المقارنة): البداية بتتقدّم والرسالة بتقول ليه — ومن غير Meta زي ما هي', function () {
      var today = todayKeyInTz(BROWSER_TZ), savedMeta = activeSources.meta;
      var apply = function (a, b) { dateFrom.value = a; dateTo.value = b; document.getElementById('periodApply').click(); };
      var lim = new Date(today + 'T00:00:00Z'); lim.setUTCMonth(lim.getUTCMonth() - 37);
      var oldest = shiftKey(lim.toISOString().slice(0, 10), 1);
      try {
        activeSources.meta = 'act_1';
        apply('2022-01-01', '2022-01-30');
        var ws = DX.windows(period.since, period.until, false);
        eq(ws[ws.length - 1].since, oldest, 'the oldest comparison window starts exactly at Meta\'s limit');
        eq(keyDiffDays(period.since, period.until), 29, 'same length (30 days)');
        eq(document.getElementById('connectStatus').textContent, t('period.tooOld', { date: fmtKey(period.since) }), 'says why');
        apply(shiftKey(today, -20), shiftKey(today, -10));
        eq([period.since, period.until], [shiftKey(today, -20), shiftKey(today, -10)], 'a recent period is untouched');
        delete activeSources.meta;
        apply('2022-01-01', '2022-01-30');
        eq([period.since, period.until], ['2022-01-01', '2022-01-30'], 'no Meta = no Meta limit');
      } finally { if (savedMeta) activeSources.meta = savedMeta; else delete activeSources.meta; }
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
        // الإعلانات بقت صفحة لوحدها — لازم تكون ظاهرة عشان العرض يتقاس فعلاً
        w.showView('ads');
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

    // شكوى صاحب المنتج ٢ نوفمبر ٢٠٢٦: «قائمة الحسابات الاعلانية جزء منها لا يعرض بشكل واضح في عرض الموبايل».
    // مقيس على الموقع: يمين القائمة ٤٠٧ والشاشة ٣٧٥ — مربعات الاختيار كانت مقطوعة
    testAsync('قائمة الحسابات بتظهر كاملة جوه الشاشة على الموبايل (ومربع الاختيار مش مقطوع)', function () {
      return toolFrame(375, 812).then(function (f) {
        var w = f.contentWindow, d = f.contentDocument;
        w.platformOptions.meta = [{ value: 'act_1', label: 'Meta — Level Up' }, { value: 'act_2', label: 'Meta — Second' }];
        w.platformOptions.snapchat = [{ value: 'sn1', label: 'Snapchat — Coda Self Service' }];
        w.activeSources.meta = 'act_1';
        w.renderAccountPicker();
        d.getElementById('acctPickBtn').click();
        var panel = d.getElementById('acctPanel').getBoundingClientRect();
        var boxes = Array.prototype.map.call(d.querySelectorAll('#acctList .acct-box'), function (b) { return b.getBoundingClientRect(); });
        var out = { panelFits: panel.left >= 0 && panel.right <= 375, boxes: boxes.length,
          boxesInside: boxes.filter(function (r) { return r.left >= 0 && r.right <= 375; }).length,
          // ومفيش تمرير أفقي في الصفحة كلها
          extraWidth: d.documentElement.scrollWidth - d.documentElement.clientWidth };
        eq(out, { panelFits: true, boxes: 3, boxesInside: 3, extraWidth: 0 });
        f.remove();
      });
    });
    // iOS بيقرّب على أي حقل خطه أقل من ١٦px ومبيرجّعش التقريب. الإصلاح الأول كان جوه استعلام الموبايل، وقاعدة
    // .sort-select اللي بعده في الملف غلبته — قائمة الفترة فضلت ١٣px على الموقع (مقيس ٣ نوفمبر ٢٠٢٦). بنقيس الخط
    // الفعلي لكل حقل بالستايل الحقيقي، مش بنقرا القاعدة
    // طلب صاحب المنتج ٨ نوفمبر ٢٠٢٦: «فقط يظهر اسم الاداة "Ads Center" ويتحرك… وبدون اي كلمات او جمل لحين انتهاء التحميل»، و«الدائرة
    // الحالية تدور على الديسكتوب لكنها ثابتة في الموبايل» (قاعدة «تقليل الحركة» كانت بتوقف كل حركة)
    testAsync('شاشة الانتظار: اسم الأداة بس بيتحرك من غير أي جملة، والخلفية مقفولة، وبتتحرك مع «تقليل الحركة» كمان (الأداة نفسها على الموبايل)', function () {
      return toolFrame(375, 812).then(function (f) {
        var w = f.contentWindow, d = f.contentDocument;
        try {
          w.setLoading('meta', true, w.msg('s.loadingAds', { platform: 'Meta' }));
          w.renderPageLock();
          var lock = d.getElementById('pageLock');
          ok(!lock.hidden, 'shown while loading');
          // اللي ظاهر: الاسم بس — من غير الجملة اللي في شريط الحالة ولا أي دايرة
          var visible = Array.prototype.filter.call(lock.querySelectorAll('*'), function (el) { return !el.closest('.sr-only') && !el.children.length; })
            .map(function (el) { return el.textContent; }).join('');
          eq(visible, 'Ads Center', 'only the tool name is visible');
          ok(lock.textContent.indexOf(d.getElementById('connectStatus').textContent) < 0, 'the progress sentence is not in the waiting screen');
          ok(!lock.querySelector('.page-lock-spin, .spinner'), 'no circle');
          ok(lock.querySelector('[role="status"] .sr-only'), 'screen readers still hear that it is loading');
          // الخلفية مقفولة: مفيش كلام بيبان من وراها (شريط الحالة والكروت الفاضية)
          // الشفافية بأي صيغة: rgba(…, a) أو color(srgb … / a) — color-mix بيطلع بالصيغة التانية
          var bg = w.getComputedStyle(lock).backgroundColor, m1 = bg.match(/\/\s*([\d.]+)\s*\)$/), m2 = bg.match(/^rgba\(([^)]+)\)$/);
          eq(m1 ? parseFloat(m1[1]) : (m2 ? parseFloat(m2[1].split(',')[3]) : 1), 1, 'opaque background: ' + bg);
          // الحروف بتتحرك بالترتيب بحركة نقل وشفافية بس (معالج الرسوم)
          var chs = lock.querySelectorAll('.bl-ch');
          eq(chs.length, 10);
          var cs = w.getComputedStyle(chs[0]);
          eq([cs.animationName, cs.animationIterationCount], ['bl-wave', 'infinite']);
          eq(w.getComputedStyle(chs[9]).animationDelay, '0.72s', 'a wave: each letter after the one before');
          eq(w.getComputedStyle(lock.querySelector('.brand-load')).fontSize, '30px', 'the mobile size');
          var box = lock.querySelector('.brand-load').getBoundingClientRect();
          ok(box.left >= 0 && box.right <= 375, 'fits the phone screen');
          // «تقليل الحركة» (iOS، و«إزالة الرسوم المتحركة» و«توفير الطاقة» في Android): قاعدة خاصة بتكمّل الحركة بتلاشي هادي
          var rules = [], fade = '';
          Array.prototype.forEach.call(d.styleSheets, function (sh) {
            var list; try { list = sh.cssRules; } catch (e) { return; }
            Array.prototype.forEach.call(list || [], function (r) {
              if (r.media && /prefers-reduced-motion/.test(r.media.mediaText)) Array.prototype.forEach.call(r.cssRules, function (x) { rules.push(x.cssText); });
              if (r.name === 'bl-fade') fade = r.cssText;
            });
          });
          ok(rules.some(function (x) { return /\.brand-load \.bl-ch\s*\{/.test(x) && /bl-fade/.test(x) && /infinite/.test(x) && /!important/.test(x); }), 'letters keep moving with reduced motion');
          ok(rules.some(function (x) { return /\.status-strip \.spinner/.test(x) && /bl-pulse/.test(x) && /infinite/.test(x); }), 'the small circle pulses with reduced motion');
          ok(rules.every(function (x) { return !/\.brand-load/.test(x) || !/transform/.test(x); }), 'nothing moves from its place with reduced motion');
          ok(fade && !/transform/.test(fade) && /opacity/.test(fade), 'the reduced-motion version only fades: ' + fade);
          // التحميل خلص: الشاشة بتختفي والنتايج تظهر
          w.setLoading('meta', false);
          w.renderPageLock();
          ok(lock.hidden, 'gone when loading ends');
        } finally { f.remove(); }
      });
    });
    testAsync('كل حقل إدخال وقائمة في الأداة خطه ١٦px على الموبايل (عشان iOS ميقرّبش الشاشة)', function () {
      return toolFrame(375, 812).then(function (f) {
        var w = f.contentWindow, d = f.contentDocument;
        var small = Array.prototype.filter.call(d.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea'), function (el) {
          return parseFloat(w.getComputedStyle(el).fontSize) < 16;
        }).map(function (el) { return (el.id || el.className || el.tagName) + '=' + w.getComputedStyle(el).fontSize; });
        eq(small, [], 'حقول خطها أقل من ١٦px');
        f.remove();
      });
    });
    testAsync('وعلى الديسكتوب الخط زي ما هو (الإصلاح للموبايل بس)', function () {
      return toolFrame(1200, 800).then(function (f) {
        var w = f.contentWindow, d = f.contentDocument;
        // من ٣ نوفمبر ٢٠٢٦ الفترة زرار ولوحة (زي Google Ads وMeta) — حقول التاريخ جوّاها ١٤px على الديسكتوب
        eq(w.getComputedStyle(d.getElementById('dateFrom')).fontSize, '14px', 'حقل التاريخ على الديسكتوب');
        f.remove();
      });
    });

    // الشكل لازم يتقاس في الأداة الحقيقية (بالستايل بتاعها) — صفحة الاختبارات نفسها من غير ستايل الأداة
    [['ar', ''], ['en', '&lang=en']].forEach(function (lc) {
      testAsync('جدول الأيام على الهاتف (' + lc[0] + '): تحت عنوانه، وبيفتح على أمس والإجمالي واليوم، واسم الصف ظاهر', function () {
        var restore = keepStorage(['acc.lang']);
        return toolFrame(360, 780, lc[1]).then(function (f) {
          var w = f.contentWindow, d = f.contentDocument;
          var eight = function (n) { return [n, n, n, n, n, n, n, n]; };
          var c = ad('dm', { daily: eight(10), res: eight(1) });
          c.dailyDates = last7Days(TODAY).map(function (x) { return x.key; });
          c.dailySales = eight(0);
          w.candidates = [c];
          w.render();
          w.openExpand(c);
          var box = d.getElementById('expandChart'), table = box.querySelector('table'), label = box.previousElementSibling;
          var wrap = box.querySelector('.daily-table-wrap'), wr = wrap.getBoundingClientRect();
          var inView = function (el) { var r = el.getBoundingClientRect(); return r.left >= wr.left - 1 && r.right <= wr.right + 1; };
          // الحاوية كانت بارتفاع ثابت ٥٨px والجدول أطول منها، فكان بيطلع لفوق ويغطي العنوان ومفتاح الألوان
          ok(label && label.classList.contains('chart-section-label'), 'the title sits right above the table');
          ok(table.getBoundingClientRect().top >= label.getBoundingClientRect().bottom - 1, 'the table starts below its title');
          ok(!d.querySelector('.chart-legend'), 'no colour key that repeats the row names');
          ok(wrap.scrollWidth > wrap.clientWidth, 'phone width: the table scrolls');
          ok(['col-yesterday', 'col-total', 'col-today'].every(function (k) { return inView(box.querySelector('thead th.' + k)); }), 'yesterday, total and today in view');
          ok(inView(box.querySelector('tbody td:first-child')), 'the row name stays in view');
          ok(!inView(box.querySelector('thead th:nth-child(2)')), 'the oldest day is behind the scroll');
          eq(d.documentElement.scrollWidth - d.documentElement.clientWidth, 0, 'the page itself does not get wider');
          f.remove();
        }).then(restore, function (e) { restore(); throw e; });
      });
    });

    testAsync('قائمة الحسابات في الصفحة العربية: الاسم الطويل بيتقص من آخره مش من أوله (كان «pchat — …» واسم المنصة ضايع)', function () {
      var restore = keepStorage(['acc.lang']);
      localStorage.setItem('acc.lang', 'ar');
      return toolFrame(800, 600).then(function (f) {
        var w = f.contentWindow, d = f.contentDocument;
        eq([w.getComputedStyle(d.body).direction, w.getComputedStyle(d.getElementById('accountSelect')).direction], ['rtl', 'ltr']);
        f.remove();
      }).then(restore, function (e) { restore(); throw e; });
    });

    testAsync('زرار عرض الملخص في الصفحة العربية: مسافة بين اسم المنصة واسم الحساب (كانوا لازقين «Store OneMeta»)', function () {
      var restore = keepStorage(['acc.lang']);
      localStorage.setItem('acc.lang', 'ar');
      return toolFrame(800, 600).then(function (f) {
        var d = f.contentDocument, box = d.createElement('div');
        // نفس الشكل اللي renderDiagnosis بيبنيه
        box.className = 'dx-views';
        box.innerHTML = '<button type="button" class="chip">Meta<span class="dx-view-acct" dir="auto">Store One</span></button>';
        d.body.appendChild(box);
        var btn = box.firstChild, range = d.createRange();
        range.selectNodeContents(btn.firstChild);
        var label = range.getBoundingClientRect(), acct = btn.querySelector('.dx-view-acct').getBoundingClientRect();
        // بالعربي: المنصة يمين واسم الحساب شمالها
        ok(acct.right <= label.left, 'account name sits to the left of the platform');
        ok(label.left - acct.right >= 4, 'gap between them: ' + Math.round(label.left - acct.right) + 'px');
        f.remove();
      }).then(restore, function (e) { restore(); throw e; });
    });

    // فيديو Snapchat في نافذة التفاصيل (حساب حقيقي ١١ أكتوبر ٢٠٢٦)
    function snapVideoAd(src) {
      var eight = function (n) { return [n, n, n, n, n, n, n, n]; };
      var c = ad('sv', { daily: eight(10), res: eight(1) });
      c.platform = 'Snapchat'; c.source = 'snapchat:acct-1'; c.format = 'video'; c.videoSrc = src;
      c.dailyDates = last7Days(TODAY).map(function (x) { return x.key; });
      c.dailySales = eight(0);
      return c;
    }
    testAsync('قفل نافذة التفاصيل بيوقف الفيديو (كان بيكمّل بصوته وهي مخفية) — بكل طرق القفل', function () {
      return toolFrame(800, 600).then(function (f) {
        var w = f.contentWindow, d = f.contentDocument, c = snapVideoAd('https://cdn.example/v.mp4');
        w.candidates = [c];
        w.render();
        var ways = {
          button: function () { d.getElementById('expandClose').click(); },
          outside: function () { d.getElementById('expandOverlay').click(); },
          escape: function () { w.closeOverlays(); }
        };
        var res = {};
        return Object.keys(ways).reduce(function (p, k) {
          return p.then(function () {
            w.openExpand(c);
            var v = d.querySelector('#expandPreview video');
            ok(v, k + ': the video is there while the window is open');
            ways[k]();
            return sleep(0).then(function () { res[k] = { detached: !d.contains(v), empty: !d.getElementById('expandPreview').firstChild }; });
          });
        }, Promise.resolve()).then(function () {
          eq(res, { button: { detached: true, empty: true }, outside: { detached: true, empty: true }, escape: { detached: true, empty: true } });
          // فتح تاني بعد القفل: الفيديو راجع
          w.openExpand(c);
          ok(d.querySelector('#expandPreview video'), 'reopening shows the video again');
          f.remove();
        });
      });
    });
    // من ٢٥ أكتوبر (طلب صاحب المنتج: «فيديوهات سناب شات لا تشتغل تلقائياً… وبعضها لا يعمل»): بيشتغل أول ما الكارت يتفتح، ولو الملف
    // الأصلي فشل بنجرّب معاينة الوسيط من Snapchat (Get Media Preview) قبل رسالة الفشل، وزرار معاينة الإعلان على سناب شات
    testAsync('فيديو Snapchat بيشتغل عند الفتح، ولو الملف فشل: معاينة الوسيط من Snapchat، وزرار «شاهد الإعلان كما يظهر على سناب شات»', function () {
      return toolFrame(800, 600).then(function (f) {
        var w = f.contentWindow, d = f.contentDocument, asked = [];
        var bad = location.origin + '/tests/index.html?not-a-video=' + Date.now(), alt = location.origin + '/tests/index.html?preview=' + Date.now();
        var page = 'https://ad-preview.snapchat.com/?creative_id=cr1&expires_at=1&signature=s';
        w.apiPost = function (url, body) { asked.push(body.action + ':' + body.mediaId + ':' + body.creativeId); return Promise.resolve({ ok: true, data: { video: alt, page: page } }); };
        var c = snapVideoAd(bad);
        c.snapMediaId = 'm1'; c.snapCreativeId = 'cr1'; c.thumbUrl = 'https://cdn.example/thumb.jpg';
        w.candidates = [c];
        w.render();
        w.openExpand(c);
        var v = d.querySelector('#expandPreview video');
        eq([v.getAttribute('poster'), v.preload, v.src], ['https://cdn.example/thumb.jpg', 'auto', bad], 'plays the file at once, with the thumbnail as its poster');
        var until = function (fn, n) { return fn() ? Promise.resolve(fn()) : (n > 0 ? sleep(20).then(function () { return until(fn, n - 1); }) : Promise.resolve(null)); };
        return until(function () { return d.querySelector('#expandPreview .snap-page a'); }, 100).then(function (a) {
          eq(a && [a.href, a.target, a.textContent], [page, '_blank', w.t('x.pv.snapPage') + ' ↗'], 'the Snapchat preview button');
          eq(asked, ['preview:m1:cr1'], 'one request on opening');
          v.dispatchEvent(new Event('error'));
          return until(function () { return v.getAttribute('src') === alt; }, 100);
        }).then(function (switched) {
          ok(switched, 'the original file failed: Snapchat\'s media preview instead');
          eq(asked.length, 1, 'no second request — already asked on opening');
          f.remove();
        });
      });
    });
    testAsync('فيديو Snapchat مقدرش يشتغل: السبب ورابط الملف بدل مشغّل واقف على ٠:٠٠ — ومن غير ما يكتب فوق إعلان تاني', function () {
      return toolFrame(800, 600).then(function (f) {
        var w = f.contentWindow, d = f.contentDocument;
        // معاينة الوسيط من Snapchat مش متاحة (الطلب فشل): الرسالة بعد خطأ الملف الأصلي على طول
        w.apiPost = function () { return Promise.resolve({ ok: false, data: {} }); };
        // صفحة HTML مش فيديو = نفس خطأ المتصفح لما الصيغة مش مدعومة
        var bad = location.origin + '/tests/index.html?not-a-video=' + Date.now(), c = snapVideoAd(bad);
        w.candidates = [c];
        w.render();
        w.openExpand(c);
        var v = d.querySelector('#expandPreview video');
        // بنستنى خطأ الفيديو نفسه، من غير مؤقت: في Chrome بلا واجهة بالوقت الافتراضي (المشغّل المحلي) المؤقتات بتعدّي
        // أسرع من الشبكة، فمؤقت ٢٠ ثانية كان بيخلص قبل ما الخطأ يوصل (فشل متقطع اتقاس ١٧ أكتوبر — SWE at Google فصل ١١:
        // الاختبار المتقطع بيفقد قيمته). لو الخطأ مجاش خالص فده عطل حقيقي، والتشغيل بيبان فاشل
        var failed = new Promise(function (resolve) {
          if (v.error) { resolve(); return; }
          v.addEventListener('error', function () { resolve(); }, { once: true });
        });
        v.muted = true;
        v.play().catch(function () {});
        var until = function (fn, n) { return fn() ? Promise.resolve(fn()) : (n > 0 ? sleep(20).then(function () { return until(fn, n - 1); }) : Promise.resolve(null)); };
        return failed.then(function () {
          return until(function () { return d.querySelector('#expandPreview .snap-video-failed'); }, 100);
        }).then(function (box) {
          ok(box, 'the failure box replaces the frozen player');
          eq(box && box.querySelector('p').textContent, w.t('x.pv.snapVideoFailed'));
          var a = box && box.querySelector('a');
          eq(a && [a.href, a.target, a.rel], [bad, '_blank', 'noopener noreferrer'], 'link to the file itself');
          // خطأ متأخر بعد ما النافذة اتقفلت وفتحت على إعلان تاني مبيكتبش فوقه
          w.openExpand(c);
          var v2 = d.querySelector('#expandPreview video');
          d.getElementById('expandClose').click();
          return sleep(0).then(function () {
            var other = ad('other', { daily: [1, 1, 1, 1, 1, 1, 1, 1], res: [0, 0, 0, 0, 0, 0, 0, 0] });
            other.dailyDates = c.dailyDates; other.dailySales = c.dailySales;
            w.openExpand(other);
            v2.dispatchEvent(new Event('error'));
            ok(!d.querySelector('#expandPreview .snap-video-failed'), 'a late error from the closed video stays out of the next ad');
            f.remove();
          });
        });
      });
    });

    testAsync('Snapchat: صورة أول منتج للكارت، والمنتجات جوه الإعلان من غير زرار المعاينة (Snapchat مبيدعمهاش للكتالوج)', function () {
      return toolFrame(800, 600).then(function (f) {
        var w = f.contentWindow, d = f.contentDocument, asked = [];
        w.apiPost = function (url, body) {
          asked.push(body.action);
          if (body.action === 'products') return Promise.resolve({ ok: true, data: { products: [
            { name: 'Diamond Cut', image: 'https://shop.example/i/1.jpg', url: 'https://shop.example/p/1', price: { value: 329, currency: 'SAR' } }] } });
          return Promise.resolve({ ok: true, data: { page: 'https://ad-preview.snapchat.com/?creative_id=x&expires_at=1&signature=s' } });
        };
        w.isCurrentLoad = function () { return true; };
        var eight = function (n) { return [n, n, n, n, n, n, n, n]; };
        var c = ad('cat', { daily: eight(10), res: eight(1) });
        c.platform = 'Snapchat'; c.source = 'snapchat:acc1'; c.format = 'image'; c.badgeKey = 'card.snapCollection';
        c.snapProductSetId = 'ps1'; c.snapCreativeId = 'cr1'; c.snapDynamic = true;
        c.dailyDates = last7Days(TODAY).map(function (x) { return x.key; }); c.dailySales = eight(0);
        w.candidates = [c];
        var until = function (fn, n) { return fn() ? Promise.resolve(fn()) : (n > 0 ? sleep(20).then(function () { return until(fn, n - 1); }) : Promise.resolve(null)); };
        return w.loadSnapchatCatalog('acc1', 'tok').then(function () {
          eq(c.thumbUrl, 'https://shop.example/i/1.jpg', 'the card shows the first product');
          w.render();
          w.openExpand(c);
          return until(function () { return d.querySelector('#expandPreview .cat-item'); }, 50);
        }).then(function (item) {
          ok(item && item.textContent.indexOf('Diamond Cut') > -1 && item.href === 'https://shop.example/p/1', item ? item.outerHTML.slice(0, 200) : 'no grid');
          return sleep(60);
        }).then(function () {
          eq([asked, !!d.querySelector('#expandPreview .snap-page a')], [['products'], false], 'products asked once (cached), no Snapchat preview for a dynamic catalog ad');
          f.remove();
        });
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
        // العملة حسب المنطقة الزمنية لجهاز اللي بيشغّل الاختبار ($12 / 45 SAR / 582 EGP) — المهم الصيغة الإنجليزية من أول لحظة
        var w = f.contentWindow, cur = w.AdsDemo.currencyFor(w.Intl.DateTimeFormat().resolvedOptions().timeZone);
        eq(f.contentDocument.querySelector('[data-count][data-money]').textContent, w.AdsDemo.moneyFor(12, cur, false));
        ok(!/[٠-٩]/.test(f.contentDocument.querySelector('[data-count][data-money]').textContent), 'English digits');
        f.remove();
      }).then(restore, function (e) { restore(); throw e; });
    });
  });

  // ---------- اللي ظهر مع حساب Meta حقيقي (٦٤٣ إعلان: ٢٥ شغّال و٦١٨ متوقف) ----------
  describe('حساب حقيقي', function () {
    // FB وهمي: كل طلب بيرد حسب المسار، والإعلانات المتوقفة بتستنى لحد ما الاختبار يسمح
    function fakeFB(routes) {
      var held = [];
      return {
        held: held,
        api: function (path, params, cb) {
          var status = params && params.effective_status ? JSON.parse(params.effective_status)[0] : '';
          var key = path.replace(/act_\d+/, 'act') + (status ? ':' + status : '');
          var reply = routes[key] || routes[path.replace(/act_\d+/, 'act')] || { data: [] };
          if (reply === 'HOLD') { held.push(function (r) { cb(r); }); return; }
          setTimeout(function () { cb(typeof reply === 'function' ? reply(params) : reply); }, 0);
        }
      };
    }
    function metaAd(id, status, extra) {
      var a = { id: id, name: 'Ad ' + id, effective_status: status, created_time: '2026-09-01T00:00:00+0000', adset: { id: 's1', name: 'S', optimization_goal: 'OFFSITE_CONVERSIONS' }, campaign: { id: 'c1', name: 'C' }, creative: { title: 'T', thumbnail_url: 'https://example.com/t.jpg' } };
      Object.keys(extra || {}).forEach(function (k) { a[k] = extra[k]; });
      return a;
    }
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    // اقتراح صاحب المنتج: الإعلانات الشغّالة بس افتراضياً، والمتوقفة القديمة مبتتحمّلش غير لما العميل يطلبها
    testAsync('Meta: الشغّالة والأرقام بتظهر ويخلص التحميل، والمتوقفة مبتتطلبش غير بالزرار', function () {
      var hadFB = 'FB' in window, prevFB = window.FB;
      var restore = function () { if (hadFB) window.FB = prevFB; else delete window.FB; showStopped = false; };
      var fb = fakeFB({ '/act/ads:ACTIVE': { data: [metaAd('L1', 'ACTIVE')] }, '/act/ads:PAUSED': 'HOLD' });
      window.FB = fb;
      showStopped = false;
      accountInfo['meta:act_7'] = { timeZone: 'UTC', currency: 'SAR' };
      loadAdsForAccount('act_7');
      return sleep(60).then(function () {
        eq(candidates.map(function (c) { return c.id; }), ['L1'], 'the live ad is on screen');
        eq(loadingPlatforms.meta, false, 'done without the paused ads');
        eq(fb.held.length, 0, 'paused ads not even requested');
        ok(document.querySelector('#cardGrid [data-show-stopped]'), 'button at the end of the list');
        document.querySelector('#cardGrid [data-show-stopped]').click();
        return sleep(30);
      }).then(function () {
        eq(fb.held.length, 1, 'requested after the click');
        eq(loadingPlatforms.meta, true, 'loading them in the background');
        ok(document.getElementById('connectStatus').textContent.indexOf(t('s.metaStoppedLoading')) > -1, 'says paused ads are coming');
        fb.held.forEach(function (release) { release({ data: [metaAd('P1', 'PAUSED'), metaAd('P2', 'ADSET_PAUSED')] }); });
        return sleep(60);
      }).then(function () {
        eq(candidates.map(function (c) { return c.id; }).sort(), ['L1', 'P1', 'P2'], 'paused ads added');
        eq(loadingPlatforms.meta, false, 'done');
        eq(document.querySelectorAll('#cardGrid .candidate-card').length, 3, 'and shown');
        restore();
      }, function (e) { restore(); throw e; });
    });

    test('الإعلانات المتوقفة: مستخبية افتراضياً — إلا اللي عليها تنبيه عاجل، ومع البحث أو فلتر «متوقف»', function () {
      var live = ad('a1', { daily: steady(50), res: steady(2) });
      var old = ad('p1', { daily: steady(0), res: steady(0), active: false });
      candidates = [live, old];
      showStopped = false;
      render();
      eq(visibleCandidates().map(function (c) { return c.id; }), ['a1'], 'default');
      ok(document.querySelector('#cardGrid [data-show-stopped]'), 'button shown');
      filters.health = 'stopped';
      eq(visibleCandidates().map(function (c) { return c.id; }), ['p1'], 'stopped filter');
      filters.health = 'all'; filters.text = 'x';
      ok(!hidesStopped(), 'searching looks in stopped ads too');
      filters.text = '';
      // حساب كله متوقف: مفيش حاجة تستخبى
      candidates = [old];
      eq(visibleCandidates().map(function (c) { return c.id; }), ['p1'], 'all-stopped account');
    });

    testAsync('Meta: حساب كل إعلاناته متوقفة مبيتقالش عليه «فاضي» قبل ما المتوقفة توصل', function () {
      var hadFB = 'FB' in window, prevFB = window.FB;
      var restore = function () { if (hadFB) window.FB = prevFB; else delete window.FB; };
      window.FB = fakeFB({ '/act/ads:ACTIVE': { data: [] }, '/act/ads:PAUSED': { data: [metaAd('P9', 'PAUSED')] } });
      accountInfo['meta:act_8'] = { timeZone: 'UTC' };
      loadAdsForAccount('act_8');
      // بنستنى التحميل يخلص (لحد ٢ ثانية) بدل ٨٠ مللي ثابتة — كانت بتفشل أحياناً لما الجهاز مشغول
      var settle = function (n) { return sleep(40).then(function () { return loadingPlatforms.meta && n > 0 ? settle(n - 1) : null; }); };
      return settle(50).then(function () {
        restore();
        eq(candidates.map(function (c) { return c.id; }), ['P9']);
        ok(!platformState.meta, 'not marked empty');
        eq(loadingPlatforms.meta, false);
      }, function (e) { restore(); throw e; });
    });

    // ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦: التكرار كان آخر ٧ أيام بس
    testAsync('Meta: تكرار الظهور منذ الإطلاق بيوصل في الخلفية للإعلانات الشغّالة ويظهر في التفاصيل جنب آخر ٧ أيام', function () {
      var hadFB = 'FB' in window, prevFB = window.FB, asked = [];
      var restore = function () { if (hadFB) window.FB = prevFB; else delete window.FB; };
      window.FB = fakeFB({ '/act/ads:ACTIVE': { data: [metaAd('F1', 'ACTIVE')] },
        '/act/insights': function (p) {
          if (p.date_preset === 'maximum') { asked.push(JSON.parse(p.filtering)[0].value); return { data: [{ ad_id: 'F1', frequency: '3.4' }] }; }
          if (p.date_preset === 'last_30d') return { data: [{ ad_id: 'F1', frequency: '2.6' }] };
          if (/frequency/.test(p.fields)) return { data: [{ ad_id: 'F1', frequency: '1.8', reach: '500', impressions: '900' }] };
          return { data: [] };
        } });
      accountInfo['meta:act_9'] = { timeZone: 'UTC', currency: 'SAR' };
      loadAdsForAccount('act_9');
      var find = function () { return candidates.filter(function (x) { return x.id === 'F1'; })[0]; };
      var settle = function (n) { return sleep(40).then(function () { var c = find(); return (!c || c.frequencyLife == null) && n > 0 ? settle(n - 1) : c; }); };
      return settle(50).then(function (c) {
        restore();
        eq(asked, [['F1']], 'one request, live ads only');
        eq([c.frequency, c.frequency30, c.frequencyLife], [1.8, 2.6, 3.4]);
        withLang('ar', function () { var h = freqBox(c); ok(/آخر ٣٠ يوماً/.test(h) && /٢٫٦/.test(h) && /منذ إطلاق الإعلان: ٣٫٤/.test(h) && !/١٫٨/.test(h), h); });
      }, function (e) { restore(); throw e; });
    });

    // لوحة «قيمة الأداة» مكان لوحة الهدر (قرار صاحب المنتج ٢٥ أكتوبر ٢٠٢٦): المشكلة اتعالجت لو فيه تعديل خلال ٢٤ ساعة من التنبيه
    test('قيمة الأداة: المعالجة = إيقاف أو خفض ميزانية أو تعديل خلال ٢٤ ساعة من التنبيه على الإعلان أو مجموعته أو حملته، و«متعالجتش» بعد ما السجل يغطيها بس', function () {
      var first = Date.parse('2026-10-20T10:00:00Z'), H = 3600000, at = function (h) { return new Date(first + h * H).toISOString(); };
      var ep = { id: 1, ad: '11', kind: 'waste', firstAt: at(0) }, objs = { ad: '11', adset: '22', campaign: '33' };
      var acts = function (list, extra) { return Object.assign({ since: first - 8 * 24 * H, complete: true, list: list }, extra || {}); };
      eq(valueDecision(ep, objs, acts([{ kind: 'pause', level: 'adset', id: '22', time: at(3) }]), first + 4 * H), { handledAt: at(3), action: 'pause' });
      // رفع الميزانية مش معالجة، والخفض معالجة — والتعديل قبل التنبيه مش «بعده»
      eq(valueDecision(ep, objs, acts([{ kind: 'budget', level: 'campaign', id: '33', time: at(1), from: 50, to: 100 },
        { kind: 'pause', level: 'ad', id: '11', time: at(-2) }, { kind: 'budget', level: 'campaign', id: '33', time: at(5), from: 100, to: 50 }]), first + 6 * H),
        { handledAt: at(5), action: 'budget' });
      eq(valueDecision(ep, objs, acts([{ kind: 'creative', level: 'ad', id: '99', time: at(1) }]), first + 6 * H), null, 'another ad, and the 24 hours are not over');
      eq(valueDecision(ep, objs, acts([]), first + 25 * H), { handledAt: null, action: null }, 'no change within the 24 hours');
      eq(valueDecision(ep, objs, acts([{ kind: 'targeting', level: 'ad', id: '11', time: at(26) }]), first + 27 * H), { handledAt: null, action: null }, 'a change after the 24 hours');
      eq(valueDecision(ep, objs, acts([], { complete: false }), first + 25 * H), null, 'the log was cut: we cannot say');
      eq(valueDecision(ep, objs, acts([], { since: first + H }), first + 25 * H), null, 'the log starts after the alert');
      // Snapchat: سجل لكل عنصر — لازم سجل الإعلان ومجموعته وحملته كلهم يكونوا وصلوا
      eq(valueDecision(ep, objs, acts([], { objects: { 'ad:11': 1, 'adsquad:22': 1 } }), first + 25 * H), null, 'the campaign log did not arrive');
      eq(valueDecision(ep, objs, acts([], { objects: { 'ad:11': 1, 'adsquad:22': 1, 'campaign:33': 1 } }), first + 25 * H), { handledAt: null, action: null });
    });
    // ٣ نوفمبر ٢٠٢٦ (طلب صاحب المنتج): بالدقائق — الساعة كانت بتخلّي الشهر كله «أقل من ساعة». العدد مع المعدود بالعربي
    test('قيمة الأداة: الوقت بالدقائق، وفوق الساعة «ساعة و… دقائق»، والعدد مع المعدود صح', function () {
      withLang('ar', function () {
        eq([0, 20, 60, 120, 180, 600, 660, 1440, 3600, 3660, 4200, 7320, 4 * 3600 + 15 * 60].map(valueTimeText),
          ['أقل من دقيقة', 'أقل من دقيقة', 'نحو دقيقة', 'نحو دقيقتين', 'نحو ٣ دقائق', 'نحو ١٠ دقائق', 'نحو ١١ دقيقة', 'نحو ٢٤ دقيقة',
            'نحو ساعة', 'نحو ساعة ودقيقة', 'نحو ساعة و١٠ دقائق', 'نحو ساعتين ودقيقتين', 'نحو ٤ ساعات و١٥ دقيقة']);
      });
      withLang('en', function () { eq([60, 1440, 3600, 4200].map(valueTimeText), ['About 1 minute', 'About 24 minutes', 'About 1 hour', 'About 1 hour 10 minutes']); });
    });
    // من ٢٥ أكتوبر (قرار صاحب المنتج): اللوحة بتتبع فترة البيانات المختارة واختيار المنصات زي باقي الأداة
    test('قيمة الأداة: اللوحة بفترة البيانات المختارة — اللي اتعالج ومبلغه والوقت، والنهارده سطر لوحده، و«تنتظر نظرتك» من غير أي نسبة، والملاحظة قبل أول تسجيل', function () {
      var src = 'meta:act_7', old = { act: activeSources.meta, snap: activeSources.snapchat, info: accountInfo[src], eps: valueEpisodes[src], ack: valueAckNow,
        stored: localStorage.getItem(VALUE_ACK_KEY), cands: candidates, period: period };
      var now = Date.now(), H = 3600000, today = todayKeyInTz('UTC');
      var at = function (key) { return key + 'T12:00:00.000Z'; }, yesterday = shiftKey(today, -1), monthAgo = shiftKey(today, -40);
      try {
        period = { preset: 'last7' };
        localStorage.removeItem(VALUE_ACK_KEY); valueAckNow = false;
        activeSources.meta = 'act_7'; delete activeSources.snapchat;
        accountInfo[src] = { timeZone: 'UTC', currency: 'SAR' };
        // أمس: a1 وa2 صرفوا وa3 لأ — إعلانات اليوم من أرقامه هو (٣ نوفمبر ٢٠٢٦)، مش الشغّالة دلوقتي
        var dd = [shiftKey(today, -2), yesterday, today];
        candidates = [{ id: 'a1', source: src, active: true, dailyDates: dd, daily: [10, 10, 10] }, { id: 'a2', source: src, active: true, dailyDates: dd, daily: [10, 10, 10] },
          { id: 'a3', source: src, active: false, dailyDates: dd, daily: [10, 0, 0] }];
        valueEpisodes[src] = [];
        var risk = [{ level: 'critical', atRisk: true, amount: 300, adId: 'a1', currency: 'SAR', money: { daily: 100 } },
          { level: 'warning', atRisk: false, amount: 50, adId: 'a2', currency: 'SAR', money: { daily: 20 } }];
        var html = function (pick, alerts) { return withLang('ar', function () { return valuePanelHtml(valueData(pick || null, alerts || [])); }); };
        var h = html(null, risk);
        ok(/data-value-ack/.test(h) && /دون أي أرقام إنفاق أو مبيعات/.test(h) && /بعد موافقتك أعلاه/.test(h), 'notice first: ' + h);
        ok(/١ مشكلة تنتظر نظرتك، وتهدر نحو ١٠٠ ر\.س يومياً/.test(h) && /data-kpi="risk"/.test(h), 'pending: the urgent one only');
        // عنوان اللوحة بأيام الفترة (آخر ٧ أيام = أيام مكتملة لأمس)
        ok(h.indexOf('<span class="value-period">' + fmtRange(shiftKey(today, -7), yesterday) + '</span>') > -1, 'period dates in the title: ' + h);
        valueAckNow = true;
        valueEpisodes[src] = [
          { id: 101, ad: 'a1', kind: 'waste', firstAt: at(yesterday), decided: true, handledAt: new Date(Date.parse(at(yesterday)) + H).toISOString(), action: 'pause' },
          { id: 102, ad: 'a2', kind: 'waste', firstAt: at(yesterday), decided: false, handledAt: null, action: null },
          { id: 103, ad: 'a3', kind: 'waste', firstAt: at(monthAgo), decided: true, handledAt: at(monthAgo), action: 'pause' },
          { id: 104, ad: 'a2', kind: 'loss', firstAt: new Date(now - 60000).toISOString(), decided: true, handledAt: new Date(now).toISOString(), action: 'budget' }];
        valueMoney[101] = { v: 120, cur: 'SAR' }; valueMoney[103] = { v: 999, cur: 'SAR' }; valueMoney[104] = { v: 555, cur: 'SAR' };
        h = html();
        ok(!/data-value-ack/.test(h), 'no notice once accepted');
        ok(/مشكلات عالجتها بعد تنبيهنا<\/span><b class="value-v">١<\/b>/.test(h), 'one fixed in the period (40 days ago and today left out): ' + h);
        ok(/<b class="value-v">١٢٠ ر\.س<\/b>/.test(h) && !/٩٩٩/.test(h) && !/٥٥٥/.test(h) && !/لا يقل عن/.test(h), 'its measured amount, the period only');
        // يوم واحد فيه تنبيه جديد في الفترة: دقيقة + ١٠ ثواني × الإعلانين اللي صرفوا يومها = ٨٠ ثانية → «نحو دقيقة»
        ok(/وقت وفّرناه عليك<\/span><b class="value-v">نحو دقيقة<\/b>/.test(h), h);
        // النهارده برّه «آخر ٧ أيام» (أيام مكتملة): سطر لوحده زي «اليوم حتى الآن» في الملخص
        ok(/اليوم حتى الآن \(لا يدخل في أرقام الفترة\): عالجت ١ مشكلة بعد تنبيهنا/.test(h), h);
        ok(/كيف نحسبها؟/.test(h) && /١٠ ثوانٍ لكل إعلان صرف في ذلك اليوم/.test(h) && /ناقص هدره الفعلي في أول يوم مكتمل بعد تصرّفك/.test(h), 'how we count');
        // «اليوم»: مشكلة النهارده جوه الفترة، وأمس برّه
        period = { preset: 'today' };
        h = html();
        ok(/<b class="value-v">٥٥٥ ر\.س<\/b>/.test(h) && !/١٢٠ ر\.س/.test(h) && !/اليوم حتى الآن/.test(h), 'period today: ' + h);
        period = { preset: 'last7' };
        // اتعالجت أمس ومبلغها لسه متحسبش: اليوم اللي بعدها (النهارده) مكملش — سطر بيقول كده بدل ما تبان من غير أثر
        valueEpisodes[src].push({ id: 106, ad: 'a2', kind: 'waste', firstAt: at(yesterday), decided: true, handledAt: at(yesterday), action: 'budget' });
        h = html();
        ok(/ويُحسب مبلغ ١ مشكلة بعد اكتمال اليوم التالي لتصرّفك/.test(h), 'waiting for the day after: ' + h);
        valueEpisodes[src].pop();
        // نفس الإعلان ونفس يوم التصرّف مرتين (السيرفر بيقفل المشكلة لما تختفي وبيفتحها لما ترجع — حساب حقيقي ٣٠ أكتوبر):
        // مشكلة واحدة ومبلغ واحد، وأكبر مبلغ في المجموعة مش مجموعهم
        valueEpisodes[src].push({ id: 107, ad: 'a1', kind: 'waste', firstAt: at(yesterday), decided: true,
          handledAt: new Date(Date.parse(at(yesterday)) + 2 * H).toISOString(), action: 'bid' });
        valueMoney[107] = { v: 90, cur: 'SAR' };
        h = html();
        ok(/مشكلات عالجتها بعد تنبيهنا<\/span><b class="value-v">١<\/b>/.test(h) && /<b class="value-v">١٢٠ ر\.س<\/b>/.test(h) && !/٢١٠/.test(h),
          'the same ad fixed on the same day counts once, with the bigger amount: ' + h);
        valueEpisodes[src].pop(); delete valueMoney[107];
        period = { preset: 'last7' };
        // ولا واحدة اتعالجت في الفترة: سطر محايد بعدد اللي نبّهنا لها، من غير خانة «٠»
        valueEpisodes[src] = valueEpisodes[src].slice(1, 2);
        h = html();
        ok(/نبّهناك في هذه الفترة إلى ١ مشكلة/.test(h) && !/مشكلات عالجتها/.test(h) && !/هدر منعته/.test(h), h);
        // فيه مشكلات في السجل بس مش في الفترة: «لم نسجّل تنبيهات عاجلة في هذه الفترة» (مش «نبدأ العدّ»)
        valueEpisodes[src] = [{ id: 105, ad: 'a3', kind: 'waste', firstAt: at(monthAgo), decided: true, handledAt: null, action: null }];
        h = html();
        ok(/لم نسجّل تنبيهات عاجلة في هذه الفترة/.test(h) && !/نبدأ العدّ/.test(h), h);
        eq(html(['snapchat']), '', 'Snapchat only and not connected: nothing to show');
      } finally {
        period = old.period;
        activeSources.meta = old.act; if (old.act === undefined) delete activeSources.meta;
        if (old.snap !== undefined) activeSources.snapchat = old.snap;
        if (old.info === undefined) delete accountInfo[src]; else accountInfo[src] = old.info;
        if (old.eps === undefined) delete valueEpisodes[src]; else valueEpisodes[src] = old.eps;
        delete valueMoney[101]; delete valueMoney[103]; delete valueMoney[104];
        valueAckNow = old.ack; candidates = old.cands;
        if (old.stored == null) localStorage.removeItem(VALUE_ACK_KEY); else localStorage.setItem(VALUE_ACK_KEY, old.stored);
      }
    });
    // من أول التسجيل للمبلغ: المشكلات بتتبعت للسيرفر (بعد الملاحظة بس)، والقرار من سجل التعديلات، والمبلغ من أرقام الكارت
    testAsync('قيمة الأداة: تسجيل المشكلات بعد الموافقة بس، والقرار من سجل التعديلات، والمبلغ من أيام الكارت قبل التنبيه', function () {
      // أوقات ثابتة على حدود الأيام (٣ نوفمبر ٢٠٢٦): المبلغ بقى محتاج اليوم اللي بعد التصرّف يكون مكتمل، و«now − ٢٨ ساعة» كانت
      // بتخلّي النتيجة على حسب ساعة التشغيل. التنبيه من ٣ أيام الساعة ١٠، والإيقاف الساعة ١٢، واليوم اللي بعده مصرفش (اتوقف)
      var src = 'meta:act_9', calls = [], H = 3600000, now = Date.now(), day0 = shiftKey(todayKeyInTz('UTC'), -3);
      var firstAt = day0 + 'T10:00:00.000Z', pausedAt = day0 + 'T12:00:00.000Z', afterDay = shiftKey(day0, 1);
      var old = { act: activeSources.meta, cands: candidates, analysis: analysis, analysisNow: analysisNow, sync: window.syncCall, tok: window.platformTokenOf, ack: valueAckNow,
        stored: localStorage.getItem(VALUE_ACK_KEY), money: localStorage.getItem(VALUE_MONEY_KEY), load: loadingPlatforms.meta, pend: numbersPending.meta };
      var dates = [], daily = [], dailyCut = [];
      for (var i = 9; i >= 0; i--) { var k = shiftKey(todayKeyInTz('UTC'), -i); dates.push(k); daily.push(k >= afterDay ? 0 : 90); dailyCut.push(k >= afterDay ? 72 : 90); }
      var restore = function () {
        activeSources.meta = old.act; if (old.act === undefined) delete activeSources.meta;
        candidates = old.cands; analysis = old.analysis; analysisNow = old.analysisNow; window.syncCall = old.sync; window.platformTokenOf = old.tok; valueAckNow = old.ack;
        loadingPlatforms.meta = old.load; numbersPending.meta = old.pend;
        delete accountInfo[src]; delete valueEpisodes[src]; delete valueActions[src]; delete valueState[src]; delete valueMoney[55]; delete valueMoney[56];
        if (old.stored == null) localStorage.removeItem(VALUE_ACK_KEY); else localStorage.setItem(VALUE_ACK_KEY, old.stored);
        if (old.money == null) localStorage.removeItem(VALUE_MONEY_KEY); else localStorage.setItem(VALUE_MONEY_KEY, old.money);
      };
      try {
        localStorage.removeItem(VALUE_ACK_KEY); valueAckNow = false;
        activeSources.meta = 'act_9'; accountInfo[src] = { timeZone: 'UTC', currency: 'SAR' };
        loadingPlatforms.meta = false; numbersPending.meta = false;
        candidates = [{ id: '111', nativeId: '111', source: src, active: true, currency: 'SAR', adsetId: '222', campaignId: '333', dailyDates: dates, daily: daily },
          { id: '112', nativeId: '112', source: src, active: true, currency: 'SAR', adsetId: '223', campaignId: '334', dailyDates: dates, daily: dailyCut }];
        // سجل المشكلات على «الآن» (analysisNow) من ٣ نوفمبر ٢٠٢٦ — أيّاً كانت الفترة
        analysisNow = analysis = { alerts: [{ level: 'critical', atRisk: true, amount: 300, adId: '111', code: 'waste-week', currency: 'SAR', money: { daily: 90 } }], byAd: {} };
        window.platformTokenOf = function () { return 'tok_abcdefghijklmnopqrstuvwxyz'; };
        window.syncCall = function (body) {
          calls.push(body);
          if (body.action === 'episodes.sync') return Promise.resolve({ episodes: [{ id: 55, ad: '111', kind: 'waste', firstAt: firstAt, decided: false, handledAt: null, action: null },
            { id: 56, ad: '112', kind: 'waste', firstAt: firstAt, decided: false, handledAt: null, action: null }] });
          return Promise.resolve({ ok: true, saved: 1 });
        };
        valueActions[src] = { since: now - 8 * 24 * H, complete: true, list: [{ kind: 'pause', level: 'campaign', id: '333', time: pausedAt },
          { kind: 'budget', level: 'ad', id: '112', from: 100, to: 80, time: pausedAt }] };
        valueState[src] = {};
        valueTick();
      } catch (e) { restore(); throw e; }
      return sleep(30).then(function () {
        eq(calls[0] && [calls[0].action, calls[0].platform, calls[0].accountId, calls[0].open], ['episodes.sync', 'meta', 'act_9', null], 'before the notice: read only');
        valueAckNow = true; valueState[src] = {}; calls.length = 0;
        valueTick(); valueTick();
        return sleep(30);
      }).then(function () {
        var syncs = calls.filter(function (c) { return c.action === 'episodes.sync'; }), dec = calls.filter(function (c) { return c.action === 'episodes.decide'; })[0];
        eq(syncs.length, 1, 'the same problems again: no second request');
        eq(syncs[0].open, [{ ad: '111', kind: 'waste' }]);
        eq(dec && dec.decisions, [{ id: 55, handledAt: pausedAt, action: 'pause' }, { id: 56, handledAt: pausedAt, action: 'budget' }], 'the campaign was paused 2 hours after the alert');
        eq(valueEpisodes[src][0].handledAt, pausedAt);
        eq(valueMoney[55], { v: 90, cur: 'SAR' }, 'إيقاف: ٩٠ يومياً قبل التنبيه وصفر في اليوم اللي بعد الإيقاف = ٩٠ كاملة');
        eq(valueMoney[56], { v: 18, cur: 'SAR' }, 'خفض ميزانية: ٩٠ قبل التنبيه و٧٢ في اليوم اللي بعد الخفض = ١٨ هي المنَعة');
        restore();
      }, function (e) { restore(); throw e; });
    });
    // حساب حقيقي ١٠ أكتوبر ٢٠٢٦: إعلانات فيديو Advantage+ والكتالوج كانت «الوجهة —»، وغلاف ١١ فيديو ١٦٠×١٦٠ مشوّش
    test('Meta: الوجهة من template_data (الكتالوج) وasset_feed_spec (نسخة لكل مكان ظهور)، والغلاف الصغير بيتأجل', function () {
      var tpl = destinationInfo({ object_story_spec: { page_id: '1', template_data: { link: 'https://shop.com/c/1?tm={{ad.id}}', call_to_action: { type: 'SHOP_NOW' } } } });
      eq([tpl.url, tpl.kind], ['https://shop.com/c/1?tm={{ad.id}}', 'website']);
      var feed = destinationInfo({ object_story_spec: { page_id: '1' }, asset_feed_spec: { link_urls: [{ website_url: 'https://shop.com/p/2' }], call_to_action_types: ['SHOP_NOW'] } });
      eq([feed.url, feed.kind], ['https://shop.com/p/2', 'website']);
      var wa = destinationInfo({ asset_feed_spec: { link_urls: [{ website_url: 'https://api.whatsapp.com/send?phone=1' }], call_to_action_types: ['WHATSAPP_MESSAGE'] } });
      eq(wa.kind, 'whatsapp');
      eq(destinationInfo({}).url, '—');
      var small = 'https://x.fbcdn.net/a.jpg?stp=dst-jpg_s160x160_tt6&x=1', big = 'https://x.fbcdn.net/b.jpg?stp=c0.5000x0.5000f_dst-emg0_p1080x1080_q75';
      eq(metaImageUrl({ creative: { asset_feed_spec: { videos: [{ video_id: '1', thumbnail_url: small }] }, thumbnail_url: big } }), big);
      eq(metaImageUrl({ creative: { asset_feed_spec: { videos: [{ video_id: '1', thumbnail_url: small }] } } }), small);
      withLang('ar', function () { eq(landingText('https://www.shop.com/products/%D9%86%D8%B8%D8%A7%D8%B1%D8%A9/?utm_source=x'), 'shop.com/products/نظارة'); });
    });
    // حساب حقيقي ٢ نوفمبر ٢٠٢٦ (Coda): إعلان كتالوج Snapchat فضل بخلفية فاضية من غير أي كلام،
    // وSnapchat كانت بترجّع ٤٠٣ على كتالوجه بينما كتالوج تاني في نفس الحساب بيشتغل
    test('Snapchat: سبب غياب صور الكتالوج بيتقال بالظبط — والـ٤٠٣ العميل يقدر يصلّحه بنفسه', function () {
      eq(setNoteKey({ code: 'set', status: 403 }), 'x.snapSetNoAccess', 'مفيش صلاحية على الكتالوج');
      eq(setNoteKey({ code: 'set', status: 404 }), 'x.snapSetGone', 'المجموعة مبقتش موجودة');
      eq(setNoteKey({ code: 'set', status: 500 }), 'x.snapSetFailed');
      eq(setNoteKey({ code: 'search', status: null }), 'x.snapSetFailed');
      eq(setNoteKey({ code: 'net', status: null }), 'x.snapSetFailed');
      // مفيش خطأ = المجموعة فاضية فعلاً عند Snapchat، مش عطل عندنا
      eq(setNoteKey({ code: '', status: null }), 'x.snapSetEmpty');
      eq(setNoteKey(undefined), 'x.snapSetEmpty');
      // وكل مفتاح منهم ليه نص فعلاً في اللغتين
      ['x.snapSetNoAccess', 'x.snapSetGone', 'x.snapSetFailed', 'x.snapSetEmpty'].forEach(function (k) {
        withLang('ar', function () { ok(t(k) !== k && t(k).length > 20, 'عربي: ' + k); });
        withLang('en', function () { ok(t(k) !== k && t(k).length > 20, 'إنجليزي: ' + k); });
      });
    });
    // حساب حقيقي ٢ نوفمبر ٢٠٢٦ (Level Up): ٢٥ إعلان من ١٠١ كابشنهم كان اسم الإعلان، و٢٢ منهم نصهم موجود
    // في asset_feed_spec اللي مكناش بنطلبه. النص بييجي من ٤ أماكن مختلفة حسب نوع الإعلان
    test('Meta: نص الإعلان من كل مكان Meta بتحطه فيه (المختصر، والنسخ المتعددة، وspec)', function () {
      // ١) الإعلان العادي: Meta بتملا body/title
      eq(creativeText({ body: 'نص الإعلان', title: 'العنوان' }).text, 'نص الإعلان');
      // ٢) الإعلان المبني على منشور موجود: body فاضي والنص في asset_feed_spec — ده اللي كان ضايع
      var post = creativeText({ body: '', title: '', asset_feed_spec: { bodies: [{ text: 'نص من المنشور' }], titles: [{ text: 'عنوان من المنشور' }] } });
      eq([post.text, post.headline], ['نص من المنشور', 'عنوان من المنشور']);
      // ٣) من object_story_spec مباشرة (فيديو ورابط وكتالوج)
      eq(creativeText({ object_story_spec: { video_data: { message: 'نص فيديو', title: 'عنوان فيديو' } } }).text, 'نص فيديو');
      eq(creativeText({ object_story_spec: { link_data: { message: 'نص رابط', name: 'عنوان رابط', description: 'وصف' } } }).desc, 'وصف');
      eq(creativeText({ object_story_spec: { template_data: { message: 'نص كتالوج' } } }).text, 'نص كتالوج');
      // ٤) مفيش نص خالص = null (مش اسم الإعلان — اللي بيقرر العرض)
      eq(creativeText({}).text, null);
      eq(creativeText({ body: '   ', asset_feed_spec: { bodies: [{ text: '  ' }] } }).text, null, 'المسافات لوحدها مش نص');
      // الترتيب: المختصر بتاع Meta الأول لما يكون موجود
      eq(creativeText({ body: 'المختصر', asset_feed_spec: { bodies: [{ text: 'النسخة' }] } }).text, 'المختصر');
    });
    // الكتالوج بأزرار صيغ: إنستغرام الأول لو ليه حساب إنستغرام، وفيسبوك الأول لو مالوش. والصورة العادية من غير معاينة
    test('Meta: الكتالوج بأزرار صيغ (إنستغرام الأول لو ليه حساب إنستغرام)، والصورة العادية بالملف الأصلي', function () {
      var hadFB = 'FB' in window, prevFB = window.FB, asked = [];
      window.FB = { api: function (p, params, cb) { asked.push(params.ad_format || params.fields); cb({ data: [{ body: '<iframe src="https://business.facebook.com/ads/api/preview_iframe.php?d=1" width="320" height="560"></iframe>' }] }); } };
      try {
        withLang('ar', function () {
          var el = document.getElementById('expandPreview');
          showMedia({ id: 'PV2', platform: 'Meta', format: 'image', catalog: true, igPreview: false, themeClass: 'pv-t0' });
          eq(asked[0], 'MOBILE_FEED_STANDARD');
          showMedia({ id: 'PV4', platform: 'Meta', format: 'image', catalog: true, igPreview: true, themeClass: 'pv-t0' });
          eq(asked[1], 'INSTAGRAM_STANDARD', 'catalog: Instagram first');
          eq([].map.call(el.querySelectorAll('[data-pv]'), function (b) { return b.getAttribute('data-pv'); }), ['ig', 'reels', 'fb'], 'أزرار الصيغ للكتالوج بس');
          ok(/الكتالوج/.test(el.textContent), 'catalog note');
          asked = [];
          showMedia({ id: 'PV3', platform: 'Meta', format: 'image', thumbUrl: 'https://x.fbcdn.net/i.jpg', themeClass: 'pv-t0' });
          eq(asked, []);   // صورة عادية: الملف الأصلي من غير معاينة
        });
      } finally { if (hadFB) window.FB = prevFB; else delete window.FB; }
    });

    // ٣ نوفمبر ٢٠٢٦ (طلب صاحب المنتج): فيديو Meta عرض واحد بالصوت يشتغل لوحده، من غير تبويبات. المصادر بالترتيب — فحص حي
    // على ٣ حسابات (٣٠ فيديو): ملف الواجهة (٢ من ٣٠) ← مشغّل فيسبوك بواجهته (٢٧ من ٣٠) ← معاينة الإعلان (١ من ٣٠)
    function fakeFbVideo(opts) {
      var asked = [], subs = {}, parsed = [], player = { calls: [], unmute: function () { this.calls.push('unmute'); }, play: function () { this.calls.push('play'); } };
      var fb = {
        api: function (p, params, cb) {
          asked.push(params.ad_format || ('/' + p.split('/').pop() + '?' + params.fields));
          if (params.fields) { cb(opts.source ? { source: 'https://video.xx.fbcdn.net/v.mp4', picture: 'https://x.fbcdn.net/p.jpg' } : { error: { code: 10, message: 'Application does not have permission' } }); return; }
          cb(opts.preview ? { data: [{ body: '<iframe src="https://business.facebook.com/ads/api/preview_iframe.php?d=1" width="320" height="640"></iframe>' }] } : { error: { message: 'no' } });
        },
        Event: { subscribe: function (name, fn) { (subs[name] = subs[name] || []).push(fn); } },
        XFBML: { parse: function (el, done) {
          var div = el.querySelector('.fb-video');
          parsed.push({ id: div && div.id, href: div && div.getAttribute('data-href') });
          if (done) done();
          // المتاح بيطلّع ready، والمش متاح مبيطلّعهوش (اتقاس على الموقع)
          if (opts.ready && div) (subs['xfbml.ready'] || []).forEach(function (fn) { fn({ type: 'video', id: div.id, instance: player }); });
        } }
      };
      return { fb: fb, asked: asked, parsed: parsed, player: player };
    }
    testAsync('Meta: فيديو الصفحة بيتعرض بمشغّل فيسبوك بالصوت ولوحده (unmute ثم play)، من غير تبويبات', function () {
      var hadFB = 'FB' in window, prevFB = window.FB, f = fakeFbVideo({ source: false, ready: true });
      window.FB = f.fb;
      var restore = function () { if (hadFB) window.FB = prevFB; else delete window.FB; };
      try {
        var el = document.getElementById('expandPreview');
        showMedia({ id: 'MV1', platform: 'Meta', format: 'video', videoId: '1874225670131055', igPreview: true, themeClass: 'pv-t0' });
        eq(f.asked, ['/1874225670131055?source,picture'], 'الملف من الواجهة الأول');
        eq(f.parsed.length, 1, 'وبعده مشغّل فيسبوك');
        eq(f.parsed[0].href, 'https://www.facebook.com/video.php?v=1874225670131055', 'برقم الفيديو بس');
        eq(f.player.calls, ['unmute', 'play'], 'بالصوت ولوحده');
        eq(el.querySelectorAll('[data-pv]').length, 0, 'من غير تبويبات');
        restore();
      } catch (e) { restore(); throw e; }
      return Promise.resolve();
    });
    testAsync('Meta: فيديو مكتبة الحساب بيتعرض بملفه بمشغّل المتصفح، من غير مشغّل فيسبوك ولا تبويبات', function () {
      var hadFB = 'FB' in window, prevFB = window.FB, f = fakeFbVideo({ source: true });
      window.FB = f.fb;
      var restore = function () { if (hadFB) window.FB = prevFB; else delete window.FB; };
      try {
        var el = document.getElementById('expandPreview');
        showMedia({ id: 'MV2', platform: 'Meta', format: 'video', videoId: '4093503967451220', igPreview: true, themeClass: 'pv-t0' });
        var v = el.querySelector('video.real-video');
        ok(v && v.hasAttribute('controls'), 'مشغّل المتصفح بأزراره');
        eq(v.querySelector('source').getAttribute('src'), 'https://video.xx.fbcdn.net/v.mp4');
        eq(f.parsed.length, 0, 'مفيش مشغّل فيسبوك');
        eq(el.querySelectorAll('[data-pv]').length, 0, 'من غير تبويبات');
        restore();
      } catch (e) { restore(); throw e; }
      return Promise.resolve();
    });
    testAsync('Meta: فيديو مش متاح في المصدرين — بعد المهلة معاينة الإعلان لوحدها مع السبب، من غير تبويبات', function () {
      var hadFB = 'FB' in window, prevFB = window.FB, f = fakeFbVideo({ source: false, ready: false, preview: true });
      var oldWait = { render: FB_VIDEO_WAIT.render, ready: FB_VIDEO_WAIT.ready };
      window.FB = f.fb; FB_VIDEO_WAIT.render = 30; FB_VIDEO_WAIT.ready = 30;
      var restore = function () { if (hadFB) window.FB = prevFB; else delete window.FB; FB_VIDEO_WAIT.render = oldWait.render; FB_VIDEO_WAIT.ready = oldWait.ready; };
      var el = document.getElementById('expandPreview');
      withLang('ar', function () { showMedia({ id: 'MV3', platform: 'Meta', format: 'video', videoId: '9432564466762244', igPreview: true, themeClass: 'pv-t0' }); });
      return new Promise(function (r) { setTimeout(r, 120); }).then(function () {
        eq(f.parsed.length, 1, 'جرّب مشغّل فيسبوك الأول');
        eq(f.asked.slice(-1)[0], 'INSTAGRAM_REELS', 'وبعد المهلة المعاينة (الريلز الأول للإنستغرام)');
        ok(el.querySelector('.video-embed-wrap iframe'), 'المعاينة ظاهرة');
        ok(/لا تتيح فيسبوك تشغيل هذا الفيديو مباشرةً/.test(el.textContent), 'ومعاها السبب');
        eq(el.querySelectorAll('[data-pv]').length, 0, 'من غير تبويبات');
        restore();
      }, function (e) { restore(); throw e; });
    });
    test('Meta: رقم فيديو مش أرقام مبيدخلش الصفحة خالص — على طول معاينة الإعلان', function () {
      var hadFB = 'FB' in window, prevFB = window.FB, f = fakeFbVideo({ source: true, preview: true });
      window.FB = f.fb;
      try {
        var el = document.getElementById('expandPreview');
        showMedia({ id: 'MV4', platform: 'Meta', format: 'video', videoId: '1"><img src=x onerror=e()>', igPreview: false, themeClass: 'pv-t0' });
        eq(f.parsed.length, 0, 'مفيش مشغّل');
        ok(f.asked.every(function (a) { return a.indexOf('onerror') < 0; }), 'ولا طلب بيه');
        eq(el.querySelectorAll('img[src="x"]').length, 0, 'ولا عنصر اتحقن');
        eq(f.asked[0], 'MOBILE_FEED_STANDARD', 'معاينة فيسبوك الأول (مالوش إنستغرام)');
      } finally { if (hadFB) window.FB = prevFB; else delete window.FB; }
    });
    // معاينة Meta بتقول «Preview Not Available» لإعلانات الكتالوج — بنعرض منتجات الكتالوج نفسه (حساب حقيقي ١٠ أكتوبر ٢٠٢٦)
    test('Meta: إعلان الكتالوج بيعرض منتجات الكتالوج (صورة واسم وسعر ورابط)، ولو الطلب فشل أزرار معاينة Meta', function () {
      var hadFB = 'FB' in window, prevFB = window.FB, asked = [], products = true;
      window.FB = { api: function (p, params, cb) {
        asked.push(p);
        if (/\/products$/.test(p)) { cb(products ? { data: [{ id: '1', name: 'Willow | Black', image_url: 'https://cdn.shop.com/1.jpg', price: 'SAR329.00', url: 'https://shop.com/p/1' }, { id: '2', name: 'Max', price: '12 USD' }] } : { error: { message: 'no' } }); return; }
        cb({ data: [{ body: '<iframe src="https://business.facebook.com/ads/api/preview_iframe.php?d=1"></iframe>' }] });
      } };
      try {
        withLang('ar', function () {
          var el = document.getElementById('expandPreview');
          showMedia({ id: 'CG1', platform: 'Meta', format: 'image', catalog: true, productSetId: 'PS1', igPreview: true, themeClass: 'pv-t0' });
          eq(asked, ['/PS1/products']);
          eq(el.querySelectorAll('.cat-item').length, 2);
          ok(/٣٢٩/.test(el.textContent) && /ر\.س/.test(el.textContent) && /12 USD/.test(el.textContent), el.textContent);
          eq(el.querySelector('a.cat-item').getAttribute('href'), 'https://shop.com/p/1');
          products = false; asked = [];
          showMedia({ id: 'CG2', platform: 'Meta', format: 'image', catalog: true, productSetId: 'PS1', igPreview: true, themeClass: 'pv-t0' });
          eq(asked, ['/PS1/products', '/CG2/previews']);
          ok(el.querySelector('[data-pv="ig"].on'), 'falls back to preview tabs');
        });
      } finally { if (hadFB) window.FB = prevFB; else delete window.FB; }
    });
    // حساب حقيقي ١٠ و١١ أكتوبر ٢٠٢٦: مكتبة فيسبوك على شبكة بطيئة كانت بتسيب «تعذّر تحميل الحسابات» — مع المفتاح الطلب بيروح Graph على طول
    testAsync('Meta: مع مفتاح في الجلسة الطلب بيروح Graph API على طول من غير مكتبة فيسبوك (GET وPOST وخطأ الشبكة)', function () {
      var prevFetch = window.fetch, hadFB = 'FB' in window, prevFB = window.FB, prevTok = sessionTokens.meta, calls = [];
      window.FB = { api: function () { calls.push('SDK'); } };
      sessionTokens.meta = { token: 'TOK123', expiresAt: Date.now() + 3600000 };
      window.fetch = function (url, opts) {
        calls.push({ url: String(url), method: opts && opts.method, body: opts && opts.body });
        if (/fail/.test(url)) return Promise.reject(new Error('offline'));
        return Promise.resolve({ status: /bad/.test(url) ? 403 : 200, json: function () { return Promise.resolve(/bad/.test(url) ? { error: { code: 200, message: 'no' } } : { data: [1, 2] }); } });
      };
      var call = function (p, x, y) { return new Promise(function (res) { if (y) metaApi(p, x, y, res); else metaApi(p, x, res); }); };
      var restore = function () { window.fetch = prevFetch; if (prevTok) sessionTokens.meta = prevTok; else delete sessionTokens.meta; if (hadFB) window.FB = prevFB; else delete window.FB; };
      return Promise.all([
        call('/act_1/ads', { fields: 'id,name', filtering: [{ field: 'ad.id', operator: 'IN', value: ['9'] }] }),
        call('/', 'POST', { batch: '[]', include_headers: false }),
        call('/bad', {}),
        call('/fail', {})
      ]).then(function (r) {
        restore();
        eq(r[0].data, [1, 2]);
        eq([r[2].error.code, typeof r[3].error.message], [200, 'string']);
        ok(calls.indexOf('SDK') < 0, 'SDK not used');
        var get = calls[0], post = calls[1];
        ok(/^https:\/\/graph\.facebook\.com\/v\d+\.0\/act_1\/ads\?/.test(get.url) && /access_token=TOK123/.test(get.url) && /filtering=%5B%7B/.test(get.url) && !get.method, get.url);
        eq([post.method, /access_token=TOK123/.test(post.body), /include_headers=false/.test(post.body), /\?/.test(post.url)], ['POST', true, true, false]);
      }, function (e) { restore(); throw e; });
    });
    test('Meta: الطلب بيستنى مكتبة فيسبوك لو لسه متحمّلتش (شبكة بطيئة) بدل «FB is not defined»', function () {
      var hadFB = 'FB' in window, prevFB = window.FB, prevQ = fbReadyQueue, got = null;
      try {
        delete window.FB; fbReadyQueue = [];
        metaApi('/me', { fields: 'id' }, function (r) { got = r; });
        eq([fbReadyQueue.length, got], [1, null]);
        window.FB = { api: function (p, params, cb) { cb({ id: 'x' }); } };
        var q = fbReadyQueue; fbReadyQueue = null; q.forEach(function (f) { f(); });
        eq(got && got.id, 'x');
        // المكتبة مش موجودة والطابور خلص (اتمنعت): الطلب بيرجع بخطأ مش بيلف على نفسه
        delete window.FB; got = null;
        metaApi('/me', {}, function (r) { got = r; });
        ok(got && got.error, 'error back');
      } finally { fbReadyQueue = prevQ; if (hadFB) window.FB = prevFB; else delete window.FB; }
    });
    testAsync('Meta: تعديل ميزانية المجموعة الإعلانية من سجل الحساب بيوصل لإعلاناتها (التقييم بيستنى نتيجته)', function () {
      var hadFB = 'FB' in window, prevFB = window.FB;
      var restore = function () { if (hadFB) window.FB = prevFB; else delete window.FB; };
      var evs = [{ event_type: 'update_ad_set_budget', object_type: 'CAMPAIGN', object_id: 's1', object_name: 'S', event_time: todayKeyInTz('UTC') + 'T08:00:00+0000', actor_name: 'X',
        extra_data: JSON.stringify({ old_value: { type: 'payment_amount', currency: 'SAR', old_value: 10000 }, new_value: { type: 'payment_amount', currency: 'SAR', new_value: 30000, additional_value: 'Per day' }, type: 'composite_data' }) }];
      window.FB = fakeFB({ '/act/ads:ACTIVE': { data: [metaAd('E1', 'ACTIVE')] }, '/act/activities': { data: evs } });
      accountInfo['meta:act_11'] = { timeZone: 'UTC', currency: 'SAR' };
      loadAdsForAccount('act_11');
      var find = function () { return candidates.filter(function (x) { return x.id === 'E1'; })[0]; };
      var settle = function (n) { return sleep(40).then(function () { var c = find(); return (!c || !c.edits) && n > 0 ? settle(n - 1) : c; }); };
      return settle(50).then(function (c) {
        restore();
        eq([c.adsetId, c.edits && c.edits[0].kind, c.edits && c.edits[0].level, c.edits && c.edits[0].to], ['s1', 'budget', 'adset', 30000]);
      }, function (e) { restore(); throw e; });
    });

    test('Meta: الفيديو في asset_feed_spec أو video_data بيتعرف إنه فيديو (مش صورة)', function () {
      var days = DAYS;
      var feed = transformRealAd(metaAd('V1', 'ACTIVE', { creative: { asset_feed_spec: { videos: [{ video_id: '555', thumbnail_url: 'https://example.com/v.jpg' }] } } }), [], {}, days, null, 'SAR', null, null);
      eq([feed.format, feed.videoId, feed.thumbUrl], ['video', '555', 'https://example.com/v.jpg']);
      var story = transformRealAd(metaAd('V2', 'ACTIVE', { creative: { object_story_spec: { video_data: { video_id: '777', image_url: 'https://example.com/i.jpg' } } } }), [], {}, days, null, 'SAR', null, null);
      eq([story.format, story.videoId], ['video', '777']);
      var img = transformRealAd(metaAd('I1', 'ACTIVE', { creative: { image_url: 'https://example.com/a.jpg' } }), [], {}, days, null, 'SAR', null, null);
      eq(img.format, 'image');
    });

    test('رقم «النتائج»: أنواع نتائج من غير أي نشاط في الفترة متظهرش («٠ نتائج» و«+٤ أخرى»)', function () {
      var buy = ad('b1', { daily: steady(50), res: steady(2), key: 'purchase' });
      var idle = ad('i1', { daily: steady(0), res: steady(0), key: 'lead', active: false });
      var idle2 = ad('i2', { daily: steady(0), res: steady(0), active: false });
      idle2.resultKey = null;
      candidates = [buy, idle, idle2];
      render();
      eq(document.querySelectorAll('#kpiStrip .kpi-value')[1].textContent, ar(14) + ' ' + I18N.resultNoun(14, 'purchase'));
    });

    test('العربي في جمل التنبيهات: «عملية شراء واحدة» و«عمليتي شراء» و«ضعف» (مش «١ عملية شراء» و«٢ أضعاف»)', function () {
      withLang('ar', function () {
        eq(I18N.countPhrase(1, 'purchase', ar), 'عملية شراء واحدة');
        eq(I18N.countPhrase(2, 'lead', ar), 'عميلين محتملين');
        eq(I18N.countPhrase(5, 'purchase', ar), ar(5) + ' ' + I18N.resultNoun(5, 'purchase'));
        eq(I18N.timesPhrase(2, numAr), 'ضعف');
        eq(I18N.timesPhrase(3, numAr), ar(3) + ' أضعاف');
        eq(I18N.timesPhrase(2.6, numAr), numAr(2.6) + ' ضعف');
        // المتوقع عملية شراء واحدة (متوسط الحساب ٢٠، واتصرف ٢٥): بين تكلفة الطلب وضعفها = «مهم» (الحكم بحدودك — ٢٥ أكتوبر)، وجملة
        // المرجع «كان يكفي… لنحو عملية شراء واحدة»
        var ads = baseAccount().concat([ad('w1', { daily: [0, 0, 0, 0, 12, 13, 0], res: steady(0), key: 'purchase' })]);
        var b = engine(ads).byAd.w1;
        var wi = b.issues.filter(function (i) { return /waste/.test(i.code || '') && i.level === 'warning'; })[0];
        ok(wi && wi.detail.indexOf('لنحو عملية شراء واحدة') > -1 && wi.detail.indexOf('١ عملية') === -1, 'reads «عملية شراء واحدة»: ' + (wi ? wi.detail : b.basis));
      });
      withLang('en', function () { eq(I18N.countPhrase(2, 'purchase', String), '2 purchases'); eq(I18N.timesPhrase(2.6, String), '2.6×'); });
    });

    test('أسماء الإعلانات الإنجليزي في الواجهة العربي: الاسم بيتقص من آخره مش من أوله (dir=auto)', function () {
      candidates = [ad('n1', { daily: steady(5), res: steady(1) })];
      render();
      eq(document.querySelector('#cardGrid .card-name').getAttribute('dir'), 'auto');
      eq(document.getElementById('expandTitle').getAttribute('dir'), 'auto');
    });

    test('عنوان تنبيه الإنفاق دون نتائج بيقول الفترة (آخر يومين)', function () {
      withLang('ar', function () { ok(/آخر يومين/.test(t('al.waste.t')) && /آخر يومين/.test(t('al.wasteEarly.t'))); });
    });
  });

  // =====================================================================
  // ملخص المتجر (js/diagnosis.js) — أكتر حتة حساسة: تشخيص غلط واحد بيخلّي العميل يشك في الأداة كلها.
  // الاختبارات هنا على ٣ مستويات: الحسابات نفسها، المحاكاة (حسابات بأرقام عشوائية بـ seed ثابت فيها
  // مشكلة معروفة أو مفيهاش خالص)، والنص (مفيش مفتاح ناقص ولا {متغيّر} ظاهر في اللغتين).
  // المحاكاة الكاملة (مئات الحسابات) اتعملت وقت المعايرة — هنا عيّنة ثابتة سريعة بحدود فيها هامش.
  // =====================================================================
  describe('ملخص المتجر — الحسابات', function () {
    var X = DX._;
    test('الدالة البيتا غير الكاملة ومقلوب التوزيع الطبيعي', function () {
      ok(Math.abs(X.betai(2, 3, 0.5) - 0.6875) < 1e-9, 'I_0.5(2,3) = 11/16');
      ok(Math.abs(X.normInv(0.975) - 1.959964) < 1e-4, 'z(0.975)');
    });
    test('مقارنة معدّلين: مفيش تغيّر ← z قريب من صفر، وتغيّر كبير ← z كبير بالإشارة الصح', function () {
      ok(Math.abs(X.rateTest(50, 100, 50, 100, 1).z) < 0.3);
      ok(X.rateTest(100, 100, 40, 100, 1).z < -3, 'drop');
      ok(X.rateTest(40, 100, 100, 100, 1).z > 3, 'rise');
      // طلب واحد بدل ٢٥ متوقع: الاختبار «الشرطي» لازم يشوفه قوي (التقريب الطبيعي كان بيضعفه)
      ok(X.rateTest(302, 10646, 1, 895, 1.5).z < -4, 'tiny counts');
    });
    test('التشتت الأكبر بيخلّي الحكم أحوط', function () {
      ok(Math.abs(X.rateTest(100, 100, 70, 100, 3).z) < Math.abs(X.rateTest(100, 100, 70, 100, 1).z));
    });
    test('توزيع تغيّر تكلفة الطلب على المراحل مجموعه بالظبط = تغيّر تكلفة الطلب', function () {
      var a = { spend: 1975, imp: 75741, clicks: 656, atc: 149, ic: 91, pur: 33 };
      var b = { spend: 2794, imp: 100978, clicks: 1084, atc: 309, ic: 209, pur: 99 };
      var d = X.decompose(X.stagesFor({ imp: true, clicks: true, atc: true, ic: true, pur: true }), a, b);
      var sum = d.parts.reduce(function (s, p) { return s + p.contrib; }, 0);
      ok(Math.abs(sum - Math.log((b.spend / b.pur) / (a.spend / a.pur))) < 1e-9, 'identity');
    });
    test('مرحلة مش متسجلة بتتدمج في اللي بعدها', function () {
      eq(X.stagesFor({ imp: true, clicks: true, atc: false, ic: true, pur: true }).map(function (s) { return s.id; }), ['reach', 'ctr', 'checkout', 'pay']);
      // «إضافة للسلة» أقل من الشراء نفسه = الحدث مش متركّب صح
      eq(X.trackingOf({ pur: 50, atc: 20, ic: 60, imp: 1, clicks: 1 }).atc, false);
    });
    // من ٣ نوفمبر ٢٠٢٦ «الفترة السابقة» زي المنصات (طلب صاحب المنتج): يوم باليوم اللي قبله — مش نفس اليوم من الأسبوع اللي فات —
    // وشهر بالشهر اللي قبله حتى لو أيامه مختلفة، وهذا الشهر بنفس أيامه من الشهر اللي قبله (Shopify)
    test('الفترات: يوم باليوم اللي قبله، وأسبوع بالأسبوع اللي قبله، وشهر بالشهر اللي قبله، وفترة مقارنة مختارة', function () {
      var w = DX.windows('2026-09-21', '2026-09-27');
      eq([w[1].since, w[1].until], ['2026-09-14', '2026-09-20']);
      var d = DX.windows('2026-09-27', '2026-09-27');
      eq([d[1].since, d[1].until, d[2].since], ['2026-09-26', '2026-09-26', '2026-09-25'], 'yesterday vs the day before');
      // الشهر الماضي (٣١ يوم) ↔ سبتمبر (٣٠) ↔ أغسطس (٣١)
      var m = DX.windows('2026-10-01', '2026-10-31', { unit: 'month' });
      eq(m.slice(0, 3).map(function (x) { return x.since + '..' + x.until + ':' + x.days; }), ['2026-10-01..2026-10-31:31', '2026-09-01..2026-09-30:30', '2026-08-01..2026-08-31:31']);
      // هذا الشهر لحد أمس ↔ نفس الأيام من الشهر اللي قبله، ولو أقصر بنقف عند آخره
      var t2 = DX.windows('2026-11-01', '2026-11-02', { unit: 'mtd' });
      eq([t2[1].since, t2[1].until, t2[2].since, t2[2].until], ['2026-10-01', '2026-10-02', '2026-09-01', '2026-09-02']);
      eq(DX.windows('2026-03-01', '2026-03-30', { unit: 'mtd' })[1].until, '2026-02-28', 'February is shorter');
      // فترة مقارنة مختارة: هي بالظبط، واللي قبلها بطولها هي
      var c = DX.windows('2026-10-27', '2026-11-02', { cmp: { since: '2026-10-01', until: '2026-10-05' } });
      eq([c[1].since, c[1].until, c[1].days, c[2].since, c[2].until], ['2026-10-01', '2026-10-05', 5, '2026-09-26', '2026-09-30']);
      eq(DX.compareWindow('2026-10-27', '2026-11-02', { cmp: { since: '2026-10-01', until: '2026-10-05' } }), { since: '2026-10-01', until: '2026-10-05' });
      // أي فترة: حتى لو متداخلة مع الفترة أو بعدها (طلب صاحب المنتج: «تخصيص اي فترة»، وMeta بتسمح بالتداخل)
      eq(DX.windows('2026-10-27', '2026-11-02', { cmp: { since: '2026-10-30', until: '2026-11-05' } })[1].since, '2026-10-30', 'overlap is allowed');
      eq(DX.windows('2026-10-01', '2026-10-07', { cmp: { since: '2026-10-20', until: '2026-10-26' } })[1].since, '2026-10-20', 'so is a later period');
      // عدد الفترات بطول أطولهم: حد الطلب اليومي عند السيرفر ٥٠٠ يوم
      var far = DX.windows('2026-11-03', '2026-11-03', { cmp: { since: '2026-05-01', until: '2026-08-01' } });
      eq(far.length, 5, 'by the longest of the two');
      ok(DX.spans(far).reduce(function (n, s) { return n + keyDiffDays(s.since, s.until) + 1; }, 0) <= 500, 'inside the server limit');
      // المدى اليومي: واحد لو الفترات قريبة، واتنين لو المقارنة بعيدة
      eq(DX.spans(DX.windows('2026-10-27', '2026-11-02')).length, 1);
      eq(DX.spans(DX.windows('2026-11-01', '2026-11-07', { unit: 'mtd' })).length, 1, 'the same days of past months stay one range');
      var yr = DX.spans(DX.windows('2026-10-08', '2026-11-06', { cmp: { since: '2025-10-08', until: '2025-11-06' } }));
      eq(yr.length, 2, 'a year away');
      eq([yr[1].since, yr[1].until, yr[0].until], ['2026-10-08', '2026-11-06', '2025-11-06']);
      // فترة جوه فترة: المدى بيفضل لآخر الأكبر
      eq(DX.spans(DX.windows('2026-11-01', '2026-11-30', { cmp: { since: '2026-11-05', until: '2026-11-07' } })).slice(-1)[0].until, '2026-11-30', 'a period inside a period');
    });
    test('الملخص بالبريد: الفترة السابقة مباشرةً — والمعامل القديم (المُشغّل) بنفس المعنى', function () {
      var w = DX.windows('2026-09-27', '2026-09-29', true);
      eq([w[1].since, w[1].until], ['2026-09-24', '2026-09-26']);
      eq(DX.windows('2026-09-27', '2026-09-29')[1].since, '2026-09-24');
      var days = [];
      for (var k = '2026-08-20'; k <= '2026-09-29'; k = shiftKey(k, 1)) days.push({ date: k, spend: 100, imp: 5000, clicks: 100, atc: 20, ic: 10, pur: 5, rev: 500 });
      var r = DX.analyze({ since: '2026-09-27', until: '2026-09-29', consecutive: true, daily: days, dims: [] });
      eq([r.prevSince, r.prevUntil], ['2026-09-24', '2026-09-26']);
      withLang('ar', function () { ok(/اكتفينا بعرض الأرقام/.test(t('dx.insufficient.mail')) && !/اختر فترة/.test(t('dx.insufficient.mail'))); });
    });
    // ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦: «تكررت في حسابك من قبل» كانت بتقلّل من انخفاض مقلق — اتشالت، والفرق الكبير «يستحق المراجعة»
    // من ٢٥ أكتوبر «لماذا تغيّرت مبيعاتك؟» بالتفكيك (diagnosis.js reshapeVerdict): السطر بيقول إن الانخفاض كله من متوسط قيمة الطلب،
    // و«يستحق المراجعة» في العنوان بس
    test('المبيعات اتغيّرت كتير والطلبات وتكلفتها مش متغيّرة: الانخفاض كله من متوسط قيمة الطلب بالفلوس، و«يستحق المراجعة» في العنوان (حالة حقيقية)', function () {
      var mk = function (revFor) {
        var d = [];
        for (var k = '2026-08-20'; k <= '2026-09-29'; k = shiftKey(k, 1)) d.push({ date: k, spend: 100, imp: 5000, clicks: 100, atc: 20, ic: 10, pur: 5, rev: revFor(k) });
        return d;
      };
      var lines = function (o) { return o.blocks.map(function (b) { return (b.lines || []).join(' '); }).join(' '); };
      withLang('ar', function () {
        var o1 = DX.compose(DX.analyze({ since: '2026-09-27', until: '2026-09-29', consecutive: true, currency: 'USD',
          daily: mk(function (k) { return k >= '2026-09-27' ? 200 : 500; }), dims: [] }), { mail: true }), rare = lines(o1);
        ok(/انخفضت المبيعات ٩٠٠ \$ \(٦٠٪\): نحو ٩٠٠ \$ لأن متوسط قيمة الطلب نزل من ١٠٠ \$ إلى ٤٠ \$/.test(rare) && !/الإنفاق|تكلفة الطلب/.test(rare), rare);
        ok(/يستحق المراجعة/.test(o1.title) && o1.tone === 'mixed', o1.title);
        var seen = lines(DX.compose(DX.analyze({ since: '2026-09-27', until: '2026-09-29', consecutive: true, currency: 'USD',
          daily: mk(function (k) { return k >= '2026-09-27' || (k >= '2026-09-21' && k <= '2026-09-23') ? 200 : 500; }), dims: [] }), { mail: true }));
        ok(!/تكررت/.test(seen) && /متوسط قيمة الطلب نزل/.test(seen), seen);
        var flat = lines(DX.compose(DX.analyze({ since: '2026-09-27', until: '2026-09-29', consecutive: true, currency: 'USD',
          daily: mk(function () { return 500; }), dims: [] }), { mail: true }));
        ok(!/المبيعات/.test(flat), 'no line when sales barely moved: ' + flat);
      });
    });
    // جدول مقاس من منتقي Meta نفسه يوم ٧ نوفمبر ٢٠٢٦ (السبت، الأسبوع بيبدأ الأحد). أي اختلاف هنا = الأداة بقت غير المنصة
    test('الفترات والمقارنة زي Meta بالظبط: جدول مقاس حي', function () {
      var realToday = window.todayKeyInTz, keepP = period, keepC = compare;
      window.todayKeyInTz = function () { return '2026-11-07'; };
      var row = function (preset, cm) {
        period = { preset: preset };
        var p = dxPeriodFor('Africa/Cairo', null, cm), w = DX.compareWindow(p.since, p.until, { unit: p.unit, cmp: p.cmp });
        return [p.since, p.until, w.since, w.until].join(' ');
      };
      try {
        // «الفترة السابقة»: نفس الطول قبلها مباشرةً
        var prev = { mode: 'period' };
        eq(row('today', prev), '2026-11-07 2026-11-07 2026-11-06 2026-11-06', 'today vs all of yesterday');
        eq(row('yesterday', prev), '2026-11-06 2026-11-06 2026-11-05 2026-11-05');
        eq(row('todayYesterday', prev), '2026-11-06 2026-11-07 2026-11-04 2026-11-05');
        eq(row('last7', prev), '2026-10-31 2026-11-06 2026-10-24 2026-10-30');
        eq(row('last14', prev), '2026-10-24 2026-11-06 2026-10-10 2026-10-23');
        eq(row('last28', prev), '2026-10-10 2026-11-06 2026-09-12 2026-10-09');
        eq(row('last30', prev), '2026-10-08 2026-11-06 2026-09-08 2026-10-07');
        eq(row('thisWeek', prev), '2026-11-01 2026-11-07 2026-10-25 2026-10-31');
        eq(row('lastWeek', prev), '2026-10-25 2026-10-31 2026-10-18 2026-10-24');
        eq(row('thisMonth', prev), '2026-11-01 2026-11-07 2026-10-25 2026-10-31');
        eq(row('lastMonth', prev), '2026-10-01 2026-10-31 2026-08-31 2026-09-30');
        // «الشهر السابق»: الفترة نفسها قبل شهر
        var mon = { mode: 'month' };
        eq(row('lastMonth', mon), '2026-10-01 2026-10-31 2026-09-01 2026-09-30', 'a whole month, 31 vs 30');
        eq(row('thisMonth', mon), '2026-11-01 2026-11-07 2026-10-01 2026-10-07');
        eq(row('last7', mon), '2026-10-31 2026-11-06 2026-09-30 2026-10-06');
        eq(row('today', mon), '2026-11-07 2026-11-07 2026-10-07 2026-10-07');
        eq(row('last30', mon), '2026-10-08 2026-11-06 2026-09-08 2026-10-06', 'a different length, like Meta');
        // «السنة السابقة»
        eq(row('last30', { mode: 'year' }), '2026-10-08 2026-11-06 2025-10-08 2025-11-06');
        // في سنتين مختلفتين السنة بتبان، وفي سنة واحدة لأ
        withLang('ar', function () {
          eq(fmtCompared('2026-10-08', '2026-11-06', { since: '2025-10-08', until: '2025-11-06' }), fmtRange('2026-10-08', '2026-11-06') + ' ٢٠٢٦');
          eq(fmtCompared('2026-10-08', '2026-11-06', { since: '2026-09-08', until: '2026-10-07' }), fmtRange('2026-10-08', '2026-11-06'));
          ok(fmtCompared('2027-01-01', '2027-01-07', { since: '2026-12-25', until: '2026-12-31' }).indexOf('٢٠٢٧') > -1, 'across new year');
        });
        // الافتراضي بوحدة الفترة (طلب صاحب المنتج ٣ نوفمبر): الشهر بالشهر والأسبوع بالأسبوع
        var auto = { mode: 'prev' };
        eq(row('lastMonth', auto), '2026-10-01 2026-10-31 2026-09-01 2026-09-30');
        eq(row('thisMonth', auto), '2026-11-01 2026-11-07 2026-10-01 2026-10-07');
        eq(row('thisWeek', auto), '2026-11-01 2026-11-07 2026-10-25 2026-10-31');
        eq(row('today', auto), '2026-11-07 2026-11-07 2026-11-06 2026-11-06', 'today vs all of yesterday by default');
        // مخصصة: أي فترة، مع اليوم كمان
        eq(row('today', { mode: 'custom', since: '2026-10-01', until: '2026-11-07' }), '2026-11-07 2026-11-07 2026-10-01 2026-11-07');
        // ٣١ مارس قبل شهر = آخر فبراير (زي ٣١ أكتوبر ← ٣٠ سبتمبر)
        eq(shiftMonths('2026-03-31', -1), '2026-02-28');
        eq(shiftMonths('2024-02-29', -12), '2023-02-28');
        eq(shiftMonths('2026-01-15', -1), '2025-12-15');
        // منتصف الأسبوع: هذا الأسبوع ↔ نفس أيام الأسبوع اللي فات
        window.todayKeyInTz = function () { return '2026-11-03'; };
        eq(row('thisWeek', auto), '2026-11-01 2026-11-03 2026-10-25 2026-10-27');
        // أول يوم في الشهر: «هذا الشهر» يوم واحد، والمقارنة نفس اليوم من الشهر اللي فات
        window.todayKeyInTz = function () { return '2026-11-01'; };
        eq(row('thisMonth', auto), '2026-11-01 2026-11-01 2026-10-01 2026-10-01');
      } finally { window.todayKeyInTz = realToday; period = keepP; compare = keepC; }
    });
    testAsync('الفترات عند السيرفر (Snapchat وGoogle وTikTok) هي هي عند المتصفح', function () {
      return import('/api/_dates.js').then(function (m) {
        var keepP = period, tz = 'Asia/Riyadh';
        try {
          ['today', 'yesterday', 'todayYesterday', 'last7', 'last14', 'last28', 'last30', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth'].forEach(function (preset) {
            var a = resolvePeriodFor(tz, { preset: preset }), b = m.resolvePeriod({ preset: preset }, tz);
            eq([b.preset, b.since, b.until], [a.preset, a.since, a.until], preset);
          });
        } finally { period = keepP; }
      });
    });
    test('فترة الملخص هي الفترة المختارة نفسها، وtoday بيقول للمحرك إن النهارده لسه مخلصش', function () {
      var today = todayKeyInTz('Asia/Riyadh');
      period = { preset: 'last7' };
      var p = dxPeriodFor('Asia/Riyadh');
      eq(p.until, shiftKey(today, -1)); eq(keyDiffDays(p.since, p.until), 6);
      eq(p.today, today);
      period = { preset: 'today' };
      p = dxPeriodFor('Asia/Riyadh');
      eq([p.since, p.until, p.unit, p.cmp], [today, today, null, null]);
      eq(dxCompareKey(p), 'prev', 'no hour in the key: the summary is not fetched again every hour');
      period = { preset: 'custom', since: shiftKey(today, -3), until: today };
      eq(dxPeriodFor('Asia/Riyadh').until, today, 'a custom period keeps today, like the platforms');
      period = { preset: 'last7' };
    });
    // قرار صاحب المنتج ٧ نوفمبر ٢٠٢٦: «اليوم حتى الآن» قصاد أمس كامل زي المنصات. الأرقام حقائق، ومفيش حكم قبل ما اليوم يكتمل
    test('اليوم حتى الآن قصاد أمس كامل: الأرقام زي ما هي، ومفيش حكم ولا ألوان قبل ما يكتمل', function () {
      var D = '2026-11-03', days = [];
      for (var i = 40; i >= 1; i--) days.push({ date: shiftKey(D, -i), spend: 100, imp: 5000, clicks: 100, atc: 20, ic: 10, pur: 6, rev: 600 });
      var input = function (spend, pur, clicks) { return { since: D, until: D, today: D, currency: 'USD', dims: [], daily: days.concat([{ date: D, spend: spend, imp: 400, clicks: clicks, atc: 3, ic: 2, pur: pur, rev: pur * 100 }]) }; };
      var r = DX.analyze(input(30, 2, 30));
      eq([r.status, r.prevSince, r.prevUntil, r.prev.spend, r.prev.pur, r.cur.spend, r.cur.pur], ['open', '2026-11-02', '2026-11-02', 100, 6, 30, 2], 'real figures on both sides');
      eq(r.lens, { cur: 1, prev: 1, diff: false, open: true, prevOpen: false, uneven: true });
      withLang('ar', function () {
        var o = DX.compose(r);
        eq(o.title, 'طلبات أقل حتى الآن، واليوم لم يكتمل بعد');
        eq([o.tone, o.blocks.length, o.main], ['neutral', 0, -1]);
        eq(o.period, t('dx.compareOpen', { cur: fmtKey(D), prev: fmtKey('2026-11-02') }));
        ok(o.kpiNote === t('dx.lenNote.today', { prev: fmtKey('2026-11-02') }), o.kpiNote);
        eq(o.kpis.map(function (k) { return k.prev; }).slice(0, 2), ['١٠٠ $', '٦'], 'yesterday as it was');
        eq(o.kpis.map(function (k) { return k.goodUp; }), [null, null, null, null, null, null], 'no colour before the day ends');
        eq(o.kpis.map(function (k) { return k.sig; }), [0, 0, 0, 0, 0, 0]);
        ok(!/tone|good|bad/.test(o.kpis.map(dxKpiHtml).join('').replace(/dx-kpi-pct"/g, '')), 'no coloured change');
        ok(DX.toText(o).indexOf(o.kpiNote) > -1, 'in the copied text too');
        eq(DX.compose(DX.analyze(input(150, 9, 150))).title, 'طلبات أكثر حتى الآن، واليوم لم يكتمل بعد');
        eq(DX.compose(DX.analyze(input(100, 6, 100))).title, 'عدد الطلبات قريب من فترة المقارنة حتى الآن، واليوم لم يكتمل بعد');
      });
      withLang('en', function () { eq(DX.compose(r).title, 'Fewer orders so far, and today isn\'t over yet'); });
      // قليل الطلبات: نفس الجملة، مش «البيانات لا تكفي»
      var few = days.map(function (d) { return Object.assign({}, d, { pur: 1 }); });
      eq(DX.analyze(Object.assign(input(5, 0, 5), { daily: few.concat([{ date: D, spend: 5, imp: 50, clicks: 5, pur: 0 }]) })).status, 'open');
      // فترة المقارنة هي اللي فيها النهارده
      var pv = DX.analyze({ since: '2026-10-20', until: '2026-10-26', cmp: { since: '2026-10-28', until: D }, today: D, currency: 'USD', dims: [], daily: days.concat([{ date: D, spend: 100, imp: 5000, clicks: 100, atc: 20, ic: 10, pur: 6, rev: 600 }]) });
      eq([pv.status, pv.lens.prevOpen, pv.lens.open, pv.lens.uneven], ['ok', true, false, true]);
      withLang('ar', function () {
        var o = DX.compose(pv);
        eq(o.title, 'عدد الطلبات قريب من فترة المقارنة، وفترة المقارنة تشمل اليوم ولم يكتمل بعد');
        eq(o.kpiNote, t('dx.lenNote.prevOpen'));
      });
      // العطل مبيستناش: إنفاق كبير من غير ولا طلب محسوب من الإنفاق نفسه
      var z = DX.analyze(input(300, 0, 300));
      eq([z.status, z.zeroRuns.length, z.zeroRuns[0].now], ['open', 1, true]);
      withLang('ar', function () {
        var oz = DX.compose(z);
        eq([oz.blocks.length, oz.blocks[0].kind, oz.title], [1, 'urgent', 'طلبات أقل حتى الآن، واليوم لم يكتمل بعد']);
      });
      // من غير today (البريد): يوم عادي مكتمل
      var mail = DX.analyze({ since: '2026-11-02', until: '2026-11-02', daily: days, dims: [] });
      eq([mail.status, mail.lens.open, mail.lens.uneven], ['ok', false, false]);
    });
    test('«اليوم» في كل المنصات: عطل منصة واحدة بيظهر حتى لو المنصة التانية بتبيع عادي', function () {
      var D = '2026-11-03', mk = function (todayPur) {
        var d = [];
        for (var i = 20; i >= 1; i--) d.push({ date: shiftKey(D, -i), spend: 100, imp: 5000, clicks: 100, atc: 20, ic: 10, pur: 6, rev: 600 });
        d.push({ date: D, spend: 300, imp: 15000, clicks: 300, atc: 60, ic: 30, pur: todayPur, rev: todayPur * 100 });
        return { since: D, until: D, today: D, currency: 'USD', timezone: 'Asia/Riyadh', daily: d, dims: [] };
      };
      var a = mk(18), b = mk(0);
      var list = [{ platform: 'meta', input: a }, { platform: 'snapchat', input: b }];
      var reps = [{ platform: 'meta', report: DX.analyze(a) }, { platform: 'snapchat', report: DX.analyze(b) }];
      var merged = DX.analyze(DX.combine(list));
      eq([merged.status, merged.zeroRuns.length, reps[1].report.zeroRuns.length], ['open', 0, 1], 'hidden by the other platform');
      var r = DX.attachPlatforms(merged, reps);
      eq(r.zeroRuns.map(function (z) { return z.platform; }), ['snapchat']);
      withLang('ar', function () {
        var o = DX.compose(r);
        eq([o.blocks.length, o.blocks[0].kind], [1, 'urgent']);
        ok(o.blocks[0].title.indexOf('Snapchat') > -1, o.blocks[0].title);
      });
    });
    test('«اليوم» في الواجهة: الأرقام وسطرها، ومن غير صندوق حكم — وسطر «اليوم حتى الآن» بس لو الفترة مش فيها النهارده', function () {
      var D = todayKeyInTz(BROWSER_TZ), days = [], keep = period;
      for (var i = 40; i >= 1; i--) days.push({ date: shiftKey(D, -i), spend: 100, imp: 5000, clicks: 100, atc: 20, ic: 10, pur: 6, rev: 600 });
      days.push({ date: D, spend: 30, imp: 400, clicks: 30, atc: 3, ic: 2, pur: 2, rev: 200 });
      var r = DX.analyze({ since: D, until: D, today: D, currency: 'USD', daily: days, dims: [] });
      try {
        DX_ON = true; activeSources.meta = 'act_1'; period = { preset: 'today' };
        candidates = [ad('op1', { daily: steady(10), res: steady(1) })];
        dxState = { status: 'ready', key: 'k', report: r, account: 'Store', accountId: 'meta:act_1', sources: {} };
        withLang('ar', function () {
          renderDiagnosis();
          var o = dxState.composed, head = document.querySelector('#storeSec .dx-head');
          eq(document.querySelector('#storeSec .dx-headline').textContent, 'طلبات أقل حتى الآن، واليوم لم يكتمل بعد');
          ok(head.textContent.indexOf(o.kpiNote) > -1, 'the note under the numbers');
          eq(document.querySelectorAll('#storeSec .dx-kpi').length, 6, 'all six numbers');
          eq(document.querySelectorAll('#storeSec .dx-kpi-pct.good, #storeSec .dx-kpi-pct.bad').length, 0, 'no colours');
          eq(document.getElementById('dxPeriod').textContent, o.period, 'no «complete days» label');
          ok(document.getElementById('dxToday').textContent.indexOf('لا يدخل في المقارنة') < 0, 'today is the period itself');
          // «أيام مكتملة» جنب الفترة بس لو الفترتين كده: فترة مقارنة فيها النهارده مش مكتملة
          period = { preset: 'last7' };
          var lp = resolvePeriodFor(BROWSER_TZ);
          dxState.report = DX.analyze({ since: lp.since, until: lp.until, today: D, currency: 'USD', daily: days, dims: [] });
          renderDiagnosis();
          ok(document.getElementById('dxPeriod').textContent.indexOf(t('dx.fullDays')) > -1, 'complete days on both sides');
          dxState.report = DX.analyze({ since: lp.since, until: lp.until, cmp: { since: shiftKey(D, -3), until: D }, today: D, currency: 'USD', daily: days, dims: [] });
          renderDiagnosis();
          ok(document.getElementById('dxPeriod').textContent.indexOf(t('dx.fullDays')) < 0, 'the comparison includes today');
          ok(document.getElementById('dxToday').textContent.indexOf('ضمن فترة المقارنة') > -1 && document.getElementById('dxToday').textContent.indexOf('لا يدخل في المقارنة') < 0, 'today is inside the comparison: ' + document.getElementById('dxToday').textContent);
          eq(resultTexts({ message: 1 }), ['محادثة واحدة'], 'not «١ محادثة»');
          eq(resultTexts({ message: 12 }), ['١٢ محادثة']);
          // فترة مش فيها النهارده: سطره لوحده زي الأول، و«هذا الشهر» فيه النهارده فمبيظهرش
          period = { preset: 'last7' };
          ok(storeLines(['meta']).some(function (l) { return l.today; }), 'last 7 days: today on its own line');
          period = { preset: 'thisMonth' };
          ok(!storeLines(['meta']).some(function (l) { return l.today; }), 'this month already includes today');
          period = { preset: 'thisWeek' };
          ok(!storeLines(['meta']).some(function (l) { return l.today; }), 'this week too');
        });
      } finally {
        period = keep; candidates = []; DX_ON = false; dxReset(); delete activeSources.meta; document.getElementById('storeSec').hidden = true;
      }
    });
    test('عبارات الفترات الجديدة في أحكام الإعلانات', function () {
      var keep = period, today = todayKeyInTz(BROWSER_TZ), sunday = weekStartKey(today) === today;
      try {
        withLang('ar', function () {
          var o = function (p) { period = p; return periodEngineOpts(); };
          eq(o({ preset: 'todayYesterday' }).phrase, 'خلال اليوم وأمس');
          eq(o({ preset: 'thisWeek' }).phrase, sunday ? t('wd.today') : 'خلال هذا الأسبوع');
          eq(o({ preset: 'lastWeek' }).phrase, 'خلال الأسبوع الماضي');
          eq(o({ preset: 'last28' }).phrase, 'خلال آخر ٢٨ يوماً');
          eq(o({ preset: 'custom', since: today, until: today }).phrase, t('wd.today'), 'a custom today is today');
          eq(o({ preset: 'thisMonth' }).recent, false, 'ends today, so the yesterday rules are off');
        });
      } finally { period = keep; }
    });
    test('فترة فيها النهارده وأيام مكتملة (هذا الشهر): المجاميع من غير حكم، والنسب بتتحكم عليها', function () {
      var D = '2026-11-03', days = [];
      for (var k = '2026-08-01'; k <= D; k = shiftKey(k, 1)) days.push({ date: k, spend: 100, imp: 5000, clicks: 100, atc: 20, ic: 10, pur: 6, rev: 600 });
      var fewer = days.map(function (d) { return d.date === D ? Object.assign({}, d, { spend: 40, pur: 2, rev: 200 }) : d; });
      var r = DX.analyze({ since: '2026-11-01', until: D, today: D, unit: 'mtd', daily: fewer, dims: [] });
      eq([r.status, r.lens.open, r.lens.uneven, r.head.uneven, r.head.dOrd, r.head.dSpend], ['ok', true, true, true, 0, 0]);
      eq([r.cur.spend, r.prev.spend, r.prev.since, r.prev.until], [240, 300, '2026-10-01', '2026-10-03'], 'real totals');
      withLang('ar', function () {
        var o = DX.compose(r);
        eq(o.title, 'طلبات أقل حتى الآن، والفترة تشمل اليوم ولم يكتمل بعد');
        eq(o.tone, 'neutral');
        eq(o.period, t('dx.compareOpen', { cur: fmtRange('2026-11-01', D), prev: fmtRange('2026-10-01', '2026-10-03') }));
        eq(o.kpiNote, t('dx.lenNote.open'));
        eq(o.kpis.map(function (k) { return k.goodUp; }), [null, null, null, true, true, false], 'totals plain, ratios judged');
      });
      // تكلفة الطلب اتضاعفت فعلاً: الحكم بيقولها حتى مع يوم ناقص
      var worse = days.map(function (d) { return Object.assign({}, d, d.date >= '2026-11-01' ? { pur: 6, rev: 600 } : { pur: 20, rev: 2000 }); });
      var w = DX.analyze({ since: '2026-11-01', until: D, today: D, unit: 'mtd', daily: worse, dims: [] });
      eq(w.head.dEff, -1);
      withLang('ar', function () { eq(DX.compose(w).tone, 'bad'); });
    });
    // قرار صاحب المنتج ٧ نوفمبر ٢٠٢٦: «الرقم الفعلي لكل فترة… فيتم توضيحه في الحكم، لكن ليس افتراض متوسط أرقام»
    test('فترتان بطولين مختلفين: كل رقم فعلي، والحكم بيقول الأيام، ومن غير أي متوسط', function () {
      var flat = [];
      for (var k = '2026-08-01'; k <= '2026-11-02'; k = shiftKey(k, 1)) flat.push({ date: k, spend: 100, imp: 5000, clicks: 100, atc: 20, ic: 10, pur: 6, rev: 600 });
      var r = DX.analyze({ since: '2026-10-27', until: '2026-11-02', cmp: { since: '2026-09-01', until: '2026-09-30' }, currency: 'USD', daily: flat, dims: [] });
      eq([r.prev.spend, r.prev.pur, r.prev.rev, r.prev.len, r.cur.spend, r.cur.pur], [3000, 180, 18000, 30, 700, 42], 'the actual total of each period');
      eq(r.lens, { cur: 7, prev: 30, diff: true, open: false, prevOpen: false, uneven: true });
      eq([r.head.type, r.head.dOrd, r.head.dSpend, r.head.tone], ['stable', 0, 0, 'neutral'], 'no fake drop');
      eq(r.prev.real, undefined, 'no second set of numbers');
      withLang('ar', function () {
        var o = DX.compose(r);
        eq(o.title, 'طلبات أقل، والفترة أقصر: ٧ أيام مقابل ٣٠ يوماً');
        eq(o.tone, 'neutral');
        eq(o.kpis.map(function (k) { return k.prev; }).slice(0, 3), ['٣٬٠٠٠ $', '١٨٠', '١٨٬٠٠٠ $'], 'the tiles show the real figures');
        eq(o.kpis.map(function (k) { return k.value; }).slice(0, 3), ['٧٠٠ $', '٤٢', '٤٬٢٠٠ $']);
        eq(Math.round(o.kpis[1].pct * 100), -77, 'the change on the real figures, like the platforms');
        eq(o.kpis.map(function (k) { return k.goodUp; }), [null, null, null, true, true, false], 'a shorter period is not a red number');
        ok(!o.kpis.some(function (k) { return 'avg' in k; }), 'no average label');
        ok(o.kpiNote.indexOf('٧ أيام') > -1 && o.kpiNote.indexOf('٣٠ يوماً') > -1 && o.kpiNote.indexOf('المجموع الفعلي') > -1, o.kpiNote);
        var v = o.blocks[o.main];
        ok(v.lines[0].indexOf('(الفترة ٧ أيام مقابل ٣٠ يوماً)') > -1 && v.lines[0].indexOf('الإنفاق قلّ من ٣٬٠٠٠ $ إلى ٧٠٠ $') > -1, v.lines[0]);
        ok(!v.check, 'no «was a budget cut?» when the days explain it');
        eq(DX.toText(o).indexOf('متوسط يومي'), -1);
      });
      // أطول، بنفس المعدل
      var longer = DX.analyze({ since: '2026-10-20', until: '2026-11-02', cmp: { since: '2026-09-01', until: '2026-09-10' }, currency: 'USD', daily: flat, dims: [] });
      withLang('ar', function () { eq(DX.compose(longer).title, 'طلبات أكثر، والفترة أطول: ١٤ يوماً مقابل ١٠ أيام'); });
      // عكس اتجاه الأيام: حقيقة بتتقال من غير أي حساب
      var low = flat.map(function (d) { return d.date >= '2026-10-20' ? Object.assign({}, d, { spend: 50, pur: 3, rev: 300 }) : d; });
      var despite = DX.compose(DX.analyze({ since: '2026-10-20', until: '2026-11-02', cmp: { since: '2026-09-01', until: '2026-09-10' }, currency: 'USD', daily: low, dims: [] }));
      withLang('ar', function () {
        var o = DX.compose(DX.analyze({ since: '2026-10-20', until: '2026-11-02', cmp: { since: '2026-09-01', until: '2026-09-10' }, currency: 'USD', daily: low, dims: [] }));
        eq([o.title, o.tone], ['طلبات أقل، رغم أن الفترة أطول: ١٤ يوماً مقابل ١٠ أيام', 'mixed']);
      });
      var hi = flat.map(function (d) { return d.date >= '2026-10-27' ? Object.assign({}, d, { spend: 500, pur: 30, rev: 3000 }) : d; });
      withLang('ar', function () {
        eq(DX.compose(DX.analyze({ since: '2026-10-27', until: '2026-11-02', cmp: { since: '2026-09-01', until: '2026-09-14' }, currency: 'USD', daily: hi, dims: [] })).title, 'طلبات أكثر، رغم أن الفترة أقصر: ٧ أيام مقابل ١٤ يوماً');
      });
      var same = flat.map(function (d) { return d.date >= '2026-10-27' ? Object.assign({}, d, { spend: 200, pur: 12, rev: 1200 }) : d; });
      withLang('ar', function () {
        eq(DX.compose(DX.analyze({ since: '2026-10-27', until: '2026-11-02', cmp: { since: '2026-09-01', until: '2026-09-14' }, currency: 'USD', daily: same, dims: [] })).title, 'عدد الطلبات قريب من فترة المقارنة، والفترة أقصر: ٧ أيام مقابل ١٤ يوماً');
      });
      // النسب مبتتأثرش بالأيام: الحكم عليها زي أي مقارنة
      var bad = flat.map(function (d) { return d.date >= '2026-10-20' ? Object.assign({}, d, { pur: 3, rev: 300 }) : d; });
      var w = DX.analyze({ since: '2026-10-20', until: '2026-11-02', cmp: { since: '2026-09-01', until: '2026-09-10' }, currency: 'USD', daily: bad, dims: [] });
      eq([w.head.type, w.head.dEff, w.head.dOrd], ['worse', -1, 0]);
      withLang('ar', function () { var o = DX.compose(w); eq([o.title, o.tone], [t('dx.head.worse'), 'bad']); eq(o.kpis[5].sig, 1, 'cost per order is red with a background'); });
      // الشهر بالشهر: مجاميع فعلية، والفرق صغير فالحكم عادي، بس عدد الأيام بيتقال
      var m = DX.analyze({ since: '2026-10-01', until: '2026-10-31', unit: 'month', currency: 'USD', daily: flat, dims: [] });
      eq([m.prev.spend, m.cur.spend, m.lens.diff, m.lens.uneven], [3000, 3100, true, false]);
      ok(m.head.type === 'stable' || m.head.type === 'withinNoise', 'one more day is not a change in orders: ' + m.head.type);
      withLang('ar', function () { ok(DX.compose(m).kpiNote.indexOf('٣١ يوماً') > -1, DX.compose(m).kpiNote); });
      // ٣١ قصاد ٢٨ (أكبر فرق بين شهرين) لسه شهر بشهر
      var feb = [];
      for (var q = '2026-01-01'; q <= '2026-03-31'; q = shiftKey(q, 1)) feb.push({ date: q, spend: 100, imp: 5000, clicks: 100, atc: 20, ic: 10, pur: 6, rev: 600 });
      eq(DX.analyze({ since: '2026-03-01', until: '2026-03-31', unit: 'month', daily: feb, dims: [] }).lens.uneven, false, '31 vs 28');
      // فترة بلا طلبات خالص: مفيش تكلفة طلب نقول إنها «لم تتغيّر»
      var none = flat.map(function (d) { return d.date >= '2026-10-27' ? Object.assign({}, d, { pur: 0, rev: 0, atc: 0, ic: 0 }) : d; });
      var zero = DX.analyze({ since: '2026-10-27', until: '2026-11-02', cmp: { since: '2026-09-01', until: '2026-09-30' }, currency: 'USD', daily: none, dims: [] });
      withLang('ar', function () { ok(DX.toText(DX.compose(zero)).indexOf(t('dx.verdict.lenCalm')) < 0, 'no «no change in cost» with zero orders'); });
      // مقارنة بسنة تانية: الرأس بيقول السنتين، مش نفس الأيام مرتين
      var yr = [];
      for (var y2 = '2025-09-01'; y2 <= '2026-11-02'; y2 = shiftKey(y2, 1)) yr.push({ date: y2, spend: 100, imp: 5000, clicks: 100, atc: 20, ic: 10, pur: 6, rev: 600 });
      withLang('ar', function () {
        var p2 = DX.compose(DX.analyze({ since: '2026-10-27', until: '2026-11-02', cmp: { since: '2025-10-27', until: '2025-11-02' }, currency: 'USD', daily: yr, dims: [] })).period;
        ok(p2.indexOf('٢٠٢٦') > -1 && p2.indexOf('٢٠٢٥') > -1, p2);
        ok(DX.compose(DX.analyze({ since: '2026-10-27', until: '2026-11-02', currency: 'USD', daily: yr, dims: [] })).period.indexOf('٢٠٢٦') < 0, 'same year: no year');
      });
      // نفس الطول: من غير أي سطر
      var plain = DX.compose(DX.analyze({ since: '2026-10-20', until: '2026-11-02', daily: flat, dims: [] }));
      ok(plain.kpis.length && !plain.kpiNote, 'same length: nothing changes');
    });
    test('فترة مقارنة بطول مختلف: الأجزاء بأرقامها الفعلية، والاختبارات على عدّها، والسطر تحت الأرقام', function () {
      var days = [];
      for (var k = '2026-08-01'; k <= '2026-11-02'; k = shiftKey(k, 1)) {
        var big = k >= '2026-09-01' && k <= '2026-09-10';
        days.push({ date: k, spend: big ? 200 : 100, imp: 5000, clicks: 100, atc: 40, ic: 20, pur: big ? 12 : 6, rev: big ? 1200 : 600 });
      }
      var b = function (spend, pur) { return { spend: spend, imp: spend * 50, clicks: spend, atc: pur * 3, ic: pur * 2, pur: pur, rev: pur * 100 }; };
      var base = { since: '2026-10-20', until: '2026-11-02', cmp: { since: '2026-09-01', until: '2026-09-10' }, daily: days };
      var r = DX.analyze(Object.assign({}, base, { dims: [{ id: 'campaign', segs: [
        { key: 'A', name: 'A', goal: 'sales', w: [b(1000, 60), b(1700, 102), b(700, 42)] },
        { key: 'B', name: 'B', goal: 'sales', w: [b(400, 24), b(300, 18), b(300, 18)] }] }] }));
      ok(r.dims[0].cover.spend && r.dims[0].cover.pur, 'the campaigns add up to the total');
      eq([r.movers.dim, r.movers.list.map(function (x) { return x.key; }), Math.round(r.movers.list[0].v)], ['campaign', ['A'], -4200], 'the real difference of each campaign');
      // الإنفاق في الأهداف التانية: «اتنقل» مش بيتقال بين فترتين أطوالهم مختلفة
      var viaDims = DX.analyze(Object.assign({}, base, { dims: [{ id: 'campaign', segs: [
        { key: 'A', name: 'A', goal: 'sales', w: [b(1400, 84), b(1400, 120), b(1000, 60)] },
        { key: 'R', name: 'R', goal: 'reach', w: [b(0, 0), b(600, 0), b(0, 0)] }] }] }));
      eq(viaDims.other.spendShift, undefined);
      var near = function (x, y) { return Math.abs(x - y) < 1e-9; };
      ok(near(r.head.ordersZ, DX._.rateTest(120, 10, 84, 14, r.phiDaily).z), 'z on the real count: ' + r.head.ordersZ);
      // حد الطلبات على العدّ الفعلي
      var fewDays = [];
      for (var d = '2026-08-01'; d <= '2026-11-02'; d = shiftKey(d, 1)) {
        fewDays.push({ date: d, spend: 10, imp: 100, clicks: 5, atc: 0, ic: 0, pur: (d >= '2026-09-01' && d <= '2026-09-04') || (d >= '2026-10-19' && d <= '2026-10-21') ? 1 : 0, rev: 0 });
      }
      var few = DX.analyze({ since: '2026-10-19', until: '2026-11-02', cmp: { since: '2026-09-01', until: '2026-09-05' }, daily: fewDays, dims: [] });
      eq([few.status, few.orders], ['insufficient', 7]);
      // طلبات قليلة مش «لا تُسجَّل مشتريات»: الجملة دي بس لو مفيش ولا طلب (حساب حقيقي ٧ نوفمبر: ٤ طلبات في ٩ أيام)
      var low = fewDays.map(function (x) { var y = Object.assign({}, x); y.pur = x.date === '2026-09-01' || x.date === '2026-09-02' || x.date === '2026-10-19' || x.date === '2026-10-20' ? 1 : 0; return y; });
      eq(DX.analyze({ since: '2026-10-19', until: '2026-11-02', cmp: { since: '2026-09-01', until: '2026-09-05' }, daily: low, dims: [] }).status, 'insufficient');
      var noneAtAll = fewDays.map(function (x) { return Object.assign({}, x, { pur: 0 }); });
      eq(DX.analyze({ since: '2026-10-19', until: '2026-11-02', cmp: { since: '2026-09-01', until: '2026-09-05' }, daily: noneAtAll, dims: [] }).status, 'noPurchases');
      // كل اختبارات العنوان على العدّ الفعلي لكل فترة
      var zd = days.map(function (x) { var y = Object.assign({}, x); if (y.spend === 200) { y.pur = 14; y.rev = 1500; } return y; });
      var zr = DX.analyze(Object.assign({}, base, { daily: zd, dims: [] })), hh = zr.head, ph = zr.phiDaily;
      var sd = Math.sqrt(ph * 1.64 * (1 / 140 + 1 / 84));
      ok(near(hh.effZ, DX._.rateTest(140, 2000, 84, 1400, ph).z), 'cost per order: ' + hh.effZ);
      ok(near(hh.histZ, DX._.rateTest(140, 2000, 84, 1400, zr.head.phiHist).z), 'against its own history: ' + hh.histZ);
      ok(near(hh.rev.z, Math.log(8400 / 15000) / sd), 'sales: ' + hh.rev.z);
      eq(hh.rev.dir, 0, 'totals of unequal periods are not judged');
      ok(near(hh.roas.z, Math.log(6 / 7.5) / sd), 'return: ' + hh.roas.z);
      ok(near(hh.aov.z, Math.log(100 / (15000 / 140)) / Math.sqrt(DX._.T.PHI_SAMPLING * 0.64 * (1 / 140 + 1 / 84))), 'order value: ' + hh.aov.z);
      withLang('ar', function () {
        var o = DX.compose(r), sp = o.kpis[0];
        ok(sp.prev.indexOf(fmtNum(2000)) > -1, sp.prev);
        ok(dxKpiHtml(sp).indexOf(t('dx.kpi.prev', { label: cmpLabel(), v: sp.prev })) > -1, 'the tile');
        ok(o.notes.indexOf(o.kpiNote) < 0 && o.kpiNote.indexOf('١٠ أيام') > -1, o.kpiNote);
        ok(DX.toText(o).indexOf(o.kpiNote) > -1, 'in the copied text too');
        var ev = o.blocks.filter(function (x) { return x.evidence; })[0];
        if (ev) eq(ev.evidence.head[1], t('dx.m.prev'), 'the details table');
        ok(compareNote({ resultKey: 'click', currency: null }, { results: 7812, sales: 0 }, { results: 7812, sales: 0 }).indexOf('٧٬٨١٢') > -1, 'thousands separator');
        ok(compareNote({ resultKey: 'click', currency: null }, { results: 3000, sales: 0 }, { results: 7812, sales: 0 }).indexOf('٤٬٨١٢') > -1, 'the removed part too');
      });
      // السطر ظاهر تحت الأرقام نفسها، مش مع ملاحظات آخر الصفحة
      try {
        DX_ON = true; activeSources.meta = 'act_1';
        dxState = { status: 'ready', key: 'k', report: r, account: 'Store', accountId: 'meta:act_1' };
        withLang('ar', function () { renderDiagnosis(); });
        var note = dxState.composed.kpiNote, head = document.querySelector('#storeSec .dx-head');
        ok(note && head && head.textContent.indexOf(note) > -1, 'under the numbers');
        ok(document.querySelector('#dxMore').textContent.indexOf(note) < 0, 'not repeated at the bottom');
      } finally {
        DX_ON = false; dxReset(); document.getElementById('storeSec').hidden = true;
      }
    });
    testAsync('Meta: اليوم من غير طلب بالساعة، والتقسيمات موجودة، ومقارنة بعيدة على مديين', function () {
      var prev = window.fbPagesPromise, seen = [];
      window.fbPagesPromise = function (path, params) {
        seen.push(params);
        return Promise.resolve({ data: params.time_increment ? [{ date_start: JSON.parse(params.time_range).until, spend: '10' }] : [] });
      };
      var D = '2026-11-03';
      return metaDiagnosisInput('act_1', D, D, { today: D }).then(function (inp) {
        ok(!seen.some(function (p) { return /hourly/.test(p.breakdowns || ''); }), 'no hourly breakdown');
        eq(seen.filter(function (p) { return p.time_increment; }).length, 1, 'one daily range');
        ok(seen.filter(function (p) { return !p.time_increment; }).length > 3, 'the breakdowns are asked for today too');
        eq(inp.today, D);
        seen.length = 0;
        return metaDiagnosisInput('act_1', '2026-10-08', '2026-11-06', { cmp: { since: '2025-10-08', until: '2025-11-06' } });
      }).then(function (inp) {
        window.fbPagesPromise = prev;
        var ranges = seen.filter(function (p) { return p.time_increment; }).map(function (p) { return JSON.parse(p.time_range); });
        eq(ranges.length, 2, 'two daily ranges, not two years of days');
        ok(ranges[0].since < '2025-10-08' && ranges[0].until === '2025-11-06' && ranges[1].since === '2026-10-08' && ranges[1].until === '2026-11-06', JSON.stringify(ranges));
        eq(inp.daily.length, 2, 'both ranges are in the input');
        eq(inp.today, null);
      }, function (e) { window.fbPagesPromise = prev; throw e; });
    });
    test('فترات مش متتالية: «منذ تاريخ» و«مستمر» و«آخر N فترة» ومتابعة الفترة السابقة مبتتقالش', function () {
      var days = [];
      for (var k = '2026-06-01'; k <= '2026-11-07'; k = shiftKey(k, 1)) days.push({ date: k, spend: 100, imp: 5000, clicks: 100, atc: 20, ic: 10, pur: k >= '2026-11-01' ? 12 : 6, rev: k >= '2026-11-01' ? 1200 : 600 });
      var b = function (spend, pur) { return { spend: spend, imp: spend * 50, clicks: spend, atc: pur * 3, ic: pur * 2, pur: pur, rev: pur * 100 }; };
      var seg = function (id, x, y, z) { return { key: id, name: id, goal: 'sales', w: [x, y, z] }; };
      // هذا الشهر قصاد نفس الأيام من الشهر اللي قبله: جزء ضعيف في الفترة الحالية
      var dims = [{ id: 'campaign', segs: [seg('good', b(500, 80), b(500, 40), b(500, 40)), seg('weak', b(200, 4), b(200, 2), b(200, 2))] }];
      // يوم بلا مبيعات في فترة المقارنة: «متابعة الفترة السابقة» معناها فترات متتالية
      var withGap = days.map(function (d) { return d.date === '2026-10-03' ? Object.assign({}, d, { spend: 300, clicks: 300, pur: 0, rev: 0 }) : d; });
      var gapDims = [{ id: 'campaign', segs: [seg('good', b(500, 80), b(700, 34), b(500, 40)), seg('weak', b(200, 4), b(200, 2), b(200, 2))] }];
      var r = DX.analyze({ since: '2026-11-01', until: '2026-11-07', unit: 'mtd', daily: withGap, dims: gapDims });
      eq(r.head.rank, null, 'the same days of past months are not «the last N periods»');
      eq(r.followUps, []);
      ok(r.segments.length, 'the weak campaign is found');
      r.segments.forEach(function (g) { eq([g.persistent, g.since], [null, '2026-11-01'], g.key); });
      withLang('ar', function () {
        var txt = DX.toText(DX.compose(r));
        ok(txt.indexOf(t('dx.seg.new')) < 0 && txt.indexOf(t('dx.seg.persist')) < 0, 'neither «new» nor «ongoing» is known here');
      });
      var chainedR = DX.analyze({ since: '2026-11-01', until: '2026-11-07', daily: days, dims: dims });
      eq(chainedR.windows[1].until, '2026-10-31');
      // مقارنة بعد الفترة: مفيش فرصة ولا متابعة
      var later = DX.analyze({ since: '2026-09-01', until: '2026-09-07', cmp: { since: '2026-11-01', until: '2026-11-07' }, daily: days, dims: [] });
      eq([later.status, later.opportunity, later.followUps], ['ok', null, []]);
      eq([later.prev.since, later.prev.pur, later.cur.pur], ['2026-11-01', 84, 42], 'any period, real figures');
      // متداخلة: اليوم بيتحسب في الفترتين زي ما هو
      var over = DX.analyze({ since: '2026-10-05', until: '2026-10-11', cmp: { since: '2026-10-08', until: '2026-10-14' }, daily: days, dims: [] });
      eq([over.status, over.prev.spend, over.cur.spend], ['ok', 700, 700]);
    });
    test('الفترة أقصر من المقارنة: تراجع حملة كبيرة مبيضيعش، والفرصة بالإنفاق اليومي، وجزء شغّال مبيبانش «اتوقف»', function () {
      var b = function (spend, pur) { return { spend: spend, imp: spend * 50, clicks: spend, atc: pur * 3, ic: pur * 2, pur: pur, rev: pur * 100 }; };
      var row = function (date, spend, pur) { var x = b(spend, pur); x.date = date; return x; };
      // ٧ أيام قصاد ٣٠: إنفاق الحملة في اليوم زي ما هو، وتكلفة طلبها ٤ أضعاف
      var d1 = [];
      for (var k = '2026-06-01'; k <= '2026-11-02'; k = shiftKey(k, 1)) d1.push(row(k, 100, k >= '2026-10-27' ? 3 : 10));
      var r1 = DX.analyze({ since: '2026-10-27', until: '2026-11-02', cmp: { since: '2026-09-01', until: '2026-09-30' }, daily: d1, dims: [{ id: 'campaign', segs: [
        { key: 'A', name: 'A', goal: 'sales', w: [b(490, 14), b(2100, 210), b(2100, 210)] },
        { key: 'B', name: 'B', goal: 'sales', w: [b(210, 7), b(900, 90), b(900, 90)] }] }] });
      ok(r1.changes.some(function (c) { return c.key === 'A'; }), 'a shorter period is not a budget cut: ' + JSON.stringify(r1.changes.map(function (c) { return c.key; })));
      // فرصة زيادة الميزانية: الإنفاق المعتاد بأيام الفترة، مقارنة ١٤ يوم قبل فترة ٧ أيام
      var opp = function (spend, pur) {
        var d = [];
        for (var q = '2026-05-01'; q <= '2026-11-02'; q = shiftKey(q, 1)) d.push(q >= '2026-10-27' ? row(q, spend, pur) : (q >= '2026-10-13' ? row(q, 100, 7) : row(q, 100, 5)));
        return DX.analyze({ since: '2026-10-27', until: '2026-11-02', cmp: { since: '2026-10-13', until: '2026-10-26' }, daily: d, dims: [] }).opportunity;
      };
      ok(opp(100, 10), 'the same daily spend at a better cost is an opportunity');
      eq(opp(150, 15), null, 'a higher daily spend is not, even if the total is below the 14-day total');
      // مقارنة بعد الفترة: الأرقام اللي بعدها مش تاريخ الحساب
      var d3 = [];
      for (var p = '2026-05-01'; p <= '2026-11-07'; p = shiftKey(p, 1)) d3.push(p >= '2026-09-01' && p <= '2026-09-07' ? row(p, 100, 10) : (p >= '2026-11-01' ? row(p, 100, 7) : row(p, 100, 5)));
      eq(DX.analyze({ since: '2026-09-01', until: '2026-09-07', cmp: { since: '2026-11-01', until: '2026-11-07' }, daily: d3, dims: [] }).opportunity, null);
      // ٣ أيام قصاد ٣٠ متتاليين: جزء بنفس إنفاقه اليومي مش «اتوقف»
      var d4 = [];
      for (var z = '2026-07-01'; z <= '2026-11-06'; z = shiftKey(z, 1)) d4.push(row(z, 100, z >= '2026-11-04' ? 35 / 3 : 8.2));
      var r4 = DX.analyze({ since: '2026-11-04', until: '2026-11-06', cmp: { since: '2026-10-05', until: '2026-11-03' }, daily: d4, dims: [{ id: 'campaign', segs: [
        { key: 'good', name: 'good', goal: 'sales', w: [b(240, 34), b(2400, 240), b(2400, 240)] },
        { key: 'weak', name: 'weak', goal: 'sales', w: [b(60, 1), b(600, 6), b(600, 6)] }] }] });
      eq(r4.followUps.filter(function (f) { return f.status === 'stopped'; }), [], 'the same daily spend is not «stopped»');
      ok(r4.segments.some(function (g) { return g.key === 'weak'; }), 'still flagged');
    });
    test('Snapchat وGoogle: طلب الملخص بالمدى الصحيح، وتاريخ النهارده بيوصل للمحرك', function () {
      var keep = { apiPost: window.apiPost, isCurrentLoad: window.isCurrentLoad, dxBegin: window.dxBegin, dxDone: window.dxDone }, keepOn = DX_ON, keepP = period, keepC = compare;
      var sent = [], got = [];
      window.apiPost = function (u, body) { sent.push(body); return { then: function (f) { f({ ok: true, data: { daily: [], dims: [] } }); return { catch: function () {} }; } }; };
      window.isCurrentLoad = function () { return true; };
      window.dxBegin = function () { return true; };
      window.dxDone = function (p, key, input) { got.push(input); };
      try {
        DX_ON = true; period = { preset: 'today' }; compare = { mode: 'year' };
        var today = todayKeyInTz('Asia/Riyadh');
        loadSnapchatDiagnosis('acc1', { timezone: 'Asia/Riyadh', currency: 'SAR' }, 't');
        loadGoogleDiagnosis('123', { timeZone: 'Asia/Riyadh', currency: 'SAR', name: 'x' }, 't');
        eq(sent.length, 2);
        sent.forEach(function (b) {
          ok(Array.isArray(b.daily) && b.daily.length === 2, 'two ranges: ' + JSON.stringify(b.daily));
          eq(b.daily[b.daily.length - 1], { since: today, until: today });
          eq(b.partial, undefined, 'no hour');
        });
        got.forEach(function (i) { eq([i.today, i.since, i.cmp.since], [today, today, shiftMonths(today, -12)]); });
      } finally {
        Object.keys(keep).forEach(function (k) { window[k] = keep[k]; });
        DX_ON = keepOn; period = keepP; compare = keepC;
      }
    });
    test('المناسبات: اليوم الوطني السعودي والجمعة البيضاء ورمضان', function () {
      ok(X.eventsOn('2026-09-23', ['SA']).indexOf('saNational') > -1);
      ok(X.eventsOn('2026-09-23', ['EG']).indexOf('saNational') < 0, 'only for Saudi stores');
      ok(X.isWhiteFridayWeekend('2026-11-27') && !X.isWhiteFridayWeekend('2026-11-20'), 'Friday after the 4th Thursday');
      // رمضان ١٤٤٧ تقريباً ١٨ فبراير – ١٩ مارس ٢٠٢٦: أول مارس جوه رمضان أياً كان فرق يوم في الرؤية
      if (X.hijriSupported) {
        ok(X.eventsOn('2026-03-01', ['SA']).indexOf('ramadan') > -1, 'Ramadan');
        ok(X.eventsOn('2026-03-15', ['SA']).indexOf('ramadanLast') > -1, 'last ten days');
      }
    });
    test('المناسبات: عُمان، عيد الأم، السفر الصيفي، العودة للمدارس — ولكل دولة مواعيدها', function () {
      var has = function (key, cs, id) { return X.eventsOn(key, cs).indexOf(id) > -1; };
      ok(has('2026-11-20', ['OM'], 'omNational') && has('2026-11-21', ['OM'], 'omNational'), 'Oman: 20–21 November');
      ok(!has('2026-11-18', ['OM'], 'omNational') && !has('2026-11-20', ['SA'], 'omNational'), 'not the old date, not other countries');
      ok(has('2026-03-18', ['SA'], 'mothersDay') && has('2026-03-21', ['EG'], 'mothersDay') && !has('2026-03-22', ['SA'], 'mothersDay'), 'gift week before March 21');
      ok(has('2026-07-01', ['AE'], 'summerTravel') && !has('2026-07-01', ['EG'], 'summerTravel') && !has('2026-09-01', ['SA'], 'summerTravel'), 'Gulf summer only');
      ok(has('2026-08-20', ['KW'], 'backToSchool') && !has('2026-08-20', ['EG'], 'backToSchool') && has('2026-09-20', ['EG'], 'backToSchool'), 'school dates per country');
      eq(X.eventsOn('2026-08-20', ['SA', 'AE']).filter(function (id) { return id === 'backToSchool'; }).length, 1, 'listed once for several countries');
      ['ar', 'en'].forEach(function (l) {
        withLang(l, function () {
          ['omNational', 'mothersDay', 'summerTravel', 'backToSchool'].forEach(function (id) { ok(t('dx.event.' + id) !== 'dx.event.' + id, l + ' ' + id); });
          ['SA', 'KW', 'AE', 'QA', 'BH', 'OM', 'EG'].forEach(function (c) { ok(t('dx.pay.' + c) !== 'dx.pay.' + c, l + ' pay ' + c); });
        });
      });
    });
    test('جدول الأسباب: كل سبب وكل «تحقّق أولاً» ليه نص في اللغتين، والبحث بيرجع للأعم لو مفيش صف بالظبط', function () {
      var missing = [];
      ['ar', 'en'].forEach(function (l) {
        withLang(l, function () {
          Object.keys(DX.PLAYBOOK).forEach(function (k) {
            var pb = DX.PLAYBOOK[k];
            pb.causes.forEach(function (c) { if (t('dx.cause.' + c) === 'dx.cause.' + c) missing.push(l + ':cause.' + c); });
            if (t('dx.chk.' + pb.check) === 'dx.chk.' + pb.check) missing.push(l + ':chk.' + pb.check);
            ok(/^(ads|store|ops|tracking)$/.test(pb.owner), k + ' owner');
          });
        });
      });
      eq(missing, []);
      eq(DX.playbook('cart', 'market', 'worse').check, 'market');
      eq(DX.playbook('ctr', 'device', 'better').causes, ['segBetter']);
    });
  });

  describe('الملخص بالبريد — التعديلات ونتيجتها', function () {
    var X = DX._;
    function ev(type, ot, id, when, extra, name) {
      return { event_type: type, object_type: ot, object_id: id, object_name: name || ('N' + id), event_time: when, actor_name: 'Walid', extra_data: JSON.stringify(extra || {}) };
    }
    function budget(id, when, from, to) {
      return ev('update_ad_set_budget', 'CAMPAIGN', id, when, { old_value: { type: 'payment_amount', currency: 'USD', old_value: from },
        new_value: { type: 'payment_amount', currency: 'USD', new_value: to, additional_value: 'Per day' }, type: 'composite_data' });
    }
    function status(ot, id, when, from, to) { return ev(ot === 'ADGROUP' ? 'update_ad_run_status' : 'update_ad_set_run_status', ot, id, when, { old_value: from, new_value: to, type: 'run_status' }); }
    // أيام متتالية بأرقام ثابتة لكل يوم
    function series(since, until, spend, pur) { var out = []; for (var k = since; k <= until; k = shiftKey(k, 1)) out.push({ date: k, spend: spend, pur: pur, rev: pur * 50 }); return out; }
    function plus(a, b) {
      var m = {};
      a.concat(b).forEach(function (d) { var x = m[d.date] = m[d.date] || { date: d.date, spend: 0, pur: 0, rev: 0 }; x.spend += d.spend; x.pur += d.pur; x.rev += d.rev; });
      return Object.keys(m).sort().map(function (k) { return m[k]; });
    }
    var REST = series('2026-09-01', '2026-09-29', 300, 15);   // باقي الحساب: ٢٠ للطلب

    test('تصنيف السجل: الميزانية ٢٠٪ فأكثر والإيقاف والإطلاق قرارات، والمراجعة والمعالجة والصور لأ (حالة حقيقية)', function () {
      eq(X.actionOf(budget('1', '2026-09-24T16:15:19+0000', 1000, 5000), 'Asia/Kuwait').kind, 'budget');
      eq(X.actionOf(budget('1', '2026-09-24T16:15:19+0000', 1000, 1100), 'Asia/Kuwait'), null);
      eq(X.actionOf(status('ADGROUP', '2', '2026-09-24T12:00:00+0000', 'Pending Review', 'Active'), 'UTC'), null);
      var p = X.actionOf(status('CAMPAIGN', '3', '2026-09-24T12:00:00+0000', 'Active', 'Inactive'), 'UTC');
      eq([p.kind, p.level], ['pause', 'adset']);
      var launch = X.actionOf(ev('create_ad', 'ADGROUP', '9', '2026-09-22T15:45:14+0000', { campaign_id: { mutation_input: 777, new: 777 } }), 'UTC');
      eq([launch.kind, launch.parent], ['launch', '777']);
      eq(X.actionOf(ev('update_ad_set_target_spec', 'CAMPAIGN', '4', '2026-09-24T11:58:52+0000', { old_value: null, new_value: [] }), 'UTC'), null, 'targeting set at creation');
      eq(X.actionOf(ev('add_images', 'ACCOUNT', '5', '2026-09-24T11:58:52+0000', {}), 'UTC'), null);
      eq(X.keyInTz('2026-09-24T22:30:00+0000', 'Asia/Kuwait'), '2026-09-25', '10:30 PM UTC is the next day in Kuwait');
    });
    test('تعديلات نفس العنصر خلال ٣ أيام = حزمة واحدة، وبيتحكم عليها في الملخص اللي فيه يومها التالت الكامل', function () {
      var evs = [budget('10', '2026-09-20T10:00:00+0000', 1000, 2000), ev('update_ad_set_target_spec', 'CAMPAIGN', '10', '2026-09-21T10:00:00+0000', { old_value: [1], new_value: [2] })];
      var g = DX.actionGroups(evs, 'UTC', '2026-09-24', '2026-09-26');
      eq(g.length, 1);
      eq([g[0].kind, g[0].stage, g[0].first, g[0].last], ['package', 'judge', '2026-09-20', '2026-09-21']);
      eq(DX.actionGroups(evs, 'UTC', '2026-09-27', '2026-09-29')[0].stage, 'second', 'only if the first verdict was «too few orders»');
      var early = DX.actionGroups([budget('11', '2026-09-28T10:00:00+0000', 1000, 3000)], 'UTC', '2026-09-27', '2026-09-29');
      eq([early[0].stage, early[0].after], ['early', 1]);
      eq(DX.actionGroups([budget('12', '2026-09-20T10:00:00+0000', 1000, 2000), budget('12', '2026-09-21T10:00:00+0000', 2000, 1050)], 'UTC', '2026-09-24', '2026-09-26').length, 0, 'raised then lowered back');
    });
    test('رفع الميزانية: الحكم بعد استبعاد باقي الحساب (فرق الفروق)', function () {
      var since = '2026-09-24', until = '2026-09-26';
      var groups = DX.actionGroups([budget('20', '2026-09-22T09:00:00+0000', 10000, 20000)], 'UTC', since, until);
      eq(groups.length, 1);
      var judge = function (obj, rest) { return DX.evalActions(groups, { 20: obj }, plus(obj, rest || REST), until)[0]; };
      // ضعف الإنفاق وضعف الطلبات = نفس الكفاءة
      eq(judge(series('2026-09-01', '2026-09-22', 100, 5).concat(series('2026-09-23', '2026-09-29', 200, 10))).verdict, 'same');
      // ضعف الإنفاق وطلبات أقل = الكفاءة وقعت
      eq(judge(series('2026-09-01', '2026-09-22', 100, 5).concat(series('2026-09-23', '2026-09-29', 200, 4))).verdict, 'worse');
      eq(judge(series('2026-09-01', '2026-09-22', 100, 5).concat(series('2026-09-23', '2026-09-29', 100, 12))).verdict, 'better');
      // المجموعة اتحسّنت الضعف، بس باقي الحساب كمان اتحسّن الضعف في نفس الأيام = مش بسبب التعديل
      var restUp = series('2026-09-01', '2026-09-22', 300, 15).concat(series('2026-09-23', '2026-09-29', 300, 30));
      eq(judge(series('2026-09-01', '2026-09-22', 100, 5).concat(series('2026-09-23', '2026-09-29', 100, 10)), restUp).verdict, 'same', 'the whole account improved too');
      // طلبات قليلة جداً قبل وبعد = «البيانات ما زالت قليلة» (نرجع له بعد أسبوع)
      eq(judge(series('2026-09-01', '2026-09-22', 10, 0.25).concat(series('2026-09-23', '2026-09-29', 20, 0.5))).verdict, 'wait');
    });
    test('أرقام اتغيّرت كتير بس الفرق مش حاسم = «لا يمكن نسبته إلى التعديل بعد» مش «لا فرق» (حالة حقيقية: ١٠ طلبات ← ٢)', function () {
      var groups = DX.actionGroups([budget('22', '2026-09-22T09:00:00+0000', 10000, 7000)], 'UTC', '2026-09-24', '2026-09-26');
      var obj = series('2026-09-01', '2026-09-22', 14, 2).concat(series('2026-09-23', '2026-09-29', 10, 0.5));
      var r = DX.evalActions(groups, { 22: obj }, plus(obj, REST), '2026-09-26')[0];
      eq(r.verdict, 'unclear');
      withLang('ar', function () {
        var b = DX.composeActions([r], 'USD');
        ok(!b.items.length && /ولم تُحسم بعد نتيجة ١ .*«N22»/.test(b.after.join(' ')), JSON.stringify(b));
      });
    });
    test('حزمة فيها رفع ميزانية + استهداف بتتقيّم كزيادة: الطلبات زادت بنفس التكلفة = «حافظ على كفاءته» مش «لا فرق»', function () {
      var evs = [budget('24', '2026-09-21T09:00:00+0000', 1000, 2500), ev('update_ad_set_target_spec', 'CAMPAIGN', '24', '2026-09-22T09:00:00+0000', { old_value: [1], new_value: [2] })];
      var groups = DX.actionGroups(evs, 'UTC', '2026-09-24', '2026-09-26');
      eq([groups[0].kind, groups[0].from, groups[0].to], ['package', 1000, 2500]);
      var obj = series('2026-09-01', '2026-09-22', 60, 3).concat(series('2026-09-23', '2026-09-29', 150, 7.5));
      withLang('ar', function () {
        var it = DX.composeActions(DX.evalActions(groups, { 24: obj }, plus(obj, REST), '2026-09-26'), 'USD').items[0];
        ok(/حافظ على كفاءته/.test(it.lines.join(' ')) && /الميزانية والاستهداف/.test(it.title), JSON.stringify(it));
      });
    });
    test('التعديلات الصغيرة (أقل من ٣٪ من إنفاق الحساب) بتتعد بس، واستهداف الإعلان المنسوخ من المجموعة مش قرار', function () {
      var groups = DX.actionGroups([budget('23', '2026-09-22T09:00:00+0000', 1000, 2000)], 'UTC', '2026-09-24', '2026-09-26');
      var tiny = series('2026-09-01', '2026-09-22', 3, 0.2).concat(series('2026-09-23', '2026-09-29', 6, 0.4));
      var list = DX.evalActions(groups, { 23: tiny }, plus(tiny, REST), '2026-09-26');
      ok(list[0].minor, 'share ' + list[0].share);
      withLang('ar', function () {
        var b = DX.composeActions(list, 'USD');
        ok(!b.items.length && /تعديلات صغيرة الأثر فقط/.test(b.lines[0]), JSON.stringify(b));
      });
      eq(X.actionOf(ev('update_ad_targets_spec', 'ADGROUP', '6', '2026-09-24T12:00:53+0000', { old_value: [1], new_value: [2] }), 'UTC'), null);
    });
    test('الإيقاف: «قرار في محله» لو العنصر كان أضعف من باقي الحساب، و«انتبه» لو كان من الأفضل', function () {
      var since = '2026-09-27', until = '2026-09-29';
      var groups = DX.actionGroups([status('ADGROUP', '30', '2026-09-28T09:00:00+0000', 'Active', 'Inactive')], 'UTC', since, until);
      eq([groups.length, groups[0].kind], [1, 'pause']);
      var weak = series('2026-09-01', '2026-09-27', 50, 0);     // ٣٥٠ في الأسبوع من غير ولا طلب
      eq(DX.evalActions(groups, { 30: weak }, plus(weak, REST), until)[0].verdict, 'worse');
      var star = series('2026-09-01', '2026-09-27', 100, 15);   // ٦٫٧ للطلب
      eq(DX.evalActions(groups, { 30: star }, plus(star, REST), until)[0].verdict, 'better');
      withLang('ar', function () {
        var good = DX.composeActions(DX.evalActions(groups, { 30: weak }, plus(weak, REST), until), 'USD').items[0];
        ok(good.tone === 'good' && /قرار في محله/.test(good.lines.join(' ')) && good.title.indexOf('إيقاف الإعلان') === 0 && /دون أي طلب/.test(good.lines[0]), JSON.stringify(good));
        var bad = DX.composeActions(DX.evalActions(groups, { 30: star }, plus(star, REST), until), 'USD').items[0];
        ok(bad.tone === 'bad' && /انتبه/.test(bad.lines.join(' ')), JSON.stringify(bad));
      });
      eq(DX.evalActions(groups, { 30: [] }, REST, until).length, 0, 'pausing something that spent nothing is not worth a line');
    });
    test('إعلانات جديدة في نفس المجموعة = إطلاق واحد، والحكم مقارنةً بباقي الحساب في نفس الأيام', function () {
      var since = '2026-09-24', until = '2026-09-26';
      var evs = ['40', '41'].map(function (id) { return ev('create_ad', 'ADGROUP', id, '2026-09-21T10:00:00+0000', { campaign_id: { mutation_input: 777, new: 777 } }); });
      var groups = DX.actionGroups(evs, 'UTC', since, until);
      eq([groups.length, groups[0].kind, groups[0].ids.length], [1, 'launch', 2]);
      var a = series('2026-09-22', '2026-09-29', 50, 1), b = series('2026-09-22', '2026-09-29', 50, 1);   // ٥٠ للطلب مقابل ٢٠
      var r = DX.evalActions(groups, { 40: a, 41: b }, plus(plus(a, b), REST), until)[0];
      eq([r.vsRest, r.verdict], [true, 'worse']);
      withLang('ar', function () {
        var it = DX.composeActions([r], 'USD').items[0];
        ok(/^إطلاق إعلانات جديدة \(٢\)، أولها الإعلان/.test(it.title) && /لباقي الحساب في الأيام نفسها/.test(it.lines[0]), JSON.stringify(it));
      });
    });
    test('الصياغة: رفع الميزانية بالعملة الصحيحة (سجل Meta بالسنت) والأسهم، و«مبكر للحكم»، وفترة من غير تعديلات', function () {
      withLang('ar', function () {
        var since = '2026-09-24', until = '2026-09-26';
        var groups = DX.actionGroups([budget('20', '2026-09-22T09:00:00+0000', 10000, 20000)], 'UTC', since, until);
        var obj = series('2026-09-01', '2026-09-22', 100, 5).concat(series('2026-09-23', '2026-09-29', 200, 10));
        var it = DX.composeActions(DX.evalActions(groups, { 20: obj }, plus(obj, REST), until), 'USD').items[0];
        ok(it.title.indexOf('رفع ميزانية المجموعة الإعلانية') === 0 && it.title.indexOf(money(100, 'USD')) > -1 && it.title.indexOf(money(200, 'USD')) > -1, it.title);
        ok(/بواسطة/.test(it.meta) && /←/.test(it.lines[0]) && /حافظ على كفاءته/.test(it.lines[1]), JSON.stringify(it));
        var o21 = series('2026-09-01', '2026-09-29', 100, 5);
        var early = DX.composeActions(DX.evalActions(DX.actionGroups([budget('21', '2026-09-26T09:00:00+0000', 1000, 3000)], 'UTC', since, until), { 21: o21 }, plus(o21, REST), until), 'USD');
        ok(!early.items.length && /نقيّمها في ملخص قادم .*«N21»/.test(early.after.join(' ')), JSON.stringify(early));
        eq(DX.composeActions([], 'USD').lines, [t('dx.act.none')]);
      });
      withLang('en', function () {
        var groups = DX.actionGroups([budget('20', '2026-09-22T09:00:00+0000', 10000, 20000)], 'UTC', '2026-09-24', '2026-09-26');
        var obj = series('2026-09-01', '2026-09-22', 100, 5).concat(series('2026-09-23', '2026-09-29', 200, 10));
        var it = DX.composeActions(DX.evalActions(groups, { 20: obj }, plus(obj, REST), '2026-09-26'), 'USD').items[0];
        ok(/^Raised the daily budget of ad set/.test(it.title) && /→/.test(it.lines[0]) && !/[؀-ۿ]/.test(it.title + it.lines.join('')), JSON.stringify(it));
      });
    });
  });

  describe('ملخص المتجر — المحاكاة', function () {
    var S = '2026-09-21';
    var runMany = function (n, cfg, seed0) {
      var out = [];
      for (var s = 1; s <= n; s++) out.push(DX.analyze(DX_SIM.simulate(Object.assign({ seed: s * (seed0 || 7919) }, cfg))));
      return out;
    };
    var KW = [{ key: 'c1', name: 'A', country: 'SA', share: 0.35, mult: {} }, { key: 'c2', name: 'B', country: 'SA', share: 0.3, mult: {} },
      { key: 'c3', name: 'C', country: 'SA', share: 0.2, mult: {} }, { key: 'c4', name: 'KW', country: 'KW', share: 0.15, mult: { cart: 0.2 } }];
    test('حساب مفيهوش أي مشكلة: مفيش تفسير ولا مشاكل ولا فرص وهمية (٦٠ حساب)', function () {
      var reps = runMany(60, { spend: 400 });
      var why = reps.filter(function (r) { return r.why; }).length;
      var segs = reps.reduce(function (s, r) { return s + r.segments.length; }, 0);
      var zeros = reps.reduce(function (s, r) { return s + r.zeroRuns.length; }, 0);
      var opp = reps.filter(function (r) { return r.opportunity; }).length;
      ok(why <= 3, 'false why: ' + why);
      eq([segs, zeros, opp], [0, 0, 0], 'false segments / zero days / opportunities');
    });
    test('حساب حملاته مختلفة شوية (±٣٠٪) مش المفروض يطلع فيه «جزء متأخر»', function () {
      var mixed = [{ key: 'c1', name: 'A', country: 'SA', share: 0.35, mult: { pay: 1.2 } }, { key: 'c2', name: 'B', country: 'SA', share: 0.3, mult: { cart: 0.8 } },
        { key: 'c3', name: 'C', country: 'SA', share: 0.2, mult: { ctr: 1.3 } }, { key: 'c4', name: 'KW', country: 'KW', share: 0.15, mult: { checkout: 0.75 } }];
      var segs = runMany(40, { spend: 2000, campaigns: mixed }).reduce(function (s, r) { return s + r.segments.filter(function (g) { return g.kind === 'under'; }).length; }, 0);
      ok(segs <= 1, 'false under: ' + segs);
    });
    test('إكمال الدفع وقع ٤٥٪ في الحساب كله: التفسير «بعد الضغط على الإعلان» والمرحلة «الدفع»', function () {
      var reps = runMany(20, { spend: 2000, changes: [{ from: S, stage: 'pay', factor: 0.55 }] }, 104729);
      var right = reps.filter(function (r) { return r.why && r.why.dir === 'worse' && r.why.kind === 'after'; });
      ok(right.length >= 18, 'detected ' + right.length + '/20');
      var named = right.filter(function (r) { return r.why.drivers[0].stages.length; });
      ok(named.every(function (r) { return r.why.drivers[0].stages[0].id === 'pay'; }), 'named stage is always pay');
      ok(right.every(function (r) { return !r.why.scope || r.why.scope.type === 'general'; }), 'never blamed on one campaign');
    });
    test('دولة زوارها مبيضيفوش للسلة: بتظهر «يحتاج قرارك» في المرحلة الصح، ومفيش دولة تانية بتتظلم', function () {
      var reps = runMany(30, { spend: 400, campaigns: KW }, 104729);
      var hit = reps.filter(function (r) { return r.segments.some(function (g) { return g.kind === 'under' && g.key === 'KW' && g.stage && g.stage.id === 'cart'; }); }).length;
      ok(hit >= 21, 'KW found ' + hit + '/30');
      ok(reps.every(function (r) { return !r.segments.some(function (g) { return g.kind === 'under' && g.key === 'SA'; }); }), 'SA never flagged');
    });
    test('المشتريات وقفت آخر يومين والزيارات مستمرة: تنبيه عاجل', function () {
      var reps = runMany(20, { spend: 400, changes: [{ from: '2026-09-26', stage: 'pay', factor: 0 }] }, 104729);
      var hit = reps.filter(function (r) { return r.zeroRuns.some(function (z) { return z.now && z.kind === 'cart'; }); }).length;
      ok(hit >= 18, 'urgent ' + hit + '/20');
    });
    test('الميزانية اتقصّت ٤٥٪: «طلبات أقل ومعظم ذلك بسبب انخفاض الإنفاق» — مش «مستقر» ومش مشكلة أداء', function () {
      var reps = runMany(30, { spend: 400, changes: [{ from: S, spendFactor: 0.55 }] }, 104729);
      var hit = reps.filter(function (r) { return r.head.type === 'budgetDown'; }).length;
      ok(hit >= 25, 'budgetDown ' + hit + '/30');
      ok(reps.every(function (r) { return r.head.type !== 'stable'; }), 'never called steady');
    });
    test('حملة كبيرة ساءت وحملة تانية عوّضتها: بتظهر «تغيّر حاد» في الحملة الصح بس، ومفيش تغيّرات وهمية', function () {
      var S2 = '2026-09-21';
      var reps = runMany(20, { spend: 2000, changes: [{ from: S2, campaign: 'c1', stage: 'pay', factor: 0.45 }, { from: S2, campaign: 'c2', stage: 'pay', factor: 1.6 }] }, 104729);
      var hit = reps.filter(function (r) { return (r.changes || []).some(function (c) { return c.key === 'c1'; }); }).length;
      ok(hit >= 10, 'c1 found ' + hit + '/20');
      ok(reps.every(function (r) { return !(r.changes || []).some(function (c) { return c.dim === 'campaign' && c.key !== 'c1'; }); }), 'never the wrong campaign');
      var calm = runMany(40, { spend: 2000 }).reduce(function (s, r) { return s + (r.changes || []).length; }, 0);
      eq(calm, 0, 'no changes on a steady account');
    });
    test('بيانات قليلة (أقل من ١٢ طلب في الفترتين): «البيانات لا تكفي» من غير أي حكم', function () {
      var r = DX.analyze(DX_SIM.simulate({ seed: 3, spend: 12 }));
      ok(r.status === 'insufficient' || r.status === 'noPurchases', r.status);
    });
    test('تقسيم أرقامه مش مطابقة للإجمالي (زي المشتريات حسب المنطقة في Meta) بيتشال من التحليل', function () {
      var inp = DX_SIM.simulate({ seed: 5, spend: 400 });
      inp.dims.push({ id: 'region', segs: inp.dims[1].segs.map(function (s) {
        return { key: s.key + '-R', name: null, w: s.w.map(function (w) { return w && Object.assign({}, w, { pur: 0, atc: 0, ic: 0, rev: 0 }); }) };
      }) });
      var r = DX.analyze(inp);
      var region = r.dims.filter(function (d) { return d.id === 'region'; })[0];
      eq([region.cover.pur, region.cover.spend], [false, true]);
    });
  });

  // مراجعة ٧ أكتوبر ٢٠٢٦: العنوان كان بيحكم بعدد الطلبات بس — إنفاق اتضاعف والعائد نزل من ×٦ لـ×٢٫٤ طلع «طلبات أكثر» بالأخضر،
  // ومبيعات نزلت ٤٥٪ طلعت «أداء مستقر: لا تغيّر يستدعي تدخّلك»، وتحت عنوان «لا شيء يستدعي تدخّلك» كان فيه «يحتاج قرارك»
  describe('ملخص المتجر — الربح أولاً', function () {
    var mkDays = function (cur) {
      var base = { spend: 1000, imp: 50000, clicks: 1000, atc: 120, ic: 60, pur: 20, rev: 6000 }, d = [];
      for (var k = '2026-07-01'; k <= '2026-10-06'; k = shiftKey(k, 1)) d.push(Object.assign({ date: k }, base, k >= '2026-09-30' ? cur : {}));
      return d;
    };
    var head = function (cur, target) {
      return withLang('ar', function () {
        return DX.compose(DX.analyze({ since: '2026-09-30', until: '2026-10-06', currency: 'SAR', daily: mkDays(cur), dims: [] }), target ? { target: target } : undefined);
      });
    };
    test('الإنفاق اتضاعف والطلبات زادت لكن العائد نزل من ×٦ لـ×٢٫٤: «العائد انخفض» بالأحمر مش «طلبات أكثر» بالأخضر', function () {
      var o = head({ spend: 2000, imp: 100000, clicks: 2000, atc: 230, ic: 110, pur: 32, rev: 4800 });
      eq([o.tone, o.title], ['bad', withLang('ar', function () { return t('dx.head.roasDown'); })]);
      eq(o.kpis.filter(function (k) { return k.id === 'roas'; })[0].sig, -1, 'the return KPI is colored by the return itself');
      // «لماذا تغيّرت مبيعاتك؟»: الإنفاق اتضاعف ومتوسط قيمة الطلب اتنصّف وتكلفة الطلب زادت — الأنصبة مجموعها الفرق بالظبط
      var L = o.blocks[o.main].lines[0];
      ok(/^انخفضت المبيعات/.test(L) && /متوسط قيمة الطلب نزل من ٣٠٠ ر\.س إلى ١٥٠ ر\.س/.test(L) && /تكلفة الطلب ارتفعت/.test(L) &&
        /وعوّض جزءاً من الانخفاض نحو .* لأن الإنفاق زاد من/.test(L), L);
    });
    test('نفس الطلبات والمبيعات −٤٥٪: مش «أداء مستقر»', function () {
      var o = head({ rev: 3300 });
      ok(o.tone === 'bad' && !/مستقر/.test(o.title), o.title);
    });
    test('طلبات أكثر والمبيعات −٣٥٪ (في حدود تذبذب العائد): العنوان بيقول إن المبيعات نزلت، مش «لا شيء يستدعي تدخّلك»', function () {
      var o = head({ pur: 26, rev: 3900 });
      ok(o.tone === 'mixed' && /المبيعات أقل بـ٣٥٪/.test(o.title) && /يستحق المراجعة/.test(o.title) && !/لا شيء يستدعي/.test(o.title), o.title);
    });
    test('العائد مقارنةً بالمستهدف (إعدادات التنبيهات): سطر تحت العنوان، وتحته = أحمر', function () {
      var ok3 = head({}, { roas: 3 });
      ok(/أعلى من المستهدف \(×٣\)/.test(ok3.basis), ok3.basis);
      var loss = head({}, { roas: 10 });
      ok(loss.tone === 'bad' && /أقل من المستهدف \(×١٠\)/.test(loss.basis), loss.basis);
      ok(!head({}).basis, 'no target (email summary) = no line');
    });
    test('دولة ضعيفة في حساب مستقر: العنوان «مع أمور تحتاج قرارك أدناه» مش «لا تغيّر يستدعي تدخّلك» (٣٠ حساب بالمحاكاة)', function () {
      var KW = [{ key: 'c1', name: 'A', country: 'SA', share: 0.35, mult: {} }, { key: 'c2', name: 'B', country: 'SA', share: 0.3, mult: {} },
        { key: 'c3', name: 'C', country: 'SA', share: 0.2, mult: {} }, { key: 'c4', name: 'KW', country: 'KW', share: 0.15, mult: { cart: 0.2 } }];
      var bad = 0;
      withLang('ar', function () {
        for (var s = 1; s <= 30; s++) {
          var r = DX.analyze(DX_SIM.simulate({ seed: s * 104729, spend: 400, campaigns: KW }));
          if (r.status !== 'ok') continue;
          var o = DX.compose(r);
          if (o.blocks.some(function (b) { return b.kind === 'decision'; }) && /لا شيء يستدعي|لا تغيّر يستدعي/.test(o.title)) bad++;
        }
      });
      eq(bad, 0);
    });
    test('اختبار العائد مبيطلعش على تذبذب عادي (٦٠ حساب مستقر)', function () {
      var hits = 0;
      for (var s = 1; s <= 60; s++) { var r = DX.analyze(DX_SIM.simulate({ seed: s * 7919, spend: 400 })); if (r.head && r.head.roas && r.head.roas.dir) hits++; }
      ok(hits <= 2, 'false return changes: ' + hits);
    });
    testAsync('اقتراحات ملخص المتجر لمسؤول الإعلانات نفسه: مفيش «اسأل/ناقش مع مسؤول الإعلانات»', function () {
      return fetch('/js/i18n.js?t=' + Date.now()).then(function (r) { return r.text(); }).then(function (src) {
        var keys = {};
        (src.match(/'dx\.[A-Za-z0-9.]+'/g) || []).forEach(function (k) { keys[k.slice(1, -1)] = true; });
        keys = Object.keys(keys);
        ok(keys.length > 100, 'dx keys: ' + keys.length);
        withLang('ar', function () { eq(keys.filter(function (k) { return /مسؤول الإعلانات/.test(t(k)); }), []); });
        withLang('en', function () { eq(keys.filter(function (k) { return /ads manager/i.test(t(k)); }), []); });
      });
    });
  });

  // حملات الوعي والتفاعل والرسائل مش هدفها الطلبات — اتقاس على حساب حقيقي: حملة وعي كلها على إنستغرام
  // خلّت «إنستغرام أضعف من فيسبوك» وهو في الحقيقة أقوى، وحملة الوعي نفسها طلعت في «يحتاج قرارك»
  describe('ملخص المتجر — هدف الحملة', function () {
    var S = '2026-09-21';
    var AW = function (goal) {
      return [{ key: 'c1', name: 'A', country: 'SA', share: 0.35, mult: {} }, { key: 'c2', name: 'B', country: 'SA', share: 0.25, mult: {} },
        { key: 'c3', name: 'C', country: 'SA', share: 0.1, mult: {} }, { key: 'c4', name: 'KW', country: 'KW', share: 0.1, mult: {} },
        { key: 'aw', name: 'Brand', country: 'KW', share: 0.2, goal: goal, mult: { ctr: 0.15, cart: 0.3, cpm: 0.4 } }];
    };
    var runMany = function (n, cfg) {
      var out = [];
      for (var s = 1; s <= n; s++) out.push(DX.analyze(DX_SIM.simulate(Object.assign({ seed: s * 7919, spend: 1500 }, cfg))));
      return out;
    };
    var flagged = function (reps, fn) { return reps.filter(function (r) { return r.segments.some(fn); }).length; };
    test('حملة وعي (٢٠٪ من الإنفاق) مركّزة في دولة: مش بيتحكم عليها بالطلبات، ولا بتظلم الدولة (٣٠ حساب × نوعين تقسيم)', function () {
      // من غير معلومة الهدف (زي قبل كده) الغلط بيطلع في كل حساب تقريباً — ده اللي بيأكد إن الاختبار بيقيس حاجة
      var blind = runMany(30, { campaigns: AW(null) });
      ok(flagged(blind, function (g) { return g.key === 'aw'; }) >= 27, 'without goals the awareness campaign is (wrongly) flagged');
      [undefined, 'judged'].forEach(function (scope) {
        var reps = runMany(30, { campaigns: AW('awareness'), countryScope: scope });
        eq(reps.reduce(function (s, r) { return s + r.segments.length; }, 0), 0, 'no segments (' + (scope || 'all') + ')');
        ok(reps.every(function (r) { return r.other && r.other.share > 0.1; }), 'other spend reported');
      });
      withLang('ar', function () {
        var txt = DX.toText(DX.compose(runMany(1, { campaigns: AW('awareness') })[0]));
        ok(txt.indexOf(t('dx.other.title')) > -1 && txt.indexOf(t('dx.goal.awareness')) > -1, 'note explains it');
        ok(!/dx\.[a-z]/.test(txt), 'no raw keys');
      });
    });
    test('مشكلة حقيقية جنب حملة الوعي بتتكشف: في الدولة (لو الدول متفلترة) أو في الحملة (لو لأ)', function () {
      var ch = [{ from: '2026-08-01', campaign: 'c4', stage: 'cart', factor: 0.35 }];
      var judgedReps = runMany(30, { campaigns: AW('awareness'), countryScope: 'judged', changes: ch });
      ok(flagged(judgedReps, function (g) { return g.dim === 'country' && g.key === 'KW' && g.kind === 'under' && g.stage && g.stage.id === 'cart'; }) >= 22, 'KW at cart');
      var allReps = runMany(30, { campaigns: AW('awareness'), changes: ch });
      ok(flagged(allReps, function (g) { return g.dim === 'campaign' && g.key === 'c4' && g.kind === 'under'; }) >= 22, 'campaign c4');
      ok(allReps.every(function (r) { return !r.segments.some(function (g) { return g.dim === 'country'; }); }), 'mixed country dim never judged');
    });
    test('ميزانية حملة الوعي زادت ٣ أضعاف: «لماذا» بيقول إن الإنفاق انتقل لها — من غير أسباب أداء', function () {
      var reps = runMany(30, { campaigns: AW('awareness'), changes: [{ from: S, campaign: 'aw', spendFactor: 3 }] });
      var withWhy = reps.filter(function (r) { return r.why; });
      var mix = withWhy.filter(function (r) { return r.why.scope && r.why.scope.type === 'mix' && r.why.scope.seg.key === 'aw'; });
      ok(withWhy.length >= 12 && mix.length >= 0.7 * withWhy.length, 'mix toward awareness ' + mix.length + '/' + withWhy.length);
      withLang('ar', function () {
        var b = DX.compose(mix[0]).blocks.filter(function (x) { return x.kind === 'why'; })[0];
        ok(!b.causes && b.check === t('dx.chk.otherMix', { seg: DX.segName('campaign', 'aw', 'Brand') }), 'budget question, not performance causes');
        ok(b.after.some(function (l) { return l.indexOf(t('dx.goal.awareness')) > -1; }), 'names the goal');
      });
      ok(reps.filter(function (r) { return r.other && r.other.spendShift && r.other.spendShift.dir > 0; }).length >= 25, 'spend increase attributed');
    });
    test('حملة هدفها «الزيارات» ومفيش سلة: بتظهر، وأول سبب هو هدف الحملة نفسه', function () {
      var camps = AW('awareness').slice(0, 4).concat([{ key: 'tr', name: 'Boost', country: 'SA', share: 0.2, goal: 'traffic', mult: { cart: 0.02 } }]);
      var r = DX.analyze(DX_SIM.simulate({ seed: 7, spend: 1500, campaigns: camps }));
      var g = r.segments.filter(function (x) { return x.key === 'tr'; })[0];
      ok(g && g.kind === 'under' && g.goal === 'traffic', 'traffic campaign flagged');
      withLang('ar', function () {
        var b = DX.compose(r).blocks.filter(function (x) { return x.fbKey === 'seg:campaign:tr'; })[0];
        eq(b.causes[0], t('dx.cause.goalTraffic'));
        eq(b.check, t('dx.chk.goalTraffic', { seg: DX.segName('campaign', 'tr', 'Boost') }));
      });
    });
    test('جزء بياخد أغلب الإنفاق مش بيتقال عليه «متأخر»، والمواضع والأجهزة مفيهاش «فرصة»', function () {
      var camps = [{ key: 'c1', name: 'Main', country: 'SA', share: 0.85, mult: { pay: 0.4 } }, { key: 'c2', name: 'Small', country: 'KW', share: 0.15, mult: {} }];
      var inp = DX_SIM.simulate({ seed: 11, spend: 2000, campaigns: camps });
      var r = DX.analyze(inp);
      ok(!r.segments.some(function (g) { return g.kind === 'under'; }), 'the 85% segment is not «behind the rest»');
      ok(r.segments.some(function (g) { return g.kind === 'over' && g.key === 'KW'; }), 'the small one shows as the opportunity');
      inp.dims[1].id = 'publisher';
      ok(!DX.analyze(inp).segments.some(function (g) { return g.dim === 'publisher'; }), 'no budget advice on a placement dimension');
    });
    test('حملة بصفر طلبات مش بتخلّي حملة عادية تبان «أرخص بكتير من الباقي»', function () {
      var camps = [{ key: 'c1', name: 'A', country: 'SA', share: 0.25, mult: {} }, { key: 'c2', name: 'B', country: 'SA', share: 0.25, mult: {} },
        { key: 'z', name: 'Zero', country: 'SA', share: 0.35, mult: { cart: 0 } }, { key: 'c4', name: 'Good', country: 'SA', share: 0.15, mult: { pay: 1.5 } }];
      var inputs = [];
      for (var s = 1; s <= 20; s++) inputs.push(DX_SIM.simulate({ seed: s * 7919, spend: 2000, campaigns: camps }));
      var reps = inputs.map(function (x) { return DX.analyze(x); });
      ok(flagged(reps, function (g) { return g.key === 'z' && g.kind === 'under'; }) >= 18, 'zero campaign flagged');
      // من غير التعديل: «Good» (أحسن ١٫٥ مرة بس) قدّام باقي فيه حملة الصفر = أحسن مرتين ونص — كانت هتطلع «فرصة» في أغلب الحسابات
      var rate = function (x, keys) {
        var sp = 0, pu = 0;
        x.dims[0].segs.forEach(function (g) { if (keys.indexOf(g.key) > -1) g.w.forEach(function (w) { if (w) { sp += w.spend; pu += w.pur; } }); });
        return pu / sp;
      };
      ok(inputs.filter(function (x) { return rate(x, ['c4']) / rate(x, ['c1', 'c2', 'z']) >= 2; }).length >= 18, 'the scenario would mislead without the fix');
      // ومعاه: بتطلع بس لو الأرقام نفسها بيّنتها أحسن من الحملات العادية مرتين فعلاً (صدفة نادرة: ١ من ٢٠٠ في المحاكاة)
      var wrong = reps.filter(function (r, i) {
        return r.segments.some(function (g) { return g.key === 'c4' && g.kind === 'over'; }) && rate(inputs[i], ['c4']) / rate(inputs[i], ['c1', 'c2']) < 2;
      }).length;
      eq(wrong, 0, 'never called «much cheaper» unless it really is vs the normal campaigns');
      ok(flagged(reps, function (g) { return g.key === 'c4' && g.kind === 'over'; }) <= 1, 'rare');
    });
    test('كل المنصات: أرقام «المنصة» من غير حملات الأهداف التانية، والأهداف بتتنقل مع الحملات', function () {
      var meta = DX_SIM.simulate({ seed: 21, spend: 1500, campaigns: AW('awareness') }), google = DX_SIM.simulate({ seed: 23, spend: 800 });
      var c = DX.combine([{ platform: 'meta', input: meta }, { platform: 'google', input: google }]);
      eq(DX.combine([{ platform: 'meta', input: Object.assign({}, meta, { today: '2026-09-30' }) }, { platform: 'google', input: google }]).today, '2026-09-30', 'today reaches the merged report');
      var plat = c.dims.filter(function (d) { return d.id === 'platform'; })[0];
      var awW0 = meta.dims[0].segs.filter(function (s) { return s.key === 'aw'; })[0].w[0].spend;
      var metaW0 = meta.daily.filter(function (d) { return d.date >= '2026-09-21'; }).reduce(function (s, d) { return s + d.spend; }, 0);
      eq(plat.scope, 'judged');
      ok(Math.abs(plat.segs[0].w[0].spend - (metaW0 - awW0)) < 0.01, 'meta platform numbers exclude awareness');
      ok(c.other && Math.abs(c.other.w[0].spend - awW0) < 0.01 && c.other.goals.awareness > 0, 'other passed to the engine');
      eq(c.dims.filter(function (d) { return d.id === 'campaign'; })[0].segs.filter(function (s) { return s.key === 'meta:aw'; })[0].goal, 'awareness');
      eq(DX.analyze(c).segments.filter(function (g) { return g.key === 'meta:aw' || g.key === 'meta'; }).length, 0, 'nothing wrongly flagged');
    });
  });

  testAsync('Meta — ملخص المتجر: هدف كل حملة، والتقسيمات من غير حملات الأهداف التانية', function () {
    var real = window.fbPagesPromise, calls = [];
    var row = function (extra) { return Object.assign({ spend: '10', impressions: '1000', inline_link_clicks: '10', actions: [], action_values: [] }, extra); };
    window.fbPagesPromise = function (path, params) {
      calls.push(params);
      if (params.time_increment) return Promise.resolve({ data: [row({ date_start: '2026-09-25' })] });
      if (params.level === 'campaign') return Promise.resolve({ data: [
        row({ campaign_id: '1', campaign_name: 'Brand', objective: 'OUTCOME_AWARENESS', optimization_goal: 'REACH' }),
        row({ campaign_id: '2', campaign_name: 'WhatsApp', objective: 'OUTCOME_SALES', optimization_goal: 'CONVERSATIONS' }),
        row({ campaign_id: '3', campaign_name: 'Boost', objective: 'LINK_CLICKS', optimization_goal: 'NONE' }),
        row({ campaign_id: '4', campaign_name: 'Sales', objective: 'OUTCOME_SALES', optimization_goal: 'Unknown Optimization Goal' })] });
      return Promise.resolve({ data: [row({ country: 'KW', adset_id: 'a', adset_name: 'x', ad_id: 'd', ad_name: 'y', region: 'r', age: '25-34', gender: 'male',
        publisher_platform: 'instagram', platform_position: 'feed', device_platform: 'mobile_app', impression_device: 'iphone' })] });
    };
    return metaDiagnosisInput('act_1', '2026-09-22', '2026-09-28').then(function (inp) {
      window.fbPagesPromise = real;
      eq(inp.dims.filter(function (d) { return d.id === 'campaign'; })[0].segs.map(function (s) { return s.goal; }), ['awareness', 'messages', 'traffic', 'sales']);
      eq(inp.dims.filter(function (d) { return d.id === 'country'; })[0].scope, 'judged');
      ok(calls.filter(function (p) { return p.breakdowns; }).every(function (p) { return p.filtering === DX_JUDGED_FILTER; }), 'breakdowns filtered');
      // مستوى الإعلان بحملات المدى (metaCampaignIds — ٧ نوفمبر ٢٠٢٦) ومن غير فلتر الأهداف، والحملة والمجموعة من غير تصفية
      var lv = calls.filter(function (p) { return p.level && p.fields.indexOf('objective,optimization_goal') > -1; });
      var scope = scopeToCampaigns({}, ['1', '2', '3', '4']).filtering;
      eq(lv.length, 9, 'three levels, three windows');
      // قائمة الحملات بتغطي كل نوافذ المقارنة — لو قصرت عليها بس، أرقام الفترة السابقة كانت هتضيع
      var list = calls.filter(function (p) { return p.level === 'campaign' && /^campaign_id/.test(p.fields); });
      var all = DX.windows('2026-09-22', '2026-09-28', {});
      eq([list.length, JSON.parse(list[0].time_range)], [1, { since: all[all.length - 1].since, until: '2026-09-28' }], 'one list from the oldest window');
      ok(lv.every(function (p) { return p.level === 'ad' ? p.filtering === scope : !p.filtering; }), 'levels carry goals; the ad level scoped to the campaigns only');
      ok(!calls.some(function (p) { return p.time_increment && p.filtering; }), 'daily totals unfiltered (match Ads Manager)');
      var f = JSON.parse(DX_JUDGED_FILTER);
      ok(f[0].value.indexOf('OUTCOME_AWARENESS') > -1 && f[0].value.indexOf('OUTCOME_TRAFFIC') < 0 && f[0].value.indexOf('LINK_CLICKS') < 0 && f[0].value.indexOf('OUTCOME_SALES') < 0, 'objective filter');
      ok(f[1].value.indexOf('CONVERSATIONS') > -1 && f[1].value.indexOf('OFFSITE_CONVERSIONS') < 0, 'messaging ad sets filtered');
    }, function (e) { window.fbPagesPromise = real; throw e; });
  });

  describe('ملخص المتجر — النص والعرض', function () {
    var scenarios = function () {
      var S = '2026-09-21';
      return [
        { spend: 400 }, { spend: 2000, changes: [{ from: S, stage: 'pay', factor: 0.55 }] },
        { spend: 2000, changes: [{ from: S, stage: 'cart', factor: 1.6 }] },
        { spend: 400, changes: [{ from: S, spendFactor: 0.55 }] },
        { spend: 400, changes: [{ from: '2026-09-26', stage: 'pay', factor: 0 }] },
        { spend: 2000, changes: [{ from: S, spendFactor: 1.9 }, { from: S, stage: 'pay', factor: 0.65 }] },
        { spend: 2000, changes: [{ from: S, campaign: 'c1', stage: 'pay', factor: 0.3 }, { from: S, campaign: 'c2', stage: 'pay', factor: 1.7 }] },
        { spend: 600, campaigns: [{ key: 'c1', name: 'Scale <A>', country: 'SA', share: 0.5, mult: {} }, { key: 'c2', name: 'B', country: 'SA', share: 0.3, mult: {} },
          { key: 'c3', name: 'حملة الكويت', country: 'KW', share: 0.2, mult: { cart: 0.2 } }] }
      ].map(function (cfg, i) { return DX.analyze(DX_SIM.simulate(Object.assign({ seed: 104729 * (i + 1) }, cfg))); });
    };
    test('كل النصوص في اللغتين: مفيش مفتاح ناقص ولا {متغيّر} ظاهر ولا undefined/NaN', function () {
      var reps = scenarios(), bad = [];
      ['ar', 'en'].forEach(function (l) {
        withLang(l, function () {
          reps.forEach(function (r, i) {
            var txt = DX.toText(DX.compose(r), 'Store');
            if (/\{\w+\}|\bdx\.[a-z]|undefined|NaN|null/.test(txt)) bad.push(l + ' #' + i + ': ' + (txt.match(/\{\w+\}|\bdx\.[a-zA-Z.]+|undefined|NaN|null/) || [])[0]);
          });
        });
      });
      eq(bad, []);
    });
    test('الأسماء جوه البلوكات بتتعرض كنص (مفيش HTML من اسم حملة)', function () {
      var r = scenarios()[7], o = DX.compose(r);
      var html = o.blocks.map(dxBlockHtml).join('');
      ok(html.indexOf('<A>') < 0, 'raw tag leaked');
    });
    test('«تحقّق أولاً» ووسائل الدفع: كي-نت بتتذكر بس لو الخلل عند الدفع، مش عند السلة', function () {
      var r = scenarios()[7];
      var kw = r.segments.filter(function (g) { return g.key === 'KW'; })[0];
      ok(kw && kw.stage && kw.stage.id === 'cart', 'KW at cart');
      withLang('ar', function () { ok(DX.toText(DX.compose(r)).indexOf('كي-نت') < 0, 'no KNET for a cart problem'); });
    });
    test('ملاحظة صاحب المتجر («كان فيه عرض») بتظهر كسياق في الفترة اللي بعدها، والسبب اللي حصل قبل كده بيطلع الأول', function () {
      var inp = DX_SIM.simulate({ seed: 104729 * 2, spend: 2000, changes: [{ from: '2026-09-21', stage: 'pay', factor: 0.55 }] });
      inp.feedback = [{ since: '2026-09-14', until: '2026-09-20', block: 'why', verdict: 'no', reasons: ['offer', 'price'] },
        { since: '2026-08-01', until: '2026-08-07', block: 'why', verdict: 'yes', reasons: ['site'] }];
      var r = DX.analyze(inp);
      eq(r.owner.inPrev.sort(), ['offer', 'price']);
      withLang('ar', function () {
        var txt = DX.toText(DX.compose(r));
        ok(txt.indexOf('حسب ملاحظتك عن فترة المقارنة') > -1, 'owner context shown');
        var why = DX.compose(r).blocks.filter(function (b) { return b.kind === 'why'; })[0];
        ok(why && why.causes[0].indexOf(t('dx.cause.seen').trim()) > -1, 'the cause the owner reported comes first, marked');
      });
    });
    test('زر التقييم: «لا» بتتحفظ على الجهاز وبتفتح «ما الذي حدث فعلاً؟»، وبعد الحفظ بيظهر الشكر', function () {
      var saved = localStorage.getItem('acc.dx.fb.v1');
      try {
        localStorage.removeItem('acc.dx.fb.v1');
        var r = DX.analyze(DX_SIM.simulate({ seed: 104729 * 2, spend: 2000, changes: [{ from: '2026-09-21', stage: 'pay', factor: 0.55 }] }));
        DX_ON = true; activeSources.meta = 'act_1';
        dxState = { status: 'ready', key: 'k', report: r, account: 'Store', accountId: 'meta:act_1' };
        renderDiagnosis();
        var no = document.querySelector('#storeSec [data-dx-fb="no"]');
        ok(no, 'question shown');
        no.click();
        ok(document.querySelector('#storeSec .dx-fb-form'), 'details form opened');
        document.querySelector('#storeSec [data-dx-reason="stock"]').click();
        document.querySelector('#storeSec .dx-fb-note').value = 'نفد المقاس الأكثر طلباً';
        document.querySelector('#storeSec [data-dx-fb-save]').click();
        var list = JSON.parse(localStorage.getItem('acc.dx.fb.v1'))['meta:act_1'];
        eq([list.length, list[0].verdict, list[0].reasons[0], list[0].note], [1, 'no', 'stock', 'نفد المقاس الأكثر طلباً']);
        ok(document.querySelector('#storeSec .dx-fb-done'), 'thanks shown');
        ok(!document.querySelector('#storeSec .dx-fb-form'), 'form closed');
      } finally {
        if (saved == null) localStorage.removeItem('acc.dx.fb.v1'); else localStorage.setItem('acc.dx.fb.v1', saved);
        DX_ON = false; dxReset(); document.getElementById('storeSec').hidden = true;
      }
    });
    test('الألوان (أخضر/أحمر) على الأرقام بس لو التغيّر حقيقي', function () {
      var calm = scenarios()[0];
      ok(DX.compose(calm).kpis.every(function (k) { return !k.sig; }), 'no colours on a steady account');
    });
    // حساب حقيقي (١٠ أكتوبر ٢٠٢٦): العائد −٤٢٪ وتكلفة الطلب +٥٨٪ والعنوان «ضمن التذبذب المعتاد، ولا شيء يستدعي تدخّلك»،
    // وصاحب المنتج: «الفرق كبير ومع ذلك يقول ضمن التذبذب» — حجم الفرق بيحدد الانتباه
    test('فرق ٢٠٪ أو أكتر للأسوأ ومش مؤكد: العنوان «يستحق المراجعة» بالكهرماني، ومفيش «ضمن التذبذب» ولا «صدفة» في أي نص', function () {
      var seen = 0, bad = [];
      withLang('ar', function () {
        for (var s = 1; s <= 60; s++) {
          var o = DX.compose(DX.analyze(DX_SIM.simulate({ seed: s * 104729 + 7, spend: 400 })));
          var all = o.title + ' ' + o.blocks.map(function (b) { return (b.lines || []).join(' '); }).join(' ');
          if (/صدفة|ضمن التذبذب/.test(all)) bad.push('wording: ' + all.slice(0, 160));
          // من ٢٥ أكتوبر «يستحق المراجعة» في العنوان بس (صندوق «لماذا تغيّرت مبيعاتك؟» بالتفكيك من غير جمل التأكد)
          if (!/يستحق المراجعة/.test(o.title)) continue;
          seen++;
          if (o.tone !== 'mixed') bad.push(o.tone + ': ' + o.title);
        }
      });
      ok(seen >= 3, 'big unconfirmed declines: ' + seen);
      eq(bad, []);
    });
    // حساب حقيقي ١٠ أكتوبر ٢٠٢٦: «ولأن الفرق كبير، يستحق المراجعة…» اتكررت ٣ مرات و«هذه إشارة أولية…» مرتين في صندوق سبب الحكم
    test('سبب الحكم: جملة التأكد و«يستحق المراجعة» مرة واحدة بالكتير، ومفيش «يستحق المراجعة» في السطور لو الخلاصة بتقولها — والمبيعات قبل تكلفة الطلب', function () {
      var bad = [], checked = 0;
      withLang('ar', function () {
        var review = t('dx.cert.review').trim(), verdict = t('dx.verdict.review');
        for (var s = 1; s <= 60; s++) {
          var o = DX.compose(DX.analyze(DX_SIM.simulate({ seed: s * 104729 + 7, spend: 400 })));
          if (o.main == null || o.main < 0) continue;
          var L = o.blocks[o.main].lines || [], all = L.join(' ');
          checked++;
          var count = function (p) { return all.split(p).length - 1; };
          if (count(review) > 1) bad.push('review x' + count(review) + ': ' + all.slice(0, 200));
          if (L.indexOf(verdict) > -1 && count(review) > 0) bad.push('review + verdict: ' + all.slice(0, 200));
          ['أولية؛', 'الاتجاه واضح، لكن', 'يتغيّر هذا الرقم عادةً'].forEach(function (p) { if (count(p) > 1) bad.push(p + ' x' + count(p)); });
          var iRev = L.findIndex(function (l) { return /^المبيعات .* مقابل/.test(l); }), iCpa = L.findIndex(function (l) { return /^تكلفة الطلب (ارتفعت|انخفضت)/.test(l); });
          if (iRev > -1 && iCpa > -1 && iRev > iCpa) bad.push('order: ' + all.slice(0, 200));
        }
      });
      ok(checked >= 20, 'checked ' + checked);
      eq(bad, []);
    });
    // مراجعة ١١ أكتوبر ٢٠٢٦ (حساب حقيقي): تكلفة الطلب +٣٢٪ واتقال «يتغيّر هذا الرقم عادةً بهذا القدر» — نفس شكوى صاحب المنتج
    test('فرق ٢٠٪ أو أكتر مش مؤكد: مبيتقالش إنه تغيّر معتاد، والفرق الصغير بيتقال', function () {
      withLang('ar', function () {
        var big = DX._.certText(0.3, 50, 31, 0.32), small = DX._.certText(0.3, 50, 31, 0.12), neg = DX._.certText(-0.3, 50, 31, -0.46);
        ok(!/عادةً/.test(big) && /لم يتضح بعد/.test(big) && /٥٠ ثم ٣١/.test(big), big);
        ok(!/عادةً/.test(neg), neg);
        ok(/عادةً/.test(small), small);
      });
    });
    test('ألوان الأرقام بتلات درجات: مؤكد بخلفية، مرجّح من غير خلفية، والباقي رمادي — والمرجّح عمره ما يبقى مؤكد', function () {
      var soft = 0, bad = 0;
      for (var s = 1; s <= 60; s++) {
        var o = DX.compose(DX.analyze(DX_SIM.simulate({ seed: s * 104729 + 7, spend: 2000 })));
        (o.kpis || []).forEach(function (k) { if (k.soft) { soft++; if (k.sig) bad++; } });
      }
      ok(soft >= 1, 'some probable moves: ' + soft);
      eq(bad, 0);
      var html = dxKpiHtml({ label: 'x', value: '1', prev: '1', pct: 0.3, sig: 0, soft: 1, goodUp: true });
      ok(/dx-kpi-pct good soft/.test(html) && !/strong/.test(html), html);
      ok(/good strong/.test(dxKpiHtml({ label: 'x', value: '1', prev: '1', pct: 0.3, sig: 1, soft: 0, goodUp: true })), 'confirmed = filled');
    });
    // ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦: «سبب الحكم يتحدث عن الصدفة وده غير مناسب» — الثقة بكلام تجاري من غير نسب احتمالات
    var arNum = function (s) { return Number(String(s).replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }).replace('٫', '.')); };
    // من ٢٥ أكتوبر جمل التأكد مش في صندوق «لماذا تغيّرت مبيعاتك؟» (التفكيك حساب دقيق) — الدرجات نفسها بكلام تجاري لما تتقال
    test('درجة التأكد بكلام تجاري: «الاتجاه واضح» / «إشارة أولية» / «يتغيّر عادةً بهذا القدر» من غير نسب احتمالات — ٤٠ حساب', function () {
      var bad = [];
      withLang('ar', function () {
        for (var s = 1; s <= 40; s++) {
          var r = DX.analyze(DX_SIM.simulate({ seed: s * 7919, spend: 400 }));
          if (r.status !== 'ok') continue;
          DX.compose(r).blocks.forEach(function (b) {
            (b.lines || []).concat(b.after || []).forEach(function (l) { if (/من الحالات|صدفة/.test(l)) bad.push(l); });
          });
        }
        ok(/الاتجاه واضح/.test(DX._.certText(-2.5, 140, 120, -0.15)), 'likely');
        ok(/إشارة أولية/.test(DX._.certText(-1.2, 140, 120, -0.15)), 'notable');
        ok(/يتغيّر هذا الرقم عادةً/.test(DX._.certText(-0.3, 140, 120, -0.12)), 'normal');
      });
      eq(bad, []);
    });
    // قرار صاحب المنتج ٢٥ أكتوبر ٢٠٢٦: «سبب الحكم» كان بيكرر أرقام الخانات — التفكيك بالفلوس (Google Ads Explanations، Optmyzr PPC
    // Investigator، وتحليل الفروقات). أرقام حساب حقيقي: المبيعات ٣٠٬٩١٢ ← ٢٠٬٤٣٠، الطلبات ١٤٢ ← ١٢١، الإنفاق ٦٬١٨١ ← ٦٬١٨٨
    test('«لماذا تغيّرت مبيعاتك؟»: المبيعات = الإنفاق ÷ تكلفة الطلب × متوسط قيمة الطلب — الأنصبة مجموعها الفرق بالظبط، وأغلب الانخفاض من قيمة الطلب', function () {
      var d = DX._.salesDrivers({ prev: { spend: 6181, pur: 142, rev: 30912 }, cur: { spend: 6188, pur: 121, rev: 20430 } }), by = {};
      d.parts.forEach(function (p) { by[p.id] = p.v; });
      ok(Math.abs(by.spend + by.cpa + by.aov - (20430 - 30912)) < 1e-6, 'the parts add up to the difference: ' + JSON.stringify(by));
      eq([Math.round(by.aov), Math.round(by.cpa), Math.round(by.spend)], [-6431, -4079, 29]);
      withLang('ar', function () {
        var L = DX._.driversLine(d, function (v) { return money(v, 'USD'); });
        ok(/^انخفضت المبيعات ١٠٬٤٨٢ \$ \(٣٤٪\): نحو ٦٬٤٣١ \$ لأن متوسط قيمة الطلب نزل من .* ونحو ٤٬٠٧٩ \$ لأن تكلفة الطلب ارتفعت من /.test(L) &&
          !/الإنفاق/.test(L), 'spend (0.3% of it) is left out: ' + L);
      });
      // فحص حي ٢٦ أكتوبر (سناب شات): العامل العكسي ٩٪ من الفرق بيتقال — وإلا الأرقام المذكورة مجموعها أكبر من الزيادة
      var sn = DX._.salesDrivers({ prev: { spend: 656, pur: 17, rev: 1172 }, cur: { spend: 1386, pur: 31, rev: 6151 } });
      withLang('ar', function () {
        var L2 = DX._.driversLine(sn, function (v) { return money(v, 'USD'); });
        ok(/^ارتفعت المبيعات ٤٬٩٧٩ \$/.test(L2) && /وقلّل من الزيادة نحو .* لأن تكلفة الطلب ارتفعت/.test(L2), L2);
      });
      // من غير قيمة مبيعات: الطلبات = الإنفاق ÷ تكلفة الطلب
      var p = DX._.salesDrivers({ prev: { spend: 1000, pur: 50, rev: 0 }, cur: { spend: 500, pur: 25, rev: 0 } });
      eq([p.metric, p.parts.length, Math.round(p.parts[0].v), Math.round(p.parts[1].v)], ['pur', 2, -25, 0]);
      eq(DX._.salesDrivers({ prev: { spend: 0, pur: 0, rev: 0 }, cur: { spend: 10, pur: 1, rev: 5 } }), null, 'nothing to split');
    });
    test('«لماذا تغيّرت مبيعاتك؟»: أكبر المساهمين من الحملات لو مجموعها بيطابق الحساب، وإلا التقسيم اللي بعدها، وفي اتجاه الفرق بس', function () {
      var seg = function (key, cur, prev) { return { key: key, name: key.toUpperCase(), w: [{ rev: cur }, { rev: prev }] }; };
      var W = [{ rev: 900 }, { rev: 1000 }];
      var camp = { id: 'campaign', segs: [seg('c1', 500, 700), seg('c2', 300, 250), seg('c3', 100, 50)] };
      eq(DX._.salesMovers([camp], W, 'rev'), { dim: 'campaign', field: 'rev', list: [{ key: 'c1', name: 'C1', v: -200 }] }, 'the rises are not «behind the drop»');
      // الحملات مجموعها أقل من الحساب بكتير (بيانات ناقصة): المنصات
      var partial = { id: 'campaign', segs: [seg('c1', 300, 700), seg('c2', 100, 100)] };
      var plat = { id: 'platform', segs: [seg('meta', 600, 800), seg('snapchat', 300, 200)] };
      eq(DX._.salesMovers([partial, plat], W, 'rev').dim, 'platform');
      eq(DX._.salesMovers([camp], [{ rev: 1000 }, { rev: 1000 }], 'rev'), null, 'no difference');
    });
    test('«لماذا تغيّرت مبيعاتك؟»: «تحقّق أولاً» بأكبر سبب — قيمة الطلب = المتجر، والبلوك بيقول مين يخصه', function () {
      var mk = function (revFor) {
        var d = [];
        for (var k = '2026-08-20'; k <= '2026-09-29'; k = shiftKey(k, 1)) d.push({ date: k, spend: 100, imp: 5000, clicks: 100, atc: 20, ic: 10, pur: 5, rev: revFor(k) });
        return d;
      };
      withLang('ar', function () {
        var o = DX.compose(DX.analyze({ since: '2026-09-27', until: '2026-09-29', consecutive: true, currency: 'USD',
          daily: mk(function (k) { return k >= '2026-09-27' ? 200 : 500; }), dims: [] }));
        var b = o.blocks[o.main];
        eq([b.verdictTitle, b.check, b.owner], [t('dx.drv.title.rev'), t('dx.drv.chk.aov'), 'store']);
        ok(!b.causes && !b.conf, 'no stage causes: the cost per order did not move');
        // المبيعات زي ما هي ومفيش عامل يتقال: مفيش بلوك (كان بيكرر خانة المبيعات)
        var flat = DX.compose(DX.analyze({ since: '2026-09-27', until: '2026-09-29', consecutive: true, currency: 'USD', daily: mk(function () { return 500; }), dims: [] }));
        ok(flat.main < 0 || (flat.blocks[flat.main].lines || []).every(function (l) { return !/المبيعات/.test(l); }), 'flat: no repeated line');
      });
    });
    // فحص حي ٢٦ أكتوبر: الأزرار كانت في آخر الصندوق، والاسم الإنجليزي بيتقلب جوه النص العربي
    test('«لماذا تغيّرت مبيعاتك؟»: زرار إعلانات كل حملة من أكبر المساهمين تحت سطرها على طول، واسمها معزول الاتجاه', function () {
      var old = candidates;
      try {
        candidates = [{ id: 'a1', source: 'meta:act_1', platform: 'Meta', campaignId: 'c9', campaignName: '[KW]-Sales-Catalogue' }];
        withLang('ar', function () {
          var line = t('dx.drv.movers.up', { list: 'X' });
          var b = { lines: ['L1', line], movers: { dim: 'campaign', list: [{ key: 'c9', name: '[KW]-Sales-Catalogue' }, { key: 'gone', name: 'Gone' }] } };
          var html = withMovers('<article><p>L1</p><p>' + esc(line) + '</p><p>after</p></article>', b);
          var at = html.indexOf('class="dx-movers"');
          ok(at > html.indexOf(esc(line)) && at < html.indexOf('<p>after'), html);
          eq((html.match(/data-campaign=/g) || []).length, 1, 'only campaigns with ads in the list');
          ok(html.indexOf('⁨[KW]-Sales-Catalogue⁩') > -1, 'isolated name');
        });
      } finally { candidates = old; }
    });
    test('«لماذا تغيّرت مبيعاتك؟» ظاهر بين الأرقام والتنبيهات بلون الحكم، ومبيتكررش في الشرح المطوي — والحساب الهادي من غير صندوق', function () {
      var r = scenarios().filter(function (x) { return withLang('ar', function () { return DX.compose(x).main >= 0; }); })[0];
      try {
        DX_ON = true; activeSources.meta = 'act_1';
        dxState = { status: 'ready', key: 'k', report: r, account: 'Store', accountId: 'meta:act_1' };
        withLang('ar', function () { renderDiagnosis(); });
        var o = dxState.composed, box = document.querySelector('#dxVerdict .dx-verdict');
        ok(o.main >= 0 && box, 'verdict box shown');
        ok(box.classList.contains(o.tone), 'coloured by the verdict');
        ok(/لماذا تغيّرت (مبيعاتك|طلباتك)؟/.test(box.textContent) && /(انخفضت|ارتفعت|زادت) (المبيعات|الطلبات)|قريبة من الفترة السابقة/.test(box.textContent) &&
          !/كل ١٠٠ /.test(box.textContent), 'the split, not the KPI repeated: ' + box.textContent.slice(0, 160));
        ok(!document.querySelector('#dxMore').textContent.includes(o.blocks[o.main].lines[0]), 'not repeated in the folds');
        var ids = ['dxToday', 'dxVerdict', 'topAlerts'].map(function (id) { return document.getElementById(id); });
        ok(ids[0].compareDocumentPosition(ids[1]) & 4 && ids[1].compareDocumentPosition(ids[2]) & 4, 'between the numbers and the alerts');
      } finally {
        DX_ON = false; dxReset(); document.getElementById('storeSec').hidden = true;
      }
    });
  });

  describe('ملخص المتجر — كل المنصات', function () {
    var S = '2026-09-21';
    var src = function (platform, seed, cfg) {
      return { platform: platform, input: DX_SIM.simulate(Object.assign({ seed: seed, spend: 2000 }, cfg || {})) };
    };
    test('النزول في Google بس: التفسير بيحدد «Google Ads» كمكان التغيّر', function () {
      var hit = 0;
      for (var s = 1; s <= 8; s++) {
        var list = [src('meta', s * 104729), src('google', s * 7919, { changes: [{ from: S, stage: 'pay', factor: 0.3 }] })];
        var r = DX.analyze(DX.combine(list));
        if (r.why && r.why.scope && r.why.scope.dim === 'platform' && r.why.scope.seg.key === 'google') hit++;
      }
      ok(hit >= 6, 'localized to Google ' + hit + '/8');
    });
    test('المشتريات وقفت في Snapchat بس: بتظهر في «كل المنصات» باسم المنصة حتى لو الإجمالي فيه مبيعات', function () {
      var list = [src('meta', 104729), src('snapchat', 7919, { spend: 600, changes: [{ from: '2026-09-26', stage: 'pay', factor: 0 }] })];
      var reps = list.map(function (x) { return { platform: x.platform, report: DX.analyze(x.input) }; });
      var r = DX.attachPlatforms(DX.analyze(DX.combine(list)), reps);
      ok(r.zeroRuns.some(function (z) { return z.platform === 'snapchat' && z.now; }), 'snapchat zero run attached');
      withLang('ar', function () { ok(DX.toText(DX.compose(r)).indexOf('Snapchat: ') > -1, 'title names the platform'); });
    });
    test('الحملات بتتحط جنب بعض بمفتاح فيه المنصة، والدول بتتجمع بالرمز', function () {
      var list = [src('meta', 11), src('google', 13)];
      var c = DX.combine(list);
      var camp = c.dims.filter(function (d) { return d.id === 'campaign'; })[0];
      ok(camp.segs.some(function (sg) { return sg.key === 'google:c1'; }) && camp.segs.some(function (sg) { return sg.key === 'meta:c1'; }), 'prefixed keys');
      var sa = c.dims.filter(function (d) { return d.id === 'country'; })[0].segs.filter(function (sg) { return sg.key === 'SA'; })[0];
      var sum = list.reduce(function (s, x) { return s + x.input.dims[1].segs.filter(function (g) { return g.key === 'SA'; })[0].w[0].spend; }, 0);
      ok(Math.abs(sa.w[0].spend - sum) < 1e-6, 'countries summed');
      withLang('ar', function () { eq(DX.segName('campaign', 'google:c1', 'Search'), 'حملة «⁨Search⁩» على Google Ads'); });
    });
    // طلب صاحب المنتج ٢٥ أكتوبر: «كل المنصات» افتراضياً وجنبه كل منصة متصلة بلونها وشعارها، وأكتر من منصة مع بعض، والعملات
    // المختلفة بسعر الربط الرسمي (كانت: عملة مختلفة = مفيش «كل المنصات»)
    // طلب صاحب المنتج ٢٦ أكتوبر: «يظهر اسم آخر حساب فقط، ولا تحديد للحسابات المختارة، ولا بحث»
    test('اختيار الحسابات: الزرار بالحساب المختار في كل منصة متصلة، والقائمة فيها ✓ جنب المختار وبحث بالاسم، والاختيار بيحمّل الحساب', function () {
      var old = { opts: Object.assign({}, platformOptions), act: Object.assign({}, activeSources), load: window.loadSource }, asked = [];
      try {
        platformOptions.meta = [{ value: 'act_1', label: 'Meta — Level Up' }, { value: 'act_2', label: 'Meta — Second Store' }];
        platformOptions.snapchat = [{ value: 'sn1', label: 'Snapchat — levelupkwt Self Service' }];
        delete platformOptions.google; delete platformOptions.tiktok;
        activeSources.meta = 'act_1'; activeSources.snapchat = 'sn1';
        window.loadSource = function (p, id) { asked.push([p, id]); };
        withLang('ar', function () {
          renderAccountPicker();
          var btn = document.getElementById('acctPickBtn');
          ok(!document.getElementById('acctPicker').hidden, 'shown');
          eq(Array.prototype.map.call(btn.querySelectorAll('.acct-pick-name'), function (s) { return s.textContent; }), ['Level Up', 'levelupkwt Self Service'], 'both platforms');
          btn.click();
          var list = document.getElementById('acctList');
          ok(!document.getElementById('acctPanel').hidden, 'panel open');
          eq(Array.prototype.map.call(list.querySelectorAll('.acct-opt.on'), function (b) { return b.getAttribute('data-acct-id'); }), ['act_1', 'sn1'], 'the selected one in each platform');
          // ٢ نوفمبر ٢٠٢٦: كل صف مربع اختيار، وشعار منصته جنبه، والمجموعة بلون المنصة
          eq(list.querySelectorAll('.acct-opt[aria-checked="true"]').length, 2, 'المختار في كل منصة');
          eq(list.querySelectorAll('.acct-opt .plat-logo').length, 3, 'شعار المنصة جنب كل حساب');
          ok(list.querySelector('.acct-group.plat-meta') && list.querySelector('.acct-group.plat-snapchat'), 'كل مجموعة بلون منصتها');
          ok(list.querySelector('.acct-opt.plat-snapchat'), 'والصف كمان');
          // لكل مربع اسم صريح فيه المنصة (قارئ الشاشة كان بيقول «مربع اختيار» من غير اسم — ٣ نوفمبر ٢٠٢٦)
          eq(Array.prototype.map.call(list.querySelectorAll('.acct-opt'), function (b) { return b.getAttribute('aria-label'); }),
            ['Meta — Level Up', 'Meta — Second Store', 'Snapchat — levelupkwt Self Service'], 'اسم كل مربع');
          var search = document.getElementById('acctSearch');
          search.value = 'second'; search.dispatchEvent(new Event('input'));
          eq(Array.prototype.map.call(list.querySelectorAll('[data-acct-id]'), function (b) { return b.getAttribute('data-acct-id'); }), ['act_2'], 'search by name');
          search.value = 'zzz'; search.dispatchEvent(new Event('input'));
          ok(/لا توجد حسابات بهذا الاسم/.test(list.textContent), 'no match');
          search.value = 'act_2'; search.dispatchEvent(new Event('input'));
          list.querySelector('[data-acct-id="act_2"]').click();
          eq(asked, [['meta', 'act_2']], 'picking loads the account');
          // القائمة بتفضل مفتوحة بعد الاختيار — بتتقفل بـ«تم» أو بضغطة برّه (طلب صاحب المنتج ٢ نوفمبر ٢٠٢٦)
          ok(!document.getElementById('acctPanel').hidden, 'لازم تفضل مفتوحة بعد الاختيار');
          // الضغط على المختار تاني = إلغاء الاختيار، والمنصة بتفضل مربوطة (القائمة لسه فيها حساباتها)
          activeSources.meta = 'act_2';
          renderAccountList();
          list.querySelector('[data-acct-id="act_2"]').click();
          eq(activeSources.meta, undefined, 'الضغطة التانية بتلغي الاختيار');
          eq((platformOptions.meta || []).length, 2, 'والمنصة لسه مربوطة بحساباتها');
          eq(asked.length, 1, 'وإلغاء الاختيار مبيحمّلش حاجة');
          ok(!document.getElementById('acctPanel').hidden, 'والقائمة لسه مفتوحة');
          document.getElementById('acctDone').click();
          ok(document.getElementById('acctPanel').hidden, '«تم» بتقفلها');
        });
      } finally {
        Object.keys(platformOptions).forEach(function (k) { delete platformOptions[k]; }); Object.assign(platformOptions, old.opts);
        Object.keys(activeSources).forEach(function (k) { delete activeSources[k]; }); Object.assign(activeSources, old.act);
        window.loadSource = old.load;
        renderAccountPicker();
      }
    });
    test('اختيار المنصات: من منصة لتانية بضغطة لو الاتنين = كل المنصات، والجمع بيفضل لو فيه منصة تالتة', function () {
      var prev = window.connectedPlats;
      try {
        window.connectedPlats = function () { return ['meta', 'snapchat']; };
        platSel = null; pickPlat('meta'); eq(platSel, ['meta']);
        pickPlat('snapchat'); eq(platSel, ['snapchat'], 'Meta → Snapchat in one click');
        pickPlat('snapchat'); eq(platSel, null, 'the picked one again = all platforms');
        window.connectedPlats = function () { return ['meta', 'google', 'snapchat']; };
        platSel = null; pickPlat('meta'); pickPlat('snapchat'); eq(platSel, ['meta', 'snapchat'], 'two of three together');
        pickPlat('google'); eq(platSel, ['google'], 'the third would make all of them: switch to it');
        pickPlat('meta'); pickPlat('all'); eq(platSel, null, '«all platforms» from its own chip');
      } finally { window.connectedPlats = prev; platSel = null; }
    });
    test('اختيار المنصات: «كل المنصات» افتراضياً وكل منصة بلونها وشعارها، والضغط بيضيف ويشيل، والعملات بسعر الربط', function () {
      var a = src('meta', 21), b = src('google', 23);
      var oldOpts = { meta: platformOptions.meta, google: platformOptions.google };
      var kept = localStorage.getItem('acc.currency');
      DX_ON = true; activeSources.meta = 'act_1'; activeSources.google = '123';
      platformOptions.meta = [{ value: 'act_1', label: 'Meta — Store One' }];
      platformOptions.google = [{ value: '123', label: 'Google Ads — G Store' }];
      var chips = function () {
        return Array.prototype.map.call(document.querySelectorAll('#dxBody [data-plat-pick]'), function (x) { return x.getAttribute('data-plat-pick') + (x.classList.contains('active') ? '*' : ''); });
      };
      try {
        platSel = null;
        dxState.sources = { meta: { status: 'ready', key: 'm', gen: 1, input: a.input, report: DX.analyze(a.input), account: 'M', accountId: 'meta:1' },
          google: { status: 'ready', key: 'g', gen: 1, input: b.input, report: DX.analyze(b.input), account: 'G', accountId: 'google:1' } };
        dxRecompute();
        eq([chips(), dxState.view, dxState.accountId], [['all*', 'meta', 'google'], 'all', 'all:meta:1,google:1']);
        ok(Math.abs(dxState.report.cur.spend - DX.analyze(a.input).cur.spend - DX.analyze(b.input).cur.spend) < 1e-6, 'both platforms added up');
        ok(document.querySelector('#dxBody .plat-meta .plat-logo') && document.querySelector('#dxBody .plat-google .plat-logo'), 'each platform with its logo');
        // اسم الحساب جنب المنصة (القائمة فوق بتقول حساب منصة واحدة بس)
        var chip = document.querySelector('#dxBody [data-plat-pick="meta"]'), name = chip.querySelector('.dx-view-acct');
        eq([name && name.textContent, chip.title], ['Store One', 'Store One'], 'the chip names its account');
        ok(!document.querySelector('#dxBody [data-plat-pick="all"] .dx-view-acct'), '«all platforms» has no single account');
        // منصة لوحدها (الضغط على اسم الحساب جوه الزرار كمان)، وتانية بتتضاف، والمختارة بتتشال
        document.querySelector('#dxBody [data-plat-pick="google"] .dx-view-acct').click();
        eq([platSel, chips(), dxState.view, dxState.accountId], [['google'], ['all', 'meta', 'google*'], 'google', 'google:1']);
        // ملاحظته ٢٥ أكتوبر: من منصة لتانية بضغطة (كانت الاتنين = «كل المنصات»)
        document.querySelector('#dxBody [data-plat-pick="meta"]').click();
        eq([platSel, chips(), dxState.view], [['meta'], ['all', 'meta*', 'google'], 'meta'], 'from Google to Meta in one click');
        document.querySelector('#dxBody [data-plat-pick="meta"]').click();
        eq([platSel, chips()], [null, ['all*', 'meta', 'google']], 'nothing left = all platforms');
        // عملة مختلفة مربوطة بالدولار: بيتجمعوا بسعر الربط (Google بالدولار ×٣٫٧٥ لو العرض بالريال) وجملة بتقول كده
        b.input.currency = 'USD';
        dxState.sources.google = Object.assign({}, dxState.sources.google, { input: b.input, report: DX.analyze(b.input), gen: 2 });
        setCurPref('SAR');
        withLang('ar', function () { dxRecompute(); });
        ok(dxState.report && dxState.sel.conv && dxState.sel.conv.to === 'SAR', JSON.stringify(dxState.sel.conv));
        ok(Math.abs(dxState.report.cur.spend - DX.analyze(a.input).cur.spend - DX.analyze(b.input).cur.spend * 3.75) < 1e-6, 'dollars converted at 3.75');
        ok(/بسعر الربط الرسمي بالدولار \(١ \$ = ٣٫٧٥ ر\.س\)/.test(document.getElementById('dxBody').textContent), 'the note says so, with the official rate: ' + document.getElementById('dxBody').textContent.slice(0, 300));
        // عملة مش مربوطة (الجنيه المصري): منقدرش نجمع، والملخص بيقول اختار منصة
        b.input.currency = 'EGP';
        dxState.sources.google = Object.assign({}, dxState.sources.google, { gen: 3 });
        withLang('ar', function () { dxRecompute(); });
        eq([dxState.sel.blocked, !!dxState.report], ['currency', false]);
        ok(/اختر منصة واحدة لترى ملخصها/.test(document.getElementById('dxBody').textContent) && chips().length === 3, 'note and chips stay');
      } finally {
        platSel = null;
        if (kept == null) localStorage.removeItem('acc.currency'); else localStorage.setItem('acc.currency', kept);
        platformOptions.meta = oldOpts.meta; platformOptions.google = oldOpts.google;
        DX_ON = false; dxReset(); document.getElementById('storeSec').hidden = true;
      }
    });
    // بيانات صناعية أرقامها معروفة: ١٠٠ طلب في الأسبوع بمتوسط ١٠٠ وإنفاق ٧٬٠٠٠، والأسبوع الحالي بمضاعفات
    var dxDays = function (curPur, curRev) {
      var since = '2026-10-11', until = '2026-10-17', ws = DX.windows(since, until, false), rows = [];
      for (var k = ws[ws.length - 1].since; k <= until; k = shiftKey(k, 1)) {
        var cur = k >= since, pur = 100 / 7;
        rows.push({ date: k, spend: 1000, imp: 100000, clicks: 2000, atc: 200, ic: 100, pur: pur * (cur ? curPur : 1), rev: pur * 100 * (cur ? curRev : 1) });
      }
      return { since: since, until: until, currency: 'SAR', daily: rows, dims: [] };
    };
    var kpi = function (r, id) { return DX.compose(r).kpis.filter(function (k) { return k.id === id; })[0]; };
    test('لون «المبيعات» من اختبار المبيعات نفسها: طلبات +٨٠٪ مؤكدة ومتوسط القيمة نزل = مبيعات +٢٪ من غير «مؤكد» (ر٧١)', function () {
      var r = DX.analyze(dxDays(1.8, 1.02));
      eq(kpi(r, 'orders').sig, 1, 'the orders change itself is confirmed');
      var rv = kpi(r, 'revenue');
      eq([rv.sig, rv.soft], [0, 0], 'revenue +2%: ' + JSON.stringify(rv));
    });
    test('متوسط قيمة الطلب «مؤكد» بنفس عتبة باقي الأرقام (z ≥ ٢٫٥) — z نحو ٢٫٢ = «مرجّح» مش «مؤكد» (ر٧٢)', function () {
      var r = DX.analyze(dxDays(1, 1.356)), a = kpi(r, 'aov');
      ok(r.head.aov.z > 2 && r.head.aov.z < 2.5, 'z = ' + r.head.aov.z);
      eq([a.sig, a.soft], [0, 1]);
    });
    test('سطر المستهدف: العائد بخانتين لو التقريب بيخلّيه زي الحد (×٤٫٩٦ مقابل ×٥)، و«إنفاق الحساب كله» لو فيه حملات أهداف تانية (ر٧٥، ر٧٣)', function () {
      var inp = dxDays(1, 4.96 * 0.7), target = { target: { roas: 5 } };
      withLang('ar', function () {
        var o = DX.compose(DX.analyze(inp), target);
        ok(o.basis.indexOf('×٤٫٩٦') > -1 && o.basis.indexOf('المستهدف (×٥)') > -1 && o.basis.indexOf('الحساب كله') === -1, o.basis);
        inp.other = { w: DX.windows(inp.since, inp.until, false).map(function () { return { spend: 50, imp: 0, clicks: 0, atc: 0, ic: 0, pur: 0, rev: 0 }; }), goals: { awareness: 50 } };
        var o2 = DX.compose(DX.analyze(inp), target);
        ok(o2.basis.indexOf('العائد على إنفاق الحساب كله') === 0, o2.basis);
      });
    });
    // ملخص حقيقي ١٢–١٨ أكتوبر ٢٠٢٦: عائد ×٠٫٨ بـ٤ طلبات والحد ×٥ — السطر كان بيختفي تحت ٥ طلبات والعنوان برتقالي (المرحلة ٥ ه١١)
    test('تحت ٥ طلبات: سطر المستهدف بيظهر لو الفرق مؤكد (×٠٫٨ والمستهدف ×٥)، ومبيظهرش لو قريب منه (×٤٫٥)', function () {
      withLang('ar', function () {
        var o = DX.compose(DX.analyze(dxDays(0.04, 0.56)), { target: { roas: 5 } });
        ok(o.basis && o.basis.indexOf('المستهدف (×٥)') > -1, o.basis || 'no line');
        eq(o.tone, 'bad');
        // ٤ طلبات بعائد ×٤٫٥ والمستهدف ×٥: الفرق ١٠٪ في حدود الصدفة بالعدد ده — مفيش سطر (زي قبل كده تحت ٥ طلبات)
        var o2 = DX.compose(DX.analyze(dxDays(0.04, 3.15)), { target: { roas: 5 } });
        ok(!o2.basis, o2.basis);
      });
    });
    // من ٢٥ أكتوبر («كل المنصات» افتراضياً دايماً): التوقيت المختلف بنفس الأيام المكتملة = بيتجمعوا وجملة بتقول إن كل يوم بتوقيت
    // حسابه (كان بيمنع «كل المنصات»)، وأيام مكتملة مختلفة = منقدرش نجمع (Kimball: بُعد تاريخ واحد للكل)
    test('حسابين بمنطقتين زمنيتين مختلفتين: بيتجمعوا بجملة التوقيت لو الأيام المكتملة نفسها، وإلا «اختر منصة»', function () {
      var a = src('meta', 51), b = src('snapchat', 53);
      a.input.timezone = 'Asia/Riyadh'; b.input.timezone = 'America/Los_Angeles';
      var rd = function (x, id, gen) { return { status: 'ready', key: id, gen: gen, input: x.input, report: DX.analyze(x.input), account: id, accountId: id }; };
      var act = Object.assign({}, activeSources);
      try {
        DX_ON = true; platSel = null; activeSources.meta = 'act_1'; activeSources.snapchat = 'sn1';
        dxState.sources = { meta: rd(a, 'meta:1', 1), snapchat: rd(b, 'snapchat:1', 1) };
        withLang('ar', function () { dxRecompute(); });
        ok(dxState.report && dxState.sel.tzs && dxState.sel.tzs.length === 2, 'combined, with the time zones noted');
        ok(/بتوقيت حسابه/.test(document.getElementById('dxBody').textContent), 'the time zone note');
        b.input.until = shiftKey(b.input.until, -1);
        dxState.sources.snapchat = rd(b, 'snapchat:1', 2);
        withLang('ar', function () { dxRecompute(); });
        eq([dxState.sel.blocked, !!dxState.report], ['period', false]);
        ok(/آخر يوم مكتمل يختلف بينها/.test(document.getElementById('dxBody').textContent), 'says why');
      } finally {
        ['meta', 'snapchat'].forEach(function (p) { if (p in act) activeSources[p] = act[p]; else delete activeSources[p]; });
        platSel = null; DX_ON = false; dxReset(); document.getElementById('storeSec').hidden = true;
      }
    });
    // حساب حقيقي ١٨ أكتوبر: رسائل Meta (مفيش مشتريات خالص) + مبيعات Snapchat — «كل المنصات» ×١٫٨ «أقل من حد الخسارة» وSnapchat لوحده ×٣
    test('منصة مفيش مشتريات بتوصلها خالص برّه أرقام المبيعات بجملة تقول كده، والاختيار بيفضل زي ما العميل اختاره (مراجعة المرحلة ٤)', function () {
      var noPur = function (x) { x.input.daily.forEach(function (d) { d.pur = 0; d.rev = 0; d.atc = 0; d.ic = 0; }); return x; };
      var m = noPur(src('meta', 31)), g = src('google', 37), s = src('snapchat', 41);
      var old = { opts: Object.assign({}, platformOptions), act: Object.assign({}, activeSources), copy: window.dxCopyText }, copied = null;
      DX_ON = true; activeSources.meta = 'act_1'; activeSources.google = '123'; activeSources.snapchat = 'sn1';
      var rd = function (x, id) { return { status: 'ready', key: id, gen: 1, input: x.input, report: DX.analyze(x.input), account: id, accountId: id }; };
      try {
        platSel = null;
        eq(DX.analyze(m.input).status, 'noPurchases', 'meta records no purchases');
        // الاتنين من غير مشتريات (فحص حي ٢٥ أكتوبر: رسائل Meta وسوايب Snapchat): عنوان بصيغة الجمع، ومن غير «لا تدخل…» — مفيش أرقام مبيعات اتشال منها حاجة
        dxState.sources = { meta: rd(m, 'meta:1'), snapchat: rd(noPur(src('snapchat', 43)), 'snapchat:2') };
        withLang('ar', function () { dxRecompute(); });
        var tx = document.getElementById('dxBody').textContent;
        eq([dxState.sel.excluded, dxState.report.status], [[], 'noPurchases']);
        ok(tx.indexOf('لا تُسجَّل مشتريات في الحسابات المختارة') > -1 && tx.indexOf('لا تدخل') === -1, tx.slice(0, 200));
        // منصتين، واحدة منهم مفيهاش مشتريات: «كل المنصات» = أرقام اللي بتبيع، وMeta برّه بجملة
        dxState.sources = { meta: rd(m, 'meta:1'), snapchat: rd(s, 'snapchat:1') };
        dxRecompute();
        eq([dxState.view, dxState.report === dxState.sources.snapchat.report, dxState.sel.excluded], ['all', true, ['meta']]);
        // تلاتة: Google + Snapchat مع بعض، وMeta برّه
        dxState.sources.google = rd(g, 'google:1');
        dxRecompute();
        eq([dxState.view, dxState.sel.plats, dxState.sel.excluded], ['all', ['google', 'snapchat'], ['meta']]);
        ok(Math.abs(dxState.report.cur.spend - DX.analyze(g.input).cur.spend - DX.analyze(s.input).cur.spend) < 1e-6, 'meta spend left out: ' + dxState.report.cur.spend);
        withLang('ar', function () {
          dxRecompute();
          ok(document.getElementById('dxBody').textContent.indexOf('لا تدخل Meta في أرقام المبيعات هنا') > -1, 'note above the numbers');
          window.dxCopyText = function (txt) { copied = txt; };
          document.getElementById('dxCopy').click();
          ok(copied && copied.indexOf('لا تدخل Meta في أرقام المبيعات هنا') > -1, 'in the copied text: ' + (copied || '').slice(0, 80));
        });
        // العميل اختار Meta بنفسه: بيفضل عليها
        document.querySelector('#dxBody [data-plat-pick="meta"]').click();
        dxRecompute();
        eq([dxState.view, platSel], ['meta', ['meta']], 'the user pick stays');
      } finally {
        platSel = null;
        window.dxCopyText = old.copy;
        ['meta', 'google', 'snapchat'].forEach(function (p) {
          if (p in old.opts) platformOptions[p] = old.opts[p]; else delete platformOptions[p];
          if (p in old.act) activeSources[p] = old.act[p]; else delete activeSources[p];
        });
        DX_ON = false; dxReset(); document.getElementById('storeSec').hidden = true;
      }
    });
  });

  describe('نافذة الأداة: ٧ أيام مكتملة + اليوم', function () {
    var s8 = function (n) { return [n, n, n, n, n, n, n, n]; };
    var ad8 = function (id, daily, res) {
      var c = ad(id, { daily: daily, res: res });
      c.dailyDates = last7Days(TODAY).map(function (d) { return d.key; });
      c.dailySales = s8(0);
      return c;
    };
    test('طلب أمس (الخانة السابعة) بيتحسب في الأسبوع — مش «اليوم» زي الأرقام الثابتة القديمة', function () {
      var ads = [ad8('g1', s8(100), s8(5)), ad8('g2', s8(100), s8(5)),
        ad8('y', s8(100), [0, 0, 0, 0, 0, 0, 1, 0]), ad8('t', s8(100), [0, 0, 0, 0, 0, 0, 0, 1])];
      var r = engine(ads, {}, { maxCost: { purchase: 20 } });
      var codes = function (id) { return r.alerts.filter(function (a) { return a.adId === id; }).map(function (a) { return a.code; }); };
      ok(codes('y').indexOf('waste-week') < 0, 'yesterday\'s order counts: ' + codes('y'));
      ok(codes('t').indexOf('waste-week') > -1, 'today\'s order is not part of the week: ' + codes('t'));
    });
    test('«صرف أعلى من المعتاد» بحد أدنى: الزيادة لازم تساوي تكلفة نتيجة بمتوسط الحساب', function () {
      var ads = baseAccount().concat([
        ad('small', { daily: [5, 5, 5, 5, 5, 12, 0], res: [1, 0, 0, 0, 0, 0, 0] }),
        ad('big', { daily: [50, 50, 50, 50, 50, 150, 0], res: [3, 3, 3, 3, 3, 0, 0] })
      ]);
      var r = engine(ads);
      var has = function (id) { return r.alerts.some(function (a) { return a.adId === id && a.code === 'spike'; }); };
      eq([has('small'), has('big')], [false, true], 'avg cost per result = 20: +7 is not a spike, +100 is');
    });
    test('قفل الصفحة وهي بتتحمّل: لحد ما الأرقام تيجي، ومن غير قفل لتحميل المتوقفة في الخلفية', function () {
      var lock = document.getElementById('pageLock');
      try {
        setLoading('meta', true, 'x');
        renderPageLock();
        ok(!lock.hidden && document.body.classList.contains('page-locked'), 'locked while numbers are coming');
        candidates = [ad('w1', { daily: steady(10), res: steady(1) })];
        render();
        ok(document.querySelector('#topAlerts').textContent.indexOf(t('attn.wait')) > -1 || document.querySelectorAll('#topAlerts .top-alert').length,
          'no «nothing urgent» before the numbers');
        setLoading('meta', true, 'x', { bg: true });
        renderPageLock();
        ok(lock.hidden && !document.body.classList.contains('page-locked'), 'stopped ads in the background do not lock');
      } finally { setLoading('meta', false); renderPageLock(); }
    });
    test('ملخص المتجر: ٦ أرقام فيها متوسط قيمة الطلب (المبيعات ÷ الطلبات)', function () {
      var o = DX.compose(DX.analyze(DX_SIM.simulate({ seed: 7, spend: 2000 })));
      eq(o.kpis.map(function (k) { return k.id; }), ['spend', 'orders', 'revenue', 'aov', 'roas', 'cpa']);
      var aov = o.kpis[3];
      ok(aov.value && aov.value !== '—' && aov.prev !== '—', 'aov shown with the previous period');
    });
    test('سطر «ليه رقم المنصة أعلى» تحت الملخص: منصة واحدة من المحرك، وكل المنصات من مجموعهم بعد تحويل العملة', function () {
      // حساب حقيقي ١١ أكتوبر: Meta بتنسب ٥١ طلباً بعائد ×٤٫٩ والملخص ٢٣ بعائد ×٢ من غير ولا كلمة — الأرقام نفسها بقت في كل خانة (٧ نوفمبر)
      var saved = { s: dxState.sources, sel: dxState.sel, r: dxState.report };
      try {
        var row = function (d, ppur) { return { date: d, spend: 100, pur: 2, rev: 400, ppur: ppur, prev: ppur * 200 }; };
        dxState.sources = { meta: { input: { since: '2026-10-04', until: '2026-10-05', currency: 'SAR', daily: [row('2026-10-04', 5), row('2026-10-05', 5)] } },
          snapchat: { input: { since: '2026-10-04', until: '2026-10-05', currency: 'USD', daily: [{ date: '2026-10-04', spend: 10, pur: 1, rev: 40 }], plat: { pur: 3, rev: 100 } } } };
        eq(withLang('ar', function () { return platCompare(['meta']).text; }), withLang('ar', function () { return t('dx.platWhy', { plat: 'Meta' }); }));
        dxState.sources.meta.input.daily = [row('2026-10-04', 2), row('2026-10-05', 2)];
        eq(platCompare(['meta']), null, 'same numbers = no line');
        dxState.sources.meta.input.daily = [row('2026-10-04', 5), row('2026-10-05', 5)];
        dxState.sel = { plats: ['meta', 'snapchat'], conv: { to: 'SAR', from: ['USD'] } };
        dxState.report = { cur: { pur: 5, rev: 0, spend: 0 } };
        var tot = dxPlatTotals();
        eq([tot.pur, Math.round(tot.rev * 100) / 100], [13, 2000 + 100 * DX.pegRate('USD', 'SAR')], 'summed in the report currency');
        eq(platCompare(['meta', 'snapchat']).text, t('dx.platWhyAll'));
        dxState.report = { cur: { pur: 13 } };
        eq(platCompare(['meta', 'snapchat']), null, 'not more = no line');
        delete dxState.sources.snapchat.input.plat;
        eq([dxPlatTotals(), platCompare(['meta', 'snapchat'])], [null, null], 'a platform without its number = no total (a partial total would be wrong)');
      } finally { dxState.sources = saved.s; dxState.sel = saved.sel; dxState.report = saved.r; }
      // «كل المنصات» (الافتراضي — ومنصة واحدة متصلة دايماً كده): السطر بيظهر برضه. من ٢٥ أكتوبر كان مبيظهرش خالص (a749cbc)
      var keepSel = platSel, keepC = candidates.slice(), keep2 = { s: dxState.sources, sel: dxState.sel };
      try {
        platSel = null;
        dxState.sources = { meta: { input: { since: '2026-10-04', until: '2026-10-05', currency: 'SAR', daily: [
          { date: '2026-10-04', spend: 100, pur: 2, rev: 400, ppur: 5, prev: 1000 }, { date: '2026-10-05', spend: 100, pur: 2, rev: 400, ppur: 5, prev: 1000 }] } } };
        dxState.sel = { plats: ['meta'] };
        candidates.length = 0;
        candidates.push(ad('sl1', { daily: steady(10), res: steady(1) }));
        eq(dxShownPlats(), ['meta'], 'the platforms of the summary itself');
        ok(storeLines(dxViewPlatforms()).some(function (l) { return l.text === t('dx.platWhy', { plat: 'Meta' }); }), 'the line shows in the default view');
      } finally {
        platSel = keepSel; dxState.sources = keep2.s; dxState.sel = keep2.sel;
        candidates.length = 0; keepC.forEach(function (c) { candidates.push(c); });
      }
      var html = dxKpiHtml({ label: 'L', value: 'V', prev: 'P', plat: 'X', pct: null, sig: 0, goodUp: null });
      ok(html.indexOf(esc(t('dx.kpi.plat', { v: 'X' }))) > -1 && html.indexOf(esc(t('dx.kpi.prev', { label: cmpLabel(), v: 'P' }))) > -1, 'the summary box: the comparison and the platform under the number');
      ok(dxKpiHtml({ label: 'L', value: 'V', prev: 'P', pct: null, sig: 0, goodUp: null }).indexOf(esc(t('dx.kpi.plat', { v: '' }).split(':')[0])) < 0, 'no platform number = no line');
    });
    test('جدول الأيام في التفاصيل: الأيام المكتملة وآخرها «أمس»، وبعدها «الإجمالي» (bold) وبعده «اليوم» منفصل', function () {
      var c = ad8('d1', s8(10), s8(1));
      candidates = [c];
      render();
      openExpand(c);
      var th = Array.prototype.map.call(document.querySelectorAll('#expandChart thead th'), function (x) { return x.textContent; });
      eq([th.length, th[7], th[8], th[9]], [10, t('x.yesterday'), t('x.totalDays', { n: dayCountText(7) }), t('x.today')]);
      var tot = document.querySelector('#expandChart tbody tr td.col-total');
      eq(tot.textContent, fmtNum(70, true), 'total = the 7 complete days without today');
      expandOverlay.classList.add('hidden');
    });
  });

  // مراجعة المرحلة ٤ العميقة (١٧ أكتوبر ٢٠٢٦): كل رقم ليه تعريف واحد في كل مكان بيظهر فيه (Kimball & Ross،
  // «The Data Warehouse Toolkit» — conformed facts). كل اختبار هنا اتبنى من محاكاة أثبتت التناقض على المحرك نفسه قبل الإصلاح
  describe('أرقام متسقة في كل مكان (مراجعة المرحلة ٤)', function () {
    var K8 = last7Days(TODAY).map(function (d) { return d.key; });
    var z8 = function () { return [0, 0, 0, 0, 0, 0, 0, 0]; };
    // إعلان بنافذة الأداة الحقيقية: ٧ أيام مكتملة + النهارده (آخر خانة مبتدخلش الإجماليات)
    var a8 = function (id, o) {
      var daily = o.daily, res = o.res || z8(), sales = o.sales || z8();
      var c = ad(id, { daily: daily.slice(0, 7), res: res.slice(0, 7), sales: sales.slice(0, 7), key: o.key, cid: o.cid || ('c-' + id) });
      c.daily = daily; c.dailyResults = res; c.dailySales = sales; c.dailyDates = K8;
      if (o.edits) c.edits = o.edits;
      return c;
    };
    var issuesOf = function (r, id) { return r.byAd[id].issues.map(function (i) { return i.code + ':' + i.level; }); };
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    // ---------- المراجعة الثانية للمرحلة ٤ (١٨ أكتوبر ٢٠٢٦) ----------
    test('احتمال بواسون باللوغاريتم: متوقع ١٠٠٠ وجه ١٠٠٠ = نحو النص (كان صفر من حد الأرقام العشرية)، والأرقام الصغيرة زي ما هي', function () {
      var P = PauseProofAlerts._.poissonAtMost;
      ok(Math.abs(P(1000, 1000) - 0.5084) < 0.002, 'P(X≤1000 | 1000) = ' + P(1000, 1000));
      ok(Math.abs(P(2, 5) - Math.exp(-5) * (1 + 5 + 12.5)) < 1e-12, 'small: ' + P(2, 5));
      eq([P(0, 0), P(3, -1)], [1, 1]);
    });
    test('إعلان وقف فجأة: المبلغ = آخر ٣ أيام + النهارده، والجملة بتقول كده', function () {
      var stop = a8('st', { daily: [10, 10, 10, 10, 10, 10, 10, 5], res: [1, 1, 1, 1, 1, 1, 1, 0] });
      stop.active = false; stop.pausedLevel = 'rejected';
      var r = withLang('ar', function () { return engine([a8('p1', { daily: [50, 50, 50, 50, 50, 50, 50, 20], res: [2, 2, 2, 2, 2, 2, 2, 1] }), stop]); });
      var i = r.byAd.st.issues.filter(function (x) { return x.code === 'stopped'; })[0];
      ok(i && i.detail.indexOf('٣٥ ر.س خلال آخر ٣ أيام واليوم') > -1, i ? i.detail : 'no alert');
    });
    // حساب برسائل رخيصة كتير وعملاء محتملين غاليين: الإنفاق زاد على العملاء المحتملين ونتائجهم زادت معاه بنفس النسبة
    test('زيادة إنفاق الحساب: النتائج بأنواعها بوحدة واحدة (كل نوع بمتوسط تكلفته) — مش عدد المحادثات + العملاء المحتملين', function () {
      var ads = [a8('m', { key: 'message', daily: [100, 100, 100, 100, 100, 100, 100, 0], res: [50, 50, 50, 50, 50, 50, 50, 0] }),
        a8('l', { key: 'lead', daily: [100, 100, 100, 100, 100, 100, 400, 0], res: [2, 2, 2, 2, 2, 2, 8, 0] })];
      var meta = { 'meta:act_1': { label: 'Meta — T', currency: 'SAR', timeZone: 'UTC', metaAccountStatus: 1 } };
      var r = engine(ads, meta);
      ok(!r.alerts.some(function (a) { return a.code === 'acct-spike'; }), 'results kept up: ' + r.alerts.map(function (a) { return a.code; }).join(','));
      // وزيادة النتائج فعلاً مزادتش = تنبيه زي الأول
      ads[1].dailyResults = [2, 2, 2, 2, 2, 2, 2, 0];
      ok(engine(ads, meta).alerts.some(function (a) { return a.code === 'acct-spike'; }), 'results did not keep up');
    });
    test('أكبر مصدر نتائج وقف في حساب فيه أكتر من نوع: النصيب بقيمة كل نوع (العدد كان بيخلّي عميل محتمل زي محادثة)', function () {
      var off = a8('l1', { key: 'lead', daily: [100, 100, 100, 100, 100, 100, 100, 0], res: [2, 2, 2, 2, 2, 2, 2, 0] });
      off.active = false; off.pausedLevel = 'ad';
      var ads = [a8('m1', { key: 'message', daily: [100, 100, 100, 100, 100, 100, 100, 50], res: [50, 50, 50, 50, 50, 50, 50, 20] }), off];
      var r = withLang('ar', function () { return engine(ads, { 'meta:act_1': { label: 'Meta — T', currency: 'SAR', timeZone: 'UTC', metaAccountStatus: 1 } }); });
      var a = r.alerts.filter(function (x) { return x.code === 'top-stopped'; })[0];
      ok(a && /٥٠٪/.test(a.detail) && a.detail.indexOf('بمتوسط تكلفته') > -1, a ? a.detail : 'no alert (14 leads of 364 results by count = 4%)');
    });
    test('العائد جنب المستهدف: ×٤٫٩٦ مش «×٥، أقل من المستهدف (×٥)»', function () {
      var c = a8('rx', { daily: [100, 100, 100, 100, 100, 100, 100, 0], res: [2, 2, 2, 2, 2, 2, 2, 0], sales: [496, 496, 496, 496, 496, 496, 496, 0] });
      var r = withLang('ar', function () { return engine([c], {}, { roasTarget: 5 }); });
      // ×٤٫٩٦ تحت حد ×٥ = خسارة (الحكم بحدودك — ٢٥ أكتوبر: الرقم المقاس مقابل الخط)، والرقم في جملتها بخانتين مش «×٥، أقل من (×٥)»
      var li = r.byAd.rx.issues.filter(function (x) { return x.code === 'loss'; })[0];
      ok(li && li.detail.indexOf('٤٫٩٦') > -1 && !/×٥،/.test(li.detail), li ? li.detail : 'no loss alert at ×4.96 vs ×5');
      // بعيد عن الحد: خانة واحدة زي الأول (عائد ×٢ مقابل حد ×٥ بـ١٤ طلباً = خسارة بدليل)
      c.dailySales = [200, 200, 200, 200, 200, 200, 200, 0];
      var j = withLang('ar', function () { return engine([c], {}, { roasTarget: 5 }); }).byAd.rx.issues.filter(function (x) { return x.code === 'loss'; })[0];
      ok(j && j.detail.indexOf('٢') > -1 && j.detail.indexOf('٢٫٠٠') === -1, j ? j.detail : 'no alert');
    });
    test('حد الإنفاق: إنفاق ٧ أيام ÷ ٧ (مش ÷ ٨ خانات) — ٦٥٠ باقية و١٠٠ يومياً = «عاجل» ونحو ٦ أيام', function () {
      var ads = [a8('x', { daily: [100, 100, 100, 100, 100, 100, 100, 40], res: [2, 2, 2, 2, 2, 2, 2, 1] }), a8('y', { daily: z8() })];
      var meta = { 'meta:act_1': { label: 'Meta — T', currency: 'SAR', timeZone: 'UTC', metaAccountStatus: 1, spendCapReached: false, spendCap: 1000000, amountSpent: 935000 } };
      var a = withLang('ar', function () { return engine(ads, meta); }).alerts.filter(function (x) { return x.code === 'spend-cap-near'; })[0];
      ok(a && a.level === 'critical' && /نحو ٦ أيام/.test(a.detail), a ? a.level + ' | ' + a.detail : 'no alert');
    });

    // قرار صاحب المنتج ٢٥ أكتوبر (الجولة الرابعة): الحكم على أرقام الكارت دايماً — كان (١٠ أكتوبر) على الأيام اللي بعد التعديل بس، فإعلان
    // على كارته ٥١ $ اتحكم عليه بـ٣٥ $ وطلع «مهم» وكارته بيقول إنه عدّى الحد
    test('بعد تعديل أقدم من ٣ أيام: الحكم على الفترة كاملة كما في الكارت، والتعديل سطر في أساس الحكم مع «بعده مقابل قبله»', function () {
      var peers = [a8('b', { key: 'lead', daily: [100, 100, 100, 100, 100, 100, 100, 50], res: [2, 2, 2, 2, 2, 2, 2, 1] }),
        a8('c', { key: 'lead', daily: [100, 100, 100, 100, 100, 100, 100, 50], res: [2, 2, 2, 2, 2, 2, 2, 1] })];
      var ed = a8('e', { key: 'lead', daily: [300, 300, 300, 100, 100, 100, 100, 50], res: [1, 1, 1, 0, 2, 2, 2, 1],
        edits: [{ date: K8[3], level: 'ad', kind: 'budget', from: 30000, to: 10000 }] });
      var r = withLang('ar', function () { return engine(peers.concat([ed])); });
      var e = r.byAd.e;
      // الأسبوع كله: ١٣٠٠ و٩ عملاء = ١٤٤ مقابل ٥٠ — «تكلفة مرتفعة» زي ما الكارت بيقول
      ok(issuesOf(r, 'e').some(function (x) { return x === 'cpr:warning'; }), 'full-week cost alert: ' + issuesOf(r, 'e'));
      ok(/والحكم على الفترة كاملة كما في الكارت/.test(e.basis) && /تكلفة كل عميل محتمل بعده ٥٠ ر\.س مقابل ٣٠٠ ر\.س في ٣ أيام قبله/.test(e.basis), e.basis);
      eq(e.days, null, 'the card period');
    });

    // ---------- تغيّر آخر الأيام (طلب صاحب المنتج ٣ نوفمبر ٢٠٢٦) ----------
    // إعلانات مبيعات متشابهة عشان يبقى في متوسط ومقارنة — من غير ما تطلّع تنبيه تكلفة على الإعلان اللي بنختبره
    var salesPeer = function (id, v) { return a8(id, { daily: [100, 100, 100, 100, 100, 100, 100, 50], res: [2, 2, 2, 2, 2, 2, 2, 1], sales: [v, v, v, v, v, v, v, v / 2] }); };
    test('تراجع آخر ٣ أيام: الحكم يبقى «جيد» على الأسبوع كله، ومعاه وسم وجملة بالأرقام وتنبيه المبيعات المتأخرة', function () {
      var X = a8('tr1', { daily: [100, 100, 100, 100, 100, 100, 100, 50], res: [2, 2, 2, 2, 2, 2, 2, 1], sales: [500, 500, 500, 500, 300, 300, 300, 150] });
      var r = withLang('ar', function () { return engine([X, salesPeer('trp1', 450)]); });
      var a = r.byAd.tr1;
      eq(a.health, 'good', 'العائد ×٤ للأسبوع والمستهدف ×٣ — الحكم ما اتغيّرش');
      eq(a.trendTag && [a.trendTag.dir, a.trendTag.days], ['down', 3]);
      ok(/وعائده في آخر ٣ أيام ×٣ مقابل ×٥ في أيام الأسبوع السابقة لها\./.test(a.basis), a.basis);
      ok(/وبعض المبيعات تُسجَّل متأخرة/.test(a.basis) && a.trendTag.note.indexOf('وعائده') === 0, a.trendTag.note);
    });
    test('تحسّن آخر ٣ أيام: وسم تحسّن من غير جملة المبيعات المتأخرة (التأخير بيأثر في التراجع بس)', function () {
      var X = a8('tr2', { daily: [100, 100, 100, 100, 100, 100, 100, 50], res: [2, 2, 2, 2, 2, 2, 2, 1], sales: [300, 300, 300, 300, 500, 500, 500, 250] });
      var r = withLang('ar', function () { return engine([X, salesPeer('trp2', 450)]); });
      var a = r.byAd.tr2;
      eq(a.trendTag && a.trendTag.dir, 'up');
      ok(/وعائده في آخر ٣ أيام ×٥ مقابل ×٣ في أيام الأسبوع السابقة لها\./.test(a.basis), a.basis);
      ok(!/تُسجَّل متأخرة/.test(a.basis), a.basis);
    });
    test('أقل من ٢٠٪ فرق: مفيش وسم — الحد نفسه اللي الأداة بتنتبه بيه (قرار ١٠ أكتوبر)', function () {
      var X = a8('tr3', { daily: [100, 100, 100, 100, 100, 100, 100, 50], res: [2, 2, 2, 2, 2, 2, 2, 1], sales: [500, 500, 500, 500, 450, 450, 450, 225] });
      var r = withLang('ar', function () { return engine([X, salesPeer('trp3', 450)]); });
      eq(r.byAd.tr3.trendTag, null, 'العائد ×٤٫٥ مقابل ×٥ = ١٠٪');
    });
    // فحص حساب حقيقي ٣ نوفمبر: التعديل على الحملة بيحصل كل يوم في حسابات كتير، فاستثناء «أي تعديل جوه آخر ٤ أيام» سكّت
    // ٢٣ إعلان من ٢٧. دلوقتي الوسم بيسكت لوسم «عُدّل» بس (أقل من ٣ أيام مكتملة بعد التعديل)، ويوم التعديل بيتشال من
    // الجانب السابق لو كان آخر يوم فيه — عشان سطر «بعده مقابل قبله» والوسم ميقولوش رقمين مختلفين لنفس الحاجة
    test('تعديل من ٤ أيام: الوسم بيظهر، ورقم «قبلها» هو نفسه رقم «قبله» في سطر التعديل (يوم التعديل مستثنى)', function () {
      var X = a8('tr4', { daily: [100, 100, 100, 100, 100, 100, 100, 50], res: [2, 2, 2, 2, 2, 2, 2, 1], sales: [500, 500, 500, 600, 300, 300, 300, 150],
        edits: [{ date: K8[3], level: 'ad', kind: 'budget', from: 20000, to: 10000 }] });
      var r = withLang('ar', function () { return engine([X, salesPeer('trp4', 450)]); });
      var a = r.byAd.tr4;
      eq(a.trendTag && a.trendTag.dir, 'down');
      // ٣ أيام قبل التعديل: ١٥٠٠ ÷ ٣٠٠ = ×٥ (يوم التعديل نفسه ×٦ مستثنى من الاتنين)
      ok(/العائد بعده ×٣ مقابل ×٥ في ٣ أيام قبله\./.test(a.basis), a.basis);
      ok(/وعائده في آخر ٣ أيام ×٣ مقابل ×٥ في أيام الأسبوع السابقة لها\./.test(a.basis), a.basis);
    });
    test('وسم «عُدّل» على الكارت: مفيش وسم تغيّر معاه — الأداة بتقول ننتظر أثر التعديل', function () {
      var X = a8('tr4b', { daily: [100, 100, 100, 100, 100, 100, 100, 50], res: [2, 2, 2, 2, 2, 2, 2, 1], sales: [500, 500, 500, 500, 300, 300, 300, 150],
        edits: [{ date: K8[5], level: 'ad', kind: 'budget', from: 20000, to: 10000 }] });
      var r = withLang('ar', function () { return engine([X, salesPeer('trp4b', 450)]); });
      eq([!!r.byAd.tr4b.editTag, r.byAd.tr4b.trendTag], [true, null], 'the edit tag wins');
    });
    test('إعلان مش مبيعات: المقياس تكلفة النتيجة، وغلاها آخر ٣ أيام = تراجع', function () {
      var peers = [a8('trp5a', { key: 'lead', daily: [100, 100, 100, 100, 100, 100, 100, 50], res: [4, 4, 4, 4, 4, 4, 4, 2] }),
        a8('trp5b', { key: 'lead', daily: [100, 100, 100, 100, 100, 100, 100, 50], res: [4, 4, 4, 4, 4, 4, 4, 2] })];
      var X = a8('tr5', { key: 'lead', daily: [100, 100, 100, 100, 100, 100, 100, 50], res: [4, 4, 4, 4, 2, 2, 2, 1] });
      var r = withLang('ar', function () { return engine(peers.concat([X])); });
      var a = r.byAd.tr5;
      eq(a.trendTag && a.trendTag.dir, 'down');
      ok(/وتكلفة كل عميل محتمل في آخر ٣ أيام ٥٠ ر\.س مقابل ٢٥ ر\.س في أيام الأسبوع السابقة لها\./.test(a.basis), a.basis);
      ok(/وبعض النتائج تُسجَّل متأخرة/.test(a.basis), a.basis);
    });
    test('جانب صرف أقل من تكلفة نتيجة واحدة، أو إعلان في التعلّم: مفيش وسم', function () {
      var peers = [a8('trp6a', { key: 'lead', daily: [100, 100, 100, 100, 100, 100, 100, 50], res: [4, 4, 4, 4, 4, 4, 4, 2] }),
        a8('trp6b', { key: 'lead', daily: [100, 100, 100, 100, 100, 100, 100, 50], res: [4, 4, 4, 4, 4, 4, 4, 2] })];
      // تكلفة النتيجة عند الباقي ٢٥، وآخر ٣ أيام صرفوا ٦ — أقل من نتيجة واحدة، فالفرق فلوسه مش مؤثرة
      var small = a8('tr6', { key: 'lead', daily: [100, 100, 100, 100, 2, 2, 2, 1], res: [4, 4, 4, 4, 1, 1, 1, 0] });
      eq(withLang('ar', function () { return engine(peers.concat([small])); }).byAd.tr6.trendTag, null, 'إنفاق أقل من تكلفة نتيجة');
      // a8 مبيمرّرش العمر، فبنحطه على الإعلان نفسه
      var young = a8('tr7', { key: 'lead', daily: [100, 100, 100, 100, 100, 100, 100, 50], res: [4, 4, 4, 4, 2, 2, 2, 1] });
      young.daysAgo = 2;
      eq(withLang('ar', function () { return engine(peers.concat([young])); }).byAd.tr7.trendTag, null, 'في التعلّم');
    });

    test('تركيز الميزانية: «أقل أداءً» = حكم الإعلان نفسه — أفضل إعلان مبيعات (×٤، «جيد») مبيطلعش عليه', function () {
      var X = a8('X', { daily: [86, 86, 86, 86, 86, 86, 84, 40], res: [2, 1, 2, 1, 2, 1, 1, 0], sales: [343, 343, 343, 343, 343, 343, 342, 0] });
      var Y = a8('Y', { daily: [57, 57, 57, 57, 57, 57, 58, 20], res: [2, 2, 2, 2, 2, 1, 1, 0], sales: [143, 143, 143, 143, 143, 143, 142, 0] });
      var Z = a8('Z', { daily: [43, 43, 43, 43, 43, 43, 42, 20], res: [2, 1, 2, 1, 2, 1, 1, 0], sales: [86, 86, 86, 86, 86, 86, 84, 0] });
      var r = engine([X, Y, Z]);
      eq(r.byAd.X.health, 'good');
      var conc = withLang('ar', function () { return t('al.conc.in', { pct: '' }).slice(0, 12); });
      ok(!r.alerts.some(function (a) { return a.adId === 'X' && String(a.advice).indexOf(conc) > -1; }), 'no concentration sentence on the best ad');
      // إعلان خسران (×٠٫٣ بـ٢١ طلباً) واخد أغلب الإنفاق: جملة التركّز جوه تنبيه الخسارة نفسه، والإعلان مرة واحدة في «يحتاج انتباهك
      // الآن» (المراجعة الثانية للمرحلة ٥ — كان تنبيه «تركّز الميزانية» منفصل عن نفس الإعلان ونفس المشكلة)
      var L = a8('L', { daily: [150, 150, 150, 150, 150, 150, 150, 50], res: [3, 3, 3, 3, 3, 3, 3, 0], sales: [45, 45, 45, 45, 45, 45, 45, 0] });
      // «انقل ميزانيته للأفضل أداءً» محتاج إعلان عند المستهدف أو فوقه (Y ×٢٫٥ وZ ×٢ بمستهدف ×٢)
      var r2 = withLang('ar', function () { return engine([L, Y, Z], {}, { roasTarget: 2 }); });
      var loss = r2.alerts.filter(function (a) { return a.adId === 'L' && a.code === 'loss'; })[0];
      ok(loss && loss.advice.indexOf(conc) > -1, loss ? loss.advice : 'no loss alert');
      ok(!r2.alerts.some(function (a) { return a.code === 'concentration'; }), 'no separate concentration alert');
      eq(DX.attention([], r2.alerts, [L, Y, Z]).filter(function (it) { return it.alert && it.alert.adId === 'L'; }).length, 1, 'the ad once in the attention list');
    });

    test('المعرّض للهدر: الإعلان مرة واحدة بأكبر مبلغ عليه — «دون نتائج آخر يومين» و«خسارة» مبيتجمعوش (زي لوحة الهدر)', function () {
      var B = a8('B4', { daily: [100, 100, 100, 100, 100, 100, 100, 50], res: [2, 2, 2, 2, 2, 2, 2, 1], sales: [300, 300, 300, 300, 300, 300, 300, 100] });
      // ٢٠ طلباً بعائد ×٠٫٥٤ (خسارة بدليل)، وآخر يومين صفر والمتوقع ٨ — التنبيهين بدليل يكفي «عاجل» (المرحلة ٥ ق١)
      var W = a8('W4', { daily: [200, 200, 200, 200, 200, 200, 200, 100], res: [4, 4, 4, 4, 4, 0, 0, 0], sales: [150, 150, 150, 150, 150, 0, 0, 0] });
      var r = engine([B, W], {}, { maxCost: { purchase: 100 } });
      // من المراجعة الثانية للمرحلة ٥: تنبيه أداء واحد للإعلان (ISA-18.2) — الأكبر بالفلوس (الخسارة ٦٥٠) بيفضل، و«يومان دون نتائج» بيتدمج
      var codes = r.alerts.filter(function (a) { return a.adId === 'W4' && a.atRisk; }).map(function (a) { return a.code + ' ' + a.amount; });
      eq(codes, ['loss 650'], 'one alert, the bigger money');
      eq(r.summary.atRisk.SAR, 650, 'the real loss (1,400 spend − 750 sales), not 1,050');
    });

    test('«متوسط إعلانات المبيعات في حسابك» في الإعلانات، و«(الحساب كله)» على عائد الملخص وتكلفة طلبه لو فيه حملات أهداف تانية', function () {
      var s1 = a8('s1', { daily: [72, 72, 72, 71, 71, 71, 71, 30], res: [3, 3, 3, 3, 3, 3, 2, 1], sales: [215, 215, 215, 215, 215, 215, 210, 50] });
      var s2 = a8('s2', { daily: [72, 72, 72, 71, 71, 71, 71, 30], res: [3, 3, 3, 3, 3, 3, 2, 1], sales: [215, 215, 215, 215, 215, 215, 210, 50] });
      var r = withLang('ar', function () { return engine([s1, s2], {}, { roasTarget: 2.5, roasBreakEven: 1 }); });
      ok(!/متوسط عائد إعلانات المبيعات في حسابك/.test(r.byAd.s1.basis), 'no account average in the ad (settings only, 25 Oct): ' + r.byAd.s1.basis);
      var since = KEYS[0], until = KEYS[6], ws = DX.windows(since, until), daily = [];
      for (var k = ws[ws.length - 1].since; k <= until; k = shiftKey(k, 1)) daily.push({ date: k, spend: 214, imp: 20000, clicks: 300, atc: 30, ic: 12, pur: 6, rev: 428 });
      var other = { w: ws.map(function () { return { spend: 500, imp: 50000, clicks: 100, atc: 0, ic: 0, pur: 0, rev: 0 }; }), goals: { awareness: 500 } };
      withLang('ar', function () {
        var o = DX.compose(DX.analyze({ since: since, until: until, currency: 'SAR', daily: daily, dims: [], other: other }), { target: { roas: 2.5, be: 1 } });
        var lbl = function (id) { return o.kpis.filter(function (x) { return x.id === id; })[0].label; };
        ok(/الحساب كله/.test(lbl('roas')) && /الحساب كله/.test(lbl('cpa')) && !/الحساب كله/.test(lbl('spend')), lbl('roas') + ' | ' + lbl('cpa'));
        // مستقر وتحت المستهدف: العنوان مبيقولش «لا تغيّر يستدعي تدخّلك»
        eq(o.title, t('dx.head.stableBelow'));
        // من غير حملات أهداف تانية: الاسم زي ما هو
        var o2 = DX.compose(DX.analyze({ since: since, until: until, currency: 'SAR', daily: daily, dims: [] }));
        ok(!/الحساب كله/.test(o2.kpis.filter(function (x) { return x.id === 'roas'; })[0].label), 'plain label');
      });
    });

    test('الملخص: «امنحها ميزانية أكبر» بس لو الطلب الأرخص مبيرجّعش أقل لكل ريال (الربح أولاً)', function () {
      var since = KEYS[0], until = KEYS[6], ws = DX.windows(since, until), daily = [], i = 0;
      for (var k = ws[ws.length - 1].since; k <= until; k = shiftKey(k, 1), i++) {
        var p = 20 + ((i * 7) % 5) - 2;
        daily.push({ date: k, spend: 1000, imp: 100000, clicks: 1500, atc: 150, ic: 60, pur: p, rev: p * 300 });
      }
      var W = ws.slice(0, 3).map(function (w) {
        var t0 = { spend: 0, pur: 0, rev: 0, imp: 0, clicks: 0, atc: 0, ic: 0 };
        daily.forEach(function (d) { if (d.date >= w.since && d.date <= w.until) ['spend', 'pur', 'rev', 'imp', 'clicks', 'atc', 'ic'].forEach(function (f) { t0[f] += d[f]; }); });
        return t0;
      });
      var run = function (aovA) {
        var A = W.map(function (t0) { var pur = Math.round(t0.pur * 0.4); return { spend: t0.spend * 0.2, pur: pur, rev: pur * aovA, imp: t0.imp * 0.2, clicks: t0.clicks * 0.2, atc: t0.atc * 0.2, ic: t0.ic * 0.2 }; });
        var half = function (j, up) {
          var f = {};
          ['spend', 'imp', 'clicks', 'atc', 'ic'].forEach(function (x) { f[x] = (W[j][x] - A[j][x]) / 2; });
          var pr = (W[j].pur - A[j].pur) / 2; f.pur = up ? Math.ceil(pr) : Math.floor(pr);
          f.rev = f.pur * 375;
          return f;
        };
        var B = W.map(function (t0, j) { return half(j, 1); }), C = W.map(function (t0, j) { return half(j, 0); });
        var d2 = daily.map(function (d) { return Object.assign({}, d); });
        var r = DX.analyze({ since: since, until: until, currency: 'SAR', daily: d2,
          dims: [{ id: 'campaign', segs: [{ key: 'A', name: 'A', goal: 'sales', w: A }, { key: 'B', name: 'B', goal: 'sales', w: B }, { key: 'C', name: 'C', goal: 'sales', w: C }] }] });
        return r.segments.filter(function (s) { return s.kind === 'over'; }).map(function (s) { return s.key; });
      };
      // طلب A أرخص بـ٣ مرات تقريباً: بقيمة ١٠٠ (عائد ×٤ مقابل ×٦٫٦ في الباقي) = مش فرصة، وبقيمة ٣٧٥ زي الباقي = فرصة
      eq(run(100), [], 'cheaper orders that bring back less per riyal');
      eq(run(375), ['A'], 'cheaper orders at the same order value');
    });

    test('أرقام الفترة بدقتها الكاملة: مجموع إعلانات Snapchat = المنصة (من غير تقريب كل إعلان لأقرب سنت)', function () {
      var p = buildPeriod(1.004999, 1, 2.004999);
      ok(p.spend === 1.004999 && p.sales === 2.004999, JSON.stringify(p));
      var M = 1000000, ids = ['p1', 'p2', 'p3'];
      var adsList = ids.map(function (id) { return { ad: { id: id, name: id, status: 'ACTIVE' } }; });
      var totals = { total_stats: [{ total_stat: { breakdown_stats: { ad: ids.map(function (id) { return { id: id, stats: { spend: 1004999, conversion_purchases: 0, conversion_purchases_value: 0 } }; }) } } }] };
      var list = transformSnapchatAds(adsList, [], DAYS_X, 'USD', [], [], totals, null, null);
      var sum = list.reduce(function (s, c) { return s + periodOf(c).spend; }, 0);
      ok(Math.abs(sum - 3 * 1004999 / M) < 1e-9, 'period sum ' + sum);
    });

    testAsync('Snapchat: طلب الفترة فشل = «تعذّر تحميل أرقام الفترة المختارة» زي Meta (كانت أرقام ٧ أيام من غير إشارة)', function () {
      var realFetch = window.fetch;
      window.fetch = fakeFetch({ ads: [{ id: 'sa1', name: 'S', status: 'ACTIVE' }], stats: { timeseries_stats: [] }, periodStats: null, storeStats: null,
        periodStoreStats: null, range: { since: KEYS[0], until: KEYS[6] }, account: { currency: 'USD', timezone: 'UTC' } });
      sessionTokens.snapchat = { token: 'tok', expiresAt: Date.now() + 3600000 };
      snapchatAccessToken = 'tok';
      loadSnapchatAdsForAccount('acc-p');
      return tick().then(tick).then(tick).then(function () {
        window.fetch = realFetch;
        ok(document.getElementById('connectStatus').textContent.indexOf(t('note.periodFailed')) > -1, document.getElementById('connectStatus').textContent);
      }, function (e) { window.fetch = realFetch; throw e; });
    });

    testAsync('Meta: التكرار على الأيام المكتملة بس (آخر ٧ أيام زي اسمه) — مش شامل النهارده', function () {
      var hadFB = 'FB' in window, prevFB = window.FB, reach = null;
      var restore = function () { if (hadFB) window.FB = prevFB; else delete window.FB; };
      window.FB = { api: function (path, params, cb) {
        if (/insights$/.test(path) && params && /frequency/.test(params.fields || '') && params.time_range) reach = JSON.parse(params.time_range);
        var reply = /\/ads$/.test(path) ? { data: [{ id: 'f1', name: 'F', effective_status: 'ACTIVE', created_time: '2026-09-01T00:00:00+0000', adset: { id: 's', optimization_goal: 'OFFSITE_CONVERSIONS' }, campaign: { id: 'c' }, creative: {} }] } : { data: [] };
        setTimeout(function () { cb(reply); }, 0);
      } };
      accountInfo['meta:act_31'] = { timeZone: 'UTC', currency: 'SAR' };
      loadAdsForAccount('act_31');
      return sleep(80).then(function () {
        restore();
        var days = last7Days(todayKeyInTz('UTC'));
        ok(reach && reach.since === days[0].key && reach.until === days[6].key, JSON.stringify(reach));
      }, function (e) { restore(); throw e; });
    });

    // حساب حقيقي ١٨ أكتوبر: أفضل إعلان في الحساب (×١٫٩ والحساب ×٠٫٨) تحت حد الخسارة ×٥ — الشرح كان بيقول «أفضل من متوسط
    // حسابك» والنصيحة «تعديله أو خفض ميزانيته». خفض ميزانية الأحسن بيقلل المبيعات أكتر من غيره (متوسط الباقي أضعف منه)
    // نفس العائد (×١٫٩ و×٠٫٤٣) بعدد طلبات أكبر (١٠ و١٤): بـ٣ طلبات وطلبين كان الفرق عن الحد في حدود الصدفة (المرحلة ٥ ق١)
    var pair = function () {
      return [a8('best', { daily: [75, 75, 75, 75, 75, 75, 75, 0], res: [2, 1, 2, 1, 2, 1, 1, 0], sales: [190, 95, 190, 95, 190, 95, 142, 0] }),
        a8('weak', { daily: [215, 215, 215, 215, 215, 215, 215, 0], res: [2, 2, 2, 2, 2, 2, 2, 0], sales: [93, 93, 93, 93, 93, 93, 92, 0] })];
    };
    var issueOf = function (r, id, code) { return r.byAd[id].issues.filter(function (x) { return x.code === code; })[0]; };
    // ومن ٢٥ أكتوبر (قرار صاحب المنتج: الإعدادات المسجلة بس، من غير «متوسط الحساب»): الجملة والنصيحة بحدودك، و«انقل ميزانيته
    // للإعلانات الأفضل أداءً» بس لو فيه إعلان تاني في خانة أحسن بحدودك (فوق حد الخسارة لإعلان خسران، وعند المستهدف لإعلان تحته)
    test('تحت المستهدف: الجملة والنصيحة بحدودك من غير متوسط الحساب، و«التركّز» بس لو فيه إعلان أحسن بحدودك', function () {
      var r = withLang('ar', function () { return engine(pair(), {}, { roasTarget: 6 }); });
      var b = issueOf(r, 'best', 'loss'), w = issueOf(r, 'weak', 'loss');
      var lossA = withLang('ar', function () { return t('al.lowRoas.a'); });
      ok(b && !/متوسط|حسابك/.test(b.detail) && b.advice === lossA, b ? b.detail + ' | ' + b.advice : issuesOf(r, 'best'));
      // الأضعف واخد ٧٤٪ من الإنفاق، والتاني خسران كمان بحدك (×١٫٩ والحد ×٥): مفيش «أفضل أداءً» ننقل ليه
      var conc = withLang('ar', function () { return t('al.conc.in', { pct: '' }).slice(0, 12); });
      ok(w && w.advice.indexOf(lossA) === 0 && w.advice.indexOf(conc) < 0, w ? w.advice : issuesOf(r, 'weak'));
      // والمستهدف ×١٫٥: الأحسن (×١٫٩) فوق حدك، فجملة التركّز بتطلع على الأضعف الخسران
      var r2 = withLang('ar', function () { return engine(pair(), {}, { roasTarget: 1.5 }); });
      var w2 = issueOf(r2, 'weak', 'loss');
      ok(w2 && w2.advice.indexOf(conc) > -1, w2 ? w2.advice : issuesOf(r2, 'weak'));
    });
    test('عائد أقل من المستهدف: النصيحة بحدودك زي أي إعلان، من غير «متوسط بقية إعلانات المبيعات أضعف منه»', function () {
      var r = withLang('ar', function () { return engine(pair(), {}, { roasTarget: 4 }); });
      var b = issueOf(r, 'best', 'loss');
      ok(b && b.advice === withLang('ar', function () { return t('al.lowRoas.a'); }), b ? b.advice : issuesOf(r, 'best'));
      ok(issueOf(r, 'weak', 'loss'), issuesOf(r, 'weak'));
    });
    // حساب حقيقي ١٨ أكتوبر: أسوأ إعلان (٥٠٩ ر.س وطلب واحد بـ٣٢٩، ×٠٫٦٥ والحد ×٥) كان «لم يُحكم بعد» من غير ولا ملاحظة، وأحسن منه
    // (٤٧٩ ر.س و٣ طلبات، ×٢٫١) «عاجل» — دليل «٣ طلبات أو إنفاق يكفي لـ٣ بمتوسط الحساب» بيتقاس بمتوسط حساب خسران أصلاً
    var worstBest = function () {
      return [a8('Wst', { daily: [73, 73, 73, 73, 73, 72, 72, 0], res: [0, 0, 1, 0, 0, 0, 0, 0], sales: [0, 0, 329, 0, 0, 0, 0, 0] }),
        a8('Bst', { daily: [69, 69, 69, 68, 68, 68, 68, 0], res: [1, 0, 1, 0, 1, 0, 0, 0], sales: [332, 0, 332, 0, 332, 0, 0, 0] })];
    };
    test('أسوأ إعلان بطلب واحد وإنفاق كبير تحت المستهدف = «عاجل» بالسببين (عائد الفترة و٣ أيام دون طلب) — وسبب حكمه مش «مبدئي»', function () {
      var r = withLang('ar', function () { return engine(worstBest(), {}, { roasTarget: 6, maxCost: { purchase: 100 } }); });
      // تنبيه أداء واحد للإعلان (ISA-18.2): «٣ أيام دون مشتريات» والخسارة على الأسبوع جملة جوّاه — صاحب المنتج عايز يشوف كل سبب
      var w = r.byAd.Wst.issues.filter(function (i) { return i.level === 'critical'; })[0];
      ok(w && /آخر ٣ أيام/.test(w.detail) && /أقل من المستهدف \(×٦\)/.test(w.detail), w ? w.title + ' | ' + w.detail : issuesOf(r, 'Wst'));
      ok(r.byAd.Wst.health === 'review' && !/مبدئي/.test(r.byAd.Wst.basis || ''), r.byAd.Wst.health + ' | ' + r.byAd.Wst.basis);
      // الأحسن (٣ طلبات بعائد ×٢٫١ والمستهدف ×٦): تحت المستهدف بعد أكتر من ضعف التكلفة المسموحة = عاجل هو كمان (الحكم بحدودك —
      // ٢٥ أكتوبر؛ كان «مش عاجل» باحتمال الصدفة)
      var b = issueOf(r, 'Bst', 'loss');
      ok(b && b.level === 'critical', b ? b.level : JSON.stringify(r.byAd.Bst.issues.map(function (i) { return i.code + ':' + i.level; })));
    });
    test('طلب واحد رخيص في حساب طلباته غالية = مفيش دليل خسارة (مش «عاجل» ولا في المعرّض للهدر) — والإنفاق الصغير من غير تنبيه', function () {
      // متوسط تكلفة الطلب في الحساب ٣٨٠ (١٬٩٠٠ ÷ ٥): إنفاق «mid» أقل من ٣ أضعافه، فالدليل الأول مبيشتغلش — الاحتمال بس
      var base = [a8('o1', { daily: [100, 100, 100, 100, 100, 100, 100, 0], res: [1, 0, 0, 1, 0, 0, 0, 0], sales: [1800, 0, 0, 1800, 0, 0, 0, 0] }),
        a8('o2', { daily: [100, 100, 100, 100, 100, 100, 100, 0], res: [1, 0, 0, 1, 0, 0, 0, 0], sales: [1800, 0, 0, 1800, 0, 0, 0, 0] })];
      // ٤٠٠ وطلب واحد بـ٣٣٠، والحد ×٥: المتوقع على الحد ٦ طلبات، واحتمال طلب واحد أو أقل ١٫٧٪
      var mid = a8('mid', { daily: [58, 57, 57, 57, 57, 57, 57, 0], res: [0, 0, 1, 0, 0, 0, 0, 0], sales: [0, 0, 330, 0, 0, 0, 0, 0] });
      // ١٠٠ وصفر طلبات: المتوقع على الحد ١٫٤ واحتمال الصفر ٢٥٪ — مفيش دليل
      var tiny = a8('tiny', { daily: [15, 15, 14, 14, 14, 14, 14, 0] });
      var r = withLang('ar', function () { return engine(base.concat([mid, tiny]), {}, { roasTarget: 5 }); });
      // من المرحلة ٥ (ق١): طلب واحد بـ٣٣٠ وطلبات الحساب بـ١٬٨٠٠ — قيمة طلب الإعلان نفسه مش معروفة من طلب واحد (تتقرّب لقيمة الحساب)،
      // فالمتوقع على الحد نحو ١٫٧ طلب بس ومفيش دليل: مش «عاجل» ومش في المعرّض للهدر
      var m = issueOf(r, 'mid', 'loss');
      ok(!(m && (m.level === 'critical' || m.atRisk)), m ? m.level + ' atRisk=' + m.atRisk : 'no loss');
      ok(!issueOf(r, 'tiny', 'loss'), issuesOf(r, 'tiny'));
    });
    // حساب حقيقي ١٨ أكتوبر: معاينة البريد قالت «٥ طلبات» من غير سطر «للمقارنة: تنسب Meta…» اللي في الأداة (Meta بتنسب ١٦)
    test('رقم المنصة في كل خانة من الملخص وسطر «ليه أعلى» من المحرك نفسه — الأداة والنص المنسوخ ورسالة البريد بنفس الكلام', function () {
      var row = function (d, ppur) { return { date: d, spend: 100, pur: 2, rev: 400, ppur: ppur, prev: ppur == null ? null : ppur * 200 }; };
      var inp = { since: '2026-10-04', until: '2026-10-05', currency: 'SAR', daily: [row('2026-10-03', 9), row('2026-10-04', 5), row('2026-10-05', 5)] };
      eq(DX.platTotals(inp, 'meta'), { pur: 10, rev: 2000 }, 'Meta: the days of the period only');
      var line = withLang('ar', function () { return DX.platCompare(inp, 'meta'); });
      eq(line, withLang('ar', function () { return t('dx.platWhy', { plat: 'Meta' }); }));
      var one = { since: '2026-10-04', until: '2026-10-04', daily: [row('2026-10-04', null)] };
      eq([DX.platTotals(one, 'meta'), DX.platCompare(one, 'meta')], [{ pur: 2, rev: 400 }, null], 'a day without windows: its number is the platform number itself');
      // Snapchat وGoogle: الحساب كله من السيرفر (plat)، ولو الملخص نفسه بأرقام المنصة الرقمين واحد
      var sn = { since: '2026-10-04', until: '2026-10-05', currency: 'SAR', daily: [{ date: '2026-10-04', spend: 100, pur: 1, rev: 100 }, { date: '2026-10-05', spend: 100, pur: 2, rev: 200 }] };
      eq([DX.platTotals(sn, 'snapchat'), DX.platCompare(sn, 'snapchat')], [null, null], 'an old server reply = no number');
      sn.plat = { pur: 8, rev: 1600 };
      eq(DX.platTotals(sn, 'snapchat'), { pur: 8, rev: 1600 });
      eq(withLang('ar', function () { return DX.platCompare(sn, 'snapchat'); }), withLang('ar', function () { return t('dx.platWhy', { plat: 'Snapchat' }); }));
      sn.numbers = 'platform';
      eq([DX.platTotals(sn, 'snapchat'), DX.platCompare(sn, 'snapchat')], [{ pur: 3, rev: 300 }, null], 'the summary is already the platform numbers');
      // كل خانة بنفس الإنفاق
      withLang('ar', function () {
        var o = { kpis: ['spend', 'orders', 'revenue', 'aov', 'roas', 'cpa'].map(function (id) { return { id: id, label: id, value: 'v', prev: 'p' }; }) };
        DX.platKpis(o, { currency: 'SAR', cur: { spend: 200, pur: 4, rev: 800 } }, { pur: 10, rev: 2000 });
        eq(o.kpis.map(function (k) { return k.plat; }), [money(200, 'SAR'), fmtNum(10), money(2000, 'SAR'), money(200, 'SAR'), roasStr(10), money(20, 'SAR')]);
        var text = DX.toText({ period: 'p', title: 'T', tone: 'bad', kpis: o.kpis, blocks: [], notes: [], platCmp: line }, 'Acc');
        ok(text.indexOf(line) > -1 && text.indexOf('• orders: v (' + t('dx.kpi.prev', { label: t('period.cmpPrev'), v: 'p' }) + t('dx.kpi.sep') + t('dx.kpi.plat', { v: fmtNum(10) }) + ')') > -1, text);
        eq(DX.platKpis({ kpis: [{ id: 'orders' }] }, { cur: { spend: 1 } }, { pur: 0, rev: 0 }).kpis[0].plat, fmtNum(0), 'zero is a number');
      });
      // من غير مشتريات عندنا والمنصة بتنسب طلبات: البيكسل شغّال — «لا تصل إلى المنصة أي عمليات شراء» كانت هتبقى غلط
      var d = [];
      for (var i = 40; i >= 1; i--) d.push({ date: shiftKey('2026-10-20', -i), spend: 100, imp: 1000, clicks: 10, atc: 0, ic: 0, pur: 0, rev: 0 });
      var rep = DX.analyze({ since: '2026-10-13', until: '2026-10-19', currency: 'SAR', daily: d, dims: [] });
      eq(rep.status, 'noPurchases');
      withLang('ar', function () {
        var po = DX.compose(rep, { plat: { pur: 3, rev: 300 } });
        eq([po.title, po.blocks[0].title, po.blocks[0].lines[0]], [t('dx.head.noProven'), t('dx.head.noProven'), t('dx.noPurchases.plat', { orders: DX.ordersText(3) })], 'the heading says it too');
        eq(DX.compose(rep).title, t('dx.head.noPurchases'));
        eq(DX.compose(rep, { plat: { pur: 0, rev: 0 } }).blocks[0].lines[0], t('dx.noPurchases'));
        eq(DX.compose(rep).blocks[0].lines[0], t('dx.noPurchases'));
      });
    });
    // ٣١ أكتوبر: سطر Snapchat اتنقل من ui.js للمحرك عشان ملخص Snapchat بالبريد يقوله (runner.ts snapSummary)
    test('ملخص Snapchat وGoogle بياخد رقم المنصة للحساب كله من رد السيرفر (مش من إعلانات الشراء بس — إعلانات الزيارات ليها طلبات كمان)', function () {
      var keep = { apiPost: window.apiPost, isCurrentLoad: window.isCurrentLoad, dxBegin: window.dxBegin, dxDone: window.dxDone }, keepOn = DX_ON, got = null;
      window.apiPost = function () { return { then: function (f) { f({ ok: true, data: { daily: [], dims: [], plat: { pur: 4, rev: 40 }, numbers: 'store' } }); return { catch: function () {} }; } }; };
      window.isCurrentLoad = function () { return true; };
      window.dxBegin = function () { return true; };
      window.dxDone = function (p, key, input) { got = input; };
      try {
        DX_ON = true;
        loadSnapchatDiagnosis('acc-x', { timezone: 'UTC', currency: 'SAR' }, 't');
        eq([got && got.plat, got && got.numbers], [{ pur: 4, rev: 40 }, 'store'], 'Snapchat');
        got = null;
        loadGoogleDiagnosis('123', { timeZone: 'UTC', currency: 'SAR', name: 'G' }, 't');
        eq([got && got.plat, got && got.numbers], [{ pur: 4, rev: 40 }, 'store'], 'Google');
      } finally {
        DX_ON = keepOn;
        Object.keys(keep).forEach(function (k) { window[k] = keep[k]; });
      }
    });
    // حساب حقيقي ١٨ أكتوبر: «رُفعت ميزانية المجموعة أمس من ١٠ لـ ٢٠ $، ونحتاج ٣ أيام كاملة» وجنبه فرصة «زيادة الميزانية» من أيام قبل التعديل
    test('تعديل حديث: فرصة «زيادة الميزانية» بتفضل فرصة بس اقتراحها «انتظر أثر التعديل»، والحكم زي ما هو ومعاه الوسم', function () {
      var peers = [a8('pb', { key: 'lead', daily: [100, 100, 100, 100, 100, 100, 100, 40], res: [2, 2, 2, 2, 2, 2, 2, 1] }),
        a8('pc', { key: 'lead', daily: [100, 100, 100, 100, 100, 100, 100, 40], res: [2, 2, 2, 2, 2, 2, 2, 1] })];
      var mk = function (edits) { return a8('sc', { key: 'lead', daily: [100, 100, 100, 100, 100, 100, 100, 40], res: [5, 5, 5, 5, 5, 5, 5, 2], edits: edits }); };
      var before = issueOf(engine(peers.concat([mk(null)])), 'sc', 'scale');
      ok(before && before.level === 'opportunity', 'without an edit it is an opportunity: ' + (before ? before.level : 'none'));
      var r = withLang('ar', function () { return engine(peers.concat([mk([{ date: K8[5], level: 'adset', kind: 'budget', from: 1000, to: 2000 }])])); });
      var after = issueOf(r, 'sc', 'scale');
      ok(after && after.level === 'opportunity', after ? after.level + ' | ' + after.detail : issuesOf(r, 'sc'));
      eq([r.byAd.sc.health, !!r.byAd.sc.editTag], ['good', true]);
      // والاقتراح: استنى أثر التعديل قبل أي زيادة تانية — مش «زوّد ميزانيته» والميزانية اتضاعفت أمس
      ok(after.advice.indexOf('انتظر حتى تكتمل ٣ أيام') === 0 && after.advice.indexOf('من ١٠ ر.س إلى ٢٠ ر.س') > -1, after.advice);
    });
    test('انخفاض إنفاق الحساب: النص بيقول المتوسط اتحسب على كام يوم (٦ أيام قبل أمس — مش إنفاق الـ٧ أيام ÷ ٧)', function () {
      var ads = [a8('d1', { daily: [200, 200, 200, 200, 200, 200, 60, 10], res: [2, 2, 2, 2, 2, 2, 1, 0] }),
        a8('d2', { daily: [100, 100, 100, 100, 100, 100, 30, 5], res: [1, 1, 1, 1, 1, 1, 0, 0] })];
      var meta = { 'meta:act_1': { label: 'Meta — T', currency: 'SAR', timeZone: 'UTC', metaAccountStatus: 1, spendCapReached: false, spendCap: 0, amountSpent: 0 } };
      var a = withLang('ar', function () { return engine(ads, meta); }).alerts.filter(function (x) { return x.code === 'acct-drop'; })[0];
      ok(a && /أمس ٩٠ ر\.س فقط مقابل متوسط ٣٠٠ ر\.س يومياً خلال ٦ أيام قبله \(−٧٠٪\)/.test(a.detail), a ? a.detail : 'no alert');
      var en = withLang('en', function () { return engine(ads, meta); }).alerts.filter(function (x) { return x.code === 'acct-drop'; })[0];
      ok(en && /over the 6 days before/.test(en.detail), en ? en.detail : 'no en alert');
    });
  });

  // المرحلة ٥ (ق١، ١٩ أكتوبر ٢٠٢٦): معيار دليل واحد لأحكام أداء الإعلان، هو معيار تشخيص المتجر. محاكاة حساب سليم تماماً (كل إعلاناته
  // بنفس الأداء الحقيقي) كانت بتطلّع عاجل كاذب في ٦٤–٨٢٪ من الفحوص و٣٫٩ رسالة عاجلة كاذبة في الأسبوع. نسخة مصغّرة بذرة ثابتة من
  // tests/private/alert-sim.html (نفس الافتراضات: تذبذب يوم الحساب ٠٫١٥ والإعلان ٠٫٢ والإنفاق ٠٫٣، وقيمة طلب معامل اختلافها ٠٫٨)
  describe('معيار الدليل لتنبيهات الإعلان (المرحلة ٥)', function () {
    var K8 = last7Days(TODAY).map(function (d) { return d.key; });
    function rng(seed) {
      var a = seed >>> 0;
      return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        var x = Math.imul(a ^ (a >>> 15), 1 | a);
        x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
      };
    }
    function normal(r) { var u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    function poisson(l, r) { if (!(l > 0)) return 0; var L = Math.exp(-l), k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; }
    function lognorm(r, cv) { var s = Math.sqrt(Math.log(1 + cv * cv)); return Math.exp(s * normal(r) - s * s / 2); }
    // ٢٠ إعلان، ميزانيات ٢٠–٣٠٠ يومياً، تكلفة الطلب الحقيقية ١٠٠، وقيمة الطلب aov. plant = { idx, factor } إعلان بمشكلة حقيقية
    function account(r, aov, plant) {
      var dayF = [], ads = [];
      for (var d = 0; d < 8; d++) dayF.push(lognorm(r, 0.15));
      for (var a = 0; a < 20; a++) {
        var budget = 20 * Math.pow(15, a / 19), rate = 0.01 * (plant && plant.idx === a ? plant.factor : 1), daily = [], res = [], sales = [];
        for (var dd = 0; dd < 8; dd++) {
          var sp = Math.round(budget * lognorm(r, 0.3) * (dd === 7 ? 0.5 : 1) * 100) / 100, k = poisson(sp * rate * dayF[dd] * lognorm(r, 0.2), r), v = 0;
          for (var j = 0; j < k; j++) v += aov * lognorm(r, 0.8);
          daily.push(sp); res.push(k); sales.push(Math.round(v * 100) / 100);
        }
        var c = ad('s' + a, { daily: daily.slice(0, 7), res: res.slice(0, 7), sales: sales.slice(0, 7), cid: 'c' + (a % 4), age: 40 });
        c.daily = daily; c.dailyResults = res; c.dailySales = sales; c.dailyDates = K8;
        ads.push(c);
      }
      return ads;
    }
    // الحكم بحدودك (٢٥ أكتوبر، الجولة الرابعة — قرارات صاحب المنتج: الرقم المقاس مقابل الخط، و«عاجل» بأقصى تكلفة يكتبها، من غير
    // استثناء «طلب زيادة») — القياس اللي اتقال له: حساب سليم تماماً (طلبه الحقيقي بـ١٠٠ والعائد ×٤٫٥، و٢٠ إعلان من ٢٠ لـ٣٠٠ في اليوم)
    // وأقصى تكلفة ١٥٠ (تكلفة الطلب المستهدفة): «عاجل» بيجي من خطوطه بس (أقصى التكلفة، العائد المستهدف، دون نتائج) — مفيش «عاجل»
    // من المقارنة بالباقي ولا من التكرار. ده ثمن التطبيق الحرفي، والحد هنا بيحرس إنه ميزيدش من غير قصد:
    //  - لحد ٨ نوفمبر ٢٠٢٦ (مستهدف ×٣ وحد خسارة ×١): «عاجل» على نحو ١٤٪ من الإعلانات، أغلبه «تكلفة الطلب فوق ١٥٠»
    //  - ومن ٨ نوفمبر (المستهدف هو الخط الوحيد — قرار صاحب المنتج): ٢٠٪، لأن المنطقة اللي كانت صفرا (بين ×١ و×٣) بقت حمرا
    test('حساب مبيعات سليم تماماً بأقصى تكلفة ١٥٠: «عاجل» من خطوط صاحب الحساب بس، وعلى أقل من ٢٢٪ من الإعلانات (الثمن المقاس للتطبيق الحرفي)', function () {
      var r = rng(501), runs = 120, urgentRuns = 0, warnAds = 0, total = 0, urgentAds = 0, byCode = {};
      for (var k = 0; k < runs; k++) {
        var out = engine(account(r, 450, null), {}, { maxCost: { purchase: 150 } });
        if (out.alerts.some(function (a) { return a.level === 'critical' && !a.minor; })) urgentRuns++;
        Object.keys(out.byAd).forEach(function (id) {
          total++;
          var top = out.byAd[id].issues.filter(function (i) { return (i.level === 'critical' || i.level === 'warning') && !i.minor && !i.quiet; })[0];
          if (top) { warnAds++; byCode[top.code + ':' + top.level] = (byCode[top.code + ':' + top.level] || 0) + 1; if (top.level === 'critical') urgentAds++; }
        });
      }
      var stats = 'runs with urgent ' + urgentRuns + '/' + runs + ', urgent ads ' + urgentAds + '/' + total + ', flagged ads ' + warnAds + '/' + total + ' ' + JSON.stringify(byCode);
      ok(urgentAds / total < 0.22, stats);
      ok(Object.keys(byCode).filter(function (k) { return /:critical$/.test(k); }).every(function (k) { return /^(cost-max|loss|waste|waste-week):/.test(k); }), stats);
      ok(warnAds / total < 0.4, stats);
    });
    test('إعلان بلا أي طلب (إنفاقه متوسط) مكشوف في كل مرة، وإعلان تكلفة طلبه ×٣ مكشوف في ٤٠٪ أو أكتر (أقصى الممكن نحو ٥٦٪)', function () {
      var r = rng(502), runs = 60, dead = 0, costly = 0;
      for (var k = 0; k < runs; k++) {
        var d = engine(account(r, 300, { idx: 12, factor: 0 })).byAd.s12.issues;
        if (d.some(function (i) { return i.level === 'critical' || i.level === 'warning'; })) dead++;
        var c = engine(account(r, 300, { idx: 12, factor: 1 / 3 })).byAd.s12.issues;
        if (c.some(function (i) { return i.level === 'critical' || i.level === 'warning'; })) costly++;
      }
      eq(dead, runs, 'no-orders ad caught every time');
      ok(costly / runs >= 0.4, 'costly ad caught ' + costly + ' of ' + runs);
    });
    test('احتمال المبيعات الدقيق (بواسون مركّب مع جاما) = محاكاة مونت كارلو: أسوأ إعلان ٠٫٧٨٪، والأحسن ١٠٪', function () {
      var P = PauseProofAlerts._.roasP;
      // القيم من ٢٠٠ ألف عيّنة مونت كارلو لنفس النموذج (tests/private/alert-debug.html)
      ok(Math.abs(P(329, 509, 5, 1, 331, 7, -1) - 0.00788) < 0.0005, String(P(329, 509, 5, 1, 331, 7, -1)));
      ok(Math.abs(P(996, 479, 5, 3, 331, 7, -1) - 0.0998) < 0.003, String(P(996, 479, 5, 3, 331, 7, -1)));
      ok(Math.abs(P(4800, 600, 3, 24, 200, 6, 1) - 0.00143) < 0.0003, String(P(4800, 600, 3, 24, 200, 6, 1)));
      // فوق الحد في اختبار «أقل» (أو العكس) = مفيش دليل
      eq([P(700, 100, 5, 3, 200, 7, -1), P(300, 100, 5, 3, 200, 7, 1)], [1, 1]);
    });
  });

  // مراجعة ٨ نوفمبر ٢٠٢٦ (صاحب المنتج: «تأكد من عدم وجود ثغرات تكاملية مع باقي الأداة»): «تعديل كبير» و«الشراء/التتبّع متوقف»
  // كانوا بيتبعتوا عاجل بالبريد بس — دلوقتي بيظهروا في الأداة بنفس القواعد والبيانات لـ Meta
  describe('تنبيهات البريد اللي محتاجة طلبات زيادة: في الأداة كمان', function () {
    var SRC = 'meta:act_1';
    function siteDaysBuyOff() {
      var d = [], k = shiftKey(todayKeyInTz('Asia/Riyadh'), -7);
      for (var i = 0; i < 8; i++) {
        d.push(i < 6 ? { date: k, clicks: 100, lpv: 60, atc: 10, ic: 6, pur: 4 }
          : (i === 6 ? { date: k, clicks: 50, lpv: 30, atc: 0, ic: 0, pur: 0 } : { date: k, clicks: 0, lpv: 0, atc: 0, ic: 0, pur: 0 }));
        k = shiftKey(k, 1);
      }
      return d;
    }
    function stubMeta(days, objDaily) {
      var keep = { site: window.metaSiteDays, obj: window.metaObjectDaily }, calls = { site: 0, obj: [] };
      window.metaSiteDays = function () { calls.site++; return Promise.resolve(days); };
      window.metaObjectDaily = function (acc, groups) { calls.obj.push(groups); return Promise.resolve(objDaily); };
      calls.restore = function () { window.metaSiteDays = keep.site; window.metaObjectDaily = keep.obj; delete valueActions[SRC]; };
      return calls;
    }
    function store() {
      activeSources.meta = 'act_1';
      accountInfo[SRC] = { currency: 'SAR', timeZone: 'Asia/Riyadh' };
      setPlatformOptions('meta', [{ value: 'act_1', label: 'Meta — Store' }]);
      candidates = [ad('m1', { cid: 'c1', daily: steady(50) }), ad('m2', { cid: 'c2', daily: steady(50) })];
    }
    testAsync('Meta: «تعديل كبير» في آخر ٢٤ ساعة و«الشراء متوقف» بيظهروا عاجل زي البريد، والقديم لأ، ومعدودين في العاجل', function () {
      store();
      var now = Date.now();
      valueActions[SRC] = { since: 0, complete: true, list: [
        { kind: 'budget', level: 'campaign', id: 'c1', name: 'Camp One', actor: 'Ali', time: new Date(now - 2 * 3600000).toISOString(), date: '', from: 10000, to: 30000, lifetime: false },
        { kind: 'pause', level: 'campaign', id: 'c2', name: 'Camp Two', actor: 'Ali', time: new Date(now - 30 * 3600000).toISOString(), date: '' },
        { kind: 'targeting', level: 'adset', id: 's1', name: 'Set', time: new Date(now - 3600000).toISOString(), date: '' }
      ] };
      var s = stubMeta(siteDaysBuyOff(), { c1: [{ spend: 300 }] });
      runAnalysis();
      var before = analysisNow.summary.levels.critical;
      // البداية الحقيقية: سجل التعديلات وصل (meta.js loadAdEdits ← valueActionsArrived)
      valueActionsArrived(SRC);
      eq(s.site, 1, 'asked when the change log arrives');
      return tick().then(function () {
        var mine = analysisNow.alerts.filter(function (a) { return a.source === SRC && (a.code === 'big-edit' || a.code === 'checkout-off'); });
        eq(mine.map(function (a) { return a.code + ':' + a.level; }).sort(), ['big-edit:critical', 'checkout-off:critical']);
        eq(analysisNow.summary.levels.critical, before + 2, 'counted in the urgent number');
        eq(s.obj, [[{ level: 'campaign', ids: ['c1'] }]], 'object spend asked once, for the recent budget or pause edit only');
        var be = mine.filter(function (a) { return a.code === 'big-edit'; })[0];
        ok(/Camp One/.test(be.detail) && /Ali/.test(be.detail), be.detail);
        eq(be.accountName, 'Meta — Store');
        var levels = analysisNow.alerts.map(function (a) { return a.level; });
        ok(levels.lastIndexOf('critical') < (levels.indexOf('warning') < 0 ? Infinity : levels.indexOf('warning')) &&
          levels.lastIndexOf('critical') < (levels.indexOf('info') < 0 ? Infinity : levels.indexOf('info')), 'urgent stays together: ' + levels.join(','));
        renderAlerts();
        ok(alertsListEl.textContent.indexOf(be.title) > -1, 'on the alerts page');
        eq(alertsTabCount.textContent, ar(analysisNow.summary.levels.critical), 'the tab number includes them');
        // بلغة العميل: التحليل بيبنيهم من جديد
        withLang('en', function () { runAnalysis(); });
        var en = analysisNow.alerts.filter(function (a) { return a.code === 'checkout-off'; })[0];
        ok(en && !/[؀-ۿ]/.test(en.title), en ? en.title : 'none');
        runAnalysis();
        // ١٠ دقايق: مفيش طلب تاني
        loadExtraAlerts(SRC);
        eq(s.site, 1, 'cached for 10 minutes');
      }).then(function () { s.restore(); }, function (e) { s.restore(); throw e; });
    });
    test('«تعديل كبير» على عنصر عليه «توقف أكبر مصدر» مبيتكررش (زي البريد)، وSnapchat مالوش الطلبات دي', function () {
      store();
      extraInputs[SRC] = { days: [], cur: 'SAR', tz: 'Asia/Riyadh', accSpend: 700, name: 'Meta — Store',
        edits: [{ kind: 'pause', level: 'campaign', id: 'c1', name: 'Camp One', time: new Date().toISOString(), date: '', share: 0.4 }] };
      var an = { alerts: [{ code: 'top-stopped', level: 'critical', objectId: 'c:c1' }], summary: { levels: { critical: 1, warning: 0, opportunity: 0, info: 0 } } };
      addExtraAlerts(an);
      eq([an.alerts.map(function (a) { return a.code; }), an.summary.levels.critical], [['top-stopped'], 1], 'no second alert on a stopped top source');
      var an2 = { alerts: [], summary: { levels: { critical: 0, warning: 0, opportunity: 0, info: 0 } } };
      addExtraAlerts(an2);
      eq(an2.alerts.map(function (a) { return a.code; }), ['big-edit'], 'without it: the pause alert');
      var s = stubMeta([], {});
      try {
        loadExtraAlerts('snapchat:abc-1');
        eq([s.site, s.obj.length], [0, 0], 'Snapchat: nothing asked (the email has no such rules for it yet)');
      } finally { s.restore(); }
    });
  });

  describe('ربط Meta المحفوظ على الجهاز (الهاتف كان بيفصل الحسابات كل مرة)', function () {
    var withFb = function (fn) {
      var prevFb = window.FB, calls = [];
      window.FB = { api: function () { calls.push(Array.prototype.slice.call(arguments)); } };
      try { fn(calls); } finally { window.FB = prevFb; }
    };
    test('من غير مفتاح محفوظ: الطلب بجلسة مكتبة فيسبوك زي الأول', function () {
      withFb(function (calls) {
        metaApi('/me/adaccounts', { limit: 5 }, function () {});
        eq(calls[0][1], { limit: 5 });
      });
    });
    // من ١١ أكتوبر ٢٠٢٦ الطلب بالمفتاح بيروح Graph على طول (graphCall) مش عن طريق المكتبة
    test('بالمفتاح المحفوظ: الطلب بيروح Graph على طول بالمفتاح (GET وPOST)، من غير المكتبة ومن غير ما يغيّر params الأصلية', function () {
      var prevTok = sessionTokens.meta, prevFetch = window.fetch, sent = [];
      rememberToken('meta', 'LONG_TOKEN_X', 3600);
      window.fetch = function (u, o) { sent.push([String(u), o && o.body]); return new Promise(function () {}); };
      try {
        withFb(function (calls) {
          var p = { fields: 'id' };
          metaApi('/act_1/ads', p, function () {});
          metaApi('/', 'POST', { batch: '[]' }, function () {});
          eq([calls.length, p.access_token], [0, undefined]);
          ok(/access_token=LONG_TOKEN_X/.test(sent[0][0]) && /fields=id/.test(sent[0][0]), sent[0][0]);
          ok(/access_token=LONG_TOKEN_X/.test(sent[1][1]) && /batch=%5B%5D/.test(sent[1][1]), String(sent[1][1]));
        });
      } finally {
        window.fetch = prevFetch;
        if (prevTok) sessionTokens.meta = prevTok; else delete sessionTokens.meta;
      }
    });
    testAsync('كل طلبات Meta في meta.js وui.js بتعدّي من metaApi', function () {
      return Promise.all(['/js/meta.js', '/js/ui.js'].map(function (u) {
        return fetch(u + '?t=' + Date.now()).then(function (r) { return r.text(); });
      })).then(function (srcs) {
        var direct = srcs.join('\n').split('\n').filter(function (l) { return /FB\.api\(/.test(l) && !/return FB\.api\(/.test(l); });
        eq(direct, [], 'direct FB.api calls');
      });
    });
    testAsync('التجديد: المفتاح بيرجع للجلسة، و٤١٠ بيمسح النسخة، والعطل المؤقت بيسيبها', function () {
      var prev = window.syncCall, step = 0;
      var answers = [
        Promise.resolve({ access_token: 'RENEWED', expires_in: 5000 }),
        Promise.reject(Object.assign(new Error('HTTP 410'), { status: 410 })),
        Promise.reject(Object.assign(new Error('HTTP 502'), { status: 502 }))
      ];
      window.syncCall = function (body) { eq(body.action, 'meta.renew'); return answers[step++]; };
      keepSealed('meta', 'm1.sealedcopy');
      return renewSession('meta').then(function (ok) {
        eq([ok, validToken(sessionTokens.meta), sealedFor('meta')], [true, 'RENEWED', 'm1.sealedcopy']);
        delete sessionTokens.meta;
        return renewSession('meta');
      }).then(function (ok) {
        eq([ok, sealedFor('meta')], [false, null], '410 clears the copy');
        keepSealed('meta', 'm1.sealedcopy');
        return renewSession('meta');
      }).then(function (ok) {
        eq([ok, sealedFor('meta')], [false, 'm1.sealedcopy'], 'a temporary failure keeps it');
      }).then(function () { window.syncCall = prev; keepSealed('meta', null); }, function (e) { window.syncCall = prev; keepSealed('meta', null); throw e; });
    });
    testAsync('«خروج» بيمسح الربط المحفوظ وآخر حساب من الجهاز', function () {
      return fetch('/js/auth.js?t=' + Date.now()).then(function (r) { return r.text(); }).then(function (src) {
        var keys = JSON.parse((/var DEVICE_KEYS = (\[[^\]]*\])/.exec(src) || [])[1].replace(/'/g, '"'));
        eq(keys, ['acc.renew.v1', 'acc.lastAccount.v1', 'acc.dx.fb.v1', 'pauseproof.value.money.v1', 'pauseproof.value.money.v2', 'pauseproof.value.ack.v1',
          'acc.digestHint', 'acc.welcome.accounts.v1']);
        ok(/function wipeDevice\(\) \{\s*try \{ DEVICE_KEYS\.forEach/.test(src) && /function signOut\(\) \{\s*wipeDevice\(\);/.test(src), 'signOut clears device keys');
        // التدقيق الشامل ١١ نوفمبر ٢٠٢٦: المفتاحين دول فيهم أرقام الحسابات الإعلانية اللي المستخدم فتحها — نفس أسماء ui.js
        eq([DIGEST_HINT_KEY, WELCOME_KEY], ['acc.digestHint', 'acc.welcome.accounts.v1'], 'same keys as ui.js');
        // من ٣١ أكتوبر (كل حاجة لكل مستخدم): إجابات التشخيص ومبالغ لوحة القيمة وموافقتها على الجهاز بتتمسح كمان — نفس أسماء ui.js
        eq([DX_FB_KEY, VALUE_MONEY_KEY, VALUE_ACK_KEY], ['acc.dx.fb.v1', 'pauseproof.value.money.v2', 'pauseproof.value.ack.v1'], 'same keys as ui.js');
        eq([RENEW_KEY, LAST_ACCOUNT_KEY], ['acc.renew.v1', 'acc.lastAccount.v1'], 'same keys as core.js');
      });
    });
  });

  describe('ملخص المتجر — قسم واحد مع «يحتاج انتباهك الآن»', function () {
    var blk = function (kind, seg) { return { kind: kind, title: kind, lines: [], seg: seg || null }; };
    var al = function (level, adId) { return { level: level, adId: adId || null, title: level + (adId || '') }; };
    test('تنبيه إعلان جوه حملة عليها «يحتاج قرارك» بيتحسب عليها بدل ما يتكرر، والبند بياخد أولويته', function () {
      var ads = [ad('a1', { cid: 'c1' }), ad('a2', { cid: 'c2' })];
      var items = DX.attention([blk('decision', { dim: 'campaign', key: 'c1' })], [al('critical', 'a1'), al('warning', 'a2')], ads);
      eq(items.map(function (x) { return x.type; }), ['block', 'alert']);
      eq([items[0].related.length, items[0].rank, items[1].alert.adId], [1, 2, 'a2']);
    });
    test('الترتيب: الحساب العاجل، عاجل الملخص، عاجل الإعلانات، يحتاج قرارك، مهم، للمتابعة', function () {
      var ads = [ad('a1', { cid: 'c9' })];
      var items = DX.attention([blk('watch', { dim: 'country', key: 'SA' }), blk('decision'), blk('urgent'), blk('why')],
        [al('warning', 'a1'), al('critical', 'a1'), al('critical')], ads);
      eq(items.map(function (x) { return x.type === 'block' ? x.block.kind : x.alert.level + (x.alert.adId ? ':ad' : ':acct'); }),
        ['critical:acct', 'urgent', 'critical:ad', 'decision', 'warning:ad', 'watch']);
    });
    test('في «كل المنصات» الحملة بمنصتها: حملة Google متطابقش إعلان Meta بنفس الرقم', function () {
      var c = ad('m1', { cid: 'c1' });
      eq([DX.segHas({ dim: 'campaign', key: 'google:c1' }, c), DX.segHas({ dim: 'campaign', key: 'meta:c1' }, c)], [false, true]);
    });
    test('من غير ملخص: شريط الإنفاق والنتائج + القائمة جوه نفس القسم', function () {
      candidates = [ad('k1', { daily: steady(10), res: steady(1) })];
      render();
      ok(!document.getElementById('storeSec').hidden, 'section shown');
      eq(document.querySelectorAll('#kpiStrip .kpi').length, 2, 'spend and results only');
      ok(document.querySelector('#topAlerts .top-alerts-title').textContent === t('sec.attn'), 'attention heading');
    });
  });

  // ---------- مزامنة التجربة مع Supabase (supabase/functions/sync) ----------
  describe('مزامنة التجربة (Supabase)', function () {
    var FB_KEY = 'acc.dx.fb.v1';
    // بيئة معزولة: مفتاح Meta وهمي + fetch وهمي بيسجّل الطلبات، وبعدها كل حاجة بترجع زي ما كانت
    var withSync = function (serve, fn) {
      var realFetch = window.fetch, hadFB = 'FB' in window, realFB = window.FB, saved = localStorage.getItem(FB_KEY), calls = [];
      window.FB = { getAuthResponse: function () { return { accessToken: 'tok-test-1234567890' }; } };
      window.fetch = function (url, opts) {
        var body = opts && opts.body ? JSON.parse(opts.body) : null;
        calls.push({ url: String(url), body: body });
        return serve(body);
      };
      syncPulled = {}; syncSeenDone = {};
      localStorage.removeItem(FB_KEY);
      var restore = function () {
        window.fetch = realFetch;
        if (hadFB) window.FB = realFB; else delete window.FB;
        if (saved == null) localStorage.removeItem(FB_KEY); else localStorage.setItem(FB_KEY, saved);
        syncPulled = {}; syncSeenDone = {}; dxReset();
      };
      return Promise.resolve().then(function () { return fn(calls); }).then(function (v) { restore(); return v; }, function (e) { restore(); throw e; });
    };
    var reply = function (obj) { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(obj); } }); };
    var tick2 = function () { return new Promise(function (r) { setTimeout(r, 0); }).then(function () { return new Promise(function (r) { setTimeout(r, 0); }); }); };
    var sim = function () { return DX_SIM.simulate({ seed: 104729 * 2, spend: 2000, changes: [{ from: '2026-09-21', stage: 'pay', factor: 0.55 }] }); };
    var WHY = { fbKey: 'why', kind: 'why', title: 'لماذا؟' };

    test('عرض Meta لوحده بس اللي بيتزامن — Google وSnapchat و«كل المنصات» على الجهاز', function () {
      ok(syncableView('meta:act_123'), 'meta');
      ['google:123', 'snapchat:abc', 'all:meta:act_1,google:123', 'meta:123', 'meta:act_1x', null].forEach(function (k) { ok(!syncableView(k), String(k)); });
    });
    testAsync('التقييم بيتبعت مع مفتاح Meta ونوع البطاقة، وبيتعلّم «اتزامن» لما ينجح', function () {
      return withSync(function () { return reply({ ok: true }); }, function (calls) {
        var r = DX.analyze(sim());
        dxState = { status: 'ready', report: r, accountId: 'meta:act_1', sources: {} };
        dxFbSave(WHY, { verdict: 'no' });
        eq(calls.length, 1);
        var c = calls[0].body;
        eq([calls[0].url, c.action, c.token, c.viewKey, c.entry.block, c.entry.verdict, c.entry.since, c.info.kind, c.info.head],
          [SYNC_URL, 'save', 'tok-test-1234567890', 'meta:act_1', 'why', 'no', r.since, 'why', r.head.type]);
        eq(dxFbFor('meta:act_1')[0].synced, false, 'pending until the server answers');
        return tick2().then(function () { eq(dxFbFor('meta:act_1')[0].synced, true); });
      });
    });
    testAsync('عرض Google: التقييم على الجهاز بس، ومفيش أي طلب', function () {
      return withSync(function () { return reply({ ok: true }); }, function (calls) {
        dxState = { status: 'ready', report: DX.analyze(sim()), accountId: 'google:123', sources: {} };
        dxFbSave(WHY, { verdict: 'yes' });
        return tick2().then(function () {
          eq(calls.length, 0);
          var e = dxFbFor('google:123')[0];
          ok(e && e.verdict === 'yes' && !('synced' in e) && !e.info, 'saved locally only');
        });
      });
    });
    testAsync('الاتصال مقطوع: التقييم محفوظ على الجهاز، وبيتبعت أول مرة الاتصال ينجح', function () {
      var offline = true;
      return withSync(function (body) {
        if (offline) return Promise.reject(new Error('offline'));
        return reply(body.action === 'list' ? { entries: [] } : { ok: true });
      }, function (calls) {
        dxState = { status: 'ready', report: DX.analyze(sim()), accountId: 'meta:act_1', sources: {} };
        dxFbSave(WHY, { verdict: 'yes' });
        return tick2().then(function () {
          eq(dxFbFor('meta:act_1')[0].synced, false);
          offline = false;
          dxSyncPull('meta:act_1');
          return tick2();
        }).then(function () {
          eq(calls.map(function (c) { return c.body.action; }), ['save', 'list', 'save']);
          eq(dxFbFor('meta:act_1')[0].synced, true);
        });
      });
    });
    testAsync('إجابة من جهاز تاني بتدخل التحليل («حسب ملاحظتك…»)، والإجابة الأحدث على الجهاز بتكسب', function () {
      var inp = sim(), r0 = DX.analyze(inp);
      var server = [
        { block: 'why', since: r0.prevSince, until: r0.prevUntil, verdict: 'no', reasons: ['offer'], note: '', at: '2026-09-22T10:00:00.000Z' },
        { block: 'opp', since: r0.since, until: r0.until, verdict: 'no', reasons: [], note: 'قديمة', at: '2026-09-20T10:00:00.000Z' }
      ];
      return withSync(function (body) { return reply(body.action === 'list' ? { entries: server } : { ok: true }); }, function (calls) {
        localStorage.setItem(FB_KEY, JSON.stringify({ 'meta:act_1': [{ block: 'opp', since: r0.since, until: r0.until, verdict: 'yes', reasons: [], note: 'أحدث', at: '2026-09-29T10:00:00.000Z', synced: true }] }));
        dxState = dxFresh();
        dxState.sources.meta = { status: 'ready', key: 'k', account: 'Store', accountId: 'meta:act_1', input: inp, report: r0 };
        dxSyncPull('meta:act_1');
        return tick2().then(function () {
          var list = dxFbFor('meta:act_1');
          eq(list.filter(function (f) { return f.block === 'opp'; })[0].note, 'أحدث', 'newer local answer kept');
          ok(list.some(function (f) { return f.block === 'why' && f.synced === true; }), 'server answer merged');
          ok(dxState.sources.meta.report.owner.inPrev.indexOf('offer') > -1, 're-analyzed with the merged answer');
          eq(calls.length, 1, 'nothing pending to push');
        });
      });
    });
    testAsync('التقييمات القديمة (اتقالها «على هذا الجهاز فقط») عمرها ما بتتبعت للسيرفر', function () {
      return withSync(function (body) { return reply(body.action === 'list' ? { entries: [] } : { ok: true }); }, function (calls) {
        localStorage.setItem(FB_KEY, JSON.stringify({ 'meta:act_1': [{ block: 'why', since: '2026-09-14', until: '2026-09-20', verdict: 'no', reasons: [], note: 'خاص', at: '2026-09-21T00:00:00.000Z' }] }));
        dxSyncPull('meta:act_1');
        return tick2().then(function () { eq(calls.map(function (c) { return c.body.action; }), ['list']); });
      });
    });
    testAsync('فتح حساب Meta بيتسجّل مرة واحدة في الجلسة، ومن غير جلسة Meta مفيش طلب', function () {
      return withSync(function () { return reply({ ok: true }); }, function (calls) {
        syncSeen('act_1'); syncSeen('act_1'); syncSeen('act_2'); syncSeen('123');
        eq(calls.map(function (c) { return c.body.action + ':' + c.body.accountId; }), ['seen:act_1', 'seen:act_2']);
        window.FB = { getAuthResponse: function () { return null; } };
        syncSeen('act_3');
        eq(calls.length, 2, 'no token, no request');
      });
    });
    testAsync('Cloudflare: النبض اليومي بيوصل لدالة المزامنة (عشان المشروع المجاني ميتوقفش)', function () {
      var realFetch = window.fetch, sent = null;
      window.fetch = function (url, opts) { sent = { url: String(url), body: JSON.parse(opts.body) }; return Promise.resolve({ ok: true, status: 200 }); };
      return import('/cloudflare/worker.js').then(function (w) {
        var waits = [];
        w.default.scheduled({}, {}, { waitUntil: function (p) { waits.push(p); } });
        eq(waits.length, 1);
        return waits[0].then(function (res) {
          window.fetch = realFetch;
          eq([sent.url, sent.body.action, res], [w.SUPABASE_SYNC_URL, 'ping', true]);
          ok(/connect-src[^;]*https:\/\/rhrrnxsgodiideqeollo\.supabase\.co/.test(w.SECURITY_HEADERS['Content-Security-Policy']), 'CSP allows the sync function');
        });
      }).then(null, function (e) { window.fetch = realFetch; throw e; });
    });
  });

  // ---------- الملخص التلقائي بالبريد (supabase/functions/sync/digest.ts) ----------
  describe('الملخص التلقائي بالبريد', function () {
    var ok200 = function (obj) { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(obj); } }); };
    var tick2 = function () { return new Promise(function (r) { setTimeout(r, 0); }).then(function () { return new Promise(function (r) { setTimeout(r, 0); }); }); };
    var ON = { email: 'owner@store.com', enabled: true, days: [0, 3], hour: 9, timezone: 'Asia/Kuwait', lang: 'ar' };
    // بيئة معزولة: جلسة Meta وهمية + fetch وهمي + الميزة ظاهرة + عرض حساب Meta جاهز، وبعدها كل حاجة بترجع
    var withDigest = function (serve, fn) {
      var realFetch = window.fetch, hadFB = 'FB' in window, realFB = window.FB, realOn = DIGEST_ON, calls = [];
      window.FB = { getAuthResponse: function () { return { accessToken: 'tok-test-1234567890' }; } };
      window.fetch = function (url, opts) { var body = opts && opts.body ? JSON.parse(opts.body) : null; calls.push(body); return serve(body || {}); };
      var realHint = localStorage.getItem(DIGEST_HINT_KEY);
      localStorage.removeItem(DIGEST_HINT_KEY);
      DIGEST_ON = true; digestUi = digestFresh(); digestRefreshed = {}; digestKnown = {}; digestHas = null;
      dxState = dxFresh(); dxState.status = 'ready'; dxState.accountId = 'meta:act_1';
      // البطاقة بقت في «الإعدادات» لحساب Meta المفتوح (activeSources) أياً كان عرض الملخص
      var realMeta = activeSources.meta, realInfo = accountInfo['meta:act_1'];
      activeSources.meta = 'act_1';
      accountInfo['meta:act_1'] = { timeZone: 'Asia/Kuwait' };
      var restore = function () {
        window.fetch = realFetch;
        if (hadFB) window.FB = realFB; else delete window.FB;
        if (realHint === null) localStorage.removeItem(DIGEST_HINT_KEY); else localStorage.setItem(DIGEST_HINT_KEY, realHint);
        if (realMeta == null) delete activeSources.meta; else activeSources.meta = realMeta;
        if (realInfo === undefined) delete accountInfo['meta:act_1']; else accountInfo['meta:act_1'] = realInfo;
        DIGEST_ON = realOn; digestUi = digestFresh(); digestRefreshed = {}; digestKnown = {}; digestHas = null; dxReset(); showView('summary'); renderDigest();
      };
      return Promise.resolve().then(function () { return fn(calls); }).then(function (v) { restore(); return v; }, function (e) { restore(); throw e; });
    };
    var panel = function () { return document.getElementById('dxAuto'); };
    // فتح صفحة «الإعدادات» = البطاقة بتجيب حالتها من السيرفر
    var openPanel = function () { showView('settings'); return tick2(); };

    // من ٣١ أكتوبر ٢٠٢٦ الملخص لكل مستخدم (قرار صاحب المنتج): ملخص واحد بحساباته (حتى ٥) وبإعداداته، والبطاقة بتعرضه أياً كان الحساب المفتوح
    testAsync('بطاقة الملخص التلقائي في «الإعدادات»: ملخص المستخدم أياً كان عرض الملخص، وبتشرح لو مفيش ملخص ولا Meta، ومخفية لو الميزة مقفولة', function () {
      return withDigest(function () { return ok200({ settings: null, accounts: [] }); }, function (calls) {
        renderDigest();
        ok(!panel().hidden, 'meta account open');
        eq(calls.length, 0, 'nothing asked from the server before Settings opens');
        // قبل كده كانت بتظهر بس في عرض Meta لوحده جوه الملخص
        dxState.accountId = 'all:meta:act_1,google:1'; renderDigest();
        ok(!panel().hidden, 'also while the summary shows all platforms');
        eq(document.getElementById('digestCardNote').textContent, t('set.page.digestFor'), 'one summary for the accounts the user picks');
        delete activeSources.meta;
        return openPanel().then(function () {
          ok(panel().textContent.indexOf(t('set.page.digestNoMeta')) > -1 && !panel().querySelector('#dxAutoEmail'), 'no summary and no Meta account: says how to start');
          activeSources.meta = 'act_1'; DIGEST_ON = false; renderDigest();
          ok(document.getElementById('digestCard').hidden, 'hidden while the feature is off');
          ok(!document.getElementById('dxAutoBtn'), 'the old button in the summary is gone');
        });
      });
    });
    testAsync('فتح الصندوق: بيجيب الحالة من السيرفر، والنموذج بالأحد والأربعاء ٩ صباحاً افتراضياً', function () {
      return withDigest(function () { return ok200({ settings: null, accounts: [] }); }, function (calls) {
        return openPanel().then(function () {
          eq([calls[0].action, calls[0].accountId, 'token' in calls[0]], ['digest.get', 'act_1', false], 'the user\'s summary — no Meta token needed to read it');
          ok(!panel().hidden && panel().querySelector('#dxAutoEmail'), 'form shown');
          eq(Array.prototype.map.call(panel().querySelectorAll('[data-digest-day].on'), function (x) { return x.getAttribute('data-digest-day'); }), ['0', '3']);
          eq(panel().querySelector('#dxAutoHour').value, '9');
          ok(panel().textContent.indexOf('Asia/Kuwait') > -1, 'account time zone shown');
          ok(panel().querySelector('#dxAutoConsent') && !panel().querySelector('#dxAutoConsent').checked, 'consent unticked by default');
        });
      });
    });
    testAsync('التحقق قبل الإرسال: بريد غير صحيح، أو يوم واحد، أو من غير موافقة — مفيش أي طلب', function () {
      return withDigest(function () { return ok200({ settings: null, timezone: 'Asia/Kuwait' }); }, function (calls) {
        return openPanel().then(function () {
          withLang('ar', function () {
            var save = function () { panel().querySelector('[data-digest-save]').click(); return panel().querySelector('.dx-auto-msg.err').textContent; };
            panel().querySelector('#dxAutoEmail').value = 'owner-at-store';
            eq(save(), t('dx.auto.err.email'));
            panel().querySelector('#dxAutoEmail').value = 'owner@store.com';
            panel().querySelector('[data-digest-day="3"]').click();   // يفضل الأحد بس
            eq(save(), t('dx.auto.err.days'));
            panel().querySelector('[data-digest-day="3"]').click();
            eq(save(), t('dx.auto.err.consent'));
            eq(panel().querySelector('#dxAutoEmail').value, 'owner@store.com', 'what the owner typed is kept');
          });
          eq(calls.length, 1, 'only the status request');
        });
      });
    });
    testAsync('التفعيل: بيبعت البريد والأيام والساعة والموافقة الصريحة، ويعرض «مفعّل»', function () {
      return withDigest(function (b) {
        if (b.action === 'digest.get') return ok200({ settings: null, timezone: 'Asia/Kuwait' });
        return ok200({ ok: true, settings: ON, tokenExpiresAt: '2026-11-27T20:42:24Z' });
      }, function (calls) {
        return openPanel().then(function () {
          panel().querySelector('#dxAutoEmail').value = ' owner@store.com ';
          panel().querySelector('[data-digest-day="2"]').click();
          panel().querySelector('#dxAutoHour').value = '8';
          panel().querySelector('#dxAutoConsent').checked = true;
          panel().querySelector('[data-digest-save]').click();
          return tick2();
        }).then(function () {
          var c = calls[1];
          eq([c.action, c.email, c.days, c.hour, c.consent], ['digest.enable', 'owner@store.com', [0, 2, 3], 8, true]);
          withLang('ar', function () {
            ok(panel().textContent.indexOf(t('dx.auto.onLabel')) > -1 && panel().textContent.indexOf('owner@store.com') > -1, 'shows it is on');
            ok(panel().textContent.indexOf(t('dx.auto.saved')) > -1, 'confirmation message');
          });
        });
      });
    });
    testAsync('الإيقاف بعد تأكيد: بيبعت digest.disable، ويرجع للنموذج برسالة «حُذفت الصلاحية»', function () {
      return withDigest(function (b) {
        if (b.action === 'digest.get') return ok200({ settings: ON, tokenExpiresAt: '2026-11-27T20:42:24Z', tokenWorks: true, timezone: 'Asia/Kuwait' });
        return ok200({ ok: true });
      }, function (calls) {
        return openPanel().then(function () {
          panel().querySelector('[data-digest-off]').click();
          withLang('ar', function () { ok(panel().textContent.indexOf(t('dx.auto.offConfirm')) > -1, 'asks first'); });
          eq(calls.length, 1, 'nothing sent before confirming');
          panel().querySelector('[data-digest-off-yes]').click();
          return tick2();
        }).then(function () {
          eq(calls[1].action, 'digest.disable');
          ok(panel().querySelector('#dxAutoEmail'), 'back to the form');
          withLang('ar', function () { ok(panel().textContent.indexOf(t('dx.auto.stopped')) > -1, 'says the access was deleted'); });
        });
      });
    });
    testAsync('صلاحية محفوظة مش شغالة: الصندوق بيقول كده بدل تاريخ الانتهاء', function () {
      return withDigest(function () {
        return ok200({ settings: ON, accounts: [{ platform: 'meta', accountId: 'act_1', name: 'Store', tokenExpiresAt: '2026-11-27T20:42:24Z', tokenProblem: true }],
          current: { accountId: 'act_1', included: true, tokenWorks: false } });
      }, function () {
        return openPanel().then(function () {
          withLang('ar', function () {
            ok(panel().textContent.indexOf(t('dx.auto.problem', { platform: 'Meta' })) > -1, 'problem shown, naming the platform');
            ok(panel().textContent.indexOf(t('dx.auto.acctProblem')) > -1, 'and marked on the account in the list');
          });
        });
      });
    });
    // اتشاف على الموقع ٣١ أكتوبر: «Meta — Meta — اسم الحساب» — اسم الحساب في قائمة الأداة بيبدأ باسم المنصة أصلاً
    testAsync('قائمة حسابات الملخص: اسم المنصة مرة واحدة قبل اسم الحساب', function () {
      var oldMeta = platformOptions.meta;
      platformOptions.meta = [{ value: 'act_7', label: 'Meta — Other store' }];
      return withDigest(function () {
        return ok200({ settings: ON, accounts: [{ platform: 'meta', accountId: 'act_7', name: 'Other store', tokenExpiresAt: '2026-11-27T20:42:24Z' }],
          current: { accountId: 'act_1', included: false, tokenWorks: true } });
      }, function () {
        return openPanel().then(function () {
          eq(panel().querySelector('.dx-auto-acct').textContent, 'Meta — Other store');
        });
      }).then(function () { platformOptions.meta = oldMeta; }, function (e) { platformOptions.meta = oldMeta; throw e; });
    });
    testAsync('ملخص المستخدم بأكتر من حساب: القائمة، وإضافة الحساب المفتوح بمفتاحه، والإزالة بعد تأكيد — وآخر حساب يوقف الملخص', function () {
      var accounts = [{ platform: 'meta', accountId: 'act_7', name: 'Other store', tokenExpiresAt: '2026-11-27T20:42:24Z' }];
      return withDigest(function (b) {
        if (b.action === 'digest.add') accounts = accounts.concat([{ platform: 'meta', accountId: b.accountId, name: 'Store', tokenExpiresAt: '2026-12-01T00:00:00Z' }]);
        if (b.action === 'digest.remove') accounts = accounts.filter(function (a) { return a.accountId !== b.accountId; });
        var stopped = b.action === 'digest.remove' && !accounts.length;
        return ok200({ ok: true, stopped: stopped, settings: stopped ? null : ON, accounts: accounts });
      }, function (calls) {
        return openPanel().then(function () {
          withLang('ar', function () {
            ok(panel().textContent.indexOf('Other store') > -1, 'the accounts in the summary are listed');
            ok(panel().textContent.indexOf(t('dx.auto.accounts', { n: ar(1), max: ar(5) })) > -1, 'with the limit');
          });
          var add = panel().querySelector('[data-digest-add]');
          ok(add, 'the open account is not in it: offered to add');
          add.click();
          return tick2();
        }).then(function () {
          var c = calls[calls.length - 1];
          eq([c.action, c.accountId, c.token], ['digest.add', 'act_1', 'tok-test-1234567890'], 'added with its Meta token (proof of access)');
          ok(!panel().querySelector('[data-digest-add]') && panel().querySelectorAll('.dx-auto-accts li').length === 2, 'now both are listed');
          withLang('ar', function () { ok(panel().textContent.indexOf(t('dx.auto.added')) > -1, 'says so'); });
          panel().querySelector('[data-digest-remove="meta:act_7"]').click();
          eq(calls[calls.length - 1].action, 'digest.add', 'nothing sent before confirming');
          withLang('ar', function () { ok(panel().textContent.indexOf(t('dx.auto.removeQ')) > -1, 'asks first'); });
          panel().querySelector('[data-digest-remove-yes="meta:act_7"]').click();
          return tick2();
        }).then(function () {
          var c = calls[calls.length - 1];
          eq([c.action, c.platform, c.accountId, 'token' in c], ['digest.remove', 'meta', 'act_7', false]);
          eq(panel().querySelectorAll('.dx-auto-accts li').length, 1);
          panel().querySelector('[data-digest-remove="meta:act_1"]').click();
          withLang('ar', function () { ok(panel().textContent.indexOf(t('dx.auto.removeLast')) > -1, 'the last one: says it turns the summary off'); });
          panel().querySelector('[data-digest-remove-yes="meta:act_1"]').click();
          return tick2();
        }).then(function () {
          ok(panel().querySelector('#dxAutoEmail'), 'summary off: back to the form');
        });
      });
    });
    // الحد لكل منصة (٣١ أكتوبر ٢٠٢٦: Meta ٢٠ وSnapchat ١٠ — نفس digest.ts MAX_PER_PLATFORM)
    testAsync('حسابات Meta في الملخص وصلت حدها (٢٠): مفيش زرار إضافة لـ Meta ورسالة الحد باسم المنصة، وحساب Snapchat مفتوح لسه ينفع يتضاف', function () {
      eq(DIGEST_MAX, { meta: 20, snapchat: 10 });
      var full = [];
      for (var i = 1; i <= 20; i++) full.push({ platform: 'meta', accountId: 'act_9' + i, name: 'S' + i });
      return withDigest(function () { return ok200({ settings: ON, accounts: full }); }, function () {
        return withSnap(function () {
          return openPanel().then(function () {
            ok(!panel().querySelector('[data-digest-add="meta"]'), 'no add button for Meta');
            withLang('ar', function () { ok(panel().textContent.indexOf(t('dx.auto.full', { platform: 'Meta', max: ar(20) })) > -1, 'says the Meta limit'); });
            ok(panel().querySelector('[data-digest-add="snapchat"]'), 'Snapchat has its own limit');
            withLang('ar', function () { ok(panel().textContent.indexOf(t('dx.auto.accounts', { n: ar(20) })) > -1, 'the count'); });
          });
        });
      });
    });
    // المرحلة ٢ (٣١ أكتوبر ٢٠٢٦ — «واجعل الملخص لكل المنصات»): حساب Snapchat بنسخته المقفولة اللي على الجهاز (core.js sealedFor)
    var SNAP_ACC = 'cd3b3bfe-4361-484c-9985-51c2d1264860', SNAP_SEALED = 'v2.' + new Array(17).join('A') + '.' + new Array(41).join('B');
    var withSnap = function (fn) {
      var saved = { snap: activeSources.snapchat, opts: platformOptions.snapchat, tz: valueTzOf['snapchat:' + SNAP_ACC], sealed: sealedFor('snapchat') };
      activeSources.snapchat = SNAP_ACC;
      platformOptions.snapchat = [{ value: SNAP_ACC, label: 'Snapchat — Snap store' }];
      valueTzOf['snapchat:' + SNAP_ACC] = 'Asia/Dubai';
      keepSealed('snapchat', SNAP_SEALED);
      var restore = function () {
        if (saved.snap == null) delete activeSources.snapchat; else activeSources.snapchat = saved.snap;
        if (saved.opts === undefined) delete platformOptions.snapchat; else platformOptions.snapchat = saved.opts;
        if (saved.tz === undefined) delete valueTzOf['snapchat:' + SNAP_ACC]; else valueTzOf['snapchat:' + SNAP_ACC] = saved.tz;
        keepSealed('snapchat', saved.sealed);
      };
      return Promise.resolve().then(fn).then(function (v) { restore(); return v; }, function (e) { restore(); throw e; });
    };
    testAsync('ملخص بحساب Snapchat من غير Meta: التفعيل بالنسخة المقفولة واسم الحساب وتوقيته، وتجديدها لما يتفتح، و«فصل» Snapchat', function () {
      var state = { settings: null, accounts: [] };
      return withDigest(function (b) {
        if (b.action === 'digest.enable') state = { settings: ON, accounts: [{ platform: 'snapchat', accountId: SNAP_ACC, name: 'Snap store', tokenExpiresAt: '2026-12-30T00:00:00Z' }] };
        return ok200(Object.assign({ ok: true, enabled: true }, state));
      }, function (calls) {
        return withSnap(function () {
          delete activeSources.meta;   // Snapchat بس (withDigest بيرجّعه)
          return openPanel().then(function () {
            eq([calls[0].action, calls[0].platform, calls[0].accountId], ['digest.get', 'snapchat', SNAP_ACC], 'asks about the open Snapchat account');
            ok(panel().querySelector('#dxAutoEmail'), 'the form: a Snapchat account can start a summary');
            withLang('ar', function () { ok(panel().textContent.indexOf(t('dx.auto.intro', { name: 'Snap store' })) > -1, 'names the Snapchat account'); });
            panel().querySelector('#dxAutoEmail').value = 'a@store.com';
            panel().querySelector('#dxAutoConsent').checked = true;
            panel().querySelector('[data-digest-save]').click();
            return tick2();
          }).then(function () {
            var c = calls[calls.length - 1];
            eq([c.action, c.platform, c.accountId, c.sealed, c.name, c.timezone, 'token' in c], ['digest.enable', 'snapchat', SNAP_ACC, SNAP_SEALED, 'Snap store', 'Asia/Dubai', false],
              'the sealed copy from the device, the account name and its time zone — no Meta token');
            ok(panel().querySelector('.dx-auto-accts') && panel().textContent.indexOf('Snap store') > -1, 'listed in the summary');
            // فتح الحساب بيجدد نسخته على الخادم (مرة في الجلسة)
            var before = calls.length;
            digestAutoRefresh(SNAP_ACC, 'snapchat'); digestAutoRefresh(SNAP_ACC, 'snapchat');
            eq(calls.length - before, 1, 'once per session');
            var r = calls[calls.length - 1];
            eq([r.action, r.platform, r.accountId, r.sealed], ['digest.refresh', 'snapchat', SNAP_ACC, SNAP_SEALED]);
            // «فصل» Snapchat: حساباتها بتخرج من الملخص وصلاحياتها بتتمسح
            var n = calls.length;
            disconnectPlatform('snapchat', true);
            eq(calls.slice(n).filter(function (x) { return x && x.action === 'digest.disconnect'; }), [{ action: 'digest.disconnect', platform: 'snapchat' }]);
          });
        });
      });
    });
    testAsync('الملخص مفعّل بحساب Meta وحساب Snapchat مفتوح مش فيه: زرار إضافته بنسخته المقفولة، ومن غير نسخة مفيش زرار', function () {
      var accounts = [{ platform: 'meta', accountId: 'act_1', name: 'Store', tokenExpiresAt: '2026-11-27T20:42:24Z' }];
      return withDigest(function (b) {
        if (b.action === 'digest.add') accounts = accounts.concat([{ platform: b.platform || 'meta', accountId: b.accountId, name: b.name, tokenExpiresAt: '2026-12-30T00:00:00Z' }]);
        return ok200({ ok: true, settings: ON, accounts: accounts, current: { accountId: 'act_1', included: true, tokenWorks: true } });
      }, function (calls) {
        return withSnap(function () {
          return openPanel().then(function () {
            ok(!panel().querySelector('[data-digest-add="meta"]'), 'the Meta account is already in it');
            var add = panel().querySelector('[data-digest-add="snapchat"]');
            ok(add, 'offered to add the open Snapchat account');
            withLang('ar', function () { eq(add.textContent, t('dx.auto.add', { name: 'Snap store' })); });
            add.click();
            return tick2();
          }).then(function () {
            var c = calls[calls.length - 1];
            eq([c.action, c.platform, c.accountId, c.sealed, 'token' in c], ['digest.add', 'snapchat', SNAP_ACC, SNAP_SEALED, false]);
            ok(!panel().querySelector('[data-digest-add]') && panel().querySelectorAll('.dx-auto-accts li').length === 2, 'both listed, nothing left to add');
            // من غير النسخة المقفولة (اتمسحت أو الربط قديم) مفيش إثبات — مفيش زرار
            accounts = accounts.slice(0, 1);
            keepSealed('snapchat', null);
            digestUi = digestFresh();
            return openPanel();
          }).then(function () {
            ok(!panel().querySelector('[data-digest-add="snapchat"]'), 'no sealed copy on the device = no add button');
          });
        });
      });
    });
    // مراجعة الإعدادات (٢٤ أكتوبر): البريد بيقرا الإعدادات من السيرفر (runner.ts effectiveSettings — من ٢٦ أكتوبر إعدادات صاحب الملخص) —
    // المتصفح مبيبعتهاش خالص، حتى لو عنده نسخة محفوظة (قبل كده «آخر جهاز يفوز»)
    testAsync('تحديث الملخص مبيبعتش المستهدف ولا الحساسية حتى لو الجهاز عنده نسخة (البريد بيقرا إعدادات صاحب الملخص)', function () {
      var prev = alertSettings;
      alertSettings = { roasTarget: 4, roasBreakEven: 2, cprWarnMultiple: 2, minSpendShare: 0.05 };
      return withDigest(function () { return ok200({ ok: true }); }, function (calls) {
        digestAutoRefresh('act_9');
        var c = calls[0] || {};
        alertSettings = prev;
        eq([c.action, 'target' in c, 'be' in c, 'sens' in c], ['digest.refresh', false, false, false]);
      });
    });
    // المراجعة الثانية للمرحلة ٥ (٢٤ أكتوبر): جهاز مفيهوش إعدادات محفوظة كان بيبعت القيم الافتراضية كأنها اختيار العميل — فتح الأداة
    // من متصفح تاني رجّع حد الخسارة في البريد من ×٥ لـ×١ (اتشاف حياً). اللي محفوظ في البريد بيفضل لحد ما العميل يحفظ إعدادات على جهاز
    testAsync('جهاز من غير إعدادات محفوظة مبيمسحش المستهدف وحد الخسارة والحساسية المحفوظين للبريد', function () {
      var prev = alertSettings;
      alertSettings = {};
      return withDigest(function () { return ok200({ ok: true }); }, function (calls) {
        digestAutoRefresh('act_9');
        var c = calls[0] || {};
        alertSettings = prev;
        eq([c.action, 'target' in c, 'be' in c, 'sens' in c], ['digest.refresh', false, false, false]);
      });
    });
    testAsync('فتح حساب Meta بيجدد المفتاح مرة في الجلسة، و«فصل» Meta بيطلب حذف كل مفاتيح صاحب الجلسة', function () {
      return withDigest(function () { return ok200({ ok: true }); }, function (calls) {
        digestAutoRefresh('act_1'); digestAutoRefresh('act_1');
        eq(calls.map(function (c) { return c.action + ':' + c.accountId; }), ['digest.refresh:act_1']);
        DIGEST_ON = false; digestAutoRefresh('act_2'); DIGEST_ON = true;
        eq(calls.length, 1, 'no refresh while the feature is off');
        disconnectPlatform('meta', true);
        var last = calls[calls.length - 1];
        eq([last.action, 'token' in last, 'accountId' in last], ['digest.disconnect', false, false], 'the user\'s Meta accounts leave their summary (no token needed)');
      });
    });
    var hintEl = function () { return document.getElementById('dxAutoHint'); };
    testAsync('تلميح التفعيل: بيظهر بس لما نكون متأكدين إن الملخص مش مفعّل لحساب Meta المفتوح', function () {
      return withDigest(function (b) { return ok200({ ok: true, enabled: b.accountId === 'act_2' }); }, function () {
        renderDigest();
        ok(hintEl().hidden, 'unknown → hidden');
        digestAutoRefresh('act_1');
        return tick2().then(function () {
          ok(!hintEl().hidden && hintEl().querySelector('[data-digest-hint-on]'), 'not enabled → shown');
          withLang('ar', function () { renderDigest(); ok(hintEl().textContent.indexOf(t('dx.auto.hint')) > -1, 'text in the current language'); });
          delete activeSources.meta; renderDigest();
          ok(hintEl().hidden, 'no Meta account open → hidden');
          activeSources.meta = 'act_2'; digestAutoRefresh('act_2');
          return tick2();
        }).then(function () {
          renderDigest();
          ok(hintEl().hidden, 'enabled → hidden');
        });
      });
    });
    testAsync('تلميح التفعيل: «فعّلها الآن» بيفتح «الإعدادات» على نموذج التفعيل والمؤشر في البريد، و«لاحقاً» بيخفيه على الجهاز ده', function () {
      return withDigest(function (b) {
        if (b.action === 'digest.get') return ok200({ settings: null, timezone: 'Asia/Kuwait' });
        return ok200({ ok: true, enabled: false });
      }, function (calls) {
        digestAutoRefresh('act_1');
        return tick2().then(function () {
          hintEl().querySelector('[data-digest-hint-on]').click();
          return tick2();
        }).then(function () {
          eq(currentView, 'settings', 'Settings page');
          ok(!panel().hidden && panel().querySelector('#dxAutoEmail'), 'form open');
          eq(document.activeElement && document.activeElement.id, 'dxAutoEmail', 'ready to type the email');
          eq(calls[calls.length - 1].action, 'digest.get');
          showView('summary'); renderDigest();
          ok(!hintEl().hidden, 'still offered in the summary until answered');
          hintEl().querySelector('[data-digest-hint-later]').click();
          ok(hintEl().hidden, '«later» hides it');
          renderDigest();
          ok(hintEl().hidden, 'stays hidden');
          ok(typeof JSON.parse(localStorage.getItem(DIGEST_HINT_KEY)).act_1 === 'number', 'remembered for this account');
        });
      });
    });
    testAsync('تلميح التفعيل: بيختفي بعد التفعيل، ومبيرجعش على طول بعد الإيقاف', function () {
      return withDigest(function (b) {
        if (b.action === 'digest.get') return ok200({ settings: null, timezone: 'Asia/Kuwait' });
        if (b.action === 'digest.enable') return ok200({ ok: true, settings: ON, accounts: [{ platform: 'meta', accountId: 'act_1' }], tokenExpiresAt: '2026-11-27T20:42:24Z' });
        return ok200({ ok: true, enabled: false });
      }, function () {
        digestAutoRefresh('act_1');
        return tick2().then(function () {
          hintEl().querySelector('[data-digest-hint-on]').click();
          return tick2();
        }).then(function () {
          panel().querySelector('#dxAutoEmail').value = 'owner@store.com';
          panel().querySelector('#dxAutoConsent').checked = true;
          panel().querySelector('[data-digest-save]').click();
          return tick2();
        }).then(function () {
          renderDigest();
          ok(hintEl().hidden, 'enabled → no hint');
          panel().querySelector('[data-digest-off]').click();
          panel().querySelector('[data-digest-off-yes]').click();
          return tick2();
        }).then(function () {
          renderDigest();
          ok(hintEl().hidden, 'just turned off → no hint right away');
        });
      });
    });
    testAsync('صفحة /stop موجودة ومربوطة (الرابط في آخر كل رسالة)', function () {
      return Promise.all([import('/cloudflare/worker.js'), fetch('/stop.html').then(function (r) { return r.text(); })]).then(function (r) {
        eq(r[0].REWRITES['/stop'], '/stop.html');
        var doc = new DOMParser().parseFromString(r[1], 'text/html');
        ok(doc.querySelector('script[src="/js/stop.js"]') && doc.querySelector('#stopBtn'), 'page wired to its script');
        eq(doc.querySelector('meta[name="referrer"]').getAttribute('content'), 'no-referrer', 'the signed link never leaks');
      });
    });
  });

  testAsync('Google — ملخص المتجر (السيرفر): الأرقام اليومية والحملات والدول بشكل محرك التشخيص', function () {
    var realFetch = window.fetch, hadProcess = 'process' in window, prevProcess = window.process;
    window.process = { env: { GOOGLE_CLIENT_ID: 'cid' } };
    var rows = function (results) { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve([{ results: results }]); } }); };
    var campaignQuery = '', queries = [];
    window.fetch = function (url, opts) {
      var u = String(url);
      if (u.indexOf('tokeninfo') > -1) return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ aud: 'cid', scope: 'https://www.googleapis.com/auth/adwords' }); } });
      var q = JSON.parse(opts.body).query, conv = q.indexOf('conversion_action_category') > -1, date = '2026-09-25';
      queries.push(q);
      // «الأقرب للمتجر»: Google بيرجّع الصفوف مقسّمة بنوع الإسناد والمدة لما بنطلبهم
      var store = q.indexOf('conversion_attribution_event_type') > -1;
      var seg = function (extra) { return Object.assign({ date: date }, store ? { conversionAttributionEventType: 'INTERACTION', conversionLagBucket: 'ONE_TO_TWO_DAYS' } : {}, extra || {}); };
      var base = function (extra) { return Object.assign({ segments: seg(extra && extra.segments) }, extra || {}); };
      if (q.indexOf('campaign.id') > -1) {
        campaignQuery = q;
        var cp = { id: '11', name: 'Search', advertisingChannelType: 'SEARCH', biddingStrategyType: 'TARGET_SPEND' };
        return rows(conv
          ? [base({ campaign: cp, segments: seg({ conversionActionCategory: 'PURCHASE' }), metrics: { conversions: 4, allConversions: 4, conversionsValue: 400, allConversionsValue: 400 } })]
          : [base({ campaign: cp, metrics: { costMicros: '80000000', impressions: '900', clicks: '40' } })]);
      }
      if (q.indexOf('user_location_view') > -1) return rows(conv
        ? [base({ userLocationView: { countryCriterionId: '2682' }, segments: seg({ conversionActionCategory: 'PURCHASE' }), metrics: { conversions: 4, allConversions: 4, conversionsValue: 400, allConversionsValue: 400 } })]
        : [base({ userLocationView: { countryCriterionId: '2682' }, metrics: { costMicros: '80000000', impressions: '900', clicks: '40' } })]);
      if (q.indexOf('segments.device') > -1 || q.indexOf('ad_network_type') > -1) return rows([]);
      return rows(conv
        ? [{ segments: seg({ conversionActionCategory: 'PURCHASE' }), metrics: { conversions: 4, allConversions: 5, conversionsValue: 400, allConversionsValue: 500 } },
          { segments: seg({ conversionActionCategory: 'ADD_TO_CART' }), metrics: { conversions: 7, allConversions: 20 } },
          { segments: seg({ conversionActionCategory: 'BEGIN_CHECKOUT' }), metrics: { conversions: 0, allConversions: 9 } }]
        : [{ segments: seg(), metrics: { costMicros: '80000000', impressions: '900', clicks: '40' } }]);
    };
    var out = null, code = null;
    var res = { setHeader: function () {}, status: function (c) { code = c; return this; }, json: function (b) { out = b; return this; }, end: function () {} };
    var restore = function () { window.fetch = realFetch; if (hadProcess) window.process = prevProcess; else delete window.process; };
    var ws = DX.windows('2026-09-21', '2026-09-27');
    return import('/api/google-diagnosis.js').then(function (m) {
      return m.default({ method: 'POST', headers: {}, body: { accessToken: 'tok-dx', customerId: '1234567890',
        daily: { since: ws[ws.length - 1].since, until: '2026-09-27' }, windows: ws.slice(0, 3).map(function (w) { return { since: w.since, until: w.until }; }) } }, res);
    }).then(function () {
      restore();
      eq(code, 200);
      var d = out.daily[0];
      eq([d.date, d.spend, d.imp, d.clicks, d.pur, d.rev, d.atc, d.ic], ['2026-09-25', 80, 900, 40, 4, 400, 20, 9]);
      eq(out.purchases, 'primary', 'purchases from the primary conversions');
      var camp = out.dims.filter(function (x) { return x.id === 'campaign'; })[0].segs[0];
      eq([camp.key, camp.name, camp.w[0].spend, camp.w[0].pur, camp.w[1]], ['11', 'Search', 80, 4, null]);
      // هدف الحملة من طريقة المزايدة: «أقصى عدد نقرات» = زيارات
      ok(campaignQuery.indexOf('campaign.bidding_strategy_type') > -1 && campaignQuery.indexOf('campaign.advertising_channel_type') > -1, 'goal fields requested');
      eq(camp.goal, 'traffic');
      eq(out.dims.filter(function (x) { return x.id === 'country'; })[0].segs[0].key, 'SA', 'criterion 2682 = Saudi Arabia');
      // التحويلات على «الأقرب للمتجر»: الحساب والحملات والشبكة بالفلتر، والجهاز والدولة (Google مبيسمحش) من غيره
      eq(out.numbers, 'store');
      var convQ = queries.filter(function (x) { return x.indexOf('conversion_action_category') > -1; });
      var filtered = function (pred) { return convQ.filter(pred).every(function (x) { return x.indexOf("conversion_attribution_event_type = 'INTERACTION'") > -1; }); };
      // رقم Google نفسه للفترة: طلب واحد للحساب على مدى الفترة من غير فلتر المتجر (نفس تعريف الطلبات — الأساسي)
      var platQ = convQ.filter(function (x) { return x.indexOf('FROM customer') > -1 && x.indexOf("BETWEEN '" + ws[0].since + "' AND '" + ws[0].until + "'") > -1 && x.indexOf('conversion_attribution_event_type') < 0; });
      eq([platQ.length, out.plat], [1, { pur: 4, rev: 400 }], 'the platform number for the period, without the store filter');
      ok(filtered(function (x) { return x.indexOf('FROM customer') > -1 && x.indexOf('segments.device') < 0 && platQ.indexOf(x) < 0; }), 'account and network use the store filter');
      ok(filtered(function (x) { return x.indexOf('campaign.id') > -1; }), 'campaigns use the store filter');
      ok(convQ.filter(function (x) { return x.indexOf('segments.device') > -1 || x.indexOf('user_location_view') > -1; })
        .every(function (x) { return x.indexOf('conversion_attribution_event_type') < 0; }), 'device and country without it');
      return import('/api/google-diagnosis.js');
    }).then(function (m) {
      var g = m.googleGoal;
      eq([g({ advertisingChannelType: 'VIDEO', biddingStrategyType: 'TARGET_CPV' }), g({ advertisingChannelType: 'DISPLAY', biddingStrategyType: 'MANUAL_CPM' }),
        g({ advertisingChannelType: 'MULTI_CHANNEL', biddingStrategyType: 'TARGET_CPA' }), g({ advertisingChannelType: 'VIDEO', biddingStrategyType: 'MAXIMIZE_CONVERSIONS' }),
        g({ advertisingChannelType: 'PERFORMANCE_MAX', biddingStrategyType: 'MAXIMIZE_CONVERSION_VALUE' }), g({ advertisingChannelType: 'SEARCH', biddingStrategyType: 'MANUAL_CPC' }), g(null)],
        ['awareness', 'awareness', 'app', 'sales', 'sales', 'sales', 'sales']);
    }).then(null, function (e) { restore(); throw e; });
  });

  testAsync('Snapchat — ملخص المتجر (السيرفر): المايكرو بيتقسم، والحملات بأسمائها، والدول بالرمز', function () {
    var realFetch = window.fetch;
    var json = function (obj) { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(obj); } }); };
    var st = { spend: 50000000, impressions: 1000, swipes: 30, conversion_purchases: 3, conversion_purchases_value: 300000000, conversion_add_cart: 9, conversion_start_checkout: 5 };
    window.fetch = function (url) {
      var u = String(url);
      if (/\/adaccounts\/[^/?]+$/.test(u)) return json({ adaccounts: [{ adaccount: { timezone: 'Asia/Riyadh', currency: 'SAR' } }] });
      if (/\/campaigns\?/.test(u)) return json({ campaigns: [{ campaign: { id: 'c1', name: 'Story ads', objective: 'BRAND_AWARENESS' } }] });
      if (/granularity=DAY/.test(u)) {
        // زي Snapchat الحقيقي (حساب حقيقي ١١ أكتوبر): الحساب من غير تقسيم بيرفض أي حقل غير spend — والملخص كان بيفشل دايماً
        if (!/breakdown=campaign/.test(u) && /conversion_|swipes|impressions/.test(u)) {
          return Promise.resolve({ ok: false, status: 400, json: function () { return Promise.resolve({ request_status: 'ERROR', debug_message: "Unsupported Stats Query: Only field 'spend' should be used when querying AdAccount stats." }); } });
        }
        // الأيام بتتطلب على دفعات — اليوم بيرجع بس في الدفعة اللي مداها فيه، وموزّع على حملتين بيتجمعوا
        var from = decodeURIComponent((u.match(/start_time=([^&]+)/) || [])[1] || '').slice(0, 10);
        var to = decodeURIComponent((u.match(/end_time=([^&]+)/) || [])[1] || '').slice(0, 10);
        var inRange = '2026-09-25' >= from && '2026-09-25' < to;
        var half = {}; Object.keys(st).forEach(function (k) { half[k] = st[k] / 2; });
        var tsOf = function () { return inRange ? [{ start_time: '2026-09-25T00:00:00.000+03:00', stats: half }] : []; };
        return json({ timeseries_stats: [{ timeseries_stat: { breakdown_stats: { campaign: [{ id: 'c1', timeseries: tsOf() }, { id: 'c2', timeseries: tsOf() }] } } }] });
      }
      if (/breakdown=campaign/.test(u)) return json({ total_stats: [{ total_stat: { breakdown_stats: { campaign: [{ id: 'c1', stats: st }] } } }] });
      if (/report_dimension=country/.test(u)) return json({ total_stats: [{ total_stat: { dimension_stats: [{ country: 'sa', stats: st }] } }] });
      return json({});
    };
    var out = null, code = null;
    var res = { setHeader: function () {}, status: function (c) { code = c; return this; }, json: function (b) { out = b; return this; }, end: function () {} };
    var ws = DX.windows('2026-09-21', '2026-09-27');
    return import('/api/snapchat-ads-fetch.js').then(function (m) {
      return m.default({ method: 'POST', headers: {}, body: { accessToken: 't', action: 'diagnosis', adAccountId: 'acc1',
        daily: { since: ws[ws.length - 1].since, until: '2026-09-27' }, windows: ws.slice(0, 3).map(function (w) { return { since: w.since, until: w.until }; }) } }, res);
    }).then(function () {
      window.fetch = realFetch;
      eq(code, 200);
      var d = out.daily[0];
      eq([d.date, d.spend, d.clicks, d.pur, d.rev, d.atc, d.ic], ['2026-09-25', 50, 30, 3, 300, 9, 5]);
      var camp = out.dims.filter(function (x) { return x.id === 'campaign'; })[0].segs[0];
      eq([camp.key, camp.name, camp.w[0].spend, camp.goal], ['c1', 'Story ads', 50, 'awareness']);
      eq(out.dims.filter(function (x) { return x.id === 'country'; })[0].segs[0].key, 'SA');
      return import('/api/snapchat-ads-fetch.js');
    }).then(function (m) {
      // النظام الجديد (objective_v2) بيغلب القديم، وأي قيمة مش معروفة = مبيعات
      var g = m.snapGoal;
      eq([g({ objective: 'WEB_CONVERSION' }), g({ objective: 'VIDEO_VIEW' }), g({ objective: 'WEB_CONVERSION', objective_v2_properties: { objective_v2_type: 'AWARENESS_AND_ENGAGEMENT' } }),
        g({ objective_v2_properties: { objective_v2_type: 'TRAFFIC' } }), g({ objective: 'SOMETHING_NEW' }), g(null)],
        ['sales', 'awareness', 'awareness', 'traffic', 'sales', 'sales']);
    }).then(null, function (e) { window.fetch = realFetch; throw e; });
  });

  testAsync('ملخص المتجر على بيانات حساب حقيقي (محلي فقط — لو الملف موجود)', function () {
    return new Promise(function (resolve) {
      var x = new XMLHttpRequest();
      x.open('GET', '/tests/private/dx-real.json');
      x.onload = function () { resolve(x.status === 200 ? x.responseText : null); };
      x.onerror = function () { resolve(null); };
      x.send();
    }).then(function (txt) {
      if (!txt) return;   // المستودع عام: البيانات الحقيقية مش مرفوعة، فالاختبار ده بيشتغل على جهاز المطوّر بس
      var fx = JSON.parse(txt), F = ['spend', 'imp', 'clicks', 'atc', 'ic', 'pur', 'rev'];
      var obj = function (a) { if (!a) return null; var o = {}; F.forEach(function (f, i) { o[f] = a[i]; }); return o; };
      var r = DX.analyze({ since: fx.since, until: fx.until, currency: fx.currency, timezone: fx.timezone,
        daily: fx.daily.map(function (d) { var o = obj(d.slice(1)); o.date = d[0]; return o; }),
        dims: fx.dims.map(function (d) { return { id: d.id, segs: d.segs.map(function (s) { return { key: s.k, name: s.n, w: s.w.map(obj) }; }) }; }) });
      // ٣٣ ← ٩٩ طلب: الزيادة حقيقية، لكن فرق تكلفة الطلب في حدود تذبذب الحساب اليومي (اتقاس بمعزل: p ≈ ٠٫٠٥)
      eq(r.head.type, 'moreOrders');
      ok(!r.why, 'no cause claimed for a change within the account swings');
      // الكويت: ٨٧١ ريال وطلب واحد، والخلل عند الإضافة للسلة (٤٫٩٪ مقابل ٢٩٪) — مستمر
      var kw = r.segments.filter(function (g) { return g.key === 'KW'; })[0];
      ok(kw && kw.kind === 'under' && kw.stage.id === 'cart' && kw.persistent, 'Kuwait');
      ok(r.context.inCur.indexOf('saNational') > -1, 'National Day in context');
      // تقسيمات Meta اللي مفيهاش مشتريات (المنطقة) أو فيها جهاز واحد تقريباً اتشالت
      var dim = function (id) { return r.dims.filter(function (d) { return d.id === id; })[0]; };
      eq([dim('region').cover.pur, dim('impDevice').informative], [false, false]);
    });
  });

  testAsync('ملخص المتجر على حساب حقيقي فيه حملة وعي ومنشور مروَّج (محلي فقط — لو الملف موجود)', function () {
    return new Promise(function (resolve) {
      var x = new XMLHttpRequest();
      x.open('GET', '/tests/private/dx-real-kw.json');
      x.onload = function () { resolve(x.status === 200 ? x.responseText : null); };
      x.onerror = function () { resolve(null); };
      x.send();
    }).then(function (txt) {
      if (!txt) return;
      var fx = JSON.parse(txt), F = ['spend', 'imp', 'clicks', 'atc', 'ic', 'pur', 'rev'];
      var obj = function (a) { if (!a) return null; var o = {}; F.forEach(function (f, i) { o[f] = a[i]; }); return o; };
      var r = DX.analyze({ since: fx.since, until: fx.until, currency: fx.currency, timezone: fx.timezone,
        daily: fx.daily.map(function (d) { var o = obj(d.slice(1)); o.date = d[0]; return o; }),
        dims: fx.dims.map(function (d) { return { id: d.id, scope: d.scope, segs: d.segs.map(function (s) { return { key: s.k, name: s.n, goal: s.g, w: s.w.map(obj) }; }) }; }) });
      // قبل التعديل: «إنستغرام» (بسبب حملة الوعي) وحملة الوعي نفسها ومجموعتها في «يحتاج قرارك» — كلهم غلط.
      // دلوقتي: المنشور المروَّج بس (٦٢٩ $ من غير أي طلب ولا إضافة للسلة)، وبسبب «هدف الزيارات»
      eq(r.segments.map(function (g) { return [g.kind, g.dim, g.key, g.goal]; }), [['under', 'campaign', 'c6', 'traffic']]);
      eq(r.segments[0].stage.id, 'cart');
      ok(r.other && Math.abs(r.other.share - 0.179) < 0.01 && r.other.goals.awareness > 0, 'awareness share noted');
      eq(r.head.type, 'scaled');
      withLang('ar', function () { ok(DX.compose(r).blocks.some(function (b) { return b.title === t('dx.other.title'); }), 'note block'); });
    });
  });

  // ---------- الروابط وزرار الرجوع (js/route.js — مراجعة المرحلة ١، ف٣) ----------
  describe('الروابط وزرار الرجوع', function () {
    test('قراءة الرابط: أرقام الحسابات بشكلها الصحيح بس، والقيم الغريبة بتتشال', function () {
      var r = parseRoute('?meta=act_123&google=1234567890&snapchat=0a1b2c3d-0000-4000-8000-1234567890ab&tiktok=7012345678901234567' +
        '&view=alerts&list=campaigns&campaign=c9&adset=a7&ad=120210&period=last30', '2026-10-11');
      eq(r, { accounts: { meta: 'act_123', google: '1234567890', snapchat: '0a1b2c3d-0000-4000-8000-1234567890ab', tiktok: '7012345678901234567' },
        view: 'alerts', list: 'campaigns', campaign: 'c9', adset: 'a7', ad: '120210', period: { preset: 'last30' }, compare: null });
      eq(parseRoute('?meta=123&google=12-34&snapchat=x&tiktok=abc&view=x&list=x&ad=%3Cscript%3E&period=forever', '2026-10-11'),
        { accounts: {}, view: 'summary', list: null, campaign: null, adset: null, ad: null, period: null, compare: null });
      eq(['ads', 'alerts', 'settings', 'summary'].map(function (v) { return parseRoute('?view=' + v, '2026-10-11').view; }), ['ads', 'alerts', 'settings', 'summary'], 'the four pages');
      eq(parseRoute('?campaign=' + new Array(302).join('x'), '2026-10-11').campaign, null, 'very long campaign value');
      // المستوى الأوسط (٣ نوفمبر ٢٠٢٦): list=adsets مقبول، وأي قيمة تانية بتتشال
      eq(['ads', 'adsets', 'campaigns', 'sets'].map(function (v) { return parseRoute('?list=' + v, '2026-10-11').list; }), ['ads', 'adsets', 'campaigns', null], 'the three levels');
      eq(parseRoute('?adset=' + new Array(302).join('x'), '2026-10-11').adset, null, 'very long ad set value');
      // فترة المقارنة (٣ نوفمبر ٢٠٢٦): مخصصة بس في الرابط، بنفس قواعد الفترة المخصصة، و«الفترة السابقة» من غير معامل
      eq(parseRoute('?cmp=custom&csince=2026-10-05&cuntil=2026-10-01', '2026-10-11').compare, { mode: 'custom', since: '2026-10-01', until: '2026-10-05' }, 'swapped');
      eq(parseRoute('?cmp=custom&csince=2026-10-05', '2026-10-11').compare, null, 'missing end');
      eq(routeSearch({ accounts: {}, view: 'summary', list: null, compare: '2026-10-01:2026-10-05', period: 'last7' }, ''), '?period=last7&cmp=custom&csince=2026-10-01&cuntil=2026-10-05');
    });
    test('الفترة المخصصة في الرابط: مترتبة، مش في المستقبل، وأقصاها ٩٣ يوم — زي زرار «تطبيق»', function () {
      eq(parseRoute('?period=custom&since=2026-10-09&until=2026-10-01', '2026-10-11').period, { preset: 'custom', since: '2026-10-01', until: '2026-10-09' }, 'reversed');
      eq(parseRoute('?period=custom&since=2026-10-01&until=2026-12-01', '2026-10-11').period, { preset: 'custom', since: '2026-10-01', until: '2026-10-11' }, 'future end');
      eq(parseRoute('?period=custom&since=2026-01-01&until=2026-10-11', '2026-10-11').period.since, shiftKey('2026-10-11', -92), 'trimmed to 93 days');
      eq(parseRoute('?period=custom&since=2026-10-01', '2026-10-11').period, null, 'missing end');
    });
    test('كتابة الرابط: المعاملات التانية (digest وdx) بتفضل، والقديمة بتتشال', function () {
      var parts = { accounts: { meta: 'act_1' }, view: 'alerts', list: null, campaign: null, ad: '55', period: 'last7', overlay: null };
      eq(routeSearch(parts, '?digest=1&ad=99&campaign=old&list=campaigns&dx=0'), '?digest=1&dx=0&meta=act_1&view=alerts&ad=55&period=last7');
      parts.period = 'custom:2026-10-01:2026-10-07'; parts.ad = null; parts.view = 'summary';
      eq(routeSearch(parts, ''), '?meta=act_1&period=custom&since=2026-10-01&until=2026-10-07', 'the summary is the default page — no view');
      parts.view = 'settings';
      eq(routeSearch(parts, ''), '?meta=act_1&view=settings&period=custom&since=2026-10-01&until=2026-10-07');
    });
    test('زرار الرجوع: فعل المستخدم خطوة، وقفل اللي فتحه رجوع، والتلقائي استبدال', function () {
      var base = { accounts: { meta: 'act_1' }, view: 'ads', list: null, campaign: null, ad: null, period: 'last7', overlay: null };
      var withAd = Object.assign({}, base, { ad: '5' }), hs = { key: 'A', parts: base, from: null };
      eq(routeStep(hs, base, 'A', true), 'none', 'same page');
      eq(routeStep(hs, withAd, 'B', false), 'replace', 'automatic change');
      eq(routeStep(null, base, 'A', true), 'replace', 'first entry');
      eq(routeStep(hs, withAd, 'B', true), 'push', 'user opens an ad');
      eq(routeStep({ key: 'B', parts: withAd, from: 'A' }, base, 'A', true), 'back', 'user closes what they opened');
      eq(routeStep({ key: 'B', parts: withAd, from: null }, base, 'A', true), 'replace', 'closing an ad opened from a link');
      eq(routeStep(hs, Object.assign({}, base, { view: 'alerts' }), 'C', true), 'push', 'tab');
      eq(routeStep({ key: 'A', parts: Object.assign({}, base, { accounts: {} }), from: null }, base, 'D', true), 'replace', 'account loaded');
      eq(routeStep(hs, Object.assign({}, base, { accounts: { meta: 'act_2' } }), 'E', true), 'push', 'account switched');
      eq(routeStep(hs, Object.assign({}, base, { accounts: {} }), 'F', true), 'replace', 'account disconnected');
      // الرجوع لصفحة شبيهة بالضغط (الإعلانات ← التنبيهات ← الإعلانات) خطوة جديدة مش رجوع — غير كده زرار الرجوع بعدها
      // كان بيخرج من الأداة بدل ما يرجّع التنبيهات (مراجعة ١١ أكتوبر). الرجوع بس لما المستخدم يقفل حاجة فتحها
      var alertsView = Object.assign({}, base, { view: 'alerts' });
      eq(routeStep({ key: 'B', parts: alertsView, from: 'A' }, base, 'A', true), 'push', 'back to a peer view by clicking');
      var last30 = Object.assign({}, base, { period: 'last30' });
      eq(routeStep({ key: 'P', parts: last30, from: 'A' }, base, 'A', true), 'push', 'period changed back by hand');
      var withCamp = Object.assign({}, base, { campaign: '9' });
      eq(routeStep({ key: 'C', parts: withCamp, from: 'A' }, base, 'A', true), 'back', 'removing the campaign the user opened');
      var withSettings = Object.assign({}, alertsView, { overlay: 'settingsOverlay' });
      eq(routeStep({ key: 'S', parts: withSettings, from: 'B' }, alertsView, 'B', true), 'back', 'closing the settings window');
    });

    // الأداة الحقيقية في إطار (الروابط شغّالة على /pauseproof-live.html في الإطار زي /app على الموقع)
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function frame(query) {
      var f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:600px;opacity:0;pointer-events:none';
      f.src = '/pauseproof-live.html?t=' + Date.now() + (query || '');
      var loaded = new Promise(function (r) { f.onload = r; });
      document.body.appendChild(f);
      return loaded.then(function () { return sleep(100); }).then(function () { return f; });
    }
    // رجوع أو تقديم في الإطار وبنستنى popstate نفسه — بيتنادى بس بعد خطوة اتضافت في الإطار (غير كده كان هيرجّع صفحة الاختبارات)
    function go(w, dir) {
      return new Promise(function (r) {
        w.addEventListener('popstate', function () { setTimeout(r, 0); }, { once: true });
        w.history[dir]();
      });
    }
    function param(w, k) { return new URLSearchParams(w.location.search).get(k); }

    // ربط Google وSnapchat (عطل ١١–١٢ أكتوبر ٢٠٢٦): اختيار المنصة بيقفل نافذة المنصات، وقفلها كان بيرجّع خطوة في السجل —
    // والرجوع في السجل بيلغي نقل الصفحة لصفحة دخول المنصة (HTML Living Standard: apply the history step → ongoing navigation
    // = "traversal"). Meta مكانتش بتتأثر (نافذة منفصلة). PageExit.go متبدّلة عشان الإطار ميسيبش صفحة الاختبارات
    ['snapchat', 'google'].forEach(function (p) {
      testAsync('ربط ' + PLATFORM_NAMES[p] + ' من نافذة المنصات: الصفحة بتتنقل لصفحة الدخول عند المنصة، والرابط ميلغيش النقل', function () {
        return frame().then(function (f) {
          var w = f.contentWindow, d = f.contentDocument, went = [], hist = [];
          w.PageExit.go = function (url) { went.push(url); };
          // زي المستخدم بالظبط: الضغط على «الإعدادات» في القائمة (خطوة في السجل) وبعدين «حساباتك». مراجعة ١٧ أكتوبر: لما
          // الاختبار كان بيفتح الإعدادات بـ showView من غير ضغط، القفل كان بيعمل replaceState (مبيلغيش النقل) بدل الرجوع خطوة
          // اللي حصل على الموقع — فالاختبار كان بيمسك الخلل بس من غير ما يعيد إنتاجه هو نفسه
          d.getElementById('tabSettings').click();
          return sleep(30).then(function () {
            d.getElementById('loginMenuBtn').click();
            return sleep(30);
          }).then(function () {
            eq(w.history.state && w.history.state.parts && w.history.state.parts.overlay, 'platformOverlay', 'opening the window is a step');
            // بعد فحص Google عند فتح الأداة (probeGoogleCodeFlow) عشان ميرجّعهاش false
            if (p === 'google') w.googleCodeFlow = true;
            ['back', 'go', 'pushState', 'replaceState'].forEach(function (k) {
              var orig = w.history[k];
              w.history[k] = function () { hist.push(k); return orig.apply(w.history, arguments); };
            });
            d.getElementById(p === 'google' ? 'platformGoogle' : 'platformSnapchat').click();
            return sleep(50);
          }).then(function () {
            var host = p === 'google' ? 'https://accounts.google.com/' : 'https://accounts.snapchat.com/';
            eq([went.length, (went[0] || '').indexOf(host)], [1, 0], 'the page leaves for the sign-in page');
            // التجربة (١٧ أكتوبر، Chromium): الرجوع في السجل بيلغي النقل، وreplaceState/pushState لأ — بس الاتنين ممنوعين بعد الخروج
            ok(hist.indexOf('back') === -1 && hist.indexOf('go') === -1, 'no step back after leaving: it cancels the navigation (' + hist.join(',') + ')');
            eq(hist, [], 'no history change at all after leaving');
            f.remove();
          }, function (e) { f.remove(); throw e; });
        });
      });
    });
    // الروابط العادية جوه نافذة المنصات («اطلب الانضمام» و«خطوات الربط»): المتصفح هو اللي بينقل الصفحة، فلو أي كود بعد الضغط
    // قفل النافذة برجوع خطوة كان هيلغي النقل زي عطل Google وSnapchat. مراجعة ١٧ أكتوبر: سليمة بقراءة الكود — والاختبار ده بيحميها
    testAsync('الروابط العادية جوه نافذة المنصات: الضغط عليها مبيرجّعش خطوة في السجل (كان هيلغي النقل)', function () {
      return frame().then(function (f) {
        var w = f.contentWindow, d = f.contentDocument, hist = [];
        d.getElementById('tabSettings').click();
        return sleep(30).then(function () {
          d.getElementById('loginMenuBtn').click();
          return sleep(30);
        }).then(function () {
          var links = Array.prototype.filter.call(d.querySelectorAll('#platformOverlay a[href]'), function (a) {
            return a.target !== '_blank' && a.getAttribute('href').indexOf('mailto:') !== 0;
          });
          ok(links.length >= 2, 'same-tab links in the window (' + links.length + ')');
          ['back', 'go'].forEach(function (k) {
            var orig = w.history[k];
            w.history[k] = function () { hist.push(k); return orig.apply(w.history, arguments); };
          });
          // الإطار ميسيبش صفحة الاختبارات: بنمنع النقل نفسه بس، وكل مستمعات الأداة بتشتغل عادي
          w.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a[href]')) e.preventDefault(); }, true);
          links.forEach(function (a) { a.click(); });
          return sleep(50);
        }).then(function () {
          eq(hist, [], 'no step back after a link click');
          f.remove();
        }, function (e) { f.remove(); throw e; });
      });
    });

    // ---------- أقسام الأداة: قائمة جانبية / شريط ضيق / شريط سفلي (مراجعة المرحلة ١ — ق٢) ----------
    function sized(width, height, query) {
      var f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:0;top:0;width:' + width + 'px;height:' + height + 'px;opacity:0;pointer-events:none';
      f.src = '/pauseproof-live.html?t=' + Date.now() + (query || '');
      var loaded = new Promise(function (r) { f.onload = r; });
      document.body.appendChild(f);
      return loaded.then(function () { return sleep(150); }).then(function () { return f; });
    }
    function keepLang(lang) {
      var prev = localStorage.getItem('acc.lang');
      localStorage.setItem('acc.lang', lang);
      return function () { if (prev == null) localStorage.removeItem('acc.lang'); else localStorage.setItem('acc.lang', prev); };
    }
    function box(el) { var r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; }
    testAsync('الكمبيوتر بالعربي: قائمة جانبية بأسماء على اليمين، والمحتوى جنبها من غير تداخل، والمساعدة في أسفلها', function () {
      var restore = keepLang('ar');
      return sized(1200, 800).then(function (f) {
        var w = f.contentWindow, d = f.contentDocument, nav = box(d.getElementById('appNav')), main = box(d.getElementById('appMain'));
        eq([nav.r, nav.w], [1200, 216], 'sidebar on the right edge, 216px wide');
        ok(main.r <= nav.l + 1, 'content sits beside it, not under it');
        ok(nav.t >= box(d.querySelector('.appbar')).b - 1, 'starts below the top bar');
        var labels = Array.prototype.map.call(d.querySelectorAll('#appNav .nav-label'), function (s) { return s.textContent; });
        eq(labels, [w.t('nav.summary'), w.t('nav.ads'), w.t('nav.alerts'), w.t('nav.settings')], 'four destinations with words');
        ok(d.querySelector('#appNav .app-nav-foot').offsetHeight > 0, 'help and support at the bottom of the menu');
        f.remove();
      }).then(restore, function (e) { restore(); throw e; });
    });
    testAsync('الكمبيوتر بالإنجليزي: القائمة في جهة البداية (الشمال)', function () {
      var restore = keepLang('en');
      return sized(1200, 800, '&lang=en').then(function (f) {
        var nav = box(f.contentDocument.getElementById('appNav'));
        eq([nav.l, nav.w], [0, 216]);
        f.remove();
      }).then(restore, function (e) { restore(); throw e; });
    });
    testAsync('التابلت (٧٠٠): شريط جانبي ضيق بأيقونة واسم تحتها', function () {
      var restore = keepLang('ar');
      return sized(700, 900).then(function (f) {
        var d = f.contentDocument, nav = box(d.getElementById('appNav')), item = d.getElementById('tabAds');
        eq([nav.r, nav.w], [700, 88]);
        ok(box(item.querySelector('.nav-label')).t > box(item.querySelector('.nav-ico')).t, 'label under the icon');
        eq(d.querySelector('#appNav .app-nav-foot').offsetHeight, 0, 'no help links in the narrow rail');
        f.remove();
      }).then(restore, function (e) { restore(); throw e; });
    });
    testAsync('الهاتف: شريط سفلي بأربع وجهات، والشريط العلوي صف واحد، ومفيش حاجة مستخبية تحت الشريط', function () {
      var restore = keepLang('ar');
      return sized(375, 812).then(function (f) {
        var w = f.contentWindow, d = f.contentDocument, nav = box(d.getElementById('appNav'));
        // العرض = الجزء الظاهر (شريط التمرير في المتصفح على الكمبيوتر بياخد ١٥px على الشمال في الصفحة العربية — الهاتف مفيهوش)
        eq([nav.b, nav.w, nav.r, nav.h], [812, d.documentElement.clientWidth, 375, 64], 'fixed at the bottom, full width');
        var items = Array.prototype.map.call(d.querySelectorAll('#appNav .nav-item'), box);
        eq(items.length, 4);
        ok(items.every(function (b) { return b.w >= 80 && b.h >= 48; }), 'four touch targets of at least 48px (Material)');
        // قبل المراجعة الشريط العلوي كان ٢٢٢px (٢٧٪ من الشاشة) بستة أزرار
        ok(box(d.querySelector('.appbar')).h <= 70, 'top bar is one row: ' + box(d.querySelector('.appbar')).h);
        ok(parseFloat(w.getComputedStyle(d.getElementById('appMain')).paddingBottom) >= 64, 'content ends above the bar');
        eq(d.documentElement.scrollWidth - d.documentElement.clientWidth, 0, 'no sideways scroll');
        f.remove();
      }).then(restore, function (e) { restore(); throw e; });
    });
    // ---------- منتقي الفترة (٣ نوفمبر ٢٠٢٦ — زي Google Ads وMeta) ----------
    var keepKeys = function (keys) {
      var saved = {};
      keys.forEach(function (k) { saved[k] = localStorage.getItem(k); });
      return function () { keys.forEach(function (k) { if (saved[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, saved[k]); }); };
    };
    // ملاحظة صاحب المنتج: «بعد تحديد فترة مخصصة وتطبيقها يظل يظهر مربع فترة التاريخ وزر التطبيق كأنها لم تطبق»
    testAsync('المنتقي: فترة مخصصة بتتطبّق واللوحة بتتقفل، والزرار بيقول الأيام والمقارنة', function () {
      var restore = keepKeys(['acc.period.v1', 'acc.compare.v1']);
      return sized(1200, 800, '&view=ads').then(function (f) {
        var w = f.contentWindow, d = f.contentDocument, panel = d.getElementById('periodPanel');
        w.candidates = [ad('pk1', { daily: steady(10), res: steady(1) })];
        w.render();
        var today = w.todayKeyInTz(w.BROWSER_TZ), a = w.shiftKey(today, -12), z = w.shiftKey(today, -3);
        d.getElementById('periodBtn').click();
        ok(!panel.classList.contains('hidden') && d.getElementById('periodBtn').getAttribute('aria-expanded') === 'true', 'opens');
        var from = d.getElementById('dateFrom'), to = d.getElementById('dateTo');
        from.value = a; from.dispatchEvent(new w.Event('input', { bubbles: true }));
        to.value = z; to.dispatchEvent(new w.Event('input', { bubbles: true }));
        eq(panel.querySelector('[aria-checked="true"]').getAttribute('data-preset'), 'custom', 'typing a date = custom');
        d.getElementById('periodApply').click();
        eq([w.period.preset, w.period.since, w.period.until], ['custom', a, z]);
        ok(panel.classList.contains('hidden') && panel.offsetHeight === 0, 'the panel closes — no date boxes left on screen');
        eq(d.getElementById('periodBtnMain').textContent, w.fmtRange(a, z), 'the button says the applied days');
        // الفترة السابقة = نفس الطول قبلها مباشرةً (١٠ أيام)
        var len = w.keyDiffDays(a, z) + 1;
        eq(d.getElementById('periodBtnCmp').textContent, w.t('period.vs', { range: w.fmtRange(w.shiftKey(a, -len), w.shiftKey(a, -1)) }));
        f.remove();
      }).then(restore, function (e) { restore(); throw e; });
    });
    testAsync('المنتقي: الفترة الجاهزة بتملا «من/إلى» بأيامها، و«إلغاء» وEsc والضغط برّه من غير تغيير', function () {
      var restore = keepKeys(['acc.period.v1', 'acc.compare.v1']);
      return sized(1200, 800, '&view=ads&period=last7').then(function (f) {
        var w = f.contentWindow, d = f.contentDocument, panel = d.getElementById('periodPanel');
        w.candidates = [ad('pk2', { daily: steady(10), res: steady(1) })];
        w.render();
        d.getElementById('periodBtn').click();
        panel.querySelector('[data-preset="last30"]').click();
        var r = w.resolvePeriodFor(w.BROWSER_TZ, { preset: 'last30' });
        eq([d.getElementById('dateFrom').value, d.getElementById('dateTo').value], [r.since, r.until], 'the preset fills the dates');
        d.getElementById('periodCancel').click();
        eq([w.period.preset, panel.classList.contains('hidden')], ['last7', true], 'cancel = nothing changed');
        d.getElementById('periodBtn').click();
        panel.querySelector('[data-preset="yesterday"]').click();
        d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        eq([w.period.preset, panel.classList.contains('hidden')], ['last7', true], 'Esc = nothing changed');
        d.getElementById('periodBtn').click();
        panel.querySelector('[data-preset="lastMonth"]').click();
        d.getElementById('periodApply').click();
        eq(w.period, { preset: 'lastMonth' }, 'a preset applies as a preset');
        // الشهر الماضي بيتقارن بالشهر اللي قبله كامل
        var lm = w.resolvePeriodFor(w.BROWSER_TZ), pm = w.shiftKey(lm.since, -1);
        eq(d.getElementById('periodBtnCmp').textContent, w.t('period.vs', { range: w.fmtRange(pm.slice(0, 8) + '01', pm) }), 'the month before');
        f.remove();
      }).then(restore, function (e) { restore(); throw e; });
    });
    testAsync('المنتقي: أي فترة مقارنة حتى لو متداخلة، وتغييرها لوحده بيعيد ملخص المتجر بس', function () {
      var restore = keepKeys(['acc.period.v1', 'acc.compare.v1']);
      return sized(1200, 800, '&view=ads&period=last7').then(function (f) {
        var w = f.contentWindow, d = f.contentDocument, panel = d.getElementById('periodPanel');
        w.candidates = [ad('pk3', { daily: steady(10), res: steady(1) })];
        w.render();
        var calls = { dx: 0, ads: 0 }, prevLoad = w.loadSource;
        w.dxReloaders.meta = function () { calls.dx++; };
        w.activeSources.meta = 'act_1';
        w.loadSource = function () { calls.ads++; };
        var pick = function (m) { var s = d.getElementById('cmpMode'); s.value = m; s.dispatchEvent(new w.Event('change', { bubbles: true })); };
        try {
          var since = w.resolvePeriodFor(w.BROWSER_TZ).since;
          d.getElementById('periodBtn').click();
          pick('custom');
          ok(!d.getElementById('cmpDates').hidden, 'the comparison dates show');
          var cf = d.getElementById('cmpFrom'), ct = d.getElementById('cmpTo');
          ok(cf.value && ct.value, 'starts from the range that was showing');
          // بتتداخل مع الفترة: مقبولة زي Meta
          cf.value = w.shiftKey(since, -3); ct.value = since;
          d.getElementById('periodApply').click();
          ok(panel.classList.contains('hidden'), 'an overlap is fine');
          eq(w.compare, { mode: 'custom', since: w.shiftKey(since, -3), until: since });
          eq([calls.dx, calls.ads], [1, 0], 'only the store summary is fetched again');
          eq(d.getElementById('periodBtnCmp').textContent, w.t('period.vs', { range: w.fmtRange(w.shiftKey(since, -3), since) }));
          var p = w.dxPeriodFor(w.BROWSER_TZ);
          eq(w.DX.windows(p.since, p.until, { unit: p.unit, cmp: p.cmp })[1].until, since);
          // التواريخ ناقصة: رسالة واللوحة مفتوحة
          d.getElementById('periodBtn').click();
          cf.value = '';
          d.getElementById('periodApply').click();
          eq(d.getElementById('periodError').textContent, w.t('period.cmpPickDates'));
          ok(!panel.classList.contains('hidden'), 'stays open');
          // أقدم من ٣٧ شهر: Meta هترفضها، فبنقول قبل ما نوقّع الملخص
          cf.value = '2020-01-01'; ct.value = '2020-01-07';
          d.getElementById('periodApply').click();
          eq(d.getElementById('periodError').textContent, w.t('period.cmpTooOld'));
          d.getElementById('periodCancel').click();
        } finally { w.loadSource = prevLoad; delete w.activeSources.meta; }
        f.remove();
      }).then(restore, function (e) { restore(); throw e; });
    });
    testAsync('المنتقي: خيارات «قارن مع» زي Meta، و«اليوم» قصاد أمس كامل ومعاه كل الخيارات', function () {
      var restore = keepKeys(['acc.period.v1', 'acc.compare.v1']);
      return sized(1200, 800, '&view=ads&period=last7').then(function (f) {
        var w = f.contentWindow, d = f.contentDocument, panel = d.getElementById('periodPanel'), sel = d.getElementById('cmpMode');
        w.candidates = [ad('pk5', { daily: steady(10), res: steady(1) })];
        w.render();
        var pick = function (m) { sel.value = m; sel.dispatchEvent(new w.Event('change', { bubbles: true })); };
        var range = function () { return d.getElementById('cmpRange').textContent; };
        var today = w.todayKeyInTz(w.BROWSER_TZ), yesterday = w.shiftKey(today, -1);
        d.getElementById('periodBtn').click();
        eq([].map.call(sel.options, function (o) { return o.value; }), ['period', 'week', 'month', 'year', 'custom']);
        eq([].map.call(panel.querySelectorAll('[data-preset]'), function (b) { return b.getAttribute('data-preset'); }),
          ['today', 'yesterday', 'todayYesterday', 'last7', 'last14', 'last28', 'last30', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'custom'], 'the presets of Meta');
        panel.querySelector('[data-preset="today"]').click();
        eq([sel.value, range(), [].some.call(sel.options, function (o) { return o.disabled; })], ['period', w.fmtKey(yesterday), false], 'all of yesterday, every option open');
        ok(!d.getElementById('periodCmpToday'), 'the old same-hour note is gone');
        d.getElementById('periodApply').click();
        eq(d.getElementById('periodBtnCmp').textContent, w.t('period.vs', { range: w.fmtKey(yesterday) }));
        // الفترة الجاهزة بتختار وحدتها، والاختيار الصريح بيفضل
        d.getElementById('periodBtn').click();
        panel.querySelector('[data-preset="lastMonth"]').click();
        eq(sel.value, 'month', 'month by month');
        panel.querySelector('[data-preset="thisWeek"]').click();
        eq(sel.value, 'week', 'week by week');
        panel.querySelector('[data-preset="last14"]').click();
        eq(sel.value, 'period');
        pick('year');
        panel.querySelector('[data-preset="last30"]').click();
        eq(sel.value, 'year', 'an explicit choice stays, like Meta');
        var r = w.resolvePeriodFor(w.BROWSER_TZ, { preset: 'last30' });
        var ya = w.shiftMonths(r.since, -12), yb = w.shiftMonths(r.until, -12);
        eq(range(), w.fmtRange(ya, yb) + ' ' + w.ar(yb.slice(0, 4)), 'the year shows, or it reads like the same days');
        d.getElementById('periodApply').click();
        eq(w.compare, { mode: 'year' }, 'saved');
        eq(d.getElementById('periodBtnCmp').textContent, w.t('period.vs', { range: w.fmtRange(ya, yb) + ' ' + w.ar(yb.slice(0, 4)) }));
        ok(d.getElementById('periodBtnMain').textContent.indexOf(w.ar(r.until.slice(0, 4))) > -1, 'on both sides');
        var a = w.routeParts ? w.routeParts() : null;
        if (a) eq(a.compare, 'year');
        eq(w.parseRoute('?cmp=year&period=thisWeek', today).compare, { mode: 'year' }, 'from a link');
        eq(w.parseRoute('?period=thisWeek', today).period, { preset: 'thisWeek' });
        eq(w.parseRoute('?cmp=nonsense', today).compare, null);
        ok(/cmp=month/.test(w.routeSearch({ accounts: {}, compare: 'month' }, '')), 'to a link');
        f.remove();
      }).then(restore, function (e) { restore(); throw e; });
    });
    testAsync('المنتقي: تقويم بشهرين، وضغطتين بيختاروا الفترة، وبعدها المقارنة', function () {
      var restore = keepKeys(['acc.period.v1', 'acc.compare.v1']);
      return sized(1200, 800, '&view=ads&period=last7').then(function (f) {
        var w = f.contentWindow, d = f.contentDocument, panel = d.getElementById('periodPanel'), cal = d.getElementById('calMonths');
        w.candidates = [ad('pk7', { daily: steady(10), res: steady(1) })];
        w.render();
        var today = w.todayKeyInTz(w.BROWSER_TZ), day = function (k) { return cal.querySelector('[data-d="' + k + '"]'); };
        d.getElementById('periodBtn').click();
        var months = cal.querySelectorAll('.cal-month');
        eq(months.length, 2, 'two months side by side');
        var r = w.resolvePeriodFor(w.BROWSER_TZ);
        ok(day(r.since).classList.contains('edge') && day(r.until).classList.contains('edge'), 'the range ends are marked');
        ok(day(w.shiftKey(r.since, 1)).classList.contains('on'), 'the days between too');
        ok(day(w.shiftKey(r.since, -1)).classList.contains('cmp'), 'the comparison in its own colour');
        eq(day(today).disabled, false);
        ok(d.getElementById('calNext').disabled, 'no months after this one');
        var nx = day(w.shiftKey(today, 1));
        ok(!nx || nx.disabled, 'tomorrow is closed');
        // ضغطتين، بأي ترتيب
        var a = w.shiftKey(today, -9), b = w.shiftKey(today, -5);
        day(b).click();
        eq([d.getElementById('dateFrom').value, d.getElementById('dateTo').value], [b, b], 'the first click starts a new range');
        day(a).click();
        eq([d.getElementById('dateFrom').value, d.getElementById('dateTo').value], [a, b], 'the second ends it, whichever comes first');
        eq(panel.querySelector('[aria-checked="true"]').getAttribute('data-preset'), 'custom');
        d.getElementById('calPrev').click();
        ok(!d.getElementById('calNext').disabled, 'going back opens the way forward');
        d.getElementById('calNext').click();
        // فترة جاهزة بتودّي التقويم لأيامها، حتى لو كان التقويم على شهور قديمة
        d.getElementById('calPrev').click(); d.getElementById('calPrev').click(); d.getElementById('calPrev').click();
        ok(!day(today), 'away from this month');
        panel.querySelector('[data-preset="yesterday"]').click();
        ok(day(w.shiftKey(today, -1)) && day(w.shiftKey(today, -1)).classList.contains('edge'), 'the calendar goes to the preset');
        panel.querySelector('[data-preset="custom"]').click();
        d.getElementById('dateFrom').value = a; d.getElementById('dateTo').value = b;
        d.getElementById('dateTo').dispatchEvent(new w.Event('input', { bubbles: true }));
        w.calShow(today);
        w.renderPeriodPanel();
        // المقارنة المخصصة بالتقويم
        var s = d.getElementById('cmpMode');
        s.value = 'custom'; s.dispatchEvent(new w.Event('change', { bubbles: true }));
        var c1 = w.shiftKey(today, -20), c2 = w.shiftKey(today, -14);
        ok(day(c1) && day(c2), 'on the calendar');
        day(c1).click(); day(c2).click();
        eq([d.getElementById('cmpFrom').value, d.getElementById('cmpTo').value], [c1, c2], 'the calendar now fills the comparison');
        eq([d.getElementById('dateFrom').value, d.getElementById('dateTo').value], [a, b], 'the period stays');
        d.getElementById('periodApply').click();
        eq([w.period.since, w.period.until, w.compare.since, w.compare.until], [a, b, c1, c2]);
        f.remove();
      }).then(restore, function (e) { restore(); throw e; });
    });
    testAsync('المقارنة المحفوظة بترجع زي ما هي بعد فتح الأداة، والقيم الغريبة بتتجاهل', function () {
      var restore = keepKeys(['acc.period.v1', 'acc.compare.v1']);
      localStorage.setItem('acc.compare.v1', JSON.stringify({ mode: 'year' }));
      return sized(1200, 800, '&view=ads').then(function (f) {
        eq(f.contentWindow.compare, { mode: 'year' });
        f.remove();
        localStorage.setItem('acc.compare.v1', JSON.stringify({ mode: 'nonsense' }));
        return sized(1200, 800, '&view=ads');
      }).then(function (f) {
        eq(f.contentWindow.compare, { mode: 'prev' });
        f.remove();
      }).then(restore, function (e) { restore(); throw e; });
    });
    // عرض متوسط: اللوحة بتبدأ من زرار الفترة بعد الشريط الجانبي، فشهرين كانوا هيطلعوا برّه الشاشة
    ['ar', 'en'].forEach(function (lang) {
      testAsync('شاشة متوسطة ' + lang + ': لوحة الفترة داخل الشاشة بشهر واحد', function () {
        var restore = keepLang(lang);
        return sized(840, 800, '&view=ads').then(function (f) {
          var w = f.contentWindow, d = f.contentDocument, panel = d.getElementById('periodPanel');
          w.candidates = [ad('pk8', { daily: steady(10), res: steady(1) })];
          w.render();
          d.getElementById('periodBtn').click();
          var pb = box(panel);
          ok(pb.l >= 0 && pb.r <= w.innerWidth, 'inside: ' + JSON.stringify(pb) + ' of ' + w.innerWidth);
          eq([].filter.call(panel.querySelectorAll('.cal-month'), function (m) { return box(m).h > 0; }).length, 1);
          f.remove();
        }).then(restore, function (e) { restore(); throw e; });
      });
      testAsync('شاشة كبيرة ' + lang + ': شهرين جنب بعض داخل الشاشة', function () {
        var restore = keepLang(lang);
        return sized(1010, 800, '&view=ads').then(function (f) {
          var w = f.contentWindow, d = f.contentDocument, panel = d.getElementById('periodPanel');
          w.candidates = [ad('pk9', { daily: steady(10), res: steady(1) })];
          w.render();
          d.getElementById('periodBtn').click();
          var pb = box(panel), ms = [].filter.call(panel.querySelectorAll('.cal-month'), function (m) { return box(m).h > 0; });
          eq(ms.length, 2);
          ok(pb.l >= 0 && pb.r <= w.innerWidth, 'inside: ' + JSON.stringify(pb) + ' of ' + w.innerWidth);
          f.remove();
        }).then(restore, function (e) { restore(); throw e; });
      });
    });
    // القاعدة الثابتة: الهاتف والديسكتوب واللغتين
    ['ar', 'en'].forEach(function (lang) {
      testAsync('الهاتف ' + lang + ': لوحة الفترة داخل الشاشة، وكل زرار فيها هدف لمس ٤٤px', function () {
        var restore = keepLang(lang);
        return sized(375, 812, '&view=ads').then(function (f) {
          var w = f.contentWindow, d = f.contentDocument, panel = d.getElementById('periodPanel');
          w.candidates = [ad('pk4', { daily: steady(10), res: steady(1) })];
          w.render();
          d.getElementById('periodBtn').click();
          var cs = d.getElementById('cmpMode');
          cs.value = 'custom'; cs.dispatchEvent(new w.Event('change', { bubbles: true }));
          // الجزء الظاهر: شريط التمرير في كروم الكمبيوتر بياخد ١٥px على الشمال في الصفحة العربية (الهاتف مفيهوش)
          var pb = box(panel), vw = d.documentElement.clientWidth, rtl = d.documentElement.dir === 'rtl';
          var minL = rtl ? w.innerWidth - vw : 0, maxR = rtl ? w.innerWidth : vw;
          ok(pb.l >= minL && pb.r <= maxR && pb.h > 0, 'inside the screen: ' + JSON.stringify(pb) + ' / ' + minL + '..' + maxR);
          eq([].filter.call(panel.querySelectorAll('.cal-month'), function (m) { return box(m).h > 0; }).length, 1, 'one month on a phone');
          // «تطبيق» ظاهر من غير نزول لآخر اللوحة
          ok(box(d.getElementById('periodApply')).b <= pb.b + 1, 'apply stays in view: ' + box(d.getElementById('periodApply')).b + ' of ' + pb.b);
          var small = [].slice.call(panel.querySelectorAll('[data-preset], #periodApply, #periodCancel, #calPrev, #calNext, #cmpMode')).filter(function (el) { return box(el).h < 44; })
            .map(function (el) { return (el.id || el.getAttribute('data-preset')) + '=' + box(el).h; });
          eq(small, [], 'touch targets');
          ok(box(d.getElementById('periodBtn')).h >= 44, 'the period button itself');
          eq(d.documentElement.scrollWidth - d.documentElement.clientWidth, 0, 'no sideways scroll');
          f.remove();
        }).then(restore, function (e) { restore(); throw e; });
      });
    });
    // قياس على شاشة الهاتف (فحص حقيقي ٣ نوفمبر: الزرار طلع ١٨px — مستحيل تضغطه بإصبعك)
    ['ar', 'en'].forEach(function (lang) {
      testAsync('الهاتف ' + lang + ': زرار المجموعات جوه كارت الحملة هدف لمس ٤٤px وداخل الكارت', function () {
        var restore = keepLang(lang);
        return sized(375, 812, '&view=ads&list=campaigns').then(function (f) {
          var w = f.contentWindow, d = f.contentDocument;
          w.candidates = [withSet('q1', 's1', 'Set A', 10), withSet('q2', 's2', 'Set B', 30)];
          w.render();
          var btn = d.querySelector('[data-campaign-sets]');
          ok(btn, 'the button is on the campaign card');
          var bb = box(btn), cb = box(btn.closest('.campaign-card'));
          ok(bb.h >= 44, 'touch target at least 44px (Apple HIG): ' + bb.h);
          ok(bb.l >= cb.l - 1 && bb.r <= cb.r + 1, 'inside the card: ' + JSON.stringify(bb) + ' in ' + JSON.stringify(cb));
          eq(d.documentElement.scrollWidth - d.documentElement.clientWidth, 0, 'no sideways scroll');
          f.remove();
        }).then(restore, function (e) { restore(); throw e; });
      });
    });
    // التبويبات التلاتة على شاشة الهاتف وباللغتين (القاعدة الثابتة): الصف بيلفّ، ومفيش تمرير جانبي، والتلاتة بيتضغطوا
    ['ar', 'en'].forEach(function (lang) {
      testAsync('الهاتف ' + lang + ': تبويبات الإعلانات والمجموعات والحملات التلاتة داخل الشاشة', function () {
        var restore = keepLang(lang);
        return sized(375, 812, '&view=ads').then(function (f) {
          var w = f.contentWindow, d = f.contentDocument;
          w.candidates = [ad('t1', { daily: steady(10), res: steady(1) })];
          w.render();
          var btns = [].slice.call(d.querySelectorAll('#viewSwitch [data-mode]'));
          eq(btns.map(function (b) { return b.dataset.mode; }), ['ads', 'adsets', 'campaigns'], 'the hierarchy in order');
          btns.forEach(function (b) {
            var r = box(b);
            ok(r.w >= 44 && r.h >= 28 && r.l >= 0 && r.r <= d.documentElement.clientWidth, b.dataset.mode + ': ' + JSON.stringify(r));
          });
          eq(d.documentElement.scrollWidth - d.documentElement.clientWidth, 0, 'no sideways scroll');
          btns[1].click();
          return sleep(30).then(function () {
            eq([w.viewMode, btns[1].getAttribute('aria-pressed')], ['adsets', 'true'], 'the middle tab switches the view');
            f.remove();
          });
        }).then(restore, function (e) { restore(); throw e; });
      });
    });
    // وسم تغيّر الأيام على شاشة الهاتف وباللغتين (القاعدة الثابتة: كل تفصيلة على الموبايل والديسكتوب وباللغتين). ووسم التعديل
    // ووسم التغيّر مبيظهروش مع بعض أبداً: وسم التعديل لأقل من ٣ أيام مكتملة بعده، والتغيّر بيسكت في نفس الأيام دي
    ['ar', 'en'].forEach(function (lang) {
      testAsync('الهاتف ' + lang + ': وسم تغيّر الأيام جوه الكارت من غير تمرير جانبي', function () {
        var restore = keepLang(lang);
        return sized(375, 812, '&view=ads').then(function (f) {
          var w = f.contentWindow, d = f.contentDocument;
          w.candidates = [ad('tm1', { key: 'lead', daily: steady(100), res: [4, 4, 4, 2, 2, 2, 0] }),
            ad('tmp1', { key: 'lead', daily: steady(100), res: steady(4) }),
            ad('tmp2', { key: 'lead', daily: steady(100), res: steady(4) })];
          w.render();
          var card = d.getElementById('card-tm1'), chip = card && card.querySelector('.trend-tag.trend-down');
          ok(chip, 'the tag is on the card');
          var cb = box(card), tb = box(chip);
          ok(tb.l >= cb.l - 1 && tb.r <= cb.r + 1 && tb.h > 0, 'inside the card: ' + JSON.stringify(tb) + ' in ' + JSON.stringify(cb));
          eq(d.documentElement.scrollWidth - d.documentElement.clientWidth, 0, 'no sideways scroll');
          ok(!card.querySelector('.edit-tag'), 'the two tags never show together');
          f.remove();
        }).then(restore, function (e) { restore(); throw e; });
      });
    });
    testAsync('كل قسم صفحة لوحدها: الضغط في القائمة بيعرض صفحته بس، والإعدادات فيها الربط والتنبيهات والمظهر واللغة والخروج', function () {
      return sized(1200, 800).then(function (f) {
        var w = f.contentWindow, d = f.contentDocument;
        w.candidates = [ad('v1', { daily: steady(10), res: steady(1) })];
        w.render();
        var pages = { summary: 'viewSummary', ads: 'viewAds', alerts: 'viewAlerts', settings: 'viewSettings' };
        var shown = function () { return Object.keys(pages).filter(function (k) { return d.getElementById(pages[k]).offsetHeight > 0; }); };
        var seen = {};
        Object.keys(pages).forEach(function (k) {
          d.querySelector('#appNav [data-view="' + k + '"]').click();
          seen[k] = shown();
        });
        eq(seen, { summary: ['summary'], ads: ['ads'], alerts: ['alerts'], settings: ['settings'] });
        var set = d.getElementById('viewSettings');
        ok(['loginMenuBtn', 'themeToggle', 'langToggle', 'logoutBtn'].every(function (id) { return set.contains(d.getElementById(id)); }), 'the controls that left the top bar live in Settings');
        ok(set.querySelector('[data-open-settings]'), 'alert settings reachable from Settings');
        f.remove();
      });
    });
    testAsync('«تحتاج مراجعة» و«عرض الحملة» في الملخص بيفتحوا صفحة الإعلانات', function () {
      return sized(1200, 800).then(function (f) {
        var w = f.contentWindow;
        w.candidates = [ad('g1', { daily: steady(10), res: steady(1), cid: '55', camp: 'Fall' })];
        w.render();
        w.kpiAction('review');
        eq(w.currentView, 'ads', 'review chip');
        w.showView('summary');
        var btn = f.contentDocument.createElement('button');
        btn.setAttribute('data-campaign', w.campaignKey(w.candidates[0]));
        w.openCampaign(btn);
        eq([w.currentView, w.viewMode], ['ads', 'ads'], 'show campaign');
        f.remove();
      });
    });

    testAsync('رابط فيه التبويب والعرض والفترة بيفتح عليهم، من غير ما يغيّر الاختيارات المحفوظة', function () {
      var saved = [localStorage.getItem('acc.period.v1'), localStorage.getItem('acc.view.v1')];
      return frame('&view=alerts&list=campaigns&period=last30&digest=1').then(function (f) {
        var w = f.contentWindow, d = f.contentDocument;
        eq([d.getElementById('viewAlerts').classList.contains('hidden'), d.getElementById('viewAds').classList.contains('hidden')], [false, true], 'alerts tab');
        eq([w.viewMode, w.period.preset, d.getElementById('periodBtnMain').textContent.indexOf(w.t('period.last30')) === 0], ['campaigns', 'last30', true]);
        eq([localStorage.getItem('acc.period.v1'), localStorage.getItem('acc.view.v1')], saved, 'saved choices untouched');
        eq([param(w, 'view'), param(w, 'list'), param(w, 'period'), param(w, 'digest')], ['alerts', 'campaigns', 'last30', '1'], 'the address keeps them (refresh = same page)');
        f.remove();
      });
    });
    testAsync('زرار الرجوع بيقفل تفاصيل الإعلان، وزرار القفل بيرجع خطوة بدل ما يزوّد واحدة', function () {
      return frame().then(function (f) {
        var w = f.contentWindow, d = f.contentDocument, ov = d.getElementById('expandOverlay');
        w.candidates = [ad('r1', { daily: steady(10), res: steady(1) })];
        w.render();
        // عدد خطوات السجل نفسه مشترك مع صفحة الاختبارات (وفيه بقايا تشغيل قبل كده) — فبنتأكد من «الخطوة جت منين» (from)
        var start = w.history.state && w.history.state.key;
        ok(start && w.history.state.from === null, 'the first step is recorded');
        d.querySelector('.candidate-card').click();
        return sleep(30).then(function () {
          eq([ov.classList.contains('hidden'), param(w, 'ad'), w.history.state.from], [false, 'r1', start], 'opening adds a step with ?ad=');
          return go(w, 'back');
        }).then(function () {
          eq([ov.classList.contains('hidden'), param(w, 'ad')], [true, null], 'Back closes it');
          return go(w, 'forward');
        }).then(function () {
          eq(ov.classList.contains('hidden'), false, 'Forward reopens it');
          d.getElementById('expandClose').click();
          return sleep(80);
        }).then(function () {
          // لو القفل كان زوّد خطوة، كانت هتبقى جاية من خطوة الإعلان (from مش null)
          eq([ov.classList.contains('hidden'), w.history.state.key, w.history.state.from], [true, start, null], 'the close button went back to the first step');
          f.remove();
        });
      });
    });
    testAsync('زرار الرجوع بيقفل نافذة الإعدادات، وتبويب التنبيهات خطوة يرجع منها للإعلانات', function () {
      return frame().then(function (f) {
        var w = f.contentWindow, d = f.contentDocument;
        w.candidates = [ad('t1', { daily: steady(10), res: steady(1) })];
        w.render();
        d.getElementById('tabAlerts').click();
        return sleep(30).then(function () {
          eq(param(w, 'view'), 'alerts');
          d.getElementById('openSettingsBtn').click();
          return sleep(30);
        }).then(function () {
          eq(d.getElementById('settingsOverlay').classList.contains('hidden'), false, 'settings open');
          return go(w, 'back');
        }).then(function () {
          eq([d.getElementById('settingsOverlay').classList.contains('hidden'), param(w, 'view')], [true, 'alerts'], 'Back closed the settings only');
          return go(w, 'back');
        }).then(function () {
          eq([d.getElementById('viewSummary').classList.contains('hidden'), param(w, 'view')], [false, null], 'Back again returns to the summary (the first page)');
          f.remove();
        });
      });
    });
    testAsync('الإعلانات ← التنبيهات ← الإعلانات بالضغط: خطوة جديدة، فالرجوع بعدها بيرجّع التنبيهات مش برّه الأداة', function () {
      return frame().then(function (f) {
        var w = f.contentWindow, d = f.contentDocument, alertsKey;
        w.candidates = [ad('p1', { daily: steady(10), res: steady(1) })];
        w.render();
        d.getElementById('tabAds').click();
        return sleep(30).then(function () {
          d.getElementById('tabAlerts').click();
          return sleep(30);
        }).then(function () {
          alertsKey = w.history.state.key;
          d.getElementById('tabAds').click();
          return sleep(80);
        }).then(function () {
          // قبل الإصلاح الضغط على «الإعلانات» كان بيرجع خطوة، فالخطوة الحالية بقت خطوة الإعلانات الأولى (from = خطوة الملخص)
          eq([param(w, 'view'), w.history.state.from], ['ads', alertsKey], 'clicking back to ads is a new step');
          return go(w, 'back');
        }).then(function () {
          eq(param(w, 'view'), 'alerts', 'Back returns to the alerts tab');
          f.remove();
        });
      });
    });
    testAsync('فتح حملة من عرض الحملات خطوة: الرابط فيه رقم الحملة، والرجوع بيرجّع قايمة الحملات', function () {
      return frame('&view=ads&list=campaigns').then(function (f) {
        var w = f.contentWindow, d = f.contentDocument;
        w.candidates = [ad('k1', { daily: steady(10), res: steady(1), cid: '777', camp: 'Spring' })];
        w.render();
        d.querySelector('.campaign-card').click();
        return sleep(30).then(function () {
          eq([w.viewMode, !!w.filters.campaign, param(w, 'campaign'), param(w, 'list'), param(w, 'view')], ['ads', true, '777', null, 'ads']);
          return go(w, 'back');
        }).then(function () {
          eq([w.viewMode, w.filters.campaign, param(w, 'list'), w.currentView], ['campaigns', null, 'campaigns', 'ads']);
          f.remove();
        });
      });
    });
    // مراجعة المرحلة ٤ (١٨ أكتوبر ٢٠٢٦، حساب حقيقي): عرض الحملات كان من الإعلانات الظاهرة بعد إخفاء المتوقفة — ٥ حملات من ١٣
    testAsync('عرض الحملات: الحملة = كل إعلاناتها اللي ليها أرقام بالمتوقفة، وفتحها بيعرض كل إعلاناتها', function () {
      return frame('&view=ads&list=campaigns').then(function (f) {
        var w = f.contentWindow, d = f.contentDocument;
        w.candidates = [ad('live', { daily: steady(10), res: steady(1), cid: 'k', camp: 'Kept' }),
          ad('gone', { daily: steady(20), res: steady(1), cid: 'k', camp: 'Kept', active: false, pausedLevel: 'ad' }),
          ad('off', { daily: steady(30), cid: 'z', camp: 'AllOff', active: false, pausedLevel: 'ad' })];
        w.render();
        eq(w.visibleCandidates().map(function (c) { return c.id; }), ['live'], 'the ads list still hides stopped ads by default');
        var cards = [].slice.call(d.querySelectorAll('.campaign-card'));
        var kept = cards.filter(function (el) { return el.textContent.indexOf('Kept') > -1; })[0];
        eq(cards.length, 2, 'the fully stopped campaign is there too');
        ok(kept && kept.textContent.indexOf(w.money(210, 'SAR')) > -1 && kept.textContent.indexOf(w.money(70, 'SAR')) === -1, kept ? kept.textContent : 'no card');
        ok(!d.querySelector('[data-show-stopped]'), 'no «show stopped ads» button under campaigns');
        kept.click();
        return sleep(30).then(function () {
          eq(w.visibleCandidates().map(function (c) { return c.id; }).sort(), ['gone', 'live'], 'a campaign opens on all its ads');
          f.remove();
        });
      });
    });
    // ---------- المجموعات الإعلانية (٣ نوفمبر ٢٠٢٦): المستوى الأوسط زي المنصات ----------
    var withSet = function (id, sid, sname, spend, o) {
      var c = ad(id, Object.assign({ daily: steady(spend), res: steady(1), cid: 'c7', camp: 'Autumn' }, o || {}));
      c.adsetId = sid; c.adsetName = sname;
      return c;
    };
    var sumSpend = function (list) { return list.reduce(function (n, g) { return n + g.spend; }, 0); };
    testAsync('عرض المجموعات: كارت لكل مجموعة باسم حملتها، ومجموعها = مجموع الحملات، واللي بلا مجموعة تحت حملتها', function () {
      return frame('&view=ads&list=adsets').then(function (f) {
        var w = f.contentWindow, d = f.contentDocument;
        var pmax = ad('pm', { daily: steady(5), res: steady(1), cid: 'c9', camp: 'PMax' });
        // ad() بيحط adsetName لكل إعلان — وPerformance Max مفيهاش مجموعات خالص
        pmax.campaignLevel = true; pmax.adsetId = null; pmax.adsetName = null;
        w.candidates = [withSet('a1', 's1', 'Set A', 10), withSet('a2', 's1', 'Set A', 20), withSet('a3', 's2', 'Set B', 30), pmax];
        w.render();
        var cards = [].slice.call(d.querySelectorAll('.campaign-card'));
        eq(cards.length, 3, 'Set A + Set B + the campaign with no ad sets');
        var byText = function (txt) { return cards.filter(function (el) { return el.textContent.indexOf(txt) > -1; })[0]; };
        var a = byText('Set A');
        ok(a && a.textContent.indexOf(w.money(210, 'SAR')) > -1, a ? a.textContent : 'no Set A card');
        ok(a.textContent.indexOf('Autumn') > -1, 'the parent campaign is on the card');
        var pmCard = byText('PMax');
        ok(pmCard && pmCard.textContent.indexOf(w.t('adset.none')) > -1, pmCard ? pmCard.textContent : 'no PMax card');
        // كل إعلان في مجموعة واحدة بالظبط: مجموع عرض المجموعات = مجموع عرض الحملات (Kimball)
        var ads = w.visibleCandidates(true);
        eq(sumSpend(w.groupAdsets(ads)), sumSpend(w.groupCampaigns(ads)), 'the totals match the campaigns view');
        f.remove();
      });
    });
    // مفتاح المجموعة: الرقم أولاً، وبعده الاسم جوه حملته (TikTok مبيرجّعش رقم المجموعة) — وإلا الحملة نفسها
    testAsync('مجموعتان بنفس الاسم في نفس الحملة: الرقم هو اللي بيفرّق، ومن غير رقم الاسم', function () {
      return frame('&view=ads&list=adsets').then(function (f) {
        var w = f.contentWindow, d = f.contentDocument;
        w.candidates = [withSet('d1', 's1', 'Same', 10), withSet('d2', 's2', 'Same', 20)];
        w.render();
        eq(d.querySelectorAll('.adset-card').length, 2, 'two ids, two cards');
        // من غير رقم (TikTok): الاسم جوه الحملة
        var x = withSet('e1', null, 'Left', 10), y = withSet('e2', null, 'Right', 20);
        w.candidates = [x, y];
        w.render();
        eq(d.querySelectorAll('.adset-card').length, 2, 'no ids: told apart by name');
        y.adsetName = 'Left';
        w.render();
        eq(d.querySelectorAll('.adset-card').length, 1, 'no ids and the same name: one card');
        f.remove();
      });
    });
    testAsync('فتح مجموعة خطوة: إعلاناتها بس، ورقمها في الرابط، والرجوع بيرجّع قايمة المجموعات', function () {
      return frame('&view=ads&list=adsets').then(function (f) {
        var w = f.contentWindow, d = f.contentDocument;
        w.candidates = [withSet('a1', 's1', 'Set A', 10), withSet('a2', 's2', 'Set B', 30)];
        w.render();
        var cards = [].slice.call(d.querySelectorAll('.adset-card'));
        eq(cards.length, 2, 'two ad set cards');
        cards.filter(function (el) { return el.textContent.indexOf('Set A') > -1; })[0].click();
        return sleep(30).then(function () {
          eq([w.viewMode, param(w, 'adset'), param(w, 'list'), param(w, 'view')], ['ads', 's1', null, 'ads']);
          eq(w.visibleCandidates().map(function (c) { return c.id; }), ['a1'], 'only its ads');
          ok(d.getElementById('activeFilters').textContent.indexOf('Set A') > -1, 'a removable chip names the ad set');
          return go(w, 'back');
        }).then(function () {
          eq([w.viewMode, w.filters.adset, param(w, 'list')], ['adsets', null, 'adsets']);
          f.remove();
        });
      });
    });
    testAsync('كارت الحملة: زرار المجموعات بيفتح مجموعاتها بس، ومبيظهرش لحملة فيها مجموعة واحدة', function () {
      return frame('&view=ads&list=campaigns').then(function (f) {
        var w = f.contentWindow, d = f.contentDocument;
        var one = withSet('b1', 's9', 'Only', 10, { cid: 'c8', camp: 'Single' });
        w.candidates = [withSet('a1', 's1', 'Set A', 10), withSet('a3', 's2', 'Set B', 30), one];
        w.render();
        var cards = [].slice.call(d.querySelectorAll('.campaign-card'));
        var byText = function (txt) { return cards.filter(function (el) { return el.textContent.indexOf(txt) > -1; })[0]; };
        ok(!byText('Single').querySelector('[data-campaign-sets]'), 'one ad set: no extra step');
        var btn = byText('Autumn').querySelector('[data-campaign-sets]');
        ok(btn, 'the button is on the campaign with two ad sets');
        btn.click();
        return sleep(30).then(function () {
          eq([w.viewMode, param(w, 'list'), param(w, 'campaign')], ['adsets', 'adsets', 'c7'], 'its ad sets only');
          eq(d.querySelectorAll('.adset-card').length, 2, 'the other campaign is not in the list');
          f.remove();
        });
      });
    });
    // تحت شريحة Snapchat كانت «إعلانات تحتاج إلى مراجعة: ٢» والاتنين في Meta
    // من ٢٥ أكتوبر الاختيار واحد للصفحة كلها (platSel): الشارة بتفلتر الإعلانات بالحالة، والمنصة هي اختيار الصفحة نفسه
    testAsync('«تحتاج مراجعة» في «يحتاج انتباهك الآن» بعدد إعلانات المنصات المختارة، والضغط بيعرض الإعلانات دي بنفس الاختيار', function () {
      return frame('').then(function (f) {
        var w = f.contentWindow, d = f.contentDocument;
        w.candidates = [ad('m1', { daily: steady(10), res: steady(1) }), ad('s1', { daily: steady(10), res: steady(1), platform: 'Snapchat', source: 'snapchat:sn1' })];
        w.runAnalysis();
        w.analysis.byAd.m1.health = 'review';
        var el = d.getElementById('topAlerts'), chip = function () { return el.querySelector('[data-kpi="review"]'); };
        w.eval('platSel = ["snapchat"]'); w.fillTopAlerts(el, null);
        ok(!chip(), 'no review chip under Snapchat: ' + el.textContent.slice(0, 80));
        w.eval('platSel = ["meta"]'); w.fillTopAlerts(el, null);
        ok(chip() && chip().textContent.indexOf(w.ar(1)) > -1, chip() ? chip().textContent : 'no chip');
        chip().click();
        eq([w.filters.health, w.eval('platSel')], ['review', ['meta']], 'the page pick stays — the ads follow it');
        f.remove();
      });
    });
    testAsync('رابط إعلان (من البريد مثلاً) بيفتح تفاصيله أول ما يوصل، وقفلها مبيسيبش خطوة ترجّعها', function () {
      return frame('&ad=d1').then(function (f) {
        var w = f.contentWindow, d = f.contentDocument, ov = d.getElementById('expandOverlay');
        eq(param(w, 'ad'), 'd1', 'still waiting for the ad, the address keeps it');
        w.candidates = [ad('d1', { daily: steady(10), res: steady(1) })];
        w.render();
        eq([ov.classList.contains('hidden'), ov.dataset.adId], [false, 'd1'], 'opened from the link');
        d.getElementById('expandClose').click();
        return sleep(30).then(function () {
          // نفس الخطوة اتعدّلت (from لسه null) — مفيش خطوة فيها الإعلان يرجعلها الرجوع
          eq([ov.classList.contains('hidden'), param(w, 'ad'), w.history.state.from], [true, null, null], 'closed in place');
          f.remove();
        });
      });
    });
    testAsync('رابط إعلان وأرقامه لسه مجاتش: التفاصيل بتستنى الأرقام، والنافذة المفتوحة بتتحدّث لما أرقامها تتغيّر (مراجعة المرحلة ٤)', function () {
      return frame('&ad=d1').then(function (f) {
        var w = f.contentWindow, d = f.contentDocument, ov = d.getElementById('expandOverlay');
        var total = function () { return d.querySelector('#expandChart tbody .col-total').textContent; };
        // كروت Meta من غير أرقام (meta.js بيعرضها قبل الأرقام): قبل الإصلاح التفاصيل كانت بتتفتح هنا على «لم يُنفق شيئاً»
        w.numbersPending.meta = true;
        w.candidates = [ad('d1', {})];
        w.render();
        eq([ov.classList.contains('hidden'), param(w, 'ad')], [true, 'd1'], 'waits for the numbers, the address keeps the ad');
        w.numbersPending.meta = false;
        w.candidates = [ad('d1', { daily: steady(10), res: steady(1) })];
        w.render();
        eq(ov.classList.contains('hidden'), false, 'opens once the numbers are in');
        var before = total(), media = d.getElementById('expandPreview').firstChild;
        // تحديث بنفس الأرقام (نسخة جديدة من الإعلان): النافذة متتلمسش — المعاينة نفسها
        w.candidates = [ad('d1', { daily: steady(10), res: steady(1) })];
        w.render();
        ok(d.getElementById('expandPreview').firstChild === media, 'same numbers: not rebuilt');
        // تحديث بأرقام جديدة (الرجوع للتاب بعد نص ساعة): النافذة بتترسم بيها
        w.candidates = [ad('d1', { daily: steady(20), res: steady(1) })];
        w.render();
        ok(total() !== before && !ov.classList.contains('hidden'), before + ' → ' + total());
        // سجل التعديلات بيوصل بعد الأرقام ويتضاف على نفس الكارت (meta.js loadAdEdits): الحكم اتغيّر فالنافذة بتتحدّث — على
        // الموقع ١٨ أكتوبر النافذة اتفتحت «جيد» وفضلت كده، والكارت وراها «عُدّل مؤخراً — ننتظر نتيجة التعديل»
        w.candidates[0].edits = [{ kind: 'budget', level: 'adset', date: KEYS[5], from: 1000, to: 2000 }];
        w.render();
        var basis = w.adAnalysis(w.candidates[0]).basis;
        var tag = w.adAnalysis(w.candidates[0]).editTag;
        ok(tag && ov.innerText.indexOf(basis) > -1 && ov.innerText.indexOf(tag.what) > -1, basis + ' | ' + ov.innerText.slice(0, 200));
        // والكارت وراها عليه الوسم
        ok(d.querySelector('#card-d1 .edit-tag'), 'tag on the card');
        f.remove();
      });
    });
    // وسم تغيّر آخر الأيام (٣ نوفمبر ٢٠٢٦): على الكارت بتلميحه، وجنب الحكم في التفاصيل، والجملة جوه أساس الحكم
    testAsync('تراجع آخر ٣ أيام: وسم على الكارت وجنب الحكم، والجملة بالأرقام في التفاصيل', function () {
      return frame('&ad=tu1').then(function (f) {
        var w = f.contentWindow, d = f.contentDocument, ov = d.getElementById('expandOverlay');
        // تكلفة العميل المحتمل عند الباقي ٢٥، وعند ده ٢٥ في أول ٣ أيام و٥٠ في آخر ٣ = تراجع ٥٠٪
        w.candidates = [ad('tu1', { key: 'lead', daily: steady(100), res: [4, 4, 4, 2, 2, 2, 0] }),
          ad('tup1', { key: 'lead', daily: steady(100), res: steady(4) }),
          ad('tup2', { key: 'lead', daily: steady(100), res: steady(4) })];
        w.render();
        var tt = w.adAnalysis(w.candidates[0]).trendTag;
        eq(tt && tt.dir, 'down');
        var chip = d.querySelector('#card-tu1 .trend-tag.trend-down');
        ok(chip && chip.title === tt.note, chip ? chip.title : 'no chip on the card');
        ok(d.querySelector('#expandHealth .trend-tag.trend-down'), 'tag next to the verdict');
        ok(!ov.classList.contains('hidden') && ov.innerText.indexOf(tt.note) > -1, ov.innerText.slice(0, 300));
        f.remove();
      });
    });
    testAsync('رابط حملة بيفتح إعلاناتها أول ما توصل', function () {
      return frame('&campaign=888').then(function (f) {
        var w = f.contentWindow, d = f.contentDocument;
        w.candidates = [ad('m1', { daily: steady(10), res: steady(1), cid: '888', camp: 'Autumn' }), ad('m2', { daily: steady(10), res: steady(1), cid: '999', camp: 'Other' })];
        w.render();
        eq([w.viewMode, d.querySelectorAll('.candidate-card').length, param(w, 'campaign')], ['ads', 1, '888']);
        eq([w.currentView, d.getElementById('viewAds').classList.contains('hidden'), param(w, 'view')], ['ads', false, 'ads'], 'opens on the ads page');
        ok(d.getElementById('activeFilters').textContent.indexOf('Autumn') !== -1, 'the campaign chip names it');
        f.remove();
      });
    });
    testAsync('رابط لإعلان أو حملة أو حساب مش موجودين: رسالة واضحة، والجزء ده بيتشال من الرابط', function () {
      return frame('&ad=nope').then(function (f) {
        var w = f.contentWindow, d = f.contentDocument;
        w.candidates = [ad('x1', { daily: steady(10), res: steady(1) })];
        w.render();
        eq([d.getElementById('connectStatus').textContent, param(w, 'ad')], [w.t('route.noAd'), null], 'ad');
        f.remove();
        return frame('&campaign=nope');
      }).then(function (f) {
        var w = f.contentWindow, d = f.contentDocument;
        w.candidates = [ad('x2', { daily: steady(10), res: steady(1) })];
        w.render();
        eq([d.getElementById('connectStatus').textContent, param(w, 'campaign')], [w.t('route.noCampaign'), null], 'campaign');
        f.remove();
        return frame('&meta=act_999');
      }).then(function (f) {
        var w = f.contentWindow, d = f.contentDocument;
        eq(param(w, 'meta'), 'act_999', 'waiting for the account list');
        // زي تحديث الصفحة على الموقع: القايمة المحفوظة رجعت وحساب تاني مفتوح، والتحميل لسه مبدأش — لسه منحكمش
        // (قبل كده الحكم كان بيتكتب هنا، ورسالة التحميل اللي بعده بتغطيه في نفس اللحظة — اتجرّب على الموقع ١١ أكتوبر)
        w.setPlatformOptions('meta', [{ value: 'act_1', label: 'Meta — A' }]);
        w.activeSources.meta = 'act_1';
        w.render();
        eq(param(w, 'meta'), 'act_999', 'no verdict before the platform loads on this page');
        w.loadingPlatforms.meta = true;
        w.setStatus('loading');
        w.render();
        eq(param(w, 'meta'), 'act_999', 'no verdict while it loads');
        // التحميل خلص برسالته: رسالة الرابط بتيجي بعدها فبتفضل ظاهرة
        w.candidates = [ad('a1', { daily: steady(10), res: steady(1) })];
        w.loadingPlatforms.meta = false;
        w.setStatus('loaded');
        w.render();
        eq([d.getElementById('connectStatus').textContent, param(w, 'meta')], [w.t('route.noAccount', { platform: 'Meta' }), 'act_1'], 'account');
        f.remove();
      });
    });
  });

  // ---------- البنية التقنية (المرحلة ٢ من المراجعة، ١٢ أكتوبر ٢٠٢٦) ----------
  describe('البنية التقنية', function () {
    // كل ملف بتحمّله صفحة الاختبارات (من غير ملفات الاختبارات نفسها)
    function appSources() {
      return Promise.all(window.__testScripts.filter(function (s) { return s.indexOf('/tests/') !== 0; }).map(function (s) {
        return fetch(s).then(function (r) { return r.text(); }).then(function (text) { return { file: s, text: text }; });
      }));
    }
    // مفاتيح التخزين المكتوبة في الكود: localStorage.getItem('…') وثوابت *_KEY / KEY / STORE و*_KEYS = [...]
    // مفتاح التخزين عندنا دايماً فيه نقطة (acc.lang) — ده بيستبعد ثوابت تانية اسمها KEY (المفتاح العام، أسماء الروابط)
    function storageKeys(text) {
      var keys = {};
      var add = function (k) { if (/^[a-z][\w-]*\.[\w.-]+$/i.test(k)) keys[k] = 1; };
      text.replace(/(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*'([^']+)'/g, function (_, k) { add(k); });
      text.replace(/\b(?:[A-Z_]*_KEY|KEY|STORE)\s*=\s*'([^']+)'/g, function (_, k) { add(k); });
      text.replace(/\b[A-Z_]*_KEYS\s*=\s*\[([^\]]*)\]/g, function (_, list) { list.replace(/'([^']+)'/g, function (__, k) { add(k); }); });
      return Object.keys(keys);
    }
    testAsync('الاختبارات مبتغيّرش تخزين المتصفح: المشغّل بيحفظ ويرجّع كل مفتاح بتستخدمه الأداة', function () {
      return appSources().then(function (files) {
        var all = {};
        files.forEach(function (f) { storageKeys(f.text).forEach(function (k) { all[k] = f.file; }); });
        ok(Object.keys(all).length >= 15, 'found the keys (' + Object.keys(all).length + ')');
        eq(Object.keys(all).filter(function (k) { return !window.__storageCovered(k); }).sort(), [], 'keys the runner does not restore');
      });
    });
    // عطل ١١–١٢ أكتوبر: الروابط (route.js) كانت بترجع خطوة في السجل بعد ما الصفحة بدأت تتنقل لـ Google/Snapchat فتلغي النقل.
    // أي نقل للصفحة لازم يعدّي على PageExit.leave — اللي بيوقف الروابط الأول. الاختبار ده بيمنع نقل مباشر جديد في أي ملف
    testAsync('أي نقل للصفحة بيعدّي على PageExit.leave (route.js) — مفيش location.href/replace/assign مباشر في كود الأداة', function () {
      // المسموح: PageExit.go في route.js (اللي PageExit.leave بينادي عليه)، وبديل auth.js للصفحات اللي مفيهاش route.js
      var allowed = { '/js/route.js': 1, '/js/auth.js': 1 };
      return appSources().then(function (files) {
        var found = [];
        files.forEach(function (f) {
          var hits = f.text.split('\n').filter(function (line) {
            // التعليق بس (// مش جاية بعد «:» زي https://) — غير كده سطر فيه رابط كان بيتقص ويخبّي اللي بعده
            var code = line.replace(/(^|[^:])\/\/.*$/, '$1');
            return /\blocation\.(href\s*=[^=]|replace\s*\(|assign\s*\()/.test(code);
          });
          if (hits.length && !allowed[f.file]) found.push(f.file + ': ' + hits[0].trim().slice(0, 80));
          if (allowed[f.file]) eq(hits.length, 1, f.file + ' has only its one allowed navigation');
        });
        eq(found, [], 'direct navigation outside PageExit.leave');
      });
    });
    // «خروج» وانتهاء جلسة الدخول بينقلوا لصفحة الدخول بعد رد من الشبكة — بيعدّوا على PageExit.leave (replace: من غير خطوة
    // في السجل) احتياطاً: الرجوع خطوة بعد بداية النقل بيلغيه (تجربة ١٧ أكتوبر). الخروج مينفعش يتجرّب على الموقع من غير ما يخرّج صاحب الحساب
    testAsync('«خروج» وانتهاء الجلسة بينقلوا لصفحة الدخول عن طريق PageExit.leave، والرجوع بعد الدخول لنفس المكان', function () {
      var went = [], realGo = PageExit.go;
      var restore = function () { PageExit.go = realGo; PageExit.reset(); };
      PageExit.go = function (url, replace) { went.push([url, !!replace]); };
      AuthLogin.signOut();
      return new Promise(function (r) { setTimeout(r, 50); }).then(function () {
        AuthLogin.toLogin();
        restore();
        eq(went[0], ['/login', true], 'sign-out');
        ok(went[1] && went[1][0].indexOf('/login?next=') === 0 && went[1][1] === true, 'expired session: ' + JSON.stringify(went[1]));
      }, function (e) { restore(); throw e; });
    });
    // التدقيق الشامل ١١ نوفمبر ٢٠٢٦: الخادم كان لسه بيقبل إعداداً اتشال من المحرك (cprCriticalMultiple)، ومفيش حاجة بتقارن الاتنين —
    // حدود الخادم (settings.ts SCALAR) لازم تبقى هي هي مفاتيح وحدود المحرك (alerts.js SETTINGS_META — النسب بالكسر ٠–١ عند الخادم)
    testAsync('حدود إعدادات التنبيهات عند الخادم هي هي مفاتيح وحدود المحرك', function () {
      return fetch('/__repo/supabase/functions/sync/settings.ts').then(function (r) {
        if (!r.ok) throw new Error('settings.ts is not served (' + r.status + ') — run the tests with Live/tests/serve.ps1');
        return r.text();
      }).then(function (src) {
        var body = (/const SCALAR: Record<string, \[number, number\]> = \{([\s\S]*?)\};/.exec(src) || [])[1] || '', server = {}, engine = {};
        body.replace(/(\w+): \[([\d.]+), ([\d.]+)\]/g, function (_m, k, a, b) { server[k] = [Number(a), Number(b)]; return ''; });
        PauseProofAlerts.SETTINGS_META.forEach(function (m) { var f = m.kind === 'ratio' ? 0.01 : 1; engine[m.key] = [m.min * f, m.max * f]; });
        eq(Object.keys(server).sort(), Object.keys(engine).sort(), 'the same settings on both sides');
        Object.keys(engine).forEach(function (k) {
          ok(Math.abs(server[k][0] - engine[k][0]) < 1e-9 && Math.abs(server[k][1] - engine[k][1]) < 1e-9, k + ': server ' + JSON.stringify(server[k]) + ', engine ' + JSON.stringify(engine[k]));
        });
      });
    });
    // التدقيق الشامل ١١ نوفمبر ٢٠٢٦: سطر «حُلّت/مستمرة» في الملخص بياخد عنوانه من رمز التنبيه (runner.ts KIND_TITLE)، والرمز اللي ملوش عنوان
    // بيتكتب «توقف الإعلان». كل رمز ممكن يطلع «عاجل» من المحرك لازم يكون له عنوان، وكل عنوان نصه موجود في اللغتين
    testAsync('عناوين تنبيهات الملخص: كل رمز ممكن يطلع «عاجل» له عنوان عند المُشغّل، وكل عنوان نصه موجود في اللغتين', function () {
      return fetch('/__repo/supabase/functions/sync/runner.ts').then(function (r) {
        if (!r.ok) throw new Error('runner.ts is not served (' + r.status + ') — run the tests with Live/tests/serve.ps1');
        return r.text();
      }).then(function (src) {
        var body = (/const KIND_TITLE: Record<string, string> = \{([\s\S]*?)\};/.exec(src) || [])[1] || '', titles = {};
        body.replace(/'?([\w-]+)'?: '([\w.]+)'/g, function (_m, k, v) { titles[k] = v; return ''; });
        ['stopped', 'waste-week', 'waste', 'loss', 'cost-max', 'acct-status', 'spend-cap', 'acct-stopped', 'acct-zero', 'spend-cap-near', 'top-stopped',
          'tracking-off', 'lpv-drop', 'checkout-off', 'link-broken'].forEach(function (code) { ok(titles[code], 'no title for the code ' + code); });
        var missing = [];
        Object.keys(titles).forEach(function (k) {
          ['ar', 'en'].forEach(function (l) {
            withLang(l, function () { if (t(titles[k], { label: 'x', one1: 'y' }) === titles[k]) missing.push(titles[k] + ' (' + l + ')'); });
          });
        });
        eq(missing, [], 'every title has its text');
      });
    });
    // المُشغّل في Supabase (runner.ts) بيحمّل ملفات المحرك بس من الأداة (ENGINE_FILES — snapchat.js اتضاف ٣١ أكتوبر للملخص لكل المنصات)
    // وبيستخدم أسماءها العامة (g.اسم). تغيير اسم دالة في core.js مثلاً كان بيكسر البريد من غير ما أي اختبار هنا يفشل (المرحلة ٢، ب٣)
    testAsync('عقد المُشغّل: ملفات المحرك اللي بيحمّلها runner.ts لوحدها فيها كل اسم بيستخدمه', function () {
      return fetch('/__repo/supabase/functions/sync/runner.ts').then(function (r) {
        if (!r.ok) throw new Error('runner.ts is not served (' + r.status + ') — run the tests with Live/tests/serve.ps1');
        return r.text();
      }).then(function (src) {
        var files = JSON.parse(/const ENGINE_FILES = (\[[^\]]*\])/.exec(src)[1].replace(/'/g, '"'));
        // الأسماء دي المُشغّل نفسه بيعرّفها (بدائل المتصفح) — مش من الأداة
        var own = ['window', 'document', 'localStorage', 'sessionStorage', 'location', 'history', 'FB'];
        var names = {};
        src.replace(/\bg\.([A-Za-z_$][\w$]*)/g, function (_, n) { if (own.indexOf(n) < 0) names[n] = 1; });
        ok(Object.keys(names).length >= 20, 'found the names (' + Object.keys(names).length + ')');
        // إطار فاضي من غير صفحة الأداة، وملفات المحرك بس بنفس الترتيب — زي المُشغّل بالظبط
        var f = document.createElement('iframe');
        f.style.display = 'none';
        document.body.appendChild(f);
        var w = f.contentWindow, d = w.document;
        var stub = d.createElement('script'); stub.id = 'facebook-jssdk'; stub.type = 'text/plain'; d.head.appendChild(stub);
        w.FB = { api: function () {}, init: function () {}, login: function () {} };
        var load = function (file) {
          return new Promise(function (resolve, reject) {
            var s = d.createElement('script');
            s.src = location.origin + '/js/' + file + '?t=' + Date.now();
            s.onload = resolve;
            s.onerror = function () { reject(new Error('failed to load ' + file)); };
            d.head.appendChild(s);
          });
        };
        return files.reduce(function (p, file) { return p.then(function () { return load(file); }); }, Promise.resolve()).then(function () {
          var missing = Object.keys(names).filter(function (n) { return typeof w[n] === 'undefined'; });
          f.remove();
          eq(files, ['i18n.js', 'alerts.js', 'core.js', 'diagnosis.js', 'meta.js', 'snapchat.js'], 'engine files');
          eq(missing, [], 'names runner.ts uses that the engine files do not define');
        }, function (e) { f.remove(); throw e; });
      });
    });
  });

  // ---------- تقييم الإعلان على الفترة المختارة (طلب صاحب المنتج ٣ نوفمبر ٢٠٢٦، النقطة ٢: «حتى تقييم كل اعلان لا يكون ثابتاً
  // على اخر 7 ايام فقط بل يكون بناءً على فترة البيانات») ----------
  describe('تقييم الإعلان على الفترة المختارة', function () {
    var W8 = last7Days(TODAY).map(function (d) { return d.key; });
    var Y = shiftKey(TODAY, -1);
    var z8 = function () { return [0, 0, 0, 0, 0, 0, 0, 0]; };
    // إعلان بنافذة الأداة الحقيقية: ٧ أيام مكتملة + النهارده (آخر خانة مبتدخلش الإجماليات)
    var w8 = function (id, o) {
      var daily = o.daily, res = o.res || z8(), sales = o.sales || z8();
      var c = ad(id, { daily: daily.slice(0, 7), res: res.slice(0, 7), sales: sales.slice(0, 7), key: o.key || 'lead', cid: o.cid || 'c1' });
      c.daily = daily; c.dailyResults = res; c.dailySales = sales; c.dailyDates = W8;
      if (o.edits) c.edits = o.edits;
      return c;
    };
    // أيام الفترة (pd) زي ملفات المنصات، ومجموع الفترة = مجموع الأيام
    var withPd = function (c, since, until, day) {
      var pd = { dates: [], spend: [], results: [], sales: [] };
      for (var k = since, i = 0; k <= until; k = shiftKey(k, 1), i++) {
        var v = day(i, k);
        pd.dates.push(k); pd.spend.push(v[0]); pd.results.push(v[1]); pd.sales.push(v[2] || 0);
      }
      c.pd = pd;
      c.period = buildPeriod(sumArr(pd.spend), sumArr(pd.results), sumArr(pd.sales));
      return c;
    };
    var flat = function (sp, r) { return function () { return [sp, r, 0]; }; };
    var week = function (r) { return [r, r, r, r, r, r, r, 1]; };

    test('نافذة الفترة للمحرّك: النهارده الحقيقي بعد فترة بتخلص أمس، وخانة فاضية بعد فترة خلصت قبل كده (من غير تعديلات)، وطول واحد للكل', function () {
      var c = w8('v', { daily: [1, 1, 1, 1, 1, 1, 1, 9], res: [0, 0, 0, 0, 0, 0, 0, 2], sales: [0, 0, 0, 0, 0, 0, 0, 50],
        edits: [{ date: Y, level: 'ad', kind: 'budget', from: 20000, to: 10000 }] });
      withPd(c, shiftKey(TODAY, -14), Y, flat(10, 1));
      var v = periodViewOf(c, 15);
      eq([v.dailyDates.length, v.dailyDates[14], v.daily[14], v.dailyResults[14], v.dailySales[14]], [15, TODAY, 9, 2, 50], 'today after the period');
      eq([v.dailyDates[0], v.daily[0], v.spend, v.results], [shiftKey(TODAY, -14), 10, 140, 14], 'the period days and totals');
      eq(v.edits.length, 1, 'edits kept: «days since the edit» counts from the real today');
      ok(c.daily.length === 8 && c.dailyDates === W8 && c.spend === 7, 'the ad itself is untouched');
      // «الشهر الماضي» مثلاً: خانة فاضية بعده، والتعديلات بتتشال — «عُدّل من كام يوم» بيتحسب من آخر خانة
      var since = shiftKey(TODAY, -40), until = shiftKey(TODAY, -20);
      withPd(c, since, until, flat(5, 1));
      v = periodViewOf(c, 22);
      eq([v.dailyDates.length, v.dailyDates[21], v.daily[21], v.daily[20], v.edits.length], [22, shiftKey(until, 1), 0, 5, 0]);
      // «أمس» بس: بيتكمّل لـ٨ خانات بأيام صفر قبله، والنهارده بعده
      withPd(c, Y, Y, flat(7, 1));
      v = periodViewOf(c, 2);
      eq([v.dailyDates.length, v.daily.join(), v.dailyDates[6], v.dailyDates[7]], [8, '0,0,0,0,0,0,7,9', Y, TODAY]);
      // حساب تاني فترته أطول بيوم (توقيت مختلف): كل النوافذ بطول واحد، والآخر في مكانه
      v = periodViewOf(c, 10);
      eq([v.dailyDates.length, v.daily[8], v.daily[9]], [10, 7, 9]);
    });

    test('المحرّك في حكم الفترة: قواعد «الآن» بتسكت لو الفترة مبتخلصش أمس (recent: false)، ونصوصه بعبارة الفترة', function () {
      var s = { roasTarget: 3, roasBreakEven: 1 };
      var stop = baseAccount().concat([ad('w', { daily: [50, 50, 50, 50, 50, 0, 0], res: steady(2) })]);
      var has = function (r) { return r.byAd.w.issues.some(function (i) { return i.code === 'no-spend-y'; }); };
      ok(has(engine(stop)), 'now: «stopped spending yesterday»');
      ok(!has(PauseProofAlerts.analyze(stop, {}, s, ALERT_FMT, { recent: false, phrase: t('wd.lastMonth') })), 'a past period: no «yesterday» rule');
      var dry = baseAccount().concat([ad('dry', { daily: steady(25) })]);
      var pick = function (r) { return r.alerts.filter(function (x) { return x.adId === 'dry' && x.impactText; })[0]; };
      var a = pick(PauseProofAlerts.analyze(dry, {}, Object.assign({ maxCost: { purchase: 20 } }, s), ALERT_FMT, { recent: false, phrase: t('wd.lastMonth') }));
      ok(a && a.impactText.indexOf(t('wd.lastMonth')) > -1, a ? a.impactText : 'no alert on the dry ad');
      // تكرار الظهور رقم آخر ٧ أيام، و«أكبر مصدر وقف» سؤاله عن النهارده: الاتنين مالهمش مكان في حكم فترة ماضية
      var past = { recent: false, phrase: t('wd.lastMonth') };
      var tired = baseAccount().concat([ad('tired', { daily: steady(100), res: steady(5), freq: 9 })]);
      var freq = function (r) { return r.byAd.tired.issues.some(function (i) { return i.code === 'fatigue'; }); };
      ok(freq(engine(tired)) && !freq(PauseProofAlerts.analyze(tired, {}, s, ALERT_FMT, past)), 'frequency: now only');
      var star = [ad('star', { daily: [100, 100, 100, 100, 100, 100, 0], res: steady(3), sales: [900, 900, 900, 900, 900, 900, 0], active: false, pausedLevel: 'ad' }),
        ad('s1', { daily: steady(100), res: steady(2), sales: steady(200) })];
      var top = function (r) { return r.alerts.some(function (x) { return x.code === 'top-stopped'; }); };
      ok(top(engine(star)) && !top(PauseProofAlerts.analyze(star, {}, s, ALERT_FMT, past)), 'top source stopped: now only');
      // الإعلان المتوقف والإعلان الجديد: جملتهم «خلال آخر ٣ أيام واليوم» و«منذ بدايته حتى أمس» حقائق عن دلوقتي
      var rej = baseAccount().concat([ad('rej', { daily: [100, 100, 100, 100, 100, 100, 0], active: false, pausedLevel: 'rejected' })]);
      var stoppedOf = function (r) { return r.byAd.rej.issues.some(function (i) { return i.code === 'stopped'; }); };
      ok(stoppedOf(engine(rej)) && !stoppedOf(PauseProofAlerts.analyze(rej, {}, s, ALERT_FMT, past)), 'stopped ad: now only');
      var fresh = baseAccount().concat([ad('nw', { daily: [0, 0, 0, 0, 100, 100, 100], age: 1 })]);
      var newOf = function (r) { return r.byAd.nw.issues.some(function (i) { return i.code === 'waste-new'; }); };
      ok(newOf(engine(fresh)) && !newOf(PauseProofAlerts.analyze(fresh, {}, s, ALERT_FMT, past)), 'new ad: now only');
      // العناوين: «طوال الأسبوع» في الأسبوع بس، وفي غيره عبارة الفترة — بالعربي والإنجليزي
      var titleOf = function (r) { return r.byAd.dry.issues.filter(function (i) { return i.code === 'waste-week'; })[0].title; };
      var maxS = Object.assign({ maxCost: { purchase: 20 } }, s);
      eq(titleOf(engine(dry, {}, { maxCost: { purchase: 20 } })), t('al.wasteWeek.t'), 'the week: word for word');
      eq(titleOf(PauseProofAlerts.analyze(dry, {}, maxS, ALERT_FMT, past)), t('al.wasteWeek.tP', { wd: t('wd.lastMonth') }), 'a period: its own words');
      withLang('en', function () { ok(titleOf(PauseProofAlerts.analyze(dry, {}, maxS, ALERT_FMT, { recent: false, phrase: t('wd.lastMonth') })).indexOf('week') < 0, 'English too'); });
      // فترة أقصر من أسبوع: يوم واحد إنفاقه أقل من تكلفة نتيجة مش «المنصة مش بتديله إنفاق»
      var low = baseAccount().concat([ad('low', { daily: steady(1), res: steady(0), key: 'purchase', age: 30 })]);
      var usOf = function (r) { return r.byAd.low.issues.some(function (i) { return i.code === 'underspend'; }); };
      ok(usOf(PauseProofAlerts.analyze(low, {}, s, ALERT_FMT, past)) && !usOf(PauseProofAlerts.analyze(low, {}, s, ALERT_FMT, { recent: false, phrase: 'x', short: true })), 'short period: no «not getting spend»');
      // ومن غير opts زي ما كان: النافذة هنا ٧ خانات = «خلال آخر ٦ أيام»
      var a2 = pick(engine(dry, {}, { maxCost: { purchase: 20 } }));
      ok(a2 && a2.impactText.indexOf(t('wd.last', { n: ar(6) + ' ' + I18N.noun(6, 'n.day') })) > -1, a2 ? a2.impactText : 'no alert');
    });

    test('عبارة كل فترة وقواعد «الآن»: شغّالة بس لو الفترة بتخلص أمس وفيها ٧ أيام مكتملة', function () {
      var o = function (pp) { period = pp; return periodEngineOpts(); };
      var d = function (n) { return t('wd.last', { n: ar(n) + ' ' + noun(n, 'n.day') }); };
      eq(o({ preset: 'today' }), { phrase: t('wd.today'), recent: false, short: true });
      eq(o({ preset: 'yesterday' }), { phrase: t('wd.yesterday'), recent: false, short: true });
      eq(o({ preset: 'last14' }), { phrase: d(14), recent: true, short: false });
      eq(o({ preset: 'last30' }), { phrase: d(30), recent: true, short: false });
      eq(o({ preset: 'lastMonth' }).phrase, t('wd.lastMonth'));
      eq(o({ preset: 'lastMonth' }).recent, false);
      var since = shiftKey(TODAY, -8), range = t('wd.range', { range: fmtRange(since, Y) });
      eq(o({ preset: 'custom', since: since, until: Y }), { phrase: range, recent: true, short: false }, 'custom up to yesterday, 8 days');
      eq(o({ preset: 'custom', since: shiftKey(TODAY, -3), until: Y }).recent, false, 'custom up to yesterday, 3 days');
      eq(o({ preset: 'custom', since: shiftKey(TODAY, -30), until: shiftKey(TODAY, -5) }).recent, false, 'custom that ended before yesterday');
      var first = TODAY.slice(8) === '01';
      eq(o({ preset: 'thisMonth' }).phrase, t(first ? 'wd.today' : 'wd.thisMonth'), 'this month (the first of the month = today)');
    });

    test('فترة أقصر من أسبوع: «أمس» مبيقولش «لا يأخذ إنفاقاً كافياً» على يوم واحد', function () {
      period = { preset: 'yesterday' };
      var r = resolvePeriodFor(BROWSER_TZ);
      var mk = function (id, sp, n) { return withPd(w8(id, { daily: [sp, sp, sp, sp, sp, sp, sp, 1], res: week(n) }), r.since, r.until, flat(sp, n)); };
      candidates = [mk('a', 100, 5), mk('b', 100, 5), mk('low', 0.5, 0)];
      render();
      var us = function () { return analysis.byAd.low.issues.some(function (i) { return i.code === 'underspend'; }); };
      ok(analysis.period && !us(), 'one day is not «the platform gives it no spend»');
      period = { preset: 'lastMonth' };
      r = resolvePeriodFor(BROWSER_TZ);
      candidates = [mk('a', 100, 5), mk('b', 100, 5), mk('low', 0.5, 0)];
      render();
      ok(us(), 'a month of it is what the note means');
    });

    test('تحليلين: الكروت بحكم الفترة، وصفحة التنبيهات على «الآن»، ووسم «عُدّل» حالة دلوقتي، ومن غير أيام فترته = حكم «الآن»', function () {
      period = { preset: 'lastMonth' };
      var r = resolvePeriodFor(BROWSER_TZ);
      var good = function (id) { return withPd(w8(id, { daily: [100, 100, 100, 100, 100, 100, 100, 40], res: week(5) }), r.since, r.until, flat(100, 5)); };
      // «x» جاب عملاء طول الشهر اللي فات زي إخواته، والأسبوع ده صرف من غير ولا عميل، وميزانيته اتعدّلت أمس
      var x = withPd(w8('x', { daily: [100, 100, 100, 100, 100, 100, 100, 40], edits: [{ date: Y, level: 'ad', kind: 'budget', from: 20000, to: 10000 }] }),
        r.since, r.until, flat(100, 5));
      var np = w8('np', { daily: [100, 100, 100, 100, 100, 100, 100, 40] });
      np.period = buildPeriod(3000, 0, 0);   // أرقام الفترة وصلت إجمالي بس (من غير أيام)
      candidates = [good('g1'), good('g2'), x, np];
      render();
      ok(analysis.period && analysis !== analysisNow, 'two analyses');
      var urgent = function (a) { return a.level === 'critical' || a.level === 'warning'; };
      ok(analysisNow.alerts.some(function (a) { return a.adId === 'x' && urgent(a); }), 'now: x is flagged');
      ok(!analysis.byAd.x.issues.some(urgent) && analysis.byAd.x.health !== 'review', 'last month: x was fine — ' + analysis.byAd.x.health);
      ok(analysis.byAd.x.editTag && analysis.byAd.x.editTag === analysisNow.byAd.x.editTag, 'the «edited» tag is a now status');
      eq(analysis.byAd.np, analysisNow.byAd.np, 'no period days = the «now» verdict');
      ok(analysis.alerts.some(function (a) { return a.adId === 'np'; }) && !analysis.alerts.some(function (a) { return a.adId === 'x' && urgent(a); }), 'the merged alert list');
      var h = analysis.summary.health;
      eq(h.good + h.improve + h.review + h.pending + h.inactive, 4, 'the status counts cover every ad');
      renderAlerts();
      ok(alertsListEl.textContent.indexOf('Ad x') > -1, 'the alerts page lists x (now)');
    });

    test('الكارت: التلوين وتلميح نقطة الحالة من حكم الفترة، ولو أيامها موصلتش من غير تلوين والتلميح بيقول إن الحكم على آخر ٧ أيام', function () {
      period = { preset: 'lastMonth' };
      var r = resolvePeriodFor(BROWSER_TZ);
      var mk = function (id, n) { return withPd(w8(id, { daily: [100, 100, 100, 100, 100, 100, 100, 40], res: week(n) }), r.since, r.until, flat(100, n)); };
      // «hi»: تكلفة العميل ١٠٠ قصاد ٢٠ لإخواته طول الشهر
      var hi = mk('hi', 1);
      candidates = [mk('a', 5), mk('b', 5), hi];
      render();
      var card = document.getElementById('card-hi');
      ok(card.querySelector('.card-stat[class*="mv-"], .card-stat[class*="tone-"]'), 'coloured from the period verdict');
      var dot = card.querySelector('.health-dot').getAttribute('title');
      ok(dot.indexOf(t('x.basisPeriodPast', { period: periodLabel() })) > -1 && dot.indexOf(t('x.basisPeriodNow')) > -1, dot);
      delete hi.pd;
      render();
      card = document.getElementById('card-hi');
      ok(!card.querySelector('.card-stat[class*="mv-"], .card-stat[class*="tone-"]'), 'no colour on numbers the verdict was not made on');
      dot = card.querySelector('.health-dot').getAttribute('title');
      ok(dot.indexOf(t('x.basisNow')) > -1, dot);
    });

    test('أساس الحكم في التفاصيل بيقول أنهي أيام: الفترة، أو اليوم حتى الآن، أو آخر ٧ أيام لو أيامها موصلتش', function () {
      var setup = function (pp) {
        period = pp;
        var r = resolvePeriodFor(BROWSER_TZ);
        var mk = function (id) { return withPd(w8(id, { daily: [100, 100, 100, 100, 100, 100, 100, 40], res: week(5) }), r.since, r.until, flat(100, 5)); };
        candidates = [mk('a'), mk('b'), mk('c')];
        render();
        return candidates[2];
      };
      var line = function (c) { openExpand(c); var p = document.querySelector('#expandHealth .health-period'); return p ? p.textContent : ''; };
      var pl = function () { return { period: periodLabel() }; };
      eq(line(setup({ preset: 'last7' })), t('x.basisPeriod', pl()), 'last 7 days');
      eq(line(setup({ preset: 'last30' })), t('x.basisPeriod', pl()), 'last 30 days: the «now» rules are on too');
      eq(line(setup({ preset: 'yesterday' })), t('x.basisPeriod', pl()) + ' ' + t('x.basisPeriodNow'), 'yesterday: under 7 days');
      eq(line(setup({ preset: 'lastMonth' })), t('x.basisPeriodPast', pl()) + ' ' + t('x.basisPeriodNow'), 'last month');
      eq(line(setup({ preset: 'today' })), t('x.basisToday'), 'today');
      var c = setup({ preset: 'custom', since: shiftKey(TODAY, -3), until: TODAY });
      eq(line(c), t('x.basisPeriodToday', pl()), 'a custom range up to today');
      delete c.pd;
      render();
      eq(line(c), t('x.basisNow'), 'the period days did not load');
      withLang('en', function () { render(); eq(line(c), t('x.basisNow'), 'English'); });
      expandOverlay.classList.add('hidden');
    });

    test('جدول الأيام في التفاصيل بيتبع الفترة: أيامها والإجمالي، والنهارده منفصل لو الفترة بتخلص أمس أو فيها النهارده', function () {
      var setup = function (pp, dayFn) {
        period = pp;
        var r = resolvePeriodFor(BROWSER_TZ);
        var mk = function (id) { return withPd(w8(id, { daily: [100, 100, 100, 100, 100, 100, 100, 40], res: week(5) }), r.since, r.until, dayFn || flat(100, 5)); };
        candidates = [mk('a'), mk('b'), mk('c')];
        render();
        openExpand(candidates[2]);
        var ths = document.querySelectorAll('#expandChart thead th'), tot = document.querySelector('#expandChart tbody tr td.col-total');
        var today = document.querySelector('#expandChart tbody tr td.col-today');
        return { r: r, th: Array.prototype.map.call(ths, function (x) { return x.textContent; }), cls: Array.prototype.map.call(ths, function (x) { return x.className; }),
          title: document.getElementById('expandDailyTitle').textContent, total: tot ? tot.textContent : null, today: today ? today.textContent : null };
      };
      // آخر ١٤ يوماً: ١٤ يوم آخرهم «أمس»، والإجمالي (أيام الفترة نفسها)، والنهارده من النافذة اليومية
      var o = setup({ preset: 'last14' }, function (i) { return [10 + i, 1, 0]; });
      eq([o.th.length, o.th[14], o.th[15], o.th[16]], [17, t('x.yesterday'), t('x.totalDays', { n: dayCountText(14) }), t('x.today')]);
      eq([o.title, o.total, o.today], [t('x.dailyTitleP', { period: periodLabel() }), fmtNum(231, true), fmtNum(40, true)]);
      // الشهر الماضي: أيامه والإجمالي بس — من غير «أمس» ولا النهارده
      o = setup({ preset: 'lastMonth' });
      var n = keyDiffDays(o.r.since, o.r.until) + 1;
      eq([o.th.length, o.th.indexOf(t('x.yesterday')), o.cls.indexOf('col-today'), o.th[n + 1], o.today], [n + 2, -1, -1, t('x.totalDays', { n: dayCountText(n) }), null]);
      eq(o.cls.indexOf('col-yesterday'), -1, 'the last day of a past period is not marked as yesterday');
      eq([o.title, o.total], [t('x.dailyTitlePOnly', { period: periodLabel() }), fmtNum(100 * n, true)]);
      // أمس: عمود واحد من غير إجمالي (كان هيبقى نفس الرقم مرتين)، والنهارده منفصل
      o = setup({ preset: 'yesterday' });
      eq([o.th.length, o.th[1], o.th[2], o.total], [3, t('x.yesterday'), t('x.today'), null]);
      // اليوم: عمود النهارده بس، برقم الفترة نفسها
      o = setup({ preset: 'today' }, function () { return [33, 2, 0]; });
      eq([o.th.length, o.th[1], o.today, o.title], [2, t('x.today'), fmtNum(33, true), t('x.dailyTitlePOnly', { period: periodLabel() })]);
      // فترة مخصصة لحد النهارده: الأيام المكتملة والإجمالي، والنهارده (آخر يوم فيها) منفصل
      o = setup({ preset: 'custom', since: shiftKey(TODAY, -3), until: TODAY }, function (i) { return [i === 3 ? 7 : 20, 1, 0]; });
      eq([o.th.length, o.th[3], o.total, o.today], [6, t('x.yesterday'), fmtNum(60, true), fmtNum(7, true)]);
      expandOverlay.classList.add('hidden');
    });

    test('كارت الحملة والمجموعة: لونه من إنفاق أيام الحكم — إعلان سيئ صرف في الشهر الماضي ومصرفش الأسبوع ده بيتحسب', function () {
      useSettings({ maxCost: { lead: 20 } });
      period = { preset: 'lastMonth' };
      var r = resolvePeriodFor(BROWSER_TZ);
      var mk = function (id, weekSp, weekRes, sp, n) { return withPd(w8(id, { daily: [weekSp, weekSp, weekSp, weekSp, weekSp, weekSp, weekSp, 0], res: week(weekRes), cid: 'k' }), r.since, r.until, flat(sp, n)); };
      // «bad» غالي جداً طول الشهر ومصرفش الأسبوع ده، و«ok» بيشتغل كويس الاتنين
      var mine = [mk('ok1', 100, 5, 20, 5), mk('ok2', 100, 5, 20, 5), mk('bad', 0, 0, 500, 0)];
      candidates = mine.concat([mk('other', 100, 5, 100, 5)]);
      candidates[3].campaignId = 'z';
      render();
      ok(analysis.byAd.bad.health === 'review', 'the month verdict: ' + analysis.byAd.bad.health);
      var g = groupCampaigns(candidates).filter(function (x) { return x.ads.some(function (c) { return c.id === 'bad'; }); })[0];
      eq(g.status, 'review', 'the campaign colour follows the days the verdict is on');
    });

    test('التفاصيل: تنبيه «الآن» بيظهر بعنوانه لو مش في حكم الفترة، ومن غير تكرار، ومش في «آخر ٧ أيام»', function () {
      period = { preset: 'lastMonth' };
      var r = resolvePeriodFor(BROWSER_TZ);
      var good = function (id) { return withPd(w8(id, { daily: [100, 100, 100, 100, 100, 100, 100, 40], res: week(5) }), r.since, r.until, flat(100, 5)); };
      // «x» كويس الشهر اللي فات، والأسبوع ده صرف من غير نتائج (زي اللي بيفتح تنبيه عاجل من صفحة التنبيهات)
      var x = withPd(w8('x', { daily: [100, 100, 100, 100, 100, 100, 100, 40] }), r.since, r.until, flat(100, 5));
      candidates = [good('a'), good('b'), x];
      render();
      openExpand(x);
      var box = document.getElementById('expandIssues');
      var want = analysisNow.byAd.x.issues.filter(function (i) { return i.level === 'critical' || i.level === 'warning'; });
      ok(want.length && box.querySelector('.issues-now') && box.textContent.indexOf(want[0].title) > -1, box.textContent.slice(0, 200));
      eq(box.querySelector('.issues-now').textContent, t('x.nowIssues'));
      ok(!box.querySelector('.issue-none'), 'no «no notes» above an alert');
      // إعلان سليم في الاتنين: مفيش عنوان
      openExpand(candidates[0]);
      ok(!box.querySelector('.issues-now'), 'nothing extra on a healthy ad');
      // نفس التنبيه في الحكم والآن (نفس النص): مرة واحدة
      eq(nowOnlyIssues(x, { issues: want }).length, 0, 'not shown twice');
      // «آخر ٧ أيام»: التحليلين واحد
      period = { preset: 'last7' };
      render();
      openExpand(x);
      ok(!box.querySelector('.issues-now'), 'one analysis, one list');
      expandOverlay.classList.add('hidden');
    });

    test('شارة «تحتاج إلى مراجعة» في قسم «الآن» بتقول الفترة لو غير الأسبوع', function () {
      useSettings({ maxCost: { lead: 20 } });
      period = { preset: 'lastMonth' };
      var r = resolvePeriodFor(BROWSER_TZ);
      var mk = function (id, n) { return withPd(w8(id, { daily: [100, 100, 100, 100, 100, 100, 100, 40], res: week(5) }), r.since, r.until, flat(100, n)); };
      candidates = [mk('a', 5), mk('b', 5), mk('z', 0)];
      render();
      var chip = document.querySelector('[data-kpi="review"]');
      ok(analysis.byAd.z.health === 'review' && chip && chip.textContent === t('attn.reviewP', { n: ar(1), period: periodLabel() }), chip ? chip.textContent : 'no chip');
    });

    test('Meta: أيام الفترة من صفوفها اليومية والمجموع = مجموع الأيام؛ والمجموع لوحده (الأيام اتقطعت) = من غير أيام', function () {
      var base = { id: '1', name: 'A', effective_status: 'ACTIVE', created_time: '2026-01-01T00:00:00+0000',
        adset: { id: 's', name: 'S', optimization_goal: 'OFFSITE_CONVERSIONS' }, campaign: { id: 'c', name: 'C' }, creative: {} };
      var pr = { since: shiftKey(TODAY, -20), until: shiftKey(TODAY, -11) };
      var buy = function (d, spend, n, v) { return { date_start: d, spend: String(spend), actions: [{ action_type: 'omni_purchase', value: String(n) }], action_values: [{ action_type: 'omni_purchase', value: String(v) }] }; };
      var c = transformRealAd(base, [], {}, DAYS_X, null, 'SAR', null, [buy(pr.since, 30, 1, 90), buy(shiftKey(pr.since, 5), 20.5, 2, 150)], pr);
      eq([c.pd.dates.length, c.pd.dates[0], c.pd.dates[9]], [10, pr.since, pr.until]);
      eq([c.pd.spend[0], c.pd.spend[5], c.pd.results[5], c.pd.sales[5], c.pd.spend[1], c.pd.results[1]], [30, 20.5, 2, 150, 0, 0]);
      eq([c.period.spend, c.period.results, c.period.sales], [50.5, 3, 240], 'the card total = the sum of the days');
      var tot = transformRealAd(base, [], {}, DAYS_X, null, 'SAR', null, buy(pr.since, 50.5, 3, 240), pr);
      eq([tot.pd, tot.period.spend, tot.period.results], [null, 50.5, 3], 'totals only: no days');
      var none = transformRealAd(base, [], {}, DAYS_X, null, 'SAR', null, [], pr);
      eq([none.pd.dates.length, sumArr(none.pd.spend), none.period.spend], [10, 0, 0], 'no spend in the period = zero days');
    });

    test('Meta: فترة المقارنة بأساس الكارت نفسه — نوع نتيجة تاني فيها (هدف المجموعة اتغيّر) = الإنفاق بس من غير عدد', function () {
      var base = { id: '1', name: 'A', effective_status: 'ACTIVE', created_time: '2026-01-01T00:00:00+0000',
        adset: { id: 's', name: 'S', optimization_goal: 'OFFSITE_CONVERSIONS' }, campaign: { id: 'c', name: 'C' }, creative: {} };
      var pr = { since: shiftKey(TODAY, -20), until: shiftKey(TODAY, -11) };
      var buy = function (d, spend, n, v) { return { date_start: d, spend: String(spend), actions: [{ action_type: 'omni_purchase', value: String(n) }], action_values: [{ action_type: 'omni_purchase', value: String(v) }] }; };
      var c = transformRealAd(base, [], {}, DAYS_X, null, 'SAR', null, buy(pr.since, 50, 3, 240), pr);
      eq([c.resultKey, !!c.metaCtx], ['purchase', true]);
      var x = metaCmpPeriod(buy(pr.since, 30, 2, 100), c, pr);
      eq([x.spend, x.results, x.sales], [30, 2, 100], 'the same result type');
      var lead = { spend: '40', actions: [{ action_type: 'lead', value: '4' }], results: [{ indicator: 'actions:lead', values: [{ value: '4' }] }] };
      var y = metaCmpPeriod(lead, c, pr);
      eq([y.spend, y.results, y.otherType], [40, null, true], 'another result type: the spend only');
      eq(metaCmpPeriod(undefined, c, pr), buildPeriod(0, 0, 0), 'no row = it did not run');
      eq(metaCmpPeriod([buy(pr.since, 10, 1, 50)], c, pr).spend, 10, 'inside the week: from the daily rows');
      eq(metaCmpPeriod(null, {}, pr), false, 'a card without its basis = not available');
    });
    test('Snapchat: الفترة يوم بيوم — «الأقرب للمتجر» لكل يوم ورقم المنصة جنبه، والمجموع = مجموع الأيام', function () {
      var M = 1000000, pr = { since: shiftKey(TODAY, -9), until: shiftKey(TODAY, -2) };
      var ser = function (rows) {
        return { timeseries_stats: [{ timeseries_stat: { breakdown_stats: { ad: Object.keys(rows).map(function (id) {
          return { id: id, timeseries: rows[id].map(function (x) { return { start_time: x[0] + 'T00:00:00.000+03:00', stats: x[1] }; }) };
        }) } } }] };
      };
      var ads1 = [{ ad: { id: 'a1', name: 'S', status: 'ACTIVE', ad_squad_id: 'sq1' } }], squads = [{ id: 'sq1', optimization_goal: 'PIXEL_PURCHASE' }];
      var wk = [{ timeseries_stat: { breakdown_stats: { ad: [{ id: 'a1', timeseries: [] }] } } }];
      var pPlat = ser({ a1: [[pr.since, { spend: 100 * M, swipes: 10, conversion_purchases: 4, conversion_purchases_value: 400 * M }],
        [shiftKey(pr.since, 3), { spend: 50 * M, swipes: 5, conversion_purchases: 2, conversion_purchases_value: 200 * M }]] });
      var pStore = ser({ a1: [[pr.since, { conversion_purchases: 3, conversion_purchases_value: 300 * M }]] });
      var c = transformSnapchatAds(ads1, wk, DAYS_X, 'SAR', squads, [], pPlat, [], pStore, null, null, pr)[0];
      eq([c.pd.dates.length, c.pd.spend.join(), c.pd.results.join(), c.pd.sales.join()], [8, '100,0,0,50,0,0,0,0', '3,0,0,0,0,0,0,0', '300,0,0,0,0,0,0,0']);
      eq([c.period.spend, c.period.results, c.period.sales, c.period.plat.results, c.period.plat.sales], [150, 3, 300, 6, 600]);
      // «الأقرب» للفترة فشل: رقم المنصة يوم بيوم ومن غير مقارنة
      var c2 = transformSnapchatAds(ads1, wk, DAYS_X, 'SAR', squads, [], pPlat, [], null, null, null, pr)[0];
      eq([c2.pd.results.join(), c2.period.results, c2.period.plat], ['4,0,0,2,0,0,0,0', 6, undefined]);
    });

    test('Google: الفترة يوم بيوم — «الأقرب للمتجر» بحد المنصة في كل يوم زي الأسبوع، والمجموع والطلبات الصحيحة = مجموع الأيام', function () {
      var M = 1000000, pr = { since: shiftKey(TODAY, -5), until: shiftKey(TODAY, -2) };
      var row = function (g, a) { return { adGroup: { id: g, name: 'AG', status: 'ENABLED' }, adGroupAd: { ad: { id: a, name: 'Ad ' + a }, status: 'ENABLED' }, campaign: { id: '3', name: 'S', status: 'ENABLED' } }; };
      var on = function (g, a, k, m) { return { adGroup: { id: g }, adGroupAd: { ad: { id: a } }, segments: { date: k }, metrics: m }; };
      var tot = function (g, a, m) { return { adGroup: { id: g }, adGroupAd: { ad: { id: a } }, metrics: m }; };
      // اليوم الأول المتجر ٣ والمنصة ١ (الحد ١)، والتالت المتجر صفر والمنصة ٢: يوم بيوم = ١ — والإجمالي كان هيقول ٣
      var pDaily = [on('7', '9', pr.since, { costMicros: String(40 * M), conversions: 1, conversionsValue: 100 }), on('7', '9', shiftKey(pr.since, 2), { costMicros: String(60 * M), conversions: 2, conversionsValue: 200 })];
      var pStoreD = [on('7', '9', pr.since, { conversions: 3, conversionsValue: 300 })];
      var pTot = [tot('7', '9', { costMicros: String(100 * M), conversions: 3, conversionsValue: 300 })], pStoreT = [tot('7', '9', { conversions: 3, conversionsValue: 300 })];
      var c = googleWholeOrders(transformGoogleRows([row('7', '9')], [], DAYS_X, 'SAR', pTot, [], pStoreT, pDaily, pStoreD, pr))[0];
      eq([c.pd.dates.length, c.pd.spend.join(), c.pd.results.join(), c.pd.sales.join()], [4, '40,0,60,0', '1,0,0,0', '100,0,0,0']);
      eq([c.period.spend, c.period.results, c.period.sales, c.period.plat.results], [100, 1, 100, 3], 'the card = the sum of the days');
      var t2 = googleWholeOrders(transformGoogleRows([row('7', '9')], [], DAYS_X, 'SAR', pTot, [], pStoreT, null, null, pr))[0];
      eq([t2.pd, t2.period.results], [null, 3], 'no period days: the total as before');
      // كسور: إعلانين كل واحد ٠٫٦ طلب في يوم — إجمالي الحساب طلب واحد صحيح، وأيام كل إعلان بتتقسم على نصيبه هو
      var fr = [on('7', '1', pr.since, { costMicros: String(10 * M), conversions: 0.6, conversionsValue: 60 }), on('7', '2', shiftKey(pr.since, 1), { costMicros: String(10 * M), conversions: 0.6, conversionsValue: 60 })];
      var two = googleWholeOrders(transformGoogleRows([row('7', '1'), row('7', '2')], [], DAYS_X, 'SAR', [], null, null, fr, null, pr));
      eq(two.map(function (x) { return x.period.results; }).reduce(function (a, b) { return a + b; }, 0), 1, 'whole orders across the account');
      ok(two.every(function (x) { return sumArr(x.pd.results) === x.period.results; }), two.map(function (x) { return x.pd.results.join() + '=' + x.period.results; }).join(' | '));
      // Performance Max: نفس الأيام على مستوى الحملة، وحملة صرفت في الفترة بس بتظهر بأيامها
      var camp = { id: '21', name: 'PMax', status: 'ENABLED', primaryStatus: 'ELIGIBLE' };
      var pm = googleWholeOrders(transformGooglePmax([], [{ campaign: camp, metrics: { costMicros: String(80 * M), conversions: 4, conversionsValue: 400 } }], DAYS_X, 'SAR', null, null,
        [{ campaign: camp, segments: { date: pr.until }, metrics: { costMicros: String(80 * M), conversions: 4, conversionsValue: 400 } }], null, pr))[0];
      eq([pm.pd.dates.length, pm.pd.spend[3], pm.pd.results[3], pm.period.spend, pm.period.results], [4, 80, 4, 80, 4]);
    });

    test('Google وTikTok: أرقام فترة المقارنة لكل إعلان من نفس طلب الإعلانات على مدى المقارنة ونفس التحويل', function () {
      var keep = { apiPost: window.apiPost, isCurrentLoad: window.isCurrentLoad, render: window.render }, sent = [], reply = null, saved = { g: cmpStore['google:123'], t: cmpStore['tiktok:adv1'] };
      window.apiPost = function (u, body) { sent.push(body); var r = reply(body); return { then: function (f) { f(r); return { catch: function () {} }; } }; };
      window.isCurrentLoad = function () { return true; };
      window.render = function () {};
      try {
        var w = cardCompareRange('UTC'), M = 1000000, pr = { since: shiftKey(TODAY, -5), until: shiftKey(TODAY, -2) };
        var rows = [{ ad_id: '9', ad_name: 'T', campaign_id: '3', campaign_name: 'C', adgroup_id: '77', adgroup_name: 'AG', operation_status: 'ENABLE', ad_format: 'SINGLE_VIDEO' }];
        var tt = transformTikTokAds(rows, [], DAYS_X, 'SAR', [{ dimensions: { ad_id: '9' }, metrics: { spend: '40.00', conversion: '5' } }], null, pr)[0];
        tt.source = 'tiktok:adv1';
        reply = function (b) { return { ok: true, data: { ads: rows, report: [], periodReport: [{ dimensions: { ad_id: '9' }, metrics: { spend: '31.00', conversion: '3' } }], periodDaily: null,
          period: { since: b.period.since, until: b.period.until }, range: { since: KEYS[0], until: KEYS[6] }, advertiser: { currency: 'SAR', timezone: 'UTC' } } }; };
        loadTikTokCompare('adv1', 'UTC', 't');
        eq(sent[0].period, { preset: 'custom', since: w.since, until: w.until });
        var x = cmpOf(tt);
        eq([x.state, x.p.spend, x.p.results], ['ok', 31, 3], 'TikTok');
        reply = function () { return { ok: true, data: { ads: rows, report: [], periodReport: null, period: { since: w.since, until: w.until }, range: { since: KEYS[0], until: KEYS[6] } } }; };
        loadTikTokCompare('adv1', 'UTC', 't');
        eq(cmpOf(tt).state, 'failed', 'its period numbers failed: not available');
        var row = function (g, a) { return { adGroup: { id: g, name: 'AG', status: 'ENABLED' }, adGroupAd: { ad: { id: a, name: 'Ad ' + a }, status: 'ENABLED' }, campaign: { id: '3', name: 'S', status: 'ENABLED' } }; };
        var tot = function (g, a, m) { return { adGroup: { id: g }, adGroupAd: { ad: { id: a } }, metrics: m }; };
        var gg = googleWholeOrders(transformGoogleRows([row('7', '9')], [], DAYS_X, 'SAR', [tot('7', '9', { costMicros: String(100 * M), conversions: 4, conversionsValue: 400 })], [],
          [tot('7', '9', { conversions: 3, conversionsValue: 300 })], null, null, pr))[0];
        gg.source = 'google:123';
        reply = function (b) { return { ok: true, data: { ads: [row('7', '9')], metrics: [], periodMetrics: [tot('7', '9', { costMicros: String(70 * M), conversions: 2, conversionsValue: 200 })],
          storeMetrics: [], storePeriodMetrics: [tot('7', '9', { conversions: 2, conversionsValue: 180 })], periodDaily: null, storePeriodDaily: null, pmax: [], pmaxPeriod: [],
          period: { since: b.period.since, until: b.period.until }, range: { since: KEYS[0], until: KEYS[6] } } }; };
        sent.length = 0;
        loadGoogleCompare('123', { timeZone: 'UTC', currency: 'SAR' }, 't');
        eq(sent[0].period, { preset: 'custom', since: w.since, until: w.until });
        var y = cmpOf(gg);
        eq([y.state, y.p.spend, y.p.results, y.p.sales], ['ok', 70, 2, 180], 'Google: closest to the store with the platform cap, like the card');
        // حملة Performance Max: أرقام PMax للمدى فشلت = مش متاحة (مش صفر)، حتى لو الحملة مش في الرد خالص
        var camp = { id: '21', name: 'PMax', status: 'ENABLED', primaryStatus: 'ELIGIBLE' };
        var pm = transformGooglePmax([], [{ campaign: camp, metrics: { costMicros: String(80 * M), conversions: 4, conversionsValue: 400 } }], DAYS_X, 'SAR', null, null, null, null, pr)[0];
        pm.source = 'google:123';
        var keepC = candidates.slice();
        candidates.length = 0; candidates.push(gg, pm);
        try {
          reply = function (b) { return { ok: true, data: { ads: [row('7', '9')], metrics: [], periodMetrics: [tot('7', '9', { costMicros: String(70 * M), conversions: 2, conversionsValue: 200 })],
            storeMetrics: [], storePeriodMetrics: [tot('7', '9', { conversions: 2, conversionsValue: 180 })], pmax: [], pmaxPeriod: null, pmaxError: 'boom',
            period: { since: b.period.since, until: b.period.until }, range: { since: KEYS[0], until: KEYS[6] } } }; };
          loadGoogleCompare('123', { timeZone: 'UTC', currency: 'SAR' }, 't');
          eq([pm.campaignLevel, cmpOf(pm).state, cmpOf(gg).state], [true, 'failed', 'ok'], 'PMax numbers failed: those campaigns only');
        } finally { candidates.length = 0; keepC.forEach(function (c) { candidates.push(c); }); }
        reply = function (b) { return { ok: true, data: { ads: [], metrics: [], periodMetrics: [], period: { since: shiftKey(b.period.since, 1), until: b.period.until }, range: { since: KEYS[0], until: KEYS[6] } } }; };
        loadGoogleCompare('123', { timeZone: 'UTC', currency: 'SAR' }, 't');
        eq(cmpOf(gg).state, 'failed', 'the server cut the range: another range is not a comparison');
      } finally {
        Object.keys(keep).forEach(function (k) { window[k] = keep[k]; });
        if (saved.g) cmpStore['google:123'] = saved.g; else delete cmpStore['google:123'];
        if (saved.t) cmpStore['tiktok:adv1'] = saved.t; else delete cmpStore['tiktok:adv1'];
      }
    });
    test('TikTok: الفترة يوم بيوم لكل إعلان، والمجموع على الكارت من أيامها لو وصلت', function () {
      var pr = { since: shiftKey(TODAY, -4), until: shiftKey(TODAY, -2) };
      var rows = [{ ad_id: '9', ad_name: 'T', campaign_id: '3', campaign_name: 'C', adgroup_id: '77', adgroup_name: 'AG', operation_status: 'ENABLE', ad_format: 'SINGLE_VIDEO' }];
      // المجموع هنا مختلف عن الأيام قصداً: الكارت بياخد من الأيام (اللي الحكم عليها)
      var pTot = [{ dimensions: { ad_id: '9' }, metrics: { spend: '31.00', conversion: '3' } }];
      var pDay = [{ dimensions: { ad_id: '9', stat_time_day: pr.since + ' 00:00:00' }, metrics: { spend: '12.50', conversion: '1' } },
        { dimensions: { ad_id: '9', stat_time_day: pr.until + ' 00:00:00' }, metrics: { spend: '17.50', conversion: '2' } }];
      var c = transformTikTokAds(rows, [], DAYS_X, 'SAR', pTot, pDay, pr)[0];
      eq([c.pd.dates.join(), c.pd.spend.join(), c.pd.results.join()], [[pr.since, shiftKey(pr.since, 1), pr.until].join(), '12.5,0,17.5', '1,0,2']);
      eq([c.period.spend, c.period.results], [30, 3]);
      var c2 = transformTikTokAds(rows, [], DAYS_X, 'SAR', pTot, null, pr)[0];
      eq([c2.pd, c2.period.spend], [null, 31], 'no daily report: the total as before');
    });

    // حساب Meta وهمي: طلبات الأيام (time_increment خارج نافذة الأسبوع) بتتمسك لحد ما الاختبار يردّ عليها
    var metaFake = function (id, o) {
      o = o || {};
      var hadFB = 'FB' in window, prevFB = window.FB, held = [], f = { held: held, totals: 0, weeks: 0, ranges: [], camps: [], filters: [], cmps: [], adsCalls: 0, adsets: 0, acts: 0, reach: 0 };
      var buy = function (d, sp) { return { ad_id: 'm1', date_start: d, spend: String(sp), actions: [{ action_type: 'omni_purchase', value: '1' }], action_values: [{ action_type: 'omni_purchase', value: '100' }] }; };
      var week = last7Days(todayKeyInTz('UTC')).map(function (d) { return d.key; });
      window.FB = { api: function (path, params, cb) {
        var p = typeof params === 'object' ? params : {}, reply = { data: [] };
        if (/\/ads$/.test(path)) f.adsCalls++;
        if (/\/adsets$/.test(path)) { f.adsets++; f.adsetsParams = p; if (o.adsetsDown) { setTimeout(function () { cb({ error: { code: 17, error_subcode: 2446079, message: 'User request limit reached' } }); }, 0); return; } reply = { data: [{ id: 's', effective_status: 'ACTIVE', campaign: { effective_status: 'ACTIVE' } }] }; }
        if (/\/activities$/.test(path)) f.acts++;
        if (/insights$/.test(path) && /frequency/.test(p.fields || '') && p.time_range) f.reach++;
        // أيام الموقع لتنبيهات البريد (ui.js loadExtraAlerts — ٨ نوفمبر): طلب على مستوى الحساب (من غير level) بيتعدّ لوحده — مش من أرقام الإعلانات
        if (/insights$/.test(path) && !p.level && /inline_link_clicks/.test(p.fields || '')) { f.site = (f.site || 0) + 1; setTimeout(function () { cb({ data: [] }); }, 0); return; }
        if (/\/ads$/.test(path) && o.holdStopped && /PAUSED/.test(p.effective_status || '')) { f.stopped = function () { cb({ data: [] }); return sleep(60); }; return; }
        if (/\/ads$/.test(path)) reply = { data: [{ id: 'm1', name: 'M', effective_status: 'ACTIVE', created_time: '2026-01-01T00:00:00+0000', adset: Object.assign({ id: 's', optimization_goal: 'OFFSITE_CONVERSIONS' }, o.nestedStatus ? { effective_status: 'ACTIVE' } : {}), campaign: { id: 'c', name: 'C' }, creative: {} }] };
        if (/insights$/.test(path) && p.level === 'campaign' && /^campaign_id/.test(p.fields || '')) {
          f.camps.push(JSON.parse(p.time_range));
          reply = o.noCamps ? { error: { code: 1, message: 'no list' } } : (o.emptyCamps ? { data: [] } : { data: [{ campaign_id: 'c' }, { campaign_id: 'd' }] });
          setTimeout(function () { cb(reply); }, 0);
          return;
        }
        if (/insights$/.test(path) && /actions/.test(p.fields || '') && p.time_range) {
          var r = JSON.parse(p.time_range), cw = !p.time_increment && p.level === 'ad' && cardCompareRange('UTC');
          // أرقام فترة المقارنة لكل إعلان (meta.js loadCompare): طلب واحد للمدى كله — بيتعدّ لوحده
          if (cw && r.since === cw.since && r.until === cw.until) {
            f.cmps.push({ r: r, filtering: p.filtering || null });
            var noWin = o.cmpNoWindows && p.action_attribution_windows;
            setTimeout(function () { cb(noWin ? { error: { code: 100, message: 'bad windows' } } : { data: [Object.assign(buy(r.since, 450), { date_start: undefined })] }); }, 0);
            return;
          }
          f.filters.push(p.filtering || null);
          if (o.rejectFilter && p.filtering) { setTimeout(function () { cb({ error: { code: 100, message: 'Invalid filtering' } }); }, 0); return; }
          if (!p.time_increment) { f.totals++; reply = { data: [Object.assign(buy(r.since, 900), { date_start: undefined })] }; }
          else if (r.until === week[week.length - 1] && r.since === week[0]) {
            f.weeks++;
            reply = o.weekNoWindows && p.action_attribution_windows ? { error: { code: 100, message: 'bad windows' } } : { data: week.map(function (d) { return buy(d, 10); }) };
            if (o.missing && reply.data) reply.data.push(Object.assign(buy(week[0], 5), { ad_id: 'gone' }));
          }
          else {
            f.ranges.push(r);
            held.push({ r: r, answer: function (bad) {
              var out = [];
              for (var k = r.since; k <= r.until; k = shiftKey(k, 1)) out.push(buy(k, 20));
              cb(bad ? { error: { code: 1, message: 'Please reduce the amount of data' } } : { data: out });
            } });
            return;
          }
        }
        setTimeout(function () { cb(reply); }, 0);
      } };
      accountInfo['meta:' + id] = { timeZone: 'UTC', currency: 'SAR' };
      f.restore = function () { if (hadFB) window.FB = prevFB; else delete window.FB; };
      f.pump = function (bad) { var list = held.splice(0, held.length); list.forEach(function (h) { h.answer(bad); }); return sleep(60); };
      f.ad = function () { return candidates.filter(function (c) { return c.id === 'm1'; })[0]; };
      return f;
    };
    var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var statusText = function () { return document.getElementById('connectStatus').textContent; };

    testAsync('Meta: الكروت متستناش أيام الفترة — المجموع أول، والأيام دفعات ٧ أيام بالتوازي من غير أيام الأسبوع', function () {
      period = { preset: 'last30' };
      var f = metaFake('act_41');
      loadAdsForAccount('act_41');
      return sleep(80).then(function () {
        // حساب حقيقي ٧ نوفمبر: طلب ٣٠ يوم يوم بيوم فشل ٦ مرات ٣٠ ثانية، والكروت مستنية ٣ دقايق
        var c = f.ad(), week = last7Days(todayKeyInTz('UTC')).map(function (d) { return d.key; }), r = resolvePeriodFor('UTC');
        eq([c.period.spend, c.pd, numbersPending.meta, f.weeks, f.totals], [900, null, false, 1, 1], 'numbers first, days still on the way');
        ok(statusText().indexOf(t('s.metaDaysLoading')) > -1, statusText());
        eq(f.ranges.length, 4, 'four at a time');
        eq([f.ranges[0].since, f.ranges[0].until], [r.since, shiftKey(r.since, 6)]);
        return f.pump().then(function () {
          // ٢٣ يوم قبل نافذة الأسبوع = ٤ دفعات، كلها في الجولة الأولى، وآخرها بيقف قبل النافذة
          eq(f.ranges[3].until, shiftKey(week[0], -1), 'the week is not fetched again');
          var d = f.ad();
          eq([d.pd.dates.length, d.pd.dates[0], d.pd.dates[29], d.pd.spend[0], d.pd.spend[29]], [30, r.since, r.until, 20, 10]);
          eq([d.period.spend, d.period.results], [23 * 20 + 7 * 10, 30], 'the card total = the sum of the days');
          ok(analysis.period && judgedOnPeriod(d), 'judged on the period');
          ok(statusText().indexOf(t('s.metaDaysLoading')) < 0 && !loadingPlatforms.meta, statusText());
        });
      }).then(function () { f.restore(); }, function (e) { f.restore(); throw e; });
    });

    testAsync('Meta: طلبات مستوى الإعلان متصفّية بحملات المدى، ولو القائمة فشلت زي الأول من غير تصفية', function () {
      // حساب حقيقي ٧ نوفمبر: نفس الصفوف والأرقام بـ٢٫٢ ثانية بدل ١١٫٦ (كان بيمسح ٣٧ حملة والمفيد ٨)
      period = { preset: 'last30' };
      var f = metaFake('act_47');
      loadAdsForAccount('act_47');
      var want = scopeToCampaigns({}, ['c', 'd']).filtering;
      // فحص حقيقي: الطلب المتصفّي بيرجّع غير المؤرشف بس — إعلان مؤرشف صرف ٦٦٫٧٥ كان بيختفي. الحالات مكتوبة صراحة
      var st = JSON.parse(want)[1];
      eq([st.field, st.operator, st.value.indexOf('ARCHIVED') > -1, st.value.indexOf('DELETED') > -1], ['ad.effective_status', 'IN', true, true], 'archived and deleted ads stay in');
      return sleep(80).then(function () {
        var r = resolvePeriodFor('UTC'), week = last7Days(todayKeyInTz('UTC')).map(function (d) { return d.key; });
        eq(f.camps, [{ since: cardCompareRange('UTC').since, until: week[week.length - 1] }], 'one list for the period, the week and the comparison period together');
        eq([f.cmps.length, f.cmps[0].filtering === want], [1, true], 'the comparison period: one request, scoped by the same list');
        eq([f.filters.length, f.filters.every(function (x) { return x === want; })], [6, true], 'week + total + 4 batches, all scoped');
        return f.pump();
      }).then(function () {
        f.restore();
        var g = metaFake('act_48', { noCamps: true });
        loadAdsForAccount('act_48');
        // القائمة بتتعاد مرة بعد ثانية ونص زي أي طلب أرقام (fbPagesPromise) قبل ما نكمّل من غيرها
        return sleep(1800).then(function () {
          eq([g.filters.length, g.filters.every(function (x) { return x === null; }), g.ad().period.spend], [6, true, 900], 'no list: as before, unfiltered');
          return g.pump();
        }).then(function () { eq(g.ad().pd.dates.length, 30); g.restore(); }, function (e) { g.restore(); throw e; });
      }, function (e) { f.restore(); throw e; });
    });

    // «٣ أرقام في كل الأداة» (٧ نوفمبر ٢٠٢٦): أرقام فترة المقارنة لكل إعلان من غير ما تضاعف طلبات مستوى الإعلان (حد Meta للطلبات)
    testAsync('Meta: أرقام فترة المقارنة لكل إعلان — طلب واحد للمدى كله، و«اليوم» قصاد «أمس» من أيام الأسبوع من غير طلب', function () {
      period = { preset: 'last30' };
      compare = { mode: 'prev' };
      var f = metaFake('act_61');
      loadAdsForAccount('act_61');
      return sleep(80).then(function () {
        var w = cardCompareRange('UTC');
        eq([f.cmps.length, f.cmps[0].r, f.totals, f.camps.length], [1, { since: w.since, until: w.until }, 1, 1], 'one request for the whole range, no extra list');
        var x = cmpOf(f.ad());
        eq([x.state, x.p.spend, x.p.results, x.p.sales], ['ok', 450, 1, 100]);
        return f.pump();
      }).then(function () {
        f.restore();
        period = { preset: 'today' };
        var g = metaFake('act_62');
        loadAdsForAccount('act_62');
        return sleep(80).then(function () {
          var y = cmpOf(g.ad());
          eq([g.cmps.length, y.state, y.p.spend, y.p.results], [0, 'ok', 10, 1], 'today vs yesterday: from the week rows');
          g.restore();
          // Meta رفضت النوافذ في طلب المقارنة: رقم المنصة نفسها أساس تاني غير أرقام الكارت — مش متاحة، مش أرقام بطريقة تانية
          var h = metaFake('act_63', { cmpNoWindows: true });
          period = { preset: 'last7' };
          loadAdsForAccount('act_63');
          return sleep(3500).then(function () {
            eq([h.cmps.length, cmpOf(h.ad()).state, h.ad().period.spend], [3, 'failed', 900], 'windows refused twice, then plain: not compared; the card keeps its numbers');
            h.restore();
          }, function (e) { h.restore(); throw e; });
        }, function (e) { g.restore(); throw e; });
      }, function (e) { f.restore(); throw e; });
    });
    testAsync('Meta: مقارنة بالسنة السابقة من أول تحميل — قائمة حملات الفترة زي ما هي (مش سنة كاملة)، والمدى البعيد ليه قائمته', function () {
      period = { preset: 'last7' };
      compare = { mode: 'year' };
      var f = metaFake('act_65');
      loadAdsForAccount('act_65');
      var done = function () { compare = { mode: 'prev' }; saveCompare(); f.restore(); };
      return sleep(80).then(function () {
        var r = resolvePeriodFor('UTC'), w = cardCompareRange('UTC');
        eq([f.camps.length, f.camps[0].since, f.camps[1], f.cmps.length], [2, r.since, { since: w.since, until: w.until }, 1], 'the period list, then the far range on its own');
      }).then(done, function (e) { done(); throw e; });
    });
    testAsync('Meta: تغيير المقارنة لوحدها بيجيب أرقام فترة المقارنة بس — الكروت زي ما هي، ومدى بعيد ليه قائمة حملاته', function () {
      period = { preset: 'last7' };
      compare = { mode: 'prev' };
      var f = metaFake('act_64');
      loadAdsForAccount('act_64');
      var done = function () { compare = { mode: 'prev' }; saveCompare(); f.restore(); };
      return sleep(80).then(function () {
        var before = { weeks: f.weeks, ads: f.adsCalls, camps: f.camps.length, cmps: f.cmps.length };
        applyCompare({ mode: 'year' });
        var w = cardCompareRange('UTC');
        eq(cmpOf(f.ad()).state, 'loading', 'waiting for the new range');
        return sleep(80).then(function () {
          eq([f.weeks, f.adsCalls], [before.weeks, before.ads], 'the cards are not reloaded');
          eq([f.camps.length - before.camps, f.camps[f.camps.length - 1], f.cmps.length - before.cmps], [1, { since: w.since, until: w.until }, 1], 'a far range: its own list, then one request');
          eq(cmpOf(f.ad()).state, 'ok');
        });
      }).then(done, function (e) { done(); throw e; });
    });
    testAsync('Meta: قائمة الحملات — فشلها أو أكتر من الحد أو الصفحات اتقطعت أو فاضية = من غير تصفية', function () {
      var real = window.fbPagesPromise, reply = null;
      window.fbPagesPromise = function () { return Promise.resolve(reply); };
      var rows = function (n) { var out = []; for (var i = 0; i < n; i++) out.push({ campaign_id: 'c' + i }); return out; };
      var get = function (r) { reply = r; return metaCampaignIds('act_1', '2026-10-01', '2026-10-31'); };
      return get({ data: rows(100) }).then(function (ids) {
        eq(ids.length, 100, 'up to the limit');
        return get({ data: rows(101) });
      }).then(function (ids) { eq(ids, null, 'over the limit');
        return get({ data: rows(3), truncated: true });
      }).then(function (ids) { eq(ids, null, 'cut off');
        return get({ err: { code: 1 }, data: [] });
      }).then(function (ids) { eq(ids, null, 'failed');
        return get({ data: [] });
      }).then(function (ids) { eq([ids, noCampaigns(ids), noCampaigns(null)], [[], true, false], 'empty: nothing in the range');
        eq(scopeToCampaigns({ level: 'ad' }, null), { level: 'ad' }, 'no list = the request as it was');
        eq(JSON.parse(scopeToCampaigns({ filtering: JSON.stringify([{ field: 'x' }]) }, ['1']).filtering).map(function (r) { return r.field; }), ['x', 'campaign.id', 'ad.effective_status'], 'a filter already there stays');
        window.fbPagesPromise = real;
      }, function (e) { window.fbPagesPromise = real; throw e; });
    });

    testAsync('Meta — الملخص: لو Meta رفضت الفلتر على مستوى الإعلان، الطلب بيتعاد من غيره والتقسيم بيفضل موجود', function () {
      var real = window.fbPagesPromise, seen = [];
      var row = function (x) { return Object.assign({ spend: '10', impressions: '100', inline_link_clicks: '1', actions: [], action_values: [] }, x); };
      window.fbPagesPromise = function (path, p) {
        if (p.time_increment) return Promise.resolve({ data: [row({ date_start: '2026-09-25' })] });
        if (p.level === 'campaign') return Promise.resolve({ data: [row({ campaign_id: '1', campaign_name: 'A', objective: 'OUTCOME_SALES', optimization_goal: 'OFFSITE_CONVERSIONS' })] });
        if (p.level === 'ad') { seen.push(!!p.filtering); if (p.filtering) return Promise.resolve({ err: { code: 100, message: 'Invalid filtering' }, data: [] }); }
        return Promise.resolve({ data: [row({ ad_id: 'd', ad_name: 'y', adset_id: 'a', adset_name: 'x', objective: 'OUTCOME_SALES', optimization_goal: 'OFFSITE_CONVERSIONS', country: 'KW', region: 'r', age: '25-34', gender: 'male',
          publisher_platform: 'instagram', platform_position: 'feed', device_platform: 'mobile_app', impression_device: 'iphone' })] });
      };
      return metaDiagnosisInput('act_1', '2026-09-22', '2026-09-28').then(function (inp) {
        window.fbPagesPromise = real;
        ok(inp.dims.some(function (d) { return d.id === 'ad'; }), 'the ad breakdown survived');
        eq([seen.indexOf(true) > -1, seen.indexOf(false) > -1], [true, true], 'filtered first, then not');
      }, function (e) { window.fbPagesPromise = real; throw e; });
    });

    testAsync('Meta: حساب مفيهوش أرقام في المدى ميطلبش الأرقام الثقيلة — كان ١١ ثانية عشان يرجع صفر', function () {
      period = { preset: 'last30' };
      var f = metaFake('act_57', { emptyCamps: true });
      loadAdsForAccount('act_57');
      return sleep(80).then(function () {
        eq([f.camps.length, f.weeks, f.totals, f.ranges.length], [1, 0, 0, 0], 'only the campaign list');
        eq([f.ad().spend, f.ad().period.spend, f.ad().pd.dates.length, loadingPlatforms.meta], [0, 0, 30, false], 'zero numbers, not «no numbers»');
      }).then(function () { f.restore(); }, function (e) { f.restore(); throw e; });
    });

    testAsync('Meta: حالة المجموعة جت مع الإعلانات = من غير طلب المجموعات؛ والطلب الاحتياطي للمجموعات الشغّالة بس', function () {
      // فحص حقيقي ٧ نوفمبر: حساب فيه ١٠٠٠ مجموعة، ٥ صفحات في كل تحميل، وتحميل واحد وصّله لحد Meta للطلبات
      period = { preset: 'last7' };
      var f = metaFake('act_58', { nestedStatus: true });
      loadAdsForAccount('act_58');
      return sleep(80).then(function () {
        eq([f.adsets, f.ad().statusPartial, f.ad().active], [0, false, true], 'no ad set request');
        f.restore();
        clearMetaBase();
        var g = metaFake('act_59');
        loadAdsForAccount('act_59');
        return sleep(80).then(function () {
          eq([g.adsets, JSON.parse(g.adsetsParams.effective_status).indexOf('ACTIVE') > -1, JSON.parse(g.adsetsParams.effective_status).indexOf('PAUSED')], [1, true, -1], 'the fallback asks for live ad sets only');
        }).then(function () { g.restore(); }, function (e) { g.restore(); throw e; });
      }, function (e) { f.restore(); throw e; });
    });

    test('التفاصيل: سطر الأساس مبيقولش «في صفحة التنبيهات» والتنبيه ظاهر تحته', function () {
      period = { preset: 'lastMonth' };
      var r = resolvePeriodFor(BROWSER_TZ);
      var good = function (id) { return withPd(w8(id, { daily: [100, 100, 100, 100, 100, 100, 100, 40], res: week(5) }), r.since, r.until, flat(100, 5)); };
      var x = withPd(w8('x', { daily: [100, 100, 100, 100, 100, 100, 100, 40] }), r.since, r.until, flat(100, 5));
      candidates = [good('a'), good('b'), x];
      render();
      eq(basisLineOf(x, adAnalysis(x)), t('x.basisPeriodPast', { period: periodLabel() }), 'the alert is right below');
      eq(basisLineOf(candidates[0], adAnalysis(candidates[0])), t('x.basisPeriodPast', { period: periodLabel() }) + ' ' + t('x.basisPeriodNow'), 'no alert here: the pointer stays');
    });

    testAsync('Meta: لو Meta رفضت الفلتر نفسه الأرقام بتيجي زي الأول من غير تصفية — التحسين ميضيّعش رقم', function () {
      period = { preset: 'last14' };
      var f = metaFake('act_50', { rejectFilter: true });
      loadAdsForAccount('act_50');
      return sleep(4600).then(function () {
        eq([f.ad().spend > 0, f.ad().period.spend, loadingPlatforms.meta === true || f.held.length > 0], [true, 900, true], 'the week and the total came back unfiltered');
        ok(f.filters.some(function (x) { return x === null; }) && f.filters.some(function (x) { return x !== null; }), 'filtered first, then not');
        return f.pump();
      }).then(function () { eq(f.ad().pd.dates.length, 14, 'the batch retried without the filter too'); f.restore(); }, function (e) { f.restore(); throw e; });
    });

    testAsync('Meta: الأرقام متستناش تكملة الإعلانات اللي صرفت ومش في الدفعة — بتظهر أول، والمتوقف بينضاف بعدها', function () {
      var hadFB = 'FB' in window, prevFB = window.FB, release = null;
      var restore = function () { if (hadFB) window.FB = prevFB; else delete window.FB; };
      var live = { id: 'L1', name: 'L', effective_status: 'ACTIVE', created_time: '2026-01-01T00:00:00+0000', adset: { id: 's', optimization_goal: 'OFFSITE_CONVERSIONS' }, campaign: { id: 'c', name: 'C' }, creative: {} };
      var gone = Object.assign({}, live, { id: 'G1', effective_status: 'PAUSED' });
      var day = shiftKey(todayKeyInTz('UTC'), -1);
      var row = function (id) { return { ad_id: id, date_start: day, spend: '50', actions: [{ action_type: 'omni_purchase', value: '1' }] }; };
      window.FB = { api: function (path, a, b, c) {
        var p = typeof a === 'object' ? a : (typeof b === 'object' ? b : {}), cb = [a, b, c].filter(function (x) { return typeof x === 'function'; })[0], reply = { data: [] };
        if (/\/ads$/.test(path)) reply = { data: [live] };
        if (/insights$/.test(path) && p.level === 'campaign') reply = { data: [{ campaign_id: 'c' }] };
        if (/insights$/.test(path) && /actions/.test(p.fields || '') && p.level !== 'campaign') reply = { data: [row('L1'), row('G1')] };
        // تكملة الإعلانات بالأرقام (Batch): الرد ممسوك لحد ما الاختبار يسيبه
        if (p.batch) { release = function () { cb([{ code: 200, body: JSON.stringify(gone) }]); }; return; }
        setTimeout(function () { cb(reply); }, 0);
      } };
      accountInfo['meta:act_49'] = { timeZone: 'UTC', currency: 'SAR' };
      // سجل التعديلات بعد التكملة: بيتربط بالكروت الموجودة ساعتها
      var realEdits = window.loadAdEdits, editsSaw = null;
      window.loadAdEdits = function () { editsSaw = candidates.map(function (c) { return c.id; }).sort(); return Promise.resolve(); };
      var restore0 = restore; restore = function () { restore0(); window.loadAdEdits = realEdits; };
      loadAdsForAccount('act_49');
      return sleep(80).then(function () {
        ok(release, 'the filling request is on its way');
        eq(editsSaw, null, 'the edit log waits for the filling');
        eq([candidates.map(function (c) { return c.id; }), numbersPending.meta, loadingPlatforms.meta], [['L1'], false, true], 'numbers are out, the page is not locked');
        ok(statusText().indexOf(t('s.metaDaysLoading')) > -1, statusText());
        release();
        return sleep(80);
      }).then(function () {
        eq([candidates.map(function (c) { return c.id; }).sort(), loadingPlatforms.meta], [['G1', 'L1'], false], 'the stopped ad joined');
        eq(editsSaw, ['G1', 'L1'], 'the edit log sees every ad');
        restore();
      }, function (e) { restore(); throw e; });
    });

    testAsync('Meta: خطأ غير متوقع في تكملة الإعلانات أو أيام الفترة ميعلّقش التحميل', function () {
      // الأرقام ظاهرة والحالة «جارٍ الاستكمال» — لو الخطوة دي وقعت الحالة كانت هتفضل كده على طول، وسجل المشكلات مستنيها
      period = { preset: 'last14' };
      var realFetch = window.fetchMetaAdsByIds, realChunks = window.metaPeriodChunks;
      window.fetchMetaAdsByIds = function () { throw new Error('boom'); };
      window.metaPeriodChunks = function () { return Promise.reject(new Error('boom')); };
      var f = metaFake('act_51', { missing: true });
      var done = function () { window.fetchMetaAdsByIds = realFetch; window.metaPeriodChunks = realChunks; f.restore(); };
      loadAdsForAccount('act_51');
      return sleep(120).then(function () {
        ok(!loadingPlatforms.meta, 'loading ended: ' + statusText());
        ok(statusText().indexOf(t('note.periodDaily')) > -1, statusText());
        eq([f.ad().pd, f.ad().period.spend], [null, 900], 'the numbers stay');
      }).then(done, function (e) { done(); throw e; });
    });

    testAsync('Meta: زيارة الفترة تاني — أيام النسخة المحفوظة بتفضل لحد ما الجديدة توصل، فالحكم مبيقلبش', function () {
      period = { preset: 'last30' };
      var f = metaFake('act_42');
      loadAdsForAccount('act_42');
      return sleep(80).then(function () { return f.pump(); }).then(function () {
        ok(f.ad().pd, 'first visit: days arrived');
        loadAdsForAccount('act_42');
        return sleep(80);
      }).then(function () {
        var c = f.ad();
        eq([f.held.length, !!c.pd, c.pd && c.pd.dates.length], [4, true, 30], 'still the saved days while the new ones load');
        return f.pump();
      }).then(function () { f.restore(); }, function (e) { f.restore(); throw e; });
    });

    testAsync('Meta: دفعة فشلت مرتين = الأرقام للفترة والتقييم على آخر ٧ أيام والحالة بتقول كده، ومرة واحدة بتتعاد', function () {
      period = { preset: 'last14' };
      var f = metaFake('act_43');
      loadAdsForAccount('act_43');
      return sleep(80).then(function () {
        eq(f.held.length, 1, 'seven days before the week = one batch');
        return f.pump(true);
      }).then(function () { return sleep(1600); }).then(function () {
        eq(f.held.length, 1, 'one more try');
        return f.pump(true);
      }).then(function () {
        var c = f.ad();
        eq([c.pd, c.period.spend, !!judgedOnPeriod(c)], [null, 900, false]);
        ok(statusText().indexOf(t('note.periodDaily')) > -1 && !loadingPlatforms.meta, statusText());
      }).then(function () { f.restore(); }, function (e) { f.restore(); throw e; });
    });

    testAsync('Meta: طلب الأسبوع رجع من غير نوافذ النسب = الأيام مبتتخلطش بأساسين، والحالة بتقول كده', function () {
      period = { preset: 'last14' };
      var f = metaFake('act_45', { weekNoWindows: true });
      loadAdsForAccount('act_45');
      return sleep(1800).then(function () { return f.pump(); }).then(function () {
        var c = f.ad();
        eq([c.pd, c.period.spend, !!judgedOnPeriod(c)], [null, 900, false]);
        ok(statusText().indexOf(t('note.periodDaily')) > -1, statusText());
      }).then(function () { f.restore(); }, function (e) { f.restore(); throw e; });
    });

    testAsync('Meta: الأيام وصلت والمتوقفة لسه جاية = الحالة بتفضل تقول إنها بتتحمّل، ومبتخلّصش قبلها', function () {
      period = { preset: 'last14' };
      var f = metaFake('act_46', { holdStopped: true });
      loadAdsForAccount('act_46');
      return sleep(80).then(function () {
        stoppedLoaders.meta();
        return sleep(40);
      }).then(function () { return f.pump(); }).then(function () {
        ok(f.ad().pd, 'the days are in');
        ok(statusText().indexOf(t('s.metaStoppedLoading')) > -1 && loadingPlatforms.meta, statusText());
        return f.stopped();
      }).then(function () {
        ok(statusText().indexOf(t('s.metaStoppedLoading')) < 0 && !loadingPlatforms.meta, statusText());
      }).then(function () { f.restore(); }, function (e) { f.restore(); throw e; });
    });

    testAsync('Meta: تبديل الفترة مبيعيدش اللي مالوش علاقة بيها — حد Meta للطلبات وصل من كتر التبديل', function () {
      // فحص حقيقي ٧ نوفمبر: كود ١٧ / ٢٤٤٦٠٧٩ «Ad Account Has Too Many API Calls» وطلب المجموعات بدأ يفشل
      period = { preset: 'last14' };
      var f = metaFake('act_52');
      loadAdsForAccount('act_52');
      var snap = function () { return [f.adsCalls, f.adsets, f.weeks, f.reach, f.acts, f.camps.length]; };
      var first = null;
      return sleep(80).then(function () { return f.pump(); }).then(function () {
        first = snap();
        ok(first[0] >= 1 && first[1] === 1 && first[2] === 1 && first[3] === 1 && first[4] === 1 && first[5] === 1, 'first load: ' + first);
        period = { preset: 'yesterday' };
        loadAdsForAccount('act_52');
        return sleep(80);
      }).then(function () {
        eq(snap(), first, 'a narrower period: nothing but its total');
        eq(f.totals, 2, 'its own total');
        period = { preset: 'last30' };
        loadAdsForAccount('act_52');
        return sleep(80).then(function () { return f.pump(); });
      }).then(function () {
        var s = snap();
        eq(s.slice(0, 5), first.slice(0, 5), 'a wider period: the same base');
        eq(s[5], 2, 'a wider campaign list');
        eq(f.ad().pd.dates.length, 30, 'and its days');
        // زرار التحديث بيجيب كل حاجة من جديد
        refreshAll();
        return sleep(80).then(function () { return f.pump(); });
      }).then(function () {
        eq(snap().slice(1, 5), [2, 2, 2, 2], 'refresh: everything again');
        // والنسخة بتخلص بعد ١٠ دقايق
        var realNow = Date.now, base = Date.now();
        Date.now = function () { return base + 11 * 60 * 1000; };
        loadAdsForAccount('act_52');
        Date.now = realNow;
        return sleep(80).then(function () { return f.pump(); });
      }).then(function () {
        eq(snap().slice(1, 4), [3, 3, 3], 'after 10 minutes: fresh');
        // وفصل Meta بيمسحه
        disconnectPlatform('meta', true);
        loadAdsForAccount('act_52');
        return sleep(80).then(function () { return f.pump(); });
      }).then(function () {
        eq(snap()[1], 4, 'disconnecting clears it');
      }).then(function () { f.restore(); }, function (e) { f.restore(); throw e; });
    });

    test('Meta: صورة الإعلان بتتطلب مرة واحدة حتى لو الإعلان اتحمّل تاني في فترة تانية', function () {
      var hadFB = 'FB' in window, prevFB = window.FB, calls = 0;
      window.FB = { api: function (path, params, cb) { if (/adimages$/.test(path)) calls++; cb({ data: [] }); } };
      var ad1 = { id: 'i1', creative: { image_hash: 'h1' } }, done = 0;
      try {
        resolveMetaImages('act_1', [ad1], function () { done++; });
        resolveMetaImages('act_1', [ad1], function () { done++; });
      } finally { if (hadFB) window.FB = prevFB; else delete window.FB; }
      eq([calls, done], [1, 2], 'asked once, both callers told');
    });

    testAsync('Meta: فترة فيها النهارده بتجيب أرقام الأسبوع من جديد — «اليوم» لازم يكون آخر ما وصل', function () {
      period = { preset: 'last7' };
      var f = metaFake('act_53');
      loadAdsForAccount('act_53');
      return sleep(80).then(function () {
        eq(f.weeks, 1);
        period = { preset: 'today' };
        loadAdsForAccount('act_53');
        return sleep(80);
      }).then(function () {
        eq([f.weeks, f.adsets], [2, 1], 'the week again, the rest kept');
      }).then(function () { f.restore(); }, function (e) { f.restore(); throw e; });
    });

    testAsync('Meta: طلب أساسي فشل مبيتحفظش — التبديل اللي بعده بيجرّب تاني', function () {
      period = { preset: 'last14' };
      var f = metaFake('act_54', { weekNoWindows: true });
      loadAdsForAccount('act_54');
      return sleep(1800).then(function () { return f.pump(); }).then(function () {
        var before = f.weeks;
        period = { preset: 'yesterday' };
        loadAdsForAccount('act_54');
        return sleep(1800).then(function () { ok(f.weeks > before, 'tried again: ' + before + ' -> ' + f.weeks); });
      }).then(function () { f.restore(); }, function (e) { f.restore(); throw e; });
    });

    testAsync('Meta: طلب المجموعات فشل بحد الطلبات = آخر حالة ناجحة، ومبيتحفظش الفشل', function () {
      period = { preset: 'last7' };
      var f = metaFake('act_55');
      loadAdsForAccount('act_55');
      return sleep(80).then(function () {
        eq([f.ad().statusPartial, f.adsets], [false, 1], 'the ad set status is known');
        f.restore();
        clearMetaBase();
        var g = metaFake('act_55', { adsetsDown: true });
        loadAdsForAccount('act_55');
        return sleep(80).then(function () {
          eq([g.adsets, g.ad().statusPartial], [2, false], 'both tries failed: the last known status, not «unreadable» on every ad');
        }).then(function () { g.restore(); }, function (e) { g.restore(); throw e; });
      }, function (e) { f.restore(); throw e; });
    });

    testAsync('Meta: إعلان ليه مبيعات في الفترة من غير إنفاق بيتكمّل — مجموع الكروت = الملخص، ومبيتطلبش تاني في الفترة اللي بعدها', function () {
      var hadFB = 'FB' in window, prevFB = window.FB, batches = 0;
      var restore = function () { if (hadFB) window.FB = prevFB; else delete window.FB; };
      var live = { id: 'L2', name: 'L', effective_status: 'ACTIVE', created_time: '2026-01-01T00:00:00+0000', adset: { id: 's', optimization_goal: 'OFFSITE_CONVERSIONS' }, campaign: { id: 'c', name: 'C' }, creative: {} };
      var late = Object.assign({}, live, { id: 'S2', effective_status: 'PAUSED' });
      var day = shiftKey(todayKeyInTz('UTC'), -1);
      window.FB = { api: function (path, a, b, c) {
        var p = typeof a === 'object' ? a : (typeof b === 'object' ? b : {}), cb = [a, b, c].filter(function (x) { return typeof x === 'function'; })[0], reply = { data: [] };
        if (/\/ads$/.test(path)) reply = { data: [live] };
        if (/insights$/.test(path) && p.level === 'campaign') reply = { data: [{ campaign_id: 'c' }] };
        if (/insights$/.test(path) && /actions/.test(p.fields || '') && p.level !== 'campaign') reply = { data: [{ ad_id: 'L2', date_start: day, spend: '50' }, { ad_id: 'S2', date_start: day, spend: '0', action_values: [{ action_type: 'omni_purchase', value: '700' }] }] };
        if (p.batch) { batches++; reply = [{ code: 200, body: JSON.stringify(late) }]; }
        setTimeout(function () { cb(reply); }, 0);
      } };
      accountInfo['meta:act_56'] = { timeZone: 'UTC', currency: 'SAR' };
      period = { preset: 'lastMonth' };
      loadAdsForAccount('act_56');
      return sleep(120).then(function () {
        eq([candidates.map(function (c) { return c.id; }).sort(), batches], [['L2', 'S2'], 1], 'the late-sale ad has a card');
        period = { preset: 'last14' };
        loadAdsForAccount('act_56');
        return sleep(120);
      }).then(function () {
        eq([candidates.map(function (c) { return c.id; }).sort(), batches], [['L2', 'S2'], 1], 'kept from the earlier period, not fetched again');
        restore();
      }, function (e) { restore(); throw e; });
    });

    testAsync('Meta: «آخر ٧ أيام» من غير طلب أيام، و«أمس» و«اليوم» من طلب الأسبوع نفسه من غير أي طلب زيادة', function () {
      period = { preset: 'last7' };
      var f = metaFake('act_44');
      loadAdsForAccount('act_44');
      return sleep(80).then(function () {
        eq([f.weeks, f.totals, f.ranges.length, f.ad().pd], [1, 1, 0, null], 'last 7 days');
        period = { preset: 'yesterday' };
        loadAdsForAccount('act_44');
        return sleep(80);
      }).then(function () {
        var d = f.ad(), y = shiftKey(todayKeyInTz('UTC'), -1);
        eq([f.ranges.length, d.pd.dates, d.pd.spend, d.period.spend], [0, [y], [10], 10], 'yesterday: from the week');
        period = { preset: 'today' };
        loadAdsForAccount('act_44');
        return sleep(80);
      }).then(function () {
        var d = f.ad();
        eq([f.ranges.length, d.pd.dates, d.period.spend], [0, [todayKeyInTz('UTC')], 10], 'today: from the week, no extra days');
      }).then(function () { f.restore(); }, function (e) { f.restore(); throw e; });
    });

    testAsync('Snapchat (الخادم): الفترة يوم بيوم على دفعات ٢٨ يوم ورا بعض، متجمّعة في رد واحد بنفس شكل الأسبوع', function () {
      var realFetch = window.fetch, starts = [];
      var json = function (obj) { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(obj); } }); };
      window.fetch = function (url) {
        var u = String(url);
        if (/\/adaccounts\/[^/?]+$/.test(u)) return json({ adaccounts: [{ adaccount: { timezone: 'UTC', currency: 'USD' } }] });
        if (/\/ads\?/.test(u)) return json({ ads: [{ ad: { id: 'a1', status: 'ACTIVE' } }] });
        if (/\/adsquads/.test(u)) return json({ adsquads: [] });
        if (/\/campaigns/.test(u)) return json({ campaigns: [] });
        if (/\/stats/.test(u)) {
          var q = new URL(u, 'https://x.example').searchParams, from = (q.get('start_time') || '').slice(0, 10), to = (q.get('end_time') || '').slice(0, 10);
          if (q.get('granularity') === 'DAY' && /^spend,swipes/.test(q.get('fields') || '')) starts.push(from + '>' + to);
          return json({ timeseries_stats: [{ timeseries_stat: { breakdown_stats: { ad: [{ id: 'a1', timeseries: [{ start_time: from + 'T00:00:00.000Z', stats: { spend: 1000000 } }] }] } } }] });
        }
        return json({});
      };
      var out = null;
      var res = { setHeader: function () {}, status: function () { return this; }, json: function (b) { out = b; return this; }, end: function () {} };
      var since = shiftKey(TODAY, -45), until = shiftKey(TODAY, -6), mid = shiftKey(since, 28);   // ٤٠ يوم = ٢٨ + ١٢
      return import('/api/snapchat-ads-fetch.js').then(function (m) {
        return m.default({ method: 'POST', headers: {}, body: { accessToken: 't', action: 'ads', adAccountId: 'acc1', period: { preset: 'custom', since: since, until: until } } }, res);
      }).then(function () {
        window.fetch = realFetch;
        ok(starts.indexOf(since + '>' + mid) > -1 && starts.indexOf(mid + '>' + shiftKey(until, 1)) > -1, starts.join(' | '));
        var ts = out.periodStats.timeseries_stats[0].timeseries_stat.breakdown_stats.ad[0].timeseries;
        eq(ts.map(function (x) { return x.start_time.slice(0, 10); }), [since, mid], 'one reply with both batches');
        eq([out.period.since, out.period.until], [since, until]);
      }, function (e) { window.fetch = realFetch; throw e; });
    });

    testAsync('TikTok (الخادم): الفترة يوم بيوم على دفعات ٣٠ يوم ورا بعض (حد TikTok للتقرير اليومي)', function () {
      var realFetch = window.fetch, daily = [];
      var ok0 = function (data) { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ code: 0, data: data }); } }); };
      window.fetch = function (url) {
        var u = String(url), q = new URL(u).searchParams;
        if (u.indexOf('/advertiser/info/') > -1) return ok0({ list: [{ name: 'T', timezone: 'UTC', currency: 'USD' }] });
        if (u.indexOf('/ad/get/') > -1) return ok0({ list: [{ ad_id: '9', operation_status: 'ENABLE' }], page_info: { total_page: 1 } });
        if (u.indexOf('/report/integrated/get/') > -1) {
          var dims = JSON.parse(q.get('dimensions') || '[]'), metrics = JSON.parse(q.get('metrics') || '[]');
          if (dims.indexOf('stat_time_day') > -1 && metrics.indexOf('cost_per_conversion') < 0) daily.push(q.get('start_date') + '>' + q.get('end_date'));
          return ok0({ list: [{ dimensions: { ad_id: '9', stat_time_day: q.get('start_date') + ' 00:00:00' }, metrics: { spend: '1.00', conversion: '1' } }], page_info: { total_page: 1 } });
        }
        return ok0({ list: [] });
      };
      var out = null;
      var res = { setHeader: function () {}, status: function () { return this; }, json: function (b) { out = b; return this; }, end: function () {} };
      var since = shiftKey(TODAY, -45), until = shiftKey(TODAY, -6), mid = shiftKey(since, 30);   // ٤٠ يوم = ٣٠ + ١٠
      return import('/api/tiktok-ads-fetch.js').then(function (m) {
        return m.default({ method: 'POST', headers: {}, body: { accessToken: 't', advertiserId: '123', period: { preset: 'custom', since: since, until: until } } }, res);
      }).then(function () {
        window.fetch = realFetch;
        eq(daily, [since + '>' + shiftKey(since, 29), mid + '>' + until], 'two batches in turn');
        eq(out.periodDaily.map(function (r) { return r.dimensions.stat_time_day.slice(0, 10); }), [since, mid], 'one list');
      }, function (e) { window.fetch = realFetch; throw e; });
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
