/**
 * Validates if a phone number is in a correct format (7 to 15 digits).
 * Allows spaces, dashes, parentheses, and an optional leading '+'.
 */
export function isValidPhone(phone: string | null | undefined): boolean {
  if (!phone) return true; // Optional fields are valid when empty
  const trimmed = phone.trim();
  if (trimmed === '') return true;

  // Format check
  const formatRegex = /^\+?[0-9\s\-()]+$/;
  if (!formatRegex.test(trimmed)) return false;

  // Digits count check
  const digitsOnly = trimmed.replace(/[^0-9]/g, '');
  return digitsOnly.length >= 7 && digitsOnly.length <= 15;
}

/**
 * Filter input to only allow phone-related characters:
 * digits, spaces, dashes, parentheses, and a single leading '+'
 */
export function sanitizePhoneInput(val: string): string {
  // Replace anything that is not +, digit, space, dash, or parenthesis
  let sanitized = val.replace(/[^\+0-9\s\-()]/g, '');
  
  // Ensure '+' can only appear at the very beginning
  if (sanitized.includes('+')) {
    const hasLeadingPlus = sanitized.startsWith('+');
    sanitized = sanitized.replace(/\+/g, '');
    if (hasLeadingPlus) {
      sanitized = '+' + sanitized;
    }
  }
  
  return sanitized;
}

/**
 * Helper to block non-numeric character entry on keydown in inputs.
 * Allows control keys (Backspace, Tab, Delete, arrows, Copy/Paste/Cut commands).
 */
export function restrictNumericKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
  // Allow navigation/editing keys
  if (
    [46, 8, 9, 27, 13].includes(e.keyCode) || // Backspace, Delete, Tab, Escape, Enter
    (e.ctrlKey === true || e.metaKey === true) || // Allow copy/paste/all shortcuts
    (e.keyCode >= 35 && e.keyCode <= 40) // Home, End, Arrows
  ) {
    return;
  }
  
  // Block any non-numeric key presses
  const isNumberKey = (e.keyCode >= 48 && e.keyCode <= 57); // Main keyboard digits
  const isNumpadKey = (e.keyCode >= 96 && e.keyCode <= 105); // Numpad digits
  
  if (!isNumberKey && !isNumpadKey) {
    e.preventDefault();
  }
}
