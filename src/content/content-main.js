/**
 * Content Script Main Entry Point
 * Listens for background service worker commands and invokes modular helpers.
 */

let modulesLoaded = false;
let extractPhysicalLayoutMap, redactLayoutMap, executeAgentAction, checkAndDismissInterrupts, waitForDomStability;
let generateAXTreeSnapshot, privScope;

async function ensureModulesLoaded() {
  if (modulesLoaded) return;

  const layoutExtractorUrl = chrome.runtime.getURL('src/content/layout-extractor.js');
  const piiFilterUrl = chrome.runtime.getURL('src/content/pii-filter.js');
  const actionExecutorUrl = chrome.runtime.getURL('src/content/action-executor.js');
  const interruptHandlerUrl = chrome.runtime.getURL('src/content/interrupt-handler.js');
  const axTreeParserUrl = chrome.runtime.getURL('src/content/ax-tree-parser.js');
  const privScopeUrl = chrome.runtime.getURL('src/content/priv-scope.js');

  const layoutMod = await import(layoutExtractorUrl);
  const piiMod = await import(piiFilterUrl);
  const actionMod = await import(actionExecutorUrl);
  const interruptMod = await import(interruptHandlerUrl);
  const axMod = await import(axTreeParserUrl);
  const privMod = await import(privScopeUrl);

  extractPhysicalLayoutMap = layoutMod.extractPhysicalLayoutMap;
  redactLayoutMap = piiMod.redactLayoutMap;
  executeAgentAction = actionMod.executeAgentAction;
  checkAndDismissInterrupts = interruptMod.checkAndDismissInterrupts;
  waitForDomStability = interruptMod.waitForDomStability;
  generateAXTreeSnapshot = axMod.generateAXTreeSnapshot;
  privScope = privMod.privScope;

  modulesLoaded = true;
  console.log('[Atlas & Comet Local Agent] Content script modules loaded.');
}

// Synchronously register message listener at top level
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      await ensureModulesLoaded();

      switch (request.type) {
        case 'GET_LAYOUT_MAP': {
          // 1. Check for CAPTCHA & modal interrupts
          const interruptResult = checkAndDismissInterrupts();
          if (interruptResult.captchaDetected) {
            sendResponse({
              status: 'CAPTCHA_DETECTED',
              provider: interruptResult.provider,
              message: `CAPTCHA challenge detected (${interruptResult.provider}). Human intervention required.`
            });
            break;
          }

          // 2. Extract Accessibility Tree Snapshot with @e1, @e2 Refs
          const axTree = generateAXTreeSnapshot();

          // 3. Extract DOM physical layout
          let layoutData = extractPhysicalLayoutMap();

          // 4. Apply PrivScope abstraction & PII redaction if enabled
          if (request.enablePiiFilter !== false) {
            layoutData = redactLayoutMap(layoutData);
          }

          sendResponse({
            status: 'SUCCESS',
            data: {
              ...layoutData,
              axTree: axTree
            },
            interruptsCleared: interruptResult.count
          });
          break;
        }

        case 'EXECUTE_ACTION': {
          const actionResult = await executeAgentAction(request.payload);
          
          // Wait for DOM stability post-action
          await waitForDomStability(2000);

          sendResponse({
            status: 'SUCCESS',
            result: actionResult
          });
          break;
        }

        case 'CHECK_INTERRUPTS': {
          const res = checkAndDismissInterrupts();
          sendResponse({ status: 'SUCCESS', data: res });
          break;
        }

        default:
          sendResponse({ status: 'ERROR', error: `Unknown request type ${request.type}` });
      }
    } catch (err) {
      console.error('[Atlas Agent Content Script Error]:', err);
      sendResponse({ status: 'ERROR', error: err.message });
    }
  })();

  return true; // Keep channel open for async response
});
