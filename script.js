"use strict";

// Enhancement only: content and links remain usable without JavaScript.
document.documentElement.classList.add("js");
const themeToggle = document.getElementById("themeToggle");
if (themeToggle) {
  let themeTransitionTimer;
  const updateThemeLabel = () => {
    const light = document.documentElement.dataset.theme === "light";
    themeToggle.setAttribute("aria-label", light ? "Use dark theme" : "Use light theme");
    themeToggle.firstElementChild.textContent = light ? "☾" : "☀";
  };
  themeToggle.hidden = false;
  updateThemeLabel();
  themeToggle.addEventListener("click", () => {
    document.body.classList.add("theme-transition");
    clearTimeout(themeTransitionTimer);
    themeTransitionTimer = setTimeout(() => document.body.classList.remove("theme-transition"), 350);
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
  let paused = true;
  try { paused = localStorage.getItem("samuel-alert-effects") !== "running"; } catch (_) {}
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

// Portfolio content stays still; motion is reserved for direct interactions.

// A native modal keeps keyboard focus inside quick jump and restores it on close.
(function () {
  const palette = document.getElementById("commandPalette");
  const toggle = document.getElementById("commandToggle");
  if (!palette || !toggle || typeof palette.showModal !== "function") return;
  const search = document.getElementById("commandSearch");
  const commands = Array.from(document.getElementById("commandResults").querySelectorAll("button"));
  let previousFocus;
  let pendingAction;
  const visibleCommands = () => commands.filter(command => !command.parentElement.hidden);
  function filter() {
    const query = search.value.trim().toLocaleLowerCase();
    commands.forEach(command => {
      const text = (command.textContent + " " + command.dataset.keywords).toLocaleLowerCase();
      command.parentElement.hidden = !text.includes(query);
    });
    const count = visibleCommands().length;
    document.getElementById("commandEmpty").hidden = count > 0;
    document.getElementById("commandStatus").textContent = count + (count === 1 ? " action available." : " actions available.");
  }
  function open() {
    if (palette.open || document.getElementById("responseLab")?.open) return;
    previousFocus = document.activeElement;
    if (navLinks?.classList.contains("open")) {
      burger.click();
      previousFocus = burger;
    }
    document.getElementById("commandThemeLabel").textContent = document.documentElement.dataset.theme === "light" ? "Switch to dark theme" : "Switch to light theme";
    search.value = "";
    filter();
    palette.showModal();
    document.body.classList.add("command-open");
    search.focus();
  }
  function run(command) {
    const action = command.dataset.command;
    if (action === "resume") {
      // Keep the new tab tied directly to the user's activation.
      window.open("content/SRegelbruggeResume.pdf", "_blank", "noopener");
    } else {
      pendingAction = () => {
        if (action === "theme") themeToggle.click();
        else if (action === "lab") document.getElementById("incidentAction").click();
        else {
          const target = document.getElementById(action);
          if (!target) return;
          target.setAttribute("tabindex", "-1");
          target.focus({ preventScroll: true });
          target.scrollIntoView({ block: "start" });
        }
      };
    }
    palette.close();
  }
  toggle.hidden = false;
  toggle.addEventListener("click", open);
  document.getElementById("commandClose").addEventListener("click", () => palette.close());
  palette.addEventListener("close", () => {
    document.body.classList.remove("command-open");
    (previousFocus || toggle).focus({ preventScroll: true });
    const action = pendingAction;
    pendingAction = undefined;
    if (action) action();
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "/" || event.altKey || event.ctrlKey || event.metaKey || event.repeat || event.isComposing) return;
    if (event.target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
    if (palette.open || document.getElementById("responseLab")?.open) return;
    event.preventDefault();
    open();
  });
  search.addEventListener("input", filter);
  search.addEventListener("keydown", event => {
    if (event.isComposing) return;
    const options = visibleCommands();
    if (!options.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      options[event.key === "ArrowDown" ? 0 : options.length - 1].focus();
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(options[0]);
    }
  });
  commands.forEach(command => {
    command.addEventListener("click", () => run(command));
    command.addEventListener("keydown", event => {
      const options = visibleCommands();
      const index = options.indexOf(command);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        options[(index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length].focus();
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        options[event.key === "Home" ? 0 : options.length - 1].focus();
      }
    });
  });
})();
