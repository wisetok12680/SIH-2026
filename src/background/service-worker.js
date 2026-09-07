/**
 * Background Service Worker - Hybrid Agent Coordinator
 * Integrates Accessibility Tree Snapshots (@e1, @e2...), PrivScope Local Binding,
 * Trajectory Caching & Replay, Hybrid Dynamic Routing, and CAPTCHA pause/resume.
 */

import { AgentPlannerClient } from './llm-client.js';
import { TrajectoryCache } from './trajectory-cache.js';
import { HybridDynamicRouter } from './hybrid-router.js';

const planner = new AgentPlannerClient('http://localhost:11434/api/generate', 'qwen:4b');
const router = new HybridDynamicRouter();

let agentState = {
  isRunning: false,
  isPausedForCaptcha: false,
  currentTask: '',
  actionHistory: [],
  maxSteps: 10,
  currentStep: 0,
  routingMode: 'LOCAL_AGENT',
  cacheHit: false,
  settings: {
    enablePiiFilter: true,
    useLocalLlm: false,
    autoDismissModals: true,
    enableTrajectoryCache: true
  }
};

// Enable SidePanel on Extension Icon Click
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => console.error(err));
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      switch (request.type) {
        case 'START_AGENT_TASK': {
          if (agentState.isRunning) {
            sendResponse({ status: 'BUSY', message: 'Agent is already executing a task' });
            return;
          }

          agentState.isRunning = true;
          agentState.isPausedForCaptcha = false;
          agentState.currentTask = request.task;
          agentState.actionHistory = [];
          agentState.currentStep = 0;
          agentState.cacheHit = false;

          if (request.settings) {
            agentState.settings = { ...agentState.settings, ...request.settings };
          }

          router.resetMemory();

          broadcastStatus('STARTED', `Started task: "${request.task}"`);
          runAgentLoop();

          sendResponse({ status: 'STARTED' });
          break;
        }

        case 'STOP_AGENT_TASK': {
          agentState.isRunning = false;
          agentState.isPausedForCaptcha = false;
          broadcastStatus('STOPPED', 'Task stopped by user.');
          sendResponse({ status: 'STOPPED' });
          break;
        }

        case 'GET_CURRENT_LAYOUT': {
          const tab = await getActiveTab();
          if (!tab) {
            sendResponse({ status: 'ERROR', error: 'No active tab found' });
            return;
          }

          const layoutRes = await sendMessageWithAutoInject(tab.id, {
            type: 'GET_LAYOUT_MAP',
            enablePiiFilter: agentState.settings.enablePiiFilter
          });

          sendResponse(layoutRes);
          break;
        }

        case 'CLEAR_TRAJECTORY_CACHE': {
          await TrajectoryCache.clearAll();
          sendResponse({ status: 'SUCCESS', message: 'Cleared all cached trajectories' });
          break;
        }

        case 'GET_AGENT_STATE': {
          sendResponse({ status: 'SUCCESS', state: agentState });
          break;
        }

        default:
          sendResponse({ status: 'ERROR', error: `Unknown background message ${request.type}` });
      }
    } catch (err) {
      console.error('[Background Worker Error]:', err);
      sendResponse({ status: 'ERROR', error: err.message });
    }
  })();

  return true; // Keep channel open for async response
});

