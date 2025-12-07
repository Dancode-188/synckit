--------------------------- MODULE fugue_core ---------------------------
(*
  Fugue Text CRDT - Core Data Structures and Foundations

  This module defines the fundamental data structures for the Fugue algorithm:
  - NodeId: Unique identifier with total ordering (client_id, clock, offset)
  - FugueBlock: Text block with CRDT metadata (origins, deletion status)
  - BTreeMap: Ordered block storage maintaining Fugue structure
  - Rope: Simplified text representation for model checking
  - LamportClock: Causality tracking

  These definitions are used by all other Fugue verification specs.

  Mathematical Foundation:
  - NodeId provides total ordering for deterministic convergence
  - Origins (left, right) enable maximal non-interleaving property
  - Tombstones (deleted flag) ensure correct distributed deletion
  - Lamport clocks track causality (happens-before relation)
*)

EXTENDS Integers, Sequences, TLC, FiniteSets

CONSTANTS
  Clients,        \* Set of replica identifiers {c1, c2, c3}
  MaxClock,       \* Maximum Lamport clock value (for model checking bounds)
  NULL            \* Sentinel value for None/null

(*
  Character alphabet for model checking
  Limited to keep state space manageable
*)
Chars == {"a", "b", "c", "x", "y", "z"}

(*
  Text strings (sequences of characters)
  Limited length for model checking performance
*)
Texts == {<<>>,  <<   "a">>, <<"b">>, <<"c">>,
          <<"a", "b">>, <<"b", "c">>, <<"x", "y">>,
          <<"a", "b", "c">>, <<"x", "y", "z">>}

\* =============================================================================
\* NodeId: Unique Identifier with Total Ordering
\* =============================================================================

(*
  NodeId uniquely identifies a Fugue block and provides deterministic ordering.

  Components:
  - client: Replica that created the block
  - clock: Lamport timestamp (causality tracking)
  - offset: Position within batch operation (for RLE)

  Ordering rules (lexicographic):
  1. Primary: clock (lower comes first)
  2. Tiebreaker 1: client (lexicographic order)
  3. Tiebreaker 2: offset (lower first)

  This ordering is CRITICAL for Fugue's correctness - it ensures:
  - Deterministic convergence (same ops → same order)
  - Causal consistency (happens-before preserved)
  - Conflict resolution (concurrent ops ordered deterministically)
*)
NodeId == [client: Clients, clock: 1..MaxClock, offset: 0..10]

(*
  Client ordering helper - converts Clients set to a deterministic sequence
  This allows us to assign each client a numeric index for comparison
*)
RECURSIVE ClientSetToSeq(_)
ClientSetToSeq(s) ==
  IF s = {} THEN <<>>
  ELSE LET chosen == CHOOSE c \in s : TRUE
       IN <<chosen>> \o ClientSetToSeq(s \ {chosen})

ClientSeq == ClientSetToSeq(Clients)

