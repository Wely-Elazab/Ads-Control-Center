// =====================================================================
// Ads Center — Meta (فيسبوك وإنستغرام)
// =====================================================================
// تسجيل الدخول، الحسابات الإعلانية، تحميل الإعلانات والأرقام، الصور بجودتها الأصلية، وحالة التشغيل.
// الملفات بتتحمّل بالترتيب ده وبتتشارك نفس النطاق العام (من غير bundler):
//   i18n → alerts → core → meta → google → snapchat → tiktok → ui → main
// أي كود بيتنفّذ وقت التحميل مسموحله يستخدم اللي في الملفات اللي قبله بس — الباقي جوه دوال.

  // !!! هام: ده الـ App ID بتاع تطبيقك في Meta for Developers — لو غيّرت التطبيق عدّله هنا !!!
  var META_APP_ID = "2950488078638871";
  // إصدار Marketing API: Meta بتقفل كل إصدار بعد حوالي سنة (مش سنتين زي Graph API العادي).
  // الإصدار المقفول بيتحوّل لوحده لأقدم إصدار شغّال — ولو الطلب اتغيّر فيه بيفشل فجأة.
  // v21 كان انتهى وكانت الطلبات شغّالة بالتحويل ده. v26 صدر ٢٩ يوليو ٢٠٢٦ — راجع التاريخ ده كل ٦ شهور:
  // https://developers.facebook.com/documentation/ads-commerce/marketing-api/marketing-api-changelog
  var GRAPH_VERSION = 'v26.0';

  // ---------- Facebook SDK ----------
  // أي كود محتاج FB قبل ما الـ SDK يخلص تحميل (زي استرجاع الجلسة) بيستنى هنا
  var fbReadyQueue = [];
  function whenFbReady(cb) { if (fbReadyQueue) fbReadyQueue.push(cb); else cb(); }
  // مكتبة فيسبوك ممكن تتمنع (إضافة حجب إعلانات، متصفح Brave، حماية التتبّع) — من غير ده العميل كان بيشوف
  // «ما زالت المكتبة قيد التحميل» على طول، والجلسة المحفوظة كانت بتفضل معلّقة من غير أي رسالة
  var fbSdkFailed = false;
  function onFbSdkFailed() {
    fbSdkFailed = true;
    fbReadyQueue = [];
    if (activeSources.meta) {
      setPlatformState('meta', { kind: 'error', msg: msg('s.metaSdkBlocked') });
      setStatus(msg('s.metaSdkBlocked'));
      if (typeof render === 'function') render();
    }
  }
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
    js.onerror = onFbSdkFailed;
    fjs.parentNode.insertBefore(js, fjs);
  }(document, 'script', 'facebook-jssdk'));

  function loginWithMeta() {
    if (typeof FB === 'undefined') {
      setStatus(msg(fbSdkFailed ? 's.metaSdkBlocked' : 's.metaSdkLoading'));
      return;
    }
    setStatus(msg('s.metaOpening'));
    // ads_read بس: الأداة للقراءة فقط. business_management اتشالت لأنها فيها صلاحية كتابة على أصول البزنس
    // ومش مستخدمة في أي طلب. لو حساب إعلاني تابع لـ Business Manager مظهرش بعد الشيل، ده السبب
    FB.login(function (response) {
      if (response.authResponse) { loadAdAccounts(); }
      // من غير authResponse = النافذة اتقفلت من غير دخول. في التجربة المغلقة ده غالباً بعد رسالة «App not active»
      // (الحساب مش Tester لسه)، فبنقول السبب وبنظهر رابط الخطوات وطلب الانضمام
      else { setStatus(msg('s.metaCancelled'), { help: 'meta' }); }
    }, { scope: 'ads_read' });
  }

  var META_ACCOUNT_FIELDS = 'id,name,account_status,timezone_name,currency,spend_cap,amount_spent';

  // خطأ 190 (أو 102) = جلسة فيسبوك انتهت أو اتلغت — العميل محتاج يربط تاني بس، مش عطل
  function isMetaAuthError(err) { return !!err && (Number(err.code) === 190 || Number(err.code) === 102); }
  // أكواد Meta المعروفة بتترجم لرسالة مفهومة بلغة الواجهة (بدل "(#17) User request limit reached" بالإنجليزي)
  var META_RATE_CODES = { 4: 1, 17: 1, 32: 1, 613: 1, 80000: 1, 80001: 1, 80002: 1, 80003: 1, 80004: 1, 80005: 1, 80006: 1, 80008: 1, 80009: 1, 80014: 1 };
  function isMetaRateLimit(err) { return !!err && !!META_RATE_CODES[Number(err.code)]; }
  function metaErrorText(err) {
    var code = err ? Number(err.code) : null;
    return function () {
      if (META_RATE_CODES[code]) return t('err.rateLimit');
      if (code === 10 || (code >= 200 && code <= 299)) return t('err.permission');
      return (err && err.message) || t('s.unexpected');
    };
  }

  // بيحمّل *كل* الحسابات الإعلانية مش أول صفحة بس (Meta بترجّع ٢٥ حساب في الصفحة افتراضياً)
  function loadAdAccounts(onlyRefreshId) {
    setStatus(msg('s.metaAccountsLoading'));
    fetchAllPages('/me/adaccounts', { fields: META_ACCOUNT_FIELDS, limit: 100 }, FULL_SCAN_CAP, function (err, data) {
      if (err) {
        if (isMetaAuthError(err)) { markExpired('meta'); return; }
        var failMsg = isMetaRateLimit(err) ? metaErrorText(err) : msg('s.metaAccountsFailed');
        setPlatformState('meta', { kind: 'error', msg: failMsg });
        setStatus(failMsg);
        render();
        return;
      }
      if (!data || !data.length) {
        setPlatformState('meta', { kind: 'noAccounts', msg: msg('s.metaNoAccounts') });
        setStatus(msg('s.metaNoAccounts'));
        render();
        return;
      }
      data.forEach(function (a) {
        accountInfo['meta:' + a.id] = {
          timeZone: a.timezone_name || null, currency: a.currency || null,
          accountStatus: a.account_status, spendCap: a.spend_cap || null, amountSpent: a.amount_spent || null
        };
      });
      setPlatformOptions('meta', data.map(function (a) { return { value: a.id, label: 'Meta — ' + a.name }; }));
      document.getElementById('tConnectTitle').textContent = t('title.metaConnected');
      // بعد استرجاع الجلسة بنحدّث بيانات الحساب (حالته وحد الصرف) الأول، وبعدين نحمّل نفس الحساب المحفوظ.
      // غير كده: آخر حساب اختاره العميل ← أول حساب شغّال (account_status = 1) — مش أول حساب في القايمة
      // (كان ممكن يبقى حساب مقفول من سنين، فالعميل يلاقي الأداة فاضية)
      var target = (onlyRefreshId && accountInfo['meta:' + onlyRefreshId]) ? onlyRefreshId
        : pickAccount('meta', data, function (a) { return Number(a.account_status) === 1; });
      accountSelect.value = target;
      loadAdsForAccount(target);
    });
  }

  // الإعلانات بتتسحب على دفعتين بالتوازي: الشغّالة (أو اللي عليها ملاحظة) من غير حد عملي، والمتوقفة لحد معيّن.
  // وبعد ما أرقام الصرف توصل، أي إعلان صرف في الفترة ومكانش في الدفعتين بيتسحب بالـ ID —
  // فمهما كان الحساب كبير، مفيش إعلان شغّال أو صرف بيضيع (قبل كده كان فيه حد ٨٠٠ إعلان لكل الحساب)
  var LIVE_STATUSES = ['ACTIVE', 'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW', 'DISAPPROVED', 'PREAPPROVED', 'PENDING_BILLING_INFO'];
  var STOPPED_STATUSES = ['PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED'];
  var LIVE_ADS_CAP = 5000;      // حد أمان بس — حساب فيه أكتر من كده إعلان شغّال في نفس الوقت نادر جداً
  var PAGE_SAFETY_CAP = 800;    // الإعلانات المتوقفة: كفاية لكل الحسابات العادية
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
  // أرقام الإعلانات مع "results" = رقم Meta نفسها لعمود Results في Ads Manager (بنفس إعدادات الإحالة).
  // لو الحقل ده اترفض لأي سبب، بنعيد الطلب من غيره ونرجع لطريقتنا (نوع النتيجة من هدف المجموعة)
  function insightsPromise(accountId, params) {
    var withResults = {};
    for (var k in params) withResults[k] = params[k];
    withResults.fields = params.fields + ',results';
    return fbPagesPromise('/' + accountId + '/insights', withResults, FULL_SCAN_CAP).then(function (res) {
      return res.err ? fbPagesPromise('/' + accountId + '/insights', params, FULL_SCAN_CAP) : res;
    });
  }
  // طلبات مجمّعة (Batch): لحد ٥٠ عنصر برقمه في طلب واحد. Meta لغت ?ids= من v26.0
  // («The ids query parameter is deprecated») — فالطريقة القديمة كانت بتفشل في صمت.
  // query = الحقول بصيغة ?fields=... — بيرجّع قائمة العناصر اللي رجعت (الفاشل بيتشال)
  function graphBatch(ids, query, onDone) {
    var out = [], chunks = [];
    for (var i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
    (function next(i) {
      if (i >= chunks.length) { onDone(out); return; }
      var batch = chunks[i].map(function (id) { return { method: 'GET', relative_url: encodeURIComponent(id) + '?' + query }; });
      FB.api('/', 'POST', { batch: JSON.stringify(batch), include_headers: false }, function (resp) {
        if (Array.isArray(resp)) {
          resp.forEach(function (r) {
            if (!r || r.code !== 200) return;
            try { var item = JSON.parse(r.body); if (item && item.id) out.push(item); } catch (e) { /* رد مش JSON — بنتجاهله */ }
          });
        }
        next(i + 1);
      });
    })(0);
  }
  // تكملة: إعلانات صرفت في الفترة ومكانتش في الدفعات اللي اتسحبت (اتحذفت أو اتأرشفت بعد ما صرفت،
  // أو في حساب أكبر من الحد) — بنجيبها برقمها عشان صرفها يتحسب في الإجمالي
  function fetchMetaAdsByIds(ids, fields, onDone) {
    graphBatch(ids, 'fields=' + encodeURIComponent(fields), onDone);
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
    // لو حساب مختلف: إعلانات الحساب القديم بتتشال فوراً (مش بتفضل ظاهرة لو الجديد فاضي أو فشل)
    selectSource('meta', accountId);
    var fail = function (m) {
      setPlatformState('meta', { kind: 'error', msg: m });
      setLoading('meta', false, m);
      render();
    };

    // لو الحساب اتفتح قبل كده: النسخة المحفوظة بتفضل ظاهرة لحد ما الأرقام الجديدة توصل
    // (قبل كده كانت بتتبدّل بكروت أرقامها صفر لحد ما الأرقام توصل)
    var cachedShown = showCachedWhileLoading(source, 'Meta');
    setLoading('meta', true, msg('s.loadingAds', { platform: 'Meta' }));

    // الإعلانات على دفعتين مستقلتين: الشغّالة (أو اللي عليها ملاحظة) بتظهر أول ما توصل، والمتوقفة في الخلفية.
    // قياس على حساب حقيقي (٢٥ شغّال و٦١٨ متوقف): الشغّالة ~٢ ثانية والأرقام ~٨، والمتوقفة ~٦٦ ثانية
    // (بيانات التصميم عند Meta تقيلة) — قبل كده الشاشة كلها كانت بتستنى المتوقفة دقيقة كاملة.
    // الإعلانات المتوقفة اللي صرفت في الفترة مش بتستنى الدفعة دي: fillMissing بتجيبها بالرقم مع الأرقام
    var liveAdsP = adsPromise(accountId, { effective_status: JSON.stringify(LIVE_STATUSES) }, LIVE_ADS_CAP);
    var stoppedP = adsPromise(accountId, { effective_status: JSON.stringify(STOPPED_STATUSES) }, PAGE_SAFETY_CAP)
      .catch(function (e) { return { err: e || { message: 'failed' }, data: [] }; });
    // لو Meta رفضت فلتر الحالة: طلب واحد لكل الإعلانات (زي الأول)، والمتوقفة جوّاه
    var adsP = liveAdsP.then(function (res) {
      if (!res.err) return res;
      return adsPromise(accountId, {}, PAGE_SAFETY_CAP).then(function (all) { all.all = true; return all; });
    });
    var adsetsP = new Promise(function (resolve) { loadAdsetStatusMap(accountId, resolve); });
    var dailyP = insightsPromise(accountId, {
      level: 'ad', time_increment: 1, time_range: timeRange,
      fields: 'ad_id,date_start,spend,actions,action_values', limit: 500
    });
    // تكرار الظهور لازم يتحسب على الأسبوع كله مرة واحدة — مينفعش نجمعه من أرقام يومية،
    // لأن نفس الشخص ممكن يتكرر في أكتر من يوم. فشل الطلب ده مش بيوقف التحميل
    var reachP = fbPagesPromise('/' + accountId + '/insights', {
      level: 'ad', time_range: timeRange, fields: 'ad_id,frequency,reach,impressions', limit: 500
    }, FULL_SCAN_CAP);
    // مجاميع الفترة المختارة (صف واحد لكل إعلان) — بيتبعت بالتوازي مع الباقي، ومش محتاج لو الفترة آخر ٧ أيام
    var pr = resolvePeriodFor(info.timeZone || BROWSER_TZ);
    var periodP = pr.isDefault ? Promise.resolve(null) : insightsPromise(accountId, {
      level: 'ad', time_range: JSON.stringify({ since: pr.since, until: pr.until }),
      fields: 'ad_id,spend,actions,action_values', limit: 500
    });

    var order = [], adsById = {}, adsTruncated = false, adFields = null;
    var allInOne = false, stoppedUsed = false, stoppedFailed = false;
    var add = function (ad) { if (ad && ad.id && !adsById[ad.id]) { adsById[ad.id] = ad; order.push(ad.id); return true; } return false; };
    var applyImages = function () {
      if (!live()) return;
      var changed = false;
      candidates.forEach(function (c) {
        var ad = c.platform === 'Meta' && adsById[c.id];
        if (ad && ad._fullImage && c.thumbUrl !== ad._fullImage) { c.thumbUrl = ad._fullImage; changed = true; }
      });
      if (changed) render();
    };
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
      if (ads.err) {
        if (isMetaAuthError(ads.err)) markExpired('meta');
        else fail(msg('s.adsFailed', { platform: 'Meta', msg: metaErrorText(ads.err) }));
        return null;
      }
      adsTruncated = ads.truncated;
      adFields = ads.fields;
      allInOne = !!ads.all;
      ads.data.forEach(add);
      var showFirst = function (list) {
        if (!order.length) {
          setPlatformState('meta', { kind: 'empty' });
          setLoading('meta', false, msg('s.noAdsMeta'));
          render();
          return null;
        }
        // لو فيه نسخة محفوظة ظاهرة بأرقامها منبدّلهاش بكروت من غير أرقام
        if (!cachedShown) { mergeCandidates(build(null, null, adsetStatusMap), source); render(); }
        setLoading('meta', true, msg('s.metaShown', { n: order.length, ads: function () { return noun(order.length, 'n.ad'); } }));
        // الصور الأصلية بتتحمّل بالتوازي، وأول ما توصل بنحدّث الكروت
        resolveMetaImages(accountId, list, applyImages);
        return adsetStatusMap;
      };
      // مفيش ولا إعلان شغّال: نستنى المتوقفة قبل ما نقول «الحساب مفيهوش إعلانات»
      if (!order.length && !allInOne) {
        return stoppedP.then(function (s) {
          if (!live()) return null;
          stoppedUsed = true;
          if (s.err) stoppedFailed = true; else { s.data.forEach(add); if (s.truncated) adsTruncated = true; }
          return showFirst(s.err ? [] : s.data);
        });
      }
      return showFirst(ads.data);
    });

    // تكملة الإعلانات اللي صرفت ومكانتش في الدفعات (بتحصل بس في الحسابات الكبيرة جداً)
    var fillMissing = function (daily, periodRes) {
      var spent = {};
      [daily, periodRes].forEach(function (res) {
        if (!res || res.err) return;
        res.data.forEach(function (row) { if (num(row.spend) > 0) spent[row.ad_id] = true; });
      });
      var missing = Object.keys(spent).filter(function (id) { return !adsById[id]; });
      if (!missing.length || !adFields) return Promise.resolve();
      return new Promise(function (resolve) {
        fetchMetaAdsByIds(missing, adFields, function (extra) {
          extra.forEach(add);
          resolveMetaImages(accountId, extra, resolve);
        });
      });
    };

    // النشر: الكروت بأرقامها. done = خلاص (مفيش إعلانات متوقفة لسه جاية في الخلفية)
    var maps = null;
    var needStopped = function () { return !allInOne && !stoppedUsed; };
    var publish = function (done) {
      var fresh = build(maps.insights, maps.reach, maps.adsets, maps.period);
      // لسه المتوقفة جاية: الكروت المتوقفة من النسخة المحفوظة بتفضل ظاهرة لحد ما الجديدة توصل (مفيش فيها أرقام بتتغيّر)
      if (!done && cachedShown) {
        var ids = {};
        fresh.forEach(function (c) { ids[c.id] = true; });
        (sourceCache[source + '|' + periodKey()] || []).forEach(function (c) { if (!ids[c.id] && !c.active) fresh.push(c); });
      }
      mergeCandidates(fresh, source);
      // الصور الأصلية للإعلانات اللي اتكمّلت بالـ ID
      candidates.forEach(function (c) {
        var ad = c.platform === 'Meta' && adsById[c.id];
        if (ad && ad._fullImage) c.thumbUrl = ad._fullImage;
      });
      if (done || !cachedShown) cacheSource(source, candidates.filter(function (c) { return c.source === source; }));
      var notes = [];
      if (maps.periodRes && maps.periodRes.err) notes.push(msg('note.periodFailed'));
      if (adsTruncated) notes.push(msg('note.adsCapped', { n: PAGE_SAFETY_CAP, ads: function () { return noun(PAGE_SAFETY_CAP, 'n.ad'); } }));
      if (maps.daily.err) notes.push(msg('note.dailyFailed', { msg: metaErrorText(maps.daily.err) }));
      else if (maps.daily.truncated) notes.push(msg('note.dailyTruncated', { n: FULL_SCAN_CAP }));
      if (stoppedFailed) notes.push(msg('note.stoppedFailed'));
      setPlatformState('meta', null);
      var text = connectedText(notes);
      if (done) setLoading('meta', false, text);
      else setLoading('meta', true, function () { return text() + ' ' + t('s.metaStoppedLoading'); });
      render();
    };

    // المرحلة التانية: أرقام الإنفاق والنتائج والتكرار (من غير ما تستنى الإعلانات المتوقفة)
    Promise.all([stage1, dailyP, reachP, periodP]).then(function (r) {
      return fillMissing(r[1], r[3]).then(function () { return r; });
    }).then(function (r) {
      var adsetStatusMap = r[0], daily = r[1], reach = r[2], periodRes = r[3];
      if (!live() || !adsetStatusMap) return null;
      maps = {
        insights: byAdId(daily.data, true), reach: byAdId(reach.data), adsets: adsetStatusMap,
        period: (periodRes && !periodRes.err) ? byAdId(periodRes.data) : null, daily: daily, periodRes: periodRes
      };
      publish(!needStopped());
      if (!needStopped()) return null;
      // المرحلة التالتة: الإعلانات المتوقفة (في الخلفية) — بتنضاف بنفس الأرقام اللي اتحمّلت
      return stoppedP.then(function (s) {
        if (!live()) return null;
        if (s.err) { stoppedFailed = true; return null; }
        if (s.truncated) adsTruncated = true;
        var added = s.data.filter(add);
        return new Promise(function (resolve) { resolveMetaImages(accountId, added, resolve); });
      }).then(function () { if (live()) publish(true); });
    }).catch(function (err) {
      // أي خطأ مش متوقع (بيانات بشكل غريب من Meta مثلاً) — قبل كده مؤشر التحميل كان بيفضل يلف على طول
      if (!live()) return;
      fail(msg('s.adsFailed', { platform: 'Meta', msg: (err && err.message) || String(err) }));
    });
  }

  // خريطة هدف المجموعة الإعلانية (optimization_goal) إلى نوع الحدث اللي المفروض
  // Meta نفسها تعرضه كـ"النتائج" لهذا الإعلان بالذات — نفس منطق عمود Results في Ads Manager تقريباً
  var GOAL_TO_ACTION = {
    'OFFSITE_CONVERSIONS': [{ type: 'omni_purchase', key: 'purchase' }, { type: 'purchase', key: 'purchase' }],
    'ONSITE_CONVERSIONS': [{ type: 'omni_purchase', key: 'purchase' }, { type: 'purchase', key: 'purchase' }],
    'OFFSITE_CONVERSIONS_LEAD': [{ type: 'onsite_conversion.lead_grouped', key: 'lead' }, { type: 'lead', key: 'lead' }],
    'LEAD_GENERATION': [{ type: 'onsite_conversion.lead_grouped', key: 'lead' }, { type: 'lead', key: 'lead' }],
    'QUALITY_LEAD': [{ type: 'onsite_conversion.lead_grouped', key: 'lead' }, { type: 'lead', key: 'lead' }],
    'CONVERSATIONS': [{ type: 'onsite_conversion.messaging_conversation_started_7d', key: 'message' }],
    'LINK_CLICKS': [{ type: 'link_click', key: 'click' }],
    'LANDING_PAGE_VIEWS': [{ type: 'landing_page_view', key: 'lpv' }],
    'APP_INSTALLS': [{ type: 'mobile_app_install', key: 'install' }],
    'POST_ENGAGEMENT': [{ type: 'post_engagement', key: 'engagement' }],
    'THRUPLAY': [{ type: 'video_view', key: 'video' }],
    'REPLIES': [{ type: 'onsite_conversion.messaging_first_reply', key: 'reply' }]
  };
  // احتياطي عام فقط لو هدف المجموعة الإعلانية غير معروف أو غير موجود في الخريطة أعلاه
  var FALLBACK_ACTION_TYPES = [
    { type: 'omni_purchase', key: 'purchase' }, { type: 'purchase', key: 'purchase' },
    { type: 'onsite_conversion.messaging_conversation_started_7d', key: 'message' },
    { type: 'onsite_conversion.lead_grouped', key: 'lead' }, { type: 'lead', key: 'lead' },
    { type: 'link_click', key: 'click' }
  ];

  // بيرجع دايماً قيمة (حتى لو صفر) للحدث المرتبط فعلياً بهدف الإعلان — مش بيقفز لمقياس تاني
  // لو القيمة صفر، عشان كده منقدرش نفرّق "صفر نتائج فعلي" عن "الحدث ده مش موجود خالص"
  function resultForGoal(actionsArr, goal) {
    var candidates = GOAL_TO_ACTION[goal];
    if (candidates) {
      var c = candidates[0];
      var found = valueForType(actionsArr, c.type);
      return { value: found || 0, key: c.key, type: c.type, matchedGoal: true };
    }
    for (var i = 0; i < FALLBACK_ACTION_TYPES.length; i++) {
      var v = valueForType(actionsArr, FALLBACK_ACTION_TYPES[i].type);
      if (v) return { value: v, key: FALLBACK_ACTION_TYPES[i].key, type: FALLBACK_ACTION_TYPES[i].type, matchedGoal: false };
    }
    return null;
  }
  // رقم "النتائج" بتاع Meta نفسها (حقل results في الأرقام) — نفس عمود Results في Ads Manager بالظبط،
  // وبيغطي حالات طريقتنا مبتفهمهاش (زي مجموعة Conversions بتحسّن على Lead مش Purchase).
  // شكله: [{ indicator: "actions:offsite_conversion.fb_pixel_purchase", values: [{ value: "12" }] }]
  // بنقراه بحذر: لو الشكل مختلف أو القيمة مش رقم بنرجّع null ونكمّل بطريقتنا
  function metaResults(row) {
    var list = row && row.results;
    if (!Array.isArray(list) || !list.length || !list[0]) return null;
    var r = list[0];
    var raw = Array.isArray(r.values) ? (r.values[0] && r.values[0].value) : (r.value != null ? r.value : r.values);
    var value = parseFloat(raw);
    if (!isFinite(value)) return null;
    var indicator = String(r.indicator || '');
    var type = indicator.slice(indicator.lastIndexOf(':') + 1) || null;
    return { value: value, key: resultKeyForType(type), type: type, matchedGoal: true };
  }
  // نوع الحدث من Meta → اسم النتيجة بتاعنا (مشتريات، عملاء محتملون...)
  function resultKeyForType(type) {
    var s = String(type || '');
    if (/purchase/.test(s)) return 'purchase';
    if (/lead/.test(s)) return 'lead';
    if (/first_reply/.test(s)) return 'reply';
    if (/messaging|conversation/.test(s)) return 'message';
    if (/complete_registration/.test(s)) return 'registration';
    if (/add_to_cart/.test(s)) return 'cart';
    if (/initiate(d)?_checkout/.test(s)) return 'checkout';
    if (/landing_page_view/.test(s)) return 'lpv';
    if (/link_click/.test(s)) return 'click';
    if (/app_install/.test(s)) return 'install';
    if (/post_engagement/.test(s)) return 'engagement';
    if (/video_view|thruplay/.test(s)) return 'video';
    if (/subscribe/.test(s)) return 'subscribe';
    if (/contact/.test(s)) return 'contact';
    if (/^reach$/.test(s)) return 'reach';
    return 'generic';
  }
  function valueForType(actionsArr, type) {
    if (!actionsArr || !type) return null;
    for (var i = 0; i < actionsArr.length; i++) {
      if (actionsArr[i].action_type === type) { var v = parseFloat(actionsArr[i].value); return isFinite(v) ? v : null; }
    }
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
    'campaign{id,name,effective_status,start_time,stop_time,' + META_ISSUES + '},';
  var META_AD_FIELDS_BASIC = 'id,name,effective_status,created_time,updated_time,adset{id,name,optimization_goal},campaign{id,name},';
  var META_CREATIVE_FULL = '{title,body,image_url,image_hash,thumbnail_url,video_id,effective_object_story_id,product_set_id,' +
    'asset_feed_spec{images{hash,url},videos{video_id,thumbnail_url}},' +
    'object_story_spec{link_data{link,picture,image_hash,call_to_action,child_attachments{image_hash,picture}},video_data{video_id,call_to_action,image_url,image_hash}}}';
  var META_CREATIVE_BASIC = '{title,body,image_url,thumbnail_url,video_id,' +
    'object_story_spec{link_data{link,picture,call_to_action},video_data{video_id,call_to_action,image_url}}}';
  var META_AD_FIELD_ATTEMPTS = [
    META_AD_FIELDS + 'creative.thumbnail_width(1080).thumbnail_height(1080)' + META_CREATIVE_FULL,
    META_AD_FIELDS + 'creative' + META_CREATIVE_FULL,
    META_AD_FIELDS_BASIC + 'creative' + META_CREATIVE_BASIC
  ];
  // طلب الإعلانات بالحقول الكاملة، ولو اترفض بنرجع لحقول أبسط. extra = باراميترات زيادة (زي فلتر الحالة)
  function fetchAdsWithFields(accountId, extra, cap, onDone) {
    (function tryNext(i) {
      var params = { fields: META_AD_FIELD_ATTEMPTS[i], limit: 100 };
      for (var k in extra) params[k] = extra[k];
      fetchAllPages('/' + accountId + '/ads', params, cap, function (err, adsData, truncated) {
        if (err && i < META_AD_FIELD_ATTEMPTS.length - 1) { tryNext(i + 1); return; }
        onDone(err, adsData, truncated, META_AD_FIELD_ATTEMPTS[i]);
      });
    })(0);
  }
  // نفس الطلب بس كـ Promise: { err, data, truncated, fields }
  function adsPromise(accountId, extra, cap) {
    return new Promise(function (resolve) {
      fetchAdsWithFields(accountId, extra, cap, function (err, data, truncated, fields) {
        resolve({ err: err, data: data || [], truncated: !!truncated, fields: fields });
      });
    });
  }

  // رقم الفيديو: في الإعلان العادي creative.video_id، وفي الإعلانات الديناميكية وAdvantage+ جوه
  // asset_feed_spec.videos أو video_data — قبل كده الإعلانات دي كانت بتتحسب «صورة» ومعاينتها متظهرش
  function metaVideoId(creative) {
    creative = creative || {};
    var spec = creative.object_story_spec || {};
    var feedVideo = creative.asset_feed_spec && creative.asset_feed_spec.videos && creative.asset_feed_spec.videos[0];
    return creative.video_id || (spec.video_data && spec.video_data.video_id) || (feedVideo && feedVideo.video_id) || null;
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
      if (metaVideoId(creative)) return; // الفيديو ليه غلاف ومعاينة خاصة بيه
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
    // صور المنشورات الأصلية (إعلان مبني على منشور موجود) — بطلب مجمّع (?ids= اتلغى من v26.0)
    var storyIds = Object.keys(byStory);
    if (storyIds.length) {
      jobs.push(function (next) {
        graphBatch(storyIds, 'fields=full_picture', function (posts) {
          posts.forEach(function (post) {
            if (post.full_picture && byStory[post.id]) byStory[post.id].forEach(function (ad) { ad._fullImage = post.full_picture; });
          });
          next();
        });
      });
    }
    (function run(i) { if (i >= jobs.length) { onDone(); return; } jobs[i](function () { run(i + 1); }); })(0);
  }

  // أوضح صورة متاحة: الملف الأصلي ← الصورة الأصلية ← صورة الرابط ← غلاف الفيديو ← الصورة المصغّرة (١٠٨٠ لو اتطلبت)
  function metaImageUrl(ad) {
    var creative = ad.creative || {};
    var spec = creative.object_story_spec || {};
    var link = spec.link_data || {};
    var firstChild = link.child_attachments && link.child_attachments[0];
    var feedImage = creative.asset_feed_spec && creative.asset_feed_spec.images && creative.asset_feed_spec.images[0];
    var feedVideo = creative.asset_feed_spec && creative.asset_feed_spec.videos && creative.asset_feed_spec.videos[0];
    return ad._fullImage || creative.image_url || link.picture || (firstChild && firstChild.picture) ||
      (feedImage && feedImage.url) || (spec.video_data && spec.video_data.image_url) || (feedVideo && feedVideo.thumbnail_url) ||
      creative.thumbnail_url || null;
  }

  function transformRealAd(ad, insightRows, adsetStatusMap, days, reachRow, currency, acct, periodRow) {
    var delivery = metaDelivery(ad, adsetStatusMap, acct);
    var creative = ad.creative || {};
    var imageUrl = metaImageUrl(ad);
    var videoId = metaVideoId(creative);
    var format = videoId ? 'video' : (imageUrl ? 'image' : 'text');
    var goal = (ad.adset && ad.adset.optimization_goal) || null;
    var byDate = {};
    (insightRows || []).forEach(function (r) { byDate[r.date_start] = r; });

    var daily = [], dailySales = [], dailyResultsArr = [];
    // لو هدف الإعلان معروف، نوع النتيجة معروف حتى لو الإعلان مصرفش ولا يوم
    var goalAction = GOAL_TO_ACTION[goal] && GOAL_TO_ACTION[goal][0];
    var totalResultsVal = 0, resultKey = goalAction ? goalAction.key : null, resultType = goalAction ? goalAction.type : null, matchedGoal = !!goalAction;
    // لو Meta رجّعت رقم النتائج بتاعها لأي يوم، بنعتمده في كل الأيام (اليوم اللي مفيهوش = صفر) —
    // من غير ما نخلط بينه وبين طريقتنا، عشان نوع النتيجة ميتغيّرش من يوم ليوم
    var firstMeta = null;
    (insightRows || []).some(function (r) { firstMeta = metaResults(r); return !!firstMeta; });
    if (firstMeta) { resultKey = firstMeta.key; resultType = firstMeta.type; matchedGoal = true; }
    var resultOfRow = function (row) {
      if (!firstMeta) return resultForGoal(row.actions, goal);
      var m = metaResults(row);
      return m || { value: 0, key: firstMeta.key, type: firstMeta.type, matchedGoal: true };
    };
    days.forEach(function (day) {
      var row = byDate[day.key];
      var spendVal = row ? r2(num(row.spend)) : 0;
      daily.push(spendVal);
      if (row) {
        var found = resultOfRow(row);
        if (found) {
          totalResultsVal += found.value;
          resultKey = found.key; resultType = found.type; matchedGoal = found.matchedGoal;
          dailyResultsArr.push(Math.round(found.value));
        } else { dailyResultsArr.push(0); }
        var salesVal = resultType ? valueForType(row.action_values, resultType) : null;
        dailySales.push(salesVal != null ? r2(salesVal) : 0);
      } else {
        dailyResultsArr.push(0); dailySales.push(0);
      }
    });
    var dailyDates = days.map(function (d) { return d.key; });
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
    var results = (goal || firstMeta) ? Math.round(totalResultsVal) : (totalResultsVal > 0 ? Math.round(totalResultsVal) : null);
    var cpr = (results && spend > 0) ? (spend / results) : null;
    var roas = (totalSales > 0 && spend > 0) ? (totalSales / spend) : null;

    // أرقام الفترة المختارة — نفس منطق النتيجة (حسب هدف الإعلان) على صف المجموع
    var periodData = null;
    if (periodRow) {
      // نفس القاعدة: رقم Meta لو موجود في الفترة أو في الأسبوع، وإلا طريقتنا
      var pMeta = metaResults(periodRow);
      var pFound = pMeta || (firstMeta ? { value: 0, key: firstMeta.key, type: firstMeta.type } : resultForGoal(periodRow.actions, goal));
      var pType = (pFound && pFound.type) || resultType;
      var pResults = pFound ? Math.round(pFound.value) : (goal ? 0 : null);
      if (pMeta && !firstMeta) { resultKey = pMeta.key; resultType = pMeta.type; }
      var pSales = pType ? valueForType(periodRow.action_values, pType) : null;
      periodData = buildPeriod(num(periodRow.spend), pResults, pSales || 0);
    }

    var dest = destinationInfo(creative);

    return {
      id: ad.id,
      platform: 'Meta',
      currency: currency || null,
      reviewStatus: META_REVIEW_STATUS[ad.effective_status] || null,
      frequency: reachRow && isFinite(parseFloat(reachRow.frequency)) ? parseFloat(reachRow.frequency) : null,
      reach: reachRow && isFinite(parseInt(reachRow.reach, 10)) ? parseInt(reachRow.reach, 10) : null,
      placement: (ad.campaign && ad.campaign.name) || (ad.adset && ad.adset.name) || '—',
      campaignId: (ad.campaign && ad.campaign.id) || null,
      campaignName: (ad.campaign && ad.campaign.name) || null,
      adsetName: (ad.adset && ad.adset.name) || null,
      nativeId: ad.id,
      format: format,
      duration: format === 'video' ? '' : undefined,
      videoId: videoId,
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
      resultKey: resultKey,
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
