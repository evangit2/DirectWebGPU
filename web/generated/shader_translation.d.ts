/* tslint:disable */
/* eslint-disable */

export function alpha_test_wgsl(source: string, compare: number, reference: number): string;

/**
 * Group, original texture binding, split sampler binding, SPIR-V image dimension.
 */
export function sampler_bindings(bytes: Uint8Array): Uint32Array;

/**
 * Flatten WebGPU resources as group, binding, kind, detail tuples. Kind 0 is
 * a uniform buffer (detail is its byte size), kind 1 is a sampled texture
 * (detail uses SPIR-V's 0/1/2/3 dimension numbering), and kind 2 is a sampler.
 * This reflects both vkd3d's already-separate resources and MojoShader's
 * combined samplers after the existing split pass.
 */
export function shader_bindings(bytes: Uint8Array): Uint32Array;

/**
 * Accept linked SPIR-V, reject invalid modules, and emit validated WGSL.
 * Coordinate adjustment is disabled: DX9 and WebGPU both use depth 0..1.
 * Viewport Y, pixel centers and winding remain responsibilities of the renderer.
 */
export function spirv_to_wgsl(bytes: Uint8Array): string;

export function vertex_inputs_wgsl(source: string, widths: Uint32Array): string;

export function vertex_position_wgsl(source: string, width: number, height: number): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly alpha_test_wgsl: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly sampler_bindings: (a: number, b: number) => [number, number, number, number];
    readonly shader_bindings: (a: number, b: number) => [number, number, number, number];
    readonly spirv_to_wgsl: (a: number, b: number) => [number, number, number, number];
    readonly vertex_inputs_wgsl: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly vertex_position_wgsl: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
