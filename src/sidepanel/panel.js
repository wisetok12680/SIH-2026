/**
 * Agent Sidepanel Control Center
 * All event binding uses addEventListener (Chrome Extension CSP blocks inline onclick).
 */

// ─── UTILITY FUNCTIONS ───
function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function addLogEntry(type, text, timestamp) {
  const logContainer = document.getElementById('logContainer');
  if (!logContainer) return;
  const timeStr = timestamp || new Date().toLocaleTimeString();
  let colorClass = 'log-info';
  if (type === 'ERROR') colorClass = 'log-error';
  else if (type === 'WARN') colorClass = 'log-warn';
  else if (type === 'SUCCESS' || type === 'FINISHED') colorClass = 'log-success';

  const entry = document.createElement('div');
  entry.className = `log-entry ${colorClass}`;
  entry.innerHTML = `<span class="log-time">[${timeStr}]</span> ${escapeHtml(text)}`;
  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

function updateStatusBadge(status, isRunning) {
  const statusBadge = document.getElementById('agentStatusBadge');
  if (!statusBadge) return;
  statusBadge.innerText = status;
  statusBadge.className = isRunning ? 'status-badge active' : 'status-badge';
}

function updateRoutingBadge(mode) {
  const routingBadge = document.getElementById('routingBadge');
  if (!routingBadge) return;
  routingBadge.innerText = (mode || 'LOCAL AGENT').replace('_', ' ');
  routingBadge.className = (mode === 'LOCAL_AGENT') ? 'route-badge local' : 'route-badge cloud';
}

function resetUiState() {
  const startBtn = document.getElementById('startAgentBtn');
  const stopBtn = document.getElementById('stopAgentBtn');
  if (startBtn) startBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = true;
  updateStatusBadge('IDLE', false);
}

function renderAxTree(nodes) {
  const axTreeView = document.getElementById('axTreeView');
  if (!axTreeView) return;
  if (!nodes || nodes.length === 0) {
    axTreeView.innerHTML = '<div class="empty-state">No accessibility nodes captured.</div>';
    return;
  }
  axTreeView.innerHTML = nodes.slice(0, 40).map((n) => `
    <div class="ax-node">
      <span class="ref-tag">${n.ref || '@e'}</span>
      <span class="node-role">[${n.role || 'element'}]</span>
      <span class="node-name">${escapeHtml(n.name || n.value || '')}</span>
    </div>
  `).join('');
}

function triggerReasoningBuffer(payload) {
  const bufferCard = document.getElementById('reasoningBufferCard');
  const respCard = document.getElementById('agentResponseCard');
  const respBody = document.getElementById('agentResponseBody');
  const respBadge = document.getElementById('responseBadge');
  const countdownTag = document.getElementById('bufferCountdownTag');
  const progressBar = document.getElementById('progressBarFill');
  const substepText = document.getElementById('bufferSubstepText');

  if (!bufferCard || !respCard) return;

  respCard.style.display = 'none';
  bufferCard.style.display = 'block';

  let totalDurationSec = 20;
  let elapsed = 0;

  function updateBufferProgress(elapsed, totalSec) {
    const remaining = totalSec - elapsed;
    if (countdownTag) countdownTag.innerText = `${remaining}s Remaining`;
    if (progressBar) progressBar.style.width = `${(elapsed / totalSec) * 100}%`;
    if (substepText) {
      if (elapsed < 7) substepText.innerText = '[1/3] Parsing accessibility tree hardware metrics...';
      else if (elapsed < 14) substepText.innerText = '[2/3] Computing Price-to-VRAM ratios & FP32 TFLOPS...';
      else substepText.innerText = '[3/3] Generating final hardware recommendation...';
    }
  }

  updateBufferProgress(elapsed, totalDurationSec);

  const bufferInterval = setInterval(() => {
    elapsed += 1;
    updateBufferProgress(elapsed, totalDurationSec);

    if (elapsed >= totalDurationSec) {
      clearInterval(bufferInterval);
      bufferCard.style.display = 'none';
      if (respBody) {
        respBody.innerText = payload.value || payload.thought || 'Task completed successfully.';
      }
      if (respBadge && payload.route) {
        respBadge.innerText = payload.route.replace('_', ' ');
      }
      respCard.style.display = 'block';
    }
  }, 1000);
}


// ─── TAB SWITCHING ───
function switchTab(tabId) {
  console.log('[Agent Panel] switchTab:', tabId);
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
  });
  document.querySelectorAll('.tab-content').forEach((tc) => {
    tc.classList.toggle('active', tc.id === tabId);
  });
}

