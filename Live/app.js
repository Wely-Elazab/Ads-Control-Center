// =====================================================================
  // !!! هام: عدّل السطر التالي بالـ App ID بتاعك من Meta for Developers !!!
  // =====================================================================
  var META_APP_ID = "2950488078638871";
  var GRAPH_VERSION = 'v21.0';

  var ARABIC_DIGITS = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  function ar(n) { return String(n).replace(/[0-9]/g, function (d) { return ARABIC_DIGITS[d]; }); }
  function digitsAny(n) { return ar(n); }
  function money(n) { var s = Math.round(n || 0).toLocaleString('en-US'); return ar(s.replace(/,/g, '\u066C')) + ' ر.س'; }
  function roasStr(r) { if (!r) return '—'; return '\u00D7' + ar(Math.round(r * 10) / 10); }
  function sinceLabel(n) {
    if (n == null) return '';
    if (n === 0) return 'اليوم';
    if (n === 1) return 'قبل يوم';
    if (n === 2) return 'قبل يومين';
    return 'قبل ' + ar(n) + ' يوماً';
  }
  function daysBetween(dateStr) {
    if (!dateStr) return 0;
    var then = new Date(dateStr);
    return Math.max(0, Math.round((new Date() - then) / 86400000));
  }
  function hashCode(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
    return Math.abs(h);
  }

  // ---------- حماية من XSS ----------
  // أي نص جاي من المنصات (اسم إعلان، عنوان، نص، رابط) كتبه المعلن — ممكن يحتوي HTML أو سكربت.
  // كل حاجة بتدخل innerHTML لازم تعدّي على esc()، وكل رابط على safeUrl()
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  // بيرجّع الرابط بس لو http/https — أي حاجة تانية زي javascript: أو data: بترجع null
  function safeUrl(u) {
    if (!u || u === '—') return null;
    try {
      var parsed = new URL(String(u), window.location.href);
      return (parsed.protocol === 'https:' || parsed.protocol === 'http:') ? parsed.href : null;
    } catch (e) { return null; }
  }
  // HTML المعاينة اللي بيرجع من Meta: بناخد منه الـ iframe بس، وبنتأكد إن مصدره facebook.com
  // بدل ما نحط HTML خام من API جوه الصفحة
  function metaIframeHtml(html) {
    try {
      var doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
      var frame = doc.querySelector('iframe');
      var src = frame && safeUrl(frame.getAttribute('src'));
      if (!src || !/(^|\.)facebook\.com$/i.test(new URL(src).hostname)) return null;
      return '<iframe src="' + esc(src) + '" scrolling="no" allowfullscreen="true" allow="autoplay; encrypted-media; picture-in-picture"></iframe>';
    } catch (e) { return null; }
  }
  var AR_MONTHS_SHORT = ['ينا', 'فبر', 'مار', 'أبر', 'ماي', 'يون', 'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس'];

  // ---------- تواريخ بتوقيت الحساب الإعلاني ----------
  // كل منصة بترجّع التواريخ بتوقيت الحساب نفسه، فلازم مفاتيح الأيام عندنا تتحسب بنفس التوقيت —
  // مش بـ toISOString() (UTC) اللي كان بيزحلق اليوم في أول ساعات الصبح بتوقيت السعودية مثلاً
  var BROWSER_TZ = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } })();
  function todayKeyInTz(tz) {
    var base = { year: 'numeric', month: '2-digit', day: '2-digit' };
    function fmt(opts) {
      var parts = new Intl.DateTimeFormat('en-US', opts).formatToParts(new Date());
      var get = function (t) { return parts.filter(function (x) { return x.type === t; })[0].value; };
      return get('year') + '-' + get('month') + '-' + get('day');
    }
    if (tz) { try { return fmt(Object.assign({ timeZone: tz }, base)); } catch (e) { /* توقيت غير معروف */ } }
    return fmt(base);
  }
  // آخر 7 أيام (من الأقدم للأحدث) منتهية بـ untilKey — حساب تقويمي بحت من غير توقيت
  function last7Days(untilKey) {
    var p = untilKey.split('-').map(Number);
    var out = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] - i));
      out.push({ key: d.toISOString().slice(0, 10), label: ar(d.getUTCDate()) + ' ' + AR_MONTHS_SHORT[d.getUTCMonth()] });
    }
    return out;
  }
  function daysFromRange(range) { return last7Days((range && range.until) || todayKeyInTz(BROWSER_TZ)); }

  var candidates = [];
  var filters = { platform: 'all', format: 'all', status: 'all', text: '', dateFrom: '', dateTo: '', sort: 'launch' };
  var selectedIds = {};

  // ---------- حفظ الجلسة ----------
  // Snapchat وTikTok بيعملوا إعادة توجيه للصفحة كلها، فكل اللي في الذاكرة كان بيضيع
  // (إعلانات Meta/Google المحمّلة قبلها). عشان كده بنحفظ في sessionStorage:
  //   - التوكنز (مع وقت انتهائها) — Meta مش محتاجة، الـ SDK بتاعها بيحتفظ بالجلسة لوحده
  //   - الحساب المحمّل حالياً من كل منصة، وقائمة الحسابات، وبيانات الحسابات (توقيت...)
  // مش بنحفظ الإعلانات نفسها: بنعيد تحميلها من المنصات، فالأرقام دايماً حديثة ومفيش خطر امتلاء التخزين.
  // sessionStorage خاص بالتاب ده بس وبيتمسح لما التاب يتقفل.
  var SESSION_KEY = 'pauseproof.session.v1';
  var sessionTokens = {};    // { google: { token, expiresAt }, snapchat: ..., tiktok: ... }
  var activeSources = {};    // { meta: 'act_1', google: '123', ... }
  var platformOptions = {};  // { google: [{ value, label }], ... }
  // بيانات إضافية لكل حساب (توقيت، login-customer-id لـ Google...) — المفتاح "platform:id"
  var accountInfo = {};

  function saveSession() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        tokens: sessionTokens, active: activeSources, options: platformOptions, accountInfo: accountInfo
      }));
    } catch (e) { /* تخزين مقفول (وضع خاص مثلاً) — الأداة تكمل عادي من غير حفظ */ }
  }
  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
  }
  // بنقرا الجلسة المحفوظة دلوقتي، قبل أي حفظ جديد ممكن يكتب فوقها
  var savedSession = readSession();

  function rememberToken(platform, token, expiresInSec) {
    // بنطرح دقيقة احتياطي عشان منبعتش توكن هينتهي في نص الطلب
    sessionTokens[platform] = { token: token, expiresAt: expiresInSec ? Date.now() + (Number(expiresInSec) - 60) * 1000 : null };
    saveSession();
  }
  function validToken(entry) { return entry && entry.token && (!entry.expiresAt || entry.expiresAt > Date.now()) ? entry.token : null; }

  // بيسمح بتحميل أكتر من منصة في نفس الوقت من غير ما نمسح اللي محمّل قبل كده —
  // لو اخترت حساب تاني من *نفس* المنصة بيستبدل بتاعها بس، ولو من منصة تانية بيتضاف جنبها
  function mergeCandidates(newOnes, sourceKey) {
    var sep = sourceKey.indexOf(':');
    var platform = sourceKey.slice(0, sep);
    candidates = candidates.filter(function (c) { return c.source.slice(0, c.source.indexOf(':')) !== platform; });
    newOnes.forEach(function (c) { c.source = sourceKey; });
    candidates = candidates.concat(newOnes);
    activeSources[platform] = sourceKey.slice(sep + 1);
    saveSession();
  }

  // بيبدّل خيارات منصة واحدة في قائمة الحسابات من غير ما يلمس المنصات التانية.
  // بيستخدم textContent عشان أسماء الحسابات متتفسرش كـ HTML
  function setPlatformOptions(platform, items) {
    var sel = document.getElementById('accountSelect');
    Array.prototype.slice.call(sel.options).forEach(function (o) { if (o.dataset.platform === platform) o.remove(); });
    items.forEach(function (it) {
      var o = document.createElement('option');
      o.value = it.value; o.textContent = it.label; o.dataset.platform = platform;
      sel.appendChild(o);
    });
    sel.classList.toggle('hidden', !sel.options.length);
    platformOptions[platform] = items;
    saveSession();
  }

  var themeToggle = document.getElementById('themeToggle');
  var langToggle = document.getElementById('langToggle');
  var loginMenuBtn = document.getElementById('loginMenuBtn');
  var platformOverlay = document.getElementById('platformOverlay');
  var platformClose = document.getElementById('platformClose');
  var platformMeta = document.getElementById('platformMeta');
  var platformGoogle = document.getElementById('platformGoogle');
  var platformSnapchat = document.getElementById('platformSnapchat');
  var platformTikTok = document.getElementById('platformTikTok');
  var accountSelect = document.getElementById('accountSelect');
  var connectStatus = document.getElementById('connectStatus');
  var filterToggle = document.getElementById('filterToggle');
  var filterBar = document.getElementById('filterBar');
  var textFilter = document.getElementById('textFilter');
  var dateFrom = document.getElementById('dateFrom');
  var dateTo = document.getElementById('dateTo');
  var clearDates = document.getElementById('clearDates');
  var sortSelect = document.getElementById('sortSelect');
  var galleryCount = document.getElementById('galleryCount');
  var selectionSummary = document.getElementById('selectionSummary');
  var stopSelectedBtn = document.getElementById('stopSelectedBtn');
  var alertBanner = document.getElementById('alertBanner');
  var alertText = document.getElementById('alertText');
  var cardGrid = document.getElementById('cardGrid');
  var proofReport = document.getElementById('proofReport');
  var proofTime = document.getElementById('proofTime');
  var proofStatus = document.getElementById('proofStatus');
  var proofDuration = document.getElementById('proofDuration');
  var proofIncident = document.getElementById('proofIncident');
  var printBtn = document.getElementById('printBtn');
  var resetAllBtn = document.getElementById('resetAllBtn');
  var expandOverlay = document.getElementById('expandOverlay');
  var expandClose = document.getElementById('expandClose');
  var selectAllBtn = document.getElementById('selectAllBtn');
  var clearSelBtn = document.getElementById('clearSelBtn');

  themeToggle.addEventListener('click', function () {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) { document.documentElement.removeAttribute('data-theme'); themeToggle.textContent = '☀️'; }
    else { document.documentElement.setAttribute('data-theme', 'dark'); themeToggle.textContent = '🌙'; }
  });
  langToggle.addEventListener('click', function () {
    var isEn = document.documentElement.lang === 'en';
    document.documentElement.lang = isEn ? 'ar' : 'en';
    document.documentElement.dir = isEn ? 'rtl' : 'ltr';
    langToggle.textContent = isEn ? 'EN' : 'العربية';
    // ملاحظة: هذه النسخة التجريبية تبدّل اتجاه الواجهة فقط. بيانات الإعلانات نفسها
    // تُعرض بلغتها الأصلية كما أدخلها المعلن، ولا تُترجم تلقائياً.
  });

  // ---------- Facebook SDK ----------
  // أي كود محتاج FB قبل ما الـ SDK يخلص تحميل (زي استرجاع الجلسة) بيستنى هنا
  var fbReadyQueue = [];
  function whenFbReady(cb) { if (fbReadyQueue) fbReadyQueue.push(cb); else cb(); }
  window.fbAsyncInit = function () {
    FB.init({ appId: META_APP_ID, cookie: true, xfbml: false, version: GRAPH_VERSION });
    var queue = fbReadyQueue; fbReadyQueue = null;
    queue.forEach(function (cb) { cb(); });
  };
  (function (d, s, id) {
    var js, fjs = d.getElementsByTagName(s)[0];
    if (d.getElementById(id)) return;
    js = d.createElement(s); js.id = id;
    js.src = 'https://connect.facebook.net/en_US/sdk.js';
    fjs.parentNode.insertBefore(js, fjs);
  }(document, 'script', 'facebook-jssdk'));

  // ---------- Google Identity Services SDK ----------
  (function (d, s, id) {
    var js, fjs = d.getElementsByTagName(s)[0];
    if (d.getElementById(id)) return;
    js = d.createElement(s); js.id = id; js.async = true; js.defer = true;
    js.src = 'https://accounts.google.com/gsi/client';
    fjs.parentNode.insertBefore(js, fjs);
  }(document, 'script', 'google-identity-sdk'));

  loginMenuBtn.addEventListener('click', function () { platformOverlay.classList.remove('hidden'); });
  platformClose.addEventListener('click', function () { platformOverlay.classList.add('hidden'); });
  platformOverlay.addEventListener('click', function (e) { if (e.target === platformOverlay) platformOverlay.classList.add('hidden'); });

  platformMeta.addEventListener('click', function () { platformOverlay.classList.add('hidden'); loginWithMeta(); });
  platformGoogle.addEventListener('click', function () { platformOverlay.classList.add('hidden'); loginWithGoogle(); });
  if (platformSnapchat) { platformSnapchat.addEventListener('click', function () { loginWithSnapchat(); }); }
  if (platformTikTok) { platformTikTok.addEventListener('click', function () { loginWithTikTok(); }); }

  function loginWithMeta() {
    if (typeof FB === 'undefined') {
      connectStatus.textContent = 'الـ SDK لسه بيتحمّل، جرّب تاني خلال ثانية.';
      return;
    }
    connectStatus.textContent = 'جارٍ فتح نافذة تسجيل الدخول بحساب Meta…';
    FB.login(function (response) {
      if (response.authResponse) { loadAdAccounts(); }
      else { connectStatus.textContent = 'تم إلغاء تسجيل الدخول.'; }
    }, { scope: 'ads_read,business_management' });
  }

  // ---------- Google Identity Services (خطوة تسجيل الدخول فقط دلوقتي) ----------
  // !!! هام: عدّل بالـ Client ID بتاعك من Google Cloud Console !!!
  var GOOGLE_CLIENT_ID = "755601072390-jvljtdc8799o59fjffvtq43p70765jqn.apps.googleusercontent.com"
  var googleTokenClient = null;
  function loginWithGoogle() {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
      connectStatus.textContent = 'مكتبة Google لسه بتتحمّل، جرّب تاني خلال ثانية.';
      return;
    }
    if (!googleTokenClient) {
      googleTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/userinfo.email',
        callback: function (tokenResponse) {
          if (tokenResponse && tokenResponse.access_token) {
            googleAccessToken = tokenResponse.access_token;
            rememberToken('google', googleAccessToken, tokenResponse.expires_in);
            connectStatus.textContent = 'تم تسجيل الدخول بحساب Google \u2713 — جارٍ تحميل حساباتك الإعلانية…';
            loadGoogleAccounts();
          } else {
            connectStatus.textContent = 'تعذّر تسجيل الدخول بحساب Google.';
          }
        }
      });
    }
    googleTokenClient.requestAccessToken();
  }

  var googleAccessToken = null;

  function loadGoogleAccounts() {
    fetch('/api/google-list-accounts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: googleAccessToken })
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (!data || data.error || !data.accounts) {
        connectStatus.textContent = 'تعذّر تحميل حسابات Google Ads (' + (data && data.error ? (data.error.message || data.error) : 'تأكد من إعداد الخادم الخلفي') + ').';
        return;
      }
      // السيرفر بيرجّع حسابات العملاء بس (من غير حسابات Manager) ومع كل واحد الـ loginCustomerId بتاعه
      var accounts = data.accounts;
      if (!accounts.length) {
        connectStatus.textContent = 'تم تسجيل الدخول، لكن مفيش حسابات Google Ads مفعّلة (غير Manager) متاحة لهذا الحساب.';
        return;
      }
      accounts.forEach(function (a) { accountInfo['google:' + a.id] = a; });
      setPlatformOptions('google', accounts.map(function (a) {
        return { value: a.id, label: 'Google Ads — ' + a.name + (a.name !== a.id ? ' (' + a.id + ')' : '') };
      }));
      connectStatus.textContent = 'تم العثور على ' + ar(accounts.length) + ' حساب Google Ads — اختر واحد من القائمة.';
      loadGoogleAdsForAccount(accounts[0].id);
      accountSelect.value = accounts[0].id;
    }).catch(function (err) {
      connectStatus.textContent = 'تعذّر الاتصال بالخادم الخلفي (' + err.message + '). تأكد إن ملفات /api اتنشرت على Vercel صح.';
    });
  }

  function loadGoogleAdsForAccount(customerId) {
    var info = accountInfo['google:' + customerId] || {};
    connectStatus.textContent = 'جارٍ تحميل إعلانات Google Ads…';
    fetch('/api/google-ads-fetch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: googleAccessToken, customerId: customerId,
        loginCustomerId: info.loginCustomerId, timeZone: info.timeZone, clientTz: BROWSER_TZ
      })
    }).then(function (r) { return r.json(); }).then(function (payload) {
      if (!payload || payload.error) {
        connectStatus.textContent = 'تعذّر تحميل إعلانات Google Ads (' + (payload && payload.error ? payload.error : 'رد غير متوقع من الخادم') + ').';
        return;
      }
      if (!payload.ads || !payload.ads.length) {
        connectStatus.textContent = 'الاتصال نجح لكن مفيش إعلانات (غير محذوفة) في هذا الحساب.';
        return;
      }
      var googleCandidates = transformGoogleRows(payload.ads, payload.metrics || [], daysFromRange(payload.range));
      mergeCandidates(googleCandidates, 'google:' + customerId);
      connectStatus.textContent = 'متصل — ' + ar(candidates.length) + ' إعلان محمّل إجمالاً عبر كل المنصات المتصلة.';
      selectedIds = {};
      render();
    }).catch(function (err) {
      connectStatus.textContent = 'تعذّر تحميل إعلانات Google Ads (' + err.message + ').';
    });
  }

  function ggPick(obj, path) {
    return path.split('.').reduce(function (o, k) { return (o && o[k] != null) ? o[k] : undefined; }, obj);
  }

  // adRows: كل الإعلانات بحالتها (من غير تاريخ) — metricRows: صف لكل إعلان × يوم فيه نشاط
  // المفتاح adGroupId-adId لأن نفس الإعلان ممكن يتكرر في أكتر من مجموعة إعلانية
  function transformGoogleRows(adRows, metricRows, days) {
    var byDate = {};
    metricRows.forEach(function (row) {
      var key = ggPick(row, 'adGroup.id') + '-' + ggPick(row, 'adGroupAd.ad.id');
      var date = ggPick(row, 'segments.date');
      if (!date) return;
      var m = row.metrics || {};
      if (!byDate[key]) byDate[key] = {};
      byDate[key][date] = {
        spend: Math.round(parseInt(m.costMicros || 0, 10) / 1000000),
        results: parseFloat(m.conversions || 0),
        sales: Math.round(parseFloat(m.conversionsValue || 0))
      };
    });
    return adRows.map(function (row) {
      var ad = ggPick(row, 'adGroupAd.ad') || {};
      var key = ggPick(row, 'adGroup.id') + '-' + ad.id;
      var id = 'g-' + key;
      var headline = (ggPick(ad, 'responsiveSearchAd.headlines.0.text')) ||
        (ggPick(ad, 'expandedTextAd.headlinePart1')) || ad.name || ('إعلان Google #' + ad.id);
      var desc = (ggPick(ad, 'responsiveSearchAd.descriptions.0.text')) ||
        (ggPick(ad, 'expandedTextAd.description')) || '';
      var adStatus = ggPick(row, 'adGroupAd.status'), agStatus = ggPick(row, 'adGroup.status'), campStatus = ggPick(row, 'campaign.status');
      var perDay = byDate[key] || {};
      var daily = [], dailyResults = [], dailySales = [];
      days.forEach(function (day) {
        var r = perDay[day.key];
        daily.push(r ? r.spend : 0);
        dailyResults.push(r ? Math.round(r.results) : 0);
        dailySales.push(r ? r.sales : 0);
      });
      var spend = daily.reduce(function (a, b) { return a + b; }, 0);
      var totalResults = dailyResults.reduce(function (a, b) { return a + b; }, 0);
      var totalSales = dailySales.reduce(function (a, b) { return a + b; }, 0);
      return {
        id: id, platform: 'Google Ads',
        placement: ggPick(row, 'campaign.name') || '—',
        format: (ad.type && /VIDEO/i.test(ad.type)) ? 'video' : ((ad.type && /IMAGE/i.test(ad.type)) ? 'image' : 'text'),
        thumbUrl: ggPick(ad, 'imageAd.imageUrl') || null,
        headline: headline, desc: desc, offer: headline, caption: desc || headline,
        landing: (ad.finalUrls && ad.finalUrls[0]) || '—', landingKind: 'website',
        // Google Ads API مش بيرجّع تاريخ إنشاء الإعلان — null أصدق من صفر
        daysAgo: null, updatedDaysAgo: null,
        daily: daily, dailyResults: dailyResults, dailySales: dailySales, dailyDates: days.map(function (d) { return d.label; }),
        spend: spend,
        results: totalResults > 0 ? totalResults : 0,
        resultLabel: 'تحويلات',
        cpr: (totalResults && spend > 0) ? (spend / totalResults) : null,
        roas: (totalSales > 0 && spend > 0) ? (totalSales / spend) : null,
        themeClass: 'pv-t' + (hashCode(id) % 4),
        active: adStatus === 'ENABLED' && (!agStatus || agStatus === 'ENABLED') && (!campStatus || campStatus === 'ENABLED'),
        pausedLevel: campStatus && campStatus !== 'ENABLED' ? 'campaign' : (agStatus && agStatus !== 'ENABLED' ? 'adset' : (adStatus !== 'ENABLED' ? 'ad' : null)),
        _resourceName: row.adGroupAd && row.adGroupAd.resourceName,
        fail: false
      };
    });
  }

  function loadAdAccounts() {
    connectStatus.textContent = 'جارٍ تحميل الحسابات الإعلانية…';
    FB.api('/me/adaccounts', { fields: 'id,name,account_status,timezone_name,currency' }, function (response) {
      if (!response || response.error) {
        connectStatus.textContent = 'تعذّر تحميل الحسابات — تأكد إن حسابك عنده صلاحية على حساب إعلاني واحد على الأقل.';
        return;
      }
      if (!response.data || !response.data.length) {
        connectStatus.textContent = 'مفيش حسابات إعلانية مرتبطة بحسابك.';
        return;
      }
      response.data.forEach(function (a) { accountInfo['meta:' + a.id] = { timeZone: a.timezone_name || null, currency: a.currency || null }; });
      setPlatformOptions('meta', response.data.map(function (a) { return { value: a.id, label: 'Meta — ' + a.name }; }));
      document.getElementById('tConnectTitle').textContent = 'متصل بحساب Meta — دوس تسجيل الدخول لإضافة منصة تانية';
      loadAdsForAccount(response.data[0].id);
    });
  }
  function loadSource(platform, id) {
    if (platform === 'google') loadGoogleAdsForAccount(id);
    else if (platform === 'snapchat') loadSnapchatAdsForAccount(id);
    else if (platform === 'tiktok') loadTikTokAdsForAdvertiser(id);
    else if (platform === 'meta') loadAdsForAccount(id);
  }
  accountSelect.addEventListener('change', function () {
    var opt = accountSelect.selectedOptions[0];
    if (opt) loadSource(opt.dataset.platform, opt.value);
  });

  // ---------- Snapchat: تدفّق إعادة توجيه كامل الصفحة (مش نافذة منبثقة زي Meta/Google) ----------
  // !!! هام: عدّل بالـ Client ID بتاعك من Snap Business Manager !!!
  var SNAPCHAT_CLIENT_ID = "00315198-57f5-4c42-98f0-c0396d0053f5"
  var snapchatAccessToken = null;

  function loginWithSnapchat() {
    var redirectUri = window.location.origin + window.location.pathname;
    var authUrl = 'https://accounts.snapchat.com/login/oauth2/authorize' +
      '?client_id=' + encodeURIComponent(SNAPCHAT_CLIENT_ID) +
      '&redirect_uri=' + encodeURIComponent(redirectUri) +
      '&response_type=code&scope=snapchat-marketing-api&state=snapchat_auth';
    saveSession(); // احتياطي قبل ما الصفحة تتقفل — المنصات المحمّلة هترجع بعد الرجوع من Snapchat
    window.location.href = authUrl; // توجيه كامل الصفحة، مش نافذة منبثقة — طبيعة تدفّق Snapchat نفسه
  }

  function exchangeSnapchatCode(code) {
    var redirectUri = window.location.origin + window.location.pathname;
    connectStatus.textContent = 'جارٍ إتمام تسجيل الدخول بحساب Snapchat…';
    fetch('/api/snapchat-token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code, redirectUri: redirectUri })
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (data && data.access_token) {
        snapchatAccessToken = data.access_token;
        rememberToken('snapchat', snapchatAccessToken, data.expires_in);
        connectStatus.textContent = 'تم تسجيل الدخول بحساب Snapchat ✓ — جارٍ تحميل الحسابات الإعلانية…';
        loadSnapchatAccounts();
      } else {
        connectStatus.textContent = 'تعذّر إتمام تسجيل الدخول بحساب Snapchat (' + (data && data.error ? data.error : 'خطأ غير معروف') + ').';
      }
    }).catch(function (err) {
      connectStatus.textContent = 'تعذّر الاتصال بالخادم الخلفي لـ Snapchat (' + err.message + ').';
    });
  }

  function loadSnapchatAccounts() {
    fetch('/api/snapchat-ads-fetch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: snapchatAccessToken, action: 'accounts' })
    }).then(function (r) { return r.json(); }).then(function (data) {
      var accounts = [];
      (data && data.organizations || []).forEach(function (o) {
        var org = o.organization || o;
        (org.ad_accounts || []).forEach(function (aa) {
          var acc = aa.ad_account || aa;
          if (acc && acc.id) accounts.push(acc);
        });
      });
      if (!accounts.length) {
        connectStatus.textContent = 'تم تسجيل الدخول، لكن مفيش حسابات إعلانية ظاهرة على Snapchat لهذا الحساب.';
        return;
      }
      setPlatformOptions('snapchat', accounts.map(function (a) { return { value: a.id, label: 'Snapchat — ' + (a.name || a.id) }; }));
      connectStatus.textContent = 'تم العثور على ' + ar(accounts.length) + ' حساب Snapchat — اختر واحد من القائمة.';
      loadSnapchatAdsForAccount(accounts[0].id);
      accountSelect.value = accounts[0].id;
    }).catch(function (err) {
      connectStatus.textContent = 'تعذّر تحميل حسابات Snapchat (' + err.message + ').';
    });
  }

  function loadSnapchatAdsForAccount(adAccountId) {
    connectStatus.textContent = 'جارٍ تحميل إعلانات Snapchat…';
    fetch('/api/snapchat-ads-fetch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: snapchatAccessToken, action: 'ads', adAccountId: adAccountId, clientTz: BROWSER_TZ })
    }).then(function (r) { return r.json(); }).then(function (payload) {
      if (!payload || payload.error) {
        connectStatus.textContent = 'تعذّر تحميل إعلانات Snapchat (' + (payload && payload.error ? payload.error : 'رد غير متوقع من الخادم') + ').';
        return;
      }
      var adsList = payload.ads || [];
      var statsList = (payload.stats && payload.stats.timeseries_stats) || [];
      if (!adsList.length) {
        connectStatus.textContent = 'الاتصال نجح لكن مفيش إعلانات راجعة لهذا الحساب.';
        return;
      }
      var snapCandidates = transformSnapchatAds(adsList, statsList, daysFromRange(payload.range));
      mergeCandidates(snapCandidates, 'snapchat:' + adAccountId);
      var statsNote = payload.statsError ? ' (تعذّر تحميل الإنفاق: ' + payload.statsError + ')' : '';
      connectStatus.textContent = 'متصل — ' + ar(candidates.length) + ' إعلان محمّل إجمالاً عبر كل المنصات المتصلة.' + statsNote;
      selectedIds = {};
      render();
    }).catch(function (err) {
      connectStatus.textContent = 'تعذّر تحميل إعلانات Snapchat (' + err.message + ').';
    });
  }

  function transformSnapchatAds(adsList, statsList, days) {
    // مع breakdown=ad الإحصائيات بتيجي جوه breakdown_stats.ad[] تحت الحساب —
    // الـ id اللي في المستوى الأعلى هو id الحساب مش الإعلان
    var statsByAd = {};
    statsList.forEach(function (entry) {
      var ts = entry.timeseries_stat || entry;
      var perAd = ts.breakdown_stats && ts.breakdown_stats.ad;
      if (perAd) { perAd.forEach(function (b) { statsByAd[b.id] = b.timeseries || []; }); }
      else if (ts.id) { statsByAd[ts.id] = ts.timeseries || []; }
    });
    return adsList.map(function (item) {
      var ad = item.ad || item;
      var id = 's-' + ad.id;
      var rows = statsByAd[ad.id] || [];
      var byDay = {};
      rows.forEach(function (r) { byDay[(r.start_time || '').slice(0, 10)] = r.stats || r; });
      var daily = [], dailyResults = [];
      days.forEach(function (day) {
        var stats = byDay[day.key];
        daily.push(stats ? Math.round(parseFloat(stats.spend || 0) / 1000000) : 0);
        dailyResults.push(stats ? Math.round(parseFloat(stats.swipes || 0)) : 0);
      });
      var spend = daily.reduce(function (a, b) { return a + b; }, 0);
      var results = dailyResults.reduce(function (a, b) { return a + b; }, 0);
      return {
        id: id, platform: 'Snapchat', placement: 'Discover',
        format: ad.type && /VIDEO/i.test(ad.type) ? 'video' : (ad.type && /SNAP_AD/i.test(ad.type) ? 'video' : 'image'),
        thumbUrl: null,
        headline: ad.name || ('إعلان Snapchat #' + ad.id), desc: '',
        offer: ad.name || id, caption: ad.name || '',
        landing: '—', landingKind: null,
        daysAgo: ad.created_at ? daysBetween(ad.created_at) : null,
        updatedDaysAgo: ad.updated_at ? daysBetween(ad.updated_at) : null,
        daily: daily, dailySales: daily.map(function () { return 0; }), dailyResults: dailyResults, dailyDates: days.map(function (d) { return d.label; }),
        spend: spend, results: results, resultLabel: 'سوايب (نقرات)', cpr: (results && spend) ? (spend / results) : null, roas: null,
        themeClass: 'pv-t' + (hashCode(id) % 4),
        active: ad.status === 'ACTIVE', pausedLevel: ad.status !== 'ACTIVE' ? 'ad' : null,
        fail: false
      };
    });
  }

  // لو رجعنا من Snapchat بـ ?code=... في الرابط، كمّل تسجيل الدخول تلقائياً
  (function checkSnapchatRedirect() {
    var params = new URLSearchParams(window.location.search);
    var code = params.get('code');
    var state = params.get('state');
    if (code && state === 'snapchat_auth') {
      window.history.replaceState({}, document.title, window.location.pathname);
      exchangeSnapchatCode(code);
    }
  })();

  // ---------- TikTok: نفس نمط إعادة التوجيه الكامل بتاع Snapchat ----------
  // !!! هام: عدّل بالـ App ID بتاعك من TikTok for Business !!!
  var TIKTOK_APP_ID = "7682985212271314962";
  var tiktokAccessToken = null;

  function loginWithTikTok() {
    platformOverlay.classList.add('hidden');
    var redirectUri = window.location.origin + window.location.pathname;
    var authUrl = 'https://business-api.tiktok.com/portal/auth' +
      '?app_id=' + encodeURIComponent(TIKTOK_APP_ID) +
      '&state=tiktok_auth' +
      '&redirect_uri=' + encodeURIComponent(redirectUri);
    saveSession(); // احتياطي قبل ما الصفحة تتقفل — المنصات المحمّلة هترجع بعد الرجوع من TikTok
    window.location.href = authUrl;
  }

  function exchangeTikTokCode(authCode) {
    connectStatus.textContent = 'جارٍ إتمام تسجيل الدخول بحساب TikTok…';
    fetch('/api/tiktok-token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authCode: authCode })
    }).then(function (r) { return r.json(); }).then(function (data) {
      var payload = data && data.data;
      if (payload && payload.access_token) {
        tiktokAccessToken = payload.access_token;
        rememberToken('tiktok', tiktokAccessToken, null); // توكن TikTok Marketing API طويل الأجل (لحد ما يتلغى)
        var ids = payload.advertiser_ids || [];
        if (!ids.length) {
          connectStatus.textContent = 'تم تسجيل الدخول بحساب TikTok ✓ — لكن مفيش حسابات إعلانية (Advertiser IDs) ظاهرة لهذا التطبيق بعد.';
          return;
        }
        setPlatformOptions('tiktok', ids.map(function (id) { return { value: id, label: 'TikTok Ads — ' + id }; }));
        connectStatus.textContent = 'تم تسجيل الدخول بحساب TikTok ✓ — اختر حساب من القائمة.';
        loadTikTokAdsForAdvertiser(ids[0]);
        accountSelect.value = ids[0];
      } else {
        connectStatus.textContent = 'تعذّر إتمام تسجيل الدخول بحساب TikTok (' + (data && data.message ? data.message : 'خطأ غير معروف') + ').';
      }
    }).catch(function (err) {
      connectStatus.textContent = 'تعذّر الاتصال بالخادم الخلفي لـ TikTok (' + err.message + ').';
    });
  }

  function loadTikTokAdsForAdvertiser(advertiserId) {
    connectStatus.textContent = 'جارٍ تحميل إعلانات TikTok…';
    fetch('/api/tiktok-ads-fetch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: tiktokAccessToken, advertiserId: advertiserId, clientTz: BROWSER_TZ })
    }).then(function (r) { return r.json(); }).then(function (payload) {
      if (!payload || payload.error) {
        connectStatus.textContent = 'تعذّر تحميل إعلانات TikTok (' + (payload && payload.error ? payload.error : 'رد غير متوقع من الخادم') + ').';
        return;
      }
      var adsList = payload.ads || [];
      if (!adsList.length) {
        connectStatus.textContent = 'الاتصال نجح لكن مفيش إعلانات راجعة لهذا الحساب (تأكد من مستوى موافقة التطبيق).';
        return;
      }
      // اسم الحساب الحقيقي بدل الرقم لو رجع
      if (payload.advertiser && payload.advertiser.name) {
        Array.prototype.slice.call(accountSelect.options).forEach(function (o) {
          if (o.dataset.platform === 'tiktok' && o.value === String(advertiserId)) o.textContent = 'TikTok Ads — ' + payload.advertiser.name;
        });
      }
      var tiktokCandidates = transformTikTokAds(adsList, payload.report || [], daysFromRange(payload.range));
      mergeCandidates(tiktokCandidates, 'tiktok:' + advertiserId);
      var reportNote = payload.reportError ? ' (تعذّر تحميل الإنفاق: ' + payload.reportError + ')' : '';
      connectStatus.textContent = 'متصل — ' + ar(candidates.length) + ' إعلان محمّل إجمالاً عبر كل المنصات المتصلة.' + reportNote;
      selectedIds = {};
      render();
    }).catch(function (err) {
      connectStatus.textContent = 'تعذّر تحميل إعلانات TikTok (' + err.message + ').';
    });
  }

  // TikTok بترجّع الأوقات بصيغة "YYYY-MM-DD HH:MM:SS" بتوقيت UTC — نحوّلها لصيغة ISO عشان كل المتصفحات تفهمها
  function tiktokTime(s) { return s ? String(s).replace(' ', 'T') + 'Z' : null; }

  function transformTikTokAds(adsList, reportList, days) {
    var statsByAd = {};
    reportList.forEach(function (row) {
      var dims = row.dimensions || {};
      if (!dims.ad_id) return;
      if (!statsByAd[dims.ad_id]) statsByAd[dims.ad_id] = {};
      statsByAd[dims.ad_id][(dims.stat_time_day || '').slice(0, 10)] = row.metrics || {};
    });
    return adsList.map(function (ad) {
      var id = 't-' + ad.ad_id;
      var byDay = statsByAd[ad.ad_id] || {};
      var daily = [], dailyResults = [];
      days.forEach(function (day) {
        var m = byDay[day.key];
        daily.push(m ? Math.round(parseFloat(m.spend || 0)) : 0);
        dailyResults.push(m ? Math.round(parseFloat(m.conversion || 0)) : 0);
      });
      var spend = daily.reduce(function (a, b) { return a + b; }, 0);
      var results = dailyResults.reduce(function (a, b) { return a + b; }, 0);
      return {
        id: id, platform: 'TikTok', placement: 'In-Feed',
        format: ad.ad_format && /VIDEO|SINGLE_VIDEO/i.test(ad.ad_format) ? 'video' : 'image',
        thumbUrl: null,
        headline: ad.ad_name || ('إعلان TikTok #' + ad.ad_id), desc: ad.ad_text || '',
        offer: ad.ad_name || id, caption: ad.ad_text || ad.ad_name || '',
        landing: ad.landing_page_url || '—', landingKind: ad.landing_page_url ? 'website' : null,
        daysAgo: ad.create_time ? daysBetween(tiktokTime(ad.create_time)) : null,
        updatedDaysAgo: ad.modify_time ? daysBetween(tiktokTime(ad.modify_time)) : null,
        daily: daily, dailySales: daily.map(function () { return 0; }), dailyResults: dailyResults, dailyDates: days.map(function (d) { return d.label; }),
        spend: spend, results: results, resultLabel: 'تحويلات', cpr: (results && spend) ? (spend / results) : null, roas: null,
        themeClass: 'pv-t' + (hashCode(id) % 4),
        active: ad.operation_status === 'ENABLE', pausedLevel: ad.operation_status !== 'ENABLE' ? 'ad' : null,
        fail: false
      };
    });
  }

  (function checkTikTokRedirect() {
    var params = new URLSearchParams(window.location.search);
    var authCode = params.get('auth_code') || params.get('code');
    var state = params.get('state');
    if (authCode && state === 'tiktok_auth') {
      window.history.replaceState({}, document.title, window.location.pathname);
      exchangeTikTokCode(authCode);
    }
  })();

  var PAGE_SAFETY_CAP = 800;    // حد أمان لعدد الإعلانات المعروضة من حساب Meta واحد
  var FULL_SCAN_CAP = 20000;    // حد أمان أعلى بكتير للبيانات المساعدة (المجموعات والإنفاق اليومي)
                                // اللي لو اتقطعت بتطلع أرقام وحالات غلط من غير ما حد يلاحظ

  function fetchAllPages(path, params, cap, onDone, acc) {
    acc = acc || [];
    FB.api(path, params, function (response) {
      if (!response || response.error) { onDone(response ? response.error : { message: 'no response' }, acc); return; }
      acc = acc.concat(response.data || []);
      var cursor = response.paging && response.paging.cursors && response.paging.cursors.after;
      var hasNext = !!(response.paging && response.paging.next);
      if (cursor && hasNext && response.data && response.data.length && acc.length < cap) {
        var nextParams = {};
        for (var k in params) nextParams[k] = params[k];
        nextParams.after = cursor;
        fetchAllPages(path, nextParams, cap, onDone, acc);
      } else {
        onDone(null, acc, !!(cursor && hasNext));
      }
    });
  }

  function loadAdsetStatusMap(accountId, onDone) {
    // استعلام مستقل ومباشر لحالة المجموعات الإعلانية وحملاتها — أوثق من محاولة سحبها
    // متداخلة جوه استعلام الإعلانات نفسه على 3 مستويات دفعة واحدة
    fetchAllPages('/' + accountId + '/adsets', {
      fields: 'id,effective_status,campaign{effective_status}',
      limit: 200
    }, FULL_SCAN_CAP, function (err, data) {
      var map = {};
      (data || []).forEach(function (as) {
        map[as.id] = {
          adsetActive: as.effective_status === 'ACTIVE',
          campaignActive: !as.campaign || as.campaign.effective_status === 'ACTIVE'
        };
      });
      onDone(map);
    });
  }

  function loadAdsForAccount(accountId) {
    var info = accountInfo['meta:' + accountId] || {};
    // آخر 7 أيام *شاملة النهارده* بتوقيت الحساب — last_7d بتاع Meta بينتهي امبارح،
    // فكان يوم النهارده دايماً صفر وأقدم يوم بيضيع من الجدول
    var days = last7Days(todayKeyInTz(info.timeZone || BROWSER_TZ));
    connectStatus.textContent = 'جارٍ تحميل حالة الحملات والمجموعات الإعلانية…';
    loadAdsetStatusMap(accountId, function (adsetStatusMap) {
    connectStatus.textContent = 'جارٍ تحميل كل الإعلانات (قد يستغرق لحظات لو الحساب كبير)…';
    fetchAllPages('/' + accountId + '/ads', {
      fields: 'id,name,effective_status,created_time,updated_time,' +
        'adset{id,name,optimization_goal},' +
        'creative{title,body,image_url,thumbnail_url,video_id,object_story_spec{link_data{link,call_to_action},video_data{call_to_action}}}',
      limit: 100
    }, PAGE_SAFETY_CAP, function (err, adsData, adsTruncated) {
      if (err) { connectStatus.textContent = 'تعذّر تحميل الإعلانات (' + err.message + ').'; return; }
      var adsById = {};
      var order = [];
      adsData.forEach(function (ad) { adsById[ad.id] = ad; order.push(ad.id); });

      connectStatus.textContent = 'جارٍ تحميل بيانات الإنفاق اليومي لـ ' + ar(order.length) + ' إعلان…';
      fetchAllPages('/' + accountId + '/insights', {
        level: 'ad',
        time_increment: 1,
        time_range: JSON.stringify({ since: days[0].key, until: days[days.length - 1].key }),
        fields: 'ad_id,date_start,spend,actions,action_values',
        limit: 500
      }, FULL_SCAN_CAP, function (err2, insightsData, insightsTruncated) {
        var insightsByAd = {};
        (insightsData || []).forEach(function (row) {
          if (!insightsByAd[row.ad_id]) insightsByAd[row.ad_id] = [];
          insightsByAd[row.ad_id].push(row);
        });
        mergeCandidates(order.map(function (id) { return transformRealAd(adsById[id], insightsByAd[id] || [], adsetStatusMap, days); }), 'meta:' + accountId);
        var notes = [];
        if (adsTruncated) notes.push('تم عرض أول ' + ar(PAGE_SAFETY_CAP) + ' إعلان بس — قولّي لو محتاج نرفع الحد');
        if (err2) notes.push('تعذّر تحميل الإنفاق اليومي: ' + err2.message);
        else if (insightsTruncated) notes.push('بيانات الإنفاق اتقطعت عند ' + ar(FULL_SCAN_CAP) + ' صف — بعض الأرقام ممكن تكون ناقصة');
        connectStatus.textContent = 'متصل — ' + ar(candidates.length) + ' إعلان محمّل إجمالاً عبر كل المنصات المتصلة.' + (notes.length ? ' (' + notes.join('؛ ') + ')' : '');
        selectedIds = {};
        render();
      });
    });
    });
  }

  // خريطة هدف المجموعة الإعلانية (optimization_goal) إلى نوع الحدث اللي المفروض
  // Meta نفسها تعرضه كـ"النتائج" لهذا الإعلان بالذات — نفس منطق عمود Results في Ads Manager تقريباً
  var GOAL_TO_ACTION = {
    'OFFSITE_CONVERSIONS': [{ type: 'omni_purchase', label: 'مشتريات' }, { type: 'purchase', label: 'مشتريات' }],
    'ONSITE_CONVERSIONS': [{ type: 'omni_purchase', label: 'مشتريات' }, { type: 'purchase', label: 'مشتريات' }],
    'OFFSITE_CONVERSIONS_LEAD': [{ type: 'onsite_conversion.lead_grouped', label: 'عملاء محتملون' }, { type: 'lead', label: 'عملاء محتملون' }],
    'LEAD_GENERATION': [{ type: 'onsite_conversion.lead_grouped', label: 'عملاء محتملون' }, { type: 'lead', label: 'عملاء محتملون' }],
    'QUALITY_LEAD': [{ type: 'onsite_conversion.lead_grouped', label: 'عملاء محتملون' }, { type: 'lead', label: 'عملاء محتملون' }],
    'CONVERSATIONS': [{ type: 'onsite_conversion.messaging_conversation_started_7d', label: 'محادثات واتساب' }],
    'LINK_CLICKS': [{ type: 'link_click', label: 'نقرات على الرابط' }],
    'LANDING_PAGE_VIEWS': [{ type: 'landing_page_view', label: 'زيارات الصفحة المقصودة' }],
    'APP_INSTALLS': [{ type: 'mobile_app_install', label: 'تثبيتات التطبيق' }],
    'POST_ENGAGEMENT': [{ type: 'post_engagement', label: 'تفاعل مع المنشور' }],
    'THRUPLAY': [{ type: 'video_view', label: 'مشاهدات الفيديو' }],
    'REPLIES': [{ type: 'onsite_conversion.messaging_first_reply', label: 'ردود أولى بالرسائل' }]
  };
  // احتياطي عام فقط لو هدف المجموعة الإعلانية غير معروف أو غير موجود في الخريطة أعلاه
  var FALLBACK_ACTION_TYPES = [
    { type: 'omni_purchase', label: 'مشتريات' }, { type: 'purchase', label: 'مشتريات' },
    { type: 'onsite_conversion.messaging_conversation_started_7d', label: 'محادثات واتساب' },
    { type: 'onsite_conversion.lead_grouped', label: 'عملاء محتملون' }, { type: 'lead', label: 'عملاء محتملون' },
    { type: 'link_click', label: 'نقرات على الرابط' }
  ];

  // بيرجع دايماً قيمة (حتى لو صفر) للحدث المرتبط فعلياً بهدف الإعلان — مش بيقفز لمقياس تاني
  // لو القيمة صفر، عشان كده منقدرش نفرّق "صفر نتائج فعلي" عن "الحدث ده مش موجود خالص"
  function resultForGoal(actionsArr, goal) {
    var candidates = GOAL_TO_ACTION[goal];
    if (candidates) {
      var c = candidates[0];
      var found = valueForType(actionsArr, c.type);
      return { value: found || 0, label: c.label, type: c.type, matchedGoal: true };
    }
    for (var i = 0; i < FALLBACK_ACTION_TYPES.length; i++) {
      var v = valueForType(actionsArr, FALLBACK_ACTION_TYPES[i].type);
      if (v) return { value: v, label: FALLBACK_ACTION_TYPES[i].label, type: FALLBACK_ACTION_TYPES[i].type, matchedGoal: false };
    }
    return null;
  }
  function valueForType(actionsArr, type) {
    if (!actionsArr || !type) return null;
    for (var i = 0; i < actionsArr.length; i++) { if (actionsArr[i].action_type === type) return parseFloat(actionsArr[i].value); }
    return null;
  }

  function destinationInfo(creative) {
    try {
      var spec = creative.object_story_spec;
      if (!spec) return { url: '—', kind: null };
      var link = null, ctaType = null;
      if (spec.link_data) {
        link = spec.link_data.link || (spec.link_data.call_to_action && spec.link_data.call_to_action.value && spec.link_data.call_to_action.value.link);
        ctaType = spec.link_data.call_to_action && spec.link_data.call_to_action.type;
      }
      // إعلانات الفيديو بتحط وجهتها جوه video_data مش link_data — نفس المعلومة، مكان مختلف
      if (!link && spec.video_data && spec.video_data.call_to_action) {
        link = spec.video_data.call_to_action.value && spec.video_data.call_to_action.value.link;
        ctaType = spec.video_data.call_to_action.type;
      }
      if (!link) return { url: '—', kind: null };
      if (/whatsapp/i.test(link) || (ctaType && /WHATSAPP/i.test(ctaType))) return { url: link, kind: 'whatsapp' };
      if (ctaType && /MESSAGE|MESSENGER/i.test(ctaType)) return { url: link, kind: 'messenger' };
      return { url: link, kind: 'website' };
    } catch (e) { return { url: '—', kind: null }; }
  }

  function transformRealAd(ad, insightRows, adsetStatusMap, days) {
    var creative = ad.creative || {};
    var format = creative.video_id ? 'video' : ((creative.image_url || creative.thumbnail_url) ? 'image' : 'text');
    var goal = (ad.adset && ad.adset.optimization_goal) || null;
    var byDate = {};
    (insightRows || []).forEach(function (r) { byDate[r.date_start] = r; });

    var daily = [], dailySales = [], dailyResultsArr = [];
    var totalResultsVal = 0, resultLabel = null, resultType = null, matchedGoal = false;
    days.forEach(function (day) {
      var row = byDate[day.key];
      var spendVal = row ? Math.round(parseFloat(row.spend || 0)) : 0;
      daily.push(spendVal);
      if (row) {
        var found = resultForGoal(row.actions, goal);
        if (found) {
          totalResultsVal += found.value;
          resultLabel = found.label; resultType = found.type; matchedGoal = found.matchedGoal;
          dailyResultsArr.push(Math.round(found.value));
        } else { dailyResultsArr.push(0); }
        var salesVal = resultType ? valueForType(row.action_values, resultType) : null;
        dailySales.push(salesVal != null ? Math.round(salesVal) : 0);
      } else {
        dailyResultsArr.push(0); dailySales.push(0);
      }
    });
    var dailyDates = days.map(function (d) { return d.label; });
    var spend = daily.reduce(function (a, b) { return a + b; }, 0);
    // مصدر واحد بس لقيمة المبيعات: مجموع نفس الأرقام اليومية الظاهرة في الجدول تحت —
    // عشان أي رقم إجمالي معروض يطابق دايماً تفصيله اليومي، من غير أي مصدر ثانٍ يختلف معاه
    var totalSales = dailySales.reduce(function (a, b) { return a + b; }, 0);
    var results = goal ? Math.round(totalResultsVal) : (totalResultsVal > 0 ? Math.round(totalResultsVal) : null);
    var cpr = (results && spend > 0) ? (spend / results) : null;
    var roas = (totalSales > 0 && spend > 0) ? (totalSales / spend) : null;

    var dest = destinationInfo(creative);

    return {
      id: ad.id,
      platform: 'Meta',
      placement: (ad.adset && ad.adset.name) || '—',
      format: format,
      duration: format === 'video' ? '' : undefined,
      videoId: creative.video_id || null,
      thumbUrl: creative.image_url || creative.thumbnail_url || null,
      headline: creative.title || ad.name,
      desc: creative.body || '',
      offer: ad.name,
      caption: creative.body || creative.title || ad.name,
      landing: dest.url,
      landingKind: dest.kind,
      daysAgo: daysBetween(ad.created_time),
      updatedDaysAgo: daysBetween(ad.updated_time),
      daily: daily,
      dailySales: dailySales,
      dailyResults: dailyResultsArr,
      dailyDates: dailyDates,
      spend: spend,
      results: results,
      resultLabel: resultLabel,
      resultMatchedGoal: matchedGoal,
      cpr: cpr,
      roas: roas,
      themeClass: 'pv-t' + (hashCode(ad.id) % 4),
      active: hierarchyActive(ad, adsetStatusMap),
      pausedLevel: hierarchyPausedLevel(ad, adsetStatusMap),
      fail: false
    };
  }

  // مش بناخد effective_status الإعلان وحده على الثقة — بنتأكد كمان من المجموعة والحملة،
  // عن طريق خريطة حالة مستقلة ومؤكدة (adsetStatusMap)، نفس فلسفة الأداة في التحقق مش الثقة العمياء
  function hierarchyActive(ad, adsetStatusMap) {
    var adOk = ad.effective_status === 'ACTIVE';
    var st = ad.adset && adsetStatusMap && adsetStatusMap[ad.adset.id];
    var adsetOk = !st || st.adsetActive;
    var campOk = !st || st.campaignActive;
    return adOk && adsetOk && campOk;
  }
  function hierarchyPausedLevel(ad, adsetStatusMap) {
    var st = ad.adset && adsetStatusMap && adsetStatusMap[ad.adset.id];
    if (st && !st.campaignActive) return 'campaign';
    if (st && !st.adsetActive) return 'adset';
    if (ad.effective_status !== 'ACTIVE') return 'ad';
    return null;
  }

  // ---------- Rendering (same logic as the demo prototype) ----------
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
      return '<div class="preview preview-image ' + c.themeClass + '"><span class="format-badge">تصميم ثابت</span></div>';
    }
    return '<div class="preview preview-text"><span class="text-url">' + esc(c.landing !== '—' ? c.landing : '') + '</span><span class="text-headline">' + esc(c.headline) + '</span><span class="text-desc">' + esc(c.desc) + '</span></div>';
  }

  function cardMarkup(c) {
    var checked = selectedIds[c.id] ? ' checked' : '';
    var selCls = selectedIds[c.id] ? ' selected' : '';
    var eid = esc(c.id);
    var statusLabel = c.active ? 'نشط' : 'متوقف';
    if (!c.active && c.pausedLevel === 'adset') statusLabel = 'متوقف (المجموعة)';
    if (!c.active && c.pausedLevel === 'campaign') statusLabel = 'متوقف (الحملة)';
    return (
      '<label class="candidate-card' + selCls + '" id="card-' + eid + '">' +
        '<span class="check-wrap"><input type="checkbox" class="card-check" data-id="' + eid + '"' + checked + '></span>' +
        '<span class="preview-trigger" data-id="' + eid + '">' + previewMarkup(c) + '</span>' +
        '<div class="card-info">' +
          '<div class="card-line1">' + esc(c.platform) + ' <span style="color:var(--ink-faint);font-weight:400;">\u00B7</span> ' + esc(c.placement) + '</div>' +
          '<div class="card-metrics"><span class="metric-chip">' + money(c.spend) + '</span><span class="metric-chip">' + roasStr(c.roas) + '</span></div>' +
          '<div class="card-foot">' +
            '<span class="days-badge">' + sinceLabel(c.daysAgo) + '</span>' +
            '<button type="button" class="state-switch" id="badge-' + eid + '" data-id="' + eid + '"><span class="switch-track' + (c.active ? ' on' : '') + '"><span class="switch-thumb"></span></span><span class="switch-label">' + statusLabel + '</span></button>' +
          '</div>' +
        '</div>' +
      '</label>'
    );
  }

  function getLaunchDate(c) { var d = new Date(); d.setDate(d.getDate() - c.daysAgo); d.setHours(0, 0, 0, 0); return d; }

  function visibleCandidates() {
    return candidates.filter(function (c) {
      if (filters.platform !== 'all' && c.platform !== filters.platform) return false;
      if (filters.format !== 'all' && c.format !== filters.format) return false;
      if (filters.status === 'active' && !c.active) return false;
      if (filters.status === 'paused' && c.active) return false;
      // تاريخ الإطلاق غير معروف (زي Google Ads) — منقدرش نأكد إنه جوه النطاق، فمنعرضوش مع فلتر تاريخ
      if ((filters.dateFrom || filters.dateTo) && c.daysAgo == null) return false;
      if (filters.dateFrom) { var from = new Date(filters.dateFrom); from.setHours(0, 0, 0, 0); if (getLaunchDate(c) < from) return false; }
      if (filters.dateTo) { var to = new Date(filters.dateTo); to.setHours(23, 59, 59, 999); if (getLaunchDate(c) > to) return false; }
      if (filters.text) {
        var hay = (c.platform + ' ' + c.placement + ' ' + c.offer + ' ' + (c.headline || '') + ' ' + (c.desc || '') + ' ' + (c.caption || '')).toLowerCase();
        if (hay.indexOf(filters.text.toLowerCase()) === -1) return false;
      }
      return true;
    });
  }

  function sortCandidates(list, key) {
    var arr = list.slice();
    // القيم غير المعروفة (null) تنزل آخر القائمة
    var age = function (v) { return v == null ? Number.MAX_SAFE_INTEGER : v; };
    if (key === 'launch') arr.sort(function (a, b) { return age(a.daysAgo) - age(b.daysAgo); });
    else if (key === 'update') arr.sort(function (a, b) { return age(a.updatedDaysAgo) - age(b.updatedDaysAgo); });
    else if (key === 'spend') arr.sort(function (a, b) { return b.spend - a.spend; });
    return arr;
  }

  function render() {
    var visible = sortCandidates(visibleCandidates(), filters.sort);
    if (!candidates.length) {
      cardGrid.innerHTML = '';
      galleryCount.textContent = 'سجّل الدخول لعرض إعلاناتك';
    } else {
      cardGrid.innerHTML = visible.length ? visible.map(cardMarkup).join('') : '<div class="empty-state" style="grid-column:1/-1">لا توجد إعلانات مطابقة للفلتر الحالي</div>';
      galleryCount.textContent = 'عرض ' + ar(visible.length) + ' من ' + ar(candidates.length) + ' إعلاناً حقيقياً';
    }
    updateSelectionSummary();
  }

  selectAllBtn.addEventListener('click', function () { visibleCandidates().forEach(function (c) { selectedIds[c.id] = true; }); render(); });
  clearSelBtn.addEventListener('click', function () { selectedIds = {}; render(); });
  filterToggle.addEventListener('click', function () { filterBar.classList.toggle('open'); });

  function updateSelectionSummary() {
    var selected = candidates.filter(function (c) { return selectedIds[c.id]; });
    var visibleNow = visibleCandidates();
    var unselectedVisible = visibleNow.filter(function (c) { return !selectedIds[c.id]; }).length;
    selectionSummary.textContent = 'محدد: ' + ar(selected.length) + ' \u00B7 غير محدد من الظاهر: ' + ar(unselectedVisible);
    var toStop = selected.filter(function (c) { return c.active; }).length;
    var toResume = selected.filter(function (c) { return !c.active; }).length;
    if (!selected.length) { stopSelectedBtn.disabled = true; stopSelectedBtn.textContent = 'إيقاف المحدد الآن'; }
    else if (toStop > 0 && toResume === 0) { stopSelectedBtn.disabled = false; stopSelectedBtn.textContent = 'إيقاف المحدد الآن (توضيحي)'; }
    else if (toResume > 0 && toStop === 0) { stopSelectedBtn.disabled = false; stopSelectedBtn.textContent = 'تشغيل المحدد الآن (توضيحي)'; }
    else { stopSelectedBtn.disabled = false; stopSelectedBtn.textContent = 'تنفيذ التغييرات (توضيحي)'; }
  }

  document.querySelectorAll('.filter-group').forEach(function (group) {
    group.addEventListener('click', function (e) {
      var btn = e.target.closest('.chip'); if (!btn) return;
      group.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
      btn.classList.add('active');
      filters[group.dataset.filter] = btn.dataset.value;
      render();
    });
  });
  textFilter.addEventListener('input', function () { filters.text = textFilter.value; render(); });
  dateFrom.addEventListener('change', function () { filters.dateFrom = dateFrom.value; render(); });
  dateTo.addEventListener('change', function () { filters.dateTo = dateTo.value; render(); });
  clearDates.addEventListener('click', function () { dateFrom.value = ''; dateTo.value = ''; filters.dateFrom = ''; filters.dateTo = ''; render(); });
  sortSelect.addEventListener('change', function () { filters.sort = sortSelect.value; render(); });

  cardGrid.addEventListener('change', function (e) {
    if (e.target.classList.contains('card-check')) {
      var id = e.target.dataset.id;
      if (e.target.checked) selectedIds[id] = true; else delete selectedIds[id];
      e.target.closest('.candidate-card').classList.toggle('selected', e.target.checked);
      updateSelectionSummary();
    }
  });

  function metricBox(label, value) { return '<div class="metric-box"><div class="metric-label">' + label + '</div><div class="metric-value">' + value + '</div></div>'; }

  var DEST_LABELS = { whatsapp: 'رابط واتساب', messenger: 'رابط ماسنجر', website: 'الصفحة المقصودة' };

  function openExpand(c) {
    var previewEl = document.getElementById('expandPreview');
    previewEl.innerHTML = previewMarkup(c);
    document.getElementById('expandTitle').textContent = c.offer;
    document.getElementById('expandSub').textContent = c.platform + ' \u00B7 ' + c.placement + (c.daysAgo != null ? ' \u2014 ' + sinceLabel(c.daysAgo) : '');
    document.getElementById('expandCaption').textContent = c.caption || c.headline || '(بدون نص)';

    var destLabel = DEST_LABELS[c.landingKind] || 'الوجهة';
    // الرابط بيبقى قابل للضغط بس لو http/https — غير كده بيتعرض كنص عادي
    var landingHref = safeUrl(c.landing);
    var landingInner = landingHref
      ? '<a href="' + esc(landingHref) + '" target="_blank" rel="noopener noreferrer" class="expand-landing-value mono">' + esc(c.landing) + '</a>'
      : '<span class="expand-landing-value mono">' + esc(c.landing || '—') + '</span>';
    document.getElementById('expandLanding').innerHTML = '<div class="expand-landing"><span class="expand-landing-label">' + destLabel + '</span>' + landingInner + '</div>';

    var resultsLabelTxt = c.results != null ? ('النتائج (' + (c.resultLabel || 'نتائج') + ')') : 'النتائج';
    document.getElementById('expandMetrics').innerHTML =
      metricBox('الإنفاق (٧ أيام)', money(c.spend)) +
      metricBox(resultsLabelTxt, c.results != null ? ar(c.results) : '— (لا توجد بيانات تحويل لهذا الإعلان)') +
      metricBox('تكلفة النتيجة', c.cpr != null ? money(c.cpr) : '—') +
      metricBox('ROAS', roasStr(c.roas)) +
      metricBox('قيمة المبيعات', c.dailySales.some(function(v){return v>0;}) ? money(c.dailySales.reduce(function(a,b){return a+b;},0)) : '— (بدون قيمة مالية مرتبطة بالنتائج)');

    // السلسلة الثانية: مبيعات فعلية لو موجودة، وإلا عدد النتائج (حسب هدف الإعلان نفسه) كبديل مفيد
    var useSales = c.dailySales.some(function (v) { return v > 0; });
    var secondSeries = useSales ? c.dailySales : c.dailyResults;
    var secondRowLabel = useSales ? 'المبيعات (ر.س)' : ('النتائج' + (c.resultLabel ? ' — ' + c.resultLabel : ''));
    document.getElementById('legendSalesLabel').textContent = useSales ? 'المبيعات' : 'النتائج';
    var maxBoth = Math.max.apply(null, c.daily.concat(secondSeries)) || 1;
    var headerCells = c.dailyDates.map(function (dt) { return '<th>' + dt + '</th>'; }).join('');
    var spendCells = c.daily.map(function (v) { return '<td class="mono">' + digitsAny(v) + '</td>'; }).join('');
    var secondCells = secondSeries.map(function (v) { return '<td class="mono">' + digitsAny(v) + '</td>'; }).join('');
    document.getElementById('expandChart').innerHTML =
      '<div class="daily-table-wrap"><table class="daily-table"><thead><tr><th></th>' + headerCells + '</tr></thead>' +
      '<tbody><tr><td>الإنفاق (ر.س)</td>' + spendCells + '</tr>' +
      '<tr><td>' + secondRowLabel + '</td>' + secondCells + '</tr></tbody></table></div>';

    expandOverlay.classList.remove('hidden');

    // محاولة تحميل الفيديو الحقيقي نفسه (مش صورة منه) بثلاث محاولات متدرجة:
    // 1) رابط ملف مباشر (source) داخل عنصر <video> حقيقي — أقرب حاجة لـ"سحب الميديا نفسها"
    // 2) تضمين رسمي من Meta (embed_html) لو الملف المباشر مش متاح
    // 3) رابط "افتح على Meta" لو الاتنين فوق فشلوا — عشان الموضوع يبان واضح مش بس صورة ثابتة صامتة
    if (c.videoId && typeof FB !== 'undefined') {
      // المحاولة الأولى: Ad Previews API — أداة Meta الرسمية لمعاينة الإعلان كما يظهر فعلياً
      // (بما فيها الفيديو الحقيقي)، ومصممة أصلاً لصلاحيات إعلانية عادية زي ads_read
      FB.api('/' + c.id + '/previews', { ad_format: 'MOBILE_FEED_STANDARD' }, function (prevResp) {
        var el = document.getElementById('expandPreview');
        if (!el) return;
        var previewFrame = prevResp && prevResp.data && prevResp.data[0] && metaIframeHtml(prevResp.data[0].body);
        if (previewFrame) {
          el.innerHTML = '<div class="video-embed-wrap">' + previewFrame + '</div>';
          return;
        }
        // المحاولة الثانية: بيانات الفيديو مباشرة (تضمين رسمي، ثم ملف مباشر، ثم رابط خارجي)
        FB.api('/' + c.videoId, { fields: 'embed_html,source,permalink_url,picture' }, function (vidResp) {
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
            ? '<a class="video-fallback-link" href="' + esc(permalink) + '" target="_blank" rel="noopener noreferrer">🔗 فتح الفيديو الأصلي على Meta</a>'
            : '';
          if (mediaHtml || linkHtml) {
            el.innerHTML = mediaHtml + linkHtml;
          } else {
            el.innerHTML += '<div class="video-fallback-note">تعذّر جلب الفيديو لهذا الإعلان (قد يحتاج صلاحية إضافية على التطبيق).</div>';
          }
        });
      });
    }
  }
  expandClose.addEventListener('click', function () { expandOverlay.classList.add('hidden'); });
  expandOverlay.addEventListener('click', function (e) { if (e.target === expandOverlay) expandOverlay.classList.add('hidden'); });

  function setBadge(id, state, label) {
    var el = document.getElementById('badge-' + id);
    if (!el) return;
    var track = el.querySelector('.switch-track');
    track.className = 'switch-track';
    if (state === 'active' || state === 'confirmed-on') track.classList.add('on');
    else if (state === 'sending' || state === 'activating' || state === 'retry') track.classList.add('pulse-neutral');
    else if (state === 'alert') track.classList.add('pulse-red');
    el.querySelector('.switch-label').textContent = label;
  }

  cardGrid.addEventListener('click', function (e) {
    var trigger = e.target.closest('.preview-trigger');
    if (trigger) {
      e.preventDefault(); e.stopPropagation();
      var c = candidates.filter(function (x) { return x.id === trigger.dataset.id; })[0];
      if (c) openExpand(c);
      return;
    }
    var sw = e.target.closest('.state-switch');
    if (sw) {
      e.preventDefault(); e.stopPropagation();
      if (sw.disabled) return;
      var c2 = candidates.filter(function (x) { return x.id === sw.dataset.id; })[0];
      if (c2) toggleOne(c2, sw);
    }
  });

  // ملاحظة صريحة: التبديل هنا توضيحي (simulated) — بيحاكي نفس تسلسل الإرسال والتحقق
  // اللي هيحصل فعلياً في النسخة المنتَجة، لكنه معمول عليه ما زال، ما بيبعتش أمر حقيقي لـ Meta.
  function toggleOne(c, btnEl) {
    btnEl.disabled = true;
    if (c.active) {
      setBadge(c.id, 'sending', 'جارٍ الإرسال (توضيحي)…');
      setTimeout(function () { setBadge(c.id, 'confirmed-off', 'متوقف — توضيحي'); c.active = false; btnEl.disabled = false; }, 700);
    } else {
      setBadge(c.id, 'activating', 'جارٍ التفعيل (توضيحي)…');
      setTimeout(function () { setBadge(c.id, 'confirmed-on', 'نشط — توضيحي'); c.active = true; btnEl.disabled = false; }, 700);
    }
  }

  function resetFilterChips() {
    document.querySelectorAll('.filter-group').forEach(function (g) { g.querySelectorAll('.chip').forEach(function (ch) { ch.classList.toggle('active', ch.dataset.value === 'all'); }); });
    filters.platform = 'all'; filters.format = 'all'; filters.status = 'all'; filters.text = '';
    textFilter.value = '';
  }

  function runExecute() {
    resetFilterChips();
    dateFrom.value = ''; dateTo.value = ''; filters.dateFrom = ''; filters.dateTo = '';
    render();
    var selected = candidates.filter(function (c) { return selectedIds[c.id]; });
    if (!selected.length) return;
    var toStop = selected.filter(function (c) { return c.active; });
    var toResume = selected.filter(function (c) { return !c.active; });
    stopSelectedBtn.disabled = true;
    stopSelectedBtn.textContent = 'جارٍ التنفيذ (توضيحي)…';
    var startTime = performance.now();
    var doneCount = 0, total = selected.length;
    function checkAllDone() {
      if (doneCount === total) {
        var elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
        stopSelectedBtn.textContent = 'تم (توضيحي) ✓';
        proofTime.textContent = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        var parts = [];
        if (toStop.length) parts.push(ar(toStop.length) + ' نسخة (توضيحي) تم إيقافها');
        if (toResume.length) parts.push(ar(toResume.length) + ' نسخة (توضيحي) تم تشغيلها');
        proofStatus.textContent = parts.join(' + ');
        proofDuration.textContent = elapsed + ' ثانية';
        proofIncident.textContent = 'هذا تقرير توضيحي — لا يعكس أمراً حقيقياً أُرسل إلى Meta بعد.';
        proofReport.classList.remove('hidden');
      }
    }
    selected.forEach(function (c, i) {
      var baseDelay = 250 + i * 220;
      setTimeout(function () {
        if (c.active) { setBadge(c.id, 'sending', 'جارٍ الإرسال (توضيحي)…'); }
        else { setBadge(c.id, 'activating', 'جارٍ التفعيل (توضيحي)…'); }
      }, baseDelay);
      setTimeout(function () {
        if (c.active) { setBadge(c.id, 'confirmed-off', 'متوقف — توضيحي'); c.active = false; }
        else { setBadge(c.id, 'confirmed-on', 'نشط — توضيحي'); c.active = true; }
        doneCount++; checkAllDone();
      }, baseDelay + 650);
    });
  }
  stopSelectedBtn.addEventListener('click', runExecute);
  printBtn.addEventListener('click', function () { window.print(); });
  // إعادة تحميل كل الحسابات المحمّلة من كل المنصات (مش Meta بس)
  resetAllBtn.addEventListener('click', function () {
    Object.keys(activeSources).forEach(function (p) { loadSource(p, activeSources[p]); });
  });

  var PLATFORM_NAMES = { meta: 'Meta', google: 'Google Ads', snapchat: 'Snapchat', tiktok: 'TikTok' };

  // استرجاع الجلسة بعد reload أو بعد الرجوع من Snapchat/TikTok.
  // بيشتغل بشكل متزامن هنا في آخر السكربت — قبل ما أي رد async (زي تبديل كود Snapchat) يحفظ حاجة جديدة
  function restoreSession(saved) {
    if (!saved) return;
    Object.keys(saved.accountInfo || {}).forEach(function (k) { accountInfo[k] = saved.accountInfo[k]; });

    var expired = [];
    Object.keys(saved.tokens || {}).forEach(function (p) {
      if (validToken(saved.tokens[p])) sessionTokens[p] = saved.tokens[p];
      else expired.push(p);
    });
    googleAccessToken = googleAccessToken || validToken(sessionTokens.google);
    snapchatAccessToken = snapchatAccessToken || validToken(sessionTokens.snapchat);
    tiktokAccessToken = tiktokAccessToken || validToken(sessionTokens.tiktok);

    // Meta: الـ SDK هو اللي يقرر لو الجلسة لسه شغّالة، فبنتأكد منه قبل ما نعرض حساباتها
    var hasSession = function (p) { return p === 'meta' || !!sessionTokens[p]; };
    Object.keys(saved.options || {}).forEach(function (p) {
      if (hasSession(p)) setPlatformOptions(p, saved.options[p]);
    });

    var active = saved.active || {};
    Object.keys(active).forEach(function (p) {
      if (!hasSession(p)) return;
      if (p !== 'meta') { activeSources[p] = active[p]; loadSource(p, active[p]); return; }
      activeSources.meta = active.meta;
      whenFbReady(function () {
        FB.getLoginStatus(function (resp) {
          if (resp && resp.status === 'connected') { loadAdsForAccount(active.meta); return; }
          delete activeSources.meta;
          setPlatformOptions('meta', []);
          connectStatus.textContent = 'انتهت جلسة Meta — سجّل الدخول تاني لعرض إعلاناتها.';
        });
      });
    });
    saveSession();

    if (expired.length) {
      connectStatus.textContent = 'انتهت جلسة ' + expired.map(function (p) { return PLATFORM_NAMES[p] || p; }).join(' و') + ' — سجّل الدخول تاني لعرض إعلاناتها.';
    }
  }
  restoreSession(savedSession);

  render();
