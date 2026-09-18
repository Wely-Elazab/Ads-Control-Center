// =====================================================================
// Ads Control Center — الواجهة
// =====================================================================
// المظهر واللغة، نافذة اختيار المنصة، الكروت (إعلانات وحملات)، الفلاتر، الأرقام، أهم التنبيهات،
// تفاصيل الإعلان، صفحة التنبيهات، والإعدادات.
// الملفات بتتحمّل بالترتيب ده وبتتشارك نفس النطاق العام (من غير bundler):
//   i18n → alerts → core → meta → google → snapchat → tiktok → ui → main
// أي كود بيتنفّذ وقت التحميل مسموحله يستخدم اللي في الملفات اللي قبله بس — الباقي جوه دوال.

  themeToggle.addEventListener('click', function () {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) { document.documentElement.removeAttribute('data-theme'); themeToggle.textContent = '☀️'; }
    else { document.documentElement.setAttribute('data-theme', 'dark'); themeToggle.textContent = '🌙'; }
  });
  // تبديل اللغة: بيترجم الواجهة كلها ويعيد رسم الكروت والتنبيهات بالأرقام والعملة المناسبة.
  // بيانات الإعلانات نفسها (الأسماء والنصوص) بتفضل بلغتها الأصلية زي ما كتبها المعلن
  langToggle.addEventListener('click', function () {
    I18N.setLang(isAr() ? 'en' : 'ar');
    closeOverlays();
    syncPeriodUi();
    render();
    if (lastStatus) connectStatus.textContent = lastStatus();
  });
  // ترجمة نصوص الصفحة الثابتة للغة المحفوظة (لو المستخدم كان مختار الإنجليزي قبل كده)
  if (window.I18N) I18N.apply(document);

  loginMenuBtn.addEventListener('click', function () { platformOverlay.classList.remove('hidden'); });
  platformClose.addEventListener('click', function () { platformOverlay.classList.add('hidden'); });
  platformOverlay.addEventListener('click', function (e) { if (e.target === platformOverlay) platformOverlay.classList.add('hidden'); });

  platformMeta.addEventListener('click', function () { platformOverlay.classList.add('hidden'); loginWithMeta(); });
  platformGoogle.addEventListener('click', function () { platformOverlay.classList.add('hidden'); loginWithGoogle(); });
  if (platformSnapchat) { platformSnapchat.addEventListener('click', function () { loginWithSnapchat(); }); }
  if (platformTikTok) { platformTikTok.addEventListener('click', function () { loginWithTikTok(); }); }

  accountSelect.addEventListener('change', function () {
    var opt = accountSelect.selectedOptions[0];
    if (opt) loadSource(opt.dataset.platform, opt.value);
  });

  // ---------- عرض فقط ----------
  // المرحلة الأولى: الأداة للعرض والتحليل والتنبيه بس، من غير أي إجراء على الإعلانات — عشان قرارات
  // صاحب البزنس متتعارضش مع اختبارات مسؤول الإعلانات أو الوكالة.
  // أدوات الإيقاف التوضيحية اتشالت: الإيقاف الحقيقي هيتبني من الأول في مرحلة لاحقة
  // (صلاحية ads_management + مراجعة Meta، تنفيذ من السيرفر، سجل بمين عمل إيه، وتأكيد من المنصة)

  // ---------- التقييم والتنبيهات (المحرك نفسه في alerts.js) ----------
  var HEALTH = {
    review: { get label() { return t('health.review'); }, cls: 'h-review', order: 0 },
    improve: { get label() { return t('health.improve'); }, cls: 'h-improve', order: 1 },
    good: { get label() { return t('health.good'); }, cls: 'h-good', order: 2 },
    inactive: { get label() { return t('health.inactive'); }, cls: 'h-inactive', order: 3 }
  };
  // مستويات التنبيه: عاجل (محتاج تدخّل) / مهم (تابعه) / فرصة — مستوى "للعلم" اتشال لأنه ضوضاء
  var LEVELS = {
    critical: { get label() { return t('level.critical'); }, cls: 'lv-critical' },
    warning: { get label() { return t('level.warning'); }, cls: 'lv-warning' },
    opportunity: { get label() { return t('level.opportunity'); }, cls: 'lv-opportunity' },
    info: { get label() { return t('level.info'); }, cls: 'lv-info' }  // احتياطي لو محرك التنبيهات رجّع المستوى ده
  };

  // إعدادات حدود التنبيهات بتتحفظ في متصفح المستخدم نفسه
  var SETTINGS_KEY = 'pauseproof.alertSettings.v1';
  function loadAlertSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null') || {}; } catch (e) { return {}; } }
  function storeAlertSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); return true; } catch (e) { return false; } }
  var alertSettings = loadAlertSettings();

  var ALERT_FMT = { money: money, currencyLabel: currencyLabel, num: numAr, int: function (n) { return ar(Math.round(n || 0)); } };
  var analysis = PauseProofAlerts.analyze([], {}, alertSettings, ALERT_FMT);

  // اسم كل حساب وعملته وحالته — عشان تنبيهات مستوى الحساب
  function accountsMeta() {
    var meta = {};
    Object.keys(platformOptions).forEach(function (p) {
      (platformOptions[p] || []).forEach(function (o) {
        var info = accountInfo[p + ':' + o.value] || {};
        meta[p + ':' + o.value] = {
          label: o.label, currency: info.currency || null,
          metaAccountStatus: p === 'meta' && info.accountStatus != null ? Number(info.accountStatus) : null,
          // حد الصرف على الحساب: لما يتقفل، Meta بتوقف كل الإعلانات — بيظهر كتنبيه على مستوى الحساب
          spendCapReached: !!(p === 'meta' && Number(info.spendCap) > 0 && Number(info.amountSpent) >= Number(info.spendCap))
        };
      });
    });
    return meta;
  }
  function runAnalysis() { analysis = PauseProofAlerts.analyze(candidates, accountsMeta(), alertSettings, ALERT_FMT); }
  function adAnalysis(c) { return analysis.byAd[c.id] || { health: c.active ? 'good' : 'inactive', issues: [], metricLevels: {} }; }
  // كلاس اللون لمقياس معيّن لو عليه ملاحظة (أحمر/أصفر/أخضر)
  function mv(c, metric) { var lv = adAnalysis(c).metricLevels[metric]; return lv ? ' mv-' + lv : ''; }

  // ---------- Rendering ----------
  function previewMarkup(c) {
    // الرابط بيتحط جوه url('...') جوه style="..." — فلازم نشفّر ' و ( و ) عشان ميخرجش من CSS
    var thumb = safeUrl(c.thumbUrl);
    var bgStyle = thumb ? (' style="background-image:url(\'' + esc(thumb.replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29')) + '\');background-size:contain;background-repeat:no-repeat;background-position:center;"') : '';
    if (c.format === 'video') {
      var cls = thumb ? '' : (' ' + c.themeClass);
      return '<div class="preview preview-video' + cls + '"' + bgStyle + '><span class="play-icon-wrap"><span class="play-icon"></span></span></div>';
    }
    if (c.format === 'image') {
      if (thumb) { return '<div class="preview"' + bgStyle + '></div>'; }
      return '<div class="preview preview-image ' + c.themeClass + '"><span class="format-badge">' + t('card.staticDesign') + '</span></div>';
    }
    return '<div class="preview preview-text"><span class="text-url">' + esc(c.landing !== '—' ? c.landing : '') + '</span><span class="text-headline">' + esc(c.headline) + '</span><span class="text-desc">' + esc(c.desc) + '</span></div>';
  }

  // سبب إن الإعلان مش شغّال — موحّد لكل المنصات
  // (issue / ad-issue / adset-issue / campaign-issue بييجوا من سبب صريح بترجّعه المنصة نفسها — issues_info)
  var PAUSED_LABELS = i18nMap(['campaign', 'adset', 'ad', 'ended', 'scheduled', 'pending', 'rejected', 'account', 'account-cap',
    'not-eligible', 'budget', 'issue', 'ad-issue', 'adset-issue', 'campaign-issue'].reduce(function (o, k) { o[k] = 'st.' + k; return o; }, {}));
  // الحالة هنا هي حالة المنصة نفسها (عشان تطابق عمود Delivery في لوحتها). "نشط بس مش بيصرف" مش حالة —
  // دي ملاحظة، وبتظهر مرة واحدة كتنبيه ("إعلان فعّال لكنه مصرفش أمس") بدل ما تتكرر على الكارت
  function statusLabelOf(c) {
    if (c.active) return t('st.active');
    return PAUSED_LABELS[c.pausedLevel] || t('st.paused');
  }
  // اسم نوع النتيجة (مشتريات، محادثات...) بلغة الواجهة
  function resultLabelOf(c) { return t('res.' + (c.resultKey || 'generic')); }
  // نفس الاسم بس مظبوط على العدد: "١ عملية شراء" / "٥ مشتريات" / "1 purchase"
  function resultNounOf(c, n) { return t((I18N.form(n) === 'one' ? 'res1.' : 'res.') + (c.resultKey || 'generic')); }

  function cardChips(c) {
    // الأرقام للفترة المختارة. تلوين المشكلة (اللي جاي من تنبيهات آخر ٧ أيام) بيظهر بس لما الفترة
    // هي نفسها آخر ٧ أيام — عشان رقم ٣٠ يوم ميتلوّنش أحمر بسبب حاجة حصلت أمس بس
    var p = periodOf(c);
    var hl = function (metric) { return period.preset === 'last7' ? mv(c, metric) : ''; };
    var tip = ' — ' + periodLabel();
    var chips = '<span class="metric-chip' + hl('spend') + '" title="' + t('chip.spend') + tip + '">' + money(p.spend, c.currency) + '</span>';
    if (p.results != null) {
      chips += '<span class="metric-chip' + hl('results') + '" title="' + t('chip.results') + tip + '">' + ar(p.results) + ' ' + esc(resultNounOf(c, p.results)) + '</span>';
    }
    // تكلفة النتيجة (زي تكلفة الطلب CPO) والعائد (ROAS) الاتنين بيظهروا لو موجودين — كل واحد بيجاوب سؤال مختلف:
    // التكلفة مقارنةً بهامش ربحك، والعائد مقارنةً بالمبيعات
    if (p.cpr != null) {
      chips += '<span class="metric-chip' + hl('cpr') + '" title="' + t('chip.cprTip') + tip + '">' + money(p.cpr, c.currency) + ' / ' + esc(resultNounOf(c, 1)) + '</span>';
    }
    if (p.roas != null || hl('roas')) {
      chips += '<span class="metric-chip' + hl('roas') + '" title="' + t('chip.roasTip') + tip + '">' + t('chip.roas') + ' ' + roasStr(p.roas) + '</span>';
    }
    if (c.frequency != null && mv(c, 'frequency')) {
      chips += '<span class="metric-chip' + mv(c, 'frequency') + '" title="' + t('chip.freqTip') + '">' + t('chip.freq') + ' ' + numAr(c.frequency) + '</span>';
    }
    if (mv(c, 'delivery') && !mv(c, 'spend')) {
      chips += '<span class="metric-chip' + mv(c, 'delivery') + '">' + t('chip.weakDelivery') + '</span>';
    }
    return chips;
  }

  function cardMarkup(c) {
    var eid = esc(c.id);
    var a = adAnalysis(c);
    var h = HEALTH[a.health];
    var dot = '<span class="health-dot ' + h.cls + '" title="' + h.label + '"><span class="sr-only">' + h.label + '</span></span>';
    // ملاحظات "للعلم" (إعلان صغير بالنسبة لحسابه) مبتظهرش على الكارت — بتظهر في التفاصيل بس
    var shown = a.issues.filter(function (i) { return i.level !== 'info'; });
    var top = shown[0];
    var issueLine = top
      ? '<div class="card-issue ' + LEVELS[top.level].cls + '">' + esc(top.title) + (shown.length > 1 ? ' <span class="card-issue-more">+' + ar(shown.length - 1) + '</span>' : '') + '</div>'
      : '';
    var line1 = '<div class="card-line1">' + esc(c.platform) + ' <span style="color:var(--ink-faint);font-weight:400;">·</span> ' + esc(c.placement) + '</div>';
    var name = '<div class="card-name" title="' + esc(c.offer) + '">' + esc(c.offer) + '</div>';
    var info = '<div class="card-info">' + line1 + name + issueLine + '<div class="card-metrics">' + cardChips(c) + '</div>';

    return (
      '<article class="candidate-card ' + h.cls + '" id="card-' + eid + '" data-id="' + eid + '" tabindex="0" role="button" aria-label="' + esc(c.offer) + ' — ' + h.label + '">' +
        dot +
        previewMarkup(c) +
        info +
          '<div class="card-foot">' +
            '<span class="days-badge">' + sinceLabel(c.daysAgo) + '</span>' +
            '<span class="status-text' + (c.active ? ' on' : '') + '">' + statusLabelOf(c) + '</span>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }


  function visibleCandidates() {
    return candidates.filter(function (c) {
      if (filters.platform !== 'all' && c.platform !== filters.platform) return false;
      if (filters.format !== 'all' && c.format !== filters.format) return false;
      // «متوقف» = كل الإعلانات المتوقفة. الإعلان اللي وقف فجأة وعليه تنبيه عاجل بيظهر كمان تحت «يحتاج مراجعة»
      if (filters.health === 'stopped') { if (c.active) return false; }
      else if (filters.health !== 'all' && adAnalysis(c).health !== filters.health) return false;
      if (filters.campaign && campaignKey(c) !== filters.campaign) return false;
      if (filters.text) {
        var hay = (c.platform + ' ' + c.placement + ' ' + (c.adsetName || '') + ' ' + c.offer + ' ' + (c.headline || '') + ' ' + (c.desc || '') + ' ' + (c.caption || '')).toLowerCase();
        if (hay.indexOf(filters.text.toLowerCase()) === -1) return false;
      }
      return true;
    });
  }

  // ---------- العرض بالحملات ----------
  // الافتراضي "الإعلانات" (قرار صاحب المنتج)، والاختيار بيتحفظ — اللي بيفضّل الحملات بتفتح له على طول.
  // الحملة بتتجمع من الإعلانات الظاهرة بعد الفلاتر، فأرقامها بتطابق الفلتر الحالي
  var VIEW_KEY = 'acc.view.v1';
  var viewMode = (function () { try { return localStorage.getItem(VIEW_KEY) === 'campaigns' ? 'campaigns' : 'ads'; } catch (e) { return 'ads'; } })();
  function campaignKey(c) { return (c.source || c.platform) + '|' + (c.campaignId || c.campaignName || '-'); }
  function groupCampaigns(ads) {
    var map = {}, list = [];
    ads.forEach(function (c) {
      var key = campaignKey(c);
      var g = map[key];
      if (!g) {
        g = map[key] = { key: key, name: c.campaignName, platform: c.platform, currency: c.currency, ads: [],
          total: candidates.filter(function (x) { return campaignKey(x) === key; }).length };
        list.push(g);
      }
      g.ads.push(c);
    });
    list.forEach(function (g) {
      var spend = 0, sales = 0, results = 0, keys = {}, spend7 = 0, reviewSpend = 0, improveSpend = 0;
      g.active = 0; g.urgent = 0; g.important = 0; g.health = {};
      g.ads.forEach(function (c) {
        var p = periodOf(c), a = adAnalysis(c);
        spend += p.spend || 0; sales += p.sales || 0;
        if (p.results != null) { results += p.results; keys[c.resultKey || 'generic'] = true; }
        if (c.active) g.active++;
        g.health[a.health] = (g.health[a.health] || 0) + 1;
        spend7 += c.spend || 0;
        if (a.health === 'review') reviewSpend += c.spend || 0;
        if (a.health === 'improve') improveSpend += c.spend || 0;
      });
      // عدد التنبيهات من نفس قائمة صفحة التنبيهات (فيها كمان تنبيهات الحساب المربوطة بإعلان، زي تركيز الميزانية) —
      // عشان الرقم على كارت الحملة يطابق اللي هتلاقيه في التنبيهات
      var ids = {};
      g.ads.forEach(function (c) { ids[c.id] = true; });
      analysis.alerts.forEach(function (al) {
        if (!al.adId || !ids[al.adId]) return;
        if (al.level === 'critical') g.urgent++; else if (al.level === 'warning') g.important++;
      });
      var resultKeys = Object.keys(keys);
      g.spend = spend; g.sales = sales;
      g.resultKey = resultKeys.length === 1 ? resultKeys[0] : null;
      g.results = resultKeys.length === 1 ? results : null;
      g.mixedResults = resultKeys.length > 1;
      g.cpr = (g.results && spend > 0) ? spend / g.results : null;
      g.roas = (sales > 0 && spend > 0) ? sales / spend : null;
      // لون الحملة بالفلوس مش بالعدد: لو الإعلانات اللي محتاجة مراجعة واخدة ٣٠٪ أو أكتر من صرفها
      // (آخر ٧ أيام — نفس فترة التقييم) تبقى حمرا. إعلان صغير عليه مشكلة ميلوّنش الحملة كلها
      var share = function (x) { return spend7 > 0 ? x / spend7 : 0; };
      if (!g.active && !g.health.review) g.status = 'inactive';
      else if (spend7 > 0 ? share(reviewSpend) >= 0.3 : g.health.review) g.status = 'review';
      else if (spend7 > 0 ? share(reviewSpend + improveSpend) >= 0.3 : g.health.improve) g.status = 'improve';
      else g.status = 'good';
      g.newest = Math.min.apply(null, g.ads.map(function (c) { return c.daysAgo == null ? Number.MAX_SAFE_INTEGER : c.daysAgo; }));
      g.updated = Math.min.apply(null, g.ads.map(function (c) { return c.updatedDaysAgo == null ? Number.MAX_SAFE_INTEGER : c.updatedDaysAgo; }));
    });
    return list;
  }
  function sortCampaigns(list, key) {
    var arr = list.slice();
    if (key === 'launch') arr.sort(function (a, b) { return a.newest - b.newest; });
    else if (key === 'update') arr.sort(function (a, b) { return a.updated - b.updated; });
    else if (key === 'spend') arr.sort(function (a, b) { return b.spend - a.spend; });
    else arr.sort(function (a, b) { return (HEALTH[a.status].order - HEALTH[b.status].order) || (b.urgent - a.urgent) || (b.spend - a.spend); });
    return arr;
  }
  function campaignMarkup(g) {
    var h = HEALTH[g.status];
    var name = g.name || t('camp.noName');
    var count = g.ads.length < g.total
      ? t('camp.adsOf', { n: ar(g.ads.length), total: ar(g.total), ads: noun(g.total, 'n.ad') })
      : ar(g.total) + ' ' + noun(g.total, 'n.ad');
    var chips = '<span class="metric-chip">' + money(g.spend, g.currency) + '</span>';
    if (g.results != null) chips += '<span class="metric-chip">' + ar(g.results) + ' ' + esc(t((I18N.form(g.results) === 'one' ? 'res1.' : 'res.') + (g.resultKey || 'generic'))) + '</span>';
    else if (g.mixedResults) chips += '<span class="metric-chip">' + t('camp.mixedResults') + '</span>';
    if (g.cpr != null) chips += '<span class="metric-chip" title="' + t('chip.cprTip') + '">' + money(g.cpr, g.currency) + ' / ' + esc(t('res1.' + (g.resultKey || 'generic'))) + '</span>';
    if (g.roas != null) chips += '<span class="metric-chip" title="' + t('chip.roasTip') + '">' + t('chip.roas') + ' ' + roasStr(g.roas) + '</span>';
    var issues = [];
    if (g.urgent) issues.push('<span class="camp-badge lv-critical">' + t('camp.urgent', { n: ar(g.urgent) }) + '</span>');
    if (g.important) issues.push('<span class="camp-badge lv-warning">' + t('camp.important', { n: ar(g.important) }) + '</span>');
    if (!issues.length) issues.push('<span class="camp-badge-none">' + t('camp.noIssues') + '</span>');
    var ek = esc(g.key);
    return '<article class="campaign-card ' + h.cls + '" data-campaign="' + ek + '" tabindex="0" role="button" aria-label="' + esc(name) + ' — ' + h.label + '">' +
        '<div class="camp-top"><span class="health-dot-inline"></span><span class="camp-platform">' + esc(g.platform) + '</span>' +
          '<span class="camp-active">' + t('camp.activeOf', { a: ar(g.active), n: ar(g.ads.length) }) + '</span></div>' +
        '<div class="camp-name" title="' + esc(name) + '">' + esc(name) + '</div>' +
        '<div class="camp-count">' + count + '</div>' +
        '<div class="card-metrics">' + chips + '</div>' +
        '<div class="camp-issues">' + issues.join('') + '</div>' +
        '<div class="camp-open">' + t('camp.showAds') + '</div>' +
      '</article>';
  }
  function setViewMode(mode) {
    viewMode = mode === 'campaigns' ? 'campaigns' : 'ads';
    try { localStorage.setItem(VIEW_KEY, viewMode); } catch (e) { /* مش مهم */ }
    // الرجوع لعرض الحملات بيلغي "إعلانات حملة معيّنة" — عشان تشوف كل الحملات تاني
    if (viewMode === 'campaigns') filters.campaign = null;
    render();
  }
  document.getElementById('viewSwitch').addEventListener('click', function (e) {
    var b = e.target.closest('[data-mode]'); if (!b) return;
    setViewMode(b.dataset.mode);
  });
  function openCampaign(el) {
    var key = el.getAttribute('data-campaign');
    var g = candidates.filter(function (c) { return campaignKey(c) === key; })[0];
    filters.campaign = key;
    filters.campaignName = (g && g.campaignName) || null;
    // بنعرض إعلانات الحملة من غير ما نغيّر الاختيار المحفوظ — لو كان "الحملات" هيفضل هو اللي يفتح المرة الجاية
    viewMode = 'ads';
    render();
    window.scrollTo({ top: document.getElementById('adsContent').offsetTop - 70, behavior: 'smooth' });
  }

  function sortCandidates(list, key) {
    var arr = list.slice();
    // القيم غير المعروفة (null) تنزل آخر القائمة
    var age = function (v) { return v == null ? Number.MAX_SAFE_INTEGER : v; };
    if (key === 'priority') {
      // الأهم أولاً: يحتاج مراجعة ← يحتاج تحسين ← جيد ← غير فعال، وجوه كل مجموعة الأعلى إنفاقاً
      arr.sort(function (a, b) { return (HEALTH[adAnalysis(a).health].order - HEALTH[adAnalysis(b).health].order) || (periodOf(b).spend - periodOf(a).spend); });
    }
    else if (key === 'launch') arr.sort(function (a, b) { return age(a.daysAgo) - age(b.daysAgo); });
    else if (key === 'update') arr.sort(function (a, b) { return age(a.updatedDaysAgo) - age(b.updatedDaysAgo); });
    else if (key === 'spend') arr.sort(function (a, b) { return periodOf(b).spend - periodOf(a).spend; });
    return arr;
  }

  // الكروت بتترسم على دفعات (٦٠ كارت) — حساب فيه آلاف الإعلانات كان هيتقّل الصفحة على الموبايل.
  // الترتيب بالأولوية بيضمن إن اللي محتاج انتباه يبقى في أول دفعة. أي تغيير في الفلتر أو العرض بيرجّع لأول دفعة
  var RENDER_STEP = 60;
  var renderLimit = RENDER_STEP, renderSignature = '';
  function moreButton(shown, total) {
    if (total <= shown) return '';
    return '<button type="button" class="show-more" data-show-more>' + t('more.show', { n: ar(Math.min(RENDER_STEP, total - shown)) }) + '</button>';
  }

  function render() {
    runAnalysis();
    // لو الحملة اللي كنت فاتحها مش موجودة تاني (بدّلت الحساب مثلاً) الفلتر بيتشال لوحده
    if (filters.campaign && !candidates.some(function (c) { return campaignKey(c) === filters.campaign; })) filters.campaign = null;
    var visible = sortCandidates(visibleCandidates(), filters.sort);
    var signature = JSON.stringify([filters, viewMode, periodKey()]);
    if (signature !== renderSignature) { renderSignature = signature; renderLimit = RENDER_STEP; }
    // شاشة البداية بتظهر بس لما مفيش إعلانات ومفيش تحميل شغّال
    var empty = !candidates.length && !anyLoading();
    document.getElementById('emptyHero').classList.toggle('hidden', !empty);
    document.getElementById('adsContent').classList.toggle('hidden', empty);
    if (!candidates.length) {
      if (!anyLoading()) cardGrid.innerHTML = '';
      galleryCount.textContent = anyLoading() ? t('gallery.loading') : t('gallery.login');
    } else if (viewMode === 'campaigns') {
      var camps = sortCampaigns(groupCampaigns(visible), filters.sort);
      cardGrid.innerHTML = camps.length
        ? camps.slice(0, renderLimit).map(campaignMarkup).join('') + moreButton(renderLimit, camps.length)
        : '<div class="empty-state" style="grid-column:1/-1">' + t('gallery.noMatch') + '</div>';
      galleryCount.textContent = t('gallery.countCampaigns', { n: ar(camps.length), camps: noun(camps.length, 'n.campaign'), m: ar(visible.length), ads: noun(visible.length, 'n.ad') });
    } else {
      cardGrid.innerHTML = visible.length
        ? visible.slice(0, renderLimit).map(cardMarkup).join('') + moreButton(renderLimit, visible.length)
        : '<div class="empty-state" style="grid-column:1/-1">' + t('gallery.noMatch') + '</div>';
      galleryCount.textContent = t('gallery.count', { n: ar(visible.length), total: ar(candidates.length), ads: noun(candidates.length, 'n.ad') });
    }
    var upd = document.getElementById('lastUpdated');
    upd.textContent = lastUpdatedAt && candidates.length
      ? t('upd.at', { time: new Date(lastUpdatedAt).toLocaleTimeString(isAr() ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit' }) })
      : '';
    document.querySelectorAll('#viewSwitch [data-mode]').forEach(function (b) {
      var on = b.dataset.mode === viewMode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    renderHealthCounts();
    renderFilterState();
    renderKpis();
    renderTopAlerts();
    renderAlerts();
  }

  // عدد الإعلانات في كل اختيار — بيظهر جنبه في فلتر "الحالة".
  // "متوقف" = كل المتوقف، فالإعلان اللي وقف فجأة بيتعد فيها وفي "يحتاج مراجعة" الاتنين
  function renderHealthCounts() {
    var counts = analysis.summary.health;
    var stopped = candidates.filter(function (c) { return !c.active; }).length;
    document.querySelectorAll('[data-health-count]').forEach(function (el) {
      var k = el.getAttribute('data-health-count');
      el.textContent = candidates.length ? ar(k === 'stopped' ? stopped : (counts[k] || 0)) : '';
    });
  }


  // ---------- اختيار فترة البيانات ----------
  var periodSelect = document.getElementById('periodSelect');
  var periodCustom = document.getElementById('periodCustom');
  function syncPeriodUi() {
    periodSelect.value = period.preset;
    periodCustom.classList.toggle('hidden', period.preset !== 'custom');
    var today = todayKeyInTz(BROWSER_TZ);
    dateFrom.max = today; dateTo.max = today;
    if (period.preset === 'custom') { dateFrom.value = period.since || ''; dateTo.value = period.until || ''; }
    var r = resolvePeriodFor(BROWSER_TZ);
    document.getElementById('periodRangeText').textContent = r.since === r.until ? fmtKey(r.since) : fmtKey(r.since) + ' — ' + fmtKey(r.until);
  }
  // تغيير الفترة بيعيد تحميل كل الحسابات المتصلة بالأرقام الجديدة (ولو فيه نسخة محفوظة للفترة دي بتظهر فوراً)
  function applyPeriod(next) {
    period = next;
    savePeriod();
    syncPeriodUi();
    Object.keys(activeSources).forEach(function (p) { loadSource(p, activeSources[p]); });
    render();
  }
  periodSelect.addEventListener('change', function () {
    if (periodSelect.value === 'custom') {
      // الفترة المخصصة بتستنى زرار "تطبيق" — عشان متعملش تحميل مع كل تاريخ بتغيّره
      periodCustom.classList.remove('hidden');
      var r = resolvePeriodFor(BROWSER_TZ);
      if (!dateFrom.value) dateFrom.value = r.since;
      if (!dateTo.value) dateTo.value = r.until;
      return;
    }
    applyPeriod({ preset: periodSelect.value });
  });
  document.getElementById('periodApply').addEventListener('click', function () {
    if (!dateFrom.value || !dateTo.value) { setStatus(msg('period.pickDates')); return; }
    applyPeriod({ preset: 'custom', since: dateFrom.value, until: dateTo.value });
  });
  syncPeriodUi();

  // ---------- درج الفلاتر ----------
  var filterDrawer = document.getElementById('filterDrawer');
  function openFilters() { filterDrawer.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
  function closeFilters() { filterDrawer.classList.add('hidden'); document.body.style.overflow = ''; }
  filterToggle.addEventListener('click', openFilters);
  document.getElementById('filterDrawerClose').addEventListener('click', closeFilters);
  document.getElementById('filterDrawerDone').addEventListener('click', closeFilters);
  filterDrawer.addEventListener('click', function (e) { if (e.target.hasAttribute('data-close-drawer')) closeFilters(); });
  document.getElementById('clearFiltersBtn').addEventListener('click', function () {
    resetFilterChips();
    render();
  });
  document.getElementById('heroLoginBtn').addEventListener('click', function () { platformOverlay.classList.remove('hidden'); });

  // وصف كل فلتر شغّال — بيظهر كشرائح فوق الإعلانات، والضغط على أي واحدة بيلغيها
  var FILTER_LABELS = {
    health: i18nMap({ review: 'health.review', improve: 'health.improve', good: 'health.good', stopped: 'health.inactive' }),
    format: i18nMap({ video: 'format.video', image: 'format.image', text: 'format.text' })
  };
  function activeFilterList() {
    var out = [];
    ['health', 'format', 'platform'].forEach(function (k) {
      if (filters[k] === 'all') return;
      var label = (FILTER_LABELS[k] && FILTER_LABELS[k][filters[k]]) || filters[k];
      out.push({ key: k, label: label });
    });
    if (filters.text) out.push({ key: 'text', label: t('filters.searchChip', { q: filters.text }) });
    if (filters.campaign) out.push({ key: 'campaign', label: t('filters.campaignChip', { name: filters.campaignName || t('camp.noName') }) });
    return out;
  }
  function renderFilterState() {
    var list = activeFilterList();
    document.getElementById('filterCount').textContent = list.length ? ar(list.length) : '';
    document.getElementById('activeFilters').innerHTML = list.map(function (f) {
      return '<button type="button" class="active-filter" data-filter-key="' + f.key + '">' + esc(f.label) + '</button>';
    }).join('');
  }
  document.getElementById('activeFilters').addEventListener('click', function (e) {
    var btn = e.target.closest('.active-filter'); if (!btn) return;
    var key = btn.dataset.filterKey;
    if (key === 'text') { filters.text = ''; textFilter.value = ''; }
    else if (key === 'campaign') { filters.campaign = null; }
    else {
      var group = document.querySelector('.filter-group[data-filter="' + key + '"]');
      if (group) setFilterChip(group, 'all'); else filters[key] = 'all';
    }
    render();
  });

  // ---------- ملخص الأرقام فوق الإعلانات ----------
  function renderKpis() {
    var strip = document.getElementById('kpiStrip');
    if (!candidates.length) { strip.innerHTML = ''; return; }
    // المجاميع بتتحسب لكل عملة على حدة — جمع ريال مع دولار يطلع رقم بلا معنى
    var spendByCur = {}, resultsTotal = 0;
    candidates.forEach(function (c) {
      var p = periodOf(c);
      spendByCur[c.currency || ''] = (spendByCur[c.currency || ''] || 0) + (p.spend || 0);
      resultsTotal += p.results || 0;
    });
    var joinMoney = function (map) {
      var keys = Object.keys(map).filter(function (k) { return map[k] > 0; });
      return keys.length ? keys.map(function (k) { return money(map[k], k || null); }).join(' + ') : money(0);
    };
    var atRisk = analysis.summary.atRisk;
    var review = analysis.summary.health.review;
    var hasRisk = Object.keys(atRisk).some(function (k) { return atRisk[k] > 0; });
    // action: الرقم بيبقى زرار — "معرّض للهدر" بيفتح التنبيهات اللي وراه، و"تحتاج مراجعة" بيفلتر الإعلانات دي
    var box = function (label, value, cls, action) {
      var inner = '<div class="kpi-label">' + label + '</div><div class="kpi-value">' + value + '</div>';
      return action
        ? '<button type="button" class="kpi kpi-link' + (cls || '') + '" data-kpi="' + action + '">' + inner + '</button>'
        : '<div class="kpi' + (cls || '') + '">' + inner + '</div>';
    };
    strip.innerHTML =
      box(t('kpi.spend', { p: periodLabel() }), joinMoney(spendByCur)) +
      box(t('kpi.results', { p: periodLabel() }), ar(resultsTotal)) +
      box(t('kpi.atRisk'), joinMoney(atRisk), ' kpi-risk', hasRisk ? 'risk' : null) +
      box(t('kpi.review'), ar(review), review ? ' kpi-review' : '', review ? 'review' : null);
  }
  document.getElementById('kpiStrip').addEventListener('click', function (e) {
    var b = e.target.closest('[data-kpi]'); if (!b) return;
    if (b.dataset.kpi === 'risk') { openAlertsView('risk'); return; }
    var group = document.querySelector('.filter-group[data-filter="health"]');
    if (group) setFilterChip(group, 'review');
    // بنعرض الإعلانات من غير ما نغيّر طريقة العرض المحفوظة
    viewMode = 'ads';
    render();
  });

  // ---------- أهم التنبيهات فوق الإعلانات ----------
  // أهم ٣ تنبيهات (عاجل ثم مهم) بتظهر في صفحة الإعلانات نفسها — عشان متعتمدش على إن حد يفتح تبويب التنبيهات
  function renderTopAlerts() {
    var el = document.getElementById('topAlerts');
    if (!candidates.length) { el.innerHTML = ''; return; }
    var list = analysis.alerts.filter(function (a) { return a.level === 'critical' || a.level === 'warning'; });
    if (!list.length) { el.innerHTML = '<div class="top-alerts-ok">✓ ' + t('top.none') + '</div>'; return; }
    el.innerHTML =
      '<div class="top-alerts-head"><span class="top-alerts-title">' + t('top.title') + '</span>' +
        '<button type="button" class="top-alerts-all" data-go-alerts>' + t('top.all', { n: ar(list.length) }) + '</button></div>' +
      list.slice(0, 3).map(function (a) {
        var target = a.adId && findCandidate(a.adId) ? ' data-ad-id="' + esc(a.adId) + '"' : ' data-go-alerts';
        var src = a.adName ? (a.platform || '') + ' · ' + a.adName : (a.accountName || a.platform || '');
        return '<button type="button" class="top-alert ' + LEVELS[a.level].cls + '"' + target + '>' +
          '<span class="top-alert-level">' + LEVELS[a.level].label + '</span>' +
          '<span class="top-alert-text"><span class="top-alert-title">' + esc(a.title) + '</span>' +
          '<span class="top-alert-src">' + esc(src) + '</span></span></button>';
      }).join('');
  }
  document.getElementById('topAlerts').addEventListener('click', function (e) {
    var ad = e.target.closest('[data-ad-id]');
    if (ad) { var c = findCandidate(ad.getAttribute('data-ad-id')); if (c) openExpand(c); return; }
    if (e.target.closest('[data-go-alerts]')) openAlertsView('urgent');
  });

  document.querySelectorAll('.filter-group').forEach(function (group) {
    group.addEventListener('click', function (e) {
      var btn = e.target.closest('.chip'); if (!btn) return;
      setFilterChip(group, btn.dataset.value);
      render();
    });
  });
  function setFilterChip(group, value) {
    group.querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('active', c.dataset.value === value); });
    filters[group.dataset.filter] = value;
  }
  textFilter.addEventListener('input', function () { filters.text = textFilter.value; render(); });
  sortSelect.addEventListener('change', function () { filters.sort = sortSelect.value; render(); });


  function metricBox(label, value, extraCls) { return '<div class="metric-box' + (extraCls || '') + '"><div class="metric-label">' + label + '</div><div class="metric-value">' + value + '</div></div>'; }

  var DEST_LABELS = i18nMap({ whatsapp: 'dest.whatsapp', messenger: 'dest.messenger', website: 'dest.website' });

  function issueMarkup(i) {
    return '<div class="issue-item ' + LEVELS[i.level].cls + '">' +
      '<div class="issue-title"><span class="issue-level">' + LEVELS[i.level].label + '</span>' + esc(i.title) + '</div>' +
      '<div class="issue-detail">' + esc(i.detail) + '</div>' +
      '<div class="issue-advice">💡 ' + esc(i.advice) + '</div>' +
    '</div>';
  }

  // ---------- فتح الإعلان في المنصة ----------
  // Meta بس بتسمح برابط مباشر للإعلان نفسه. Google محتاجة رقم داخلي (ocid) مش بيرجع من الـ API،
  // وSnapchat مالهاش رابط موثّق للحساب — فبنفتح أقرب مكان، ونكتب للمستخدم يدوّر على إيه
  function formatGoogleId(id) { return /^\d{10}$/.test(id) ? id.slice(0, 3) + '-' + id.slice(3, 6) + '-' + id.slice(6) : id; }
  function platformLink(c) {
    var src = c.source || '';
    var acct = src.slice(src.indexOf(':') + 1);
    if (c.platform === 'Meta') {
      return {
        url: 'https://adsmanager.facebook.com/adsmanager/manage/ads?act=' + encodeURIComponent(acct.replace(/^act_/, '')) +
          '&selected_ad_ids=' + encodeURIComponent(c.nativeId || c.id),
        label: t('x.openMeta'), note: ''
      };
    }
    if (c.platform === 'Google Ads') {
      var q = [];
      if (c.campaignId) q.push('campaignId=' + encodeURIComponent(c.campaignId));
      if (c.adGroupId) q.push('adGroupId=' + encodeURIComponent(c.adGroupId));
      return { url: 'https://ads.google.com/aw/ads' + (q.length ? '?' + q.join('&') : ''), label: t('x.openGoogle'), note: t('x.openGoogleNote', { acct: formatGoogleId(acct) }) };
    }
    if (c.platform === 'TikTok') {
      return { url: 'https://ads.tiktok.com/i18n/perf/adgroup?aadvid=' + encodeURIComponent(acct), label: t('x.openTikTok'), note: t('x.findAdNote', { name: c.offer }) };
    }
    if (c.platform === 'Snapchat') {
      return { url: 'https://ads.snapchat.com/', label: t('x.openSnapchat'), note: t('x.findAdNote', { name: c.offer }) };
    }
    return null;
  }

  var expandSeq = 0;
  function openExpand(c) {
    var a = adAnalysis(c);
    var h = HEALTH[a.health];
    document.getElementById('expandTitle').textContent = c.offer;
    // الحملة والمجموعة الإعلانية الاتنين — عشان تلاقي الإعلان بسهولة في المنصة
    var where = [c.campaignName, c.adsetName].filter(Boolean).join(' / ') || c.placement;
    document.getElementById('expandSub').textContent = c.platform + ' · ' + where + ' · ' + statusLabelOf(c) + (c.daysAgo != null ? ' — ' + sinceLabel(c.daysAgo) : '');
    var link = platformLink(c);
    document.getElementById('expandOpen').innerHTML = link
      ? '<a class="open-platform" href="' + esc(link.url) + '" target="_blank" rel="noopener noreferrer">' + esc(link.label) + ' ↗</a>' +
        (link.note ? '<div class="open-platform-note">' + esc(link.note) + '</div>' : '')
      : '';
    document.getElementById('expandHealth').innerHTML = '<span class="health-badge ' + h.cls + '"><span class="health-dot-inline"></span>' + h.label + '</span>';
    // سطر "حالة الظهور": التقييم بتاعنا + سبب المنصة نفسه لو موجود + الحالة الخام —
    // ده اللي بيخلّيك تقارن بسطر واحد مع عمود Delivery في لوحة المنصة
    var statusBits = [statusLabelOf(c)];
    if (c.deliveryReason) statusBits.push(c.deliveryReason);
    if (c.platformStatus) statusBits.push(t('x.platformStatus', { s: c.platformStatus }));
    document.getElementById('expandStatus').innerHTML =
      '<span class="status-line-label">' + t('x.delivery') + '</span><span class="status-line-value">' + esc(statusBits.join(' — ')) + '</span>';
    document.getElementById('expandIssues').innerHTML = a.issues.length
      ? a.issues.map(issueMarkup).join('')
      : (c.active ? '<div class="issue-none">' + t('x.noIssues') + '</div>' : '');
    document.getElementById('expandCaption').textContent = c.caption || c.headline || t('x.noText');

    var destLabel = DEST_LABELS[c.landingKind] || t('dest.default');
    // الرابط بيبقى قابل للضغط بس لو http/https — غير كده بيتعرض كنص عادي
    var landingHref = safeUrl(c.landing);
    var landingInner = landingHref
      ? '<a href="' + esc(landingHref) + '" target="_blank" rel="noopener noreferrer" class="expand-landing-value mono">' + esc(c.landing) + '</a>'
      : '<span class="expand-landing-value mono">' + esc(c.landing || '—') + '</span>';
    document.getElementById('expandLanding').innerHTML = '<div class="expand-landing"><span class="expand-landing-label">' + destLabel + '</span>' + landingInner + '</div>';

    var cur = c.currency;
    var hasSales = c.dailySales.some(function (v) { return v > 0; });
    // مربعات الأرقام للفترة المختارة. التلوين بيظهر بس لو الفترة آخر ٧ أيام (نفس فترة التنبيهات)
    var p = periodOf(c);
    var hl = function (metric) { return period.preset === 'last7' ? mv(c, metric) : ''; };
    var pl = ' (' + periodLabel() + ')';
    var resultsLabelTxt = p.results != null ? (t('x.results') + ' — ' + esc(resultLabelOf(c)) + pl) : t('x.results') + pl;
    var boxes =
      metricBox(t('x.spend') + pl, money(p.spend, cur), hl('spend') || hl('delivery')) +
      metricBox(resultsLabelTxt, p.results != null ? ar(p.results) : t('x.noConversions'), hl('results')) +
      metricBox(t('x.cpr'), p.cpr != null ? money(p.cpr, cur) : '—', hl('cpr')) +
      metricBox(t('x.roas'), roasStr(p.roas), hl('roas'));
    if (c.frequency != null) boxes += metricBox(t('x.freq'), numAr(c.frequency) + ' ' + t('x.times'), mv(c, 'frequency'));
    boxes += metricBox(t('x.sales') + pl, p.sales > 0 ? money(p.sales, cur) : t('x.noSales'));
    document.getElementById('expandMetrics').innerHTML = boxes;

    // السلسلة الثانية: مبيعات فعلية لو موجودة، وإلا عدد النتائج (حسب هدف الإعلان نفسه) كبديل مفيد
    var secondSeries = hasSales ? c.dailySales : c.dailyResults;
    var secondRowLabel = hasSales ? t('x.salesRow', { cur: currencyLabel(cur) }) : (t('x.results') + (c.resultKey ? ' — ' + esc(resultLabelOf(c)) : ''));
    document.getElementById('legendSalesLabel').textContent = hasSales ? t('x.salesLegend') : t('x.resultsLegend');
    // عمود "أمس" متعلّم — أغلب التنبيهات مبنية عليه، وعمود النهارده يوم لسه مخلصش
    var colCls = function (i) { return i === 5 ? ' class="col-yesterday"' : (i === 6 ? ' class="col-today"' : ''); };
    var headerCells = c.dailyDates.map(function (dt, i) { return '<th' + colCls(i) + '>' + (i === 5 ? t('x.yesterday') : (i === 6 ? t('x.today') : fmtKey(dt))) + '</th>'; }).join('');
    var spendCells = c.daily.map(function (v, i) { return '<td' + colCls(i) + '><span class="mono">' + digitsAny(Math.round(v)) + '</span></td>'; }).join('');
    var secondCells = secondSeries.map(function (v, i) { return '<td' + colCls(i) + '><span class="mono">' + digitsAny(Math.round(v)) + '</span></td>'; }).join('');
    document.getElementById('expandChart').innerHTML =
      '<div class="daily-table-wrap"><table class="daily-table"><thead><tr><th></th>' + headerCells + '</tr></thead>' +
      '<tbody><tr><td>' + t('x.spendRow', { cur: currencyLabel(cur) }) + '</td>' + spendCells + '</tr>' +
      '<tr><td>' + secondRowLabel + '</td>' + secondCells + '</tr></tbody></table></div>';

    expandOverlay.classList.remove('hidden');
    expandOverlay.querySelector('.expand-card').scrollTop = 0;

    showMedia(c);
  }

  // الوسائط: إعلانات الصور بتتعرض بالملف الأصلي للصورة (اللي بيتسحب من مكتبة صور الحساب).
  // إعلانات الفيديو بتحاول تشغّل الفيديو نفسه عن طريق معاينة Meta، وتفضل على الغلاف لو فشلت.
  // كل فتح بياخد رقم — عشان رد متأخر من Meta لإعلان قديم ميكتبش فوق الإعلان المفتوح دلوقتي
  // صفحة معاينة Meta مقاسها ثابت ومش بتتمدد — لو أعرض من النافذة (موبايل مثلاً) بنصغّرها بنفس النسبة
  // بدل ما تتقص، وبنظبط ارتفاع الحاوية على المقاس الجديد عشان ميفضلش فراغ
  function fitEmbeds(el) {
    Array.prototype.slice.call(el.querySelectorAll('.video-embed-wrap iframe')).forEach(function (frame) {
      if (/aspect-ratio/.test(frame.getAttribute('style') || '')) return; // مشغّل الفيديو بيتمدد لوحده
      var wrap = frame.parentNode;
      var w = parseFloat(frame.style.width), h = parseFloat(frame.style.height);
      var available = wrap.clientWidth;
      if (!w || !h || !available || w <= available) return;
      var scale = available / w;
      frame.style.transform = 'scale(' + scale + ')';
      frame.style.transformOrigin = 'top center';
      wrap.style.height = Math.ceil(h * scale) + 'px';
      wrap.style.overflow = 'hidden';
    });
  }

  function showMedia(c) {
    var openSeq = ++expandSeq;
    var el = document.getElementById('expandPreview');
    el.innerHTML = previewMarkup(c);
    if (!c.videoId || c.platform !== 'Meta' || typeof FB === 'undefined') return;

    // المحاولة الأولى: Ad Previews API — أداة Meta الرسمية لمعاينة الإعلان كما يظهر فعلياً
    FB.api('/' + c.id + '/previews', { ad_format: 'MOBILE_FEED_STANDARD' }, function (prevResp) {
      if (openSeq !== expandSeq) return;
      var previewFrame = prevResp && prevResp.data && prevResp.data[0] && metaIframeHtml(prevResp.data[0].body);
      if (previewFrame) {
        el.innerHTML = '<div class="video-embed-wrap">' + previewFrame + '</div>';
        fitEmbeds(el);
        return;
      }
      // المحاولة الثانية للفيديو: بيانات الفيديو مباشرة (تضمين رسمي، ثم ملف مباشر، ثم رابط خارجي)
      FB.api('/' + c.videoId, { fields: 'embed_html,source,permalink_url,picture' }, function (vidResp) {
        if (openSeq !== expandSeq) return;
        var mediaHtml = '';
        var embedFrame = vidResp && metaIframeHtml(vidResp.embed_html);
        var videoSrc = vidResp && safeUrl(vidResp.source);
        var posterSrc = vidResp && safeUrl(vidResp.picture);
        if (embedFrame) {
          mediaHtml = '<div class="video-embed-wrap">' + embedFrame + '</div>';
        } else if (videoSrc) {
          mediaHtml = '<video class="real-video" controls playsinline preload="metadata"' +
            (posterSrc ? ' poster="' + esc(posterSrc) + '"' : '') +
            '><source src="' + esc(videoSrc) + '" type="video/mp4"></video>';
        }
        var permalink = vidResp && vidResp.permalink_url && safeUrl('https://www.facebook.com' + vidResp.permalink_url);
        var linkHtml = permalink
          ? '<a class="video-fallback-link" href="' + esc(permalink) + '" target="_blank" rel="noopener noreferrer">' + t('x.openVideo') + '</a>'
          : '';
        if (mediaHtml || linkHtml) {
          el.innerHTML = mediaHtml + linkHtml;
          fitEmbeds(el);
        } else {
          el.innerHTML += '<div class="video-fallback-note">' + t('x.videoFailed') + '</div>';
        }
      });
    });
  }

  expandClose.addEventListener('click', function () { expandOverlay.classList.add('hidden'); });
  expandOverlay.addEventListener('click', function (e) { if (e.target === expandOverlay) expandOverlay.classList.add('hidden'); });
  function closeOverlays() {
    expandOverlay.classList.add('hidden');
    settingsOverlay.classList.add('hidden');
    platformOverlay.classList.add('hidden');
    closeFilters();
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeOverlays();
  });

  function findCandidate(id) { return candidates.filter(function (x) { return x.id === id; })[0]; }

  // الضغط على أي مكان في الكارت بيفتح التفاصيل
  // كارت الحملة بيفتح إعلاناتها، وكارت الإعلان بيفتح تفاصيله
  function activateCard(e) {
    if (e.target.closest('[data-show-more]')) { renderLimit += RENDER_STEP; render(); return true; }
    var camp = e.target.closest('.campaign-card');
    if (camp) { openCampaign(camp); return true; }
    var card = e.target.closest('.candidate-card');
    if (!card) return false;
    var picked = findCandidate(card.dataset.id);
    if (picked) openExpand(picked);
    return true;
  }
  cardGrid.addEventListener('click', activateCard);
  cardGrid.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest('.campaign-card, .candidate-card')) { e.preventDefault(); activateCard(e); }
  });

  // ---------- التبويبات: الإعلانات / التنبيهات ----------
  var viewTabs = document.querySelectorAll('.view-tab');
  function showView(view) {
    viewTabs.forEach(function (t) {
      var on = t.dataset.view === view;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.getElementById('viewAds').classList.toggle('hidden', view !== 'ads');
    document.getElementById('viewAlerts').classList.toggle('hidden', view !== 'alerts');
  }
  // فتح تبويب التنبيهات من فوق بيرجّعه للعرض العادي (العاجل + المهم)، حتى لو كان متفلتر قبل كده
  viewTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      if (tab.dataset.view === 'alerts') openAlertsView('urgent'); else showView(tab.dataset.view);
    });
  });


  // ---------- صفحة التنبيهات ----------
  // الافتراضي "urgent" = العاجل والمهم مع بعض — دول اللي محتاجين قرار. الفرص في قسم لوحدها
  var alertsLevelFilter = 'urgent';
  var alertsSummaryEl = document.getElementById('alertsSummary');
  var alertsListEl = document.getElementById('alertsList');
  var alertsTabCount = document.getElementById('alertsTabCount');

  function alertMarkup(a) {
    var clickable = a.adId && findCandidate(a.adId);
    // اسم الحساب فيه اسم المنصة أصلاً (مثال: "Meta — متجري")، فمنكررهاش
    var source = a.adName ? esc(a.platform || '') + ' · ' + esc(a.adName) : esc(a.accountName || a.platform || '');
    return '<article class="alert-item ' + LEVELS[a.level].cls + (clickable ? ' clickable' : '') + '"' +
        (clickable ? ' data-ad-id="' + esc(a.adId) + '" tabindex="0" role="button"' : '') + '>' +
      '<div class="alert-head"><span class="alert-level">' + LEVELS[a.level].label + '</span><span class="alert-source">' + source + '</span></div>' +
      '<div class="alert-title">' + esc(a.title) + '</div>' +
      '<p class="alert-detail">' + esc(a.detail) + '</p>' +
      '<p class="alert-advice">💡 ' + esc(a.advice) + '</p>' +
    '</article>';
  }

  function renderAlerts() {
    var s = analysis.summary;
    // الرقم على التبويب = العاجل بس — الحاجة اللي محتاجة تدخّل النهارده
    alertsTabCount.textContent = s.levels.critical ? ar(s.levels.critical) : '';
    alertsTabCount.classList.toggle('has-critical', s.levels.critical > 0);

    if (!candidates.length) {
      alertsSummaryEl.innerHTML = '';
      alertsListEl.innerHTML = '<div class="empty-state">' + t('alerts.loginFirst') + '</div>';
      return;
    }

    var box = function (key, cls, count, label) {
      return '<button type="button" class="summary-box ' + cls + (alertsLevelFilter === key ? ' active' : '') + '" data-level="' + key + '">' +
        '<span class="summary-count">' + ar(count) + '</span><span class="summary-label">' + label + '</span></button>';
    };
    // رقم "الميزانية المعرّضة للهدر" مكانه فوق صفحة الإعلانات بس. لما تدوس عليه بيجيبك هنا
    // والقايمة متفلترة على التنبيهات اللي وراه، ومعاها شريط يوضّح ده ويرجّعك للعرض العادي
    var riskBar = '';
    if (alertsLevelFilter === 'risk') {
      var riskKeys = Object.keys(s.atRisk).filter(function (k) { return s.atRisk[k] > 0; });
      var riskText = riskKeys.length ? riskKeys.map(function (cur) { return money(s.atRisk[cur], cur || null); }).join(' + ') : money(0);
      riskBar = '<div class="risk-filter"><span>' + t('alerts.riskShowing', { amount: riskText }) + '</span>' +
        '<button type="button" class="risk-filter-clear" data-level="urgent">' + t('alerts.showAll') + '</button></div>';
    }
    alertsSummaryEl.innerHTML = riskBar +
      '<div class="summary-boxes summary-boxes-3">' +
        box('critical', 'lv-critical', s.levels.critical, t('alerts.boxUrgent')) +
        box('warning', 'lv-warning', s.levels.warning, t('alerts.boxImportant')) +
        box('opportunity', 'lv-opportunity', s.levels.opportunity, t('alerts.boxOpp')) +
      '</div>';

    var list = analysis.alerts.filter(function (a) {
      if (alertsLevelFilter === 'urgent') return a.level === 'critical' || a.level === 'warning';
      if (alertsLevelFilter === 'risk') return a.atRisk && a.amount > 0;
      return a.level === alertsLevelFilter;
    });
    alertsListEl.innerHTML = list.length
      ? list.map(alertMarkup).join('')
      : '<div class="empty-state">' + (alertsLevelFilter === 'urgent' ? t('alerts.noneUrgent') : t('alerts.noneType')) + '</div>';
  }

  alertsSummaryEl.addEventListener('click', function (e) {
    var b = e.target.closest('.summary-box, .risk-filter-clear'); if (!b) return;
    // الضغط على نفس المربع تاني بيرجّع للعرض الافتراضي (العاجل + المهم)
    alertsLevelFilter = alertsLevelFilter === b.dataset.level ? 'urgent' : b.dataset.level;
    renderAlerts();
  });
  // فتح صفحة التنبيهات على نوع معيّن (من "أهم التنبيهات" أو من رقم الهدر)
  function openAlertsView(level) {
    alertsLevelFilter = level || 'urgent';
    showView('alerts');
    renderAlerts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function openAlertAd(e) {
    var item = e.target.closest('.alert-item.clickable'); if (!item) return;
    if (e.type === 'keydown') { if (e.key !== 'Enter' && e.key !== ' ') return; e.preventDefault(); }
    var c = findCandidate(item.dataset.adId);
    if (c) openExpand(c);
  }
  alertsListEl.addEventListener('click', openAlertAd);
  alertsListEl.addEventListener('keydown', openAlertAd);

  // ---------- إعدادات التنبيهات ----------
  // الشاشة الأساسية: نمط جاهز + العائد المستهدف + فترة التعلّم. باقي الحدود تحت "إعدادات متقدمة"
  var settingsOverlay = document.getElementById('settingsOverlay');
  var settingsForm = document.getElementById('settingsForm');
  var SETTING_UNITS = i18nMap({ multiple: 'unit.multiple', ratio: 'unit.ratio', days: 'unit.days', times: 'unit.times', count: 'unit.count' });
  var MAIN_SETTINGS = { roasTarget: true, learningDays: true };
  var PRESET_LABELS = {
    calm: i18nMap({ name: 'preset.calm', help: 'preset.calm.help' }),
    balanced: i18nMap({ name: 'preset.balanced', help: 'preset.balanced.help' }),
    strict: i18nMap({ name: 'preset.strict', help: 'preset.strict.help' })
  };

  function settingRow(m, value) {
    var shown = m.kind === 'ratio' ? Math.round(value * 100) : value;
    var step = m.kind === 'multiple' ? '0.1' : '1';
    return '<label class="setting-row"><span class="setting-text"><span class="setting-label">' + esc(m.label) + '</span><span class="setting-help">' + esc(m.help) + '</span></span>' +
      '<span class="setting-input"><input type="number" inputmode="decimal" min="0" step="' + step + '" name="' + m.key + '" value="' + shown + '"><span class="setting-unit">' + SETTING_UNITS[m.kind] + '</span></span></label>';
  }

  function renderSettingsForm() {
    var current = PauseProofAlerts.mergeSettings(alertSettings);
    var preset = alertSettings._preset || 'balanced';
    var presetHtml = '<fieldset class="settings-group"><legend>' + t('settings.sensitivity') + '</legend><div class="preset-options">' +
      Object.keys(PRESET_LABELS).map(function (p) {
        return '<label class="preset-option"><input type="radio" name="_preset" value="' + p + '"' + (p === preset ? ' checked' : '') + '>' +
          '<span class="preset-name">' + PRESET_LABELS[p].name + '</span><span class="preset-help">' + PRESET_LABELS[p].help + '</span></label>';
      }).join('') + '</div></fieldset>';
    var mainHtml = '<fieldset class="settings-group"><legend>' + t('settings.goals') + '</legend>' +
      PauseProofAlerts.SETTINGS_META.filter(function (m) { return MAIN_SETTINGS[m.key]; }).map(function (m) { return settingRow(m, current[m.key]); }).join('') +
      '</fieldset>';
    var groups = {};
    PauseProofAlerts.SETTINGS_META.forEach(function (m) {
      if (MAIN_SETTINGS[m.key]) return;
      (groups[m.group] = groups[m.group] || []).push(m);
    });
    var advancedHtml = '<details class="settings-advanced"><summary>' + t('settings.advanced') + '</summary>' +
      Object.keys(groups).map(function (g) {
        return '<fieldset class="settings-group"><legend>' + esc(g) + '</legend>' + groups[g].map(function (m) { return settingRow(m, current[m.key]); }).join('') + '</fieldset>';
      }).join('') + '</details>';
    settingsForm.innerHTML = presetHtml + mainHtml + advancedHtml;
  }

  // اختيار نمط بيملّي الحدود المتقدمة بقيمه على طول (والمستخدم يقدر يعدّل بعدها)
  settingsForm.addEventListener('change', function (e) {
    if (e.target.name !== '_preset') return;
    var values = PauseProofAlerts.presetSettings(e.target.value);
    PauseProofAlerts.SETTINGS_META.forEach(function (m) {
      if (MAIN_SETTINGS[m.key]) return;
      var input = settingsForm.querySelector('[name="' + m.key + '"]');
      if (input) input.value = m.kind === 'ratio' ? Math.round(values[m.key] * 100) : values[m.key];
    });
  });

  document.getElementById('openSettingsBtn').addEventListener('click', function () { renderSettingsForm(); settingsOverlay.classList.remove('hidden'); });
  document.getElementById('settingsClose').addEventListener('click', function () { settingsOverlay.classList.add('hidden'); });
  settingsOverlay.addEventListener('click', function (e) { if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden'); });
  document.getElementById('settingsReset').addEventListener('click', function () {
    alertSettings = {};
    storeAlertSettings(alertSettings);
    renderSettingsForm();
    render();
  });
  document.getElementById('settingsSave').addEventListener('click', function () {
    var picked = settingsForm.querySelector('[name="_preset"]:checked');
    var next = { _preset: picked ? picked.value : 'balanced' };
    PauseProofAlerts.SETTINGS_META.forEach(function (m) {
      var input = settingsForm.querySelector('[name="' + m.key + '"]');
      if (!input) return;
      var raw = parseFloat(String(input.value).replace(',', '.'));
      if (!isFinite(raw) || raw < 0) return; // قيمة غلط = نرجع للافتراضي
      next[m.key] = m.kind === 'ratio' ? raw / 100 : raw;
    });
    alertSettings = next;
    var saved = storeAlertSettings(alertSettings);
    settingsOverlay.classList.add('hidden');
    render();
    if (!saved) setStatus(msg('settings.notSaved'));
  });

  function resetFilterChips() {
    document.querySelectorAll('.filter-group').forEach(function (g) { g.querySelectorAll('.chip').forEach(function (ch) { ch.classList.toggle('active', ch.dataset.value === 'all'); }); });
    filters.platform = 'all'; filters.format = 'all'; filters.health = 'all'; filters.text = '';
    filters.campaign = null;
    textFilter.value = '';
  }

  // إعادة تحميل كل الحسابات المحمّلة من كل المنصات (مش Meta بس)
  resetAllBtn.addEventListener('click', function () {
    Object.keys(activeSources).forEach(function (p) { loadSource(p, activeSources[p]); });
  });
