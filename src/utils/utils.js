export const FTYPES = {
    ply: 1,
    highxyz: 2,
    lowxyz: 3,
    rot: 4,
    cb: 5
};

export const preventDefault = (e) => {
    e.preventDefault();
    e.stopPropagation();
};

export function attachShaders(gl, vertexShaderSource, fragmentShaderSource) {
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexShaderSource);
    gl.compileShader(vertexShader);
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(vertexShader));

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentShaderSource);
    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(fragmentShader));

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.useProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(program));
    return program;
}

export async function readChunks(reader, chunks, handleChunk) {
    let chunk = chunks.shift();
    let buffer = new Uint8Array(chunk.size);
    let offset = 0;
    while (chunk) {
        let { done, value } = await reader.read();
        if (done) break;
        while (value.length + offset >= chunk.size) {
            buffer.set(value.subarray(0, chunk.size - offset), offset);
            value = value.subarray(chunk.size - offset);
            handleChunk(chunk, buffer.buffer, 0, chunks);
            chunk = chunks.shift();
            if (!chunk) break;
            buffer = new Uint8Array(chunk.size);
            offset = 0;
        }
        if (!chunk) break;
        buffer.set(value, offset);
        offset += value.length;
        handleChunk(chunk, buffer.buffer, buffer.byteLength - offset, chunks);
    }
    if (chunk) handleChunk(chunk, buffer.buffer, 0, chunks);
}

export async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function padZeroStart(str, n = 6) {
    return (Array(n).join(0) + str).slice(-n);
}

export function setTexture(gl, texture, texData, texWidth, texHeight, index, channels = '32rgba') {
    // activate before binding
    gl.activeTexture(gl.TEXTURE0 + index);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_WRAP_S,
        gl.CLAMP_TO_EDGE,
    );
    gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_WRAP_T,
        gl.CLAMP_TO_EDGE,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    if (channels == '32rgbaui') {
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA32UI,
            texWidth,
            texHeight,
            0,
            gl.RGBA_INTEGER,
            gl.UNSIGNED_INT,
            texData,
        );
    } else if (channels == '32rgbui') {
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGB32UI,
            texWidth,
            texHeight,
            0,
            gl.RGB_INTEGER,
            gl.UNSIGNED_INT,
            texData,
        );
    } else if (channels == '32rui') {
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.R32UI,
            texWidth,
            texHeight,
            0,
            gl.RED_INTEGER,
            gl.UNSIGNED_INT,
            texData,
        );
    } else if (channels == '8rgbui') {
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGB8UI,
            texWidth,
            texHeight,
            0,
            gl.RGB_INTEGER,
            gl.UNSIGNED_BYTE,
            texData,
        );
    } else if (channels == '8rgbaui') {
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA8UI,
            texWidth,
            texHeight,
            0,
            gl.RGBA_INTEGER,
            gl.UNSIGNED_BYTE,
            texData,
        );
    } else if (channels == '8rui') {
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.R8UI,
            texWidth,
            texHeight,
            0,
            gl.RED_INTEGER,
            gl.UNSIGNED_BYTE,
            texData,
        );
    } else if (channels == '16rgui') {
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RG16UI,
            texWidth,
            texHeight,
            0,
            gl.RG_INTEGER,
            gl.UNSIGNED_SHORT,
            texData,
        );
    } else {
        throw new Error('unsupported channels');
    }
    // gl.activeTexture(gl.TEXTURE0);
    // gl.bindTexture(gl.TEXTURE_2D, texture);
}