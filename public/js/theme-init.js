/* Applies a stored theme choice before the page paints, to avoid a flash of the wrong
   theme. Loaded in <head>, before the stylesheet — kept separate from ui.js (which loads
   at the end of <body>) because by then the page has already rendered once. */
(function () {
  try {
    var t = localStorage.getItem('splitit-theme');
    if (t) document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    /* localStorage unavailable — falls back to the OS theme preference */
  }
})();
