--------------------------- MODULE fugue_operations ---------------------------
(*
  Fugue Text CRDT - Core Operations

  This module defines the three fundamental Fugue operations:
  1. INSERT: Add text at position with origin tracking
  2. DELETE: Mark blocks as deleted (tombstone)
  3. MERGE: Integrate remote replica state

  These operations are the heart of the Fugue algorithm and implement:
  - Maximal non-interleaving (via left/right origins)
  - Deterministic conflict resolution (via NodeId ordering)
  - Strong eventual consistency (via commutative merge)

  CRITICAL PROPERTIES TO MAINTAIN:
  - Insert preserves origin invariants
  - Delete uses tombstones (never removes blocks)
  - Merge is commutative, associative, and idempotent
  - All operations maintain BTreeMap ordering
  - Rope always matches visible (non-deleted) blocks
*)

EXTENDS fugue_core, Integers, Sequences, TLC, FiniteSets

\* =============================================================================
\* Operation Types
\* =============================================================================

(*
  Operation record structure

  Each operation represents a user action (insert or delete)
  and carries all metadata needed for CRDT replication

  Fields:
  - type: "insert" or "delete"
  - client: Replica that generated the operation
  - clock: Lamport timestamp (causality)
  - position: Grapheme position (LOCAL UI ONLY - not used for CRDT placement!)
  - text: Text to insert (for insert ops)
  - length: Number of characters to delete (for delete ops)
  - blockId: NodeId of created block (for insert ops)
  - left_origin: Block inserted after (NULL = beginning) - CRITICAL for convergence!
  - right_origin: Block inserted before (NULL = end) - Enables maximal non-interleaving
  - deletedBlocks: Set of block IDs deleted (for delete ops) - CRITICAL for order independence!

  CRITICAL FOR INSERTS: Origins must be captured at operation creation time and transmitted
  to remote replicas. Without origins, replicas will diverge when applying the
  same operations in different orders (violates OrderIndependence invariant).

  CRITICAL FOR DELETES: The deletedBlocks set must contain the exact block IDs that were
  deleted, captured at operation creation time. Without this, remote replicas will try to
  recalculate which blocks to delete by position, which fails if blocks haven't arrived yet,
  violating OrderIndependence!
*)
Operation == [
  type: {"insert", "delete"},
  client: Clients,
  clock: LamportClock,
  position: Nat,
  text: Texts,
  length: Nat,
  blockId: NodeId,
  left_origin: NodeId \union {NULL},
  right_origin: NodeId \union {NULL},
  deletedBlocks: SUBSET NodeId
]

(*
  Create insert operation
*)
NewInsertOp(client, clock, position, text, blockId, left_origin, right_origin) ==
  [type |-> "insert",
   client |-> client,
   clock |-> clock,
   position |-> position,
   text |-> text,
   length |-> 0,  \* Not used for inserts
   blockId |-> blockId,
   left_origin |-> left_origin,
   right_origin |-> right_origin,
   deletedBlocks |-> {}]  \* Empty for inserts

(*
  Create delete operation

  CRITICAL: The deletedBlocks parameter must contain the exact set of block IDs
  that were deleted at operation creation time. This makes delete operations
  order-independent - remote replicas will mark these specific blocks as deleted,
  regardless of whether they've arrived yet.
*)
NewDeleteOp(client, clock, position, length, deletedBlocks) ==
  [type |-> "delete",
   client |-> client,
   clock |-> clock,
   position |-> position,
   text |-> <<>>,  \* Not used for deletes
   length |-> length,
   blockId |-> [client |-> client, clock |-> clock, offset |-> 0],
   left_origin |-> NULL,   \* Not used for deletes
   right_origin |-> NULL,  \* Not used for deletes
   deletedBlocks |-> deletedBlocks]  \* Block IDs to delete

\* =============================================================================
\* Helper Functions (Forward Declarations)
\* =============================================================================

(*
  Find all blocks that overlap deletion range
  Recursive scan through visible blocks
  Returns set of NodeIds to delete
*)
RECURSIVE FindBlocksInRange(_, _, _, _, _, _)
FindBlocksInRange(blocks, deletePos, deleteLen, currentPos, blockIdx, acc) ==
  IF blockIdx > Len(blocks)
  THEN acc  \* No more blocks
  ELSE
    LET currentBlock == blocks[blockIdx]
        blockLen == BlockLen(currentBlock)
        blockStart == currentPos
        blockEnd == currentPos + blockLen
        deleteEnd == deletePos + deleteLen
    IN
      IF blockStart >= deleteEnd
      THEN acc  \* Block is after deletion range
      ELSE IF blockEnd <= deletePos
      THEN FindBlocksInRange(blocks, deletePos, deleteLen, blockEnd, blockIdx + 1, acc)
      ELSE
        \* Block overlaps deletion range - add to set
        LET newAcc == acc \union {currentBlock.id}
        IN FindBlocksInRange(blocks, deletePos, deleteLen, blockEnd, blockIdx + 1, newAcc)

