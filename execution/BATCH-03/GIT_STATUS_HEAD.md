# BATCH-03 Git / HEAD Evidence

## Source repository

```text
PATH=C:\Users\34707\Documents\ChatGPT\跨境电商\CrossBorder-Independent-Store
HEAD_AT_BATCH_START=4b7dd0f371f13cc3ee1f598499dcecbf63b33fec
HEAD_AT_FINAL_CHECK=4b7dd0f371f13cc3ee1f598499dcecbf63b33fec
HEAD_UNCHANGED=YES
STATUS=DIRTY_EXPECTED_UNCOMMITTED
```

The source tree already contained BATCH-01/BATCH-02 work at the start. This
batch added/changed only the scoped runtime, product, storefront, payment and
source-bound documentation files listed by the working-tree status; no reset,
checkout or commit was run.

## Document-center repository

```text
PATH=C:\Users\34707\Documents\ChatGPT\跨境电商
HEAD_AT_BATCH_START=38e879c42ead6e561939a7881526c2a984c158a2
HEAD_AT_FINAL_CHECK=38e879c42ead6e561939a7881526c2a984c158a2
HEAD_UNCHANGED=YES
STATUS=DIRTY_EXPECTED_UNCOMMITTED
```

The document-center changes are the current PayPal contract note and the two
current operations documents. Historical reports were not edited.

## Separate repositories

```text
MEDUSA_REPOSITORY=C:\Users\34707\Documents\ChatGPT\跨境电商\CrossBorder-Independent-Store\02_demos\medusa-dtc
MEDUSA_HEAD=5d3e644ebf7812453e2be000eba2f497423e5c02
MEDUSA_STATUS=CLEAN
SPREE_REPOSITORY=C:\Users\34707\Documents\ChatGPT\跨境电商\CrossBorder-Independent-Store\02_demos\spree-demo
SPREE_HEAD=f9966ab61ae0ceb72f62a51167b1c013fe10230f
SPREE_STATUS=CLEAN
```

The separate-repository check used `git rev-parse --show-toplevel`; neither
demo repository inherits the parent source repository identity.
