
// In a dedicated worker file, e.g., src/workers/depth-worker.ts
import { pipeline, env } from '@huggingface/transformers';
import type { Pipeline } from '@huggingface/transformers';

// Configure the environment
env.allowRemoteModels = true;
env.useFS = false; 
env.useCache = true;

class DepthEstimationPipeline {
    static task = 'depth-estimation';
    static instance: Pipeline | null = null;
    static model: string | null = null;
    static device: string | null = null;
    static initialized = false;
    static device_checked = false;

    static async getInstance(model: string, useMirror: boolean, progress_callback?: Function) {
        
        env.remoteHost = useMirror ? "https://www.modelscope.cn/models" : "https://huggingface.co";

        if (!this.device_checked) {
             let device: 'wasm' | 'webgpu' = 'wasm';
            // @ts-ignore
            if (typeof self.navigator !== 'undefined' && self.navigator.gpu) {
                try {
                    const adapter = await self.navigator.gpu.requestAdapter();
                    if (adapter) {
                       device = 'webgpu';
                    }
                } catch (e) {
                    console.warn('WebGPU is not available, falling back to WASM.', e);
                }
            }
            this.device = device;
            self.postMessage({ type: 'device-info', payload: this.device });
            this.device_checked = true;
        }


        if (model === 'pre-check') {
            return null;
        }

        if (this.instance === null || this.model !== model) {
            this.model = model;
            this.initialized = false;
            try {
                this.instance = await pipeline(this.task, model, { progress_callback, device: this.device || 'wasm' });
                this.initialized = true;
            } catch(e) {
                this.instance = null;
                this.initialized = false;
                throw e;
            }
        }
        
        return this.instance;
    }
}


self.onmessage = async (event: MessageEvent) => {
    const { type, payload } = event.data;

    try {
        if (type === 'init') {
            await DepthEstimationPipeline.getInstance(payload.model, payload.useMirror, (progress: any) => {
                if (progress.status === 'progress') {
                    const percentage = (progress.progress).toFixed(2);
                    self.postMessage({ type: 'status', payload: `下载中... ${percentage}% (${(progress.loaded / 1024 / 1024).toFixed(2)}MB / ${(progress.total / 1024 / 1024).toFixed(2)}MB)` });
                } else if (progress.status === 'ready') {
                    self.postMessage({ type: 'status', payload: '模型准备就绪' });
                } else {
                    self.postMessage({ type: 'status', payload: progress.status });
                }
            });
            if (payload.model !== 'pre-check') {
                 self.postMessage({ type: 'status', payload: '就绪' });
            }

        } else if (type === 'generate') {
            self.postMessage({ type: 'status', payload: '正在生成深度图...' });

            const detector = await DepthEstimationPipeline.getInstance(DepthEstimationPipeline.model!, false, (p: any) => console.log(p));
            if (!detector || !DepthEstimationPipeline.initialized) throw new Error("Detector not initialized or initialization failed.");

            const { depth } = await detector(payload.imageUrl) as any;
            
            // Convert single-channel grayscale to RGBA
            const rgbaData = new Uint8ClampedArray(depth.width * depth.height * 4);
            for (let i = 0; i < depth.data.length; ++i) {
                const depthValue = depth.data[i];
                rgbaData[i * 4] = depthValue;       // R
                rgbaData[i * 4 + 1] = depthValue;   // G
                rgbaData[i * 4 + 2] = depthValue;   // B
                rgbaData[i * 4 + 3] = 255;          // A
            }

            self.postMessage({ type: 'result', payload: { depth: { data: rgbaData, width: depth.width, height: depth.height } } });
        }
    } catch (e: any) {
        self.postMessage({ type: 'error', payload: e.message });
    }
};
