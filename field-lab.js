"use strict";
(() => {
  const byId = id => document.getElementById(id);
  const replay = byId("replay-position");
  if (replay) {
    const signals = [
      { time: "09:14", stage: "Delivery", heading: "A document with a second job.", defender: "A billing-themed email delivers a document. Delivery alone does not establish compromise; correlate it with endpoint activity.", attacker: "The attacker sends a document disguised as an invoice, aiming to get the recipient to open it and enable active content.", judgment: "Next question: did anyone open it, and what process ran afterward?", source: "MAIL GATEWAY / MESSAGE RECORD", artifact: "09:14:02  recipient: analyst@example.test\nsubject: Updated invoice\nattachment: invoice-review.docm\ndelivery: inbox" },
      { time: "09:16", stage: "Execution", heading: "The process tree tells a story.", defender: "WINWORD.EXE launches PowerShell, which writes a script and contacts an unfamiliar host. That sequence is stronger evidence than an email subject.", attacker: "The document starts a script interpreter to retrieve a second stage. Office spawning PowerShell leaves a useful trail for defenders.", judgment: "Correlate the parent process, script content, and outbound connection before deciding scope.", source: "ENDPOINT / PROCESS + NETWORK", artifact: "09:16:11  host: workstation-07\nparent: WINWORD.EXE\nchild: powershell.exe\nfile: C:\\Users\\analyst\\AppData\\Local\\Temp\\review.ps1\ndestination: update.example.test:443" },
      { time: "09:18", stage: "Credential access", heading: "Access is a signal. Theft is a conclusion.", defender: "A new process requests access to LSASS memory. The timing is suspicious, but the event does not establish that usable credentials were extracted.", attacker: "The next objective is credential material that could enable access to another system. Memory access may be blocked or may fail to produce useful data.", judgment: "Check access results, process lineage, protection events, and subsequent authentication activity.", source: "ENDPOINT / MEMORY ACCESS", artifact: "09:18:43  host: workstation-07\nsource: review-helper.exe\ntarget: lsass.exe\nevent: process memory access\ncredential extraction: not established" },
      { time: "09:22", stage: "Lateral movement", heading: "One host becomes two.", defender: "A remote logon from workstation-07 is followed by service creation on fileserver-02. Correlate the account and service with approved administration, then scope both hosts.", attacker: "The attacker attempts to use an account to execute on a second host. A successful remote logon and service creation expand the visible footprint.", judgment: "Investigate both hosts and the account. Choose containment based on the correlated evidence and operational context.", source: "IDENTITY + SERVER / CORRELATED EVENTS", artifact: "09:22:06  destination: fileserver-02\nsource: workstation-07\naccount: EXAMPLE\\svc-reports\nevent: remote logon succeeded\n09:22:19  new service: ReviewUpdater\nchange approval: not found in this scenario" }
    ];
    let position = 0;
    let perspective = "defender";
    let timer = null;
    function stop() {
      clearInterval(timer);
      timer = null;
      byId("replay-play").textContent = "Play replay";
      byId("replay-play").setAttribute("aria-pressed", "false");
    }
    function render() {
      const signal = signals[position];
      replay.value = String(position);
      replay.setAttribute("aria-valuetext", `${signal.time}, ${signal.stage}`);
      byId("replay-time").textContent = `${signal.time} / ${signal.stage}`;
      byId("replay-heading").textContent = signal.heading;
      byId("replay-copy").textContent = signal[perspective];
      byId("replay-judgment").textContent = signal.judgment;
      byId("artifact-label").textContent = signal.source;
      byId("replay-artifact").textContent = signal.artifact;
      byId("replay-count").textContent = `${position + 1} / ${signals.length}`;
      byId("replay-prev").disabled = position === 0;
      byId("replay-next").disabled = position === signals.length - 1;
      document.querySelectorAll("[data-node]").forEach((node, index) => {
        node.toggleAttribute("data-seen", index <= position);
        if (index === position) node.setAttribute("aria-current", "step");
        else node.removeAttribute("aria-current");
      });
    }
    replay.addEventListener("input", () => { stop(); position = Number(replay.value); render(); });
    byId("replay-prev").addEventListener("click", () => { stop(); position = Math.max(0, position - 1); render(); });
    byId("replay-next").addEventListener("click", () => { stop(); position = Math.min(3, position + 1); render(); });
    byId("replay-play").addEventListener("click", () => {
      if (timer) { stop(); return; }
      if (position === signals.length - 1) position = 0;
      render();
      byId("replay-play").textContent = "Pause replay";
      byId("replay-play").setAttribute("aria-pressed", "true");
      timer = setInterval(() => { position++; render(); if (position === signals.length - 1) stop(); }, 5000);
    });
    document.querySelectorAll("[data-perspective]").forEach(button => button.addEventListener("click", () => {
      perspective = button.dataset.perspective;
      document.querySelectorAll("[data-perspective]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
      render();
    }));
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
    render();
  }
  if (byId("export-request")) {
    let fixed = false;
    let broken = false;
    let denied = false;
    let ownAllowed = false;
    function requestExport() {
      const raw = byId("export-id").value.trim();
      const id = Number(raw);
      const own = id === 2002;
      const exists = id === 2001 || own;
      const allowed = exists && (!fixed || own);
      if (!raw || !Number.isSafeInteger(id) || id < 1) {
        byId("export-response").textContent = "400 / Enter a positive whole-number export ID.";
        return;
      }
      byId("export-response").textContent = allowed ? `200 OK\nowner: account ${own ? "B" : "A"}\nrecord: ${own ? "Your demo export" : "Fictional private export"}\nrows: 3 (dummy data)` : "404 Not found\nNo export available to this account.";
      if (allowed && !own) broken = true;
      if (fixed && id === 2001) denied = true;
      if (fixed && own && allowed) ownAllowed = true;
      byId("export-progress").textContent = fixed
        ? denied && ownAllowed ? "Verified: cross-account access blocked; your own export still works." : "Retest 2001 and 2002 to verify the boundary and legitimate access."
        : broken ? "Gap found: account B retrieved account A’s export. Apply the fix, then retest both IDs." : "Your export works. What happens with export 2001?";
    }
    byId("export-request").addEventListener("click", requestExport);
    byId("export-fix").addEventListener("click", () => {
      fixed = !fixed; denied = false; ownAllowed = false;
      byId("export-fix").setAttribute("aria-pressed", String(fixed));
      byId("export-fix").textContent = fixed ? "Fix applied · restore vulnerable version" : "Apply authorization fix";
      requestExport();
    });
    let roleFixed = false;
    let escalationFound = false;
    function requestRole() {
      const claimed = byId("client-role").value;
      const allowed = !roleFixed && claimed === "admin";
      if (allowed) escalationFound = true;
      byId("role-response").textContent = allowed ? "200 OK\nAdmin report: fictional internal summary\nAuthority used: browser-supplied role" : `403 Forbidden\nAuthenticated account role: member\nAuthority used: ${roleFixed ? "server-side session" : "browser-supplied role"}`;
      byId("role-progress").textContent = roleFixed
        ? claimed === "admin" ? "Verified: claiming admin no longer grants access. The session remains a member." : "Select admin and retry to verify the forged role is rejected."
        : escalationFound ? "Gap found: a client value granted admin access. Apply the server-side check and retry." : "Try claiming admin in the browser-supplied role.";
    }
    byId("role-request").addEventListener("click", requestRole);
    byId("role-fix").addEventListener("click", () => {
      roleFixed = !roleFixed;
      byId("role-fix").setAttribute("aria-pressed", String(roleFixed));
      byId("role-fix").textContent = roleFixed ? "Fix applied · restore vulnerable version" : "Apply server-side role check";
      requestRole();
    });
  }
  if (byId("automation-run")) {
    let timer = null;
    let step = 0;
    let scenario = "review";
    const steps = [...document.querySelectorAll("[data-auto-step]")];
    const scenarios = {
      review: { context: "High user risk · unfamiliar sign-in · no approved travel context.", decision: "Route to analyst review", outcome: "Create a review task with the identity evidence attached. An analyst decides whether account protection is appropriate." },
      known: { context: "Low user risk · recognized device · approved travel context.", decision: "Route to routine validation", outcome: "Prepare a lower-priority validation task. Familiar context is evidence to assess, not automatic proof that an alert is benign." },
      missing: { context: "Identity source did not return device context.", decision: "Stop the automatic branch", outcome: "Flag incomplete evidence and route to manual review. Missing context never defaults to a benign disposition." }
    };
    function advance() {
      const current = scenarios[scenario];
      steps[step].toggleAttribute("data-complete", true);
      byId("automation-status").textContent = ["Signal received", scenario === "missing" ? "Identity context incomplete" : "Identity context gathered", current.decision, "Ready for a human decision"][step];
      byId("automation-copy").textContent = ["A fictional Entra risky-user alert starts the workflow.", current.context, "An illustrative rule evaluates the available context; this is not an employer playbook.", current.outcome][step];
      step++;
      if (step === steps.length) {
        clearInterval(timer); timer = null;
        byId("automation-run").disabled = false;
        byId("automation-scenario").disabled = false;
        byId("automation-run").textContent = "Run again ↻";
      }
    }
    byId("automation-run").addEventListener("click", () => {
      clearInterval(timer); step = 0;
      scenario = byId("automation-scenario").value;
      steps.forEach(item => item.removeAttribute("data-complete"));
      byId("automation-run").disabled = true;
      byId("automation-scenario").disabled = true;
      byId("automation-run").textContent = "Running…";
      advance(); timer = setInterval(advance, 1200);
    });
  }
})();
