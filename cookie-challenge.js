"use strict";

const status = document.getElementById("challengeStatus");
const flag = document.getElementById("challengeFlag");
const retry = document.getElementById("challengeRetry");

async function checkChallenge() {
  retry.disabled = true;
  status.textContent = "Checking the server…";
  flag.hidden = true;
  try {
    const response = await fetch("/api/cookie-challenge", { credentials: "same-origin", cache: "no-store" });
    const result = await response.json();
    if (response.ok && result.state === "solved" && typeof result.flag === "string") {
      status.textContent = "Access granted. You changed what the server trusted.";
      flag.textContent = result.flag;
      flag.hidden = false;
    } else if (response.ok && result.state === "denied") {
      status.textContent = "Access denied. The server has not seen the right cookie yet.";
    } else {
      status.textContent = "The challenge is temporarily unavailable. Please try later.";
    }
  } catch {
    status.textContent = "Could not reach the challenge server. Please try later.";
  } finally {
    retry.disabled = false;
  }
}

retry.addEventListener("click", checkChallenge);
checkChallenge();
