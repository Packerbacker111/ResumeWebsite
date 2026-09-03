"use strict";
// Resolve a saved theme before painting; blocked storage is harmless.
try {
  const preference = localStorage.getItem("samuel-theme");
  const legacy = localStorage.getItem("samuel-dark");
  if (preference === "light" || (!preference && legacy === "false")) {
    document.documentElement.dataset.theme = "light";
  }
} catch (_) {}
