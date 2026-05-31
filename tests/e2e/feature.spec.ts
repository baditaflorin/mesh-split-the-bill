import { expect, test } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

/**
 * Load-bearing cross-peer test for the ADVERTISED core action:
 * "each phone claims items, totals reconcile via Yjs".
 *
 * Peer A adds two items; peer B must see them. Peer B claims one item;
 * peer A must see B's claim AND its reconciled per-share total. Then both
 * peers claim the same item and the split must reconcile to half each on
 * BOTH peers. This drives the real Yjs `items` array + nested `claims` map,
 * not a stub — and asserts the result on the OPPOSITE peer in each step.
 */
test("items + claims + totals reconcile across the mesh", async ({ browser, baseURL }) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    // Each peer picks a stable display name so claim keys are deterministic.
    await a.getByPlaceholder("your name").fill("Alice");
    await b.getByPlaceholder("your name").fill("Bob");

    // --- Peer A adds two items ---
    await a.getByPlaceholder("item").fill("Pizza");
    await a.getByPlaceholder("0.00").fill("20.00");
    await a.getByRole("button", { name: "add" }).click();

    await a.getByPlaceholder("item").fill("Beer");
    await a.getByPlaceholder("0.00").fill("10.00");
    await a.getByRole("button", { name: "add" }).click();

    // --- Items array propagates A -> B ---
    await expect(b.getByText("Pizza")).toBeVisible();
    await expect(b.getByText("Beer")).toBeVisible();
    // The shared total (sum of all items) shows on BOTH peers' status bar.
    await expect(a.locator(".bill-status")).toContainText("total 30.00");
    await expect(b.locator(".bill-status")).toContainText("total 30.00");

    // --- Peer B claims the Beer ---
    const beerOnB = b.locator(".bill-item", { hasText: "Beer" });
    await beerOnB.locator(".bill-claim").click();

    // Bob's claim must appear on peer A (the OPPOSITE peer), keyed by name,
    // with the reconciled per-share price (one claimant -> full price).
    const beerOnA = a.locator(".bill-item", { hasText: "Beer" });
    await expect(beerOnA.locator(".bill-item-claimants")).toContainText("Bob");
    await expect(beerOnA.locator(".bill-item-claimants")).toContainText("10.00 each");
    // Bob now owes the full 10.00 for the beer he alone claimed.
    await expect(b.locator(".bill-status")).toContainText("you owe 10.00");

    // --- Both peers claim the Pizza: split must reconcile to half each ---
    await a.locator(".bill-item", { hasText: "Pizza" }).locator(".bill-claim").click();
    await b.locator(".bill-item", { hasText: "Pizza" }).locator(".bill-claim").click();

    // Two claimants on the Pizza -> 20/2 = 10.00 each, visible on BOTH peers.
    await expect(
      a.locator(".bill-item", { hasText: "Pizza" }).locator(".bill-item-claimants"),
    ).toContainText("10.00 each");
    await expect(
      b.locator(".bill-item", { hasText: "Pizza" }).locator(".bill-item-claimants"),
    ).toContainText("10.00 each");
    // Both claimant names must appear on the opposite peer's row.
    await expect(
      a.locator(".bill-item", { hasText: "Pizza" }).locator(".bill-item-claimants"),
    ).toContainText("Bob");
    await expect(
      b.locator(".bill-item", { hasText: "Pizza" }).locator(".bill-item-claimants"),
    ).toContainText("Alice");

    // Reconciled "you owe": Alice = pizza half (10.00); Bob = pizza half +
    // full beer (10 + 10 = 20.00). Each peer computes its OWN total from the
    // shared CRDT state — proving totals reconcile per-peer across the mesh.
    await expect(a.locator(".bill-status")).toContainText("you owe 10.00");
    await expect(b.locator(".bill-status")).toContainText("you owe 20.00");
  } finally {
    await cleanup();
  }
});
