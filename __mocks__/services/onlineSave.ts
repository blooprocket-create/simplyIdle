export function isOnlineSaveAvailable() {
  return false;
}
export async function loadOnlineSave() {
  return { status: 'no-auth' as const };
}
export async function writeOnlineSave() {
  return { status: 'no-auth' as const };
}
