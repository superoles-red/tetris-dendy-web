// NuBu2600's lower-left pad uses fixed screen regions. Crossing the split
// switches the held direction, independent of where the finger first landed.
export function bindControls({ pad, setInput, pause }) {
  const touches = new Map();
  const game = pad.closest('#game');
  const isPlaying = () => !game.inert && game.dataset.scene === 'play';
  const movement = pad.querySelector('.moves');
  const rotation = pad.querySelector('.turns');
  const down = pad.querySelector('[data-button="down"]');
  const pauseButton = pad.querySelector('#pause-key');
  // Move the drop button out of the movement pair so each cluster's center
  // matches the two horizontal hit regions.
  pad.append(down);
  const buttons = [...pad.querySelectorAll('[data-button]')];
  for (const turn of rotation.querySelectorAll('button')) turn.textContent = '';
  const portrait = matchMedia('(orientation: portrait)');
  const landscape = matchMedia('(orientation: landscape) and (pointer: coarse)');

  function readPoint(x, y) {
    const box = pad.getBoundingClientRect();
    if (y < box.top || y >= box.bottom || x < box.left || x >= box.right) return null;
    const mid = box.left + box.width * 0.5;
    const drop = down.getBoundingClientRect();
    const reach = Math.max(20, box.width * 0.12);
    if (y >= drop.top && y < drop.bottom) {
      // The arrow marks a horizontal strip, all the way from the
      // movement zone to the right edge. Rotation lives outside it.
      const movementEdge = landscape.matches
        ? Math.min(mid, movement.getBoundingClientRect().right + reach)
        : mid;
      if (x >= movementEdge) return { group: 'drop', button: 'down' };
    }
    const start = box.top + box.height * (portrait.matches ? 0.38 : 0.5);
    if (y < start) return null;
    const left = x < mid;
    let split = box.left + box.width * (left ? 0.25 : 0.75);
    if (landscape.matches) {
      const cluster = (left ? movement : rotation).getBoundingClientRect();
      // NuBu's landscape thumb zone reaches at least 20px and up to
      // another 12% of the screen beyond the visible pair.
      if ((left && x >= cluster.right + reach) || (!left && x < cluster.left - reach)) return null;
      split = cluster.left + cluster.width * 0.5;
    }
    return left
      ? { group: 'move', button: x < split ? 'left' : 'right' }
      : { group: 'action', button: x < split ? 'b' : 'a' };
  }

  function release(id) {
    const touch = touches.get(id);
    if (!touch) return;
    touches.delete(id);
    setInput(id, touch.button, false);
  }

  function clear() {
    for (const id of [...touches.keys()]) release(id);
  }

  // Native scene changes can happen while a player's thumbs are still down.
  new MutationObserver(() => { if (!isPlaying()) clear(); })
    .observe(game, { attributes: true, attributeFilter: ['inert', 'data-scene'] });

  // Cancel WebKit's native long-press recognizer even in the inactive
  // parts of the play surface. The pause button keeps its normal tap.
  pad.addEventListener('touchstart', event => {
    if (isPlaying() && !pauseButton.contains(event.target) && event.cancelable) event.preventDefault();
  }, { passive: false });

  pad.addEventListener('pointerdown', event => {
    if (!isPlaying() || pauseButton.contains(event.target) || event.button !== 0) return;
    const hit = readPoint(event.clientX, event.clientY);
    if (!hit) return;
    event.preventDefault();
    pad.setPointerCapture(event.pointerId);
    touches.set(event.pointerId, hit);
    setInput(event.pointerId, hit.button, true);
  });
  pad.addEventListener('pointermove', event => {
    const id = event.pointerId;
    const touch = touches.get(id);
    // A thumb that started on drop holds it until release, including when it slips onto rotation.
    if (!touch || touch.group === 'drop') return;
    const next = isPlaying() && readPoint(event.clientX, event.clientY);
    if (!next || next.group !== touch.group) {
      release(id);
    } else if (touch.button !== next.button) {
      setInput(id, touch.button, false);
      touches.set(id, next);
      setInput(id, next.button, true);
    }
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    pad.addEventListener(name, e => release(e.pointerId));
  }
  // Keyboard/assistive activation of the native button does not create a pointer.
  for (const button of buttons) {
    button.addEventListener('click', event => {
      if (!isPlaying() || event.detail !== 0) return;
      const name = button.dataset.button;
      const id = 'activate-' + name;
      setInput(id, name, true);
      setInput(id, name, false);
    });
  }
  pauseButton.onclick = pause;
  return { clear };
}
