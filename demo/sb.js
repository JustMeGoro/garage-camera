// Minimal Supabase REST client (fetch only, no library) so it runs on old Chrome / Android 5.1.
window.makeSb = function (storeKey) {
  var cfg = window.GARAGE_CONFIG;
  var session = null;
  try { session = JSON.parse(localStorage.getItem(storeKey)); } catch (e) {}

  function save(s) {
    session = s;
    try {
      if (s) { localStorage.setItem(storeKey, JSON.stringify(s)); } else { localStorage.removeItem(storeKey); }
    } catch (e) {}
  }

  function tokenRequest(grant, body, email) {
    return fetch(cfg.url + '/auth/v1/token?grant_type=' + grant, {
      method: 'POST',
      headers: { apikey: cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) { throw new Error(j.error_description || j.msg || 'Login failed'); }
        save({
          access_token: j.access_token,
          refresh_token: j.refresh_token,
          expires_at: Date.now() + (j.expires_in - 60) * 1000,
          email: email || (session && session.email) || '',
          user_id: j.user ? j.user.id : (session && session.user_id)
        });
      });
    });
  }

  function ensure() {
    if (!session) { return Promise.reject(new Error('Not logged in')); }
    if (Date.now() < session.expires_at) { return Promise.resolve(); }
    return tokenRequest('refresh_token', { refresh_token: session.refresh_token });
  }

  function api(path, opts) {
    return ensure().then(function () {
      opts = opts || {};
      var headers = opts.headers || {};
      headers.apikey = cfg.key;
      headers.Authorization = 'Bearer ' + session.access_token;
      opts.headers = headers;
      return fetch(cfg.url + path, opts).then(function (r) {
        if (r.status === 401) { save(null); }
        if (!r.ok) {
          return r.text().then(function (t) { throw new Error(r.status + ' ' + t); });
        }
        return r;
      });
    });
  }

  return {
    loggedIn: function () { return !!session; },
    email: function () { return session ? session.email : ''; },
    userId: function () { return session ? session.user_id : ''; },
    login: function (email, password) {
      return tokenRequest('password', { email: email, password: password }, email);
    },
    logout: function () { save(null); },
    // Resolves { needsConfirm: true } when the project requires email confirmation first.
    signup: function (email, password) {
      return fetch(cfg.url + '/auth/v1/signup', {
        method: 'POST',
        headers: { apikey: cfg.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password })
      }).then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) { throw new Error(j.msg || j.error_description || 'Sign-up failed'); }
          if (!j.access_token) { return { needsConfirm: true }; }
          save({
            access_token: j.access_token,
            refresh_token: j.refresh_token,
            expires_at: Date.now() + (j.expires_in - 60) * 1000,
            email: email,
            user_id: j.user ? j.user.id : ''
          });
          return { needsConfirm: false };
        });
      });
    },
    rpc: function (name, args) {
      return api('/rest/v1/rpc/' + name, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args || {})
      }).then(function (r) { return r.json(); });
    },
    role: function () {
      return api('/rest/v1/profiles?select=role').then(function (r) { return r.json(); })
        .then(function (rows) { return rows.length ? rows[0].role : null; });
    },
    upload: function (path, blob) {
      return api('/storage/v1/object/garage-photos/' + path, {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob
      });
    },
    insertEvent: function (row) {
      return api('/rest/v1/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(row)
      });
    },
    listCameras: function () {
      return api('/rest/v1/cameras?select=id,name,created_at,last_seen,pinged_at,motion_now,sensitivity,cooldown_s,adapt_s,armed,snapshot_requested,ntfy_topic,live_until&order=created_at.asc')
        .then(function (r) { return r.json(); });
    },
    updateCamera: function (id, patch) {
      return api('/rest/v1/cameras?id=eq.' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(patch)
      });
    },
    getRtcAnswer: function (id) {
      return api('/rest/v1/cameras?id=eq.' + id + '&select=rtc_answer')
        .then(function (r) { return r.json(); })
        .then(function (rows) { return rows.length ? rows[0].rtc_answer : null; });
    },
    deleteObject: function (path) {
      return api('/storage/v1/object/garage-photos/' + path, { method: 'DELETE' });
    },
    deleteCamera: function (id) {
      return api('/rest/v1/cameras?id=eq.' + id, { method: 'DELETE' });
    },
    listEvents: function (limit) {
      return api('/rest/v1/events?select=id,camera_id,created_at,kind,photo_path,motion_pct&order=created_at.desc&limit=' + limit)
        .then(function (r) { return r.json(); });
    },
    signPaths: function (paths) {
      if (!paths.length) { return Promise.resolve({}); }
      return api('/storage/v1/object/sign/garage-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: 3600, paths: paths })
      }).then(function (r) { return r.json(); }).then(function (list) {
        var map = {};
        list.forEach(function (x) { if (x.signedURL) { map[x.path] = cfg.url + '/storage/v1' + x.signedURL; } });
        return map;
      });
    },
    deleteEvent: function (id, path) {
      return api('/storage/v1/object/garage-photos/' + path, { method: 'DELETE' }).then(function () {
        return api('/rest/v1/events?id=eq.' + id, { method: 'DELETE' });
      });
    }
  };
};
