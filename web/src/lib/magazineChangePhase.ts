export const MC_STATUS_CODES = {
  NO_CLIENT: '0000',
  WAIT_ORDER: '0001',
  DISPENSING: '0010',
  FINISHED: '0011',
  MAG_CHANGE: '0100',
  CALIBRATING: '0101',
} as const;

export type MagChangeUiPhase =
  | 'WAIT_START'
  | 'CALIBRATING'
  | 'CONFIRM_INSERT'
  | 'NONE';

export function getMagChangeUiPhase(
  mcStatusData: {
    status_bin?: unknown;
    warte_auf_magazin_einsetzen?: unknown;
  } | null
): MagChangeUiPhase {
  const statusBin =
    typeof mcStatusData?.status_bin === 'string' ? mcStatusData.status_bin : null;
  const waitFlag = mcStatusData?.warte_auf_magazin_einsetzen;
  const waitingForInsert = waitFlag === 1 || waitFlag === true;

  if (statusBin === MC_STATUS_CODES.CALIBRATING) return 'CALIBRATING';
  if (statusBin === MC_STATUS_CODES.MAG_CHANGE) {
    return waitingForInsert ? 'CONFIRM_INSERT' : 'WAIT_START';
  }
  return 'NONE';
}
