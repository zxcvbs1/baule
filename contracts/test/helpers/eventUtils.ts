import { decodeEventLog } from 'viem';

export function getEventArgs(receipt, eventName, abi) {
  const log = receipt.logs.find(log => {
    try {
      const event = decodeEventLog({
        abi,
        data: log.data,
        topics: log.topics,
      });
      return event.eventName === eventName;
    } catch (e) {
      return false;
    }
  });

  if (!log) {
    throw new Error(`Event ${eventName} not found in transaction receipt`);
  }

  return decodeEventLog({
    abi,
    data: log.data,
    topics: log.topics,
  }).args;
}