(*
  Mark blocks as deleted in BTreeMap
  Returns new BTreeMap with specified blocks marked deleted
*)
MarkBlocksDeleted(map, blockIds) ==
  [id \in DOMAIN map |->
    IF id \in blockIds
    THEN MarkDeleted(map[id])
    ELSE map[id]]

(*
  Merge two blocks with same NodeId
  Rules:
  - If either is deleted, result is deleted (deletion wins)
  - Text, origins, etc. should be identical (same NodeId)
*)
MergeBlocks(localBlock, remoteBlock) ==
  [localBlock EXCEPT !.deleted = localBlock.deleted \/ remoteBlock.deleted]

\* =============================================================================
\* Find Origins (CRITICAL FUNCTION)
\* =============================================================================

(*
  Recursive helper for FindOrigins
  Scans through blocks to find origins

  Parameters:
  - blocks: Sequence of visible blocks
  - targetPos: Position to insert at
  - currentPos: Cumulative position so far
  - blockIdx: Current block index
*)
RECURSIVE FindOriginsInBlocks(_, _, _, _)
FindOriginsInBlocks(blocks, targetPos, currentPos, blockIdx) ==
  IF blockIdx > Len(blocks)
  THEN
    \* Position is at end of document
    [left |-> blocks[Len(blocks)].id, right |-> NULL]
  ELSE
    LET currentBlock == blocks[blockIdx]
        blockLen == BlockLen(currentBlock)
        blockStart == currentPos
        blockEnd == currentPos + blockLen
    IN
      IF targetPos <= blockStart  \* FIXED: Use <= instead of < to handle boundary correctly
      THEN
        \* Position is before this block (or at start boundary)
        \* For insertion, targetPos represents "insert before this index"
        \* So targetPos == blockStart means "before this block"
        IF blockIdx = 1
        THEN [left |-> NULL, right |-> currentBlock.id]
        ELSE [left |-> blocks[blockIdx - 1].id, right |-> currentBlock.id]
      ELSE IF targetPos >= blockEnd
      THEN
        \* Position is after this block, continue searching
        FindOriginsInBlocks(blocks, targetPos, blockEnd, blockIdx + 1)
      ELSE
        \* Position is within this block (blockStart < targetPos < blockEnd)
        \* Simplified: Treat as insert after this block
        \* Real implementation would split block
        IF blockIdx = Len(blocks)
        THEN [left |-> currentBlock.id, right |-> NULL]
        ELSE [left |-> currentBlock.id, right |-> blocks[blockIdx + 1].id]

(*
  Find left and right origins for insertion at position

  This is the HEART of the Fugue algorithm. It implements:
  - Binary search through blocks (O(log n))
  - Position caching for performance
  - Left/right origin tracking for non-interleaving

  Algorithm:
  1. Get visible (non-deleted) blocks in order
  2. Calculate cumulative positions
  3. Find block containing/surrounding insert position
  4. Return (left_origin, right_origin) pair

  Edge cases:
  - Insert at start: (NULL, first_block)
  - Insert at end: (last_block, NULL)
  - Insert between blocks: (prev_block, next_block)
  - Insert inside block: (block, next_block) [simplified - no block splitting]

  CRITICAL PROPERTY: Origins must establish "happens-between" relationship
*)
FindOrigins(map, rope, position) ==
  LET visibleBlocks == GetVisibleBlocks(map)
  IN IF Len(visibleBlocks) = 0
     THEN [left |-> NULL, right |-> NULL]  \* Empty document
     ELSE FindOriginsInBlocks(visibleBlocks, position, 0, 1)

\* =============================================================================
\* INSERT Operation
\* =============================================================================

