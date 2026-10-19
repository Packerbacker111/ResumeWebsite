"use strict";

const { app } = require("@azure/functions");
const { randomBytes } = require("node:crypto");
const { challengeResponse } = require("../../cookie-challenge-core.js");

// Generated on the server at startup. A fixed setting is optional for scored events.
const flag = process.env.COOKIE_CTF_FLAG || `COOKIE{${randomBytes(16).toString("hex")}}`;

app.http("cookieChallenge", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "cookie-challenge",
  handler: async request => challengeResponse(request.headers.get("cookie"), flag)
});
