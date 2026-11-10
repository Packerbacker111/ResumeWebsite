"use strict";
(() => {
  const buttons = [...document.querySelectorAll("[data-tour]")];
  const titles = ["Know what needs attention.", "Findings before secrets.", "A physical key. A deliberate action.", "Your vault, within reach."];
  const descriptions = [
    "The Windows health overview groups findings so you can choose what to review. Select Details to inspect a fictional entry without revealing its password.",
    "A credential’s context stays visible while its password stays masked. The example entry is fictional; the preview never accesses a real vault.",
    "YubiKey support works in RPM for Windows. The visual below is a concept illustration of the capability, not a capture of its authentication screen.",
    "Biometric unlock works in RPM for Android. This phone illustration describes the capability; it is not an Android app screenshot."
  ];
  let selected = 0;
  function show(index) {
    selected = index;
    buttons.forEach((button, i) => button.setAttribute("aria-pressed", String(index === i)));
    document.getElementById("tour-step-title").textContent = titles[index];
    document.getElementById("tour-step-copy").textContent = descriptions[index];
    document.getElementById("rpm-preview-window").hidden = index > 1;
    document.getElementById("unlock-concept").hidden = index < 2;
    if (index < 2) {
      selectRpmView(index);
    } else {
      const android = index === 3;
      document.getElementById("unlock-device").classList.toggle("phone", android);
      document.getElementById("unlock-title").textContent = android ? "Biometrics on Android" : "YubiKey on Windows";
      document.getElementById("unlock-symbol").textContent = android ? "◎" : "⌁";
      document.getElementById("unlock-description").textContent = android ? "A familiar biometric interaction for routine access." : "A physical interaction as part of unlocking your vault.";
      document.getElementById("unlock-benefit").textContent = android ? "Built for the device in your hand." : "A deliberate moment to unlock.";
      document.getElementById("unlock-detail").textContent = android ? "RPM supports biometric unlock on Android. This illustration does not invoke a biometric prompt, access your device, or unlock a vault." : "RPM supports YubiKey on Windows. This illustration introduces that capability; it does not request a key, access USB, or perform authentication.";
    }
    document.getElementById("tour-prev").disabled = index === 0;
    document.getElementById("tour-next").disabled = index === 3;
    document.getElementById("tour-next").textContent = index === 3 ? "Walkthrough complete" : `Next: ${["Health", "Details", "YubiKey", "Android"][index + 1]} →`;
    document.getElementById("tour-count").textContent = `${index + 1} / 4`;
  }
  buttons.forEach((button, index) => button.addEventListener("click", () => { show(index); button.focus(); }));
  ["healthTab", "credentialTab"].forEach((id, index) => document.getElementById(id).addEventListener("click", () => show(index)));
  document.getElementById("tour-prev").addEventListener("click", () => { show(Math.max(0, selected - 1)); buttons[selected].focus(); });
  document.getElementById("tour-next").addEventListener("click", () => { show(Math.min(3, selected + 1)); buttons[selected].focus(); });
  document.getElementById("tour-navigation").hidden = false;
})();
