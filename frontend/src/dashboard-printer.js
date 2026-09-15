const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const isLowPower = () => document.documentElement.classList.contains("motion-reduced") || window.innerWidth < 820 || window.matchMedia("(pointer: coarse)").matches || (navigator.hardwareConcurrency || 8) <= 4 || prefersReducedMotion.matches;

const ROUTE_ORDER = ["printers-active", "supplies-low", "maintenance-pending", "monthly-consumption", "printers-offline", "printers-service"];
const SVG_NS = "http://www.w3.org/2000/svg";

export function createDashboardPrinterExperience() {
  const host = document.querySelector("#dashboard-printer-experience");
  if (!host) return { setActive: () => {}, setRunning: () => {}, refresh: () => {}, dispose: () => {} };

  const svg = host.querySelector(".printer-illustration");
  const station = document.querySelector('[data-station="dashboard"]');
  const content = station?.querySelector(".main-container");
  const metricCards = [...document.querySelectorAll('[data-station="dashboard"] [data-card-seccion]')];
  const routeAliases = { impresoras: "printers-active", suministros: "supplies-low", mantenimientos: "maintenance-pending", reportes: "monthly-consumption" };
  let activeRoute = null;
  let running = false;
  let desiredRunning = false;
  let routesSvg = null;
  let hasDrawn = false;
  let drawTimer = 0;
  let rebuildTimer = 0;
  let resizeFrame = 0;

  /* Builds the neon route overlay: one glowing bezier per stat-card, measured from
     the live screen positions of the printer and each card so the threads always
     land exactly on the top edge of their card. */
  const buildRoutes = () => {
    if (!station || !content || !svg) return;
    const cards = ROUTE_ORDER
      .map((route) => content.querySelector(`[data-flow-route="${route}"]`))
      .filter(Boolean);
    if (!cards.length) return;
    const base = content.getBoundingClientRect();
    if (base.width < 80 || base.height < 80) return;
    const printer = svg.getBoundingClientRect();
    if (!printer.width || !printer.height) return;

    // Anchor on the printer's visible body (its left flank / output tray), not the SVG box edge.
    const sx0 = printer.left - base.left + printer.width * 0.2;
    const sy0 = printer.top - base.top + printer.height * 0.62;

    routesSvg?.remove();
    routesSvg = document.createElementNS(SVG_NS, "svg");
    routesSvg.setAttribute("class", "operational-routes");
    routesSvg.setAttribute("aria-hidden", "true");

    cards.forEach((card, index) => {
      const rect = card.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const route = card.dataset.flowRoute || card.dataset.cardSeccion;

      const ex = rect.left - base.left + rect.width * 0.5;
      const ey = rect.top - base.top + 2;
      const sx = sx0 - index * 2;
      const sy = sy0 + index * 7;
      const dy = ey - sy;
      const c1x = sx + (ex - sx) * 0.16 - 30;
      const c1y = sy + dy * 0.12 + 46;
      const c2y = ey - Math.max(70, dy * 0.32);
      const d = `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${ex.toFixed(1)} ${c2y.toFixed(1)}, ${ex.toFixed(1)} ${ey.toFixed(1)}`;

      const group = document.createElementNS(SVG_NS, "g");
      group.dataset.route = route;

      const origin = document.createElementNS(SVG_NS, "circle");
      origin.setAttribute("class", "route-origin");
      origin.setAttribute("cx", sx.toFixed(1));
      origin.setAttribute("cy", sy.toFixed(1));
      origin.setAttribute("r", "2.6");
      group.append(origin);

      const glow = document.createElementNS(SVG_NS, "path");
      glow.setAttribute("class", "route-glow");
      glow.setAttribute("d", d);

      const core = document.createElementNS(SVG_NS, "path");
      core.setAttribute("class", "route-core");
      core.setAttribute("d", d);

      const node = document.createElementNS(SVG_NS, "circle");
      node.setAttribute("class", "route-node");
      node.setAttribute("cx", ex.toFixed(1));
      node.setAttribute("cy", ey.toFixed(1));
      node.setAttribute("r", "3.2");

      group.append(glow, core, node);

      if (!isLowPower()) {
        const pulse = document.createElementNS(SVG_NS, "circle");
        pulse.setAttribute("class", "route-pulse");
        pulse.setAttribute("r", "2.4");
        const motion = document.createElementNS(SVG_NS, "animateMotion");
        motion.setAttribute("dur", `${(2.8 + index * 0.45).toFixed(2)}s`);
        motion.setAttribute("repeatCount", "indefinite");
        motion.setAttribute("path", d);
        pulse.appendChild(motion);
        group.append(pulse);
      }

      routesSvg.appendChild(group);

      const len = Math.ceil(core.getTotalLength());
      glow.style.setProperty("--route-len", String(len));
      core.style.setProperty("--route-len", String(len));
    });

    content.appendChild(routesSvg);

    if (!hasDrawn) {
      hasDrawn = true;
      station.dataset.routeDraw = "1";
      window.clearTimeout(drawTimer);
      drawTimer = window.setTimeout(() => station.removeAttribute("data-route-draw"), 3000);
    }
  };

  const scheduleRebuild = (delay = 60) => {
    window.clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(() => requestAnimationFrame(buildRoutes), delay);
  };

  const onResize = () => {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => scheduleRebuild(140));
  };

  window.addEventListener("resize", onResize);
  if (content && "ResizeObserver" in window) new ResizeObserver(onResize).observe(content);
  document.fonts?.ready?.then(() => scheduleRebuild(180));
  scheduleRebuild(120);
  scheduleRebuild(1100); // after the stat-card entry animation settles
  scheduleRebuild(2200); // final pass once layout, fonts and shimmer are fully stable

  const setActive = (section) => {
    if (!section) return;
    const route = routeAliases[section] || section;
    activeRoute = route;
    host.dataset.activeRoute = route;
    if (station) {
      station.dataset.activeRoute = route;
      routesSvg?.querySelectorAll("g[data-route]").forEach((group) => {
        group.classList.toggle("is-active", group.dataset.route === route);
      });
    }
    window.clearTimeout(host._routeTimer);
    host._routeTimer = window.setTimeout(() => {
      if (host.dataset.activeRoute === route) {
        host.removeAttribute("data-active-route");
        station?.removeAttribute("data-active-route");
      }
    }, 1200);
  };

  const setRunning = (next) => {
    desiredRunning = Boolean(next);
    running = desiredRunning && !isLowPower() && !document.hidden;
  };

  const onRoutePulse = (event) => setActive(event.detail?.section);
  const onMotionChange = () => setRunning(desiredRunning);
  const onVisibilityChange = () => setRunning(desiredRunning);
  const onStationChange = (event) => {
    if (event.detail?.station === "dashboard") scheduleRebuild(800);
  };
  document.addEventListener("sicis:routepulse", onRoutePulse);
  document.addEventListener("sicis:motionchange", onMotionChange);
  document.addEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("sicis:stationchange", onStationChange);

  if (svg && !isLowPower()) {
    let targetRx = 0, targetRy = 0, currentRx = 0, currentRy = 0;
    const animate = () => {
      if (!running) return;
      currentRx += (targetRx - currentRx) * 0.06;
      currentRy += (targetRy - currentRy) * 0.06;
      svg.style.transform = `perspective(600px) translateY(-50%) rotateX(${currentRx}deg) rotateY(${currentRy}deg)`;
      requestAnimationFrame(animate);
    };
    host.addEventListener("pointermove", (event) => {
      if (!running) return;
      const rect = host.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) - 0.5;
      const y = ((event.clientY - rect.top) / rect.height) - 0.5;
      targetRy = x * 6;
      targetRx = -y * 4;
    });
    host.addEventListener("pointerleave", () => { targetRx = 0; targetRy = 0; });
    const startLoop = () => { if (running) requestAnimationFrame(animate); };
    document.addEventListener("sicis:routepulse", startLoop);
  }

  metricCards.forEach((card) => {
    const route = card.dataset.flowRoute || card.dataset.cardSeccion;
    card.addEventListener("mouseenter", () => setActive(route));
    card.addEventListener("focus", () => setActive(route));
    card.addEventListener("click", () => setActive(route));
  });

  return {
    setActive,
    setRunning,
    refresh: () => scheduleRebuild(0),
    dispose: () => {
      document.removeEventListener("sicis:routepulse", onRoutePulse);
      document.removeEventListener("sicis:motionchange", onMotionChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("sicis:stationchange", onStationChange);
      window.removeEventListener("resize", onResize);
      window.clearTimeout(rebuildTimer);
      window.clearTimeout(drawTimer);
      routesSvg?.remove();
      routesSvg = null;
    },
  };
}
