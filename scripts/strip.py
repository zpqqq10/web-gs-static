import plyfile
import numpy as np

INPUT = '../data/pc_full.ply'
SH_C0 = 0.28209479177387814

# strip f_rest*
ply = plyfile.PlyData.read(INPUT)

# dic is a dict with name as key and np.array as value
def write_ply(dic: dict, dtdic: dict, filename: str):
    vertex_k = []
    vertex_v = []
    for key in dic.keys():
        vertex_k.append((key, dtdic[key]))
        vertex_v.append(dic[key])
    vertex = np.array(list(zip(*vertex_v)), dtype=vertex_k)
    ply = plyfile.PlyData([plyfile.PlyElement.describe(vertex, 'vertex')], text=False)
    ply.write(filename)
    print(f'{filename} saved')
    
# convert to dict
# value is numpy array
data = ply.elements[0].data
res = {}
dtres = {}
for name, typestr in data.dtype.descr:
    if name.startswith('f_rest'):
        print(f'skip {name}')
    elif name.startswith('f_dc'):
        res[name] = np.array(data[name])
        res[name] = (0.5 + SH_C0 * res[name]) * 255
        res[name] = res[name].clip(0, 255).astype(np.uint8)
        res[name] = res[name][:100000]
        dtres[name] = '|u1'
    elif name.startswith('opacity'):
        res[name] = np.array(data[name])
        res[name] = (1 / (1 + np.exp(-res[name]))) * 255
        res[name] = res[name].clip(0, 255).astype(np.uint8)
        res[name] = res[name][:100000]
        dtres[name] = '|u1'
    else:
        res[name] = np.array(data[name])
        dtres[name] = typestr[-2:] if len(typestr) > 2 else typestr
        res[name] = res[name][:100000]
        
write_ply(res, dtres, '../data/pc_strip.ply')