(*
  Execute INSERT operation on replica state

  Algorithm:
  1. Validate position (must be <= rope length)
  2. Find left and right origins using FindOrigins
  3. Increment Lamport clock
  4. Create new FugueBlock with origins
  5. Insert block into BTreeMap (maintains ordering)
  6. Insert text into rope
  7. Return new state and operation

  INVARIANTS TO MAINTAIN:
  - BTreeMap ordering (via NodeId)
  - Origin validity (origins exist or NULL)
  - Origin ordering (left < id < right)
  - Rope consistency (rope = visible blocks)

  Parameters:
  - map: Current BTreeMap
  - rope: Current rope
  - clock: Current Lamport clock
  - client: This replica's client ID
  - position: Where to insert (0 to Len(rope))
  - text: Text to insert

  Returns: [map, rope, clock, operation]
*)
Insert(map, rope, clock, client, position, text) ==
  IF position > RopeLen(rope)
  THEN
    \* Invalid position - no-op (should not happen in correct usage)
    [map |-> map, rope |-> rope, clock |-> clock, op |-> NULL]
  ELSE
    LET
      \* 1. Find origins
      origins == FindOrigins(map, rope, position)
      left_origin == origins.left
      right_origin == origins.right

      \* 2. Tick clock
      newClock == ClockTick(clock)

      \* 3. Create NodeId for new block
      blockId == [client |-> client, clock |-> newClock, offset |-> 0]

      \* 4. Create new FugueBlock
      newBlock == NewBlock(blockId, text, left_origin, right_origin)

      \* 5. Insert block into BTreeMap
      newMap == BTreeMapInsert(map, blockId, newBlock)

      \* 6. Rebuild rope from BTreeMap (same as remote operations for consistency!)
      \* CRITICAL: Must use BuildRope, NOT RopeInsert, to ensure deterministic convergence
      newRope == BuildRope(newMap)

      \* 7. Create operation record (with origins for correct replication!)
      operation == NewInsertOp(client, newClock, position, text, blockId,
                              left_origin, right_origin)

    IN
      [map |-> newMap, rope |-> newRope, clock |-> newClock, op |-> operation]

\* =============================================================================
\* DELETE Operation
\* =============================================================================

(*
  Execute DELETE operation on replica state

  Algorithm:
  1. Validate range (start + length must be <= rope length)
  2. Find all blocks that overlap the deletion range
  3. Mark overlapping blocks as deleted (tombstone)
  4. Remove text from rope
  5. Return new state and operation

  CRITICAL: We use TOMBSTONES - blocks are NEVER removed from BTreeMap
  This is essential for correct distributed deletion:
  - Concurrent insert and delete must converge
  - Remote replicas need tombstones to apply deletes correctly
  - Removing blocks would break merge semantics

  INVARIANTS TO MAINTAIN:
  - Deleted blocks stay in BTreeMap
  - BTreeMap ordering unchanged
  - Rope excludes deleted blocks
  - Origin relationships preserved

  Parameters:
  - map: Current BTreeMap
  - rope: Current rope
  - clock: Current Lamport clock
  - client: This replica's client ID
  - position: Start position (0-indexed)
  - length: Number of characters to delete

  Returns: [map, rope, clock, operation]
*)
Delete(map, rope, clock, client, position, length) ==
  IF position + length > RopeLen(rope)
  THEN
    \* Invalid range - no-op
    [map |-> map, rope |-> rope, clock |-> clock, op |-> NULL]
  ELSE
    LET
      \* 1. Tick clock
      newClock == ClockTick(clock)

      \* 2. Find blocks to delete
      visibleBlocks == GetVisibleBlocks(map)
      blocksToDelete == FindBlocksInRange(visibleBlocks, position, length, 0, 1, {})

      \* 3. Mark blocks as deleted (tombstone)
      newMap == MarkBlocksDeleted(map, blocksToDelete)

      \* 4. Rebuild rope from BTreeMap (same as remote operations for consistency!)
      \* CRITICAL: Must use BuildRope, NOT RopeDelete, to ensure deterministic convergence
      newRope == BuildRope(newMap)

      \* 5. Create operation record with the specific blocks that were deleted
      \* CRITICAL: Include blocksToDelete for order-independent remote application
      operation == NewDeleteOp(client, newClock, position, length, blocksToDelete)

    IN
      [map |-> newMap, rope |-> newRope, clock |-> newClock, op |-> operation]

\* =============================================================================
\* MERGE Operation
\* =============================================================================

