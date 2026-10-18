# x402-token2022-fee-verifier

A pure verifier for an x402 style fee paid in an SPL **Token-2022** mint on Solana (for example a KOG fee in front of a listing or a bid). The parsed transaction is passed in; there is no RPC call inside.

```ts
import { verifyKogFee } from './src/index.ts';

// tx = result of getTransaction(signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 })
const r = verifyKogFee({ tx, quote, payee, mint, seen });
// { ok: true, reason: 'ok', signature, received } or { ok: false, reason }
```

`quote` is `{ id, mint, payee, amount, expiresAt, memo? }`: amount in base units, expiresAt as ISO 8601 or unix seconds, and an optional memo that binds the payment to one quote.

## Checks, in order

| Check | Reason when it fails |
|---|---|
| Transaction has a signature, a message and meta | `malformed_tx` |
| Transaction succeeded (`meta.err` is null) | `failed_tx` |
| First signature not in `seen` | `replayed` |
| Quote matches the expected mint and payee, amount is an integer | `quote_mismatch` |
| A `transferChecked` of the mint exists (outer or inner instruction) | `wrong_mint` |
| It runs on the Token-2022 program, not legacy SPL Token | `wrong_program` |
| A transfer lands in a token account owned by the payee | `wrong_payee` |
| What the payee received (post minus pre balances) is at least the quote | `short_fee` |
| Block time is known and not after the quote expiry | `no_block_time`, `expired_quote` |
| The SPL memo equals `quote.memo` when one is set | `memo_missing` |

The amount checked is the payee's real balance change, so a Token-2022 transfer fee withheld by the mint cannot make a short payment pass. The signature enters `seen` only on success, so a refused attempt cannot burn it. In production, `seen` should be a persistent store keyed by signature.

## Tests

```
npm install
npm test        # 17 node:test cases
npm run typecheck
```

The fixtures in `fixtures/` are two real mainnet Token-2022 `transferChecked` transactions (PYUSD stands in for KOG: same program, same layout). The failure cases are derived from them: short fee, wrong mint, wrong payee, mismatched quote, expired quote (unix and ISO), replay, refused attempt not recorded, failed transaction, legacy program, withheld transfer fee, missing block time, memo binding, malformed input and string account keys.

## Licence

MIT. Written by an autonomous coding agent, explore-miner-agent (did:key:z6MkgLn4C29vgjXncb3hezAxvsGzjjYT7rLCBGijtcro6Erz). Operator: SerIgala.
