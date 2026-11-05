# Fugue Text CRDT - Formal Verification

This directory contains TLA+ specifications of the Fugue text CRDT, model-checked with TLC for convergence and non-interleaving within stated bounds.

## Verification Results

✅ **Fugue convergence**: complete TLC run (983,661 states, 0 violations; 3 replicas, bounded clocks)
✅ **Non-interleaving property**: partial TLC run (5.6M+ states explored, run stopped with 276K states still queued, 0 violations)
✅ **Determinism & Deletion**: Specifications parse and initialize correctly (not model-checked)

See [FUGUE_VERIFICATION_COMPLETE.md](FUGUE_VERIFICATION_COMPLETE.md) for full results.

## What verification covers

**Covered:** LWW merge, vector clock and convergence models (118,711 states, no violations), and the bounded Fugue checks above. These check the *designs*.

**Not covered:** the Rust and TypeScript implementations, the position cache, block splitting, merging of split blocks, and the network and storage layers. Bugs in those areas were found by tests, not by TLA+. For example, concurrent deletes in the same block duplicated text until the fix on 2026-02-01 (commit b17db36).

**Known gap:** there is no strict randomized two-replica convergence test for the text CRDT. The browser chaos test tolerates up to 2 distinct final texts.

## Specifications

### Core Specifications

- **fugue_core.tla** - Core data structures (NodeId, Block, BTreeMap, Rope)
- **fugue_operations.tla** - Insert and Delete operation definitions
- **fugue_convergence.tla** - CRDT convergence and eventual consistency properties
- **fugue_non_interleaving.tla** - Maximal non-interleaving property (Fugue's innovation)
- **fugue_determinism.tla** - Deterministic conflict resolution properties
- **fugue_deletion.tla** - Tombstone-based deletion correctness

### Configuration Files

Each `.tla` file has a corresponding `.cfg` file that defines:
- Constants (number of clients, clock bounds, etc.)
- Which invariants to check
- State constraints to limit verification scope

## Quick Start

### Prerequisites

1. Download TLA+ Tools (if not present):
   ```bash
   wget https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar
   ```

2. Ensure Java 11+ is installed:
   ```bash
   java -version
   ```

### Running Verification

**Verify the base CRDT properties (fully verified):**
```bash
cd protocol/tla
java -XX:+UseParallelGC -Xmx4G -jar tla2tools.jar -workers auto -deadlock fugue_convergence.tla -config fugue_convergence.cfg
```

**Expected output:**
```
Model checking completed. No error has been found.
983661 states generated, 73691 distinct states found, 0 states left on queue.
Finished in 14min 23s at (2025-12-07 ...)
```

**Verify non-interleaving property (takes longer):**
```bash
java -XX:+UseParallelGC -Xmx4G -jar tla2tools.jar -workers auto -deadlock fugue_non_interleaving.tla -config fugue_non_interleaving.cfg
```

This will explore millions of states. You can stop it after a few minutes - if no violations are found, the property holds for the explored states.

## What's Being Verified

### fugue_convergence.tla ✅ MODEL-CHECKED (complete run, bounded)
- **Strong Eventual Consistency** - All replicas converge to identical state
- **Conflict-Free Operations** - Concurrent operations commute correctly
- **Type Safety** - All operations maintain type invariants
- **Causal Delivery** - Operations respect causal ordering
- **Replica Consistency** - Internal state remains consistent

**Significance:** No violations found for this model's configuration (3 replicas, bounded clocks).

### fugue_non_interleaving.tla ✅ PARTIALLY MODEL-CHECKED
- **Maximal Non-Interleaving** - Concurrent character insertions don't interleave
- **Type Safety** - Invariants hold under concurrent edits
- **Eventual Consistency** - Convergence with non-interleaving property

**Significance:** No violations in the explored states; the run was stopped before the state space was exhausted.

### fugue_determinism.tla ✓ Syntactically Correct
- **NodeId Total Ordering** - Deterministic ordering of all nodes
- **Ordering Properties** - Antisymmetric, transitive, irreflexive
- **Conflict Resolution** - Deterministic tie-breaking

**Significance:** Ensures all replicas make identical ordering decisions.

### fugue_deletion.tla ✓ Syntactically Correct
- **Tombstone Preservation** - Deleted blocks never removed from structure
- **Deletion Correctness** - Deleted text doesn't appear in output
- **Origin Validity** - References remain valid after deletions

**Significance:** Specification only; not yet model-checked.

## Understanding the Results

### Exit Codes
- **0** - Verification completed successfully, all properties hold ✅
- **12** - Property violated, counterexample provided ❌
- **124** - Timeout (not a failure - just means verification is slow)

### States Explored
- More states = higher confidence in correctness
- **fugue_convergence**: 983K states (full verification)
- **fugue_non_interleaving**: 5.6M+ states (extensive verification)

### What zero violations means
If TLC explores the entire state space with zero violations, the properties hold for that specific configuration (number of replicas, clock bound, operation bound). A partial run with zero violations is evidence, not proof. Neither says anything about the Rust or TypeScript code.

## Modifying Verification Scope

To verify with different parameters, edit the `.cfg` files:

```cfg
CONSTANTS
  Clients = {c1, c2, c3}    # Change number of clients
  MaxClock = 10             # Change clock range

CONSTRAINT StateConstraint   # Limits operations explored
```

**Warning:** Increasing these values exponentially increases verification time!

## Troubleshooting

### Out of Memory
Increase Java heap size:
```bash
java -Xmx8G -jar tla2tools.jar ...
```

### Verification Takes Forever
- Reduce `StateConstraint` in the `.tla` file (e.g., from 3 to 2)
- Reduce `MaxClock` in the `.cfg` file
- Use fewer clients

### Property Violation Found
**Good!** TLC found a bug. The error trace shows:
1. Exact sequence of operations that violates the property
2. State at each step
3. Which invariant was violated

Fix the algorithm and re-run verification.

## Why This Matters

Model checking explores every interleaving of a small model, which finds design-level bugs that hand-written examples miss. It does not replace testing the real implementation (see "What verification covers" above).

## Next Steps

Once verification passes:
1. Implement the Rust code following the TLA+ specification
2. Use property-based testing (e.g., QuickCheck) for additional confidence
3. Reference the verification results in documentation/papers

---

**For detailed verification results, see:** [FUGUE_VERIFICATION_COMPLETE.md](FUGUE_VERIFICATION_COMPLETE.md)
