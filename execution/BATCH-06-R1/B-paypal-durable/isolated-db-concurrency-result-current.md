# Isolated PostgreSQL Webhook concurrency / restart evidence

The patched production artifact was executed inside the isolated Docker network with a fresh fixed event ID. Eight simultaneous calls returned with `FULFILLED=8`, `REJECTED=0`, `CLAIMED_COUNT=1`, `REPLAYED_COUNT=7`, and `DB_ROW_COUNT=1`. A second independent one-shot process using the same event ID returned `CLAIMED_COUNT=0`, `REPLAYED_COUNT=1`, and `DB_ROW_COUNT=1`, demonstrating the restart-boundary replay read-back. Both assertions exited `0`.

Evidence: `isolated-db-concurrency-restart-first-current.log`, `isolated-db-concurrency-restart-first-current.exitcode.txt`, `isolated-db-concurrency-restart-second-current.log`, and `isolated-db-concurrency-restart-second-current.exitcode.txt`. This is real isolated PostgreSQL persistence and application concurrency evidence; it is not a signed provider Webhook or hosted Sandbox result.
