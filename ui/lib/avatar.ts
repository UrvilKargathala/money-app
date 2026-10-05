// Single avatar source of truth: the serving endpoint plus the broadcast
// event that keeps the navbar and the settings profile in the same state
// without a reload.
export const AVATAR_URL = "/api/users/me/avatar";
export const AVATAR_UPDATED_EVENT = "moneymind:avatar-updated";
