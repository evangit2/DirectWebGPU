struct VertexOutput {
    @builtin(position) member: vec4<f32>,
    @location(0) member_1: vec4<f32>,
}

var<private> vs_v0_1: vec4<f32>;
var<private> vs_v9_1: vec4<f32>;
var<private> vs_oPos: vec4<f32> = vec4<f32>(0f, 0f, 0f, 1f);
var<private> vs_oT0_: vec4<f32>;

fn main_1() {
    let _e4 = vs_v0_1;
    vs_oPos = _e4;
    let _e5 = vs_v9_1;
    vs_oT0_ = _e5;
    return;
}

@vertex 
fn main(@location(0) vs_v0_: vec4<f32>, @location(9) vs_v9_: vec4<f32>) -> VertexOutput {
    vs_v0_1 = vs_v0_;
    vs_v9_1 = vs_v9_;
    main_1();
    let _e6 = vs_oPos;
    let _e7 = vs_oT0_;
    return VertexOutput(_e6, _e7);
}