(*
  Get the index of a client in the ClientSeq (1-based)
  This provides a deterministic numeric ordering for clients
*)
RECURSIVE ClientIndexHelper(_, _, _)
ClientIndexHelper(client, seq, idx) ==
  IF idx > Len(seq) THEN 0  \* Not found (shouldn't happen)
  ELSE IF seq[idx] = client THEN idx
  ELSE ClientIndexHelper(client, seq, idx + 1)

ClientIndex(client) == ClientIndexHelper(client, ClientSeq, 1)

(*
  Convert NodeId to tuple for comparison
  We use ClientIndex to convert model values to integers
*)
NodeIdToTuple(n) == <<n.clock, ClientIndex(n.client), n.offset>>

(*
  Total ordering for NodeIds

  Returns TRUE if n1 < n2 in Fugue ordering

  CRITICAL PROPERTY: This must define a total order
  - Antisymmetric: n1 < n2 => ~(n2 < n1)
  - Transitive: n1 < n2 /\ n2 < n3 => n1 < n3
  - Total: \A n1, n2 : n1 < n2 \/ n2 < n1 \/ n1 = n2

  Lexicographic comparison of <<clock, clientIndex, offset>>
*)
NodeIdLessThan(n1, n2) ==
  \/ n1.clock < n2.clock
  \/ /\ n1.clock = n2.clock
     /\ ClientIndex(n1.client) < ClientIndex(n2.client)
  \/ /\ n1.clock = n2.clock
     /\ ClientIndex(n1.client) = ClientIndex(n2.client)
     /\ n1.offset < n2.offset

(*
  NodeId equality
*)
NodeIdEqual(n1, n2) ==
  /\ n1.client = n2.client
  /\ n1.clock = n2.clock
  /\ n1.offset = n2.offset

(*
  NodeId comparison (returns "LT", "EQ", or "GT")
  Used for BTreeMap ordering
*)
NodeIdCompare(n1, n2) ==
  IF NodeIdLessThan(n1, n2) THEN "LT"
  ELSE IF NodeIdEqual(n1, n2) THEN "EQ"
  ELSE "GT"

\* =============================================================================
\* FugueBlock: Text Block with CRDT Metadata
\* =============================================================================

(*
  FugueBlock represents a contiguous sequence of characters with CRDT metadata.

  Fields:
  - id: Unique NodeId for this block
  - text: String content (RLE: multiple characters in one block)
  - left_origin: NodeId of block inserted after (NULL = start)
  - right_origin: NodeId of block inserted before (NULL = end)
  - deleted: Tombstone flag (blocks never removed, only marked)

  The left_origin and right_origin are KEY to Fugue's maximal non-interleaving:
  - They create a "happens-between" relationship
  - Concurrent inserts with same origins don't interleave
  - This is what makes Fugue superior to YATA/RGA

  Tombstone deletion is CRITICAL for convergence:
  - Deleted blocks stay in BTreeMap
  - Ensures correct merging of concurrent operations
  - Prevents divergence when delete and insert race
*)
FugueBlock == [
  id: NodeId,
  text: Texts,
  left_origin: NodeId \union {NULL},
  right_origin: NodeId \union {NULL},
  deleted: BOOLEAN
]

(*
  Create a new FugueBlock
*)
NewBlock(nodeId, text, leftOrigin, rightOrigin) ==
  [id |-> nodeId,
   text |-> text,
   left_origin |-> leftOrigin,
   right_origin |-> rightOrigin,
   deleted |-> FALSE]

(*
  Mark a block as deleted (tombstone)
*)
MarkDeleted(block) ==
  [block EXCEPT !.deleted = TRUE]

(*
  Check if block is deleted
*)
IsDeleted(block) ==
  block.deleted

(*
  Get block length (number of characters)
*)
BlockLen(block) ==
  Len(block.text)

\* =============================================================================
\* BTreeMap: Ordered Block Storage
\* =============================================================================

(*
  BTreeMap stores blocks ordered by NodeId

  Representation: Function from NodeId to FugueBlock
  - Domain represents keys (block IDs)
  - Range represents values (blocks)
  - Iteration order determined by NodeIdLessThan

  INVARIANT: BTreeMap must maintain sorted order
  This is CRITICAL for deterministic convergence
*)
BTreeMap == [NodeId -> FugueBlock]

(*
  Empty BTreeMap
*)
EmptyBTreeMap == [n \in {} |-> CHOOSE b \in FugueBlock : TRUE]

(*
  Insert block into BTreeMap
  Returns new BTreeMap with block added
*)
BTreeMapInsert(map, blockId, block) ==
  [id \in (DOMAIN map \union {blockId}) |->
    IF id = blockId THEN block ELSE map[id]]

(*
  Remove block from BTreeMap
  (Not used in Fugue - blocks are tombstoned, not removed)
*)
BTreeMapRemove(map, blockId) ==
  [id \in (DOMAIN map \ {blockId}) |-> map[id]]

(*
  Get sorted sequence of NodeIds from BTreeMap
  Ordered according to NodeIdLessThan

  This represents the BTreeMap iteration order
  CRITICAL for Fugue ordering
*)
RECURSIVE SortNodeIds(_)
SortNodeIds(ids) ==
  IF ids = {} THEN <<>>
  ELSE LET minId == CHOOSE id \in ids :
                      \A other \in ids : NodeIdLessThan(id, other) \/ id = other
       IN <<minId>> \o SortNodeIds(ids \ {minId})

(*
  Get blocks in Fugue order (sorted by NodeId)
*)
GetOrderedBlocks(map) ==
  LET sortedIds == SortNodeIds(DOMAIN map)
  IN [i \in 1..Len(sortedIds) |-> map[sortedIds[i]]]

(*
  Get only non-deleted blocks
*)
GetVisibleBlocks(map) ==
  LET allBlocks == GetOrderedBlocks(map)
  IN SelectSeq(allBlocks, LAMBDA b : ~b.deleted)

\* =============================================================================
\* Rope: Text Content Representation
\* =============================================================================

(*
  Rope represents the visible text content

  Simplified for model checking as Seq(Char)
  Real implementation uses rope data structure for O(log n) ops

  INVARIANT: Rope must match non-deleted blocks in BTreeMap
  rope = Concat(blocks[i].text for all non-deleted blocks in order)
*)
Rope == Seq(Chars)

(*
  Empty rope
*)
EmptyRope == <<>>

(*
  Sort sibling blocks (same left_origin) deterministically

  CRITICAL FIX: Sort ONLY by NodeId for deterministic convergence!

  The right_origin is used during INSERTION to find the correct position,
  but once blocks are in the tree, siblings are ordered purely by NodeId.
  This ensures replicas converge regardless of delivery order.

  Previous approach using right_origin as a topological constraint was wrong:
  it caused the ordering of concurrent blocks to depend on the presence  of non-concurrent blocks, violating determinism.
*)
SortSiblings(ids, map) == SortNodeIds(ids)

(*
  Build rope from BTreeMap using Fugue traversal

  CRITICAL: This traverses the CRDT structure using origin relationships,
  NOT by iterating blocks in NodeId order!

  Algorithm:
  1. Start with roots (blocks with left_origin = NULL)
  2. For each block, recursively place its children
  3. Children = blocks with left_origin pointing to this block
  4. Multiple children ordered by right_origin constraints, then NodeId

  This ensures replicas with same blocks converge to same rope,
  regardless of operation delivery order.
*)

\* Recursively build rope from a block and all its descendants
\* Returns: [rope |-> Seq(Char), visited |-> SUBSET NodeId]
RECURSIVE BuildRopeFromId(_, _, _)
BuildRopeFromId(map, block_id, visited) ==
  IF block_id \in visited THEN [rope |-> EmptyRope, visited |-> visited]
  ELSE
    LET
      block == map[block_id]
      text == IF block.deleted THEN EmptyRope ELSE block.text
      new_visited == visited \union {block_id}

      \* Find all children (blocks with left_origin pointing to this block)
      children == {id \in DOMAIN map : map[id].left_origin = block_id}
      sorted_children == SortSiblings(children, map)

      \* Process all children and their descendants
      RECURSIVE ProcessChildren(_, _)
      ProcessChildren(child_list, state) ==
        IF Len(child_list) = 0 THEN state
        ELSE
          LET
            child_result == BuildRopeFromId(map, child_list[1], state.visited)
            new_state == [rope |-> state.rope \o child_result.rope,
                         visited |-> child_result.visited]
          IN
            ProcessChildren(Tail(child_list), new_state)

      children_result == ProcessChildren(sorted_children,
                                         [rope |-> EmptyRope, visited |-> new_visited])
    IN
      [rope |-> text \o children_result.rope,
       visited |-> children_result.visited]

BuildRope(map) ==
  IF map = <<>> THEN EmptyRope
  ELSE
    LET
      \* Find roots (blocks with left_origin = NULL)
      roots == {id \in DOMAIN map : map[id].left_origin = NULL}
      sorted_roots == SortSiblings(roots, map)

      \* Process all roots and their descendants
      RECURSIVE ProcessRoots(_, _)
      ProcessRoots(root_list, state) ==
        IF Len(root_list) = 0 THEN state
        ELSE
          LET
            root_result == BuildRopeFromId(map, root_list[1], state.visited)
            new_state == [rope |-> state.rope \o root_result.rope,
                         visited |-> root_result.visited]
          IN
            ProcessRoots(Tail(root_list), new_state)

      result == ProcessRoots(sorted_roots, [rope |-> EmptyRope, visited |-> {}])
    IN
      result.rope

(*
  Insert text into rope at position

  Handles edge cases:
  - Empty rope: Insert at position 0
  - Position out of bounds: Clamp to valid range
*)
RopeInsert(rope, pos, text) ==
  IF Len(rope) = 0 THEN text  \* Insert into empty rope
  ELSE IF pos <= 0 THEN text \o rope  \* Insert at beginning
  ELSE IF pos >= Len(rope) THEN rope \o text  \* Insert at end
  ELSE
    LET
      prefix == SubSeq(rope, 1, pos)
      suffix == SubSeq(rope, pos + 1, Len(rope))
    IN
      prefix \o text \o suffix

(*
  Delete text from rope

  Handles edge cases:
  - Empty rope: Cannot delete, return unchanged
  - Invalid position: Return unchanged
  - Invalid length: Return unchanged
  - Delete past end: Delete to end of rope
*)
RopeDelete(rope, pos, len) ==
  IF Len(rope) = 0 THEN rope  \* Cannot delete from empty rope
  ELSE IF pos < 1 \/ pos > Len(rope) THEN rope  \* Position out of bounds
  ELSE IF len <= 0 THEN rope  \* Invalid length
  ELSE
    LET
      \* Avoid SubSeq with invalid bounds (e.g., SubSeq(<<>>, 1, 0))
      prefix == IF pos > 1 THEN SubSeq(rope, 1, pos - 1) ELSE <<>>
      suffix_start == pos + len
      suffix == IF suffix_start <= Len(rope) THEN SubSeq(rope, suffix_start, Len(rope)) ELSE <<>>
    IN
      prefix \o suffix

(*
  Get rope length
*)
RopeLen(rope) ==
  Len(rope)

\* =============================================================================
\* Lamport Clock: Causality Tracking
\* =============================================================================

(*
  Lamport Clock provides logical time for causality tracking

  Properties:
  - Monotonically increasing (never decreases)
  - Starts at 0
  - Ticks on local operations
  - Updates to max on merge

  Guarantees happens-before relationship:
  - If op1 happens-before op2, then clock(op1) < clock(op2)
  - Converse not always true (concurrent ops can have any clock relation)
*)
LamportClock == 0..MaxClock

(*
  Initial clock value
*)
InitialClock == 0

(*
  Tick clock (increment for local operation)
*)
ClockTick(clock) ==
  IF clock < MaxClock THEN clock + 1 ELSE clock

(*
  Update clock from remote (merge)
  Sets clock to max(local, remote)
*)
ClockUpdate(localClock, remoteClock) ==
  IF localClock > remoteClock THEN localClock ELSE remoteClock

\* =============================================================================
\* Helper Functions for Position and Origins
\* =============================================================================

(*
  Find block containing position
  Returns block index in sorted sequence, or 0 if position before all blocks
*)
RECURSIVE FindBlockAtPosition(_, _, _)
FindBlockAtPosition(blocks, position, currentPos) ==
  IF Len(blocks) = 0 THEN 0
  ELSE
    LET firstBlock == Head(blocks)
        blockLen == BlockLen(firstBlock)
    IN IF position < currentPos + blockLen
       THEN 1  \* Found the block
       ELSE
         LET rest == FindBlockAtPosition(Tail(blocks), position, currentPos + blockLen)
         IN IF rest = 0 THEN 0 ELSE rest + 1

(*
  Calculate cumulative position of block in rope
  Used for origin finding and position caching
*)
RECURSIVE BlockPosition(_, _, _)
BlockPosition(blocks, targetId, currentPos) ==
  IF Len(blocks) = 0 THEN NULL
  ELSE IF blocks[1].id = targetId THEN currentPos
  ELSE BlockPosition(Tail(blocks), targetId, currentPos + BlockLen(blocks[1]))

(*
  Check if text appears contiguously in rope
  Used for non-interleaving verification
*)
IsContiguousInRope(rope, text) ==
  IF Len(text) = 0 THEN TRUE
  ELSE \E startPos \in 1..Len(rope) :
    /\ startPos + Len(text) - 1 <= Len(rope)
    /\ SubSeq(rope, startPos, startPos + Len(text) - 1) = text

\* =============================================================================
\* Concurrency Detection
\* =============================================================================

(*
  Check if two operations are concurrent
  (neither happened before the other)

  Based on Lamport clocks and client IDs:
  - Same client, different clocks: NOT concurrent (sequential)
  - Different clients, one clock <= other's known clock: NOT concurrent
  - Otherwise: Concurrent

  Simplified version for model checking
*)
AreConcurrent(op1, op2) ==
  /\ op1.client # op2.client
  /\ op1.clock = op2.clock  \* FIXED: Same clock from different clients = concurrent!

(*
  Check if op1 happened-before op2
  Based on Lamport clock
*)
HappensBefore(op1, op2) ==
  op1.clock < op2.clock

\* =============================================================================
\* Type Invariants for Core Data Structures
\* =============================================================================

(*
  Type invariant for BTreeMap
  Ensures all blocks have valid structure
*)
BTreeMapTypeInvariant(map) ==
  \A id \in DOMAIN map :
    /\ map[id].id = id  \* Block ID matches key
    /\ map[id].text \in Texts
    /\ map[id].left_origin \in (NodeId \union {NULL})
    /\ map[id].right_origin \in (NodeId \union {NULL})
    /\ map[id].deleted \in BOOLEAN

(*
  Ordering invariant for BTreeMap
  Ensures blocks are ordered by NodeId
  CRITICAL PROPERTY
*)
BTreeMapOrderingInvariant(map) ==
  LET sortedIds == SortNodeIds(DOMAIN map)
  IN \A i, j \in 1..Len(sortedIds) :
       i < j => NodeIdLessThan(sortedIds[i], sortedIds[j])

(*
  Rope consistency invariant
  Rope must match visible text from BTreeMap

  WARNING: This is NOT a valid invariant for Fugue!
  The rope (TEXT order) and BTreeMap (NodeId order) are maintained independently.
  The rope is updated by insert/delete operations at positions, NOT derived
  from BTreeMap iteration. This predicate is kept for documentation only.
*)
RopeConsistencyInvariant(map, rope) ==
  rope = BuildRope(map)

\* =============================================================================
\* Origin Validity Invariants
\* =============================================================================

(*
  Origin validity: Origins must exist in BTreeMap (if not NULL)
  This ensures structural integrity of the Fugue tree
*)
OriginsValid(map) ==
  \A id \in DOMAIN map :
    /\ map[id].left_origin # NULL =>
         map[id].left_origin \in DOMAIN map
    /\ map[id].right_origin # NULL =>
         map[id].right_origin \in DOMAIN map

(*
  Origin ordering: If left_origin exists, it must come before this block
  If right_origin exists, it must come after this block

  WARNING: This is NOT a valid invariant for Fugue!
  Origins indicate insertion intent in the TEXT, not BTreeMap ordering.
  A block can have right_origin < block_id when inserting at beginning.

  This predicate is kept for documentation purposes only.
*)
OriginsOrdered(map) ==
  \A id \in DOMAIN map :
    /\ map[id].left_origin # NULL =>
         NodeIdLessThan(map[id].left_origin, id)
    /\ map[id].right_origin # NULL =>
         NodeIdLessThan(id, map[id].right_origin)

\* =============================================================================
\* Utility Functions
\* =============================================================================

(*
  Maximum of two values
*)
Max(a, b) ==
  IF a > b THEN a ELSE b

(*
  Minimum of two values
*)
Min(a, b) ==
  IF a < b THEN a ELSE b

(*
  Range: {from..to}
*)
Range(from, to) ==
  {i \in Int : from <= i /\ i <= to}

(*
  Cardinality of a set (number of elements)
  Built-in but redefined for clarity
*)
Card(S) == Cardinality(S)

=============================================================================

(*
  NOTES FOR MODEL CHECKING:

  Constants to define:
  - Clients = {c1, c2, c3}
  - MaxClock = 10
  - NULL = "null"  (model value)

  Invariants to check in other modules:
  - BTreeMapTypeInvariant
  - BTreeMapOrderingInvariant
  - RopeConsistencyInvariant
  - OriginsValid
  - OriginsOrdered

  These are the foundations - all other Fugue specs extend this module.
*)
