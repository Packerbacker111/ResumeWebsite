"use strict";

const cookieName = "show-flag";

function hasAccess(cookieHeader) {
  return String(cookieHeader || "").split(";").some(part => {
    const separator = part.indexOf("=");
    return separator > -1 && part.slice(0, separator).trim() === cookieName &&
      part.slice(separator + 1).trim().toLowerCase() === "true";
  });
}

function challengeResponse(cookieHeader, flag) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    "Vary": "Cookie",
    "X-Robots-Tag": "noindex"
  };
  if (!String(cookieHeader || "").split(";").some(part => part.trim().startsWith(`${cookieName}=`))) {
    headers["Set-Cookie"] = `${cookieName}=false; Path=/api/cookie-challenge; Secure; SameSite=Lax`;
  }
  if (!flag) return { status: 503, headers, jsonBody: { state: "unavailable" } };
  if (hasAccess(cookieHeader)) return { status: 200, headers, jsonBody: { state: "solved", flag } };
  return { status: 200, headers, jsonBody: { state: "denied" } };
}

module.exports = { challengeResponse, hasAccess };
