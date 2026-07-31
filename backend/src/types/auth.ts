import type { Request } from 'express';

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
};

export type AuthedRequest = Request & {
  user: AuthUser;
};

/** Safe cast after `requireAuth` has attached `user`. */
export function asAuthed(req: Request): AuthedRequest {
  return req as unknown as AuthedRequest;
}
