"use strict";

// Enhancement only: content and links remain usable without JavaScript.
document.documentElement.classList.add("js");
const themeToggle = document.getElementById("themeToggle");
if (themeToggle) {
  const updateThemeLabel = () => {
    const light = document.documentElement.dataset.theme === "light";
    themeToggle.setAttribute("aria-label", light ? "Use dark theme" : "Use light theme");
    themeToggle.firstElementChild.textContent = light ? "☾" : "☀";
  };
  themeToggle.hidden = false;
  updateThemeLabel();
  themeToggle.addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("samuel-theme", theme); } catch (_) {}
    updateThemeLabel();
  });
}
const burger = document.getElementById("burger");
const navLinks = document.getElementById("navLinks");
if (burger && navLinks) {
  const closeNavigation = () => {
    navLinks.classList.remove("open");
    burger.setAttribute("aria-expanded", "false");
    burger.setAttribute("aria-label", "Open navigation");
  };
  burger.addEventListener("click", () => {
    const open = navLinks.classList.toggle("open");
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  });
  navLinks.querySelectorAll("a").forEach(link => link.addEventListener("click", closeNavigation));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && navLinks.classList.contains("open")) {
      closeNavigation();
      burger.focus();
    }
  });
  document.addEventListener("click", event => {
    if (!navLinks.contains(event.target) && !burger.contains(event.target)) closeNavigation();
  });
}
// Decorative motion stays optional, quiet off-screen, and independent of the lab.
const alertPanel = document.getElementById("incidentDemo");
const alertEffectsToggle = document.getElementById("alertEffectsToggle");
if (alertPanel && alertEffectsToggle && typeof window.matchMedia === "function") {
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let paused = false;
  try { paused = localStorage.getItem("samuel-alert-effects") === "paused"; } catch (_) {}
  let visible = typeof IntersectionObserver !== "function";
  const updateAlertEffects = () => {
    const reduced = motionPreference.matches;
    alertPanel.dataset.effects = !paused && !reduced && visible && !document.hidden ? "running" : "paused";
    alertEffectsToggle.hidden = reduced;
    alertEffectsToggle.textContent = paused ? "Resume effects" : "Pause effects";
    alertEffectsToggle.setAttribute("aria-label", paused ? "Resume critical alert effects" : "Pause critical alert effects");
  };
  alertEffectsToggle.addEventListener("click", () => {
    paused = !paused;
    try { localStorage.setItem("samuel-alert-effects", paused ? "paused" : "running"); } catch (_) {}
    updateAlertEffects();
  });
  motionPreference.addEventListener?.("change", updateAlertEffects);
  document.addEventListener("visibilitychange", updateAlertEffects);
  if (typeof IntersectionObserver === "function") {
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .1);
      updateAlertEffects();
    }, { threshold: .1 });
    observer.observe(alertPanel);
  }
  updateAlertEffects();
}
const year = document.getElementById("year");
if (year) year.textContent = new Date().getFullYear();
