"use strict";
const rpmTabs = [document.getElementById("healthTab"), document.getElementById("credentialTab")];
const rpmPanels = [document.getElementById("healthPanel"), document.getElementById("credentialPanel")];
const rpmMobile = window.matchMedia("(max-width: 700px)");
function setRpmOrientation() {
  document.getElementById("rpmViews").setAttribute("aria-orientation", rpmMobile.matches ? "horizontal" : "vertical");
}
setRpmOrientation();
rpmMobile.addEventListener("change", setRpmOrientation);
function selectRpmView(index) {
  rpmTabs.forEach((tab, position) => {
    tab.setAttribute("aria-selected", String(position === index));
    tab.tabIndex = position === index ? 0 : -1;
    rpmPanels[position].hidden = position !== index;
  });
  rpmTabs[index].focus();
}
rpmTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectRpmView(index));
  tab.addEventListener("keydown", event => {
    const next = event.key === "ArrowDown" || event.key === "ArrowRight" ? (index + 1) % rpmTabs.length : event.key === "ArrowUp" || event.key === "ArrowLeft" ? (index - 1 + rpmTabs.length) % rpmTabs.length : event.key === "Home" ? 0 : event.key === "End" ? rpmTabs.length - 1 : null;
    if (next !== null) { event.preventDefault(); selectRpmView(next); }
  });
});
