/**
 * Accessibility Tree & Reference Tagging Parser
 * Strips visual styling & DOM noise, assigning stable Reference IDs (@e1, @e2, @e3...) to interactive elements.
 */

let currentRefMap = new Map();

export function generateAXTreeSnapshot() {
  currentRefMap.clear();
  let refCounter = 1;

  const interactiveSelectors = [
    'a[href]',
    'button',
    'input',
    'textarea',
    'select',
    'option',
    '[role="button"]',
    '[role="link"]',
    '[role="checkbox"]',
    '[role="combobox"]',
    '[role="searchbox"]',
    '[role="textbox"]',
    '[role="tab"]',
    '[onclick]',
    '[tabindex]:not([tabindex="-1"])',
    'iframe'
  ].join(', ');

  const elements = document.querySelectorAll(interactiveSelectors);
  const treeNodes = [];

  elements.forEach((el) => {
    // Filter non-visible elements
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || parseFloat(style.opacity || '1') === 0) return;

    const refId = `@e${refCounter++}`;
    
    // Store element reference mapping locally
    currentRefMap.set(refId, el);

    // Extract ARIA / Accessibility details
    const role = el.getAttribute('role') || getImplicitRole(el);
    const name = getAccessibleName(el);
    const value = getAccessibleValue(el);
    const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true';

    treeNodes.push({
      ref: refId,
      role: role,
      name: name,
      value: value,
      disabled: disabled,
      type: el.type || null,
      tagName: el.tagName.toLowerCase(),
      bounding: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        w: Math.round(rect.width),
        h: Math.round(rect.height)
      }
    });
  });

  return {
    url: window.location.href,
    title: document.title,
    nodes: treeNodes,
    refCount: treeNodes.length
  };
}

export function getElementByRef(refId) {
  return currentRefMap.get(refId) || null;
}

function getImplicitRole(el) {
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case 'a': return 'link';
    case 'button': return 'button';
    case 'input':
      if (el.type === 'checkbox') return 'checkbox';
      if (el.type === 'radio') return 'radio';
      if (el.type === 'submit' || el.type === 'button') return 'button';
      return 'textbox';
    case 'textarea': return 'textbox';
    case 'select': return 'combobox';
    case 'iframe': return 'frame';
    default: return 'element';
  }
}

function getAccessibleName(el) {
  let name = el.getAttribute('aria-label') || '';
  if (name) return name.trim();

  const ariaLabelledBy = el.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const labelEl = document.getElementById(ariaLabelledBy);
    if (labelEl) return (labelEl.innerText || '').trim();
  }

  if (el.labels && el.labels.length > 0) {
    return (el.labels[0].innerText || '').trim();
  }

  if (el.placeholder) return el.placeholder.trim();
  if (el.alt) return el.alt.trim();
  if (el.title) return el.title.trim();

  // For buttons/links, return inner text
  if (el.innerText) return el.innerText.replace(/\s+/g, ' ').trim().substring(0, 100);

  return el.value || '';
}

function getAccessibleValue(el) {
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
    if (el.type === 'password') return '[SECURE_INPUT]';
    return el.value || '';
  }
  return null;
}
