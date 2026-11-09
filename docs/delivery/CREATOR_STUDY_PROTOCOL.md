# Creator Alpha study protocol

This optional facilitator's runbook describes one way to gather creator feedback. It is not required to fix issues or release the editor, and it is not a study result.

## Prepare

1. Recruit **5–8 novices and 5–8 experienced creators**. Before sessions, record the cohort definitions used and each participant's relevant experience; include keyboard/assistive-technology and trackpad users where possible. Arrange a return session for a subset, and record the interval. Do not count one person in both cohorts or substitute the study facilitator for a participant.
2. Obtain informed consent for observation and separately for any recording. Use participant codes in working notes; keep contact and consent records separately in an appropriately restricted location. Do not commit names, recordings, private projects, account details, or raw identifying notes to the repository.
3. Pin the candidate commit, dependency-lock hash, browser/version, OS, device, viewport, input method and session date. Use a fresh, isolated browser profile for each participant, a local copy of the same candidate, and the built-in **Copper Lantern** starter. Check that native download and the experimental Java export are available. Never use a participant's existing browser profile or game worlds for fault injection.
4. Prepare a timer, the event log below, and a safe isolated failure scenario. Confirm the recovery procedure on the same candidate before involving participants. Explain that the product is being tested, participants may stop, and assistance will be recorded. Avoid teaching controls or moving the pointer for them during the unassisted attempt.

## First session: standard task

Read the same prompt to each participant:

> Starting with the Copper Lantern sample, make the body a little wider, add an opaque painted mark, correct an intentional mistake with undo, inspect the result, save a native project and reopen it, then export the Minecraft resource-pack ZIP. Work as you normally would and say when you believe you are finished.

Start the timer when the starter is visible and the prompt ends. A **first meaningful edit** is the first committed change to the project content, not navigation, selection, camera movement, or opening a panel. Record its time or mark it missing. Stop the workflow timer when the participant has completed the listed actions, including reopening the saved native file and initiating the ZIP download, or at ten minutes. Record whether the downloaded files actually exist; a download-start message alone is not durable-storage proof.

Log wrong turns, time, the exact help offered, interruptions, whether the task was completed, and any unresolved discrepancy after reopen. Mark an attempt **unassisted** only if no one provided task guidance or operated the interface. If assistance is needed, preserve the unassisted outcome and record the later assisted outcome separately. Observe first; ask afterward what the participant expected, what the export means, and where they would find their work again.

## Recovery scenario

Use only a disposable browser profile and sample project. First wait for an acknowledged local save and download a separate native backup. In the isolated tab, the facilitator can simulate a checkpoint quota failure using the same IndexedDB failure approach covered by the editor's automated test:

```js
const originalStudyPut = IDBObjectStore.prototype.put;
IDBObjectStore.prototype.put = function (...args) {
  if (this.name === "checkpoints") {
    throw new DOMException("Study: simulated quota exhausted", "QuotaExceededError");
  }
  return originalStudyPut.apply(this, args);
};
window.restoreStudyStorage = () => { IDBObjectStore.prototype.put = originalStudyPut; };
```

Ask the participant to make one small additional edit and, when the application reports a save problem, explain or demonstrate how they would protect the work. Do not suggest the download route during the unassisted observation. Record the status they noticed, their chosen route, assistance, and whether a native backup was actually downloaded. The facilitator then runs `window.restoreStudyStorage()` in the same tab and verifies a recovered copy by reopening it in the disposable profile. If the injection does not produce the expected failure, mark the scenario **invalid**, restore the original function or close the tab, and do not count a success. Do not intentionally delete a real checkpoint or participant data.

## Return session and recording

For each return participant, record the actual date and interval, give them their own previously saved sample, and ask them to reopen it, make a small new edit, save, and explain how they would recover it on another machine. Record completion, help and any changed understanding separately from the first-session timed workflow.

Use one coded row per participant and session; retain the detailed timeline privately when it could identify someone:

| Field | Record |
| --- | --- |
| Participant code / cohort / session / date | |
| Consent and recording consent confirmed | |
| Candidate commit / browser / OS / device / input | |
| First committed edit in seconds; within 60 s | |
| Full first-session workflow time; within 10 min; unassisted | |
| Wrong turns, help and observed blockers | |
| Recovery injection valid; route found unaided; backup reopened | |
| Return-session interval, outcome and feedback | |
| Findings, severity, fix/retest link and remaining limitation | |

## Aggregate and decide

Report exact numerator/denominator separately for novices and experienced creators, including missing, coached, invalid and incomplete attempts. For the proposed 80% thresholds, the minimum successful counts are **4/5, 5/6, 6/7, and 7/8**; do not round a failing count up. Assess first meaningful edit within 60 seconds and uncoached completion within ten minutes. Report the recovery route for every participant, including those who needed help. Describe repeat-session results and novice/expert feedback separately; the small cohort does not support population-wide claims.

Triage observed defects using the [severity guidance](QUALITY_GATES.md), link fixes, and retest repeated blockers. Keep any shared results anonymized and describe what was actually observed.
