/* Faux Contact / rolling horizontal deflection for a complete display surface. */
(() => {
  const ns = "http://www.w3.org/2000/svg";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  // Red encodes horizontal displacement. The gentle return lobe pulls the
  // trailing rows back past centre before the picture settles.
  const profile = `<svg xmlns="${ns}" width="1" height="64" viewBox="0 0 1 64" preserveAspectRatio="none">
    <linearGradient id="p" x2="0" y2="1">
      <stop stop-color="#808080"/>
      <stop offset=".18" stop-color="#878080"/>
      <stop offset=".38" stop-color="#d68080"/>
      <stop offset=".48" stop-color="#ff8080"/>
      <stop offset=".58" stop-color="#bd8080"/>
      <stop offset=".70" stop-color="#508080"/>
      <stop offset=".79" stop-color="#3f8080"/>
      <stop offset="1" stop-color="#808080"/>
    </linearGradient><rect width="1" height="64" fill="url(#p)"/>
  </svg>`;

  function element(tag, attrs, parent) {
    const node = document.createElementNS(ns, tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    parent.append(node);
    return node;
  }

  function install(screen, index) {
    const id = "fc-deflection-" + index;
    const svg = element("svg", {width: 0, height: 0, "aria-hidden": true, focusable: false}, document.body);
    svg.style.position = "absolute";
    const filter = element("filter", {
      id, x: 0, y: 0, width: "100%", height: "100%",
      primitiveUnits: "userSpaceOnUse", "color-interpolation-filters": "sRGB"
    }, element("defs", {}, svg));
    element("feFlood", {"flood-color": "#808080", result: "neutral"}, filter);
    const band = element("feImage", {
      href: "data:image/svg+xml," + encodeURIComponent(profile),
      x: 0, preserveAspectRatio: "none", result: "band"
    }, filter);
    const roll = element("animate", {
      attributeName: "y", repeatCount: "indefinite", calcMode: "linear"
    }, band);
    const map = element("feMerge", {result: "registration"}, filter);
    element("feMergeNode", {in: "neutral"}, map);
    element("feMergeNode", {in: "band"}, map);
    const warp = element("feDisplacementMap", {
      in: "SourceGraphic", in2: "registration", xChannelSelector: "R", yChannelSelector: "G"
    }, filter);

    function size() {
      const style = getComputedStyle(screen);
      const height = parseFloat(style.getPropertyValue("--fc-band")) || 64;
      const shift = parseFloat(style.getPropertyValue("--fc-shift")) || 8;
      band.setAttribute("width", screen.offsetWidth);
      band.setAttribute("height", height);
      band.setAttribute("y", -height);
      roll.setAttribute("from", -height);
      roll.setAttribute("to", screen.offsetHeight);
      roll.setAttribute("dur", style.getPropertyValue("--fc-period").trim() || "7s");
      warp.setAttribute("scale", 2 * shift);
    }

    let visible = true;
    function sync() {
      const still = reduced.matches || document.hidden || !visible || screen.closest('[data-motion="paused"]');
      if (still) svg.pauseAnimations();
      else svg.unpauseAnimations();
      screen.style.setProperty("--fc-roll-filter", reduced.matches ? "none" : `url("#${id}")`);
    }

    size();
    roll.beginElement();
    sync();
    new ResizeObserver(size).observe(screen);
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }).observe(screen);
    const changes = new MutationObserver(sync);
    for (let node = screen; node; node = node.parentElement) {
      changes.observe(node, {attributes: true, attributeFilter: ["data-motion"]});
    }
    reduced.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
  }
  document.querySelectorAll(".fc .fc-screen").forEach(install);
})();
