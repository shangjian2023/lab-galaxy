let wasm_bindgen = (function(exports) {
    let script_src;
    if (typeof document !== 'undefined' && document.currentScript !== null) {
        script_src = new URL(document.currentScript.src, location.href).toString();
    }

    /**
     * Allocate `len` floats for an init buffer. The arena is reused by the next
     * `graph_init`, so it stays bounded (nodes + links, never grows per tick).
     * @param {number} len
     * @returns {number}
     */
    function graph_alloc(len) {
        const ret = wasm.graph_alloc(len);
        return ret >>> 0;
    }
    exports.graph_alloc = graph_alloc;

    /**
     * Allocate `len` u32 (as raw pointer; JS writes via Uint32Array view).
     * @param {number} len
     * @returns {number}
     */
    function graph_alloc_u32(len) {
        const ret = wasm.graph_alloc_u32(len);
        return ret >>> 0;
    }
    exports.graph_alloc_u32 = graph_alloc_u32;

    /**
     * @returns {number}
     */
    function graph_alpha() {
        const ret = wasm.graph_alpha();
        return ret;
    }
    exports.graph_alpha = graph_alpha;

    /**
     * Layout bounding box as [min_x, min_y, max_x, max_y].
     * @returns {Float32Array}
     */
    function graph_bounds() {
        const ret = wasm.graph_bounds();
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    exports.graph_bounds = graph_bounds;

    /**
     * Apply new physics settings (does not reheat by itself).
     * @param {number} repel
     * @param {number} center_strength
     * @param {number} link_distance
     * @param {number} link_strength
     * @param {number} cluster_force
     */
    function graph_config(repel, center_strength, link_distance, link_strength, cluster_force) {
        wasm.graph_config(repel, center_strength, link_distance, link_strength, cluster_force);
    }
    exports.graph_config = graph_config;

    /**
     * @returns {boolean}
     */
    function graph_done() {
        const ret = wasm.graph_done();
        return ret !== 0;
    }
    exports.graph_done = graph_done;

    /**
     * @returns {number}
     */
    function graph_edge_count() {
        const ret = wasm.graph_edge_count();
        return ret >>> 0;
    }
    exports.graph_edge_count = graph_edge_count;

    /**
     * Pointer to 2*edge_count u32: sanitized edge pairs.
     * @returns {number}
     */
    function graph_edges_ptr() {
        const ret = wasm.graph_edges_ptr();
        return ret >>> 0;
    }
    exports.graph_edges_ptr = graph_edges_ptr;

    /**
     * End an active drag; `keep_pinned` drops the node exactly where released.
     * @param {number} index
     * @param {boolean} keep_pinned
     * @param {number} vx
     * @param {number} vy
     * @returns {number}
     */
    function graph_end_drag(index, keep_pinned, vx, vy) {
        const ret = wasm.graph_end_drag(index, keep_pinned, vx, vy);
        return ret >>> 0;
    }
    exports.graph_end_drag = graph_end_drag;

    /**
     * Engine ABI version; lets the JS wrapper verify the loaded module matches.
     * @returns {number}
     */
    function graph_engine_version() {
        const ret = wasm.graph_engine_version();
        return ret >>> 0;
    }
    exports.graph_engine_version = graph_engine_version;

    /**
     * Pointer to node_count u8 flags: 1 = pinned, 2 = pinned under drag.
     * @returns {number}
     */
    function graph_fixed_ptr() {
        const ret = wasm.graph_fixed_ptr();
        return ret >>> 0;
    }
    exports.graph_fixed_ptr = graph_fixed_ptr;

    /**
     * @param {number} alpha
     */
    function graph_heat(alpha) {
        wasm.graph_heat(alpha);
    }
    exports.graph_heat = graph_heat;

    /**
     * Build the engine from linear buffers.
     *
     * `nodes_ptr` points at `node_count * 3` floats: [x, y, type] per node.
     * `links_ptr` points at `link_count * 2` u32: [source, target] per link.
     * Non-finite coordinates fall back to deterministic spiral placement.
     * @param {number} nodes_ptr
     * @param {number} node_count
     * @param {number} links_ptr
     * @param {number} link_count
     * @param {number} cx
     * @param {number} cy
     * @param {number} alpha
     * @param {bigint} seed
     * @param {number} repel
     * @param {number} center_strength
     * @param {number} link_distance
     * @param {number} link_strength
     * @param {number} cluster_force
     */
    function graph_init(nodes_ptr, node_count, links_ptr, link_count, cx, cy, alpha, seed, repel, center_strength, link_distance, link_strength, cluster_force) {
        wasm.graph_init(nodes_ptr, node_count, links_ptr, link_count, cx, cy, alpha, seed, repel, center_strength, link_distance, link_strength, cluster_force);
    }
    exports.graph_init = graph_init;

    /**
     * Expose wasm memory so the JS side can build typed-array views over the
     * pointer-based buffers (`wasm_bindgen::memory` also covers this, but an
     * explicit export keeps the protocol self-describing).
     * @returns {any}
     */
    function graph_memory() {
        const ret = wasm.graph_memory();
        return ret;
    }
    exports.graph_memory = graph_memory;

    /**
     * @returns {number}
     */
    function graph_node_count() {
        const ret = wasm.graph_node_count();
        return ret >>> 0;
    }
    exports.graph_node_count = graph_node_count;

    /**
     * @returns {number}
     */
    function graph_pin_sequence() {
        const ret = wasm.graph_pin_sequence();
        return ret >>> 0;
    }
    exports.graph_pin_sequence = graph_pin_sequence;

    /**
     * Pointer to 2*node_count floats: interleaved [x0, y0, x1, y1, ...].
     * @returns {number}
     */
    function graph_positions_ptr() {
        const ret = wasm.graph_positions_ptr();
        return ret >>> 0;
    }
    exports.graph_positions_ptr = graph_positions_ptr;

    /**
     * @param {number} alpha
     */
    function graph_set_ambient(alpha) {
        wasm.graph_set_ambient(alpha);
    }
    exports.graph_set_ambient = graph_set_ambient;

    /**
     * @param {number} cx
     * @param {number} cy
     */
    function graph_set_center(cx, cy) {
        wasm.graph_set_center(cx, cy);
    }
    exports.graph_set_center = graph_set_center;

    /**
     * Pin/unpin; returns the new pin sequence (0 if index out of range).
     * @param {number} index
     * @param {boolean} fixed
     * @returns {number}
     */
    function graph_set_fixed(index, fixed) {
        const ret = wasm.graph_set_fixed(index, fixed);
        return ret >>> 0;
    }
    exports.graph_set_fixed = graph_set_fixed;

    /**
     * @param {number} index
     * @param {number} x
     * @param {number} y
     * @param {boolean} dragging
     */
    function graph_set_target(index, x, y, dragging) {
        wasm.graph_set_target(index, x, y, dragging);
    }
    exports.graph_set_target = graph_set_target;

    /**
     * Advance `steps` fixed ticks; returns alpha afterwards.
     * @param {number} steps
     * @returns {number}
     */
    function graph_step(steps) {
        const ret = wasm.graph_step(steps);
        return ret;
    }
    exports.graph_step = graph_step;

    /**
     * Pointer to 2*node_count floats: per-node drag/pin target positions.
     * @returns {number}
     */
    function graph_targets_ptr() {
        const ret = wasm.graph_targets_ptr();
        return ret >>> 0;
    }
    exports.graph_targets_ptr = graph_targets_ptr;

    /**
     * @returns {number}
     */
    function graph_tick() {
        const ret = wasm.graph_tick();
        return ret >>> 0;
    }
    exports.graph_tick = graph_tick;
    function __wbg_get_imports() {
        const import0 = {
            __proto__: null,
            __wbg___wbindgen_memory_caa4a6165639c8b5: function() {
                const ret = wasm.memory;
                return ret;
            },
            __wbindgen_init_externref_table: function() {
                const table = wasm.__wbindgen_externrefs;
                const offset = table.grow(4);
                table.set(0, undefined);
                table.set(offset + 0, undefined);
                table.set(offset + 1, null);
                table.set(offset + 2, true);
                table.set(offset + 3, false);
            },
        };
        return {
            __proto__: null,
            "./graph_layout_bg.js": import0,
        };
    }

    function getArrayF32FromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
    }

    let cachedFloat32ArrayMemory0 = null;
    function getFloat32ArrayMemory0() {
        if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
            cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
        }
        return cachedFloat32ArrayMemory0;
    }

    let wasmModule, wasmInstance, wasm;
    function __wbg_finalize_init(instance, module) {
        wasmInstance = instance;
        wasm = instance.exports;
        wasmModule = module;
        cachedFloat32ArrayMemory0 = null;
        wasm.__wbindgen_start();
        return wasm;
    }

    async function __wbg_load(module, imports) {
        if (typeof Response === 'function' && module instanceof Response) {
            if (!module.ok) {
                throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
            }

            if (typeof WebAssembly.instantiateStreaming === 'function') {
                try {
                    return await WebAssembly.instantiateStreaming(module, imports);
                } catch (e) {
                    const validResponse = expectedResponseType(module.type);

                    if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                        console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                    } else { throw e; }
                }
            }

            const bytes = await module.arrayBuffer();
            return await WebAssembly.instantiate(bytes, imports);
        } else {
            const instance = await WebAssembly.instantiate(module, imports);

            if (instance instanceof WebAssembly.Instance) {
                return { instance, module };
            } else {
                return instance;
            }
        }

        function expectedResponseType(type) {
            switch (type) {
                case 'basic': case 'cors': case 'default': return true;
            }
            return false;
        }
    }

    function initSync(module) {
        if (wasm !== undefined) return wasm;


        if (module !== undefined) {
            if (Object.getPrototypeOf(module) === Object.prototype) {
                ({module} = module)
            } else {
                console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
            }
        }

        const imports = __wbg_get_imports();
        if (!(module instanceof WebAssembly.Module)) {
            module = new WebAssembly.Module(module);
        }
        const instance = new WebAssembly.Instance(module, imports);
        return __wbg_finalize_init(instance, module);
    }

    async function __wbg_init(module_or_path) {
        if (wasm !== undefined) return wasm;


        if (module_or_path !== undefined) {
            if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
                ({module_or_path} = module_or_path)
            } else {
                console.warn('using deprecated parameters for the initialization function; pass a single object instead')
            }
        }

        if (module_or_path === undefined && script_src !== undefined) {
            module_or_path = script_src.replace(/\.js$/, "_bg.wasm");
        }
        const imports = __wbg_get_imports();

        if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
            module_or_path = fetch(module_or_path);
        }

        const { instance, module } = await __wbg_load(await module_or_path, imports);

        return __wbg_finalize_init(instance, module);
    }

    return Object.assign(__wbg_init, { initSync }, exports);
})({ __proto__: null });

globalThis.wasm_bindgen = wasm_bindgen;
