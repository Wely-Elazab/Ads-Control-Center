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
    Object.keys(saved.accountInfo || {}).forEach(function (k) { accountInfo[k] = saved.accountInfo[k]; });

    var expired = [];
    Object.keys(saved.tokens || {}).forEach(function (p) {
      if (validToken(saved.tokens[p])) sessionTokens[p] = saved.tokens[p];
      else if (!pending[p]) expired.push(p);
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
      // المكتبة اتمنعت قبل ما نوصل هنا — كارت خطأ واضح بدل جلسة معلّقة
      if (fbSdkFailed) { onFbSdkFailed(); return; }
      whenFbReady(function () {
        FB.getLoginStatus(function (resp) {
          // بنعيد قراءة بيانات الحساب (الحالة وحد الصرف) بدل ما نعتمد على المحفوظ من جلسة قديمة —
          // حساب اتحل عنده مشكلة الدفع كان هيفضل ظاهر إن إعلاناته كلها متوقفة
          if (resp && resp.status === 'connected') { loadAdAccounts(active.meta); return; }
          delete activeSources.meta;
          setPlatformOptions('meta', []);
          markExpired('meta');
        });
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

  // الرجوع من Snapchat/TikTok (?code=...) لازم يتعالج الأول — بعدها استرجاع الجلسة المتزامن،
  // قبل ما أي رد async (زي تبديل كود الدخول) يحفظ جلسة جديدة فوق القديمة
  var pendingRedirects = { snapchat: checkSnapchatRedirect(), tiktok: checkTikTokRedirect() };
  restoreSession(savedSession, pendingRedirects);

  render();
