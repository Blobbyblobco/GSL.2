// Gold Stake Lotto — page behaviour: age gate, mobile nav, live settings, and forms.
(function () {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function formatDate(iso) {
    var p = String(iso).split('-');
    if (p.length !== 3) return iso;
    return parseInt(p[2], 10) + ' ' + MONTHS[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }

  function digits(s) { return String(s).replace(/[^0-9]/g, ''); }

  // ---------- Age gate ----------
  function initAgeGate() {
    var yes = $('[data-age-yes]');
    if (!yes) return;
    if (document.documentElement.classList.contains('needs-age')) yes.focus();
    yes.addEventListener('click', function () {
      try { localStorage.setItem('gsl_age_ack', '1'); } catch (e) {}
      document.documentElement.classList.remove('needs-age');
    });
  }

  // ---------- Mobile nav ----------
  function initNav() {
    var toggle = $('[data-nav-toggle]');
    var menu = $('#mobile-nav');
    if (!toggle || !menu) return;
    function setOpen(open) {
      menu.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
    toggle.addEventListener('click', function () { setOpen(menu.hidden); });
    $all('a', menu).forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { setOpen(false); toggle.focus(); } });
  }

  // ---------- Settings (jackpot, draw date, results, contact details) ----------
  function derived(s) {
    var channel = String(s.youtubeChannelUrl || '').replace(/\/+$/, '');
    var handleMatch = channel.match(/\/(@[^/]+)$/);
    var handle = handleMatch ? handleMatch[1] : 'YouTube';
    var text = {
      ussdCode: s.ussdCode,
      whatsappNumber: s.whatsappNumber,
      phoneNumber: s.phoneNumber,
      email: s.email,
      youtubeHandle: channel.replace(/^https?:\/\/(www\.)?/, ''),
      youtubeShortHandle: handle,
      licenceLine: s.licenceConfirmed
        ? 'Licensed by the Lotteries & Gaming Board of Zimbabwe.'
        : 'Licensed by the Lotteries & Gaming Board — licence to be confirmed once granted.'
    };
    // Per-game Lotto values, bound as e.g. data-s="mega7.jackpot" / data-s="mega7.nextDrawLabel".
    // With no next draw set, the page keeps its built-in "Every Sunday"-style label.
    Object.keys(s.lotto || {}).forEach(function (id) {
      var g = s.lotto[id];
      text[id + '.jackpot'] = g.jackpot;
      if (g.nextDraw) text[id + '.nextDrawLabel'] = 'Next draw · ' + g.nextDraw;
    });
    return {
      text: text,
      href: {
        whatsapp: 'https://wa.me/' + digits(s.whatsappNumber),
        phone: 'tel:+' + digits(s.phoneNumber),
        ussd: 'tel:' + encodeURIComponent(s.ussdCode),
        email: 'mailto:' + s.email,
        youtube: channel,
        youtubeLive: channel + '/live'
      }
    };
  }

  function makeBall(n, cls) {
    var b = document.createElement('span');
    b.className = 'ball ' + cls;
    b.textContent = pad2(n);
    return b;
  }

  // Latest result per Lotto game; games with no results keep their "Awaiting first draw" note.
  function renderResults(lotto) {
    $all('[data-result]').forEach(function (item) {
      var game = lotto && lotto[item.getAttribute('data-result')];
      var latest = game && Array.isArray(game.results) ? game.results[0] : null;
      if (!latest) return;
      var dateEl = $('[data-result-date]', item);
      var ballsEl = $('[data-result-balls]', item);
      dateEl.textContent = formatDate(latest.date);
      dateEl.setAttribute('datetime', latest.date);
      ballsEl.replaceChildren.apply(ballsEl, latest.numbers.map(function (n) { return makeBall(n, 'ball--mini'); }));
      ballsEl.setAttribute('aria-label', 'Winning numbers ' + latest.numbers.map(pad2).join(', '));
    });
  }

  function renderLiveVideo(videoId) {
    var box = $('[data-live-video]');
    if (!box || !videoId) return;
    var iframe = document.createElement('iframe');
    iframe.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(videoId) + '?rel=0';
    iframe.title = 'Gold Stake Lotto live draw';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.loading = 'lazy';
    box.replaceChildren(iframe);
  }

  function applySettings(s) {
    var d = derived(s);
    $all('[data-s]').forEach(function (el) {
      var v = d.text[el.getAttribute('data-s')];
      if (typeof v === 'string' && v) el.textContent = v;
    });
    $all('[data-s-href]').forEach(function (el) {
      var v = d.href[el.getAttribute('data-s-href')];
      if (v) el.setAttribute('href', v);
    });
    var licence = $('[data-licence]');
    if (licence) licence.classList.toggle('is-confirmed', !!s.licenceConfirmed);
    renderResults(s.lotto);
    renderLiveVideo(s.liveVideoId);
  }

  function loadSettings() {
    if (!window.fetch) return;
    fetch('/api/settings', { headers: { accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(applySettings)
      // The page already contains sensible defaults, so a failed fetch just leaves them in place.
      .catch(function (err) { if (window.console) console.warn('Could not load live settings:', err); });
  }

  // ---------- Forms (posted to /api/forms without a page reload) ----------
  function initForms() {
    $all('form[data-ajax-form]').forEach(function (form) {
      var name = form.getAttribute('name');
      var body = $('[data-form-body="' + name + '"]');
      var thanks = $('[data-form-thanks="' + name + '"]');
      var errorBox = $('[data-form-error]', form);
      var button = $('button[type="submit"]', form);

      form.addEventListener('submit', function (e) {
        if (!window.fetch || !window.URLSearchParams) return; // fall back to a normal POST
        e.preventDefault();
        if (errorBox) errorBox.hidden = true;
        button.disabled = true;
        var original = button.textContent;
        button.textContent = 'Sending…';

        fetch(form.action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams(new FormData(form)).toString()
        })
          .then(function (r) {
            if (!r.ok) {
              return r.json().catch(function () { return {}; }).then(function (d) {
                var err = new Error(d.error || 'HTTP ' + r.status);
                err.fromServer = !!d.error;
                throw err;
              });
            }
            form.reset();
            if (body) body.hidden = true;
            if (thanks) { thanks.hidden = false; thanks.focus(); }
          })
          .catch(function (err) {
            if (errorBox) {
              // Show the server's message (e.g. a missing field); otherwise a generic one.
              errorBox.textContent = err && err.fromServer
                ? err.message
                : 'Sorry, that didn’t send. Please check your connection and try again, or reach us on WhatsApp.';
              errorBox.hidden = false;
            }
          })
          .then(function () { button.disabled = false; button.textContent = original; });
      });
    });
  }

  function initYear() {
    $all('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
  }

  initAgeGate();
  initNav();
  initForms();
  initYear();
  loadSettings();
})();
