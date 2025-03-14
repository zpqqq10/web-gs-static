export const vertexShaderSource = `
#version 300 es
precision highp float;
precision highp int;

uniform highp usampler2D gs_texture;

uniform mat4 projection, view;
uniform vec2 focal;
uniform vec2 viewport;
// camera center
// uniform vec3 camera_center;

in vec2 position;
in int index;

out vec4 vColor;
out vec2 vPosition;

// sh coefficients
float mip_kernel = .3;
float PISQRT = 1.77245385091f;
float SH_C0 = 0.28209479177387814f;
float SH_C1 = 0.4886025119029199f;
float SH_C2[] = float[](
    1.0925484305920792f,
    -1.0925484305920792f,
    0.31539156525252005f,
    -1.0925484305920792f,
    0.5462742152960396f
);
float SH_C3[] = float[](
    -0.5900435899266435f,
    2.890611442640554f,
    -0.4570457994644658f,
    0.3731763325901154f,
    -0.4570457994644658f,
    1.445305721320277f,
    -0.5900435899266435f
);

// vec3 computeSH(uint rest_idx, vec3 gs_position, vec3 direct_color){
//     vec3 sh[15];
//     // direction for sh calculation
//     vec3 shdir = gs_position - camera_center;
//     shdir = normalize(shdir);
//     float x = shdir.x, y = shdir.y, z = shdir.z;
//     float xx = x * x, yy = y * y, zz = z * z;
//     float xy = x * y, yz = y * z, zx = z * x;
//     // fetch the sh coefficients
//     uvec3 packed_sh = texelFetch(sh_texture, ivec2(((rest_idx & 0x3ffu) << 3u) | 7u, rest_idx >> 10u), 0).rgb;
//     sh[14] = vec3(unpackHalf2x16(packed_sh.x).xy, unpackHalf2x16(packed_sh.y).x);
//     for (uint i = 0u; i < 7u; i++){
//         packed_sh = texelFetch(sh_texture, ivec2(((rest_idx & 0x3ffu) << 3u) | i, rest_idx >> 10u), 0).rgb;
//         sh[i * 2u + 0u] = vec3(unpackHalf2x16(packed_sh.x).xy, unpackHalf2x16(packed_sh.y).x);
//         sh[i * 2u + 1u] = vec3(unpackHalf2x16(packed_sh.y).y, unpackHalf2x16(packed_sh.z).xy);
//     }
    
//     vec3 result = SH_C0 * direct_color;
//     result = result - SH_C1 * y * sh[0] + SH_C1 * z * sh[1] - SH_C1 * x * sh[2];
//     result = result +
// 				SH_C2[0] * xy * sh[3] +
// 				SH_C2[1] * yz * sh[4] +
// 				SH_C2[2] * (2.0f * zz - xx - yy) * sh[5] +
// 				SH_C2[3] * zx * sh[6] +
// 				SH_C2[4] * (xx - yy) * sh[7];
//     result = result +
//                 SH_C3[0] * y * (3.0f * xx - yy) * sh[8] +
//                 SH_C3[1] * xy * z * sh[9] +
//                 SH_C3[2] * y * (4.0f * zz - xx - yy) * sh[10] +
//                 SH_C3[3] * z * (2.0f * zz - 3.0f * xx - 3.0f * yy) * sh[11] +
//                 SH_C3[4] * x * (4.0f * zz - xx - yy) * sh[12] +
//                 SH_C3[5] * z * (xx - yy) * sh[13] +
//                 SH_C3[6] * x * (xx - 3.0f * yy) * sh[14];
// 	result += 0.5;
//     result = clamp(result, 0.0, 1.0);
//     return result;
// }

void main () {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    // xyz center
    uvec4 cen = texelFetch(gs_texture, ivec2((uint(index) & 0x3ffu) << 1u, uint(index) >> 10), 0);
    vec3 cen_position = uintBitsToFloat(cen.xyz);

    // coordinate in camera space
    vec4 cam = view * vec4(cen_position, 1);
    vec4 pos2d = projection * cam;
    float clip = 1.2 * pos2d.w;
    if (pos2d.z < -clip || 
        pos2d.x < -clip || pos2d.x > clip || 
        pos2d.y < -clip || pos2d.y > clip
        ) {
        return;
    }
    
    uvec4 cov = texelFetch(gs_texture, ivec2(((uint(index) & 0x3ffu) << 1u) | 1u, uint(index) >> 10), 0);
    vec2 u1 = unpackHalf2x16(cov.x), u2 = unpackHalf2x16(cov.y), u3 = unpackHalf2x16(cov.z);
    mat3 Vrk = mat3(u1.x, u1.y, u2.x, u1.y, u2.y, u3.x, u2.x, u3.x, u3.y);
            

    // Jacobian matrix
    // gradient of (u, v) w.r.t. (x, y, z)
    mat3 J = mat3(
        focal.x / cam.z, 0., -(focal.x * cam.x) / (cam.z * cam.z),
        0., -focal.y / cam.z, (focal.y * cam.y) / (cam.z * cam.z),
        0., 0., 0.
    );

    // covariance matrix in 2D
    mat3 T = transpose(mat3(view)) * J;
    mat3 cov2d = transpose(T) * Vrk * T;

    // for mip-splatting
    float det_0 = max(cov2d[0][0] * cov2d[1][1] - cov2d[0][1] * cov2d[0][1], 1e-6);
    float det_1 = max((cov2d[0][0] + mip_kernel) * (cov2d[1][1] + mip_kernel) - cov2d[0][1] * cov2d[0][1], 1e-6);
    float mip_coef = ((det_0 <= 1e-6) || (det_1 <= 1e-6)) ? 0. : sqrt(det_0 / (det_1 + 1e-6) + 1e-6);

    // float mid = (cov2d[0][0] + cov2d[1][1]) / 2.0;
    float mid = (cov2d[0][0] + cov2d[1][1]) / 2.0 + mip_kernel;
    float radius = length(vec2((cov2d[0][0] - cov2d[1][1]) / 2.0, cov2d[0][1]));
    // float lambda1 = mid + radius, lambda2 = mid - radius;
    float lambda1 = mid + radius, lambda2 = max(mid - radius, .1);

    if(lambda2 < 0.0) return;
    vec2 diagonalVector = normalize(vec2(cov2d[0][1], lambda1 - cov2d[0][0] - mip_kernel));
    // vec2 diagonalVector = normalize(vec2(cov2d[0][1], lambda1 - cov2d[0][0]));
    vec2 majorAxis = min(sqrt(2.0 * lambda1), 1024.0) * diagonalVector;
    vec2 minorAxis = min(sqrt(2.0 * lambda2), 1024.0) * vec2(diagonalVector.y, -diagonalVector.x);

    vColor = clamp(pos2d.z/pos2d.w+1.0, 0.0, 1.0) * 
        vec4((cen.w) & 0xffu, (cen.w >> 8) & 0xffu, (cen.w >> 16) & 0xffu, (cen.w >> 24) & 0xffu) / 255.0;
        //          r                      g                      b                     a 
    // for mip-splatting
    vColor.a = vColor.a * mip_coef;
    vPosition = position;

    vec2 vCenter = vec2(pos2d) / pos2d.w;
    gl_Position = vec4(
        vCenter
        + position.x * majorAxis / viewport
        + position.y * minorAxis / viewport, 0.0, 1.0);

}
`.trim();

export const fragmentShaderSource = `
#version 300 es
precision highp float;

in vec4 vColor;
in vec2 vPosition;

out vec4 fragColor;

void main () {
    float A = -dot(vPosition, vPosition);
    float B = exp(A) * vColor.a;
    if (B < 1. / 255.) discard;
    fragColor = vec4(B * vColor.rgb, B);
}

`.trim();
