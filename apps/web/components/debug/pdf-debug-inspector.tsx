"use client";

/**
 * Temporary diagnostic overlay for the PDF + field-overlay rendering path.
 *
 * Activates only when the URL contains `?debug=1`. On normal patient
 * sessions this component renders nothing and runs no listeners, so it
 * does not affect production traffic.
 *
 * The overlay walks the live DOM (no React state coupling) and reports:
 *   - which Vercel build is serving (so we never have to guess if the
 *     latest deploy actually landed in the browser),
 *   - viewport, DPR, user agent,
 *   - per-page wrap and canvas rects + the wrap-vs-canvas width drift,
 *   - per-field stored %-coords, expected pixel position, actual painted
 *     pixel position, and the drift in px.
 *
 * For a field overlay to be measurable, the rendering component must tag
 * its button with these attributes:
 *   data-field-overlay
 *   data-field-id     (any short id; truncated in the report)
 *   data-field-type   (SIGNATURE | TEXT | DATE | CHECKBOX | INITIAL)
 *   data-field-x  data-field-y  data-field-w  data-field-h   (stored %, 0..1)
 *
 * This file is dev tooling. Once we've used the data to ship the real
 * fix, delete this file and the import in patient-signing-client.tsx.
 */

import * as React from "react";

type FieldMeasurement = {
  id: string;
  type: string;
  storedX: number;
  storedY: number;
  storedW: number;
  storedH: number;
  paintedLeft: number;
  paintedTop: number;
  paintedWidth: number;
  paintedHeight: number;
  expectedLeft: number;
  expectedTop: number;
  expectedWidth: number;
  expectedHeight: number;
  driftLeft: number;
  driftTop: number;
  driftWidth: number;
  driftHeight: number;
};

type PageMeasurement = {
  index: number;
  wrapLeft: number;
  wrapTop: number;
  wrapWidth: number;
  wrapHeight: number;
  inlineWidth: string;
  canvasWidth: number;
  canvasHeight: number;
  canvasBufferW: number;
  canvasBufferH: number;
  widthDrift: number;
  fields: FieldMeasurement[];
};

type DebugSnapshot = {
  env: Record<string, string>;
  pages: PageMeasurement[];
};

function collect(): DebugSnapshot {
  const env: Record<string, string> = {
    sha:
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local-dev",
    branch: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF ?? "?",
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    dpr: String(window.devicePixelRatio),
    ua: navigator.userAgent,
    ts: new Date().toISOString().slice(11, 19),
  };

  const wraps = document.querySelectorAll<HTMLElement>("[data-pdf-page-wrap]");
  const pages: PageMeasurement[] = Array.from(wraps).map((wrap, idx) => {
    const wr = wrap.getBoundingClientRect();
    const canvas = wrap.querySelector<HTMLCanvasElement>("canvas");
    const cr = canvas?.getBoundingClientRect();
    const buttons = wrap.querySelectorAll<HTMLElement>("[data-field-overlay]");

    const fields: FieldMeasurement[] = Array.from(buttons).map((btn) => {
      const br = btn.getBoundingClientRect();
      const sx = parseFloat(btn.dataset.fieldX ?? "0");
      const sy = parseFloat(btn.dataset.fieldY ?? "0");
      const sw = parseFloat(btn.dataset.fieldW ?? "0");
      const sh = parseFloat(btn.dataset.fieldH ?? "0");
      // Expected = where the button SHOULD land if % coords are honored
      // exactly against the wrap rect. We compare to actual painted rect to
      // detect any drift introduced by CSS rules outside our control
      // (min-height, padding, transforms, scrollbars, etc.).
      const expectedLeft = wr.left + sx * wr.width;
      const expectedTop = wr.top + sy * wr.height;
      const expectedWidth = sw * wr.width;
      const expectedHeight = sh * wr.height;
      return {
        id: (btn.dataset.fieldId ?? "?").slice(0, 8),
        type: btn.dataset.fieldType ?? "?",
        storedX: sx,
        storedY: sy,
        storedW: sw,
        storedH: sh,
        paintedLeft: br.left,
        paintedTop: br.top,
        paintedWidth: br.width,
        paintedHeight: br.height,
        expectedLeft,
        expectedTop,
        expectedWidth,
        expectedHeight,
        driftLeft: br.left - expectedLeft,
        driftTop: br.top - expectedTop,
        driftWidth: br.width - expectedWidth,
        driftHeight: br.height - expectedHeight,
      };
    });

    return {
      index: idx + 1,
      wrapLeft: wr.left,
      wrapTop: wr.top,
      wrapWidth: wr.width,
      wrapHeight: wr.height,
      inlineWidth: wrap.style.width || "auto",
      canvasWidth: cr?.width ?? -1,
      canvasHeight: cr?.height ?? -1,
      canvasBufferW: canvas?.width ?? -1,
      canvasBufferH: canvas?.height ?? -1,
      widthDrift: cr ? wr.width - cr.width : NaN,
      fields,
    };
  });

  return { env, pages };
}

