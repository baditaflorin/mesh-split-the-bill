import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-split-the-bill",
  description: "QR a menu, each phone claims items, totals reconcile via Yjs — no signup",
  accentHex: "#2ec27e",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});
