import { useLayoutEffect } from "react";
import html from "./landing.html?raw";

/**
 * The public landing page. Its markup is the taste-skill system's (landing.html); the system's own
 * stylesheets and scripts (public/assets) load only while this page is mounted, so they never touch
 * the app's screens. The system expects header, main, footer and the phone action bar straight under
 * body, so the page's nodes are moved there and removed again on unmount. Links out of the page are
 * plain anchors: leaving it is a full page load.
 */
const CSS = [
  "/assets/system.css",
  "/assets/ui/cards.css",
  "/assets/motion/motion.css",
  "/assets/backgrounds/backgrounds.css",
  "/assets/layout/layout.css",
  "/assets/layout/demo.css",
  "/assets/icons/icon.css",
  "/assets/ui/base.css",
  "/assets/ui/window/fragment.css",
  "/assets/ui/chat/fragment.css",
  "/assets/ui/checklist/fragment.css",
  "/assets/ui/files/fragment.css",
  "/assets/ui/stat/fragment.css",
  "/assets/ui/code/fragment.css",
  "/landing/page.css",
];
const SCRIPTS = ["/assets/system.js", "/assets/motion/motion.js", "/assets/layout/layout.js"];
const HTML_ATTRS: Record<string, string> = { "data-type": "software", "data-radius": "soft", "data-ground": "sand", "data-buttons": "arrow", "data-motion": "" };

declare global {
  interface Window { __landingBooted?: boolean }
}

export function LandingPage() {
  useLayoutEffect(() => {
    // The kit's modules run once per page load; a second visit within the SPA reloads the page.
    if (window.__landingBooted) {
      window.location.reload();
      return;
    }
    const root = document.documentElement;
    const body = document.body;
    const mount = document.getElementById("root");
    const prevTheme = root.dataset.theme;
    for (const [k, v] of Object.entries(HTML_ATTRS)) root.setAttribute(k, v);
    root.dataset.theme = "light";
    root.classList.add("m-enter", "mo-js");
    body.style.visibility = "hidden";
    // The React root holds nothing the landing shows; it takes no room after the footer.
    if (mount) mount.style.display = "none";
    const t1 = setTimeout(() => root.classList.add("m-enter-done"), 700);
    const t2 = setTimeout(() => root.classList.add("mo-safe"), 2500);

    // header.nav, main, footer.closing and nav.actionbar become children of body, before #root.
    const tpl = document.createElement("template");
    tpl.innerHTML = html;
    const nodes = Array.from(tpl.content.children);
    for (const n of nodes) body.insertBefore(n, mount);

    const links = CSS.map((href) => {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      l.dataset.landing = "";
      document.head.appendChild(l);
      return new Promise<void>((res) => { l.onload = () => res(); l.onerror = () => res(); });
    });
    const grounds = document.createElement("script");
    grounds.src = "/assets/backgrounds/backgrounds.js";
    grounds.dataset.landing = "";
    document.head.appendChild(grounds);

    let alive = true;
    Promise.all(links).then(() => {
      if (!alive) return;
      body.style.visibility = "";
      if (window.__landingBooted) return;
      window.__landingBooted = true;
      for (const src of SCRIPTS) {
        const s = document.createElement("script");
        s.type = "module";
        s.src = src;
        body.appendChild(s);
      }
    });
    return () => {
      alive = false;
      clearTimeout(t1);
      clearTimeout(t2);
      for (const n of nodes) n.remove();
      document.querySelectorAll("[data-landing]").forEach((n) => n.remove());
      for (const k of Object.keys(HTML_ATTRS)) root.removeAttribute(k);
      root.classList.remove("m-enter", "m-enter-done", "mo-js", "mo-safe");
      body.style.visibility = "";
      if (mount) mount.style.display = "";
      if (prevTheme) root.dataset.theme = prevTheme;
    };
  }, []);

  return null;
}
