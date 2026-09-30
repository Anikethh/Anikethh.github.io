/* ---------- shared: gutter numbers, email reveal, photo swap, ink helpers ---------- */
(function () {
    const container = document.querySelector('.lines-layout');
    if (!container) return;

    let gutter = container.querySelector('.gutter');
    if (!gutter) {
        gutter = document.createElement('div');
        gutter.className = 'gutter';
        gutter.setAttribute('aria-hidden', 'true');
        container.prepend(gutter);
    }
    const targets = Array.from(container.querySelectorAll('.line-target'));
    let lines = [];

    /* one number per rendered line box: each target contributes round(height / step) lines
       starting at its own top, and blank rows fill the gaps between blocks. Numbers share the
       text's line box (same height + line-height), so they sit on the text's baseline. */
    function render() {
        gutter.innerHTML = '';
        lines = [];
        const cTop = container.getBoundingClientRect().top;
        const step = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--line-step')) || 28;
        /* keep the publications on the same line grid as the intro, whatever height the photo column adds */
        const pubs = container.querySelector('.publications-section'), firstT = targets.find(t => t.offsetParent !== null);
        if (pubs && firstT) {
            pubs.style.marginTop = '0px';
            const off = (pubs.getBoundingClientRect().top - firstT.getBoundingClientRect().top) % step;
            if (off > 0.5 && step - off > 0.5) pubs.style.marginTop = (step - off) + 'px';
        }
        const tops = [];
        targets.forEach(t => {
            if (t.offsetParent === null) return;
            const r = t.getBoundingClientRect();
            const n = Math.max(1, Math.round(r.height / step));
            for (let i = 0; i < n; i++) tops.push(r.top - cTop + i * step);
        });
        if (!tops.length) return;
        tops.sort((x, y) => x - y);
        const rows = [];
        tops.forEach(y => {
            const prev = rows[rows.length - 1];
            if (prev !== undefined) {
                if (y - prev < step * 0.5) return;
                for (let g = prev + step; g < y - step * 0.5; g += step) rows.push(g);
            }
            rows.push(y);
        });
        const frag = document.createDocumentFragment();
        rows.forEach((y, i) => {
            const n = i + 1;
            const d = document.createElement('div');
            d.className = 'gutter-line';
            d.textContent = String(n).padStart(3, '0');
            d.style.top = y + 'px';
            frag.appendChild(d);
            lines.push({ el: d, y });
        });
        gutter.appendChild(frag);
    }

    /* IDE-style: hovering a block lights up its line numbers */
    function highlight(el) {
        const cTop = container.getBoundingClientRect().top;
        const r = el.getBoundingClientRect();
        const top = r.top - cTop - 2, bottom = r.bottom - cTop - 2;
        lines.forEach(l => l.el.classList.toggle('is-active', l.y >= top && l.y < bottom));
    }
    function clear() { lines.forEach(l => l.el.classList.remove('is-active')); }
    container.querySelectorAll('.intro-text > p, .publication, .section-label').forEach(el => {
        el.addEventListener('mouseenter', () => highlight(el));
        el.addEventListener('mouseleave', clear);
    });

    window.renderGutter = render;
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(render).observe(container);
    window.addEventListener('resize', render);
    window.addEventListener('load', render);
    if (document.fonts) document.fonts.ready.then(render);
    render();
})();

(function () {
    const a = document.querySelector('.email-link');
    if (!a) return;
    let open = false;
    const reveal = e => {
        if (open) return;
        e.preventDefault();
        a.textContent = a.dataset.email;
        open = true;
        window.renderGutter && window.renderGutter();
    };
    a.addEventListener('click', reveal);
    a.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') reveal(e); });
})();

(function () {
    const img = document.querySelector('.profile-img--swap');
    if (!img || !img.dataset.second) return;
    const a = img.getAttribute('src'), b = img.dataset.second;
    new Image().src = b;
    const on = () => img.setAttribute('src', b), off = () => img.setAttribute('src', a);
    img.addEventListener('mouseenter', on); img.addEventListener('mouseleave', off);
    img.addEventListener('focus', on); img.addEventListener('blur', off);
})();

