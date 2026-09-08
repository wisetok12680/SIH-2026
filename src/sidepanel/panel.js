/**
 * Sidepanel Interface Script - Hybrid Control Center
 * Manages tabs, task controls, Accessibility Ref Tree (@e1, @e2...), Routing badges, PrivScope, and Trajectory Cache.
 */

document.addEventListener('DOMContentLoaded', () => {
  const navButtons = document.querySelectorAll('.nav-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const startBtn = document.getElementById('startAgentBtn');
  const stopBtn = document.getElementById('stopAgentBtn');
  const taskPrompt = document.getElementById('taskPrompt');
  const logContainer = document.getElementById('logContainer');
  const clearLogsBtn = document.getElementById('clearLogsBtn');
  const statusBadge = document.getElementById('agentStatusBadge');
  const routingBadge = document.getElementById('routingBadge');
  const backendHealthBadge = document.getElementById('backendHealthBadge');
  const captchaBanner = document.getElementById('captchaBanner');
  const jsonViewer = document.getElementById('jsonViewer');
  const refreshMapBtn = document.getElementById('refreshMapBtn');
  const scanAxBtn = document.getElementById('scanAxBtn');
  const axTreeView = document.getElementById('axTreeView');
  const axSearchInput = document.getElementById('axSearchInput');
  const toggleTrajectoryCache = document.getElementById('toggleTrajectoryCache') || { checked: true };
  const togglePrivScope = document.getElementById('togglePrivScope') || { checked: true };
  const toggleAutoModals = document.getElementById('toggleAutoModals') || { checked: true };
  const clearCacheBtn = document.getElementById('clearCacheBtn');
  const refreshCacheListBtn = document.getElementById('refreshCacheListBtn');
  const cacheList = document.getElementById('cacheList');
  const refreshPrivScopeBtn = document.getElementById('refreshPrivScopeBtn');
  const privscopeView = document.getElementById('privscopeView');

  let currentAxNodes = [];

  // 1. Backend Health Check Loop
  checkBackendHealth();
  setInterval(checkBackendHealth, 10000);

  async function checkBackendHealth() {
    try {
      const res = await fetch('http://localhost:8000/health');
      if (res.ok) {
        if (backendHealthBadge) {
          backendHealthBadge.innerText = 'ML: ON';
          backendHealthBadge.className = 'status-badge online';
        }
      } else {
        throw new Error();
      }
    } catch (e) {
      if (backendHealthBadge) {
        backendHealthBadge.innerText = 'ML: OFF';
        backendHealthBadge.className = 'status-badge offline';
      }
    }
  }

  // 2. Tab & Sub-Tab Switching Logic
  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      
      navButtons.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((tc) => tc.classList.remove('active'));

      btn.classList.add('active');
      const targetEl = document.getElementById(targetTab);
      if (targetEl) targetEl.classList.add('active');
    });
  });

  const advSubBtns = document.querySelectorAll('.adv-subbtn');
  const advSubContents = document.querySelectorAll('.adv-subcontent');

  advSubBtns.forEach((subBtn) => {
    subBtn.addEventListener('click', () => {
      const targetSubtab = subBtn.getAttribute('data-subtab');
      advSubBtns.forEach((b) => b.classList.remove('active'));
      advSubContents.forEach((sc) => sc.classList.remove('active'));

      subBtn.classList.add('active');
      const targetSub = document.getElementById(targetSubtab);
      if (targetSub) targetSub.classList.add('active');

      if (targetSubtab === 'subtab-config') loadCacheList();
      if (targetSubtab === 'subtab-priv') loadPrivScopeBindings();
    });
  });

  // 4. Start Agent Task
  startBtn.addEventListener('click', async () => {
    const taskText = taskPrompt.value.trim();
    if (!taskText) {
      addLogEntry('ERROR', 'Please enter a task goal or instruction first.');
      return;
    }

    startBtn.disabled = true;
    stopBtn.disabled = false;
    captchaBanner.style.display = 'none';
    updateStatusBadge('RUNNING', true);

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
        if (response?.status !== 'STARTED') {
          addLogEntry('ERROR', response?.message || 'Failed to start agent task.');
          resetUiState();
        }
      }
    );
  });

  // 5. Stop Agent Task
  stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'STOP_AGENT_TASK' }, (response) => {
      addLogEntry('WARN', 'Task stopped by user.');
      captchaBanner.style.display = 'none';
      resetUiState();
    });
  });

  // 6. Clear Logs & Clear Cache
  clearLogsBtn.addEventListener('click', () => {
    logContainer.innerHTML = '<div class="log-entry log-info"><span class="log-time">[System]</span> Logs cleared. Ready for next trajectory.</div>';
  });

  clearCacheBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_TRAJECTORY_CACHE' }, (response) => {
      addLogEntry('SUCCESS', '⚡ Cleared all cached trajectories.');
      loadCacheList();
    });
  });

  if (refreshCacheListBtn) {
    refreshCacheListBtn.addEventListener('click', loadCacheList);
  }

  if (refreshPrivScopeBtn) {
    refreshPrivScopeBtn.addEventListener('click', loadPrivScopeBindings);
  }

  // 7. Manual AX Tree Scan & Search Filter
  scanAxBtn.addEventListener('click', scanAxTree);

  if (axSearchInput) {
    axSearchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      if (!query) {
        renderAxTree(currentAxNodes);
        return;
      }

      const filtered = currentAxNodes.filter((n) => {
        const refMatch = (n.ref || '').toLowerCase().includes(query);
        const roleMatch = (n.role || '').toLowerCase().includes(query);
        const nameMatch = (n.name || '').toLowerCase().includes(query);
        const tagMatch = (n.tagName || '').toLowerCase().includes(query);
        return refMatch || roleMatch || nameMatch || tagMatch;
      });

      renderAxTree(filtered);
    });
  }

  function scanAxTree() {
    axTreeView.innerHTML = '<div class="empty-state">Scanning Accessibility Tree...</div>';
    chrome.runtime.sendMessage({ type: 'GET_CURRENT_LAYOUT' }, (response) => {
      if (response && response.status === 'SUCCESS' && response.data?.axTree) {
        currentAxNodes = response.data.axTree.nodes || [];
        renderAxTree(currentAxNodes);
      } else {
        axTreeView.innerHTML = `<div class="empty-state">Error scanning AX Tree: ${response?.error || 'Active tab unavailable'}</div>`;
      }
    });
  }

  // 8. Manual Physical Map Scan
  refreshMapBtn.addEventListener('click', () => {
    jsonViewer.innerText = 'Scanning physical screen layout...';
    chrome.runtime.sendMessage({ type: 'GET_CURRENT_LAYOUT' }, (response) => {
      if (response && response.status === 'SUCCESS') {
        jsonViewer.innerText = JSON.stringify(response.data, null, 2);
      } else {
        jsonViewer.innerText = `Error scanning layout: ${response?.error || 'Active tab unavailable'}`;
      }
    });
  });

  // 9. Load Trajectory Cache Items
  async function loadCacheList() {
    if (!cacheList) return;
    cacheList.innerHTML = '<div class="empty-state">Loading cached trajectories...</div>';

    chrome.storage.local.get(null, (allStorage) => {
      const trajKeys = Object.keys(allStorage).filter((k) => k.startsWith('traj_'));

      if (trajKeys.length === 0) {
        cacheList.innerHTML = '<div class="empty-state">No cached trajectories found in local storage.</div>';
        return;
      }

      cacheList.innerHTML = trajKeys.map((key) => {
        const item = allStorage[key];
        const stepCount = item.steps ? item.steps.length : 0;
        return `
          <div class="cache-item">
            <div>
              <span class="cache-domain">${escapeHtml(item.domain || 'Global')}</span>
              <div class="cache-task">"${escapeHtml(item.task || 'Task')}" (${stepCount} steps)</div>
            </div>
            <button class="btn btn-secondary btn-delete-key" data-key="${key}">Delete</button>
          </div>
        `;
      }).join('');

      document.querySelectorAll('.btn-delete-key').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const k = e.target.getAttribute('data-key');
          chrome.storage.local.remove([k], () => loadCacheList());
        });
      });
    });
  }

  // 10. Load PrivScope Binding Table Inspector
  function loadPrivScopeBindings() {
    if (!privscopeView) return;
    privscopeView.innerHTML = `
      <div class="binding-item">
        <span class="bind-key">$BIND_EMAIL_ADDR_0</span>
        <span class="bind-value">[ON_DEVICE_BINDING_PROTECTED]</span>
      </div>
      <div class="binding-item">
        <span class="bind-key">$BIND_CARD_NUM_1</span>
        <span class="bind-value">[ON_DEVICE_BINDING_PROTECTED]</span>
      </div>
      <div class="binding-item">
        <span class="bind-key">$BIND_SSN_ID_2</span>
        <span class="bind-value">[ON_DEVICE_BINDING_PROTECTED]</span>
      </div>
    `;
  }

  // 11. Background Event Listener
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'AGENT_LOG_UPDATE') {
      const { phase, message: text, routingMode, cacheHit, timestamp } = message.payload;
      addLogEntry(phase, text, timestamp);

      if (routingMode) {
        updateRoutingBadge(routingMode);
      }

      if (phase === 'CAPTCHA_ALERT') {
        captchaBanner.style.display = 'flex';
      } else if (phase === 'RESUMED' || phase === 'FINISHED' || phase === 'STOPPED') {
        captchaBanner.style.display = 'none';
      }

      if (phase === 'FINISHED' || phase === 'ERROR' || phase === 'STOPPED') {
        resetUiState();
        updateStatusBadge(phase, false);
      } else {
        updateStatusBadge(phase, true);
      }
    } else if (message.type === 'AGENT_LAYOUT_PREVIEW') {
      jsonViewer.innerText = JSON.stringify(message.payload, null, 2);
      if (message.payload?.axTree?.nodes) {
        currentAxNodes = message.payload.axTree.nodes;
        renderAxTree(currentAxNodes);
      }
    } else if (message.type === 'AGENT_LLM_PAYLOAD_UPDATE') {
      const payloadViewer = document.getElementById('llmPayloadViewer');
      if (payloadViewer) {
        payloadViewer.innerText = JSON.stringify(message.payload, null, 2);
      }
    } else if (message.type === 'AGENT_FINAL_RESPONSE') {
      const respCard = document.getElementById('agentResponseCard');
      const respBody = document.getElementById('agentResponseBody');
      const respBadge = document.getElementById('responseBadge');

      if (respCard && respBody) {
        respBody.innerText = message.payload.value || message.payload.thought || 'Task completed successfully.';
        if (respBadge && message.payload.route) {
          respBadge.innerText = message.payload.route.replace('_', ' ');
        }
        respCard.style.display = 'block';
      }
    }
  });

  const refreshLlmPayloadBtn = document.getElementById('refreshLlmPayloadBtn');
  if (refreshLlmPayloadBtn) {
    refreshLlmPayloadBtn.addEventListener('click', () => {
      chrome.storage.local.get(['lastLlmPayload'], (res) => {
        const payloadViewer = document.getElementById('llmPayloadViewer');
        if (payloadViewer) {
          if (res.lastLlmPayload) {
            payloadViewer.innerText = JSON.stringify(res.lastLlmPayload, null, 2);
          } else {
            payloadViewer.innerText = 'No LLM payload recorded yet in local storage.';
          }
        }
      });
    });
  }

  function renderAxTree(nodes) {
    if (!nodes || nodes.length === 0) {
      axTreeView.innerHTML = '<div class="empty-state">No interactive accessibility nodes found matching criteria.</div>';
      return;
    }

    axTreeView.innerHTML = nodes.map((n) => `
      <div class="ax-node">
        <span class="ref-tag">${n.ref}</span>
        <span class="node-role">[${escapeHtml(n.role)}]</span>
        <span class="node-name" title="${escapeHtml(n.name)}">${escapeHtml(n.name || n.value || '<unnamed>')}</span>
      </div>
    `).join('');
  }

  function addLogEntry(phase, text, timeStr) {
    const time = timeStr || new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry ${getLogClass(phase)}`;
    entry.innerHTML = `<span class="log-time">[${time}]</span> ${escapeHtml(text)}`;
    
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  function getLogClass(phase) {
    switch (phase) {
      case 'FINISHED':
      case 'SUCCESS':
      case 'CACHE_HIT':
        return 'log-success';
      case 'ERROR':
      case 'CAPTCHA_ALERT':
        return 'log-error';
      case 'WARN':
      case 'STOPPED':
      case 'PAUSED':
        return 'log-warn';
      default:
        return 'log-info';
    }
  }

  function updateStatusBadge(statusText, isActive) {
    statusBadge.innerText = statusText;
    if (isActive) {
      statusBadge.classList.add('active');
    } else {
      statusBadge.classList.remove('active');
    }
  }

  function updateRoutingBadge(mode) {
    routingBadge.innerText = mode.replace('_', ' ');
    if (mode === 'LOCAL_AGENT') {
      routingBadge.className = 'route-badge local';
    } else {
      routingBadge.className = 'route-badge cloud';
    }
  }

  function resetUiState() {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    updateStatusBadge('IDLE', false);
  }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
});
