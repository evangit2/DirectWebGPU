//! Split Vulkan combined image/samplers into WebGPU's separate resources.
//! MojoShader emits direct loads of combined UniformConstant variables. Other
//! forms (arrays, access chains) are deliberately left for the parser to reject.
use std::collections::{BTreeMap, BTreeSet};
pub fn split(bytes:&[u8])->Result<Vec<u8>,String>{Ok(split_with_bindings(bytes)?.0)}
pub fn split_with_bindings(bytes: &[u8]) -> Result<(Vec<u8>,Vec<u32>), String> {
    let mut w: Vec<u32> = bytes
        .chunks_exact(4)
        .map(|b| u32::from_le_bytes(b.try_into().unwrap()))
        .collect();
    if w.len() < 5 || w[0] != 0x07230203 {
        return Err("invalid SPIR-V header".into());
    }
    let mut insts = Vec::new();
    let mut at = 5;
    while at < w.len() {
        let n = (w[at] >> 16) as usize;
        if n == 0 || at + n > w.len() {
            return Err("invalid SPIR-V instruction length".into());
        }
        insts.push(w[at..at + n].to_vec());
        at += n;
    }
    let mut dimensions=BTreeMap::new();
    let mut reflection=Vec::new();
    let mut combined = BTreeMap::new();
    let mut ptrs = BTreeMap::new();
    let mut vars = BTreeMap::new();
    let mut sets = BTreeMap::new();
    let mut bindings = BTreeMap::new();
    for i in &insts {
        match i[0] & 65535 {
            25 if i.len()>=9 => {dimensions.insert(i[1],if i[5]==0&&i[6]==0{i[3]}else{u32::MAX});}
            27 if i.len() == 3 => {
                combined.insert(i[1], i[2]);
            }
            32 if i.len() == 4 && i[2] == 0 => {
                ptrs.insert(i[1], i[3]);
            }
            71 if i.len() == 4 && i[2] == 34 => {
                sets.insert(i[1], i[3]);
            }
            71 if i.len() == 4 && i[2] == 33 => {
                bindings.insert(i[1], i[3]);
            }
            _ => {}
        }
    }
    for i in &insts {
        if i[0] & 65535 == 59 && i.len() >= 4 && i[3] == 0 {
            if let Some(&c) = ptrs.get(&i[1]) {
                if let Some(&image) = combined.get(&c) {
                    vars.insert(i[2], (c, image));
                }
            }
        }
    }
    if vars.is_empty() {
        return Ok((bytes.to_vec(),reflection));
    }
    if vars.len() > 32 {
        return Err("too many combined shader samplers".into());
    }
    let mut used: BTreeSet<_> = bindings
        .iter()
        .filter_map(|(id, b)| sets.get(id).map(|s| (*s, *b)))
        .collect();
    if w[3] > 0x1000000 {
        return Err("SPIR-V id bound too large".into());
    }
    let mut next = w[3];
    let mut id = || {
        let n = next;
        next += 1;
        n
    };
    let sampler_type = id();
    let sampler_ptr = id();
    let mut samplers = BTreeMap::new();
    let mut annotations = Vec::new();
    let mut globals = vec![
        vec![(2 << 16) | 26, sampler_type],
        vec![(4 << 16) | 32, sampler_ptr, 0, sampler_type],
    ];
    for &var in vars.keys() {
        let set = *sets
            .get(&var)
            .ok_or("combined sampler missing descriptor set")?;
        let mut binding = 0;
        while used.contains(&(set, binding)) {
            binding += 1;
            if binding > 1023 {
                return Err("no free sampler binding".into());
            }
        }
        used.insert((set, binding));
        reflection.extend([set,*bindings.get(&var).ok_or("missing texture binding")?,binding,*dimensions.get(&vars[&var].1).ok_or("missing image type")?]);
        let sampler = id();
        samplers.insert(var, sampler);
        annotations.extend([
            vec![(4 << 16) | 71, sampler, 34, set],
            vec![(4 << 16) | 71, sampler, 33, binding],
        ]);
        globals.push(vec![(4 << 16) | 59, sampler_ptr, sampler, 0]);
    }
    let mut result = Vec::new();
    let mut annotated = false;
    let mut globalized = false;
    for mut i in insts {
        let op = i[0] & 65535;
        if !annotated && (19..=39).contains(&op) {
            result.extend(annotations.iter().flatten());
            annotated = true;
        }
        if !globalized && op == 54 {
            result.extend(globals.iter().flatten());
            globalized = true;
        }
        if op == 32 && i.len() == 4 && i[2] == 0 {
            if let Some(image) = combined.get(&i[3]) {
                i[3] = *image;
            }
        }
        if op == 61 && i.len() == 4 {
            if let Some(&(c, image)) = vars.get(&i[3]) {
                if i[1] != c {
                    return Err("combined sampler load type mismatch".into());
                }
                let image_value = id();
                let sampler_value = id();
                result.extend([
                    (4 << 16) | 61,
                    image,
                    image_value,
                    i[3],
                    (4 << 16) | 61,
                    sampler_type,
                    sampler_value,
                    samplers[&i[3]],
                    (5 << 16) | 86,
                    c,
                    i[2],
                    image_value,
                    sampler_value,
                ]);
                continue;
            }
        }
        result.extend(i);
    }
    if !annotated || !globalized {
        return Err("missing SPIR-V section for sampler split".into());
    }
    w[3] = next;
    w.truncate(5);
    w.extend(result);
    Ok((w.into_iter().flat_map(u32::to_le_bytes).collect(),reflection))
}
