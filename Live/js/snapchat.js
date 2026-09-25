// =====================================================================
// Ads Center — Snapchat
// =====================================================================
// تسجيل الدخول بإعادة توجيه الصفحة كلها، الحسابات، تحميل الإعلانات وحالة التشغيل.
// checkSnapchatRedirect() بتتنادى من main.js بعد ما كل الملفات تتحمّل.
// الملفات بتتحمّل بالترتيب ده وبتتشارك نفس النطاق العام (من غير bundler):
//   i18n → alerts → core → meta → google → snapchat → tiktok → ui → main
// أي كود بيتنفّذ وقت التحميل مسموحله يستخدم اللي في الملفات اللي قبله بس — الباقي جوه دوال.

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
    setStatus(msg('s.finishingLogin', { platform: 'Snapchat' }));
    apiPost('/api/snapchat-token', { code: code, redirectUri: redirectUri }).then(function (res) {
      var data = res.data;
      if (data && data.access_token) {
        snapchatAccessToken = data.access_token;
        rememberToken('snapchat', snapchatAccessToken, data.expires_in);
        setStatus(msg('s.snapLoggedIn'));
        loadSnapchatAccounts();
      } else {
        setStatus(msg('s.loginFailed', { platform: 'Snapchat', msg: data && (data.error || data.code) ? apiErrorText(res) : msg('s.unknownError') }));
      }
    }).catch(function (err) {
      setStatus(msg('s.backendPlatformFailed', { platform: 'Snapchat', msg: err.message }));
    });
  }

  function loadSnapchatAccounts() {
    apiPost('/api/snapchat-ads-fetch', { accessToken: snapchatAccessToken, action: 'accounts' }).then(function (res) {
      if (isAuthFailure(res)) { markExpired('snapchat'); return; }
      var data = res.data;
      // قبل كده أي خطأ من Snapchat كان بيظهر كأن «مفيش حسابات» — دلوقتي بيظهر كخطأ برسالته
      if (!res.ok || data.error || data.request_status === 'ERROR') {
        var failMsg = msg('s.accountsLoadFailed', { platform: 'Snapchat', msg: data.error || data.code ? apiErrorText(res) : (data.debug_message || ('HTTP ' + res.status)) });
        setPlatformState('snapchat', { kind: 'error', msg: failMsg });
        setStatus(failMsg);
        render();
        return;
      }
      var accounts = [];
      (data && data.organizations || []).forEach(function (o) {
        var org = o.organization || o;
        (org.ad_accounts || []).forEach(function (aa) {
          var acc = aa.ad_account || aa;
          if (acc && acc.id) accounts.push(acc);
        });
      });
      if (!accounts.length) {
        setPlatformState('snapchat', { kind: 'noAccounts', msg: msg('s.snapNoAccounts') });
        setStatus(msg('s.snapNoAccounts'));
        render();
        return;
      }
      setPlatformOptions('snapchat', accounts.map(function (a) { return { value: a.id, label: 'Snapchat — ' + (a.name || a.id) }; }));
      setStatus(msg('s.accountsFound', { n: accounts.length, accounts: function () { return noun(accounts.length, 'n.account'); }, platform: 'Snapchat' }));
      // آخر حساب اختاره العميل ← أول حساب شغّال ← أول حساب
      var target = pickAccount('snapchat', accounts, function (a) { return !a.status || a.status === 'ACTIVE'; });
      loadSnapchatAdsForAccount(target);
      accountSelect.value = target;
    }).catch(function (err) {
      var failMsg = msg('s.accountsLoadFailed', { platform: 'Snapchat', msg: err.message });
      setPlatformState('snapchat', { kind: 'error', msg: failMsg });
      setStatus(failMsg);
      render();
    });
  }

  function loadSnapchatAdsForAccount(adAccountId) {
    selectSource('snapchat', adAccountId);
    // الربط مع Snapchat بيخلص بعد حوالي نص ساعة — بنقول كده بوضوح بدل رسالة خطأ تقنية
    if (!validToken(sessionTokens.snapchat)) { markExpired('snapchat'); return; }
    var token = beginLoad('snapchat');
    var fail = function (m) {
      setPlatformState('snapchat', { kind: 'error', msg: m });
      setLoading('snapchat', false, m);
      render();
    };
    showCachedWhileLoading('snapchat:' + adAccountId);
    setLoading('snapchat', true, msg('s.loadingAds', { platform: 'Snapchat' }));
    apiPost('/api/snapchat-ads-fetch', { accessToken: snapchatAccessToken, action: 'ads', adAccountId: adAccountId, clientTz: BROWSER_TZ, period: period }).then(function (res) {
      if (!isCurrentLoad('snapchat', token)) return; // المستخدم بدّل لحساب تاني قبل ما الرد ده يوصل
      if (isAuthFailure(res)) { markExpired('snapchat'); return; }
      var payload = res.data;
      if (!res.ok || payload.error) {
        fail(msg('s.adsFailed', { platform: 'Snapchat', msg: apiErrorText(res) }));
        return;
      }
      var adsList = payload.ads || [];
      var statsList = (payload.stats && payload.stats.timeseries_stats) || [];
      if (!adsList.length) {
        setPlatformState('snapchat', { kind: 'empty' });
        setLoading('snapchat', false, msg('s.noAds'));
        render();
        return;
      }
      var snapCandidates = transformSnapchatAds(adsList, statsList, daysFromRange(payload.range), payload.account && payload.account.currency, payload.squads, payload.campaigns, payload.periodStats);
      mergeCandidates(snapCandidates, 'snapchat:' + adAccountId);
      cacheSource('snapchat:' + adAccountId, snapCandidates);
      setPlatformState('snapchat', null);
      setLoading('snapchat', false, connectedText(payload.statsError ? [msg('note.spendFailed', { msg: payload.statsError })] : []));
      render();
    }).catch(function (err) {
      if (!isCurrentLoad('snapchat', token)) return;
      fail(msg('s.adsFailed', { platform: 'Snapchat', msg: err.message }));
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
      var squad = squadsById[ad.ad_squad_id] || null;
      var campaign = squad ? (campaignsById[squad.campaign_id] || null) : null;
      var dailyResults = tracksPurchases ? p.purchases : p.swipes;
      var dailySales = tracksPurchases ? p.sales : p.daily.map(function () { return 0; });
      var spend = r2(p.daily.reduce(function (a, b) { return a + b; }, 0));
      var results = dailyResults.reduce(function (a, b) { return a + b; }, 0);
      var totalSales = dailySales.reduce(function (a, b) { return a + b; }, 0);
      return {
        id: id, platform: 'Snapchat', currency: currency || null,
        placement: (campaign && campaign.name) || (squad && squad.name) || '—',
        campaignId: (squad && squad.campaign_id) || null,
        campaignName: (campaign && campaign.name) || null,
        adsetName: (squad && squad.name) || null,
        nativeId: ad.id,
        reviewStatus: /REJECT|DENY/i.test(ad.review_status || '') ? 'disapproved' : null,
        frequency: null,
        format: ad.type && /VIDEO/i.test(ad.type) ? 'video' : (ad.type && /SNAP_AD/i.test(ad.type) ? 'video' : 'image'),
        thumbUrl: null,
        headline: ad.name || ('Snapchat #' + ad.id), desc: '',
        offer: ad.name || id, caption: ad.name || '',
        landing: '—', landingKind: null,
        daysAgo: ad.created_at ? daysBetween(ad.created_at) : null,
        updatedDaysAgo: ad.updated_at ? daysBetween(ad.updated_at) : null,
        daily: p.daily, dailySales: dailySales, dailyResults: dailyResults, dailyDates: days.map(function (d) { return d.key; }),
        spend: spend, results: results, resultKey: tracksPurchases ? 'purchase' : 'swipe',
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
  // بترجّع true لو بدأت تكمّل تسجيل دخول (عشان استرجاع الجلسة ميعتبرش جلسة Snapchat القديمة «انتهت»)
  function checkSnapchatRedirect() {
    var params = new URLSearchParams(window.location.search);
    var code = params.get('code');
    var state = params.get('state') || '';
    if (state.indexOf('snapchat') !== 0) return false;
    window.history.replaceState({}, document.title, window.location.pathname);
    var oauthError = oauthErrorFromUrl(params);
    if (oauthError) { setStatus(msg('s.oauthRejected', { platform: 'Snapchat', msg: oauthError })); return false; }
    if (!code) return false;
    if (!consumeOauthState('snapchat', state)) {
      setStatus(msg('s.oauthMismatch', { platform: 'Snapchat' }));
      return false;
    }
    exchangeSnapchatCode(code);
    return true;
  }
