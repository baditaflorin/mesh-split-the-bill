import { useEffect, useMemo, useState } from "react";
import type { MeshConfig, YRoom } from "@baditaflorin/mesh-common";
import * as Y from "yjs";

type Props = { room: YRoom | null; config: MeshConfig };

type Item = { id: string; name: string; price: number };

const NAME_KEY = (prefix: string) => `${prefix}:displayName`;

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function Feature({ room, config }: Props) {
  const [name, setName] = useState(
    () => localStorage.getItem(NAME_KEY(config.storagePrefix)) ?? "",
  );
  const [draftName, setDraftName] = useState("");
  const [draftPrice, setDraftPrice] = useState("");
  const [, rerender] = useState(0);

  useEffect(() => {
    if (name) localStorage.setItem(NAME_KEY(config.storagePrefix), name);
  }, [name, config.storagePrefix]);

  useEffect(() => {
    if (!room) return;
    const items = room.doc.getArray<Item>("items");
    const claims = room.doc.getMap<Y.Map<boolean>>("claims");
    const onChange = () => rerender((n) => n + 1);
    items.observe(onChange);
    claims.observeDeep(onChange);
    return () => {
      items.unobserve(onChange);
      claims.unobserveDeep(onChange);
    };
  }, [room]);

  const data = useMemo(() => {
    if (!room) return { items: [] as Item[], claims: {} as Record<string, string[]> };
    const items = room.doc.getArray<Item>("items").toArray();
    const claimsY = room.doc.getMap<Y.Map<boolean>>("claims");
    const claims: Record<string, string[]> = {};
    claimsY.forEach((row, itemId) => {
      const peers: string[] = [];
      row.forEach((v, peer) => {
        if (v) peers.push(peer);
      });
      claims[itemId] = peers;
    });
    return { items, claims };
  }, [room]);

  if (!room) {
    return (
      <div className="bill-screen">
        <h1>split the bill</h1>
        <p className="bill-status">Connecting…</p>
      </div>
    );
  }

  const myKey = name.trim() || `peer-${room.peerId.slice(0, 4)}`;

  const addItem = () => {
    const n = draftName.trim();
    const p = parseFloat(draftPrice);
    if (!n || !Number.isFinite(p) || p < 0) return;
    room.doc.getArray<Item>("items").push([{ id: crypto.randomUUID(), name: n, price: p }]);
    setDraftName("");
    setDraftPrice("");
  };

  const removeItem = (id: string) => {
    const items = room.doc.getArray<Item>("items");
    const idx = items.toArray().findIndex((i) => i.id === id);
    if (idx >= 0) items.delete(idx, 1);
    room.doc.getMap<Y.Map<boolean>>("claims").delete(id);
  };

  const toggleClaim = (id: string) => {
    const claims = room.doc.getMap<Y.Map<boolean>>("claims");
    let row = claims.get(id);
    if (!row) {
      row = new Y.Map<boolean>();
      claims.set(id, row);
    }
    row.set(myKey, row.get(myKey) !== true);
  };

  const total = data.items.reduce((s, i) => s + i.price, 0);
  const myTotal = data.items.reduce((s, i) => {
    const claimants = data.claims[i.id] ?? [];
    if (!claimants.includes(myKey)) return s;
    return s + i.price / claimants.length;
  }, 0);

  return (
    <div className="bill-screen">
      <header className="bill-header">
        <h1>split the bill</h1>
        <input
          className="bill-name"
          placeholder="your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
        />
        <p className="bill-status">
          total {fmt(total)} · you owe {fmt(myTotal)} · {room.peerCount + 1} here
        </p>
      </header>

      <form
        className="bill-add"
        onSubmit={(e) => {
          e.preventDefault();
          addItem();
        }}
      >
        <input
          className="bill-add-name"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="item"
          maxLength={48}
        />
        <input
          className="bill-add-price"
          value={draftPrice}
          onChange={(e) => setDraftPrice(e.target.value)}
          placeholder="0.00"
          inputMode="decimal"
        />
        <button type="submit">add</button>
      </form>

      <ul className="bill-list">
        {data.items.map((it) => {
          const claimants = data.claims[it.id] ?? [];
          const mine = claimants.includes(myKey);
          const share = claimants.length > 0 ? it.price / claimants.length : it.price;
          return (
            <li key={it.id} className={`bill-item ${mine ? "is-mine" : ""}`}>
              <button type="button" className="bill-claim" onClick={() => toggleClaim(it.id)}>
                <span className="bill-item-name">{it.name}</span>
                <span className="bill-item-price">{fmt(it.price)}</span>
              </button>
              {claimants.length > 0 && (
                <span className="bill-item-claimants">
                  {claimants.join(", ")} · {fmt(share)} each
                </span>
              )}
              {claimants.length === 0 && (
                <span className="bill-item-claimants is-empty">unclaimed — tap if it's yours</span>
              )}
              <button type="button" className="bill-item-rm" onClick={() => removeItem(it.id)}>
                ×
              </button>
            </li>
          );
        })}
        {data.items.length === 0 && (
          <li className="bill-empty">no items yet — add what you ordered</li>
        )}
      </ul>
    </div>
  );
}
