// =====================================================================
// Ads Center — Snapchat
// =====================================================================
// تسجيل الدخول بإعادة توجيه الصفحة كلها، الحسابات، تحميل الإعلانات وحالة التشغيل.
// checkSnapchatRedirect() بتتنادى من main.js بعد ما كل الملفات تتحمّل.
// الملفات بتتحمّل بالترتيب ده وبتتشارك نفس النطاق العام (من غير bundler):
//   i18n → alerts → core → meta → google → snapchat → tiktok → ui → route → main
// أي كود بيتنفّذ وقت التحميل مسموحله يستخدم اللي في الملفات اللي قبله بس — الباقي جوه دوال.

  // ---------- Snapchat: تدفّق إعادة توجيه كامل الصفحة (مش نافذة منبثقة زي Meta/Google) ----------
  // !!! هام: عدّل بالـ Client ID بتاعك من Snap Business Manager !!!
  var SNAPCHAT_CLIENT_ID = "00315198-57f5-4c42-98f0-c0396d0053f5"
  var snapchatAccessToken = null;

  function loginWithSnapchat() {
    platformOverlay.classList.add('hidden');
    var redirectUri = oauthReturnUrl();
    var authUrl = 'https://accounts.snapchat.com/login/oauth2/authorize' +
      '?client_id=' + encodeURIComponent(SNAPCHAT_CLIENT_ID) +
      '&redirect_uri=' + encodeURIComponent(redirectUri) +
      '&response_type=code&scope=snapchat-marketing-api&state=' + encodeURIComponent(newOauthState('snapchat'));
    saveSession(); // احتياطي قبل ما الصفحة تتقفل — المنصات المحمّلة هترجع بعد الرجوع من Snapchat
    PageExit.leave(authUrl); // توجيه كامل الصفحة، مش نافذة منبثقة — طبيعة تدفّق Snapchat نفسه. PageExit (route.js) بيوقف الرابط عشان ميلغيش النقل
  }

  function exchangeSnapchatCode(code) {
    var redirectUri = oauthReturnUrl();
    setStatus(msg('s.finishingLogin', { platform: 'Snapchat' }));
    apiPost('/api/snapchat-token', { code: code, redirectUri: redirectUri }).then(function (res) {
      var data = res.data;
      if (data && data.access_token) {
        // النسخة المقفولة من مفتاح التجديد — بتتحفظ على الجهاز عشان الجلسة تتجدد من غير دخول (core.js)
        if (data.sealed) keepSealed('snapchat', data.sealed);
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
    // الربط مع Snapchat بيخلص بعد ساعة (توثيق Snapchat: ٣٦٠٠ ثانية) — بنقول كده بوضوح بدل رسالة خطأ تقنية
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
      var snapCandidates = transformSnapchatAds(adsList, statsList, daysFromRange(payload.range), payload.account && payload.account.currency, payload.squads, payload.campaigns, payload.periodStats,
        payload.storeStats ? payload.storeStats.timeseries_stats || [] : null, payload.periodStoreStats, payload.creatives, payload.media);
      mergeCandidates(snapCandidates, 'snapchat:' + adAccountId);
      // «إنفاق هذا الشهر دون طلبات» زي Meta (api/snapchat-ads-fetch.js snapMonthWaste) — بعملة الحساب، ومبيتحفظش
      if (typeof monthWaste !== 'undefined') {
        if (payload.monthWaste) monthWaste['snapchat:' + adAccountId] = Object.assign({ currency: (payload.account && payload.account.currency) || null }, payload.monthWaste);
        else delete monthWaste['snapchat:' + adAccountId];
      }
      cacheSource('snapchat:' + adAccountId, snapCandidates);
      setPlatformState('snapchat', null);
      // طلب الفترة المختارة فشل: الكروت بأرقام آخر ٧ أيام — بنقول ده زي Meta (مراجعة المرحلة ٤، ١٧ أكتوبر ٢٠٢٦: كانت بتظهر من غير إشارة
      // تحت اسم الفترة المختارة)
      var snapNotes = payload.statsError ? [msg('note.spendFailed', { msg: payload.statsError })] : (payload.periodStats ? [] : [msg('note.periodFailed')]);
      setLoading('snapchat', false, connectedText(snapNotes));
      render();
      loadSnapchatDiagnosis(adAccountId, payload.account || {}, token);
      // صور الفيديوهات الأول (بتبان على الكروت)، وبعدها سجل التعديلات — ورا بعض عشان حد سرعة Snapchat (١٠ في الثانية للمفتاح)
      loadSnapchatThumbs(adAccountId, token).then(function () { return loadSnapchatCatalog(adAccountId, token); }).then(function () {
        loadSnapchatEdits(adAccountId, (payload.account && payload.account.timezone) || BROWSER_TZ, token);
      });
    }).catch(function (err) {
      if (!isCurrentLoad('snapchat', token)) return;
      fail(msg('s.adsFailed', { platform: 'Snapchat', msg: err.message }));
    });
  }

  // ملخص المتجر (Snapchat): بعد ما الإعلانات تظهر، بتوقيت الحساب وعملته اللي رجعوا مع الإعلانات.
  // السيرفر (action=diagnosis في api/snapchat-ads-fetch.js) بيرجّع أرقام محرك التشخيص. لم يُختبر على حساب حقيقي بعد
  function loadSnapchatDiagnosis(adAccountId, account, token) {
    if (!DX_ON || !window.DX) return;
    var tz = account.timezone || BROWSER_TZ, p = dxPeriodFor(tz), ws = DX.windows(p.since, p.until);
    var key = adAccountId + '|' + p.since + '|' + p.until;
    var opt = (platformOptions.snapchat || []).filter(function (o) { return o.value === adAccountId; })[0];
    var name = opt ? String(opt.label).replace(/^Snapchat — /, '') : adAccountId;
    if (!dxBegin('snapchat', key, name, 'snapchat:' + adAccountId)) return;
    apiPost('/api/snapchat-ads-fetch', {
      accessToken: snapchatAccessToken, action: 'diagnosis', adAccountId: adAccountId, clientTz: BROWSER_TZ,
      daily: { since: ws[ws.length - 1].since, until: p.until },
      windows: ws.slice(0, 3).map(function (w) { return { since: w.since, until: w.until }; })
    }).then(function (res) {
      if (!isCurrentLoad('snapchat', token)) return;
      if (isAuthFailure(res)) { markExpired('snapchat'); dxFail('snapchat', key, null); return; }
      if (!res.ok || !res.data || res.data.error) { dxFail('snapchat', key, res.data); return; }
      dxDone('snapchat', key, { since: p.since, until: p.until, currency: account.currency || null, timezone: tz,
        daily: res.data.daily || [], dims: res.data.dims || [] });
    }).catch(function (err) { dxFail('snapchat', key, err); });
  }

  // صور فيديوهات الإعلانات للكروت ولغلاف الفيديو في التفاصيل (طلب صاحب المنتج ٢٥ أكتوبر: «لا توجد صورة Preview لإعلانات سناب شات
  // من الخارج ولا من داخل الكارت»): توثيق Snap «Get Media Thumbnail» (VIDEO بس) — api/snapchat-ads-fetch.js action=thumbs، دفعات ورا
  // بعض في الخلفية. الرابط موقّع وبيخلص، فبيتجاب مع كل تحميل. فشل = الكارت زي ما كان
  function loadSnapchatThumbs(adAccountId, token) {
    var source = 'snapchat:' + adAccountId, ids = {};
    candidates.forEach(function (c) { if (c.source === source && c.format === 'video' && c.snapMediaId && !c.thumbUrl) ids[c.snapMediaId] = 1; });
    var all = Object.keys(ids), found = {}, next = 0;
    if (!all.length) return Promise.resolve();
    var step = function () {
      if (next >= all.length || !isCurrentLoad('snapchat', token)) return Promise.resolve();
      var batch = all.slice(next, next + SNAP_CHANGE_BATCH);
      next += SNAP_CHANGE_BATCH;
      return apiPost('/api/snapchat-ads-fetch', { accessToken: snapchatAccessToken, action: 'thumbs', media: batch }).then(function (res) {
        if (res.ok && res.data && res.data.thumbs) Object.keys(res.data.thumbs).forEach(function (k) { found[k] = res.data.thumbs[k]; });
      }, function () { /* الدفعة دي من غير صور */ }).then(step);
    };
    return step().then(function () {
      if (!isCurrentLoad('snapchat', token)) return;
      var changed = false;
      candidates.forEach(function (c) {
        var u = c.source === source && c.snapMediaId && safeUrl(found[c.snapMediaId]);
        if (u && c.thumbUrl !== u) { c.thumbUrl = u; changed = true; }
      });
      if (changed) render();
    }).catch(function () { /* من غير صور */ });
  }
  // منتجات إعلانات الكتالوج (طلب صاحب المنتج ٢٥ أكتوبر — إعلان الكتالوج كان «إعلان مجموعة منتجات» من غير صورة، ومعاينة Snapchat نفسها
  // بتقول «Preview Not Supported» له): أول المنتجات في كل مجموعة (api/snapchat-ads-fetch.js action=products — طلبين لكل مجموعة)، صورة
  // أول منتج للكارت، والمنتجات جوه الإعلان (ui.js snapMediaView). snapProducts[المجموعة] = المنتجات (فاضية = مفيش)
  var snapProducts = {};
  function loadSnapchatCatalog(adAccountId, token) {
    var source = 'snapchat:' + adAccountId, sets = {};
    candidates.forEach(function (c) { if (c.source === source && c.snapProductSetId && !(c.snapProductSetId in snapProducts)) sets[c.snapProductSetId] = 1; });
    var all = Object.keys(sets), next = 0;
    var step = function () {
      if (next >= all.length || !isCurrentLoad('snapchat', token)) return Promise.resolve();
      var id = all[next++];
      return apiPost('/api/snapchat-ads-fetch', { accessToken: snapchatAccessToken, action: 'products', productSetId: id }).then(function (res) {
        if (res.ok && res.data && Array.isArray(res.data.products)) snapProducts[id] = res.data.products;
      }, function () { /* من غير منتجات */ }).then(step);
    };
    return step().then(function () {
      if (!isCurrentLoad('snapchat', token)) return;
      var changed = false;
      candidates.forEach(function (c) {
        if (c.source !== source || !c.snapProductSetId || c.thumbUrl) return;
        var first = (snapProducts[c.snapProductSetId] || []).filter(function (p) { return p && safeUrl(p.image); })[0];
        if (first) { c.thumbUrl = safeUrl(first.image); changed = true; }
      });
      if (changed) render();
    }).catch(function () { /* من غير منتجات */ });
  }
  // تعديلات الحملات والمجموعات والإعلانات الشغّالة في آخر ٨ أيام — وسم «عُدّل…» على الكارت زي Meta (meta.js loadAdEdits؛ طلب صاحب
  // المنتج ٢٥ أكتوبر: «الحملات والمجموعات والاعلانات ايضاً، واذا وجدنا مشكلة فيما بعد نلغي الاعلانات»). سجل لكل عنصر
  // (api/snapchat-ads-fetch.js action=changes) في دفعات (حد الطلبات في Cloudflare)، دفعة ورا دفعة (حد سرعة Snapchat — الخادم بيبعت ٥
  // في الثانية)، في الخلفية بعد ما الأرقام تظهر. فشل أي عنصر = من غير وسم. فحص حي ٢٥ أكتوبر: دفعتين في نفس الوقت = ٣٦ من ٨٠ فشلوا
  var SNAP_CHANGE_BATCH = 20, SNAP_CHANGE_PARALLEL = 1, SNAP_EDIT_DAYS = 8;
  var SNAP_EDIT_LEVEL = { campaign: 'campaign', adsquad: 'adset', ad: 'ad' };
  // تغيير واحد في السجل ← تعديلات بشكل Meta ({kind, level, date, time, from, to}). الميزانية بالمايكرو (unit — alerts.js editText)، وأقل
  // من ٢٠٪ مش تعديل (نفس حد Meta: diagnosis.js ACT_MIN_BUDGET). المزايدة نوع لسناب شات بس. الإيقاف مش وسم (الإعلان المتوقف مبيتحكمش عليه)
  function snapEditsOf(ch, tz) {
    var level = ch && SNAP_EDIT_LEVEL[ch.level], date = level && ch.at ? DX._.keyInTz(ch.at, tz) : null, f = (ch && ch.fields) || {}, out = [];
    if (!date) return out;
    var add = function (kind, extra) {
      if (kind !== 'budget' && out.some(function (e) { return e.kind === kind; })) return;
      out.push(Object.assign({ kind: kind, level: level, date: date, time: String(ch.at), from: null, to: null }, extra || {}));
    };
    Object.keys(f).forEach(function (k) {
      var r = f[k] || {};
      if (/budget_micro$|spend_cap_micro$/.test(k)) {
        var o = Number(r.before), n = Number(r.after);
        if (o > 0 && n > 0 && Math.abs(n / o - 1) >= 0.2) add('budget', { from: o, to: n, unit: 1e6 });
      } else if (/^targeting/.test(k)) add('targeting');
      else if (/^(bid_micro|bid_strategy|auto_bid|target_bid)$/.test(k)) add('bid');
      else if (k === 'creative_id' && r.before != null && r.after != null && String(r.before) !== String(r.after)) add('creative');
      else if (k === 'status' && /^paused$/i.test(String(r.before)) && /^active$/i.test(String(r.after))) add('resume');
    });
    return out;
  }
  function loadSnapchatEdits(adAccountId, tz, token) {
    if (!window.DX || !DX._ || typeof DX._.keyInTz !== 'function') return;
    var source = 'snapchat:' + adAccountId, want = { campaign: {}, adsquad: {}, ad: {} };
    candidates.forEach(function (c) {
      if (c.source !== source || !c.active) return;
      if (c.campaignId) want.campaign[c.campaignId] = 1;
      if (c.adsetId) want.adsquad[c.adsetId] = 1;
      if (c.nativeId) want.ad[c.nativeId] = 1;
    });
    var all = [];
    ['campaign', 'adsquad', 'ad'].forEach(function (l) { Object.keys(want[l]).forEach(function (id) { all.push({ level: l, id: id }); }); });
    if (!all.length) return;
    var batches = [];
    for (var i = 0; i < all.length; i += SNAP_CHANGE_BATCH) batches.push(all.slice(i, i + SNAP_CHANGE_BATCH));
    var found = [], next = 0;
    var worker = function () {
      if (next >= batches.length || !isCurrentLoad('snapchat', token)) return Promise.resolve();
      var ids = { campaign: [], adsquad: [], ad: [] };
      batches[next++].forEach(function (x) { ids[x.level].push(x.id); });
      return apiPost('/api/snapchat-ads-fetch', { accessToken: snapchatAccessToken, action: 'changes', ids: ids }).then(function (res) {
        if (res.ok && res.data && Array.isArray(res.data.changes)) found = found.concat(res.data.changes);
      }, function () { /* الدفعة دي من غير وسم */ }).then(worker);
    };
    var pool = [];
    for (var w = 0; w < SNAP_CHANGE_PARALLEL; w++) pool.push(worker());
    Promise.all(pool).then(function () {
      if (!isCurrentLoad('snapchat', token)) return;
      var since = shiftKey(todayKeyInTz(tz), -SNAP_EDIT_DAYS), byObj = {};
      found.forEach(function (ch) {
        snapEditsOf(ch, tz).forEach(function (e) { if (e.date >= since) (byObj[ch.level + ':' + ch.id] = byObj[ch.level + ':' + ch.id] || []).push(e); });
      });
      var changed = false;
      candidates.forEach(function (c) {
        if (c.source !== source) return;
        var list = [].concat(byObj['ad:' + c.nativeId] || [], (c.adsetId && byObj['adsquad:' + c.adsetId]) || [], (c.campaignId && byObj['campaign:' + c.campaignId]) || [])
          .sort(function (x, y) { return x.time < y.time ? -1 : (x.time > y.time ? 1 : 0); });
        var v = list.length ? list : null;
        if (JSON.stringify(c.edits || null) !== JSON.stringify(v)) { c.edits = v; changed = true; }
      });
      if (changed) render();
    }).catch(function () { /* من غير وسم */ });
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

  // storeList/periodStore = «الأقرب للمتجر» (٧ أيام من السوايب، من غير المشاهدة — api/snapchat-ads-fetch.js) بنفس شكل
  // statsList/periodStats. null = مفيش مقارنة، والأرقام هي أرقام المنصة زي الأول
  function transformSnapchatAds(adsList, statsList, days, currency, squads, campaigns, periodStats, storeList, periodStore, creatives, media) {
    var squadsById = {}, campaignsById = {};
    (squads || []).forEach(function (s) { squadsById[s.id] = s; });
    (campaigns || []).forEach(function (c) { campaignsById[c.id] = c; });
    // مع breakdown=ad الإحصائيات بتيجي جوه breakdown_stats.ad[] تحت الحساب —
    // الـ id اللي في المستوى الأعلى هو id الحساب مش الإعلان
    var seriesByAd = function (list) {
      var out = {};
      list.forEach(function (entry) {
        var ts = entry.timeseries_stat || entry;
        var perAd = ts.breakdown_stats && ts.breakdown_stats.ad;
        if (perAd) { perAd.forEach(function (b) { out[b.id] = b.timeseries || []; }); }
        else if (ts.id) { out[ts.id] = ts.timeseries || []; }
      });
      return out;
    };
    var statsByAd = seriesByAd(statsList), storeByAd = storeList ? seriesByAd(storeList) : null;
    var dayMap = function (series) {
      var byDay = {};
      (series || []).forEach(function (r) { byDay[(r.start_time || '').slice(0, 10)] = r.stats || r; });
      return byDay;
    };
    // القيم المالية في Snapchat بالمايكرو (÷ 1,000,000) — بدقتها الكاملة من غير تقريب لحد العرض (money). المرحلة ٤:
    // التقريب لأقرب سنت لكل إعلان في كل يوم (٥٥ إعلان × ٧ أيام) كان بيتراكم: إجمالي ٥١٠٫٠٠ قصاد ٥٠٩٫٩٨ عند Snapchat
    var parsed = adsList.map(function (item) {
      var ad = item.ad || item;
      var byDay = dayMap(statsByAd[ad.id]), storeDay = storeByAd ? dayMap(storeByAd[ad.id]) : null;
      var p = { ad: ad, daily: [], swipes: [], purchases: [], sales: [], storePurchases: [], storeSales: [] };
      days.forEach(function (day) {
        var st = byDay[day.key];
        p.daily.push(st ? parseFloat(st.spend || 0) / 1000000 : 0);
        p.swipes.push(st ? Math.round(parseFloat(st.swipes || 0)) : 0);
        var pur = st ? Math.round(parseFloat(st.conversion_purchases || 0)) : 0;
        var sales = st ? parseFloat(st.conversion_purchases_value || 0) / 1000000 : 0;
        p.purchases.push(pur);
        p.sales.push(sales);
        if (storeDay) {
          // من غير حد أعلى برقم المنصة (المرحلة ٤، ١٧ أكتوبر ٢٠٢٦): رقم المنصة بقى بيوم ظهور الإعلان زي Ads Manager، و«الأقرب»
          // بيوم الشراء، فالرقمين على أساسين مختلفين وممكن «الأقرب» يزيد في يوم أو لإعلان (حساب حقيقي: إعلان إنفاقه صفر في
          // الفترة، ليه طلب بيوم الشراء وصفر بيوم الظهور). الحد كان هيقلّل أرقام صحيحة
          var sd = storeDay[day.key];
          p.storePurchases.push(sd ? Math.round(parseFloat(sd.conversion_purchases || 0)) : 0);
          p.storeSales.push(sd ? parseFloat(sd.conversion_purchases_value || 0) / 1000000 : 0);
        }
      });
      return p;
    });
    // لو الحساب بيسجّل مشتريات (Snap Pixel) نعتبرها النتيجة لكل إعلاناته، وإلا نرجع للسوايب —
    // قرار واحد على مستوى الحساب عشان المقارنة بين الإعلانات تفضل عادلة
    var tracksPurchases = parsed.some(function (p) { return p.purchases.some(function (v) { return v > 0; }); });
    // نوع نتيجة كل إعلان من هدف مجموعته (optimization_goal — توثيق Snapchat Ad Squads) زي Meta، ولو الهدف مش موجود القرار القديم
    // على مستوى الحساب. مراجعة المرحلة ٤ (ر٧٧): القرار كان من مشتريات الحساب في آخر ٧ أيام بس — حساب مبيعات وقفت مشترياته أسبوع
    // (تتبّع وقع أو مفيش بيع) كان بيتحكم على إعلاناته بالسوايب وبيطلع «جيد» بدل «إنفاق دون طلبات»
    var SNAP_BUY = { PIXEL_PURCHASE: 1, APP_PURCHASE: 1, APP_REENGAGE_PURCHASE: 1 };
    var buyOf = function (ad) {
      var sq = squadsById[ad.ad_squad_id], g = sq && sq.optimization_goal;
      return g ? !!SNAP_BUY[g] : tracksPurchases;
    };
    // المقارنة («الأقرب للمتجر» جنب رقم المنصة) لإعلانات المشتريات بس — السوايب مفيهاش نسب للإعلان من الأساس (cmp تحت لكل إعلان)
    // مجاميع الفترة المختارة (granularity=TOTAL) — رقم واحد لكل إعلان جوه breakdown_stats.ad
    var totalsByAd = function (data, fn) {
      var out = {};
      (data.total_stats || data.timeseries_stats || []).forEach(function (entry) {
        var ts = entry.total_stat || entry.timeseries_stat || entry;
        ((ts.breakdown_stats && ts.breakdown_stats.ad) || []).forEach(function (b) { out[b.id] = fn(b.stats || {}); });
      });
      return out;
    };
    var periodByAd = periodStats ? totalsByAd(periodStats, function (st) {
      return {
        spend: parseFloat(st.spend || 0) / 1000000,
        pur: parseFloat(st.conversion_purchases || 0), purSales: parseFloat(st.conversion_purchases_value || 0) / 1000000, swipes: parseFloat(st.swipes || 0)
      };
    }) : null;
    var periodStoreByAd = storeByAd && periodByAd && periodStore ? totalsByAd(periodStore, function (st) {
      return { results: parseFloat(st.conversion_purchases || 0), sales: parseFloat(st.conversion_purchases_value || 0) / 1000000 };
    }) : null;
    // الإجماليات = الأيام المكتملة بس (آخر خانة = النهارده، بتظهر لوحدها في الجدول) — زي meta.js
    var sum = function (a) { return a.slice(0, a.length - 1).reduce(function (x, y) { return x + y; }, 0); };
    return parsed.map(function (p) {
      var ad = p.ad;
      var delivery = snapchatDelivery(ad, squadsById, campaignsById);
      var buy = buyOf(p.ad), cmp = buy && !!storeByAd;
      var pr = periodByAd && (periodByAd[ad.id] || { spend: 0, pur: 0, purSales: 0, swipes: 0 });
      var pRow = pr && { spend: pr.spend, results: buy ? pr.pur : pr.swipes, sales: buy ? pr.purSales : 0 };
      var id = 's-' + ad.id;
      var squad = squadsById[ad.ad_squad_id] || null;
      var campaign = squad ? (campaignsById[squad.campaign_id] || null) : null;
      var dailyResults = cmp ? p.storePurchases : (buy ? p.purchases : p.swipes);
      var dailySales = cmp ? p.storeSales : (buy ? p.sales : p.daily.map(function () { return 0; }));
      var spend = sum(p.daily);
      var results = sum(dailyResults);
      var totalSales = sum(dailySales);
      // المحتوى والوسيط من السيرفر (api/snapchat-ads-fetch.js): نوع الإعلان من الوسيط نفسه — نوع الإعلان في Snapchat (STORY،
      // REMOTE_WEBPAGE…) مبيقولش صورة ولا فيديو، فكل الإعلانات كانت «صورة ثابتة» حتى الفيديو
      var cr = creatives && ad.creative_id ? creatives[ad.creative_id] || null : null;
      var md = cr && cr.mediaId && media ? media[cr.mediaId] || null : null;
      var landing = (cr && safeUrl(cr.url)) || null;
      // الفترة المختارة: «الأقرب للمتجر» لو طلبه رجع، وإلا رقم المنصة من غير مقارنة (زي قبل الميزة)
      var period = null;
      if (pRow) {
        var ps = cmp && periodStoreByAd ? (periodStoreByAd[ad.id] || { results: 0, sales: 0 }) : null;
        period = ps ? buildPeriod(pRow.spend, Math.round(ps.results), ps.sales)
          : buildPeriod(pRow.spend, Math.round(pRow.results), pRow.sales);
        if (ps) period.plat = { results: Math.round(pRow.results), sales: pRow.sales };
      }
      return {
        id: id, platform: 'Snapchat', currency: currency || null,
        placement: (campaign && campaign.name) || (squad && squad.name) || '—',
        campaignId: (squad && squad.campaign_id) || null,
        campaignName: (campaign && campaign.name) || null,
        // المجموعة (Ad Squad) هي اللي شايلة الميزانية والاستهداف لمجموعة إعلانات (مستند مطوّري سناب شات: ad squads —
        // daily_budget_micro أو lifetime_budget_micro مطلوب عليها). فالإعلان الجديد فيها بياخد من نصيب القديم —
        // alerts.js ق٦ (قرار صاحب المنتج ١٩ أكتوبر: وسّع القاعدة لسناب شات كذلك، بسبب تقاسم الميزانية وحده)
        adsetId: ad.ad_squad_id || null,
        adsetName: (squad && squad.name) || null,
        nativeId: ad.id,
        // صورة الفيديو (loadSnapchatThumbs) ومعاينة الوسيط والإعلان كاملاً عند فتحه (ui.js snapMediaView — action=preview)
        snapMediaId: (cr && cr.mediaId) || null, snapCreativeId: ad.creative_id || null,
        // إعلان الكتالوج: منتجات المجموعة (loadSnapchatCatalog)، ومعاينة Snapchat مش مدعومة ليه (snapDynamic)
        snapProductSetId: (cr && cr.productSetId) || null, snapDynamic: !!(cr && cr.dynamic),
        reviewStatus: /REJECT|DENY/i.test(ad.review_status || '') ? 'disapproved' : null,
        frequency: null,
        format: md && md.type === 'VIDEO' ? 'video' : 'image',
        // الصورة رابطها مباشر. الفيديو ملف كامل (عشرات الميجا) — مبيتحمّلش على الكارت، بيشتغل في التفاصيل لما العميل يضغط
        thumbUrl: md && md.type === 'IMAGE' ? md.url || null : null,
        videoSrc: md && md.type === 'VIDEO' ? md.url || null : null,
        headline: (cr && cr.headline) || ad.name || ('Snapchat #' + ad.id), desc: (cr && cr.brand) || '',
        offer: ad.name || id, caption: (cr && cr.headline) || '',
        cta: (cr && cr.cta) || null,
        // إعلانات من غير وسيط واحد: مجموعة منتجات (COLLECTION) أو قصة من كذا لقطة (COMPOSITE) — مش «صورة ثابتة»
        badgeKey: cr && cr.type === 'COLLECTION' ? 'card.snapCollection' : (cr && cr.type === 'COMPOSITE' ? 'card.snapStory' : null),
        landing: landing || '—', landingKind: landing ? 'website' : null,
        daysAgo: ad.created_at ? daysBetween(ad.created_at) : null,
        updatedDaysAgo: ad.updated_at ? daysBetween(ad.updated_at) : null,
        daily: p.daily, dailySales: dailySales, dailyResults: dailyResults, dailyDates: days.map(function (d) { return d.key; }),
        spend: spend, results: results, resultKey: buy ? 'purchase' : 'swipe',
        cpr: (results && spend) ? (spend / results) : null,
        roas: (totalSales > 0 && spend > 0) ? (totalSales / spend) : null, sales: totalSales,
        themeClass: 'pv-t' + (hashCode(id) % 4),
        active: delivery.active, pausedLevel: delivery.level,
        deliveryReason: null, platformStatus: ad.status || null,
        period: period,
        // رقم المنصة جنب «الأقرب للمتجر» (core.js platOf) — زي Meta
        plat: cmp ? { results: sum(p.purchases), sales: sum(p.sales) } : null,
        // أساس أرقامنا هنا = الطلبات المسجّلة في المتجر (مش النقر زي Meta) — alerts.js بيكتب سبب الفرق صح
        // (ر٤٣ المرحَّل للمرحلة ٥): «بعد مشاهدته دون نقر» وصف غلط لسناب شات، الفرق هنا مصدر الرقم ونوافذ النسب
        baseStore: !!cmp,
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
