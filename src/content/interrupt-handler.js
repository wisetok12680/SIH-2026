/**
 * Interrupt & CAPTCHA Handler
 * Detects modal popups, cookie consent overlays, CAPTCHAs, and observes DOM stability.
 */

const INTERRUPT_BUTTON_PATTERNS = [
  /accept/i,
  /agree/i,
  /allow all/i,
  /i accept/i,
  /i agree/i,
  /got it/i,
  /dismiss/i,
  /close/i,
  /reject non-essential/i,
  /continue to site/i
];

export function checkAndDismissInterrupts() {
  // 1. CAPTCHA Detection Logic
  const captchaSelectors = [
    'iframe[src*="recaptcha"]',
    'iframe[src*="hcaptcha"]',
    'iframe[src*="turnstile"]',
    'iframe[src*="challenges.cloudflare"]',
    'iframe[title*="recaptcha"]',
    'iframe[title*="hCaptcha"]',
    '#g-recaptcha',
    '#hcaptcha'
  ];

  const captchas = document.querySelectorAll(captchaSelectors.join(', '));
  for (const c of captchas) {
    const rect = c.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const src = c.src || c.title || 'CAPTCHA Challenge';
      let provider = 'CAPTCHA';
      if (src.includes('recaptcha')) provider = 'reCAPTCHA';
      if (src.includes('hcaptcha')) provider = 'hCaptcha';
      if (src.includes('turnstile') || src.includes('cloudflare')) provider = 'Cloudflare Turnstile';

      return {
        captchaDetected: true,
        provider: provider,
        dismissed: false,
        count: 0
      };
    }
  }

  // 2. Cookie Overlay & Modal Auto-Dismissal
  const modalSelectors = [
    '[class*="modal"]',
    '[class*="popup"]',
    '[class*="cookie"]',
    '[class*="consent"]',
    '[id*="modal"]',
    '[id*="cookie"]',
    '[id*="consent"]',
    '[role="dialog"]',
    '[aria-modal="true"]'
  ];

  const modals = document.querySelectorAll(modalSelectors.join(', '));
  let dismissedCount = 0;

  modals.forEach((modal) => {
    const style = window.getComputedStyle(modal);
    if (style.display === 'none' || style.visibility === 'hidden') return;

    const buttons = modal.querySelectorAll('button, a, [role="button"]');
    buttons.forEach((btn) => {
      const text = (btn.innerText || btn.ariaLabel || '').trim();
      const isMatch = INTERRUPT_BUTTON_PATTERNS.some((pattern) => pattern.test(text));

      if (isMatch) {
        btn.click();
        dismissedCount++;
      }
    });
  });

  return { captchaDetected: false, dismissed: dismissedCount > 0, count: dismissedCount };
}

export function waitForDomStability(timeoutMs = 3000) {
  return new Promise((resolve) => {
    let timer = null;

    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        observer.disconnect();
        resolve({ stable: true });
      }, 300);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    });

    setTimeout(() => {
      observer.disconnect();
      resolve({ stable: true, timedOut: true });
    }, timeoutMs);
  });
}