/* ---------- ink: tiny toolkit for hand-drawn strokes ---------- */
window.Ink = (function () {
    const NS = 'http://www.w3.org/2000/svg';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function rng(seed) {
        let s = seed >>> 0;
        return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }

    /* smooth path through points (Catmull-Rom -> cubic Bezier) */
    function smooth(pts, tension = 0.5) {
        if (pts.length < 2) return '';
        let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
            const k = tension / 3;
            const c1 = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
            const c2 = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
            d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
        }
        return d;
    }

    /* tangled knot of loops */
    function knotPoints(cx, cy, r, n, seed) {
        const R = rng(seed), pts = [];
        for (let i = 0; i < n; i++) {
            const a = R() * Math.PI * 2, rr = r * (0.25 + 0.75 * Math.sqrt(R()));
            pts.push([cx + Math.cos(a) * rr * 1.25, cy + Math.sin(a) * rr * 0.8]);
        }
        return pts;
    }

    /* mostly-calm horizon with the odd sharp dip */
    function jaggedPoints(w, h, seed, opts = {}) {
        const R = rng(seed), pts = [], mid = h / 2;
        const step = opts.step || 14, amp = opts.amp || 3;
        for (let x = 0; x <= w; x += step * (0.6 + R() * 0.8)) {
            let y = mid + (R() - 0.5) * amp * 2;
            if (R() < (opts.dips || 0.07)) y = mid + (R() < 0.5 ? -1 : 1) * amp * (2.2 + R() * 1.6);
            pts.push([x, y]);
        }
        pts.push([w, mid]);
        return pts;
    }

    function svg(w, h, cls) {
        const s = document.createElementNS(NS, 'svg');
        s.setAttribute('viewBox', `0 0 ${w} ${h}`);
        s.setAttribute('aria-hidden', 'true');
        if (cls) s.setAttribute('class', cls);
        return s;
    }
    function path(d, cls) {
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', d);
        if (cls) p.setAttribute('class', cls);
        return p;
    }

    /* animate a stroke being drawn */
    function draw(p, ms = 1600, delay = 0) {
        if (reduced) return;
        const L = p.getTotalLength();
        p.style.strokeDasharray = L;
        p.style.strokeDashoffset = L;
        p.getBoundingClientRect();
        p.style.transition = `stroke-dashoffset ${ms}ms cubic-bezier(.6,.05,.3,1) ${delay}ms`;
        requestAnimationFrame(() => { p.style.strokeDashoffset = 0; });
    }

    /* horizon divider with the label sitting in a gap, e.g. ——~ Publications ~—— */
    function horizon(label, seed) {
        const wrap = label.parentElement;
        const host = document.createElement('div');
        host.className = 'horizon';
        wrap.insertBefore(host, label);
        host.appendChild(label);
        label.classList.add('horizon-label');
        const build = () => {
            host.querySelectorAll('svg').forEach(s => s.remove());
            const W = host.clientWidth, H = 24;
            const lab = host.querySelector('.horizon-label');
            const lw = lab.offsetWidth + 28, lx = 36;
            const left = svg(lx, H, 'horizon-l'), right = svg(Math.max(10, W - lx - lw), H, 'horizon-r');
            left.appendChild(path(smooth(jaggedPoints(lx, H, seed, { step: 9, amp: 2.6, dips: 0.2 })), 'ink'));
            right.appendChild(path(smooth(jaggedPoints(W - lx - lw, H, seed + 7, { step: 16, amp: 2.2, dips: 0.06 })), 'ink'));
            left.style.width = lx + 'px'; right.style.width = (W - lx - lw) + 'px';
            host.insertBefore(left, lab); host.appendChild(right);
            if (!host.dataset.drawn) { host.querySelectorAll('path').forEach((p, i) => draw(p, 1800, 200 + i * 300)); host.dataset.drawn = 1; }
        };
        build();
        let t; window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(build, 150); });
        return host;
    }

    /* crosshair: two thin tapered strokes crossing on an element's last letter */
    function crosshair(el, seed) {
        const R = rng(seed);
        const s = svg(120, 120, 'crosshair');
        const v = `M60,${4 + R() * 6} L${60.6},60 L60,${112 + R() * 6} L${59.4},60 Z`;
        const h = `M${2 + R() * 8},${60} L60,${59.4} L${118},${60.2} L60,${60.6} Z`;
        s.appendChild(path(v, 'ink-fill'));
        s.appendChild(path(h, 'ink-fill'));
        const c = document.createElementNS(NS, 'path');
        c.setAttribute('d', 'M78,44 A22,22 0 1,0 78,76');
        c.setAttribute('class', 'ink');
        s.appendChild(c);
        el.appendChild(s);
        draw(c, 1400, 600);
        return s;
    }

    /* circle a phrase by hand: two loose loops that overshoot, like a pen */
    function circle(el, seed, delay) {
        const R = rng(seed);
        const s = svg(100, 40);
        s.setAttribute('preserveAspectRatio', 'none');
        const pts = [];
        const turns = 1.15 + R() * 0.2, n = 22;
        for (let i = 0; i <= n; i++) {
            const t = (i / n) * turns * Math.PI * 2 + 2.6;
            const wob = 1 + (R() - .5) * 0.08;
            pts.push([50 + Math.cos(t) * 52 * wob + i * 0.2, 20 + Math.sin(t) * 19 * wob - i * 0.12]);
        }
        const p = path(smooth(pts, 1), 'ink pen');
        s.appendChild(p);
        el.appendChild(s);
        draw(p, 1100, delay);
    }
    function wrapPhrase(root, phrase) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            const i = node.data.indexOf(phrase);
            if (i < 0) continue;
            const after = node.splitText(i);
            after.splitText(phrase.length);
            const span = document.createElement('span');
            span.className = 'mark';
            after.parentNode.replaceChild(span, after);
            span.appendChild(after);
            return span;
        }
    }

    return { circle, wrapPhrase, rng, smooth, knotPoints, jaggedPoints, svg, path, draw, horizon, crosshair, reduced, NS };
})();

