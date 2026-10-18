/** Subset of a `getTransaction(sig, {encoding: 'jsonParsed'})` result that the verifier reads. */
export interface ParsedTx {
  slot?: number;
  blockTime: number | null;
  meta: {
    err: unknown;
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
    innerInstructions?: { index: number; instructions: ParsedIx[] }[] | null;
  } | null;
  transaction: { signatures: string[]; message: { accountKeys: ({ pubkey: string } | string)[]; instructions: ParsedIx[] } };
}
export interface TokenBalance { accountIndex: number; mint: string; owner?: string; programId?: string; uiTokenAmount: { amount: string } }
export interface ParsedIx { program?: string; programId: string; parsed?: any }
export interface Quote {
  id: string;
  mint: string;
  payee: string; // wallet that must receive the fee (owner of the destination token account)
  amount: string; // base units, decimal string
  expiresAt: string | number; // ISO 8601 or unix seconds; the payment block time must not be later
  memo?: string; // when set, the transaction must carry this exact SPL memo (binds the payment to the quote)
}
export type Reason =
  | 'ok' | 'malformed_tx' | 'failed_tx' | 'replayed' | 'quote_mismatch' | 'wrong_program'
  | 'wrong_mint' | 'wrong_payee' | 'short_fee' | 'no_block_time' | 'expired_quote' | 'memo_missing';
export interface VerifyInput { tx: ParsedTx; quote: Quote; payee: string; mint: string; seen: Set<string> }
export interface VerifyResult { ok: boolean; reason: Reason; signature?: string; received?: string }
