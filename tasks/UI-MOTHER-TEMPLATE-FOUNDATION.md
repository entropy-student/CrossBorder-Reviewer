# UI MOTHER TEMPLATE FOUNDATION — Gate Prompt

Governance: `VPS Project Governance v0.1.6`

## Goal

Create an isolated, business-data-free storefront mother template that can be edited directly by a frontier design model and later reused by the real Medusa storefront without reinterpreting the design from prose.

## Source branch

`entropy-student/CrossBorder:ui/storefront-mother-template-v1`

## Allowed

- create an isolated Next.js visual package under `ui/storefront-mother-template/`;
- neutral placeholder content only;
- reusable presentation components;
- CSS design tokens and responsive rules;
- a golden visual route;
- GPT-6 direct-edit brief;
- screenshot visual acceptance contract;
- later data-integration contract.

## Forbidden

- changes to the live/retained Medusa storefront runtime;
- Medusa SDK/data fetching inside the mother template;
- payment, fulfillment, inventory, order or refund implementation;
- external API calls;
- secrets;
- production deployment;
- broad UI implementation into the real storefront before visual acceptance.

## Acceptance criteria

1. mother template is isolated from commerce/runtime data;
2. visual edits are concentrated in a small number of final reusable files;
3. golden route exists for desktop/mobile screenshot iteration;
4. reference-to-code workflow explicitly prevents a later agent from recreating the accepted design from prose;
5. package uses the same Next.js/React generation as the retained storefront unless a later reviewed reason changes it;
6. build/run verification is recorded before merge;
7. final visual acceptance remains Owner-only.

## Current result boundary

Foundation creation may reach `PASS_CANDIDATE_UI_TEMPLATE_FOUNDATION`; it is not a visual PASS. The visual system remains unaccepted until reference images are supplied and screenshot review is completed.
