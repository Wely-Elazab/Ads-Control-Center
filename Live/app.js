// =====================================================================
  // !!! هام: عدّل السطر التالي بالـ App ID بتاعك من Meta for Developers !!!
  // =====================================================================
  var META_APP_ID = "2950488078638871";
  var GRAPH_VERSION = 'v21.0';

  var ARABIC_DIGITS = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  function ar(n) { return String(n).replace(/[0-9]/g, function (d) { return ARABIC_DIGITS[d]; }); }
  function digitsAny(n) { return ar(n); }
  // العملة بتيجي من الحساب الإعلاني نفسه — ر.س افتراضياً لو المنصة مرجّعتهاش
  var CURRENCY_LABELS = { SAR: 'ر.س', AED: 'د.إ', EGP: 'ج.م', KWD: 'د.ك', QAR: 'ر.ق', BHD: 'د.ب', OMR: 'ر.ع', JOD: 'د.أ', USD: '$', EUR: '€', GBP: '£' };
  function currencyLabel(cur) { return CURRENCY_LABELS[cur] || cur || 'ر.س'; }
  function money(n, cur) { var s = Math.round(n || 0).toLocaleString('en-US'); return ar(s.replace(/,/g, '٬')) + ' ' + currencyLabel(cur); }
  // رقم بخانة عشرية واحدة بالأرقام العربية (مثال: ٢٫٥)
  // الأرقام اليومية بتتخزن بخانتين عشريتين — التقريب لأقرب رقم صحيح بيحصل وقت العرض بس،
  // عشان صرف صغير زي ٠٫٤ ميتحسبش صفر ويبوّظ تنبيهات زي "مصرفش أمس"
  function r2(n) { return Math.round((n || 0) * 100) / 100; }
  function numAr(n) { var r = Math.round((n || 0) * 10) / 10; return ar(String(r).replace('.', '٫')); }
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
  // الترتيب الافتراضي "الأولوية": الإعلانات اللي محتاجة انتباه تظهر الأول
  var filters = { platform: 'all', format: 'all', status: 'all', health: 'all', text: '', dateFrom: '', dateTo: '', sort: 'priority' };
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
      var googleCandidates = transformGoogleRows(payload.ads, payload.metrics || [], daysFromRange(payload.range), info.currency);
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
  function transformGoogleRows(adRows, metricRows, days, currency) {
    var byDate = {};
    metricRows.forEach(function (row) {
      var key = ggPick(row, 'adGroup.id') + '-' + ggPick(row, 'adGroupAd.ad.id');
      var date = ggPick(row, 'segments.date');
      if (!date) return;
      var m = row.metrics || {};
      if (!byDate[key]) byDate[key] = {};
      byDate[key][date] = {
        spend: r2(parseInt(m.costMicros || 0, 10) / 1000000),
        results: parseFloat(m.conversions || 0),
        sales: r2(parseFloat(m.conversionsValue || 0))
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
      var approval = ggPick(row, 'adGroupAd.policySummary.approvalStatus');
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
        id: id, platform: 'Google Ads', currency: currency || null,
        reviewStatus: approval === 'DISAPPROVED' ? 'disapproved' : ((approval === 'APPROVED_LIMITED' || approval === 'AREA_OF_INTEREST_ONLY') ? 'limited' : null),
        frequency: null,
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
      response.data.forEach(function (a) { accountInfo['meta:' + a.id] = { timeZone: a.timezone_name || null, currency: a.currency || null, accountStatus: a.account_status }; });
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
      var snapCandidates = transformSnapchatAds(adsList, statsList, daysFromRange(payload.range), payload.account && payload.account.currency);
      mergeCandidates(snapCandidates, 'snapchat:' + adAccountId);
      var statsNote = payload.statsError ? ' (تعذّر تحميل الإنفاق: ' + payload.statsError + ')' : '';
      connectStatus.textContent = 'متصل — ' + ar(candidates.length) + ' إعلان محمّل إجمالاً عبر كل المنصات المتصلة.' + statsNote;
      selectedIds = {};
      render();
    }).catch(function (err) {
      connectStatus.textContent = 'تعذّر تحميل إعلانات Snapchat (' + err.message + ').';
    });
  }

  function transformSnapchatAds(adsList, statsList, days, currency) {
    // مع breakdown=ad الإحصائيات بتيجي جوه breakdown_stats.ad[] تحت الحساب —
    // الـ id اللي في المستوى الأعلى هو id الحساب مش الإعلان
    var statsByAd = {};
    statsList.forEach(function (entry) {
      var ts = entry.timeseries_stat || entry;
      var perAd = ts.breakdown_stats && ts.breakdown_stats.ad;
      if (perAd) { perAd.forEach(function (b) { statsByAd[b.id] = b.timeseries || []; }); }
      else if (ts.id) { statsByAd[ts.id] = ts.timeseries || []; }
    });
    // القيم المالية في Snapchat بالمايكرو (÷ 1,000,000)
    var parsed = adsList.map(function (item) {
      var ad = item.ad || item;
      var byDay = {};
      (statsByAd[ad.id] || []).forEach(function (r) { byDay[(r.start_time || '').slice(0, 10)] = r.stats || r; });
      var p = { ad: ad, daily: [], swipes: [], purchases: [], sales: [] };
      days.forEach(function (day) {
        var st = byDay[day.key];
        p.daily.push(st ? r2(parseFloat(st.spend || 0) / 1000000) : 0);
        p.swipes.push(st ? Math.round(parseFloat(st.swipes || 0)) : 0);
        p.purchases.push(st ? Math.round(parseFloat(st.conversion_purchases || 0)) : 0);
        p.sales.push(st ? r2(parseFloat(st.conversion_purchases_value || 0) / 1000000) : 0);
      });
      return p;
    });
    // لو الحساب بيسجّل مشتريات (Snap Pixel) نعتبرها النتيجة لكل إعلاناته، وإلا نرجع للسوايب —
    // قرار واحد على مستوى الحساب عشان المقارنة بين الإعلانات تفضل عادلة
    var tracksPurchases = parsed.some(function (p) { return p.purchases.some(function (v) { return v > 0; }); });
    return parsed.map(function (p) {
      var ad = p.ad;
      var id = 's-' + ad.id;
      var dailyResults = tracksPurchases ? p.purchases : p.swipes;
      var dailySales = tracksPurchases ? p.sales : p.daily.map(function () { return 0; });
      var spend = r2(p.daily.reduce(function (a, b) { return a + b; }, 0));
      var results = dailyResults.reduce(function (a, b) { return a + b; }, 0);
      var totalSales = dailySales.reduce(function (a, b) { return a + b; }, 0);
      return {
        id: id, platform: 'Snapchat', placement: 'Discover', currency: currency || null,
        reviewStatus: ad.review_status === 'REJECTED' ? 'disapproved' : null,
        frequency: null,
        format: ad.type && /VIDEO/i.test(ad.type) ? 'video' : (ad.type && /SNAP_AD/i.test(ad.type) ? 'video' : 'image'),
        thumbUrl: null,
        headline: ad.name || ('إعلان Snapchat #' + ad.id), desc: '',
        offer: ad.name || id, caption: ad.name || '',
        landing: '—', landingKind: null,
        daysAgo: ad.created_at ? daysBetween(ad.created_at) : null,
        updatedDaysAgo: ad.updated_at ? daysBetween(ad.updated_at) : null,
        daily: p.daily, dailySales: dailySales, dailyResults: dailyResults, dailyDates: days.map(function (d) { return d.label; }),
        spend: spend, results: results, resultLabel: tracksPurchases ? 'مشتريات' : 'سوايب (نقرات)',
        cpr: (results && spend) ? (spend / results) : null,
        roas: (totalSales > 0 && spend > 0) ? (totalSales / spend) : null,
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
      var tiktokCandidates = transformTikTokAds(adsList, payload.report || [], daysFromRange(payload.range), payload.advertiser && payload.advertiser.currency);
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

  function transformTikTokAds(adsList, reportList, days, currency) {
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
        daily.push(m ? r2(parseFloat(m.spend || 0)) : 0);
        dailyResults.push(m ? Math.round(parseFloat(m.conversion || 0)) : 0);
      });
      var spend = daily.reduce(function (a, b) { return a + b; }, 0);
      var results = dailyResults.reduce(function (a, b) { return a + b; }, 0);
      return {
        id: id, platform: 'TikTok', placement: 'In-Feed', currency: currency || null,
        reviewStatus: null, frequency: null,
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
    fetchMetaAds(accountId, function (err, adsData, adsTruncated) {
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
        // تكرار الظهور (frequency) لازم يتحسب على الأسبوع كله مرة واحدة — مينفعش نجمعه من أرقام يومية،
        // لأن نفس الشخص ممكن يظهر في أكتر من يوم. فشل الطلب ده مش بيوقف التحميل، بس تنبيه "زهق الجمهور" مش هيظهر
        fetchAllPages('/' + accountId + '/insights', {
          level: 'ad',
          time_range: JSON.stringify({ since: days[0].key, until: days[days.length - 1].key }),
          fields: 'ad_id,frequency,reach,impressions',
          limit: 500
        }, FULL_SCAN_CAP, function (err3, reachData) {
        var reachByAd = {};
        (reachData || []).forEach(function (row) { reachByAd[row.ad_id] = row; });
        var currency = info.currency || null;
        mergeCandidates(order.map(function (id) { return transformRealAd(adsById[id], insightsByAd[id] || [], adsetStatusMap, days, reachByAd[id], currency); }), 'meta:' + accountId);
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

  // حالات Meta اللي معناها إن المنصة نفسها عندها ملاحظة على الإعلان
  var META_REVIEW_STATUS = { DISAPPROVED: 'disapproved', WITH_ISSUES: 'limited' };

  // صور الإعلانات: thumbnail_url الافتراضي من Meta صورة مصغّرة ٦٤×٦٤ بس — ولما بتتكبّر في الكارت بتبان مشوشة.
  // عشان كده بنطلب نسخة ١٠٨٠ بكسل، ولو الـ API رفض الصيغة دي بنرجع للطلب العادي بدل ما الإعلانات كلها متحمّلش
  var META_AD_FIELDS = 'id,name,effective_status,created_time,updated_time,adset{id,name,optimization_goal},';
  var META_CREATIVE_FIELDS = '{title,body,image_url,thumbnail_url,video_id,' +
    'object_story_spec{link_data{link,picture,call_to_action},video_data{call_to_action,image_url}}}';
  function fetchMetaAds(accountId, onDone) {
    fetchAllPages('/' + accountId + '/ads', {
      fields: META_AD_FIELDS + 'creative.thumbnail_width(1080).thumbnail_height(1080)' + META_CREATIVE_FIELDS,
      limit: 100
    }, PAGE_SAFETY_CAP, function (err, adsData, truncated) {
      if (!err) { onDone(null, adsData, truncated); return; }
      fetchAllPages('/' + accountId + '/ads', { fields: META_AD_FIELDS + 'creative' + META_CREATIVE_FIELDS, limit: 100 }, PAGE_SAFETY_CAP, onDone);
    });
  }

  // أوضح صورة متاحة للإعلان: الصورة الأصلية ← صورة الرابط ← غلاف الفيديو ← الصورة المصغّرة (عالية الدقة لو اتطلبت)
  function metaImageUrl(creative) {
    var spec = creative.object_story_spec || {};
    return creative.image_url ||
      (spec.link_data && spec.link_data.picture) ||
      (spec.video_data && spec.video_data.image_url) ||
      creative.thumbnail_url || null;
  }

  function transformRealAd(ad, insightRows, adsetStatusMap, days, reachRow, currency) {
    var creative = ad.creative || {};
    var imageUrl = metaImageUrl(creative);
    var format = creative.video_id ? 'video' : (imageUrl ? 'image' : 'text');
    var goal = (ad.adset && ad.adset.optimization_goal) || null;
    var byDate = {};
    (insightRows || []).forEach(function (r) { byDate[r.date_start] = r; });

    var daily = [], dailySales = [], dailyResultsArr = [];
    // لو هدف الإعلان معروف، نوع النتيجة معروف حتى لو الإعلان مصرفش ولا يوم
    var goalAction = GOAL_TO_ACTION[goal] && GOAL_TO_ACTION[goal][0];
    var totalResultsVal = 0, resultLabel = goalAction ? goalAction.label : null, resultType = goalAction ? goalAction.type : null, matchedGoal = !!goalAction;
    days.forEach(function (day) {
      var row = byDate[day.key];
      var spendVal = row ? r2(parseFloat(row.spend || 0)) : 0;
      daily.push(spendVal);
      if (row) {
        var found = resultForGoal(row.actions, goal);
        if (found) {
          totalResultsVal += found.value;
          resultLabel = found.label; resultType = found.type; matchedGoal = found.matchedGoal;
          dailyResultsArr.push(Math.round(found.value));
        } else { dailyResultsArr.push(0); }
        var salesVal = resultType ? valueForType(row.action_values, resultType) : null;
        dailySales.push(salesVal != null ? r2(salesVal) : 0);
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
      currency: currency || null,
      reviewStatus: META_REVIEW_STATUS[ad.effective_status] || null,
      frequency: reachRow && reachRow.frequency != null ? parseFloat(reachRow.frequency) : null,
      reach: reachRow && reachRow.reach != null ? parseInt(reachRow.reach, 10) : null,
      placement: (ad.adset && ad.adset.name) || '—',
      format: format,
      duration: format === 'video' ? '' : undefined,
      videoId: creative.video_id || null,
      thumbUrl: imageUrl,
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

  // ---------- وضع العرض فقط ----------
  // المرحلة الأولى: الأداة للعرض والتحليل والتنبيه بس، من غير أي إجراء على الإعلانات — عشان قرارات
  // صاحب البزنس متتعارضش مع اختبارات مسؤول الإعلانات أو الوكالة.
  // أدوات الإيقاف/التشغيل التوضيحية (المفتاح، التحديد، "إيقاف المحدد"، تقرير الإثبات) مخفية بس،
  // وكودها لسه موجود تحت — لو اتفعّلت في مرحلة لاحقة يكفي نخلّي ACTIONS_ENABLED = true
  var ACTIONS_ENABLED = false;
  document.body.classList.toggle('view-only', !ACTIONS_ENABLED);

  // ---------- التقييم والتنبيهات (المحرك نفسه في alerts.js) ----------
  var HEALTH = {
    review: { label: 'يحتاج مراجعة', cls: 'h-review', order: 0 },
    improve: { label: 'يحتاج تحسين', cls: 'h-improve', order: 1 },
    good: { label: 'جيد', cls: 'h-good', order: 2 },
    inactive: { label: 'غير فعال', cls: 'h-inactive', order: 3 }
  };
  var LEVELS = {
    critical: { label: 'يحتاج مراجعة', cls: 'lv-critical' },
    warning: { label: 'يحتاج تحسين', cls: 'lv-warning' },
    opportunity: { label: 'فرصة', cls: 'lv-opportunity' },
    info: { label: 'للعلم', cls: 'lv-info' }
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
        meta[p + ':' + o.value] = { label: o.label, currency: info.currency || null, metaAccountStatus: p === 'meta' && info.accountStatus != null ? Number(info.accountStatus) : null };
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
      return '<div class="preview preview-image ' + c.themeClass + '"><span class="format-badge">تصميم ثابت</span></div>';
    }
    return '<div class="preview preview-text"><span class="text-url">' + esc(c.landing !== '—' ? c.landing : '') + '</span><span class="text-headline">' + esc(c.headline) + '</span><span class="text-desc">' + esc(c.desc) + '</span></div>';
  }

  function statusLabelOf(c) {
    if (c.active) return 'نشط';
    if (c.pausedLevel === 'adset') return 'متوقف (المجموعة)';
    if (c.pausedLevel === 'campaign') return 'متوقف (الحملة)';
    return 'متوقف';
  }

  function cardChips(c) {
    var chips = '<span class="metric-chip' + mv(c, 'spend') + '" title="الإنفاق — آخر ٧ أيام">' + money(c.spend, c.currency) + '</span>';
    if (c.results != null) {
      chips += '<span class="metric-chip' + mv(c, 'results') + '" title="النتائج — آخر ٧ أيام">' + ar(c.results) + ' ' + esc(c.resultLabel || 'نتائج') + '</span>';
    }
    var showRoas = c.roas != null || mv(c, 'roas');
    if (showRoas) {
      chips += '<span class="metric-chip' + mv(c, 'roas') + '" title="كل ١ بيتصرف بيرجع كام مبيعات">عائد ' + roasStr(c.roas) + '</span>';
    }
    // تكلفة النتيجة بتظهر لو مفيش عائد نعرضه، أو لو هي نفسها المشكلة
    if (c.cpr != null && (!showRoas || mv(c, 'cpr'))) {
      chips += '<span class="metric-chip' + mv(c, 'cpr') + '" title="تكلفة النتيجة الواحدة">' + money(c.cpr, c.currency) + ' للواحد</span>';
    }
    if (c.frequency != null && mv(c, 'frequency')) {
      chips += '<span class="metric-chip' + mv(c, 'frequency') + '" title="متوسط مرات ظهور الإعلان لنفس الشخص">تكرار ' + numAr(c.frequency) + '</span>';
    }
    if (mv(c, 'delivery') && !mv(c, 'spend')) {
      chips += '<span class="metric-chip' + mv(c, 'delivery') + '">وصول ضعيف</span>';
    }
    return chips;
  }

  function cardMarkup(c) {
    var eid = esc(c.id);
    var a = adAnalysis(c);
    var h = HEALTH[a.health];
    var dot = '<span class="health-dot ' + h.cls + '" title="' + h.label + '"><span class="sr-only">' + h.label + '</span></span>';
    var shown = a.issues.filter(function (i) { return i.level !== 'info'; });
    var top = shown[0] || a.issues[0];
    var issueLine = top
      ? '<div class="card-issue ' + LEVELS[top.level].cls + '">' + esc(top.title) + (a.issues.length > 1 ? ' <span class="card-issue-more">+' + ar(a.issues.length - 1) + '</span>' : '') + '</div>'
      : '';
    var line1 = '<div class="card-line1">' + esc(c.platform) + ' <span style="color:var(--ink-faint);font-weight:400;">·</span> ' + esc(c.placement) + '</div>';
    var name = '<div class="card-name" title="' + esc(c.offer) + '">' + esc(c.offer) + '</div>';
    var info = '<div class="card-info">' + line1 + name + issueLine + '<div class="card-metrics">' + cardChips(c) + '</div>';

    if (!ACTIONS_ENABLED) {
      return (
        '<article class="candidate-card ' + h.cls + '" id="card-' + eid + '" data-id="' + eid + '" tabindex="0" role="button" aria-label="' + esc(c.offer) + ' — ' + h.label + '">' +
          dot +
          '<span class="preview-trigger" data-id="' + eid + '">' + previewMarkup(c) + '</span>' +
          info +
            '<div class="card-foot">' +
              '<span class="days-badge">' + sinceLabel(c.daysAgo) + '</span>' +
              '<span class="status-text' + (c.active ? ' on' : '') + '">' + statusLabelOf(c) + '</span>' +
            '</div>' +
          '</div>' +
        '</article>'
      );
    }

    // وضع الإجراءات (مرحلة لاحقة) — نفس الكارت القديم بالتحديد والمفتاح
    var checked = selectedIds[c.id] ? ' checked' : '';
    var selCls = selectedIds[c.id] ? ' selected' : '';
    return (
      '<label class="candidate-card ' + h.cls + selCls + '" id="card-' + eid + '">' +
        dot +
        '<span class="check-wrap"><input type="checkbox" class="card-check" data-id="' + eid + '"' + checked + '></span>' +
        '<span class="preview-trigger" data-id="' + eid + '">' + previewMarkup(c) + '</span>' +
        info +
          '<div class="card-foot">' +
            '<span class="days-badge">' + sinceLabel(c.daysAgo) + '</span>' +
            '<button type="button" class="state-switch" id="badge-' + eid + '" data-id="' + eid + '"><span class="switch-track' + (c.active ? ' on' : '') + '"><span class="switch-thumb"></span></span><span class="switch-label">' + statusLabelOf(c) + '</span></button>' +
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
      if (filters.health !== 'all' && adAnalysis(c).health !== filters.health) return false;
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
    if (key === 'priority') {
      // الأهم أولاً: يحتاج مراجعة ← يحتاج تحسين ← جيد ← غير فعال، وجوه كل مجموعة الأعلى إنفاقاً
      arr.sort(function (a, b) { return (HEALTH[adAnalysis(a).health].order - HEALTH[adAnalysis(b).health].order) || (b.spend - a.spend); });
    }
    else if (key === 'launch') arr.sort(function (a, b) { return age(a.daysAgo) - age(b.daysAgo); });
    else if (key === 'update') arr.sort(function (a, b) { return age(a.updatedDaysAgo) - age(b.updatedDaysAgo); });
    else if (key === 'spend') arr.sort(function (a, b) { return b.spend - a.spend; });
    return arr;
  }

  function render() {
    runAnalysis();
    var visible = sortCandidates(visibleCandidates(), filters.sort);
    if (!candidates.length) {
      cardGrid.innerHTML = '';
      galleryCount.textContent = 'سجّل الدخول لعرض إعلاناتك';
    } else {
      cardGrid.innerHTML = visible.length ? visible.map(cardMarkup).join('') : '<div class="empty-state" style="grid-column:1/-1">لا توجد إعلانات مطابقة للفلتر الحالي</div>';
      galleryCount.textContent = 'عرض ' + ar(visible.length) + ' من ' + ar(candidates.length) + ' إعلاناً حقيقياً';
    }
    renderHealthCounts();
    renderAlerts();
    if (ACTIONS_ENABLED) updateSelectionSummary();
  }

  // عدد الإعلانات في كل تقييم — بيظهر جنب كل اختيار في فلتر "تقييم الأداء"
  function renderHealthCounts() {
    var counts = analysis.summary.health;
    document.querySelectorAll('[data-health-count]').forEach(function (el) {
      var k = el.getAttribute('data-health-count');
      el.textContent = candidates.length ? ar(counts[k] || 0) : '';
    });
  }

  selectAllBtn.addEventListener('click', function () { visibleCandidates().forEach(function (c) { selectedIds[c.id] = true; }); render(); });
  clearSelBtn.addEventListener('click', function () { selectedIds = {}; render(); });
  filterToggle.addEventListener('click', function () { filterBar.classList.toggle('open'); });

  function updateSelectionSummary() {
    var selected = candidates.filter(function (c) { return selectedIds[c.id]; });
    var visibleNow = visibleCandidates();
    var unselectedVisible = visibleNow.filter(function (c) { return !selectedIds[c.id]; }).length;
    selectionSummary.textContent = 'محدد: ' + ar(selected.length) + ' · غير محدد من الظاهر: ' + ar(unselectedVisible);
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
      setFilterChip(group, btn.dataset.value);
      render();
    });
  });
  function setFilterChip(group, value) {
    group.querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('active', c.dataset.value === value); });
    filters[group.dataset.filter] = value;
  }
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

  function metricBox(label, value, extraCls) { return '<div class="metric-box' + (extraCls || '') + '"><div class="metric-label">' + label + '</div><div class="metric-value">' + value + '</div></div>'; }

  var DEST_LABELS = { whatsapp: 'رابط واتساب', messenger: 'رابط ماسنجر', website: 'الصفحة المقصودة' };

  function issueMarkup(i) {
    return '<div class="issue-item ' + LEVELS[i.level].cls + '">' +
      '<div class="issue-title"><span class="issue-level">' + LEVELS[i.level].label + '</span>' + esc(i.title) + '</div>' +
      '<div class="issue-detail">' + esc(i.detail) + '</div>' +
      '<div class="issue-advice">💡 ' + esc(i.advice) + '</div>' +
    '</div>';
  }

  var expandSeq = 0;
  function openExpand(c) {
    var a = adAnalysis(c);
    var h = HEALTH[a.health];
    var previewEl = document.getElementById('expandPreview');
    previewEl.innerHTML = previewMarkup(c);
    document.getElementById('expandTitle').textContent = c.offer;
    document.getElementById('expandSub').textContent = c.platform + ' · ' + c.placement + ' · ' + statusLabelOf(c) + (c.daysAgo != null ? ' — ' + sinceLabel(c.daysAgo) : '');
    document.getElementById('expandHealth').innerHTML = '<span class="health-badge ' + h.cls + '"><span class="health-dot-inline"></span>' + h.label + '</span>';
    document.getElementById('expandIssues').innerHTML = a.issues.length
      ? a.issues.map(issueMarkup).join('')
      : (c.active ? '<div class="issue-none">مفيش ملاحظات على الإعلان ده حالياً.</div>' : '');
    document.getElementById('expandCaption').textContent = c.caption || c.headline || '(بدون نص)';

    var destLabel = DEST_LABELS[c.landingKind] || 'الوجهة';
    // الرابط بيبقى قابل للضغط بس لو http/https — غير كده بيتعرض كنص عادي
    var landingHref = safeUrl(c.landing);
    var landingInner = landingHref
      ? '<a href="' + esc(landingHref) + '" target="_blank" rel="noopener noreferrer" class="expand-landing-value mono">' + esc(c.landing) + '</a>'
      : '<span class="expand-landing-value mono">' + esc(c.landing || '—') + '</span>';
    document.getElementById('expandLanding').innerHTML = '<div class="expand-landing"><span class="expand-landing-label">' + destLabel + '</span>' + landingInner + '</div>';

    var cur = c.currency;
    var hasSales = c.dailySales.some(function (v) { return v > 0; });
    var resultsLabelTxt = c.results != null ? ('النتائج (' + esc(c.resultLabel || 'نتائج') + ')') : 'النتائج';
    var boxes =
      metricBox('الإنفاق (٧ أيام)', money(c.spend, cur), mv(c, 'spend') || mv(c, 'delivery')) +
      metricBox(resultsLabelTxt, c.results != null ? ar(c.results) : '— (لا توجد بيانات تحويل لهذا الإعلان)', mv(c, 'results')) +
      metricBox('تكلفة النتيجة الواحدة', c.cpr != null ? money(c.cpr, cur) : '—', mv(c, 'cpr')) +
      metricBox('العائد (كل ١ بيرجع)', roasStr(c.roas), mv(c, 'roas'));
    if (c.frequency != null) boxes += metricBox('تكرار الظهور لنفس الشخص', numAr(c.frequency) + ' مرة', mv(c, 'frequency'));
    boxes += metricBox('قيمة المبيعات', hasSales ? money(c.dailySales.reduce(function (x, y) { return x + y; }, 0), cur) : '— (بدون قيمة مالية مرتبطة بالنتائج)');
    document.getElementById('expandMetrics').innerHTML = boxes;

    // السلسلة الثانية: مبيعات فعلية لو موجودة، وإلا عدد النتائج (حسب هدف الإعلان نفسه) كبديل مفيد
    var secondSeries = hasSales ? c.dailySales : c.dailyResults;
    var secondRowLabel = hasSales ? 'المبيعات (' + currencyLabel(cur) + ')' : ('النتائج' + (c.resultLabel ? ' — ' + esc(c.resultLabel) : ''));
    document.getElementById('legendSalesLabel').textContent = hasSales ? 'المبيعات' : 'النتائج';
    // عمود "أمس" متعلّم — أغلب التنبيهات مبنية عليه، وعمود النهارده يوم لسه مخلصش
    var colCls = function (i) { return i === 5 ? ' class="col-yesterday"' : (i === 6 ? ' class="col-today"' : ''); };
    var headerCells = c.dailyDates.map(function (dt, i) { return '<th' + colCls(i) + '>' + (i === 5 ? 'أمس' : (i === 6 ? 'اليوم' : dt)) + '</th>'; }).join('');
    var spendCells = c.daily.map(function (v, i) { return '<td' + colCls(i) + '><span class="mono">' + digitsAny(Math.round(v)) + '</span></td>'; }).join('');
    var secondCells = secondSeries.map(function (v, i) { return '<td' + colCls(i) + '><span class="mono">' + digitsAny(Math.round(v)) + '</span></td>'; }).join('');
    document.getElementById('expandChart').innerHTML =
      '<div class="daily-table-wrap"><table class="daily-table"><thead><tr><th></th>' + headerCells + '</tr></thead>' +
      '<tbody><tr><td>الإنفاق (' + currencyLabel(cur) + ')</td>' + spendCells + '</tr>' +
      '<tr><td>' + secondRowLabel + '</td>' + secondCells + '</tr></tbody></table></div>';

    expandOverlay.classList.remove('hidden');
    expandOverlay.querySelector('.expand-card').scrollTop = 0;

    // محاولة تحميل الفيديو الحقيقي نفسه (مش صورة منه) بثلاث محاولات متدرجة:
    // 1) رابط ملف مباشر (source) داخل عنصر <video> حقيقي — أقرب حاجة لـ"سحب الميديا نفسها"
    // 2) تضمين رسمي من Meta (embed_html) لو الملف المباشر مش متاح
    // 3) رابط "افتح على Meta" لو الاتنين فوق فشلوا — عشان الموضوع يبان واضح مش بس صورة ثابتة صامتة
    // كل فتح جديد للنافذة بياخد رقم — عشان رد متأخر من Meta لإعلان قديم ميكتبش فوق معاينة الإعلان المفتوح دلوقتي
    var openSeq = ++expandSeq;
    if (c.platform === 'Meta' && typeof FB !== 'undefined') {
      // المحاولة الأولى (صور وفيديو): Ad Previews API — أداة Meta الرسمية لمعاينة الإعلان كما يظهر فعلياً
      // بنفس جودة الصورة الأصلية، ومصممة أصلاً لصلاحيات إعلانية عادية زي ads_read
      FB.api('/' + c.id + '/previews', { ad_format: 'MOBILE_FEED_STANDARD' }, function (prevResp) {
        var el = document.getElementById('expandPreview');
        if (!el || openSeq !== expandSeq) return;
        var previewFrame = prevResp && prevResp.data && prevResp.data[0] && metaIframeHtml(prevResp.data[0].body);
        if (previewFrame) {
          el.innerHTML = '<div class="video-embed-wrap">' + previewFrame + '</div>';
          return;
        }
        // إعلان صورة والمعاينة فشلت: الصورة الثابتة اللي معروضة أصلاً تكفي
        if (!c.videoId) return;
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
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    expandOverlay.classList.add('hidden');
    settingsOverlay.classList.add('hidden');
    platformOverlay.classList.add('hidden');
  });

  function findCandidate(id) { return candidates.filter(function (x) { return x.id === id; })[0]; }

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
    if (!ACTIONS_ENABLED) {
      // وضع العرض: الضغط على أي مكان في الكارت بيفتح التفاصيل
      var card = e.target.closest('.candidate-card');
      if (!card) return;
      var picked = findCandidate(card.dataset.id);
      if (picked) openExpand(picked);
      return;
    }
    var trigger = e.target.closest('.preview-trigger');
    if (trigger) {
      e.preventDefault(); e.stopPropagation();
      var c = findCandidate(trigger.dataset.id);
      if (c) openExpand(c);
      return;
    }
    var sw = e.target.closest('.state-switch');
    if (sw) {
      e.preventDefault(); e.stopPropagation();
      if (sw.disabled) return;
      var c2 = findCandidate(sw.dataset.id);
      if (c2) toggleOne(c2, sw);
    }
  });
  cardGrid.addEventListener('keydown', function (e) {
    if (ACTIONS_ENABLED || (e.key !== 'Enter' && e.key !== ' ')) return;
    var card = e.target.closest('.candidate-card');
    if (!card) return;
    e.preventDefault();
    var picked = findCandidate(card.dataset.id);
    if (picked) openExpand(picked);
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
  viewTabs.forEach(function (t) { t.addEventListener('click', function () { showView(t.dataset.view); }); });

  // ---------- صفحة التنبيهات ----------
  var alertsLevelFilter = 'all';
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
    var urgent = s.levels.critical + s.levels.warning;
    alertsTabCount.textContent = urgent ? ar(urgent) : '';
    alertsTabCount.classList.toggle('has-critical', s.levels.critical > 0);

    if (!candidates.length) {
      alertsSummaryEl.innerHTML = '';
      alertsListEl.innerHTML = '<div class="empty-state">سجّل الدخول وحمّل حساب إعلاني عشان تظهر التنبيهات هنا.</div>';
      return;
    }

    var atRiskKeys = Object.keys(s.atRisk);
    var atRisk = atRiskKeys.length ? atRiskKeys.map(function (cur) { return money(s.atRisk[cur], cur || null); }).join(' + ') : money(0);
    var box = function (level, count, label) {
      return '<button type="button" class="summary-box ' + LEVELS[level].cls + (alertsLevelFilter === level ? ' active' : '') + '" data-level="' + level + '">' +
        '<span class="summary-count">' + ar(count) + '</span><span class="summary-label">' + label + '</span></button>';
    };
    alertsSummaryEl.innerHTML =
      '<div class="summary-risk"><span class="summary-risk-label">ميزانية معرّضة للهدر (صرف بدون نتائج أو بخسارة)</span><span class="summary-risk-value">' + atRisk + '</span></div>' +
      '<div class="summary-boxes">' +
        box('critical', s.levels.critical, 'يحتاج مراجعة') +
        box('warning', s.levels.warning, 'يحتاج تحسين') +
        box('opportunity', s.levels.opportunity, 'فرص') +
        box('info', s.levels.info, 'للعلم') +
      '</div>';

    var list = analysis.alerts.filter(function (a) { return alertsLevelFilter === 'all' || a.level === alertsLevelFilter; });
    alertsListEl.innerHTML = list.length
      ? list.map(alertMarkup).join('')
      : '<div class="empty-state">' + (alertsLevelFilter === 'all' ? 'مفيش تنبيهات حالياً — أداء إعلاناتك ماشي كويس.' : 'مفيش تنبيهات من النوع ده حالياً.') + '</div>';
  }

  alertsSummaryEl.addEventListener('click', function (e) {
    var b = e.target.closest('.summary-box'); if (!b) return;
    alertsLevelFilter = alertsLevelFilter === b.dataset.level ? 'all' : b.dataset.level;
    renderAlerts();
  });
  function openAlertAd(e) {
    var item = e.target.closest('.alert-item.clickable'); if (!item) return;
    if (e.type === 'keydown') { if (e.key !== 'Enter' && e.key !== ' ') return; e.preventDefault(); }
    var c = findCandidate(item.dataset.adId);
    if (c) openExpand(c);
  }
  alertsListEl.addEventListener('click', openAlertAd);
  alertsListEl.addEventListener('keydown', openAlertAd);

  // ---------- إعدادات التنبيهات ----------
  var settingsOverlay = document.getElementById('settingsOverlay');
  var settingsForm = document.getElementById('settingsForm');
  var SETTING_UNITS = { multiple: '×', ratio: '٪', days: 'يوم', times: 'مرة', count: 'نتيجة' };

  function renderSettingsForm() {
    var current = PauseProofAlerts.mergeSettings(alertSettings);
    var groups = {};
    PauseProofAlerts.SETTINGS_META.forEach(function (m) { (groups[m.group] = groups[m.group] || []).push(m); });
    settingsForm.innerHTML = Object.keys(groups).map(function (g) {
      return '<fieldset class="settings-group"><legend>' + esc(g) + '</legend>' + groups[g].map(function (m) {
        var v = current[m.key];
        var shown = m.kind === 'ratio' ? Math.round(v * 100) : v;
        var step = m.kind === 'multiple' ? '0.1' : '1';
        return '<label class="setting-row"><span class="setting-text"><span class="setting-label">' + esc(m.label) + '</span><span class="setting-help">' + esc(m.help) + '</span></span>' +
          '<span class="setting-input"><input type="number" inputmode="decimal" min="0" step="' + step + '" name="' + m.key + '" value="' + shown + '"><span class="setting-unit">' + SETTING_UNITS[m.kind] + '</span></span></label>';
      }).join('') + '</fieldset>';
    }).join('');
  }

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
    var next = {};
    PauseProofAlerts.SETTINGS_META.forEach(function (m) {
      var input = settingsForm.querySelector('[name="' + m.key + '"]');
      var raw = parseFloat(String(input.value).replace(',', '.'));
      if (!isFinite(raw) || raw < 0) return; // قيمة غلط = نرجع للافتراضي
      next[m.key] = m.kind === 'ratio' ? raw / 100 : raw;
    });
    alertSettings = next;
    var saved = storeAlertSettings(alertSettings);
    settingsOverlay.classList.add('hidden');
    render();
    if (!saved) connectStatus.textContent = 'اتطبقت الإعدادات، بس المتصفح مش سامح بحفظها — هترجع للافتراضي لو قفلت الصفحة.';
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
    filters.platform = 'all'; filters.format = 'all'; filters.status = 'all'; filters.health = 'all'; filters.text = '';
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
