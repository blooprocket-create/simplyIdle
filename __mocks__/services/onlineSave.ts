export function isOnlineSaveAvailable() {
  return false;
}
export async function loadOnlineSave(_saveSlot?: string, _onProgress?: unknown) {
  return { status: 'no-auth' as const };
}
export async function writeOnlineSave() {
  return { status: 'no-auth' as const };
}
