# RT-03 — Service identity before reuse

Status: `CLOSED_CANDIDATE` (local evidence; Reviewer decides PASS/RETURN).

Changed surface: the existing local `start-local.ps1` and
`build-production.ps1` callers now use `Get-ManagedServiceReuseDecision`
instead of HTTP-200-only reuse. The decision distinguishes
`START_ALLOWED`, `REUSE`, `IDENTITY_CONFLICT`, `IDENTITY_UNKNOWN` and
`SERVICE_NOT_READY`.

## Controlled test evidence

Command:

```powershell
pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\service-identity.security.tests.ps1
```

Exit code: `0`.

Result: `RT03_SERVICE_IDENTITY_TEST=PASS`, `PASS_COUNT=7`, `FAIL_COUNT=0`,
`ASSERTION_COUNT=7`.

The test uses a unique high test port and a self-created TCP listener stub,
not an application service. It asserts both callers use identity gating,
correct managed identity plus HTTP 200 is reusable, wrong project identity
and missing identity are not reusable, an unlistening port permits a start,
HTTP 503 is distinct from identity conflict, and probing does not stop the
controlled service. The stub and temporary fixture are cleaned by the test.
Raw stdout/stderr is preserved in
[RAW_TEST_LOG_FINAL.txt](RAW_TEST_LOG_FINAL.txt).
