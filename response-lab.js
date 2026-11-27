(function () {
  "use strict";
  const dialog = document.getElementById("responseLab");
  const opener = document.getElementById("incidentAction");
  if (!dialog || !opener || typeof dialog.showModal !== "function") return;

  const model = new ResponseLabModel.Investigation();
  const byId = id => document.getElementById(id);
  const caseButtons = {
    endpoint: byId("caseEndpoint"),
    identity: byId("caseIdentity"),
    mailbox: byId("caseMailbox")
  };
  const caseKeys = Object.keys(caseButtons);
  const tabs = [0, 1, 2].map(index => byId("labTab" + index));
  const steps = ["labStepAlert", "labStepEvidence", "labStepDecision", "labStepOutcome"].map(byId);
  let timers = [];
  let generation = 0;
  let collected = 0;
  let shareGeneration = 0;
  let sharePending = false;
  let returnFocus = opener;
  const share = byId("labShare");
  const shareStatus = byId("labShareStatus");

  function clearShareStatus() {
    shareGeneration++;
    sharePending = false;
    share.removeAttribute("aria-disabled");
    shareStatus.textContent = "";
    delete shareStatus.dataset.tone;
  }

  function stopPlayback() {
    generation++;
    timers.forEach(clearTimeout);
    timers = [];
  }
  function render() {
    const incident = model.case;
    const hasEvidence = ["evidence", "contained", "resolved"].includes(model.phase);
    const collecting = model.phase === "collecting";
    byId("labCaseId").textContent = incident.id + " / " + incident.source;
    byId("labCaseTitle").textContent = incident.title;
    byId("labCaseSummary").textContent = incident.summary;
    byId("labEntity").textContent = incident.entity;
    byId("labSource").textContent = incident.source;
    byId("labReviewed").textContent = model.reviewed.size + " / 3 views";
    const status = byId("labStatus");
    const labels = { collecting: "Collecting", evidence: "Investigating", contained: "Contained", resolved: "Resolved" };
    status.textContent = labels[model.phase] || incident.severity;
    status.dataset.tone = ["contained", "resolved"].includes(model.phase) ? "success" : model.phase === "alert" ? incident.tone : "neutral";
    for (const [key, button] of Object.entries(caseButtons)) {
      const selected = model.key === key;
      button.setAttribute("aria-pressed", String(selected));
      button.classList.toggle("selected", selected);
    }
    const stage = model.phase === "resolved" ? 3 : model.phase === "contained" || (model.phase === "evidence" && model.reviewed.size === 3) ? 2 : model.phase === "collecting" || model.phase === "evidence" ? 1 : 0;
    steps.forEach((step, index) => {
      if (index === stage) step.setAttribute("aria-current", "step");
      else step.removeAttribute("aria-current");
      step.classList.toggle("is-complete", index < stage);
    });
    byId("labCollect").disabled = model.phase !== "alert";
    byId("labCollect").textContent = collecting ? "Collecting…" : hasEvidence ? "Telemetry collected ✓" : "Collect telemetry ↓";
    byId("labCollection").hidden = !collecting;
    byId("labCollection").setAttribute("aria-busy", String(collecting));
    byId("labCollectProgress").value = collected;
    byId("labEmpty").hidden = model.phase !== "alert";
    byId("labEvidence").hidden = !hasEvidence;
    if (hasEvidence) {
      tabs.forEach((tab, index) => {
        tab.textContent = incident.evidence[index].label + (model.reviewed.has(index) ? " ✓" : "");
        tab.setAttribute("aria-selected", String(index === model.tab));
        tab.setAttribute("tabindex", index === model.tab ? "0" : "-1");
      });
      const evidence = incident.evidence[model.tab];
      byId("labEvidencePanel").setAttribute("aria-labelledby", "labTab" + model.tab);
      byId("labEvidenceKicker").textContent = evidence.kicker;
      byId("labEvidenceTitle").textContent = evidence.title;
      byId("labEvidenceData").textContent = evidence.data;
      byId("labEvidenceNote").textContent = evidence.note;
    }
    byId("labDecision").hidden = model.phase !== "evidence";
    byId("labDecisionHint").textContent = model.reviewed.size === 3 ? "You have reviewed the context. Choose the response the evidence supports." : "Review all three evidence views before choosing a response.";
    byId("labFeedback").hidden = !model.feedback;
    byId("labFeedback").textContent = model.feedback;
    byId("labFeedback").dataset.tone = model.feedbackTone;
    byId("labRecover").hidden = model.phase !== "contained";
    byId("labOutcome").hidden = model.phase !== "resolved";
    byId("labOutcomeTitle").textContent = incident.outcomeTitle;
    byId("labOutcomeText").textContent = incident.outcome;
    const debrief = byId("labDebrief");
    debrief.replaceChildren();
    if (model.phase === "resolved") {
      byId("labClosedLabel").textContent = incident.expected === "contain" ? "Incident closed" : "Alert closed / benign";
      byId("labClosedCase").textContent = incident.id + " / Evidence reviewed. Decision documented.";
      byId("labRationale").textContent = incident.rationale;
      incident.debrief.forEach(evidence => {
        const item = document.createElement("li");
        const label = document.createElement("strong");
        const finding = document.createElement("span");
        label.textContent = evidence.label;
        finding.textContent = evidence.finding;
        item.append(label, finding);
        debrief.append(item);
      });
    }
    const list = byId("labActivity");
    list.replaceChildren();
    model.events.forEach((message, index) => {
      const item = document.createElement("li");
      const number = document.createElement("span");
      number.textContent = String(index + 1).padStart(2, "0");
      item.append(number, document.createTextNode(message));
      list.append(item);
    });
  }
  function selectCase(key, focus = false) {
    stopPlayback();
    clearShareStatus();
    model.select(key);
    collected = 0;
    render();
    if (focus) byId("labCollect").focus();
  }
  function caseFromHash() {
    const hash = window.location?.hash || "";
    const key = hash.slice("#lab-".length);
    return hash.startsWith("#lab-") && Object.hasOwn(caseButtons, key) ? key : null;
  }
  function openLinkedCase() {
    const key = caseFromHash();
    if (!key) return;
    if (model.key !== key) selectCase(key);
    else render();
    if (!dialog.open) {
      const link = byId("lab-" + key);
      returnFocus = document.activeElement === link ? link : opener;
      dialog.showModal();
      document.body.classList.add("lab-open");
    }
  }
  function collect() {
    if (!model.collect()) return;
    stopPlayback();
    collected = 0;
    byId("labCollectStatus").textContent = "Collecting synthetic telemetry…";
    render();
    const currentGeneration = generation;
    const finish = () => {
      if (generation !== currentGeneration || !dialog.open) return;
      collected = 3;
      model.completeCollection();
      render();
      // The start control becomes disabled; move focus to the evidence.
      tabs[0].focus();
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }
    for (let index = 0; index < 3; index++) {
      timers.push(setTimeout(() => {
        if (generation !== currentGeneration || !dialog.open) return;
        collected = index + 1;
        byId("labCollectProgress").value = collected;
        byId("labCollectStatus").textContent = "Collected " + model.case.evidence[index].label.toLowerCase() + " context (" + collected + "/3)";
        if (collected === 3) finish();
      }, (index + 1) * 120));
    }
  }
  opener.hidden = false;
  opener.addEventListener("click", () => {
    returnFocus = opener;
    render();
    dialog.showModal();
    document.body.classList.add("lab-open");
  });
  window.addEventListener?.("hashchange", openLinkedCase);
  openLinkedCase();
  if (window.navigator?.clipboard?.writeText) {
    byId("labShareControls").hidden = false;
    share.addEventListener("click", async () => {
      if (sharePending) return;
      const request = ++shareGeneration;
      sharePending = true;
      share.setAttribute("aria-disabled", "true");
      delete shareStatus.dataset.tone;
      shareStatus.textContent = "Copying link…";
      const url = new URL(window.location.href);
      url.hash = "lab-" + model.key;
      try {
        await window.navigator.clipboard.writeText(url.href);
        if (request !== shareGeneration) return;
        shareStatus.textContent = "Link copied ✓";
        shareStatus.dataset.tone = "success";
      } catch (_) {
        if (request !== shareGeneration) return;
        shareStatus.textContent = "Could not copy. Use the case links on the page.";
      } finally {
        if (request === shareGeneration) {
          sharePending = false;
          share.removeAttribute("aria-disabled");
        }
      }
    });
  }
  byId("labClose").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    stopPlayback();
    model.cancelCollection();
    clearShareStatus();
    document.body.classList.remove("lab-open");
    render();
    if (caseFromHash()) window.history?.replaceState(null, "", window.location.pathname + window.location.search);
    returnFocus.focus();
  });
  for (const [key, button] of Object.entries(caseButtons)) {
    button.addEventListener("click", () => selectCase(key));
  }
  byId("labNext").addEventListener("click", () => {
    const nextIndex = (caseKeys.indexOf(model.key) + 1) % caseKeys.length;
    selectCase(caseKeys[nextIndex], true);
  });
  byId("labReset").addEventListener("click", () => selectCase(model.key, true));
  byId("labCollect").addEventListener("click", collect);
  tabs.forEach((tab, index) => {
    const activate = target => {
      model.review(target);
      render();
      tabs[target].focus();
    };
    tab.addEventListener("click", () => activate(index));
    tab.addEventListener("keydown", event => {
      const target = event.key === "ArrowRight" ? (index + 1) % 3 : event.key === "ArrowLeft" ? (index + 2) % 3 : event.key === "Home" ? 0 : event.key === "End" ? 2 : null;
      if (target !== null) { event.preventDefault(); activate(target); }
    });
  });
  for (const [id, action] of [["labContain", "contain"], ["labBenign", "benign"]]) {
    byId(id).addEventListener("click", () => {
      model.decide(action);
      render();
      if (model.phase === "evidence" && model.feedback) byId("labFeedback").focus();
      if (model.phase === "contained") byId("labRecover").focus();
      if (model.phase === "resolved") {
        byId("labOutcome").focus({ preventScroll: true });
        byId("labOutcome").scrollIntoView({ block: "start" });
      }
    });
  }
  byId("labRecover").addEventListener("click", () => {
    model.recover();
    render();
    byId("labOutcome").focus({ preventScroll: true });
    byId("labOutcome").scrollIntoView({ block: "start" });
  });
})();
