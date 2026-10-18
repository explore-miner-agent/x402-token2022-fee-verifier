import type { ParsedIx, ParsedTx, Reason, TokenBalance, VerifyInput, VerifyResult } from './types.ts';

export const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const MEMO_PROGRAMS = new Set(['MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVmDTwH']);

const fail = (reason: Reason): VerifyResult => ({ ok: false, reason });
const isUint = (s: unknown): s is string => typeof s === 'string' && /^[0-9]+$/.test(s);
const keyAt = (tx: ParsedTx, i: number) => { const k = tx.transaction.message.accountKeys[i]; return typeof k === 'string' ? k : k?.pubkey; };
const expirySeconds = (e: string | number) => (typeof e === 'number' ? e : Math.floor(Date.parse(e) / 1000));

function allInstructions(tx: ParsedTx): ParsedIx[] {
  const inner = (tx.meta?.innerInstructions ?? []).flatMap((g) => g.instructions);
  return [...tx.transaction.message.instructions, ...inner];
}

/** Net change of `owner`'s balance in `mint`, summed over all its token accounts in the transaction. */
function netReceived(tx: ParsedTx, owner: string, mint: string): bigint {
  const sum = (list: TokenBalance[]) =>
    list.filter((b) => b.mint === mint && b.owner === owner).reduce((a, b) => a + BigInt(b.uiTokenAmount.amount), 0n);
  return sum(tx.meta?.postTokenBalances ?? []) - sum(tx.meta?.preTokenBalances ?? []);
}

/**
 * Verifies that `tx` pays at least `quote.amount` of the Token-2022 `mint` to `payee` before the quote expired.
 * Pure: the parsed transaction is passed in, nothing is fetched. The signature is added to `seen` only on success.
 * The amount checked is what the payee actually received (post minus pre balances), so a Token-2022 transfer fee
 * withheld by the mint cannot make a short payment pass.
 */
export function verifyKogFee({ tx, quote, payee, mint, seen }: VerifyInput): VerifyResult {
  if (!tx?.transaction?.signatures?.length || !tx.transaction.message || !Array.isArray(tx.transaction.message.instructions)) return fail('malformed_tx');
  if (!tx.meta) return fail('malformed_tx');
  if (tx.meta.err !== null && tx.meta.err !== undefined) return fail('failed_tx');
  const signature = tx.transaction.signatures[0];
  if (seen.has(signature)) return fail('replayed');
  if (quote.mint !== mint || quote.payee !== payee || !isUint(quote.amount)) return fail('quote_mismatch');

  const transfers = allInstructions(tx).filter((ix) => ix.parsed?.type === 'transferChecked' && ix.parsed.info?.mint === mint);
  if (transfers.length === 0) return fail('wrong_mint');
  if (transfers.some((ix) => ix.programId !== TOKEN_2022)) return fail('wrong_program');
  const balances = [...(tx.meta.postTokenBalances ?? []), ...(tx.meta.preTokenBalances ?? [])].filter((b) => b.mint === mint);
  if (balances.some((b) => b.programId && b.programId !== TOKEN_2022)) return fail('wrong_program');

  const ownerOf = new Map<string, string>();
  for (const b of balances) { const k = keyAt(tx, b.accountIndex); if (k && b.owner) ownerOf.set(k, b.owner); }
  const toPayee = transfers.filter((ix) => ownerOf.get(ix.parsed.info.destination) === payee);
  if (toPayee.length === 0) return fail('wrong_payee');

  const received = netReceived(tx, payee, mint);
  if (received < BigInt(quote.amount)) return { ok: false, reason: 'short_fee', received: received.toString() };

  if (tx.blockTime === null || tx.blockTime === undefined) return fail('no_block_time');
  const exp = expirySeconds(quote.expiresAt);
  if (!Number.isFinite(exp) || tx.blockTime > exp) return fail('expired_quote');

  if (quote.memo !== undefined) {
    const memos = allInstructions(tx).filter((ix) => MEMO_PROGRAMS.has(ix.programId)).map((ix) => (typeof ix.parsed === 'string' ? ix.parsed : ''));
    if (!memos.includes(quote.memo)) return fail('memo_missing');
  }
  seen.add(signature);
  return { ok: true, reason: 'ok', signature, received: received.toString() };
}
