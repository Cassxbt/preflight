# Proof

Archived evidence for the claims in the main README. Nothing here is secret: wallet addresses and transaction messages are public on chain.

| File | What it shows |
|---|---|
| `2026-09-24_spacex_prepared_order.json` | The order Preflight stored before the wallet signed: verdict, reasons, expected and minimum credit, and the exact transaction message (`messageBase64`). |
| `2026-09-24_spacex_receipt.json` | The receipt served at `/api/receipt/3mgVKNBX…HvVSDprT`: chain facts, the recorded verdict and its hash, and the acknowledged reasons. |
| `2026-09-25_spacex_prepared_order.json` | The deployed-app purchase filmed for the demo (25 Sep): the order stored before signing, including `messageBase64`. |
| `2026-09-25_spacex_receipt.json` | Its receipt: `XRSbAUw2…Prft1jcxq`, 1 USDC → 0.00835368 SPACEX, exactly the expected credit, `ISSUER_DEADLINE` acknowledged. |
| `2026-09-24_anthropic_local_receipt.json` | The earlier purchase, made on Preflight running locally before the deploy. |
| `2026-09-25_xai_jupiter_quote.json` | Jupiter's public quote API routing USDC into the expired XAI mint, with the time it was retrieved. |

Two checks you can run against these files and the chain:

- The finalized transaction's message is byte-for-byte `messageBase64` in the prepared order: fetch `3mgVKNBXReMXYzqAgwDcG2rTscGPct6o5cwCERb9jzj7p7BHmoWMvzxgaNMoWkN6LcT5RJ9UqcCfqvGUHvVSDprT` with any RPC and compare `transaction.message.serialize()`.
- The SHA-256 of the order's `verdict` (sorted keys) equals `appRecorded.verdictHash` in the receipt, so the verdict recorded at purchase is the one computed before signing.
