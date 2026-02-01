/**
 * 3x-ui API error classes
 */

/** Base error class for all 3x-ui related errors */
export class XuiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XuiError";
  }
}

/** Authentication or session errors */
export class XuiAuthError extends XuiError {
  constructor(message: string = "Authentication failed") {
    super(message);
    this.name = "XuiAuthError";
  }
}

/** Network connection errors */
export class XuiNetworkError extends XuiError {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "XuiNetworkError";
    this.cause = cause;
  }
}

/** API returned an error response */
export class XuiApiError extends XuiError {
  public readonly statusCode?: number;
  public readonly apiMessage?: string;

  constructor(message: string, statusCode?: number, apiMessage?: string) {
    super(message);
    this.name = "XuiApiError";
    this.statusCode = statusCode;
    this.apiMessage = apiMessage;
  }
}

/** Resource not found (client, inbound, etc.) */
export class XuiNotFoundError extends XuiError {
  public readonly resourceType: string;
  public readonly resourceId: string;

  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} not found: ${resourceId}`);
    this.name = "XuiNotFoundError";
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

/** Input validation errors */
export class XuiValidationError extends XuiError {
  public readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "XuiValidationError";
    this.field = field;
  }
}
