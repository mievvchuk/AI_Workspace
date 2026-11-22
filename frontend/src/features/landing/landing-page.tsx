import { useLayoutEffect, useRef, useState } from "react";
import html from "./landing.html?raw";

/**
 * The public landing page, Hallmark's Coral theme (design-variants/04-coral). Its stylesheet
 * (public/landing/coral/page.css, which imports its own tokens and base) loads only while this
 * page is mounted, so it never touches the app's screens. The page is light only. Links out of
 * it are plain anchors: leaving it is a full page load.
 *
 * Motion: the effect below arms elements with data-m and adds .is-in as they enter the view.
 * Without script nothing is armed and the page is fully visible; under reduced motion the CSS
 * shows every end state at once.
 */
const CSS = "/landing/coral/page.css";

function armMotion(root: HTMLElement): () => void {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cleanups: Array<() => void> = [];
  const arm = (el: Element | null, kind = "") => {
    if (!el) return null;
    el.setAttribute("data-m", kind);
    return el as HTMLElement;
  };
  const index = (els: Iterable<Element>, start = 0) => {
    let i = start;
    for (const el of els) (el as HTMLElement).style.setProperty("--i", String(i++));
  };

  // hero: in on the next frame
  const hero = arm(root.querySelector(".hero"));
  if (hero) {
    index(hero.querySelectorAll(".hero__text > *"));
    requestAnimationFrame(() => requestAnimationFrame(() => hero.classList.add("is-in")));
  }

  // one-shot entrances
  const once = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("is-in");
        once.unobserve(e.target);
        if (e.target.classList.contains("sheet")) countUp(e.target as HTMLElement);
      }
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.2 },
  );
  cleanups.push(() => once.disconnect());

  const rise = [
    ".map__head", ".pinned__panels > h2", ".sheet-sec__grid > div", ".faq h2", ".foot__word", ".board h2",
  ];
  for (const sel of rise) root.querySelectorAll(sel).forEach((el) => { arm(el, "rise"); once.observe(el); });
  const faqRows = root.querySelectorAll(".faq__rows details");
  index(faqRows);
  faqRows.forEach((el) => { arm(el, "rise"); once.observe(el); });

  const lanes = arm(root.querySelector(".lanes"));
  if (lanes) {
    lanes.querySelectorAll(".lane").forEach((lane, li) => index(lane.querySelectorAll(".node"), li * 2));
    once.observe(lanes);
  }

  const sheet = arm(root.querySelector(".sheet"));
  if (sheet) { index(sheet.querySelectorAll(".sheet__rows li")); once.observe(sheet); }

  const shot = arm(root.querySelector(".pinned__img"));
  if (shot) once.observe(shot);

  const board = arm(root.querySelector(".board"));
  if (board) once.observe(board);

  // pinned: light the panel that sits mid-screen
  const panelsBox = arm(root.querySelector(".pinned__panels"));
  if (panelsBox) {
    const panels = Array.from(panelsBox.querySelectorAll(".panel"));
    panels[0]?.classList.add("is-current");
    const mid = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          panels.forEach((p) => p.classList.toggle("is-current", p === e.target));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    panels.forEach((p) => mid.observe(p));
    cleanups.push(() => mid.disconnect());
  }

  // the journal's timings count up as each row is written
  function countUp(box: HTMLElement) {
    if (reduced) return;
    box.querySelectorAll<HTMLElement>(".sheet__rows .fig").forEach((fig, i) => {
      const end = parseFloat((fig.textContent || "0").replace(",", "."));
      if (!Number.isFinite(end) || end === 0) return;
      const delay = 300 + i * 650;
      const len = 650;
      fig.textContent = "0,0 с";
      let raf = 0;
      const t0 = performance.now() + delay;
      const tick = (now: number) => {
        const k = Math.min(1, Math.max(0, (now - t0) / len));
        fig.textContent = `${(end * (1 - Math.pow(1 - k, 3))).toFixed(1).replace(".", ",")} с`;
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      cleanups.push(() => cancelAnimationFrame(raf));
    });
  }

  // FAQ: answers open and close smoothly; a mouse click leaves no focus ring, the keyboard keeps it
  root.querySelectorAll<HTMLDetailsElement>(".faq details").forEach((d) => {
    const summary = d.querySelector("summary");
    const answer = d.querySelector<HTMLElement>("p");
    if (!summary || !answer) return;
    let anim: Animation | null = null;
    const ease = "cubic-bezier(0.16, 1, 0.3, 1)";
    const onPointer = () => summary.setAttribute("data-pointer", "");
    const onKey = () => summary.removeAttribute("data-pointer");
    const onClick = (e: MouseEvent) => {
      if (reduced) return;
      e.preventDefault();
      const from = d.offsetHeight;
      anim?.cancel();
      d.style.overflow = "hidden";
      const opening = !d.open;
      if (opening) d.open = true;
      // the other end: the full height when opening, the summary plus the rules when closing
      const to = opening ? d.offsetHeight : summary.offsetHeight + (d.offsetHeight - d.clientHeight);
      anim = d.animate({ height: [`${from}px`, `${to}px`] }, { duration: opening ? 520 : 420, easing: ease });
      answer.animate(
        opening ? { opacity: [0, 1], transform: ["translateY(-14px)", "none"] } : { opacity: [1, 0], transform: ["none", "translateY(-8px)"] },
        { duration: opening ? 520 : 260, easing: ease, fill: "both" },
      );
      anim.onfinish = () => {
        if (!opening) d.open = false;
        d.style.overflow = "";
        anim = null;
      };
    };
    summary.addEventListener("pointerdown", onPointer);
    summary.addEventListener("keydown", onKey);
    summary.addEventListener("click", onClick);
    cleanups.push(() => {
      summary.removeEventListener("pointerdown", onPointer);
      summary.removeEventListener("keydown", onKey);
      summary.removeEventListener("click", onClick);
    });
  });

  return () => cleanups.forEach((c) => c());
}

export function LandingPage() {
  const [ready, setReady] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const prevTheme = root.dataset.theme;
    root.dataset.theme = "light";
    root.classList.add("js");

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CSS;
    link.dataset.landing = "";
    link.onload = link.onerror = () => setReady(true);
    document.head.appendChild(link);

    return () => {
      link.remove();
      root.classList.remove("js");
      if (prevTheme) root.dataset.theme = prevTheme;
    };
  }, []);

  useLayoutEffect(() => {
    if (!ready || !ref.current) return;
    return armMotion(ref.current);
  }, [ready]);

  return <div ref={ref} style={ready ? undefined : { visibility: "hidden" }} dangerouslySetInnerHTML={{ __html: html }} />;
}
