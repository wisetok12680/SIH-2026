/**
 * Client-Side Privacy & PII Filter
 * Redacts sensitive personal information locally before sending DOM structural maps to AI models.
 */

const PII_PATTERNS = [
  // Email addresses
  { type: 'REDACTED_EMAIL', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  
  // Phone numbers (International & Indian formats)
  { type: 'REDACTED_PHONE', regex: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g },

  // Credit Card Numbers (Visa, Mastercard, Amex, Discover, RuPay)
  { type: 'REDACTED_CARD', regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g },

  // US SSN
  { type: 'REDACTED_SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/g },

  // Indian PAN Card
  { type: 'REDACTED_PAN', regex: /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g },

  // Indian Aadhaar Number
  { type: 'REDACTED_AADHAAR', regex: /\b[2-9]{1}\d{3}\s?\d{4}\s?\d{4}\b/g },

  // Generic JWT / Bearer API Tokens & Secret Keys
  { type: 'REDACTED_TOKEN', regex: /\b(eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}|sk_live_[0-9a-zA-Z]{24}|ghp_[0-9a-zA-Z]{36}|AKIA[0-9A-Z]{16})\b/g },

  // Indian GSTIN / Tax Identification
  { type: 'REDACTED_TAX_ID', regex: /\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}\b/g },

  // Passport Numbers (Standard US & Indian format)
  { type: 'REDACTED_PASSPORT', regex: /\b[A-PR-WYa-pr-wy][0-9]{7}\b/g },

  // Driver License Numbers (US/Indian standard)
  { type: 'REDACTED_DL', regex: /\b[A-Z]{2}[-0-9]{10,14}\b/g },

  // Medical Notes & Diagnosis Identifiers (ICD-10 & Medical records)
  { type: 'REDACTED_MEDICAL', regex: /\b(?:ICD-[0-9]{2}|RX-[0-9]{6,}|Diagnosis:\s*[^;\n\r,]+|Medical History:\s*[^;\n\r,]+)\b/gi }
];

export function redactText(text) {
  if (!text || typeof text !== 'string') return text;

  let sanitizedText = text;
  PII_PATTERNS.forEach(({ type, regex }) => {
    sanitizedText = sanitizedText.replace(regex, `[${type}]`);
  });

  return sanitizedText;
}

export function redactLayoutMap(layoutData) {
  if (!layoutData || !Array.isArray(layoutData.elements)) return layoutData;

  const redactedElements = layoutData.elements.map((item) => {
    let sanitizedText = redactText(item.text);

    // Additional safety: Mask password field values unconditionally
    if (item.type === 'password') {
      sanitizedText = '[REDACTED_PASSWORD]';
    }

    return {
      ...item,
      text: sanitizedText
    };
  });

  return {
    ...layoutData,
    elements: redactedElements
  };
}
