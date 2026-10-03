// =====================================================================
// Ads Center — الواجهة
// =====================================================================
// المظهر واللغة، نافذة اختيار المنصة، الكروت (إعلانات وحملات)، الفلاتر، الأرقام، أهم التنبيهات،
// تفاصيل الإعلان، صفحة التنبيهات، والإعدادات.
// الملفات بتتحمّل بالترتيب ده وبتتشارك نفس النطاق العام (من غير bundler):
//   i18n → alerts → core → meta → google → snapchat → tiktok → ui → main
// أي كود بيتنفّذ وقت التحميل مسموحله يستخدم اللي في الملفات اللي قبله بس — الباقي جوه دوال.

  // الوضع الداكن: الافتراضي زي الجهاز، والاختيار من الزرار بيتحفظ ويتطبّق على كل الصفحات (js/theme.js).
  // قبل كده الأداة كانت دايماً فاتحة ومش بتفتكر الاختيار، والصفحات التانية بتتبع الجهاز — فكان فيه تناقض
  function syncThemeIcon() {
    var dark = window.ACC_THEME ? ACC_THEME.isDark() : document.documentElement.getAttribute('data-theme') === 'dark';
    themeToggle.textContent = dark ? '🌙' : '☀️';
  }
  themeToggle.addEventListener('click', function () {
    var dark = window.ACC_THEME ? ACC_THEME.isDark() : document.documentElement.getAttribute('data-theme') === 'dark';
    if (window.ACC_THEME) ACC_THEME.set(dark ? 'light' : 'dark');
    else document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
    syncThemeIcon();
  });
  syncThemeIcon();
  if (window.ACC_THEME) { ACC_THEME.onSystemChange(syncThemeIcon); ACC_THEME.onChange(syncThemeIcon); }

  // ---------- الموبايل: الشريط اللي فوق بيستخبى وإنت نازل ويرجع أول ما تطلع لفوق ----------
  // على الموبايل الشريط ٣ صفوف (حوالي خُمس الشاشة) — ثابت طول الوقت كان بيقلّل الكروت اللي بتبان.
  // زي فيسبوك وإنستجرام: بينزل مع الصفحة وبيرجع مع أول حركة لفوق
  var appbarEl = document.querySelector('.appbar');
  var mobileBar = window.matchMedia ? window.matchMedia('(max-width: 720px)') : null;
  // (أحداث الـ scroll أصلاً بتيجي مرة كل فريم، والشغل هنا خفيف: قراية رقم وتبديل كلاس)
  var lastScrollY = window.scrollY || 0;
  // زرار «لأعلى الصفحة»: بيظهر بعد ما تنزل في قائمة طويلة، ومش بيتوصله بـ Tab وهو مستخبي
  var toTopBtn = document.getElementById('toTopBtn');
  function syncAppbar() {
    if (!appbarEl) return;
    var y = window.scrollY || 0;
    appbarEl.classList.toggle('is-scrolled', y > 4);
    if (toTopBtn && toTopBtn.classList.contains('is-visible') !== (y > 900)) {
      toTopBtn.classList.toggle('is-visible', y > 900);
      toTopBtn.tabIndex = y > 900 ? 0 : -1;
    }
    var isMobile = !!(mobileBar && mobileBar.matches);
    if (!isMobile || y <= appbarEl.offsetHeight || y < lastScrollY - 4) appbarEl.classList.remove('appbar-hidden');
    else if (y > lastScrollY + 4 && !appbarEl.contains(document.activeElement)) appbarEl.classList.add('appbar-hidden');
    lastScrollY = y;
  }
  window.addEventListener('scroll', syncAppbar, { passive: true });
  if (toTopBtn) toTopBtn.addEventListener('click', function () {
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' });
    var brand = document.querySelector('.appbar .brand');
    if (brand) brand.focus({ preventScroll: true });
  });
  // التركيز بالكيبورد جوه الشريط بيرجّعه (مينفعش حاجة متركّز عليها تبقى مستخبية)
  if (appbarEl) appbarEl.addEventListener('focusin', function () { appbarEl.classList.remove('appbar-hidden'); });
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

  // ---------- انتهاء الجلسة، إعادة المحاولة، والفصل ----------
  // الجلسة انتهت (Google بعد ساعة تقريباً، Snapchat بعد نص ساعة، أو Meta لو الجلسة اتلغت):
  // لو الربط محفوظ على الجهاز (Google وSnapchat) بنجدد الجلسة بهدوء ونكمّل اللي كان بيحصل — مرة كل دقيقة
  // على الأكتر، عشان لو المنصة رفضت التوكن الجديد نفسه منلفّش في دايرة. غير كده (أو التجديد فشل) بنقول إن
  // الجلسة انتهت وبنسيب زرار «ربط تاني». الإعلانات اللي ظاهرة بتفضل زي ما هي لحد ما يربط
  var renewedAt = {};
  function markExpired(platform) {
    if (sealedFor(platform) && !(renewedAt[platform] > Date.now() - 60000)) {
      renewedAt[platform] = Date.now();
      setLoading(platform, true, msg('s.renewing', { platform: PLATFORM_NAMES[platform] }));
      render();
      renewSession(platform).then(function (ok) {
        if (ok) retryPlatform(platform);
        else expireNow(platform);
      });
      return;
    }
    expireNow(platform);
  }
  function expireNow(platform) {
    delete sessionTokens[platform];
    if (platform === 'google') googleAccessToken = null;
    else if (platform === 'snapchat') snapchatAccessToken = null;
    else if (platform === 'tiktok') tiktokAccessToken = null;
    saveSession();
    setPlatformState(platform, { kind: 'expired' });
    setLoading(platform, false, msg('s.platformExpired', { platform: PLATFORM_NAMES[platform] }), { reconnect: platform });
    render();
  }
  function reconnectPlatform(platform) {
    platformOverlay.classList.add('hidden');
    if (platform === 'meta') loginWithMeta();
    else if (platform === 'google') loginWithGoogle();
    else if (platform === 'snapchat') loginWithSnapchat();
    else if (platform === 'tiktok') loginWithTikTok();
  }
  // «حاول تاني»: نفس الحساب لو معروف، أو قائمة الحسابات من الأول، أو ربط تاني لو مفيش جلسة
  function retryPlatform(platform) {
    if (activeSources[platform]) { loadSource(platform, activeSources[platform]); return; }
    if (platform === 'meta' && typeof FB !== 'undefined') { loadAdAccounts(); return; }
    if (platform === 'google' && validToken(sessionTokens.google)) { loadGoogleAccounts(); return; }
    if (platform === 'snapchat' && validToken(sessionTokens.snapchat)) { loadSnapchatAccounts(); return; }
    if (platform === 'tiktok' && validToken(sessionTokens.tiktok) && (platformOptions.tiktok || []).length) { loadSource('tiktok', platformOptions.tiktok[0].value); return; }
    reconnectPlatform(platform);
  }
  // فصل منصة = تسجيل خروج من الأداة بس: بيمسح إعلاناتها وحساباتها ومفتاح الدخول وآخر حساب محفوظ
  // من المتصفح ده. العميل بيفضل داخل على فيسبوك/Google نفسهم (مش شغلنا نخرّجه منهم)
  function disconnectPlatform(platform, quiet) {
    // «فصل» Meta بيوقف الملخص التلقائي ويحذف مفاتيحه من السيرفر (سياسة الخصوصية، البند ٧) — قبل ما الجلسة تتمسح
    if (platform === 'meta') digestDisconnect();
    // الربط المحفوظ على الجهاز بيتمسح. Google: الخادم بيلغي الصلاحية عند Google نفسها كمان (لو حد نسخ
    // النسخة المقفولة قبل كده، متنفعش). Snapchat ملهاش إلغاء من عندنا — العميل يقدر يشيل الأداة من إعدادات حسابه
    var sealed = sealedFor(platform);
    if (sealed) {
      keepSealed(platform, null);
      if (platform === 'google') apiPost('/api/google-token', { sealed: sealed, revoke: true });
    }
    beginLoad(platform); // أي رد لسه جاي من المنصة دي بيتجاهل
    loadingPlatforms[platform] = false;
    document.body.classList.toggle('is-loading', anyLoading());
    cardGrid.setAttribute('aria-busy', anyLoading() ? 'true' : 'false');
    candidates = candidates.filter(function (c) { return platformOfSource(c.source) !== platform; });
    delete activeSources[platform];
    delete sessionTokens[platform];
    dxReset(platform);
    if (platform === 'google') googleAccessToken = null;
    else if (platform === 'snapchat') snapchatAccessToken = null;
    else if (platform === 'tiktok') tiktokAccessToken = null;
    Object.keys(accountInfo).forEach(function (k) { if (k.indexOf(platform + ':') === 0) delete accountInfo[k]; });
    Object.keys(sourceCache).forEach(function (k) { if (k.indexOf(platform + ':') === 0) delete sourceCache[k]; });
    setPlatformState(platform, null);
    forgetAccount(platform);
    setPlatformOptions(platform, []); // بيحفظ الجلسة كمان
    if (!quiet) setStatus(msg('s.disconnected', { platform: PLATFORM_NAMES[platform] }));
    render();
  }
  function disconnectAll() {
    PLATFORMS.forEach(function (p) { disconnectPlatform(p, true); });
    try { sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(OAUTH_STATE_KEY); } catch (e) { /* مقفول */ }
    lastUpdatedAt = null;
    document.getElementById('tConnectTitle').textContent = t('status.title');
    setStatus(msg('s.disconnectedAll'));
    render();
  }
  // اسم الحساب المعروض حالياً من منصة (من غير "Meta — " اللي في أول اسم الاختيار)
  function accountLabel(platform) {
    var id = activeSources[platform];
    var o = (platformOptions[platform] || []).filter(function (x) { return x.value === id; })[0];
    return o ? String(o.label).replace(/^[^—]*—\s*/, '') : '';
  }

  // نافذة المنصات: جنب كل منصة متصلة «متصل — اسم الحساب» وزرار «فصل»، وتحتهم «فصل كل الحسابات».
  // زرار الشريط اللي فوق بيبقى «حساباتك» بدل «تسجيل الدخول» لما يكون فيه منصة متصلة
  var disconnectAllBtn = document.getElementById('disconnectAll');
  function renderPlatformPanel() {
    PLATFORMS.forEach(function (p) {
      var row = document.querySelector('.platform-row[data-platform="' + p + '"]');
      if (!row) return;
      var on = isConnected(p);
      var st = row.querySelector('[data-platform-status]');
      var btn = row.querySelector('[data-disconnect]');
      if (st) {
        var expired = platformState[p] && platformState[p].kind === 'expired';
        var label = accountLabel(p);
        st.textContent = !on ? '' : expired ? t('pf.expired') : (label ? t('pf.connectedTo', { account: label }) : t('pf.connected'));
        st.classList.toggle('expired', !!expired);
        st.hidden = !on;
      }
      if (btn) {
        btn.hidden = !on;
        btn.setAttribute('aria-label', t('pf.disconnectAria', { platform: PLATFORM_NAMES[p] }));
      }
    });
    var any = PLATFORMS.some(isConnected);
    if (disconnectAllBtn) disconnectAllBtn.hidden = !any;
    loginMenuBtn.setAttribute('data-i18n', any ? 'btn.accounts' : 'btn.login');
    loginMenuBtn.textContent = t(any ? 'btn.accounts' : 'btn.login');
  }
  platformOverlay.addEventListener('click', function (e) {
    var d = e.target.closest('[data-disconnect]');
    if (d) { disconnectPlatform(d.getAttribute('data-disconnect')); return; }
    if (e.target.closest('#disconnectAll')) { disconnectAll(); platformOverlay.classList.add('hidden'); }
  });
  if (statusReconnect) {
    statusReconnect.addEventListener('click', function () {
      var p = statusReconnect.getAttribute('data-reconnect');
      if (p) reconnectPlatform(p);
    });
  }

  // ---------- كروت الحالة: جلسة انتهت / فشل التحميل / حساب فاضي / مفيش حسابات ----------
  // قبل كده العميل المربوط كان بيشوف شاشة «اربط حسابك» تاني، والخطأ في سطر صغير فوق
  function renderLoadStates(empty, connectedAny) {
    var el = document.getElementById('loadStates');
    if (!el) return;
    var fn = function (m) { return typeof m === 'function' ? m() : (m || ''); };
    var button = function (action, p, label, primary) {
      return '<button type="button" class="' + (primary ? 'stop-btn' : 'ghost-btn') + ' ls-btn" data-ls-action="' + action + '" data-platform="' + p + '">' + esc(label) + '</button>';
    };
    // الأهم فوق: جلسة انتهت ← فشل ← مفيش حسابات ← حساب فاضي
    var RANK = { expired: 0, error: 1, noAccounts: 2, empty: 3 };
    var rank = function (p) { var k = platformState[p].kind; return k in RANK ? RANK[k] : 9; };
    var shown = PLATFORMS.filter(function (p) { return platformState[p] && !loadingPlatforms[p]; })
      .sort(function (a, b) { return rank(a) - rank(b); });
    var cards = shown.map(function (p) {
      var s = platformState[p], name = PLATFORM_NAMES[p], title, body, actions;
      if (s.kind === 'expired') {
        title = t('ls.expired.t', { platform: name }); body = t('ls.expired.d');
        actions = button('reconnect', p, t('btn.reconnect'), true);
      } else if (s.kind === 'error') {
        title = t('ls.error.t', { platform: name }); body = fn(s.msg);
        actions = button('retry', p, t('btn.retry'), true);
      } else if (s.kind === 'noAccounts') {
        title = t('ls.noAccounts.t', { platform: name }); body = fn(s.msg);
        actions = '<a class="ls-link" href="/help#accounts">' + esc(t('ls.noAccounts.a')) + '</a>';
      } else {
        var acct = accountLabel(p);
        title = t('ls.empty.t', { platform: name }); body = (acct ? acct + ' — ' : '') + t('ls.empty.d');
        actions = button('add', p, t('ls.addPlatform'), false);
      }
      return '<div class="load-state ls-' + s.kind + '"><div class="ls-title">' + esc(title) + '</div>' +
        '<div class="ls-body">' + esc(body) + '</div><div class="ls-actions">' + actions + '</div></div>';
    });
    // متصل بس مفيش حساب معروض ولا مشكلة معروفة — نوجّهه يختار حساب
    if (!cards.length && empty && connectedAny) {
      cards.push('<div class="load-state ls-pick"><div class="ls-title">' + esc(t('ls.pick.t')) + '</div><div class="ls-body">' + esc(t('ls.pick.d')) + '</div></div>');
    }
    el.innerHTML = cards.join('');
  }
  document.getElementById('loadStates').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ls-action]'); if (!b) return;
    var p = b.getAttribute('data-platform'), action = b.getAttribute('data-ls-action');
    if (action === 'reconnect') reconnectPlatform(p);
    else if (action === 'retry') retryPlatform(p);
    else platformOverlay.classList.remove('hidden');
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
  function loadAlertSettings() { try { var v = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; } }
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
          spendCapReached: !!(p === 'meta' && Number(info.spendCap) > 0 && Number(info.amountSpent) >= Number(info.spendCap)),
          // وقرّب يخلص (٩٠٪ فأكتر) — الأرقام بأصغر وحدة للعملة زي ما Meta بترجّعها
          spendCap: p === 'meta' ? Number(info.spendCap) || 0 : 0,
          amountSpent: p === 'meta' ? Number(info.amountSpent) || 0 : 0
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
    // حملة Performance Max: مفيش إعلان واحد نعرضه — بنوضّح إن الكارت ده حملة كاملة
    if (c.campaignLevel) {
      return '<div class="preview preview-text preview-campaign"><span class="format-badge">Performance Max</span><span class="text-desc">' + t('card.pmaxSub') + '</span></div>';
    }
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
  // نفس الاسم بس مظبوط على العدد: "١ عملية شراء" / "٥ مشتريات" / "١٥ تحويلاً" / "1 purchase"
  function resultNounOf(c, n) { return I18N.resultNoun(n, c.resultKey); }

  function cardChips(c) {
    // الأرقام للفترة المختارة. تلوين المشكلة (اللي جاي من تنبيهات آخر ٧ أيام) بيظهر بس لما الفترة
    // هي نفسها آخر ٧ أيام — عشان رقم ٣٠ يوم ميتلوّنش أحمر بسبب حاجة حصلت أمس بس
    var p = periodOf(c);
    var hl = function (metric) { return period.preset === 'last7' ? mv(c, metric) : ''; };
    var tip = ' — ' + periodLabel();
    var chips = '<span class="metric-chip' + hl('spend') + '" title="' + t('chip.spend') + tip + '">' + money(p.spend, c.currency) + '</span>';
    if (p.results != null) {
      chips += '<span class="metric-chip' + hl('results') + '" title="' + t('chip.results') + tip + '">' + fmtNum(p.results) + ' ' + esc(resultNounOf(c, p.results)) + '</span>';
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
    var name = '<div class="card-name" dir="auto" title="' + esc(c.offer) + '">' + esc(c.offer) + '</div>';
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


  // الافتراضي: الإعلانات المتوقفة مستخبية (إلا اللي عليها تنبيه عاجل) — لحد ما العميل يطلبها، أو يدوّر بالاسم،
  // أو يختار فلتر حالة، أو الحساب كله مفيهوش ولا إعلان شغّال
  function hidesStopped() {
    return !showStopped && filters.health === 'all' && !filters.text && candidates.some(function (c) { return c.active; });
  }
  function visibleCandidates() {
    var hide = hidesStopped();
    return candidates.filter(function (c) {
      if (hide && !c.active && adAnalysis(c).health !== 'review') return false;
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
    // عدد إعلانات كل حملة (من غير فلاتر) وتنبيهات كل إعلان — بيتحسبوا مرة واحدة هنا.
    // قبل كده كل حملة كانت بتلف على كل الإعلانات وكل التنبيهات، فالحساب الكبير كان بيتقل مع كل ضغطة
    var totals = {}, alertsByAd = {};
    candidates.forEach(function (x) { var k = campaignKey(x); totals[k] = (totals[k] || 0) + 1; });
    analysis.alerts.forEach(function (al) {
      if (!al.adId) return;
      var e = alertsByAd[al.adId] || (alertsByAd[al.adId] = { urgent: 0, important: 0 });
      if (al.level === 'critical') e.urgent++; else if (al.level === 'warning') e.important++;
    });
    ads.forEach(function (c) {
      var key = campaignKey(c);
      var g = map[key];
      if (!g) {
        g = map[key] = { key: key, name: c.campaignName, platform: c.platform, currency: c.currency, ads: [], total: totals[key] || 0 };
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
      g.ads.forEach(function (c) {
        var e = alertsByAd[c.id];
        if (e) { g.urgent += e.urgent; g.important += e.important; }
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
    // حملة Performance Max كارت واحد على مستوى الحملة — «١ إعلان» كانت هتبقى غلط
    var pmaxOnly = g.ads.every(function (c) { return c.campaignLevel; });
    var count = pmaxOnly ? t('camp.pmax')
      : g.ads.length < g.total
        ? t('camp.adsOf', { n: ar(g.ads.length), total: ar(g.total), ads: noun(g.total, 'n.ad') })
        : ar(g.total) + ' ' + noun(g.total, 'n.ad');
    var chips = '<span class="metric-chip">' + money(g.spend, g.currency) + '</span>';
    if (g.results != null) chips += '<span class="metric-chip">' + fmtNum(g.results) + ' ' + esc(I18N.resultNoun(g.results, g.resultKey)) + '</span>';
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
        '<div class="camp-name" dir="auto" title="' + esc(name) + '">' + esc(name) + '</div>' +
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
    if (total <= shown) return stoppedButton();
    return '<button type="button" class="show-more" data-show-more>' + t('more.show', { n: ar(Math.min(RENDER_STEP, total - shown)) }) + '</button>';
  }
  // زرار «عرض الإعلانات المتوقفة» في آخر القايمة (بعد ما كل الظاهر يتعرض) — لو فيه متوقفة مستخبية أو لسه متحمّلتش
  function stoppedButton() {
    if (!hidesStopped()) return '';
    var hidden = candidates.some(function (c) { return !c.active && adAnalysis(c).health !== 'review'; });
    var pending = Object.keys(stoppedLoaders).some(function (p) { return typeof stoppedLoaders[p] === 'function'; });
    if (!hidden && !pending) return '';
    return '<div class="stopped-more"><button type="button" class="show-more" data-show-stopped>' + esc(t('more.stopped')) + '</button>' +
      '<p class="stopped-note">' + esc(t('more.stoppedNote')) + '</p></div>';
  }

  // ---------- حركة الكروت ----------
  // الكارت بيظهر بحركة أول مرة بس — مش مع كل إعادة رسم (تغيير اللغة، تحميل منصة تانية، تحديث).
  // ولو العميل غيّر الفلتر أو الترتيب ومفيش كروت جديدة، الشبكة كلها بتومض ومضة خفيفة عشان يبان إن النتيجة اتغيّرت
  var seenCards = {};
  function animateCards(reshuffled) {
    var k = 0;
    Array.prototype.forEach.call(cardGrid.querySelectorAll('.candidate-card, .campaign-card'), function (el) {
      var key = el.dataset.id ? 'ad:' + el.dataset.id : 'camp:' + el.dataset.campaign;
      if (seenCards[key]) return;
      seenCards[key] = true;
      el.style.setProperty('--i', Math.min(k++, 14));
      el.classList.add('card-in');
    });
    if (reshuffled && !k) {
      cardGrid.classList.remove('grid-refresh');
      void cardGrid.offsetWidth; // يعيد تشغيل الومضة من الأول
      cardGrid.classList.add('grid-refresh');
    }
  }
  // بعد ما الحركة تخلص الكلاس بيتشال — عشان الرجوع لتبويب الإعلانات ميعيدهاش
  cardGrid.addEventListener('animationend', function (e) {
    if (e.target.classList.contains('card-in')) e.target.classList.remove('card-in');
    else if (e.target === cardGrid) cardGrid.classList.remove('grid-refresh');
  });

  function render() {
    runAnalysis();
    // لو الحملة اللي كنت فاتحها مش موجودة تاني (بدّلت الحساب مثلاً) الفلتر بيتشال لوحده
    if (filters.campaign && !candidates.some(function (c) { return campaignKey(c) === filters.campaign; })) filters.campaign = null;
    var visible = sortCandidates(visibleCandidates(), filters.sort);
    var signature = JSON.stringify([filters, viewMode, periodKey()]);
    // العميل غيّر الفلتر أو الترتيب أو طريقة العرض أو الفترة (مش أول رسم ولا مجرد تحميل منصة) — animateCards
    var reshuffled = !!renderSignature && signature !== renderSignature;
    if (signature !== renderSignature) { renderSignature = signature; renderLimit = RENDER_STEP; }
    // شاشة البداية («اربط حسابك») بتظهر بس لما مفيش أي منصة متصلة. لو متصل ومفيش إعلانات
    // (حساب فاضي، فشل، أو جلسة انتهت) بيظهر كارت الحالة بدالها
    var empty = !candidates.length && !anyLoading();
    var connectedAny = PLATFORMS.some(isConnected);
    document.getElementById('emptyHero').classList.toggle('hidden', !empty || connectedAny);
    document.getElementById('adsContent').classList.toggle('hidden', empty);
    renderLoadStates(empty, connectedAny);
    renderPlatformPanel();
    if (!candidates.length) {
      if (!anyLoading()) cardGrid.innerHTML = '';
      galleryCount.textContent = anyLoading() ? t('gallery.loading') : t('gallery.login');
    } else if (viewMode === 'campaigns') {
      var camps = sortCampaigns(groupCampaigns(visible), filters.sort);
      cardGrid.innerHTML = camps.length
        ? camps.slice(0, renderLimit).map(campaignMarkup).join('') + moreButton(renderLimit, camps.length)
        : (stoppedButton() || '<div class="empty-state" style="grid-column:1/-1">' + t('gallery.noMatch') + '</div>');
      galleryCount.textContent = t('gallery.countCampaigns', { n: ar(camps.length), camps: noun(camps.length, 'n.campaign'), m: ar(visible.length), ads: noun(visible.length, 'n.ad') });
    } else {
      cardGrid.innerHTML = visible.length
        ? visible.slice(0, renderLimit).map(cardMarkup).join('') + moreButton(renderLimit, visible.length)
        : (stoppedButton() || '<div class="empty-state" style="grid-column:1/-1">' + t('gallery.noMatch') + '</div>');
      galleryCount.textContent = t('gallery.count', { n: ar(visible.length), total: ar(candidates.length), ads: noun(candidates.length, 'n.ad') });
    }
    animateCards(reshuffled);
    renderLastUpdated();
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
    renderDiagnosis();
  }

  // ---------- ملخص المتجر (js/diagnosis.js) ----------
  // النص كله بيتركّب من التقرير وقت الرسم — فتغيير اللغة بيبان على طول من غير تحميل تاني
  var DX_KIND_LABEL = { urgent: 'dx.kind.urgent', decision: 'dx.kind.decision', watch: 'dx.kind.watch', opportunity: 'dx.kind.opportunity' };
  function dxPct(x) { return ar(Math.round(Math.abs(x) * 100)) + (isAr() ? '٪' : '%'); }
  function dxKpiHtml(k) {
    // اللون (أخضر/أحمر) بس لو التغيّر حقيقي — تذبذب عادي بيفضل رمادي
    var tone = !k.sig || k.goodUp == null ? '' : ((k.sig > 0) === k.goodUp ? ' good' : ' bad');
    var pct = k.pct == null || Math.abs(k.pct) < 0.005 ? '' :
      '<span class="dx-kpi-pct' + tone + '">' + (k.pct > 0 ? '↑ ' : '↓ ') + dxPct(k.pct) + '</span>';
    return '<div class="dx-kpi"><div class="dx-kpi-label">' + esc(k.label) + '</div>' +
      '<div class="dx-kpi-value">' + esc(k.value) + ' ' + pct + '</div>' +
      '<div class="dx-kpi-sub">' + esc(t('dx.kpi.prev', { v: k.prev })) + '</div></div>';
  }
  function dxBlockHtml(b, i) {
    var p = function (cls, s) { return '<p' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(s) + '</p>'; };
    var html = '<article class="dx-block dx-' + b.kind + '">';
    if (DX_KIND_LABEL[b.kind]) html += '<span class="dx-kind">' + esc(t(DX_KIND_LABEL[b.kind])) + '</span>';
    html += '<h3>' + esc(b.title) + '</h3>';
    (b.lines || []).forEach(function (l) { html += p('', l); });
    if (b.bullets && b.bullets.length) html += '<ul>' + b.bullets.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    (b.after || []).forEach(function (l) { html += p('', l); });
    if (b.causes && b.causes.length) html += '<p class="dx-causes"><strong>' + esc(t('dx.causes')) + '</strong> ' + esc(DX.listText(b.causes) + '.') + '</p>';
    if (b.check) html += '<p class="dx-check"><strong>' + esc(t('dx.check')) + '</strong> ' + esc(b.check) + '</p>';
    if (b.next) html += '<p class="dx-next"><strong>' + esc(t('dx.next')) + '</strong> ' + esc(b.next) + '</p>';
    if (b.evidence) {
      html += '<details class="dx-evidence"><summary>' + esc(t('dx.evidence')) + '</summary><table><thead><tr>' +
        b.evidence.head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        b.evidence.rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') +
        '</tbody></table></details>';
    }
    var foot = [];
    if (b.owner) foot.push('<span class="dx-owner">' + esc(t('dx.owner')) + ': ' + esc(t('dx.owner.' + b.owner)) + '</span>');
    if (b.conf) foot.push('<span class="dx-conf dx-conf-' + b.conf + '">' + esc(t('dx.conf.' + b.conf)) + '</span>');
    if (b.kind !== 'note') foot.push('<button type="button" class="ghost-btn dx-copy-one" data-dx-copy="' + i + '">' + esc(t('dx.copyOne')) + '</button>');
    if (foot.length) html += '<div class="dx-foot">' + foot.join('') + '</div>';
    if (b.fbKey) html += dxFeedbackHtml(b, i);
    return html + '</article>';
  }

  // ---------- «هل كان هذا التشخيص صحيحاً؟» (اختياري) ----------
  // الإجابة بتتحفظ على الجهاز (localStorage) لكل حساب إعلاني — ومحرك التشخيص بيستخدمها في التقارير الجاية:
  // «حسب ملاحظتك الفترة السابقة كان فيها عرض»، والأسباب اللي حصلت قبل كده في المتجر بتطلع الأول.
  // وكمان بتتبعت لـ Supabase (تحت) لو العرض فيه حساب Meta: عشان نقيس دقة التشخيص، وتظهر على أي جهاز
  var DX_FB_KEY = 'acc.dx.fb.v1';

  // ---------- مزامنة التجربة (Supabase — supabase/functions/sync) ----------
  // الدالة بتسأل Meta نفسها إن صاحب مفتاح الدخول عنده صلاحية على الحساب قبل ما تقرا أو تكتب — المفتاح
  // بيتبعت مع الطلب بس ومبيتحفظش عندنا. عروض Meta بس اللي بتتزامن: عرض «كل المنصات» فيه أسماء حملات Google
  // وأرقام حساباتها، وسياسة الخصوصية بتقول إننا مش بنحفظ أي بيانات Google عندنا — فهو وGoogle وSnapchat على الجهاز بس.
  // أي فشل (شبكة، الجلسة خلصت) مبيأثرش على الأداة: الإجابة محفوظة على الجهاز وبتتبعت في أول مرة ينجح فيها الاتصال
  var SYNC_URL = 'https://rhrrnxsgodiideqeollo.supabase.co/functions/v1/sync';
  var syncPulled = {};     // العروض اللي جبنا إجاباتها من السيرفر في الجلسة دي
  var syncSeenDone = {};   // الحسابات اللي سجّلنا فتحها في الجلسة دي
  function metaAccessToken() {
    try { var a = window.FB && FB.getAuthResponse ? FB.getAuthResponse() : null; return a && a.accessToken ? a.accessToken : null; }
    catch (e) { return null; }
  }
  // العرض ده بيتزامن؟ عرض حساب Meta لوحده بس («meta:act_1»)
  function syncableView(viewKey) { return typeof viewKey === 'string' && /^meta:act_\d{1,30}$/.test(viewKey); }
  // الخطأ بيرجع بحالته ورمزه من السيرفر (e.code = 'email' / 'days' / 'not verified' …) عشان الرسالة تبقى دقيقة
  function syncCall(body) {
    return fetch(SYNC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; e.code = j && j.error; throw e; }
          return j;
        });
      });
  }
  // حساب Meta فتح الأداة (سجل عملاء التجربة) — مرة واحدة لكل حساب في الجلسة
  function syncSeen(accountId) {
    if (!/^act_\d+$/.test(accountId || '') || syncSeenDone[accountId]) return;
    var token = metaAccessToken();
    if (!token) return;
    syncSeenDone[accountId] = true;
    syncCall({ action: 'seen', token: token, accountId: accountId }).catch(function () { syncSeenDone[accountId] = false; });
  }
  // إجابات السيرفر → الجهاز (الأحدث يكسب). بترجع true لو حاجة اتغيّرت
  function dxFbMerge(viewKey, entries) {
    if (!Array.isArray(entries) || !entries.length) return false;
    var all = dxFbAll(), list = Array.isArray(all[viewKey]) ? all[viewKey] : [], changed = false;
    entries.forEach(function (s) {
      if (!s || typeof s.block !== 'string') return;
      var i = -1;
      for (var k = 0; k < list.length; k++) if (list[k] && list[k].block === s.block && list[k].since === s.since && list[k].until === s.until) { i = k; break; }
      var mine = i > -1 ? list[i] : null;
      if (mine && mine.at && s.at && Date.parse(mine.at) >= Date.parse(s.at)) return;
      var e = { block: s.block, since: s.since, until: s.until, at: s.at, verdict: s.verdict, reasons: s.reasons || [], note: s.note || '', synced: true };
      if (i > -1) list[i] = e; else list.push(e);
      changed = true;
    });
    if (!changed) return false;
    all[viewKey] = list.slice(-200);
    try { localStorage.setItem(DX_FB_KEY, JSON.stringify(all)); } catch (e) { /* تخزين مقفول */ }
    return true;
  }
  function dxFbMarkSynced(viewKey, entry) {
    var all = dxFbAll(), list = Array.isArray(all[viewKey]) ? all[viewKey] : [];
    list.forEach(function (f) { if (f && f.block === entry.block && f.since === entry.since && f.until === entry.until && f.at === entry.at) f.synced = true; });
    try { localStorage.setItem(DX_FB_KEY, JSON.stringify(all)); } catch (e) { /* تخزين مقفول */ }
  }
  function dxSyncPush(viewKey, entry, token) {
    if (!syncableView(viewKey)) return;
    token = token || metaAccessToken();
    if (!token) return;
    syncCall({ action: 'save', token: token, viewKey: viewKey, info: entry.info || null,
      entry: { block: entry.block, since: entry.since, until: entry.until, verdict: entry.verdict, reasons: entry.reasons || [], note: entry.note || '', at: entry.at } })
      .then(function () { dxFbMarkSynced(viewKey, entry); }, function () { /* بتفضل synced: false وبتتبعت المرة الجاية */ });
  }
  // أول مرة العرض يظهر في الجلسة: نجيب إجاباته من السيرفر، ونبعت أي إجابة اتسجلت والاتصال مقطوع.
  // لو جه جديد (من جهاز تاني مثلاً) بنعيد التحليل عشان يدخل في «حسب ملاحظتك...»
  function dxSyncPull(viewKey) {
    if (!syncableView(viewKey) || syncPulled[viewKey]) return;
    var token = metaAccessToken();
    if (!token) return;
    syncPulled[viewKey] = true;
    syncCall({ action: 'list', token: token, viewKey: viewKey }).then(function (res) {
      var changed = dxFbMerge(viewKey, res && res.entries);
      dxFbFor(viewKey).filter(function (f) { return f.synced === false; }).forEach(function (f) { dxSyncPush(viewKey, f, token); });
      if (changed) dxRefeed(viewKey);
    }, function () { syncPulled[viewKey] = false; });
  }
  function dxRefeed(viewKey) {
    var S = dxState.sources;
    Object.keys(S).forEach(function (p) {
      var s = S[p];
      if (s && s.accountId === viewKey && s.status === 'ready' && s.input) { s.input.feedback = dxFbFor(viewKey); s.report = DX.analyze(s.input); }
    });
    dxRecompute();
  }

  // ---------- الملخص التلقائي بالبريد (اختياري، لحسابات Meta بس — supabase/functions/sync/digest.ts) ----------
  // الزرار بيظهر في عرض حساب Meta لوحده (لكل العملاء من ٣ أكتوبر ٢٠٢٦ — ?digest=0 بيخفيه، شوف DIGEST_ON في core.js). التفعيل بيبعت مفتاح Meta الحالي
  // مرة واحدة: السيرفر بيبدّله بمفتاح طويل (٦٠ يوم) ويحفظه مشفّر. لما الأداة تتفتح والملخص مفعّل بنجدده بهدوء،
  // و«فصل» Meta بيوقفه لكل حسابات صاحب الجلسة ويحذف مفاتيحها (سياسة الخصوصية، البند ٧)
  function digestFresh(account) {
    return { open: false, account: account || null, status: 'idle', data: null, editing: false, confirmOff: false, busy: false, msg: null, msgErr: false, draft: null };
  }
  var digestUi = digestFresh();
  var digestRefreshed = {};
  // الملخص مفعّل للحساب ولا لأ (من رد digest.refresh أو digest.get): true / false، ولو مش معروف مفيش مفتاح.
  // التلميح بيظهر بس لما نكون متأكدين إنه مش مفعّل — عشان منطلبش من حد يفعّل حاجة مفعّلة
  var digestKnown = {};
  // «لاحقاً» بيخفي التلميح للحساب ده أسبوعين على الجهاز ده (وكمان بعد الإيقاف — منطلبش تاني على طول)
  var DIGEST_HINT_KEY = 'acc.digestHint', DIGEST_HINT_SNOOZE_MS = 14 * 86400000;
  function digestHintSnoozed(account) {
    try {
      var at = (JSON.parse(localStorage.getItem(DIGEST_HINT_KEY) || '{}') || {})[account];
      return typeof at === 'number' && Date.now() - at < DIGEST_HINT_SNOOZE_MS;
    } catch (e) { return false; }
  }
  function digestHintSnooze(account) {
    try {
      var all = JSON.parse(localStorage.getItem(DIGEST_HINT_KEY) || '{}');
      if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
      all[account] = Date.now();
      localStorage.setItem(DIGEST_HINT_KEY, JSON.stringify(all));
    } catch (e) { /* التلميح هيرجع في الجلسة الجاية — مش مشكلة */ }
  }
  function digestAccount() { var m = /^meta:(act_\d{1,30})$/.exec(dxState.accountId || ''); return m ? m[1] : null; }
  function digestCall(action, extra) {
    var token = metaAccessToken(), account = digestAccount();
    if (!token || !account) { var e = new Error('no session'); e.code = 'session'; return Promise.reject(e); }
    return syncCall(Object.assign({ action: action, token: token, accountId: account }, extra || {}));
  }
  // «يومي الأحد والأربعاء» / «أيام الأحد، والثلاثاء، والخميس»
  function digestDaysText(days) {
    var names = (days || []).map(function (d) { return t('dx.auto.d' + d); });
    return t(names.length === 2 ? 'dx.auto.days2' : 'dx.auto.daysN', { list: DX.listText(names) });
  }
  function digestHourText(h) {
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return ar(h12 + ':00') + ' ' + t(h < 12 ? 'dx.auto.am' : 'dx.auto.pm');
  }
  function digestErrText(e) {
    var c = e && e.code;
    return t(c === 'email' ? 'dx.auto.err.email' : c === 'days' ? 'dx.auto.err.days' : (c === 'session' || c === 'not verified') ? 'dx.auto.err.session' : 'dx.auto.err.generic');
  }
  function digestPanelHtml() {
    var u = digestUi, d = u.data || {}, s = d.settings, tz = d.timezone || (s && s.timezone) || '';
    var head = '<h3>' + esc(t('dx.auto.title')) + '</h3>';
    var msg = u.msg ? '<p class="dx-auto-msg' + (u.msgErr ? ' err' : '') + '" role="status">' + esc(u.msg) + '</p>' : '';
    if (u.status === 'loading') return head + '<p>' + esc(t('dx.auto.loading')) + '</p>';
    if (u.status === 'error') {
      return head + '<p class="dx-auto-msg err" role="status">' + esc(u.msg || t('dx.auto.err.generic')) + '</p>' +
        '<div class="dx-auto-actions"><button type="button" class="ghost-btn" data-digest-retry>' + esc(t('dx.auto.retry')) + '</button></div>';
    }
    if (s && s.enabled && !u.editing) {
      var html = head + '<p class="dx-auto-on"><strong>' + esc(t('dx.auto.onLabel')) + '</strong> ' +
        esc(t('dx.auto.on', { email: s.email, days: digestDaysText(s.days), hour: digestHourText(s.hour), tz: tz })) + '</p>';
      if (d.tokenWorks === false) html += '<p class="dx-auto-msg err">' + esc(t('dx.auto.problem')) + '</p>';
      else if (d.tokenExpiresAt) html += '<p>' + esc(t('dx.auto.expires', { date: fmtKey(String(d.tokenExpiresAt).slice(0, 10)) })) + '</p>';
      html += u.confirmOff
        ? '<p>' + esc(t('dx.auto.offConfirm')) + '</p><div class="dx-auto-actions">' +
          '<button type="button" class="ghost-btn" data-digest-off-yes' + (u.busy ? ' disabled' : '') + '>' + esc(t('dx.auto.offYes')) + '</button>' +
          '<button type="button" class="ghost-btn" data-digest-off-no>' + esc(t('dx.auto.offNo')) + '</button></div>'
        : '<div class="dx-auto-actions"><button type="button" class="ghost-btn" data-digest-edit>' + esc(t('dx.auto.edit')) + '</button>' +
          '<button type="button" class="ghost-btn" data-digest-off>' + esc(t('dx.auto.off')) + '</button></div>';
      return html + msg;
    }
    // النموذج: تفعيل جديد أو تعديل. المسودة بتحفظ اللي العميل كتبه لو ظهرت رسالة خطأ
    var cur = u.draft || (u.editing && s ? { email: s.email, days: s.days, hour: s.hour } : { email: '', days: [0, 3], hour: 9 });
    var days = [0, 1, 2, 3, 4, 5, 6].map(function (i) {
      var on = cur.days.indexOf(i) > -1;
      return '<button type="button" class="dx-fb-reason' + (on ? ' on' : '') + '" data-digest-day="' + i + '" aria-pressed="' + on + '">' + esc(t('dx.auto.d' + i)) + '</button>';
    }).join('');
    var hours = '';
    for (var h = 0; h < 24; h++) hours += '<option value="' + h + '"' + (h === cur.hour ? ' selected' : '') + '>' + esc(digestHourText(h)) + '</option>';
    var form = head + '<p>' + esc(t('dx.auto.intro')) + '</p>' +
      '<label class="dx-auto-field">' + esc(t('dx.auto.email')) +
      '<input type="email" id="dxAutoEmail" autocomplete="email" dir="ltr" maxlength="254" value="' + esc(cur.email || '') + '"></label>' +
      '<div class="dx-auto-field" role="group" aria-label="' + esc(t('dx.auto.days')) + '">' + esc(t('dx.auto.days')) + '<div class="dx-auto-days">' + days + '</div></div>' +
      '<label class="dx-auto-field">' + esc(t('dx.auto.hour')) + '<select id="dxAutoHour">' + hours + '</select></label>' +
      (tz ? '<p>' + esc(t('dx.auto.tz', { tz: tz })) + '</p>' : '');
    if (!u.editing) {
      form += '<label class="dx-auto-consent"><input type="checkbox" id="dxAutoConsent"' + (cur.consent ? ' checked' : '') + '><span>' +
        esc(t('dx.auto.consent')) + ' <a href="/privacy" target="_blank" rel="noopener">' + esc(t('dx.auto.privacy')) + '</a></span></label>';
    }
    form += '<div class="dx-auto-actions"><button type="button" class="ghost-btn" data-digest-save' + (u.busy ? ' disabled' : '') + '>' +
      esc(t(u.editing ? 'dx.auto.save' : 'dx.auto.enable')) + '</button>' +
      (u.editing ? '<button type="button" class="ghost-btn" data-digest-cancel>' + esc(t('dx.auto.cancel')) + '</button>' : '') + '</div>';
    return form + msg;
  }
  // الزرار والصندوق: بيتنادى مع كل رسم للملخص. الصندوق نفسه مش بيتعاد رسمه هنا (عشان ميمسحش اللي العميل بيكتبه)
  function renderDigest() {
    var btn = document.getElementById('dxAutoBtn'), panel = document.getElementById('dxAuto'), hint = document.getElementById('dxAutoHint');
    if (!btn || !panel) return;
    var account = digestAccount();
    var show = DIGEST_ON && dxState.status === 'ready' && !!account && !!metaAccessToken();
    if (digestUi.account !== account) digestUi = digestFresh(account);
    btn.hidden = !show;
    var visible = show && digestUi.open;
    btn.setAttribute('aria-expanded', visible ? 'true' : 'false');
    panel.hidden = !visible;
    if (!visible) panel.innerHTML = '';
    // تلميح التفعيل: الحساب مش مفعّل له الملخص (أكيد)، والصندوق مقفول، ومحدش ضغط «لاحقاً» قريب
    if (hint) {
      var showHint = show && !digestUi.open && digestKnown[account] === false && !digestHintSnoozed(account);
      var key = showHint ? (isAr() ? 'ar' : 'en') : '';   // بيتعاد رسمه لما يظهر أو يختفي أو اللغة تتغير بس (مش مع كل رسم للملخص)
      if (hint.getAttribute('data-k') !== key) {
        hint.setAttribute('data-k', key);
        hint.hidden = !showHint;
        hint.innerHTML = showHint ? '<p>' + esc(t('dx.auto.hint')) + '</p><span class="dx-auto-actions">' +
          '<button type="button" class="ghost-btn" data-digest-hint-on>' + esc(t('dx.auto.hintOn')) + '</button>' +
          '<button type="button" class="ghost-btn" data-digest-hint-later>' + esc(t('dx.auto.hintLater')) + '</button></span>' : '';
      }
    }
  }
  function renderDigestPanel() {
    var panel = document.getElementById('dxAuto');
    if (panel && !panel.hidden) panel.innerHTML = digestPanelHtml();
  }
  function digestLoad() {
    digestUi.status = 'loading';
    digestUi.msg = null;
    renderDigestPanel();
    var account = digestUi.account;
    digestCall('digest.get').then(function (res) {
      digestKnown[account] = !!(res && res.settings && res.settings.enabled !== false);
      if (digestUi.account !== account) return;
      digestUi.data = res;
      digestUi.status = 'ready';
      renderDigestPanel();
    }, function (e) {
      if (digestUi.account !== account) return;
      digestUi.status = 'error';
      digestUi.msg = digestErrText(e);
      renderDigestPanel();
    });
  }
  function digestSave() {
    var panel = document.getElementById('dxAuto');
    if (!panel || digestUi.busy) return;
    var email = ((panel.querySelector('#dxAutoEmail') || {}).value || '').trim();
    var days = Array.prototype.map.call(panel.querySelectorAll('[data-digest-day].on'), function (x) { return Number(x.getAttribute('data-digest-day')); });
    var hour = Number((panel.querySelector('#dxAutoHour') || {}).value);
    var consent = !!(panel.querySelector('#dxAutoConsent') || {}).checked, editing = digestUi.editing;
    digestUi.draft = { email: email, days: days, hour: hour, consent: consent };
    var fail = function (key) { digestUi.msg = t(key); digestUi.msgErr = true; renderDigestPanel(); };
    if (!/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(email)) return fail('dx.auto.err.email');
    if (days.length < 2) return fail('dx.auto.err.days');
    if (!editing && !consent) return fail('dx.auto.err.consent');
    digestUi.busy = true;
    digestUi.msg = null;
    renderDigestPanel();
    var extra = { email: email, days: days, hour: hour, lang: isAr() ? 'ar' : 'en' };
    if (!editing) extra.consent = true;
    var account = digestUi.account;
    digestCall(editing ? 'digest.update' : 'digest.enable', extra).then(function (res) {
      digestKnown[account] = true;
      digestUi.busy = false;
      digestUi.editing = false;
      digestUi.draft = null;
      digestUi.data = Object.assign({}, digestUi.data || {}, { settings: res.settings }, res.tokenExpiresAt ? { tokenExpiresAt: res.tokenExpiresAt, tokenWorks: true } : {});
      digestUi.msg = t(editing ? 'dx.auto.updated' : 'dx.auto.saved');
      digestUi.msgErr = false;
      renderDigestPanel();
    }, function (e) {
      digestUi.busy = false;
      digestUi.msg = digestErrText(e);
      digestUi.msgErr = true;
      renderDigestPanel();
    });
  }
  function digestOff() {
    if (digestUi.busy) return;
    digestUi.busy = true;
    renderDigestPanel();
    var account = digestUi.account;
    digestCall('digest.disable').then(function () {
      digestKnown[account] = false;
      digestHintSnooze(account);   // أوقفه بنفسه — التلميح ميرجعش يطلب منه التفعيل على طول
      digestUi.busy = false;
      digestUi.confirmOff = false;
      digestUi.data = Object.assign({}, digestUi.data || {}, { settings: null, tokenExpiresAt: null, tokenWorks: null });
      digestUi.msg = t('dx.auto.stopped');
      digestUi.msgErr = false;
      renderDigestPanel();
    }, function (e) {
      digestUi.busy = false;
      digestUi.msg = digestErrText(e);
      digestUi.msgErr = true;
      renderDigestPanel();
    });
  }
  // لما حساب Meta يتفتح: لو الملخص مفعّل له، السيرفر بيجدد المفتاح المحفوظ (مرة في الجلسة) — بيفضل صالح طول ما العميل بيستخدم الأداة
  function digestAutoRefresh(accountId) {
    if (!DIGEST_ON || !/^act_\d{1,30}$/.test(accountId || '') || digestRefreshed[accountId]) return;
    var token = metaAccessToken();
    if (!token) return;
    digestRefreshed[accountId] = true;
    // الرد بيقول كمان الملخص مفعّل ولا لأ — ده اللي بيقرر تلميح التفعيل يظهر ولا لأ (من غير طلب زيادة)
    syncCall({ action: 'digest.refresh', token: token, accountId: accountId }).then(function (res) {
      if (res && typeof res.enabled === 'boolean') { digestKnown[accountId] = res.enabled; renderDigest(); }
    }, function () { digestRefreshed[accountId] = false; });
  }
  // «فصل» Meta: السيرفر بيمسح مفاتيح كل الحسابات اللي صاحب الجلسة فعّل لها الملخص. لو الاتصال فشل،
  // رابط الإيقاف في آخر كل رسالة بيعمل نفس الحاجة
  function digestDisconnect() {
    var token = metaAccessToken();
    digestRefreshed = {};
    digestKnown = {};
    digestUi = digestFresh();
    if (token) syncCall({ action: 'digest.disconnect', token: token }).catch(function () { /* رابط الإيقاف */ });
  }
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    var el;
    var hintOn = e.target.closest('[data-digest-hint-on]');
    if (e.target.closest('#dxAutoBtn') || hintOn) {
      digestUi.open = hintOn ? true : !digestUi.open;
      digestUi.msg = null;
      renderDigest();
      if (digestUi.open) { if (digestUi.status === 'idle' || digestUi.status === 'error') digestLoad(); else renderDigestPanel(); }
      if (hintOn) { var p = document.getElementById('dxAuto'), f = p && p.querySelector('#dxAutoEmail'); if (f) f.focus(); else if (p) p.scrollIntoView({ block: 'nearest' }); }
      return;
    }
    if (e.target.closest('[data-digest-hint-later]')) {
      if (digestUi.account) digestHintSnooze(digestUi.account);
      renderDigest();
      return;
    }
    if (!e.target.closest('#dxAuto')) return;
    if ((el = e.target.closest('[data-digest-day]'))) {
      var on = !el.classList.contains('on');
      el.classList.toggle('on', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    } else if (e.target.closest('[data-digest-save]')) digestSave();
    else if (e.target.closest('[data-digest-edit]')) { digestUi.editing = true; digestUi.draft = null; digestUi.msg = null; renderDigestPanel(); }
    else if (e.target.closest('[data-digest-cancel]')) { digestUi.editing = false; digestUi.draft = null; digestUi.msg = null; renderDigestPanel(); }
    else if (e.target.closest('[data-digest-off]')) { digestUi.confirmOff = true; digestUi.msg = null; renderDigestPanel(); }
    else if (e.target.closest('[data-digest-off-no]')) { digestUi.confirmOff = false; renderDigestPanel(); }
    else if (e.target.closest('[data-digest-off-yes]')) digestOff();
    else if (e.target.closest('[data-digest-retry]')) digestLoad();
  });
  var dxFbOpen = null;   // البلوك اللي نموذج «ما الذي حدث فعلاً؟» مفتوح فيه (رقمه)
  function dxFbAll() {
    try { var v = JSON.parse(localStorage.getItem(DX_FB_KEY) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
    catch (e) { return {}; }
  }
  function dxFbFor(accountId) {
    var list = dxFbAll()[accountId];
    return Array.isArray(list) ? list.filter(function (f) { return f && typeof f === 'object' && typeof f.block === 'string'; }) : [];
  }
  function dxFbEntry(b) {
    var r = dxState.report;
    return dxFbFor(dxState.accountId).filter(function (f) { return f.block === b.fbKey && f.since === r.since && f.until === r.until; })[0] || null;
  }
  function dxFbSave(b, patch) {
    var r = dxState.report, all = dxFbAll(), id = dxState.accountId;
    var list = Array.isArray(all[id]) ? all[id] : [];
    var old = dxFbEntry(b) || { block: b.fbKey, since: r.since, until: r.until, reasons: [], note: '' };
    var entry = { block: old.block, since: old.since, until: old.until, at: new Date().toISOString(),
      verdict: patch.verdict || old.verdict, reasons: patch.reasons || old.reasons || [], note: patch.note != null ? String(patch.note).slice(0, 500) : (old.note || '') };
    // نوع البطاقة وعنوانها ونوع الملخص — للسيرفر بس (قياس الدقة لكل نوع تشخيص)
    if (syncableView(id)) {
      entry.synced = false;
      entry.info = { kind: b.kind, title: String(b.title || '').slice(0, 300), head: r.head ? r.head.type : null, lang: isAr() ? 'ar' : 'en' };
    }
    list = list.filter(function (f) { return !(f && f.block === entry.block && f.since === entry.since && f.until === entry.until); });
    list.push(entry);
    all[id] = list.slice(-200);   // آخر ٢٠٠ ملاحظة للحساب — كفاية للتعلّم ومتملاش التخزين
    try { localStorage.setItem(DX_FB_KEY, JSON.stringify(all)); } catch (e) { /* تخزين مقفول: الإجابة مش هتتحفظ */ }
    dxSyncPush(id, entry);
    return entry;
  }
  function dxFeedbackHtml(b, i) {
    var f = dxFbEntry(b), open = dxFbOpen === i;
    var html = '<div class="dx-fb">';
    if (!f) {
      html += '<span>' + esc(t('dx.fb.q')) + '</span>' +
        '<button type="button" class="dx-fb-btn" data-dx-fb="yes" data-i="' + i + '">' + esc(t('dx.fb.yes')) + '</button>' +
        '<button type="button" class="dx-fb-btn" data-dx-fb="no" data-i="' + i + '">' + esc(t('dx.fb.no')) + '</button>';
    } else {
      html += '<span class="dx-fb-done">✓ ' + esc(t(f.verdict === 'yes' ? 'dx.fb.thanksYes' : 'dx.fb.thanksNo')) + '</span>';
      if (!open) html += '<button type="button" class="dx-fb-link" data-dx-fb-open="' + i + '">' + esc(t((f.reasons || []).length || f.note ? 'dx.fb.edit' : 'dx.fb.addMore')) + '</button>';
    }
    html += '</div>';
    if (f && open) {
      html += '<div class="dx-fb-form" data-dx-fb-form="' + i + '"><p class="dx-fb-label">' + esc(t('dx.fb.what')) + '</p><div class="dx-fb-reasons">' +
        DX.REASONS.map(function (rs) {
          var on = (f.reasons || []).indexOf(rs) > -1;
          return '<button type="button" class="dx-fb-reason' + (on ? ' on' : '') + '" data-dx-reason="' + rs + '" aria-pressed="' + on + '">' + esc(t('dx.fb.r.' + rs)) + '</button>';
        }).join('') + '</div>' +
        '<textarea class="dx-fb-note" rows="2" maxlength="500" dir="auto" placeholder="' + esc(t('dx.fb.notePh')) + '">' + esc(f.note || '') + '</textarea>' +
        '<p class="dx-fb-hint">' + esc(t(syncableView(dxState.accountId) ? 'dx.fb.hint' : 'dx.fb.hintLocal')) + '</p>' +
        '<button type="button" class="ghost-btn" data-dx-fb-save="' + i + '">' + esc(t('dx.fb.save')) + '</button></div>';
    }
    return html;
  }
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !dxState.composed) return;
    var blocks = dxState.composed.blocks, el;
    if ((el = e.target.closest('[data-dx-fb]'))) {
      var i = Number(el.getAttribute('data-i')), verdict = el.getAttribute('data-dx-fb');
      if (!blocks[i]) return;
      dxFbSave(blocks[i], { verdict: verdict });
      // «لا» بتفتح «ما الذي حدث فعلاً؟» على طول — دي أكتر معلومة مفيدة. «نعم» بتسيبها اختيارية
      dxFbOpen = verdict === 'no' ? i : null;
      renderDiagnosis();
    } else if ((el = e.target.closest('[data-dx-fb-open]'))) {
      dxFbOpen = Number(el.getAttribute('data-dx-fb-open'));
      renderDiagnosis();
    } else if ((el = e.target.closest('[data-dx-reason]'))) {
      var on = !el.classList.contains('on');
      el.classList.toggle('on', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    } else if ((el = e.target.closest('[data-dx-fb-save]'))) {
      var j = Number(el.getAttribute('data-dx-fb-save')), form = el.closest('.dx-fb-form');
      if (!blocks[j] || !form) return;
      var reasons = Array.prototype.map.call(form.querySelectorAll('.dx-fb-reason.on'), function (x) { return x.getAttribute('data-dx-reason'); });
      dxFbSave(blocks[j], { reasons: reasons, note: form.querySelector('.dx-fb-note').value.trim() });
      dxFbOpen = null;
      renderDiagnosis();
    }
  });
  // ---------- المنصات: كل منصة ليها تحميلها، وبعدين بنكوّن العروض ----------
  // مصدر (منصة) بيبدأ: لو نفس الحساب ونفس الفترة جاهزين أو جاريين → مفيش تحميل تاني
  function dxBegin(platform, key, account, accountId) {
    var s = dxState.sources[platform];
    if (s && s.key === key && s.status !== 'error') return false;
    dxState.sources[platform] = { status: 'loading', key: key, account: account, accountId: accountId };
    dxRecompute();
    return true;
  }
  function dxDone(platform, key, input) {
    var s = dxState.sources[platform];
    if (!s || s.key !== key) return;   // رد قديم (العميل بدّل الحساب أو الفترة)
    input.feedback = dxFbFor(s.accountId);
    s.input = input;
    s.report = DX.analyze(input);
    s.status = 'ready';
    dxRecompute();
    dxSyncPull(s.accountId);
  }
  function dxFail(platform, key, err) {
    var s = dxState.sources[platform];
    if (!s || s.key !== key) return;
    s.status = 'error';
    s.err = err;
    dxRecompute();
  }
  var DX_PLATFORM_ORDER = ['meta', 'google', 'snapchat'];
  // العروض: كل منصة جاهزة لوحدها، و«كل المنصات» الأول لو فيه أكتر من منصة جاهزة بنفس العملة ونفس الفترة
  // (جمع ريال مع دولار أو أسبوعين مختلفين يطلع رقم بلا معنى)
  function dxRecompute() {
    var S = dxState.sources, ids = DX_PLATFORM_ORDER.filter(function (p) { return S[p]; });
    var ready = ids.filter(function (p) { return S[p].status === 'ready'; });
    var views = ready.map(function (p) { return { id: p, report: S[p].report, account: S[p].account, accountId: S[p].accountId }; });
    if (ready.length >= 2) {
      var f = S[ready[0]].input;
      var same = ready.every(function (p) { var x = S[p].input; return x.currency === f.currency && x.since === f.since && x.until === f.until; });
      if (same) {
        var accId = 'all:' + ready.map(function (p) { return S[p].accountId; }).join(',');
        var input = DX.combine(ready.map(function (p) { return { platform: p, input: S[p].input }; }));
        input.feedback = dxFbFor(accId);
        var rep = DX.attachPlatforms(DX.analyze(input), ready.map(function (p) { return { platform: p, report: S[p].report }; }));
        views.unshift({ id: 'all', report: rep, account: ready.map(function (p) { return S[p].account; }).filter(Boolean).join(' + '), accountId: accId });
      }
    }
    dxState.views = views;
    dxState.status = views.length ? 'ready' : (ids.some(function (p) { return S[p].status === 'loading'; }) ? 'loading' : (ids.length ? 'error' : 'idle'));
    if (!views.some(function (v) { return v.id === dxState.view; })) dxState.view = views.length ? views[0].id : 'all';
    var cur = views.filter(function (v) { return v.id === dxState.view; })[0];
    dxState.report = cur ? cur.report : null;
    dxState.account = cur ? cur.account : null;
    dxState.accountId = cur ? cur.accountId : null;
    renderDiagnosis();
  }
  function renderDiagnosis() {
    var sec = document.getElementById('storeSec');
    if (!sec) return;
    renderDigest();
    var show = DX_ON && PLATFORMS.some(isConnected) && dxState.status !== 'idle';
    sec.hidden = !show;
    if (!show) return;
    var body = document.getElementById('dxBody'), period = document.getElementById('dxPeriod'), copy = document.getElementById('dxCopy');
    copy.hidden = dxState.status !== 'ready';
    if (dxState.status !== 'ready') {
      period.textContent = '';
      body.innerHTML = '<p class="dx-wait">' + esc(t(dxState.status === 'loading' ? 'dx.loading' : 'dx.failed')) + '</p>';
      body.setAttribute('aria-busy', dxState.status === 'loading' ? 'true' : 'false');
      return;
    }
    body.setAttribute('aria-busy', 'false');
    var o = dxState.composed = DX.compose(dxState.report);
    period.textContent = o.period;
    // أكتر من عرض: أزرار «كل المنصات / Meta / Google Ads / Snapchat»
    var views = dxState.views || [], tabs = '';
    if (views.length > 1) {
      tabs = '<div class="dx-views" role="group" aria-label="' + esc(t('dx.view.aria')) + '">' + views.map(function (v) {
        var on = v.id === dxState.view;
        return '<button type="button" class="chip' + (on ? ' active' : '') + '" data-dx-view="' + esc(v.id) + '" aria-pressed="' + on + '">' +
          esc(t(v.id === 'all' ? 'dx.view.all' : 'dx.plat.' + v.id)) + '</button>';
      }).join('') + '</div>';
    }
    // منصة لسه بتتحمّل بعد ما التانية خلصت
    var pending = DX_PLATFORM_ORDER.filter(function (p) { return dxState.sources && dxState.sources[p] && dxState.sources[p].status === 'loading'; });
    var more = pending.length ? '<p class="dx-notes">' + esc(t('dx.loadingMore', { platforms: DX.listText(pending.map(function (p) { return t('dx.plat.' + p); })) })) + '</p>' : '';
    body.innerHTML = tabs + more + '<div class="dx-head ' + esc(o.tone) + '"><p class="dx-headline">' + esc(o.title) + '</p>' +
      '<div class="dx-kpis">' + (o.kpis || []).map(dxKpiHtml).join('') + '</div></div>' +
      '<div class="dx-blocks">' + o.blocks.map(dxBlockHtml).join('') + '</div>' +
      (o.notes || []).map(function (n) { return '<p class="dx-notes">' + esc(n) + '</p>'; }).join('');
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-dx-view]');
    if (!b) return;
    dxState.view = b.getAttribute('data-dx-view');
    dxFbOpen = null;
    dxRecompute();
  });
  // النسخ: الملخص كله أو بلوك واحد (عشان يتبعت لمسؤول الإعلانات على الواتساب)
  function dxCopyText(text, btn) {
    var done = function (ok) {
      var old = btn.textContent;
      btn.textContent = t(ok ? 'dx.copied' : 'dx.copyFailed');
      setTimeout(function () { btn.textContent = old; }, 2500);
    };
    var legacy = function () {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { /* مش مدعوم */ }
      ta.remove();
      return ok;
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(legacy()); });
    else done(legacy());
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('#dxCopy, [data-dx-copy]');
    if (!btn || !dxState.composed) return;
    var o = dxState.composed;
    if (btn.id === 'dxCopy') dxCopyText(DX.toText(o, dxState.account), btn);
    else {
      var b = o.blocks[Number(btn.getAttribute('data-dx-copy'))];
      if (b) dxCopyText('📊 ' + t('dx.title') + (dxState.account ? ' — ' + dxState.account : '') + '\n' + o.period + '\n\n' + DX.blockText(b), btn);
    }
  });

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
    document.getElementById('periodRangeText').textContent = fmtRange(r.since, r.until);
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
    // بنحفظها مترتبة ومقصوصة (مش في المستقبل، وأقصاها ٩٣ يوم) — عشان اسم الفترة على الأرقام يطابق البيانات.
    // قبل كده «من ٢٠ لـ ١» كانت بتظهر «٢٠–١ سبتمبر» وتاريخ في المستقبل كان بيظهر كأن فيه بيانات ليه
    var since = dateFrom.value, until = dateTo.value, today = todayKeyInTz(BROWSER_TZ);
    if (since > until) { var tmp = since; since = until; until = tmp; }
    if (until > today) until = today;
    if (since > until) since = until;
    var trimmed = keyDiffDays(since, until) > PERIOD_MAX_DAYS - 1;
    if (trimmed) since = shiftKey(until, -(PERIOD_MAX_DAYS - 1));
    applyPeriod({ preset: 'custom', since: since, until: until });
    if (trimmed) setStatus(msg('period.trimmed', { n: PERIOD_MAX_DAYS, date: function () { return fmtKey(since); } }));
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
    // والنتائج لكل نوع على حدة: مشتريات + محادثات + سوايب في رقم واحد كان بيطلع رقم ملوش معنى
    var spendByCur = {}, byType = {};
    candidates.forEach(function (c) {
      var p = periodOf(c);
      spendByCur[c.currency || ''] = (spendByCur[c.currency || ''] || 0) + (p.spend || 0);
      if (p.results == null) return;
      // إعلانات متوقفة مصرفتش ولا جابت حاجة في الفترة: نوع نتيجتها ميدخلش الرقم —
      // قبل كده كانت بتطلع «٠ نتائج» و«+٤ أخرى» جنب المشتريات الحقيقية
      if (!(p.spend > 0) && !(p.results > 0)) return;
      var k = c.resultKey || 'generic';
      var g = byType[k] || (byType[k] = { results: 0, spend: 0 });
      g.results += p.results || 0;
      g.spend += p.spend || 0;
    });
    // الأنواع مترتبة بالصرف مش بالعدد — عشان ١٠٠٠ سوايب ميغطّوش على ٢٠ عملية شراء صرفت أكتر
    var types = Object.keys(byType).sort(function (a, b) { return (byType[b].spend - byType[a].spend) || (byType[b].results - byType[a].results); });
    var typeNoun = function (k) { return I18N.resultNoun(byType[k].results, k); };
    // فاصل الآلاف: ٢٬٤٠٠ / 2,400
    var typeText = function (k) { return fmtNum(byType[k].results) + ' ' + typeNoun(k); };
    var resultsValue, resultsTitle = types.map(typeText).join(' · ');
    if (!types.length) resultsValue = ar(0);
    else if (types.length === 1) resultsValue = fmtNum(byType[types[0]].results) + ' <span class="kpi-unit">' + esc(typeNoun(types[0])) + '</span>';
    else {
      resultsValue = types.slice(0, 2).map(function (k) { return '<span class="kpi-line">' + esc(typeText(k)) + '</span>'; }).join('') +
        (types.length > 2 ? '<span class="kpi-more">' + t('kpi.moreTypes', { n: ar(types.length - 2) }) + '</span>' : '');
    }
    var joinMoney = function (map) {
      var keys = Object.keys(map).filter(function (k) { return map[k] > 0; });
      // صفر بعملة الحساب المعروض (قبل كده كان "٠ ر.س" حتى لو الحساب بالجنيه)
      return keys.length ? keys.map(function (k) { return money(map[k], k || null); }).join(' + ') : money(0, defaultCurrency());
    };
    var atRisk = analysis.summary.atRisk;
    var review = analysis.summary.health.review;
    var hasRisk = Object.keys(atRisk).some(function (k) { return atRisk[k] > 0; });
    // action: الرقم بيبقى زرار — "معرّض للهدر" بيفتح التنبيهات اللي وراه، و"تحتاج مراجعة" بيفلتر الإعلانات دي
    var box = function (label, value, cls, action, title) {
      var inner = '<div class="kpi-label">' + label + '</div><div class="kpi-value">' + value + '</div>';
      var tip = title ? ' title="' + esc(title) + '"' : '';
      return action
        ? '<button type="button" class="kpi kpi-link' + (cls || '') + '" data-kpi="' + action + '"' + tip + '>' + inner + '</button>'
        : '<div class="kpi' + (cls || '') + '"' + tip + '>' + inner + '</div>';
    };
    var wasEmpty = !strip.children.length;
    strip.innerHTML =
      box(t('kpi.spend', { p: periodLabel() }), joinMoney(spendByCur)) +
      box(t('kpi.results', { p: periodLabel() }), resultsValue, types.length > 1 ? ' kpi-multi' : '', null, types.length > 1 ? resultsTitle : '') +
      box(t('kpi.atRisk'), joinMoney(atRisk), ' kpi-risk', hasRisk ? 'risk' : null) +
      box(t('kpi.review'), ar(review), review ? ' kpi-review' : '', review ? 'review' : null);
    if (wasEmpty) Array.prototype.forEach.call(strip.children, function (el, i) { el.style.setProperty('--i', i); el.classList.add('kpi-in'); });
  }
  document.getElementById('kpiStrip').addEventListener('animationend', function (e) { e.target.classList.remove('kpi-in'); });
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
  var lastTopAlerts = '';
  function renderTopAlerts() {
    var el = document.getElementById('topAlerts');
    fillTopAlerts(el);
    if (el.textContent === lastTopAlerts) return;
    lastTopAlerts = el.textContent;
    Array.prototype.forEach.call(el.querySelectorAll('.top-alert, .top-alerts-ok'), function (item, i) { item.style.setProperty('--i', i); item.classList.add('ta-in'); });
  }
  function fillTopAlerts(el) {
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
          '<span class="top-alert-src" dir="auto">' + esc(src) + '</span></span></button>';
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
      if (group.dataset.filter === 'health' && btn.dataset.value === 'stopped') loadStoppedAds();
      render();
    });
  });
  function setFilterChip(group, value) {
    group.querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('active', c.dataset.value === value); });
    filters[group.dataset.filter] = value;
  }
  // البحث بيستنى لحظة بعد آخر حرف — قبل كده كل حرف كان بيعيد التحليل والرسم كله (تقيل مع الحسابات الكبيرة)
  var textFilterTimer = null;
  textFilter.addEventListener('input', function () {
    clearTimeout(textFilterTimer);
    textFilterTimer = setTimeout(function () {
      filters.text = textFilter.value;
      // البحث بالاسم بيدوّر في المتوقفة كمان — فبتتحمّل لو لسه
      if (filters.text) loadStoppedAds();
      render();
    }, 180);
  });
  sortSelect.addEventListener('change', function () { filters.sort = sortSelect.value; render(); });


  function metricBox(label, value, extraCls) { return '<div class="metric-box' + (extraCls || '') + '"><div class="metric-label">' + label + '</div><div class="metric-value">' + value + '</div></div>'; }

  var DEST_LABELS = i18nMap({ whatsapp: 'dest.whatsapp', messenger: 'dest.messenger', website: 'dest.website' });

  function issueMarkup(i) {
    return '<div class="issue-item ' + LEVELS[i.level].cls + '">' +
      '<div class="issue-title"><span class="issue-level">' + LEVELS[i.level].label + '</span>' + esc(i.title) + '</div>' +
      '<div class="issue-detail">' + esc(i.detail) + '</div>' +
      (i.impactText ? '<div class="issue-impact">📊 ' + esc(i.impactText) + '</div>' : '') +
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
    if (c.platform === 'Google Ads' && c.campaignLevel) {
      return { url: 'https://ads.google.com/aw/overview?campaignId=' + encodeURIComponent(c.campaignId || ''), label: t('x.openGoogle'), note: t('x.openGoogleNote', { acct: formatGoogleId(acct) }) };
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
    document.getElementById('expandCaption').textContent = c.campaignLevel ? t('x.pmaxNote') : (c.caption || c.headline || t('x.noText'));

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
      metricBox(resultsLabelTxt, p.results != null ? fmtNum(p.results) : t('x.noConversions'), hl('results')) +
      metricBox(t('x.cpr'), p.cpr != null ? money(p.cpr, cur) : '—', hl('cpr')) +
      metricBox(t('x.roas'), roasStr(p.roas), hl('roas'));
    if (c.frequency != null) boxes += metricBox(t('x.freq'), numAr(c.frequency) + ' ' + I18N.measureNoun(c.frequency, 'n.time'), mv(c, 'frequency'));
    boxes += metricBox(t('x.sales') + pl, p.sales > 0 ? money(p.sales, cur) : t('x.noSales'));
    document.getElementById('expandMetrics').innerHTML = boxes;

    // السلسلة الثانية: مبيعات فعلية لو موجودة، وإلا عدد النتائج (حسب هدف الإعلان نفسه) كبديل مفيد
    var secondSeries = hasSales ? c.dailySales : c.dailyResults;
    var secondRowLabel = hasSales ? (currencyLabel(cur) ? t('x.salesRow', { cur: currencyLabel(cur) }) : t('x.sales')) : (t('x.results') + (c.resultKey ? ' — ' + esc(resultLabelOf(c)) : ''));
    document.getElementById('legendSalesLabel').textContent = hasSales ? t('x.salesLegend') : t('x.resultsLegend');
    // عمود "أمس" متعلّم — أغلب التنبيهات مبنية عليه، وعمود النهارده يوم لسه مخلصش
    var colCls = function (i) { return i === 5 ? ' class="col-yesterday"' : (i === 6 ? ' class="col-today"' : ''); };
    var headerCells = c.dailyDates.map(function (dt, i) { return '<th' + colCls(i) + '>' + (i === 5 ? t('x.yesterday') : (i === 6 ? t('x.today') : fmtKey(dt))) + '</th>'; }).join('');
    // الجدول: فاصل الآلاف (١٢٬٥٠٠)، والصرف والمبيعات الصغيرة بخانة عشرية (٠٫٤ مش ٠)
    var spendCells = c.daily.map(function (v, i) { return '<td' + colCls(i) + '><span class="mono">' + fmtNum(v, true) + '</span></td>'; }).join('');
    var secondCells = secondSeries.map(function (v, i) { return '<td' + colCls(i) + '><span class="mono">' + fmtNum(v, hasSales) + '</span></td>'; }).join('');
    document.getElementById('expandChart').innerHTML =
      '<div class="daily-table-wrap"><table class="daily-table"><thead><tr><th></th>' + headerCells + '</tr></thead>' +
      '<tbody><tr><td>' + (currencyLabel(cur) ? t('x.spendRow', { cur: currencyLabel(cur) }) : t('x.spend')) + '</td>' + spendCells + '</tr>' +
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
        // الرابط لازم يفضل على facebook.com — قيمة زي «@موقع-تاني.com/» كانت هتحوّل الرابط لدومين تاني
        var permalink = vidResp && typeof vidResp.permalink_url === 'string' && vidResp.permalink_url.charAt(0) === '/' &&
          safeUrl('https://www.facebook.com' + vidResp.permalink_url);
        if (permalink && new URL(permalink).hostname !== 'www.facebook.com') permalink = null;
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

  // فهرس الإعلانات بالرقم — بيتبني من جديد بس لما قائمة الإعلانات نفسها تتغيّر. قبل كده كل تنبيه في الصفحة
  // كان بيدوّر على إعلانه في القائمة كلها (آلاف التنبيهات × آلاف الإعلانات مع كل رسم)
  var candidateIndex = { list: null, byId: {} };
  function findCandidate(id) {
    if (candidateIndex.list !== candidates) {
      var byId = {};
      candidates.forEach(function (x) { if (!(x.id in byId)) byId[x.id] = x; });
      candidateIndex = { list: candidates, byId: byId };
    }
    return Object.prototype.hasOwnProperty.call(candidateIndex.byId, id) ? candidateIndex.byId[id] : undefined;
  }

  // الضغط على أي مكان في الكارت بيفتح التفاصيل
  // كارت الحملة بيفتح إعلاناتها، وكارت الإعلان بيفتح تفاصيله
  function activateCard(e) {
    if (e.target.closest('[data-show-more]')) { renderLimit += RENDER_STEP; render(); return true; }
    if (e.target.closest('[data-show-stopped]')) { requestStoppedAds(); return true; }
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
      t.tabIndex = on ? 0 : -1;
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
  // الأسهم (يمين/شمال) بتتنقل بين التبويبات — بالعربي السهم الشمال هو «اللي بعده»
  document.querySelector('.view-tabs').addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    var tabs = Array.prototype.slice.call(viewTabs), i = tabs.indexOf(document.activeElement);
    if (i === -1) return;
    var rtl = document.documentElement.dir === 'rtl';
    var next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1
      : (i + ((e.key === 'ArrowLeft') === rtl ? 1 : -1) + tabs.length) % tabs.length;
    e.preventDefault();
    tabs[next].focus();
    tabs[next].click();
  });


  // ---------- صفحة التنبيهات ----------
  // الافتراضي "urgent" = العاجل والمهم مع بعض — دول اللي محتاجين قرار. الفرص في قسم لوحدها
  var alertsLevelFilter = 'urgent';
  var alertsSummaryEl = document.getElementById('alertsSummary');
  var alertsListEl = document.getElementById('alertsList');
  var alertsTabCount = document.getElementById('alertsTabCount');

  function alertMarkup(a, i) {
    var clickable = a.adId && findCandidate(a.adId);
    // اسم الحساب فيه اسم المنصة أصلاً (مثال: "Meta — متجري")، فمنكررهاش
    var source = a.adName ? esc(a.platform || '') + ' · ' + esc(a.adName) : esc(a.accountName || a.platform || '');
    return '<article class="alert-item ' + LEVELS[a.level].cls + (clickable ? ' clickable' : '') + '" style="--i:' + Math.min(i || 0, 10) + '"' +
        (clickable ? ' data-ad-id="' + esc(a.adId) + '" tabindex="0" role="button"' : '') + '>' +
      '<div class="alert-head"><span class="alert-level">' + LEVELS[a.level].label + '</span><span class="alert-source" dir="auto">' + source + '</span></div>' +
      '<div class="alert-title">' + esc(a.title) + '</div>' +
      '<p class="alert-detail">' + esc(a.detail) + '</p>' +
      (a.impactText ? '<p class="alert-impact">📊 ' + esc(a.impactText) + '</p>' : '') +
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
      var riskText = riskKeys.length ? riskKeys.map(function (cur) { return money(s.atRisk[cur], cur || null); }).join(' + ') : money(0, defaultCurrency());
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
    // نص مش number: خانة الأرقام بتعتبر «٢٫٥» أو «2,5» قيمة فاضية، فكانت بتتشال في صمت وترجع للافتراضي
    return '<label class="setting-row"><span class="setting-text"><span class="setting-label">' + esc(m.label) + '</span><span class="setting-help">' + esc(m.help) + '</span></span>' +
      '<span class="setting-input"><input type="text" inputmode="decimal" dir="ltr" autocomplete="off" spellcheck="false" data-step="' + step + '" name="' + m.key + '" value="' + shown + '"><span class="setting-unit">' + SETTING_UNITS[m.kind] + '</span></span></label>';
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
    var errEl = document.getElementById('settingsError');
    if (errEl) errEl.textContent = '';
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
  // التحقق قبل الحفظ: كل قيمة جوه حدودها، والحدود المرتبطة مترتبة (حد «مراجعة» أكبر من «تحسين»...).
  // قبل كده القيمة الغلط كانت بترجع للافتراضي من غير ما العميل يعرف، والحدود المتلخبطة كانت بتتقبل
  var settingsErrorEl = document.getElementById('settingsError');
  function clearSettingsErrors() {
    settingsForm.querySelectorAll('.setting-row.invalid').forEach(function (r) { r.classList.remove('invalid'); });
    settingsForm.querySelectorAll('.setting-error').forEach(function (e) { e.remove(); });
    if (settingsErrorEl) settingsErrorEl.textContent = '';
  }
  // الأرقام العربية (٠-٩) والفارسية (۰-۹) والفاصلة (٫ أو ,) → رقم عادي. «١٫٥» و«1,5» و«1.5» كلهم ١٫٥
  function settingNumberText(v) {
    return String(v == null ? '' : v).trim()
      .replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[\u06F0-\u06F9]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
      .replace(/[\u066B,]/g, '.').replace(/\s+/g, '');
  }
  function readSettingsForm() {
    var picked = settingsForm.querySelector('[name="_preset"]:checked');
    var next = { _preset: picked ? picked.value : 'balanced' }, errors = [];
    var inputOf = function (key) { return settingsForm.querySelector('[name="' + key + '"]'); };
    PauseProofAlerts.SETTINGS_META.forEach(function (m) {
      var input = inputOf(m.key);
      if (!input) return;
      var txt = settingNumberText(input.value);
      if (txt === '') return; // فاضي = قيمة النمط المختار
      var raw = /^\d*\.?\d+$/.test(txt) ? parseFloat(txt) : NaN;
      if (!isFinite(raw) || raw < m.min || raw > m.max) {
        errors.push({ input: input, text: t('set.err.range', { min: numAr(m.min), max: numAr(m.max) }) });
        return;
      }
      next[m.key] = m.kind === 'ratio' ? raw / 100 : raw;
    });
    var eff = PauseProofAlerts.mergeSettings(next);
    PauseProofAlerts.SETTINGS_ORDER.forEach(function (o) {
      if (eff[o[0]] > eff[o[1]] && inputOf(o[1])) errors.push({ input: inputOf(o[1]), text: t(o[2]) });
    });
    return { values: next, errors: errors };
  }
  document.getElementById('settingsSave').addEventListener('click', function () {
    clearSettingsErrors();
    var r = readSettingsForm();
    if (r.errors.length) {
      r.errors.forEach(function (err) {
        var row = err.input.closest('.setting-row');
        if (row && !row.classList.contains('invalid')) {
          row.classList.add('invalid');
          var box = document.createElement('span');
          box.className = 'setting-error';
          box.textContent = err.text;
          row.querySelector('.setting-text').appendChild(box);
        }
        var det = err.input.closest('details');
        if (det) det.open = true; // الخطأ جوه «الإعدادات المتقدمة» — بنفتحها عشان يبان
      });
      if (settingsErrorEl) settingsErrorEl.textContent = t('set.err.fix');
      r.errors[0].input.focus();
      return;
    }
    alertSettings = r.values;
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
  // «تحديث البيانات» بيجيب ملخص المتجر من جديد هو كمان (من غيرها كان بيفضل على نسخته القديمة لنفس الفترة)
  function refreshAll() { dxReset(); Object.keys(activeSources).forEach(function (p) { loadSource(p, activeSources[p]); }); }
  resetAllBtn.addEventListener('click', refreshAll);

  // ---------- آخر تحديث ----------
  // الساعة، ومعاها اليوم لو مش النهارده (قبل كده الساعة بس — تاب مفتوح من امبارح كان بيبان إنه النهارده).
  // بعد نص ساعة بيتلوّن ومعاه زرار «حدّث»، ولو رجعت للتاب بعد المدة دي الأرقام بتتحدّث لوحدها
  var STALE_MS = 30 * 60 * 1000;
  function isStale() { return !!lastUpdatedAt && Date.now() - lastUpdatedAt > STALE_MS; }
  function localDateKey(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function renderLastUpdated() {
    var upd = document.getElementById('lastUpdated');
    if (!lastUpdatedAt || !candidates.length) { upd.textContent = ''; upd.classList.remove('stale'); upd.removeAttribute('title'); return; }
    var d = new Date(lastUpdatedAt);
    var time = d.toLocaleTimeString(isAr() ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit' });
    var text = localDateKey(d) === localDateKey(new Date()) ? t('upd.at', { time: time }) : t('upd.atDay', { day: fmtKey(localDateKey(d)), time: time });
    var stale = isStale();
    upd.classList.toggle('stale', stale);
    if (stale) upd.setAttribute('title', t('upd.staleTip')); else upd.removeAttribute('title');
    upd.innerHTML = esc(text) + (stale ? '<button type="button" class="stale-refresh" data-stale-refresh>' + esc(t('upd.refresh')) + '</button>' : '');
  }
  document.getElementById('lastUpdated').addEventListener('click', function (e) {
    if (e.target.closest('[data-stale-refresh]')) refreshAll();
  });
  setInterval(renderLastUpdated, 60000);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && isStale() && !anyLoading() && Object.keys(activeSources).length) refreshAll();
  });

  // ---------- النوافذ المنبثقة: التركيز (لوحة المفاتيح وقارئات الشاشة) ----------
  // لما نافذة تفتح: التركيز بيروح لزرار الإغلاق جواها، وTab بيلف جوه النافذة بس (مش ورا الخلفية).
  // لما تتقفل: التركيز بيرجع للزرار اللي فتحها. بنراقب كلاس hidden نفسه، فبيشتغل مهما كانت طريقة الفتح والقفل
  function focusablesIn(root) {
    return Array.prototype.filter.call(
      root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])'),
      function (el) { return !el.hidden && el.getClientRects().length > 0; });
  }
  [platformOverlay, expandOverlay, settingsOverlay, filterDrawer].forEach(function (dlg) {
    if (!dlg || !window.MutationObserver) return;
    var opener = null, isOpen = false;
    new MutationObserver(function () {
      var open = !dlg.classList.contains('hidden');
      if (open === isOpen) return;
      isOpen = open;
      if (open) {
        opener = document.activeElement;
        var target = dlg.querySelector('.expand-close') || focusablesIn(dlg)[0];
        if (target) target.focus();
      } else if (opener && document.contains(opener) && (dlg.contains(document.activeElement) || document.activeElement === document.body)) {
        opener.focus();
      }
    }).observe(dlg, { attributes: true, attributeFilter: ['class'] });
    dlg.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var list = focusablesIn(dlg);
      if (!list.length) return;
      var first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  });
