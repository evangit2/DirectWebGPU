struct VertexOutput {
    @builtin(position) member: vec4<f32>,
    @location(0) member_1: vec4<f32>,
}

var<private> vs_v0_1: vec4<f32>;
var<private> vs_v1_1: vec4<f32>;
var<private> vs_v2_1: vec4<f32>;
var<private> vs_v3_1: vec4<f32>;
var<private> vs_v4_1: vec4<f32>;
var<private> vs_v5_1: vec4<f32>;
var<private> vs_v6_1: vec4<f32>;
var<private> vs_v7_1: vec4<f32>;
var<private> vs_v8_1: vec4<f32>;
var<private> vs_v9_1: vec4<f32>;
var<private> vs_v10_1: vec4<f32>;
var<private> vs_v11_1: vec4<f32>;
var<private> vs_v12_1: vec4<f32>;
var<private> vs_v13_1: vec4<f32>;
var<private> vs_v14_1: vec4<f32>;
var<private> vs_v15_1: vec4<f32>;
var<private> vs_oPos: vec4<f32> = vec4<f32>(0f, 0f, 0f, 1f);
var<private> vs_oT0_: vec4<f32>;

fn main_1() {
    let _e18 = vs_v0_1;
    vs_oPos = _e18;
    let _e19 = vs_v1_1;
    vs_oT0_ = _e19;
    return;
}

@vertex 
fn main(@location(0) vs_v0_: vec4<f32>, @location(1) vs_v1_: vec4<f32>, @location(2) vs_v2_: vec4<f32>, @location(3) vs_v3_: vec4<f32>, @location(4) vs_v4_: vec4<f32>, @location(5) vs_v5_: vec4<f32>, @location(6) vs_v6_: vec4<f32>, @location(7) vs_v7_: vec4<f32>, @location(8) vs_v8_: vec4<f32>, @location(9) vs_v9_: vec4<f32>, @location(10) vs_v10_: vec4<f32>, @location(11) vs_v11_: vec4<f32>, @location(12) vs_v12_: vec4<f32>, @location(13) vs_v13_: vec4<f32>, @location(14) vs_v14_: vec4<f32>, @location(15) vs_v15_: vec4<f32>) -> VertexOutput {
    vs_v0_1 = vs_v0_;
    vs_v1_1 = vs_v1_;
    vs_v2_1 = vs_v2_;
    vs_v3_1 = vs_v3_;
    vs_v4_1 = vs_v4_;
    vs_v5_1 = vs_v5_;
    vs_v6_1 = vs_v6_;
    vs_v7_1 = vs_v7_;
    vs_v8_1 = vs_v8_;
    vs_v9_1 = vs_v9_;
    vs_v10_1 = vs_v10_;
    vs_v11_1 = vs_v11_;
    vs_v12_1 = vs_v12_;
    vs_v13_1 = vs_v13_;
    vs_v14_1 = vs_v14_;
    vs_v15_1 = vs_v15_;
    main_1();
    let _e34 = vs_oPos;
    let _e35 = vs_oT0_;
    return VertexOutput(_e34, _e35);
}
