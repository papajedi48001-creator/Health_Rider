// A rule violation the user can act on; routes answer it with its status and Thai message.
export class DomainError extends Error {
  constructor(message: string, readonly status: 404 | 409 | 422 | 503 = 422) {
    super(message);
  }
}
