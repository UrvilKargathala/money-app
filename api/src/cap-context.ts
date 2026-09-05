import { AsyncLocalStorage } from "node:async_hooks";
export const capContext = new AsyncLocalStorage<{ message?: string }>();
