"use strict";
(() => {
  const byId = id => document.getElementById(id);
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
