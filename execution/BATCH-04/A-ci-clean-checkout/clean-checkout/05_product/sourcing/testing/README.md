# COMP-001 Sample Testing

`SOURCE_BOUND=YES`; `HUMAN_WORKING_DOCUMENT=NO`. The current human-facing
protocol is maintained in the parent document center.

This testing system is scoped to `COMP-001`, the Pet Hair Remover core
component candidate for `BUNDLE-PET-FUR-RESCUE-KIT`.

No physical sample has been received. The current receipt status is
`WAITING_FOR_SAMPLE`; all observations, scores and decisions remain
`NOT_TESTED`. This system does not compare another supplier and does not
authorize a purchase, a sellable product, a bundle launch or a Medusa write.

## Files

- [Sample test protocol](../../../../product/sourcing/testing/PET_HAIR_REMOVER_SAMPLE_TEST_PROTOCOL.md) - controlled test methods,
  surfaces, repeats, evidence and hard-fail rules.
- `PET_HAIR_REMOVER_SAMPLE_SCORECARD.json` - weighted 100-point score model,
  intentionally without measured scores.
- `SAMPLE_RECEIPT_TEMPLATE.json` - first receipt record, to be filled only
  when the physical samples arrive.
- `SAMPLE_TEST_RESULT_TEMPLATE.json` - one result record per completed test
  session.

## Operator sequence

1. Complete the receipt template without overwriting supplied facts.
2. Photograph and record the physical condition, packaging and measurements.
3. Run the protocol under comparable conditions and capture before/after
   evidence.
4. Record raw observations before assigning scores.
5. Apply hard-fail rules and calculate the weighted score.
6. Set the sample decision to `PASS`, `FAIL` or `RETEST_REQUIRED`.
7. Re-run the component validator. A sample pass only changes procurement to
   `READY_FOR_SUPPLY_CHAIN_REVIEW`; it never authorizes a bulk order by itself.

## Evidence labels

Supplier listing and supplier statements remain `SUPPLIER_CLAIM`.
Measurements and photographs taken after receipt are `SAMPLE_EVIDENCE`.
AI-derived marketing assets are never sample, measurement, supplier or
quality-verification evidence.
