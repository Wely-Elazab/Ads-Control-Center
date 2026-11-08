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

  // ---------- اختيار الحسابات في الشريط العلوي (طلب صاحب المنتج ٢٦ أكتوبر ٢٠٢٦) ----------
  // «يظهر اسم آخر حساب إعلاني تم اختياره فقط رغم الاتصال بأكثر من منصة، ولا يظهر تحديد يوضح الحسابات المختارة، ولا يوجد بحث».
  // القائمة الأصلية (select#accountSelect) بتفضل مصدر الخيارات ومخفية. الزرار: الحساب المختار في كل منصة متصلة بشعارها. القائمة:
  // بحث بالاسم أو الرقم، ومجموعة لكل منصة، و✓ جنب المختار. اختيار حساب = نفس «change» القديم (loadSource)
  var acctPicker = document.getElementById('acctPicker'), acctPickBtn = document.getElementById('acctPickBtn');
  var acctPanel = document.getElementById('acctPanel'), acctSearch = document.getElementById('acctSearch'), acctList = document.getElementById('acctList');
  var acctDone = document.getElementById('acctDone');
  // «Meta — اسم الحساب» ← «اسم الحساب» (الشعار بيقول المنصة)
  function acctName(label) { return String(label || '').replace(/^[^—]*—\s*/, ''); }
  function acctPlats() { return PLAT_ORDER.filter(function (p) { return (platformOptions[p] || []).length; }); }
  function renderAccountPicker() {
    if (!acctPicker) return;
    var plats = acctPlats();
    acctPicker.hidden = !plats.length;
    acctPickBtn.innerHTML = plats.map(function (p) {
      var cur = (platformOptions[p] || []).filter(function (o) { return o.value === activeSources[p]; })[0], name = cur ? acctName(cur.label) : t('acct.pick.none');
      return '<span class="acct-pick-item" title="' + esc(PLATFORM_NAMES[p] + ' — ' + name) + '">' + platLogo(p) +
        '<span class="acct-pick-name" dir="auto">' + esc(name) + '</span></span>';
    }).join('') + '<span class="acct-pick-caret" aria-hidden="true">▾</span>';
    if (!acctPanel.hidden) renderAccountList();
  }
  function renderAccountList() {
    var q = String(acctSearch.value || '').trim().toLowerCase(), html = '', any = false;
    acctPlats().forEach(function (p) {
      var opts = (platformOptions[p] || []).filter(function (o) {
        return !q || acctName(o.label).toLowerCase().indexOf(q) > -1 || String(o.value).toLowerCase().indexOf(q) > -1;
      });
      if (!opts.length) return;
      any = true;
      // كل منصة بلونها وشعارها: العنوان وكل حساب جواه (طلب صاحب المنتج ٢ نوفمبر ٢٠٢٦ — «ليس مجرد لوجو
      // المنصة فوق الحسابات كلها، بل وبجانب كل حساب لوجو المنصة ايضاً»)
      html += '<div class="acct-group plat-' + esc(p) + '" role="presentation">' + platLogo(p) +
        '<span class="acct-group-name">' + esc(PLATFORM_NAMES[p]) + '</span>' +
        '<span class="acct-group-count">' + esc(ar(opts.length)) + '</span></div>';
      opts.forEach(function (o) {
        var on = o.value === activeSources[p];
        // مربع اختيار: الضغط في أي مكان على الصف بيختار أو بيلغي الاختيار (role=checkbox — الصف كله هو المربع)
        // الاسم الصريح للمربع: قارئ الشاشة كان بيقول «مربع اختيار، غير محدد» من غير اسم الحساب (شجرة الإتاحة على
        // الموقع ٣ نوفمبر ٢٠٢٦). والمنصة جوه الاسم عشان حساب بنفس الاسم على منصتين (Coda مثلاً) ميتلخبطش
        html += '<button type="button" class="acct-opt plat-' + esc(p) + (on ? ' on' : '') + '" role="checkbox" aria-checked="' + on + '"' +
          ' aria-label="' + esc(PLATFORM_NAMES[p] + ' — ' + acctName(o.label)) + '"' +
          ' data-acct-plat="' + esc(p) + '" data-acct-id="' + esc(o.value) + '">' +
          '<span class="acct-box" aria-hidden="true">' + (on ? '✓' : '') + '</span>' +
          platLogo(p) +
          '<span class="acct-opt-name" dir="auto">' + esc(acctName(o.label)) + '</span></button>';
      });
    });
    acctList.innerHTML = any ? html : '<p class="acct-empty">' + esc(t('acct.none')) + '</p>';
  }
  function openAccountPanel(open) {
    acctPanel.hidden = !open;
    acctPickBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { acctSearch.value = ''; renderAccountList(); acctSearch.focus(); }
  }
  if (acctPickBtn) {
    acctPickBtn.addEventListener('click', function () { openAccountPanel(acctPanel.hidden); });
    acctSearch.addEventListener('input', renderAccountList);
    // Enter = أول نتيجة، والسهم لتحت = القائمة
    acctSearch.addEventListener('keydown', function (e) {
      var first = acctList.querySelector('[data-acct-id]');
      if (e.key === 'Enter' && first) { e.preventDefault(); first.click(); }
      if (e.key === 'ArrowDown' && first) { e.preventDefault(); first.focus(); }
    });
    acctList.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var all = Array.prototype.slice.call(acctList.querySelectorAll('[data-acct-id]')), i = all.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      if (e.key === 'ArrowUp' && i === 0) acctSearch.focus(); else if (all[i + (e.key === 'ArrowDown' ? 1 : -1)]) all[i + (e.key === 'ArrowDown' ? 1 : -1)].focus();
    });
    // الضغط على الصف = تبديل الاختيار (اختيار أو إلغاء)، والقائمة بتفضل مفتوحة عشان العميل يقدر يغيّر
    // أكتر من حساب ورا بعض ويشوف أثر اختياره — بتتقفل لما يضغط برّه أو على «تم» (طلب صاحب المنتج ٢ نوفمبر ٢٠٢٦)
    acctList.addEventListener('click', function (e) {
      var b = e.target.closest('[data-acct-id]');
      if (!b) return;
      var p = b.getAttribute('data-acct-plat'), id = b.getAttribute('data-acct-id');
      if (activeSources[p] === id) deselectAccount(p);
      else { accountSelect.value = id; loadSource(p, id); }
      renderAccountPicker();
      renderAccountList();
      // التركيز بيفضل على نفس الصف بعد إعادة الرسم (القائمة بتتبني من أول وجديد)
      var again = acctList.querySelector('[data-acct-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
      if (again) again.focus();
    });
    if (acctDone) acctDone.addEventListener('click', function () { openAccountPanel(false); acctPickBtn.focus(); });
    // القفل بالضغط برّه القائمة. بنسأل مسار الحدث مش الصفحة: الضغطة على حساب بتعيد بناء القائمة فوراً،
    // فالعنصر اللي اتضغط بيطلع برّه الصفحة قبل ما السطر ده يشتغل، وcontains كانت بترد «برّه» وتقفل القائمة
    // غلط (ظهرت في الاختبار، ٢ نوفمبر ٢٠٢٦). composedPath بيتحسب وقت إطلاق الحدث فمبيتأثرش
    document.addEventListener('click', function (e) {
      if (acctPanel.hidden) return;
      var path = typeof e.composedPath === 'function' ? e.composedPath() : null;
      if (path ? path.indexOf(acctPicker) > -1 : acctPicker.contains(e.target)) return;
      openAccountPanel(false);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !acctPanel.hidden) { openAccountPanel(false); acctPickBtn.focus(); } });
  }

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
  // إلغاء اختيار حساب من غير فصل المنصة (طلب صاحب المنتج ٢ نوفمبر ٢٠٢٦): إعلانات الحساب بتختفي وبس.
  // المنصة بتفضل مربوطة بمفتاحها وقائمة حساباتها، فالعميل يقدر يختار حساب تاني بضغطة من غير ما يسجّل
  // دخول من أول وجديد. قبل كده الطريقة الوحيدة لإخفاء حساب كانت «فصل» المنصة كلها.
  // بنمسح آخر حساب محفوظ كمان عشان التحديث الجاي ميرجّعهوش لوحده
  function deselectAccount(platform) {
    if (!activeSources[platform]) return;
    beginLoad(platform);                 // أي رد لسه جاي من الحساب ده بيتجاهل
    loadingPlatforms[platform] = false;
    numbersPending[platform] = false;
    candidates = candidates.filter(function (c) { return platformOfSource(c.source) !== platform; });
    delete activeSources[platform];
    forgetAccount(platform);
    dxReset(platform);
    setPlatformState(platform, null);
    document.body.classList.toggle('is-loading', anyLoading());
    cardGrid.setAttribute('aria-busy', anyLoading() ? 'true' : 'false');
    saveSession();
    render();
  }

  // فصل منصة = تسجيل خروج من الأداة بس: بيمسح إعلاناتها وحساباتها ومفتاح الدخول وآخر حساب محفوظ
  // من المتصفح ده. العميل بيفضل داخل على فيسبوك/Google نفسهم (مش شغلنا نخرّجه منهم)
  function disconnectPlatform(platform, quiet) {
    // «فصل» Meta أو Snapchat بيخرّج حساباتها من الملخص التلقائي ويحذف صلاحياتها من السيرفر (سياسة الخصوصية، البند ٧) — قبل ما الجلسة تتمسح
    if (platform === 'meta' || platform === 'snapchat') digestDisconnect(platform);
    // الربط المحفوظ على الجهاز بيتمسح. Google: الخادم بيلغي الصلاحية عند Google نفسها كمان (لو حد نسخ
    // النسخة المقفولة قبل كده، متنفعش). Snapchat ملهاش إلغاء من عندنا — العميل يقدر يشيل الأداة من إعدادات حسابه
    var sealed = sealedFor(platform);
    if (sealed) {
      keepSealed(platform, null);
      if (platform === 'google') apiPost('/api/google-token', { sealed: sealed, revoke: true });
    }
    beginLoad(platform); // أي رد لسه جاي من المنصة دي بيتجاهل
    if (platform === 'meta') clearMetaBase();   // بيانات الحساب المحفوظة بين الفترات متفضلش بعد الفصل
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
    // ومشكلات لوحة «قيمة الأداة» وسجل تعديلاتها بتاعة حسابات المنصة دي
    [valueEpisodes, valueActions, valueState, extraInputs, extraAt].forEach(function (m) { Object.keys(m).forEach(function (k) { if (k.indexOf(platform + ':') === 0) delete m[k]; }); });
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

  // نسخة الجهاز القديمة من إعدادات التنبيهات (قبل ما تتحفظ على السيرفر): بتتقري بس عشان تتنقل مرة واحدة لإعدادات المستخدم، وبتتشال
  // بعد أول حفظ ناجح ليها
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
      return withoutPreset(v);
    } catch (e) { return {}; }
  }
  var alertSettings = loadAlertSettings();
  function dropDeviceSettings() {
    alertSettings = {};
    try { localStorage.removeItem(SETTINGS_KEY); } catch (e) { /* التخزين مقفول — مفيش نسخة أصلاً */ }
  }

  // ---------- إعدادات التنبيهات لكل مستخدم (قرار صاحب المنتج ٢٦ أكتوبر ٢٠٢٦: «نعم اجعلها لكل مستخدم»، و«الوضع الافتراضي… لكل
  // الحسابات المتصلة، ويكون هناك خيار تخصيص التنبيه لكل منصة») ----------
  // سجل واحد لحساب الدخول في الأداة (supabase/functions/sync/settings.ts): بيظهر على أي جهاز يدخل بيه، والبريد بيقراه لصاحب الملخص
  // (runner.ts). { all, plat: { meta, … }, acct: { «منصة:رقم الحساب»: {…} }, asked }. من ٨ نوفمبر ٢٠٢٦ الأرقام لكل حساب إعلاني
  // (قرار صاحب المنتج: «تسجل الارقام لكل حساب اعلاني في كل منصة لكل مستخدم، بحيث عند تبديل الحساب الاعلاني يتغير معها العائد المطلوب
  // وباقي اعدادات التنبيهات») — فحسابين على نفس المنصة بقى لكل واحد مستهدفه (ده كان تمن القرار القديم). وall/plat القديمة بقت قيم
  // بداية لأي حساب مالوش سجل لسه، فمحدش اتغيّر حكمه يوم التحديث، وأول حفظ للحساب بيخلّيه مستقل.
  // إعدادات الحساب (وأقصى تكلفة الأنواع بعملته) من المحرك (alerts.js settingsForAccount) — نفس الدالة في البريد. قبل ما السجل يوصل:
  // قيم البداية (حكم الربح بيستنى) — مش نسخة الجهاز: الجهاز ممكن يكون عليه إعدادات مستخدم تاني دخل منه قبل كده.
  var userSet = null;
  var userSetState = 'none';   // none / loading / migrate (مالوش سجل: بننقل القديم لما الحسابات تخلص تحميل) / ready / error
  var migrating = false;
  // مراجعة ٣١ أكتوبر (طلب صاحب المنتج «دقق جيداً»):
  //  - userSetBase = سجل اتنقل في الجلسة ومتحفظش (قراءة سجل قديم فشلت): بيتبعت مع أول حفظ، والسيرفر بيبدأ بيه لو لسه مفيش سجل
  //  - userSetGen = بيزيد مع كل حفظ (أوله وآخره): قراءة بدأت قبل حفظ أو خلصت بعده متتسجلش فوقه
  //  - userSetFails = قراءات فشلت ورا بعض (إعادة تلقائية بفواصل متزايدة)
  var userSetBase = null, userSetFetchedAt = 0, userSetGen = 0, userSetInFlight = 0, userSetRefreshing = false, userSetFails = 0;
  var USER_RETRY_MS = [30000, 60000, 120000, 300000];
  function settingsKnown() { return userSetState === 'ready'; }
  function sourceCurrency(source) {
    var info = accountInfo[source];
    if (info && info.currency) return info.currency;
    for (var i = 0; i < candidates.length; i++) if (candidates[i].source === source && candidates[i].currency) return candidates[i].currency;
    return null;
  }
  function settingsFor(source) {
    if (!settingsKnown()) return {};
    var p = platformOfSource(source || '');
    return PauseProofAlerts.settingsForAccount(userSet, p, sourceCurrency(source), DX.pegRate, source ? source.slice(p.length + 1) : '');
  }
  function sourceOf(platform) { return activeSources[platform] ? platform + ':' + activeSources[platform] : null; }
  function platformTokenOf(platform) {
    if (platform === 'meta') return metaAccessToken();
    if (platform === 'snapchat') return validToken(sessionTokens.snapchat) || snapchatAccessToken;
    return null;
  }
  // طلب بإثبات الوصول للحساب في منصته (سجل مشكلات لوحة «ما حققته مع الأداة» — episodes.ts، وسجل الحساب القديم للنقل)
  function accountCall(action, source, extra) {
    var platform = platformOfSource(source), token = platformTokenOf(platform);
    if (!token) { var e = new Error('no session'); e.code = 'session'; return Promise.reject(e); }
    return syncCall(Object.assign({ action: action, platform: platform, accountId: source.slice(platform.length + 1), platformToken: token }, extra || {}));
  }
  function plainObject(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }
  function normUserSet(v) {
    var o = plainObject(v) || {}, plat = {}, acct = {};
    Object.keys(plainObject(o.plat) || {}).forEach(function (p) { if (PLATFORMS.indexOf(p) > -1 && plainObject(o.plat[p])) plat[p] = o.plat[p]; });
    // مفتاح الحساب = «منصة:رقم الحساب» = نفس مصدر الأداة (sourceOf) — منصة معروفة ورقم مش فاضي
    Object.keys(plainObject(o.acct) || {}).forEach(function (k) {
      var i = k.indexOf(':');
      if (i > 0 && PLATFORMS.indexOf(k.slice(0, i)) > -1 && k.length > i + 1 && plainObject(o.acct[k])) acct[k] = o.acct[k];
    });
    return { all: plainObject(o.all) || {}, plat: plat, acct: acct, asked: o.asked === true, prefs: plainObject(o.prefs) || {} };
  }
  function canonText(v) {
    if (!v || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canonText).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canonText(v[k]); }).join(',') + '}';
  }
  function adoptUserSet(rec) {
    userSet = normUserSet(rec);
    userSetState = 'ready';
    userSetFetchedAt = Date.now();
    userSetFails = 0;
  }
  // أول ما الأداة تتفتح في الجلسة: نجيب سجل المستخدم (بالتوازي مع تحميل الإعلانات)
  function pullUserSettings() {
    if (userSetState === 'migrate') { migrateUserSettings(); return; }
    if (userSetState !== 'none') return;
    if (window.AuthLogin && !AuthLogin.read()) return;   // من غير دخول (صفحة الاختبارات قبل ما تجهّز): مفيش سجل نجيبه
    userSetState = 'loading';
    syncCall({ action: 'usettings.get' }).then(function (res) {
      var rec = plainObject(res && res.settings);
      if (rec) { adoptUserSet(rec); settingsArrived(); render(); return; }
      // مالوش سجل: قيم البداية لحد ما النقل يخلص (النافذة من غير حساب متصل بتعرضها، والحفظ منها بيعمل السجل ويلغي النقل)
      userSet = normUserSet({});
      userSetState = 'migrate';
      migrateBy = Date.now() + MIGRATE_WAIT;
      setTimeout(migrateUserSettings, MIGRATE_WAIT + 500);
      migrateUserSettings();
    }, userSettingsFailed);
  }
  // القراءة فشلت (شبكة): التنبيهات بقيم البداية لحد ما تنجح. قبل ٣١ أكتوبر ده كان بيحصل في صمت ومن غير إعادة — دلوقتي بنقول كده مرة
  // في شريط الحالة، وبنعيد لوحدنا بفواصل متزايدة (٣٠ ثانية ← ٥ دقايق — «Exponential Backoff And Jitter»، AWS Architecture Blog)،
  // وفوراً لما المستخدم يرجع للتبويب
  function userSettingsFailed() {
    userSetState = 'error';
    var wait = USER_RETRY_MS[Math.min(userSetFails, USER_RETRY_MS.length - 1)];
    if (!userSetFails) setStatus(msg('settings.err.loadAuto'));
    userSetFails++;
    setTimeout(retryUserSettings, wait);
    settingsArrived();
  }
  function retryUserSettings() {
    if (userSetState !== 'error') return;
    userSetState = 'none';
    pullUserSettings();
  }
  // تحديث السجل وهو جاهز (فتح النافذة، أو الرجوع للتبويب بعد دقيقة — «revalidate on focus»، SWR وTanStack Query): تعديل اتعمل من
  // جهاز تاني بيظهر هنا من غير إعادة تحميل الصفحة. قبل ٣١ أكتوبر الصفحة الفاتحة فضلت تحكم بالإعدادات القديمة لحد ما تتقفل
  function refreshUserSettings() {
    if (userSetState !== 'ready' || userSetRefreshing || (window.AuthLogin && !AuthLogin.read())) return;
    var gen = userSetGen;
    userSetRefreshing = true;
    syncCall({ action: 'usettings.get' }).then(function (res) {
      userSetRefreshing = false;
      var rec = plainObject(res && res.settings);
      if (!rec || gen !== userSetGen || userSetInFlight) return;   // حفظ حصل وهي ماشية: رده هو الأحدث
      userSetFetchedAt = Date.now();
      if (canonText(normUserSet(rec)) === canonText(userSet)) return;
      adoptUserSet(rec);
      settingsRefreshed();
      render();
    }, function () { userSetRefreshing = false; });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    if (userSetState === 'error') retryUserSettings();
    else if (Date.now() - userSetFetchedAt > 60000) refreshUserSettings();
  });
  // المستخدم مالوش سجل لسه: الإعدادات القديمة بتتنقل مرة واحدة — سجل الحساب المفتوح في Meta وSnapchat (كانت لكل حساب من ٢٤
  // أكتوبر)، ونسخة الجهاز (Google وTikTok كانوا عليها). سجل Meta (وإلا Snapchat) = «كل الحسابات»، وSnapchat لو مختلف = إعدادات
  // Snapchat الخاصة — عشان محدش يحس إن حاجة اتغيّرت. بنستنى الحسابات تخلص تحميل (الحساب المفتوح هو اللي اتظبط غالباً)
  function withCur(rec, cur) {
    var o = Object.assign({}, rec);
    delete o.maxCostCur;
    if (o.maxCost && cur) o.maxCostCur = cur;
    return o;
  }
  function legacyMerge(found) {
    var out = { all: {}, plat: {} }, first = found.meta || found.snapchat || null;
    if (first) out.all = withCur(first.rec, first.cur);
    if (found.meta && found.snapchat && canonText(found.meta.rec) !== canonText(found.snapchat.rec)) out.plat.snapchat = withCur(found.snapchat.rec, found.snapchat.cur);
    var dev = Object.keys(alertSettings).length ? alertSettings : null;
    if (dev) {
      var others = ['google', 'tiktok'].filter(function (p) { return sourceOf(p); });
      var devSet = withCur(dev, others.length ? sourceCurrency(sourceOf(others[0])) : null);
      if (!first) out.all = devSet;
      else if (canonText(dev) !== canonText(first.rec)) others.forEach(function (p) { out.plat[p] = devSet; });
    }
    // شاف نافذة أول مرة على الجهاز ده قبل كده = منسألهوش تاني
    var seen = welcomeSeenAll();
    if (seen && Object.keys(seen).length) out.asked = true;
    return out;
  }
  // بنستنى: حساب لسه بيتحمّل، أو مفيش حساب متصل خالص، أو منصة متذكَّرة على الجهاز لسه مرجعتش (Meta بترجع لوحدها بعد لحظات) —
  // النقل قبلها كان هيحفظ «قيم البداية» مكان سجل الحساب اللي مقريناهوش. المنصة المتذكَّرة بنستناها ٢٠ ثانية بالكتير
  var MIGRATE_WAIT = 20000, migrateBy = 0;
  function migrateWaiting() {
    if (PLATFORMS.some(function (p) { return loadingPlatforms[p]; }) || !settingsSources().length) return true;
    if (Date.now() >= migrateBy) return false;
    return Object.keys(lastAccounts).some(function (p) { return PLATFORMS.indexOf(p) > -1 && !activeSources[p] && !platformState[p]; });
  }
  function migrateUserSettings() {
    if (migrating || userSetState !== 'migrate' || migrateWaiting()) return;
    migrating = true;
    var found = {}, failed = false;
    var asks = ['meta', 'snapchat'].map(function (p) {
      var source = sourceOf(p);
      if (!source) return Promise.resolve();
      if (!platformTokenOf(p)) { failed = true; return Promise.resolve(); }
      return accountCall('settings.get', source).then(function (res) {
        var rec = plainObject(res && res.settings);
        if (rec) found[p] = { rec: rec, cur: sourceCurrency(source) };
      }, function () { failed = true; });
    });
    Promise.all(asks).then(function () {
      var next = legacyMerge(found);
      migrating = false;
      userSet = normUserSet(next);
      userSetState = 'ready';
      userSetBase = next;
      settingsArrived();
      render();
      // بيتحفظ لو كل القراءات نجحت بس — من غيرها ممكن نحفظ «قيم البداية» مكان سجل حساب مقريناهوش (الجلسة الجاية بتقرا تاني،
      // إلا لو المستخدم حفظ حاجة: ساعتها بيتبعت مع حفظه). «إنشاء لو مش موجود» بس: جهاز تاني سبقنا = بناخد سجله
      if (failed) return;
      writeUserSettings({}).then(function () { settingsRefreshed(); render(); }, function () { /* الجلسة دي بالمنقول، ويتبعت مع أول حفظ */ });
    });
  }
  // الحفظ: المجموعات اللي اتغيّرت بس (changes)، أو العائد المستهدف لـ«كل الحسابات» كقيمة بداية (goals)، أو asked — والسيرفر بيدمجها على
  // السجل الحالي وهو مقفول، ويرجّع السجل كله (settings.ts cleanUserWrite). قبل ٣١ أكتوبر الحفظ كان بالسجل كله من نسخة الجهاز، فجهاز
  // فاتح من بدري كان بيمسح تعديل جهاز تاني من غير ما حد يعرف («التحديث المفقود»)
  function writeUserSettings(body) {
    var req = Object.assign({ action: 'usettings.set' }, body);
    if (userSetBase) req.base = userSetBase;
    userSetGen++;
    userSetInFlight++;
    return syncCall(req).then(function (r) {
      userSetInFlight--;
      userSetGen++;
      var rec = plainObject(r && r.settings);
      if (!rec) throw new Error('bad reply');
      userSetBase = null;
      adoptUserSet(rec);
      dropDeviceSettings();
      return userSet;
    }, function (e) {
      userSetInFlight--;
      userSetGen++;
      throw e;
    });
  }

  var ALERT_FMT = { money: money, currencyLabel: currencyLabel, num: numAr, num2: numAr2, int: function (n) { return ar(Math.round(n || 0)); } };
  var analysis = PauseProofAlerts.analyze([], {}, {}, ALERT_FMT);
  // تحليلين (٣ نوفمبر ٢٠٢٦ — طلب صاحب المنتج: تقييم كل إعلان على فترة البيانات المختارة مش آخر ٧ أيام بس):
  //  - analysis = على الفترة المختارة: الكروت والتفاصيل والمجموعات والحملات وعدّاد الحالات
  //  - analysisNow = على «الآن» (٧ أيام مكتملة + النهارده زي ما كان): صفحة التنبيهات و«يحتاج انتباهك الآن» وسجل المشكلات
  //    (valueSync) — التنبيه عن «أعمل إيه دلوقتي»، والبريد بيتحسب على نفس النافذة على السيرفر، وسجل المشكلات لو تبع الفترة كان
  //    هيقفل مشكلات قايمة كل ما حد يعرض «الشهر الماضي». في «آخر ٧ أيام» الاتنين واحد
  var analysisNow = analysis;

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
    pullUserSettings();
    var bySource = {};
    candidates.forEach(function (c) { if (!bySource[c.source]) bySource[c.source] = settingsFor(c.source); });
    analysisNow = analysis = PauseProofAlerts.analyze(candidates, accountsMeta(), { bySource: bySource }, ALERT_FMT);
    addExtraAlerts(analysisNow);
    if (period.preset === 'last7') return;
    // الإعلانات اللي أيام فترتها وصلت (c.pd) بيتحكم عليها بالفترة، والباقي (طلب الفترة فشل) بحكم «الآن» زي ما كان والحالة بتقول كده
    var withPd = candidates.filter(function (c) { return c.pd && c.pd.dates && c.pd.dates.length; });
    if (!withPd.length) return;
    // نوافذ بطول واحد للكل (المحرّك بياخد طول أطولها — setWindow وبيقرا الأيام من الآخر): حساب بتوقيت تاني ممكن فترته تبقى يوم أقصر
    var len = withPd.reduce(function (m, c) { return Math.max(m, c.pd.dates.length + 1); }, 0);
    var pa = PauseProofAlerts.analyze(withPd.map(function (c) { return periodViewOf(c, len); }), accountsMeta(), { bySource: bySource }, ALERT_FMT, periodEngineOpts());
    var has = {}, byAd = {}, alerts = [];
    withPd.forEach(function (c) { has[c.id] = true; });
    // وسم «عُدّل» حالة دلوقتي مش رقم فترة (زي عمود الحالة في Meta وGoogle Ads: الحالة الحالية أيّاً كان مدى التاريخ) — من «الآن»
    candidates.forEach(function (c) {
      var now = analysisNow.byAd[c.id];
      byAd[c.id] = has[c.id] && pa.byAd[c.id] ? Object.assign({}, pa.byAd[c.id], { editTag: now ? now.editTag || null : null }) : now;
    });
    pa.alerts.forEach(function (a) { if (!a.adId || has[a.adId]) alerts.push(a); });
    analysisNow.alerts.forEach(function (a) { if (a.adId && !has[a.adId] && byAd[a.adId]) alerts.push(a); });
    var health = { review: 0, improve: 0, good: 0, pending: 0, inactive: 0 };
    Object.keys(byAd).forEach(function (id) { if (byAd[id]) health[byAd[id].health]++; });
    analysis = { byAd: byAd, alerts: alerts, summary: { health: health, levels: pa.summary.levels, atRisk: pa.summary.atRisk },
      settings: pa.settings, settingsBySource: Object.assign({}, analysisNow.settingsBySource, pa.settingsBySource), period: true };
  }
  // ---------- تنبيهات البريد اللي محتاجة طلبات زيادة (مراجعة ٨ نوفمبر ٢٠٢٦) ----------
  // صاحب المنتج: «ليست كل التنبيهات العاجلة تصل للايميل… وتأكد من عدم وجود ثغرات تكاملية مع باقي الأداة». العكس كان موجود:
  // «تعديل كبير» (ميزانية اتضاعفت أو نزلت للنص، أو إيقاف عنصر نصيبه ١٠٪ فأكتر) و«التتبّع/الشراء متوقف» بيتبعتوا عاجل بالبريد
  // (runner.ts extraAlerts) ومكانوش بيظهروا في الأداة خالص — والرسالة بتقول «التفاصيل الكاملة في Ads Center». دلوقتي نفس القواعد
  // ونفس البيانات (alerts.js siteAlerts/editAlerts، meta.js metaSiteDays/metaObjectDaily) لـ Meta زي البريد بالظبط، بعد ما
  // سجل التعديلات يوصل (valueActionsArrived). التعديل حدث مش حالة: بيظهر ٢٤ ساعة من وقته (عمر بصمته في البريد). الروابط المعطّلة
  // بيفحصها السيرفر بس (المتصفح ميقدرش يفتح مواقع تانية)، وSnapchat مالوش القواعد دي في البريد لسه — فمش هنا كمان
  var extraInputs = {}, extraAt = {};
  var EXTRA_TTL_MS = 10 * 60000, EDIT_WINDOW_MS = 24 * 3600000;
  var LEVEL_ORDER = { critical: 0, warning: 1, opportunity: 2, info: 3 };
  function eventMs(when) {
    var ms = Date.parse(String(when || '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
    return isFinite(ms) ? ms : 0;
  }
  // «٢٤ سبتمبر ١٦:١٥» بتوقيت الحساب — نفس runner.ts whenText
  function whenText(when, tz) {
    var d = new Date(eventMs(when));
    try {
      var p = {};
      new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
      return fmtKey(p.year + '-' + p.month + '-' + p.day) + ' ' + ar(p.hour + ':' + p.minute);
    } catch (e) { return d.toISOString().slice(0, 16).replace('T', ' '); }
  }
  // بيتنادى لما سجل تعديلات حساب Meta يوصل (بعد ما الإعلانات تكمل): أيام الموقع، وإنفاق العناصر اللي اتعدّلت تعديل كبير في آخر ٢٤ ساعة
  function loadExtraAlerts(source) {
    if (String(source).indexOf('meta:') !== 0 || typeof metaSiteDays !== 'function') return;
    if (extraAt[source] && Date.now() - extraAt[source] < EXTRA_TTL_MS) return;
    extraAt[source] = Date.now();
    var accountId = source.slice(5), info = accountInfo[source] || {}, meta = accountsMeta()[source] || {};
    var tz = meta.timeZone || info.timeZone || BROWSER_TZ, cur = meta.currency || info.currency || null;
    var accSpend = candidates.reduce(function (s, c) { return c.source === source ? s + (c.spend || 0) : s; }, 0);
    var acts = valueActions[source], cutoff = Date.now() - EDIT_WINDOW_MS;
    var edits = ((acts && acts.list) || []).filter(function (a) { return a && (a.kind === 'budget' || a.kind === 'pause') && eventMs(a.time) > cutoff; })
      .map(function (a) { return Object.assign({}, a); });
    var siteP = metaSiteDays(accountId, tz).then(function (d) { return d; }, function () { return null; });
    var editP = !edits.length ? Promise.resolve([]) : (function () {
      var groups = [], today = todayKeyInTz(tz);
      ['campaign', 'adset', 'ad'].forEach(function (l) {
        var ids = edits.filter(function (e) { return e.level === l; }).map(function (e) { return e.id; }).filter(function (id, i, all) { return all.indexOf(id) === i; });
        if (ids.length) groups.push({ level: l, ids: ids });
      });
      return metaObjectDaily(accountId, groups, shiftKey(today, -6), today).then(function (objDaily) {
        edits.forEach(function (e) { e.share = accSpend > 0 ? (objDaily[e.id] || []).reduce(function (s, r) { return s + (r.spend || 0); }, 0) / accSpend : 0; });
        return edits;
      });
    })().catch(function () { return []; });
    Promise.all([siteP, editP]).then(function (r) {
      if (sourceOf('meta') !== source) return;   // الحساب اتغيّر وهي ماشية
      extraInputs[source] = { days: r[0] || [], edits: r[1] || [], cur: cur, tz: tz, accSpend: accSpend, name: meta.label || '' };
      runAnalysis();
      render();
    });
  }
  // التنبيهات نفسها بتتعمل مع كل تحليل (اللغة الحالية، ومن غير طلبات): «التعديل الكبير» على عنصر عليه «توقف أكبر مصدر» منكررهوش (زي
  // runner.ts allUrgent)، والعدّادات والترتيب بالمستوى بيتظبطوا (العاجل الجديد مع العاجل، مش بعد «للعلم»)
  function addExtraAlerts(an) {
    var sources = Object.keys(extraInputs).filter(function (s) { return candidates.some(function (c) { return c.source === s; }); });
    if (!sources.length) return;
    var stopped = {};
    an.alerts.forEach(function (a) { if (a.code === 'top-stopped') stopped[String(a.adId || String(a.objectId || '').replace(/^c:/, ''))] = true; });
    var added = 0;
    sources.forEach(function (source) {
      var x = extraInputs[source], list = [];
      try {
        list = PauseProofAlerts.siteAlerts(x.days, ALERT_FMT);
        if (x.edits.length) {
          var edits = x.edits.map(function (e) { return Object.assign({}, e, { when: whenText(e.time, x.tz) }); });
          list = list.concat(PauseProofAlerts.editAlerts(edits, ALERT_FMT, x.cur, x.accSpend / 7));
        }
      } catch (e) { list = []; }
      list.forEach(function (a) {
        if (a.code === 'big-edit' && stopped[String(a.objectId || '').split('@')[0]]) return;
        a.source = source; a.platform = 'Meta'; a.accountName = x.name; a.currency = x.cur;
        an.alerts.push(a);
        if (an.summary && an.summary.levels && a.level in an.summary.levels) an.summary.levels[a.level]++;
        added++;
      });
    });
    if (added) an.alerts.sort(function (a, b) { return (LEVEL_ORDER[a.level] || 0) - (LEVEL_ORDER[b.level] || 0); });
  }
  // نافذة الفترة للمحرّك: أيام الفترة (c.pd) بنفس شكل النافذة اليومية. آخر خانة عند المحرّك «النهارده» (مبتدخلش الحكم):
  // فترة بتخلص أمس بتاخد النهارده الحقيقي بعدها (قواعد «الآن» بتشوفه زي الأسبوع)، و«اليوم» أو فترة خلصت قبل كده بتاخد خانة فاضية
  // (فيوم «اليوم» نفسه بيتحكم عليه). وكل النوافذ بطول len (أطول فترة + خانة النهارده، و٨ على الأقل — طول الأسبوع اللي المحرّك اتبنى
  // عليه)، والأقصر بيتكمّل بأيام صفر قبلها
  function periodViewOf(c, len) {
    var pd = c.pd, dates = pd.dates.slice(), spend = pd.spend.slice(), res = pd.results.slice(), sales = pd.sales.slice();
    var dd = c.dailyDates || [], n = dd.length, todayKey = n ? dd[n - 1] : null, last = dates[dates.length - 1];
    var endsYesterday = !!todayKey && last === shiftKey(todayKey, -1);
    if (endsYesterday) {
      dates.push(todayKey); spend.push((c.daily || [])[n - 1] || 0); res.push((c.dailyResults || [])[n - 1] || 0); sales.push((c.dailySales || [])[n - 1] || 0);
    } else { dates.push(shiftKey(last, 1)); spend.push(0); res.push(0); sales.push(0); }
    while (dates.length < Math.max(8, len || 0)) { dates.unshift(shiftKey(dates[0], -1)); spend.unshift(0); res.unshift(0); sales.unshift(0); }
    var v = Object.create(c), p = c.period;
    v.daily = spend; v.dailyResults = res; v.dailySales = sales; v.dailyDates = dates;
    // «عُدّل من كام يوم» بيتحسب من آخر خانة (النهارده) — صح بس لو الفترة بتخلص أمس. غير كده جملة التعديل في أساس الحكم كانت هتقول
    // «قبل يومين» لتعديل من ٤ أيام في «الشهر الماضي»، فبتتشال من حكم الفترة (والوسم نفسه من «الآن» — runAnalysis)
    if (!endsYesterday) v.edits = [];
    if (p) { v.spend = p.spend; v.results = p.results; v.sales = p.sales; v.cpr = p.cpr; v.roas = p.roas; v.plat = p.plat || null; }
    return v;
  }
  // الحكم على أرقام الكارت نفسها؟ «آخر ٧ أيام» دايماً، وغيرها لو أيام الفترة وصلت (runAnalysis) — غير كده الحكم على «الآن»
  function judgedOnPeriod(c) { return period.preset === 'last7' || !!(analysis.period && c.pd && c.pd.dates && c.pd.dates.length); }
  // عدد أيام بالعربي السليم: «يوم واحد» و«يومين» من غير رقم، والباقي بالرقم («٧ أيام»، «٣٠ يوماً»)
  function dayCountText(n) { return n === 1 ? t('dx.act.d1') : (n === 2 ? t('dx.act.d2') : ar(n) + ' ' + noun(n, 'n.day')); }
  // سطر أساس الحكم (تحت الحالة في التفاصيل وفي تلميح نقطة الكارت): على أنهي أيام اتحكم على الإعلان. قبل ٣ نوفمبر ٢٠٢٦ كان
  // «آخر ٧ أيام مكتملة» مهما كانت الفترة
  function basisLineOf(c, a) {
    if (a.days) return t('x.basisPeriodEdit', { n: ar(a.days) + ' ' + noun(a.days, 'n.day') });
    if (!judgedOnPeriod(c)) return t('x.basisNow');
    var r = resolvePeriodFor(BROWSER_TZ), today = todayKeyInTz(BROWSER_TZ), pl = { period: periodLabel() };
    if (r.until === today) return r.since === today ? t('x.basisToday') : t('x.basisPeriodToday', pl);
    // قواعد «الآن» (أمس وآخر ٣ أيام) مقفولة في حكم الفترة اللي مبتخلصش أمس أو أقل من ٧ أيام (periodEngineOpts) — بنقول فين تلاقيها
    return t(r.until === shiftKey(today, -1) ? 'x.basisPeriod' : 'x.basisPeriodPast', pl) +
      (period.preset === 'last7' || periodEngineOpts().recent || nowOnlyIssues(c, a).length ? '' : ' ' + t('x.basisPeriodNow'));
  }
  // عبارة الفترة في نصوص التقييم ({wd}) وقواعد «الآن»: شغّالة بس لو الفترة بتخلص أمس وفيها ٧ أيام مكتملة على الأقل
  function periodEngineOpts() {
    var r = resolvePeriodFor(BROWSER_TZ), today = todayKeyInTz(BROWSER_TZ), days = keyDiffDays(r.since, r.until) + 1, phrase;
    if (r.since === today && r.until === today) phrase = t('wd.today');
    else if (r.preset === 'yesterday') phrase = t('wd.yesterday');
    else if (r.preset === 'last14' || r.preset === 'last28' || r.preset === 'last30') phrase = t('wd.last', { n: ar(days) + ' ' + noun(days, 'n.day') });
    else if (r.preset === 'todayYesterday' || r.preset === 'thisWeek' || r.preset === 'lastWeek' || r.preset === 'thisMonth' || r.preset === 'lastMonth') phrase = t('wd.' + r.preset);
    else phrase = t('wd.range', { range: fmtRange(r.since, r.until) });
    return { phrase: phrase, recent: r.until === shiftKey(today, -1) && days >= 7, short: days < 7 };
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

  // وسم تغيّر آخر الأيام (alerts.js trendTag): ▲/▼ مش سهم مايل — السهم المايل بيتقلب مع اتجاه الكتابة، والمثلث لأ
  function trendTagHtml(a, inX) {
    var tt = a.trendTag;
    if (!tt) return '';
    var label = t('tag.trend.' + tt.dir, { n: ar(tt.days) + ' ' + noun(tt.days, 'n.day') });
    return (inX ? ' ' : '') + '<span class="trend-tag trend-' + tt.dir + '"' + (inX ? '' : ' title="' + esc(tt.note) + '"') + '>' +
      (tt.dir === 'up' ? '▲' : '▼') + ' ' + esc(label) + '</span>';
  }
  // ---------- ٣ أرقام في كل الأداة ----------
  // طلب صاحب المنتج ٧ نوفمبر ٢٠٢٦: «في الملخص بيتم المقارنة فقط مع الفترة السابقة فقط، وفي كارت الاعلان يتم المقارنة مع المنصة فقط …
  // فيكون لدينا 3 ارقام في كل الاداة»: الأقرب للمتجر في الفترة (الرقم الكبير)، والأقرب للمتجر في فترة المقارنة (core.js cmpOf)، ورقم المنصة
  // في الفترة (platNumOf). تحت كل رقم في الكروت سطرين، وفي التفاصيل جدول بالتلاتة، وفي الملخص سطر المنصة تحت سطر المقارنة
  var NUM_FMT = {
    spend: function (p, cur) { return money(p.spend, cur); },
    results: function (p) { return p.results != null ? fmtNum(p.results) : '—'; },
    cpr: function (p, cur) { return p.cpr != null ? money(p.cpr, cur) : '—'; },
    sales: function (p, cur) { return money(p.sales, cur); },
    roas: function (p) { return roasStr(p.roas); }
  };
  // مدى فترة المقارنة اللي اتجابت أرقامها (للتلميح)
  function cmpRangeText(source) {
    var e = cmpStore[source], k = e && e.key ? e.key.split(':') : null;
    return k ? fmtRange(k[0], k[1]) : '';
  }
  // cs = { state, p } (cmpOf أو مجموع حملة): … = لسه بيتحمّل، و— = مش متاح. pl = أرقام المنصة في الفترة. الرقم نفسه مبيتقصش أبداً: لو
  // الخلية ضيقة (كارت الحملة، والإنجليزي أطول) بينزل سطر تحت اسمه بدل «Comparison: …» (فحص بصري ٨ نوفمبر ٢٠٢٦)
  function subLine(k, v, tip, vars) {
    var parts = t(k, Object.assign({ v: '\u0000' }, vars || {})).split('\u0000');
    return '<span class="card-stat-s" title="' + esc(tip) + '">' + esc(parts[0]) + '<b class="card-stat-n">' + esc(v) + '</b>' + esc(parts[1] || '') + '</span>';
  }
  function statSubs(key, cs, pl, cur, source, platName) {
    var out = '';
    if (cs && cs.state) {
      var range = cmpRangeText(source);
      var tip = cs.state === 'failed' ? t('card.cmpFailed') : (range ? t('card.cmpTip', { range: range }) : t('card.cmpTipNone'));
      out += subLine('card.cmp', cs.state === 'ok' ? NUM_FMT[key](cs.p, cur) : (cs.state === 'failed' ? '—' : '…'), tip, { label: cmpLabel() });
    }
    if (pl) out += subLine('card.plat', NUM_FMT[key](pl, cur), t('card.platTip', { plat: platName }));
    return out;
  }
  // خلية رقم — مكوّن واحد لكارت الإعلان والمجموعة والحملة
  function statCell(key, value, label, cls, title, cs, pl, cur, source, platName) {
    return '<span class="card-stat' + cls + '" title="' + esc(title) + '"><b class="card-stat-v">' + value + '</b><span class="card-stat-k">' + esc(label) + '</span>' +
      statSubs(key, cs, pl, cur, source, platName) + '</span>';
  }
  // مجموع فترة المقارنة لإعلانات حملة أو مجموعة: إعلان واحد مش متاح = المجموع كله مش متاح، ولسه بيتحمّل = لسه (مجموع ناقص = رقم غلط)
  function groupCmp(g) {
    var state = 'ok', spend = 0, sales = 0, results = 0, resOk = g.results != null;
    for (var i = 0; i < g.ads.length; i++) {
      var x = cmpOf(g.ads[i]);
      if (!x.state) return { state: null, p: null };
      if (x.state === 'failed') return { state: 'failed', p: null };
      if (x.state === 'loading') { state = 'loading'; continue; }
      spend += x.p.spend || 0; sales += x.p.sales || 0;
      if (periodOf(g.ads[i]).results == null) continue;
      if (x.p.results == null) resOk = false; else results += x.p.results;
    }
    return state === 'ok' ? { state: 'ok', p: buildPeriod(spend, resOk ? results : null, sales) } : { state: state, p: null };
  }
  // رقم المنصة لإعلانات حملة أو مجموعة في الفترة — نفس الإعلانات اللي في أرقام الكارت
  function groupPlat(g) {
    var spend = 0, sales = 0, results = 0;
    g.ads.forEach(function (c) {
      var p = platNumOf(c);
      spend += p.spend || 0; sales += p.sales || 0;
      if (periodOf(c).results != null) results += p.results || 0;
    });
    return buildPeriod(spend, g.results != null ? results : null, sales);
  }
  function cardChips(c) {
    // الأرقام للفترة المختارة، وتلوينها من الحكم لو الحكم على نفس الأرقام (judgedOnPeriod — من ٣ نوفمبر ٢٠٢٦ الحكم بيتبع الفترة).
    // لو الحكم على «الآن» (أيام الفترة موصلتش) مفيش تلوين — عشان رقم ٣٠ يوم ميتلوّنش أحمر بسبب حاجة حصلت أمس بس
    var p = periodOf(c);
    var hl = function (metric) { return judgedOnPeriod(c) ? mv(c, metric) : ''; };
    // لون خفيف (أخضر/أحمر) على تكلفة النتيجة أو العائد من التقييم (tones في alerts.js) — لو مفيش ملاحظة ملوّنة عليه أصلاً
    var tn = function (metric) {
      var v = judgedOnPeriod(c) && !mv(c, metric) ? (adAnalysis(c).tones || {})[metric] : 0;
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
    // وتحت كل رقم: الأقرب للمتجر في فترة المقارنة ورقم المنصة في الفترة (٣ أرقام — statSubs)
    var cs = cmpOf(c), pn = platNumOf(c);
    var stat = function (key, value, label, cls, title) { return statCell(key, value, label, cls, title, cs, pn, c.currency, c.source, c.platform); };
    var cells = [stat('spend', money(p.spend, c.currency), t('chip.spend'), hl('spend'), t('chip.spend') + tip)];
    if (p.results != null) cells.push(stat('results', fmtNum(p.results), resultLabelOf(c), hl('results'), t('chip.results') + tip));
    // تكلفة النتيجة (زي تكلفة الطلب CPO) والعائد (ROAS) الاتنين بيظهروا لو موجودين — كل واحد بيجاوب سؤال مختلف:
    // التكلفة مقارنةً بهامش ربحك، والعائد مقارنةً بالمبيعات
    if (p.cpr != null) cells.push(stat('cpr', money(p.cpr, c.currency), t('card.k.cpr', { one: resultNounOf(c, 1) }), hl('cpr') + tn('cpr'), t('chip.cprTip') + tip + tnTip('cpr')));
    if (p.roas != null || hl('roas')) cells.push(stat('roas', roasStr(p.roas), t('chip.roas'), hl('roas') + tn('roas'), t('chip.roasTip') + tip + tnTip('roas')));
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
    // أساس الحكم (على أنهي أيام) في التلميح — نفس سطر التفاصيل
    var dotTitle = h.label + (c.active ? ' — ' + basisLineOf(c, a) : '');
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
            // تحسّن أو تراجع آخر ٣ أيام مكتملة أيّاً كان حكم الأسبوع (طلب صاحب المنتج ٣ نوفمبر) — الجملة في التفاصيل وفي التلميح
            trendTagHtml(a) +
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
    return !showStopped && filters.health === 'all' && !filters.text && !filters.campaign && !filters.adset &&
      candidates.some(function (c) { return c.active; });
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
      if (filters.adset && adsetKey(c) !== filters.adset) return false;
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
  var VIEW_MODES = { ads: 1, adsets: 1, campaigns: 1 };
  var viewMode = (function () { try { var v = localStorage.getItem(VIEW_KEY); return VIEW_MODES[v] ? v : 'ads'; } catch (e) { return 'ads'; } })();
  function campaignKey(c) { return (c.source || c.platform) + '|' + (c.campaignId || c.campaignName || '-'); }
  // المجموعة الإعلانية: المستوى الأوسط زي كل المنصات (Meta وSnapchat وGoogle ثلاثة مستويات). Google بيسمّيها adGroup
  // وSnapchat ad squad — بيتوحّدوا على adsetId في ملفات المنصات. الإعلان اللي مالوش مجموعة (Performance Max) بيتجمع
  // تحت حملته: كده مجموع عرض المجموعات = مجموع عرض الحملات بالظبط (Kimball — المجموع = مجموع اللي تحته)
  function adsetKey(c) {
    var src = c.source || c.platform;
    if (c.adsetId) return src + '|s:' + c.adsetId;
    if (c.adsetName) return src + '|n:' + (c.campaignId || c.campaignName || '-') + '|' + c.adsetName;
    return src + '|c:' + (c.campaignId || c.campaignName || '-');
  }
  function groupCampaigns(ads) { return groupLevel(ads, 'campaign'); }
  function groupAdsets(ads) { return groupLevel(ads, 'adset'); }
  function groupLevel(ads, kind) {
    var keyOf = kind === 'adset' ? adsetKey : campaignKey;
    var map = {}, list = [];
    // عدد إعلانات كل حملة (من غير فلاتر) وتنبيهات كل إعلان — بيتحسبوا مرة واحدة هنا.
    // قبل كده كل حملة كانت بتلف على كل الإعلانات وكل التنبيهات، فالحساب الكبير كان بيتقل مع كل ضغطة
    var totals = {}, alertsByAd = {};
    candidates.forEach(function (x) { var k = keyOf(x); totals[k] = (totals[k] || 0) + 1; });
    analysis.alerts.forEach(function (al) {
      if (!al.adId) return;
      var e = alertsByAd[al.adId] || (alertsByAd[al.adId] = { urgent: 0, important: 0 });
      if (al.level === 'critical') e.urgent++; else if (al.level === 'warning') e.important++;
    });
    ads.forEach(function (c) {
      var key = keyOf(c);
      var g = map[key];
      if (!g) {
        var isSet = kind === 'adset';
        g = map[key] = { key: key, kind: kind, name: isSet ? (c.adsetName || c.campaignName) : c.campaignName,
          campName: isSet ? c.campaignName : null, noSet: isSet && !c.adsetId && !c.adsetName,
          platform: c.platform, currency: c.currency, ads: [], total: totals[key] || 0 };
        list.push(g);
      }
      g.ads.push(c);
    });
    list.forEach(function (g) {
      var spend = 0, sales = 0, results = 0, keys = {}, judgedSpend = 0, reviewSpend = 0, improveSpend = 0;
      g.active = 0; g.urgent = 0; g.important = 0; g.health = {};
      g.ads.forEach(function (c) {
        var p = periodOf(c), a = adAnalysis(c);
        spend += p.spend || 0; sales += p.sales || 0;
        if (p.results != null) { results += p.results; keys[c.resultKey || 'generic'] = true; }
        if (c.active) g.active++;
        g.health[a.health] = (g.health[a.health] || 0) + 1;
        // بأرقام الحكم نفسها: الفترة لو الحكم عليها (كان إنفاق الأسبوع دايماً — إعلان سيئ صرف كتير الشهر اللي فات ومصرفش الأسبوع ده
        // مكانش بيدخل في لون حملته في «الشهر الماضي»)
        var sp = (judgedOnPeriod(c) ? p.spend : c.spend) || 0;
        judgedSpend += sp;
        if (a.health === 'review') reviewSpend += sp;
        if (a.health === 'improve') improveSpend += sp;
      });
      // عدد التنبيهات من نفس حكم كروت الإعلانات اللي جوّاها (فيها كمان تنبيهات الحساب المربوطة بإعلان، زي تركيز الميزانية). في «آخر ٧ أيام»
      // ده نفس رقم صفحة التنبيهات، وفي غيرها رقم الفترة زي باقي الكارت (صفحة التنبيهات على «الآن» — runAnalysis)
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
      // (نفس أيام التقييم) تبقى حمرا. إعلان صغير عليه مشكلة ميلوّنش الحملة كلها
      var share = function (x) { return judgedSpend > 0 ? x / judgedSpend : 0; };
      if (!g.active && !g.health.review) g.status = 'inactive';
      else if (judgedSpend > 0 ? share(reviewSpend) >= 0.3 : g.health.review) g.status = 'review';
      else if (judgedSpend > 0 ? share(reviewSpend + improveSpend) >= 0.3 : g.health.improve) g.status = 'improve';
      // كل إعلاناتها الشغّالة «لم يُحكم بعد» = الحملة نفسها لسه مفيش حكم عليها
      else if (!g.health.good && !g.health.improve && !g.health.review && g.health.pending) g.status = 'pending';
      else g.status = 'good';
      if (kind === 'campaign') {
        var setKeys = {};
        g.ads.forEach(function (c) { setKeys[adsetKey(c)] = 1; });
        g.sets = Object.keys(setKeys).length;
      }
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
  // مكوّن واحد للحملة والمجموعة الإعلانية (اتساق — مبدأ نيلسن الرابع): نفس الأرقام ونفس الألوان ونفس حالة الصحة
  function campaignMarkup(g) {
    var h = HEALTH[g.status];
    var isSet = g.kind === 'adset';
    var name = g.name || t(isSet ? 'adset.noName' : 'camp.noName');
    // حملة Performance Max كارت واحد على مستوى الحملة — «١ إعلان» كانت هتبقى غلط
    var pmaxOnly = g.ads.every(function (c) { return c.campaignLevel; });
    var count = isSet && g.noSet ? t('adset.none') : pmaxOnly ? t('camp.pmax')
      : g.ads.length < g.total
        ? t('camp.adsOf', { n: ar(g.ads.length), total: ar(g.total), ads: noun(g.total, 'n.ad') })
        : ar(g.total) + ' ' + noun(g.total, 'n.ad');
    // نفس شبكة أرقام كارت الإعلان بالأرقام التلاتة (٧ نوفمبر ٢٠٢٦ — كانت سطر شرائح من غير مقارنة): مجموع إعلاناتها في الفترة، وفي فترة
    // المقارنة (groupCmp)، ورقم المنصة (groupPlat)
    var gc = groupCmp(g), gp = groupPlat(g), src = g.ads[0] && g.ads[0].source, tip = ' — ' + periodLabel();
    var cell = function (key, value, label, title) { return statCell(key, value, label, '', title, gc, gp, g.currency, src, g.platform); };
    var chips = cell('spend', money(g.spend, g.currency), t('chip.spend'), t('chip.spend') + tip);
    if (g.results != null) chips += cell('results', fmtNum(g.results), t('res.' + (g.resultKey || 'generic')), t('chip.results') + tip);
    else if (g.mixedResults) chips += '<span class="card-stat"><b class="card-stat-v">—</b><span class="card-stat-k">' + esc(t('camp.mixedResults')) + '</span></span>';
    if (g.cpr != null) chips += cell('cpr', money(g.cpr, g.currency), t('card.k.cpr', { one: I18N.resultNoun(1, g.resultKey) }), t('chip.cprTip') + tip);
    if (g.roas != null) chips += cell('roas', roasStr(g.roas), t('chip.roas'), t('chip.roasTip') + tip);
    var issues = [];
    if (g.urgent) issues.push('<span class="camp-badge lv-critical">' + t('camp.urgent', { n: ar(g.urgent) }) + '</span>');
    if (g.important) issues.push('<span class="camp-badge lv-warning">' + t('camp.important', { n: ar(g.important) }) + '</span>');
    if (!issues.length) issues.push('<span class="camp-badge-none">' + t('camp.noIssues') + '</span>');
    var ek = esc(g.key);
    return '<article class="campaign-card' + (isSet ? ' adset-card' : '') + ' ' + h.cls + '" ' + (isSet ? 'data-adset' : 'data-campaign') + '="' + ek + '"' +
        ' tabindex="0" role="button" aria-label="' + esc(name) + ' — ' + h.label + '">' +
        '<div class="camp-top"><span class="health-dot-inline"></span><span class="camp-platform">' + esc(g.platform) + '</span>' +
          '<span class="camp-active">' + t('camp.activeOf', { a: ar(g.active), n: ar(g.ads.length) }) + '</span></div>' +
        '<div class="camp-name" dir="auto" title="' + esc(name) + '">' + esc(name) + '</div>' +
        // المجموعة تحتها حملتها الأم — عشان تلاقيها في المنصة زي ما هي
        (isSet && g.campName ? '<div class="camp-parent" dir="auto" title="' + esc(g.campName) + '">' + esc(t('adset.inCamp', { name: g.campName })) + '</div>' : '') +
        '<div class="camp-count">' + count + '</div>' +
        '<div class="card-stats">' + chips + '</div>' +
        '<div class="camp-issues">' + issues.join('') + '</div>' +
        // التنقّل زي المنصة: الحملة ← مجموعاتها. الضغطة الأساسية بتفضل على إعلاناتها («اعرض الحملة» في الملخص وفي
        // أسباب الحكم بيعتمدوا عليها)، والزرار بيظهر بس لما الحملة فيها أكتر من مجموعة — غير كده مفيش فايدة من خطوة زيادة
        '<div class="camp-open">' + t('camp.showAds') +
          (!isSet && g.sets > 1 ? '<button type="button" class="camp-sets" data-campaign-sets="' + ek + '">' + t('camp.showSets') + '</button>' : '') +
        '</div>' +
      '</article>';
  }
  function setViewMode(mode) {
    viewMode = VIEW_MODES[mode] ? mode : 'ads';
    try { localStorage.setItem(VIEW_KEY, viewMode); } catch (e) { /* مش مهم */ }
    // الرجوع لمستوى أعلى بيلغي ترشيح اللي تحته: الحملات بتلغي الحملة والمجموعة، والمجموعات بتلغي المجموعة بس
    if (viewMode === 'campaigns') { filters.campaign = null; filters.campaignName = null; }
    if (viewMode !== 'ads') { filters.adset = null; filters.adsetName = null; }
    render();
  }
  document.getElementById('viewSwitch').addEventListener('click', function (e) {
    var b = e.target.closest('[data-mode]'); if (!b) return;
    setViewMode(b.dataset.mode);
  });
  // كارت المجموعة ← إعلاناتها
  function openAdset(el) {
    var key = el.getAttribute('data-adset');
    var c = candidates.filter(function (x) { return adsetKey(x) === key; })[0];
    filters.adset = key;
    filters.adsetName = (c && (c.adsetName || c.campaignName)) || null;
    viewMode = 'ads';
    showView('ads');
    render();
    window.scrollTo({ top: 0 });
  }
  // كارت الحملة ← مجموعاتها (زرار جوه الكارت)
  function openCampaignSets(el) {
    var key = el.getAttribute('data-campaign-sets');
    var c = candidates.filter(function (x) { return campaignKey(x) === key; })[0];
    filters.campaign = key;
    filters.campaignName = (c && c.campaignName) || null;
    setViewMode('adsets');
    showView('ads');
    window.scrollTo({ top: 0 });
  }
  function openCampaign(el) {
    var key = el.getAttribute('data-campaign');
    var g = candidates.filter(function (c) { return campaignKey(c) === key; })[0];
    filters.campaign = key;
    filters.campaignName = (g && g.campaignName) || null;
    // إعلانات الحملة كلها: ترشيح مجموعة قديم (من حملة تانية) لازم يتشال
    filters.adset = null; filters.adsetName = null;
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
    renderAccountPicker();
    // الحملة اللي في الرابط (js/route.js) بتتطبّق أول ما إعلاناتها توصل — قبل السطر اللي تحت ما يشيلها
    if (typeof routeBeforeRender === 'function') routeBeforeRender();
    // لو الحملة اللي كنت فاتحها مش موجودة تاني (بدّلت الحساب مثلاً) الفلتر بيتشال لوحده
    if (filters.campaign && !candidates.some(function (c) { return campaignKey(c) === filters.campaign; })) filters.campaign = null;
    if (filters.adset && !candidates.some(function (c) { return adsetKey(c) === filters.adset; })) { filters.adset = null; filters.adsetName = null; }
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
    } else if (viewMode === 'adsets') {
      // زي الحملات بالظبط: المجموعة = مجموع كل إعلاناتها اللي ليها أرقام في الفترة بالمتوقفة
      var setAds = sortCandidates(visibleCandidates(true), filters.sort);
      var sets = sortCampaigns(groupAdsets(setAds), filters.sort);
      cardGrid.innerHTML = sets.length
        ? sets.slice(0, renderLimit).map(campaignMarkup).join('') + moreButton(renderLimit, sets.length, true)
        : '<div class="empty-state" style="grid-column:1/-1">' + t('gallery.noMatch') + '</div>';
      galleryCount.textContent = t('gallery.countAdsets', { n: ar(sets.length), sets: noun(sets.length, 'n.adset'), m: ar(setAds.length), ads: noun(setAds.length, 'n.ad') });
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
  function dxKpiHtml(k, label) {
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
      '<div class="dx-kpi-sub">' + esc(t('dx.kpi.prev', { label: label || cmpLabel(), v: k.prev })) + '</div>' +
      (k.plat != null ? '<div class="dx-kpi-sub">' + esc(t('dx.kpi.plat', { v: k.plat })) + '</div>' : '') + '</div>';
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

  // ---------- الملخص التلقائي بالبريد (اختياري — supabase/functions/sync/digest.ts) ----------
  // من ٣١ أكتوبر ٢٠٢٦ لكل مستخدم (قرار صاحب المنتج: «اجعلها لكل مستخدم ملخص خاص به»): ملخص واحد لحساب الدخول — بريده ومواعيده —
  // فيه الحسابات اللي اختارها (لحد ٥)، وبيتبعت بإعدادات التنبيهات بتاعته. التفعيل والإضافة بالحساب المفتوح وإثبات الوصول ليه (digestProof
  // تحت). لما حساب في الملخص يتفتح بنجدده بهدوء، و«فصل» منصة بيخرّج حساباتها من الملخص ويحذف صلاحياتها (سياسة الخصوصية، البند ٧).
  // المنصات: Meta (المرحلة ١) وSnapchat (المرحلة ٢)، وGoogle بعدها. أقصى عدد لكل منصة (٣١ أكتوبر ٢٠٢٦: «اكبر عدد ممكن للحسابات لكل
  // منصة... المهم انه لا يحصل بينهم تعارض») — نفس supabase/functions/sync/digest.ts MAX_PER_PLATFORM
  var DIGEST_MAX = { meta: 20, snapchat: 10 };
  function digestFresh() {
    return { status: 'idle', data: null, editing: false, confirmOff: false, confirmRemove: null, busy: false, msg: null, msgErr: false, draft: null };
  }
  var digestUi = digestFresh();
  var digestRefreshed = {};
  // الحساب في ملخص المستخدم ولا لأ (من رد digest.refresh أو digest.get): true / false، ولو مش معروف مفيش مفتاح. digestHas = عنده ملخص أصلاً.
  // التلميح بيظهر بس لما نكون متأكدين إن الحساب مش في الملخص — عشان منطلبش من حد يضيف حاجة موجودة
  var digestKnown = {}, digestHas = null;
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
  // الحسابات المفتوحة اللي ينفع تتضاف للملخص، بإثبات الوصول ليها: Meta = مفتاح الجلسة (السيرفر بيبدّله بمفتاح طويل)، وSnapchat (من ٣١ أكتوبر
  // ٢٠٢٦ — «واجعل الملخص لكل المنصات») = النسخة المقفولة من مفتاح التجديد اللي على الجهاز (core.js sealedFor) — بتتحفظ مشفّرة تاني على
  // الخادم ومتتفتحش غير في الـ Worker (api/digest-fetch.js). Meta الأول: التفعيل بأول حساب مفتوح، والباقي بزرار «أضف»
  var DIGEST_ID = { meta: /^act_\d{1,30}$/, snapchat: /^[0-9a-f-]{36}$/i };
  function digestOpen() {
    return ['meta', 'snapchat'].map(function (p) { return { platform: p, accountId: activeSources[p] }; }).filter(function (o) {
      return DIGEST_ID[o.platform].test(o.accountId || '') && (o.platform === 'meta' ? !!metaAccessToken() : !!sealedFor(o.platform));
    });
  }
  // مفتاح الحساب في digestKnown و«لاحقاً»: رقم Meta لوحده (زي قبل ٣١ أكتوبر — اللي ضغط «لاحقاً» ميتسألش تاني)، وغيره بالمنصة
  function digestKey(platform, accountId) { return platform === 'meta' ? accountId : platform + ':' + accountId; }
  // أول حساب مفتوح (التفعيل بيه، وحالته في digest.get)
  function digestAccount() { return digestOpen()[0] || null; }
  function digestTz(platform, accountId) {
    return (platform === 'snapchat' ? valueTzOf['snapchat:' + accountId] : (accountInfo['meta:' + accountId] || {}).timeZone) || '';
  }
  // إثبات الوصول لحساب على المنصة دي (المفتوح لو مفيش رقم): Meta = مفتاح الجلسة، Snapchat = النسخة المقفولة واسم الحساب وتوقيته (الخادم
  // مبيقدرش يفتحها يتأكد منهم — Snapchat نفسها بترفض في أول فحص لو مفيش صلاحية). الاتنين لدخول المنصة كله مش لحساب واحد
  function digestProof(platform, accountId) {
    var id = accountId || activeSources[platform];
    if (!DIGEST_ID[platform] || !DIGEST_ID[platform].test(id || '')) return null;
    if (platform === 'meta') { var token = metaAccessToken(); return token ? { token: token, accountId: id } : null; }
    var sealed = sealedFor(platform), o = (platformOptions[platform] || []).filter(function (x) { return x.value === id; })[0];
    return sealed ? { platform: platform, accountId: id, sealed: sealed, name: o ? acctName(o.label) : null, timezone: digestTz(platform, id) || null } : null;
  }
  // الطلبات اللي محتاجة إثبات الوصول (enable وadd وrefresh) بتاخد إثبات حساب المنصة دي (platform) — والباقي بدخول الأداة بس
  function digestCall(action, extra, platform) {
    var body = Object.assign({ action: action }, extra || {});
    if (platform) {
      var proof = digestProof(platform);
      if (!proof) { var e = new Error('no session'); e.code = 'session'; return Promise.reject(e); }
      Object.assign(body, proof);
    }
    return syncCall(body);
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
    return t(c === 'email' ? 'dx.auto.err.email' : c === 'days' ? 'dx.auto.err.days' : c === 'too many' ? 'dx.auto.err.tooMany'
      : (c === 'session' || c === 'not verified') ? 'dx.auto.err.session' : 'dx.auto.err.generic');
  }
  // اسم الحساب في القائمة: من الحسابات المحمّلة في الأداة لو موجود، وإلا اللي رجع من السيرفر، وإلا رقمه
  function digestAcctName(a) {
    var o = (platformOptions[a.platform] || []).filter(function (x) { return x.value === a.accountId; })[0];
    return (o && acctName(o.label)) || a.name || a.accountId;
  }
  function digestAccountsHtml(d) {
    var u = digestUi, list = d.accounts || [];
    if (!list.length) return '';
    return '<div class="dx-auto-accts"><p class="dx-auto-label">' + esc(t('dx.auto.accounts', { n: ar(list.length) })) + '</p><ul>' +
      list.map(function (a) {
        var key = a.platform + ':' + a.accountId, confirm = u.confirmRemove === key;
        var warn = a.tokenProblem ? '<span class="dx-auto-warn">' + esc(t('dx.auto.acctProblem')) + '</span>' : '';
        return '<li><span class="dx-auto-acct">' + esc(PLATFORM_NAMES[a.platform] || a.platform) + ' — <bdi>' + esc(digestAcctName(a)) + '</bdi></span>' + warn +
          (confirm
            ? '<span class="dx-auto-confirm">' + esc(t(list.length === 1 ? 'dx.auto.removeLast' : 'dx.auto.removeQ')) +
              ' <button type="button" class="ghost-btn" data-digest-remove-yes="' + esc(key) + '"' + (u.busy ? ' disabled' : '') + '>' + esc(t('dx.auto.removeYes')) + '</button>' +
              '<button type="button" class="ghost-btn" data-digest-remove-no>' + esc(t('dx.auto.offNo')) + '</button></span>'
            : '<button type="button" class="dx-fb-link" data-digest-remove="' + esc(key) + '">' + esc(t('dx.auto.remove')) + '</button>') + '</li>';
      }).join('') + '</ul></div>';
  }
  function digestPanelHtml() {
    var u = digestUi, d = u.data || {}, s = d.settings, open = digestOpen(), first = open[0] || null;
    var tz = (s && s.timezone) || (first ? digestTz(first.platform, first.accountId) : '');
    var msg = u.msg ? '<p class="dx-auto-msg' + (u.msgErr ? ' err' : '') + '" role="status">' + esc(u.msg) + '</p>' : '';
    if (u.status === 'loading') return '<p>' + esc(t('dx.auto.loading')) + '</p>';
    if (u.status === 'error') {
      return '<p class="dx-auto-msg err" role="status">' + esc(u.msg || t('dx.auto.err.generic')) + '</p>' +
        '<div class="dx-auto-actions"><button type="button" class="ghost-btn" data-digest-retry>' + esc(t('dx.auto.retry')) + '</button></div>';
    }
    if (s && s.enabled && !u.editing) {
      var html = '<p class="dx-auto-on"><strong>' + esc(t('dx.auto.onLabel')) + '</strong> ' +
        esc(t('dx.auto.on', { email: s.email, days: digestDaysText(s.days), hour: digestHourText(s.hour), tz: tz })) + '</p>' + digestAccountsHtml(d);
      // الحسابات المفتوحة: صلاحية أولها (لو في الملخص)، وزرار إضافة لكل واحد مش فيه — أو رسالة الحد لو منصته مليانة
      open.forEach(function (o, i) {
        var mine = (d.accounts || []).filter(function (a) { return a.platform === o.platform && a.accountId === o.accountId; })[0];
        var max = DIGEST_MAX[o.platform] || 0;
        if (mine) {
          if (i > 0) return;
          var cur = d.current && d.current.accountId === o.accountId ? d.current : null;
          if (cur && cur.tokenWorks === false) html += '<p class="dx-auto-msg err">' + esc(t('dx.auto.problem', { platform: PLATFORM_NAMES[o.platform] || o.platform })) + '</p>';
          else if (mine.tokenExpiresAt) html += '<p>' + esc(t('dx.auto.expires', { date: fmtKey(String(mine.tokenExpiresAt).slice(0, 10)) })) + '</p>';
        } else if ((d.accounts || []).filter(function (a) { return a.platform === o.platform; }).length >= max) {
          html += '<p class="dx-auto-msg">' + esc(t('dx.auto.full', { platform: PLATFORM_NAMES[o.platform] || o.platform, max: ar(max) })) + '</p>';
        } else {
          html += '<div class="dx-auto-actions"><button type="button" class="ghost-btn" data-digest-add="' + o.platform + '"' + (u.busy ? ' disabled' : '') + '>' +
            esc(t('dx.auto.add', { name: accountLabel(o.platform) })) + '</button></div>';
        }
      });
      html += u.confirmOff
        ? '<p>' + esc(t('dx.auto.offConfirm')) + '</p><div class="dx-auto-actions">' +
          '<button type="button" class="ghost-btn" data-digest-off-yes' + (u.busy ? ' disabled' : '') + '>' + esc(t('dx.auto.offYes')) + '</button>' +
          '<button type="button" class="ghost-btn" data-digest-off-no>' + esc(t('dx.auto.offNo')) + '</button></div>'
        : '<div class="dx-auto-actions"><button type="button" class="ghost-btn" data-digest-edit>' + esc(t('dx.auto.edit')) + '</button>' +
          '<button type="button" class="ghost-btn" data-digest-off>' + esc(t('dx.auto.off')) + '</button></div>';
      return html + msg;
    }
    // من غير ملخص: التفعيل محتاج حساب مفتوح من منصة بيقراها الملخص (Meta أو Snapchat)
    if (!u.editing && !first) return '<p>' + esc(t('set.page.digestNoMeta')) + '</p>' + msg;
    // النموذج: تفعيل جديد أو تعديل. المسودة بتحفظ اللي العميل كتبه لو ظهرت رسالة خطأ
    var curv = u.draft || (u.editing && s ? { email: s.email, days: s.days, hour: s.hour } : { email: '', days: [0, 3], hour: 9 });
    var days = [0, 1, 2, 3, 4, 5, 6].map(function (i) {
      var on = curv.days.indexOf(i) > -1;
      return '<button type="button" class="dx-fb-reason' + (on ? ' on' : '') + '" data-digest-day="' + i + '" aria-pressed="' + on + '">' + esc(t('dx.auto.d' + i)) + '</button>';
    }).join('');
    var hours = '';
    for (var h = 0; h < 24; h++) hours += '<option value="' + h + '"' + (h === curv.hour ? ' selected' : '') + '>' + esc(digestHourText(h)) + '</option>';
    var form = '<p>' + esc(t(u.editing ? 'dx.auto.introEdit' : 'dx.auto.intro', { name: first ? accountLabel(first.platform) : '' })) + '</p>' +
      '<label class="dx-auto-field">' + esc(t('dx.auto.email')) +
      '<input type="email" id="dxAutoEmail" autocomplete="email" dir="ltr" maxlength="254" value="' + esc(curv.email || '') + '"></label>' +
      '<div class="dx-auto-field" role="group" aria-label="' + esc(t('dx.auto.days')) + '">' + esc(t('dx.auto.days')) + '<div class="dx-auto-days">' + days + '</div></div>' +
      '<label class="dx-auto-field">' + esc(t('dx.auto.hour')) + '<select id="dxAutoHour">' + hours + '</select></label>' +
      (tz ? '<p>' + esc(t('dx.auto.tz', { tz: tz })) + '</p>' : '');
    if (!u.editing) {
      form += '<label class="dx-auto-consent"><input type="checkbox" id="dxAutoConsent"' + (curv.consent ? ' checked' : '') + '><span>' +
        esc(t('dx.auto.consent')) + ' <a href="/privacy" target="_blank" rel="noopener">' + esc(t('dx.auto.privacy')) + '</a></span></label>';
    }
    form += '<div class="dx-auto-actions"><button type="button" class="ghost-btn" data-digest-save' + (u.busy ? ' disabled' : '') + '>' +
      esc(t(u.editing ? 'dx.auto.save' : 'dx.auto.enable')) + '</button>' +
      (u.editing ? '<button type="button" class="ghost-btn" data-digest-cancel>' + esc(t('dx.auto.cancel')) + '</button>' : '') + '</div>';
    return form + msg;
  }
  // الحسابات المفتوحة اللي البطاقة اترسمت عليها — لو اتغيّرت (حساب أو منصة) البطاقة بتتعاد
  function digestOpenSig() { return digestOpen().map(function (o) { return o.platform + ':' + o.accountId; }).join(','); }
  // البطاقة في «الإعدادات» وتلميح التفعيل في الملخص: بيتنادى مع كل رسم للملخص ومع فتح صفحة الإعدادات.
  // الصندوق نفسه مش بيتعاد رسمه هنا (عشان ميمسحش اللي العميل بيكتبه)، وحالته بتتجاب من السيرفر أول ما الصفحة تتفتح بس
  function renderDigest() {
    var card = document.getElementById('digestCard'), panel = document.getElementById('dxAuto'), hint = document.getElementById('dxAutoHint');
    if (!card || !panel) return;
    // ?digest=0 بيخفيها على الجهاز ده (DIGEST_ON في core.js)
    card.hidden = !DIGEST_ON;
    var note = document.getElementById('digestCardNote');
    if (note) note.textContent = t('set.page.digestFor');
    panel.hidden = !DIGEST_ON;
    if (DIGEST_ON && currentView === 'settings') {
      if (digestUi.status === 'idle') digestLoad();
      else if (!panel.firstChild || panel.getAttribute('data-acct') !== digestOpenSig()) renderDigestPanel();
    }
    // تلميح التفعيل أو الإضافة: حساب مفتوح مش في ملخص المستخدم (أكيد)، ومحدش ضغط «لاحقاً» عليه قريب
    if (hint) {
      var target = DIGEST_ON ? digestOpen().filter(function (o) {
        var k = digestKey(o.platform, o.accountId);
        return digestKnown[k] === false && !digestHintSnoozed(k);
      })[0] : null;
      var key = target ? (isAr() ? 'ar' : 'en') + (digestHas ? '+' : '') + '|' + digestKey(target.platform, target.accountId) : '';   // بيتعاد رسمه لما يظهر أو يختفي أو اللغة تتغير بس
      if (hint.getAttribute('data-k') !== key) {
        hint.setAttribute('data-k', key);
        hint.setAttribute('data-for', target ? digestKey(target.platform, target.accountId) : '');
        hint.hidden = !target;
        hint.innerHTML = target ? '<p>' + esc(t(digestHas ? 'dx.auto.hintAdd' : 'dx.auto.hint')) + '</p><span class="dx-auto-actions">' +
          '<button type="button" class="ghost-btn" data-digest-hint-on>' + esc(t(digestHas ? 'dx.auto.hintAddOn' : 'dx.auto.hintOn')) + '</button>' +
          '<button type="button" class="ghost-btn" data-digest-hint-later>' + esc(t('dx.auto.hintLater')) + '</button></span>' : '';
      }
    }
  }
  function renderDigestPanel() {
    var panel = document.getElementById('dxAuto');
    if (!panel || panel.hidden) return;
    panel.setAttribute('data-acct', digestOpenSig());
    panel.innerHTML = digestPanelHtml();
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
  // حالة الملخص اللي رجعت من السيرفر: الحسابات اللي فيه بتتعلّم (التلميح بيعرف منها الحساب المفتوح جواه ولا لأ)
  function digestAdopt(res) {
    digestUi.data = Object.assign({}, digestUi.data || {}, res || {});
    var s = res && res.settings;
    digestHas = !!(s && s.enabled !== false);
    var inDigest = {};
    ((res && res.accounts) || []).forEach(function (a) { if (DIGEST_ID[a.platform]) inDigest[digestKey(a.platform, a.accountId)] = true; });
    Object.keys(digestKnown).forEach(function (k) { digestKnown[k] = !!inDigest[k]; });
    Object.keys(inDigest).forEach(function (k) { digestKnown[k] = true; });
    digestOpen().forEach(function (o) { var k = digestKey(o.platform, o.accountId); digestKnown[k] = !!inDigest[k]; });
  }
  function digestLoad() {
    digestUi.status = 'loading';
    digestUi.msg = null;
    renderDigestPanel();
    var first = digestAccount();
    digestCall('digest.get', first ? (first.platform === 'meta' ? { accountId: first.accountId } : { platform: first.platform, accountId: first.accountId }) : {}).then(function (res) {
      digestAdopt(res);
      digestUi.status = 'ready';
      renderDigestPanel();
      renderDigest();
      digestFocus();
    }, function (e) {
      digestUi.status = 'error';
      digestUi.msg = digestErrText(e);
      renderDigestPanel();
    });
  }
  // أي عملية بتغيّر الملخص: الزرار مشغول، والرد (حالة الملخص كلها) بيترسم برسالة نجاح أو سبب الفشل.
  // platform = المنصة اللي إثبات حسابها المفتوح بيتبعت مع الطلب (enable وadd)، وإلا null
  function digestRun(action, extra, platform, okKey, after) {
    if (digestUi.busy) return;
    digestUi.busy = true;
    digestUi.msg = null;
    renderDigestPanel();
    digestCall(action, extra, platform).then(function (res) {
      digestUi.busy = false;
      digestUi.editing = false;
      digestUi.draft = null;
      digestUi.confirmOff = false;
      digestUi.confirmRemove = null;
      if (res && (res.settings !== undefined || res.accounts)) digestAdopt(res);
      if (after) after(res);
      digestUi.msg = okKey ? t(okKey) : null;
      digestUi.msgErr = false;
      renderDigestPanel();
      renderDigest();
    }, function (e) {
      digestUi.busy = false;
      digestUi.msg = digestErrText(e);
      digestUi.msgErr = true;
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
    var extra = { email: email, days: days, hour: hour, lang: isAr() ? 'ar' : 'en' };
    if (!editing) extra.consent = true;
    var first = digestAccount();
    digestRun(editing ? 'digest.update' : 'digest.enable', extra, editing ? null : (first ? first.platform : 'meta'), editing ? 'dx.auto.updated' : 'dx.auto.saved');
  }
  function digestOff() {
    var open = digestOpen();
    digestRun('digest.disable', {}, null, 'dx.auto.stopped', function () {
      digestUi.data = { settings: null, accounts: [] };
      digestHas = false;
      Object.keys(digestKnown).forEach(function (k) { digestKnown[k] = false; });
      // أوقفه بنفسه — التلميح ميرجعش يطلب منه التفعيل على طول
      open.forEach(function (o) { digestHintSnooze(digestKey(o.platform, o.accountId)); });
    });
  }
  // لما حساب يتفتح (meta.js لـ Meta، وsnapchat.js لـ Snapchat): لو في ملخص المستخدم، السيرفر بيجدد صلاحيته المحفوظة (مرة في الجلسة) —
  // بتفضل صالحة طول ما العميل بيستخدم الأداة (Snapchat: ٦٠ يوم من آخر فتح)
  function digestAutoRefresh(accountId, platform) {
    platform = platform || 'meta';
    var k = digestKey(platform, accountId);
    if (!DIGEST_ON || !DIGEST_ID[platform] || !DIGEST_ID[platform].test(accountId || '') || digestRefreshed[k]) return;
    var proof = digestProof(platform, accountId);
    if (!proof) return;
    digestRefreshed[k] = true;
    // الرد بيقول كمان الحساب في الملخص ولا لأ، والمستخدم عنده ملخص أصلاً — ده اللي بيقرر تلميح التفعيل أو الإضافة (من غير طلب زيادة)
    syncCall(Object.assign({ action: 'digest.refresh' }, proof)).then(function (res) {
      if (res && typeof res.enabled === 'boolean') {
        digestKnown[k] = res.enabled;
        if (typeof res.hasDigest === 'boolean') digestHas = res.hasDigest; else if (res.enabled) digestHas = true;
        renderDigest();
      }
    }, function () { digestRefreshed[k] = false; });
  }
  // «فصل» منصة: حساباتها بتخرج من ملخص المستخدم وصلاحياتها بتتمسح. لو الاتصال فشل، رابط الإيقاف في آخر كل رسالة بيوقفه
  function digestDisconnect(platform) {
    digestRefreshed = {};
    digestKnown = {};
    digestHas = null;
    digestUi = digestFresh();
    syncCall(platform && platform !== 'meta' ? { action: 'digest.disconnect', platform: platform } : { action: 'digest.disconnect' }).catch(function () { /* رابط الإيقاف */ });
  }
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    var el;
    // «فعّلها الآن» أو «أضف الحساب» في الملخص: صفحة «الإعدادات» على بطاقة الملخص التلقائي
    if (e.target.closest('[data-digest-hint-on]')) {
      digestUi.wantFocus = true;
      goView('settings');
      if (digestUi.status === 'error') digestLoad();
      digestFocus();
      return;
    }
    if ((el = e.target.closest('[data-digest-hint-later]'))) {
      var hintEl = el.closest('#dxAutoHint'), forKey = hintEl && hintEl.getAttribute('data-for');
      if (forKey) digestHintSnooze(forKey);
      renderDigest();
      return;
    }
    if (!e.target.closest('#dxAuto')) return;
    if ((el = e.target.closest('[data-digest-day]'))) {
      var on = !el.classList.contains('on');
      el.classList.toggle('on', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    } else if (e.target.closest('[data-digest-save]')) digestSave();
    else if ((el = e.target.closest('[data-digest-add]'))) digestRun('digest.add', {}, el.getAttribute('data-digest-add') || 'meta', 'dx.auto.added');
    else if ((el = e.target.closest('[data-digest-remove]'))) { digestUi.confirmRemove = el.getAttribute('data-digest-remove'); digestUi.msg = null; renderDigestPanel(); }
    else if (e.target.closest('[data-digest-remove-no]')) { digestUi.confirmRemove = null; renderDigestPanel(); }
    else if ((el = e.target.closest('[data-digest-remove-yes]'))) {
      var key = el.getAttribute('data-digest-remove-yes'), cut = key.indexOf(':');
      digestRun('digest.remove', { platform: key.slice(0, cut), accountId: key.slice(cut + 1) }, null, 'dx.auto.removed', function (res) {
        if (res && res.stopped) { digestUi.data = { settings: null, accounts: [] }; digestHas = false; digestUi.msg = null; }
      });
    }
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
  // المختارة = تتشال (ولو اتشالت كلها = «كل المنصات»). لو الإضافة هتخلّي الاختيار = كل المنصات بنروح للمنصة دي لوحدها (ملاحظته
  // ٢٥ أكتوبر: «عند الضغط على سناب شات بعد ميتا ينتقل لكل المنصات… التنقل من ميتا لسناب شات») — «كل المنصات» من زرارها بس،
  // والجمع بيفضل لو فيه منصة تالتة (ميتا وسناب شات من غير جوجل). اختيار واحد للصفحة كلها (قراره: «تتبع الاختيار»):
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
    else platSel = platSel.length + 1 >= all.length ? [p] : platSel.concat([p]);
    if (platSel) platSel = all.filter(function (x) { return platSel.indexOf(x) > -1; });
    if (platSel && (!platSel.length || platSel.length === all.length)) platSel = null;
  }
  // عملة الأرقام المجمّعة (قراره: «بسعر الربط الرسمي، وأضف اختياراً في الإعدادات لتحديد العملة»): المحفوظة على الجهاز، وإلا
  // عملة الأكبر مبلغاً بين اللي بيتجمعوا (بالدولار للمقارنة). أرقام الحساب الواحد بتفضل بعملته زي منصته
  var CUR_PREF_KEY = 'acc.currency';
  // من ٣١ أكتوبر في سجل المستخدم (prefs.currency) — بيتبعه على أي جهاز؛ ونسخة الجهاز للحظة قبل ما السجل يوصل
  function curPref() {
    var p = settingsKnown() && userSet.prefs && 'currency' in userSet.prefs ? userSet.prefs.currency : undefined;
    if (p !== undefined) return p && DX.pegRate(p, 'USD') ? p : null;
    try { var v = localStorage.getItem(CUR_PREF_KEY); return v && DX.pegRate(v, 'USD') ? v : null; } catch (e) { return null; }
  }
  function setCurPref(v) {
    var ok = !!(v && DX.pegRate(v, 'USD'));
    try { if (ok) localStorage.setItem(CUR_PREF_KEY, v); else localStorage.removeItem(CUR_PREF_KEY); } catch (e) { /* مش مهم */ }
    if (settingsKnown()) {
      userSet.prefs = Object.assign({}, userSet.prefs || {}, { currency: ok ? v : null });
      writeUserSettings({ changes: { prefs: { currency: ok ? v : null } } }).then(function () { render(); }, function () {});
    }
  }
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
      // العائد المستهدف من إعدادات التنبيهات (نفس اللي بيتحكم بيه على الإعلانات) — الربح أولاً في الملخص كمان
      // plat = رقم المنصة نفسها لكل خانة (٣ أرقام في كل الأداة — ٧ نوفمبر ٢٠٢٦)
      o = DX.compose(dxState.report, { target: dxGoals(), plat: dxPlatTotals(), cmpLabel: cmpLabel() });
      // أكتر من حساب كلهم من غير مشتريات: العنوان بصيغة الجمع
      if (o && dxState.sel && dxState.sel.multi && dxState.report.status === 'noPurchases' && o.title === t('dx.head.noPurchases')) {
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
    var lines = (nums ? storeLines(dxViewPlatforms()) : []).concat(costVsMax(dxShownPlats()));
    document.getElementById('dxToday').innerHTML = lines.map(function (l) { return '<p>' + esc(l.text) + '</p>'; }).join('');
    // بين قوسين مش «·» — النقطة جنب الأرقام العربية بتتقري «٠»
    // «أيام مكتملة» بتتقال بس لو الفترتين كده: فترة مقارنة فيها النهارده مش مكتملة
    var full = lines.some(function (l) { return l.today; }) && !(dxState.report && dxState.report.lens && dxState.report.lens.prevOpen);
    period.textContent = nums ? o.period + (full ? ' (' + t('dx.fullDays') + ')' : '') : '';
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
      (nums ? '<div class="dx-kpis">' + o.kpis.map(function (k) { return dxKpiHtml(k, o.cmpLabel); }).join('') + '</div>' : '') +
      // شرح الألوان بيظهر بس لو فيه رقم ملوّن (على الهاتف مفيش تلميح بالماوس)
      (nums && o.kpis.some(function (k) { return k.goodUp != null && (k.sig || k.soft); }) ? '<p class="dx-kpi-legend">' + esc(t('dx.kpi.legend')) + '</p>' : '') +
      (nums && o.kpiNote ? '<p class="dx-kpi-legend">' + esc(o.kpiNote) + '</p>' : '') + '</div>';
    renderVerdict(o);
    renderDxMore(o, renderTopAlerts(o));
  }
  // سبب الحكم ظاهر بلون الحكم بين الأرقام والتنبيهات (ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦: كان مطوي تحت «تفاصيل الحكم»
  // ومكانه مش واضح) — والشرح المطوي تحت مبيكررهوش (renderDxMore)
  // من ٢٥ أكتوبر ٢٠٢٦ «لماذا تغيّرت مبيعاتك؟» (diagnosis.js reshapeVerdict): العنوان من البلوك، وزرار لإعلانات كل حملة من أكبر المساهمين
  function renderVerdict(o) {
    var el = document.getElementById('dxVerdict');
    if (!el) return;
    var b = o && o.main >= 0 ? o.blocks[o.main] : null;
    // مفيش حاجة تتقال غير أرقام الخانات (المبيعات زي ما هي ومفيش سياق): مفيش صندوق — العنوان والأرقام كفاية
    if (b && !(b.lines || []).length && !(b.bullets || []).length && !(b.after || []).length && !b.check) b = null;
    el.innerHTML = b ? '<div class="dx-verdict ' + esc(o.tone) + '"><p class="dx-verdict-title">' + esc(b.verdictTitle || t('dx.verdict.title')) + '</p>' +
      withMovers(dxBlockHtml(b, o.main, true), b) + '</div>' : '';
  }
  // أزرار إعلانات الحملات تحت سطر «أكثر ما ساهم…» على طول (فحص حي ٢٦ أكتوبر: كانت في آخر الصندوق بعد سؤال التقييم)
  function withMovers(html, b) {
    var btns = verdictMoversHtml(b);
    if (!btns) return html;
    var pre = ['down', 'up'].map(function (d) { return t('dx.drv.movers.' + d, { list: '\u0000' }).split('\u0000')[0]; });
    var line = (b.lines || []).filter(function (l) { return pre.some(function (p) { return l.indexOf(p) === 0; }); })[0];
    var at = line ? html.indexOf('<p>' + esc(line) + '</p>') : -1;
    if (at < 0) return html.replace(/<\/article>$/, btns + '</article>');
    at += ('<p>' + esc(line) + '</p>').length;
    return html.slice(0, at) + btns + html.slice(at);
  }
  function verdictMoversHtml(b) {
    var mv = b.movers;
    if (!mv || mv.dim !== 'campaign') return '';
    var btns = mv.list.map(function (x) {
      var camp = candidates.filter(function (c) { return DX.segHas({ dim: 'campaign', key: x.key }, c); })[0];
      var name = String((camp && camp.campaignName) || x.name || '');
      // الاسم معزول الاتجاه (أسماء إنجليزي جوه نص عربي كانت بتتقلب على الزرار)
      return camp ? '<button type="button" class="ghost-btn" data-campaign="' + esc(campaignKey(camp)) + '" title="' + esc(name) + '">' +
        esc(t('dx.drv.open', { name: '⁨' + (name.length > 40 ? name.slice(0, 39) + '…' : name) + '⁩' })) + '</button>' : '';
    }).join('');
    return btns ? '<div class="dx-movers">' + btns + '</div>' : '';
  }
  document.getElementById('dxVerdict').addEventListener('click', function (e) {
    var el = e.target.closest('[data-campaign]');
    if (el) openCampaign(el);
  });
  // منصات العرض الظاهر في الملخص («كل المنصات» = المنصات اللي اتجمعت فيه — من غير اللي مفيش مشتريات بتوصلها) — null = مفيش
  // عروض، كل الإعلانات
  // مستهدف العرض: حساب واحد = إعداداته. «كل المنصات» = المستهدف المشترك لو كل الحسابات متفقة عليه، وإلا مفيش سطر مستهدف
  // (مستهدف متجر على عائد مجمّع من حسابين بهامشين مختلفين = حكم غلط)
  function dxGoals() {
    // منصات أرقام المبيعات بس (اللي مفيش مشتريات بتوصلها برّه — dxSelection)
    var goals = ((dxState.sel && dxState.sel.plats) || dxViewPlatforms() || []).map(function (p) {
      var s = PauseProofAlerts.mergeSettings(settingsFor(sourceOf(p) || ''));
      return { roas: s.roasTarget };
    });
    var g = goals[0];
    if (!g || !(g.roas > 0)) return null;
    return goals.every(function (x) { return x.roas === g.roas; }) ? g : null;
  }
  // المنصات المختارة المتصلة (شريط الأرقام وسطر النهارده والتكلفة مقابل الحد) — null = كل الإعلانات
  function dxViewPlatforms() { return platSel ? platSel.slice() : null; }
  // المنصات اللي أرقامها في الملخص الظاهر فعلاً: «كل المنصات» (platSel = null) = منصات التقرير نفسه (dxSelection — اللي فيها مبيعات)،
  // وإلا المتصلة. مراجعة ٨ نوفمبر ٢٠٢٦: من ٢٥ أكتوبر (a749cbc — «كل المنصات» افتراضياً) العرض الافتراضي كان بيبعت null، فسطر رقم المنصة
  // وسطر «التكلفة مقابل الحد» مكانوش بيظهروا خالص لحساب بمنصة واحدة — في البريد بس
  function dxShownPlats() { return platSel ? platSel.slice() : ((dxState.sel && dxState.sel.plats) || connectedPlats()).slice(); }
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
      return k === 'purchase' ? DX.ordersText(map[k]) : I18N.countPhrase(map[k], k, fmtNum);
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
    // النهارده بيظهر لوحده لو مش جوه الفترة المختارة (آخر ٧ أيام وأمس… — ١٠ أكتوبر ٢٠٢٦). الفترة اللي فيها النهارده أرقامها بتشمله
    if (resolvePeriodFor(BROWSER_TZ).until < todayKeyInTz(BROWSER_TZ)) {
      var spend = {}, res = {};
      mine.forEach(function (c) {
        var d = c.daily || [], n = d.length - 1;   // آخر يوم في أرقام الإعلان = النهارده بتوقيت حسابه
        if (n < 0) return;
        spend[c.currency || ''] = (spend[c.currency || ''] || 0) + (d[n] || 0);
        var r = (c.dailyResults || [])[n] || 0, k = c.resultKey || 'generic';
        if (r > 0) res[k] = (res[k] || 0) + r;
      });
      // فترة مقارنة فيها النهارده: «لا يدخل في المقارنة» كانت هتبقى غلط (فحص حي ٧ نوفمبر)
      var inCmp = dxState.report && dxState.report.lens && dxState.report.lens.prevOpen;
      out.push({ today: true, text: t(inCmp ? 'dx.todayCmp' : 'dx.today', { parts: DX.listText([t('dx.todaySpend', { v: moneyByCur(spend) })].concat(resultTexts(res))) }) });
    }
    var pc = platCompare(dxShownPlats());
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
  // من ٧ نوفمبر ٢٠٢٦ الأرقام نفسها جوه كل خانة (dxPlatTotals) والسطر ده بيقول ليه رقم المنصة أعلى بس. منصة واحدة: من المحرك نفسه
  // (diagnosis.js DX.platCompare — نفس السطر في رسالة البريد والنص المنسوخ)، وأكتر من منصة: مجموعهم قصاد مجموع الملخص
  function platCompare(platforms) {
    if (!platforms || !platforms.length) return null;
    if (platforms.length === 1) {
      var p = platforms[0], S = dxState.sources[p], inp = S && S.input;
      var tx = inp ? DX.platCompare(inp, p) : null;
      return tx ? { text: tx } : null;
    }
    var pl = dxPlatTotals(), r = dxState.report;
    return pl && r && r.cur && Math.round(pl.pur) > Math.round(r.cur.pur) ? { text: t('dx.platWhyAll') } : null;
  }
  // رقم المنصة نفسها لعرض الملخص الظاهر (diagnosis.js platTotals لكل منصة مختارة) بعملة التقرير — نفس تحويل الأرقام (dxSelection).
  // منصة من غير رقم = null: مجموع ناقص هيبقى رقم غلط
  function dxPlatTotals() {
    var sel = dxState.sel, S = dxState.sources;
    if (!sel || !sel.plats || !sel.plats.length || !window.DX || !DX.platTotals) return null;
    var to = sel.conv && sel.conv.to, sum = { pur: 0, rev: 0 };
    for (var i = 0; i < sel.plats.length; i++) {
      var x = S[sel.plats[i]] && S[sel.plats[i]].input, tot = x ? DX.platTotals(x, sel.plats[i]) : null;
      if (!tot) return null;
      var rate = to && x.currency !== to ? DX.pegRate(x.currency, to) : 1;
      if (!rate) return null;
      sum.pur += tot.pur; sum.rev += tot.rev * rate;
    }
    return sum;
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


  // ---------- اختيار فترة البيانات (زي منتقي التاريخ في Meta وSnapchat — قياس حي ٧ نوفمبر ٢٠٢٦) ----------
  // زرار واحد بيقول الفترة المطبّقة والمقارنة، وبيفتح لوحة: الفترات الجاهزة، وتقويم بشهرين بنختار عليه الفترة بضغطتين، و«من/إلى» (الفترة
  // الجاهزة بتملاهم بأيامها)، و«قارن مع» بنفس خيارات Meta. «تطبيق» بيقفل اللوحة والزرار بيقول اللي اتطبّق — قبل كده الفترة المخصصة
  // كانت بتسيب صندوق التاريخ وزرار «تطبيق» ظاهرين كأنها متطبّقتش (ملاحظة صاحب المنتج). «إلغاء» أو Esc أو الضغط برّه = من غير تغيير
  var periodBtn = document.getElementById('periodBtn'), periodPanel = document.getElementById('periodPanel');
  var periodPresets = document.getElementById('periodPresets'), periodError = document.getElementById('periodError');
  var cmpMode = document.getElementById('cmpMode'), calMonths = document.getElementById('calMonths');
  var cmpFrom = document.getElementById('cmpFrom'), cmpTo = document.getElementById('cmpTo');
  var pendingPreset = period.preset;   // الفترة الجاهزة المختارة في اللوحة قبل «تطبيق»
  var pendingCmp = null;               // خيار «قارن مع» قبل «تطبيق» — null = الافتراضي حسب الفترة (cmpModeFor)
  var calFirst = null, calTarget = 'main', calPick = null;   // أول شهر ظاهر، والتقويم بيختار أنهي فترة، وأول ضغطة في اختيار المدى
  // اسم الفترة على الزرار: الجاهزة باسمها وأيامها، والمخصصة بأيامها بس
  function periodBtnText(r, w) {
    var days = fmtCompared(r.since, r.until, w || r);
    return r.preset === 'custom' ? days : PERIOD_LABELS[r.preset] + ' · ' + days;
  }
  // فترة المقارنة اللي ملخص المتجر بيقارن بيها (diagnosis.js windowsFor) — للفترة pp والمقارنة cc (أو المطبّقتين)
  function compareRangeFor(pp, cc) {
    if (!window.DX || !DX.compareWindow) return null;
    var d = dxPeriodFor(BROWSER_TZ, pp, cc);
    return DX.compareWindow(d.since, d.until, { unit: d.unit, cmp: d.cmp });
  }
  function compareRangeText(w, r) { return t('period.vs', { range: fmtCompared(w.since, w.until, r) }); }
  function syncPeriodUi() {
    var r = resolvePeriodFor(BROWSER_TZ), w = compareRangeFor();
    document.getElementById('periodBtnMain').textContent = periodBtnText(r, w);
    document.getElementById('periodBtnCmp').textContent = w ? compareRangeText(w, r) : '';
    var today = todayKeyInTz(BROWSER_TZ);
    [dateFrom, dateTo, cmpFrom, cmpTo].forEach(function (el) { el.max = today; });
  }
  // اللوحة بتتملا بالمطبّق وقت ما بتتفتح، وأي تغيير جوّاها مؤقت لحد «تطبيق»
  function pendingPeriodValue() {
    return pendingPreset === 'custom' ? { preset: 'custom', since: dateFrom.value, until: dateTo.value } : { preset: pendingPreset };
  }
  function renderPeriodPanel() {
    periodPresets.querySelectorAll('[data-preset]').forEach(function (b) {
      var on = b.getAttribute('data-preset') === pendingPreset;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    var mode = pendingCmp || cmpModeFor(pendingPreset, null), custom = mode === 'custom';
    cmpMode.value = mode;
    var w = custom ? null : compareRangeFor(pendingPeriodValue(), { mode: mode });
    document.getElementById('cmpRange').textContent = w ? fmtCompared(w.since, w.until, { since: dateFrom.value || w.since, until: dateTo.value || w.until }) : '';
    document.getElementById('cmpDates').hidden = !custom;
    renderCal(w);
  }
  // التقويم: شهرين جنب بعض (الهاتف: التاني بس). ضغطة أولى = بداية الفترة، وتانية = نهايتها، والأيام اللي لسه مجتش مقفولة
  function calShow(key) { var k = shiftMonths(key.slice(0, 8) + '01', -1); calFirst = k; }
  function calMonthHtml(first, main, cmp, today) {
    var p = first.split('-').map(Number), lead = new Date(Date.UTC(p[0], p[1] - 1, 1)).getUTCDay(), days = new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
    var html = '<div class="cal-month"><div class="cal-title">' + esc(monthsShort()[p[1] - 1] + ' ' + ar(p[0])) + '</div><div class="cal-grid">';
    t('cal.days').split(',').forEach(function (d) { html += '<span class="cal-wd">' + esc(d) + '</span>'; });
    for (var i = 0; i < lead; i++) html += '<span></span>';
    for (var n = 1; n <= days; n++) {
      var key = first.slice(0, 8) + (n < 10 ? '0' : '') + n, cls = 'cal-day';
      var inMain = main && key >= main.since && key <= main.until, inCmp = cmp && key >= cmp.since && key <= cmp.until;
      if (inCmp) cls += ' cmp';
      if (inMain) cls += ' on';
      if (inMain && (key === main.since || key === main.until)) cls += ' edge';
      else if (inCmp && (key === cmp.since || key === cmp.until)) cls += ' cmp-edge';
      if (key === today) cls += ' now';
      html += '<button type="button" class="' + cls + '" data-d="' + key + '" aria-label="' + esc(fmtKey(key)) + '" aria-pressed="' + (inMain ? 'true' : 'false') + '"' + (key > today ? ' disabled' : '') + '>' + ar(n) + '</button>';
    }
    return html + '</div></div>';
  }
  function renderCal(w) {
    var today = todayKeyInTz(BROWSER_TZ), main = dateFrom.value && dateTo.value ? { since: dateFrom.value, until: dateTo.value } : null;
    var cmp = cmpMode.value === 'custom' ? (cmpFrom.value && cmpTo.value ? { since: cmpFrom.value, until: cmpTo.value } : null) : w;
    if (!calFirst) calShow(dateTo.value || today);
    var second = shiftMonths(calFirst, 1);
    calMonths.innerHTML = calMonthHtml(calFirst, main, cmp, today) + calMonthHtml(second, main, cmp, today);
    document.getElementById('calNext').disabled = second >= today.slice(0, 8) + '01';
  }
  function pickPreset(preset) {
    pendingPreset = preset;
    calPick = null; calTarget = 'main';
    if (preset !== 'custom') { var r = resolvePeriodFor(BROWSER_TZ, { preset: preset }); dateFrom.value = r.since; dateTo.value = r.until; calShow(r.until); }
    periodError.hidden = true;
    renderPeriodPanel();
  }
  function openPeriodPanel() {
    var r = resolvePeriodFor(BROWSER_TZ);
    pendingPreset = r.preset;
    dateFrom.value = r.since; dateTo.value = r.until;
    var custom = compare.mode === 'custom';
    pendingCmp = compare.mode === 'prev' ? null : compare.mode;
    cmpFrom.value = custom ? compare.since : ''; cmpTo.value = custom ? compare.until : '';
    calPick = null; calTarget = 'main'; calShow(r.until);
    periodError.hidden = true;
    renderPeriodPanel();
    periodPanel.classList.remove('hidden');
    periodBtn.setAttribute('aria-expanded', 'true');
    var sel = periodPresets.querySelector('[aria-checked="true"]');
    if (sel) sel.focus();
  }
  function closePeriodPanel(focusBtn) {
    if (periodPanel.classList.contains('hidden')) return;
    periodPanel.classList.add('hidden');
    periodBtn.setAttribute('aria-expanded', 'false');
    if (focusBtn) periodBtn.focus();
  }
  periodBtn.addEventListener('click', function () {
    if (periodPanel.classList.contains('hidden')) openPeriodPanel(); else closePeriodPanel(false);
  });
  periodPresets.addEventListener('click', function (e) {
    var b = e.target.closest('[data-preset]');
    if (b) pickPreset(b.getAttribute('data-preset'));
  });
  // الأسهم بين الفترات الجاهزة (مجموعة اختيار واحد — WAI-ARIA radiogroup)
  periodPresets.addEventListener('keydown', function (e) {
    var keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (!keys[e.key]) return;
    e.preventDefault();
    var list = Array.prototype.slice.call(periodPresets.querySelectorAll('[data-preset]'));
    var i = list.findIndex(function (b) { return b.getAttribute('data-preset') === pendingPreset; });
    var step = keys[e.key] * (document.documentElement.dir === 'rtl' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') ? -1 : 1);
    var next = list[(i + step + list.length) % list.length];
    pickPreset(next.getAttribute('data-preset'));
    next.focus();
  });
  // تعديل التاريخ بإيدك = فترة مخصصة (زي Google Ads)
  [dateFrom, dateTo].forEach(function (el) {
    el.addEventListener('input', function () { pendingPreset = 'custom'; periodError.hidden = true; renderPeriodPanel(); });
  });
  // «مخصصة» بتبدأ من مدى الخيار اللي كان ظاهر، والتقويم بعدها بيختار فترة المقارنة
  cmpMode.addEventListener('change', function () {
    var was = document.getElementById('cmpRange').textContent ? compareRangeFor(pendingPeriodValue(), { mode: pendingCmp || cmpModeFor(pendingPreset, null) }) : null;
    pendingCmp = cmpMode.value;
    if (pendingCmp === 'custom') {
      calTarget = 'cmp'; calPick = null;
      if (was && !cmpFrom.value) { cmpFrom.value = was.since; cmpTo.value = was.until; }
    } else calTarget = 'main';
    periodError.hidden = true;
    renderPeriodPanel();
  });
  [cmpFrom, cmpTo].forEach(function (el) {
    el.addEventListener('input', function () { pendingCmp = 'custom'; periodError.hidden = true; renderPeriodPanel(); });
    el.addEventListener('focus', function () { calTarget = 'cmp'; calPick = null; });
  });
  [dateFrom, dateTo].forEach(function (el) { el.addEventListener('focus', function () { calTarget = 'main'; calPick = null; }); });
  calMonths.addEventListener('click', function (e) {
    var b = e.target.closest('[data-d]');
    if (!b || b.disabled) return;
    var d = b.getAttribute('data-d'), from = calTarget === 'cmp' ? cmpFrom : dateFrom, to = calTarget === 'cmp' ? cmpTo : dateTo;
    if (!calPick) { calPick = d; from.value = d; to.value = d; }
    else { from.value = d < calPick ? d : calPick; to.value = d < calPick ? calPick : d; calPick = null; }
    if (calTarget === 'cmp') pendingCmp = 'custom'; else pendingPreset = 'custom';
    periodError.hidden = true;
    renderPeriodPanel();
    var again = calMonths.querySelector('[data-d="' + d + '"]');
    if (again) again.focus();
  });
  document.getElementById('calPrev').addEventListener('click', function () { calFirst = shiftMonths(calFirst, -1); renderPeriodPanel(); });
  document.getElementById('calNext').addEventListener('click', function () { calFirst = shiftMonths(calFirst, 1); renderPeriodPanel(); });
  document.getElementById('periodCancel').addEventListener('click', function () { closePeriodPanel(true); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePeriodPanel(true); });
  // الضغط برّه اللوحة بيقفلها (composedPath زي قايمة الحسابات: العنصر ممكن يتشال من الصفحة قبل ما الضغطة توصل هنا)
  document.addEventListener('click', function (e) {
    if (periodPanel.classList.contains('hidden')) return;
    var path = e.composedPath ? e.composedPath() : [];
    if (path.indexOf(periodPanel) > -1 || path.indexOf(periodBtn) > -1) return;
    closePeriodPanel(false);
  });
  function showPeriodError(m) { periodError.textContent = m; periodError.hidden = false; }
  // فترة مخصصة: مترتبة، مش في المستقبل، وأقصاها ٩٣ يوم — عشان اسم الفترة على الأرقام يطابق البيانات. وMeta مبتديش أرقام أقدم
  // من ٣٧ شهراً (ردها نفسه: «(#3018) The start date of the time range cannot be beyond 37 months from the current date») وملخص المتجر
  // بيجيب فترات قبلها للمقارنة (DX.windows) — فبنقدّم البداية لحد ما الفترة واللي قبلها يدخلوا (مراجعة المرحلة ٤، ١٨ أكتوبر ٢٠٢٦)
  // أقدم يوم Meta بترجّع أرقامه (٣٧ شهر)
  function metaOldestKey(today) {
    var lim = new Date(today + 'T00:00:00Z');
    lim.setUTCMonth(lim.getUTCMonth() - 37);
    return shiftKey(lim.toISOString().slice(0, 10), 1);
  }
  function customPeriodOf(since, until) {
    var today = todayKeyInTz(BROWSER_TZ), out = { trimmed: false, tooOld: false };
    if (since > until) { var tmp = since; since = until; until = tmp; }
    if (until > today) until = today;
    if (since > until) since = until;
    out.trimmed = keyDiffDays(since, until) > PERIOD_MAX_DAYS - 1;
    if (out.trimmed) since = shiftKey(until, -(PERIOD_MAX_DAYS - 1));
    if (activeSources.meta && window.DX && DX.windows) {
      var oldest = metaOldestKey(today);
      var ws = DX.windows(since, until), first = ws[ws.length - 1].since;
      if (first < oldest) {
        var len = keyDiffDays(since, until);
        since = shiftKey(since, keyDiffDays(first, oldest)); until = shiftKey(since, len);
        if (until > today) until = today;
        out.tooOld = true;
      }
    }
    out.period = { preset: 'custom', since: since, until: until };
    return out;
  }
  // تغيير الفترة بيعيد تحميل كل الحسابات المتصلة بالأرقام الجديدة (ولو فيه نسخة محفوظة للفترة دي بتظهر فوراً)
  function applyPeriod(next) {
    period = next;
    savePeriod();
    syncPeriodUi();
    Object.keys(activeSources).forEach(function (p) { loadSource(p, activeSources[p]); });
    render();
  }
  // المقارنة لوحدها: ملخص المتجر وأرقام فترة المقارنة في الكروت بس بيتجابوا تاني (أرقام الفترة زي ما هي)
  function applyCompare(next) {
    compare = next;
    saveCompare();
    syncPeriodUi();
    Object.keys(dxReloaders).forEach(function (p) { if (activeSources[p]) dxReloaders[p](); });
    Object.keys(cmpLoaders).forEach(function (p) { if (activeSources[p] && typeof cmpLoaders[p] === 'function') cmpLoaders[p](); });
    render();
  }
  document.getElementById('periodApply').addEventListener('click', function () {
    if (!dateFrom.value || !dateTo.value) { showPeriodError(t('period.pickDates')); return; }
    // الفترة الجاهزة لو أيامها هي اللي في «من/إلى»، وإلا مخصصة (التاريخ اتعدّل بإيده)
    var pr = pendingPreset !== 'custom' ? resolvePeriodFor(BROWSER_TZ, { preset: pendingPreset }) : null;
    var custom = !pr || dateFrom.value !== pr.since || dateTo.value !== pr.until ? customPeriodOf(dateFrom.value, dateTo.value) : null;
    var nextPeriod = custom ? custom.period : { preset: pendingPreset };
    var nextCompare = { mode: pendingCmp || 'prev' }, today = todayKeyInTz(BROWSER_TZ);
    if (nextCompare.mode === 'custom') {
      if (!cmpFrom.value || !cmpTo.value) { showPeriodError(t('period.cmpPickDates')); return; }
      var cs = cmpFrom.value, cu = cmpTo.value;
      if (cs > cu) { var tmp = cs; cs = cu; cu = tmp; }
      if (cu > today) cu = today;
      if (keyDiffDays(cs, cu) > PERIOD_MAX_DAYS - 1) cs = shiftKey(cu, -(PERIOD_MAX_DAYS - 1));
      nextCompare = { mode: 'custom', since: cs, until: cu };
    }
    // Meta مبتديش أرقام أقدم من ٣٧ شهر: فترة مقارنة قديمة (أو الفترات اللي قبلها) كانت هتوقّع الملخص كله
    if (activeSources.meta && window.DX && DX.windows) {
      var dp = dxPeriodFor(BROWSER_TZ, nextPeriod, nextCompare), oldestW = DX.spans(DX.windows(dp.since, dp.until, { unit: dp.unit, cmp: dp.cmp }))[0].since;
      if (oldestW < metaOldestKey(today)) { showPeriodError(t('period.cmpTooOld')); return; }
    }
    var periodChanged = JSON.stringify(nextPeriod) !== JSON.stringify(period.preset === 'custom' ? period : { preset: period.preset });
    var compareChanged = JSON.stringify(nextCompare) !== JSON.stringify(compare);
    closePeriodPanel(true);
    if (periodChanged) { compare = nextCompare; saveCompare(); applyPeriod(nextPeriod); }
    else if (compareChanged) applyCompare(nextCompare);
    if (custom && custom.tooOld) setStatus(msg('period.tooOld', { date: function () { return fmtKey(nextPeriod.since); } }));
    else if (custom && custom.trimmed) setStatus(msg('period.trimmed', { n: PERIOD_MAX_DAYS, date: function () { return fmtKey(nextPeriod.since); } }));
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
    if (filters.adset) out.push({ key: 'adset', label: t('filters.adsetChip', { name: filters.adsetName || t('adset.noName') }) });
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
    else if (key === 'campaign') { filters.campaign = null; filters.campaignName = null; }
    else if (key === 'adset') { filters.adset = null; filters.adsetName = null; }
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
    var dup = analysisNow.alerts.some(function (o) { return o !== a && o.adId && o.adId !== a.adId && o.adName === name; });
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
    // «يحتاج انتباهك الآن» على «الآن» دايماً (analysisNow) — أيّاً كانت الفترة المختارة
    var alerts = analysisNow.alerts.filter(function (a) { return onPlatforms(a, pick); });
    var items = DX.attention(o ? o.blocks : [], alerts, candidates);
    renderWastePanel(pick, alerts);
    // «تحتاج مراجعة»: شارة بتفلتر الإعلانات دي («معرّض للهدر» و«دون طلبات منذ…» بقوا لوحة الهدر فوق — renderWastePanel)
    // بعدد إعلانات المنصة المختارة بس، زي القايمة اللي تحتها — مراجعة المرحلة ٤ (١٨ أكتوبر ٢٠٢٦، حساب حقيقي): تحت شريحة
    // Snapchat كانت «إعلانات تحتاج إلى مراجعة: ٢» والاتنين في Meta. والضغط بيفتح الإعلانات دي بفلتر المنصة نفسها
    var review = candidates.filter(function (c) {
      var a = analysis.byAd[c.id];
      return a && a.health === 'review' && onPlatforms(c, pick);
    }).length;
    // الشارة بتفتح الإعلانات بحكم الفترة، فبتقول الفترة لو غير الأسبوع — القسم نفسه عن «الآن» فالعدد من غيرها كان بيتقرا عن دلوقتي
    var reviewText = period.preset === 'last7' ? t('attn.review', { n: ar(review) }) : t('attn.reviewP', { n: ar(review), period: periodLabel() });
    var chips = review ? '<button type="button" class="attn-chip" data-kpi="review">' + esc(reviewText) + '</button>' : '';
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
    var all = analysisNow.alerts.filter(function (a) { return a.level === 'critical' || a.level === 'warning'; }).length;
    el.innerHTML = head + list.map(function (it) { return it.type === 'block' ? attnBlockHtml(it) : attnAlertHtml(it.alert); }).join('') +
      (all ? '<button type="button" class="top-alerts-all" data-go-alerts>' + t('top.all', { n: ar(all) }) + '</button>' : '');
    return shown;
  }
  // ---------- لوحة «قيمة الأداة» (مكان لوحة الهدر فوق سبب الحكم) ----------
  // قرار صاحب المنتج ٢٥ أكتوبر ٢٠٢٦: «قسم الهدر… الهدف منه هو عرض قيمة الأداة وليس تفاصيل كثيرة لا يقرأها أي شخص». بعد نقاش المراجع
  // (Opteo: الوقت والمبلغ اللي كان هيتصرف لولا التدخل؛ وأنظمة التنبيه بتفصل وقت الاكتشاف — بتاع الأداة — عن سرعة الإنسان) اتفقنا على:
  // (١) مشكلات عالجتها بعد تنبيهنا، (٢) هدر منعته = ما كان كل إعلان منهم بيهدره في اليوم قبل التنبيه ليوم واحد، (٣) وقت وفّرناه
  // بالساعات («اجعلها بالساعات وليس بالدقائق أو الثواني»)، وسطر «تنتظر نظرتك» — من غير أي نسبة على المستخدم («سرعة تصرّف المستخدم قد
  // تكون هجوماً عليه»). المشكلة = تنبيه «عاجل» عليه مبلغ هدر، والمعالجة = تعديل خلال ٢٤ ساعة من التنبيه على الإعلان أو مجموعته أو
  // حملته (سجل تعديلات المنصة). السجل على السيرفر (supabase/functions/sync/episodes.ts) من غير أي مبالغ، والمبلغ من المنصة وقت العرض.
  // قبل أول تسجيل: ملاحظة واحدة على الجهاز (سياسة الخصوصية: «نوضّح التغيير قبل تفعيله»). Meta وSnapchat بس (سجل التعديلات)
  var VALUE_PLATFORMS = ['meta', 'snapchat'];
  // v2 (٣ نوفمبر ٢٠٢٦): المبالغ بقت مقيسة قبل/بعد — مبالغ v1 كانت مضخّمة (الهدر اليومي كامل لأي تصرّف)، فبتتمسح ومبتتقريش
  var VALUE_ACK_KEY = 'pauseproof.value.ack.v1', VALUE_MONEY_KEY = 'pauseproof.value.money.v2';
  try { localStorage.removeItem('pauseproof.value.money.v1'); } catch (e) { /* التخزين مقفول */ }
  var VALUE_DAY = 86400000, VALUE_RESYNC = 10 * 60000;
  // وقت البحث عن الإعلانات العاجلة من غير تنبيه، في كل يوم فيه تنبيه جديد: دقيقة للحساب (فتحه وضبط الفترة والأعمدة) و١٠ ثواني لكل إعلان
  // شغّال (مقارنة إنفاقه ونتائجه بحدّك) — تقدير متحفظ اتفقنا عليه، وبيتقال في «كيف نحسبها؟»
  var VALUE_SECONDS = { account: 60, ad: 10 };
  var valueEpisodes = {};   // المصدر ← مشكلاته من السيرفر (آخر ٤٥ يوم)
  var valueActions = {};    // المصدر ← { since, complete, objects?, list } من سجل التعديلات (meta.js loadAdEdits، snapchat.js publishSnapValueActions)
  var valueState = {};      // المصدر ← { key, at, busy, deciding, moneyBusy, snapAsked }
  var valueTzOf = {};       // توقيت حساب Snapchat (snapchat.js) — Meta من accountInfo
  var valueAckNow = false;
  var valueMoney = (function () {
    try { var v = JSON.parse(localStorage.getItem(VALUE_MONEY_KEY) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
    catch (e) { return {}; }
  })();
  function saveValueMoney() { try { localStorage.setItem(VALUE_MONEY_KEY, JSON.stringify(valueMoney)); } catch (e) { /* بيتحسب تاني المرة الجاية */ } }
  // الموافقة في سجل المستخدم (prefs.valueAck — من ٣١ أكتوبر، زي السجل نفسه لكل مستخدم). علامة الجهاز القديمة مبتتحسبش لما سجل المستخدم
  // يكون معروف: كانت بتفضل بعد الخروج، فمستخدم تاني على نفس الجهاز كان سجله هيبدأ من غير ما يوافق هو
  function valueAcked() {
    if (valueAckNow) return true;
    if (settingsKnown()) return !!(userSet.prefs && userSet.prefs.valueAck === true);
    try { return localStorage.getItem(VALUE_ACK_KEY) === '1'; } catch (e) { return false; }
  }
  function ackValue() {
    valueAckNow = true;
    try { localStorage.setItem(VALUE_ACK_KEY, '1'); } catch (e) { /* الجلسة دي بس */ }
    if (settingsKnown() && !(userSet.prefs && userSet.prefs.valueAck)) writeUserSettings({ changes: { prefs: { valueAck: true } } }).then(function () {}, function () {});
  }
  function valueTz(source) {
    var p = platformOfSource(source);
    return (p === 'snapchat' ? valueTzOf[source] : (accountInfo[source] || {}).timeZone) || BROWSER_TZ;
  }
  function valueAdOf(source, ad) { return candidates.filter(function (c) { return c.source === source && String(c.nativeId || c.id) === ad; })[0] || null; }
  // مشكلات الحساب دلوقتي: نفس التنبيهات اللي في «تنتظر نظرتك» (عاجل وعليه مبلغ هدر) — من كل التنبيهات مش المفلترة بالمنصة المختارة،
  // وإلا مشكلات المنصة التانية كانت هتخلص بالغلط
  function valueProblems(alerts, source) {
    var seen = {}, out = [];
    alerts.forEach(function (a) {
      if (a.level !== 'critical' || !a.atRisk || !(a.amount > 0) || !a.adId) return;
      var c = findCandidate(a.adId);
      if (!c || c.source !== source) return;
      var ad = String(c.nativeId || c.id), kind = a.code === 'loss' ? 'loss' : 'waste';
      if (seen[ad + '|' + kind]) return;
      seen[ad + '|' + kind] = 1;
      out.push({ ad: ad, kind: kind });
    });
    return out.sort(function (x, y) { return x.ad < y.ad ? -1 : (x.ad > y.ad ? 1 : (x.kind < y.kind ? -1 : 1)); });
  }
  // الحساب خلص تحميله كله (والمتوقفة كمان) وإعداداته وصلت (أقصى التكلفة هو اللي بيخلّي التنبيه عاجل): غير كده المشكلات ناقصة
  function valueReady(source) {
    var p = platformOfSource(source);
    return VALUE_PLATFORMS.indexOf(p) > -1 && sourceOf(p) === source && !loadingPlatforms[p] && !numbersPending[p] && settingsKnown(source) &&
      !!platformTokenOf(p) && candidates.some(function (c) { return c.source === source; });
  }
  function valueTick() {
    VALUE_PLATFORMS.forEach(function (p) {
      var source = sourceOf(p);
      if (source && valueReady(source)) valueSync(source);
    });
  }
  function valueSync(source) {
    var st = valueState[source] = valueState[source] || {};
    if (st.busy) return;
    // من أول يوم في فترة البيانات المختارة بتوقيت الحساب (اللوحة بتتبع الفترة — قرار صاحب المنتج ٢٥ أكتوبر): تغيير الفترة = طلب جديد
    var since = resolvePeriodFor(valueTz(source)).since;
    // المشكلات المفتوحة «الآن» (analysisNow) — لو من تحليل الفترة، عرض «الشهر الماضي» كان هيقفل مشكلات قايمة ويفتح قديمة
    var open = valueAcked() ? valueProblems(analysisNow.alerts, source) : null, key = JSON.stringify([open, since]);
    if (st.key === key && Date.now() - st.at < VALUE_RESYNC) return;
    st.busy = true; st.key = key; st.at = Date.now();
    accountCall('episodes.sync', source, { open: open, since: since }).then(function (res) {
      st.busy = false;
      if (!res || !Array.isArray(res.episodes) || sourceOf(platformOfSource(source)) !== source) return;
      valueEpisodes[source] = res.episodes;
      valueDecide(source);
      valueLoadMoney(source);
      renderValueAgain();
    }, function () { st.busy = false; });
  }
  // التعديل اللي بيتحسب معالجة: إيقاف، أو خفض ميزانية (٢٠٪ أو أكتر — الأقل مبيوصلش هنا أصلاً)، أو تصميم أو استهداف أو مزايدة.
  // رفع الميزانية على إعلان بيهدر مش معالجة
  var VALUE_ACT = { pause: 1, budget: 1, targeting: 1, creative: 1, bid: 1 };
  function valueActionCounts(a) { return !!VALUE_ACT[a.kind] && (a.kind !== 'budget' || (a.from > 0 && a.to > 0 && a.to < a.from)); }
  function valueTime(s) { return Date.parse(String(s || '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2')); }
  // قرار مشكلة واحدة: { handledAt, action } لو فيه تعديل جوه الـ ٢٤ ساعة بعد التنبيه، و{ handledAt: null } لو الـ ٢٤ ساعة خلصت والسجل
  // غطّاها كلها من غير تعديل، و null = لسه منعرفش. objs = الإعلان ومجموعته وحملته، acts = valueActions[المصدر]
  function valueDecision(ep, objs, acts, now) {
    var first = valueTime(ep.firstAt), end = first + VALUE_DAY;
    if (isNaN(first) || !acts) return null;
    var hit = acts.list.filter(function (a) {
      var t0 = valueTime(a.time);
      var mine = (a.level === 'ad' && a.id === objs.ad) || (a.level === 'adset' && !!objs.adset && a.id === objs.adset) ||
        (a.level === 'campaign' && !!objs.campaign && a.id === objs.campaign);
      return mine && t0 >= first && t0 <= end && valueActionCounts(a);
    }).sort(function (x, y) { return valueTime(x.time) - valueTime(y.time); })[0];
    if (hit) return { handledAt: new Date(valueTime(hit.time)).toISOString(), action: hit.kind };
    var keys = ['ad:' + objs.ad].concat(objs.adset ? ['adsquad:' + objs.adset] : [], objs.campaign ? ['campaign:' + objs.campaign] : []);
    var covered = acts.complete && first >= acts.since && (!acts.objects || keys.every(function (k) { return acts.objects[k]; }));
    return now >= end && covered ? { handledAt: null, action: null } : null;
  }
  function valueObjects(source, ep) {
    var c = valueAdOf(source, ep.ad);
    return { ad: ep.ad, adset: c && c.adsetId ? String(c.adsetId) : null, campaign: c && c.campaignId ? String(c.campaignId) : null };
  }
  function valueDecide(source) {
    var st = valueState[source] = valueState[source] || {}, acts = valueActions[source], eps = valueEpisodes[source] || [];
    if (st.deciding || !acts) return;
    var now = Date.now(), out = [], need = [];
    eps.forEach(function (ep) {
      if (ep.decided) return;
      var objs = valueObjects(source, ep), d = valueDecision(ep, objs, acts, now);
      if (d) { out.push({ id: ep.id, handledAt: d.handledAt, action: d.action }); return; }
      // Snapchat: سجل عناصر المشكلة مجاش مع الوسوم (الإعلان اتوقف بعد التنبيه فمش في الشغّالة) — بنطلبه مرة في الجلسة
      if (acts.objects && valueTime(ep.firstAt) >= acts.since) {
        need.push({ level: 'ad', id: objs.ad });
        if (objs.adset) need.push({ level: 'adsquad', id: objs.adset });
        if (objs.campaign) need.push({ level: 'campaign', id: objs.campaign });
      }
    });
    if (need.length && !st.snapAsked && typeof snapValueChanges === 'function') {
      st.snapAsked = true;
      snapValueChanges(source.slice('snapchat:'.length), need, valueTz(source)).then(function (got) { if (got) valueDecide(source); });
    }
    if (!out.length) return;
    st.deciding = true;
    accountCall('episodes.decide', source, { decisions: out.slice(0, 100) }).then(function () {
      st.deciding = false;
      out.slice(0, 100).forEach(function (d) {
        eps.forEach(function (ep) { if (ep.id === d.id) { ep.decided = true; ep.handledAt = d.handledAt; ep.action = d.action; } });
      });
      valueLoadMoney(source);
      renderValueAgain();
    }, function () { st.deciding = false; });
  }
  // سجل التعديلات وصل (meta.js / snapchat.js) — المشكلات اللي مستنياه بيتقرر فيها
  function valueActionsArrived(source) { if (valueEpisodes[source]) valueDecide(source); loadExtraAlerts(source); }
  // ما كان الإعلان بيهدره في اليوم وقت التنبيه (نفس المحرك — alerts.js withMoney: متوسط آخر ٣ أيام مكتملة قبل يوم التنبيه): الإنفاق كله
  // في «دون نتيجة»، والإنفاق ناقص المبيعات في الخسارة. من أرقام الكارت لو الأيام دي جوه أسبوعه، وإلا إنفاق المنصة (طلب واحد للحساب)
  function valueDays(ep, tz) {
    var day = DX._.keyInTz(ep.firstAt, tz);
    return day ? [shiftKey(day, -3), shiftKey(day, -2), shiftKey(day, -1)] : null;
  }
  // أول يوم مكتمل بعد التصرّف (بتوقيت الحساب): التصرّف بالنهار بيأثر في نفس اليوم جزئياً بس، فاليوم اللي بعده هو أول يوم كامل بعده
  function valueAfterDay(ep, tz) {
    var day = ep.handledAt ? DX._.keyInTz(ep.handledAt, tz) : null;
    return day ? shiftKey(day, 1) : null;
  }
  // الهدر المنَع فعلاً (مراجعة ٣ نوفمبر ٢٠٢٦ — قياس قبل/بعد): هدر اليوم قبل التنبيه ناقص هدره الفعلي في أول يوم مكتمل بعد التصرّف،
  // ومبيقلش عن صفر. قبل كده كان بيتحسب الهدر اليومي كامل لأي تصرّف — والحقيقي من ٧ معالجات: إيقاف واحد بس، و٤ خفض ميزانية (بيقلّل
  // جزء)، و٢ تعديل تصميم أو استهداف (مبيوقفش الصرف خالص). يعني ٦ من ٧ مبالغ كانت مضخّمة. من أرقام الكارت لو الأيام الأربعة جوه أسبوعه
  function valueSavedFromCard(ep, c, tz) {
    var days = valueDays(ep, tz), after = valueAfterDay(ep, tz);
    if (!days || !after || !c || !c.dailyDates) return null;
    var idx = days.map(function (d) { return c.dailyDates.indexOf(d); }), ai = c.dailyDates.indexOf(after);
    if (ai < 0 || idx.some(function (i) { return i < 0; })) return null;
    var spendOf = function (i) { return (c.daily || [])[i] || 0; }, salesOf = function (i) { return (c.dailySales || [])[i] || 0; };
    var spend = idx.reduce(function (s, i) { return s + spendOf(i); }, 0);
    // قبل التنبيه بنفس تعريف المحرّك (alerts.js withMoney): الإنفاق كله في «دون نتيجة»، والإنفاق ناقص المبيعات في الخسارة
    var before = ep.kind === 'loss' ? Math.max(0, spend - idx.reduce(function (s, i) { return s + salesOf(i); }, 0)) / 3 : spend / 3;
    var afterWaste = ep.kind === 'loss' ? Math.max(0, spendOf(ai) - salesOf(ai)) : spendOf(ai);
    return Math.max(0, before - afterWaste);
  }
  function valueCurrency(source) {
    var c = candidates.filter(function (x) { return x.source === source && x.currency; })[0];
    return (c && c.currency) || (accountInfo[source] || {}).currency || '';
  }
  function valueLoadMoney(source) {
    var st = valueState[source] = valueState[source] || {}, tz = valueTz(source), cur = valueCurrency(source), need = [], changed = false;
    var today = todayKeyInTz(tz);
    (valueEpisodes[source] || []).forEach(function (ep) {
      if (!ep.handledAt || valueMoney[ep.id]) return;
      // اليوم اللي بعد التصرّف لسه مكملش: المبلغ بيتحسب بعدين («يُحسب بعد اكتمال اليوم التالي» في اللوحة)
      var after = valueAfterDay(ep, tz);
      if (!after || after >= today) return;
      var r = valueSavedFromCard(ep, valueAdOf(source, ep.ad), tz);
      if (r != null) { valueMoney[ep.id] = { v: r, cur: cur }; changed = true; return; }
      // الخسارة برّه أسبوع الكارت مبتتحسبش (المبيعات محتاجة نفس نسب الكارت) — العدد بيتحسب والمبلغ لأ
      if (ep.kind === 'waste' && valueDays(ep, tz)) need.push(ep);
    });
    if (changed) saveValueMoney();
    if (!need.length || st.moneyBusy) return;
    // دفعات بنطاق ٣١ يوم بالكتير (حد طلب Snapchat اليومي)، ورا بعض — فترة ٩٣ يوم = ٣ طلبات بالكتير. النطاق لحد يوم ما بعد التصرّف
    need.sort(function (a, b) { return valueDays(a, tz)[0] < valueDays(b, tz)[0] ? -1 : 1; });
    var groups = [], g = null;
    need.forEach(function (ep) {
      var ds = valueDays(ep, tz), af = valueAfterDay(ep, tz);
      if (!g || keyDiffDays(g.since, af) > 30) { g = { since: ds[0], until: af, eps: [] }; groups.push(g); }
      if (af > g.until) g.until = af;
      g.eps.push(ep);
    });
    var account = source.slice(platformOfSource(source).length + 1), meta = platformOfSource(source) === 'meta';
    var fetchGroup = function (grp) {
      var ids = grp.eps.map(function (ep) { return ep.ad; }).filter(function (id, i, a) { return a.indexOf(id) === i; });
      return meta
        ? metaObjectDaily(account, [{ level: 'ad', ids: ids }], grp.since, grp.until).then(function (out) {
          var m = {};
          Object.keys(out || {}).forEach(function (id) { m[id] = {}; out[id].forEach(function (b) { m[id][b.date] = b.spend || 0; }); });
          return m;
        })
        : snapDailySpend(account, ids, grp.since, grp.until);
    };
    var done = function () { st.moneyBusy = false; saveValueMoney(); renderValueAgain(); };
    st.moneyBusy = true;
    groups.reduce(function (p, grp) {
      return p.then(function () { return fetchGroup(grp); }).then(function (byAd) {
        if (!byAd) return;
        grp.eps.forEach(function (ep) {
          var m = byAd[ep.ad] || {};
          // قبل التنبيه ناقص يوم ما بعد التصرّف — يوم مالوش صف عند المنصة = مصرفش (الإيقاف)
          var before = valueDays(ep, tz).reduce(function (s, d) { return s + (m[d] || 0); }, 0) / 3;
          valueMoney[ep.id] = { v: Math.max(0, before - (m[valueAfterDay(ep, tz)] || 0)), cur: cur };
        });
      });
    }, Promise.resolve()).then(done, done);
  }
  // «نحو ٢٤ دقيقة» / «نحو ساعة و١٠ دقائق» — بالدقائق (طلب صاحب المنتج ٣ نوفمبر ٢٠٢٦: الساعة كانت بتخلّي الشهر كله «أقل من ساعة»،
  // فالعميل مبيحسّش بأي تقدّم). أقرب دقيقة، وأقل من دقيقة كلمة. العدد مع المعدود بالعربي: ١ و٢ لفظ، و٣–١٠ جمع، و١١+ مفرد
  function arCount(n, one, two, few, many) { return n === 1 ? one : n === 2 ? two : ar(n) + ' ' + (n <= 10 ? few : many); }
  function valueTimeText(seconds) {
    var m = Math.round((seconds || 0) / 60);
    if (m < 1) return t('val.h.less');
    var h = Math.floor(m / 60), mm = m % 60;
    if (!isAr()) {
      var en = (h ? h + (h === 1 ? ' hour' : ' hours') : '') + (h && mm ? ' ' : '') + (mm ? mm + (mm === 1 ? ' minute' : ' minutes') : '');
      return t('val.hours.v', { h: en });
    }
    var hs = h ? arCount(h, 'ساعة', 'ساعتين', 'ساعات', 'ساعة') : '', ms = mm ? arCount(mm, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة') : '';
    return t('val.hours.v', { h: hs + (hs && ms ? ' و' : '') + ms });
  }
  // أرقام اللوحة للمنصات المختارة وفترة البيانات المختارة (بأيام كل حساب بتوقيته — resolvePeriodFor زي باقي الأداة): المشكلات المسجّلة
  // فيها، واللي اتعالج منها ومبلغها، والوقت. النهارده لو برّه الفترة (الفترات المتحركة أيام مكتملة): اللي اتعالج فيه سطر لوحده زي «اليوم حتى
  // الآن» في الملخص. و«تنتظر نظرتك» دلوقتي مش في الفترة
  function valueData(pick, alerts) {
    var byAd = {}, pending = { n: 0, daily: {} };
    alerts.forEach(function (a) {
      if (a.level !== 'critical' || !a.atRisk || !(a.amount > 0) || !a.adId) return;
      var x = byAd[a.adId] || (byAd[a.adId] = { cur: a.currency || '', d: 0 });
      x.d = Math.max(x.d, (a.money && a.money.daily) || 0);
    });
    Object.keys(byAd).forEach(function (id) { var x = byAd[id]; pending.n++; pending.daily[x.cur] = (pending.daily[x.cur] || 0) + x.d; });
    var d = { pending: pending, acked: valueAcked(), sources: 0, recorded: 0, handled: 0, money: {}, wait: 0, seconds: 0, today: 0, any: 0, range: null };
    VALUE_PLATFORMS.forEach(function (p) {
      var source = sourceOf(p);
      if (!source || (pick && pick.indexOf(p) === -1)) return;
      d.sources++;
      var tz = valueTz(source), r = resolvePeriodFor(tz), today = todayKeyInTz(tz), days = {};
      if (!d.range) d.range = r;
      // المشكلة الواحدة مرة واحدة (فحص حساب حقيقي ٣ نوفمبر ٢٠٢٦): السيرفر بيقفل المشكلة لما تختفي من قايمة الحساب وبيفتح
      // واحدة جديدة لما ترجع — وإعلان واحد في ٣٠ أكتوبر كان عليه مشكلتين بفارق ساعة ونص، والاتنين اتعالجوا بنفس التعديل،
      // فظهر «٢ مشكلة» و٢٦ $ والحقيقي مشكلة واحدة و١٣ $. التجميع بالإعلان + يوم التصرّف (أو يوم المشكلة لو لسه ما اتعالجتش)،
      // والمبلغ أكبر واحد في المجموعة مش مجموعهم — نفس قاعدة «الإعلان مرة واحدة بأكبر مبلغ عليه» المعتمدة في الهدر
      var byProblem = {}, keys = [];
      (valueEpisodes[source] || []).forEach(function (ep) {
        var day = DX._.keyInTz(ep.firstAt, tz);
        if (!day) return;
        var k = ep.ad + '|' + (ep.handledAt ? 'h:' + DX._.keyInTz(ep.handledAt, tz) : 'd:' + day);
        var g = byProblem[k];
        if (!g) { g = byProblem[k] = { day: day, handledAt: null, money: null, wait: false }; keys.push(k); }
        if (day < g.day) g.day = day;
        if (ep.handledAt) g.handledAt = ep.handledAt;
        var m = valueMoney[ep.id];
        if (m && m.v > 0) { if (!g.money || m.v > g.money.v) g.money = m; }
        // اليوم اللي بعد التصرّف لسه مكملش: المبلغ بيتحسب بعدين، وبنقول كده بدل ما يبان إن المعالجة ملهاش أثر
        else if (!m && ep.handledAt) { var af = valueAfterDay(ep, tz); if (af && af >= today) g.wait = true; }
      });
      keys.forEach(function (k) {
        var g = byProblem[k];
        d.any++;
        if (g.day < r.since || g.day > r.until) {
          if (g.day === today && g.handledAt) d.today++;
          return;
        }
        d.recorded++; days[g.day] = 1;
        if (!g.handledAt) return;
        d.handled++;
        if (g.money) d.money[g.money.cur] = (d.money[g.money.cur] || 0) + g.money.v;
        else if (g.wait) d.wait++;
      });
      // كل يوم بإعلاناته هو (اللي صرفت فيه) — قبل كده الإعلانات الشغّالة دلوقتي كانت بتتحسب لأيام فاتت
      d.seconds += Object.keys(days).reduce(function (s, day) {
        return s + VALUE_SECONDS.account + VALUE_SECONDS.ad * valueAdsOn(source, day, today);
      }, 0);
    });
    return d;
  }
  // إعلانات صرفت في يوم معيّن من أرقام الكارت، ولليوم اللي قبل أسبوع الكارت: متوسط أيامه المكتملة
  function valueAdsOn(source, day, today) {
    var ads = candidates.filter(function (c) { return c.source === source && c.dailyDates && c.daily; });
    var on = function (k) { return ads.filter(function (c) { var i = c.dailyDates.indexOf(k); return i > -1 && (c.daily[i] || 0) > 0; }).length; };
    if (ads.some(function (c) { return c.dailyDates.indexOf(day) > -1; })) return on(day);
    var keys = {};
    ads.forEach(function (c) { c.dailyDates.forEach(function (k) { if (k < today) keys[k] = 1; }); });
    var list = Object.keys(keys);
    return list.length ? list.reduce(function (s, k) { return s + on(k); }, 0) / list.length : 0;
  }
  function valuePanelHtml(d) {
    if (!d.sources && !d.pending.n) return '';
    var tile = function (k, v, s) {
      return '<div class="value-tile"><span class="value-k">' + esc(k) + '</span><b class="value-v">' + esc(v) + '</b><span class="value-s">' + esc(s) + '</span></div>';
    };
    var html = '<div class="value-panel"><p class="value-title">' + esc(t('val.title')) +
      (d.range ? ' <span class="value-period">' + esc(fmtRange(d.range.since, d.range.until)) + '</span>' : '') + '</p>';
    if (d.sources && !d.acked) {
      html += '<p class="value-notice">' + esc(t('val.notice')) + ' <a href="/privacy" target="_blank" rel="noopener">' + esc(t('val.notice.link')) + '</a> ' +
        '<button type="button" class="value-ack" data-value-ack>' + esc(t('val.notice.ok')) + '</button></p>';
    }
    // مفيش ولا مشكلة في الفترة: لو السجل فيه مشكلات في أيام تانية «لا تنبيهات في هذه الفترة»، وإلا لسه بنبدأ
    if (d.sources && !d.recorded) html += '<p class="value-empty">' + esc(t(d.any ? 'val.noneInPeriod' : (d.acked ? 'val.start' : 'val.startAfter'))) + '</p>';
    if (d.recorded) {
      var tiles = '';
      if (d.handled) tiles += tile(t('val.handled.k'), ar(d.handled), t('val.handled.s'));
      if (Object.keys(d.money).length) tiles += tile(t('val.saved.k'), t('val.saved.v', { v: moneyByCur(d.money) }), t('val.saved.s'));
      tiles += tile(t('val.hours.k'), valueTimeText(d.seconds), t('val.hours.s'));
      if (!d.handled) html += '<p class="value-empty">' + esc(t('val.none', { n: ar(d.recorded) + ' ' + noun(d.recorded, 'n.problem') })) + '</p>';
      html += '<div class="value-tiles">' + tiles + '</div>';
      if (d.wait) html += '<p class="value-empty">' + esc(t('val.saved.wait', { n: ar(d.wait) + ' ' + noun(d.wait, 'n.problem') })) + '</p>';
    }
    if (d.today) html += '<p class="value-empty value-today">' + esc(t('val.today', { n: ar(d.today) + ' ' + noun(d.today, 'n.problem') })) + '</p>';
    if (d.pending.n) {
      html += '<div class="value-pending"><span>' + esc(t('val.pending', { n: ar(d.pending.n) + ' ' + noun(d.pending.n, 'n.problem'), v: moneyByCur(d.pending.daily) })) + '</span>' +
        '<button type="button" class="value-cta" data-kpi="risk">' + esc(t('val.cta')) + '</button></div>';
    }
    if (d.sources) {
      html += '<details class="value-how"><summary>' + esc(t('val.how')) + '</summary><ul>' +
        ['val.how.problem', 'val.how.handled', 'val.how.saved', 'val.how.hours', 'val.how.scope'].map(function (k) { return '<li>' + esc(t(k)) + '</li>'; }).join('') +
        '</ul></details>';
    }
    return html + '</div>';
  }
  var valueLast = null;
  // «كيف نحسبها؟» بتفضل مفتوحة لو كانت مفتوحة (الأرقام بتوصل في الخلفية وبترسم اللوحة تاني)
  function paintValue() {
    var el = document.getElementById('dxWaste');
    if (!el || !valueLast) return;
    var how = !!el.querySelector('.value-how[open]');
    el.innerHTML = valuePanelHtml(valueData(valueLast.pick, valueLast.alerts));
    var d = how && el.querySelector('.value-how');
    if (d) d.open = true;
  }
  function renderWastePanel(pick, alerts) {
    valueLast = { pick: pick, alerts: alerts };
    valueTick();
    paintValue();
  }
  function renderValueAgain() { paintValue(); }
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
    if (el) { kpiAction(el.dataset.kpi); return; }
    // ملاحظة التسجيل («حسناً»): التسجيل بيبدأ من دلوقتي
    if (e.target.closest('[data-value-ack]')) { ackValue(); valueTick(); renderValueAgain(); }
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
  // الجدول جوه تفاصيل الإعلان: الأرقام التلاتة لكل سطر — الأقرب للمتجر في الفترة (ونسبة تغيّره عن فترة المقارنة)، والأقرب للمتجر في فترة
  // المقارنة، ورقم المنصة في الفترة (٧ نوفمبر ٢٠٢٦ — كان رقم المنصة ورقمنا والفرق بس). النسبة من غير لون: مفيش اختبار تذبذب هنا زي
  // الملخص، والحكم في مكانه فوق. الشرح تحته بلغة الفايدة مش بلغة تقنية
  function chgText(cur, prev) {
    if (cur == null || prev == null || !(prev > 0)) return '';
    var d = cur / prev - 1;
    return Math.abs(d) < 0.005 ? '' : ' <span class="cmp-chg">' + (d > 0 ? '↑ ' : '↓ ') + dxPct(d) + '</span>';
  }
  function compareMarkup(c, p, pp, hl) {
    var cur = c.currency, cs = cmpOf(c), ok = cs.state === 'ok';
    var one = esc(t('res1.' + (c.resultKey || 'generic')));
    var range = cmpRangeText(c.source);
    var row = function (label, key, mark) {
      var prev = ok ? NUM_FMT[key](cs.p, cur) : (cs.state === 'failed' ? '—' : '…');
      return '<tr><th scope="row">' + label + '</th>' +
        '<td class="cmp-store' + (mark || '') + '"><span class="cmp-n">' + NUM_FMT[key](p, cur) + '</span>' + (ok ? chgText(p[key], cs.p[key]) : '') + '</td>' +
        '<td' + (cs.state === 'failed' ? ' title="' + esc(t('card.cmpFailed')) + '"' : '') + '><span class="cmp-n">' + prev + '</span></td>' +
        '<td><span class="cmp-n">' + NUM_FMT[key](pp, cur) + '</span></td></tr>';
    };
    var rows = row(t('x.spend'), 'spend', hl('spend') || hl('delivery')) +
      row(esc(p.results != null ? resultLabelOf(c) : t('x.results')), 'results', hl('results')) +
      row(t('cmp.cpr', { r: one }), 'cpr', hl('cpr'));
    if (pp.sales > 0 || p.sales > 0 || (ok && cs.p.sales > 0)) rows += row(t('x.sales'), 'sales') + row(t('cmp.roas'), 'roas', hl('roas'));
    // الشرح: رقم المنصة غير رقمنا = جملة الفايدة المعتمدة (compareNote). مفيش رقم منصة منفصل = الأقرب للمتجر هو رقم المنصة نفسه
    var note = p.results == null ? '' : (platOf(c) ? compareNote(c, p, pp) : t('cmp.noteOwn'));
    var head = function (txt, sub, cls) { return '<th scope="col"' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(txt) + (sub ? '<span class="cmp-sub">' + esc(sub) + '</span>' : '') + '</th>'; };
    return '<div class="attr-compare">' +
      '<div class="attr-title">' + t('cmp.title') + '</div>' +
      '<div class="attr-table-wrap"><table class="attr-table"><thead><tr><th></th>' +
      head(t('cmp.store'), periodLabel(), 'cmp-store') + head(cmpName() || t('cmp.prev'), range) + head(t('cmp.platformOf', { plat: c.platform }), periodLabel()) + '</tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      (note ? '<p class="attr-note">' + esc(note) + '</p>' : '') +
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
      return k && t(k) !== k ? t(k) : I18N.countPhrase(n, key, fmtNum);
    };
    var gonePhrase = I18N.countPhrase(gone, key, fmtNum);
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

  // ليه إعلان الكتالوج في Snapchat مظهرش صور؟ (snapchat.js snapProductErr = { code, status })
  // ٤٠٣ = الحساب المربوط مش ليه صلاحية على الكتالوج — ده اللي العميل يقدر يصلّحه بنفسه من مدير الأعمال
  // (حساب حقيقي ٢ نوفمبر ٢٠٢٦ — Coda: كتالوج بيشتغل وتاني بيترفض في نفس الحساب).
  // ٤٠٤ = المجموعة مبقتش موجودة. غير كده = مقدرناش نقرا. ومفيش code = المجموعة فاضية فعلاً
  function setNoteKey(why) {
    if (!why || !why.code) return 'x.snapSetEmpty';
    if (why.status === 403) return 'x.snapSetNoAccess';
    if (why.status === 404) return 'x.snapSetGone';
    return 'x.snapSetFailed';
  }

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
    return own + JSON.stringify([a.health, a.pending, a.basis, a.issues.map(function (i) { return [i.level, i.title, i.detail, i.advice]; })]) + JSON.stringify(cmpOf(c));
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
      trendTagHtml(a, true) +
      // جملة المقارنة جوه أساس الحكم (alerts.js basis)، ولو مفيش أساس حكم تبان لوحدها عشان متضيعش
      (a.basis ? '<p class="health-basis">' + esc(a.basis) + '</p>' : (a.trendTag ? '<p class="health-basis">' + esc(a.trendTag.note) + '</p>' : '')) +
      // الإعلان المتعدَّل بيتحكم عليه بالأيام اللي بعد التعديل بس (alerts.js days) — كان مكتوب «آخر ٧ أيام» تحت سطر بيقول «آخر ٣ أيام»
      (c.active ? '<p class="health-period">' + esc(basisLineOf(c, a)) + '</p>' : '');
    // سطر "حالة الظهور": التقييم بتاعنا + سبب المنصة نفسه لو موجود + الحالة الخام —
    // ده اللي بيخلّيك تقارن بسطر واحد مع عمود Delivery في لوحة المنصة
    var statusBits = [statusLabelOf(c)];
    if (c.deliveryReason) statusBits.push(c.deliveryReason);
    if (c.platformStatus) statusBits.push(t('x.platformStatus', { s: c.platformStatus }));
    document.getElementById('expandStatus').innerHTML =
      '<span class="status-line-label">' + t('x.delivery') + '</span><span class="status-line-value">' + esc(statusBits.join(' — ')) + '</span>';
    var nowIssues = nowOnlyIssues(c, a);
    document.getElementById('expandIssues').innerHTML = (a.issues.length
      ? a.issues.map(issueMarkup).join('')
      : (c.active && !nowIssues.length ? '<div class="issue-none">' + t('x.noIssues') + '</div>' : '')) +
      (nowIssues.length ? '<div class="chart-section-label issues-now">' + esc(t('x.nowIssues')) + '</div>' + nowIssues.map(issueMarkup).join('') : '');
    // النص: لو مفيش، بنقول السبب بدل «(بدون نص)» الصامتة — الإعلان المبني على منشور موجود نصه جوه المنشور
    // وقراءته محتاجة صلاحية على الصفحة (حساب حقيقي ٢ نوفمبر ٢٠٢٦)
    var capEl = document.getElementById('expandCaption');
    var capText = c.campaignLevel ? t('x.pmaxNote') : (c.caption || (c.textFromPost ? t('x.fromPostText') : t('x.noText')));
    capEl.textContent = capText;
    capEl.classList.toggle('expand-caption-note', !c.campaignLevel && !c.caption);

    var destLabel = DEST_LABELS[c.landingKind] || t('dest.default');
    // الرابط بيبقى قابل للضغط بس لو http/https — غير كده بيتعرض كنص عادي
    var landingHref = safeUrl(c.landing);
    // النص: النطاق والمسار مقروءين («store.com/products/نظارة-…» بدل %D9%86…) من غير باراميترات التتبّع — الرابط
    // الكامل في الرابط نفسه وفي التلميح
    // ولا وجهة: نفس المبدأ — السبب مكتوب بدل شَرطة صامتة
    // إعلان كتالوج Snapchat: لكل منتج صفحته، فمفيش صفحة واحدة — ده مش نقص بيانات
    var noLinkWhy = c.snapDynamic ? 'x.snapCatalogDest' : (c.textFromPost ? 'x.fromPostLink' : 'x.noLink');
    var landingInner = landingHref
      ? '<a href="' + esc(landingHref) + '" target="_blank" rel="noopener noreferrer" class="expand-landing-value mono" dir="ltr" title="' + esc(c.landing) + '">' + esc(landingText(landingHref)) + '</a>'
      : '<span class="expand-landing-value expand-caption-note">' + esc(t(noLinkWhy)) + '</span>';
    document.getElementById('expandLanding').innerHTML = '<div class="expand-landing"><span class="expand-landing-label">' + destLabel + '</span>' + landingInner + '</div>';

    var cur = c.currency;
    // مربعات الأرقام للفترة المختارة، وتلوينها من الحكم لو الحكم على نفس الأرقام (judgedOnPeriod)
    var p = periodOf(c);
    var hl = function (metric) { return judgedOnPeriod(c) ? mv(c, metric) : ''; };
    // الأرقام التلاتة لكل الإعلانات وكل المنصات (٧ نوفمبر ٢٠٢٦): الأقرب للمتجر، وفترة المقارنة، ورقم المنصة — مكان المربعات الخمسة
    var boxes = compareMarkup(c, p, platNumOf(c), hl);
    if (c.frequency != null || c.frequency30 != null) boxes += freqBox(c);
    document.getElementById('expandMetrics').innerHTML = boxes;

    // جدول الأيام: أيام الفترة المختارة نفسها لو الحكم عليها (dailyTableData — ٣ نوفمبر ٢٠٢٦؛ كان آخر ٧ أيام دايماً تحت أرقام
    // «آخر ٣٠ يوماً»)، والعنوان بيقول أنهي أيام
    var tb = dailyTableData(c), days = tb.dates, n = days.length, yKey = shiftKey(c.dailyDates[c.dailyDates.length - 1], -1);
    document.getElementById('expandDailyTitle').textContent = tb.title;
    var withToday = function (arr, v) { return tb.hasToday ? arr.concat([v]) : arr; };
    var tSpend = withToday(tb.spend, tb.today.spend), tRes = withToday(tb.results, tb.today.results), tSales = withToday(tb.sales, tb.today.sales);
    // السلسلة الثانية: مبيعات فعلية لو موجودة في أيام الجدول، وإلا عدد النتائج (حسب هدف الإعلان نفسه) كبديل مفيد
    var hasSales = tSales.some(function (v) { return v > 0; });
    var secondSeries = hasSales ? tSales : tRes;
    var secondRowLabel = hasSales ? (currencyLabel(cur) ? t('x.salesRow', { cur: currencyLabel(cur) }) : t('x.sales')) : (t('x.results') + (c.resultKey ? ' — ' + esc(resultLabelOf(c)) : ''));
    // عمود "أمس" متعلّم — أغلب التنبيهات مبنية عليه، وعمود النهارده (لو في الجدول) يوم لسه مخلصش. بالتاريخ مش بالمكان: فترة خلصت
    // قبل أمس مفيهاش عمود أمس
    var colCls = function (i) { return i === n ? ' class="col-today"' : (days[i] === yKey ? ' class="col-yesterday"' : ''); };
    // الأيام المكتملة، وبعدها «الإجمالي» (bold)، وبعده النهارده منفصل (ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦: اليوم مش مجموع
    // مع الأيام، والإجمالي في آخر الجدول)
    // يوم واحد مكتمل (أمس) من غير عمود إجمالي — كان هيبقى نفس الرقم مرتين
    var withTotal = n > 1;
    var sumOf = function (arr) { return arr.slice(0, n).reduce(function (a, b) { return a + (b || 0); }, 0); };
    var headerCells = days.map(function (dt, i) { return '<th' + colCls(i) + '>' + (dt === yKey ? t('x.yesterday') : fmtKey(dt)) + '</th>'; }).join('') +
      (withTotal ? '<th class="col-total">' + t('x.totalDays', { n: dayCountText(n) }) + '</th>' : '') +
      (tb.hasToday ? '<th class="col-today">' + t('x.today') + '</th>' : '');
    // الجدول: فاصل الآلاف (١٢٬٥٠٠)، والصرف والمبيعات الصغيرة بخانة عشرية (٠٫٤ مش ٠)
    var rowCells = function (arr, small) {
      return arr.slice(0, n).map(function (v, i) { return '<td' + colCls(i) + '><span class="mono">' + fmtNum(v, small) + '</span></td>'; }).join('') +
        (withTotal ? '<td class="col-total"><span class="mono">' + fmtNum(sumOf(arr), small) + '</span></td>' : '') +
        (tb.hasToday ? '<td class="col-today"><span class="mono">' + fmtNum(arr[n] || 0, small) + '</span></td>' : '');
    };
    document.getElementById('expandChart').innerHTML =
      '<div class="daily-table-wrap"><table class="daily-table"><thead><tr><th></th>' + headerCells + '</tr></thead>' +
      '<tbody><tr><td>' + (currencyLabel(cur) ? t('x.spendRow', { cur: currencyLabel(cur) }) : t('x.spend')) + '</td>' + rowCells(tSpend, true) + '</tr>' +
      '<tr><td>' + secondRowLabel + '</td>' + rowCells(secondSeries, hasSales) + '</tr></tbody></table></div>';

    expandOverlay.classList.remove('hidden');
    expandOverlay.querySelector('.expand-card').scrollTop = 0;
    // الهاتف: الجدول أعرض من الشاشة وأهم أعمدته في الآخر (أمس والإجمالي واليوم) — نفتحه عليها، والأيام الأقدم بالتمرير.
    // بعد ما النافذة تظهر (وهي مخفية العرض = صفر). بالعربي الآخر = scrollLeft بالسالب (المتصفح بيقصّ القيمة على الحد)
    var wrapEl = document.querySelector('#expandChart .daily-table-wrap');
    if (wrapEl.scrollWidth > wrapEl.clientWidth) wrapEl.scrollLeft = (getComputedStyle(wrapEl).direction === 'rtl' ? -1 : 1) * wrapEl.scrollWidth;

    showMedia(c);
  }

  // تنبيهات «الآن» على الإعلان اللي مش في حكم الفترة (عاجل ومهم). اللي جاي من صفحة التنبيهات لازم يلاقي تنبيهه: فحص حقيقي — تنبيه عاجل
  // «عائد أقل من حد الخسارة» بيتفتح على «الشهر الماضي» على «إعلان نشط لم يُنفق شيئاً»، الجملتين صح كل واحدة على أيامها، ومن غير عنوان
  // بيتقروا تناقض. في «آخر ٧ أيام» التحليلين واحد فمفيش
  function nowOnlyIssues(c, a) {
    var now = analysis.period && judgedOnPeriod(c) ? analysisNow.byAd[c.id] : null;
    return ((now && now.issues) || []).filter(function (i) {
      return (i.level === 'critical' || i.level === 'warning') && !a.issues.some(function (x) { return x.title === i.title && x.detail === i.detail; });
    });
  }
  // أيام جدول التفاصيل: أيام الفترة (c.pd) لو الحكم عليها، والنهارده عمود لوحده — فترة بتخلص أمس بتاخده من النافذة اليومية، وفترة
  // فيها النهارده («اليوم» أو مخصصة لحد النهارده) آخر يوم فيها هو النهارده. وإلا النافذة اليومية زي الأول (آخر ٧ أيام والنهارده)
  function dailyTableData(c) {
    var dd = c.dailyDates, last = dd.length - 1, today = dd[last];
    var at = function (arr, i) { return (arr || [])[i] || 0; };
    var nowToday = { spend: at(c.daily, last), results: at(c.dailyResults, last), sales: at(c.dailySales, last) };
    if (period.preset === 'last7' || !judgedOnPeriod(c)) {
      return { dates: dd.slice(0, last), spend: c.daily.slice(0, last), results: c.dailyResults.slice(0, last), sales: c.dailySales.slice(0, last),
        hasToday: true, today: nowToday, title: t('x.dailyTitle') };
    }
    var pd = c.pd, k = pd.dates.length, tail = pd.dates[k - 1], pl = { period: periodLabel() };
    if (tail === today) {
      return { dates: pd.dates.slice(0, k - 1), spend: pd.spend.slice(0, k - 1), results: pd.results.slice(0, k - 1), sales: pd.sales.slice(0, k - 1),
        hasToday: true, today: { spend: at(pd.spend, k - 1), results: at(pd.results, k - 1), sales: at(pd.sales, k - 1) },
        title: t(k > 1 ? 'x.dailyTitleP' : 'x.dailyTitlePOnly', pl) };
    }
    var endsY = tail === shiftKey(today, -1);
    return { dates: pd.dates, spend: pd.spend, results: pd.results, sales: pd.sales, hasToday: endsY, today: nowToday,
      title: t(endsY ? 'x.dailyTitleP' : 'x.dailyTitlePOnly', pl) };
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
  // ---------- فيديو Meta: عرض واحد بالصوت يشتغل لوحده (طلب صاحب المنتج ٣ نوفمبر ٢٠٢٦) ----------
  // «اذا كان تبويب الفيديو بصوت يعمل على كل انواع الفيديوهات ويعمل تلقائياً عند فتح الكارت، فالأفضل ان يكون هو الوحيد».
  // تبويب الصوت القديم كان بيقرا ملف الفيديو من الواجهة بس، وده بيفشل في أغلب الفيديوهات. فحص حي على ٣ حسابات (٣٠ فيديو —
  // مُنشأ في الإعلان ومنشورات موجودة، حملات وعي واستقطاب وتفاعل)، والمصادر دلوقتي بالترتيب:
  //   ١) ملف الفيديو من الواجهة (/{video_id}?fields=source): متاح لفيديوهات مكتبة الحساب الإعلاني بس — ٢ من ٣٠. الباقي بيرجع
  //      (#10) «Application does not have permission»: الفيديو ملك الصفحة، وقراءته محتاجة صلاحية عليها مش بنطلبها
  //   ٢) مشغّل فيسبوك المضمَّن (fb-video من مكتبتهم المحمّلة أصلاً للدخول) برقم الفيديو بس: شغّال لفيديوهات الصفحة — ٢٧ من ٣٠،
  //      من غير أي صلاحية. وواجهته (unmute ثم play) بتشغّله بالصوت لوحده — اتقاس على الموقع: isMuted=false وvolume=1 والتقدّم ماشي.
  //      والمصدرين مكمّلين: الفيديو اللي الواجهة قرته كان «Video unavailable» في المشغّل، والعكس
  //   ٣) ولا ده ولا ده (١ من ٣٠ — منشور مش عام): معاينة الإعلان كما يظهر على المنصة، وبنقول ليه
  // الفيديو المش متاح في المشغّل بيترسم صندوق «Video unavailable» ومبيطلّعش حدث ready خالص (اتقاس) — فبعد مهلة من آخر الرسم
  // بنروح للبديل لوحدنا، من غير ما العميل يشوف تبويبات أو يضغط حاجة
  var VIDEO_ID = /^\d{5,25}$/;
  var FB_VIDEO_WAIT = { render: 15000, ready: 5000 };   // الاختبارات بتصغّرهم
  var fbVideoWaiters = {}, fbVideoSeq = 0, fbVideoHookedOn = null;
  // مستمع واحد لكل نسخة من مكتبة فيسبوك (لو اتحمّلت تاني بيتسجّل تاني)، وبيوصّل كل مشغّل لصاحبه برقم العنصر
  function hookFbVideo() {
    if (fbVideoHookedOn === window.FB) return;
    fbVideoHookedOn = window.FB;
    FB.Event.subscribe('xfbml.ready', function (msg) {
      if (!msg || msg.type !== 'video' || !fbVideoWaiters[msg.id]) return;
      var cb = fbVideoWaiters[msg.id];
      delete fbVideoWaiters[msg.id];
      cb(msg.instance);
    });
  }
  function metaVideoView(c, el, openSeq) {
    var live = function () { return openSeq === expandSeq; };
    var vid = String(c.videoId || '');
    var fallback = function () { if (live()) metaPreviewOnly(c, el, openSeq); };
    // رقم الفيديو بيدخل رابط وسمة: أرقام بس، وأي حاجة تانية تروح للبديل من غير ما تتحط في الصفحة
    if (!VIDEO_ID.test(vid)) { fallback(); return; }
    metaApi('/' + vid, { fields: 'source,picture' }, function (resp) {
      if (!live()) return;
      var src = resp && safeUrl(resp.source);
      if (src) { playNative(el, src, resp && safeUrl(resp.picture)); return; }
      fbVideoPlayer(el, vid, openSeq, fallback);
    });
  }
  // ملف مباشر بمشغّل المتصفح: بالصوت لو المتصفح سمح (العميل لسه ضاغط على الكارت)، وإلا من غير صوت وزرار الصوت في المشغّل
  function playNative(el, src, poster) {
    el.innerHTML = '<video class="real-video" controls playsinline preload="auto"' + (poster ? ' poster="' + esc(poster) + '"' : '') +
      '><source src="' + esc(src) + '" type="video/mp4"></video>';
    var v = el.querySelector('video'), p = v.play && v.play();
    if (p && p.catch) p.catch(function () { v.muted = true; var q = v.play(); if (q && q.catch) q.catch(function () { /* العميل يضغط تشغيل */ }); });
  }
  function fbVideoPlayer(el, vid, openSeq, fallback) {
    if (typeof FB === 'undefined' || !FB.XFBML || !FB.Event) { fallback(); return; }
    hookFbVideo();
    var id = 'fbv' + (++fbVideoSeq), done = false, timer = null;
    var giveUp = function () { if (done) return; done = true; delete fbVideoWaiters[id]; fallback(); };
    // العرض بعرض النافذة، والمشغّل بيحسب الارتفاع من نسبة الفيديو نفسه (طولي أو عرضي)
    var w = Math.round(Math.min(420, Math.max(240, el.clientWidth || 320)));
    el.innerHTML = '<div class="fb-video-wrap"><div class="fb-video" id="' + id + '" data-href="' + esc('https://www.facebook.com/video.php?v=' + vid) +
      '" data-width="' + w + '" data-allowfullscreen="true" data-show-text="false"></div></div>';
    fbVideoWaiters[id] = function (player) {
      if (done) return;
      done = true; clearTimeout(timer);
      if (openSeq !== expandSeq) return;
      // بالصوت لوحده: العميل لسه ضاغط على الكارت، والإطار واخد إذن التشغيل. لو المتصفح منع الصوت (iOS)، المشغّل بيفضل بأزراره
      try { player.unmute(); player.play(); } catch (e) { /* أزرار المشغّل نفسه */ }
    };
    timer = setTimeout(giveUp, FB_VIDEO_WAIT.render);
    FB.XFBML.parse(el, function () {
      // الرسم خلص: المتاح بيطلّع ready في ثواني، والمش متاح مبيطلّعهوش خالص
      if (done) return;
      clearTimeout(timer);
      timer = setTimeout(giveUp, FB_VIDEO_WAIT.ready);
    });
  }
  // البديل الأخير: معاينة الإعلان كما يظهر على المنصة — أول صيغة بترجع، من غير تبويبات، ومعاها السبب
  function metaPreviewOnly(c, el, openSeq) {
    var order = c.igPreview ? ['reels', 'ig', 'fb'] : ['fb', 'ig', 'reels'];
    var note = '<p class="pv-hint">' + esc(t('x.pv.noDirect')) + '</p>';
    (function tryFormat(i) {
      if (openSeq !== expandSeq) return;
      if (i >= order.length) { el.innerHTML = previewMarkup(c) + '<p class="pv-hint">' + esc(t('x.videoFailed')) + '</p>'; return; }
      var k = order[i], key = c.id + '|' + k;
      var show = function (frame) { el.innerHTML = '<div class="video-embed-wrap">' + frame + '</div>' + note; fitEmbeds(el); };
      if (previewCache[key]) { show(previewCache[key]); return; }
      var params = { ad_format: PREVIEW_FORMATS[k] }, size = PREVIEW_REQUEST[k];
      if (size) { params.width = size.width; params.height = size.height; }
      metaApi('/' + c.id + '/previews', params, function (resp) {
        if (openSeq !== expandSeq) return;
        var frame = resp && resp.data && resp.data[0] && metaIframeHtml(resp.data[0].body, metaPreviewSize(resp.data[0].body, k));
        if (frame) { previewCache[key] = frame; show(frame); } else tryFormat(i + 1);
      });
    })(0);
  }

  function showMedia(c) {
    var openSeq = ++expandSeq;
    var el = document.getElementById('expandPreview');
    el.innerHTML = previewMarkup(c);
    el.onclick = null;
    if (c.platform === 'Snapchat' && (c.videoSrc || c.snapCreativeId)) { snapMediaView(c, el, openSeq); return; }
    if (c.platform !== 'Meta' || !(c.videoId || c.catalog)) return;
    // فيديو Meta (مش كتالوج): عرض واحد بالصوت بيشتغل لوحده، من غير تبويبات (metaVideoView — ٣ نوفمبر ٢٠٢٦)
    if (c.videoId && !c.catalog) { metaVideoView(c, el, openSeq); return; }
    // الكتالوج: أزرار صيغ (إنستغرام الأول لو ليه حساب إنستغرام)
    var order = c.igPreview ? ['ig', 'reels', 'fb'] : ['fb', 'ig', 'reels'], poster = el.innerHTML;
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
      // مفيش منتجات = الكارت كان بيفضل خلفية فاضية من غير أي كلام (حساب حقيقي ٢ نوفمبر ٢٠٢٦ — Coda).
      // دلوقتي بيقول السبب: المجموعة فاضية عند Snapchat، ولا إحنا مقدرناش نقراها
      var showItems = function (items, why) {
        if (openSeq !== expandSeq) return;
        if (!items || !items.length) {
          el.innerHTML = previewMarkup(c) +
            '<p class="snap-set-note">' + esc(t(setNoteKey(why))) + '</p>' +
            '<div class="snap-page"></div>';
          return;
        }
        el.innerHTML = catalogGridHtml(items.map(function (p) {
          return { image: p.image, name: p.name, price: p.price && p.price.value > 0 ? money(p.price.value, p.price.currency || c.currency) : '', url: p.url };
        }), t('dx.plat.snapchat')) + '<div class="snap-page"></div>';
        if (!c.snapDynamic && c.snapCreativeId) ask().then(function () { if (openSeq === expandSeq) pageBtn(); });
      };
      el.innerHTML = previewMarkup(c) + '<div class="snap-page"></div>';
      var errOf = function () { return typeof snapProductErr !== 'undefined' ? snapProductErr[c.snapProductSetId] : ''; };
      if (typeof snapProducts !== 'undefined' && snapProducts[c.snapProductSetId]) showItems(snapProducts[c.snapProductSetId], errOf());
      else apiPost('/api/snapchat-ads-fetch', { accessToken: snapchatAccessToken, action: 'products', productSetId: c.snapProductSetId }).then(function (res) {
        var ok = res.ok && res.data && Array.isArray(res.data.products);
        var list = ok ? res.data.products : [];
        var why = ok ? { code: res.data.error || '', status: res.data.setStatus || null } : { code: 'net', status: null };
        if (typeof snapProducts !== 'undefined') snapProducts[c.snapProductSetId] = list;
        if (typeof snapProductErr !== 'undefined') snapProductErr[c.snapProductSetId] = why;
        showItems(list, why);
      }, function () { showItems([], { code: 'net', status: null }); });
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
    // الملف المباشر الأول، ثم تضمين فيسبوك، ثم رابط خارجي — محتاجة صلاحية على صفحة الفيديو
    // (من غيرها: «Application does not have permission»).
    // الترتيب اتقلب في ٢ نوفمبر ٢٠٢٦: الملف المباشر بيتعرض بمشغّل المتصفح نفسه، فالصوت وأزرار التحكم
    // تحت إيد العميل. تضمين فيسبوك إطار من نطاق تاني، والمتصفح بيمنع الصوت جوّاه لو الفيديو بدأ لوحده
    metaApi('/' + c.videoId, { fields: 'embed_html,source,permalink_url,picture' }, function (vidResp) {
      if (openSeq !== expandSeq) return;
      var mediaHtml = '';
      var embedFrame = vidResp && metaIframeHtml(vidResp.embed_html);
      var videoSrc = vidResp && safeUrl(vidResp.source);
      var posterSrc = vidResp && safeUrl(vidResp.picture);
      if (videoSrc) {
        // الملف المباشر أحسن من تضمين فيسبوك هنا: مشغّل المتصفح نفسه بصوت وتقديم وملء شاشة، والعميل هو اللي
        // بيضغط تشغيل فالصوت مسموح (المتصفح بيمنع الصوت للي بيشتغل لوحده بس)
        mediaHtml = '<video class="real-video" controls playsinline preload="metadata"' +
          (posterSrc ? ' poster="' + esc(posterSrc) + '"' : '') +
          '><source src="' + esc(videoSrc) + '" type="video/mp4"></video>';
      } else if (embedFrame) {
        mediaHtml = '<div class="video-embed-wrap">' + embedFrame + '</div>';
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
    // الترتيب مهم: الزرار جوه كارت الحملة، وكارت المجموعة شايل كلاس campaign-card نفسه (نفس الشكل)
    var sets = e.target.closest('[data-campaign-sets]');
    if (sets) { openCampaignSets(sets); return true; }
    var aset = e.target.closest('[data-adset]');
    if (aset) { openAdset(aset); return true; }
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

  // صفحة التنبيهات على «الآن» دايماً (analysisNow) — زي البريد
  function renderAlerts() {
    var s = analysisNow.summary;
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
      alertsListEl.innerHTML = '<div class="empty-state">' + esc(t('alerts.loginFirst')) + '</div>';
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

    var list = analysisNow.alerts.filter(function (a) {
      if (alertsLevelFilter === 'urgent') return a.level === 'critical' || a.level === 'warning';
      if (alertsLevelFilter === 'risk') return a.atRisk && a.amount > 0;
      return a.level === alertsLevelFilter;
    });
    alertsListEl.innerHTML = list.length
      ? list.map(alertMarkup).join('')
      : '<div class="empty-state">' + esc(t(alertsLevelFilter === 'urgent' ? 'alerts.noneUrgent' : 'alerts.noneType')) + '</div>';
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
  // «استعادة القيم الافتراضية» (قرار صاحب المنتج)، والعائد المستهدف فاضي لحد ما العميل يحدده.
  // نفس الجزء الأساسي بيظهر في نافذة أول مرة (welcomeOverlay تحت)
  var settingsOverlay = document.getElementById('settingsOverlay');
  var settingsForm = document.getElementById('settingsForm');
  var SETTING_UNITS = i18nMap({ multiple: 'unit.multiple', ratio: 'unit.ratio', days: 'unit.days', times: 'unit.times', count: 'unit.count' });
  // من ٨ نوفمبر ٢٠٢٦ المستهدف بس (حد الخسارة اتشال — قرار صاحب المنتج)
  var MAIN_SETTINGS = { roasTarget: true };
  var MAIN_ORDER = ['roasTarget'];

  // copyKey = نص الشاشة الأساسية بلغة صاحب المتجر (goal.*) بدل اسم الحد الفني (set.*) اللي في «المتقدمة»
  // value = null (العائد المستهدف لسه مش محدد) = خانة فاضية
  function settingRow(m, value, copyKey) {
    var shown = value == null ? '' : (m.kind === 'ratio' ? Math.round(value * 100) : value);
    var step = m.kind === 'multiple' ? '0.1' : '1';
    var label = copyKey ? t(copyKey) : m.label, help = copyKey ? t(copyKey + '.help') : m.help;
    // نص مش number: خانة الأرقام بتعتبر «٢٫٥» أو «2,5» قيمة فاضية، فكانت بتتشال في صمت وترجع للافتراضي
    return '<label class="setting-row"><span class="setting-text"><span class="setting-label">' + esc(label) + '</span><span class="setting-help">' + esc(help) + '</span></span>' +
      '<span class="setting-input"><input type="text" inputmode="decimal" dir="ltr" autocomplete="off" spellcheck="false" data-step="' + step + '" name="' + m.key + '" value="' + shown + '"><span class="setting-unit">' + SETTING_UNITS[m.kind] + '</span></span></label>';
  }
  // هدف المتجر (العائد المستهدف)
  function settingsCoreHtml(current) {
    var byKey = {};
    PauseProofAlerts.SETTINGS_META.forEach(function (m) { byKey[m.key] = m; });
    return '<fieldset class="settings-group"><legend>' + t('settings.goals') + '</legend>' +
      MAIN_ORDER.map(function (k) { return settingRow(byKey[k], current[k], 'goal.' + k); }).join('') +
      '</fieldset>';
  }

  // نطاق النافذة (قرار صاحب المنتج ٨ نوفمبر ٢٠٢٦: «تسجل الارقام لكل حساب اعلاني في كل منصة لكل مستخدم، بحيث عند تبديل الحساب
  // الاعلاني يتغير معها العائد المطلوب وباقي اعدادات التنبيهات»): تبويب لكل حساب إعلاني متصل، والنطاق هو مفتاح الحساب نفسه
  // («منصة:رقم الحساب» = sourceOf = alerts.js acctKey). الحساب اللي مالوش سجل بيعرض إعدادات المستخدم القديمة كقيم بداية، وأول حفظ
  // بيخلّيه مستقل — فمفيش «كل الحسابات» ولا «تخصيص/إلغاء تخصيص» (كانوا قرار ٢٦ أكتوبر).
  // مراجعة ٣١ أكتوبر: تعديلات كل تبويب بتفضل لحد «حفظ» (settingsPending — التبويب اللي اتعدّل بيتحقق منه قبل ما تسيبه)، و«حفظ»
  // بيحفظها كلها مرة واحدة. قبل كده كان بيحفظ التبويب الظاهر بس ويقفل، فتعديل تبويب تاني كان بيضيع من غير ما حد يعرف («منع الخطأ»
  // — Nielsen Norman Group). التبويب اللي فيه تعديل متحفظش عليه «•». ✕ أو Esc = إلغاء التعديلات كلها
  var settingsScope = '', settingsPending = {}, settingsDirty = false, settingsFormState = 'loading', settingsSaving = false, settingsCostCur = null;
  var settingsSaveBtn = document.getElementById('settingsSave');
  function settingsSources() { return PLATFORMS.map(sourceOf).filter(Boolean); }
  // سجل الحساب نفسه لو موجود (مفتاح الحساب = المصدر)
  function ownAcct(scope) { return userSet && userSet.acct && userSet.acct[scope] ? userSet.acct[scope] : null; }
  // عنده أرقام قديمة بتتورّث للحساب ده (إعدادات منصته، وإلا «كل حساباته») — عشان نقول إنها قيم بداية
  function inheritedAny(scope) {
    if (!userSet || !scope) return false;
    var plat = userSet.plat ? userSet.plat[platformOfSource(scope)] : null;
    var set = plat || userSet.all;
    return !!(set && Object.keys(set).length);
  }
  // اسم الحساب في التبويب (الاسم اللي في قائمة الحسابات، وإلا رقمه)
  function scopeName(scope) {
    var p = platformOfSource(scope);
    return accountLabel(p) || scope.slice(p.length + 1);
  }
  // أرقام الحساب اللي النافذة بتعدّلها: تعديل متحفظش، وإلا سجله زي ما هو، وإلا أرقامه الموروثة كبداية بعملة الحساب نفسه
  // (settingsForAccount بيحوّل أقصى التكلفة بسعر الربط الرسمي زي ما المحرك بيعمل بالظبط، فاللي معروض هو اللي بيتحكم بيه فعلاً).
  // وعملة الحساب لسه مجهولة (إعلاناته بتتحمّل): الموروث زي ما هو بعملته المحفوظة — التحويل بيحصل وقت الحكم، ومن غير كده كان
  // الحفظ بيشيل حدود التكلفة الموروثة في صمت
  function scopeSet(scope) {
    if (!userSet || !scope) return null;
    if (settingsPending[scope]) return settingsPending[scope];
    var own = ownAcct(scope);
    if (own) return JSON.parse(JSON.stringify(own));
    var p = platformOfSource(scope), cur = sourceCurrency(scope);
    var plat = userSet.plat ? userSet.plat[p] : null;
    var out = JSON.parse(JSON.stringify(cur
      ? PauseProofAlerts.settingsForAccount(userSet, p, cur, DX.pegRate, scope.slice(p.length + 1))
      : (plat || userSet.all || {})));
    if (cur && out.maxCost) {
      // الحد المحوَّل بخانتين زي ما الحفظ بيخزّنه بالظبط (readSettingsForm) — من غير كده الخانة بتعرض ٩٫٣٧٥ والحفظ بيخلّيها ٩٫٣٨
      var conv = {};
      Object.keys(out.maxCost).forEach(function (k) { conv[k] = Math.round(out.maxCost[k] * 100) / 100; });
      out.maxCost = conv;
      out.maxCostCur = cur;
    }
    // حدود الحملات الموروثة: الحملات اللي ثابت إنها في الحساب ده (من إعلاناته المحمّلة) بس — الحملة بتبع حساب واحد، فتوريث حد لحملة
    // مش عارفين حسابها غلط، وكان هيظهر كصف «حملة رقم …» على كل التبويبات. بخلاف أقصى تكلفة الأنواع: دي للحساب كله فبتتورّث دايماً
    if (out.campaignMaxCost) {
      var mine = {};
      candidates.forEach(function (c) { if (c.campaignId && c.source === scope) mine[String(c.campaignId)] = true; });
      Object.keys(out.campaignMaxCost).forEach(function (id) { if (!mine[id]) delete out.campaignMaxCost[id]; });
      if (!Object.keys(out.campaignMaxCost).length) delete out.campaignMaxCost;
    }
    return out;
  }
  // الحساب اللي النطاق بيتطبّق عليه (أنواع النتائج والحملات في قسم التكلفة) — حساب واحد بالظبط
  function scopeSources(scope) { return scope ? [scope] : []; }
  // مالوش سجل ولا حساب متصل (النقل مستني حساب): الخانات على قيم البداية، والحفظ بيعمل السجل
  function settingsStateNow() {
    if (userSetState === 'ready' || (userSetState === 'migrate' && !settingsSources().length)) return 'ready';
    return userSetState === 'error' ? 'error' : 'loading';
  }
  function scopeHtml(scope) {
    var srcs = settingsSources();
    // مفيش حساب متصل: مفيش حساب نظبّط إعداداته (الإعدادات لكل حساب)
    if (!srcs.length || !scope) return '<div class="settings-account"><p class="settings-where">' + esc(t('settings.scope.none')) + '</p></div>';
    var tabs = srcs.length > 1 ? '<div class="settings-scope" role="group" aria-label="' + esc(t('settings.scope.aria')) + '">' +
      srcs.map(function (s) {
        var unsaved = settingsPending[s] ? ' title="' + esc(t('settings.scope.unsaved')) + '"' : '';
        return '<button type="button" class="chip' + (s === scope ? ' active' : '') + '" data-settings-scope="' + esc(s) + '" aria-pressed="' + (s === scope) + '"' + unsaved + '>' +
          esc(PLATFORM_NAMES[platformOfSource(s)] + ' — ' + scopeName(s)) + (settingsPending[s] ? ' •<span class="sr-only"> ' + esc(t('settings.scope.unsaved')) + '</span>' : '') + '</button>';
      }).join('') + '</div>' : '';
    var note = t('settings.scope.acctNote', { account: scopeName(scope), platform: PLATFORM_NAMES[platformOfSource(scope)] });
    // قيم بداية موروثة: بنقولها صريح عشان مايفتكرش إنها محفوظة للحساب ده
    var start = !ownAcct(scope) && inheritedAny(scope) ? '<p class="settings-where">' + esc(t('settings.scope.start')) + '</p>' : '';
    return '<div class="settings-account">' + tabs + '<p class="settings-where">' + esc(note) + '</p>' + start + '</div>';
  }

  // ---------- أقصى تكلفة مقبولة لكل نتيجة (مراجعة الإعدادات ٢٤ أكتوبر ٢٠٢٦ — قرار صاحب المنتج) ----------
  // لكل إعلان نتايجه معروفة — نفس شرط المحرك (alerts.js maxCost). ومن ٢٥ أكتوبر لإعلانات المبيعات كمان (صاحب المنتج: «عاجلة لأنها…
  // تكلفة الطلب أعلى من الحد الأقصى» — الحد بيتطبّق مع العائد، وأي واحد فيهم بيكفي). لكل نوع نتيجة، ولكل حملة لوحدها (متجر بفئات
  // أسعار مختلفة: تكلفة الطلب بتختلف من حملة لحملة) — الحملة قبل النوع. الأنواع والحملات من إعلانات الحسابات المفتوحة في النطاق،
  // واللي محفوظ ومش ظاهر دلوقتي (حملة خلصت، أو الإعلانات لسه بتتحمّل) بيظهر برقمه عشان يتعدّل أو يتشال. والوصول برّه: «أقصى
  // تكلفة لكل شخص» وحدة مالهاش معنى عملي (تكلفة الشخص أجزاء من السنت — كانت بتظهر «٠ $ لكل شخص»).
  // من ٢٦ أكتوبر (إعدادات لكل مستخدم): حد النوع بعملة واحدة للمجموعة (maxCostCur — المحفوظة، وإلا عملة الحسابات، وإلا عملة الأرقام
  // المجمّعة) وبيتحوّل لعملة كل حساب بسعر الربط الرسمي؛ حد الحملة بعملة حسابها
  function costAds(sources) {
    return candidates.filter(function (c) {
      return sources.indexOf(c.source) > -1 && c.results != null && c.resultKey !== 'reach';
    });
  }
  // التكلفة الصغيرة بخانات كفاية (core.js fmtNum — نقرة بـ٠٫٠٤ مش «٠ $»)
  function costNow(spend, results, key, cur) {
    return results > 0 && spend > 0 ? t('settings.cost.now', { cpr: money(spend / results, cur), one: t('res1.' + (key || 'generic')) }) : '';
  }
  function costCurrencyOf(sources, ads, saved) {
    if (saved) return saved;
    var bySpend = {};
    ads.forEach(function (c) { if (c.currency) bySpend[c.currency] = (bySpend[c.currency] || 0) + (periodOf(c).spend || 0); });
    sources.forEach(function (s) { var k = sourceCurrency(s); if (k && !(k in bySpend)) bySpend[k] = 0; });
    var keys = Object.keys(bySpend);
    return keys.length === 1 ? keys[0] : (targetCurrency(bySpend) || keys[0] || null);
  }
  function costRate(from, to) { return !from || !to || from === to ? 1 : DX.pegRate(from, to); }
  function costTargets(sources, current, saved) {
    var ads = costAds(sources), types = {}, camps = {}, odd = {}, conv = false, curs = {};
    var cur = costCurrencyOf(sources, ads, Object.keys(current.maxCost).length ? saved : null);
    ads.forEach(function (c) {
      var p = periodOf(c), sp = p.spend || 0, rs = p.results || 0, rate = costRate(c.currency, cur);
      if (c.currency) curs[c.currency] = true;
      if (c.resultKey) {
        var tp = types[c.resultKey] || (types[c.resultKey] = { key: c.resultKey, spend: 0, results: 0 });
        if (rate) { tp.spend += sp * rate; tp.results += rs; }
      }
      if (c.campaignId) {
        var cp = camps[c.campaignId] || (camps[c.campaignId] = { id: String(c.campaignId), name: c.campaignName || '', spend: 0, results: 0, keys: {}, cur: c.currency || null, plat: platformOfSource(c.source) });
        cp.spend += sp; cp.results += rs;
        if (c.resultKey) cp.keys[c.resultKey] = true;
      }
    });
    sources.forEach(function (s) {
      var k = sourceCurrency(s);
      if (k) curs[k] = true;
      if (!k || !cur || k === cur) return;
      if (DX.pegRate(k, cur)) conv = true; else odd[k] = true;
    });
    Object.keys(current.maxCost).forEach(function (k) { if (!types[k]) types[k] = { key: k, spend: 0, results: 0 }; });
    Object.keys(current.campaignMaxCost).forEach(function (id) { if (!camps[id]) camps[id] = { id: id, name: '', spend: 0, results: 0, keys: {}, cur: null, plat: null }; });
    var bySpend = function (a, b) { return b.spend - a.spend; };
    var plats = {};
    sources.forEach(function (s) { plats[platformOfSource(s)] = true; });
    return {
      types: Object.keys(types).map(function (k) { return types[k]; }).sort(bySpend), camps: Object.keys(camps).map(function (k) { return camps[k]; }).sort(bySpend),
      currency: cur, odd: Object.keys(odd), converted: conv, manyPlatforms: Object.keys(plats).length > 1,
      // عملة واحدة معروفة في النطاق — حملة محفوظة مش ظاهرة (عملتها مجهولة) بتاخدها، وإلا من غير عملة (مراجعة ٣١ أكتوبر: كانت بتاخد
      // عملة المجموعة حتى لو حسابها بعملة تانية)
      oneCurrency: Object.keys(curs).length <= 1
    };
  }
  function costRow(name, label, help, value, unit, placeholder) {
    return '<label class="setting-row"><span class="setting-text"><span class="setting-label">' + esc(label) + '</span>' + (help ? '<span class="setting-help">' + esc(help) + '</span>' : '') + '</span>' +
      '<span class="setting-input"><input type="text" inputmode="decimal" dir="ltr" autocomplete="off" spellcheck="false" data-cost="' + esc(name) + '" value="' + (value != null ? esc(String(value)) : '') + '"' +
      (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + '><span class="setting-unit">' + esc(unit) + '</span></span></label>';
  }
  function costSectionHtml(sources, current, saved) {
    var tg = costTargets(sources, current, saved), unit = currencyLabel(tg.currency);
    settingsCostCur = tg.currency;
    var typeRows = tg.types.map(function (x) {
      return costRow('type:' + x.key, t('settings.cost.type', { one: t('res1.' + x.key) }), costNow(x.spend, x.results, x.key, tg.currency), current.maxCost[x.key], unit);
    }).join('');
    var campRows = tg.camps.map(function (x) {
      var keys = Object.keys(x.keys), one = keys.length === 1 ? keys[0] : null, ccur = x.cur || (tg.oneCurrency ? tg.currency : null);
      // حد النوع ظاهر خافت جوه خانة الحملة — بعملة الحملة (مش مربوطة أو مجهولة = من غيره)
      var r = one && ccur && current.maxCost[one] ? costRate(tg.currency, ccur) : null;
      var inherited = r ? String(Math.round(current.maxCost[one] * r * 100) / 100) : '';
      var help = [tg.manyPlatforms && x.plat ? PLATFORM_NAMES[x.plat] : '', DX.listText(keys.map(function (k) { return t('res.' + k); })), costNow(x.spend, x.results, one, ccur)].filter(Boolean).join(' — ');
      return costRow('camp:' + x.id, x.name || t('settings.cost.campId', { id: x.id }), help, current.campaignMaxCost[x.id], ccur ? currencyLabel(ccur) : '', inherited);
    }).join('');
    var anyCamp = Object.keys(current.campaignMaxCost).length > 0;
    var notes = (tg.converted && typeRows ? '<p class="settings-where">' + esc(t('settings.cost.conv', { cur: unit })) + '</p>' : '') +
      (tg.odd.length && typeRows ? '<p class="settings-where">' + esc(t('settings.cost.odd', { currencies: DX.listText(tg.odd.map(function (k) { return currencyLabel(k) || k; })), cur: unit })) + '</p>' : '');
    return '<fieldset class="settings-group" data-cost-section><legend>' + esc(t('settings.cost.title')) + '</legend>' +
      '<p class="settings-where">' + esc(t('settings.cost.help')) + '</p>' +
      (typeRows || '<p class="settings-where">' + esc(t('settings.cost.none')) + '</p>') + notes +
      (campRows ? '<details class="settings-camps"' + (anyCamp ? ' open' : '') + '><summary>' + esc(t('settings.cost.camps')) + '</summary>' +
        '<p class="settings-where">' + esc(t('settings.cost.campsHelp')) + '</p>' + campRows + '</details>' : '') +
      '</fieldset>';
  }
  function renderSettingsForm() {
    var state = settingsFormState = settingsStateNow();
    var errEl = document.getElementById('settingsError');
    if (errEl) errEl.textContent = '';
    settingsDirty = false;
    if (state !== 'ready') {
      settingsSaveBtn.disabled = true;
      settingsForm.innerHTML = state === 'loading'
        ? '<p class="settings-where" role="status">' + esc(t('settings.loading')) + '</p>'
        : '<p class="settings-where err" role="status">' + esc(t('settings.err.load')) + '</p>' +
          '<div class="settings-retry"><button type="button" class="ghost-btn" data-settings-retry>' + esc(t('settings.retry')) + '</button></div>';
      return;
    }
    var srcs = settingsSources();
    if (srcs.indexOf(settingsScope) < 0) settingsScope = srcs[0] || '';
    var set = scopeSet(settingsScope);
    settingsSaveBtn.disabled = settingsSaving || !set;
    if (!set) { settingsForm.innerHTML = scopeHtml(settingsScope); return; }
    var current = PauseProofAlerts.mergeSettings(set);
    var groups = {};
    PauseProofAlerts.SETTINGS_META.forEach(function (m) {
      if (MAIN_SETTINGS[m.key]) return;
      (groups[m.group] = groups[m.group] || []).push(m);
    });
    var advancedHtml = '<details class="settings-advanced"><summary>' + t('settings.advanced') + '</summary>' +
      Object.keys(groups).map(function (g) {
        return '<fieldset class="settings-group"><legend>' + esc(g) + '</legend>' + groups[g].map(function (m) { return settingRow(m, current[m.key]); }).join('') + '</fieldset>';
      }).join('') + '</details>';
    settingsForm.innerHTML = scopeHtml(settingsScope) + settingsCoreHtml(current) + costSectionHtml(scopeSources(settingsScope), current, set.maxCostCur) + advancedHtml;
  }
  // كتب حاجة في التبويب الظاهر (التبديل بيتحقق منها ويحتفظ بيها، والتحديث من جهاز تاني ميمسحهاش)
  settingsForm.addEventListener('input', function () { settingsDirty = true; });
  // سجل المستخدم وصل والنافذة مستنياه — بنرسمها (مش وهو بيكتب: الخانات مبتظهرش غير في حالة ready)
  function settingsArrived() {
    if (!settingsOverlay.classList.contains('hidden') && settingsFormState !== 'ready') renderSettingsForm();
  }
  // تعديل من جهاز تاني وصل والنافذة مفتوحة: بنرسمها بالجديد لو المستخدم لسه مكتبش حاجة في التبويب الظاهر (اللي اتكتب بيفضل،
  // والحفظ بالمجموعات اللي اتغيّرت بس)
  function settingsRefreshed() {
    if (settingsOverlay.classList.contains('hidden') || settingsSaving || settingsDirty) return;
    renderSettingsForm();
  }
  // قيم التبويب الظاهر بعد التحقق — null لو فيها خطأ (بيظهر جنب الخانة)
  function scopeFromForm() {
    clearSettingsErrors();
    var r = readSettingsForm();
    if (showSettingsErrors(r, settingsErrorEl)) return null;
    var set = withKept(scopeSet(settingsScope) || {}, r.values, r.managed);
    if (set.maxCost && r.managed.indexOf('maxCostCur') > -1 && settingsCostCur) set.maxCostCur = settingsCostCur;
    return set;
  }
  // قبل ما يسيب التبويب: اللي اتكتب فيه بيتحقق منه ويفضل لحد «حفظ» (false = فيه خطأ، والتبويب مبيتغيّرش)
  function stashScope() {
    if (!settingsDirty || !scopeSet(settingsScope)) return true;
    var set = scopeFromForm();
    if (!set) return false;
    settingsPending[settingsScope] = set;
    return true;
  }
  settingsForm.addEventListener('click', function (e) {
    var tab = e.target.closest('[data-settings-scope]');
    if (tab) {
      if (settingsSaving || !stashScope()) return;
      settingsScope = tab.getAttribute('data-settings-scope');
      renderSettingsForm();
      // التركيز بيرجع للتبويب المختار بعد الرسم (WAI-ARIA Authoring Practices — كان بيضيع لأول الصفحة)
      var chip = settingsForm.querySelector('[data-settings-scope="' + settingsScope + '"]');
      if (chip) chip.focus();
      return;
    }
    if (e.target.closest('[data-settings-retry]')) { userSetState = 'none'; userSetFails = 0; pullUserSettings(); renderSettingsForm(); }
  });

  // فتح النافذة: أحدث نسخة من السيرفر (تعديل من جهاز تاني — مراجعة ٣١ أكتوبر)، وإعادة الطلب لو المحاولة الأولى فشلت (مش بنعرض خانات
  // قبل ما نعرف اللي محفوظ). بتفتح على حساب المنصة المختارة في الفلتر، وإلا أول حساب متصل
  function openAlertSettings() {
    if (userSetState === 'error') { userSetState = 'none'; userSetFails = 0; }
    pullUserSettings();
    refreshUserSettings();
    settingsPending = {};
    var one = platSel && platSel.length === 1 ? sourceOf(platSel[0]) : null;
    settingsScope = one || settingsSources()[0] || '';
    renderSettingsForm();
    settingsOverlay.classList.remove('hidden');
  }
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
      if (txt === '') return; // فاضي: الحد بقيمة البداية، والعائد المستهدف مش محدد (حكم الربح بيستنى)
      var raw = /^\d*\.?\d+$/.test(txt) ? parseFloat(txt) : NaN;
      if (!isFinite(raw) || raw < m.min || raw > m.max) {
        errors.push({ input: input, text: t('set.err.range', { min: numAr(m.min), max: numAr(m.max) }) });
        return;
      }
      next[m.key] = m.kind === 'ratio' ? raw / 100 : raw;
    });
    var eff = PauseProofAlerts.mergeSettings(next);
    PauseProofAlerts.SETTINGS_ORDER.forEach(function (o) {
      if (eff[o[0]] != null && eff[o[1]] != null && eff[o[0]] > eff[o[1]] && inputOf(o[1])) errors.push({ input: inputOf(o[1]), text: t(o[2]) });
    });
    // أقصى تكلفة لكل نوع نتيجة ولكل حملة (لو القسم ظاهر): فاضي = مفيش حد، وأي مبلغ أكبر من صفر. فاصل الآلاف زي خانات الأيام:
    // «1,500» = ١٥٠٠ مش ١٫٥، و«12,5» = ١٢٫٥. managed = اللي النافذة بتتحكم فيه (فاضي = اتشال)، والباقي بيفضل زي ما هو في السجل
    var managed = [];
    if (root.querySelector('[data-cost-section]')) {
      managed = ['maxCost', 'campaignMaxCost', 'maxCostCur'];
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
  // اللي النافذة مبتعرضوش بيفضل زي ما هو في المجموعة (KEPT_KEYS — حماية لو قسم التكلفة مش ظاهر)
  var KEPT_KEYS = ['maxCost', 'campaignMaxCost', 'maxCostCur'];
  function withKept(prev, values, managed) {
    var out = Object.assign({}, values);
    KEPT_KEYS.forEach(function (k) { if ((managed || []).indexOf(k) < 0 && !(k in out) && prev && prev[k]) out[k] = prev[k]; });
    return out;
  }
  // الحفظ في سجل المستخدم (السيرفر) — النافذة بتفضل مفتوحة لحد ما يتأكد، والفشل بيظهر فيها بسببه
  function saveErrText(e) { return t(e && e.code === 'too many' ? 'settings.err.tooMany' : 'settings.err.save'); }
  function setSaving(btn, on, idleKey) {
    settingsSaving = on;
    btn.disabled = on;
    btn.textContent = t(on ? 'settings.saving' : idleKey);
  }
  // «حفظ»: التبويب الظاهر (بعد التحقق) وكل تبويب اتعدّل قبله، في طلب واحد بالمجموعات اللي اتغيّرت بس
  settingsSaveBtn.addEventListener('click', function () {
    if (settingsSaving || settingsFormState !== 'ready') return;
    if (scopeSet(settingsScope)) {
      var set = scopeFromForm();
      if (!set) return;
      settingsPending[settingsScope] = set;
    }
    var scopes = Object.keys(settingsPending), acct = {};
    if (!scopes.length) return;
    scopes.forEach(function (s) { acct[s] = settingsPending[s]; });
    setSaving(settingsSaveBtn, true, 'settings.save');
    // شاف سؤال المستهدف هنا وسابه فاضي بقصد — نافذة أول مرة متسألهوش تاني على أي جهاز
    writeUserSettings({ changes: { acct: acct }, asked: true }).then(function () {
      setSaving(settingsSaveBtn, false, 'settings.save');
      settingsPending = {};
      settingsOverlay.classList.add('hidden');
      render();
    }, function (e) {
      setSaving(settingsSaveBtn, false, 'settings.save');
      settingsErrorEl.textContent = saveErrText(e);
    });
  });

  // ---------- نافذة أول مرة: ضبط التنبيهات على أهداف المتجر ----------
  // أول ما المستخدم يفتح حساب وإعداداته مفيهاش مستهدف وحد خسارة لـ«كل الحسابات» (وسجله وصل من السيرفر)، بتظهر مرة واحدة للمستخدم
  // (asked في سجله — مش لكل جهاز): السؤالين عن الفلوس لكل حساباته، مع توضيح إنها بتتعدّل وبتتخصّص لكل منصة من «الإعدادات» ←
  // «إعدادات التنبيهات». «لاحقاً» أو ✕ أو Esc = حكم الربح بيستنى، ومبتظهرش تاني.
  // من ٣١ أكتوبر الحفظ بالعائد المستهدف بس (goals — بيتدمج في «كل الحسابات» على السيرفر كقيمة بداية لكل حساب)، مش بنسخة الجهاز كلها
  var welcomeOverlay = document.getElementById('welcomeOverlay');
  var welcomeForm = document.getElementById('welcomeForm');
  var welcomeErrorEl = document.getElementById('welcomeError');
  var welcomeSaveBtn = document.getElementById('welcomeSave');
  // علامة الجهاز القديمة (لكل حساب) — بتتقري بس وقت نقل الإعدادات القديمة (legacyMerge)
  var WELCOME_KEY = 'acc.welcome.accounts.v1', welcomeOpen = false, welcomeDone = false;
  function welcomeSeenAll() {
    try { var v = JSON.parse(localStorage.getItem(WELCOME_KEY) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
    catch (e) { return null; }
  }
  function welcomeWanted() {
    return !welcomeDone && settingsKnown() && !userSet.asked && settingsSources().length > 0 &&
      PauseProofAlerts.mergeSettings(userSet.all).roasTarget == null;
  }
  function maybeShowWelcome() {
    if (!welcomeOverlay || !welcomeOverlay.classList.contains('hidden')) return;
    // نافذة تانية مفتوحة (اختيار المنصة مثلاً) — نستنى الرسم الجاي
    if (document.querySelector('.expand-overlay:not(.hidden)')) return;
    if (!welcomeWanted()) return;
    welcomeOpen = true;
    welcomeForm.innerHTML = '<p class="settings-account-name">' + esc(t('welcome.scope')) + '</p>' +
      settingsCoreHtml(PauseProofAlerts.mergeSettings(userSet.all));
    clearSettingsErrors(welcomeForm, welcomeErrorEl);
    welcomeOverlay.classList.remove('hidden');
  }
  // القفل بيتسجّل في سجل المستخدم (asked) عشان متظهرش على جهاز تاني — لو الحفظ فشل بتظهر تاني الجلسة الجاية بس
  function closeWelcome() {
    welcomeDone = true;
    welcomeOpen = false;
    welcomeOverlay.classList.add('hidden');
    if (userSet && !userSet.asked) writeUserSettings({ asked: true }).then(function () {}, function () {});
  }
  welcomeSaveBtn.addEventListener('click', function () {
    if (settingsSaving || !welcomeOpen) return;
    clearSettingsErrors(welcomeForm, welcomeErrorEl);
    var r = readSettingsForm(welcomeForm);
    if (showSettingsErrors(r, welcomeErrorEl)) return;
    // الخانتين فاضيين = «لاحقاً» بس (حكم الربح بيستنى)
    var goals = r.values.roasTarget != null ? { roasTarget: r.values.roasTarget } : null;
    setSaving(welcomeSaveBtn, true, 'welcome.save');
    writeUserSettings(goals ? { goals: goals, asked: true } : { asked: true }).then(function () {
      setSaving(welcomeSaveBtn, false, 'welcome.save');
      closeWelcome();
      render();
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
  function refreshAll() { dxReset(); clearMetaBase(); extraAt = {}; Object.keys(activeSources).forEach(function (p) { loadSource(p, activeSources[p]); }); }
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
