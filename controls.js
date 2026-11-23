// NuBu2600's lower-left pad uses fixed screen regions. Crossing the split
// switches the held direction, independent of where the finger first landed.
export function bindControls({ pad, setInput, pause }) {
  const touches = new Map();
  const movement = pad.querySelector('.moves');
  const rotation = pad.querySelector('.turns');
  const down = pad.querySelector('[data-button="down"]');
  const pauseButton = pad.querySelector('#pause-key');
  // Move the drop button out of the movement pair so each cluster's center
  // matches the two horizontal hit regions.
  pad.append(down);
  const buttons = [...pad.querySelectorAll('[data-button]')];
  for (const turn of rotation.querySelectorAll('button')) turn.textContent = '';
  const landscape = matchMedia('(orientation: landscape) and (pointer: coarse)');

  function readPoint(x, y) {
    const box = pad.getBoundingClientRect();
    const mid = box.left + box.width * 0.5;
    if (y < box.top + box.height / 2 || y > box.bottom || x < box.left || x > box.right) return null;
    const drop = down.getBoundingClientRect();
    if (!pad.closest('.scores') && x >= drop.left && x < drop.right && y >= drop.top && y < drop.bottom) {
      return { group: 'action', button: 'down' };
    }
    const left = x < mid;
    let split = box.left + box.width * (left ? 0.25 : 0.75);
    if (landscape.matches) {
      const cluster = (left ? movement : rotation).getBoundingClientRect();
      // NuBu's landscape thumb zone reaches at least 20px and up to
      // another 12% of the screen beyond the visible pair.
      const reach = Math.max(20, box.width * 0.12);
      if ((left && x > cluster.right + reach) || (!left && x < cluster.left - reach)) return null;
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

  pad.addEventListener('pointerdown', event => {
    if (pauseButton.contains(event.target) || event.button !== 0) return;
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
    if (!touch) return;
    const next = readPoint(event.clientX, event.clientY);
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
      if (event.detail !== 0) return;
      const name = button.dataset.button;
      const id = 'activate-' + name;
      setInput(id, name, true);
      setInput(id, name, false);
    });
  }
  pauseButton.onclick = pause;
  return {
    clear() {
      for (const id of [...touches.keys()]) release(id);
    }
  };
}
