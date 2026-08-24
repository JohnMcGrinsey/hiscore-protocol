/*! gs.js: optional one script line for the HISCORE protocol.
    The protocol itself is plain HTTP and does not need this script:
      https://gamesareeatingtheworld.com/hiscore.txt
    This line is the convenience (name prompt, board overlay, session work):
      <script src="https://gamesareeatingtheworld.com/gs.js" data-key="YOUR_KEY"></script>
    Optional companion package HISCORE-VIDEO (a clip on a score, same version):
      https://gamesareeatingtheworld.com/hiscore-video.txt
    Usage:
      GS.submit(1234)            submit a score, asks for the name once
      GS.submit(1234, { version: '1.4.0' })   with a version, better
      GS.show()                  show the leaderboard
    Everything runs in a shadow DOM, your game's CSS is never touched. */
(function () {
  'use strict';
  if (window.GS) return;

  var self = document.currentScript;
  var KEY = (self && self.dataset.key) || '';
  var BASE = (function () {
    try { return new URL(self.src).origin; } catch (e) { return 'https://gamesareeatingtheworld.com'; }
  })();
  var NAME_KEY = 'gaetw.player';

  /* ⚠️ Storage rule on foreign pages.
     This script runs inside YOUR game, on YOUR domain. The storage there
     belongs to you, and you are the one responsible for consent, not us.
     That is why the name is kept in memory only by default: it lasts for
     this visit and is gone afterwards.

     Persist it only if you say so explicitly:
       <script src=".../gs.js" data-key="..." data-store="1"></script>
     Set that only once your own consent banner has approval for it. On
     our own site, our consent manager decides. */
  var memName = null;

  /* ---- The per-game token -----------------------------------------------------
     A player signed in with us still played here as a guest: their secret
     lives on our domain, your game runs on yours, and the browser keeps
     the two apart on purpose.

     The way back is /connect: the player confirms with us and returns
     with a token in the URL fragment. Everything behind the `#` stays in
     the browser, so the token never appears in any server log.

     ⚠️ The token is valid for THIS game only. Even if you read it out,
     you cannot post in the player's name in any other game.

     ⚠️ It is stored only if you allow storage (data-store or your consent
     manager). Otherwise it lasts for this visit, which is the more honest
     default on a foreign page. */
  var TOKEN_KEY = 'gaetw.token.' + KEY;
  var memTok = null;

  (function harvestToken() {
    var h = location.hash || '';
    var m = h.match(/[#&]hiscore_player=([A-Za-z0-9_-]+)/);
    if (!m) return;
    memTok = m[1];
    if (mayStore()) { try { localStorage.setItem(TOKEN_KEY, memTok); } catch (e) {} }
    /* Drop it from the address bar, otherwise it sits in the history and
       travels on via copy and paste. */
    var rest = h.replace(m[0], m[0][0] === '#' ? '#' : '').replace(/^#&/, '#');
    try {
      history.replaceState(null, '', location.pathname + location.search +
        (rest === '#' || rest === '' ? '' : rest));
    } catch (e) {}
  })();

  function token() {
    if (memTok) return memTok;
    if (mayStore()) { try { return localStorage.getItem(TOKEN_KEY) || null; } catch (e) {} }
    return null;
  }

  function mayStore() {
    if (window.CC && typeof window.CC.allows === 'function') return window.CC.allows('functional');
    return !!(self && self.dataset && self.dataset.store === '1');
  }

  function player(ask) {
    var n = memName;
    if (!n && mayStore()) {
      try { n = localStorage.getItem(NAME_KEY); } catch (e) {}
    }
    if (!n && ask) {
      n = window.prompt('Name for the world ranking (max 24 characters):', '');
      if (n) {
        memName = n;
        if (mayStore()) { try { localStorage.setItem(NAME_KEY, n); } catch (e) {} }
      }
    }
    return n || 'ANON';
  }

  function api(path, opts) {
    return fetch(BASE + path, opts).then(function (r) { return r.json(); });
  }

  var host, root;
  function ui() {
    if (root) return root;
    host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:none;';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML =
      '<style>' +
      ':host{all:initial}' +
      '.bg{position:fixed;inset:0;background:#05010ae6;display:flex;align-items:center;justify-content:center;padding:16px;font-family:ui-monospace,"Courier New",monospace}' +
      '.box{background:#0f0620;border:3px solid #ff2e88;box-shadow:6px 6px 0 #00f0ff;max-width:420px;width:100%;max-height:80vh;overflow:auto;color:#efe6ff;padding:20px}' +
      'h2{font-size:14px;margin:0 0 14px;color:#00f0ff;letter-spacing:.08em;text-transform:uppercase}' +
      'table{width:100%;border-collapse:collapse;font-size:15px}' +
      'td{padding:5px 4px;border-bottom:1px solid #ff2e8844}' +
      'td.n{text-align:right;font-variant-numeric:tabular-nums}' +
      '.me{color:#b4ff39}' +
      'button{margin-top:16px;background:#1c0b2e;color:#efe6ff;border:3px solid #00f0ff;padding:9px 16px;font:inherit;font-size:13px;cursor:pointer;text-transform:uppercase}' +
      'button:hover{background:#ff2e88;color:#05010a}' +
      'a{color:#00f0ff;font-size:11px;display:block;margin-top:12px;text-align:center}' +
      '</style>' +
      '<div class="bg"><div class="box"><h2>World Ranking</h2><div id="c">…</div>' +
      '<button id="x">Close</button>' +
      '<a href="' + BASE + '/board" target="_blank" rel="noopener">gamesareeatingtheworld.com</a>' +
      '</div></div>';
    root.getElementById('x').onclick = hide;
    root.querySelector('.bg').addEventListener('click', function (e) {
      if (e.target === root.querySelector('.bg')) hide();
    });
    document.body.appendChild(host);
    return root;
  }

  function hide() { if (host) host.style.display = 'none'; }

  function show() {
    var r = ui();
    host.style.display = 'block';
    var me = player(false);
    api('/api/scores?key=' + encodeURIComponent(KEY) + '&limit=20').then(function (d) {
      var c = r.getElementById('c');
      if (!d.ok || !d.board.length) { c.textContent = 'No scores yet. Be the first.'; return; }
      c.innerHTML = '<table>' + d.board.map(function (row) {
        var mine = row.player === me ? ' class="me"' : '';
        return '<tr' + mine + '><td>' + row.rank + '</td><td>' +
          String(row.player).replace(/[<>&]/g, '') + '</td><td class="n">' +
          Number(row.score).toLocaleString() + '</td></tr>';
      }).join('') + '</table>';
    }).catch(function () { r.getElementById('c').textContent = 'Board unreachable.'; });
  }

  var started = Date.now();

  /* ---- Game session ----------------------------------------------------------
     On load we open a session. The server stamps the start, and on submit
     IT computes the duration. That turns the run time into a measurement
     instead of a claim.

     ⚠️ Something fails? Everything keeps running. A leaderboard must never
     halt a game, and a score without a session is accepted, it is just
     backed more weakly. */
  var SESSION = null, POW = null;

  /* ---- SHA-256, small and dependency-free ------------------------------------
     Only needed for the session challenge. crypto.subtle is out: it is
     asynchronous, and a million awaits cost more than the hashing. */
  var K256 = [];
  (function () {
    function frac(n, p) { return Math.floor((Math.pow(n, 1 / p) % 1) * 4294967296) | 0; }
    var primes = [], n = 2;
    while (primes.length < 64) {
      var isPrime = true;
      for (var i = 2; i * i <= n; i++) if (n % i === 0) { isPrime = false; break; }
      if (isPrime) primes.push(n);
      n++;
    }
    for (var j = 0; j < 64; j++) K256.push(frac(primes[j], 3));
  })();

  function sha256bits(text) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
             0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var b = [], i;
    for (i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c < 128) b.push(c);
      else if (c < 2048) b.push(192 | (c >> 6), 128 | (c & 63));
      else b.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
    }
    var bitlen = b.length * 8;
    b.push(0x80);
    while (b.length % 64 !== 56) b.push(0);
    for (i = 7; i >= 0; i--) b.push((bitlen / Math.pow(256, i)) & 255);

    var w = new Int32Array(64);
    for (var o = 0; o < b.length; o += 64) {
      for (i = 0; i < 16; i++) {
        w[i] = (b[o + i * 4] << 24) | (b[o + i * 4 + 1] << 16) | (b[o + i * 4 + 2] << 8) | b[o + i * 4 + 3];
      }
      for (i = 16; i < 64; i++) {
        var x = w[i - 15], y = w[i - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = H[0], bb = H[1], cc = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K256[i] + w[i]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var mj = (a & bb) ^ (a & cc) ^ (bb & cc);
        var t2 = (S0 + mj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = cc; cc = bb; bb = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + bb) | 0; H[2] = (H[2] + cc) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    /* Only the leading zero bits count, we do not need the rest. */
    var bits = 0;
    for (i = 0; i < 8; i++) {
      var v = H[i] >>> 0;
      if (v === 0) { bits += 32; continue; }
      bits += Math.clz32(v);
      break;
    }
    return bits;
  }

  /* ---- The solver, in slices -------------------------------------------------
     ⚠️ NEVER in one go. Two seconds of hashing in a single stretch make any
     game stutter, and right after load of all moments. So small slices with
     a scheduler in between that does not stall the frame. MessageChannel
     instead of setTimeout, because setTimeout is throttled to one second in
     a background tab and the solver would never finish. */
  function solve(challenge, bits, done) {
    var n = 0, channel = null;
    try { channel = new MessageChannel(); } catch (e) {}
    /* ⚠️ The slice is measured by TIME, not by count. A fixed counter is
       too small on a fast machine and a visible hitch on an old phone.
       Twelve milliseconds fit under a single frame at 60 Hz. */
    function slice() {
      var deadline = (Date.now ? Date.now() : +new Date()) + 12;
      do {
        for (var i = 0; i < 400; i++, n++) {
          if (sha256bits(challenge + ':' + n) >= bits) { done(String(n)); return; }
        }
      } while ((Date.now ? Date.now() : +new Date()) < deadline);
      if (n > 4000000) return;   /* hopeless, then go without */
      if (channel) channel.port2.postMessage(0); else setTimeout(slice, 0);
    }
    if (channel) channel.port1.onmessage = slice;
    slice();
  }

  function openSession() {
    if (!KEY) return;
    api('/api/scores/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: KEY })
    }).then(function (d) {
      if (!d || !d.ok || !d.session) return;
      SESSION = d.session;
      /* Solve the challenge in the background, long before the first run
         ends. It is not a must: without it the game just posts slower.
         It matters when many players sit behind one address, say in a
         school. */
      if (d.challenge && d.difficulty) {
        solve(d.challenge, d.difficulty, function (solution) { POW = solution; });
      }
    }).catch(function () {});
  }
  openSession();

  /* ---- Warp doors ------------------------------------------------------------
     We speak the protocol the Vibe Jam established instead of inventing a
     second one: ?portal=true, ?ref=, plus username/color/speed in the
     address bar. What is missing there, we layer on top: the identity
     survives the jump, so a hop becomes a journey. */
  function qp() {
    try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(''); }
  }

  var arrival = (function () {
    var q = qp();
    var a = {
      fromPortal: q.get('portal') === 'true' || q.get('portal') === '1',
      ref: q.get('ref') || null,
      username: q.get('username') || null,
      color: q.get('color') || null,
      speed: q.get('speed') || null
    };
    /* The point of the whole exercise: whoever comes through a door stays
       the same player. Without this, every jump is a fresh start.
       The name already sits in the address bar anyway, so adopting it for
       the visit reveals nothing new. It is persisted only under the same
       condition as everywhere else. */
    if (a.fromPortal && a.username) {
      memName = a.username.slice(0, 24);
      if (mayStore()) {
        try { localStorage.setItem(NAME_KEY, memName); } catch (e) {}
      }
    }
    return a;
  })();

  window.GS = {
    key: KEY,
    /** What the arriving player brought along. For skipping the title
     *  screen, adopting the color, offering the way back. */
    arrival: arrival,
    /** Sends the player onward. Without a destination the network decides.
     *  Returns nothing, because the page is gone afterwards. */
    warp: function (opts) {
      opts = opts || {};
      var q = new URLSearchParams();
      q.set('from', KEY);
      q.set('username', opts.player || player(false));
      if (opts.color) q.set('color', opts.color);
      if (opts.speed != null) q.set('speed', String(opts.speed));
      if (opts.to) q.set('to', opts.to);
      q.set('ref', opts.ref || location.origin + location.pathname);
      location.href = BASE + '/portal?' + q.toString();
    },
    /** Submit a score. Returns a promise with the rank.
     *  Fields per the definition on /protocol: mode, unit, dir, rules are
     *  passed through when provided.
     *  ⚠️ The name is asked for ONLY when the submit is interactive.
     *  A game that submits automatically at game over must not put an
     *  input prompt in the player's face. */
    submit: function (score, opts) {
      opts = opts || {};
      var interactive = opts.show !== false;
      var body = {
        game: KEY,
        key: KEY,
        player: opts.player || player(interactive),
        score: Number(score),
        run_ms: opts.run_ms != null ? opts.run_ms : (Date.now() - started)
      };
      if (opts.mode)  body.mode  = String(opts.mode);
      if (opts.unit)  body.unit  = String(opts.unit);
      if (opts.dir)   body.dir   = String(opts.dir);
      if (opts.rules) body.rules = String(opts.rules);
      /* ⚠️ The version of YOUR game. Send it, always.
         A record from 0.39 is not the same record as one from 0.40:
         change the balance in between and every old value belongs to a
         different game. Without this field, nobody notices.
         Settable per call or once and for all on the script tag:
           <script src=".../gs.js" data-key="..." data-version="1.4.0"></script> */
      var ver = opts.version || (self && self.dataset && self.dataset.version);
      if (ver) body.version = String(ver);
      /* The session, so the duration comes from our clock. */
      if (SESSION) body.session = SESSION;
      if (POW) body.pow = POW;
      var headers = { 'Content-Type': 'application/json' };
      /* With a token, the TOKEN decides the name, not the `player` field.
         The server overrides it, so the board never shows two names for
         the same person. */
      var tok = token();
      if (tok) headers['X-HISCORE-Player'] = tok;
      return api('/api/scores', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
      }).then(function (d) {
        if (d.ok && opts.show !== false) show();
        return d;
      });
    },
    show: show,
    hide: hide,
    /** Restart the run clock, e.g. when a run begins.
     *  The session keeps going: it measures time in the game, not the
     *  length of a single run. That is exactly what makes it interesting
     *  as a number. */
    reset: function () { started = Date.now(); },
    /** The current session, if the server issued one. */
    session: function () { return SESSION; },
    player: player,

    /** Is this browser connected to an account?
     *  For the in-game button: "Play as yourself" or not. */
    connected: function () { return !!token(); },

    /** Sends the player off to confirm and back here afterwards.
     *  The page is gone after the call, so nothing is returned.
     *  ⚠️ Call this only on a real click. A redirect on load rips the
     *  player out of the game. */
    connect: function (returnUrl) {
      var target = returnUrl || (location.origin + location.pathname + location.search);
      location.href = BASE + '/connect?game=' + encodeURIComponent(KEY) +
        '&return=' + encodeURIComponent(target);
    },

    /** Disconnect in this browser. The token stays valid server-side until
     *  it is revoked in the account: only this device forgets. */
    disconnect: function () {
      memTok = null;
      try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    }
  };
})();
