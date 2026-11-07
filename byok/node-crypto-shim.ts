/** Build-time stand-in for Node's `crypto` import inside @ag-ui/a2ui-middleware. */
export const randomUUID = (): string => globalThis.crypto.randomUUID();
