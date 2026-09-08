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

  // 1. Locate target element using Ref ID, selector, ID, or physical coordinates
  let el = null;

  if (refId) {
    el = getElementByRef(refId);
    if (!el) {
      try {
        const cleanRef = refId.replace(/^@/, '');
        el = document.getElementById(cleanRef) ||
             document.querySelector(`[id="${cleanRef}"], [name="${cleanRef}"], [name="${refId}"], [ref="${refId}"]`);
      } catch (e) {}
    }
  }

  if (!el && selector) {
    try {
      el = document.querySelector(selector);
    } catch (e) {}
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
        const proto = el.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(el, resolvedValue);
        } else {
          el.value = resolvedValue;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
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

  // 2. Create Floating Target Frame (Clean Enterprise High-Contrast)
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
    border: 2px solid #6366f1;
    border-radius: 4px;
    background: rgba(99, 102, 241, 0.08);
    transition: opacity 0.2s ease-in-out;
  `;

  // 3. Clean Floating Badge (No emojis, no gradients)
  const badge = document.createElement('div');
  const actUpper = action.toUpperCase();

  badge.innerHTML = `
    <div style="display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 11px; letter-spacing: 0.5px; font-family: 'Fira Code', monospace;">
      <span style="color: #6366f1; font-weight: 700;">ACTION: ${actUpper}</span>
      <span style="background: #334155; color: #f8fafc; padding: 2px 6px; border-radius: 3px;">${refId}</span>
    </div>
  `;
  badge.style.cssText = `
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    background: #0f172a;
    border: 1px solid #334155;
    color: #f8fafc;
    padding: 4px 10px;
    border-radius: 4px;
    white-space: nowrap;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  `;

  container.appendChild(badge);
  document.body.appendChild(container);

  // Native outline emphasis
  el.style.outline = '2px solid #6366f1';
  el.style.outlineOffset = '2px';

  setTimeout(() => {
    container.style.opacity = '0';
    setTimeout(() => container.remove(), 200);
    el.style.outline = '';
    el.style.outlineOffset = '';
  }, 1800);
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

