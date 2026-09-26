// =====================================================================
// Ads Center — حركة وتجربة صفحات الموقع العامة (الرئيسية، الدليل، الصفحات القانونية، 404)
// =====================================================================
// كله تحسين إضافي: لو الملف ده ماتحمّلش، كل المحتوى ظاهر والصفحات شغالة عادي.
//  ١. ظهور تدريجي للعناصر وهي داخلة الشاشة (.rv → .is-in) — العناصر الظاهرة أول ما الصفحة تفتح مبتستخباش
//     (عشان ميحصلش وميض)، ومع «تقليل الحركة» مفيش إخفاء خالص
//  ٢. ظل للشريط العلوي أول ما الصفحة تنزل (html.is-scrolled)
//  ٣. قائمة الموبايل في الرئيسية ([data-menu-toggle])
//  ٤. تمييز القسم الحالي في قائمة الرئيسية وأنت نازل
//  ٥. شريط تقدّم القراءة (صفحات .legal بس) + زرار «لأعلى الصفحة»
//  ٦. فهرس تلقائي للصفحات القانونية الطويلة (٥ عناوين أو أكتر ومفيهاش .toc)
(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  // ---------- ٦. الفهرس التلقائي (قبل الظهور التدريجي عشان يتحسب معاه) ----------
  each(document.querySelectorAll('article.doc'), function (art) {
    if (art.querySelector('.toc')) return;
    var heads = art.querySelectorAll(':scope > h2');
    if (heads.length < 5) return;
    var ar = (art.getAttribute('lang') || root.lang) !== 'en';
    var nav = document.createElement('nav');
    nav.className = 'doc-toc';
    nav.setAttribute('aria-label', ar ? 'المحتويات' : 'Contents');
    var title = document.createElement('p');
    title.className = 'doc-toc-title';
    title.textContent = ar ? 'المحتويات' : 'Contents';
    var ol = document.createElement('ol');
    each(heads, function (h, k) {
      if (!h.id) h.id = (ar ? 'ar' : 'en') + '-s' + (k + 1);
      var li = document.createElement('li'), a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent.trim();
      li.appendChild(a);
      ol.appendChild(li);
    });
    nav.appendChild(title);
    nav.appendChild(ol);
    heads[0].parentNode.insertBefore(nav, heads[0]);
  });

  // ---------- ١. الظهور التدريجي ----------
  var REVEAL = '.section-head, .grid > *, .trust > li, .section > .fine, .faq > details, .join-band, .doc > section, .doc-toc';
  if (!reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      var k = 0;
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        // العناصر اللي بتظهر مع بعض بتيجي ورا بعض (٩٠ms)، واللي بتظهر لوحدها من غير تأخير
        e.target.style.setProperty('--rv-d', Math.min(k++, 5) * 90 + 'ms');
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -6% 0px' });
    var fold = window.innerHeight;
    each(document.querySelectorAll(REVEAL), function (el) {
      if (el.getBoundingClientRect().top < fold) return; // ظاهر من الأول: يفضل زي ما هو
      el.classList.add('rv');
      io.observe(el);
    });
    root.classList.add('has-reveal');
  }

  // ---------- ٢ + ٥. التمرير: ظل الشريط، شريط التقدّم، زرار «لأعلى» ----------
  var progress = null, toTop = document.createElement('button');
  if (document.querySelector('main.legal')) {
    progress = document.createElement('div');
    progress.className = 'scroll-progress';
    progress.setAttribute('aria-hidden', 'true');
    document.body.appendChild(progress);
  }
  toTop.type = 'button';
  toTop.className = 'to-top';
  toTop.innerHTML = '<span aria-hidden="true">↑</span><span class="sr-only"><span class="only-ar">العودة إلى أعلى الصفحة</span><span class="only-en">Back to top</span></span>';
  toTop.tabIndex = -1;
  document.body.appendChild(toTop);
  toTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    var first = document.querySelector('.site-brand, .legal-brand');
    if (first) first.focus({ preventScroll: true });
  });

  var ticking = false;
  function onScroll() {
    ticking = false;
    var y = window.scrollY || window.pageYOffset;
    root.classList.toggle('is-scrolled', y > 8);
    var show = y > 700;
    if (toTop.classList.contains('is-visible') !== show) {
      toTop.classList.toggle('is-visible', show);
      toTop.tabIndex = show ? 0 : -1;
    }
    if (progress) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0) + ')';
    }
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  // ---------- ٣. قائمة الموبايل ----------
  var bar = document.querySelector('.site-bar');
  var toggle = document.querySelector('[data-menu-toggle]');
  var nav = document.getElementById('siteNav');
  if (bar && toggle && nav) {
    var setMenu = function (open) {
      bar.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    toggle.addEventListener('click', function () { setMenu(!bar.classList.contains('menu-open')); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('click', function (e) { if (!bar.contains(e.target)) setMenu(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && bar.classList.contains('menu-open')) { setMenu(false); toggle.focus(); }
    });
    // لو الشاشة كبرت والقائمة مفتوحة
    var wide = window.matchMedia('(min-width: 861px)');
    var close = function () { if (wide.matches) setMenu(false); };
    if (wide.addEventListener) wide.addEventListener('change', close); else if (wide.addListener) wide.addListener(close);
  }

  // ---------- ٤. القسم الحالي في القائمة ----------
  if (nav && 'IntersectionObserver' in window) {
    var links = {};
    each(nav.querySelectorAll('a[href^="#"]'), function (a) { links[a.getAttribute('href').slice(1)] = a; });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var a = links[e.target.id];
        if (!a) return;
        if (e.isIntersecting) {
          each(nav.querySelectorAll('a.is-current'), function (x) { x.classList.remove('is-current'); x.removeAttribute('aria-current'); });
          a.classList.add('is-current');
          a.setAttribute('aria-current', 'location');
        } else if (a.classList.contains('is-current')) {
          a.classList.remove('is-current');
          a.removeAttribute('aria-current');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(links).forEach(function (id) { var s = document.getElementById(id); if (s) spy.observe(s); });
  }
})();
