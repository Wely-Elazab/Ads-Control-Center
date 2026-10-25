// =====================================================================
// Ads Center — الواجهة
// =====================================================================
// المظهر واللغة، نافذة اختيار المنصة، الكروت (إعلانات وحملات)، الفلاتر، الأرقام، أهم التنبيهات،
// تفاصيل الإعلان، صفحة التنبيهات، والإعدادات.
// الملفات بتتحمّل بالترتيب ده وبتتشارك نفس النطاق العام (من غير bundler):
//   i18n → alerts → core → meta → google → snapchat → tiktok → ui → route → main
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
  // الهاتف بس (أقل من ٦٠٠ — نفس حد الشريط السفلي): من ٦٠٠ لفوق القائمة الجانبية بتبدأ تحت الشريط، فلو استخبى يسيب فراغ
  var mobileBar = window.matchMedia ? window.matchMedia('(max-width: 599.98px)') : null;
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
  // الجلسة انتهت (Google بعد ساعة تقريباً، Snapchat بعد ساعة (توثيق Snapchat: ٣٦٠٠ ثانية)، أو Meta لو الجلسة اتلغت):
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
    numbersPending[platform] = false;
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
    // إعدادات حسابات المنصة دي اللي جت من السيرفر — اللي يربط بعده (حتى من نفس الصفحة) بيجيبها بمفتاحه هو
    Object.keys(acctSettings).concat(Object.keys(acctPulling)).forEach(function (k) { if (k.indexOf(platform + ':') === 0) { delete acctSettings[k]; delete acctPulling[k]; } });
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
    // «لم يُحكم بعد»: البيانات متكفيش للحكم (جديد، إنفاق صغير، مبيصرفش، مفيش حاجة نقارن بيها) — alerts.js pend
    pending: { get label() { return t('health.pending'); }, cls: 'h-pending', order: 3 },
    inactive: { get label() { return t('health.inactive'); }, cls: 'h-inactive', order: 4 }
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
  // الأنماط اتشالت (مراجعة الإعدادات ٢٤ أكتوبر ٢٠٢٦): اللي كان مختار «هادئ» أو «صارم» قيم نمطه بتتكتب صريحة مرة واحدة (نفس قيمه
  // القديمة للحدود اللي فضلت) — من غيرها كانت حدوده هترجع لقيم البداية من غير ما يعرف. «متوازن» = قيم البداية نفسها
  var LEGACY_PRESETS = {
    calm: { cprWarnMultiple: 2, cprCriticalMultiple: 3, lowDeliveryRatio: 0.1, spikeMultiple: 3, frequencyHigh: 8, accountSpikeMultiple: 2, accountDropRatio: 0.3, minSpendShare: 0.05 },
    strict: { cprWarnMultiple: 1.3, cprCriticalMultiple: 1.7, lowDeliveryRatio: 0.3, spikeMultiple: 1.5, frequencyHigh: 5, accountSpikeMultiple: 1.3, accountDropRatio: 0.6, minSpendShare: 0.01 }
  };
  function withoutPreset(v) {
    if (!v || !('_preset' in v)) return v;
    var out = {}, p = LEGACY_PRESETS[v._preset] || {};
    Object.keys(p).forEach(function (k) { out[k] = p[k]; });
    Object.keys(v).forEach(function (k) { if (k !== '_preset') out[k] = v[k]; });
    return out;
  }
  function loadAlertSettings() {
    try {
      var v = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
      var w = withoutPreset(v);
      if (w !== v) localStorage.setItem(SETTINGS_KEY, JSON.stringify(w));
      return w;
    } catch (e) { return {}; }
  }
  function storeAlertSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); return true; } catch (e) { return false; } }
  var alertSettings = loadAlertSettings();

  // ---------- إعدادات كل حساب إعلاني على السيرفر (مراجعة الإعدادات ٢٤ أكتوبر ٢٠٢٦ — قرار صاحب المنتج: «على مستوى الحساب وليس الجهاز أو المتصفح») ----------
  // سجل واحد للحساب (supabase/functions/sync/settings.ts): كل اللي عندهم وصول للحساب في منصته بيشوفوه من أي جهاز، والتغيير بيظهر عند
  // الكل، والبريد بيقراه هو كمان (runner.ts). Meta وSnapchat بس — السيرفر بيسأل المنصة نفسها إن صاحب المفتاح شايف الحساب. Google وTikTok
  // لسه على الجهاز (alertSettings) لحد ما إثبات الوصول ليهم يتعمل في السيرفر.
  // نسخة الجهاز القديمة (alertSettings) بتتنقل مرة واحدة لأول حساب من كل منصة يتفتح بعد التحديث ومالوش سجل — ده غالباً الحساب اللي
  // اتظبطت عشانه. أي حساب تاني من غير سجل بيبدأ بقيم البداية وحكم الربح بيستنى: أأمن من إنه ياخد مستهدف متجر تاني من غير ما حد يعرف
  var SERVER_SETTINGS = { meta: true, snapchat: true };
  var acctSettings = {};    // { 'meta:act_1': {...} | null } — رد السيرفر (null = الحساب مالوش سجل)
  var acctPulling = {};     // طلب جاري (أو خلص) للحساب في الجلسة دي
  var MIGRATED_KEY = 'pauseproof.alertSettings.migrated.v1';
  function migratedPlatforms() {
    try { var v = JSON.parse(localStorage.getItem(MIGRATED_KEY) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
    catch (e) { return {}; }
  }
  function markMigrated(platform) {
    try { var v = migratedPlatforms(); v[platform] = 1; localStorage.setItem(MIGRATED_KEY, JSON.stringify(v)); } catch (e) { /* التخزين مقفول: النقل ممكن يتكرر لحساب جديد — نفس سلوك قبل التحديث */ }
  }
  function serverSettingsOn(source) { return !!SERVER_SETTINGS[platformOfSource(source)]; }
  function settingsKnown(source) { return Object.prototype.hasOwnProperty.call(acctSettings, source); }
  // الإعدادات اللي بتتحكم في الحساب: سجله على السيرفر لما يوصل، وقبلها (وفي Google وTikTok) نسخة الجهاز
  function settingsFor(source) { return serverSettingsOn(source) && settingsKnown(source) ? (acctSettings[source] || {}) : alertSettings; }
  function sourceOf(platform) { return activeSources[platform] ? platform + ':' + activeSources[platform] : null; }
  function platformTokenOf(platform) {
    if (platform === 'meta') return metaAccessToken();
    if (platform === 'snapchat') return validToken(sessionTokens.snapchat) || snapchatAccessToken;
    return null;
  }
  function settingsCall(action, source, extra) {
    var platform = platformOfSource(source), token = platformTokenOf(platform);
    if (!token) { var e = new Error('no session'); e.code = 'session'; return Promise.reject(e); }
    return syncCall(Object.assign({ action: action, platform: platform, accountId: source.slice(platform.length + 1), platformToken: token }, extra || {}));
  }
  // أول ما الحساب يتفتح في الجلسة: نجيب سجله (بالتوازي مع تحميل الإعلانات). الفشل (شبكة، الجلسة خلصت) = نسخة الجهاز، ونحاول تاني المرة الجاية
  function pullAccountSettings() {
    Object.keys(activeSources).forEach(function (platform) {
      var source = sourceOf(platform);
      if (!source || !SERVER_SETTINGS[platform] || acctPulling[source] || !platformTokenOf(platform)) return;
      acctPulling[source] = true;
      settingsCall('settings.get', source).then(function (res) {
        var rec = res && res.settings && typeof res.settings === 'object' && !Array.isArray(res.settings) ? res.settings : null;
        if (!rec && Object.keys(alertSettings).length && !migratedPlatforms()[platform]) {
          // نقل نسخة الجهاز القديمة للحساب ده (مرة واحدة للمنصة) — والإعدادات بتشتغل بيها على طول حتى لو الحفظ فشل.
          // العلامة بعد ما الحفظ ينجح بس: لو فشل، أول حساب من المنصة دي يتفتح الجلسة الجاية بياخدها
          acctSettings[source] = alertSettings;
          return settingsCall('settings.set', source, { settings: alertSettings }).then(function (r) {
            markMigrated(platform);
            if (r && r.settings) acctSettings[source] = r.settings;
          }, function () { /* الجلسة دي بنسخة الجهاز */ });
        }
        if (rec) markMigrated(platform);
        acctSettings[source] = rec;
      }).then(function () { settingsArrived(source); render(); }, function () { acctPulling[source] = false; settingsArrived(source); });
    });
  }
  // done(stored) بعد الحفظ (stored = false: المتصفح رفض التخزين)، fail(e) لو السيرفر مأكدش — سجل الحساب بيفضل زي ما هو.
  // حساب على الجهاز (Google وTikTok) بيخلص على طول
  function saveAccountSettings(source, values, done, fail) {
    if (!serverSettingsOn(source)) { alertSettings = values; done(storeAlertSettings(values)); return; }
    settingsCall('settings.set', source, { settings: values }).then(function (r) {
      acctSettings[source] = (r && r.settings) || values;
      markMigrated(platformOfSource(source));
      done(true);
    }, fail);
  }

  var ALERT_FMT = { money: money, currencyLabel: currencyLabel, num: numAr, num2: numAr2, int: function (n) { return ar(Math.round(n || 0)); } };
  var analysis = PauseProofAlerts.analyze([], {}, alertSettings, ALERT_FMT);

  // اسم كل حساب وعملته وحالته — عشان تنبيهات مستوى الحساب
  function accountsMeta() {
    var meta = {};
    Object.keys(platformOptions).forEach(function (p) {
      (platformOptions[p] || []).forEach(function (o) {
        var info = accountInfo[p + ':' + o.value] || {};
        meta[p + ':' + o.value] = {
          label: o.label, currency: info.currency || null, timeZone: info.timeZone || null,
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
  // كل حساب بإعداداته (متجرين بهامشين مختلفين = حدّين خسارة مختلفين)
  function runAnalysis() {
    pullAccountSettings();
    var bySource = {};
    candidates.forEach(function (c) { if (!bySource[c.source]) bySource[c.source] = settingsFor(c.source); });
    analysis = PauseProofAlerts.analyze(candidates, accountsMeta(), { bySource: bySource }, ALERT_FMT);
  }
  function adAnalysis(c) { return analysis.byAd[c.id] || { health: c.active ? 'pending' : 'inactive', issues: [], metricLevels: {}, pending: null, basis: null }; }
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
      return '<div class="preview preview-image ' + c.themeClass + '"><span class="format-badge">' + t(c.badgeKey || 'card.staticDesign') + '</span></div>';
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
    // لون خفيف (أخضر/أحمر) على تكلفة النتيجة أو العائد من التقييم (tones في alerts.js) — لو مفيش ملاحظة ملوّنة عليه أصلاً
    var tn = function (metric) {
      var v = period.preset === 'last7' && !mv(c, metric) ? (adAnalysis(c).tones || {})[metric] : 0;
      return v > 0 ? ' tone-good' : (v < 0 ? ' tone-bad' : '');
    };
    // اللون على التكلفة بالنسبة لأقصى التكلفة المقبولة لو محددة (tones.cprMax — مراجعة الإعدادات)، وإلا بالنسبة لباقي حملته لو بياناتها
    // تكفي (tones.cprCamp — التدقيق العميق ٢٤ أكتوبر)، وإلا باقي الإعلانات
    var tnTip = function (metric) {
      var tones = adAnalysis(c).tones || {}, k = tn(metric), key = metric === 'cpr' && tones.cprMax ? 'cprMax' : (metric === 'cpr' && tones.cprCamp ? 'cprCamp' : metric);
      return k ? ' — ' + t('chip.tone.' + key + (k === ' tone-good' ? '.good' : '.bad')) : '';
    };
    var tip = ' — ' + periodLabel();
    // شبكة أرقام بعنوان صغير تحت كل رقم (ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦: الكارت فيه نص وتفاصيل كتير — أرقام من غير عناوين
    // في سطرين بأشكال مختلفة). نفس الألوان: ملاحظة التنبيه (mv-*) أو اللون الخفيف من التقييم (tone-*)
    var stat = function (value, label, cls, title) {
      return '<span class="card-stat' + cls + '" title="' + esc(title) + '"><b class="card-stat-v">' + value + '</b><span class="card-stat-k">' + esc(label) + '</span></span>';
    };
    var cells = [stat(money(p.spend, c.currency), t('chip.spend'), hl('spend'), t('chip.spend') + tip)];
    if (p.results != null) cells.push(stat(fmtNum(p.results), resultLabelOf(c), hl('results'), t('chip.results') + tip));
    // تكلفة النتيجة (زي تكلفة الطلب CPO) والعائد (ROAS) الاتنين بيظهروا لو موجودين — كل واحد بيجاوب سؤال مختلف:
    // التكلفة مقارنةً بهامش ربحك، والعائد مقارنةً بالمبيعات
    if (p.cpr != null) cells.push(stat(money(p.cpr, c.currency), t('card.k.cpr', { one: resultNounOf(c, 1) }), hl('cpr') + tn('cpr'), t('chip.cprTip') + tip + tnTip('cpr')));
    if (p.roas != null || hl('roas')) cells.push(stat(roasStr(p.roas), t('chip.roas'), hl('roas') + tn('roas'), t('chip.roasTip') + tip + tnTip('roas')));
    // علامات بتظهر بس لو عليها ملاحظة (تكرار عالي، وصول ضعيف)
    var flags = '';
    if (c.frequency != null && mv(c, 'frequency')) {
      flags += '<span class="metric-chip' + mv(c, 'frequency') + '" title="' + t('chip.freqTip') + (c.frequencyLife != null ? ' — ' + t('chip.freqLife', { v: numAr(c.frequencyLife) }) : '') + '">' + t('chip.freq') + ' ' + numAr(c.frequency) + '</span>';
    }
    if (mv(c, 'delivery') && !mv(c, 'spend')) {
      flags += '<span class="metric-chip' + mv(c, 'delivery') + '">' + t('chip.weakDelivery') + '</span>';
    }
    return '<div class="card-stats">' + cells.join('') + '</div>' + (flags ? '<div class="card-metrics">' + flags + '</div>' : '');
  }

  function cardMarkup(c) {
    var eid = esc(c.id);
    var a = adAnalysis(c);
    var h = HEALTH[a.health];
    // التقييم دايماً على آخر ٧ أيام — لو الكارت بيعرض فترة تانية بنقول ده في التلميح
    var dotTitle = h.label + (period.preset !== 'last7' ? ' — ' + t('x.basisPeriod') : '');
    var dot = '<span class="health-dot ' + h.cls + '" title="' + esc(dotTitle) + '"><span class="sr-only">' + h.label + '</span></span>';
    // ملاحظات "للعلم" (إعلان صغير بالنسبة لحسابه) مبتظهرش على الكارت — بتظهر في التفاصيل بس
    var shown = a.issues.filter(function (i) { return i.level !== 'info'; });
    var top = shown[0];
    var issueLine = top
      ? '<div class="card-issue ' + LEVELS[top.level].cls + '">' + esc(top.title) + (shown.length > 1 ? ' <span class="card-issue-more">+' + ar(shown.length - 1) + '</span>' : '') + '</div>'
      // «لم يُحكم بعد»: السبب باختصار مكان الملاحظة (جديد، إنفاق صغير، مبيصرفش...)
      : (a.health === 'pending' && a.pending ? '<div class="card-issue lv-pending">' + esc(a.pendingTitle || t('pend.' + a.pending + '.t')) + '</div>' : '');
    // اسم الإعلان هو العنوان، والمنصة والحملة سطر صغير تحته (قبل كده الحملة كانت العنوان العريض في ٣ سطور والإعلان رمادي مقطوع)
    var line1 = '<div class="card-line1" dir="auto" title="' + esc(c.placement) + '">' + esc(c.platform) + ' · ' + esc(c.placement) + '</div>';
    var name = '<div class="card-name" dir="auto" title="' + esc(c.offer) + '">' + esc(c.offer) + '</div>';
    var info = '<div class="card-info">' + name + line1 + issueLine + cardChips(c);

    return (
      '<article class="candidate-card ' + h.cls + '" id="card-' + eid + '" data-id="' + eid + '" tabindex="0" role="button" aria-label="' + esc(c.offer) + ' — ' + h.label + '">' +
        dot +
        previewMarkup(c) +
        info +
          '<div class="card-foot">' +
            '<span class="days-badge">' + sinceLabel(c.daysAgo) + '</span>' +
            // وسم التعديل الحديث (٣ أيام كاملة بعده) أيّاً كان الحكم — قرار صاحب المنتج ٢٥ أكتوبر. اللي اتعدّل في التلميح وفي التفاصيل
            (a.editTag ? '<span class="edit-tag" title="' + esc(a.editTag.what) + '">' + esc(t('tag.edited', { when: a.editTag.when })) + '</span>' : '') +
            '<span class="status-text' + (c.active ? ' on' : '') + '">' + statusLabelOf(c) + '</span>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }


  // الافتراضي: الإعلانات المتوقفة مستخبية (إلا اللي عليها تنبيه عاجل) — لحد ما العميل يطلبها، أو يدوّر بالاسم،
  // أو يختار فلتر حالة، أو الحساب كله مفيهوش ولا إعلان شغّال
  // إعلانات حملة واحدة (filters.campaign) بتظهر كلها بالمتوقفة: كارت الحملة بقى مجموع كل إعلاناتها، فاللي تحته لازم يطابقه
  function hidesStopped() {
    return !showStopped && filters.health === 'all' && !filters.text && !filters.campaign && candidates.some(function (c) { return c.active; });
  }
  // allStopped = من غير إخفاء المتوقفة الافتراضي (عرض الحملات: الحملة مجموع كل إعلاناتها اللي ليها أرقام في الفترة)
  function visibleCandidates(allStopped) {
    var hide = !allStopped && hidesStopped();
    return candidates.filter(function (c) {
      if (hide && !c.active && adAnalysis(c).health !== 'review') return false;
      if (!platPicked(platformOfSource(c.source))) return false;   // اختيار المنصات للصفحة كلها (platSel)
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
      // كل إعلاناتها الشغّالة «لم يُحكم بعد» = الحملة نفسها لسه مفيش حكم عليها
      else if (!g.health.good && !g.health.improve && !g.health.review && g.health.pending) g.status = 'pending';
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
    // من «يحتاج انتباهك الآن» في الملخص كمان: إعلانات الحملة في صفحة «الإعلانات» من أولها
    showView('ads');
    render();
    window.scrollTo({ top: 0 });
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
  function moreButton(shown, total, noStopped) {
    if (total <= shown) return noStopped ? '' : stoppedButton();
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
    // الحملة اللي في الرابط (js/route.js) بتتطبّق أول ما إعلاناتها توصل — قبل السطر اللي تحت ما يشيلها
    if (typeof routeBeforeRender === 'function') routeBeforeRender();
    // لو الحملة اللي كنت فاتحها مش موجودة تاني (بدّلت الحساب مثلاً) الفلتر بيتشال لوحده
    if (filters.campaign && !candidates.some(function (c) { return campaignKey(c) === filters.campaign; })) filters.campaign = null;
    var visible = sortCandidates(visibleCandidates(), filters.sort);
    var signature = JSON.stringify([filters, platSel, viewMode, periodKey()]);
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
      // الحملة = مجموع كل إعلاناتها اللي ليها أرقام في الفترة، بالمتوقفة (الفلاتر اللي العميل اختارها بس هي اللي بتقلّلها).
      // مراجعة المرحلة ٤ (١٨ أكتوبر ٢٠٢٦، حساب حقيقي): كانت من الإعلانات الظاهرة بعد إخفاء المتوقفة — ٥ حملات من ١٣، وحملة
      // صرفت ٥٩٠ ر.س من غير ولا طلب مش ظاهرة، وحملة ١١٧ $ وطلب واحد وحقيقتها ٢٧١ $ و٤ طلبات (Kimball: المجموع = مجموع اللي تحته)
      var campAds = sortCandidates(visibleCandidates(true), filters.sort);
      var camps = sortCampaigns(groupCampaigns(campAds), filters.sort);
      cardGrid.innerHTML = camps.length
        ? camps.slice(0, renderLimit).map(campaignMarkup).join('') + moreButton(renderLimit, camps.length, true)
        : '<div class="empty-state" style="grid-column:1/-1">' + t('gallery.noMatch') + '</div>';
      galleryCount.textContent = t('gallery.countCampaigns', { n: ar(camps.length), camps: noun(camps.length, 'n.campaign'), m: ar(campAds.length), ads: noun(campAds.length, 'n.ad') });
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
    renderCurrencyPref();
    renderAlerts();
    // ملخص المتجر كله: الحكم والأرقام وسطر النهارده و«يحتاج انتباهك الآن» (renderKpis وrenderTopAlerts جواه)
    renderDiagnosis();
    maybeShowWelcome();
    refreshOpenExpand();
    // الرابط وزرار الرجوع (js/route.js): بعد الرسم عشان يشوف الحالة النهائية
    if (typeof routeAfterRender === 'function') routeAfterRender();
  }

  // ---------- ملخص المتجر (js/diagnosis.js) ----------
  // النص كله بيتركّب من التقرير وقت الرسم — فتغيير اللغة بيبان على طول من غير تحميل تاني
  var DX_KIND_LABEL = { urgent: 'dx.kind.urgent', decision: 'dx.kind.decision', watch: 'dx.kind.watch', opportunity: 'dx.kind.opportunity' };
  function dxPct(x) { return ar(Math.round(Math.abs(x) * 100)) + (isAr() ? '٪' : '%'); }
  function dxKpiHtml(k) {
    // كل تحسّن أخضر وكل تراجع أحمر (ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦، المرة التانية — الرمادي على تغيّر ٤٢٪ كان مضلل):
    // مؤكد = بخلفية، غير مؤكد = اللون من غير خلفية. الإنفاق من غير لون (زيادته أو نقصه مش تحسّن ولا تراجع في ذاتها)،
    // وأقل من ١٪ = مفيش تغيّر
    var dir = k.sig || (k.pct != null && Math.abs(k.pct) >= 0.01 ? (k.pct > 0 ? 1 : -1) : 0), lvl = k.sig ? 'strong' : 'soft';
    var tone = !dir || k.goodUp == null ? '' : ((dir > 0) === k.goodUp ? ' good ' : ' bad ') + lvl;
    var tip = tone ? t('dx.kpi.tip.' + lvl) : '';
    var pct = k.pct == null || Math.abs(k.pct) < 0.005 ? '' :
      '<span class="dx-kpi-pct' + tone + '"' + (tip ? ' title="' + esc(tip) + '"' : '') + '>' + (k.pct > 0 ? '↑ ' : '↓ ') + dxPct(k.pct) + '</span>';
    return '<div class="dx-kpi"><div class="dx-kpi-label">' + esc(k.label) + '</div>' +
      '<div class="dx-kpi-value">' + esc(k.value) + ' ' + pct + '</div>' +
      '<div class="dx-kpi-sub">' + esc(t('dx.kpi.prev', { v: k.prev })) + '</div></div>';
  }
  // bare = جوه بند قابل للفتح (القائمة أو المطويات) — النوع والعنوان ظاهرين فوقه أصلاً
  function dxBlockHtml(b, i, bare) {
    var p = function (cls, s) { return '<p' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(s) + '</p>'; };
    var html = '<article class="dx-block dx-' + b.kind + '">';
    if (!bare && DX_KIND_LABEL[b.kind]) html += '<span class="dx-kind">' + esc(t(DX_KIND_LABEL[b.kind])) + '</span>';
    if (!bare) html += '<h3>' + esc(b.title) + '</h3>';
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
  // جلسة مكتبة فيسبوك، أو مفتاح الربط المحفوظ على الجهاز (الهاتف — core.js renewMeta)
  function metaAccessToken() {
    try { var a = window.FB && FB.getAuthResponse ? FB.getAuthResponse() : null; if (a && a.accessToken) return a.accessToken; }
    catch (e) { /* المكتبة مش جاهزة */ }
    return validToken(sessionTokens.meta);
  }
  // العرض ده بيتزامن؟ عرض حساب Meta لوحده بس («meta:act_1»)
  function syncableView(viewKey) { return typeof viewKey === 'string' && /^meta:act_\d{1,30}$/.test(viewKey); }
  // الخطأ بيرجع بحالته ورمزه من السيرفر (e.code = 'email' / 'days' / 'not verified' …) عشان الرسالة تبقى دقيقة
  // دالة sync محتاجة دخول الأداة كمان (js/auth.js) — ٤٠١ code: LOGIN = صفحة الدخول
  function syncCall(body) {
    var send = function (auth) {
      var headers = { 'Content-Type': 'application/json' };
      Object.keys(auth || {}).forEach(function (k) { headers[k] = auth[k]; });
      return fetch(SYNC_URL, { method: 'POST', headers: headers, body: JSON.stringify(body) });
    };
    // الطلب بيتبعت فوراً لو مفتاح الدخول لسه صالح، وبيستنى التجديد بس لو محتاجه
    var now = window.AuthLogin ? AuthLogin.headersNow() : {};
    return (now ? send(now) : loginHeaders().then(send)).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (window.AuthLogin && AuthLogin.isLoginFailure({ status: r.status, data: j })) AuthLogin.toLogin();
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
  // حساب Meta المفتوح أياً كان عرض الملخص (من ١١ أكتوبر ٢٠٢٦ البطاقة في «الإعدادات» — قبل كده عرض Meta لوحده في الملخص بس)
  function digestAccount() { var id = activeSources.meta; return /^act_\d{1,30}$/.test(id || '') ? id : null; }
  // المستهدف وحد الخسارة وحدود التنبيهات في البريد: من سجل الحساب نفسه على السيرفر (runner.ts effectiveSettings — مراجعة الإعدادات
  // ٢٤ أكتوبر ٢٠٢٦). قبل كده كل متصفح كان بيبعت نسخته مع الملخص («آخر جهاز يفوز»: فتح الأداة من متصفح تاني رجّع حد الخسارة في البريد
  // من ×٥ لـ×١ — اتشاف حياً)؛ دلوقتي المتصفح مبيبعتهمش خالص، والنسخة القديمة اللي في الملخص بتشتغل بس لحساب مالوش سجل لسه
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
    var head = '';   // العنوان في البطاقة نفسها (صفحة الإعدادات)
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
  // البطاقة في «الإعدادات» وتلميح التفعيل في الملخص: بيتنادى مع كل رسم للملخص ومع فتح صفحة الإعدادات.
  // الصندوق نفسه مش بيتعاد رسمه هنا (عشان ميمسحش اللي العميل بيكتبه)، وحالته بتتجاب من السيرفر أول ما الصفحة تتفتح بس
  function renderDigest() {
    var card = document.getElementById('digestCard'), panel = document.getElementById('dxAuto'), hint = document.getElementById('dxAutoHint');
    if (!card || !panel) return;
    var account = digestAccount();
    var show = DIGEST_ON && !!account && !!metaAccessToken();
    if (digestUi.account !== account) digestUi = digestFresh(account);
    // ?digest=0 بيخفيها على الجهاز ده (DIGEST_ON في core.js)
    card.hidden = !DIGEST_ON;
    var note = document.getElementById('digestCardNote');
    if (note) note.textContent = show ? t('set.page.digestFor', { name: accountLabel('meta') }) : t('set.page.digestNoMeta');
    panel.hidden = !show;
    if (!show) panel.innerHTML = '';
    else if (currentView === 'settings') {
      if (digestUi.status === 'idle') digestLoad();
      else if (!panel.firstChild) renderDigestPanel();
    }
    // تلميح التفعيل: الحساب مش مفعّل له الملخص (أكيد)، ومحدش ضغط «لاحقاً» قريب
    if (hint) {
      var showHint = show && digestKnown[account] === false && !digestHintSnoozed(account);
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
  // بعد «فعّلها الآن»: البطاقة قدامك والمؤشر في خانة البريد — أول ما النموذج يجهز (الحالة بتيجي من السيرفر).
  // لو الملخص مفعّل أصلاً مفيش خانة، فبنكتفي بالبطاقة
  function digestFocus() {
    if (!digestUi.wantFocus) return;
    var card = document.getElementById('digestCard'), field = document.getElementById('dxAutoEmail');
    if (card && card.scrollIntoView) card.scrollIntoView({ block: 'start' });
    if (field) field.focus({ preventScroll: true });
    if (field || digestUi.status === 'ready' || digestUi.status === 'error') digestUi.wantFocus = false;
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
      digestFocus();
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
    // «فعّلها الآن» في الملخص: صفحة «الإعدادات» على بطاقة الملخص التلقائي، والمؤشر في خانة البريد
    if (e.target.closest('[data-digest-hint-on]')) {
      digestUi.wantFocus = true;
      goView('settings');
      if (digestUi.status === 'error') digestLoad();
      digestFocus();
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
  var dxGen = 0;
  function dxDone(platform, key, input) {
    var s = dxState.sources[platform];
    if (!s || s.key !== key) return;   // رد قديم (العميل بدّل الحساب أو الفترة)
    input.feedback = dxFbFor(s.accountId);
    s.input = input;
    s.gen = ++dxGen;   // نسخة التقرير — مفتاح الجمع المحفوظ (dxSelection)
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
  // ---------- اختيار المنصات للصفحة كلها (طلب صاحب المنتج ٢٥ أكتوبر) ----------
  // «كل المنصات» افتراضياً، وجنبه زرار لكل منصة متصلة بلونها وشعارها. الضغط على منصة = هي بس، وعلى تانية = تتضاف، وعلى
  // المختارة = تتشال (ولو اتشالت كلها أو اتختارت كلها = «كل المنصات»). اختيار واحد للصفحة كلها (قراره: «تتبع الاختيار»):
  // ملخص المتجر و«يحتاج انتباهك الآن» ولوحة الهدر وقائمة الإعلانات. platSel = null (كل المنصات) أو منصات بترتيب ثابت
  var platSel = null;
  var PLAT_ORDER = ['meta', 'google', 'snapchat', 'tiktok'];
  function connectedPlats() { return PLAT_ORDER.filter(function (p) { return PLATFORMS.indexOf(p) > -1 && isConnected(p); }); }
  function platPicked(p) { return !platSel || platSel.indexOf(p) > -1; }
  function pickPlat(p) {
    var all = connectedPlats();
    if (p === 'all') platSel = null;
    else if (!platSel) platSel = [p];
    else if (platSel.indexOf(p) > -1) platSel = platSel.filter(function (x) { return x !== p; });
    else platSel = platSel.concat([p]);
    if (platSel) platSel = all.filter(function (x) { return platSel.indexOf(x) > -1; });
    if (platSel && (!platSel.length || platSel.length === all.length)) platSel = null;
  }
  // عملة الأرقام المجمّعة (قراره: «بسعر الربط الرسمي، وأضف اختياراً في الإعدادات لتحديد العملة»): المحفوظة على الجهاز، وإلا
  // عملة الأكبر مبلغاً بين اللي بيتجمعوا (بالدولار للمقارنة). أرقام الحساب الواحد بتفضل بعملته زي منصته
  var CUR_PREF_KEY = 'acc.currency';
  function curPref() { try { var v = localStorage.getItem(CUR_PREF_KEY); return v && DX.pegRate(v, 'USD') ? v : null; } catch (e) { return null; } }
  function setCurPref(v) { try { if (v && DX.pegRate(v, 'USD')) localStorage.setItem(CUR_PREF_KEY, v); else localStorage.removeItem(CUR_PREF_KEY); } catch (e) { /* مش مهم */ } }
  function targetCurrency(amounts) {
    var pref = curPref();
    if (pref) return pref;
    var best = null, bestUsd = -1;
    Object.keys(amounts).forEach(function (k) {
      var r = DX.pegRate(k, 'USD'), usd = r ? (amounts[k] || 0) * r : -1;
      if (usd > bestUsd) { bestUsd = usd; best = k; }
    });
    return best;
  }
  // جمع منصات الاختيار في عرض واحد. المنصة اللي مفيش ولا عملية شراء بتوصلها (noPurchases) برّه أرقام المبيعات: مبيعاتها مش
  // معروفة (مش صفر)، وجمع إنفاقها مع مبيعات غيرها بينزّل العائد (حساب حقيقي ١٨ أكتوبر: رسائل Meta + مبيعات Snapchat = ×١٫٨ «أقل
  // من حد الخسارة» وSnapchat لوحده ×٣ — Kimball: القيمة المجهولة مش صفر). العملات المختلفة بتتحوّل بسعر الربط الرسمي (DX.pegRate)،
  // وعملة مش مربوطة = منقدرش نجمع. والأيام: نفس الأيام المكتملة لازم، والتوقيت المختلف جملة (قبل كده كان بيمنع «كل المنصات»)
  var dxCombos = {};
  function dxSelection(sel) {
    var S = dxState.sources;
    if (!sel.length) return null;
    if (sel.length === 1) { var s1 = S[sel[0]]; return { report: s1.report, account: s1.account, accountId: s1.accountId, plats: sel }; }
    var sales = sel.filter(function (p) { return !S[p].report || S[p].report.status !== 'noPurchases'; });
    // «برّه أرقام المبيعات» بس لو فيه أرقام مبيعات أصلاً — كلهم من غير مشتريات = مفيش حاجة اتشالت (فحص حي ٢٥ أكتوبر: الجملة
    // كانت بتطلع على حسابين رسائل وسوايب)
    var excluded = sales.length ? sel.filter(function (p) { return sales.indexOf(p) === -1; }) : [];
    if (sales.length === 1) { var s = S[sales[0]]; return { report: s.report, account: s.account, accountId: s.accountId, plats: sales, excluded: excluded }; }
    var group = sales.length ? sales : sel, f = S[group[0]].input;
    if (!group.every(function (p) { return S[p].input.since === f.since && S[p].input.until === f.until; })) return { blocked: 'period', plats: group };
    var curs = {}, amounts = {};
    group.forEach(function (p) {
      var c = S[p].input.currency || '';
      curs[c] = 1;
      amounts[c] = (amounts[c] || 0) + (S[p].input.daily || []).reduce(function (a, d) { return a + (Number(d.spend) || 0); }, 0);
    });
    var curList = Object.keys(curs), to = curList.length > 1 ? targetCurrency(amounts) : null;
    if (curList.length > 1 && !curList.every(function (c) { return DX.pegRate(c, 'USD'); })) return { blocked: 'currency', plats: group, curs: curList };
    var accId = 'all:' + group.map(function (p) { return S[p].accountId; }).join(',');
    // المفتاح بنسخة كل تقرير (gen — dxDone) وتقييمات العميل: أرقام جديدة أو تقييم جديد = تحليل جديد
    var fb = dxFbFor(accId);
    var key = group.map(function (p) { return S[p].key + '#' + S[p].gen; }).join('|') + '|' + (to || '') + '|' + JSON.stringify(fb);
    if (!dxCombos[key]) {
      var input = DX.combine(group.map(function (p) {
        var x = S[p].input;
        return { platform: p, input: to && x.currency !== to ? DX.convertInput(x, DX.pegRate(x.currency, to), to) : x };
      }));
      input.feedback = fb;
      dxCombos[key] = DX.attachPlatforms(DX.analyze(input), group.map(function (p) { return { platform: p, report: S[p].report }; }));
    }
    var tzs = group.map(function (p) { return S[p].input.timezone || ''; }).filter(function (z, i, a) { return a.indexOf(z) === i; });
    return { report: dxCombos[key], plats: group, excluded: excluded, accountId: accId, multi: true,
      account: group.map(function (p) { return S[p].account; }).filter(Boolean).join(' + '),
      conv: to ? { to: to, from: curList.filter(function (c) { return c !== to; }) } : null, tzs: tzs.length > 1 ? tzs : null };
  }
  // خانة العملة في صفحة الإعدادات: «تلقائي» + العملات المربوطة بالدولار، بأسمائها بلغة الأداة (Intl.DisplayNames). بتترسم
  // من جديد لو اللغة اتغيّرت بس
  var curPrefLang = null;
  function renderCurrencyPref() {
    var el = document.getElementById('currencyPref');
    if (!el || curPrefLang === I18N.lang) return;
    curPrefLang = I18N.lang;
    var names = null;
    try { names = new Intl.DisplayNames([curPrefLang], { type: 'currency' }); } catch (e) { /* متصفح قديم: الرمز بس */ }
    el.innerHTML = '<option value="">' + esc(t('set.page.currencyAuto')) + '</option>' + DX.PEGGED.map(function (c) {
      var n = names ? names.of(c) : '';
      return '<option value="' + c + '">' + esc((n && n !== c ? n + ' — ' : '') + (currencyLabel(c) || c)) + '</option>';
    }).join('');
    el.value = curPref() || '';
  }
  (function () {
    var el = document.getElementById('currencyPref');
    if (el) el.addEventListener('change', function () { setCurPref(el.value || null); dxBuild(); render(); });
  })();
  // العرض بالاختيار الحالي — من غير رسم (render بيرسم الملخص)
  function dxBuild() {
    // منصة اتفصلت بتتشال من الاختيار، ولو مفضلش غيرها = كل المنصات
    if (platSel) { platSel = platSel.filter(isConnected); if (!platSel.length) platSel = null; }
    var S = dxState.sources, ids = DX_PLATFORM_ORDER.filter(function (p) { return S[p]; });
    var ready = ids.filter(function (p) { return S[p].status === 'ready'; });
    dxState.views = ready.map(function (p) { return { id: p, report: S[p].report, account: S[p].account, accountId: S[p].accountId }; });
    var mine = ids.filter(platPicked), sel = ready.filter(platPicked);
    var cur = dxSelection(sel) || {};
    dxState.sel = cur;
    dxState.view = sel.length === 1 ? sel[0] : 'all';
    dxState.report = cur.report || null;
    dxState.account = cur.account || null;
    dxState.accountId = cur.accountId || null;
    // منصة مختارة ملخصها لسه مبدأش (الأرقام لسه جاية) = بيتحمّل
    dxState.status = cur.report || cur.blocked ? 'ready' : (!ids.length ? 'idle'
      : (mine.some(function (p) { return S[p].status === 'loading'; }) || (!mine.length && anyLoading()) ? 'loading' : 'error'));
  }
  function dxRecompute() { dxBuild(); renderDiagnosis(); }
  // ---------- ملخص المتجر: قسم واحد (قرار صاحب المنتج ٧ أكتوبر ٢٠٢٦) ----------
  // قبل كده «ملخص الأداء» (أرقام شاملة النهارده) و«ملخص المتجر» (أيام مكتملة) كانوا قسمين بأرقام مختلفة لنفس الفترة،
  // ونفس المشكلة كانت بتظهر فيهم الاتنين. دلوقتي بالترتيب: الحكم والأرقام من الملخص، وسطر «اليوم حتى الآن» لوحده
  // (مبيدخلش المقارنة)، و«يحتاج انتباهك الآن» قائمة واحدة (DX.attention)، والشرح والفرص مطويين.
  // الملخص مش متاح (الحساب مفيهوش مشتريات، فشل، ?dx=0): شريط الإنفاق والنتائج القديم مكان الأرقام، والقائمة زي ما هي.
  // وهو بيتحمّل: الأرقام بتستنى (عشان متظهرش أرقام وتتبدّل قدام العميل)، والتنبيهات بتظهر على طول
  // ---------- قفل الصفحة وهي بتتحمّل (ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦) ----------
  // قبل كده الكروت كانت بتظهر من غير أرقام و«يحتاج انتباهك الآن» يكتب «لا شيء عاجل»، وبعد ثواني تظهر التنبيهات والملخص.
  // دلوقتي المحتوى مقفول (من غير تمرير ولا ضغط) لحد ما أرقام كل المنصات تيجي والملخص يخلص. الشريط العلوي بيفضل شغّال
  // (تغيير الحساب، الخروج)، ولو التحميل طوّل عن ٣٠ ثانية القفل بيتشال والقسم اللي لسه بيتحمّل بيقول كده بنفسه
  var LOCK_MAX_MS = 30000, lockSince = 0, lockTimer = null;
  function pageBusy() {
    if (PLATFORMS.some(function (p) { return numbersPending[p]; })) return true;
    return DX_ON && PLATFORMS.some(isConnected) && dxState.status === 'loading';
  }
  function renderPageLock() {
    var el = document.getElementById('pageLock');
    if (!el) return;
    var busy = pageBusy();
    if (!busy) lockSince = 0;
    else if (!lockSince) lockSince = Date.now();
    var on = busy && Date.now() - lockSince < LOCK_MAX_MS;
    if (on && !lockTimer) lockTimer = setTimeout(function () { lockTimer = null; renderPageLock(); }, LOCK_MAX_MS - (Date.now() - lockSince) + 50);
    if (on) {
      var bar = document.querySelector('.appbar');
      el.style.top = Math.max(0, bar ? bar.getBoundingClientRect().bottom : 0) + 'px';
      document.getElementById('pageLockSub').textContent = connectStatus.textContent;
    }
    el.hidden = !on;
    document.body.classList.toggle('page-locked', on);
  }
  function renderDiagnosis() {
    renderPageLock();
    var sec = document.getElementById('storeSec');
    if (!sec) return;
    renderDigest();
    var dxOn = DX_ON && PLATFORMS.some(isConnected) && dxState.status !== 'idle';
    sec.hidden = !dxOn && !candidates.length;
    var body = document.getElementById('dxBody'), period = document.getElementById('dxPeriod'), copy = document.getElementById('dxCopy');
    var loading = dxOn && dxState.status === 'loading', o = null;
    if (dxOn && dxState.status === 'ready' && dxState.report) {
      // الهدف وحد الخسارة من إعدادات التنبيهات (نفس اللي بيتحكم بيهم على الإعلانات) — الربح أولاً في الملخص كمان
      o = DX.compose(dxState.report, { target: dxGoals() });
      // أكتر من حساب كلهم من غير مشتريات: العنوان بصيغة الجمع
      if (o && dxState.sel && dxState.sel.multi && dxState.report.status === 'noPurchases') {
        var one = o.title;
        o.title = t('dx.head.noPurchasesMany');
        (o.blocks || []).forEach(function (b) { if (b.title === one) b.title = o.title; });
      }
    }
    dxState.composed = o;
    copy.hidden = !o;
    // أرقام الملخص (طلبات، مبيعات، عائد…) — مفيش مشتريات = شريط الإنفاق والنتائج مكانها
    var nums = !!(o && o.kpis && o.kpis.length);
    renderKpis(!nums && !loading, dxViewPlatforms());
    var lines = (nums ? storeLines(dxViewPlatforms()) : []).concat(costVsMax(dxViewPlatforms()));
    document.getElementById('dxToday').innerHTML = lines.map(function (l) { return '<p>' + esc(l.text) + '</p>'; }).join('');
    // بين قوسين مش «·» — النقطة جنب الأرقام العربية بتتقري «٠»
    period.textContent = nums ? o.period + (lines.some(function (l) { return l.today; }) ? ' (' + t('dx.fullDays') + ')' : '') : '';
    // أزرار المنصات («كل المنصات» + كل منصة متصلة بلونها وشعارها) — اسم الحساب جنب المنصة: قائمة الحسابات فوق بتقول حساب منصة
    // واحدة بس (حساب حقيقي ١١ أكتوبر ٢٠٢٦: القائمة على Snapchat والصفحة فيها إعلانات Meta ومفيش مكان بيقول أنهي حساب Meta)
    var chips = platChipsHtml(true);
    var tabs = chips ? '<div class="dx-views" role="group" aria-label="' + esc(t('dx.view.aria')) + '">' + chips + '</div>' : '';
    // منصة مختارة لسه بتتحمّل بعد ما التانية خلصت
    var pending = DX_PLATFORM_ORDER.filter(function (p) { return platPicked(p) && dxState.sources && dxState.sources[p] && dxState.sources[p].status === 'loading'; });
    var more = pending.length ? '<p class="dx-notes">' + esc(t('dx.loadingMore', { platforms: DX.listText(pending.map(function (p) { return t('dx.plat.' + p); })) })) + '</p>' : '';
    dxMixNotes().forEach(function (n) { more += '<p class="dx-notes">' + esc(n) + '</p>'; });
    if (!o) {
      var wait = dxState.sel && dxState.sel.blocked ? '' : (dxOn ? '<p class="dx-wait">' + esc(t(loading ? 'dx.loading' : 'dx.failed')) + '</p>' : '');
      body.innerHTML = dxOn ? tabs + more + wait : '';
      body.setAttribute('aria-busy', loading ? 'true' : 'false');
      renderVerdict(null);
      renderDxMore(null, renderTopAlerts(null));
      return;
    }
    body.setAttribute('aria-busy', 'false');
    body.innerHTML = tabs + more + '<div class="dx-head ' + esc(o.tone) + '"><p class="dx-headline">' + esc(o.title) + '</p>' +
      (o.basis ? '<p class="dx-basis">' + esc(o.basis) + '</p>' : '') +
      (nums ? '<div class="dx-kpis">' + o.kpis.map(dxKpiHtml).join('') + '</div>' : '') +
      // شرح الألوان بيظهر بس لو فيه رقم ملوّن (على الهاتف مفيش تلميح بالماوس)
      (nums && o.kpis.some(function (k) { return k.goodUp != null && (k.sig || k.soft); }) ? '<p class="dx-kpi-legend">' + esc(t('dx.kpi.legend')) + '</p>' : '') + '</div>';
    renderVerdict(o);
    renderDxMore(o, renderTopAlerts(o));
  }
  // سبب الحكم ظاهر بلون الحكم بين الأرقام والتنبيهات (ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦: كان مطوي تحت «تفاصيل الحكم»
  // ومكانه مش واضح) — والشرح المطوي تحت مبيكررهوش (renderDxMore)
  function renderVerdict(o) {
    var el = document.getElementById('dxVerdict');
    if (!el) return;
    var b = o && o.main >= 0 ? o.blocks[o.main] : null;
    el.innerHTML = b ? '<div class="dx-verdict ' + esc(o.tone) + '"><p class="dx-verdict-title">' + esc(t('dx.verdict.title')) + '</p>' +
      dxBlockHtml(b, o.main, true) + '</div>' : '';
  }
  // منصات العرض الظاهر في الملخص («كل المنصات» = المنصات اللي اتجمعت فيه — من غير اللي مفيش مشتريات بتوصلها) — null = مفيش
  // عروض، كل الإعلانات
  // مستهدف العرض: حساب واحد = إعداداته. «كل المنصات» = المستهدف المشترك لو كل الحسابات متفقة عليه، وإلا مفيش سطر مستهدف
  // (مستهدف متجر على عائد مجمّع من حسابين بهامشين مختلفين = حكم غلط)
  function dxGoals() {
    // منصات أرقام المبيعات بس (اللي مفيش مشتريات بتوصلها برّه — dxSelection)
    var goals = ((dxState.sel && dxState.sel.plats) || dxViewPlatforms() || []).map(function (p) {
      var s = PauseProofAlerts.mergeSettings(settingsFor(sourceOf(p) || ''));
      return { roas: s.roasTarget, be: s.roasBreakEven };
    });
    var g = goals[0];
    if (!g || !(g.roas > 0)) return null;
    return goals.every(function (x) { return x.roas === g.roas && x.be === g.be; }) ? g : null;
  }
  // المنصات المختارة المتصلة (شريط الأرقام وسطر النهارده والتكلفة مقابل الحد) — null = كل الإعلانات
  function dxViewPlatforms() { return platSel ? platSel.slice() : null; }
  // جمل فوق أرقام الملخص وفي النص المنسوخ: منصة برّه أرقام المبيعات (مفيش مشتريات بتوصلها)، والتحويل بسعر الربط، والتوقيت
  // المختلف، ومنقدرش نجمع (عملة مش مربوطة أو أيام مختلفة)
  function dxMixNotes() {
    var sel = dxState.sel || {}, out = [];
    var names = function (list) { return DX.listText((list || []).map(function (p) { return t('dx.plat.' + p); })); };
    if (sel.blocked === 'currency') out.push(t('dx.view.blockedCur', { platforms: names(sel.plats), curs: sel.curs.join('، ') }));
    if (sel.blocked === 'period') out.push(t('dx.view.blockedPeriod', { platforms: names(sel.plats) }));
    if (sel.excluded && sel.excluded.length) out.push(t('dx.view.excluded', { platforms: names(sel.excluded) }));
    if (sel.conv) {
      // السعر بصيغته الرسمية «١ $ = ٣٫٧٥ ر.س» لكل عملة غير الدولار في الجمع (فحص حي ٢٥ أكتوبر: «١ ر.س = ٠٫٢٧ $» مقرّب ومش مألوف)
      var curs = [sel.conv.to].concat(sel.conv.from).filter(function (c, i, a) { return c !== 'USD' && a.indexOf(c) === i; });
      out.push(t('dx.view.conv', { to: currencyLabel(sel.conv.to) || sel.conv.to, parts: DX.listText(curs.map(function (c) {
        return '1 $ = ' + DX.pegRate('USD', c) + ' ' + (currencyLabel(c) || c);
      })).replace(/[0-9]+(\.[0-9]+)?/g, function (n) { return ar(n.replace('.', decSep())); }) }));
    }
    if (sel.tzs) out.push(t('dx.view.tz'));
    return out;
  }
  function dxExcludedNote() { return dxMixNotes().join(' '); }
  function onPlatforms(c, platforms) {
    return !platforms || platforms.some(function (p) { return String(c.source || '').indexOf(p + ':') === 0; });
  }
  // «٦ طلبات، و٤٠ محادثة» — كل نوع لوحده، الأكبر الأول (زي شريط النتائج). الشراء «طلبات» بنفس كلمة أرقام الملخص فوق
  function resultTexts(map) {
    return Object.keys(map).sort(function (a, b) { return map[b] - map[a]; }).map(function (k) {
      return k === 'purchase' ? DX.ordersText(map[k]) : fmtNum(map[k]) + ' ' + I18N.resultNoun(map[k], k);
    });
  }
  // مجموع بعملات مختلفة: كلها مربوطة بالدولار بسعر رسمي = مبلغ واحد بالعملة المختارة (قرار ٢٥ أكتوبر — DX.pegRate)، وإلا كل عملة
  // لوحدها (جمع جنيه مع دولار من غير سعر رسمي يطلع رقم بلا معنى). صفر بعملة الحساب المعروض
  function moneyByCur(map) {
    var keys = Object.keys(map).filter(function (k) { return map[k] > 0; });
    if (keys.length > 1 && keys.every(function (k) { return k && DX.pegRate(k, 'USD'); })) {
      var to = targetCurrency(map), sum = 0;
      keys.forEach(function (k) { sum += map[k] * DX.pegRate(k, to); });
      return money(sum, to);
    }
    return keys.length ? keys.map(function (k) { return money(map[k], k || null); }).join(' + ') : money(0, defaultCurrency());
  }
  // سطور تحت أرقام الملخص: النهارده لوحده (الأرقام فوق أيام مكتملة — لو الفترة المختارة فيها النهارده)، والنتائج اللي
  // مش مشتريات (محادثات، عملاء محتملين…) اللي الملخص مبيحسبهاش — عشان متختفيش من الصفحة بعد ما شريط «ملخص الأداء» اتشال
  // التكلفة مقابل أقصى تكلفة مقبولة (مراجعة الإعدادات ٢٤ أكتوبر ٢٠٢٦): لكل نوع نتيجة ليه حد في الحساب — أرقام بس من غير حكم (تنبيه
  // «التكلفة أعلى من المقبول» هو اللي بيحكم بدليل). عرض حساب واحد بس (حسابين بحدّين مختلفين في رقم واحد = مقارنة غلط)، ونفس إعلانات
  // المحرك (costAds)، والحملات اللي ليها حد خاص برّه الرقم (بتتقاس بحدها هي). بيظهر كمان في حساب من غير مبيعات — هو أكتر حد محتاجه
  function costVsMax(platforms) {
    dxState.costCmp = null;
    if (!platforms || platforms.length !== 1) return [];
    var source = sourceOf(platforms[0]);
    if (!source) return [];
    // الحساب نفسه في المحرك (diagnosis.js DX.costVsMax) — نفس السطر في رسالة البريد
    var ads = costAds(source).map(function (c) {
      var p = periodOf(c);
      return { resultKey: c.resultKey, campaignId: c.campaignId, currency: c.currency, spend: p.spend, results: p.results };
    });
    var text = DX.costVsMax(ads, PauseProofAlerts.mergeSettings(settingsFor(source)), periodLabel());
    dxState.costCmp = text;   // للنص المنسوخ («انسخ الملخص») — زي رسالة البريد
    return text ? [{ text: text }] : [];
  }
  function storeLines(platforms) {
    var mine = candidates.filter(function (c) { return onPlatforms(c, platforms); }), out = [];
    if (!mine.length) return out;
    // النهارده بيظهر لوحده دايماً (الفترات المتحركة بقت أيام مكتملة بس — ١٠ أكتوبر ٢٠٢٦)، إلا لو الفترة المختارة هي «اليوم»
    if (period.preset !== 'today') {
      var spend = {}, res = {};
      mine.forEach(function (c) {
        var d = c.daily || [], n = d.length - 1;   // آخر يوم في أرقام الإعلان = النهارده بتوقيت حسابه
        if (n < 0) return;
        spend[c.currency || ''] = (spend[c.currency || ''] || 0) + (d[n] || 0);
        var r = (c.dailyResults || [])[n] || 0, k = c.resultKey || 'generic';
        if (r > 0) res[k] = (res[k] || 0) + r;
      });
      out.push({ today: true, text: t('dx.today', { parts: DX.listText([t('dx.todaySpend', { v: moneyByCur(spend) })].concat(resultTexts(res))) }) });
    }
    var pc = platCompare(platforms);
    if (pc) out.push(pc);
    dxState.platCmp = pc ? pc.text : null;   // للنص المنسوخ («انسخ الملخص») — زي رسالة البريد
    var other = {};
    mine.forEach(function (c) {
      var p = periodOf(c), k = c.resultKey || 'generic';
      if (k !== 'purchase' && p.results > 0) other[k] = (other[k] || 0) + p.results;
    });
    var ot = resultTexts(other);
    if (ot.length) out.push({ text: t('dx.otherResults', { p: periodLabel(), list: DX.listText(ot) }) });
    return out;
  }
  // سطر المقارنة برقم المنصة نفسها (مراجعة ١١ أكتوبر ٢٠٢٦): الملخص على «الأقرب للمتجر»، وMeta كانت بتنسب لنفس الحساب ٥١ طلباً
  // بعائد ×٤٫٩ والملخص ٢٣ بعائد ×٢ من غير ولا كلمة — ومسؤول الإعلانات بيقارن بـ Ads Manager على طول. Meta: أرقام الحساب نفسه من
  // طلب الملخص (ppur/prev — مجموع الإعلانات بيزيد طلب لأن Meta بتشيل التكرار بين الإعلانات). غيرها: مجموع رقم المنصة للإعلانات
  function platCompare(platforms) {
    if (!platforms || platforms.length !== 1) return null;
    var p = platforms[0], S = dxState.sources[p], inp = S && S.input;
    if (!inp) return null;
    // Meta: من المحرك نفسه (diagnosis.js DX.platCompare) — نفس السطر في رسالة البريد والنص المنسوخ
    if (p === 'meta') { var mt = DX.platCompare(inp, 'meta'); return mt ? { text: mt } : null; }
    var plat = { pur: 0, rev: 0 }, spend = 0, store = 0;
    (inp.daily || []).forEach(function (r) { if (r.date >= inp.since && r.date <= inp.until) spend += r.spend || 0; });
    var src = candidates.filter(function (c) { return onPlatforms(c, platforms) && c.resultKey === 'purchase'; });
    var ok = src.length > 0 && src.every(function (c) { return !!platOf(c); });
    src.forEach(function (c) { var pp = platOf(c); if (pp) { plat.pur += pp.results || 0; plat.rev += pp.sales || 0; store += periodOf(c).results || 0; } });
    if (!ok || !(Math.round(plat.pur) > Math.round(store))) return null;
    return { text: t('dx.platCmp', { plat: t('dx.plat.' + p), orders: DX.ordersText(Math.round(plat.pur)), sales: money(plat.rev, inp.currency || null),
      roas: spend > 0 ? roasStr(plat.rev / spend) : '—' }) };
  }
  // البلوكات المفتوحة (في القائمة والشرح) بتفضل مفتوحة بعد إعادة الرسم — أي render بيبني القسم من الأول
  var foldOpen = {};
  function foldKey(b) { return b.fbKey || b.kind + ':' + b.title; }
  document.addEventListener('toggle', function (e) {
    var d = e.target;
    if (d && d.hasAttribute && d.hasAttribute('data-fold')) foldOpen[d.getAttribute('data-fold')] = d.open;
  }, true);
  // الشرح والفرص (لماذا، فرصة، متابعة، تفاصيل الحكم…): كل بلوك مش ظاهر في «يحتاج انتباهك الآن»، مطوي بعنوانه
  function renderDxMore(o, shown) {
    var el = document.getElementById('dxMore');
    if (!o) { el.innerHTML = ''; return; }
    el.innerHTML = o.blocks.map(function (b, i) {
      if (shown[i] || i === o.main) return '';
      var key = foldKey(b);
      var kind = DX_KIND_LABEL[b.kind] ? '<span class="dx-kind">' + esc(t(DX_KIND_LABEL[b.kind])) + '</span>' : '';
      return '<details class="dx-fold dx-' + b.kind + '" data-fold="' + esc(key) + '"' + (foldOpen[key] ? ' open' : '') + '><summary>' + kind +
        '<span>' + esc(b.title === o.title ? t('dx.more.verdict') : b.title) + '</span></summary>' + dxBlockHtml(b, i, true) + '</details>';
    }).join('') + (o.notes || []).map(function (n) { return '<p class="dx-notes">' + esc(n) + '</p>'; }).join('');
  }
  // أزرار المنصات بلون كل منصة وشعارها (طلب صاحب المنتج ٢٥ أكتوبر). الشعارات من Simple Icons (CC0 — رموز العلامات نفسها ملك
  // أصحابها، وبتتعرض هنا للتعريف بالمنصة المتصلة بس). نفس الأزرار في ملخص المتجر وفلتر الإعلانات — اختيار واحد (platSel)
  var PLAT_LOGO = {
    meta: 'M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z',
    google: 'M3.9998 22.9291C1.7908 22.9291 0 21.1383 0 18.9293s1.7908-3.9998 3.9998-3.9998 3.9998 1.7908 3.9998 3.9998-1.7908 3.9998-3.9998 3.9998zm19.4643-6.0004L15.4632 3.072C14.3586 1.1587 11.9121.5028 9.9988 1.6074S7.4295 5.1585 8.5341 7.0718l8.0009 13.8567c1.1046 1.9133 3.5511 2.5679 5.4644 1.4646 1.9134-1.1046 2.568-3.5511 1.4647-5.4644zM7.5137 4.8438L1.5645 15.1484A4.5 4.5 0 0 1 4 14.4297c2.5597-.0075 4.6248 2.1585 4.4941 4.7148l3.2168-5.5723-3.6094-6.25c-.4499-.7793-.6322-1.6394-.5878-2.4784z',
    snapchat: 'M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.224-.061.524.12.868l.015.015c.06.136 1.526 3.475 4.791 4.014.255.044.435.27.42.509 0 .075-.015.149-.045.225-.24.569-1.273.988-3.146 1.271-.059.091-.12.375-.164.57-.029.179-.074.36-.134.553-.076.271-.27.405-.555.405h-.03c-.135 0-.313-.031-.538-.074-.36-.075-.765-.135-1.273-.135-.3 0-.599.015-.913.074-.6.104-1.123.464-1.723.884-.853.599-1.826 1.288-3.294 1.288-.06 0-.119-.015-.18-.015h-.149c-1.468 0-2.427-.675-3.279-1.288-.599-.42-1.107-.779-1.707-.884-.314-.045-.629-.074-.928-.074-.54 0-.958.089-1.272.149-.211.043-.391.074-.54.074-.374 0-.523-.224-.583-.42-.061-.192-.09-.389-.135-.567-.046-.181-.105-.494-.166-.57-1.918-.222-2.95-.642-3.189-1.226-.031-.063-.052-.15-.055-.225-.015-.243.165-.465.42-.509 3.264-.54 4.73-3.879 4.791-4.02l.016-.029c.18-.345.224-.645.119-.869-.195-.434-.884-.658-1.332-.809-.121-.029-.24-.074-.346-.119-1.107-.435-1.257-.93-1.197-1.273.09-.479.674-.793 1.168-.793.146 0 .27.029.383.074.42.194.789.3 1.104.3.234 0 .384-.06.465-.105l-.046-.569c-.098-1.626-.225-3.651.307-4.837C7.392 1.077 10.739.807 11.727.807l.419-.015h.06z',
    tiktok: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z'
  };
  function platLogo(p) {
    return PLAT_LOGO[p] ? '<svg class="plat-logo" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + PLAT_LOGO[p] + '"/></svg>' : '';
  }
  // مفيش أزرار لو منصة واحدة بس متصلة. withAcct = اسم الحساب جنب المنصة (الملخص)
  function platChipsHtml(withAcct) {
    var all = connectedPlats();
    if (all.length < 2) return '';
    var chip = function (p, on, label, acct) {
      return '<button type="button" class="chip plat-chip' + (p !== 'all' ? ' plat-' + p : '') + (on ? ' active' : '') + '" data-plat-pick="' + p + '" aria-pressed="' + on + '"' +
        (acct ? ' title="' + esc(acct) + '"' : '') + '>' + platLogo(p) + '<span>' + esc(label) + '</span>' +
        (acct ? '<span class="dx-view-acct" dir="auto">' + esc(acct) + '</span>' : '') + '</button>';
    };
    return chip('all', !platSel, t('dx.view.all'), '') + all.map(function (p) {
      return chip(p, !!platSel && platSel.indexOf(p) > -1, t('dx.plat.' + p), withAcct ? accountLabel(p) : '');
    }).join('');
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-plat-pick]');
    if (!b) return;
    pickPlat(b.getAttribute('data-plat-pick'));
    dxFbOpen = null;
    dxBuild();
    render();   // الملخص وقائمة الإعلانات بنفس الاختيار
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
    var ex = dxExcludedNote();
    if (btn.id === 'dxCopy') dxCopyText(DX.toText(Object.assign({}, o, { platCmp: dxState.platCmp || null, costCmp: dxState.costCmp || null, notes: ex ? (o.notes || []).concat([ex]) : o.notes }), dxState.account), btn);
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
    // Meta مبتديش أرقام أقدم من ٣٧ شهراً (ردها نفسه: «(#3018) The start date of the time range cannot be beyond 37 months from
    // the current date»)، وملخص المتجر بيجيب فترات قبلها بنفس الطول للمقارنة (DX.windows — من ٥ لـ ٩). فترة قريبة من الحد كانت بتفشل
    // كلها («تعذّر…») من غير ما تقول ليه — فبنقدّم البداية لحد ما الفترة واللي قبلها يدخلوا (مراجعة المرحلة ٤، ١٨ أكتوبر ٢٠٢٦)
    var tooOld = false;
    if (activeSources.meta && window.DX && DX.windows) {
      var lim = new Date(today + 'T00:00:00Z');
      lim.setUTCMonth(lim.getUTCMonth() - 37);
      var oldest = shiftKey(lim.toISOString().slice(0, 10), 1);
      var ws = DX.windows(since, until, false), first = ws[ws.length - 1].since;
      if (first < oldest) {
        var len = keyDiffDays(since, until);
        since = shiftKey(since, keyDiffDays(first, oldest)); until = shiftKey(since, len);
        if (until > today) until = today;
        tooOld = true;
      }
    }
    applyPeriod({ preset: 'custom', since: since, until: until });
    if (tooOld) setStatus(msg('period.tooOld', { date: function () { return fmtKey(since); } }));
    else if (trimmed) setStatus(msg('period.trimmed', { n: PERIOD_MAX_DAYS, date: function () { return fmtKey(since); } }));
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
    health: i18nMap({ review: 'health.review', improve: 'health.improve', good: 'health.good', pending: 'health.pending', stopped: 'health.inactive' }),
    format: i18nMap({ video: 'format.video', image: 'format.image', text: 'format.text' })
  };
  function activeFilterList() {
    var out = [];
    ['health', 'format'].forEach(function (k) {
      if (filters[k] === 'all') return;
      var label = (FILTER_LABELS[k] && FILTER_LABELS[k][filters[k]]) || filters[k];
      out.push({ key: k, label: label });
    });
    if (platSel) out.push({ key: 'platform', label: platSel.map(function (p) { return PLATFORM_NAMES[p] || p; }).join(' + ') });
    if (filters.text) out.push({ key: 'text', label: t('filters.searchChip', { q: filters.text }) });
    if (filters.campaign) out.push({ key: 'campaign', label: t('filters.campaignChip', { name: filters.campaignName || t('camp.noName') }) });
    return out;
  }
  function renderFilterState() {
    // فلتر المنصة في صفحة الإعلانات = نفس أزرار ملخص المتجر (اختيار واحد — platSel)، ومن غير صف لو منصة واحدة متصلة
    var pg = document.querySelector('.filter-group[data-filter="platform"]');
    if (pg) {
      var chips = platChipsHtml(false);
      if (pg.innerHTML !== chips) pg.innerHTML = chips;
      if (pg.parentNode) pg.parentNode.hidden = !chips;
    }
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
    else if (key === 'platform') { platSel = null; dxBuild(); }
    else {
      var group = document.querySelector('.filter-group[data-filter="' + key + '"]');
      if (group) setFilterChip(group, 'all'); else filters[key] = 'all';
    }
    render();
  });

  // ---------- شريط الإنفاق والنتائج (جوه ملخص المتجر) ----------
  // بيظهر بس لما أرقام الملخص مش متاحة (الحساب مفيهوش مشتريات، الملخص فشل، ?dx=0) — ساعتها هو أرقام الفترة المختارة
  // (نفس أرقام كروت الإعلانات — core.js periodOf). «معرّض للهدر» و«تحتاج مراجعة» بقوا شارات في «يحتاج انتباهك الآن»
  // platforms = منصات العرض المختار في الملخص (dxViewPlatforms) — زي العنوان اللي فوقه. قبل كده كان بيجمع كل الكروت: تحت شريحة Meta
  // (حساب مفيهوش مشتريات) كان بيكتب «لا تُسجَّل مشتريات» وتحته «١٦ عملية شراء» وإنفاق ٩٠٧ $ من Meta وSnapchat مع بعض
  // (مراجعة المرحلة ٤، حساب حقيقي ١٨ أكتوبر ٢٠٢٦)
  function renderKpis(show, platforms) {
    var strip = document.getElementById('kpiStrip');
    if (!show || !candidates.length) { strip.innerHTML = ''; return; }
    // المجاميع بتتحسب لكل عملة على حدة — جمع ريال مع دولار يطلع رقم بلا معنى
    // والنتائج لكل نوع على حدة: مشتريات + محادثات + سوايب في رقم واحد كان بيطلع رقم ملوش معنى
    var spendByCur = {}, byType = {};
    candidates.forEach(function (c) {
      if (!onPlatforms(c, platforms)) return;
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
    var box = function (label, value, cls, title) {
      return '<div class="kpi' + (cls || '') + '"' + (title ? ' title="' + esc(title) + '"' : '') + '><div class="kpi-label">' + label + '</div><div class="kpi-value">' + value + '</div></div>';
    };
    var wasEmpty = !strip.children.length;
    strip.innerHTML =
      box(t('kpi.spend', { p: periodLabel() }), moneyByCur(spendByCur)) +
      box(t('kpi.results', { p: periodLabel() }), resultsValue, types.length > 1 ? ' kpi-multi' : '', types.length > 1 ? resultsTitle : '');
    if (wasEmpty) Array.prototype.forEach.call(strip.children, function (el, i) { el.style.setProperty('--i', i); el.classList.add('kpi-in'); });
  }
  document.getElementById('kpiStrip').addEventListener('animationend', function (e) { e.target.classList.remove('kpi-in'); });

  // ---------- «يحتاج انتباهك الآن» (جوه ملخص المتجر) ----------
  // بلوكات الملخص اللي محتاجة إجراء + تنبيهات الإعلانات (عاجل ومهم) في قائمة واحدة من غير تكرار (DX.attention) —
  // قبل كده «أهم التنبيهات» كانت قائمة لوحدها، ونفس الحملة كانت بتظهر فيها وفي الملخص. أول ٥، والباقي من البلوكات
  // في الشرح المطوي (renderDxMore) ومن التنبيهات في «جميع التنبيهات». البلوك بيتفتح على تفاصيله والاقتراح، والتنبيهات
  // المرتبطة بيه (إعلانات جوه نفس الحملة)، وزرار يعرض إعلانات الحملة. لو العميل اختار منصة من أزرار العرض، القائمة بتاعتها بس
  var ATTN_MAX = 5;
  var lastTopAlerts = '';
  function renderTopAlerts(o) {
    var el = document.getElementById('topAlerts');
    var shown = fillTopAlerts(el, o);
    if (el.textContent !== lastTopAlerts) {
      lastTopAlerts = el.textContent;
      Array.prototype.forEach.call(el.querySelectorAll(':scope > .top-alert, :scope > .attn-block > .top-alert, .top-alerts-ok'), function (item, i) {
        item.style.setProperty('--i', i); item.classList.add('ta-in');
      });
    }
    return shown;
  }
  // «تنبيه واحد / تنبيهان / ٣ تنبيهات / ١١ تنبيهاً»
  function alertsText(n) {
    if (n === 1) return t('attn.alerts1');
    if (n === 2) return t('attn.alerts2');
    return t(n <= 10 ? 'attn.alertsFew' : 'attn.alertsMany', { n: ar(n) });
  }
  // الأثر بالفلوس على البند من برّه، قبل ما يتفتح (ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦): المبلغ المرتبط بالمشكلة نفسها
  // (alerts.js withMoney / diagnosis.js blk.money) بالأحمر، ولو مفيش: مبيعات الإعلان اللي وقف أو إنفاقه في الأسبوع بلون محايد
  function moneyPill(kind, v, bad) {
    return '<span class="top-alert-money' + (bad ? ' bad' : '') + '"' + (bad ? ' title="' + esc(t('attn.moneyTip.' + kind)) + '"' : '') + '>' +
      esc(t('attn.money.' + kind, { v: v })) + '</span>';
  }
  function alertMoneyHtml(a) {
    var c = a.adId ? findCandidate(a.adId) : null, m = a.money;
    // الهدر بالطلبات لإعلان المشتريات، و«بالنتائج» لغيره (رسائل، عملاء محتملين…)
    var nonBuy = c && c.resultKey !== 'purchase', kind = m && (m.kind === 'waste' && nonBuy ? 'wasteRes' : (m.kind === 'wasteClick' && nonBuy ? 'wasteClickRes' : m.kind));
    if (m && m.v > 0) return moneyPill(kind, money(m.v, a.currency || null), true);
    var sp = a.impact && a.impact.spend;
    if (!(sp > 0)) return '';
    if (a.impact.account) return moneyPill('account', money(sp, a.currency || null), false);
    // وقف إعلان بيبيع: اللي على المحك مبيعاته (أيام مكتملة بس — آخر خانة النهارده)
    var ds = c && c.dailySales, sales = ds && ds.length ? ds.slice(0, -1).reduce(function (s, x) { return s + (x || 0); }, 0) : 0;
    if ((a.code === 'stopped' || a.code === 'top-stopped') && sales > 0) return moneyPill('sales', money(sales, a.currency || null), false);
    return moneyPill('spend', money(sp, a.currency || null), false);
  }
  // اسم الإعلان في التنبيه: لو تنبيه تاني لإعلان مختلف بنفس الاسم (نفس التصميم في أكتر من مجموعة إعلانية) بنضيف اسم مجموعته —
  // «تكلفة مرتفعة» و«فرصة زيادة» على اسم واحد كانوا بيتقروا تناقض (حساب حقيقي ٢٥ أكتوبر: إعلانين بنفس الاسم في مجموعتين)
  function alertAdName(a) {
    var name = a.adName || '';
    var dup = analysis.alerts.some(function (o) { return o !== a && o.adId && o.adId !== a.adId && o.adName === name; });
    var c = dup && a.adId ? findCandidate(a.adId) : null, set = c && (c.adsetName || c.campaignName);
    return set ? t('alert.adInSet', { name: name, set: set }) : name;
  }
  function attnAlertHtml(a) {
    var target = a.adId && findCandidate(a.adId) ? ' data-ad-id="' + esc(a.adId) + '"' : ' data-go-alerts';
    var src = a.adName ? (a.platform || '') + ' · ' + alertAdName(a) : (a.accountName || a.platform || '');
    return '<button type="button" class="top-alert ' + LEVELS[a.level].cls + '"' + target + '>' +
      '<span class="top-alert-level">' + LEVELS[a.level].label + '</span>' +
      '<span class="top-alert-text"><span class="top-alert-title">' + esc(a.title) + '</span>' +
      '<span class="top-alert-src" dir="auto">' + esc(src) + '</span></span>' + alertMoneyHtml(a) + '</button>';
  }
  function attnBlockHtml(it) {
    var b = it.block, key = foldKey(b), rel = it.related, onAd = b.seg && b.seg.dim === 'ad';
    // اللون بأعلى أولوية في البند: «للمتابعة» عليه تنبيه عاجل على إعلان جواه = أحمر
    var lv = LEVELS[it.rank <= 3 ? 'critical' : 'warning'];
    var sub = rel.length ? t(onAd ? 'attn.relatedAd' : 'attn.relatedCamp', { alerts: alertsText(rel.length) }) : t('attn.open');
    var camp = b.seg && b.seg.dim === 'campaign' ? candidates.filter(function (c) { return DX.segHas(b.seg, c); })[0] : null;
    var html = '<details class="attn-block" data-fold="' + esc(key) + '"' + (foldOpen[key] ? ' open' : '') + '>' +
      '<summary class="top-alert ' + lv.cls + '"><span class="top-alert-level">' + esc(t(DX_KIND_LABEL[b.kind])) + '</span>' +
      '<span class="top-alert-text"><span class="top-alert-title">' + esc(b.title) + '</span>' +
      '<span class="top-alert-src">' + esc(sub) + '</span></span>' + (b.money ? moneyPill(b.money.kind, b.money.text, true) : '') + '</summary>' +
      '<div class="attn-body">' + dxBlockHtml(b, it.index, true);
    if (rel.length) html += '<div class="attn-rel"><p>' + esc(t(onAd ? 'attn.relTitleAd' : 'attn.relTitleCamp')) + '</p>' + rel.map(attnAlertHtml).join('') + '</div>';
    if (camp) html += '<div class="attn-camp"><button type="button" class="ghost-btn" data-campaign="' + esc(campaignKey(camp)) + '">' + esc(t('attn.showCamp')) + '</button></div>';
    return html + '</div></details>';
  }
  // بيرجّع أرقام البلوكات اللي ظهرت في القائمة (عشان متتكررش في الشرح المطوي تحتها)
  function fillTopAlerts(el, o) {
    var shown = {};
    if (!candidates.length && !o) { el.innerHTML = ''; renderWastePanel(null, []); return shown; }
    // المنصات المختارة (platSel) — null = كل المنصات
    var pick = dxViewPlatforms();
    var alerts = analysis.alerts.filter(function (a) { return onPlatforms(a, pick); });
    var items = DX.attention(o ? o.blocks : [], alerts, candidates);
    renderWastePanel(pick, alerts);
    // «تحتاج مراجعة»: شارة بتفلتر الإعلانات دي («معرّض للهدر» و«دون طلبات منذ…» بقوا لوحة الهدر فوق — renderWastePanel)
    // بعدد إعلانات المنصة المختارة بس، زي القايمة اللي تحتها — مراجعة المرحلة ٤ (١٨ أكتوبر ٢٠٢٦، حساب حقيقي): تحت شريحة
    // Snapchat كانت «إعلانات تحتاج إلى مراجعة: ٢» والاتنين في Meta. والضغط بيفتح الإعلانات دي بفلتر المنصة نفسها
    var review = candidates.filter(function (c) {
      var a = analysis.byAd[c.id];
      return a && a.health === 'review' && onPlatforms(c, pick);
    }).length;
    var chips = review ? '<button type="button" class="attn-chip" data-kpi="review">' + esc(t('attn.review', { n: ar(review) })) + '</button>' : '';
    var head = '<div class="top-alerts-head"><h3 class="top-alerts-title">' + esc(t('sec.attn')) + '</h3>' + (chips ? '<span class="attn-chips">' + chips + '</span>' : '') + '</div>';
    if (!items.length) {
      // لسه بيتحمّل (القفل اتشال بعد ٣٠ ثانية): منقولش «لا شيء عاجل» قبل ما الأرقام تيجي
      if (pageBusy()) { el.innerHTML = head + '<div class="top-alerts-ok neutral">' + esc(t('attn.wait')) + '</div>'; return shown; }
      // الحكم فوق مش كويس ومفيش حاجة بعينها وراه: منقولش «كله تمام»
      var bad = o && (o.tone === 'bad' || o.tone === 'mixed');
      el.innerHTML = head + '<div class="top-alerts-ok' + (bad ? ' neutral' : '') + '">' + (bad ? '' : '✓ ') + esc(t(bad ? 'attn.noneBad' : 'attn.none')) + '</div>';
      return shown;
    }
    var list = items.slice(0, ATTN_MAX);
    list.forEach(function (it) { if (it.type === 'block') shown[it.index] = true; });
    var all = analysis.alerts.filter(function (a) { return a.level === 'critical' || a.level === 'warning'; }).length;
    el.innerHTML = head + list.map(function (it) { return it.type === 'block' ? attnBlockHtml(it) : attnAlertHtml(it.alert); }).join('') +
      (all ? '<button type="button" class="top-alerts-all" data-go-alerts>' + t('top.all', { n: ar(all) }) + '</button>' : '');
    return shown;
  }
  // ---------- لوحة الهدر (فوق سبب الحكم) ----------
  // ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦: شارتا «معرّض للهدر (آخر يومين)» و«دون طلبات منذ…» مش بارزين ومش بيوضحوا الهدر ولا
  // قيمة الأداة. دلوقتي لوحة: (١) الهدر اللي اكتشفناه في آخر ٧ أيام على إعلانات لسه شغّالة (التنبيهات العاجلة: إنفاق من غير
  // نتائج، أو الإنفاق اللي المبيعات مغطّتهوش) — الإعلان اللي عليه تنبيهين بيتحسب مرة بالأكبر، (٢) اللي بيتصرف بنفس الشكل كل يوم
  // دلوقتي = اللي إيقافها أو تعديلها بيمنعه لو الأداء فضل زي ما هو، (٣) هدر الشهر من Meta (meta.js loadMonthWaste) بما فيه
  // الإعلانات اللي اتوقفت. «وفّرنا» مبنقولهاش: مش عارفين العميل عمل إيه بعد التنبيه. pick = المنصة المختارة في الملخص
  function wasteData(pick, alerts) {
    var byAd = {}, found = {}, daily = {}, n = 0, orders = true;
    alerts.forEach(function (a) {
      if (a.level !== 'critical' || !a.atRisk || !(a.amount > 0) || !a.adId) return;
      var x = byAd[a.adId] || (byAd[a.adId] = { cur: a.currency || '', v: 0, d: 0 });
      x.v = Math.max(x.v, a.amount); x.d = Math.max(x.d, (a.money && a.money.daily) || 0);
      var c = findCandidate(a.adId);
      if (c && c.resultKey !== 'purchase') orders = false;
    });
    Object.keys(byAd).forEach(function (id) {
      var x = byAd[id]; n++;
      found[x.cur] = (found[x.cur] || 0) + x.v; daily[x.cur] = (daily[x.cur] || 0) + x.d;
    });
    // خانة لكل حساب في شريحته، و«كل الحسابات» في الآخر في كل الشرائح (طلب صاحب المنتج ١٨ أكتوبر ٢٠٢٦) لو حسابين أو أكتر فيهم هدر.
    // الحساب اللي مفيش ولا شراء بيوصله في الشهر برّه المجموع: هدره مجهول مش صفر (زي «كل المنصات» — مراجعة المرحلة ٤ ر٦٥)،
    // والعملات كل واحدة لوحدها من غير تحويل (م٦: مفيش رقم بيجمع عملتين)
    // المنصات المختارة بس (platSel — قرار ٢٥ أكتوبر: التفاصيل كلها بتتغيّر بالاختيار)، والمجموع على المختارة لو اتنين أو أكتر
    var all = MONTH_PLATFORMS.map(monthOf).filter(function (m) { return m && m.w.spend > 0 && (!pick || pick.indexOf(m.p) > -1); });
    var months = all;
    var inTotal = all.filter(function (m) { return m.w.purchases > 0; }), total = null;
    if (inTotal.length >= 2) {
      total = { parts: inTotal, byCur: {}, spendCur: {}, ads: 0, since: inTotal[0].w.since,
        out: all.filter(function (m) { return inTotal.indexOf(m) === -1; }).map(function (m) { return m.p; }) };
      inTotal.forEach(function (m) {
        var k = m.w.currency || '';
        total.byCur[k] = (total.byCur[k] || 0) + m.w.spend; total.spendCur[k] = (total.spendCur[k] || 0) + m.w.total; total.ads += m.w.ads;
      });
    }
    return { n: n, found: found, daily: daily, orders: orders, months: months, total: total };
  }
  // هدر الشهر لكل حساب متصل: Meta (meta.js loadMonthWaste) وSnapchat (api/snapchat-ads-fetch.js snapMonthWaste) — Google لسه
  var MONTH_PLATFORMS = ['meta', 'snapchat'];
  function monthOf(p) {
    var w = typeof monthWaste !== 'undefined' && activeSources[p] ? monthWaste[p + ':' + activeSources[p]] : null;
    if (!w) return null;
    var src = p + ':' + activeSources[p], ids = {};
    (w.ids || []).forEach(function (id) { ids[id] = 1; });
    // الشغّالة منها وإنفاقها في الشهر (مراجعة ١١ أكتوبر ٢٠٢٦: «النشط منها ١٤» من غير مبلغ مكانش بيقول قد إيه على المحك — وكانت
    // كلها «عُدّل مؤخراً» فمش ظاهرة كهدر فوق)
    var liveAds = candidates.filter(function (c) { return c.source === src && c.active && ids[String(c.nativeId || c.id)]; });
    var liveSpend = liveAds.reduce(function (s, c) { return s + ((w.spendById || {})[String(c.nativeId || c.id)] || 0); }, 0);
    return { p: p, w: w, live: liveAds.length, liveSpend: liveSpend };
  }
  function pctText(x) { return ar(Math.round(x * 100)) + (isAr() ? '٪' : '%'); }
  function weekByCur(map) { var o = {}; Object.keys(map).forEach(function (k) { o[k] = map[k] * 7; }); return o; }
  function wastePanelHtml(d) {
    var hasDaily = Object.keys(d.daily).some(function (k) { return d.daily[k] > 0; });
    if (!d.n && !d.months.length && !d.total) return '';
    var tile = function (cls, k, v, s) {
      return '<div class="waste-tile' + cls + '"><span class="waste-k">' + esc(k) + '</span><b class="waste-v">' + esc(v) + '</b><span class="waste-s">' + esc(s) + '</span></div>';
    };
    var tiles = '';
    if (d.n) {
      tiles += tile(' bad', t('waste.found.k'), moneyByCur(d.found), t('waste.found.s', { n: ar(d.n) }));
      if (hasDaily) tiles += tile(' bad', t('waste.stop.k'), t('waste.stop.v', { v: moneyByCur(d.daily) }), t('waste.stop.s', { week: moneyByCur(weekByCur(d.daily)) }));
    }
    var several = PLATFORMS.filter(isConnected).length > 1;
    d.months.forEach(function (m) {
      var w = m.w, plat = several ? ' (' + PLATFORM_NAMES[m.p] + ')' : '';
      // ولا شراء من الحساب كله في الشهر (w.purchases): «لم يُسجَّل لها طلب» وراجع التتبّع الأول، مش «لم تحقق أي طلب» — ملخص
      // المتجر فوقها بيقول إن مفيش مشتريات بتوصل أصلاً
      tiles += tile('', t('waste.month.k', { since: fmtKey(w.since) }) + plat, money(w.spend, w.currency),
        t(w.purchases === 0 ? 'waste.month.sNoTrack' : 'waste.month.s', { n: ar(w.ads), pct: pctText(w.total > 0 ? w.spend / w.total : 0), plat: PLATFORM_NAMES[m.p],
          live: m.live ? t('waste.month.live', { n: ar(m.live), v: money(m.liveSpend, w.currency) }) : '' }));
    });
    if (d.total) {
      var T = d.total, curs = Object.keys(T.byCur);
      // عملات مختلفة كلها مربوطة بالدولار: المبلغ والنسبة بعد التحويل بسعر الربط (قرار ٢٥ أكتوبر — moneyByCur)، وإلا كل عملة لوحدها
      var pegged = curs.length > 1 && curs.every(function (c) { return c && DX.pegRate(c, 'USD'); }), to = pegged ? targetCurrency(T.byCur) : null;
      var conv = function (map) { return Object.keys(map).reduce(function (s, c) { return s + map[c] * DX.pegRate(c, to); }, 0); };
      var share = curs.length === 1 && T.spendCur[curs[0]] > 0 ? t('waste.total.share', { pct: pctText(T.byCur[curs[0]] / T.spendCur[curs[0]]) })
        : (pegged ? (conv(T.spendCur) > 0 ? t('waste.total.share', { pct: pctText(conv(T.byCur) / conv(T.spendCur)) }) : '') + t('waste.total.conv', { to: currencyLabel(to) || to })
          : t('waste.total.cur'));
      var parts = DX.listText(T.parts.map(function (m) { return t('waste.total.part', { plat: PLATFORM_NAMES[m.p], v: money(m.w.spend, m.w.currency) }); }));
      tiles += tile(' total', t('waste.total.k', { since: fmtKey(T.since) }), moneyByCur(T.byCur), t('waste.total.s', { parts: parts, share: share, n: ar(T.ads),
        ex: T.out.length ? t('waste.total.ex', { plats: DX.listText(T.out.map(function (p) { return PLATFORM_NAMES[p]; })) }) : '' }));
    }
    var noTrack = !d.total && d.months.length && d.months.every(function (m) { return m.w.purchases === 0; });
    return '<div class="waste-panel' + (d.n ? ' has-risk' : '') + '"><p class="waste-title">' + esc(t(d.n ? 'waste.title' : (noTrack ? 'waste.titleMonthNoTrack' : 'waste.titleMonth'))) + '</p>' +
      '<div class="waste-tiles">' + tiles + '</div>' +
      '<div class="waste-foot">' + (d.n ? '<button type="button" class="waste-cta" data-kpi="risk">' + esc(t('waste.cta')) + '</button>' : '') +
      '<p class="waste-note">' + esc(t(!d.n ? 'waste.noteMonth' : (d.orders ? 'waste.note' : 'waste.noteRes'))) + '</p></div></div>';
  }
  function renderWastePanel(pick, alerts) {
    var el = document.getElementById('dxWaste');
    if (el) el.innerHTML = wastePanelHtml(wasteData(pick, alerts));
  }
  // «تحتاج مراجعة» بيفلتر الإعلانات دي وينزل لها، و«معرّض للهدر» بيفتح التنبيهات اللي وراه
  // plat = المنصة المختارة في الملخص (الشارة جت من شريحتها) — الإعلانات بتتفلتر بيها هي كمان
  // المنصة: اختيار الصفحة نفسه (platSel) — الإعلانات بتتفلتر بيه من غير ما نغيّره
  function kpiAction(kind) {
    if (kind === 'risk') { openAlertsView('risk'); return; }
    var group = document.querySelector('.filter-group[data-filter="health"]');
    if (group) setFilterChip(group, 'review');
    // بنعرض الإعلانات من غير ما نغيّر طريقة العرض المحفوظة — في صفحة «الإعلانات» من أولها
    viewMode = 'ads';
    showView('ads');
    render();
    window.scrollTo({ top: 0 });
  }
  document.getElementById('dxWaste').addEventListener('click', function (e) {
    var el = e.target.closest('[data-kpi]');
    if (el) kpiAction(el.dataset.kpi);
  });
  document.getElementById('topAlerts').addEventListener('click', function (e) {
    var el;
    if ((el = e.target.closest('[data-kpi]'))) { kpiAction(el.dataset.kpi); return; }
    if ((el = e.target.closest('[data-campaign]'))) { openCampaign(el); return; }
    if ((el = e.target.closest('[data-ad-id]'))) { var c = findCandidate(el.getAttribute('data-ad-id')); if (c) openExpand(c); return; }
    if (e.target.closest('[data-go-alerts]')) openAlertsView('urgent');
  });

  document.querySelectorAll('.filter-group').forEach(function (group) {
    if (group.dataset.filter === 'platform') return;   // أزرار المنصات ليها معالجها (data-plat-pick)
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
  // التكرار: آخر ٣٠ يوماً ومنذ الإطلاق (ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦: «آخر ٧ أيام مش مفيد») — بيوصلوا في الخلفية
  // (meta.js loadLifeFrequency)، ولحد ما ييجوا آخر ٧ أيام باسمه. قاعدة تشبّع الجمهور لسه على ٧ أيام ونص التنبيه بيقول فترته
  function freqBox(c) {
    var times = function (f) { return I18N.timesText(f, numAr); };
    var has30 = c.frequency30 != null;
    var life = c.frequencyLife != null ? '<div class="metric-sub">' + esc(t('x.freqLife', { v: times(c.frequencyLife) })) + '</div>' : '';
    return metricBox(t(has30 ? 'x.freq30' : 'x.freq'), times(has30 ? c.frequency30 : c.frequency) + life, mv(c, 'frequency'));
  }

  // ---------- أرقام المنصة مقابل «الأقرب للمتجر» (قرار صاحب المنتج ٦ أكتوبر ٢٠٢٦) ----------
  // كل الأداة (الكروت والتقييم والتنبيهات) مبنية على «الأقرب للمتجر» = اللي نقر على الإعلان واشترى خلال ٧ أيام.
  // الجدول ده جوه تفاصيل الإعلان بس: رقم المنصة، رقمنا، والفرق — والشرح تحته بلغة الفايدة مش بلغة تقنية.
  // lowerIsBetter: التكلفة الزيادة أسوأ، والطلبات والمبيعات والعائد الأقل أسوأ
  function cmpDiff(store, plat, lowerIsBetter) {
    if (store == null || plat == null || !(plat > 0)) return { txt: '—', cls: '' };
    var d = (store - plat) / plat;
    var pct = Math.round(Math.abs(d) * 100);
    if (pct === 0) return { txt: t('cmp.same'), cls: '' };
    var worse = lowerIsBetter ? d > 0 : d < 0;
    return { txt: '<bdi dir="ltr">' + (d > 0 ? '+' : '−') + t('cmp.pct', { n: ar(pct) }) + '</bdi>', cls: worse ? ' cmp-worse' : ' cmp-better' };
  }
  function compareMarkup(c, p, pp, hl, pl) {
    var cur = c.currency;
    var one = esc(t('res1.' + (c.resultKey || 'generic')));
    var row = function (label, platTxt, storeTxt, diff, mark) {
      return '<tr><th scope="row">' + label + '</th><td><span class="mono">' + platTxt + '</span></td>' +
        '<td class="cmp-store' + (mark || '') + '"><span class="mono">' + storeTxt + '</span></td>' +
        '<td class="cmp-diff' + diff.cls + '">' + diff.txt + '</td></tr>';
    };
    var none = { txt: '—', cls: '' };
    var rows =
      row(t('x.spend'), money(p.spend, cur), money(p.spend, cur), none, hl('spend') || hl('delivery')) +
      row(esc(resultLabelOf(c)), pp.results != null ? fmtNum(pp.results) : '—', fmtNum(p.results), cmpDiff(p.results, pp.results), hl('results')) +
      row(t('cmp.cpr', { r: one }), pp.cpr != null ? money(pp.cpr, cur) : '—', p.cpr != null ? money(p.cpr, cur) : '—', cmpDiff(p.cpr, pp.cpr, true), hl('cpr'));
    if (pp.sales > 0 || p.sales > 0) {
      rows += row(t('x.sales'), money(pp.sales, cur), money(p.sales, cur), cmpDiff(p.sales, pp.sales)) +
        row(t('cmp.roas'), roasStr(pp.roas), roasStr(p.roas), cmpDiff(p.roas, pp.roas), hl('roas'));
    }
    return '<div class="attr-compare">' +
      '<div class="attr-title">' + t('cmp.title') + pl + '</div>' +
      '<div class="attr-table-wrap"><table class="attr-table"><thead><tr><th></th><th scope="col">' + t('cmp.platform') + '</th>' +
      '<th scope="col" class="cmp-store">' + t('cmp.store') + '</th><th scope="col">' + t('cmp.diff') + '</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<p class="attr-note">' + esc(compareNote(c, p, pp)) + '</p>' +
      // شرح الجدول بالتفصيل في صفحة الدليل (ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦) — في تاب جديد عشان الإعلانات المحمّلة متضيعش
      '<a class="attr-more" href="/help#compare" target="_blank" rel="noopener">' + esc(t('cmp.more')) + '</a>' +
    '</div>';
  }
  // جملة الشرح تحت الجدول (صيغة صاحب المنتج — i18n cmp.note): اللي يثبت إنه جه من الإعلان الأول، وبعده اللي استبعدناه
  var CMP_HEADS = { purchase: 1, conversion: 1, message: 1 };
  function compareNote(c, p, pp) {
    // المشتريات بتتعدّ بكلمة «طلب» في الجملة دي (عنوانها «الطلبات») — باقي الأنواع باسمها
    var head = c.resultKey || 'generic', key = head === 'purchase' ? 'order' : head, cur = c.currency;
    var gone = Math.max(0, (pp.results || 0) - (p.results || 0));
    var goneSales = Math.max(0, (pp.sales || 0) - (p.sales || 0));
    var val = function (m) { return m > 0 ? t('cmp.noteValue', { m: money(m, cur) }) : ''; };
    // العدد مرفوعاً: «عمليتا شراء» و«تحويل واحد» (countPhrase بيرجّع المنصوب للواحد والاتنين)
    var nom = function (n) {
      var k = (I18N.lang === 'ar' && (n === 1 || n === 2)) ? 'resN' + n + '.' + key : null;
      return k && t(k) !== k ? t(k) : I18N.countPhrase(n, key, ar);
    };
    var gonePhrase = I18N.countPhrase(gone, key, ar);
    // «الأقرب» أكبر من رقم المنصة: Snapchat بس (المرحلة ٤، ١٧ أكتوبر ٢٠٢٦) — رقم المنصة بيوم ظهور الإعلان زي Ads Manager، و«الأقرب»
    // بيوم الطلب (api/snapchat-ads-fetch.js). Meta وGoogle الرقمين عندهم على نفس الأساس، و«الأقرب» مبيعداش رقم المنصة
    if ((p.results || 0) > (pp.results || 0)) {
      return pp.results > 0 ? t('cmp.noteMore', { head: t('cmp.head.' + (CMP_HEADS[head] ? head : 'generic')), kept: nom(p.results), kv: val(p.sales), plat: nom(pp.results) })
        : t('cmp.noteMoreNone', { head: t('cmp.head.' + (CMP_HEADS[head] ? head : 'generic')), kept: nom(p.results), kv: val(p.sales) });
    }
    if (!(pp.results > 0)) return t('cmp.noteNone');
    // العدد نفسه والقيمة مختلفة (Snapchat: طلبات يوم العرض غير طلبات يوم الطلب) — الجملة عن اللي المنصة بتنسبه، فمن غير قيمة
    var sameValue = Math.abs((p.sales || 0) - (pp.sales || 0)) <= Math.max(0.01 * (pp.sales || 0), 0.01);
    if (!gone) return t('cmp.noteSame', { kept: nom(p.results || 0), kv: sameValue ? val(p.sales) : '' });
    if (!(p.results > 0)) return t('cmp.noteZero', { res: I18N.resultAny(key), gone: gonePhrase, gv: val(goneSales) });
    return t('cmp.note', { head: t('cmp.head.' + (CMP_HEADS[head] ? head : 'generic')), kept: nom(p.results), kv: val(p.sales),
      gone: gonePhrase, other: gone >= 3 ? t('cmp.other') : '', gv: val(goneSales) });
  }

  var DEST_LABELS = i18nMap({ whatsapp: 'dest.whatsapp', messenger: 'dest.messenger', website: 'dest.website' });

  function issueMarkup(i) {
    return '<div class="issue-item ' + LEVELS[i.level].cls + '">' +
      '<div class="issue-title"><span class="issue-level">' + LEVELS[i.level].label + '</span>' + esc(i.title) + '</div>' +
      '<div class="issue-detail">' + esc(i.detail) + '</div>' +
      (i.impactText ? '<div class="issue-impact">📊 ' + esc(i.impactText) + '</div>' : '') +
      (i.compare ? '<div class="issue-compare">🔍 ' + esc(i.compare) + '</div>' : '') +
      // لماذا عاجل / لماذا مهم وليس عاجلاً (alerts.js levelWhy — صاحب المنتج ٢٥ أكتوبر)
      (i.levelWhy ? '<div class="issue-why">⚖️ ' + esc(i.levelWhy) + '</div>' : '') +
      '<div class="issue-advice">💡 <strong>' + esc(t('x.suggest')) + '</strong> ' + esc(i.advice) + '</div>' +
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

  var expandSeq = 0, expandShown = null;
  // اللي بيتعرض في التفاصيل: الإعلان كله (أرقامه وتعديلاته وتكراره) وحكمه وملاحظاته — لو اتغيّر (refreshOpenExpand) النافذة
  // بتترسم من جديد. الإعلان نفسه مش كفاية: سجل التعديلات وتكرار الظهور من البداية بيتضافوا على نفس الكارت في الخلفية بعد
  // الأرقام (meta.js loadAdEdits / loadLifeFrequency)، وحكم الإعلان بيتغيّر لما إعلانات الحساب التانية تتغيّر
  function expandSig(c) {
    var a = adAnalysis(c), own;
    try { own = JSON.stringify(c); } catch (e) { own = JSON.stringify([c.daily, c.dailyResults, c.dailySales, c.edits, c.frequency, c.frequencyLife]); }
    return own + JSON.stringify([a.health, a.pending, a.basis, a.issues.map(function (i) { return [i.level, i.title, i.detail, i.advice]; })]);
  }
  // تفاصيل إعلان مفتوحة واللي فيها اتغيّر من وراها (التعديلات وصلت، أو الرجوع للتاب بعد نص ساعة حدّث الأرقام لوحده): نرسمها
  // من جديد في نفس مكان التمرير. قبل كده كانت بتفضل على حالتها القديمة والكارت اللي وراها اتغيّر. مفيش تغيير = منلمسهاش (الفيديو بيكمّل)
  function refreshOpenExpand() {
    if (!expandShown || expandOverlay.classList.contains('hidden')) return;
    var c = findCandidate(expandOverlay.dataset.adId);
    if (!c || expandSig(c) === expandShown.sig) return;
    var card = expandOverlay.querySelector('.expand-card'), top = card.scrollTop;
    openExpand(c);
    card.scrollTop = top;
  }
  function openExpand(c) {
    // رقم الإعلان المفتوح — للرابط (?ad=) وزرار الرجوع في js/route.js
    expandOverlay.dataset.adId = c.id;
    expandShown = { c: c, sig: expandSig(c) };
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
    // الحكم + أساسه («عائده ×٤ والمستهدف ×٣…» أو سبب «لم يُحكم بعد») + الفترة اللي اتبنى عليها
    document.getElementById('expandHealth').innerHTML = '<span class="health-badge ' + h.cls + '"><span class="health-dot-inline"></span>' + h.label + '</span>' +
      (a.editTag ? ' <span class="edit-tag">' + esc(t('x.editTag', { when: a.editTag.when, what: a.editTag.what })) + '</span>' : '') +
      (a.basis ? '<p class="health-basis">' + esc(a.basis) + '</p>' : '') +
      // الإعلان المتعدَّل بيتحكم عليه بالأيام اللي بعد التعديل بس (alerts.js days) — كان مكتوب «آخر ٧ أيام» تحت سطر بيقول «آخر ٣ أيام»
      (c.active ? '<p class="health-period">' + esc(a.days ? t('x.basisPeriodEdit', { n: ar(a.days) + ' ' + noun(a.days, 'n.day') }) : t('x.basisPeriod')) + '</p>' : '');
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
    // النص: النطاق والمسار مقروءين («store.com/products/نظارة-…» بدل %D9%86…) من غير باراميترات التتبّع — الرابط
    // الكامل في الرابط نفسه وفي التلميح
    var landingInner = landingHref
      ? '<a href="' + esc(landingHref) + '" target="_blank" rel="noopener noreferrer" class="expand-landing-value mono" dir="ltr" title="' + esc(c.landing) + '">' + esc(landingText(landingHref)) + '</a>'
      : '<span class="expand-landing-value mono">' + esc(c.landing || '—') + '</span>';
    document.getElementById('expandLanding').innerHTML = '<div class="expand-landing"><span class="expand-landing-label">' + destLabel + '</span>' + landingInner + '</div>';

    var cur = c.currency;
    var hasSales = c.dailySales.some(function (v) { return v > 0; });
    // مربعات الأرقام للفترة المختارة. التلوين بيظهر بس لو الفترة آخر ٧ أيام (نفس فترة التنبيهات)
    var p = periodOf(c);
    var hl = function (metric) { return period.preset === 'last7' ? mv(c, metric) : ''; };
    var pl = ' (' + periodLabel() + ')';
    var resultsLabelTxt = p.results != null ? (t('x.results') + ' — ' + esc(resultLabelOf(c)) + pl) : t('x.results') + pl;
    var pp = platOf(c);
    var boxes;
    if (pp && p.results != null) {
      // Meta وSnapchat وGoogle: الأرقام الأساسية «الأقرب للمتجر» جنب رقم المنصة والفرق — مكان المربعات الخمسة
      boxes = compareMarkup(c, p, pp, hl, pl);
      if (c.frequency != null || c.frequency30 != null) boxes += freqBox(c);
    } else {
      boxes =
        metricBox(t('x.spend') + pl, money(p.spend, cur), hl('spend') || hl('delivery')) +
        metricBox(resultsLabelTxt, p.results != null ? fmtNum(p.results) : t('x.noConversions'), hl('results')) +
        metricBox(t('x.cpr'), p.cpr != null ? money(p.cpr, cur) : '—', hl('cpr')) +
        metricBox(t('x.roas'), roasStr(p.roas), hl('roas'));
      if (c.frequency != null || c.frequency30 != null) boxes += freqBox(c);
      boxes += metricBox(t('x.sales') + pl, p.sales > 0 ? money(p.sales, cur) : t('x.noSales'));
    }
    document.getElementById('expandMetrics').innerHTML = boxes;

    // السلسلة الثانية: مبيعات فعلية لو موجودة، وإلا عدد النتائج (حسب هدف الإعلان نفسه) كبديل مفيد
    var secondSeries = hasSales ? c.dailySales : c.dailyResults;
    var secondRowLabel = hasSales ? (currencyLabel(cur) ? t('x.salesRow', { cur: currencyLabel(cur) }) : t('x.sales')) : (t('x.results') + (c.resultKey ? ' — ' + esc(resultLabelOf(c)) : ''));
    // عمود "أمس" متعلّم — أغلب التنبيهات مبنية عليه، وعمود النهارده يوم لسه مخلصش
    // آخر عمود = النهارده واللي قبله = أمس (النافذة ٨ أيام من ١٠ أكتوبر ٢٠٢٦ — مش أرقام ثابتة)
    var lastCol = c.dailyDates.length - 1;
    var colCls = function (i) { return i === lastCol - 1 ? ' class="col-yesterday"' : (i === lastCol ? ' class="col-today"' : ''); };
    // الأيام المكتملة، وبعدها «الإجمالي» (bold)، وبعده النهارده منفصل (ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦: اليوم مش مجموع
    // مع الأيام، والإجمالي في آخر الجدول)
    var days = c.dailyDates.slice(0, lastCol);
    var sumOf = function (arr) { return arr.slice(0, lastCol).reduce(function (a, b) { return a + (b || 0); }, 0); };
    var headerCells = days.map(function (dt, i) { return '<th' + colCls(i) + '>' + (i === lastCol - 1 ? t('x.yesterday') : fmtKey(dt)) + '</th>'; }).join('') +
      '<th class="col-total">' + t('x.totalDays', { n: ar(days.length) }) + '</th><th class="col-today">' + t('x.today') + '</th>';
    // الجدول: فاصل الآلاف (١٢٬٥٠٠)، والصرف والمبيعات الصغيرة بخانة عشرية (٠٫٤ مش ٠)
    var rowCells = function (arr, small) {
      return arr.slice(0, lastCol).map(function (v, i) { return '<td' + colCls(i) + '><span class="mono">' + fmtNum(v, small) + '</span></td>'; }).join('') +
        '<td class="col-total"><span class="mono">' + fmtNum(sumOf(arr), small) + '</span></td>' +
        '<td class="col-today"><span class="mono">' + fmtNum(arr[lastCol] || 0, small) + '</span></td>';
    };
    document.getElementById('expandChart').innerHTML =
      '<div class="daily-table-wrap"><table class="daily-table"><thead><tr><th></th>' + headerCells + '</tr></thead>' +
      '<tbody><tr><td>' + (currencyLabel(cur) ? t('x.spendRow', { cur: currencyLabel(cur) }) : t('x.spend')) + '</td>' + rowCells(c.daily, true) + '</tr>' +
      '<tr><td>' + secondRowLabel + '</td>' + rowCells(secondSeries, hasSales) + '</tr></tbody></table></div>';

    expandOverlay.classList.remove('hidden');
    expandOverlay.querySelector('.expand-card').scrollTop = 0;
    // الهاتف: الجدول أعرض من الشاشة وأهم أعمدته في الآخر (أمس والإجمالي واليوم) — نفتحه عليها، والأيام الأقدم بالتمرير.
    // بعد ما النافذة تظهر (وهي مخفية العرض = صفر). بالعربي الآخر = scrollLeft بالسالب (المتصفح بيقصّ القيمة على الحد)
    var wrapEl = document.querySelector('#expandChart .daily-table-wrap');
    if (wrapEl.scrollWidth > wrapEl.clientWidth) wrapEl.scrollLeft = (getComputedStyle(wrapEl).direction === 'rtl' ? -1 : 1) * wrapEl.scrollWidth;

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

  function landingText(u) {
    try {
      var p = new URL(u), path = p.pathname.replace(/\/+$/, '');
      try { path = decodeURIComponent(path); } catch (e) { /* مسار فيه % غلط: بيفضل زي ما هو */ }
      return p.hostname.replace(/^www\./, '') + path;
    } catch (e) { return u; }
  }

  // معاينة Meta بصيغها (ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦: «عرض كل الكريتيفز بشكل صحيح وبمقاس مناسب ومحاولة عرض متغيرات
  // الـ Catalog»): الفيديو والكتالوج بمعاينة Meta الرسمية بأزرار للصيغ — إنستغرام الأول لو الإعلان ليه حساب إنستغرام (معاينة
  // فيسبوك بتقول «No permission to access this profile» لو صفحة فيسبوك مقيّدة، ومنقدرش نعرف ده من برّه الإطار — حساب حقيقي).
  // الكتالوج: Meta بتختار منتجات من الكتالوج في المعاينة (كاروسيل = أكتر من منتج). الصور العادية بالملف الأصلي زي ما هي
  var PREVIEW_FORMATS = { ig: 'INSTAGRAM_STANDARD', reels: 'INSTAGRAM_REELS', fb: 'MOBILE_FEED_STANDARD' };
  // مقاس الطلب (width/height في توثيق previews = مقاس الصندوق اللي Meta بترسم الإعلان جوّاه). فحص حي ٢٥ أكتوبر بعد «لازال مقاس عرض
  // الفيديوهات في ميتا لم يتعالج»: الريلز من غير مقاس بترجع ٢٧٤×٢١٣ ومبتتعرضش، وبـ ٣٢٠×٦٤٠ الفيديو بيملأ الصندوق لآخره (فيديوهين
  // طوليين). إنستغرام العادية بطاقة ارتفاعها ثابت وجوّاها فراغ بعد نص الإعلان من صفحة Meta نفسها — أي مقاس مبيشيلوش، فالفيديو
  // بيبدأ بالريلز (showMedia)
  var PREVIEW_REQUEST = { reels: { width: 320, height: 640 } };
  // المقاس الثابت القديم — بيستخدم بس لو مقاس Meta مش معقول (metaPreviewSize)، وبيتصغّر بنفس النسبة على الشاشة الضيقة (fitEmbeds)
  var PREVIEW_SIZES = { ig: { w: 360, h: 760 }, reels: { w: 360, h: 720 }, fb: { w: 380, h: 720 } };
  // مقاس Meta نفسها للصيغة (طلب صاحب المنتج ٢٥ أكتوبر: «فيديوهات ميتا تظهر بمساحة إضافية فارغة داخل الكارت»). فحص حي: صفحة المعاينة
  // بترسم الإعلان في صندوق بمقاس Meta بالظبط وبتمرير جوّاه (٣٢٠×٥٢٥ لإنستغرام، و٣٣٥×٤٥٠ لفيسبوك) — الإطار الأكبر مكانش بيعرض محتوى
  // زيادة، كان بيضيف فراغ تحت الصندوق. ارتفاع أقل من ٣٠٠ (ريلز رجّعت ٢٧٤×٢١٣) = المقاس الثابت القديم
  function metaPreviewSize(html, k) {
    try {
      var f = new DOMParser().parseFromString(String(html || ''), 'text/html').querySelector('iframe');
      var w = f && parseInt(f.getAttribute('width'), 10), h = f && parseInt(f.getAttribute('height'), 10);
      if (w >= 200 && w <= 1000 && h >= 300 && h <= 2000) return { w: w, h: h };
    } catch (e) { /* المقاس الثابت */ }
    return PREVIEW_SIZES[k];
  }
  var previewCache = {}, previewSeq = 0;
  function previewTabsHtml(order, cur) {
    return '<div class="pv-tabs" role="tablist">' + order.map(function (k) {
      return '<button type="button" role="tab" class="pv-tab' + (k === cur ? ' on' : '') + '" aria-selected="' + (k === cur) + '" data-pv="' + k + '">' + esc(t('x.pv.' + k)) + '</button>';
    }).join('') + '</div>';
  }
  function showMedia(c) {
    var openSeq = ++expandSeq;
    var el = document.getElementById('expandPreview');
    el.innerHTML = previewMarkup(c);
    el.onclick = null;
    if (c.platform === 'Snapchat' && (c.videoSrc || c.snapCreativeId)) { snapMediaView(c, el, openSeq); return; }
    if (c.platform !== 'Meta' || !(c.videoId || c.catalog)) return;
    // الفيديو بحساب إنستغرام: الريلز الأول (الفيديو بطوله من غير فراغ — PREVIEW_REQUEST)
    var order = c.igPreview ? (c.videoId ? ['reels', 'ig', 'fb'] : ['ig', 'reels', 'fb']) : ['fb', 'ig', 'reels'], poster = el.innerHTML;
    var hint = '<p class="pv-hint">' + esc(t('x.pv.hint') + (c.catalog ? ' ' + t('x.pv.catalog') : '')) + '</p>';
    var load = function (k, first) {
      var mine = ++previewSeq, key = c.id + '|' + k;
      el.innerHTML = previewTabsHtml(order, k) + '<div class="pv-body">' + poster + '</div>' + hint;
      var body = el.querySelector('.pv-body');
      var show = function (frame) { body.innerHTML = '<div class="video-embed-wrap">' + frame + '</div>'; fitEmbeds(body); };
      if (previewCache[key]) { show(previewCache[key]); return; }
      var params = { ad_format: PREVIEW_FORMATS[k] }, size = PREVIEW_REQUEST[k];
      if (size) { params.width = size.width; params.height = size.height; }
      metaApi('/' + c.id + '/previews', params, function (resp) {
        if (openSeq !== expandSeq || mine !== previewSeq) return;
        var frame = resp && resp.data && resp.data[0] && metaIframeHtml(resp.data[0].body, metaPreviewSize(resp.data[0].body, k));
        if (frame) { previewCache[key] = frame; show(frame); return; }
        if (!first) return;
        // أول ما الإعلان يتفتح: الصيغة اللي بعدها، ولو كلهم فشلوا في فيديو: بيانات الفيديو مباشرة زي الأول
        var next = order[order.indexOf(k) + 1];
        if (next) load(next, true);
        else if (c.videoId) videoFallback(c, body, openSeq);
      });
    };
    var tabs = function () {
      el.onclick = function (e) { var b = e.target.closest('[data-pv]'); if (b && !b.classList.contains('on')) load(b.getAttribute('data-pv'), false); };
      load(order[0], true);
    };
    // الكتالوج: معاينة Meta بتقول «Preview Not Available» بكل الصيغ في إعلانات الكتالوج (حساب حقيقي ١٠ أكتوبر ٢٠٢٦)، فبنعرض
    // منتجات الكتالوج نفسه (الصورة والاسم والسعر ورابط المنتج). لو الطلب فشل: أزرار معاينة Meta
    if (c.productSetId) catalogGrid(c, el, openSeq, tabs); else tabs();
  }
  // Snapchat في التفاصيل (طلب صاحب المنتج ٢٥ أكتوبر: «فيديوهات سناب شات لا تشتغل تلقائياً عند فتح الكارت، وبعضها لا يعمل»، و«لا توجد
  // صورة Preview من داخل الكارت»):
  // - الفيديو بيشتغل أول ما الكارت يتفتح (بالصوت لو المتصفح سمح بعد الضغطة، وإلا من غير صوت) وغلافه صورة الفيديو (loadSnapchatThumbs).
  //   قبل كده preload="none" ومن غير تشغيل لأن الملف كبير (٤٣ ميجا لفيديو ٢٣ ثانية) — المتصفح بيشغّل وهو بيحمّل
  // - الملف الأصلي مشتغلش (حساب حقيقي ١١ أكتوبر: ٤ من ١٣ فيديو HEVC من الآيفون): معاينة الوسيط من Snapchat (Get Media Preview)،
  //   ولو فشلت كمان: السبب وتنزيل الملف
  // - زرار «شاهد الإعلان كما يظهر على سناب شات» (Creative Preview — صفحة Snapchat نفسها، من غير دخول) لكل إعلان، وده المعاينة الوحيدة
  //   لإعلانات الكتالوج اللي ملهاش وسيط. الصفحة مبتتضمّنش هنا (X-Frame-Options: SAMEORIGIN)، فبتتفتح في تبويب جديد
  function snapMediaView(c, el, openSeq) {
    var vsrc = c.videoSrc && safeUrl(c.videoSrc), poster = safeUrl(c.thumbUrl);
    var info = { video: null, page: null }, asked = null;
    var ask = function () {
      if (asked) return asked;
      asked = apiPost('/api/snapchat-ads-fetch', { accessToken: snapchatAccessToken, action: 'preview', mediaId: c.snapMediaId || null, creativeId: c.snapCreativeId || null })
        .then(function (res) { if (res.ok && res.data) { info.video = safeUrl(res.data.video); info.page = safeUrl(res.data.page); } }, function () { /* من غير معاينة */ });
      return asked;
    };
    var pageBtn = function () {
      var box = el.querySelector('.snap-page');
      if (box && info.page) box.innerHTML = '<a class="open-platform" href="' + esc(info.page) + '" target="_blank" rel="noopener noreferrer">' + esc(t('x.pv.snapPage')) + ' ↗</a>';
    };
    var failed = function () {
      el.innerHTML = '<div class="snap-video-failed"><p>' + esc(t('x.pv.snapVideoFailed')) + '</p>' +
        (vsrc ? '<a class="open-platform" href="' + esc(vsrc) + '" target="_blank" rel="noopener noreferrer">' + esc(t('x.pv.snapVideoFile')) + ' ↗</a>' : '') + '</div><div class="snap-page"></div>';
      pageBtn();
    };
    if (!vsrc && c.snapProductSetId) {
      // الكتالوج: منتجات المجموعة (snapchat.js loadSnapchatCatalog)، ومن غير زرار المعاينة لو ديناميكي (Snapchat بيقول «Preview Not
      // Supported» — اتجرّب ٢٥ أكتوبر)
      var showItems = function (items) {
        if (openSeq !== expandSeq) return;
        if (!items || !items.length) return;
        el.innerHTML = catalogGridHtml(items.map(function (p) {
          return { image: p.image, name: p.name, price: p.price && p.price.value > 0 ? money(p.price.value, p.price.currency || c.currency) : '', url: p.url };
        }), t('dx.plat.snapchat')) + '<div class="snap-page"></div>';
        if (!c.snapDynamic && c.snapCreativeId) ask().then(function () { if (openSeq === expandSeq) pageBtn(); });
      };
      el.innerHTML = previewMarkup(c) + '<div class="snap-page"></div>';
      if (typeof snapProducts !== 'undefined' && snapProducts[c.snapProductSetId]) showItems(snapProducts[c.snapProductSetId]);
      else apiPost('/api/snapchat-ads-fetch', { accessToken: snapchatAccessToken, action: 'products', productSetId: c.snapProductSetId }).then(function (res) {
        var list = res.ok && res.data && Array.isArray(res.data.products) ? res.data.products : [];
        if (typeof snapProducts !== 'undefined') snapProducts[c.snapProductSetId] = list;
        showItems(list);
      }, function () { /* المعاينة زي ما هي */ });
      return;
    }
    if (!vsrc) {
      // صورة: اللي بيظهر زي ما هو (previewMarkup)، وتحته زرار معاينة الإعلان
      el.innerHTML = previewMarkup(c) + '<div class="snap-page"></div>';
      if (c.snapCreativeId && !c.snapDynamic) ask().then(function () { if (openSeq === expandSeq) pageBtn(); });
      return;
    }
    el.innerHTML = '<div class="snap-video-wrap"><video class="real-video" controls playsinline preload="auto"' + (poster ? ' poster="' + esc(poster) + '"' : '') + '></video></div>' +
      '<p class="pv-hint">' + esc(t('x.pv.snapVideo')) + '</p><div class="snap-page"></div>';
    var v = el.querySelector('video'), usedPreview = false;
    var play = function () {
      var p = v.play();
      // بالصوت لو المتصفح سمح (الكارت اتفتح بضغطة)، وإلا من غير صوت — الصوت من أزرار المشغّل
      if (p && p.catch) p.catch(function () { v.muted = true; var q = v.play(); if (q && q.catch) q.catch(function () { /* المشغّل بأزراره */ }); });
    };
    v.addEventListener('error', function () {
      if (openSeq !== expandSeq) return;
      if (usedPreview) { failed(); return; }
      usedPreview = true;
      ask().then(function () {
        if (openSeq !== expandSeq) return;
        if (!info.video || info.video === vsrc) { failed(); return; }
        v.src = info.video;
        play();
      });
    });
    v.src = vsrc;
    play();
    if (c.snapCreativeId && !c.snapDynamic) ask().then(function () { if (openSeq === expandSeq) pageBtn(); });
  }
  var CATALOG_MAX = 8;
  // «SAR329.00» → ٣٢٩ ر.س — وأي شكل تاني بيتعرض زي ما هو
  function catalogPrice(p) {
    var m = /^([A-Z]{3})\s?([\d,]+(?:\.\d+)?)$/.exec(String(p || '').trim());
    return m ? money(parseFloat(m[2].replace(/,/g, '')), m[1]) : String(p || '');
  }
  // شبكة منتجات الكتالوج (Meta: catalogGrid، وSnapchat: snapMediaView) — items = [{ image, name, price (نص جاهز), url }]
  // platform = اسم المنصة اللي بتختار المنتجات في الملاحظة (فحص حي ٢٥ أكتوبر: إعلان سناب شات كان مكتوب تحته «تختار Meta»)
  function catalogGridHtml(items, platform) {
    return '<p class="cat-title">' + esc(t('x.cat.title')) + '</p><div class="cat-grid">' + items.map(function (p) {
      var img = safeUrl(p.image), href = safeUrl(p.url);
      var inner = (img ? '<img class="cat-img" src="' + esc(img) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<span class="cat-img"></span>') +
        '<span class="cat-name" dir="auto">' + esc(p.name || '') + '</span>' + (p.price ? '<span class="cat-price">' + esc(p.price) + '</span>' : '');
      return href ? '<a class="cat-item" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + inner + '</a>' : '<div class="cat-item">' + inner + '</div>';
    }).join('') + '</div><p class="pv-hint">' + esc(t('x.cat.note', { n: ar(items.length), platform: platform })) + '</p>';
  }
  function catalogGrid(c, el, openSeq, onFail) {
    metaApi('/' + c.productSetId + '/products', { fields: 'id,name,image_url,price,url', limit: CATALOG_MAX }, function (resp) {
      if (openSeq !== expandSeq) return;
      var items = (resp && !resp.error && resp.data) || [];
      if (!items.length) { onFail(); return; }
      el.innerHTML = catalogGridHtml(items.map(function (p) { return { image: p.image_url, name: p.name, price: p.price ? catalogPrice(p.price) : '', url: p.url }; }), t('dx.plat.meta'));
    });
  }
  function videoFallback(c, el, openSeq) {
    // تضمين رسمي، ثم ملف مباشر، ثم رابط خارجي — محتاجة صلاحية على صفحة الفيديو (من غيرها: «Application does not have permission»)
    metaApi('/' + c.videoId, { fields: 'embed_html,source,permalink_url,picture' }, function (vidResp) {
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
  }

  // النافذة بتتقفل بالكلاس hidden بس (display:none)، والفيديو أو معاينة Meta جوّاها كان بيكمّل يشتغل بصوته في الخلفية (اتجرّب
  // على حساب حقيقي ١١ أكتوبر ٢٠٢٦). القفل بيفضّي المعاينة — openExpand بيبنيها من جديد كل فتح — ويلغي أي طلب معاينة لسه راجع.
  // بنراقب الكلاس نفسه زي التركيز تحت، فبيشتغل مع كل طرق القفل (الزرار، برّه النافذة، Esc)
  if (window.MutationObserver) new MutationObserver(function () {
    var pv = document.getElementById('expandPreview');
    if (!expandOverlay.classList.contains('hidden') || !pv.firstChild) return;
    expandSeq++;
    pv.innerHTML = '';
  }).observe(expandOverlay, { attributes: true, attributeFilter: ['class'] });
  expandClose.addEventListener('click', function () { expandOverlay.classList.add('hidden'); });
  expandOverlay.addEventListener('click', function (e) { if (e.target === expandOverlay) expandOverlay.classList.add('hidden'); });
  function closeOverlays() {
    expandOverlay.classList.add('hidden');
    settingsOverlay.classList.add('hidden');
    platformOverlay.classList.add('hidden');
    installOverlay.classList.add('hidden');
    if (welcomeOverlay && !welcomeOverlay.classList.contains('hidden')) closeWelcome(); // Esc = القيم المقترحة
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

  // ---------- أقسام الأداة: الملخص / الإعلانات / التنبيهات / الإعدادات ----------
  // (مراجعة المرحلة ١، ١١ أكتوبر ٢٠٢٦) قبل كده تبويبين بس، و«الإعلانات» كان فيه الملخص والإعلانات في صفحة طولها ٨٫٩ شاشات
  // (١٧٫٢ على الهاتف). دلوقتي كل قسم صفحة لوحدها من القائمة الجانبية أو الشريط السفلي (#appNav)، وليها رابط (?view= — js/route.js).
  // التنقل بين صفحات = nav وaria-current (مش tablist — دي لتبويبات جوه نفس الصفحة)
  var VIEWS = ['summary', 'ads', 'alerts', 'settings'];
  var currentView = 'summary';
  var navItems = document.querySelectorAll('#appNav .nav-item');
  function showView(view) {
    if (VIEWS.indexOf(view) === -1) view = 'summary';
    currentView = view;
    navItems.forEach(function (n) {
      var on = n.dataset.view === view;
      n.classList.toggle('active', on);
      if (on) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current');
    });
    // الملخص والإعلانات بيشتركوا في شاشة البداية وكروت الحالة وفترة البيانات
    document.getElementById('dataViews').classList.toggle('hidden', view !== 'summary' && view !== 'ads');
    document.getElementById('viewSummary').classList.toggle('hidden', view !== 'summary');
    document.getElementById('viewAds').classList.toggle('hidden', view !== 'ads');
    document.getElementById('viewAlerts').classList.toggle('hidden', view !== 'alerts');
    document.getElementById('viewSettings').classList.toggle('hidden', view !== 'settings');
    // بطاقة الملخص التلقائي بتجيب حالتها من السيرفر أول ما الصفحة تتفتح (مش مع كل فتح للأداة)
    if (view === 'settings') renderDigest();
  }
  // فتح صفحة جديدة من القائمة = أول الصفحة. التنبيهات بترجع للعرض العادي (العاجل + المهم) حتى لو كانت متفلترة قبل كده
  function goView(view) {
    if (view === 'alerts') { openAlertsView('urgent'); return; }
    showView(view);
    window.scrollTo({ top: 0 });
  }
  document.getElementById('appNav').addEventListener('click', function (e) {
    var item = e.target.closest('.nav-item');
    if (item) goView(item.dataset.view);
  });
  // الاسم فوق = الملخص (الرئيسية جوه الأداة) من غير ما الصفحة تتحمّل من جديد
  document.getElementById('brandLink').addEventListener('click', function (e) {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button > 0) return; // فتح في تاب جديد بيفضل شغّال
    e.preventDefault();
    goView('summary');
  });
  // ارتفاع الشريط العلوي للقائمة الجانبية (بتبدأ تحته) — بيتغيّر مع اللغة والعرض
  function syncAppbarHeight() { if (appbarEl) document.documentElement.style.setProperty('--appbar-h', appbarEl.offsetHeight + 'px'); }
  syncAppbarHeight();
  if (window.ResizeObserver && appbarEl) new ResizeObserver(syncAppbarHeight).observe(appbarEl);
  else window.addEventListener('resize', syncAppbarHeight);


  // ---------- صفحة التنبيهات ----------
  // الافتراضي "urgent" = العاجل والمهم مع بعض — دول اللي محتاجين قرار. الفرص في قسم لوحدها
  var alertsLevelFilter = 'urgent';
  var alertsSummaryEl = document.getElementById('alertsSummary');
  var alertsListEl = document.getElementById('alertsList');
  var alertsTabCount = document.getElementById('alertsTabCount');

  function alertMarkup(a, i) {
    var clickable = a.adId && findCandidate(a.adId);
    // اسم الحساب فيه اسم المنصة أصلاً (مثال: "Meta — متجري")، فمنكررهاش
    var source = a.adName ? esc(a.platform || '') + ' · ' + esc(alertAdName(a)) : esc(a.accountName || a.platform || '');
    return '<article class="alert-item ' + LEVELS[a.level].cls + (clickable ? ' clickable' : '') + '" style="--i:' + Math.min(i || 0, 10) + '"' +
        (clickable ? ' data-ad-id="' + esc(a.adId) + '" tabindex="0" role="button"' : '') + '>' +
      '<div class="alert-head"><span class="alert-level">' + LEVELS[a.level].label + '</span><span class="alert-source" dir="auto">' + source + '</span></div>' +
      '<div class="alert-title">' + esc(a.title) + '</div>' +
      '<p class="alert-detail">' + esc(a.detail) + '</p>' +
      (a.impactText ? '<p class="alert-impact">📊 ' + esc(a.impactText) + '</p>' : '') +
      (a.compare ? '<p class="alert-compare">🔍 ' + esc(a.compare) + '</p>' : '') +
      (a.levelWhy ? '<p class="alert-why">⚖️ ' + esc(a.levelWhy) + '</p>' : '') +
      '<p class="alert-advice">💡 <strong>' + esc(t('x.suggest')) + '</strong> ' + esc(a.advice) + '</p>' +
    '</article>';
  }

  function renderAlerts() {
    var s = analysis.summary;
    // الرقم على التبويب = العاجل بس — الحاجة اللي محتاجة تدخّل النهارده
    alertsTabCount.textContent = s.levels.critical ? ar(s.levels.critical) : '';
    alertsTabCount.classList.toggle('has-critical', s.levels.critical > 0);
    // «عاجل» جنب الرقم (قرار ق٤ في المراجعة): الرقم ده العاجل بس، و«جميع التنبيهات (٣)» في الملخص = العاجل والمهم —
    // من غير الكلمة كانوا رقمين مختلفين لنفس الاسم. وقارئ الشاشة بيسمع الجملة كاملة
    document.getElementById('alertsTabWord').hidden = !s.levels.critical;
    document.getElementById('tabAlerts').setAttribute('aria-label', s.levels.critical
      ? t('nav.alertsUrgent', { n: ar(s.levels.critical) }) : t('nav.alerts'));

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
  // الشاشة الأساسية بلغة صاحب المتجر: سؤالين عن الفلوس (كم تبيع مقابل كل ١ بتصرفه، وتحت أي قيمة بتخسر). باقي الحدود تحت «إعدادات
  // متقدمة لمسؤول الإعلانات» — قرار صاحب المنتج ٣ أكتوبر ٢٠٢٦. من مراجعة الإعدادات (٢٤ أكتوبر): من غير أنماط (هادئ/متوازن/صارم) ولا
  // «استعادة القيم الافتراضية» (قرار صاحب المنتج)، والمستهدف وحد الخسارة فاضيين لحد ما العميل يحددهم.
  // نفس الجزء الأساسي بيظهر في نافذة أول مرة (welcomeOverlay تحت)
  var settingsOverlay = document.getElementById('settingsOverlay');
  var settingsForm = document.getElementById('settingsForm');
  var SETTING_UNITS = i18nMap({ multiple: 'unit.multiple', ratio: 'unit.ratio', days: 'unit.days', times: 'unit.times', count: 'unit.count' });
  var MAIN_SETTINGS = { roasTarget: true, roasBreakEven: true };
  var MAIN_ORDER = ['roasTarget', 'roasBreakEven'];

  // copyKey = نص الشاشة الأساسية بلغة صاحب المتجر (goal.*) بدل اسم الحد الفني (set.*) اللي في «المتقدمة»
  // value = null (المستهدف أو حد الخسارة لسه مش محددين) = خانة فاضية
  function settingRow(m, value, copyKey) {
    var shown = value == null ? '' : (m.kind === 'ratio' ? Math.round(value * 100) : value);
    var step = m.kind === 'multiple' ? '0.1' : '1';
    var label = copyKey ? t(copyKey) : m.label, help = copyKey ? t(copyKey + '.help') : m.help;
    // نص مش number: خانة الأرقام بتعتبر «٢٫٥» أو «2,5» قيمة فاضية، فكانت بتتشال في صمت وترجع للافتراضي
    return '<label class="setting-row"><span class="setting-text"><span class="setting-label">' + esc(label) + '</span><span class="setting-help">' + esc(help) + '</span></span>' +
      '<span class="setting-input"><input type="text" inputmode="decimal" dir="ltr" autocomplete="off" spellcheck="false" data-step="' + step + '" name="' + m.key + '" value="' + shown + '"><span class="setting-unit">' + SETTING_UNITS[m.kind] + '</span></span></label>';
  }
  // أهداف المتجر (المستهدف وحد الخسارة)
  function settingsCoreHtml(current) {
    var byKey = {};
    PauseProofAlerts.SETTINGS_META.forEach(function (m) { byKey[m.key] = m; });
    return '<fieldset class="settings-group"><legend>' + t('settings.goals') + '</legend>' +
      MAIN_ORDER.map(function (k) { return settingRow(byKey[k], current[k], 'goal.' + k); }).join('') +
      '</fieldset>';
  }

  // الحساب اللي النافذة بتعدّل إعداداته (كل حساب إعلاني ليه إعداداته — مراجعة الإعدادات ٢٤ أكتوبر). الافتراضي: منصة الفلتر لو
  // مختارة، وإلا أول حساب متصل
  var settingsSrc = null, settingsFormState = 'none', settingsSaving = false;
  var settingsSaveBtn = document.getElementById('settingsSave');
  function settingsSources() { return PLATFORMS.map(sourceOf).filter(Boolean); }
  function sourceLabel(source) {
    var p = platformOfSource(source), name = activeSources[p] && sourceOf(p) === source ? accountLabel(p) : '';
    return PLATFORM_NAMES[p] + (name ? ' — ' + name : '');
  }
  function pickSettingsSource() {
    var list = settingsSources();
    if (settingsSrc && list.indexOf(settingsSrc) > -1) return settingsSrc;
    var byFilter = platSel && platSel.length === 1 ? sourceOf(platSel[0]) : null;
    return byFilter || list[0] || null;
  }
  // الحالة: none (مفيش حساب متصل) / loading (سجل الحساب لسه جاي) / error (معرفناش نجيبه) / ready
  function settingsStateOf(source) {
    if (!source) return 'none';
    if (!serverSettingsOn(source) || settingsKnown(source)) return 'ready';
    return acctPulling[source] ? 'loading' : 'error';
  }
  function settingsAccountHtml(source) {
    var list = settingsSources();
    var p = platformOfSource(source);
    var where = t(!serverSettingsOn(source) ? 'settings.where.device' : p === 'meta' ? 'settings.where.serverMeta' : 'settings.where.server', { platform: PLATFORM_NAMES[p] });
    var pick = list.length > 1
      ? '<label class="setting-row"><span class="setting-text"><span class="setting-label">' + esc(t('settings.account')) + '</span></span>' +
        '<span class="setting-input"><select id="settingsAccount">' + list.map(function (s) {
          return '<option value="' + esc(s) + '"' + (s === source ? ' selected' : '') + '>' + esc(sourceLabel(s)) + '</option>';
        }).join('') + '</select></span></label>'
      : '<p class="settings-account-name">' + esc(t('settings.accountOne', { account: sourceLabel(source) })) + '</p>';
    return '<div class="settings-account">' + pick + '<p class="settings-where">' + esc(where) + '</p></div>';
  }

  // ---------- أقصى تكلفة مقبولة لكل نتيجة (مراجعة الإعدادات ٢٤ أكتوبر ٢٠٢٦ — قرار صاحب المنتج) ----------
  // لكل إعلان نتايجه معروفة — نفس شرط المحرك (alerts.js maxCost). ومن ٢٥ أكتوبر لإعلانات المبيعات كمان (صاحب المنتج: «عاجلة لأنها…
  // تكلفة الطلب أعلى من الحد الأقصى» — الحد بيتطبّق مع العائد، وأي واحد فيهم بيكفي). لكل نوع نتيجة في الحساب، ولكل حملة لوحدها
  // (متجر بفئات أسعار مختلفة: تكلفة الطلب بتختلف من حملة لحملة) — الحملة قبل الحساب. الأنواع والحملات من إعلانات الحساب المحمّلة،
  // واللي محفوظ ومش ظاهر دلوقتي (حملة خلصت، أو الإعلانات لسه بتتحمّل) بيظهر برقمه عشان يتعدّل أو يتشال. والوصول برّه: «أقصى
  // تكلفة لكل شخص» وحدة مالهاش معنى عملي (تكلفة الشخص أجزاء من السنت — كانت بتظهر «٠ $ لكل شخص»)
  function costAds(source) {
    return candidates.filter(function (c) {
      return c.source === source && c.results != null && c.resultKey !== 'reach';
    });
  }
  // التكلفة الصغيرة بخانات كفاية (core.js fmtNum — نقرة بـ٠٫٠٤ مش «٠ $»)
  function costNow(spend, results, key, cur) {
    return results > 0 && spend > 0 ? t('settings.cost.now', { cpr: money(spend / results, cur), one: t('res1.' + (key || 'generic')) }) : '';
  }
  function costTargets(source, current) {
    var types = {}, camps = {}, cur = null;
    costAds(source).forEach(function (c) {
      var p = periodOf(c), sp = p.spend || 0, rs = p.results || 0;
      cur = cur || c.currency;
      if (c.resultKey) { var tp = types[c.resultKey] || (types[c.resultKey] = { key: c.resultKey, spend: 0, results: 0 }); tp.spend += sp; tp.results += rs; }
      if (c.campaignId) {
        var cp = camps[c.campaignId] || (camps[c.campaignId] = { id: String(c.campaignId), name: c.campaignName || '', spend: 0, results: 0, keys: {} });
        cp.spend += sp; cp.results += rs;
        if (c.resultKey) cp.keys[c.resultKey] = true;
      }
    });
    Object.keys(current.maxCost).forEach(function (k) { if (!types[k]) types[k] = { key: k, spend: 0, results: 0 }; });
    Object.keys(current.campaignMaxCost).forEach(function (id) { if (!camps[id]) camps[id] = { id: id, name: '', spend: 0, results: 0, keys: {} }; });
    var bySpend = function (a, b) { return b.spend - a.spend; };
    cur = cur || (accountInfo[source] && accountInfo[source].currency) || null;
    return { types: Object.keys(types).map(function (k) { return types[k]; }).sort(bySpend), camps: Object.keys(camps).map(function (k) { return camps[k]; }).sort(bySpend), currency: cur };
  }
  function costRow(name, label, help, value, unit, placeholder) {
    return '<label class="setting-row"><span class="setting-text"><span class="setting-label">' + esc(label) + '</span>' + (help ? '<span class="setting-help">' + esc(help) + '</span>' : '') + '</span>' +
      '<span class="setting-input"><input type="text" inputmode="decimal" dir="ltr" autocomplete="off" spellcheck="false" data-cost="' + esc(name) + '" value="' + (value != null ? esc(String(value)) : '') + '"' +
      (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + '><span class="setting-unit">' + esc(unit) + '</span></span></label>';
  }
  function costSectionHtml(source, current) {
    var tg = costTargets(source, current), unit = currencyLabel(tg.currency);
    var typeRows = tg.types.map(function (x) {
      return costRow('type:' + x.key, t('settings.cost.type', { one: t('res1.' + x.key) }), costNow(x.spend, x.results, x.key, tg.currency), current.maxCost[x.key], unit);
    }).join('');
    var campRows = tg.camps.map(function (x) {
      var keys = Object.keys(x.keys), one = keys.length === 1 ? keys[0] : null;
      var inherited = one && current.maxCost[one] ? String(current.maxCost[one]) : '';
      var help = [DX.listText(keys.map(function (k) { return t('res.' + k); })), costNow(x.spend, x.results, one, tg.currency)].filter(Boolean).join(' — ');
      return costRow('camp:' + x.id, x.name || t('settings.cost.campId', { id: x.id }), help, current.campaignMaxCost[x.id], unit, inherited);
    }).join('');
    var anyCamp = Object.keys(current.campaignMaxCost).length > 0;
    return '<fieldset class="settings-group" data-cost-section><legend>' + esc(t('settings.cost.title')) + '</legend>' +
      '<p class="settings-where">' + esc(t('settings.cost.help')) + '</p>' +
      (typeRows || '<p class="settings-where">' + esc(t('settings.cost.none')) + '</p>') +
      (campRows ? '<details class="settings-camps"' + (anyCamp ? ' open' : '') + '><summary>' + esc(t('settings.cost.camps')) + '</summary>' +
        '<p class="settings-where">' + esc(t('settings.cost.campsHelp')) + '</p>' + campRows + '</details>' : '') +
      '</fieldset>';
  }
  function renderSettingsForm() {
    var source = settingsSrc = pickSettingsSource();
    var state = settingsFormState = settingsStateOf(source);
    var errEl = document.getElementById('settingsError');
    if (errEl) errEl.textContent = '';
    settingsSaveBtn.disabled = state !== 'ready' || settingsSaving;
    if (state === 'none') { settingsForm.innerHTML = '<p class="settings-where">' + esc(t('settings.noAccount')) + '</p>'; return; }
    if (state !== 'ready') {
      var noSession = state === 'error' && !platformTokenOf(platformOfSource(source));
      settingsForm.innerHTML = settingsAccountHtml(source) + (state === 'loading'
        ? '<p class="settings-where" role="status">' + esc(t('settings.loading')) + '</p>'
        : '<p class="settings-where err" role="status">' + esc(t(noSession ? 'settings.err.session' : 'settings.err.load')) + '</p>' +
          (noSession ? '' : '<div class="settings-retry"><button type="button" class="ghost-btn" data-settings-retry>' + esc(t('settings.retry')) + '</button></div>'));
      return;
    }
    var current = PauseProofAlerts.mergeSettings(settingsFor(source));
    var groups = {};
    PauseProofAlerts.SETTINGS_META.forEach(function (m) {
      if (MAIN_SETTINGS[m.key]) return;
      (groups[m.group] = groups[m.group] || []).push(m);
    });
    var advancedHtml = '<details class="settings-advanced"><summary>' + t('settings.advanced') + '</summary>' +
      Object.keys(groups).map(function (g) {
        return '<fieldset class="settings-group"><legend>' + esc(g) + '</legend>' + groups[g].map(function (m) { return settingRow(m, current[m.key]); }).join('') + '</fieldset>';
      }).join('') + '</details>';
    settingsForm.innerHTML = settingsAccountHtml(source) + settingsCoreHtml(current) + costSectionHtml(source, current) + advancedHtml;
  }
  // سجل الحساب وصل والنافذة مستنياه — بنرسمها (مش وهو بيكتب: الخانات مبتظهرش غير في حالة ready)
  function settingsArrived(source) {
    if (!settingsOverlay.classList.contains('hidden') && source === settingsSrc && settingsFormState !== 'ready') renderSettingsForm();
  }
  settingsForm.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'settingsAccount') { settingsSrc = e.target.value; renderSettingsForm(); }
  });
  settingsForm.addEventListener('click', function (e) {
    if (!e.target.closest('[data-settings-retry]')) return;
    acctPulling[settingsSrc] = false;
    pullAccountSettings();
    renderSettingsForm();
  });

  // فتح النافذة بيعيد طلب سجل الحساب لو المحاولة الأولى فشلت (النافذة محتاجاه — مش بنعرض خانات قبل ما نعرف اللي محفوظ)
  function openAlertSettings() { settingsSrc = null; pullAccountSettings(); renderSettingsForm(); settingsOverlay.classList.remove('hidden'); }
  document.getElementById('openSettingsBtn').addEventListener('click', openAlertSettings);
  // نفس النافذة من صفحة «الإعدادات» كمان (كل الإعدادات في مكان واحد)
  document.querySelectorAll('[data-open-settings]').forEach(function (b) { b.addEventListener('click', openAlertSettings); });
  document.getElementById('settingsClose').addEventListener('click', function () { settingsOverlay.classList.add('hidden'); });
  settingsOverlay.addEventListener('click', function (e) { if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden'); });
  // التحقق قبل الحفظ: كل قيمة جوه حدودها، والحدود المرتبطة مترتبة (حد «مراجعة» أكبر من «تحسين»...).
  // قبل كده القيمة الغلط كانت بترجع للافتراضي من غير ما العميل يعرف، والحدود المتلخبطة كانت بتتقبل
  var settingsErrorEl = document.getElementById('settingsError');
  function clearSettingsErrors(root, errEl) {
    root = root || settingsForm; errEl = errEl || settingsErrorEl;
    root.querySelectorAll('.setting-row.invalid').forEach(function (r) { r.classList.remove('invalid'); });
    root.querySelectorAll('.setting-error').forEach(function (e) { e.remove(); });
    if (errEl) errEl.textContent = '';
  }
  // الأخطاء جنب الخانة نفسها + رسالة عامة تحت — true = فيه أخطاء
  function showSettingsErrors(r, errEl) {
    if (!r.errors.length) return false;
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
    if (errEl) errEl.textContent = t('set.err.fix');
    r.errors[0].input.focus();
    return true;
  }
  // الأرقام العربية (٠-٩) والفارسية (۰-۹) والفاصلة (٫ أو ,) → رقم عادي. «١٫٥» و«1,5» و«1.5» كلهم ١٫٥
  // whole = خانة عدد صحيح (عدد نتائج، أيام): الفاصلة قبل ٣ أرقام بالظبط فاصل آلاف — «1,000» = ألف. قبل كده كانت ١ في صمت
  // (المراجعة التانية للمرحلة ٤، ر٧٩: «أقل عدد نتائج» حدّه ١٠٬٠٠٠ فالواحد كان بيتقبل). في المضاعفات والنسب الفاصلة عشرية (أقصاها ١٠٠)
  function settingNumberText(v, whole) {
    var s = String(v == null ? '' : v).trim()
      .replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[\u06F0-\u06F9]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); });
    if (whole) s = s.replace(/[\u066C,](?=\d{3}(?!\d))/g, '');
    return s.replace(/[\u066B,]/g, '.').replace(/\s+/g, '');
  }
  function readSettingsForm(root) {
    root = root || settingsForm;
    var next = {}, errors = [];
    var inputOf = function (key) { return root.querySelector('[name="' + key + '"]'); };
    PauseProofAlerts.SETTINGS_META.forEach(function (m) {
      var input = inputOf(m.key);
      if (!input) return;
      var txt = settingNumberText(input.value, m.kind === 'count' || m.kind === 'days');
      if (txt === '') return; // فاضي: الحد بقيمة البداية، والمستهدف وحد الخسارة مش محددين (حكم الربح بيستنى)
      var raw = /^\d*\.?\d+$/.test(txt) ? parseFloat(txt) : NaN;
      if (!isFinite(raw) || raw < m.min || raw > m.max) {
        errors.push({ input: input, text: t('set.err.range', { min: numAr(m.min), max: numAr(m.max) }) });
        return;
      }
      next[m.key] = m.kind === 'ratio' ? raw / 100 : raw;
    });
    // المستهدف وحد الخسارة مع بعض أو ولا واحد: حكم الربح محتاج الاتنين، وواحد لوحده كان هيتحفظ من غير أي أثر
    var goalsIn = PauseProofAlerts.GOAL_KEYS.filter(function (k) { return next[k] != null; });
    if (goalsIn.length === 1) {
      var missing = PauseProofAlerts.GOAL_KEYS.filter(function (k) { return next[k] == null; })[0];
      if (inputOf(missing)) errors.push({ input: inputOf(missing), text: t('set.err.goalPair') });
    }
    var eff = PauseProofAlerts.mergeSettings(next);
    PauseProofAlerts.SETTINGS_ORDER.forEach(function (o) {
      if (eff[o[0]] != null && eff[o[1]] != null && eff[o[0]] > eff[o[1]] && inputOf(o[1])) errors.push({ input: inputOf(o[1]), text: t(o[2]) });
    });
    // أقصى تكلفة لكل نوع نتيجة ولكل حملة (لو القسم ظاهر): فاضي = مفيش حد، وأي مبلغ أكبر من صفر. فاصل الآلاف زي خانات الأيام:
    // «1,500» = ١٥٠٠ مش ١٫٥، و«12,5» = ١٢٫٥. managed = اللي النافذة بتتحكم فيه (فاضي = اتشال)، والباقي بيفضل زي ما هو في السجل
    var managed = [];
    if (root.querySelector('[data-cost-section]')) {
      managed = ['maxCost', 'campaignMaxCost'];
      var maps = { type: {}, camp: {} };
      root.querySelectorAll('[data-cost]').forEach(function (input) {
        var txt = settingNumberText(input.value, true);
        if (txt === '') return;
        var raw = /^\d*\.?\d+$/.test(txt) ? parseFloat(txt) : NaN;
        if (!isFinite(raw) || raw <= 0 || raw > 1e9) { errors.push({ input: input, text: t('set.err.cost') }); return; }
        var name = input.getAttribute('data-cost'), cut = name.indexOf(':');
        maps[name.slice(0, cut)][name.slice(cut + 1)] = Math.round(raw * 100) / 100;
      });
      if (Object.keys(maps.type).length) next.maxCost = maps.type;
      if (Object.keys(maps.camp).length) next.campaignMaxCost = maps.camp;
    }
    return { values: next, errors: errors, managed: managed };
  }
  // اللي النافذة مبتعرضوش بيفضل زي ما هو في سجل الحساب (KEPT_KEYS — حماية لو القسم مش ظاهر)
  var KEPT_KEYS = ['maxCost', 'campaignMaxCost'];
  function withKept(source, values, managed) {
    var cur = settingsFor(source) || {}, out = Object.assign({}, values);
    KEPT_KEYS.forEach(function (k) { if ((managed || []).indexOf(k) < 0 && !(k in out) && cur[k]) out[k] = cur[k]; });
    return out;
  }
  // الحفظ في سجل الحساب (السيرفر) — النافذة بتفضل مفتوحة لحد ما يتأكد، والفشل بيظهر فيها بسببه
  function saveErrText(e) { return t(e && (e.code === 'session' || e.code === 'not verified') ? 'settings.err.session' : 'settings.err.save'); }
  function setSaving(btn, on, idleKey) {
    settingsSaving = on;
    btn.disabled = on;
    btn.textContent = t(on ? 'settings.saving' : idleKey);
  }
  settingsSaveBtn.addEventListener('click', function () {
    if (settingsSaving || settingsFormState !== 'ready') return;
    clearSettingsErrors();
    var r = readSettingsForm();
    if (showSettingsErrors(r, settingsErrorEl)) return;
    var source = settingsSrc;
    setSaving(settingsSaveBtn, true, 'settings.save');
    saveAccountSettings(source, withKept(source, r.values, r.managed), function (stored) {
      setSaving(settingsSaveBtn, false, 'settings.save');
      // شاف سؤال المستهدف هنا وساب الخانتين فاضيين بقصد — نافذة أول مرة متسألهوش تاني بعد الحفظ على طول
      markWelcomeSeen(source);
      settingsOverlay.classList.add('hidden');
      render();
      if (stored === false) setStatus(msg('settings.notSaved'));
    }, function (e) {
      setSaving(settingsSaveBtn, false, 'settings.save');
      settingsErrorEl.textContent = saveErrText(e);
    });
  });

  // ---------- نافذة أول مرة لكل حساب: ضبط التنبيهات على أهداف المتجر ----------
  // أول ما حساب يتفتح ومالوش مستهدف وحد خسارة (وسجله وصل من السيرفر)، بتظهر مرة واحدة للحساب ده على الجهاز ده: السؤالين عن الفلوس،
  // مع توضيح إنها بتتعدّل في أي وقت من «الإعدادات» ← «إعدادات التنبيهات». لكل حساب لوحده لأن كل متجر ليه هامشه (مراجعة الإعدادات
  // ٢٤ أكتوبر). «لاحقاً» أو ✕ أو Esc = حكم الربح بيستنى، ومش بتظهر تاني للحساب ده.
  var welcomeOverlay = document.getElementById('welcomeOverlay');
  var welcomeForm = document.getElementById('welcomeForm');
  var welcomeErrorEl = document.getElementById('welcomeError');
  var welcomeSaveBtn = document.getElementById('welcomeSave');
  var WELCOME_KEY = 'acc.welcome.accounts.v1', welcomeSrc = null;
  function welcomeSeenAll() {
    try { var v = JSON.parse(localStorage.getItem(WELCOME_KEY) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
    catch (e) { return null; }   // التخزين مقفول: منسألش (من غيرها كانت هتظهر في كل رسم)
  }
  function markWelcomeSeen(source) {
    try { var v = welcomeSeenAll() || {}; v[source] = 1; localStorage.setItem(WELCOME_KEY, JSON.stringify(v)); } catch (e) { /* مش مهم */ }
  }
  function welcomeCandidate() {
    var seen = welcomeSeenAll();
    if (!seen) return null;
    return settingsSources().filter(function (s) {
      if (seen[s] || (serverSettingsOn(s) && !settingsKnown(s))) return false;
      return PauseProofAlerts.mergeSettings(settingsFor(s)).roasTarget == null;
    })[0] || null;
  }
  function maybeShowWelcome() {
    if (!welcomeOverlay || !welcomeOverlay.classList.contains('hidden')) return;
    // نافذة تانية مفتوحة (اختيار المنصة مثلاً) — نستنى الرسم الجاي
    if (document.querySelector('.expand-overlay:not(.hidden)')) return;
    var source = welcomeCandidate();
    if (!source) return;
    welcomeSrc = source;
    welcomeForm.innerHTML = '<p class="settings-account-name">' + esc(t('settings.accountOne', { account: sourceLabel(source) })) + '</p>' +
      settingsCoreHtml(PauseProofAlerts.mergeSettings(settingsFor(source)));
    clearSettingsErrors(welcomeForm, welcomeErrorEl);
    welcomeOverlay.classList.remove('hidden');
  }
  function closeWelcome() {
    if (welcomeSrc) markWelcomeSeen(welcomeSrc);
    welcomeSrc = null;
    welcomeOverlay.classList.add('hidden');
  }
  welcomeSaveBtn.addEventListener('click', function () {
    if (settingsSaving || !welcomeSrc) return;
    clearSettingsErrors(welcomeForm, welcomeErrorEl);
    var r = readSettingsForm(welcomeForm);
    if (showSettingsErrors(r, welcomeErrorEl)) return;
    var source = welcomeSrc;
    setSaving(welcomeSaveBtn, true, 'welcome.save');
    saveAccountSettings(source, Object.assign({}, settingsFor(source), r.values), function (stored) {
      setSaving(welcomeSaveBtn, false, 'welcome.save');
      closeWelcome();
      render();
      if (stored === false) setStatus(msg('settings.notSaved'));
    }, function (e) {
      setSaving(welcomeSaveBtn, false, 'welcome.save');
      welcomeErrorEl.textContent = saveErrText(e);
    });
  });
  document.getElementById('welcomeSkip').addEventListener('click', closeWelcome);
  document.getElementById('welcomeClose').addEventListener('click', closeWelcome);

  function resetFilterChips() {
    document.querySelectorAll('.filter-group').forEach(function (g) { g.querySelectorAll('.chip').forEach(function (ch) { ch.classList.toggle('active', ch.dataset.value === 'all'); }); });
    filters.platform = 'all'; filters.format = 'all'; filters.health = 'all'; filters.text = '';
    filters.campaign = null;
    platSel = null;
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

  // ---------- التثبيت على شاشة الهاتف (manifest.webmanifest) ----------
  // أندرويد (Chrome وSamsung Internet): لما الصفحة تبقى قابلة للتثبيت المتصفح بيبعت beforeinstallprompt — بنمسكه
  // ونظهر «ثبّت الأداة»، والضغط بيفتح نافذة التثبيت بتاعة المتصفح نفسه (الحدث بيتستخدم مرة واحدة).
  // آيفون: مفيش نافذة تثبيت من الصفحة، فالزرار بيفتح الخطوات (installOverlay). الخطوات بتقفل «فتح كتطبيق ويب» فالأيقونة
  // بتفتح الأداة في Safari نفسه، اللي الدخول فيه متجرّب: وضع التطبيق المستقل على آيفون لسه ماتجرّبش مع نوافذ دخول
  // Meta وGoogle وSnapchat (فيه مصادر بتقول إن النافذة أو الرجوع من صفحة الدخول بيضيعوا هناك). بعد تجربة على جهاز حقيقي نغيّرها.
  // ولأن الأيقونة بتفتح Safari عادي، الأداة متعرفش إنها اتضافت — فبنسأل العميل نفسه (installAsk): في الزيارة اللي بعد ما
  // فتح الخطوات بتظهر بطاقة صغيرة فوق الصفحة (مش نافذة بتحجب الأرقام): «نعم، أضفتها» أو «لا، شكراً» = الزرار والبطاقة
  // بيختفوا على طول، و«اعرض الخطوات» = الخطوات تاني والسؤال يرجع الزيارة الجاية. لو اتجاهلت بتظهر ٣ زيارات بالكتير.
  // أندرويد والأداة المفتوحة من الأيقونة كتطبيق: بنعرف لوحدنا، فمفيش سؤال (قرار صاحب المنتج ٣ أكتوبر ٢٠٢٦).
  // الأداة مفتوحة من الأيقونة، أو على كمبيوتر، أو جوه متصفح فيسبوك وإنستغرام = مفيش زرار ولا سؤال
  var installBtn = document.getElementById('installBtn');
  var installOverlay = document.getElementById('installOverlay');
  var installAsk = document.getElementById('installAsk');
  var INSTALL_KEY = 'acc.install.v1';
  var INSTALL_SESSION_KEY = 'acc.install.session';
  var INSTALL_ASK_MAX = 3;
  var installPrompt = null;
  function runningInstalled() {
    return !!((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true);
  }
  function isTouchDevice() { return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); }
  // آيفون وآيباد (آيباد بيقول إنه Mac، فبنفرّقه باللمس). متصفحات التطبيقات مفيهاش «إضافة إلى الشاشة الرئيسية»
  function iosCanAddToHome(ua) {
    ua = ua || navigator.userAgent || '';
    var ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    return ios && !/FBAN|FBAV|FB_IAB|Instagram|Snapchat|Line\/|TikTok|musical_ly/i.test(ua);
  }
  // { seen: الخطوات اتفتحت، asked: عدد الزيارات اللي السؤال ظهر فيها، answer: 'yes' | 'no' | null }
  // ('1' القديمة = الخطوات اتفتحت قبل كده من غير سؤال)
  function installState() {
    var raw = null;
    try { raw = localStorage.getItem(INSTALL_KEY); } catch (e) { /* تخزين مقفول */ }
    if (raw === '1') return { seen: true, asked: 0, answer: null };
    try { var v = JSON.parse(raw || 'null'); if (v && typeof v === 'object') return { seen: !!v.seen, asked: Number(v.asked) || 0, answer: v.answer === 'yes' || v.answer === 'no' ? v.answer : null }; } catch (e) { /* قيمة غريبة */ }
    return { seen: false, asked: 0, answer: null };
  }
  function saveInstallState(patch) {
    var s = installState();
    Object.keys(patch).forEach(function (k) { s[k] = patch[k]; });
    try { localStorage.setItem(INSTALL_KEY, JSON.stringify(s)); } catch (e) { /* مش مهم */ }
  }
  // الزيارة دي: 'steps' = الخطوات اتفتحت فيها (مفيش سؤال لحد الزيارة الجاية)، 'asked' = السؤال اتحسب فيها خلاص
  function installSession(v) {
    try { if (v) sessionStorage.setItem(INSTALL_SESSION_KEY, v); return sessionStorage.getItem(INSTALL_SESSION_KEY); } catch (e) { return null; }
  }
  // 'prompt' = نافذة تثبيت المتصفح جاهزة، 'ios' = خطوات آيفون، null = مفيش زرار
  function installMode() {
    if (runningInstalled() || !isTouchDevice()) return null;
    if (installPrompt) return 'prompt';
    return iosCanAddToHome() && !installState().answer ? 'ios' : null;
  }
  // الزرار في بطاقة «التثبيت على الهاتف» في صفحة الإعدادات — والبطاقة كلها بتستخبى معاه (الكمبيوتر، أو الأداة مثبّتة)
  function renderInstallButton() {
    installBtn.hidden = !installMode();
    var card = document.getElementById('installCard');
    if (card) card.hidden = installBtn.hidden;
  }
  // البطاقة: آيفون بس، بعد ما الخطوات اتفتحت في زيارة قبل كده، ولسه مفيش إجابة. أول ظهور في الزيارة بيتحسب مرة واحدة
  function renderInstallAsk() {
    var s = installState(), session = installSession();
    var show = installMode() === 'ios' && s.seen && session !== 'steps' && (session === 'asked' || s.asked < INSTALL_ASK_MAX);
    if (show && session !== 'asked') { saveInstallState({ asked: s.asked + 1 }); installSession('asked'); }
    installAsk.hidden = !show;
  }
  function openInstallSteps() {
    saveInstallState({ seen: true });
    installSession('steps');
    installAsk.hidden = true;
    installOverlay.classList.remove('hidden');
  }
  function answerInstall(answer) {
    saveInstallState({ answer: answer });
    installAsk.hidden = true;
    renderInstallButton();
  }
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); // من غير كده Chrome على الموبايل بيظهر شريطه الصغير لوحده — زرارنا هو اللي بيفتح النافذة
    installPrompt = e;
    renderInstallButton();
  });
  window.addEventListener('appinstalled', function () { installPrompt = null; renderInstallButton(); });
  installBtn.addEventListener('click', function () {
    var mode = installMode();
    if (mode === 'prompt') {
      var p = installPrompt;
      installPrompt = null; // لو العميل قفل النافذة من غير تثبيت، المتصفح بيبعت الحدث تاني بعدين فالزرار يرجع
      renderInstallButton();
      p.prompt();
    } else if (mode === 'ios') openInstallSteps();
  });
  document.getElementById('installClose').addEventListener('click', function () { installOverlay.classList.add('hidden'); });
  installOverlay.addEventListener('click', function (e) { if (e.target === installOverlay) installOverlay.classList.add('hidden'); });
  document.getElementById('installAskYes').addEventListener('click', function () { answerInstall('yes'); });
  document.getElementById('installAskNo').addEventListener('click', function () { answerInstall('no'); });
  document.getElementById('installAskSteps').addEventListener('click', openInstallSteps);
  renderInstallButton();
  renderInstallAsk();

  // ---------- النوافذ المنبثقة: التركيز (لوحة المفاتيح وقارئات الشاشة) ----------
  // لما نافذة تفتح: التركيز بيروح لزرار الإغلاق جواها، وTab بيلف جوه النافذة بس (مش ورا الخلفية).
  // لما تتقفل: التركيز بيرجع للزرار اللي فتحها. بنراقب كلاس hidden نفسه، فبيشتغل مهما كانت طريقة الفتح والقفل
  function focusablesIn(root) {
    return Array.prototype.filter.call(
      root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])'),
      function (el) { return !el.hidden && el.getClientRects().length > 0; });
  }
  [platformOverlay, expandOverlay, settingsOverlay, installOverlay, welcomeOverlay, filterDrawer].forEach(function (dlg) {
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
