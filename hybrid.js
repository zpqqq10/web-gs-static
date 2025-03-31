import { vertexShaderSource, fragmentShaderSource } from "./shaders/GSSSahders.js";
import { getProjectionMatrix, getViewMatrix, rotate4, multiply4, invert4, translate4, float16ToFloat32 } from "./src/utils/mathUtils.js";
import { attachShaders, preventDefault, padZeroStart, FTYPES, sleep, setTexture, isPly } from "./src/utils/utils.js";

const ToolWorkerUrl = './src/workers/toolWorker.js';
const PlyDownloaderUrl = './src/workers/plyDownloader.js';
// const CBDownloaderUrl = './src/workers/cbDownloader.js';

let cameras = [
  {
    id: 0,
    img_name: "00001",
    width: 1959,
    height: 1090,
    position: [-3.0089893469241797, -0.11086489695181866, -3.7527640949141428],
    rotation: [
      [0.876134201218856, 0.06925962026449776, 0.47706599800804744],
      [-0.04747421839895102, 0.9972110940209488, -0.057586739349882114],
      [-0.4797239414934443, 0.027805376500959853, 0.8769787916452908],
    ],
    fy: 1164.6601287484507,
    fx: 1159.5880733038064,
  },
];


let camera = cameras[0];
let defaultViewMatrix = [
  0.99, -0.023, 0.286, 0,
  0.011, 0.984, 0.163, 0,
  -0.28, -0.16, 0.944, 0,
  1.501, -0.13, 0.500, 1
];
let viewMatrix = defaultViewMatrix;
let plyTexData = new Uint32Array();
let isLoading = true;

