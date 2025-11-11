# TLA+ Verification Guide

## Overview

This directory contains formal specifications of SyncKit's core algorithms written in TLA+ (Temporal Logic of Actions). These specs mathematically verify that our algorithms are correct before we write any implementation code.

**Status:** ✅ Specifications written | ⏳ Model checking pending

---

## What We're Verifying

### 1. **LWW Merge Algorithm** (`lww_merge.tla`)
**Critical Properties:**
- ✅ **Convergence**: All replicas reach the same state when all operations are delivered
- ✅ **Determinism**: Same inputs always produce same output
- ✅ **Monotonicity**: Timestamps never decrease
- ✅ **Idempotence**: Applying same merge multiple times has no effect

### 2. **Vector Clock** (`vector_clock.tla`)
**Critical Properties:**
- ✅ **Causality Preserved**: Happens-before relationship is correctly tracked
- ✅ **Transitivity**: If A→B and B→C, then A→C
- ✅ **Concurrent Detection**: Correctly identifies concurrent operations
- ✅ **Merge Correctness**: Merging clocks preserves causality

### 3. **Strong Eventual Consistency** (`convergence.tla`)
**Critical Properties:**
- ✅ **SEC Theorem**: All replicas converge when all ops delivered
- ✅ **Order Independence**: Merge order doesn't matter
- ✅ **No Data Loss**: Every operation affects final state
- ✅ **Conflict-Free**: Concurrent ops merge automatically

---

## Why This Matters

Companies like **AWS**, **Microsoft Azure**, and **MongoDB** use TLA+ to verify distributed algorithms before implementation. It finds bugs that are nearly impossible to catch with testing:

- **Race conditions** across network partitions
- **Edge cases** with concurrent operations
- **Subtle timing bugs** that only appear under specific orderings
- **Data loss scenarios** that testing would miss

**Example:** Amazon found 10+ critical bugs in DynamoDB using TLA+ that conventional testing missed. Each would have been production incidents.

---

## Quick Start (Model Checking)

### Prerequisites
1. **Java 11+** (TLA+ Tools runs on JVM)
2. **TLA+ Tools** (download from GitHub)

### Option A: Command Line (CI/CD Friendly)

```bash
# 1. Install Java (if not already installed)
# Windows: winget install Microsoft.OpenJDK.17
# Mac: brew install openjdk@17
# Linux: sudo apt install openjdk-17-jdk

# 2. Download TLA+ Tools
cd protocol/tla
curl -L https://github.com/tlaplus/tlaplus/releases/latest/download/tla2tools.jar -o tla2tools.jar

# 3. Run model checking (each spec)
java -jar tla2tools.jar -config lww_merge.cfg lww_merge.tla
java -jar tla2tools.jar -config vector_clock.cfg vector_clock.tla
java -jar tla2tools.jar -config convergence.cfg convergence.tla

# Expected output: "Model checking completed. No error has been found."
# Runtime: 30 seconds - 2 minutes per spec
```

### Option B: TLA+ Toolbox GUI (Visual)

1. **Download**: https://lamport.azurewebsites.net/tla/toolbox.html
2. **Install**: Extract and run `toolbox.exe`
3. **Open specs**:
   - File → Open Spec → Add Existing Spec → Select `.tla` file
   - For each spec, create a model using the corresponding `.cfg` file
4. **Run model checker**: Click "Run TLC" button
5. **Check results**: Green checkmark = all properties verified

---

## Interpreting Results

### ✅ Success
```
Model checking completed. No error has been found.
Computation finished in 00:00:32
States found: 15,432
Distinct states: 8,291
```

**What this means:**
- TLC explored 15,432 possible execution states
- All properties held in every single state
- Your algorithm is mathematically proven correct (for bounded model)

### ❌ Failure (Counterexample)
```
Error: Invariant Convergence is violated.

State 1: [client1 writes field1="v1" ts=2]
State 2: [client2 writes field1="v2" ts=2] 
State 3: [client1 receives client2's delta]
State 4: [client2 receives client1's delta]

Result: client1.state != client2.state
  client1: {field1: "v1"}
  client2: {field1: "v2"}
```

