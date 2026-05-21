/* ================================================================
   VISITOR TRACKER  |  visitors.js
   Google Sign-In → logs name + email + timestamp to Firebase
   Admin panel "Visitors" tab shows the full log
   ----------------------------------------------------------------
   SETUP (one-time, ~10 min):
   1. Go to https://console.firebase.google.com
      → New project → name it "hrs-portfolio" → Create
   2. In Firebase: Build → Firestore Database → Create database
      → Start in TEST MODE → choose region → Done
   3. In Firebase: Project Settings (⚙️) → General
      → Your apps → Web (</>)  → Register app
      → Copy the firebaseConfig object below and replace the
        placeholder values (apiKey, authDomain, projectId, etc.)
   4. In Firebase: Authentication → Sign-in method → Google → Enable
      → Add your GitHub Pages domain under "Authorised domains"
        e.g.  yourusername.github.io
   5. In Firebase: Firestore → Rules → paste:
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /visitors/{id} {
              allow create: if true;         // anyone can log a visit
              allow read, update, delete: if false; // only via Admin SDK
            }
          }
        }
      → Publish
   6. Drop visitors.js into your repo (same folder as index.html)
   7. In index.html, just before </body>, add:
        <script src="visitors.js"></script>
      (after main.js, intro.js, ui.js)
   ================================================================ */