async function runAgentLoop() {
  const tab = await getActiveTab();
  if (!tab) {
    broadcastStatus('ERROR', 'Active browser tab lost');
    agentState.isRunning = false;
    return;
  }

  // 1. Check Trajectory Cache for instant replay
  if (agentState.settings.enableTrajectoryCache) {
    const cached = await TrajectoryCache.getCachedTrajectory(tab.url, agentState.currentTask);
    if (cached && cached.steps && cached.steps.length > 0) {
      agentState.cacheHit = true;
      broadcastStatus('CACHE_HIT', `⚡ Trajectory Cache Hit! Replaying ${cached.steps.length} validated steps directly...`);

      for (let i = 0; i < cached.steps.length; i++) {
        if (!agentState.isRunning) break;
        const step = cached.steps[i];
        broadcastStatus('EXECUTING', `[Replay ${i + 1}/${cached.steps.length}] Replaying ${step.action} target: ${step.targetRef || step.selector}`);

        await sendMessageWithAutoInject(tab.id, {
          type: 'EXECUTE_ACTION',
          payload: step
        });

        await sleep(1000);
      }

      broadcastStatus('FINISHED', '⚡ Trajectory Replay completed successfully (AI bypassed)!');
      agentState.isRunning = false;
      return;
    }
  }

  // 2. Main Perception-Plan-Act Loop
  while (agentState.isRunning && agentState.currentStep < agentState.maxSteps) {
    agentState.currentStep++;
    const stepNum = agentState.currentStep;

    try {
      broadcastStatus('PERCEIVING', `[Step ${stepNum}] Scanning Accessibility Tree & Screen Layout...`);

      const mapResponse = await sendMessageWithAutoInject(tab.id, {
        type: 'GET_LAYOUT_MAP',
        enablePiiFilter: agentState.settings.enablePiiFilter
      });

      // Handle CAPTCHA Challenge Pause
      if (mapResponse?.status === 'CAPTCHA_DETECTED') {
        agentState.isPausedForCaptcha = true;
        broadcastStatus('CAPTCHA_ALERT', `⚠️ ${mapResponse.message}`);
        broadcastStatus('PAUSED', 'Automation paused. Please solve the CAPTCHA in the browser window to continue...');

        // Wait for user to solve CAPTCHA
        await waitForCaptchaResolution(tab.id);
        agentState.isPausedForCaptcha = false;
        broadcastStatus('RESUMED', 'CAPTCHA resolved! Resuming automated trajectory...');
        continue;
      }

      if (!mapResponse || mapResponse.status !== 'SUCCESS') {
        broadcastStatus('ERROR', `Failed to parse accessibility layout: ${mapResponse?.error || 'No response'}`);
        break;
      }

      const layoutData = mapResponse.data;
      broadcastLayoutPreview(layoutData);

      // Evaluate Dynamic Routing (Local GUI Agent vs Cloud Agent)
      const routingDecision = router.evaluateRouting(agentState.currentTask, layoutData, stepNum);
      agentState.routingMode = routingDecision.route;

      broadcastStatus('ROUTING_DECISION', `[Step ${stepNum}] Route: [${routingDecision.route}] - ${routingDecision.reason}`);

      // Plan Next Action using Ref Tags (@e1, @e2...)
      broadcastStatus('PLANNING', `[Step ${stepNum}] Reasoning next action using AXTree Refs...`);
      const plan = await planner.planNextStep(
        agentState.currentTask,
        layoutData,
        agentState.actionHistory,
        agentState.settings
      );

      broadcastStatus('PLAN_GENERATED', `[Step ${stepNum}] Thought: "${plan.thought}" -> Action: ${plan.action} (${plan.ref || plan.targetRef || 'N/A'})`);

      if (plan.action === 'FINISH') {
        // Save trajectory to cache upon successful multi-step completion
        await TrajectoryCache.saveTrajectory(tab.url, agentState.currentTask, agentState.actionHistory);

        broadcastStatus('FINISHED', `Task completed: ${plan.value || 'Done'}`);
        agentState.isRunning = false;
        break;
      }

      // Execute Action
      broadcastStatus('EXECUTING', `[Step ${stepNum}] Executing ${plan.action} on ${plan.ref || plan.targetRef}`);
      const execRes = await sendMessageWithAutoInject(tab.id, {
        type: 'EXECUTE_ACTION',
        payload: plan
      });

      if (execRes && execRes.status === 'SUCCESS') {
        const stepRecord = {
          step: stepNum,
          action: plan.action,
          targetRef: plan.ref || plan.targetRef,
          selector: plan.selector,
          value: plan.value,
          thought: plan.thought
        };

        agentState.actionHistory.push(stepRecord);
        router.recordStep(stepRecord);

        // State Verification Screenshot
        try {
          const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
          broadcastScreenshot(dataUrl);
        } catch (e) {}

        await sleep(1500);
      } else {
        broadcastStatus('ERROR', `Action execution failed: ${execRes?.error || 'Unknown error'}`);
        break;
      }
    } catch (err) {
      console.error(`[Agent Loop Error Step ${stepNum}]:`, err);
      broadcastStatus('ERROR', `Step ${stepNum} failed: ${err.message}`);
      break;
    }
  }

  if (agentState.currentStep >= agentState.maxSteps && agentState.isRunning) {
    broadcastStatus('FINISHED', 'Reached maximum step execution limit.');
    agentState.isRunning = false;
  }
}

async function waitForCaptchaResolution(tabId) {
  let isResolved = false;
  while (!isResolved && agentState.isRunning) {
    await sleep(2500);
    try {
      const res = await sendMessageWithAutoInject(tabId, { type: 'CHECK_INTERRUPTS' });
      if (res && res.status === 'SUCCESS' && !res.data.captchaDetected) {
        isResolved = true;
      }
    } catch (e) {}
  }
}

async function sendMessageWithAutoInject(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    if (err.message && (err.message.includes('Could not establish connection') || err.message.includes('Receiving end does not exist'))) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['src/content/content-main.js']
        });
        await sleep(200);
        return await chrome.tabs.sendMessage(tabId, message);
      } catch (injectErr) {
        throw new Error(
          `Cannot access tab (${injectErr.message}). Enable 'Allow access to file URLs' in chrome://extensions if testing local files.`
        );
      }
    }
    throw err;
  }
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

function broadcastStatus(phase, message) {
  chrome.runtime.sendMessage({
    type: 'AGENT_LOG_UPDATE',
    payload: {
      phase,
      message,
      routingMode: agentState.routingMode,
      cacheHit: agentState.cacheHit,
      timestamp: new Date().toLocaleTimeString()
    }
  }).catch(() => {});
}

function broadcastLayoutPreview(layoutData) {
  chrome.runtime.sendMessage({
    type: 'AGENT_LAYOUT_PREVIEW',
    payload: layoutData
  }).catch(() => {});
}

function broadcastScreenshot(dataUrl) {
  chrome.runtime.sendMessage({
    type: 'AGENT_SCREENSHOT_UPDATE',
    payload: dataUrl
  }).catch(() => {});
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
