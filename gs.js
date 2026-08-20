/*! gs.js: HISCORE protocol only (no recorder, no card).
    Recommended kit (protocol + tape + card):
      <script src="https://gamesareeatingtheworld.com/hiscore.js" data-key="DEIN_KEY"></script>
    Protocol only:
      <script src="https://gamesareeatingtheworld.com/gs.js" data-key="DEIN_KEY"></script>
    Benutzen:
      GS.submit(1234)            Punktestand abgeben, fragt einmal nach dem Namen
      GS.submit(1234, { version: '1.4.0' })   mit Version, besser
      GS.show()                  Bestenliste einblenden
    Alles laeuft im Shadow DOM, dein Spiel-CSS wird nicht angefasst. */
(function () {
  'use strict';
  if (window.GS) return;

  var self = document.currentScript;
  var KEY = (self && self.dataset.key) || '';
  var BASE = (function () {
    try { return new URL(self.src).origin; } catch (e) { return 'https://gamesareeatingtheworld.com'; }
  })();
  var NAME_KEY = 'gaetw.player';

  /* ⚠️ Speicher-Regel fuer fremde Seiten.
     Dieses Skript laeuft in DEINEM Spiel, auf DEINER Domain. Der Speicher
     dort gehoert dir, und verantwortlich fuer die Einwilligung bist du,
     nicht wir. Deshalb halten wir den Namen per Default nur im
     Arbeitsspeicher: er gilt fuer diese Sitzung und ist danach weg.

     Dauerhaft merken nur, wenn du es ausdruecklich sagst:
       <script src=".../gs.js" data-key="..." data-store="1"></script>
     Setz das erst, wenn dein eigener Consent-Banner dafuer die Zustimmung
     hat. Auf unserer eigenen Seite entscheidet unser Consent-Manager. */
  var memName = null;

  /* ---- Die Spielmarke ---------------------------------------------------------
     Wer bei uns angemeldet ist, spielte hier trotzdem als Gast: sein
     Geheimnis liegt auf unserer Domain, dein Spiel laeuft auf deiner, und
     der Browser haelt beides absichtlich getrennt.

     Der Weg zurueck ist /connect: der Spieler bestaetigt bei uns und kommt
     mit einer Marke im Fragment wieder. Alles hinter dem `#` bleibt im
     Browser, die Marke steht also in keinem Server-Protokoll.

     ⚠️ Die Marke gilt NUR fuer dieses Spiel. Selbst wenn du sie ausliest,
     kannst du damit in keinem anderen Spiel etwas in seinem Namen melden.

     ⚠️ Gespeichert wird sie nur, wenn du Speichern erlaubst (data-store
     oder dein Consent-Manager). Ohne das gilt sie fuer diese Sitzung, und
     das ist der ehrlichere Default auf einer fremden Seite. */
  var TOKEN_KEY = 'gaetw.token.' + KEY;
  var memTok = null;

  (function ernteMarke() {
    var h = location.hash || '';
    var m = h.match(/[#&]hiscore_player=([A-Za-z0-9_-]+)/);
    if (!m) return;
    memTok = m[1];
    if (mayStore()) { try { localStorage.setItem(TOKEN_KEY, memTok); } catch (e) {} }
    /* Aus der Adresszeile raus, sonst steht sie im Verlauf und wandert per
       Kopieren-und-Einfuegen weiter. */
    var rest = h.replace(m[0], m[0][0] === '#' ? '#' : '').replace(/^#&/, '#');
    try {
      history.replaceState(null, '', location.pathname + location.search +
        (rest === '#' || rest === '' ? '' : rest));
    } catch (e) {}
  })();

  function marke() {
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

  /* ---- Spielsitzung ---------------------------------------------------------
     Beim Laden eroeffnen wir eine Sitzung. Der Server stempelt den Anfang,
     und beim Abgeben rechnet ER die Dauer aus. Damit ist die Laufzeit eine
     Messung statt einer Behauptung.

     ⚠️ Es geht schief? Dann laeuft alles weiter. Eine Bestenliste darf ein
     Spiel nie anhalten, und ein Punktestand ohne Sitzung wird angenommen,
     er ist nur schwaecher belegt. */
  var SITZUNG = null, ARBEIT = null;

  /* ---- SHA-256, klein und ohne Abhaengigkeit --------------------------------
     Wird nur fuer die Sitzungsaufgabe gebraucht. crypto.subtle scheidet aus:
     es ist asynchron, und eine Million await kosten mehr als das Rechnen. */
  var K256 = [];
  (function () {
    function wurzel(n, p) { return Math.floor((Math.pow(n, 1 / p) % 1) * 4294967296) | 0; }
    var pr = [], n = 2;
    while (pr.length < 64) {
      var ist = true;
      for (var i = 2; i * i <= n; i++) if (n % i === 0) { ist = false; break; }
      if (ist) pr.push(n);
      n++;
    }
    for (var j = 0; j < 64; j++) K256.push(wurzel(pr[j], 3));
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
    /* Nur die fuehrenden Nullbits zaehlen, den Rest brauchen wir nicht. */
    var bits = 0;
    for (i = 0; i < 8; i++) {
      var v = H[i] >>> 0;
      if (v === 0) { bits += 32; continue; }
      bits += Math.clz32(v);
      break;
    }
    return bits;
  }

  /* ---- Der Loeser, in Haeppchen ---------------------------------------------
     ⚠️ NIE am Stueck. Zwei Sekunden Rechnen in einem Zug lassen jedes Spiel
     ruckeln, und ausgerechnet direkt nach dem Laden. Also kleine Portionen
     mit einem Taktgeber dazwischen, der den Bildaufbau nicht anhaelt.
     MessageChannel statt setTimeout, weil setTimeout in einem Hintergrundtab
     auf eine Sekunde gedrosselt wird und der Loeser dann nie fertig wird. */
  function loese(aufgabe, bits, fertig) {
    var n = 0, kanal = null;
    try { kanal = new MessageChannel(); } catch (e) {}
    /* ⚠️ Die Portion wird nach ZEIT bemessen, nicht nach Anzahl. Ein fester
       Zaehler ist auf einem schnellen Rechner zu klein und auf einem alten
       Telefon ein sichtbares Stocken. Zwoelf Millisekunden passen unter ein
       Einzelbild bei 60 Hz. */
    function portion() {
      var bis = (Date.now ? Date.now() : +new Date()) + 12;
      do {
        for (var i = 0; i < 400; i++, n++) {
          if (sha256bits(aufgabe + ':' + n) >= bits) { fertig(String(n)); return; }
        }
      } while ((Date.now ? Date.now() : +new Date()) < bis);
      if (n > 4000000) return;   /* aussichtslos, dann eben ohne */
      if (kanal) kanal.port2.postMessage(0); else setTimeout(portion, 0);
    }
    if (kanal) kanal.port1.onmessage = portion;
    portion();
  }

  function oeffneSitzung() {
    if (!KEY) return;
    api('/api/scores/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: KEY })
    }).then(function (d) {
      if (!d || !d.ok || !d.session) return;
      SITZUNG = d.session;
      /* Die Aufgabe im Hintergrund loesen, lange bevor der erste Lauf endet.
         Sie ist kein Muss: ohne sie sendet das Spiel langsamer, mehr nicht.
         Wichtig wird sie, wenn viele Spieler hinter einer Adresse sitzen,
         etwa in einer Schule. */
      if (d.challenge && d.difficulty) {
        loese(d.challenge, d.difficulty, function (loesung) { ARBEIT = loesung; });
      }
    }).catch(function () {});
  }
  oeffneSitzung();

  /* ---- Warp-Tueren ---------------------------------------------------------
     Wir sprechen das Protokoll, das der Vibe Jam etabliert hat, statt ein
     zweites zu erfinden: ?portal=true, ?ref=, plus username/color/speed in
     der Adresszeile. Was dort fehlt, legen wir darueber: die Identitaet
     ueberlebt den Sprung, damit aus einem Huepfer eine Reise wird. */
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
    /* Der Punkt der ganzen Uebung: wer durch eine Tuer kommt, bleibt
       derselbe Spieler. Ohne das ist jeder Sprung ein Neuanfang.
       Der Name steht ohnehin schon in der Adresszeile, ihn fuer die
       Sitzung zu uebernehmen legt also nichts Neues offen. Dauerhaft
       gespeichert wird er nur unter derselben Bedingung wie sonst. */
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
    /** Was der ankommende Spieler mitgebracht hat. Fuer Startbildschirm
     *  ueberspringen, Farbe uebernehmen, Rueckweg anbieten. */
    arrival: arrival,
    /** Schickt den Spieler weiter. Ohne Ziel entscheidet das Netz.
     *  Gibt nichts zurueck, weil die Seite danach weg ist. */
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
    /** Punktestand abgeben. Gibt ein Promise mit dem Platz zurueck.
     *  Felder nach der Definition auf /protocol: mode, unit, dir, rules
     *  werden durchgereicht, wenn sie mitgegeben werden.
     *  ⚠️ Nach dem Namen wird NUR gefragt, wenn die Abgabe interaktiv ist.
     *  Ein Spiel, das am Game Over automatisch abgibt, darf dem Spieler
     *  kein Eingabefenster vor die Nase setzen. */
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
      /* ⚠️ Die Version deines Spiels. Schick sie mit, immer.
         Ein Rekord aus 0.39 ist nicht derselbe Rekord wie einer aus 0.40:
         wer zwischendurch die Balance aendert, macht alle alten Werte zu
         Werten eines anderen Spiels. Ohne dieses Feld merkt das niemand.
         Setzbar per Aufruf oder ein fuer alle Mal am Skript-Tag:
           <script src=".../gs.js" data-key="..." data-version="1.4.0"></script> */
      var ver = opts.version || (self && self.dataset && self.dataset.version);
      if (ver) body.version = String(ver);
      /* Die Sitzung, damit die Dauer aus unserer Uhr kommt. */
      if (SITZUNG) body.session = SITZUNG;
      if (ARBEIT) body.pow = ARBEIT;
      var kopf = { 'Content-Type': 'application/json' };
      /* Mit Marke bestimmt die MARKE den Namen, nicht das Feld `player`.
         Der Server ueberschreibt ihn, damit in der Liste nie zwei Namen
         fuer dieselbe Person stehen. */
      var tok = marke();
      if (tok) kopf['X-HISCORE-Player'] = tok;
      return api('/api/scores', {
        method: 'POST',
        headers: kopf,
        body: JSON.stringify(body)
      }).then(function (d) {
        if (d.ok && opts.show !== false) show();
        return d;
      });
    },
    show: show,
    hide: hide,
    /** Uhr fuer die Laufzeit neu starten, z.B. beim Spielstart.
     *  Die Sitzung laeuft weiter: sie misst die Zeit im Spiel, nicht die
     *  eines einzelnen Laufs. Genau das macht sie als Zahl interessant. */
    reset: function () { started = Date.now(); },
    /** Die laufende Sitzung, falls der Server eine vergeben hat. */
    session: function () { return SITZUNG; },
    player: player,

    /** Ist dieser Browser mit einem Konto verbunden?
     *  Fuer den Knopf im Spiel: „Als du selbst spielen" oder eben nicht. */
    connected: function () { return !!marke(); },

    /** Schickt den Spieler zum Bestaetigen und danach hierher zurueck.
     *  Die Seite ist nach dem Aufruf weg, es gibt also nichts zurueck.
     *  ⚠️ Nur auf eine echte Klickhandlung hin aufrufen. Eine Weiterleitung
     *  beim Laden reisst den Spieler aus dem Spiel. */
    connect: function (rueck) {
      var ziel = rueck || (location.origin + location.pathname + location.search);
      location.href = BASE + '/connect?game=' + encodeURIComponent(KEY) +
        '&return=' + encodeURIComponent(ziel);
    },

    /** Verbindung in diesem Browser loesen. Die Marke bleibt serverseitig
     *  gueltig, bis sie im Konto zurueckgezogen wird: hier vergisst nur
     *  dieses Geraet. */
    disconnect: function () {
      memTok = null;
      try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    }
  };
})();
