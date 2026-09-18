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
  // المبالغ الصغيرة بتتعرض بخانة عشرية (٠٫٤ ر.س) — التقريب كان بيخليها "٠ ر.س" في تنبيه زي "صرف ١ بس"
  function money(n, cur) {
    var v = n || 0;
    var s = (Math.abs(v) > 0 && Math.abs(v) < 10 && Math.round(v) !== v)
      ? String(Math.round(v * 10) / 10).replace('.', '٫')
      : Math.round(v).toLocaleString('en-US').replace(/,/g, '٬');
    return ar(s) + ' ' + currencyLabel(cur);
  }
  // رقم بخانة عشرية واحدة بالأرقام العربية (مثال: ٢٫٥)
  // الأرقام اليومية بتتخزن بخانتين عشريتين — التقريب لأقرب رقم صحيح بيحصل وقت العرض بس،
  // عشان صرف صغير زي ٠٫٤ ميتحسبش صفر ويبوّظ تنبيهات زي "مصرفش أمس"
  function r2(n) { return Math.round((n || 0) * 100) / 100; }
  function numAr(n) { var r = Math.round((n || 0) * 10) / 10; return ar(String(r).replace('.', '٫')); }
  function roasStr(r) { if (!r) return '—'; return '×' + numAr(r); }
  function sinceLabel(n) {
    if (n == null) return '';
    if (n === 0) return 'اليوم';
    if (n === 1) return 'قبل يوم';
    if (n === 2) return 'قبل يومين';
    return 'قبل ' + ar(n) + ' يوماً';
  }
  // بيرجّع null لو التاريخ مش موجود أو غلط — "٠ يوم" كانت بتتقري غلط إنه اتطلق النهارده
  function daysBetween(dateStr) {
    if (!dateStr) return null;
    var then = new Date(dateStr).getTime();
    if (isNaN(then)) return null;
    return Math.max(0, Math.round((Date.now() - then) / 86400000));
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
  // بيرجّع الرابط بس لو http/https وكامل — أي حاجة تانية (javascript: أو data: أو رابط ناقص
  // كان هيتحوّل لرابط على موقعنا إحنا) بترجع null
  function safeUrl(u) {
    if (!u || u === '—') return null;
    try {
      var parsed = new URL(String(u));
      return (parsed.protocol === 'https:' || parsed.protocol === 'http:') ? parsed.href : null;
    } catch (e) { return null; }
  }
  // HTML المعاينة اللي بيرجع من Meta: بناخد منه الـ iframe بس، وبنتأكد إن مصدره facebook.com
  // بدل ما نحط HTML خام من API جوه الصفحة.
  // المقاس: Meta بتحدد عرض وارتفاع الإطار حسب شكل الإعلان — لازم نحافظ عليهم (كأرقام بس)،
  // وإلا الإعلان بيتقص أو بيصغر. مشغّل الفيديو (plugins/video.php) بيتمدد بعرض النافذة بنفس النسبة،
  // وصفحة المعاينة (preview_iframe) بتتعرض بمقاسها الأصلي لأن محتواها مش بيتمدد
  function metaIframeHtml(html) {
    try {
      var doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
      var frame = doc.querySelector('iframe');
      var src = frame && safeUrl(frame.getAttribute('src'));
      if (!src || !/(^|\.)facebook\.com$/i.test(new URL(src).hostname)) return null;
      var dim = function (name, fallback) {
        var n = parseInt(frame.getAttribute(name), 10);
        return (n >= 150 && n <= 2000) ? n : fallback;
      };
      var w = dim('width', 540), h = dim('height', 690);
      var style = /\/plugins\/video\.php/.test(src)
        ? 'width:100%;aspect-ratio:' + w + ' / ' + h + ';'
        : 'width:' + w + 'px;height:' + h + 'px;';
      return '<iframe src="' + esc(src) + '" style="' + style + '" allowfullscreen="true" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"></iframe>';
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
  var filters = { platform: 'all', format: 'all', status: 'all', health: 'all', text: '', sort: 'priority' };
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

  // لو المستخدم بدّل الحساب بسرعة، رد الحساب القديم ممكن يوصل بعد الجديد ويكتب فوقه.
  // كل عملية تحميل لمنصة بتاخد رقم، والرد بيتجاهل نفسه لو بقى قديم
  var loadSeq = {};
  function beginLoad(platform) { loadSeq[platform] = (loadSeq[platform] || 0) + 1; return loadSeq[platform]; }
  function isCurrentLoad(platform, token) { return loadSeq[platform] === token; }

  // ---------- فترة البيانات ----------
  // زي اختيار التاريخ في المنصات: الفترة بتحدد أرقام الصرف والنتائج والعائد اللي بتظهر لكل إعلان.
  // التنبيهات مش بتتأثر — بتفضل دايماً على آخر ٧ أيام لأنها عن الوضع الحالي.
  // الفترة بتتحسب بتوقيت كل حساب، بنفس منطق السيرفر (api/_dates.js → resolvePeriod)
  var PERIOD_KEY = 'acc.period.v1';
  var PERIOD_LABELS = {
    today: 'النهارده', yesterday: 'أمس', last7: 'آخر ٧ أيام', last14: 'آخر ١٤ يوم', last30: 'آخر ٣٠ يوم',
    thisMonth: 'الشهر ده', lastMonth: 'الشهر اللي فات', custom: 'فترة مخصصة'
  };
  var PERIOD_MAX_DAYS = 93;
  var period = (function () {
    try {
      var p = JSON.parse(localStorage.getItem(PERIOD_KEY) || 'null');
      if (p && PERIOD_LABELS[p.preset]) return p;
    } catch (e) { /* تخزين مقفول */ }
    return { preset: 'last7' };
  })();
  function savePeriod() { try { localStorage.setItem(PERIOD_KEY, JSON.stringify(period)); } catch (e) { /* مش مهم */ } }
  function shiftKey(key, d) {
    var p = key.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2] + d)).toISOString().slice(0, 10);
  }
  function keyDiffDays(a, b) {
    var pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
  }
  function resolvePeriodFor(tz) {
    var today = todayKeyInTz(tz), since = shiftKey(today, -6), until = today, preset = period.preset;
    if (preset === 'today') since = today;
    else if (preset === 'yesterday') since = until = shiftKey(today, -1);
    else if (preset === 'last14') since = shiftKey(today, -13);
    else if (preset === 'last30') since = shiftKey(today, -29);
    else if (preset === 'thisMonth') since = today.slice(0, 8) + '01';
    else if (preset === 'lastMonth') { until = shiftKey(today.slice(0, 8) + '01', -1); since = until.slice(0, 8) + '01'; }
    else if (preset === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(period.since || '') && /^\d{4}-\d{2}-\d{2}$/.test(period.until || '')) {
      since = period.since; until = period.until;
      if (since > until) { var t = since; since = until; until = t; }
      if (until > today) until = today;
      if (since > until) since = until;
    } else preset = 'last7';
    if (keyDiffDays(since, until) > PERIOD_MAX_DAYS - 1) since = shiftKey(until, -(PERIOD_MAX_DAYS - 1));
    return { preset: preset, since: since, until: until, isDefault: preset === 'last7' };
  }
  function periodKey() { return period.preset === 'custom' ? 'custom:' + period.since + ':' + period.until : period.preset; }
  // تاريخ بشكل مقروء: "٣ سبت"
  function fmtKey(key) {
    if (!key) return '';
    var p = key.split('-').map(Number);
    return ar(p[2]) + ' ' + AR_MONTHS_SHORT[p[1] - 1];
  }
  function periodLabel() {
    if (period.preset !== 'custom') return PERIOD_LABELS[period.preset];
    return fmtKey(period.since) + ' — ' + fmtKey(period.until);
  }
  // أرقام الإعلان في الفترة المختارة — لو الفترة هي آخر ٧ أيام بتتحسب من البيانات الأسبوعية نفسها
  function periodOf(c) {
    if (c.period) return c.period;
    var sales = (c.dailySales || []).reduce(function (a, b) { return a + b; }, 0);
    return { spend: c.spend || 0, results: c.results, sales: sales, cpr: c.cpr, roas: c.roas };
  }
  function buildPeriod(spend, results, sales) {
    spend = r2(spend || 0); sales = r2(sales || 0);
    return {
      spend: spend, results: results, sales: sales,
      cpr: (results && spend > 0) ? spend / results : null,
      roas: (sales > 0 && spend > 0) ? sales / spend : null
    };
  }

  // ---------- التحميل: نسخة محفوظة + حالة واضحة ----------
  // آخر تحميل لكل حساب بيتحفظ في الذاكرة، فلما ترجع لحساب فتحته قبل كده بيظهر فوراً
  // وبيتحدّث في الخلفية بدل ما تقعد مستني قدام شاشة فاضية.
  // المفتاح فيه الفترة كمان — عشان نسخة "آخر ٣٠ يوم" متظهرش مكان "أمس"
  var sourceCache = {};
  function cacheSource(source, ads) { sourceCache[source + '|' + periodKey()] = ads.slice(); }
  function showCachedWhileLoading(source) {
    var cached = sourceCache[source + '|' + periodKey()];
    if (!cached || !cached.length) return false;
    mergeCandidates(cached, source);
    render();
    return true;
  }

  var loadingPlatforms = {};
  function anyLoading() { return Object.keys(loadingPlatforms).some(function (p) { return loadingPlatforms[p]; }); }
  function setLoading(platform, on, text) {
    loadingPlatforms[platform] = !!on;
    document.body.classList.toggle('is-loading', anyLoading());
    if (text) connectStatus.textContent = text;
    // شاشة الانتظار بتظهر بس لما مفيش أي إعلانات معروضة — لو فيه بيانات قديمة بتفضل ظاهرة وهي بتتحدّث
    if (on && !candidates.length) showSkeletons();
  }
  function showSkeletons() {
    var one = '<div class="skeleton-card"><div class="sk sk-img"></div><div class="sk sk-line"></div><div class="sk sk-line short"></div><div class="sk sk-chips"></div></div>';
    var html = '';
    for (var i = 0; i < 6; i++) html += one;
    cardGrid.innerHTML = html;
    galleryCount.textContent = 'جارٍ التحميل…';
  }
  function connectedText(notes) {
    return 'متصل — ' + ar(candidates.length) + ' إعلان محمّل إجمالاً عبر كل المنصات المتصلة.' +
      (notes && notes.length ? ' (' + notes.join('؛ ') + ')' : '');
  }

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
    var token = beginLoad('google');
    showCachedWhileLoading('google:' + customerId);
    setLoading('google', true, 'جارٍ تحميل إعلانات Google Ads…');
    fetch('/api/google-ads-fetch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: googleAccessToken, customerId: customerId,
        loginCustomerId: info.loginCustomerId, timeZone: info.timeZone, clientTz: BROWSER_TZ, period: period
      })
    }).then(function (r) { return r.json(); }).then(function (payload) {
      if (!isCurrentLoad('google', token)) return; // المستخدم بدّل لحساب تاني قبل ما الرد ده يوصل
      if (!payload || payload.error) {
        setLoading('google', false, 'تعذّر تحميل إعلانات Google Ads (' + (payload && payload.error ? payload.error : 'رد غير متوقع من الخادم') + ').');
        return;
      }
      if (!payload.ads || !payload.ads.length) {
        setLoading('google', false, 'الاتصال نجح لكن مفيش إعلانات (غير محذوفة) في هذا الحساب.');
        return;
      }
      var googleCandidates = transformGoogleRows(payload.ads, payload.metrics || [], daysFromRange(payload.range), info.currency, payload.periodMetrics);
      mergeCandidates(googleCandidates, 'google:' + customerId);
      cacheSource('google:' + customerId, googleCandidates);
      selectedIds = {};
      setLoading('google', false, connectedText());
      render();
    }).catch(function (err) {
      if (!isCurrentLoad('google', token)) return;
      setLoading('google', false, 'تعذّر تحميل إعلانات Google Ads (' + err.message + ').');
    });
  }

  function ggPick(obj, path) {
    return path.split('.').reduce(function (o, k) { return (o && o[k] != null) ? o[k] : undefined; }, obj);
  }

  // حالة التشغيل الفعلية لإعلان Google: الحالة (status) بتقول بس هل حد وقفه يدوياً،
  // لكن primary_status بيقول هل هو شغّال فعلاً — الحملة ممكن تكون ENABLED ومدتها خلصت أو غير مؤهلة
  // Google بترجّع primary_status = حالة التشغيل الفعلية، و primary_status_reasons = السبب بالظبط
  // (الحملة متوقفة، المجموعة متوقفة، مدة الحملة خلصت، الإعلان مرفوض...). بنترجم كلامها هي،
  // ومنستنتجش من الحالة اليدوية (status) غير لما الحقول دي متكونش موجودة
  var GOOGLE_REASON_LEVEL = {
    CAMPAIGN_REMOVED: 'campaign', CAMPAIGN_PAUSED: 'campaign', CAMPAIGN_PENDING: 'scheduled', CAMPAIGN_ENDED: 'ended',
    AD_GROUP_PAUSED: 'adset', AD_GROUP_REMOVED: 'adset',
    AD_REMOVED: 'ad', AD_PAUSED: 'ad',
    AD_DISAPPROVED: 'rejected', AD_UNDER_REVIEW: 'pending', AD_UNDER_APPEAL: 'pending',
    AD_LIMITED_BY_POLICY: 'not-eligible', AD_APPROVED_LABELED: 'not-eligible', AD_AREA_OF_INTEREST_ONLY: 'not-eligible',
    AD_GROUP_AD_NOT_ELIGIBLE: 'not-eligible'
  };
  var GOOGLE_PRIMARY_LEVEL = {
    ELIGIBLE: null, LIMITED: null,               // شغّال (مع ملاحظة في حالة LIMITED)
    PAUSED: 'ad', REMOVED: 'ad', ENDED: 'ended', PENDING: 'pending', NOT_ELIGIBLE: 'not-eligible'
  };
  function googleDelivery(row, adStatus, agStatus, campStatus, approval) {
    var off = function (level, reason) { return { active: false, level: level, reason: reason || null }; };
    var primary = ggPick(row, 'adGroupAd.primaryStatus');
    var reasons = ggPick(row, 'adGroupAd.primaryStatusReasons') || [];

    if (primary) {
      var level = GOOGLE_PRIMARY_LEVEL[primary];
      if (level === null) return { active: true, level: null, reason: null }; // ELIGIBLE / LIMITED
      // السبب الأول اللي نعرفه بيحدد المستوى بدقة أكتر من الحالة العامة
      for (var i = 0; i < reasons.length; i++) {
        if (GOOGLE_REASON_LEVEL[reasons[i]]) return off(GOOGLE_REASON_LEVEL[reasons[i]], reasons.join(', '));
      }
      return off(level || 'ad', reasons.join(', ') || primary);
    }

    // احتياطي: الحقول الجديدة مش موجودة، فبنرجع للحالة اليدوية بس
    if (campStatus && campStatus !== 'ENABLED') return off('campaign');
    if (agStatus && agStatus !== 'ENABLED') return off('adset');
    if (approval === 'DISAPPROVED') return off('rejected');
    if (adStatus !== 'ENABLED') return off('ad');
    return { active: true, level: null, reason: null };
  }

  // adRows: كل الإعلانات بحالتها (من غير تاريخ) — metricRows: صف لكل إعلان × يوم فيه نشاط
  // المفتاح adGroupId-adId لأن نفس الإعلان ممكن يتكرر في أكتر من مجموعة إعلانية
  function transformGoogleRows(adRows, metricRows, days, currency, periodRows) {
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
    // مجاميع الفترة المختارة (لو مش آخر ٧ أيام) — صف واحد لكل إعلان، ممكن يتكرر لو فيه أكتر من صفحة
    var periodByKey = null;
    if (Array.isArray(periodRows)) {
      periodByKey = {};
      periodRows.forEach(function (row) {
        var k = ggPick(row, 'adGroup.id') + '-' + ggPick(row, 'adGroupAd.ad.id');
        var m = row.metrics || {};
        var acc = periodByKey[k] || (periodByKey[k] = { spend: 0, results: 0, sales: 0 });
        acc.spend += parseInt(m.costMicros || 0, 10) / 1000000;
        acc.results += parseFloat(m.conversions || 0);
        acc.sales += parseFloat(m.conversionsValue || 0);
      });
    }
    return adRows.map(function (row) {
      var ad = ggPick(row, 'adGroupAd.ad') || {};
      var key = ggPick(row, 'adGroup.id') + '-' + ad.id;
      var id = 'g-' + key;
      var pRow = periodByKey && (periodByKey[key] || { spend: 0, results: 0, sales: 0 });
      var headline = (ggPick(ad, 'responsiveSearchAd.headlines.0.text')) ||
        (ggPick(ad, 'expandedTextAd.headlinePart1')) || ad.name || ('إعلان Google #' + ad.id);
      var desc = (ggPick(ad, 'responsiveSearchAd.descriptions.0.text')) ||
        (ggPick(ad, 'expandedTextAd.description')) || '';
      var adStatus = ggPick(row, 'adGroupAd.status'), agStatus = ggPick(row, 'adGroup.status'), campStatus = ggPick(row, 'campaign.status');
      var approval = ggPick(row, 'adGroupAd.policySummary.approvalStatus');
      var delivery = googleDelivery(row, adStatus, agStatus, campStatus, approval);
      var perDay = byDate[key] || {};
      var daily = [], dailyResults = [], dailySales = [];
      // تحويلات Google ممكن تكون كسور (٠٫٥ تحويلة مثلاً) — بنجمع القيم الأصلية ونقرّب الإجمالي بس،
      // عشان أيام فيها كسور صغيرة ماتتحسبش صفر
      var rawResults = 0;
      days.forEach(function (day) {
        var r = perDay[day.key];
        daily.push(r ? r.spend : 0);
        rawResults += r ? r.results : 0;
        dailyResults.push(r ? Math.round(r.results) : 0);
        dailySales.push(r ? r.sales : 0);
      });
      var spend = daily.reduce(function (a, b) { return a + b; }, 0);
      var totalResults = Math.round(rawResults);
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
        active: delivery.active,
        pausedLevel: delivery.level,
        deliveryReason: delivery.reason || null,
        platformStatus: ggPick(row, 'adGroupAd.primaryStatus') || adStatus || null,
        period: pRow ? buildPeriod(pRow.spend, Math.round(pRow.results), pRow.sales) : null,
        _resourceName: row.adGroupAd && row.adGroupAd.resourceName,
        fail: false
      };
    });
  }

  var META_ACCOUNT_FIELDS = 'id,name,account_status,timezone_name,currency,spend_cap,amount_spent';

  // بيحمّل *كل* الحسابات الإعلانية مش أول صفحة بس (Meta بترجّع ٢٥ حساب في الصفحة افتراضياً)
  function loadAdAccounts(onlyRefreshId) {
    connectStatus.textContent = 'جارٍ تحميل الحسابات الإعلانية…';
    fetchAllPages('/me/adaccounts', { fields: META_ACCOUNT_FIELDS, limit: 100 }, FULL_SCAN_CAP, function (err, data) {
      if (err) {
        connectStatus.textContent = 'تعذّر تحميل الحسابات — تأكد إن حسابك عنده صلاحية على حساب إعلاني واحد على الأقل.';
        return;
      }
      if (!data || !data.length) {
        connectStatus.textContent = 'مفيش حسابات إعلانية مرتبطة بحسابك.';
        return;
      }
      data.forEach(function (a) {
        accountInfo['meta:' + a.id] = {
          timeZone: a.timezone_name || null, currency: a.currency || null,
          accountStatus: a.account_status, spendCap: a.spend_cap || null, amountSpent: a.amount_spent || null
        };
      });
      setPlatformOptions('meta', data.map(function (a) { return { value: a.id, label: 'Meta — ' + a.name }; }));
      document.getElementById('tConnectTitle').textContent = 'متصل بحساب Meta — دوس تسجيل الدخول لإضافة منصة تانية';
      // بعد استرجاع الجلسة بنحدّث بيانات الحساب (حالته وحد الصرف) الأول، وبعدين نحمّل نفس الحساب المحفوظ
      var target = (onlyRefreshId && accountInfo['meta:' + onlyRefreshId]) ? onlyRefreshId : data[0].id;
      accountSelect.value = target;
      loadAdsForAccount(target);
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

  // ---------- حماية تدفّق تسجيل الدخول (state) ----------
  // قيمة state كانت ثابتة ("snapchat_auth")، يعني أي حد يقدر يبعتلك رابط رجوع بكود بتاعه
  // ومتصفحك يكمّل تسجيل الدخول بيه من غير ما تحس (CSRF على OAuth). دلوقتي القيمة عشوائية
  // لكل محاولة، متخزّنة في نفس التاب، وبتتأكد وقت الرجوع ومتستخدمش تاني
  var OAUTH_STATE_KEY = 'pauseproof.oauthState';
  function randomHex(bytes) {
    try {
      var a = new Uint8Array(bytes);
      window.crypto.getRandomValues(a);
      return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    } catch (e) { return String(Date.now()) + String(Math.random()).slice(2); }
  }
  function newOauthState(platform) {
    var state = platform + '.' + randomHex(16);
    try { sessionStorage.setItem(OAUTH_STATE_KEY, state); }
    catch (e) { return platform + '.nostore'; } // التخزين مقفول — بنكتفي بالتأكد من اسم المنصة
    return state;
  }
  function consumeOauthState(platform, received) {
    if (!received || received.indexOf(platform + '.') !== 0) return false;
    var saved = null;
    try { saved = sessionStorage.getItem(OAUTH_STATE_KEY); sessionStorage.removeItem(OAUTH_STATE_KEY); } catch (e) { /* مقفول */ }
    if (received === platform + '.nostore') return true;
    return received === saved;
  }
  // رسالة خطأ راجعة من المنصة نفسها في الرابط (مثلاً المستخدم رفض الصلاحيات)
  function oauthErrorFromUrl(params) {
    var err = params.get('error') || params.get('error_code');
    if (!err) return null;
    return params.get('error_description') || params.get('error_message') || err;
  }

  // ---------- Snapchat: تدفّق إعادة توجيه كامل الصفحة (مش نافذة منبثقة زي Meta/Google) ----------
  // !!! هام: عدّل بالـ Client ID بتاعك من Snap Business Manager !!!
  var SNAPCHAT_CLIENT_ID = "00315198-57f5-4c42-98f0-c0396d0053f5"
  var snapchatAccessToken = null;

  function loginWithSnapchat() {
    platformOverlay.classList.add('hidden');
    var redirectUri = window.location.origin + window.location.pathname;
    var authUrl = 'https://accounts.snapchat.com/login/oauth2/authorize' +
      '?client_id=' + encodeURIComponent(SNAPCHAT_CLIENT_ID) +
      '&redirect_uri=' + encodeURIComponent(redirectUri) +
      '&response_type=code&scope=snapchat-marketing-api&state=' + encodeURIComponent(newOauthState('snapchat'));
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
    var token = beginLoad('snapchat');
    showCachedWhileLoading('snapchat:' + adAccountId);
    setLoading('snapchat', true, 'جارٍ تحميل إعلانات Snapchat…');
    fetch('/api/snapchat-ads-fetch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: snapchatAccessToken, action: 'ads', adAccountId: adAccountId, clientTz: BROWSER_TZ, period: period })
    }).then(function (r) { return r.json(); }).then(function (payload) {
      if (!isCurrentLoad('snapchat', token)) return; // المستخدم بدّل لحساب تاني قبل ما الرد ده يوصل
      if (!payload || payload.error) {
        setLoading('snapchat', false, 'تعذّر تحميل إعلانات Snapchat (' + (payload && payload.error ? payload.error : 'رد غير متوقع من الخادم') + ').');
        return;
      }
      var adsList = payload.ads || [];
      var statsList = (payload.stats && payload.stats.timeseries_stats) || [];
      if (!adsList.length) {
        setLoading('snapchat', false, 'الاتصال نجح لكن مفيش إعلانات راجعة لهذا الحساب.');
        return;
      }
      var snapCandidates = transformSnapchatAds(adsList, statsList, daysFromRange(payload.range), payload.account && payload.account.currency, payload.squads, payload.campaigns, payload.periodStats);
      mergeCandidates(snapCandidates, 'snapchat:' + adAccountId);
      cacheSource('snapchat:' + adAccountId, snapCandidates);
      selectedIds = {};
      setLoading('snapchat', false, connectedText(payload.statsError ? ['تعذّر تحميل الإنفاق: ' + payload.statsError] : []));
      render();
    }).catch(function (err) {
      if (!isCurrentLoad('snapchat', token)) return;
      setLoading('snapchat', false, 'تعذّر تحميل إعلانات Snapchat (' + err.message + ').');
    });
  }

  // حالة التشغيل الفعلية لإعلان Snapchat: الإعلان نفسه + المجموعة (Ad Squad) + الحملة، ومواعيد البداية والنهاية
  function snapchatDelivery(ad, squadsById, campaignsById) {
    var off = function (level) { return { active: false, level: level }; };
    var now = Date.now();
    var time = function (s) { var t = s ? Date.parse(s) : NaN; return isNaN(t) ? null : t; };
    var squad = squadsById[ad.ad_squad_id] || null;
    var campaign = squad ? campaignsById[squad.campaign_id] || null : null;
    if (/REJECT|DENY/i.test(ad.review_status || '')) return off('rejected');
    if (campaign && campaign.status && campaign.status !== 'ACTIVE') return off('campaign');
    if (squad && squad.status && squad.status !== 'ACTIVE') return off('adset');
    var ends = [campaign && time(campaign.end_time), squad && time(squad.end_time)];
    if (ends.some(function (t) { return t && t < now; })) return off('ended');
    var starts = [campaign && time(campaign.start_time), squad && time(squad.start_time)];
    if (starts.some(function (t) { return t && t > now; })) return off('scheduled');
    if (/PENDING/i.test(ad.review_status || '')) return off('pending'); // ممكن ترجع PENDING أو PENDING_REVIEW
    if (ad.status !== 'ACTIVE') return off('ad');
    return { active: true, level: null };
  }

  function transformSnapchatAds(adsList, statsList, days, currency, squads, campaigns, periodStats) {
    var squadsById = {}, campaignsById = {};
    (squads || []).forEach(function (s) { squadsById[s.id] = s; });
    (campaigns || []).forEach(function (c) { campaignsById[c.id] = c; });
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
    // مجاميع الفترة المختارة (granularity=TOTAL) — رقم واحد لكل إعلان جوه breakdown_stats.ad
    var periodByAd = null;
    if (periodStats) {
      periodByAd = {};
      (periodStats.total_stats || periodStats.timeseries_stats || []).forEach(function (entry) {
        var ts = entry.total_stat || entry.timeseries_stat || entry;
        ((ts.breakdown_stats && ts.breakdown_stats.ad) || []).forEach(function (b) {
          var st = b.stats || {};
          periodByAd[b.id] = {
            spend: parseFloat(st.spend || 0) / 1000000,
            results: tracksPurchases ? parseFloat(st.conversion_purchases || 0) : parseFloat(st.swipes || 0),
            sales: tracksPurchases ? parseFloat(st.conversion_purchases_value || 0) / 1000000 : 0
          };
        });
      });
    }
    return parsed.map(function (p) {
      var ad = p.ad;
      var delivery = snapchatDelivery(ad, squadsById, campaignsById);
      var pRow = periodByAd && (periodByAd[ad.id] || { spend: 0, results: 0, sales: 0 });
      var id = 's-' + ad.id;
      var dailyResults = tracksPurchases ? p.purchases : p.swipes;
      var dailySales = tracksPurchases ? p.sales : p.daily.map(function () { return 0; });
      var spend = r2(p.daily.reduce(function (a, b) { return a + b; }, 0));
      var results = dailyResults.reduce(function (a, b) { return a + b; }, 0);
      var totalSales = dailySales.reduce(function (a, b) { return a + b; }, 0);
      return {
        id: id, platform: 'Snapchat', placement: 'Discover', currency: currency || null,
        reviewStatus: /REJECT|DENY/i.test(ad.review_status || '') ? 'disapproved' : null,
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
        active: delivery.active, pausedLevel: delivery.level,
        deliveryReason: null, platformStatus: ad.status || null,
        period: pRow ? buildPeriod(pRow.spend, Math.round(pRow.results), pRow.sales) : null,
        fail: false
      };
    });
  }

  // لو رجعنا من Snapchat بـ ?code=... في الرابط، كمّل تسجيل الدخول تلقائياً
  (function checkSnapchatRedirect() {
    var params = new URLSearchParams(window.location.search);
    var code = params.get('code');
    var state = params.get('state') || '';
    if (state.indexOf('snapchat') !== 0) return;
    window.history.replaceState({}, document.title, window.location.pathname);
    var oauthError = oauthErrorFromUrl(params);
    if (oauthError) { connectStatus.textContent = 'Snapchat رفض تسجيل الدخول (' + oauthError + ').'; return; }
    if (!code) return;
    if (!consumeOauthState('snapchat', state)) {
      connectStatus.textContent = 'تعذّر إتمام تسجيل الدخول بحساب Snapchat — رابط الرجوع مش مطابق للجلسة. ابدأ تسجيل الدخول من الأول.';
      return;
    }
    exchangeSnapchatCode(code);
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
      '&state=' + encodeURIComponent(newOauthState('tiktok')) +
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
        connectStatus.textContent = 'تعذّر إتمام تسجيل الدخول بحساب TikTok (' + ((data && (data.error || data.message)) || 'خطأ غير معروف') + ').';
      }
    }).catch(function (err) {
      connectStatus.textContent = 'تعذّر الاتصال بالخادم الخلفي لـ TikTok (' + err.message + ').';
    });
  }

  function loadTikTokAdsForAdvertiser(advertiserId) {
    var token = beginLoad('tiktok');
    showCachedWhileLoading('tiktok:' + advertiserId);
    setLoading('tiktok', true, 'جارٍ تحميل إعلانات TikTok…');
    fetch('/api/tiktok-ads-fetch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: tiktokAccessToken, advertiserId: advertiserId, clientTz: BROWSER_TZ, period: period })
    }).then(function (r) { return r.json(); }).then(function (payload) {
      if (!isCurrentLoad('tiktok', token)) return; // المستخدم بدّل لحساب تاني قبل ما الرد ده يوصل
      if (!payload || payload.error) {
        setLoading('tiktok', false, 'تعذّر تحميل إعلانات TikTok (' + (payload && payload.error ? payload.error : 'رد غير متوقع من الخادم') + ').');
        return;
      }
      var adsList = payload.ads || [];
      if (!adsList.length) {
        setLoading('tiktok', false, 'الاتصال نجح لكن مفيش إعلانات راجعة لهذا الحساب (تأكد من مستوى موافقة التطبيق).');
        return;
      }
      // اسم الحساب الحقيقي بدل الرقم لو رجع
      if (payload.advertiser && payload.advertiser.name) {
        Array.prototype.slice.call(accountSelect.options).forEach(function (o) {
          if (o.dataset.platform === 'tiktok' && o.value === String(advertiserId)) o.textContent = 'TikTok Ads — ' + payload.advertiser.name;
        });
      }
      var tiktokCandidates = transformTikTokAds(adsList, payload.report || [], daysFromRange(payload.range), payload.advertiser && payload.advertiser.currency, payload.periodReport);
      mergeCandidates(tiktokCandidates, 'tiktok:' + advertiserId);
      cacheSource('tiktok:' + advertiserId, tiktokCandidates);
      selectedIds = {};
      setLoading('tiktok', false, connectedText(payload.reportError ? ['تعذّر تحميل الإنفاق: ' + payload.reportError] : []));
      render();
    }).catch(function (err) {
      if (!isCurrentLoad('tiktok', token)) return;
      setLoading('tiktok', false, 'تعذّر تحميل إعلانات TikTok (' + err.message + ').');
    });
  }

  // TikTok بترجّع الأوقات بصيغة "YYYY-MM-DD HH:MM:SS" بتوقيت UTC — نحوّلها لصيغة ISO عشان كل المتصفحات تفهمها
  function tiktokTime(s) { return s ? String(s).replace(' ', 'T') + 'Z' : null; }

  // حالة التشغيل الفعلية لإعلان TikTok من secondary_status (لو رجع)، وإلا من operation_status بتاع الإعلان نفسه
  function tiktokDelivery(ad) {
    var off = function (level) { return { active: false, level: level }; };
    var s = String(ad.secondary_status || '');
    if (ad.operation_status !== 'ENABLE') return off('ad');
    if (!s) return { active: true, level: null };
    if (/CAMPAIGN/.test(s) && /DISABLE|DELETE/.test(s)) return off('campaign');
    if (/ADGROUP/.test(s) && /DISABLE|DELETE/.test(s)) return off('adset');
    if (/TIME_DONE|END/.test(s)) return off('ended');
    if (/NOT_START/.test(s)) return off('scheduled');
    if (/AUDIT_DENY|REJECT/.test(s)) return off('rejected');
    if (/AUDIT/.test(s)) return off('pending');
    if (/BALANCE|BUDGET_EXCEED/.test(s)) return off('account-cap');
    if (/DELIVERY_OK|LEARN/.test(s)) return { active: true, level: null };
    return off('not-eligible');
  }

  function transformTikTokAds(adsList, reportList, days, currency, periodReport) {
    var statsByAd = {};
    reportList.forEach(function (row) {
      var dims = row.dimensions || {};
      if (!dims.ad_id) return;
      if (!statsByAd[dims.ad_id]) statsByAd[dims.ad_id] = {};
      statsByAd[dims.ad_id][(dims.stat_time_day || '').slice(0, 10)] = row.metrics || {};
    });
    // مجاميع الفترة المختارة — تقرير من غير تقسيم بالأيام، صف لكل إعلان
    var periodByAd = null;
    if (Array.isArray(periodReport)) {
      periodByAd = {};
      periodReport.forEach(function (row) {
        var id = row.dimensions && row.dimensions.ad_id;
        if (!id) return;
        var m = row.metrics || {};
        periodByAd[id] = { spend: parseFloat(m.spend || 0), results: parseFloat(m.conversion || 0), sales: 0 };
      });
    }
    return adsList.map(function (ad) {
      var id = 't-' + ad.ad_id;
      var delivery = tiktokDelivery(ad);
      var pRow = periodByAd && (periodByAd[ad.ad_id] || { spend: 0, results: 0, sales: 0 });
      var byDay = statsByAd[ad.ad_id] || {};
      var daily = [], dailyResults = [], rawResults = 0;
      days.forEach(function (day) {
        var m = byDay[day.key];
        daily.push(m ? r2(parseFloat(m.spend || 0)) : 0);
        rawResults += m ? (parseFloat(m.conversion) || 0) : 0;
        dailyResults.push(m ? Math.round(parseFloat(m.conversion || 0)) : 0);
      });
      var spend = daily.reduce(function (a, b) { return a + b; }, 0);
      var results = Math.round(rawResults);
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
        active: delivery.active, pausedLevel: delivery.level,
        deliveryReason: null, platformStatus: ad.secondary_status || ad.operation_status || null,
        period: pRow ? buildPeriod(pRow.spend, Math.round(pRow.results), pRow.sales) : null,
        fail: false
      };
    });
  }

  (function checkTikTokRedirect() {
    var params = new URLSearchParams(window.location.search);
    var authCode = params.get('auth_code') || params.get('code');
    var state = params.get('state') || '';
    if (state.indexOf('tiktok') !== 0) return;
    window.history.replaceState({}, document.title, window.location.pathname);
    var oauthError = oauthErrorFromUrl(params);
    if (oauthError) { connectStatus.textContent = 'TikTok رفض تسجيل الدخول (' + oauthError + ').'; return; }
    if (!authCode) return;
    if (!consumeOauthState('tiktok', state)) {
      connectStatus.textContent = 'تعذّر إتمام تسجيل الدخول بحساب TikTok — رابط الرجوع مش مطابق للجلسة. ابدأ تسجيل الدخول من الأول.';
      return;
    }
    exchangeTikTokCode(authCode);
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
    // بنجيب كمان مواعيد البداية والنهاية: المجموعة أو الحملة ممكن تكون "نشطة" في الحالة لكن مدتها خلصت
    // (أو لسه مبدأتش)، فالإعلان مش بيظهر للناس مع إن حالته نشط
    var build = function (data) {
      var map = {};
      (data || []).forEach(function (as) {
        var camp = as.campaign || {};
        map[as.id] = {
          adsetStatus: as.effective_status || null,
          adsetStart: as.start_time || null,
          adsetEnd: as.end_time || null,
          adsetLifetime: as.lifetime_budget || null,
          adsetRemaining: as.budget_remaining != null ? as.budget_remaining : null,
          campaignStatus: camp.effective_status || null,
          campaignStart: camp.start_time || null,
          campaignStop: camp.stop_time || null
        };
      });
      return map;
    };
    fetchAllPages('/' + accountId + '/adsets', {
      fields: 'id,effective_status,start_time,end_time,lifetime_budget,budget_remaining,campaign{effective_status,start_time,stop_time}',
      limit: 200
    }, FULL_SCAN_CAP, function (err, data) {
      if (!err) { onDone(build(data)); return; }
      fetchAllPages('/' + accountId + '/adsets', { fields: 'id,effective_status,campaign{effective_status}', limit: 200 }, FULL_SCAN_CAP, function (err2, data2) {
        onDone(build(data2));
      });
    });
  }

  // ---------- تحميل إعلانات Meta ----------
  // الطلبات الأربعة (الإعلانات، حالة المجموعات، الإنفاق اليومي، تكرار الظهور) مالهمش علاقة ببعض،
  // فبتتبعت كلها مرة واحدة بالتوازي بدل ما تستنى بعضها بالدور — ده أكبر سبب في بطء التحميل.
  // وأول ما الإعلانات وحالتها يوصلوا بنعرض الكروت على طول، وأرقام الإنفاق بتتملي لما توصل.
  function fbPagesPromise(path, params, cap) {
    return new Promise(function (resolve) {
      fetchAllPages(path, params, cap, function (err, data, truncated) { resolve({ err: err, data: data || [], truncated: truncated }); });
    });
  }

  function loadAdsForAccount(accountId) {
    var info = accountInfo['meta:' + accountId] || {};
    var token = beginLoad('meta');
    var source = 'meta:' + accountId;
    // آخر 7 أيام *شاملة النهارده* بتوقيت الحساب — last_7d بتاع Meta بينتهي امبارح،
    // فكان يوم النهارده دايماً صفر وأقدم يوم بيضيع من الجدول
    var days = last7Days(todayKeyInTz(info.timeZone || BROWSER_TZ));
    var timeRange = JSON.stringify({ since: days[0].key, until: days[days.length - 1].key });
    var live = function () { return isCurrentLoad('meta', token); };

    showCachedWhileLoading(source, 'Meta');
    setLoading('meta', true, 'جارٍ تحميل إعلانات Meta…');

    var adsP = new Promise(function (resolve) {
      fetchMetaAds(accountId, function (err, data, truncated) { resolve({ err: err, data: data || [], truncated: truncated }); });
    });
    var adsetsP = new Promise(function (resolve) { loadAdsetStatusMap(accountId, resolve); });
    var dailyP = fbPagesPromise('/' + accountId + '/insights', {
      level: 'ad', time_increment: 1, time_range: timeRange,
      fields: 'ad_id,date_start,spend,actions,action_values', limit: 500
    }, FULL_SCAN_CAP);
    // تكرار الظهور لازم يتحسب على الأسبوع كله مرة واحدة — مينفعش نجمعه من أرقام يومية،
    // لأن نفس الشخص ممكن يتكرر في أكتر من يوم. فشل الطلب ده مش بيوقف التحميل
    var reachP = fbPagesPromise('/' + accountId + '/insights', {
      level: 'ad', time_range: timeRange, fields: 'ad_id,frequency,reach,impressions', limit: 500
    }, FULL_SCAN_CAP);
    // مجاميع الفترة المختارة (صف واحد لكل إعلان) — بيتبعت بالتوازي مع الباقي، ومش محتاج لو الفترة آخر ٧ أيام
    var pr = resolvePeriodFor(info.timeZone || BROWSER_TZ);
    var periodP = pr.isDefault ? Promise.resolve(null) : fbPagesPromise('/' + accountId + '/insights', {
      level: 'ad', time_range: JSON.stringify({ since: pr.since, until: pr.until }),
      fields: 'ad_id,spend,actions,action_values', limit: 500
    }, FULL_SCAN_CAP);

    var order = [], adsById = {}, adsTruncated = false;
    var build = function (insightsByAd, reachByAd, adsetStatusMap, periodByAd) {
      return order.map(function (id) {
        return transformRealAd(adsById[id], (insightsByAd && insightsByAd[id]) || [], adsetStatusMap, days,
          reachByAd && reachByAd[id], info.currency || null, accountInfo[source], periodByAd ? (periodByAd[id] || {}) : null);
      });
    };
    var byAdId = function (rows, multi) {
      var map = {};
      (rows || []).forEach(function (row) {
        if (!multi) { map[row.ad_id] = row; return; }
        (map[row.ad_id] = map[row.ad_id] || []).push(row);
      });
      return map;
    };

    // المرحلة الأولى: الإعلانات + حالتها → الكروت تظهر بسرعة (من غير أرقام لسه)
    var stage1 = Promise.all([adsP, adsetsP]).then(function (r) {
      if (!live()) return null;
      var ads = r[0], adsetStatusMap = r[1];
      if (ads.err) { setLoading('meta', false, 'تعذّر تحميل إعلانات Meta (' + ads.err.message + ').'); return null; }
      adsTruncated = ads.truncated;
      ads.data.forEach(function (ad) { adsById[ad.id] = ad; order.push(ad.id); });
      if (!order.length) { setLoading('meta', false, 'الاتصال نجح لكن مفيش إعلانات في الحساب ده.'); return null; }
      mergeCandidates(build(null, null, adsetStatusMap), source);
      selectedIds = {};
      render();
      setLoading('meta', true, 'ظهرت ' + ar(order.length) + ' إعلان — جارٍ تحميل أرقام الإنفاق…');
      // الصور الأصلية بتتحمّل بالتوازي، وأول ما توصل بنحدّث الكروت
      resolveMetaImages(accountId, ads.data, function () {
        if (!live()) return;
        var changed = false;
        candidates.forEach(function (c) {
          var ad = c.platform === 'Meta' && adsById[c.id];
          if (ad && ad._fullImage && c.thumbUrl !== ad._fullImage) { c.thumbUrl = ad._fullImage; changed = true; }
        });
        if (changed) render();
      });
      return adsetStatusMap;
    });

    // المرحلة التانية: أرقام الإنفاق والنتائج والتكرار
    Promise.all([stage1, dailyP, reachP, periodP]).then(function (r) {
      var adsetStatusMap = r[0], daily = r[1], reach = r[2], periodRes = r[3];
      if (!live() || !adsetStatusMap) return;
      var periodByAd = (periodRes && !periodRes.err) ? byAdId(periodRes.data) : null;
      mergeCandidates(build(byAdId(daily.data, true), byAdId(reach.data), adsetStatusMap, periodByAd), source);
      cacheSource(source, candidates.filter(function (c) { return c.source === source; }));
      var notes = [];
      if (periodRes && periodRes.err) notes.push('تعذّر تحميل أرقام الفترة المختارة — المعروض آخر ٧ أيام');
      if (adsTruncated) notes.push('تم عرض أول ' + ar(PAGE_SAFETY_CAP) + ' إعلان بس — قولّي لو محتاج نرفع الحد');
      if (daily.err) notes.push('تعذّر تحميل الإنفاق اليومي: ' + daily.err.message);
      else if (daily.truncated) notes.push('بيانات الإنفاق اتقطعت عند ' + ar(FULL_SCAN_CAP) + ' صف — بعض الأرقام ممكن تكون ناقصة');
      setLoading('meta', false, connectedText(notes));
      render();
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

  // ---------- صور إعلانات Meta بجودتها الأصلية ----------
  // thumbnail_url الافتراضي صورة مصغّرة ٦٤×٦٤ بتبان مشوشة لما تتكبّر. بدل ما نعتمد عليها بنسحب ملف الصورة نفسه
  // (زي ما بنعمل مع الفيديو)، بالترتيب ده:
  //   1) image_hash → مكتبة صور الحساب (/act_x/adimages) — الملف الأصلي اللي اترفع بالظبط، وكفاية صلاحية ads_read
  //   2) إعلان مبني على بوست موجود → full_picture بتاع البوست (محتاج صلاحية على الصفحة، ولو فشل بنكمّل)
  //   3) احتياطي: image_url / صورة الرابط / غلاف الفيديو / صورة مصغّرة بحجم ١٠٨٠
  // الحقول دي بنطلبها على مراحل: لو Meta رفضت حقل منها، بنرجع لطلب أبسط بدل ما الإعلانات كلها متحمّلش
  // المجموعة والحملة بحالتهم ومواعيدهم متسحبين مع كل إعلان — أدق من الخريطة المنفصلة لوحدها،
  // والخريطة بتفضل احتياطي لو الحقول دي اترفضت
  // issues_info = سبب عدم الظهور بكلام Meta نفسها (ميزانية خلصت، مشكلة دفع، تحت المراجعة...)
  var META_ISSUES = 'issues_info{error_code,error_summary,error_message,level}';
  var META_AD_FIELDS = 'id,name,effective_status,created_time,updated_time,' + META_ISSUES + ',' +
    'adset{id,name,optimization_goal,effective_status,start_time,end_time,lifetime_budget,budget_remaining,' + META_ISSUES + '},' +
    'campaign{id,effective_status,start_time,stop_time,' + META_ISSUES + '},';
  var META_AD_FIELDS_BASIC = 'id,name,effective_status,created_time,updated_time,adset{id,name,optimization_goal},';
  var META_CREATIVE_FULL = '{title,body,image_url,image_hash,thumbnail_url,video_id,effective_object_story_id,product_set_id,' +
    'asset_feed_spec{images{hash,url}},' +
    'object_story_spec{link_data{link,picture,image_hash,call_to_action,child_attachments{image_hash,picture}},video_data{call_to_action,image_url,image_hash}}}';
  var META_CREATIVE_BASIC = '{title,body,image_url,thumbnail_url,video_id,' +
    'object_story_spec{link_data{link,picture,call_to_action},video_data{call_to_action,image_url}}}';
  function fetchMetaAds(accountId, onDone) {
    var attempts = [
      META_AD_FIELDS + 'creative.thumbnail_width(1080).thumbnail_height(1080)' + META_CREATIVE_FULL,
      META_AD_FIELDS + 'creative' + META_CREATIVE_FULL,
      META_AD_FIELDS_BASIC + 'creative' + META_CREATIVE_BASIC
    ];
    (function tryNext(i) {
      fetchAllPages('/' + accountId + '/ads', { fields: attempts[i], limit: 100 }, PAGE_SAFETY_CAP, function (err, adsData, truncated) {
        if (err && i < attempts.length - 1) { tryNext(i + 1); return; }
        onDone(err, adsData, truncated);
      });
    })(0);
  }

  // الـ hash بتاع الصورة الرئيسية للإعلان (أو أول كارت في الإعلان الدوّار)
  function metaImageHash(creative) {
    var spec = creative.object_story_spec || {};
    var link = spec.link_data || {};
    var firstChild = link.child_attachments && link.child_attachments[0];
    var feedImage = creative.asset_feed_spec && creative.asset_feed_spec.images && creative.asset_feed_spec.images[0];
    return creative.image_hash || link.image_hash || (firstChild && firstChild.image_hash) ||
      (spec.video_data && spec.video_data.image_hash) || (feedImage && feedImage.hash) || null;
  }

  // بتجيب روابط الصور الأصلية لكل الإعلانات دفعة واحدة، وبتحطها في ad._fullImage.
  // أي فشل هنا مش بيوقف التحميل — الإعلان بيرجع للصورة الاحتياطية
  function resolveMetaImages(accountId, ads, onDone) {
    var byHash = {}, byStory = {};
    ads.forEach(function (ad) {
      var creative = ad.creative || {};
      if (creative.video_id) return; // الفيديو ليه غلاف ومعاينة خاصة بيه
      var hash = metaImageHash(creative);
      if (hash) { (byHash[hash] = byHash[hash] || []).push(ad); return; }
      if (creative.effective_object_story_id) (byStory[creative.effective_object_story_id] = byStory[creative.effective_object_story_id] || []).push(ad);
    });
    var chunks = function (arr, n) { var out = []; for (var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
    var jobs = [];
    chunks(Object.keys(byHash), 50).forEach(function (hashes) {
      jobs.push(function (next) {
        FB.api('/' + accountId + '/adimages', { hashes: JSON.stringify(hashes), fields: 'hash,url,width,height', limit: 50 }, function (resp) {
          ((resp && resp.data) || []).forEach(function (img) {
            if (img && img.url && byHash[img.hash]) byHash[img.hash].forEach(function (ad) { ad._fullImage = img.url; });
          });
          next();
        });
      });
    });
    chunks(Object.keys(byStory), 50).forEach(function (ids) {
      jobs.push(function (next) {
        FB.api('/', { ids: ids.join(','), fields: 'full_picture' }, function (resp) {
          if (resp && !resp.error) {
            ids.forEach(function (id) {
              var post = resp[id];
              if (post && post.full_picture) byStory[id].forEach(function (ad) { ad._fullImage = post.full_picture; });
            });
          }
          next();
        });
      });
    });
    (function run(i) { if (i >= jobs.length) { onDone(); return; } jobs[i](function () { run(i + 1); }); })(0);
  }

  // أوضح صورة متاحة: الملف الأصلي ← الصورة الأصلية ← صورة الرابط ← غلاف الفيديو ← الصورة المصغّرة (١٠٨٠ لو اتطلبت)
  function metaImageUrl(ad) {
    var creative = ad.creative || {};
    var spec = creative.object_story_spec || {};
    var link = spec.link_data || {};
    var firstChild = link.child_attachments && link.child_attachments[0];
    var feedImage = creative.asset_feed_spec && creative.asset_feed_spec.images && creative.asset_feed_spec.images[0];
    return ad._fullImage || creative.image_url || link.picture || (firstChild && firstChild.picture) ||
      (feedImage && feedImage.url) || (spec.video_data && spec.video_data.image_url) || creative.thumbnail_url || null;
  }

  function transformRealAd(ad, insightRows, adsetStatusMap, days, reachRow, currency, acct, periodRow) {
    var delivery = metaDelivery(ad, adsetStatusMap, acct);
    var creative = ad.creative || {};
    var imageUrl = metaImageUrl(ad);
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
    // تحقق أخير: لو الإعلان صرف النهارده فهو بيظهر فعلاً، مهما كانت الملاحظة اللي رجعت من المنصة —
    // الصرف دليل عملي أقوى من أي وصف. الملاحظة بتفضل ظاهرة في التفاصيل
    var ISSUE_LEVELS = { issue: 1, 'ad-issue': 1, 'adset-issue': 1, 'campaign-issue': 1, budget: 1 };
    if (!delivery.active && ISSUE_LEVELS[delivery.level] && daily[6] > 0) {
      delivery = { active: true, level: null, reason: delivery.reason };
    }
    // مصدر واحد بس لقيمة المبيعات: مجموع نفس الأرقام اليومية الظاهرة في الجدول تحت —
    // عشان أي رقم إجمالي معروض يطابق دايماً تفصيله اليومي، من غير أي مصدر ثانٍ يختلف معاه
    var totalSales = dailySales.reduce(function (a, b) { return a + b; }, 0);
    var results = goal ? Math.round(totalResultsVal) : (totalResultsVal > 0 ? Math.round(totalResultsVal) : null);
    var cpr = (results && spend > 0) ? (spend / results) : null;
    var roas = (totalSales > 0 && spend > 0) ? (totalSales / spend) : null;

    // أرقام الفترة المختارة — نفس منطق النتيجة (حسب هدف الإعلان) على صف المجموع
    var periodData = null;
    if (periodRow) {
      var pFound = resultForGoal(periodRow.actions, goal);
      var pType = (pFound && pFound.type) || resultType;
      var pResults = pFound ? Math.round(pFound.value) : (goal ? 0 : null);
      var pSales = pType ? valueForType(periodRow.action_values, pType) : null;
      periodData = buildPeriod(parseFloat(periodRow.spend || 0), pResults, pSales || 0);
    }

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
      active: delivery.active,
      pausedLevel: delivery.level,
      deliveryReason: delivery.reason || null,
      platformStatus: ad.effective_status || null,
      period: periodData,
      fail: false
    };
  }

  // ---------- حالة التشغيل الفعلية لإعلان Meta ----------
  // القاعدة: منستنتجش الحالة بنفسنا. Meta نفسها بتحسب effective_status للإعلان وهي شايفة حالة
  // المجموعة والحملة، وبترجّع في issues_info السبب اللي مانع الظهور (ميزانية خلصت، مشكلة دفع،
  // جدول انتهى، مراجعة...). إحنا بنترجم كلامها بس، وبنسيب سبب المنصة كما هو عشان تقدر تراجعه.
  var META_STATUS_LEVEL = {
    ACTIVE: null, WITH_ISSUES: null, PREAPPROVED: null,          // دي حالات بتظهر فيها الإعلانات
    PAUSED: 'ad', ARCHIVED: 'ad', DELETED: 'ad',
    ADSET_PAUSED: 'adset', CAMPAIGN_PAUSED: 'campaign',
    DISAPPROVED: 'rejected', PENDING_REVIEW: 'pending', IN_PROCESS: 'pending',
    PENDING_BILLING_INFO: 'account'
  };
  // بيانات المستوى اللي جات منه المشكلة في issues_info
  var META_ISSUE_LEVEL = { AD: 'ad-issue', ADSET: 'adset-issue', CAMPAIGN: 'campaign-issue', ACCOUNT: 'account' };
  function firstIssue(entity) {
    var list = entity && entity.issues_info;
    return (list && list.length) ? list[0] : null;
  }
  function issueText(issue) {
    return (issue && (issue.error_summary || issue.error_message)) || '';
  }
  // الحالات اللي معناها إن الحساب نفسه واقف تماماً (مش مجرد ملاحظة)
  var META_ACCOUNT_BLOCKING = { 2: true, 100: true, 101: true };

  function metaDelivery(ad, adsetStatusMap, acct) {
    var adset = ad.adset || {}, campaign = ad.campaign || {};
    var st = (adset.id && adsetStatusMap && adsetStatusMap[adset.id]) || {};
    var now = Date.now();
    var time = function (s) { var t = s ? Date.parse(s) : NaN; return isNaN(t) ? null : t; };
    var off = function (level, reason) { return { active: false, level: level, reason: reason || null }; };
    var status = ad.effective_status;

    // 1) حالة Meta للإعلان — دي بتشمل أصلاً إيقاف الحملة أو المجموعة
    var mapped = META_STATUS_LEVEL[status];
    if (mapped) return off(mapped);

    // 2) الإعلان حالته "شغّال" عند Meta — نشوف هل هي نفسها بتقول فيه حاجة مانعة الظهور
    var issue = firstIssue(ad) || firstIssue(adset) || firstIssue(campaign);
    if (issue) {
      var level = META_ISSUE_LEVEL[issue.level] || 'issue';
      return off(level, issueText(issue));
    }

    // 3) إيقاف يدوي واضح على المجموعة أو الحملة (احتياطي لو حالة الإعلان جات ناقصة)
    var hardPaused = { PAUSED: true, ARCHIVED: true, DELETED: true };
    if (hardPaused[campaign.effective_status || st.campaignStatus]) return off('campaign');
    if (hardPaused[adset.effective_status || st.adsetStatus]) return off('adset');

    // 4) الجدول الزمني — Meta بتسيب الحالة "نشطة" حتى بعد ما المدة تخلص
    var campStop = time(campaign.stop_time || st.campaignStop), adsetEnd = time(adset.end_time || st.adsetEnd);
    if ((campStop && campStop < now) || (adsetEnd && adsetEnd < now)) return off('ended');
    var campStart = time(campaign.start_time || st.campaignStart), adsetStart = time(adset.start_time || st.adsetStart);
    if ((campStart && campStart > now) || (adsetStart && adsetStart > now)) return off('scheduled');

    // 5) ميزانية المجموعة مدى الحياة خلصت
    var lifetime = Number(adset.lifetime_budget || st.adsetLifetime || 0);
    var remaining = adset.budget_remaining != null ? Number(adset.budget_remaining) : (st.adsetRemaining != null ? Number(st.adsetRemaining) : null);
    if (lifetime > 0 && remaining === 0) return off('budget');

    // 6) الحساب نفسه واقف تماماً (مشاكل الدفع الأخف بتظهر كتنبيه على مستوى الحساب، مش كإيقاف لكل إعلان)
    if (acct && acct.accountStatus != null && META_ACCOUNT_BLOCKING[Number(acct.accountStatus)]) return off('account');

    return { active: true, level: null, reason: null };
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
  // مستويات التنبيه: عاجل (محتاج تدخّل) / مهم (تابعه) / فرصة — مستوى "للعلم" اتشال لأنه ضوضاء
  var LEVELS = {
    critical: { label: 'عاجل', cls: 'lv-critical' },
    warning: { label: 'مهم', cls: 'lv-warning' },
    opportunity: { label: 'فرصة', cls: 'lv-opportunity' },
    info: { label: 'للعلم', cls: 'lv-info' }  // احتياطي لو محرك التنبيهات رجّع المستوى ده
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
      return '<div class="preview preview-image ' + c.themeClass + '"><span class="format-badge">تصميم ثابت</span></div>';
    }
    return '<div class="preview preview-text"><span class="text-url">' + esc(c.landing !== '—' ? c.landing : '') + '</span><span class="text-headline">' + esc(c.headline) + '</span><span class="text-desc">' + esc(c.desc) + '</span></div>';
  }

  // سبب إن الإعلان مش شغّال — موحّد لكل المنصات
  var PAUSED_LABELS = {
    campaign: 'متوقف (الحملة)',
    adset: 'متوقف (المجموعة الإعلانية)',
    ad: 'متوقف',
    ended: 'انتهت مدة الحملة',
    scheduled: 'مجدول — لسه مبدأش',
    pending: 'تحت المراجعة',
    rejected: 'مرفوض',
    account: 'متوقف (مشكلة في الحساب)',
    'account-cap': 'متوقف (الحساب وصل لحد الصرف)',
    'not-eligible': 'غير مؤهل للظهور',
    budget: 'ميزانية المجموعة خلصت',
    // دول بييجوا من سبب صريح بترجّعه المنصة نفسها (issues_info)
    issue: 'مش بيظهر — سبب من المنصة',
    'ad-issue': 'مش بيظهر — مشكلة في الإعلان',
    'adset-issue': 'مش بيظهر — مشكلة في المجموعة الإعلانية',
    'campaign-issue': 'مش بيظهر — مشكلة في الحملة'
  };
  // إعلان كل مستوياته نشطة بس مصرفش ولا جنيه آخر ٣ أيام (أول امبارح وامبارح والنهارده) — عملياً مش شغّال
  function notDelivering(c) {
    if (!c.active || (c.daysAgo != null && c.daysAgo < 2)) return false;
    var d = c.daily || [];
    return !(d[4] > 0) && !(d[5] > 0) && !(d[6] > 0);
  }
  function statusLabelOf(c) {
    if (c.active) return notDelivering(c) ? 'نشط — بس مش بيصرف' : 'نشط';
    return PAUSED_LABELS[c.pausedLevel] || 'متوقف';
  }

  function cardChips(c) {
    // الأرقام للفترة المختارة. تلوين المشكلة (اللي جاي من تنبيهات آخر ٧ أيام) بيظهر بس لما الفترة
    // هي نفسها آخر ٧ أيام — عشان رقم ٣٠ يوم ميتلوّنش أحمر بسبب حاجة حصلت أمس بس
    var p = periodOf(c);
    var hl = function (metric) { return period.preset === 'last7' ? mv(c, metric) : ''; };
    var tip = ' — ' + periodLabel();
    var chips = '<span class="metric-chip' + hl('spend') + '" title="الإنفاق' + tip + '">' + money(p.spend, c.currency) + '</span>';
    if (p.results != null) {
      chips += '<span class="metric-chip' + hl('results') + '" title="النتائج' + tip + '">' + ar(p.results) + ' ' + esc(c.resultLabel || 'نتائج') + '</span>';
    }
    var showRoas = p.roas != null || hl('roas');
    if (showRoas) {
      chips += '<span class="metric-chip' + hl('roas') + '" title="كل ١ بيتصرف بيرجع كام مبيعات' + tip + '">عائد ' + roasStr(p.roas) + '</span>';
    }
    // تكلفة النتيجة بتظهر لو مفيش عائد نعرضه، أو لو هي نفسها المشكلة
    if (p.cpr != null && (!showRoas || hl('cpr'))) {
      chips += '<span class="metric-chip' + hl('cpr') + '" title="تكلفة النتيجة الواحدة' + tip + '">' + money(p.cpr, c.currency) + ' للواحد</span>';
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
              '<span class="status-text' + (c.active ? (notDelivering(c) ? ' warn' : ' on') : '') + '">' + statusLabelOf(c) + '</span>' +
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


  function visibleCandidates() {
    return candidates.filter(function (c) {
      if (filters.platform !== 'all' && c.platform !== filters.platform) return false;
      if (filters.format !== 'all' && c.format !== filters.format) return false;
      if (filters.status === 'active' && !c.active) return false;
      if (filters.status === 'paused' && c.active) return false;
      if (filters.health !== 'all' && adAnalysis(c).health !== filters.health) return false;
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
      arr.sort(function (a, b) { return (HEALTH[adAnalysis(a).health].order - HEALTH[adAnalysis(b).health].order) || (periodOf(b).spend - periodOf(a).spend); });
    }
    else if (key === 'launch') arr.sort(function (a, b) { return age(a.daysAgo) - age(b.daysAgo); });
    else if (key === 'update') arr.sort(function (a, b) { return age(a.updatedDaysAgo) - age(b.updatedDaysAgo); });
    else if (key === 'spend') arr.sort(function (a, b) { return periodOf(b).spend - periodOf(a).spend; });
    return arr;
  }

  function render() {
    runAnalysis();
    var visible = sortCandidates(visibleCandidates(), filters.sort);
    // شاشة البداية بتظهر بس لما مفيش إعلانات ومفيش تحميل شغّال
    var empty = !candidates.length && !anyLoading();
    document.getElementById('emptyHero').classList.toggle('hidden', !empty);
    document.getElementById('adsContent').classList.toggle('hidden', empty);
    if (!candidates.length) {
      if (!anyLoading()) cardGrid.innerHTML = '';
      galleryCount.textContent = anyLoading() ? 'جارٍ التحميل…' : 'سجّل الدخول لعرض إعلاناتك';
    } else {
      cardGrid.innerHTML = visible.length ? visible.map(cardMarkup).join('') : '<div class="empty-state" style="grid-column:1/-1">لا توجد إعلانات مطابقة للفلتر الحالي</div>';
      galleryCount.textContent = 'عرض ' + ar(visible.length) + ' من ' + ar(candidates.length) + ' إعلاناً حقيقياً';
    }
    renderHealthCounts();
    renderFilterState();
    renderKpis();
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
    if (!dateFrom.value || !dateTo.value) { connectStatus.textContent = 'اختار تاريخ البداية والنهاية الأول.'; return; }
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
    health: { review: 'يحتاج مراجعة', improve: 'يحتاج تحسين', good: 'جيد', inactive: 'غير فعال' },
    status: { active: 'نشط فقط', paused: 'متوقف فقط' },
    format: { video: 'فيديو', image: 'تصميم', text: 'نص' }
  };
  function activeFilterList() {
    var out = [];
    ['health', 'status', 'format', 'platform'].forEach(function (k) {
      if (filters[k] === 'all') return;
      var label = (FILTER_LABELS[k] && FILTER_LABELS[k][filters[k]]) || filters[k];
      out.push({ key: k, label: label });
    });
    if (filters.text) out.push({ key: 'text', label: 'بحث: ' + filters.text });
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
    var box = function (label, value, cls) {
      return '<div class="kpi' + (cls || '') + '"><div class="kpi-label">' + label + '</div><div class="kpi-value">' + value + '</div></div>';
    };
    strip.innerHTML =
      box('الإنفاق — ' + periodLabel(), joinMoney(spendByCur)) +
      box('النتائج — ' + periodLabel(), ar(resultsTotal)) +
      box('معرّض للهدر — آخر يومين', joinMoney(atRisk), ' kpi-risk') +
      box('إعلانات تحتاج مراجعة', ar(review), review ? ' kpi-review' : '');
  }

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
    document.getElementById('expandTitle').textContent = c.offer;
    document.getElementById('expandSub').textContent = c.platform + ' · ' + c.placement + ' · ' + statusLabelOf(c) + (c.daysAgo != null ? ' — ' + sinceLabel(c.daysAgo) : '');
    document.getElementById('expandHealth').innerHTML = '<span class="health-badge ' + h.cls + '"><span class="health-dot-inline"></span>' + h.label + '</span>';
    // سطر "حالة الظهور": التقييم بتاعنا + سبب المنصة نفسه لو موجود + الحالة الخام —
    // ده اللي بيخلّيك تقارن بسطر واحد مع عمود Delivery في لوحة المنصة
    var statusBits = [statusLabelOf(c)];
    if (c.deliveryReason) statusBits.push(c.deliveryReason);
    if (c.platformStatus) statusBits.push('حالة المنصة: ' + c.platformStatus);
    document.getElementById('expandStatus').innerHTML =
      '<span class="status-line-label">الظهور</span><span class="status-line-value">' + esc(statusBits.join(' — ')) + '</span>';
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
    // مربعات الأرقام للفترة المختارة. التلوين بيظهر بس لو الفترة آخر ٧ أيام (نفس فترة التنبيهات)
    var p = periodOf(c);
    var hl = function (metric) { return period.preset === 'last7' ? mv(c, metric) : ''; };
    var pl = ' (' + periodLabel() + ')';
    var resultsLabelTxt = p.results != null ? ('النتائج — ' + esc(c.resultLabel || 'نتائج') + pl) : 'النتائج' + pl;
    var boxes =
      metricBox('الإنفاق' + pl, money(p.spend, cur), hl('spend') || hl('delivery')) +
      metricBox(resultsLabelTxt, p.results != null ? ar(p.results) : '— (لا توجد بيانات تحويل لهذا الإعلان)', hl('results')) +
      metricBox('تكلفة النتيجة الواحدة', p.cpr != null ? money(p.cpr, cur) : '—', hl('cpr')) +
      metricBox('العائد (كل ١ بيرجع)', roasStr(p.roas), hl('roas'));
    if (c.frequency != null) boxes += metricBox('تكرار الظهور لنفس الشخص (آخر ٧ أيام)', numAr(c.frequency) + ' مرة', mv(c, 'frequency'));
    boxes += metricBox('قيمة المبيعات' + pl, p.sales > 0 ? money(p.sales, cur) : '— (بدون قيمة مالية مرتبطة بالنتائج)');
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
          ? '<a class="video-fallback-link" href="' + esc(permalink) + '" target="_blank" rel="noopener noreferrer">🔗 فتح الفيديو الأصلي على Meta</a>'
          : '';
        if (mediaHtml || linkHtml) {
          el.innerHTML = mediaHtml + linkHtml;
          fitEmbeds(el);
        } else {
          el.innerHTML += '<div class="video-fallback-note">تعذّر جلب الفيديو لهذا الإعلان (قد يحتاج صلاحية إضافية على التطبيق).</div>';
        }
      });
    });
  }

  expandClose.addEventListener('click', function () { expandOverlay.classList.add('hidden'); });
  expandOverlay.addEventListener('click', function (e) { if (e.target === expandOverlay) expandOverlay.classList.add('hidden'); });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    expandOverlay.classList.add('hidden');
    settingsOverlay.classList.add('hidden');
    platformOverlay.classList.add('hidden');
    closeFilters();
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
      alertsListEl.innerHTML = '<div class="empty-state">سجّل الدخول وحمّل حساب إعلاني عشان تظهر التنبيهات هنا.</div>';
      return;
    }

    var atRiskKeys = Object.keys(s.atRisk);
    var atRisk = atRiskKeys.length ? atRiskKeys.map(function (cur) { return money(s.atRisk[cur], cur || null); }).join(' + ') : money(0);
    var box = function (key, cls, count, label) {
      return '<button type="button" class="summary-box ' + cls + (alertsLevelFilter === key ? ' active' : '') + '" data-level="' + key + '">' +
        '<span class="summary-count">' + ar(count) + '</span><span class="summary-label">' + label + '</span></button>';
    };
    alertsSummaryEl.innerHTML =
      '<div class="summary-risk"><span class="summary-risk-label">ميزانية معرّضة للهدر (صرف بدون نتائج أو بخسارة)</span><span class="summary-risk-value">' + atRisk + '</span></div>' +
      '<div class="summary-boxes summary-boxes-3">' +
        box('critical', 'lv-critical', s.levels.critical, 'عاجل — محتاج تدخّل') +
        box('warning', 'lv-warning', s.levels.warning, 'مهم — تابعه') +
        box('opportunity', 'lv-opportunity', s.levels.opportunity, 'فرص للنمو') +
      '</div>';

    var list = analysis.alerts.filter(function (a) {
      if (alertsLevelFilter === 'urgent') return a.level === 'critical' || a.level === 'warning';
      return a.level === alertsLevelFilter;
    });
    alertsListEl.innerHTML = list.length
      ? list.map(alertMarkup).join('')
      : '<div class="empty-state">' + (alertsLevelFilter === 'urgent' ? 'مفيش حاجة عاجلة حالياً — إعلاناتك ماشية كويس.' : 'مفيش تنبيهات من النوع ده حالياً.') + '</div>';
  }

  alertsSummaryEl.addEventListener('click', function (e) {
    var b = e.target.closest('.summary-box'); if (!b) return;
    // الضغط على نفس المربع تاني بيرجّع للعرض الافتراضي (العاجل + المهم)
    alertsLevelFilter = alertsLevelFilter === b.dataset.level ? 'urgent' : b.dataset.level;
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
  // الشاشة الأساسية: نمط جاهز + العائد المستهدف + فترة التعلّم. باقي الحدود تحت "إعدادات متقدمة"
  var settingsOverlay = document.getElementById('settingsOverlay');
  var settingsForm = document.getElementById('settingsForm');
  var SETTING_UNITS = { multiple: '×', ratio: '٪', days: 'يوم', times: 'مرة', count: 'نتيجة' };
  var MAIN_SETTINGS = { roasTarget: true, learningDays: true };
  var PRESET_LABELS = {
    calm: { name: 'هادي', help: 'تنبيهات أقل — الحاجات الكبيرة بس' },
    balanced: { name: 'متوازن', help: 'الافتراضي — مناسب لأغلب الحسابات' },
    strict: { name: 'صارم', help: 'تنبيهات أكتر — أي انحراف بسيط' }
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
    var presetHtml = '<fieldset class="settings-group"><legend>حساسية التنبيهات</legend><div class="preset-options">' +
      Object.keys(PRESET_LABELS).map(function (p) {
        return '<label class="preset-option"><input type="radio" name="_preset" value="' + p + '"' + (p === preset ? ' checked' : '') + '>' +
          '<span class="preset-name">' + PRESET_LABELS[p].name + '</span><span class="preset-help">' + PRESET_LABELS[p].help + '</span></label>';
      }).join('') + '</div></fieldset>';
    var mainHtml = '<fieldset class="settings-group"><legend>أهداف البزنس</legend>' +
      PauseProofAlerts.SETTINGS_META.filter(function (m) { return MAIN_SETTINGS[m.key]; }).map(function (m) { return settingRow(m, current[m.key]); }).join('') +
      '</fieldset>';
    var groups = {};
    PauseProofAlerts.SETTINGS_META.forEach(function (m) {
      if (MAIN_SETTINGS[m.key]) return;
      (groups[m.group] = groups[m.group] || []).push(m);
    });
    var advancedHtml = '<details class="settings-advanced"><summary>إعدادات متقدمة (كل الحدود بالتفصيل)</summary>' +
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
      if (p !== 'meta') {
        activeSources[p] = active[p];
        accountSelect.value = active[p]; // القائمة تفضل مطابقة للحساب المعروض فعلاً
        loadSource(p, active[p]);
        return;
      }
      activeSources.meta = active.meta;
      whenFbReady(function () {
        FB.getLoginStatus(function (resp) {
          // بنعيد قراءة بيانات الحساب (الحالة وحد الصرف) بدل ما نعتمد على المحفوظ من جلسة قديمة —
          // حساب اتحل عنده مشكلة الدفع كان هيفضل ظاهر إن إعلاناته كلها متوقفة
          if (resp && resp.status === 'connected') { loadAdAccounts(active.meta); return; }
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
