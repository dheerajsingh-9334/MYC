/**
 * Validates a phone number/WhatsApp number.
 * Allows digits, spaces, dashes, parentheses, and an optional leading '+'.
 * The total number of digits must be between 7 and 15.
 * Optional fields (empty/null/undefined) are considered valid.
 */
export function validatePhone(phone: any): boolean {
  if (phone === undefined || phone === null) return true;
  const str = String(phone).trim();
  if (str === '') return true;
  
  // Format check: only allow digits, spaces, dashes, parentheses, and optional leading +
  const formatRegex = /^\+?[0-9\s\-()]+$/;
  if (!formatRegex.test(str)) return false;

  // Length check: ensure total digits is between 7 and 15
  const digitsOnly = str.replace(/[^0-9]/g, '');
  return digitsOnly.length >= 7 && digitsOnly.length <= 15;
}

/**
 * Validates SLA days.
 * Must be a positive integer (greater than or equal to 1).
 */
export function validateSlaDays(days: any): boolean {
  if (days === undefined || days === null) return false;
  const num = Number(days);
  return Number.isInteger(num) && num >= 1;
}
