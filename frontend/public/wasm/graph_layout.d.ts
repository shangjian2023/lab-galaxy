declare namespace wasm_bindgen {
    /* tslint:disable */
    /* eslint-disable */

    /**
     * Allocate `len` floats for an init buffer. The arena is reused by the next
     * `graph_init`, so it stays bounded (nodes + links, never grows per tick).
     */
    export function graph_alloc(len: number): number;

    /**
     * Allocate `len` u32 (as raw pointer; JS writes via Uint32Array view).
     */
    export function graph_alloc_u32(len: number): number;

    export function graph_alpha(): number;

    /**
     * Layout bounding box as [min_x, min_y, max_x, max_y].
     */
    export function graph_bounds(): Float32Array;

    /**
     * Apply new physics settings (does not reheat by itself).
     */
    export function graph_config(repel: number, center_strength: number, link_distance: number, link_strength: number, cluster_force: number): void;

    export function graph_done(): boolean;

    export function graph_edge_count(): number;

    /**
     * Pointer to 2*edge_count u32: sanitized edge pairs.
     */
    export function graph_edges_ptr(): number;

    /**
     * End an active drag; `keep_pinned` drops the node exactly where released.
     */
    export function graph_end_drag(index: number, keep_pinned: boolean, vx: number, vy: number): number;

    /**
     * Engine ABI version; lets the JS wrapper verify the loaded module matches.
     */
    export function graph_engine_version(): number;

    /**
     * Pointer to node_count u8 flags: 1 = pinned, 2 = pinned under drag.
     */
    export function graph_fixed_ptr(): number;

    export function graph_heat(alpha: number): void;

    /**
     * Build the engine from linear buffers.
     *
     * `nodes_ptr` points at `node_count * 3` floats: [x, y, type] per node.
     * `links_ptr` points at `link_count * 2` u32: [source, target] per link.
     * Non-finite coordinates fall back to deterministic spiral placement.
     */
    export function graph_init(nodes_ptr: number, node_count: number, links_ptr: number, link_count: number, cx: number, cy: number, alpha: number, seed: bigint, repel: number, center_strength: number, link_distance: number, link_strength: number, cluster_force: number): void;

    /**
     * Expose wasm memory so the JS side can build typed-array views over the
     * pointer-based buffers (`wasm_bindgen::memory` also covers this, but an
     * explicit export keeps the protocol self-describing).
     */
    export function graph_memory(): any;

    export function graph_node_count(): number;

    export function graph_pin_sequence(): number;

    /**
     * Pointer to 2*node_count floats: interleaved [x0, y0, x1, y1, ...].
     */
    export function graph_positions_ptr(): number;

    export function graph_set_ambient(alpha: number): void;

    export function graph_set_center(cx: number, cy: number): void;

    /**
     * Pin/unpin; returns the new pin sequence (0 if index out of range).
     */
    export function graph_set_fixed(index: number, fixed: boolean): number;

    export function graph_set_target(index: number, x: number, y: number, dragging: boolean): void;

    /**
     * Advance `steps` fixed ticks; returns alpha afterwards.
     */
    export function graph_step(steps: number): number;

    /**
     * Pointer to 2*node_count floats: per-node drag/pin target positions.
     */
    export function graph_targets_ptr(): number;

    export function graph_tick(): number;

}
declare type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

declare interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly graph_alloc: (a: number) => number;
    readonly graph_alloc_u32: (a: number) => number;
    readonly graph_alpha: () => number;
    readonly graph_bounds: () => [number, number];
    readonly graph_config: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly graph_done: () => number;
    readonly graph_edge_count: () => number;
    readonly graph_edges_ptr: () => number;
    readonly graph_end_drag: (a: number, b: number, c: number, d: number) => number;
    readonly graph_engine_version: () => number;
    readonly graph_fixed_ptr: () => number;
    readonly graph_heat: (a: number) => void;
    readonly graph_init: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: bigint, i: number, j: number, k: number, l: number, m: number) => void;
    readonly graph_memory: () => any;
    readonly graph_node_count: () => number;
    readonly graph_pin_sequence: () => number;
    readonly graph_positions_ptr: () => number;
    readonly graph_set_ambient: (a: number) => void;
    readonly graph_set_center: (a: number, b: number) => void;
    readonly graph_set_fixed: (a: number, b: number) => number;
    readonly graph_set_target: (a: number, b: number, c: number, d: number) => void;
    readonly graph_step: (a: number) => number;
    readonly graph_targets_ptr: () => number;
    readonly graph_tick: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

declare type SyncInitInput = BufferSource | WebAssembly.Module;

declare namespace wasm_bindgen {
    /**
     * Instantiates the given `module`, which can either be bytes or
     * a precompiled `WebAssembly.Module`.
     *
     * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
     *
     * @returns {InitOutput}
     */
    export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;
}

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
declare function wasm_bindgen (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
