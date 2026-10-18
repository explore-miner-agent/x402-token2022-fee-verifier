import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyKogFee } from '../src/index.ts';

// Recorded mainnet fixture: a real Token-2022 transferChecked (PYUSD stands in for KOG; same program, same layout).
const tx = JSON.parse(readFileSync(new URL('../fixtures/pyusd_transfer_0.json', import.meta.url), 'utf8'));
const tx2 = JSON.parse(readFileSync(new URL('../fixtures/pyusd_transfer_1.json', import.meta.url), 'utf8'));
const MINT = '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo';
const PAYEE = 'Hg9dpcEmhbhVKy3iGmsPLvBzXnBRWzPsyvF117hdo7Fa';
const OTHER = 'JbvjcKqvsjE5p6MyQMidTYLMtBUJc45Kja6fUCRp8Wy';
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const quote = { id: 'q1', mint: MINT, payee: PAYEE, amount: '4990000', expiresAt: tx.blockTime + 60 };
const run = (o: any = {}) => verifyKogFee({ tx, quote, payee: PAYEE, mint: MINT, seen: new Set(), ...o });

test('right fee passes and records the signature', () => {
  const seen = new Set<string>();
  const r = run({ seen });
  assert.equal(r.ok, true); assert.equal(r.reason, 'ok'); assert.equal(r.received, '4990000');
  assert.ok(seen.has(tx.transaction.signatures[0]));
});
test('a second recorded transfer also passes', () => {
  const payee2 = tx2.meta.postTokenBalances.find((b: any) => b.mint === MINT && BigInt(b.uiTokenAmount.amount) > BigInt(tx2.meta.preTokenBalances.find((p: any) => p.accountIndex === b.accountIndex)?.uiTokenAmount.amount ?? '0')).owner;
  const r = verifyKogFee({ tx: tx2, quote: { ...quote, payee: payee2, expiresAt: new Date((tx2.blockTime + 1) * 1000).toISOString() }, payee: payee2, mint: MINT, seen: new Set() });
  assert.equal(r.reason, 'ok');
});
test('fee above the quote passes', () => assert.equal(run({ quote: { ...quote, amount: '1000000' } }).reason, 'ok'));
test('short fee is refused', () => {
  const r = run({ quote: { ...quote, amount: '4990001' } });
  assert.equal(r.reason, 'short_fee'); assert.equal(r.received, '4990000');
});
test('wrong mint is refused', () => {
  const m = 'KoG1111111111111111111111111111111111111111';
  assert.equal(run({ mint: m, quote: { ...quote, mint: m } }).reason, 'wrong_mint');
});
test('wrong payee is refused', () => assert.equal(run({ payee: OTHER, quote: { ...quote, payee: OTHER } }).reason, 'wrong_payee'));
test('quote not matching the expected mint or payee is refused', () => {
  assert.equal(run({ quote: { ...quote, payee: OTHER } }).reason, 'quote_mismatch');
  assert.equal(run({ quote: { ...quote, mint: 'x' } }).reason, 'quote_mismatch');
  assert.equal(run({ quote: { ...quote, amount: '-5' } }).reason, 'quote_mismatch');
});
test('expired quote is refused (unix and ISO)', () => {
  assert.equal(run({ quote: { ...quote, expiresAt: tx.blockTime - 1 } }).reason, 'expired_quote');
  assert.equal(run({ quote: { ...quote, expiresAt: new Date((tx.blockTime - 1) * 1000).toISOString() } }).reason, 'expired_quote');
  assert.equal(run({ quote: { ...quote, expiresAt: 'not a date' } }).reason, 'expired_quote');
  assert.equal(run({ quote: { ...quote, expiresAt: tx.blockTime } }).reason, 'ok');
});
test('replayed signature is refused', () => {
  const seen = new Set<string>();
  assert.equal(run({ seen }).ok, true);
  assert.equal(run({ seen }).reason, 'replayed');
});
test('a refused attempt does not record the signature', () => {
  const seen = new Set<string>();
  run({ seen, quote: { ...quote, amount: '9999999999' } });
  assert.equal(seen.size, 0);
});
test('failed transaction is refused', () => {
  const t = clone(tx); t.meta.err = { InstructionError: [2, 'Custom'] };
  assert.equal(run({ tx: t }).reason, 'failed_tx');
});
test('legacy SPL Token program is refused', () => {
  const t = clone(tx); t.transaction.message.instructions[2].programId = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  assert.equal(run({ tx: t }).reason, 'wrong_program');
  const t2 = clone(tx); t2.meta.postTokenBalances[0].programId = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  assert.equal(run({ tx: t2 }).reason, 'wrong_program');
});
test('transfer fee withheld by the mint makes the payment short', () => {
  const t = clone(tx); t.meta.postTokenBalances[0].uiTokenAmount.amount = String(BigInt(t.meta.preTokenBalances[0].uiTokenAmount.amount) + 4_900_000n);
  assert.equal(run({ tx: t }).reason, 'short_fee');
});
test('missing block time is refused', () => { const t = clone(tx); t.blockTime = null; assert.equal(run({ tx: t }).reason, 'no_block_time'); });
test('memo binding', () => {
  assert.equal(run({ quote: { ...quote, memo: 'kognai:q1' } }).reason, 'memo_missing');
  const t = clone(tx); t.transaction.message.instructions.push({ program: 'spl-memo', programId: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', parsed: 'kognai:q1' });
  assert.equal(run({ tx: t, quote: { ...quote, memo: 'kognai:q1' } }).reason, 'ok');
});
test('malformed transactions are refused', () => {
  for (const t of [{}, { transaction: { signatures: [], message: { instructions: [] } }, meta: {} }, { ...clone(tx), meta: null }]) {
    assert.equal(run({ tx: t }).reason, 'malformed_tx');
  }
});
test('string account keys are supported', () => {
  const t = clone(tx); t.transaction.message.accountKeys = t.transaction.message.accountKeys.map((k: any) => k.pubkey);
  assert.equal(run({ tx: t }).reason, 'ok');
});
