/**
 * Interrupt & CAPTCHA Handler
 * Detects modal popups, cookie consent overlays, CAPTCHAs, and observes DOM stability safely.
 */

const INTERRUPT_BUTTON_PATTERNS = [
  /accept all/i,
  /accept cookies/i,
  /allow all/i,
  /allow cookies/i,
  /i agree/i,
  /agree & continue/i,
  /reject all/i,
  /decline all/i,
  /dismiss/i,
  /close banner/i,
  /accept/i,
  /agree/i,
  /allow/i,
  /got it/i,
  /dismiss/i,
  /close/i
];

// Track recently clicked buttons to avoid synthetic click spam
const recentlyClickedMap = new WeakMap();
const CLICK_COOLDOWN_MS = 3000;

export function checkAndDismissInterrupts() {
  // 1. CAPTCHA Detection Logic
  const captchaSelectors = [
    'iframe[src*="recaptcha" i]',
    'iframe[src*="hcaptcha" i]',
    'iframe[src*="turnstile" i]',
    'iframe[src*="challenges.cloudflare" i]',
    'iframe[title*="recaptcha" i]',
    'iframe[title*="hCaptcha" i]',
    '#g-recaptcha',
    '#hcaptcha'
  ];

  const captchas = document.querySelectorAll(captchaSelectors.join(', '));
  for (const c of captchas) {
    const rect = c.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const src = c.src || c.title || 'CAPTCHA Challenge';
      let provider = 'CAPTCHA';
      if (src.toLowerCase().includes('recaptcha')) provider = 'reCAPTCHA';
      if (src.toLowerCase().includes('hcaptcha')) provider = 'hCaptcha';
      if (src.toLowerCase().includes('turnstile') || src.toLowerCase().includes('cloudflare')) provider = 'Cloudflare Turnstile';

      return {
        captchaDetected: true,
        provider: provider,
        dismissed: false,
        count: 0
      };
    }
  }

  // 2. Precise Cookie & Modal Overlay Auto-Dismissal
  const modalSelectors = [
    '[class*="cookie" i]',
    '[class*="consent" i]',
    '[class*="gdpr" i]',
    '[class*="privacy-banner" i]',
    '[class*="cookie-banner" i]',
    '[id*="cookie" i]',
    '[id*="consent" i]',
    '[id*="gdpr" i]',
    '[role="dialog"]',
    '[aria-modal="true"]'
  ];

  let modals = Array.from(document.querySelectorAll(modalSelectors.join(', ')));

  // Add floating overlay detection (fixed/absolute positioned overlays containing cookie text)
  const floatingOverlays = document.querySelectorAll('div, section, aside');
  floatingOverlays.forEach((el) => {
    if (el.id === 'cookieBannerOverlay' || modals.includes(el)) return;
    const text = (el.innerText || '').toLowerCase();
    if (text.length < 500 && (text.includes('cookie') || text.includes('privacy consent') || text.includes('gdpr'))) {
      const style = window.getComputedStyle(el);
      if ((style.position === 'fixed' || style.position === 'absolute') && parseInt(style.zIndex || '0', 10) > 10) {
        modals.push(el);
      }
    }
  });

  let dismissedCount = 0;
  const now = Date.now();

  // Process container modals safely
  modals.forEach((modal) => {
    // Avoid hiding main layout elements (body, html, header, main, section wrappers)
    const tag = modal.tagName.toUpperCase();
    if (tag === 'BODY' || tag === 'HTML' || tag === 'HEADER' || tag === 'MAIN') return;

    const style = window.getComputedStyle(modal);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0) return;

    const buttons = modal.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"], .btn');
    let clickedInThisModal = false;

    for (const btn of buttons) {
      const text = (btn.innerText || btn.value || btn.getAttribute('aria-label') || '').trim();
      if (!text) continue;

      // Check click cooldown
      const lastClick = recentlyClickedMap.get(btn) || 0;
      if (now - lastClick < CLICK_COOLDOWN_MS) continue;

      const isMatch = INTERRUPT_BUTTON_PATTERNS.some((pattern) => pattern.test(text));

      if (isMatch) {
        recentlyClickedMap.set(btn, now);
        dispatchClick(btn);
        dismissedCount++;
        clickedInThisModal = true;
        break; // Stop after clicking the primary accept/dismiss button in this container
      }
    }

    // Safe Fallback: If no button matched or modal persists, hide ONLY specific floating overlays
    if (!clickedInThisModal && (modal.id === 'cookieBannerOverlay' || modal.classList.contains('overlay-box') || style.position === 'fixed')) {
      modal.style.setProperty('display', 'none', 'important');
      modal.style.setProperty('visibility', 'hidden', 'important');
      dismissedCount++;
    }
  });

  // 3. Specific Global Scan Fallback: Search buttons matching explicit cookie consent phrases
  const globalButtons = document.querySelectorAll('button, a[href="#"], [role="button"], .btn');
  globalButtons.forEach((btn) => {
    const text = (btn.innerText || btn.getAttribute('aria-label') || '').trim().toLowerCase();
    if (
      text.includes('accept all cookies') ||
      text.includes('accept cookies') ||
      text.includes('allow all cookies') ||
      text.includes('allow cookies')
    ) {
      const lastClick = recentlyClickedMap.get(btn) || 0;
      if (now - lastClick < CLICK_COOLDOWN_MS) return;

      const rect = btn.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        recentlyClickedMap.set(btn, now);
        dispatchClick(btn);
        dismissedCount++;
      }
    }
  });

  // Restore scrolling on document body if overlay locked overflow
  if (document.body.style.overflow === 'hidden') {
    document.body.style.overflow = 'auto';
  }
  if (document.documentElement.style.overflow === 'hidden') {
    document.documentElement.style.overflow = 'auto';
  }

  return { captchaDetected: false, dismissed: dismissedCount > 0, count: dismissedCount };
}

function dispatchClick(element) {
  try {
    element.focus();
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    element.click();
  } catch (e) {
    try { element.click(); } catch (err) {}
  }
}

export function waitForDomStability(timeoutMs = 3000) {
  return new Promise((resolve) => {
    let timer = null;
    let maxTimeoutTimer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (maxTimeoutTimer) clearTimeout(maxTimeoutTimer);
      try { observer.disconnect(); } catch (e) {}
    };

    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        cleanup();
        resolve({ stable: true });
      }, 300);
    });

    try {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false
      });
    } catch (e) {
      resolve({ stable: true, error: e.message });
      return;
    }

    maxTimeoutTimer = setTimeout(() => {
      cleanup();
      resolve({ stable: true, timedOut: true });
    }, timeoutMs);
  });
}

