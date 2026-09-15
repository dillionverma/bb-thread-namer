---
name: thread-namer
description: Name or repair BB thread titles with the thread-namer plugin.
---

Use `bb thread-namer status` to inspect automatic naming and agent selection.
`bb thread-namer inherit <threadId>` repairs an unnamed continuation using its
referenced topic without running a model. It respects disabled automatic naming
and manual titles. Reference chains are bounded to eight hops.
`bb thread-namer rename [<threadId>]` generates a name on demand and explicitly
replaces an existing title, including a manual title. The ID defaults to the
calling thread. Hidden and child threads are excluded.

Configure mode, length, instruction and timeout with `bb plugin config thread-namer`.
Inherited titles are provisional and can be refined after meaningful conversation
arrives, including in once mode. Failed naming retains the existing title. Automatic
naming preserves manual names; concurrent manual edits cancel a worker's write.
