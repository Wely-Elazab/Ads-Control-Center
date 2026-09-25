// =====================================================================
// Ads Center — Google Ads
// =====================================================================
// تسجيل الدخول (Google Identity Services)، الحسابات (بما فيها MCC)، تحميل الإعلانات وحالة التشغيل.
// الملفات بتتحمّل بالترتيب ده وبتتشارك نفس النطاق العام (من غير bundler):
//   i18n → alerts → core → meta → google → snapchat → tiktok → ui → main
// أي كود بيتنفّذ وقت التحميل مسموحله يستخدم اللي في الملفات اللي قبله بس — الباقي جوه دوال.

  // ---------- Google Identity Services SDK ----------
  (function (d, s, id) {
    var js, fjs = d.getElementsByTagName(s)[0];
    if (d.getElementById(id)) return;
    js = d.createElement(s); js.id = id; js.async = true; js.defer = true;
    js.src = 'https://accounts.google.com/gsi/client';
    fjs.parentNode.insertBefore(js, fjs);
  }(document, 'script', 'google-identity-sdk'));

  // ---------- Google Identity Services (خطوة تسجيل الدخول فقط دلوقتي) ----------
  // !!! هام: عدّل بالـ Client ID بتاعك من Google Cloud Console !!!
  var GOOGLE_CLIENT_ID = "755601072390-jvljtdc8799o59fjffvtq43p70765jqn.apps.googleusercontent.com"
  var googleTokenClient = null;
  // صلاحية Google Ads بس — كان فيه طلب للإيميل كمان ومش مستخدم في أي حتة، فاتشال (أقل بيانات = أسهل في التوثيق).
  // Google مبتوفّرش صلاحية «قراءة فقط» لـ Google Ads، فدي الوحيدة المتاحة — والأداة بتستخدمها للقراءة بس
  var GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';
  function loginWithGoogle() {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
      setStatus(msg('s.googleSdkLoading'));
      return;
    }
    if (!googleTokenClient) {
      googleTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_ADS_SCOPE,
        callback: function (tokenResponse) {
          if (tokenResponse && tokenResponse.access_token) {
            // لو العميل شال العلامة من على صلاحية Google Ads في شاشة الموافقة، التوكن بيرجع من غيرها
            // وكل الطلبات بعد كده بتفشل برسالة مش مفهومة — فبنقوله السبب على طول
            var oauth2 = google.accounts.oauth2;
            if (oauth2.hasGrantedAllScopes && !oauth2.hasGrantedAllScopes(tokenResponse, GOOGLE_ADS_SCOPE)) {
              setStatus(msg('s.googleScopeMissing'), { help: 'google' });
              return;
            }
            googleAccessToken = tokenResponse.access_token;
            rememberToken('google', googleAccessToken, tokenResponse.expires_in);
            setStatus(msg('s.googleLoggedIn'));
            loadGoogleAccounts();
          } else {
            setStatus(msg('s.googleLoginFailed'), { help: 'google' });
          }
        },
        // النافذة اتقفلت من غير دخول (في التجربة المغلقة غالباً بعد «Access blocked» لإيميل مش مضاف)،
        // أو المتصفح منعها. من غير الدالة دي Google مكانتش بتبلّغنا بحاجة، والأداة كانت بتفضل ساكتة.
        // تحذير: لو اتضاف للموقع هيدر Cross-Origin-Opener-Policy: same-origin، الـ popup_closed ده هيوصل غلط
        // أول ما النافذة تفتح — لازم يبقى same-origin-allow-popups (vercel.json مفيهوش COOP حالياً)
        error_callback: function (err) {
          if (err && err.type === 'popup_failed_to_open') setStatus(msg('s.popupBlocked', { platform: 'Google' }));
          else setStatus(msg('s.googleCancelled'), { help: 'google' });
        }
      });
    }
    googleTokenClient.requestAccessToken();
  }

  var googleAccessToken = null;

  function loadGoogleAccounts() {
    apiPost('/api/google-list-accounts', { accessToken: googleAccessToken }).then(function (res) {
      if (isAuthFailure(res)) { markExpired('google'); return; }
      var data = res.data;
      if (!res.ok || data.error || !data.accounts) {
        var failMsg = msg('s.googleAccountsFailed', { msg: data.error || data.code ? apiErrorText(res) : msg('s.checkBackend') });
        setPlatformState('google', { kind: 'error', msg: failMsg });
        setStatus(failMsg);
        render();
        return;
      }
      // السيرفر بيرجّع حسابات العملاء بس (من غير حسابات Manager) ومع كل واحد الـ loginCustomerId بتاعه.
      // inactive = حسابات مقفولة أو إعدادها ما خلصش على Google Ads — مش عطل في الأداة، فبنقول رقمها بالظبط
      var accounts = data.accounts;
      var inactive = (data.inactive || []).map(formatGoogleId);
      var inactiveList = function () { return inactive.slice(0, 5).join(isAr() ? '، ' : ', ') + (inactive.length > 5 ? ' …' : ''); };
      if (!accounts.length) {
        var none = inactive.length ? msg('s.googleInactiveOnly', { ids: inactiveList }) : msg('s.googleNoAccounts');
        setPlatformState('google', { kind: 'noAccounts', msg: none });
        setStatus(none);
        render();
        return;
      }
      accounts.forEach(function (a) { accountInfo['google:' + a.id] = a; });
      setPlatformOptions('google', accounts.map(function (a) {
        return { value: a.id, label: 'Google Ads — ' + a.name + (a.name !== a.id ? ' (' + a.id + ')' : '') };
      }));
      var found = msg('s.accountsFound', { n: accounts.length, accounts: function () { return noun(accounts.length, 'n.account'); }, platform: 'Google Ads' });
      var skipped = inactive.length ? msg('s.googleSkippedInactive', { ids: inactiveList }) : null;
      setStatus(skipped ? function () { return found() + ' ' + skipped(); } : found);
      // آخر حساب اختاره العميل (لو لسه موجود) — مهم كمان بعد «ربط تاني»: بيرجع على نفس الحساب
      var target = pickAccount('google', accounts);
      loadGoogleAdsForAccount(target);
      accountSelect.value = target;
    }).catch(function (err) {
      var failMsg = msg('s.backendFailed', { msg: err.message });
      setPlatformState('google', { kind: 'error', msg: failMsg });
      setStatus(failMsg);
      render();
    });
  }

  function loadGoogleAdsForAccount(customerId) {
    var info = accountInfo['google:' + customerId] || {};
    selectSource('google', customerId);
    // الربط مع Google بيخلص بعد حوالي ساعة — بنقول كده بوضوح بدل ما نبعت طلب هيفشل برسالة تقنية
    if (!validToken(sessionTokens.google)) { markExpired('google'); return; }
    var token = beginLoad('google');
    var fail = function (m) {
      setPlatformState('google', { kind: 'error', msg: m });
      setLoading('google', false, m);
      render();
    };
    showCachedWhileLoading('google:' + customerId);
    setLoading('google', true, msg('s.loadingAds', { platform: 'Google Ads' }));
    apiPost('/api/google-ads-fetch', {
      accessToken: googleAccessToken, customerId: customerId,
      loginCustomerId: info.loginCustomerId, timeZone: info.timeZone, clientTz: BROWSER_TZ, period: period
    }).then(function (res) {
      if (!isCurrentLoad('google', token)) return; // المستخدم بدّل لحساب تاني قبل ما الرد ده يوصل
      if (isAuthFailure(res)) { markExpired('google'); return; }
      var payload = res.data;
      if (!res.ok || payload.error) {
        fail(msg('s.adsFailed', { platform: 'Google Ads', msg: apiErrorText(res) }));
        return;
      }
      var days = daysFromRange(payload.range);
      // حملات Performance Max بتتعرض ككارت لكل حملة جنب الإعلانات (Google مبترجّعش إعلاناتها منفصلة)
      var pmaxCandidates = transformGooglePmax(payload.pmax, payload.pmaxPeriod, days, info.currency);
      if ((!payload.ads || !payload.ads.length) && !pmaxCandidates.length) {
        setPlatformState('google', { kind: 'empty' });
        setLoading('google', false, msg('s.noAdsGoogle'));
        render();
        return;
      }
      var googleCandidates = transformGoogleRows(payload.ads || [], payload.metrics || [], days, info.currency, payload.periodMetrics).concat(pmaxCandidates);
      mergeCandidates(googleCandidates, 'google:' + customerId);
      cacheSource('google:' + customerId, googleCandidates);
      setPlatformState('google', null);
      setLoading('google', false, connectedText(payload.pmaxError ? [msg('note.pmaxFailed', { msg: payload.pmaxError })] : []));
      render();
    }).catch(function (err) {
      if (!isCurrentLoad('google', token)) return;
      fail(msg('s.adsFailed', { platform: 'Google Ads', msg: err.message }));
    });
  }

  function ggPick(obj, path) {
    return path.split('.').reduce(function (o, k) { return (o && o[k] != null) ? o[k] : undefined; }, obj);
  }

  // حالة التشغيل الفعلية لإعلان Google: الحالة (status) بتقول بس هل حد وقفه يدوياً،
  // لكن primary_status بيقول هل هو شغّال فعلاً — الحملة ممكن تكون ENABLED ومدتها خلصت أو غير مؤهلة
  // Google بترجّع primary_status = حالة التشغيل الفعلية، و primary_status_reasons = السبب بالظبط
  // (الحملة متوقفة، المجموعة متوقفة، مدة الحملة خلصت، الإعلان مرفوض...). بنترجم كلامها هي،
  // ومنستنتجش من الحالة اليدوية (status) غير لما الحقول دي متكونش موجودة
  var GOOGLE_REASON_LEVEL = {
    CAMPAIGN_REMOVED: 'campaign', CAMPAIGN_PAUSED: 'campaign', CAMPAIGN_PENDING: 'scheduled', CAMPAIGN_ENDED: 'ended',
    AD_GROUP_PAUSED: 'adset', AD_GROUP_REMOVED: 'adset',
    AD_REMOVED: 'ad', AD_PAUSED: 'ad',
    AD_DISAPPROVED: 'rejected', AD_UNDER_REVIEW: 'pending', AD_UNDER_APPEAL: 'pending',
    AD_LIMITED_BY_POLICY: 'not-eligible', AD_APPROVED_LABELED: 'not-eligible', AD_AREA_OF_INTEREST_ONLY: 'not-eligible',
    AD_GROUP_AD_NOT_ELIGIBLE: 'not-eligible'
  };
  var GOOGLE_PRIMARY_LEVEL = {
    ELIGIBLE: null, LIMITED: null,               // شغّال (مع ملاحظة في حالة LIMITED)
    PAUSED: 'ad', REMOVED: 'ad', ENDED: 'ended', PENDING: 'pending', NOT_ELIGIBLE: 'not-eligible'
  };
  function googleDelivery(row, adStatus, agStatus, campStatus, approval) {
    var off = function (level, reason) { return { active: false, level: level, reason: reason || null }; };
    var primary = ggPick(row, 'adGroupAd.primaryStatus');
    var reasons = ggPick(row, 'adGroupAd.primaryStatusReasons') || [];

    if (primary) {
      var level = GOOGLE_PRIMARY_LEVEL[primary];
      if (level === null) return { active: true, level: null, reason: null }; // ELIGIBLE / LIMITED
      // السبب الأول اللي نعرفه بيحدد المستوى بدقة أكتر من الحالة العامة
      for (var i = 0; i < reasons.length; i++) {
        if (GOOGLE_REASON_LEVEL[reasons[i]]) return off(GOOGLE_REASON_LEVEL[reasons[i]], reasons.join(', '));
      }
      return off(level || 'ad', reasons.join(', ') || primary);
    }

    // احتياطي: الحقول الجديدة مش موجودة، فبنرجع للحالة اليدوية بس
    if (campStatus && campStatus !== 'ENABLED') return off('campaign');
    if (agStatus && agStatus !== 'ENABLED') return off('adset');
    if (approval === 'DISAPPROVED') return off('rejected');
    if (adStatus !== 'ENABLED') return off('ad');
    return { active: true, level: null, reason: null };
  }

  // ---------- حملات Performance Max ----------
  // مفيهاش إعلانات منفصلة في الـ API، فكل حملة بتبقى كارت واحد (campaignLevel) بأرقام الحملة كلها.
  // حالتها من campaign.primary_status بنفس فكرة الإعلانات: ELIGIBLE / LIMITED / LEARNING = شغّالة
  var GOOGLE_CAMPAIGN_PRIMARY_LEVEL = {
    ELIGIBLE: null, LIMITED: null, LEARNING: null,
    PAUSED: 'campaign', REMOVED: 'campaign', ENDED: 'ended', PENDING: 'scheduled',
    MISCONFIGURED: 'not-eligible', NOT_ELIGIBLE: 'not-eligible'
  };
  function googleCampaignDelivery(camp) {
    var primary = camp.primaryStatus, reasons = camp.primaryStatusReasons || [];
    if (primary) {
      var level = GOOGLE_CAMPAIGN_PRIMARY_LEVEL[primary];
      if (level === null) return { active: true, level: null, reason: null };
      return { active: false, level: level || 'campaign', reason: reasons.join(', ') || primary };
    }
    // احتياطي لو حقول primary_status اترفضت: الحالة اليدوية بس
    if (camp.status && camp.status !== 'ENABLED') return { active: false, level: 'campaign', reason: null };
    return { active: true, level: null, reason: null };
  }
  // dailyRows: صف لكل حملة × يوم فيه صرف (آخر ٧ أيام) — periodRows: صف لكل حملة في الفترة المختارة
  function transformGooglePmax(dailyRows, periodRows, days, currency) {
    var byCamp = {}, order = [];
    var entry = function (camp) {
      if (!byCamp[camp.id]) { byCamp[camp.id] = { camp: camp, perDay: {}, period: null }; order.push(camp.id); }
      return byCamp[camp.id];
    };
    (dailyRows || []).forEach(function (row) {
      var camp = row.campaign || {}, date = ggPick(row, 'segments.date');
      if (!camp.id || !date) return;
      var m = row.metrics || {};
      entry(camp).perDay[date] = {
        spend: r2(parseInt(m.costMicros || 0, 10) / 1000000),
        results: parseFloat(m.conversions || 0),
        sales: r2(parseFloat(m.conversionsValue || 0))
      };
    });
    // حملة صرفت في الفترة المختارة بس (مش في آخر ٧ أيام) لازم تظهر برضه — وإلا إجمالي الفترة يقل
    if (Array.isArray(periodRows)) {
      periodRows.forEach(function (row) {
        var camp = row.campaign || {};
        if (!camp.id) return;
        var m = row.metrics || {}, e = entry(camp);
        var acc = e.period || (e.period = { spend: 0, results: 0, sales: 0 });
        acc.spend += parseInt(m.costMicros || 0, 10) / 1000000;
        acc.results += parseFloat(m.conversions || 0);
        acc.sales += parseFloat(m.conversionsValue || 0);
      });
    }
    return order.map(function (campId) {
      var e = byCamp[campId], camp = e.camp;
      var id = 'gp-' + campId;
      var delivery = googleCampaignDelivery(camp);
      var daily = [], dailyResults = [], dailySales = [], rawResults = 0;
      days.forEach(function (day) {
        var r = e.perDay[day.key];
        daily.push(r ? r.spend : 0);
        rawResults += r ? r.results : 0;
        dailyResults.push(r ? Math.round(r.results) : 0);
        dailySales.push(r ? r.sales : 0);
      });
      var spend = daily.reduce(function (a, b) { return a + b; }, 0);
      var totalResults = Math.round(rawResults);
      var totalSales = dailySales.reduce(function (a, b) { return a + b; }, 0);
      var pRow = Array.isArray(periodRows) ? (e.period || { spend: 0, results: 0, sales: 0 }) : null;
      var name = camp.name || ('Performance Max #' + campId);
      return {
        id: id, platform: 'Google Ads', currency: currency || null,
        campaignLevel: true,
        reviewStatus: null, frequency: null,
        placement: 'Performance Max',
        campaignId: String(campId), campaignName: camp.name || null, adsetName: null, adGroupId: null,
        nativeId: String(campId),
        format: 'pmax', thumbUrl: null,
        headline: name, desc: '', offer: name, caption: '',
        landing: '—', landingKind: null,
        daysAgo: null, updatedDaysAgo: null,
        daily: daily, dailyResults: dailyResults, dailySales: dailySales, dailyDates: days.map(function (d) { return d.key; }),
        spend: spend,
        results: totalResults > 0 ? totalResults : 0,
        resultKey: 'conversion',
        cpr: (totalResults && spend > 0) ? (spend / totalResults) : null,
        roas: (totalSales > 0 && spend > 0) ? (totalSales / spend) : null,
        themeClass: 'pv-t' + (hashCode(id) % 4),
        active: delivery.active,
        pausedLevel: delivery.level,
        deliveryReason: delivery.reason || null,
        platformStatus: camp.primaryStatus || camp.status || null,
        period: pRow ? buildPeriod(pRow.spend, Math.round(pRow.results), pRow.sales) : null,
        fail: false
      };
    });
  }

  // adRows: كل الإعلانات بحالتها (من غير تاريخ) — metricRows: صف لكل إعلان × يوم فيه نشاط
  // المفتاح adGroupId-adId لأن نفس الإعلان ممكن يتكرر في أكتر من مجموعة إعلانية
  function transformGoogleRows(adRows, metricRows, days, currency, periodRows) {
    var byDate = {};
    metricRows.forEach(function (row) {
      var key = ggPick(row, 'adGroup.id') + '-' + ggPick(row, 'adGroupAd.ad.id');
      var date = ggPick(row, 'segments.date');
      if (!date) return;
      var m = row.metrics || {};
      if (!byDate[key]) byDate[key] = {};
      byDate[key][date] = {
        spend: r2(parseInt(m.costMicros || 0, 10) / 1000000),
        results: parseFloat(m.conversions || 0),
        sales: r2(parseFloat(m.conversionsValue || 0))
      };
    });
    // مجاميع الفترة المختارة (لو مش آخر ٧ أيام) — صف واحد لكل إعلان، ممكن يتكرر لو فيه أكتر من صفحة
    var periodByKey = null;
    if (Array.isArray(periodRows)) {
      periodByKey = {};
      periodRows.forEach(function (row) {
        var k = ggPick(row, 'adGroup.id') + '-' + ggPick(row, 'adGroupAd.ad.id');
        var m = row.metrics || {};
        var acc = periodByKey[k] || (periodByKey[k] = { spend: 0, results: 0, sales: 0 });
        acc.spend += parseInt(m.costMicros || 0, 10) / 1000000;
        acc.results += parseFloat(m.conversions || 0);
        acc.sales += parseFloat(m.conversionsValue || 0);
      });
    }
    return adRows.map(function (row) {
      var ad = ggPick(row, 'adGroupAd.ad') || {};
      var key = ggPick(row, 'adGroup.id') + '-' + ad.id;
      var id = 'g-' + key;
      var pRow = periodByKey && (periodByKey[key] || { spend: 0, results: 0, sales: 0 });
      var headline = (ggPick(ad, 'responsiveSearchAd.headlines.0.text')) ||
        (ggPick(ad, 'expandedTextAd.headlinePart1')) || ad.name || ('Google #' + ad.id);
      var desc = (ggPick(ad, 'responsiveSearchAd.descriptions.0.text')) ||
        (ggPick(ad, 'expandedTextAd.description')) || '';
      var adStatus = ggPick(row, 'adGroupAd.status'), agStatus = ggPick(row, 'adGroup.status'), campStatus = ggPick(row, 'campaign.status');
      var approval = ggPick(row, 'adGroupAd.policySummary.approvalStatus');
      var delivery = googleDelivery(row, adStatus, agStatus, campStatus, approval);
      var perDay = byDate[key] || {};
      var daily = [], dailyResults = [], dailySales = [];
      // تحويلات Google ممكن تكون كسور (٠٫٥ تحويلة مثلاً) — بنجمع القيم الأصلية ونقرّب الإجمالي بس،
      // عشان أيام فيها كسور صغيرة ماتتحسبش صفر
      var rawResults = 0;
      days.forEach(function (day) {
        var r = perDay[day.key];
        daily.push(r ? r.spend : 0);
        rawResults += r ? r.results : 0;
        dailyResults.push(r ? Math.round(r.results) : 0);
        dailySales.push(r ? r.sales : 0);
      });
      var spend = daily.reduce(function (a, b) { return a + b; }, 0);
      var totalResults = Math.round(rawResults);
      var totalSales = dailySales.reduce(function (a, b) { return a + b; }, 0);
      return {
        id: id, platform: 'Google Ads', currency: currency || null,
        reviewStatus: approval === 'DISAPPROVED' ? 'disapproved' : ((approval === 'APPROVED_LIMITED' || approval === 'AREA_OF_INTEREST_ONLY') ? 'limited' : null),
        frequency: null,
        placement: ggPick(row, 'campaign.name') || ggPick(row, 'adGroup.name') || '—',
        campaignId: ggPick(row, 'campaign.id') || null,
        campaignName: ggPick(row, 'campaign.name') || null,
        adsetName: ggPick(row, 'adGroup.name') || null,
        adGroupId: ggPick(row, 'adGroup.id') || null,
        nativeId: ad.id || null,
        format: (ad.type && /VIDEO/i.test(ad.type)) ? 'video' : ((ad.type && /IMAGE/i.test(ad.type)) ? 'image' : 'text'),
        thumbUrl: ggPick(ad, 'imageAd.imageUrl') || null,
        headline: headline, desc: desc, offer: headline, caption: desc || headline,
        landing: (ad.finalUrls && ad.finalUrls[0]) || '—', landingKind: 'website',
        // Google Ads API مش بيرجّع تاريخ إنشاء الإعلان — null أصدق من صفر
        daysAgo: null, updatedDaysAgo: null,
        daily: daily, dailyResults: dailyResults, dailySales: dailySales, dailyDates: days.map(function (d) { return d.key; }),
        spend: spend,
        results: totalResults > 0 ? totalResults : 0,
        resultKey: 'conversion',
        cpr: (totalResults && spend > 0) ? (spend / totalResults) : null,
        roas: (totalSales > 0 && spend > 0) ? (totalSales / spend) : null,
        themeClass: 'pv-t' + (hashCode(id) % 4),
        active: delivery.active,
        pausedLevel: delivery.level,
        deliveryReason: delivery.reason || null,
        platformStatus: ggPick(row, 'adGroupAd.primaryStatus') || adStatus || null,
        period: pRow ? buildPeriod(pRow.spend, Math.round(pRow.results), pRow.sales) : null,
        _resourceName: row.adGroupAd && row.adGroupAd.resourceName,
        fail: false
      };
    });
  }
