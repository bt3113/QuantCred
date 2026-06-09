const STORAGE_KEY = "quantcredGovernance";

function readSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function writeSettings(value) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  globalThis.quantcredGovernance = value;
}

function addPanel() {
  const anchor = document.querySelector(".report-panel") || document.querySelector(".split-panel");
  if (!anchor || document.querySelector("#governancePanel")) return;
  const state = readSettings();
  globalThis.quantcredGovernance = state;
  const panel = document.createElement("section");
  panel.className = "panel report-panel";
  panel.id = "governancePanel";
  panel.innerHTML = `
    <div class="panel-title"><span>Governance controls</span><small>Factor attribution · trial ledger · validation gaps</small></div>
    <div class="report-grid">
      <label class="report-mini"><small>Folds</small><input id="qcFolds" type="number" min="2" max="20" value="${state.validationConfig?.folds || 5}"></label>
      <label class="report-mini"><small>Left gap days</small><input id="qcLeftGap" type="number" min="0" value="${state.validationConfig?.leftGapDays || 0}"></label>
      <label class="report-mini"><small>Right gap days</small><input id="qcRightGap" type="number" min="0" value="${state.validationConfig?.rightGapDays || 0}"></label>
    </div>
    <p class="muted">Factor attribution is automatic when the CSV contains a strategy return column plus factor columns such as mkt_rf, smb, hml, mom, quality, value, or size.</p>
    <label class="muted" style="display:block;margin-top:12px;">Trial ledger JSON</label>
    <textarea id="qcTrialLedger" rows="6" style="width:100%;box-sizing:border-box;background:#101615;color:#f6f8ef;border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:12px;">${JSON.stringify(state.trialLedger || [], null, 2)}</textarea>
    <label class="muted" style="display:block;margin-top:12px;">Manifest JSON</label>
    <textarea id="qcManifest" rows="5" style="width:100%;box-sizing:border-box;background:#101615;color:#f6f8ef;border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:12px;">${JSON.stringify(state.manifest || {}, null, 2)}</textarea>
    <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">
      <button id="qcSaveGovernance" class="pill-button pill-button--ghost" type="button">Save settings</button>
      <button id="qcClearGovernance" class="pill-button pill-button--ghost" type="button">Clear</button>
      <span id="qcGovernanceStatus" class="muted"></span>
    </div>`;
  anchor.parentNode.insertBefore(panel, anchor);

  document.querySelector("#qcSaveGovernance").addEventListener("click", () => {
    try {
      const next = {
        validationConfig: {
          folds: Number(document.querySelector("#qcFolds").value || 5),
          leftGapDays: Number(document.querySelector("#qcLeftGap").value || 0),
          rightGapDays: Number(document.querySelector("#qcRightGap").value || 0)
        },
        trialLedger: JSON.parse(document.querySelector("#qcTrialLedger").value || "[]"),
        manifest: JSON.parse(document.querySelector("#qcManifest").value || "{}")
      };
      writeSettings(next);
      document.querySelector("#qcGovernanceStatus").textContent = "Saved. Re-upload the CSV to apply.";
    } catch (error) {
      document.querySelector("#qcGovernanceStatus").textContent = `Invalid JSON: ${error.message}`;
    }
  });
  document.querySelector("#qcClearGovernance").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    globalThis.quantcredGovernance = {};
    document.querySelector("#qcTrialLedger").value = "[]";
    document.querySelector("#qcManifest").value = "{}";
    document.querySelector("#qcFolds").value = "5";
    document.querySelector("#qcLeftGap").value = "0";
    document.querySelector("#qcRightGap").value = "0";
    document.querySelector("#qcGovernanceStatus").textContent = "Cleared. Re-upload the CSV to apply.";
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addPanel);
else addPanel();