function switchSubtab(subtabId) {
  console.log('[Agent Panel] switchSubtab:', subtabId);
  document.querySelectorAll('.adv-subbtn').forEach((sb) => {
    sb.classList.toggle('active', sb.getAttribute('data-subtab') === subtabId);
  });
  document.querySelectorAll('.adv-subcontent').forEach((sc) => {
    sc.classList.toggle('active', sc.id === subtabId);
  });
  if (subtabId === 'subtab-config') loadCacheList();
  if (subtabId === 'subtab-priv') loadPrivScopeBindings();
  if (subtabId === 'subtab-llm') loadLlmPayload();
}


// ─── TASK EXECUTION ───
function startAgentTask() {
  console.log('[Agent Panel] >>> startAgentTask() FIRED');
  const taskPrompt = document.getElementById('taskPrompt');
  const startBtn = document.getElementById('startAgentBtn');
  const stopBtn = document.getElementById('stopAgentBtn');
  const captchaBanner = document.getElementById('captchaBanner');
  const togglePrivScope = document.getElementById('togglePrivScope') || { checked: true };
  const toggleLocalLlm = document.getElementById('toggleLocalLlm') || { checked: true };
  const toggleAutoModals = document.getElementById('toggleAutoModals') || { checked: true };
  const toggleTrajectoryCache = document.getElementById('toggleTrajectoryCache') || { checked: true };

  const taskText = taskPrompt ? taskPrompt.value.trim() : '';
  if (!taskText) {
    addLogEntry('ERROR', 'Please enter a task goal or instruction first.');
    return;
  }

  if (startBtn) startBtn.disabled = true;
  if (stopBtn) stopBtn.disabled = false;
  if (captchaBanner) captchaBanner.style.display = 'none';

  // Hide previous reasoning / response cards
  const bufferCard = document.getElementById('reasoningBufferCard');
  const respCard = document.getElementById('agentResponseCard');
  if (bufferCard) bufferCard.style.display = 'none';
  if (respCard) respCard.style.display = 'none';

  updateStatusBadge('RUNNING', true);
  addLogEntry('INFO', `Task started: "${taskText}"`);

  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage(
      {
        type: 'START_AGENT_TASK',
        task: taskText,
        settings: {
          enablePiiFilter: togglePrivScope.checked,
          useLocalLlm: toggleLocalLlm.checked,
          autoDismissModals: toggleAutoModals.checked,
          enableTrajectoryCache: toggleTrajectoryCache.checked
        }
      },
      (response) => {
        if (chrome.runtime.lastError) {
          addLogEntry('ERROR', 'Message channel error: ' + chrome.runtime.lastError.message);
          resetUiState();
          return;
        }
        if (response?.status !== 'STARTED') {
          addLogEntry('ERROR', response?.message || 'Failed to start agent task.');
          resetUiState();
        }
      }
    );
  } else {
    addLogEntry('WARN', 'chrome.runtime unavailable — running outside extension context.');
  }
}

function stopAgentTask() {
  console.log('[Agent Panel] >>> stopAgentTask() FIRED');
  const captchaBanner = document.getElementById('captchaBanner');
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({ type: 'STOP_AGENT_TASK' }, () => {
      addLogEntry('WARN', 'Task stopped by user.');
      if (captchaBanner) captchaBanner.style.display = 'none';
      resetUiState();
    });
  }
}

