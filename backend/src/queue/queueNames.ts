/**
 * BullMQ queue names.
 *
 * phase-02-architecture.md refers to these conceptually as "sync:jira" /
 * "sync:github", but BullMQ forbids colons in queue names (it uses them
 * internally for Redis key namespacing) — `new Queue('sync:jira', ...)`
 * throws "Queue name cannot contain :" at construction time. These
 * hyphenated names are the same two independent, per-provider queues the
 * architecture describes (one provider's backlog/outage never blocks the
 * other's), just spelled in a way BullMQ accepts.
 */
export const JIRA_QUEUE_NAME = 'sync-jira';
export const GITHUB_QUEUE_NAME = 'sync-github';
