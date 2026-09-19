// =====================================================================
// Ads Control Center — طلب الانضمام للتجربة المغلقة
// =====================================================================
// في التجربة المغلقة Meta وGoogle بيسمحوا بالربط بس للناس اللي بنضيفهم بالاسم
// (Tester على تطبيق Meta، وTest user على Google). عشان كده:
//   - أي رابط عليه data-join بيفتح إيميل جاهز فيه البيانات اللي محتاجينها عشان نضيف العميل
//   - أي زرار عليه data-join-copy بينسخ نفس الرسالة — للي معندوش برنامج إيميل على الكمبيوتر،
//     يلصقها في Gmail أو واتساب
// الملف مستقل عن باقي ملفات الأداة: بيشتغل في الأداة وفي الصفحة الرئيسية ودليل البداية،
// واللغة بياخدها من <html lang> وقت الضغط (فلو المستخدم بدّل اللغة، الرسالة بتتبعت باللغة الجديدة).
(function (global) {
  var JOIN = {
    email: 'walid.elazab20@gmail.com',
    subject: {
      ar: 'طلب انضمام لتجربة Ads Control Center',
      en: 'Request to join the Ads Control Center pilot'
    },
    // موافقة المختبِر مكتوبة في آخر الرسالة: Meta بتشترط اتفاق مع أي حد بنضيفه Tester (بند «برنامج التجربة» في الشروط)
    lines: {
      ar: [
        'الاسم:',
        'اسم النشاط:',
        'البلد:',
        'المنصات اللي بتعلن عليها (Meta / Google Ads / Snapchat / TikTok):',
        'لو هتربط Meta — رابط حسابك الشخصي على فيسبوك (اللي بتدخل بيه على مدير الإعلانات):',
        'لو هتربط Google Ads — الإيميل اللي بتدخل بيه على Google Ads:',
        'رقم واتساب (اختياري):',
        '',
        'بإرسال الطلب ده، أوافق على الانضمام للتجربة كمختبِر للأداة حسب بند «برنامج التجربة» في شروط الاستخدام: {terms}'
      ],
      en: [
        'Name:',
        'Business name:',
        'Country:',
        'Platforms you advertise on (Meta / Google Ads / Snapchat / TikTok):',
        'If connecting Meta — your personal Facebook profile link (the one you use for Ads Manager):',
        'If connecting Google Ads — the email you use to sign in to Google Ads:',
        'WhatsApp number (optional):',
        '',
        'By sending this request, I agree to join the pilot as a tester of the tool under the "Pilot program" section of the terms of use: {terms}'
      ]
    }
  };

  function lang() { return document.documentElement.lang === 'en' ? 'en' : 'ar'; }
  function termsUrl(l) { return location.origin + '/terms' + (l === 'en' ? '#pilot-en' : '#pilot'); }

  JOIN.body = function (l) {
    l = l || lang();
    return JOIN.lines[l].join('\n').replace('{terms}', termsUrl(l)) + '\n';
  };
  JOIN.href = function (l) {
    l = l || lang();
    return 'mailto:' + JOIN.email + '?subject=' + encodeURIComponent(JOIN.subject[l]) + '&body=' + encodeURIComponent(JOIN.body(l));
  };
  // النص اللي بيتنسخ: فيه الإيميل والعنوان كمان، عشان يتلصق في أي مكان ويبقى كامل
  JOIN.text = function (l) {
    l = l || lang();
    var to = l === 'en' ? 'To: ' : 'إلى: ';
    var subj = l === 'en' ? 'Subject: ' : 'الموضوع: ';
    return to + JOIN.email + '\n' + subj + JOIN.subject[l] + '\n\n' + JOIN.body(l);
  };

  // الطريقة القديمة: بتشتغل في متصفحات كتير الـ Clipboard API فيها مقفول (زي متصفح فيسبوك وإنستجرام الداخلي)
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var done = false;
    try { done = document.execCommand('copy'); } catch (e) { /* مش مدعوم */ }
    ta.remove();
    return done;
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText && global.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () {
        if (!legacyCopy(text)) throw new Error('copy failed');
      });
    }
    return legacyCopy(text) ? Promise.resolve() : Promise.reject(new Error('copy failed'));
  }
  // لو النسخ فشل خالص: الرسالة بتظهر في مربع تحت الزراير، متعلّم عليها، والعميل ينسخها بإيده
  function showText(el) {
    var row = el.parentNode;
    var box = row.nextElementSibling && row.nextElementSibling.classList.contains('join-text') ? row.nextElementSibling : null;
    if (!box) {
      box = document.createElement('textarea');
      box.className = 'join-text';
      box.setAttribute('readonly', '');
      box.setAttribute('dir', 'auto');
      row.parentNode.insertBefore(box, row.nextSibling);
    }
    box.value = JOIN.text();
    box.rows = box.value.split('\n').length + 1;
    box.focus();
    box.select();
  }

  function refreshLinks(root) {
    var href = JOIN.href();
    Array.prototype.forEach.call((root || document).querySelectorAll('a[data-join]'), function (a) { a.setAttribute('href', href); });
  }

  // الرابط بيتحدّث لحظة الضغط (قبل ما المتصفح يفتحه) — عشان يبقى دايماً بلغة الصفحة الحالية
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-join], [data-join-copy]') : null;
    if (!el) return;
    if (el.hasAttribute('data-join')) { el.setAttribute('href', JOIN.href()); return; }
    copyText(JOIN.text()).then(function () {
      el.classList.remove('copy-failed');
      el.classList.add('copied');
    }, function () {
      el.classList.remove('copied');
      el.classList.add('copy-failed');
      showText(el);
    }).then(function () {
      clearTimeout(el.__joinTimer);
      el.__joinTimer = setTimeout(function () { el.classList.remove('copied', 'copy-failed'); }, 3000);
    });
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { refreshLinks(); });
  else refreshLinks();
  // زرار اللغة (في الأداة أو في الصفحات) بيغيّر <html lang> — فالروابط بتتحدّث معاه على طول
  if (global.MutationObserver) {
    new MutationObserver(function () { refreshLinks(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }

  JOIN.refreshLinks = refreshLinks;
  global.ACC_JOIN = JOIN;
})(window);