function f(n: number): string {
  if (Number.isNaN(n)) return "NaN";
  return n.toFixed(1);
}

function flag(n: number, threshold = 1): string {
  return Math.abs(n) > threshold ? "  << DRIFT" : "";
}

function format(snap: DebugSnapshot): string {
  const lines: string[] = [];
  lines.push("=== PDF DEBUG ===");
  lines.push(`build: ${snap.env.sha} (${snap.env.branch})  @ ${snap.env.ts}`);
  lines.push(`viewport: ${snap.env.viewport}  dpr: ${snap.env.dpr}`);
  const ua = snap.env.ua ?? "";
  lines.push(`ua: ${ua.length > 90 ? ua.slice(0, 90) + "..." : ua}`);
  lines.push("");

  if (snap.pages.length === 0) {
    lines.push("No [data-pdf-page-wrap] elements found yet.");
    return lines.join("\n");
  }

  snap.pages.forEach((p) => {
    lines.push(`page ${p.index}`);
    lines.push(
      `  wrap   : ${f(p.wrapWidth)} x ${f(p.wrapHeight)} px  inline.width=${p.inlineWidth}`
    );
    lines.push(
      `  canvas : ${f(p.canvasWidth)} x ${f(p.canvasHeight)} px  buffer=${p.canvasBufferW}x${p.canvasBufferH}`
    );
    lines.push(`  wrap-vs-canvas width drift: ${f(p.widthDrift)} px${flag(p.widthDrift, 0.5)}`);
    if (p.fields.length === 0) {
      lines.push("  (no fields rendered on this page yet)");
    }
    p.fields.forEach((fd) => {
      lines.push(`  field ${fd.id} (${fd.type})`);
      lines.push(
        `    stored %  : x=${fd.storedX.toFixed(3)} y=${fd.storedY.toFixed(3)} w=${fd.storedW.toFixed(3)} h=${fd.storedH.toFixed(3)}`
      );
      lines.push(
        `    expected  : L=${f(fd.expectedLeft)} T=${f(fd.expectedTop)} W=${f(fd.expectedWidth)} H=${f(fd.expectedHeight)}`
      );
      lines.push(
        `    painted   : L=${f(fd.paintedLeft)} T=${f(fd.paintedTop)} W=${f(fd.paintedWidth)} H=${f(fd.paintedHeight)}`
      );
      lines.push(
        `    drift     : dL=${f(fd.driftLeft)} dT=${f(fd.driftTop)} dW=${f(fd.driftWidth)} dH=${f(fd.driftHeight)}${flag(Math.max(Math.abs(fd.driftLeft), Math.abs(fd.driftTop), Math.abs(fd.driftWidth), Math.abs(fd.driftHeight)))}`
      );
    });
  });

  return lines.join("\n");
}

export function PdfDebugInspector(): React.ReactElement | null {
  const [enabled, setEnabled] = React.useState(false);
  const [text, setText] = React.useState("Measuring...");
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    setEnabled(
      new URLSearchParams(window.location.search).get("debug") === "1"
    );
  }, []);

  React.useEffect(() => {
    if (!enabled) {
      return;
    }
    let stopped = false;

    const refresh = (): void => {
      if (stopped) return;
      try {
        const snap = collect();
        setText(format(snap));
        // Structured dump so a Mac-tethered Safari Web Inspector can also
        // see the data without parsing the on-screen text.
        // eslint-disable-next-line no-console
        console.log("[PDF_DEBUG]", snap);
      } catch (err) {
        setText(`Inspector error: ${(err as Error).message}`);
      }
    };

    refresh();
    // Polling at 1s catches late-arriving canvas paints + post-load field
    // mounts without a heavy rAF loop. We auto-stop after 15s so the
    // overlay reflects a stable state in screenshots; reload the page to
    // resume measurement.
    const iv = window.setInterval(refresh, 1000);
    const stopAt = window.setTimeout(() => {
      stopped = true;
      window.clearInterval(iv);
    }, 15_000);
    const onResize = (): void => refresh();
    window.addEventListener("resize", onResize);

    return () => {
      stopped = true;
      window.clearInterval(iv);
      window.clearTimeout(stopAt);
      window.removeEventListener("resize", onResize);
    };
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  return (
    <div
      data-pdf-debug-overlay
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        maxHeight: collapsed ? 28 : "55vh",
        overflow: "auto",
        background: "rgba(0, 0, 0, 0.92)",
        color: "#0fdc6f",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 10,
        lineHeight: 1.35,
        padding: "4px 8px",
        zIndex: 99999,
        whiteSpace: "pre",
        boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: collapsed ? 0 : 4,
        }}
      >
        <strong>PDF DEBUG (?debug=1)</strong>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          style={{
            background: "transparent",
            color: "#0fdc6f",
            border: "1px solid #0fdc6f",
            padding: "0 6px",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 10,
          }}
        >
          {collapsed ? "show" : "hide"}
        </button>
      </div>
      {!collapsed ? text : null}
    </div>
  );
}
