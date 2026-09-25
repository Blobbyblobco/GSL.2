// Gold Stake Lotto — admin page: log in, load settings, edit, save.
(function () {
  'use strict';

  var TOKEN_KEY = 'gsl_admin_pw';
  // Must match LOTTO_GAMES in lib/settings.mjs.
  var GAMES = [
    { id: 'mega7', name: 'Mega 7', picks: 7, max: 37 },
    { id: 'wild5', name: 'Wild 5', picks: 5, max: 49 },
    { id: 'fast5', name: 'Fast 5', picks: 5, max: 42 },
    { id: 'easy6', name: 'Easy 6', picks: 6, max: 39 }
  ];
  var TEXT_FIELDS = ['liveVideoId', 'youtubeChannelUrl', 'ussdCode', 'whatsappNumber', 'phoneNumber', 'email'];

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $all = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var loginBox = $('[data-login]');
  var loginForm = $('[data-login-form]');
  var loginError = $('[data-login-error]');
  var editor = $('[data-editor]');
  var saveError = $('[data-save-error]');
  var statusEl = $('[data-status]');
  var gamesBox = $('[data-lotto-games]');
  var groupTemplate = $('[data-game-group]');
  var logoutBtn = $('[data-logout]');
  var inbox = $('[data-inbox]');
  var inboxList = $('[data-inbox-list]');
  var inboxError = $('[data-inbox-error]');
  var FORM_LABELS = { agent: 'Agent enquiry', contact: 'Contact message' };
  var FIELD_LABELS = { name: 'Name', phone: 'Phone', shop: 'Shop & town', contact: 'Phone or email', message: 'Message' };

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

  // ---------- Lotto games ----------
  var rowSeq = 0;

  function numberInput(game, i) {
    var input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = String(game.max);
    input.step = '1';
    input.required = true;
    input.setAttribute('data-n', '');
    input.setAttribute('aria-label', game.name + ' number ' + (i + 1));
    return input;
  }

  function addResultRow(game, box, result, atTop) {
    var row = document.createElement('div');
    row.className = 'admin-result';

    var dateField = document.createElement('div');
    dateField.className = 'field admin-result__date';
    var dateLabel = document.createElement('label');
    dateLabel.textContent = 'Draw date';
    var date = document.createElement('input');
    date.type = 'date';
    date.required = true;
    date.setAttribute('data-date', '');
    date.id = 'r-' + game.id + '-' + (++rowSeq);
    dateLabel.htmlFor = date.id;
    dateField.appendChild(dateLabel);
    dateField.appendChild(date);

    var numsField = document.createElement('div');
    numsField.className = 'field';
    var numsLabel = document.createElement('span');
    numsLabel.className = 'admin-label';
    numsLabel.textContent = game.picks + ' numbers (1–' + game.max + ')';
    var nums = document.createElement('div');
    nums.className = 'admin-nums';
    for (var i = 0; i < game.picks; i++) nums.appendChild(numberInput(game, i));
    numsField.appendChild(numsLabel);
    numsField.appendChild(nums);

    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'admin-remove';
    remove.textContent = '✕';
    remove.setAttribute('aria-label', 'Remove this ' + game.name + ' result');
    remove.addEventListener('click', function () { row.remove(); markDirty(); });

    row.appendChild(dateField);
    row.appendChild(numsField);
    row.appendChild(remove);

    if (result) {
      date.value = result.date;
      $all('[data-n]', row).forEach(function (input, j) { input.value = result.numbers[j]; });
    }
    if (atTop) box.prepend(row); else box.appendChild(row);
    return row;
  }

  function buildGameGroups() {
    GAMES.forEach(function (game) {
      var group = groupTemplate.content.firstElementChild.cloneNode(true);
      group.setAttribute('data-game', game.id);
      $('[data-game-name]', group).textContent = game.name;
      $all('[data-g]', group).forEach(function (input) {
        input.id = 'g-' + game.id + '-' + input.getAttribute('data-g');
        input.previousElementSibling.htmlFor = input.id;
      });
      var box = $('[data-results]', group);
      $('[data-add-result]', group).addEventListener('click', function () {
        var row = addResultRow(game, box, null, true);
        $('[data-date]', row).value = new Date().toISOString().slice(0, 10);
        $('[data-n]', row).focus();
        markDirty();
      });
      gamesBox.appendChild(group);
    });
  }

  function groupFor(game) { return $('[data-game="' + game.id + '"]', gamesBox); }

  // ---------- Form <-> settings ----------
  function fill(settings) {
    TEXT_FIELDS.forEach(function (k) { editor.elements[k].value = settings[k] || ''; });
    editor.elements.licenceConfirmed.checked = !!settings.licenceConfirmed;
    GAMES.forEach(function (game) {
      var g = (settings.lotto || {})[game.id] || {};
      var group = groupFor(game);
      $('[data-g="jackpot"]', group).value = g.jackpot || '';
      $('[data-g="nextDraw"]', group).value = g.nextDraw || '';
      var box = $('[data-results]', group);
      box.replaceChildren();
      (g.results || []).forEach(function (r) { addResultRow(game, box, r); });
    });
  }

  function collect() {
    var out = { lotto: {} };
    TEXT_FIELDS.forEach(function (k) { out[k] = editor.elements[k].value.trim(); });
    out.licenceConfirmed = editor.elements.licenceConfirmed.checked;
    GAMES.forEach(function (game) {
      var group = groupFor(game);
      out.lotto[game.id] = {
        jackpot: $('[data-g="jackpot"]', group).value.trim(),
        nextDraw: $('[data-g="nextDraw"]', group).value.trim(),
        results: $all('.admin-result', group).map(function (row) {
          return {
            date: $('[data-date]', row).value,
            numbers: $all('[data-n]', row).map(function (input) { return input.value === '' ? NaN : Number(input.value); })
          };
        })
      };
    });
    return out;
  }

  function localProblems(data) {
    var problems = [];
    GAMES.forEach(function (game) {
      var g = data.lotto[game.id];
      if (!g.jackpot) problems.push(game.name + ': enter a jackpot.');
      g.results.forEach(function (r, i) {
        var label = game.name + ' result ' + (i + 1);
        if (!r.date) problems.push(label + ': pick a date.');
        if (!r.numbers.every(function (n) { return Number.isInteger(n) && n >= 1 && n <= game.max; })) problems.push(label + ': fill in all ' + game.picks + ' numbers (1 to ' + game.max + ').');
        else if (new Set(r.numbers).size !== game.picks) problems.push(label + ': the numbers must all be different.');
      });
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
        inbox.hidden = false;
        loadInbox();
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

  // ---------- Enquiries ----------
  function renderEntry(entry) {
    var li = document.createElement('li');
    li.className = 'admin-entry';
    var head = document.createElement('div');
    head.className = 'admin-entry__head';
    var type = document.createElement('span');
    type.className = 'admin-entry__type';
    type.textContent = FORM_LABELS[entry.form] || entry.form;
    var when = document.createElement('time');
    when.className = 'admin-entry__when';
    when.dateTime = entry.at;
    when.textContent = new Date(entry.at).toLocaleString();
    head.appendChild(type);
    head.appendChild(when);
    var dl = document.createElement('dl');
    dl.className = 'admin-entry__fields';
    Object.keys(entry.fields || {}).forEach(function (k) {
      var dt = document.createElement('dt');
      dt.textContent = FIELD_LABELS[k] || k;
      var dd = document.createElement('dd');
      dd.textContent = entry.fields[k];
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
    li.appendChild(head);
    li.appendChild(dl);
    return li;
  }

  function loadInbox() {
    inboxError.hidden = true;
    return api('GET', '/api/admin/submissions')
      .then(function (data) {
        var items = data.items || [];
        if (!items.length) {
          var empty = document.createElement('li');
          empty.className = 'admin-help';
          empty.textContent = 'No enquiries yet.';
          inboxList.replaceChildren(empty);
        } else {
          inboxList.replaceChildren.apply(inboxList, items.map(renderEntry));
        }
      })
      .catch(function (err) { showError(inboxError, err.message); });
  }

  $('[data-inbox-refresh]').addEventListener('click', loadInbox);

  logoutBtn.addEventListener('click', function () { setToken(null); location.reload(); });

  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  buildGameGroups();

  // Resume a session from earlier in this tab.
  if (getToken()) {
    api('POST', '/api/admin/verify').then(openEditor).catch(function () { setToken(null); });
  }
})();
