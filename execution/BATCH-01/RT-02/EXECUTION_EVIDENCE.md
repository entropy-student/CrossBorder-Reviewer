# RT-02 — Process identity verification

Status: `CLOSED_CANDIDATE` (local evidence; Reviewer decides PASS/RETURN).

Changed surface: `CrossBorder-Independent-Store/03_template/medusa-crossborder-base/scripts/_common.ps1`, plus its existing callers in `scripts/start-local.ps1` and `scripts/build-production.ps1`.

The managed PID record is now schema-versioned and contains PID, startup time,
executable path, exact command line, project root/name, working directory and
role. Stop logic refuses legacy PID-only records, missing fields, stale startup
time, project mismatch and executable/command mismatch. It rechecks the root and
descendant identities immediately before termination and only removes the
record after a successful controlled stop.

## Controlled test evidence

Command:

```powershell
pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\process-management.security.tests.ps1
```

Exit code: `0`.

Result: `RT02_PROCESS_SECURITY_TEST=PASS`, `PASS_COUNT=9`, `FAIL_COUNT=0`,
`ASSERTION_COUNT=9`.

The test creates only its own harmless PowerShell sleeper processes and a
unique temporary fixture. Assertions cover: correct owned tree termination,
already-exited stale record, injected PID reuse identity mismatch, startup
time mismatch, project mismatch, identity-read failure, legacy PID-only
record, stale parent with child, and an external sentinel process. Refused
cases assert the target process remains alive; cleanup targets only the test
processes. Raw stdout/stderr is preserved in
[RAW_TEST_LOG_FINAL.txt](RAW_TEST_LOG_FINAL.txt).

No user process was terminated and no application/database/runtime state was
reset.
