fn main(){
    let args:Vec<_>=std::env::args().collect();
    if args.len()!=3 {eprintln!("usage: shader-translation input.spv output.wgsl");std::process::exit(2)}
    match humus_shader_translation::spirv_to_wgsl(&std::fs::read(&args[1]).unwrap()) {
        Ok(source)=>std::fs::write(&args[2],source).unwrap(),
        Err(e)=>{eprintln!("{e}");std::process::exit(1)}
    }
}
