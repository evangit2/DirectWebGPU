/* tslint:disable */
/* eslint-disable */

export interface Msg {
    func: string,
    args: unknown[],
    retAddr: number,
}

export interface WasmHost {
    console_write(ptr: number, len: number): void;

    create_surface(width: number, height: number): number;

    create_window(title: string, width: number, height: number): number;
    resize_window(window_id: number, width: number, height: number): void;
    render(window_id: number, surface_id: number): void;
    cursor_warp(x: number, y: number): void;
    cursor_visibility(visible: boolean): void;

    set_pixels(surface_id: number, ptr: number, len: number): void;

    write_file(path: string, ptr: number, len: number): number;

    audio_open(sample_rate: number, channels: number): number;
    audio_queued(stream_id: number): number;
    audio_resume(stream_id: number): void;
    audio_write(stream_id: number, ptr: number, len: number): void;

    music_load(ptr: number, len: number, flags: number): number;
    music_command(op: number, handle: number, a: number, b: number, c: number): number;

    poll_message(): number[];
    wait_message(): Promise<number[]>;
}



export function configure_guest_memory_metrics(enabled: boolean): void;

export function input_queue_address(): number;

export function main(): void;

/**
 * Add a file to the program's filesystem. The page calls this for each file
 * of the program's data before starting it.
 */
export function mount_file(path: string, data: Uint8Array): void;

export function seed_registry_dword(root: number, subkey: string, name: string, value: number): void;

export function seed_registry_value(root: number, subkey: string, name: string, kind: number, value: Uint8Array): void;

/**
 * Set the directory the program starts in, the equivalent of launching it
 * from that directory natively.
 */
export function set_current_dir(path: string): void;

export function set_trace(spec: string): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly configure_guest_memory_metrics: (a: number) => void;
    readonly main: () => void;
    readonly seed_registry_dword: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly seed_registry_value: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
    readonly input_queue_address: () => number;
    readonly mount_file: (a: number, b: number, c: number, d: number) => void;
    readonly set_current_dir: (a: number, b: number) => void;
    readonly set_trace: (a: number, b: number) => void;
    readonly dump_ctx: (a: number) => void;
    readonly memory: WebAssembly.Memory;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_thread_destroy: (a?: number, b?: number, c?: number) => void;
    readonly __wbindgen_start: (a: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput, memory?: WebAssembly.Memory, thread_stack_size?: number }} module - Passing `SyncInitInput` directly is deprecated.
 * @param {WebAssembly.Memory} memory - Deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput, memory?: WebAssembly.Memory, thread_stack_size?: number } | SyncInitInput, memory?: WebAssembly.Memory): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput>, memory?: WebAssembly.Memory, thread_stack_size?: number }} module_or_path - Passing `InitInput` directly is deprecated.
 * @param {WebAssembly.Memory} memory - Deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput>, memory?: WebAssembly.Memory, thread_stack_size?: number } | InitInput | Promise<InitInput>, memory?: WebAssembly.Memory): Promise<InitOutput>;
