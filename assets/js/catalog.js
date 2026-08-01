/* Catalog filter bar: client-side search, domain facets, and sort over the
   server-rendered cards. Progressive enhancement — with JS off the full grid
   still renders (default order: updated, newest first). */
(function () {
  'use strict';

  var grid = document.getElementById('card-grid');
  if (!grid) return;
  var cards = Array.prototype.slice.call(grid.querySelectorAll('.guide-card'));
  var search = document.getElementById('catalog-search');
  var facets = document.querySelectorAll('#catalog-facets .facet');
  var count = document.getElementById('catalog-count');
  var sortBtn = document.getElementById('catalog-sort');
  var empty = document.getElementById('card-grid-empty');
  var totalLabel = count ? count.textContent : '';

  var state = { q: '', facet: 'all', sort: 'updated' };
  var SORTS = ['updated', 'name', 'stars'];

  function apply() {
    var shown = 0;
    cards.forEach(function (c) {
      var ok = (state.facet === 'all' || c.dataset.domain === state.facet) &&
               (!state.q || c.dataset.search.indexOf(state.q) !== -1);
      c.classList.toggle('hidden', !ok);
      if (ok) shown++;
    });
    if (count) {
      count.textContent = (state.q || state.facet !== 'all')
        ? shown + ' of ' + cards.length + ' guides'
        : totalLabel;
    }
    if (empty) empty.style.display = shown === 0 ? 'block' : 'none';
  }

  function resort() {
    var key = state.sort;
    var sorted = cards.slice().sort(function (a, b) {
      if (key === 'name') return a.dataset.name < b.dataset.name ? -1 : 1;
      var ka = parseInt(a.dataset[key === 'stars' ? 'stars' : 'updated'], 10);
      var kb = parseInt(b.dataset[key === 'stars' ? 'stars' : 'updated'], 10);
      return kb - ka;
    });
    sorted.forEach(function (c) { grid.appendChild(c); });
  }

  if (search) search.addEventListener('input', function () {
    state.q = search.value.trim().toLowerCase();
    apply();
  });

  facets.forEach(function (f) {
    f.addEventListener('click', function () {
      state.facet = f.dataset.facet;
      facets.forEach(function (x) { x.classList.toggle('active', x === f); });
      apply();
    });
  });

  if (sortBtn) sortBtn.addEventListener('click', function () {
    var i = (SORTS.indexOf(state.sort) + 1) % SORTS.length;
    state.sort = SORTS[i];
    sortBtn.textContent = 'sort: ' + state.sort + ' ▾';
    resort();
  });
})();
