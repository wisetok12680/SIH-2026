/**
 * DOM Physical Layout Extractor
 * Parses the visible DOM and extracts bounding boxes and metadata for machine reasoning.
 */

export function extractPhysicalLayoutMap() {
  const selector = [
    'a[href]',
    'button',
    'input',
    'textarea',
    'select',
    '[role="button"]',
    '[role="link"]',
    '[role="checkbox"]',
    '[role="searchbox"]',
    '[role="textbox"]',
    '[onclick]',
    '[tabindex]:not([tabindex="-1"])',
    'canvas',
    'img',
    'h1, h2, h3, h4',
    'p',
    'label'
  ].join(', ');

  const elements = document.querySelectorAll(selector);
  const layoutMap = [];
  let idCounter = 0;

  const scrollX = window.scrollX || window.pageXOffset || 0;
  const scrollY = window.scrollY || window.pageYOffset || 0;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

  elements.forEach((el) => {
    const rect = el.getBoundingClientRect();

    // 1. Element Filtering: Ignore elements with 0 width/height or hidden visibility
    if (rect.width <= 0 || rect.height <= 0) return;

    // Viewport check (only include elements partially inside or visible in viewport)
    if (
      rect.bottom < 0 ||
      rect.right < 0 ||
      rect.top > viewportHeight ||
      rect.left > viewportWidth
    ) {
      return;
    }

    const style = window.getComputedStyle(el);
    if (
      style.visibility === 'hidden' ||
      style.display === 'none' ||
      parseFloat(style.opacity || '1') === 0
    ) {
      return;
    }

    // Extract text content cleanly
    let rawText = '';
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      rawText = el.value || el.placeholder || el.getAttribute('aria-label') || '';
    } else {
      rawText = el.innerText || el.ariaLabel || el.getAttribute('title') || el.alt || '';
    }

    // Clean whitespace
    const text = rawText.replace(/\s+/g, ' ').trim().substring(0, 150);

    // Build standardized layout item
    const mapItem = {
      id: `el_${idCounter++}`,
      tagName: el.tagName.toUpperCase(),
      type: el.type ? el.type.toLowerCase() : null,
      text: text,
      x: Math.round(rect.left + scrollX),
      y: Math.round(rect.top + scrollY),
      viewportX: Math.round(rect.left),
      viewportY: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      isInteractive: isElementInteractive(el),
      selector: getUniqueCssSelector(el),
      source: 'dom'
    };

    layoutMap.push(mapItem);
  });

  return {
    viewport: { width: viewportWidth, height: viewportHeight, scrollX, scrollY },
    url: window.location.href,
    title: document.title,
    elements: layoutMap
  };
}

function isElementInteractive(el) {
  const interactiveTags = ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'A'];
  if (interactiveTags.includes(el.tagName)) return true;
  if (el.getAttribute('role') || el.getAttribute('onclick')) return true;
  return false;
}

function getUniqueCssSelector(el) {
  if (el.id) return `#${CSS.escape(el.id)}`;
  if (el.name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
  
  let path = [];
  while (el && el.nodeType === Node.ELEMENT_NODE) {
    let selector = el.tagName.toLowerCase();
    if (el.id) {
      selector += `#${CSS.escape(el.id)}`;
      path.unshift(selector);
      break;
    } else {
      let sibling = el;
      let nth = 1;
      while (sibling.previousElementSibling) {
        sibling = sibling.previousElementSibling;
        if (sibling.tagName === el.tagName) nth++;
      }
      if (nth !== 1) selector += `:nth-of-type(${nth})`;
    }
    path.unshift(selector);
    el = el.parentElement;
  }
  return path.join(' > ');
}
