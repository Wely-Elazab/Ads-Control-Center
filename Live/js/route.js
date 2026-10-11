// =====================================================================
// Ads Center — الروابط وزرار الرجوع
// =====================================================================
// مراجعة المرحلة ١ (١١ أكتوبر ٢٠٢٦ — audit/phase-1-structure.md، ف٣):
// قبل كده الأداة كلها كانت على /app من غير أي حالة في الرابط. التحديث كان بيضيّع التبويب والحملة، والرابط مكانش ينفع
// يتبعت لزميل، ورسايل البريد كانت بتفتح الأداة وخلاص، وزرار الرجوع في الموبايل كان بيخرج من الأداة بدل ما يقفل النافذة.
// دلوقتي كل حالة مهمة ليها رابط على /app نفسه — زي مدير إعلانات Meta (?act=) وGoogle Ads (?ocid=):
//   /app?meta=act_1&view=alerts&list=campaigns&campaign=…&ad=…&period=last7
// على /app نفسه عشان رابط الرجوع المسجّل عند المنصات ميتغيرش، و?next= بعد الدخول (auth.js safeNext) يقبله زي ما هو.
// زرار الرجوع (Baymard 2020 — المستخدم بيعامل النافذة والفلتر كصفحة جديدة):
//   - أي حاجة المستخدم بيعملها وبتغيّر الصفحة بتضيف خطوة (تبويب، عرض، حملة، إعلان، فترة، حساب، نافذة)
//   - قفل حاجة هو اللي فتحها بيرجع خطوة بدل ما يضيف واحدة — فالرجوع بعد القفل ميفتحهاش تاني
//   - التغيير التلقائي (تحميل، أول حساب، نافذة الترحيب) بيستبدل الخطوة الحالية
// الفلاتر اللي جوه الدرج والترتيب برّه الرابط لحد المرحلة ٧ (قرار مكتوب في الوثيقة).
// بيتحمّل بعد ui.js وقبل main.js: الحساب اللي في الرابط لازم يتحط قبل ما main.js يسترجع الجلسة.

  var ROUTE_KEYS = ['meta', 'google', 'snapchat', 'tiktok', 'view', 'list', 'campaign', 'ad', 'period', 'since', 'until'];
  // شكل رقم الحساب في كل منصة — أي قيمة تانية في الرابط بتتجاهل
  var ROUTE_ACCOUNT_RE = {
    meta: /^act_\d{1,20}$/,
    google: /^\d{6,12}$/,
    snapchat: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    tiktok: /^\d{6,25}$/
  };
  var ROUTE_AD_RE = /^[\w.:~|-]{1,120}$/;
  var ROUTE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  // النوافذ اللي ملهاش معامل في الرابط — الرجوع بيقفلها بس (تفاصيل الإعلان ليها ?ad=)
  var ROUTE_OVERLAYS = ['settingsOverlay', 'platformOverlay', 'installOverlay', 'welcomeOverlay', 'filterDrawer'];

  // الرابط → الحالة المطلوبة. أي قيمة مش مفهومة بتتشال بهدوء (رابط منسوخ غلط ميكسرش الأداة)
  function parseRoute(search, today) {
    var q = new URLSearchParams(search || '');
    // الصفحة: الملخص افتراضياً (من غير ?view=) — والروابط القديمة (?view=alerts من رسايل البريد) بتفضل شغّالة
    var r = { accounts: {}, view: 'summary', list: null, campaign: null, ad: null, period: null };
    PLATFORMS.forEach(function (p) { var v = q.get(p); if (v && ROUTE_ACCOUNT_RE[p].test(v)) r.accounts[p] = v; });
    var view = q.get('view');
    if (view === 'ads' || view === 'alerts' || view === 'settings') r.view = view;
    var list = q.get('list');
    if (list === 'campaigns' || list === 'ads') r.list = list;
    var camp = q.get('campaign');
    if (camp && camp.length <= 300) r.campaign = camp;
    var ad = q.get('ad');
    if (ad && ROUTE_AD_RE.test(ad)) r.ad = ad;
    var pr = q.get('period');
    if (pr && pr !== 'custom' && Object.prototype.hasOwnProperty.call(PERIOD_LABELS, pr)) r.period = { preset: pr };
    else if (pr === 'custom') r.period = routeCustomPeriod(q.get('since'), q.get('until'), today || todayKeyInTz(BROWSER_TZ));
    return r;
  }
  // نفس قواعد زرار «تطبيق» في الفترة المخصصة (ui.js): مترتبة، مش في المستقبل، وأقصاها PERIOD_MAX_DAYS
  function routeCustomPeriod(since, until, today) {
    if (!ROUTE_DATE_RE.test(since || '') || !ROUTE_DATE_RE.test(until || '')) return null;
    if (since > until) { var tmp = since; since = until; until = tmp; }
    if (until > today) until = today;
    if (since > until) since = until;
    if (keyDiffDays(since, until) > PERIOD_MAX_DAYS - 1) since = shiftKey(until, -(PERIOD_MAX_DAYS - 1));
    return { preset: 'custom', since: since, until: until };
  }
  function routePeriodText(p) { return !p ? '' : p.preset === 'custom' ? 'custom:' + p.since + ':' + p.until : p.preset; }

  // الحالة → معاملات الرابط. المعاملات التانية (dx وdigest وغيرهم) بتفضل زي ما هي
  function routeSearch(parts, search) {
    var q = new URLSearchParams(search || '');
    ROUTE_KEYS.forEach(function (k) { q.delete(k); });
    PLATFORMS.forEach(function (p) { if (parts.accounts[p]) q.set(p, parts.accounts[p]); });
    if (parts.view && parts.view !== 'summary') q.set('view', parts.view);
    if (parts.list === 'campaigns') q.set('list', 'campaigns');
    if (parts.campaign) q.set('campaign', parts.campaign);
    if (parts.ad) q.set('ad', parts.ad);
    if (parts.period) {
      var bits = parts.period.split(':');
      q.set('period', bits[0]);
      if (bits[0] === 'custom') { q.set('since', bits[1]); q.set('until', bits[2]); }
    }
    var s = q.toString();
    return s ? '?' + s : '';
  }

  // الخطوة الجاية في سجل الرجوع: none / replace / push / back.
  // hs = الخطوة الحالية ({ key, parts, from }) — from = الخطوة اللي اتعملت منها
  // الرجوع بس لما المستخدم «يقفل» حاجة هو فتحها (نافذة، تفاصيل إعلان، حملة) — فالرجوع بعد القفل ميفتحهاش تاني.
  // أي تغيير تاني (تبويب، عرض، فترة، حساب) خطوة جديدة حتى لو رجّع شكل الصفحة اللي قبلها: الإعلانات ← التنبيهات ←
  // الإعلانات بالضغط، والرجوع بعدها يرجّع التنبيهات. قبل كده كان بيرجع خطوة، فزرار الرجوع بعدها خرج من الأداة (مراجعة ١١ أكتوبر)
  function routeStep(hs, parts, key, user) {
    if (hs && hs.key === key) return 'none';
    if (!user || !hs) return 'replace';
    var prev = hs.parts || {};
    // قفل: نفس الصفحة، واختفى منها نافذة أو تفاصيل إعلان أو حملة من غير ما يتفتح غيرها.
    // لو اتفتحت بخطوة من الصفحة دي بالظبط: رجوع. لو اتفتحت من غير خطوة (رابط البريد مثلاً): استبدال، مفيش خطوة نرجعلها
    if (routeClosing(prev, parts)) return hs.from === key ? 'back' : 'replace';
    // حساب اتحمّل أو اتشال (فصل) مش صفحة جديدة — التبديل من حساب لحساب هو اللي صفحة جديدة
    if (routeSameExcept(prev, parts, ['accounts']) && !routeSwitched(prev.accounts || {}, parts.accounts)) return 'replace';
    return 'push';
  }
  var ROUTE_LAYERS = ['overlay', 'ad', 'campaign'];
  function routeClosing(prev, next) {
    if (!routeSameExcept(prev, next, ROUTE_LAYERS)) return false;
    var removed = false;
    for (var i = 0; i < ROUTE_LAYERS.length; i++) {
      var k = ROUTE_LAYERS[i];
      if (next[k] && next[k] !== prev[k]) return false; // اتفتحت حاجة جديدة
      if (prev[k] && !next[k]) removed = true;
    }
    return removed;
  }
  function routeSameExcept(a, b, skip) {
    return ['accounts', 'view', 'list', 'campaign', 'ad', 'period', 'overlay'].every(function (k) {
      return skip.indexOf(k) !== -1 || JSON.stringify(a[k] || null) === JSON.stringify(b[k] || null);
    });
  }
  function routeSwitched(a, b) { return PLATFORMS.some(function (p) { return a[p] && b[p] && a[p] !== b[p]; }); }

  // ---------- الحالة الحالية للأداة ----------
  // اللي لسه مستني (حساب أو حملة أو إعلان من الرابط ومتحمّلش) بيفضل في الرابط — تحديث الصفحة أثناء التحميل ميضيّعوش
  var routePending = { accounts: {}, campaign: null, ad: null };
  // الحملة في الرابط برقمها بس (الحساب في الرابط أصلاً) — ولو ملهاش رقم بمفتاحها الكامل
  function routeCampaignParam(key) {
    var c = candidates.filter(function (x) { return campaignKey(x) === key; })[0];
    return c && c.campaignId ? String(c.campaignId) : key;
  }
  function routeFindCampaign(v) {
    return candidates.filter(function (x) { return campaignKey(x) === v || (x.campaignId != null && String(x.campaignId) === v); })[0];
  }
  function routeParts() {
    var parts = { accounts: {}, view: currentView, list: viewMode === 'campaigns' ? 'campaigns' : null, campaign: null, ad: null, period: routePeriodText(period), overlay: null };
    PLATFORMS.forEach(function (p) { var id = routePending.accounts[p] || activeSources[p]; if (id) parts.accounts[p] = id; });
    parts.campaign = filters.campaign ? routeCampaignParam(filters.campaign) : routePending.campaign;
    var adOpen = !expandOverlay.classList.contains('hidden') && expandOverlay.dataset.adId;
    parts.ad = adOpen || routePending.ad;
    ROUTE_OVERLAYS.forEach(function (id) {
      var el = document.getElementById(id);
      if (!parts.overlay && el && !el.classList.contains('hidden')) parts.overlay = id;
    });
    return parts;
  }

  // ---------- مزامنة الرابط ----------
  // الأداة الحقيقية بس: /app، أو ملف الصفحة نفسه في إطار الاختبارات المحلية. صفحة الاختبارات نفسها (بتحمّل نفس الكود)
  // رابطها ميتغيرش — غير كده تحديثها كان هيفتح الأداة على حالة اختبار قديمة
  var routeOn = location.pathname === '/app' || location.pathname === '/pauseproof-live.html';
  var routeApplying = false, routeGesture = false;
  function routeSync(user) {
    if (!routeOn || routeApplying) return;
    // فعل المستخدم لسه بيتنفّذ: routeMark هيسجّله كخطوة لما يخلص
    if (!user && routeGesture) return;
    var parts = routeParts();
    var url = location.pathname + routeSearch(parts, location.search) + location.hash;
    var key = url + '#' + (parts.overlay || '');
    var hs = history.state && history.state.acc ? history.state : null;
    var step = routeStep(hs, parts, key, user);
    if (step === 'none') return;
    if (step === 'back') { history.back(); return; }
    var state = { acc: 1, key: key, parts: parts, from: step === 'push' ? (hs ? hs.key : null) : (hs ? hs.from : null) };
    // Safari بيرفض لو الخطوات كترت جداً في ثواني — الأداة تكمل عادي من غير الخطوة دي
    try { history[step === 'push' ? 'pushState' : 'replaceState'](state, '', url); } catch (e) { /* مش مهم */ }
  }
  // أي ضغطة أو اختيار أو زرار من المستخدم: اللي اتغيّر بعدها في نفس اللحظة خطوة جديدة
  function routeMark() {
    if (routeGesture) return;
    routeGesture = true;
    setTimeout(function () { routeGesture = false; routeSync(true); }, 0);
  }

  // ---------- تطبيق الرابط على الأداة ----------
  // بيتنادى من render — الحملة اللي في الرابط بتتطبّق أول ما إعلاناتها توصل (قبل الرسم، عشان render ميشيلهاش)
  function routeBeforeRender() {
    if (!routePending.campaign) return;
    var c = routeFindCampaign(routePending.campaign);
    if (!c) return;
    filters.campaign = campaignKey(c);
    filters.campaignName = c.campaignName || null;
    routePending.campaign = null;
  }
  // رسايل «اللي في الرابط مش موجود» بتستنى لحد ما التحميل يخلص: لو اتكتبت بدري، رسايل التحميل اللي بعدها كانت بتغطيها
  // في نفس اللحظة (اتجرّب على الموقع ١١ أكتوبر ٢٠٢٦ — الرسالة ظهرت واختفت قبل ما تتقري)
  var routeNotices = [];
  // بعد كل رسم: اللي لسه مستني من الرابط، وبعدين الرابط نفسه
  function routeAfterRender() {
    if (!routeOn) return;
    Object.keys(routePending.accounts).forEach(function (p) {
      var id = routePending.accounts[p], opts = platformOptions[p] || [];
      if (activeSources[p] === id) { delete routePending.accounts[p]; return; }
      // نحكم بعد ما المنصة نفسها تحمّل في الصفحة دي (إعلاناتها وصلت أو ليها حالة) — القايمة المحفوظة من قبل التحديث لوحدها مش كفاية
      var loaded = candidates.some(function (c) { return platformOfSource(c.source) === p; }) || platformState[p];
      if (!opts.length || loadingPlatforms[p] || !loaded) return;
      delete routePending.accounts[p];
      // الحساب مش من حسابات المستخدم: بنقول كده بدل ما يفتكر إن ده حساب الرابط
      if (!opts.some(function (o) { return o.value === id; })) routeNotices.push(msg('route.noAccount', { platform: PLATFORM_NAMES[p] }));
    });
    // «خلص التحميل» = مفيش منصة بتحمّل، وكل حسابات الرابط اتحسمت، وفيه إعلانات أو حالة واضحة (حساب فاضي أو خطأ)
    var settled = !anyLoading() && !Object.keys(routePending.accounts).length &&
      (candidates.length || PLATFORMS.some(function (p) { return platformState[p]; }));
    if (routePending.ad) {
      var a = findCandidate(routePending.ad);
      if (a) { routePending.ad = null; openExpand(a); }
      else if (settled && candidates.length) { routePending.ad = null; routeNotices.push(msg('route.noAd')); }
    }
    if (routePending.campaign && settled && candidates.length) { routePending.campaign = null; routeNotices.push(msg('route.noCampaign')); }
    if (settled && routeNotices.length) {
      var notes = routeNotices;
      routeNotices = [];
      setStatus(function () { return notes.map(function (m) { return m(); }).join(' '); });
    }
    routeSync(false);
  }
  function routeCloseOverlays() {
    settingsOverlay.classList.add('hidden');
    platformOverlay.classList.add('hidden');
    installOverlay.classList.add('hidden');
    if (welcomeOverlay && !welcomeOverlay.classList.contains('hidden')) closeWelcome(); // زي Esc = القيم المقترحة
    if (!filterDrawer.classList.contains('hidden')) closeFilters();
  }
  // الرجوع والتقديم: الأداة بترجع للحالة اللي في الرابط
  function routeApply(r) {
    Object.keys(r.accounts).forEach(function (p) {
      var id = r.accounts[p];
      if (activeSources[p] === id) return;
      if ((platformOptions[p] || []).some(function (o) { return o.value === id; })) { accountSelect.value = id; loadSource(p, id); }
      else routePending.accounts[p] = id;
    });
    if (r.period && routePeriodText(r.period) !== routePeriodText(period)) applyPeriod(r.period);
    viewMode = r.list === 'campaigns' && !r.campaign ? 'campaigns' : 'ads';
    filters.campaign = null; filters.campaignName = null; routePending.campaign = r.campaign;
    routeBeforeRender();
    // الحملة بتتعرض في صفحة «الإعلانات»
    showView(r.campaign && r.view === 'summary' ? 'ads' : r.view);
    routeCloseOverlays();
    routePending.ad = null;
    if (r.ad) {
      var a = findCandidate(r.ad);
      if (a) openExpand(a); else routePending.ad = r.ad;
    } else if (!expandOverlay.classList.contains('hidden')) expandOverlay.classList.add('hidden');
    render();
  }

  if (routeOn) {
    // أول فتح: اللي في الرابط أولى من آخر حالة محفوظة على الجهاز
    (function () {
      var r = parseRoute(location.search);
      Object.keys(r.accounts).forEach(function (p) {
        var id = r.accounts[p], s = savedSession, opts = s && s.options && s.options[p];
        routePending.accounts[p] = id;
        // pickAccount بيختاره لو موجود في قايمة حسابات المستخدم (في الذاكرة بس — selectSource بيحفظه لما يتحمّل فعلاً)
        lastAccounts[p] = id;
        // نفس التاب بعد تحديث: الجلسة المحفوظة بتفتح الحساب ده بدل آخر حساب — لو موجود في قايمته بس
        if (s && s.active && s.active[p] && Array.isArray(opts) && opts.some(function (o) { return o && o.value === id; })) s.active[p] = id;
      });
      // الفترة من الرابط من غير حفظ: فتح رابط مش اختيار — الفترة المحفوظة بتتغير بس لما المستخدم يختار بنفسه
      if (r.period) { period = r.period; syncPeriodUi(); }
      if (r.campaign || r.ad) viewMode = 'ads'; else if (r.list) viewMode = r.list;
      routePending.campaign = r.campaign;
      routePending.ad = r.ad;
      // الحملة بتتعرض في صفحة «الإعلانات»
      var view = r.campaign && r.view === 'summary' ? 'ads' : r.view;
      if (view !== 'summary') showView(view);
    })();
    ['click', 'change', 'keydown'].forEach(function (type) { document.addEventListener(type, routeMark, true); });
    window.addEventListener('popstate', function () {
      routeApplying = true;
      try { routeApply(parseRoute(location.search)); } finally { routeApplying = false; }
      routeSync(false);
    });
  }
