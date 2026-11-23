// In a Safari tab the browser owns the status bar. A Home Screen web app
// can draw underneath it and briefly report a zero top inset at launch.
export function bindPhoneInsets() {
  if (!/iPhone|iPod/i.test(navigator.userAgent)) return;
  const root = document.documentElement;
  const display = matchMedia('(display-mode: standalone), (display-mode: fullscreen)');
  let settle;
  function measure() {
    const standalone = navigator.standalone === true || display.matches;
    root.toggleAttribute('data-iphone-standalone', standalone);
    if (!standalone) {
      root.style.removeProperty('--iphone-status-floor');
      return;
    }
    const reported = parseFloat(getComputedStyle(root).getPropertyValue('--device-safe-top'));
    const tall = Math.max(screen.width, screen.height, innerHeight) >= 812;
    const fallback = tall ? 47 : 20;
    root.style.setProperty('--iphone-status-floor', (reported > 0 ? 0 : fallback) + 'px');
  }
  function refresh() {
    measure();
    clearTimeout(settle);
    settle = setTimeout(measure, 250);
  }
  for (const event of ['resize', 'orientationchange', 'pageshow']) window.addEventListener(event, refresh);
  window.visualViewport?.addEventListener('resize', refresh);
  display.addEventListener?.('change', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  refresh();
}
