// =====================================================================
// Ads Control Center — الاختبارات
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
      eq(noun(5, 'n.ad'), 'إعلانات'); eq(noun(15, 'n.ad'), 'إعلان');
      withLang('en', function () { eq(noun(1, 'n.ad'), 'ad'); eq(noun(2, 'n.ad'), 'ads'); });
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
      eq(money(null), '٠ ر.س');
    });
    test('المبالغ بالإنجليزي', function () {
      withLang('en', function () {
        eq(money(1234.4, 'SAR'), '1,234 SAR');
        eq(money(5, 'USD'), '5 $');
        eq(money(2.5, 'EGP'), '2.5 EGP');
      });
    });
    test('منذ كام يوم', function () {
      eq(sinceLabel(0), 'اليوم'); eq(sinceLabel(1), 'قبل يوم'); eq(sinceLabel(2), 'قبل يومين');
      eq(sinceLabel(5), 'قبل ٥ أيام'); eq(sinceLabel(15), 'قبل ١٥ يوماً');
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
      window.fetch = function () {
        return Promise.resolve({ json: function () {
          return Promise.resolve({ ads: [], metrics: [], periodMetrics: null, pmax: rows, pmaxPeriod: null, pmaxError: null, range: { since: KEYS[0], until: KEYS[6] } });
        } });
      };
      accountInfo['google:999'] = { currency: 'EGP' };
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
    test('نافذة المنصات بتوضّح إن Meta وGoogle محتاجين انضمام', function () {
      var note = document.querySelector('#platformOverlay .pf-pilot');
      ok(note, 'note exists');
      ok(note.querySelector('a[data-join]') && note.querySelector('a[href="/help"]'), 'join + help links');
      eq(document.querySelector('#platformMeta .platform-item-sub').textContent, t('pf.meta'));
    });
    test('رسالة الانضمام فيها البيانات المطلوبة وموافقة المختبِر باللغتين', function () {
      ['ar', 'en'].forEach(function (l) {
        var href = ACC_JOIN.href(l);
        ok(href.indexOf('mailto:walid.elazab20@gmail.com?subject=') === 0, l + ': mailto');
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
    // السيرفر المحلي مفيهوش rewrites بتاعة Vercel (زي /help → /help.html) — فبنطبّقها من vercel.json نفسه
    function routeMap() {
      return getText('/vercel.json').then(function (txt) {
        var cfg = JSON.parse(txt), map = {};
        (cfg.rewrites || []).concat(cfg.redirects || []).forEach(function (r) { map[r.source] = r.destination; });
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
        return getText('/.vercelignore');
      }).then(function (txt) {
        var ignored = txt.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(function (s) { return s && s.charAt(0) !== '#'; });
        ['/home.html', '/help.html', '/404.html', '/site.css', '/legal.css', '/js/join.js', '/js/legal.js'].forEach(function (f) {
          ok(ignored.indexOf(f) === -1 && ignored.indexOf(f.slice(1)) === -1 && ignored.indexOf(f.split('/')[1]) === -1, f + ' is deployed');
        });
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
      window.fetch = function () {
        return Promise.resolve({ json: function () { return Promise.resolve({ accounts: [], errors: [], inactive: ['1234567890'] }); } });
      };
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
