var<private> ps_PointCoordOrTexCoord0_1: vec4<f32>;
var<private> ps_t0_: vec4<f32>;
var<private> ps_oC0_: vec4<f32>;

fn main_1() {
    let _e3 = ps_PointCoordOrTexCoord0_1;
    ps_t0_ = _e3.xyzw;
    let _e5 = ps_t0_;
    ps_oC0_ = _e5;
    return;
}

@fragment 
fn main(@location(0) ps_PointCoordOrTexCoord0_: vec4<f32>) -> @location(0) vec4<f32> {
    ps_PointCoordOrTexCoord0_1 = ps_PointCoordOrTexCoord0_;
    main_1();
    let _e3 = ps_oC0_;
    return _e3;
}
