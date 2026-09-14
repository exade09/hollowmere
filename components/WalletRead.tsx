'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * What you hold, read off the chain.
 *
 * Two ways in, and they end in the same place: paste an address, or connect a
 * wallet so the browser hands one over. Connecting is a convenience for
 * getting forty characters out of an extension — nothing more happens. The
 * only method ever called on the wallet is eth_requestAccounts, there is no
 * signature request, no transaction, no approval, and no key: everything after
 * that point is a public read of a public address that would work exactly the
 * same if it had been typed in by hand.
 *
 * Wallets are discovered through EIP-6963 rather than by grabbing
 * window.ethereum. With two extensions installed — and MetaMask and Rabby
 * together is the common case — that single global holds whichever one won the
 * race to inject, so a button labelled MetaMask would open Rabby often enough
 * to be a bug. The announcement protocol lets each extension name itself, so
 * the buttons say what they will actually open. window.ethereum stays as a
 * fallback for anything that has not implemented the protocol.
 *
 * The figures come from /api/wallet, which costs rpc calls and no model
 * tokens, so they appear immediately. Only "ask him to read it" spends
 * anything, and it is a separate press.
 */

type Eip1193 = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};
type ProviderInfo = { uuid: string; name: string; icon?: string; rdns: string };
type Announced = { info: ProviderInfo; provider: Eip1193 };

type Position = {
  token: string;
  name?: string;
  symbol?: string;
  balance?: number;
  sharePct?: number;
  received: number;
  sent: number;
  minted?: boolean;
};

