/**
 * Ref-based Action Execution Engine
 * Dynamically executes browser actions using Accessibility Tree References (@e1, @e2...), CSS selectors, or coordinates.
 * Displays real-time agent target spotlight frames, floating badges (@e1, @e2...), and laser click ripples.
 */

import { getElementByRef } from './ax-tree-parser.js';
import { privScope } from './priv-scope.js';

export async function executeAgentAction(actionPayload) {
  const { action, ref, targetRef, selector, viewportX, viewportY, width, height, value, amount, direction } = actionPayload;

  const refId = ref || targetRef;

  // 1. Locate target element using Ref ID, selector, or physical coordinates
  let el = null;

  if (refId) {
    el = getElementByRef(refId);
  }

  if (!el && selector) {
    try {
      el = document.querySelector(selector);
    } catch (e) {
      // Fallback
    }
  }

  if (!el && viewportX !== undefined && viewportY !== undefined) {
    const cx = viewportX + (width ? width / 2 : 5);
    const cy = viewportY + (height ? height / 2 : 5);
    el = document.elementFromPoint(cx, cy);
  }

  const actType = (action || '').toUpperCase();

  if (!el && actType !== 'SCROLL' && actType !== 'WAIT' && actType !== 'NEW_TAB') {
    throw new Error(`Element execution target not found (Ref: ${refId || 'N/A'}, selector: ${selector || 'N/A'})`);
  }

  // 2. Visual Agent Target Spotlight & Floating Badge Indicator
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    highlightElement(el, actionPayload);
    await sleep(350); // Pause so user/judge visually sees the agent targeting the element
  }

  // 3. Perform requested action
  switch (actType) {
    case 'CLICK': {
      el.focus();
      dispatchMouseEvent(el, 'mousedown');
      dispatchMouseEvent(el, 'mouseup');
      el.click();
      return { success: true, message: `Clicked element ${refId || el.tagName}` };
    }

    case 'TYPE': {
      // Perform PrivScope local resolution on $BIND_ keys before DOM insertion
      const resolvedValue = privScope.resolveLocalValue(value || '');

      el.focus();
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.value = resolvedValue;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (el.isContentEditable) {
        el.innerText = resolvedValue;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return { success: true, message: `Typed resolved value into ${refId || el.tagName}` };
    }

    case 'CLEAR': {
      el.focus();
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return { success: true, message: `Cleared input ${refId || el.tagName}` };
    }

    case 'SELECT': {
      if (el.tagName === 'SELECT') {
        el.value = value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, message: `Selected option ${value}` };
      }
      return { success: false, message: `Target is not a SELECT element` };
    }

    case 'SCROLL': {
      const scrollDistance = amount || 500;
      const scrollDir = direction || value || 'down';
      const distance = scrollDir === 'up' ? -scrollDistance : scrollDistance;
      
      window.scrollBy({ top: distance, behavior: 'smooth' });
      await sleep(400);
      return { success: true, message: `Scrolled window ${scrollDir} by ${scrollDistance}px` };
    }

    case 'WAIT': {
      await sleep(value || amount || 1000);
      return { success: true, message: `Waited for ${value || amount || 1000}ms` };
    }

    default:
      throw new Error(`Unsupported action type: ${action}`);
  }
}

function highlightElement(el, actionPayload = {}) {
  const { action = 'ACTION', ref, targetRef } = actionPayload;
  const refId = ref || targetRef || '@e';

  // 1. Remove existing overlay
  const existing = document.getElementById('atlas-agent-highlight-overlay');
  if (existing) existing.remove();

  const rect = el.getBoundingClientRect();
  const scrollX = window.scrollX || window.pageXOffset || 0;
  const scrollY = window.scrollY || window.pageYOffset || 0;

  // 2. Create Floating Overlay Container
  const container = document.createElement('div');
  container.id = 'atlas-agent-highlight-overlay';
  container.style.cssText = `
    position: absolute;
    top: ${rect.top + scrollY}px;
    left: ${rect.left + scrollX}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    pointer-events: none;
    z-index: 2147483647;
    border: 3px solid #38bdf8;
    border-radius: 6px;
    box-shadow: 0 0 25px rgba(56, 189, 248, 0.9), inset 0 0 15px rgba(99, 102, 241, 0.6);
    animation: atlasPulse 1.2s infinite ease-in-out;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  `;

  // 3. Floating Action Badge Label
  const badge = document.createElement('div');
  let icon = '⚡';
  const actUpper = action.toUpperCase();
  if (actUpper === 'CLICK') icon = '🖱️';
  if (actUpper === 'TYPE') icon = '⌨️';
  if (actUpper === 'CLEAR') icon = '🧹';
  if (actUpper === 'SELECT') icon = '🔽';

  badge.innerHTML = `
    <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase;">
      <span style="font-size: 13px;">${icon}</span>
      <span style="color: #38bdf8;">AGENT: ${actUpper}</span>
      <span style="background: rgba(99, 102, 241, 0.4); color: #fff; padding: 2px 6px; border-radius: 4px;">${refId}</span>
    </div>
  `;
  badge.style.cssText = `
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95));
    border: 1px solid rgba(56, 189, 248, 0.6);
    backdrop-filter: blur(8px);
    color: #f8fafc;
    padding: 6px 12px;
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    white-space: nowrap;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    transform: translateY(0);
    animation: atlasSlideDown 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  `;

  // 4. Click Ripple Laser Effect
  const ripple = document.createElement('div');
  ripple.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    width: 20px;
    height: 20px;
    transform: translate(-50%, -50%);
    border: 2px solid #06b6d4;
    border-radius: 50%;
    background: rgba(6, 182, 212, 0.3);
    animation: atlasRipple 0.8s ease-out forwards;
  `;

  container.appendChild(badge);
  container.appendChild(ripple);

  // Inject keyframe styles if not present
  if (!document.getElementById('atlas-agent-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'atlas-agent-styles';
    styleSheet.textContent = `
      @keyframes atlasPulse {
        0% { box-shadow: 0 0 15px rgba(56, 189, 248, 0.6); }
        50% { box-shadow: 0 0 35px rgba(56, 189, 248, 1), 0 0 15px rgba(99, 102, 241, 0.8); }
        100% { box-shadow: 0 0 15px rgba(56, 189, 248, 0.6); }
      }
      @keyframes atlasSlideDown {
        from { opacity: 0; transform: translateY(-8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes atlasRipple {
        0% { width: 0px; height: 0px; opacity: 1; }
        100% { width: 120px; height: 120px; opacity: 0; }
      }
    `;
    document.head.appendChild(styleSheet);
  }

  document.body.appendChild(container);

  // Native outline emphasis on element itself
  el.style.outline = '3px solid #38bdf8';
  el.style.outlineOffset = '2px';
  el.style.transition = 'all 0.2s ease-in-out';

  setTimeout(() => {
    container.style.opacity = '0';
    setTimeout(() => container.remove(), 300);
    el.style.outline = '';
    el.style.outlineOffset = '';
  }, 2200);
}

function dispatchMouseEvent(el, type) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    view: window
  });
  el.dispatchEvent(event);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

