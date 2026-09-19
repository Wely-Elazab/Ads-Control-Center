// =====================================================================
// Ads Control Center — TikTok
// =====================================================================
// تسجيل الدخول بإعادة توجيه الصفحة كلها، الحسابات، تحميل الإعلانات وحالة التشغيل.
// checkTikTokRedirect() بتتنادى من main.js بعد ما كل الملفات تتحمّل.
// الملفات بتتحمّل بالترتيب ده وبتتشارك نفس النطاق العام (من غير bundler):
//   i18n → alerts → core → meta → google → snapchat → tiktok → ui → main
// أي كود بيتنفّذ وقت التحميل مسموحله يستخدم اللي في الملفات اللي قبله بس — الباقي جوه دوال.

  // ---------- TikTok: نفس نمط إعادة التوجيه الكامل بتاع Snapchat ----------
  // !!! هام: عدّل بالـ App ID بتاعك من TikTok for Business !!!
  var TIKTOK_APP_ID = "7682985212271314962";
  var tiktokAccessToken = null;
  // TikTok مقفول مؤقتاً ("قريباً") لحد ما حساب المطوّر Business يتسجّل بإيميل الدومين والتطبيق يتوافق عليه.
  // الزرار في نافذة المنصات disabled، والدالة نفسها بترفض كمان لو حد فعّل الزرار من أدوات المتصفح.
  // لإعادة التفعيل: خلّيها true، وشيل disabled و"soon" من زرار platformTikTok في الصفحة
  var TIKTOK_ENABLED = false;

  function loginWithTikTok() {
    if (!TIKTOK_ENABLED) { setStatus(msg('s.tiktokSoon')); return; }
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
    setStatus(msg('s.finishingLogin', { platform: 'TikTok' }));
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
          setStatus(msg('s.tiktokNoAdvertisers'));
          return;
        }
        setPlatformOptions('tiktok', ids.map(function (id) { return { value: id, label: 'TikTok Ads — ' + id }; }));
        setStatus(msg('s.tiktokPick'));
        loadTikTokAdsForAdvertiser(ids[0]);
        accountSelect.value = ids[0];
      } else {
        setStatus(msg('s.loginFailed', { platform: 'TikTok', msg: (data && (data.error || data.message)) || msg('s.unknownError') }));
      }
    }).catch(function (err) {
      setStatus(msg('s.backendPlatformFailed', { platform: 'TikTok', msg: err.message }));
    });
  }

  function loadTikTokAdsForAdvertiser(advertiserId) {
    var token = beginLoad('tiktok');
    showCachedWhileLoading('tiktok:' + advertiserId);
    setLoading('tiktok', true, msg('s.loadingAds', { platform: 'TikTok' }));
    fetch('/api/tiktok-ads-fetch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: tiktokAccessToken, advertiserId: advertiserId, clientTz: BROWSER_TZ, period: period })
    }).then(function (r) { return r.json(); }).then(function (payload) {
      if (!isCurrentLoad('tiktok', token)) return; // المستخدم بدّل لحساب تاني قبل ما الرد ده يوصل
      if (!payload || payload.error) {
        setLoading('tiktok', false, msg('s.adsFailed', { platform: 'TikTok', msg: payload && payload.error ? payload.error : msg('s.unexpected') }));
        return;
      }
      var adsList = payload.ads || [];
      if (!adsList.length) {
        setLoading('tiktok', false, msg('s.noAdsTikTok'));
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
      setLoading('tiktok', false, connectedText(payload.reportError ? [msg('note.spendFailed', { msg: payload.reportError })] : []));
      render();
    }).catch(function (err) {
      if (!isCurrentLoad('tiktok', token)) return;
      setLoading('tiktok', false, msg('s.adsFailed', { platform: 'TikTok', msg: err.message }));
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
    // (^|_)END عشان كلمة زي SUSPEND متتقريش "انتهى"
    if (/TIME_DONE|(^|_)END(ED)?($|_)/.test(s)) return off('ended');
    if (/NOT_START/.test(s)) return off('scheduled');
    if (/AUDIT_DENY|REJECT/.test(s)) return off('rejected');
    // رصيد الحساب خلص = مشكلة حساب. أما BUDGET_EXCEED فمعناها إن ميزانية اليوم اتصرفت —
    // ده سلوك طبيعي والإعلان بيرجع يشتغل بكرة، فمش بنعتبره متوقف
    if (/BALANCE/.test(s)) return off('account');
    if (/BUDGET_EXCEED/.test(s)) return { active: true, level: null };
    if (/AUDIT/.test(s)) return off('pending');
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
        id: id, platform: 'TikTok', currency: currency || null,
        placement: ad.campaign_name || ad.adgroup_name || '—',
        campaignId: ad.campaign_id || null,
        campaignName: ad.campaign_name || null,
        adsetName: ad.adgroup_name || null,
        nativeId: ad.ad_id,
        reviewStatus: null, frequency: null,
        format: ad.ad_format && /VIDEO|SINGLE_VIDEO/i.test(ad.ad_format) ? 'video' : 'image',
        thumbUrl: null,
        headline: ad.ad_name || ('TikTok #' + ad.ad_id), desc: ad.ad_text || '',
        offer: ad.ad_name || id, caption: ad.ad_text || ad.ad_name || '',
        landing: ad.landing_page_url || '—', landingKind: ad.landing_page_url ? 'website' : null,
        daysAgo: ad.create_time ? daysBetween(tiktokTime(ad.create_time)) : null,
        updatedDaysAgo: ad.modify_time ? daysBetween(tiktokTime(ad.modify_time)) : null,
        daily: daily, dailySales: daily.map(function () { return 0; }), dailyResults: dailyResults, dailyDates: days.map(function (d) { return d.key; }),
        spend: spend, results: results, resultKey: 'conversion', cpr: (results && spend) ? (spend / results) : null, roas: null,
        themeClass: 'pv-t' + (hashCode(id) % 4),
        active: delivery.active, pausedLevel: delivery.level,
        deliveryReason: null, platformStatus: ad.secondary_status || ad.operation_status || null,
        period: pRow ? buildPeriod(pRow.spend, Math.round(pRow.results), pRow.sales) : null,
        fail: false
      };
    });
  }

  // لو رجعنا من TikTok بـ ?auth_code=... في الرابط، كمّل تسجيل الدخول تلقائياً
  function checkTikTokRedirect() {
    // TikTok مقفول («قريباً») — أي رابط رجوع منه بيتجاهل، عشان محدش يقدر يستخدمه كباب خلفي لتسجيل دخول
    if (!TIKTOK_ENABLED) return;
    var params = new URLSearchParams(window.location.search);
    var authCode = params.get('auth_code') || params.get('code');
    var state = params.get('state') || '';
    if (state.indexOf('tiktok') !== 0) return;
    window.history.replaceState({}, document.title, window.location.pathname);
    var oauthError = oauthErrorFromUrl(params);
    if (oauthError) { setStatus(msg('s.oauthRejected', { platform: 'TikTok', msg: oauthError })); return; }
    if (!authCode) return;
    if (!consumeOauthState('tiktok', state)) {
      setStatus(msg('s.oauthMismatch', { platform: 'TikTok' }));
      return;
    }
    exchangeTikTokCode(authCode);
  }
