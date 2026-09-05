/**
 * Ref-based Action Execution Engine
 * Dynamically executes browser actions using Accessibility Tree References (@e1, @e2...), CSS selectors, or coordinates.
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

  // Visual highlight indicator for debugging / user feedback
  if (el) {
    highlightElement(el);
  }

  // 2. Perform requested action
  switch (actType) {
    case 'CLICK': {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(200);

      el.focus();
      dispatchMouseEvent(el, 'mousedown');
      dispatchMouseEvent(el, 'mouseup');
      el.click();
      return { success: true, message: `Clicked element ${refId || el.tagName}` };
    }

    case 'TYPE': {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(200);

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

function highlightElement(el) {
  const originalOutline = el.style.outline;
  const originalBoxShadow = el.style.boxShadow;

  el.style.outline = '3px solid #6366f1';
  el.style.boxShadow = '0 0 14px rgba(99, 102, 241, 0.9)';
  el.style.transition = 'all 0.2s ease-in-out';

  setTimeout(() => {
    el.style.outline = originalOutline;
    el.style.boxShadow = originalBoxShadow;
  }, 1200);
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