(function () {
  'use strict';

  /* ──────────────────────────────────────────
     🔧 REPLACE THESE WITH YOUR FIREBASE CONFIG
     (copy from Firebase Console → Project Settings → Your apps)
  ────────────────────────────────────────── */
  var FB_CONFIG = {
    apiKey:            "YOUR_API_KEY",
    authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
    projectId:         "YOUR_PROJECT_ID",
    storageBucket:     "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId:             "YOUR_APP_ID"
  };

  var COLLECTION = "visitors"; // Firestore collection name

  /* ──────────────────────────────────────────
     Load Firebase SDKs dynamically (v9 compat)
  ────────────────────────────────────────── */
  var FB_VER = "10.11.1";
  var scripts = [
    "https://www.gstatic.com/firebasejs/" + FB_VER + "/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/" + FB_VER + "/firebase-auth-compat.js",
    "https://www.gstatic.com/firebasejs/" + FB_VER + "/firebase-firestore-compat.js"
  ];

  var loaded = 0;
  var db, auth, googleProvider;

  function loadScript(src, cb) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = cb;
    document.head.appendChild(s);
  }

  function loadAll(srcs, cb) {
    if (!srcs.length) { cb(); return; }
    loadScript(srcs[0], function () { loadAll(srcs.slice(1), cb); });
  }

  loadAll(scripts, function () {
    if (!firebase.apps.length) firebase.initializeApp(FB_CONFIG);
    db            = firebase.firestore();
    auth          = firebase.auth();
    googleProvider = new firebase.auth.GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: 'select_account' });

    injectSignInButton();
    injectAdminTab();
    watchAuthState();
  });

  /* ──────────────────────────────────────────
     SIGN-IN BUTTON (floating, bottom-left)
  ────────────────────────────────────────── */
  function injectSignInButton() {
    var style = document.createElement('style');
    style.textContent = [
      '#vt-signin-wrap{',
        'position:fixed;bottom:88px;right:28px;z-index:99998;',
        'display:flex;flex-direction:column;align-items:flex-end;gap:8px;',
        'font-family:"Space Grotesk",sans-serif;',
      '}',
      '#vt-signin-btn{',
        'display:flex;align-items:center;gap:9px;',
        'background:rgba(20,20,20,0.92);',
        'border:1px solid rgba(232,197,71,0.35);',
        'border-radius:28px;padding:9px 16px;cursor:pointer;',
        'color:#e8c547;font-size:0.78rem;font-weight:500;letter-spacing:0.03em;',
        'box-shadow:0 4px 18px rgba(0,0,0,0.45);',
        'transition:all 0.2s;white-space:nowrap;',
        'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);',
      '}',
      '#vt-signin-btn:hover{',
        'background:rgba(232,197,71,0.12);border-color:rgba(232,197,71,0.65);',
        'box-shadow:0 6px 24px rgba(232,197,71,0.2);',
      '}',
      '#vt-signin-btn svg{flex-shrink:0;}',
      '#vt-signed-info{',
        'font-size:0.7rem;color:rgba(255,255,255,0.45);',
        'font-family:"JetBrains Mono",monospace;text-align:right;',
        'padding:0 4px;',
      '}',
      '#vt-signout-btn{',
        'font-size:0.65rem;color:rgba(232,197,71,0.5);background:none;',
        'border:none;cursor:pointer;padding:0;font-family:inherit;text-decoration:underline;',
      '}',
      '#vt-signout-btn:hover{color:#e8c547;}',
      '.vt-toast{',
        'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);',
        'background:rgba(20,20,20,0.95);border:1px solid rgba(232,197,71,0.3);',
        'color:#e8c547;font-family:"JetBrains Mono",monospace;font-size:0.78rem;',
        'padding:10px 22px;border-radius:4px;z-index:999999;',
        'opacity:0;transition:opacity 0.3s;pointer-events:none;',
        'box-shadow:0 8px 32px rgba(0,0,0,0.5);',
      '}'
    ].join('');
    document.head.appendChild(style);

    var wrap = document.createElement('div');
    wrap.id = 'vt-signin-wrap';
    wrap.innerHTML = [
      '<div id="vt-signed-info" style="display:none"></div>',
      '<button id="vt-signin-btn">',
        googleIcon(),
        '<span id="vt-btn-label">Sign in to say hi 👋</span>',
      '</button>'
    ].join('');
    document.body.appendChild(wrap);

    document.getElementById('vt-signin-btn').addEventListener('click', handleSignIn);
  }

  function googleIcon() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>' +
      '<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>' +
      '<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>' +
      '<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>' +
    '</svg>';
  }

  function handleSignIn() {
    auth.signInWithPopup(googleProvider).catch(function (err) {
      showToast('⚠ Sign-in cancelled or blocked.');
      console.warn('VT sign-in error:', err.message);
    });
  }

  function handleSignOut() {
    auth.signOut();
  }

  function watchAuthState() {
    auth.onAuthStateChanged(function (user) {
      var btn       = document.getElementById('vt-signin-btn');
      var info      = document.getElementById('vt-signed-info');
      var label     = document.getElementById('vt-btn-label');
      if (!btn) return;

      if (user) {
        /* Show signed-in state */
        btn.style.opacity = '0.4';
        btn.style.pointerEvents = 'none';
        label.textContent = 'Signed in ✓';
        info.style.display = 'block';
        info.innerHTML = '<span style="color:rgba(232,197,71,0.7);">' +
          escHtml(user.displayName || user.email) + '</span><br>' +
          '<button id="vt-signout-btn" onclick="void(0)">Sign out</button>';
        document.getElementById('vt-signout-btn').addEventListener('click', handleSignOut);
        logVisitor(user);
      } else {
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        label.textContent = 'Sign in to say hi 👋';
        info.style.display = 'none';
      }

      /* Refresh admin visitor list if panel is open */
      refreshAdminList();
    });
  }

  /* ──────────────────────────────────────────
     LOG VISITOR TO FIRESTORE
  ────────────────────────────────────────── */
  function logVisitor(user) {
    db.collection(COLLECTION).add({
      name:      user.displayName || '',
      email:     user.email       || '',
      photoURL:  user.photoURL    || '',
      uid:       user.uid,
      visitedAt: firebase.firestore.FieldValue.serverTimestamp(),
      page:      window.location.href
    }).then(function () {
      showToast('👋 Hey ' + (user.displayName ? user.displayName.split(' ')[0] : 'there') + '! Visit logged.');
    }).catch(function (err) {
      console.warn('VT log error:', err.message);
    });
  }

  /* ──────────────────────────────────────────
     TOAST NOTIFICATION
  ────────────────────────────────────────── */
  function showToast(msg) {
    var t = document.createElement('div');
    t.className = 'vt-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () {
      t.style.opacity = '1';
      setTimeout(function () {
        t.style.opacity = '0';
        setTimeout(function () { t.remove(); }, 350);
      }, 3000);
    });
  }

  /* ──────────────────────────────────────────
     ADMIN PANEL — VISITORS TAB
     Injects tab button + section into existing admin panel
  ────────────────────────────────────────── */
  function injectAdminTab() {
    /* Wait for admin panel DOM to exist */
    var tries = 0;
    var timer = setInterval(function () {
      var tabsEl    = document.querySelector('.admin-tabs');
      var sectionsEl = document.querySelector('#admin-panel .admin-box');
      if (tabsEl && sectionsEl) {
        clearInterval(timer);
        buildTab(tabsEl, sectionsEl);
      }
      if (++tries > 100) clearInterval(timer);
    }, 100);
  }

  function buildTab(tabsEl, boxEl) {
    /* Tab button — insert before 🚀 Publish */
    var publishBtn = tabsEl.querySelector('button[onclick*="publish"]');
    var tabBtn = document.createElement('button');
    tabBtn.className = 'admin-tab';
    tabBtn.setAttribute('onclick', 'switchTab("visitors")');
    tabBtn.innerHTML = '👁 Visitors';
    tabBtn.style.cssText = 'background:rgba(52,152,219,0.08);border-color:rgba(52,152,219,0.35);color:#3498db;';
    if (publishBtn) tabsEl.insertBefore(tabBtn, publishBtn);
    else tabsEl.appendChild(tabBtn);

    /* Section content */
    var style = document.createElement('style');
    style.textContent = [
      '#tab-visitors{padding-top:0.5rem;}',
      '.vt-admin-meta{font-family:"JetBrains Mono",monospace;font-size:0.72rem;color:var(--muted);margin-bottom:1.2rem;line-height:1.8;}',
      '.vt-admin-meta span{color:var(--accent);}',
      '.vt-table-wrap{overflow-x:auto;border-radius:4px;border:1px solid var(--border);}',
      '.vt-table{width:100%;border-collapse:collapse;font-size:0.82rem;}',
      '.vt-table th{',
        'font-family:"JetBrains Mono",monospace;font-size:0.65rem;letter-spacing:0.1em;',
        'color:var(--muted);text-transform:uppercase;text-align:left;',
        'padding:0.75rem 1rem;background:rgba(255,255,255,0.02);',
        'border-bottom:1px solid var(--border);white-space:nowrap;',
      '}',
      '.vt-table td{',
        'padding:0.75rem 1rem;border-bottom:1px solid rgba(255,255,255,0.04);',
        'color:var(--text);vertical-align:middle;',
      '}',
      '.vt-table tr:last-child td{border-bottom:none;}',
      '.vt-table tr:hover td{background:rgba(255,255,255,0.025);}',
      '.vt-avatar{',
        'width:28px;height:28px;border-radius:50%;object-fit:cover;',
        'vertical-align:middle;margin-right:8px;border:1px solid rgba(232,197,71,0.2);',
      '}',
      '.vt-name-cell{display:flex;align-items:center;white-space:nowrap;}',
      '.vt-email{font-family:"JetBrains Mono",monospace;font-size:0.72rem;color:rgba(232,197,71,0.85);}',
      '.vt-time{font-family:"JetBrains Mono",monospace;font-size:0.7rem;color:var(--muted);white-space:nowrap;}',
      '.vt-empty{text-align:center;padding:3rem 1rem;',
        'font-family:"JetBrains Mono",monospace;font-size:0.8rem;color:var(--muted);}',
      '.vt-loading{text-align:center;padding:2rem;color:var(--muted);',
        'font-family:"JetBrains Mono",monospace;font-size:0.8rem;}',
      '.vt-refresh-btn{',
        'font-family:"JetBrains Mono",monospace;font-size:0.72rem;',
        'background:rgba(52,152,219,0.08);border:1px solid rgba(52,152,219,0.3);',
        'color:#3498db;padding:0.45rem 1rem;border-radius:2px;cursor:pointer;',
        'margin-bottom:1rem;transition:all 0.2s;',
      '}',
      '.vt-refresh-btn:hover{background:rgba(52,152,219,0.18);}',
      '.vt-export-btn{',
        'font-family:"JetBrains Mono",monospace;font-size:0.72rem;',
        'background:rgba(46,204,113,0.08);border:1px solid rgba(46,204,113,0.3);',
        'color:#2ecc71;padding:0.45rem 1rem;border-radius:2px;cursor:pointer;',
        'margin-bottom:1rem;margin-left:0.5rem;transition:all 0.2s;',
      '}',
      '.vt-export-btn:hover{background:rgba(46,204,113,0.18);}',
    ].join('');
    document.head.appendChild(style);

    var section = document.createElement('div');
    section.className = 'admin-section';
    section.id = 'tab-visitors';
    section.innerHTML = [
      '<div class="vt-admin-meta">',
        'All visitors who sign in with Google appear here in real-time.<br>',
        'You must be logged into the admin panel to view this data.<br>',
        '<span>Firebase Firestore</span> stores the entries — free up to 50k reads/day.',
      '</div>',
      '<button class="vt-refresh-btn" id="vt-refresh-btn">↺ Refresh</button>',
      '<button class="vt-export-btn" id="vt-export-btn">⬇ Export CSV</button>',
      '<div id="vt-table-area"><div class="vt-loading">Loading visitor log…</div></div>'
    ].join('');
    boxEl.appendChild(section);

    document.getElementById('vt-refresh-btn').addEventListener('click', refreshAdminList);
    document.getElementById('vt-export-btn').addEventListener('click', exportCSV);
  }

  /* ──────────────────────────────────────────
     FETCH + RENDER VISITOR LIST
  ────────────────────────────────────────── */
  var _cachedVisitors = [];

  function refreshAdminList() {
    var area = document.getElementById('vt-table-area');
    var panel = document.getElementById('admin-panel');
    /* Only fetch if admin panel is open and tab is visible */
    if (!panel || !panel.classList.contains('open')) return;
    var tabSection = document.getElementById('tab-visitors');
    if (!tabSection || !tabSection.classList.contains('active')) return;
    if (!db) { if (area) area.innerHTML = '<div class="vt-loading">Firebase not initialised yet…</div>'; return; }

    if (area) area.innerHTML = '<div class="vt-loading">Loading…</div>';

    db.collection(COLLECTION)
      .orderBy('visitedAt', 'desc')
      .limit(200)
      .get()
      .then(function (snap) {
        _cachedVisitors = [];
        snap.forEach(function (doc) { _cachedVisitors.push(doc.data()); });
        renderVisitorTable(_cachedVisitors);
      })
      .catch(function (err) {
        if (area) area.innerHTML = '<div class="vt-loading">⚠ Error: ' + escHtml(err.message) + '</div>';
      });
  }

  function renderVisitorTable(rows) {
    var area = document.getElementById('vt-table-area');
    if (!area) return;
    if (!rows || rows.length === 0) {
      area.innerHTML = '<div class="vt-empty">📭 No visitors yet.<br>Share your portfolio link — signed-in visitors appear here.</div>';
      return;
    }

    var html = [
      '<div style="font-family:var(--font-mono);font-size:0.72rem;color:var(--muted);margin-bottom:0.75rem;">',
        rows.length + ' entr' + (rows.length === 1 ? 'y' : 'ies') + ' · most recent first',
      '</div>',
      '<div class="vt-table-wrap">',
      '<table class="vt-table">',
      '<thead><tr>',
        '<th>#</th>',
        '<th>Name</th>',
        '<th>Email (Gmail)</th>',
        '<th>Visited At</th>',
      '</tr></thead>',
      '<tbody>'
    ];

    rows.forEach(function (v, i) {
      var ts = v.visitedAt && v.visitedAt.toDate ? v.visitedAt.toDate() : null;
      var timeStr = ts ? formatDate(ts) : '—';
      var avatar  = v.photoURL
        ? '<img class="vt-avatar" src="' + escHtml(v.photoURL) + '" alt="" loading="lazy">'
        : '<span style="display:inline-block;width:28px;height:28px;border-radius:50%;background:rgba(232,197,71,0.15);margin-right:8px;vertical-align:middle;line-height:28px;text-align:center;font-size:0.75rem;">👤</span>';

      html.push(
        '<tr>',
          '<td style="color:var(--muted);font-family:var(--font-mono);font-size:0.7rem;">' + (i + 1) + '</td>',
          '<td><div class="vt-name-cell">' + avatar + escHtml(v.name || 'Unknown') + '</div></td>',
          '<td class="vt-email">' + escHtml(v.email || '—') + '</td>',
          '<td class="vt-time">' + timeStr + '</td>',
        '</tr>'
      );
    });

    html.push('</tbody></table></div>');
    area.innerHTML = html.join('');
  }

  /* ──────────────────────────────────────────
     EXPORT CSV
  ────────────────────────────────────────── */
  function exportCSV() {
    if (!_cachedVisitors.length) { showToast('No data to export yet.'); return; }
    var lines = ['#,Name,Email,Visited At'];
    _cachedVisitors.forEach(function (v, i) {
      var ts = v.visitedAt && v.visitedAt.toDate ? v.visitedAt.toDate() : null;
      lines.push([
        i + 1,
        csvCell(v.name),
        csvCell(v.email),
        csvCell(ts ? ts.toISOString() : '')
      ].join(','));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    var a    = document.createElement('a');
    a.href   = URL.createObjectURL(blob);
    a.download = 'visitors-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
  }

  /* ──────────────────────────────────────────
     AUTO-REFRESH when Visitors tab is clicked
  ────────────────────────────────────────── */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.admin-tab');
    if (btn && btn.getAttribute('onclick') && btn.getAttribute('onclick').indexOf('visitors') !== -1) {
      setTimeout(refreshAdminList, 120); // wait for tab switch animation
    }
  });

  /* ──────────────────────────────────────────
     HELPERS
  ────────────────────────────────────────── */
  function escHtml(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function csvCell(s) {
    s = String(s || '');
    if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function formatDate(d) {
    var pad = function(n){ return n < 10 ? '0'+n : n; };
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) +
      '  ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

})();
