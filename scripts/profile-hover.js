/* Paste into the installed app's WebView inspector, or use ?view=dock&profile=1 in Vite.
   Inactive until measure() is called. No telemetry and no persistent configuration changes. */
(() => {
  if (window.pierPerformance) return;
  let stopCurrent;
  const percentile = (values, fraction) => values.length ? values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)] : null;
  window.pierPerformance = {
    cancel() { stopCurrent?.(true); },
    measure({ durationMs = 5000, sweep = false, label = "" } = {}) {
      if (stopCurrent) return Promise.reject(new Error("A measurement is already running."));
      if (!Number.isFinite(durationMs) || durationMs < 500 || durationMs > 30000) {
        return Promise.reject(new Error("durationMs must be between 500 and 30000."));
      }
      const bar = document.querySelector(".dock-bar");
      if (!bar) return Promise.reject(new Error("Open the dock view first."));
      const root = document.documentElement;
      const position = document.querySelector(".dock-root")?.dataset.pos;
      const bounds = bar.getBoundingClientRect();
      const vertical = position === "left" || position === "right";
      const context = {
        userAgent: navigator.userAgent, devicePixelRatio, position,
        viewport: [innerWidth, innerHeight], material: root.dataset.material,
        reducedEffects: root.dataset.reducedEffects === "true",
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        icons: bar.querySelectorAll(".magnify").length,
        widgets: bar.querySelectorAll(".widget-slot").length,
      };
      return new Promise((resolve) => {
        const started = performance.now();
        const intervals = [];
        let last, frame, timer, hovered;
        let iconGeometryReads = 0, nativeBoundsCalls = 0;
        let hiddenDuringRun = document.hidden;
        let longTasks = null, longTaskMs = null;
        const visibility = () => { hiddenDuringRun ||= document.hidden; };
        document.addEventListener("visibilitychange", visibility);
        const originalRect = Element.prototype.getBoundingClientRect;
        function measuredRect(...args) {
          if (this.classList.contains("magnify")) iconGeometryReads++;
          return originalRect.apply(this, args);
        }
        Element.prototype.getBoundingClientRect = measuredRect;
        const internals = window.__TAURI_INTERNALS__;
        const originalInvoke = internals?.invoke;
        function measuredInvoke(command, ...args) {
          if (command === "set_hit_rect") nativeBoundsCalls++;
          return originalInvoke.call(this, command, ...args);
        }
        if (originalInvoke) internals.invoke = measuredInvoke;
        let observer;
        if (window.PerformanceObserver?.supportedEntryTypes?.includes("longtask")) {
          longTasks = 0;
          longTaskMs = 0;
          observer = new PerformanceObserver((list) => {
            for (const task of list.getEntries()) { longTasks++; longTaskMs += task.duration; }
          });
          observer.observe({ type: "longtask", buffered: false });
        }
        const stop = (cancelled = false) => {
          clearTimeout(timer);
          cancelAnimationFrame(frame);
          observer?.disconnect();
          document.removeEventListener("visibilitychange", visibility);
          if (Element.prototype.getBoundingClientRect === measuredRect) Element.prototype.getBoundingClientRect = originalRect;
          if (originalInvoke && internals.invoke === measuredInvoke) internals.invoke = originalInvoke;
          stopCurrent = undefined;
          if (sweep) {
            hovered?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
            bar.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
          }
          const sorted = [...intervals].sort((a, b) => a - b);
          const result = {
            label, sweep, cancelled, hiddenDuringRun, ...context,
            elapsedMs: performance.now() - started, frames: intervals.length,
            frameIntervalMs: { p50: percentile(sorted, .5), p95: percentile(sorted, .95), max: sorted.at(-1) ?? null },
            framesOver16_7Ms: intervals.filter((dt) => dt > 16.7).length,
            framesOver33_3Ms: intervals.filter((dt) => dt > 33.3).length,
            iconGeometryReads, nativeBoundsCalls: originalInvoke ? nativeBoundsCalls : null,
            longTasks, longTaskMs,
          };
          console.log("Pier hover measurement", result);
          resolve(result);
        };
        stopCurrent = stop;
        const tick = (now) => {
          if (last !== undefined) intervals.push(now - last);
          last = now;
          if (sweep) {
            // Repeat one there-and-back pass every two seconds across the same initial bounds.
            const phase = ((now - started) % 2000) / 1000;
            const fraction = .1 + .8 * (phase <= 1 ? phase : 2 - phase);
            const x = vertical ? bounds.left + bounds.width / 2 : bounds.left + bounds.width * fraction;
            const y = vertical ? bounds.top + bounds.height * fraction : bounds.top + bounds.height / 2;
            const target = document.elementFromPoint(x, y) ?? bar;
            if (target !== hovered) {
              hovered?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: target, clientX: x, clientY: y }));
              target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: hovered ?? document.body, clientX: x, clientY: y }));
              hovered = target;
            }
            target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: x, clientY: y }));
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        timer = setTimeout(() => stop(), durationMs);
      });
    },
  };
})();
