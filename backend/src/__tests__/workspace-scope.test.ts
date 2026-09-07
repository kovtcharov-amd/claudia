import { describe, it, expect } from 'vitest';
import {
    resolveRootWorkspaceId,
    scopedWorkspaceIds,
    type WorkspaceScopeEntry,
} from '../workspace-scope.js';

const REPO = 'C:\\Work\\gaia';
const WT_A = 'C:\\Work\\gaia\\.claudia-worktrees\\claudia-task-aaaa';
const WT_B = 'C:\\Work\\gaia\\.claudia-worktrees\\claudia-task-bbbb';
const OTHER_REPO = 'C:\\Work\\claudia';
const OTHER_WT = 'C:\\Work\\claudia\\.claudia-worktrees\\claudia-task-cccc';

const WORKSPACES: WorkspaceScopeEntry[] = [
    { id: REPO },
    { id: WT_A, worktreeParentId: REPO },
    { id: WT_B, worktreeParentId: REPO },
    { id: OTHER_REPO },
    { id: OTHER_WT, worktreeParentId: OTHER_REPO },
];

describe('resolveRootWorkspaceId', () => {
    it('returns a top-level workspace unchanged', () => {
        expect(resolveRootWorkspaceId(WORKSPACES, REPO)).toBe(REPO);
    });

    it('resolves a worktree to its parent repo', () => {
        expect(resolveRootWorkspaceId(WORKSPACES, WT_A)).toBe(REPO);
    });

    it('returns the id itself when the workspace is not registered', () => {
        expect(resolveRootWorkspaceId(WORKSPACES, 'C:\\Work\\unknown')).toBe('C:\\Work\\unknown');
    });

    it('does not invent a root when the parent is not registered', () => {
        const orphan: WorkspaceScopeEntry[] = [{ id: WT_A, worktreeParentId: REPO }];
        expect(resolveRootWorkspaceId(orphan, WT_A)).toBe(WT_A);
    });

    it('flattens a nested worktree chain to the repo root', () => {
        const nested: WorkspaceScopeEntry[] = [
            { id: REPO },
            { id: WT_A, worktreeParentId: REPO },
            { id: WT_B, worktreeParentId: WT_A },
        ];
        expect(resolveRootWorkspaceId(nested, WT_B)).toBe(REPO);
    });

    it('terminates on a self-parent cycle', () => {
        const cyclic: WorkspaceScopeEntry[] = [{ id: WT_A, worktreeParentId: WT_A }];
        expect(resolveRootWorkspaceId(cyclic, WT_A)).toBe(WT_A);
    });

    it('terminates on a two-node cycle', () => {
        const cyclic: WorkspaceScopeEntry[] = [
            { id: WT_A, worktreeParentId: WT_B },
            { id: WT_B, worktreeParentId: WT_A },
        ];
        expect(() => resolveRootWorkspaceId(cyclic, WT_A)).not.toThrow();
    });
});

describe('scopedWorkspaceIds', () => {
    it('gives a worktree task visibility of its siblings', () => {
        // The regression this module exists for: scoping to WT_A alone returned only
        // WT_A, so the duplicate-work check saw an empty list and two agents opened
        // two PRs for the same issue.
        const ids = scopedWorkspaceIds(WORKSPACES, WT_A);
        expect(ids.has(WT_B)).toBe(true);
        expect(ids.has(REPO)).toBe(true);
        expect(ids.has(WT_A)).toBe(true);
    });

    it('keeps a parent workspace seeing all of its worktree children', () => {
        const ids = scopedWorkspaceIds(WORKSPACES, REPO);
        expect(ids).toEqual(new Set([REPO, WT_A, WT_B]));
    });

    it('does not leak across unrelated repositories', () => {
        const ids = scopedWorkspaceIds(WORKSPACES, WT_A);
        expect(ids.has(OTHER_REPO)).toBe(false);
        expect(ids.has(OTHER_WT)).toBe(false);
    });

    it('always includes the caller, even when unregistered', () => {
        expect(scopedWorkspaceIds(WORKSPACES, 'C:\\Work\\ghost')).toEqual(
            new Set(['C:\\Work\\ghost'])
        );
    });

    it('returns an empty set when no workspace is configured', () => {
        expect(scopedWorkspaceIds(WORKSPACES, '')).toEqual(new Set());
    });

    it('scopes a lone top-level workspace to itself', () => {
        expect(scopedWorkspaceIds([{ id: REPO }], REPO)).toEqual(new Set([REPO]));
    });
});
