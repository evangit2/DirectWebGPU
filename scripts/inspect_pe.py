import pefile, capstone, hashlib, json, pathlib, re, collections
root=pathlib.Path(__file__).resolve().parents[1]
p=root/'assets/original/package/DynamicBranching/DynamicBranching.exe'
b=p.read_bytes(); pe=pefile.PE(data=b); base=pe.OPTIONAL_HEADER.ImageBase
imports={d.dll.decode():[{'name':i.name.decode() if i.name else f'ordinal:{i.ordinal}','iat':hex(i.address)} for i in d.imports] for d in pe.DIRECTORY_ENTRY_IMPORT}
md=capstone.Cs(capstone.CS_ARCH_X86,capstone.CS_MODE_32); md.skipdata=True
counts=collections.Counter(); special=[]
for sec in pe.sections:
 if sec.Characteristics & 0x20000000:
  for i in md.disasm(sec.get_data(),base+sec.VirtualAddress):
   counts[i.mnemonic]+=1
   if i.mnemonic in ['cpuid','rdtsc','fsin','fcos','fptan','fyl2x','fistp','fnstcw','fldcw','int','sysenter'] or 'fs:' in i.op_str:
    special.append(f'{i.address:#010x}: {i.mnemonic} {i.op_str}')
ep=base+pe.OPTIONAL_HEADER.AddressOfEntryPoint
r={'archive_source':'https://humus.name/3D/DynamicBranching.zip','archive_sha256':hashlib.sha256((root/'assets/original/DynamicBranching.zip').read_bytes()).hexdigest(),'executable':str(p.relative_to(root)),'executable_sha256':hashlib.sha256(b).hexdigest(),'size':len(b),'machine':hex(pe.FILE_HEADER.Machine),'image_base':hex(base),'entry_point':hex(ep),'subsystem':pe.OPTIONAL_HEADER.Subsystem,'image_size':pe.OPTIONAL_HEADER.SizeOfImage,'stack_reserve':pe.OPTIONAL_HEADER.SizeOfStackReserve,'imports':imports,'delay_imports':[str(x.dll) for x in getattr(pe,'DIRECTORY_ENTRY_DELAY_IMPORT',[])],'sections':[{'name':s.Name.rstrip(b'\0').decode(),'va':hex(base+s.VirtualAddress),'virtual_size':s.Misc_VirtualSize,'raw_size':s.SizeOfRawData,'characteristics':hex(s.Characteristics)} for s in pe.sections],'entry_instructions':[f'{i.address:#010x}: {i.mnemonic} {i.op_str}' for i in md.disasm(pe.get_data(ep-base,100),ep)],'linear_disassembly_caveat':'Code sections may contain data; counts are static candidates, not executed instruction coverage.','instruction_counts':dict(counts.most_common()),'special_instructions':special,'interesting_strings':[s.decode('ascii') for s in re.findall(rb'[ -~]{5,}',b) if re.search(rb'\.dll|D3DX|shader|vs_1|ps_2|\.shd|\.hmdl|\.dds|\.png|\.ini',s,re.I)]}
(root/'evidence/pe-inspection.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps({k:r[k] for k in ['executable_sha256','entry_point','delay_imports','interesting_strings']},indent=2))
for dll, funcs in imports.items(): print(dll, ':', ', '.join(i['name'] for i in funcs))
