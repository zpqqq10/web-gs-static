import { FTYPES } from "../utils/utils.js";
import { drc2plyModule } from "../wasm/drc2ply.js";
// adjust path in drc2ply.js:findWasmBinary()

let plyDownloader = null;

class PlyDownloader {
    constructor() {
        this.initialized = false;
        this.drcDecoder = undefined;
        this.drc2plyFc = undefined;
        // not waiting here
        this.init();
    }

    async init() {
        this.initialized = true;
        this.drcDecoder = await new drc2plyModule();
        this.drc2plyFc = this.drcDecoder.cwrap('drc2ply', 'number', ['number', 'number', 'number']);
        this.inputPtr = this.drcDecoder._malloc(4)
        this.outputPtr = this.drcDecoder._malloc(3 * 1024 * 1024);
        postMessage({ msg: 'ready' });
    }

    async load(baseUrl, loadPly) {
        let cnt = 0;
        while (!this.initialized) {
            await sleep(300);
            cnt++;
            if (cnt > 100) {
                throw new Error('ply workder not initialized');
            }
        }
        // let startTime, endTime;
        // startTime = performance.now();

        // continue downloading
        const drcReq = await fetch(baseUrl.endsWith(".ply") || baseUrl.endsWith(".drc") ? new URL(baseUrl) : new URL(loadPly ? 'pc.ply' : 'pc.drc', baseUrl))

        if (drcReq.status != 200) {
            postMessage({ err: drcReq.status + " Unable to load " + drcReq.url });
            return;
        }
        let drc = await drcReq.arrayBuffer();
        drc = new Uint8Array(drc);
        if (baseUrl.endsWith(".ply") || loadPly) {
            postMessage({ data: drc, type: FTYPES.ply }, [drc.buffer]);
        } else {
            this.drcDecoder.HEAPU8.set(drc, this.inputPtr);
            // size of the resulting ply
            const plySize = this.drc2plyFc(this.inputPtr, drc.length, this.outputPtr);
            const outputArrayBuffer = this.drcDecoder.HEAPU8.slice(this.outputPtr, this.outputPtr + plySize);
            postMessage({ data: outputArrayBuffer, keyframe: keyframe, type: FTYPES.ply }, [outputArrayBuffer.buffer]);
        }

        // endTime = performance.now();

    }

    // called after all tasks are done
    finish() {
        console.log('ply current time', new Date().toLocaleTimeString());
        // console error here, no idea why
        // this.drcDecoder._free(this.inputPtr);
        // this.drcDecoder._free(this.outputPtr);

    }
}

onmessage = (e) => {
    if (e.data.baseUrl) {
        plyDownloader.load(e.data.baseUrl, e.data.loadPly);
    } else if (e.data.msg && e.data.msg === 'init') {
        plyDownloader = new PlyDownloader();
    } else if (e.data.msg && e.data.msg === 'finish') {
        plyDownloader.finish();
    }
};