/**
 * Sidepanel Interface Script - Hybrid Control Center
 * Manages tabs, task controls, Accessibility Ref Tree (@e1, @e2...), Routing badges, and CAPTCHA alert banners.
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
  const captchaBanner = document.getElementById('captchaBanner');
  const jsonViewer = document.getElementById('jsonViewer');
  const refreshMapBtn = document.getElementById('refreshMapBtn');
  const scanAxBtn = document.getElementById('scanAxBtn');
  const axTreeView = document.getElementById('axTreeView');
  const chips = document.querySelectorAll('.chip');

  const toggleTrajectoryCache = document.getElementById('toggleTrajectoryCache');
  const togglePrivScope = document.getElementById('togglePrivScope');
  const toggleAutoModals = document.getElementById('toggleAutoModals');
  const clearCacheBtn = document.getElementById('clearCacheBtn');

  // 1. Tab Switching Logic
  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      
      navButtons.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((tc) => tc.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(targetTab).classList.add('active');
    });
  });

  // 2. Preset Chips
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      taskPrompt.value = chip.getAttribute('data-preset');
    });
  });

  // 3. Start Agent Task
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

  // 4. Stop Agent Task
  stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'STOP_AGENT_TASK' }, (response) => {
      addLogEntry('WARN', 'Task stopped by user.');
      captchaBanner.style.display = 'none';
      resetUiState();
    });
  });

  // 5. Clear Logs & Clear Cache
  clearLogsBtn.addEventListener('click', () => {
    logContainer.innerHTML = '<div class="log-entry log-info"><span class="log-time">[System]</span> Logs cleared.</div>';
  });

  clearCacheBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_TRAJECTORY_CACHE' }, (response) => {
      addLogEntry('SUCCESS', '⚡ Cleared all cached trajectories.');
    });
  });

  // 6. Manual AX Tree Scan
  scanAxBtn.addEventListener('click', () => {
    axTreeView.innerHTML = '<div class="empty-state">Scanning Accessibility Tree...</div>';
    chrome.runtime.sendMessage({ type: 'GET_CURRENT_LAYOUT' }, (response) => {
      if (response && response.status === 'SUCCESS' && response.data?.axTree) {
        renderAxTree(response.data.axTree.nodes);
      } else {
        axTreeView.innerHTML = `<div class="empty-state">Error scanning AX Tree: ${response?.error || 'Active tab unavailable'}</div>`;
      }
    });
  });

  // 7. Manual Physical Map Scan
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

  // 8. Background Event Listener
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
        renderAxTree(message.payload.axTree.nodes);
      }
    }
  });

  function renderAxTree(nodes) {
    if (!nodes || nodes.length === 0) {
      axTreeView.innerHTML = '<div class="empty-state">No interactive accessibility nodes found on active screen.</div>';
      return;
    }

    axTreeView.innerHTML = nodes.map((n) => `
      <div class="ax-node">
        <span class="ref-tag">${n.ref}</span>
        <span class="node-role">[${escapeHtml(n.role)}]</span>
        <span class="node-name">${escapeHtml(n.name || n.value || '<unnamed>')}</span>
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