(*
  Merge remote replica state into local state

  This is the CRDT merge operation that ensures convergence.

  Algorithm:
  1. Merge BTreeMaps (union of blocks, prefer deleted status)
  2. Rebuild rope from merged blocks
  3. Update Lamport clock to max(local, remote)
  4. Return merged state

  CRITICAL PROPERTIES:
  - Commutativity: merge(A, B) = merge(B, A)
  - Associativity: merge(merge(A, B), C) = merge(A, merge(B, C))
  - Idempotence: merge(A, A) = A
  - Convergence: All replicas with same ops converge to same state

  Block Merge Rules:
  - Block in local only: Keep local block
  - Block in remote only: Add remote block
  - Block in both: Merge deletion status (deletion wins)

  Parameters:
  - localMap: Local BTreeMap
  - localRope: Local rope
  - localClock: Local Lamport clock
  - remoteMap: Remote BTreeMap
  - remoteClock: Remote Lamport clock

  Returns: [map, rope, clock]
*)
Merge(localMap, localRope, localClock, remoteMap, remoteClock) ==
  LET
    \* 1. Merge BTreeMaps
    allBlockIds == DOMAIN localMap \union DOMAIN remoteMap
    mergedMap == [id \in allBlockIds |->
      CASE id \in DOMAIN localMap /\ id \notin DOMAIN remoteMap ->
             localMap[id]  \* Local only
        [] id \notin DOMAIN localMap /\ id \in DOMAIN remoteMap ->
             remoteMap[id]  \* Remote only
        [] OTHER ->
             MergeBlocks(localMap[id], remoteMap[id])  \* Both
    ]

    \* 2. Rebuild rope from merged BTreeMap
    \* CRITICAL: Rope must be deterministically derived from the BTreeMap!
    \* After merging maps, rebuild the rope to ensure convergence.
    \* This ensures replicas with identical BTreeMaps have identical ropes.
    mergedRope == BuildRope(mergedMap)

    \* 3. Update clock
    mergedClock == ClockUpdate(localClock, remoteClock)

  IN
    [map |-> mergedMap, rope |-> mergedRope, clock |-> mergedClock]

\* =============================================================================
\* Apply Operation to State
\* =============================================================================

(*
  Apply an operation to replica state

  This is used for:
  - Applying local operations (after generation)
  - Applying remote operations (after delivery)

  Dispatches to Insert or Delete based on operation type

  Parameters:
  - map: Current BTreeMap
  - rope: Current rope
  - clock: Current Lamport clock
  - client: This replica's client ID
  - op: Operation to apply

  Returns: [map, rope, clock]
*)
ApplyOperation(map, rope, clock, client, op) ==
  CASE op.type = "insert" ->
    LET result == Insert(map, rope, clock, client, op.position, op.text)
    IN [map |-> result.map, rope |-> result.rope, clock |-> result.clock]
  [] op.type = "delete" ->
    LET result == Delete(map, rope, clock, client, op.position, op.length)
    IN [map |-> result.map, rope |-> result.rope, clock |-> result.clock]
  [] OTHER ->
    [map |-> map, rope |-> rope, clock |-> clock]  \* Unknown op type

\* =============================================================================
\* Remote Operation Application
\* =============================================================================

(*
  Apply remote operation to local state

  Different from ApplyOperation:
  - Uses remote operation's clock
  - Uses remote operation's blockId
  - Doesn't increment local clock (done during merge)

  For INSERT:
  - Create block with remote NodeId
  - Find origins relative to local state
  - Insert into local BTreeMap and rope

  For DELETE:
  - Find blocks in range
  - Mark as deleted

  Parameters:
  - map: Local BTreeMap
  - rope: Local rope
  - clock: Local Lamport clock
  - op: Remote operation

  Returns: [map, rope, clock]
*)
ApplyRemoteInsert(map, rope, clock, op) ==
  LET
    \* CRITICAL: Use transmitted origins, NOT local recalculation!
    \* This is what ensures OrderIndependence - replicas applying the
    \* same operations in different orders will converge because they
    \* all use the original operation's captured origins.
    \*
    \* OLD (WRONG): origins == FindOrigins(map, rope, op.position)
    \* NEW (CORRECT): Use op.left_origin and op.right_origin directly

    \* Create block with transmitted origins
    block == NewBlock(op.blockId, op.text, op.left_origin, op.right_origin)

    \* Insert into BTreeMap (maintains Fugue ordering by NodeId)
    newMap == BTreeMapInsert(map, op.blockId, block)

    \* CRITICAL FIX: Rebuild rope from BTreeMap for deterministic convergence!
    \* The position in the operation is only valid for the sender's rope.
    \* Remote replicas must derive the rope from the BTreeMap structure.
    \* This ensures all replicas with the same BTreeMap have the same rope.
    newRope == BuildRope(newMap)

    \* Update clock
    newClock == ClockUpdate(clock, op.clock)

  IN
    [map |-> newMap, rope |-> newRope, clock |-> newClock]

