// Shared login / sign-up / invite-code box for the camera and viewer pages.
// An account only becomes useful once it redeems an invite code, which grants its role.
window.GarageAuth = {
  init: function (o) {
    var sb = o.sb;
    var box = o.el;
    box.innerHTML =
      '<div id="aCred">' +
        '<input id="aEmail" type="email" placeholder="Email" autocomplete="username">' +
        '<input id="aPass" type="password" placeholder="Password (at least 6 characters)" autocomplete="current-password">' +
        '<button id="aLogin">Log in</button>' +
        '<button id="aSignup" class="grey off">Create account</button>' +
        '<div class="hint">New here? Create an account, then enter the invite code you were given.</div>' +
      '</div>' +
      '<div id="aCode" style="display:none">' +
        '<div class="hint">Logged in as <span id="aWho"></span>. Enter your invite code to finish.</div>' +
        '<input id="aCodeIn" type="text" placeholder="Invite code" autocapitalize="characters" autocomplete="off">' +
        '<button id="aRedeem">Use code</button>' +
        '<button id="aOut" class="grey off">Log out</button>' +
      '</div>' +
      '<div class="err" id="aErr"></div>';

    var $ = function (id) { return document.getElementById(id); };
    function err(msg) { $('aErr').textContent = msg || ''; }
    function showCred() { $('aCred').style.display = ''; $('aCode').style.display = 'none'; }
    function showCode() {
      $('aCred').style.display = 'none';
      $('aCode').style.display = '';
      $('aWho').textContent = sb.email();
    }

    function step() {
      err('');
      return sb.role().then(function (role) {
        if (role === o.role) { o.onReady(); return; }
        if (role === null) { showCode(); return; }
        sb.logout();
        showCred();
        err('This account has a different role (' + role + '). Use a ' + o.role + ' account here.');
      }).catch(function (e) { showCred(); err(e.message); });
    }

    $('aLogin').onclick = function () {
      err('');
      sb.login($('aEmail').value.trim(), $('aPass').value).then(step)
        .catch(function (e) { err(e.message); });
    };

    $('aSignup').onclick = function () {
      err('');
      sb.signup($('aEmail').value.trim(), $('aPass').value).then(function (res) {
        if (res.needsConfirm) {
          err('Check your email and click the confirmation link, then come back and log in.');
          return;
        }
        return step();
      }).catch(function (e) { err(e.message); });
    };

    $('aRedeem').onclick = function () {
      err('');
      sb.rpc('redeem_invite', { p_code: $('aCodeIn').value }).then(step)
        .catch(function (e) { err(e.message.replace(/^\d+\s*/, '')); });
    };

    $('aOut').onclick = function () { sb.logout(); showCred(); };

    return {
      start: function () { if (sb.loggedIn()) { step(); } else { showCred(); } },
      show: function () { showCred(); }
    };
  }
};
