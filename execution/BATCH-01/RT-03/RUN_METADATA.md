# RT-03 run metadata

- Command: `pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File C:\Users\34707\Documents\ChatGPT\跨境电商\CrossBorder-Independent-Store\03_template\medusa-crossborder-base\scripts\service-identity.security.tests.ps1`
- Shell: PowerShell 7 (`pwsh`)
- Exit code: `0`
- Test result: `RT03_SERVICE_IDENTITY_TEST=PASS`; `PASS_COUNT=7`; `FAIL_COUNT=0`; `ASSERTION_COUNT=7`
- Test script SHA256: `18C862C01B233D3453ACD562935F753F3233B496CC26CF6EA0A1F0499759931D`
- Shared process helper SHA256: `F2A18B75250360BF6853E1C0E23CEF03B1533558B5C34A08A5EB8886400DC8C6`
- `start-local.ps1` SHA256: `2C808E7B06FB908D84C3E9E1CDFB143F77FB6D8DC4261FB969A5F6AE01339AD1`
- `build-production.ps1` SHA256: `3D9207E1F6F6C807DAF9B8BA511F1474979A23938C54D2670925BD028098E04D`
- Raw stdout/stderr SHA256: `E0DBF2BBFB2B294E8D89E8183E7F3C8AD719DCCD302F8A6599D892F24C69F8C2`

The test uses a unique TCP listener stub and does not stop a controlled
service during identity probing. See [EXECUTION_EVIDENCE.md](EXECUTION_EVIDENCE.md)
and [RAW_TEST_LOG_FINAL.txt](RAW_TEST_LOG_FINAL.txt).