type Report = {
  ok: boolean;
  address: string;
  isContract?: boolean;
  delegatedTo?: string;
  native?: number;
  txCount?: number;
  positionsFrom?: 'explorer' | 'logs';
  complete?: boolean;
  positionsFound?: number;
  window?: {
    blocks: number;
    transfers: number;
    tokensTouched: number;
    tokensRead: number;
  };
  positions?: Position[];
  note?: string;
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** The two the visitor is most likely to have, in front. */
const PREFERRED = ['io.metamask', 'io.rabby'];

function short(a: string) {
  return a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** Same rule as the spoken reading: a share too small to show is not zero. */
function share(p: Position) {
  if (typeof p.sharePct !== 'number') return '—';
  if (p.sharePct === 0 && (p.balance || 0) > 0) return '<0.01%';
  return `${p.sharePct}%`;
}

function amount(n: number | undefined) {
  if (typeof n !== 'number') return '—';
  if (n === 0) return '0';
  // Whole tokens for anything big, three places for dust, so a balance of
  // 0.004 does not render as zero and look like a bug.
  if (n >= 1) return n.toLocaleString('en-GB', { maximumFractionDigits: 2 });
  return n.toLocaleString('en-GB', { maximumFractionDigits: 3 });
}

export default function WalletRead() {
  const [found, setFound] = useState<Announced[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'read' | 'connect' | 'ask' | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [note, setNote] = useState('');
  const [said, setSaid] = useState('');

  /* --------------------------------------------------- discovering wallets */

  useEffect(() => {
    const seen = new Map<string, Announced>();
    const onAnnounce = (e: Event) => {
      const detail = (e as CustomEvent<Announced>).detail;
      if (!detail?.info?.rdns || !detail.provider) return;
      seen.set(detail.info.rdns, detail);
      setFound(
        [...seen.values()].sort((a, b) => {
          const rank = (r: string) => {
            const i = PREFERRED.indexOf(r);
            return i === -1 ? PREFERRED.length : i;
          };
          return rank(a.info.rdns) - rank(b.info.rdns);
        }),
      );
    };
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    return () => window.removeEventListener('eip6963:announceProvider', onAnnounce);
  }, []);

  /* --------------------------------------------------------- the reading */

  const load = useCallback(async (address: string) => {
    setBusy('read');
    setNote('');
    setSaid('');
    try {
      const r = await fetch(`/api/wallet?address=${address}`, { cache: 'no-store' });
      const j = (await r.json()) as { report?: Report; error?: string; note?: string };
      if (!r.ok || !j.report) {
        setReport(null);
        setNote(j.error === 'slower' ? 'slower. one at a time' : j.error || 'it could not be read');
        return;
      }
      setReport(j.report);
      if (j.report.note) setNote(j.report.note);
    } catch {
      setReport(null);
      setNote('the stone is quiet. try again');
    } finally {
      setBusy(null);
    }
  }, []);

  const connect = async (a: Announced | null) => {
    setBusy('connect');
    setNote('');
    try {
      const provider =
        a?.provider ||
        ((window as unknown as { ethereum?: Eip1193 }).ethereum as Eip1193 | undefined);
      if (!provider) {
        setNote('no wallet in this browser. paste the address instead');
        return;
      }
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as unknown;
      const first = Array.isArray(accounts) ? String(accounts[0] || '') : '';
      if (!ADDRESS.test(first)) {
        setNote('it gave nothing back. paste the address instead');
        return;
      }
      setDraft(first);
      await load(first.toLowerCase());
    } catch (e) {
      // A refused connection is the visitor changing their mind, not an error.
      const msg = String((e as { message?: string })?.message || e);
      setNote(/reject|denied|4001/i.test(msg) ? 'you closed it. nothing was read' : 'that did not open');
    } finally {
      setBusy((b) => (b === 'connect' ? null : b));
    }
  };

  const ask = async () => {
    if (!report) return;
    setBusy('ask');
    setSaid('');
    try {
      const r = await fetch('/api/wick', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: `read this wallet: ${report.address}`, history: [] }),
      });
      const j = (await r.json()) as { text?: string };
      setSaid(j.text || 'not tonight.\n\nthe words will not come');
    } catch {
      setSaid('the mirror went dark.\n\ntry again');
    } finally {
      setBusy(null);
    }
  };

  const typed = draft.trim();
  const canRead = ADDRESS.test(typed) && busy !== 'read';
  const positions = report?.positions || [];
  const held = positions.filter((p) => (p.balance || 0) > 0);
  const passed = positions.filter((p) => !((p.balance || 0) > 0));

  return (
    <div className="ledger">
      <form
        className="ledger-ask"
        onSubmit={(e) => {
          e.preventDefault();
          if (canRead) void load(typed.toLowerCase());
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="paste a wallet address"
          aria-label="wallet address"
          spellCheck={false}
          maxLength={64}
        />
        <button className="btn primary" type="submit" disabled={!canRead}>
          {busy === 'read' ? 'reading' : 'read it'}
        </button>
      </form>

      <div className="ledger-wallets">
        <span className="label-sm">or let the browser tell me</span>
        {found.map((a) => (
          <button
            key={a.info.rdns}
            className="chrome-btn"
            onClick={() => void connect(a)}
            disabled={!!busy}
          >
            {a.info.name}
          </button>
        ))}
        {!found.length && (
          <button className="chrome-btn" onClick={() => void connect(null)} disabled={!!busy}>
            {busy === 'connect' ? 'waiting' : 'connect a wallet'}
          </button>
        )}
      </div>

      {note && <p className="ledger-note">{note}</p>}

      {report && (
        <>
          <dl className="rows">
            <div className="row">
              <dt>address</dt>
              <dd className="mono">{short(report.address)}</dd>
            </div>
            <div className="row">
              <dt>native balance</dt>
              <dd className="mono">{amount(report.native)}</dd>
            </div>
            <div className="row">
              <dt>transactions sent</dt>
              <dd className="mono">{report.txCount ?? '—'}</dd>
            </div>
            {report.isContract && (
              <div className="row">
                <dt>note</dt>
                <dd>there is code at this address. it is a contract, not a wallet</dd>
              </div>
            )}
            {report.delegatedTo && (
              <div className="row">
                <dt>note</dt>
                <dd>
                  a wallet that has delegated itself to{' '}
                  <span className="mono">{short(report.delegatedTo)}</span>. a smart account,
                  not a contract
                </dd>
              </div>
            )}
            {report.window && (
              <div className="row">
                <dt>window</dt>
                <dd className="mono">
                  {report.window.transfers} transfers · {report.window.tokensTouched} tokens ·{' '}
                  {report.window.blocks} blocks
                </dd>
              </div>
            )}
            {report.positionsFrom && (
              <div className="row">
                <dt>read from</dt>
                <dd>
                  {report.positionsFrom === 'explorer'
                    ? `the chain index — every token held${
                        report.positionsFound ? `, ${report.positionsFound} of them` : ''
                      }`
                    : 'a node — only what moved in the window'}
                </dd>
              </div>
            )}
          </dl>

          {positions.length > 0 && (
            <div className="ledger-table" role="table" aria-label="positions">
              <div className="ledger-row head" role="row">
                <span role="columnheader">token</span>
                <span role="columnheader">balance</span>
                <span role="columnheader">of supply</span>
                <span role="columnheader">moved</span>
              </div>
              {[...held, ...passed].map((p) => (
                <div
                  className={`ledger-row ${(p.balance || 0) > 0 ? '' : 'empty'}`}
                  role="row"
                  key={p.token}
                >
                  <span role="cell">
                    <b>{p.symbol || short(p.token)}</b>
                    {p.name && <small>{p.name}</small>}
                    {p.minted && <small className="dim">arrived as a mint</small>}
                  </span>
                  <span role="cell" className="mono">
                    {amount(p.balance)}
                  </span>
                  <span role="cell" className="mono">
                    {share(p)}
                  </span>
                  <span role="cell" className="mono">
                    {/* The index does not report movement, so an unknown one
                        is shown as unknown rather than as nothing having
                        happened. */}
                    {p.received || p.sent ? `${p.received} in · ${p.sent} out` : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!positions.length && (
            <p className="ledger-note">
              nothing moved in the window, so there is nothing here to name
            </p>
          )}

          <div className="actions">
            <button className="btn primary" onClick={() => void ask()} disabled={!!busy}>
              {busy === 'ask' ? 'he is reading' : 'ask him to read it'}
            </button>
          </div>

          {said && <p className="ledger-said">{said}</p>}
        </>
      )}

      <p className="wick-small">
        {report?.complete
          ? 'the chain index answered, so that is every token this address holds.'
          : 'a node keeps no list of holders, so what comes back is what moved in the window plus what those tokens are worth in the wallet now. something received long ago and never touched since cannot be seen from here, and i will not pretend otherwise.'}
        <br />
        connecting hands over an address and nothing else. nothing here signs anything, and
        nothing here will ever ask for a seed phrase or a private key.
      </p>
    </div>
  );
}
