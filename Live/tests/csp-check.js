// بيسجّل أي مخالفة للسياسة من أول لحظة، وبعدين بيحمّل المكتبات الحقيقية ويجرّبها — النتيجة في window.__csp
(function () {
  var violations = [];
  document.addEventListener('securitypolicyviolation', function (e) {
    violations.push({ directive: e.violatedDirective, blocked: e.blockedURI, source: e.sourceFile, line: e.lineNumber, sample: e.sample });
  });
  var steps = {};
  function load(src, id) {
    return new Promise(function (resolve) {
      var s = document.createElement('script'); s.src = src; if (id) s.id = id; s.async = true;
      s.onload = function () { resolve('loaded'); }; s.onerror = function () { resolve('failed'); };
      document.head.appendChild(s);
    });
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  window.fbAsyncInit = function () { steps.fbAsyncInit = true; };
  // تأكيد إن المراقبة شغّالة: سكربت مكتوب جوه الصفحة لازم يتمنع ويتسجّل
  function selfCheck() {
    var s = document.createElement('script'); s.textContent = 'window.__inlineRan = true;'; document.head.appendChild(s);
  }
  window.__csp = { done: false };
  Promise.resolve().then(function () {
    selfCheck();
    return Promise.all([load('https://connect.facebook.net/en_US/sdk.js', 'facebook-jssdk'), load('https://accounts.google.com/gsi/client')]);
  }).then(function (r) {
    steps.fbScript = r[0]; steps.gisScript = r[1];
    if (window.FB) {
      FB.init({ appId: '2950488078638871', cookie: true, xfbml: false, version: 'v26.0' });
      steps.fbInit = 'ok';
      return new Promise(function (res) {
        var done = false;
        FB.getLoginStatus(function (resp) { done = true; steps.fbLoginStatus = resp && resp.status; res(); });
        setTimeout(function () { if (!done) { steps.fbLoginStatus = 'timeout'; res(); } }, 8000);
      });
    }
  }).then(function () {
    if (window.FB) {
      return new Promise(function (res) {
        FB.api('/me', function (resp) { steps.fbApi = resp && resp.error ? 'error ' + resp.error.code : 'ok'; res(); });
        setTimeout(res, 6000);
      });
    }
  }).then(function () {
    if (window.google && google.accounts && google.accounts.oauth2) {
      google.accounts.oauth2.initTokenClient({ client_id: '755601072390-jvljtdc8799o59fjffvtq43p70765jqn.apps.googleusercontent.com', scope: 'https://www.googleapis.com/auth/adwords', callback: function () {} });
      steps.gisInit = 'ok';
    }
    return wait(2000);
  }).then(function () {
    var isSelf = function (v) { return v.blocked === 'inline' && /csp-check\.js/.test(v.source || ''); };
    var selfCaught = violations.some(isSelf);
    var others = violations.filter(function (v) { return !isSelf(v); });
    window.__csp = { done: true, monitorWorks: selfCaught && !window.__inlineRan, steps: steps, sdkViolations: others };
    document.getElementById('out').textContent = JSON.stringify(window.__csp, null, 2);
  });
})();
