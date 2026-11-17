import type { Tag } from "../models/tag";

const ADDRESS = /^[A-Za-z0-9_-]{43}$/;
const ATOMIC = /^(0|[1-9]\d*)$/;

/** What an AO `Transfer` message moves, read from its own signed target and tags. */
export interface AoTransferMessage {
  /** The token process the message is sent to. */
  processId: string;
  recipient: string;
  /** Atomic units. */
  quantity: string;
}

/**
 * How a data item reads as an AO token transfer. `unreadable` is one that
 * looks like a transfer (an `action` tag of `transfer`, in any case) but
 * has no single clean reading, so it must be shown as the plain data item
 * it is, with a warning, rather than as something that moves nothing.
 */
export type AoTransferMessageReading = ({ kind: "transfer" } & AoTransferMessage) | { kind: "unreadable" };

/**
 * Reads a data item as an AO token transfer, or `null` when it doesn't look
 * like one at all. A clean read matches `Action`, `Recipient` and
 * `Quantity` exactly, since legacy aos matches them case-sensitively; a
 * HyperBEAM-hosted token lowercases keys, so a recased item still counts
 * as unreadable rather than as no transfer. A name given twice, in any
 * case, is unreadable too: a process could act on either copy. So is a
 * body riding on the item (`dataSize` above zero, when the caller knows
 * it): the L1 reader treats data on a transfer the same way, since the
 * item the user signs carries that second payload to the token process
 * while the transfer headline says nothing about it.
 */
export function readAoTransferMessage(item: {
  target: string | null | undefined;
  tags: readonly Tag[];
  /** The item's data length in bytes, when the caller has it; a transfer carrying any is unreadable. */
  dataSize?: number;
}): AoTransferMessageReading | null {
  if (!item.target || !ADDRESS.test(item.target)) return null;
  const looksLikeTransfer = item.tags.some(
    (tag) => tag.name.toLowerCase() === "action" && tag.value.toLowerCase() === "transfer",
  );
  if (!looksLikeTransfer) return null;
  if (item.dataSize !== undefined && item.dataSize > 0) return { kind: "unreadable" };
  const only = (name: string): string | null => {
    const matches = item.tags.filter((tag) => tag.name === name);
    return matches.length === 1 ? matches[0]!.value : null;
  };
  const once = (name: string) => item.tags.filter((tag) => tag.name.toLowerCase() === name).length === 1;
  const recipient = only("Recipient");
  const quantity = only("Quantity");
  if (
    !once("action") ||
    !once("recipient") ||
    !once("quantity") ||
    only("Action") !== "Transfer" ||
    recipient === null ||
    !ADDRESS.test(recipient) ||
    quantity === null ||
    !ATOMIC.test(quantity)
  ) {
    return { kind: "unreadable" };
  }
  return { kind: "transfer", processId: item.target, recipient, quantity };
}
