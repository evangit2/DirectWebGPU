var<private> ps_r0_: vec4<f32>;
@group(2) @binding(0) 
var ps_s0_: texture_2d<f32>;
var<private> ps_PointCoordOrTexCoord0_1: vec4<f32>;
var<private> ps_t0_: vec4<f32>;
var<private> ps_oC0_: vec4<f32>;
@group(2) @binding(1) 
var global: sampler;

fn main_1() {
    let _e6 = ps_PointCoordOrTexCoord0_1;
    ps_t0_ = _e6.xyzw;
    let _e8 = ps_t0_;
    let _e10 = textureSample(ps_s0_, global, _e8.xy);
    ps_r0_ = _e10;
    let _e11 = ps_r0_;
    ps_oC0_ = _e11;
    return;
}

@fragment 
fn main(@location(0) ps_PointCoordOrTexCoord0_: vec4<f32>) -> @location(0) vec4<f32> {
    ps_PointCoordOrTexCoord0_1 = ps_PointCoordOrTexCoord0_;
    main_1();
    let _e3 = ps_oC0_;
    return _e3;
}