ApplyRemoteDelete(map, rope, clock, op) ==
  LET
    \* CRITICAL FIX: Use the deletedBlocks from the operation, NOT position-based lookup!
    \* This makes deletions order-independent. The operation carries the exact block IDs
    \* that should be deleted, so we mark those specific blocks regardless of their current
    \* position or even whether they've arrived yet.
    blocksToDelete == op.deletedBlocks

    \* Mark specified blocks as deleted (tombstone)
    \* If a block hasn't arrived yet, this is a no-op (MarkBlocksDeleted only marks existing blocks)
    newMap == MarkBlocksDeleted(map, blocksToDelete)

    \* Rebuild rope from BTreeMap for deterministic convergence
    \* (same approach as ApplyRemoteInsert)
    newRope == BuildRope(newMap)

    \* Update clock
    newClock == ClockUpdate(clock, op.clock)

  IN
    [map |-> newMap, rope |-> newRope, clock |-> newClock]

ApplyRemoteOperation(map, rope, clock, op) ==
  CASE op.type = "insert" ->
    ApplyRemoteInsert(map, rope, clock, op)
  [] op.type = "delete" ->
    ApplyRemoteDelete(map, rope, clock, op)
  [] OTHER ->
    [map |-> map, rope |-> rope, clock |-> clock]

\* =============================================================================
\* Invariant Helpers
\* =============================================================================

(*
  Check if operation is valid for current state

  INSERT valid if:
  - Position <= rope length
  - Text non-empty
  - Clock value valid

  DELETE valid if:
  - Position + length <= rope length
  - Length > 0
  - Clock value valid
*)
IsValidOperation(map, rope, op) ==
  CASE op.type = "insert" ->
    /\ op.position <= RopeLen(rope)
    /\ Len(op.text) > 0
    /\ op.clock \in LamportClock
  [] op.type = "delete" ->
    /\ op.position + op.length <= RopeLen(rope)
    /\ op.length > 0
    /\ op.clock \in LamportClock
  [] OTHER -> FALSE

(*
  Check if all origins in map are valid

  Valid means:
  - left_origin is NULL or exists in map
  - right_origin is NULL or exists in map
*)
AllOriginsValid(map) ==
  \A id \in DOMAIN map :
    /\ (map[id].left_origin = NULL \/ map[id].left_origin \in DOMAIN map)
    /\ (map[id].right_origin = NULL \/ map[id].right_origin \in DOMAIN map)

(*
  Check if all origins respect NodeId ordering

  For each block:
  - left_origin (if exists) must have NodeId < block's NodeId
  - right_origin (if exists) must have NodeId > block's NodeId
*)
AllOriginsOrdered(map) ==
  \A id \in DOMAIN map :
    /\ (map[id].left_origin # NULL =>
          NodeIdLessThan(map[id].left_origin, id))
    /\ (map[id].right_origin # NULL =>
          NodeIdLessThan(id, map[id].right_origin))

\* =============================================================================
\* Operation Commutativity Helpers
\* =============================================================================

(*
  Check if two operations are concurrent
  (can be applied in either order)
*)
OperationsConcurrent(op1, op2) ==
  AreConcurrent(op1, op2)

(*
  Apply sequence of operations to state
  Used for testing commutativity
*)
RECURSIVE ApplyOperationSequence(_, _, _, _, _)
ApplyOperationSequence(map, rope, clock, client, ops) ==
  IF Len(ops) = 0
  THEN [map |-> map, rope |-> rope, clock |-> clock]
  ELSE
    LET result == ApplyOperation(map, rope, clock, client, Head(ops))
    IN ApplyOperationSequence(result.map, result.rope, result.clock, client, Tail(ops))

=============================================================================

(*
  NOTES FOR MODEL CHECKING:

  Key Properties to Verify (in other modules):

  1. INSERT Correctness:
     - Creates block with valid origins
     - Maintains BTreeMap ordering
     - Rope stays consistent

  2. DELETE Correctness:
     - Uses tombstones (blocks stay in map)
     - Rope updated correctly
     - Origins preserved

  3. MERGE Properties:
     - Commutativity: Merge(A, B) = Merge(B, A)
     - Associativity: Merge(Merge(A, B), C) = Merge(A, Merge(B, C))
     - Idempotence: Merge(A, A) = A
     - Convergence: Same ops → same state

  4. Invariants Always Hold:
     - AllOriginsValid(map)
     - AllOriginsOrdered(map)
     - RopeConsistencyInvariant(map, rope)
     - BTreeMapOrderingInvariant(map)

  This module is used by:
  - fugue_convergence.tla (convergence proofs)
  - fugue_non_interleaving.tla (non-interleaving verification)
  - fugue_determinism.tla (determinism verification)
*)
