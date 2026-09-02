/**
 * The Network panel's behaviour, as one inline script.
 *
 * This is the first thing in a report that genuinely needs JavaScript. Sorting a column,
 * narrowing to Fetch/XHR and opening a request onto its headers are not states a
 * checkbox can express, and the report was already carrying a script whenever there was
 * a video to seek. The rule it does bend is stated in `STATUS.md`: a report now ships a
 * script when there is a table to drive, not only when there is a player.
 *
 * Written against what the markup already contains rather than against serialised data:
 * every row carries its own sort keys and filter haystack in `data-` attributes, and
 * every detail pane is rendered shut in the page. So the script moves and hides things
 * that are already there, and a reader with JavaScript off still gets the whole table.
 *
 * ES5-ish on purpose. This runs in whatever browser the report was emailed to.
 */
export const NETWORK_SCRIPT = `<script>
(function () {
  var panel = document.querySelector('.netpanel')
  if (!panel) return
  var body = panel.querySelector('tbody')
  var rows = Array.prototype.slice.call(body.querySelectorAll('tr'))
  var find = panel.querySelector('.net-find')
  var failsOnly = panel.querySelector('.net-fails input')
  var detail = panel.querySelector('.net-detail')
  var count = panel.querySelector('.net-count')
  var group = 'all'
  var sortKey = null
  var sortDir = 1

  var num = function (row, key) { return Number(row.getAttribute(key) || 0) }

  function visible() {
    return rows.filter(function (r) { return !r.hidden })
  }

  /*
   * Bars are scaled to the rows currently on screen, not to the whole session. That
   * makes filtering to Fetch/XHR act as a zoom, which is the only practical answer to a
   * hundred-second capture: against the full span a one-second request is a pixel wide.
   */
  function drawBars() {
    var shown = visible().filter(function (r) { return r.getAttribute('data-at') !== '' })
    if (!shown.length) return
    var starts = shown.map(function (r) { return num(r, 'data-at') })
    var ends = shown.map(function (r) { return num(r, 'data-at') + num(r, 'data-dur') })
    var from = Math.min.apply(null, starts)
    var span = Math.max.apply(null, ends) - from
    rows.forEach(function (r) {
      var bar = r.querySelector('.net-bar')
      if (!bar) return
      if (span <= 0) { bar.style.left = '0%'; bar.style.width = '100%'; return }
      var left = ((num(r, 'data-at') - from) / span) * 100
      var width = (num(r, 'data-dur') / span) * 100
      bar.style.left = Math.max(0, Math.min(100, left)) + '%'
      bar.style.width = Math.max(0.6, Math.min(100 - left, width)) + '%'
    })
  }

  function apply() {
    var needle = (find.value || '').toLowerCase().trim()
    var onlyBad = failsOnly.checked
    rows.forEach(function (r) {
      var okGroup = group === 'all' || r.getAttribute('data-group') === group
      var okBad = !onlyBad || r.getAttribute('data-fail') === '1'
      var okText = !needle || r.getAttribute('data-find').indexOf(needle) !== -1
      r.hidden = !(okGroup && okBad && okText)
    })
    var shown = visible()
    count.textContent = shown.length === rows.length
      ? rows.length + ' requests'
      : shown.length + ' of ' + rows.length + ' requests'
    drawBars()
  }

  function sortBy(key) {
    if (sortKey === key) sortDir = -sortDir
    else { sortKey = key; sortDir = 1 }
    var numeric = key === 'status' || key === 'bytes' || key === 'time' || key === 'at'
    var copy = rows.slice()
    copy.sort(function (a, b) {
      var av = a.getAttribute('data-' + key) || ''
      var bv = b.getAttribute('data-' + key) || ''
      if (numeric) return (Number(av) - Number(bv)) * sortDir
      return av.localeCompare(bv) * sortDir
    })
    copy.forEach(function (r) { body.appendChild(r) })
    panel.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.setAttribute('data-dir', th.getAttribute('data-sort') === key ? (sortDir > 0 ? 'up' : 'down') : '')
    })
    drawBars()
  }

  function select(row) {
    rows.forEach(function (r) { r.classList.toggle('on', r === row) })
    panel.querySelectorAll('.net-pane').forEach(function (p) {
      p.hidden = p.getAttribute('data-for') !== row.getAttribute('data-i')
    })
    detail.hidden = false
    showTab('headers')
  }

  function showTab(name) {
    panel.querySelectorAll('.net-tabs button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-tab') === name)
    })
    panel.querySelectorAll('.net-pane:not([hidden]) [data-sheet]').forEach(function (sheet) {
      sheet.hidden = sheet.getAttribute('data-sheet') !== name
    })
  }

  rows.forEach(function (r) {
    r.addEventListener('click', function (e) {
      // The timestamp is a seek button in its own right; do not swallow it.
      if (e.target.closest('button.at')) return
      select(r)
    })
  })
  panel.querySelectorAll('th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () { sortBy(th.getAttribute('data-sort')) })
  })
  panel.querySelectorAll('.net-types button').forEach(function (b) {
    b.addEventListener('click', function () {
      group = b.getAttribute('data-group')
      panel.querySelectorAll('.net-types button').forEach(function (o) { o.classList.toggle('on', o === b) })
      apply()
    })
  })
  panel.querySelectorAll('.net-tabs button').forEach(function (b) {
    b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')) })
  })
  panel.querySelector('.net-close').addEventListener('click', function () {
    detail.hidden = true
    rows.forEach(function (r) { r.classList.remove('on') })
  })
  find.addEventListener('input', apply)
  failsOnly.addEventListener('change', apply)

  apply()
})()
</script>`
