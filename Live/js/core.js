// =====================================================================
// Ads Center — الأساس المشترك
// =====================================================================
// اللغة والتنسيق (أرقام، عملة، تواريخ)، الحماية من XSS، فترة البيانات، الجلسة، رسائل الحالة،
// وحالة الأداة المشتركة (الإعلانات المحمّلة والفلاتر) — كل الملفات التانية بتعتمد عليه.
// الملفات بتتحمّل بالترتيب ده وبتتشارك نفس النطاق العام (من غير bundler):
//   i18n → alerts → core → meta → google → snapchat → tiktok → ui → main
// أي كود بيتنفّذ وقت التحميل مسموحله يستخدم اللي في الملفات اللي قبله بس — الباقي جوه دوال.

  // ---------- اللغة ----------
  // كل النصوص في i18n.js — t('مفتاح', { متغيرات }). الأرقام العربية (٠١٢) بتظهر في الواجهة العربية بس
  function t(key, vars) { return window.I18N ? I18N.t(key, vars) : key; }
  function isAr() { return !window.I18N || I18N.lang === 'ar'; }
  // اسم مع عدد بالصيغة الصح في كل لغة ("٥ إعلانات" / "١٥ إعلان" / "1 ad")
  function noun(n, base) { return I18N.noun(n, base); }
  // كائن بيرجّع النص المترجم وقت القراءة — عشان تغيير اللغة يبان من غير ما نبني الكائنات من الأول
  function i18nMap(keys) {
    var o = {};
    Object.keys(keys).forEach(function (k) {
      Object.defineProperty(o, k, { enumerable: true, get: function () { return t(keys[k]); } });
    });
    return o;
  }
  var ARABIC_DIGITS = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  function ar(n) { return isAr() ? String(n).replace(/[0-9]/g, function (d) { return ARABIC_DIGITS[d]; }) : String(n); }
  function digitsAny(n) { return ar(n); }
  function decSep() { return isAr() ? '٫' : '.'; }
  // العملة بتيجي من الحساب الإعلاني نفسه. لو المنصة مرجّعتهاش بنسيبها فاضية —
  // قبل كده كانت "ر.س" افتراضياً، فحساب بالجنيه كان ممكن يظهر بالريال
  var CURRENCY_LABELS = { SAR: 'ر.س', AED: 'د.إ', EGP: 'ج.م', KWD: 'د.ك', QAR: 'ر.ق', BHD: 'د.ب', OMR: 'ر.ع', JOD: 'د.أ', USD: '$', EUR: '€', GBP: '£' };
  var CURRENCY_SYMBOLS_EN = { USD: '$', EUR: '€', GBP: '£' };
  function currencyLabel(cur) {
    if (!cur) return '';
    if (!isAr()) return CURRENCY_SYMBOLS_EN[cur] || cur;
    return CURRENCY_LABELS[cur] || cur;
  }
  // رقم بفاصل الآلاف (٢٬٤٠٠ / 2,400). keepSmallDecimal: الأرقام الأقل من ١٠ بخانة عشرية لو فيها كسور
  // (٠٫٤ مش ٠) — عشان صرف صغير زي "صرف ١ بس" ميتقريش صفر
  function fmtNum(n, keepSmallDecimal) {
    var v = Number(n) || 0;
    var s = (keepSmallDecimal && v !== 0 && Math.abs(v) < 10 && Math.round(v) !== v)
      ? String(Math.round(v * 10) / 10).replace('.', decSep())
      : Math.round(v).toLocaleString('en-US').replace(/,/g, isAr() ? '٬' : ',');
    return ar(s);
  }
  function money(n, cur) {
    var label = currencyLabel(cur);
    return fmtNum(n, true) + (label ? ' ' + label : '');
  }
  // عملة الإعلانات المعروفة (لمبلغ صفر مالوش عملة زي "معرّض للهدر: ٠") — null لو مفيش
  function defaultCurrency() {
    for (var i = 0; i < candidates.length; i++) if (candidates[i].currency) return candidates[i].currency;
    return null;
  }
  // رقم بخانة عشرية واحدة بالأرقام العربية (مثال: ٢٫٥)
  // الأرقام اليومية بتتخزن بخانتين عشريتين — التقريب لأقرب رقم صحيح بيحصل وقت العرض بس،
  // عشان صرف صغير زي ٠٫٤ ميتحسبش صفر ويبوّظ تنبيهات زي "مصرفش أمس"
  function r2(n) { return Math.round((n || 0) * 100) / 100; }
  function numAr(n) { var r = Math.round((n || 0) * 10) / 10; return ar(String(r).replace('.', decSep())); }
  function roasStr(r) { if (!r) return '—'; return '×' + numAr(r); }
  function sinceLabel(n) {
    if (n == null) return '';
    if (n === 0) return t('since.today');
    if (n === 1) return t('since.1');
    if (n === 2) return t('since.2');
    // «منذ ٥ أيام» / «منذ ١٥ يوماً» / «منذ ١٠٠ يوم»
    return t(I18N.countKey(n, 'since.n.one', 'since.n.many', 'since.n.acc'), { n: ar(n) });
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
  function monthsShort() { return window.I18N ? I18N.months() : ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']; }

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
      out.push({ key: d.toISOString().slice(0, 10) });
    }
    return out;
  }
  function daysFromRange(range) { return last7Days((range && range.until) || todayKeyInTz(BROWSER_TZ)); }

  var candidates = [];
  // الترتيب الافتراضي "الأولوية": الإعلانات اللي محتاجة انتباه تظهر الأول
  // فلتر الحالة واحد: يحتاج مراجعة / يحتاج تحسين / جيد / متوقف (كان فلترين متداخلين: الحالة + تقييم الأداء)
  var filters = { platform: 'all', format: 'all', health: 'all', text: '', sort: 'priority' };

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

  var PLATFORMS = ['meta', 'google', 'snapchat', 'tiktok'];
  var PLATFORM_NAMES = { meta: 'Meta', google: 'Google Ads', snapchat: 'Snapchat', tiktok: 'TikTok' };
  function platformOfSource(source) { return String(source || '').split(':')[0]; }

  // ---------- حالة كل منصة (للشاشة لما مفيش إعلانات أو فيه مشكلة) ----------
  // { kind: 'error' | 'expired' | 'empty' | 'noAccounts', msg } — مفيش حالة = المنصة اتحمّلت تمام (أو مش متصلة).
  // قبل كده لو الحساب فاضي أو التحميل فشل، شاشة «اربط حسابك» كانت بترجع كأن العميل مش مربوط
  var platformState = {};
  function setPlatformState(platform, state) {
    if (state) platformState[platform] = state; else delete platformState[platform];
  }
  function isConnected(platform) {
    return !!(activeSources[platform] || (platformOptions[platform] && platformOptions[platform].length) || platformState[platform]);
  }

  // ---------- آخر حساب اختاره العميل في كل منصة ----------
  // بيتحفظ على الجهاز (رقم الحساب بس) — عشان المرة الجاية يفتح على نفس الحساب بدل أول واحد في القايمة
  var LAST_ACCOUNT_KEY = 'acc.lastAccount.v1';
  var lastAccounts = (function () {
    try { return JSON.parse(localStorage.getItem(LAST_ACCOUNT_KEY) || 'null') || {}; } catch (e) { return {}; }
  })();
  function saveLastAccounts() { try { localStorage.setItem(LAST_ACCOUNT_KEY, JSON.stringify(lastAccounts)); } catch (e) { /* مش مهم */ } }
  function rememberAccount(platform, id) { if (id && lastAccounts[platform] !== id) { lastAccounts[platform] = id; saveLastAccounts(); } }
  function forgetAccount(platform) { if (platform in lastAccounts) { delete lastAccounts[platform]; saveLastAccounts(); } }
  // الحساب اللي يتفتح: المحفوظ لو لسه موجود ← أول حساب شغّال (isActive) ← أول حساب
  function pickAccount(platform, accounts, isActive) {
    var ids = accounts.map(function (a) { return a.id; });
    if (lastAccounts[platform] && ids.indexOf(lastAccounts[platform]) !== -1) return lastAccounts[platform];
    var active = isActive ? accounts.filter(isActive)[0] : null;
    return (active || accounts[0]).id;
  }

  // بداية تحميل حساب: لو حساب مختلف عن المعروض، إعلانات الحساب القديم لنفس المنصة بتتشال فوراً.
  // قبل كده لو الحساب الجديد فاضي أو فشل، إعلانات القديم كانت بتفضل ظاهرة تحت اسم الجديد
  function selectSource(platform, id) {
    if (activeSources[platform] !== id) {
      candidates = candidates.filter(function (c) { return platformOfSource(c.source) !== platform; });
    }
    activeSources[platform] = id;
    rememberAccount(platform, id);
    saveSession();
  }

  // ---------- طلبات سيرفر الأداة (/api/...) ----------
  // بيرجّع { status, ok, data } دايماً — حتى لو الرد مش JSON (زي صفحة خطأ من Vercel لو الطلب طوّل)،
  // بدل خطأ تقني زي "Unexpected end of JSON input" يظهر للعميل
  function apiPost(path, body) {
    return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.text().then(function (txt) {
          var data = null;
          try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
          if (!data || typeof data !== 'object') data = { error: r.ok ? t('s.badResponse') : t('s.serverError', { code: ar(r.status) }) };
          return { status: r.status, ok: r.ok, data: data };
        });
      });
  }
  // الربط انتهى أو اتلغى (توكن منتهي) — ده مش عطل، العميل محتاج يربط تاني بس
  function isAuthFailure(res) { return !!res && (res.status === 401 || (res.data && res.data.code === 'AUTH')); }
  // سبب الخطأ بلغة الواجهة: الأخطاء المعروفة (حد الطلبات، الصلاحيات، إعداد السيرفر...) بتتترجم، والباقي بنص
  // المنصة نفسه. بترجع دالة — عشان لو العميل غيّر اللغة، نفس الرسالة تتكتب باللغة الجديدة.
  // قبل كده رسايل السيرفر كانت بالعربي بس، فالعميل اللي مختار إنجليزي كان بيشوفها بالعربي
  var SERVER_ERROR_KEYS = {
    ORIGIN: 'err.origin', WRONG_APP: 'err.wrongApp', NO_SCOPE: 'err.noScope', BAD_REQUEST: 'err.badRequest', CONFIG: 'err.config',
    RESOURCE_EXHAUSTED: 'err.rateLimit', RATE_EXCEEDED: 'err.rateLimit', USER_PERMISSION_DENIED: 'err.permission', PERMISSION_DENIED: 'err.permission'
  };
  function apiErrorText(res) {
    var data = (res && res.data) || {};
    var key = SERVER_ERROR_KEYS[data.code] || (res && res.status === 429 ? 'err.rateLimit' : null) ||
      (res && res.status === 403 && !data.code ? 'err.permission' : null);
    var raw = data.error && (data.error.message || data.error);
    return function () { return key ? t(key) : String(raw || t('s.unexpected')); };
  }

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
  var PERIOD_LABELS = i18nMap({
    today: 'period.today', yesterday: 'period.yesterday', last7: 'period.last7', last14: 'period.last14', last30: 'period.last30',
    thisMonth: 'period.thisMonth', lastMonth: 'period.lastMonth', custom: 'period.custom'
  });
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
      if (since > until) { var tmp = since; since = until; until = tmp; }
      if (until > today) until = today;
      if (since > until) since = until;
    } else preset = 'last7';
    if (keyDiffDays(since, until) > PERIOD_MAX_DAYS - 1) since = shiftKey(until, -(PERIOD_MAX_DAYS - 1));
    return { preset: preset, since: since, until: until, isDefault: preset === 'last7' };
  }
  function periodKey() { return period.preset === 'custom' ? 'custom:' + period.since + ':' + period.until : period.preset; }
  // تاريخ بشكل مقروء: "٣ سبتمبر"
  function fmtKey(key) {
    if (!key) return '';
    var p = key.split('-').map(Number);
    return ar(p[2]) + ' ' + monthsShort()[p[1] - 1];
  }
  // فترة: "١٣–١٩ سبتمبر" لو نفس الشهر، و"٢٨ أغسطس – ٣ سبتمبر" لو شهرين — من غير تكرار الشهر ولا شرطتين ورا بعض
  // مع "الإنفاق — ..."
  function fmtRange(since, until) {
    if (!since || !until || since === until) return fmtKey(since || until);
    var a = since.split('-').map(Number), b = until.split('-').map(Number);
    if (a[0] === b[0] && a[1] === b[1]) return ar(a[2]) + '–' + ar(b[2]) + ' ' + monthsShort()[a[1] - 1];
    return fmtKey(since) + ' – ' + fmtKey(until);
  }
  function periodLabel() {
    if (period.preset !== 'custom') return PERIOD_LABELS[period.preset];
    return fmtRange(period.since, period.until);
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
  // بيتنادى بس بعد تحميل ناجح لأي منصة — فهو كمان وقت "آخر تحديث" اللي بيظهر جنب الفترة
  var lastUpdatedAt = null;
  function cacheSource(source, ads) { sourceCache[source + '|' + periodKey()] = ads.slice(); lastUpdatedAt = Date.now(); }
  function showCachedWhileLoading(source) {
    var cached = sourceCache[source + '|' + periodKey()];
    if (!cached || !cached.length) return false;
    mergeCandidates(cached, source);
    render();
    return true;
  }

  var loadingPlatforms = {};
  function anyLoading() { return Object.keys(loadingPlatforms).some(function (p) { return loadingPlatforms[p]; }); }
  function setLoading(platform, on, text, opts) {
    loadingPlatforms[platform] = !!on;
    document.body.classList.toggle('is-loading', anyLoading());
    if (text) setStatus(text, opts);
    // شاشة الانتظار بتظهر بس لما مفيش أي إعلانات معروضة — لو فيه بيانات قديمة بتفضل ظاهرة وهي بتتحدّث
    if (on && !candidates.length) showSkeletons();
  }
  function showSkeletons() {
    var one = '<div class="skeleton-card"><div class="sk sk-img"></div><div class="sk sk-line"></div><div class="sk sk-line short"></div><div class="sk sk-chips"></div></div>';
    var html = '';
    for (var i = 0; i < 6; i++) html += one;
    cardGrid.innerHTML = html;
    galleryCount.textContent = t('gallery.loading');
  }
  // ---------- رسالة الحالة ----------
  // الرسالة بتتحفظ كدالة مش كنص — عشان لو المستخدم غيّر اللغة، نفس الرسالة تتكتب باللغة الجديدة
  var lastStatus = null;
  function msg(key, vars) {
    return function () {
      var v = {};
      Object.keys(vars || {}).forEach(function (k) {
        var x = vars[k];
        v[k] = typeof x === 'number' ? ar(x) : (typeof x === 'function' ? x() : x);
      });
      return t(key, v);
    };
  }
  // opts.help = اسم المنصة ('meta' / 'google'): بيظهر جنب الرسالة رابط خطوات الربط بتاعتها وطلب الانضمام —
  // لرسايل فشل الدخول في التجربة المغلقة.
  // opts.reconnect = اسم المنصة: زرار «ربط تاني» جنب رسالة انتهاء الجلسة. أي رسالة تانية بتخفيهم
  function setStatus(m, opts) {
    lastStatus = typeof m === 'function' ? m : function () { return String(m); };
    connectStatus.textContent = lastStatus();
    var help = opts && opts.help;
    if (statusHelp) {
      statusHelp.hidden = !help;
      if (help) statusHelpLink.setAttribute('href', '/help#' + help);
    }
    var reconnect = opts && opts.reconnect;
    if (statusReconnect) {
      statusReconnect.hidden = !reconnect;
      statusReconnect.setAttribute('data-reconnect', reconnect || '');
    }
  }
  function connectedText(notes) {
    return function () {
      var n = (notes || []).map(function (x) { return typeof x === 'function' ? x() : x; });
      return t('s.connected', { n: ar(candidates.length), ads: noun(candidates.length, 'n.ad') }) + (n.length ? ' (' + n.join(t('join.sep')) + ')' : '');
    };
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
  var statusHelp = document.getElementById('statusHelp');
  var statusHelpLink = document.getElementById('statusHelpLink');
  var statusReconnect = document.getElementById('statusReconnect');
  var filterToggle = document.getElementById('filterToggle');
  var filterBar = document.getElementById('filterBar');
  var textFilter = document.getElementById('textFilter');
  var dateFrom = document.getElementById('dateFrom');
  var dateTo = document.getElementById('dateTo');
  var sortSelect = document.getElementById('sortSelect');
  var galleryCount = document.getElementById('galleryCount');
  var cardGrid = document.getElementById('cardGrid');
  var resetAllBtn = document.getElementById('resetAllBtn');
  var expandOverlay = document.getElementById('expandOverlay');
  var expandClose = document.getElementById('expandClose');

  function loadSource(platform, id) {
    if (platform === 'google') loadGoogleAdsForAccount(id);
    else if (platform === 'snapchat') loadSnapchatAdsForAccount(id);
    else if (platform === 'tiktok') loadTikTokAdsForAdvertiser(id);
    else if (platform === 'meta') loadAdsForAccount(id);
  }

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
  function sessionStorageWorks() {
    try { sessionStorage.setItem('acc.probe', '1'); sessionStorage.removeItem('acc.probe'); return true; } catch (e) { return false; }
  }
  function consumeOauthState(platform, received) {
    if (!received || received.indexOf(platform + '.') !== 0) return false;
    // «.nostore» معناها إن التخزين كان مقفول وقت ما الدخول بدأ — بتتقبل بس لو التخزين لسه مقفول فعلاً.
    // قبل كده كانت بتتقبل دايماً: أي حد كان يقدر يبعت رابط رجوع فيه state=snapchat.nostore وكود دخول بتاعه،
    // فمتصفح الضحية يربط حساب المهاجم من غير ما يحس (ثغرة CSRF على تسجيل الدخول)
    if (received === platform + '.nostore') return !sessionStorageWorks();
    var saved = null;
    try { saved = sessionStorage.getItem(OAUTH_STATE_KEY); sessionStorage.removeItem(OAUTH_STATE_KEY); } catch (e) { /* مقفول */ }
    return !!saved && received === saved;
  }
  // خطأ راجع من المنصة نفسها في الرابط (مثلاً المستخدم رفض الصلاحيات). بنعرض رسالة من عندنا بس،
  // مش النص اللي في الرابط (error_description) — أي حد كان يقدر يبعت رابط فيه أي جملة، زي
  // "حسابك اتوقف كلّمنا على الرقم ده"، وتظهر للعميل كأنها رسالة من الأداة
  function oauthErrorFromUrl(params) {
    var err = params.get('error') || params.get('error_code');
    if (!err) return null;
    // أكواد OAuth المعروفة بس بتظهر (بتساعد في الدعم الفني) — أي حاجة تانية بتبقى رسالة عامة
    var code = OAUTH_ERROR_CODES.indexOf(err) !== -1 ? err : 'unknown';
    return function () { return code === 'access_denied' ? t('err.oauthDenied') : t('err.oauthOther', { code: code }); };
  }
  var OAUTH_ERROR_CODES = ['access_denied', 'invalid_request', 'unauthorized_client', 'unsupported_response_type',
    'invalid_scope', 'server_error', 'temporarily_unavailable', 'invalid_grant', 'invalid_client'];
