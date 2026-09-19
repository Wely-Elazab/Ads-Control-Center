// =====================================================================
// Ads Control Center — صفحة الأسعار
// =====================================================================
// كل الأرقام هنا في مكان واحد — تغيير السعر أو سعر الصرف = تعديل الرقم ده بس
(function (global) {
  var PRICING = {
    monthly: 9.99,        // اشتراك شهري (بالدولار)
    yearlyPerMonth: 6.99, // اشتراك سنوي — السعر للشهر (بالدولار)
    trialDays: 14,
    guaranteeDays: 14,    // ضمان استرداد كامل خلال المدة دي من أول دفعة
    contactEmail: 'walid.elazab20@gmail.com',
    // أسعار صرف ثابتة بتتراجع يدوياً من وقت للتاني — مش لحظية، عشان السعر ميتغيّرش كل يوم قدام العميل.
    // الريال السعودي والدرهم والريال القطري مربوطين بالدولار. الدينار الكويتي والبحريني والريال العماني
    // والدينار الأردني مش هنا عن قصد: قاعدة "رقم صحيح + .٩٩" فيهم بتزوّد السعر لحد ٤٠٪، فبيظهر بالدولار
    currencies: {
      USD: { rate: 1, name: { ar: 'دولار أمريكي', en: 'US dollar' }, unit: { ar: 'دولار', en: '$' } },
      EGP: { rate: 50, name: { ar: 'جنيه مصري', en: 'Egyptian pound' }, unit: { ar: 'جنيه', en: 'EGP' } },
      SAR: { rate: 3.75, name: { ar: 'ريال سعودي', en: 'Saudi riyal' }, unit: { ar: 'ريال', en: 'SAR' } },
      AED: { rate: 3.6725, name: { ar: 'درهم إماراتي', en: 'UAE dirham' }, unit: { ar: 'درهم', en: 'AED' } },
      QAR: { rate: 3.64, name: { ar: 'ريال قطري', en: 'Qatari riyal' }, unit: { ar: 'ريال قطري', en: 'QAR' } }
    },
    // العملة المبدئية من المنطقة الزمنية للجهاز (من غير أي طلب لسيرفر) — والعميل يقدر يغيّرها
    timezones: { 'Africa/Cairo': 'EGP', 'Asia/Riyadh': 'SAR', 'Asia/Dubai': 'AED', 'Asia/Qatar': 'QAR' },
    // وسائل الدفع حسب العملة (مفيش تقسيط). عدّلها لتطابق اللي فعّلته فعلاً
    paymentMethods: {
      EGP: {
        ar: ['إنستاباي (InstaPay)', 'محافظ إلكترونية (فودافون كاش وغيرها)', 'تحويل بنكي', 'فيزا / ماستركارد عن طريق رابط دفع'],
        en: ['InstaPay', 'Mobile wallets (Vodafone Cash and others)', 'Bank transfer', 'Visa / Mastercard via a payment link']
      },
      other: {
        ar: ['فيزا / ماستركارد عن طريق رابط دفع', 'تحويل بنكي'],
        en: ['Visa / Mastercard via a payment link', 'Bank transfer']
      }
    }
  };

  function round2(n) { return Math.round(n * 100) / 100; }
  // السعر بالعملة المحلية: رقم صحيح بيخلص بـ .٩٩ (مثلاً ٦٫٩٩$ × ٥٠ = ٣٤٩٫٥ ← ٣٤٩٫٩٩ جنيه)
  PRICING.localPrice = function (usd, cur) {
    var c = PRICING.currencies[cur];
    if (!c || cur === 'USD') return usd;
    return Math.floor(usd * c.rate) + 0.99;
  };
  PRICING.prices = function (cur, discountPct) {
    var monthly = PRICING.localPrice(PRICING.monthly, cur);
    var yearlyPerMonth = PRICING.localPrice(PRICING.yearlyPerMonth, cur);
    var off = discountPct ? (1 - discountPct / 100) : 1;
    return {
      monthly: monthly, yearlyPerMonth: yearlyPerMonth,
      yearlyTotal: round2(yearlyPerMonth * 12),
      savingPct: Math.round((1 - yearlyPerMonth / monthly) * 100),
      // بعد الخصم: الحساب الحقيقي من غير تقريب لـ .٩٩ — عشان النسبة المكتوبة تبقى هي اللي اتخصمت فعلاً
      monthlyAfter: round2(monthly * off), yearlyPerMonthAfter: round2(yearlyPerMonth * off),
      yearlyTotalAfter: round2(round2(yearlyPerMonth * off) * 12)
    };
  };
  PRICING.currencyForTimezone = function (tz) { return PRICING.timezones[tz] || 'USD'; };
  // للاختبارات القديمة
  PRICING.yearlyTotal = function () { return PRICING.prices('USD').yearlyTotal; };
  PRICING.savingPct = function () { return PRICING.prices('USD').savingPct; };
  global.ACC_PRICING = PRICING;

  // ================= الصفحة نفسها (لو موجودة) =================
  var CUR_KEY = 'acc.currency';
  var AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  function isAr() { return document.documentElement.lang !== 'en'; }
  function lang() { return isAr() ? 'ar' : 'en'; }
  function digits(s) { return isAr() ? String(s).replace(/[0-9]/g, function (d) { return AR_DIGITS[d]; }) : String(s); }
  // فاصل الآلاف والكسور: ٤٬١٩٩٫٨٨ بالعربي و 4,199.88 بالإنجليزي
  function num(n) {
    var s = round2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return isAr() ? digits(s.replace(/,/g, '٬').replace('.', '٫')) : s;
  }
  function money(n, cur) {
    var unit = PRICING.currencies[cur].unit[lang()];
    if (!isAr() && cur === 'USD') return '$' + num(n);
    return num(n) + ' ' + unit;
  }
  function $(id) { return document.getElementById(id); }

  var state = { billing: 'yearly', currency: 'USD', discount: null };
  (function initCurrency() {
    var saved = null;
    try { saved = localStorage.getItem(CUR_KEY); } catch (e) { /* تخزين مقفول */ }
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* مش مهم */ }
    state.currency = (saved && PRICING.currencies[saved]) ? saved : PRICING.currencyForTimezone(tz);
  })();

  function render() {
    if (!$('planCard')) return;
    var cur = state.currency, yearly = state.billing === 'yearly';
    var d = state.discount && state.discount.percent;
    var p = PRICING.prices(cur, d);
    var price = yearly ? p.yearlyPerMonth : p.monthly;
    var after = yearly ? p.yearlyPerMonthAfter : p.monthlyAfter;

    $('planAmount').textContent = money(d ? after : price, cur);
    $('planWas').textContent = d ? money(price, cur) : '';
    $('planUnit').textContent = isAr() ? '/ شهرياً' : '/ month';
    $('planNote').textContent = yearly
      ? (isAr() ? 'يُدفع ' + money(d ? p.yearlyTotalAfter : p.yearlyTotal, cur) + ' مرة واحدة سنوياً.'
                : 'Billed ' + money(d ? p.yearlyTotalAfter : p.yearlyTotal, cur) + ' once a year.')
      : (isAr() ? 'يُدفع شهرياً.' : 'Billed every month.');
    Array.prototype.forEach.call(document.querySelectorAll('[data-saving]'), function (el) { el.textContent = digits(p.savingPct); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-trial-days]'), function (el) { el.textContent = digits(PRICING.trialDays); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-guarantee-days]'), function (el) { el.textContent = digits(PRICING.guaranteeDays); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-billing]'), function (b) {
      var on = b.getAttribute('data-billing') === state.billing;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    // قائمة العملات بلغة الصفحة
    var sel = $('currencySelect');
    sel.innerHTML = '';
    Object.keys(PRICING.currencies).forEach(function (code) {
      var o = document.createElement('option');
      o.value = code; o.textContent = PRICING.currencies[code].name[lang()];
      sel.appendChild(o);
    });
    sel.value = cur;
    $('currencyNote').classList.toggle('hidden', cur === 'USD');

    // وسائل الدفع حسب العملة
    var methods = (PRICING.paymentMethods[cur] || PRICING.paymentMethods.other)[lang()];
    $('payMethods').innerHTML = '';
    methods.forEach(function (m) { var li = document.createElement('li'); li.textContent = m; $('payMethods').appendChild(li); });

    // زرار التجربة: إيميل جاهز فيه الخطة والسعر والكود والبيانات اللي محتاجينها لإضافتك على Meta وGoogle
    var planName = isAr() ? (yearly ? 'السنوي' : 'الشهري') : (yearly ? 'yearly' : 'monthly');
    var subject = isAr() ? 'طلب تجربة مجانية — الاشتراك ' + planName : 'Free trial request — ' + planName + ' plan';
    var code = state.discount ? state.discount.code : ($('discountInput').value || '').trim();
    var head = isAr()
      ? 'الخطة: ' + planName + ' — ' + money(d ? after : price, cur) + ' / شهرياً' + (code ? '\nرمز الخصم: ' + code : '') + '\n\n'
      : 'Plan: ' + planName + ' — ' + money(d ? after : price, cur) + ' / month' + (code ? '\nDiscount code: ' + code : '') + '\n\n';
    var body = head + (isAr()
      ? 'الاسم:\nاسم النشاط:\nالبلد:\nالمنصات التي تعلن عليها (Meta / Google / Snapchat / TikTok):\nبريد Google المرتبط بحساب Google Ads (لربط Google):\nرابط حسابك على فيسبوك (لربط Meta):\nرقم واتساب للتواصل:\n'
      : 'Name:\nBusiness name:\nCountry:\nPlatforms you advertise on (Meta / Google / Snapchat / TikTok):\nGoogle email with your Google Ads account (if connecting Google):\nYour Facebook profile link (if connecting Meta):\nWhatsApp number:\n');
    var href = 'mailto:' + PRICING.contactEmail + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    Array.prototype.forEach.call(document.querySelectorAll('[data-trial-cta]'), function (a) { a.setAttribute('href', href); });
  }

  // رسالة الكود بتتحفظ كنوع مش كنص — عشان لو اللغة اتغيرت تتكتب باللغة الجديدة
  var MSGS = {
    checking: { ar: 'جارٍ التحقق من الرمز…', en: 'Checking the code…' },
    ok: { ar: '✓ طُبّق خصم {pct}٪ على السعر', en: '✓ {pct}% discount applied' },
    expired: { ar: 'انتهت صلاحية هذا الرمز.', en: 'This code has expired.' },
    invalid: { ar: 'هذا الرمز غير صحيح.', en: 'This code isn\'t valid.' },
    offline: { ar: 'تعذّر التحقق من الرمز الآن — سيُرسل مع طلبك ونطبّقه عند الدفع.', en: 'We couldn\'t check the code right now — it will be sent with your request and applied at payment.' }
  };
  var msgState = null;
  function setDiscountMsg(key) { msgState = key || null; renderMsg(); }
  function renderMsg() {
    var m = $('discountMsg');
    var kind = msgState === 'ok' ? ' ok' : ((msgState === 'invalid' || msgState === 'expired') ? ' bad' : '');
    m.className = 'discount-msg' + kind;
    m.textContent = msgState ? MSGS[msgState][lang()].replace('{pct}', state.discount ? digits(state.discount.percent) : '') : '';
  }

  // الكود بيتأكد منه السيرفر (الأكواد مش موجودة في الصفحة). لو السيرفر مش متاح، الكود بيتبعت مع الطلب ونطبّقه يدوي
  function applyDiscount() {
    var input = $('discountInput');
    var code = (input.value || '').trim();
    state.discount = null;
    if (!code) { setDiscountMsg(null); render(); return; }
    setDiscountMsg('checking');
    fetch('/api/discount', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }) })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (res) {
        if (res && res.valid) {
          state.discount = { code: res.code, percent: res.percent };
          setDiscountMsg('ok');
        } else {
          setDiscountMsg(res && res.expired ? 'expired' : 'invalid');
        }
        render();
      })
      .catch(function () { setDiscountMsg('offline'); render(); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!$('planCard')) return;
    $('billingToggle').addEventListener('click', function (e) {
      var b = e.target.closest('[data-billing]'); if (!b) return;
      state.billing = b.getAttribute('data-billing');
      render();
    });
    $('currencySelect').addEventListener('change', function () {
      state.currency = this.value;
      try { localStorage.setItem(CUR_KEY, state.currency); } catch (e) { /* مش مهم */ }
      render();
    });
    $('discountApply').addEventListener('click', applyDiscount);
    $('discountInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); applyDiscount(); } });
    // لو العميل عدّل الكود بعد ما اتطبّق، الخصم بيتشال لحد ما يضغط "تطبيق" تاني
    $('discountInput').addEventListener('input', function () { if (state.discount || msgState) { state.discount = null; setDiscountMsg(null); } render(); });
    // الأرقام والنصوص بتتكتب تاني لما اللغة تتغيّر (عربي ↔ إنجليزي)
    var langBtn = $('legalLang');
    if (langBtn) langBtn.addEventListener('click', function () { setTimeout(function () { renderMsg(); render(); }, 0); });
    render();
  });
})(window);
