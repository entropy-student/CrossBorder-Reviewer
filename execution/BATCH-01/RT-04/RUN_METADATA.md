# RT-04 / SF-11 run metadata

- Shell: PowerShell 7 invoking Corepack/pnpm 10.11.1 and Node.js; build and verify commands run from `03_template/medusa-crossborder-base`.
- Unified verify command: `corepack pnpm@10.11.1 run verify`; exit `0`; raw log SHA256 `CF104117641DE92972C070B16EB569B16EBFCAB248D2584F1A37EAE87C2D1525`.
- Contract test command: `corepack pnpm@10.11.1 run test:contracts`; exit `0`; raw log SHA256 `550755CB7DDDE9A21952C060BA60DE2B993E6D38D12050F4ADC47D0DB017C1B1`.
- Production build command: `corepack pnpm@10.11.1 run verify:build`; exit `0`; initial raw log SHA256 `7C516DDEDE7347D148CDDF1A635989F5B0A9DDF2B7D634535B841D95CE2A7930`; final-after-entry-update raw log SHA256 `52706C2D896E99BA4C847E0AA7A7687E61EB5619AF17336C03F93F63C46EA581`.
- Failure injection command: `pwsh -File scripts/verification-gate.security.tests.ps1 -EvidencePath <review-log>`; exit `0` because the probe's expected failures were rejected; raw run log SHA256 `2489464CCEF774F8CE34830E4D48BC5B7BE4A80F6038FBF963DE5B442964EBA7` and failure details SHA256 `BBD4D1661AB73F94901BCA0A7043AF0210C242346F3F51934F257D16BD69DFBE`.
- Root template package SHA256: `01CCC67FC937D76A5ADDA59A7E43E17C567728710E444A0E80FD6E7ABCEAAE45`.
- Source-root workflow SHA256: `DBA2EAADE4C5A7AE18E2ED727F57CE5CC45CCD21EA2FDE1A6580D6AF63096398`.
- Failure probe result: real injected Jest test exit `1`; real injected TypeScript error exit `2`; no fixture remained in source.

See [EXECUTION_EVIDENCE.md](EXECUTION_EVIDENCE.md) for command scope and
interpretation.