(function () {
    const { svg, path, smooth, knotPoints, draw, horizon, crosshair } = window.Ink;

    /* clouds: layered fractal noise, mapped to soft whites over the grey page */
    const c = document.createElement('div');
    c.className = 'clouds';
    c.innerHTML = `<svg class="clouds-drift" preserveAspectRatio="none" viewBox="0 0 1000 1000">
        <filter id="cl" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.0022 0.0042" numOctaves="5" seed="11"/>
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -1.6 1.25"/>
          <feGaussianBlur stdDeviation="6"/>
        </filter>
        <rect width="1000" height="1000" filter="url(#cl)"/>
      </svg>`;
    document.body.prepend(c);

    /* vertical line with a knot, fixed in the left margin; only drawn when the margin is wide enough */
    const wrap = document.createElement('div');
    wrap.className = 'cover-wrap';
    document.body.insertBefore(wrap, document.querySelector('.lines-layout'));
    let drawn = false;
    function cover() {
        wrap.innerHTML = '';
        const m = document.querySelector('.lines-layout').getBoundingClientRect().left;
        const W = m, H = window.innerHeight;
        if (W < 120) { wrap.style.display = 'none'; return; }
        wrap.style.display = '';
        wrap.style.width = W + 'px';
        const x0 = W * 0.5;
        const s = svg(W, H, 'cover-line');
        s.setAttribute('preserveAspectRatio', 'none');
        const pts = [[x0, -20], [x0 - 1, H * 0.2]];
        pts.push(...knotPoints(x0, H * 0.36, Math.min(46, W * 0.28), 30, 3));
        pts.push([x0 + 2, H * 0.52], [x0 - 3, H * 0.66], [x0 + 12, H * 0.74], [x0 - 4, H * 0.8], [x0 + 1, H * 0.9], [x0, H + 20]);
        const p = path(smooth(pts, 0.85), 'ink');
        p.style.strokeWidth = '1';
        s.appendChild(p);
        wrap.appendChild(s);
        if (!drawn) { draw(p, 2800, 100); drawn = true; }
    }
    cover();
    let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(cover, 150); });

    /* hand-drawn circle */
    const m = window.Ink.wrapPhrase(document.querySelector('.intro-text'), 'AI safety');
    if (m) window.Ink.circle(m, 5, 900);

    horizon(document.getElementById('publications'), 21);
})();
