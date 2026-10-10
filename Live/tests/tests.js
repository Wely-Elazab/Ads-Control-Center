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
    test('آخر ٣٠ يوم = ٣٠ يوماً مكتملة + اليوم', function () {
      period = { preset: 'last30' };
      var r = resolvePeriodFor('UTC');
      eq([keyDiffDays(r.since, r.until), r.until], [30, today]);
    });
    test('آخر ٧ أيام = ٧ أيام مكتملة + اليوم (ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦)', function () {
      period = { preset: 'last7' };
      var r = resolvePeriodFor('UTC');
      eq([keyDiffDays(r.since, r.until), r.until, r.isDefault], [7, today, true]);
      var w = last7Days(today);
      eq([w.length, w[0].key, w[7].key], [8, r.since, today], 'ad window = same 8 days');
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

  // «الأقرب للمتجر» في Snapchat (قرار ٦ أكتوبر ٢٠٢٦): ٧ أيام من السوايب ومن غير المشاهدة، بطلب منفصل جنب رقم المنصة
  describe('أرقام Snapchat — الأقرب للمتجر', function () {
    var days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'].map(function (k) { return { key: k }; });
    var M = 1000000;
    var series = function (rows) {
      return [{ timeseries_stat: { breakdown_stats: { ad: Object.keys(rows).map(function (id) {
        return { id: id, timeseries: rows[id].map(function (r) { return { start_time: days[r[0]].key + 'T00:00:00.000+03:00', stats: r[1] }; }) };
      }) } } }];
    };
    var totals = function (rows) {
      return { total_stats: [{ total_stat: { breakdown_stats: { ad: Object.keys(rows).map(function (id) { return { id: id, stats: rows[id] }; }) } } }] };
    };
    var ads = [{ ad: { id: 'a1', name: 'Snap ad 1', status: 'ACTIVE' } }];
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
    });
    test('«الأقرب للمتجر» مبيطلعش أكبر من رقم المنصة في أي يوم', function () {
      var c = transformSnapchatAds(ads, plat, days, 'SAR', [], [], null, series({ a1: [[5, { conversion_purchases: 12, conversion_purchases_value: 1200 * M }]] }), null)[0];
      eq([c.dailyResults[5], c.dailySales[5], c.dailyResults[6]], [10, 1000, 0]);
    });
    test('طلب «الأقرب للمتجر» فشل = أرقام المنصة زي الأول ومن غير مقارنة', function () {
      var c = transformSnapchatAds(ads, plat, days, 'SAR', [], [], null, null, null)[0];
      eq([c.results, c.plat, platOf(c)], [14, null, null]);
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
    test('تفاصيل إعلان Snapchat: جدول المقارنة، والكارت برا بـ«الأقرب للمتجر» بس', function () {
      var prev = candidates;
      var c = transformSnapchatAds(ads, plat, days, 'SAR', [], [], null, store, null)[0];
      try {
        candidates = [c];
        render();
        var card = document.getElementById('card-' + c.id);
        ok(card && card.textContent.indexOf(fmtNum(9)) > -1 && card.textContent.indexOf(fmtNum(14)) === -1, 'card shows our number only');
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
    test('شرح المقارنة من غير أي كلام تقني', function () {
      ['ar', 'en'].forEach(function (lang) {
        var all = withLang(lang, function () { return ['cmp.note', 'cmp.noteSame', 'cmp.noteZero', 'cmp.noteNone', 'al.compare', 'diff.source'].map(function (k) { return t(k); }).join(' '); });
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
      });
    });

    testAsync('السيرفر: طلب «الأقرب للمتجر» بنوافذ ٧ أيام سوايب ومن غير مشاهدة، ولو رجع بنوافذ تانية بيتجاهل', function () {
      var realFetch = window.fetch, urls = [], echo = '7_DAY';
      window.fetch = function (url) {
        var u = String(url); urls.push(u);
        if (/\/adaccounts\/[^/?]+$/.test(u)) return json({ adaccounts: [{ adaccount: { timezone: 'UTC', currency: 'USD' } }] });
        if (/\/ads\?/.test(u)) return json({ ads: [{ ad: { id: 'a1' } }] });
        if (/\/stats/.test(u) && /swipe_up_attribution_window/.test(u)) {
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
        var windowed = urls.filter(function (u) { return /swipe_up_attribution_window/.test(u); });
        eq(windowed.length, 1, 'one store request for the last 7 days');
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

    testAsync('السيرفر: ملخص المتجر على «الأقرب للمتجر»، ولو Snapchat رفض النوافذ بيكمّل كله بنوافذ المنصة', function () {
      var realFetch = window.fetch, urls = [], reject = false;
      var st = { spend: 50000000, impressions: 1000, swipes: 30, conversion_purchases: 3, conversion_purchases_value: 300000000 };
      window.fetch = function (url) {
        var u = String(url);
        if (/\/adaccounts\/[^/?]+$/.test(u)) return json({ adaccounts: [{ adaccount: { timezone: 'Asia/Riyadh', currency: 'SAR' } }] });
        if (/\/campaigns\?/.test(u)) return json({ campaigns: [] });
        if (/\/stats/.test(u)) {
          urls.push(u);
          if (reject && /swipe_up_attribution_window/.test(u)) {
            return Promise.resolve({ ok: false, status: 400, json: function () { return Promise.resolve({ request_status: 'ERROR', debug_message: 'bad param' }); } });
          }
          var from = decodeURIComponent((u.match(/start_time=([^&]+)/) || [])[1] || '').slice(0, 10);
          var to = decodeURIComponent((u.match(/end_time=([^&]+)/) || [])[1] || '').slice(0, 10);
          var inRange = /granularity=DAY/.test(u) && '2026-09-25' >= from && '2026-09-25' < to;
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
      return run().then(function (out) {
        eq(windowed(), urls.length, 'every summary request uses the store windows');
        eq(out.daily.filter(function (d) { return d.date === '2026-09-25'; })[0].pur, 3);
        reject = true;
        return run();
      }).then(function (out) {
        window.fetch = realFetch;
        eq(windowed(), 1, 'one rejected try, then the platform windows for everything');
        eq(out.daily.filter(function (d) { return d.date === '2026-09-25'; })[0].pur, 3, 'the summary still works');
      }, function (e) { window.fetch = realFetch; throw e; });
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
      var c = transformGoogleRows(adRows, plat, DAYS, 'SAR', null, store, null)[0];
      eq([c.results, c.dailySales[5] + c.dailySales[6], c.spend, c.resultKey], [9, 900, 150, 'conversion']);
      eq(c.plat, { results: 14, sales: 1400 });
      var pp = platOf(c);
      eq([pp.results, pp.sales, pp.spend], [14, 1400, 150]);
    });
    test('«الأقرب للمتجر» مبيطلعش أكبر من رقم المنصة، والكسور بتتجمع قبل التقريب', function () {
      var c = transformGoogleRows(adRows, plat, DAYS, 'SAR', null, [day(5, { conversions: 12, conversionsValue: 1200 }), day(6, { conversions: 0.6, conversionsValue: 60 })], null)[0];
      eq([c.dailyResults[5], c.dailySales[5], c.dailyResults[6], c.results], [10, 1000, 1, 11]);
    });
    test('طلب «الأقرب للمتجر» فشل = أرقام المنصة زي الأول ومن غير مقارنة', function () {
      var c = transformGoogleRows(adRows, plat, DAYS, 'SAR', null, null, null)[0];
      eq([c.results, c.plat, platOf(c)], [14, null, null]);
    });
    test('الفترة المختارة: «الأقرب للمتجر» ورقم المنصة جنبه، ولو طلبها فشل رقم المنصة من غير مقارنة', function () {
      var pPlat = [Object.assign({ metrics: { costMicros: String(300 * M), conversions: 20, conversionsValue: 2000 } }, who)];
      var pStore = [Object.assign({ metrics: { conversions: 15, conversionsValue: 1500 } }, who)];
      var c = transformGoogleRows(adRows, plat, DAYS, 'SAR', pPlat, store, pStore)[0];
      eq([c.period.results, c.period.sales, c.period.spend], [15, 1500, 300]);
      var pp = platOf(c);
      eq([pp.results, pp.sales], [20, 2000]);
      var c2 = transformGoogleRows(adRows, plat, DAYS, 'SAR', pPlat, store, null)[0];
      eq([c2.period.results, c2.period.plat, platOf(c2)], [20, undefined, null]);
    });
    test('حملات Performance Max: نفس المقارنة', function () {
      var camp = { id: '21', name: 'PMax', status: 'ENABLED', primaryStatus: 'ELIGIBLE' };
      var rows = [{ campaign: camp, segments: { date: KEYS[5] }, metrics: { costMicros: String(80 * M), conversions: 8, conversionsValue: 800 } }];
      var p = transformGooglePmax(rows, null, DAYS, 'SAR', [{ campaign: { id: '21' }, segments: { date: KEYS[5] }, metrics: { conversions: 5, conversionsValue: 500 } }], null)[0];
      eq([p.results, p.dailySales[5], p.plat], [5, 500, { results: 8, sales: 800 }]);
      eq(transformGooglePmax(rows, null, DAYS, 'SAR', null, null)[0].plat, null);
    });

    // عدد الطلبات صحيح دايماً (قرار ٦ أكتوبر ٢٠٢٦): Google بيرجّع كسور، والأداة بتقسم الإجمالي المقرّب على الإعلانات والأيام
    var adN = function (i) { return { adGroup: { id: 'g' + i, name: 'AG', status: 'ENABLED' }, adGroupAd: { ad: { id: String(i), name: 'Ad ' + i }, status: 'ENABLED' }, campaign: { id: '3', name: 'S', status: 'ENABLED' } }; };
    var rowN = function (i, d, conv) { return { adGroup: { id: 'g' + i }, adGroupAd: { ad: { id: String(i) } }, segments: { date: KEYS[d] }, metrics: { costMicros: String(10 * M), conversions: conv, conversionsValue: conv * 100 } }; };
    test('الطلبات أعداد صحيحة: الكسور مبتضيعش من إجمالي الحساب', function () {
      eq(wholeShares([0.4, 0.4, 0.4], 1), [1, 0, 0]);
      eq(wholeShares([0.45, 0.55], 1, [0, 1]), [0, 1], 'the cap is respected');
      var ids = []; for (var i = 0; i < 30; i++) ids.push(i);
      var list = googleWholeOrders(transformGoogleRows(ids.map(adN), ids.map(function (i) { return rowN(i, 5, 0.4); }), DAYS, 'SAR', null, null, null));
      var total = list.reduce(function (s, c) { return s + c.results; }, 0);
      eq(total, 12, '30 × 0.4 = 12 orders, not 0');
      ok(list.every(function (c) { return c.results === Math.floor(c.results) && c._raw === undefined; }), 'whole numbers, raw values removed');
      ok(list.every(function (c) { return c.dailyResults.reduce(function (a, b) { return a + b; }, 0) === c.results; }), 'days add up to the ad');
    });
    test('أيام الإعلان مجموعها = إجمالي الإعلان، و«الأقرب للمتجر» مبيعدّيش رقم المنصة بعد التقريب', function () {
      var days7 = [0, 1, 2, 3, 4, 5, 6].map(function (d) { return rowN(1, d, 0.4); });
      var one = googleWholeOrders(transformGoogleRows([adN(1)], days7, DAYS, 'SAR', null, null, null))[0];
      eq([one.results, one.dailyResults.reduce(function (a, b) { return a + b; }, 0)], [3, 3], '7 × 0.4 → 3, not 0 per day');
      var pl = [rowN(1, 5, 0.45), rowN(2, 5, 0.55)];
      var st = [rowN(1, 5, 0.45), rowN(2, 5, 0.3)];
      var two = googleWholeOrders(transformGoogleRows([adN(1), adN(2)], pl, DAYS, 'SAR', null, st, null));
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
        eq(storeQ.length, 2, 'ads + PMax for the last 7 days');
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

    // «الأقرب للمتجر» (قرار ٦ أكتوبر ٢٠٢٦): الأساس = نقرة خلال ٧ أيام، ورقم المنصة (value) للمقارنة بس.
    // Meta بتشيل النوافذ اللي قيمتها صفر — يوم كل نتايجه من المشاهدة = «نقرة ٧ أيام» صفر
    test('الأقرب للمتجر = النقرة خلال ٧ أيام، ورقم المنصة جنبه للمقارنة', function () {
      var rows = [
        { date_start: KEYS[5], spend: '50', actions: [{ action_type: 'omni_purchase', value: '5', '7d_click': '3', '1d_view': '2' }],
          action_values: [{ action_type: 'omni_purchase', value: '500', '7d_click': '300', '1d_view': '200' }] },
        { date_start: KEYS[6], spend: '50', actions: [{ action_type: 'omni_purchase', value: '2', '1d_view': '2' }],
          action_values: [{ action_type: 'omni_purchase', value: '200', '1d_view': '200' }] }
      ];
      var c = transformRealAd(baseAd(), rows, {}, DAYS, null, 'SAR', null, null);
      eq([c.results, c.dailyResults[5], c.dailyResults[6], sumArr(c.dailySales), c.roas], [3, 3, 0, 300, 3]);
      eq(c.plat, { results: 7, sales: 700 });
    });
    test('الأقرب للمتجر مش أكتر من رقم المنصة، ومن غير نوافذ = رقم المنصة ومفيش مقارنة', function () {
      var narrow = [{ date_start: KEYS[6], spend: '30', actions: [{ action_type: 'omni_purchase', value: '1', '7d_click': '2' }] }];
      eq(transformRealAd(baseAd(), narrow, {}, DAYS, null, 'SAR', null, null).results, 1, 'ad set uses a narrower window');
      var old = [{ date_start: KEYS[6], spend: '30', actions: [{ action_type: 'omni_purchase', value: '4' }] }];
      var c = transformRealAd(baseAd(), old, {}, DAYS, null, 'SAR', null, null);
      eq([c.results, c.plat], [4, null], 'no windows returned');
      eq(platOf(c), null);
    });
    test('عمود Results بتاع Meta: نوع النتيجة منه، والأقرب للمتجر من actions لنفس النوع', function () {
      var rows = [{ date_start: KEYS[6], spend: '40',
        results: [{ indicator: 'actions:offsite_conversion.fb_pixel_purchase', values: [{ value: '4', attribution_windows: ['7d_click'] }, { value: '6', attribution_windows: ['default'] }] }],
        actions: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '6', '7d_click': '4', '1d_view': '2' }] }];
      var c = transformRealAd(baseAd(), rows, {}, DAYS, null, 'SAR', null, null);
      eq([c.resultKey, c.results, c.plat.results], ['purchase', 4, 6]);
    });
    test('الفترة المختارة: الأقرب للمتجر في الكارت، ورقم المنصة في platOf بنفس الإنفاق', function () {
      var periodRow = { spend: '200', actions: [{ action_type: 'omni_purchase', value: '10', '7d_click': '8', '1d_view': '2' }],
        action_values: [{ action_type: 'omni_purchase', value: '1000', '7d_click': '800', '1d_view': '200' }] };
      var c = transformRealAd(baseAd(), [], {}, DAYS, null, 'SAR', null, periodRow);
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
        eq(calls.map(function (c) { return c.path + ' ' + (c.w ? 'w' : '-'); }),
          ['/act_1/insights w', '/act_1/insights -', '/act_1/ads -', '/act_bad/insights w', '/act_bad/insights -']);
        eq(calls[0].w, windows);
        ok(res.every(function (r) { return !r.err && r.data.length === 1; }), 'every request ends with data');
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
      // ولا نتيجة طول الأسبوع = الحكم على الأسبوع كله (٦٠٠ ÷ ٣٠ = ٢٠ — المنصوب مع ١١–٩٩)
      var waste = details(engine(base.concat([ad('w1', { daily: steady(100), res: steady(0), key: 'lead' })])), 'w1');
      ok(waste.indexOf('دون أي عملاء محتملين') > -1 && waste.indexOf('لنحو ٢٠ عميلاً محتملاً') > -1, waste);
      // نتائج قبل كده في الأسبوع ويومين من غير = قاعدة آخر يومين (٢٠٠ ÷ ~٢٣ ≈ ٩ — المجرور بعد ٣–١٠)
      var dry2 = details(engine(base.concat([ad('w2', { daily: steady(100), res: [5, 5, 5, 5, 0, 0, 0], key: 'lead' })])), 'w2');
      ok(dry2.indexOf('خلال آخر يومين') > -1 && dry2.indexOf('نحو ٩ عملاء محتملين') > -1, dry2);
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
    test('خسارة (العائد أقل من ١ في آخر ٣ أيام) = عاجل', function () {
      var ads = baseAccount().concat([ad('loss', { daily: [100, 100, 100, 100, 100, 100, 20], res: steady(5), sales: [300, 300, 300, 50, 50, 50, 0] })]);
      var r = engine(ads);
      var i = issuesOf(r, 'loss').filter(function (x) { return x.code === 'loss'; })[0];
      ok(i && i.level === 'critical', 'loss alert');
      ok(i.detail.indexOf('آخر ٣ أيام') > -1 && i.detail.indexOf(money(300, 'SAR')) > -1, i.detail);
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
    test('تكلفة النتيجة العالية: نتيجتين بس = مفيش حكم، وفرق واضح بعدد كافٍ = عاجل (حالة حقيقية)', function () {
      // ٣ إعلانات في حساب حقيقي: ~٣٠–٣٧ في الأسبوع ونتيجتين لكل واحد، والمتوسط ~٧ — كانت بتطلع «عاجل»
      var few = ad('few', { daily: [7, 5.97, 3.78, 4.45, 4.72, 7.56, 3.71], res: [0, 1, 0, 0, 0, 1, 0] });
      var cheap = [ad('c1', { daily: steady(20), res: steady(3) }), ad('c2', { daily: steady(20), res: steady(3) })];
      ok(!issuesOf(engine(cheap.concat([few])), 'few').some(function (i) { return i.code === 'cpr'; }), 'two purchases prove nothing');
      var many = ad('many', { daily: steady(100), res: [1, 1, 2, 1, 1, 2, 2] });
      var i = issuesOf(engine(baseAccount().concat([many])), 'many').filter(function (x) { return x.code === 'cpr'; })[0];
      ok(i && i.level === 'critical', 'ten purchases at ~2.7x the average');
    });
    test('إعلان وصول بـ٥ في الأسبوع (٠٫٤٪ من الحساب) = «للعلم» بس حتى لو صرفه أكبر من تكلفة نتيجة واحدة (حالة حقيقية)', function () {
      var reach = ad('rc', { daily: [0.06, 2.01, 2.36, 0.41, 0.4, 0, 0.05], res: [66, 3021, 3532, 639, 597, 0, 94], key: 'reach' });
      var list = issuesOf(engine(baseAccount().concat([reach])), 'rc');
      ok(list.length && list.every(function (i) { return i.level === 'info' && i.minor; }), list.map(function (i) { return i.level + ':' + i.code; }).join(' '));
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
      var three = ad('th', { daily: steady(100), res: [5, 5, 5, 8, 8, 8, 3] });
      var sc = issuesOf(engine(baseAccount().concat([three])), 'th').filter(function (i) { return i.code === 'scale'; })[0];
      ok(sc && sc.detail.indexOf('آخر ٣ أيام') > -1, sc ? sc.detail : 'no scale');
    });
    test('الإعلان الصغير = "للعلم" بس', function () {
      var ads = baseAccount().concat([ad('tiny', { daily: [3, 3, 3, 3, 3, 0, 0], res: [0, 0, 0, 0, 0, 0, 0] })]);
      var r = engine(ads);
      var list = issuesOf(r, 'tiny');
      ok(list.length > 0, 'has a note');
      ok(list.filter(function (i) { return i.code !== 'underspend'; }).every(function (i) { return i.level === 'info' && i.minor && !i.atRisk; }), 'other notes are FYI');
      // ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦: نشط من أكتر من ٣ أيام وإنفاقه أقل من تكلفة نتيجة = «يحتاج إلى تحسين»
      // (لا يأخذ إنفاقاً كافياً) بدل «لم يُحكم بعد» — على الكارت بس، مش في قائمة التنبيهات
      eq([r.byAd.tiny.health, r.byAd.tiny.pending], ['improve', null]);
      ok(!r.alerts.some(function (a) { return a.adId === 'tiny' && a.code === 'underspend'; }), 'not in the alerts list');
    });
    test('لا يأخذ إنفاقاً كافياً: جاب نتيجة بإنفاق أقل من تكلفة نتيجة = «يحتاج إلى تحسين»، وفي فترة التعلّم لأ', function () {
      var low = ad('low', { daily: [2, 2, 2, 2, 2, 2, 0], res: [0, 0, 1, 0, 0, 0, 0] });
      var r = withLang('ar', function () { return engine(baseAccount().concat([low])); });
      var us = issuesOf(r, 'low').filter(function (i) { return i.code === 'underspend'; })[0];
      ok(us && us.level === 'warning' && us.quiet, 'quiet warning');
      eq(r.byAd.low.health, 'improve');
      ok(/لا يأخذ إنفاقاً كافياً/.test(us.title) && /وحقق عملية شراء واحدة/.test(us.detail), us.detail);
      var fresh = ad('fresh', { daily: [0, 0, 0, 0, 2, 2, 0], res: [0, 0, 0, 0, 1, 0, 0], age: 2 });
      eq(engine(baseAccount().concat([fresh])).byAd.fresh.health, 'pending', 'still learning');
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
      eq(a.impactText, t('al.impact', { spend: money(620, 'SAR'), pct: t('al.impactPct', { pct: ar(31) }) }));
      eq(issuesOf(r, 'waste')[0].impactText, a.impactText, 'same line in the ad details');
      ok(/alert-impact/.test(alertMarkup(a)) && alertMarkup(a).indexOf(esc(a.impactText)) > -1, 'shown on the alert card');
    });
    // التنبيهات مبنية على «الأقرب للمتجر» (results)، وتنبيهات النتائج والتكلفة والعائد بتعرض رقم المنصة جنبه (c.plat)
    test('المقارنة في التنبيه: رقم المنصة جنب الأقرب للمتجر في التنبيه وتفاصيل الإعلان وكارت التنبيه', function () {
      var w = ad('waste', { daily: [100, 100, 100, 100, 100, 100, 20], res: [5, 5, 5, 5, 0, 0, 0], sales: [500, 500, 500, 500, 0, 0, 0] });
      w.plat = { results: 31, sales: 3100 };
      var rej = ad('rej', { daily: [100, 100, 100, 100, 100, 100, 0], active: false, pausedLevel: 'rejected' });
      rej.plat = { results: 9, sales: 0 };
      var r = engine(baseAccount().concat([w, rej]));
      var a = r.alerts.filter(function (x) { return x.adId === 'waste' && x.code === 'waste'; })[0];
      var want = t('al.compare', {
        p: I18N.countPhrase(31, 'purchase', ar), pr: t('al.cmpRoas', { r: numAr(3100 / 620) }),
        s: I18N.countPhrase(20, 'purchase', ar), sr: t('al.cmpRoas', { r: numAr(2000 / 620) })
      });
      eq(a.compare, want);
      eq(issuesOf(r, 'waste').filter(function (i) { return i.code === 'waste'; })[0].compare, want, 'same line in the ad details');
      ok(alertMarkup(a).indexOf('alert-compare') > -1 && alertMarkup(a).indexOf(esc(want)) > -1, 'shown on the alert card');
      ok(!issuesOf(r, 'rej')[0].compare, 'a rejected ad has nothing to compare');
      w.plat = { results: 20, sales: 2000 };
      ok(!engine(baseAccount().concat([w])).alerts.some(function (x) { return x.compare; }), 'same numbers = no line');
      delete w.plat;
      ok(!engine(baseAccount().concat([w])).alerts.some(function (x) { return x.compare; }), 'no platform number = no line');
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
    test('الإعدادات الناقصة بتاخد قيمة النمط المختار', function () {
      eq(PauseProofAlerts.mergeSettings({ _preset: 'calm' }).minSpendShare, 0.05);
      eq(PauseProofAlerts.mergeSettings({ _preset: 'calm', minSpendShare: 0.1 }).minSpendShare, 0.1);
      eq(PauseProofAlerts.mergeSettings({}).minSpendShare, 0.02);
    });
    test('نصوص التنبيهات بالإنجليزي', function () {
      var ads = baseAccount().concat([ad('waste', { daily: [100, 100, 100, 100, 100, 100, 20], res: [5, 5, 5, 5, 0, 0, 0] })]);
      withLang('en', function () {
        var i = engine(ads).byAd.waste.issues[0];
        eq(i.title, 'Spend with no results in 2 days');
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
        ad('l1', { daily: steady(100), cid: 'k2' }), ad('l2', { daily: steady(80), cid: 'k3' })]);
      eq([health(r, 'l1'), health(r, 'l2'), health(r, 'win')], ['review', 'review', 'good']);
      ok(has(r, 'l1', 'waste-week', 'critical') && /آخر ٦ أيام/.test(r.byAd.l1.issues[0].detail), list(r, 'l1'));
    });
    test('ولا طلب طول الأسبوع بإنفاق يومي صغير (آخر يومين لوحدهم مكانوش كفاية) = عاجل', function () {
      var r = engine(baseAccount().concat([ad('dry', { daily: steady(8) })]));
      ok(has(r, 'dry', 'waste-week', 'critical'), list(r, 'dry'));
      eq(health(r, 'dry'), 'review');
    });
    test('نتيجة واحدة بإنفاق يكفي لعشرة = تكلفة مرتفعة «عاجل» (القاعدة كانت محتاجة نتيجتين)', function () {
      var r = engine(baseAccount().concat([ad('one', { daily: steady(30), res: [0, 0, 0, 0, 0, 1, 0] })]));
      ok(has(r, 'one', 'cpr', 'critical'), list(r, 'one'));
    });
    test('إعلان جديد = «لم يُحكم بعد» بسببه، وإنفاق كبير من غير نتائج وهو جديد = «مهم»', function () {
      var r = engine(baseAccount().concat([ad('n1', { daily: [0, 0, 0, 0, 0, 10, 5], age: 1 }), ad('n2', { daily: [0, 0, 0, 0, 0, 200, 100], age: 1 })]));
      eq([health(r, 'n1'), r.byAd.n1.pending], ['pending', 'learning']);
      ok(/فترة/.test(r.byAd.n1.basis) || /توزيعه/.test(r.byAd.n1.basis), r.byAd.n1.basis);
      ok(has(r, 'n2', 'waste-new', 'warning') && health(r, 'n2') === 'improve', list(r, 'n2'));
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
      // السبب مكتوب: عائده ومستهدفه، ومتوسط عائد الحساب في الفترة نفسها
      ok(/×٤/.test(r.byAd.a.basis) && /متوسط عائد إعلانات حسابك/.test(r.byAd.a.basis), r.byAd.a.basis);
    });
    test('خسارة طول الأسبوع (عائد ×٠٫٧) = عاجل «عائد أقل من التكلفة»، ومعاه عائد الحساب في الفترة نفسها', function () {
      var r = engine(salesBase().concat([ad('lose', { daily: steady(100), res: [1, 0, 1, 0, 1, 0, 0], sales: [140, 0, 140, 0, 140, 0, 0], cid: 'kd' })]));
      var i = r.byAd.lose.issues.filter(function (x) { return x.code === 'loss'; })[0];
      ok(i && i.level === 'critical' && /آخر ٦ أيام/.test(i.detail) && /في الفترة نفسها/.test(i.detail), i ? i.detail : list(r, 'lose'));
    });
    test('عائد أقل من المستهدف لكنه أحسن من متوسط الحساب = بيقول إن السبب ممكن يكون الفترة', function () {
      var weak = [ad('w1', { daily: steady(100), res: steady(2), sales: steady(120), cid: 'k1' }), ad('w2', { daily: steady(100), res: steady(2), sales: steady(120), cid: 'k2' }),
        ad('mid', { daily: steady(100), res: steady(2), sales: steady(200), cid: 'k3' })];
      var i = engine(weak).byAd.mid.issues.filter(function (x) { return x.code === 'low-roas'; })[0];
      ok(i && i.detail.indexOf(t('al.vsAccBetter').trim().slice(0, 20)) > -1, i ? i.detail : 'no low-roas');
    });
    test('المنصة نقلت إنفاقه لإعلان تاني في نفس الحملة = «للعلم»، والإعلان المربح بيفضل «جيد»', function () {
      var r = engine([ad('x', { daily: [100, 100, 100, 100, 100, 0, 0], res: [2, 2, 2, 2, 2, 0, 0], sales: [400, 400, 400, 400, 400, 0, 0], cid: 'k' }),
        ad('y', { daily: [100, 100, 100, 100, 100, 200, 150], res: [2, 2, 2, 2, 2, 4, 3], sales: [400, 400, 400, 400, 400, 800, 600], cid: 'k' }),
        ad('z', { daily: steady(100), res: [2, 2, 2, 2, 2, 2, 1], sales: steady(400), cid: 'k2' })]);
      ok(has(r, 'x', 'shift', 'info') && !has(r, 'x', 'no-spend-y'), list(r, 'x'));
      eq(health(r, 'x'), 'good');
    });
    test('أسبوع قوي وآخر ٣ أيام بخسارة = «تراجع العائد» (مهم) مش «عاجل»', function () {
      var r = engine(salesBase().concat([ad('dip', { daily: steady(100), res: [6, 6, 6, 1, 0, 1, 0], sales: [2400, 2400, 2400, 80, 0, 80, 0], cid: 'ke' })]));
      ok(has(r, 'dip', 'roas-drop', 'warning') && !has(r, 'dip', 'loss'), list(r, 'dip'));
    });
    test('الواجهة: «لم يُحكم بعد» على الكارت بسببه، والتفاصيل فيها أساس الحكم وفترته، والنصيحة «اقتراح للمراجعة»', function () {
      var fresh = ad('fresh', { daily: [0, 0, 0, 0, 0, 10, 5], age: 1 });
      var w = ad('w', { daily: steady(100), res: [5, 5, 5, 5, 0, 0, 0] });
      candidates = baseAccount().concat([fresh, w]);
      render();
      var card = document.getElementById('card-fresh');
      ok(card && card.querySelector('.health-dot.h-pending') && card.textContent.indexOf(t('pend.learning.t')) > -1, card ? card.textContent : 'no card');
      openExpand(fresh);
      ok(document.querySelector('#expandHealth .health-basis') && document.getElementById('expandHealth').textContent.indexOf(t('x.basisPeriod')) > -1, document.getElementById('expandHealth').textContent);
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
      ok(a.length === 1 && a[0].adId === 'star' && a[0].level === 'critical' && /٧٩٪/.test(a[0].detail) && /متوقف/.test(a[0].detail), JSON.stringify(a.map(function (x) { return x.detail; })));
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
    test('تفاصيل الإعلان: جدول أرقام المنصة مقابل الأقرب للمتجر، والكارت برا من غير مقارنة', function () {
      var c = ad('cmp1', { daily: steady(100), res: [10, 10, 10, 10, 10, 10, 22], sales: steady(1000) });
      c.plat = { results: 100, sales: 8750 };
      candidates = [c];
      render();
      var card = document.getElementById('card-cmp1');
      ok(card && card.textContent.indexOf(fmtNum(82)) > -1 && card.textContent.indexOf(fmtNum(100)) === -1, 'card shows our number only');
      openExpand(c);
      var box = document.querySelector('#expandMetrics .attr-compare');
      ok(box, 'comparison table');
      var rowText = function (i) { return Array.prototype.map.call(box.querySelectorAll('tbody tr')[i].children, function (x) { return x.textContent.trim(); }); };
      eq(rowText(1), [resultLabelOf(c), fmtNum(100), fmtNum(82), '−' + t('cmp.pct', { n: ar(18) })], 'orders: platform, ours, difference');
      eq(rowText(2)[3], '+' + t('cmp.pct', { n: ar(22) }), 'cost per order went up');
      ok(box.querySelectorAll('tbody tr')[2].querySelector('.cmp-worse'), 'higher cost is marked as worse');
      eq(box.querySelector('.attr-note').textContent, t('cmp.note', { head: t('cmp.head.purchase'), kept: I18N.countPhrase(82, 'order', ar),
        kv: t('cmp.noteValue', { m: money(7000, 'SAR') }), gone: I18N.countPhrase(18, 'order', ar), other: t('cmp.other'), gv: t('cmp.noteValue', { m: money(1750, 'SAR') }) }));
      expandOverlay.classList.add('hidden');
      delete c.plat;
      openExpand(c);
      ok(!document.querySelector('#expandMetrics .attr-compare') && document.querySelectorAll('#expandMetrics .metric-box').length >= 4, 'no platform number = the old boxes');
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
        eq(Array.prototype.map.call(d.querySelectorAll('[data-amount]'), function (el) { return el.textContent; }), ['٢٢٥ ر.س', '225 SAR', '٢٬٣٥٠ ر.س', '2,350 SAR'], 'sentence amounts in riyals, each in its own language');
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
        var sent = null;
        w.fetch = function (url, init) { sent = JSON.parse(init.body); return Promise.resolve(new w.Response('{"ok":true}', { status: 200 })); };
        form.requestSubmit();
        eq([sent, d.activeElement && d.activeElement.id], [null, 'jConsent'], 'consent is required before sending');
        d.getElementById('jConsent').click();
        form.requestSubmit();
        return new Promise(function (r) { setTimeout(r, 30); }).then(function () {
          ok(sent, 'sent');
          eq([sent.action, sent.role, sent.platforms, sent.fb, sent.email, sent.googleEmail, sent.consent, sent.hp], ['join', 'agency', ['meta'], 'facebook.com/test.user', 'a@b.co', '', true, '']);
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
    test('الشاشة الأساسية: الحساسية وسؤالين عن الفلوس، وباقي الحدود (ومنها فترة التعلّم) في «المتقدمة» لمسؤول الإعلانات', function () {
      renderSettingsForm();
      var adv = settingsForm.querySelector('details.settings-advanced');
      var main = Array.prototype.filter.call(settingsForm.querySelectorAll('input[type="text"]'), function (i) { return !adv.contains(i); }).map(function (i) { return i.name; });
      eq(main, ['roasTarget', 'roasBreakEven']);
      ok(adv.querySelector('[name="learningDays"]'), 'learning period moved to advanced');
      eq(settingsForm.querySelectorAll('[name="_preset"]').length, 3);
      var text = settingsForm.textContent;
      ok(text.indexOf(t('goal.roasTarget')) > -1 && text.indexOf(t('goal.roasBreakEven')) > -1, 'money questions, not the technical names');
      ok(text.indexOf(t('set.roasTarget')) < 0, 'no technical label on the main screen');
    });

    test('نافذة أول مرة: تظهر مرة واحدة أول ما يتربط حساب، والحفظ بيتحقق من القيم، و«القيم المقترحة» أو Esc = الافتراضي', function () {
      var keepFlag = localStorage.getItem(WELCOME_KEY), keepSettings = alertSettings, hadMeta = activeSources.meta;
      try {
        localStorage.removeItem(WELCOME_KEY); alertSettings = {}; delete activeSources.meta;
        maybeShowWelcome();
        ok(welcomeOverlay.classList.contains('hidden'), 'no account yet: nothing');

        activeSources.meta = 'act_1';
        render();
        ok(!welcomeOverlay.classList.contains('hidden'), 'first account: the window opens');
        eq(welcomeForm.querySelectorAll('[name="_welcomePreset"]').length, 3, 'its own radio group (not shared with the settings window)');
        welcomeForm.querySelector('[name="_welcomePreset"][value="strict"]').checked = true;
        welcomeForm.querySelector('[name="roasBreakEven"]').value = '٤';
        welcomeForm.querySelector('[name="roasTarget"]').value = '3';
        document.getElementById('welcomeSave').click();
        ok(!welcomeOverlay.classList.contains('hidden') && welcomeForm.querySelector('.setting-row.invalid [name="roasTarget"]'), 'target below the loss point: error, nothing saved');
        eq(JSON.stringify(alertSettings), '{}');
        welcomeForm.querySelector('[name="roasTarget"]').value = '5';
        document.getElementById('welcomeSave').click();
        eq([alertSettings._preset, alertSettings.roasTarget, alertSettings.roasBreakEven], ['strict', 5, 4]);
        ok(welcomeOverlay.classList.contains('hidden') && welcomeDone(), 'closed and never again');
        render();
        ok(welcomeOverlay.classList.contains('hidden'));

        localStorage.removeItem(WELCOME_KEY); alertSettings = {};
        render();
        closeOverlays();
        ok(welcomeOverlay.classList.contains('hidden') && welcomeDone() && JSON.stringify(alertSettings) === '{}', 'Esc = suggested values, never again');

        localStorage.removeItem(WELCOME_KEY); alertSettings = {};
        render();
        document.getElementById('welcomeSkip').click();
        ok(welcomeDone() && JSON.stringify(alertSettings) === '{}', '«Use the suggested values»');

        localStorage.removeItem(WELCOME_KEY); alertSettings = { roasTarget: 4 };
        render();
        ok(welcomeOverlay.classList.contains('hidden') && welcomeDone(), 'already set their own settings: not asked');
      } finally {
        closeOverlays();
        alertSettings = keepSettings;
        if (hadMeta === undefined) delete activeSources.meta; else activeSources.meta = hadMeta;
        if (keepFlag === null) localStorage.removeItem(WELCOME_KEY); else localStorage.setItem(WELCOME_KEY, keepFlag);
        render();
      }
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

    test('الرجوع بعد الدخول للأداة بس (مش أي رابط برّه الموقع)', function () {
      eq(['/app', '/app?code=1&state=snapchat', 'https://evil.example/app', '//evil.example', '/appx', null].map(AuthLogin.safeNext),
        ['/app', '/app?code=1&state=snapchat', '/app', '/app', '/app', '/app']);
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

    testAsync('القفل: النسخة بتتفتح بنفس السر والمنصة بس، وأي تعديل أو ٦٠ يوم من غير استخدام = مرفوضة', function () {
      return import('/api/_seal.js').then(function (s) {
        var now = Date.parse('2026-10-03T00:00:00Z');
        return s.sealToken('snapchat', 'secret-1', 'refresh-abc', now).then(function (sealed) {
          ok(/^v1\./.test(sealed) && sealed.indexOf('refresh-abc') < 0, 'no plain token inside');
          var i = sealed.length - 12, bad = sealed.slice(0, i) + (sealed.charAt(i) === 'A' ? 'B' : 'A') + sealed.slice(i + 1);
          return Promise.all([
            s.unsealToken('snapchat', 'secret-1', sealed, now + 86400000),
            s.unsealToken('google', 'secret-1', sealed, now),
            s.unsealToken('snapchat', 'secret-2', sealed, now),
            s.unsealToken('snapchat', 'secret-1', bad, now),
            s.unsealToken('snapchat', 'secret-1', sealed, now + 61 * 86400000),
            s.unsealToken('snapchat', 'secret-1', 'not-a-sealed-token', now)
          ]);
        }).then(function (r) {
          eq(r, ['refresh-abc', null, null, null, null, null], 'same secret and platform within 60 days only');
        });
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
          return post(w, '/api/snapchat-token', { sealed: r.data.sealed }, env).then(json);
        }).then(function (r) {
          eq([r.status, r.data.code], [401, 'AUTH'], 'Snapchat rejected the refresh token = log in again');
          return post(w, '/api/snapchat-token', { sealed: 'v1.forged' }, env).then(json);
        }).then(function (r) {
          eq([r.status, r.data.code], [401, 'AUTH'], 'a forged copy');
        });
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
        eq([c.frequency, c.frequencyLife], [1.8, 3.4]);
        withLang('ar', function () { ok(/منذ إطلاق الإعلان: ٣٫٤/.test(freqBox(c)), freqBox(c)); });
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
        // تنبيه الإنفاق دون نتائج والمتوقع عملية شراء واحدة (متوسط الحساب ٢٠، واتصرف ٢٥ في يومين)
        var ads = baseAccount().concat([ad('w1', { daily: [0, 0, 0, 0, 12, 13, 0], res: steady(0), key: 'purchase' })]);
        var w = engine(ads).byAd.w1.issues.filter(function (i) { return /waste/.test(i.code || ''); })[0];
        ok(w, 'waste alert');
        ok(w.detail.indexOf('عملية شراء واحدة') > -1 && w.detail.indexOf('١ عملية') === -1, 'reads «عملية شراء واحدة»: ' + w.detail);
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
    test('الفترات: أسبوع ← الأسبوع اللي قبله، ويوم ← نفس اليوم من الأسبوع اللي فات', function () {
      var w = DX.windows('2026-09-21', '2026-09-27');
      eq([w[1].since, w[1].until], ['2026-09-14', '2026-09-20']);
      eq(DX.windows('2026-09-27', '2026-09-27')[1].since, '2026-09-20');
    });
    test('الملخص بالبريد: الفترة السابقة مباشرةً حتى لو أقل من أسبوع (الأداة لسه بنفس أيام الأسبوع)', function () {
      var w = DX.windows('2026-09-27', '2026-09-29', true);
      eq([w[1].since, w[1].until], ['2026-09-24', '2026-09-26']);
      eq(DX.windows('2026-09-27', '2026-09-29')[1].since, '2026-09-20');
      var days = [];
      for (var k = '2026-08-20'; k <= '2026-09-29'; k = shiftKey(k, 1)) days.push({ date: k, spend: 100, imp: 5000, clicks: 100, atc: 20, ic: 10, pur: 5, rev: 500 });
      var r = DX.analyze({ since: '2026-09-27', until: '2026-09-29', consecutive: true, daily: days, dims: [] });
      eq([r.prevSince, r.prevUntil], ['2026-09-24', '2026-09-26']);
      withLang('ar', function () { ok(/اكتفينا بعرض الأرقام/.test(t('dx.insufficient.mail')) && !/اختر فترة/.test(t('dx.insufficient.mail'))); });
    });
    test('«ضمن التذبذب» والمبيعات اتغيّرت كتير: سطر صريح بالرقم ومتوسط قيمة الطلب، و«تكررت» بس لو حصلت فعلاً (حالة حقيقية)', function () {
      var mk = function (revFor) {
        var d = [];
        for (var k = '2026-08-20'; k <= '2026-09-29'; k = shiftKey(k, 1)) d.push({ date: k, spend: 100, imp: 5000, clicks: 100, atc: 20, ic: 10, pur: 5, rev: revFor(k) });
        return d;
      };
      var lines = function (o) { return o.blocks.map(function (b) { return (b.lines || []).join(' '); }).join(' '); };
      withLang('ar', function () {
        var rare = lines(DX.compose(DX.analyze({ since: '2026-09-27', until: '2026-09-29', consecutive: true, currency: 'USD',
          daily: mk(function (k) { return k >= '2026-09-27' ? 200 : 500; }), dims: [] }), { mail: true }));
        ok(/انخفضت ٦٠٪/.test(rare) && /متوسط قيمة الطلب/.test(rare) && /أكبر مما شهده حسابك/.test(rare), rare);
        var seen = lines(DX.compose(DX.analyze({ since: '2026-09-27', until: '2026-09-29', consecutive: true, currency: 'USD',
          daily: mk(function (k) { return k >= '2026-09-27' || (k >= '2026-09-21' && k <= '2026-09-23') ? 200 : 500; }), dims: [] }), { mail: true }));
        ok(/تكررت في حسابك من قبل/.test(seen), seen);
        var flat = lines(DX.compose(DX.analyze({ since: '2026-09-27', until: '2026-09-29', consecutive: true, currency: 'USD',
          daily: mk(function () { return 500; }), dims: [] }), { mail: true }));
        ok(!/المبيعات/.test(flat), 'no line when sales barely moved: ' + flat);
      });
    });
    test('فترة التشخيص أيام مكتملة بس (اليوم لسه بيتحسب)', function () {
      var today = todayKeyInTz('Asia/Riyadh');
      period = { preset: 'last7' };
      var p = dxPeriodFor('Asia/Riyadh');
      eq(p.until, shiftKey(today, -1)); eq(keyDiffDays(p.since, p.until), 6);
      period = { preset: 'today' };
      p = dxPeriodFor('Asia/Riyadh');
      eq([p.since, p.until], [shiftKey(today, -1), shiftKey(today, -1)]);
      period = { preset: 'last7' };
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
      ok(/انخفض العائد على الإنفاق/.test(o.blocks[0].lines[0]), o.blocks[0].lines[0]);
    });
    test('نفس الطلبات والمبيعات −٤٥٪: مش «أداء مستقر»', function () {
      var o = head({ rev: 3300 });
      ok(o.tone === 'bad' && !/مستقر/.test(o.title), o.title);
    });
    test('طلبات أكثر والمبيعات −٣٥٪ (في حدود تذبذب العائد): العنوان بيقول إن المبيعات نزلت، مش «لا شيء يستدعي تدخّلك»', function () {
      var o = head({ pur: 26, rev: 3900 });
      ok(o.tone === 'mixed' && /المبيعات انخفضت ٣٥٪/.test(o.title) && !/لا شيء يستدعي/.test(o.title), o.title);
    });
    test('العائد مقارنةً بالمستهدف وحد الخسارة (إعدادات التنبيهات): سطر تحت العنوان، وتحت حد الخسارة = أحمر', function () {
      var ok3 = head({}, { roas: 3, be: 1 });
      ok(/أعلى من المستهدف \(×٣\)/.test(ok3.basis), ok3.basis);
      var loss = head({}, { roas: 10, be: 8 });
      ok(loss.tone === 'bad' && /أقل من حد الخسارة/.test(loss.basis), loss.basis);
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
      ok(calls.filter(function (p) { return p.level; }).every(function (p) { return !p.filtering && p.fields.indexOf('objective,optimization_goal') > -1; }), 'levels carry goals, unfiltered');
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
        ok(txt.indexOf('حسب ملاحظتك عن الفترة السابقة') > -1, 'owner context shown');
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
    // ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦: «ضمن التذبذب» من غير أرقام، والشرح مطوي ومكانه مش واضح
    var arNum = function (s) { return Number(String(s).replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }).replace('٫', '.')); };
    test('«ضمن التذبذب» بالأرقام: احتمال الصدفة ودرجته متسقين (عادي ٢٠٪+، ملحوظ ٥–٢٠٪، مرجّح تحت ٥٪) — ٤٠ حساب مستقر', function () {
      var seen = 0, bad = [], tiers = {};
      withLang('ar', function () {
        for (var s = 1; s <= 40; s++) {
          var r = DX.analyze(DX_SIM.simulate({ seed: s * 7919, spend: 400 }));
          if (r.status !== 'ok') continue;
          var o = DX.compose(r);
          o.blocks.forEach(function (b) {
            (b.lines || []).forEach(function (l) {
              var m = l.match(/بالصدفة وحدها (?:إلا )?في نحو ([٠-٩]+)٪/);
              if (!m) return;
              seen++;
              var p = arNum(m[1]), tier = /تذبذب عادي/.test(l) ? 'normal' : (/فالأرجح/.test(l) ? 'likely' : 'notable');
              tiers[tier] = (tiers[tier] || 0) + 1;
              if ((tier === 'normal') !== (p >= 20) || (tier === 'likely') !== (p < 5)) bad.push(l);
              // مرجّح وفي الاتجاه السيئ = العنوان «يستحق المتابعة» مش «ضمن التذبذب المعتاد»
              if (tier === 'likely' && /^(تكلفة الطلب.*\(أعلى بـ|الطلبات.*\(أقل بـ|كل .*\(أقل بـ)/.test(l) && b.kind === 'note' && !/يستحق المتابعة/.test(o.title) && !/مبيعات|العائد|حد الخسارة/.test(o.title)) bad.push('title: ' + o.title);
            });
          });
        }
      });
      ok(seen >= 5, 'noise lines seen: ' + seen + ' ' + JSON.stringify(tiers));
      eq(bad, []);
    });
    test('سبب الحكم ظاهر بين الأرقام والتنبيهات بلون الحكم، ومبيتكررش في الشرح المطوي', function () {
      var r = scenarios()[0];
      try {
        DX_ON = true; activeSources.meta = 'act_1';
        dxState = { status: 'ready', key: 'k', report: r, account: 'Store', accountId: 'meta:act_1' };
        withLang('ar', function () { renderDiagnosis(); });
        var o = dxState.composed, box = document.querySelector('#dxVerdict .dx-verdict');
        ok(o.main >= 0 && box, 'verdict box shown');
        ok(box.classList.contains(o.tone), 'coloured by the verdict');
        ok(/كل ١٠٠ /.test(box.textContent), 'money line: ' + box.textContent.slice(0, 120));
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
    test('العروض: «كل المنصات» الأول لو العملة والفترة واحدة، والأزرار بتبدّل العرض', function () {
      var a = src('meta', 21), b = src('google', 23);
      DX_ON = true; activeSources.meta = 'act_1'; activeSources.google = '123';
      try {
        dxState.sources = { meta: { status: 'ready', key: 'm', input: a.input, report: DX.analyze(a.input), account: 'M', accountId: 'meta:1' },
          google: { status: 'ready', key: 'g', input: b.input, report: DX.analyze(b.input), account: 'G', accountId: 'google:1' } };
        dxRecompute();
        eq(dxState.views.map(function (v) { return v.id; }), ['all', 'meta', 'google']);
        ok(document.querySelector('#dxBody [data-dx-view="google"]'), 'tabs shown');
        document.querySelector('#dxBody [data-dx-view="google"]').click();
        eq([dxState.view, dxState.accountId], ['google', 'google:1']);
        // عملة مختلفة = مفيش «كل المنصات»
        b.input.currency = 'USD';
        dxState.sources.google.input = b.input;
        dxRecompute();
        eq(dxState.views.map(function (v) { return v.id; }), ['meta', 'google']);
      } finally { DX_ON = false; dxReset(); document.getElementById('storeSec').hidden = true; }
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
      var r = engine(ads);
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
    test('جدول الأيام في التفاصيل: آخر عمود «اليوم» واللي قبله «أمس» مهما كان عدد الأيام', function () {
      var c = ad8('d1', s8(10), s8(1));
      candidates = [c];
      render();
      openExpand(c);
      var th = Array.prototype.map.call(document.querySelectorAll('#expandChart thead th'), function (x) { return x.textContent; });
      eq([th.length, th[7], th[8]], [9, t('x.yesterday'), t('x.today')]);
      expandOverlay.classList.add('hidden');
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
    test('بالمفتاح المحفوظ: بيتبعت صريح مع الطلب (GET وPOST)، ومن غير ما يغيّر params الأصلية', function () {
      rememberToken('meta', 'LONG_TOKEN_X', 3600);
      withFb(function (calls) {
        var p = { fields: 'id' };
        metaApi('/act_1/ads', p, function () {});
        metaApi('/', 'POST', { batch: '[]' }, function () {});
        eq([calls[0][1].access_token, calls[0][1].fields, p.access_token], ['LONG_TOKEN_X', 'id', undefined]);
        eq([calls[1][1], calls[1][2].access_token, calls[1][2].batch], ['POST', 'LONG_TOKEN_X', '[]']);
      });
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
        ok(/DEVICE_KEYS = \['acc\.renew\.v1', 'acc\.lastAccount\.v1'\]/.test(src) && /function signOut\(\) \{\s*try \{ DEVICE_KEYS\.forEach/.test(src), 'signOut clears device keys');
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
      DIGEST_ON = true; digestUi = digestFresh(); digestRefreshed = {}; digestKnown = {};
      dxState = dxFresh(); dxState.status = 'ready'; dxState.accountId = 'meta:act_1';
      var restore = function () {
        window.fetch = realFetch;
        if (hadFB) window.FB = realFB; else delete window.FB;
        if (realHint === null) localStorage.removeItem(DIGEST_HINT_KEY); else localStorage.setItem(DIGEST_HINT_KEY, realHint);
        DIGEST_ON = realOn; digestUi = digestFresh(); digestRefreshed = {}; digestKnown = {}; dxReset(); renderDigest();
      };
      return Promise.resolve().then(function () { return fn(calls); }).then(function (v) { restore(); return v; }, function (e) { restore(); throw e; });
    };
    var btn = function () { return document.getElementById('dxAutoBtn'); };
    var panel = function () { return document.getElementById('dxAuto'); };
    var openPanel = function () { renderDigest(); btn().click(); return tick2(); };

    testAsync('الزرار بيظهر في عرض حساب Meta لوحده مع جلسة Meta، ومخفي لو الميزة مقفولة', function () {
      return withDigest(function () { return ok200({}); }, function () {
        renderDigest();
        ok(!btn().hidden, 'meta view');
        dxState.accountId = 'all:meta:act_1,google:1'; renderDigest();
        ok(btn().hidden, 'not on «all platforms»');
        dxState.accountId = 'google:123'; renderDigest();
        ok(btn().hidden, 'not on Google');
        dxState.accountId = 'meta:act_1'; DIGEST_ON = false; renderDigest();
        ok(btn().hidden, 'hidden while the feature is off');
      });
    });
    testAsync('فتح الصندوق: بيجيب الحالة من السيرفر، والنموذج بالأحد والأربعاء ٩ صباحاً افتراضياً', function () {
      return withDigest(function () { return ok200({ settings: null, timezone: 'Asia/Kuwait' }); }, function (calls) {
        return openPanel().then(function () {
          eq([calls[0].action, calls[0].accountId, calls[0].token], ['digest.get', 'act_1', 'tok-test-1234567890']);
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
      return withDigest(function () { return ok200({ settings: ON, tokenExpiresAt: '2026-11-27T20:42:24Z', tokenWorks: false, timezone: 'Asia/Kuwait' }); }, function () {
        return openPanel().then(function () {
          withLang('ar', function () { ok(panel().textContent.indexOf(t('dx.auto.problem')) > -1, 'problem shown'); });
        });
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
        eq([last.action, last.token, 'accountId' in last], ['digest.disconnect', 'tok-test-1234567890', false]);
      });
    });
    var hintEl = function () { return document.getElementById('dxAutoHint'); };
    testAsync('تلميح التفعيل: بيظهر بس لما نكون متأكدين إن الملخص مش مفعّل للحساب، وفي عرض Meta لوحده', function () {
      return withDigest(function (b) { return ok200({ ok: true, enabled: b.accountId === 'act_2' }); }, function () {
        renderDigest();
        ok(hintEl().hidden, 'unknown → hidden');
        digestAutoRefresh('act_1');
        return tick2().then(function () {
          ok(!hintEl().hidden && hintEl().querySelector('[data-digest-hint-on]'), 'not enabled → shown');
          withLang('ar', function () { renderDigest(); ok(hintEl().textContent.indexOf(t('dx.auto.hint')) > -1, 'text in the current language'); });
          dxState.accountId = 'all:meta:act_1,google:1'; renderDigest();
          ok(hintEl().hidden, 'not on «all platforms»');
          dxState.accountId = 'meta:act_2'; digestAutoRefresh('act_2');
          return tick2();
        }).then(function () {
          ok(hintEl().hidden, 'enabled → hidden');
        });
      });
    });
    testAsync('تلميح التفعيل: «فعّلها الآن» بيفتح نموذج التفعيل، و«لاحقاً» بيخفيه على الجهاز ده', function () {
      return withDigest(function (b) {
        if (b.action === 'digest.get') return ok200({ settings: null, timezone: 'Asia/Kuwait' });
        return ok200({ ok: true, enabled: false });
      }, function (calls) {
        digestAutoRefresh('act_1');
        return tick2().then(function () {
          hintEl().querySelector('[data-digest-hint-on]').click();
          return tick2();
        }).then(function () {
          ok(!panel().hidden && panel().querySelector('#dxAutoEmail'), 'form open');
          ok(hintEl().hidden, 'hint hidden while the form is open');
          eq(calls[calls.length - 1].action, 'digest.get');
          btn().click();
          ok(!hintEl().hidden, 'back after closing the form');
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
        if (b.action === 'digest.enable') return ok200({ ok: true, settings: ON, tokenExpiresAt: '2026-11-27T20:42:24Z' });
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
          btn().click();
          ok(hintEl().hidden, 'enabled → no hint');
          btn().click();
          return tick2();
        }).then(function () {
          panel().querySelector('[data-digest-off]').click();
          panel().querySelector('[data-digest-off-yes]').click();
          return tick2();
        }).then(function () {
          btn().click();
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
          { segments: seg({ conversionActionCategory: 'ADD_TO_CART' }), metrics: { conversions: 0, allConversions: 20 } },
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
      ok(filtered(function (x) { return x.indexOf('FROM customer') > -1 && x.indexOf('segments.device') < 0; }), 'account and network use the store filter');
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
        // الأيام بتتطلب على دفعات — اليوم بيرجع بس في الدفعة اللي مداها فيه (زي Snapchat نفسه)
        var from = decodeURIComponent((u.match(/start_time=([^&]+)/) || [])[1] || '').slice(0, 10);
        var to = decodeURIComponent((u.match(/end_time=([^&]+)/) || [])[1] || '').slice(0, 10);
        var inRange = '2026-09-25' >= from && '2026-09-25' < to;
        return json({ timeseries_stats: [{ timeseries_stat: { timeseries: inRange ? [{ start_time: '2026-09-25T00:00:00.000+03:00', stats: st }] : [] } }] });
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