async function main() {
  let carousel = false;
  const params = new URLSearchParams(location.search);

  const toolWorker = new Worker(ToolWorkerUrl, { type: 'module' });
  const plyDownloader = new Worker(PlyDownloaderUrl, { type: 'module' });
  // const cbdownloader = new Worker(CBDownloaderUrl, { type: 'module' });
  // cbdownloader.postMessage({ msg: 'init' });
  plyDownloader.postMessage({ msg: 'init' });
  const canvas = document.getElementById("canvas");
  const fps = document.getElementById("fps");
  let projectionMatrix;

  const gl = canvas.getContext("webgl2", {
    antialias: false,
  });
  // terminate if webgl2 is not supported
  if (!gl) {
    throw new Error("WebGL2 is not supported");
  }

  const program = attachShaders(gl, vertexShaderSource, fragmentShaderSource);
  gl.disable(gl.DEPTH_TEST); // Disable depth testing

  // Enable blending
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.ONE_MINUS_DST_ALPHA, gl.ONE, gl.ONE_MINUS_DST_ALPHA, gl.ONE);
  gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);

  const u_projection = gl.getUniformLocation(program, "projection");
  const u_viewport = gl.getUniformLocation(program, "viewport");
  const u_focal = gl.getUniformLocation(program, "focal");
  const u_view = gl.getUniformLocation(program, "view");
  // const u_cameraCenter = gl.getUniformLocation(program, "camera_center");

  // positions
  const triangleVertices = new Float32Array([-2, -2, 2, -2, 2, 2, -2, 2]);
  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, triangleVertices, gl.STATIC_DRAW);
  const a_position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(a_position);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 0, 0);

  var gsTexture = gl.createTexture();
  // var shTexture = gl.createTexture();

  var gs_textureLocation = gl.getUniformLocation(program, "gs_texture");
  gl.uniform1i(gs_textureLocation, 0);
  // for high-order sh
  // var sh_textureLocation = gl.getUniformLocation(program, "sh_texture");
  // gl.uniform1i(sh_textureLocation, 8);

  const indexBuffer = gl.createBuffer();
  const a_index = gl.getAttribLocation(program, "index");
  gl.enableVertexAttribArray(a_index);
  gl.bindBuffer(gl.ARRAY_BUFFER, indexBuffer);
  gl.vertexAttribIPointer(a_index, 1, gl.INT, false, 0, 0);
  gl.vertexAttribDivisor(a_index, 1);

  const resize = () => {
    gl.uniform2fv(u_focal, new Float32Array([camera.fx, camera.fy]));

    projectionMatrix = getProjectionMatrix(camera.fx, camera.fy, innerWidth, innerHeight);

    gl.uniform2fv(u_viewport, new Float32Array([innerWidth, innerHeight]));

    gl.canvas.width = Math.round(innerWidth);
    gl.canvas.height = Math.round(innerHeight);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.uniformMatrix4fv(u_projection, false, projectionMatrix);
  };

  window.addEventListener("resize", resize);
  resize();

  toolWorker.onmessage = async (e) => {
    if (e.data.texdata) {
      const { texdata, texwidth, texheight } = e.data;
      // save the previous ply here
      plyTexData = texdata;
      setTexture(gl, gsTexture, texdata, texwidth, texheight, 0, '32rgbaui');
      await sleep(100);
    }
    else if (e.data.depthIndex) {
      const { depthIndex, viewProj } = e.data;
      gl.bindBuffer(gl.ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, depthIndex, gl.DYNAMIC_DRAW);
      vertexCount = e.data.vertexCount;
      isLoading = false;
    }
  };

  plyDownloader.onmessage = async (e) => {
    if (e.data.msg && e.data.msg == 'ready') {
      // do nothing
    } else if (e.data.err) {
      vertexCount = -1;
    } else if (e.data.type && e.data.type == FTYPES.ply) {
      const { data, type } = e.data;
      // process the ply
      toolWorker.postMessage({
        ply: data, tex: plyTexData
      }, [data.buffer, plyTexData.buffer]);
    }
  };

  toolWorker.onerror = (e) => {
    console.error(e.toString(), 'work error');
    throw new Error(e);
  }

  plyDownloader.onerror = (e) => {
    console.error(e.toString(), 'downloader error');
    throw new Error(e);
  }

  const showLoadingPrompt = async () => {
    document.getElementById("message").innerText = 'loading point cloud';
    while (true) {
      if (vertexCount < 0) {
        document.getElementById("message").innerText = 'ERROR! Please REFRESH!';
        isLoading = false;
        break;
      }
      if (!isLoading) {
        document.getElementById("message").innerText = '';
        break;
      }
      let msg = document.getElementById("message").innerText;
      document.getElementById("message").innerText = msg.length > 26 ? 'loading point cloud' : msg + '.';
      await sleep(300);
    }
  };

  const selectFile = (file) => {
    const fr = new FileReader();
    fr.onload = () => {
      const fileData = new Uint8Array(fr.result);
      console.log("Loaded", fileData.length);

      if (isPly(fileData)) {
        // process new ply
        isLoading = true;
        showLoadingPrompt();
        setTimeout(() => {
          toolWorker.postMessage({
            ply: fileData, tex: plyTexData
          }, [fileData.buffer, plyTexData.buffer]);
        }, 2000);
      } else {
        document.getElementById("message").innerText = 'Please drop a PLY file!';
        setTimeout(() => {
          document.getElementById("message").innerText = '';
        }, 3000);
      }
    };
    fr.readAsArrayBuffer(file);
  };

  let activeKeys = [];
  let currentCameraIndex = 0;

  window.addEventListener("keydown", (e) => {
    // if (document.activeElement != document.body) return;
    carousel = false;
    if (!activeKeys.includes(e.code)) activeKeys.push(e.code);
    if (/\d/.test(e.key)) {
      currentCameraIndex = parseInt(e.key);
      camera = cameras[currentCameraIndex];
      viewMatrix = getViewMatrix(camera);
    }
    if (["-", "_"].includes(e.key)) {
      currentCameraIndex = (currentCameraIndex + cameras.length - 1) % cameras.length;
      viewMatrix = getViewMatrix(cameras[currentCameraIndex]);
    }
    if (["+", "="].includes(e.key)) {
      currentCameraIndex = (currentCameraIndex + 1) % cameras.length;
      viewMatrix = getViewMatrix(cameras[currentCameraIndex]);
    }
    if (e.code == "KeyV") {
      location.hash = "#" + JSON.stringify(viewMatrix.map((k) => Math.round(k * 100) / 100));
    } else if (e.code === "KeyP") {
      carousel = true;
    }
  });

  window.addEventListener("keyup", (e) => {
    activeKeys = activeKeys.filter((k) => k !== e.code);
  });
  window.addEventListener("blur", () => {
    activeKeys = [];
  });

  window.addEventListener(
    "wheel",
    (e) => {
      carousel = false;
      e.preventDefault();
      const lineHeight = 10;
      const scale = e.deltaMode == 1 ? lineHeight : e.deltaMode == 2 ? innerHeight : 1;
      let inv = invert4(viewMatrix);
      if (e.shiftKey) {
        inv = translate4(inv, (e.deltaX * scale) / innerWidth, (e.deltaY * scale) / innerHeight, 0);
      } else if (e.ctrlKey || e.metaKey) {
        // inv = rotate4(inv,  (e.deltaX * scale) / innerWidth,  0, 0, 1);
        // inv = translate4(inv,  0, (e.deltaY * scale) / innerHeight, 0);
        // let preY = inv[13];
        inv = translate4(inv, 0, 0, (-10 * (e.deltaY * scale)) / innerHeight);
        // inv[13] = preY;
      } else {
        let d = 4;
        inv = translate4(inv, 0, 0, d);
        inv = rotate4(inv, -(e.deltaX * scale) / innerWidth, 0, 1, 0);
        inv = rotate4(inv, (e.deltaY * scale) / innerHeight, 1, 0, 0);
        inv = translate4(inv, 0, 0, -d);
      }

      viewMatrix = invert4(inv);
    },
    { passive: false }
  );

  let startX, startY, down;
  canvas.addEventListener("mousedown", (e) => {
    carousel = false;
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    down = e.ctrlKey || e.metaKey ? 2 : 1;
  });
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  canvas.addEventListener("mousemove", (e) => {
    e.preventDefault();
    if (down == 1) {
      let inv = invert4(viewMatrix);
      let dx = (5 * (e.clientX - startX)) / innerWidth;
      let dy = (5 * (e.clientY - startY)) / innerHeight;
      let d = 4;

      inv = translate4(inv, 0, 0, d);
      inv = rotate4(inv, dx, 0, 1, 0);
      inv = rotate4(inv, -dy, 1, 0, 0);
      inv = translate4(inv, 0, 0, -d);
      // let postAngle = Math.atan2(inv[0], inv[10])
      // inv = rotate4(inv, postAngle - preAngle, 0, 0, 1)
      // console.log(postAngle)
      viewMatrix = invert4(inv);

      startX = e.clientX;
      startY = e.clientY;
    } else if (down == 2) {
      let inv = invert4(viewMatrix);
      // inv = rotateY(inv, );
      // let preY = inv[13];
      inv = translate4(inv, (-10 * (e.clientX - startX)) / innerWidth, 0, (10 * (e.clientY - startY)) / innerHeight);
      // inv[13] = preY;
      viewMatrix = invert4(inv);

      startX = e.clientX;
      startY = e.clientY;
    }
  });
  canvas.addEventListener("mouseup", (e) => {
    e.preventDefault();
    down = false;
    startX = 0;
    startY = 0;
  });

  let altX = 0,
    altY = 0;
  canvas.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        carousel = false;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        down = 1;
      } else if (e.touches.length === 2) {
        // console.log('beep')
        carousel = false;
        startX = e.touches[0].clientX;
        altX = e.touches[1].clientX;
        startY = e.touches[0].clientY;
        altY = e.touches[1].clientY;
        down = 1;
      }
    },
    { passive: false }
  );
  canvas.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && down) {
        let inv = invert4(viewMatrix);
        let dx = (4 * (e.touches[0].clientX - startX)) / innerWidth;
        let dy = (4 * (e.touches[0].clientY - startY)) / innerHeight;

        let d = 4;
        inv = translate4(inv, 0, 0, d);
        // inv = translate4(inv,  -x, -y, -z);
        // inv = translate4(inv,  x, y, z);
        inv = rotate4(inv, dx, 0, 1, 0);
        inv = rotate4(inv, -dy, 1, 0, 0);
        inv = translate4(inv, 0, 0, -d);

        viewMatrix = invert4(inv);

        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        // alert('beep')
        const dtheta =
          Math.atan2(startY - altY, startX - altX) -
          Math.atan2(e.touches[0].clientY - e.touches[1].clientY, e.touches[0].clientX - e.touches[1].clientX);
        const dscale =
          Math.hypot(startX - altX, startY - altY) /
          Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const dx = (e.touches[0].clientX + e.touches[1].clientX - (startX + altX)) / 2;
        const dy = (e.touches[0].clientY + e.touches[1].clientY - (startY + altY)) / 2;
        let inv = invert4(viewMatrix);
        // inv = translate4(inv,  0, 0, d);
        inv = rotate4(inv, dtheta, 0, 0, 1);

        inv = translate4(inv, -dx / innerWidth, -dy / innerHeight, 0);

        // let preY = inv[13];
        inv = translate4(inv, 0, 0, 3 * (1 - dscale));
        // inv[13] = preY;

        viewMatrix = invert4(inv);

        startX = e.touches[0].clientX;
        altX = e.touches[1].clientX;
        startY = e.touches[0].clientY;
        altY = e.touches[1].clientY;
      }
    },
    { passive: false }
  );
  canvas.addEventListener(
    "touchend",
    (e) => {
      e.preventDefault();
      down = false;
      startX = 0;
      startY = 0;
    },
    { passive: false }
  );

  // ** animation loop ** //
  let jumpDelta = 0;
  let vertexCount = 0;

  // time for last frame to control fps
  // to measure rendering fps
  let lastFpsTime = 0;
  let avgFps = 0;
  let start = 0;

  const frame = (now) => {
    let inv = invert4(viewMatrix);
    let shiftKey = activeKeys.includes("Shift") || activeKeys.includes("ShiftLeft") || activeKeys.includes("ShiftRight");

    if (activeKeys.includes("ArrowUp")) {
      if (shiftKey) {
        inv = translate4(inv, 0, -0.03, 0);
      } else {
        inv = translate4(inv, 0, 0, 0.1);
      }
    }
    if (activeKeys.includes("ArrowDown")) {
      if (shiftKey) {
        inv = translate4(inv, 0, 0.03, 0);
      } else {
        inv = translate4(inv, 0, 0, -0.1);
      }
    }
    if (activeKeys.includes("ArrowLeft")) inv = translate4(inv, -0.03, 0, 0);
    //
    if (activeKeys.includes("ArrowRight")) inv = translate4(inv, 0.03, 0, 0);
    // inv = rotate4(inv, 0.01, 0, 1, 0);
    if (activeKeys.includes("KeyA")) inv = rotate4(inv, -0.005, 0, 1, 0);
    if (activeKeys.includes("KeyD")) inv = rotate4(inv, 0.005, 0, 1, 0);
    if (activeKeys.includes("KeyQ")) inv = rotate4(inv, 0.01, 0, 0, 1);
    if (activeKeys.includes("KeyE")) inv = rotate4(inv, -0.01, 0, 0, 1);
    if (activeKeys.includes("KeyW")) inv = rotate4(inv, 0.005, 1, 0, 0);
    if (activeKeys.includes("KeyS")) inv = rotate4(inv, -0.005, 1, 0, 0);
    if (activeKeys.includes("BracketLeft")) {
      camera.fx /= 1.01;
      camera.fy /= 1.01;
      inv = translate4(inv, 0, 0, 0.1);
      resize();
    }
    if (activeKeys.includes("BracketRight")) {
      camera.fx *= 1.01;
      camera.fy *= 1.01;
      inv = translate4(inv, 0, 0, -0.1);
      resize();
    }

    if (["KeyJ", "KeyK", "KeyL", "KeyI"].some((k) => activeKeys.includes(k))) {
      let d = 4;
      inv = translate4(inv, 0, 0, d);
      inv = rotate4(inv, activeKeys.includes("KeyJ") ? -0.05 : activeKeys.includes("KeyL") ? 0.05 : 0, 0, 1, 0);
      inv = rotate4(inv, activeKeys.includes("KeyI") ? 0.05 : activeKeys.includes("KeyK") ? -0.05 : 0, 1, 0, 0);
      inv = translate4(inv, 0, 0, -d);
    }

    viewMatrix = invert4(inv);

    if (carousel) {
      let inv = invert4(defaultViewMatrix);

      const t = Math.sin((Date.now() - start) / 5000);
      inv = translate4(inv, 2.5 * t, 0, 6 * (1 - Math.cos(t)));
      inv = rotate4(inv, -0.6 * t, 0, 1, 0);

      viewMatrix = invert4(inv);
    }

    if (activeKeys.includes("Space")) {
      jumpDelta = Math.min(1, jumpDelta + 0.05);
    } else {
      jumpDelta = Math.max(0, jumpDelta - 0.05);
    }

    let inv2 = invert4(viewMatrix);
    inv2 = translate4(inv2, 0, -jumpDelta, 0);
    inv2 = rotate4(inv2, -0.1 * jumpDelta, 1, 0, 0);
    let actualViewMatrix = invert4(inv2);
    // gl.uniform3fv(u_cameraCenter, new Float32Array([inv2[12], inv2[13], inv2[14]]));

    const viewProj = multiply4(projectionMatrix, actualViewMatrix);
    toolWorker.postMessage({ view: viewProj });

    // update fps hint
    const currentFps = 1000 / (now - lastFpsTime) || 0;
    avgFps = (isFinite(avgFps) && avgFps) * 0.9 + currentFps * 0.1;

    if (vertexCount > 0) {
      // update the frame
      gl.uniformMatrix4fv(u_view, false, actualViewMatrix);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 4, vertexCount);
    } else {
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    fps.innerText = Math.round(avgFps) + " fps";
    lastFpsTime = now;
    requestAnimationFrame(frame);
  };

  frame();
  // ** animation loop ** //

  window.addEventListener("hashchange", (e) => {
    try {
      viewMatrix = JSON.parse(decodeURIComponent(location.hash.slice(1)));
      carousel = false;
    } catch (err) { }
  });


  document.addEventListener("dragenter", preventDefault);
  document.addEventListener("dragover", preventDefault);
  document.addEventListener("dragleave", preventDefault);
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    selectFile(e.dataTransfer.files[0]);
  });


  // main work here
  const baseUrl = params.get('url') ? params.get('url') : 'https://raw.githubusercontent.com/zpqqq10/web-gs-static/refs/heads/main/data/';

  document.getElementById("message").innerText = 'requesting metadata...';

  try {
    const cameraReq = await fetch(new URL('cameras.json', baseUrl));
    if (cameraReq.status != 200) throw new Error(cameraReq.status + " Unable to load " + cameraReq.url);
    const cameraData = await cameraReq.json()
    cameras = cameraData;
    camera = cameraData[0];
    // update viewMatrix
    viewMatrix = getViewMatrix(camera);
  } catch (err) {
    console.info('no camera info loaded')
  }


  // cbdownloader.postMessage({ baseUrl: baseUrl, keyframe: -1 });
  plyDownloader.postMessage({ baseUrl: baseUrl, loadPly: true });
  showLoadingPrompt();

}

main().catch((err) => {
  document.getElementById("message").innerText = err.toString() + '\nPlease check your network or REFRESH';
});