function clearLogs() {
  const logContainer = document.getElementById('logContainer');
  if (logContainer) {
    logContainer.innerHTML = '<div class="log-entry log-info"><span class="log-time">[System]</span> Logs cleared. Ready for next trajectory.</div>';
  }
}


// ─── SCAN / DATA FETCH HANDLERS ───
function scanAxTree() {
  console.log('[Agent Panel] >>> scanAxTree() FIRED');
  const axTreeView = document.getElementById('axTreeView');
  if (!axTreeView) return;
  axTreeView.innerHTML = '<div class="empty-state">Scanning Accessibility Tree...</div>';
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({ type: 'GET_CURRENT_LAYOUT' }, (response) => {
      if (chrome.runtime.lastError) {
        axTreeView.innerHTML = `<div class="empty-state">Error: ${chrome.runtime.lastError.message}</div>`;
        return;
      }
      if (response && response.status === 'SUCCESS' && response.data?.axTree) {
        renderAxTree(response.data.axTree.nodes || []);
      } else {
        axTreeView.innerHTML = `<div class="empty-state">Error scanning AX Tree: ${response?.error || 'Active tab unavailable'}</div>`;
      }
    });
  }
}

function refreshMap() {
  console.log('[Agent Panel] >>> refreshMap() FIRED');
  const jsonViewer = document.getElementById('jsonViewer');
  if (jsonViewer) jsonViewer.innerText = 'Scanning physical screen layout...';
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({ type: 'GET_CURRENT_LAYOUT' }, (response) => {
      if (chrome.runtime.lastError) {
        if (jsonViewer) jsonViewer.innerText = `Error: ${chrome.runtime.lastError.message}`;
        return;
      }
      if (response && response.status === 'SUCCESS') {
        if (jsonViewer) jsonViewer.innerText = JSON.stringify(response.data, null, 2);
      } else {
        if (jsonViewer) jsonViewer.innerText = `Error scanning layout: ${response?.error || 'Active tab unavailable'}`;
      }
    });
  }
}

function loadLlmPayload() {
  const llmPayloadViewer = document.getElementById('llmPayloadViewer');
  if (!llmPayloadViewer) return;
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['lastLlmPayload'], (res) => {
      if (res && res.lastLlmPayload) {
        llmPayloadViewer.innerText = JSON.stringify(res.lastLlmPayload, null, 2);
      }
    });
  }
}

function loadPrivScopeBindings() {
  const privscopeView = document.getElementById('privscopeView');
  if (!privscopeView) return;
  privscopeView.innerHTML = `
    <div class="binding-item"><span class="bind-key">$BIND_EMAIL_ADDR_0</span><span class="bind-value">[ON_DEVICE_BINDING_PROTECTED]</span></div>
    <div class="binding-item"><span class="bind-key">$BIND_CARD_NUM_1</span><span class="bind-value">[ON_DEVICE_BINDING_PROTECTED]</span></div>
    <div class="binding-item"><span class="bind-key">$BIND_SSN_ID_2</span><span class="bind-value">[ON_DEVICE_BINDING_PROTECTED]</span></div>
  `;
}

function clearTrajectoryCache() {
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({ type: 'CLEAR_TRAJECTORY_CACHE' }, () => {
      addLogEntry('SUCCESS', '⚡ Cleared all cached trajectories.');
      loadCacheList();
    });
  }
}

function loadCacheList() {
  const cacheList = document.getElementById('cacheList');
  if (!cacheList) return;
  cacheList.innerHTML = '<div class="empty-state">Loading cached trajectories...</div>';
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(null, (allStorage) => {
      const trajKeys = Object.keys(allStorage).filter((k) => k.startsWith('traj_'));
      if (trajKeys.length === 0) {
        cacheList.innerHTML = '<div class="empty-state">No cached trajectories found.</div>';
        return;
      }
      cacheList.innerHTML = trajKeys.map((key) => {
        return `<div class="cache-item"><div><span class="cache-domain">${key}</span></div></div>`;
      }).join('');
    });
  }
}


