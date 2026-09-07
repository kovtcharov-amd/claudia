/**
 * Workspace scope resolution for the Claudia MCP tools.
 *
 * A task spawned with `isolate: true` runs in its own git worktree, which is
 * registered as its own workspace whose `worktreeParentId` points at the repo it
 * came from. Scoping a query to that id alone hides every sibling task, so the
 * duplicate-work pre-flight check (`claudia_list_tasks`) returns an empty list and
 * the agent reads that as "nothing else is running" — which is how two agents end
 * up opening two PRs for the same issue.
 *
 * Scope therefore resolves to the *root repo* workspace, then fans back out to it
 * and all of its worktree children, so siblings can see each other.
 */

/** The subset of `Workspace` this module needs. Keeps it decoupled from shared/. */
export interface WorkspaceScopeEntry {
    id: string;
    worktreeParentId?: string;
}

/**
 * Guard against a `worktreeParentId` cycle in a hand-edited or legacy config.
 * `addWorktreeWorkspace` flattens worktrees to one level under the repo, so a
 * healthy config never walks more than once.
 */
const MAX_PARENT_WALK = 16;

/**
 * Walk up to the top-level repo workspace that `workspaceId` belongs to.
 *
 * Returns `workspaceId` itself when it is already top-level, or when its parent is
 * not registered — an unregistered parent means we cannot prove sibling membership,
 * and inventing one would widen scope to workspaces the caller may not own.
 */
export function resolveRootWorkspaceId(
    workspaces: readonly WorkspaceScopeEntry[],
    workspaceId: string
): string {
    const byId = new Map(workspaces.map(ws => [ws.id, ws]));

    let current = byId.get(workspaceId);
    let rootId = workspaceId;

    for (let hops = 0; current?.worktreeParentId && hops < MAX_PARENT_WALK; hops++) {
        const parentId = current.worktreeParentId;
        const parent = byId.get(parentId);
        if (!parent) return rootId;
        rootId = parentId;
        current = parent;
        if (rootId === workspaceId) break; // self-parent cycle
    }

    return rootId;
}

/**
 * Every workspace id in scope for `workspaceId`: the root repo workspace plus all
 * of its worktree children (which includes `workspaceId` itself).
 *
 * `workspaceId` is always present in the result, even when it is not registered —
 * a task can always see itself.
 */
export function scopedWorkspaceIds(
    workspaces: readonly WorkspaceScopeEntry[],
    workspaceId: string
): Set<string> {
    const ids = new Set<string>();
    if (!workspaceId) return ids;

    ids.add(workspaceId);

    const rootId = resolveRootWorkspaceId(workspaces, workspaceId);
    ids.add(rootId);

    for (const ws of workspaces) {
        if (ws.worktreeParentId === rootId) ids.add(ws.id);
    }

    return ids;
}
