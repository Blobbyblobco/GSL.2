// Runs in <head> before first paint: show the 18+ gate only to visitors who haven't confirmed.
(function () {
  var ok = false;
  try { ok = localStorage.getItem('gsl_age_ack') === '1'; } catch (e) {}
  if (!ok) document.documentElement.classList.add('needs-age');
})();
