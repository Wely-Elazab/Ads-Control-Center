// =====================================================================
// Ads Center — التشغيل
// =====================================================================
// آخر ملف بيتحمّل: بيكمّل تسجيل الدخول لو راجعين من Snapchat/TikTok، وبيسترجع الجلسة، وبيرسم الصفحة.
// الملفات بتتحمّل بالترتيب ده وبتتشارك نفس النطاق العام (من غير bundler):
//   i18n → alerts → core → meta → google → snapchat → tiktok → ui → main
// أي كود بيتنفّذ وقت التحميل مسموحله يستخدم اللي في الملفات اللي قبله بس — الباقي جوه دوال.

  // استرجاع الجلسة بعد reload أو بعد الرجوع من Snapchat/TikTok.
  // بيشتغل بشكل متزامن هنا في آخر السكربت — قبل ما أي رد async (زي تبديل كود Snapchat) يحفظ حاجة جديدة.
  // pending = منصات لسه راجعين منها بكود دخول جديد — جلستها القديمة المنتهية مش «انتهت»، هي بتتجدد دلوقتي
  function restoreSession(saved, pending) {
    if (!saved) return;
    pending = pending || {};
    var obj = function (v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
    var savedInfo = obj(saved.accountInfo), savedTokens = obj(saved.tokens), savedOptions = obj(saved.options);
    Object.keys(savedInfo).forEach(function (k) { accountInfo[k] = savedInfo[k]; });

    // جلسة منتهية والربط محفوظ على الجهاز = مش «انتهت»: أول تحميل بيجددها بهدوء (markExpired في ui.js)
    var expired = [];
    Object.keys(savedTokens).forEach(function (p) {
      if (validToken(savedTokens[p])) sessionTokens[p] = savedTokens[p];
      // Meta مش هنا: مكتبة فيسبوك أو الربط المحفوظ هما اللي بيقرروا (metaResume تحت)
      else if (p !== 'meta' && !pending[p] && !sealedFor(p)) expired.push(p);
    });
    googleAccessToken = googleAccessToken || validToken(sessionTokens.google);
    snapchatAccessToken = snapchatAccessToken || validToken(sessionTokens.snapchat);
    tiktokAccessToken = tiktokAccessToken || validToken(sessionTokens.tiktok);

    // Meta: الـ SDK هو اللي يقرر لو الجلسة لسه شغّالة، فبنتأكد منه قبل ما نعرض حساباتها
    var hasSession = function (p) { return p === 'meta' || !!sessionTokens[p] || !!sealedFor(p); };
    Object.keys(savedOptions).forEach(function (p) {
      if (hasSession(p) && Array.isArray(savedOptions[p])) setPlatformOptions(p, savedOptions[p]);
    });

    var active = obj(saved.active);
    Object.keys(active).forEach(function (p) {
      if (!hasSession(p)) return;
      if (p !== 'meta') {
        activeSources[p] = active[p];
        accountSelect.value = active[p]; // القائمة تفضل مطابقة للحساب المعروض فعلاً
        loadSource(p, active[p]);
        return;
      }
      activeSources.meta = active.meta;
      // المكتبة اتمنعت قبل ما نوصل هنا — كارت خطأ واضح بدل جلسة معلّقة
      if (fbSdkFailed) { onFbSdkFailed(); return; }
      // بنعيد قراءة بيانات الحساب (الحالة وحد الصرف) بدل ما نعتمد على المحفوظ من جلسة قديمة —
      // حساب اتحل عنده مشكلة الدفع كان هيفضل ظاهر إن إعلاناته كلها متوقفة
      metaResume(function () { loadAdAccounts(active.meta); }, function () {
        delete activeSources.meta;
        setPlatformOptions('meta', []);
        markExpired('meta');
      });
    });
    saveSession();

    if (expired.length) {
      // كارت «انتهت الجلسة» لكل منصة فيها زرار «ربط تاني» — بيرجّعك على نفس الحساب
      expired.forEach(function (p) { setPlatformState(p, { kind: 'expired' }); });
      setStatus(msg('s.sessionExpired', { list: function () { return expired.map(function (p) { return PLATFORM_NAMES[p] || p; }).join(t('join.and')); } }),
        { reconnect: expired[0] });
    }
  }

  // الرجوع من Google/Snapchat/TikTok (?code=...) لازم يتعالج الأول — بعدها استرجاع الجلسة المتزامن،
  // قبل ما أي رد async (زي تبديل كود الدخول) يحفظ جلسة جديدة فوق القديمة
  var pendingRedirects = { google: checkGoogleRedirect(), snapchat: checkSnapchatRedirect(), tiktok: checkTikTokRedirect() };
  restoreSession(savedSession, pendingRedirects);

  // تاب جديد (أو الأداة اتفتحت من اختصار على الهاتف): التاب مفيهوش جلسة، بس الربط محفوظ على الجهاز —
  // نفس مسار الجلسة المنتهية: تجديد بهدوء، وبعده آخر حساب اختاره العميل، من غير شاشة «اربط حسابك»
  ['google', 'snapchat'].forEach(function (p) {
    if (!pendingRedirects[p] && !isConnected(p) && sealedFor(p)) markExpired(p);
  });
  // وMeta في تاب جديد: لو العميل كان رابطها ومعملش «فصل» (آخر حساب لسه محفوظ — «فصل» بيمسحه): الربط المحفوظ على
  // الجهاز الأول، وبعده مكتبة فيسبوك. نجح = نفس الحساب على طول. غير كده بتفضل شاشة «اربط حسابك» زي الأول، من غير رسالة خطأ
  autoReconnectMeta();
  function autoReconnectMeta() {
    var last = lastAccounts.meta;
    if (!last || isConnected('meta') || fbSdkFailed) return;
    // التجديد بياخد ثانية: «جارٍ تجديد الجلسة» بدل شاشة «اربط حسابك» اللي كانت بتوحي إن الحساب اتفصل
    var hadLink = !!sealedFor('meta');
    if (hadLink) { setLoading('meta', true, msg('s.renewing', { platform: PLATFORM_NAMES.meta })); render(); }
    metaResume(function () {
      if (isConnected('meta')) return;
      activeSources.meta = last;
      loadAdAccounts(last);
    }, function () {
      if (!hadLink) return;
      // كان محفوظ ومبقاش ينفع (انتهت الـ ٦٠ يوم، أو اتلغى من فيسبوك): «انتهت الجلسة» بزرار «ربط تاني» —
      // أصدق من شاشة «اربط حسابك» الفاضية
      setLoading('meta', false);
      expireNow('meta');
    });
  }
  // Meta بعد فتح الأداة من جديد: الربط المحفوظ على الجهاز (بيشتغل على الهاتف)، وبعده جلسة مكتبة فيسبوك (اللابتوب —
  // ولو اشتغلت والربط مش محفوظ، بنحفظه دلوقتي). onOk = فيه مفتاح شغّال، onFail = لازم ربط
  function metaResume(onOk, onFail) {
    var tryFb = function () {
      if (fbSdkFailed) { onFail(); return; }
      whenFbReady(function () {
        FB.getLoginStatus(function (resp) {
          if (!resp || resp.status !== 'connected') { onFail(); return; }
          if (!sealedFor('meta') && resp.authResponse) keepMetaLink(resp.authResponse.accessToken);
          onOk();
        });
      });
    };
    // reload لنفس التاب: المفتاح لسه في جلسة التاب
    if (validToken(sessionTokens.meta)) { onOk(); return; }
    if (sealedFor('meta')) renewSession('meta').then(function (ok) { if (ok) onOk(); else tryFb(); });
    else tryFb();
  }
  probeGoogleCodeFlow();

  render();
