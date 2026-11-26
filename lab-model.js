/* Pure simulation model; it never queries or controls a real system. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ResponseLabModel = factory();
})(globalThis, function () {
  "use strict";
  const cases = {
    endpoint: {
      id: "DEMO-001", name: "Suspicious execution", severity: "Critical", tone: "critical",
      entity: "DEMO-WS-07", source: "Endpoint detection",
      title: "PowerShell from an Office process.",
      summary: "An Office process launched PowerShell and made an outbound connection. Is this routine automation or something worth containing?",
      expected: "contain",
      evidence: [
        { label: "Process", kicker: "Process lineage / synthetic capture", title: "An unusual parent-child relationship.", data: "09:41:03  WINWORD.EXE\n           └─ powershell.exe\n09:41:04      Script execution observed\n\nChange ticket: none matching this activity", note: "Start with the parent process, execution time, and any matching change record. What would you want to corroborate before responding?" },
        { label: "Network", kicker: "Connection context / synthetic capture", title: "The same process reached out.", data: "09:41:06  powershell.exe → 198.51.100.24:443\nDNS name: cdn.micr0soft-updates.example\nDirection: outbound TLS over TCP\nApproved services: no inventory match\n30-day baseline: no matching connection", note: "Compare the hostname and service inventory with the process timeline. What explains this connection? The hostname and IP address are fictional; no DNS lookup or connection is made." },
        { label: "Identity", kicker: "User context / synthetic capture", title: "What the user reported.", data: "Account: demo.avery\nSession: interactive, standard user\nApproved admin task: none\nUser verification: opened an unexpected document;\n                   did not initiate a script", note: "Compare the user's account of events with the process and network timestamps. Which details line up, and which remain unexplained?" }
      ],
      wrong: "A benign closure is not supported here. The unexpected Office-to-PowerShell chain, correlated outbound connection, and verified user report warrant containment. Revisit the evidence and try again.",
      contained: "The simulated endpoint is isolated, the suspicious session is revoked, and evidence is preserved. Containment limits impact; it does not by itself prove recovery.",
      outcomeTitle: "Contain the incident. Then close the loop.",
      debrief: [
        { label: "Process", finding: "An unexpected Office-to-PowerShell chain had no matching change record." },
        { label: "Network", finding: "The same process contacted a lookalike domain with no approved service or baseline match." },
        { label: "Identity", finding: "The user confirmed an unexpected document and did not initiate a script." }
      ],
      rationale: "Three correlated sources supported containment. Preserving evidence, confirming remediation, and validating recovery completed the response.",
      outcome: "In this scenario, remediation is confirmed with the system owner, recovery is validated, and monitoring shows no related activity. You connected three sources of evidence instead of acting on a red badge alone."
    },
    identity: {
      id: "DEMO-002", name: "Impossible travel", severity: "High", tone: "high",
      entity: "demo.avery", source: "Identity protection",
      title: "Paris → Chicago. Two minutes.",
      summary: "One account appears in Paris, France, then Chicago, USA—barely two minutes later. That's a little fast, even for a frequent flyer. What does the rest of the telemetry show?",
      expected: "benign",
      evidence: [
        { label: "Sign-ins", kicker: "Authentication events / synthetic capture", title: "An ocean apart. One account.", data: "10:12:02 UTC  Paris, France\n             Interactive sign-in\n10:14:09 UTC  Chicago, USA\n             Token refresh\n\nAccount: demo.avery\nChicago source: 203.0.113.18", note: "Two minutes and an ocean apart. Look beyond the map: how do the event types, device details, and network timing line up?" },
        { label: "Device", kicker: "Session evidence / synthetic capture", title: "One device across both locations.", data: "Both events: DEMO-LT-12\nDevice state: managed, compliant\nSession: same established device-bound session\nMFA: satisfied in the original sign-in\nAdditional suspicious activity: none observed", note: "Compare the device and session identifiers across both events. What changed—and what stayed the same?" },
        { label: "Context", kicker: "Network context / synthetic capture", title: "A change in the network path.", data: "VPN exit: Chicago, USA\n203.0.113.18: known corporate VPN exit\nVPN connection: confirmed at 10:14 UTC\nUser activity: confirmed via approved channel\nUnfamiliar sessions or follow-on activity: none", note: "Compare the VPN connection time with the Chicago event. Does the rest of the session evidence fit that sequence?" }
      ],
      wrong: "Containment would interrupt a validated session in this case. The matching device-bound session, verified user activity, and known VPN transition explain the signal. A VPN match alone would not be enough.",
      outcomeTitle: "Not every high-severity alert is an incident.",
      debrief: [
        { label: "Sign-ins", finding: "The Chicago event was a token refresh after the original Paris sign-in." },
        { label: "Device", finding: "Both events shared one managed device and the same established device-bound session." },
        { label: "Context", finding: "The verified corporate VPN transition matched the timing, with confirmed user activity and no suspicious follow-on activity." }
      ],
      rationale: "The combined session, device, and verified network context explained the alert. Documenting a benign closure avoided interrupting a validated user session.",
      outcome: "You documented the verified VPN transition and closed this alert as benign without disrupting the user. The lesson is correlation—not automatically trusting a VPN or an MFA result."
    },
    mailbox: {
      id: "DEMO-003", name: "Mailbox forwarding", severity: "High", tone: "high",
      entity: "demo.morgan", source: "Mail security",
      title: "A mailbox began forwarding externally.",
      summary: "A new rule forwards messages from a finance mailbox to an external address. Review who changed the rule, whether it was approved, and what left the mailbox.",
      expected: "contain",
      evidence: [
        { label: "Audit", kicker: "Mailbox audit / synthetic capture", title: "A new rule with an external destination.", data: "14:21 UTC  Forwarding rule created\nMailbox: demo.morgan\nDestination: archive@outside.example\nRule scope: invoices folder\nApproved routing change: none recorded", note: "Check the affected mailbox, the rule’s scope, and the documented changes. A rule can be active even if no mail has matched it yet." },
        { label: "Session", kicker: "Session context / synthetic capture", title: "An unfamiliar session made the change.", data: "Rule change session: DEMO-SESSION-39\nDevice: unfamiliar, unmanaged\nMailbox owner: denied creating the rule\nOwner’s usual session: managed workstation", note: "Compare the session that made the change with the owner’s activity. An unfamiliar device is a clue. Confirm the change with the owner through a trusted channel." },
        { label: "Mail trace", kicker: "Message delivery / synthetic capture", title: "Two messages reached the destination server.", data: "14:23 UTC  Message 8012 accepted externally\n14:30 UTC  Message 8021 accepted externally\n14:32 UTC  Message 8030 rejected by destination\nTrace window: rule creation through alert", note: "Separate accepted deliveries from rejected attempts. The trace shows where the messages went. It cannot show who read them." }
      ],
      wrong: "Benign closure would leave an unapproved forwarding rule active. The mailbox owner denied the change, and mail trace confirms that two messages were accepted externally.",
      contained: "You disabled the simulated forwarding rule, revoked the suspicious session, and preserved the audit and mail trace records. The two accepted deliveries still need an exposure review.",
      outcomeTitle: "External forwarding stopped. Exposure scoped.",
      debrief: [
        { label: "Audit", finding: "An unapproved rule targeted invoices in one mailbox." },
        { label: "Session", finding: "An unfamiliar session made the change, and the mailbox owner denied it." },
        { label: "Mail trace", finding: "The external server accepted two messages and rejected a third. The trace could not establish who opened them." }
      ],
      rationale: "Containment stopped new forwarding. The mail trace gave the mailbox owner and incident team a specific set of messages to review for exposure.",
      outcome: "You confirmed normal mail routing and no further forwarding. The incident team received the two confirmed external deliveries for review, with the rejected attempt recorded separately."
    }
  };

  class Investigation {
    constructor(key = "endpoint") { this.select(key); }
    select(key) {
      if (!Object.hasOwn(cases, key)) throw new Error("Unknown case");
      this.key = key;
      this.case = cases[key];
      this.phase = "alert";
      this.reviewed = new Set();
      this.tab = 0;
      this.feedback = "";
      this.feedbackTone = "hint";
      this.events = ["Opened " + this.case.id + ". Awaiting telemetry."];
    }
    reset() { this.select(this.key); }
    collect() {
      if (this.phase !== "alert") return false;
      this.phase = "collecting";
      this.events.push("Requested synthetic telemetry.");
      return true;
    }
    completeCollection() {
      if (this.phase !== "collecting") return false;
      this.phase = "evidence";
      this.events.push("Collected 3 evidence views.");
      this.review(0);
      return true;
    }
    cancelCollection() {
      if (this.phase !== "collecting") return false;
      this.phase = "alert";
      this.events.push("Collection paused when the lab closed.");
      return true;
    }
    review(index) {
      if (!["evidence", "contained", "resolved"].includes(this.phase) || !this.case.evidence[index]) return false;
      this.tab = index;
      if (!this.reviewed.has(index)) this.events.push("Reviewed " + this.case.evidence[index].label.toLowerCase() + " evidence.");
      this.reviewed.add(index);
      if (this.feedbackTone === "hint") this.feedback = "";
      return true;
    }
    decide(action) {
      if (this.phase !== "evidence" || !["contain", "benign"].includes(action)) return false;
      if (this.reviewed.size < 3) {
        this.feedback = "Review all three evidence views first. A single signal is not enough to justify the response.";
        this.feedbackTone = "hint";
        return false;
      }
      if (action !== this.case.expected) {
        this.feedback = this.case.wrong;
        this.feedbackTone = "caution";
        const event = "Reconsidered " + (action === "contain" ? "containment" : "benign closure") + " against the evidence.";
        if (this.events.at(-1) !== event) this.events.push(event);
        return false;
      }
      this.phase = action === "contain" ? "contained" : "resolved";
      this.feedback = action === "contain" ? this.case.contained : "";
      this.feedbackTone = "success";
      this.events.push(action === "contain" ? "Simulated containment applied; evidence preserved." : "Documented verified context. Closed as benign.");
      return true;
    }
    recover() {
      if (this.phase !== "contained") return false;
      this.phase = "resolved";
      this.feedback = "";
      this.events.push("Validated synthetic remediation and recovery. Case closed.");
      return true;
    }
  }
  return { cases, Investigation };
});