// ──────────────────────────────────────────────────
//  EVENT BINDING — All via addEventListener (CSP-safe)
// ──────────────────────────────────────────────────
function bindAllEvents() {
  console.log('[Agent Panel] bindAllEvents() — attaching listeners');

  // ── Primary action buttons ──
  const startBtn = document.getElementById('startAgentBtn');
  const stopBtn = document.getElementById('stopAgentBtn');
  const clearLogsBtn = document.getElementById('clearLogsBtn');

  if (startBtn) startBtn.addEventListener('click', () => { console.log('[Agent Panel] Start btn click'); startAgentTask(); });
  if (stopBtn) stopBtn.addEventListener('click', () => { console.log('[Agent Panel] Stop btn click'); stopAgentTask(); });
  if (clearLogsBtn) clearLogsBtn.addEventListener('click', () => { clearLogs(); });

  // ── Advanced tools buttons ──
  const scanAxBtn = document.getElementById('scanAxBtn');
  const refreshMapBtn = document.getElementById('refreshMapBtn');
  const refreshLlmPayloadBtn = document.getElementById('refreshLlmPayloadBtn');
  const refreshPrivScopeBtn = document.getElementById('refreshPrivScopeBtn');
  const clearCacheBtn = document.getElementById('clearCacheBtn');

  if (scanAxBtn) scanAxBtn.addEventListener('click', () => { console.log('[Agent Panel] Scan AX btn click'); scanAxTree(); });
  if (refreshMapBtn) refreshMapBtn.addEventListener('click', () => { console.log('[Agent Panel] Refresh Map btn click'); refreshMap(); });
  if (refreshLlmPayloadBtn) refreshLlmPayloadBtn.addEventListener('click', () => { loadLlmPayload(); });
  if (refreshPrivScopeBtn) refreshPrivScopeBtn.addEventListener('click', () => { loadPrivScopeBindings(); });
  if (clearCacheBtn) clearCacheBtn.addEventListener('click', () => { clearTrajectoryCache(); });

  // ── Top nav tabs ──
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      if (tabId) switchTab(tabId);
    });
  });

  // ── Advanced sub-tabs ──
  document.querySelectorAll('.adv-subbtn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const subtabId = btn.getAttribute('data-subtab');
      if (subtabId) switchSubtab(subtabId);
    });
  });

  // ── AX tree search filter ──
  const axSearchInput = document.getElementById('axSearchInput');
  if (axSearchInput) {
    axSearchInput.addEventListener('input', () => {
      const query = axSearchInput.value.toLowerCase();
      document.querySelectorAll('.ax-node').forEach((node) => {
        node.style.display = node.textContent.toLowerCase().includes(query) ? '' : 'none';
      });
    });
  }

  console.log('[Agent Panel] All event listeners bound successfully.');
}


// ──────────────────────────────────────────────────
//  BACKGROUND MESSAGE LISTENER
// ──────────────────────────────────────────────────
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'AGENT_LOG_UPDATE') {
      const { phase, message: text, routingMode, timestamp } = message.payload;
      addLogEntry(phase, text, timestamp);
      if (routingMode) updateRoutingBadge(routingMode);
      if (phase === 'FINISHED' || phase === 'ERROR' || phase === 'STOPPED') {
        resetUiState();
      } else {
        updateStatusBadge(phase, true);
      }
    } else if (message.type === 'AGENT_LLM_PAYLOAD_UPDATE') {
      // Only auto-refresh if the user is already on the LLM payload subtab
      const llmSubtab = document.getElementById('subtab-llm');
      if (llmSubtab && llmSubtab.classList.contains('active')) {
        loadLlmPayload();
      }
    } else if (message.type === 'AGENT_FINAL_RESPONSE') {
      if (message.payload && message.payload.isFormTask) {
        addLogEntry('SUCCESS', 'Form application completed and submitted successfully.');
      } else {
        triggerReasoningBuffer(message.payload);
      }
    }
  });
}


// ──────────────────────────────────────────────────
//  INITIALIZATION
// ──────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindAllEvents);
} else {
  bindAllEvents();
}
