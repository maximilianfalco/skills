// Fetch with no cookies, so the shot shows what an agent sees, not what the admin sees.
window.__show = async (url, opts = {}) => {
  const res = await fetch(url, { credentials: 'omit' });
  let L = (await res.text()).split('\n');
  if (opts.from)
    L = L.slice(
      Math.max(
        0,
        L.findIndex(l => l === opts.from),
      ),
    );
  if (opts.lines) {
    const more = L.length > opts.lines;
    L = L.slice(0, opts.lines);
    if (more) L.push('...');
  }
  document.body.innerHTML = '';
  const p = document.createElement('pre');
  p.textContent = L.join('\n').replace(/\n+$/, '');
  p.style.cssText = `font:${opts.font || 26}px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap;max-width:3000px;padding:24px 32px;margin:0;color:#1f2328;display:inline-block;background:#fff`;
  document.body.style.cssText = 'margin:0;background:#fff';
  document.body.appendChild(p);
  // No requestAnimationFrame here. It never fires in a background tab, so the call hangs.
  const r = p.getBoundingClientRect();
  const k = (opts.frameWidth || 1512) / innerWidth;
  return { status: res.status, url: res.url, region: [0, 0, Math.ceil(r.width * k) + 4, Math.ceil(r.height * k) + 4] };
};
