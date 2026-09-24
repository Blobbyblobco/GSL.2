// Gold Stake Lotto — admin page: log in, load settings, edit, save.
(function () {
  'use strict';

  var TOKEN_KEY = 'gsl_admin_pw';
  var TEXT_FIELDS = ['jackpotAmount', 'nextDrawDate', 'liveVideoId', 'youtubeChannelUrl', 'ussdCode', 'whatsappNumber', 'phoneNumber', 'email'];

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $all = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var loginBox = $('[data-login]');
  var loginForm = $('[data-login-form]');
  var loginError = $('[data-login-error]');
  var editor = $('[data-editor]');
  var saveError = $('[data-save-error]');
  var statusEl = $('[data-status]');
  var resultsBox = $('[data-results]');
  var rowTemplate = $('[data-result-row]');
  var logoutBtn = $('[data-logout]');

  function getToken() { try { return sessionStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  function setToken(t) { try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  function showError(box, message, details) {
    box.replaceChildren(document.createTextNode(message));
    if (details && details.length) {
      var ul = document.createElement('ul');
      details.forEach(function (d) { var li = document.createElement('li'); li.textContent = d; ul.appendChild(li); });
      box.appendChild(ul);
    }
    box.hidden = false;
  }

  function setStatus(text, ok) {
    statusEl.textContent = text;
    statusEl.classList.toggle('is-ok', !!ok);
  }

  function api(method, path, body) {
    var headers = { accept: 'application/json', authorization: 'Bearer ' + getToken() };
    if (body) headers['content-type'] = 'application/json';
    return fetch(path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (!r.ok) { var err = new Error(data.error || ('Request failed (' + r.status + ')')); err.status = r.status; err.details = data.details; throw err; }
          return data;
        });
      });
  }

  // ---------- Results rows ----------
  function addResultRow(result, atTop) {
    var row = rowTemplate.content.firstElementChild.cloneNode(true);
    var labels = { date: 'Draw date', n0: '1st number', n1: '2nd number', n2: '3rd number' };
    $all('[data-r]', row).forEach(function (input) { input.setAttribute('aria-label', labels[input.getAttribute('data-r')]); });
    if (result) {
      $('[data-r="date"]', row).value = result.date;
      result.numbers.forEach(function (n, i) { $('[data-r="n' + i + '"]', row).value = n; });
    }
    $('[data-remove]', row).addEventListener('click', function () { row.remove(); markDirty(); });
    if (atTop) resultsBox.prepend(row); else resultsBox.appendChild(row);
    return row;
  }

  function readResults() {
    return $all('.admin-result', resultsBox).map(function (row) {
      return {
        date: $('[data-r="date"]', row).value,
        numbers: [0, 1, 2].map(function (i) {
          var v = $('[data-r="n' + i + '"]', row).value;
          return v === '' ? NaN : Number(v);
        })
      };
    });
  }

  // ---------- Form <-> settings ----------
  function fill(settings) {
    TEXT_FIELDS.forEach(function (k) { editor.elements[k].value = settings[k] || ''; });
    editor.elements.licenceConfirmed.checked = !!settings.licenceConfirmed;
    resultsBox.replaceChildren();
    (settings.results || []).forEach(function (r) { addResultRow(r); });
  }

  function collect() {
    var out = {};
    TEXT_FIELDS.forEach(function (k) { out[k] = editor.elements[k].value.trim(); });
    out.licenceConfirmed = editor.elements.licenceConfirmed.checked;
    out.results = readResults();
    return out;
  }

  function localProblems(data) {
    var problems = [];
    data.results.forEach(function (r, i) {
      var label = 'Result ' + (i + 1);
      if (!r.date) problems.push(label + ': pick a date.');
      if (!r.numbers.every(function (n) { return Number.isInteger(n) && n >= 0 && n <= 99; })) problems.push(label + ': numbers must be whole numbers from 0 to 99.');
      else if (new Set(r.numbers).size !== 3) problems.push(label + ': the three numbers must all be different.');
    });
    return problems;
  }

  var dirty = false;
  function markDirty() { dirty = true; setStatus('Unsaved changes'); }

  // ---------- Flow ----------
  function openEditor() {
    return fetch('/api/settings', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('Could not load settings (' + r.status + ')'); return r.json(); })
      .then(function (settings) {
        fill(settings);
        dirty = false;
        setStatus('');
        loginBox.hidden = true;
        editor.hidden = false;
        logoutBtn.hidden = false;
      });
  }

  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    loginError.hidden = true;
    var btn = $('button[type="submit"]', loginForm);
    btn.disabled = true;
    setToken(loginForm.elements.password.value);
    api('POST', '/api/admin/verify')
      .then(openEditor)
      .catch(function (err) { setToken(null); showError(loginError, err.message); })
      .then(function () { btn.disabled = false; });
  });

  editor.addEventListener('input', markDirty);

  $('[data-add-result]').addEventListener('click', function () {
    var row = addResultRow(null, true);
    $('[data-r="date"]', row).value = new Date().toISOString().slice(0, 10);
    $('[data-r="n0"]', row).focus();
    markDirty();
  });

  editor.addEventListener('submit', function (e) {
    e.preventDefault();
    saveError.hidden = true;
    var data = collect();
    var problems = localProblems(data);
    if (problems.length) { showError(saveError, 'Please fix these first:', problems); return; }

    var btn = $('button[type="submit"]', editor);
    btn.disabled = true;
    setStatus('Saving…');
    api('PUT', '/api/settings', data)
      .then(function (saved) {
        fill(saved);
        dirty = false;
        setStatus('Saved ✓ — live on the site within a minute', true);
      })
      .catch(function (err) {
        setStatus('');
        if (err.status === 401) { setToken(null); location.reload(); return; }
        showError(saveError, err.message, err.details);
      })
      .then(function () { btn.disabled = false; });
  });

  logoutBtn.addEventListener('click', function () { setToken(null); location.reload(); });

  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  // Resume a session from earlier in this tab.
  if (getToken()) {
    api('POST', '/api/admin/verify').then(openEditor).catch(function () { setToken(null); });
  }
})();
