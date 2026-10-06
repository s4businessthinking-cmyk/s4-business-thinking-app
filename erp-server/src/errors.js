// Codes mirror Firestore/Firebase Auth so the client shim can surface the same error.code values.
const STATUS = {
  "invalid-argument": 400,
  unauthenticated: 401,
  "permission-denied": 403,
  "not-found": 404,
  "already-exists": 409,
  aborted: 409,
  "resource-exhausted": 429,
  internal: 500,
  unavailable: 503,
};

export class ApiError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
    this.status = STATUS[code] || 400;
  }
}

export const fail = (code, message) => {
  throw new ApiError(code, message);
};
