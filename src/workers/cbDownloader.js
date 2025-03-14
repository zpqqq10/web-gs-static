import { FTYPES } from "../utils/utils.js";
let cbDownloader = null;

// download codebooks
class CBDownloader {
    constructor() {
        this.initialized = true;
        // postMessage({ msg: 'ready' });
    }

    async download(baseUrl, keyframe) {
        if (!this.initialized) {
            throw new Error('video downloader not initialized');
        }
        if (keyframe == -1){
            // process the init codebook
            const jsonPromise = fetch(new URL('init_codebooks.json', baseUrl));
            const cbPromise = fetch(new URL('init_codebooks.bin', baseUrl));
            const [jsonReq, cbReq] = await Promise.all([jsonPromise, cbPromise]);
            if (jsonReq.status != 200) throw new Error(jsonReq.status + " Unable to load " + jsonReq.url);
            if (cbReq.status != 200) throw new Error(jsonReq.status + " Unable to load " + jsonReq.url);
            // pass arraybuffer rather than json, to avoid copying                                                      
            const cbJson = await jsonReq.arrayBuffer();
            const cbData = await cbReq.arrayBuffer();
            postMessage({ cbjson: cbJson, data: cbData, keyframe: keyframe, type: FTYPES.cb }, [cbJson, cbData]);
        } else {
            const jsonPromise = fetch(new URL(keyframe + '/codebooks.json', baseUrl));
            const cbPromise = fetch(new URL(keyframe + '/codebooks.bin', baseUrl));
            const [jsonReq, cbReq] = await Promise.all([jsonPromise, cbPromise]);
            if (jsonReq.status != 200) throw new Error(jsonReq.status + " Unable to load " + jsonReq.url);
            if (cbReq.status != 200) throw new Error(jsonReq.status + " Unable to load " + jsonReq.url);
            // pass arraybuffer rather than json, to avoid copying                                                      
            const cbJson = await jsonReq.arrayBuffer();
            const cbData = await cbReq.arrayBuffer();
            postMessage({ cbjson: cbJson, data: cbData, keyframe: keyframe, type: FTYPES.cb }, [cbJson, cbData]);
        }
    }

    finish() {
        // do nothing
    }
}

onmessage = (e) => {
    if (e.data.baseUrl) {
        cbDownloader.download(e.data.baseUrl, e.data.keyframe);
    } else if (e.data.msg && e.data.msg === 'init') {
        cbDownloader = new CBDownloader();
    } else if (e.data.msg && e.data.msg === 'finish') {
        cbDownloader.finish();
    }
};