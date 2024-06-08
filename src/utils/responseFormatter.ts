// src/utils/responseFormatter.ts

/**
 * Formats a success response.
 * @param data - The data to send in the response.
 * @param message - Optional message.
 * @returns An object structured as a standard API response.
 */
export const formatSuccessResponse = (data: any, message: string = 'Success') => ({
  status: 'success',
  message,
  data,
});

/**
 * Formats an error response.
 * @param message - The error message.
 * @param code - The status code associated with the error.
 * @returns An object structured as a standard API error response.
 */
export const formatErrorResponse = (message: string, code: number) => ({
  status: 'error',
  message,
  code,
});