**What to do:**
1. Analyze the counterexample trace (exact sequence that breaks the property)
2. Fix the algorithm (e.g., strengthen tie-breaking)
3. Re-run model checker
4. Repeat until all properties pass

---

## Model Checking Parameters

Each `.cfg` file defines the model parameters:

### For Quick Verification (30 seconds)
```
Clients = {c1, c2}
MaxTimestamp = 3
Fields = {f1}
MaxOperations = 3
```
Explores: ~1,000 - 5,000 states

### For Thorough Verification (5 minutes)
```
Clients = {c1, c2, c3}
MaxTimestamp = 5
Fields = {f1, f2}
MaxOperations = 10
```
Explores: ~50,000 - 200,000 states

### For Production Confidence (1 hour+)
```
Clients = {c1, c2, c3, c4}
MaxTimestamp = 10
Fields = {f1, f2, f3}
MaxOperations = 20
```
Explores: Millions of states

**Trade-off:** More states = higher confidence, but exponentially longer runtime.

**Recommendation:** Start small, then increase bounds once you're confident.

---

## Integration with CI/CD

Add to `.github/workflows/verify.yml`:

```yaml
name: TLA+ Verification

on: [push, pull_request]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Java
        uses: actions/setup-java@v3
        with:
          java-version: '17'
      
      - name: Download TLA+ Tools
        run: |
          cd protocol/tla
          curl -L https://github.com/tlaplus/tlaplus/releases/latest/download/tla2tools.jar -o tla2tools.jar
      
      - name: Verify LWW Merge
        run: |
          cd protocol/tla
          java -jar tla2tools.jar -config lww_merge.cfg lww_merge.tla
      
      - name: Verify Vector Clock
        run: |
          cd protocol/tla
          java -jar tla2tools.jar -config vector_clock.cfg vector_clock.tla
      
      - name: Verify Convergence
        run: |
          cd protocol/tla
          java -jar tla2tools.jar -config convergence.cfg convergence.tla
```

---

## Current Status

**✅ Completed:**
- [x] LWW merge specification (190 lines)
- [x] Vector clock specification (196 lines)
- [x] Convergence proof specification (272 lines)
- [x] Model configuration files (.cfg)
- [x] Verification guide (this document)

**⏳ Pending:**
- [ ] Run model checker (30 mins when convenient)
- [ ] Verify all properties pass
- [ ] (Optional) Increase bounds for thorough testing
- [ ] (Optional) Add to CI/CD pipeline

---

## FAQ

### Q: Do we have to run TLA+ verification?
**A:** No, but it's highly recommended. The specs are already valuable as formal documentation. Running the model checker provides mathematical proof of correctness.

### Q: When should we run verification?
**A:** Best time: Before writing Rust implementation (catch bugs early). Also works: During Rust development, or after as a sanity check.

### Q: What if we find bugs?
**A:** Fix the algorithm in the spec, re-run TLC, then update Rust implementation. Much cheaper than finding bugs in production!

### Q: How long does it take?
**A:** Setup: 5 minutes (one-time). Each spec: 30 seconds - 5 minutes. Total: ~15 minutes for all three specs with small bounds.

---

## Next Steps

1. **Now:** Continue with Phase 1 (Architecture docs) - keep momentum!
2. **Later:** Run TLA+ verification when convenient (30 mins)
3. **Before Phase 2:** Ideally verify before writing Rust code

**Or run verification in parallel with architecture documentation!**

---

## Resources

- [TLA+ Homepage](https://lamport.azurewebsites.net/tla/tla.html)
- [TLA+ Video Course](https://lamport.azurewebsites.net/video/videos.html) by Leslie Lamport
- [Learn TLA+](https://learntla.com/) - Interactive tutorial
- [TLA+ Examples](https://github.com/tlaplus/Examples) - Real-world specs
- [AWS TLA+ Specs](https://github.com/aws/aws-tlaplus-specs) - How Amazon uses TLA+

---

**Ready to verify?** Follow the Quick Start above.
**Want to continue development?** That's fine too - specs are already valuable documentation!
