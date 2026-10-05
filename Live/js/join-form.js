// صفحة /join — نموذج طلب الانضمام للتجربة (join.html) → دالة sync (action: join، في supabase/functions/sync/join.ts)
// الدالة هي اللي بتتحقق فعلاً (وبترجّع اسم الحقل الغلط)، والتحقق هنا عشان العميل يعرف الغلط قبل ما يبعت.
// حقل فيسبوك بيظهر بس لو اختار Meta، وبريد Google لو اختار Google Ads.
// «أنت:» (role) إجباري وأول حاجة: مسؤول إعلانات / وكالة / صاحب متجر بيدير إعلاناته / صاحب متجر عنده مسؤول إعلانات.
// ms = الوقت من فتح الصفحة لحد الإرسال، وhpx حقل مخفي — الاتنين للحماية من البرامج (الدالة بتتجاهل الطلب من غير ما تقول)
(function () {
  var SYNC_URL = 'https://rhrrnxsgodiideqeollo.supabase.co/functions/v1/sync';
  var started = Date.now();
  var form = document.getElementById('joinForm');
  var errorBox = document.getElementById('joinError');
  var submit = document.getElementById('joinSubmit');
  if (!form) return;

  var MESSAGES = {
    role: { ar: 'اختر ما يصفك من الخيارات أعلى النموذج.', en: 'Please choose what describes you at the top of the form.' },
    name: { ar: 'اكتب اسمك.', en: 'Please enter your name.' },
    business: { ar: 'اكتب اسم نشاطك التجاري.', en: 'Please enter your business name.' },
    store: { ar: 'اكتب رابط المتجر، مثل example.com.', en: 'Please enter the store link, like example.com.' },
    country: { ar: 'اكتب البلد.', en: 'Please enter your country.' },
    platforms: { ar: 'اختر منصة واحدة على الأقل.', en: 'Please choose at least one platform.' },
    fb: { ar: 'الصق رابط حسابك الشخصي على فيسبوك، مثل facebook.com/اسمك.', en: 'Please paste your personal Facebook profile link, like facebook.com/yourname.' },
    email: { ar: 'اكتب بريدك الإلكتروني بشكل صحيح.', en: 'Please enter a valid email address.' },
    googleEmail: { ar: 'اكتب بريد Google Ads بشكل صحيح، أو اتركه فارغاً إن كان هو بريدك أعلاه.', en: 'Please enter a valid Google Ads email, or leave it empty if it\'s the one above.' },
    whatsapp: { ar: 'اكتب رقم واتساب بالأرقام مع رمز البلد، أو اتركه فارغاً.', en: 'Please enter the WhatsApp number in digits with the country code, or leave it empty.' },
    consent: { ar: 'يلزم الموافقة على شروط التجربة لإرسال الطلب.', en: 'Please agree to the pilot terms to send your request.' },
    busy: { ar: 'وصلتنا طلبات كثيرة الآن. حاول مرة أخرى بعد قليل، أو راسلنا على support@adscenter.online.', en: 'We\'re receiving a lot of requests right now. Please try again shortly, or email us at support@adscenter.online.' },
    failed: { ar: 'تعذّر إرسال الطلب الآن. حاول مرة أخرى بعد قليل، أو راسلنا على support@adscenter.online.', en: 'We couldn\'t send your request right now. Please try again shortly, or email us at support@adscenter.online.' }
  };
  var FIELD_INPUT = { role: 'jRole1', name: 'jName', business: 'jBusiness', store: 'jStore', country: 'jCountry', fb: 'jFb', email: 'jEmail', googleEmail: 'jGoogle', whatsapp: 'jWhatsapp', consent: 'jConsent' };
  var EMAIL = /^[^@\s<>"',;]{1,64}@[^@\s<>"',;]{1,190}\.[A-Za-z]{2,24}$/;

  function lang() { return document.documentElement.lang === 'en' ? 'en' : 'ar'; }
  function value(name) { var el = form.elements[name]; return el ? String(el.value || '').trim() : ''; }
  // مجموعة أزرار الاختيار (radio): القيمة المختارة، أو فاضي لو مفيش
  function role() { var c = form.querySelector('input[name="role"]:checked'); return c ? c.value : ''; }
  function platforms() {
    return Array.prototype.filter.call(form.querySelectorAll('input[name="platforms"]'), function (c) { return c.checked; })
      .map(function (c) { return c.value; });
  }

  // حقل فيسبوك وبريد Google بيظهروا مع المنصة بتاعتهم بس
  function syncPlatformFields() {
    var chosen = platforms();
    Array.prototype.forEach.call(form.querySelectorAll('[data-for]'), function (box) {
      var on = chosen.indexOf(box.getAttribute('data-for')) > -1;
      box.hidden = !on;
      var input = box.querySelector('input');
      if (input && box.getAttribute('data-for') === 'meta') input.required = on;
    });
  }

  function clearErrors() {
    errorBox.hidden = true;
    errorBox.textContent = '';
    Array.prototype.forEach.call(form.querySelectorAll('[aria-invalid]'), function (el) { el.removeAttribute('aria-invalid'); });
  }
  function showError(key) {
    var m = MESSAGES[key] || MESSAGES.failed;
    errorBox.textContent = m[lang()];
    errorBox.hidden = false;
    var input = FIELD_INPUT[key] && document.getElementById(FIELD_INPUT[key]);
    if (key === 'platforms') input = form.querySelector('input[name="platforms"]');
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.focus();
    } else errorBox.scrollIntoView({ block: 'center' });
  }

  // نفس قواعد الدالة تقريباً — اللي يعدّي هنا ويترفض هناك بيظهر بنفس الرسالة
  function firstProblem() {
    var chosen = platforms();
    if (!role()) return 'role';
    if (!value('name')) return 'name';
    if (!value('business')) return 'business';
    if (!/\.[^.\s]{2,}/.test(value('store'))) return 'store';
    if (value('country').length < 2) return 'country';
    if (!chosen.length) return 'platforms';
    if (chosen.indexOf('meta') > -1 && !/(facebook\.com|fb\.com)\/.+|^@?[A-Za-z0-9.]{3,80}$/i.test(value('fb'))) return 'fb';
    if (!EMAIL.test(value('email'))) return 'email';
    if (chosen.indexOf('google') > -1 && value('googleEmail') && !EMAIL.test(value('googleEmail'))) return 'googleEmail';
    if (value('whatsapp') && value('whatsapp').replace(/[^\d٠-٩۰-۹]/g, '').length < 6) return 'whatsapp';
    if (!form.elements.consent.checked) return 'consent';
    return null;
  }

  function busy(on) {
    submit.disabled = on;
    submit.classList.toggle('is-busy', on);
  }
  function done() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-join-state]'), function (el) {
      el.hidden = el.getAttribute('data-join-state') !== 'done';
    });
    var box = document.getElementById('joinDone');
    window.scrollTo(0, 0);
    if (box) box.focus();
  }

  form.addEventListener('change', function (e) {
    if (e.target && e.target.name === 'platforms') syncPlatformFields();
    // الغلط متعلّم على أول اختيار بس، فأي اختيار في المجموعة بيشيله
    if (e.target && e.target.name === 'role' && form.querySelector('input[name="role"][aria-invalid]')) clearErrors();
  });
  form.addEventListener('input', function (e) {
    if (e.target && e.target.getAttribute('aria-invalid')) clearErrors();
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearErrors();
    var problem = firstProblem();
    if (problem) { showError(problem); return; }
    var chosen = platforms();
    var body = {
      action: 'join', lang: lang(), role: role(), name: value('name'), business: value('business'), store: value('store'), country: value('country'),
      platforms: chosen, fb: chosen.indexOf('meta') > -1 ? value('fb') : '', email: value('email'),
      googleEmail: chosen.indexOf('google') > -1 ? value('googleEmail') : '', whatsapp: value('whatsapp'),
      consent: form.elements.consent.checked, hp: value('hpx'), ms: Date.now() - started
    };
    busy(true);
    fetch(SYNC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          busy(false);
          if (r.ok) { done(); return; }
          if (r.status === 400 && j && j.field) showError(j.field);
          else showError(r.status === 429 ? 'busy' : 'failed');
        });
      })
      .catch(function () { busy(false); showError('failed'); });
  });

  syncPlatformFields();
})();
